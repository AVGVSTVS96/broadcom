import { line } from "d3-shape";
import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type XY = readonly [x: number, y: number];

const pathOf = line<XY>(
  (point) => point[0],
  (point) => point[1],
);

export const Plot = ({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) => (
  <figure aria-label={label} className={cn("relative", className)}>
    {children}
  </figure>
);

export const Strokes = ({ children }: { children: ReactNode }) => (
  <svg
    aria-hidden
    className="pointer-events-none absolute inset-0 size-full overflow-visible"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
  >
    {children}
  </svg>
);

export const Path = ({
  points,
  className,
  dashed = false,
  width = 2,
}: {
  points: readonly XY[];
  className?: string;
  dashed?: boolean;
  width?: number;
}) => (
  <path
    d={pathOf(points) ?? ""}
    fill="none"
    vectorEffect="non-scaling-stroke"
    strokeWidth={width}
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeDasharray={dashed ? "4 4" : undefined}
    className={cn("stroke-current", className)}
  />
);

export const Area = ({ points, className }: { points: readonly XY[]; className?: string }) => (
  <path d={`${pathOf(points) ?? ""}Z`} className={cn("fill-current", className)} />
);

export const At = ({
  x,
  y,
  className,
  children,
  style,
}: {
  x: number;
  y: number;
  className?: string;
  children?: ReactNode;
  style?: CSSProperties;
}) => (
  <div
    className={cn("absolute -translate-x-1/2 -translate-y-1/2", className)}
    style={{ left: `${x}%`, top: `${y}%`, ...style }}
  >
    {children}
  </div>
);

export const Band = ({
  x0,
  x1,
  y0 = 0,
  y1 = 100,
  className,
  style,
  children,
}: {
  x0: number;
  x1: number;
  y0?: number;
  y1?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) => (
  <div
    className={cn("absolute", className)}
    style={{
      height: `${y1 - y0}%`,
      left: `${x0}%`,
      top: `${y0}%`,
      width: `${Math.max(0, x1 - x0)}%`,
      ...style,
    }}
  >
    {children}
  </div>
);

const dotTones = {
  bad: "bg-bad",
  brand: "bg-brand",
  faint: "bg-faint",
  ink: "bg-foreground",
  ok: "bg-ok",
} as const;

export const Dot = ({
  tone = "ink",
  hollow = false,
  className,
}: {
  tone?: keyof typeof dotTones;
  hollow?: boolean;
  className?: string;
}) => (
  <span
    className={cn(
      "block size-2.5 rounded-full ring-2 ring-card",
      hollow ? "border-2 border-current bg-card" : dotTones[tone],
      className,
    )}
  />
);

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

const traced = (lines: readonly (readonly XY[])[]) =>
  lines.flatMap((points) =>
    points.flatMap((point, index): XY[] => {
      const before = points[index - 1];

      if (before === undefined) {
        return [point];
      }

      const steps = Math.ceil(Math.hypot(point[0] - before[0], point[1] - before[1]));

      return Array.from({ length: steps }, (_, step): XY => {
        const t = (step + 1) / steps;

        return [before[0] + (point[0] - before[0]) * t, before[1] + (point[1] - before[1]) * t];
      });
    }),
  );

const pad = 1.5;

export const freeSpot = (spots: readonly Box[], lines: readonly (readonly XY[])[]) => {
  const marks = traced(lines);

  return (
    spots.find((spot) =>
      marks.every(
        ([x, y]) =>
          x < spot.left - pad ||
          x > spot.left + spot.width + pad ||
          y < spot.top - pad ||
          y > spot.top + spot.height + pad,
      ),
    ) ?? spots[0]
  );
};
