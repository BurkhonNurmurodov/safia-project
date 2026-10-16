/**
 * The device keeps what the pages loaded — and shows it when there is no
 * connection (the operator, 2026-10-16: «save caches like Instagram does; it
 * should show the things loaded when it was online even with no internet»).
 *
 * Two things live in ONE IndexedDB store (`safia-cache`, `rows`):
 *
 *   • every react-query answer, one row per query, written after each
 *     successful fetch and read back the first time a query mounts with no
 *     data in memory — the query then shows the stored answer at once and
 *     re-reads from the server in the background, exactly as react-query
 *     already treats data a page still holds in memory from a minute ago;
 *   • the BOOT payload — the answer of `/api/auth/web/session`, keyed by a
 *     hash of the session token — so a browser or the Android app can open
 *     the app on cached identity when the session check itself cannot reach
 *     the server (context/AuthContext.jsx).
 *
 * `queryPersister` is wired as the query client's default `persister`
 * (App.jsx), so every `useQuery` on the platform takes part without knowing
 * it. Deliberately not the TanStack persist plugin: that one serialises the
 * WHOLE cache on every change (the /leaders register alone is ~20 MB), while
 * this writes one row for the one query that moved.
 *
 * Rules, each bought for a reason:
 *
 *   • Rows are SCOPED to the signed-in profile (`setCacheScope`, from the
 *     session payload): a wallet switch or a colleague signing in on a shared
 *     PC must never be handed the previous person's pages. Signing out clears
 *     the profile's rows (`clearCacheScope`). An impersonated tab («open as»)
 *     has no scope and caches nothing.
 *   • Nothing is persisted or restored during an exam («Imtihon»): the exam
 *     rewrites every URL onto the sandbox under the SAME query keys, so a
 *     restore would show real rows in the exam and a save would put fixture
 *     rows under real keys.
 *   • A row is trusted for `MAX_AGE_MS` and for the MINOR version it was
 *     written under — the version is in the KEY, because a payload's shape
 *     changes with a release (the Versioning section: a MINOR is where a
 *     visible change is recorded) and a page given last week's shape can
 *     crash on a field that did not exist then. Old rows are purged by key
 *     without loading their values.
 *   • Only JSON is stored: a Blob (photos, workbooks) or a function is not,
 *     and a query may opt out with `meta: { persist: false }`; `DENY` lists
 *     the keys that must never be served from yesterday (the build marker —
 *     a stale one would announce an update that is not there — the exam's
 *     own state, the assistant's polling).
 *   • Every read is BOUNDED (READ_TIMEOUT_MS) and the first failure turns
 *     the cache off for the session: the read sits inside a query's fetch,
 *     and an IndexedDB that hangs (a WebView in a locked-down mode) must
 *     cost one slow request, never every page. Writes are deferred past the
 *     paint and throttled per key (a query polling every second writes at
 *     most every MIN_WRITE_GAP_MS).
 *   • Nothing a person CHANGES is queued here. Reads are served from the
 *     device; a write made offline fails and says so — an approval or an
 *     attendance change replayed hours later behind somebody's back is not
 *     a feature.
 */
import { isExamOn } from "./examMode";
import { tokenClaims } from "./session";
import { APP_VERSION } from "./version";

const DB_NAME = "safia-cache";
const DB_VERSION = 1;
const STORE = "rows";
const READ_TIMEOUT_MS = 2_000;
const CLEAR_TIMEOUT_MS = 1_500;
const MAX_AGE_MS = 7 * 86_400_000;
const BOOT_MAX_AGE_MS = 45 * 86_400_000;
const MIN_WRITE_GAP_MS = 5_000;
const WRITE_DELAY_MS = 1_200;
const MAX_TEXT = 30_000_000;
const PURGE_EVERY_MS = 6 * 3_600_000;
const PURGE_MARK = "safia_cache_purged_at";

// MAJOR.MINOR — a row from another minor is never read (see the header).
const BUST = APP_VERSION.split(".").slice(0, 2).join(".");
// The session payload's shape moves only with a MAJOR.
const BOOT_BUST = APP_VERSION.split(".")[0];
const Q_PREFIX = `q|${BUST}|`;
const B_PREFIX = `b|${BOOT_BUST}|`;

// Query keys (their first element) that are never stored or restored.
const DENY = new Set(["build-info", "exam-me", "assistant", "stall"]);

let dbPromise = null;
let disabled = typeof indexedDB === "undefined";
let scope = "";
const pendingWrites = new Map(); // row key → timer
const lastWrite = new Map();     // row key → ms
let purgeArmed = false;

