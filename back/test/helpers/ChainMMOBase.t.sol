// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {GameWorld} from "../../src/GameWorld.sol";
import {FeeVault} from "../../src/FeeVault.sol";
import {TradeEscrow} from "../../src/TradeEscrow.sol";
import {RFQMarket} from "../../src/RFQMarket.sol";
import {Items} from "../../src/Items.sol";
import {MMOToken} from "../../src/MMOToken.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";
import {TestGameWorld} from "./TestGameWorld.sol";

abstract contract ChainMMOBase is Test {
    MMOToken internal token;
    GameWorld internal world;
    FeeVault internal feeVault;
    TradeEscrow internal escrow;
    RFQMarket internal rfqMarket;
    Items internal items;

    address internal tokenOwner = address(this);
    address internal feeDeployer = address(0x12345);
    address internal playerA = address(0xA11CE);
    address internal playerB = address(0xB0B);

    function setUp() public virtual {
        token = new MMOToken(tokenOwner);

        uint256 nonce = vm.getNonce(address(this));
        address predictedFeeVault = vm.computeCreateAddress(address(this), nonce + 1);

        world = new TestGameWorld(address(token), predictedFeeVault, feeDeployer);
        feeVault = new FeeVault(address(world), address(token), feeDeployer);
        items = world.items();
        escrow = new TradeEscrow(address(items), address(token), feeDeployer);
        rfqMarket = new RFQMarket(address(items), address(token), feeDeployer);

        token.transfer(playerA, 50_000 ether);
        token.transfer(playerB, 50_000 ether);

        vm.deal(feeDeployer, 0);
        vm.deal(playerA, 100 ether);
        vm.deal(playerB, 100 ether);
    }

    function _rollToReveal(uint256 commitId) internal {
        (,,,,, uint64 commitBlock,,) = world.commits(commitId);
        vm.roll(uint256(commitBlock) + 2);
    }

    function _createCharacter(address who, string memory name) internal returns (uint256 characterId) {
        vm.prank(who);
        characterId = world.createCharacter(GameTypes.Race.HUMAN, GameTypes.Class.WARRIOR, name);
    }

    function _openFreeLootbox(uint256 characterId, address who, uint64 nonce) internal {
        vm.startPrank(who);
        world.claimFreeLootbox(characterId);
        bytes32 secret = keccak256(abi.encode("free-open", who, nonce));
        bytes32 hash = keccak256(
            abi.encode(secret, who, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonce, uint32(2), uint16(1))
        );
        uint256 commitId =
            world.commitAction{value: world.commitFee()}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonce);
        _rollToReveal(commitId);
        world.revealOpenLootboxes(commitId, secret, 2, 1);
        vm.stopPrank();
    }

    function _levelUpTo(uint256 characterId, address who, uint32 targetLevel) internal {
        uint256 attempts = 0;
        while (world.characterBestLevel(characterId) < targetLevel) {
            uint32 next = world.characterBestLevel(characterId) + 1;

            vm.startPrank(who);
            uint64 nonce = uint64(50_000 + attempts);
            bytes32 secret = keccak256(abi.encode("level-up", who, characterId, nonce));
            bytes32 hash = keccak256(
                abi.encode(
                    secret,
                    who,
                    GameTypes.ActionType.DUNGEON_RUN,
                    characterId,
                    nonce,
                    uint8(GameTypes.Difficulty.EASY),
                    next
                )
            );
            uint256 commitId = world.commitAction{value: world.commitFee()}(
                characterId, GameTypes.ActionType.DUNGEON_RUN, hash, nonce
            );
            _rollToReveal(commitId);
            world.revealStartDungeon(commitId, secret, GameTypes.Difficulty.EASY, next);

            while (true) {
                (
                    bool active,
                    uint8 roomCount,
                    uint8 roomsCleared,
                    uint32 hp,
                    uint32 mana,
                    uint8 hpPotionCharges,
                    uint8 manaPotionCharges,
                    uint8 powerPotionCharges,
                    uint32 dungeonLevel,
                    GameTypes.Difficulty difficulty
                ) = world.getRunState(characterId);
                roomCount;
                dungeonLevel;
                difficulty;
                if (!active) break;

                GameTypes.PotionChoice potion = GameTypes.PotionChoice.NONE;
                if (powerPotionCharges > 0 && roomsCleared == 0) {
                    potion = GameTypes.PotionChoice.POWER;
                } else if (manaPotionCharges > 0 && mana < 40) {
                    potion = GameTypes.PotionChoice.MANA_REGEN;
                } else if (hpPotionCharges > 0 && hp < 280) {
                    potion = GameTypes.PotionChoice.HP_REGEN;
                }

                GameTypes.AbilityChoice ability =
                    mana >= 20 ? GameTypes.AbilityChoice.BERSERK : GameTypes.AbilityChoice.NONE;
                world.resolveNextRoom(characterId, potion, ability);
            }

            uint64 lootNonceBase = uint64(90_000 + attempts * 32);
            _consumeLootAndEquip(characterId, who, lootNonceBase);
            vm.stopPrank();

            attempts++;
            if (attempts > 600) {
                revert("unable to level character in bounded attempts");
            }
        }
    }

    function _consumeLootAndEquip(uint256 characterId, address who, uint64 nonceBase) internal {
        uint32 highestTier = world.characterBestLevel(characterId) + 1;
        for (uint32 tier = 2; tier <= highestTier; tier++) {
            uint32 credits = world.lootboxCredits(characterId, tier);
            if (credits == 0) continue;

            uint16 openAmount = credits > 4 ? 4 : uint16(credits);
            bytes32 secret = keccak256(abi.encode("auto-open", who, characterId, tier, nonceBase));
            bytes32 hash = keccak256(
                abi.encode(secret, who, GameTypes.ActionType.LOOTBOX_OPEN, characterId, nonceBase, tier, openAmount)
            );
            uint256 commitId = world.commitAction{value: world.commitFee()}(
                characterId, GameTypes.ActionType.LOOTBOX_OPEN, hash, nonceBase
            );
            _rollToReveal(commitId);

            uint256 firstTokenId = items.nextTokenId();
            world.revealOpenLootboxes(commitId, secret, tier, openAmount);
            uint256 endTokenId = items.nextTokenId();
            for (uint256 tokenId = firstTokenId; tokenId < endTokenId; tokenId++) {
                if (items.ownerOf(tokenId) != who) continue;
                try world.equipItem(characterId, tokenId) {} catch {}
            }

            nonceBase++;
        }
    }

    function _forceLevel(uint256 characterId, uint32 newLevel) internal {
        _forceLevelAtEpoch(characterId, newLevel, uint32(block.timestamp / 1 hours));
    }

    function _forceLevelAtEpoch(uint256 characterId, uint32 newLevel, uint32 epoch) internal {
        TestGameWorld(address(world)).forceSetBestLevel(characterId, newLevel, epoch);
    }

    function _forceCreditPotion(
        uint256 characterId,
        GameTypes.PotionType potionType,
        GameTypes.PotionTier potionTier,
        uint32 amount
    ) internal {
        TestGameWorld(address(world)).forceCreditPotion(characterId, potionType, potionTier, amount);
    }

    function _forceMintItem(address to, GameTypes.Slot slot, uint32 tier, uint64 seed)
        internal
        returns (uint256 tokenId)
    {
        tokenId = TestGameWorld(address(world)).forceMintItem(to, slot, tier, seed);
    }

    function _forceMintItemWithVariance(
        address to,
        GameTypes.Slot slot,
        uint32 tier,
        uint64 seed,
        GameTypes.VarianceMode varianceMode
    ) internal returns (uint256 tokenId) {
        tokenId = TestGameWorld(address(world)).forceMintItemWithVariance(to, slot, tier, seed, varianceMode);
    }

    function _forceGrantUpgradeStones(uint256 characterId, uint32 amount) internal {
        TestGameWorld(address(world)).forceGrantUpgradeStones(characterId, amount);
    }

    function _forceSetLevelClearProgress(uint256 characterId, uint32 dungeonLevel, uint8 clears) internal {
        TestGameWorld(address(world)).forceSetLevelClearProgress(characterId, dungeonLevel, clears);
    }

    function _characterStats(uint256 characterId) internal view returns (GameTypes.Stats memory stats) {
        stats = TestGameWorld(address(world)).exposedCharacterTotalStats(characterId);
    }
}
