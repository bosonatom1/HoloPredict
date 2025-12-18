import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import { useFHE } from './contexts/FHEContext'
import { WalletConnect } from './components/WalletConnect'
import { MarketList } from './components/MarketList'
import { MarketDetail } from './components/MarketDetail'
import { CreateMarket } from './components/CreateMarket'
import { FAQ } from './components/FAQ'
import { useWallet } from './hooks/useWallet'
import { useHoloPredict } from './hooks/useHoloPredict'
import './styles/App.css'

type View = 'markets' | 'create' | 'market-detail'
export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    // Fallback if used outside provider
    return { showToast: (msg: string) => console.log(msg) }
  }
  return context
}

function App() {
  const { isInitialized, isInitializing, initialize } = useFHE()
  const { isConnected, address } = useWallet()
  const { getOracle, getOwner } = useHoloPredict()
  const [view, setView] = useState<View>('markets')
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [isOracle, setIsOracle] = useState(false)
  const [isOwner, setIsOwner] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [marketTabOverride, setMarketTabOverride] = useState<'live' | undefined>(undefined)
  const [resetCategoryFilter, setResetCategoryFilter] = useState(false)
  const [resetSearchQuery, setResetSearchQuery] = useState(false)

  const showToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(7)
    const newToast: Toast = { id, message, type }
    
    setToasts(prev => [...prev, newToast])
    
    // Auto dismiss after 5 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id))
    }, 5000)
  }, [])

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }, [])

  useEffect(() => {
    if (isConnected && !isInitialized) {
      initialize().catch(console.error)
    }
  }, [isConnected, isInitialized, initialize])

  // Check if user is oracle or owner
  useEffect(() => {
    const checkOracleAndOwner = async () => {
      if (!isConnected || !address) {
        setIsOracle(false)
        setIsOwner(false)
        return
      }

      try {
        const [oracleAddress, ownerAddress] = await Promise.all([
          getOracle().catch(() => null),
          getOwner().catch(() => null),
        ])

        setIsOracle(oracleAddress?.toLowerCase() === address.toLowerCase())
        setIsOwner(ownerAddress?.toLowerCase() === address.toLowerCase())
      } catch (error) {
        console.error('Error checking oracle/owner:', error)
        setIsOracle(false)
        setIsOwner(false)
      }
    }

    checkOracleAndOwner()
  }, [isConnected, address, getOracle, getOwner])

  const handleMarketSelect = (marketId: number) => {
    setSelectedMarketId(marketId)
    setView('market-detail')
  }

  const handleBack = () => {
    setView('markets')
    setSelectedMarketId(null)
    // Don't reset tab - keep user's current tab selection
  }

  const handleHomeClick = () => {
    setView('markets')
    setSelectedMarketId(null)
    // Reset to live market tab (home) by triggering override
    setMarketTabOverride('live')
    // Reset category filter and search query
    setResetCategoryFilter(true)
    setResetSearchQuery(true)
    // Clear override after a tick so it can be triggered again
    setTimeout(() => {
      setMarketTabOverride(undefined)
      setResetCategoryFilter(false)
      setResetSearchQuery(false)
    }, 0)
  }

  const handleCreateSuccess = () => {
    setView('markets')
  }

  const handleCreateBack = () => {
    setView('markets')
  }


  // Prevent non-oracle/owner from staying on create view
  useEffect(() => {
    if (!isOracle && !isOwner && view === 'create') {
      setView('markets')
    }
  }, [isOracle, isOwner, view])

  return (
    <ToastContext.Provider value={{ showToast }}>
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            <h1 onClick={handleHomeClick} className="logo-clickable">HoloPredict</h1>
            <p>Privacy-Preserving Prediction Market</p>
          </div>
          <div className="header-right">
            {(isOracle || isOwner) && (
              <button
                className={`create-market-header-btn ${view === 'create' ? 'active' : ''}`}
                onClick={() => setView('create')}
              >
                Create Market
              </button>
            )}
            <FAQ />
            <div className="header-actions">
              <WalletConnect />
            </div>
          </div>
        </div>
      </header>

      <main className="app-main">
        {isConnected && isInitializing && !isInitialized && (
          <div className="fhe-status">
            <p>🔐 Initializing FHE...</p>
          </div>
        )}

        <div key={view} className="page-transition">
        {view === 'markets' && (
          <MarketList 
            onMarketSelect={handleMarketSelect} 
            activeTabOverride={marketTabOverride}
            resetCategoryFilter={resetCategoryFilter}
            resetSearchQuery={resetSearchQuery}
          />
        )}
        {view === 'create' && (isOracle || isOwner) && (
            <CreateMarket onSuccess={handleCreateSuccess} onBack={handleCreateBack} />
        )}
        {view === 'market-detail' && selectedMarketId !== null && (
          <MarketDetail 
            marketId={selectedMarketId} 
            onBack={handleBack}
            isOracle={isOracle}
            isOwner={isOwner}
          />
        )}
        </div>
      </main>
      <div className="toast-container">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`toast toast-${toast.type}`}
            onClick={() => removeToast(toast.id)}
          >
            <span className="toast-icon">
              {toast.type === 'success' && '✅'}
              {toast.type === 'error' && '❌'}
              {toast.type === 'warning' && '⚠️'}
              {toast.type === 'info' && 'ℹ️'}
            </span>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={(e) => {
              e.stopPropagation()
              removeToast(toast.id)
            }}>✕</button>
          </div>
        ))}
      </div>
    </div>
    </ToastContext.Provider>
  )
}

export default App
