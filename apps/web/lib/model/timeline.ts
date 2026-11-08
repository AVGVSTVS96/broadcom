import { WEEK, since, valueAt } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";

export interface Span {
  readonly from: number;
  readonly to: number;
}

export interface Windows {
  readonly ended: (Span & { readonly used: number }) | null;
  readonly current: Span;
  readonly next: Span;
}

export const windows = (
  resetsAt: number,
  points: Points,
  length = WEEK
): Windows => {
  const start = resetsAt - length;
  const before = points.filter(([at]) => at < start);
  const endedUsed = before.length === 0 ? null : valueAt(points, start - 1);

  return {
    current: { from: start, to: resetsAt },
    ended:
      endedUsed === null
        ? null
        : { from: start - length, to: start, used: endedUsed },
    next: { from: resetsAt, to: resetsAt + length },
  };
};

export const inWindow = (points: Points, span: Span) =>
  since(points, span.from).filter(([at]) => at < span.to);
