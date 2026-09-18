import { createFileRoute } from "@tanstack/react-router";
import { LegacyRedirect } from "@/components/legacy-redirect";

export const Route = createFileRoute("/payments")({ component: PaymentsLegacy });

function PaymentsLegacy() {
  return <LegacyRedirect to="/orders" />;
}
