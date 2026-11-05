"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export const RefreshOn = ({ src }: { src: string }) => {
  const router = useRouter();

  useEffect(() => {
    const source = new EventSource(src);

    source.addEventListener("message", () => {
      router.refresh();
    });

    return () => {
      source.close();
    };
  }, [src, router]);

  return null;
};
