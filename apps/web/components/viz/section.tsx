import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export const Section = ({
  title,
  detail,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  detail?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) => (
  <section className={cn("rounded-3xl border bg-card p-5 sm:p-6", className)}>
    <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h2 className="text-xl font-medium tracking-tight text-balance">{title}</h2>
        {detail === undefined ? null : (
          <p className="text-sm text-pretty text-muted-foreground">{detail}</p>
        )}
      </div>
      {actions}
    </header>
    {children}
  </section>
);
