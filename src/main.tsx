import React from 'react'
import ReactDOM from 'react-dom/client'
import '@fontsource/barlow-condensed/latin-700.css'
import '@fontsource/barlow-condensed/latin-800.css'
import '@fontsource/barlow-condensed/latin-900.css'
import '@fontsource/barlow-condensed/latin-900-italic.css'
import '@fontsource/titillium-web/latin-600.css'
import '@fontsource/titillium-web/latin-700.css'
import '@fontsource-variable/jetbrains-mono/index.css'
import RouterApp from './RouterApp'
import './styles.css'
import './f1/f1.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterApp />
  </React.StrictMode>,
)
