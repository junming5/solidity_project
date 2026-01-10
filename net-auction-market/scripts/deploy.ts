import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. 部署 NFT 合约
  const XMNFT = await ethers.getContractFactory("XMNFT");
  const nft = await XMNFT.deploy();
  await nft.waitForDeployment();
  console.log("NFT deployed to:", await nft.getAddress());

  // 2. 部署 V1 代理合约 (假设 Sepolia 上的 ETH/USD 喂价地址为 0x694AA...)
  const ethPriceFeed = "0x694AA1769357215DE4FAC081bf1f309aDC325306"; 
  const Auction = await ethers.getContractFactory("Auction");
  
  console.log("Deploying Auction V1 Proxy...");
  const proxy = await upgrades.deployProxy(Auction, [ethPriceFeed], {
    kind: "uups",
  });
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("Auction V1 Proxy deployed to:", proxyAddress);

  // 3. 执行升级到 V2
  console.log("Preparing upgrade to V2...");
  const AuctionV2 = await ethers.getContractFactory("AuctionV2");
  
  // 升级并调用 V2 的 reinitializer (设置最小出价为 $10)
  const minBidUsd = 10 * 10**8; // $10 (8位精度)
  await upgrades.upgradeProxy(proxyAddress, AuctionV2, {
    call: { fn: "initializeV2", args: [minBidUsd] },
  });
  
  console.log("Auction upgraded to V2 at:", proxyAddress);
  console.log("Upgrade successful!");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});