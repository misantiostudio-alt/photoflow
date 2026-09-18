import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Images,
  PackageCheck,
  ReceiptText,
  Settings,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { LoadingGrid, Panel } from "@/components/page";
import { StatCard } from "@/components/stats";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { findParticipant, orderBalance, useOps, useSession } from "@/lib/data";
import { formatDate, formatDateTime, paymentTone, peso, productionTone } from "@/lib/domain";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PhotoFlow — Misantio Studio" },
      {
        name: "description",
        content: "Photo gallery, ordering, payment, production and release workflow for Misantio Studio.",
      },
    ],
  }),
  component: Dashboard,
});

const QUICK_ACTIONS = [
  { to: "/gallery", label: "Open Gallery", description: "Review uploaded photos and client identification.", icon: Images },
  { to: "/orders", label: "Review Orders", description: "Orders, balances and payment verification.", icon: ReceiptText },
  { to: "/production", label: "Production", description: "Printing, framing and QC in one place.", icon: PackageCheck },
  { to: "/release", label: "Release Desk", description: "Search or scan an order before handover.", icon: Truck },
] as const;

function Dashboard() {
  const { data, isLoading } = useOps();
  const email = useSession();

  if (isLoading || !data) {
    return (
      <AppShell>
        <LoadingGrid rows={6} />
      </AppShell>
    );
  }

  if (!data.event) {
    return (
      <AppShell>
        <section className="soft-grid relative overflow-hidden rounded-xl border border-border bg-card/65 p-6 sm:p-8 lg:p-10">
          <div className="absolute inset-y-0 left-0 w-1 bg-primary" />
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/[.06] px-2.5 py-1 text-[0.62rem] font-bold uppercase tracking-[.14em] text-primary">
              <ShieldCheck className="size-3.5" /> PhotoFlow 2.0
            </span>
            <h1 className="mt-5 font-display text-4xl font-extrabold tracking-[-.055em] sm:text-5xl">
              Start with a real event, then let the gallery drive the workflow.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
              PhotoFlow is now organized around the way Misantio Studio actually works: upload the edited portraits,
              let clients identify themselves and order, then manage payment, production and release.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {!email ? (
                <Button asChild size="lg"><Link to="/auth"><ShieldCheck className="size-4" /> Create first Owner account</Link></Button>
              ) : (
                <Button asChild size="lg"><Link to="/events"><CalendarDays className="size-4" /> Create first event</Link></Button>
              )}
              <Button asChild variant="outline" size="lg"><Link to="/events">Manage events</Link></Button>
            </div>
          </div>
        </section>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <Panel title="1 · Event" description="PSS, SCE, KMS or another schooling">
            <p className="text-sm text-muted-foreground">Create the event and configure its packages, pricing and payment instructions.</p>
          </Panel>
          <Panel title="2 · Gallery" description="Photos first, names later">
            <p className="text-sm text-muted-foreground">Upload the finished thumbnails. Preloaded names are optional, not required.</p>
          </Panel>
          <Panel title="3 · Fulfillment" description="One clean operational flow">
            <p className="text-sm text-muted-foreground">Orders move through payment, production, QC and release without separate duplicate queues.</p>
          </Panel>
        </div>
      </AppShell>
    );
  }

  const activeOrders = data.orders.filter((order) => order.status !== "cancelled");
  const totalSales = activeOrders.reduce((sum, order) => sum + Number(order.total), 0);
  const collected = activeOrders.reduce((sum, order) => sum + Number(order.paid), 0);
  const outstanding = activeOrders.reduce((sum, order) => sum + orderBalance(order), 0);
  const pendingPayments = data.payments.filter((payment) => payment.status === "pending").length;
  const inProduction = activeOrders.filter((order) => !["ready", "delivered"].includes(order.production_status)).length;
  const readyForRelease = activeOrders.filter((order) => order.production_status === "ready").length;
  const delivered = activeOrders.filter((order) => order.production_status === "delivered").length;
  const identified = data.participants.length;
  const uploadedPhotos = data.photos.filter((photo) => !photo.is_separator).length;

  const nextAction = pendingPayments > 0
    ? {
        eyebrow: "Orders",
        title: `${pendingPayments} payment ${pendingPayments === 1 ? "submission needs" : "submissions need"} verification`,
        description: "Review payment proof and keep the client-facing status gentle and clear.",
        label: "Review payments",
        to: "/orders" as const,
        icon: Banknote,
      }
    : inProduction > 0
      ? {
          eyebrow: "Production",
          title: `${inProduction} order ${inProduction === 1 ? "is" : "are"} still in production`,
          description: "Printing, framing and quality control now live in one workspace.",
          label: "Open production",
          to: "/production" as const,
          icon: PackageCheck,
        }
      : readyForRelease > 0
        ? {
            eyebrow: "Release",
            title: `${readyForRelease} order ${readyForRelease === 1 ? "is" : "are"} ready for pickup`,
            description: "Search the client or scan the order pass before handover.",
            label: "Open release desk",
            to: "/release" as const,
            icon: Truck,
          }
        : {
            eyebrow: "Gallery",
            title: "The event is ready for the next gallery activity",
            description: "Review uploaded photos and the people who have identified themselves.",
            label: "Open gallery",
            to: "/gallery" as const,
            icon: Images,
          };

  const recentOrders = [...activeOrders]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 6);

  return (
    <AppShell>
      <section className="soft-grid relative mb-4 overflow-hidden rounded-lg border border-border bg-card/62">
        <div className="absolute inset-y-0 left-0 w-0.5 bg-primary" />
        <div className="relative flex flex-col gap-5 px-4 py-4 sm:px-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/[0.07] px-2 py-1 text-[0.55rem] font-bold uppercase tracking-[0.12em] text-primary">
                <span className="size-1.5 rounded-full bg-primary" /> Active event
              </span>
              <span className="text-[0.64rem] text-muted-foreground">{data.event.event_type}</span>
            </div>
            <h1 className="max-w-4xl font-display text-2xl font-extrabold leading-[1.03] tracking-[-0.05em] sm:text-3xl lg:text-[2.35rem]">
              {data.event.name}
            </h1>
            <p className="mt-2 max-w-2xl text-[0.76rem] leading-relaxed text-muted-foreground sm:text-sm">
              Gallery, client orders, payment, production and release in one simple workflow.
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[0.64rem] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-3" /> {formatDate(data.event.event_date)}</span>
              <span>{data.event.venue ?? "Venue not set"}</span>
              <span>{uploadedPhotos} gallery photos</span>
              <span>{identified} identified clients</span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/events">Switch event</Link></Button>
            <Button asChild size="sm"><Link to="/gallery"><Images className="size-3.5" /> Open Gallery</Link></Button>
          </div>
        </div>
      </section>

      <section className="mb-5 flex flex-col gap-3 rounded-lg border border-primary/18 bg-primary/[0.035] p-3 sm:flex-row sm:items-center sm:p-3.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border border-primary/20 bg-primary text-primary-foreground">
          <nextAction.icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.55rem] font-bold uppercase tracking-[0.12em] text-primary">Next · {nextAction.eyebrow}</p>
          <h2 className="mt-0.5 font-display text-[0.96rem] font-bold sm:text-base">{nextAction.title}</h2>
          <p className="mt-0.5 text-[0.68rem] text-muted-foreground sm:text-xs">{nextAction.description}</p>
        </div>
        <Button asChild size="sm" className="shrink-0"><Link to={nextAction.to}>{nextAction.label} <ArrowUpRight className="size-3" /></Link></Button>
      </section>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <StatCard label="Gallery photos" value={uploadedPhotos} icon={<Images className="size-3.5" />} hint={`${identified} identified clients`} />
        <StatCard label="Active orders" value={activeOrders.length} icon={<ReceiptText className="size-3.5" />} hint={`${pendingPayments} payments to verify`} />
        <StatCard label="Sales" value={peso(totalSales)} icon={<Banknote className="size-3.5" />} hint={`${peso(outstanding)} outstanding`} />
        <StatCard label="Collected" value={peso(collected)} icon={<Banknote className="size-3.5" />} hint={`${readyForRelease} ready for release`} accent />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_ACTIONS.map((action) => (
          <Link key={action.to} to={action.to} className="group flex min-h-36 flex-col rounded-lg border border-border bg-card/65 p-4 transition-colors hover:border-primary/30 hover:bg-card">
            <span className="grid size-9 place-items-center rounded-md border border-primary/15 bg-primary/[0.07] text-primary">
              <action.icon className="size-4" />
            </span>
            <h3 className="mt-4 font-display text-base font-bold">{action.label}</h3>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.description}</p>
            <ArrowUpRight className="mt-auto size-4 self-end text-primary" />
          </Link>
        ))}
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.45fr_.8fr]">
        <Panel title="Recent orders" description="Latest active client and assisted orders" bodyClassName="p-0">
          {recentOrders.length ? (
            <div>
              {recentOrders.map((order) => {
                const participant = findParticipant(data, order.participant_id);
                return (
                  <div key={order.id} className="grid gap-2 border-b border-border px-4 py-3 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                    <div>
                      <p className="text-sm font-semibold">{participant?.full_name ?? order.order_number}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{order.order_number} · {formatDateTime(order.created_at)}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <StatusPill label={order.payment_status} tone={paymentTone(order.payment_status)} />
                      <StatusPill label={order.production_status} tone={productionTone(order.production_status)} />
                    </div>
                    <p className="text-right text-sm font-semibold">{peso(order.total)}</p>
                  </div>
                );
              })}
            </div>
          ) : <p className="p-5 text-sm text-muted-foreground">No orders yet.</p>}
        </Panel>

        <Panel title="Fulfillment status" description="Only the queues that matter now">
          <div className="grid gap-2">
            <Link to="/orders" className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 hover:border-primary/25">
              <Banknote className="size-4 text-primary" /><span className="min-w-0 flex-1 text-sm">Payments to verify</span><span className="font-mono text-sm font-bold">{pendingPayments}</span>
            </Link>
            <Link to="/production" className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 hover:border-primary/25">
              <PackageCheck className="size-4 text-primary" /><span className="min-w-0 flex-1 text-sm">In production</span><span className="font-mono text-sm font-bold">{inProduction}</span>
            </Link>
            <Link to="/release" className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 hover:border-primary/25">
              <Truck className="size-4 text-primary" /><span className="min-w-0 flex-1 text-sm">Ready for release</span><span className="font-mono text-sm font-bold">{readyForRelease}</span>
            </Link>
            <div className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5">
              <Users className="size-4 text-muted-foreground" /><span className="min-w-0 flex-1 text-sm">Released</span><span className="font-mono text-sm font-bold">{delivered}</span>
            </div>
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
