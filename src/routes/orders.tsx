import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Banknote, CheckCircle2, ExternalLink, Search, Trash2, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { findParticipant, orderBalance, useOps, useSession } from "@/lib/data";
import { paymentTone, peso, productionTone, titleize } from "@/lib/domain";

export const Route = createFileRoute("/orders")({ component: OrdersPage });

type View = "orders" | "payments";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><Label>{label}</Label>{children}</label>;
}

function OrdersPage() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("orders");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "unpaid" | "partial" | "paid" | "cancelled">("all");
  const [paymentFormOpen, setPaymentFormOpen] = useState(false);
  const [paymentOrderId, setPaymentOrderId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [reference, setReference] = useState("");
  const [verified, setVerified] = useState(true);
  const [saving, setSaving] = useState(false);

  const activeOrders = useMemo(() => data?.orders.filter((order) => order.status !== "cancelled") ?? [], [data?.orders]);
  const selectedPaymentOrder = data?.orders.find((order) => order.id === paymentOrderId) ?? null;

  const visibleOrders = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.orders.filter((order) => {
      const person = findParticipant(data, order.participant_id);
      const matches = !needle || `${order.order_number} ${person?.full_name ?? ""} ${person?.organization ?? ""} ${person?.batch ?? ""} ${person?.contact_number ?? ""}`.toLowerCase().includes(needle);
      const state = filter === "all" || (filter === "cancelled" ? order.status === "cancelled" : order.payment_status === filter && order.status !== "cancelled");
      return matches && state;
    });
  }, [data, filter, query]);

  const visiblePayments = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    return data.payments.filter((payment) => {
      const order = data.orders.find((item) => item.id === payment.order_id);
      const person = order && findParticipant(data, order.participant_id);
      return !needle || `${order?.order_number ?? ""} ${person?.full_name ?? ""} ${person?.organization ?? ""} ${payment.reference ?? ""} ${payment.method}`.toLowerCase().includes(needle);
    });
  }, [data, query]);

  if (isLoading || !data) return <AppShell><PageHeader eyebrow="Client orders" title="Orders" /><LoadingGrid rows={7} /></AppShell>;

  function requireStaff() {
    if (email) return true;
    void navigate({ to: "/auth" });
    return false;
  }

  function startPayment() {
    if (!requireStaff()) return;
    const order = activeOrders.find((item) => orderBalance(item) > 0) ?? activeOrders[0];
    setPaymentOrderId(order?.id ?? "");
    setAmount(order ? String(orderBalance(order)) : "");
    setMethod("cash");
    setReference("");
    setVerified(true);
    setPaymentFormOpen(true);
    setView("payments");
  }

  function choosePaymentOrder(id: string) {
    setPaymentOrderId(id);
    const order = data.orders.find((item) => item.id === id);
    setAmount(order ? String(orderBalance(order)) : "");
  }

  async function addPayment() {
    if (!requireStaff() || !paymentOrderId) return;
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return toast.error("Enter a valid payment amount.");
    const committed = data.payments.filter((payment) => payment.order_id === paymentOrderId && ["verified", "pending"].includes(payment.status))
      .reduce((sum, payment) => sum + Number(payment.amount), 0);
    if (selectedPaymentOrder && numericAmount > Number(selectedPaymentOrder.total) - committed + 0.001)
      return toast.error("Amount exceeds the remaining balance, including pending payments.");
    setSaving(true);
    try {
      const { error } = await withTimeout(
        supabase.from("payments").insert({ order_id: paymentOrderId, amount: numericAmount, method, reference: reference.trim() || null, status: verified ? "verified" : "pending" }),
        12_000,
        "Payment save timed out. Please try again.",
      );
      if (error) throw error;
      toast.success(verified ? "Payment recorded and verified" : "Payment saved for verification");
      setPaymentFormOpen(false);
      await withTimeout(refetch(), 12_000, "Payment saved, but the Orders refresh took too long.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function verifyPayment(id: string) {
    if (!requireStaff()) return;
    try {
      const { error } = await withTimeout(
        supabase.from("payments").update({ status: "verified" }).eq("id", id),
        12_000,
        "Payment verification timed out.",
      );
      if (error) throw error;
      toast.success("Payment verified. Order balance updated automatically.");
      await withTimeout(refetch(), 12_000, "Payment verified, but the Orders refresh took too long.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment could not be verified.");
    }
  }

  async function removePayment(id: string) {
    if (!requireStaff() || !confirm("Remove this payment record? The order balance will be recalculated.")) return;
    try {
      const { error } = await withTimeout(
        supabase.from("payments").delete().eq("id", id),
        12_000,
        "Removing the payment timed out.",
      );
      if (error) throw error;
      toast.success("Payment removed");
      await withTimeout(refetch(), 12_000, "Payment removed, but the Orders refresh took too long.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Payment could not be removed.");
    }
  }

  async function openProof(path: string) {
    if (!requireStaff()) return;
    try {
      const { data: signed, error } = await withTimeout(
        supabase.storage.from("payment-proofs").createSignedUrl(path, 90),
        12_000,
        "Payment proof link timed out.",
      );
      if (error || !signed?.signedUrl) throw error ?? new Error("Could not open payment proof.");
      window.open(signed.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open payment proof.");
    }
  }

  async function cancelOrder(id: string, number: string) {
    if (!requireStaff() || !confirm(`Cancel order ${number}?`)) return;
    try {
      const { error } = await withTimeout(
        supabase.from("orders").update({ status: "cancelled", production_status: "cancelled" }).eq("id", id),
        12_000,
        "Order cancellation timed out.",
      );
      if (error) throw error;
      toast.success(`${number} cancelled`);
      await withTimeout(refetch(), 12_000, "Order cancelled, but the Orders refresh took too long.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Order could not be cancelled.");
    }
  }

  const collected = activeOrders.reduce((sum, order) => sum + Number(order.paid), 0);
  const outstanding = activeOrders.reduce((sum, order) => sum + orderBalance(order), 0);
  const pendingPayments = data.payments.filter((payment) => payment.status === "pending").length;

  return (
    <AppShell>
      <PageHeader eyebrow={data.event?.name ?? "Client orders"} title="Orders" description={`${activeOrders.length} active orders · ${peso(collected)} collected · ${peso(outstanding)} remaining`} actions={<Button variant="outline" onClick={startPayment}><Banknote className="size-4" /> Record payment</Button>} />

      {!data.event ? <EmptyState title="No event selected" description="Choose an event before managing orders." action={<Button asChild><Link to="/events">Open Events</Link></Button>} /> : (
        <>
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border bg-card p-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex gap-1"><Button size="sm" variant={view === "orders" ? "default" : "ghost"} onClick={() => setView("orders")}>Orders</Button><Button size="sm" variant={view === "payments" ? "default" : "ghost"} onClick={() => setView("payments")}>Payment verification {pendingPayments ? `(${pendingPayments})` : ""}</Button></div><div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border bg-background px-3 sm:max-w-xl"><Search className="size-4 text-muted-foreground" /><Input className="border-0 bg-transparent shadow-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, class, congregation, contact or order…" /></div></div>

          {paymentFormOpen ? <Panel className="mb-5" title="Record payment" description="For cash or payments you receive directly. Verified payments automatically recalculate the order balance."><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"><div className="md:col-span-2"><Field label="Order"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={paymentOrderId} onChange={(event) => choosePaymentOrder(event.target.value)}><option value="">Choose order…</option>{activeOrders.map((order) => { const person = findParticipant(data, order.participant_id); return <option key={order.id} value={order.id}>{order.order_number} · {person?.full_name ?? "Unknown"} · balance {peso(orderBalance(order))}</option>; })}</select></Field></div><Field label="Amount"><Input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} /></Field><Field label="Method"><select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={method} onChange={(event) => setMethod(event.target.value)}><option value="cash">Cash</option><option value="gcash">GCash</option><option value="maya">Maya</option><option value="bank">Bank transfer</option><option value="other">Other</option></select></Field><div className="md:col-span-2"><Field label="Reference / receipt number"><Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="Optional for cash" /></Field></div><label className="flex items-center gap-2 pt-6 text-sm"><Checkbox checked={verified} onCheckedChange={(checked) => setVerified(checked === true)} /> Verify this payment now</label>{selectedPaymentOrder ? <div className="rounded-md border border-border bg-muted/20 p-3 text-xs"><p className="text-muted-foreground">Current balance</p><p className="mt-1 text-lg font-bold">{peso(orderBalance(selectedPaymentOrder))}</p></div> : null}</div><div className="mt-5 flex gap-2"><Button onClick={() => void addPayment()} disabled={saving}>{saving ? "Saving…" : "Save payment"}</Button><Button variant="ghost" onClick={() => setPaymentFormOpen(false)}>Cancel</Button></div></Panel> : null}

          {view === "orders" ? <><div className="mb-4 flex gap-1 overflow-x-auto">{(["all", "unpaid", "partial", "paid", "cancelled"] as const).map((value) => <Button key={value} size="sm" variant={filter === value ? "default" : "ghost"} onClick={() => setFilter(value)}>{titleize(value)}</Button>)}</div>{visibleOrders.length ? <div className="grid gap-3">{visibleOrders.map((order) => { const person = findParticipant(data, order.participant_id); const items = data.orderItems.filter((item) => item.order_id === order.id); return <Panel key={order.id} title={person?.full_name ?? order.order_number} description={`${order.order_number} · ${person?.organization ?? "No congregation"} · ${person?.batch ?? "No class/group"}`} actions={<div className="flex gap-2"><StatusPill label={order.payment_status} tone={paymentTone(order.payment_status)} /><StatusPill label={order.production_status} tone={order.status === "cancelled" ? "neutral" : productionTone(order.production_status)} /></div>}><div className="grid gap-4"><div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"><div><p className="text-xs text-muted-foreground">Total</p><p className="font-semibold">{peso(order.total)}</p></div><div><p className="text-xs text-muted-foreground">Paid</p><p className="font-semibold">{peso(order.paid)}</p></div><div><p className="text-xs text-muted-foreground">Balance</p><p className="font-semibold">{peso(orderBalance(order))}</p></div><div><p className="text-xs text-muted-foreground">Contact</p><p className="font-semibold">{person?.contact_number ?? "—"}</p></div></div><div className="flex flex-wrap gap-2">{items.map((item) => <span key={item.id} className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-xs"><strong>{item.kind === "group_package" ? "Class" : "Solo"}</strong> · {item.label} · {item.quantity}× {item.print_size}</span>)}</div>{order.status !== "cancelled" ? <div><Button size="sm" variant="ghost" onClick={() => void cancelOrder(order.id, order.order_number)}><XCircle className="size-4" /> Cancel order</Button></div> : null}</div></Panel>; })}</div> : <EmptyState title="No matching orders" description="Orders created from the client gallery appear here automatically." />}</> : visiblePayments.length ? <div className="grid gap-3">{visiblePayments.map((payment) => { const order = data.orders.find((item) => item.id === payment.order_id); const person = order && findParticipant(data, order.participant_id); return <Panel key={payment.id} title={person?.full_name ?? "Payment"} description={`${order?.order_number ?? "Unknown order"} · ${titleize(payment.method)} · ${payment.reference ?? "No reference"}`}><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="font-display text-2xl font-extrabold">{peso(payment.amount)}</p><p className="mt-1 text-xs text-muted-foreground">{person?.batch ?? "No class/group"}</p><div className="mt-2 flex flex-wrap gap-2"><StatusPill label={payment.status} tone={payment.status === "verified" ? "success" : "warning"} />{order ? <StatusPill label={`Order ${order.payment_status}`} tone={paymentTone(order.payment_status)} /> : null}</div></div><div className="flex flex-wrap gap-2">{payment.proof_url ? <Button size="sm" variant="outline" onClick={() => void openProof(payment.proof_url!)}><ExternalLink className="size-4" /> View screenshot</Button> : null}{payment.status !== "verified" ? <Button size="sm" onClick={() => void verifyPayment(payment.id)}><CheckCircle2 className="size-4" /> Verify payment</Button> : null}<Button size="sm" variant="ghost" onClick={() => void removePayment(payment.id)}><Trash2 className="size-4" /> Remove</Button></div></div></Panel>; })}</div> : <EmptyState title="No payment records" description="Client payment submissions and staff-recorded payments appear here." />}
        </>
      )}
    </AppShell>
  );
}
