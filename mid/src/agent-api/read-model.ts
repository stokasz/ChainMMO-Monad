import type { Hex } from "viem";
import { ChainAdapter } from "../chain-adapter/client.js";
import type { Env } from "../config/env.js";
import { loadExternalTokensLatestFile, resolveExternalTokensLatestPath, type ExternalTokensLatest } from "../config/external-tokens.js";
import { decodeLeaderboardCursor, encodeLeaderboardCursor } from "../shared/leaderboard.js";
import { decodeAcceptedSetIds, isRfqExpired, rfqAcceptsSetId, toSetMaskBigInt } from "../shared/rfq.js";
import { feeVaultWeightForDelta } from "../shared/fixed-point.js";
import { castSignatures } from "../shared/cast-signatures.js";
import {
  abilityChoiceValues,
  classValues,
  difficultyValues,
  potionChoiceValues,
  raceValues,
  varianceModeValues
} from "../shared/enums.js";
import { Database } from "../storage/db.js";

export interface Page<T> {
  items: T[];
  nextCursor?: string;
}

export class AgentReadModel {
  private chainHeadCache: { blockNumber: number; fetchedAtMs: number } | null = null;
  private readonly externalTokensPath: string | null;
  private externalTokensLatest: ExternalTokensLatest | null | undefined = undefined;

  public constructor(
    private readonly env: Env,
    private readonly db: Database,
    private readonly chain: ChainAdapter
  ) {
    this.externalTokensPath = resolveExternalTokensLatestPath(env);
  }

  private getExternalTokensLatest(): ExternalTokensLatest | null {
    if (this.externalTokensLatest !== undefined) {
      return this.externalTokensLatest;
    }
    if (!this.externalTokensPath) {
      this.externalTokensLatest = null;
      return null;
    }
    try {
      const parsed = loadExternalTokensLatestFile(this.externalTokensPath);
      this.externalTokensLatest = parsed.chainId === this.env.CHAIN_ID ? parsed : null;
      return this.externalTokensLatest;
    } catch {
      this.externalTokensLatest = null;
      return null;
    }
  }

  public async getExternalMeta(): Promise<Record<string, unknown> | null> {
    return this.getExternalTokensLatest();
  }

  public async getAgentState(characterId: number): Promise<Record<string, unknown> | null> {
    const rows = await this.db.query<{
      character_id: string;
      owner: string;
      race: number;
      class_type: number;
      name: string;
      best_level: number;
      last_level_up_epoch: string;
      level_updated_block: string;
      upgrade_stones: number | null;
    }>(
      `SELECT
         c.character_id,
         c.owner,
         c.race,
         c.class_type,
         c.name,
         ls.best_level,
         ls.last_level_up_epoch,
         ls.updated_block AS level_updated_block,
         us.balance AS upgrade_stones
       FROM characters c
       JOIN character_level_state ls ON ls.character_id = c.character_id
       LEFT JOIN character_upgrade_stone_state us ON us.character_id = c.character_id
       WHERE c.character_id = $1`,
      [characterId]
    );

    if (rows.length === 0) {
      return null;
    }

    const character = rows[0];

    const [runState, runVariance, equippedSlotCount] = await Promise.all([
      this.chain.readGameWorld<readonly [
        boolean,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number
      ]>("getRunState", [BigInt(characterId)]),
      this.chain.readGameWorld<number>("runVarianceMode", [BigInt(characterId)]),
      this.chain.readGameWorld<number>("equippedSlotCount", [BigInt(characterId)])
    ]);
    const nextDungeonLevel = runState[0] ? runState[8] : character.best_level + 1;
    const [requiredEquippedSlots, rawProgressionSnapshot] = await Promise.all([
      this.chain.readGameWorld<number>("requiredEquippedSlots", [Math.min(Math.max(nextDungeonLevel, 1), 4_294_967_295)]),
      this.chain.readGameWorld<unknown>("getProgressionSnapshot", [BigInt(characterId)])
    ]);
    const progressionSnapshot = normalizeProgressionSnapshot(rawProgressionSnapshot);
    const rawBuildDeficits = await this.chain.readGameWorld<unknown>("recommendedBuildDeficits", [
      BigInt(characterId),
      progressionSnapshot.targetLevel
    ]);
    const buildDeficits = normalizeBuildDeficits(rawBuildDeficits);

    const lootboxCredits = await this.db.query<{
      tier: number;
      total_credits: number;
      variance_0: number;
      variance_1: number;
      variance_2: number;
    }>(
      `SELECT tier, total_credits, variance_0, variance_1, variance_2
       FROM character_lootbox_credits
       WHERE character_id = $1
       ORDER BY tier DESC`,
      [characterId]
    );

    const equipmentRows = await this.db.query<{ slot: number; item_id: string }>(
      `SELECT slot, item_id
       FROM character_equipment
       WHERE character_id = $1
       ORDER BY slot ASC`,
      [characterId]
    );

    const equippedItems = await Promise.all(
      equipmentRows.map(async (row) => {
        const itemId = BigInt(row.item_id);
        const [decoded, bonuses, setInfo] = await Promise.all([
          this.chain.readItems<readonly [number, number, bigint, number]>("decodeWithVariance", [itemId]),
          this.chain.readItems<readonly [number, number, number, number, number]>("deriveBonuses", [itemId]),
          this.chain.readItems<readonly [boolean, number]>("itemSetInfo", [itemId])
        ]);

        const [slot, tier, seed, varianceMode] = decoded;
        const [hp, mana, def, atkM, atkR] = bonuses;
        const [isSet, setId] = setInfo;

        return {
          itemId: itemId.toString(),
          slot,
          tier,
          seed: seed.toString(),
          varianceMode,
          set: isSet ? setId : null,
          bonuses: { hp, mana, def, atkM, atkR }
        };
      })
    );

    const aggregateStats = equippedItems.reduce(
      (acc, item) => {
        acc.hp += item.bonuses.hp;
        acc.mana += item.bonuses.mana;
        acc.def += item.bonuses.def;
        acc.atkM += item.bonuses.atkM;
        acc.atkR += item.bonuses.atkR;
        if (item.set !== null) {
          const key = String(item.set);
          acc.setCounts[key] = (acc.setCounts[key] ?? 0) + 1;
        }
        return acc;
      },
      {
        hp: 0,
        mana: 0,
        def: 0,
        atkM: 0,
        atkR: 0,
        setCounts: {} as Record<string, number>
      }
    );

    const [nativeBalance, mmoBalance] = await Promise.all([
      this.chain.getNativeBalance(character.owner as Hex),
      this.chain.readMmoBalance(character.owner as Hex)
    ]);

    const claimMeta = await this.getClaimMeta(characterId);

    const nextBestActions = buildNextBestActions({
      runActive: runState[0],
      lootboxCredits,
      equippedCount: equippedItems.length,
      equippedSlotCount,
      requiredEquippedSlots,
      upgradeStones: character.upgrade_stones ?? 0,
      missingMatchingSetPieces: buildDeficits.missingMatchingSetPieces,
      claimableEpochsCount: claimMeta.claimableEpochsCount
    });

    const { leaderboardUpdatedAtBlock, indexingLagBlocks } = await this.getIndexingMeta();

    return {
      character: {
        characterId,
        owner: character.owner,
        race: character.race,
        classType: character.class_type,
        name: character.name,
        bestLevel: character.best_level,
        lastLevelUpEpoch: Number(character.last_level_up_epoch)
      },
      runState: {
        active: runState[0],
        roomCount: runState[1],
        roomsCleared: runState[2],
        currentHp: runState[3],
        currentMana: runState[4],
        hpPotionCharges: runState[5],
        manaPotionCharges: runState[6],
        powerPotionCharges: runState[7],
        dungeonLevel: runState[8],
        difficulty: runState[9],
        varianceMode: runVariance,
        equippedSlotCount,
        requiredEquippedSlots
      },
      progression: progressionSnapshot,
      buildPressure: buildDeficits,
      lootboxCredits: lootboxCredits.map((row) => ({
        tier: row.tier,
        total: row.total_credits,
        bound: {
          stable: row.variance_0,
          neutral: row.variance_1,
          swingy: row.variance_2
        }
      })),
      equipment: {
        items: equippedItems,
        derivedStats: aggregateStats
      },
      economy: {
        nativeBalanceWei: nativeBalance.toString(),
        mmoBalanceWei: mmoBalance.toString(),
        upgradeStoneBalance: character.upgrade_stones ?? 0
      },
      leaderboardMeta: {
        claimableEpochsCount: claimMeta.claimableEpochsCount,
        lastClaimedEpoch: claimMeta.lastClaimedEpoch,
        pendingEstimatedShareWei: claimMeta.pendingEstimatedShareWei,
        leaderboardUpdatedAtBlock,
        indexingLagBlocks
      },
      nextBestActions
    };
  }

