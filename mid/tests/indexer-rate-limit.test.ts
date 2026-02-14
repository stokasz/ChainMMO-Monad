import { describe, expect, it, vi } from "vitest";
import { ChainIndexer } from "../src/indexer/indexer.js";

describe("indexer rate-limit backoff", () => {
  it("retries eth_getLogs on transient 429 errors within retry budget", async () => {
    const env = {
      CHAIN_ID: 31337,
      CHAIN_START_BLOCK: 1,
      INDEXER_BLOCK_CHUNK: 20,
      INDEXER_POLL_MS: 1,
      INDEXER_MAX_BLOCKS_PER_TICK: 10_000,
      INDEXER_RATE_LIMIT_BACKOFF_MS: 1,
      INDEXER_RATE_LIMIT_RETRY_MAX: 2
    } as any;

    let attempts = 0;
    const chain = {
      getSafeHead: vi.fn().mockResolvedValue(5n),
      getLogs: vi.fn().mockImplementation(async () => {
        attempts += 1;
        if (attempts <= 2) {
          throw new Error("429 Too Many Requests");
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

    expect(chain.getLogs).toHaveBeenCalledTimes(3);
    expect(repository.setCursor).toHaveBeenCalledWith("chainmmo_main", 5n, -1);
  });
});
