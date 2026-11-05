"use client";

import { CheckIcon, CopyIcon, ExternalLinkIcon } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import type { ReactElement } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  cancelSignIn,
  sendSignInCode,
  signInStatus,
  startSignIn,
} from "@/features/accounts/actions";
import type { SignInLink } from "@/features/accounts/actions";
import type { SignInProvider } from "@/lib/proxy/schema";
import { cn } from "@/lib/utils";

type Phase =
  | { readonly at: "idle" }
  | { readonly at: "starting" }
  | {
      readonly at: "waiting";
      readonly link: SignInLink;
      readonly sending: boolean;
      readonly problem: string | null;
    }
  | { readonly at: "done" }
  | { readonly at: "failed"; readonly reason: string };

export const brands = { claude: "Claude", codex: "ChatGPT" } as const;

const copy = async (text: string) => {
  if (window.isSecureContext) {
    await navigator.clipboard.writeText(text);

    return;
  }

  const area = document.createElement("textarea");

  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.append(area);
  area.select();
  // oxlint-disable-next-line typescript/no-deprecated -- the Clipboard API only exists on HTTPS, and the dashboard is served over plain HTTP on the tailnet.
  document.execCommand("copy");
  area.remove();
};

const Code = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();

  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted px-4 py-3">
      <output className="font-mono text-2xl tracking-[0.2em] select-all">
        {value}
      </output>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          startTransition(async () => {
            await copy(value);
            setCopied(true);
          });
        }}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
};

const Waiting = ({ label }: { label: string }) => (
  <output className="flex items-center gap-2 text-muted-foreground">
    <span className="relative flex size-2">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-ok" />
    </span>
    {label}
  </output>
);

const Steps = ({
  provider,
  phase,
  onSend,
}: {
  provider: SignInProvider;
  phase: Extract<Phase, { at: "waiting" }>;
  onSend: (input: string) => void;
}) => {
  const [input, setInput] = useState("");
  const { link } = phase;
  const brand = brands[provider];

  const open = (
    <a
      href={link.url}
      target="_blank"
      rel="noreferrer"
      className={cn(buttonVariants({ size: "lg" }), "w-full")}
      onClick={() => {
        if (link.code !== null) {
          void copy(link.code);
        }
      }}
    >
      {link.code === null
        ? `Open ${brand} sign-in`
        : `Copy code and open ${brand}`}
      <ExternalLinkIcon />
    </a>
  );

  if (link.flow === "device" && link.code !== null) {
    return (
      <div className="space-y-4">
        <Code value={link.code} />
        {open}
        <Waiting label={`Waiting for the code on ${brand}`} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {open}
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          onSend(input);
        }}
      >
        <label htmlFor="sign-in-code" className="block font-medium">
          {link.flow === "code"
            ? `Paste the code ${brand} shows`
            : "Paste the address your browser ends on"}
        </label>
        {link.flow === "code" ? null : (
          <p className="text-muted-foreground">
            After you approve, that page won&apos;t load. Copy its address from
            the address bar.
          </p>
        )}
        <div className="flex gap-2">
          <Input
            id="sign-in-code"
            value={input}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-9 font-mono"
            placeholder={
              link.flow === "code" ? "code#state" : "http://localhost…"
            }
            onChange={(event) => {
              setInput(event.currentTarget.value);
            }}
            onPaste={(event) => {
              const pasted = event.clipboardData.getData("text").trim();

              if (pasted !== "") {
                event.preventDefault();
                setInput(pasted);
                onSend(pasted);
              }
            }}
          />
          <Button
            type="submit"
            size="lg"
            variant="secondary"
            disabled={input.trim() === "" || phase.sending}
          >
            Send
          </Button>
        </div>
        {phase.problem === null ? null : (
          <p className="text-bad" role="alert">
            {phase.problem}
          </p>
        )}
      </form>
      <Waiting label={phase.sending ? "Checking" : "Waiting for sign-in"} />
    </div>
  );
};

export const SignIn = ({
  provider,
  target = null,
  trigger,
}: {
  provider: SignInProvider;
  target?: string | null;
  trigger: ReactElement;
}) => {
  const [phase, setPhase] = useState<Phase>({ at: "idle" });
  const watching = useRef(new AbortController());
  const [, startTransition] = useTransition();
  const brand = brands[provider];
  const state = phase.at === "waiting" ? phase.link.state : null;

  const watch = async (at: string, stop: AbortSignal): Promise<void> => {
    const result = await signInStatus(at);

    if (stop.aborted) {
      return;
    }

    if (result.ok && result.value.status === "wait") {
      await watch(at, stop);
    } else if (result.ok && result.value.status === "ok") {
      setPhase({ at: "done" });
    } else {
      setPhase({
        at: "failed",
        reason: result.ok
          ? (result.value.error ?? "Sign-in failed")
          : result.reason,
      });
    }
  };

  const start = async () => {
    watching.current.abort();
    const stop = new AbortController();

    watching.current = stop;
    setPhase({ at: "starting" });
    const result = await startSignIn(provider, target);

    if (stop.signal.aborted) {
      return;
    }

    if (!result.ok) {
      setPhase({ at: "failed", reason: result.reason });

      return;
    }

    setPhase({
      at: "waiting",
      link: result.value,
      problem: null,
      sending: false,
    });
    await watch(result.value.state, stop.signal);
  };

  const send = async (input: string) => {
    if (phase.at !== "waiting") {
      return;
    }

    setPhase({ ...phase, problem: null, sending: true });
    const result = await sendSignInCode(provider, phase.link.state, input);

    setPhase((current) =>
      current.at === "waiting"
        ? {
            ...current,
            problem: result.ok ? null : result.reason,
            sending: false,
          }
        : current
    );
  };

  return (
    <Dialog
      open={phase.at !== "idle"}
      onOpenChange={(open) => {
        if (open) {
          startTransition(start);

          return;
        }

        watching.current.abort();

        if (state !== null) {
          startTransition(async () => {
            await cancelSignIn(state);
          });
        }

        setPhase({ at: "idle" });
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="gap-5 p-5 sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {target === null
              ? `Add a ${brand} account`
              : `Sign in to ${target}`}
          </DialogTitle>
          {phase.at === "done" ? null : (
            <DialogDescription>
              {target === null
                ? `Sign in with the ${brand} account you want in the pool.`
                : "Sign in with this account to put it back in the pool."}
            </DialogDescription>
          )}
        </DialogHeader>
        {phase.at === "starting" || phase.at === "idle" ? (
          <Waiting label="Getting a sign-in link" />
        ) : null}
        {phase.at === "waiting" ? (
          <Steps
            provider={provider}
            phase={phase}
            onSend={(input) => {
              startTransition(async () => {
                await send(input);
              });
            }}
          />
        ) : null}
        {phase.at === "done" ? (
          <output className="flex items-center gap-2 text-base">
            <CheckIcon className="size-5 text-ok" />
            {target === null ? "Added to the pool." : "Signed in again."}
          </output>
        ) : null}
        {phase.at === "failed" ? (
          <div className="space-y-3">
            <p className="text-bad" role="alert">
              {phase.reason}
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                startTransition(start);
              }}
            >
              Try again
            </Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
};
