// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import {Ownable} from 'openzeppelin-contracts/contracts/access/Ownable.sol';
import {ICreditOracle} from '@link-credit/ICreditOracle.sol';
import {IReceiver} from 'chainlink-keystone/IReceiver.sol';

contract CreditOracle is Ownable, ICreditOracle, IReceiver {
  uint256 public constant MAX_LTV_BOOST_BPS = 1500;

  mapping(address => uint256) public creditScores;
  address public creWorkflow;
  address public s_forwarder;
  bytes32 public s_allowedWorkflowId;
  address public s_allowedWorkflowOwner;

  error UnauthorizedUpdater(address sender);
  error UnauthorizedForwarder(address sender);
  error UnauthorizedWorkflow(bytes32 workflowId, address workflowOwner);
  error InvalidScore(uint256 scoreBps);

  event ForwarderUpdated(address indexed forwarder);
  event WorkflowConfigUpdated(bytes32 indexed workflowId, address indexed workflowOwner);

  constructor(address owner_) Ownable(owner_) {}

  function updateScore(address user, uint256 scoreBps) external {
    if (msg.sender != owner()) {
      revert UnauthorizedUpdater(msg.sender);
    }
    _storeScore(user, scoreBps);
  }

  function onReport(bytes calldata metadata, bytes calldata report) external {
    if (msg.sender != s_forwarder) {
      revert UnauthorizedForwarder(msg.sender);
    }

    // TODO: Re-enable workflow validation after CRE workflow is registered
    // (bytes32 workflowId, , , address workflowOwner, ) =
    //   abi.decode(metadata, (bytes32, string, string, address, string));
    // if (workflowId != s_allowedWorkflowId || workflowOwner != s_allowedWorkflowOwner) {
    //   revert UnauthorizedWorkflow(workflowId, workflowOwner);
    // }

    (address user, uint256 scoreBps) = abi.decode(report, (address, uint256));
    _storeScore(user, scoreBps);
  }

  function setForwarder(address forwarder) external onlyOwner {
    s_forwarder = forwarder;
    emit ForwarderUpdated(forwarder);
  }

  function setWorkflowConfig(bytes32 workflowId, address workflowOwner) external onlyOwner {
    s_allowedWorkflowId = workflowId;
    s_allowedWorkflowOwner = workflowOwner;
    emit WorkflowConfigUpdated(workflowId, workflowOwner);
  }

  function setCreWorkflow(address workflow) external onlyOwner {
    creWorkflow = workflow;
    emit CreWorkflowUpdated(workflow);
  }

  function _storeScore(address user, uint256 scoreBps) internal {
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

}
