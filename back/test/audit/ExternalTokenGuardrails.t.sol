// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {FeeVault} from "../../src/FeeVault.sol";
import {GameWorld} from "../../src/GameWorld.sol";
import {RFQMarket} from "../../src/RFQMarket.sol";
import {TradeEscrow} from "../../src/TradeEscrow.sol";
import {GameErrors} from "../../src/libraries/GameErrors.sol";

contract MockToken18 {
    function decimals() external pure returns (uint8) {
        return 18;
    }
}

contract MockToken6 {
    function decimals() external pure returns (uint8) {
        return 6;
    }
}

contract ExternalTokenGuardrailsTest is Test {
    function test_ConstructorsRejectZeroMmoTokenAddress() public {
        vm.expectRevert(GameErrors.InvalidTokenAddress.selector);
        new GameWorld(address(0), address(0xFEE), address(0xBEEF));

        vm.expectRevert(GameErrors.InvalidTokenAddress.selector);
        new FeeVault(address(0x111), address(0), address(0xBEEF));

        vm.expectRevert(GameErrors.InvalidTokenAddress.selector);
        new TradeEscrow(address(0x222), address(0), address(0xBEEF));

        vm.expectRevert(GameErrors.InvalidTokenAddress.selector);
        new RFQMarket(address(0x222), address(0), address(0xBEEF));
    }

    function test_ConstructorsRejectNonContractMmoTokenAddress() public {
        address eoaLike = address(0xCAFE);

        vm.expectRevert(GameErrors.InvalidTokenContract.selector);
        new GameWorld(eoaLike, address(0xFEE), address(0xBEEF));

        vm.expectRevert(GameErrors.InvalidTokenContract.selector);
        new FeeVault(address(0x111), eoaLike, address(0xBEEF));

        vm.expectRevert(GameErrors.InvalidTokenContract.selector);
        new TradeEscrow(address(0x222), eoaLike, address(0xBEEF));

        vm.expectRevert(GameErrors.InvalidTokenContract.selector);
        new RFQMarket(address(0x222), eoaLike, address(0xBEEF));
    }

    function test_ConstructorsRejectNon18DecimalsMmoToken() public {
        MockToken6 token = new MockToken6();
        address mmoToken = address(token);

        vm.expectRevert(GameErrors.UnsupportedTokenDecimals.selector);
        new GameWorld(mmoToken, address(0xFEE), address(0xBEEF));

        vm.expectRevert(GameErrors.UnsupportedTokenDecimals.selector);
        new FeeVault(address(0x111), mmoToken, address(0xBEEF));

        vm.expectRevert(GameErrors.UnsupportedTokenDecimals.selector);
        new TradeEscrow(address(0x222), mmoToken, address(0xBEEF));

        vm.expectRevert(GameErrors.UnsupportedTokenDecimals.selector);
        new RFQMarket(address(0x222), mmoToken, address(0xBEEF));
    }

    function test_ConstructorsAccept18DecimalMmoToken() public {
        MockToken18 token = new MockToken18();
        address mmoToken = address(token);

        GameWorld world = new GameWorld(mmoToken, address(0xFEE), address(0xBEEF));
        FeeVault feeVault = new FeeVault(address(0x111), mmoToken, address(0xBEEF));
        TradeEscrow tradeEscrow = new TradeEscrow(address(0x222), mmoToken, address(0xBEEF));
        RFQMarket rfqMarket = new RFQMarket(address(0x222), mmoToken, address(0xBEEF));

        assertEq(address(world.mmoToken()), mmoToken);
        assertEq(address(feeVault.mmoToken()), mmoToken);
        assertEq(tradeEscrow.mmoToken(), mmoToken);
        assertEq(rfqMarket.mmoToken(), mmoToken);
    }
}
