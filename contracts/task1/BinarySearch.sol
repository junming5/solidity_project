// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

// ✅  二分查找 (Binary Search)
// 题目描述：在一个有序数组中查找目标值。

contract BinarySearch {
    function binaraySearch(uint256[] calldata arr, uint256 target) public pure returns (int256) {
        uint256 count = arr.length;
        uint256 index = 0;
        while (index < count) {
            uint256 mid = index + (count - index)/2;
            uint256 v = arr[mid];
            if (v == target) {
                return int256(mid);
            } else if (v < target) {
                index = mid + 1;
            } else {
                count = mid;
            }
        }
        
        return -1;
    }
}