export type OwnerProfile = {
  xUserId: string;
  xUsername: string;
};

export type LeaderboardItem = {
  rank: number;
  characterId: number;
  owner: string;
  ownerProfile?: OwnerProfile | null;
  bestLevel: number;
  percentile: number;
  lastLevelUpEpoch?: number;
};

export type DiagnosticsResponse = {
  indexer?: {
    cursor?: {
      lastProcessedBlock: number;
      lastProcessedLogIndex: number;
      updatedAt: string;
    } | null;
    chainHeadBlock?: number | null;
    chainLagBlocks?: number | null;
  };
};

export type ExternalResponse = {
  chainId?: number;
  mmo?: {
    tokenAddress: string;
    poolAddress: string;
    source: string;
    url?: string;
  } | null;
} | null;

export type RewardsResponse = {
  avgFeesForPlayersWei?: string | null;
  latestFinalizedEpoch?: {
    epochId: number;
    feesForPlayersWei: string;
  } | null;
  currentEpoch?: {
    epochId: number;
    feesForPlayersWei: string;
    feesTotalWei: string;
    headBlock: number;
    fillCount?: number | null;
  } | null;
};

export type GrokHistoryItem = {
  messageId: string;
  sessionId: string;
  role: "user" | "assistant" | "action";
  content: string;
  metadata?: {
    txHash?: string;
    url?: string;
  } | null;
  createdAt: string;
};

export type GrokStatusResponse = {
  online?: boolean;
  queueDepth?: number;
  lastSeenAt?: string | null;
  agentAddress?: string | null;
  agentCharacterId?: number | null;
};

export type FeedEvent = {
  blockNumber: number;
  logIndex: number;
  txHash: string;
  owner: string | null;
  createdAt: string;
  characterId: number | null;
  kind: string;
  payload: Record<string, unknown>;
};

export type FeedResponse = {
  items: FeedEvent[];
};

export type AgentCharacter = {
  characterId: number;
  owner: string;
  race: number;
  classType: number;
  name: string;
  bestLevel: number;
  lastLevelUpEpoch: number;
};

export type AgentCharactersResponse = {
  owner: string;
  items: AgentCharacter[];
};

export type MarketRfqsResponse = {
  nowUnix: number;
  totalActiveCount?: number;
  totalFilledCount?: number;
  items: Array<{
    rfqId: number;
    maker: string;
    slot: number;
    minTier: number;
    mmoOfferedWei: string;
    expiryUnix: number;
    setMask?: string;
    acceptedSetIds?: number[];
    acceptsAnySet?: boolean;
    active: boolean;
    filled: boolean;
    isExpired: boolean;
    fillableNow?: boolean;
  }>;
};

export type AgentNextAction = {
  goal: string;
  actionType: string;
  reason: string;
};

export type AgentLootboxCredit = {
  tier: number;
  total: number;
  bound: {
    stable: number;
    neutral: number;
    swingy: number;
  };
};

export type AgentEquipmentItem = {
  itemId: string;
  slot: number;
  tier: number;
  seed: string;
  varianceMode: number;
  set: number | null;
  bonuses: {
    hp: number;
    mana: number;
    def: number;
    atkM: number;
    atkR: number;
  };
};

export type AgentRunState = {
  active: boolean;
  roomCount: number;
  roomsCleared: number;
  currentHp: number;
  currentMana: number;
  maxHp?: number;
  maxMana?: number;
  hpPotionCharges: number;
  manaPotionCharges: number;
  powerPotionCharges: number;
  dungeonLevel: number;
  difficulty: number;
  varianceMode: number;
  equippedSlotCount: number;
  requiredEquippedSlots: number;
};

export type AgentProgression = {
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
};

export type AgentBuildPressure = {
  missingSetPieces: number;
  missingMatchingSetPieces: number;
  missingHighAffixPieces: number;
  suggestedSetBand: number;
  suggestedSetIdMin: number;
  suggestedSetIdMax: number;
  estimatedPenaltyBps: number;
};

export type AgentStatePayload = {
  character: {
    characterId: number;
    owner: string;
    race: number;
    classType: number;
    name: string;
    bestLevel: number;
    lastLevelUpEpoch: number;
  };
  runState: AgentRunState;
  progression: AgentProgression;
  buildPressure: AgentBuildPressure;
  lootboxCredits: AgentLootboxCredit[];
  equipment: {
    items: AgentEquipmentItem[];
    derivedStats: {
      hp: number;
      mana: number;
      def: number;
      atkM: number;
      atkR: number;
      setCounts: Record<string, number>;
    };
  };
  economy: {
    nativeBalanceWei: string;
    mmoBalanceWei: string;
    upgradeStoneBalance: number;
  };
  leaderboardMeta: {
    claimableEpochsCount: number;
    lastClaimedEpoch: number | null;
    pendingEstimatedShareWei: string;
    leaderboardUpdatedAtBlock: number;
    indexingLagBlocks: number;
  };
  nextBestActions: AgentNextAction[];
};

export type LeaderboardEpochMeta = {
  epochId: number;
  cutoffLevel: number;
  finalized: boolean;
  feesForPlayersWei: string;
  feesForDeployerWei: string;
  totalEligibleWeight: string;
  updatedBlock: number;
};

export type LeaderboardEpochClaim = {
  epochId: number;
  eligible: boolean;
  claimed: boolean;
  claimTxHash: string | null;
  feesForPlayers: string;
  totalEligibleWeight: string;
};

export type LeaderboardClaimsResponse = {
  characterId: number;
  claimableEpochs: LeaderboardEpochClaim[];
  allEpochs: LeaderboardEpochClaim[];
};
