import { ArrowUpRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";

import { Section } from "@/components/viz/section";
import {
  ConnectButton,
  DeployButton,
  SourceFiles,
} from "@/features/executor/parts";
import { executorUrl, readOverview, readSource } from "@/lib/executor/api";
import {
  healthOf,
  needs,
  releasesBehind,
  sameSource,
  shortRelease,
} from "@/lib/model/executor";
import type { ExecutorApp, Health } from "@/lib/model/executor";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Executor" };

const healthWords = new Map<Health, string>([
  ["failing", "failing"],
  ["healthy", "healthy"],
  ["missing", "no account linked"],
  ["unchecked", "never checked"],
]);

const Dot = ({ health }: { health: Health }) => (
  <span
    aria-hidden
    className={cn(
      "size-2 shrink-0 rounded-full",
      health === "healthy" && "bg-ok",
      health === "unchecked" && "bg-faint",
      (health === "failing" || health === "missing") && "bg-bad"
    )}
  />
);

const day = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
});

const onDay = (at: string | null) =>
  at === null ? null : day.format(new Date(at));

const plural = (value: number, word: string) =>
  `${value} ${word}${value === 1 ? "" : "s"}`;

const OpenExecutor = () => (
  <a
    href={executorUrl}
    target="_blank"
    rel="noopener noreferrer"
    className="flex h-8 items-center gap-1 rounded-lg px-3 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
  >
    Open Executor
    <ArrowUpRightIcon className="size-3.5" />
  </a>
);

const AppCard = ({
  app,
  framework,
  current,
}: {
  app: ExecutorApp;
  framework: string | null;
  current: boolean;
}) => {
  const behind = releasesBehind(app, framework);
  const deployed = onDay(app.deployedAt);

  return (
    <li>
      <Link
        href={`/executor/${app.slug}`}
        aria-current={current ? "page" : undefined}
        className="flex h-full flex-col gap-3 rounded-2xl bg-muted/60 p-4 ring-foreground/20 hover:bg-muted aria-[current=page]:ring-2"
      >
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-medium">
            {app.name}
          </span>
          <Dot health={app.running ? "healthy" : "unchecked"} />
          <span className="text-xs text-muted-foreground">
            {app.running ? "Running" : "Not deployed"}
          </span>
        </span>
        <ul className="space-y-1 text-sm">
          {needs(app).map((need) => (
            <li
              key={`${need.requirement}:${need.label}`}
              className="flex items-center gap-2"
            >
              <Dot health={need.health} />
              <span className="min-w-0 flex-1 truncate">
                {need.label ?? need.requirement}
              </span>
              {need.health !== "healthy" && (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {healthWords.get(need.health)}
                </span>
              )}
            </li>
          ))}
          {app.requirements.length === 0 && (
            <li className="text-muted-foreground">Signs in to nothing</li>
          )}
        </ul>
        <span className="mt-auto flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>
            {deployed === null ? "Never deployed" : `Deployed ${deployed}`}
            {app.versions > 1 && ` · ${plural(app.versions, "version")}`}
          </span>
          {app.pinned !== null && (
            <span className={cn(behind > 0 && "text-over")}>
              apps@{shortRelease(app.pinned)}
              {behind > 0 && `, ${plural(behind, "release")} behind`}
            </span>
          )}
          {!app.local && <span>Source only in Executor</span>}
        </span>
      </Link>
    </li>
  );
};

