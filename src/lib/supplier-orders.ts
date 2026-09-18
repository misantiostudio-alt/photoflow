import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";

export type SupplierOrderItem = {
  id: string;
  supplier_order_id: string;
  item_type: "print" | "frame";
  print_size: string;
  frame_color: string;
  quantity: number;
  unit_cost: number;
  line_total: number;
};

export type SupplierOrder = {
  id: string;
  event_id: string;
  po_number: string;
  supplier_name: string;
  supplier_contact: string | null;
  status: "draft" | "ordered" | "received" | "cancelled";
  expected_date: string | null;
  notes: string | null;
  shipping_cost: number;
  subtotal: number;
  total: number;
  ordered_at: string | null;
  received_at: string | null;
  created_at: string;
  items: SupplierOrderItem[];
};

async function fetchSupplierOrders(eventId: string | null): Promise<SupplierOrder[]> {
  if (!eventId) return [];

  const orders = await withTimeout(
    (supabase as any)
      .from("supplier_orders")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: false }),
    12_000,
    "Supplier orders could not be loaded in time.",
  );
  if (orders.error) throw orders.error;

  const ids = (orders.data ?? []).map((row: any) => row.id);
  if (!ids.length) return [];

  const items = await withTimeout(
    (supabase as any)
      .from("supplier_order_items")
      .select("*")
      .in("supplier_order_id", ids)
      .order("created_at"),
    12_000,
    "Supplier order items could not be loaded in time.",
  );
  if (items.error) throw items.error;

  const byOrder = new Map<string, SupplierOrderItem[]>();
  for (const item of items.data ?? []) {
    const list = byOrder.get(item.supplier_order_id) ?? [];
    list.push({
      ...item,
      quantity: Number(item.quantity ?? 0),
      unit_cost: Number(item.unit_cost ?? 0),
      line_total: Number(item.line_total ?? 0),
    });
    byOrder.set(item.supplier_order_id, list);
  }

  return (orders.data ?? []).map((row: any) => ({
    ...row,
    shipping_cost: Number(row.shipping_cost ?? 0),
    subtotal: Number(row.subtotal ?? 0),
    total: Number(row.total ?? 0),
    items: byOrder.get(row.id) ?? [],
  }));
}

export function useSupplierOrders(eventId: string | null) {
  return useQuery({
    queryKey: ["supplier-orders", eventId],
    queryFn: () => fetchSupplierOrders(eventId),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useSupplierOrderActions(eventId: string | null) {
  const client = useQueryClient();

  const refresh = useCallback(async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["supplier-orders", eventId] }),
      client.invalidateQueries({ queryKey: ["production-procurement", eventId] }),
      client.invalidateQueries({ queryKey: ["finance", eventId] }),
    ]);
  }, [client, eventId]);

  const createDraft = useCallback(async (input: {
    supplier_name: string;
    supplier_contact?: string | null;
    expected_date?: string | null;
    shipping_cost?: number;
    notes?: string | null;
    items: Array<{
      item_type: "print" | "frame";
      print_size: string;
      frame_color?: string | null;
      quantity: number;
      unit_cost: number;
    }>;
  }) => {
    if (!eventId) throw new Error("No active event.");

    const result = await withTimeout(
      (supabase as any).rpc("create_supplier_order_v1", {
        _event_id: eventId,
        _supplier_name: input.supplier_name,
        _supplier_contact: input.supplier_contact || null,
        _expected_date: input.expected_date || null,
        _shipping_cost: Math.max(0, Number(input.shipping_cost || 0)),
        _notes: input.notes || null,
        _items: input.items,
      }),
      15_000,
      "Creating the supplier order took too long.",
    );
    if (result.error) throw result.error;
    await refresh();
    return String(result.data);
  }, [eventId, refresh]);

  const setStatus = useCallback(async (id: string, status: "ordered" | "received" | "cancelled") => {
    const result = await withTimeout(
      (supabase as any).rpc("set_supplier_order_status_v1", {
        _supplier_order_id: id,
        _status: status,
      }),
      15_000,
      "Supplier order update took too long.",
    );
    if (result.error) throw result.error;
    await refresh();
  }, [refresh]);

  return { createDraft, setStatus };
}