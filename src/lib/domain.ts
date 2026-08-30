export const PRODUCTION_STAGES = [
  { key: "for_print", label: "For Print" },
  { key: "printed", label: "Printed" },
  { key: "print_qc", label: "Print QC" },
  { key: "framed", label: "Framed" },
  { key: "frame_qc", label: "Frame QC" },
  { key: "final_check", label: "Final Check" },
  { key: "ready", label: "Ready for Delivery" },
  { key: "delivered", label: "Delivered" },
] as const;

export type ProductionStage = (typeof PRODUCTION_STAGES)[number]["key"];

export const PRINT_QC_CHECKLIST = [
  "Correct participant",
  "Correct selected image",
  "Correct size",
  "Correct quantity",
  "Correct crop",
  "No visible print defects",
  "Correct orientation",
];

export const FRAME_QC_CHECKLIST = [
  "Correct frame size",
  "Glass / acrylic clean",
  "Photo aligned",
  "Frame undamaged",
  "Backing secure",
];

export const FINAL_QC_CHECKLIST = [
  "Correct order",
  "Complete package",
  "Payment status checked",
  "Packaging complete",
];

export const ORDER_STATUSES = [
  "draft",
  "submitted",
  "payment_pending",
  "confirmed",
  "for_print",
  "printed",
  "qc_check",
  "for_framing",
  "framed",
  "final_check",
  "ready_for_delivery",
  "delivered",
  "cancelled",
];

export const CLIENT_TRACK_STAGES = [
  { key: "for_print", label: "Order Received" },
  { key: "printed", label: "Printing" },
  { key: "print_qc", label: "Quality Check" },
  { key: "framed", label: "Framing" },
  { key: "final_check", label: "Final Check" },
  { key: "ready", label: "Ready" },
  { key: "delivered", label: "Delivered" },
];

export function titleize(value?: string | null) {
  if (!value) return "—";
  return value
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function peso(amount: number | null | undefined) {
  return `₱${Number(amount ?? 0).toLocaleString("en-PH", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "gold";

export function paymentTone(status?: string | null): Tone {
  if (status === "paid") return "success";
  if (status === "partial") return "warning";
  if (status === "refunded") return "info";
  return "danger";
}

export function productionTone(stage?: string | null): Tone {
  if (stage === "delivered") return "success";
  if (stage === "ready") return "gold";
  if (stage === "for_print") return "warning";
  return "info";
}

export function stageIndex(stage?: string | null) {
  return PRODUCTION_STAGES.findIndex((s) => s.key === stage);
}

export function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(value?: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

