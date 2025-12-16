// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

// ✅  用 solidity 实现罗马数字转数整数
// 题目描述在 https://leetcode.cn/problems/integer-to-roman/description/

contract IntToRoman {
    function intToRoman(uint num) public pure returns (string memory) {
        uint256[13] memory values = [
            uint256(1000),900,500,400,100,90,50,40,10,9,5,4,1
        ];
        bytes[13] memory symbols = [
            bytes("M"),bytes("CM"),bytes("D"),bytes("CD"),bytes("C"),bytes("XC"),
            bytes("L"),bytes("XL"),bytes("X"),bytes("IX"),bytes("V"),bytes("IV"),
            bytes("I")
        ];
        uint count = values.length;
        bytes memory roman;
        for (uint i = 0; i < count; i++) {
            while (num >= values[i]) {
                num -= values[i];
                roman = bytes.concat(roman, symbols[i]);
            }
            if (num <= 0) {
                break;
            }
        }
        return string(roman);
    }
}