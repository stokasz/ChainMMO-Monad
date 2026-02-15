import { describe, expect, it } from "vitest";
import { resolveDefaultPlaybookPath } from "../src/agent-api/playbook.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

describe("resolveDefaultPlaybookPath", () => {
  it("finds the playbook from repo root or mid/ (works for dist + Docker WORKDIR)", () => {
    const originalCwd = process.cwd();
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const midDir = path.resolve(__dirname, "..");
    const repoRoot = path.resolve(midDir, "..");

    try {
      // When started from repo root (common in local dev scripts).
      process.chdir(repoRoot);
      const fromRoot = resolveDefaultPlaybookPath();
      expect(fromRoot).toMatch(/\/mid\/playbook\/MCP_PLAYBOOK\.md$/);

      // When started from mid/ (Dockerfile WORKDIR=/app/mid).
      process.chdir(midDir);
      const fromMid = resolveDefaultPlaybookPath();
      expect(fromMid).toMatch(/\/mid\/playbook\/MCP_PLAYBOOK\.md$/);
    } finally {
      process.chdir(originalCwd);
    }
  });
});
