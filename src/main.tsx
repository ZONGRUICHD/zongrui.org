import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/jetbrains-mono/index.css'
import RouterApp from './RouterApp'
import './material/material-components'
import { initializeMaterialTheme } from './material/theme'
import './styles.css'
import './gallery/gallery.css'
import './projects/projects.css'
import './material-you.css'
import './pixel-os.css'

initializeMaterialTheme()

try {
  const root = document.documentElement
  root.dataset.motion = window.localStorage.getItem('zongrui-motion') === 'reduced' ? 'reduced' : 'full'
  root.dataset.contrast = window.localStorage.getItem('zongrui-contrast') === 'high' ? 'high' : 'normal'
  const brightness = Math.min(100, Math.max(40, Number(window.localStorage.getItem('zongrui-brightness') ?? 100)))
  root.style.setProperty('--pixel-screen-dim', String((100 - brightness) / 180))
} catch {
  // Storage can be unavailable in private browsing; defaults remain usable.
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterApp />
  </React.StrictMode>,
)
