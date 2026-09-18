import { createFileRoute } from "@tanstack/react-router";
import { LegacyRedirect } from "@/components/legacy-redirect";

export const Route = createFileRoute("/shooting")({ component: ShootingLegacy });

function ShootingLegacy() {
  return <LegacyRedirect to="/gallery" />;
}
