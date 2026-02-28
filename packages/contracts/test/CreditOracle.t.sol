// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from 'forge-std/Test.sol';
import {CreditOracle} from '@link-credit/CreditOracle.sol';

contract CreditOracleTest is Test {
  CreditOracle internal oracle;

  address internal owner = address(0xA11CE);
  address internal workflow = address(0xBEEF);
  address internal forwarder = address(0xF0F0);
  address internal user = address(0xCAFE);
  address internal stranger = address(0xDEAD);
  bytes32 internal workflowId = keccak256("link-credit-workflow");

  function setUp() external {
    vm.prank(owner);
    oracle = new CreditOracle(owner);
  }

  function test_ownerCanUpdateScore() external {
    vm.prank(owner);
    oracle.updateScore(user, 7_500);

    assertEq(oracle.creditScores(user), 7_500);
    assertEq(oracle.getLtvBoost(user), 1_125);
  }

  function test_forwarderCanUpdateViaOnReport() external {
    vm.prank(owner);
    oracle.setForwarder(forwarder);

    vm.prank(owner);
    oracle.setWorkflowConfig(workflowId, workflow);

    bytes memory metadata = abi.encode(
      workflowId,
      "link-credit",
      "link-credit-owner",
      workflow,
      "score-report"
    );
    bytes memory report = abi.encode(user, uint256(8_000));

    vm.prank(forwarder);
    oracle.onReport(metadata, report);

    assertEq(oracle.creditScores(user), 8_000);
    assertEq(oracle.getLtvBoost(user), 1_200);
  }

  function test_nonForwarderCannotCallOnReport() external {
    vm.prank(owner);
    oracle.setForwarder(forwarder);

    vm.prank(owner);
    oracle.setWorkflowConfig(workflowId, workflow);

    bytes memory metadata = abi.encode(
      workflowId,
      "link-credit",
      "link-credit-owner",
      workflow,
      "score-report"
    );
    bytes memory report = abi.encode(user, uint256(8_000));

    vm.expectRevert(abi.encodeWithSelector(CreditOracle.UnauthorizedForwarder.selector, stranger));
    vm.prank(stranger);
    oracle.onReport(metadata, report);
  }

  function test_unauthorizedCannotUpdateScore() external {
    vm.expectRevert(abi.encodeWithSelector(CreditOracle.UnauthorizedUpdater.selector, stranger));
    vm.prank(stranger);
    oracle.updateScore(user, 4_000);
  }

  function test_setScoreBoundaries() external {
    vm.startPrank(owner);
    oracle.updateScore(user, 0);
    assertEq(oracle.getLtvBoost(user), 0);

    oracle.updateScore(user, 5_000);
    assertEq(oracle.getLtvBoost(user), 750);

    oracle.updateScore(user, 10_000);
    assertEq(oracle.getLtvBoost(user), 1_500);
    vm.stopPrank();
  }

  function test_revertsWhenScoreTooHigh() external {
    vm.expectRevert(abi.encodeWithSelector(CreditOracle.InvalidScore.selector, 10_001));
    vm.prank(owner);
    oracle.updateScore(user, 10_001);
  }

  function test_onlyOwnerCanSetWorkflow() external {
    vm.expectRevert();
    vm.prank(stranger);
    oracle.setCreWorkflow(workflow);

    vm.prank(owner);
    oracle.setCreWorkflow(workflow);
    assertEq(oracle.creWorkflow(), workflow);
  }
}
