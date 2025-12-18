import { ethers } from "hardhat";

/**
 * SDK Decryption Script
 * 
 * This script uses the Zama Relayer SDK to decrypt values after requestDecryption has been called.
 * Run this 60-90 seconds AFTER running manualDecrypt.ts
 */

async function main() {
  const contractAddress = process.env.HOLOPREDICT_ADDRESS;
  if (!contractAddress) {
    throw new Error("HOLOPREDICT_ADDRESS not set in environment. Set it in your .env file.");
  }
  const marketId = process.env.MARKET_ID ? parseInt(process.env.MARKET_ID) : 0;
  
  console.log("🔓 SDK Decryption Script\n");
  console.log("Contract Address:", contractAddress);
  console.log("Market ID:", marketId);
  
  const HoloPredict = await ethers.getContractAt("HoloPredict", contractAddress);
  
  // Import SDK
  console.log("\n📦 Importing Zama Relayer SDK...");
  const { createInstance, SepoliaConfig, initSDK } = await import("@zama-fhe/relayer-sdk/web");
  
  // Initialize SDK
  console.log("⏳ Initializing SDK...");
  if (initSDK) {
    await initSDK();
  }
  
  const instance = await createInstance(SepoliaConfig);
  console.log("✅ SDK initialized\n");
  
  // Check market status first
  console.log("📊 Checking market status...");
  const marketInfo = await HoloPredict.getMarketInfo(marketId);
  const [, , status] = marketInfo;
  
  if (Number(status) !== 2) {
    throw new Error(`Market is not resolved (status=${status}). Market must be Resolved (status=2) to decrypt outcome and volumes.`);
  }
  
  // Get encrypted handles
  console.log("📊 Fetching encrypted handles...");
  let outcomeHandle: string;
  try {
    outcomeHandle = await HoloPredict.getEncryptedOutcome(marketId);
  } catch (error: any) {
    throw new Error(`Failed to get encrypted outcome: ${error.message}. Make sure the market is resolved and outcome is set.`);
  }
  
  const [volumeYesHandle, volumeNoHandle] = await HoloPredict.getEncryptedVolumes(marketId);
  
  console.log("Outcome Handle:", outcomeHandle);
  console.log("Volume YES Handle:", volumeYesHandle);
  console.log("Volume NO Handle:", volumeNoHandle);
  
  // Decrypt via SDK
  console.log("\n🔐 Decrypting via Relayer SDK...");
  const handles = [outcomeHandle, volumeYesHandle, volumeNoHandle];
  
  try {
    const result = await instance.publicDecrypt(handles);
    
    console.log("\n✅ DECRYPTION SUCCESSFUL!\n");
    console.log("=".repeat(70));
    
    // Parse outcome
    const outcomeRaw = result.clearValues[outcomeHandle];
    const outcomeBool = Boolean(outcomeRaw);
    console.log("Outcome:", outcomeBool ? "YES Won" : "NO Won");
    
    // Parse volumes
    const volumeYesRaw = result.clearValues[volumeYesHandle];
    const volumeNoRaw = result.clearValues[volumeNoHandle];
    
    const volumeYesBig = typeof volumeYesRaw === 'bigint' ? volumeYesRaw : BigInt(volumeYesRaw.toString());
    const volumeNoBig = typeof volumeNoRaw === 'bigint' ? volumeNoRaw : BigInt(volumeNoRaw.toString());
    
    // Convert from gwei to ETH
    const volumeYesWei = volumeYesBig * BigInt(1e9);
    const volumeNoWei = volumeNoBig * BigInt(1e9);
    const volumeYesEth = ethers.formatEther(volumeYesWei);
    const volumeNoEth = ethers.formatEther(volumeNoWei);
    
    console.log("Total YES Volume:", volumeYesEth, "ETH");
    console.log("Total NO Volume:", volumeNoEth, "ETH");
    console.log("Total Volume:", ethers.formatEther(volumeYesWei + volumeNoWei), "ETH");
    
    console.log("=".repeat(70));
    
    console.log("\n📝 These are the decrypted values from the SDK.");
    console.log("💡 Refresh your browser - the frontend should now display these values.");
    console.log("\n⚠️  Note: These values are decrypted but NOT saved on-chain yet.");
    console.log("   They exist only in the SDK/Gateway state.");
    console.log("   Your frontend can read them using instance.publicDecrypt()");
    
  } catch (error: any) {
    console.error("\n❌ Decryption failed:", error.message);
    
    if (error.message?.includes('429') || error.message?.includes('rate limit')) {
      console.log("\n⏰ Rate limit hit. Wait 30 seconds and try again.");
    } else if (error.message?.includes('not found') || error.message?.includes('not ready')) {
      console.log("\n⏰ Values not ready yet.");
      console.log("   Coprocessors need 60-90 seconds after requestDecryption was called.");
      console.log("   Please wait longer and try again.");
    } else {
      console.log("\n💡 Make sure you ran: npx hardhat run scripts/manualDecrypt.ts --network sepolia");
      console.log("   And waited 60-90 seconds.");
    }
    
    process.exit(1);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

