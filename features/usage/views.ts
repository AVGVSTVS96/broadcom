export const views = [
  { id: "spend", label: "Spend" },
  { id: "wallet", label: "Wallet" },
] as const;

export type View = (typeof views)[number]["id"];

export const viewOf = (value: string | string[] | undefined): View =>
  views.find((view) => view.id === value)?.id ?? "spend";
