import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Frame, Image, PackageCheck, Printer, UsersRound } from "lucide-react";
import { useMemo } from "react";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { findParticipant, orderBalance, useOps } from "@/lib/data";
import { peso } from "@/lib/domain";

export const Route = createFileRoute("/reports")({ component: ReportsPage });

type ProductionRow = { key: string; label: string; group?: string; quantity: number; framed: boolean; size: string };

function ReportsPage() {
  const { data, isLoading } = useOps();

  const summaries = useMemo(() => {
    if (!data) return { group: [] as ProductionRow[], solo: [] as ProductionRow[] };
    const activeOrders = new Map(data.orders.filter((order) => order.status !== "cancelled").map((order) => [order.id, order]));
    const groupMap = new Map<string, ProductionRow>();
    const soloMap = new Map<string, ProductionRow>();

    data.orderItems.forEach((item) => {
      const order = activeOrders.get(item.order_id);
      if (!order) return;
      const size = item.print_size ?? "Other";
      const framed = item.framed;
      const quantity = Number(item.quantity || 0);
      if (item.kind === "group_package") {
        const participant = findParticipant(data, order.participant_id);
        const group = participant?.batch?.trim() || "Unassigned class/group";
        const key = `${group}|${size}|${framed ? "frame" : "print"}`;
        const row = groupMap.get(key) ?? { key, label: `${size} ${framed ? "with frame" : "print only"}`, group, quantity: 0, framed, size };
        row.quantity += quantity;
        groupMap.set(key, row);
      } else {
        const key = `${size}|${framed ? "frame" : "print"}`;
        const row = soloMap.get(key) ?? { key, label: `${size} ${framed ? "with frame" : "print only"}`, quantity: 0, framed, size };
        row.quantity += quantity;
        soloMap.set(key, row);
      }
    });

    return {
      group: [...groupMap.values()].sort((a, b) => `${a.group}${a.size}`.localeCompare(`${b.group}${b.size}`)),
      solo: [...soloMap.values()].sort((a, b) => a.size.localeCompare(b.size)),
    };
  }, [data]);

  if (isLoading || !data) return <AppShell><PageHeader eyebrow="Studio summary" title="Reports" /><LoadingGrid rows={6} /></AppShell>;
  if (!data.event) return <AppShell><EmptyState title="No event selected" description="Choose an event to see its production and sales summary." action={<Button asChild><Link to="/events">Open Events</Link></Button>} /></AppShell>;

  const activeOrders = data.orders.filter((order) => order.status !== "cancelled");
  const sales = activeOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const collected = activeOrders.reduce((sum, order) => sum + Number(order.paid), 0);
  const outstanding = activeOrders.reduce((sum, order) => sum + orderBalance(order), 0);
  const allRequirements = [...summaries.group, ...summaries.solo];
  const frames = allRequirements.filter((item) => item.framed).reduce((sum, item) => sum + item.quantity, 0);
  const prints = allRequirements.reduce((sum, item) => sum + item.quantity, 0);

  function exportCsv() {
    const rows = [
      ["Order", "Client", "Class/Group", "Total", "Paid", "Balance", "Payment", "Production"],
      ...activeOrders.map((order) => {
        const participant = findParticipant(data, order.participant_id);
        return [order.order_number, participant?.full_name ?? "", participant?.batch ?? "", order.total, order.paid, orderBalance(order), order.payment_status, order.production_status];
      }),
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${data.event.slug}-orders.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <AppShell>
      <PageHeader eyebrow={data.event.name} title="Reports" description="Exactly what to send to the print lab and frame supplier, separated into official class/group photos and solo portrait add-ons." actions={<Button variant="outline" onClick={exportCsv}><Download className="size-4" /> Export orders</Button>} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Panel title="Sales" description="Active order value"><p className="font-display text-3xl font-extrabold">{peso(sales)}</p></Panel><Panel title="Collected" description="Verified payments"><p className="font-display text-3xl font-extrabold">{peso(collected)}</p></Panel><Panel title="Outstanding" description="Remaining balance"><p className="font-display text-3xl font-extrabold">{peso(outstanding)}</p></Panel><Panel title="Orders" description="Active orders"><p className="font-display text-3xl font-extrabold">{activeOrders.length}</p></Panel></div>

      <Panel className="mt-5" title="Class / Group Photo Requirements" description="Grouped by class, print size and frame requirement">
        {summaries.group.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summaries.group.map((item) => <div key={item.key} className="rounded-lg border border-border bg-muted/15 p-4"><div className="flex items-center justify-between gap-3"><span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary"><UsersRound className="size-4" /></span><span className="font-display text-3xl font-extrabold">{item.quantity}</span></div><p className="mt-4 text-sm font-semibold">{item.group}</p><p className="mt-1 text-xs text-muted-foreground">{item.label}</p><p className="mt-2 text-[0.65rem] font-semibold uppercase tracking-[.12em] text-primary">Official class photo</p></div>)}</div> : <EmptyState title="No class photo requirements yet" description="Confirmed P1/P2/P3 orders will appear here by class/group." />}
      </Panel>

      <Panel className="mt-5" title="Solo Portrait Add-ons" description="All optional solo print/frame quantities">
        {summaries.solo.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{summaries.solo.map((item) => <div key={item.key} className="rounded-lg border border-border bg-muted/15 p-4"><div className="flex items-center justify-between gap-3"><span className="grid size-9 place-items-center rounded-md bg-primary/10 text-primary">{item.framed ? <Frame className="size-4" /> : <Image className="size-4" />}</span><span className="font-display text-3xl font-extrabold">{item.quantity}</span></div><p className="mt-4 text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.framed ? "Solo frame supplier requirement" : "Solo print lab requirement"}</p></div>)}</div> : <EmptyState title="No solo add-ons yet" description="Clients can order the class package without adding a solo product." />}
      </Panel>

      <div className="mt-5 grid gap-3 md:grid-cols-3"><Panel title="Total print pieces" description="Class + solo"><div className="flex items-center gap-3"><Printer className="size-5 text-primary" /><p className="font-display text-3xl font-extrabold">{prints}</p></div></Panel><Panel title="Frames required" description="Class + solo"><div className="flex items-center gap-3"><Frame className="size-5 text-primary" /><p className="font-display text-3xl font-extrabold">{frames}</p></div></Panel><Panel title="Ready / delivered" description="Fulfillment progress"><div className="flex items-center gap-3"><PackageCheck className="size-5 text-primary" /><p className="font-display text-3xl font-extrabold">{activeOrders.filter((order) => ["ready", "delivered"].includes(order.production_status)).length}</p></div></Panel></div>
    </AppShell>
  );
}
