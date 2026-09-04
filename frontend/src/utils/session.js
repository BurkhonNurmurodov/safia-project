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
 *
 * ── A tab-scoped session ─────────────────────────────────────────────────────
 * `tab: true` is the third storage mode and it exists for one caller: the
 * admin's «open as this profile», which opens a NEW TAB signed in as somebody
 * else. localStorage is shared by every tab of the origin, so a session that
 * wrote there — or, just as bad, DELETED the key there on its way in, which is
 * what `remember: false` does — would reach across into the admin's own tabs
 * and sign them out of their own account. A tab session therefore touches
 * sessionStorage and nothing else, in either direction: it never writes to
 * localStorage, never removes from it, and `clearToken()` leaves it alone. It
 * dies with the tab, which is exactly the life an impersonated session wants.
 *
 * ── Web Storage is not guaranteed ────────────────────────────────────────────
 * Every touch below is wrapped, and not defensively-for-its-own-sake: quota
 * exhaustion (this app writes a `usePersistentState` key per page per filter),
 * a WebView that partitions or blocks storage, and private-mode variants all
 * throw here — some on `setItem`, some on merely NAMING `localStorage`.
 *
 * So the token is mirrored in module memory, and that mirror WINS whenever a
 * write failed (`memOnly`). Without it a failed write produced a session with
 * no token at all, silently: the boot call needs no token, so the app rendered
 * a complete signed-in shell — sidebar, name, role — while every data request
 * went out anonymous and came back 401 "Not authenticated" on every page.
 * A page load is the mirror's lifetime, which is the honest ceiling: storage
 * that cannot hold a token cannot survive a reload either.
 */
const TOKEN_KEY = "tg_token";
const WEB_KEY = "web_session";
const TAB_KEY = "tab_session";

// The live session, independent of whether storage agreed to hold it.
let memToken = "";
let memWeb = false;
let memRemember = true;
let memTab = false;
// Set when a write failed. The mirror is then the ONLY current copy and must
// outrank storage, which may still be holding the PREVIOUS session's token.
let memOnly = false;

/** Read one key. `pick` is a thunk because naming a Storage object can itself
 *  throw when the embedding context blocks it. */
function read(pick, key) {
  try {
    return pick().getItem(key) || "";
  } catch {
    return "";
  }
}

export function getToken() {
  if (memOnly) return memToken;
  return (
    read(() => sessionStorage, TOKEN_KEY) ||
    read(() => localStorage, TOKEN_KEY) ||
    // Storage readable but empty while the mirror is set = a write that failed
    // without throwing (some WebViews accept setItem and drop it).
    memToken
  );
}

export function setToken(token, { remember = true, web = false, tab = false } = {}) {
  // Mirror first and unconditionally: whatever storage does below, this page
  // load has a working session.
  memToken = token;
  memWeb = web;
  // A tab session is never "remembered" — it lives in this tab and nowhere else.
  memRemember = tab ? false : remember;
  memTab = tab;
  memOnly = false;

  try {
    const store = remember && !tab ? localStorage : sessionStorage;
    // Write BEFORE clearing anything. The old order (clearToken() first, then
    // write) turned any storage failure into a total session loss: the previous
    // token was already gone and the new one never landed.
    store.setItem(TOKEN_KEY, token);
    // Explicit both ways — the leading clearToken() used to be what removed a
    // stale flag, so a Telegram login after a browser one would otherwise
    // inherit web_session=1 and stop sending its initData header.
    if (web) store.setItem(WEB_KEY, "1");
    else store.removeItem(WEB_KEY);
    if (tab) store.setItem(TAB_KEY, "1");
    else store.removeItem(TAB_KEY);
  } catch {
    memOnly = true;
  }

  // The losing store must not keep a second, older token around — EXCEPT for a
  // tab session, whose losing store is the shared one every other tab reads.
  if (tab) return;
  try {
    const other = remember ? sessionStorage : localStorage;
    other.removeItem(TOKEN_KEY);
    other.removeItem(WEB_KEY);
    other.removeItem(TAB_KEY);
  } catch {
    /* blocked — then nothing was ever written there either */
  }
}

export function clearToken() {
  // Asked BEFORE the mirror is reset: ending a tab-scoped session must not
  // reach into localStorage, where the session of every other tab lives. This
  // is not only about the sign-out button — the dead-session handler in
  // utils/api.js clears the token too, and a 401 in an impersonated tab used to
  // be enough to sign the admin out of their own.
  const tabOnly = isTabSession();
  memToken = "";
  memWeb = false;
  memRemember = true;
  memTab = false;
  memOnly = false;
  const stores = tabOnly
    ? [() => sessionStorage]
    : [() => localStorage, () => sessionStorage];
  for (const pick of stores) {
    try {
      const store = pick();
      store.removeItem(TOKEN_KEY);
      store.removeItem(WEB_KEY);
      store.removeItem(TAB_KEY);
    } catch { /* storage blocked */ }
  }
}

/** True when the stored token came from the password login rather than Telegram. */
export function isWebSession() {
  if (memOnly) return memWeb;
  return (
    read(() => sessionStorage, WEB_KEY) === "1" ||
    read(() => localStorage, WEB_KEY) === "1" ||
    memWeb
  );
}

/** True when the live session belongs to THIS TAB alone — the impersonation
 *  session an admin opened. Callers re-issuing a token must preserve it, or the
 *  new token lands in localStorage and takes over every other tab. */
export function isTabSession() {
  if (memOnly) return memTab;
  return read(() => sessionStorage, TAB_KEY) === "1" || memTab;
}

/**
 * Did the live session tick "remember me" (localStorage) rather than "this tab
 * only" (sessionStorage)? Callers re-issuing a token must preserve that choice;
 * probing localStorage directly gets it wrong once the mirror is in play, and
 * throws outright where storage is blocked. Precedence matches getToken(), so
 * the answer describes the token getToken() would actually return.
 */
export function isRemembered() {
  if (memOnly) return memRemember;
  if (read(() => sessionStorage, TOKEN_KEY)) return false;
  if (read(() => localStorage, TOKEN_KEY)) return true;
  return memRemember;
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
