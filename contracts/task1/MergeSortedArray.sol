// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

// ✅  合并两个有序数组 (Merge Sorted Array)
// 题目描述：将两个有序数组合并为一个有序数组。

contract MergeSortedArray {
    function mergeSortedArray(uint256[] calldata arr1, uint256[] calldata arr2) public pure returns (uint256[] memory) {
        uint256 len1 = arr1.length;
        uint256 len2 = arr2.length;
        uint256[] memory resArr = new uint256[](len1 + len2);

        uint256 i = 0;
        uint256 j = 0;
        uint256 k = 0;

        while (i < len1 && j < len2) {
            if (arr1[i] < arr2[j]) {
                resArr[k++] = arr1[i++];
            } else {
                resArr[k++] = arr2[j++];
            }
        }
        while (i < len1) {
            resArr[k++] = arr1[i++];
        }
        while (j < len2) {
            resArr[k++] = arr2[j++];
        }
        return resArr;
    }
}