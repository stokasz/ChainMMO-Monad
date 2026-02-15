import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GrokArena } from "../components/GrokArena";

describe("<GrokArena />", () => {
  let originalScrollIntoViewDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalScrollIntoViewDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
  });

  afterEach(() => {
    if (originalScrollIntoViewDescriptor) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoViewDescriptor);
    } else {
      delete (HTMLElement.prototype as unknown as { scrollIntoView?: () => void }).scrollIntoView;
    }
    vi.restoreAllMocks();
  });

  it("uses backend-provided action URL when present", () => {
    render(
      <GrokArena
        status={{ online: true, queueDepth: 0, lastSeenAt: null, agentAddress: null, agentCharacterId: null }}
        sessionReady
        messages={[
          {
            messageId: "m-1",
            sessionId: "s-1",
            role: "action",
            content: "0x" + "a".repeat(64),
            metadata: { txHash: "0x" + "a".repeat(64), url: "http://example.test/tx/0xabc" },
            createdAt: new Date().toISOString()
          }
        ]}
        streamText=""
        sending={false}
        error=""
        prompt=""
        onPrompt={() => undefined}
        onSend={() => undefined}
        onReset={() => undefined}
      />
    );

    const link = screen.getByRole("link", { name: /view tx/i });
    expect(link).toHaveAttribute("href", "http://example.test/tx/0xabc");
  });

  it("auto-scrolls when a new message or stream text arrives", () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView
    });

    const initialMessage = {
      messageId: "m-1",
      sessionId: "s-1",
      role: "user" as const,
      content: "Hello",
      metadata: null,
      createdAt: new Date().toISOString()
    };

    const { rerender } = render(
      <GrokArena
        status={{ online: true, queueDepth: 0, lastSeenAt: null, agentAddress: null, agentCharacterId: null }}
        sessionReady
        messages={[initialMessage]}
        streamText=""
        sending={false}
        error=""
        prompt=""
        onPrompt={() => undefined}
        onSend={() => undefined}
        onReset={() => undefined}
      />
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    scrollIntoView.mockClear();

    rerender(
      <GrokArena
        status={{ online: true, queueDepth: 0, lastSeenAt: null, agentAddress: null, agentCharacterId: null }}
        sessionReady
        messages={[
          initialMessage,
          {
            messageId: "m-2",
            sessionId: "s-1",
            role: "assistant",
            content: "Got it",
            metadata: null,
            createdAt: new Date().toISOString()
          }
        ]}
        streamText=""
        sending={false}
        error=""
        prompt=""
        onPrompt={() => undefined}
        onSend={() => undefined}
        onReset={() => undefined}
      />
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    scrollIntoView.mockClear();

    rerender(
      <GrokArena
        status={{ online: true, queueDepth: 0, lastSeenAt: null, agentAddress: null, agentCharacterId: null }}
        sessionReady
        messages={[
          initialMessage,
          {
            messageId: "m-2",
            sessionId: "s-1",
            role: "assistant",
            content: "Got it",
            metadata: null,
            createdAt: new Date().toISOString()
          }
        ]}
        streamText="partial..."
        sending
        error=""
        prompt=""
        onPrompt={() => undefined}
        onSend={() => undefined}
        onReset={() => undefined}
      />
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
