import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Check, Edit3, PackagePlus, Plus, Sparkles, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { useOps, useSession, type PackageProductType, type PackageRow } from "@/lib/data";
import { peso } from "@/lib/domain";

export const Route = createFileRoute("/packages")({ component: PackagesPage });

type PackageForm = {
  code: string;
  product_type: PackageProductType;
  name: string;
  price: string;
  print_size: string;
  quantity: string;
  framed: boolean;
  digital_copy: boolean;
  description: string;
  active: boolean;
};

const emptyForm = (type: PackageProductType): PackageForm => ({
  code: "",
  product_type: type,
  name: "",
  price: "",
  print_size: type === "group_package" ? "8R / 8×10" : "5R",
  quantity: "1",
  framed: false,
  digital_copy: false,
  description: "",
  active: true,
});

const PSS_DEFAULTS = [
  { code: "P1", product_type: "group_package", name: "Class Photo · Print", price: 150, print_size: "8R / 8×10", quantity: 1, framed: false, description: "Official class/group photo · print only" },
  { code: "P2", product_type: "group_package", name: "Class Photo · Framed", price: 550, print_size: "8R / 8×10", quantity: 1, framed: true, description: "Official class/group photo in black frame" },
  { code: "P3", product_type: "group_package", name: "Class Photo · Large Framed", price: 750, print_size: "11R / 11×14", quantity: 1, framed: true, description: "Large official class/group photo in black frame" },
  { code: null, product_type: "solo_addon", name: "Solo 5R Print", price: 60, print_size: "5R", quantity: 1, framed: false, description: "Optional solo portrait print" },
  { code: null, product_type: "solo_addon", name: "Solo 5R + Frame", price: 270, print_size: "5R", quantity: 1, framed: true, description: "Optional solo portrait in black frame" },
  { code: null, product_type: "solo_addon", name: "Solo 12×16 + Frame", price: 950, print_size: "12×16", quantity: 1, framed: true, description: "Optional large solo portrait in black frame" },
] as const;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><Label>{label}</Label>{children}</label>;
}

function ProductCard({ item, onEdit, onToggle, onRemove }: { item: PackageRow; onEdit: () => void; onToggle: () => void; onRemove: () => void }) {
  return (
    <Panel key={item.id} title={`${item.code ? `${item.code} · ` : ""}${item.name}`} description={item.description ?? undefined} className={!item.active ? "opacity-60" : undefined}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-3xl font-extrabold">{peso(item.price)}</p>
          <p className="mt-2 text-sm text-muted-foreground">{item.quantity} × {item.print_size}{item.framed ? " · Black frame" : " · Print only"}</p>
        </div>
        <StatusPill label={item.active ? "Client visible" : "Hidden"} tone={item.active ? "success" : "neutral"} />
      </div>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
        <Button size="sm" variant="outline" onClick={onEdit}><Edit3 className="size-4" /> Edit</Button>
        <Button size="sm" variant="ghost" onClick={onToggle}>{item.active ? "Hide" : "Activate"}</Button>
        <Button size="sm" variant="ghost" onClick={onRemove}><Trash2 className="size-4" /> Delete</Button>
      </div>
    </Panel>
  );
}

