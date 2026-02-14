import { describe, expect, it } from "vitest";
import { buildApiServer } from "../src/agent-api/server.js";

describe("web static assets", () => {
  it("serves robots.txt and sitemap.xml", async () => {
    const app = await buildApiServer({
      env: {} as any,
      signerAddress: undefined,
      actionRepository: undefined,
      metrics: {} as any,
      readModel: {} as any
    });

    try {
      const home = await app.inject({ method: "GET", url: "/" });
      expect(home.statusCode).toBe(200);
      expect(home.headers["content-type"]).toMatch(/text\/html/i);
      expect(home.body).toContain("<title>ChainMMO");
      expect(home.body).toContain("id=\"root\"");
      expect(home.body).toContain("type=\"module\"");

      const robots = await app.inject({ method: "GET", url: "/robots.txt" });
      expect(robots.statusCode).toBe(200);
      expect(robots.headers["content-type"]).toMatch(/text\/plain/i);
      expect(robots.body).toContain("User-agent:");
      expect(robots.body).toContain("Sitemap:");

      const sitemap = await app.inject({ method: "GET", url: "/sitemap.xml" });
      expect(sitemap.statusCode).toBe(200);
      expect(sitemap.headers["content-type"]).toMatch(/xml/i);
      expect(sitemap.body).toContain("<urlset");
      expect(sitemap.body).toMatch(new RegExp("<loc>https://(test\\.)?chainmmo\\.com/</loc>"));

      const favicon = await app.inject({ method: "GET", url: "/favicon.ico" });
      expect(favicon.statusCode).toBe(200);
      expect(favicon.headers["content-type"]).toMatch(/image/i);
      expect(favicon.body.length).toBeGreaterThan(0);

      const favicon32 = await app.inject({ method: "GET", url: "/favicon-32x32.png" });
      expect(favicon32.statusCode).toBe(200);
      expect(favicon32.headers["content-type"]).toMatch(/image\/png/i);
      expect(favicon32.body.length).toBeGreaterThan(0);

      const og = await app.inject({ method: "GET", url: "/og.png" });
      expect(og.statusCode).toBe(200);
      expect(og.headers["content-type"]).toMatch(/image\/png/i);
      expect(og.body.length).toBeGreaterThan(0);

      const manifest = await app.inject({ method: "GET", url: "/site.webmanifest" });
      expect(manifest.statusCode).toBe(200);
      expect(manifest.headers["content-type"]).toMatch(/manifest|json/i);
      const manifestJson = JSON.parse(manifest.body);
      expect(manifestJson).toEqual(expect.objectContaining({ name: expect.any(String) }));

      const font = await app.inject({ method: "GET", url: "/fonts/cormorant-garamond-latin.woff2" });
      expect(font.statusCode).toBe(200);
      expect(font.headers["content-type"]).toMatch(/font\/woff2/i);
      expect(font.body.length).toBeGreaterThan(0);
    } finally {
      await app.close();
    }
  });
});
