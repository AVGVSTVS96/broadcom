import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { HistoryView } from "@/features/files/history-view";
import { listCommits, readCommit } from "@/lib/files/read";
import { findWorkspace } from "@/lib/files/repos";

export const metadata: Metadata = { title: "History" };

const lineCounts = (patch: string) => {
  let added = 0;
  let removed = 0;

  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++ ")) {
      added += 1;
    } else if (line.startsWith("-") && !line.startsWith("--- ")) {
      removed += 1;
    }
  }

  return { added, removed };
};

const HistoryPage = async ({
  params,
  searchParams,
}: PageProps<"/files/[ws]/history/[[...sha]]">) => {
  await connection();
  const { ws: id, sha = [] } = await params;
  const { path } = await searchParams;
  const ws = await findWorkspace(decodeURIComponent(id));

  if (ws === null) {
    notFound();
  }

  const [file = ""] = [path ?? ""].flat();
  const commits = await listCommits(ws, file === "" ? null : file);
  const wanted = sha[0] ?? commits[0]?.sha ?? "";
  const detail = wanted === "" ? null : await readCommit(ws, wanted);

  return (
    <HistoryView
      ws={ws.id}
      path={file}
      commits={commits}
      picked={detail?.commit ?? null}
      patch={detail?.patch ?? ""}
      {...lineCounts(detail?.patch ?? "")}
      now={Date.now()}
    />
  );
};

export default HistoryPage;
