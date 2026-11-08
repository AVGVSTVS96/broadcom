import { FileIcon, FolderIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { Tools } from "@/features/files/bench";
import { CopyButton } from "@/features/files/copy-button";
import { Crumbs, FileBar } from "@/features/files/file-bar";
import { FileView } from "@/features/files/file-view";
import { Markdown } from "@/features/files/markdown";
import { PillLink, Pills } from "@/features/files/pills";
import { ago, bytes } from "@/features/files/time";
import { filesHref } from "@/features/files/urls";
import { lastCommit, listFiles, pictureType, readBody } from "@/lib/git/read";
import type { FileBody } from "@/lib/git/read";
import { findWorkspace } from "@/lib/git/repos";
import type { Workspace } from "@/lib/git/repos";
import { countLines, folderEntries } from "@/lib/model/files";

const overviews = [
  "README.md",
  "readme.md",
  "AGENTS.md",
  "CLAUDE.md",
  "README",
];

type Mode = "preview" | "source" | "diff";

export const generateMetadata = async ({
  params,
}: PageProps<"/files/[ws]/code/[[...path]]">): Promise<Metadata> => {
  const { path = [] } = await params;

  return {
    title: path.length > 0 ? decodeURIComponent(path.join("/")) : "Files",
  };
};

const Note = ({ children }: { children: ReactNode }) => (
  <p className="m-auto p-6 text-center text-sm text-muted-foreground">
    {children}
  </p>
);

const Content = ({
  ws,
  file,
  body,
  mode,
}: {
  ws: Workspace;
  file: string;
  body: Exclude<FileBody, { kind: "folder" }>;
  mode: Mode;
}) => {
  if (body.kind === "text") {
    return mode === "preview" ? (
      <Markdown ws={ws.id} file={file} text={body.text} />
    ) : (
      <FileView
        name={file}
        text={body.text}
        original={body.original}
        diff={mode === "diff"}
      />
    );
  }

  if (body.kind === "binary" && pictureType(file) !== null) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-size-[16px_16px] p-6">
        {/* oxlint-disable-next-line nextjs/no-img-element */}
        <img
          src={filesHref.raw(ws.id, file)}
          alt={file}
          className="max-h-full max-w-full"
        />
      </div>
    );
  }

  const notes = {
    binary: "A binary file.",
    large: "Too large to show here.",
    missing: "This file is gone.",
  };

  return <Note>{notes[body.kind]}</Note>;
};

const Folder = ({
  ws,
  paths,
  folder,
}: {
  ws: Workspace;
  paths: readonly string[];
  folder: string;
}) => {
  const entries = folderEntries(paths, folder);
  const at = (name: string) => (folder === "" ? name : `${folder}/${name}`);

  return (
    <>
      <FileBar>
        {folder === "" ? (
          <span className="font-medium">{ws.repo.name}</span>
        ) : (
          <Crumbs ws={ws.id} file={folder} />
        )}
      </FileBar>
      <ul className="min-h-0 flex-1 divide-y overflow-auto text-sm">
        {entries.dirs.map(([name, count]) => (
          <li key={name}>
            <Link
              href={filesHref.code(ws.id, at(name))}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted"
            >
              <FolderIcon className="size-4 text-muted-foreground" />
              <span>{name}</span>
              <span className="ml-auto text-xs text-faint tabular-nums">
                {count}
              </span>
            </Link>
          </li>
        ))}
        {entries.files.map((name) => (
          <li key={name}>
            <Link
              href={filesHref.code(ws.id, at(name))}
              className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted"
            >
              <FileIcon className="size-4 text-muted-foreground" />
              <span>{name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
};

const FileShown = async ({
  ws,
  file,
  body,
  mode,
}: {
  ws: Workspace;
  file: string;
  body: Exclude<FileBody, { kind: "folder" }>;
  mode: string;
}) => {
  const last = await lastCommit(ws, file);
  const markdown = /\.(?:md|mdx|markdown)$/iu.test(file);

  const changed =
    body.kind === "text" &&
    body.original !== null &&
    body.original !== body.text;

  const modes: Mode[] = [
    ...(markdown ? (["preview"] as const) : []),
    ...(markdown || changed ? (["source"] as const) : []),
    ...(changed ? (["diff"] as const) : []),
  ];

  const shown: Mode =
    modes.find((each) => each === mode) ?? (markdown ? "preview" : "source");

  const labels: Record<Mode, string> = {
    diff: "Diff",
    preview: "Preview",
    source: "Source",
  };

  return (
    <>
      <FileBar>
        <Crumbs ws={ws.id} file={file} />
        {last === null ? (
          <span className="shrink-0 text-ok">New</span>
        ) : (
          <Link
            href={filesHref.history(ws.id, last.sha, file)}
            className="flex min-w-0 items-center gap-2 text-muted-foreground hover:text-foreground max-md:hidden"
          >
            <span className="truncate">{last.subject}</span>
            <span className="shrink-0 text-faint">{ago(last.at)}</span>
          </Link>
        )}
        <span className="ml-auto shrink-0 text-faint tabular-nums max-lg:hidden">
          {body.kind === "text" &&
            `${countLines(body.text).toLocaleString("en-US")} lines · `}
          {"size" in body && bytes(body.size)}
        </span>
        <Tools>
          {modes.length > 1 && (
            <Pills label="Show">
              {modes.map((each) => (
                <PillLink
                  key={each}
                  replace
                  href={filesHref.code(
                    ws.id,
                    file,
                    each === (markdown ? "preview" : "source") ? "" : each
                  )}
                  current={each === shown}
                >
                  {labels[each]}
                </PillLink>
              ))}
            </Pills>
          )}
          <CopyButton text={file} label="Copy path" />
        </Tools>
      </FileBar>
      <Content ws={ws} file={file} body={body} mode={shown} />
    </>
  );
};

const CodePage = async ({
  params,
  searchParams,
}: PageProps<"/files/[ws]/code/[[...path]]">) => {
  const { ws: id, path = [] } = await params;
  const ws = await findWorkspace(decodeURIComponent(id));

  if (ws === null) {
    notFound();
  }

  const asked = path.map((part) => decodeURIComponent(part)).join("/");
  const paths = await listFiles(ws);

  const file =
    asked === ""
      ? (overviews.find((name) => paths.includes(name)) ?? "")
      : asked;

  if (file === "") {
    return <Folder ws={ws} paths={paths} folder="" />;
  }

  const body = await readBody(ws, file);

  if (body.kind === "folder") {
    return <Folder ws={ws} paths={paths} folder={file} />;
  }

  const { mode } = await searchParams;

  return (
    <FileShown
      ws={ws}
      file={file}
      body={body}
      mode={[mode ?? ""].flat()[0] ?? ""}
    />
  );
};

export default CodePage;
