import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
  Auction, AuctionV2, XMNFT, MockERC20, MockV3Aggregator
} from "../typechain-types";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";

describe("NFT 拍卖市场单元测试", function () {
  let auction: any;
  let nft: XMNFT;
  let mockUSDT: MockERC20;
  let ethPriceFeed: MockV3Aggregator;
  let owner: SignerWithAddress;
  let bidder1: SignerWithAddress;
  let bidder2: SignerWithAddress;

  const INITIAL_ETH_PRICE = 2000e8; // $2000

  beforeEach(async function () {
    [owner, bidder1, bidder2] = await ethers.getSigners();

    // 1. 部署 Mock 预言机
    const MockV3 = await ethers.getContractFactory("MockV3Aggregator");
    ethPriceFeed = await MockV3.deploy(8, INITIAL_ETH_PRICE);

    // 2. 部署 NFT 和 Mock 代币
    const XMNFT = await ethers.getContractFactory("XMNFT");
    nft = await XMNFT.deploy();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    mockUSDT = await MockERC20.deploy("Mock USDT", "mUSDT", ethers.parseEther("1000000"));

    // 3. 部署 Auction V1 代理
    const AuctionFactory = await ethers.getContractFactory("Auction");
    auction = await upgrades.deployProxy(AuctionFactory, [await ethPriceFeed.getAddress()], { kind: "uups" });
  });

  describe("V1 基础功能", function () {
    it("应该成功创建拍卖", async function () {
      await nft.mint(owner.address);
      await nft.approve(await auction.getAddress(), 0);

      await expect(auction.createAuction(await nft.getAddress(), 0, 3600))
        .to.not.be.reverted;

      const item = await auction.auctions(0);
      expect(item.seller).to.equal(owner.address);
    });

    it("ETH 出价应正确转换 USD 价值", async function () {
      await nft.mint(owner.address);
      await nft.approve(await auction.getAddress(), 0);
      await auction.createAuction(await nft.getAddress(), 0, 3600);

      // 出价 1 ETH ($2000)
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      const item = await auction.auctions(0);
      expect(item.highestBidUsd).to.equal(2000n * 10n ** 8n);
    });

    it("低价出价应该被拦截", async function () {
      await nft.mint(owner.address);
      await nft.approve(await auction.getAddress(), 0);
      await auction.createAuction(await nft.getAddress(), 0, 3600);

      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
      // 第二个人出 0.5 ETH 应该失败
      await expect(
        auction.connect(bidder2).bid(0, { value: ethers.parseEther("0.5") })
      ).to.be.revertedWith("bid too low");
    });

    it("应该允许使用 ERC20 代币出价", async function () {
      // 1. Mint 一个 NFT 给 owner
      const mintTx = await nft.mint(owner.address);
      const receipt = await mintTx.wait();

      const tokenId = 0;

      // 2. 授权给拍卖合约
      await nft.approve(await auction.getAddress(), tokenId);

      // 3. 创建拍卖
      await auction.createAuction(await nft.getAddress(), tokenId, 100000);
      const auctionId = 0; 

      // 4. 设置 ERC20 喂价 (1 USDT = $1)
      const MockV3 = await ethers.getContractFactory("MockV3Aggregator");
      const usdtPriceFeed = await MockV3.deploy(8, 100000000n); // $1, 8位精度
      await auction.setERC20PriceFeed(await mockUSDT.getAddress(), await usdtPriceFeed.getAddress());

      // 5. 准备 ERC20 代币和授权
      const bidAmount = ethers.parseEther("100"); // 100个代币
      await mockUSDT.transfer(bidder1.address, bidAmount);
      await mockUSDT.connect(bidder1).approve(await auction.getAddress(), bidAmount);

      // 6. 执行 ERC20 出价
      await auction.connect(bidder1).bidWithERC20(auctionId, await mockUSDT.getAddress(), bidAmount);

      // 7. 验证结果
      const item = await auction.auctions(auctionId);
      expect(item.highestBidder).to.equal(bidder1.address);
      expect(item.highestBidUsd).to.equal(100n * 10n ** 8n); // $100
    });
  });

  describe("完整业务流测试", function () {
    it("应该正确处理资金流转：退还旧出价者并支付给卖家", async function () {
      await nft.mint(owner.address);
      await nft.approve(await auction.getAddress(), 0);
      await auction.createAuction(await nft.getAddress(), 0, 3600);

      // 1. Bidder1 出价 1 ETH
      await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });

      // 2. Bidder2 出价 2 ETH
      await auction.connect(bidder2).bid(0, { value: ethers.parseEther("2") });

      // 验证 Bidder1 是否有 1 ETH 可提现
      expect(await auction.pendingReturns(bidder1.address)).to.equal(ethers.parseEther("1"));

      // 3. 推进时间到拍卖结束
      await ethers.provider.send("evm_increaseTime", [3601]);
      await ethers.provider.send("evm_mine", []);

      // 4. 结束拍卖
      await auction.endAuction(0);

      // 验证卖家是否有 2 ETH 可提现
      expect(await auction.pendingReturns(owner.address)).to.equal(ethers.parseEther("2"));

      // 验证 NFT 是否转移给了 Bidder2
      expect(await nft.ownerOf(0)).to.equal(bidder2.address);
    });

    it("应该允许用户提取退款", async function () {
      // 1. 动态准备环境：确保 TokenID 是新的
      await nft.mint(owner.address);
      const tokenId = (await nft.balanceOf(owner.address)) - 1n; // 获取最新的 ID
      await nft.approve(await auction.getAddress(), tokenId);

      // 2. 创建一个超长时长的拍卖 (10万秒)，防止测试中过期
      await auction.createAuction(await nft.getAddress(), tokenId, 100000);
      const auctionId = (await auction.auctionCount()) - 1n;

      // 3. 产生竞争出价
      await auction.connect(bidder1).bid(auctionId, { value: ethers.parseEther("1") });
      await auction.connect(bidder2).bid(auctionId, { value: ethers.parseEther("2") });

      // 4. 验证退款逻辑
      const beforeBalance = await ethers.provider.getBalance(bidder1.address);
      const tx = await auction.connect(bidder1).withdraw();
      const receipt = await tx.wait();

      const afterBalance = await ethers.provider.getBalance(bidder1.address);
      expect(afterBalance).to.be.gt(beforeBalance - ethers.parseEther("0.1")); // 大于之前(扣除一点gas)
    });

    it("无人出价时，拍卖结束应退回 NFT 给卖家", async function () {
      // 1. 准备环境
      await nft.mint(owner.address);
      const balance = await nft.balanceOf(owner.address);
      const tokenId = balance - 1n; // 使用最新的 ID
      await nft.approve(await auction.getAddress(), tokenId);

      // 2. 创建一个极短的拍卖 (10秒)
      await auction.createAuction(await nft.getAddress(), tokenId, 10);
      const auctionId = (await auction.auctionCount()) - 1n;

      // 3. 快进时间到结束
      await ethers.provider.send("evm_increaseTime", [20]);
      await ethers.provider.send("evm_mine", []);

      // 4. 结束拍卖
      await auction.endAuction(auctionId);

      // 5. 验证 NFT 归还
      expect(await nft.ownerOf(tokenId)).to.equal(owner.address);
    });
  });

  describe("UUPS 升级与 V2 功能", function () {
    it("应该能成功升级到 V2 并执行初始化", async function () {
      const AuctionV2Factory = await ethers.getContractFactory("AuctionV2");
      const minBid = 50n * 10n ** 8n; // $50

      const auctionV2 = await upgrades.upgradeProxy(await auction.getAddress(), AuctionV2Factory, {
        call: { fn: "initializeV2", args: [minBid] }
      });

      expect(await auctionV2.version()).to.equal("Auction V2");
      expect(await auctionV2.minBidUsd()).to.equal(minBid);
    });

    it("V2 应该拦截低于最小 USD 门槛的出价", async function () {
      const AuctionV2Factory = await ethers.getContractFactory("AuctionV2");
      const auctionV2 = await upgrades.upgradeProxy(await auction.getAddress(), AuctionV2Factory, {
        call: { fn: "initializeV2", args: [50n * 10n ** 8n] }
      });

      await nft.mint(owner.address);
      await nft.approve(await auction.getAddress(), 0);
      await auctionV2.createAuction(await nft.getAddress(), 0, 3600);

      // 故意出一个极低的价格 (例如 0.0001 ETH < $50)
      await expect(
        auctionV2.connect(bidder1).bid(0, { value: ethers.parseEther("0.0001") })
      ).to.be.revertedWith("below min bid");
    });
  });
});