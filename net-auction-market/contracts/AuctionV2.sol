// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;


import "./Auction.sol";

contract AuctionV2 is Auction {

    /// @notice 最小出价（USD）
    uint256 public minBidUsd;

    /// @notice 新增初始化函数（V2）
    function initializeV2(uint256 _minBidUsd) external reinitializer(2) onlyOwner {
        minBidUsd = _minBidUsd;
    }

    /// @notice 管理员可修改最小出价
    function setMinBidUsd(uint256 _minBidUsd) external onlyOwner {
        minBidUsd = _minBidUsd;
    }

    /// @notice 覆盖 bid，增加最小 USD 校验
    function bid(uint256 auctionId) public payable override {
        uint256 usdValue = ethToUsd(msg.value);

        require(usdValue >= minBidUsd, "below min bid");

        // 调用父合约原有逻辑
        super.bid(auctionId);
    }

    function bidWithERC20(
        uint256 auctionId,
        address token,
        uint256 amount
    ) public override {
        uint256 usdValue = erc20ToUsd(token, amount);
        require(usdValue >= minBidUsd, "below min bid");

        super.bidWithERC20(auctionId, token, amount);
    }

    /// @notice 用于验证升级成功
    function version() external pure returns (string memory) {
        return "Auction V2";
    }
}