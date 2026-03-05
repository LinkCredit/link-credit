// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from 'openzeppelin-contracts/contracts/access/Ownable.sol';
import {IReceiver} from 'chainlink-keystone/IReceiver.sol';

contract WorldIDRegistry is Ownable, IReceiver {
  uint256 public constant WORLD_ID_BOOST_BPS = 1000;

  struct VerificationStatus {
    bool verified;
    uint256 verificationLevel;
    bytes32 nullifierHash;
    uint256 timestamp;
  }

  mapping(address => VerificationStatus) public verifications;
  mapping(bytes32 => address) public nullifierOwners;
  address public s_forwarder;

  error UnauthorizedForwarder(address sender);
  error NullifierAlreadyUsed(bytes32 nullifierHash, address existingOwner, address attemptedUser);

  event ForwarderUpdated(address indexed forwarder);
  event VerificationUpdated(
    address indexed user,
    bool verified,
    uint256 verificationLevel,
    bytes32 nullifierHash
  );

  constructor(address owner_) Ownable(owner_) {}

  function setForwarder(address forwarder) external onlyOwner {
    s_forwarder = forwarder;
    emit ForwarderUpdated(forwarder);
  }

  function onReport(bytes calldata, bytes calldata report) external {
    if (msg.sender != s_forwarder) {
      revert UnauthorizedForwarder(msg.sender);
    }

    (address user, bool verified, uint256 verificationLevel, bytes32 nullifierHash) =
      abi.decode(report, (address, bool, uint256, bytes32));

    address existingOwner = nullifierOwners[nullifierHash];
    if (existingOwner != address(0) && existingOwner != user) {
      revert NullifierAlreadyUsed(nullifierHash, existingOwner, user);
    }

    if (verified && existingOwner == address(0)) {
      nullifierOwners[nullifierHash] = user;
    }

    verifications[user] = VerificationStatus({
      verified: verified,
      verificationLevel: verificationLevel,
      nullifierHash: nullifierHash,
      timestamp: block.timestamp
    });

    emit VerificationUpdated(user, verified, verificationLevel, nullifierHash);
  }

  function isVerified(address user) external view returns (bool) {
    return verifications[user].verified;
  }

  function getVerificationBoost(address user) external view returns (uint256) {
    return verifications[user].verified ? WORLD_ID_BOOST_BPS : 0;
  }
}
