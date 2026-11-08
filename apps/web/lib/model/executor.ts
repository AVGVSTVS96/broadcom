export type Health = "healthy" | "unchecked" | "failing" | "missing";

export interface ExecutorAccount {
  readonly requirement: string;
  readonly label: string;
  readonly health: string | null;
  readonly checkedAt: string | null;
}

export interface ExecutorApp {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly running: boolean;
  readonly deployedAt: string | null;
  readonly versions: number;
  readonly local: boolean;
  readonly pinned: string | null;
  readonly requirements: readonly string[];
  readonly accounts: readonly ExecutorAccount[];
}

export interface ExecutorOverview {
  readonly framework: string | null;
  readonly apps: readonly ExecutorApp[];
}

export interface SourceFile {
  readonly path: string;
  readonly deployed: string | null;
  readonly local: string | null;
}

export interface Need {
  readonly requirement: string;
  readonly label: string | null;
  readonly health: Health;
  readonly checkedAt: string | null;
}

const releaseNumber = (version: string | null) => {
  const found = version === null ? null : /(?<n>\d+)$/u.exec(version);

  return found?.groups?.n === undefined ? null : Number(found.groups.n);
};

export const releasesBehind = (app: ExecutorApp, framework: string | null) => {
  const pinned = releaseNumber(app.pinned);
  const host = releaseNumber(framework);

  if (pinned === null || host === null || app.pinned === framework) {
    return 0;
  }

  return Math.max(0, host - pinned);
};

export const shortRelease = (version: string) =>
  version.replace(/^0\.0\.1-/u, "");

export const healthOf = (health: string | null): Health => {
  if (health === null) {
    return "unchecked";
  }

  return health === "healthy" ? "healthy" : "failing";
};

export const needs = (app: ExecutorApp): Need[] =>
  app.requirements.flatMap((requirement): Need[] => {
    const linked = app.accounts.filter(
      (account) => account.requirement === requirement
    );

    if (linked.length === 0) {
      return [
        {
          checkedAt: null,
          health: "missing",
          label: null,
          requirement,
        },
      ];
    }

    return linked.map((account) => ({
      checkedAt: account.checkedAt,
      health: healthOf(account.health),
      label: account.label,
      requirement,
    }));
  });

export const sameSource = (file: SourceFile) =>
  file.local !== null &&
  file.deployed !== null &&
  file.local.trimEnd() === file.deployed.trimEnd();
