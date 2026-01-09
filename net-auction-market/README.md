# NFT Auction Market（NFT 拍卖市场）

## 项目简介

本项目基于 Hardhat 框架实现了一个支持 **ETH / ERC20 出价的 NFT 拍卖市场**，  
使用 **Chainlink Price Feed 预言机** 将不同资产统一转换为 USD 价格进行比较，  
并通过 **UUPS 代理模式** 支持合约升级。

---

## 技术栈

- Solidity ^0.8.22
- Hardhat
- OpenZeppelin Contracts / Upgrades
- Chainlink Price Feeds
- ethers.js (v6)

---

## 合约结构说明

### 1️⃣ XMNFT.sol
NFT 合约，基于 ERC721 标准：
- 支持 NFT 铸造（仅 owner）
- 支持标准 ERC721 转移与授权

### 2️⃣ Auction.sol（V1）
拍卖合约（UUPS Proxy）：
- 创建拍卖（NFT 上架）
- 支持 ETH 出价
- 支持 ERC20 出价
- 使用 Chainlink 预言机将出价统一转换为 USD
- 拍卖结束后结算 NFT 和资金

### 3️⃣ AuctionV2.sol（升级版本）
在 V1 基础上新增：
- 最低出价（USD）限制
- 初始化函数 `initializeV2`
- 演示 UUPS 合约升级能力

---

## 核心功能

- 创建 NFT 拍卖
- ETH / ERC20 出价
- USD 价格统一比较
- 拍卖结束自动结算
- 合约升级（UUPS）

---

## 测试

本项目包含完整的单元测试和集成测试，覆盖以下场景：

- NFT 铸造与授权
- 创建拍卖
- ETH / ERC20 出价逻辑
- 拍卖结束结算
- 合约升级与新功能验证

运行测试：

```bash
npx hardhat test