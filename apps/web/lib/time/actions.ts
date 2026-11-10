"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";

import { zoneCookie, zoneOf } from "@/lib/time/zone";

const year = 365 * 24 * 60 * 60;

export const saveZone = async (name: string) => {
  if (zoneOf(name) === null) {
    return;
  }

  const jar = await cookies();

  jar.set(zoneCookie, name, { httpOnly: true, maxAge: year, path: "/", sameSite: "lax" });
  refresh();
};
