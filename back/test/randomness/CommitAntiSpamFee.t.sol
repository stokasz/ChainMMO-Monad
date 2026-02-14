// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ChainMMOBase} from "../helpers/ChainMMOBase.t.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";
import {GameTypes} from "../../src/libraries/GameTypes.sol";

contract CommitAntiSpamFeeTest is ChainMMOBase {
    function test_CommitActionRequiresAntiSpamFee() public {
        uint256 characterId = _createCharacter(playerA, "FeeCommit");

        vm.startPrank(playerA);
        bytes32 commitHash = keccak256(abi.encode("fee-commit"));
        vm.expectRevert(GameErrors.InsufficientCommitFee.selector);
        world.commitAction(characterId, GameTypes.ActionType.LOOTBOX_OPEN, commitHash, 1);
        vm.stopPrank();
    }

    function test_CommitActionRoutesFeeToDeployerAndRefundsExcess() public {
        uint256 characterId = _createCharacter(playerA, "FeeRoute");

        uint256 fee = world.commitFee();
        uint256 deployerBefore = feeDeployer.balance;

        vm.startPrank(playerA);
        uint256 playerBefore = playerA.balance;
        bytes32 commitHash = keccak256(abi.encode("fee-route"));

        world.commitAction{value: fee + 0.123 ether}(characterId, GameTypes.ActionType.LOOTBOX_OPEN, commitHash, 1);
        vm.stopPrank();

        assertEq(feeDeployer.balance, deployerBefore + fee);
        assertEq(playerA.balance, playerBefore - fee);
    }
}
