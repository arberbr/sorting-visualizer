import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { applyTheme, DARK } from './render/theme'
import './styles/global.css'

applyTheme(DARK)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
