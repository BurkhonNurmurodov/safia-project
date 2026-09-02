import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { installDomGuard } from './utils/domGuard'

// Read by the boot-diagnostics overlay in index.html
window.__bootStage = 'bundle-start'

// Before the first commit React performs — a DOM somebody else rewrote (a
// translator, a WebView add-on) makes React's own node removal throw, and a
// commit-phase throw costs the whole page. See utils/domGuard.js.
installDomGuard()

// Expand / fullscreen the WebApp as early as possible (before React renders).
// Wrapped in try/catch: a half-initialized Telegram object must never prevent
// React from mounting (seen on Windows machines where the script is intercepted).
try {
  const _tg = window.Telegram?.WebApp
  // `window.Telegram.WebApp` exists in every browser — the SDK is loaded
  // unconditionally by index.html — so its presence is not evidence of running
  // inside Telegram. `platform` is: it stays "unknown" outside a Telegram
  // client. Without this check a plain browser session would fire expand /
  // fullscreen / safe-area calls that can only no-op or warn, and would inherit
  // mobile safe-area padding it has no use for. (Kept inline rather than
  // imported from utils/session.js: this block runs before the bundle's module
  // graph is worth pulling in, and it is the first thing to execute.)
  const _inTelegram = Boolean(_tg?.platform) && _tg.platform !== 'unknown'
  // The /broadcast recipient picker is a small sheet — it must NOT expand or go
  // fullscreen, so it opens compact over the bot chat.
  const _compact = window.location.pathname.startsWith('/broadcast-receivers')
  if (_tg && _inTelegram) {
    _tg.ready()
    if (!_compact) _tg.expand()

    // Fullscreen needs Bot API 8.0+ (client-side); on older Telegram clients
    // requestFullscreen throws WebAppMethodUnsupported, so gate by version.
    const supportsFullscreen = !_compact &&
      typeof _tg.isVersionAtLeast === 'function' && _tg.isVersionAtLeast('8.0')
    if (supportsFullscreen) {
      try { _tg.requestFullscreen() } catch { /* unsupported despite version */ }
    }

    // Only apply safe-area padding on mobile platforms (android/ios).
    const isMobilePlatform = ["android", "ios"].includes(_tg.platform)

    // Android's navigation bar — the ▮ ○ ‹ button strip, or the gesture pill —
    // is drawn ON TOP of a fullscreen Mini App and the user cannot dismiss it.
    // Telegram is supposed to report it as safeAreaInset.bottom, and a number of
    // Android builds report 0 instead; the app then parks its last row of
    // controls underneath the buttons, where it is perfectly visible and
    // impossible to tap. Fullscreen means the WebView spans the whole display,
    // so a 0 there is always wrong — fall back to Android's own nav-bar height
    // (48dp, and 1dp = 1 CSS px at our viewport scale). On a gesture-nav phone
    // whose client under-reports this costs ~24px of extra clearance; trusting
    // the 0 costs the user a button they can see but never press.
    const ANDROID_NAV_BAR = 48
    const androidNavFloor = () =>
      _tg.platform === 'android' && _tg.isFullscreen ? ANDROID_NAV_BAR : 0

    const applySafeArea = () => {
      // Empty objects off mobile, so every inset below resolves to 0 there.
      const dev = isMobilePlatform ? (_tg.safeAreaInset || {}) : {}
      const con = isMobilePlatform ? (_tg.contentSafeAreaInset || {}) : {}
      const sum = (a, b) => (a ?? 0) + (b ?? 0)
      const root = document.documentElement.style
      root.setProperty('--tg-safe-top', `${sum(dev.top, con.top)}px`)
      // Landscape moves the Android nav bar to a side edge. Without these a wide
      // table runs under the buttons instead of stopping at the app's own edge.
      root.setProperty('--tg-safe-left',  `${sum(dev.left,  con.left)}px`)
      root.setProperty('--tg-safe-right', `${sum(dev.right, con.right)}px`)
      // Bottom inset = whatever the OS draws OVER the fullscreen WebApp's lower
      // edge (Android nav bar, gesture pill, iOS home indicator). Three sources,
      // largest wins at use time: what Telegram reports, what the OS reports
      // through env() — live since index.html declares viewport-fit=cover — and
      // the Android floor above, used only when Telegram reports nothing.
      const reported = sum(dev.bottom, con.bottom)
      root.setProperty(
        '--tg-safe-bottom',
        `max(${reported}px, env(safe-area-inset-bottom, 0px), ${reported ? 0 : androidNavFloor()}px)`,
      )
    }
    applySafeArea()
    _tg.onEvent?.('safeAreaChanged', applySafeArea)
    _tg.onEvent?.('contentSafeAreaChanged', applySafeArea)
    // Rotating the device moves the bar between the bottom edge and a side, and
    // Telegram does not always follow that with a safeAreaChanged of its own.
    _tg.onEvent?.('viewportChanged', applySafeArea)

    if (supportsFullscreen) {
      // Fullscreen is requested ONCE, at boot. Leaving it is the user's call —
      // the chevron in Telegram's header is a control they can see, so an app
      // that snaps straight back reads as broken rather than as opinionated.
      // Only the insets are re-read: exiting fullscreen hands the system bars
      // back to Telegram's own container, which is a safe-area change.
      _tg.onEvent?.('fullscreenChanged', applySafeArea)
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
