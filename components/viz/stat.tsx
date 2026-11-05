import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Stat = ({
  label,
  hint,
  value,
  unit,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: ReactNode;
  unit?: ReactNode;
  children?: ReactNode;
  className?: string;
}) => (
  <div className={cn("min-w-0 space-y-2", className)}>
    <div className="text-sm">
      {label}
      {hint === undefined ? null : (
        <span className="ml-1.5 text-muted-foreground">{hint}</span>
      )}
    </div>
    <div className="flex items-baseline gap-1">
      <span className="text-4xl font-normal tracking-tight tabular-nums">
        {value}
      </span>
      {unit === undefined ? null : (
        <span className="text-sm text-muted-foreground">{unit}</span>
      )}
    </div>
    {children}
  </div>
);
