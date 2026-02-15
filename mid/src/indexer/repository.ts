import type { Hex } from "viem";
import { Database } from "../storage/db.js";
import type { DecodedLog } from "../chain-adapter/client.js";

export interface IndexerCursor {
  lastProcessedBlock: bigint;
  lastProcessedLogIndex: number;
}

export class IndexerRepository {
  public constructor(private readonly db: Database, private readonly chainId: number) {}

  public async getCursor(name: string, defaultBlock: bigint): Promise<IndexerCursor> {
    const rows = await this.db.query<{ last_processed_block: string; last_processed_log_index: number }>(
      "SELECT last_processed_block, last_processed_log_index FROM indexer_cursor WHERE name = $1",
      [name]
    );
    if (rows.length === 0) {
      await this.db.query(
        `INSERT INTO indexer_cursor(name, last_processed_block, last_processed_log_index)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO NOTHING`,
        [name, defaultBlock.toString(), -1]
      );
      return { lastProcessedBlock: defaultBlock, lastProcessedLogIndex: -1 };
    }

    return {
      lastProcessedBlock: BigInt(rows[0].last_processed_block),
      lastProcessedLogIndex: rows[0].last_processed_log_index
    };
  }

  public async setCursor(name: string, blockNumber: bigint, logIndex: number): Promise<void> {
    await this.db.query(
      `INSERT INTO indexer_cursor(name, last_processed_block, last_processed_log_index, updated_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (name) DO UPDATE SET
         last_processed_block = EXCLUDED.last_processed_block,
         last_processed_log_index = EXCLUDED.last_processed_log_index,
         updated_at = NOW()`,
      [name, blockNumber.toString(), logIndex]
    );
  }

  public async markProcessed(log: DecodedLog): Promise<boolean> {
    const rows = await this.db.query<{ tx_hash: string }>(
      `INSERT INTO processed_logs(chain_id, tx_hash, log_index, block_number, block_hash, address, topic0)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT DO NOTHING
       RETURNING tx_hash`,
      [
        this.chainId,
        log.transactionHash,
        log.logIndex,
        log.blockNumber.toString(),
        log.blockHash,
        log.address,
        ""
      ]
    );
    return rows.length > 0;
  }

  public async unmarkProcessed(log: DecodedLog): Promise<void> {
    await this.db.query("DELETE FROM processed_logs WHERE chain_id = $1 AND tx_hash = $2 AND log_index = $3", [
      this.chainId,
      log.transactionHash,
      log.logIndex
    ]);
  }

