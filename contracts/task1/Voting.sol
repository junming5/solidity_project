// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

// ✅ 创建一个名为Voting的合约，包含以下功能：
// 一个mapping来存储候选人的得票数
// 一个vote函数，允许用户投票给某个候选人
// 一个getVotes函数，返回某个候选人的得票数
// 一个resetVotes函数，重置所有候选人的得票数

contract Voting {
    mapping(string => uint256) voteCount;
    string[] candidates;

    function vote(string calldata username) public {
        require(bytes(username).length > 0, "User name empty");

        voteCount[username]++;  
        candidates.push(username);
    }

    function getVotes(string calldata username) public view returns (uint256) {
        return voteCount[username];
    }

    function resetVotes() public {
        uint256 len = candidates.length;
        for (uint256 i = 0; i < len; i++) {
            string memory name = candidates[i];
            voteCount[name] = 0;
        }
        delete candidates;
    }
}