import Link from "next/link";
import type { ReactNode } from "react";

import { filesHref } from "@/features/files/urls";

export const FileBar = ({ children }: { children: ReactNode }) => (
  <div className="flex h-11 shrink-0 items-center gap-3 border-b px-3 text-sm sm:px-4">
    {children}
  </div>
);

export const Crumbs = ({ ws, file }: { ws: string; file: string }) => {
  const parts = file.split("/");

  return (
    <nav
      aria-label="Path"
      className="flex min-w-0 shrink items-center gap-1 overflow-hidden whitespace-nowrap"
    >
      {parts.map((part, index) => {
        const at = parts.slice(0, index + 1).join("/");
        const last = index === parts.length - 1;

        return (
          <span
            key={at}
            className={
              last
                ? "flex max-w-[60%] min-w-0 shrink-0 items-center gap-1"
                : "flex shrink-0 items-center gap-1 max-sm:hidden"
            }
          >
            {index > 0 && <span className="text-faint">/</span>}
            {last ? (
              <span className="truncate font-medium">{part}</span>
            ) : (
              <Link
                href={filesHref.code(ws, at)}
                className="text-muted-foreground hover:text-foreground"
              >
                {part}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
};
