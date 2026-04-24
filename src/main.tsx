import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import '@/fonts/registry'
import { preloadCuratedFonts } from '@/fonts/preload'
import App from './App.tsx'

preloadCuratedFonts()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
