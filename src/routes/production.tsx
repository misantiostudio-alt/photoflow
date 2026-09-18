import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, FileImage, Image as ImageIcon, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { findParticipant, findPhoto, useOps, useSession } from "@/lib/data";
import { FINAL_QC_CHECKLIST, FRAME_QC_CHECKLIST, PRINT_QC_CHECKLIST, PRODUCTION_STAGES, paymentTone, productionTone, stageIndex, titleize } from "@/lib/domain";

export const Route = createFileRoute("/production")({ component: ProductionPage });

function checklistFor(stage: string) {
  if (stage === "print_qc") return PRINT_QC_CHECKLIST;
  if (stage === "frame_qc") return FRAME_QC_CHECKLIST;
  if (stage === "final_check") return FINAL_QC_CHECKLIST;
  return [] as readonly string[];
}

function ProductionPage() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();
  const navigate = useNavigate();
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!data?.photos.length || !email) return;
    let active = true;
    void Promise.all(data.photos.map(async (photo) => {
      if (!photo.storage_path) return [photo.id, photo.url] as const;
      const { data: signed, error } = await supabase.storage.from("event-photos")
        .createSignedUrl(photo.storage_path, 15 * 60, { transform: { width: 600, quality: 75 } });
      return [photo.id, error ? "" : signed?.signedUrl ?? ""] as const;
    })).then((entries) => { if (active) setPhotoUrls(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [data?.photos, email]);

  if (isLoading || !data) return <AppShell><PageHeader eyebrow="Production" title="Production & QC" /><LoadingGrid rows={6} /></AppShell>;

  function requireStaff() {
    if (email) return true;
    void navigate({ to: "/auth" });
    return false;
  }

  async function toggleCheck(orderId: string, stage: string, item: string, checked: boolean) {
    if (!requireStaff()) return;
    const expected = checklistFor(stage);
    const existing = data.checks.find((check) => check.order_id === orderId && check.stage === stage);
    const nextChecklist = { ...(existing?.checklist ?? {}), [item]: checked };
    const completed = expected.length > 0 && expected.every((label) => nextChecklist[label] === true);
    setBusyOrder(orderId);
    try {
      const payload = { checklist: nextChecklist, completed, checked_by: email, completed_at: completed ? new Date().toISOString() : null };
      const result = await withTimeout(
        existing
          ? supabase.from("production_checks").update(payload).eq("id", existing.id)
          : supabase.from("production_checks").insert({ order_id: orderId, stage, ...payload }),
        12_000,
        "QC save timed out. Please try again.",
      );
      if (result.error) throw result.error;
      await withTimeout(refetch(), 12_000, "QC saved, but the production refresh took too long.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "QC could not be saved.");
    } finally {
      setBusyOrder(null);
    }
  }

  async function advance(orderId: string, current: string, hasFramedItems: boolean) {
    if (!requireStaff()) return;
    const expected = checklistFor(current);
    const check = data.checks.find((item) => item.order_id === orderId && item.stage === current);
    if (expected.length && !expected.every((label) => check?.checklist?.[label] === true)) return toast.error("Complete every QC item before moving this order to the next stage.");
    if (["ready", "delivered", "cancelled"].includes(current)) return;
    const currentIndex = stageIndex(current);
    if (currentIndex < 0) return toast.error("This order has an invalid production stage.");
    let next: string = PRODUCTION_STAGES[Math.min(currentIndex + 1, PRODUCTION_STAGES.length - 1)].key;
    if (current === "print_qc" && !hasFramedItems) next = "final_check";
    setBusyOrder(orderId);
    try {
      const { error } = await withTimeout(
        supabase.from("orders").update({ production_status: next }).eq("id", orderId),
        12_000,
        "Production stage update timed out.",
      );
      if (error) throw error;
      toast.success(`Moved to ${titleize(next)}`);
      await withTimeout(refetch(), 12_000, "Production update saved, but refresh took too long.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Production stage could not be updated.");
    } finally {
      setBusyOrder(null);
    }
  }

  const orders = data.orders.filter((order) => order.status !== "cancelled" && order.production_status !== "delivered");

  return (
    <AppShell>
      <PageHeader eyebrow={data.event?.name ?? "Production"} title="Production" description="Class/group photos and solo add-ons stay visually separate while moving through one print, frame and QC workflow." />
      {!data.event ? <EmptyState title="No event selected" description="Select an event before operating production." action={<Button asChild><Link to="/events">Open Events</Link></Button>} /> : !orders.length ? <EmptyState title="Production queue is clear" description="New confirmed orders will enter the production workflow here." /> : (
        <div className="grid gap-4">
          {orders.map((order) => {
            const participant = findParticipant(data, order.participant_id);
            const items = data.orderItems.filter((item) => item.order_id === order.id);
            const expected = checklistFor(order.production_status);
            const check = data.checks.find((item) => item.order_id === order.id && item.stage === order.production_status);
            const complete = !expected.length || expected.every((label) => check?.checklist?.[label] === true);
            const hasFramedItems = items.some((item) => item.framed);
            const isBusy = busyOrder === order.id;

            return (
              <Panel key={order.id} title={participant?.full_name ?? order.order_number} description={`${order.order_number} · ${participant?.batch ?? "Class/group not set"}`} actions={<div className="flex gap-2"><StatusPill label={order.payment_status} tone={paymentTone(order.payment_status)} /><StatusPill label={order.production_status} tone={productionTone(order.production_status)} /></div>}>
                <div className="grid gap-5 xl:grid-cols-[1fr_330px]">
                  <div>
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {items.map((item) => {
                        const photo = findPhoto(data, item.photo_id);
                        const isGroup = item.kind === "group_package";
                        return <div key={item.id} className="overflow-hidden rounded-lg border border-border bg-muted/10"><div className="relative">{photo ? <img src={photoUrls[photo.id] ?? ""} alt={item.label} className={isGroup ? "aspect-[4/3] w-full object-cover" : "aspect-[3/4] w-full object-cover"} /> : <div className={isGroup ? "grid aspect-[4/3] place-items-center bg-muted" : "grid aspect-[3/4] place-items-center bg-muted"}><FileImage className="size-7 text-muted-foreground" /></div>}<span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/75 px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[.1em] text-white">{isGroup ? <UsersRound className="size-3" /> : <ImageIcon className="size-3" />}{isGroup ? "Class" : "Solo"}</span></div><div className="p-3"><p className="text-sm font-semibold">{item.label}</p><p className="mt-1 text-xs text-muted-foreground">{item.quantity} × {item.print_size ?? "Print"}{item.framed ? " · Frame" : " · Print only"}</p>{isGroup && !photo ? <p className="mt-2 text-xs text-warning">Official group photo not matched yet. Check the client class/group label.</p> : null}</div></div>;
                      })}
                    </div>

                    {expected.length ? <div className="mt-4 overflow-hidden rounded-lg border border-border">{expected.map((item) => { const checked = check?.checklist?.[item] === true; return <label key={item} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-3 text-sm last:border-b-0 hover:bg-muted/20"><Checkbox checked={checked} disabled={isBusy} onCheckedChange={(value) => void toggleCheck(order.id, order.production_status, item, value === true)} /><span className={checked ? "text-muted-foreground line-through" : ""}>{item}</span></label>; })}</div> : <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 text-sm text-muted-foreground">No checklist is required for this stage. Confirm the work, then continue.</div>}
                  </div>

                  <div className="flex flex-col justify-end gap-2 rounded-lg border border-border bg-muted/15 p-4"><p className="text-[0.65rem] font-bold uppercase tracking-[.14em] text-muted-foreground">Stage completion</p><p className="text-sm">{expected.length ? `${expected.filter((item) => check?.checklist?.[item] === true).length} / ${expected.length} checks completed` : "Ready to move forward"}</p>{order.production_status === "ready" ? <Button asChild><Link to="/release">Open Release Desk</Link></Button> : <Button disabled={isBusy || !complete} onClick={() => void advance(order.id, order.production_status, hasFramedItems)}><Check className="size-4" /> {isBusy ? "Saving…" : `Complete ${titleize(order.production_status)}`}</Button>}{!complete ? <p className="text-xs text-warning">Finish the QC checklist first.</p> : null}</div>
                </div>
              </Panel>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
