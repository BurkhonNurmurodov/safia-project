// «Ilovalar tuzilmasi» — the launcher's apps, menu tabs and screens, RESOLVED:
// the layout the operator arranged on the org chart (`/panel/orgchart`, the
// «Ilovalar» view; stored by services/nav_layout.py and read with the
// page-access answer) laid over what the code ships (config/navLinks.js).
//
//   app ─┬─ its own screens (the headerless `top` row, always tabs[0])
//        └─ menu tab ─ screens
//
// A screen is its PATH (`to`, as a launcher reaches it — «/» is /overview).
// The register of screens is the code's alone: a stored path this bundle does
// not know is dropped, and a screen the layout does not place sits where the
// code puts it (its default app, re-made if the layout no longer has it) — so
// a page added in code shows up without anybody touching the layout, and a
// stale layout can never hide one.
//
// No stored layout → `DEFAULT_LAYOUT`, exactly what `APPS` / `appOf` /
// an app's `sections` always drew. Nothing here decides ACCESS.
import { ALL_LINKS, APPS, ADMIN_PAGE_LINKS, appOf, adminPath } from "../config/navLinks";
import { APP_ICONS, APP_HUES, DEFAULT_APP_ICON, DEFAULT_TAB_ICON } from "../config/appIcons";

// Every page a launcher reaches, at the path a launcher reaches it by.
export const APP_LINKS = [...ALL_LINKS.map((l) => ({ ...l, to: adminPath(l.to) })), ...ADMIN_PAGE_LINKS];
const LINK_BY_TO = new Map(APP_LINKS.map((l) => [l.to, l]));

export const TOP = "top";
export const LANGS = ["uz", "uz_cyrl", "ru", "en"];

const BUILTIN_APP = new Map(APPS.map((a) => [a.id, a]));
// A menu tab the code ships (HR's «Verifix (test)», the admin app's four) is
// known by its id wherever the operator moves it.
const BUILTIN_TAB = new Map();
APPS.forEach((a) => (a.sections || []).forEach((s) => { if (s.labelKey) BUILTIN_TAB.set(s.id, s); }));

/** The app / menu tab the code ships under this id — undefined for one the operator made. */
export const builtinApp = (id) => BUILTIN_APP.get(id);
export const builtinTab = (id) => BUILTIN_TAB.get(id);

// What the code ships, in the stored shape — the sidebar's own seating rule:
// a link sits in the section it names, else in the one carrying its nav
// group's id, else in the app's first.
export const DEFAULT_STORED = (() => {
  const placed = new Set();
  const apps = APPS.map((a) => {
    const links = APP_LINKS.filter((l) => appOf(l) === a.id);
    const secs = a.sections ?? [{ id: TOP }];
    const seat = (l) => l.section ?? (secs.some((s) => s.id === l.group) ? l.group : secs[0].id);
    const of = (s) => links.filter((l) => seat(l) === s.id).map((l) => (placed.add(l.to), l.to));
    return {
      id: a.id,
      pages: secs.filter((s) => !s.labelKey).flatMap(of),
      tabs: secs.filter((s) => s.labelKey).map((s) => ({ id: s.id, pages: of(s) })),
    };
  });
  // A page no app lists (the assistant: the header's button opens it).
  return { v: 1, apps, loose: APP_LINKS.filter((l) => !placed.has(l.to)).map((l) => l.to) };
})();

// to → { app, tab } as the code ships it: where an unplaced screen goes.
const DEFAULT_HOME = new Map();
DEFAULT_STORED.apps.forEach((a) => {
  a.pages.forEach((p) => DEFAULT_HOME.set(p, { app: a.id, tab: TOP }));
  a.tabs.forEach((t) => t.pages.forEach((p) => DEFAULT_HOME.set(p, { app: a.id, tab: t.id })));
});

const cleanLabel = (label) => {
  if (!label || typeof label !== "object") return null;
  const out = {};
  for (const l of LANGS) if (typeof label[l] === "string" && label[l].trim()) out[l] = label[l].trim();
  return Object.keys(out).length ? out : null;
};

const makeApp = (id, raw = {}) => {
  const def = BUILTIN_APP.get(id);
  const iconName = APP_ICONS[raw.icon] ? raw.icon : null;
  const hueName = APP_HUES.includes(raw.hue) ? raw.hue : null;
  return {
    id, builtin: Boolean(def), labelKey: def?.labelKey, label: cleanLabel(raw.label),
    iconName, icon: (iconName && APP_ICONS[iconName]) || def?.icon || DEFAULT_APP_ICON,
    hueName, hue: hueName || def?.hue || "slate",
    tabs: [{ id: TOP, top: true, links: [] }],
  };
};

