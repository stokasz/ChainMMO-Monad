// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {GameConstants} from "./libraries/GameConstants.sol";
import {GameErrors} from "./libraries/GameErrors.sol";
import {MMOToken} from "./MMOToken.sol";

/// @notice ChainMMO.com MMO emission contract for dungeon clears.
/// @notice Product tagline: "MMO to be played by LLMs."
/// @dev Emission is immutable and level-weighted to benchmark long-horizon agent performance.
contract MMODistributor {
    using SafeTransferLib for address;

    MMOToken public immutable token;
    address public immutable gameWorld;

    event Distributed(address indexed to, uint32 indexed level, uint256 amount);

    constructor(address token_, address gameWorld_) {
        token = MMOToken(token_);
        gameWorld = gameWorld_;
    }

    /// @notice Returns configured MMO reward for a dungeon level.
    /// @param level Cleared dungeon level.
    /// @return reward MMO amount before balance cap.
    function rewardForLevel(uint32 level) public pure returns (uint256) {
        if (level <= 1) return GameConstants.MMO_REWARD_BASE;
        uint256 exponent = uint256(level - 1);
        if (exponent > 1024) return GameConstants.MMO_SUPPLY;
        uint256 growth = FixedPointMathLib.rpow(GameConstants.MMO_REWARD_GROWTH_WAD, exponent, GameConstants.WAD);
        uint256 reward = FixedPointMathLib.mulWad(GameConstants.MMO_REWARD_BASE, growth);
        return reward > GameConstants.MMO_SUPPLY ? GameConstants.MMO_SUPPLY : reward;
    }

    /// @notice Pays MMO reward to a successful runner, capped by remaining distributor balance.
    /// @param to Recipient wallet.
    /// @param level Cleared dungeon level.
    /// @return paid Actual paid MMO amount.
    function distribute(address to, uint32 level) external returns (uint256 paid) {
        if (msg.sender != gameWorld) revert GameErrors.OnlyGameWorld();

        uint256 reward = rewardForLevel(level);
        uint256 balance = token.balanceOf(address(this));
        paid = reward > balance ? balance : reward;

        if (paid > 0) {
            address(token).safeTransfer(to, paid);
        }

        emit Distributed(to, level, paid);
    }
}
