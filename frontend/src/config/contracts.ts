// Contract addresses and network configuration
export const CONTRACT_ADDRESSES = {
  sepolia: import.meta.env.VITE_HOLOPREDICT_ADDRESS ||  '',
}

export const NETWORK_CONFIG = {
  sepolia: {
    chainId: 11155111, // Sepolia testnet chain ID
    name: 'Sepolia',
    rpcUrl: import.meta.env.VITE_SEPOLIA_RPC_URL || 'https://ethereum-sepolia-rpc.publicnode.com',
  },
}

