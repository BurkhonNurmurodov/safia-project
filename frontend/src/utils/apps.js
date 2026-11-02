// «Ilovalar» — the admin app launcher's bookkeeping (2026-11-02): which app a
// page belongs to, which app is open, and where each app was left. The apps
// themselves are APPS in config/navLinks.js.
import { ALL_LINKS, APPS, ADMIN_PANEL_LINK, appOf, adminPath } from "../config/navLinks";

// Every page an admin reaches, at the path an admin reaches it by.
export const ADMIN_LINKS = [...ALL_LINKS.map((l) => ({ ...l, to: adminPath(l.to) })), ADMIN_PANEL_LINK];

const APP_IDS = new Set(APPS.map((a) => a.id));
const LAST_APP_KEY = "appOpen";       // sessionStorage: the app open in this tab
const LAST_PAGE_KEY = "appLastPage";  // localStorage: { [appId]: pathname }

export const linksOfApp = (id) => ADMIN_LINKS.filter((l) => appOf(l) === id);

// Segment-safe, like NavLink: /zagruzka-cell is not inside /zagruzka.
const inside = (pathname, to) => pathname === to || pathname.startsWith(`${to}/`);

// The app whose page this is — the longest matching link wins — or null for
// a page no app lists (a profile, a notification, a leader's day report …).
export function appOfPath(pathname) {
  const hit = ADMIN_LINKS
    .filter((l) => inside(pathname, l.to))
    .sort((a, b) => b.to.length - a.to.length)[0];
  const id = hit && appOf(hit);
  return id && APP_IDS.has(id) ? id : null;
}

function readLastPages() {
  try { return JSON.parse(localStorage.getItem(LAST_PAGE_KEY)) || {}; } catch { return {}; }
}

// The app open in this tab: the page's own, else the one the admin came from,
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

// Where a tile opens: the page the admin left the app on, else its first page.
export function appEntry(id) {
  const pages = linksOfApp(id);
  const last = readLastPages()[id];
  return pages.find((l) => l.to === last)?.to ?? pages[0]?.to ?? "/";
}
