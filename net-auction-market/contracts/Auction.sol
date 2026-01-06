// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

interface IPriceFeed {
    function latestAnswer() external view returns (int256);
    function decimals() external view returns (uint8);
}

contract Auction is UUPSUpgradeable, OwnableUpgradeable {
    struct AuctionItem {
        address seller;          // 卖家
        address nft;             // NFT 合约地址
        uint256 tokenId;         // NFT ID
        uint256 endTime;         // 拍卖结束时间（时间戳）
        address highestBidder;   // 当前最高出价者
        
        uint256 highestBidEth;   // wei
        uint256 highestBidUsd;   // 
        
        bool ended;              // 是否已结束
    }

    uint256 public auctionCount;
    mapping(uint256 => AuctionItem) public auctions;

    mapping(address => uint256) public pendingReturns;

    IPriceFeed public priceFeed; // Chainlink 价格预言机

    constructor() {
        _disableInitializers();
    }
    function initialize(address _priceFeed) public initializer {
        __Ownable_init();
        priceFeed = IPriceFeed(_priceFeed);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
    
    event AuctionCreated(
        uint256 indexed auctionId,
        address indexed seller,
        address nft,
        uint256 tokenId,
        uint256 endTime
    );

    event BidPlaced(
        uint256 indexed auctionId,
        address indexed bidder,
        uint256 amountEth,
        uint256 amountUsd
    );

    event AuctionEnded(
        uint256 indexed auctionId,
        address winner,
        uint256 amountEth
    );

    function createAuction(
    address nft,
    uint256 tokenId,
    uint256 duration
    ) external returns (uint256 auctionId) {
        require(duration > 0, "duration must be > 0");

        auctionId = auctionCount;
        auctionCount++;

        IERC721Upgradeable(nft).transferFrom(msg.sender, address(this), tokenId);

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

        emit AuctionCreated(
            auctionId,
            msg.sender,
            nft,
            tokenId,
            block.timestamp + duration
        );
    }

    function bid(uint256 auctionId) external payable {
        AuctionItem storage auction = auctions[auctionId];
        require(auction.seller != address(0), "auction not exist");

        require(block.timestamp < auction.endTime, "auction ended");
        require(!auction.ended, "auction already ended");

        require(msg.sender != auction.seller, "seller cannot bid");

        uint256 usdValue = ethToUsd(msg.value);
        require(usdValue > auction.highestBidUsd, "bid too low");

        // 退回上一个最高价
        if (auction.highestBidder != address(0)) {
            // payable(auction.highestBidder).transfer(auction.highestBid);
            pendingReturns[auction.highestBidder] += auction.highestBidEth;
        }

        auction.highestBidder = msg.sender;
        auction.highestBidEth = msg.value;
        auction.highestBidUsd = usdValue;

        emit BidPlaced(auctionId, msg.sender, msg.value, usdValue);
    }

    function endAuction(uint256 auctionId) external {
        AuctionItem storage auction = auctions[auctionId];
        require(auction.seller != address(0), "auction not exist");

        require(block.timestamp >= auction.endTime, "auction not ended");
        require(!auction.ended, "already ended");

        auction.ended = true;

        if(auction.highestBidder != address(0)) {
            // NFT 给赢家
            IERC721Upgradeable(auction.nft).transferFrom(
                address(this),
                auction.highestBidder,
                auction.tokenId
            );
            // 钱给卖家 
            pendingReturns[auction.seller] += auction.highestBidEth;
            // payable(auction.seller).transfer(auction.highestBid);
        } else {
            // 没人出价，NFT 退回卖家
            IERC721Upgradeable(auction.nft).transferFrom(
                address(this),
                auction.seller,
                auction.tokenId
            );
        }
        
        emit AuctionEnded(
            auctionId,
            auction.highestBidder,
            auction.highestBidEth
        );
    }

    function withdraw() external {
        uint256 amount = pendingReturns[msg.sender];
        require(amount > 0, "no funds");

        pendingReturns[msg.sender] = 0;
        (bool ok, ) = msg.sender.call{value: amount}("");
        require(ok, "withdraw failed");

    }

    function ethToUsd(uint256 ethAmount) public view returns (uint256) {
        int256 price = getEthPriceUSD();
        require(price > 0, "Invalid price");

        uint8 priceDecimals = priceFeed.decimals();

        // ethAmount: wei (1e18)
        // price: USD * 10^priceDecimals
        // return: USD * 1e18
        return ethAmount * uint256(price) / (10 ** priceDecimals);
    }

    // 获取当前 ETH/USD 价格（示例，mock/chainlink 都可）
    function getEthPriceUSD() public view returns (int256) {
        return priceFeed.latestAnswer();
    }

}
