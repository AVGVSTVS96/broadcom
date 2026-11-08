import type { Tone } from "@/lib/pool/tone";
import { cn } from "@/lib/utils";

export const fills = {
  bad: "bg-bad",
  none: "bg-faint",
  ok: "bg-ok",
  over: "bg-over",
} as const satisfies Record<Tone, string>;

export const texts = {
  bad: "text-bad",
  none: "text-muted-foreground",
  ok: "text-ok",
  over: "text-over",
} as const satisfies Record<Tone, string>;

export const Meter = ({
  value,
  tone = "ok",
  className,
}: {
  value: number;
  tone?: Tone;
  className?: string;
}) => (
  <div className={cn("h-2 overflow-hidden rounded-full bg-track", className)}>
    <div
      className={cn("h-full rounded-full transition-[width] duration-500", fills[tone])}
      style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
    />
  </div>
);

export const Ticks = ({
  value,
  count = 40,
  tone = "ok",
}: {
  value: number;
  count?: number;
  tone?: Tone;
}) => {
  const lit = Math.round((Math.min(100, Math.max(0, value)) / 100) * count);

  return (
    <div className="flex h-5 gap-[2px]">
      <span className="sr-only">{Math.round(value)}%</span>
      {Array.from({ length: count }, (_, index) => (
        <span
          aria-hidden
          key={index}
          className={cn("w-full rounded-[1px]", index < lit ? fills[tone] : "bg-track")}
        />
      ))}
    </div>
  );
};
