export interface Source {
  readonly ws: string;
  readonly file: string;
}

export interface Channel {
  readonly id: string;
  readonly name: string;
  readonly version: string | null;
  readonly description: string;
  readonly state: "connected" | "set up" | "installed";
  readonly source: Source | null;
}

export interface Mod {
  readonly name: string;
  readonly version: string | null;
  readonly description: string;
  readonly source: Source | null;
}

export interface ClaudePlugin {
  readonly id: string;
  readonly name: string;
  readonly market: string;
  readonly version: string | null;
  readonly description: string;
  readonly enabled: boolean;
}

export interface McpServer {
  readonly name: string;
  readonly kind: string;
  readonly where: string;
  readonly scope: "hex" | "you";
  readonly enabled: boolean;
}

export interface Skill {
  readonly name: string;
  readonly description: string;
  readonly scope: "hex" | "you";
  readonly source: Source | null;
}

export interface Hook {
  readonly event: string;
  readonly matchers: readonly string[];
  readonly summary: readonly string[];
  readonly scope: "hex" | "you";
  readonly source: Source | null;
}

export interface Setup {
  readonly channels: readonly Channel[];
  readonly mods: readonly Mod[];
  readonly plugins: readonly ClaudePlugin[];
  readonly mcp: readonly McpServer[];
  readonly skills: readonly Skill[];
  readonly hooks: readonly Hook[];
}

export const frontMatter = (text: string, key: string) => {
  const lines = text.split("\n");

  if (lines[0]?.trim() !== "---") {
    return "";
  }

  const value: string[] = [];
  let reading = false;

  for (const line of lines.slice(1)) {
    if (line.trim() === "---") {
      break;
    }

    if (reading) {
      if (!/^\s/u.test(line)) {
        break;
      }

      value.push(line.trim());
    } else if (line.startsWith(`${key}:`)) {
      const rest = line.slice(key.length + 1).trim();

      reading = true;

      if (!["", "|", ">", "|-", ">-"].includes(rest)) {
        value.push(rest.replaceAll(/^["']|["']$/gu, ""));
      }
    }
  }

  return value.join(" ");
};

const behaviorPattern = /"behavior"\s*:\s*"(?<behavior>[a-z]+)"/u;

export const hookSummary = (command: string) => {
  const answer = /^echo '(?<json>.*)'$/u.exec(command.trim())?.groups?.json;

  const behavior =
    answer === undefined
      ? undefined
      : behaviorPattern.exec(answer)?.groups?.behavior;

  return behavior === undefined
    ? command
    : `Answers “${behavior}” without asking`;
};
