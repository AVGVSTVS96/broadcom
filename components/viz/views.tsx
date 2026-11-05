import Link from "next/link";

import { cn } from "@/lib/utils";

export const Views = <View extends string>({
  views,
  current,
  param = "view",
}: {
  views: readonly { id: View; label: string }[];
  current: View;
  param?: string;
}) => (
  <nav className="flex rounded-full bg-muted p-1 text-sm max-sm:grid max-sm:w-full max-sm:auto-cols-fr max-sm:grid-flow-col max-sm:text-[13px]">
    {views.map((view, index) => (
      <Link
        key={view.id}
        href={index === 0 ? "?" : `?${param}=${view.id}`}
        replace
        scroll={false}
        aria-current={view.id === current ? "page" : undefined}
        className={cn(
          "rounded-full px-3.5 py-1 text-center whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground max-sm:px-1",
          view.id === current && "bg-card text-foreground shadow-xs"
        )}
      >
        {view.label}
      </Link>
    ))}
  </nav>
);
