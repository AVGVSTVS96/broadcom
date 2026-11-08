import type { PointerEvent, ReactNode } from "react";

import { HatchPattern, forecastHatchId, hatchId } from "@/components/viz/hatch";
import { At } from "@/components/viz/plot";
import { addDays } from "@/lib/model/calendar";
import { date, weekday } from "@/lib/model/format";
import { HOUR } from "@/lib/model/history";
import type { Cell, Span, Spiral, Turn } from "@/lib/model/spiral";
import { cn } from "@/lib/utils";

import { fillLevel, planSteps } from "./cells";

const size = 400;

const center = size / 2;

const inner = 62;

const outer = 162;

const bandShare = 0.8;

const fewestTurns = 4;

const hourGap = 0.14;

const turnAngle = 2 * Math.PI;

type XY = readonly [x: number, y: number];

interface Rings {
  readonly pitch: number;
  readonly band: number;
  readonly first: number;
  readonly turns: readonly Turn[];
}

const ringsOf = (turns: readonly Turn[]): Rings => {
  const room = Math.max(fewestTurns, turns.length);
  const pitch = (outer - inner) / (room + bandShare);

  return {
    band: pitch * bandShare,
    first: inner + (room - turns.length) * pitch,
    pitch,
    turns,
  };
};

const fraction = (turn: Turn, at: number) => (at - turn.from) / (turn.to - turn.from);

const radius = (rings: Rings, index: number, part: number) =>
  rings.first + rings.band / 2 + (index + part) * rings.pitch;

const polar = (r: number, part: number): XY => {
  const angle = part * turnAngle - Math.PI / 2;

  return [
    Math.round((center + r * Math.cos(angle)) * 100) / 100,
    Math.round((center + r * Math.sin(angle)) * 100) / 100,
  ];
};

const at = (rings: Rings, index: number, part: number, offset = 0) =>
  polar(radius(rings, index, part) + offset, part);

const pathOf = (points: readonly XY[]) => `M${points.map(([x, y]) => `${x},${y}`).join("L")}Z`;

const sweep = (from: number, to: number) => {
  const steps = Math.max(1, Math.ceil((to - from) * 168));

  return Array.from({ length: steps + 1 }, (_, step) => {
    const part = from + ((to - from) * step) / steps;

    return part;
  });
};

const bandPath = (rings: Rings, index: number, from: number, to: number, grow = 0) => {
  const parts = sweep(from, to);
  const half = rings.band / 2 + grow;

  return pathOf([
    ...parts.map((part) => at(rings, index, part, half)),
    ...parts.toReversed().map((part) => at(rings, index, part, -half)),
  ]);
};

const spanPath = (rings: Rings, index: number, [from, to]: Span) => {
  const turn = rings.turns[index];

  return turn === undefined ? "" : bandPath(rings, index, fraction(turn, from), fraction(turn, to));
};

const tick = (rings: Rings, index: number, part: number, reach: number) => {
  const half = rings.band / 2 + reach;
  const [x1, y1] = at(rings, index, part, -half);
  const [x2, y2] = at(rings, index, part, half);

  return { x1, x2, y1, y2 };
};

const emptyRuns = (cells: readonly Cell[]) => {
  const runs: [number, number][] = [];

  for (const cell of cells) {
    const last = runs.at(-1);

    if (cell.used !== null) {
      continue;
    }

    if (last !== undefined && last[1] === cell.from) {
      last[1] = cell.to;
    } else {
      runs.push([cell.from, cell.to]);
    }
  }

  return runs;
};

const perHour = (cell: Cell) => (cell.used ?? 0) / Math.max(1, (cell.to - cell.from) / HOUR);

const hourRuns = (usual: readonly boolean[]) => {
  const runs: [number, number][] = [];

  for (const [hour, on] of usual.entries()) {
    const last = runs.at(-1);

    if (on && last !== undefined && last[1] === hour) {
      last[1] = hour + 1;
    } else if (on) {
      runs.push([hour, hour + 1]);
    }
  }

  return runs;
};

const turnOf = (rings: Rings, timeAt: number) =>
  rings.turns.findIndex((turn) => timeAt >= turn.from && timeAt < turn.to);

const dayLabels = (turn: Turn | undefined) =>
  turn === undefined
    ? []
    : Array.from({ length: 7 }, (_, index) => {
        const from = addDays(turn.from, index);
        const middle = (from + addDays(from, 1)) / 2;

        return { from, part: fraction(turn, middle) };
      });

export interface Focus {
  readonly turn: number;
  readonly cell: Cell | null;
}

