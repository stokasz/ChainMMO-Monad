import { describe, expect, it, vi } from "vitest";
import { ChainIndexer } from "../src/indexer/indexer.js";
import type { DecodedLog } from "../src/chain-adapter/client.js";

describe("chain indexer recovery", () => {
  it("removes processed marker when log handling fails", async () => {
    const env = {
      CHAIN_ID: 31337,
      CHAIN_START_BLOCK: 1,
      INDEXER_BLOCK_CHUNK: 100,
      INDEXER_POLL_MS: 1,
      INDEXER_MAX_BLOCKS_PER_TICK: 10_000
    } as any;

    const rawLog = {
      blockNumber: 1n,
      logIndex: 0n,
      blockHash: "0x1",
      transactionHash: "0x2",
      address: "0x3",
      topics: ["0x4"],
      data: "0x"
    } as any;

    const decoded: DecodedLog = {
      address: "0x0000000000000000000000000000000000000003",
      blockNumber: 1n,
      logIndex: 0,
      blockHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
      transactionHash: "0x0000000000000000000000000000000000000000000000000000000000000002",
      eventName: "CharacterCreated",
      args: {
        characterId: 1n,
        owner: "0x0000000000000000000000000000000000000001",
        race: 0,
        classType: 0,
        name: "A"
      }
    };

    const chain = {
      getSafeHead: vi.fn().mockResolvedValue(1n),
      getLogs: vi.fn().mockResolvedValue([rawLog]),
      decodeLog: vi.fn().mockReturnValue(decoded)
    } as any;

    const repository = {
      getCursor: vi.fn().mockResolvedValue({ lastProcessedBlock: 0n, lastProcessedLogIndex: -1 }),
      setCursor: vi.fn().mockResolvedValue(undefined),
      markProcessed: vi.fn().mockResolvedValue(true),
      unmarkProcessed: vi.fn().mockResolvedValue(undefined)
    };

    const indexer = new ChainIndexer(env, chain, {} as any);
    (indexer as any).repository = repository;
    (indexer as any).handleLog = vi.fn().mockRejectedValue(new Error("boom"));

    await expect(indexer.tick()).rejects.toThrow("boom");
    expect(repository.markProcessed).toHaveBeenCalledWith(decoded);
    expect(repository.unmarkProcessed).toHaveBeenCalledWith(decoded);
    expect(repository.setCursor).not.toHaveBeenCalled();
  });
});
