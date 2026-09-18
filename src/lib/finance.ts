import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";

export type ProductionCostRate = {
  id: string;
  print_size: string;
  framed: boolean;
  print_cost: number;
  frame_cost: number;
  packaging_cost: number;
  other_unit_cost: number;
  supplier: string | null;
  notes: string | null;
  active: boolean;
  updated_at: string;
};

export type ExpenseCategory =
  | "printing"
  | "framing"
  | "packaging"
  | "transport"
  | "labor"
  | "supplies"
  | "other";

export type StudioExpense = {
  id: string;
  event_id: string | null;
  expense_date: string;
  category: ExpenseCategory;
  supplier: string | null;
  description: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  notes: string | null;
  created_at: string;
};

export type FinanceData = {
  rates: ProductionCostRate[];
  expenses: StudioExpense[];
};

async function fetchFinance(eventId: string | null): Promise<FinanceData> {
  const ratesResult = await withTimeout(
    (supabase as any).from("production_cost_rates").select("*").eq("active", true).order("print_size"),
    12_000,
    "PhotoFlow could not load production cost settings in time.",
  );
  if (ratesResult.error) throw ratesResult.error;

  let expensesQuery = (supabase as any).from("studio_expenses").select("*").order("expense_date", { ascending: false }).order("created_at", { ascending: false });
  if (eventId) expensesQuery = expensesQuery.eq("event_id", eventId);
  else expensesQuery = expensesQuery.is("event_id", null);

  const expensesResult = await withTimeout(
    expensesQuery,
    12_000,
    "PhotoFlow could not load expenses in time.",
  );
  if (expensesResult.error) throw expensesResult.error;

  return {
    rates: (ratesResult.data ?? []) as ProductionCostRate[],
    expenses: (expensesResult.data ?? []) as StudioExpense[],
  };
}

export function useFinance(eventId: string | null) {
  return useQuery({
    queryKey: ["finance", eventId],
    queryFn: () => fetchFinance(eventId),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useFinanceActions(eventId: string | null) {
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["finance", eventId] });
  }, [eventId, queryClient]);

  const saveRate = useCallback(async (rate: {
    print_size: string;
    framed: boolean;
    print_cost: number;
    frame_cost: number;
    packaging_cost: number;
    other_unit_cost: number;
    supplier?: string | null;
    notes?: string | null;
  }) => {
    const result = await withTimeout(
      (supabase as any).from("production_cost_rates").upsert({
        ...rate,
        supplier: rate.supplier?.trim() || null,
        notes: rate.notes?.trim() || null,
        active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: "print_size,framed" }),
      12_000,
      "Saving production cost took too long.",
    );
    if (result.error) throw result.error;
    await refresh();
  }, [refresh]);

  const addExpense = useCallback(async (expense: {
    expense_date: string;
    category: ExpenseCategory;
    supplier?: string | null;
    description: string;
    quantity: number;
    unit_cost: number;
    notes?: string | null;
  }) => {
    if (!eventId) throw new Error("Choose an active event before recording an expense.");
    const result = await withTimeout(
      (supabase as any).from("studio_expenses").insert({
        event_id: eventId,
        expense_date: expense.expense_date,
        category: expense.category,
        supplier: expense.supplier?.trim() || null,
        description: expense.description.trim(),
        quantity: expense.quantity,
        unit_cost: expense.unit_cost,
        notes: expense.notes?.trim() || null,
      }),
      12_000,
      "Saving expense took too long.",
    );
    if (result.error) throw result.error;
    await refresh();
  }, [eventId, refresh]);

  const deleteExpense = useCallback(async (id: string) => {
    const result = await withTimeout(
      (supabase as any).from("studio_expenses").delete().eq("id", id),
      12_000,
      "Deleting expense took too long.",
    );
    if (result.error) throw result.error;
    await refresh();
  }, [refresh]);

  return { saveRate, addExpense, deleteExpense };
}

export function rateKey(printSize?: string | null, framed?: boolean) {
  return `${String(printSize ?? "").trim().toLowerCase()}::${framed ? "framed" : "print"}`;
}

export function expenseCategoryLabel(category: ExpenseCategory) {
  const labels: Record<ExpenseCategory, string> = {
    printing: "Printing",
    framing: "Framing",
    packaging: "Packaging",
    transport: "Transport",
    labor: "Labor",
    supplies: "Supplies",
    other: "Other",
  };
  return labels[category];
}