import { describe, expect, it } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("GET /meta/diagnostics", () => {
  it("is a public endpoint", async () => {
    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel: {
        getDiagnostics: async () => ({ ok: true })
      } as any
    });

    try {
      const res = await app.inject({ method: "GET", url: "/meta/diagnostics" });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });
});

