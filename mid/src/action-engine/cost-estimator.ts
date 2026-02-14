import type { Hex } from "viem";
import { ChainAdapter } from "../chain-adapter/client.js";
import { normalizeError } from "./errors.js";
import type { AgentActionInput } from "../shared/schemas.js";

const ACTION_TYPE_LOOTBOX_OPEN = 1;
const ACTION_TYPE_DUNGEON_RUN = 2;
const FALLBACK_GAS_BY_ACTION: Record<AgentActionInput["type"], bigint> = {
  create_character: 550_000n,
  start_dungeon: 250_000n,
  next_room: 300_000n,
  open_lootboxes_max: 250_000n,
  equip_best: 450_000n,
  reroll_item: 220_000n,
  forge_set_piece: 260_000n,
  buy_premium_lootboxes: 240_000n,
  finalize_epoch: 280_000n,
  claim_player: 180_000n,
  claim_deployer: 150_000n,
  create_trade_offer: 320_000n,
  fulfill_trade_offer: 240_000n,
  cancel_trade_offer: 140_000n,
  cancel_expired_trade_offer: 140_000n,
  create_rfq: 240_000n,
  fill_rfq: 220_000n,
  cancel_rfq: 120_000n
};

export interface ActionCostEstimate {
  actionType: AgentActionInput["type"];
  code: string;
  reason: string;
  estimatedGas: string;
  maxFeePerGas: string;
  estimatedTxCostWei: string;
  requiredValueWei: string;
  totalEstimatedCostWei: string;
  signerNativeBalanceWei: string;
  canAfford: boolean;
}

export class ActionCostEstimator {
  private readonly signerAddress: Hex;

  public constructor(private readonly chain: ChainAdapter) {
    if (!chain.account) {
      throw new Error("wallet_client_unavailable");
    }
    this.signerAddress = chain.account.address;
  }

  public async estimate(action: AgentActionInput): Promise<ActionCostEstimate> {
    const [maxFeePerGas, signerBalance, requiredValueWei] = await Promise.all([
      this.chain.getFeeEstimate(),
      this.chain.getNativeBalance(this.signerAddress),
      this.resolveRequiredValue(action)
    ]);

    let estimatedGas: bigint;
    let code = "ESTIMATE_OK";
    let reason = "Estimated via eth_estimateGas";
    try {
      estimatedGas = await this.estimateGas(action, requiredValueWei);
    } catch (error) {
      const normalized = normalizeError(error);
      estimatedGas = FALLBACK_GAS_BY_ACTION[action.type];
      code = "ESTIMATE_FALLBACK";
      reason = `${normalized.code}: ${normalized.message}`;
    }

    const estimatedTxCostWei = estimatedGas * maxFeePerGas.maxFeePerGas;
    const totalEstimatedCostWei = estimatedTxCostWei + requiredValueWei;
    const canAfford = signerBalance >= totalEstimatedCostWei;

    return {
      actionType: action.type,
      code,
      reason,
      estimatedGas: estimatedGas.toString(),
      maxFeePerGas: maxFeePerGas.maxFeePerGas.toString(),
      estimatedTxCostWei: estimatedTxCostWei.toString(),
      requiredValueWei: requiredValueWei.toString(),
      totalEstimatedCostWei: totalEstimatedCostWei.toString(),
      signerNativeBalanceWei: signerBalance.toString(),
      canAfford
    };
  }

  private async resolveRequiredValue(action: AgentActionInput): Promise<bigint> {
    if (action.type === "start_dungeon" || action.type === "open_lootboxes_max") {
      return this.chain.readGameWorld<bigint>("commitFee", []);
    }
    if (action.type === "buy_premium_lootboxes") {
      const quote = await this.chain.readFeeVault<readonly [bigint, bigint]>("quotePremiumPurchase", [
        BigInt(action.characterId),
        action.difficulty,
        action.amount
      ]);
      return quote[0];
    }
    if (action.type === "create_trade_offer") {
      return this.chain.readTradeEscrow<bigint>("createFee", []);
    }
    if (action.type === "create_rfq") {
      return this.chain.readRfq<bigint>("createFee", []);
    }
    return 0n;
  }

