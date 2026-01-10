import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("--------------------------------------------------");
  console.log("执行账户:", deployer.address);
  const balance = await deployer.provider!.getBalance(deployer.address);
  console.log("账户余额:", ethers.formatEther(balance), "ETH");
  console.log("--------------------------------------------------");

  // 1️⃣ 部署 NFT
  console.log("步骤 1: 正在部署 XMNFT...");
  const XMNFT = await ethers.getContractFactory("XMNFT");
  const nft = await XMNFT.deploy();
  await nft.waitForDeployment();
  console.log("NFT 已部署至:", nft.target);

  // 2️⃣ 部署 Mock Price Feed
  console.log("步骤 2: 正在部署 MockPriceFeed...");
  const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
  // 设定 ETH 价格为 $2000，精度 8 位
  const priceFeed = await MockV3Aggregator.deploy(8, 200000000000n);
  await priceFeed.waitForDeployment();
  console.log("MockPriceFeed 已部署至:", priceFeed.target);

  // 3️⃣ 部署 Auction V1 (UUPS 代理)
  console.log("步骤 3: 正在部署 Auction V1 代理...");
  const AuctionV1 = await ethers.getContractFactory("Auction");
  // 注意：initialize 只接收一个参数：priceFeed 地址
  const auctionProxy = await upgrades.deployProxy(AuctionV1, [priceFeed.target], {
    kind: "uups",
    initializer: "initialize",
  });
  await auctionProxy.waitForDeployment();
  const proxyAddress = await auctionProxy.getAddress();
  console.log("Auction V1 代理地址:", proxyAddress);

  // 准备工作：Mint NFT 并授权给代理合约
  console.log("正在进行 NFT 授权...");
  const mintTx = await nft.mint(deployer.address);
  await mintTx.wait(1); // 等待一个区块确认
  await nft.approve(proxyAddress, 0n);
  console.log("NFT Mint & Approve 完成 ✅");

  // 4️⃣ 升级到 V2
  console.log("--------------------------------------------------");
  console.log("步骤 4: 正在升级到 Auction V2...");
  const AuctionV2 = await ethers.getContractFactory("AuctionV2");
  const minBidUsdValue = 50 * 10**8; // 设置最小出价 $50

  const upgradeTx = await upgrades.upgradeProxy(proxyAddress, AuctionV2, {
    kind: "uups",
    call: { fn: "initializeV2", args: [minBidUsdValue] },
  });

  // 【关键点】等待升级交易在链上彻底确认（等待2个区块）
  console.log("等待升级交易在 Sepolia 上确认...");
  await upgradeTx.deploymentTransaction()?.wait(2); 

  // 【关键点】强制等待 25 秒，让 Sepolia 节点同步新的逻辑合约地址
  console.log("等待 RPC 节点同步 (25秒)... 请耐心等待");
  await new Promise((resolve) => setTimeout(resolve, 25000));

  // 5️⃣ 验证升级结果
  console.log("步骤 5: 验证 V2 函数调用...");
  // 显式连接到 V2 的 ABI
  const auctionV2Instance = AuctionV2.attach(proxyAddress) as any;

  try {
    const version = await auctionV2Instance.version();
    console.log("当前合约版本:", version);

    const minBid = await auctionV2Instance.minBidUsd();
    console.log("V2 最小出价已生效:", minBid.toString());
    console.log("\n🎉 所有流程已圆满完成！");
  } catch (err: any) {
    console.error("\n❌ 读取失败！原因可能是节点还没同步完。");
    console.error("报错内容:", err.message);
    console.log("提示: 虽然脚本读取报错，但你的合约可能已经升级成功了。");
    console.log("请去 Etherscan 检查代理地址的 Implementation 是否已更新。");
  }
}

main().catch((error) => {
  console.error("脚本执行出错:", error);
  process.exit(1);
});