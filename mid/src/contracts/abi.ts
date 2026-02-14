import { parseAbi } from "viem";

export const gameWorldAbi = parseAbi([
  "function createCharacter(uint8 race, uint8 classType, string name) returns (uint256 characterId)",
  "function claimFreeLootbox(uint256 characterId)",
  "function commitActionWithVariance(uint256 characterId, uint8 actionType, bytes32 commitHash, uint64 nonce, uint8 varianceMode) returns (uint256 commitId)",
  "function commitFee() view returns (uint256)",
  "function nextCommitId() view returns (uint256)",
  "function premiumLootboxTier(uint256 characterId, uint8 difficulty) view returns (uint32 tier)",
  "function hashLootboxOpen(bytes32 secret, address actor, uint256 characterId, uint64 nonce, uint32 tier, uint16 amount, uint8 varianceMode, bool maxMode) pure returns (bytes32 hash)",
  "function hashDungeonRun(bytes32 secret, address actor, uint256 characterId, uint64 nonce, uint8 difficulty, uint32 dungeonLevel, uint8 varianceMode) pure returns (bytes32 hash)",
  "function revealStartDungeon(uint256 commitId, bytes32 secret, uint8 difficulty, uint32 dungeonLevel, uint8 varianceMode)",
  "function revealOpenLootboxesMax(uint256 commitId, bytes32 secret, uint32 tier, uint16 maxAmount, uint8 varianceMode) returns (uint16 openedAmount)",
  "function revealWindow(uint256 commitId) view returns (uint64 startBlock, uint64 endBlock, bool canReveal, bool expired, bool resolved)",
  "function quoteOpenLootboxes(uint256 characterId, uint32 tier, uint16 requestedAmount, uint8 varianceMode) view returns (uint32 availableTotal, uint32 availableBound, uint32 availableGeneric, uint16 openableAmount)",
  "function potionBalance(uint256 characterId, uint8 potionType, uint8 potionTier) view returns (uint32)",
  "function getRunState(uint256 characterId) view returns (bool active, uint8 roomCount, uint8 roomsCleared, uint32 currentHp, uint32 currentMana, uint8 hpPotionCharges, uint8 manaPotionCharges, uint8 powerPotionCharges, uint32 dungeonLevel, uint8 difficulty)",
  "function resolveNextRoom(uint256 characterId, uint8 potionChoice, uint8 abilityChoice)",
  "function resolveRooms(uint256 characterId, uint8[] potionChoices, uint8[] abilityChoices) returns (uint8 resolvedCount, bool runStillActive)",
  "function equipItem(uint256 characterId, uint256 itemId)",
  "function equipItems(uint256 characterId, uint256[] itemIds)",
  "function rerollItemStats(uint256 characterId, uint256 itemTokenId) returns (uint32 newNonce)",
  "function forgeSetPiece(uint256 characterId, uint256 itemTokenId, uint8 targetSetId) returns (uint64 newSeed)",
  "function forgeSetPieceMmoCost(uint32 itemTier) view returns (uint256)",
  "function forgeSetPieceStoneCost(uint32 itemTier) view returns (uint8)",
  "function getProgressionSnapshot(uint256 characterId) view returns ((uint32 bestLevel, uint32 targetLevel, uint8 requiredClears, uint8 currentClears, uint8 requiredSlots, uint8 equippedSlots, uint8 setPieces, uint8 matchingSetPieces, uint8 highAffixPieces, uint8 recommendedSetPieces, uint8 recommendedMatchingSetPieces, uint8 recommendedHighAffixPieces, uint256 repairFeeAmount, uint256 runEntryFeeAmount) snapshot)",
  "function estimatePressurePenaltyBps(uint256 characterId, uint32 targetLevel) view returns (uint256 pressurePenaltyBps)",
  "function recommendedBuildDeficits(uint256 characterId, uint32 targetLevel) view returns ((uint8 missingSetPieces, uint8 missingMatchingSetPieces, uint8 missingHighAffixPieces, uint8 suggestedSetBand, uint8 suggestedSetIdMin, uint8 suggestedSetIdMax, uint256 estimatedPenaltyBps) deficits)",
  "function scoreItemForTargetLevel(uint256 characterId, uint256 itemTokenId, uint32 targetLevel) view returns (uint16 utilityBps, uint8 projectedSetPieces, uint8 projectedMatchingSetPieces, uint8 projectedHighAffixPieces)",
  "function commits(uint256 commitId) view returns (address actor, uint256 characterId, uint8 actionType, bytes32 commitHash, uint64 nonce, uint64 commitBlock, uint8 varianceMode, bool resolved)",
  "function ownerOfCharacter(uint256 characterId) view returns (address)",
  "function characterBestLevel(uint256 characterId) view returns (uint32)",
  "function characterLastLevelUpEpoch(uint256 characterId) view returns (uint32)",
  "function lootboxCredits(uint256 characterId, uint32 tier) view returns (uint32)",
  "function lootboxBoundCredits(uint256 characterId, uint32 tier, uint8 varianceMode) view returns (uint32)",
  "function upgradeStoneBalance(uint256 characterId) view returns (uint32)",
  "function equippedItemBySlot(uint256 characterId, uint8 slot) view returns (uint256 itemId)",
  "function runVarianceMode(uint256 characterId) view returns (uint8)",
  "function equippedSlotCount(uint256 characterId) view returns (uint8)",
  "function requiredEquippedSlots(uint32 dungeonLevel) pure returns (uint8)",
  "function nextCharacterId() view returns (uint256)",
  "event ActionCommitted(uint256 indexed commitId, uint256 indexed characterId, address indexed actor, uint8 actionType, uint8 varianceMode, uint64 commitBlock)",
  "event ActionExpired(uint256 indexed commitId, uint256 indexed characterId, uint8 actionType)",
  "event CharacterCreated(uint256 indexed characterId, address indexed owner, uint8 indexed race, uint8 classType, string name)",
  "event CharacterLevelUpdated(uint256 indexed characterId, uint32 oldLevel, uint32 newLevel, uint32 lastLevelUpEpoch)",
  "event LootboxCredited(uint256 indexed characterId, uint32 indexed tier, uint32 amount)",
  "event LootboxOpened(uint256 indexed characterId, uint256 indexed commitId, uint32 indexed tier, uint16 amount, uint8 varianceMode, bytes32 entropy)",
  "event LootboxOpenMaxResolved(uint256 indexed characterId, uint256 indexed commitId, uint32 indexed tier, uint16 requestedAmount, uint16 openedAmount, uint8 varianceMode)",
  "event LootboxItemDropped(uint256 indexed characterId, uint256 indexed commitId, uint256 indexed itemId, uint8 slot, uint32 itemTier, uint64 seed, uint8 varianceMode)",
  "event ItemEquipped(uint256 indexed characterId, uint256 indexed itemId, uint8 indexed slot)",
  "event ItemRerolled(uint256 indexed characterId, uint256 indexed itemTokenId, uint32 newNonce)",
  "event SetPieceForged(uint256 indexed characterId, uint256 indexed itemTokenId, uint8 indexed targetSetId, uint8 stonesSpent, uint256 mmoSpent, uint64 newSeed)",
  "event DungeonStarted(uint256 indexed characterId, uint256 indexed commitId, uint32 dungeonLevel, uint8 difficulty, uint8 varianceMode, uint8 roomCount)",
  "event DungeonRoomResolved(uint256 indexed characterId, uint8 indexed roomIndex, bool boss, bool success, uint32 hpAfter, uint32 manaAfter)",
  "event DungeonFinished(uint256 indexed characterId, uint32 indexed dungeonLevel, bool success, uint8 roomsCleared, uint8 roomCount)",
  "event UpgradeStoneGranted(uint256 indexed characterId, uint32 amount, uint8 reason)"
]);