  private async estimateGas(action: AgentActionInput, requiredValueWei: bigint): Promise<bigint> {
    switch (action.type) {
      case "create_character":
        return this.chain.estimateGameWorldGas("createCharacter", [action.race, action.classType, action.name]);
      case "start_dungeon": {
        const nonce = 1n;
        const secret = `0x${"11".repeat(32)}` as Hex;
        const commitHash = await this.chain.readGameWorld<Hex>("hashDungeonRun", [
          secret,
          this.signerAddress,
          BigInt(action.characterId),
          nonce,
          action.difficulty,
          action.dungeonLevel,
          action.varianceMode
        ]);
        return this.chain.estimateGameWorldGas("commitActionWithVariance", [
          BigInt(action.characterId),
          ACTION_TYPE_DUNGEON_RUN,
          commitHash,
          nonce,
          action.varianceMode
        ], { value: requiredValueWei });
      }
      case "next_room":
        if (action.potionChoices && action.abilityChoices && action.potionChoices.length > 1) {
          return this.chain.estimateGameWorldGas("resolveRooms", [
            BigInt(action.characterId),
            action.potionChoices,
            action.abilityChoices
          ]);
        }
        return this.chain.estimateGameWorldGas("resolveNextRoom", [
          BigInt(action.characterId),
          action.potionChoice ?? 0,
          action.abilityChoice ?? 0
        ]);
      case "open_lootboxes_max": {
        const nonce = 1n;
        const secret = `0x${"22".repeat(32)}` as Hex;
        const commitHash = await this.chain.readGameWorld<Hex>("hashLootboxOpen", [
          secret,
          this.signerAddress,
          BigInt(action.characterId),
          nonce,
          action.tier,
          action.maxAmount,
          action.varianceMode,
          true
        ]);
        return this.chain.estimateGameWorldGas("commitActionWithVariance", [
          BigInt(action.characterId),
          ACTION_TYPE_LOOTBOX_OPEN,
          commitHash,
          nonce,
          action.varianceMode
        ], { value: requiredValueWei });
      }
      case "equip_best":
        throw new Error("dynamic_action_not_estimable:equip_best");
      case "reroll_item":
        return this.chain.estimateGameWorldGas("rerollItemStats", [BigInt(action.characterId), BigInt(action.itemId)]);
      case "forge_set_piece":
        return this.chain.estimateGameWorldGas("forgeSetPiece", [
          BigInt(action.characterId),
          BigInt(action.itemId),
          action.targetSetId
        ]);
      case "buy_premium_lootboxes":
        return this.chain.estimateFeeVaultGas(
          "buyPremiumLootboxes",
          [BigInt(action.characterId), action.difficulty, action.amount],
          { value: requiredValueWei }
        );
      case "finalize_epoch":
        return this.chain.estimateFeeVaultGas("finalizeEpoch", [action.epochId]);
      case "claim_player":
        return this.chain.estimateFeeVaultGas("claimPlayer", [action.epochId, BigInt(action.characterId)]);
      case "claim_deployer":
        return this.chain.estimateFeeVaultGas("claimDeployer", [action.epochId]);
      case "create_trade_offer":
        return this.chain.estimateTradeEscrowGas(
          "createOffer",
          [
            action.offeredItemIds.map((itemId) => BigInt(itemId)),
            action.requestedItemIds.map((itemId) => BigInt(itemId)),
            BigInt(action.requestedMmo)
          ],
          { value: requiredValueWei }
        );
      case "fulfill_trade_offer":
        return this.chain.estimateTradeEscrowGas("fulfillOffer", [BigInt(action.offerId)]);
      case "cancel_trade_offer":
        return this.chain.estimateTradeEscrowGas("cancelOffer", [BigInt(action.offerId)]);
      case "cancel_expired_trade_offer":
        return this.chain.estimateTradeEscrowGas("cancelExpiredOffer", [BigInt(action.offerId)]);
      case "create_rfq":
        return this.chain.estimateRfqGas("createRFQ", [
          action.slot,
          action.minTier,
          BigInt(action.acceptableSetMask),
          BigInt(action.mmoOffered),
          action.expiry ?? 0
        ], { value: requiredValueWei });
      case "fill_rfq":
        return this.chain.estimateRfqGas("fillRFQ", [BigInt(action.rfqId), BigInt(action.itemTokenId)]);
      case "cancel_rfq":
        return this.chain.estimateRfqGas("cancelRFQ", [BigInt(action.rfqId)]);
      default:
        return exhaustive(action);
    }
  }
}

function exhaustive(value: never): never {
  throw new Error(`unhandled action ${(value as { type?: string }).type ?? "unknown"}`);
}
