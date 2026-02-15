import { randomBytes } from "node:crypto";
import { encodeFunctionData, toHex, type Hex } from "viem";
import { ChainAdapter } from "../chain-adapter/client.js";
import {
  feeVaultAbi,
  gameWorldAbi,
  itemsAbi,
  mmoTokenAbi,
  rfqMarketAbi,
  tradeEscrowAbi
} from "../contracts/abi.js";
import { normalizeError } from "./errors.js";
import type { AgentActionInput } from "../shared/schemas.js";

const ACTION_TYPE_LOOTBOX_OPEN = 1;
const ACTION_TYPE_DUNGEON_RUN = 2;
const MAX_UINT256 = 0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffn;

type Objective = "balanced" | "dps" | "survivability";
type ContractTarget = "gameWorld" | "feeVault" | "rfqMarket" | "tradeEscrow" | "mmoToken" | "items";

interface CallSpec {
  label: string;
  target: ContractTarget;
  functionName: string;
  args: unknown[];
  value?: bigint;
}

export interface TxIntentSimulation {
  willSucceed: boolean;
  code: string;
  reason: string;
  retryable: boolean;
  estimatedGas?: string;
}

export interface TxIntent {
  label: string;
  to: Hex;
  data: Hex;
  valueWei: string;
  chainId: number;
  simulation: TxIntentSimulation;
}

export interface TxIntentPlan {
  actor: Hex;
  actionType: AgentActionInput["type"];
  intents: TxIntent[];
  metadata?: Record<string, unknown>;
  warnings: string[];
}

export class ActionTxIntentBuilder {
  public constructor(
    private readonly chain: ChainAdapter,
    private readonly chainId: number
  ) {}

