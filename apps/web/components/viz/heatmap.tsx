import { utcDate } from "@/lib/time/format";
import type { HeatDay, Level } from "@/lib/usage/tokens";
import { utcOfDay } from "@/lib/usage/tokens";
import { cn } from "@/lib/utils";

export const heat = {
  0: "bg-track",
  1: "bg-tokens/30",
  2: "bg-tokens/50",
  3: "bg-tokens/70",
  4: "bg-tokens",
} as const satisfies Record<Level, string>;

const month = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });

const shownFrom = (age: number) => {
  if (age >= 39) {
    return "hidden @2xl:flex";
  }

  return age >= 26 ? "hidden @xl:flex" : "flex";
};

const weekdays = ["", "Mon", "", "Wed", "", "Fri", ""];

export const Heatmap = ({
  weeks,
  describe,
  label,
}: {
  weeks: readonly (readonly HeatDay[])[];
  describe: (day: HeatDay) => string;
  label: string;
}) => (
  <figure aria-label={label} className="@container min-w-0">
    <div className="flex gap-1">
      <div className="flex w-7 shrink-0 flex-col gap-1 pt-5 text-[10px] text-muted-foreground">
        {weekdays.map((name, index) => (
          <span key={index} className="flex flex-1 items-center leading-none">
            {name}
          </span>
        ))}
      </div>
      {weeks.map((week, index) => {
        const [first] = week;
        const previous = weeks[index - 1]?.[0];

        const starts =
          first !== undefined &&
          previous !== undefined &&
          month.format(utcOfDay(first.day)) !== month.format(utcOfDay(previous.day));

        return (
          <div
            key={first?.day ?? index}
            className={cn("min-w-0 flex-1 flex-col gap-1", shownFrom(weeks.length - 1 - index))}
          >
            <span className="h-4 overflow-visible text-[10px] leading-4 whitespace-nowrap text-muted-foreground">
              {starts ? month.format(utcOfDay(first.day)) : ""}
            </span>
            {week.map((day) => (
              <span
                key={day.day}
                title={day.future ? undefined : `${utcDate(utcOfDay(day.day))} · ${describe(day)}`}
                className={cn(
                  "aspect-square w-full rounded-[3px]",
                  day.future ? "bg-transparent" : heat[day.level],
                )}
              />
            ))}
          </div>
        );
      })}
    </div>
  </figure>
);

export const HeatLegend = () => (
  <span className="flex items-center gap-1">
    Less
    {([0, 1, 2, 3, 4] as const).map((level) => (
      <span key={level} aria-hidden className={cn("size-3 rounded-[3px]", heat[level])} />
    ))}
    More
  </span>
);
