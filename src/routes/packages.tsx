import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Check,
  Copy,
  Edit3,
  Eye,
  EyeOff,
  Image,
  Images,
  PackageCheck,
  PackagePlus,
  Plus,
  Sparkles,
  Trash2,
} from "lucide-react";
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
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { useOps, useSession, type FrameColor, type PackageProductType, type PackageRow } from "@/lib/data";
import { peso } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/packages")({ component: PackagesPage });

type PackageForm = {
  code: string;
  product_type: PackageProductType;
  name: string;
  price: string;
  print_size: string;
  quantity: string;
  framed: boolean;
  frame_colors: FrameColor[];
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
  frame_colors: ["black"],
  digital_copy: false,
  description: "",
  active: true,
});

const COMMON_PRINT_SIZES = [
  "4R",
  "5R",
  "6R",
  "8R / 8×10",
  "8×12",
  "11R / 11×14",
  "12×16",
] as const;

const FRAME_COLOR_OPTIONS: Array<{ value: FrameColor; label: string; swatch: string }> = [
  { value: "black", label: "Black", swatch: "#111214" },
  { value: "white", label: "White", swatch: "#f1f1ed" },
  { value: "brown", label: "Brown", swatch: "#6b422a" },
];

const PSS_DEFAULTS = [
  { code: "P1", product_type: "group_package", name: "Class Photo · Print", price: 150, print_size: "8R / 8×10", quantity: 1, framed: false, description: "Official class/group photo · print only" },
  { code: "P2", product_type: "group_package", name: "Class Photo · Framed", price: 550, print_size: "8R / 8×10", quantity: 1, framed: true, description: "Official class/group photo with frame + white mat" },
  { code: "P3", product_type: "group_package", name: "Class Photo · Large Framed", price: 750, print_size: "11R / 11×14", quantity: 1, framed: true, description: "Large official class/group photo with frame + white mat" },
  { code: "S1", product_type: "solo_addon", name: "Solo 5R Print", price: 60, print_size: "5R", quantity: 1, framed: false, description: "Optional solo portrait print" },
  { code: "S2", product_type: "solo_addon", name: "Solo 5R + Frame", price: 270, print_size: "5R", quantity: 1, framed: true, description: "Optional solo portrait with frame + white mat" },
  { code: "S3", product_type: "solo_addon", name: "Solo 8R + Frame", price: 550, print_size: "8R", quantity: 1, framed: true, description: "Optional 8R solo portrait with frame + white mat" },
  { code: "S4", product_type: "solo_addon", name: "Solo 12×16 + Frame", price: 950, print_size: "12×16", quantity: 1, framed: true, description: "Optional large solo portrait with frame + white mat" },
] as const;

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <div className="flex items-end justify-between gap-2">
        <Label>{label}</Label>
        {hint ? <span className="text-[0.62rem] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </label>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  note,
}: {
  icon: typeof Images;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/55 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <p className="eyebrow">{label}</p>
        <Icon className="size-4 text-primary/80" />
      </div>
      <p className="mt-2 font-display text-2xl font-extrabold tracking-[-0.04em]">{value}</p>
      <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">{note}</p>
    </div>
  );
}

