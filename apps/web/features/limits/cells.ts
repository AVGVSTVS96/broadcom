const levels = [
  "bg-track",
  "bg-foreground/20",
  "bg-foreground/35",
  "bg-foreground/55",
  "bg-foreground/80",
] as const;

const fills = [
  "fill-track",
  "fill-foreground/20",
  "fill-foreground/35",
  "fill-foreground/55",
  "fill-foreground/80",
] as const;

export const steps = [1, 3, 8] as const;

export const planSteps = [0.5, 1.5, 3] as const;

const indexOf = (used: number, scale: readonly number[]) => {
  if (used <= 0.05) {
    return 0;
  }

  const index = scale.findIndex((step) => used <= step);

  return index === -1 ? 4 : index + 1;
};

export const level = (used: number, scale: readonly number[] = steps) =>
  levels[indexOf(used, scale)];

export const fillLevel = (used: number, scale: readonly number[] = steps) =>
  fills[indexOf(used, scale)];

export const legendLevels = levels;