  public async build(input: {
    actor: Hex;
    action: AgentActionInput;
  }): Promise<TxIntentPlan> {
    const actor = input.actor.toLowerCase() as Hex;
    const warnings: string[] = [];
    const metadata: Record<string, unknown> = {};
    const specs: CallSpec[] = [];

    switch (input.action.type) {
      case "create_character":
        specs.push({
          label: "create_character",
          target: "gameWorld",
          functionName: "createCharacter",
          args: [input.action.race, input.action.classType, input.action.name]
        });
        break;
      case "start_dungeon": {
        await this.assertCharacterOwner(actor, input.action.characterId);
        const commitFee = await this.chain.readGameWorld<bigint>("commitFee", []);
        const nonce = randomUint64();
        const secret = toHex(randomBytes(32));
        const commitHash = await this.chain.readGameWorld<Hex>("hashDungeonRun", [
          secret,
          actor,
          BigInt(input.action.characterId),
          nonce,
          input.action.difficulty,
          input.action.dungeonLevel,
          input.action.varianceMode
        ]);
        metadata.commitSecret = secret;
        metadata.commitNonce = nonce.toString();
        metadata.followUp = "Reveal requires commitId from ActionCommitted event";
        specs.push({
          label: "commit_start_dungeon",
          target: "gameWorld",
          functionName: "commitActionWithVariance",
          args: [BigInt(input.action.characterId), ACTION_TYPE_DUNGEON_RUN, commitHash, nonce, input.action.varianceMode],
          value: commitFee
        });
        break;
      }
      case "next_room":
        await this.assertCharacterOwner(actor, input.action.characterId);
        if (input.action.potionChoices && input.action.abilityChoices && input.action.potionChoices.length > 1) {
          specs.push({
            label: "resolve_rooms",
            target: "gameWorld",
            functionName: "resolveRooms",
            args: [BigInt(input.action.characterId), input.action.potionChoices, input.action.abilityChoices]
          });
        } else {
          specs.push({
            label: "resolve_next_room",
            target: "gameWorld",
            functionName: "resolveNextRoom",
            args: [BigInt(input.action.characterId), input.action.potionChoice ?? 0, input.action.abilityChoice ?? 0]
          });
        }
        break;
      case "open_lootboxes_max": {
        await this.assertCharacterOwner(actor, input.action.characterId);
        const commitFee = await this.chain.readGameWorld<bigint>("commitFee", []);
        const nonce = randomUint64();
        const secret = toHex(randomBytes(32));
        const commitHash = await this.chain.readGameWorld<Hex>("hashLootboxOpen", [
          secret,
          actor,
          BigInt(input.action.characterId),
          nonce,
          input.action.tier,
          input.action.maxAmount,
          input.action.varianceMode,
          true
        ]);
        metadata.commitSecret = secret;
        metadata.commitNonce = nonce.toString();
        metadata.followUp = "Reveal requires commitId from ActionCommitted event";
        specs.push({
          label: "commit_open_lootboxes_max",
          target: "gameWorld",
          functionName: "commitActionWithVariance",
          args: [BigInt(input.action.characterId), ACTION_TYPE_LOOTBOX_OPEN, commitHash, nonce, input.action.varianceMode],
          value: commitFee
        });
        break;
      }
      case "equip_best": {
        await this.assertCharacterOwner(actor, input.action.characterId);
        const itemIds = await this.selectBestItemIds(actor, input.action.characterId, input.action.objective);
        if (itemIds.length === 0) {
          throw new Error("NoEquippableItems");
        }
        specs.push({
          label: "equip_items",
          target: "gameWorld",
          functionName: "equipItems",
          args: [BigInt(input.action.characterId), itemIds]
        });
        break;
      }
      case "reroll_item":
        await this.assertCharacterOwner(actor, input.action.characterId);
        specs.push({
          label: "reroll_item",
          target: "gameWorld",
          functionName: "rerollItemStats",
          args: [BigInt(input.action.characterId), BigInt(input.action.itemId)]
        });
        break;
      case "forge_set_piece":
        await this.assertCharacterOwner(actor, input.action.characterId);
        specs.push({
          label: "forge_set_piece",
          target: "gameWorld",
          functionName: "forgeSetPiece",
          args: [BigInt(input.action.characterId), BigInt(input.action.itemId), input.action.targetSetId]
        });
        break;
      case "buy_premium_lootboxes": {
        await this.assertCharacterOwner(actor, input.action.characterId);
        const [ethCost, mmoCost] = await this.chain.readFeeVault<readonly [bigint, bigint]>("quotePremiumPurchase", [
          BigInt(input.action.characterId),
          input.action.difficulty,
          input.action.amount
        ]);
        metadata.quote = {
          requiredValueWei: ethCost.toString(),
          mmoCostWei: mmoCost.toString()
        };
        specs.push({
          label: "buy_premium_lootboxes",
          target: "feeVault",
          functionName: "buyPremiumLootboxes",
          args: [BigInt(input.action.characterId), input.action.difficulty, input.action.amount],
          value: ethCost
        });
        break;
      }
      case "finalize_epoch":
        specs.push({
          label: "finalize_epoch",
          target: "feeVault",
          functionName: "finalizeEpoch",
          args: [input.action.epochId]
        });
        break;
      case "claim_player":
        await this.assertCharacterOwner(actor, input.action.characterId);
        specs.push({
          label: "claim_player",
          target: "feeVault",
          functionName: "claimPlayer",
          args: [input.action.epochId, BigInt(input.action.characterId)]
        });
        break;
      case "claim_deployer":
        specs.push({
          label: "claim_deployer",
          target: "feeVault",
          functionName: "claimDeployer",
          args: [input.action.epochId]
        });
        break;
      case "create_trade_offer": {
        const approved = await this.chain.readItemsApprovalForAll(actor, this.chain.addresses.tradeEscrow);
        if (!approved) {
          specs.push({
            label: "approve_trade_escrow_for_items",
            target: "items",
            functionName: "setApprovalForAll",
            args: [this.chain.addresses.tradeEscrow, true]
          });
        }
        for (const itemId of input.action.offeredItemIds) {
          const owner = await this.chain.readItems<Hex>("ownerOf", [BigInt(itemId)]);
          if (owner.toLowerCase() !== actor.toLowerCase()) {
            throw new Error("NotItemOwner");
          }
        }
        const createFee = await this.chain.readTradeEscrow<bigint>("createFee", []);
        specs.push({
          label: "create_trade_offer",
          target: "tradeEscrow",
          functionName: "createOffer",
          args: [
            input.action.offeredItemIds.map((itemId) => BigInt(itemId)),
            input.action.requestedItemIds.map((itemId) => BigInt(itemId)),
            BigInt(input.action.requestedMmo)
          ],
          value: createFee
        });
        break;
      }
      case "fulfill_trade_offer": {
        const [maker, requestedMmo] = await this.chain.readTradeEscrow<readonly [Hex, bigint, bigint, boolean]>(
          "offers",
          [BigInt(input.action.offerId)]
        );
        metadata.offer = {
          maker,
          requestedMmoWei: requestedMmo.toString()
        };
        const itemsApproved = await this.chain.readItemsApprovalForAll(actor, this.chain.addresses.tradeEscrow);
        if (!itemsApproved) {
          specs.push({
            label: "approve_trade_escrow_for_items",
            target: "items",
            functionName: "setApprovalForAll",
            args: [this.chain.addresses.tradeEscrow, true]
          });
        }
        if (requestedMmo > 0n) {
          const allowance = await this.chain.readMmoAllowance(actor, this.chain.addresses.tradeEscrow);
          if (allowance < requestedMmo) {
            specs.push({
              label: "approve_trade_escrow_for_mmo",
              target: "mmoToken",
              functionName: "approve",
              args: [this.chain.addresses.tradeEscrow, MAX_UINT256]
            });
          }
        }
        specs.push({
          label: "fulfill_trade_offer",
          target: "tradeEscrow",
          functionName: "fulfillOffer",
          args: [BigInt(input.action.offerId)]
        });
        break;
      }
      case "cancel_trade_offer":
        specs.push({
          label: "cancel_trade_offer",
          target: "tradeEscrow",
          functionName: "cancelOffer",
          args: [BigInt(input.action.offerId)]
        });
        break;
      case "cancel_expired_trade_offer":
        specs.push({
          label: "cancel_expired_trade_offer",
          target: "tradeEscrow",
          functionName: "cancelExpiredOffer",
          args: [BigInt(input.action.offerId)]
        });
        break;
      case "create_rfq": {
        const offeredAmount = BigInt(input.action.mmoOffered);
        const allowance = await this.chain.readMmoAllowance(actor, this.chain.addresses.rfqMarket);
        if (allowance < offeredAmount) {
          specs.push({
            label: "approve_rfq_market_for_mmo",
            target: "mmoToken",
            functionName: "approve",
            args: [this.chain.addresses.rfqMarket, MAX_UINT256]
          });
        }
        const createFee = await this.chain.readRfq<bigint>("createFee", []);
        const expiry = input.action.expiry ?? Math.floor(Date.now() / 1000) + 3600;
        if (input.action.expiry === undefined) {
          warnings.push("create_rfq.expiry_missing_default_applied");
        }
        specs.push({
          label: "create_rfq",
          target: "rfqMarket",
          functionName: "createRFQ",
          args: [input.action.slot, input.action.minTier, BigInt(input.action.acceptableSetMask), offeredAmount, expiry],
          value: createFee
        });
        break;
      }
      case "fill_rfq":
        specs.push({
          label: "fill_rfq",
          target: "rfqMarket",
          functionName: "fillRFQ",
          args: [BigInt(input.action.rfqId), BigInt(input.action.itemTokenId)]
        });
        break;
      case "cancel_rfq":
        specs.push({
          label: "cancel_rfq",
          target: "rfqMarket",
          functionName: "cancelRFQ",
          args: [BigInt(input.action.rfqId)]
        });
        break;
      default:
        return exhaustive(input.action);
    }

    const intents = await Promise.all(specs.map((spec) => this.buildIntent(actor, spec)));
    return {
      actor,
      actionType: input.action.type,
      intents,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
      warnings
    };
  }