function ProductCard({
  item,
  globalFrameColor,
  onEdit,
  onDuplicate,
  onToggle,
  onRemove,
}: {
  item: PackageRow;
  globalFrameColor?: FrameColor | null;
  onEdit: () => void;
  onDuplicate: () => void;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const isGroup = item.product_type === "group_package";

  return (
    <article
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-card/65 transition-colors",
        item.active ? "border-border hover:border-primary/25" : "border-border/65 opacity-70",
      )}
    >
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="border-b border-border px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              {item.code ? (
                <span className="rounded border border-primary/20 bg-primary/5 px-2 py-1 font-mono text-[0.62rem] font-bold tracking-[0.12em] text-primary">
                  {item.code}
                </span>
              ) : null}
              <span className="rounded border border-border bg-background/50 px-2 py-1 text-[0.61rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {isGroup ? "Class / Group" : "Solo Add-on"}
              </span>
            </div>
            <h3 className="font-display text-[0.9rem] font-extrabold tracking-[-0.025em]">{item.name}</h3>
            <p className="mt-1 min-h-8 text-[0.68rem] leading-relaxed text-muted-foreground">
              {item.description || (isGroup ? "Official class/group photo package" : "Optional solo portrait product")}
            </p>
          </div>
          <StatusPill label={item.active ? "Client visible" : "Hidden"} tone={item.active ? "success" : "neutral"} />
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="font-display text-[2rem] font-extrabold tracking-[-0.055em]">{peso(item.price)}</p>
            <p className="mt-1 text-[0.64rem] uppercase tracking-[0.08em] text-muted-foreground">
              {isGroup ? "Primary package" : "Optional add-on"}
            </p>
          </div>
          <div className="text-right text-[0.65rem] text-muted-foreground">
            <p>{item.quantity} print{item.quantity === 1 ? "" : "s"}</p>
            <p className="mt-0.5 font-semibold text-foreground/80">{item.print_size}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <span className="rounded-md border border-border bg-background/45 px-2 py-1 text-[0.63rem] text-muted-foreground">
            {item.framed
              ? globalFrameColor
                ? `Framed + white mat · Global ${globalFrameColor[0].toUpperCase() + globalFrameColor.slice(1)}`
                : `Framed + white mat · ${(item.frame_colors?.length ? item.frame_colors : ["black"]).map((color) => color[0].toUpperCase() + color.slice(1)).join(" / ")}`
              : "Print only"}
          </span>
          {item.digital_copy ? (
            <span className="rounded-md border border-border bg-background/45 px-2 py-1 text-[0.63rem] text-muted-foreground">
              Digital copy included
            </span>
          ) : null}
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-4 sm:flex sm:flex-wrap">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Edit3 className="size-3.5" /> Edit
          </Button>
          <Button size="sm" variant="ghost" onClick={onToggle}>
            {item.active ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            {item.active ? "Hide" : "Show"}
          </Button>
          <Button size="sm" variant="ghost" onClick={onDuplicate}>
            <Copy className="size-3.5" /> Duplicate
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-muted-foreground hover:text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>
      </div>
    </article>
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
  const [savingGlobalFrameColor, setSavingGlobalFrameColor] = useState(false);

  const groupPackages = useMemo(
    () =>
      (data?.packages.filter((item) => item.product_type === "group_package") ?? [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [data?.packages],
  );

  const soloAddons = useMemo(
    () =>
      (data?.packages.filter((item) => item.product_type === "solo_addon") ?? [])
        .slice()
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    [data?.packages],
  );

  const globalFrameEnabled = Boolean(data?.event?.single_frame_color_enabled);
  const globalFrameColor = (data?.event?.single_frame_color ?? "black") as FrameColor;
  const visibleCount = useMemo(() => data?.packages.filter((item) => item.active).length ?? 0, [data?.packages]);
  const startingPrice = useMemo(() => {
    const prices = (data?.packages ?? []).filter((item) => item.active).map((item) => Number(item.price));
    return prices.length ? Math.min(...prices) : 0;
  }, [data?.packages]);

  if (isLoading || !data) {
    return (
      <AppShell>
        <PageHeader eyebrow="Pricing" title="Packages & Pricing" />
        <LoadingGrid rows={5} />
      </AppShell>
    );
  }

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
      frame_colors: item.frame_colors?.length ? item.frame_colors : ["black"],
      digital_copy: item.digital_copy,
      description: item.description ?? "",
      active: item.active,
    });
    setOpen(true);
  }

  function startDuplicate(item: PackageRow) {
    if (!requireStaff()) return;
    setEditingId(null);
    setForm({
      code: item.product_type === "group_package" ? "" : item.code ?? "",
      product_type: item.product_type,
      name: `${item.name} Copy`,
      price: String(item.price),
      print_size: item.print_size,
      quantity: String(item.quantity),
      framed: item.framed,
      frame_colors: item.frame_colors?.length ? item.frame_colors : ["black"],
      digital_copy: item.digital_copy,
      description: item.description ?? "",
      active: false,
    });
    setOpen(true);
    toast.message("Duplicate prepared", { description: "Review the name, code and price before saving." });
  }

  async function save() {
    if (!requireStaff() || !data.event) return;
    const price = Number(form.price);
    const quantity = Math.max(1, Number(form.quantity) || 1);

    if (!form.name.trim()) return toast.error("Product name is required.");
    if (!Number.isFinite(price) || price < 0) return toast.error("Enter a valid price.");
    if (form.framed && !form.frame_colors.length) return toast.error("Select at least one frame color.");

    if (form.product_type === "group_package" && form.code.trim()) {
      const duplicateCode = data.packages.find(
        (item) =>
          item.id !== editingId &&
          item.product_type === "group_package" &&
          item.code?.trim().toLowerCase() === form.code.trim().toLowerCase(),
      );
      if (duplicateCode) return toast.error(`${form.code.trim()} is already used by another class package.`);
    }

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
        frame_colors: form.framed ? form.frame_colors : ["black"],
        digital_copy: form.digital_copy,
        description: form.description.trim() || null,
        active: form.active,
        sort_order: editingId
          ? data.packages.find((item) => item.id === editingId)?.sort_order ?? data.packages.length
          : data.packages.length + 1,
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

    const missing = PSS_DEFAULTS.filter((item) => {
      if (item.code) {
        return !data.packages.some(
          (existing) =>
            existing.product_type === item.product_type &&
            existing.code?.toLowerCase() === item.code.toLowerCase(),
        );
      }

      return !data.packages.some(
        (existing) =>
          existing.product_type === item.product_type &&
          existing.name.trim().toLowerCase() === item.name.toLowerCase(),
      );
    });

    if (!missing.length) {
      toast.success("PSS defaults are already loaded");
      return;
    }

    setLoadingDefaults(true);
    try {
      const rows = missing.map((item, index) => ({
        ...item,
        event_id: data.event!.id,
        frame_colors: ["black"] as FrameColor[],
        digital_copy: false,
        active: true,
        sort_order: data.packages.length + index + 1,
      }));

      const { error } = await withTimeout(
        supabase.from("packages").insert(rows as never),
        12_000,
        "Adding the default packages took too long.",
      );

      if (error) throw error;

      toast.success(
        missing.length === PSS_DEFAULTS.length
          ? "PSS default packages added"
          : `${missing.length} missing PSS default${missing.length === 1 ? "" : "s"} added`,
      );

      await withTimeout(refetch(), 12_000, "Package action completed, but refresh took too long.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Defaults could not be added.");
    } finally {
      setLoadingDefaults(false);
    }
  }

  async function saveGlobalFrameControl(enabled: boolean, color: FrameColor = globalFrameColor) {
    if (!requireStaff() || !data.event) return;
    setSavingGlobalFrameColor(true);

    try {
      const { error } = await withTimeout(
        supabase
          .from("events")
          .update({
            single_frame_color_enabled: enabled,
            single_frame_color: color,
          } as never)
          .eq("id", data.event.id),
        12_000,
        "Frame color setting update timed out.",
      );

      if (error) throw error;

      await withTimeout(refetch(), 12_000, "Frame color setting saved, but refresh took too long.");

      const label = FRAME_COLOR_OPTIONS.find((option) => option.value === color)?.label ?? color;
      toast.success(
        enabled
          ? `One frame color enabled · ${label}`
          : "Per-package frame colors restored",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Frame color setting could not be saved.");
    } finally {
      setSavingGlobalFrameColor(false);
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
    toast.success(item.active ? "Hidden from client checkout" : "Product is now visible to clients");
  }

  function toggleFrameColor(color: FrameColor, enabled: boolean) {
    if (!enabled && form.frame_colors.length === 1 && form.frame_colors[0] === color) {
      toast.message("Keep at least one frame color for framed products.");
      return;
    }

    setForm({
      ...form,
      frame_colors: enabled
        ? Array.from(new Set([...form.frame_colors, color]))
        : form.frame_colors.filter((item) => item !== color),
    });
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
        description="Build the exact lineup clients see during ordering. Class/group packages stay primary; solo portraits remain optional add-ons."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void loadDefaults()} disabled={loadingDefaults}>
              <Sparkles className="size-4" />
              {loadingDefaults ? "Checking…" : "Load PSS defaults"}
            </Button>
            <Button onClick={() => startNew("group_package")}>
              <Plus className="size-4" /> Class package
            </Button>
          </div>
        }
      />

      {!data.event ? (
        <EmptyState
          title="Select an event first"
          description="Every package belongs to an event."
          action={
            <Button asChild>
              <Link to="/events">Open Events</Link>
            </Button>
          }
        />
      ) : (
        <>
          <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SummaryCard
              icon={Images}
              label="Class packages"
              value={String(groupPackages.length)}
              note={`${groupPackages.filter((item) => item.active).length} visible to clients`}
            />
            <SummaryCard
              icon={Image}
              label="Solo add-ons"
              value={String(soloAddons.length)}
              note={`${soloAddons.filter((item) => item.active).length} available after photo selection`}
            />
            <SummaryCard
              icon={PackageCheck}
              label="Client-visible"
              value={String(visibleCount)}
              note={`${data.packages.length - visibleCount} hidden product${data.packages.length - visibleCount === 1 ? "" : "s"}`}
            />
            <SummaryCard
              icon={PackagePlus}
              label="Starting price"
              value={startingPrice ? peso(startingPrice) : "—"}
              note="Lowest active product price in this event"
            />
          </section>

          <section className="mb-7 rounded-xl border border-border bg-card/65 p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="max-w-2xl">
                <div className="flex items-center gap-2">
                  <p className="eyebrow">Frame color control</p>
                  {globalFrameEnabled ? (
                    <span className="rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 text-[0.62rem] font-semibold text-primary">
                      One color for all
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-1 font-display text-lg font-extrabold tracking-[-0.035em]">
                  Use one frame color for all framed products
                </h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  Turn this on to hide the frame color chooser from clients and apply one color to every framed class and solo package. Turn it off anytime to restore each package’s saved colors.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-border bg-background/45 px-4 py-3">
                <div className="text-right">
                  <p className="text-xs font-semibold">{globalFrameEnabled ? "Enabled" : "Per-package colors"}</p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    {globalFrameEnabled ? "Client chooser is hidden" : "Package settings are active"}
                  </p>
                </div>
                <Switch
                  checked={globalFrameEnabled}
                  disabled={savingGlobalFrameColor}
                  onCheckedChange={(checked) => void saveGlobalFrameControl(checked, globalFrameColor)}
                  aria-label="Use one frame color for all framed products"
                />
              </div>
            </div>

            {globalFrameEnabled ? (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-[0.67rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                  Frame color for all
                </p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {FRAME_COLOR_OPTIONS.map((option) => {
                    const selected = globalFrameColor === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        disabled={savingGlobalFrameColor}
                        onClick={() => void saveGlobalFrameControl(true, option.value)}
                        className={cn(
                          "flex items-center gap-3 rounded-lg border p-3 text-left text-sm transition",
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border bg-background/40 hover:border-primary/30",
                        )}
                      >
                        <span className="size-5 rounded-full border border-border" style={{ background: option.swatch }} />
                        <span className="font-semibold">{option.label}</span>
                        {selected ? <Check className="ml-auto size-4 text-primary" /> : null}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 text-[0.67rem] text-muted-foreground">
                  Original per-package frame colors stay saved. Switching this off restores them automatically.
                </p>
              </div>
            ) : null}
          </section>

          {open ? (
            <Panel
              className="mb-7 border-primary/20 bg-card/85"
              title={editingId ? "Edit product" : form.product_type === "group_package" ? "New class/group package" : "New solo add-on"}
              description={editingId ? "Changes update this event’s client-facing package catalog." : "Create the product, review visibility, then save it to this event."}
            >
              <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px]">
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <Field label="Product type">
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                      value={form.product_type}
                      onChange={(event) => setForm({ ...form, product_type: event.target.value as PackageProductType })}
                    >
                      <option value="group_package">Class / group package</option>
                      <option value="solo_addon">Solo portrait add-on</option>
                    </select>
                  </Field>

                  <Field label="Code" hint={form.product_type === "group_package" ? "P1, P2, P3…" : "optional"}>
                    <Input
                      value={form.code}
                      onChange={(event) => setForm({ ...form, code: event.target.value })}
                      placeholder={form.product_type === "group_package" ? "P1" : "Optional"}
                    />
                  </Field>

                  <div className="lg:col-span-2">
                    <Field label="Product name">
                      <Input
                        value={form.name}
                        onChange={(event) => setForm({ ...form, name: event.target.value })}
                        placeholder={form.product_type === "group_package" ? "Class Photo · Framed" : "Solo 5R + Frame"}
                      />
                    </Field>
                  </div>

                  <Field label="Price">
                    <Input
                      type="number"
                      min="0"
                      value={form.price}
                      onChange={(event) => setForm({ ...form, price: event.target.value })}
                      placeholder="550"
                    />
                  </Field>

                  <Field label="Print size" hint="Common or custom">
                    <Input
                      list="photoflow-print-sizes"
                      value={form.print_size}
                      onChange={(event) => setForm({ ...form, print_size: event.target.value })}
                      placeholder="8R / 8×10"
                    />
                    <datalist id="photoflow-print-sizes">
                      {COMMON_PRINT_SIZES.map((size) => <option key={size} value={size} />)}
                    </datalist>
                    <p className="text-[0.65rem] text-muted-foreground">Choose a common size or type any custom size.</p>
                  </Field>

                  <Field label="Prints per product">
                    <Input
                      type="number"
                      min="1"
                      value={form.quantity}
                      onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                    />
                  </Field>

                  <div className="grid gap-2 rounded-lg border border-border bg-background/35 p-3">
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.framed}
                        onCheckedChange={(checked) => setForm({ ...form, framed: checked === true })}
                      />
                      Framed product
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.digital_copy}
                        onCheckedChange={(checked) => setForm({ ...form, digital_copy: checked === true })}
                      />
                      Digital copy included
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.active}
                        onCheckedChange={(checked) => setForm({ ...form, active: checked === true })}
                      />
                      Visible to clients
                    </label>
                  </div>

                  {form.framed ? (
                    <div className="md:col-span-2 lg:col-span-4 rounded-lg border border-border bg-background/35 p-4">
                      <div className="mb-3">
                        <Label>Available frame colors</Label>
                        <p className="mt-1 text-[0.67rem] text-muted-foreground">
                          Select one or more. If only one color is selected, PhotoFlow applies it automatically and hides the color chooser from the client.
                        </p>
                        {globalFrameEnabled ? (
                          <p className="mt-2 rounded-md border border-primary/15 bg-primary/5 px-3 py-2 text-[0.67rem] text-primary">
                            Global frame color is active. These package colors stay saved but are temporarily overridden for clients.
                          </p>
                        ) : null}
                      </div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {FRAME_COLOR_OPTIONS.map((option) => {
                          const checked = form.frame_colors.includes(option.value);
                          return (
                            <label key={option.value} className="flex items-center gap-3 rounded-lg border border-border bg-card/70 p-3 text-sm">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={(value) => toggleFrameColor(option.value, value === true)}
                              />
                              <span className="size-4 rounded-full border border-border" style={{ background: option.swatch }} />
                              <span className="font-medium">{option.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div className="md:col-span-2 lg:col-span-4">
                    <Field label="Description" hint="Shown under the product name">
                      <Textarea
                        rows={3}
                        value={form.description}
                        onChange={(event) => setForm({ ...form, description: event.target.value })}
                        placeholder="Briefly explain what is included."
                      />
                    </Field>
                  </div>
                </div>

                <aside className="rounded-lg border border-border bg-background/35 p-4">
                  <p className="eyebrow">Client preview</p>
                  <div className="mt-3 rounded-lg border border-border bg-card/80 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="rounded border border-primary/20 bg-primary/5 px-2 py-1 font-mono text-[0.62rem] font-bold text-primary">
                        {form.code.trim() || (form.product_type === "group_package" ? "PACKAGE" : "ADD-ON")}
                      </span>
                      <StatusPill label={form.active ? "Client visible" : "Hidden"} tone={form.active ? "success" : "neutral"} />
                    </div>
                    <p className="mt-3 font-display text-sm font-extrabold">{form.name.trim() || "Product name"}</p>
                    <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
                      {form.description.trim() || "Product description will appear here."}
                    </p>
                    <p className="mt-4 font-display text-3xl font-extrabold">{form.price ? peso(Number(form.price) || 0) : "₱—"}</p>
                    <p className="mt-1 text-[0.66rem] text-muted-foreground">
                      {form.quantity || "1"} × {form.print_size || "Print size"} · {form.framed ? `Framed · ${form.frame_colors.map((color) => color[0].toUpperCase() + color.slice(1)).join(" / ")}` : "Print only"}
                    </p>
                  </div>
                  <p className="mt-3 text-[0.67rem] leading-relaxed text-muted-foreground">
                    This preview helps you catch confusing names, duplicate codes, or wrong visibility before saving.
                  </p>
                </aside>
              </div>

              <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
                <Button onClick={() => void save()} disabled={saving}>
                  <Check className="size-4" /> {saving ? "Saving…" : editingId ? "Save changes" : "Create product"}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setOpen(false);
                    setEditingId(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </Panel>
          ) : null}

          <section>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="eyebrow">Primary product</p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[0.6rem] text-muted-foreground">
                    {groupPackages.length}
                  </span>
                </div>
                <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em]">Class / Group Packages</h2>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  These are the main products. Each package uses the official class/group photo matched to the client’s class.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => startNew("group_package")}>
                <PackagePlus className="size-4" /> Add class package
              </Button>
            </div>

            {groupPackages.length ? (
              <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
                {groupPackages.map((item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    globalFrameColor={globalFrameEnabled ? globalFrameColor : null}
                    onEdit={() => startEdit(item)}
                    onDuplicate={() => startDuplicate(item)}
                    onToggle={() => void toggle(item)}
                    onRemove={() => void remove(item)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No class packages yet" description="Load the PSS defaults or create your first class package." />
            )}
          </section>

          <section className="mt-9 border-t border-border pt-8">
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="eyebrow">Optional</p>
                  <span className="rounded-full border border-border px-2 py-0.5 text-[0.6rem] text-muted-foreground">
                    {soloAddons.length}
                  </span>
                </div>
                <h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-0.04em]">Solo Portrait Add-ons</h2>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  These use the client’s selected solo portrait and are added after a class/group package is chosen.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => startNew("solo_addon")}>
                <Plus className="size-4" /> Add solo add-on
              </Button>
            </div>

            {soloAddons.length ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {soloAddons.map((item) => (
                  <ProductCard
                    key={item.id}
                    item={item}
                    globalFrameColor={globalFrameEnabled ? globalFrameColor : null}
                    onEdit={() => startEdit(item)}
                    onDuplicate={() => startDuplicate(item)}
                    onToggle={() => void toggle(item)}
                    onRemove={() => void remove(item)}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No solo add-ons yet"
                description="Solo add-ons are optional. Clients can still order only a class/group package."
              />
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
