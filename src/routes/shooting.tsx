import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  CircleDot,
  RotateCcw,
  Search,
  SkipForward,
  StickyNote,
  UserX,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid } from "@/components/page";
import { PersonAvatar } from "@/components/person-avatar";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { useOps, useSession, type ParticipantRow } from "@/lib/data";
import { type Tone } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/shooting")({ component: ShootingMode });

function isShot(status?: string | null) {
  return status === "shot" || status === "done" || status === "completed";
}

function statusTone(status?: string | null): Tone {
  if (isShot(status)) return "success";
  if (status === "retake") return "warning";
  if (status === "no_show") return "danger";
  if (status === "skipped") return "info";
  return "neutral";
}

function ShootingMode() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();

  const [groupFilter, setGroupFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState("");
  const notesRef = useRef<HTMLTextAreaElement | null>(null);

  const groupsById = useMemo(
    () => new Map((data?.eventGroups || []).map((group) => [group.id, group])),
    [data?.eventGroups],
  );

  const queue = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (data?.participants || []).filter((person) => {
      if (groupFilter !== "all" && (person.event_group_id || "ungrouped") !== groupFilter) return false;
      if (!needle) return true;
      const group = person.event_group_id ? groupsById.get(person.event_group_id)?.name : "";
      const haystack = [
        person.full_name,
        person.participant_code,
        person.organization,
        person.batch,
        group,
      ].filter(Boolean).join(" ").toLowerCase();
      return haystack.includes(needle);
    });
  }, [data?.participants, groupFilter, groupsById, search]);

  const current = useMemo(() => {
    if (!queue.length) return null;
    return queue.find((person) => person.id === currentId) || queue[0];
  }, [currentId, queue]);

  const currentIndex = current ? queue.findIndex((person) => person.id === current.id) : -1;
  const nextPerson = currentIndex >= 0 ? queue[currentIndex + 1] || null : null;
  const previousPerson = currentIndex > 0 ? queue[currentIndex - 1] : null;

  useEffect(() => {
    if (!data?.participants.length || currentId) return;
    const requested = typeof window === "undefined"
      ? null
      : new URLSearchParams(window.location.search).get("participant");
    const requestedPerson = requested ? data.participants.find((person) => person.id === requested) : null;
    const firstWaiting = data.participants.find((person) => !isShot(person.shooting_status) && person.shooting_status !== "no_show");
    setCurrentId(requestedPerson?.id || firstWaiting?.id || data.participants[0]?.id || null);
  }, [currentId, data?.participants]);

  useEffect(() => {
    if (!current) return;
    setNotesDraft(current.notes || "");
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("participant", current.id);
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [current]);

  useEffect(() => {
    if (!notesOpen) return;
    const timer = window.setTimeout(() => notesRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [notesOpen]);

  async function persistStatus(person: ParticipantRow, nextStatus: string) {
    const result = await withTimeout(
      (supabase as any).from("participants").update({ shooting_status: nextStatus }).eq("id", person.id),
      10000,
      "Updating the shooting queue took too long.",
    );
    if (result.error) throw result.error;
  }

  async function changeStatus(nextStatus: string, label: string, moveNext = false) {
    if (!current || busy) return;
    const person = current;
    const previousStatus = person.shooting_status || "pending";
    const nextId = moveNext ? (nextPerson?.id || null) : person.id;

    setBusy(true);
    try {
      await persistStatus(person, nextStatus);
      await refetch();
      if (moveNext && nextId) setCurrentId(nextId);
      toast.success(label, {
        action: {
          label: "Undo",
          onClick: () => {
            void (async () => {
              try {
                await persistStatus(person, previousStatus);
                setCurrentId(person.id);
                await refetch();
                toast.success("Status restored");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Undo failed.");
              }
            })();
          },
        },
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Shooting status could not be updated.");
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    if (!current || busy) return;
    setBusy(true);
    try {
      const result = await withTimeout(
        (supabase as any).from("participants").update({ notes: notesDraft.trim() || null }).eq("id", current.id),
        10000,
        "Saving notes took too long.",
      );
      if (result.error) throw result.error;
      await refetch();
      setNotesOpen(false);
      toast.success("Notes saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Notes could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  function goNext() {
    if (nextPerson) setCurrentId(nextPerson.id);
  }

  function goPrevious() {
    if (previousPerson) setCurrentId(previousPerson.id);
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!current || busy || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (target?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;

      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        void changeStatus("shot", current.full_name + " marked Shot", true);
      } else if (event.key.toLowerCase() === "r") {
        event.preventDefault();
        void changeStatus("retake", "Retake requested");
      } else if (event.key.toLowerCase() === "s") {
        event.preventDefault();
        void changeStatus("skipped", "Skipped for now", true);
      } else if (event.key.toLowerCase() === "n") {
        event.preventDefault();
        if (window.confirm("Mark " + current.full_name + " as No Show?")) {
          void changeStatus("no_show", current.full_name + " marked No Show", true);
        }
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goPrevious();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  if (isLoading || !data) {
    return <AppShell><LoadingGrid rows={6} /></AppShell>;
  }

  if (!email) {
    return (
      <AppShell>
        <EmptyState
          title="Staff sign-in required"
          description="Shooting Mode contains private participant information and is available only to authorized staff."
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
          description="Select an event before opening Shooting Mode."
          action={<Button asChild><Link to="/events">Open Events</Link></Button>}
        />
      </AppShell>
    );
  }

  if (!data.participants.length) {
    return (
      <AppShell>
        <EmptyState
          title="No people in this event yet"
          description="Add participants and print their QR nameplates first."
          action={<Button asChild><Link to="/participants">Open People</Link></Button>}
        />
      </AppShell>
    );
  }

  const shotCount = data.participants.filter((person) => isShot(person.shooting_status)).length;
  const noShowCount = data.participants.filter((person) => person.shooting_status === "no_show").length;
  const waitingCount = Math.max(0, data.participants.length - shotCount - noShowCount);
  const progress = data.participants.length ? Math.round((shotCount / data.participants.length) * 100) : 0;
  const group = current?.event_group_id ? groupsById.get(current.event_group_id) : null;

  return (
    <AppShell>
      <div className="dark min-h-[calc(100vh-7.5rem)] rounded-xl border border-border bg-background p-3 text-foreground shadow-2xl shadow-black/20 sm:p-5">
        <div className="flex flex-col gap-3 border-b border-border pb-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Live portrait queue</p>
            <div className="mt-1 flex flex-wrap items-end gap-x-3 gap-y-1">
              <h1 className="font-display text-2xl font-extrabold tracking-[-0.045em]">Shooting Mode</h1>
              <span className="pb-0.5 text-xs text-muted-foreground">{data.event.name}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/participants"><Users className="size-4" /> People</Link></Button>
            <Button asChild variant="outline" size="sm"><Link to="/gallery">Gallery</Link></Button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card/70 p-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Shot</p>
            <p className="mt-1 font-mono text-2xl font-bold text-success">{shotCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-card/70 p-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Waiting</p>
            <p className="mt-1 font-mono text-2xl font-bold">{waitingCount}</p>
          </div>
          <div className="rounded-lg border border-border bg-card/70 p-3">
            <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">No show</p>
            <p className="mt-1 font-mono text-2xl font-bold text-destructive">{noShowCount}</p>
          </div>
        </div>

        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: progress + "%" }} />
        </div>
        <div className="mt-1 flex justify-between text-[0.62rem] text-muted-foreground">
          <span>{progress}% complete</span>
          <span>{shotCount} / {data.participants.length}</span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
          <aside className="rounded-lg border border-border bg-card/55 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" placeholder="Search queue…" />
            </div>
            <select
              value={groupFilter}
              onChange={(event) => setGroupFilter(event.target.value)}
              className="mt-2 h-10 w-full rounded-md border border-input px-3 text-sm"
            >
              <option value="all">All batches / classes</option>
              {data.eventGroups.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              <option value="ungrouped">Ungrouped</option>
            </select>

            <div className="mt-3 max-h-[56vh] space-y-1.5 overflow-y-auto pr-1">
              {queue.map((person, index) => (
                <button
                  key={person.id}
                  type="button"
                  onClick={() => setCurrentId(person.id)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg border p-2 text-left transition-colors",
                    current?.id === person.id
                      ? "border-primary/35 bg-primary/[0.08]"
                      : "border-border bg-background/30 hover:border-primary/20",
                  )}
                >
                  <span className="w-7 shrink-0 text-center font-mono text-[0.62rem] text-muted-foreground">{index + 1}</span>
                  <PersonAvatar person={person} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{person.full_name}</span>
                    <span className="block truncate font-mono text-[0.58rem] text-muted-foreground">{person.participant_code}</span>
                  </span>
                  <CircleDot className={cn("size-3.5 shrink-0", isShot(person.shooting_status) ? "text-success" : person.shooting_status === "no_show" ? "text-destructive" : "text-muted-foreground")} />
                </button>
              ))}
              {!queue.length ? <p className="px-2 py-8 text-center text-xs text-muted-foreground">No people match this filter.</p> : null}
            </div>
          </aside>

          <main className="flex min-h-[540px] flex-col rounded-xl border border-border bg-card/70 p-4 sm:p-6">
            {current ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs font-bold text-primary">{current.participant_code}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Queue {currentIndex + 1} of {queue.length}
                    </p>
                  </div>
                  <StatusPill label={current.shooting_status || "pending"} tone={statusTone(current.shooting_status)} />
                </div>

                <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                  <PersonAvatar person={current} size="xl" className="size-32 rounded-xl border-primary/20 sm:size-40" />
                  <h2 className="mt-6 max-w-3xl font-display text-4xl font-extrabold leading-[0.95] tracking-[-0.055em] sm:text-5xl lg:text-6xl">
                    {current.full_name}
                  </h2>
                  <p className="mt-4 text-sm text-muted-foreground">
                    {[group?.name || current.batch, current.organization].filter(Boolean).join(" · ") || "No batch / organization"}
                  </p>
                </div>

                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <Button
                    size="lg"
                    className="min-h-14 text-sm font-extrabold xl:col-span-2"
                    disabled={busy}
                    onClick={() => void changeStatus("shot", current.full_name + " marked Shot", true)}
                  >
                    <CheckCircle2 className="size-5" /> SHOT / DONE
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="min-h-14"
                    disabled={busy}
                    onClick={() => void changeStatus("retake", "Retake requested")}
                  >
                    <RotateCcw className="size-4" /> RETAKE
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="min-h-14"
                    disabled={busy}
                    onClick={() => void changeStatus("skipped", "Skipped for now", true)}
                  >
                    <SkipForward className="size-4" /> SKIP
                  </Button>
                  <Button
                    size="lg"
                    variant="outline"
                    className="min-h-14 border-destructive/30 text-destructive hover:bg-destructive/10"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm("Mark " + current.full_name + " as No Show?")) {
                        void changeStatus("no_show", current.full_name + " marked No Show", true);
                      }
                    }}
                  >
                    <UserX className="size-4" /> NO SHOW
                  </Button>
                </div>

                <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <Button variant="ghost" className="justify-start" onClick={() => setNotesOpen((value) => !value)}>
                    <StickyNote className="size-4" /> {current.notes ? "Edit notes" : "Add notes"}
                  </Button>
                  <Button variant="ghost" disabled={!previousPerson} onClick={goPrevious}><ArrowLeft className="size-4" /> Previous</Button>
                  <Button variant="ghost" disabled={!nextPerson} onClick={goNext}>Next <ArrowRight className="size-4" /></Button>
                </div>

                {notesOpen ? (
                  <div className="mt-3 rounded-lg border border-border bg-background/40 p-3">
                    <Textarea
                      ref={notesRef}
                      rows={4}
                      value={notesDraft}
                      onChange={(event) => setNotesDraft(event.target.value)}
                      placeholder="Pose, glasses, retake note, special instruction…"
                    />
                    <div className="mt-2 flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setNotesOpen(false)}>Cancel</Button>
                      <Button size="sm" disabled={busy} onClick={() => void saveNotes()}>Save notes</Button>
                    </div>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState title="No participant selected" description="Choose someone from the queue." />
            )}
          </main>

          <aside className="space-y-3">
            <div className="rounded-lg border border-border bg-card/55 p-4">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Next participant</p>
              {nextPerson ? (
                <button type="button" onClick={() => setCurrentId(nextPerson.id)} className="mt-3 flex w-full items-center gap-3 text-left">
                  <PersonAvatar person={nextPerson} size="lg" />
                  <span className="min-w-0">
                    <span className="block truncate font-display text-sm font-bold">{nextPerson.full_name}</span>
                    <span className="mt-1 block font-mono text-[0.62rem] text-muted-foreground">{nextPerson.participant_code}</span>
                  </span>
                </button>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">End of the current queue.</p>
              )}
            </div>

            <div className="rounded-lg border border-border bg-card/55 p-4">
              <p className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Keyboard</p>
              <div className="mt-3 grid gap-2 text-xs text-muted-foreground">
                <p><kbd className="rounded border border-border px-1.5 py-0.5 text-foreground">Space</kbd> / Enter · Shot</p>
                <p><kbd className="rounded border border-border px-1.5 py-0.5 text-foreground">R</kbd> · Retake</p>
                <p><kbd className="rounded border border-border px-1.5 py-0.5 text-foreground">S</kbd> · Skip</p>
                <p><kbd className="rounded border border-border px-1.5 py-0.5 text-foreground">N</kbd> · No Show</p>
                <p><kbd className="rounded border border-border px-1.5 py-0.5 text-foreground">← / →</kbd> · Previous / Next</p>
              </div>
            </div>

            <div className="rounded-lg border border-primary/20 bg-primary/[0.05] p-4">
              <Camera className="size-5 text-primary" />
              <p className="mt-2 font-display text-sm font-bold">QR ready</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Scan a printed participant nameplate while signed in to jump directly to that person.
              </p>
            </div>
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
