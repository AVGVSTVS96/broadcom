"use client";

import { scaleLinear } from "d3-scale";
import { useState } from "react";

import { format, formatShort, gapsOf, rest } from "@/lib/model/usage";
import type { Cell, Layer, Reading, Unit } from "@/lib/model/usage";
import { cn } from "@/lib/utils";

const fills = ["bg-chart-1", "bg-chart-2", "bg-chart-3"] as const;

export const fillOf = (layers: readonly Layer[], key: string) => {
  const at = layers.findIndex((layer) => layer.key === key);

  if (at === -1) {
    return null;
  }

  return key === rest ? "bg-chart-4" : (fills[at] ?? "bg-chart-3");
};

const Tip = ({
  at,
  count,
  tick,
  layers,
  missing,
  unit,
}: {
  at: number;
  count: number;
  tick: string;
  layers: readonly Layer[];
  missing: boolean;
  unit: Unit;
}) => {
  const parts = layers.filter((layer) => (layer.values[at] ?? 0) > 0);
  const total = parts.reduce((sum, layer) => sum + (layer.values[at] ?? 0), 0);
  const x = (at + 0.5) / count;

  return (
    <output
      className="pointer-events-none absolute top-0 z-10 block w-56 rounded-xl border bg-popover p-3 text-xs shadow-lg"
      style={{
        left: `clamp(0px, calc(2.75rem + 0.5rem + (100% - 3.25rem) * ${x} - 7rem), calc(100% - 14rem))`,
      }}
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground">{tick}</span>
        <span className="font-medium tabular-nums">
          {missing ? "No reading" : format(unit, total)}
        </span>
      </div>
      {missing || parts.length === 0 ? null : (
        <ul className="mt-2 space-y-1">
          {parts.toReversed().map((layer) => (
            <li
              key={layer.key}
              className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2"
            >
              <span
                className={cn(
                  "size-2 rounded-[2px]",
                  fillOf(layers, layer.key)
                )}
              />
              <span className="truncate">{layer.label}</span>
              <span className="tabular-nums">
                {format(unit, layer.values[at] ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </output>
  );
};

export const Stack = ({
  layers,
  cells,
  ticks,
  readings,
  unit,
}: {
  layers: readonly Layer[];
  cells: readonly Cell[];
  ticks: readonly string[];
  readings: readonly Reading[] | null;
  unit: Unit;
}) => {
  const [hovered, setHovered] = useState<number | null>(null);
  const count = ticks.length;

  const totals = ticks.map((_, index) =>
    layers.reduce((sum, layer) => sum + (layer.values[index] ?? 0), 0)
  );

  const y = scaleLinear()
    .domain([0, Math.max(0, ...totals) || 1])
    .nice(3);

  const [, top = 1] = y.domain();
  const grid = y.ticks(3);
  const columns = { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` };

  return (
    <figure
      className="relative"
      onPointerLeave={() => {
        setHovered(null);
      }}
    >
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-2">
        <div className="relative h-[var(--plot)] text-[11px] text-muted-foreground tabular-nums [--plot:180px] sm:[--plot:280px]">
          {grid.map((tick) => (
            <span
              key={tick}
              className="absolute right-0 translate-y-1/2"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {formatShort(unit, tick)}
            </span>
          ))}
        </div>
        <div className="relative h-[var(--plot)] [--plot:180px] sm:[--plot:280px]">
          {grid.map((tick) => (
            <span
              key={tick}
              aria-hidden
              className="absolute inset-x-0 border-t border-border"
              style={{ bottom: `${(tick / top) * 100}%` }}
            />
          ))}
          {gapsOf(readings ?? []).map((gap) => (
            <span
              key={gap.from}
              aria-hidden
              className="absolute inset-y-0 flex items-center justify-center overflow-hidden rounded-lg border border-dotted border-faint text-[11px] whitespace-nowrap text-muted-foreground"
              style={{
                left: `${(gap.from / count) * 100}%`,
                width: `${((gap.to - gap.from) / count) * 100}%`,
              }}
            >
              {gap.to - gap.from >= 4 ? "No reading" : null}
            </span>
          ))}
          <div
            className="absolute inset-0 grid gap-x-[2px] sm:gap-x-1"
            style={columns}
          >
            {ticks.map((tick, index) => {
              const missing = readings?.[index] === "missing";
              const total = totals[index] ?? 0;

              return (
                <button
                  key={tick}
                  type="button"
                  aria-label={`${tick}: ${missing ? "no reading" : format(unit, total)}`}
                  onPointerEnter={() => {
                    setHovered(index);
                  }}
                  onFocus={() => {
                    setHovered(index);
                  }}
                  onClick={() => {
                    setHovered(index);
                  }}
                  className={cn(
                    "relative flex h-full min-w-0 flex-col-reverse items-center gap-[2px] rounded-t-[4px] outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    hovered === index && "bg-muted/70"
                  )}
                >
                  {missing
                    ? null
                    : layers.map((layer) => {
                        const value = layer.values[index] ?? 0;

                        return value <= 0 ? null : (
                          <span
                            key={layer.key}
                            className={cn(
                              "w-full max-w-6 shrink-0 last:rounded-t-[4px]",
                              fillOf(layers, layer.key)
                            )}
                            style={{
                              height: `max(1px, calc(${(value / top) * 100}% - 2px))`,
                            }}
                          />
                        );
                      })}
                </button>
              );
            })}
          </div>
        </div>
        <span />
        <div className="mt-2 grid" style={columns}>
          {cells.map((cell) => (
            <span
              key={cell.from}
              className={cn(
                "border-l border-border pl-1 text-[11px] whitespace-nowrap text-muted-foreground",
                cell.to === count ? "overflow-visible" : "overflow-hidden",
                cell.now !== null && "text-foreground"
              )}
              style={{ gridColumn: `${cell.from + 1} / ${cell.to + 1}` }}
            >
              {cell.label}
            </span>
          ))}
        </div>
      </div>
      {hovered === null ? null : (
        <Tip
          at={hovered}
          count={count}
          tick={ticks[hovered] ?? ""}
          layers={layers}
          missing={readings?.[hovered] === "missing"}
          unit={unit}
        />
      )}
    </figure>
  );
};

export const Parts = ({
  layers,
  label,
}: {
  layers: readonly Layer[];
  label: string;
}) => {
  const sums = layers.map((layer) =>
    layer.values.reduce((sum, value) => sum + value, 0)
  );

  const whole = sums.reduce((sum, value) => sum + value, 0);

  return whole <= 0 ? null : (
    <div aria-label={label} className="flex h-2 gap-[2px]">
      {layers.map((layer, index) => {
        const share = (sums[index] ?? 0) / whole;

        return share <= 0 ? null : (
          <span
            key={layer.key}
            title={`${layer.label} ${Math.round(share * 100)}%`}
            className={cn("rounded-full", fillOf(layers, layer.key))}
            style={{ flexBasis: 0, flexGrow: share }}
          />
        );
      })}
    </div>
  );
};
