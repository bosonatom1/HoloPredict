import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers } from 'ethers'
import { useHoloPredict } from '../hooks/useHoloPredict'
import { useWallet } from '../hooks/useWallet'
import { useFHE } from '../contexts/FHEContext'
import { useToast } from '../App'
import { Category, CATEGORIES, CATEGORY_COLORS, CATEGORY_ICONS, extractCategory, getDisplayQuestion } from '../utils/categories'
import './MarketList.css'

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

interface Market {
  id: number
  question: string
  status: number
  endTime: bigint
  resolutionTime: bigint
  outcomeDecrypted: boolean
  outcomeValue: boolean
  volumesDecrypted: boolean
  decryptedVolumeYes: bigint
  decryptedVolumeNo: bigint
  hasClaimed?: boolean
  category?: Category | null
  userBetWon?: boolean | null // true if won, false if lost, null if not decrypted or unknown
}

type TabType = 'live' | 'closed' | 'resolved' | 'my-bets'

interface MarketListProps {
  onMarketSelect: (marketId: number) => void
  onRefreshReady?: (refreshFn: () => void) => void
  activeTabOverride?: TabType
  resetCategoryFilter?: boolean
  resetSearchQuery?: boolean
}

export function MarketList({ onMarketSelect, onRefreshReady, activeTabOverride, resetCategoryFilter, resetSearchQuery }: MarketListProps) {
  const { getMarketCount, getMarketInfo, getUserBetInfo, getEncryptedBets, loading } = useHoloPredict()
  const { isConnected, address } = useWallet()
  const { publicDecrypt, instance, isInitialized } = useFHE()
  const { showToast } = useToast()
  const [markets, setMarkets] = useState<Market[]>([])
  const [isLoading, setIsLoading] = useState(false)
  // Remember last active tab in localStorage so back button preserves it
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const saved = localStorage.getItem('holopredict_activeTab')
    return (saved as TabType) || 'live'
  })
  
  // Update activeTab if override is provided (for home click)
  useEffect(() => {
    if (activeTabOverride) {
      setActiveTab(activeTabOverride)
      localStorage.setItem('holopredict_activeTab', activeTabOverride)
    }
  }, [activeTabOverride])

  const [marketsWithBets, setMarketsWithBets] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)

  // Reset category filter when resetCategoryFilter is true (for home click)
  useEffect(() => {
    if (resetCategoryFilter) {
      setSelectedCategory(null)
    }
  }, [resetCategoryFilter])

  // Reset search query when resetSearchQuery is true (for home click)
  useEffect(() => {
    if (resetSearchQuery) {
      setSearchQuery('')
    }
  }, [resetSearchQuery])
  const refreshReadyCalled = useRef(false)
  
  // Save tab to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('holopredict_activeTab', activeTab)
  }, [activeTab])

  const fetchMarkets = useCallback(async () => {
    setIsLoading(true)
    try {
      const count = await getMarketCount()
      const marketPromises = []
      for (let i = 0; i < Number(count); i++) {
        marketPromises.push(getMarketInfo(i))
      }
      const marketData = await Promise.all(marketPromises)
      const marketsList: Market[] = marketData.map((data, index) => {
        const category = extractCategory(data.question)
        return {
        id: index,
        question: data.question,
        status: Number(data.status),
        endTime: data.endTime,
        resolutionTime: data.resolutionTime,
        outcomeDecrypted: data.outcomeDecrypted,
        outcomeValue: data.outcomeValue,
        volumesDecrypted: data.volumesDecrypted,
        decryptedVolumeYes: data.decryptedVolumeYes,
        decryptedVolumeNo: data.decryptedVolumeNo,
        hasClaimed: undefined,
          category,
        }
      })
      
      // Sort markets by priority:
      // 1. open (status 0, endTime hasn't passed) - sorted by endTime ascending (bet time closer first)
      // 2. ended (status 0, endTime has passed) - sorted by endTime descending (most recently ended first)
      // 3. closed (status 1) - sorted by resolutionTime ascending (resolve time closer first)
      // 4. resolved (status 2) - sorted by resolutionTime descending (most recently resolved first)
      const currentTime = Math.floor(Date.now() / 1000)
      const sortedMarkets = marketsList.sort((a, b) => {
        const aEndTime = Number(a.endTime)
        const bEndTime = Number(b.endTime)
        const aResolutionTime = Number(a.resolutionTime)
        const bResolutionTime = Number(b.resolutionTime)
        
        // Get priority groups
        const getPriority = (market: Market): number => {
          if (market.status === 0) {
            // Open markets (status 0)
            const marketEndTime = Number(market.endTime)
            if (currentTime < marketEndTime) {
              return 1 // open - bet time closer
            } else {
              return 2 // ended
            }
          } else if (market.status === 1) {
            return 3 // closed - resolve time closer
          } else if (market.status === 2) {
            return 4 // resolved
          }
          return 5 // cancelled or unknown
        }
        
        const aPriority = getPriority(a)
        const bPriority = getPriority(b)
        
        // First sort by priority
        if (aPriority !== bPriority) {
          return aPriority - bPriority
        }
        
        // Within same priority group, sort by time
        if (aPriority === 1) {
          // open: sort by endTime ascending (closer bet times first)
          return aEndTime - bEndTime
        } else if (aPriority === 2) {
          // ended: sort by endTime descending (most recently ended first)
          return bEndTime - aEndTime
        } else if (aPriority === 3) {
          // closed: sort by resolutionTime ascending (closer resolve times first)
          return aResolutionTime - bResolutionTime
        } else if (aPriority === 4) {
          // resolved: sort by resolutionTime descending (most recently resolved first)
          return bResolutionTime - aResolutionTime
        }
        
        // Fallback: sort by ID descending
        return b.id - a.id
      })
      
      setMarkets(sortedMarkets)
      
      // Check which markets user has bets in and store hasClaimed status
      // Also check if user has decrypted their bet (for resolved markets)
      if (address) {
        const betPromises = marketsList.map(async (market) => {
          try {
            const betInfo = await getUserBetInfo(market.id, address)
            const zeroHandle = '0x0000000000000000000000000000000000000000000000000000000000000000'
            // PRIVACY FIX: Both handles are now always initialized when a bet is placed
            // Check if BOTH handles are non-zero (meaning a bet was placed)
            const hasBet = betInfo.amountYesHandle && betInfo.amountYesHandle !== zeroHandle &&
                          betInfo.amountNoHandle && betInfo.amountNoHandle !== zeroHandle
            if (hasBet) {
              // Update market with hasClaimed status
              const marketIndex = sortedMarkets.findIndex(m => m.id === market.id)
              if (marketIndex !== -1) {
                sortedMarkets[marketIndex].hasClaimed = betInfo.hasClaimed
                
                // Check if user has decrypted their bet (for resolved markets)
                // Only check if market is resolved and outcome/volumes are decrypted
                if (market.status === 2 && market.outcomeDecrypted && market.volumesDecrypted && 
                    !betInfo.hasClaimed && isInitialized && instance && publicDecrypt) {
                  try {
                    const encryptedBets = await getEncryptedBets(market.id, address)
                    if (encryptedBets.amountYesHandle && encryptedBets.amountYesHandle !== zeroHandle &&
                        encryptedBets.amountNoHandle && encryptedBets.amountNoHandle !== zeroHandle &&
                        encryptedBets.sideHandle && encryptedBets.sideHandle !== zeroHandle) {
                      
                      // Try to decrypt silently (this will only work if handles are publicly decryptable)
                      const handles = [encryptedBets.amountYesHandle, encryptedBets.amountNoHandle, encryptedBets.sideHandle]
                      try {
                        const result = await publicDecrypt(handles, address)
                        if (result && result.clearValues) {
                          const side = result.clearValues[encryptedBets.sideHandle] === true || 
                                      result.clearValues[encryptedBets.sideHandle] === 1n
                          // Determine if user won: user bet YES and outcome is YES, or user bet NO and outcome is NO
                          const userWon = (market.outcomeValue && side) || (!market.outcomeValue && !side)
                          sortedMarkets[marketIndex].userBetWon = userWon
                        }
                      } catch (decryptErr: any) {
                        // Decryption not available (handles not publicly decryptable yet)
                        // This is expected and not an error
                        sortedMarkets[marketIndex].userBetWon = null
                      }
                    }
                  } catch (err) {
                    // Silent fail - user hasn't decrypted yet
                    sortedMarkets[marketIndex].userBetWon = null
                  }
                }
              }
              return market.id
            }
            return null
          } catch (err) {
            return null
          }
        })
        const marketsWithBetsArray = (await Promise.all(betPromises)).filter((id): id is number => id !== null)
        setMarketsWithBets(new Set(marketsWithBetsArray))
        setMarkets(sortedMarkets) // Update markets with hasClaimed info
      }
    } catch (error: any) {
      console.error('Error fetching markets:', error)
      if (error.message?.includes('Contract address not configured')) {
        showToast('Contract address not set! Please set VITE_HOLOPREDICT_ADDRESS in your .env file', 'error')
      } else if (error.message?.includes('UNCONFIGURED_NAME') || error.message?.includes('value=""')) {
        showToast('Contract address is empty! Please set VITE_HOLOPREDICT_ADDRESS in your .env file and restart the dev server', 'error')
      }
    } finally {
      setIsLoading(false)
    }
  }, [getMarketCount, getMarketInfo, getUserBetInfo, address])

  useEffect(() => {
    // Delay fetching to ensure provider is ready
    if (isConnected) {
      const timer = setTimeout(() => {
        fetchMarkets()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [isConnected, fetchMarkets])

  // Expose refresh function to parent (only once to avoid render issues)
  useEffect(() => {
    if (onRefreshReady && !refreshReadyCalled.current) {
      refreshReadyCalled.current = true
      // Defer to next tick to avoid state update during render
      const timer = setTimeout(() => {
      onRefreshReady(fetchMarkets)
      }, 0)
      return () => clearTimeout(timer)
    }
  }, [onRefreshReady, fetchMarkets])

  const getStatusText = (status: number, endTime?: bigint) => {
    // If betting period ended but market is still open (status 0), show "Ended"
    if (status === 0 && endTime) {
      const currentTime = Math.floor(Date.now() / 1000)
      if (currentTime >= Number(endTime)) {
        return 'Ended'
      }
    }
    
    switch (status) {
      case 0: return 'Open'
      case 1: return 'Closed'
      case 2: return 'Resolved'
      case 3: return 'Cancelled'
      default: return 'Unknown'
    }
  }

  const getStatusClass = (status: number, endTime?: bigint) => {
    // If betting period ended but market is still open (status 0), use "ended" style
    if (status === 0 && endTime) {
      const currentTime = Math.floor(Date.now() / 1000)
      if (currentTime >= Number(endTime)) {
        return 'status-ended'
      }
    }
    
    switch (status) {
      case 0: return 'status-open'
      case 1: return 'status-closed'
      case 2: return 'status-resolved'
      case 3: return 'status-cancelled'
      default: return ''
    }
  }

  // Filter markets based on active tab and search query (without category filter for counting)
  const tabFilteredMarkets = markets.filter(market => {
    // Filter by tab
    let matchesTab = true
    if (activeTab === 'live') matchesTab = market.status === 0
    else if (activeTab === 'closed') matchesTab = market.status === 1
    else if (activeTab === 'resolved') matchesTab = market.status === 2
    else if (activeTab === 'my-bets') matchesTab = marketsWithBets.has(market.id)
    
    // Filter by search query
    const displayQuestion = getDisplayQuestion(market.question)
    const matchesSearch = searchQuery.trim() === '' || 
      displayQuestion.toLowerCase().includes(searchQuery.toLowerCase().trim())
    
    return matchesTab && matchesSearch
  })

  // Count markets by category for filter buttons (only in current tab)
  const categoryCounts = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = tabFilteredMarkets.filter(m => m.category === cat).length
    return acc
  }, {} as Record<Category, number>)

  // Filter markets based on active tab, search query, and category
  const filteredMarkets = tabFilteredMarkets.filter(market => {
    // Filter by category
    const matchesCategory = !selectedCategory || market.category === selectedCategory
    return matchesCategory
  })

  if (!isConnected) {
    return (
      <div className="market-list">
        <p>Please connect your wallet to view markets</p>
      </div>
    )
  }

  return (
    <div className="market-list">
      {/* Tabs */}
      <div className="market-tabs-container">
        <div className="market-tabs">
          <button 
            className={`tab ${activeTab === 'live' ? 'active' : ''}`}
            onClick={() => setActiveTab('live')}
          >
            <span className="tab-icon">🔴</span>
            <span className="tab-label">
              <span className="tab-label-full">Live Market</span>
              <span className="tab-label-short">Live</span>
            </span>
            <span className="tab-count">{markets.filter(m => m.status === 0).length}</span>
          </button>
          <button 
            className={`tab ${activeTab === 'closed' ? 'active' : ''}`}
            onClick={() => setActiveTab('closed')}
          >
            <span className="tab-icon">🟡</span>
            <span className="tab-label">
              <span className="tab-label-full">Closed Market</span>
              <span className="tab-label-short">Closed</span>
            </span>
            <span className="tab-count">{markets.filter(m => m.status === 1).length}</span>
          </button>
          <button 
            className={`tab ${activeTab === 'resolved' ? 'active' : ''}`}
            onClick={() => setActiveTab('resolved')}
          >
            <span className="tab-icon">🟢</span>
            <span className="tab-label">
              <span className="tab-label-full">Resolved Market</span>
              <span className="tab-label-short">Resolved</span>
            </span>
            <span className="tab-count">{markets.filter(m => m.status === 2).length}</span>
          </button>
        </div>
        <div className="market-tabs my-bets-tabs">
          <button 
            className={`tab my-bets-btn ${activeTab === 'my-bets' ? 'active' : ''}`}
            onClick={() => setActiveTab('my-bets')}
          >
            <span className="tab-icon">💰</span>
            My Bets
            <span className="tab-count">{marketsWithBets.size}</span>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="market-search-container">
        <div className="market-search-wrapper">
          <div className="market-search">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              placeholder="Search markets by question..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="search-input"
            />
            {searchQuery && (
              <button
                className="search-clear"
                onClick={() => setSearchQuery('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          <button
            className="market-refresh-btn"
            onClick={fetchMarkets}
            disabled={isLoading}
            aria-label="Refresh markets"
            title="Refresh markets"
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
        {searchQuery && (
          <div className="search-results-count">
            {filteredMarkets.length} {filteredMarkets.length === 1 ? 'market' : 'markets'} found
          </div>
        )}
      </div>

      {/* Category Filters */}
      <div className="category-filters">
        <button
          className={`category-filter-btn ${!selectedCategory ? 'active' : ''}`}
          onClick={() => setSelectedCategory(null)}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`category-filter-btn ${selectedCategory === cat ? 'active' : ''}`}
            onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
            style={selectedCategory === cat ? {
              borderColor: CATEGORY_COLORS[cat],
              color: CATEGORY_COLORS[cat],
            } : {}}
          >
            <span>{CATEGORY_ICONS[cat]}</span>
            <span>{cat}</span>
            {categoryCounts[cat] > 0 && (
              <span 
                className="category-count"
                style={selectedCategory === cat ? {
                  background: CATEGORY_COLORS[cat],
                  color: 'white',
                } : {}}
              >
                {categoryCounts[cat]}
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading || loading ? (
        <p className="loading">Loading markets...</p>
      ) : filteredMarkets.length === 0 ? (
        <p className="no-markets">No {activeTab} markets found.</p>
      ) : (
        <div className="markets-grid">
          {filteredMarkets.map((market) => (
            <div 
              key={market.id} 
              className="market-card"
              onClick={() => onMarketSelect(market.id)}
            >
              <div className="market-header">
                <div className="market-header-top">
                  <span className="market-id">#{market.id}</span>
                  {market.category && (
                    <span
                      className="category-badge"
                      style={{
                        background: `${CATEGORY_COLORS[market.category]}20`,
                        color: CATEGORY_COLORS[market.category],
                        borderColor: `${CATEGORY_COLORS[market.category]}50`,
                      }}
                    >
                      {CATEGORY_ICONS[market.category]} {market.category}
                    </span>
                  )}
                  <span className={`status-badge ${getStatusClass(market.status, market.endTime)}`}>
                    {getStatusText(market.status, market.endTime)}
                  </span>
                  {activeTab === 'my-bets' && marketsWithBets.has(market.id) && (
                      <span className={`bet-badge ${
                        market.hasClaimed && market.status === 2 ? 'bet-claimed' : 
                        market.userBetWon === true ? 'bet-won' :
                        market.userBetWon === false ? 'bet-lost' : ''
                      }`}>
                        {market.hasClaimed && market.status === 2 ? (
                          <>💰 Bet Claimed</>
                        ) : market.userBetWon === true ? (
                          <>💰 Bet Won</>
                        ) : market.userBetWon === false ? (
                          <>💸 Bet Lost</>
                        ) : (
                          <>💰 Bet Placed</>
                      )}
                    </span>
                  )}
                </div>
                <h3>{getDisplayQuestion(market.question)}</h3>
              </div>
              
              <div className="market-info">
                <p>
                  <strong>{Date.now() / 1000 >= Number(market.endTime) ? 'Ended' : 'Ends'}</strong>{' '}
                  {formatDate(Number(market.endTime))}
                </p>
                <p>
                  <strong>{market.status === 2 && market.outcomeDecrypted ? 'Resolved' : 'Resolves'}</strong>{' '}
                  {formatDate(Number(market.resolutionTime))}
                </p>
              </div>
              
              {/* Show volumes section for resolved markets or in My Bets view */}
              {(market.status === 2 || activeTab === 'my-bets') && (
                <div className="market-volumes">
                  <div className="volume-yes">
                    <div>
                      {market.volumesDecrypted
                        ? `${ethers.formatEther(market.decryptedVolumeYes * BigInt(1e9))} ETH`
                        : '🔒'}
                    </div>
                    <span>YES</span>
                  </div>
                  <div className="volume-no">
                    <div>
                      {market.volumesDecrypted
                        ? `${ethers.formatEther(market.decryptedVolumeNo * BigInt(1e9))} ETH`
                        : '🔒'}
                    </div>
                    <span>NO</span>
                  </div>
                </div>
              )}
              
              {/* Show outcome for resolved markets or in My Bets view */}
              {(market.status === 2 || activeTab === 'my-bets') && (
                <div className="outcome">
                  {market.outcomeDecrypted
                    ? (market.outcomeValue ? 'YES Won' : 'NO Won')
                    : '🔒'}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
