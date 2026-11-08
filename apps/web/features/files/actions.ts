"use server";

import { readSides } from "@/lib/git/read";
import { findWorkspace } from "@/lib/git/repos";

export const loadSides = async (ws: string, file: string, sha: string) => {
  const found = await findWorkspace(ws);

  return found === null ? null : await readSides(found, file, sha);
};
