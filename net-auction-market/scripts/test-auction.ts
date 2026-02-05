import { ethers } from "hardhat";

async function main() {
  const [owner] = await ethers.getSigners();
  
  const NFT_ADDRESS = "0x2Af38cF46424Cb30EC0Da0733af42665B0Ba883c";
  const PROXY_ADDRESS = "0x6CBA03F9f9e931a4C537b287101D87BC7a1984b9";

  const nft = await ethers.getContractAt("XMNFT", NFT_ADDRESS);
  const auction = await ethers.getContractAt("AuctionV2", PROXY_ADDRESS);

  // 1. 确认 Token 0 的归属
  const tokenId = 0; // 修改为 0
  console.log(`正在检查账户 ${owner.address} 是否拥有 Token ${tokenId}...`);
  
  try {
    const ownerOfToken = await nft.ownerOf(tokenId);
    if (ownerOfToken.toLowerCase() !== owner.address.toLowerCase()) {
      console.log(`❌ 你不拥有 Token ${tokenId}，它属于 ${ownerOfToken}`);
      return;
    }
  } catch (err) {
    console.log(`❌ Token ${tokenId} 似乎不存在，请确认是否已 Mint。`);
    return;
  }

  // 2. 授权
  console.log(`步骤 1: 授权 Token ${tokenId} 给拍卖合约...`);
  const approveTx = await nft.approve(PROXY_ADDRESS, tokenId);
  await approveTx.wait();
  console.log("✅ 授权成功！");

  // 3. 发起拍卖
  console.log("步骤 2: 正在调用 createAuction...");
  // 注意：AuctionV2 如果增加了最小出价逻辑，请确保参数符合 V2 要求
  const createTx = await auction.createAuction(NFT_ADDRESS, tokenId, 3600); 
  await createTx.wait();
  
  console.log("🎉 拍卖已成功开启！");
  console.log("🔗 请查看 Go 后端控制台，数据应该已经同步。");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});