const makeTab = (id, raw = {}) => {
  const def = BUILTIN_TAB.get(id);
  const iconName = APP_ICONS[raw.icon] ? raw.icon : null;
  return {
    id, top: false, builtin: Boolean(def), labelKey: def?.labelKey, label: cleanLabel(raw.label),
    iconName, icon: (iconName && APP_ICONS[iconName]) || def?.icon || DEFAULT_TAB_ICON,
    danger: Boolean(def?.danger), links: [],
  };
};

function build(src) {
  const placed = new Set();
  const take = (paths) => (Array.isArray(paths) ? paths : [])
    .filter((p) => typeof p === "string" && LINK_BY_TO.has(p) && !placed.has(p) && placed.add(p))
    .map((p) => LINK_BY_TO.get(p));

  const apps = [];
  const appIds = new Set();
  const tabIds = new Set([TOP]);
  for (const a of src.apps) {
    if (!a || typeof a.id !== "string" || !a.id || appIds.has(a.id)) continue;
    appIds.add(a.id);
    const app = makeApp(a.id, a);
    app.tabs[0].links = take(a.pages);
    for (const t of Array.isArray(a.tabs) ? a.tabs : []) {
      if (!t || typeof t.id !== "string" || !t.id || tabIds.has(t.id)) continue;
      tabIds.add(t.id);
      const tab = makeTab(t.id, t);
      tab.links = take(t.pages);
      app.tabs.push(tab);
    }
    apps.push(app);
  }
  const loose = take(src.loose);

  // Every screen the layout did not place: back where the code puts it.
  for (const l of APP_LINKS) {
    if (placed.has(l.to)) continue;
    const home = DEFAULT_HOME.get(l.to);
    if (!home) { loose.push(l); continue; }
    let app = apps.find((a) => a.id === home.app);
    if (!app) { app = makeApp(home.app); appIds.add(app.id); apps.push(app); }
    let tab = app.tabs.find((t) => t.id === home.tab);
    if (!tab && !tabIds.has(home.tab)) { tab = makeTab(home.tab); tabIds.add(tab.id); app.tabs.push(tab); }
    (tab ?? app.tabs[0]).links.push(l);
  }

  const byId = new Map(), appOfTo = new Map(), tabOfTo = new Map();
  for (const app of apps) {
    app.links = app.tabs.flatMap((t) => t.links);
    byId.set(app.id, app);
    for (const t of app.tabs) for (const l of t.links) { appOfTo.set(l.to, app.id); tabOfTo.set(l.to, t.id); }
  }
  return { apps, loose, byId, appOf: appOfTo, tabOf: tabOfTo, custom: src !== DEFAULT_STORED };
}

export const DEFAULT_LAYOUT = build(DEFAULT_STORED);

const resolved = new WeakMap();

/** The layout in force for a stored one (`null` / no apps → the code's own). */
export function resolveLayout(stored) {
  if (!stored || typeof stored !== "object" || !Array.isArray(stored.apps) || !stored.apps.length) {
    return DEFAULT_LAYOUT;
  }
  let hit = resolved.get(stored);
  if (!hit) {
    try { hit = build(stored); } catch { hit = DEFAULT_LAYOUT; }   // never a launcher nobody can open
    resolved.set(stored, hit);
  }
  return hit;
}

/** A resolved layout back in the stored shape — every screen placed explicitly. */
export function serialize(layout) {
  const entry = (x, extra) => ({
    id: x.id,
    ...(x.label ? { label: x.label } : null),
    ...(x.iconName ? { icon: x.iconName } : null),
    ...extra,
  });
  return {
    v: 1,
    apps: layout.apps.map((a) => entry(a, {
      ...(a.hueName ? { hue: a.hueName } : null),
      pages: a.tabs[0].links.map((l) => l.to),
      tabs: a.tabs.slice(1).map((t) => entry(t, { pages: t.links.map((l) => l.to) })),
    })),
    loose: layout.loose.map((l) => l.to),
  };
}

const DEFAULT_JSON = JSON.stringify(serialize(DEFAULT_LAYOUT));

/** Is this stored layout exactly what the code ships? (Then nothing is stored.) */
export const isDefaultLayout = (stored) => JSON.stringify(serialize(resolveLayout(stored))) === DEFAULT_JSON;

/** Two stored layouts that draw the same launcher. */
export const sameLayout = (a, b) =>
  JSON.stringify(serialize(resolveLayout(a))) === JSON.stringify(serialize(resolveLayout(b)));

// A name the operator typed, in the reader's language — Russian where that
// language is blank (the LangTextInput rule), then whatever was filled in.
export const labelText = (label, lang) =>
  label?.[lang] || label?.ru || label?.uz || label?.en || label?.uz_cyrl || "";

/** What an app or a menu tab is called: the typed name, else the code's own. */
export const navName = (x, t, lang) => labelText(x?.label, lang) || (x?.labelKey ? t(x.labelKey) : x?.id ?? "");
