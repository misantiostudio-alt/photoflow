import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";
import { titleize, type Tone } from "@/lib/domain";

const pill = cva(
  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.7rem] font-semibold tracking-wide whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "border-border bg-muted text-muted-foreground",
        success: "border-success/25 bg-success/10 text-success",
        warning: "border-warning/35 bg-warning/15 text-warning-foreground",
        danger: "border-destructive/25 bg-destructive/10 text-destructive",
        info: "border-info/25 bg-info/10 text-info",
        gold: "border-gold/40 bg-gold/15 text-gold-foreground",
      },
      size: {
        sm: "px-2 py-0.5 text-[0.65rem]",
        md: "",
      },
    },
    defaultVariants: { tone: "neutral", size: "md" },
  },
);

export function StatusPill({
  label,
  tone = "neutral",
  size,
  className,
}: { label?: string | null; tone?: Tone } & VariantProps<typeof pill> & {
    className?: string;
  }) {
  return <span className={cn(pill({ tone, size }), className)}>{titleize(label)}</span>;
}

export function Dot({ tone = "neutral" }: { tone?: Tone }) {
  const map: Record<Tone, string> = {
    neutral: "bg-muted-foreground",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-destructive",
    info: "bg-info",
    gold: "bg-gold",
  };
  return <span className={cn("size-2 rounded-full", map[tone])} />;
}

