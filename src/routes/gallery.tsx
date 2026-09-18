import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Copy, ExternalLink, ImagePlus, Link2, Upload, UsersRound } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { useOps, useSession, type PhotoType } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/gallery")({ component: GalleryWorkspace });

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-");
}

function GalleryWorkspace() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploadType, setUploadType] = useState<PhotoType>("solo");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [manualGroupName, setManualGroupName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedGroupId && data?.eventGroups.length) setSelectedGroupId(data.eventGroups[0].id);
  }, [data?.eventGroups, selectedGroupId]);

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

  const soloPhotos = useMemo(() => data?.photos.filter((photo) => photo.photo_type !== "group" && !photo.is_separator) ?? [], [data?.photos]);
  const groupPhotos = useMemo(() => data?.photos.filter((photo) => photo.photo_type === "group" && !photo.is_separator) ?? [], [data?.photos]);
  const claimedSolo = soloPhotos.filter((photo) => photo.participant_id);
  const waitingSolo = soloPhotos.filter((photo) => !photo.participant_id);

  if (isLoading || !data) return <AppShell><PageHeader eyebrow="Client gallery" title="Gallery" /><LoadingGrid rows={6} /></AppShell>;
  if (!data.event) return <AppShell><EmptyState title="No event selected" description="Choose or create an event before opening its gallery workspace." action={<Button asChild><Link to="/events">Open Events</Link></Button>} /></AppShell>;

  const hasGroups = data.eventGroups.length > 0;
  const selectedGroup = data.eventGroups.find((group) => group.id === selectedGroupId) ?? null;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const baseGalleryUrl = `${origin}/gallery/${data.event.slug}?key=${data.event.share_token}`;

  function galleryUrl(groupId?: string) {
    const group = data.eventGroups.find((item) => item.id === groupId);
    return group ? `${origin}/gallery/${data.event.slug}?key=${group.share_token}` : baseGalleryUrl;
  }

  function requireStaff() {
    if (email) return true;
    void navigate({ to: "/auth" });
    return false;
  }

  async function copyLink(url: string, label: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success(`${label} gallery link copied`);
    } catch {
      toast.error("Could not copy the gallery link.");
    }
  }

  async function upload() {
    if (!requireStaff()) return;
    if (!files.length) return toast.error("Choose at least one photo.");
    if (hasGroups && !selectedGroup) return toast.error("Choose the class/batch for these photos.");
    if (uploadType === "group" && files.length > 1) return toast.error("Upload one official group photo at a time.");
    if (!hasGroups && uploadType === "group" && !manualGroupName.trim()) return toast.error("Enter a class/group label for this official photo.");

    setUploading(true);
    try {
      let sort = data.photos.length + 1;
      const groupName = selectedGroup?.name ?? (manualGroupName.trim() || null);
      for (const file of files) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${data.event.id}/${selectedGroup?.id ?? "general"}/${uploadType}/${crypto.randomUUID()}.${safeFileName(ext)}`;
        const storage = await withTimeout(
          supabase.storage.from("event-photos").upload(path, file, { upsert: false, contentType: file.type || undefined }),
          30_000,
          `Upload timed out for ${file.name}. Please try again.`,
        );
        if (storage.error) throw storage.error;
        const { data: publicUrl } = supabase.storage.from("event-photos").getPublicUrl(path);
        const row = {
          event_id: data.event.id,
          storage_path: path,
          event_group_id: selectedGroup?.id ?? null,
          participant_id: null,
          url: publicUrl.publicUrl,
          file_name: file.name,
          is_separator: false,
          favorite: false,
          sort_order: sort++,
          photo_type: uploadType,
          group_name: groupName,
        };
        const inserted = await withTimeout(
          supabase.from("photos").insert(row as never),
          12_000,
          "Photo metadata could not be saved in time.",
        );
        if (inserted.error) throw inserted.error;
      }
      toast.success(uploadType === "group" ? `${groupName ?? "Official"} group photo uploaded` : `${files.length} solo portrait${files.length === 1 ? "" : "s"} uploaded to ${groupName ?? "the event gallery"}`);
      setFiles([]);
      setManualGroupName("");
      if (fileRef.current) fileRef.current.value = "";
      await withTimeout(refetch(), 12_000, "Gallery refresh timed out. Your upload may already be saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Photos could not be uploaded.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <AppShell>
      <PageHeader eyebrow={data.event.name} title="Gallery" description="Each event stays separate. If the event has classes/batches, every batch gets its own photo set and shareable gallery link." />

      {hasGroups ? (
        <Panel className="mb-5" title="Batch / Class gallery links" description="Send only the correct link to each class. Clients never need to know or type their batch.">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.eventGroups.map((group) => {
              const url = galleryUrl(group.id);
              const count = soloPhotos.filter((photo) => photo.event_group_id === group.id && !photo.participant_id).length;
              return (
                <div key={group.id} className="rounded-lg border border-border bg-muted/10 p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{group.name}</p><p className="mt-1 text-xs text-muted-foreground">{count} portrait{count === 1 ? "" : "s"} waiting</p></div><Link2 className="size-4 text-primary" /></div>
                  <div className="mt-4 flex gap-2"><Button size="sm" variant="outline" onClick={() => void copyLink(url, group.name)}><Copy className="size-4" /> Copy link</Button><Button size="sm" asChild><a href={url} target="_blank" rel="noreferrer">Open <ExternalLink className="size-4" /></a></Button></div>
                </div>
              );
            })}
          </div>
        </Panel>
      ) : (
        <div className="mb-5 flex flex-wrap gap-2"><Button variant="outline" onClick={() => void copyLink(baseGalleryUrl, data.event!.name)}><Copy className="size-4" /> Copy gallery link</Button><Button asChild><a href={baseGalleryUrl} target="_blank" rel="noreferrer">Open client gallery <ExternalLink className="size-4" /></a></Button></div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Panel title="Solo portraits" description="Across this event"><p className="font-display text-3xl font-extrabold">{soloPhotos.length}</p></Panel>
        <Panel title="Waiting to be claimed" description="No name needed before shoot"><p className="font-display text-3xl font-extrabold">{waitingSolo.length}</p></Panel>
        <Panel title="Claimed" description="Identity already supplied"><p className="font-display text-3xl font-extrabold">{claimedSolo.length}</p></Panel>
        <Panel title="Class / group photos" description="Primary package source"><p className="font-display text-3xl font-extrabold">{groupPhotos.length}</p></Panel>
      </div>

      <Panel className="mt-5" title="Upload edited photos" description="Tag the upload to its batch once; PhotoFlow carries that batch through gallery, order and production automatically.">
        <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
          <div>
            <Label>What are you uploading?</Label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setUploadType("solo")} className={cn("rounded-lg border p-4 text-left", uploadType === "solo" ? "border-primary bg-primary/5" : "border-border bg-muted/10")}><ImagePlus className="size-5 text-primary" /><p className="mt-3 text-sm font-semibold">Solo portraits</p><p className="mt-1 text-xs text-muted-foreground">Choose-yourself photos.</p></button>
              <button type="button" onClick={() => setUploadType("group")} className={cn("rounded-lg border p-4 text-left", uploadType === "group" ? "border-primary bg-primary/5" : "border-border bg-muted/10")}><UsersRound className="size-5 text-primary" /><p className="mt-3 text-sm font-semibold">Class / group</p><p className="mt-1 text-xs text-muted-foreground">Official P1/P2/P3 image.</p></button>
            </div>
          </div>
          <div className="grid content-start gap-4">
            {hasGroups ? <label className="grid gap-1.5"><Label>Batch / Class</Label><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={selectedGroupId} onChange={(event) => setSelectedGroupId(event.target.value)}>{data.eventGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select><p className="text-xs text-muted-foreground">Only this batch will see these solo portraits in its shared gallery.</p></label> : uploadType === "group" ? <label className="grid gap-1.5"><Label>Class / group name</Label><Input value={manualGroupName} onChange={(event) => setManualGroupName(event.target.value)} placeholder="Official group" /></label> : null}
            <label className="grid gap-1.5"><Label>{uploadType === "group" ? "Official group photo" : "Edited solo portraits"}</Label><Input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple={uploadType === "solo"} onChange={(event) => setFiles(Array.from(event.target.files ?? []))} /></label>
            {files.length ? <div className="rounded-lg border border-border bg-muted/15 p-3 text-sm"><p className="font-semibold">{files.length} file{files.length === 1 ? "" : "s"} ready</p><p className="mt-1 truncate text-xs text-muted-foreground">{files.map((file) => file.name).join(" · ")}</p></div> : null}
            <div><Button onClick={() => void upload()} disabled={uploading || !files.length}><Upload className="size-4" /> {uploading ? "Uploading…" : "Upload to gallery"}</Button></div>
          </div>
        </div>
      </Panel>

      {hasGroups ? data.eventGroups.map((group) => {
        const groupOfficial = groupPhotos.filter((photo) => photo.event_group_id === group.id);
        const groupSolo = soloPhotos.filter((photo) => photo.event_group_id === group.id);
        return (
          <section key={group.id} className="mt-8 border-t border-border pt-7">
            <div className="mb-4"><p className="eyebrow">{group.name}</p><h2 className="mt-1 font-display text-2xl font-extrabold">Batch Gallery</h2><p className="mt-1 text-sm text-muted-foreground">{groupSolo.length} solo portraits · {groupOfficial.length} official group photo{groupOfficial.length === 1 ? "" : "s"}</p></div>
            {groupOfficial.length ? <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{groupOfficial.map((photo) => <div key={photo.id} className="overflow-hidden rounded-lg border border-border bg-card"><img src={photoUrls[photo.id] ?? ""} alt={group.name} className="aspect-[4/3] w-full object-cover" /><div className="p-3"><p className="font-semibold">Official {group.name} photo</p></div></div>)}</div> : null}
            {groupSolo.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{groupSolo.map((photo) => <div key={photo.id} className="overflow-hidden rounded-lg border border-border bg-card"><div className="relative"><img src={photoUrls[photo.id] ?? ""} alt={`${group.name} solo`} className="aspect-[3/4] w-full object-cover" />{photo.participant_id ? <span className="absolute left-2 top-2 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-3.5" /></span> : null}</div><div className="p-2.5"><p className="truncate text-xs font-semibold">{photo.participant_id ? "Claimed" : "Waiting for identification"}</p><p className="mt-1 truncate text-[0.65rem] text-muted-foreground">{photo.file_name ?? "Portrait"}</p></div></div>)}</div> : <EmptyState title={`No ${group.name} solo portraits yet`} description="Choose this batch in the upload form, then upload its edited solo portraits." />}
          </section>
        );
      }) : (
        <section className="mt-8 border-t border-border pt-7"><div className="mb-3"><p className="eyebrow">Choose yourself</p><h2 className="mt-1 font-display text-2xl font-extrabold">Solo Portrait Board</h2></div>{soloPhotos.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">{soloPhotos.map((photo) => <div key={photo.id} className="overflow-hidden rounded-lg border border-border bg-card"><img src={photoUrls[photo.id] ?? ""} alt="Solo portrait" className="aspect-[3/4] w-full object-cover" /></div>)}</div> : <EmptyState title="No solo portraits yet" description="Upload edited thumbnails after the shoot." />}</section>
      )}
    </AppShell>
  );
}
