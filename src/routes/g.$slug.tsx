import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, Copy, CreditCard, Download, Image as ImageIcon, Minus, Plus, ShieldCheck, Upload, UserRoundCheck, UsersRound } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { publicAppUrl } from "@/lib/public-url";
import { parsePaymentProfile, type PaymentProfile } from "@/lib/payment-profile";
import type { EventGroupRow, EventRow, PackageRow, PhotoRow } from "@/lib/data";
import { peso } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/g/$slug")({
  validateSearch: (search: Record<string, unknown>) => ({ batch: typeof search.batch === "string" ? search.batch : undefined }),
  component: ClientGalleryPage,
});

type GalleryData = {
  event: EventRow;
  groups: EventGroupRow[];
  selectedGroup: EventGroupRow | null;
  packages: PackageRow[];
  photos: PhotoRow[];
  shareToken: string;
  paymentProfile: PaymentProfile;
};

type Identity = {
  participant_id: string;
  participant_code: string;
  full_name: string;
  organization: string;
  contact_number: string;
  group_name: string;
  email: string;
  resume_token: string;
};

type OrderPerson = {
  identity: Identity;
  photoId: string;
  photoUrl: string;
};

type ClientOrder = { id: string; order_number: string; public_token: string; total: number };
type FrameColor = "black" | "white" | "brown";

type ClientDraft = {
  version: 2;
  eventId: string;
  resumeToken: string;
  groupPackageId: string | null;
  addonQty: Record<string, Record<string, number>>;
  groupFrameColor?: FrameColor;
  addonFrameColors?: Record<string, Record<string, FrameColor>>;
};

async function fetchGallery(slug: string, batchId?: string): Promise<GalleryData> {
  const db = supabase as any;

  const tokenResult = batchId
    ? await db.rpc("get_share_token_for_group", { _event_slug: slug, _group_id: batchId })
    : await db.rpc("get_share_token_for_event", { _event_slug: slug });

  if (tokenResult.error) throw tokenResult.error;
  const shareToken = tokenResult.data ? String(tokenResult.data) : "";
  if (!shareToken) {
    throw new Error(batchId
      ? "This class gallery link is not available."
      : "Please use the gallery link sent by Misantio Studio.");
  }

  const [galleryResult, packagesResult, photosResult] = await Promise.all([
    db.rpc("get_gallery_by_token", { _share_token: shareToken }),
    db.rpc("get_gallery_packages_by_token", { _share_token: shareToken }),
    db.rpc("get_gallery_photos_by_token", { _share_token: shareToken }),
  ]);

  if (galleryResult.error) throw galleryResult.error;
  if (packagesResult.error) throw packagesResult.error;
  if (photosResult.error) throw photosResult.error;

  const gallery = galleryResult.data?.[0];
  if (!gallery) throw new Error("This gallery is not available.");
  const paymentProfile = parsePaymentProfile(gallery.payment_instructions);

  const publicPhotoUrl = (pathValue: string | null | undefined) => {
    const path = String(pathValue ?? "");
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return supabase.storage.from("event-photos").getPublicUrl(path).data.publicUrl;
  };

  const event = {
    id: gallery.event_id,
    name: gallery.event_name,
    slug: gallery.event_slug,
    event_type: "School",
    event_date: null,
    venue: null,
    description: null,
    status: "active",
    id_prefix: "EVT",
    ordering_deadline: gallery.ordering_deadline ?? null,
    delivery_date: gallery.delivery_date ?? null,
    payment_instructions: paymentProfile.notes || null,
    created_at: "",
    updated_at: "",
  } as EventRow;

  const selectedGroup = gallery.group_id ? {
    id: gallery.group_id,
    event_id: gallery.event_id,
    name: gallery.group_name ?? "Class",
    sort_order: 0,
    active: true,
    share_token: shareToken,
    created_at: "",
  } as EventGroupRow : null;

  const packages = (packagesResult.data ?? []).map((item: any) => ({
    id: item.id,
    event_id: gallery.event_id,
    name: item.name,
    code: item.code ?? null,
    product_type: item.product_type,
    price: Number(item.price),
    print_size: item.print_size,
    quantity: Number(item.quantity),
    framed: Boolean(item.framed),
    digital_copy: Boolean(item.digital_copy),
    description: item.description ?? null,
    sort_order: Number(item.sort_order ?? 0),
    active: true,
    created_at: "",
    updated_at: "",
  })) as PackageRow[];

  const photos = (photosResult.data ?? []).map((item: any) => {
    const url = publicPhotoUrl(item.storage_path);
    return {
      id: item.id,
      event_id: gallery.event_id,
      event_group_id: gallery.group_id ?? null,
      participant_id: item.claimed ? "claimed" : null,
      url,
      file_name: null,
      is_separator: false,
      favorite: false,
      sort_order: Number(item.sort_order ?? 0),
      photo_type: item.photo_type,
      group_name: gallery.group_name ?? gallery.event_name,
      album_id: null,
      storage_path: item.storage_path ?? null,
      original_path: null,
      preview_path: null,
      thumbnail_path: null,
      thumbnail_url: url,
      content_hash: null,
      original_size: null,
      width: null,
      height: null,
    } as PhotoRow;
  });

  return {
    event,
    groups: selectedGroup ? [selectedGroup] : [],
    selectedGroup,
    packages,
    photos,
    shareToken,
    paymentProfile,
  };
}

