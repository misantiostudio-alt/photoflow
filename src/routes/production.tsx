import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCopy,
  Frame,
  PackageCheck,
  Plus,
  Printer,
  ShoppingCart,
  UsersRound,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { PeopleAvatars } from "@/components/person-avatar";
import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";
import { findParticipant, findPhoto, useOps, useSession } from "@/lib/data";
import { paymentTone, peso, productionTone, titleize } from "@/lib/domain";
import { procurementKey, useProductionProcurement } from "@/lib/production-procurement";
import { useSupplierOrderActions, useSupplierOrders } from "@/lib/supplier-orders";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/production")({ component: ProductionPage });

type QueueTab = "to_print" | "finish" | "ready";

type SupplierDraftLine = {
  key: string;
  enabled: boolean;
  item_type: "print" | "frame";
  print_size: string;
  frame_color: string;
  quantity: string;
  unit_cost: string;
};

type RequirementRow = {
  key: string;
  itemType: "print" | "frame";
  printSize: string;
  frameColor: string;
  required: number;
};

function ProductionPage() {
  const { data, isLoading, refetch } = useOps();
  const email = useSession();
  const navigate = useNavigate();

  const eventId = data?.event?.id ?? null;
  const procurement = useProductionProcurement(eventId);
  const supplierOrders = useSupplierOrders(eventId);
  const supplierActions = useSupplierOrderActions(eventId);

  const [queueTab, setQueueTab] = useState<QueueTab>("to_print");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);
  const [busyOrder, setBusyOrder] = useState<string | null>(null);

  const [supplierFormOpen, setSupplierFormOpen] = useState(false);
  const [showAllSupplierOrders, setShowAllSupplierOrders] = useState(false);
  const [supplierBusy, setSupplierBusy] = useState<string | null>(null);
  const [supplierForm, setSupplierForm] = useState({
    supplier_name: "",
    supplier_contact: "",
    expected_date: "",
    shipping_cost: "",
    notes: "",
  });
  const [supplierLines, setSupplierLines] = useState<SupplierDraftLine[]>([]);

  const materialOrders = useMemo(
    () => data?.orders.filter((order) => order.status !== "cancelled") ?? [],
    [data?.orders],
  );
  const materialOrderIds = useMemo(() => new Set(materialOrders.map((order) => order.id)), [materialOrders]);
  const materialItems = useMemo(
    () => data?.orderItems.filter((item) => materialOrderIds.has(item.order_id)) ?? [],
    [data?.orderItems, materialOrderIds],
  );

  const productionOrders = useMemo(
    () => data?.orders.filter((order) => order.status !== "cancelled" && order.production_status !== "delivered") ?? [],
    [data?.orders],
  );

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, NonNullable<typeof data>["orderItems"]>();
    for (const item of data?.orderItems ?? []) {
      const list = map.get(item.order_id) ?? [];
      list.push(item);
      map.set(item.order_id, list);
    }
    return map;
  }, [data?.orderItems]);

  const procurementMap = useMemo(
    () => new Map((procurement.data ?? []).map((row) => [procurementKey(row.item_type, row.print_size, row.frame_color), row])),
    [procurement.data],
  );

  const requirements = useMemo(() => {
    const map = new Map<string, RequirementRow>();

    for (const item of materialItems) {
      const printSize = item.print_size || "Unspecified";
      const printKey = procurementKey("print", printSize, "");
      const printRow = map.get(printKey) ?? {
        key: printKey,
        itemType: "print" as const,
        printSize,
        frameColor: "",
        required: 0,
      };
      printRow.required += Number(item.quantity || 0);
      map.set(printKey, printRow);

      if (item.framed) {
        const frameColor = item.frame_color || "black";
        const frameKey = procurementKey("frame", printSize, frameColor);
        const frameRow = map.get(frameKey) ?? {
          key: frameKey,
          itemType: "frame" as const,
          printSize,
          frameColor,
          required: 0,
        };
        frameRow.required += Number(item.quantity || 0);
        map.set(frameKey, frameRow);
      }
    }

    return [...map.values()].sort((a, b) => {
      if (a.itemType !== b.itemType) return a.itemType === "print" ? -1 : 1;
      return a.printSize.localeCompare(b.printSize, undefined, { numeric: true })
        || a.frameColor.localeCompare(b.frameColor);
    });
  }, [materialItems]);

  const outstandingSupplierLines = useMemo(() => {
    return requirements.flatMap((row): SupplierDraftLine[] => {
      const track = procurementMap.get(row.key);
      const remaining = Math.max(0, row.required - Number(track?.ordered_qty ?? 0));
      if (remaining <= 0) return [];
      return [{
        key: row.key,
        enabled: true,
        item_type: row.itemType,
        print_size: row.printSize,
        frame_color: row.frameColor,
        quantity: String(remaining),
        unit_cost: "",
      }];
    });
  }, [procurementMap, requirements]);

  const supplierPendingUnits = useMemo(
    () => requirements.reduce((sum, row) => {
      const track = procurementMap.get(row.key);
      return sum + Math.max(0, row.required - Number(track?.ordered_qty ?? 0));
    }, 0),
    [procurementMap, requirements],
  );

  const queue = useMemo(() => {
    return productionOrders.map((order) => {
      const items = itemsByOrder.get(order.id) ?? [];
      const hasFrames = items.some((item) => item.framed);
      const tab = queueTabFor(order.production_status, hasFrames);
      return { order, items, hasFrames, tab };
    });
  }, [itemsByOrder, productionOrders]);

  const queueCounts = useMemo(() => ({
    to_print: queue.filter((row) => row.tab === "to_print").length,
    finish: queue.filter((row) => row.tab === "finish").length,
    ready: queue.filter((row) => row.tab === "ready").length,
  }), [queue]);

  const visibleQueue = useMemo(() => queue.filter((row) => row.tab === queueTab), [queue, queueTab]);
  const visibleSelectableIds = visibleQueue.filter((row) => row.tab !== "ready").map((row) => row.order.id);
  const allVisibleSelected = visibleSelectableIds.length > 0 && visibleSelectableIds.every((id) => selectedIds.includes(id));

  const supplierDraftSubtotal = useMemo(
    () => supplierLines
      .filter((line) => line.enabled)
      .reduce((sum, line) => sum + Math.max(0, Number(line.quantity || 0)) * Math.max(0, Number(line.unit_cost || 0)), 0),
    [supplierLines],
  );
  const supplierDraftTotal = supplierDraftSubtotal + Math.max(0, Number(supplierForm.shipping_cost || 0));

  if (isLoading || !data) {
    return <AppShell><PageHeader eyebrow="Production" title="Production" /><LoadingGrid rows={6} /></AppShell>;
  }

  function requireStaff() {
    if (email) return true;
    void navigate({ to: "/auth" });
    return false;
  }

  function openSupplierOrder() {
    if (!requireStaff()) return;
    if (!outstandingSupplierLines.length) {
      toast.message("All current material requirements are already covered by supplier orders.");
      return;
    }
    setSupplierLines(outstandingSupplierLines);
    setSupplierFormOpen(true);
  }

  async function createSupplierOrder() {
    if (!requireStaff()) return;
    if (supplierForm.supplier_name.trim().length < 2) {
      toast.error("Please enter the supplier name.");
      return;
    }

    const items = supplierLines
      .filter((line) => line.enabled && Number(line.quantity) > 0)
      .map((line) => ({
        item_type: line.item_type,
        print_size: line.print_size,
        frame_color: line.frame_color || null,
        quantity: Math.max(1, Math.round(Number(line.quantity))),
        unit_cost: Math.max(0, Number(line.unit_cost || 0)),
      }));

    if (!items.length) {
      toast.error("Please select at least one item.");
      return;
    }

    setSupplierBusy("create");
    try {
      await supplierActions.createDraft({
        supplier_name: supplierForm.supplier_name.trim(),
        supplier_contact: supplierForm.supplier_contact.trim() || null,
        expected_date: supplierForm.expected_date || null,
        shipping_cost: Math.max(0, Number(supplierForm.shipping_cost || 0)),
        notes: supplierForm.notes.trim() || null,
        items,
      });
      setSupplierFormOpen(false);
      setSupplierLines([]);
      setSupplierForm({ supplier_name: "", supplier_contact: "", expected_date: "", shipping_cost: "", notes: "" });
      toast.success("Supplier order draft created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Supplier order could not be created.");
    } finally {
      setSupplierBusy(null);
    }
  }

  async function setSupplierStatus(id: string, status: "ordered" | "received" | "cancelled") {
    if (!requireStaff()) return;
    const message = status === "ordered"
      ? "Mark this purchase order as ordered?"
      : status === "received"
        ? "Mark this purchase order as fully received? Its actual costs will also be recorded in Finance."
        : "Cancel this draft supplier order?";
    if (!confirm(message)) return;

    setSupplierBusy(id);
    try {
      await supplierActions.setStatus(id, status);
      toast.success(status === "ordered" ? "Supplier order marked Ordered" : status === "received" ? "Supplier order received and sent to Finance" : "Supplier order cancelled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Supplier order could not be updated.");
    } finally {
      setSupplierBusy(null);
    }
  }

  async function copySupplierOrder(order: NonNullable<typeof supplierOrders.data>[number]) {
    const lines = [
      `PHOTOFLOW PURCHASE ORDER · ${order.po_number}`,
      `Supplier: ${order.supplier_name}`,
      order.supplier_contact ? `Contact: ${order.supplier_contact}` : "",
      order.expected_date ? `Expected: ${order.expected_date}` : "",
      "",
      ...order.items.map((item) => {
        const color = item.item_type === "frame" && item.frame_color
          ? ` · ${titleize(item.frame_color)}`
          : "";
        const cost = item.unit_cost > 0 ? ` @ ${peso(item.unit_cost)} = ${peso(item.line_total)}` : "";
        return `${item.quantity} × ${item.print_size} ${item.item_type === "frame" ? "Frame" : "Print"}${color}${cost}`;
      }),
      "",
      `Total: ${peso(order.total)}`,
      order.notes ? `Notes: ${order.notes}` : "",
    ].filter(Boolean).join("\n");

    try {
      await navigator.clipboard.writeText(lines);
      toast.success("Supplier order summary copied");
    } catch {
      toast.error("Could not copy the order automatically.");
    }
  }

  async function advanceOne(orderId: string) {
    if (!requireStaff()) return;
    const row = queue.find((item) => item.order.id === orderId);
    if (!row) return;
    const action = nextAction(row.order.production_status, row.hasFrames);
    if (!action) return;

    if (action.needsQuickCheck) {
      const ok = confirm("Quick check before marking Ready:\n\n• Correct photo and size\n• Print/frame looks good\n• Quantity and order are complete");
      if (!ok) return;
    }

    setBusyOrder(orderId);
    try {
      const result = await withTimeout(
        supabase.from("orders").update({ production_status: action.next }).eq("id", orderId),
        12_000,
        "Production update took too long.",
      );
      if (result.error) throw result.error;
      toast.success(action.next === "ready" ? "Order is Ready for release" : action.next === "framed" ? "Marked as framed" : "Marked as printed");
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Production status could not be updated.");
    } finally {
      setBusyOrder(null);
    }
  }

  async function advanceSelected() {
    if (!requireStaff()) return;
    const selectedRows = queue.filter((row) => selectedIds.includes(row.order.id));
    if (!selectedRows.length) return;

    const actions = selectedRows
      .map((row) => ({ row, action: nextAction(row.order.production_status, row.hasFrames) }))
      .filter((entry) => entry.action);

    if (!actions.length) return;

    if (actions.some((entry) => entry.action?.needsQuickCheck)) {
      const ok = confirm("Quick check for the selected orders:\n\n• Correct photo and size\n• Print/frame looks good\n• Quantity and order are complete");
      if (!ok) return;
    } else if (!confirm(`Advance ${actions.length} selected order${actions.length === 1 ? "" : "s"}?`)) {
      return;
    }

    setBusyOrder("bulk");
    try {
      await withTimeout(
        Promise.all(actions.map(async ({ row, action }) => {
          const result = await supabase.from("orders").update({ production_status: action!.next }).eq("id", row.order.id);
          if (result.error) throw result.error;
        })),
        18_000,
        "Bulk production update took too long.",
      );
      setSelectedIds([]);
      toast.success(`${actions.length} order${actions.length === 1 ? "" : "s"} updated`);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Selected orders could not be updated.");
    } finally {
      setBusyOrder(null);
    }
  }

  function changeQueueTab(tab: QueueTab) {
    setQueueTab(tab);
    setSelectedIds([]);
    setExpandedOrder(null);
  }

  return (
    <AppShell>
      <PageHeader
        eyebrow={data.event?.name ?? "Production"}
        title="Production"
        description="One work board for materials, supplier orders and the next action for every client order."
      />

      {!data.event ? (
        <EmptyState title="No event selected" description="Select an event before using Production." />
      ) : (
        <>
          <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="To print" value={queueCounts.to_print} note="Orders waiting for printing" icon={<Printer className="size-4" />} />
            <Metric label="Finishing" value={queueCounts.finish} note="Framing or final check" icon={<Frame className="size-4" />} />
            <Metric label="Supplier pending" value={supplierPendingUnits} note="Physical units not ordered yet" icon={<ShoppingCart className="size-4" />} warning={supplierPendingUnits > 0} />
            <Metric label="Ready" value={queueCounts.ready} note="Can move to Release" icon={<PackageCheck className="size-4" />} accent={queueCounts.ready > 0} />
          </section>

          <section className="mb-5">
            <Panel
              title="Materials"
              description="Event-wide totals. Supplier purchase orders are the only source for Ordered and Received quantities."
              actions={
                <Button onClick={openSupplierOrder} disabled={!outstandingSupplierLines.length}>
                  <ShoppingCart className="size-4" /> Create supplier order
                </Button>
              }
            >
              {requirements.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border">
                        <th className="px-2 py-2">Item</th>
                        <th className="px-2 py-2 text-right">Need</th>
                        <th className="px-2 py-2 text-right">Ordered</th>
                        <th className="px-2 py-2 text-right">Received</th>
                        <th className="px-2 py-2 text-right">Still to order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requirements.map((row) => {
                        const track = procurementMap.get(row.key);
                        const ordered = Number(track?.ordered_qty ?? 0);
                        const received = Number(track?.received_qty ?? 0);
                        const stillToOrder = Math.max(0, row.required - ordered);
                        const itemLabel = row.itemType === "frame"
                          ? `${row.printSize} · ${titleize(row.frameColor || "black")} frame`
                          : `${row.printSize} · Print`;
                        return (
                          <tr key={row.key} className="border-b border-border/70 last:border-0">
                            <td className="px-2 py-3 font-semibold">{itemLabel}</td>
                            <td className="px-2 py-3 text-right">{row.required}</td>
                            <td className="px-2 py-3 text-right">{ordered}</td>
                            <td className="px-2 py-3 text-right">{received}</td>
                            <td className={cn("px-2 py-3 text-right font-semibold", stillToOrder > 0 ? "text-warning" : "text-success")}>{stillToOrder}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-sm text-muted-foreground">Materials will appear when this event has real orders.</p>}
            </Panel>
          </section>

          <section className="mb-5">
            <Panel
              title="Supplier purchase orders"
              description="Draft, send, receive. Received costs are automatically recorded in Finance."
              actions={
                <Button size="sm" variant="outline" onClick={() => setShowAllSupplierOrders((value) => !value)}>
                  {showAllSupplierOrders ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  {showAllSupplierOrders ? "Collapse" : "View orders"}
                </Button>
              }
            >
              {supplierFormOpen ? (
                <div className="mb-5 rounded-xl border border-primary/25 bg-primary/[.025] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-lg font-extrabold">New supplier order</p>
                      <p className="mt-1 text-xs text-muted-foreground">Only outstanding quantities are preselected.</p>
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => setSupplierFormOpen(false)}><X className="size-4" /></Button>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <Field label="Supplier"><Input value={supplierForm.supplier_name} onChange={(event) => setSupplierForm({ ...supplierForm, supplier_name: event.target.value })} placeholder="Print lab / frame shop" /></Field>
                    <Field label="Contact (optional)"><Input value={supplierForm.supplier_contact} onChange={(event) => setSupplierForm({ ...supplierForm, supplier_contact: event.target.value })} /></Field>
                    <Field label="Expected date (optional)"><Input type="date" value={supplierForm.expected_date} onChange={(event) => setSupplierForm({ ...supplierForm, expected_date: event.target.value })} /></Field>
                    <Field label="Shipping / delivery"><Input type="number" min="0" step="0.01" value={supplierForm.shipping_cost} onChange={(event) => setSupplierForm({ ...supplierForm, shipping_cost: event.target.value })} placeholder="0.00" /></Field>
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                    <table className="w-full min-w-[700px] text-left text-xs">
                      <thead className="bg-muted/20 text-muted-foreground">
                        <tr><th className="w-12 px-3 py-2">Add</th><th className="px-3 py-2">Item</th><th className="w-28 px-3 py-2 text-right">Qty</th><th className="w-36 px-3 py-2 text-right">Unit cost</th><th className="w-36 px-3 py-2 text-right">Total</th></tr>
                      </thead>
                      <tbody>
                        {supplierLines.map((line, index) => (
                          <tr key={line.key} className="border-t border-border">
                            <td className="px-3 py-3"><Checkbox checked={line.enabled} onCheckedChange={(checked) => setSupplierLines((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, enabled: checked === true } : row))} /></td>
                            <td className="px-3 py-3 font-semibold">{line.print_size} · {line.item_type === "frame" ? `${titleize(line.frame_color)} frame` : "Print"}</td>
                            <td className="px-3 py-3"><Input className="text-right" type="number" min="1" value={line.quantity} onChange={(event) => setSupplierLines((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, quantity: event.target.value } : row))} /></td>
                            <td className="px-3 py-3"><Input className="text-right" type="number" min="0" step="0.01" value={line.unit_cost} onChange={(event) => setSupplierLines((rows) => rows.map((row, rowIndex) => rowIndex === index ? { ...row, unit_cost: event.target.value } : row))} placeholder="0.00" /></td>
                            <td className="px-3 py-3 text-right font-semibold">{peso(Math.max(0, Number(line.quantity || 0)) * Math.max(0, Number(line.unit_cost || 0)))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_260px]">
                    <Field label="Notes (optional)"><Textarea rows={3} value={supplierForm.notes} onChange={(event) => setSupplierForm({ ...supplierForm, notes: event.target.value })} placeholder="Matting, finish, delivery notes…" /></Field>
                    <div className="rounded-lg border border-border bg-muted/10 p-4">
                      <div className="flex justify-between text-xs text-muted-foreground"><span>Items</span><span>{peso(supplierDraftSubtotal)}</span></div>
                      <div className="mt-2 flex justify-between text-xs text-muted-foreground"><span>Shipping</span><span>{peso(Math.max(0, Number(supplierForm.shipping_cost || 0)))}</span></div>
                      <div className="mt-3 flex items-end justify-between border-t border-border pt-3"><span className="font-semibold">Total</span><span className="font-display text-xl font-extrabold">{peso(supplierDraftTotal)}</span></div>
                      <Button className="mt-4 w-full" onClick={() => void createSupplierOrder()} disabled={supplierBusy === "create"}><Plus className="size-4" /> {supplierBusy === "create" ? "Creating…" : "Create draft PO"}</Button>
                    </div>
                  </div>
                </div>
              ) : null}

              {showAllSupplierOrders ? (
                (supplierOrders.data ?? []).length ? (
                  <div className="grid gap-2">
                    {(supplierOrders.data ?? []).map((order) => (
                      <div key={order.id} className="flex flex-col gap-3 rounded-lg border border-border bg-muted/10 p-3 lg:flex-row lg:items-center">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold">{order.po_number}</p>
                            <span className="rounded-full border border-border px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[.08em] text-muted-foreground">{order.status}</span>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">{order.supplier_name} · {order.items.map((item) => `${item.quantity}× ${item.print_size} ${item.item_type === "frame" ? `${item.frame_color} frame` : "print"}`).join(" · ")}</p>
                        </div>
                        <p className="font-semibold">{peso(order.total)}</p>
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" onClick={() => void copySupplierOrder(order)}><ClipboardCopy className="size-3.5" /> Copy</Button>
                          {order.status === "draft" ? <Button size="sm" disabled={supplierBusy === order.id} onClick={() => void setSupplierStatus(order.id, "ordered")}><ShoppingCart className="size-3.5" /> Mark ordered</Button> : null}
                          {order.status === "ordered" ? <Button size="sm" disabled={supplierBusy === order.id} onClick={() => void setSupplierStatus(order.id, "received")}><PackageCheck className="size-3.5" /> Mark received</Button> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="text-sm text-muted-foreground">No supplier orders yet.</p>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/10 p-3">
                  <div>
                    <p className="text-sm font-semibold">{(supplierOrders.data ?? []).filter((order) => order.status !== "cancelled").length} supplier order{(supplierOrders.data ?? []).filter((order) => order.status !== "cancelled").length === 1 ? "" : "s"}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{(supplierOrders.data ?? []).filter((order) => order.status === "ordered").length} waiting to be received · {(supplierOrders.data ?? []).filter((order) => order.status === "draft").length} draft</p>
                  </div>
                  {outstandingSupplierLines.length ? <Button size="sm" onClick={openSupplierOrder}><Plus className="size-3.5" /> New PO</Button> : <span className="text-xs text-success">Current requirements covered</span>}
                </div>
              )}
            </Panel>
          </section>

          <section>
            <Panel
              title="Production queue"
              description="Work only on the next step. Open details only when you need photos or exact item information."
              actions={selectedIds.length ? <Button size="sm" onClick={() => void advanceSelected()} disabled={busyOrder === "bulk"}><Check className="size-3.5" /> Advance {selectedIds.length} selected</Button> : null}
            >
              <div className="mb-4 flex flex-wrap gap-2">
                {([
                  ["to_print", "To Print", queueCounts.to_print],
                  ["finish", "Finishing", queueCounts.finish],
                  ["ready", "Ready", queueCounts.ready],
                ] as const).map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => changeQueueTab(key)}
                    className={cn(
                      "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition",
                      queueTab === key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {label}<span className={cn("rounded-full px-1.5 py-0.5 text-[0.6rem]", queueTab === key ? "bg-primary-foreground/15" : "bg-muted")}>{count}</span>
                  </button>
                ))}
              </div>

              {visibleQueue.length ? (
                <div className="grid gap-2">
                  {queueTab !== "ready" ? (
                    <div className="flex items-center gap-2 px-2 pb-1 text-xs text-muted-foreground">
                      <Checkbox
                        checked={allVisibleSelected}
                        onCheckedChange={(checked) => {
                          setSelectedIds(checked === true ? visibleSelectableIds : []);
                        }}
                      />
                      Select all shown
                    </div>
                  ) : null}

                  {visibleQueue.map(({ order, items, hasFrames }) => {
                    const participant = findParticipant(data, order.participant_id);
                    const members = data.orderMembers
                      .filter((member) => member.order_id === order.id)
                      .map((member) => findParticipant(data, member.participant_id))
                      .filter(Boolean);
                    const people = members.length ? members : participant ? [participant] : [];
                    const action = nextAction(order.production_status, hasFrames);
                    const isExpanded = expandedOrder === order.id;
                    const selected = selectedIds.includes(order.id);
                    const thumbnails = [...new Set(items.map((item) => item.photo_id).filter(Boolean))]
                      .slice(0, 4)
                      .map((id) => findPhoto(data, id))
                      .filter(Boolean);

                    return (
                      <div key={order.id} className={cn("rounded-lg border bg-card", selected ? "border-primary/45" : "border-border")}>
                        <div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center">
                          {queueTab !== "ready" ? (
                            <Checkbox checked={selected} onCheckedChange={(checked) => setSelectedIds((current) => checked === true ? [...new Set([...current, order.id])] : current.filter((id) => id !== order.id))} />
                          ) : null}

                          <div className="flex min-w-0 flex-1 items-center gap-3">
                            <PeopleAvatars people={people} size="md" max={2} />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{members.length > 1 ? members.map((person) => person!.full_name).join(" · ") : participant?.full_name ?? order.order_number}</p>
                              <p className="mt-0.5 truncate text-xs text-muted-foreground">{order.order_number} · {items.map((item) => `${item.quantity}× ${item.print_size}${item.framed ? " framed" : ""}`).join(" · ")}</p>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <StatusPill label={order.payment_status} tone={paymentTone(order.payment_status)} />
                            <StatusPill label={simpleLabel(order.production_status, hasFrames)} tone={productionTone(order.production_status)} />
                          </div>

                          <div className="flex flex-wrap gap-2 lg:justify-end">
                            <Button size="sm" variant="ghost" onClick={() => setExpandedOrder(isExpanded ? null : order.id)}>
                              {isExpanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />} Details
                            </Button>
                            {order.production_status === "ready" ? (
                              <Button size="sm" asChild><Link to="/release">Open Release</Link></Button>
                            ) : action ? (
                              <Button size="sm" disabled={busyOrder === order.id} onClick={() => void advanceOne(order.id)}>
                                <Check className="size-3.5" /> {busyOrder === order.id ? "Saving…" : action.label}
                              </Button>
                            ) : null}
                          </div>
                        </div>

                        {isExpanded ? (
                          <div className="grid gap-4 border-t border-border p-4 lg:grid-cols-[1fr_auto]">
                            <div>
                              <p className="text-[0.65rem] font-bold uppercase tracking-[.12em] text-muted-foreground">Order items</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {items.map((item) => (
                                  <span key={item.id} className="rounded-md border border-border bg-muted/15 px-2.5 py-1.5 text-xs">
                                    <strong>{item.kind === "group_package" ? "Class" : "Solo"}</strong> · {item.quantity}× {item.print_size}{item.framed ? ` · ${titleize(item.frame_color || "black")} frame` : ""}
                                  </span>
                                ))}
                              </div>
                              <p className="mt-3 text-xs text-muted-foreground">{participant?.organization ?? "No congregation"} · {participant?.contact_number ?? "No contact number"}</p>
                            </div>
                            {thumbnails.length ? (
                              <div className="flex gap-2">
                                {thumbnails.map((photo) => <img key={photo!.id} src={photo!.thumbnail_url || photo!.url} alt="" className="h-20 w-16 rounded-md border border-border object-cover object-top" />)}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <EmptyState
                  title={queueTab === "to_print" ? "Nothing to print" : queueTab === "finish" ? "Nothing waiting for finishing" : "Nothing ready yet"}
                  description={queueTab === "ready" ? "Orders appear here after the quick production check." : "New client orders will appear automatically."}
                />
              )}
            </Panel>
          </section>
        </>
      )}
    </AppShell>
  );
}

function queueTabFor(stage: string, hasFrames: boolean): QueueTab {
  if (stage === "ready") return "ready";
  if (stage === "for_print") return "to_print";
  if (["printed", "print_qc", "framed", "frame_qc", "final_check"].includes(stage)) return "finish";
  return hasFrames ? "finish" : "to_print";
}

function simpleLabel(stage: string, hasFrames: boolean) {
  if (stage === "for_print") return "For Print";
  if (stage === "printed" || stage === "print_qc") return hasFrames ? "For Framing" : "Final Check";
  if (stage === "framed" || stage === "frame_qc" || stage === "final_check") return "Final Check";
  if (stage === "ready") return "Ready";
  if (stage === "delivered") return "Released";
  return titleize(stage);
}

function nextAction(stage: string, hasFrames: boolean) {
  if (stage === "for_print") return { next: "printed", label: "Mark printed", needsQuickCheck: false };
  if (stage === "printed" || stage === "print_qc") {
    return hasFrames
      ? { next: "framed", label: "Mark framed", needsQuickCheck: false }
      : { next: "ready", label: "Quick check & Ready", needsQuickCheck: true };
  }
  if (stage === "framed" || stage === "frame_qc" || stage === "final_check") {
    return { next: "ready", label: "Quick check & Ready", needsQuickCheck: true };
  }
  return null;
}

function Metric({ label, value, note, icon, accent = false, warning = false }: { label: string; value: number; note: string; icon: React.ReactNode; accent?: boolean; warning?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-4", accent ? "border-primary/30 bg-primary/[.04]" : warning ? "border-warning/30 bg-warning/5" : "border-border bg-card")}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-muted-foreground">{label}</p>
        <span className={cn(accent ? "text-primary" : warning ? "text-warning" : "text-muted-foreground")}>{icon}</span>
      </div>
      <p className="mt-2 font-display text-3xl font-extrabold tracking-[-.04em]">{value}</p>
      <p className="mt-1 text-[0.68rem] text-muted-foreground">{note}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="grid gap-1.5"><Label>{label}</Label>{children}</label>;
}