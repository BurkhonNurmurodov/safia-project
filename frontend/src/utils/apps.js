// «Ilovalar» — the app launcher's bookkeeping (2026-11-02): which app a page
// belongs to, which app is open, and where each app was left. The apps
// themselves are APPS in config/navLinks.js. Who gets the launcher, and which
// of its apps they see, is hooks/useLauncher.js.
import { ALL_LINKS, APPS, ADMIN_PAGE_LINKS, appOf, adminPath } from "../config/navLinks";

export { LAUNCHER_ROLES, usesLauncher } from "./launcherRoles";

// Every page a launcher reaches, at the path a launcher reaches it by («/» is
// the launcher, so the overview answers at /overview).
export const APP_LINKS = [...ALL_LINKS.map((l) => ({ ...l, to: adminPath(l.to) })), ...ADMIN_PAGE_LINKS];

const APP_IDS = new Set(APPS.map((a) => a.id));
const LAST_APP_KEY = "appOpen";       // sessionStorage: the app open in this tab
const LAST_PAGE_KEY = "appLastPage";  // localStorage: { [appId]: pathname }

const ALL = () => true;

// An app's pages, in register order — narrowed by `may` to the ones the viewer
// can open (hooks/useLauncher.js); an admin's `may` passes everything.
export const linksOfApp = (id, may = ALL) => APP_LINKS.filter((l) => appOf(l) === id && may(l));

// Segment-safe, like NavLink: /zagruzka-cell is not inside /zagruzka.
const inside = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`);

// The app whose page this is — the longest matching link wins — or null for
// a page no app lists (a profile, a notification, a leader's day report …).
export function appOfPath(pathname) {
  const hit = APP_LINKS
    .filter((l) => inside(pathname, l.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const id = hit && appOf(hit);
  return id && APP_IDS.has(id) ? id : null;
}

function readLastPages() {
  try { return JSON.parse(localStorage.getItem(LAST_PAGE_KEY)) || {}; } catch { return {}; }
}

// The app open in this tab: the page's own, else the one the viewer came from,
// so a profile opened from Production keeps Production's pages in the sidebar.
export function openApp(pathname) {
  const own = appOfPath(pathname);
  if (own) return own;
  try {
    const last = sessionStorage.getItem(LAST_APP_KEY);
    return APP_IDS.has(last) ? last : null;
  } catch { return null; }
}

export function rememberPage(pathname) {
  const id = appOfPath(pathname);
  if (!id) return;
  try {
    sessionStorage.setItem(LAST_APP_KEY, id);
    localStorage.setItem(LAST_PAGE_KEY, JSON.stringify({ ...readLastPages(), [id]: pathname }));
  } catch { /* a convenience only */ }
}

// Where a tile opens: the page the app was left on, else its first page — of
// the pages this viewer may open (a remembered page the device's previous
// profile could open and this one cannot is skipped).
export function appEntry(id, may = ALL) {
  const pages = linksOfApp(id, may);
  const last = readLastPages()[id];
  return pages.find((l) => l.to === last)?.to ?? pages[0]?.to ?? "/";
}
