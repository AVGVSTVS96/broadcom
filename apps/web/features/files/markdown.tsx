import Link from "next/link";
import type { ComponentProps } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import type { ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";

import { filesHref } from "@/features/files/urls";
import { resolveLink } from "@/lib/files/files";

const Anchor = ({ node: _node, href = "", children }: ComponentProps<"a"> & ExtraProps) =>
  href.startsWith("/files/") ? (
    <Link href={href}>{children}</Link>
  ) : (
    <a href={href} target={href.startsWith("#") ? undefined : "_blank"} rel="noreferrer">
      {children}
    </a>
  );

export const Markdown = ({ ws, file, text }: { ws: string; file: string; text: string }) => (
  <div className="min-h-0 flex-1 overflow-auto">
    <article className="mx-auto prose prose-sm max-w-3xl px-5 py-6 prose-neutral sm:px-8 dark:prose-invert prose-headings:font-medium prose-headings:tracking-tight prose-a:underline-offset-2 prose-code:before:content-none prose-code:after:content-none prose-pre:bg-muted prose-pre:text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: Anchor }}
        urlTransform={(url, key) => {
          const inside = resolveLink(file, url);

          if (inside === null) {
            return defaultUrlTransform(url);
          }

          return key === "src" ? filesHref.raw(ws, inside) : filesHref.code(ws, inside);
        }}
      >
        {text}
      </ReactMarkdown>
    </article>
  </div>
);
