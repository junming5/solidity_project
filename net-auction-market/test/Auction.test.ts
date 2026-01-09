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

    it("should refund previous ERC20 bid when outbid by ETH", async function () {
      const {
        seller,
        bidder1,
        bidder2,
        auction,
        nft,
        erc20,
        tokenId
      } = await deployFixture();

      // seller 创建拍卖
      await nft.connect(seller).approve(auction.target, tokenId);
      await auction.connect(seller).createAuction(
        nft.target,
        tokenId,
        3600
      );

      const auctionId = 0;

      // bidder1 使用 ERC20 出价（ERC20/USD = 1）
      const erc20Amount = ethers.parseEther("100"); // 100 USD

      await erc20.connect(bidder1).approve(
        auction.target,
        erc20Amount
      );

      await auction.connect(bidder1).bidWithERC20(
        auctionId,
        erc20.target,
        erc20Amount
      );

      // bidder2 用 1 ETH ≈ 2000 USD 顶掉 ERC20
      await auction.connect(bidder2).bid(auctionId, {
        value: ethers.parseEther("1")
      });

      // ERC20 被正确退回
      const pending = await auction.pendingERC20Returns(
        erc20.target,
        bidder1.address
      );

      expect(pending).to.equal(erc20Amount);
    });
    it("should refund previous ETH bid when outbid by ERC20", async function () {
      const { seller, bidder1, bidder2, auction, nft, erc20, tokenId } = await deployFixture();

      // seller 创建拍卖
      await nft.connect(seller).approve(auction.target, tokenId);
      await auction.connect(seller).createAuction(nft.target, tokenId, 3600);

      const auctionId = 0;

      // bidder1 ETH 出价
      const ethBid = ethers.parseEther("1"); // ≈ 2000 USD
      await auction.connect(bidder1).bid(auctionId, { value: ethBid });

      // bidder2 ERC20 出价更高 USD
      const erc20Bid = ethers.parseEther("2500"); // 2500 USD
      await erc20.connect(bidder2).approve(auction.target, erc20Bid);
      await auction.connect(bidder2).bidWithERC20(auctionId, erc20.target, erc20Bid);

      // 检查 ETH 被退回到 pendingReturns
      const pendingEth = await auction.pendingReturns(bidder1.address);
      expect(pendingEth).to.equal(ethBid);
    });

    it("should refund previous ETH bid when outbid by higher ETH", async function () {
      const { seller, bidder1, bidder2, auction, nft, tokenId } = await deployFixture();

      await nft.connect(seller).approve(auction.target, tokenId);
      await auction.connect(seller).createAuction(nft.target, tokenId, 3600);
      const auctionId = 0;

      const ethBid1 = ethers.parseEther("1");
      const ethBid2 = ethers.parseEther("2");

      await auction.connect(bidder1).bid(auctionId, { value: ethBid1 });
      await auction.connect(bidder2).bid(auctionId, { value: ethBid2 });

      const pendingEth = await auction.pendingReturns(bidder1.address);
      expect(pendingEth).to.equal(ethBid1);
    });

    it("should refund previous ERC20 bid when outbid by higher ERC20", async function () {
      const { seller, bidder1, bidder2, auction, nft, erc20, tokenId } = await deployFixture();

      await nft.connect(seller).approve(auction.target, tokenId);
      await auction.connect(seller).createAuction(nft.target, tokenId, 3600);
      const auctionId = 0;

      const erc20Bid1 = ethers.parseEther("1000");
      const erc20Bid2 = ethers.parseEther("2000");

      await erc20.connect(bidder1).approve(auction.target, erc20Bid1);
      await auction.connect(bidder1).bidWithERC20(auctionId, erc20.target, erc20Bid1);

      await erc20.connect(bidder2).approve(auction.target, erc20Bid2);
      await auction.connect(bidder2).bidWithERC20(auctionId, erc20.target, erc20Bid2);

      const pendingERC20 = await auction.pendingERC20Returns(erc20.target, bidder1.address);
      expect(pendingERC20).to.equal(erc20Bid1);
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

    it("should revert bid if auction already ended", async function () {
      const { seller, bidder1, auction, nft, tokenId } =
        await deployFixture();

      await nft.connect(seller).approve(auction.target, tokenId);
      await auction.connect(seller).createAuction(nft.target, tokenId, 1);

      // 等拍卖结束
      await ethers.provider.send("evm_increaseTime", [2]);
      await ethers.provider.send("evm_mine", []);

      // 已结束，再出价应该失败
      await expect(
        auction.connect(bidder1).bid(0, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWith("auction ended");
    });

    it("should refund previous ETH bid when outbid by higher ETH", async function () {
      const { seller, bidder1, bidder2, auction, nft, tokenId } =
        await deployFixture();

      await nft.connect(seller).approve(auction.target, tokenId);
      await auction.connect(seller).createAuction(nft.target, tokenId, 3600);

      // bidder1 ETH 1
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });

      // bidder2 ETH 2
      await auction.connect(bidder2).bid(0, { value: ethers.parseEther("2") });

      const pending = await auction.pendingReturns(bidder1.address);
      expect(pending).to.equal(ethers.parseEther("1"));
    });

    it("should refund previous ERC20 bid when outbid by higher ERC20", async function () {
      const { seller, bidder1, bidder2, auction, nft, tokenId, erc20 } =
        await deployFixture();

      await nft.connect(seller).approve(auction.target, tokenId);
      await auction.connect(seller).createAuction(nft.target, tokenId, 3600);

      // bidder1 ERC20 100
      await erc20.connect(bidder1).approve(auction.target, ethers.parseEther("100"));
      await auction.connect(bidder1).bidWithERC20(0, erc20.target, ethers.parseEther("100"));

      // bidder2 ERC20 200
      await erc20.connect(bidder2).approve(auction.target, ethers.parseEther("200"));
      await auction.connect(bidder2).bidWithERC20(0, erc20.target, ethers.parseEther("200"));

      const pending = await auction.pendingERC20Returns(erc20.target, bidder1.address);
      expect(pending).to.equal(ethers.parseEther("100"));
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

  describe("Auction V2 Branch Tests", function () {
    it("should revert ETH bid below minBidUsd", async function () {
      const { seller, bidder1, auction, nft, tokenId } = await deployFixture();

      // upgrade to V2
      const AuctionV2 = await ethers.getContractFactory("AuctionV2");
      const auctionV2 = await upgrades.upgradeProxy(auction.target, AuctionV2);
      await auctionV2.initializeV2(ethers.parseEther("1500")); // min 1500 USD

      await nft.connect(seller).approve(auctionV2.target, tokenId);
      await auctionV2.connect(seller).createAuction(nft.target, tokenId, 3600);

      await expect(
        auctionV2.connect(bidder1).bid(0, { value: ethers.parseEther("0.5") }) // ≈1000 USD
      ).to.be.revertedWith("below min bid");
    });
    it("should allow initializeV2 with 0 minBidUsd", async function () {
        const { auction } = await deployFixture();

        const AuctionV2 = await ethers.getContractFactory("AuctionV2");
        const auctionV2 = await upgrades.upgradeProxy(
          auction.target,
          AuctionV2
        );

        // minBidUsd = 0
        await auctionV2.initializeV2(0);

        expect(await auctionV2.minBidUsd()).to.equal(0);
      });
      
    it("should revert ERC20 bid below minBidUsd", async function () {
      const { seller, bidder1, auction, nft, erc20, tokenId } = await deployFixture();

      const AuctionV2 = await ethers.getContractFactory("AuctionV2");
      const auctionV2 = await upgrades.upgradeProxy(auction.target, AuctionV2);
      await auctionV2.initializeV2(ethers.parseEther("1500")); // min 1500 USD

      await nft.connect(seller).approve(auctionV2.target, tokenId);
      await auctionV2.connect(seller).createAuction(nft.target, tokenId, 3600);

      const lowBid = ethers.parseEther("1000"); // < minBidUsd
      await erc20.connect(bidder1).approve(auctionV2.target, lowBid);

      await expect(
        auctionV2.connect(bidder1).bidWithERC20(0, erc20.target, lowBid)
      ).to.be.revertedWith("below min bid");
    });

    it("should accept ETH bid above minBidUsd", async function () {
      const { seller, bidder1, auction, nft, tokenId } = await deployFixture();

      const AuctionV2 = await ethers.getContractFactory("AuctionV2");
      const auctionV2 = await upgrades.upgradeProxy(auction.target, AuctionV2);
      await auctionV2.initializeV2(ethers.parseEther("1500"));

      await nft.connect(seller).approve(auctionV2.target, tokenId);
      await auctionV2.connect(seller).createAuction(nft.target, tokenId, 3600);

      await expect(
        auctionV2.connect(bidder1).bid(0, { value: ethers.parseEther("1") }) // 2000 USD > 1500 USD
      ).to.not.be.reverted;

      const auctionData = await auctionV2.auctions(0);
      expect(auctionData.highestBidUsd).to.be.gt(ethers.parseEther("1500"));
    });

    it("should accept ERC20 bid above minBidUsd", async function () {
      const { seller, bidder1, auction, nft, erc20, tokenId } = await deployFixture();

      const AuctionV2 = await ethers.getContractFactory("AuctionV2");
      const auctionV2 = await upgrades.upgradeProxy(auction.target, AuctionV2);
      await auctionV2.initializeV2(ethers.parseEther("1500"));

      await nft.connect(seller).approve(auctionV2.target, tokenId);
      await auctionV2.connect(seller).createAuction(nft.target, tokenId, 3600);

      const highBid = ethers.parseEther("2000"); // > minBidUsd
      await erc20.connect(bidder1).approve(auctionV2.target, highBid);

      await expect(
        auctionV2.connect(bidder1).bidWithERC20(0, erc20.target, highBid)
      ).to.not.be.reverted;

      const auctionData = await auctionV2.auctions(0);
      expect(auctionData.highestBidUsd).to.be.gt(ethers.parseEther("1500"));
    });

    it("should refund previous bid correctly in V2 after minBidUsd enforced", async function () {
      const { seller, bidder1, bidder2, auction, nft, erc20, tokenId } = await deployFixture();

      const AuctionV2 = await ethers.getContractFactory("AuctionV2");
      const auctionV2 = await upgrades.upgradeProxy(auction.target, AuctionV2);
      await auctionV2.initializeV2(ethers.parseEther("1500"));

      await nft.connect(seller).approve(auctionV2.target, tokenId);
      await auctionV2.connect(seller).createAuction(nft.target, tokenId, 3600);

      // bidder1 ERC20 出价 2000 USD
      const bid1 = ethers.parseEther("2000");
      await erc20.connect(bidder1).approve(auctionV2.target, bid1);
      await auctionV2.connect(bidder1).bidWithERC20(0, erc20.target, bid1);

      // bidder2 用更高 ETH 出价 2.5 ETH ≈ 5000 USD
      await auctionV2.connect(bidder2).bid(0, { value: ethers.parseEther("2.5") });

      const pendingERC20 = await auctionV2.pendingERC20Returns(erc20.target, bidder1.address);
      expect(pendingERC20).to.equal(bid1);
    });

    it("should allow minBidUsd = 0", async function () {
      const { seller, bidder1, auction, nft, tokenId } = await deployFixture();

      const AuctionV2 = await ethers.getContractFactory("AuctionV2");
      const auctionV2 = await upgrades.upgradeProxy(auction.target, AuctionV2);
      await auctionV2.initializeV2(0); // 0 USD

      await nft.connect(seller).approve(auctionV2.target, tokenId);
      await auctionV2.connect(seller).createAuction(nft.target, tokenId, 3600);

      await expect(
        auctionV2.connect(bidder1).bid(0, { value: ethers.parseEther("0.01") })
      ).to.not.be.reverted;
    });

    it("should revert ETH bid below minBidUsd in V2", async function () {
      const { seller, bidder1, auction, nft, tokenId } = await deployFixture();

      const AuctionV2 = await ethers.getContractFactory("AuctionV2");
      const auctionV2 = await upgrades.upgradeProxy(auction.target, AuctionV2);
      await auctionV2.initializeV2(ethers.parseEther("1500")); // min USD

      await nft.connect(seller).approve(auctionV2.target, tokenId);
      await auctionV2.connect(seller).createAuction(nft.target, tokenId, 3600);

      // ETH bid 0.5 < 1500 USD
      await expect(
        auctionV2.connect(bidder1).bid(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("below min bid");
    });

    it("should revert ERC20 bid below minBidUsd in V2", async function () {
      const { seller, bidder1, auction, nft, tokenId, erc20 } = await deployFixture();

      const AuctionV2 = await ethers.getContractFactory("AuctionV2");
      const auctionV2 = await upgrades.upgradeProxy(auction.target, AuctionV2);
      await auctionV2.initializeV2(ethers.parseEther("1500")); // min USD

      await nft.connect(seller).approve(auctionV2.target, tokenId);
      await auctionV2.connect(seller).createAuction(nft.target, tokenId, 3600);

      await erc20.connect(bidder1).approve(auctionV2.target, ethers.parseEther("1000"));
      await expect(
        auctionV2.connect(bidder1).bidWithERC20(0, erc20.target, ethers.parseEther("1000"))
      ).to.be.revertedWith("below min bid");
    });
  });

  describe("MockV3Aggregator Edge Cases", function () {
    it("should return 0 price correctly", async function () {
      const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
      const aggregator = await MockV3Aggregator.deploy(8, 0); // price = 0

      const [, answer] = await aggregator.latestRoundData();
      expect(answer).to.equal(0);
    });

    it("should handle small decimals correctly", async function () {
      const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
      const aggregator = await MockV3Aggregator.deploy(2, 12345); // 2 decimals

      const [, answer] = await aggregator.latestRoundData();
      expect(answer).to.equal(12345);
      expect(await aggregator.decimals()).to.equal(2);
    });

    it("should handle large decimals correctly", async function () {
      const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
      const aggregator = await MockV3Aggregator.deploy(
        18,
        ethers.parseUnits("2000", 18)
      );

      const [, answer] = await aggregator.latestRoundData();
      expect(answer).to.equal(ethers.parseUnits("2000", 18));
      expect(await aggregator.decimals()).to.equal(18);
    });

    const MaxUint256 = 2n ** 255n - 1n;
    it("should handle max uint as price (simulate 'negative')", async function () {
      const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");

      // 部署 MockV3Aggregator，初始价格为 MaxUint256
      const aggregator = await MockV3Aggregator.deploy(8, MaxUint256);

      // latestRoundData 返回 (roundId, answer, startedAt, updatedAt, answeredInRound)
      const [, answer] = await aggregator.latestRoundData();

      expect(answer).to.equal(MaxUint256);
    });

    it("should integrate with Auction price feed correctly (price = 0)", async function () {
      const { owner, bidder1, nft, auction, tokenId } = await deployFixture();

      // 部署价格为 0 的 MockV3Aggregator
      const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
      const ethFeedZero = await MockV3Aggregator.deploy(8, 0);

      // 重新部署 Auction，使用价格为 0 的 feed
      const Auction = await ethers.getContractFactory("Auction");
      const auctionZero = await upgrades.deployProxy(Auction, [ethFeedZero.target], { kind: "uups" });

      expect(await auctionZero.ethPriceFeed()).to.equal(ethFeedZero.target);

      await nft.connect(owner).mint(owner.address);
      await nft.connect(owner).approve(auctionZero.target, 1);

      // 创建拍卖
      await auctionZero.createAuction(nft.target, 1, 3600); // tokenId = 0, duration = 1h

      // 尝试出价，价格为 0，USD 计算失败，应 revert "bid too low"
      await expect(
        auctionZero.connect(bidder1).bid(0, { value: ethers.parseEther("1") })
      ).to.be.revertedWith("invalid price");
    });
  });
});