import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource-variable/jetbrains-mono/index.css'
import RouterApp from './RouterApp'
import './material/material-components'
import { initializeMaterialTheme } from './material/theme'
import './app.css'

initializeMaterialTheme()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterApp />
  </React.StrictMode>,
)