  private async assertCharacterOwner(actor: Hex, characterId: number): Promise<void> {
    const owner = await this.chain.readGameWorld<Hex>("ownerOfCharacter", [BigInt(characterId)]);
    if (owner.toLowerCase() !== actor.toLowerCase()) {
      throw new Error("OnlyCharacterOwner");
    }
  }

  private async selectBestItemIds(actor: Hex, characterId: number, objective: Objective): Promise<bigint[]> {
    const bestLevel = await this.chain.readGameWorld<number>("characterBestLevel", [BigInt(characterId)]);
    const inventoryCount = await this.chain.readItems<bigint>("balanceOf", [actor]);
    const bestBySlot = new Map<number, { itemId: bigint; score: number }>();

    for (let index = 0n; index < inventoryCount; index++) {
      const itemId = await this.chain.readItems<bigint>("tokenOfOwnerByIndex", [actor, index]);
      const [slot, tier] = await this.chain.readItems<readonly [number, number, bigint]>("decode", [itemId]);
      if (tier > bestLevel + 1) {
        continue;
      }

      // Items remain owned by the wallet even while equipped. Filter out tokens that are already equipped
      // on some other character to avoid ItemAlreadyEquipped() reverts when multiple characters share a wallet.
      // packedLocation is (characterId << 8) | slotIndex; characterId==0 means not equipped.
      const packedLocation = await this.chain.readGameWorld<bigint>("equippedLocationByItemId", [itemId]);
      if (packedLocation !== 0n) {
        const equippedCharacterId = packedLocation >> 8n;
        const equippedSlotIndex = Number(packedLocation & 0xffn);
        if (equippedCharacterId !== BigInt(characterId) || equippedSlotIndex !== slot) {
          continue;
        }
      }

      const [hp, mana, def, atkM, atkR] = await this.chain.readItems<readonly [number, number, number, number, number]>(
        "deriveBonuses",
        [itemId]
      );
      const score = scoreItem(objective, { hp, mana, def, atkM, atkR });
      const existing = bestBySlot.get(slot);
      if (!existing || score > existing.score) {
        bestBySlot.set(slot, { itemId, score });
      }
    }

    return [...bestBySlot.values()].map((entry) => entry.itemId);
  }

