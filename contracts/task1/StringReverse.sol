// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

contract StringReverse {

    function reverseString(string calldata str) public pure returns (string memory) {
        
        bytes memory strBytes = bytes(str);
        uint256 len = strBytes.length;
        if (len == 0){
            return "";
        }

        bytes memory resBytes = new bytes(len);
        for (uint256 i = 0; i < len; i++) {
            resBytes[i] = strBytes[len - 1 - i];
        }
        return string(resBytes);
    }

    function reverseString2(string memory str) public pure returns (string memory) {
        bytes memory strBytes = bytes(str);
        uint256 len = strBytes.length;
        if (len == 0){
            return "";
        }
        uint256 leftIndex = 0;
        uint256 rightIndex = len - 1;
        while (leftIndex < rightIndex) {
            bytes1 _byte = strBytes[leftIndex];
            strBytes[leftIndex] = strBytes[rightIndex];
            strBytes[rightIndex] = _byte;

            leftIndex++;
            rightIndex--;
        }
        return string(strBytes);
    }
}