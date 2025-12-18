import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Buffer } from 'buffer'
import './styles/index.css'
import App from './App.tsx'
import { FHEProvider } from './contexts/FHEContext'

// Polyfill for Node.js globals
if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).global = globalThis
  ;(globalThis as any).Buffer = Buffer
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FHEProvider>
      <App />
    </FHEProvider>
  </StrictMode>,
)

