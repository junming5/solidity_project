import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 1️⃣ 部署 NFT 合约
  const XMNFT = await ethers.getContractFactory("XMNFT");
  const nft = await XMNFT.deploy();
  await nft.waitForDeployment(); // ethers v6 用这个
  console.log("XMNFT deployed at:", nft.target);

  // 2️⃣ 部署 MockV3Aggregator (ETH/USD) 价格 feed
  const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
  const ethFeed = await MockV3Aggregator.deploy(8, 2000_00000000);
  await ethFeed.waitForDeployment();
  console.log("MockV3Aggregator deployed at:", ethFeed.target);

  // 3️⃣ 部署 V1 Auction 合约
  const Auction = await ethers.getContractFactory("Auction");
  const auctionV1 = await upgrades.deployProxy(Auction, [ethFeed.target], {
    kind: "uups",
  });
  await auctionV1.waitForDeployment();
  console.log("Auction V1 deployed at:", auctionV1.target);

  // 4️⃣ mint NFT 给 deployer
  const tokenId = 1;
  await nft.mint(deployer.address);
  console.log(`NFT minted to deployer, tokenId = ${tokenId}`);

  // 5️⃣ approve Auction 合约操作 NFT
  await nft.approve(auctionV1.target, tokenId);
  console.log("NFT approved to Auction V1");

  // 6️⃣ 创建拍卖 (V1)
  const duration = 3600; // 1 hour
  await auctionV1.createAuction(nft.target, tokenId, duration);
  console.log("Auction created in V1");

  // 7️⃣ 升级到 V2
  const AuctionV2 = await ethers.getContractFactory("AuctionV2");
  const auctionV2 = await upgrades.upgradeProxy(auctionV1.target, AuctionV2);
  await auctionV2.waitForDeployment();
  console.log("Auction upgraded to V2 at:", auctionV2.target);

  // 8️⃣ 初始化 V2 参数，例如设置 minBidUsd
  const minBidUsd = ethers.parseUnits("50", 8); // $50 min bid
  await auctionV2.initializeV2(minBidUsd);
  console.log(`Auction V2 initialized with minBidUsd = ${minBidUsd}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});