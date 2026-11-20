// Which «Lider nazorati» tab a LEADER's phone is on, and the job a screen is
// named by (2026-11-20, the leader-phone redesign — see leaderPhoneNav.js for
// the menu itself). A LEAF on purpose: App.jsx rides in the boot chunk and
// reads it for the «Bugun» landing, and config/navLinks.js (the icons) must
// not come along (utils/launcherRoles.js, the same rule).
import { useSyncExternalStore } from "react";

// ── which «Lider nazorati» tab is on screen ──────────────────────────────────
// Two menu entries open ONE page: «Bugun» its checklist tab, «Natijam» its
// monitor tab. The tab is that page's own state (pages/Leaders.jsx keeps it in
// localStorage under `leaders_tab` through usePersistentState), so an entry is
// lit by the tab, never by the path alone. In order of trust:
//  1. what the page published (`publishLeaderTab`, from a layout effect — the
//     exact tab on screen, the moment it changes);
//  2. the page's remembered tab (localStorage — what the strip last picked, and
//     what a menu tap writes before it navigates, `primeLeaderTab`);
//  3. the URL's `?tab=` (a bot link that has not been applied yet);
//  4. «monitor», the page's own default.
const STORE_KEY = "leaders_tab";
let published = null;
const subs = new Set();
const subscribe = (fn) => { subs.add(fn); return () => { subs.delete(fn); }; };
const snapshot = () => published;

/** Called by «Lider nazorati» with the tab on screen (null when it leaves). */
export function publishLeaderTab(tab) {
  if (tab === published) return;
  published = tab ?? null;
  subs.forEach((fn) => fn());
}

/** A menu tap / the landing names the tab BEFORE the page mounts, so the
 *  page's first frame (it reads this key) and the bar agree at once. */
export function primeLeaderTab(tab) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(tab)); } catch { /* a hint only */ }
}

function storedTab() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function currentLeaderTab(search = "") {
  if (published) return published;
  const kept = storedTab();
  if (typeof kept === "string" && kept) return kept;
  const asked = new URLSearchParams(search).get("tab");
  return asked || "monitor";
}

/** The tab, re-read whenever the page publishes a new one. */
export function useLeaderTab(search) {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return currentLeaderTab(search);
}

// ── the job a screen belongs to ──────────────────────────────────────────────
const JOB_BY_PATH = { "/cell-concerns": "havotirlar", "/kelish": "grafik", "/idle-cell": "kutish", "/tasks": "tasks" };

/** The job id a leader's phone names this screen by (the app bar), or null.
 *  «Lider nazorati» is «Bugun» on its checklist tab and «Natijam» on its
 *  monitor tab only; its other tabs (objections, late proofs, «Vazifalar») are
 *  screens opened FROM «Natijam», with a back row of their own — they keep the
 *  page's own title and light no menu entry. */
export function jobOfScreen(pathname, tab) {
  if (pathname === "/leaders") return tab === "checklist" ? "bugun" : tab === "monitor" ? "natijam" : null;
  return JOB_BY_PATH[pathname] ?? null;
}
