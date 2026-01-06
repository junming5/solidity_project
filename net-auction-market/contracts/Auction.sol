// SPDX-License-Identifier: MIT
pragma solidity ^0.8.22;

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";

contract Auction is UUPSUpgradeable, OwnableUpgradeable {
    struct AuctionItem {
        address seller;
        address nft;
        uint256 tokenId;
        uint256 endTime;
        address highestBidder;
        uint256 highestBidEth;   // wei
        uint256 highestBidUsd;   // USD * 1e18
        bool ended;
    }

    uint256 public auctionCount;
    mapping(uint256 => AuctionItem) public auctions;
    mapping(address => uint256) public pendingReturns;

    AggregatorV3Interface public priceFeed;

    // constructor() {
    //     _disableInitializers();
    // }

    function initialize(address _priceFeed) public initializer {
        __Ownable_init(msg.sender);
        priceFeed = AggregatorV3Interface(_priceFeed);
    }

    function _authorizeUpgrade(address newImplementation)
        internal
        override
        onlyOwner
    {}

    /* ========== AUCTION LOGIC ========== */

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
            highestBidUsd: 0,
            ended: false
        });
    }

    function bid(uint256 auctionId) public payable virtual {
        AuctionItem storage auction = auctions[auctionId];

        require(block.timestamp < auction.endTime, "auction ended");
        require(!auction.ended, "already ended");
        require(msg.sender != auction.seller, "seller cannot bid");

        uint256 usdValue = ethToUsd(msg.value);
        require(usdValue > auction.highestBidUsd, "bid too low");

        if (auction.highestBidder != address(0)) {
            pendingReturns[auction.highestBidder] += auction.highestBidEth;
        }

        auction.highestBidder = msg.sender;
        auction.highestBidEth = msg.value;
        auction.highestBidUsd = usdValue;
    }

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
            pendingReturns[auction.seller] += auction.highestBidEth;
        } else {
            IERC721(auction.nft).transferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            );
        }
    }

    function withdraw() external {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "no funds");

        pendingReturns[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "withdraw failed");
    }

    /* ========== PRICE ========== */

    function ethToUsd(uint256 ethAmount) internal view returns (uint256) {
        (, int256 price,,,) = priceFeed.latestRoundData();
        require(price > 0, "invalid price");

        uint8 decimals = priceFeed.decimals();
        return ethAmount * uint256(price) / (10 ** decimals);
    }
}