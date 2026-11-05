import { hatchStyle } from "@/components/viz/hatch";
import { fills } from "@/components/viz/meter";
import type { Tone } from "@/lib/model/tone";
import { cn } from "@/lib/utils";

export interface Segment {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly tone?: Tone;
  readonly locked?: boolean;
}

export const Segments = ({
  parts,
  className,
}: {
  parts: readonly Segment[];
  className?: string;
}) => (
  <div className={cn("flex h-2 gap-0.5", className)}>
    {parts.map((part) => (
      <div
        key={part.id}
        title={`${part.label}: ${Math.round(part.value)}%`}
        className="h-full flex-1 overflow-hidden rounded-full bg-track"
        style={part.locked === true ? hatchStyle : undefined}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            fills[part.tone ?? "ok"]
          )}
          style={{ width: `${Math.min(100, Math.max(0, part.value))}%` }}
        />
      </div>
    ))}
  </div>
);
