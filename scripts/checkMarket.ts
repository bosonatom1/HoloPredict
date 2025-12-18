import { ethers } from "hardhat";

async function main() {
  const contractAddress = process.env.HOLOPREDICT_ADDRESS;
  if (!contractAddress) {
    throw new Error("HOLOPREDICT_ADDRESS not set in environment. Set it in your .env file.");
  }
  const marketId = process.env.MARKET_ID ? parseInt(process.env.MARKET_ID) : 0;
  
  const HoloPredict = await ethers.getContractAt("HoloPredict", contractAddress);
  
  console.log("\n=== MARKET INFO ===");
  const info = await HoloPredict.getMarketInfo(marketId);
  const [question, , status, , , outcomeDecrypted, outcomeValue, volumesDecrypted, decryptedVolumeYes, decryptedVolumeNo] = info;
  console.log("Question:", question);
  console.log("Status:", ["Open", "Closed", "Resolved", "Cancelled"][Number(status)]);
  console.log("Outcome Decrypted:", outcomeDecrypted);
  console.log("Outcome Value:", outcomeValue ? "YES WON" : "NO WON");
  console.log("Volumes Decrypted:", volumesDecrypted);
  console.log("Volume YES:", ethers.formatEther(decryptedVolumeYes * BigInt(1e9)), "ETH");
  console.log("Volume NO:", ethers.formatEther(decryptedVolumeNo * BigInt(1e9)), "ETH");
  
  console.log("\n=== MARKET STATS ===");
  const stats = await HoloPredict.getMarketStats(marketId);
  const [totalVolume, volumeYes, volumeNo, outcome, isResolved] = stats;
  console.log("Total Volume:", ethers.formatEther(totalVolume * BigInt(1e9)), "ETH");
  console.log("Volume YES:", ethers.formatEther(volumeYes * BigInt(1e9)), "ETH");
  console.log("Volume NO:", ethers.formatEther(volumeNo * BigInt(1e9)), "ETH");
  console.log("Outcome:", outcome ? "YES WON" : "NO WON");
  console.log("Is Resolved:", isResolved);
  
  console.log("\n=== YOUR BET INFO ===");
  const [signer] = await ethers.getSigners();
  const userAddress = await signer.getAddress();
  console.log("Your Address:", userAddress);
  
  const betInfo = await HoloPredict.getUserBetInfo(marketId, userAddress);
  const [amountYesHandle, amountNoHandle, sideHandle, hasClaimed] = betInfo;
  
  console.log("Amount YES Handle:", amountYesHandle);
  console.log("Amount NO Handle:", amountNoHandle);
  console.log("Side Handle:", sideHandle);
  console.log("Has Claimed:", hasClaimed);
  
  console.log("\n=== CAN CLAIM PROFIT ===");
  const canClaim = await HoloPredict.canClaimProfit(marketId, userAddress);
  console.log("Can Claim:", canClaim);
  console.log("Note: Profit calculation requires local decryption of bet amounts.");
  
  // Try to get encrypted handles if market is resolved
  try {
    console.log("\n=== ENCRYPTED HANDLES ===");
    if (Number(status) === 2) { // Resolved
      const outcomeHandle = await HoloPredict.getEncryptedOutcome(marketId);
      console.log("Outcome Handle:", outcomeHandle);
    }
    const [volumeYesHandle, volumeNoHandle] = await HoloPredict.getEncryptedVolumes(marketId);
    console.log("Volume YES Handle:", volumeYesHandle);
    console.log("Volume NO Handle:", volumeNoHandle);
    
    const [betYesHandle, betNoHandle, betSideHandle] = await HoloPredict.getEncryptedBets(marketId, userAddress);
    if (betYesHandle !== ethers.ZeroHash || betNoHandle !== ethers.ZeroHash) {
      console.log("Bet YES Handle:", betYesHandle);
      console.log("Bet NO Handle:", betNoHandle);
      console.log("Bet Side Handle:", betSideHandle);
    }
  } catch (error: any) {
    // Market may not be resolved yet, or handles not available
    if (!error.message?.includes("Market not resolved")) {
      console.log("Could not fetch encrypted handles:", error.message);
    }
  }
  
  console.log("\n✅ Done!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
