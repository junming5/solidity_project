// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract MockV3Aggregator is AggregatorV3Interface {
    int256 private _price;
    uint8 private _decimals;

    constructor(uint8 decimals_, int256 initialPrice_) {
        _decimals = decimals_;
        _price = initialPrice_;
    }

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function description() external pure override returns (string memory) {
        return "MockV3Aggregator";
    }

    function version() external pure override returns (uint256) {
        return 1;
    }

    function latestRoundData()
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (0, _price, 0, 0, 0);
    }

    function getRoundData(uint80 /*_roundId*/)
        external
        view
        override
        returns (uint80, int256, uint256, uint256, uint80)
    {
        return (0, _price, 0, 0, 0);
    }

    function updatePrice(int256 newPrice) external {
        _price = newPrice;
    }
}