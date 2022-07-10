
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/access/Ownable.sol";

contract Target is Ownable{

    uint256 private age;

    function setAge(uint256 _age) public onlyOwner {
        age = _age;
    }

    function getAge() public view returns(uint256) {
        return age;
    }
    
    function getBytes(uint256 _num) public pure returns(bytes memory) {
        return abi.encodeWithSignature("setAge(uint256)", _num);
    }
    
    function getBytes32() public pure returns(bytes32) {
        return bytes32(0);
    }
	
	function getBytes32ByString(string calldata str) public pure returns(bytes32) {
        return  keccak256(bytes(str));
    }

}



