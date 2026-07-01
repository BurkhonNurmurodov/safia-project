// Shared page-access metadata. Mirrors backend/app/permissions.py.

// Roles an admin can toggle per page. "admin" is always granted full access
// and never appears here.
export const TOGGLEABLE_ROLES = ["top-manager", "shift-manager", "supervisor"];

export const ROLE_LABELS = {
  "top-manager":  "Top Manager",
  "shift-manager": "Shift Manager",
  "supervisor":   "Supervisor",
  "admin":        "Admin",
};

// Translation keys for the same roles — resolve with t() in components so the
// labels follow the active language (the English ROLE_LABELS above stay as a
// non-i18n fallback for any context without the translation hook).
export const ROLE_LABEL_KEYS = {
  "top-manager":   "role.topManager",
  "shift-manager": "role.manager",
  "supervisor":    "role.supervisor",
  "admin":         "role.admin",
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
  { key: "kaizen", route: "/kaizen", labelKey: "nav.kaizen" },
  { key: "activity", route: "/activity", labelKey: "nav.activity" },
];

// Fallback matrix used before the API responds (matches the original hardcoded
// behavior, so nav/guards behave correctly while the real matrix loads).
export const DEFAULT_PAGE_ACCESS = {
  overview: ["shift-manager"],
  zagruzka: ["top-manager", "shift-manager", "supervisor"],
  leaderboard: [], // admin-only by default

  workers:  ["shift-manager"],
  plan:     ["shift-manager"],
  downtime: ["shift-manager"],
  staff:    ["shift-manager", "supervisor"],
  daily:    ["shift-manager", "supervisor"],
  production: [], // pilot: admin-only until enabled from the Access tab
  trudoyomkost: ["top-manager", "shift-manager"], // analyst roles; supervisor toggleable
  leaders: [], // pilot: admin-only until enabled from the Access tab
  kaizen: [], // Kaizen project analytics (Notion) — admin-only until enabled
  activity: [], // Users activity & usage stats — admin-only until enabled
};

export function canAccessPage(role, pageKey, access) {
  if (role === "admin") return true;
  const allowed = access?.[pageKey] ?? DEFAULT_PAGE_ACCESS[pageKey] ?? [];
  return allowed.includes(role);
}

// Returns the route of the first page this role may access, or null if none.
export function firstAccessibleRoute(role, access) {
  for (const p of PAGES) {
    if (canAccessPage(role, p.key, access)) return p.route;
  }
  return null;
}
