import { describe, expect, it } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("GET /meta/playbook", () => {
  it("lists sections and serves section markdown", async () => {
    const app = await buildApiServer({
      env: {} as any,
      metrics: {} as any,
      readModel: {} as any
    });

    try {
      const indexRes = await app.inject({ method: "GET", url: "/meta/playbook" });
      expect(indexRes.statusCode).toBe(200);
      const index = JSON.parse(indexRes.body) as { sections: Array<{ id: string; title: string }> };
      expect(Array.isArray(index.sections)).toBe(true);
      expect(index.sections.length).toBeGreaterThan(0);
      expect(typeof index.sections[0]?.id).toBe("string");
      expect(typeof index.sections[0]?.title).toBe("string");

      const requiredIds = new Set(["footguns", "gas-costs", "agent-bootstrap", "safe-loop"]);
      const actualIds = new Set(index.sections.map((section) => section.id));
      for (const id of requiredIds) {
        expect(actualIds.has(id)).toBe(true);
      }

      const first = index.sections[0]!;
      const sectionRes = await app.inject({ method: "GET", url: `/meta/playbook/${encodeURIComponent(first.id)}` });
      expect(sectionRes.statusCode).toBe(200);
      const section = JSON.parse(sectionRes.body) as { id: string; title: string; markdown: string };
      expect(section.id).toBe(first.id);
      expect(section.title).toBe(first.title);
      expect(section.markdown.length).toBeGreaterThan(20);

      const markdownRes = await app.inject({
        method: "GET",
        url: `/meta/playbook/${encodeURIComponent(first.id)}?format=markdown`
      });
      expect(markdownRes.statusCode).toBe(200);
      expect(markdownRes.headers["content-type"]).toMatch(/text\/markdown|text\/plain/i);
      expect(markdownRes.body).toContain("##");

      const missingRes = await app.inject({ method: "GET", url: "/meta/playbook/does-not-exist" });
      expect(missingRes.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});
