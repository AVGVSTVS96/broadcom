"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { SearchInput } from "@/components/ui/search-input";
import { Switch } from "@/components/ui/switch";
import { filesHref } from "@/features/files/urls";
import { setPlugin } from "@/features/plugins/actions";
import type { ClaudePlugin, Skill, Source } from "@/lib/plugins/setup";

export const SourceLink = ({ source }: { source: Source | null }) =>
  source === null ? null : (
    <Link
      href={filesHref.code(source.ws, source.file)}
      className="-my-2 shrink-0 py-2 text-xs text-muted-foreground hover:text-foreground"
    >
      Source
    </Link>
  );

export const PluginCard = ({ plugin }: { plugin: ClaudePlugin }) => {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState("");
  const [enabled, setEnabled] = useState(plugin.enabled);

  return (
    <li
      className="flex flex-col gap-2 rounded-2xl bg-muted/60 p-4 data-[on=false]:opacity-70"
      data-on={enabled}
    >
      <div className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate font-medium">{plugin.name}</span>
        <Switch
          checked={enabled}
          disabled={pending}
          aria-label={`${plugin.name} in new sessions`}
          onCheckedChange={(next) => {
            setEnabled(next);
            setFailed("");
            startTransition(async () => {
              const result = await setPlugin(plugin.id, next);

              if (!result.ok) {
                setEnabled(!next);
                setFailed(result.reason);
              }
            });
          }}
        />
      </div>
      <p className="line-clamp-3 text-sm text-muted-foreground">{plugin.description}</p>
      {failed !== "" && <p className="text-sm text-bad">{failed}</p>}
      <p className="mt-auto flex gap-2 text-xs text-faint">
        {plugin.version !== null && <span className="font-mono">{plugin.version}</span>}
        <span className="truncate">{plugin.market}</span>
      </p>
    </li>
  );
};

const shownAtFirst = 12;

export const Skills = ({ skills }: { skills: readonly Skill[] }) => {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState(false);
  const needle = query.trim().toLowerCase();

  const found = skills.filter(
    (skill) =>
      needle === "" ||
      skill.name.toLowerCase().includes(needle) ||
      skill.description.toLowerCase().includes(needle),
  );

  const shown = all || needle !== "" ? found : found.slice(0, shownAtFirst);

  return (
    <div className="space-y-3">
      <SearchInput
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        placeholder={`Search ${skills.length} skills`}
        aria-label="Search skills"
        className="max-w-sm"
      />
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((skill) => (
          <li key={`${skill.scope}:${skill.name}`} className="rounded-2xl bg-muted/60 p-4">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{skill.name}</span>
              {skill.scope === "hex" && (
                <span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">
                  hex
                </span>
              )}
              <SourceLink source={skill.source} />
            </div>
            <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{skill.description}</p>
          </li>
        ))}
      </ul>
      {shown.length === 0 && (
        <p className="text-sm text-muted-foreground">No skill matches “{query}”.</p>
      )}
      {needle === "" && found.length > shownAtFirst && (
        <button
          type="button"
          onClick={() => {
            setAll(!all);
          }}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {all ? "Show fewer" : `Show all ${found.length}`}
        </button>
      )}
    </div>
  );
};
