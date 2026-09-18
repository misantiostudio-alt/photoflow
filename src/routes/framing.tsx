import { createFileRoute } from "@tanstack/react-router";
import { LegacyRedirect } from "@/components/legacy-redirect";

export const Route = createFileRoute("/framing")({ component: FramingLegacy });

function FramingLegacy() {
  return <LegacyRedirect to="/production" />;
}
