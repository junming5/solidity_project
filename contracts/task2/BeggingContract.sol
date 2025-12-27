// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

// 合约地址
// 0x9e236751648811572BbA06A18574bb553f7EBDD6



contract BeggingContract {
    address public owner;
    
    mapping(address => uint256) private donations;

    event Donation(address indexed donor, uint256 amount);

    event Withdrawal(address indexed to, uint256 amount);

    constructor() {
        owner = msg.sender;
    }

    modifier onlyOwner () {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function donate() external payable {
        require(msg.value > 0, "Donation must be > 0");

        donations[msg.sender] += msg.value;

        emit Donation(msg.sender, msg.value);
    }

    function getDonation(address donor) external view returns (uint256) {
        return donations[donor];
    }

    function withdraw() external onlyOwner payable {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds");

        payable(owner).transfer(balance);

        emit Withdrawal(owner, balance);
    }

    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }

    receive() external payable {
        require(msg.value > 0, "Donation must be > 0");
        donations[msg.sender] += msg.value;

        emit Donation(msg.sender, msg.value);
     }

     fallback() external payable { 
        if (msg.value > 0) {
            donations[msg.sender] += msg.value;
            emit Donation(msg.sender, msg.value);
        }
     }
}