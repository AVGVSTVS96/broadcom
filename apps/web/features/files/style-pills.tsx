"use client";

import { useDiffStyle } from "@/features/files/code";
import { PillButton, Pills } from "@/features/files/pills";

export const StylePills = () => {
  const [style, choose] = useDiffStyle();

  return (
    <Pills label="Diff layout">
      <PillButton
        current={style === "unified"}
        onClick={() => {
          choose("unified");
        }}
      >
        Unified
      </PillButton>
      <PillButton
        current={style === "split"}
        onClick={() => {
          choose("split");
        }}
      >
        Split
      </PillButton>
    </Pills>
  );
};