const locate = (rings: Rings, x: number, y: number): Focus | null => {
  const dx = x - center;
  const dy = y - center;
  const angle = Math.atan2(dy, dx) + Math.PI / 2;
  const part = (((angle / turnAngle) % 1) + 1) % 1;
  const r = Math.hypot(dx, dy);

  const index = Math.round((r - rings.first - rings.band / 2) / rings.pitch - part);

  const turn = rings.turns[index];

  if (turn === undefined) {
    return null;
  }

  const timeAt = turn.from + part * (turn.to - turn.from);

  return {
    cell: turn.cells.find((cell) => timeAt >= cell.from && timeAt < cell.to) ?? null,
    turn: index,
  };
};

const Usual = ({ rings, turn, usual }: { rings: Rings; turn: Turn; usual: readonly boolean[] }) =>
  hourRuns(usual).flatMap(([from, to]) =>
    Array.from({ length: 7 }, (_, day) => {
      const dayStart = addDays(turn.from, day);

      const parts = sweep(
        fraction(turn, dayStart + from * HOUR),
        fraction(turn, dayStart + to * HOUR),
      );

      return (
        <path
          key={`${day}-${from}`}
          d={parts
            .map((part, step) => {
              const [x, y] = polar(
                radius(rings, rings.turns.length - 1, part) + rings.band / 2 + 6,
                part,
              );

              return `${step === 0 ? "M" : "L"}${x},${y}`;
            })
            .join("")}
          className="fill-none stroke-faint"
          strokeWidth={1.5}
          strokeLinecap="round"
        />
      );
    }),
  );

const percent = ([x, y]: XY) => ({
  x: (x / size) * 100,
  y: (y / size) * 100,
});

const nowGap = 0.05;

const Labels = ({ rings, now }: { rings: Rings; now: number }) => {
  const last = rings.turns.length - 1;
  const current = rings.turns[last];

  if (current === undefined) {
    return null;
  }

  const nowPart = fraction(current, now);

  return (
    <>
      {dayLabels(current)
        .filter(({ part }) => Math.abs(part - nowPart) > nowGap)
        .map(({ from, part }) => (
          <At
            key={from}
            {...percent(polar(outer + 18, part))}
            className="pointer-events-none text-xs text-muted-foreground"
          >
            {weekday(from)}
          </At>
        ))}
      <At
        {...percent(at(rings, last, nowPart, rings.band / 2 + 16))}
        className="pointer-events-none text-xs"
      >
        Now
      </At>
    </>
  );
};

