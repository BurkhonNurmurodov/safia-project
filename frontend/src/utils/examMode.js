/**
 * Exam mode — the client switch behind the dashboard exam («Imtihon»).
 *
 * While it is ON, `utils/api.js` rewrites every request to a sandboxed
 * resource onto `/api/exam/sandbox/…` and sends `X-Exam-Attempt`, so the
 * pages the leader is working on read and write the attempt's own test rows
 * and never a real table (the operator's first ruling: nothing a leader does
 * during an exam may change real data). Module state, deliberately — the
 * axios interceptor is synchronous and cannot read React context, the same
 * shape Ghost Mode uses for `X-Ghost-Mode`.
 *
 * The list of rewritten prefixes is SERVER-OWNED (`GET /api/exam/me` →
 * `sandbox_prefixes`) and stored here with the mode; a prefix matches on a path
 * boundary only, so `/api/tasks` never catches `/api/tasks-something` and
 * `/api/leaders` (Monitoring, real and read-only) stays untouched while
 * `/api/leaders/report/…` is rewritten.
 *
 * Entering the mode PARKS the pages' persisted filters (`usePersistentState`
 * keys are global localStorage): a stale `tasks_status_sel` left by real work
 * would blank a sandbox register with no error. Leaving restores them.
 * `lang` and `theme` are never parked — two of the tasks switch them and put
 * them back themselves.
 */
const STATE_KEY = "exam_mode";      // sessionStorage: the mode survives a reload of the tab
const PARK_KEY = "exam_parked";     // localStorage: what was set aside, restored on leave

let state = null;
const subs = new Set();
let mutationHook = null;

function read() {
  try {
    const raw = sessionStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    return s && s.attemptId ? s : null;
  } catch {
    return null;
  }
}

function write(next) {
  state = next;
  try {
    if (next) sessionStorage.setItem(STATE_KEY, JSON.stringify(next));
    else sessionStorage.removeItem(STATE_KEY);
  } catch { /* storage blocked — the mode still holds in memory for this tab */ }
  subs.forEach((fn) => { try { fn(state); } catch { /* a listener must not break the switch */ } });
}

state = read();

export function examState() { return state; }
export function isExamOn() { return !!state; }
export function examAttemptId() { return state ? state.attemptId : null; }
export function subscribeExam(fn) { subs.add(fn); return () => subs.delete(fn); }

function matches(url, prefix) {
  if (!url.startsWith(prefix)) return false;
  if (prefix.endsWith("/")) return true;
  const rest = url.slice(prefix.length);
  return rest === "" || rest[0] === "/" || rest[0] === "?";
}

/** The URL a request goes to while the mode is on. Anything not sandboxed
 *  passes through untouched, `/api/exam/…` itself included. */
export function rewriteExamUrl(url) {
  if (!state || typeof url !== "string" || !url.startsWith("/api/")) return url;
  if (url.startsWith("/api/exam/")) return url;
  for (const p of state.prefixes || []) {
    if (matches(url, p)) return "/api/exam/sandbox" + url.slice(4);
  }
  return url;
}

function isParked(key, prefixes) {
  return (prefixes || []).some((p) => key === p || key.startsWith(p));
}

// PARK_KEY carries its OWN prefix list alongside the parked values, so
// restoring never needs a live prefix list from the caller — a leftover park
// from an older bundle (a shorter list) is unparked by the list it was PARKED
// with, never by whatever list a newer bundle happens to be carrying now.
function restoreStored() {
  try {
    const raw = localStorage.getItem(PARK_KEY);
    if (!raw) return;
    const stored = JSON.parse(raw);
    const prefixes = stored && stored.prefixes;
    const values = (stored && stored.values) || {};
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
    // Whatever the sandbox pages wrote goes first, so nothing of the exam
    // leaks into real work; then what was set aside comes back.
    for (const k of keys) if (isParked(k, prefixes)) localStorage.removeItem(k);
    for (const [k, v] of Object.entries(values)) if (v != null) localStorage.setItem(k, v);
    localStorage.removeItem(PARK_KEY);
  } catch { /* ignore */ }
}