const Accounts = ({ app }: { app: ExecutorApp }) => (
  <Section
    title={`${app.name}'s accounts`}
    detail="Each one is a sign-in the app acts through."
  >
    <ul className="divide-y rounded-2xl border">
      {app.requirements.map((requirement) => {
        const linked = app.accounts.filter(
          (account) => account.requirement === requirement
        );

        return (
          <li
            key={requirement}
            className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3 text-sm"
          >
            <span className="shrink-0 pt-0.5 font-mono text-[13px] text-muted-foreground max-sm:flex-1 sm:w-24">
              {requirement}
            </span>
            <ul className="min-w-0 flex-1 space-y-1 max-sm:order-last max-sm:basis-full">
              {linked.map((account) => {
                const health = healthOf(account.health);
                const checked = onDay(account.checkedAt);

                return (
                  <li
                    key={account.label}
                    className="flex flex-wrap items-center gap-x-2"
                  >
                    <Dot health={health} />
                    <span className="min-w-0 break-all">{account.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {healthWords.get(health)}
                      {checked !== null && `, checked ${checked}`}
                    </span>
                  </li>
                );
              })}
              {linked.length === 0 && (
                <li className="flex items-center gap-2 text-muted-foreground">
                  <Dot health="missing" />
                  No account linked yet
                </li>
              )}
            </ul>
            <ConnectButton
              slug={app.slug}
              requirement={requirement}
              another={linked.length > 0}
            />
          </li>
        );
      })}
      {app.requirements.length === 0 && (
        <li className="px-4 py-3 text-sm text-muted-foreground">
          {app.name} signs in to nothing.
        </li>
      )}
    </ul>
  </Section>
);

const Failed = ({ reason }: { reason: string }) => (
  <Section
    title="Executor didn't answer"
    detail={reason}
    actions={<OpenExecutor />}
  >
    {null}
  </Section>
);

const Source = async ({ app }: { app: ExecutorApp }) => {
  if (!app.local) {
    return (
      <Section
        title={`${app.name}'s source lives only in Executor`}
        detail={`There's no copy in executor-apps/${app.slug}, so edit it in Executor.`}
        actions={<OpenExecutor />}
      >
        {null}
      </Section>
    );
  }

  const read = await readSource(app.slug);

  if (!read.ok) {
    return <Failed reason={read.reason} />;
  }

  const files = read.value;

  const differ = files.filter((file) => !sameSource(file)).length;

  return (
    <Section
      title={
        differ === 0
          ? `All ${files.length} files match what runs`
          : `${differ} of ${files.length} files differ from what runs`
      }
      detail={`Your copy in executor-apps/${app.slug}, against the version Executor runs.`}
      actions={
        differ > 0 && (
          <DeployButton slug={app.slug} name={app.name} differ={differ} />
        )
      }
    >
      <SourceFiles slug={app.slug} files={files} />
    </Section>
  );
};

const ExecutorPage = async ({ params }: PageProps<"/executor/[[...slug]]">) => {
  await connection();
  const { slug = [] } = await params;

  const overview = await readOverview();

  if (!overview.ok) {
    return <Failed reason={overview.reason} />;
  }

  const { apps, framework } = overview.value;
  const app = apps.find((each) => each.slug === slug.at(0)) ?? apps.at(0);

  const unhealthy = apps
    .flatMap(needs)
    .filter((need) => need.health !== "healthy");

  const behind = apps.filter((each) => releasesBehind(each, framework) > 0);

  return (
    <div className="space-y-4">
      <Section
        title={[
          `${plural(apps.filter((each) => each.running).length, "app")} running`,
          unhealthy.length === 0
            ? "every account healthy"
            : `${unhealthy.length} ${unhealthy.length === 1 ? "account needs" : "accounts need"} you`,
        ].join(", ")}
        detail={
          framework === null
            ? undefined
            : [
                `The host runs apps@${shortRelease(framework)}.`,
                behind.length > 0 &&
                  `${behind.map((each) => each.name).join(" and ")} ${behind.length === 1 ? "is" : "are"} built on an older release.`,
              ]
                .filter(Boolean)
                .join(" ")
        }
        actions={<OpenExecutor />}
      >
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {apps.map((each) => (
            <AppCard
              key={each.id}
              app={each}
              framework={framework}
              current={each.slug === app?.slug}
            />
          ))}
        </ul>
      </Section>
      {app !== undefined && (
        <>
          <Accounts app={app} />
          <Source app={app} />
        </>
      )}
    </div>
  );
};

export default ExecutorPage;
