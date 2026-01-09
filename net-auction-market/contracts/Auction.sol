// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract Auction is UUPSUpgradeable, OwnableUpgradeable {
    using SafeERC20 for IERC20;

    struct AuctionItem {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 endTime;

        address highestBidder;
        
        uint256 highestBidEth;       // ETH 出价
        uint256 highestBidERC20;     // ERC20 出价数量
        address highestBidToken;     // ERC20 代币地址

        uint256 highestBidUsd;       
        bool ended;
    }

    uint256 public auctionCount;
    mapping(uint256 => AuctionItem) public auctions;
    // ETH 待提现
    mapping(address => uint256) public pendingReturns;
    // ERC20 待提现，token => bidder => amount
    mapping(address => mapping(address => uint256)) public pendingERC20Returns;

    // ETH/USD price feed
    AggregatorV3Interface public ethPriceFeed;

    // ERC20/USD price feeds
    mapping(address => AggregatorV3Interface) public erc20PriceFeeds;

    // event AuctionCreated(uint256 indexed auctionId, address seller);
    // event BidPlaced(uint256 indexed auctionId, address bidder, uint256 usdValue);
    // event AuctionEnded(uint256 indexed auctionId, address winner);
    // event Withdraw(address indexed user, uint256 amount);

    function initialize(address _ethPriceFeed) public initializer {
        __Ownable_init(msg.sender);
        ethPriceFeed = AggregatorV3Interface(_ethPriceFeed);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}

    function setERC20PriceFeed(
        address token,
        address feed
    ) external onlyOwner {
        require(token != address(0), "invalid token");
        require(feed != address(0), "invalid feed");
        erc20PriceFeeds[token] = AggregatorV3Interface(feed);
    }

    // 创建拍卖
    function createAuction(
        address nft,
        uint256 tokenId,
        uint256 duration
    ) external returns (uint256 auctionId) {
        require(duration > 0, "duration must be > 0");

        auctionId = auctionCount++;

        IERC721(nft).transferFrom(
            msg.sender,
            address(this),
            tokenId
        );

        auctions[auctionId] = AuctionItem({
            seller: msg.sender,
            nft: nft,
            tokenId: tokenId,
            endTime: block.timestamp + duration,
            highestBidder: address(0),
            highestBidEth: 0,
            highestBidERC20: 0,
            highestBidToken: address(0),
            highestBidUsd: 0,
            ended: false
        });
    }

    // ETH 出价
    function bid(uint256 auctionId) public payable virtual {
        AuctionItem storage auction = auctions[auctionId];

        require(block.timestamp < auction.endTime, "auction ended");
        require(!auction.ended, "already ended");
        require(msg.sender != auction.seller, "seller cannot bid");
        require(msg.value > 0, "no eth sent");

        uint256 usdValue = ethToUsd(msg.value);
        require(usdValue > auction.highestBidUsd, "bid too low");

        _refundPreviousBid(auction);

        auction.highestBidder = msg.sender;
        auction.highestBidEth = msg.value;
        auction.highestBidERC20 = 0;
        auction.highestBidToken = address(0);
        auction.highestBidUsd = usdValue;
    }
    
    // ERC20 出价
    function bidWithERC20(
        uint256 auctionId,
        address token,
        uint256 amount
    ) public virtual {
        AuctionItem storage auction = auctions[auctionId];

        require(block.timestamp < auction.endTime, "auction ended");
        require(!auction.ended, "already ended");
        require(msg.sender != auction.seller, "seller cannot bid");
        require(amount > 0, "amount = 0");

        uint256 usdValue = erc20ToUsd(token, amount);
        require(usdValue > auction.highestBidUsd, "bid too low");

        // 转账 ERC20 到合约
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _refundPreviousBid(auction);

        // 更新最高出价信息
        auction.highestBidder = msg.sender;
        auction.highestBidEth = 0;
        auction.highestBidERC20 = amount;
        auction.highestBidToken = token;
        auction.highestBidUsd = usdValue;
    }

    function _refundPreviousBid(AuctionItem storage auction) internal {
        if (auction.highestBidder == address(0)) return;

        // 退回之前的最高出价者
        if (auction.highestBidEth > 0) {
            pendingReturns[auction.highestBidder] += auction.highestBidEth;
        } else if (auction.highestBidERC20 > 0) {
            pendingERC20Returns[auction.highestBidToken][auction.highestBidder] += auction.highestBidERC20;
        }
    }

    // 结束拍卖
    function endAuction(uint256 auctionId) external {
        AuctionItem storage auction = auctions[auctionId];

        require(block.timestamp >= auction.endTime, "not ended");
        require(!auction.ended, "already ended");

        auction.ended = true;

        if (auction.highestBidder != address(0)) {
            IERC721(auction.nft).transferFrom(
                address(this),
                auction.highestBidder,
                auction.tokenId
            );
            // 将最高出价转给卖家
            if (auction.highestBidEth > 0) {
                pendingReturns[auction.seller] += auction.highestBidEth;
            } else if (auction.highestBidERC20 > 0) {
                pendingERC20Returns[auction.highestBidToken][auction.seller] += auction.highestBidERC20;
            }
        } else {
            IERC721(auction.nft).transferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            );
        }
    }

    // 提取 ETH
    function withdraw() external {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "no funds");

        pendingReturns[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    // 提取 ERC20
    function withdrawERC20(address token) external {
        uint256 amount = pendingERC20Returns[token][msg.sender];
        require(amount > 0, "no funds");

        pendingERC20Returns[token][msg.sender] = 0;

        IERC20(token).safeTransfer(msg.sender, amount);
    }
    
    function ethToUsd(uint256 ethAmount) internal view returns (uint256) {
        (, int256 price,,,) = ethPriceFeed.latestRoundData();
        require(price > 0, "invalid price");

        uint8 feedDecimals = ethPriceFeed.decimals();
        return (ethAmount * uint256(price)) / (10 ** feedDecimals);
    }

    function erc20ToUsd(
        address token,
        uint256 amount
    ) internal view returns (uint256) {
        require(address(erc20PriceFeeds[token]) != address(0), "unsupported token");

        AggregatorV3Interface feed = erc20PriceFeeds[token];
        (, int256 price,,,) = feed.latestRoundData();
        require(price > 0, "invalid price");

        uint8 feedDecimals = feed.decimals(); // 8
        // uint8 tokenDecimals = IERC20Metadata(token).decimals(); // 18

        // 因为你的 MockERC20 和 ETH 都是 18 位
        // 统一换算到 18 位 USD 价值的公式：
        // (数量 * 价格) / 10^feedDecimals
        // 注意：如果 tokenDecimals 也是 18，(18 - tokenDecimals) 就是 0，10^0 = 1
        return (amount * uint256(price)) / (10 ** feedDecimals);
    }
}