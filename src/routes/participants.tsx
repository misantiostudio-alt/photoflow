import { createFileRoute } from "@tanstack/react-router";
import { LegacyRedirect } from "@/components/legacy-redirect";

export const Route = createFileRoute("/participants")({ component: ParticipantsLegacy });

function ParticipantsLegacy() {
  return <LegacyRedirect to="/gallery" />;
}
