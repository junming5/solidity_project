import { expect } from "chai";
import { ethers, upgrades } from "hardhat";

describe("Auction UUPS Upgrade Test", function () {
  async function deployFixture() {
    const [owner, seller, bidder] = await ethers.getSigners();

    /** 1️⃣ 部署 Mock Price Feed */
    const MockV3 = await ethers.getContractFactory("MockV3Aggregator");
    // 2000 USD, 8 decimals (Chainlink ETH/USD 常见)
    const mockFeed = await MockV3.deploy(8, 2000_00000000);
    await mockFeed.waitForDeployment();

    /** 2️⃣ 部署 Auction V1（UUPS Proxy） */
    const AuctionV1 = await ethers.getContractFactory("Auction");

    const auction = await upgrades.deployProxy(
      AuctionV1,
      [await mockFeed.getAddress()],
      { initializer: "initialize", kind: "uups" }
    );

    await auction.waitForDeployment();

    return {
      auction,
      mockFeed,
      owner,
      seller,
      bidder,
    };
  }

  it("should upgrade Auction V1 to V2 and enable minBidUsd", async function () {
    const { auction, owner, bidder } = await deployFixture();

    /** 🔍 V1 状态验证 */
    expect(await auction.priceFeed()).to.not.equal(ethers.ZeroAddress);

    /** 3️⃣ 升级到 V2 */
    const AuctionV2 = await ethers.getContractFactory("AuctionV2");

    const auctionV2 = await upgrades.upgradeProxy(
      await auction.getAddress(),
      AuctionV2
    );

    /** 4️⃣ 调用 V2 初始化函数 */
    const minBidUsd = ethers.parseUnits("100", 18); // $100
    await auctionV2.initializeV2(minBidUsd);

    /** 5️⃣ 验证新变量 */
    expect(await auctionV2.minBidUsd()).to.equal(minBidUsd);

    /** 6️⃣ 验证版本函数（确认代码已切换） */
    expect(await auctionV2.version()).to.equal("Auction V2");

    /** 7️⃣ 验证新逻辑：低于最小 USD 出价会失败 */
    // ETH = $2000, 0.01 ETH = $20
    await expect(
      auctionV2.connect(bidder).bid(0, {
        value: ethers.parseEther("0.01"),
      })
    ).to.be.revertedWith("below min bid");
  });
});