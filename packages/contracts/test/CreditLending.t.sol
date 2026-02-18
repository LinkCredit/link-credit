// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {TestnetProcedures} from 'aave-v3-origin/tests/utils/TestnetProcedures.sol';
import {IPoolAddressesProvider} from 'aave-v3-origin/src/contracts/interfaces/IPoolAddressesProvider.sol';
import {IReserveInterestRateStrategy} from '@link-credit/interfaces/IReserveInterestRateStrategy.sol';
import {ICreditPool} from '@link-credit/interfaces/ICreditPool.sol';
import {CreditOracle} from '@link-credit/CreditOracle.sol';
import {CreditPoolInstance} from '@link-credit/instances/CreditPoolInstance.sol';

contract CreditLendingTest is TestnetProcedures {
  uint256 internal constant BASE_LTV = 5_000;
  uint256 internal constant LIQ_THRESHOLD = 7_500;
  uint256 internal constant LIQ_BONUS = 10_500;

  CreditOracle internal creditOracle;

  function setUp() external {
    _initTestEnvironment(true, false);

    vm.startPrank(poolAdmin);

    creditOracle = new CreditOracle(poolAdmin);

    CreditPoolInstance creditPoolImplementation = new CreditPoolInstance(
      IPoolAddressesProvider(address(contracts.poolAddressesProvider)),
      IReserveInterestRateStrategy(address(contracts.defaultInterestRateStrategy))
    );

    contracts.poolAddressesProvider.setPoolImpl(address(creditPoolImplementation));
    ICreditPool(address(contracts.poolProxy)).setCreditOracle(address(creditOracle));

    contracts.poolConfiguratorProxy.configureReserveAsCollateral(
      tokenList.weth,
      BASE_LTV,
      LIQ_THRESHOLD,
      LIQ_BONUS
    );

    vm.stopPrank();

    assertEq(ICreditPool(address(contracts.poolProxy)).getCreditOracle(), address(creditOracle));
  }

  function test_ltvBoostTracksCreditScore() external {
    _supplyWeth(alice, 10 ether);

    (, , , , uint256 baseLtv, ) = contracts.poolProxy.getUserAccountData(alice);
    assertEq(baseLtv, BASE_LTV);

    _setScore(alice, 8_000);
    (, , , , uint256 boosted80, ) = contracts.poolProxy.getUserAccountData(alice);
    assertEq(boosted80, 6_200);

    _setScore(alice, 10_000);
    (, , , , uint256 boosted100, ) = contracts.poolProxy.getUserAccountData(alice);
    assertEq(boosted100, 6_500);
  }

  function test_ltvBoostRespectsLiquidationThresholdCap() external {
    vm.prank(poolAdmin);
    contracts.poolConfiguratorProxy.configureReserveAsCollateral(tokenList.weth, 7_300, 7_500, LIQ_BONUS);

    _supplyWeth(carol, 10 ether);
    _setScore(carol, 10_000);

    (, , , , uint256 ltv, ) = contracts.poolProxy.getUserAccountData(carol);
    assertEq(ltv, 7_400);
  }

  function test_borrowUsesBoostedLtvBoundaries() external {
    _supplyUsdx(carol, 50_000e6);

    _supplyWeth(alice, 10 ether);
    _setScore(alice, 8_000);

    vm.prank(alice);
    contracts.poolProxy.borrow(tokenList.usdx, 5_000e6, 2, 0, alice);

    (, uint256 debtAfterBorrow, , , , ) = contracts.poolProxy.getUserAccountData(alice);
    assertGt(debtAfterBorrow, 0);

    _supplyWeth(bob, 10 ether);
    _setScore(bob, 8_000);

    vm.expectRevert();
    vm.prank(bob);
    contracts.poolProxy.borrow(tokenList.usdx, 20_000e6, 2, 0, bob);
  }

  function _supplyWeth(address user, uint256 amount) internal {
    vm.prank(user);
    contracts.poolProxy.supply(tokenList.weth, amount, user, 0);
  }

  function _supplyUsdx(address user, uint256 amount) internal {
    vm.prank(user);
    contracts.poolProxy.supply(tokenList.usdx, amount, user, 0);
  }

  function _setScore(address user, uint256 score) internal {
    vm.prank(poolAdmin);
    creditOracle.updateScore(user, score);
  }
}
