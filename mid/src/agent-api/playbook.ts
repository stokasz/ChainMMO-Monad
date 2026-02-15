import { existsSync, promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface PlaybookSectionIndex {
  id: string;
  title: string;
}

export interface PlaybookSection extends PlaybookSectionIndex {
  markdown: string;
}

export function resolveDefaultPlaybookPath(): string {
  // Prefer resolving from the process CWD so `node dist/main.js` (Docker WORKDIR=/app/mid)
  // finds `/app/mid/playbook/MCP_PLAYBOOK.md` rather than a nonexistent `dist/playbook`.
  const candidates = [
    path.resolve(process.cwd(), "playbook/MCP_PLAYBOOK.md"),
    path.resolve(process.cwd(), "mid/playbook/MCP_PLAYBOOK.md"),
    (() => {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      return path.resolve(__dirname, "../../playbook/MCP_PLAYBOOK.md");
    })(),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  // Keep a deterministic fallback for logging/debugging.
  return candidates[0]!;
}

export async function loadPlaybookSectionsFromFile(playbookPath: string): Promise<PlaybookSection[]> {
  const raw = await fs.readFile(playbookPath, "utf8");
  return parsePlaybookMarkdown(raw);
}

export function parsePlaybookMarkdown(markdown: string): PlaybookSection[] {
  const normalized = markdown.replace(/\r\n/g, "\n");

  const matches = Array.from(normalized.matchAll(/^##\s+(.+)\s*$/gm), (m) => ({
    title: (m[1] ?? "").trim(),
    index: m.index ?? -1
  })).filter((m) => m.index >= 0 && m.title.length > 0);

  if (matches.length === 0) {
    return [];
  }

  const used = new Map<string, number>();
  const out: PlaybookSection[] = [];

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i]!;
    const next = matches[i + 1];
    const start = current.index;
    const end = next ? next.index : normalized.length;
    const sectionMarkdown = normalized.slice(start, end).trimEnd() + "\n";

    const baseId = slugify(current.title);
    const n = used.get(baseId) ?? 0;
    used.set(baseId, n + 1);
    const id = n === 0 ? baseId : `${baseId}-${n + 1}`;

    out.push({
      id,
      title: current.title,
      markdown: sectionMarkdown
    });
  }

  return out;
}

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 64);
}
