import { notFound } from "next/navigation";

import { Bench } from "@/features/files/bench";
import { FilesBar } from "@/features/files/files-bar";
import { readChanges } from "@/lib/files/read";
import { findWorkspace, listDrafts, listPlaces } from "@/lib/files/repos";
import { RefreshOn } from "@/lib/watch/refresh-on";

const FilesLayout = async ({ params, children }: LayoutProps<"/files/[ws]">) => {
  const { ws: id } = await params;
  const ws = await findWorkspace(decodeURIComponent(id));

  if (ws === null) {
    notFound();
  }

  const [repos, changes, drafts] = await Promise.all([listPlaces(), readChanges(ws), listDrafts()]);

  return (
    <Bench>
      <FilesBar repos={repos} changed={changes.files.length} drafts={drafts.length} />
      <div className="flex min-h-0 flex-1">{children}</div>
      <RefreshOn src={`/api/files/watch?ws=${encodeURIComponent(ws.id)}`} />
    </Bench>
  );
};

export default FilesLayout;
