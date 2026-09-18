import { UserRound } from "lucide-react";

import type { ParticipantRow } from "@/lib/data";
import { cn } from "@/lib/utils";

type Size = "sm" | "md" | "lg" | "xl";

const sizeClass: Record<Size, string> = {
  sm: "size-8 text-[0.62rem]",
  md: "size-11 text-xs",
  lg: "size-16 text-sm",
  xl: "size-24 text-lg",
};

function initials(name?: string | null) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "";
  return parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

export function PersonAvatar({
  person,
  size = "md",
  className,
}: {
  person?: ParticipantRow | null;
  size?: Size;
  className?: string;
}) {
  const label = person?.full_name || "Participant";

  return (
    <div
      className={cn(
        "relative shrink-0 overflow-hidden rounded-lg border border-border bg-muted/30",
        sizeClass[size],
        className,
      )}
      title={label}
      aria-label={label}
    >
      {person?.thumbnail_url ? (
        <img
          src={person.thumbnail_url}
          alt={label}
          loading="lazy"
          decoding="async"
          className="h-full w-full scale-[1.16] object-cover"
          style={{ objectPosition: "50% 24%" }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center font-bold text-muted-foreground">
          {initials(person?.full_name) || <UserRound className="size-1/2" />}
        </div>
      )}
    </div>
  );
}

export function PeopleAvatars({
  people,
  size = "md",
  max = 4,
}: {
  people: Array<ParticipantRow | null | undefined>;
  size?: Size;
  max?: number;
}) {
  const visible = people.filter(Boolean) as ParticipantRow[];
  const shown = visible.slice(0, max);
  const extra = Math.max(0, visible.length - shown.length);

  if (!shown.length) return <PersonAvatar person={null} size={size} />;

  return (
    <div className="flex items-center">
      {shown.map((person, index) => (
        <PersonAvatar
          key={person.id}
          person={person}
          size={size}
          className={cn(index > 0 && "-ml-2 ring-2 ring-card")}
        />
      ))}
      {extra ? (
        <div className={cn(
          "relative -ml-2 grid shrink-0 place-items-center rounded-lg border border-border bg-muted font-bold text-muted-foreground ring-2 ring-card",
          sizeClass[size],
        )}>
          +{extra}
        </div>
      ) : null}
    </div>
  );
}