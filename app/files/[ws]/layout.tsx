import { notFound } from "next/navigation";

import { Bench } from "@/features/files/bench";
import { FilesBar } from "@/features/files/files-bar";
import { Watch } from "@/features/files/watch";
import { readChanges } from "@/lib/git/read";
import { findWorkspace, listRepos, listWorkspaces } from "@/lib/git/repos";

const FilesLayout = async ({
  params,
  children,
}: LayoutProps<"/files/[ws]">) => {
  const { ws: id } = await params;
  const ws = await findWorkspace(decodeURIComponent(id));

  if (ws === null) {
    notFound();
  }

  const [list, changes] = await Promise.all([listRepos(), readChanges(ws)]);

  const repos = await Promise.all(
    list.map(async (repo) => {
      const places = await listWorkspaces(repo);

      return {
        id: repo.id,
        name: repo.name,
        places: places.map((place) => ({
          at: place.at,
          id: place.id,
          live: place.live,
          name: place.name,
        })),
      };
    })
  );

  const changed = changes.files.filter((file) => file.status !== "untracked");

  return (
    <Bench>
      <FilesBar repos={repos} changed={changed.length} />
      <div className="flex min-h-0 flex-1">{children}</div>
      <Watch ws={ws.id} />
    </Bench>
  );
};

export default FilesLayout;