  public async upsertCharacterCreated(params: {
    characterId: bigint;
    owner: Hex;
    race: number;
    classType: number;
    name: string;
    levelUpEpoch: bigint;
    blockNumber: bigint;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO characters(character_id, owner, race, class_type, name, created_block, updated_block)
       VALUES($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT (character_id) DO UPDATE SET
         owner = EXCLUDED.owner,
         race = EXCLUDED.race,
         class_type = EXCLUDED.class_type,
         name = EXCLUDED.name,
         updated_block = EXCLUDED.updated_block`,
      [
        params.characterId.toString(),
        params.owner.toLowerCase(),
        params.race,
        params.classType,
        params.name,
        params.blockNumber.toString()
      ]
    );

    await this.db.query(
      `INSERT INTO character_level_state(character_id, owner, best_level, last_level_up_epoch, updated_block)
       VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT (character_id) DO UPDATE SET
         owner = EXCLUDED.owner,
         best_level = EXCLUDED.best_level,
         last_level_up_epoch = EXCLUDED.last_level_up_epoch,
         updated_block = EXCLUDED.updated_block`,
      [
        params.characterId.toString(),
        params.owner.toLowerCase(),
        params.levelUpEpoch.toString(),
        params.blockNumber.toString()
      ]
    );

    await this.db.query(
      `INSERT INTO character_upgrade_stone_state(character_id, balance, updated_block)
       VALUES ($1, 0, $2)
       ON CONFLICT (character_id) DO NOTHING`,
      [params.characterId.toString(), params.blockNumber.toString()]
    );
  }

  public async upsertCharacterLevel(params: {
    characterId: bigint;
    owner: Hex;
    bestLevel: number;
    lastLevelUpEpoch: bigint;
    blockNumber: bigint;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO character_level_state(character_id, owner, best_level, last_level_up_epoch, updated_block)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (character_id) DO UPDATE SET
         owner = EXCLUDED.owner,
         best_level = EXCLUDED.best_level,
         last_level_up_epoch = EXCLUDED.last_level_up_epoch,
         updated_block = EXCLUDED.updated_block`,
      [
        params.characterId.toString(),
        params.owner.toLowerCase(),
        params.bestLevel,
        params.lastLevelUpEpoch.toString(),
        params.blockNumber.toString()
      ]
    );
  }

  public async resetForChainRestart(name: string, safeHeadBlock: bigint): Promise<void> {
    const fallbackBlock = safeHeadBlock > 0n ? safeHeadBlock - 1n : 0n;

    await this.db.withTransaction(async (client) => {
      await client.query(
        "TRUNCATE TABLE " +
          "compact_event_delta, " +
          "leaderboard_claim_state, " +
          "leaderboard_epoch_state, " +
          "trade_offer_state, " +
          "rfq_state, " +
          "character_upgrade_stone_state, " +
          "character_equipment, " +
          "character_lootbox_credits, " +
          "character_level_state, " +
          "characters, " +
          "processed_logs, " +
          "action_submissions, " +
          "indexer_cursor " +
          "RESTART IDENTITY"
      );
      await client.query(
        `INSERT INTO indexer_cursor(name, last_processed_block, last_processed_log_index, updated_at)
         VALUES ($1, $2, $3, NOW())`,
        [name, fallbackBlock.toString(), -1]
      );
    });
  }

  public async upsertLootboxCredits(params: {
    characterId: bigint;
    tier: number;
    total: number;
    boundStable: number;
    boundNeutral: number;
    boundSwingy: number;
    blockNumber: bigint;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO character_lootbox_credits(
         character_id, tier, total_credits, variance_0, variance_1, variance_2, updated_block
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (character_id, tier) DO UPDATE SET
         total_credits = EXCLUDED.total_credits,
         variance_0 = EXCLUDED.variance_0,
         variance_1 = EXCLUDED.variance_1,
         variance_2 = EXCLUDED.variance_2,
         updated_block = EXCLUDED.updated_block`,
      [
        params.characterId.toString(),
        params.tier,
        params.total,
        params.boundStable,
        params.boundNeutral,
        params.boundSwingy,
        params.blockNumber.toString()
      ]
    );
  }

  public async upsertEquipment(params: {
    characterId: bigint;
    slot: number;
    itemId: bigint;
    blockNumber: bigint;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO character_equipment(character_id, slot, item_id, updated_block)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (character_id, slot) DO UPDATE SET
         item_id = EXCLUDED.item_id,
         updated_block = EXCLUDED.updated_block`,
      [params.characterId.toString(), params.slot, params.itemId.toString(), params.blockNumber.toString()]
    );
  }

  public async upsertUpgradeStone(params: {
    characterId: bigint;
    balance: number;
    blockNumber: bigint;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO character_upgrade_stone_state(character_id, balance, updated_block)
       VALUES ($1, $2, $3)
       ON CONFLICT (character_id) DO UPDATE SET
         balance = EXCLUDED.balance,
         updated_block = EXCLUDED.updated_block`,
      [params.characterId.toString(), params.balance, params.blockNumber.toString()]
    );
  }

  public async upsertEpochState(params: {
    epochId: bigint;
    finalized: boolean;
    cutoffLevel: number;
    totalEligibleWeight: bigint;
    feesForPlayers: bigint;
    feesForDeployer: bigint;
    blockNumber: bigint;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO leaderboard_epoch_state(
         epoch_id, finalized, cutoff_level, total_eligible_weight,
         fees_for_players, fees_for_deployer, updated_block
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (epoch_id) DO UPDATE SET
         finalized = EXCLUDED.finalized,
         cutoff_level = EXCLUDED.cutoff_level,
         total_eligible_weight = EXCLUDED.total_eligible_weight,
         fees_for_players = EXCLUDED.fees_for_players,
         fees_for_deployer = EXCLUDED.fees_for_deployer,
         updated_block = EXCLUDED.updated_block`,
      [
        params.epochId.toString(),
        params.finalized,
        params.cutoffLevel,
        params.totalEligibleWeight.toString(),
        params.feesForPlayers.toString(),
        params.feesForDeployer.toString(),
        params.blockNumber.toString()
      ]
    );
  }

  public async upsertPlayerClaim(params: {
    epochId: bigint;
    characterId: bigint;
    owner: Hex;
    amount: bigint;
    txHash: Hex;
    blockNumber: bigint;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO leaderboard_claim_state(epoch_id, character_id, claimed, amount, tx_hash, owner, updated_block)
       VALUES ($1, $2, TRUE, $3, $4, $5, $6)
       ON CONFLICT (epoch_id, character_id) DO UPDATE SET
         claimed = TRUE,
         amount = EXCLUDED.amount,
         tx_hash = EXCLUDED.tx_hash,
         owner = EXCLUDED.owner,
         updated_block = EXCLUDED.updated_block`,
      [
        params.epochId.toString(),
        params.characterId.toString(),
        params.amount.toString(),
        params.txHash,
        params.owner.toLowerCase(),
        params.blockNumber.toString()
      ]
    );
  }

  public async upsertRfq(params: {
    rfqId: bigint;
    maker: Hex;
    slot: number;
    minTier: number;
    setMask: bigint;
    mmoOffered: bigint;
    expiry: bigint;
    active: boolean;
    filled: boolean;
    blockNumber: bigint;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO rfq_state(rfq_id, maker, slot, min_tier, set_mask, mmo_offered, expiry, active, filled, updated_block)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       ON CONFLICT (rfq_id) DO UPDATE SET
         maker = EXCLUDED.maker,
         slot = EXCLUDED.slot,
         min_tier = EXCLUDED.min_tier,
         set_mask = EXCLUDED.set_mask,
         mmo_offered = EXCLUDED.mmo_offered,
         expiry = EXCLUDED.expiry,
         active = EXCLUDED.active,
         filled = EXCLUDED.filled,
         updated_block = EXCLUDED.updated_block`,
      [
        params.rfqId.toString(),
        params.maker.toLowerCase(),
        params.slot,
        params.minTier,
        params.setMask.toString(),
        params.mmoOffered.toString(),
        params.expiry.toString(),
        params.active,
        params.filled,
        params.blockNumber.toString()
      ]
    );
  }

  public async updateRfqStatus(params: {
    rfqId: bigint;
    active: boolean;
    filled?: boolean;
    blockNumber: bigint;
  }): Promise<void> {
    await this.db.query(
      `UPDATE rfq_state
       SET active = $2,
           filled = COALESCE($3, filled),
           updated_block = $4
       WHERE rfq_id = $1`,
      [params.rfqId.toString(), params.active, params.filled ?? null, params.blockNumber.toString()]
    );
  }

  public async upsertTradeOffer(params: {
    offerId: bigint;
    maker: Hex;
    requestedMmo: bigint;
    offeredItemIds: bigint[];
    requestedItemIds: bigint[];
    active: boolean;
    blockNumber: bigint;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO trade_offer_state(
         offer_id, maker, requested_mmo, offered_item_ids, requested_item_ids, active, updated_block
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (offer_id) DO UPDATE SET
         maker = EXCLUDED.maker,
         requested_mmo = EXCLUDED.requested_mmo,
         offered_item_ids = EXCLUDED.offered_item_ids,
         requested_item_ids = EXCLUDED.requested_item_ids,
         active = EXCLUDED.active,
         updated_block = EXCLUDED.updated_block`,
      [
        params.offerId.toString(),
        params.maker.toLowerCase(),
        params.requestedMmo.toString(),
        JSON.stringify(params.offeredItemIds.map((value) => value.toString())),
        JSON.stringify(params.requestedItemIds.map((value) => value.toString())),
        params.active,
        params.blockNumber.toString()
      ]
    );
  }

  public async updateTradeOfferActive(offerId: bigint, active: boolean, blockNumber: bigint): Promise<void> {
    await this.db.query(
      "UPDATE trade_offer_state SET active = $2, updated_block = $3 WHERE offer_id = $1",
      [offerId.toString(), active, blockNumber.toString()]
    );
  }

  public async insertDelta(log: DecodedLog, characterId: bigint | null): Promise<void> {
    await this.db.query(
      `INSERT INTO compact_event_delta(chain_id, block_number, log_index, tx_hash, character_id, kind, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
      [
        this.chainId,
        log.blockNumber.toString(),
        log.logIndex,
        log.transactionHash,
        characterId ? characterId.toString() : null,
        log.eventName,
        JSON.stringify(log.args, jsonBigIntReplacer)
      ]
    );
  }
}

function jsonBigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}
