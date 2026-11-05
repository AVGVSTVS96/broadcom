import { formatShort, sumCells } from "@/lib/model/usage";
import type { Cell, Unit } from "@/lib/model/usage";
import { cn } from "@/lib/utils";

const levels = [
  "text-faint",
  "bg-foreground/[0.06]",
  "bg-foreground/10",
  "bg-foreground/[0.18]",
  "bg-foreground/30",
] as const;

const levelOf = (value: number, top: number) =>
  top <= 0 || value <= 0 ? 0 : Math.max(1, Math.ceil((value / top) * 4));

export const nowIndex = (cells: readonly Cell[]) => {
  const current = cells.find((cell) => cell.now !== null);

  return current === undefined
    ? Number.POSITIVE_INFINITY
    : current.from + (current.now ?? 0);
};

const averageOf = (series: readonly number[], last: number) => {
  const elapsed = Math.min(series.length, last + 1);

  const total = series.slice(0, elapsed).reduce((sum, value) => sum + value, 0);

  return elapsed > 0 ? total / elapsed : 0;
};

export const Multiples = ({
  series,
  cells,
  unit,
  ink,
}: {
  series: readonly number[];
  cells: readonly Cell[];
  unit: Unit;
  ink: boolean;
}) => {
  const last = nowIndex(cells);
  const max = Math.max(0, ...series);
  const sums = sumCells(series, cells);
  const top = Math.max(0, ...sums);
  const average = averageOf(series, last);

  return (
    <div
      className="grid gap-1.5 sm:gap-2.5"
      style={{
        gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
      }}
    >
      {cells.map((cell, index) => {
        const sum = sums[index] ?? 0;
        const bars = series.slice(cell.from, cell.to);

        return (
          <div key={cell.from} className="min-w-0">
            <span
              className={cn(
                "inline-flex h-5 max-w-full items-center truncate rounded-md px-1.5 text-[11px] tabular-nums",
                levels[levelOf(sum, top)]
              )}
            >
              {sum > 0 ? formatShort(unit, sum) : ""}
            </span>
            <div className="relative mt-1.5 flex h-9 items-end gap-0.5">
              {bars.map((value, offset) => {
                const at = cell.from + offset;

                return at > last ? (
                  <span
                    key={at}
                    className="h-px flex-1 border-t border-dotted border-faint"
                  />
                ) : (
                  <span
                    key={at}
                    className={cn(
                      "flex-1 rounded-t-[2px]",
                      ink ? "bg-foreground" : "bg-chart-3"
                    )}
                    style={{
                      height:
                        value > 0 ? `max(2px, ${(value / max) * 100}%)` : "0px",
                    }}
                  />
                );
              })}
              {average > 0 && max > 0 ? (
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/60"
                  style={{ bottom: `${(average / max) * 100}%` }}
                />
              ) : null}
              {cell.now === null ? null : (
                <span
                  aria-hidden
                  className="absolute -top-0.5 -bottom-1 w-px bg-foreground"
                  style={{
                    left: `calc(${((cell.now + 1) / bars.length) * 100}% - 1px)`,
                  }}
                />
              )}
            </div>
            <div className="mt-1 h-px bg-border" />
          </div>
        );
      })}
    </div>
  );
};

const plot = 112;

export const Columns = ({
  values,
  cells,
  unit,
}: {
  values: readonly number[];
  cells: readonly Cell[];
  unit: Unit;
}) => {
  const max = Math.max(0, ...values);
  const current = cells.findIndex((cell) => cell.now !== null);
  const settled = values.slice(0, current === -1 ? values.length : current);

  const average =
    settled.length > 0
      ? settled.reduce((sum, value) => sum + value, 0) / settled.length
      : 0;

  return (
    <figure className="space-y-2">
      <div
        className="relative flex items-end gap-1.5"
        style={{ height: plot + 20 }}
      >
        {values.map((value, index) => {
          const cell = cells[index];

          return (
            <div
              key={cell?.from ?? index}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {value > 0 ? formatShort(unit, value) : ""}
              </span>
              <span
                className={cn(
                  "w-full max-w-6 rounded-t-[4px]",
                  cell?.now === null ? "bg-chart-3" : "bg-foreground"
                )}
                style={{
                  height:
                    value > 0 && max > 0
                      ? Math.max(2, (value / max) * plot)
                      : 0,
                }}
              />
            </div>
          );
        })}
        {average > 0 && max > 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-muted-foreground/60"
            style={{ bottom: (average / max) * plot }}
          />
        ) : null}
      </div>
      <div className="h-px bg-border" />
      <figcaption className="flex gap-1.5">
        {cells.map((cell) => (
          <span
            key={cell.from}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-[11px] text-muted-foreground",
              cell.now !== null && "text-foreground"
            )}
          >
            {cell.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
};
