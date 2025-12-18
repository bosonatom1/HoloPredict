import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

task("create-market", "Create a new prediction market (oracle only)")
  .addParam("question", "Market question text")
  .addOptionalParam("endtime", "Betting end time (unix timestamp). If not provided, uses --days")
  .addOptionalParam("resolutiontime", "Resolution time (unix timestamp). If not provided, uses --days")
  .addOptionalParam("days", "Number of days from now for end time (default: 7). Resolution time will be end time + 1 day")
  .setAction(async (taskArgs, hre: HardhatRuntimeEnvironment) => {
    const { ethers } = hre;
    const [signer] = await ethers.getSigners();
    
    const contractAddress = process.env.HOLOPREDICT_ADDRESS;
    if (!contractAddress) {
      throw new Error("HOLOPREDICT_ADDRESS not set in environment. Set it in your .env file or export it.");
    }
    
    const HoloPredict = await ethers.getContractAt("HoloPredict", contractAddress, signer);
    
    // Check if signer is oracle or owner (contract allows both)
    const signerAddress = await signer.getAddress();
    const oracleAddress = await HoloPredict.oracle();
    const ownerAddress = await HoloPredict.owner();
    
    if (signerAddress.toLowerCase() !== oracleAddress.toLowerCase() && signerAddress.toLowerCase() !== ownerAddress.toLowerCase()) {
      throw new Error(`Signer ${signerAddress} is not the oracle (${oracleAddress}) or owner (${ownerAddress}). Only oracle or owner can create markets.`);
    }
    
    let endTime: bigint;
    let resolutionTime: bigint;
    const now = BigInt(Math.floor(Date.now() / 1000));
    
    if (taskArgs.endtime && taskArgs.resolutiontime) {
      endTime = BigInt(taskArgs.endtime);
      resolutionTime = BigInt(taskArgs.resolutiontime);
    } else {
      const days = taskArgs.days ? parseInt(taskArgs.days) : 7;
      const secondsPerDay = 86400n;
      endTime = now + (BigInt(days) * secondsPerDay);
      resolutionTime = endTime + secondsPerDay;
    }
    
    // Validate times according to contract requirements
    if (endTime <= now) {
      throw new Error(`endTime (${new Date(Number(endTime) * 1000).toLocaleString()}) must be in the future. Current time: ${new Date(Number(now) * 1000).toLocaleString()}`);
    }
    if (resolutionTime <= endTime) {
      throw new Error(`resolutionTime (${new Date(Number(resolutionTime) * 1000).toLocaleString()}) must be after endTime (${new Date(Number(endTime) * 1000).toLocaleString()})`);
    }
    
    console.log("\n📝 Creating Market...");
    console.log("Question:", taskArgs.question);
    console.log("End Time:", new Date(Number(endTime) * 1000).toLocaleString());
    console.log("Resolution Time:", new Date(Number(resolutionTime) * 1000).toLocaleString());
    console.log("Signer:", signerAddress, signerAddress.toLowerCase() === oracleAddress.toLowerCase() ? "(Oracle)" : "(Owner)");
    
    const tx = await HoloPredict.createMarket(
      taskArgs.question,
      endTime.toString(),
      resolutionTime.toString()
    );
    
    const receipt = await tx.wait();
    const event = receipt?.logs.find(
      (log: any) => log.topics[0] === ethers.id("MarketCreated(uint256,address,string,uint256,uint256)")
    );
    
    const marketId = event ? BigInt(event.topics[1]) : null;
    
    console.log("\n✅ Market created!");
    console.log("Transaction:", tx.hash);
    if (marketId !== null) {
      console.log("Market ID:", marketId.toString());
    }
  });
