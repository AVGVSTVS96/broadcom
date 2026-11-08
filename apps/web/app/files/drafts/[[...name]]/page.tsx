import { readFile } from "node:fs/promises";

import type { Metadata } from "next";
import Link from "next/link";

import { Bench, Side, Tools } from "@/features/files/bench";
import { FileBar } from "@/features/files/file-bar";
import { FileView } from "@/features/files/file-view";
import { FilesBar } from "@/features/files/files-bar";
import { StylePills } from "@/features/files/style-pills";
import { filesHref } from "@/features/files/urls";
import { readBody } from "@/lib/files/read";
import { findWorkspace, listDrafts, listPlaces } from "@/lib/files/repos";
import type { Draft } from "@/lib/files/repos";

export const metadata: Metadata = { title: "Drafts" };

const liveText = async (draft: Draft) => {
  const ws = draft.target === null ? null : await findWorkspace(draft.target.ws);

  if (ws === null || draft.target === null) {
    return null;
  }

  const body = await readBody(ws, draft.target.file);

  return body.kind === "text" ? body.text : null;
};

const DraftShown = async ({ draft }: { draft: Draft }) => {
  const [text, live] = await Promise.all([
    readFile(/*turbopackIgnore: true*/ draft.file, "utf-8"),
    liveText(draft),
  ]);

  return (
    <>
      <FileBar>
        <span className="shrink-0 font-medium">{draft.name}</span>
        {draft.target !== null && (
          <Link
            href={filesHref.code(draft.target.ws, draft.target.file)}
            className="truncate text-muted-foreground hover:text-foreground"
          >
            replaces {draft.target.ws}/{draft.target.file}
          </Link>
        )}
        {live !== null && (
          <Tools>
            <StylePills />
          </Tools>
        )}
      </FileBar>
      <FileView
        name={draft.target?.file ?? draft.name}
        text={text}
        original={live}
        diff={live !== null}
      />
    </>
  );
};

const DraftsPage = async ({ params }: PageProps<"/files/drafts/[[...name]]">) => {
  const { name = [] } = await params;
  const [repos, drafts] = await Promise.all([listPlaces(), listDrafts()]);
  const wanted = decodeURIComponent(name.join("/"));

  const draft = drafts.find((each) => each.name === wanted) ?? drafts.at(0) ?? null;

  return (
    <Bench>
      <FilesBar repos={repos} changed={0} drafts={drafts.length} />
      <div className="flex min-h-0 flex-1">
        <Side title="Drafts">
          <ol className="min-h-0 flex-1 overflow-auto p-2">
            {drafts.map((each) => (
              <li key={each.name}>
                <Link
                  href={filesHref.drafts(each.name)}
                  aria-current={each.name === draft?.name ? "page" : undefined}
                  className="block rounded-lg px-2 py-1.5 hover:bg-muted aria-[current=page]:bg-accent"
                >
                  <span className="block text-[13px]">{each.name}</span>
                  <span className="block truncate text-xs text-faint">
                    {each.target === null
                      ? "not tied to a file"
                      : `${each.target.ws}/${each.target.file}`}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </Side>
        <div className="flex min-w-0 flex-1 flex-col">
          {draft === null ? (
            <p className="m-auto p-6 text-sm text-muted-foreground">No drafts.</p>
          ) : (
            <DraftShown draft={draft} />
          )}
        </div>
      </div>
    </Bench>
  );
};

export default DraftsPage;
