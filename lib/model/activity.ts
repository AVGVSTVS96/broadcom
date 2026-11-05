import { addHours, lastDays } from "@/lib/model/calendar";
import { HOUR, isLocked, lockedSpans, usedBetween } from "@/lib/model/history";
import type { Points } from "@/lib/model/history";

export interface Plan {
  readonly id: string;
  readonly cutoff: number;
  readonly points: Points;
}

export interface Hour {
  readonly from: number;
  readonly used: number;
  readonly runOuts: readonly string[];
  readonly free: number;
  readonly present: number;
  readonly future: boolean;
}

export interface Day {
  readonly from: number;
  readonly hours: readonly Hour[];
  readonly locked: number;
}

const hoursInDay = 24;

const busySpan = 3;

export const activity = (plans: readonly Plan[], now: number, days = 7) => {
  const locks = plans.map((plan) => ({
    plan,
    spans: lockedSpans(plan.points, plan.cutoff, now),
  }));

  return lastDays(now, days).map((dayStart): Day => {
    const hours = Array.from({ length: hoursInDay }, (_, index): Hour => {
      const from = addHours(dayStart, index);
      const to = addHours(dayStart, index + 1);
      const middle = Math.min(now, (from + to) / 2);

      const present = locks.filter(
        ({ plan }) => (plan.points[0]?.[0] ?? Infinity) <= middle
      );

      return {
        free: present.filter(({ spans }) => !isLocked(spans, middle)).length,
        from,
        future: from > now,
        present: present.length,
        runOuts: locks.flatMap(({ plan, spans }) =>
          spans.some(([start]) => start >= from && start < to) ? [plan.id] : []
        ),
        used: plans.reduce(
          (sum, plan) => sum + usedBetween(plan.points, from, to),
          0
        ),
      };
    });

    const dayEnd = addHours(dayStart, hoursInDay);

    return {
      from: dayStart,
      hours,
      locked: locks.filter(({ spans }) =>
        spans.some(([start, end]) => start < dayEnd && end > dayStart)
      ).length,
    };
  });
};

export const busiest = (days: readonly Day[]) => {
  const byHour = Array.from({ length: hoursInDay }, (_, hour) =>
    days.reduce((sum, day) => sum + (day.hours[hour]?.used ?? 0), 0)
  );

  let best = { start: 0, used: -1 };

  for (let start = 0; start <= hoursInDay - busySpan; start += 1) {
    const used = byHour
      .slice(start, start + busySpan)
      .reduce((sum, value) => sum + value, 0);

    if (used > best.used) {
      best = { start, used };
    }
  }

  return { byHour, end: best.start + busySpan, start: best.start };
};

export interface Gap {
  readonly from: number;
  readonly to: number;
}

export const gaps = (days: readonly Day[]) => {
  const result: Gap[] = [];

  for (const hour of days.flatMap((day) => day.hours)) {
    const none = !hour.future && hour.present > 0 && hour.free === 0;
    const last = result.at(-1);

    if (none && last !== undefined && last.to === hour.from) {
      result[result.length - 1] = { from: last.from, to: hour.from + HOUR };
    } else if (none) {
      result.push({ from: hour.from, to: hour.from + HOUR });
    }
  }

  return result;
};
