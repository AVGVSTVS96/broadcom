"use client";

import { CheckIcon, CopyIcon } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

const copy = async (text: string, setCopied: (copied: boolean) => void) => {
  await navigator.clipboard.writeText(text);
  setCopied(true);
  setTimeout(() => {
    setCopied(false);
  }, 1500);
};

export const CopyButton = ({ text, label }: { text: string; label: string }) => {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => {
        void copy(text, setCopied);
      }}
    >
      {copied ? <CheckIcon className="text-ok" /> : <CopyIcon />}
    </Button>
  );
};
