import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { creaServizi } from './servizi'
import { ProviderApp } from './ui/contesto'

// riduce il rischio di evacuazione dello storage da parte di iOS (§1)
void navigator.storage?.persist?.().catch(() => {})

void creaServizi().then((servizi) => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ProviderApp servizi={servizi}>
        <App />
      </ProviderApp>
    </StrictMode>,
  )
})
