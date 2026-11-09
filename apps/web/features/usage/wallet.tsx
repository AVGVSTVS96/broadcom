import { arc, pie } from "d3-shape";
import type { ReactNode } from "react";

import { Section } from "@/components/viz/section";
import { Stat } from "@/components/viz/stat";
import { dollars, plural, times, when } from "@/lib/time/format";
import type { Part, Source, Wallet } from "@/lib/usage/wallet";
import { cn } from "@/lib/utils";

const fills = [
  { bg: "bg-chart-1", svg: "fill-chart-1" },
  { bg: "bg-chart-2", svg: "fill-chart-2" },
  { bg: "bg-chart-3", svg: "fill-chart-3" },
  { bg: "bg-chart-4", svg: "fill-chart-4" },
] as const;

const fillOf = (index: number) => fills[Math.min(index, fills.length - 1)] ?? fills[0];

const percent = (share: number) => (share < 0.005 ? "<1%" : `${Math.round(share * 100)}%`);

const priceOf = (source: Source) => source.plan ?? source.credit;

const multiple = (source: Source) =>
  source.plan === null || source.plan <= 0 ? null : times(source.ran / source.plan);

const Tile = ({
  className,
  children,
  ...stat
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  className?: string;
  children: ReactNode;
}) => (
  <Stat {...stat} className={cn("bg-card p-4 sm:p-5", className)}>
    <p className="text-xs text-muted-foreground">{children}</p>
  </Stat>
);

const Tiles = ({ wallet, now }: { wallet: Wallet; now: number }) => {
  const { credit } = wallet;

  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border",
        credit === null ? "sm:grid-cols-2" : "sm:grid-cols-3",
      )}
    >
      <Tile
        label="Plans"
        value={dollars(wallet.monthly)}
        unit="/ month"
        className={cn(credit !== null && "col-span-2 sm:col-span-1")}
      >
        {wallet.plans.join(", ")}
      </Tile>
      <Tile label="At API prices" value={dollars(wallet.ran)}>
        Last 30 days
      </Tile>
      {credit === null ? null : (
        <Tile
          label="API credit"
          value={
            <span className={cn(credit.left < credit.granted * 0.05 && "text-bad")}>
              {dollars(credit.left)}
            </span>
          }
          unit="left"
        >
          Of {dollars(credit.granted)}, ends {when(credit.ends, now)}
        </Tile>
      )}
    </div>
  );
};

const size = 200;

const ring = arc<{ startAngle: number; endAngle: number; padAngle: number }>()
  .innerRadius(size / 2 - 20)
  .outerRadius(size / 2)
  .cornerRadius(3);

