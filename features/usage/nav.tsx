"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  use,
  useMemo,
  useOptimistic,
  useTransition,
} from "react";
import type { ReactNode } from "react";

export type Patch = Readonly<Record<string, string | null>>;

interface Nav {
  readonly pending: boolean;
  readonly params: URLSearchParams;
  readonly go: (patch: Patch) => void;
}

const NavContext = createContext<Nav | null>(null);

export const UsageNav = ({ children }: { children: ReactNode }) => {
  const router = useRouter();
  const path = usePathname();
  const current = useSearchParams().toString();
  const [shown, show] = useOptimistic(current);
  const [pending, start] = useTransition();

  const nav = useMemo(() => {
    const go = (patch: Patch) => {
      const next = new URLSearchParams(shown);

      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === "") {
          next.delete(key);
        } else {
          next.set(key, value);
        }
      }

      const query = next.toString();

      start(() => {
        show(query);
        router.push(query === "" ? path : `${path}?${query}`, {
          scroll: false,
        });
      });
    };

    return { go, params: new URLSearchParams(shown), pending };
  }, [shown, pending, path, router, show]);

  return (
    <NavContext value={nav}>
      <div
        aria-busy={pending}
        className="space-y-5 transition-opacity duration-300 aria-busy:opacity-60 aria-busy:delay-150"
      >
        {children}
      </div>
    </NavContext>
  );
};

export const useNav = () => {
  const nav = use(NavContext);

  if (nav === null) {
    throw new Error("useNav needs a UsageNav above it");
  }

  return nav;
};
