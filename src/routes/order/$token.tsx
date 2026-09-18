import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { CheckCircle2, Clock3, PackageCheck, ShieldCheck, Truck } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { peso, titleize } from "@/lib/domain";

export const Route = createFileRoute("/order/$token")({ component: OrderPassPage });

type PublicOrder = {
  order_number: string;
  client_name: string;
  group_name: string | null;
  total: number;
  paid: number;
  payment_status: string;
  production_status: string;
  delivered_at: string | null;
  payment_pending: boolean;
  pending_amount: number;
};

async function fetchOrder(token: string): Promise<PublicOrder> {
  const db = supabase as any;
  const result = await db.rpc("get_public_order_v2", { _public_token: token });
  if (result.error) throw result.error;
  const row = result.data?.[0];
  if (!row) throw new Error("Order Pass not found.");
  return { ...row, total: Number(row.total), paid: Number(row.paid), pending_amount: Number(row.pending_amount) };
}

function OrderPassPage() {
  const { token } = Route.useParams();
  const { data, isLoading, error } = useQuery({ queryKey: ["order-pass", token], queryFn: () => fetchOrder(token), refetchInterval: 15_000 });

  if (isLoading) return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Checking your Order Pass…</div>;
  if (error || !data) return <div className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground"><div><h1 className="font-display text-3xl font-extrabold">Order Pass unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : "This order could not be found."}</p></div></div>;

  const balance = Math.max(0, data.total - data.paid);
  const paymentLabel = data.payment_pending ? "Payment submitted · for verification" : data.payment_status === "paid" ? "Payment verified" : balance > 0 ? `Balance due: ${peso(balance)}` : "Payment complete";
  const productionLabel = data.production_status === "delivered" ? "Order received" : data.production_status === "ready" ? "Ready for pickup" : titleize(data.production_status);

  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground sm:py-12">
      <div className="mx-auto max-w-xl">
        <div className="mb-5 flex items-center justify-between"><div><p className="font-display text-lg font-extrabold">PhotoFlow</p><p className="text-[0.6rem] uppercase tracking-[.18em] text-muted-foreground">Order Pass</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> Live status</div></div>

        <section className="overflow-hidden rounded-2xl border border-primary/25 bg-card">
          <div className="border-b border-border bg-primary/[.045] p-6"><p className="eyebrow">{data.order_number}</p><h1 className="mt-2 font-display text-3xl font-extrabold">{data.client_name}</h1><p className="mt-1 text-sm text-muted-foreground">{data.group_name || "Class/group not set"}</p></div>
          <div className="grid gap-4 p-6 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">Order total</p><p className="mt-1 font-display text-2xl font-extrabold">{peso(data.total)}</p></div><div><p className="text-xs text-muted-foreground">Verified paid</p><p className="mt-1 font-display text-2xl font-extrabold">{peso(data.paid)}</p></div></div>
          <div className="border-t border-border p-6">
            <div className="flex gap-3 rounded-xl border border-border bg-muted/15 p-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{data.payment_pending ? <Clock3 className="size-5" /> : data.payment_status === "paid" ? <CheckCircle2 className="size-5" /> : <Clock3 className="size-5" />}</span><div><p className="font-semibold">Payment</p><p className="mt-1 text-sm text-muted-foreground">{paymentLabel}</p>{data.payment_pending ? <p className="mt-1 text-xs text-muted-foreground">Submitted amount: {peso(data.pending_amount)}</p> : null}</div></div>
            <div className="mt-3 flex gap-3 rounded-xl border border-border bg-muted/15 p-4"><span className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">{data.production_status === "delivered" ? <Truck className="size-5" /> : <PackageCheck className="size-5" />}</span><div><p className="font-semibold">Order status</p><p className="mt-1 text-sm text-muted-foreground">{productionLabel}</p></div></div>
          </div>
        </section>

        <p className="mt-5 text-center text-xs text-muted-foreground">Present this Order Pass at pickup.</p>
      </div>
    </div>
  );
}