import type { ReactNode } from "react";

import { Segments } from "@/components/viz/segments";
import { plural, resetExpiry, when } from "@/features/accounts/format";
import { creditTotals, hasRoom, resets, week } from "@/lib/model/accounts";
import type { Row } from "@/lib/model/accounts";
import { dollars } from "@/lib/model/format";

const Cell = ({
  name,
  count,
  label,
  value,
  unit,
  children,
}: {
  name: string;
  count: string;
  label: string;
  value: ReactNode;
  unit?: string;
  children: ReactNode;
}) => (
  <div className="min-w-0 space-y-3 bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
      <span className="font-medium">{name}</span>
      <span className="text-sm text-muted-foreground">{count}</span>
    </div>
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="flex items-baseline gap-1.5">
        <span className="text-2xl tracking-tight tabular-nums sm:text-3xl">
          {value}
        </span>
        {unit === undefined ? null : (
          <span className="text-sm text-muted-foreground">{unit}</span>
        )}
      </p>
    </div>
    {children}
  </div>
);

export const Ledger = ({
  rows,
  now,
}: {
  rows: readonly Row[];
  now: number;
}) => {
  const plans = rows.filter((row) => row.kind === "plan");
  const credit = creditTotals(rows);
  const banked = resets(rows, now - week);
  const chatgpt = rows.filter((row) => row.kind === "chatgpt");

  const used = plans.reduce(
    (sum, row) => sum + (row.account?.week.used ?? 0),
    0
  );

  const locked = plans.filter((row) => row.state.is === "limited");

  const back = locked.flatMap((row) =>
    row.state.is === "limited" && row.state.until !== null
      ? [row.state.until]
      : []
  );

  return (
    <section
      aria-label="Pool totals"
      className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border bg-border lg:grid-cols-4"
    >
      <Cell
        name="Claude plans"
        count={plural(plans.length, "plan")}
        label="Used this week"
        value={`${Math.round(used)}%`}
        unit={`of ${plans.length * 100}%`}
      >
        <Segments
          parts={plans.map((row) => ({
            id: row.key,
            label: row.name,
            locked: row.state.is === "limited",
            value: row.account?.week.used ?? 0,
          }))}
        />
        <p className="text-sm text-muted-foreground">
          {back.length === 0
            ? `${plans.filter(hasRoom).length} of ${plans.length} have room`
            : `${locked.length} locked · first back ${when(Math.min(...back), now)}`}
        </p>
      </Cell>
      <Cell
        name="API credit"
        count={plural(credit.count, "key")}
        label="Left"
        value={dollars(credit.remaining)}
        unit={`of ${dollars(credit.allowance)}`}
      >
        <Segments
          parts={rows.flatMap((row) =>
            row.credit === null
              ? []
              : [
                  {
                    id: row.key,
                    label: `${row.name} left`,
                    tone: row.state.is === "empty" ? "bad" : "ok",
                    value:
                      (Math.max(0, row.credit.remaining) /
                        row.credit.allowance) *
                      100,
                  },
                ]
          )}
        />
        <p className="text-sm text-muted-foreground">
          {credit.empty === credit.count && credit.count > 0
            ? "All empty · estimate"
            : `${credit.count - credit.empty} with credit · estimate`}
        </p>
      </Cell>
      <Cell
        name="Resets"
        count={`${banked.spent.length} spent this week`}
        label="Banked"
        value={banked.held}
        unit="full resets"
      >
        <p className="text-sm text-muted-foreground">
          {resetExpiry(banked.held, banked.firstExpiry, now)}
        </p>
        {banked.plans.map((plan) => (
          <p key={plan} className="text-sm">
            {plan}
          </p>
        ))}
      </Cell>
      <Cell
        name="ChatGPT"
        count={plural(chatgpt.length, "account")}
        label="Has room"
        value={chatgpt.length === 0 ? "—" : chatgpt.filter(hasRoom).length}
        unit={chatgpt.length === 0 ? undefined : `of ${chatgpt.length}`}
      >
        {chatgpt.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None yet. Add one above.
          </p>
        ) : (
          <Segments
            parts={chatgpt.map((row) => ({
              id: row.key,
              label: row.name,
              tone: hasRoom(row) ? "ok" : "bad",
              value: 100,
            }))}
          />
        )}
      </Cell>
    </section>
  );
};
