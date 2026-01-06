import { expect } from "chai";
import { ethers } from "hardhat";

describe("Auction", function () {
  async function deployFixture() {
    const [seller, bidder1, bidder2] = await ethers.getSigners();

    const NFT = await ethers.getContractFactory("XMNFT");
    const nft = await NFT.deploy();

    const Auction = await ethers.getContractFactory("Auction");
    const auction = await Auction.deploy();

    // mint NFT 给卖家
    await nft.mint(seller.address);
    await nft.connect(seller).approve(auction.target, 0);

    return { seller, bidder1, bidder2, nft, auction };
  }

  describe("createAuction", function () {
    it("should create auction successfully", async function () {
      const { seller, nft, auction } = await deployFixture();

      await auction.connect(seller).createAuction(
        nft.target,
        0,
        3600
      );

      const item = await auction.auctions(0);

      expect(item.seller).to.equal(seller.address);
      expect(item.nft).to.equal(nft.target);
      expect(item.tokenId).to.equal(0);
      expect(item.ended).to.equal(false);
    });
  });

  it("should allow user to place a bid", async function () {
    const { seller, bidder1, nft, auction } = await deployFixture();

    // 卖家创建拍卖
    await auction.connect(seller).createAuction(nft.target, 0, 3600);

    // bidder1 出价 1 ETH
    await auction.connect(bidder1).bid(0, {
      value: ethers.parseEther("1"),
    });

    const item = await auction.auctions(0);

    expect(item.highestBidder).to.equal(bidder1.address);
    expect(item.highestBidEth).to.equal(ethers.parseEther("1"));
  });
  
  it("should record pendingReturns for previous bidder when outbid", async function () {
    const { seller, bidder1, bidder2, nft, auction } = await deployFixture();

    // 创建拍卖
    await auction.connect(seller).createAuction(nft.target, 0, 3600);

    // bidder1 出价 1 ETH
    await auction.connect(bidder1).bid(0, {
      value: ethers.parseEther("1"),
    });

    // bidder2 出价 2 ETH
    await auction.connect(bidder2).bid(0, {
      value: ethers.parseEther("2"),
    });

    // bidder1 的钱应进入 pendingReturns
    const pending = await auction.pendingReturns(bidder1.address);

    expect(pending).to.equal(ethers.parseEther("1"));
  });

  it("should end auction, transfer NFT to winner and pay seller", async function () {
    const { seller, bidder1, nft, auction } = await deployFixture();

    // 创建拍卖
    await auction.connect(seller).createAuction(nft.target, 0, 3600);

    // bidder1 出价 1 ETH
    await auction.connect(bidder1).bid(0, {
      value: ethers.parseEther("1"),
    });

    // 时间快进 1 小时
    await ethers.provider.send("evm_increaseTime", [3600]);
    await ethers.provider.send("evm_mine", []);

    // 结束拍卖
    await auction.endAuction(0);

    // NFT 应该属于 bidder1
    expect(await nft.ownerOf(0)).to.equal(bidder1.address);

    // 卖家应收到 ETH（进入 pendingReturns）
    const sellerPending = await auction.pendingReturns(seller.address);
    expect(sellerPending).to.equal(ethers.parseEther("1"));
  });
  
});

