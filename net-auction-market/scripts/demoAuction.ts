import { ethers } from "hardhat";

async function main() {
  const [seller, bidder1] = await ethers.getSigners();

  const nftAddress = "NFT_CONTRACT_ADDRESS";       // 部署完成后的地址替换
  const auctionAddress = "AUCTION_CONTRACT_ADDRESS";

  const NFT = await ethers.getContractAt("XMNFT", nftAddress);
  const Auction = await ethers.getContractAt("Auction", auctionAddress);

  // mint NFT 给 seller
  await NFT.mint(seller.address);
  console.log("NFT minted to seller");

  // 授权 Auction 合约
  await NFT.connect(seller).approve(auctionAddress, 0);

  // 创建拍卖
  await Auction.connect(seller).createAuction(nftAddress, 0, 3600);
  console.log("Auction created");

  // bidder1 出价
  await Auction.connect(bidder1).bid(0, { value: ethers.parseEther("1") });
  console.log("Bidder1 placed bid");

  // 快进 1 小时
  await ethers.provider.send("evm_increaseTime", [3600]);
  await ethers.provider.send("evm_mine", []);

  // 结束拍卖
  await Auction.endAuction(0);
  console.log("Auction ended");

  // 卖家提现
  await Auction.connect(seller).withdraw();
  console.log("Seller withdraw completed");
}

main().catch(console.error);