  public async getLiveLeaderboard(params: {
    limit: number;
    cursor?: string;
  }): Promise<Page<Record<string, unknown>> & Record<string, unknown>> {
    const decoded = params.cursor ? decodeLeaderboardCursor(params.cursor) : undefined;

    const queryParams: unknown[] = [];
    let cursorFilter = "";
    if (decoded) {
      queryParams.push(decoded.bestLevel, decoded.characterId);
      cursorFilter = `WHERE (best_level < $1 OR (best_level = $1 AND character_id > $2))`;
    }

    queryParams.push(params.limit + 1);

    const rows = await this.db.query<{
      character_id: string;
      owner: string;
      best_level: number;
      last_level_up_epoch: string;
      x_user_id: string | null;
      x_username: string | null;
      rank: string;
      total: string;
    }>(
      `SELECT * FROM (
         SELECT
           cls.character_id,
           cls.owner,
           cls.best_level,
           cls.last_level_up_epoch,
           wx.x_user_id,
           wx.x_username,
           ROW_NUMBER() OVER (ORDER BY best_level DESC, character_id ASC) AS rank,
           COUNT(*) OVER () AS total
         FROM character_level_state cls
         LEFT JOIN wallet_x_identity wx ON wx.address = cls.owner
       ) ranked
       ${cursorFilter}
       ORDER BY best_level DESC, character_id ASC
       LIMIT $${queryParams.length}`,
      queryParams
    );

    const hasMore = rows.length > params.limit;
    const sliced = hasMore ? rows.slice(0, params.limit) : rows;
    const nextCursor = hasMore
      ? encodeLeaderboardCursor({
          bestLevel: sliced[sliced.length - 1].best_level,
          characterId: Number(sliced[sliced.length - 1].character_id)
        })
      : undefined;

    const { leaderboardUpdatedAtBlock, indexingLagBlocks } = await this.getIndexingMeta();

    return {
      mode: "live",
      leaderboardUpdatedAtBlock,
      indexingLagBlocks,
      items: sliced.map((row) => {
        const total = Number(row.total);
        const rank = Number(row.rank);
        return {
          characterId: Number(row.character_id),
          owner: row.owner,
          ownerProfile: row.x_user_id && row.x_username ? { xUserId: row.x_user_id, xUsername: row.x_username } : null,
          bestLevel: row.best_level,
          rank,
          percentile: total === 0 ? 0 : Number((((total - rank) / total) * 100).toFixed(2)),
          lastLevelUpEpoch: Number(row.last_level_up_epoch)
        };
      }),
      nextCursor
    };
  }

  public async getEpochLeaderboard(params: {
    epochId: number;
    limit: number;
    cursor?: string;
  }): Promise<Page<Record<string, unknown>> & Record<string, unknown>> {
    const epochRows = await this.db.query<{
      epoch_id: string;
      finalized: boolean;
      cutoff_level: number;
      total_eligible_weight: string;
      fees_for_players: string;
      fees_for_deployer: string;
      updated_block: string;
    }>(
      `SELECT epoch_id, finalized, cutoff_level, total_eligible_weight, fees_for_players, fees_for_deployer, updated_block
       FROM leaderboard_epoch_state
       WHERE epoch_id = $1`,
      [params.epochId]
    );

    if (epochRows.length === 0) {
      return {
        mode: "epoch",
        epoch: null,
        items: []
      };
    }

    const epoch = epochRows[0];
    const decoded = params.cursor ? decodeLeaderboardCursor(params.cursor) : undefined;

    const queryParams: unknown[] = [params.epochId];
    let cursorFilter = "";
    if (decoded) {
      queryParams.push(decoded.bestLevel, decoded.characterId);
      cursorFilter = `
        WHERE (best_level < $2 OR (best_level = $2 AND character_id > $3))
      `;
    }

    queryParams.push(params.limit + 1);
    const limitParam = queryParams.length;

    const rows = await this.db.query<{
      character_id: string;
      owner: string;
      best_level: number;
      last_level_up_epoch: string;
      x_user_id: string | null;
      x_username: string | null;
      rank: string;
      total: string;
      claimed: boolean | null;
      claim_tx_hash: string | null;
    }>(
      `SELECT * FROM (
         SELECT
           ls.character_id,
           ls.owner,
           ls.best_level,
           ls.last_level_up_epoch,
           wx.x_user_id,
           wx.x_username,
           ROW_NUMBER() OVER (ORDER BY ls.best_level DESC, ls.character_id ASC) AS rank,
           COUNT(*) OVER () AS total,
           lcs.claimed,
           lcs.tx_hash AS claim_tx_hash
         FROM character_level_state ls
         LEFT JOIN wallet_x_identity wx ON wx.address = ls.owner
         LEFT JOIN leaderboard_claim_state lcs
           ON lcs.epoch_id = $1 AND lcs.character_id = ls.character_id
       ) ranked
       ${cursorFilter}
       ORDER BY best_level DESC, character_id ASC
       LIMIT $${limitParam}`,
      queryParams
    );

    const hasMore = rows.length > params.limit;
    const sliced = hasMore ? rows.slice(0, params.limit) : rows;

    const nextCursor = hasMore
      ? encodeLeaderboardCursor({
          bestLevel: sliced[sliced.length - 1].best_level,
          characterId: Number(sliced[sliced.length - 1].character_id)
        })
      : undefined;

    return {
      mode: "epoch",
      epoch: {
        epochId: Number(epoch.epoch_id),
        finalized: epoch.finalized,
        cutoffLevel: epoch.cutoff_level,
        totalEligibleWeight: epoch.total_eligible_weight,
        feesForPlayers: epoch.fees_for_players,
        feesForDeployer: epoch.fees_for_deployer,
        updatedBlock: Number(epoch.updated_block)
      },
      items: sliced.map((row) => ({
        characterId: Number(row.character_id),
        owner: row.owner,
        ownerProfile: row.x_user_id && row.x_username ? { xUserId: row.x_user_id, xUsername: row.x_username } : null,
        bestLevel: row.best_level,
        rank: Number(row.rank),
        percentile: Number(row.total) === 0 ? 0 : Number((((Number(row.total) - Number(row.rank)) / Number(row.total)) * 100).toFixed(2)),
        lastLevelUpEpoch: Number(row.last_level_up_epoch),
        eligible: epoch.finalized && row.best_level >= epoch.cutoff_level && Number(row.last_level_up_epoch) <= params.epochId,
        claimed: Boolean(row.claimed),
        claimTxHash: row.claim_tx_hash
      })),
      nextCursor
    };
  }

