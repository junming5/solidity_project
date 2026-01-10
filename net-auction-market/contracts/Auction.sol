// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

/**
 * @title NFT 拍卖市场 (支持多币种及 Chainlink 预言机)
 */
contract Auction is UUPSUpgradeable, OwnableUpgradeable, ReentrancyGuardUpgradeable {
    using SafeERC20 for IERC20;

    struct AuctionItem {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 endTime;
        address highestBidder;
        uint256 highestBidEth;       
        uint256 highestBidERC20;     
        address highestBidToken;     
        uint256 highestBidUsd;       // 统一以 8 位精度的 USD 存储
        bool ended;
    }

    uint256 public auctionCount;
    mapping(uint256 => AuctionItem) public auctions;
    mapping(address => uint256) public pendingReturns;
    mapping(address => mapping(address => uint256)) public pendingERC20Returns;

    AggregatorV3Interface public ethPriceFeed;
    mapping(address => AggregatorV3Interface) public erc20PriceFeeds;

    // --- Events ---
    event AuctionCreated(uint256 indexed auctionId, address indexed seller, uint256 tokenId, uint256 endTime);
    event BidPlaced(uint256 indexed auctionId, address indexed bidder, uint256 usdValue);
    event AuctionEnded(uint256 indexed auctionId, address winner, uint256 amountUsd);
    event Withdraw(address indexed user, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _ethPriceFeed) public initializer {
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __UUPSUpgradeable_init();
        ethPriceFeed = AggregatorV3Interface(_ethPriceFeed);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function setERC20PriceFeed(address token, address feed) external onlyOwner {
        require(token != address(0) && feed != address(0), "Invalid input");
        erc20PriceFeeds[token] = AggregatorV3Interface(feed);
    }

    // 创建拍卖
    function createAuction(address nft, uint256 tokenId, uint256 duration) external returns (uint256 auctionId) {
        require(duration > 0, "duration must be > 0");
        auctionId = auctionCount++;

        IERC721(nft).transferFrom(msg.sender, address(this), tokenId);

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

        emit AuctionCreated(auctionId, msg.sender, tokenId, block.timestamp + duration);
    }

    // ETH 出价
    function bid(uint256 auctionId) public payable virtual nonReentrant {
        AuctionItem storage auction = auctions[auctionId];
        require(block.timestamp < auction.endTime, "auction ended");
        require(!auction.ended, "already ended");
        require(msg.sender != auction.seller, "seller cannot bid");

        uint256 usdValue = ethToUsd(msg.value);
        require(usdValue > auction.highestBidUsd, "bid too low");

        _refundPreviousBid(auction);

        auction.highestBidder = msg.sender;
        auction.highestBidEth = msg.value;
        auction.highestBidERC20 = 0;
        auction.highestBidToken = address(0);
        auction.highestBidUsd = usdValue;

        emit BidPlaced(auctionId, msg.sender, usdValue);
    }
    
    // ERC20 出价
    function bidWithERC20(uint256 auctionId, address token, uint256 amount) public virtual nonReentrant {
        AuctionItem storage auction = auctions[auctionId];
        require(block.timestamp < auction.endTime, "auction ended");
        require(!auction.ended, "already ended");
        require(msg.sender != auction.seller, "seller cannot bid");

        uint256 usdValue = erc20ToUsd(token, amount);
        require(usdValue > auction.highestBidUsd, "bid too low");

        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        _refundPreviousBid(auction);

        auction.highestBidder = msg.sender;
        auction.highestBidEth = 0;
        auction.highestBidERC20 = amount;
        auction.highestBidToken = token;
        auction.highestBidUsd = usdValue;

        emit BidPlaced(auctionId, msg.sender, usdValue);
    }

    function _refundPreviousBid(AuctionItem storage auction) internal {
        if (auction.highestBidder == address(0)) return;
        if (auction.highestBidEth > 0) {
            pendingReturns[auction.highestBidder] += auction.highestBidEth;
        } else if (auction.highestBidERC20 > 0) {
            pendingERC20Returns[auction.highestBidToken][auction.highestBidder] += auction.highestBidERC20;
        }
    }

    // 结束拍卖
    function endAuction(uint256 auctionId) external nonReentrant {
        AuctionItem storage auction = auctions[auctionId];
        require(block.timestamp >= auction.endTime, "not ended");
        require(!auction.ended, "already ended");

        auction.ended = true;

        if (auction.highestBidder != address(0)) {
            IERC721(auction.nft).transferFrom(address(this), auction.highestBidder, auction.tokenId);
            if (auction.highestBidEth > 0) {
                pendingReturns[auction.seller] += auction.highestBidEth;
            } else if (auction.highestBidERC20 > 0) {
                pendingERC20Returns[auction.highestBidToken][auction.seller] += auction.highestBidERC20;
            }
            emit AuctionEnded(auctionId, auction.highestBidder, auction.highestBidUsd);
        } else {
            IERC721(auction.nft).transferFrom(address(this), auction.seller, auction.tokenId);
            emit AuctionEnded(auctionId, address(0), 0);
        }
    }

    // 提现逻辑
    function withdraw() external nonReentrant {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "no funds");
        pendingReturns[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "withdraw failed");
        emit Withdraw(msg.sender, amount);
    }

    function withdrawERC20(address token) external nonReentrant {
        uint256 amount = pendingERC20Returns[token][msg.sender];
        require(amount > 0, "no funds");
        pendingERC20Returns[token][msg.sender] = 0;
        IERC20(token).safeTransfer(msg.sender, amount);
    }
    
    function ethToUsd(uint256 ethAmount) public view returns (uint256) {
        (, int256 price,,,) = ethPriceFeed.latestRoundData();
        require(price > 0, "invalid price");
        return (ethAmount * uint256(price)) / 1e18;
    }

    function erc20ToUsd(address token, uint256 amount) public view returns (uint256) {
        require(address(erc20PriceFeeds[token]) != address(0), "unsupported token");
        AggregatorV3Interface feed = erc20PriceFeeds[token];
        (, int256 price,,,) = feed.latestRoundData();
        require(price > 0, "invalid price");
        uint8 tokenDecimals = IERC20Metadata(token).decimals();
        return (amount * uint256(price)) / (10 ** tokenDecimals);
    }
}