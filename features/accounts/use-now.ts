"use client";

import { useEffect, useState } from "react";

export const useNow = (initial: number) => {
  const [now, setNow] = useState(initial);

  useEffect(() => {
    const tick = setInterval(() => {
      setNow(Date.now());
    }, 30_000);

    return () => {
      clearInterval(tick);
    };
  }, []);

  return now;
};
