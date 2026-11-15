// «Ilovalar» — the app launcher's bookkeeping (2026-11-02): which app a page
// belongs to, which app is open, and where each app was left. The apps
// themselves are a LAYOUT (utils/navLayout.js): what the code ships in
// config/navLinks.js, or the one the operator arranged on the org chart. Every
// function here takes it as its last argument — hooks/useLauncher.js hands a
// viewer theirs — and answers for the code's own without one. Who gets the
// launcher, and which of its apps they see, is hooks/useLauncher.js.
import { APP_LINKS, DEFAULT_LAYOUT } from "./navLayout";

export { LAUNCHER_ROLES, usesLauncher } from "./launcherRoles";
export { APP_LINKS };

const LAST_APP_KEY = "appOpen";       // sessionStorage: the app open in this tab
const LAST_PAGE_KEY = "appLastPage";  // localStorage: { [appId]: pathname }

const ALL = () => true;

// An app's pages, in its own order (its own row, then each menu tab's) —
// narrowed by `may` to the ones the viewer can open (hooks/useLauncher.js);
// an admin's `may` passes everything.
export const linksOfApp = (id, may = ALL, layout = DEFAULT_LAYOUT) =>
  (layout.byId.get(id)?.links ?? []).filter(may);

// Segment-safe, like NavLink: /zagruzka-cell is not inside /zagruzka.
const inside = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`);

// The app whose page this is — the longest matching link wins — or null for
// a page no app lists (a profile, a notification, a leader's day report …).
export function appOfPath(pathname, layout = DEFAULT_LAYOUT) {
  const hit = APP_LINKS
    .filter((l) => inside(pathname, l.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return (hit && layout.appOf.get(hit.to)) || null;
}

function readLastPages() {
  try { return JSON.parse(localStorage.getItem(LAST_PAGE_KEY)) || {}; } catch { return {}; }
}

// The app open in this tab: the page's own, else the one the viewer came from,
// so a profile opened from Production keeps Production's pages in the sidebar.
export function openApp(pathname, layout = DEFAULT_LAYOUT) {
  const own = appOfPath(pathname, layout);
  if (own) return own;
  try {
    const last = sessionStorage.getItem(LAST_APP_KEY);
    return layout.byId.has(last) ? last : null;
  } catch { return null; }
}

export function rememberPage(pathname, layout = DEFAULT_LAYOUT) {
  const id = appOfPath(pathname, layout);
  if (!id) return;
  try {
    sessionStorage.setItem(LAST_APP_KEY, id);
    localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({ ...readLastPages(), [id]: pathname }));
  } catch { /* a convenience only */ }
}

// Where a tile opens: the page the app was left on, else its first page — of
// the pages this viewer may open (a remembered page the device's previous
// profile could open and this one cannot is skipped, and so is one that has
// since been moved to another app).
export function appEntry(id, may = ALL, layout = DEFAULT_LAYOUT) {
  const pages = linksOfApp(id, may, layout);
  const last = readLastPages()[id];
  return pages.find((l) => l.to === last)?.to ?? pages[0]?.to ?? "/";
}
