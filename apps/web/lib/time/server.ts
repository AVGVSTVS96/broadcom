import "server-only";
import { cookies } from "next/headers";

import { hostZone, zoneCookie, zoneOf } from "@/lib/time/zone";

export const readZone = async () => {
  const jar = await cookies();
  const saved = jar.get(zoneCookie)?.value;

  return { saved, zone: zoneOf(saved) ?? hostZone() };
};