export const feeVaultAbi = parseAbi([
  "function quotePremiumPurchase(uint256 characterId, uint8 difficulty, uint16 amount) view returns (uint256 ethCost, uint256 mmoCost)",
  "function buyPremiumLootboxes(uint256 characterId, uint8 difficulty, uint16 amount) payable",
  "function epochEthFees(uint32 epochId) view returns (uint256 feesEth)",
  "function finalizeEpoch(uint32 epochId)",
  "function claimPlayer(uint32 epochId, uint256 characterId) returns (uint256 amount)",
  "function claimDeployer(uint32 epochId) returns (uint256 amount)",
  "function epochSnapshot(uint32 epochId) view returns (uint256 feesForPlayers, uint256 feesForDeployer, uint32 cutoffLevel, uint256 totalEligibleWeight, bool finalized)",
  "function playerClaimed(uint32 epochId, uint256 characterId) view returns (bool)",
  "function deployerClaimed(uint32 epochId) view returns (bool)",
  "event EpochFinalized(uint32 indexed epochId, uint32 cutoffLevel, uint256 feesForPlayers, uint256 feesForDeployer, uint256 totalEligibleWeight)",
  "event PlayerClaimed(uint32 indexed epochId, uint256 indexed characterId, address indexed owner, uint256 amount)",
  "event DeployerClaimed(uint32 indexed epochId, address indexed deployer, uint256 amount)"
]);

