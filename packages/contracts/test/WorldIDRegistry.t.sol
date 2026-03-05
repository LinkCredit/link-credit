// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Test} from 'forge-std/Test.sol';
import {WorldIDRegistry} from '@link-credit/WorldIDRegistry.sol';

contract WorldIDRegistryTest is Test {
  WorldIDRegistry internal registry;

  address internal owner = address(0xA11CE);
  address internal forwarder = address(0xF0F0);
  address internal user = address(0xCAFE);
  address internal user2 = address(0xBEEF);
  address internal stranger = address(0xDEAD);
  bytes32 internal nullifier = keccak256("nullifier");

  function setUp() external {
    vm.prank(owner);
    registry = new WorldIDRegistry(owner);
  }

  function test_onReportStoresVerification() external {
    vm.prank(owner);
    registry.setForwarder(forwarder);

    bytes memory metadata = abi.encode("worldid");
    bytes memory report = abi.encode(user, true, uint256(0), nullifier);

    vm.prank(forwarder);
    registry.onReport(metadata, report);

    (bool verified, uint256 level, bytes32 storedNullifier, uint256 timestamp) =
      registry.verifications(user);

    assertTrue(verified);
    assertEq(level, 0);
    assertEq(storedNullifier, nullifier);
    assertGt(timestamp, 0);
    assertEq(registry.nullifierOwners(nullifier), user);
    assertEq(registry.getVerificationBoost(user), 1000);
    assertTrue(registry.isVerified(user));
  }

  function test_nonForwarderCannotWrite() external {
    vm.prank(owner);
    registry.setForwarder(forwarder);

    bytes memory metadata = abi.encode("worldid");
    bytes memory report = abi.encode(user, true, uint256(0), nullifier);

    vm.expectRevert(abi.encodeWithSelector(WorldIDRegistry.UnauthorizedForwarder.selector, stranger));
    vm.prank(stranger);
    registry.onReport(metadata, report);
  }

  function test_revertsWhenNullifierIsReusedByDifferentUser() external {
    vm.prank(owner);
    registry.setForwarder(forwarder);

    bytes memory metadata = abi.encode("worldid");

    vm.prank(forwarder);
    registry.onReport(metadata, abi.encode(user, true, uint256(0), nullifier));

    vm.expectRevert(
      abi.encodeWithSelector(
        WorldIDRegistry.NullifierAlreadyUsed.selector, nullifier, user, user2
      )
    );
    vm.prank(forwarder);
    registry.onReport(metadata, abi.encode(user2, true, uint256(0), nullifier));
  }
}
