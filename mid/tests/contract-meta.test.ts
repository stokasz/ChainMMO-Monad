import { describe, expect, it } from "vitest";
import { AgentReadModel } from "../src/agent-api/read-model.js";

describe("contract meta", () => {
  it("does not expose the RPC URL", () => {
    const env = {
      CHAIN_ID: 10143,
      CHAIN_RPC_URL: "https://example.invalid/secret",
      GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000001",
      FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
      ITEMS_ADDRESS: "0x0000000000000000000000000000000000000003",
      MMO_ADDRESS: "0x0000000000000000000000000000000000000004",
      TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000005",
      RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000006",
      MMODISTRIBUTOR_ADDRESS: "0x0000000000000000000000000000000000000007",
      X_PROFILE_URL: "https://x.com/stokasz"
    } as any;

    const readModel = new AgentReadModel(env, {} as any, {} as any);
    const meta = readModel.getContractMeta();
    expect(meta).not.toHaveProperty("rpcUrl");
  });

  it("normalizes legacy X profile placeholders", () => {
    const env = {
      CHAIN_ID: 10143,
      CHAIN_RPC_URL: "https://example.invalid/secret",
      GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000001",
      FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
      ITEMS_ADDRESS: "0x0000000000000000000000000000000000000003",
      MMO_ADDRESS: "0x0000000000000000000000000000000000000004",
      TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000005",
      RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000006",
      MMODISTRIBUTOR_ADDRESS: "0x0000000000000000000000000000000000000007",
      X_PROFILE_URL: "https://x.com/chainmmo"
    } as any;

    const readModel = new AgentReadModel(env, {} as any, {} as any);
    const meta = readModel.getContractMeta() as any;
    expect(meta.xProfile).toBe("https://x.com/stokasz");
  });

  it("returns distributor as null when not configured", () => {
    const env = {
      CHAIN_ID: 10143,
      CHAIN_RPC_URL: "https://example.invalid/secret",
      GAMEWORLD_ADDRESS: "0x0000000000000000000000000000000000000001",
      FEEVAULT_ADDRESS: "0x0000000000000000000000000000000000000002",
      ITEMS_ADDRESS: "0x0000000000000000000000000000000000000003",
      MMO_ADDRESS: "0x0000000000000000000000000000000000000004",
      TRADE_ESCROW_ADDRESS: "0x0000000000000000000000000000000000000005",
      RFQ_MARKET_ADDRESS: "0x0000000000000000000000000000000000000006",
      MMODISTRIBUTOR_ADDRESS: undefined,
      X_PROFILE_URL: "https://x.com/stokasz"
    } as any;

    const readModel = new AgentReadModel(env, {} as any, {} as any);
    const meta = readModel.getContractMeta() as { distributor: string | null };
    expect(meta.distributor).toBeNull();
  });
});
