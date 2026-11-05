export const views = [
  { id: "timeline", label: "Timeline" },
  { id: "weeks", label: "Weeks" },
  { id: "activity", label: "Activity" },
  { id: "hand-off", label: "Hand-off" },
] as const;

export type View = (typeof views)[number]["id"];

export const viewOf = (value: string | string[] | undefined): View =>
  views.find((view) => view.id === value)?.id ?? "timeline";
