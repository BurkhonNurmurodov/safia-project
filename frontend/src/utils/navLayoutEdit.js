// «Ilovalar tuzilmasi» — the edits the org chart's «Ilovalar» view makes to a
// layout. Each takes a DRAFT in the stored shape with every screen placed
// (`serialize(resolveLayout(stored))`, utils/navLayout.js) and returns a new
// one; nothing is mutated and nothing is sent — the page saves the draft whole.
//
// A screen is never lost: taking an app or a menu tab away moves what it held.
import { TOP } from "./navLayout";

const clone = (d) => JSON.parse(JSON.stringify(d));

// Short, unique among what the layout already names, valid for the server's
// id rule. The «x» keeps it clear of every id the code ships.
export function newId(d) {
  const taken = new Set(d.apps.flatMap((a) => [a.id, ...a.tabs.map((t) => t.id)]));
  for (;;) {
    const id = `x${Math.random().toString(36).slice(2, 9)}`;
    if (id.length > 4 && !taken.has(id)) return id;
  }
}

const appOf = (d, id) => d.apps.find((a) => a.id === id);
const tabOf = (d, id) => { for (const a of d.apps) { const t = a.tabs.find((x) => x.id === id); if (t) return [a, t]; } return [null, null]; };
// The list a screen sits in: an app's own row, or one of its menu tabs.
const holder = (d, appId, tabId) => {
  const a = appOf(d, appId);
  if (!a) return null;
  return !tabId || tabId === TOP ? a : (a.tabs.find((t) => t.id === tabId) ?? null);
};

const look = (x, { label, icon }) => {
  const clean = Object.fromEntries(Object.entries(label || {}).map(([k, v]) => [k, String(v ?? "").trim()]).filter(([, v]) => v));
  if (Object.keys(clean).length) x.label = clean; else delete x.label;
  if (icon) x.icon = icon; else delete x.icon;
};

/** Where a screen sits: `{ app, tab }` (tab `TOP` for the app's own row), or null in no app. */
export function placeOf(d, to) {
  for (const a of d.apps) {
    if (a.pages.includes(to)) return { app: a.id, tab: TOP };
    for (const t of a.tabs) if (t.pages.includes(to)) return { app: a.id, tab: t.id };
  }
  return null;
}

/** A screen to the END of an app's own row or of a menu tab; `appId` null → into no app. */
export function movePage(d0, to, appId, tabId) {
  const d = clone(d0);
  const dest = appId ? holder(d, appId, tabId) : null;
  if (appId && !dest) return d0;
  for (const a of d.apps) {
    a.pages = a.pages.filter((p) => p !== to);
    for (const t of a.tabs) t.pages = t.pages.filter((p) => p !== to);
  }
  d.loose = (d.loose || []).filter((p) => p !== to);
  (dest ? dest.pages : d.loose).push(to);
  return d;
}

// A new order for a list: the ids given, then whatever they left out (a drag
// can never drop an entry).
const ordered = (list, ids, key = (x) => x) => {
  const by = new Map(list.map((x) => [key(x), x]));
  const out = ids.filter((i) => by.has(i)).map((i) => by.get(i));
  const seen = new Set(ids);
  return [...out, ...list.filter((x) => !seen.has(key(x)))];
};

export function orderPages(d0, appId, tabId, tos) {
  const d = clone(d0);
  const h = holder(d, appId, tabId);
  if (!h) return d0;
  h.pages = ordered(h.pages, tos);
  return d;
}

export function orderApps(d0, ids) {
  const d = clone(d0);
  d.apps = ordered(d.apps, ids, (a) => a.id);
  return d;
}

export function orderTabs(d0, appId, ids) {
  const d = clone(d0);
  const a = appOf(d, appId);
  if (!a) return d0;
  a.tabs = ordered(a.tabs, ids, (t) => t.id);
  return d;
}

/** → `[draft, id]` — a new app, last on the launcher. */
export function addApp(d0, { label, icon, hue }) {
  const d = clone(d0);
  const app = { id: newId(d), pages: [], tabs: [] };
  look(app, { label, icon });
  if (hue) app.hue = hue;
  d.apps.push(app);
  return [d, app.id];
}

export function editApp(d0, id, { label, icon, hue }) {
  const d = clone(d0);
  const a = appOf(d, id);
  if (!a) return d0;
  look(a, { label, icon });
  if (hue) a.hue = hue; else delete a.hue;
  return d;
}

/** An app goes; its screens and menu tabs move to `toId` (which must be given while it holds any). */
export function removeApp(d0, id, toId) {
  const d = clone(d0);
  const a = appOf(d, id);
  if (!a) return d0;
  const holds = a.pages.length + a.tabs.length;
  const dest = toId && toId !== id ? appOf(d, toId) : null;
  if (holds && !dest) return d0;
  if (dest) { dest.pages.push(...a.pages); dest.tabs.push(...a.tabs); }
  d.apps = d.apps.filter((x) => x.id !== id);
  return d;
}

/** → `[draft, id]` — a new menu tab, last in its app. */
export function addTab(d0, appId, { label, icon }) {
  const d = clone(d0);
  const a = appOf(d, appId);
  if (!a) return [d0, null];
  const tab = { id: newId(d), pages: [] };
  look(tab, { label, icon });
  a.tabs.push(tab);
  return [d, tab.id];
}

export function editTab(d0, id, { label, icon }) {
  const d = clone(d0);
  const [, t] = tabOf(d, id);
  if (!t) return d0;
  look(t, { label, icon });
  return d;
}

/** A menu tab goes; its screens join the app's own row. */
export function removeTab(d0, id) {
  const d = clone(d0);
  const [a, t] = tabOf(d, id);
  if (!t) return d0;
  a.pages.push(...t.pages);
  a.tabs = a.tabs.filter((x) => x.id !== id);
  return d;
}

/** A menu tab, with its screens, to the end of another app. */
export function moveTab(d0, id, toAppId) {
  const d = clone(d0);
  const [a, t] = tabOf(d, id);
  const dest = appOf(d, toAppId);
  if (!t || !dest || dest === a) return d0;
  a.tabs = a.tabs.filter((x) => x.id !== id);
  dest.tabs.push(t);
  return d;
}
