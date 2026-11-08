"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useOptimistic, useTransition } from "react";
import type { MouseEvent } from "react";

import { cn } from "@/lib/utils";

export const Views = <View extends string>({
  views,
  current,
  param = "view",
}: {
  views: readonly { id: View; label: string }[];
  current: View;
  param?: string;
}) => {
  const router = useRouter();
  const [shown, show] = useOptimistic(current);
  const [pending, start] = useTransition();

  const go = (event: MouseEvent, id: View, href: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) {
      return;
    }

    event.preventDefault();

    start(() => {
      show(id);
      router.replace(href, { scroll: false });
    });
  };

  return (
    <nav
      aria-busy={pending}
      className="flex w-fit rounded-full bg-muted p-1 text-sm max-sm:grid max-sm:w-full max-sm:auto-cols-fr max-sm:grid-flow-col max-sm:text-[13px]"
    >
      {views.map((view, index) => {
        const href = index === 0 ? "?" : `?${param}=${view.id}`;

        return (
          <Link
            key={view.id}
            href={href}
            replace
            scroll={false}
            onClick={(event) => {
              go(event, view.id, href);
            }}
            aria-current={view.id === shown ? "page" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1 text-center whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground max-sm:px-1 max-sm:py-2.5",
              view.id === shown && "bg-card text-foreground shadow-xs",
            )}
          >
            {view.label}
          </Link>
        );
      })}
    </nav>
  );
};
