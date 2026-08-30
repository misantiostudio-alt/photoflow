import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  hint,
  icon,
  accent,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: ReactNode;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "card-surface p-4 transition-shadow hover:shadow-[var(--shadow-lift)]",
        accent && "border-gold/40 bg-gold/10",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="eyebrow">{label}</p>
        {icon ? <span className="text-muted-foreground">{icon}</span> : null}
      </div>
      <p className="mt-2 font-display text-2xl tabular-nums">{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function PipelineStage({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total ? Math.round((count / total) * 100) : 0;
  return (
    <div className="card-surface p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold">{label}</p>
        <p className="text-xs tabular-nums text-muted-foreground">{pct}%</p>
      </div>
      <p className="mt-1 font-display text-xl tabular-nums">{count}</p>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

