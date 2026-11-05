import type { Plan as ActivityPlan } from "@/lib/model/activity";
import type { Points } from "@/lib/model/history";
import type { Plan } from "@/lib/model/pool";

const levels = [
  "bg-track",
  "bg-foreground/15",
  "bg-foreground/30",
  "bg-foreground/50",
  "bg-foreground/75",
] as const;

export const steps = [1, 3, 8] as const;

export const level = (used: number) => {
  if (used <= 0.05) {
    return levels[0];
  }

  const index = steps.findIndex((step) => used <= step);

  return levels[index === -1 ? 4 : index + 1];
};

export const legendLevels = levels;

export const activityPlans = (
  plans: readonly Plan[],
  history: Readonly<Record<string, Points>>
): ActivityPlan[] =>
  plans.map((plan) => ({
    cutoff: plan.account.week.cutoff,
    id: plan.id,
    points: history[plan.id] ?? [],
  }));
