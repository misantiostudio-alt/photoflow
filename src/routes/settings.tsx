import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Fingerprint, KeyRound, LockKeyhole, LogOut, Save, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { useOps, useSession } from "@/lib/data";

export const Route = createFileRoute("/settings")({ component: SettingsPage });

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><Label>{label}</Label>{children}</label>;
}

function SettingsPage() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();
  const navigate = useNavigate();
  const [venue, setVenue] = useState("");
  const [orderingDeadline, setOrderingDeadline] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const [roles, setRoles] = useState<string[]>([]);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);

  useEffect(() => {
    setVenue(data?.event?.venue ?? "");
    setOrderingDeadline(data?.event?.ordering_deadline ?? "");
    setDeliveryDate(data?.event?.delivery_date ?? "");
    setPaymentInstructions(data?.event?.payment_instructions ?? "");
    setDescription(data?.event?.description ?? "");
  }, [data?.event?.id, data?.event?.venue, data?.event?.ordering_deadline, data?.event?.delivery_date, data?.event?.payment_instructions, data?.event?.description]);

  useEffect(() => {
    if (!email) {
      setRoles([]);
      setPinEnabled(false);
      return;
    }

    const loadSecurity = async () => {
      const db = supabase as any;
      const [roleResult, securityResult] = await Promise.all([
        db.rpc("get_my_staff_roles"),
        db.rpc("get_my_security_settings"),
      ]);
      if (!roleResult.error) setRoles((roleResult.data ?? []) as string[]);
      const row = securityResult.data?.[0];
      if (!securityResult.error) setPinEnabled(Boolean(row?.pin_enabled));
    };
    void loadSecurity();
  }, [email]);

  if (isLoading || !data) {
    return <AppShell><PageHeader eyebrow="Configuration" title="Settings" /><LoadingGrid rows={4} /></AppShell>;
  }

  async function saveEventSettings() {
    if (!email) return void navigate({ to: "/auth" });
    if (!data.event) return;
    setSaving(true);
    try {
      const { error } = await withTimeout(
        supabase
          .from("events")
          .update({
          venue: venue.trim() || null,
          ordering_deadline: orderingDeadline || null,
          delivery_date: deliveryDate || null,
          payment_instructions: paymentInstructions.trim() || null,
          description: description.trim() || null,
          })
          .eq("id", data.event.id),
        12_000,
        "Saving event settings took too long.",
      );
      if (error) throw error;
      await withTimeout(refetch(), 12_000, "Settings saved, but the workspace refresh took too long.");
      toast.success("Event settings saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function signOut() {
    await withTimeout(supabase.auth.signOut(), 10_000, "Sign out took too long.");
    toast.success("Signed out");
    location.href = "/";
  }

  async function savePin() {
    if (!/^\d{6}$/.test(pin)) return toast.error("Use exactly 6 digits for the PIN.");
    if (pin !== pinConfirm) return toast.error("PIN confirmation does not match.");
    setSecurityBusy(true);
    try {
      const db = supabase as any;
      const result = await withTimeout(db.rpc("set_my_pin", { _pin: pin }), 10_000, "PIN setup timed out.");
      if (result.error) throw result.error;
      const { data: authData } = await withTimeout(supabase.auth.getUser(), 10_000, "Account check timed out.");
      if (authData.user) sessionStorage.setItem(`photoflow.pin-unlocked:${authData.user.id}`, "1");
      setPinEnabled(true);
      setPin("");
      setPinConfirm("");
      toast.success("Quick PIN enabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save PIN.");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function clearPin() {
    setSecurityBusy(true);
    try {
      const db = supabase as any;
      const result = await withTimeout(db.rpc("clear_my_pin"), 10_000, "Removing PIN timed out.");
      if (result.error) throw result.error;
      const { data: authData } = await supabase.auth.getUser();
      if (authData.user) sessionStorage.removeItem(`photoflow.pin-unlocked:${authData.user.id}`);
      setPinEnabled(false);
      toast.success("Quick PIN removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove PIN.");
    } finally {
      setSecurityBusy(false);
    }
  }

  async function registerPasskey() {
    setSecurityBusy(true);
    try {
      const auth = supabase.auth as any;
      if (typeof auth.registerPasskey !== "function") {
        throw new Error("Passkeys are not available in this browser/app build.");
      }
      const result = await auth.registerPasskey();
      if (result.error) throw result.error;
      toast.success("Biometric/passkey registered on this account");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not register passkey.";
      toast.error(message.includes("passkey_disabled") ? "Passkeys still need to be enabled in the Supabase Auth backend." : message);
    } finally {
      setSecurityBusy(false);
    }
  }

  function lockNow() {
    window.dispatchEvent(new CustomEvent("photoflow:lock-now"));
  }

  const roleLabel = roles.includes("super_admin")
    ? "Super Admin"
    : roles.includes("owner")
      ? "Owner"
      : roles.length
        ? roles.map((role) => role.replaceAll("_", " ")).join(", ")
        : "Staff";

  return (
    <AppShell>
      <PageHeader eyebrow="Configuration" title="Settings" description="Event configuration, account security and staff access." />

      {!data.event ? (
        <EmptyState title="No event selected" description="Create or select an event before configuring payments and delivery." action={<Button asChild><Link to="/events">Open Events</Link></Button>} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title="Current event" description={data.event.name}>
            <div className="grid gap-4">
              <Field label="Venue"><Input value={venue} onChange={(event) => setVenue(event.target.value)} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Ordering deadline"><Input type="date" value={orderingDeadline} onChange={(event) => setOrderingDeadline(event.target.value)} /></Field>
                <Field label="Delivery date"><Input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></Field>
              </div>
              <Field label="Event description"><Textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} /></Field>
            </div>
          </Panel>

          <Panel title="Client payment instructions" description="Shown to clients after they submit an order.">
            <Textarea rows={8} value={paymentInstructions} onChange={(event) => setPaymentInstructions(event.target.value)} placeholder="GCash/Maya details, cash payment desk, payment reference instructions…" />
          </Panel>

          <Panel title="Staff account" description="Your current PhotoFlow authorization.">
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-4">
              <span className="grid size-10 place-items-center rounded-md bg-primary/10 text-primary"><ShieldCheck className="size-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{email ?? "Guest / read only"}</p>
                <p className="text-xs font-medium text-primary">{email ? roleLabel : "No write access"}</p>
              </div>
              {email ? <Button size="sm" variant="outline" onClick={() => void signOut()}><LogOut className="size-4" /> Sign out</Button> : <Button size="sm" asChild><Link to="/auth">Sign in</Link></Button>}
            </div>
          </Panel>

          <Panel title="Quick PIN" description="Optional 6-digit lock for this trusted browser session. It does not replace your main login.">
            {!email ? (
              <p className="text-sm text-muted-foreground">Sign in first to configure a PIN.</p>
            ) : (
              <div className="grid gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <LockKeyhole className="size-4 text-primary" />
                  <span>{pinEnabled ? "PIN is enabled" : "PIN is not enabled"}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="New 6-digit PIN"><Input inputMode="numeric" maxLength={6} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} type="password" /></Field>
                  <Field label="Confirm PIN"><Input inputMode="numeric" maxLength={6} value={pinConfirm} onChange={(event) => setPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 6))} type="password" /></Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => void savePin()} disabled={securityBusy}><KeyRound className="size-4" /> {pinEnabled ? "Change PIN" : "Enable PIN"}</Button>
                  {pinEnabled ? <Button variant="outline" onClick={lockNow}><LockKeyhole className="size-4" /> Lock now</Button> : null}
                  {pinEnabled ? <Button variant="ghost" onClick={() => void clearPin()} disabled={securityBusy}><Trash2 className="size-4" /> Remove PIN</Button> : null}
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Biometric / Passkey" description="Use Face ID, Touch ID, Windows Hello or your device security key.">
            <div className="grid gap-3">
              <p className="text-sm leading-6 text-muted-foreground">Passkeys are phishing-resistant. Your fingerprint or face never goes to PhotoFlow; your device verifies you locally.</p>
              <Button variant="outline" onClick={() => void registerPasskey()} disabled={!email || securityBusy}>
                <Fingerprint className="size-4" /> Register biometric / passkey
              </Button>
              <p className="text-xs text-muted-foreground">Availability depends on browser/device support and the Supabase Auth passkey setting.</p>
            </div>
          </Panel>

          <Panel title="Save configuration" description="Updates are stored in Supabase and immediately used by this event.">
            <Button size="lg" onClick={() => void saveEventSettings()} disabled={saving || !email}>
              <Save className="size-4" /> {saving ? "Saving…" : "Save event settings"}
            </Button>
          </Panel>
        </div>
      )}
    </AppShell>
  );
}
