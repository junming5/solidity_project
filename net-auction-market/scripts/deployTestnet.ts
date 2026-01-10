const { ethers, upgrades } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // --- 1. 部署 XMNFT ---
  const XMNFT = await ethers.getContractFactory("XMNFT");
  const nft = await XMNFT.deploy();
  await nft.waitForDeployment();
  console.log("XMNFT deployed to:", await nft.getAddress());

  // --- 2. 部署 MockERC20 (作为测试代币) ---
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const mockUSDT = await MockERC20.deploy("Mock USDT", "mUSDT", ethers.parseEther("1000000"));
  await mockUSDT.waitForDeployment();
  console.log("MockERC20 deployed to:", await mockUSDT.getAddress());

  // 1. 部署 V1 代理
  const ETH_USD_FEED = "0x694AA1769357215DE4FAC081bf1f309aDC325306";
  const Auction = await ethers.getContractFactory("Auction");
  const proxy = await upgrades.deployProxy(Auction, [ETH_USD_FEED], { kind: "uups" });
  await proxy.waitForDeployment();
  const proxyAddress = await proxy.getAddress();
  console.log("V1 Proxy at:", proxyAddress);

  // 2. 准备升级到 V2
  console.log("Preparing upgrade to V2...");
  const AuctionV2 = await ethers.getContractFactory("AuctionV2");

  // 3. 执行升级并调用 initializeV2
  // 注意：这里使用 10 * 10**8 是因为 Chainlink ETH/USD 通常是 8 位小数
  const upgradeTx = await upgrades.upgradeProxy(proxyAddress, AuctionV2, {
    call: { fn: "initializeV2", args: [1000000000] } 
  });

  // 【关键修改 1】等待升级交易被区块确认
  console.log("Waiting for upgrade transaction to be mined...");
  await upgradeTx.waitForDeployment(); 

  // 【关键修改 2】强制等待一段时间 (Sepolia 节点同步较慢)
  console.log("Waiting for RPC nodes to sync status...");
  await new Promise((resolve) => setTimeout(resolve, 15000)); // 等待 15 秒

  // 【关键修改 3】重新获取合约实例并显式连接 deployer
  const auctionV2 = AuctionV2.attach(proxyAddress).connect(deployer);

  try {
    const version = await auctionV2.version();
    console.log("Upgrade successful! Current version:", version);
    
    const minBid = await auctionV2.minBidUsd();
    console.log("Min Bid USD set to:", minBid.toString());
  } catch (err) {
    console.error("Read failed, but upgrade might have succeeded. Check Etherscan.");
    
    // 检查 err 是否为 Error 类型
    if (err instanceof Error) {
      console.error("Error details:", err.message);
    } else {
      console.error("An unexpected error occurred:", err);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });