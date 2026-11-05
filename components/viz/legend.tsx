import type { ReactNode } from "react";

import { hatchStyle } from "@/components/viz/hatch";
import { cn } from "@/lib/utils";

export type Key = "line" | "dash" | "dot" | "hatch" | "box" | "hollow";

const keys = {
  box: <span className="size-2.5 rounded-[3px] bg-current" />,
  dash: <span className="w-4 border-t-2 border-dashed border-current" />,
  dot: <span className="size-2.5 rounded-full bg-bad" />,
  hatch: <span className="h-2.5 w-4 rounded-[2px]" style={hatchStyle} />,
  hollow: <span className="size-2.5 rounded-full border-2 border-current" />,
  line: <span className="w-4 border-t-2 border-current" />,
} as const satisfies Record<Key, ReactNode>;

export const Legend = ({
  items,
  className,
}: {
  items: readonly { key: Key; label: string; className?: string }[];
  className?: string;
}) => (
  <ul
    className={cn(
      "flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted-foreground",
      className
    )}
  >
    {items.map((item) => (
      <li key={item.label} className="flex items-center gap-2">
        <span
          aria-hidden
          className={cn("flex items-center text-foreground", item.className)}
        >
          {keys[item.key]}
        </span>
        {item.label}
      </li>
    ))}
  </ul>
);
