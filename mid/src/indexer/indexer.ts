import { ChainAdapter, type DecodedLog } from "../chain-adapter/client.js";
import type { Env } from "../config/env.js";
import { Database } from "../storage/db.js";
import { IndexerRepository } from "./repository.js";

const CURSOR_NAME = "chainmmo_main";

export class ChainIndexer {
  private running = false;
  private readonly repository: IndexerRepository;

  public constructor(
    private readonly env: Env,
    private readonly chain: ChainAdapter,
    private readonly db: Database
  ) {
    this.repository = new IndexerRepository(db, env.CHAIN_ID);
  }

  public async runForever(): Promise<void> {
    this.running = true;
    while (this.running) {
      try {
        await this.tick();
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error("indexer_tick_failed", error);
      }
      await sleep(this.env.INDEXER_POLL_MS);
    }
  }

  public stop(): void {
    this.running = false;
  }

  public async tick(): Promise<void> {
    const defaultBlock = BigInt(Math.max(this.env.CHAIN_START_BLOCK - 1, 0));
    const cursor = await this.repository.getCursor(CURSOR_NAME, defaultBlock);
    const safeHead = await this.chain.getSafeHead();

    const maxBlocksPerTick = BigInt(this.env.INDEXER_MAX_BLOCKS_PER_TICK);
    const effectiveHead = minBigInt(safeHead, cursor.lastProcessedBlock + maxBlocksPerTick);

    if (effectiveHead <= cursor.lastProcessedBlock) {
      return;
    }

    let fromBlock = cursor.lastProcessedBlock + 1n;
    let chunk = BigInt(this.env.INDEXER_BLOCK_CHUNK);
    const rateLimitRetryMax = this.env.INDEXER_RATE_LIMIT_RETRY_MAX ?? 4;
    const rateLimitBackoffMs = this.env.INDEXER_RATE_LIMIT_BACKOFF_MS ?? 500;
    while (fromBlock <= effectiveHead) {
      const toBlock = minBigInt(fromBlock + chunk - 1n, effectiveHead);
      let logs:
        | Awaited<ReturnType<ChainAdapter["getLogs"]>>
        | undefined;
      let rateLimitAttempt = 0;
      let retryWithSmallerChunk = false;
      try {
        while (true) {
          try {
            logs = await this.chain.getLogs(fromBlock, toBlock);
            break;
          } catch (error) {
            // Some providers (ex: Alchemy free tier) cap eth_getLogs query ranges.
            if (chunk > 1n && isGetLogsRangeLimit(error)) {
              chunk = maxBigInt(1n, chunk / 2n);
              retryWithSmallerChunk = true;
              break;
            }
            if (isRateLimitError(error) && rateLimitAttempt < rateLimitRetryMax) {
              rateLimitAttempt += 1;
              await sleep(rateLimitBackoffMs * rateLimitAttempt);
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        throw error;
      }
      if (retryWithSmallerChunk) {
        continue;
      }
      if (!logs) {
        continue;
      }
      logs.sort((a, b) => {
        const blockCmp = Number(BigInt(a.blockNumber ?? 0) - BigInt(b.blockNumber ?? 0));
        if (blockCmp !== 0) return blockCmp;
        return Number(BigInt(a.logIndex ?? 0) - BigInt(b.logIndex ?? 0));
      });

      if (logs.length === 0) {
        await this.repository.setCursor(CURSOR_NAME, toBlock, -1);
        fromBlock = toBlock + 1n;
        continue;
      }

      for (const log of logs) {
        const decoded = this.chain.decodeLog(log);
        if (!decoded) {
          continue;
        }

        const fresh = await this.repository.markProcessed(decoded);
        if (!fresh) {
          continue;
        }

        try {
          await this.handleLog(decoded);
        } catch (error) {
          // Roll back dedupe marker so the log is retried on the next tick.
          await this.repository.unmarkProcessed(decoded);
          throw error;
        }
      }

      // Cursor checkpoint for a fully processed block range.
      await this.repository.setCursor(CURSOR_NAME, toBlock, -1);
      fromBlock = toBlock + 1n;
    }
  }

  private async handleLog(log: DecodedLog): Promise<void> {
    const args = log.args as Record<string, unknown>;

    if (log.eventName === "CharacterCreated") {
      const characterId = asBigInt(args.characterId);
      const levelUpEpoch = await this.chain.readGameWorld<bigint>("characterLastLevelUpEpoch", [characterId]);
      await this.repository.upsertCharacterCreated({
        characterId,
        owner: asAddress(args.owner),
        race: Number(args.race),
        classType: Number(args.classType),
        name: String(args.name),
        levelUpEpoch,
        blockNumber: log.blockNumber
      });
      await this.repository.insertDelta(log, characterId);
      return;
    }

    if (log.eventName === "CharacterLevelUpdated") {
      const characterId = asBigInt(args.characterId);
      const owner = await this.chain.readGameWorld<`0x${string}`>("ownerOfCharacter", [characterId]);
      await this.repository.upsertCharacterLevel({
        characterId,
        owner,
        bestLevel: Number(args.newLevel),
        lastLevelUpEpoch: asBigInt(args.lastLevelUpEpoch),
        blockNumber: log.blockNumber
      });
      await this.repository.insertDelta(log, characterId);
      return;
    }

    if (
      log.eventName === "LootboxCredited" ||
      log.eventName === "LootboxOpened" ||
      log.eventName === "LootboxOpenMaxResolved"
    ) {
      const characterId = asBigInt(args.characterId);
      const tier = Number(args.tier);
      await this.refreshLootboxCredit(characterId, tier, log.blockNumber);
      await this.repository.insertDelta(log, characterId);
      return;
    }

    if (log.eventName === "ItemEquipped") {
      const characterId = asBigInt(args.characterId);
      await this.repository.upsertEquipment({
        characterId,
        slot: Number(args.slot),
        itemId: asBigInt(args.itemId),
        blockNumber: log.blockNumber
      });
      await this.repository.insertDelta(log, characterId);
      return;
    }

    if (log.eventName === "UpgradeStoneGranted" || log.eventName === "ItemRerolled" || log.eventName === "SetPieceForged") {
      const characterId = asBigInt(args.characterId);
      const balance = await this.chain.readGameWorld<number>("upgradeStoneBalance", [characterId]);
      await this.repository.upsertUpgradeStone({
        characterId,
        balance,
        blockNumber: log.blockNumber
      });
      await this.repository.insertDelta(log, characterId);
      return;
    }

    if (log.eventName === "EpochFinalized") {
      await this.repository.upsertEpochState({
        epochId: asBigInt(args.epochId),
        finalized: true,
        cutoffLevel: Number(args.cutoffLevel),
        totalEligibleWeight: asBigInt(args.totalEligibleWeight),
        feesForPlayers: asBigInt(args.feesForPlayers),
        feesForDeployer: asBigInt(args.feesForDeployer),
        blockNumber: log.blockNumber
      });
      await this.repository.insertDelta(log, null);
      return;
    }

    if (log.eventName === "PlayerClaimed") {
      await this.repository.upsertPlayerClaim({
        epochId: asBigInt(args.epochId),
        characterId: asBigInt(args.characterId),
        owner: asAddress(args.owner),
        amount: asBigInt(args.amount),
        txHash: log.transactionHash,
        blockNumber: log.blockNumber
      });
      await this.repository.insertDelta(log, asBigInt(args.characterId));
      return;
    }

    if (log.eventName === "RFQCreated") {
      await this.repository.upsertRfq({
        rfqId: asBigInt(args.rfqId),
        maker: asAddress(args.maker),
        slot: Number(args.slot),
        minTier: Number(args.minTier),
        setMask: asBigInt(args.setMask),
        mmoOffered: asBigInt(args.mmoOffered),
        expiry: asBigInt(args.expiry),
        active: true,
        filled: false,
        blockNumber: log.blockNumber
      });
      await this.repository.insertDelta(log, null);
      return;
    }

    if (log.eventName === "RFQFilled") {
      await this.repository.updateRfqStatus({
        rfqId: asBigInt(args.rfqId),
        active: false,
        filled: true,
        blockNumber: log.blockNumber
      });
      await this.repository.insertDelta(log, null);
      return;
    }

    if (log.eventName === "RFQCancelled") {
      await this.repository.updateRfqStatus({
        rfqId: asBigInt(args.rfqId),
        active: false,
        filled: false,
        blockNumber: log.blockNumber
      });
      await this.repository.insertDelta(log, null);
      return;
    }

    if (log.eventName === "OfferCreated") {
      await this.repository.upsertTradeOffer({
        offerId: asBigInt(args.offerId),
        maker: asAddress(args.maker),
        requestedMmo: asBigInt(args.requestedMmo),
        offeredItemIds: asBigIntArray(args.offeredItemIds),
        requestedItemIds: asBigIntArray(args.requestedItemIds),
        active: true,
        blockNumber: log.blockNumber
      });
      await this.repository.insertDelta(log, null);
      return;
    }

    if (log.eventName === "OfferCancelled" || log.eventName === "OfferFulfilled") {
      await this.repository.updateTradeOfferActive(asBigInt(args.offerId), false, log.blockNumber);
      await this.repository.insertDelta(log, null);
      return;
    }

    if (Object.prototype.hasOwnProperty.call(args, "characterId")) {
      await this.repository.insertDelta(log, asBigInt(args.characterId));
    }
  }

  private async refreshLootboxCredit(characterId: bigint, tier: number, blockNumber: bigint): Promise<void> {
    const [total, stable, neutral, swingy] = await Promise.all([
      this.chain.readGameWorld<number>("lootboxCredits", [characterId, tier]),
      this.chain.readGameWorld<number>("lootboxBoundCredits", [characterId, tier, 0]),
      this.chain.readGameWorld<number>("lootboxBoundCredits", [characterId, tier, 1]),
      this.chain.readGameWorld<number>("lootboxBoundCredits", [characterId, tier, 2])
    ]);

    await this.repository.upsertLootboxCredits({
      characterId,
      tier,
      total,
      boundStable: stable,
      boundNeutral: neutral,
      boundSwingy: swingy,
      blockNumber
    });
  }
}

function asBigInt(value: unknown): bigint {
  if (typeof value === "bigint") {
    return value;
  }
  if (typeof value === "number") {
    return BigInt(value);
  }
  if (typeof value === "string") {
    return BigInt(value);
  }
  throw new Error("expected_bigint");
}

function asAddress(value: unknown): `0x${string}` {
  if (typeof value !== "string" || !value.startsWith("0x")) {
    throw new Error("expected_address");
  }
  return value as `0x${string}`;
}

function asBigIntArray(value: unknown): bigint[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => asBigInt(entry));
}

function minBigInt(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

function isGetLogsRangeLimit(error: unknown): boolean {
  const anyError = error as any;
  const details = typeof anyError?.details === "string" ? anyError.details : "";
  const message = typeof anyError?.message === "string" ? anyError.message : "";
  const combined = `${message} ${details}`.toLowerCase();

  // Keep this intentionally fuzzy across providers.
  return combined.includes("eth_getlogs") && (combined.includes("block range") || combined.includes("up to a"));
}

function isRateLimitError(error: unknown): boolean {
  const anyError = error as any;
  const details = typeof anyError?.details === "string" ? anyError.details : "";
  const message = typeof anyError?.message === "string" ? anyError.message : "";
  const combined = `${message} ${details}`.toLowerCase();

  return (
    combined.includes("429") ||
    combined.includes("too many requests") ||
    combined.includes("rate limit") ||
    combined.includes("rate-limit") ||
    combined.includes("max requests")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
