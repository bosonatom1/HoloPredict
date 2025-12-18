import { ethers } from "hardhat";

/**
 * Manual decryption script using FHE.makePubliclyDecryptable() flow
 * 
 * This script demonstrates the proper Zama decryption flow:
 * 1. Call request*Decryption() which calls FHE.makePubliclyDecryptable()
 * 2. Wait for coprocessors to process AllowedForDecryption events
 * 3. Use frontend with instance.publicDecrypt() to decrypt values
 * 
 * NOTE: This script only handles step 1. Steps 2-3 should be done via frontend.
 */

async function main() {
  const contractAddress = process.env.HOLOPREDICT_ADDRESS;
  if (!contractAddress) {
    throw new Error("HOLOPREDICT_ADDRESS not set in environment. Set it in your .env file.");
  }
  const marketId = process.env.MARKET_ID ? parseInt(process.env.MARKET_ID) : 0;
  
  console.log("🔐 Manual Decryption Script - FHE.makePubliclyDecryptable() Flow\n");
  console.log("Contract Address:", contractAddress);
  console.log("Market ID:", marketId);
  
  const [signer] = await ethers.getSigners();
  const signerAddress = await signer.getAddress();
  console.log("Signer Address:", signerAddress, "\n");
  
  const HoloPredict = await ethers.getContractAt("HoloPredict", contractAddress);
  
  // Check market status
  console.log("📊 Checking market status...");
  const marketInfo = await HoloPredict.getMarketInfo(marketId);
  const [question, , status, , , outcomeDecrypted, , volumesDecrypted] = marketInfo;
  console.log("  Question:", question);
  console.log("  Status:", ["Open", "Closed", "Resolved", "Cancelled"][Number(status)]);
  console.log("  Outcome Decrypted:", outcomeDecrypted);
  console.log("  Volumes Decrypted:", volumesDecrypted);
  
  // Verify signer is oracle or owner (contract requires onlyOracle modifier)
  const oracleAddress = await HoloPredict.oracle();
  const ownerAddress = await HoloPredict.owner();
  if (oracleAddress.toLowerCase() !== signerAddress.toLowerCase() && ownerAddress.toLowerCase() !== signerAddress.toLowerCase()) {
    throw new Error(`Signer ${signerAddress} is not the oracle (${oracleAddress}) or owner (${ownerAddress}). Only oracle or owner can request decryptions.`);
  }
  
  if (Number(status) !== 2) {
    console.log("\n⚠️  Market must be Resolved (status=2) to request decryption");
    return;
  }
  
  console.log("\n" + "=".repeat(70));
  console.log("STEP 1: Request Decryptions (calls FHE.makePubliclyDecryptable)");
  console.log("=".repeat(70) + "\n");
  
  // Step 1: Request decryptions (calls FHE.makePubliclyDecryptable)
  try {
    if (!outcomeDecrypted) {
      console.log("1️⃣ Requesting OUTCOME decryption...");
      const tx1 = await HoloPredict.requestOutcomeDecryption(marketId);
      await tx1.wait();
      console.log("   ✅ Tx:", tx1.hash);
      console.log("   📡 FHE.makePubliclyDecryptable(outcome) called");
      console.log("   📡 AllowedForDecryption event emitted\n");
    } else {
      console.log("1️⃣ Outcome already decrypted ✅\n");
    }
    
    if (!volumesDecrypted) {
      console.log("2️⃣ Requesting VOLUMES decryption...");
      const tx2 = await HoloPredict.requestVolumeDecryption(marketId);
      await tx2.wait();
      console.log("   ✅ Tx:", tx2.hash);
      console.log("   📡 FHE.makePubliclyDecryptable(volumeYes) called");
      console.log("   📡 FHE.makePubliclyDecryptable(volumeNo) called");
      console.log("   📡 AllowedForDecryption events emitted\n");
    } else {
      console.log("2️⃣ Volumes already decrypted ✅\n");
    }
    
    const userBetInfo = await HoloPredict.getUserBetInfo(marketId, signerAddress);
    const [amountYesHandle, amountNoHandle] = userBetInfo;
    // Contract requires both handles to be non-zero (both are always initialized when bet is placed)
    const hasBet = amountYesHandle !== ethers.ZeroHash && amountNoHandle !== ethers.ZeroHash;
    
    if (hasBet) {
      console.log("3️⃣ Requesting BET AMOUNTS decryption...");
      const tx3 = await HoloPredict.makeUserBetsDecryptable(marketId);
      await tx3.wait();
      console.log("   ✅ Tx:", tx3.hash);
      console.log("   📡 FHE.makePubliclyDecryptable(betYes) called");
      console.log("   📡 FHE.makePubliclyDecryptable(betNo) called");
      console.log("   📡 FHE.makePubliclyDecryptable(betSide) called");
      console.log("   📡 AllowedForDecryption events emitted\n");
    } else {
      console.log("3️⃣ No bet placed by this address ✅\n");
    }
    
  } catch (error: any) {
    console.error("\n❌ Failed to request decryption:", error.message);
    process.exit(1);
  }
  
  // Get handles for reference
  console.log("\n" + "=".repeat(70));
  console.log("ENCRYPTED HANDLES (for reference)");
  console.log("=".repeat(70) + "\n");
  
  try {
    const outcomeHandle = await HoloPredict.getEncryptedOutcome(marketId);
    const [volumeYesHandle, volumeNoHandle] = await HoloPredict.getEncryptedVolumes(marketId);
    const [betYesHandle, betNoHandle] = await HoloPredict.getEncryptedBets(marketId, signerAddress);
    
    console.log("Outcome Handle:", outcomeHandle);
    console.log("Volume YES Handle:", volumeYesHandle);
    console.log("Volume NO Handle:", volumeNoHandle);
    console.log("Bet YES Handle:", betYesHandle);
    console.log("Bet NO Handle:", betNoHandle);
  } catch (error: any) {
    console.log("Could not fetch handles (market may not be resolved yet)");
  }
  
  console.log("\n" + "=".repeat(70));
  console.log("STEP 2: Wait for Coprocessors (1-2 minutes)");
  console.log("=".repeat(70) + "\n");
  
  console.log("⏳ Coprocessors need to:");
  console.log("   1. Listen to AllowedForDecryption events");
  console.log("   2. Prepare/switch-and-squash ciphertexts");
  console.log("   3. Publish commitments");
  console.log("   4. Update Gateway ACL/state");
  console.log("\n⏰ This typically takes 1-2 minutes on testnet");
  
  console.log("\n" + "=".repeat(70));
  console.log("STEP 3: Decrypt via Frontend");
  console.log("=".repeat(70) + "\n");
  
  console.log("🌐 Use your FRONTEND to decrypt:");
  console.log("   1. Open the market in your frontend");
  console.log("   2. Click 'Request Decryption' button");
  console.log("   3. Frontend calls: instance.publicDecrypt([handles])");
  console.log("   4. Decrypted values are displayed");
  console.log("\n💡 The frontend uses @zama-fhe/relayer-sdk/web");
  console.log("   which properly handles the publicDecrypt() API");
  
  console.log("\n" + "=".repeat(70));
  console.log("ALTERNATIVE: Check Contract State");
  console.log("=".repeat(70) + "\n");
  
  console.log("📊 To check if values are decrypted on-chain:");
  console.log("   npx hardhat run scripts/checkMarket.ts --network sepolia");
  console.log("\n⚠️  NOTE: On-chain decryption requires calling verify functions");
  console.log("   with KMS proofs, which is typically done by the Gateway");
  
  console.log("\n✅ Done! Decryption requests submitted.");
  console.log("   Wait 1-2 minutes, then use the frontend to decrypt.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