  private async buildIntent(actor: Hex, spec: CallSpec): Promise<TxIntent> {
    const { address, abi } = resolveTarget(this.chain, spec.target);
    const data = encodeFunctionData({
      abi: abi as any,
      functionName: spec.functionName as any,
      args: spec.args as any
    });

    let simulation: TxIntentSimulation;
    try {
      const estimatedGas = await this.chain.publicClient.estimateContractGas({
        address,
        abi: abi as any,
        functionName: spec.functionName as any,
        args: spec.args as any,
        value: spec.value,
        account: actor
      } as any);
      simulation = {
        willSucceed: true,
        code: "SIMULATION_OK",
        reason: "eth_estimateGas succeeded",
        retryable: false,
        estimatedGas: estimatedGas.toString()
      };
    } catch (error) {
      const normalized = normalizeError(error);
      simulation = {
        willSucceed: false,
        code: normalized.code,
        reason: normalized.message,
        retryable: normalized.retryable
      };
    }

    return {
      label: spec.label,
      to: address,
      data,
      valueWei: (spec.value ?? 0n).toString(),
      chainId: this.chainId,
      simulation
    };
  }
}

function resolveTarget(chain: ChainAdapter, target: ContractTarget): { address: Hex; abi: readonly unknown[] } {
  switch (target) {
    case "gameWorld":
      return { address: chain.addresses.gameWorld, abi: gameWorldAbi };
    case "feeVault":
      return { address: chain.addresses.feeVault, abi: feeVaultAbi };
    case "rfqMarket":
      return { address: chain.addresses.rfqMarket, abi: rfqMarketAbi };
    case "tradeEscrow":
      return { address: chain.addresses.tradeEscrow, abi: tradeEscrowAbi };
    case "mmoToken":
      return { address: chain.addresses.mmo, abi: mmoTokenAbi };
    case "items":
      return { address: chain.addresses.items, abi: itemsAbi };
    default:
      return exhaustive(target);
  }
}

function scoreItem(
  objective: Objective,
  stats: { hp: number; mana: number; def: number; atkM: number; atkR: number }
): number {
  if (objective === "dps") {
    return stats.atkM * 4 + stats.atkR * 4 + stats.def + Math.floor(stats.hp / 2) + Math.floor(stats.mana / 2);
  }
  if (objective === "survivability") {
    return stats.hp * 3 + stats.def * 3 + stats.mana + stats.atkM + stats.atkR;
  }
  return stats.hp * 2 + stats.mana * 2 + stats.def * 3 + stats.atkM * 3 + stats.atkR * 3;
}

function randomUint64(): bigint {
  const bytes = randomBytes(8);
  return BigInt(`0x${bytes.toString("hex")}`);
}

function exhaustive(value: never): never {
  throw new Error(`unhandled value ${String(value)}`);
}
