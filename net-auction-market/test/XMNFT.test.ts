import { expect } from "chai";
import { ethers } from "hardhat";

describe("XMNFT", function () {
  async function deployFixture() {
    const [owner, user] = await ethers.getSigners();

    const MyNFT = await ethers.getContractFactory("XMNFT");
    const nft = await MyNFT.deploy();

    return { nft, owner, user };
  }

  it("should mint NFT to user", async function () {
    const { nft, owner, user } = await deployFixture();

    await nft.connect(owner).mint(user.address);

    expect(await nft.ownerOf(0)).to.equal(user.address);
  });

  it("should not allow non-owner to mint", async function () {
    const { nft, user } = await deployFixture();

    await expect(
      nft.connect(user).mint(user.address)
    ).to.be.reverted;
  });
});