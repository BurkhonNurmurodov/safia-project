import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Read by the boot-diagnostics overlay in index.html
window.__bootStage = 'bundle-start'

// Expand / fullscreen the WebApp as early as possible (before React renders).
// Wrapped in try/catch: a half-initialized Telegram object must never prevent
// React from mounting (seen on Windows machines where the script is intercepted).
try {
  const _tg = window.Telegram?.WebApp
  if (_tg) {
    _tg.ready()
    _tg.expand()

    // Fullscreen needs Bot API 8.0+ (client-side); on older Telegram clients
    // requestFullscreen throws WebAppMethodUnsupported, so gate by version.
    const supportsFullscreen =
      typeof _tg.isVersionAtLeast === 'function' && _tg.isVersionAtLeast('8.0')
    if (supportsFullscreen) {
      try { _tg.requestFullscreen() } catch { /* unsupported despite version */ }
    }

    // Only apply safe-area padding on mobile platforms (android/ios).
    const isMobilePlatform = ["android", "ios"].includes(_tg.platform)
    const applySafeArea = () => {
      const deviceTop  = isMobilePlatform ? (_tg.safeAreaInset?.top ?? 0) : 0
      const contentTop = isMobilePlatform ? (_tg.contentSafeAreaInset?.top ?? 0) : 0
      document.documentElement.style.setProperty('--tg-safe-top', `${deviceTop + contentTop}px`)
    }
    applySafeArea()
    _tg.onEvent?.('safeAreaChanged', applySafeArea)
    _tg.onEvent?.('contentSafeAreaChanged', applySafeArea)

    if (supportsFullscreen) {
      _tg.onEvent?.('fullscreenChanged', () => {
        if (!_tg.isFullscreen) {
          try { _tg.requestFullscreen() } catch { /* ignore */ }
        }
        applySafeArea()
      })
    }
  }
} catch (e) {
  console.error('Telegram WebApp init failed:', e)
}

window.__bootStage = 'telegram-init-done'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
window.__bootStage = 'react-render-called'
