import { describe, expect, it } from "vitest";
import { normalizeError } from "../src/action-engine/errors.js";

describe("error normalization", () => {
  it("maps InsufficientEquippedSlots to deterministic precheck code", () => {
    const normalized = normalizeError(new Error("Execution reverted: InsufficientEquippedSlots()"));
    expect(normalized.code).toBe("PRECHECK_INSUFFICIENT_EQUIPPED_SLOTS");
    expect(normalized.retryable).toBe(false);
  });

  it("maps PotionUnavailable to deterministic precheck code", () => {
    const normalized = normalizeError(new Error("Execution reverted: PotionUnavailable()"));
    expect(normalized.code).toBe("PRECHECK_POTION_UNAVAILABLE");
    expect(normalized.retryable).toBe(false);
  });

  it("maps InsufficientCommitFee to deterministic fee code", () => {
    const normalized = normalizeError(new Error("Execution reverted: InsufficientCommitFee()"));
    expect(normalized.code).toBe("CHAIN_INSUFFICIENT_COMMIT_FEE");
    expect(normalized.retryable).toBe(false);
  });

  it("maps InsufficientCreateFee to deterministic fee code", () => {
    const normalized = normalizeError(new Error("Execution reverted: InsufficientCreateFee()"));
    expect(normalized.code).toBe("CHAIN_INSUFFICIENT_CREATE_FEE");
    expect(normalized.retryable).toBe(false);
  });

  it("maps reveal action-state failures to deterministic codes", () => {
    const invalidAction = normalizeError(new Error("Execution reverted: InvalidActionForReveal()"));
    const invalidCommit = normalizeError(new Error("Execution reverted: InvalidCommit()"));
    expect(invalidAction.code).toBe("CHAIN_INVALID_ACTION_FOR_REVEAL");
    expect(invalidCommit.code).toBe("CHAIN_INVALID_COMMIT");
  });

  it("maps run/action state failures to deterministic codes", () => {
    const notRunOwner = normalizeError(new Error("Execution reverted: NotRunOwner()"));
    const roomResolved = normalizeError(new Error("Execution reverted: RoomAlreadyResolved()"));
    expect(notRunOwner.code).toBe("PRECHECK_NOT_RUN_OWNER");
    expect(roomResolved.code).toBe("PRECHECK_ROOM_ALREADY_RESOLVED");
  });

  it("maps reward settlement errors to deterministic codes", () => {
    const notFinalized = normalizeError(new Error("Execution reverted: EpochNotFinalized()"));
    const alreadyClaimed = normalizeError(new Error("Execution reverted: AlreadyClaimed()"));
    const policyDisabled = normalizeError(new Error("PolicyDeployerClaimDisabled"));
    expect(notFinalized.code).toBe("CHAIN_EPOCH_NOT_FINALIZED");
    expect(alreadyClaimed.code).toBe("CHAIN_ALREADY_CLAIMED");
    expect(policyDisabled.code).toBe("POLICY_DEPLOYER_CLAIM_DISABLED");
  });

  it("maps trade escrow state errors to deterministic codes", () => {
    const inactive = normalizeError(new Error("Execution reverted: OfferInactive()"));
    const notExpired = normalizeError(new Error("Execution reverted: OfferNotExpired()"));
    const notMaker = normalizeError(new Error("Execution reverted: NotOfferMaker()"));
    expect(inactive.code).toBe("CHAIN_OFFER_INACTIVE");
    expect(notExpired.code).toBe("CHAIN_OFFER_NOT_EXPIRED");
    expect(notMaker.code).toBe("CHAIN_NOT_OFFER_MAKER");
  });

  it("maps RPC rate limits to a retryable infra code", () => {
    const normalized = normalizeError(new Error("429 Too Many Requests"));
    expect(normalized.code).toBe("INFRA_RATE_LIMIT");
    expect(normalized.retryable).toBe(true);
  });

  it("maps nonce conflicts to a retryable infra code", () => {
    const normalized = normalizeError(new Error("nonce too low"));
    expect(normalized.code).toBe("INFRA_NONCE_CONFLICT");
    expect(normalized.retryable).toBe(true);
  });

  it("maps replacement fee too low to a retryable infra code", () => {
    const normalized = normalizeError(new Error("replacement fee too low"));
    expect(normalized.code).toBe("INFRA_NONCE_CONFLICT");
    expect(normalized.retryable).toBe(true);
  });

  it("maps maxFeePerGas too low errors to a retryable infra code", () => {
    const normalized = normalizeError(new Error("max fee per gas less than block base fee"));
    expect(normalized.code).toBe("INFRA_FEE_TOO_LOW");
    expect(normalized.retryable).toBe(true);
  });

  it("maps insufficient funds to a non-retryable infra code", () => {
    const normalized = normalizeError(new Error("insufficient funds for gas * price + value"));
    expect(normalized.code).toBe("INFRA_INSUFFICIENT_FUNDS");
    expect(normalized.retryable).toBe(false);
  });

  it("maps RPC/network timeouts to a retryable transient infra code", () => {
    const normalized = normalizeError(new Error("ETIMEDOUT"));
    expect(normalized.code).toBe("INFRA_TRANSIENT_ERROR");
    expect(normalized.retryable).toBe(true);
  });
});
