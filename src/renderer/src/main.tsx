import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { syncLanguage } from './store/language-store'
import { syncTheme } from './store/theme-store'
import './assets/main.css'

syncTheme()
syncLanguage()

const root = document.getElementById('root')
if (!root) {
  throw new Error('Missing #root element')
}
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
)
