import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer, bidder1, bidder2] = await ethers.getSigners();

  console.log("Deploying contracts with account:", deployer.address);

  // ===============================
  // 1️⃣ 部署 NFT
  // ===============================
  const XMNFT = await ethers.getContractFactory("XMNFT");
  const nft = await XMNFT.deploy();
  await nft.waitForDeployment?.();
  const nftAddress = nft.target ?? (await nft.getAddress());
  console.log("XMNFT deployed at:", nftAddress);

  // ===============================
  // 2️⃣ 部署 MockV3Aggregator (ETH/USD)
  // ===============================
  const MockV3Aggregator = await ethers.getContractFactory("MockV3Aggregator");
  const ethFeed = await MockV3Aggregator.deploy(8, 2000_00000000n); // 2000 USD
  await ethFeed.waitForDeployment?.();
  const ethFeedAddress = ethFeed.target ?? (await ethFeed.getAddress());
  console.log("MockV3Aggregator deployed at:", ethFeedAddress);

  // ===============================
  // 3️⃣ 部署 Auction V1
  // ===============================
  const Auction = await ethers.getContractFactory("Auction");
  const auctionV1 = await upgrades.deployProxy(Auction, [ethFeedAddress], { kind: "uups" });
  await auctionV1.waitForDeployment?.();
  const auctionV1Address = auctionV1.target ?? (await auctionV1.getAddress());
  console.log("Auction V1 deployed at:", auctionV1Address);

  // ===============================
  // 4️⃣ Mint NFT 给 deployer
  // ===============================
  const txMint = await nft.mint(deployer.address);
  const receiptMint = await txMint.wait();
  if (!receiptMint) throw new Error("Mint transaction receipt is null");

  // 解析 Transfer 事件，获取 tokenId
  let tokenId: bigint | undefined;
  for (const log of receiptMint.logs) {
    const parsed = nft.interface.parseLog(log);
    if (parsed && parsed.name === "Transfer") {
      tokenId = parsed.args.tokenId as bigint;
      break;
    }
  }
  if (tokenId === undefined) throw new Error("Transfer event not found");

  console.log(`NFT minted to deployer, tokenId = ${tokenId}`);

  // ===============================
  // 5️⃣ approve Auction 操作 NFT
  // ===============================
  await nft.approve(auctionV1Address, tokenId);
  console.log("NFT approved to Auction V1");

  // ===============================
  // 6️⃣ 创建拍卖
  // ===============================
  const duration = 3600; // 1 hour
  await auctionV1.createAuction(nftAddress, tokenId, duration);
  console.log("Auction created in V1");

  // ===============================
  // 7️⃣ 升级到 V2
  // ===============================
  const AuctionV2 = await ethers.getContractFactory("AuctionV2");
  const auctionV2 = await upgrades.upgradeProxy(auctionV1Address, AuctionV2);
  await auctionV2.waitForDeployment?.();
  const auctionV2Address = auctionV2.target ?? (await auctionV2.getAddress());
  console.log("Auction upgraded to V2 at:", auctionV2Address);

  // ===============================
  // 8️⃣ 初始化 V2 参数 (minBidUsd)
  // ===============================
  const minBidUsd = ethers.parseUnits("5", 8); // 5 USD
  await auctionV2.initializeV2(minBidUsd);
  console.log(`Auction V2 initialized with minBidUsd = ${minBidUsd}`);

  // ===============================
  // 9️⃣ 部署 Mock ERC20 token
  // ===============================
  const MockERC20 = await ethers.getContractFactory("MockERC20");
  const erc20 = await MockERC20.deploy("Mock Token", "MCK", ethers.parseEther("1000000"));
  await erc20.waitForDeployment?.();
  const erc20Address = erc20.target ?? (await erc20.getAddress());
  console.log("MockERC20 deployed at:", erc20Address);

  // 分发 ERC20 给 bidders
  const bidAmount = ethers.parseEther("100"); // 100 MCK
  await erc20.transfer(bidder1.address, bidAmount);
  await erc20.transfer(bidder2.address, bidAmount);
  console.log("ERC20 transferred to bidders");

  // ===============================
  // 10️⃣ 设置 ERC20 价格 feed (1 ERC20 = 1 USD)
  // ===============================
  const erc20Feed = await MockV3Aggregator.deploy(8, 1_00000000n);
  await erc20Feed.waitForDeployment?.();
  const erc20FeedAddress = erc20Feed.target ?? (await erc20Feed.getAddress());
  await auctionV2.setERC20PriceFeed(erc20Address, erc20FeedAddress);
  console.log("ERC20 price feed set");

  // ===============================
  // 11️⃣ 出价流程（调整出价保证超过 minBidUsd 和当前最高出价）
  // ===============================
  // bidder1 用 ETH 出价（0.01 ETH ≈ 20 USD）
  await auctionV2.connect(bidder1).bid(0, { value: ethers.parseEther("0.01") });
  console.log("Bidder1 placed ETH bid");

  // bidder2 用 ERC20 出价超过 ETH（25 MCK ≈ 25 USD）
  await erc20.connect(bidder2).approve(auctionV2Address, ethers.parseEther("25"));
  await auctionV2.connect(bidder2).bidWithERC20(0, erc20Address, ethers.parseEther("25"));
  console.log("Bidder2 outbid with ERC20");

  // bidder1 再用 ETH 出价超越 ERC20（0.02 ETH ≈ 40 USD）
  await auctionV2.connect(bidder1).bid(0, { value: ethers.parseEther("0.02") });
  console.log("Bidder1 outbid with higher ETH");

  // ===============================
  // 12️⃣ 拍卖结束
  // ===============================
  // 时间跳过 2 小时，让拍卖结束
  await ethers.provider.send("evm_increaseTime", [7200]);
  await ethers.provider.send("evm_mine", []);

  await auctionV2.endAuction(0); // ✅ 只需要 auctionId
  console.log("Auction ended, NFT and funds transferred");

  // ===============================
  // 13️⃣ 查询最终 NFT 拥有者
  // ===============================
  const ownerOfNFT = await nft.ownerOf(tokenId);
  console.log("NFT final owner:", ownerOfNFT);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});