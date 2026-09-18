import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { withTimeout } from "@/lib/async";

const ACTIVE_EVENT_KEY = "photoflow.activeEventId";
const ACTIVE_EVENT_EVENT = "photoflow:active-event";

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
  share_token: string;
};

export type EventGroupRow = {
  id: string;
  share_token: string;
  event_id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

export type PackageProductType = "group_package" | "solo_addon";
export type PhotoType = "solo" | "group";

export type PackageRow = {
  id: string;
  event_id: string;
  name: string;
  code: string | null;
  product_type: PackageProductType;
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
  event_group_id: string | null;
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
  storage_path: string | null;
  event_id: string;
  event_group_id: string | null;
  participant_id: string | null;
  url: string;
  file_name: string | null;
  is_separator: boolean;
  favorite: boolean;
  sort_order: number;
  photo_type: PhotoType;
  group_name: string | null;
};

export type OrderItemRow = {
  id: string;
  order_id: string;
  label: string;
  print_size: string | null;
  quantity: number;
  framed: boolean;
  unit_price: number;
  photo_id: string | null;
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
  checklist: Record<string, boolean>;
  notes: string | null;
  completed_at: string | null;
};

export type OrderRow = {
  id: string;
  event_id: string;
  participant_id: string;
  order_number: string;
  public_token: string;
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
  eventGroups: EventGroupRow[];
  packages: PackageRow[];
  participants: ParticipantRow[];
  photos: PhotoRow[];
  orders: OrderRow[];
  orderItems: OrderItemRow[];
  payments: PaymentRow[];
  checks: ProductionCheckRow[];
};

const EMPTY_OPS_DATA: OpsData = {
  event: null,
  events: [],
  eventGroups: [],
  packages: [],
  participants: [],
  photos: [],
  orders: [],
  orderItems: [],
  payments: [],
  checks: [],
};

function readStoredActiveEventId() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_EVENT_KEY);
}

export function setActiveEventId(id: string | null) {
  if (typeof window === "undefined") return;
  if (id) window.localStorage.setItem(ACTIVE_EVENT_KEY, id);
  else window.localStorage.removeItem(ACTIVE_EVENT_KEY);
  window.dispatchEvent(new CustomEvent(ACTIVE_EVENT_EVENT, { detail: id }));
}

export function useActiveEventId() {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    setId(readStoredActiveEventId());
    const sync = () => setId(readStoredActiveEventId());
    window.addEventListener("storage", sync);
    window.addEventListener(ACTIVE_EVENT_EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(ACTIVE_EVENT_EVENT, sync);
    };
  }, []);
  return id;
}

function throwIfError(error: { message: string } | null) {
  if (error) throw new Error(error.message);
}

