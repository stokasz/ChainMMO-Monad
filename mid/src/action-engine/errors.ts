export interface NormalizedError {
  code: string;
  message: string;
  retryable: boolean;
}

const DIRECT_CODE_MAP: Array<{ match: string; code: string; retryable?: boolean }> = [
  { match: "CharacterNotFound", code: "PRECHECK_CHARACTER_NOT_FOUND" },
  { match: "OnlyCharacterOwner", code: "PRECHECK_ONLY_CHARACTER_OWNER" },
  { match: "RunNotActive", code: "PRECHECK_RUN_NOT_ACTIVE" },
  { match: "RunAlreadyActive", code: "PRECHECK_RUN_ALREADY_ACTIVE" },
  { match: "NotRunOwner", code: "PRECHECK_NOT_RUN_OWNER" },
  { match: "RoomAlreadyResolved", code: "PRECHECK_ROOM_ALREADY_RESOLVED" },
  { match: "AbilityUnavailable", code: "PRECHECK_ABILITY_UNAVAILABLE" },
  { match: "InsufficientMana", code: "PRECHECK_INSUFFICIENT_MANA" },
  { match: "InsufficientLootboxCredits", code: "PRECHECK_INSUFFICIENT_LOOTBOX_CREDITS" },
  { match: "AmountZero", code: "PRECHECK_INVALID_AMOUNT" },
  { match: "BatchTooLarge", code: "PRECHECK_BATCH_TOO_LARGE" },
  { match: "ArrayLengthMismatch", code: "PRECHECK_ARRAY_LENGTH_MISMATCH" },
  { match: "InvalidDungeonLevel", code: "PRECHECK_INVALID_DUNGEON_LEVEL" },
  { match: "InvalidDifficulty", code: "PRECHECK_INVALID_DIFFICULTY" },
  { match: "InvalidVarianceMode", code: "PRECHECK_INVALID_VARIANCE_MODE" },
  { match: "InvalidActionType", code: "PRECHECK_INVALID_ACTION_TYPE" },
  { match: "InsufficientCommitFee", code: "CHAIN_INSUFFICIENT_COMMIT_FEE" },
  { match: "InsufficientCreateFee", code: "CHAIN_INSUFFICIENT_CREATE_FEE" },
  { match: "InsufficientEth", code: "CHAIN_INSUFFICIENT_NATIVE_BALANCE" },
  { match: "InvalidEpoch", code: "CHAIN_INVALID_EPOCH" },
  { match: "EpochAlreadyFinalized", code: "CHAIN_EPOCH_ALREADY_FINALIZED" },
  { match: "EpochNotFinalized", code: "CHAIN_EPOCH_NOT_FINALIZED", retryable: true },
  { match: "AlreadyClaimed", code: "CHAIN_ALREADY_CLAIMED" },
  { match: "NotEligible", code: "CHAIN_NOT_ELIGIBLE" },
  { match: "OnlyDeployer", code: "PRECHECK_ONLY_DEPLOYER" },
  { match: "PolicyDeployerClaimDisabled", code: "POLICY_DEPLOYER_CLAIM_DISABLED" },
  { match: "OfferInactive", code: "CHAIN_OFFER_INACTIVE" },
  { match: "OfferExpired", code: "CHAIN_OFFER_EXPIRED" },
  { match: "OfferNotExpired", code: "CHAIN_OFFER_NOT_EXPIRED", retryable: true },
  { match: "NotOfferMaker", code: "CHAIN_NOT_OFFER_MAKER" },
  { match: "InvalidOffer", code: "PRECHECK_INVALID_OFFER" },
  { match: "NotItemOwner", code: "PRECHECK_NOT_ITEM_OWNER" },
  { match: "RevealTooEarly", code: "CHAIN_REVEAL_TOO_EARLY", retryable: true },
  { match: "RevealExpired", code: "CHAIN_REVEAL_EXPIRED" },
  { match: "InvalidActionForReveal", code: "CHAIN_INVALID_ACTION_FOR_REVEAL" },
  { match: "InvalidCommit", code: "CHAIN_INVALID_COMMIT" },
  { match: "CommitNotExpired", code: "CHAIN_COMMIT_NOT_EXPIRED" },
  { match: "CommitResolved", code: "CHAIN_COMMIT_RESOLVED" },
  { match: "InvalidReveal", code: "CHAIN_INVALID_REVEAL" },
  { match: "RFQInactive", code: "CHAIN_RFQ_INACTIVE" },
  { match: "RFQExpired", code: "CHAIN_RFQ_EXPIRED" },
  { match: "RFQItemMismatch", code: "CHAIN_RFQ_ITEM_MISMATCH" },
  { match: "NotRFQMaker", code: "CHAIN_NOT_RFQ_MAKER" },
  { match: "GearLockedDuringRun", code: "CHAIN_GEAR_LOCKED_DURING_RUN" },
  { match: "InsufficientUpgradeStones", code: "CHAIN_INSUFFICIENT_UPGRADE_STONES" },
  { match: "InsufficientEquippedSlots", code: "PRECHECK_INSUFFICIENT_EQUIPPED_SLOTS" },
  { match: "PotionUnavailable", code: "PRECHECK_POTION_UNAVAILABLE" },
  { match: "ItemNotEquipped", code: "CHAIN_ITEM_NOT_EQUIPPED" }
];

export function normalizeError(error: unknown): NormalizedError {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  for (const entry of DIRECT_CODE_MAP) {
    if (message.includes(entry.match) || lower.includes(entry.match.toLowerCase())) {
      return {
        code: entry.code,
        message,
        retryable: entry.retryable ?? false
      };
    }
  }

  if (
    lower.includes("too many requests") ||
    lower.includes("rate limit") ||
    lower.includes("429")
  ) {
    return {
      code: "INFRA_RATE_LIMIT",
      message,
      retryable: true
    };
  }

  if (
    lower.includes("nonce too low") ||
    lower.includes("replacement transaction underpriced") ||
    lower.includes("replacement fee too low") ||
    lower.includes("already known")
  ) {
    return {
      code: "INFRA_NONCE_CONFLICT",
      message,
      retryable: true
    };
  }

  if (
    lower.includes("max fee per gas less than block base fee") ||
    lower.includes("maxfeepergas less than block base fee") ||
    lower.includes("fee cap too low") ||
    (lower.includes("transaction underpriced") && !lower.includes("replacement transaction underpriced"))
  ) {
    return {
      code: "INFRA_FEE_TOO_LOW",
      message,
      retryable: true
    };
  }

  if (lower.includes("insufficient funds")) {
    return {
      code: "INFRA_INSUFFICIENT_FUNDS",
      message,
      retryable: false
    };
  }

  if (
    lower.includes("timeout") ||
    lower.includes("etimedout") ||
    lower.includes("timed out") ||
    lower.includes("econn") ||
    lower.includes("fetch failed") ||
    lower.includes("socket")
  ) {
    return {
      code: "INFRA_TRANSIENT_ERROR",
      message,
      retryable: true
    };
  }

  return {
    code: "INTERNAL_ERROR",
    message,
    retryable: false
  };
}
