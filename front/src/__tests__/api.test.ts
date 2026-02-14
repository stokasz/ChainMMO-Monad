import { describe, expect, it, vi } from "vitest";
import { fetchJson } from "../lib/api";

describe("fetchJson", () => {
  it("throws http_<status> when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          ok: false,
          status: 500,
          json: async () => ({ error: "nope" }),
        } as any;
      }),
    );

    await expect(fetchJson("https://example.com/api")).rejects.toThrow(
      /http_500/,
    );
  });

  it("throws malformed_json when response.json() throws", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new SyntaxError("Unexpected token < in JSON");
          },
        } as any;
      }),
    );

    await expect(fetchJson("https://example.com/api")).rejects.toThrow(
      /malformed_json/,
    );
  });

  it("returns the parsed JSON body for ok responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        } as any;
      }),
    );

    await expect(fetchJson("https://example.com/api")).resolves.toEqual({
      ok: true,
    });
  });
});

