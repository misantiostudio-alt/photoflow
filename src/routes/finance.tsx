import { createFileRoute } from "@tanstack/react-router";
import { Calculator, Coins, PackageCheck, PhilippinePeso, Plus, ReceiptText, Save, Trash2, TrendingUp, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { AppShell } from "@/components/app-shell";
import { EmptyState, LoadingGrid, PageHeader, Panel } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useOps } from "@/lib/data";
import { expenseCategoryLabel, rateKey, useFinance, useFinanceActions, type ExpenseCategory } from "@/lib/finance";
import { peso } from "@/lib/domain";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/finance")({ component: FinancePage });

type Tab = "overview" | "expenses" | "costs";

type CostDraft = {
  print_size: string;
  framed: boolean;
  print_cost: string;
  frame_cost: string;
  packaging_cost: string;
  other_unit_cost: string;
  supplier: string;
};

const EXPENSE_CATEGORIES: ExpenseCategory[] = ["printing","framing","packaging","transport","labor","supplies","other"];

function toNumber(value: string | number | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function FinancePage() {
  const { data, isLoading: opsLoading } = useOps();
  const eventId = data?.event?.id ?? null;
  const finance = useFinance(eventId);
  const actions = useFinanceActions(eventId);
  const [tab, setTab] = useState<Tab>("overview");
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [costDrafts, setCostDrafts] = useState<Record<string, CostDraft>>({});
  const [expenseForm, setExpenseForm] = useState({
    expense_date: new Date().toLocaleDateString("en-CA"),
    category: "printing" as ExpenseCategory,
    supplier: "",
    description: "",
    quantity: "1",
    unit_cost: "",
    notes: "",
  });

  const activeOrders = useMemo(() => data?.orders.filter((order) => order.status !== "cancelled") ?? [], [data?.orders]);
  const activeOrderIds = useMemo(() => new Set(activeOrders.map((order) => order.id)), [activeOrders]);
  const activeItems = useMemo(() => data?.orderItems.filter((item) => activeOrderIds.has(item.order_id)) ?? [], [activeOrderIds, data?.orderItems]);

  const combinations = useMemo(() => {
    const map = new Map<string, { print_size: string; framed: boolean }>();
    for (const pkg of data?.packages ?? []) {
      if (!pkg.active || !pkg.print_size) continue;
      map.set(rateKey(pkg.print_size, pkg.framed), { print_size: pkg.print_size, framed: pkg.framed });
    }
    for (const item of activeItems) {
      if (!item.print_size) continue;
      map.set(rateKey(item.print_size, item.framed), { print_size: item.print_size, framed: item.framed });
    }
    return [...map.values()].sort((a, b) => a.print_size.localeCompare(b.print_size, undefined, { numeric: true }) || Number(a.framed) - Number(b.framed));
  }, [activeItems, data?.packages]);

  const rateMap = useMemo(() => new Map((finance.data?.rates ?? []).map((rate) => [rateKey(rate.print_size, rate.framed), rate])), [finance.data?.rates]);

  useEffect(() => {
    const next: Record<string, CostDraft> = {};
    for (const combo of combinations) {
      const key = rateKey(combo.print_size, combo.framed);
      const rate = rateMap.get(key);
      next[key] = {
        print_size: combo.print_size,
        framed: combo.framed,
        print_cost: String(rate?.print_cost ?? ""),
        frame_cost: String(rate?.frame_cost ?? ""),
        packaging_cost: String(rate?.packaging_cost ?? ""),
        other_unit_cost: String(rate?.other_unit_cost ?? ""),
        supplier: rate?.supplier ?? "",
      };
    }
    setCostDrafts(next);
  }, [combinations, rateMap]);

  const productionBreakdown = useMemo(() => {
    const rows = new Map<string, any>();
    for (const item of activeItems) {
      const printSize = item.print_size ?? "Other";
      const key = rateKey(printSize, item.framed);
      const rate = rateMap.get(key);
      const units = toNumber(item.quantity);
      const print = units * toNumber(rate?.print_cost);
      const frame = units * toNumber(rate?.frame_cost);
      const packaging = units * toNumber(rate?.packaging_cost);
      const other = units * toNumber(rate?.other_unit_cost);
      const existing = rows.get(key) ?? {
        key,
        print_size: printSize,
        framed: item.framed,
        units: 0,
        print: 0,
        frame: 0,
        packaging: 0,
        other: 0,
        total: 0,
        supplier: rate?.supplier ?? null,
        configured: Boolean(rate),
      };
      existing.units += units;
      existing.print += print;
      existing.frame += frame;
      existing.packaging += packaging;
      existing.other += other;
      existing.total += print + frame + packaging + other;
      rows.set(key, existing);
    }
    return [...rows.values()].sort((a, b) => a.print_size.localeCompare(b.print_size, undefined, { numeric: true }));
  }, [activeItems, rateMap]);

  const summary = useMemo(() => {
    const sales = activeOrders.reduce((sum, order) => sum + toNumber(order.total), 0);
    const collected = activeOrders.reduce((sum, order) => sum + toNumber(order.paid), 0);
    const receivable = Math.max(0, sales - collected);
    const estimatedProduction = productionBreakdown.reduce((sum, row) => sum + row.total, 0);
    const expenses = finance.data?.expenses ?? [];
    const recordedExpenses = expenses.reduce((sum, expense) => sum + toNumber(expense.total_cost), 0);
    const actualProductionSpend = expenses.filter((expense) => ["printing","framing","packaging"].includes(expense.category)).reduce((sum, expense) => sum + toNumber(expense.total_cost), 0);
    const otherExpenses = expenses.filter((expense) => !["printing","framing","packaging"].includes(expense.category)).reduce((sum, expense) => sum + toNumber(expense.total_cost), 0);
    const projectedProfit = sales - estimatedProduction - otherExpenses;
    return {
      sales,
      collected,
      receivable,
      estimatedProduction,
      recordedExpenses,
      actualProductionSpend,
      otherExpenses,
      projectedProfit,
      projectedMargin: sales > 0 ? (projectedProfit / sales) * 100 : 0,
      cashAfterExpenses: collected - recordedExpenses,
      missingRates: productionBreakdown.filter((row) => !row.configured).length,
    };
  }, [activeOrders, finance.data?.expenses, productionBreakdown]);

  async function saveCost(draft: CostDraft) {
    const key = rateKey(draft.print_size, draft.framed);
    setBusyKey(key);
    try {
      await actions.saveRate({
        print_size: draft.print_size,
        framed: draft.framed,
        print_cost: Math.max(0, toNumber(draft.print_cost)),
        frame_cost: draft.framed ? Math.max(0, toNumber(draft.frame_cost)) : 0,
        packaging_cost: Math.max(0, toNumber(draft.packaging_cost)),
        other_unit_cost: Math.max(0, toNumber(draft.other_unit_cost)),
        supplier: draft.supplier,
      });
      toast.success(draft.print_size + " " + (draft.framed ? "framed" : "print") + " cost saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save cost setting.");
    } finally {
      setBusyKey(null);
    }
  }

  async function addExpense() {
    if (!expenseForm.description.trim()) return toast.error("Add an expense description.");
    const quantity = toNumber(expenseForm.quantity);
    const unitCost = toNumber(expenseForm.unit_cost);
    if (quantity <= 0) return toast.error("Quantity must be greater than zero.");
    if (unitCost < 0) return toast.error("Unit cost cannot be negative.");
    setBusyKey("expense");
    try {
      await actions.addExpense({
        expense_date: expenseForm.expense_date,
        category: expenseForm.category,
        supplier: expenseForm.supplier,
        description: expenseForm.description,
        quantity,
        unit_cost: unitCost,
        notes: expenseForm.notes,
      });
      setExpenseForm((current) => ({ ...current, supplier: "", description: "", quantity: "1", unit_cost: "", notes: "" }));
      toast.success("Expense recorded");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save expense.");
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteExpense(id: string) {
    if (!confirm("Delete this expense record?")) return;
    setBusyKey(id);
    try {
      await actions.deleteExpense(id);
      toast.success("Expense deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete expense.");
    } finally {
      setBusyKey(null);
    }
  }

  if (opsLoading || finance.isLoading) {
    return <AppShell><PageHeader eyebrow="Studio finance" title="Finance" /><LoadingGrid rows={6} /></AppShell>;
  }

  if (!data?.event) {
    return <AppShell><EmptyState title="No active event" description="Choose an event first so PhotoFlow can calculate its sales, costs and profit." /></AppShell>;
  }

  if (finance.error) {
    return <AppShell><PageHeader eyebrow="Studio finance" title="Finance" /><EmptyState title="Finance data is not available yet" description={finance.error instanceof Error ? finance.error.message : "The accounting tables could not be loaded."} /></AppShell>;
  }

  const tabs = [
    { key: "overview" as Tab, label: "Overview", icon: TrendingUp },
    { key: "expenses" as Tab, label: "Expenses", icon: ReceiptText },
    { key: "costs" as Tab, label: "Cost Settings", icon: Calculator },
  ];

  return (
    <AppShell>
      <PageHeader eyebrow={data.event.name} title="Finance" description="Track sales, production costs, studio expenses and projected profit for this event." />

      <div className="mb-5 flex flex-wrap gap-2 rounded-lg border border-border bg-card/55 p-1.5">
        {tabs.map((item) => (
          <button key={item.key} type="button" onClick={() => setTab(item.key)} className={cn("inline-flex h-9 items-center gap-2 rounded-md px-3 text-xs font-semibold transition-colors", tab === item.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground")}>
            <item.icon className="size-3.5" /> {item.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <div className="grid gap-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard icon={PhilippinePeso} label="Sales" value={peso(summary.sales)} note={String(activeOrders.length) + " active order" + (activeOrders.length === 1 ? "" : "s")} />
            <MetricCard icon={WalletCards} label="Collected" value={peso(summary.collected)} note="Verified payments received" />
            <MetricCard icon={ReceiptText} label="Receivable" value={peso(summary.receivable)} note="Still to collect" />
            <MetricCard icon={PackageCheck} label="Estimated production cost" value={peso(summary.estimatedProduction)} note={summary.missingRates ? String(summary.missingRates) + " cost setting" + (summary.missingRates === 1 ? "" : "s") + " missing" : "Based on current supplier rates"} warning={summary.missingRates > 0} />
            <MetricCard icon={Coins} label="Recorded expenses" value={peso(summary.recordedExpenses)} note={"Production spend " + peso(summary.actualProductionSpend)} />
            <MetricCard icon={TrendingUp} label="Projected profit" value={peso(summary.projectedProfit)} note={summary.projectedMargin.toFixed(1) + "% projected margin"} accent />
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
            <Panel title="Production cost estimate" description="Expected print, frame and packaging cost based on your current orders." actions={summary.missingRates ? <Button size="sm" variant="outline" onClick={() => setTab("costs")}>Complete costs</Button> : null}>
              {productionBreakdown.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] text-left text-xs">
                    <thead className="text-muted-foreground"><tr className="border-b border-border"><th className="px-2 py-2">Size</th><th className="px-2 py-2">Type</th><th className="px-2 py-2 text-right">Units</th><th className="px-2 py-2 text-right">Print</th><th className="px-2 py-2 text-right">Frame</th><th className="px-2 py-2 text-right">Packaging</th><th className="px-2 py-2 text-right">Estimated</th></tr></thead>
                    <tbody>
                      {productionBreakdown.map((row) => (
                        <tr key={row.key} className="border-b border-border/70 last:border-0">
                          <td className="px-2 py-3 font-semibold">{row.print_size}</td>
                          <td className="px-2 py-3">{row.framed ? "With frame" : "Print only"}</td>
                          <td className="px-2 py-3 text-right">{row.units}</td>
                          <td className="px-2 py-3 text-right">{peso(row.print)}</td>
                          <td className="px-2 py-3 text-right">{peso(row.frame)}</td>
                          <td className="px-2 py-3 text-right">{peso(row.packaging)}</td>
                          <td className="px-2 py-3 text-right font-semibold">{row.configured ? peso(row.total) : <span className="text-warning">Set cost</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <EmptyState title="No production cost yet" description="Production requirements will appear here as soon as the event has active orders." />}
            </Panel>

            <Panel title="Profit view" description="Projected profit and actual cash are kept separate so costs are not double-counted.">
              <div className="grid gap-3">
                <FinanceLine label="Sales" value={summary.sales} />
                <FinanceLine label="Estimated production" value={-summary.estimatedProduction} />
                <FinanceLine label="Other event expenses" value={-summary.otherExpenses} />
                <div className="border-t border-border pt-3"><FinanceLine label="Projected profit" value={summary.projectedProfit} strong /></div>
                <div className="mt-2 rounded-lg border border-border bg-muted/10 p-3">
                  <p className="text-[0.65rem] font-bold uppercase tracking-[.12em] text-muted-foreground">Cash after recorded expenses</p>
                  <p className="mt-1 font-display text-2xl font-extrabold">{peso(summary.cashAfterExpenses)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Collected {peso(summary.collected)} − actual expenses {peso(summary.recordedExpenses)}</p>
                </div>
              </div>
            </Panel>
          </div>

          <Panel title="Recent expenses" description="Latest actual expenses recorded for this event." actions={<Button size="sm" variant="outline" onClick={() => setTab("expenses")}><Plus className="size-3.5" /> Record expense</Button>}>
            {(finance.data?.expenses ?? []).length ? (
              <div className="grid gap-2">
                {(finance.data?.expenses ?? []).slice(0, 6).map((expense) => (
                  <div key={expense.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/10 p-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary/10 text-primary"><ReceiptText className="size-4" /></span>
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{expense.description}</p><p className="mt-0.5 truncate text-xs text-muted-foreground">{expenseCategoryLabel(expense.category)}{expense.supplier ? " · " + expense.supplier : ""} · {expense.expense_date}</p></div>
                    <p className="shrink-0 font-semibold">{peso(expense.total_cost)}</p>
                  </div>
                ))}
              </div>
            ) : <EmptyState title="No expenses recorded yet" description="Printing, framing, transport and other actual costs can be recorded here." />}
          </Panel>
        </div>
      ) : null}

      {tab === "expenses" ? (
        <div className="grid gap-5 xl:grid-cols-[420px_1fr]">
          <Panel title="Record expense" description="Use this for actual amounts you paid to suppliers or for event-related costs.">
            <div className="grid gap-4">
              <label className="grid gap-1.5"><Label>Date</Label><Input type="date" value={expenseForm.expense_date} onChange={(event) => setExpenseForm({ ...expenseForm, expense_date: event.target.value })} /></label>
              <label className="grid gap-1.5"><Label>Category</Label><select className="h-9 rounded-md border border-input bg-card/45 px-3 text-sm" value={expenseForm.category} onChange={(event) => setExpenseForm({ ...expenseForm, category: event.target.value as ExpenseCategory })}>{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{expenseCategoryLabel(category)}</option>)}</select></label>
              <label className="grid gap-1.5"><Label>Supplier / payee <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={expenseForm.supplier} onChange={(event) => setExpenseForm({ ...expenseForm, supplier: event.target.value })} placeholder="e.g. Frame supplier, print lab" /></label>
              <label className="grid gap-1.5"><Label>Description</Label><Input value={expenseForm.description} onChange={(event) => setExpenseForm({ ...expenseForm, description: event.target.value })} placeholder="e.g. 12 pcs 8R frames" /></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5"><Label>Quantity</Label><Input type="number" min="0.01" step="0.01" value={expenseForm.quantity} onChange={(event) => setExpenseForm({ ...expenseForm, quantity: event.target.value })} /></label>
                <label className="grid gap-1.5"><Label>Unit cost</Label><Input type="number" min="0" step="0.01" value={expenseForm.unit_cost} onChange={(event) => setExpenseForm({ ...expenseForm, unit_cost: event.target.value })} placeholder="₱0.00" /></label>
              </div>
              <div className="rounded-lg border border-primary/20 bg-primary/[.035] p-3"><p className="text-xs text-muted-foreground">Total expense</p><p className="mt-1 font-display text-2xl font-extrabold">{peso(toNumber(expenseForm.quantity) * toNumber(expenseForm.unit_cost))}</p></div>
              <label className="grid gap-1.5"><Label>Notes <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={expenseForm.notes} onChange={(event) => setExpenseForm({ ...expenseForm, notes: event.target.value })} /></label>
              <Button size="lg" onClick={() => void addExpense()} disabled={busyKey === "expense"}><Plus className="size-4" /> {busyKey === "expense" ? "Saving…" : "Record expense"}</Button>
            </div>
          </Panel>

          <Panel title="Expense ledger" description={String((finance.data?.expenses ?? []).length) + " recorded expense" + ((finance.data?.expenses ?? []).length === 1 ? "" : "s") + " · " + peso(summary.recordedExpenses) + " total"}>
            {(finance.data?.expenses ?? []).length ? (
              <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="text-muted-foreground"><tr className="border-b border-border"><th className="px-2 py-2">Date</th><th className="px-2 py-2">Category</th><th className="px-2 py-2">Description</th><th className="px-2 py-2">Supplier</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2 text-right">Unit</th><th className="px-2 py-2 text-right">Total</th><th className="w-10 px-2 py-2" /></tr></thead><tbody>
                {(finance.data?.expenses ?? []).map((expense) => (
                  <tr key={expense.id} className="border-b border-border/70 last:border-0"><td className="px-2 py-3">{expense.expense_date}</td><td className="px-2 py-3">{expenseCategoryLabel(expense.category)}</td><td className="px-2 py-3 font-semibold">{expense.description}</td><td className="px-2 py-3 text-muted-foreground">{expense.supplier ?? "—"}</td><td className="px-2 py-3 text-right">{expense.quantity}</td><td className="px-2 py-3 text-right">{peso(expense.unit_cost)}</td><td className="px-2 py-3 text-right font-semibold">{peso(expense.total_cost)}</td><td className="px-2 py-3 text-right"><Button size="icon" variant="ghost" disabled={busyKey === expense.id} onClick={() => void deleteExpense(expense.id)}><Trash2 className="size-3.5" /></Button></td></tr>
                ))}
              </tbody></table></div>
            ) : <EmptyState title="No expenses yet" description="Use the form to record your first actual production or event expense." />}
          </Panel>
        </div>
      ) : null}

      {tab === "costs" ? (
        <div className="grid gap-5">
          <Panel title="How costing works" description="Studio-wide supplier costs are reused automatically when PhotoFlow estimates production cost.">
            <div className="grid gap-3 sm:grid-cols-3"><CostHint title="Print cost" text="What your print lab charges per physical print." /><CostHint title="Frame cost" text="Frame supplier cost per framed item." /><CostHint title="Packaging / other" text="Envelope, plastic, backing or other repeatable cost per unit." /></div>
          </Panel>

          {combinations.length ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {combinations.map((combo) => {
                const key = rateKey(combo.print_size, combo.framed);
                const draft = costDrafts[key];
                if (!draft) return null;
                const total = toNumber(draft.print_cost) + toNumber(draft.frame_cost) + toNumber(draft.packaging_cost) + toNumber(draft.other_unit_cost);
                return (
                  <Panel key={key} title={combo.print_size + " · " + (combo.framed ? "With frame" : "Print only")} description={rateMap.has(key) ? "Configured · " + (draft.supplier || "No supplier set") : "Cost not configured yet"} actions={<span className="font-display text-lg font-extrabold">{peso(total)}<span className="ml-1 text-[0.6rem] font-normal text-muted-foreground">/ unit</span></span>}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="grid gap-1.5"><Label>Print cost</Label><Input type="number" min="0" step="0.01" value={draft.print_cost} onChange={(event) => setCostDrafts({ ...costDrafts, [key]: { ...draft, print_cost: event.target.value } })} placeholder="₱0.00" /></label>
                      <label className="grid gap-1.5"><Label>Frame cost</Label><Input type="number" min="0" step="0.01" disabled={!combo.framed} value={draft.frame_cost} onChange={(event) => setCostDrafts({ ...costDrafts, [key]: { ...draft, frame_cost: event.target.value } })} placeholder={combo.framed ? "₱0.00" : "Not framed"} /></label>
                      <label className="grid gap-1.5"><Label>Packaging</Label><Input type="number" min="0" step="0.01" value={draft.packaging_cost} onChange={(event) => setCostDrafts({ ...costDrafts, [key]: { ...draft, packaging_cost: event.target.value } })} placeholder="₱0.00" /></label>
                      <label className="grid gap-1.5"><Label>Other/unit</Label><Input type="number" min="0" step="0.01" value={draft.other_unit_cost} onChange={(event) => setCostDrafts({ ...costDrafts, [key]: { ...draft, other_unit_cost: event.target.value } })} placeholder="₱0.00" /></label>
                    </div>
                    <label className="mt-3 grid gap-1.5"><Label>Preferred supplier <span className="font-normal text-muted-foreground">(optional)</span></Label><Input value={draft.supplier} onChange={(event) => setCostDrafts({ ...costDrafts, [key]: { ...draft, supplier: event.target.value } })} placeholder="e.g. ABC Printing / Frame Shop" /></label>
                    <Button className="mt-4" variant={rateMap.has(key) ? "outline" : "default"} onClick={() => void saveCost(draft)} disabled={busyKey === key}><Save className="size-4" /> {busyKey === key ? "Saving…" : "Save cost"}</Button>
                  </Panel>
                );
              })}
            </div>
          ) : <EmptyState title="No package sizes yet" description="Create your photo packages first. Their print sizes will automatically appear here for costing." />}
        </div>
      ) : null}
    </AppShell>
  );
}

function MetricCard({ icon: Icon, label, value, note, accent = false, warning = false }: any) {
  return <div className={cn("rounded-lg border p-4", accent ? "border-primary/30 bg-primary/[.045]" : warning ? "border-warning/30 bg-warning/5" : "border-border bg-card/72")}><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-muted-foreground">{label}</p><Icon className={cn("size-4", accent ? "text-primary" : warning ? "text-warning" : "text-muted-foreground")} /></div><p className="mt-3 font-display text-2xl font-extrabold tracking-[-.04em]">{value}</p><p className={cn("mt-1 text-[0.68rem]", warning ? "text-warning" : "text-muted-foreground")}>{note}</p></div>;
}

function FinanceLine({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return <div className="flex items-center justify-between gap-4"><p className={cn("text-sm", strong ? "font-bold text-foreground" : "text-muted-foreground")}>{label}</p><p className={cn("font-mono text-sm", strong && "font-bold text-primary")}>{value < 0 ? "−" + peso(Math.abs(value)) : peso(value)}</p></div>;
}

function CostHint({ title, text }: { title: string; text: string }) {
  return <div className="rounded-lg border border-border bg-muted/10 p-3"><p className="text-sm font-semibold">{title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{text}</p></div>;
}