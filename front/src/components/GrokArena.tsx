import { type ReactNode, useEffect, useRef, useMemo } from "react";
import { Panel } from "./Panel";
import { CopyButton } from "./shared/CopyButton";
import { LiveDot } from "./shared/LiveDot";
import { formatAddress } from "../lib/format";
import type { GrokHistoryItem, GrokStatusResponse } from "../types";
import grokLogoUrl from "../../grok_logo.png";

type GrokRole = "user" | "assistant" | "action";

interface GrokArenaProps {
  status: GrokStatusResponse;
  sessionReady: boolean;
  messages: GrokHistoryItem[];
  streamText: string;
  sending: boolean;
  error: string;
  prompt: string;
  onPrompt: (value: string) => void;
  onSend: () => void;
  onReset: () => void;
}

function roleBadge(role: GrokRole) {
  if (role === "user") return { label: "You", tone: "info" as const };
  if (role === "action") return { label: "Action", tone: "accent" as const };
  return { label: "Grok", tone: "positive" as const };
}

function renderMarkup(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+?\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={`${index}-${part}`} className="font-semibold text-text-bright">
              {part.slice(2, -2)}
            </strong>
          );
        }
        return <span key={`${index}-${part}`}>{part}</span>;
      })}
    </>
  );
}

export function GrokArena({
  status,
  sessionReady,
  messages,
  streamText,
  sending,
  error,
  prompt,
  onPrompt,
  onSend,
  onReset
}: GrokArenaProps) {
  const messagesScrollAnchorRef = useRef<HTMLDivElement | null>(null);
  const messagesScrollContainerRef = useRef<HTMLDivElement | null>(null);

  const actor = useMemo(() => {
    if (!status.agentAddress) return "-";
    return formatAddress(status.agentAddress);
  }, [status.agentAddress]);

  useEffect(() => {
    const anchor = messagesScrollAnchorRef.current;
    const container = messagesScrollContainerRef.current;

    if (anchor && typeof anchor.scrollIntoView === "function") {
      anchor.scrollIntoView({ block: "end", inline: "nearest", behavior: "auto" });
      return;
    }

    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages, streamText, sending]);

  return (
    <Panel
      title={(
        <span className="inline-flex items-center gap-2">
          <img src={grokLogoUrl} alt="grok logo" className="h-4 w-4 rounded-sm" />
          GROK ARENA
        </span>
      )}
      status={(
        <div className="inline-flex items-center gap-2">
          <LiveDot
            status={status.online ? "online" : "idle"}
            label={(status.queueDepth ?? 0) > 0 ? `Queue: ${status.queueDepth}` : sessionReady ? "READY" : "LOADING"}
          />
          <button type="button" className="btn-secondary" onClick={onReset}>
            Reset
          </button>
        </div>
      )}
      className="h-full"
    >
      <div className="grid h-full grid-rows-[minmax(0,1fr)_96px] gap-2">
        <div ref={messagesScrollContainerRef} className="overflow-auto border border-white/5/70 p-2">
          {messages.length === 0 ? <div className="text-text-muted">No messages yet.</div> : null}
          <ul className="space-y-2">
            {messages.map((message) => {
              const badge = roleBadge(message.role);
              const isUser = message.role === "user";
              const isAction = message.role === "action";
              const actionUrl =
                isAction && typeof message.metadata?.url === "string" && message.metadata.url.trim().length > 0
                  ? message.metadata.url
                  : null;
              const messageTone = isUser
                ? "border-accent/50 bg-bg-overlay/30"
                : isAction
                  ? "border-warning/50 bg-bg-overlay/30"
                  : "border-border-subtle/80 bg-bg-overlay/25";
              return (
                <li key={message.messageId} className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`w-full max-w-[92%] rounded border p-2 ${messageTone}`}
                  >
                    <div className="mb-1 text-t-xs uppercase tracking-[0.06em] text-text-secondary">
                      <span className="text-accent">{badge.label}</span>
                      {message.metadata?.txHash ? ` · ${formatAddress(message.metadata.txHash)}` : ""}
                    </div>
                    <div className="break-words whitespace-pre-wrap text-t-sm text-text-bright">{renderMarkup(message.content)}</div>
                    {actionUrl ? (
                      <a href={actionUrl} target="_blank" rel="noreferrer" className="mt-1 block text-t-xs text-info hover:underline">view tx</a>
                    ) : null}
                  </div>
                </li>
              );
            })}
            {sending && !streamText ? (
              <li className="max-w-[92%] rounded border border-accent/40 bg-bg-overlay/30 p-2">
                <span className="text-text-secondary">Grok is thinking<span className="inline-block w-5 overflow-hidden text-left animate-[grok-typing_0.6s_steps(3,end)_infinite]">...</span></span>
              </li>
            ) : null}
            {streamText ? (
              <li className="rounded border border-accent/40 bg-bg-overlay/30 p-2">
                <span className="break-words text-text-bright">{streamText}</span>
              </li>
            ) : null}
          </ul>
          <div ref={messagesScrollAnchorRef} />
          <p className="mt-2 text-t-xs text-text-muted">actor: {actor}</p>
          {error ? <p className="mt-2 text-t-xs text-negative">{error}</p> : null}
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <label htmlFor="grok-input" className="sr-only">
            Grok prompt
          </label>
          <textarea
            id="grok-input"
            className="h-full resize-none rounded-sm bg-bg-raised/80 px-2 py-2 text-t-base outline-none ring-1 ring-border-subtle/60 focus:ring-accent/45"
            placeholder="Ask Grok to run an action…"
            value={prompt}
            aria-describedby="grok-prompt-hint"
            onChange={(event) => onPrompt(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
          />
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="btn-primary h-9"
              disabled={sending}
              onClick={onSend}
            >
              {sending ? "Sending" : "Send"}
            </button>
            <CopyButton text="POST /grok/prompt" />
          </div>
          <span id="grok-prompt-hint" className="sr-only">
            Press Enter to send. Use Shift + Enter for a new line.
          </span>
        </div>
      </div>
    </Panel>
  );
}