const Donut = ({ wallet }: { wallet: Wallet }) => {
  const slices = pie<Source>()
    .value((source) => source.ran)
    .padAngle(0.03)([...wallet.sources]);

  return (
    <figure className="relative mx-auto aspect-square w-full max-w-48 lg:max-w-56">
      <svg viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`} className="size-full">
        {slices.map((slice, index) => (
          <path key={slice.data.key} d={ring(slice) ?? ""} className={fillOf(index).svg}>
            <title>{`${slice.data.name}: ${dollars(slice.data.ran)}, ${percent(slice.data.share)}`}</title>
          </path>
        ))}
      </svg>
      <figcaption className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-3xl font-light tracking-tight tabular-nums">
          {dollars(wallet.ran)}
        </span>
        <span className="text-xs text-muted-foreground">on {dollars(wallet.monthly)} a month</span>
      </figcaption>
    </figure>
  );
};

const Bar = ({ source, fill, scale }: { source: Source; fill: string; scale: number }) => {
  const price = priceOf(source);
  const width = (value: number) => `${(value / scale) * 100}%`;

  return (
    <div className="relative h-2">
      <div className="flex h-full gap-0.5" style={{ width: width(source.ran) }}>
        {source.parts
          .filter((part) => part.value > 0)
          .map((part) => (
            <div
              key={part.key}
              title={`${part.label}: ${dollars(part.value)}`}
              className={cn(
                "h-full min-w-0.5 rounded-full",
                part.key === "none" ? "border border-dashed border-muted-foreground/60" : fill,
              )}
              style={{ flexGrow: part.value }}
            />
          ))}
      </div>
      {price === null ? null : (
        <span
          title={`${source.plan === null ? "Credit" : "Plan"}: ${dollars(price)}`}
          className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-card"
          style={{ left: width(price) }}
        />
      )}
    </div>
  );
};

const Parts = ({ parts }: { parts: readonly Part[] }) =>
  parts.length < 2 ? null : (
    <p className="text-xs text-muted-foreground tabular-nums">
      {parts
        .filter((part) => part.value > 0)
        .map((part) => `${part.label} ${dollars(part.value)}`)
        .join(" · ")}
    </p>
  );

const columns = "lg:grid-cols-[9rem_minmax(0,1fr)_4.5rem_5rem_3.5rem]";

const Line = ({ source, index, scale }: { source: Source; index: number; scale: number }) => {
  const fill = fillOf(index).bg;
  const price = priceOf(source);
  const ratio = multiple(source);

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-t py-3.5",
        columns,
      )}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span aria-hidden className={cn("size-2 shrink-0 rounded-full", fill)} />
          <span className="truncate">{source.name}</span>
        </div>
        <div className="truncate pl-4 text-xs text-muted-foreground">{source.detail}</div>
      </div>
      <span className="text-right tabular-nums lg:hidden">{dollars(source.ran)}</span>
      <div className="col-span-2 space-y-1.5 lg:col-span-1">
        <Bar source={source} fill={fill} scale={scale} />
        <Parts parts={source.parts} />
      </div>
      <p className="col-span-2 text-xs text-muted-foreground tabular-nums lg:hidden">
        {[
          source.plan === null ? null : `${dollars(source.plan)} a month`,
          source.credit === null ? null : `${dollars(source.credit)} credit`,
          ratio === null ? null : `${ratio} its price`,
          `${percent(source.share)} of the work`,
        ]
          .filter((part) => part !== null)
          .join(" · ")}
      </p>
      <span className="hidden text-right tabular-nums lg:block">
        {price === null ? "–" : dollars(price)}
      </span>
      <span className="hidden text-right tabular-nums lg:block">{dollars(source.ran)}</span>
      <span className="hidden text-right tabular-nums lg:block">{ratio ?? "–"}</span>
    </li>
  );
};

const Table = ({ wallet }: { wallet: Wallet }) => {
  const scale = Math.max(
    1,
    ...wallet.sources.map((source) => Math.max(source.ran, priceOf(source) ?? 0)),
  );

  return (
    <div className="min-w-0">
      <div className={cn("hidden gap-x-4 pb-2 text-xs text-muted-foreground lg:grid", columns)}>
        <span>Source</span>
        <span />
        <span className="text-right">Price</span>
        <span className="text-right">API $</span>
        <span className="text-right">× price</span>
      </div>
      <ul>
        {wallet.sources.map((source, index) => (
          <Line key={source.key} source={source} index={index} scale={scale} />
        ))}
      </ul>
    </div>
  );
};

const footnote = (wallet: Wallet) =>
  [
    wallet.sources.some((source) => source.parts.some((part) => part.key === "none"))
      ? "Dashed: Claude work logged without a sign-in"
      : null,
    wallet.unpriced.length === 0
      ? null
      : `${plural(wallet.unpriced.length, "plan")} with no known price left out`,
    "API list prices, so an estimate",
  ]
    .filter((part) => part !== null)
    .join(" · ");

export const WalletView = ({ wallet, now }: { wallet: Wallet; now: number }) => {
  const [top] = wallet.sources;

  return (
    <>
      <Section
        title={
          wallet.perDollar === null
            ? `${dollars(wallet.ran)} of work at API prices in 30 days`
            : `Each plan dollar ran ${dollars(wallet.perDollar)} of work at API prices`
        }
        detail="Last 30 days, against what the plans cost a month."
      >
        <Tiles wallet={wallet} now={now} />
      </Section>
      {top === undefined ? null : (
        <Section
          title={`${top.name} ran ${percent(top.share)} of the ${dollars(wallet.ran)}`}
          detail="Each bar is what a source ran at API prices; the tick is its monthly price or credit."
        >
          <div className="grid items-center gap-8 lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
            <Donut wallet={wallet} />
            <Table wallet={wallet} />
          </div>
          <p className="mt-5 border-t pt-4 text-xs text-muted-foreground">{footnote(wallet)}</p>
        </Section>
      )}
    </>
  );
};
