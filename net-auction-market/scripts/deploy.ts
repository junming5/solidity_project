import { ethers } from "hardhat";

async function main() {
  // 1️⃣ 获取默认账户（Hardhat 本地自带的账户列表）
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // 2️⃣ 部署 MockV3Aggregator（模拟价格预言机）
  // 构造函数参数：小数位、初始价格
  const MockFactory = await ethers.getContractFactory("MockV3Aggregator");
  const mock = await MockFactory.deploy(8, 2000_00000000n); // 2000 USD，18位精度
  await mock.waitForDeployment();
  console.log("MockV3Aggregator deployed to:", await mock.getAddress());

  // 3️⃣ 部署 NFT 合约 XMNFT
  const NFTFactory = await ethers.getContractFactory("XMNFT");
  const nft = await NFTFactory.deploy();
  await nft.waitForDeployment();
  console.log("XMNFT deployed to:", await nft.getAddress());

  // 4️⃣ 部署 Auction 合约，需要传 MockV3Aggregator 地址
  const AuctionFactory = await ethers.getContractFactory("Auction");
  const auction = await AuctionFactory.deploy(await mock.getAddress());
  await auction.waitForDeployment();
  console.log("Auction deployed to:", await auction.getAddress());

  // 5️⃣ 可选：mint 一个 NFT 给自己测试用
  const tx = await nft.mint(deployer.address);
  await tx.wait();
  console.log("Minted NFT tokenId 0 to:", deployer.address);

  // 6️⃣ 可选：授权 Auction 合约操作 NFT
  await nft.approve(await auction.getAddress(), 0);
  console.log("Approved Auction contract to manage tokenId 0");

  console.log("✅ All contracts deployed and ready!");
}

// 捕获错误
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});