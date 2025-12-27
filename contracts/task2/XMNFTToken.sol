// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract XMNFTToken is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;

    constructor() ERC721("XM Land NFT", "XMLN") Ownable(msg.sender) {}

    function mintNFT(address recipient, string memory tokenURI) public onlyOwner {
        uint256 tokenId = _nextTokenId;
        _nextTokenId++;

        _safeMint(recipient, tokenId);
        _setTokenURI(tokenId, tokenURI);
    }
}