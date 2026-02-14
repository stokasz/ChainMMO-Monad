// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GameWorld} from "../../src/GameWorld.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract TestGameWorld is GameWorld {
    constructor(address mmoToken_, address feeVault_, address deployer_) GameWorld(mmoToken_, feeVault_, deployer_) {}

    function forceSetBestLevel(uint256 characterId, uint32 newLevel, uint32 epoch) external {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        _setBestLevel(characterId, newLevel);
        character.lastLevelUpEpoch = epoch;
    }

    function forceCreditPotion(
        uint256 characterId,
        GameTypes.PotionType potionType,
        GameTypes.PotionTier potionTier,
        uint32 amount
    ) external {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        _creditPotion(characterId, potionType, potionTier, amount);
    }

    function forceMintItem(address to, GameTypes.Slot slot, uint32 tier, uint64 seed)
        external
        returns (uint256 tokenId)
    {
        tokenId = items.mint(to, slot, tier, seed);
    }

    function forceMintItemWithVariance(
        address to,
        GameTypes.Slot slot,
        uint32 tier,
        uint64 seed,
        GameTypes.VarianceMode varianceMode
    ) external returns (uint256 tokenId) {
        tokenId = items.mint(to, slot, tier, seed, varianceMode);
    }

    function forceGrantUpgradeStones(uint256 characterId, uint32 amount) external {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        _upgradeStones[characterId] += amount;
    }

    function forceSetLevelClearProgress(uint256 characterId, uint32 dungeonLevel, uint8 clears) external {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        _levelClearProgress[characterId][dungeonLevel] = clears;
    }

    function exposedCharacterTotalStats(uint256 characterId) external view returns (GameTypes.Stats memory stats) {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        stats = _characterTotalStats(characterId, character.owner, character.classType);
    }

    function exposedEffectivePowerBpsAfterPenalty(uint256 pressurePenaltyBps)
        external
        pure
        returns (uint256 effectiveBps)
    {
        return _effectivePowerBpsAfterPenalty(pressurePenaltyBps);
    }

    function exposedEstimatePressurePenaltyFromContext(
        uint8 equippedSetPieces,
        uint8 highestSetMatchCount,
        uint8 highAffixPieces,
        uint32 dungeonLevel
    )
        external
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
        return _estimatePressurePenaltyFromContext(
            equippedSetPieces, highestSetMatchCount, highAffixPieces, dungeonLevel
        );
    }

    function exposedGrantUpgradeStoneOnSuccess(
        uint256 characterId,
        GameTypes.Difficulty difficulty,
        uint256 runSeed,
        uint32 dungeonLevel
    ) external {
        Character storage character = _characters[characterId];
        if (character.owner == address(0)) revert GameErrors.CharacterNotFound();
        _grantUpgradeStoneOnSuccess(characterId, difficulty, runSeed, dungeonLevel);
    }
}
