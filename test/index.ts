import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { Contract } from "ethers";
import { ethers } from "hardhat";


// After the vote is passed, the task can be executed after 120 seconds at least. 
const MIN_DELAY = 20;

// Only 2% of the total number of voters are required to vote,
// otherwise the proposal will be abandoned.
const QUORUM_PERCENTAGE = 2;

// Voting is completed in 3 blocks, in blocks, not time
const VOTING_PERIOD = 3;

// After the proposal is initiated,
// it can only be voted after passing through 1 block
const VOTING_DELAY = 1;

// Method for modifying parameters
const FUNC = "setAge";

// Value for modifying parameters
const NEW_AGE_VALUE = 77;

// Modify the descriptions of the proposal
const PROPOSAL_DESCRIPTION = "Change target age";

const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";

describe("Governor Contracts", function() {
  let spaceCoin: Contract;
  let timeLockContract: Contract;
  let target: Contract;
  let myGovernor: Contract;

  const voteWay = 1;
  const reason = "just for practice";

  let deployer: SignerWithAddress;
  let addr1: SignerWithAddress;
  let addr2: SignerWithAddress;
  let addrs: SignerWithAddress[];

  beforeEach(async () => {
    // token
    // deploy SpaceCoin contract
    const SpaceCoinFactory = await ethers.getContractFactory("SpaceCoin");
    spaceCoin = await SpaceCoinFactory.deploy();
    console.log("SpaceCoin deployed to:", spaceCoin.address);

    // get deployment account
    [deployer, addr1, addr2, ...addrs] = await ethers.getSigners();
    console.log("Deploying SpaceCoin contract with the account:", deployer.address);

    // Authorize the account to vote.
    let transactionResponse = await spaceCoin.delegate(deployer.address);
    await transactionResponse.wait(1);

    // get the number of checkpoints of the deployment account.
    console.log(`Checkpoints: ${await spaceCoin.numCheckpoints(deployer.address)}`);

    // transfer 1000 tokens to addr1
    await spaceCoin.transfer(addr1.address,ethers.utils.parseEther("1000"));
    console.log("addr1 balance",ethers.utils.formatEther(await spaceCoin.balanceOf(addr1.address)));

    // transfer 1000 tokens to addr2
    await spaceCoin.transfer(addr2.address,ethers.utils.parseEther("1000"));
    console.log("addr2 balance", ethers.utils.formatEther(await spaceCoin.balanceOf(addr2.address)));

    // get balance of the deployer
    console.log("deployer balance", ethers.utils.formatEther(await spaceCoin.balanceOf(deployer.address)));

    // deploy TimeLock contract
    let TimeLockFactory = await ethers.getContractFactory("TimeLock");

    // After the vote is passed, Extend the execution time by at least MIN_DELAY
    timeLockContract = await TimeLockFactory.deploy(MIN_DELAY, [], []);
    await timeLockContract.deployed();
    console.log("TimeLockContract deployed to:", timeLockContract.address);

    // deploy Target contract
    const TargetFactory = await ethers.getContractFactory("Target");
    target = await TargetFactory.deploy();
    console.log("TargetContract deployed to:", target.address);

    // Transfer the owner of the Target contract to the TimeLock contract.
    // Only TimeLock can call the setAge method of the Target.
    const transferTx = await target.transferOwnership(timeLockContract.address);
    await transferTx.wait(1);


    // deploy MyGovernor contract
    let MyGovernorFactory = await ethers.getContractFactory("MyGovernor");
    myGovernor = await MyGovernorFactory.deploy(
      spaceCoin.address,
      timeLockContract.address,
      QUORUM_PERCENTAGE,
      VOTING_PERIOD,
      VOTING_DELAY
    );

    await myGovernor.deployed();
    console.log("MyGovernor deployed to:", myGovernor.address);

    // Proposal role
    const proposerRole = await timeLockContract.PROPOSER_ROLE();

    // Execute proposal role
    const executorRole = await timeLockContract.EXECUTOR_ROLE();

    // Administrstor role
    const adminRole = await timeLockContract.TIMELOCK_ADMIN_ROLE();

    // In TimeLock, assign the proposal role to MyGovernor
    const proposerTx = await timeLockContract.grantRole(proposerRole, myGovernor.address);
    await proposerTx.wait(1);

    // TimeLock assigns itself an executive role
    await timeLockContract.grantRole(executorRole, ADDRESS_ZERO);
    await timeLockContract.grantRole(executorRole, myGovernor.address);

    // Revoke deployer admin role
    const revokeTx = await timeLockContract.revokeRole(adminRole, deployer.address);
    await revokeTx.wait(1);


  })

  it("can only be changed through governance", async () => {
    await expect(target.setAge(55)).to.be.revertedWith("Ownable: caller is not the owner");
  })


  it("proposes, votes, waits, queues, and then executes", async () => {
    // Initiate a proposal to call the setAge method of the Target contract
    const encodedFunctionCall = target.interface.encodeFunctionData(FUNC, [NEW_AGE_VALUE]);
    const proposeTx = await myGovernor.propose(
      [target.address],
      [0],
      [encodedFunctionCall],
      PROPOSAL_DESCRIPTION
    );

    const proposeReceipt = await proposeTx.wait(1);

    // get proposal Id
    const proposalId = proposeReceipt.events[0].args.proposalId;
    console.log(`Current proposalId: ${proposalId}`);
    
    // get proposal status
    let proposalState = await myGovernor.state(proposalId);
    console.log(`Current Proposal State 1: ${proposalState}`);
    
    // The voting status of pending after the proposal is initiated cannot be voted at this time.
    // We can vote only after we add a new block, so we transfer 1 tokens to addr1.
    await spaceCoin.transfer(addr1.address, ethers.utils.parseEther("1"))
    await spaceCoin.transfer(addr1.address, ethers.utils.parseEther("1"));
    proposalState = await myGovernor.state(proposalId);

    // The proposalId status will change to active. In this case, we can vote.
    console.log(`Current Proposal State 2: ${proposalState}`);

    // Voting
    // Against 0, Favor 1,  Abstain 2
    const voteTx = await myGovernor.castVoteWithReason(proposalId, voteWay, reason);
    await voteTx.wait(1);
    proposalState = await myGovernor.state(proposalId);

    // 
    expect(await proposalState.toString()).to.equal("1");
    console.log(`Current Proposal State 3: ${proposalState}`);

    // From the block where the voting starts, the next three blocks are the voting time.
    // We complete the voting by making four transactions.
    await spaceCoin.transfer(addr1.address,ethers.utils.parseEther("1"));
    await spaceCoin.transfer(addr1.address,ethers.utils.parseEther("1"));
    await spaceCoin.transfer(addr1.address,ethers.utils.parseEther("1"));
    await spaceCoin.transfer(addr1.address,ethers.utils.parseEther("1"));

    proposalState = await myGovernor.state(proposalId);
    // At this time, the status of the proposal should be successful voting.
    console.log(`Current Proposal State 4: ${proposalState}`);
    

    // Put proposals in queue
    // const descriptionHash = ethers.utils.keccak256(ethers.utils.toUtf8Bytes(PROPOSAL_DESCRIPTION));
    const descriptionHash = ethers.utils.id(PROPOSAL_DESCRIPTION);
    const queueTx = await myGovernor.queue([target.address], [0], [encodedFunctionCall], descriptionHash);
    await queueTx.wait(1);

    await moveTime(MIN_DELAY + 1);

    await spaceCoin.transfer(addr1.address,ethers.utils.parseEther("1"));

    proposalState = await myGovernor.state(proposalId);

    //At this time, the proposal status is 5(Queued)
    console.log(`Current Proposal State 5: ${proposalState}`);

    // execute proposal
    console.log("Executing...");
    const exTx = await myGovernor.execute([target.address], [0], [encodedFunctionCall], descriptionHash);
    await exTx.wait(1);

    // At this time, the proposal status is 6(Executed)
    proposalState = await myGovernor.state(proposalId);
    console.log(`Current Proposal State 6: ${proposalState}`);


    // get the age value of Target contract
    console.log((await target.getAge()).toString());
    expect(await target.getAge()).to.equal(NEW_AGE_VALUE);
    
  })

  async function moveBlocks(amount: any) {
    console.log("Moving blocks...");
    for (let index = 0; index < amount; index++) {
        await ethers.provider.send("evm_mine", []);
    }
    console.log(`Moved ${amount} blocks`)
}

  async function moveTime(amount: any) {
    console.log("Moving blocks...")
    await  ethers.provider.send("evm_increaseTime", [amount])
    console.log(`Moved forward in time ${amount} seconds`)
  }
})
