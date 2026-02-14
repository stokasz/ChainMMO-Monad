// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract StaleEquipmentOnTransferTest is ChainMMOBase {
    function test_TransferAutoUnequipsStaleSlots() public {
        uint256 characterId = _createCharacter(playerA, "TransferUnequip");

        uint256 itemId = _forceMintItem(playerA, GameTypes.Slot.HEAD, 2, 123);

        vm.startPrank(playerA);
        world.equipItem(characterId, itemId);

        items.transferFrom(playerA, playerB, itemId);
        vm.stopPrank();

        assertEq(world.equippedItemBySlot(characterId, uint8(GameTypes.Slot.HEAD)), 0);
    }
}

