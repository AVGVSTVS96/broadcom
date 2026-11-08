const units: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31_536_000_000],
  ["month", 2_592_000_000],
  ["week", 604_800_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

const relative = new Intl.RelativeTimeFormat("en", {
  numeric: "auto",
  style: "short",
});

export const ago = (at: number, now = Date.now()) => {
  const elapsed = now - at;

  const [unit, size] = units.find(([, ms]) => elapsed >= ms) ?? ["minute", 60_000];

  return elapsed < 60_000 ? "now" : relative.format(-Math.floor(elapsed / size), unit);
};

const clock = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
});

export const timeOfDay = (at: number) => clock.format(at);

export const bytes = (size: number) => {
  if (size < 1024) {
    return `${size} B`;
  }

  return size < 1024 ** 2
    ? `${(size / 1024).toFixed(1)} KB`
    : `${(size / 1024 ** 2).toFixed(1)} MB`;
};
