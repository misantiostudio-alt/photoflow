import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Banknote,
  Camera,
  CircleDollarSign,
  Images,
  Plus,
  Printer,
  Truck,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { PipelineStage, StatCard } from "@/components/stats";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { useOps, orderBalance, findParticipant } from "@/lib/data";
import {
  formatDateTime,
  paymentTone,
  peso,
  productionTone,
  stageIndex,
  titleize,
} from "@/lib/domain";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Operations Dashboard — PhotoFlow" },
      {
        name: "description",
        content:
          "Live production dashboard for high-volume event photography: participants, orders, payments, print queue, QC and delivery in one place.",
      },
      { property: "og:title", content: "PhotoFlow by Misantio Studio" },
      {
        property: "og:description",
        content:
          "A photography studio operations platform for schools, graduations and large group sessions.",
      },
    ],
  }),
  component: Dashboard,
});

const QUICK = [
  { to: "/participants", label: "Add Participant", icon: Users },
  { to: "/intake", label: "Upload Photos", icon: Images },
  { to: "/shooting", label: "Shooting Mode", icon: Camera },
  { to: "/print-queue", label: "Print Queue", icon: Printer },
  { to: "/delivery", label: "Delivery Mode", icon: Truck },
  { to: "/events", label: "Create Event", icon: Plus },
] as const;

