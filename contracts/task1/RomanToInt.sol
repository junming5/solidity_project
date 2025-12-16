// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

// ✅  用 solidity 实现整数转罗马数字
// 题目描述在 https://leetcode.cn/problems/roman-to-integer/description

contract RomanToInt {
    mapping(bytes1 => uint256) private romanMap;

    constructor(){
        romanMap[bytes1("I")] = 1;
        romanMap[bytes1("V")] = 5;
        romanMap[bytes1("X")] = 10;
        romanMap[bytes1("L")] = 50;
        romanMap[bytes1("C")] = 100;
        romanMap[bytes1("D")] = 500;
        romanMap[bytes1("M")] = 1000;
    }

    function romanToInt(string calldata s) public view returns (uint) {
        bytes memory strBytes = bytes(s);
        uint value = 0;
        uint len = strBytes.length;
        for (uint i = 0; i < len; i++) {
            uint num = romanMap[strBytes[i]];
            if (i < len - 1 && num < romanMap[strBytes[i+1]]) {
                value -= num;
            } else {
                value += num;
            }
        }
        return value;
    }
}