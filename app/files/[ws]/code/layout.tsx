import { notFound } from "next/navigation";

import { CodeSide } from "@/features/files/code-side";
import { listFiles, readChanges } from "@/lib/git/read";
import { findWorkspace } from "@/lib/git/repos";

const CodeLayout = async ({
  params,
  children,
}: LayoutProps<"/files/[ws]/code">) => {
  const { ws: id } = await params;
  const ws = await findWorkspace(decodeURIComponent(id));

  if (ws === null) {
    notFound();
  }

  const [paths, changes] = await Promise.all([listFiles(ws), readChanges(ws)]);
  const fresh = new Set(changes.fresh);

  return (
    <>
      <CodeSide
        ws={ws.id}
        paths={paths.filter((file) => !fresh.has(file))}
        changes={changes.files}
        fresh={changes.fresh}
      />
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </>
  );
};

export default CodeLayout;
