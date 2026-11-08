"use server";

import { readSides } from "@/lib/files/read";
import { findWorkspace } from "@/lib/files/repos";

export const loadSides = async (ws: string, file: string, sha: string) => {
  const found = await findWorkspace(ws);

  return found === null ? null : await readSides(found, file, sha);
};
