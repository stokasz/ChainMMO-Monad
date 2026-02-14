import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Env } from "./env.js";

const addressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);

const contractsLatestSchema = z.object({
  chainId: z.number().int().positive(),
  startBlock: z.number().int().min(0).optional(),
  contracts: z.object({
    mmoToken: addressSchema,
    gameWorld: addressSchema,
    feeVault: addressSchema,
    items: addressSchema,
    distributor: addressSchema.nullable().optional(),
    tradeEscrow: addressSchema,
    rfqMarket: addressSchema
  })
});

export type ContractsLatest = z.infer<typeof contractsLatestSchema>;

export function loadContractsLatestFile(filePath: string): ContractsLatest {
  const raw = readFileSync(filePath, "utf8");
  const json = JSON.parse(raw) as unknown;
  return contractsLatestSchema.parse(json);
}

export function resolveContractsLatestPath(
  env: { CONTRACTS_JSON_PATH?: string },
  cwd: string = process.cwd()
): string | null {
  if (env.CONTRACTS_JSON_PATH && env.CONTRACTS_JSON_PATH.length > 0) {
    return path.isAbsolute(env.CONTRACTS_JSON_PATH)
      ? env.CONTRACTS_JSON_PATH
      : path.resolve(cwd, env.CONTRACTS_JSON_PATH);
  }

  const candidates = [
    path.resolve(cwd, "../deployments/contracts.latest.json"),
    path.resolve(cwd, "deployments/contracts.latest.json")
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function applyContractsLatestToEnv(env: Env, latest: ContractsLatest): Env {
  if (env.CHAIN_ID !== latest.chainId) {
    throw new Error(`contracts.latest.json chainId mismatch: env=${env.CHAIN_ID} file=${latest.chainId}`);
  }

  const startBlock = latest.startBlock;
  const nextStartBlock =
    typeof startBlock === "number" && Number.isInteger(startBlock) && startBlock >= 0
      ? Math.max(env.CHAIN_START_BLOCK, startBlock)
      : env.CHAIN_START_BLOCK;

  return {
    ...env,
    CHAIN_START_BLOCK: nextStartBlock,
    GAMEWORLD_ADDRESS: latest.contracts.gameWorld,
    FEEVAULT_ADDRESS: latest.contracts.feeVault,
    ITEMS_ADDRESS: latest.contracts.items,
    MMO_ADDRESS: latest.contracts.mmoToken,
    TRADE_ESCROW_ADDRESS: latest.contracts.tradeEscrow,
    RFQ_MARKET_ADDRESS: latest.contracts.rfqMarket,
    MMODISTRIBUTOR_ADDRESS:
      typeof latest.contracts.distributor === "string" ? latest.contracts.distributor : undefined
  };
}