const FRAME_OPTIONS: Array<{ value: FrameColor; label: string; swatch: string }> = [
  { value: "black", label: "Black", swatch: "#111214" },
  { value: "white", label: "White", swatch: "#f1f1ed" },
  { value: "brown", label: "Brown", swatch: "#6b422a" },
];

function frameGradient(color: FrameColor) {
  if (color === "white") return "linear-gradient(135deg,#ffffff 0%,#d9d9d4 35%,#fafaf7 58%,#c9c9c3 100%)";
  if (color === "brown") return "linear-gradient(135deg,#3f2418 0%,#7a4b2f 30%,#4c2b1d 58%,#936241 100%)";
  return "linear-gradient(135deg,#050607 0%,#303236 30%,#0b0c0e 60%,#24262a 100%)";
}

function FramePreview({
  src,
  label,
  framed,
  large = false,
  frameColor = "black",
}: {
  src?: string;
  label: string;
  framed: boolean;
  large?: boolean;
  frameColor?: FrameColor;
}) {
  const imageAspect = large ? "aspect-[4/3]" : "aspect-[3/4]";

  if (!framed) {
    return (
      <div className={cn("mx-auto w-full max-w-[220px]", large && "max-w-[300px]")}>
        <div className="bg-[#f7f4ee] p-2 shadow-[0_18px_40px_rgba(0,0,0,.28)] ring-1 ring-black/10">
          {src
            ? <img src={src} alt={label} className={cn("w-full object-cover", imageAspect)} />
            : <div className={cn("grid w-full place-items-center bg-muted text-center text-xs text-muted-foreground", imageAspect)}><ImageIcon className="mb-2 size-6" />{label}</div>}
        </div>
        <p className="mt-2 text-center text-[0.65rem] text-muted-foreground">Print preview · actual crop may vary slightly</p>
      </div>
    );
  }

  return (
    <div className={cn("mx-auto w-full max-w-[230px]", large && "max-w-[320px]")}>
      <div
        className="relative p-[12px] shadow-[0_22px_55px_rgba(0,0,0,.42)] sm:p-[16px]"
        style={{
          background: frameGradient(frameColor),
          boxShadow: "0 22px 55px rgba(0,0,0,.42), inset 0 0 0 1px rgba(255,255,255,.16), inset 0 0 0 3px rgba(0,0,0,.28)",
        }}
      >
        <div className="bg-[#f3efe5] p-[8%] shadow-[inset_0_0_0_1px_rgba(80,70,55,.18)]">
          <div className="overflow-hidden bg-white shadow-[0_2px_8px_rgba(0,0,0,.16)] ring-1 ring-black/10">
            {src
              ? <img src={src} alt={label} className={cn("w-full object-cover", imageAspect)} />
              : <div className={cn("grid w-full place-items-center bg-muted text-center text-xs text-muted-foreground", imageAspect)}><ImageIcon className="mb-2 size-6" />{label}</div>}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-[5px] border border-white/10" />
        <div className="pointer-events-none absolute inset-x-[14%] top-[5px] h-px bg-white/20" />
      </div>
      <div className="mt-2 flex items-center justify-center gap-1.5 text-[0.65rem] text-muted-foreground">
        <span className="size-2 rounded-full border border-border" style={{ background: FRAME_OPTIONS.find((item) => item.value === frameColor)?.swatch }} />
        {FRAME_OPTIONS.find((item) => item.value === frameColor)?.label} frame · white mat board
      </div>
    </div>
  );
}

