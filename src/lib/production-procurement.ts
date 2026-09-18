import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";

export type ProcurementRow = {
  id: string;
  event_id: string;
  item_type: "print" | "frame";
  print_size: string;
  frame_color: string | null;
  ordered_qty: number;
  received_qty: number;
  supplier: string | null;
  notes: string | null;
  ordered_at: string | null;
  received_at: string | null;
  updated_at: string;
};

export function procurementKey(itemType: "print" | "frame", printSize: string, frameColor?: string | null) {
  return `${itemType}::${printSize.trim().toLowerCase()}::${(frameColor ?? "").trim().toLowerCase()}`;
}

async function fetchProcurement(eventId: string | null): Promise<ProcurementRow[]> {
  if (!eventId) return [];
  const result = await withTimeout(
    (supabase as any)
      .from("production_procurement")
      .select("*")
      .eq("event_id", eventId)
      .order("item_type")
      .order("print_size"),
    12_000,
    "PhotoFlow could not load supplier tracking in time.",
  );
  if (result.error) throw result.error;
  return (result.data ?? []) as ProcurementRow[];
}

export function useProductionProcurement(eventId: string | null) {
  return useQuery({
    queryKey: ["production-procurement", eventId],
    queryFn: () => fetchProcurement(eventId),
    staleTime: 10_000,
    retry: 1,
  });
}

export function useProductionProcurementActions(eventId: string | null) {
  const queryClient = useQueryClient();

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["production-procurement", eventId] });
  }, [eventId, queryClient]);

  const save = useCallback(async (input: {
    item_type: "print" | "frame";
    print_size: string;
    frame_color?: string | null;
    ordered_qty: number;
    received_qty: number;
    supplier?: string | null;
    notes?: string | null;
  }) => {
    if (!eventId) throw new Error("No active event.");
    const now = new Date().toISOString();
    const result = await withTimeout(
      (supabase as any).from("production_procurement").upsert({
        event_id: eventId,
        item_type: input.item_type,
        print_size: input.print_size,
        frame_color: input.item_type === "frame" ? (input.frame_color || "black") : "",
        ordered_qty: Math.max(0, Math.round(input.ordered_qty)),
        received_qty: Math.max(0, Math.round(input.received_qty)),
        supplier: input.supplier?.trim() || null,
        notes: input.notes?.trim() || null,
        ordered_at: input.ordered_qty > 0 ? now : null,
        received_at: input.received_qty > 0 ? now : null,
        updated_at: now,
      }, {
        onConflict: "event_id,item_type,print_size,frame_color",
      }),
      12_000,
      "Supplier status save took too long.",
    );
    if (result.error) throw result.error;
    await refresh();
  }, [eventId, refresh]);

  return { save };
}