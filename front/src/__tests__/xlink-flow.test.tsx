// @vitest-environment-options { "url": "https://chainmmo.com/" }

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { act } from "react";
import App from "../App";

describe("X linking flow", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (window as any).ethereum;
  });

  it("finalizes after connecting the wallet during the flow", async () => {
    const linkToken = "token123";
    const wallet = "0x000000000000000000000000000000000000dEaD";
    window.history.replaceState({}, "", `/?xlink=${encodeURIComponent(linkToken)}`);

    const fetchMock = vi.fn(async (input: any) => {
      const url = typeof input === "string" ? input : String(input?.url ?? "");

      const respond = (body: unknown) =>
        ({
          ok: true,
          status: 200,
          json: async () => body,
          text: async () => JSON.stringify(body),
        }) as any;

      if (url.endsWith(`/auth/x/pending/${encodeURIComponent(linkToken)}`)) {
        return respond({
          address: wallet,
          xUserId: "123",
          xUsername: "tester",
          message: "please sign",
        });
      }

      if (url.endsWith("/auth/x/finalize")) {
        return respond({ ok: true });
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
      if (args?.method === "personal_sign") {
        return `0x${"11".repeat(65)}`;
      }
      throw new Error(`unexpected method: ${String(args?.method)}`);
    });
    (window as any).ethereum = { request: requestMock };

    render(<App />);

    await act(async () => {
      // Allow effects and initial fetches to run.
      await Promise.resolve();
    });

    await waitFor(() => {
      const finalizeCalls = fetchMock.mock.calls.filter(([input]) => {
        const url = typeof input === "string" ? input : String((input as any)?.url ?? "");
        return url.endsWith("/auth/x/finalize");
      });
      expect(finalizeCalls.length).toBeGreaterThan(0);
    });
  });
});
