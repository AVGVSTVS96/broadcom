const levels = [
  "bg-track",
  "bg-foreground/20",
  "bg-foreground/35",
  "bg-foreground/55",
  "bg-foreground/80",
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