// ── IndexedDB plumbing ──────────────────────────────────────────────────────

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const s = db.createObjectStore(STORE, { keyPath: "k" });
        s.createIndex("at", "at");
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // Another tab upgrading the schema later: let go and re-open on demand.
      db.onversionchange = () => {
        try { db.close(); } catch { /* already closed */ }
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error("indexedDB open failed"));
    req.onblocked = () => reject(new Error("indexedDB open blocked"));
  });
  dbPromise.catch(() => { dbPromise = null; });
  return dbPromise;
}

function tx(mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        let t;
        try {
          t = db.transaction(STORE, mode);
        } catch (e) {
          reject(e);
          return;
        }
        let out;
        try {
          out = fn(t.objectStore(STORE));
        } catch (e) {
          reject(e);
          return;
        }
        t.oncomplete = () => resolve(out && typeof out === "object" && "result" in out ? out.result : out);
        t.onerror = () => reject(t.error || new Error("transaction failed"));
        t.onabort = () => reject(t.error || new Error("transaction aborted"));
      }),
  );
}

/** Resolve `undefined` (a miss) when `promise` has not settled in `ms`. */
function bounded(promise, ms, onTimeout) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      onTimeout?.();
      resolve(undefined);
    }, ms);
    promise.then(
      (v) => { if (!done) { done = true; clearTimeout(timer); resolve(v); } },
      () => { if (!done) { done = true; clearTimeout(timer); onTimeout?.(); resolve(undefined); } },
    );
  });
}

function giveUp() {
  // One failure or one hang is enough: the next page must not pay it again.
  disabled = true;
}

function read(k) {
  if (disabled) return Promise.resolve(undefined);
  return bounded(tx("readonly", (s) => s.get(k)), READ_TIMEOUT_MS, giveUp);
}

function put(row) {
  if (disabled) return Promise.resolve();
  return tx("readwrite", (s) => s.put(row)).catch(() => {});
}

function del(k) {
  if (disabled) return Promise.resolve();
  return tx("readwrite", (s) => s.delete(k)).catch(() => {});
}

function deleteKeysWhere(test) {
  return tx("readwrite", (s) => {
    const req = s.openKeyCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return;
      if (test(String(c.primaryKey))) s.delete(c.primaryKey);
      c.continue();
    };
  });
}

// ── scope ──────────────────────────────────────────────────────────────────

/** The profile a session payload belongs to — the one axis rows are kept by. */
export function scopeOf(data) {
  if (!data) return "";
  if (data.profile_key) return String(data.profile_key);
  return `${data.role || ""}:${data.active_role_ref ?? data.role_id ?? ""}:${data.telegram_id ?? data.id ?? ""}`;
}

export function setCacheScope(s) {
  scope = s ? String(s) : "";
  if (scope) armPurge();
}

export function getCacheScope() { return scope; }

/** Adopt the scope of an approved session — never an impersonated one. */
export function adoptCacheScope(data) {
  if (!data || data.status !== "approved" || data.impersonated) return;
  setCacheScope(scopeOf(data));
}

/** Forget a profile's rows (signing out). Bounded: the caller is about to leave the page. */
export function clearCacheScope(s = scope) {
  if (!s || disabled) return Promise.resolve();
  const prefix = `${Q_PREFIX}${s}|`;
  return bounded(deleteKeysWhere((k) => k.startsWith(prefix)), CLEAR_TIMEOUT_MS);
}

// ── the query persister ────────────────────────────────────────────────────

function rowKey(query) {
  return `${Q_PREFIX}${scope}|${query.queryHash}`;
}

/** Would this query ever be served from the device? The band counts the
 *  sections still waiting offline over exactly these — a denied key (the exam
 *  state, the build marker) is not a section the reader is missing. */
export function cacheable(query) {
  if (query.meta?.persist === false) return false;
  return !DENY.has(String(query.queryKey?.[0]));
}

function eligible(query) {
  if (!scope || disabled || isExamOn()) return false;
  return cacheable(query);
}

function storable(data) {
  if (data === undefined || data === null || typeof data === "function") return false;
  if (typeof Blob !== "undefined" && data instanceof Blob) return false;
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return false;
  if (typeof Response !== "undefined" && data instanceof Response) return false;
  return true;
}

async function restore(k) {
  const row = await read(k);
  if (!row || typeof row.v !== "string") return undefined;
  if (Date.now() - (row.at || 0) > MAX_AGE_MS) {
    del(k);
    return undefined;
  }
  try {
    return { data: JSON.parse(row.v), at: row.at };
  } catch {
    del(k);
    return undefined;
  }
}

function idle(run) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 3_000 });
  else setTimeout(run, 0);
}