export const itemsAbi = parseAbi([
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function balanceOf(address owner) view returns (uint256)",
  "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256 tokenId)",
  "function isApprovedForAll(address owner, address operator) view returns (bool)",
  "function setApprovalForAll(address operator, bool approved)",
  "function nextTokenId() view returns (uint256)",
  "function decode(uint256 tokenId) view returns (uint8 slot, uint32 tier, uint64 seed)",
  "function decodeWithVariance(uint256 tokenId) view returns (uint8 slot, uint32 tier, uint64 seed, uint8 varianceMode)",
  "function deriveBonuses(uint256 tokenId) view returns (uint32 hp, uint32 mana, uint32 def, uint32 atkM, uint32 atkR)",
  "function itemSetInfo(uint256 tokenId) view returns (bool isSet, uint8 setId)",
  "function varianceModeOf(uint256 tokenId) view returns (uint8 varianceMode)",
  "event ItemMinted(uint256 indexed tokenId, address indexed to, uint8 indexed slot, uint32 tier, uint64 seed, uint8 varianceMode, bool isSet, uint8 setId)",
  "event ItemSeedRewritten(uint256 indexed tokenId, uint64 oldSeed, uint64 newSeed)"
]);

export const rfqMarketAbi = parseAbi([
  "function createFee() view returns (uint256)",
  "function maxTtl() view returns (uint40)",
  "function createRFQ(uint8 slot, uint32 minTier, uint256 acceptableSetMask, uint96 mmoOffered, uint40 expiry) returns (uint256 rfqId)",
  "function fillRFQ(uint256 rfqId, uint256 itemTokenId)",
  "function cancelRFQ(uint256 rfqId)",
  "function rfqs(uint256 rfqId) view returns (address maker, uint96 mmoOffered, uint32 minTier, uint40 expiry, uint8 slot, bool active, bool filled, uint256 setMask)",
  "event RFQCreated(uint256 indexed rfqId, address indexed maker, uint8 slot, uint32 minTier, uint256 setMask, uint96 mmoOffered, uint40 expiry)",
  "event RFQFilled(uint256 indexed rfqId, address indexed maker, address indexed taker, uint256 itemTokenId)",
  "event RFQCancelled(uint256 indexed rfqId)"
]);

export const tradeEscrowAbi = parseAbi([
  "function createFee() view returns (uint256)",
  "function offerTtl() view returns (uint40)",
  "function createOffer(uint256[] offeredItemIds, uint256[] requestedItemIds, uint96 requestedMmo) returns (uint256 offerId)",
  "function cancelOffer(uint256 offerId)",
  "function fulfillOffer(uint256 offerId)",
  "function cancelExpiredOffer(uint256 offerId)",
  "function offers(uint256 offerId) view returns (address maker, uint96 requestedMmo, uint40 expiry, bool active)",
  "function offeredItems(uint256 offerId) view returns (uint256[])",
  "function requestedItems(uint256 offerId) view returns (uint256[])",
  "event OfferCreated(uint256 indexed offerId, address indexed maker, uint96 requestedMmo, uint256[] offeredItemIds, uint256[] requestedItemIds)",
  "event OfferCancelled(uint256 indexed offerId, address indexed maker)",
  "event OfferFulfilled(uint256 indexed offerId, address indexed maker, address indexed taker)"
]);

export const mmoTokenAbi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)"
]);
