import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

type FhevmInstance = any

interface FHEContextType {
  instance: FhevmInstance | null
  isInitialized: boolean
  isInitializing: boolean
  initialize: () => Promise<void>
  encryptAmount: (amount: number, contractAddress: string, userAddress: string) => Promise<any>
  encryptOutcome: (outcome: boolean, contractAddress: string, userAddress: string) => Promise<any>
  publicDecrypt: (handles: string[], userAddress?: string, skipRateLimit?: boolean) => Promise<any>
}

const FHEContext = createContext<FHEContextType | undefined>(undefined)

export function FHEProvider({ children }: { children: ReactNode }) {
  const [instance, setInstance] = useState<FhevmInstance | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [isInitializing, setIsInitializing] = useState(false)
  const [isDecrypting, setIsDecrypting] = useState(false)
  const [lastDecryptTime, setLastDecryptTime] = useState(0)

  const initialize = useCallback(async () => {
    if (isInitializing || isInitialized) {
      return
    }
    
    setIsInitializing(true)
    
    try {
      console.log('⏳ Initializing FHE')
      
      const module = await import('@zama-fhe/relayer-sdk/web')
      
      const { createInstance, SepoliaConfig, initSDK } = module
      
      if (!createInstance || !SepoliaConfig) {
        throw new Error('Required exports not found in SDK')
      }
      
      if (initSDK) {
        const initPromise = initSDK()
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('WASM init timeout')), 30000)
        )
        await Promise.race([initPromise, timeoutPromise])
      }
      
      const config = {
        ...SepoliaConfig,
        network: window.ethereum,
        relayerUrl: 'https://relayer.testnet.zama.org',
      }
      
      const instancePromise = createInstance(config)
      const timeoutPromise2 = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Instance creation timeout')), 30000)
      )
      const fheInstance = await Promise.race([instancePromise, timeoutPromise2])
      
      setInstance(fheInstance)
      setIsInitialized(true)
      
      console.log('✅ FHE ready')
    } catch (error) {
      console.error('FHE initialization failed:', error instanceof Error ? error.message : error)
      throw error
    } finally {
      setIsInitializing(false)
    }
  }, [isInitializing, isInitialized])

  const encryptAmount = useCallback(async (amount: number, contractAddress: string, userAddress: string) => {
    if (!instance) {
      throw new Error('FHE not initialized')
    }
    
    try {
      const input = instance.createEncryptedInput(contractAddress, userAddress)
      input.add32(amount)
      const encryptedInput = await input.encrypt()
      
      return {
        handles: encryptedInput.handles,
        inputProof: encryptedInput.inputProof
      }
    } catch (error) {
      console.error('Encryption failed:', error instanceof Error ? error.message : error)
      throw error
    }
  }, [instance])

  const encryptOutcome = useCallback(async (outcome: boolean, contractAddress: string, userAddress: string) => {
    if (!instance) {
      throw new Error('FHE not initialized')
    }
    
    try {
      const input = instance.createEncryptedInput(contractAddress, userAddress)
      input.addBool(outcome)
      const encryptedInput = await input.encrypt()
      
      return {
        handles: encryptedInput.handles,
        inputProof: encryptedInput.inputProof
      }
    } catch (error) {
      console.error('Outcome encryption failed:', error instanceof Error ? error.message : error)
      throw error
    }
  }, [instance])

  const publicDecrypt = useCallback(async (handles: string[], userAddress?: string, skipRateLimit?: boolean): Promise<any> => {
    if (!instance) {
      throw new Error('FHE not initialized')
    }
    
    // Global rate limiting: prevent calls if one is already in progress
    if (isDecrypting) {
      throw new Error('Decryption already in progress. Please wait.')
    }
    
    // Enforce minimum 30 seconds between calls (unless skipRateLimit is true)
    const now = Date.now()
    if (!skipRateLimit) {
      const timeSinceLastCall = now - lastDecryptTime
      const minWaitTime = 30000 // 30 seconds
      if (lastDecryptTime > 0 && timeSinceLastCall < minWaitTime) {
        const waitTime = Math.ceil((minWaitTime - timeSinceLastCall) / 1000)
        throw new Error(`Rate limit: Please wait ${waitTime} more seconds before trying again.`)
      }
    }
    
    setIsDecrypting(true)
    
    try {
      // Ensure window.ethereum is available for the SDK to access private key
      if (!window.ethereum) {
        throw new Error('Wallet not connected. Please connect your wallet to decrypt.')
      }
      
      // The SDK's publicDecrypt uses the private key from window.ethereum
      // which was passed during instance creation
      // If userAddress is provided, the SDK might use it for user-specific decryption
      let result
      if (userAddress && instance.publicDecrypt.length > 1) {
        // Try passing address if SDK supports it
        result = await instance.publicDecrypt(handles, userAddress)
      } else {
        // Standard publicDecrypt (uses wallet's private key automatically)
        result = await instance.publicDecrypt(handles)
      }
      
      setIsDecrypting(false)
      
      // Only set rate limit timer on successful decryption
      if (!skipRateLimit) {
        setLastDecryptTime(now)
      }
      
      return {
        clearValues: result.clearValues,
        abiEncodedClearValues: result.abiEncodedClearValues,
        decryptionProof: result.decryptionProof
      }
    } catch (error: any) {
      setIsDecrypting(false)
      
      // Check if handles are not decryptable yet (expected, don't set rate limit or log as error)
      const isNotDecryptableError = error?.message?.includes('not allowed for public decryption') || 
                                   error?.message?.includes('not allowed for decryption')
      
      // Only set rate limit timer on real errors (not "not decryptable" errors)
      if (!skipRateLimit && !isNotDecryptableError) {
        setLastDecryptTime(now)
      }
      
      // Check for rate limit errors
      const isRateLimit = error?.message?.includes('429') || 
                         error?.message?.includes('Too Many Requests') || 
                         error?.message?.includes('rate limit') ||
                         error?.status === 429 ||
                         (error?.response?.status === 429)
      
      if (isRateLimit) {
        throw new Error('Relayer rate limit exceeded: Please wait 30+ seconds and try again.')
      }
      
      // Check for key-related errors
      if (error?.message?.includes('Invalid public or private key') || 
          error?.message?.includes('key') ||
          error?.message?.includes('replace')) {
        throw new Error('Wallet key access error. Please ensure your wallet is connected and unlocked. Try refreshing the page.')
      }
      
      if (!isNotDecryptableError) {
        console.error('Public decryption failed:', error instanceof Error ? error.message : error)
      }
      throw error
    }
  }, [instance, isDecrypting, lastDecryptTime])

  return (
    <FHEContext.Provider value={{ instance, isInitialized, isInitializing, initialize, encryptAmount, encryptOutcome, publicDecrypt }}>
      {children}
    </FHEContext.Provider>
  )
}

export function useFHE() {
  const context = useContext(FHEContext)
  if (context === undefined) {
    throw new Error('useFHE must be used within a FHEProvider')
  }
  return context
}
