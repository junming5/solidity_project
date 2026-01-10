import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "solidity-coverage";

import * as dotenv from "dotenv";
dotenv.config();

const INFURA_ID = process.env.YOUR_INFURA_PROJECT_ID;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ALCHEMY_KEY = process.env.ALCHEMY_KEY;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.22",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

  networks: {
    sepolia: {
      url: `https://sepolia.infura.io/v3/${INFURA_ID}`,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      
      // url: `https://rpc.sepolia.org`,
      // accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      // gasPrice: 3_000_000_000,

      // url: `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`,
      // accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};

export default config;