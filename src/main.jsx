import React from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import { registerSW } from 'virtual:pwa-register'
import { AppProvider } from './lib/store.jsx'
import App from './App.jsx'
import ErrorBoundary, { reloadOnce } from './components/ErrorBoundary.jsx'
import '@fontsource/dm-sans/400.css'
import '@fontsource/dm-sans/500.css'
import '@fontsource/dm-sans/600.css'
import '@fontsource/dm-sans/700.css'
import '@fontsource/playfair-display/600.css'
import '@fontsource/playfair-display/700.css'
import './index.css'

registerSW({ immediate: true })
// Fichier de mise à jour introuvable (nouvelle version publiée) : un seul rechargement automatique
window.addEventListener('vite:preloadError', (e) => { if (reloadOnce()) e.preventDefault() })
window.addEventListener('load', () => setTimeout(() => { try { sessionStorage.removeItem('tb-reloaded') } catch { /* rien */ } }, 8000))

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
      <ErrorBoundary>
        <AppProvider>
          <App />
        </AppProvider>
      </ErrorBoundary>
    </HashRouter>
  </React.StrictMode>
)
