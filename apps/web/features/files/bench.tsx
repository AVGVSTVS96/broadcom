"use client";

import { PanelLeftIcon } from "lucide-react";
import { usePathname } from "next/navigation";
import { createContext, use, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const narrowQuery = "(max-width: 767px)";

const subscribe = (change: () => void) => {
  const query = window.matchMedia(narrowQuery);

  query.addEventListener("change", change);

  return () => {
    query.removeEventListener("change", change);
  };
};

const useNarrow = () =>
  useSyncExternalStore(
    subscribe,
    () => window.matchMedia(narrowQuery).matches,
    () => false,
  );

interface BenchState {
  readonly narrow: boolean;
  readonly sideOpen: boolean;
  readonly setSideOpen: (open: boolean) => void;
  readonly slot: HTMLElement | null;
  readonly setSlot: (slot: HTMLElement | null) => void;
}

const BenchContext = createContext<BenchState | null>(null);

const useBench = () => {
  const bench = use(BenchContext);

  if (bench === null) {
    throw new Error("Files parts need a Bench above them");
  }

  return bench;
};

export const Bench = ({ children }: { children: ReactNode }) => {
  const narrow = useNarrow();
  const pathname = usePathname();
  const [sheetAt, setSheetAt] = useState<string | null>(null);
  const [sideHidden, setSideHidden] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  const bench = useMemo(
    () => ({
      narrow,
      setSideOpen: (open: boolean) => {
        if (narrow) {
          setSheetAt(open ? pathname : null);
        } else {
          setSideHidden(!open);
        }
      },
      setSlot,
      sideOpen: narrow ? sheetAt === pathname : !sideHidden,
      slot,
    }),
    [narrow, pathname, sheetAt, sideHidden, slot],
  );

  return (
    <BenchContext value={bench}>
      <div className="flex h-[calc(100dvh-9.5rem)] min-h-96 flex-col overflow-hidden rounded-3xl border bg-card sm:h-[calc(100dvh-8.5rem)]">
        {children}
      </div>
    </BenchContext>
  );
};

export const SideToggle = ({ label }: { label: string }) => {
  const { sideOpen, setSideOpen } = useBench();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-expanded={sideOpen}
      aria-label={sideOpen ? `Hide ${label}` : `Show ${label}`}
      onClick={() => {
        setSideOpen(!sideOpen);
      }}
    >
      <PanelLeftIcon />
    </Button>
  );
};

export const Side = ({ title, children }: { title: string; children: ReactNode }) => {
  const { narrow, sideOpen, setSideOpen } = useBench();

  if (narrow) {
    return (
      <Sheet open={sideOpen} onOpenChange={setSideOpen}>
        <SheetContent
          side="left"
          initialFocus={false}
          className="w-[85vw] gap-0 p-0 pt-[env(safe-area-inset-top)]"
        >
          <SheetTitle className="px-4 pt-4 pb-2 text-sm">{title}</SheetTitle>
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <aside
      className={cn(
        "flex w-72 shrink-0 flex-col border-r max-md:hidden lg:w-80",
        !sideOpen && "hidden",
      )}
    >
      {children}
    </aside>
  );
};

export const ToolSlot = () => {
  const { setSlot } = useBench();

  return <div ref={setSlot} className="ml-auto flex items-center gap-1 max-md:hidden" />;
};

export const Tools = ({ children }: { children: ReactNode }) => {
  const { narrow, slot } = useBench();

  if (narrow) {
    return <div className="ml-auto flex shrink-0 items-center gap-1">{children}</div>;
  }

  return slot === null ? null : createPortal(children, slot);
};

export const usePickedInSide = () => {
  const { narrow, setSideOpen } = useBench();

  return () => {
    if (narrow) {
      setSideOpen(false);
    }
  };
};
