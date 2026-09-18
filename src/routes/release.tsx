import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, LockKeyhole, Search, Truck } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
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
        return `${order.order_number} ${participant?.full_name ?? ""} ${participant?.organization ?? ""} ${participant?.contact_number ?? ""}`
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
    const finalCheck = data.checks.find((check) => check.order_id === orderId && check.stage === "final_check");
    if (!finalCheck?.completed) return toast.error("Final quality check must be completed before release.");
    if (!receiver.trim()) return toast.error("Please enter the receiver name.");

    setBusy(orderId);
    try {
      const db = supabase as any;
      const result = await withTimeout(db.rpc("release_order_v1", {
        _order_id: orderId,
        _receiver_name: receiver.trim(),
        _notes: notes.trim() || null,
        _actor: email,
      }), 12_000, "Release update timed out. Please try again.");
      if (result.error) throw result.error;

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
                const pkg = findPackage(data, order.package_id);
                const balance = orderBalance(order);
                const finalCheck = data.checks.find((check) => check.order_id === order.id && check.stage === "final_check");
                const blocked = order.production_status !== "delivered" && (balance > 0 || !finalCheck?.completed);
                const isOpen = openOrder === order.id;

                return (
                  <Panel
                    key={order.id}
                    title={participant?.full_name ?? order.order_number}
                    description={`${participant?.organization ?? "No congregation"} · ${order.order_number}`}
                    actions={<div className="flex gap-2"><StatusPill label={order.payment_status} tone={paymentTone(order.payment_status)} /><StatusPill label={order.production_status} tone={productionTone(order.production_status)} /></div>}
                  >
                    <div className="grid gap-3 text-sm">
                      <div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/15 p-3">
                        <div><p className="text-xs text-muted-foreground">Package</p><p className="mt-1 font-semibold">{pkg?.name ?? "—"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Balance</p><p className="mt-1 font-semibold">{peso(balance)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Final QC</p><p className="mt-1 font-semibold">{finalCheck?.completed ? "Completed" : "Required"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Received</p><p className="mt-1 font-semibold">{order.delivered_at ? formatDateTime(order.delivered_at) : "—"}</p></div>
                      </div>

                      {order.production_status === "delivered" ? (
                        <div className="flex items-center gap-2 rounded-lg border border-success/20 bg-success/10 p-3 text-success"><CheckCircle2 className="size-4" /> Order already received</div>
                      ) : blocked ? (
                        <div className="rounded-lg border border-warning/25 bg-warning/10 p-3">
                          <div className="flex items-center gap-2 font-semibold text-warning"><LockKeyhole className="size-4" /> Not ready to release yet</div>
                          <p className="mt-1 text-xs text-muted-foreground">{balance > 0 ? `There is a remaining balance of ${peso(balance)}.` : "Final quality check is still pending."}</p>
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
          ) : <EmptyState title="Nothing ready for release" description="Orders will appear here after payment and Final QC are complete." />}
        </>
      )}
    </AppShell>
  );
}
