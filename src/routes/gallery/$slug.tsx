import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, CreditCard, Image as ImageIcon, Minus, Plus, ShieldCheck, Upload, UserRoundCheck } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getGalleryPreviews } from "@/lib/gallery-preview.functions";
import { withTimeout } from "@/lib/async";
import type { EventGroupRow, EventRow, PackageRow, PhotoRow } from "@/lib/data";
import { peso } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gallery/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({
    batch: typeof search['batch'] === "string" ? search['batch'] : undefined,
    key: typeof search['key'] === "string" ? search['key'] : undefined,
    resume: typeof search['resume'] === "string" ? search['resume'] : undefined,
  }),
  component: ClientGalleryPage,
});

type GalleryData = {
  event: EventRow;
  groups: EventGroupRow[];
  selectedGroup: EventGroupRow | null;
  packages: PackageRow[];
  photos: PhotoRow[];
};

type Identity = {
  participant_id: string;
  participant_code: string;
  full_name: string;
  organization: string;
  contact_number: string;
  group_name: string;
  email: string;
};

type ClientOrder = { id: string; order_number: string; public_token: string; total: number };

async function fetchGallery(slug: string, batchId?: string, key?: string): Promise<GalleryData & { shareToken: string }> {
  const db = supabase as any;
  let shareToken = key;
  if (!shareToken && batchId) {
    const result = await db.rpc("get_share_token_for_group", { _event_slug: slug, _group_id: batchId });
    if (result.error) throw result.error;
    shareToken = result.data;
  }
  if (!shareToken) {
    const result = await db.rpc("get_share_token_for_event", { _event_slug: slug });
    if (result.error) throw result.error;
    shareToken = result.data;
  }
  if (!shareToken) throw new Error("Use the gallery link supplied by the studio.");
  const [galleryResult, packagesResult, photosResult] = await Promise.all([
    db.rpc("get_gallery_by_token", { _share_token: shareToken }),
    db.rpc("get_gallery_packages_by_token", { _share_token: shareToken }),
    db.rpc("get_gallery_photos_by_token", { _share_token: shareToken }),
  ]);
  if (galleryResult.error) throw galleryResult.error;
  if (packagesResult.error) throw packagesResult.error;
  if (photosResult.error) throw photosResult.error;
  const scope = galleryResult.data?.[0];
  if (!scope || scope.event_slug !== slug) throw new Error("Gallery unavailable.");
  const previewUrls = await getGalleryPreviews({ data: { shareToken } });
  const urls = new Map(previewUrls.map((preview) => [preview.id, preview.url]));
  const event = { id: scope.event_id, name: scope.event_name, slug: scope.event_slug,
    payment_instructions: scope.payment_instructions, ordering_deadline: scope.ordering_deadline,
    delivery_date: scope.delivery_date } as EventRow;
  const selectedGroup = scope.group_id ? { id: scope.group_id, name: scope.group_name } as EventGroupRow : null;
  const photos = (photosResult.data ?? []).map((photo: any) => ({ ...photo, url: urls.get(photo.id) ?? "", participant_id: photo.claimed ? "claimed" : null })) as PhotoRow[];
  return { event, groups: selectedGroup ? [selectedGroup] : [], selectedGroup, packages: (packagesResult.data ?? []) as PackageRow[], photos, shareToken };
}

function FramePreview({ src, label, framed, large = false }: { src?: string; label: string; framed: boolean; large?: boolean }) {
  return (
    <div className={cn("mx-auto w-full max-w-[220px]", large && "max-w-[280px]")}>
      <div className={cn("relative mx-auto bg-neutral-950 p-2 shadow-xl", framed ? "border-[10px] border-neutral-950 sm:border-[14px]" : "border border-border bg-white p-1")}>
        {src ? <img src={src} alt={label} className={cn("w-full object-cover", large ? "aspect-[4/3]" : "aspect-[3/4]")} /> : <div className={cn("grid w-full place-items-center bg-muted text-center text-xs text-muted-foreground", large ? "aspect-[4/3]" : "aspect-[3/4]")}><ImageIcon className="mb-2 size-6" />{label}</div>}
      </div>
      <p className="mt-2 text-center text-[0.65rem] text-muted-foreground">Mockup preview · actual crop may vary</p>
    </div>
  );
}

