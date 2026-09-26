import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { prepareCameraFlight } from './lib/raster/camera-flight-preparation'
import { setCameraFlightPreparation } from './store/camera-store'
import { useDocumentStore } from './store/document-store'
import { syncLanguage } from './store/language-store'
import { syncTheme } from './store/theme-store'
import './assets/main.css'

setCameraFlightPreparation((from, target, viewport) =>
  prepareCameraFlight(useDocumentStore.getState().document, from, target, viewport)
)

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
