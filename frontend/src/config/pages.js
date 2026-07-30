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
  { key: "daily",    route: "/daily",    labelKey: "nav.daily" },
  { key: "production", route: "/production", labelKey: "nav.production" },
  { key: "trudoyomkost", route: "/trudoyomkost", labelKey: "nav.trudoyomkost" },
  { key: "leaders", route: "/leaders", labelKey: "nav.leaders" },
  { key: "cells", route: "/cells", labelKey: "nav.cells" },
  { key: "kaizen", route: "/kaizen", labelKey: "nav.kaizen" },
  { key: "quality", route: "/quality", labelKey: "nav.quality" },
  { key: "concerns", route: "/concerns", labelKey: "nav.concerns" },
  { key: "tasks", route: "/tasks", labelKey: "nav.tasks" },
  { key: "activity", route: "/activity", labelKey: "nav.activity" },
  { key: "setup", route: "/setup-times", labelKey: "nav.setupTimes" },
  { key: "idle-cell", route: "/idle-cell", labelKey: "nav.idleCell" },
  { key: "cell-attendance", route: "/cell-attendance", labelKey: "nav.cellAttendance" },
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
  tasks: ["supervisor", "leader"], // Leader tasks ("DAILY протокол") — supervisors assign, leaders execute
  activity: [], // Users activity & usage stats — admin-only until enabled
  setup: [], // Setup-times register (переналадка) — admin-only until enabled
  "idle-cell": [], // Manual per-cell idle-time (ojidaniya) TEST entry — admin-only until enabled
};

// `capPages` are pages unlocked by the viewer's PERSONAL capability grants
// (useCapabilities → capPages, mirroring app/capabilities.capability_pages). A
// capability implies page access, so a grant is never dead — and unlike ticking
// the matrix, it opens the page for that one profile, not for every peer
// holding the same role.
export function canAccessPage(role, pageKey, access, capPages) {
  if (role === "admin") return true;
  const allowed = access?.[pageKey] ?? DEFAULT_PAGE_ACCESS[pageKey] ?? [];
  return allowed.includes(role) || (capPages ?? []).includes(pageKey);
}

// Returns the route of the first page this role may access, or null if none.
export function firstAccessibleRoute(role, access, capPages) {
  for (const p of PAGES) {
    if (canAccessPage(role, p.key, access, capPages)) return p.route;
  }
  return null;
}
