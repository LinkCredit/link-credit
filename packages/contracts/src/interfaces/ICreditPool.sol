// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

interface ICreditPool {
  function setCreditOracle(address creditOracle) external;

  function getCreditOracle() external view returns (address);
}
