/**
 * The Android app stays signed in until its person signs out — like any phone
 * app, and unlike a browser tab.
 *
 * The server gives the app a year-long session (`web_auth.APP_SESSION_DAYS`,
 * claim `app`), and this keeps it from ever running out: whenever the app opens
 * or comes back to the screen, every session it holds — the active one and each
 * profile in the wallet — that is more than a day old is re-issued for another
 * year (POST /api/auth/web/refresh). So only a phone left unopened for a whole
 * year meets the login screen again. A session signed in before this existed (a
 * 12-hour or 30-day browser token) becomes an app session the first time, so
 * nobody already signed in is asked for a password.
 *
 * Revocation is untouched: the server re-checks every request, so a password
 * change, a disabled login or «sign out everywhere» still ends an app session
 * at once — the 401 lands in utils/api.js like any other dead session.
 *
 * Browsers are untouched too: nothing here runs outside the app, and the server
 * refuses to renew a browser tab's session.
 */
import api from "./api";
import {
  getToken, inAndroidApp, isTabSession, isWebSession, setToken, tokenClaims,
} from "./session";
import { listProfiles, replaceProfileToken } from "./profileWallet";

const RENEW_AFTER_S = 24 * 3600;

// Tokens the server would not renew during this page load (dead, or not a
// session the app may keep): asked again only after a reload, never in a loop.
const refused = new Set();
let running = null;

function due(token) {
  if (!token || refused.has(token)) return false;
  const c = tokenClaims(token);
  if (!c || !c.web || c.imp) return false;
  if (!c.app) return true; // a browser-length session: make it an app one
  return Date.now() / 1000 - (Number(c.iat) || 0) > RENEW_AFTER_S;
}

async function renew(token) {
  try {
    const r = await api.post("/api/auth/web/refresh", {}, { _token: token });
    return r.data?.token || null;
  } catch (e) {
    const status = e?.response?.status;
    // 401/403 is an answer about this token; anything else (offline, a
    // restart) is not, and the next return to the app tries again.
    if (status === 401 || status === 403) refused.add(token);
    return null;
  }
}

/** Renew what is due. Cheap when nothing is (no request at all). */
export function keepAppSignedIn() {
  if (!inAndroidApp() || !isWebSession() || isTabSession()) return Promise.resolve();
  if (running) return running;
  running = (async () => {
    const active = getToken();
    if (due(active)) {
      const fresh = await renew(active);
      if (fresh) {
        // Only while the same session is still the active one: a profile
        // switch or a sign-out made in the meantime wins.
        if (getToken() === active) setToken(fresh, { remember: true, web: true });
        replaceProfileToken(active, fresh);
      }
    }
    for (const row of listProfiles()) {
      if (row.token === getToken() || !due(row.token)) continue;
      const fresh = await renew(row.token);
      if (fresh) replaceProfileToken(row.token, fresh);
    }
  })().finally(() => { running = null; });
  return running;
}
