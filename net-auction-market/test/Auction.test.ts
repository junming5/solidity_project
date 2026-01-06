import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Auction", function () {
  // 部署 Fixture
  async function deployFixture() {
    const [seller, bidder1, bidder2] = await ethers.getSigners();

    // 部署 MockV3Aggregator
    const MockFactory = await ethers.getContractFactory("MockV3Aggregator");
    const mock = await MockFactory.deploy(8, 2000_00000000n);
    await mock.waitForDeployment();

    // 部署 NFT
    const NFTFactory = await ethers.getContractFactory("XMNFT");
    const nft = await NFTFactory.deploy();
    await nft.waitForDeployment();

    // mint NFT 给 seller
    await nft.mint(seller.address);

    // 部署 Auction
    const AuctionFactory = await ethers.getContractFactory("Auction");
    const auction = await upgrades.deployProxy(
      AuctionFactory,
      [await mock.getAddress()],
      { kind: "uups" }
    );
    await auction.waitForDeployment();

    // 授权 Auction 操作 NFT
    await nft.connect(seller).approve(await auction.getAddress(), 0);

    return { seller, bidder1, bidder2, nft, auction };
  }

  describe("createAuction", function () {
    it("should create auction successfully", async function () {
      const { seller, nft, auction } = await deployFixture();

      await auction.connect(seller).createAuction(await nft.getAddress(), 0, 3600);

      const item = await auction.auctions(0);
      expect(item.seller).to.equal(seller.address);
      expect(item.nft).to.equal(await nft.getAddress());
      expect(item.tokenId).to.equal(0);
      expect(item.ended).to.equal(false);
    });
  });

  describe("bidding", function () {
    it("should allow users to place bids and update highestBid", async function () {
      const { seller, bidder1, bidder2, nft, auction } = await deployFixture();

      await auction.connect(seller).createAuction(await nft.getAddress(), 0, 3600);

      await expect(() =>
        auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") })
      ).to.changeEtherBalance(bidder1, -ethers.parseEther("1"));

      let item = await auction.auctions(0);
      expect(item.highestBidder).to.equal(bidder1.address);
      expect(item.highestBidEth).to.equal(ethers.parseEther("1"));

      await expect(() =>
        auction.connect(bidder2).bid(0, { value: ethers.parseEther("2") })
      ).to.changeEtherBalance(bidder2, -ethers.parseEther("2"));

      item = await auction.auctions(0);
      expect(item.highestBidder).to.equal(bidder2.address);
      expect(item.highestBidEth).to.equal(ethers.parseEther("2"));

      // bidder1 可以提取退回的出价
      const pending = await auction.pendingReturns(bidder1.address);
      expect(pending).to.equal(ethers.parseEther("1"));
    });
  });

  describe("endAuction & withdraw", function () {
    it("should transfer NFT to winner and allow withdraws", async function () {
      const { seller, bidder1, nft, auction } = await deployFixture();

      await auction.connect(seller).createAuction(await nft.getAddress(), 0, 3600);
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });

      // 快进时间 1 小时
      await ethers.provider.send("evm_increaseTime", [3600]);
      await ethers.provider.send("evm_mine", []);

      // 结束拍卖
      await auction.endAuction(0);

      // NFT 属于最高出价者
      expect(await nft.ownerOf(0)).to.equal(bidder1.address);

      // 卖家 withdraw，使用 changeEtherBalance 自动处理 gas
      await expect(() => auction.connect(seller).withdraw())
        .to.changeEtherBalance(seller, ethers.parseEther("1"));
    });
  });
});