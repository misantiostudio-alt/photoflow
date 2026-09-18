import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Banknote,
  CheckCircle2,
  CircleDollarSign,
  Download,
  PackageCheck,
  ReceiptText,
  TrendingUp,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useMemo } from "react";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { findParticipant, orderBalance, useOps } from "@/lib/data";
import { peso, titleize } from "@/lib/domain";
import { useFinance } from "@/lib/finance";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

type ProductMixRow = {
  key: string;
  label: string;
  kind: string;
  units: number;
  orderIds: Set<string>;
  value: number;
};

type PaymentMethodRow = {
  method: string;
  amount: number;
  count: number;
};

function ReportsPage() {
  const { data, isLoading } = useOps();
  const eventId = data?.event?.id ?? null;
  const finance = useFinance(eventId);

  const activeOrders = useMemo(
    () => data?.orders.filter((order) => order.status !== "cancelled") ?? [],
    [data?.orders],
  );
  const activeOrderIds = useMemo(() => new Set(activeOrders.map((order) => order.id)), [activeOrders]);

  const productMix = useMemo(() => {
    if (!data) return [] as ProductMixRow[];
    const map = new Map<string, ProductMixRow>();

    for (const item of data.orderItems) {
      if (!activeOrderIds.has(item.order_id)) continue;
      const size = item.print_size || "Other";
      const frame = item.framed ? `${titleize(item.frame_color || "black")} frame` : "Print only";
      const kind = item.kind === "group_package" ? "Class / Group" : "Solo";
      const key = `${kind}|${item.label}|${size}|${frame}`;
      const row = map.get(key) ?? {
        key,
        label: `${item.label} · ${size}${item.framed ? ` · ${titleize(item.frame_color || "black")} frame` : ""}`,
        kind,
        units: 0,
        orderIds: new Set<string>(),
        value: 0,
      };

      const quantity = Number(item.quantity || 0);
      row.units += quantity;
      row.orderIds.add(item.order_id);
      row.value += Number(item.unit_price || 0) * Math.max(1, quantity);
      map.set(key, row);
    }

    return [...map.values()].sort((a, b) => b.units - a.units || b.value - a.value);
  }, [activeOrderIds, data]);

  const paymentMethods = useMemo(() => {
    if (!data) return [] as PaymentMethodRow[];
    const map = new Map<string, PaymentMethodRow>();

    for (const payment of data.payments) {
      if (!activeOrderIds.has(payment.order_id) || payment.status !== "verified") continue;
      const method = String(payment.method || "other").toLowerCase();
      const row = map.get(method) ?? { method, amount: 0, count: 0 };
      row.amount += Number(payment.amount || 0);
      row.count += 1;
      map.set(method, row);
    }

    return [...map.values()].sort((a, b) => b.amount - a.amount);
  }, [activeOrderIds, data]);

  const clientCount = useMemo(() => {
    if (!data) return 0;
    const ids = new Set<string>();

    for (const order of activeOrders) {
      ids.add(order.participant_id);
      for (const member of data.orderMembers.filter((item) => item.order_id === order.id)) {
        ids.add(member.participant_id);
      }
    }

    return ids.size;
  }, [activeOrders, data]);

  const metrics = useMemo(() => {
    const sales = activeOrders.reduce((sum, order) => sum + Number(order.total || 0), 0);
    const collected = activeOrders.reduce((sum, order) => sum + Number(order.paid || 0), 0);
    const outstanding = activeOrders.reduce((sum, order) => sum + orderBalance(order), 0);
    const actualExpenses = (finance.data?.expenses ?? []).reduce((sum, expense) => sum + Number(expense.total_cost || 0), 0);
    const profit = sales - actualExpenses;
    const margin = sales > 0 ? (profit / sales) * 100 : 0;
    const released = activeOrders.filter((order) => order.production_status === "delivered").length;

    return { sales, collected, outstanding, actualExpenses, profit, margin, released };
  }, [activeOrders, finance.data?.expenses]);

  const paymentStatus = useMemo(() => ({
    paid: activeOrders.filter((order) => order.payment_status === "paid").length,
    partial: activeOrders.filter((order) => order.payment_status === "partial").length,
    unpaid: activeOrders.filter((order) => order.payment_status === "unpaid").length,
    pending: data?.payments.filter((payment) => activeOrderIds.has(payment.order_id) && payment.status === "pending").length ?? 0,
  }), [activeOrderIds, activeOrders, data?.payments]);

  const fulfillment = useMemo(() => {
    const toPrint = activeOrders.filter((order) => order.production_status === "for_print").length;
    const finishing = activeOrders.filter((order) => ["printed", "print_qc", "framed", "frame_qc", "final_check"].includes(order.production_status)).length;
    const ready = activeOrders.filter((order) => order.production_status === "ready").length;
    const released = activeOrders.filter((order) => order.production_status === "delivered").length;
    return { toPrint, finishing, ready, released };
  }, [activeOrders]);

  if (isLoading || !data || finance.isLoading) {
    return <AppShell><PageHeader eyebrow="Event summary" title="Reports" /><LoadingGrid rows={6} /></AppShell>;
  }

  if (!data.event) {
    return (
      <AppShell>
        <EmptyState
          title="No event selected"
          description="Choose an event to see its management summary."
          action={<Button asChild><Link to="/events">Open Events</Link></Button>}
        />
      </AppShell>
    );
  }

  function downloadCsv(filename: string, rows: Array<Array<string | number>>) {
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function exportSummary() {
    downloadCsv(`${data.event.slug}-summary.csv`, [
      ["PhotoFlow Event Summary", data.event.name],
      ["Event date", data.event.event_date ?? ""],
      [],
      ["Metric", "Value"],
      ["Orders", activeOrders.length],
      ["Clients / people", clientCount],
      ["Sales", metrics.sales],
      ["Collected", metrics.collected],
      ["Outstanding", metrics.outstanding],
      ["Actual expenses", metrics.actualExpenses],
      ["Profit", metrics.profit],
      ["Profit margin", `${metrics.margin.toFixed(1)}%`],
      ["Released", metrics.released],
      [],
      ["Product mix", "Units", "Orders", "Item value"],
      ...productMix.map((row) => [row.label, row.units, row.orderIds.size, row.value]),
      [],
      ["Payment method", "Verified amount", "Transactions"],
      ...paymentMethods.map((row) => [titleize(row.method), row.amount, row.count]),
    ]);
  }

  function exportOrders() {
    const rows: Array<Array<string | number>> = [
      ["Order", "Client", "Congregation", "Class / Group", "Item type", "Item", "Size", "Frame color", "Qty", "Unit price", "Order total", "Paid", "Balance", "Payment", "Production"],
    ];

    for (const order of activeOrders) {
      const participant = findParticipant(data, order.participant_id);
      const items = data.orderItems.filter((item) => item.order_id === order.id);

      if (!items.length) {
        rows.push([
          order.order_number,
          participant?.full_name ?? "",
          participant?.organization ?? "",
          participant?.batch ?? "",
          "",
          "",
          "",
          "",
          "",
          "",
          order.total,
          order.paid,
          orderBalance(order),
          order.payment_status,
          order.production_status,
        ]);
        continue;
      }

      for (const item of items) {
        rows.push([
          order.order_number,
          participant?.full_name ?? "",
          participant?.organization ?? "",
          participant?.batch ?? "",
          item.kind === "group_package" ? "Class / Group" : "Solo",
          item.label,
          item.print_size ?? "",
          item.framed ? titleize(item.frame_color || "black") : "",
          item.quantity,
          item.unit_price,
          order.total,
          order.paid,
          orderBalance(order),
          order.payment_status,
          order.production_status,
        ]);
      }
    }

    downloadCsv(`${data.event.slug}-orders-detailed.csv`, rows);
  }

  const maxProductUnits = Math.max(1, ...productMix.map((row) => row.units));
  const maxPaymentAmount = Math.max(1, ...paymentMethods.map((row) => row.amount));

  return (
    <AppShell>
      <PageHeader
        eyebrow={data.event.name}
        title="Reports"
        description="A management summary of this event—sales, profit, product mix, payments and fulfillment."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={exportSummary}><Download className="size-4" /> Export summary</Button>
            <Button variant="outline" onClick={exportOrders}><Download className="size-4" /> Export orders</Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={CircleDollarSign} label="Sales" value={peso(metrics.sales)} note={`${activeOrders.length} active orders`} />
        <MetricCard icon={WalletCards} label="Collected" value={peso(metrics.collected)} note={`${peso(metrics.outstanding)} still outstanding`} />
        <MetricCard icon={ReceiptText} label="Actual expenses" value={peso(metrics.actualExpenses)} note="Recorded in Finance" />
        <MetricCard icon={TrendingUp} label="Profit" value={peso(metrics.profit)} note={`${metrics.margin.toFixed(1)}% margin`} accent />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={UsersRound} label="Clients / people" value={String(clientCount)} note="Unique people in active orders" />
        <MetricCard icon={PackageCheck} label="Orders" value={String(activeOrders.length)} note="Cancelled orders excluded" />
        <MetricCard icon={UserRoundCheck} label="Released" value={String(metrics.released)} note={`${Math.max(0, activeOrders.length - metrics.released)} not released yet`} />
        <MetricCard icon={Banknote} label="Pending verification" value={String(paymentStatus.pending)} note="Payment submissions to review" warning={paymentStatus.pending > 0} />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Panel title="Order mix" description="Which products clients are actually choosing.">
          {productMix.length ? (
            <div className="grid gap-3">
              {productMix.slice(0, 10).map((row) => (
                <div key={row.key}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{row.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.kind} · {row.orderIds.size} order{row.orderIds.size === 1 ? "" : "s"}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display text-lg font-extrabold">{row.units}</p>
                      <p className="text-[0.62rem] uppercase tracking-[.08em] text-muted-foreground">units</p>
                    </div>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (row.units / maxProductUnits) * 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No product data yet" description="Product mix appears as clients place real orders." />}
        </Panel>

        <Panel title="Payment status" description="Current collection position for this event.">
          <div className="grid gap-3">
            <StatusLine label="Paid orders" value={paymentStatus.paid} total={activeOrders.length} tone="success" />
            <StatusLine label="Partial payment" value={paymentStatus.partial} total={activeOrders.length} tone="warning" />
            <StatusLine label="Unpaid / Pay later" value={paymentStatus.unpaid} total={activeOrders.length} tone="neutral" />
          </div>
          <div className="mt-5 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-xs text-muted-foreground">Outstanding balance</p><p className="mt-1 font-display text-2xl font-extrabold">{peso(metrics.outstanding)}</p></div>
              <p className="text-xs text-muted-foreground">{paymentStatus.pending} pending verification</p>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_1.35fr]">
        <Panel title="Verified payment methods" description="Where collected money came from.">
          {paymentMethods.length ? (
            <div className="grid gap-3">
              {paymentMethods.map((row) => (
                <div key={row.method}>
                  <div className="flex items-center justify-between gap-4">
                    <div><p className="text-sm font-semibold">{titleize(row.method)}</p><p className="text-xs text-muted-foreground">{row.count} transaction{row.count === 1 ? "" : "s"}</p></div>
                    <p className="font-semibold">{peso(row.amount)}</p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(4, (row.amount / maxPaymentAmount) * 100)}%` }} /></div>
                </div>
              ))}
            </div>
          ) : <EmptyState title="No verified payments yet" description="Verified GCash, Maya, cash and other payments will appear here." />}
        </Panel>

        <Panel title="Fulfillment" description="How far client orders have moved from printing to release.">
          <div className="grid gap-3 sm:grid-cols-4">
            <FunnelStep label="To Print" value={fulfillment.toPrint} />
            <FunnelStep label="Finishing" value={fulfillment.finishing} />
            <FunnelStep label="Ready" value={fulfillment.ready} accent={fulfillment.ready > 0} />
            <FunnelStep label="Released" value={fulfillment.released} accent={fulfillment.released > 0} />
          </div>
          <div className="mt-5 rounded-lg border border-border bg-muted/10 p-4">
            <div className="flex items-center justify-between gap-4 text-sm">
              <span className="text-muted-foreground">Release progress</span>
              <strong>{activeOrders.length ? Math.round((fulfillment.released / activeOrders.length) * 100) : 0}%</strong>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${activeOrders.length ? (fulfillment.released / activeOrders.length) * 100 : 0}%` }} />
            </div>
          </div>
        </Panel>
      </div>

      <Panel className="mt-5" title="Event closing snapshot" description="A simple end-of-event view for management and record keeping.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Snapshot label="Sales" value={peso(metrics.sales)} />
          <Snapshot label="Collected" value={peso(metrics.collected)} />
          <Snapshot label="Actual expenses" value={peso(metrics.actualExpenses)} />
          <Snapshot label="Profit" value={peso(metrics.profit)} accent />
          <Snapshot label="People" value={String(clientCount)} />
          <Snapshot label="Orders" value={String(activeOrders.length)} />
          <Snapshot label="Released" value={`${metrics.released} / ${activeOrders.length}`} />
          <Snapshot label="Outstanding" value={peso(metrics.outstanding)} warning={metrics.outstanding > 0} />
        </div>
      </Panel>
    </AppShell>
  );
}

function MetricCard({ icon: Icon, label, value, note, accent = false, warning = false }: any) {
  return (
    <div className={cn("rounded-lg border p-4", accent ? "border-primary/30 bg-primary/[.04]" : warning ? "border-warning/30 bg-warning/5" : "border-border bg-card")}>
      <div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><Icon className={cn("size-4", accent ? "text-primary" : warning ? "text-warning" : "text-muted-foreground")} /></div>
      <p className="mt-3 font-display text-2xl font-extrabold tracking-[-.04em]">{value}</p>
      <p className="mt-1 text-[0.68rem] text-muted-foreground">{note}</p>
    </div>
  );
}

function StatusLine({ label, value, total, tone }: { label: string; value: number; total: number; tone: "success" | "warning" | "neutral" }) {
  const percentage = total ? (value / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm"><span>{label}</span><strong>{value}</strong></div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", tone === "success" ? "bg-success" : tone === "warning" ? "bg-warning" : "bg-muted-foreground")} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

function FunnelStep({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div className={cn("rounded-lg border p-4 text-center", accent ? "border-primary/25 bg-primary/[.035]" : "border-border bg-muted/10")}><p className="font-display text-3xl font-extrabold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}

function Snapshot({ label, value, accent = false, warning = false }: { label: string; value: string; accent?: boolean; warning?: boolean }) {
  return <div className={cn("rounded-lg border p-3", accent ? "border-primary/25 bg-primary/[.035]" : warning ? "border-warning/25 bg-warning/5" : "border-border bg-muted/10")}><p className="text-[0.65rem] font-bold uppercase tracking-[.1em] text-muted-foreground">{label}</p><p className={cn("mt-1 font-display text-xl font-extrabold", accent && "text-primary", warning && "text-warning")}>{value}</p></div>;
}