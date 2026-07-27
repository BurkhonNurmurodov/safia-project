/**
 * Render mode — the app as loaded by the server's headless Chromium when the
 * bot is asked for a screenshot of a page (`/ojidaniya` → `/downtime?render=…`).
 *
 * Three things change in this mode:
 *
 *  1. **Auth.** There is no Telegram WebView, so no initData. The `render`
 *     token in the URL is a bot-minted, 3-minute HMAC credential that
 *     `/api/auth/webapp` accepts in its place and resolves to the requesting
 *     user's own session — no more (backend: `app/render_token.py`).
 *  2. **Chrome.** Sidebar, header and page-enter animation are dropped so the
 *     PNG is the page's content, not a picture of the app frame.
 *  3. **Readiness.** `window.__RENDER_READY__` flips to true once every query
 *     has settled, so Chromium shoots a page with data on it instead of
 *     skeletons. See `app/services/page_shot.py`.
 *
 * Read once at module load: the token is consumed by the very first request and
 * the mode never changes mid-session.
 */
const token = new URLSearchParams(window.location.search).get("render") || "";

export const RENDER_TOKEN = token;
export const IS_RENDER = Boolean(token);

/** The value the X-Telegram-Init-Data header carries in render mode. */
export const RENDER_INIT_DATA = `render:${token}`;

if (IS_RENDER) {
  // Drives the CSS that freezes animations and hides interactive-only chrome.
  document.documentElement.classList.add("render-mode");
  window.__RENDER_READY__ = false;
}
