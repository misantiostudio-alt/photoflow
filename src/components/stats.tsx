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
        "group relative overflow-hidden rounded-lg border border-border bg-card/72 px-4 py-3.5 transition-colors hover:border-primary/20 hover:bg-card",
        accent && "border-primary/25 bg-primary/[0.035]",
      )}
    >
      <span
        className={cn(
          "absolute inset-y-0 left-0 w-0.5 bg-transparent",
          accent && "bg-primary",
        )}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-[0.58rem] font-bold tracking-[0.12em] text-muted-foreground uppercase">
          {label}
        </p>
        {icon ? (
          <span
            className={cn(
              "grid size-7 place-items-center rounded-md border border-border bg-background/45 text-muted-foreground",
              accent && "border-primary/20 text-primary",
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2 font-display text-[1.65rem] font-extrabold leading-none tabular-nums tracking-[-0.05em]">
        {value}
      </p>
      {hint ? <p className="mt-1.5 text-[0.66rem] text-muted-foreground">{hint}</p> : null}
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
  const complete = total > 0 && count >= total;

  return (
    <div className="group relative min-w-[138px] flex-1 border-l border-border px-3.5 py-2.5 first:border-l-0">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[0.66rem] font-semibold text-foreground/90">{label}</p>
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full bg-muted-foreground/45",
            pct > 0 && "bg-primary/70",
            complete && "bg-primary shadow-[0_0_10px_rgba(183,255,0,.35)]",
          )}
        />
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="font-display text-xl font-extrabold leading-none tabular-nums tracking-[-0.04em]">
          {count}
        </p>
        <p className="text-[0.58rem] font-semibold tabular-nums text-muted-foreground">{pct}%</p>
      </div>
      <div className="mt-2 h-px w-full overflow-hidden bg-border">
        <div
          className="h-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
