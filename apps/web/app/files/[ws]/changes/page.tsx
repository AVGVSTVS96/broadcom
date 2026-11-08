import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ChangesView } from "@/features/files/changes-view";
import { patchPath, splitPatch } from "@/lib/files/files";
import { readChanges, readDiff } from "@/lib/files/read";
import { findWorkspace } from "@/lib/files/repos";

export const metadata: Metadata = { title: "Changes" };

const ChangesPage = async ({ params }: PageProps<"/files/[ws]/changes">) => {
  const { ws: id } = await params;
  const ws = await findWorkspace(decodeURIComponent(id));

  if (ws === null) {
    notFound();
  }

  const [changes, diff] = await Promise.all([readChanges(ws), readDiff(ws)]);
  const shown = new Set(splitPatch(diff.patch).map(patchPath));

  const left = [...changes.files.map((file) => file.path), ...changes.fresh].filter(
    (file) => !shown.has(file),
  );

  return (
    <ChangesView
      ws={ws.id}
      where={ws.live ? `${ws.name}, not committed` : `${ws.name} → ${ws.base ?? "detached"}`}
      files={changes.files}
      fresh={changes.fresh}
      patch={diff.patch}
      left={left}
      ahead={changes.ahead}
      behind={changes.behind}
    />
  );
};

export default ChangesPage;
