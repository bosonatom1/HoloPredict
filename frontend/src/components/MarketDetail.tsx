import { useState, useEffect } from 'react'
import { ethers } from 'ethers'
import { useHoloPredict } from '../hooks/useHoloPredict'
import { useWallet } from '../hooks/useWallet'
import { useToast } from '../App'
import { PlaceBet } from './PlaceBet'
import { OraclePanel } from './OraclePanel'
import { ClaimProfit } from './ClaimProfit'
import { extractCategory, getDisplayQuestion, CATEGORY_COLORS, CATEGORY_ICONS } from '../utils/categories'
import './MarketDetail.css'

// Format timestamp to dd/mm/yyyy hh:mm
const formatDate = (timestamp: number): string => {
  const date = new Date(timestamp * 1000)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const year = date.getFullYear()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

interface MarketDetailProps {
  marketId: number
  onBack: () => void
  isOracle: boolean
  isOwner: boolean
}

export function MarketDetail({ marketId, onBack, isOracle, isOwner }: MarketDetailProps) {
  const { getMarketInfo } = useHoloPredict()
  const { isConnected } = useWallet()
  const { showToast } = useToast()
  const [marketInfo, setMarketInfo] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  const fetchMarketData = async () => {
    if (!isConnected) return
    
    setIsLoading(true)
    try {
      const info = await getMarketInfo(marketId)
      setMarketInfo(info)
    } catch (error: any) {
      console.error('Error fetching market data:', error)
      if (error.message?.includes('Contract address not configured')) {
        showToast('Contract address not set! Please set VITE_HOLOPREDICT_ADDRESS in your .env file', 'error')
      }
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchMarketData()
  }, [marketId, isConnected, refreshKey])

  const handleUpdate = () => {
    setRefreshKey(prev => prev + 1)
    fetchMarketData()
  }

  const getStatusText = (status: number) => {
    switch (status) {
      case 0: return 'Open'
      case 1: return 'Closed'
      case 2: return 'Resolved'
      case 3: return 'Cancelled'
      default: return 'Unknown'
    }
  }

  const getStatusClass = (status: number) => {
    switch (status) {
      case 0: return 'status-open'
      case 1: return 'status-closed'
      case 2: return 'status-resolved'
      case 3: return 'status-cancelled'
      default: return ''
    }
  }

  if (!isConnected) {
    return (
      <div className="market-detail">
        <button onClick={onBack} className="back-btn">
          ← Back to Markets
        </button>
        <p>Please connect your wallet to view market details</p>
      </div>
    )
  }

  if (isLoading || !marketInfo) {
    return (
      <div className="market-detail">
        <button onClick={onBack} className="back-btn">
          ← Back to Markets
        </button>
        <p>Loading market details...</p>
      </div>
    )
  }

  const status = Number(marketInfo.status)
  const currentTime = Math.floor(Date.now() / 1000)
  const endTime = Number(marketInfo.endTime)
  const isResolved = status === 2
  const category = extractCategory(marketInfo.question)
  const displayQuestion = getDisplayQuestion(marketInfo.question)

  return (
    <div className="market-detail">
      <button onClick={onBack} className="back-btn">
        ← Back to Markets
      </button>

      {/* Market Header */}
      <div className="market-detail-header">
        <div className="market-detail-header-top">
          {category && (
            <span
              className="category-badge"
              style={{
                background: `${CATEGORY_COLORS[category]}20`,
                color: CATEGORY_COLORS[category],
                borderColor: `${CATEGORY_COLORS[category]}50`,
              }}
            >
              {CATEGORY_ICONS[category]} {category}
            </span>
          )}
        <span className={`status-badge ${getStatusClass(status)}`}>
          {getStatusText(status)}
        </span>
        </div>
        <h1>{displayQuestion}</h1>
      </div>

      {/* Content Layout */}
      <div className="market-detail-content">
        {/* Market Info Section */}
        <div className="market-info-section">
          <h2>Market Information</h2>
          <div className="info-grid">
            <div className="info-item">
              <strong>Market ID</strong>
              <span>#{marketId}</span>
            </div>
            <div className="info-item">
              <strong>{Date.now() / 1000 >= Number(marketInfo.endTime) ? 'Betting Ended' : 'Betting Ends'}</strong>
              <span>{formatDate(Number(marketInfo.endTime))}</span>
            </div>
            <div className="info-item">
              <strong>Resolution Time</strong>
              <span>{formatDate(Number(marketInfo.resolutionTime))}</span>
            </div>
            {marketInfo.creator && (
              <div className="info-item">
                <strong>Creator</strong>
                <span style={{ 
                  fontFamily: 'monospace',
                  fontSize: '0.8125rem'
                }}>
                  {marketInfo.creator.slice(0, 6)}...{marketInfo.creator.slice(-4)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Market Stats Section */}
        {marketInfo.volumesDecrypted && (
          <div className="market-stats-section">
            <h2>Market Statistics</h2>
            <div className="stats-grid">
              {marketInfo.outcomeDecrypted && (
                <div className="stat-item">
                  <strong>Outcome</strong>
                  <span
                    style={{
                      color: marketInfo.outcomeValue ? 'var(--success-light)' : 'var(--error-light)',
                      fontWeight: '700'
                    }}
                  >
                    {marketInfo.outcomeValue ? 'YES' : 'NO'}
                  </span>
                </div>
              )}
              <div className="stat-item">
                <strong>YES Volume</strong>
                <span>
                  {ethers.formatEther(marketInfo.decryptedVolumeYes * BigInt(1e9))} ETH
                </span>
              </div>
              <div className="stat-item">
                <strong>NO Volume</strong>
                <span>
                  {ethers.formatEther(marketInfo.decryptedVolumeNo * BigInt(1e9))} ETH
                </span>
              </div>
              <div className="stat-item">
                <strong>Total Volume</strong>
                <span>
                  {ethers.formatEther(
                    (marketInfo.decryptedVolumeYes + marketInfo.decryptedVolumeNo) * BigInt(1e9)
                  )} ETH
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Place Bet Section - Show when market status is Open, even if betting period ended */}
        {status === 0 && (
          <div className="user-bet-section">
            <PlaceBet marketId={marketId} bettingEnded={currentTime >= endTime} />
          </div>
        )}

        {/* Info Message for Closed Market */}
        {status === 1 && (
          <div className="user-bet-section">
            <div className="place-bet">
              <h3>Place Bet</h3>
              <div style={{
                padding: '1.5rem',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '8px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '2rem',
                  marginBottom: '0.75rem'
                }}>🔒</div>
                <div style={{
                  fontSize: '1rem',
                  fontWeight: '600',
                  color: 'var(--warning-light)',
                  marginBottom: '0.5rem'
                }}>
                  Market Closed
                </div>
                <div style={{
                  fontSize: '0.875rem',
                  color: 'var(--text-secondary)',
                  lineHeight: '1.6'
                }}>
                  This market is now closed. Please wait for the oracle to resolve the outcome.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Claim Profit Section - Show when market is resolved */}
        {isResolved && (
          <div className="profit-section">
            <ClaimProfit marketId={marketId} onUpdate={handleUpdate} />
          </div>
        )}

        {/* Oracle Panel - Only show if user is oracle or owner - At the bottom */}
        {(isOracle || isOwner) && (
          <div className="user-bet-section">
            <OraclePanel
              marketId={marketId}
              onUpdate={handleUpdate}
              marketStatus={status}
              resolutionTime={marketInfo.resolutionTime}
              outcomeDecrypted={marketInfo.outcomeDecrypted}
              volumesDecrypted={marketInfo.volumesDecrypted}
            />
          </div>
        )}
      </div>
    </div>
  )
}