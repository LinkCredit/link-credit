// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

interface ICreditOracle {
  function creditScores(address user) external view returns (uint256);

  function getLtvBoost(address user) external view returns (uint256);

  function updateScore(address user, uint256 score) external;

  function setCreWorkflow(address workflow) external;

  event ScoreUpdated(address indexed user, uint256 score, uint256 boost);
  event CreWorkflowUpdated(address indexed workflow);
}
