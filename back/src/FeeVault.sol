// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FixedPointMathLib} from "solady/utils/FixedPointMathLib.sol";
import {ReentrancyGuard} from "solady/utils/ReentrancyGuard.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {GameConstants} from "./libraries/GameConstants.sol";
import {GameErrors} from "./libraries/GameErrors.sol";
import {GameTypes} from "./libraries/GameTypes.sol";
import {IGameWorld} from "./interfaces/IGameWorld.sol";
import {MMOToken} from "./MMOToken.sol";
import {TokenValidation} from "./libraries/TokenValidation.sol";

/// @notice ChainMMO.com fee accounting and premium lootbox payment vault.
/// @notice Product tagline: "MMO to be played by LLMs."
/// @dev The vault finalizes hourly snapshots fully on-chain to benchmark agents under economic competition rules.
contract FeeVault is ReentrancyGuard {
    using SafeTransferLib for address;

    struct EpochData {
        bool finalized;
        uint32 cutoffLevel;
        uint256 totalEligibleWeight;
        uint256 feesForPlayers;
        uint256 feesForDeployer;
    }

    IGameWorld public immutable gameWorld;
    MMOToken public immutable mmoToken;
    address public immutable deployer;

    mapping(uint32 dayId => uint32 soldCount) public soldToday;
    mapping(uint32 epochId => uint256 feesEth) public epochEthFees;
    mapping(uint32 epochId => EpochData data) public epochDataById;
    mapping(uint32 epochId => bool claimed) public deployerClaimed;
    mapping(uint32 epochId => mapping(uint256 characterId => bool claimed)) public playerClaimed;

    event PremiumLootboxesPurchased(
        uint256 indexed characterId,
        address indexed buyer,
        uint16 amount,
        GameTypes.Difficulty difficulty,
        uint256 ethCost,
        uint256 mmoCost,
        uint32 dayId,
        uint32 epochId
    );
    event EpochFinalized(
        uint32 indexed epochId,
        uint32 cutoffLevel,
        uint256 feesForPlayers,
        uint256 feesForDeployer,
        uint256 totalEligibleWeight
    );
    event PlayerClaimed(uint32 indexed epochId, uint256 indexed characterId, address indexed owner, uint256 amount);
    event DeployerClaimed(uint32 indexed epochId, address indexed deployer, uint256 amount);

    constructor(address gameWorld_, address mmoToken_, address deployer_) {
        TokenValidation.requireSupportedMmoToken(mmoToken_);
        gameWorld = IGameWorld(gameWorld_);
        mmoToken = MMOToken(mmoToken_);
        deployer = deployer_;
    }

    /// @notice Quotes premium lootbox ETH + MMO cost for current day curve.
    /// @param characterId Buyer character id.
    /// @param difficulty Difficulty used for resulting lootbox tier.
    /// @param amount Number of lootboxes.
    /// @return ethCost ETH required.
    /// @return mmoCost MMO required.
    function quotePremiumPurchase(uint256 characterId, GameTypes.Difficulty difficulty, uint16 amount)
        public
        view
        returns (uint256 ethCost, uint256 mmoCost)
    {
        if (amount == 0) revert GameErrors.AmountZero();
        if (amount > GameConstants.MAX_BUY_PER_TX) revert GameErrors.MaxBuyPerTxExceeded();

        uint32 dayId = _currentDay();
        uint32 soldCount = soldToday[dayId];
        ethCost = _quoteEthCostFrom(soldCount, amount);
        mmoCost = _quoteMmoCost(characterId, difficulty, amount);
    }

    function buyPremiumLootboxes(uint256 characterId, GameTypes.Difficulty difficulty, uint16 amount)
        external
        payable
        nonReentrant
    {
        (uint256 ethCost, uint256 mmoCost) = quotePremiumPurchase(characterId, difficulty, amount);
        if (msg.value < ethCost) revert GameErrors.InsufficientEth();

        uint32 dayId = _currentDay();
        soldToday[dayId] += amount;

        uint32 epochId = _currentEpoch();
        epochEthFees[epochId] += ethCost;

        if (mmoCost > 0) {
            address(mmoToken).safeTransferFrom(msg.sender, GameConstants.MMO_SINK_ADDRESS, mmoCost);
        }

        gameWorld.creditPremiumLootboxesFromVault(characterId, difficulty, amount, msg.sender);

        if (msg.value > ethCost) {
            _safeTransferEth(msg.sender, msg.value - ethCost);
        }

        emit PremiumLootboxesPurchased(characterId, msg.sender, amount, difficulty, ethCost, mmoCost, dayId, epochId);
    }

    function finalizeEpoch(uint32 epochId) external {
        if (_currentEpoch() <= epochId) revert GameErrors.InvalidEpoch();
        EpochData storage data = epochDataById[epochId];
        if (data.finalized) revert GameErrors.EpochAlreadyFinalized();

        uint256 fees = epochEthFees[epochId];
        uint256 feesForPlayers = (fees * GameConstants.FEE_PLAYERS_BPS) / GameConstants.BPS;
        uint256 feesForDeployer = fees - feesForPlayers;

        uint32 totalChars = gameWorld.totalCharacters();
        uint32 eligibleCount = totalChars == 0
            ? 0
            : uint32((uint256(totalChars) + GameConstants.TOP_DECILE_DIVISOR - 1) / GameConstants.TOP_DECILE_DIVISOR);
        uint32 cutoff = _computeCutoffLevel(eligibleCount);
        uint256 totalWeight = _computeTotalWeight(cutoff);

        data.finalized = true;
        data.cutoffLevel = cutoff;
        data.totalEligibleWeight = totalWeight;
        data.feesForPlayers = feesForPlayers;
        data.feesForDeployer = feesForDeployer;

        emit EpochFinalized(epochId, cutoff, feesForPlayers, feesForDeployer, totalWeight);
    }

    function claimPlayer(uint32 epochId, uint256 characterId) external nonReentrant returns (uint256 amount) {
        EpochData storage data = epochDataById[epochId];
        if (!data.finalized) revert GameErrors.EpochNotFinalized();
        if (gameWorld.ownerOfCharacter(characterId) != msg.sender) revert GameErrors.OnlyCharacterOwner();
        if (playerClaimed[epochId][characterId]) revert GameErrors.AlreadyClaimed();

        uint32 level = gameWorld.characterBestLevel(characterId);
        uint32 levelEpoch = gameWorld.characterLastLevelUpEpoch(characterId);
        if (levelEpoch > epochId) revert GameErrors.NotEligible();
        if (level < data.cutoffLevel) revert GameErrors.NotEligible();
        if (data.totalEligibleWeight == 0) revert GameErrors.NotEligible();

        playerClaimed[epochId][characterId] = true;

        uint256 weight = _weightForDelta(level - data.cutoffLevel);
        amount = (data.feesForPlayers * weight) / data.totalEligibleWeight;
        if (amount > 0) _safeTransferEth(msg.sender, amount);

        emit PlayerClaimed(epochId, characterId, msg.sender, amount);
    }

    function claimDeployer(uint32 epochId) external nonReentrant returns (uint256 amount) {
        if (msg.sender != deployer) revert GameErrors.OnlyDeployer();
        EpochData storage data = epochDataById[epochId];
        if (!data.finalized) revert GameErrors.EpochNotFinalized();
        if (deployerClaimed[epochId]) revert GameErrors.AlreadyClaimed();

        deployerClaimed[epochId] = true;
        amount = data.feesForDeployer;
        if (amount > 0) _safeTransferEth(deployer, amount);
        emit DeployerClaimed(epochId, deployer, amount);
    }

    function epochSnapshot(uint32 epochId)
        external
        view
        returns (
            uint256 feesForPlayers,
            uint256 feesForDeployer,
            uint32 cutoffLevel,
            uint256 totalEligibleWeight,
            bool finalized
        )
    {
        EpochData storage data = epochDataById[epochId];
        feesForPlayers = data.feesForPlayers;
        feesForDeployer = data.feesForDeployer;
        cutoffLevel = data.cutoffLevel;
        totalEligibleWeight = data.totalEligibleWeight;
        finalized = data.finalized;
    }

    function _quoteEthCostFrom(uint32 soldCount, uint16 amount) internal pure returns (uint256 total) {
        for (uint256 i = 0; i < amount; i++) {
            uint256 itemIndex = uint256(soldCount) + i + 1;
            if (itemIndex <= GameConstants.FIRST_DAILY_LOOTBOXES) {
                total += GameConstants.LOOTBOX_BASE_PRICE;
            } else {
                uint256 beyond = itemIndex - GameConstants.FIRST_DAILY_LOOTBOXES;
                uint256 growth = FixedPointMathLib.rpow(GameConstants.PRICE_GROWTH_WAD, beyond, GameConstants.WAD);
                total += FixedPointMathLib.mulWadUp(GameConstants.LOOTBOX_BASE_PRICE, growth);
            }
        }
    }

    function _quoteMmoCost(uint256 characterId, GameTypes.Difficulty, uint16 amount) internal view returns (uint256) {
        uint32 level = gameWorld.characterBestLevel(characterId);
        if (level <= 10) return 0;

        uint256 exponent = uint256(level - 11);
        if (exponent > 1024) {
            return GameConstants.MMO_SINK_MAX_PER_LOOTBOX * amount;
        }
        uint256 growth = FixedPointMathLib.rpow(GameConstants.MMO_SINK_GROWTH_WAD, exponent, GameConstants.WAD);
        uint256 perLootbox = FixedPointMathLib.mulWad(GameConstants.MMO_SINK_BASE, growth);
        if (perLootbox > GameConstants.MMO_SINK_MAX_PER_LOOTBOX) {
            perLootbox = GameConstants.MMO_SINK_MAX_PER_LOOTBOX;
        }
        return perLootbox * amount;
    }

    function _computeCutoffLevel(uint32 eligibleCount) internal view returns (uint32 cutoff) {
        if (eligibleCount == 0) return 0;

        uint32 cumulative;
        uint32 currentMaxLevel = gameWorld.maxLevel();
        for (uint32 level = currentMaxLevel; level >= 1; level--) {
            uint32 count = gameWorld.countAtLevel(level);
            if (count > 0) {
                cumulative += count;
                if (cumulative >= eligibleCount) {
                    cutoff = level;
                    break;
                }
            }
            if (level == 1) break;
        }
    }

    function _computeTotalWeight(uint32 cutoff) internal view returns (uint256 totalWeight) {
        if (cutoff == 0) return 0;

        uint32 currentMaxLevel = gameWorld.maxLevel();
        for (uint32 level = cutoff; level <= currentMaxLevel; level++) {
            uint32 count = gameWorld.countAtLevel(level);
            if (count > 0) {
                totalWeight += uint256(count) * _weightForDelta(level - cutoff);
            }
            if (level == currentMaxLevel) break;
        }
    }

    function _weightForDelta(uint32 delta) internal pure returns (uint256) {
        uint256 clamped = delta > GameConstants.WEIGHT_CLAMP ? GameConstants.WEIGHT_CLAMP : delta;
        return FixedPointMathLib.rpow(GameConstants.WEIGHT_BASE_WAD, clamped, GameConstants.WAD);
    }

    function _safeTransferEth(address to, uint256 amount) internal {
        (bool success,) = to.call{value: amount}("");
        if (!success) revert GameErrors.TransferFailed();
    }

    function _currentDay() internal view returns (uint32) {
        return uint32(block.timestamp / GameConstants.DAY_IN_SECONDS);
    }

    function _currentEpoch() internal view returns (uint32) {
        return uint32(block.timestamp / GameConstants.EPOCH_IN_SECONDS);
    }
}
