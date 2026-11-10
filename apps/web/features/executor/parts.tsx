"use client";

import { Editor } from "@pierre/diffs/edit";
import type { EditorFactory } from "@pierre/diffs/edit";
import { EditProvider, File, MultiFileDiff } from "@pierre/diffs/react";
import { ChevronRightIcon } from "lucide-react";
import { useMemo, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { connectAccount, deployApp, saveFile } from "@/features/executor/actions";
import { diffOptions, fileOptions, useDiffStyle } from "@/features/files/code";
import { sameSource } from "@/lib/executor/executor";
import type { SourceFile } from "@/lib/executor/executor";

const createEditor: EditorFactory<undefined, undefined> = (type, options, key) =>
  new Editor(type, options, key);

export const ConnectButton = ({
  slug,
  requirement,
  another,
}: {
  slug: string;
  requirement: string;
  another: boolean;
}) => {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState("");

  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <Button
        size="sm"
        variant={another ? "outline" : "default"}
        disabled={pending}
        onClick={() => {
          const tab = window.open("", "_blank");

          setFailed("");
          startTransition(async () => {
            const result = await connectAccount(slug, requirement);

            if (!result.ok) {
              tab?.close();
              setFailed(result.reason);

              return;
            }

            if (tab === null) {
              window.location.assign(result.value);

              return;
            }

            tab.opener = null;
            tab.location.href = result.value;
          });
        }}
      >
        {another ? "Add another" : "Connect"}
      </Button>
      {failed !== "" && <span className="text-xs text-bad">{failed}</span>}
    </span>
  );
};

export const DeployButton = ({
  slug,
  name,
  differ,
}: {
  slug: string;
  name: string;
  differ: number;
}) => {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [said, setSaid] = useState("");

  return (
    <div className="flex items-center gap-3">
      {said !== "" && <span className="text-sm text-muted-foreground">{said}</span>}
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setOpen(true);
        }}
      >
        {pending ? "Deploying…" : "Deploy"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Deploy {name}?</DialogTitle>
          <DialogDescription>
            The {differ === 1 ? "file" : `${differ} files`} you changed here become the version
            Executor runs.
          </DialogDescription>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              onClick={() => {
                setOpen(false);
                setSaid("");
                startTransition(async () => {
                  const result = await deployApp(slug);

                  setSaid(result.ok ? `Deployed ${result.value.files} files` : result.reason);
                });
              }}
            >
              Deploy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const stateOf = (file: SourceFile) => {
  if (sameSource(file)) {
    return "Same as running";
  }

  if (file.local === null) {
    return "Only in Executor";
  }

  return file.deployed === null ? "Not deployed yet" : "Differs from running";
};

const SourceFileRow = ({
  slug,
  file,
  editing,
  setEditing,
}: {
  slug: string;
  file: SourceFile;
  editing: boolean;
  setEditing: (on: boolean) => void;
}) => {
  const [style] = useDiffStyle();
  const same = sameSource(file);
  const [open, setOpen] = useState(!same);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState("");
  const latest = useRef<string | null>(null);
  const text = file.local ?? file.deployed ?? "";
  const shown = open || editing;

  const current = useMemo(() => ({ contents: text, name: file.path }), [file.path, text]);

  const before = useMemo(
    () =>
      file.deployed === null || same || file.local === null
        ? null
        : { contents: file.deployed, name: file.path },
    [file.deployed, file.local, file.path, same],
  );

  const keep = (contents: string) => {
    latest.current = contents;
  };

  return (
    <li className="overflow-hidden rounded-2xl border">
      <div className="flex items-center gap-2 bg-muted/40 px-3 py-2">
        <button
          type="button"
          aria-expanded={shown}
          onClick={() => {
            setOpen(!open);
          }}
          className="group flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
        >
          <ChevronRightIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground transition-transform group-aria-expanded:rotate-90"
          />
          <span className="truncate font-mono text-[13px]">{file.path}</span>
          <span
            className="shrink-0 text-xs text-muted-foreground data-[same=false]:text-over-ink"
            data-same={same}
          >
            {stateOf(file)}
          </span>
        </button>
        {failed !== "" && <span className="text-xs text-bad">{failed}</span>}
        {editing ? (
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              startTransition(async () => {
                if (latest.current !== null) {
                  const result = await saveFile(slug, file.path, latest.current);

                  if (!result.ok) {
                    setFailed(result.reason);

                    return;
                  }
                }

                setFailed("");
                setEditing(false);
              });
            }}
          >
            Save here
          </Button>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              latest.current = null;
              setEditing(true);
            }}
          >
            Edit
          </Button>
        )}
      </div>
      {shown && before !== null && (
        <MultiFileDiff
          oldFile={before}
          newFile={current}
          options={diffOptions(style)}
          edit={editing}
          onEditChange={(event) => {
            keep(event.file.contents);
          }}
          onEditComplete={() => "accept"}
        />
      )}
      {shown && before === null && (
        <File
          file={current}
          options={fileOptions}
          edit={editing}
          onEditChange={(event) => {
            keep(event.file.contents);
          }}
          onEditComplete={() => "accept"}
        />
      )}
    </li>
  );
};

export const SourceFiles = ({ slug, files }: { slug: string; files: readonly SourceFile[] }) => {
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <EditProvider createEditor={createEditor}>
      <ul className="space-y-2">
        {files.map((file) => (
          <SourceFileRow
            key={`${file.path}:${file.local?.length ?? 0}`}
            slug={slug}
            file={file}
            editing={editing === file.path}
            setEditing={(on) => {
              setEditing(on ? file.path : null);
            }}
          />
        ))}
      </ul>
    </EditProvider>
  );
};
