import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  applyContractsLatestToEnv,
  loadContractsLatestFile
} from "../src/config/contracts.js";

describe("contracts.latest.json config", () => {
  it("loads and applies contract addresses from deployments/contracts.latest.json", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chainmmo-contracts-"));
    const filePath = path.join(dir, "contracts.latest.json");

    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          chainId: 31337,
          contracts: {
            mmoToken: "0x0000000000000000000000000000000000000001",
            gameWorld: "0x0000000000000000000000000000000000000002",
            feeVault: "0x0000000000000000000000000000000000000003",
            items: "0x0000000000000000000000000000000000000004",
            distributor: "0x0000000000000000000000000000000000000005",
            tradeEscrow: "0x0000000000000000000000000000000000000006",
            rfqMarket: "0x0000000000000000000000000000000000000007"
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const latest = loadContractsLatestFile(filePath);

    const env = {
      CHAIN_ID: 31337,
      GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000000",
      FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000000",
      ITEMS_ADDRESS: "0x0000000000000000000000000000000000000000",
      MMO_ADDRESS: "0x0000000000000000000000000000000000000000",
      TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000000",
      RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000000",
      MMODISTRIBUTOR_ADDRESS: undefined
    } as any;

    const applied = applyContractsLatestToEnv(env, latest);
    expect(applied.GAMEWORLD_ADDRESS).toBe("0x0000000000000000000000000000000000000002");
    expect(applied.MMO_ADDRESS).toBe("0x0000000000000000000000000000000000000001");
    expect(applied.MMODISTRIBUTOR_ADDRESS).toBe("0x0000000000000000000000000000000000000005");
  });

  it("bumps CHAIN_START_BLOCK to the deployment start block when provided", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chainmmo-contracts-"));
    const filePath = path.join(dir, "contracts.latest.json");

    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          chainId: 31337,
          startBlock: 12345,
          contracts: {
            mmoToken: "0x0000000000000000000000000000000000000001",
            gameWorld: "0x0000000000000000000000000000000000000002",
            feeVault: "0x0000000000000000000000000000000000000003",
            items: "0x0000000000000000000000000000000000000004",
            distributor: "0x0000000000000000000000000000000000000005",
            tradeEscrow: "0x0000000000000000000000000000000000000006",
            rfqMarket: "0x0000000000000000000000000000000000000007"
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const latest = loadContractsLatestFile(filePath);

    const env = {
      CHAIN_ID: 31337,
      CHAIN_START_BLOCK: 1,
      GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000000",
      FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000000",
      ITEMS_ADDRESS: "0x0000000000000000000000000000000000000000",
      MMO_ADDRESS: "0x0000000000000000000000000000000000000000",
      TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000000",
      RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000000",
      MMODISTRIBUTOR_ADDRESS: undefined
    } as any;

    const applied = applyContractsLatestToEnv(env, latest);
    expect(applied.CHAIN_START_BLOCK).toBe(12345);
  });

  it("rejects chainId mismatch", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chainmmo-contracts-"));
    const filePath = path.join(dir, "contracts.latest.json");

    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          chainId: 1,
          contracts: {
            mmoToken: "0x0000000000000000000000000000000000000001",
            gameWorld: "0x0000000000000000000000000000000000000002",
            feeVault: "0x0000000000000000000000000000000000000003",
            items: "0x0000000000000000000000000000000000000004",
            distributor: "0x0000000000000000000000000000000000000005",
            tradeEscrow: "0x0000000000000000000000000000000000000006",
            rfqMarket: "0x0000000000000000000000000000000000000007"
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const latest = loadContractsLatestFile(filePath);
    const env = { CHAIN_ID: 31337 } as any;

    expect(() => applyContractsLatestToEnv(env, latest)).toThrow(/chainId/i);
  });

  it("accepts contracts.latest.json when distributor is omitted", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chainmmo-contracts-"));
    const filePath = path.join(dir, "contracts.latest.json");

    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          chainId: 31337,
          contracts: {
            mmoToken: "0x0000000000000000000000000000000000000001",
            gameWorld: "0x0000000000000000000000000000000000000002",
            feeVault: "0x0000000000000000000000000000000000000003",
            items: "0x0000000000000000000000000000000000000004",
            tradeEscrow: "0x0000000000000000000000000000000000000006",
            rfqMarket: "0x0000000000000000000000000000000000000007"
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const latest = loadContractsLatestFile(filePath);
    const env = {
      CHAIN_ID: 31337,
      GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000000",
      FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000000",
      ITEMS_ADDRESS: "0x0000000000000000000000000000000000000000",
      MMO_ADDRESS: "0x0000000000000000000000000000000000000000",
      TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000000",
      RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000000",
      MMODISTRIBUTOR_ADDRESS: "0x0000000000000000000000000000000000000009"
    } as any;

    const applied = applyContractsLatestToEnv(env, latest);
    expect(applied.MMODISTRIBUTOR_ADDRESS).toBeUndefined();
  });

  it("accepts contracts.latest.json when distributor is null", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "chainmmo-contracts-"));
    const filePath = path.join(dir, "contracts.latest.json");

    await fs.writeFile(
      filePath,
      JSON.stringify(
        {
          chainId: 31337,
          contracts: {
            mmoToken: "0x0000000000000000000000000000000000000001",
            gameWorld: "0x0000000000000000000000000000000000000002",
            feeVault: "0x0000000000000000000000000000000000000003",
            items: "0x0000000000000000000000000000000000000004",
            distributor: null,
            tradeEscrow: "0x0000000000000000000000000000000000000006",
            rfqMarket: "0x0000000000000000000000000000000000000007"
          }
        },
        null,
        2
      ),
      "utf8"
    );

    const latest = loadContractsLatestFile(filePath);
    const env = {
      CHAIN_ID: 31337,
      GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000000",
      FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000000",
      ITEMS_ADDRESS: "0x0000000000000000000000000000000000000000",
      MMO_ADDRESS: "0x0000000000000000000000000000000000000000",
      TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000000",
      RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000000",
      MMODISTRIBUTOR_ADDRESS: "0x0000000000000000000000000000000000000009"
    } as any;

    const applied = applyContractsLatestToEnv(env, latest);
    expect(applied.MMODISTRIBUTOR_ADDRESS).toBeUndefined();
  });
});
