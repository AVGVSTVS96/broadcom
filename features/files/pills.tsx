import Link from "next/link";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Pills = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <nav
    aria-label={label}
    className="flex shrink-0 items-center rounded-full bg-muted p-0.5"
  >
    {children}
  </nav>
);

const pill = (current: boolean) =>
  cn(
    "flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] text-muted-foreground transition-colors hover:text-foreground",
    current && "bg-card text-foreground shadow-xs"
  );

export const PillLink = ({
  href,
  current,
  replace = false,
  children,
}: {
  href: string;
  current: boolean;
  replace?: boolean;
  children: ReactNode;
}) => (
  <Link
    href={href}
    replace={replace}
    scroll={false}
    aria-current={current ? "page" : undefined}
    className={pill(current)}
  >
    {children}
  </Link>
);

export const PillButton = ({
  current,
  onClick,
  children,
}: {
  current: boolean;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={current}
    onClick={onClick}
    className={pill(current)}
  >
    {children}
  </button>
);

export const Count = ({ children }: { children: ReactNode }) => (
  <span className="text-xs text-muted-foreground tabular-nums">{children}</span>
);