function ClientGalleryPage() {
  const { slug } = Route.useParams();
  const { batch, key, resume } = Route.useSearch();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["client-gallery-v4", slug, batch, key], queryFn: () => fetchGallery(slug, batch, key) });
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [identityForm, setIdentityForm] = useState({ full_name: "", organization: "", contact_number: "", email: "" });
  const [groupPackageId, setGroupPackageId] = useState<string | null>(null);
  const [addonQty, setAddonQty] = useState<Record<string, number>>({});
  const [order, setOrder] = useState<ClientOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("gcash");
  const [paymentPlan, setPaymentPlan] = useState<"half" | "full">("half");
  const [paymentReference, setPaymentReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [orderPaid, setOrderPaid] = useState(0);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [resumeToken, setResumeToken] = useState<string | null>(resume ?? null);
  const [resumePhoto, setResumePhoto] = useState<PhotoRow | null>(null);
  const paymentRequestId = useRef(crypto.randomUUID());

  const selectedPhoto = data?.photos.find((photo) => photo.id === selectedPhotoId) ?? resumePhoto;
  const availableSoloPhotos = useMemo(() => data?.photos.filter((photo) => photo.photo_type !== "group" && !photo.participant_id) ?? [], [data?.photos]);
  const groupPackages = useMemo(() => data?.packages.filter((item) => item.product_type === "group_package") ?? [], [data?.packages]);
  const soloAddons = useMemo(() => data?.packages.filter((item) => item.product_type === "solo_addon") ?? [], [data?.packages]);
  const selectedGroupPackage = groupPackages.find((item) => item.id === groupPackageId) ?? null;
  const matchedGroupPhoto = data?.photos.find((photo) => photo.photo_type === "group") ?? null;

  const estimatedTotal = useMemo(() => {
    const base = Number(selectedGroupPackage?.price ?? 0);
    return soloAddons.reduce((sum, addon) => sum + Number(addon.price) * (addonQty[addon.id] ?? 0), base);
  }, [addonQty, selectedGroupPackage?.price, soloAddons]);

  const paymentAmount = order ? Math.min(Math.max(0, order.total - orderPaid),
    paymentPlan === "half" ? Math.ceil(order.total * 0.5 * 100) / 100 : order.total) : 0;

  useEffect(() => {
    if (!order || typeof window === "undefined") return;
    QRCode.toDataURL(`${window.location.origin}/order/${order.public_token}`, { width: 360, margin: 1 }).then(setQrUrl).catch(() => setQrUrl(null));
  }, [order]);

  useEffect(() => {
    if (!data?.shareToken) return;
    const token = resume ?? localStorage.getItem(`photoflow.resume:${data.shareToken}`);
    if (!token) return;
    setResumeToken(token);
    let active = true;
    const restore = async () => {
      try {
        const db = supabase as any;
        const result = await db.rpc("get_client_session_v1", { _resume_token: token });
        if (result.error) throw result.error;
        const session = result.data?.[0];
        if (!session || session.share_token !== data.shareToken || !active) return;
        const previews = await getGalleryPreviews({ data: { resumeToken: token } });
        if (!active) return;
        setResumePhoto({ id: session.photo_id, url: previews[0]?.url ?? "", photo_type: "solo" } as PhotoRow);
        setSelectedPhotoId(session.photo_id);
        setIdentity({ participant_id: session.participant_id, participant_code: session.participant_code,
          full_name: session.full_name, organization: session.organization ?? "", contact_number: session.contact_number,
          email: session.email ?? "", group_name: session.group_name ?? "" });
        if (session.order_id) setOrder({ id: session.order_id, order_number: session.order_number,
          public_token: session.public_token, total: Number(session.total) });
        setOrderPaid(Number(session.paid ?? 0));
        setPaymentSubmitted(Boolean(session.payment_pending) || session.payment_status === "paid");
      } catch (error) { if (active) toast.error(error instanceof Error ? error.message : "Could not restore your order."); }
    };
    void restore();
    return () => { active = false; };
  }, [data?.shareToken, resume]);

  async function claimPortrait() {
    if (!data || !selectedPhoto) return;
    if (identityForm.full_name.trim().length < 2) return toast.error("Pakilagay ang buong pangalan mo.");
    if (identityForm.contact_number.trim().length < 7) return toast.error("Pakilagay ang contact number mo.");
    setSubmitting(true);
    try {
      const db = supabase as any;
      const result = await withTimeout(db.rpc("claim_solo_portrait_v4", {
        _share_token: data.shareToken,
        _photo_id: selectedPhoto.id,
        _full_name: identityForm.full_name.trim(),
        _organization: identityForm.organization.trim(),
        _contact_number: identityForm.contact_number.trim(),
        _email: identityForm.email.trim() || null,
      }), 15_000, "Hindi ma-save agad ang details. Pakisubukan ulit.");
      if (result.error) throw result.error;
      const claimed = result.data?.[0];
      if (!claimed) throw new Error("Could not create your gallery record.");
      setIdentity({ participant_id: claimed.participant_id, participant_code: claimed.participant_code, group_name: claimed.group_name ?? data.selectedGroup?.name ?? "", ...identityForm });
      setResumeToken(claimed.resume_token);
      setResumePhoto(selectedPhoto);
      localStorage.setItem(`photoflow.resume:${data.shareToken}`, claimed.resume_token);
      const url = new URL(window.location.href);
      url.searchParams.set("resume", claimed.resume_token);
      window.history.replaceState(null, "", url);
      toast.success("Salamat! Nakilala na namin ang photo mo.");
      await withTimeout(refetch(), 12_000, "Na-save na ang details pero mabagal ang gallery refresh.");
    } catch (claimError) {
      toast.error(claimError instanceof Error ? claimError.message : "Hindi ma-save ang details mo.");
    } finally {
      setSubmitting(false);
    }
  }

  function updateAddon(id: string, delta: number) {
    setAddonQty((current) => ({ ...current, [id]: Math.max(0, Math.min(10, (current[id] ?? 0) + delta)) }));
  }

  async function submitOrder() {
    if (!data || !identity || !selectedPhoto || !selectedGroupPackage || !resumeToken) return;
    setSubmitting(true);
    try {
      const addons = soloAddons.filter((item) => (addonQty[item.id] ?? 0) > 0).map((item) => ({ package_id: item.id, quantity: addonQty[item.id] }));
      const db = supabase as any;
      const result = await withTimeout(db.rpc("submit_client_order_v4", {
        _resume_token: resumeToken,
        _group_package_id: selectedGroupPackage.id,
        _solo_addons: addons,
      }), 15_000, "Matagal ang order submission. Pakisubukan ulit.");
      if (result.error) throw result.error;
      const created = result.data?.[0];
      if (!created) throw new Error("Order could not be created.");
      setOrder({ id: created.order_id, order_number: created.order_number, public_token: created.public_token, total: Number(created.total) });
      setOrderPaid(0);
      toast.success("Salamat! Natanggap na namin ang order mo.");
    } catch (submitError) {
      toast.error(submitError instanceof Error ? submitError.message : "Hindi ma-submit ang order mo.");
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPayment() {
    if (!order) return;
    if (paymentAmount <= 0) return toast.error("Wala nang balance para bayaran.");
    if (paymentMethod === "cash") {
      setPaymentSubmitted(true);
      toast.success("Okay lang. Maaari kang magbayad ng cash bago kunin ang order mo.");
      return;
    }
    setSubmitting(true);
    try {
      let proofPath: string | null = null;
      if (proofFile) {
        const ext = proofFile.name.split(".").pop() || "jpg";
        proofPath = `${order.public_token}/${crypto.randomUUID()}.${ext.replace(/[^a-zA-Z0-9]/g, "")}`;
        const upload = await withTimeout(
          supabase.storage.from("payment-proofs").upload(proofPath, proofFile, { upsert: false, contentType: proofFile.type || undefined }),
          30_000,
          "Matagal ang screenshot upload. Pakisubukan ulit.",
        );
        if (upload.error) throw upload.error;
      }
      const db = supabase as any;
      const result = await withTimeout(
        db.rpc("submit_client_payment_v3", { _public_token: order.public_token, _method: paymentMethod, _amount: paymentAmount, _reference: paymentReference.trim() || null, _proof_path: proofPath, _client_request_id: paymentRequestId.current }),
        15_000,
        "Matagal ang payment submission. Pakisubukan ulit.",
      );
      if (result.error) throw result.error;
      setPaymentSubmitted(true);
      paymentRequestId.current = crypto.randomUUID();
      toast.success("Nakuha na namin ang payment details mo. Iche-check namin ito.");
    } catch (paymentError) {
      toast.error(paymentError instanceof Error ? paymentError.message : "Hindi ma-submit ang payment details.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">Inihahanda ang gallery…</div>;
  if (error || !data) return <div className="grid min-h-screen place-items-center bg-background p-6 text-center"><div><h1 className="font-display text-3xl font-extrabold">Gallery unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : "Hindi makita ang event gallery."}</p></div></div>;

  const needsBatchLink = data.groups.length > 0 && !data.selectedGroup;
  if (needsBatchLink) {
    return <div className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground"><div className="max-w-lg"><ShieldCheck className="mx-auto size-9 text-primary" /><h1 className="mt-4 font-display text-3xl font-extrabold">Gamitin ang gallery link ng batch mo.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Ang event na ito ay may hiwa-hiwalay na class/batch galleries. Pakibuksan ang exact link na ipinadala ng Misantio Studio para makita mo lang ang photos ng batch ninyo.</p></div></div>;
  }

  const batchName = data.selectedGroup?.name ?? "Event gallery";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/95 backdrop-blur"><div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-5"><div><p className="font-display text-lg font-extrabold">PhotoFlow</p><p className="text-[0.6rem] uppercase tracking-[.18em] text-muted-foreground">by Misantio Studio</p></div><div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> {batchName}</div></div></header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-5 sm:py-10">
        {!selectedPhoto ? (
          <section>
            <div className="mx-auto max-w-2xl text-center"><p className="eyebrow mx-auto w-fit">{data.event.name} · {batchName}</p><h1 className="mt-4 font-display text-4xl font-extrabold tracking-[-.045em] sm:text-6xl">Hanapin ang photo mo.</h1><p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Nasa gallery na ito ang photos para sa batch/class ninyo. Piliin mo lang ang solo portrait mo—hindi mo na kailangang alamin o i-type ang batch mo.</p></div>
            {availableSoloPhotos.length ? <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">{availableSoloPhotos.map((photo) => <button key={photo.id} onClick={() => setSelectedPhotoId(photo.id)} className="group overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary/40"><img src={photo.url} alt="Event portrait" className="aspect-[3/4] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" /><div className="p-2 text-left"><p className="text-xs font-semibold">Ito ba ikaw?</p><p className="mt-0.5 truncate text-[0.62rem] text-muted-foreground">Tap to continue</p></div></button>)}</div> : <div className="mx-auto mt-10 max-w-xl rounded-xl border border-dashed border-border p-10 text-center"><UserRoundCheck className="mx-auto size-8 text-primary" /><h2 className="mt-3 font-display text-xl font-extrabold">Wala pang available na solo portrait</h2><p className="mt-2 text-sm text-muted-foreground">Maaaring ina-upload o inaayos pa ng studio ang {batchName} gallery.</p></div>}
          </section>
        ) : !identity ? (
          <section className="mx-auto max-w-4xl">
            <button onClick={() => setSelectedPhotoId(null)} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Pumili ng ibang photo</button>
            <div className="mt-5 grid gap-6 lg:grid-cols-[300px_1fr]">
              <div><img src={selectedPhoto.url} alt="Selected portrait" className="mx-auto aspect-[3/4] w-full max-w-[280px] rounded-xl border border-primary/30 object-cover" /><p className="mt-3 text-center text-sm font-semibold">Napili mong solo portrait</p></div>
              <div className="rounded-xl border border-border bg-card p-5 sm:p-7"><p className="eyebrow">Ito ako · {batchName}</p><h1 className="mt-1 font-display text-3xl font-extrabold">Kaunting details lang.</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Batch/class mo ay naka-set na mula sa gallery link. Pangalan, congregation at contact na lang ang kailangan.</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2"><label className="grid gap-1.5"><Label>Buong pangalan</Label><Input value={identityForm.full_name} onChange={(event) => setIdentityForm({ ...identityForm, full_name: event.target.value })} /></label><label className="grid gap-1.5"><Label>Congregation</Label><Input value={identityForm.organization} onChange={(event) => setIdentityForm({ ...identityForm, organization: event.target.value })} /></label><label className="grid gap-1.5"><Label>Contact number</Label><Input inputMode="tel" value={identityForm.contact_number} onChange={(event) => setIdentityForm({ ...identityForm, contact_number: event.target.value })} /></label><label className="grid gap-1.5"><Label>Email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input type="email" value={identityForm.email} onChange={(event) => setIdentityForm({ ...identityForm, email: event.target.value })} /></label></div>
                <Button className="mt-6" size="lg" onClick={() => void claimPortrait()} disabled={submitting}>{submitting ? "Sine-save…" : "Tama, ito ako"} <Check className="size-4" /></Button>
              </div>
            </div>
          </section>
        ) : order ? (
          <section className="mx-auto max-w-3xl">
            <div className="rounded-xl border border-primary/25 bg-primary/[0.045] p-5 sm:p-8"><div className="flex items-start gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Check className="size-5" /></span><div><p className="eyebrow">Order received</p><h1 className="mt-1 font-display text-3xl font-extrabold">Salamat, {identity.full_name.split(" ")[0]}!</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Nasa amin na ang order mo. I-save ang Order Pass para mabilis namin itong mahanap sa release.</p></div></div><div className="mt-6 grid gap-5 border-t border-border pt-5 sm:grid-cols-[1fr_180px]"><div className="grid grid-cols-2 gap-4 text-sm"><div><p className="text-xs text-muted-foreground">Order no.</p><p className="mt-1 font-mono font-semibold">{order.order_number}</p></div><div><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-semibold">{peso(order.total)}</p></div><div><p className="text-xs text-muted-foreground">Batch / Class</p><p className="mt-1 font-semibold">{identity.group_name || batchName}</p></div><div><p className="text-xs text-muted-foreground">Payment</p><p className="mt-1 font-semibold">{paymentSubmitted ? (paymentMethod === "cash" ? "Cash on pickup" : "For verification") : "Not submitted yet"}</p></div></div>{qrUrl ? <div className="rounded-lg bg-white p-2"><img src={qrUrl} alt="Order Pass QR" className="w-full" /></div> : null}</div></div>

            <div className="mt-5 rounded-xl border border-border bg-card p-5 sm:p-7"><div className="flex items-center gap-2"><CreditCard className="size-4 text-primary" /><h2 className="font-display text-xl font-extrabold">Payment</h2></div><p className="mt-2 text-sm text-muted-foreground">Piliin lang kung ano ang pinaka-convenient sa iyo. Maaari kang mag-50% muna o full payment.</p><div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 text-sm whitespace-pre-wrap">{data.event.payment_instructions || "Makipag-ugnayan sa studio para sa GCash / Maya details."}</div>
              {paymentSubmitted ? <div className="mt-4 rounded-lg border border-success/25 bg-success/10 p-4 text-sm text-success">{paymentMethod === "cash" ? "Okay lang—cash payment can be settled before release." : "Nakuha na namin ang payment details mo. Iche-check namin ito at mag-u-update ang status ng Order Pass pagkatapos ma-verify."}</div> : <div className="mt-5 grid gap-4"><div className="grid gap-2 sm:grid-cols-2"><button onClick={() => setPaymentPlan("half")} className={cn("rounded-lg border p-4 text-left", paymentPlan === "half" ? "border-primary bg-primary/5" : "border-border")}><p className="font-semibold">50% muna</p><p className="mt-1 font-display text-2xl font-extrabold">{peso(Math.ceil(order.total * 0.5 * 100) / 100)}</p></button><button onClick={() => setPaymentPlan("full")} className={cn("rounded-lg border p-4 text-left", paymentPlan === "full" ? "border-primary bg-primary/5" : "border-border")}><p className="font-semibold">Full payment</p><p className="mt-1 font-display text-2xl font-extrabold">{peso(order.total)}</p></button></div><label className="grid gap-1.5"><Label>Payment method</Label><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="gcash">GCash</option><option value="maya">Maya</option><option value="cash">Cash / pay before pickup</option><option value="bank">Bank transfer</option><option value="other">Other</option></select></label>{paymentMethod !== "cash" ? <><label className="grid gap-1.5"><Label>Reference number <span className="font-normal text-muted-foreground">(optional if screenshot is uploaded)</span></Label><Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label><label className="grid gap-1.5"><Label>Payment screenshot</Label><Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} /></label></> : null}<Button size="lg" onClick={() => void submitPayment()} disabled={submitting}>{submitting ? "Sine-send…" : paymentMethod === "cash" ? "Cash ang payment ko" : `Submit ${peso(paymentAmount)} payment details`} <Upload className="size-4" /></Button></div>}
            </div>
          </section>
        ) : (
          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="eyebrow">{identity.participant_code}</p><h1 className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">Hi, {identity.full_name.split(" ")[0]}.</h1><p className="mt-1 text-sm text-muted-foreground">Batch / Class: <span className="font-semibold text-foreground">{identity.group_name || batchName}</span></p></div><div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><UserRoundCheck className="size-4 text-primary" /> Solo portrait identified</div></div>

            <section className="mt-8"><p className="eyebrow">Step 1 · Primary order</p><h2 className="mt-1 font-display text-2xl font-extrabold">Piliin ang class/group package mo</h2><p className="mt-2 text-sm text-muted-foreground">Automatic nang naka-match sa official {identity.group_name || batchName} group photo.</p><div className="mt-5 grid gap-4 lg:grid-cols-[280px_1fr]"><div className="rounded-xl border border-border bg-card p-4"><FramePreview src={matchedGroupPhoto?.url} label={`Official ${identity.group_name || batchName} group photo`} framed={selectedGroupPackage?.framed ?? false} large /><p className="mt-3 text-center text-xs text-muted-foreground">{matchedGroupPhoto ? "Matched official class photo" : "The studio can upload the official group photo later."}</p></div><div>{groupPackages.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{groupPackages.map((item) => <button key={item.id} onClick={() => setGroupPackageId(item.id)} className={cn("rounded-xl border p-5 text-left transition", groupPackageId === item.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/30")}><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{item.code || "Class package"}</p><p className="mt-2 font-semibold">{item.name}</p><p className="mt-3 font-display text-3xl font-extrabold">{peso(item.price)}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.quantity} × {item.print_size}{item.framed ? " · Black frame" : " · Print only"}</p></button>)}</div> : <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">Wala pang active class packages.</div>}</div></div></section>

            {selectedGroupPackage ? <section className="mt-10 border-t border-border pt-8"><p className="eyebrow">Step 2 · Optional</p><h2 className="mt-1 font-display text-2xl font-extrabold">Gusto mo ring magdagdag ng solo portrait?</h2><p className="mt-2 text-sm text-muted-foreground">Optional lang. Ang napili mong solo photo ang gagamitin sa add-ons.</p><div className="mt-5 grid gap-5 lg:grid-cols-[240px_1fr]"><div className="rounded-xl border border-border bg-card p-4"><FramePreview src={selectedPhoto.url} label="Your solo portrait" framed={soloAddons.some((item) => item.framed && (addonQty[item.id] ?? 0) > 0)} /></div><div>{soloAddons.length ? <div className="grid gap-3 sm:grid-cols-2">{soloAddons.map((item) => { const qty = addonQty[item.id] ?? 0; return <div key={item.id} className={cn("rounded-xl border p-4", qty > 0 ? "border-primary/40 bg-primary/5" : "border-border bg-card")}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{item.name}</p><p className="mt-1 text-xs text-muted-foreground">{item.print_size}{item.framed ? " · with frame" : " · print"}</p></div><p className="font-bold">{peso(item.price)}</p></div><div className="mt-4 flex items-center gap-2"><Button size="icon" variant="outline" onClick={() => updateAddon(item.id, -1)} disabled={!qty}><Minus className="size-4" /></Button><span className="min-w-8 text-center font-bold">{qty}</span><Button size="icon" variant="outline" onClick={() => updateAddon(item.id, 1)}><Plus className="size-4" /></Button></div></div>; })}</div> : <p className="text-sm text-muted-foreground">Wala pang solo add-ons.</p>}</div></div></section> : null}

            {selectedGroupPackage ? <div className="sticky bottom-4 mt-8 flex flex-col gap-3 rounded-xl border border-border bg-background/95 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Order total</p><p className="font-display text-2xl font-extrabold">{peso(estimatedTotal)}</p></div><Button size="lg" onClick={() => void submitOrder()} disabled={submitting}>{submitting ? "Sine-submit…" : "Confirm order"} <Check className="size-4" /></Button></div> : null}
          </section>
        )}
      </main>
    </div>
  );
}
