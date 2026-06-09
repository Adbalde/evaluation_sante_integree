//  main.jsx — Point d'entrée de l'application React
//  Ce fichier monte l'application dans le DOM (index.html)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

// Styles globaux minimes (reset CSS)
const styleGlobal = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; }
  input, textarea, select, button { font-family: inherit; }
  a { text-decoration: none; color: inherit; }
`

// Injecte les styles globaux dans le <head>
const styleEl = document.createElement('style')
styleEl.textContent = styleGlobal
document.head.appendChild(styleEl)

// Monte l'application React dans le div#root de index.html
// StrictMode active des avertissements supplémentaires en développement
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
