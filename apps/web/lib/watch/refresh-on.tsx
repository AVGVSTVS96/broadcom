"use client";

import { useRouter } from "next/navigation";

import { useSubscription } from "@/lib/outside";

export const RefreshOn = ({ src }: { src: string }) => {
  const router = useRouter();

  useSubscription(() => {
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
