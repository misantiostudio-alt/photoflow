import { Navigate } from "@tanstack/react-router";

export function LegacyRedirect({ to }: { to: string }) {
  return <Navigate to={to} replace />;
}
