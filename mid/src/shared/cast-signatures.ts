import {
  feeVaultAbi,
  gameWorldAbi,
  itemsAbi,
  mmoTokenAbi,
  rfqMarketAbi,
  tradeEscrowAbi
} from "../contracts/abi.js";

type AbiFunctionItem = {
  type: "function";
  name: string;
  inputs: readonly { type: string }[];
  outputs?: readonly { type: string; components?: readonly { type: string }[] }[];
};

function isFunction(item: unknown): item is AbiFunctionItem {
  return Boolean(item && typeof item === "object" && (item as any).type === "function" && typeof (item as any).name === "string");
}

function getFunction(abi: readonly unknown[], name: string): AbiFunctionItem {
  const matches = abi.filter((item) => isFunction(item) && item.name === name) as AbiFunctionItem[];
  if (matches.length === 0) {
    throw new Error(`cast_signatures_missing_function:${name}`);
  }
  if (matches.length > 1) {
    // We only include non-overloaded functions in `mid/src/contracts/abi.ts`.
    throw new Error(`cast_signatures_ambiguous_function:${name}`);
  }
  return matches[0]!;
}

function formatTupleType(output: { type: string; components?: readonly { type: string }[] }): string {
  if (output.type !== "tuple") return output.type;
  const components = output.components;
  if (!components || components.length === 0) {
    throw new Error("cast_signatures_tuple_missing_components");
  }
  // Cast tuple type syntax.
  return `(${components.map((c) => c.type).join(",")})`;
}

function formatCallSignature(fn: AbiFunctionItem): string {
  const args = fn.inputs.map((i) => i.type).join(",");
  const outputs = fn.outputs ?? [];
  if (outputs.length === 0) {
    return `${fn.name}(${args})`;
  }
  const out = outputs.map((o) => formatTupleType(o)).join(",");
  return `${fn.name}(${args})(${out})`;
}

function formatSendSignature(fn: AbiFunctionItem): string {
  const args = fn.inputs.map((i) => i.type).join(",");
  return `${fn.name}(${args})`;
}

function buildContractSignatures(input: {
  abi: readonly unknown[];
  call: string[];
  send: string[];
}): { call: Record<string, string>; send: Record<string, string> } {
  const call: Record<string, string> = {};
  for (const name of input.call) {
    call[name] = formatCallSignature(getFunction(input.abi, name));
  }
  const send: Record<string, string> = {};
  for (const name of input.send) {
    send[name] = formatSendSignature(getFunction(input.abi, name));
  }
  return { call, send };
}

// Keep this payload deliberately compact and focused on the high-gas-burn footguns.
// It exists to prevent agents from guessing selectors/types when using `cast`.
export const castSignatures = {
  gameWorld: buildContractSignatures({
    abi: gameWorldAbi,
    call: [
      "commitFee",
      "nextCommitId",
      "nextCharacterId",
      "hashLootboxOpen",
      "hashDungeonRun",
      "revealWindow",
      "quoteOpenLootboxes",
      "premiumLootboxTier",
      "getRunState",
      "potionBalance"
    ],
    send: [
      "createCharacter",
      "claimFreeLootbox",
      "commitActionWithVariance",
      "revealOpenLootboxesMax",
      "revealStartDungeon",
      "resolveNextRoom",
      "resolveRooms",
      "equipItem",
      "equipItems"
    ]
  }),
  feeVault: buildContractSignatures({
    abi: feeVaultAbi,
    call: ["quotePremiumPurchase"],
    send: ["buyPremiumLootboxes", "finalizeEpoch", "claimPlayer", "claimDeployer"]
  }),
  items: buildContractSignatures({
    abi: itemsAbi,
    call: [
      "ownerOf",
      "balanceOf",
      "tokenOfOwnerByIndex",
      "isApprovedForAll",
      "decode",
      "decodeWithVariance",
      "deriveBonuses",
      "itemSetInfo",
      "varianceModeOf"
    ],
    send: ["setApprovalForAll"]
  }),
  rfqMarket: buildContractSignatures({
    abi: rfqMarketAbi,
    call: ["createFee", "maxTtl", "rfqs"],
    send: ["createRFQ", "fillRFQ", "cancelRFQ"]
  }),
  tradeEscrow: buildContractSignatures({
    abi: tradeEscrowAbi,
    call: ["createFee", "offerTtl", "offers", "offeredItems", "requestedItems"],
    send: ["createOffer", "cancelOffer", "fulfillOffer", "cancelExpiredOffer"]
  }),
  mmoToken: buildContractSignatures({
    abi: mmoTokenAbi,
    call: ["balanceOf", "allowance"],
    send: ["approve"]
  })
} as const;

