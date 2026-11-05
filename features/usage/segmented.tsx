"use client";

import { Toggle } from "@base-ui/react/toggle";
import { ToggleGroup } from "@base-ui/react/toggle-group";

import { cn } from "@/lib/utils";

export const Segmented = <T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
  className?: string;
}) => (
  <ToggleGroup
    aria-label={label}
    value={[value]}
    onValueChange={(next: T[]) => {
      const [picked] = next;

      if (picked !== undefined) {
        onChange(picked);
      }
    }}
    className={cn(
      "flex w-fit max-w-full [scrollbar-width:none] overflow-x-auto rounded-full bg-muted p-1",
      className
    )}
  >
    {options.map(([option, name]) => (
      <Toggle
        key={option}
        value={option}
        className="shrink-0 rounded-full px-2.5 py-1 text-sm whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring data-pressed:bg-card data-pressed:text-foreground data-pressed:shadow-xs max-sm:py-2 sm:px-3"
      >
        {name}
      </Toggle>
    ))}
  </ToggleGroup>
);
