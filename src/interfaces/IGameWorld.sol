// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {GameTypes} from "../libraries/GameTypes.sol";

/// @notice ChainMMO.com GameWorld read/write hooks used by FeeVault.
interface IGameWorld {
    function ownerOfCharacter(uint256 characterId) external view returns (address);
    function characterBestLevel(uint256 characterId) external view returns (uint32);
    function characterLastLevelUpEpoch(uint256 characterId) external view returns (uint32);
    function totalCharacters() external view returns (uint32);
    function maxLevel() external view returns (uint32);
    function countAtLevel(uint32 level) external view returns (uint32);

    function creditPremiumLootboxesFromVault(
        uint256 characterId,
        GameTypes.Difficulty difficulty,
        uint16 amount,
        address buyer
    ) external;
}
