"use client";

import { Button } from "@/components/ui/button";
import { Section } from "@/components/viz/section";

const PageError = ({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) => (
  <Section
    title="This page didn't load"
    detail={
      error.digest === undefined
        ? error.message
        : "Most often the proxy didn't answer. The server log has the details under this code."
    }
  >
    <div className="flex flex-wrap items-center gap-3">
      <Button onClick={retry}>Try again</Button>
      {error.digest === undefined ? null : (
        <span className="font-mono text-xs text-muted-foreground">
          {error.digest}
        </span>
      )}
    </div>
  </Section>
);

export default PageError;
