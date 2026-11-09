import { SearchIcon } from "lucide-react";
import type { ComponentProps } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const SearchInput = ({ className, ...props }: Omit<ComponentProps<"input">, "type">) => (
  <div className={cn("relative w-full", className)}>
    <SearchIcon
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
    />
    <Input type="search" className="h-9 rounded-full border-transparent bg-muted pl-9 dark:bg-muted" {...props} />
  </div>
);
