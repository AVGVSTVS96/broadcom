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

const Meta = ({
  app,
  framework,
}: {
  app: ExecutorApp;
  framework: string | null;
}) => {
  const behind = releasesBehind(app, framework);
  const deployed = onDay(app.deployedAt);

  return (
    <div className="text-xs text-muted-foreground sm:text-right">
      <div>
        {deployed === null ? "Never deployed" : `Deployed ${deployed}`}
        {app.versions > 1 && ` · ${plural(app.versions, "version")}`}
      </div>
      {app.pinned !== null && (
        <div className={cn(behind > 0 && "text-over")}>
          apps@{shortRelease(app.pinned)}
          {behind > 0 && `, ${plural(behind, "release")} behind`}
        </div>
      )}
      {!app.local && <div>Source only in Executor</div>}
    </div>
  );
};

const AppRow = ({
  app,
  framework,
  current,
}: {
  app: ExecutorApp;
  framework: string | null;
  current: boolean;
}) => (
  <li
    aria-current={current ? "true" : undefined}
    className="grid gap-x-6 gap-y-2 py-4 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-start"
  >
    <div className="flex min-w-0 items-center gap-2">
      <Dot health={app.running ? "healthy" : "unchecked"} />
      {app.local ? (
        <Link
          href={`/executor/${app.slug}`}
          className={cn(
            "truncate underline-offset-4 hover:underline",
            current && "underline decoration-foreground/30"
          )}
        >
          {app.name}
        </Link>
      ) : (
        <span className="truncate">{app.name}</span>
      )}
      {!app.running && (
        <span className="text-xs text-muted-foreground">Not deployed</span>
      )}
    </div>
    <ul className="min-w-0 space-y-1.5 text-sm">
      {needs(app).map((need) => (
        <li
          key={`${need.requirement}:${need.label}`}
          className="flex min-w-0 items-center gap-2"
        >
          <Dot health={need.health} />
          <span className="min-w-0 truncate">
            {need.label ?? need.requirement}
          </span>
          {need.health !== "healthy" && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {healthWords.get(need.health)}
            </span>
          )}
          {(need.health === "missing" || need.health === "failing") && (
            <span className="ml-auto sm:ml-2">
              <ConnectButton
                slug={app.slug}
                requirement={need.requirement}
                another={false}
              />
            </span>
          )}
        </li>
      ))}
      {app.requirements.length === 0 && (
        <li className="text-muted-foreground">Signs in to nothing</li>
      )}
    </ul>
    <Meta app={app} framework={framework} />
  </li>
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
          ? `${app.name}: all ${files.length} files match what runs`
          : `${app.name}: ${differ} of ${files.length} files differ from what runs`
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
  const local = apps.filter((each) => each.local);
  const app = local.find((each) => each.slug === slug.at(0)) ?? local.at(0);

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
        <ul className="divide-y border-t">
          {apps.map((each) => (
            <AppRow
              key={each.id}
              app={each}
              framework={framework}
              current={each.slug === app?.slug}
            />
          ))}
        </ul>
      </Section>
      {app !== undefined && <Source app={app} />}
    </div>
  );
};

export default ExecutorPage;
