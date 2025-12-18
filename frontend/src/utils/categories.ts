// Market categories/tags utilities
// Since we can't modify the contract, we embed categories as prefixes in the question text
// Format: "[CATEGORY] Question text"

export type Category = 'Crypto' | 'Sports' | 'Politics' | 'Finance' | 'Tech' | 'Other'

export const CATEGORIES: Category[] = ['Crypto', 'Sports', 'Politics', 'Finance', 'Tech', 'Other']

export const CATEGORY_COLORS: Record<Category, string> = {
  Crypto: '#f59e0b', // amber
  Sports: '#10b981', // green
  Politics: '#3b82f6', // blue
  Finance: '#8b5cf6', // purple
  Tech: '#06b6d4', // cyan
  Other: '#6b7280', // gray
}

export const CATEGORY_ICONS: Record<Category, string> = {
  Crypto: '₿',
  Sports: '⚽',
  Politics: '🏛️',
  Finance: '💰',
  Tech: '💻',
  Other: '📌',
}

/**
 * Extracts category from question text if it has a [CATEGORY] prefix
 */
export function extractCategory(question: string): Category | null {
  const match = question.match(/^\[([^\]]+)\]\s*(.*)$/)
  if (match && match[1]) {
    const category = match[1].trim()
    if (CATEGORIES.includes(category as Category)) {
      return category as Category
    }
  }
  return null
}

/**
 * Removes category prefix from question text for display
 */
export function getDisplayQuestion(question: string): string {
  const match = question.match(/^\[([^\]]+)\]\s*(.*)$/)
  if (match && match[2]) {
    return match[2].trim()
  }
  return question
}

/**
 * Formats question with category prefix for storage
 */
export function formatQuestionWithCategory(question: string, category: Category | null): string {
  if (!category || category === 'Other') {
    return question.trim()
  }
  // Check if already has a category prefix
  if (question.match(/^\[([^\]]+)\]/)) {
    // Replace existing category
    return `[${category}] ${getDisplayQuestion(question)}`
  }
  return `[${category}] ${question.trim()}`
}

/**
 * Auto-detect category from question text based on keywords
 */
export function detectCategory(question: string): Category {
  const lowerQuestion = question.toLowerCase()
  
  // Crypto keywords
  if (/bitcoin|btc|ethereum|eth|crypto|blockchain|defi|nft|token|coin|wallet/.test(lowerQuestion)) {
    return 'Crypto'
  }
  
  // Sports keywords
  if (/football|soccer|basketball|baseball|tennis|olympics|world cup|champion|match|game|team/.test(lowerQuestion)) {
    return 'Sports'
  }
  
  // Politics keywords
  if (/election|president|vote|politic|government|senate|congress|democrat|republican/.test(lowerQuestion)) {
    return 'Politics'
  }
  
  // Finance keywords
  if (/stock|market|dollar|eur|gbp|yen|inflation|recession|economy|trade/.test(lowerQuestion)) {
    return 'Finance'
  }
  
  // Tech keywords
  if (/ai|artificial intelligence|apple|google|microsoft|meta|amazon|tech|software|hardware/.test(lowerQuestion)) {
    return 'Tech'
  }
  
  return 'Other'
}

