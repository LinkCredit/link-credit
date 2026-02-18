// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from 'openzeppelin-contracts/contracts/access/Ownable.sol';
import {ICreditOracle} from '@link-credit/ICreditOracle.sol';

contract CreditOracle is Ownable, ICreditOracle {
  uint256 public constant MAX_LTV_BOOST_BPS = 1500;

  mapping(address => uint256) public creditScores;
  address public creWorkflow;

  error UnauthorizedUpdater(address sender);
  error InvalidScore(uint256 scoreBps);

  constructor(address owner_) Ownable(owner_) {}

  function updateScore(address user, uint256 scoreBps) external {
    if (msg.sender != creWorkflow && msg.sender != owner()) {
      revert UnauthorizedUpdater(msg.sender);
    }
    if (scoreBps > 10_000) {
      revert InvalidScore(scoreBps);
    }

    creditScores[user] = scoreBps;
    emit ScoreUpdated(user, scoreBps, getLtvBoost(user));
  }

  function getLtvBoost(address user) public view returns (uint256) {
    uint256 score = creditScores[user];
    if (score == 0) {
      return 0;
    }
    return (MAX_LTV_BOOST_BPS * score) / 10_000;
  }

  function setCreWorkflow(address workflow) external onlyOwner {
    creWorkflow = workflow;
    emit CreWorkflowUpdated(workflow);
  }
}