async function fetchOps(activeEventId: string | null): Promise<OpsData> {
  const eventsResult = await withTimeout(
    supabase.from("events").select("*").order("event_date", { ascending: false }),
    12_000,
    "PhotoFlow could not load events in time.",
  );
  throwIfError(eventsResult.error);
  const events = (eventsResult.data ?? []) as EventRow[];
  const operationalEvents = events.filter((item) => item.status !== "demo" && item.status !== "archived");
  const event = operationalEvents.find((item) => item.id === activeEventId) ?? operationalEvents.find((item) => item.status === "active") ?? operationalEvents[0] ?? null;

  if (!event) {
    return { events, event: null, eventGroups: [], packages: [], participants: [], photos: [], orders: [], orderItems: [], payments: [], checks: [] };
  }

  const [groupsResult, packagesResult, participantsResult, photosResult, ordersResult] = await withTimeout(
    Promise.all([
      (supabase as any).from("event_groups").select("*").eq("event_id", event.id).eq("active", true).order("sort_order").order("name"),
      supabase.from("packages").select("*").eq("event_id", event.id).order("sort_order"),
      supabase.from("participants").select("*").eq("event_id", event.id).order("participant_code"),
      supabase.from("photos").select("*").eq("event_id", event.id).order("sort_order"),
      supabase.from("orders").select("*").eq("event_id", event.id).order("order_number"),
    ]),
    12_000,
    "PhotoFlow could not load the current event workspace in time.",
  );
  throwIfError(groupsResult.error);
  throwIfError(packagesResult.error);
  throwIfError(participantsResult.error);
  throwIfError(photosResult.error);
  throwIfError(ordersResult.error);

  const orders = (ordersResult.data ?? []) as unknown as OrderRow[];
  const orderIds = new Set(orders.map((order) => order.id));
  const [orderItemsResult, paymentsResult, checksResult] = await withTimeout(
    Promise.all([
      supabase.from("order_items").select("*"),
      supabase.from("payments").select("*").order("paid_at", { ascending: false }),
      supabase.from("production_checks").select("*"),
    ]),
    12_000,
    "PhotoFlow could not load orders and production status in time.",
  );
  throwIfError(orderItemsResult.error);
  throwIfError(paymentsResult.error);
  throwIfError(checksResult.error);

  return {
    events,
    event,
    eventGroups: (groupsResult.data ?? []) as EventGroupRow[],
    packages: (packagesResult.data ?? []) as unknown as PackageRow[],
    participants: (participantsResult.data ?? []) as unknown as ParticipantRow[],
    photos: (photosResult.data ?? []) as unknown as PhotoRow[],
    orders,
    orderItems: ((orderItemsResult.data ?? []) as unknown as OrderItemRow[]).filter((item) => orderIds.has(item.order_id)),
    payments: ((paymentsResult.data ?? []) as PaymentRow[]).filter((item) => orderIds.has(item.order_id)),
    checks: ((checksResult.data ?? []) as ProductionCheckRow[]).filter((item) => orderIds.has(item.order_id)),
  };
}

export function useOps() {
  const activeEventId = useActiveEventId();
  const query = useQuery({
    queryKey: ["ops", activeEventId],
    queryFn: () => fetchOps(activeEventId),
    staleTime: 15_000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!query.error) return;
    const message = query.error instanceof Error ? query.error.message : "PhotoFlow could not load this workspace.";
    toast.error(message, { id: "photoflow-workspace-load-error" });
  }, [query.error]);

  return {
    ...query,
    data: query.data ?? (query.isError ? EMPTY_OPS_DATA : undefined),
  };
}

export function useOpsMutation<TVars>(fn: (vars: TVars) => Promise<unknown>, successMessage?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ops"] });
      if (successMessage) toast.success(successMessage);
    },
    onError: (error: unknown) => {
      const message = error instanceof Error ? error.message : "Something went wrong";
      toast.error(message.includes("row-level security") || message.includes("policy") ? "Sign in as authorized staff to save this change." : message);
    },
  });
}

export function useSession() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    const syncSession = async (session: any) => {
      setEmail(session?.user?.email ?? null);
      if (session?.user) {
        const db = supabase as any;
        try {
          await withTimeout(db.rpc("ensure_first_owner"), 5_000, "Staff session check timed out.");
        } catch {
          // The staff role is also enforced by RLS; don't trap the UI if bootstrap repair is unavailable.
        }
      }
    };

    supabase.auth.getSession().then(({ data }) => void syncSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      void syncSession(session);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return email;
}

export function orderBalance(order: OrderRow) {
  return Math.max(0, Number(order.total) - Number(order.paid));
}

export function participantPhotos(data: OpsData, participantId: string) {
  return data.photos.filter((p) => p.participant_id === participantId && p.photo_type === "solo");
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

export function groupPhotoFor(data: OpsData, groupName?: string | null) {
  const target = groupName?.trim().toLowerCase();
  if (!target) return undefined;
  return data.photos.find((photo) => photo.photo_type === "group" && photo.group_name?.trim().toLowerCase() === target);
}
