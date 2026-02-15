import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...listFiles(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const ALLOWED_FONT_PX = new Set([11, 12, 14, 15, 16, 18, 20, 22]);

const DISALLOWED_TAILWIND_TEXT_SIZE_CLASSES = [
  "text-xs",
  "text-sm",
  "text-base",
  "text-lg",
  "text-xl",
  "text-2xl",
  "text-3xl",
  "text-4xl",
  "text-5xl",
  "text-6xl",
  "text-7xl",
  "text-8xl",
  "text-9xl",
];

describe("Design system typography scale", () => {
	  it("does not use tailwind default text-* size utilities (use text-t-* tokens)", () => {
	    const srcRoot = path.join(process.cwd(), "src");
	    const files = listFiles(srcRoot).filter(
	      (file) => /\.(ts|tsx)$/.test(file) && !file.includes(`${path.sep}__tests__${path.sep}`),
	    );
    const violations: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      for (const cls of DISALLOWED_TAILWIND_TEXT_SIZE_CLASSES) {
        if (new RegExp(`\\b${cls}\\b`).test(content)) {
          violations.push(`${path.relative(process.cwd(), file)} uses ${cls}`);
        }
      }
      if (content.includes("text-[")) {
        violations.push(`${path.relative(process.cwd(), file)} uses text-[...] (arbitrary font size)`);
      }
    }

    expect(violations).toEqual([]);
  });

	  it("only hardcodes font-size values from the design system scale", () => {
	    const srcRoot = path.join(process.cwd(), "src");
	    const files = listFiles(srcRoot).filter((file) => /\.css$/.test(file));
    const violations: string[] = [];

	    for (const file of files) {
	      const content = readFileSync(file, "utf8");
	      const re = /font-size:\s*([0-9]+(?:\.[0-9]+)?)px\s*;/g;
	      for (const match of content.matchAll(re)) {
	        const raw = match[1];
        const value = raw ? Number(raw) : NaN;
        if (!Number.isFinite(value)) continue;
        if (!ALLOWED_FONT_PX.has(value)) {
          violations.push(`${path.relative(process.cwd(), file)} uses font-size: ${raw}px`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
