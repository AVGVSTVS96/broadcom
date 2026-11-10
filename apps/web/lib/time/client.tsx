"use client";

import { createContext, use } from "react";
import type { ReactNode } from "react";

import { useImperative } from "@/lib/outside";
import { saveZone } from "@/lib/time/actions";
import { hostZone, timeIn } from "@/lib/time/zone";
import type { Time } from "@/lib/time/zone";

const ZoneContext = createContext<string | null>(null);

export const ZoneProvider = ({
  zone,
  saved,
  children,
}: {
  zone: string;
  saved: string | undefined;
  children: ReactNode;
}) => {
  useImperative(() => {
    const viewer = hostZone();

    if (viewer !== zone && viewer !== saved) {
      void saveZone(viewer);
    }
  }, [zone, saved]);

  return <ZoneContext value={zone}>{children}</ZoneContext>;
};

export const useTime = (): Time => {
  const zone = use(ZoneContext);

  if (zone === null) {
    throw new Error("useTime needs a ZoneProvider above it");
  }

  return timeIn(zone);
};
