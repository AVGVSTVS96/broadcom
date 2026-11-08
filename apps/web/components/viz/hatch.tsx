export const hatchId = "broadcom-hatch";

export const forecastHatchId = "broadcom-hatch-forecast";

export const HatchPattern = () => (
  <defs>
    <pattern
      id={hatchId}
      width="6"
      height="6"
      patternTransform="rotate(45)"
      patternUnits="userSpaceOnUse"
    >
      <rect width="6" height="6" className="fill-bad/15" />
      <line x1="0" y1="0" x2="0" y2="6" className="stroke-bad" strokeWidth="2.5" />
    </pattern>
    <pattern
      id={forecastHatchId}
      width="6"
      height="6"
      patternTransform="rotate(45)"
      patternUnits="userSpaceOnUse"
    >
      <line x1="0" y1="0" x2="0" y2="6" className="stroke-bad/55" strokeWidth="1.5" />
    </pattern>
  </defs>
);

export const hatchStyle = {
  backgroundImage:
    "repeating-linear-gradient(135deg, var(--bad) 0 2px, color-mix(in oklch, var(--bad) 15%, transparent) 2px 6px)",
} as const;

export const forecastHatchStyle = {
  backgroundImage:
    "repeating-linear-gradient(135deg, color-mix(in oklch, var(--bad) 55%, transparent) 0 1.5px, transparent 1.5px 6px)",
  outline: "1px dashed var(--bad)",
  outlineOffset: "-1px",
} as const;