function park(prefixes) {
  try {
    // A PARK_KEY already on disk means an earlier exam was parked and never
    // unparked — the tab was closed instead of leaving exam mode normally, so
    // `leaveExamMode`'s `restore()` never ran. Overwriting that slot here
    // would bury the real filters underneath it for good; restoring it first
    // puts them back before this park starts a fresh one.
    if (localStorage.getItem(PARK_KEY) != null) restoreStored();
    const parked = {};
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) keys.push(localStorage.key(i));
    for (const k of keys) {
      if (isParked(k, prefixes)) {
        parked[k] = localStorage.getItem(k);
        localStorage.removeItem(k);
      }
    }
    localStorage.setItem(PARK_KEY, JSON.stringify({ prefixes, values: parked }));
  } catch { /* ignore */ }
}

// eslint-disable-next-line no-unused-vars -- kept for call-site compatibility; the stored prefixes decide, not this argument
function restore(_prefixes) { restoreStored(); }

// A tab that was IN exam mode when it was closed loses `state`
// (sessionStorage does not survive that), but the real filters it parked are
// still sitting in localStorage under PARK_KEY — nothing calls `leaveExamMode`
// to give them back. Restore them the moment a fresh load finds no exam mode
// claiming them, or every later real session on this device carries that
// exam's parked-away filters (and never sees its own) until someone happens
// to re-enter and leave exam mode again.
if (!read()) restoreStored();

export function enterExamMode({ attemptId, kind, prefixes, parkedKeys }) {
  if (state && state.attemptId === attemptId) return;
  if (state) restore(state.parkedKeys);
  park(parkedKeys || []);
  write({ attemptId, kind: kind || "exam", prefixes: prefixes || [], parkedKeys: parkedKeys || [], since: Date.now() });
}

export function leaveExamMode() {
  if (!state) return;
  const prev = state;
  write(null);
  restore(prev.parkedKeys);
}

/** api.js calls this after every successful non-GET request that carried the
 *  exam header; the exam context registers the listener that re-checks the
 *  current task. */
export function onExamMutation(fn) { mutationHook = fn; return () => { if (mutationHook === fn) mutationHook = null; }; }
export function noteExamMutation(config) { if (mutationHook) { try { mutationHook(config); } catch { /* ignore */ } } }

/** The write-guard's allowlist (utils/api.js calls this): real doors that must
 *  stay reachable even mid-exam — signing in, the language switch, the
 *  heartbeat, a lesson's watch progress, the client's own crash report.
 *  Kept in step with `EXAM_WRITE_ALLOW` in
 *  backend/app/services/exam_sandbox.py, which enforces the same rule
 *  server-side; a mismatch here only ever costs a refused request the server
 *  would have allowed, never the reverse, since the server is the one that
 *  actually holds the real tables. */
const WRITE_ALLOW = ["/api/auth/", "/api/activity/", "/api/crash-report", "/api/boot", "/api/education/progress"];

export function examWriteAllowed(url) {
  if (typeof url !== "string") return false;
  if (url.startsWith("/api/exam/")) return true;
  return WRITE_ALLOW.some((p) => url.startsWith(p));
}

/** What the ui checkers read: the persisted page state a task may ask about.
 *  `usePersistentState` JSON-encodes, `lang`/`theme` are bare strings. */
const UI_JSON_KEYS = ["tasks_status_sel", "tasks_view", "tasks_sort", "concerns_status_sel",
  "concerns_view", "zagruzka_heatmap_mode", "leaders_tab", "notif_read_ids", "cellConcerns.tab", "idle_cell_tab"];
const UI_RAW_KEYS = ["lang", "theme"];

export function uiSnapshot() {
  const out = {};
  try {
    for (const k of UI_JSON_KEYS) {
      const raw = localStorage.getItem(k);
      if (raw == null) continue;
      try { out[k] = JSON.parse(raw); } catch { out[k] = raw; }
    }
    for (const k of UI_RAW_KEYS) {
      const raw = localStorage.getItem(k);
      if (raw != null) out[k] = raw;
    }
  } catch { /* ignore */ }
  return out;
}
