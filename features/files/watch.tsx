"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export const Watch = ({ ws }: { ws: string }) => {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource(
      `/api/files/watch?ws=${encodeURIComponent(ws)}`
    );

    source.addEventListener("message", () => {
      router.refresh();
    });

    return () => {
      source.close();
    };
  }, [ws, router]);

  return null;
};
