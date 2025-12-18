import { useState, useCallback } from 'react'
import { ethers } from 'ethers'
import { CONTRACT_ADDRESSES, NETWORK_CONFIG } from '../config/contracts'
import { HOLOPREDICT_ABI } from '../config/abis'
import { useWallet } from './useWallet'

export function useHoloPredict() {
  const { signer, isConnected, provider, ensureCorrectNetwork } = useWallet()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  
  // Helper to ensure correct network before transactions
  const ensureNetwork = useCallback(async () => {
    return await ensureCorrectNetwork(NETWORK_CONFIG.sepolia.chainId)
  }, [ensureCorrectNetwork])

  const getContract = useCallback(() => {
    if (!signer) throw new Error('Wallet not connected')
    const address = CONTRACT_ADDRESSES.sepolia
    if (!address || address === '') {
      throw new Error('Contract address not configured. Please set VITE_HOLOPREDICT_ADDRESS in your .env file')
    }
    if (!ethers.isAddress(address)) {
      throw new Error(`Invalid contract address: ${address}`)
    }
    return new ethers.Contract(address, HOLOPREDICT_ABI, signer)
  }, [signer])

  const getContractReadOnly = useCallback(() => {
    if (!provider) {
      // If no provider from wallet, create a read-only provider with public RPC
      const publicProvider = new ethers.JsonRpcProvider('https://ethereum-sepolia-rpc.publicnode.com')
      const address = CONTRACT_ADDRESSES.sepolia
      if (!address || address === '') {
        throw new Error('Contract address not configured. Please set VITE_HOLOPREDICT_ADDRESS in your .env file')
      }
      if (!ethers.isAddress(address)) {
        throw new Error(`Invalid contract address: ${address}`)
      }
      return new ethers.Contract(address, HOLOPREDICT_ABI, publicProvider)
    }
    const address = CONTRACT_ADDRESSES.sepolia
    if (!address || address === '') {
      throw new Error('Contract address not configured. Please set VITE_HOLOPREDICT_ADDRESS in your .env file')
    }
    if (!ethers.isAddress(address)) {
      throw new Error(`Invalid contract address: ${address}`)
    }
    return new ethers.Contract(address, HOLOPREDICT_ABI, provider)
  }, [provider])

  const createMarket = useCallback(async (
    question: string,
    endTime: number,
    resolutionTime: number
  ) => {
    if (!isConnected) throw new Error('Wallet not connected')
    
    // Validate network
    const isCorrectNetwork = await ensureNetwork()
    if (!isCorrectNetwork) {
      throw new Error('Please switch to Sepolia network to continue')
    }
    
    setLoading(true)
    setError(null)
    try {
      const contract = getContract()
      const tx = await contract.createMarket(question, endTime, resolutionTime)
      await tx.wait()
      return tx.hash
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to create market'
      setError(errorMsg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isConnected, getContract, ensureNetwork])

  const placeBet = useCallback(async (
    marketId: number,
    encryptedAmount: any,
    encryptedSide: any,
    amountProof: string,
    sideProof: string,
    value: bigint
  ) => {
    if (!isConnected) throw new Error('Wallet not connected')
    
    // Validate network
    const isCorrectNetwork = await ensureNetwork()
    if (!isCorrectNetwork) {
      throw new Error('Please switch to Sepolia network to continue')
    }
    
    setLoading(true)
    setError(null)
    try {
      const contract = getContract()
      const tx = await contract.placeBet(marketId, encryptedAmount, encryptedSide, amountProof, sideProof, { value })
      await tx.wait()
      return tx.hash
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to place bet'
      setError(errorMsg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isConnected, getContract, ensureNetwork])

  const closeMarket = useCallback(async (marketId: number) => {
    if (!isConnected) throw new Error('Wallet not connected')
    
    const isCorrectNetwork = await ensureNetwork()
    if (!isCorrectNetwork) {
      throw new Error('Please switch to Sepolia network to continue')
    }
    
    setLoading(true)
    setError(null)
    try {
      const contract = getContract()
      const tx = await contract.closeMarket(marketId)
      await tx.wait()
      return tx.hash
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to close market'
      setError(errorMsg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isConnected, getContract, ensureNetwork])

  const setOutcome = useCallback(async (
    marketId: number,
    encryptedOutcome: any,
    inputProof: string
  ) => {
    if (!isConnected) throw new Error('Wallet not connected')
    
    const isCorrectNetwork = await ensureNetwork()
    if (!isCorrectNetwork) {
      throw new Error('Please switch to Sepolia network to continue')
    }
    
    setLoading(true)
    setError(null)
    try {
      const contract = getContract()
      const tx = await contract.setOutcome(marketId, encryptedOutcome, inputProof)
      await tx.wait()
      return tx.hash
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to set outcome'
      setError(errorMsg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isConnected, getContract, ensureNetwork])

  const claimProfit = useCallback(async (
    marketId: number,
    decryptedAmountYes: number | bigint,
    decryptedAmountNo: number | bigint,
    decryptedSide: boolean,
    decryptionProof: string
  ) => {
    if (!isConnected) throw new Error('Wallet not connected')
    
    const isCorrectNetwork = await ensureNetwork()
    if (!isCorrectNetwork) {
      throw new Error('Please switch to Sepolia network to continue')
    }
    
    setLoading(true)
    setError(null)
    try {
      const contract = getContract()
      const tx = await contract.claimProfit(
        marketId,
        decryptedAmountYes,
        decryptedAmountNo,
        decryptedSide,
        decryptionProof
      )
      await tx.wait()
      return tx.hash
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to claim profit'
      setError(errorMsg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isConnected, getContract, ensureNetwork])

  const getMarketCount = useCallback(async () => {
    try {
      const contract = getContractReadOnly()
      return await contract.marketCount()
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }, [getContractReadOnly])

  const getMarketInfo = useCallback(async (marketId: number) => {
    try {
      const contract = getContractReadOnly()
      return await contract.getMarketInfo(marketId)
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }, [getContractReadOnly])

  const getUserBetInfo = useCallback(async (marketId: number, address: string) => {
    try {
      const contract = getContractReadOnly()
      return await contract.getUserBetInfo(marketId, address)
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }, [getContractReadOnly])

  const canClaimProfit = useCallback(async (marketId: number, address: string) => {
    try {
      const contract = getContractReadOnly()
      return await contract.canClaimProfit(marketId, address)
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }, [getContractReadOnly])

  const makeUserBetsDecryptable = useCallback(async (marketId: number) => {
    if (!isConnected) throw new Error('Wallet not connected')
    
    const isCorrectNetwork = await ensureNetwork()
    if (!isCorrectNetwork) {
      throw new Error('Please switch to Sepolia network to continue')
    }
    
    try {
      setLoading(true)
      const contract = getContract()
      const tx = await contract.makeUserBetsDecryptable(marketId)
      await tx.wait()
      return tx.hash
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to make bets decryptable'
      setError(errorMsg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isConnected, getContract, ensureNetwork])

  const getOracle = useCallback(async () => {
    try {
      const contract = getContractReadOnly()
      return await contract.oracle()
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }, [getContractReadOnly])

  const getOwner = useCallback(async () => {
    try {
      const contract = getContractReadOnly()
      return await contract.owner()
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }, [getContractReadOnly])

  const requestOutcomeDecryption = useCallback(async (marketId: number) => {
    if (!isConnected) throw new Error('Wallet not connected')
    
    const isCorrectNetwork = await ensureNetwork()
    if (!isCorrectNetwork) {
      throw new Error('Please switch to Sepolia network to continue')
    }
    
    try {
      setLoading(true)
      const contract = getContract()
      const tx = await contract.requestOutcomeDecryption(marketId)
      await tx.wait()
      return tx.hash
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to request outcome decryption'
      setError(errorMsg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isConnected, getContract, ensureNetwork])

  const requestVolumeDecryption = useCallback(async (marketId: number) => {
    if (!isConnected) throw new Error('Wallet not connected')
    
    const isCorrectNetwork = await ensureNetwork()
    if (!isCorrectNetwork) {
      throw new Error('Please switch to Sepolia network to continue')
    }
    
    try {
      setLoading(true)
      const contract = getContract()
      const tx = await contract.requestVolumeDecryption(marketId)
      await tx.wait()
      return tx.hash
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to request volume decryption'
      setError(errorMsg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isConnected, getContract, ensureNetwork])


  const getEncryptedOutcome = useCallback(async (marketId: number) => {
    try {
      const contract = getContractReadOnly()
      const outcomeHandle = await contract.getEncryptedOutcome(marketId)
      return { outcomeHandle }
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }, [getContractReadOnly])

  const getEncryptedVolumes = useCallback(async (marketId: number) => {
    try {
      const contract = getContractReadOnly()
      const [volumeYesHandle, volumeNoHandle] = await contract.getEncryptedVolumes(marketId)
      return { volumeYesHandle, volumeNoHandle }
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }, [getContractReadOnly])

  const getEncryptedBets = useCallback(async (marketId: number, bettor: string) => {
    try {
      const contract = getContractReadOnly()
      const [amountYesHandle, amountNoHandle, sideHandle] = await contract.getEncryptedBets(marketId, bettor)
      return { amountYesHandle, amountNoHandle, sideHandle }
    } catch (err: any) {
      setError(err.message)
      throw err
    }
  }, [getContractReadOnly])

  const verifyAndSetDecryptedOutcome = useCallback(async (
    marketId: number,
    decryptedOutcome: boolean,
    decryptionProof: string
  ) => {
    if (!isConnected) throw new Error('Wallet not connected')
    
    const isCorrectNetwork = await ensureNetwork()
    if (!isCorrectNetwork) {
      throw new Error('Please switch to Sepolia network to continue')
    }
    
    try {
      setLoading(true)
      const contract = getContract()
      const tx = await contract.verifyAndSetDecryptedOutcome(
        marketId,
        decryptedOutcome,
        decryptionProof
      )
      await tx.wait()
      return tx.hash
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to verify and set decrypted outcome'
      setError(errorMsg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isConnected, getContract, ensureNetwork])

  const verifyAndSetDecryptedVolumes = useCallback(async (
    marketId: number,
    decryptedVolumeYes: number | bigint,
    decryptedVolumeNo: number | bigint,
    decryptionProof: string
  ) => {
    if (!isConnected) throw new Error('Wallet not connected')
    
    const isCorrectNetwork = await ensureNetwork()
    if (!isCorrectNetwork) {
      throw new Error('Please switch to Sepolia network to continue')
    }
    
    try {
      setLoading(true)
      const contract = getContract()
      const tx = await contract.verifyAndSetDecryptedVolumes(
        marketId,
        decryptedVolumeYes,
        decryptedVolumeNo,
        decryptionProof
      )
      await tx.wait()
      return tx.hash
    } catch (err: any) {
      const errorMsg = err.message || 'Failed to verify and set decrypted volumes'
      setError(errorMsg)
      throw err
    } finally {
      setLoading(false)
    }
  }, [isConnected, getContract, ensureNetwork])


  return {
    loading,
    error,
    createMarket,
    placeBet,
    closeMarket,
    setOutcome,
    claimProfit,
    getMarketCount,
    getMarketInfo,
    getUserBetInfo,
    getOracle,
    getOwner,
    requestOutcomeDecryption,
    requestVolumeDecryption,
    getEncryptedOutcome,
    getEncryptedVolumes,
    getEncryptedBets,
    verifyAndSetDecryptedOutcome,
    verifyAndSetDecryptedVolumes,
    canClaimProfit,
    makeUserBetsDecryptable,
  }
}
