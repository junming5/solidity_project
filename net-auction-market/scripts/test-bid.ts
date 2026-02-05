import { ethers } from "hardhat";

async function main() {
  const PROXY_ADDRESS = "0x6CBA03F9f9e931a4C537b287101D87BC7a1984b9";

    // scripts/test-bid.ts
    const [seller, buyer] = await ethers.getSigners(); 

    // 必须用 .connect(buyer) 切换到第二个私钥，否则还是会报 "seller cannot bid"
    const auction = (await ethers.getContractAt("AuctionV2", PROXY_ADDRESS)).connect(buyer);

  const auctionId = 0; 
  // 增加一点出价金额，确保超过合约中的 minBidUsd 限制
  const bidAmount = ethers.parseEther("0.1"); 

  console.log(`正在为拍卖 ID ${auctionId} 出价...`);
  
  // 2. 注意：这里调用的是 bid 而不是 placeBid
  // 发送 ETH 出价
  const tx = await auction.bid(auctionId, { value: bidAmount });
  const receipt = await tx.wait();

  console.log(`✅ 出价成功！交易哈希: ${receipt?.hash}`);
}

main().catch((error) => {
  // 打印更详细的错误信息，方便排查是否触发了 "below min bid"
  console.error("❌ 出价失败:", error.message);
  process.exitCode = 1;
});