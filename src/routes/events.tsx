import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, CalendarDays, Check, Edit3, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { setActiveEventId, useOps, useSession, type EventRow } from "@/lib/data";
import { formatDate } from "@/lib/domain";

export const Route = createFileRoute("/events")({ component: EventsPage });

const DEMO_EVENT_ID = "11111111-1111-1111-1111-111111111111";
const EVENT_TYPES = ["SCE", "PSS", "KMS", "Other"] as const;

type EventForm = {
  name: string;
  event_type: string;
  event_date: string;
  venue: string;
  description: string;
  id_prefix: string;
  ordering_deadline: string;
  delivery_date: string;
  payment_instructions: string;
  groups: string[];
};

const EMPTY_FORM: EventForm = {
  name: "",
  event_type: "SCE",
  event_date: "",
  venue: "",
  description: "",
  id_prefix: "SCE",
  ordering_deadline: "",
  delivery_date: "",
  payment_instructions: "",
  groups: [],
};

function normalizePrefix(value: string) {
  return value.replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase() || "EVT";
}

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "event";
}

function prefixFor(type: string) {
  if (type === "SCE") return "SCE";
  if (type === "PSS") return "PSS";
  if (type === "KMS") return "KMS";
  return "EVT";
}

function groupLabel(type: string) {
  if (type === "SCE") return "Batch / Class";
  if (type === "PSS") return "Class";
  if (type === "KMS") return "Class / Batch";
  return "Group / Class";
}

function eventNamePlaceholder(type: string) {
  if (type === "SCE") return "e.g. SCE — Nueva Ecija 2027";
  if (type === "PSS") return "e.g. Pioneer Service School — Nueva Ecija";
  if (type === "KMS") return "e.g. Kingdom Ministry School — Nueva Ecija";
  return "e.g. Graduation / Special Event";
}

