import { describe, expect, it, vi } from "vitest";
import { ChainIndexer } from "../src/indexer/indexer.js";

describe("indexer max blocks per tick", () => {
  it("does not scan beyond cursor + INDEXER_MAX_BLOCKS_PER_TICK in a single tick", async () => {
    const env = {
      CHAIN_ID: 31337,
      CHAIN_START_BLOCK: 1,
      INDEXER_BLOCK_CHUNK: 20,
      INDEXER_POLL_MS: 1,
      INDEXER_MAX_BLOCKS_PER_TICK: 50
    } as any;

    const chain = {
      getSafeHead: vi.fn().mockResolvedValue(200n),
      getLogs: vi.fn().mockResolvedValue([]),
      decodeLog: vi.fn().mockReturnValue(undefined)
    } as any;

    const repository = {
      getCursor: vi.fn().mockResolvedValue({ lastProcessedBlock: 0n, lastProcessedLogIndex: -1 }),
      setCursor: vi.fn().mockResolvedValue(undefined),
      markProcessed: vi.fn().mockResolvedValue(true),
      unmarkProcessed: vi.fn().mockResolvedValue(undefined)
    };

    const indexer = new ChainIndexer(env, chain, {} as any);
    (indexer as any).repository = repository;

    await indexer.tick();

    const calls = chain.getLogs.mock.calls as Array<[bigint, bigint]>;
    expect(calls).toEqual([
      [1n, 20n],
      [21n, 40n],
      [41n, 50n]
    ]);
    expect(repository.setCursor).toHaveBeenCalledTimes(3);
  });
});

