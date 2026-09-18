import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, LockKeyhole, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { PeopleAvatars } from "@/components/person-avatar";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { findPackage, findParticipant, orderBalance, useOps, useSession } from "@/lib/data";
import { formatDateTime, paymentTone, peso, productionTone } from "@/lib/domain";

export const Route = createFileRoute("/release")({ component: ReleasePage });

function ReleasePage() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [openOrder, setOpenOrder] = useState<string | null>(null);
  const [receiver, setReceiver] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const visibleOrders = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.orders
      .filter((order) => order.status !== "cancelled" && ["ready", "delivered"].includes(order.production_status))
      .filter((order) => {
        if (!needle) return true;
        const participant = findParticipant(data, order.participant_id);
        const members = data.orderMembers
          .filter((member) => member.order_id === order.id)
          .map((member) => findParticipant(data, member.participant_id))
          .filter(Boolean);
        const memberText = members
          .map((member) => `${member!.full_name} ${member!.organization ?? ""} ${member!.contact_number ?? ""}`)
          .join(" ");
        return `${order.order_number} ${participant?.full_name ?? ""} ${participant?.organization ?? ""} ${participant?.contact_number ?? ""} ${memberText}`
          .toLowerCase()
          .includes(needle);
      });
  }, [data, query]);

  if (isLoading || !data) {
    return <AppShell><PageHeader eyebrow="Release desk" title="Release" /><LoadingGrid rows={5} /></AppShell>;
  }

  function requireStaff() {
    if (email) return true;
    void navigate({ to: "/auth" });
    return false;
  }

  function beginRelease(orderId: string, participantName: string) {
    if (!requireStaff()) return;
    setOpenOrder(orderId);
    setReceiver(participantName);
    setNotes("");
  }

  async function release(orderId: string) {
    if (!requireStaff()) return;
    const order = data.orders.find((item) => item.id === orderId);
    if (!order) return;
    if (order.production_status !== "ready") return toast.error("This order is not marked Ready yet.");
    if (orderBalance(order) > 0) return toast.error("There is still a balance to settle before release.");
    if (!receiver.trim()) return toast.error("Please enter the receiver name.");

    setBusy(orderId);
    try {
      const now = new Date().toISOString();
      const orderResult = await withTimeout(
        supabase
          .from("orders")
          .update({ production_status: "delivered", status: "delivered", delivered_at: now })
          .eq("id", orderId),
        12_000,
        "Release update timed out. Please try again.",
      );
      if (orderResult.error) throw orderResult.error;

      const deliveryResult = await withTimeout(supabase.from("deliveries").upsert(
        {
          order_id: orderId,
          status: "delivered",
          delivered_by: email,
          receiver_name: receiver.trim(),
          notes: notes.trim() || null,
          delivered_at: now,
        },
        { onConflict: "order_id" },
      ), 12_000, "Delivery record save timed out.");
      if (deliveryResult.error) throw deliveryResult.error;

      await withTimeout(supabase.from("audit_logs").insert({
        entity_type: "order",
        entity_id: orderId,
        action: "delivered",
        actor: email,
        notes: `Released to ${receiver.trim()}${notes.trim() ? ` · ${notes.trim()}` : ""}`,
      }), 12_000, "Release audit save timed out.");

      toast.success("Thank you. The order has been marked as received.");
      setOpenOrder(null);
      setReceiver("");
      setNotes("");
      await withTimeout(refetch(), 12_000, "Order released, but the Release desk refresh took too long.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The release could not be completed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={data.event?.name ?? "Release desk"}
        title="Release"
        description="Search by name, congregation, contact number or order number. QR scanning can be added to this same desk without creating another module."
      />

      {!data.event ? (
        <EmptyState title="No event selected" description="Select an event before using the release desk." action={<Button asChild><Link to="/events">Open Events</Link></Button>} />
      ) : (
        <>
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-card p-2">
            <Search className="ml-2 size-4 text-muted-foreground" />
            <Input
              className="border-0 bg-transparent shadow-none"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, congregation, contact or order number…"
            />
          </div>

          {visibleOrders.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {visibleOrders.map((order) => {
                const participant = findParticipant(data, order.participant_id);
                const members = data.orderMembers
                  .filter((member) => member.order_id === order.id)
                  .map((member) => findParticipant(data, member.participant_id))
                  .filter(Boolean);
                const displayPeople = members.length ? members : [participant];
                const memberNames = members.map((member) => member!.full_name);
                const pkg = findPackage(data, order.package_id);
                const items = data.orderItems.filter((item) => item.order_id === order.id);
                const framedItems = items.filter((item) => item.framed);
                const balance = orderBalance(order);
                const blocked = order.production_status !== "delivered" && (balance > 0 || order.production_status !== "ready");
                const isOpen = openOrder === order.id;

                return (
                  <Panel
                    key={order.id}
                    title={participant?.full_name ?? order.order_number}
                    description={`${memberNames.length > 1 ? `${memberNames.length} people · ${memberNames.join(", ")}` : participant?.organization ?? "No congregation"} · ${order.order_number}`}
                    actions={<div className="flex gap-2"><StatusPill label={order.payment_status} tone={paymentTone(order.payment_status)} /><StatusPill label={order.production_status} tone={productionTone(order.production_status)} /></div>}
                  >
                    <div className="grid gap-4 text-sm">
                      <div className="grid gap-4 rounded-xl border border-primary/20 bg-primary/[.025] p-4 sm:grid-cols-[120px_1fr] sm:items-center">
                        <div className="flex justify-center sm:justify-start">
                          <PeopleAvatars people={displayPeople} size="xl" max={3} />
                        </div>
                        <div className="min-w-0 text-center sm:text-left">
                          <p className="eyebrow">Pickup identity</p>
                          <p className="mt-1 truncate font-display text-xl font-extrabold">
                            {memberNames.length > 1 ? memberNames.join(" · ") : participant?.full_name ?? "Participant"}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{participant?.organization ?? "No congregation"}</p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">{participant?.contact_number ?? "No contact number"}</p>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/15 p-3">
                        <div><p className="text-xs text-muted-foreground">Package</p><p className="mt-1 font-semibold">{pkg?.name ?? "—"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Balance</p><p className="mt-1 font-semibold">{peso(balance)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Production</p><p className="mt-1 font-semibold">{order.production_status === "ready" ? "Ready" : order.production_status === "delivered" ? "Released" : "In progress"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Received</p><p className="mt-1 font-semibold">{order.delivered_at ? formatDateTime(order.delivered_at) : "—"}</p></div>
                      </div>

                      {framedItems.length ? (
                        <div className="rounded-lg border border-border bg-muted/10 p-3">
                          <p className="text-xs font-semibold text-muted-foreground">Frame details</p>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {framedItems.map((item) => {
                              const color = item.frame_color ?? "black";
                              const label = color[0].toUpperCase() + color.slice(1);
                              return <span key={item.id} className="rounded-md border border-border bg-background px-2.5 py-1.5 text-xs"><strong>{item.kind === "group_package" ? "Class" : "Solo"}</strong> · {label} frame · White mat</span>;
                            })}
                          </div>
                        </div>
                      ) : null}

                      {order.production_status === "delivered" ? (
                        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 p-3 text-success"><CheckCircle2 className="size-4" /> Order already received</div>
                      ) : blocked ? (
                        <div className="rounded-lg border border-warning/25 bg-warning/10 p-3">
                          <div className="flex items-center gap-2 font-semibold text-warning"><LockKeyhole className="size-4" /> Not ready to release yet</div>
                          <p className="mt-1 text-xs text-muted-foreground">{balance > 0 ? `There is a remaining balance of ${peso(balance)}.` : "This order has not been marked Ready in Production yet."}</p>
                          <div className="mt-3 flex gap-2">{balance > 0 ? <Button size="sm" asChild><Link to="/orders">Open Orders</Link></Button> : <Button size="sm" asChild><Link to="/production">Open Production</Link></Button>}</div>
                        </div>
                      ) : isOpen ? (
                        <div className="grid gap-3 rounded-lg border border-primary/20 bg-primary/[.035] p-4">
                          <label className="grid gap-1.5"><Label>Received by</Label><Input value={receiver} onChange={(event) => setReceiver(event.target.value)} /></label>
                          <label className="grid gap-1.5"><Label>Optional note</Label><Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Representative, remarks, or other helpful details" /></label>
                          <div className="flex gap-2"><Button disabled={busy === order.id} onClick={() => void release(order.id)}><Truck className="size-4" /> {busy === order.id ? "Saving…" : "Confirm received"}</Button><Button variant="ghost" onClick={() => setOpenOrder(null)}>Cancel</Button></div>
                        </div>
                      ) : (
                        <Button size="lg" onClick={() => beginRelease(order.id, participant?.full_name ?? "")}><Truck className="size-5" /> Confirm handover</Button>
                      )}
                    </div>
                  </Panel>
                );
              })}
            </div>
          ) : <EmptyState title="Nothing ready for release" description="Orders will appear here when Production marks them Ready." />}
        </>
      )}
    </AppShell>
  );
}