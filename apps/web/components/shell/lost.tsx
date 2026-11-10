"use client";

import { Problems } from "@/components/viz/problems";
import { useLive } from "@/lib/live/client";
import type { Link, LostSince } from "@/lib/live/event";
import { useNow } from "@/lib/live/now";
import { when } from "@/lib/time/format";

const names: Record<Link, string> = {
  dashboard: "Offline",
  proxy: "Proxy offline",
  usage: "Usage service offline",
};

const Lines = ({ lost }: { lost: LostSince }) => {
  const now = useNow(Math.max(...Object.values(lost)));
  const shown: readonly Link[] = lost.dashboard === undefined ? ["proxy", "usage"] : ["dashboard"];

  const lines = shown.flatMap((link) => {
    const at = lost[link];

    return at === undefined ? [] : [`${names[link]} since ${when(at, now)}`];
  });

  return (
    <div className="mb-6 space-y-2">
      <Problems problems={lines} />
    </div>
  );
};

export const Lost = () => {
  const lost = useLive((live) => live.lost);

  return lost === undefined || Object.keys(lost).length === 0 ? null : <Lines lost={lost} />;
};