  public async getCharacterRank(characterId: number): Promise<Record<string, unknown> | null> {
    const rows = await this.db.query<{
      character_id: string;
      owner: string;
      best_level: number;
      last_level_up_epoch: string;
      x_user_id: string | null;
      x_username: string | null;
      rank: string;
      total: string;
    }>(
      `SELECT * FROM (
         SELECT
           cls.character_id,
           cls.owner,
           cls.best_level,
           cls.last_level_up_epoch,
           wx.x_user_id,
           wx.x_username,
           ROW_NUMBER() OVER (ORDER BY best_level DESC, character_id ASC) AS rank,
           COUNT(*) OVER () AS total
         FROM character_level_state cls
         LEFT JOIN wallet_x_identity wx ON wx.address = cls.owner
       ) ranked
       WHERE character_id = $1`,
      [characterId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    const claimMeta = await this.getClaimMeta(characterId);
    const { leaderboardUpdatedAtBlock, indexingLagBlocks } = await this.getIndexingMeta();

    return {
      characterId: Number(row.character_id),
      owner: row.owner,
      ownerProfile: row.x_user_id && row.x_username ? { xUserId: row.x_user_id, xUsername: row.x_username } : null,
      bestLevel: row.best_level,
      rank: Number(row.rank),
      percentile: Number(row.total) === 0 ? 0 : Number((((Number(row.total) - Number(row.rank)) / Number(row.total)) * 100).toFixed(2)),
      lastLevelUpEpoch: Number(row.last_level_up_epoch),
      claimableEpochsCount: claimMeta.claimableEpochsCount,
      lastClaimedEpoch: claimMeta.lastClaimedEpoch,
      pendingEstimatedShare: claimMeta.pendingEstimatedShareWei,
      leaderboardUpdatedAtBlock,
      indexingLagBlocks
    };
  }

  public async getLeaderboardEpoch(epochId: number): Promise<Record<string, unknown> | null> {
    const rows = await this.db.query<{
      epoch_id: string;
      finalized: boolean;
      cutoff_level: number;
      total_eligible_weight: string;
      fees_for_players: string;
      fees_for_deployer: string;
      updated_block: string;
    }>(
      `SELECT epoch_id, finalized, cutoff_level, total_eligible_weight, fees_for_players, fees_for_deployer, updated_block
       FROM leaderboard_epoch_state
       WHERE epoch_id = $1`,
      [epochId]
    );

    if (rows.length === 0) {
      return null;
    }

    const row = rows[0];
    return {
      epochId: Number(row.epoch_id),
      finalized: row.finalized,
      cutoffLevel: row.cutoff_level,
      totalEligibleWeight: row.total_eligible_weight,
      feesForPlayers: row.fees_for_players,
      feesForDeployer: row.fees_for_deployer,
      updatedBlock: Number(row.updated_block)
    };
  }

  public async getRewardsSummary(params: { windowEpochs: number }): Promise<Record<string, unknown>> {
    const windowEpochs = Math.max(1, Math.min(100, Math.trunc(params.windowEpochs)));
    const rows = await this.db.query<{
      epoch_id: string;
      fees_for_players: string;
      updated_block: string;
    }>(
      `SELECT epoch_id, fees_for_players, updated_block
       FROM leaderboard_epoch_state
       WHERE finalized = TRUE
       ORDER BY epoch_id DESC
       LIMIT $1`,
      [windowEpochs]
    );

    let sum = 0n;
    for (const row of rows) {
      sum += BigInt(row.fees_for_players);
    }

    const sampleEpochs = rows.length;
    const avgFeesForPlayersWei = sampleEpochs === 0 ? 0n : sum / BigInt(sampleEpochs);

    const latest = rows[0]
      ? {
          epochId: Number(rows[0].epoch_id),
          feesForPlayersWei: rows[0].fees_for_players,
          updatedBlock: Number(rows[0].updated_block)
        }
      : null;

    // Live pool: show the in-progress epoch's collected MON fees (premium lootboxes) without requiring finalizeEpoch().
    // Mirrors `GameConstants.EPOCH_IN_SECONDS = 1 hours` and `GameConstants.FEE_PLAYERS_BPS = 9000`.
    let currentEpoch: { epochId: number; feesTotalWei: string; feesForPlayersWei: string; headBlock: number } | null =
      null;
    try {
      const head = await withTimeout(this.chain.getBlockNumber(), 1_500);
      const headBlock = Number(head);
      if (!Number.isNaN(headBlock) && headBlock > 0) {
        const block = await withTimeout(this.chain.publicClient.getBlock({ blockNumber: head }), 1_500);
        const timestamp = Number(block.timestamp);
        const epochId = Math.floor(timestamp / (60 * 60));

        const feesTotalWei = await withTimeout(this.chain.readFeeVault<bigint>("epochEthFees", [epochId]), 1_500);
        const feesForPlayersWei = (feesTotalWei * 9_000n) / 10_000n;
        currentEpoch = {
          epochId,
          feesTotalWei: feesTotalWei.toString(),
          feesForPlayersWei: feesForPlayersWei.toString(),
          headBlock
        };
      }
    } catch {
      currentEpoch = null;
    }

    return {
      chainId: this.env.CHAIN_ID,
      windowEpochs,
      sampleEpochs,
      avgFeesForPlayersWei: avgFeesForPlayersWei.toString(),
      latestFinalizedEpoch: latest,
      currentEpoch
    };
  }

  public async getClaimableEpochs(characterId: number): Promise<Record<string, unknown>> {
    const rows = await this.db.query<{
      epoch_id: string;
      cutoff_level: number;
      claimed: boolean | null;
      tx_hash: string | null;
      fees_for_players: string;
      total_eligible_weight: string;
      best_level: number;
      last_level_up_epoch: string;
    }>(
      `SELECT
         les.epoch_id,
         les.cutoff_level,
         les.fees_for_players,
         les.total_eligible_weight,
         lcs.claimed,
         lcs.tx_hash,
         cls.best_level,
         cls.last_level_up_epoch
       FROM leaderboard_epoch_state les
       JOIN character_level_state cls ON cls.character_id = $1
       LEFT JOIN leaderboard_claim_state lcs
         ON lcs.epoch_id = les.epoch_id AND lcs.character_id = cls.character_id
       WHERE les.finalized = TRUE
       ORDER BY les.epoch_id DESC`,
      [characterId]
    );

    const epochs = rows.map((row) => {
      const eligible = row.best_level >= row.cutoff_level && Number(row.last_level_up_epoch) <= Number(row.epoch_id);
      return {
        epochId: Number(row.epoch_id),
        eligible,
        claimed: Boolean(row.claimed),
        claimTxHash: row.tx_hash,
        feesForPlayers: row.fees_for_players,
        totalEligibleWeight: row.total_eligible_weight
      };
    });

    return {
      characterId,
      claimableEpochs: epochs.filter((row) => row.eligible && !row.claimed),
      allEpochs: epochs
    };
  }

  public async getStateDeltas(characterId: number, sinceBlock?: number): Promise<Record<string, unknown>> {
    const rows = await this.db.query<{
      block_number: string;
      log_index: number;
      tx_hash: string;
      kind: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT block_number, log_index, tx_hash, kind, payload
       FROM compact_event_delta
       WHERE character_id = $1
         AND ($2::bigint IS NULL OR block_number > $2)
       ORDER BY block_number DESC, log_index DESC
       LIMIT 100`,
      [characterId, sinceBlock ?? null]
    );

    return {
      characterId,
      deltas: rows.map((row) => ({
        blockNumber: Number(row.block_number),
        logIndex: row.log_index,
        txHash: row.tx_hash,
        kind: row.kind,
        payload: row.payload
      }))
    };
  }

  public async getRecentStateDeltas(limit = 100, sinceBlock?: number): Promise<Record<string, unknown>> {
    const rows = await this.db.query<{
      block_number: string;
      log_index: number;
      tx_hash: string;
      character_id: string | null;
      owner: string | null;
      created_at: string;
      kind: string;
      payload: Record<string, unknown>;
    }>(
      `SELECT
         ced.block_number,
         ced.log_index,
         ced.tx_hash,
         ced.character_id,
         c.owner,
         ced.created_at,
         ced.kind,
         ced.payload
       FROM compact_event_delta AS ced
       LEFT JOIN characters AS c
         ON c.character_id = ced.character_id
       WHERE chain_id = $1
         AND ($2::bigint IS NULL OR block_number > $2)
       ORDER BY block_number DESC, log_index DESC
       LIMIT $3`,
          [this.env.CHAIN_ID, sinceBlock ?? null, Math.max(1, Math.min(100, limit))]
    );

    const headBlock = rows[0] ? Number(rows[0].block_number) : null;
    return {
      headBlock,
      items: rows.map((row) => ({
        blockNumber: Number(row.block_number),
        logIndex: row.log_index,
        txHash: row.tx_hash,
        characterId: row.character_id === null ? null : Number(row.character_id),
        owner: row.owner,
        createdAt: row.created_at,
        kind: row.kind,
        payload: row.payload
      })),
    };
  }

  public async getMarketRfqs(params: {
    limit: number;
    activeOnly: boolean;
    includeExpired: boolean;
    slot?: number;
    maxMinTier?: number;
    targetSetId?: number;
    maker?: string;
  }): Promise<Record<string, unknown>> {
    const nowUnix = Math.floor(Date.now() / 1000);
    const queryParams: unknown[] = [];
    const where: string[] = [];

    if (params.activeOnly) {
      where.push("active = TRUE");
    }

    if (!params.includeExpired) {
      queryParams.push(nowUnix);
      where.push(`(expiry = 0 OR expiry >= $${queryParams.length})`);
    }

    if (params.maker) {
      queryParams.push(params.maker.toLowerCase());
      where.push(`maker = $${queryParams.length}`);
    }

    if (typeof params.slot === "number") {
      queryParams.push(params.slot);
      where.push(`slot = $${queryParams.length}`);
    }

    if (typeof params.maxMinTier === "number") {
      queryParams.push(params.maxMinTier);
      where.push(`min_tier <= $${queryParams.length}`);
    }

    const fetchLimit = params.targetSetId === undefined ? params.limit : Math.min(params.limit * 5, 1_000);
    queryParams.push(fetchLimit);

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await this.db.query<{
      rfq_id: string;
      maker: string;
      slot: number;
      min_tier: number;
      set_mask: string;
      mmo_offered: string;
      expiry: string;
      active: boolean;
      filled: boolean;
      updated_block: string;
    }>(
      `SELECT
         rfq_id,
         maker,
         slot,
         min_tier,
         set_mask,
         mmo_offered,
         expiry,
         active,
         filled,
         updated_block
       FROM rfq_state
       ${whereClause}
       ORDER BY rfq_id DESC
       LIMIT $${queryParams.length}`,
      queryParams
    );

    const items: Array<Record<string, unknown>> = [];
    for (const row of rows) {
      const setMask = toSetMaskBigInt(row.set_mask);
      if (params.targetSetId !== undefined && !rfqAcceptsSetId(setMask, params.targetSetId)) {
        continue;
      }

      const expiry = Number(row.expiry);
      const isExpired = isRfqExpired(expiry, nowUnix);
      items.push({
        rfqId: Number(row.rfq_id),
        maker: row.maker,
        slot: row.slot,
        minTier: row.min_tier,
        setMask: row.set_mask,
        acceptsAnySet: setMask === 0n,
        acceptedSetIds: decodeAcceptedSetIds(setMask),
        mmoOfferedWei: row.mmo_offered,
        expiryUnix: expiry,
        isExpired,
        active: row.active,
        filled: row.filled,
        fillableNow: row.active && !row.filled && !isExpired,
        updatedBlock: Number(row.updated_block)
      });

      if (items.length >= params.limit) {
        break;
      }
    }

    const countRows = await this.db.query<{ cnt: string; filled_cnt: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE active = TRUE AND (expiry = 0 OR expiry >= $1)) AS cnt,
         COUNT(*) FILTER (WHERE filled = TRUE) AS filled_cnt
       FROM rfq_state`,
      [nowUnix]
    );
    const totalActiveCount = Number(countRows[0]?.cnt ?? 0);
    const totalFilledCount = Number(countRows[0]?.filled_cnt ?? 0);

    return {
      nowUnix,
      totalActiveCount,
      totalFilledCount,
      filters: {
        activeOnly: params.activeOnly,
        includeExpired: params.includeExpired,
        slot: params.slot ?? null,
        maxMinTier: params.maxMinTier ?? null,
        targetSetId: params.targetSetId ?? null,
        maker: params.maker ?? null,
        limit: params.limit
      },
      items
    };
  }

  public async getMarketTrades(params: {
    limit: number;
    activeOnly: boolean;
    maker?: string;
  }): Promise<Record<string, unknown>> {
    const queryParams: unknown[] = [];
    const where: string[] = [];

    if (params.activeOnly) {
      where.push("active = TRUE");
    }

    if (params.maker) {
      queryParams.push(params.maker.toLowerCase());
      where.push(`maker = $${queryParams.length}`);
    }

    queryParams.push(params.limit);
    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

    const rows = await this.db.query<{
      offer_id: string;
      maker: string;
      requested_mmo: string;
      offered_item_ids: string;
      requested_item_ids: string;
      active: boolean;
      updated_block: string;
    }>(
      `SELECT
         offer_id,
         maker,
         requested_mmo,
         offered_item_ids,
         requested_item_ids,
         active,
         updated_block
       FROM trade_offer_state
       ${whereClause}
       ORDER BY offer_id DESC
       LIMIT $${queryParams.length}`,
      queryParams
    );

    const nowUnix = Math.floor(Date.now() / 1000);
    const items = await Promise.all(rows.map((row) => this.hydrateTradeOffer(row, nowUnix)));

    return {
      nowUnix,
      filters: {
        activeOnly: params.activeOnly,
        maker: params.maker ?? null,
        limit: params.limit
      },
      items
    };
  }

  public async getMarketTradeOffer(offerId: number): Promise<Record<string, unknown> | null> {
    const rows = await this.db.query<{
      offer_id: string;
      maker: string;
      requested_mmo: string;
      offered_item_ids: string;
      requested_item_ids: string;
      active: boolean;
      updated_block: string;
    }>(
      `SELECT
         offer_id,
         maker,
         requested_mmo,
         offered_item_ids,
         requested_item_ids,
         active,
         updated_block
       FROM trade_offer_state
       WHERE offer_id = $1`,
      [offerId]
    );

    if (rows.length === 0) {
      return null;
    }

    return this.hydrateTradeOffer(rows[0], Math.floor(Date.now() / 1000));
  }

  public getContractMeta(): Record<string, unknown> {
    const xProfile = this.env.X_PROFILE_URL;

    return {
      chainId: this.env.CHAIN_ID,
      gameWorld: this.env.GAMEWORLD_ADDRESS,
      feeVault: this.env.FEEVAULT_ADDRESS,
      items: this.env.ITEMS_ADDRESS,
      distributor: this.env.MMODISTRIBUTOR_ADDRESS ?? null,
      mmoToken: this.env.MMO_ADDRESS,
      tradeEscrow: this.env.TRADE_ESCROW_ADDRESS,
      rfqMarket: this.env.RFQ_MARKET_ADDRESS,
      xProfile
    };
  }

  private async hydrateTradeOffer(
    row: {
      offer_id: string;
      maker: string;
      requested_mmo: string;
      offered_item_ids: string;
      requested_item_ids: string;
      active: boolean;
      updated_block: string;
    },
    nowUnix: number
  ): Promise<Record<string, unknown>> {
    const offerId = BigInt(row.offer_id);
    const [onChain, onChainOffered, onChainRequested] = await Promise.all([
      this.chain.readTradeEscrow<readonly [Hex, bigint, bigint, boolean]>("offers", [offerId]),
      this.chain.readTradeEscrow<bigint[]>("offeredItems", [offerId]),
      this.chain.readTradeEscrow<bigint[]>("requestedItems", [offerId])
    ]);

    const offeredFromDb = parseJsonStringArray(row.offered_item_ids);
    const requestedFromDb = parseJsonStringArray(row.requested_item_ids);
    const offeredItemIds =
      onChainOffered.length > 0 ? onChainOffered.map((value) => value.toString()) : offeredFromDb;
    const requestedItemIds =
      onChainRequested.length > 0 ? onChainRequested.map((value) => value.toString()) : requestedFromDb;
    const expiryUnix = Number(onChain[2]);
    const expired = expiryUnix > 0 && nowUnix > expiryUnix;
    const active = Boolean(onChain[3]);

    return {
      offerId: Number(row.offer_id),
      maker: row.maker,
      makerOnChain: onChain[0],
      requestedMmoWei: onChain[1].toString(),
      expiryUnix,
      expired,
      active,
      fillableNow: active && !expired,
      offeredItemIds,
      requestedItemIds,
      updatedBlock: Number(row.updated_block)
    };
  }

  public async getCommitFee(): Promise<Record<string, unknown>> {
    const commitFee = await this.chain.readGameWorld<bigint>("commitFee", []);
    return {
      chainId: this.env.CHAIN_ID,
      commitFeeWei: commitFee.toString()
    };
  }

  public async getFeeEstimate(): Promise<Record<string, unknown>> {
    const fee = await this.chain.getFeeEstimate();
    return {
      maxFeePerGasWei: fee.maxFeePerGas.toString(),
      source: fee.source
    };
  }

  public async getNativeBalance(address: Hex): Promise<Record<string, unknown>> {
    const balance = await this.chain.getNativeBalance(address);
    return {
      address,
      balanceWei: balance.toString()
    };
  }

  public async getCommitWindow(commitId: number): Promise<Record<string, unknown>> {
    const [startBlock, endBlock, canReveal, expired, resolved] = await this.chain.readGameWorld<
      readonly [bigint, bigint, boolean, boolean, boolean]
    >("revealWindow", [BigInt(commitId)]);
    const currentBlock = await this.chain.getBlockNumber();

    return {
      commitId,
      currentBlock: normalizeNumber(currentBlock),
      startBlock: normalizeNumber(startBlock),
      endBlock: normalizeNumber(endBlock),
      canReveal: Boolean(canReveal),
      expired: Boolean(expired),
      resolved: Boolean(resolved)
    };
  }

  public async getPotionBalance(
    characterId: number,
    potionType: number,
    potionTier: number
  ): Promise<Record<string, unknown>> {
    const balance = await this.chain.readGameWorld<number | bigint>("potionBalance", [
      BigInt(characterId),
      potionType,
      potionTier
    ]);

    return {
      characterId,
      potionType,
      potionTier,
      balance: normalizeNumber(balance)
    };
  }

  public async listMyCharacters(owner: Hex): Promise<Record<string, unknown>> {
    const rows = await this.db.query<{
      character_id: string;
      owner: string;
      race: number;
      class_type: number;
      name: string;
      best_level: number | null;
      last_level_up_epoch: string | null;
    }>(
      `SELECT
         c.character_id,
         c.owner,
         c.race,
         c.class_type,
         c.name,
         ls.best_level,
         ls.last_level_up_epoch
       FROM characters c
       LEFT JOIN character_level_state ls ON ls.character_id = c.character_id
       WHERE LOWER(c.owner) = LOWER($1)
       ORDER BY c.character_id ASC`,
      [owner]
    );

    return {
      owner,
      items: rows.map((row) => ({
        characterId: Number(row.character_id),
        owner: row.owner,
        race: row.race,
        classType: row.class_type,
        name: row.name,
        bestLevel: row.best_level ?? 0,
        lastLevelUpEpoch: Number(row.last_level_up_epoch ?? 0)
      }))
    };
  }

  public async getWorldRules(): Promise<Record<string, unknown>> {
    const [commitFeeWei, rfqCreateFeeWei] = await Promise.all([
      this.chain.readGameWorld<bigint>("commitFee", []),
      this.chain.readRfq<bigint>("createFee", [])
    ]);

    const slotGateLevels = [1, 10, 20, 30, 40, 60];
    const requiredEquippedSlots = await Promise.all(
      slotGateLevels.map(async (level) => ({
        level,
        requiredSlots: await this.chain.readGameWorld<number>("requiredEquippedSlots", [level])
      }))
    );

    return {
      chainId: this.env.CHAIN_ID,
      castSignatures,
      enums: {
        race: raceValues,
        classType: classValues,
        difficulty: difficultyValues,
        potionChoice: potionChoiceValues,
        abilityChoice: abilityChoiceValues,
        varianceMode: varianceModeValues
      },
      commitReveal: {
        revealWindowBlocks: {
          startOffset: 2,
          endOffset: 256
        },
        notes: [
          "nonce is a user-supplied uint64 salt included in the commit hash; it does not need cryptographic randomness (a counter is fine)",
          "nonce is public in the commit transaction; only the secret must be remembered until reveal",
          "secret can be fixed per wallet for agents; if you rotate secrets per commit, persist them until reveal"
        ]
      },
      fees: {
        commitFeeWei: commitFeeWei.toString(),
        rfqCreateFeeWei: rfqCreateFeeWei.toString()
      },
      limits: {
        maxBatchResolveChoices: 8,
        maxLootboxOpenAmount: 65535
      },
      requiredEquippedSlots
    };
  }

  public async quotePremiumPurchase(
    characterId: number,
    difficulty: number,
    amount: number,
    options: {
      monPriceUsdHint?: number;
    } = {}
  ): Promise<Record<string, unknown>> {
    const [totalEthCostWei, totalMmoCostWei] = await this.chain.readFeeVault<readonly [bigint, bigint]>("quotePremiumPurchase", [
      BigInt(characterId),
      difficulty,
      amount
    ]);

    let marginalEthCostWei = totalEthCostWei;
    let marginalMmoCostWei = totalMmoCostWei;
    if (amount > 1) {
      const [prevEthCostWei, prevMmoCostWei] = await this.chain.readFeeVault<readonly [bigint, bigint]>("quotePremiumPurchase", [
        BigInt(characterId),
        difficulty,
        amount - 1
      ]);
      marginalEthCostWei = totalEthCostWei - prevEthCostWei;
      marginalMmoCostWei = totalMmoCostWei - prevMmoCostWei;
    }

    const monPriceUsdHint = options.monPriceUsdHint;
    const usdView =
      typeof monPriceUsdHint === "number" && Number.isFinite(monPriceUsdHint) && monPriceUsdHint > 0
        ? {
            monPriceUsdHint,
            totalNativeUsd: weiToTokenFloat(totalEthCostWei) * monPriceUsdHint,
            marginalNativeUsd: weiToTokenFloat(marginalEthCostWei) * monPriceUsdHint,
            totalMmoUsdAssumingMonParity: weiToTokenFloat(totalMmoCostWei) * monPriceUsdHint,
            marginalMmoUsdAssumingMonParity: weiToTokenFloat(marginalMmoCostWei) * monPriceUsdHint
          }
        : null;

    return {
      chainId: this.env.CHAIN_ID,
      characterId,
      difficulty,
      amount,
      totalCost: {
        nativeWei: totalEthCostWei.toString(),
        mmoWei: totalMmoCostWei.toString()
      },
      marginalCost: {
        nativeWei: marginalEthCostWei.toString(),
        mmoWei: marginalMmoCostWei.toString()
      },
      usdView
    };
  }

  public async estimateEpochRoi(
    characterId: number,
    options: {
      windowEpochs?: number;
      pushCostWei?: bigint;
    } = {}
  ): Promise<Record<string, unknown> | null> {
    const [rankRaw, rewardsRaw] = await Promise.all([
      this.getCharacterRank(characterId),
      this.getRewardsSummary({ windowEpochs: options.windowEpochs ?? 5 })
    ]);

    if (!rankRaw) {
      return null;
    }

    const rank = rankRaw as Record<string, unknown>;
    const rewards = rewardsRaw as Record<string, unknown>;
    const percentile = typeof rank.percentile === "number" ? rank.percentile : 0;
    const topDecile = percentile >= 90;
    const pendingEstimatedShareWei = toBigIntSafe(rank.pendingEstimatedShare);
    const avgPoolWei = toBigIntSafe(rewards.avgFeesForPlayersWei);
    const pushCostWei = options.pushCostWei ?? 0n;
    const projectedNetWei = pendingEstimatedShareWei - pushCostWei;
    const projectedShareBps =
      avgPoolWei > 0n ? Number((pendingEstimatedShareWei * 10_000n) / avgPoolWei) : null;

    return {
      characterId,
      current: {
        rank: rank.rank ?? null,
        percentile,
        topDecile
      },
      economics: {
        avgPlayerPoolWei: avgPoolWei.toString(),
        pendingEstimatedShareWei: pendingEstimatedShareWei.toString(),
        projectedShareBps,
        pushCostWei: pushCostWei.toString(),
        projectedNetWei: projectedNetWei.toString()
      },
      notes: [
        "pendingEstimatedShareWei is based on finalized epoch snapshots and weighting approximation",
        "projectedShareBps is a heuristic ratio vs average player pool"
      ]
    };
  }

  public async getAgentBootstrap(): Promise<Record<string, unknown>> {
    const external = this.getExternalTokensLatest();
    const [commitFeeWei, rfqCreateFeeWei] = await Promise.all([
      this.chain.readGameWorld<bigint>("commitFee", []),
      this.chain.readRfq<bigint>("createFee", [])
    ]);

    return {
      chainId: this.env.CHAIN_ID,
      castSignatures,
      enums: {
        race: raceValues,
        classType: classValues,
        difficulty: difficultyValues,
        potionChoice: potionChoiceValues,
        abilityChoice: abilityChoiceValues,
        varianceMode: varianceModeValues
      },
      commitReveal: {
        revealWindowBlocks: {
          startOffset: 2,
          endOffset: 256
        },
        payable: {
          commitRequiredValueWei: commitFeeWei.toString(),
          note: "start_dungeon and open_lootboxes_max commits require msg.value=commitFee"
        },
        notes: [
          "nonce is a user-supplied uint64 salt included in the commit hash; it does not need cryptographic randomness (a counter is fine)",
          "nonce is public in the commit transaction; only the secret must be remembered until reveal",
          "secret can be fixed per wallet for agents; if you rotate secrets per commit, persist them until reveal"
        ]
      },
      payableFees: {
        commitFeeWei: commitFeeWei.toString(),
        rfqCreateFeeWei: rfqCreateFeeWei.toString()
      },
      safeLoop: [
        "get_health",
        "get_contracts",
        "get_external",
        "get_agent_bootstrap",
        "get_agent_state",
        "get_valid_actions",
        "preflight_action",
        "estimate_action_cost",
        "build_tx_intent",
        "submit action",
        "poll action status",
        "repeat"
      ],
      canonicalToolOrder: [
        "get_health",
        "get_contracts",
        "get_external",
        "get_agent_bootstrap",
        "get_agent_state",
        "get_valid_actions",
        "preflight_action",
        "estimate_action_cost",
        "build_tx_intent",
        "create_character|start_dungeon|next_room|open_lootboxes_max|equip_best|reroll_item|forge_set_piece|buy_premium_lootboxes|finalize_epoch|claim_player|claim_deployer|create_trade_offer|fulfill_trade_offer|cancel_trade_offer|cancel_expired_trade_offer|create_rfq|fill_rfq|cancel_rfq"
      ],
      external: external ? { mmo: external.mmo } : null
    };
  }

  public async getDiagnostics(): Promise<Record<string, unknown>> {
    const nowUnix = Math.floor(Date.now() / 1000);

    const [cursorRows, updateRows] = await Promise.all([
      this.db.query<{
        name: string;
        last_processed_block: string;
        last_processed_log_index: number;
        updated_at: string;
      }>(
        "SELECT name, last_processed_block, last_processed_log_index, updated_at FROM indexer_cursor WHERE name = 'chainmmo_main'"
      ),
      this.db.query<{ updated_block: string }>("SELECT COALESCE(MAX(updated_block), 0) AS updated_block FROM character_level_state"),
    ]);

    const updatedBlock = Number(updateRows[0]?.updated_block ?? 0);

    const cursorRow = cursorRows[0];
    const cursor = cursorRow
      ? {
          name: cursorRow.name,
          lastProcessedBlock: Number(cursorRow.last_processed_block),
          lastProcessedLogIndex: Number(cursorRow.last_processed_log_index),
          updatedAt: cursorRow.updated_at
        }
      : null;

    const stateLagBlocks = cursor && updatedBlock > 0 ? Math.max(0, cursor.lastProcessedBlock - updatedBlock) : null;

    const chainHeadBlock = await this.getChainHeadBlockCached();
    const chainLagBlocks =
      cursor && chainHeadBlock !== null ? Math.max(0, chainHeadBlock - cursor.lastProcessedBlock) : null;

    return {
      nowUnix,
      chainId: this.env.CHAIN_ID,
      indexer: {
        cursor,
        chainHeadBlock,
        chainLagBlocks
      },
      leaderboard: {
        updatedAtBlock: updatedBlock,
        stateLagBlocks
      }
    };
  }

  private async getIndexingMeta(): Promise<{ leaderboardUpdatedAtBlock: number; indexingLagBlocks: number | null }> {
    const [cursorRows, updateRows] = await Promise.all([
      this.db.query<{ last_processed_block: string }>(
        "SELECT last_processed_block FROM indexer_cursor WHERE name = 'chainmmo_main'"
      ),
      this.db.query<{ updated_block: string }>("SELECT COALESCE(MAX(updated_block), 0) AS updated_block FROM character_level_state"),
    ]);

    const updatedBlock = Number(updateRows[0]?.updated_block ?? 0);
    const cursorBlockRaw = cursorRows[0]?.last_processed_block;
    const cursorBlock = cursorBlockRaw !== undefined ? Number(cursorBlockRaw) : null;
    const indexingLagBlocks =
      updatedBlock <= 0 || cursorBlock === null || Number.isNaN(cursorBlock) ? null : Math.max(0, cursorBlock - updatedBlock);

    return {
      leaderboardUpdatedAtBlock: updatedBlock,
      indexingLagBlocks
    };
  }

  private async getChainHeadBlockCached(): Promise<number | null> {
    const ttlMs = 10_000;
    const nowMs = Date.now();

    if (this.chainHeadCache && nowMs - this.chainHeadCache.fetchedAtMs < ttlMs) {
      return this.chainHeadCache.blockNumber;
    }

    try {
      const raw = await withTimeout(this.chain.getBlockNumber(), 1_500);
      const blockNumber = Number(raw);
      if (Number.isNaN(blockNumber)) {
        return null;
      }
      this.chainHeadCache = { blockNumber, fetchedAtMs: nowMs };
      return blockNumber;
    } catch {
      return null;
    }
  }

  private async getClaimMeta(characterId: number): Promise<{
    claimableEpochsCount: number;
    lastClaimedEpoch: number | null;
    pendingEstimatedShareWei: string;
  }> {
    const rows = await this.db.query<{
      epoch_id: string;
      cutoff_level: number;
      total_eligible_weight: string;
      fees_for_players: string;
      claimed: boolean | null;
      best_level: number;
      last_level_up_epoch: string;
    }>(
      `SELECT
         les.epoch_id,
         les.cutoff_level,
         les.total_eligible_weight,
         les.fees_for_players,
         lcs.claimed,
         cls.best_level,
         cls.last_level_up_epoch
       FROM leaderboard_epoch_state les
       JOIN character_level_state cls ON cls.character_id = $1
       LEFT JOIN leaderboard_claim_state lcs
         ON lcs.epoch_id = les.epoch_id AND lcs.character_id = cls.character_id
       WHERE les.finalized = TRUE
       ORDER BY les.epoch_id DESC`,
      [characterId]
    );

    let claimableEpochsCount = 0;
    let lastClaimedEpoch: number | null = null;
    let pendingEstimatedShare = 0n;

    for (const row of rows) {
      if (row.claimed && lastClaimedEpoch === null) {
        lastClaimedEpoch = Number(row.epoch_id);
      }
      const eligible = row.best_level >= row.cutoff_level && Number(row.last_level_up_epoch) <= Number(row.epoch_id);
      if (!eligible || row.claimed) {
        continue;
      }
      claimableEpochsCount += 1;

      const totalWeight = BigInt(row.total_eligible_weight);
      if (totalWeight === 0n) {
        continue;
      }
      const delta = Math.max(row.best_level - row.cutoff_level, 0);
      const weight = estimateWeight(delta);
      pendingEstimatedShare += (BigInt(row.fees_for_players) * weight) / totalWeight;
    }

    return {
      claimableEpochsCount,
      lastClaimedEpoch,
      pendingEstimatedShareWei: pendingEstimatedShare.toString()
    };
  }
}

function estimateWeight(delta: number): bigint {
  // Avoid float -> bigint precision loss (delta is clamped in-contract).
  return feeVaultWeightForDelta(delta);
}

function toBigIntSafe(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) return BigInt(Math.trunc(value));
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      return BigInt(value);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

function weiToTokenFloat(value: bigint): number {
  const sign = value < 0n ? -1 : 1;
  const abs = value < 0n ? -value : value;
  const whole = Number(abs / 1_000_000_000_000_000_000n);
  const frac = Number(abs % 1_000_000_000_000_000_000n) / 1e18;
  return sign * (whole + frac);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timeout")), timeoutMs);
      })
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

export function buildNextBestActions(input: {
  runActive: boolean;
  lootboxCredits: Array<{ total_credits: number }>;
  equippedCount: number;
  equippedSlotCount: number;
  requiredEquippedSlots: number;
  upgradeStones: number;
  missingMatchingSetPieces: number;
  claimableEpochsCount: number;
}): Array<{ goal: string; actionType: string; reason: string }> {
  const actions: Array<{ goal: string; actionType: string; reason: string }> = [];
  const seen = new Set<string>();
  const pushUnique = (goal: string, actionType: string, reason: string): void => {
    if (seen.has(actionType)) {
      return;
    }
    seen.add(actionType);
    actions.push({ goal, actionType, reason });
  };

  if (input.runActive) {
    pushUnique("leveling", "next_room", "Active run in progress");
  } else {
    if (input.equippedSlotCount < input.requiredEquippedSlots) {
      pushUnique(
        "gearing",
        "equip_best",
        `Need ${input.requiredEquippedSlots} equipped slots before this dungeon band`
      );
    }
    pushUnique(
      "leveling",
      "start_dungeon",
      input.equippedSlotCount < input.requiredEquippedSlots
        ? `Blocked until equipped slots meet requirement (${input.equippedSlotCount}/${input.requiredEquippedSlots})`
        : "No active run"
    );
  }

  if (input.lootboxCredits.some((row) => row.total_credits > 0)) {
    pushUnique("gearing", "open_lootboxes_max", "Lootbox credits available");
  }

  if (input.equippedCount < 8 && input.equippedSlotCount >= input.requiredEquippedSlots) {
    pushUnique("gearing", "equip_best", "Empty or weak equipment slots detected");
  }

  if (input.missingMatchingSetPieces > 0) {
    pushUnique(
      "gearing",
      "get_active_rfqs",
      `Matching set deficit detected (${input.missingMatchingSetPieces} piece${input.missingMatchingSetPieces === 1 ? "" : "s"})`
    );
  }

  if (input.upgradeStones > 0) {
    pushUnique("gearing", "reroll_item", "Upgrade stone available");

    if (input.missingMatchingSetPieces > 0) {
      pushUnique(
        "gearing",
        "forge_set_piece",
        `Matching set deficit detected (${input.missingMatchingSetPieces} piece${input.missingMatchingSetPieces === 1 ? "" : "s"})`
      );
    }
  }

  if (input.claimableEpochsCount > 0) {
    pushUnique("claim", "get_claimable_epochs", "Unclaimed finalized epochs available");
  }

  return actions;
}

function parseJsonStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.map((entry) => String(entry));
  } catch {
    return [];
  }
}