const Ring = ({ rings, index }: { rings: Rings; index: number }) => {
  const turn = rings.turns[index];

  if (turn === undefined) {
    return null;
  }

  return (
    <g>
      {turn.cells
        .filter((cell) => cell.used !== null)
        .map((cell) => {
          const from = fraction(turn, cell.from);
          const to = fraction(turn, cell.to);
          const pad = ((to - from) * hourGap) / Math.max(1, (to - from) * 168);

          return (
            <path
              key={cell.from}
              d={bandPath(rings, index, from + pad / 2, to - pad / 2)}
              className={fillLevel(perHour(cell), planSteps)}
            />
          );
        })}
      {emptyRuns(turn.cells).map((span) => (
        <path
          key={span[0]}
          d={spanPath(rings, index, span)}
          className="fill-none stroke-muted-foreground/50"
          strokeWidth={1}
          strokeDasharray="1.5 2.5"
        />
      ))}
      {turn.locks.map((span) => (
        <path key={span[0]} d={spanPath(rings, index, span)} fill={`url(#${hatchId})`} />
      ))}
      {turn.resets.map((reset) => (
        <line
          key={reset}
          {...tick(rings, index, fraction(turn, reset), 3)}
          className="stroke-foreground"
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
};

const Ahead = ({ rings, ahead, now }: { rings: Rings; ahead: Span | null; now: number }) => {
  const last = rings.turns.length - 1;
  const current = rings.turns[last];

  if (current === undefined) {
    return null;
  }

  const nowPart = fraction(current, now);

  return (
    <g className="pointer-events-none">
      <path
        d={bandPath(rings, last, nowPart, 1)}
        className="fill-none stroke-muted-foreground/60"
        strokeWidth={1}
        strokeDasharray="3 3"
      />
      {ahead === null || ahead[0] >= current.to ? null : (
        <path
          d={spanPath(rings, last, [ahead[0], Math.min(ahead[1], current.to)])}
          fill={`url(#${forecastHatchId})`}
          className="stroke-bad/60"
          strokeWidth={1}
          strokeDasharray="3 3"
        />
      )}
      <line
        {...tick(rings, last, nowPart, 6)}
        className="stroke-muted-foreground"
        strokeWidth={1.5}
      />
    </g>
  );
};

const RunOuts = ({ rings, ahead }: { rings: Rings; ahead: Span | null }) => {
  const dots = rings.turns.flatMap((turn, index) =>
    turn.runOuts.map((out) => at(rings, index, fraction(turn, out))),
  );

  const index = ahead === null ? -1 : turnOf(rings, ahead[0]);
  const turn = rings.turns[index];

  const projected =
    ahead === null || turn === undefined ? null : at(rings, index, fraction(turn, ahead[0]));

  const trail = [...dots, ...(projected === null ? [] : [projected])];

  return (
    <g className="pointer-events-none">
      {dots.length > 1 ? (
        <path
          d={dots.map(([x, y], step) => `${step === 0 ? "M" : "L"}${x},${y}`).join("")}
          className="fill-none stroke-bad"
          strokeWidth={1.5}
        />
      ) : null}
      {projected === null || dots.length === 0 ? null : (
        <path
          d={`M${trail
            .slice(-2)
            .map(([x, y]) => `${x},${y}`)
            .join("L")}`}
          className="fill-none stroke-bad"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
      )}
      {dots.map(([x, y]) => (
        <circle
          key={`${x}-${y}`}
          cx={x}
          cy={y}
          r={5}
          className="fill-bad stroke-card"
          strokeWidth={2}
        />
      ))}
      {projected === null ? null : (
        <circle
          cx={projected[0]}
          cy={projected[1]}
          r={5}
          className="fill-card stroke-bad"
          strokeWidth={2}
        />
      )}
    </g>
  );
};

const WeekButtons = ({
  rings,
  selected,
  onSelect,
}: {
  rings: Rings;
  selected: number;
  onSelect: (index: number) => void;
}) =>
  rings.turns.map((turn, index) => {
    const [x, y] = at(rings, index, 0);

    return (
      <button
        key={turn.from}
        type="button"
        aria-pressed={index === selected}
        onClick={() => {
          onSelect(index);
        }}
        className={cn(
          "absolute -translate-y-1/2 rounded-[4px] border bg-card px-1 text-[10px] leading-3.5 whitespace-nowrap sm:text-[11px] sm:leading-4",
          index === selected
            ? "border-foreground/70 text-foreground"
            : "border-transparent text-muted-foreground hover:text-foreground",
        )}
        style={{
          left: `${((x + 2) / size) * 100}%`,
          top: `${(y / size) * 100}%`,
        }}
      >
        {turn.current ? "This week" : date(turn.from)}
      </button>
    );
  });

export const Coil = ({
  spiral,
  selected,
  now,
  onFocus,
  onSelect,
  children,
}: {
  spiral: Spiral;
  selected: number;
  now: number;
  onFocus: (focus: Focus | null) => void;
  onSelect: (index: number) => void;
  children?: ReactNode;
}) => {
  const rings = ringsOf(spiral.turns);
  const current = spiral.turns.at(-1);

  const point = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();

    return locate(
      rings,
      ((event.clientX - box.left) / box.width) * size,
      ((event.clientY - box.top) / box.height) * size,
    );
  };

  return (
    <div className="relative">
      <svg
        aria-hidden
        viewBox={`0 0 ${size} ${size}`}
        className="block w-full touch-manipulation overflow-visible select-none"
        onPointerMove={(event) => {
          onFocus(point(event));
        }}
        onPointerLeave={() => {
          onFocus(null);
        }}
        onPointerUp={(event) => {
          const found = point(event);

          onFocus(found);

          if (found !== null) {
            onSelect(found.turn);
          }
        }}
      >
        <HatchPattern />
        {current === undefined ? null : <Usual rings={rings} turn={current} usual={spiral.usual} />}
        {spiral.turns.map((turn, index) => (
          <Ring key={turn.from} rings={rings} index={index} />
        ))}
        <Ahead rings={rings} ahead={spiral.ahead} now={now} />
        <path
          d={bandPath(rings, selected, 0, 1, 1.5)}
          className="pointer-events-none fill-none stroke-foreground/70"
          strokeWidth={1}
        />
        <RunOuts rings={rings} ahead={spiral.ahead} />
      </svg>
      <Labels rings={rings} now={now} />
      <WeekButtons rings={rings} selected={selected} onSelect={onSelect} />
      {children}
    </div>
  );
};
