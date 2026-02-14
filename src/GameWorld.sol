// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {Items} from "./Items.sol";
import {MMOToken} from "./MMOToken.sol";
import {GameConstants} from "./libraries/GameConstants.sol";
import {GameErrors} from "./libraries/GameErrors.sol";
import {GameTypes} from "./libraries/GameTypes.sol";
import {TokenValidation} from "./libraries/TokenValidation.sol";

/// @notice ChainMMO.com
/// @notice Product tagline: "MMO to be played by LLMs."
/// @notice Product description: Infinite fantasy themed dungeon crawler, built to be played through the LLM and TUI.
/// @notice All interactions and game state fetching happen on the target EVM chain (Monad in production).
/// @dev The game logic is intentionally on-chain so agents can be benchmarked in a permissionless environment with
/// economic rules and multiple competing bots, and this code path is used to benchmark agentic frameworks.
contract GameWorld is ReentrancyGuard {
    using SafeTransferLib for address;

    struct Character {
        address owner;
        GameTypes.Race race;
        GameTypes.Class classType;
        uint32 bestLevel;
        uint32 lastLevelUpEpoch;
        bool freeLootboxClaimed;
        string name;
        GameTypes.Stats baseStats;
    }

    struct CommitData {
        address actor;
        uint256 characterId;
        GameTypes.ActionType actionType;
        bytes32 commitHash;
        uint64 nonce;
        uint64 commitBlock;
        GameTypes.VarianceMode varianceMode;
        bool resolved;
    }

    struct RunState {
        bool active;
        address owner;
        GameTypes.Difficulty difficulty;
        GameTypes.VarianceMode varianceMode;
        uint32 dungeonLevel;
        uint8 roomCount;
        uint8 roomsCleared;
        uint32 currentHp;
        uint32 currentMana;
        uint32 maxHp;
        uint32 maxMana;
        uint8 hpPotionCharges;
        uint8 manaPotionCharges;
        uint8 powerPotionCharges;
        uint32 hpRegen;
        uint32 manaRegen;
        uint96 repairEscrow;
        uint64 commitId;
        uint256 seed;
    }

    struct StrategyEffects {
        uint16 attackAbilityBonusBps;
        uint16 attackPotionBonusBps;
        uint16 defenseBonusBps;
        uint16 damageTakenBonusBps;
    }

    struct ProgressionSnapshot {
        uint32 bestLevel;
        uint32 targetLevel;
        uint8 requiredClears;
        uint8 currentClears;
        uint8 requiredSlots;
        uint8 equippedSlots;
        uint8 setPieces;
        uint8 matchingSetPieces;
        uint8 highAffixPieces;
        uint8 recommendedSetPieces;
        uint8 recommendedMatchingSetPieces;
        uint8 recommendedHighAffixPieces;
        uint256 repairFeeAmount;
        uint256 runEntryFeeAmount;
    }

    struct BuildDeficits {
        uint8 missingSetPieces;
        uint8 missingMatchingSetPieces;
        uint8 missingHighAffixPieces;
        uint8 suggestedSetBand;
        uint8 suggestedSetIdMin;
        uint8 suggestedSetIdMax;
        uint256 estimatedPenaltyBps;
    }

    MMOToken public immutable mmoToken;
    address public immutable feeVault;
    address public immutable deployer;

    Items public immutable items;

    uint256 public nextCharacterId = 1;
    uint256 public nextCommitId = 1;

    uint32 public totalCharacters;
    uint32 public maxLevel;

    mapping(address owner => uint8 count) public ownerCharacterCount;
    mapping(uint256 characterId => Character character) internal _characters;
    mapping(uint256 characterId => mapping(uint32 tier => uint32 amount)) internal _lootboxCredits;
    mapping(uint256 characterId => mapping(uint32 tier => mapping(uint8 varianceMode => uint32 amount))) internal
        _boundLootboxCredits;
    mapping(uint256 characterId => mapping(uint8 potionType => mapping(uint8 potionTier => uint32 amount))) internal
        _potionInventory;
    mapping(uint256 characterId => mapping(uint8 slot => uint256 itemId)) public equippedItemBySlot;
    // Reverse mapping for fast "who has this equipped" lookups.
    // Packed as: (characterId << 8) | slot. characterId==0 means not equipped.
    mapping(uint256 itemId => uint256 packedLocation) public equippedLocationByItemId;
    mapping(uint256 characterId => RunState run) internal _runs;
    mapping(uint256 characterId => uint32 amount) internal _upgradeStones;
    mapping(uint256 characterId => mapping(uint32 dungeonLevel => uint8 clears)) internal _levelClearProgress;
    mapping(uint256 commitId => CommitData commitData) public commits;
    mapping(uint32 level => uint32 count) public countAtLevel;

    event CharacterCreated(
        uint256 indexed characterId,
        address indexed owner,
        GameTypes.Race indexed race,
        GameTypes.Class classType,
        string name
    );
    event CharacterLevelUpdated(uint256 indexed characterId, uint32 oldLevel, uint32 newLevel, uint32 lastLevelUpEpoch);
    event HistogramUpdated(uint32 indexed level, uint32 newCount, uint32 totalCharacters, uint32 maxLevel);
    event LootboxCredited(uint256 indexed characterId, uint32 indexed tier, uint32 amount);
    event ActionCommitted(
        uint256 indexed commitId,
        uint256 indexed characterId,
        address indexed actor,
        GameTypes.ActionType actionType,
        GameTypes.VarianceMode varianceMode,
        uint64 commitBlock
    );
    event ActionExpired(uint256 indexed commitId, uint256 indexed characterId, GameTypes.ActionType actionType);
    event LootboxOpened(
        uint256 indexed characterId,
        uint256 indexed commitId,
        uint32 indexed tier,
        uint16 amount,
        GameTypes.VarianceMode varianceMode,
        bytes32 entropy
    );
    event LootboxOpenMaxResolved(
        uint256 indexed characterId,
        uint256 indexed commitId,
        uint32 indexed tier,
        uint16 requestedAmount,
        uint16 openedAmount,
        GameTypes.VarianceMode varianceMode
    );
    event LootboxItemDropped(
        uint256 indexed characterId,
        uint256 indexed commitId,
        uint256 indexed itemId,
        GameTypes.Slot slot,
        uint32 itemTier,
        uint64 seed,
        GameTypes.VarianceMode varianceMode
    );
    event LootboxPotionDropped(
        uint256 indexed characterId,
        uint256 indexed commitId,
        GameTypes.PotionType indexed potionType,
        GameTypes.PotionTier potionTier,
        uint32 amount
    );
    event PotionConsumed(
        uint256 indexed characterId,
        uint8 indexed roomIndex,
        GameTypes.PotionType indexed potionType,
        GameTypes.PotionTier potionTier
    );
    event ItemEquipped(uint256 indexed characterId, uint256 indexed itemId, GameTypes.Slot indexed slot);
    event ItemUnequipped(
        uint256 indexed characterId, uint256 indexed itemId, GameTypes.Slot indexed slot, address from, address to
    );
    event DungeonStarted(
        uint256 indexed characterId,
        uint256 indexed commitId,
        uint32 dungeonLevel,
        GameTypes.Difficulty difficulty,
        GameTypes.VarianceMode varianceMode,
        uint8 roomCount
    );
    event DungeonRoomResolved(
        uint256 indexed characterId, uint8 indexed roomIndex, bool boss, bool success, uint32 hpAfter, uint32 manaAfter
    );
    event DungeonFinished(
        uint256 indexed characterId, uint32 indexed dungeonLevel, bool success, uint8 roomsCleared, uint8 roomCount
    );
    event UpgradeStoneGranted(uint256 indexed characterId, uint32 amount, uint8 reason);
    event ItemRerolled(uint256 indexed characterId, uint256 indexed itemTokenId, uint32 newNonce);
    event RepairEscrowed(uint256 indexed characterId, uint256 indexed runId, uint256 amount);
    event RepairRefunded(uint256 indexed characterId, uint256 indexed runId, uint256 amount);
    event RepairSunk(uint256 indexed characterId, uint256 indexed runId, uint256 amount);
    event RunEntryFeeSunk(uint256 indexed characterId, uint256 indexed runId, uint256 amount);
    event LevelProgressUpdated(uint256 indexed characterId, uint32 indexed dungeonLevel, uint8 clears, uint8 required);
    event LevelProgressReset(uint256 indexed characterId, uint32 indexed dungeonLevel);
    event SetBonusActivated(uint256 indexed characterId, uint8 indexed setId, uint8 pieceCount);
    event SetBonusDeactivated(uint256 indexed characterId, uint8 indexed setId);
    event SetPieceForged(
        uint256 indexed characterId,
        uint256 indexed itemTokenId,
        uint8 indexed targetSetId,
        uint8 stonesSpent,
        uint256 mmoSpent,
        uint64 newSeed
    );

    constructor(address mmoToken_, address feeVault_, address deployer_) {
        TokenValidation.requireSupportedMmoToken(mmoToken_);
        mmoToken = MMOToken(mmoToken_);
        feeVault = feeVault_;
        deployer = deployer_;
        items = new Items(address(this));
    }

    /// @notice Creates a character with immutable race/class identity and on-chain name.
    /// @param race Race choice.
    /// @param classType Class choice.
    /// @param name Full character name stored on-chain.
    /// @return characterId New character id.
    function createCharacter(GameTypes.Race race, GameTypes.Class classType, string calldata name)
        external
        returns (uint256 characterId)
    {
        if (bytes(name).length == 0) revert GameErrors.EmptyName();
        if (ownerCharacterCount[msg.sender] >= GameConstants.MAX_CHARACTERS_PER_WALLET) {
            revert GameErrors.MaxCharactersReached();
        }

        characterId = nextCharacterId++;
        ownerCharacterCount[msg.sender]++;

        GameTypes.Stats memory classStats = GameConstants.classBaseStats(classType);
        GameTypes.Stats memory raceMods = GameConstants.raceModifiers(race);

        _characters[characterId] = Character({
            owner: msg.sender,
            race: race,
            classType: classType,
            bestLevel: 1,
            lastLevelUpEpoch: _currentEpoch(),
            freeLootboxClaimed: false,
            name: name,
            baseStats: GameTypes.Stats({
                hp: classStats.hp + raceMods.hp,
                mana: classStats.mana + raceMods.mana,
                def: classStats.def + raceMods.def,
                manaReg: classStats.manaReg + raceMods.manaReg,
                hpReg: classStats.hpReg + raceMods.hpReg,
                atkM: classStats.atkM + raceMods.atkM,
                atkR: classStats.atkR + raceMods.atkR
            })
        });

        totalCharacters++;
        countAtLevel[1]++;
        if (maxLevel < 1) maxLevel = 1;

        emit CharacterCreated(characterId, msg.sender, race, classType, name);
        emit HistogramUpdated(1, countAtLevel[1], totalCharacters, maxLevel);
    }

    function claimFreeLootbox(uint256 characterId) external {
        Character storage character = _requireCharacterOwner(characterId, msg.sender);
        if (character.freeLootboxClaimed) revert GameErrors.FreeLootboxAlreadyClaimed();
        character.freeLootboxClaimed = true;
        _lootboxCredits[characterId][2] += 1;
        emit LootboxCredited(characterId, 2, 1);
    }

    function commitAction(uint256 characterId, GameTypes.ActionType actionType, bytes32 commitHash, uint64 nonce)
        external
        payable
        nonReentrant
        returns (uint256 commitId)
    {
        return _commitAction(characterId, actionType, commitHash, nonce, GameTypes.VarianceMode.NEUTRAL);
    }

    /// @notice Commits an action with explicit variance mode for later reveal validation.
    /// @param characterId Character id.
    /// @param actionType Action type.
    /// @param commitHash Hash of reveal preimage.
    /// @param nonce User nonce.
    /// @param varianceMode Variance choice for dungeon or loot open.
    function commitActionWithVariance(
        uint256 characterId,
        GameTypes.ActionType actionType,
        bytes32 commitHash,
        uint64 nonce,
        GameTypes.VarianceMode varianceMode
    ) external payable nonReentrant returns (uint256 commitId) {
        return _commitAction(characterId, actionType, commitHash, nonce, varianceMode);
    }

    function commitFee() external pure returns (uint256) {
        return GameConstants.COMMIT_ACTION_FEE;
    }

    /// @notice Computes the canonical commit hash for lootbox reveal actions.
    /// @param secret User reveal secret.
    /// @param actor Commit owner.
    /// @param characterId Character id.
    /// @param nonce User nonce.
    /// @param tier Lootbox tier.
    /// @param amount Requested exact or max open amount.
    /// @param varianceMode Variance mode used for reveal validation.
    /// @param maxMode True for revealOpenLootboxesMax hash domain.
    function hashLootboxOpen(
        bytes32 secret,
        address actor,
        uint256 characterId,
        uint64 nonce,
        uint32 tier,
        uint16 amount,
        GameTypes.VarianceMode varianceMode,
        bool maxMode
    ) public pure returns (bytes32 hash) {
        if (uint8(varianceMode) >= GameConstants.VARIANCE_MODE_COUNT) {
            revert GameErrors.InvalidVarianceMode();
        }

        if (maxMode) {
            return keccak256(
                abi.encode(
                    secret,
                    actor,
                    GameTypes.ActionType.LOOTBOX_OPEN,
                    characterId,
                    nonce,
                    tier,
                    amount,
                    uint8(varianceMode),
                    true
                )
            );
        }

        return keccak256(
            abi.encode(
                secret, actor, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, tier, amount, uint8(varianceMode)
            )
        );
    }

    /// @notice Computes the canonical commit hash for dungeon run reveal actions.
    /// @param secret User reveal secret.
    /// @param actor Commit owner.
    /// @param characterId Character id.
    /// @param nonce User nonce.
    /// @param difficulty Chosen difficulty.
    /// @param dungeonLevel Target level.
    /// @param varianceMode Variance mode used for reveal validation.
    function hashDungeonRun(
        bytes32 secret,
        address actor,
        uint256 characterId,
        uint64 nonce,
        GameTypes.Difficulty difficulty,
        uint32 dungeonLevel,
        GameTypes.VarianceMode varianceMode
    ) public pure returns (bytes32 hash) {
        if (uint8(varianceMode) >= GameConstants.VARIANCE_MODE_COUNT) {
            revert GameErrors.InvalidVarianceMode();
        }

        hash = keccak256(
            abi.encode(
                secret,
                actor,
                GameTypes.ActionType.DUNGEON_RUN,
                characterId,
                nonce,
                uint8(difficulty),
                dungeonLevel,
                uint8(varianceMode)
            )
        );
    }

    function _commitAction(
        uint256 characterId,
        GameTypes.ActionType actionType,
        bytes32 commitHash,
        uint64 nonce,
        GameTypes.VarianceMode varianceMode
    ) internal returns (uint256 commitId) {
        _requireCharacterOwner(characterId, msg.sender);
        if (actionType == GameTypes.ActionType.NONE) revert GameErrors.InvalidActionType();
        if (commitHash == bytes32(0)) revert GameErrors.InvalidCommit();
        if (uint8(varianceMode) >= GameConstants.VARIANCE_MODE_COUNT) {
            revert GameErrors.InvalidVarianceMode();
        }

        uint256 fee = GameConstants.COMMIT_ACTION_FEE;
        if (msg.value < fee) revert GameErrors.InsufficientCommitFee();
        if (fee > 0) deployer.safeTransferETH(fee);
        if (msg.value > fee) msg.sender.safeTransferETH(msg.value - fee);

        commitId = nextCommitId++;
        commits[commitId] = CommitData({
            actor: msg.sender,
            characterId: characterId,
            actionType: actionType,
            commitHash: commitHash,
            nonce: nonce,
            commitBlock: uint64(block.number),
            varianceMode: varianceMode,
            resolved: false
        });

        emit ActionCommitted(commitId, characterId, msg.sender, actionType, varianceMode, uint64(block.number));
    }

    function cancelExpired(uint256 commitId) external {
        CommitData storage data = commits[commitId];
        if (data.actor == address(0)) revert GameErrors.InvalidCommit();
        if (data.resolved) revert GameErrors.CommitResolved();
        if (msg.sender != data.actor) revert GameErrors.OnlyCharacterOwner();
        if (block.number <= data.commitBlock + 256) revert GameErrors.CommitNotExpired();

        uint256 characterId = data.characterId;
        GameTypes.ActionType actionType = data.actionType;
        delete commits[commitId];
        emit ActionExpired(commitId, characterId, actionType);
    }

    function revealOpenLootboxes(uint256 commitId, bytes32 secret, uint32 tier, uint16 amount) external {
        _revealOpenLootboxes(commitId, secret, tier, amount, GameTypes.VarianceMode.NEUTRAL, true);
    }

    /// @notice Reveals a lootbox open with explicit variance mode.
    /// @param commitId Commit id.
    /// @param secret Reveal secret.
    /// @param tier Lootbox tier.
    /// @param amount Amount to open.
    /// @param varianceMode Variance mode applied to item stat generation.
    function revealOpenLootboxes(
        uint256 commitId,
        bytes32 secret,
        uint32 tier,
        uint16 amount,
        GameTypes.VarianceMode varianceMode
    ) external {
        _revealOpenLootboxes(commitId, secret, tier, amount, varianceMode, false);
    }

    /// @notice Reveals lootbox opening with best-effort max semantics for agents.
    /// @dev Opens up to `maxAmount` and resolves commit even when current credits are lower.
    function revealOpenLootboxesMax(uint256 commitId, bytes32 secret, uint32 tier, uint16 maxAmount)
        external
        returns (uint16 openedAmount)
    {
        openedAmount = _revealOpenLootboxesMax(commitId, secret, tier, maxAmount, GameTypes.VarianceMode.NEUTRAL, true);
    }

    /// @notice Reveals lootbox opening with explicit variance and max semantics.
    /// @param commitId Commit id.
    /// @param secret Reveal secret.
    /// @param tier Lootbox tier.
    /// @param maxAmount Upper bound requested by caller.
    /// @param varianceMode Variance mode applied to minted rewards.
    /// @return openedAmount Actual amount opened after credit checks.
    function revealOpenLootboxesMax(
        uint256 commitId,
        bytes32 secret,
        uint32 tier,
        uint16 maxAmount,
        GameTypes.VarianceMode varianceMode
    ) external returns (uint16 openedAmount) {
        openedAmount = _revealOpenLootboxesMax(commitId, secret, tier, maxAmount, varianceMode, false);
    }

    function _revealOpenLootboxes(
        uint256 commitId,
        bytes32 secret,
        uint32 tier,
        uint16 amount,
        GameTypes.VarianceMode varianceMode,
        bool legacyHash
    ) internal {
        if (amount == 0) revert GameErrors.AmountZero();
        if (uint8(varianceMode) >= GameConstants.VARIANCE_MODE_COUNT) {
            revert GameErrors.InvalidVarianceMode();
        }

        CommitData storage data = _validateRevealBase(commitId, GameTypes.ActionType.LOOTBOX_OPEN);
        if (msg.sender != data.actor) revert GameErrors.OnlyCharacterOwner();
        if (data.varianceMode != varianceMode) revert GameErrors.InvalidVarianceMode();

        bytes32 expected;
        if (legacyHash) {
            expected =
                keccak256(abi.encode(secret, msg.sender, data.actionType, data.characterId, data.nonce, tier, amount));
        } else {
            expected =
                hashLootboxOpen(secret, msg.sender, data.characterId, data.nonce, tier, amount, varianceMode, false);
        }
        if (expected != data.commitHash) revert GameErrors.InvalidReveal();

        data.resolved = true;
        _consumeLootboxCredits(data.characterId, tier, amount, varianceMode);

        bytes32 entropy = keccak256(abi.encode(secret, data.characterId, tier, amount, blockhash(data.commitBlock + 2)));
        _openLootboxRewards(data.characterId, commitId, tier, amount, varianceMode, entropy);
        emit LootboxOpened(data.characterId, commitId, tier, amount, varianceMode, entropy);

        delete commits[commitId];
    }

    function _revealOpenLootboxesMax(
        uint256 commitId,
        bytes32 secret,
        uint32 tier,
        uint16 maxAmount,
        GameTypes.VarianceMode varianceMode,
        bool legacyHash
    ) internal returns (uint16 openedAmount) {
        if (maxAmount == 0) revert GameErrors.AmountZero();
        if (uint8(varianceMode) >= GameConstants.VARIANCE_MODE_COUNT) {
            revert GameErrors.InvalidVarianceMode();
        }

        CommitData storage data = _validateRevealBase(commitId, GameTypes.ActionType.LOOTBOX_OPEN);
        if (msg.sender != data.actor) revert GameErrors.OnlyCharacterOwner();
        if (data.varianceMode != varianceMode) revert GameErrors.InvalidVarianceMode();

        bytes32 expected;
        if (legacyHash) {
            expected = keccak256(
                abi.encode(secret, msg.sender, data.actionType, data.characterId, data.nonce, tier, maxAmount, true)
            );
        } else {
            expected =
                hashLootboxOpen(secret, msg.sender, data.characterId, data.nonce, tier, maxAmount, varianceMode, true);
        }
        if (expected != data.commitHash) revert GameErrors.InvalidReveal();

        data.resolved = true;
        (,,, openedAmount) = _quoteOpenLootboxes(data.characterId, tier, maxAmount, varianceMode);

        if (openedAmount > 0) {
            _consumeLootboxCredits(data.characterId, tier, openedAmount, varianceMode);
        }

        bytes32 entropy =
            keccak256(abi.encode(secret, data.characterId, tier, openedAmount, blockhash(data.commitBlock + 2)));

        if (openedAmount > 0) {
            _openLootboxRewards(data.characterId, commitId, tier, openedAmount, varianceMode, entropy);
        }

        emit LootboxOpenMaxResolved(data.characterId, commitId, tier, maxAmount, openedAmount, varianceMode);
        emit LootboxOpened(data.characterId, commitId, tier, openedAmount, varianceMode, entropy);

        delete commits[commitId];
    }

    function _openLootboxRewards(
        uint256 characterId,
        uint256 commitId,
        uint32 tier,
        uint16 amount,
        GameTypes.VarianceMode varianceMode,
        bytes32 entropy
    ) internal {
        Character storage character = _characters[characterId];

        for (uint256 i = 0; i < amount; i++) {
            bytes32 itemEntropy = keccak256(abi.encode(entropy, i));
            uint64 seed = uint64(uint256(itemEntropy));
            GameTypes.Slot slot = GameTypes.Slot(uint8(uint256(itemEntropy) % 8));
            uint256 itemId = items.mint(character.owner, slot, tier, seed, varianceMode);
            emit LootboxItemDropped(characterId, commitId, itemId, slot, tier, seed, varianceMode);

            if (_shouldDropPotion(itemEntropy, tier)) {
                (GameTypes.PotionType potionType, GameTypes.PotionTier potionTier) = _rollPotionDrop(itemEntropy, tier);
                _creditPotion(characterId, potionType, potionTier, 1);
                emit LootboxPotionDropped(characterId, commitId, potionType, potionTier, 1);
            }
        }
    }

    /// @notice Equips one item onto its slot for the caller-owned character.
    /// @param characterId Character id.
    /// @param itemId Item token id.
    function equipItem(uint256 characterId, uint256 itemId) external {
        Character storage character = _requireCharacterOwner(characterId, msg.sender);
        _equipItem(characterId, character, msg.sender, itemId);
    }

    /// @notice Equips multiple items in one transaction (max 8) for agent UX.
    /// @param characterId Character id.
    /// @param itemIds Item ids to equip in order.
    function equipItems(uint256 characterId, uint256[] calldata itemIds) external {
        Character storage character = _requireCharacterOwner(characterId, msg.sender);
        uint256 length = itemIds.length;
        if (length == 0) revert GameErrors.AmountZero();
        if (length > 8) revert GameErrors.BatchTooLarge();

        for (uint256 i = 0; i < length; i++) {
            _equipItem(characterId, character, msg.sender, itemIds[i]);
        }
    }

    /// @notice Items hook: if an equipped ERC721 is transferred away, auto-unequip it and emit an event.
    /// @dev Called by Items via `_afterTokenTransfer`. Must never revert for normal transfers.
    function onItemTransfer(uint256 itemId, address from, address to) external {
        if (msg.sender != address(items)) revert GameErrors.OnlyItems();
        uint256 packed = equippedLocationByItemId[itemId];
        if (packed == 0) return;

        uint256 characterId = packed >> 8;
        uint8 slotIndex = uint8(packed);
        if (characterId == 0) {
            delete equippedLocationByItemId[itemId];
            return;
        }

        // If the mapping is stale, clean it up without reverting the transfer.
        if (equippedItemBySlot[characterId][slotIndex] != itemId) {
            delete equippedLocationByItemId[itemId];
            return;
        }

        Character storage character = _characters[characterId];
        if (character.owner == address(0)) {
            equippedItemBySlot[characterId][slotIndex] = 0;
            delete equippedLocationByItemId[itemId];
            return;
        }

        (bool wasSet, uint8 setId) = items.itemSetInfo(itemId);
        uint8 oldSetCount;
        if (wasSet) {
            // Item ownership has already changed at this point; treat `itemId` as still owned by the character owner
            // so set threshold transitions reflect the unequip that the indexer observes.
            oldSetCount = _setPieceCountWithOwnedOverride(characterId, character.owner, setId, itemId);
        }

        equippedItemBySlot[characterId][slotIndex] = 0;
        delete equippedLocationByItemId[itemId];
        emit ItemUnequipped(characterId, itemId, GameTypes.Slot(slotIndex), from, to);

        if (wasSet) {
            uint8 newSetCount = _setPieceCount(characterId, character.owner, setId);
            _emitSetThresholdTransitions(characterId, setId, oldSetCount, newSetCount);
        }
    }

    function _equipItem(uint256 characterId, Character storage character, address account, uint256 itemId) internal {
        if (_runs[characterId].active) revert GameErrors.GearLockedDuringRun();
        if (items.ownerOf(itemId) != account) revert GameErrors.NotItemOwner();

        (GameTypes.Slot slot, uint32 tier,) = items.decode(itemId);
        if (tier > _nextLevelCap(character.bestLevel)) revert GameErrors.EquipTierTooHigh();
        uint8 slotIndex = uint8(slot);
        uint256 oldItemId = equippedItemBySlot[characterId][slotIndex];

        // Disallow equipping the same token into multiple slots/characters.
        // (We don't provide an explicit "unequip"; replacement via another item clears the mapping.)
        uint256 existingPacked = equippedLocationByItemId[itemId];
        if (existingPacked != 0) {
            uint256 existingCharacterId = existingPacked >> 8;
            uint8 existingSlot = uint8(existingPacked);
            if (existingCharacterId != characterId || existingSlot != slotIndex) {
                revert GameErrors.ItemAlreadyEquipped();
            }
        }

        (bool oldSet, uint8 oldSetId) = oldItemId == 0 ? (false, 0) : items.itemSetInfo(oldItemId);
        (bool newSet, uint8 newSetId) = items.itemSetInfo(itemId);
        uint8 oldCountA;
        uint8 oldCountB;
        if (oldSet) oldCountA = _setPieceCount(characterId, character.owner, oldSetId);
        if (newSet && (!oldSet || newSetId != oldSetId)) {
            oldCountB = _setPieceCount(characterId, character.owner, newSetId);
        }

        // Clear reverse mapping for the displaced item (if any).
        if (oldItemId != 0) {
            uint256 expectedOldPacked = (characterId << 8) | uint256(slotIndex);
            if (equippedLocationByItemId[oldItemId] == expectedOldPacked) {
                delete equippedLocationByItemId[oldItemId];
            }
        }

        equippedItemBySlot[characterId][slotIndex] = itemId;
        equippedLocationByItemId[itemId] = (characterId << 8) | uint256(slotIndex);
        emit ItemEquipped(characterId, itemId, slot);

        if (oldSet) {
            uint8 newCountA = _setPieceCount(characterId, character.owner, oldSetId);
            _emitSetThresholdTransitions(characterId, oldSetId, oldCountA, newCountA);
        }
        if (newSet && (!oldSet || newSetId != oldSetId)) {
            uint8 newCountB = _setPieceCount(characterId, character.owner, newSetId);
            _emitSetThresholdTransitions(characterId, newSetId, oldCountB, newCountB);
        }
    }

    function revealStartDungeon(uint256 commitId, bytes32 secret, GameTypes.Difficulty difficulty, uint32 dungeonLevel)
        external
    {
        _revealStartDungeon(commitId, secret, difficulty, dungeonLevel, GameTypes.VarianceMode.NEUTRAL, true);
    }

    /// @notice Reveals dungeon start with explicit variance mode.
    /// @param commitId Commit id.
    /// @param secret Reveal secret.
    /// @param difficulty Chosen dungeon difficulty.
    /// @param dungeonLevel Target dungeon level.
    /// @param varianceMode Variance mode attached to the run.
    function revealStartDungeon(
        uint256 commitId,
        bytes32 secret,
        GameTypes.Difficulty difficulty,
        uint32 dungeonLevel,
        GameTypes.VarianceMode varianceMode
    ) external {
        _revealStartDungeon(commitId, secret, difficulty, dungeonLevel, varianceMode, false);
    }

    function _revealStartDungeon(
        uint256 commitId,
        bytes32 secret,
        GameTypes.Difficulty difficulty,
        uint32 dungeonLevel,
        GameTypes.VarianceMode varianceMode,
        bool legacyHash
    ) internal {
        if (uint8(varianceMode) >= GameConstants.VARIANCE_MODE_COUNT) {
            revert GameErrors.InvalidVarianceMode();
        }
        CommitData storage data = _validateRevealBase(commitId, GameTypes.ActionType.DUNGEON_RUN);
        if (msg.sender != data.actor) revert GameErrors.OnlyCharacterOwner();
        if (data.varianceMode != varianceMode) revert GameErrors.InvalidVarianceMode();

        bytes32 expected;
        if (legacyHash) {
            expected = keccak256(
                abi.encode(
                    secret, msg.sender, data.actionType, data.characterId, data.nonce, uint8(difficulty), dungeonLevel
                )
            );
        } else {
            expected = hashDungeonRun(
                secret, msg.sender, data.characterId, data.nonce, difficulty, dungeonLevel, varianceMode
            );
        }
        if (expected != data.commitHash) revert GameErrors.InvalidReveal();

        RunState storage run = _runs[data.characterId];
        if (run.active) revert GameErrors.RunAlreadyActive();
        Character storage character = _characters[data.characterId];
        if (dungeonLevel == 0) revert GameErrors.InvalidDungeonLevel();
        if (dungeonLevel > _nextLevelCap(character.bestLevel)) revert GameErrors.InvalidDungeonLevel();
        uint8 requiredSlots = GameConstants.minEquippedSlotsForDungeonLevel(dungeonLevel);
        if (_equippedSlotCount(data.characterId, character.owner) < requiredSlots) {
            revert GameErrors.InsufficientEquippedSlots();
        }

        data.resolved = true;
        uint256 entryFeeAmount = runEntryFee(dungeonLevel);
        if (entryFeeAmount > 0) {
            address(mmoToken).safeTransferFrom(msg.sender, GameConstants.MMO_SINK_ADDRESS, entryFeeAmount);
            emit RunEntryFeeSunk(data.characterId, commitId, entryFeeAmount);
        }

        GameTypes.Stats memory stats = _characterTotalStats(data.characterId, character.owner, character.classType);
        bytes32 seedHash = keccak256(
            abi.encode(
                secret, blockhash(data.commitBlock + 2), data.characterId, dungeonLevel, uint8(difficulty), data.nonce
            )
        );
        uint256 seed = uint256(seedHash);
        uint8 roomCount = uint8(GameConstants.ROOM_MIN + (seed % (GameConstants.ROOM_MAX - GameConstants.ROOM_MIN + 1)));

        run.active = true;
        run.owner = character.owner;
        run.difficulty = difficulty;
        run.varianceMode = varianceMode;
        run.dungeonLevel = dungeonLevel;
        run.roomCount = roomCount;
        run.roomsCleared = 0;
        run.currentHp = stats.hp;
        run.currentMana = stats.mana;
        run.maxHp = stats.hp;
        run.maxMana = stats.mana;
        run.hpPotionCharges = GameConstants.MAX_POTION_CHARGES;
        run.manaPotionCharges = GameConstants.MAX_POTION_CHARGES;
        run.powerPotionCharges = GameConstants.MAX_POTION_CHARGES;
        run.hpRegen = stats.hpReg;
        run.manaRegen = stats.manaReg;
        run.repairEscrow = 0;
        run.commitId = uint64(commitId);
        run.seed = seed;
        if (dungeonLevel > 10) {
            uint256 escrowAmount = repairFee(dungeonLevel);
            run.repairEscrow = uint96(escrowAmount);
            address(mmoToken).safeTransferFrom(msg.sender, address(this), escrowAmount);
            emit RepairEscrowed(data.characterId, commitId, escrowAmount);
        }

        emit DungeonStarted(data.characterId, commitId, dungeonLevel, difficulty, varianceMode, roomCount);

        delete commits[commitId];
    }

    /// @notice Resolves the next dungeon room with explicit potion/ability choices.
    function resolveNextRoom(
        uint256 characterId,
        GameTypes.PotionChoice potionChoice,
        GameTypes.AbilityChoice abilityChoice
    ) external {
        _resolveNextRoom(characterId, potionChoice, abilityChoice, msg.sender);
    }

    /// @notice Resolves multiple rooms in one tx (bounded by ROOM_MAX) for agent throughput.
    /// @param characterId Character id.
    /// @param potionChoices Potion choices per step.
    /// @param abilityChoices Ability choices per step.
    /// @return resolvedCount Number of rooms resolved in this call.
    /// @return runStillActive Whether the run remains active after this call.
    function resolveRooms(
        uint256 characterId,
        GameTypes.PotionChoice[] calldata potionChoices,
        GameTypes.AbilityChoice[] calldata abilityChoices
    ) external returns (uint8 resolvedCount, bool runStillActive) {
        uint256 length = potionChoices.length;
        if (length == 0) revert GameErrors.AmountZero();
        if (length != abilityChoices.length) revert GameErrors.ArrayLengthMismatch();
        if (length > GameConstants.ROOM_MAX) revert GameErrors.BatchTooLarge();

        for (uint256 i = 0; i < length; i++) {
            if (!_runs[characterId].active) break;
            _resolveNextRoom(characterId, potionChoices[i], abilityChoices[i], msg.sender);
            resolvedCount++;
        }

        runStillActive = _runs[characterId].active;
    }

    function _resolveNextRoom(
        uint256 characterId,
        GameTypes.PotionChoice potionChoice,
        GameTypes.AbilityChoice abilityChoice,
        address account
    ) internal {
        RunState storage run = _runs[characterId];
        if (!run.active) revert GameErrors.RunNotActive();
        if (run.owner != account) revert GameErrors.NotRunOwner();
        if (run.roomsCleared >= run.roomCount) revert GameErrors.RoomAlreadyResolved();

        Character storage character = _characters[characterId];
        GameTypes.Stats memory stats = _characterTotalStats(characterId, character.owner, character.classType);

        StrategyEffects memory effects =
            _applyStrategy(characterId, run, character.classType, potionChoice, abilityChoice);

        bool boss = isBossRoom(characterId, run.roomsCleared);
        uint256 mobPower = _mobPower(run.dungeonLevel, run.difficulty, run.roomsCleared, run.seed, boss);
        uint16 tacticBonusBps = GameConstants.tacticalMobBonusBps(run.dungeonLevel, boss, potionChoice, abilityChoice);
        if (tacticBonusBps > 0) {
            mobPower = (mobPower * (GameConstants.BPS + tacticBonusBps)) / GameConstants.BPS;
        }
        uint16 starterAssistBps =
            GameConstants.starterMobAssistBps(run.dungeonLevel, _equippedSlotCount(characterId, character.owner));
        if (starterAssistBps < GameConstants.BPS) {
            mobPower = (mobPower * starterAssistBps) / GameConstants.BPS;
        }

        uint256 attackValue = character.classType == GameTypes.Class.MAGE ? stats.atkM : stats.atkR;
        if (effects.attackAbilityBonusBps > 0) {
            attackValue = (attackValue * (GameConstants.BPS + effects.attackAbilityBonusBps)) / GameConstants.BPS;
        }
        if (effects.attackPotionBonusBps > 0) {
            attackValue = (attackValue * (GameConstants.BPS + effects.attackPotionBonusBps)) / GameConstants.BPS;
        }
        uint256 defenseValue = (uint256(stats.def) * (GameConstants.BPS + effects.defenseBonusBps)) / GameConstants.BPS;
        uint256 playerPower =
            attackValue + defenseValue + (uint256(run.currentHp) / 6) + (uint256(run.currentMana) / 12);
        (uint8 equippedSetPieces, uint8 highestSetMatchCount, uint8 highAffixPieces) =
            _equippedSetAndAffixContext(characterId, character.owner);

        (uint256 pressurePenaltyBps,,,,,,) = _estimatePressurePenaltyFromContext(
            equippedSetPieces, highestSetMatchCount, highAffixPieces, run.dungeonLevel
        );
        playerPower = (playerPower * _effectivePowerBpsAfterPenalty(pressurePenaltyBps)) / GameConstants.BPS;

        if (playerPower < mobPower) {
            _endRunAsFailure(characterId, run, boss);
            return;
        }

        uint256 scaledMobDamage = (mobPower * GameConstants.ROOM_DAMAGE_BASE_BPS) / GameConstants.BPS;
        uint256 damage = (scaledMobDamage * 100) / (defenseValue + 100);
        if (boss) damage = (damage * GameConstants.BOSS_DAMAGE_BPS) / GameConstants.BPS;
        if (effects.damageTakenBonusBps > 0) {
            damage = (damage * (GameConstants.BPS + effects.damageTakenBonusBps)) / GameConstants.BPS;
        }

        if (damage >= run.currentHp) {
            run.currentHp = 0;
            _endRunAsFailure(characterId, run, boss);
            return;
        }

        run.currentHp -= uint32(damage);
        emit DungeonRoomResolved(characterId, run.roomsCleared, boss, true, run.currentHp, run.currentMana);

        run.roomsCleared++;
        if (run.roomsCleared == run.roomCount) {
            run.active = false;
            _refundRepairEscrow(characterId, run);
            _onDungeonSuccess(characterId, run.dungeonLevel, run.difficulty, run.seed, run.varianceMode);
            emit DungeonFinished(characterId, run.dungeonLevel, true, run.roomsCleared, run.roomCount);
        }
    }

    function isBossRoom(uint256 characterId, uint8 roomIndex) public view returns (bool) {
        RunState storage run = _runs[characterId];
        if (run.roomCount == 0 || roomIndex >= run.roomCount) return false;
        if (roomIndex == run.roomCount - 1) return true;
        return run.roomCount >= 7 && roomIndex == run.roomCount / 2;
    }

    function getRunState(uint256 characterId)
        external
        view
        returns (
            bool active,
            uint8 roomCount,
            uint8 roomsCleared,
            uint32 currentHp,
            uint32 currentMana,
            uint8 hpPotionCharges,
            uint8 manaPotionCharges,
            uint8 powerPotionCharges,
            uint32 dungeonLevel,
            GameTypes.Difficulty difficulty
        )
    {
        RunState storage run = _runs[characterId];
        active = run.active;
        roomCount = run.roomCount;
        roomsCleared = run.roomsCleared;
        currentHp = run.currentHp;
        currentMana = run.currentMana;
        hpPotionCharges = run.hpPotionCharges;
        manaPotionCharges = run.manaPotionCharges;
        powerPotionCharges = run.powerPotionCharges;
        dungeonLevel = run.dungeonLevel;
        difficulty = run.difficulty;
    }

    function creditPremiumLootboxesFromVault(
        uint256 characterId,
        GameTypes.Difficulty difficulty,
        uint16 amount,
        address buyer
    ) external {
        if (msg.sender != feeVault) revert GameErrors.OnlyFeeVault();
        if (amount == 0) revert GameErrors.AmountZero();
        Character storage character = _requireCharacterOwner(characterId, buyer);

        uint32 tier = _lootTierForLevel(character.bestLevel, difficulty);
        _lootboxCredits[characterId][tier] += amount;

        emit LootboxCredited(characterId, tier, amount);
    }

    function characterName(uint256 characterId) external view returns (string memory) {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        return character.name;
    }

    function characterBestLevel(uint256 characterId) external view returns (uint32) {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        return character.bestLevel;
    }

    function characterLastLevelUpEpoch(uint256 characterId) external view returns (uint32) {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        return character.lastLevelUpEpoch;
    }

    function ownerOfCharacter(uint256 characterId) external view returns (address) {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        return character.owner;
    }

    /// @notice Returns credited premium lootbox tier for a purchase at current character level.
    /// @param characterId Character id.
    /// @param difficulty Difficulty chosen for purchase.
    function premiumLootboxTier(uint256 characterId, GameTypes.Difficulty difficulty)
        external
        view
        returns (uint32 tier)
    {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        tier = _lootTierForLevel(character.bestLevel, difficulty);
    }

    /// @notice Returns number of currently equipped slots for a character.
    /// @dev Counts only items still owned by the character owner.
    function equippedSlotCount(uint256 characterId) external view returns (uint8 count) {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        count = _equippedSlotCount(characterId, character.owner);
    }

    /// @notice Returns required equipped slot count for entering a dungeon level.
    /// @param dungeonLevel Target dungeon level.
    function requiredEquippedSlots(uint32 dungeonLevel) external pure returns (uint8) {
        if (dungeonLevel == 0) revert GameErrors.InvalidDungeonLevel();
        return GameConstants.minEquippedSlotsForDungeonLevel(dungeonLevel);
    }

    /// @notice Returns required successful clears to advance from `dungeonLevel-1` to `dungeonLevel`.
    /// @param dungeonLevel Target dungeon level.
    function requiredClearsForLevel(uint32 dungeonLevel) external pure returns (uint8) {
        if (dungeonLevel == 0) revert GameErrors.InvalidDungeonLevel();
        return GameConstants.requiredClearsForDungeonLevel(dungeonLevel);
    }

    /// @notice Returns the recommended set-piece count at a dungeon level.
    /// @param dungeonLevel Target dungeon level.
    function recommendedSetPieces(uint32 dungeonLevel) external pure returns (uint8) {
        if (dungeonLevel == 0) revert GameErrors.InvalidDungeonLevel();
        return GameConstants.recommendedSetPiecesForDungeonLevel(dungeonLevel);
    }

    /// @notice Returns recommended highest same-set match count for late-game progression pressure.
    /// @param dungeonLevel Target dungeon level.
    function recommendedMatchingSetPieces(uint32 dungeonLevel) external pure returns (uint8) {
        if (dungeonLevel == 0) revert GameErrors.InvalidDungeonLevel();
        return GameConstants.recommendedMatchingSetPiecesForDungeonLevel(dungeonLevel);
    }

    /// @notice Returns recommended number of high-affix equipped pieces for the target dungeon level.
    /// @param dungeonLevel Target dungeon level.
    function recommendedHighAffixPieces(uint32 dungeonLevel) external pure returns (uint8) {
        if (dungeonLevel == 0) revert GameErrors.InvalidDungeonLevel();
        return GameConstants.recommendedHighAffixPiecesForDungeonLevel(dungeonLevel);
    }

    /// @notice Returns tactical mob-power bonus applied when choosing no potion and no ability.
    /// @param dungeonLevel Target dungeon level.
    /// @param boss Whether current room is a boss room.
    /// @param potionChoice Chosen potion action.
    /// @param abilityChoice Chosen ability action.
    function tacticalMobBonusBps(
        uint32 dungeonLevel,
        bool boss,
        GameTypes.PotionChoice potionChoice,
        GameTypes.AbilityChoice abilityChoice
    ) external pure returns (uint16 bonusBps) {
        if (dungeonLevel == 0) revert GameErrors.InvalidDungeonLevel();
        bonusBps = GameConstants.tacticalMobBonusBps(dungeonLevel, boss, potionChoice, abilityChoice);
    }

    /// @notice Returns current clear progress for a not-yet-unlocked dungeon level.
    /// @param characterId Character id.
    /// @param dungeonLevel Target dungeon level.
    function levelClearProgress(uint256 characterId, uint32 dungeonLevel) external view returns (uint8) {
        if (dungeonLevel == 0) revert GameErrors.InvalidDungeonLevel();
        return _levelClearProgress[characterId][dungeonLevel];
    }

    /// @notice Returns currently equipped set-piece count (0-8) for a character.
    /// @param characterId Character id.
    function equippedSetPieceCount(uint256 characterId) external view returns (uint8 count) {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        count = _equippedSetPieceCount(characterId, character.owner);
    }

    /// @notice Returns highest same-set match count among equipped set pieces.
    /// @param characterId Character id.
    function equippedHighestSetMatchCount(uint256 characterId) external view returns (uint8 highestSetMatchCount) {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        (, highestSetMatchCount,) = _equippedSetAndAffixContext(characterId, character.owner);
    }

    /// @notice Returns number of equipped items meeting high-affix threshold.
    /// @param characterId Character id.
    function equippedHighAffixPieceCount(uint256 characterId) external view returns (uint8 highAffixPieces) {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        (,, highAffixPieces) = _equippedSetAndAffixContext(characterId, character.owner);
    }

    /// @notice Returns compact progression + build-pressure context for agent decision loops.
    /// @param characterId Character id.
    function getProgressionSnapshot(uint256 characterId) external view returns (ProgressionSnapshot memory snapshot) {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();

        uint32 targetLevel = character.bestLevel == type(uint32).max ? character.bestLevel : character.bestLevel + 1;
        (uint8 setPieces, uint8 matchingSetPieces, uint8 highAffixPieces) =
            _equippedSetAndAffixContext(characterId, character.owner);
        (
            ,,,,
            uint8 recommendedSetPiecesRequired,
            uint8 recommendedMatchingSetPiecesRequired,
            uint8 recommendedHighAffixPiecesRequired
        ) = _estimatePressurePenaltyFromContext(setPieces, matchingSetPieces, highAffixPieces, targetLevel);

        snapshot = ProgressionSnapshot({
            bestLevel: character.bestLevel,
            targetLevel: targetLevel,
            requiredClears: GameConstants.requiredClearsForDungeonLevel(targetLevel),
            currentClears: _levelClearProgress[characterId][targetLevel],
            requiredSlots: GameConstants.minEquippedSlotsForDungeonLevel(targetLevel),
            equippedSlots: _equippedSlotCount(characterId, character.owner),
            setPieces: setPieces,
            matchingSetPieces: matchingSetPieces,
            highAffixPieces: highAffixPieces,
            recommendedSetPieces: recommendedSetPiecesRequired,
            recommendedMatchingSetPieces: recommendedMatchingSetPiecesRequired,
            recommendedHighAffixPieces: recommendedHighAffixPiecesRequired,
            repairFeeAmount: repairFee(targetLevel),
            runEntryFeeAmount: runEntryFee(targetLevel)
        });
    }

    /// @notice Estimates current pressure penalty bps for a target level using live equipped context.
    /// @param characterId Character id.
    /// @param targetLevel Target dungeon level.
    function estimatePressurePenaltyBps(uint256 characterId, uint32 targetLevel)
        external
        view
        returns (uint256 pressurePenaltyBps)
    {
        if (targetLevel == 0) revert GameErrors.InvalidDungeonLevel();
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        (uint8 setPieces, uint8 matchingSetPieces, uint8 highAffixPieces) =
            _equippedSetAndAffixContext(characterId, character.owner);
        (pressurePenaltyBps,,,,,,) =
            _estimatePressurePenaltyFromContext(setPieces, matchingSetPieces, highAffixPieces, targetLevel);
    }

    /// @notice Returns deficits vs recommended build targets for the given level, including target set band.
    /// @param characterId Character id.
    /// @param targetLevel Target dungeon level.
    function recommendedBuildDeficits(uint256 characterId, uint32 targetLevel)
        external
        view
        returns (BuildDeficits memory deficits)
    {
        if (targetLevel == 0) revert GameErrors.InvalidDungeonLevel();
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();

        (uint8 setPieces, uint8 matchingSetPieces, uint8 highAffixPieces) =
            _equippedSetAndAffixContext(characterId, character.owner);
        (uint256 penalty, uint8 missingSet, uint8 missingMatch, uint8 missingAffix,,,) =
            _estimatePressurePenaltyFromContext(setPieces, matchingSetPieces, highAffixPieces, targetLevel);

        uint32 targetTier = targetLevel == type(uint32).max ? targetLevel : targetLevel + 1;
        uint8 suggestedBand = GameConstants.setBandForTier(targetTier);
        (uint8 minSetId, uint8 maxSetId) = GameConstants.setBandBounds(suggestedBand);
        deficits = BuildDeficits({
            missingSetPieces: missingSet,
            missingMatchingSetPieces: missingMatch,
            missingHighAffixPieces: missingAffix,
            suggestedSetBand: suggestedBand,
            suggestedSetIdMin: minSetId,
            suggestedSetIdMax: maxSetId,
            estimatedPenaltyBps: penalty
        });
    }

    /// @notice Scores whether a candidate item would reduce build deficits at target level if equipped in its slot.
    /// @param characterId Character id.
    /// @param itemTokenId Candidate item token id.
    /// @param targetLevel Target dungeon level.
    /// @return utilityBps 0-10_000 utility score where higher means stronger deficit reduction.
    /// @return projectedSetPieces Set pieces after equipping candidate in its slot.
    /// @return projectedMatchingSetPieces Matching set pieces after equipping candidate in its slot.
    /// @return projectedHighAffixPieces High-affix pieces after equipping candidate in its slot.
    function scoreItemForTargetLevel(uint256 characterId, uint256 itemTokenId, uint32 targetLevel)
        external
        view
        returns (
            uint16 utilityBps,
            uint8 projectedSetPieces,
            uint8 projectedMatchingSetPieces,
            uint8 projectedHighAffixPieces
        )
    {
        if (targetLevel == 0) revert GameErrors.InvalidDungeonLevel();
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();

        (GameTypes.Slot slot,,) = items.decode(itemTokenId);
        (uint8 currentSetPieces, uint8 currentMatchingSetPieces, uint8 currentHighAffixPieces) =
            _equippedSetAndAffixContext(characterId, character.owner);
        (projectedSetPieces, projectedMatchingSetPieces, projectedHighAffixPieces) =
            _projectedContextWithItem(characterId, character.owner, uint8(slot), itemTokenId);

        (, uint8 currentMissingSet, uint8 currentMissingMatch, uint8 currentMissingAffix,,,) = _estimatePressurePenaltyFromContext(
            currentSetPieces, currentMatchingSetPieces, currentHighAffixPieces, targetLevel
        );
        (, uint8 projectedMissingSet, uint8 projectedMissingMatch, uint8 projectedMissingAffix,,,) = _estimatePressurePenaltyFromContext(
            projectedSetPieces, projectedMatchingSetPieces, projectedHighAffixPieces, targetLevel
        );

        uint256 score;
        if (projectedMissingMatch < currentMissingMatch) {
            score += uint256(currentMissingMatch - projectedMissingMatch) * 3_400;
        }
        if (projectedMissingSet < currentMissingSet) {
            score += uint256(currentMissingSet - projectedMissingSet) * 2_400;
        }
        if (projectedMissingAffix < currentMissingAffix) {
            score += uint256(currentMissingAffix - projectedMissingAffix) * 2_000;
        }
        if (score > GameConstants.BPS) score = GameConstants.BPS;
        utilityBps = uint16(score);
    }

    function lootboxCredits(uint256 characterId, uint32 tier) external view returns (uint32) {
        return _lootboxCredits[characterId][tier];
    }

    /// @notice Returns reveal bounds and current revealability for a commit.
    /// @param commitId Commit id.
    /// @return startBlock First block where reveal is valid.
    /// @return endBlock Last block where reveal is valid.
    /// @return canReveal True when current block is within reveal window.
    /// @return expired True when reveal window has elapsed.
    /// @return resolved True when commit has already been resolved.
    function revealWindow(uint256 commitId)
        external
        view
        returns (uint64 startBlock, uint64 endBlock, bool canReveal, bool expired, bool resolved)
    {
        CommitData storage data = commits[commitId];
        // Commits are deleted on resolution/expiry to prevent unbounded storage growth.
        // Treat missing commits as resolved for agent schedulers (nothing left to reveal).
        if (data.actor == address(0)) {
            resolved = true;
            return (0, 0, false, false, true);
        }

        startBlock = data.commitBlock + 2;
        endBlock = data.commitBlock + 256;
        resolved = data.resolved;
        canReveal = !resolved && block.number >= startBlock && block.number <= endBlock;
        expired = !resolved && block.number > endBlock;
    }

    /// @notice Returns exact openability for a requested lootbox open action.
    /// @param characterId Character id.
    /// @param tier Lootbox tier.
    /// @param requestedAmount Desired amount to open.
    /// @param varianceMode Variance mode the reveal will use.
    /// @return availableTotal Total credits at `tier`.
    /// @return availableBound Variance-bound credits for `varianceMode`.
    /// @return availableGeneric Generic credits spendable with any variance mode.
    /// @return openableAmount Maximum open amount not causing insufficient-credit revert.
    function quoteOpenLootboxes(
        uint256 characterId,
        uint32 tier,
        uint16 requestedAmount,
        GameTypes.VarianceMode varianceMode
    )
        external
        view
        returns (uint32 availableTotal, uint32 availableBound, uint32 availableGeneric, uint16 openableAmount)
    {
        if (uint8(varianceMode) >= GameConstants.VARIANCE_MODE_COUNT) {
            revert GameErrors.InvalidVarianceMode();
        }
        return _quoteOpenLootboxes(characterId, tier, requestedAmount, varianceMode);
    }

    function potionBalance(uint256 characterId, GameTypes.PotionType potionType, GameTypes.PotionTier potionTier)
        external
        view
        returns (uint32)
    {
        return _potionInventory[characterId][uint8(potionType)][uint8(potionTier)];
    }

    /// @notice Returns upgrade stone balance for a character.
    function upgradeStoneBalance(uint256 characterId) external view returns (uint32) {
        return _upgradeStones[characterId];
    }

    /// @notice Returns run-bound credits for a specific variance mode.
    function lootboxBoundCredits(uint256 characterId, uint32 tier, GameTypes.VarianceMode varianceMode)
        external
        view
        returns (uint32)
    {
        return _boundLootboxCredits[characterId][tier][uint8(varianceMode)];
    }

    /// @notice Returns immutable variance mode for the currently active run.
    function runVarianceMode(uint256 characterId) external view returns (GameTypes.VarianceMode) {
        return _runs[characterId].varianceMode;
    }

    /// @notice Repair fee curve for level>10 dungeon runs.
    /// @param dungeonLevel Target dungeon level.
    function repairFee(uint32 dungeonLevel) public pure returns (uint256 fee) {
        if (dungeonLevel <= 10) return 0;
        uint256 exponent = uint256(dungeonLevel - 10);
        if (exponent > 256) return GameConstants.REPAIR_MAX;
        uint256 growth = FixedPointMathLib.rpow(GameConstants.REPAIR_GROWTH_WAD, exponent, GameConstants.WAD);
        fee = FixedPointMathLib.mulWad(GameConstants.REPAIR_BASE, growth);
        if (fee > GameConstants.REPAIR_MAX) fee = GameConstants.REPAIR_MAX;
    }

    /// @notice MMO sink paid at run start for level>20 to enforce late-game bankroll management.
    /// @param dungeonLevel Target dungeon level.
    function runEntryFee(uint32 dungeonLevel) public pure returns (uint256 fee) {
        if (dungeonLevel <= 20) return 0;
        uint256 exponent = uint256(dungeonLevel - 21);
        if (exponent > 256) return GameConstants.RUN_ENTRY_MAX;
        uint256 growth = FixedPointMathLib.rpow(GameConstants.RUN_ENTRY_GROWTH_WAD, exponent, GameConstants.WAD);
        fee = FixedPointMathLib.mulWad(GameConstants.RUN_ENTRY_BASE, growth);
        if (fee > GameConstants.RUN_ENTRY_MAX) fee = GameConstants.RUN_ENTRY_MAX;
    }

    /// @notice MMO sink cost to forge an equipped item into a target set id.
    /// @param itemTier Tier of the item being forged.
    function forgeSetPieceMmoCost(uint32 itemTier) public pure returns (uint256) {
        return GameConstants.forgeSetPieceMmoCost(itemTier);
    }

    /// @notice Upgrade stone cost to forge an equipped item into a target set id.
    /// @param itemTier Tier of the item being forged.
    function forgeSetPieceStoneCost(uint32 itemTier) public pure returns (uint8) {
        return GameConstants.forgeSetPieceStoneCost(itemTier);
    }

    /// @notice Deterministically rewrites an equipped item's seed toward a target set id in-band.
    /// @dev Keeps token id, slot and tier unchanged; consumes MMO sink + upgrade stones.
    /// @param characterId Character id.
    /// @param itemTokenId Equipped item token id.
    /// @param targetSetId Target set id constrained to current tier band.
    /// @return newSeed Rewritten deterministic seed.
    function forgeSetPiece(uint256 characterId, uint256 itemTokenId, uint8 targetSetId)
        external
        returns (uint64 newSeed)
    {
        Character storage character = _requireCharacterOwner(characterId, msg.sender);
        if (_runs[characterId].active) revert GameErrors.GearLockedDuringRun();
        if (items.ownerOf(itemTokenId) != msg.sender) revert GameErrors.NotItemOwner();

        (GameTypes.Slot slot, uint32 tier, uint64 oldSeed) = items.decode(itemTokenId);
        if (equippedItemBySlot[characterId][uint8(slot)] != itemTokenId) {
            revert GameErrors.ItemNotEquipped();
        }
        if (GameConstants.setDropChancePct(tier) == 0) revert GameErrors.ForgeUnavailableForTier();

        uint8 band = GameConstants.setBandForTier(tier);
        (uint8 minSetId, uint8 maxSetId) = GameConstants.setBandBounds(band);
        if (targetSetId < minSetId || targetSetId > maxSetId) revert GameErrors.InvalidTargetSet();

        uint8 stoneCost = GameConstants.forgeSetPieceStoneCost(tier);
        uint32 currentStones = _upgradeStones[characterId];
        if (currentStones < stoneCost) revert GameErrors.InsufficientUpgradeStones();
        _upgradeStones[characterId] = currentStones - stoneCost;

        uint256 mmoCost = GameConstants.forgeSetPieceMmoCost(tier);
        address(mmoToken).safeTransferFrom(msg.sender, GameConstants.MMO_SINK_ADDRESS, mmoCost);

        (bool oldSet, uint8 oldSetId) = items.itemSetInfo(itemTokenId);
        uint8 oldCountA;
        uint8 oldCountB;
        if (oldSet) oldCountA = _setPieceCount(characterId, character.owner, oldSetId);
        if (!oldSet || oldSetId != targetSetId) {
            oldCountB = _setPieceCount(characterId, character.owner, targetSetId);
        }

        newSeed = _forgeSetSeed(characterId, itemTokenId, targetSetId, oldSeed);
        items.rewriteSeed(itemTokenId, newSeed);

        if (oldSet) {
            uint8 newCountA = _setPieceCount(characterId, character.owner, oldSetId);
            _emitSetThresholdTransitions(characterId, oldSetId, oldCountA, newCountA);
        }
        if (!oldSet || oldSetId != targetSetId) {
            uint8 newCountB = _setPieceCount(characterId, character.owner, targetSetId);
            _emitSetThresholdTransitions(characterId, targetSetId, oldCountB, newCountB);
        }

        emit SetPieceForged(characterId, itemTokenId, targetSetId, stoneCost, mmoCost, newSeed);
    }

    /// @notice Consumes one upgrade stone and rerolls stats for an equipped item.
    /// @param characterId Character id.
    /// @param itemTokenId Equipped item token id.
    function rerollItemStats(uint256 characterId, uint256 itemTokenId) external returns (uint32 newNonce) {
        _requireCharacterOwner(characterId, msg.sender);
        if (_runs[characterId].active) revert GameErrors.GearLockedDuringRun();
        if (items.ownerOf(itemTokenId) != msg.sender) revert GameErrors.NotItemOwner();
        if (_upgradeStones[characterId] == 0) revert GameErrors.InsufficientUpgradeStones();

        (GameTypes.Slot slot,,) = items.decode(itemTokenId);
        if (equippedItemBySlot[characterId][uint8(slot)] != itemTokenId) {
            revert GameErrors.ItemNotEquipped();
        }

        _upgradeStones[characterId] -= 1;
        newNonce = items.consumeReroll(itemTokenId);
        emit ItemRerolled(characterId, itemTokenId, newNonce);
    }

    function _onDungeonSuccess(
        uint256 characterId,
        uint32 dungeonLevel,
        GameTypes.Difficulty difficulty,
        uint256 runSeed,
        GameTypes.VarianceMode varianceMode
    ) internal {
        Character storage character = _characters[characterId];
        if (dungeonLevel <= character.bestLevel) return;

        uint8 requiredClears = GameConstants.requiredClearsForDungeonLevel(dungeonLevel);
        uint8 progressUnits = GameConstants.progressionUnits(difficulty);
        uint8 progress = _levelClearProgress[characterId][dungeonLevel];
        uint8 updatedProgress = progress + progressUnits;
        if (updatedProgress < requiredClears) {
            _levelClearProgress[characterId][dungeonLevel] = updatedProgress;
            emit LevelProgressUpdated(characterId, dungeonLevel, updatedProgress, requiredClears);
            return;
        }
        if (requiredClears > 1) {
            delete _levelClearProgress[characterId][dungeonLevel];
            emit LevelProgressUpdated(characterId, dungeonLevel, requiredClears, requiredClears);
        }

        _setBestLevel(characterId, dungeonLevel);

        uint32 rewardTier = _lootTierForLevel(character.bestLevel, difficulty);
        uint8 rewardCount = GameConstants.lootCount(difficulty);
        _lootboxCredits[characterId][rewardTier] += rewardCount;
        _boundLootboxCredits[characterId][rewardTier][uint8(varianceMode)] += rewardCount;
        emit LootboxCredited(characterId, rewardTier, rewardCount);

        _grantUpgradeStoneOnSuccess(characterId, difficulty, runSeed, dungeonLevel);
    }

    function _setBestLevel(uint256 characterId, uint32 newLevel) internal {
        Character storage character = _characters[characterId];
        uint32 oldLevel = character.bestLevel;
        if (newLevel <= oldLevel) return;

        countAtLevel[oldLevel] -= 1;
        emit HistogramUpdated(oldLevel, countAtLevel[oldLevel], totalCharacters, maxLevel);

        character.bestLevel = newLevel;
        character.lastLevelUpEpoch = _currentEpoch();
        countAtLevel[newLevel] += 1;
        if (newLevel > maxLevel) maxLevel = newLevel;

        emit CharacterLevelUpdated(characterId, oldLevel, newLevel, character.lastLevelUpEpoch);
        emit HistogramUpdated(newLevel, countAtLevel[newLevel], totalCharacters, maxLevel);
    }

    function _consumeLootboxCredits(
        uint256 characterId,
        uint32 tier,
        uint16 amount,
        GameTypes.VarianceMode varianceMode
    ) internal {
        uint32 total = _lootboxCredits[characterId][tier];
        if (total < amount) revert GameErrors.InsufficientLootboxCredits();

        uint8 mode = uint8(varianceMode);
        uint32 modeBound = _boundLootboxCredits[characterId][tier][mode];
        uint32 totalBound = _boundCreditTotal(characterId, tier);
        uint32 generic = total - totalBound;

        uint32 consumeBound = modeBound < amount ? modeBound : amount;
        uint32 consumeGeneric = uint32(amount) - consumeBound;
        if (consumeGeneric > generic) revert GameErrors.InsufficientLootboxCredits();

        if (consumeBound > 0) {
            _boundLootboxCredits[characterId][tier][mode] = modeBound - consumeBound;
        }
        _lootboxCredits[characterId][tier] = total - amount;
    }

    function _quoteOpenLootboxes(
        uint256 characterId,
        uint32 tier,
        uint16 requestedAmount,
        GameTypes.VarianceMode varianceMode
    )
        internal
        view
        returns (uint32 availableTotal, uint32 availableBound, uint32 availableGeneric, uint16 openableAmount)
    {
        availableTotal = _lootboxCredits[characterId][tier];
        availableBound = _boundLootboxCredits[characterId][tier][uint8(varianceMode)];

        uint32 totalBound = _boundCreditTotal(characterId, tier);
        if (totalBound >= availableTotal) availableGeneric = 0;
        else availableGeneric = availableTotal - totalBound;

        uint32 openable = availableBound + availableGeneric;
        if (openable >= requestedAmount) openableAmount = requestedAmount;
        else openableAmount = uint16(openable);
    }

    function _boundCreditTotal(uint256 characterId, uint32 tier) internal view returns (uint32 totalBound) {
        for (uint8 mode = 0; mode < GameConstants.VARIANCE_MODE_COUNT; mode++) {
            totalBound += _boundLootboxCredits[characterId][tier][mode];
        }
    }

    function _grantUpgradeStoneOnSuccess(
        uint256 characterId,
        GameTypes.Difficulty difficulty,
        uint256 runSeed,
        uint32 dungeonLevel
    ) internal {
        if (
            dungeonLevel >= 30
                && (difficulty == GameTypes.Difficulty.HARD
                    || difficulty == GameTypes.Difficulty.EXTREME
                    || difficulty == GameTypes.Difficulty.CHALLENGER)
        ) {
            uint32 guaranteedCurrent = _upgradeStones[characterId];
            if (guaranteedCurrent != type(uint32).max) {
                _upgradeStones[characterId] = guaranteedCurrent + 1;
                emit UpgradeStoneGranted(characterId, 1, GameConstants.UPGRADE_STONE_REASON_DUNGEON);
            }
        }

        uint256 roll =
            uint256(keccak256(abi.encode(runSeed, dungeonLevel, characterId, uint8(difficulty), "stone"))) % 10_000;
        if (roll >= GameConstants.upgradeStoneDropChanceBps(difficulty)) return;

        uint32 current = _upgradeStones[characterId];
        if (current == type(uint32).max) return;
        _upgradeStones[characterId] = current + 1;
        emit UpgradeStoneGranted(characterId, 1, GameConstants.UPGRADE_STONE_REASON_DUNGEON);
    }

    function _refundRepairEscrow(uint256 characterId, RunState storage run) internal {
        uint256 amount = run.repairEscrow;
        if (amount == 0) return;
        run.repairEscrow = 0;
        address(mmoToken).safeTransfer(run.owner, amount);
        emit RepairRefunded(characterId, run.commitId, amount);
    }

    function _sinkRepairEscrow(uint256 characterId, RunState storage run) internal {
        uint256 amount = run.repairEscrow;
        if (amount == 0) return;
        run.repairEscrow = 0;
        address(mmoToken).safeTransfer(GameConstants.MMO_SINK_ADDRESS, amount);
        emit RepairSunk(characterId, run.commitId, amount);
    }

    function _setPieceCount(uint256 characterId, address owner, uint8 setId) internal view returns (uint8 count) {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = equippedItemBySlot[characterId][slot];
            if (itemId == 0) continue;
            if (items.ownerOf(itemId) != owner) continue;
            (bool isSet, uint8 equippedSetId) = items.itemSetInfo(itemId);
            if (isSet && equippedSetId == setId) count += 1;
        }
    }

    function _setPieceCountWithOwnedOverride(
        uint256 characterId,
        address owner,
        uint8 setId,
        uint256 ownedOverrideItemId
    ) internal view returns (uint8 count) {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = equippedItemBySlot[characterId][slot];
            if (itemId == 0) continue;
            if (itemId != ownedOverrideItemId && items.ownerOf(itemId) != owner) continue;
            (bool isSet, uint8 equippedSetId) = items.itemSetInfo(itemId);
            if (isSet && equippedSetId == setId) count += 1;
        }
    }

    function _equippedSetPieceCount(uint256 characterId, address owner) internal view returns (uint8 count) {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = equippedItemBySlot[characterId][slot];
            if (itemId == 0) continue;
            if (items.ownerOf(itemId) != owner) continue;
            (bool isSet,) = items.itemSetInfo(itemId);
            if (isSet) count += 1;
        }
    }

    function _equippedSetAndAffixContext(uint256 characterId, address owner)
        internal
        view
        returns (uint8 setPieces, uint8 highestSetMatchCount, uint8 highAffixPieces)
    {
        uint8[48] memory setCounts;
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = equippedItemBySlot[characterId][slot];
            if (itemId == 0) continue;
            if (items.ownerOf(itemId) != owner) continue;

            if (items.affixBps(itemId) >= GameConstants.HIGH_AFFIX_THRESHOLD_BPS) {
                highAffixPieces += 1;
            }

            (bool isSet, uint8 setId) = items.itemSetInfo(itemId);
            if (!isSet) continue;

            setPieces += 1;
            uint8 newCount = ++setCounts[setId];
            if (newCount > highestSetMatchCount) highestSetMatchCount = newCount;
        }
    }

    function _projectedContextWithItem(uint256 characterId, address owner, uint8 replaceSlot, uint256 replacementItemId)
        internal
        view
        returns (uint8 setPieces, uint8 highestSetMatchCount, uint8 highAffixPieces)
    {
        uint8[48] memory setCounts;
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = slot == replaceSlot ? replacementItemId : equippedItemBySlot[characterId][slot];
            if (itemId == 0) continue;
            if (slot != replaceSlot && items.ownerOf(itemId) != owner) continue;

            if (items.affixBps(itemId) >= GameConstants.HIGH_AFFIX_THRESHOLD_BPS) {
                highAffixPieces += 1;
            }

            (bool isSet, uint8 setId) = items.itemSetInfo(itemId);
            if (!isSet) continue;
            setPieces += 1;
            uint8 newCount = ++setCounts[setId];
            if (newCount > highestSetMatchCount) highestSetMatchCount = newCount;
        }
    }

    function _estimatePressurePenaltyFromContext(
        uint8 equippedSetPieces,
        uint8 highestSetMatchCount,
        uint8 highAffixPieces,
        uint32 dungeonLevel
    )
        internal
        pure
        returns (
            uint256 pressurePenaltyBps,
            uint8 missingSetPieces,
            uint8 missingMatchingSetPieces,
            uint8 missingHighAffixPieces,
            uint8 recommendedSetPiecesRequired,
            uint8 recommendedMatchingSetPiecesRequired,
            uint8 recommendedHighAffixPiecesRequired
        )
    {
        recommendedSetPiecesRequired = GameConstants.recommendedSetPiecesForDungeonLevel(dungeonLevel);
        if (recommendedSetPiecesRequired > equippedSetPieces) {
            missingSetPieces = recommendedSetPiecesRequired - equippedSetPieces;
            pressurePenaltyBps += uint256(missingSetPieces) * GameConstants.MISSING_SET_PENALTY_BPS;
        }

        recommendedMatchingSetPiecesRequired = GameConstants.recommendedMatchingSetPiecesForDungeonLevel(dungeonLevel);
        if (recommendedMatchingSetPiecesRequired > highestSetMatchCount) {
            missingMatchingSetPieces = recommendedMatchingSetPiecesRequired - highestSetMatchCount;
            pressurePenaltyBps += uint256(missingMatchingSetPieces) * GameConstants.MISSING_MATCHED_SET_PENALTY_BPS;
        }

        recommendedHighAffixPiecesRequired = GameConstants.recommendedHighAffixPiecesForDungeonLevel(dungeonLevel);
        if (recommendedHighAffixPiecesRequired > highAffixPieces) {
            missingHighAffixPieces = recommendedHighAffixPiecesRequired - highAffixPieces;
            pressurePenaltyBps += uint256(missingHighAffixPieces) * GameConstants.MISSING_AFFIX_PENALTY_BPS;
        }
    }

    function _effectivePowerBpsAfterPenalty(uint256 pressurePenaltyBps) internal pure returns (uint256 effectiveBps) {
        if (pressurePenaltyBps >= GameConstants.BPS) return GameConstants.MIN_EFFECTIVE_POWER_BPS;
        effectiveBps = GameConstants.BPS - pressurePenaltyBps;
        if (effectiveBps < GameConstants.MIN_EFFECTIVE_POWER_BPS) return GameConstants.MIN_EFFECTIVE_POWER_BPS;
    }

    function _nextLevelCap(uint32 bestLevel) internal pure returns (uint32) {
        if (bestLevel == type(uint32).max) return type(uint32).max;
        return bestLevel + 1;
    }

    function _lootTierForLevel(uint32 bestLevel, GameTypes.Difficulty difficulty) internal pure returns (uint32 tier) {
        uint256 next = uint256(_nextLevelCap(bestLevel));
        uint256 withBonus = next + GameConstants.lootTierBonus(difficulty);
        if (withBonus > type(uint32).max) return type(uint32).max;
        tier = uint32(withBonus);
    }

    function _failureProgressDecay(uint32 dungeonLevel) internal pure returns (uint8) {
        if (dungeonLevel <= 30) return 1;
        if (dungeonLevel <= 60) return 2;
        return 3;
    }

    function _reduceProgressOnFailure(uint8 progress, uint8 decay) internal pure returns (uint8) {
        if (progress <= decay) return 0;
        return progress - decay;
    }

    function _forgeSetSeed(uint256 characterId, uint256 itemTokenId, uint8 targetSetId, uint64 previousSeed)
        internal
        pure
        returns (uint64 forgedSeed)
    {
        uint64 entropy = uint64(uint256(keccak256(abi.encode(characterId, itemTokenId, targetSetId, previousSeed))));
        forgedSeed =
            (uint64(GameConstants.FORGED_SET_MAGIC) << 32) | (uint64(targetSetId) << 24) | (entropy & 0x00ff_ffff);
    }

    function _emitSetThresholdTransitions(uint256 characterId, uint8 setId, uint8 oldCount, uint8 newCount) internal {
        if (oldCount == newCount) return;
        if (oldCount < 2 && newCount >= 2) emit SetBonusActivated(characterId, setId, 2);
        if (oldCount < 4 && newCount >= 4) emit SetBonusActivated(characterId, setId, 4);
        if (oldCount < 6 && newCount >= 6) emit SetBonusActivated(characterId, setId, 6);
        if (oldCount < 8 && newCount >= 8) emit SetBonusActivated(characterId, setId, 8);

        if (oldCount >= 8 && newCount < 8) emit SetBonusDeactivated(characterId, setId);
        if (oldCount >= 6 && newCount < 6) emit SetBonusDeactivated(characterId, setId);
        if (oldCount >= 4 && newCount < 4) emit SetBonusDeactivated(characterId, setId);
        if (oldCount >= 2 && newCount < 2) emit SetBonusDeactivated(characterId, setId);
    }

    function _equippedSlotCount(uint256 characterId, address owner) internal view returns (uint8 count) {
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = equippedItemBySlot[characterId][slot];
            if (itemId == 0) continue;
            if (items.ownerOf(itemId) != owner) continue;
            count++;
        }
    }

    function _validateRevealBase(uint256 commitId, GameTypes.ActionType expectedAction)
        internal
        view
        returns (CommitData storage data)
    {
        data = commits[commitId];
        if (data.actor == address(0)) revert GameErrors.InvalidCommit();
        if (data.resolved) revert GameErrors.CommitResolved();
        if (data.actionType != expectedAction) revert GameErrors.InvalidActionForReveal();
        if (block.number < data.commitBlock + 2) revert GameErrors.RevealTooEarly();
        if (block.number > data.commitBlock + 256) revert GameErrors.RevealExpired();
    }

    function _mobPower(uint32 dungeonLevel, GameTypes.Difficulty difficulty, uint8 roomIndex, uint256 seed, bool boss)
        internal
        pure
        returns (uint256 power)
    {
        uint256 levelGrowth;
        if (dungeonLevel <= 10) {
            levelGrowth =
                FixedPointMathLib.rpow(GameConstants.DUNGEON_LEVEL_GROWTH_WAD, dungeonLevel - 1, GameConstants.WAD);
        } else {
            uint256 earlyGrowth = FixedPointMathLib.rpow(GameConstants.DUNGEON_LEVEL_GROWTH_WAD, 9, GameConstants.WAD);
            if (dungeonLevel <= 25) {
                uint256 midExponent = uint256(dungeonLevel - 10);
                if (midExponent > 5000) midExponent = 5000;
                uint256 midGrowth =
                    FixedPointMathLib.rpow(GameConstants.DUNGEON_POST_10_GROWTH_WAD, midExponent, GameConstants.WAD);
                levelGrowth = FixedPointMathLib.mulWad(earlyGrowth, midGrowth);
            } else {
                uint256 midGrowth =
                    FixedPointMathLib.rpow(GameConstants.DUNGEON_POST_10_GROWTH_WAD, 15, GameConstants.WAD);
                uint256 lateExponent = uint256(dungeonLevel - 25);
                if (lateExponent > 5000) lateExponent = 5000;
                uint256 lateGrowth =
                    FixedPointMathLib.rpow(GameConstants.DUNGEON_POST_25_GROWTH_WAD, lateExponent, GameConstants.WAD);
                levelGrowth = FixedPointMathLib.mulWad(FixedPointMathLib.mulWad(earlyGrowth, midGrowth), lateGrowth);
            }
        }
        uint256 basePower = FixedPointMathLib.mulWad(GameConstants.DUNGEON_BASE_POWER_WAD, levelGrowth) / 1e18;
        uint256 difficultyPower = (basePower * GameConstants.difficultyMultiplierBps(difficulty)) / GameConstants.BPS;

        uint256 roll = uint256(keccak256(abi.encode(seed, roomIndex, uint8(difficulty), dungeonLevel))) % 3001;
        uint256 templateBps = GameConstants.TEMPLATE_MIN_BPS + roll;
        power = (difficultyPower * templateBps) / GameConstants.BPS;

        if (boss) {
            power = (power * GameConstants.BOSS_POWER_BPS) / GameConstants.BPS;
        }
    }

    function _characterTotalStats(uint256 characterId, address owner, GameTypes.Class classType)
        internal
        view
        returns (GameTypes.Stats memory total)
    {
        Character storage character = _characters[characterId];
        uint8[48] memory setCounts;
        uint8[8] memory activeSetIds;
        uint8 activeSetCount;
        total = character.baseStats;
        if (character.bestLevel > 1) {
            uint32 delta = character.bestLevel - 1;
            total.hp += delta * 24;
            total.mana += delta * 10;
            total.def += delta * 5;
            total.atkM += delta * 8;
            total.atkR += delta * 8;
        }
        for (uint8 slot = 0; slot < 8; slot++) {
            uint256 itemId = equippedItemBySlot[characterId][slot];
            if (itemId == 0) continue;
            if (items.ownerOf(itemId) != owner) continue;
            (uint32 hp, uint32 mana, uint32 def, uint32 atkM, uint32 atkR) = items.deriveBonuses(itemId);
            total.hp += hp;
            total.mana += mana;
            total.def += def;
            total.atkM += atkM;
            total.atkR += atkR;
            (bool isSet, uint8 setId) = items.itemSetInfo(itemId);
            if (isSet) {
                if (setCounts[setId] == 0) activeSetIds[activeSetCount++] = setId;
                setCounts[setId] += 1;
            }
        }
        total = _applySetBonuses(total, setCounts, activeSetIds, activeSetCount, classType);
    }

    function _applySetBonuses(
        GameTypes.Stats memory total,
        uint8[48] memory setCounts,
        uint8[8] memory activeSetIds,
        uint8 activeSetCount,
        GameTypes.Class classType
    ) internal pure returns (GameTypes.Stats memory) {
        uint32 hpBps;
        uint32 manaBps;
        uint32 defBps;
        uint32 atkMBps;
        uint32 atkRBps;

        for (uint8 i = 0; i < activeSetCount; i++) {
            uint8 setId = activeSetIds[i];
            uint8 count = setCounts[setId];
            if (count < 2) continue;

            if (classType == GameTypes.Class.WARRIOR) atkRBps += GameConstants.SET_2PC_PRIMARY_BPS;
            else if (classType == GameTypes.Class.PALADIN) defBps += GameConstants.SET_2PC_PRIMARY_BPS;
            else atkMBps += GameConstants.SET_2PC_PRIMARY_BPS;

            if (count >= 4) {
                if (classType == GameTypes.Class.WARRIOR) {
                    atkRBps += GameConstants.SET_4PC_PRIMARY_BPS;
                    hpBps += GameConstants.SET_4PC_SECONDARY_BPS;
                } else if (classType == GameTypes.Class.PALADIN) {
                    defBps += GameConstants.SET_4PC_PRIMARY_BPS;
                    hpBps += GameConstants.SET_4PC_SECONDARY_BPS;
                } else {
                    atkMBps += GameConstants.SET_4PC_PRIMARY_BPS;
                    manaBps += GameConstants.SET_4PC_SECONDARY_BPS;
                }
            }

            if (count >= 6) {
                if (classType == GameTypes.Class.WARRIOR) {
                    defBps += GameConstants.SET_6PC_OFFSTAT_BPS;
                    manaBps += GameConstants.SET_6PC_OFFSTAT_BPS;
                } else if (classType == GameTypes.Class.PALADIN) {
                    atkRBps += GameConstants.SET_6PC_OFFSTAT_BPS;
                    manaBps += GameConstants.SET_6PC_OFFSTAT_BPS;
                } else {
                    defBps += GameConstants.SET_6PC_OFFSTAT_BPS;
                    hpBps += GameConstants.SET_6PC_OFFSTAT_BPS;
                }
            }

            if (count >= 8) {
                hpBps += GameConstants.SET_8PC_ALL_BPS;
                manaBps += GameConstants.SET_8PC_ALL_BPS;
                defBps += GameConstants.SET_8PC_ALL_BPS;
                atkMBps += GameConstants.SET_8PC_ALL_BPS;
                atkRBps += GameConstants.SET_8PC_ALL_BPS;
            }
        }

        if (hpBps > 0) total.hp += _scaleByBps(total.hp, hpBps);
        if (manaBps > 0) total.mana += _scaleByBps(total.mana, manaBps);
        if (defBps > 0) total.def += _scaleByBps(total.def, defBps);
        if (atkMBps > 0) total.atkM += _scaleByBps(total.atkM, atkMBps);
        if (atkRBps > 0) total.atkR += _scaleByBps(total.atkR, atkRBps);

        return total;
    }

    function _scaleByBps(uint32 value, uint32 bps) internal pure returns (uint32) {
        return uint32((uint256(value) * bps) / GameConstants.BPS);
    }

    function _applyStrategy(
        uint256 characterId,
        RunState storage run,
        GameTypes.Class classType,
        GameTypes.PotionChoice potionChoice,
        GameTypes.AbilityChoice abilityChoice
    ) internal returns (StrategyEffects memory effects) {
        if (potionChoice == GameTypes.PotionChoice.HP_REGEN) {
            if (run.hpPotionCharges == 0) {
                revert GameErrors.PotionUnavailable();
            }
            run.hpPotionCharges--;
            GameTypes.PotionTier potionTier = _selectPotionTier(characterId, GameTypes.PotionType.HP_REGEN);
            uint256 restored =
                (uint256(run.maxHp) * _hpPotionRestoreBps(potionTier)) / GameConstants.BPS + uint256(run.hpRegen) * 6;
            uint256 nextHp = uint256(run.currentHp) + restored;
            run.currentHp = uint32(nextHp > run.maxHp ? run.maxHp : nextHp);
            emit PotionConsumed(characterId, run.roomsCleared, GameTypes.PotionType.HP_REGEN, potionTier);
        } else if (potionChoice == GameTypes.PotionChoice.MANA_REGEN) {
            if (run.manaPotionCharges == 0) revert GameErrors.PotionUnavailable();
            run.manaPotionCharges--;
            GameTypes.PotionTier potionTier = _selectPotionTier(characterId, GameTypes.PotionType.MANA_REGEN);
            uint256 restoredMana = (uint256(run.maxMana) * _manaPotionRestoreBps(potionTier)) / GameConstants.BPS
                + uint256(run.manaRegen) * 6;
            uint256 nextMana = uint256(run.currentMana) + restoredMana;
            run.currentMana = uint32(nextMana > run.maxMana ? run.maxMana : nextMana);
            emit PotionConsumed(characterId, run.roomsCleared, GameTypes.PotionType.MANA_REGEN, potionTier);
        } else if (potionChoice == GameTypes.PotionChoice.POWER) {
            if (run.powerPotionCharges == 0) revert GameErrors.PotionUnavailable();
            run.powerPotionCharges--;
            GameTypes.PotionTier potionTier = _selectPotionTier(characterId, GameTypes.PotionType.POWER);
            effects.attackPotionBonusBps = _powerPotionBonusBps(potionTier);
            emit PotionConsumed(characterId, run.roomsCleared, GameTypes.PotionType.POWER, potionTier);
        }

        if (abilityChoice == GameTypes.AbilityChoice.NONE) return effects;

        uint32 manaCost;
        if (abilityChoice == GameTypes.AbilityChoice.ARCANE_FOCUS) {
            if (classType != GameTypes.Class.MAGE) return effects;
            manaCost = uint32((uint256(run.maxMana) * GameConstants.MAGE_ABILITY_MANA_COST_BPS) / GameConstants.BPS);
            effects.attackAbilityBonusBps = GameConstants.MAGE_ABILITY_BONUS_BPS;
        } else if (abilityChoice == GameTypes.AbilityChoice.BERSERK) {
            if (classType != GameTypes.Class.WARRIOR) return effects;
            manaCost = uint32((uint256(run.maxMana) * GameConstants.WARRIOR_ABILITY_MANA_COST_BPS) / GameConstants.BPS);
            effects.attackAbilityBonusBps = GameConstants.WARRIOR_ABILITY_BONUS_BPS;
            effects.damageTakenBonusBps += GameConstants.WARRIOR_EXTRA_DAMAGE_BPS;
        } else if (abilityChoice == GameTypes.AbilityChoice.DIVINE_SHIELD) {
            if (classType != GameTypes.Class.PALADIN) return effects;
            manaCost = uint32((uint256(run.maxMana) * GameConstants.PALADIN_ABILITY_MANA_COST_BPS) / GameConstants.BPS);
            effects.defenseBonusBps += GameConstants.PALADIN_ABILITY_BONUS_BPS;
        }

        if (run.currentMana < manaCost) return effects;
        run.currentMana -= manaCost;
    }

    function _creditPotion(
        uint256 characterId,
        GameTypes.PotionType potionType,
        GameTypes.PotionTier potionTier,
        uint32 amount
    ) internal {
        _potionInventory[characterId][uint8(potionType)][uint8(potionTier)] += amount;
    }

    function _shouldDropPotion(bytes32 itemEntropy, uint32 tier) internal pure returns (bool) {
        uint256 roll = uint256(keccak256(abi.encode(itemEntropy, "potion-drop"))) % 10_000;
        uint256 bonus = uint256(tier) * 15;
        if (bonus > 1_800) bonus = 1_800;
        uint256 threshold = 2_200 + bonus;
        return roll < threshold;
    }

    function _rollPotionDrop(bytes32 itemEntropy, uint32 tier)
        internal
        pure
        returns (GameTypes.PotionType potionType, GameTypes.PotionTier potionTier)
    {
        uint256 typeRoll = uint256(keccak256(abi.encode(itemEntropy, "potion-type"))) % 3;
        if (typeRoll == 0) potionType = GameTypes.PotionType.HP_REGEN;
        else if (typeRoll == 1) potionType = GameTypes.PotionType.MANA_REGEN;
        else potionType = GameTypes.PotionType.POWER;

        uint256 rarityRoll = uint256(keccak256(abi.encode(itemEntropy, "potion-tier"))) % 10_000;
        uint256 bonus = uint256(tier) * 25;
        if (bonus > 3_000) bonus = 3_000;
        uint256 adjusted = rarityRoll + bonus;
        if (adjusted > 9_999) adjusted = 9_999;

        if (adjusted >= 9_950) potionTier = GameTypes.PotionTier.EXTREME;
        else if (adjusted >= 8_500) potionTier = GameTypes.PotionTier.STRONG;
        else potionTier = GameTypes.PotionTier.NORMAL;
    }

    function _selectPotionTier(uint256 characterId, GameTypes.PotionType potionType)
        internal
        returns (GameTypes.PotionTier tier)
    {
        mapping(uint8 => uint32) storage inventory = _potionInventory[characterId][uint8(potionType)];
        uint8 extreme = uint8(GameTypes.PotionTier.EXTREME);
        if (inventory[extreme] > 0) {
            inventory[extreme] -= 1;
            return GameTypes.PotionTier.EXTREME;
        }
        uint8 strong = uint8(GameTypes.PotionTier.STRONG);
        if (inventory[strong] > 0) {
            inventory[strong] -= 1;
            return GameTypes.PotionTier.STRONG;
        }
        uint8 normal = uint8(GameTypes.PotionTier.NORMAL);
        if (inventory[normal] > 0) {
            inventory[normal] -= 1;
            return GameTypes.PotionTier.NORMAL;
        }
        return GameTypes.PotionTier.NORMAL;
    }

    function _hpPotionRestoreBps(GameTypes.PotionTier tier) internal pure returns (uint16) {
        if (tier == GameTypes.PotionTier.EXTREME) return GameConstants.HP_POTION_RESTORE_EXTREME_BPS;
        if (tier == GameTypes.PotionTier.STRONG) return GameConstants.HP_POTION_RESTORE_STRONG_BPS;
        return GameConstants.HP_POTION_RESTORE_BPS;
    }

    function _manaPotionRestoreBps(GameTypes.PotionTier tier) internal pure returns (uint16) {
        if (tier == GameTypes.PotionTier.EXTREME) return GameConstants.MANA_POTION_RESTORE_EXTREME_BPS;
        if (tier == GameTypes.PotionTier.STRONG) return GameConstants.MANA_POTION_RESTORE_STRONG_BPS;
        return GameConstants.MANA_POTION_RESTORE_BPS;
    }

    function _powerPotionBonusBps(GameTypes.PotionTier tier) internal pure returns (uint16) {
        if (tier == GameTypes.PotionTier.EXTREME) return GameConstants.POWER_POTION_EXTREME_BONUS_BPS;
        if (tier == GameTypes.PotionTier.STRONG) return GameConstants.POWER_POTION_STRONG_BONUS_BPS;
        return GameConstants.POWER_POTION_BONUS_BPS;
    }

    function _endRunAsFailure(uint256 characterId, RunState storage run, bool boss) internal {
        uint32 dungeonLevel = run.dungeonLevel;
        run.active = false;
        _sinkRepairEscrow(characterId, run);
        Character storage character = _characters[characterId];
        if (dungeonLevel > character.bestLevel) {
            uint8 progress = _levelClearProgress[characterId][dungeonLevel];
            if (progress > 0 && dungeonLevel >= 21) {
                uint8 updated = _reduceProgressOnFailure(progress, _failureProgressDecay(dungeonLevel));
                if (updated == 0) {
                    delete _levelClearProgress[characterId][dungeonLevel];
                    emit LevelProgressReset(characterId, dungeonLevel);
                } else {
                    _levelClearProgress[characterId][dungeonLevel] = updated;
                    emit LevelProgressUpdated(
                        characterId, dungeonLevel, updated, GameConstants.requiredClearsForDungeonLevel(dungeonLevel)
                    );
                }
            }
        }
        emit DungeonRoomResolved(characterId, run.roomsCleared, boss, false, run.currentHp, run.currentMana);
        emit DungeonFinished(characterId, dungeonLevel, false, run.roomsCleared, run.roomCount);
    }

    function _currentEpoch() internal view returns (uint32) {
        return uint32(block.timestamp / GameConstants.EPOCH_IN_SECONDS);
    }

    function _requireCharacterOwner(uint256 characterId, address account)
        internal
        view
        returns (Character storage character)
    {
        character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        if (character.owner != account) revert GameErrors.OnlyCharacterOwner();
    }
}
