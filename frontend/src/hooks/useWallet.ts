import { useState, useEffect, useCallback } from 'react'
import { ethers } from 'ethers'

declare global {
  interface Window {
    ethereum?: any
  }
}

export function useWallet() {
  const [address, setAddress] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [chainId, setChainId] = useState<number | null>(null)
  const [signer, setSigner] = useState<ethers.JsonRpcSigner | null>(null)
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null)
  const [isMetaMaskInstalled, setIsMetaMaskInstalled] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)

  // Check if MetaMask is installed
  useEffect(() => {
    const checkMetaMask = () => {
      const installed = typeof window.ethereum !== 'undefined'
      setIsMetaMaskInstalled(installed)
    }
    checkMetaMask()
    
    // Listen for MetaMask installation
    window.addEventListener('ethereum#initialized', checkMetaMask)
    return () => window.removeEventListener('ethereum#initialized', checkMetaMask)
  }, [])

  // Initialize connection on mount
  useEffect(() => {
    if (isMetaMaskInstalled && window.ethereum && !isDisconnecting) {
      checkConnection()
      setupEventListeners()
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners('accountsChanged')
        window.ethereum.removeAllListeners('chainChanged')
      }
    }
  }, [isMetaMaskInstalled, isDisconnecting])

  const checkConnection = async () => {
    if (!window.ethereum || isDisconnecting) return

    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' })
      if (accounts.length > 0 && !isDisconnecting) {
        await handleAccountsChanged(accounts)
      }
      
      if (!isDisconnecting) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
        const chainIdNum = parseInt(chainIdHex, 16)
        setChainId(chainIdNum)
      }
    } catch (error) {
      console.error('Error checking connection:', error)
    }
  }

  const setupEventListeners = () => {
    if (!window.ethereum) return

    window.ethereum.on('accountsChanged', handleAccountsChanged)
    window.ethereum.on('chainChanged', (chainIdHex: string) => {
      const chainIdNum = parseInt(chainIdHex, 16)
      setChainId(chainIdNum)
      // Reload page on chain change to reset state
      window.location.reload()
    })
  }

  const handleAccountsChanged = async (accounts: string[]) => {
    // Don't auto-reconnect if we're in the middle of disconnecting
    if (isDisconnecting) {
      return
    }
    
    if (accounts.length === 0) {
      setAddress(null)
      setIsConnected(false)
      setSigner(null)
      setProvider(null)
    } else {
      const account = accounts[0]
      setAddress(account)
      setIsConnected(true)
      
      if (window.ethereum) {
        const browserProvider = new ethers.BrowserProvider(window.ethereum)
        const browserSigner = await browserProvider.getSigner()
        setProvider(browserProvider)
        setSigner(browserSigner)
      }
    }
  }

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed')
    }

    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      await handleAccountsChanged(accounts)
      
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
      const chainIdNum = parseInt(chainIdHex, 16)
      setChainId(chainIdNum)
    } catch (error: any) {
      if (error.code === 4001) {
        throw new Error('User rejected the connection request')
      }
      throw error
    }
  }, [])

  const disconnect = useCallback(async () => {
    setIsDisconnecting(true)
    
    // Clear React state
    setAddress(null)
    setIsConnected(false)
    setSigner(null)
    setProvider(null)
    setChainId(null)
    
    // Try to revoke MetaMask permissions if available
    // This requires MetaMask to have the wallet_revokePermissions method
    if (window.ethereum && typeof window.ethereum.request === 'function') {
      try {
        // Check if the method exists (it might not be available in all MetaMask versions)
        const accounts = await window.ethereum.request({ method: 'eth_accounts' })
        if (accounts.length > 0 && window.ethereum.request) {
          try {
            // Attempt to revoke permissions (this may not work in all MetaMask versions)
            await window.ethereum.request({
              method: 'wallet_revokePermissions',
              params: [{ eth_accounts: {} }],
            })
          } catch (revokeError: any) {
            // If revokePermissions is not supported, that's okay
            // MetaMask will still remember the connection, but our app state is cleared
            console.log('wallet_revokePermissions not available:', revokeError)
          }
        }
      } catch (error) {
        console.error('Error during disconnect:', error)
      }
    }
    
    
    // Reset disconnecting flag after a short delay to prevent immediate reconnection
    setTimeout(() => {
      setIsDisconnecting(false)
    }, 500)
  }, [])

  const switchNetwork = useCallback(async (targetChainId: number) => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed')
    }

    try {
      // Try to switch to the network
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: `0x${targetChainId.toString(16)}` }],
      })
    } catch (error: any) {
      // If the network doesn't exist, add it
      if (error.code === 4902) {
        // For Sepolia, we can add it
        if (targetChainId === 11155111) {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${targetChainId.toString(16)}`,
                chainName: 'Sepolia',
                nativeCurrency: {
                  name: 'ETH',
                  symbol: 'ETH',
                  decimals: 18,
                },
                rpcUrls: ['https://ethereum-sepolia-rpc.publicnode.com'],
                blockExplorerUrls: ['https://sepolia.etherscan.io'],
              },
            ],
          })
        } else {
          throw new Error(`Network ${targetChainId} not found. Please add it manually in MetaMask.`)
        }
      } else {
        throw error
      }
    }
  }, [])

  const ensureCorrectNetwork = useCallback(async (targetChainId: number): Promise<boolean> => {
    if (!window.ethereum) {
      throw new Error('MetaMask is not installed')
    }

    try {
      const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' })
      const currentChainId = parseInt(chainIdHex, 16)

      if (currentChainId !== targetChainId) {
        await switchNetwork(targetChainId)
        // Wait a bit for the chain to switch
        await new Promise(resolve => setTimeout(resolve, 1000))
        return true
      }
      return true
    } catch (error: any) {
      if (error.code === 4001) {
        // User rejected the switch
        return false
      }
      throw error
    }
  }, [switchNetwork])

  return {
    address,
    isConnected,
    connect,
    disconnect,
    isMetaMaskInstalled,
    chainId,
    switchNetwork,
    signer,
    provider,
    ensureCorrectNetwork,
  }
}
