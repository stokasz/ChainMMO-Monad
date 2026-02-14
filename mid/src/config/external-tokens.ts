import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const externalTokensLatestSchema = z.object({
  chainId: z.number().int().positive(),
  mmo: z.object({
    tokenAddress: addressSchema,
    poolAddress: addressSchema,
    source: z.string().min(1).max(64),
    url: z.string().url().optional()
  })
});

export type ExternalTokensLatest = z.infer<typeof externalTokensLatestSchema>;

export function loadExternalTokensLatestFile(filePath: string): ExternalTokensLatest {
  const raw = readFileSync(filePath, "utf8");
  const json = JSON.parse(raw) as unknown;
  return externalTokensLatestSchema.parse(json);
}

export function resolveExternalTokensLatestPath(
  env: { EXTERNAL_TOKENS_JSON_PATH?: string },
  cwd: string = process.cwd()
): string | null {
  if (env.EXTERNAL_TOKENS_JSON_PATH && env.EXTERNAL_TOKENS_JSON_PATH.length > 0) {
    return path.isAbsolute(env.EXTERNAL_TOKENS_JSON_PATH)
      ? env.EXTERNAL_TOKENS_JSON_PATH
      : path.resolve(cwd, env.EXTERNAL_TOKENS_JSON_PATH);
  }

  const candidates = [
    path.resolve(cwd, "../deployments/external.tokens.latest.json"),
    path.resolve(cwd, "deployments/external.tokens.latest.json")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