function Dashboard() {
  const { data, isLoading } = useOps();

  if (isLoading || !data) {
    return (
      <AppShell>
        <PageHeader title="Studio Operations" eyebrow="Misantio Studio" />
        <LoadingGrid rows={6} />
      </AppShell>
    );
  }

  const { participants, orders, payments } = data;
  const totalSales = orders.reduce((s, o) => s + Number(o.total), 0);
  const collected = orders.reduce((s, o) => s + Number(o.paid), 0);
  const outstanding = orders.reduce((s, o) => s + orderBalance(o), 0);
  const notShot = participants.filter((p) => p.shooting_status !== "shot").length;
  const galleriesReady = participants.filter((p) => p.gallery_status === "ready").length;

  const atLeast = (stage: string) =>
    orders.filter((o) => stageIndex(o.production_status) >= stageIndex(stage)).length;

  const pipeline = [
    { label: "Registered", count: participants.length },
    { label: "Photographed", count: participants.filter((p) => p.shooting_status === "shot").length },
    { label: "Gallery Ready", count: galleriesReady },
    { label: "Ordered", count: orders.length },
    { label: "Paid", count: orders.filter((o) => o.payment_status === "paid").length },
    { label: "Printed", count: atLeast("printed") },
    { label: "QC Passed", count: atLeast("print_qc") },
    { label: "Framed", count: atLeast("framed") },
    { label: "Ready", count: atLeast("ready") },
    { label: "Delivered", count: atLeast("delivered") },
  ];

  const alerts = [
    {
      tone: "danger" as const,
      label: "Unpaid orders",
      count: orders.filter((o) => o.payment_status === "unpaid").length,
      to: "/payments",
    },
    {
      tone: "warning" as const,
      label: "Balance remaining",
      count: orders.filter((o) => orderBalance(o) > 0 && o.payment_status !== "unpaid").length,
      to: "/payments",
    },
    {
      tone: "info" as const,
      label: "Payment proofs to verify",
      count: payments.filter((p) => p.status === "pending").length,
      to: "/payments",
    },
    {
      tone: "warning" as const,
      label: "Waiting for print",
      count: orders.filter((o) => o.production_status === "for_print").length,
      to: "/print-queue",
    },
    {
      tone: "info" as const,
      label: "Waiting for framing",
      count: orders.filter((o) => o.production_status === "print_qc").length,
      to: "/framing",
    },
    {
      tone: "gold" as const,
      label: "Ready for pickup",
      count: orders.filter((o) => o.production_status === "ready").length,
      to: "/delivery",
    },
  ];

  return (
    <AppShell>
      <PageHeader
        eyebrow={data.event?.name ?? "Misantio Studio"}
        title="Studio Operations"
        description="Everything happening across registration, shooting, ordering, production and delivery."
        actions={
          <Button asChild className="gap-1.5">
            <Link to="/shooting">
              <Camera className="size-4" /> Start Shooting Mode
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Participants" value={participants.length} icon={<Users className="size-4" />} hint={`${notShot} not yet photographed`} />
        <StatCard label="Orders" value={orders.length} icon={<Printer className="size-4" />} hint={`${galleriesReady} galleries ready`} />
        <StatCard label="Total sales" value={peso(totalSales)} icon={<CircleDollarSign className="size-4" />} />
        <StatCard label="Collected" value={peso(collected)} icon={<Banknote className="size-4" />} hint={`${peso(outstanding)} outstanding`} accent />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK.map((q) => (
          <Button key={q.label} asChild variant="outline" size="sm" className="gap-1.5 bg-card">
            <Link to={q.to}>
              <q.icon className="size-4" />
              {q.label}
            </Link>
          </Button>
        ))}
      </div>

      <div className="mt-6">
        <p className="eyebrow mb-2">Production pipeline</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {pipeline.map((s) => (
            <PipelineStage
              key={s.label}
              label={s.label}
              count={s.count}
              total={participants.length}
            />
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Panel title="Recent orders" description="Latest submissions" className="lg:col-span-2">
          <div className="divide-y divide-border">
            {orders.slice(0, 6).map((o) => {
              const p = findParticipant(data, o.participant_id);
              return (
                <div key={o.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p?.full_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {o.order_number} · {p?.organization}
                    </p>
                  </div>
                  <StatusPill label={o.payment_status} tone={paymentTone(o.payment_status)} size="sm" />
                  <StatusPill
                    label={o.production_status}
                    tone={productionTone(o.production_status)}
                    size="sm"
                  />
                  <p className="w-20 text-right text-sm tabular-nums">{peso(o.total)}</p>
                </div>
              );
            })}
            {orders.length === 0 ? <EmptyState title="No orders yet" /> : null}
          </div>
        </Panel>

        <Panel title="Production alerts" description="Needs attention">
          <div className="grid gap-2">
            {alerts.map((a) => (
              <Link
                key={a.label}
                to={a.to}
                className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
              >
                <AlertTriangle className="size-4 text-muted-foreground" />
                <span className="flex-1">{a.label}</span>
                <StatusPill label={String(a.count)} tone={a.tone} size="sm" />
              </Link>
            ))}
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Latest payments">
          <div className="divide-y divide-border">
            {payments.slice(0, 6).map((pay) => {
              const order = orders.find((o) => o.id === pay.order_id);
              const p = order ? findParticipant(data, order.participant_id) : undefined;
              return (
                <div key={pay.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p?.full_name ?? "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {titleize(pay.method)} · {formatDateTime(pay.paid_at)}
                    </p>
                  </div>
                  <StatusPill
                    label={pay.status}
                    tone={pay.status === "verified" ? "success" : "warning"}
                    size="sm"
                  />
                  <span className="tabular-nums">{peso(pay.amount)}</span>
                </div>
              );
            })}
          </div>
        </Panel>

        <Panel title="Orders with remaining balance">
          <div className="divide-y divide-border">
            {orders
              .filter((o) => orderBalance(o) > 0)
              .slice(0, 6)
              .map((o) => {
                const p = findParticipant(data, o.participant_id);
                return (
                  <div key={o.id} className="flex items-center gap-3 py-2.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p?.full_name}</p>
                      <p className="text-xs text-muted-foreground">{o.order_number}</p>
                    </div>
                    <span className="font-semibold tabular-nums text-destructive">
                      {peso(orderBalance(o))}
                    </span>
                  </div>
                );
              })}
            {orders.every((o) => orderBalance(o) === 0) ? (
              <EmptyState title="All settled" description="No outstanding balances." />
            ) : null}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
