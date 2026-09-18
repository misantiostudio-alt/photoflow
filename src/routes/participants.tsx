import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import QRCode from "qrcode";
import {
  Camera,
  Check,
  Edit3,
  Play,
  Printer,
  QrCode,
  RotateCcw,
  Search,
  UserPlus,
  UserX,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { PersonAvatar } from "@/components/person-avatar";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { participantOrder, useOps, useSession, type ParticipantRow } from "@/lib/data";
import { paymentTone, type Tone } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/participants")({ component: ParticipantsPage });

type Filter = "all" | "waiting" | "shot" | "retake" | "no_show";

type ParticipantForm = {
  full_name: string;
  organization: string;
  event_group_id: string;
  contact_number: string;
  email: string;
  notes: string;
};

const EMPTY_FORM: ParticipantForm = {
  full_name: "",
  organization: "",
  event_group_id: "",
  contact_number: "",
  email: "",
  notes: "",
};

function normalized(value: string | null | undefined) {
  return (value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function shootingTone(status?: string | null): Tone {
  if (status === "shot" || status === "done" || status === "completed") return "success";
  if (status === "retake") return "warning";
  if (status === "no_show") return "danger";
  if (status === "skipped") return "info";
  return "neutral";
}

function isShot(status?: string | null) {
  return status === "shot" || status === "done" || status === "completed";
}

function isWaiting(status?: string | null) {
  return !isShot(status) && status !== "no_show";
}

function ParticipantsPage() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [groupFilter, setGroupFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ParticipantRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ParticipantForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [printIds, setPrintIds] = useState<string[]>([]);
  const [paper, setPaper] = useState<"letter" | "a4">("letter");
  const [qrMap, setQrMap] = useState<Record<string, string>>({});

  const groupsById = useMemo(
    () => new Map((data?.eventGroups || []).map((group) => [group.id, group])),
    [data?.eventGroups],
  );

  const filtered = useMemo(() => {
    const needle = normalized(search);
    return (data?.participants || []).filter((person) => {
      if (groupFilter !== "all" && (person.event_group_id || "ungrouped") !== groupFilter) return false;
      if (filter === "waiting" && !isWaiting(person.shooting_status)) return false;
      if (filter === "shot" && !isShot(person.shooting_status)) return false;
      if (filter === "retake" && person.shooting_status !== "retake") return false;
      if (filter === "no_show" && person.shooting_status !== "no_show") return false;
      if (!needle) return true;
      const group = person.event_group_id ? groupsById.get(person.event_group_id)?.name : "";
      return normalized([
        person.full_name,
        person.participant_code,
        person.organization,
        person.batch,
        person.contact_number,
        group,
      ].filter(Boolean).join(" ")).includes(needle);
    });
  }, [data?.participants, filter, groupFilter, groupsById, search]);

  const printPeople = useMemo(
    () => (data?.participants || []).filter((person) => printIds.includes(person.id)),
    [data?.participants, printIds],
  );

  useEffect(() => {
    let cancelled = false;
    async function buildQrCodes() {
      const next: Record<string, string> = {};
      for (const person of printPeople) {
        const url = typeof window === "undefined"
          ? "/shooting?participant=" + encodeURIComponent(person.id)
          : window.location.origin + "/shooting?participant=" + encodeURIComponent(person.id);
        try {
          next[person.id] = await QRCode.toDataURL(url, {
            width: 360,
            margin: 1,
            errorCorrectionLevel: "M",
          });
        } catch {
          next[person.id] = "";
        }
      }
      if (!cancelled) setQrMap(next);
    }
    if (printOpen && printPeople.length) void buildQrCodes();
    return () => { cancelled = true; };
  }, [printOpen, printPeople]);

  if (isLoading || !data) {
    return <AppShell><PageHeader eyebrow="Event day" title="People" /><LoadingGrid rows={7} /></AppShell>;
  }

  if (!email) {
    return (
      <AppShell>
        <EmptyState
          title="Staff sign-in required"
          description="People records, nameplates and Shooting Mode are private staff workflows."
          action={<Button asChild><Link to="/auth">Staff sign in</Link></Button>}
        />
      </AppShell>
    );
  }

  if (!data.event) {
    return (
      <AppShell>
        <EmptyState
          title="No active event"
          description="Create or select an event before adding people."
          action={<Button asChild><Link to="/events">Open Events</Link></Button>}
        />
      </AppShell>
    );
  }

  const counts = {
    all: data.participants.length,
    waiting: data.participants.filter((person) => isWaiting(person.shooting_status)).length,
    shot: data.participants.filter((person) => isShot(person.shooting_status)).length,
    retake: data.participants.filter((person) => person.shooting_status === "retake").length,
    no_show: data.participants.filter((person) => person.shooting_status === "no_show").length,
  };

  function nextParticipantCode() {
    const prefix = (data?.event?.id_prefix || "EVT").replace(/[^a-z0-9]/gi, "").toUpperCase() || "EVT";
    const max = data.participants.reduce((highest, person) => {
      const match = person.participant_code.match(/(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
    return prefix + "-" + String(max + 1).padStart(3, "0");
  }

  function startAdd() {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      event_group_id: data.eventGroups[0]?.id || "",
    });
    setFormOpen(true);
  }

  function startEdit(person: ParticipantRow) {
    setEditing(person);
    setForm({
      full_name: person.full_name,
      organization: person.organization || "",
      event_group_id: person.event_group_id || "",
      contact_number: person.contact_number || "",
      email: person.email || "",
      notes: person.notes || "",
    });
    setFormOpen(true);
  }

  async function saveParticipant() {
    const name = form.full_name.trim();
    if (!name) {
      toast.error("Please enter the participant's full name.");
      return;
    }

    const duplicate = data.participants.find((person) =>
      person.id !== editing?.id
      && normalized(person.full_name) === normalized(name)
      && (person.event_group_id || "") === (form.event_group_id || ""),
    );
    if (duplicate) {
      toast.error("Possible duplicate: " + duplicate.full_name + " is already in this batch.");
      return;
    }

    setSaving(true);
    try {
      const groupName = form.event_group_id ? groupsById.get(form.event_group_id)?.name || null : null;
      const payload = {
        event_id: data.event!.id,
        event_group_id: form.event_group_id || null,
        full_name: name,
        organization: form.organization.trim() || null,
        batch: groupName,
        contact_number: form.contact_number.trim() || null,
        email: form.email.trim() || null,
        notes: form.notes.trim() || null,
      };
      const db = supabase as any;
      const result = editing
        ? await withTimeout(
            db.from("participants").update(payload).eq("id", editing.id),
            12000,
            "Saving this participant took too long.",
          )
        : await withTimeout(
            db.from("participants").insert({
              ...payload,
              participant_code: nextParticipantCode(),
              shooting_status: "pending",
              gallery_status: "none",
            }),
            12000,
            "Adding this participant took too long.",
          );

      if (result.error) throw result.error;
      toast.success(editing ? "Participant updated" : "Participant added");
      setFormOpen(false);
      setEditing(null);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Participant could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function setShootingStatus(person: ParticipantRow, status: string) {
    try {
      const result = await withTimeout(
        (supabase as any).from("participants").update({ shooting_status: status }).eq("id", person.id),
        10000,
        "Updating status took too long.",
      );
      if (result.error) throw result.error;
      toast.success(status === "no_show" ? "Marked no show" : "Returned to waiting");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Status could not be updated.");
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openPrint(ids: string[]) {
    if (!ids.length) return;
    setPrintIds(ids);
    setPrintOpen(true);
  }

  function openShooting(person?: ParticipantRow) {
    const suffix = person ? "?participant=" + encodeURIComponent(person.id) : "";
    window.location.href = "/shooting" + suffix;
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow="Event day"
        title="People"
        description="Prepare the participant list, print QR nameplates, then run the portrait queue in Shooting Mode."
        actions={
          <>
            <Button variant="outline" onClick={() => openPrint([...selectedIds])} disabled={!selectedIds.size}>
              <Printer className="size-4" /> Print selected
            </Button>
            <Button variant="outline" onClick={() => openShooting()}>
              <Play className="size-4" /> Shooting Mode
            </Button>
            <Button onClick={startAdd}><UserPlus className="size-4" /> Add person</Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {([
          ["all", "All"],
          ["waiting", "Waiting"],
          ["shot", "Shot"],
          ["retake", "Retake"],
          ["no_show", "No show"],
        ] as Array<[Filter, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              "rounded-lg border px-3 py-2.5 text-left transition-colors",
              filter === key
                ? "border-primary/30 bg-primary/[0.08]"
                : "border-border bg-card/60 hover:border-primary/20",
            )}
          >
            <p className="font-mono text-lg font-bold">{counts[key]}</p>
            <p className="text-[0.62rem] font-semibold text-muted-foreground">{label}</p>
          </button>
        ))}
      </div>

      <Panel bodyClassName="p-3">
        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_auto]">
          <label className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="pl-9"
              placeholder="Search name, ID, congregation, contact…"
            />
          </label>
          <select
            value={groupFilter}
            onChange={(event) => setGroupFilter(event.target.value)}
            className="h-10 rounded-md border border-input px-3 text-sm"
          >
            <option value="all">All batches / classes</option>
            {data.eventGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
            <option value="ungrouped">Ungrouped</option>
          </select>
          <Button
            variant="outline"
            onClick={() => {
              if (selectedIds.size === filtered.length) setSelectedIds(new Set());
              else setSelectedIds(new Set(filtered.map((person) => person.id)));
            }}
          >
            <Check className="size-4" />
            {selectedIds.size === filtered.length && filtered.length ? "Clear selection" : "Select visible"}
          </Button>
        </div>
      </Panel>

      <div className="mt-4 grid gap-2">
        {filtered.map((person) => {
          const group = person.event_group_id ? groupsById.get(person.event_group_id) : null;
          const order = participantOrder(data, person.id);
          const selected = selectedIds.has(person.id);

          return (
            <article
              key={person.id}
              className={cn(
                "grid gap-3 rounded-lg border bg-card/70 p-3 transition-colors sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:items-center",
                selected ? "border-primary/35 bg-primary/[0.035]" : "border-border",
              )}
            >
              <button
                type="button"
                onClick={() => toggleSelected(person.id)}
                className={cn(
                  "grid size-9 place-items-center rounded-md border",
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background/40",
                )}
                aria-label={selected ? "Unselect " + person.full_name : "Select " + person.full_name}
              >
                {selected ? <Check className="size-4" /> : <span className="size-3 rounded-sm border border-muted-foreground/50" />}
              </button>

              <PersonAvatar person={person} size="lg" />

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate font-display text-base font-bold">{person.full_name}</h2>
                  <span className="font-mono text-[0.65rem] text-muted-foreground">{person.participant_code}</span>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {[group?.name || person.batch, person.organization].filter(Boolean).join(" · ") || "No batch / organization"}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusPill label={person.shooting_status || "pending"} tone={shootingTone(person.shooting_status)} size="sm" />
                  <StatusPill label={person.gallery_status || "none"} tone={person.gallery_status === "ready" ? "success" : "neutral"} size="sm" />
                  {order ? <StatusPill label={order.payment_status} tone={paymentTone(order.payment_status)} size="sm" /> : null}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 sm:max-w-[270px] sm:justify-end">
                <Button size="sm" variant="outline" onClick={() => openShooting(person)}>
                  <Camera className="size-3.5" /> Shoot
                </Button>
                <Button size="sm" variant="outline" onClick={() => openPrint([person.id])}>
                  <QrCode className="size-3.5" /> Nameplate
                </Button>
                <Button size="sm" variant="outline" onClick={() => startEdit(person)}>
                  <Edit3 className="size-3.5" /> Edit
                </Button>
                {person.shooting_status === "no_show" ? (
                  <Button size="sm" variant="ghost" onClick={() => void setShootingStatus(person, "pending")}>
                    <RotateCcw className="size-3.5" /> Waiting
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      if (window.confirm("Mark " + person.full_name + " as No Show?")) void setShootingStatus(person, "no_show");
                    }}
                  >
                    <UserX className="size-3.5" /> No show
                  </Button>
                )}
              </div>
            </article>
          );
        })}

        {!filtered.length ? (
          <EmptyState
            title="No people match this view"
            description="Try another status, batch or search term."
          />
        ) : null}
      </div>

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit participant" : "Add participant"}</DialogTitle>
            <DialogDescription>
              {editing ? editing.participant_code : "PhotoFlow will generate the next participant ID automatically."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <label className="grid gap-1.5">
              <Label>Full name</Label>
              <Input value={form.full_name} onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))} autoFocus />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <Label>Batch / class</Label>
                <select
                  value={form.event_group_id}
                  onChange={(event) => setForm((current) => ({ ...current, event_group_id: event.target.value }))}
                  className="h-10 rounded-md border border-input px-3 text-sm"
                >
                  <option value="">No batch</option>
                  {data.eventGroups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
                </select>
              </label>
              <label className="grid gap-1.5">
                <Label>Congregation / organization</Label>
                <Input value={form.organization} onChange={(event) => setForm((current) => ({ ...current, organization: event.target.value }))} />
              </label>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1.5">
                <Label>Contact number</Label>
                <Input value={form.contact_number} onChange={(event) => setForm((current) => ({ ...current, contact_number: event.target.value }))} />
              </label>
              <label className="grid gap-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} />
              </label>
            </div>
            <label className="grid gap-1.5">
              <Label>Notes</Label>
              <Textarea rows={4} value={form.notes} onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))} />
            </label>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button onClick={() => void saveParticipant()} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add participant"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={printOpen} onOpenChange={setPrintOpen}>
        <DialogContent className="max-h-[94vh] max-w-5xl overflow-y-auto p-0">
          <div className="photoflow-print-controls border-b border-border p-5">
            <DialogHeader>
              <DialogTitle>Print Nameplates</DialogTitle>
              <DialogDescription>
                QR opens the private staff Shooting Mode directly on that participant.
              </DialogDescription>
            </DialogHeader>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button size="sm" variant={paper === "letter" ? "default" : "outline"} onClick={() => setPaper("letter")}>Letter</Button>
              <Button size="sm" variant={paper === "a4" ? "default" : "outline"} onClick={() => setPaper("a4")}>A4</Button>
              <span className="ml-auto text-xs text-muted-foreground">{printPeople.length} nameplate{printPeople.length === 1 ? "" : "s"}</span>
              <Button onClick={() => window.print()}><Printer className="size-4" /> Print</Button>
            </div>
          </div>

          <style media="print">{paper === "a4" ? "@page { size: A4 portrait; margin: 8mm; }" : "@page { size: Letter portrait; margin: 8mm; }"}</style>

          <div className="photoflow-nameplate-print-area bg-white p-5 text-black">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {printPeople.map((person) => {
                const group = person.event_group_id ? groupsById.get(person.event_group_id) : null;
                return (
                  <section key={person.id} className="photoflow-nameplate-card break-inside-avoid rounded-xl border-2 border-black bg-white p-5 text-black">
                    <div className="flex items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em]">PhotoFlow · {data.event?.name}</p>
                        <h2 className="mt-5 break-words text-3xl font-black leading-[0.98] tracking-[-0.04em]">{person.full_name}</h2>
                        <p className="mt-3 font-mono text-lg font-bold">{person.participant_code}</p>
                        <p className="mt-2 text-sm font-semibold">{group?.name || person.batch || "General"}</p>
                        {person.organization ? <p className="mt-1 text-xs">{person.organization}</p> : null}
                      </div>
                      <div className="shrink-0 text-center">
                        {qrMap[person.id] ? <img src={qrMap[person.id]} alt="" className="size-28" /> : <div className="size-28 animate-pulse bg-gray-100" />}
                        <p className="mt-1 text-[8px] font-bold uppercase tracking-[0.14em]">Scan for Shooting</p>
                      </div>
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
