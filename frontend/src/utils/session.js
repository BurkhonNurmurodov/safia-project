/**
 * Where the session token lives.
 *
 * Telegram sessions keep using localStorage exactly as before — the WebView is
 * per-user and the token is re-minted from initData at every launch anyway.
 *
 * Browser sessions honour the login form's "remember me": ticked writes to
 * localStorage (a month on a personal machine), unticked writes to
 * sessionStorage, which the browser discards when the tab closes. That is the
 * part users actually rely on — a shared factory PC must not still be signed in
 * tomorrow morning — so it is enforced by the STORAGE, not only by the token's
 * own expiry.
 *
 * Reads check sessionStorage first: a per-tab token is always the more recent
 * intent when both happen to exist.
 */
const TOKEN_KEY = "tg_token";
const WEB_KEY = "web_session";

export function getToken() {
  try {
    return sessionStorage.getItem(TOKEN_KEY) || localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setToken(token, { remember = true, web = false } = {}) {
  try {
    clearToken();
    const store = remember ? localStorage : sessionStorage;
    store.setItem(TOKEN_KEY, token);
    if (web) store.setItem(WEB_KEY, "1");
  } catch {
    /* storage blocked (private mode / embedded webview) — the in-memory
       session still works until the page is reloaded */
  }
}

export function clearToken() {
  for (const store of [localStorage, sessionStorage]) {
    try {
      store.removeItem(TOKEN_KEY);
      store.removeItem(WEB_KEY);
    } catch { /* storage blocked */ }
  }
}

/** True when the stored token came from the password login rather than Telegram. */
export function isWebSession() {
  try {
    return sessionStorage.getItem(WEB_KEY) === "1" || localStorage.getItem(WEB_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Is the app running inside a real Telegram client?
 *
 * `window.Telegram.WebApp` exists in every browser — index.html loads the SDK
 * unconditionally — so its presence proves nothing. `platform` is what actually
 * differs: Telegram sets it to android/ios/tdesktop/web, and it stays "unknown"
 * everywhere else. Keyboard-button launches (which arrive with EMPTY initData)
 * are still correctly identified as Telegram by this check, which is the whole
 * reason it does not test initData.
 */
export function inTelegram() {
  const platform = window.Telegram?.WebApp?.platform;
  return Boolean(platform) && platform !== "unknown";
}
