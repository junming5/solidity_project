import { ethers } from "hardhat";

async function main() {
  const [seller, bidder1, bidder2] = await ethers.getSigners();

  console.log("Deploying contracts...");

  // 部署 MockV3Aggregator
  const MockFactory = await ethers.getContractFactory("MockV3Aggregator");
  const mock = await MockFactory.deploy(8, 2000_00000000n);
  await mock.waitForDeployment();

  // 部署 NFT
  const NFTFactory = await ethers.getContractFactory("XMNFT");
  const nft = await NFTFactory.deploy();
  await nft.waitForDeployment();

  // mint NFT 给卖家
  await nft.mint(seller.address);
  console.log(`Minted NFT tokenId 0 to seller: ${seller.address}`);

  // 部署 Auction
  const AuctionFactory = await ethers.getContractFactory("Auction");
  const auction = await AuctionFactory.deploy(await mock.getAddress());
  await auction.waitForDeployment();

  // 授权 Auction 管理 NFT
  await nft.connect(seller).approve(await auction.getAddress(), 0);
  console.log(`Approved Auction contract to manage tokenId 0`);

  // 卖家创建拍卖
  const auctionDuration = 3600; // 1 小时
  await auction.connect(seller).createAuction(await nft.getAddress(), 0, auctionDuration);
  console.log("Auction created by seller");

  // bidder1 出价
  const bid1 = ethers.parseEther("1");
  await auction.connect(bidder1).bid(0, { value: bid1 });
  console.log(`Bidder1 (${bidder1.address}) bids 1 ETH`);

  // bidder2 出价
  const bid2 = ethers.parseEther("2");
  await auction.connect(bidder2).bid(0, { value: bid2 });
  console.log(`Bidder2 (${bidder2.address}) bids 2 ETH`);

  // 查看当前拍卖状态
  let item = await auction.auctions(0);
  console.log("Current highest bidder:", item.highestBidder);
  console.log("Current highest bid (ETH):", ethers.formatEther(item.highestBidEth));

  // 快进时间结束拍卖
  await ethers.provider.send("evm_increaseTime", [auctionDuration]);
  await ethers.provider.send("evm_mine", []);

  await auction.endAuction(0);
  console.log("Auction ended");

  // NFT 转移检查
  const owner = await nft.ownerOf(0);
  console.log("NFT owner after auction:", owner);

  // 查看 pendingReturns
  const pendingBidder1 = await auction.pendingReturns(bidder1.address);
  const pendingSeller = await auction.pendingReturns(seller.address);
  console.log("Pending returns - bidder1:", ethers.formatEther(pendingBidder1));
  console.log("Pending returns - seller:", ethers.formatEther(pendingSeller));

  // 提现
  await auction.connect(bidder1).withdraw();
  console.log("Bidder1 withdrew their pending returns");

  await auction.connect(seller).withdraw();
  console.log("Seller withdrew their funds");

  // 最终状态
  const finalOwner = await nft.ownerOf(0);
  console.log("Final NFT owner:", finalOwner);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});