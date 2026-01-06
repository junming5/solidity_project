import { ethers } from "hardhat";

async function main() {
  const [seller, bidder1, bidder2] = await ethers.getSigners();

  console.log("Seller:", seller.address);
  console.log("Bidder1:", bidder1.address);
  console.log("Bidder2:", bidder2.address);

  // 部署 MockV3Aggregator
  const MockFactory = await ethers.getContractFactory("MockV3Aggregator");
  const mock = await MockFactory.deploy(8, 2000_00000000n);
  await mock.waitForDeployment();
  console.log("MockV3Aggregator deployed at:", await mock.getAddress());

  // 部署 NFT
  const NFTFactory = await ethers.getContractFactory("XMNFT");
  const nft = await NFTFactory.deploy();
  await nft.waitForDeployment();
  console.log("XMNFT deployed at:", await nft.getAddress());

  // mint NFT 给 seller
  const mintTx = await nft.mint(seller.address);
  await mintTx.wait();
  console.log("Minted NFT tokenId 0 to:", seller.address);

  // 部署 Auction
  const AuctionFactory = await ethers.getContractFactory("Auction");
  const auction = await AuctionFactory.deploy(await mock.getAddress());
  await auction.waitForDeployment();
  console.log("Auction deployed at:", await auction.getAddress());

  // 授权 Auction 管理 NFT
  const approveTx = await nft.connect(seller).approve(await auction.getAddress(), 0);
  await approveTx.wait();
  console.log("Approved Auction to manage tokenId 0");

  // 创建拍卖
  const createTx = await auction.connect(seller).createAuction(await nft.getAddress(), 0, 3600);
  await createTx.wait();
  console.log("Auction created for NFT tokenId 0");

  // Helper: 打印当前拍卖状态
  async function printStatus() {
    const item = await auction.auctions(0);
    const pending1 = await auction.pendingReturns(bidder1.address);
    const pending2 = await auction.pendingReturns(bidder2.address);
    console.log("---- Auction Status ----");
    console.log("Highest Bidder:", item.highestBidder);
    console.log("Highest Bid (ETH):", ethers.formatEther(item.highestBidEth));
    console.log("Bidder1 pendingReturns:", ethers.formatEther(pending1), "ETH");
    console.log("Bidder2 pendingReturns:", ethers.formatEther(pending2), "ETH");
    console.log("------------------------");
  }

  // 出价流程
  console.log("Bidder1 bids 1 ETH");
  await (await auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") })).wait();
  await printStatus();

  console.log("Bidder2 bids 2 ETH");
  await (await auction.connect(bidder2).bid(0, { value: ethers.parseEther("2") })).wait();
  await printStatus();

  // 快进时间 1 小时
  await ethers.provider.send("evm_increaseTime", [3600]);
  await ethers.provider.send("evm_mine", []);

  // 结束拍卖
  await (await auction.endAuction(0)).wait();
  console.log("Auction ended");

  // 提取资金
  const sellerBalanceBefore = await ethers.provider.getBalance(seller.address);
  await (await auction.connect(seller).withdraw()).wait();
  const sellerBalanceAfter = await ethers.provider.getBalance(seller.address);

  const bidder1BalanceBefore = await ethers.provider.getBalance(bidder1.address);
  await (await auction.connect(bidder1).withdraw()).wait();
  const bidder1BalanceAfter = await ethers.provider.getBalance(bidder1.address);

  console.log("NFT owner after auction:", await nft.ownerOf(0));
  console.log("Seller balance increase:", ethers.formatEther(sellerBalanceAfter - sellerBalanceBefore), "ETH");
  console.log("Bidder1 refunded:", ethers.formatEther(bidder1BalanceAfter - bidder1BalanceBefore), "ETH");

  console.log("✅ Demo finished");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});