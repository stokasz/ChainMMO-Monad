// @vitest-environment-options { "url": "https://chainmmo.com/" }

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "../App";
import { navigateTo } from "../lib/navigation";

vi.mock("../lib/navigation", () => ({ navigateTo: vi.fn() }));

describe("X linking start flow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (window as any).ethereum;
  });

  it("clicking Connect X requests wallet access then redirects to the authorize URL", async () => {
    const wallet = "0x000000000000000000000000000000000000dEaD";
    const authorizeUrl = "https://api.twitter.com/oauth/authenticate?oauth_token=rt_1";

    const fetchMock = vi.fn(async (input: any, init?: any) => {
      const url = typeof input === "string" ? input : String(input?.url ?? "");

      const respond = (body: unknown) =>
        ({
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        }) as any;

      if (url.endsWith("/auth/x/start")) {
        return respond({ authorizeUrl });
      }

      if (url.endsWith("/meta/contracts")) {
        return respond({ chainId: 143 });
      }

      if (url.endsWith("/meta/external")) {
        return respond({ chainId: 143, mmo: null });
      }

      if (url.includes("/leaderboard?")) {
        return respond({ items: [] });
      }

      if (url.endsWith("/meta/diagnostics")) {
        return respond({});
      }

      if (url.endsWith("/meta/rewards")) {
        return respond({});
      }

      if (url.includes("/market/rfqs")) {
        return respond({ nowUnix: 0, items: [] });
      }

      if (url.includes("/feed/recent")) {
        return respond({ items: [] });
      }

      if (url.endsWith("/grok/session")) {
        return respond({ sessionId: "session-test" });
      }

      if (url.endsWith("/grok/history")) {
        return respond({ items: [] });
      }

      if (url.endsWith("/grok/status")) {
        return respond({ online: true, queueDepth: 0, lastSeenAt: null });
      }

      return respond({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const requestMock = vi.fn(async (args: any) => {
      if (args?.method === "eth_requestAccounts") {
        return [wallet];
      }
      if (args?.method === "eth_chainId") {
        return "0x8f";
      }
      throw new Error(`unexpected method: ${String(args?.method)}`);
    });
    (window as any).ethereum = { request: requestMock };

    render(<App />);

    await act(async () => {
      // Let initial effects kick off (session bootstrap, meta polling, etc).
      await Promise.resolve();
    });

    const button = screen.getByRole("button", { name: /^Connect X$/i });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    await waitFor(() => expect(vi.mocked(navigateTo)).toHaveBeenCalledWith(authorizeUrl));
    expect(requestMock).toHaveBeenCalledWith(expect.objectContaining({ method: "eth_requestAccounts" }));

    const startCalls = fetchMock.mock.calls.filter(([url]) => typeof url === "string" && url.endsWith("/auth/x/start"));
    expect(startCalls.length).toBe(1);
    const [, init] = startCalls[0] as any;
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual(expect.objectContaining({ "content-type": "application/json" }));
    expect(JSON.parse(init?.body ?? "{}")).toEqual({ address: wallet });
  });

  it("blocks wallet connection when the wallet is on the wrong chain", async () => {
    const wallet = "0x000000000000000000000000000000000000dEaD";
    const fetchMock = vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : String(input?.url ?? "");

      const respond = (body: unknown) =>
        ({
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        }) as any;

      if (url.endsWith("/meta/contracts")) {
        return respond({ chainId: 143 });
      }

      if (url.endsWith("/meta/external")) {
        return respond({ chainId: 143, mmo: null });
      }

      if (url.includes("/leaderboard?")) {
        return respond({ items: [] });
      }

      if (url.endsWith("/meta/diagnostics")) {
        return respond({});
      }

      if (url.endsWith("/meta/rewards")) {
        return respond({});
      }

      if (url.includes("/market/rfqs")) {
        return respond({ nowUnix: 0, items: [] });
      }

      if (url.includes("/feed/recent")) {
        return respond({ items: [] });
      }

      if (url.endsWith("/grok/session")) {
        return respond({ sessionId: "session-test" });
      }

      if (url.endsWith("/grok/history")) {
        return respond({ items: [] });
      }

      if (url.endsWith("/grok/status")) {
        return respond({ online: true, queueDepth: 0, lastSeenAt: null });
      }

      return respond({});
    });
    vi.stubGlobal("fetch", fetchMock);

    const requestMock = vi.fn(async (args: any) => {
      if (args?.method === "eth_requestAccounts") {
        return [wallet];
      }
      if (args?.method === "eth_chainId") {
        return "0x139"; // 313
      }
      return [];
    });
    (window as any).ethereum = { request: requestMock };

    await act(async () => {
      render(<App />);
      await Promise.resolve();
    });

    const connectButton = screen.getByRole("button", { name: /^Connect Wallet$/i });
    fireEvent.click(connectButton);

    await waitFor(() =>
      expect(screen.getByText(/Unsupported wallet chain 313\. Connect to chain 143/i)).toBeInTheDocument(),
    );

    const connectCalls = requestMock.mock.calls.filter((call) => call[0]?.method === "eth_requestAccounts");
    expect(connectCalls.length).toBe(1);
    expect(fetchMock).toHaveBeenCalled();
  });
});