function toForm(event: EventRow, groups: string[]): EventForm {
  return {
    name: event.name,
    event_type: EVENT_TYPES.includes(event.event_type as (typeof EVENT_TYPES)[number]) ? event.event_type : "Other",
    event_date: event.event_date ?? "",
    venue: event.venue ?? "",
    description: event.description ?? "",
    id_prefix: event.id_prefix,
    ordering_deadline: event.ordering_deadline ?? "",
    delivery_date: event.delivery_date ?? "",
    payment_instructions: event.payment_instructions ?? "",
    groups,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><Label>{label}</Label>{children}</label>;
}

function EventsPage() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();
  const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<EventForm>(EMPTY_FORM);
  const [groupDraft, setGroupDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const realEvents = useMemo(() => (data?.events ?? []).filter((event) => event.id !== DEMO_EVENT_ID), [data?.events]);
  const demoEvents = useMemo(() => (data?.events ?? []).filter((event) => event.id === DEMO_EVENT_ID), [data?.events]);

  useEffect(() => {
    if (!email || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("action") !== "new") return;

    setEditingId(null);
    setForm(EMPTY_FORM);
    setGroupDraft("");
    setFormOpen(true);

    params.delete("action");
    const remaining = params.toString();
    window.history.replaceState({}, "", `/events${remaining ? `?${remaining}` : ""}`);
  }, [email]);

  if (isLoading || !data) return <AppShell><PageHeader title="Events" eyebrow="PhotoFlow" /><LoadingGrid rows={5} /></AppShell>;

  function requireStaff(action?: "new") {
    if (email) return true;
    if (typeof window !== "undefined") {
      const authUrl = new URL("/auth", window.location.origin);
      authUrl.searchParams.set("returnTo", "/events");
      if (action) authUrl.searchParams.set("action", action);
      window.location.href = `${authUrl.pathname}${authUrl.search}`;
    }
    return false;
  }

  function startNew() {
    if (!requireStaff("new")) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
    setGroupDraft("");
    setFormOpen(true);
  }

  async function startEdit(event: EventRow) {
    if (!requireStaff()) return;
    const db = supabase as any;
    const result = await withTimeout(
      db.from("event_groups").select("name").eq("event_id", event.id).eq("active", true).order("sort_order").order("name"),
      12_000,
      "Loading event batches took too long.",
    );
    if (result.error) return toast.error(result.error.message);
    setEditingId(event.id);
    setForm(toForm(event, (result.data ?? []).map((item: { name: string }) => item.name)));
    setGroupDraft("");
    setFormOpen(true);
  }

  function changeEventType(value: string) {
    setForm((current) => ({ ...current, event_type: value, id_prefix: prefixFor(value) }));
  }

  function addGroup() {
    const name = groupDraft.trim();
    if (!name) return;
    if (form.groups.some((item) => item.toLowerCase() === name.toLowerCase())) return toast.info(`${name} is already listed.`);
    setForm((current) => ({ ...current, groups: [...current.groups, name] }));
    setGroupDraft("");
  }

  function removeGroup(index: number) {
    setForm((current) => ({ ...current, groups: current.groups.filter((_, itemIndex) => itemIndex !== index) }));
  }

  async function syncGroups(eventId: string) {
    const db = supabase as any;
    const removed = await withTimeout(
      db.from("event_groups").delete().eq("event_id", eventId),
      12_000,
      "Updating event batches took too long.",
    );
    if (removed.error) throw removed.error;
    if (!form.groups.length) return;
    const inserted = await withTimeout(
      db.from("event_groups").insert(form.groups.map((name, index) => ({ event_id: eventId, name: name.trim(), sort_order: index + 1, active: true }))),
      12_000,
      "Saving event batches took too long.",
    );
    if (inserted.error) throw inserted.error;
  }

  async function save() {
    if (!requireStaff()) return;
    if (!form.name.trim()) {
      toast.error("Please enter an Event name first.");
      return;
    }

    setSaving(true);
    try {
      const db = supabase as any;
      const payload = {
        name: form.name.trim(),
        event_type: form.event_type,
        event_date: form.event_date || null,
        venue: form.venue.trim() || null,
        description: form.description.trim() || null,
        id_prefix: normalizePrefix(form.id_prefix),
        ordering_deadline: form.ordering_deadline || null,
        delivery_date: form.delivery_date || null,
        payment_instructions: form.payment_instructions.trim() || null,
        status: "active",
      };
      const rpcArgs = {
        _name: payload.name,
        _event_type: payload.event_type,
        _event_date: payload.event_date,
        _venue: payload.venue,
        _description: payload.description,
        _id_prefix: payload.id_prefix,
        _ordering_deadline: payload.ordering_deadline,
        _delivery_date: payload.delivery_date,
        _payment_instructions: payload.payment_instructions,
        _groups: form.groups,
      };

      const isMissingRpc = (error: any) => {
        const message = String(error?.message ?? "");
        return error?.code === "PGRST202"
          || message.includes("Could not find the function")
          || message.includes("create_event_with_groups_v1")
          || message.includes("update_event_with_groups_v1");
      };

      let eventId = editingId ?? "";

      if (editingId) {
        const result = await withTimeout(db.rpc("update_event_with_groups_v1", {
          _event_id: editingId,
          ...rpcArgs,
        }), 12_000, "Updating the event took too long.");

        if (result.error && !isMissingRpc(result.error)) throw result.error;

        if (result.error) {
          const direct = await withTimeout(
            supabase.from("events").update(payload).eq("id", editingId),
            12_000,
            "Updating the event took too long.",
          );
          if (direct.error) throw direct.error;
          await syncGroups(editingId);
          eventId = editingId;
        } else {
          eventId = String(result.data);
        }
      } else {
        const slug = `${slugify(form.name)}-${Date.now().toString(36).slice(-5)}`;
        const result = await withTimeout(db.rpc("create_event_with_groups_v1", {
          _slug: slug,
          ...rpcArgs,
        }), 12_000, "Creating the event took too long.");

        if (result.error && !isMissingRpc(result.error)) throw result.error;

        if (result.error) {
          const direct = await withTimeout(
            supabase
              .from("events")
              .insert({ ...payload, slug })
              .select("id")
              .single(),
            12_000,
            "Creating the event took too long.",
          );
          if (direct.error) throw direct.error;
          eventId = direct.data.id;
          await syncGroups(eventId);
        } else {
          eventId = String(result.data);
        }
      }

      setActiveEventId(eventId);
      toast.success(editingId ? "Event updated" : "Event created successfully");
      setFormOpen(false);
      setEditingId(null);
      await withTimeout(refetch(), 12_000, "Event saved, but workspace refresh took too long.");
      if (!editingId) void navigate({ to: "/" });
    } catch (error: any) {
      console.error("PhotoFlow event save failed", error);
      const message = error?.message || "Event could not be saved.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  async function archive(event: EventRow) {
    if (!requireStaff()) return;
    const { error } = await withTimeout(
      supabase.from("events").update({ status: "archived" }).eq("id", event.id),
      12_000,
      "Archiving the event took too long.",
    );
    if (error) return toast.error(error.message);
    if (data.event?.id === event.id) setActiveEventId(realEvents.find((item) => item.id !== event.id)?.id ?? null);
    toast.success("Event archived");
    await withTimeout(refetch(), 12_000, "Event action completed, but refresh took too long.");
  }

  async function removeDemo() {
    if (!requireStaff()) return;
    if (!confirm("Remove the original PhotoFlow demo event and all sample records?")) return;
    const { error } = await withTimeout(
      supabase.from("events").delete().eq("id", DEMO_EVENT_ID),
      12_000,
      "Removing demo data took too long.",
    );
    if (error) return toast.error(error.message);
    toast.success("Demo data removed");
    await withTimeout(refetch(), 12_000, "Event action completed, but refresh took too long.");
  }

  return (
    <AppShell>
      <PageHeader eyebrow="Operations" title="Events" description="Create a schooling/event, then define its classes or batches. Each batch can have its own gallery link so client photos never mix." actions={<Button onClick={startNew}><Plus className="size-4" /> New event</Button>} />

      {!email ? <div className="mb-5 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">You are viewing PhotoFlow as a guest. <a href="/auth?returnTo=%2Fevents&action=new" className="font-bold text-primary">Sign in to create an event.</a></div> : null}

      {formOpen ? (
        <Panel className="mb-6" title={editingId ? "Edit event" : "Create event"} description="Choose the schooling type, then add its batches/classes. PhotoFlow will keep galleries, photos and orders scoped to the correct event and batch.">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Event type">
              <select className="h-11 rounded-md border border-input bg-background px-3 text-sm" value={form.event_type} onChange={(event) => changeEventType(event.target.value)}>
                <option value="SCE">SCE — School for Congregation Elders</option>
                <option value="PSS">PSS — Pioneer Service School</option>
                <option value="KMS">KMS — Kingdom Ministry School</option>
                <option value="Other">Other event</option>
              </select>
            </Field>
            <Field label="Event name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={eventNamePlaceholder(form.event_type)} /></Field>
            <Field label="Event date"><Input type="date" value={form.event_date} onChange={(event) => setForm({ ...form, event_date: event.target.value })} /></Field>
            <Field label="Venue"><Input value={form.venue} onChange={(event) => setForm({ ...form, venue: event.target.value })} /></Field>
            <Field label="Event ID prefix"><Input value={form.id_prefix} onChange={(event) => setForm({ ...form, id_prefix: normalizePrefix(event.target.value) })} /></Field>
            <div />

            <div className="md:col-span-2 rounded-lg border border-border bg-muted/10 p-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold">{groupLabel(form.event_type)} setup</p><p className="mt-1 text-xs text-muted-foreground">Add each batch/class that should have its own gallery and official group photo.</p></div><span className="mt-2 text-xs font-semibold text-primary sm:mt-0">{form.groups.length} configured</span></div>
              <div className="mt-4 flex gap-2"><Input value={groupDraft} onChange={(event) => setGroupDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addGroup(); } }} placeholder={form.event_type === "SCE" ? "e.g. Batch 1 / Class A" : "e.g. Class A"} /><Button type="button" variant="outline" onClick={addGroup}><Plus className="size-4" /> Add</Button></div>
              {form.groups.length ? <div className="mt-3 flex flex-wrap gap-2">{form.groups.map((group, index) => <span key={`${group}-${index}`} className="inline-flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-semibold">{group}<button type="button" onClick={() => removeGroup(index)} className="text-muted-foreground hover:text-foreground" aria-label={`Remove ${group}`}><X className="size-3.5" /></button></span>)}</div> : <p className="mt-3 text-xs text-muted-foreground">Optional for a one-group event. For SCE with several batches/classes, add them here.</p>}
            </div>

            <Field label="Ordering deadline"><Input type="date" value={form.ordering_deadline} onChange={(event) => setForm({ ...form, ordering_deadline: event.target.value })} /></Field>
            <Field label="Delivery date"><Input type="date" value={form.delivery_date} onChange={(event) => setForm({ ...form, delivery_date: event.target.value })} /></Field>
            <div className="md:col-span-2"><Field label="Description"><Textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field></div>
            <div className="md:col-span-2"><Field label="Payment instructions"><Textarea rows={4} value={form.payment_instructions} onChange={(event) => setForm({ ...form, payment_instructions: event.target.value })} placeholder="GCash/Maya account, cash instructions, etc." /></Field></div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2"><Button onClick={() => void save()} disabled={saving}><Check className="size-4" /> {saving ? "Saving…" : editingId ? "Save event" : "Create event"}</Button><Button variant="ghost" onClick={() => setFormOpen(false)}>Cancel</Button></div>
        </Panel>
      ) : null}

      {realEvents.length ? <div className="grid gap-4 lg:grid-cols-2">{realEvents.map((event) => { const selected = data.event?.id === event.id; return <Panel key={event.id} className={selected ? "border-primary/35" : undefined} title={event.name} description={`${event.event_type} · ${formatDate(event.event_date)}`}><div className="grid gap-3 text-sm"><div className="flex flex-wrap gap-2"><StatusPill label={selected ? "Current workspace" : event.status} tone={selected ? "gold" : event.status === "archived" ? "neutral" : "success"} />{event.venue ? <span className="text-muted-foreground">{event.venue}</span> : null}</div><div className="grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3"><div><p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">Type</p><p className="font-semibold">{event.event_type}</p></div><div><p className="text-[0.65rem] uppercase tracking-wide text-muted-foreground">ID prefix</p><p className="font-mono font-semibold">{event.id_prefix}</p></div></div><div className="flex flex-wrap gap-2 pt-1">{!selected ? <Button size="sm" onClick={() => { setActiveEventId(event.id); toast.success(`${event.name} is now the current workspace`); void navigate({ to: "/" }); }}><CalendarDays className="size-4" /> Use this event</Button> : null}<Button size="sm" variant="outline" onClick={() => void startEdit(event)}><Edit3 className="size-4" /> Edit</Button>{event.status !== "archived" ? <Button size="sm" variant="ghost" onClick={() => void archive(event)}><Archive className="size-4" /> Archive</Button> : null}</div></div></Panel>; })}</div> : <EmptyState title="No real event yet" description="Create your first SCE, PSS, KMS or other event." action={<Button onClick={startNew}><Plus className="size-4" /> Create first event</Button>} />}

      {demoEvents.length ? <Panel className="mt-6 border-warning/25" title="Original demo data" description="This seeded event is only sample content from the prototype."><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">{demoEvents[0].name}</p><p className="text-xs text-muted-foreground">Sample participants, photos and orders</p></div><Button variant="outline" onClick={() => void removeDemo()}><Trash2 className="size-4" /> Remove demo data</Button></div></Panel> : null}
    </AppShell>
  );
}
