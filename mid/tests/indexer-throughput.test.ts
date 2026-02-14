import { describe, expect, it, vi } from "vitest";
import { ChainIndexer } from "../src/indexer/indexer.js";

describe("indexer throughput behavior", () => {
  it("checkpoints cursor once per processed chunk, not once per log", async () => {
    const env = {
      CHAIN_ID: 31337,
      CHAIN_START_BLOCK: 1,
      INDEXER_BLOCK_CHUNK: 20,
      INDEXER_POLL_MS: 1,
      INDEXER_MAX_BLOCKS_PER_TICK: 10_000
    } as any;

    const chain = {
      getSafeHead: vi.fn().mockResolvedValue(200n),
      getLogs: vi.fn(async (fromBlock: bigint, toBlock: bigint) => {
        const logs: any[] = [];
        for (let block = fromBlock; block <= toBlock; block += 4n) {
          logs.push({
            blockNumber: block,
            logIndex: 0n,
            blockHash: "0x1",
            transactionHash: `0x${block.toString(16)}`,
            address: "0x2",
            topics: ["0x3"],
            data: "0x"
          });
        }
        return logs;
      }),
      decodeLog: vi.fn((log: any) => ({
        address: "0x0000000000000000000000000000000000000002",
        blockNumber: BigInt(log.blockNumber),
        blockHash: "0x0000000000000000000000000000000000000000000000000000000000000001",
        logIndex: Number(log.logIndex),
        transactionHash: `0x${BigInt(log.blockNumber).toString(16).padStart(64, "0")}`,
        eventName: "Noop",
        args: {}
      }))
    } as any;

    const repository = {
      getCursor: vi.fn().mockResolvedValue({ lastProcessedBlock: 0n, lastProcessedLogIndex: -1 }),
      setCursor: vi.fn().mockResolvedValue(undefined),
      markProcessed: vi.fn().mockResolvedValue(true),
      unmarkProcessed: vi.fn().mockResolvedValue(undefined)
    };

    const indexer = new ChainIndexer(env, chain, {} as any);
    (indexer as any).repository = repository;
    (indexer as any).handleLog = vi.fn().mockResolvedValue(undefined);

    await indexer.tick();

    // Blocks 1..200 with chunk size 20 -> 10 chunks.
    expect(repository.setCursor).toHaveBeenCalledTimes(10);
    expect(repository.markProcessed).toHaveBeenCalled();
  });
});
