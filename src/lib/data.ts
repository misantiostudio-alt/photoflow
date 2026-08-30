import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";

export type EventRow = {
  id: string;
  name: string;
  slug: string;
  event_type: string;
  event_date: string | null;
  venue: string | null;
  description: string | null;
  status: string;
  id_prefix: string;
  ordering_deadline: string | null;
  delivery_date: string | null;
  payment_instructions: string | null;
};

export type PackageRow = {
  id: string;
  event_id: string;
  name: string;
  price: number;
  print_size: string;
  quantity: number;
  framed: boolean;
  digital_copy: boolean;
  description: string | null;
  sort_order: number;
  active: boolean;
};

export type ParticipantRow = {
  id: string;
  event_id: string;
  participant_code: string;
  full_name: string;
  organization: string | null;
  batch: string | null;
  contact_number: string | null;
  email: string | null;
  notes: string | null;
  thumbnail_url: string | null;
  shooting_status: string;
  gallery_status: string;
};

export type PhotoRow = {
  id: string;
  event_id: string;
  participant_id: string | null;
  url: string;
  file_name: string | null;
  is_separator: boolean;
  favorite: boolean;
  sort_order: number;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  label: string;
  print_size: string | null;
  quantity: number;
  framed: boolean;
  unit_price: number;
  kind: string;
};

export type PaymentRow = {
  id: string;
  order_id: string;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  proof_url: string | null;
  notes: string | null;
  paid_at: string;
};

export type ProductionCheckRow = {
  id: string;
  order_id: string;
  stage: string;
  completed: boolean;
  checked_by: string | null;
  notes: string | null;
  completed_at: string | null;
};

export type OrderRow = {
  id: string;
  event_id: string;
  participant_id: string;
  order_number: string;
  package_id: string | null;
  photo_id: string | null;
  total: number;
  paid: number;
  payment_method: string | null;
  payment_status: string;
  status: string;
  production_status: string;
  notes: string | null;
  delivered_at: string | null;
  created_at: string;
};

export type OpsData = {
  event: EventRow | null;
  events: EventRow[];
  packages: PackageRow[];
  participants: ParticipantRow[];
  photos: PhotoRow[];
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  payments: PaymentRow[];
  checks: ProductionCheckRow[];
};

async function fetchOps(): Promise<OpsData> {
  const [events, packages, participants, photos, orders, orderItems, payments, checks] =
    await Promise.all([
      supabase.from("events").select("*").order("event_date", { ascending: false }),
      supabase.from("packages").select("*").order("sort_order"),
      supabase.from("participants").select("*").order("participant_code"),
      supabase.from("photos").select("*").order("sort_order"),
      supabase.from("orders").select("*").order("order_number"),
      supabase.from("order_items").select("*"),
      supabase.from("payments").select("*").order("paid_at", { ascending: false }),
      supabase.from("production_checks").select("*"),
    ]);

  return {
    events: (events.data ?? []) as EventRow[],
    event: ((events.data ?? [])[0] ?? null) as EventRow | null,
    packages: (packages.data ?? []) as PackageRow[],
    participants: (participants.data ?? []) as ParticipantRow[],
    photos: (photos.data ?? []) as PhotoRow[],
    orders: (orders.data ?? []) as OrderRow[],
    orderItems: (orderItems.data ?? []) as OrderItemRow[],
    payments: (payments.data ?? []) as PaymentRow[],
    checks: (checks.data ?? []) as ProductionCheckRow[],
  };
}

export function useOps() {
  return useQuery({ queryKey: ["ops"], queryFn: fetchOps, staleTime: 15_000 });
}

export function useOpsMutation<TVars>(
  fn: (vars: TVars) => Promise<unknown>,
  successMessage?: string,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops"] });
      if (successMessage) toast.success(successMessage);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error(
        message.includes("row-level security")
          ? "Sign in as staff to save this change."
          : message,
      );
    },
  });
}

export function useSession() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return email;
}

/* ---------- derived helpers ---------- */

export function orderBalance(order: OrderRow) {
  return Math.max(0, Number(order.total) - Number(order.paid));
}

export function participantPhotos(data: OpsData, participantId: string) {
  return data.photos.filter((p) => p.participant_id === participantId);
}

export function participantOrder(data: OpsData, participantId: string) {
  return data.orders.find((o) => o.participant_id === participantId);
}

export function findParticipant(data: OpsData, id?: string | null) {
  return data.participants.find((p) => p.id === id);
}

export function findPhoto(data: OpsData, id?: string | null) {
  return data.photos.find((p) => p.id === id);
}

export function findPackage(data: OpsData, id?: string | null) {
  return data.packages.find((p) => p.id === id);
}

