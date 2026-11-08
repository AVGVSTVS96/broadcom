import type { Metadata } from "next";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { Section } from "@/components/viz/section";
import { PluginCard, Skills, SourceLink } from "@/features/plugins/parts";
import { Wiring } from "@/features/plugins/wiring";
import { readSetup } from "@/lib/hex/setup";
import { cn } from "@/lib/utils";
import { RefreshOn } from "@/lib/watch/refresh-on";

export const metadata: Metadata = { title: "Plugins" };

const Tag = ({ scope }: { scope: "hex" | "you" }) => (
  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
    {scope === "hex" ? "hex" : "yours"}
  </span>
);

const Rows = ({ children }: { children: ReactNode }) => (
  <ul className="divide-y rounded-2xl border">{children}</ul>
);

const count = (value: number, word: string) => `${value} ${word}${value === 1 ? "" : "s"}`;

const PluginsPage = async () => {
  await connection();
  const setup = await readSetup();
  const on = setup.plugins.filter((plugin) => plugin.enabled);
  const servers = setup.mcp.filter((server) => server.enabled);
  const hexSkills = setup.skills.filter((skill) => skill.scope === "hex");

  return (
    <div className="space-y-4">
      <Wiring
        channels={setup.channels}
        now={Date.now()}
        loads={[
          { href: "#plugins", name: "Plugins", value: `${on.length} on` },
          { href: "#mcp", name: "MCP servers", value: String(servers.length) },
          {
            href: "#skills",
            name: "Skills",
            value: String(setup.skills.length),
          },
          { href: "#hooks", name: "Hooks", value: String(setup.hooks.length) },
          ...setup.mods.map((mod) => ({
            href: "#mods",
            name: mod.name,
            value: "mod",
          })),
        ]}
      />
      <section id="plugins" className="scroll-mt-4">
        <Section
          title={`${on.length} of ${setup.plugins.length} Claude Code plugins on`}
          detail="A switch turns a plugin on or off for every new session."
        >
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {setup.plugins.map((plugin) => (
              <PluginCard key={`${plugin.id}:${String(plugin.enabled)}`} plugin={plugin} />
            ))}
          </ul>
        </Section>
      </section>
      <section id="mcp" className="scroll-mt-4">
        <Section
          title={`${servers.length} of ${count(setup.mcp.length, "MCP server")} on`}
          detail="Tools sessions can call. hex's come from its .mcp.json, yours from Claude Code's own settings."
        >
          <Rows>
            {setup.mcp.map((server) => (
              <li
                key={`${server.scope}:${server.name}`}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
              >
                <span
                  className={cn(
                    "size-2 shrink-0 rounded-full",
                    server.enabled ? "bg-ok" : "bg-faint",
                  )}
                />
                <span className="font-medium">{server.name}</span>
                <Tag scope={server.scope} />
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground max-sm:basis-full">
                  {server.where}
                </span>
                <span className="text-xs text-faint">{server.enabled ? server.kind : "off"}</span>
              </li>
            ))}
          </Rows>
        </Section>
      </section>
      <section id="skills" className="scroll-mt-4">
        <Section
          title={`${count(setup.skills.length, "skill")}, ${hexSkills.length} from hex`}
          detail="A session reads a skill when its task matches the description."
        >
          <Skills skills={setup.skills} />
        </Section>
      </section>
      <section id="hooks" className="scroll-mt-4">
        <Section
          title={count(setup.hooks.length, "hook")}
          detail="Commands Claude Code runs on an event, before the model sees it."
        >
          <Rows>
            {setup.hooks.map((hook) => (
              <li
                key={`${hook.scope}:${hook.event}`}
                className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-3 text-sm"
              >
                <span className="font-medium">{hook.event}</span>
                <Tag scope={hook.scope} />
                <span className="min-w-0 flex-1 space-y-0.5 max-sm:basis-full">
                  {hook.summary.map((line) => (
                    <span key={line} className="block truncate">
                      {line}
                    </span>
                  ))}
                  <span className="block truncate font-mono text-xs text-faint">
                    {hook.matchers.length > 0
                      ? `on ${hook.matchers.join(" · ")}`
                      : "on every event"}
                  </span>
                </span>
                <SourceLink source={hook.source} />
              </li>
            ))}
          </Rows>
        </Section>
      </section>
      {setup.mods.length > 0 && (
        <section id="mods" className="scroll-mt-4">
          <Section
            title={count(setup.mods.length, "mod")}
            detail="Changes to hex's own behavior, shipped in hex core."
          >
            <Rows>
              {setup.mods.map((mod) => (
                <li
                  key={mod.name}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm"
                >
                  <span className="font-medium">{mod.name}</span>
                  {mod.version !== null && (
                    <span className="font-mono text-xs text-faint">{mod.version}</span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">
                    {mod.description}
                  </span>
                  <SourceLink source={mod.source} />
                </li>
              ))}
            </Rows>
          </Section>
        </section>
      )}
      <RefreshOn src="/api/plugins/watch" />
    </div>
  );
};

export default PluginsPage;
