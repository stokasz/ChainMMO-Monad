// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract CharacterCreationTest is ChainMMOBase {
    function test_MaxFiveCharactersPerWallet() public {
        vm.startPrank(playerA);
        for (uint256 i = 0; i < 5; i++) {
            world.createCharacter(GameTypes.Race.HUMAN, GameTypes.Class.WARRIOR, string.concat("name", vm.toString(i)));
        }
        vm.expectRevert(GameErrors.MaxCharactersReached.selector);
        world.createCharacter(GameTypes.Race.ELF, GameTypes.Class.MAGE, "overflow");
        vm.stopPrank();
    }

    function test_NameStoredOnChain() public {
        vm.prank(playerA);
        uint256 characterId = world.createCharacter(GameTypes.Race.DWARF, GameTypes.Class.PALADIN, "AgentumShield");
        assertEq(world.characterName(characterId), "AgentumShield");
    }

    function test_FreeLootboxOnlyOnce() public {
        uint256 characterId = _createCharacter(playerA, "ArcaneOne");

        vm.prank(playerA);
        world.claimFreeLootbox(characterId);
        assertEq(world.lootboxCredits(characterId, 2), 1);

        vm.prank(playerA);
        vm.expectRevert(GameErrors.FreeLootboxAlreadyClaimed.selector);
        world.claimFreeLootbox(characterId);
    }
}
