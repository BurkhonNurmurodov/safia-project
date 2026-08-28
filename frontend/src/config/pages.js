// Shared page-access metadata. Mirrors backend/app/permissions.py.

// Roles an admin can toggle per page. "admin" is always granted full access
// and never appears here.
export const TOGGLEABLE_ROLES = ["top-manager", "shift-manager", "supervisor", "leader", "guest"];

export const ROLE_LABELS = {
  "top-manager":  "Top Manager",
  "shift-manager": "Shift Manager",
  "supervisor":   "Supervisor",
  "leader":       "Leader",
  "admin":        "Admin",
  "guest":        "Guest",
};

// Translation keys for the same roles — resolve with t() in components so the
// labels follow the active language (the English ROLE_LABELS above stay as a
// non-i18n fallback for any context without the translation hook).
export const ROLE_LABEL_KEYS = {
  "top-manager":   "role.topManager",
  "shift-manager": "role.manager",
  "supervisor":    "role.supervisor",
  "leader":        "role.leader",
  "admin":         "role.admin",
  "guest":         "role.guest",
};

// Order matters — it drives the "first accessible page" fallback.
export const PAGES = [
  { key: "overview",    route: "/",            labelKey: "nav.overview" },
  { key: "zagruzka",    route: "/zagruzka",    labelKey: "nav.zagruzka" },
  { key: "leaderboard", route: "/leaderboard", labelKey: "nav.leaderboard" },
  { key: "workers",     route: "/workers",     labelKey: "nav.workers" },
  { key: "plan",     route: "/plan",     labelKey: "nav.planFulfillment" },
  { key: "downtime", route: "/downtime", labelKey: "nav.idleTime" },
  { key: "staff",    route: "/staff",    labelKey: "nav.staff" },
  // Cell-level SANDBOX twin of /staff — key SINGULAR, route PLURAL. `tier:
  // "test"` is what paints the amber TEST chip on the Access matrix; while the
  // page files test documents that apply nothing, whoever hands out access
  // must be able to see it is a rehearsal.
  { tier: "test", key: "staff-cell", route: "/staff-cells", labelKey: "nav.staffCell" },
  { key: "daily",    route: "/daily",    labelKey: "nav.daily" },
  { key: "production", route: "/production", labelKey: "nav.production" },
  { key: "trudoyomkost", route: "/trudoyomkost", labelKey: "nav.trudoyomkost" },
  { key: "leaders", route: "/leaders", labelKey: "nav.leaders" },
  { key: "cells", route: "/cells", labelKey: "nav.cells" },
  { key: "kaizen", route: "/kaizen", labelKey: "nav.kaizen" },
  { key: "quality", route: "/quality", labelKey: "nav.quality" },
  { key: "concerns", route: "/concerns", labelKey: "nav.concerns" },
  { key: "worker-concerns", route: "/worker-concerns", labelKey: "nav.workerConcerns" },
  { key: "tasks", route: "/tasks", labelKey: "nav.tasks" },
  { key: "activity", route: "/activity", labelKey: "nav.activity" },
  { key: "setup", route: "/setup-times", labelKey: "nav.setupTimes" },
  { tier: "test", key: "idle-cell", route: "/idle-cell", labelKey: "nav.idleCell" },
  { tier: "test", key: "zagruzka-cell", route: "/zagruzka-cell", labelKey: "nav.zagruzkaCell" },
  { key: "arc", route: "/arc", labelKey: "nav.arc" },
];

// Fallback matrix used before the API responds (matches the original hardcoded
// behavior, so nav/guards behave correctly while the real matrix loads).
export const DEFAULT_PAGE_ACCESS = {
  overview: ["shift-manager"],
  zagruzka: ["top-manager", "shift-manager", "supervisor", "leader"],
  leaderboard: [], // admin-only by default

  workers:  ["shift-manager"],
  plan:     ["shift-manager"],
  downtime: ["shift-manager"],
  staff:    ["shift-manager", "supervisor"],
  // Cell-level twin of `staff` — leaders are in by default, which is the whole
  // point of it. Must stay byte-identical to backend DEFAULT_PAGE_ACCESS, or
  // the sidebar link flickers in or out on every cold load.
  "staff-cell": ["shift-manager", "supervisor", "leader"],
  daily:    ["shift-manager", "supervisor"],
  production: [], // pilot: admin-only until enabled from the Access tab
  trudoyomkost: ["top-manager", "shift-manager"], // analyst roles; supervisor toggleable
  leaders: [], // pilot: admin-only until enabled from the Access tab
  cells: [], // Cell registry — admin-only until a role is enabled here, or a
  //            person is granted view/edit on the Permissions tab
  kaizen: [], // Kaizen project analytics (Notion) — admin-only until enabled
  // Quality register (complaints & non-conformances) — a factory-wide management view
  quality: ["top-manager", "shift-manager"],
  // Leader concerns ("Xavotirlar") — role-scoped: leaders their own rows,
  // supervisors their unit, shift-managers their shift, top-managers read-only all.
  concerns: ["top-manager", "shift-manager", "supervisor", "leader"],
  // Worker-concerns KPI («Ishchi havotirlari») — synced from the per-cell sheets;
  // supervisors see their unit, leaders their own numbers (server-scoped).
  "worker-concerns": ["supervisor", "leader"],
  tasks: ["supervisor", "leader"], // Leader tasks ("DAILY протокол") — supervisors assign, leaders execute
  activity: [], // Users activity & usage stats — admin-only until enabled
  setup: [], // Setup-times register (переналадка) — admin-only until enabled
  "idle-cell": [], // Manual per-cell idle-time (ojidaniya) TEST entry — admin-only until enabled
  // Per-cell загрузка TEST twin of /zagruzka, locked to one supervisor's cells.
  // Admin-only while the per-cell method is validated; feeds nothing downstream.
  "zagruzka-cell": [],
  // ARC service-ticket register (synced from the ARC API) — admin-only until
  // a role is enabled from the Access tab.
  arc: [],
};

// `capPages` are pages unlocked by the viewer's PERSONAL capability grants
// (useCapabilities → capPages, mirroring app/capabilities.capability_pages). A
// capability implies page access, so a grant is never dead — and unlike ticking
// the matrix, it opens the page for that one profile, not for every peer
// holding the same role.
//
// `deniedPages` is the subtractive half (useCapabilities → deniedPages,
// mirroring app/capabilities.caller_denied_pages): pages closed for THIS person
// even though their role opens them. Checked first, so neither the role matrix
// nor a capability can re-open one — the only way back in is an account-level
// grant, which the backend has already removed from the list. This is a
// rendering aid only; require_page refuses the data either way, and a nav link
// that 403s when tapped is worse than no link at all.
export function canAccessPage(role, pageKey, access, capPages, deniedPages) {
  if (role === "admin") return true;
  if ((deniedPages ?? []).includes(pageKey)) return false;
  const allowed = access?.[pageKey] ?? DEFAULT_PAGE_ACCESS[pageKey] ?? [];
  return allowed.includes(role) || (capPages ?? []).includes(pageKey);
}

// Returns the route of the first page this role may access, or null if none.
export function firstAccessibleRoute(role, access, capPages, deniedPages) {
  for (const p of PAGES) {
    if (canAccessPage(role, p.key, access, capPages, deniedPages)) return p.route;
  }
  return null;
}
