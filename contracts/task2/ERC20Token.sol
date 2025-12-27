// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract ERC20Token {
    string private _name;
    string private _symbol;
    uint8 private _decimals;

    uint256 private _totalSupply;

    mapping(address => uint256) private balances;

    mapping(address => mapping(address => uint256)) private allowances;

    address public owner;

    constructor(string memory name, string memory symbol, uint8 decimals) {
        require(bytes(name).length > 0, "name empty");
        require(bytes(symbol).length > 0, "symbol empty");
        _name = name;
        _symbol = symbol;
        _decimals = decimals;
        owner = msg.sender;
    }

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner(){
        require(msg.sender == owner, "caller is not owner");
        _;
    }

    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function balanceOf(address account) public view returns (uint256) {
        return balances[account];
    }

    function allowance(address owner_, address spender) public view returns (uint256) {
        return allowances[owner_][spender];
    }
    
    function transer(address to, uint256 value) public returns (bool) {
        require(to != address(0), "transfer to zero");
        require(balances[msg.sender] >= value, "insufficient balance");

        balances[msg.sender] -= value;
        balances[to] += value;

        emit Transfer(msg.sender, to, value);
        return true;
    }

    function approve(address spender, uint256 value) public returns (bool) {
        require(spender != address(0), "approve to zero");

        allowances[msg.sender][spender] = value;

        emit Approval(msg.sender, spender, value);
        
        return true;
    }

    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        require(from != address(0), "from zero");
        require(to != address(0), "to zero");
        require(balances[from] >= value, "insufficient balance");
        require(allowances[from][msg.sender] >= value, "insufficient allowance");

        balances[from] -= value;
        balances[to] += value;
        allowances[from][msg.sender] -= value;

        emit Transfer(from, to, value);

        return true;
    }

    function mint(address to, uint256 value) public onlyOwner returns (bool) {
        require(to != address(0), "mint to zero");
        
        _totalSupply += value;
        balances[to] += value;

        emit Transfer(address(0), to, value);

        return true;
    }
}