function scheduleSave(query, data) {
  if (!storable(data)) return;
  const k = rowKey(query);
  const prev = pendingWrites.get(k);
  if (prev) clearTimeout(prev);
  const sinceLast = Date.now() - (lastWrite.get(k) || 0);
  const delay = WRITE_DELAY_MS + Math.max(0, MIN_WRITE_GAP_MS - sinceLast);
  const timer = setTimeout(() => {
    pendingWrites.delete(k);
    idle(() => {
      let text;
      try {
        text = JSON.stringify(data);
      } catch {
        return;
      }
      if (typeof text !== "string" || text.length > MAX_TEXT) return;
      lastWrite.set(k, Date.now());
      put({ k, v: text, at: query.state?.dataUpdatedAt || Date.now() });
    });
  }, delay);
  pendingWrites.set(k, timer);
}

/**
 * The query client's default `persister` — react-query calls it in place of
 * the query function (`query.options.persister(queryFn, context, query)`).
 *
 * A query with nothing in memory is first answered from the device, with the
 * stored answer's own `dataUpdatedAt` (set in a macrotask, since the fetch
 * that resolves with it stamps "now"), and re-read from the server at once
 * when that makes it stale. Everything else goes to the server as before; a
 * successful answer is written back.
 */
export async function queryPersister(queryFn, ctx, query) {
  const use = eligible(query);
  if (use && query.state.data === undefined) {
    const stored = await restore(rowKey(query));
    if (stored) {
      setTimeout(() => {
        try {
          query.setState({ dataUpdatedAt: stored.at });
          if (query.isStale()) query.fetch();
        } catch { /* the query may be gone */ }
      }, 0);
      return stored.data;
    }
  }
  const result = await queryFn(ctx);
  if (use) scheduleSave(query, result);
  return result;
}

// ── the boot payload ───────────────────────────────────────────────────────

function tokenHash(token) {
  let h = 5381;
  const s = String(token);
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `${(h >>> 0).toString(16)}:${s.length}`;
}

/**
 * Which boot row a token answers for: the CREDENTIAL it was minted for (`wu`,
 * the browser login's username — one per profile), else the identity claims,
 * else a hash of the token itself. The claims and not the token, because the
 * token CHANGES under a standing session — the Android app renews it daily,
 * a rename re-issues it — and a row keyed by the old token would leave the
 * next offline open with nothing. An impersonation token (`imp`) is never a
 * key: such a tab caches nothing.
 */
function bootKey(token) {
  const c = tokenClaims(token);
  if (c && !c.imp) {
    if (c.wu) return `${B_PREFIX}u:${c.wu}`;
    if (c.sub != null && c.role) return `${B_PREFIX}${c.role}:${c.role_ref ?? c.role_id ?? ""}:${c.sub}`;
  }
  return `${B_PREFIX}${tokenHash(token)}`;
}

/** Keep the session payload a token was answered with (never the token itself). */
export function saveBootPayload(token, data) {
  if (disabled || !token || !data || data.status !== "approved" || data.impersonated) return;
  const copy = { ...data };
  delete copy.token;
  let text;
  try {
    text = JSON.stringify(copy);
  } catch {
    return;
  }
  put({ k: bootKey(token), v: text, at: Date.now() });
}

/** The payload a token was last answered with, if it is still trusted. */
export async function loadBootPayload(token) {
  if (disabled || !token) return null;
  const row = await read(bootKey(token));
  if (!row || typeof row.v !== "string") return null;
  if (Date.now() - (row.at || 0) > BOOT_MAX_AGE_MS) {
    del(row.k);
    return null;
  }
  try {
    const data = JSON.parse(row.v);
    return data && data.status === "approved" ? data : null;
  } catch {
    return null;
  }
}

export function dropBootPayload(token) {
  if (!token || disabled) return Promise.resolve();
  return bounded(del(bootKey(token)), CLEAR_TIMEOUT_MS);
}

// ── housekeeping ───────────────────────────────────────────────────────────

function armPurge() {
  if (purgeArmed || disabled) return;
  purgeArmed = true;
  let last = 0;
  try { last = Number(localStorage.getItem(PURGE_MARK) || 0); } catch { /* storage blocked */ }
  if (Date.now() - last < PURGE_EVERY_MS) return;
  setTimeout(() => {
    try { localStorage.setItem(PURGE_MARK, String(Date.now())); } catch { /* storage blocked */ }
    // Rows of another version: by key alone, no value is loaded.
    deleteKeysWhere((k) => !k.startsWith(Q_PREFIX) && !k.startsWith(B_PREFIX)).catch(() => {});
    // Rows too old to trust: by the `at` index, keys only.
    tx("readwrite", (s) => {
      const req = s.index("at").openKeyCursor(IDBKeyRange.upperBound(Date.now() - BOOT_MAX_AGE_MS));
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return;
        s.delete(c.primaryKey);
        c.continue();
      };
    }).catch(() => {});
  }, 8_000);
}
