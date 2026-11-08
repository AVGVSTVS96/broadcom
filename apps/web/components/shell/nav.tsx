"use client";

import { ChevronDownIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLinkItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const groups = [
  [
    { href: "/", name: "Overview" },
    { href: "/limits", name: "Limits" },
    { href: "/usage", name: "Usage" },
    { href: "/live", name: "Live" },
    { href: "/accounts", name: "Accounts" },
  ],
  [
    { href: "/files", name: "Files" },
    { href: "/plugins", name: "Plugins" },
    { href: "/executor", name: "Executor" },
  ],
  [{ href: "/settings", name: "Settings" }],
] as const;

const isCurrent = (href: string, path: string) =>
  href === "/" ? path === "/" : path.startsWith(href);

export const Nav = () => {
  const path = usePathname();
  const here = groups.flat().find((page) => isCurrent(page.href, path));

  return (
    <>
      <nav className="-mx-1 hidden items-center rounded-full bg-muted p-1 md:flex">
        {groups.map((group, index) => (
          <Fragment key={group[0].href}>
            {index > 0 && (
              <span aria-hidden className="mx-1 h-4 w-px bg-border" />
            )}
            {group.map((page) => (
              <Link
                key={page.href}
                href={page.href}
                aria-current={isCurrent(page.href, path) ? "page" : undefined}
                className="shrink-0 rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground aria-[current=page]:bg-card aria-[current=page]:text-foreground aria-[current=page]:shadow-xs"
              >
                {page.name}
              </Link>
            ))}
          </Fragment>
        ))}
      </nav>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-full bg-muted py-1.5 pr-3 pl-4 text-sm md:hidden">
          {here?.name ?? "Pages"}
          <ChevronDownIcon className="size-3.5 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          {groups.map((group, index) => (
            <DropdownMenuGroup key={group[0].href}>
              {index > 0 && <DropdownMenuSeparator />}
              {group.map((page) => (
                <DropdownMenuLinkItem
                  key={page.href}
                  render={<Link href={page.href} />}
                  aria-current={isCurrent(page.href, path) ? "page" : undefined}
                  className="py-2 text-[15px] aria-[current=page]:bg-accent"
                >
                  {page.name}
                </DropdownMenuLinkItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};
