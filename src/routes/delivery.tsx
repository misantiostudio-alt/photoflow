import { createFileRoute } from "@tanstack/react-router";
import { LegacyRedirect } from "@/components/legacy-redirect";

export const Route = createFileRoute("/delivery")({ component: DeliveryLegacy });

function DeliveryLegacy() {
  return <LegacyRedirect to="/release" />;
}
