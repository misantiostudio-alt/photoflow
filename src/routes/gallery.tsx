import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Check,
  Copy,
  ExternalLink,
  FolderOpen,
  ImagePlus,
  Images,
  Link2,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserRoundPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { createIdentityThumbnail, fileSha256, formatBytes, optimizeImage } from "@/lib/image-upload";
import { useOps, useSession, type PhotoRow, type PhotoType } from "@/lib/data";
import { publicAppUrl } from "@/lib/public-url";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gallery")({ component: GalleryWorkspace });

type UploadState = {
  name: string;
  status: string;
  percent: number;
  tone: "pending" | "working" | "done" | "duplicate" | "error";
  error?: string;
};

type UploadResult = {
  albumId: string;
  albumName: string;
  groupId: string | null;
  uploaded: number;
  skipped: number;
  failed: number;
};

type ManagerType = "all" | "solo" | "group";
type ManagerStatus = "all" | "waiting" | "claimed";

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function dedupeChosenFiles(files: File[]) {
  const seen = new Set<string>();
  return files.filter((file) => {
    const key = `${file.name}:${file.size}:${file.lastModified}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function photoImage(photo: PhotoRow) {
  return photo.thumbnail_url || photo.url;
}

function GalleryWorkspace() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();
  const navigate = useNavigate();

  const fileRef = useRef<HTMLInputElement | null>(null);
  const replaceRef = useRef<HTMLInputElement | null>(null);
  const identityBackfillRef = useRef(false);

  const [uploadType, setUploadType] = useState<PhotoType>("solo");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [albumName, setAlbumName] = useState("");
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadStates, setUploadStates] = useState<UploadState[]>([]);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [dragging, setDragging] = useState(false);

  const [managerType, setManagerType] = useState<ManagerType>("all");
  const [managerStatus, setManagerStatus] = useState<ManagerStatus>("all");
  const [managerGroup, setManagerGroup] = useState("all");
  const [managerAlbum, setManagerAlbum] = useState("all");
  const [managerSearch, setManagerSearch] = useState("");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<Set<string>>(new Set());
  const [busyPhotoId, setBusyPhotoId] = useState<string | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState<PhotoRow | null>(null);
  const [assistPhoto, setAssistPhoto] = useState<PhotoRow | null>(null);
  const [assistForm, setAssistForm] = useState({ full_name: "", organization: "", contact_number: "", email: "" });
  const [assistPackageId, setAssistPackageId] = useState("");
  const [assistAddons, setAssistAddons] = useState<Record<string, number>>({});
  const [assistBusy, setAssistBusy] = useState(false);
  const [optimizingLegacy, setOptimizingLegacy] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [linksOpen, setLinksOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);

  useEffect(() => {
    if (!selectedGroupId && data?.eventGroups.length) setSelectedGroupId(data.eventGroups[0].id);
  }, [data?.eventGroups, selectedGroupId]);

  useEffect(() => {
    if (!data?.event?.id || !email) return;

    let timer: number | null = null;
    const refreshSoon = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => void refetch(), 250);
    };

    const channel = supabase
      .channel(`gallery-admin-${data.event.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "photos",
        filter: `event_id=eq.${data.event.id}`,
      }, refreshSoon)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "participants",
        filter: `event_id=eq.${data.event.id}`,
      }, refreshSoon)
      .subscribe();

    return () => {
      if (timer) window.clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [data?.event?.id, email, refetch]);

  useEffect(() => {
    if (!email || !data?.event || identityBackfillRef.current) return;

    const candidates = data.photos
      .filter((photo) => photo.photo_type === "solo" && !photo.identity_thumbnail_url && photo.url)
      .sort((a, b) => Number(Boolean(b.participant_id)) - Number(Boolean(a.participant_id)))
      .slice(0, 12);

    if (!candidates.length) return;
    identityBackfillRef.current = true;

    const run = async () => {
      let created = 0;

      for (const photo of candidates) {
        try {
          const response = await fetch(photo.url);
          if (!response.ok) continue;
          const blob = await response.blob();
          const file = new File([blob], photo.file_name || `photo-${photo.id}.jpg`, { type: blob.type || "image/jpeg" });
          const identity = await createIdentityThumbnail(file, 420, 0.84);
          const base = `${data.event!.id}/${photo.event_group_id ?? "general"}/solo`;
          const identityPath = `${base}/identity/${crypto.randomUUID()}.webp`;

          const upload = await supabase.storage.from("event-photos").upload(identityPath, identity.blob, {
            upsert: false,
            contentType: "image/webp",
          });
          if (upload.error) continue;

          const identityUrl = supabase.storage.from("event-photos").getPublicUrl(identityPath).data.publicUrl;
          const updated = await supabase.from("photos").update({
            identity_thumbnail_path: identityPath,
            identity_thumbnail_url: identityUrl,
          } as never).eq("id", photo.id);

          if (updated.error) continue;

          if (photo.participant_id) {
            await supabase.from("participants").update({ thumbnail_url: identityUrl }).eq("id", photo.participant_id);
          }

          created += 1;
        } catch {
          // Existing-photo backfill is best effort and never blocks Gallery.
        }
      }

      if (created) {
        toast.success(`${created} identity thumbnail${created === 1 ? "" : "s"} prepared in the background`);
        await refetch();
      }
    };

    void run();
  }, [data, email, refetch]);

  const soloPhotos = useMemo(
    () => data?.photos.filter((photo) => photo.photo_type !== "group" && !photo.is_separator) ?? [],
    [data?.photos],
  );
  const groupPhotos = useMemo(
    () => data?.photos.filter((photo) => photo.photo_type === "group" && !photo.is_separator) ?? [],
    [data?.photos],
  );
  const claimedSolo = soloPhotos.filter((photo) => photo.participant_id);
  const waitingSolo = soloPhotos.filter((photo) => !photo.participant_id);
  const legacyPhotos = useMemo(
    () => data?.photos.filter((photo) =>
      !photo.is_separator
      && !photo.preview_path
      && !photo.url.includes("/preview/")
    ) ?? [],
    [data?.photos],
  );

  const groupPackages = useMemo(
    () => data?.packages.filter((item) => item.product_type === "group_package" && item.active) ?? [],
    [data?.packages],
  );
  const soloAddons = useMemo(
    () => data?.packages.filter((item) => item.product_type === "solo_addon" && item.active) ?? [],
    [data?.packages],
  );

  const uploadPercent = uploadStates.length
    ? Math.round(uploadStates.reduce((sum, item) => sum + item.percent, 0) / uploadStates.length)
    : 0;
  const uploadDone = uploadStates.filter((item) => item.tone === "done").length;
  const uploadSkipped = uploadStates.filter((item) => item.tone === "duplicate").length;
  const uploadFailed = uploadStates.filter((item) => item.tone === "error").length;
  const currentUpload = uploadStates.find((item) => item.tone === "working");

  if (isLoading || !data) {
    return <AppShell><PageHeader eyebrow="Client gallery" title="Gallery" /><LoadingGrid rows={6} /></AppShell>;
  }
  if (!data.event) {
    return <AppShell><EmptyState title="No event selected" description="Choose or create an event before opening its gallery workspace." action={<Button asChild><Link to="/events">Open Events</Link></Button>} /></AppShell>;
  }

  const hasGroups = data.eventGroups.length > 0;
  const selectedGroup = data.eventGroups.find((group) => group.id === selectedGroupId) ?? null;
  const baseGalleryUrl = publicAppUrl(`/g/${data.event.slug}`);

  const managedPhotos = data.photos.filter((photo) => {
    if (photo.is_separator) return false;
    if (managerType !== "all" && photo.photo_type !== managerType) return false;
    if (managerStatus === "waiting" && (photo.photo_type === "group" || photo.participant_id)) return false;
    if (managerStatus === "claimed" && (photo.photo_type === "group" || !photo.participant_id)) return false;
    if (managerGroup !== "all" && (photo.event_group_id ?? "general") !== managerGroup) return false;
    if (managerAlbum !== "all" && (photo.album_id ?? "none") !== managerAlbum) return false;
    const needle = managerSearch.trim().toLowerCase();
    if (!needle) return true;
    const group = data.eventGroups.find((item) => item.id === photo.event_group_id);
    const album = data.photoAlbums.find((item) => item.id === photo.album_id);
    const participant = data.participants.find((item) => item.id === photo.participant_id);
    return `${photo.file_name ?? ""} ${group?.name ?? photo.group_name ?? ""} ${album?.name ?? ""} ${photo.photo_type} ${participant?.full_name ?? ""} ${participant?.organization ?? ""} ${participant?.contact_number ?? ""}`
      .toLowerCase()
      .includes(needle);
  });

  const visibleAlbums = data.photoAlbums.filter((album) =>
    data.photos.some((photo) => photo.album_id === album.id && !photo.is_separator),
  );

  function galleryUrl(groupId?: string) {
    return groupId ? `${baseGalleryUrl}?batch=${encodeURIComponent(groupId)}` : baseGalleryUrl;
  }

  function requireStaff() {
    if (email) return true;
    void navigate({ to: "/auth" });
    return false;
  }

  function chooseFiles(next: File[]) {
    setUploadResult(null);
    const clean = dedupeChosenFiles(next).filter((file) => file.type.startsWith("image/"));
    if (uploadType === "group" && clean.length > 1) {
      setFiles(clean.slice(0, 1));
      toast.message("Class/group upload uses one official photo at a time.");
      return;
    }
    setFiles(clean);
    setUploadStates([]);
  }

  async function copyLink(url: string, label: string) {
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {
      copied = false;
    }

    if (!copied) {
      try {
        const textarea = document.createElement("textarea");
        textarea.value = url;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        document.body.removeChild(textarea);
      } catch {
        copied = false;
      }
    }

    if (copied) {
      setCopiedUrl(url);
      toast.success(`${label} gallery link copied`);
      window.setTimeout(() => setCopiedUrl((current) => current === url ? null : current), 1800);
      return;
    }

    window.prompt("Copy this gallery link:", url);
  }

  function setUploadItem(index: number, patch: Partial<UploadState>) {
    setUploadStates((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  async function prepareImage(file: File, withIdentity = false) {
    const [hash, preview, thumb, identity] = await Promise.all([
      fileSha256(file),
      optimizeImage(file, 1800, 0.84),
      optimizeImage(file, 480, 0.74),
      withIdentity ? createIdentityThumbnail(file, 420, 0.84) : Promise.resolve(null),
    ]);
    return { hash, preview, thumb, identity };
  }

  function isCompatibilityError(error: any) {
    const message = String(error?.message ?? "").toLowerCase();
    return error?.code === "PGRST204"
      || error?.code === "42703"
      || message.includes("column")
      || message.includes("schema cache")
      || message.includes("bucket not found");
  }


  async function insertPhotoRecord(richRow: Record<string, unknown>, legacyRow: Record<string, unknown>) {
    const rich = await withTimeout(
      supabase.from("photos").insert(richRow as never),
      12_000,
      "Photo metadata could not be saved in time.",
    );
    if (!rich.error) return;

    if (!isCompatibilityError(rich.error)) throw rich.error;

    const legacy = await withTimeout(
      supabase.from("photos").insert(legacyRow as never),
      12_000,
      "Photo metadata could not be saved in time.",
    );
    if (legacy.error) throw legacy.error;
  }

  async function updatePhotoRecord(id: string, richPatch: Record<string, unknown>, legacyPatch: Record<string, unknown>) {
    const rich = await withTimeout(
      supabase.from("photos").update(richPatch as never).eq("id", id),
      12_000,
      "Photo update timed out.",
    );
    if (!rich.error) return;

    if (!isCompatibilityError(rich.error)) throw rich.error;

    const legacy = await withTimeout(
      supabase.from("photos").update(legacyPatch as never).eq("id", id),
      12_000,
      "Photo update timed out.",
    );
    if (legacy.error) throw legacy.error;
  }

  async function uploadOne(
    file: File,
    index: number,
    sort: number,
    type: PhotoType,
    groupId: string | null,
    groupName: string | null,
    albumId: string,
  ) {
    setUploadItem(index, { status: "Checking file", percent: 5, tone: "working" });

    const existingByName = data.photos.find((photo) =>
      photo.file_name === file.name
      && photo.photo_type === type
      && (photo.event_group_id ?? null) === groupId,
    );

    setUploadItem(index, { status: "Optimizing preview", percent: 12 });
    const prepared = await prepareImage(file, type === "solo");

    const existingByHash = data.photos.find((photo) =>
      photo.content_hash === prepared.hash
      && photo.photo_type === type
      && (photo.event_group_id ?? null) === groupId,
    );

    if (existingByHash || (existingByName && !existingByName.content_hash)) {
      setUploadItem(index, {
        status: "Already in gallery",
        percent: 100,
        tone: "duplicate",
      });
      return "duplicate" as const;
    }

    const uuid = crypto.randomUUID();
    const base = `${data.event!.id}/${groupId ?? "general"}/${type}`;
    const previewPath = `${base}/preview/${uuid}.webp`;
    const thumbnailPath = `${base}/thumb/${uuid}.webp`;
    const identityPath = type === "solo" ? `${base}/identity/${uuid}.webp` : null;

    setUploadItem(index, { status: "Uploading gallery preview", percent: 35 });
    const previewUpload = await withTimeout(
      supabase.storage.from("event-photos").upload(previewPath, prepared.preview.blob, {
        upsert: false,
        contentType: "image/webp",
      }),
      30_000,
      `Preview upload timed out for ${file.name}.`,
    );
    if (previewUpload.error) throw previewUpload.error;

    setUploadItem(index, { status: "Uploading thumbnail", percent: 68 });
    const thumbUpload = await withTimeout(
      supabase.storage.from("event-photos").upload(thumbnailPath, prepared.thumb.blob, {
        upsert: false,
        contentType: "image/webp",
      }),
      30_000,
      `Thumbnail upload timed out for ${file.name}.`,
    );
    if (thumbUpload.error) throw thumbUpload.error;

    let identityPublicUrl: string | null = null;
    if (type === "solo" && identityPath && prepared.identity) {
      setUploadItem(index, { status: "Creating identity crop", percent: 82 });
      const identityUpload = await withTimeout(
        supabase.storage.from("event-photos").upload(identityPath, prepared.identity.blob, {
          upsert: false,
          contentType: "image/webp",
        }),
        30_000,
        `Identity thumbnail upload timed out for ${file.name}.`,
      );
      if (identityUpload.error) throw identityUpload.error;
      identityPublicUrl = supabase.storage.from("event-photos").getPublicUrl(identityPath).data.publicUrl;
    }

    const { data: previewPublic } = supabase.storage.from("event-photos").getPublicUrl(previewPath);
    const { data: thumbPublic } = supabase.storage.from("event-photos").getPublicUrl(thumbnailPath);

    setUploadItem(index, { status: "Saving to gallery", percent: 90 });
    const baseRow = {
      event_id: data.event!.id,
      event_group_id: groupId,
      participant_id: null,
      url: previewPublic.publicUrl,
      file_name: file.name,
      is_separator: false,
      favorite: false,
      sort_order: sort,
      photo_type: type,
      group_name: groupName,
      album_id: albumId,
      storage_path: previewPath,
    };

    const richRow = {
      ...baseRow,
      original_path: null,
      preview_path: previewPath,
      thumbnail_path: thumbnailPath,
      thumbnail_url: thumbPublic.publicUrl,
      identity_thumbnail_path: identityPath,
      identity_thumbnail_url: identityPublicUrl,
      content_hash: prepared.hash,
      original_size: file.size,
      width: prepared.preview.width,
      height: prepared.preview.height,
    };

    try {
      await insertPhotoRecord(richRow, baseRow);
    } catch (error) {
      await Promise.allSettled([
        supabase.storage.from("event-photos").remove([previewPath, thumbnailPath, ...(identityPath ? [identityPath] : [])]),
      ]);
      throw error;
    }

    setUploadItem(index, { status: "Complete", percent: 100, tone: "done" });
    return "done" as const;
  }

  async function upload() {
    if (!requireStaff()) return;
    if (!files.length) return toast.error("Choose at least one photo.");
    if (hasGroups && !selectedGroup) return toast.error("Choose the class/batch for these photos.");

    setUploading(true);
    setUploadResult(null);
    setUploadStates(files.map((file) => ({
      name: file.name,
      status: "Queued",
      percent: 0,
      tone: "pending",
    })));

    const groupId = selectedGroup?.id ?? null;
    const groupName = selectedGroup?.name ?? data.event!.name;
    const generatedAlbumName = albumName.trim() || `${groupName || (uploadType === "group" ? "Class photo" : "Solo photos")} · ${new Date().toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
    const albumResult = await withTimeout(
      (supabase as any).from("photo_albums").insert({
        event_id: data.event!.id,
        event_group_id: groupId,
        name: generatedAlbumName,
        photo_type: uploadType,
        created_by: email,
      }).select("id").single(),
      12_000,
      "Could not create the upload album.",
    );
    if (albumResult.error) {
      setUploading(false);
      toast.error(albumResult.error.message);
      return;
    }
    const albumId = albumResult.data.id as string;
    let sort = data.photos.length + 1;
    let completed = 0;
    let duplicates = 0;
    let failed = 0;

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      try {
        const result = await uploadOne(file, index, sort, uploadType, groupId, groupName, albumId);
        if (result === "done") {
          completed += 1;
          sort += 1;
        } else {
          duplicates += 1;
        }
      } catch (error) {
        failed += 1;
        setUploadItem(index, {
          status: "Failed",
          percent: 100,
          tone: "error",
          error: error instanceof Error ? error.message : "Upload failed",
        });
      }
    }

    setUploading(false);

    if (!completed) {
      await (supabase as any).from("photo_albums").delete().eq("id", albumId);
    }

    if (completed) {
      setUploadResult({
        albumId,
        albumName: generatedAlbumName,
        groupId,
        uploaded: completed,
        skipped: duplicates,
        failed,
      });
      toast.success(`${completed} photo${completed === 1 ? "" : "s"} uploaded${duplicates ? ` · ${duplicates} duplicate${duplicates === 1 ? "" : "s"} skipped` : ""}`);
    } else if (duplicates && !failed) {
      toast.message("These photos are already in the gallery.");
    }
    if (failed) toast.error(`${failed} upload${failed === 1 ? "" : "s"} failed. You can retry only those files.`);

    if (completed || duplicates) {
      setFiles([]);
      setAlbumName("");
      if (fileRef.current) fileRef.current.value = "";
      await withTimeout(refetch(), 12_000, "Gallery refresh timed out. Uploaded photos are already saved.");
    }
  }

  function resetUploader() {
    setFiles([]);
    setUploadStates([]);
    setUploadResult(null);
    setAlbumName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function viewUploadedAlbum() {
    if (!uploadResult) return;
    setManagerAlbum(uploadResult.albumId);
    window.setTimeout(() => {
      document.getElementById("manage-gallery")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  function startAssist(photo: PhotoRow) {
    if (!requireStaff()) return;
    setAssistPhoto(photo);
    setAssistForm({ full_name: "", organization: "", contact_number: "", email: "" });
    setAssistPackageId(groupPackages[0]?.id ?? "");
    setAssistAddons({});
  }

  function changeAssistAddon(id: string, delta: number) {
    setAssistAddons((current) => ({
      ...current,
      [id]: Math.max(0, Math.min(10, (current[id] ?? 0) + delta)),
    }));
  }

  async function assistClient(createOrder: boolean) {
    if (!assistPhoto || !data.event) return;
    if (assistForm.full_name.trim().length < 2) return toast.error("Enter the participant's full name.");
    if (assistForm.contact_number.trim().length < 7) return toast.error("Enter a valid contact number.");
    if (createOrder && !assistPackageId) return toast.error("Choose a class package first.");

    setAssistBusy(true);
    try {
      const db = supabase as any;
      const claim = await withTimeout(
        db.rpc("claim_solo_portrait_v3", {
          _event_id: data.event.id,
          _photo_id: assistPhoto.id,
          _full_name: assistForm.full_name.trim(),
          _organization: assistForm.organization.trim(),
          _contact_number: assistForm.contact_number.trim(),
          _email: assistForm.email.trim() || null,
        }),
        12_000,
        "Saving participant details took too long.",
      );
      if (claim.error) throw claim.error;

      const claimed = claim.data?.[0];
      if (!claimed?.participant_id) throw new Error("Participant could not be created.");

      const identityUrl = assistPhoto.identity_thumbnail_url || assistPhoto.thumbnail_url || assistPhoto.url;
      if (identityUrl) {
        await supabase.from("participants").update({ thumbnail_url: identityUrl }).eq("id", claimed.participant_id);
      }

      if (createOrder) {
        const participantResult = await withTimeout(
          supabase.from("participants").select("resume_token").eq("id", claimed.participant_id).single(),
          10_000,
          "Could not prepare the assisted order.",
        );
        if (participantResult.error) throw participantResult.error;
        const resumeToken = (participantResult.data as any)?.resume_token;
        if (!resumeToken) throw new Error("Resume token is missing for this participant.");

        const addons = soloAddons
          .filter((item) => (assistAddons[item.id] ?? 0) > 0)
          .map((item) => ({ package_id: item.id, quantity: assistAddons[item.id] ?? 0 }));

        const orderResult = await withTimeout(
          db.rpc("submit_client_order_v4", {
            _resume_token: resumeToken,
            _group_package_id: assistPackageId,
            _solo_addons: addons,
          }),
          15_000,
          "Creating the assisted order took too long.",
        );
        if (orderResult.error) throw orderResult.error;
        const created = orderResult.data?.[0];
        toast.success(created?.order_number ? `Order ${created.order_number} created` : "Assisted order created");
      } else {
        toast.success("Participant details saved");
      }

      setAssistPhoto(null);
      await refetch();
    } catch (error) {
      const message = error && typeof error === "object" && "message" in error
        ? String((error as any).message)
        : "Could not complete assisted checkout.";
      toast.error(message);
    } finally {
      setAssistBusy(false);
    }
  }

  async function releaseClaim(photo: PhotoRow) {
    if (!requireStaff() || !photo.participant_id) return;
    const participantId = photo.participant_id;
    const participant = data.participants.find((item) => item.id === participantId);
    const activeOrder = data.orders.some((order) => order.participant_id === participantId && order.status !== "cancelled");
    const sharedOrder = data.orderMembers?.some((member) => member.participant_id === participantId);

    if (activeOrder || sharedOrder) {
      toast.error("This participant already has an order. Cancel or manage the order instead of releasing the photo.");
      return;
    }

    if (!confirm(`Release this photo from ${participant?.full_name ?? "the current participant"}?`)) return;

    setBusyPhotoId(photo.id);
    try {
      const clearPhoto = await supabase.from("photos").update({ participant_id: null }).eq("id", photo.id);
      if (clearPhoto.error) throw clearPhoto.error;

      const removeParticipant = await supabase.from("participants").delete().eq("id", participantId);
      if (removeParticipant.error) throw removeParticipant.error;

      toast.success("Claim released. The photo is available again.");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not release this claim.");
    } finally {
      setBusyPhotoId(null);
    }
  }

  function isProtectedPhoto(photo: PhotoRow) {
    return Boolean(
      photo.participant_id
      || data.orderItems.some((item) => item.photo_id === photo.id)
      || data.orders.some((order) => order.photo_id === photo.id)
      || data.orderMembers.some((member) => member.photo_id === photo.id),
    );
  }

  function eventPhotoPathFromUrl(url: string | null | undefined) {
    if (!url) return null;
    const marker = "/storage/v1/object/public/event-photos/";
    const index = url.indexOf(marker);
    if (index < 0) return null;
    return decodeURIComponent(url.slice(index + marker.length).split("?")[0]);
  }

  async function removePhotoFiles(photo: PhotoRow) {
    const publicPaths = Array.from(new Set([
      photo.storage_path,
      photo.preview_path,
      photo.thumbnail_path,
      photo.identity_thumbnail_path,
      eventPhotoPathFromUrl(photo.url),
      eventPhotoPathFromUrl(photo.thumbnail_url),
      eventPhotoPathFromUrl(photo.identity_thumbnail_url),
    ].filter(Boolean) as string[]));

    await Promise.allSettled([
      publicPaths.length ? supabase.storage.from("event-photos").remove(publicPaths) : Promise.resolve(),
      photo.original_path ? supabase.storage.from("event-originals").remove([photo.original_path]) : Promise.resolve(),
    ]);
  }

  async function deletePhotos(photos: PhotoRow[], label: string, albumId?: string) {
    if (!requireStaff() || !photos.length) return;

    const protectedPhotos = photos.filter(isProtectedPhoto);
    const deletable = photos.filter((photo) => !isProtectedPhoto(photo));

    if (!deletable.length) {
      toast.error("These photos are already claimed or used by an order, so they were kept.");
      return;
    }

    const extra = protectedPhotos.length
      ? `\n\n${protectedPhotos.length} protected photo${protectedPhotos.length === 1 ? "" : "s"} will be kept.`
      : "";

    if (!confirm(`Delete ${deletable.length} photo${deletable.length === 1 ? "" : "s"} from ${label}?${extra}`)) return;

    setBulkDeleting(true);
    try {
      const ids = deletable.map((photo) => photo.id);
      const removed = await withTimeout(
        supabase.from("photos").delete().in("id", ids),
        15_000,
        "Bulk delete timed out.",
      );
      if (removed.error) throw removed.error;

      await Promise.allSettled(deletable.map(removePhotoFiles));

      const deletedIds = new Set(ids);
      const affectedAlbumIds = Array.from(new Set(
        deletable.map((photo) => photo.album_id).filter(Boolean) as string[],
      ));
      for (const affectedAlbumId of affectedAlbumIds) {
        const remainingInAlbum = data.photos.some((photo) =>
          photo.album_id === affectedAlbumId
          && !deletedIds.has(photo.id)
          && !photo.is_separator
        );
        if (!remainingInAlbum) {
          await (supabase as any).from("photo_albums").delete().eq("id", affectedAlbumId);
        }
      }

      if (albumId && protectedPhotos.length === 0) {
        await (supabase as any).from("photo_albums").delete().eq("id", albumId);
      }

      setSelectedPhotoIds((current) => {
        const next = new Set(current);
        for (const id of ids) next.delete(id);
        return next;
      });

      toast.success(
        `${deletable.length} photo${deletable.length === 1 ? "" : "s"} deleted${protectedPhotos.length ? ` · ${protectedPhotos.length} protected kept` : ""}`,
      );
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photos could not be deleted.");
    } finally {
      setBulkDeleting(false);
    }
  }

  async function deletePhoto(photo: PhotoRow) {
    await deletePhotos([photo], photo.file_name ?? "this photo");
  }

  async function deleteAlbum(albumId: string) {
    const album = data.photoAlbums.find((item) => item.id === albumId);
    if (!album) return;
    const albumPhotos = data.photos.filter((photo) => photo.album_id === albumId && !photo.is_separator);

    if (!albumPhotos.length) {
      if (!confirm(`Delete empty album "${album.name}"?`)) return;
      const result = await (supabase as any).from("photo_albums").delete().eq("id", albumId);
      if (result.error) return toast.error(result.error.message);
      toast.success("Album deleted");
      await refetch();
      return;
    }

    await deletePhotos(albumPhotos, `album "${album.name}"`, albumId);
  }

  function togglePhotoSelection(id: string) {
    setSelectedPhotoIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllManaged() {
    setSelectedPhotoIds(new Set(managedPhotos.map((photo) => photo.id)));
  }

  async function deleteSelected() {
    const selected = data.photos.filter((photo) => selectedPhotoIds.has(photo.id));
    await deletePhotos(selected, "selected photos");
  }

  function startReplace(photo: PhotoRow) {
    if (!requireStaff()) return;
    setReplaceTarget(photo);
    if (replaceRef.current) {
      replaceRef.current.value = "";
      replaceRef.current.click();
    }
  }

  async function replacePhoto(file: File) {
    const photo = replaceTarget;
    if (!photo) return;

    setBusyPhotoId(photo.id);
    try {
      const prepared = await prepareImage(file, photo.photo_type === "solo");
      const duplicate = data.photos.find((item) =>
        item.id !== photo.id
        && item.content_hash === prepared.hash
        && item.photo_type === photo.photo_type
        && (item.event_group_id ?? null) === (photo.event_group_id ?? null),
      );
      if (duplicate) throw new Error("That image already exists in this gallery.");

      const uuid = crypto.randomUUID();
      const base = `${data.event!.id}/${photo.event_group_id ?? "general"}/${photo.photo_type}`;
      const previewPath = `${base}/preview/${uuid}.webp`;
      const thumbnailPath = `${base}/thumb/${uuid}.webp`;
      const identityPath = photo.photo_type === "solo" ? `${base}/identity/${uuid}.webp` : null;

      const [previewUpload, thumbUpload] = await Promise.all([
        supabase.storage.from("event-photos").upload(previewPath, prepared.preview.blob, { upsert: false, contentType: "image/webp" }),
        supabase.storage.from("event-photos").upload(thumbnailPath, prepared.thumb.blob, { upsert: false, contentType: "image/webp" }),
      ]);
      if (previewUpload.error) throw previewUpload.error;
      if (thumbUpload.error) throw thumbUpload.error;

      let identityPublicUrl: string | null = null;
      if (identityPath && prepared.identity) {
        const identityUpload = await supabase.storage.from("event-photos").upload(identityPath, prepared.identity.blob, { upsert: false, contentType: "image/webp" });
        if (identityUpload.error) throw identityUpload.error;
        identityPublicUrl = supabase.storage.from("event-photos").getPublicUrl(identityPath).data.publicUrl;
      }

      const { data: previewPublic } = supabase.storage.from("event-photos").getPublicUrl(previewPath);
      const { data: thumbPublic } = supabase.storage.from("event-photos").getPublicUrl(thumbnailPath);

      const legacyPatch = {
        url: previewPublic.publicUrl,
        file_name: file.name,
        storage_path: previewPath,
      };
      const richPatch = {
        ...legacyPatch,
        thumbnail_url: thumbPublic.publicUrl,
        original_path: null,
        preview_path: previewPath,
        thumbnail_path: thumbnailPath,
        identity_thumbnail_path: identityPath,
        identity_thumbnail_url: identityPublicUrl,
        content_hash: prepared.hash,
        original_size: file.size,
        width: prepared.preview.width,
        height: prepared.preview.height,
      };

      await updatePhotoRecord(photo.id, richPatch, legacyPatch);

      if (photo.participant_id && identityPublicUrl) {
        await supabase.from("participants").update({ thumbnail_url: identityPublicUrl }).eq("id", photo.participant_id);
      }

      const oldPublicPaths = [photo.preview_path, photo.thumbnail_path, photo.identity_thumbnail_path].filter(Boolean) as string[];
      const oldStoragePath = photo.storage_path;
      await Promise.allSettled([
        oldStoragePath ? supabase.storage.from("event-photos").remove([oldStoragePath]) : Promise.resolve(),
        oldPublicPaths.length ? supabase.storage.from("event-photos").remove(oldPublicPaths) : Promise.resolve(),
      ]);

      toast.success("Photo replaced");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photo could not be replaced.");
    } finally {
      setBusyPhotoId(null);
      setReplaceTarget(null);
    }
  }

  async function movePhoto(photo: PhotoRow, nextGroupId: string) {
    if (!requireStaff()) return;
    const group = data.eventGroups.find((item) => item.id === nextGroupId) ?? null;
    setBusyPhotoId(photo.id);
    try {
      const result = await withTimeout(
        supabase.from("photos").update({
          event_group_id: group?.id ?? null,
          group_name: group?.name ?? photo.group_name,
        } as never).eq("id", photo.id),
        12_000,
        "Moving photo took too long.",
      );
      if (result.error) throw result.error;
      toast.success("Photo moved");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photo could not be moved.");
    } finally {
      setBusyPhotoId(null);
    }
  }

  async function optimizeExisting() {
    if (!requireStaff() || !legacyPhotos.length) return;
    setOptimizingLegacy(true);
    let optimized = 0;
    let failed = 0;

    for (const photo of legacyPhotos) {
      try {
        const response = await fetch(photo.url);
        if (!response.ok) throw new Error("Could not download legacy photo.");
        const blob = await response.blob();
        const file = new File([blob], photo.file_name || `photo-${photo.id}.jpg`, { type: blob.type || "image/jpeg" });
        const prepared = await prepareImage(file);
        const base = `${data.event!.id}/${photo.event_group_id ?? "general"}/${photo.photo_type}`;
        const uuid = crypto.randomUUID();
        const previewPath = `${base}/preview/${uuid}.webp`;
        const thumbnailPath = `${base}/thumb/${uuid}.webp`;

        const [previewUpload, thumbUpload] = await Promise.all([
          supabase.storage.from("event-photos").upload(previewPath, prepared.preview.blob, { upsert: false, contentType: "image/webp" }),
          supabase.storage.from("event-photos").upload(thumbnailPath, prepared.thumb.blob, { upsert: false, contentType: "image/webp" }),
        ]);
        if (previewUpload.error) throw previewUpload.error;
        if (thumbUpload.error) throw thumbUpload.error;

        const { data: previewPublic } = supabase.storage.from("event-photos").getPublicUrl(previewPath);
        const { data: thumbPublic } = supabase.storage.from("event-photos").getPublicUrl(thumbnailPath);

        const legacyPatch = { url: previewPublic.publicUrl };
        const richPatch = {
          ...legacyPatch,
          thumbnail_url: thumbPublic.publicUrl,
          preview_path: previewPath,
          thumbnail_path: thumbnailPath,
          content_hash: photo.content_hash || prepared.hash,
          original_size: photo.original_size || file.size,
          width: prepared.preview.width,
          height: prepared.preview.height,
        };

        await updatePhotoRecord(photo.id, richPatch, legacyPatch);
        optimized += 1;
      } catch {
        failed += 1;
      }
    }

    setOptimizingLegacy(false);
    if (optimized) toast.success(`${optimized} existing photo${optimized === 1 ? "" : "s"} optimized`);
    if (failed) toast.error(`${failed} existing photo${failed === 1 ? "" : "s"} could not be optimized`);
    await refetch();
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={data.event.name}
        title="Gallery"
        description="Upload once, share the client gallery, and manage every photo from one workspace."
      />

      <section className="rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-4 p-4 lg:flex-row lg:items-center">
          <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4">
            <div><p className="text-[0.65rem] font-bold uppercase tracking-[.1em] text-muted-foreground">Solo</p><p className="mt-1 font-display text-2xl font-extrabold">{soloPhotos.length}</p></div>
            <div><p className="text-[0.65rem] font-bold uppercase tracking-[.1em] text-muted-foreground">Waiting</p><p className={cn("mt-1 font-display text-2xl font-extrabold", waitingSolo.length > 0 && "text-warning")}>{waitingSolo.length}</p></div>
            <div><p className="text-[0.65rem] font-bold uppercase tracking-[.1em] text-muted-foreground">Claimed</p><p className="mt-1 font-display text-2xl font-extrabold">{claimedSolo.length}</p></div>
            <div><p className="text-[0.65rem] font-bold uppercase tracking-[.1em] text-muted-foreground">Class</p><p className="mt-1 font-display text-2xl font-extrabold">{groupPhotos.length}</p></div>
          </div>

          <div className="flex flex-col gap-2 lg:items-end">
            <div className={cn(
              "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-xs font-semibold",
              soloPhotos.length > 0 && groupPhotos.length > 0 && groupPackages.length > 0 && Boolean(data.event.payment_instructions)
                ? "border-primary/25 bg-primary/5 text-foreground"
                : "border-warning/30 bg-warning/5 text-warning",
            )}>
              <span className={cn("size-2 rounded-full", soloPhotos.length > 0 && groupPhotos.length > 0 && groupPackages.length > 0 && Boolean(data.event.payment_instructions) ? "bg-primary" : "bg-warning")} />
              {soloPhotos.length > 0 && groupPhotos.length > 0 && groupPackages.length > 0 && Boolean(data.event.payment_instructions)
                ? "Ready to share"
                : "Needs setup"}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => void copyLink(hasGroups && selectedGroup ? galleryUrl(selectedGroup.id) : baseGalleryUrl, selectedGroup?.name ?? data.event!.name)}>
                <Copy className="size-4" /> Copy link
              </Button>
              <Button size="sm" asChild><a href={hasGroups && selectedGroup ? galleryUrl(selectedGroup.id) : baseGalleryUrl} target="_blank" rel="noreferrer">Open gallery <ExternalLink className="size-4" /></a></Button>
              {hasGroups ? <Button size="sm" variant="ghost" onClick={() => setLinksOpen((value) => !value)}><Link2 className="size-4" /> {linksOpen ? "Hide class links" : "Class links"}</Button> : null}
            </div>
          </div>
        </div>

        {linksOpen && hasGroups ? (
          <div className="grid gap-2 border-t border-border p-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.eventGroups.map((group) => {
              const url = galleryUrl(group.id);
              const count = soloPhotos.filter((photo) => photo.event_group_id === group.id && !photo.participant_id).length;
              return (
                <div key={group.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/10 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{group.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{count} waiting portrait{count === 1 ? "" : "s"}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => void copyLink(url, group.name)}>{copiedUrl === url ? "Copied" : "Copy"}</Button>
                  <Button size="sm" variant="ghost" asChild><a href={url} target="_blank" rel="noreferrer"><ExternalLink className="size-3.5" /></a></Button>
                </div>
              );
            })}
          </div>
        ) : null}
      </section>

      {waitingSolo.length > 0 ? (
        <div className="mt-3 flex flex-col gap-3 rounded-lg border border-warning/25 bg-warning/5 p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{waitingSolo.length} portrait{waitingSolo.length === 1 ? "" : "s"} still waiting to be claimed</p>
            <p className="mt-0.5 text-xs text-muted-foreground">These are the photos most likely to need your attention.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => { setManagerType("solo"); setManagerStatus("waiting"); document.getElementById("manage-gallery")?.scrollIntoView({ behavior: "smooth", block: "start" }); }}>
            View waiting
          </Button>
        </div>
      ) : null}

      <section id="manage-gallery" className="mt-8 scroll-mt-24 border-t border-border pt-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="eyebrow">Photo manager</p><h2 className="mt-1 font-display text-2xl font-extrabold">Gallery workspace</h2><p className="mt-1 text-sm text-muted-foreground">{managedPhotos.length} of {data.photos.filter((photo) => !photo.is_separator).length} photos shown · claimed portraits show client names first</p></div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <label className="relative sm:col-span-2 lg:col-span-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={managerSearch} onChange={(event) => setManagerSearch(event.target.value)} placeholder="Search name, contact or file…" />
            </label>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={managerType} onChange={(event) => setManagerType(event.target.value as ManagerType)}>
              <option value="all">All photos</option><option value="solo">Solo</option><option value="group">Class photo</option>
            </select>
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={managerStatus} onChange={(event) => setManagerStatus(event.target.value as ManagerStatus)}>
              <option value="all">Any status</option><option value="waiting">Waiting</option><option value="claimed">Claimed</option>
            </select>
            {hasGroups ? (
              <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={managerGroup} onChange={(event) => setManagerGroup(event.target.value)}>
                <option value="all">All classes</option>
                {data.eventGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
            ) : null}
            <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={managerAlbum} onChange={(event) => setManagerAlbum(event.target.value)}>
              <option value="all">All albums</option>
              <option value="none">No album</option>
              {visibleAlbums.map((album) => <option key={album.id} value={album.id}>{album.name}</option>)}
            </select>
          </div>
        </div>

        {managedPhotos.length ? (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/10 p-2">
              <Button size="sm" variant="outline" onClick={selectAllManaged}>Select all shown</Button>
              {selectedPhotoIds.size ? <Button size="sm" variant="ghost" onClick={() => setSelectedPhotoIds(new Set())}>Clear selection</Button> : null}
              <div className="ml-auto text-xs text-muted-foreground">{selectedPhotoIds.size ? `${selectedPhotoIds.size} selected` : "Nothing selected"}</div>
              {selectedPhotoIds.size ? <Button size="sm" variant="ghost" disabled={bulkDeleting} onClick={() => void deleteSelected()}><Trash2 className="size-3.5" /> {bulkDeleting ? "Deleting…" : "Delete selected"}</Button> : null}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {managedPhotos.map((photo) => {
              const group = data.eventGroups.find((item) => item.id === photo.event_group_id);
              const participant = data.participants.find((item) => item.id === photo.participant_id);
              const busy = busyPhotoId === photo.id;
              return (
                <div key={photo.id} className={cn("overflow-hidden rounded-lg border bg-card", selectedPhotoIds.has(photo.id) ? "border-primary ring-1 ring-primary" : "border-border")}>
                  <div className="relative bg-muted/20">
                    <img
                      src={photoImage(photo)}
                      alt={participant?.full_name ?? photo.file_name ?? "Gallery photo"}
                      loading="lazy"
                      decoding="async"
                      className={cn("w-full object-cover", photo.photo_type === "group" ? "aspect-[4/3]" : "aspect-[3/4]")}
                    />
                    <span className="absolute left-2 top-2 rounded-md bg-black/75 px-2 py-1 text-[0.58rem] font-bold uppercase tracking-[.1em] text-white">{photo.photo_type === "group" ? "Class" : photo.participant_id ? "Claimed" : "Waiting"}</span>
                    <button
                      type="button"
                      aria-label={selectedPhotoIds.has(photo.id) ? "Unselect photo" : "Select photo"}
                      onClick={() => togglePhotoSelection(photo.id)}
                      className={cn("absolute right-2 top-2 grid size-7 place-items-center rounded-md border backdrop-blur", selectedPhotoIds.has(photo.id) ? "border-primary bg-primary text-primary-foreground" : "border-white/20 bg-black/65 text-white")}
                    >
                      {selectedPhotoIds.has(photo.id) ? <Check className="size-4" /> : <span className="size-3 rounded-sm border border-current" />}
                    </button>
                  </div>
                  <div className="p-3">
                    <p className={cn("truncate font-semibold", participant ? "text-sm text-foreground" : "text-xs")}>
                      {participant?.full_name ?? photo.file_name ?? "Photo"}
                    </p>
                    {participant ? (
                      <>
                        <p className="mt-1 truncate text-[0.68rem] text-muted-foreground">
                          {participant.organization || group?.name || photo.group_name || "No congregation"}
                          {participant.contact_number ? ` · ${participant.contact_number}` : ""}
                        </p>
                        <p className="mt-1 truncate font-mono text-[0.58rem] text-muted-foreground/70">
                          Original: {photo.file_name ?? "Unknown file"}
                        </p>
                      </>
                    ) : (
                      <p className="mt-1 truncate text-[0.65rem] text-muted-foreground">
                        {group?.name ?? photo.group_name ?? "Event gallery"}{photo.original_size ? ` · ${formatBytes(photo.original_size)}` : ""}
                      </p>
                    )}
                    {photo.album_id ? <p className="mt-1 truncate text-[0.62rem] text-muted-foreground">{data.photoAlbums.find((album) => album.id === photo.album_id)?.name ?? "Album"}</p> : null}

                    {hasGroups ? (
                      <select
                        className="mt-3 h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        value={photo.event_group_id ?? ""}
                        onChange={(event) => void movePhoto(photo, event.target.value)}
                        disabled={busy || Boolean(photo.participant_id)}
                      >
                        <option value="">No class</option>
                        {data.eventGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                      </select>
                    ) : null}

                    <div className="mt-3 grid grid-cols-2 gap-2">
                      {photo.photo_type === "solo" && !photo.participant_id ? (
                        <Button size="sm" onClick={() => startAssist(photo)} disabled={busy}><UserRoundPlus className="size-3.5" /> Assist client</Button>
                      ) : photo.photo_type === "solo" && photo.participant_id ? (
                        <Button size="sm" variant="outline" onClick={() => void releaseClaim(photo)} disabled={busy}><X className="size-3.5" /> Release claim</Button>
                      ) : (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => startReplace(photo)}><RefreshCw className="size-3.5" /> Replace</Button>
                      )}
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => void deletePhoto(photo)}><Trash2 className="size-3.5" /> Delete</Button>
                    </div>
                  </div>
                </div>
              );
            })}
            </div>
          </>
        ) : (
          <EmptyState title="No photos match these filters" description="Change the filters or upload new photos." />
        )}
      </section>


      {legacyPhotos.length ? (
        <div className="mt-5 rounded-lg border border-border bg-card">
          <button type="button" onClick={() => setMaintenanceOpen((value) => !value)} className="flex w-full items-center gap-3 p-3 text-left">
            <RefreshCw className={cn("size-4 text-muted-foreground", optimizingLegacy && "animate-spin")} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Gallery maintenance</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{legacyPhotos.length} older upload{legacyPhotos.length === 1 ? "" : "s"} can be optimized</p>
            </div>
            <span className="text-xs text-muted-foreground">{maintenanceOpen ? "Hide" : "Open"}</span>
          </button>
          {maintenanceOpen ? (
            <div className="flex flex-col gap-3 border-t border-border p-3 sm:flex-row sm:items-center">
              <p className="min-w-0 flex-1 text-xs text-muted-foreground">Creates faster gallery previews and thumbnails. Existing source images stay available.</p>
              <Button size="sm" variant="outline" onClick={() => void optimizeExisting()} disabled={optimizingLegacy}>
                <RefreshCw className={cn("size-4", optimizingLegacy && "animate-spin")} />
                {optimizingLegacy ? "Optimizing…" : "Optimize existing"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="mt-5">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Upload photos</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Open only when you need to add another solo batch or official class photo.</p>
          </div>
          <Button size="sm" onClick={() => setUploadOpen((value) => !value)}>
            <Upload className="size-4" /> {uploadOpen ? "Close upload" : "Upload photos"}
          </Button>
        </div>
        {uploadOpen ? (
          <div className="mt-3">
            <Panel className="mt-5" title="Upload photos" description="Originals stay on your computer. PhotoFlow uploads only optimized gallery previews and thumbnails.">
              <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
                <div>
                  <Label>Photo type</Label>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button type="button" disabled={uploading} onClick={() => { setUploadType("solo"); setFiles([]); }} className={cn("rounded-lg border p-4 text-left", uploadType === "solo" ? "border-primary bg-primary/5" : "border-border bg-muted/10")}>
                      <ImagePlus className="size-5 text-primary" /><p className="mt-3 text-sm font-semibold">Solo photos</p><p className="mt-1 text-xs text-muted-foreground">Client chooses their own photo.</p>
                    </button>
                    <button type="button" disabled={uploading} onClick={() => { setUploadType("group"); setFiles([]); }} className={cn("rounded-lg border p-4 text-left", uploadType === "group" ? "border-primary bg-primary/5" : "border-border bg-muted/10")}>
                      <UsersRound className="size-5 text-primary" /><p className="mt-3 text-sm font-semibold">Class photo</p><p className="mt-1 text-xs text-muted-foreground">Official package image.</p>
                    </button>
                  </div>
                </div>

                <div className="grid content-start gap-4">
                  {hasGroups ? (
                    <label className="grid gap-1.5">
                      <Label>Batch / Class</Label>
                      <select disabled={uploading} className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>
                        {data.eventGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <div className="rounded-lg border border-border bg-muted/10 px-3 py-2.5">
                      <p className="text-xs font-semibold text-foreground">{data.event!.name}</p>
                      <p className="mt-0.5 text-[0.68rem] text-muted-foreground">Event-level gallery</p>
                    </div>
                  )}

                  <label className="grid gap-1.5">
                    <Label>Album name <span className="font-normal text-muted-foreground">(optional)</span></Label>
                    <Input
                      disabled={uploading}
                      value={albumName}
                      onChange={(event) => setAlbumName(event.target.value)}
                      placeholder={selectedGroup?.name ? `${selectedGroup.name} · Upload 1` : "e.g. Morning session · Upload 1"}
                    />
                  </label>

                  <div
                    className={cn(
                      "rounded-xl border border-dashed p-6 text-center transition",
                      dragging ? "border-primary bg-primary/5" : "border-border bg-muted/10",
                      uploading && "pointer-events-none opacity-70",
                    )}
                    onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDragging(false);
                      chooseFiles(Array.from(event.dataTransfer.files));
                    }}
                  >
                    <Upload className="mx-auto size-7 text-primary" />
                    <p className="mt-3 text-sm font-semibold">Drop photos here</p>
                    <p className="mt-1 text-xs text-muted-foreground">or choose files from your computer</p>
                    <Button className="mt-4" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={uploading}>Choose files</Button>
                    <input
                      ref={fileRef}
                      className="hidden"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple={uploadType === "solo"}
                      onChange={(event) => chooseFiles(Array.from(event.target.files ?? []))}
                    />
                  </div>

                  {files.length && !uploading ? (
                    <div className="rounded-lg border border-border bg-muted/15 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div><p className="text-sm font-semibold">{files.length} file{files.length === 1 ? "" : "s"} ready</p><p className="mt-1 text-xs text-muted-foreground">{formatBytes(files.reduce((sum, file) => sum + file.size, 0))} original size</p></div>
                        <Button size="sm" variant="ghost" onClick={() => { setFiles([]); if (fileRef.current) fileRef.current.value = ""; }}><X className="size-4" /> Clear</Button>
                      </div>
                      <div className="mt-3 max-h-28 space-y-1 overflow-auto text-xs text-muted-foreground">
                        {files.map((file) => <div key={`${file.name}-${file.size}`} className="flex justify-between gap-3"><span className="truncate">{file.name}</span><span className="shrink-0">{formatBytes(file.size)}</span></div>)}
                      </div>
                    </div>
                  ) : null}

                  {uploadStates.length ? (
                    <div className={cn(
                      "rounded-xl border p-4",
                      uploadResult ? "border-primary/30 bg-primary/[.035]" : "border-border bg-card",
                    )}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            {uploadResult ? <span className="grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-4" /></span> : null}
                            <p className="text-sm font-semibold">{uploading ? "Uploading…" : uploadResult ? "Done" : "Upload finished"}</p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {currentUpload
                              ? `${currentUpload.name} · ${currentUpload.status}`
                              : uploadResult
                                ? `${uploadResult.uploaded} added to “${uploadResult.albumName}” · ${uploadResult.skipped} skipped · ${uploadResult.failed} failed`
                                : `${uploadDone} uploaded · ${uploadSkipped} skipped · ${uploadFailed} failed`}
                          </p>
                        </div>
                        <p className="font-display text-2xl font-extrabold">{uploadPercent}%</p>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width] duration-300" style={{ width: `${uploadPercent}%` }} /></div>
                      {!uploadResult || uploadFailed ? (
                        <div className="mt-3 max-h-36 space-y-1 overflow-auto">
                          {uploadStates.map((item) => (
                            <div key={item.name} className="flex items-center justify-between gap-3 text-xs">
                              <span className="truncate">{item.name}</span>
                              <span className={cn(
                                "shrink-0",
                                item.tone === "done" && "text-success",
                                item.tone === "duplicate" && "text-warning",
                                item.tone === "error" && "text-destructive",
                              )}>{item.status}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}

                      {uploadResult ? (
                        <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
                          <Button size="sm" onClick={viewUploadedAlbum}><FolderOpen className="size-4" /> View album</Button>
                          <Button size="sm" variant="outline" onClick={resetUploader}><Upload className="size-4" /> Upload more</Button>
                          <Button size="sm" variant="outline" asChild>
                            <a href={galleryUrl(uploadResult.groupId ?? undefined)} target="_blank" rel="noreferrer">Open client gallery <ExternalLink className="size-4" /></a>
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {!uploadResult ? (
                    <div><Button onClick={() => void upload()} disabled={uploading || !files.length}><Upload className="size-4" /> {uploading ? `Uploading ${uploadPercent}%` : "Upload to gallery"}</Button></div>
                  ) : null}
                </div>
              </div>
            </Panel>


          </div>
        ) : null}
      </section>

      <section className="mt-8 border-t border-border pt-7">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Albums</p>
            <h2 className="mt-1 font-display text-2xl font-extrabold">Upload sets</h2>
            <p className="mt-1 text-sm text-muted-foreground">Each upload session stays together so you can manage or remove it in one action.</p>
          </div>
          {managerAlbum !== "all" ? <Button size="sm" variant="ghost" onClick={() => setManagerAlbum("all")}>Show all photos</Button> : null}
        </div>

        {visibleAlbums.length ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {visibleAlbums.map((album) => {
              const albumPhotos = data.photos.filter((photo) => photo.album_id === album.id && !photo.is_separator);
              const protectedCount = albumPhotos.filter(isProtectedPhoto).length;
              const group = data.eventGroups.find((item) => item.id === album.event_group_id);
              return (
                <div key={album.id} className={cn("rounded-lg border bg-card p-4", managerAlbum === album.id ? "border-primary/50 bg-primary/[.03]" : "border-border")}>
                  <div className="flex items-start gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><FolderOpen className="size-5" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{album.name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{albumPhotos.length} photo{albumPhotos.length === 1 ? "" : "s"} · {group?.name ?? "General"} · {album.photo_type === "group" ? "Class photo" : "Solo"}</p>
                      {protectedCount ? <p className="mt-1 text-xs text-warning">{protectedCount} protected by claim/order</p> : null}
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant={managerAlbum === album.id ? "default" : "outline"} onClick={() => setManagerAlbum(album.id)}>View album</Button>
                    <Button size="sm" variant="ghost" disabled={bulkDeleting} onClick={() => void deleteAlbum(album.id)}><Trash2 className="size-3.5" /> Delete album</Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-4 rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">Your next upload will automatically create an album.</div>
        )}
      </section>

      {assistPhoto ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-border p-5">
              <div>
                <p className="eyebrow">Staff assist</p>
                <h2 className="mt-1 font-display text-2xl font-extrabold">Help this participant order</h2>
                <p className="mt-1 text-sm text-muted-foreground">For participants who prefer help with the phone or ordering process.</p>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setAssistPhoto(null)} disabled={assistBusy}><X className="size-4" /></Button>
            </div>

            <div className="grid gap-5 p-5 md:grid-cols-[180px_1fr]">
              <div>
                <img src={photoImage(assistPhoto)} alt="Selected participant" className="aspect-[3/4] w-full rounded-lg border border-border object-cover" />
                <p className="mt-2 truncate text-center text-xs text-muted-foreground">{assistPhoto.file_name ?? "Selected photo"}</p>
              </div>

              <div className="grid gap-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5"><Label>Name</Label><Input value={assistForm.full_name} onChange={(event) => setAssistForm({ ...assistForm, full_name: event.target.value })} /></label>
                  <label className="grid gap-1.5"><Label>Congregation</Label><Input value={assistForm.organization} onChange={(event) => setAssistForm({ ...assistForm, organization: event.target.value })} /></label>
                  <label className="grid gap-1.5"><Label>Contact number</Label><Input inputMode="tel" value={assistForm.contact_number} onChange={(event) => setAssistForm({ ...assistForm, contact_number: event.target.value })} /></label>
                  <label className="grid gap-1.5"><Label>Email <span className="font-normal text-muted-foreground">(optional)</span></Label><Input type="email" value={assistForm.email} onChange={(event) => setAssistForm({ ...assistForm, email: event.target.value })} /></label>
                </div>

                <div className="border-t border-border pt-4">
                  <div className="flex items-end justify-between gap-3">
                    <div><p className="text-sm font-semibold">Create order now <span className="font-normal text-muted-foreground">(optional)</span></p><p className="mt-1 text-xs text-muted-foreground">You can save the participant only, or complete the order for them.</p></div>
                  </div>

                  <label className="mt-3 grid gap-1.5"><Label>Class package</Label>
                    <select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={assistPackageId} onChange={(event) => setAssistPackageId(event.target.value)}>
                      <option value="">Choose later</option>
                      {groupPackages.map((item) => <option key={item.id} value={item.id}>{item.code ? `${item.code} · ` : ""}{item.name} — ₱{Number(item.price).toLocaleString()}</option>)}
                    </select>
                  </label>

                  {soloAddons.length ? (
                    <div className="mt-4">
                      <Label>Solo add-ons</Label>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {soloAddons.map((item) => {
                          const qty = assistAddons[item.id] ?? 0;
                          return <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                            <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.name}</p><p className="mt-0.5 text-xs text-muted-foreground">₱{Number(item.price).toLocaleString()} · {item.print_size}</p></div>
                            <div className="flex items-center gap-2">
                              <Button type="button" size="icon" variant="outline" onClick={() => changeAssistAddon(item.id, -1)} disabled={!qty || assistBusy}>−</Button>
                              <span className="min-w-5 text-center text-sm font-bold">{qty}</span>
                              <Button type="button" size="icon" variant="outline" onClick={() => changeAssistAddon(item.id, 1)} disabled={assistBusy}>+</Button>
                            </div>
                          </div>;
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2 border-t border-border pt-4">
                  <Button variant="outline" onClick={() => void assistClient(false)} disabled={assistBusy}>{assistBusy ? "Saving…" : "Save participant only"}</Button>
                  <Button onClick={() => void assistClient(true)} disabled={assistBusy || !assistPackageId}><Check className="size-4" /> {assistBusy ? "Working…" : "Save & create order"}</Button>
                  <Button variant="ghost" onClick={() => setAssistPhoto(null)} disabled={assistBusy}>Cancel</Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <input
        ref={replaceRef}
        className="hidden"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void replacePhoto(file);
        }}
      />
    </AppShell>
  );
}