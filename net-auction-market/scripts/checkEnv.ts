import { ethers } from "hardhat";
import * as dotenv from "dotenv";

dotenv.config();

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const infuraId = process.env.YOUR_INFURA_PROJECT_ID;

  if (!privateKey || !infuraId) {
    console.error("❌ PRIVATE_KEY 或 YOUR_INFURA_PROJECT_ID 未设置！");
    process.exit(1);
  }

  console.log("✅ PRIVATE_KEY 和 Infura 项目ID 已读取");

  // 创建 provider
  const provider = new ethers.JsonRpcProvider(`https://sepolia.infura.io/v3/${infuraId}`);

  // 创建 wallet 并绑定 provider
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("钱包地址:", wallet.address);

  // 查询钱包余额，直接用 provider
  const balance = await provider.getBalance(wallet.address);
  console.log("钱包余额 (ETH):", ethers.formatEther(balance));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});