/**
 * The browser's profile wallet — the several password logins one machine keeps
 * signed in at once.
 *
 * A browser session is bound to ONE profile (the credential names it), so the
 * Telegram role-switcher is deliberately empty here: `roles: []`. The wallet is
 * the browser's answer to the same need — instead of moving a session to a
 * profile its password was never issued for, it holds one FULL session per
 * profile and swaps which is active.
 *
 * ── What is stored ───────────────────────────────────────────────────────────
 * The JWT the login returned, plus what a menu row needs to render (name, role,
 * username). NEVER the password: it goes to the server once and is not kept.
 *
 * The consequence is worth stating plainly, because it is the whole security
 * trade of this feature: while a profile sits in the wallet, anyone at that
 * browser can switch into it WITHOUT knowing its password. That is the same
 * bargain "remember me" already makes for one profile, extended to several —
 * which is exactly why each row keeps its OWN remember choice below.
 *
 * ── Where it is stored ───────────────────────────────────────────────────────
 * Per row, by that row's own "remember me", mirroring session.js:
 *   ticked   → localStorage   (survives a browser restart)
 *   unticked → sessionStorage (the browser discards it when the tab closes)
 * So a person can add their own profile remembered and a colleague's for one
 * shift only, and the shared PC forgets the colleague on close without being
 * told to. Reads merge both, sessionStorage first — a per-tab row is always the
 * more recent intent when a username somehow sits in both.
 *
 * Every touch is wrapped: quota exhaustion, partitioned WebView storage and
 * private-mode variants all throw here, some on merely NAMING localStorage. A
 * module-memory mirror covers a failed write for the rest of the page load,
 * which is the honest ceiling — storage that cannot hold a row cannot survive a
 * reload either.
 */
const KEY = "web_profiles";

// Last thing we tried to store, whether or not storage agreed to hold it.
let mem = [];

/** `pick` is a thunk: naming a Storage object can itself throw. */
function readStore(pick) {
  try {
    const raw = pick().getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // A row with no token cannot be switched into, so it is not a row.
    return list.filter((e) => e && e.username && e.token);
  } catch {
    return [];
  }
}

function writeStore(pick, list) {
  try {
    const store = pick();
    if (list.length) store.setItem(KEY, JSON.stringify(list));
    else store.removeItem(KEY);
  } catch {
    /* blocked or full — the memory mirror below is then the only copy */
  }
}

/** Replace in place when the username is already held, else append. Position is
 *  insertion order, which is the order the menu lists them in. */
function upsert(list, entry) {
  const at = list.findIndex((e) => e.username === entry.username);
  if (at === -1) return [...list, entry];
  const next = list.slice();
  next[at] = entry;
  return next;
}

/** Every profile this browser is signed in as, active one included. */
export function listProfiles() {
  const perTab = readStore(() => sessionStorage);
  const kept = readStore(() => localStorage).filter(
    (e) => !perTab.some((x) => x.username === e.username)
  );
  const stored = [...perTab, ...kept];
  // Storage readable but empty while the mirror holds rows = a write that failed
  // (some WebViews accept setItem and drop it).
  return stored.length ? stored : mem;
}

export function findProfile(username) {
  return listProfiles().find((e) => e.username === username) || null;
}

/**
 * Add a profile, or refresh the one already held under that username.
 * The username is the key: it is unique per credential server-side, and it is
 * what the person typed, so re-adding a profile updates its row instead of
 * growing a second one.
 */
export function saveProfile({ username, full_name, role, role_ref, token, remember }) {
  if (!username || !token) return null;
  const entry = {
    username,
    full_name: full_name || "",
    role: role || "",
    role_ref: role_ref ?? null,
    token,
    remember: Boolean(remember),
  };

  const mine = remember ? () => localStorage : () => sessionStorage;
  const other = remember ? () => sessionStorage : () => localStorage;
  writeStore(mine, upsert(readStore(mine), entry));
  // The losing store must not keep an older copy of the same row — that is how
  // a profile un-ticking "remember me" would stay on the machine anyway.
  writeStore(other, readStore(other).filter((e) => e.username !== username));

  mem = upsert(mem, entry);
  return entry;
}

export function removeProfile(username) {
  for (const pick of [() => localStorage, () => sessionStorage]) {
    const list = readStore(pick);
    if (list.some((e) => e.username === username)) {
      writeStore(pick, list.filter((e) => e.username !== username));
    }
  }
  mem = mem.filter((e) => e.username !== username);
}
