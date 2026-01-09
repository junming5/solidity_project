import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Auction System (V1 + V2)", function () {
  async function deployFixture() {
    const [owner, seller, bidder1, bidder2] = await ethers.getSigners();

    // -----------------------
    // Deploy Mock Price Feeds
    // -----------------------
    const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");

    // ETH/USD = 2000 USD (8 decimals)
    const ethFeed = await MockV3Aggregator.deploy(8, ethers.parseUnits("2000", 8));
    // ERC20/USD = 1 USD
    const erc20Feed = await MockV3Aggregator.deploy(8, ethers.parseUnits("1", 8));

    // -----------------------
    // Deploy ERC20
    // -----------------------
    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const erc20 = await MockERC20.deploy(
      "MockUSD",
      "MUSD",
      ethers.parseEther("1000000")
    );

    // distribute ERC20
    await erc20.transfer(bidder1.address, ethers.parseEther("5000"));
    await erc20.transfer(bidder2.address, ethers.parseEther("5000"));

    // -----------------------
    // Deploy NFT
    // -----------------------
    const XMNFT = await ethers.getContractFactory("XMNFT");
    const nft = await XMNFT.deploy();

    // mint NFT to seller
    await nft.mint(seller.address);
    const tokenId = 0;

    // -----------------------
    // Deploy Auction V1 (UUPS)
    // -----------------------
    const Auction = await ethers.getContractFactory("Auction");
    const auction = await upgrades.deployProxy(
      Auction,
      [ethFeed.target],
      { kind: "uups" }
    );

    // set ERC20 price feed
    await auction.setERC20PriceFeed(erc20.target, erc20Feed.target);

    return {
      owner,
      seller,
      bidder1,
      bidder2,
      auction,
      nft,
      erc20,
      tokenId
    };
  }

  describe("Auction V1", function () {
    it("should create auction successfully", async function () {
      const { seller, auction, nft, tokenId } = await deployFixture();

      await nft.connect(seller).approve(auction.target, tokenId);

      await expect(
        auction.connect(seller).createAuction(
          nft.target,
          tokenId,
          3600
        )
      ).to.not.be.reverted;
    });

    it("should accept ETH bid and reject lower bids", async function () {
      const { seller, bidder1, bidder2, auction, nft, tokenId } =
        await deployFixture();

      await nft.connect(seller).approve(auction.target, tokenId);
      await auction.connect(seller).createAuction(nft.target, tokenId, 3600);

      // bidder1 bids 1 ETH (≈2000 USD)
      await auction.connect(bidder1).bid(0, {
        value: ethers.parseEther("1")
      });

      // bidder2 bids 0.5 ETH (≈1000 USD) -> fail
      await expect(
        auction.connect(bidder2).bid(0, {
          value: ethers.parseEther("0.5")
        })
      ).to.be.revertedWith("bid too low");
    });

    it("should accept ERC20 bid higher than ETH bid", async function () {
      const { seller, bidder1, bidder2, auction, nft, tokenId, erc20 } =
        await deployFixture();

      await nft.connect(seller).approve(auction.target, tokenId);
      await auction.connect(seller).createAuction(nft.target, tokenId, 3600);

      // ETH bid: 1 ETH = 2000 USD
      await auction.connect(bidder1).bid(0, {
        value: ethers.parseEther("1")
      });

      // ERC20 bid: 2500 USD
      await erc20.connect(bidder2).approve(
        auction.target,
        ethers.parseEther("2500")
      );

      await auction.connect(bidder2).bidWithERC20(
        0,
        erc20.target,
        ethers.parseEther("2500")
      );
      const auctionData = await auction.auctions(0);
      expect(auctionData.highestBidder).to.equal(bidder2.address);  
    });

    it("should end auction and transfer NFT + funds", async function () {
      const { seller, bidder1, auction, nft, tokenId } =
        await deployFixture();

      await nft.connect(seller).approve(auction.target, tokenId);
      await auction.connect(seller).createAuction(nft.target, tokenId, 10);

      await auction.connect(bidder1).bid(0, {
        value: ethers.parseEther("1")
      });

      // wait for auction end
      await ethers.provider.send("evm_increaseTime", [12]);
      await ethers.provider.send("evm_mine", []);

      await auction.endAuction(0);

      expect(await nft.ownerOf(tokenId)).to.equal(bidder1.address);
    });
  });

  describe("Auction V2 Upgrade", function () {
    it("should upgrade to V2 and enforce minBidUsd", async function () {
      const { seller, bidder1, auction, nft, tokenId } =
        await deployFixture();

      // upgrade
      const AuctionV2 = await ethers.getContractFactory("AuctionV2");
      const auctionV2 = await upgrades.upgradeProxy(
        auction.target,
        AuctionV2
      );

      // init V2
      await auctionV2.initializeV2(ethers.parseEther("1500")); // min 1500 USD

      expect(await auctionV2.version()).to.equal("Auction V2");

      await nft.connect(seller).approve(auctionV2.target, tokenId);
      await auctionV2.connect(seller).createAuction(
        nft.target,
        tokenId,
        3600
      );

      // bid 0.5 ETH ≈ 1000 USD -> fail
      await expect(
        auctionV2.connect(bidder1).bid(0, {
          value: ethers.parseEther("0.5")
        })
      ).to.be.revertedWith("below min bid");

      // bid 1 ETH ≈ 2000 USD -> success
      await expect(
        auctionV2.connect(bidder1).bid(0, {
          value: ethers.parseEther("1")
        })
      ).to.not.be.reverted;
    });
  });
});