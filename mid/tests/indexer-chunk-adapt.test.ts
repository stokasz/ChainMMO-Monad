import { describe, expect, it, vi } from "vitest";
import { ChainIndexer } from "../src/indexer/indexer.js";

describe("chain indexer chunk adaptation", () => {
  it("reduces the block chunk when getLogs fails due to range limits", async () => {
    const env = {
      CHAIN_ID: 10143,
      CHAIN_START_BLOCK: 1,
      INDEXER_BLOCK_CHUNK: 200,
      INDEXER_POLL_MS: 1,
      INDEXER_MAX_BLOCKS_PER_TICK: 10_000
    } as any;

    const safeHead = 25n;
    const chain = {
      getSafeHead: vi.fn().mockResolvedValue(safeHead),
      getLogs: vi.fn().mockImplementation(async (fromBlock: bigint, toBlock: bigint) => {
        const range = toBlock - fromBlock + 1n;
        if (range > 10n) {
          const err: any = new Error("HTTP request failed.");
          err.details = JSON.stringify({
            code: -32600,
            message: "eth_getLogs requests with up to a 10 block range"
          });
          throw err;
        }
        return [];
      }),
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
    expect(calls.length).toBeGreaterThan(1);
    expect(calls[0]).toEqual([1n, safeHead]); // initial attempt uses configured chunk
    // Eventually we must have retried with an allowed range.
    expect(calls.some(([from, to]) => to - from + 1n <= 10n)).toBe(true);
  });
});
