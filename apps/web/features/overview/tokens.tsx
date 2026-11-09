import { HeatLegend, Heatmap } from "@/components/viz/heatmap";
import { Section } from "@/components/viz/section";
import { plural, utcDate } from "@/lib/time/format";
import type { TokenStats } from "@/lib/usage/tokens";
import { utcOfDay } from "@/lib/usage/tokens";
import { format } from "@/lib/usage/usage";
import { cn } from "@/lib/utils";

const since = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC", year: "numeric" });

const Amount = ({ value, className }: { value: number; className?: string | undefined }) => {
  const text = format("tokens", value);
  const number = text.replace(/[A-Z]$/u, "");

  return (
    <span className="flex items-baseline gap-0.5 whitespace-nowrap">
      <span className={cn("text-4xl font-light tracking-tight tabular-nums", className)}>
        {number}
      </span>
      <span className="text-sm text-muted-foreground">{text.slice(number.length)}</span>
    </span>
  );
};

const Figure = ({
  label,
  hint,
  value,
  className,
}: {
  label: string;
  hint?: string;
  value: number;
  className?: string | undefined;
}) => (
  <div className="min-w-0 space-y-1.5">
    <div className="truncate text-sm">
      {label}
      {hint === undefined ? null : <span className="ml-1.5 text-muted-foreground">{hint}</span>}
    </div>
    <Amount value={value} className={className} />
  </div>
);

const shades = ["bg-tokens", "bg-tokens-2", "bg-tokens-3", "bg-chart-4"];

const Models = ({ models }: { models: TokenStats["models"] }) => (
  <div className="min-w-0 space-y-4">
    <div className="flex h-2 gap-0.5 overflow-hidden rounded-full">
      {models.map((model, index) => (
        <span
          key={model.key}
          title={model.label}
          className={cn("h-full rounded-full", shades[index])}
          style={{ flexBasis: 0, flexGrow: model.share, minWidth: "2px" }}
        />
      ))}
    </div>
    <ul className="space-y-2.5 text-sm">
      {models.map((model, index) => (
        <li
          key={model.key}
          className="grid grid-cols-[auto_minmax(0,1fr)_auto_2.5rem] items-center gap-2"
        >
          <span aria-hidden className={cn("size-2 rounded-[2px]", shades[index])} />
          <span className="truncate">{model.label}</span>
          <span className="tabular-nums">{format("tokens", model.tokens)}</span>
          <span className="text-right text-xs text-muted-foreground tabular-nums">
            {Math.round(model.share * 100)}%
          </span>
        </li>
      ))}
    </ul>
  </div>
);

export const TokensSection = ({ stats }: { stats: TokenStats }) => {
  const { best } = stats;

  return (
    <Section
      title={
        <>
          <span className="block text-6xl font-light tracking-tight text-tokens tabular-nums sm:text-7xl">
            {format("tokens", stats.total)}
          </span>
          <span className="mt-2 block">
            tokens{stats.since === null ? null : ` since ${since.format(stats.since)}`}
          </span>
        </>
      }
      detail={
        stats.cacheShare === null
          ? undefined
          : `${Math.round(stats.cacheShare * 100)}% read from cache`
      }
    >
      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
          <Figure label="Today" value={stats.today} className="text-tokens" />
          <Figure label="7 days" value={stats.week} />
          <Figure label="30 days" value={stats.month} />
          {best === null ? null : (
            <Figure label="Best day" hint={utcDate(utcOfDay(best.day))} value={best.tokens} />
          )}
        </div>
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-10">
          <div className="min-w-0 space-y-3">
            <Heatmap
              weeks={stats.weeks}
              label="Tokens per day over the last year"
              describe={(day) => `${format("tokens", day.tokens)} tokens`}
            />
            <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 pl-8 text-xs text-muted-foreground">
              <HeatLegend />
              {stats.streak < 2 ? null : <span>{plural(stats.streak, "day")} in a row</span>}
            </div>
          </div>
          <div className="border-t pt-6 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
            <Models models={stats.models} />
          </div>
        </div>
      </div>
    </Section>
  );
};
