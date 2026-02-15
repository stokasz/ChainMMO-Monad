import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";

class MockEventSource {
  public static create(url: string) {
    return new MockEventSource(url);
  }

  public readonly listeners = new Map<string, Array<(event: MessageEvent | Event) => void>>();
  public closed = false;

  private constructor(public readonly url: string) {}

  addEventListener(event: string, listener: (event: MessageEvent | Event) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    handlers.push(listener);
    this.listeners.set(event, handlers);
  }

  removeEventListener(event: string, listener: (event: MessageEvent | Event) => void): void {
    const handlers = this.listeners.get(event) ?? [];
    this.listeners.set(event, handlers.filter((handler) => handler !== listener));
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;

    const errorEvent = new Event("error");
    for (const handler of this.listeners.get("error") ?? []) {
      handler(errorEvent);
    }
  }

  emit(event: string, data: string): void {
    const payload = new MessageEvent(event, { data });
    for (const handler of this.listeners.get(event) ?? []) {
      handler(payload);
    }
  }
}

describe("Grok stream lifecycle", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function makeFetchMock() {
    return vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : String(input?.url ?? "");

      const payload = (body: unknown) =>
        ({
          ok: true,
          status: 200,
          json: async () => body
        }) as any;

      if (url.endsWith("/grok/session")) {
        return payload({ sessionId: "session-test" });
      }
      if (url.includes("/grok/prompt")) {
        return payload({ runId: "run-1", streamUrl: "/grok/stream?runId=run-1" });
      }
      if (url.includes("/grok/history")) {
        return payload({ items: [] });
      }
      if (url.includes("/grok/status")) {
        return payload({ online: true, queueDepth: 0, lastSeenAt: null });
      }
      if (url.includes("/meta/contracts")) {
        return payload({ chainId: 31337 });
      }
      if (url.includes("/leaderboard?")) {
        return payload({ leaderboardUpdatedAtBlock: 1, indexingLagBlocks: 0, items: [] });
      }
      if (url.endsWith("/meta/diagnostics")) {
        return payload({});
      }
      if (url.endsWith("/meta/rewards")) {
        return payload({});
      }
      if (url.includes("/market/rfqs")) {
        return payload({ nowUnix: 0, items: [] });
      }
      if (url.includes("/feed/recent")) {
        return payload({ items: [] });
      }
      return payload({});
    });
  }

  it("does not show a Stream error after a normal final event", async () => {
    const fetchMock = makeFetchMock();
    const sources: MockEventSource[] = [];
    vi.stubGlobal("fetch", fetchMock);
    const EventSourceCtor = vi.fn(function (this: unknown, url: string) {
      const created = MockEventSource.create(url);
      sources.push(created);
      return created as any;
    });
    vi.stubGlobal("EventSource", EventSourceCtor);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: /^Send$/i })).not.toBeDisabled());

    fireEvent.change(screen.getByRole("textbox", { name: /Grok prompt/i }), {
      target: { value: "Hey Grok, can you do a transaction?" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    await waitFor(() => expect(EventSourceCtor).toHaveBeenCalledTimes(1));
    const streamSource = sources[0];
    expect(streamSource).toBeDefined();
    if (!streamSource) return;
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/grok/prompt"))).toBe(true);

    act(() => {
      streamSource.emit("token", JSON.stringify({ text: "Sure, " }));
      streamSource.emit("token", JSON.stringify({ text: "I can craft a transaction." }));
      streamSource.emit("final", JSON.stringify({ text: "Sure, I can craft a transaction." }));
    });

    await waitFor(() => expect(streamSource.closed).toBe(true));
    await waitFor(() => expect(screen.queryByText(/Stream error\./i)).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /^Send$/i })).toBeEnabled();
  });

  it("shows an error message when the stream emits error payload", async () => {
    const fetchMock = makeFetchMock();
    const sources: MockEventSource[] = [];
    vi.stubGlobal("fetch", fetchMock);
    const EventSourceCtor = vi.fn(function (this: unknown, url: string) {
      const created = MockEventSource.create(url);
      sources.push(created);
      return created as any;
    });
    vi.stubGlobal("EventSource", EventSourceCtor);

    render(<App />);

    await waitFor(() => expect(screen.getByRole("button", { name: /^Send$/i })).not.toBeDisabled());

    fireEvent.change(screen.getByRole("textbox", { name: /Grok prompt/i }), {
      target: { value: "Hey Grok, can you do a transaction?" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^Send$/i }));

    await waitFor(() => expect(EventSourceCtor).toHaveBeenCalledTimes(1));
    const streamSource = sources[0];
    expect(streamSource).toBeDefined();
    if (!streamSource) return;

    act(() => {
      streamSource.emit("error", JSON.stringify({ error: "run_not_found" }));
    });

    await waitFor(() => expect(screen.getByText(/run_not_found/i)).toBeInTheDocument());
  });
});
