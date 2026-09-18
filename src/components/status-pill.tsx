import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { titleize, type Tone } from "@/lib/domain";

const pill = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[0.62rem] font-semibold leading-none tracking-[0.015em] whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-background/45 text-muted-foreground",
        success: "border-success/25 bg-success/[0.08] text-success",
        warning: "border-warning/30 bg-warning/[0.08] text-warning",
        danger: "border-destructive/25 bg-destructive/[0.08] text-destructive",
        info: "border-info/25 bg-info/[0.08] text-info",
        gold: "border-primary/25 bg-primary/[0.07] text-primary",
      },
      size: {
        sm: "px-1.5 py-0.5 text-[0.57rem]",
        md: "",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

const dotMap: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-info",
  gold: "bg-primary",
};

export function StatusPill({
  label,
  tone = "neutral",
  size,
  className,
}: { label?: string | null; tone?: Tone } & VariantProps<typeof pill> & {
  className?: string;
}) {
  return (
    <span className={cn(pill({ tone, size }), className)}>
      <span className={cn("size-1.5 shrink-0 rounded-full", dotMap[tone ?? "neutral"])} />
      {titleize(label)}
    </span>
  );
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  return <span className={cn("size-1.5 rounded-full", dotMap[tone])} />;
}