function FrameColorPicker({
  value,
  onChange,
  compact = false,
}: {
  value: FrameColor;
  onChange: (value: FrameColor) => void;
  compact?: boolean;
}) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-3" : "sm:grid-cols-3")}>
      {FRAME_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "flex items-center gap-2 rounded-lg border text-left transition",
            compact ? "px-2.5 py-2 text-[0.68rem]" : "px-3 py-3 text-xs",
            value === option.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-background hover:border-primary/30",
          )}
        >
          <span className="size-5 shrink-0 rounded-md border border-black/15 shadow-inner" style={{ background: option.swatch }} />
          <span className="font-semibold">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function ClientGalleryPage() {
  const { slug } = Route.useParams();
  const { batch } = Route.useSearch();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["client-gallery-v4", slug, batch],
    queryFn: () => fetchGallery(slug, batch),
  });

  const draftRestoredRef = useRef(false);
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [selectedPhotoSnapshot, setSelectedPhotoSnapshot] = useState<PhotoRow | null>(null);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [resumeLoading, setResumeLoading] = useState(false);
  const [claimErrorMessage, setClaimErrorMessage] = useState<string | null>(null);
  const [identityForm, setIdentityForm] = useState({ full_name: "", organization: "", contact_number: "", email: "" });
  const [people, setPeople] = useState<OrderPerson[]>([]);

  const [groupPackageId, setGroupPackageId] = useState<string | null>(null);
  const [groupFrameColor, setGroupFrameColor] = useState<FrameColor>("black");
  const [addonQty, setAddonQty] = useState<Record<string, Record<string, number>>>({});
  const [addonFrameColors, setAddonFrameColors] = useState<Record<string, Record<string, FrameColor>>>({});

  const [order, setOrder] = useState<ClientOrder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("gcash");
  const [paymentPlan, setPaymentPlan] = useState<"half" | "full">("half");
  const [paymentReference, setPaymentReference] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  const selectedPhoto = data?.photos.find((photo) => photo.id === selectedPhotoId) ?? selectedPhotoSnapshot;
  const claimedPhotoIds = useMemo(() => new Set(people.map((person) => person.photoId)), [people]);
  const availableSoloPhotos = useMemo(
    () => data?.photos.filter((photo) => photo.photo_type !== "group" && !photo.participant_id && !claimedPhotoIds.has(photo.id)) ?? [],
    [claimedPhotoIds, data?.photos],
  );
  const groupPackages = useMemo(() => data?.packages.filter((item) => item.product_type === "group_package") ?? [], [data?.packages]);
  const soloAddons = useMemo(() => data?.packages.filter((item) => item.product_type === "solo_addon") ?? [], [data?.packages]);
  const selectedGroupPackage = groupPackages.find((item) => item.id === groupPackageId) ?? null;
  const matchedGroupPhoto = data?.photos.find((photo) => photo.photo_type === "group") ?? null;

  const estimatedTotal = useMemo(() => {
    let total = Number(selectedGroupPackage?.price ?? 0);
    for (const person of people) {
      for (const addon of soloAddons) {
        total += Number(addon.price) * (addonQty[person.identity.participant_id]?.[addon.id] ?? 0);
      }
    }
    return total;
  }, [addonQty, people, selectedGroupPackage?.price, soloAddons]);

  const paymentAmount = order ? (paymentPlan === "half" ? Math.ceil(order.total * 0.5 * 100) / 100 : order.total) : 0;
  const selectedPaymentAccount = paymentMethod === "gcash"
    ? data?.paymentProfile.gcash
    : paymentMethod === "maya"
      ? data?.paymentProfile.maya
      : null;
  const draftKey = `photoflow:draft:${slug}:${batch ?? "event"}`;

  useEffect(() => {
    if (!data || typeof window === "undefined" || draftRestoredRef.current) return;
    draftRestoredRef.current = true;

    const restore = async () => {
      const raw = window.localStorage.getItem(draftKey);
      if (!raw) return;

      try {
        const draft = JSON.parse(raw) as ClientDraft;
        if (draft.version !== 2 || draft.eventId !== data.event.id || !draft.resumeToken) {
          window.localStorage.removeItem(draftKey);
          return;
        }

        setResumeLoading(true);
        const db = supabase as any;
        const sessionResult = await withTimeout(
          db.rpc("get_client_session_v1", { _resume_token: draft.resumeToken }),
          10_000,
          "Restoring your unfinished order took too long.",
        );

        if (sessionResult.error) throw sessionResult.error;
        const session = sessionResult.data?.[0];
        if (!session) {
          window.localStorage.removeItem(draftKey);
          return;
        }

        const photoPath = String(session.photo_path ?? "");
        const photoUrl = /^https?:\/\//i.test(photoPath)
          ? photoPath
          : supabase.storage.from("event-photos").getPublicUrl(photoPath).data.publicUrl;

        const snapshot = {
          id: session.photo_id,
          event_id: data.event.id,
          event_group_id: data.selectedGroup?.id ?? null,
          participant_id: session.participant_id,
          url: photoUrl,
          file_name: null,
          is_separator: false,
          favorite: false,
          sort_order: 0,
          photo_type: "solo",
          group_name: session.group_name ?? data.event.name,
          album_id: null,
          storage_path: photoPath,
          original_path: null,
          preview_path: null,
          thumbnail_path: null,
          thumbnail_url: photoUrl,
          content_hash: null,
          original_size: null,
          width: null,
          height: null,
        } as PhotoRow;

        const restoredIdentity: Identity = {
          participant_id: session.participant_id,
          participant_code: session.participant_code,
          full_name: session.full_name,
          organization: session.organization ?? "",
          contact_number: session.contact_number ?? "",
          group_name: session.group_name ?? data.event.name,
          email: session.email ?? "",
          resume_token: draft.resumeToken,
        };

        setSelectedPhotoId(session.photo_id);
        setSelectedPhotoSnapshot(snapshot);
        setIdentity(restoredIdentity);
        setPeople([{ identity: restoredIdentity, photoId: session.photo_id, photoUrl }]);
        setGroupPackageId(draft.groupPackageId ?? null);
        setGroupFrameColor(draft.groupFrameColor ?? "black");
        setAddonQty(draft.addonQty ?? {});
        setAddonFrameColors(draft.addonFrameColors ?? {});

        if (session.order_id && session.public_token) {
          setOrder({
            id: session.order_id,
            order_number: session.order_number,
            public_token: session.public_token,
            total: Number(session.total ?? 0),
          });
        }

        toast.message(session.order_id ? "Your order was restored." : "Your unfinished order was restored.");
      } catch (restoreError) {
        console.error("PhotoFlow resume failed", restoreError);
      } finally {
        setResumeLoading(false);
      }
    };

    void restore();
  }, [data, draftKey]);

  useEffect(() => {
    if (typeof window === "undefined" || !data || !identity?.resume_token) return;

    const draft: ClientDraft = {
      version: 2,
      eventId: data.event.id,
      resumeToken: identity.resume_token,
      groupPackageId,
      addonQty,
      groupFrameColor,
      addonFrameColors,
    };

    window.localStorage.setItem(draftKey, JSON.stringify(draft));
  }, [addonFrameColors, addonQty, data, draftKey, groupFrameColor, groupPackageId, identity?.resume_token]);

  useEffect(() => {
    if (!order || typeof window === "undefined") return;
    QRCode.toDataURL(publicAppUrl(`/order/${order.public_token}`), { width: 360, margin: 1 }).then(setQrUrl).catch(() => setQrUrl(null));
  }, [order]);

  async function copyPaymentNumber(value: string) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Account number copied");
    } catch {
      toast.error("Could not copy automatically. Press and hold the number to copy.");
    }
  }

  async function savePaymentQr(url: string, method: string) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("QR image could not be loaded.");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `PhotoFlow-${method}-QR.png`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }

  async function startAnotherOrder() {
    if (!confirm("Start another order on this device? The current order will stay saved in PhotoFlow.")) return;

    if (typeof window !== "undefined") {
      window.localStorage.removeItem(draftKey);
    }

    draftRestoredRef.current = true;
    setSelectedPhotoId(null);
    setSelectedPhotoSnapshot(null);
    setIdentity(null);
    setIdentityForm({ full_name: "", organization: "", contact_number: "", email: "" });
    setPeople([]);
    setGroupPackageId(null);
    setGroupFrameColor("black");
    setAddonQty({});
    setAddonFrameColors({});
    setOrder(null);
    setPaymentMethod("gcash");
    setPaymentPlan("half");
    setPaymentReference("");
    setProofFile(null);
    setPaymentSubmitted(false);
    setQrUrl(null);
    setClaimErrorMessage(null);
    await refetch();
    window.scrollTo({ top: 0, behavior: "smooth" });
    toast.success("Ready for another participant");
  }

  function errorMessage(error: unknown, fallback: string) {
    if (error instanceof Error) return error.message;
    if (error && typeof error === "object" && "message" in error) {
      const message = String((error as { message?: unknown }).message ?? "").trim();
      if (message) return message;
    }
    return fallback;
  }

  async function claimPortrait() {
    if (!data || !selectedPhoto) return;
    if (identityForm.full_name.trim().length < 2) return toast.error("Enter your full name.");
    if (identityForm.contact_number.trim().length < 7) return toast.error("Enter a valid contact number.");

    setSubmitting(true);
    setClaimErrorMessage(null);

    try {
      const db = supabase as any;
      const result = await withTimeout(
        db.rpc("claim_solo_portrait_v4", {
          _share_token: data.shareToken,
          _photo_id: selectedPhoto.id,
          _full_name: identityForm.full_name.trim(),
          _organization: identityForm.organization.trim(),
          _contact_number: identityForm.contact_number.trim(),
          _email: identityForm.email.trim() || null,
        }),
        10_000,
        "Saving your details is taking too long.",
      );

      if (result.error) throw result.error;
      const claimed = result.data?.[0];
      if (!claimed?.resume_token) throw new Error("We couldn't start your order. Please try again.");

      const nextIdentity: Identity = {
        participant_id: claimed.participant_id,
        participant_code: claimed.participant_code,
        group_name: claimed.group_name ?? data.selectedGroup?.name ?? data.event.name,
        full_name: identityForm.full_name.trim(),
        organization: identityForm.organization.trim(),
        contact_number: identityForm.contact_number.trim(),
        email: identityForm.email.trim(),
        resume_token: String(claimed.resume_token),
      };

      setSelectedPhotoSnapshot(selectedPhoto);
      setIdentity(nextIdentity);
      setPeople([{ identity: nextIdentity, photoId: selectedPhoto.id, photoUrl: selectedPhoto.url }]);
      toast.success("Photo confirmed");
    } catch (claimError) {
      const message = errorMessage(claimError, "Could not save your details. Please try again.");
      setClaimErrorMessage(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }


  function updateAddon(personId: string, addonId: string, delta: number) {
    setAddonQty((current) => {
      const person = current[personId] ?? {};
      return {
        ...current,
        [personId]: {
          ...person,
          [addonId]: Math.max(0, Math.min(10, (person[addonId] ?? 0) + delta)),
        },
      };
    });
  }

  function updateAddonFrameColor(personId: string, addonId: string, color: FrameColor) {
    setAddonFrameColors((current) => ({
      ...current,
      [personId]: {
        ...(current[personId] ?? {}),
        [addonId]: color,
      },
    }));
  }

  async function submitOrder() {
    if (!data || !identity || !people.length || !selectedGroupPackage) return;

    setSubmitting(true);
    try {
      const soloAddonsForPrimary = soloAddons
        .filter((addon) => (addonQty[identity.participant_id]?.[addon.id] ?? 0) > 0)
        .map((addon) => ({
          package_id: addon.id,
          quantity: addonQty[identity.participant_id]?.[addon.id] ?? 0,
          frame_color: addon.framed
            ? (addonFrameColors[identity.participant_id]?.[addon.id] ?? "black")
            : null,
        }));

      const db = supabase as any;
      let result = await withTimeout(
        db.rpc("submit_client_order_v6", {
          _resume_token: identity.resume_token,
          _group_package_id: selectedGroupPackage.id,
          _group_frame_color: selectedGroupPackage.framed ? groupFrameColor : "black",
          _solo_addons: soloAddonsForPrimary,
        }),
        15_000,
        "Order submission took too long. Please try again.",
      );

      if (result.error && (
        result.error.code === "PGRST202"
        || String(result.error.message ?? "").includes("submit_client_order_v6")
      )) {
        result = await withTimeout(
          db.rpc("submit_client_order_v4", {
            _resume_token: identity.resume_token,
            _group_package_id: selectedGroupPackage.id,
            _solo_addons: soloAddonsForPrimary.map(({ package_id, quantity }) => ({ package_id, quantity })),
          }),
          15_000,
          "Order submission took too long. Please try again.",
        );
      }

      if (result.error) throw result.error;
      const created = result.data?.[0];
      if (!created) throw new Error("Order could not be created.");

      setOrder({
        id: created.order_id,
        order_number: created.order_number,
        public_token: created.public_token,
        total: Number(created.total),
      });
      toast.success("Order received");
    } catch (submitError) {
      toast.error(errorMessage(submitError, "Could not submit your order."));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitPayment() {
    if (!order) return;
    if (paymentMethod === "cash") {
      setPaymentSubmitted(true);
      toast.success("Cash payment selected");
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
          "Screenshot upload took too long. Please try again.",
        );
        if (upload.error) throw upload.error;
      }

      const db = supabase as any;
      const result = await withTimeout(
        db.rpc("submit_client_payment_v3", {
          _public_token: order.public_token,
          _method: paymentMethod,
          _amount: paymentAmount,
          _reference: paymentReference.trim() || null,
          _proof_path: proofPath,
          _client_request_id: crypto.randomUUID(),
        }),
        15_000,
        "Payment submission took too long. Please try again.",
      );

      if (result.error) throw result.error;
      setPaymentSubmitted(true);
      toast.success("Payment details received");
    } catch (paymentError) {
      toast.error(paymentError instanceof Error ? paymentError.message : "Could not submit payment details.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading || resumeLoading) return <div className="grid min-h-screen place-items-center bg-background text-sm text-muted-foreground">{resumeLoading ? "Restoring your order…" : "Loading gallery…"}</div>;
  if (error || !data) return <div className="grid min-h-screen place-items-center bg-background p-6 text-center"><div><h1 className="font-display text-3xl font-extrabold">Gallery unavailable</h1><p className="mt-2 text-sm text-muted-foreground">{error instanceof Error ? error.message : "This gallery could not be loaded."}</p></div></div>;

  const needsBatchLink = data.groups.length > 0 && !data.selectedGroup;
  if (needsBatchLink) {
    return <div className="grid min-h-screen place-items-center bg-background p-6 text-center text-foreground"><div className="max-w-lg"><ShieldCheck className="mx-auto size-9 text-primary" /><h1 className="mt-4 font-display text-3xl font-extrabold">Open the link sent to your class.</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">Each class has its own gallery. Please use the link provided by Misantio Studio.</p></div></div>;
  }

  const batchName = data.selectedGroup?.name ?? "Gallery";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-5">
          <div><p className="font-display text-lg font-extrabold">PhotoFlow</p><p className="text-[0.6rem] uppercase tracking-[.18em] text-muted-foreground">by Misantio Studio</p></div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-4 text-primary" /> {batchName}</div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-7 sm:px-5 sm:py-10">
        {!selectedPhoto ? (
          <section>
            <div className="mx-auto max-w-2xl text-center">
              <p className="eyebrow mx-auto w-fit">{data.event.name}{data.selectedGroup ? ` · ${data.selectedGroup.name}` : ""}</p>
              <h1 className="mt-4 font-display text-4xl font-extrabold tracking-[-.045em] sm:text-6xl">Find your photo.</h1>
              <p className="mx-auto mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Choose your solo portrait to start your order.</p>
            </div>
            {availableSoloPhotos.length ? (
              <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {availableSoloPhotos.map((photo) => (
                  <button key={photo.id} type="button" onClick={() => setSelectedPhotoId(photo.id)} className="group overflow-hidden rounded-lg border border-border bg-card transition hover:border-primary/40">
                    <img src={photo.thumbnail_url || photo.url} alt="Event portrait" loading="lazy" decoding="async" className="aspect-[3/4] w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
                    <div className="p-2 text-left"><p className="text-xs font-semibold">This is me</p><p className="mt-0.5 truncate text-[0.62rem] text-muted-foreground">Choose to continue</p></div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="mx-auto mt-10 max-w-xl rounded-xl border border-dashed border-border p-10 text-center"><UserRoundCheck className="mx-auto size-8 text-primary" /><h2 className="mt-3 font-display text-xl font-extrabold">No solo photos yet</h2><p className="mt-2 text-sm text-muted-foreground">Photos for this event are still being prepared.</p></div>
            )}
          </section>
        ) : !identity ? (
          <section className="mx-auto max-w-4xl">
            <button type="button" onClick={() => { setSelectedPhotoId(null); setClaimErrorMessage(null); }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Choose another photo</button>
            <div className="mt-5 grid gap-6 lg:grid-cols-[300px_1fr]">
              <div><img src={selectedPhoto.url} alt="Selected portrait" className="mx-auto aspect-[3/4] w-full max-w-[280px] rounded-xl border border-primary/30 object-cover" /><p className="mt-3 text-center text-sm font-semibold">Selected photo</p></div>
              <div className="rounded-xl border border-border bg-card p-5 sm:p-7">
                <p className="eyebrow">Your details</p>
                <h1 className="mt-1 font-display text-3xl font-extrabold">Almost done.</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Add your name, congregation and contact number.</p>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-1.5"><Label>Name</Label><Input value={identityForm.full_name} onChange={(event) => setIdentityForm({ ...identityForm, full_name: event.target.value })} /></label>
                  <label className="grid gap-1.5"><Label>Congregation</Label><Input value={identityForm.organization} onChange={(event) => setIdentityForm({ ...identityForm, organization: event.target.value })} /></label>
                  <label className="grid gap-1.5"><Label>Contact number</Label><Input inputMode="tel" value={identityForm.contact_number} onChange={(event) => setIdentityForm({ ...identityForm, contact_number: event.target.value })} /></label>
                  <label className="grid gap-1.5"><Label>Email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input type="email" value={identityForm.email} onChange={(event) => setIdentityForm({ ...identityForm, email: event.target.value })} /></label>
                </div>
                {claimErrorMessage ? (
                  <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                    {claimErrorMessage}
                  </div>
                ) : null}
                <Button className="mt-6 min-w-32" size="lg" onClick={() => void claimPortrait()} disabled={submitting}>
                  {submitting ? "Saving details…" : "Continue"} <Check className="size-4" />
                </Button>
              </div>
            </div>
          </section>
        ) : order ? (
          <section className="mx-auto max-w-3xl">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">This order is safely saved. You can start another participant on this device.</p>
              <Button variant="outline" onClick={() => void startAnotherOrder()}>
                <ArrowLeft className="size-4" /> Back to gallery / new order
              </Button>
            </div>
            <div className="rounded-xl border border-primary/25 bg-primary/[0.045] p-5 sm:p-8">
              <div className="flex items-start gap-4">
                <span className="grid size-11 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground"><Check className="size-5" /></span>
                <div><p className="eyebrow">Order received</p><h1 className="mt-1 font-display text-3xl font-extrabold">Thank you, {identity.full_name.split(" ")[0]}!</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">Save your Order Pass for pickup.</p></div>
              </div>
              <div className="mt-6 grid gap-5 border-t border-border pt-5 sm:grid-cols-[1fr_180px]">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><p className="text-xs text-muted-foreground">Order no.</p><p className="mt-1 font-mono font-semibold">{order.order_number}</p></div>
                  <div><p className="text-xs text-muted-foreground">Total</p><p className="mt-1 font-semibold">{peso(order.total)}</p></div>
                  <div><p className="text-xs text-muted-foreground">People</p><p className="mt-1 font-semibold">{people.length}</p></div>
                  <div><p className="text-xs text-muted-foreground">Payment</p><p className="mt-1 font-semibold">{paymentSubmitted ? (paymentMethod === "cash" ? "Cash on pickup" : "For verification") : "Not submitted yet"}</p></div>
                </div>
                {qrUrl ? <div className="rounded-lg bg-white p-2"><img src={qrUrl} alt="Order Pass QR" className="w-full" /></div> : null}
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-border bg-card p-5 sm:p-7">
              <div className="flex items-center gap-2"><CreditCard className="size-4 text-primary" /><h2 className="font-display text-xl font-extrabold">Payment</h2></div>
              <p className="mt-2 text-sm text-muted-foreground">Choose 50% or full payment.</p>
              <div className="mt-4 rounded-lg border border-border bg-muted/20 p-4 text-sm whitespace-pre-wrap">{data.event.payment_instructions || "Contact Misantio Studio for payment details."}</div>

              {paymentSubmitted ? (
                <div className="mt-4 rounded-lg border border-success/25 bg-success/10 p-4 text-sm text-success">{paymentMethod === "cash" ? "Cash can be settled before pickup." : "Payment details received. Your Order Pass will update after verification."}</div>
              ) : (
                <div className="mt-5 grid gap-4">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => setPaymentPlan("half")} className={cn("rounded-lg border p-4 text-left", paymentPlan === "half" ? "border-primary bg-primary/5" : "border-border")}><p className="font-semibold">50%</p><p className="mt-1 font-display text-2xl font-extrabold">{peso(Math.ceil(order.total * 0.5 * 100) / 100)}</p></button>
                    <button type="button" onClick={() => setPaymentPlan("full")} className={cn("rounded-lg border p-4 text-left", paymentPlan === "full" ? "border-primary bg-primary/5" : "border-border")}><p className="font-semibold">Full payment</p><p className="mt-1 font-display text-2xl font-extrabold">{peso(order.total)}</p></button>
                  </div>
                  <label className="grid gap-1.5"><Label>Payment method</Label><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="gcash">GCash</option><option value="maya">Maya</option><option value="cash">Cash</option><option value="bank">Bank transfer</option><option value="other">Other</option></select></label>

                  {(paymentMethod === "gcash" || paymentMethod === "maya") ? (
                    <div className="rounded-xl border border-primary/20 bg-primary/[.035] p-4">
                      <div className="grid gap-4 sm:grid-cols-[1fr_170px] sm:items-center">
                        <div>
                          <p className="eyebrow">{paymentMethod === "gcash" ? "GCash" : "Maya"} payment</p>
                          <p className="mt-1 font-display text-xl font-extrabold">{peso(paymentAmount)}</p>
                          {selectedPaymentAccount?.name ? <p className="mt-3 text-sm font-semibold">{selectedPaymentAccount.name}</p> : null}
                          {selectedPaymentAccount?.number ? (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <code className="rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold">{selectedPaymentAccount.number}</code>
                              <Button size="sm" variant="outline" onClick={() => void copyPaymentNumber(selectedPaymentAccount.number)}>
                                <Copy className="size-3.5" /> Copy number
                              </Button>
                            </div>
                          ) : null}
                          {!selectedPaymentAccount?.number && !selectedPaymentAccount?.qrUrl ? (
                            <p className="mt-3 text-sm text-warning">Payment account details are not configured yet. Please ask Misantio Studio.</p>
                          ) : null}
                        </div>

                        {selectedPaymentAccount?.qrUrl ? (
                          <div className="text-center">
                            <div className="rounded-lg bg-white p-2"><img src={selectedPaymentAccount.qrUrl} alt={paymentMethod + " QR"} className="aspect-square w-full object-contain" /></div>
                            <Button className="mt-2 w-full" size="sm" variant="outline" onClick={() => void savePaymentQr(selectedPaymentAccount.qrUrl, paymentMethod)}>
                              <Download className="size-3.5" /> Save QR
                            </Button>
                            <p className="mt-1 text-[0.62rem] text-muted-foreground">Scan using another phone or save it first.</p>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}

                  {paymentMethod !== "cash" ? <>
                    <label className="grid gap-1.5"><Label>Reference number <span className="font-normal text-muted-foreground">(optional with screenshot)</span></Label><Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} /></label>
                    <label className="grid gap-1.5"><Label>Payment screenshot</Label><Input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setProofFile(event.target.files?.[0] ?? null)} /></label>
                  </> : null}
                  <Button size="lg" onClick={() => void submitPayment()} disabled={submitting}>{submitting ? "Sending…" : paymentMethod === "cash" ? "Use cash payment" : `Submit ${peso(paymentAmount)} payment`} <Upload className="size-4" /></Button>
                </div>
              )}
            </div>
          </section>
        ) : (
          <section>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div><p className="eyebrow">{identity.participant_code}</p><h1 className="mt-1 font-display text-3xl font-extrabold sm:text-4xl">Hi, {identity.full_name.split(" ")[0]}.</h1><p className="mt-1 text-sm text-muted-foreground">{identity.group_name || batchName}</p></div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground"><UserRoundCheck className="size-4 text-primary" /> Photo reserved</div>
            </div>

            <div className="mt-4 flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/[.035] p-3 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                <p className="font-semibold text-foreground">Progress saved on this device</p>
                <p className="mt-1">If your connection drops or you refresh the page, PhotoFlow will restore this unfinished order automatically.</p>
              </div>
            </div>

            <section className="mt-7 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="eyebrow">Your photo</p>
                  <p className="mt-1 text-sm text-muted-foreground">Your identity and order progress are saved on this device.</p>
                </div>
                <p className="text-xs text-muted-foreground">Ordering for more than one person? The studio can assist you.</p>
              </div>

              <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/15 p-3">
                <img src={people[0]?.photoUrl} alt={identity.full_name} className="size-14 rounded-md object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{identity.full_name}</p>
                  <p className="truncate text-xs text-muted-foreground">{identity.organization || "No congregation"}</p>
                </div>
              </div>
            </section>
            <section className="mt-8">
              <p className="eyebrow">Step 1</p>
              <h2 className="mt-1 font-display text-2xl font-extrabold">Choose a class photo package</h2>
              <p className="mt-2 text-sm text-muted-foreground">Choose your print size and frame option.</p>
              <div className="mt-5 grid gap-4 lg:grid-cols-[280px_1fr]">
                <div className="rounded-xl border border-border bg-card p-4"><FramePreview src={matchedGroupPhoto?.url} label="Class photo" framed={selectedGroupPackage?.framed ?? false} frameColor={groupFrameColor} large /><p className="mt-3 text-center text-xs text-muted-foreground">{matchedGroupPhoto ? "Official class photo" : "Class photo is not ready yet."}</p>{!matchedGroupPhoto ? <div className="mt-3 rounded-lg border border-warning/25 bg-warning/5 p-3 text-xs text-warning">Ordering will be available once the studio uploads the official class photo.</div> : null}</div>
                <div>
                  {groupPackages.length ? (
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {groupPackages.map((item) => <button key={item.id} type="button" onClick={() => { setGroupPackageId(item.id); if (!item.framed) setGroupFrameColor("black"); }} className={cn("rounded-xl border p-5 text-left transition", groupPackageId === item.id ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border bg-card hover:border-primary/30")}><p className="text-xs font-bold uppercase tracking-[.14em] text-primary">{item.code || "Package"}</p><p className="mt-2 font-semibold">{item.name}</p><p className="mt-3 font-display text-3xl font-extrabold">{peso(item.price)}</p><p className="mt-2 text-xs leading-5 text-muted-foreground">{item.quantity} × {item.print_size}{item.framed ? " · frame + white mat" : " · print only"}</p></button>)}
                    </div>
                  ) : <div className="rounded-lg border border-dashed border-border p-6 text-sm text-muted-foreground">No active class packages yet.</div>}

                  {selectedGroupPackage?.framed ? (
                    <div className="mt-5 rounded-xl border border-border bg-card p-4">
                      <div className="mb-3">
                        <p className="text-sm font-semibold">Choose frame color</p>
                        <p className="mt-1 text-xs text-muted-foreground">White mat board is included. Your mockup updates instantly.</p>
                      </div>
                      <FrameColorPicker value={groupFrameColor} onChange={setGroupFrameColor} />
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            {selectedGroupPackage ? (
              <section className="mt-10 border-t border-border pt-8">
                <p className="eyebrow">Step 2 · Optional</p>
                <h2 className="mt-1 font-display text-2xl font-extrabold">Solo add-ons</h2>
                <p className="mt-2 text-sm text-muted-foreground">Add solo prints or frames for any person in this order.</p>

                <div className="mt-5 grid gap-5">
                  {people.map((person) => {
                    const personQty = addonQty[person.identity.participant_id] ?? {};
                    const personFrameColors = addonFrameColors[person.identity.participant_id] ?? {};
                    const selectedFramedAddon = soloAddons.find((item) => item.framed && (personQty[item.id] ?? 0) > 0);
                    const previewFrameColor = selectedFramedAddon
                      ? (personFrameColors[selectedFramedAddon.id] ?? "black")
                      : "black";

                    return (
                      <div key={person.identity.participant_id} className="grid gap-5 rounded-xl border border-border bg-card p-4 lg:grid-cols-[210px_1fr]">
                        <div>
                          <FramePreview
                            src={person.photoUrl}
                            label={person.identity.full_name}
                            framed={Boolean(selectedFramedAddon)}
                            frameColor={previewFrameColor}
                          />
                          <p className="mt-2 text-center text-sm font-semibold">{person.identity.full_name}</p>
                        </div>

                        <div>
                          {soloAddons.length ? (
                            <div className="grid gap-3 sm:grid-cols-2">
                              {soloAddons.map((item) => {
                                const qty = personQty[item.id] ?? 0;
                                const frameColor = personFrameColors[item.id] ?? "black";

                                return (
                                  <div key={item.id} className={cn("rounded-xl border p-4", qty > 0 ? "border-primary/40 bg-primary/5" : "border-border bg-background")}>
                                    <div className="flex items-start justify-between gap-3">
                                      <div>
                                        <p className="font-semibold">{item.name}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {item.print_size}{item.framed ? " · frame + white mat" : " · print"}
                                        </p>
                                      </div>
                                      <p className="font-bold">{peso(item.price)}</p>
                                    </div>

                                    <div className="mt-4 flex items-center gap-2">
                                      <Button size="icon" variant="outline" onClick={() => updateAddon(person.identity.participant_id, item.id, -1)} disabled={!qty}><Minus className="size-4" /></Button>
                                      <span className="min-w-8 text-center font-bold">{qty}</span>
                                      <Button size="icon" variant="outline" onClick={() => updateAddon(person.identity.participant_id, item.id, 1)}><Plus className="size-4" /></Button>
                                    </div>

                                    {item.framed && qty > 0 ? (
                                      <div className="mt-4 border-t border-border pt-3">
                                        <p className="mb-2 text-[0.66rem] font-bold uppercase tracking-[.1em] text-muted-foreground">Frame color</p>
                                        <FrameColorPicker
                                          compact
                                          value={frameColor}
                                          onChange={(color) => updateAddonFrameColor(person.identity.participant_id, item.id, color)}
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                );
                              })}
                            </div>
                          ) : <p className="text-sm text-muted-foreground">No solo add-ons available.</p>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {selectedGroupPackage ? (
              <div className="sticky bottom-4 mt-8 flex flex-col gap-3 rounded-xl border border-border bg-background/95 p-4 shadow-2xl shadow-black/30 backdrop-blur sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="text-xs text-muted-foreground">Order total</p><p className="font-display text-2xl font-extrabold">{peso(estimatedTotal)}</p><p className="mt-1 text-xs text-muted-foreground">1 person · 1 class photo package{selectedGroupPackage.framed ? ` · ${FRAME_OPTIONS.find((item) => item.value === groupFrameColor)?.label} frame` : ""}</p></div>
                <Button size="lg" onClick={() => void submitOrder()} disabled={submitting || !matchedGroupPhoto}>{submitting ? "Submitting…" : matchedGroupPhoto ? "Confirm order" : "Class photo not ready"} <Check className="size-4" /></Button>
              </div>
            ) : null}
          </section>
        )}
      </main>
    </div>
  );
}