function normalizeNumber(value: unknown): number {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "string") {
    return Number(value);
  }
  return 0;
}

function normalizeProgressionSnapshot(raw: unknown): {
  bestLevel: number;
  targetLevel: number;
  requiredClears: number;
  currentClears: number;
  requiredSlots: number;
  equippedSlots: number;
  setPieces: number;
  matchingSetPieces: number;
  highAffixPieces: number;
  recommendedSetPieces: number;
  recommendedMatchingSetPieces: number;
  recommendedHighAffixPieces: number;
  repairFeeAmountWei: string;
  runEntryFeeAmountWei: string;
} {
  const value = raw as Record<string, unknown> | unknown[] | null;
  const get = (index: number, key: string) =>
    Array.isArray(value) ? value[index] : (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : 0);

  return {
    bestLevel: normalizeNumber(get(0, "bestLevel")),
    targetLevel: normalizeNumber(get(1, "targetLevel")),
    requiredClears: normalizeNumber(get(2, "requiredClears")),
    currentClears: normalizeNumber(get(3, "currentClears")),
    requiredSlots: normalizeNumber(get(4, "requiredSlots")),
    equippedSlots: normalizeNumber(get(5, "equippedSlots")),
    setPieces: normalizeNumber(get(6, "setPieces")),
    matchingSetPieces: normalizeNumber(get(7, "matchingSetPieces")),
    highAffixPieces: normalizeNumber(get(8, "highAffixPieces")),
    recommendedSetPieces: normalizeNumber(get(9, "recommendedSetPieces")),
    recommendedMatchingSetPieces: normalizeNumber(get(10, "recommendedMatchingSetPieces")),
    recommendedHighAffixPieces: normalizeNumber(get(11, "recommendedHighAffixPieces")),
    repairFeeAmountWei: String(get(12, "repairFeeAmount")),
    runEntryFeeAmountWei: String(get(13, "runEntryFeeAmount"))
  };
}

function normalizeBuildDeficits(raw: unknown): {
  missingSetPieces: number;
  missingMatchingSetPieces: number;
  missingHighAffixPieces: number;
  suggestedSetBand: number;
  suggestedSetIdMin: number;
  suggestedSetIdMax: number;
  estimatedPenaltyBps: number;
} {
  const value = raw as Record<string, unknown> | unknown[] | null;
  const get = (index: number, key: string) =>
    Array.isArray(value) ? value[index] : (value && typeof value === "object" ? (value as Record<string, unknown>)[key] : 0);

  return {
    missingSetPieces: normalizeNumber(get(0, "missingSetPieces")),
    missingMatchingSetPieces: normalizeNumber(get(1, "missingMatchingSetPieces")),
    missingHighAffixPieces: normalizeNumber(get(2, "missingHighAffixPieces")),
    suggestedSetBand: normalizeNumber(get(3, "suggestedSetBand")),
    suggestedSetIdMin: normalizeNumber(get(4, "suggestedSetIdMin")),
    suggestedSetIdMax: normalizeNumber(get(5, "suggestedSetIdMax")),
    estimatedPenaltyBps: normalizeNumber(get(6, "estimatedPenaltyBps"))
  };
}
