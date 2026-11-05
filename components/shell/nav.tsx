"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const pages = [
  { href: "/", name: "Overview" },
  { href: "/limits", name: "Limits" },
  { href: "/usage", name: "Usage" },
  { href: "/live", name: "Live" },
  { href: "/accounts", name: "Accounts" },
  { href: "/files", name: "Files" },
  { href: "/settings", name: "Settings" },
] as const;

export const Nav = () => {
  const path = usePathname();

  return (
    <nav className="-mx-1 flex [scrollbar-width:none] overflow-x-auto rounded-full bg-muted p-1">
      {pages.map((page) => {
        const current =
          page.href === "/" ? path === "/" : path.startsWith(page.href);

        return (
          <Link
            key={page.href}
            href={page.href}
            aria-current={current ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
              current && "bg-card text-foreground shadow-xs"
            )}
          >
            {page.name}
          </Link>
        );
      })}
    </nav>
  );
};