function PackagesPage() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<PackageForm>(emptyForm("group_package"));
  const [saving, setSaving] = useState(false);
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  const groupPackages = useMemo(() => data?.packages.filter((item) => item.product_type === "group_package") ?? [], [data?.packages]);
  const soloAddons = useMemo(() => data?.packages.filter((item) => item.product_type === "solo_addon") ?? [], [data?.packages]);

  if (isLoading || !data) return <AppShell><PageHeader eyebrow="Pricing" title="Packages & Pricing" /><LoadingGrid rows={5} /></AppShell>;

  function requireStaff() {
    if (email) return true;
    void navigate({ to: "/auth" });
    return false;
  }

  function startNew(type: PackageProductType) {
    if (!requireStaff()) return;
    if (!data.event) return toast.error("Create or select an event first.");
    setEditingId(null);
    setForm(emptyForm(type));
    setOpen(true);
  }

  function startEdit(item: PackageRow) {
    if (!requireStaff()) return;
    setEditingId(item.id);
    setForm({
      code: item.code ?? "",
      product_type: item.product_type,
      name: item.name,
      price: String(item.price),
      print_size: item.print_size,
      quantity: String(item.quantity),
      framed: item.framed,
      digital_copy: item.digital_copy,
      description: item.description ?? "",
      active: item.active,
    });
    setOpen(true);
  }

  async function save() {
    if (!requireStaff() || !data.event) return;
    const price = Number(form.price);
    const quantity = Math.max(1, Number(form.quantity) || 1);
    if (!form.name.trim()) return toast.error("Product name is required.");
    if (!Number.isFinite(price) || price < 0) return toast.error("Enter a valid price.");

    setSaving(true);
    try {
      const payload = {
        event_id: data.event.id,
        code: form.code.trim() || null,
        product_type: form.product_type,
        name: form.name.trim(),
        price,
        print_size: form.print_size.trim() || "5R",
        quantity,
        framed: form.framed,
        digital_copy: form.digital_copy,
        description: form.description.trim() || null,
        active: form.active,
        sort_order: editingId ? data.packages.find((item) => item.id === editingId)?.sort_order ?? data.packages.length : data.packages.length + 1,
      };
      const query = supabase.from("packages");
      const result = await withTimeout(
        editingId ? query.update(payload as never).eq("id", editingId) : query.insert(payload as never),
        12_000,
        "Product save timed out. Please try again.",
      );
      if (result.error) throw result.error;
      toast.success(editingId ? "Product updated" : "Product created");
      setOpen(false);
      setEditingId(null);
      await withTimeout(refetch(), 12_000, "Product saved, but refresh took too long.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Product could not be saved.");
    } finally {
      setSaving(false);
    }
  }

  async function loadDefaults() {
    if (!requireStaff() || !data.event) return;
    if (data.packages.length && !confirm("This event already has products. Add the PSS default set as additional products?")) return;
    setLoadingDefaults(true);
    try {
      const rows = PSS_DEFAULTS.map((item, index) => ({ ...item, event_id: data.event!.id, digital_copy: false, active: true, sort_order: data.packages.length + index + 1 }));
      const { error } = await withTimeout(
        supabase.from("packages").insert(rows as never),
        12_000,
        "Adding the default packages took too long.",
      );
      if (error) throw error;
      toast.success("PSS default class packages and solo add-ons added");
      await withTimeout(refetch(), 12_000, "Package action completed, but refresh took too long.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Defaults could not be added.");
    } finally {
      setLoadingDefaults(false);
    }
  }

  async function toggle(item: PackageRow) {
    if (!requireStaff()) return;
    const { error } = await withTimeout(
      supabase.from("packages").update({ active: !item.active }).eq("id", item.id),
      12_000,
      "Package status update timed out.",
    );
    if (error) return toast.error(error.message);
    await withTimeout(refetch(), 12_000, "Package action completed, but refresh took too long.");
    toast.success(item.active ? "Hidden from client checkout" : "Product is active");
  }

  async function remove(item: PackageRow) {
    if (!requireStaff()) return;
    if (!confirm(`Delete “${item.name}”? Existing orders may prevent deletion.`)) return;
    const { error } = await withTimeout(
      supabase.from("packages").delete().eq("id", item.id),
      12_000,
      "Package delete timed out.",
    );
    if (error) return toast.error(error.message);
    toast.success("Product deleted");
    await withTimeout(refetch(), 12_000, "Package action completed, but refresh took too long.");
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={data.event?.name ?? "Pricing"}
        title="Packages & Pricing"
        description="Class/group photo is the primary product. Solo portraits are optional add-ons after the client chooses themself."
        actions={<div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => void loadDefaults()} disabled={loadingDefaults}><Sparkles className="size-4" /> {loadingDefaults ? "Adding…" : "Load PSS defaults"}</Button><Button onClick={() => startNew("group_package")}><Plus className="size-4" /> Class package</Button></div>}
      />

      {!data.event ? <EmptyState title="Select an event first" description="Every package belongs to an event." action={<Button asChild><Link to="/events">Open Events</Link></Button>} /> : (
        <>
          {open ? (
            <Panel className="mb-6" title={editingId ? "Edit product" : form.product_type === "group_package" ? "New class/group package" : "New solo add-on"}>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Field label="Product type"><select className="h-10 rounded-md border border-input bg-background px-3 text-sm" value={form.product_type} onChange={(event) => setForm({ ...form, product_type: event.target.value as PackageProductType })}><option value="group_package">Class / group package</option><option value="solo_addon">Solo portrait add-on</option></select></Field>
                <Field label="Code"><Input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} placeholder={form.product_type === "group_package" ? "P1" : "Optional"} /></Field>
                <div className="lg:col-span-2"><Field label="Product name"><Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={form.product_type === "group_package" ? "Class Photo · Framed" : "Solo 5R + Frame"} /></Field></div>
                <Field label="Price"><Input type="number" min="0" value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="550" /></Field>
                <Field label="Print size"><Input value={form.print_size} onChange={(event) => setForm({ ...form, print_size: event.target.value })} placeholder="8R / 8×10" /></Field>
                <Field label="Prints per product"><Input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} /></Field>
                <label className="flex items-center gap-2 pt-6 text-sm"><Checkbox checked={form.framed} onCheckedChange={(checked) => setForm({ ...form, framed: checked === true })} /> Black frame</label>
                <label className="flex items-center gap-2 pt-6 text-sm"><Checkbox checked={form.digital_copy} onCheckedChange={(checked) => setForm({ ...form, digital_copy: checked === true })} /> Digital copy included</label>
                <label className="flex items-center gap-2 pt-6 text-sm"><Checkbox checked={form.active} onCheckedChange={(checked) => setForm({ ...form, active: checked === true })} /> Visible to clients</label>
                <div className="md:col-span-2 lg:col-span-4"><Field label="Description"><Textarea rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></Field></div>
              </div>
              <div className="mt-5 flex gap-2"><Button onClick={() => void save()} disabled={saving}><Check className="size-4" /> {saving ? "Saving…" : "Save product"}</Button><Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button></div>
            </Panel>
          ) : null}

          <section>
            <div className="mb-3 flex items-end justify-between gap-3"><div><p className="eyebrow">Primary product</p><h2 className="mt-1 font-display text-2xl font-extrabold">Class / Group Packages</h2><p className="mt-1 text-sm text-muted-foreground">P1, P2, P3 and future packages use the official class/group photo matched to the client’s class.</p></div><Button size="sm" variant="outline" onClick={() => startNew("group_package")}><PackagePlus className="size-4" /> Add</Button></div>
            {groupPackages.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{groupPackages.map((item) => <ProductCard key={item.id} item={item} onEdit={() => startEdit(item)} onToggle={() => void toggle(item)} onRemove={() => void remove(item)} />)}</div> : <EmptyState title="No class packages yet" description="Load the PSS defaults or add P1/P2/P3 manually." />}
          </section>

          <section className="mt-8 border-t border-border pt-7">
            <div className="mb-3 flex items-end justify-between gap-3"><div><p className="eyebrow">Optional</p><h2 className="mt-1 font-display text-2xl font-extrabold">Solo Portrait Add-ons</h2><p className="mt-1 text-sm text-muted-foreground">These use the client’s selected solo portrait and are added on top of the class package.</p></div><Button size="sm" variant="outline" onClick={() => startNew("solo_addon")}><Plus className="size-4" /> Solo add-on</Button></div>
            {soloAddons.length ? <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{soloAddons.map((item) => <ProductCard key={item.id} item={item} onEdit={() => startEdit(item)} onToggle={() => void toggle(item)} onRemove={() => void remove(item)} />)}</div> : <EmptyState title="No solo add-ons yet" description="Solo add-ons are optional. Clients can order only the class package if they prefer." />}
          </section>
        </>
      )}
    </AppShell>
  );
}
