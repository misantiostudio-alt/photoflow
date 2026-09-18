import { createFileRoute } from "@tanstack/react-router";
import { LegacyRedirect } from "@/components/legacy-redirect";

export const Route = createFileRoute("/print-queue")({ component: PrintQueueLegacy });

function PrintQueueLegacy() {
  return <LegacyRedirect to="/production" />;
}
