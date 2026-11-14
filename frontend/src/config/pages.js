// Shared page-access metadata. Mirrors backend/app/permissions.py.

// Roles an admin can toggle per page. "admin" is always granted full access
// and never appears here.
export const TOGGLEABLE_ROLES = ["top-manager", "shift-manager", "supervisor", "leader", "guest",
                                "idle-owner"];

export const ROLE_LABELS = {
  "top-manager":  "Top Manager",
  "shift-manager": "Shift Manager",
  "supervisor":   "Supervisor",
  "leader":       "Leader",
  "admin":        "Admin",
  "guest":        "Guest",
  "idle-owner":   "Idle-time owner",
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
  "idle-owner":    "role.idleOwner",
};

// Order matters — it drives the "first accessible page" fallback.
export const PAGES = [
  { key: "overview",    route: "/",            labelKey: "nav.overview" },
  { key: "zagruzka",    route: "/zagruzka",    labelKey: "nav.zagruzka" },
  { key: "leaderboard", route: "/leaderboard", labelKey: "nav.leaderboard" },
  { key: "workers",     route: "/workers/attendance", labelKey: "nav.workers" },
  { key: "plan",     route: "/plan",     labelKey: "nav.planFulfillment" },
  { key: "downtime", route: "/downtime", labelKey: "nav.idleTime" },
  { key: "staff",    route: "/staff",    labelKey: "nav.staff" },
  { key: "daily",    route: "/daily",    labelKey: "nav.daily" },
  { key: "shift-daily", route: "/shift-daily", labelKey: "nav.shiftDaily" },
  { key: "production", route: "/production", labelKey: "nav.production" },
  { key: "containers", route: "/containers", labelKey: "nav.containers" },
  { key: "trudoyomkost", route: "/trudoyomkost", labelKey: "nav.trudoyomkost" },
  { key: "ontime", route: "/ontime", labelKey: "nav.ontime" },
  { tier: "test", key: "reports", route: "/reports", labelKey: "nav.reports" },
  { tier: "test", key: "assessment", route: "/assessment", labelKey: "nav.assessment" },
  { tier: "test", key: "people", route: "/people", labelKey: "nav.people" },
  { tier: "test", key: "ovens", route: "/ovens", labelKey: "nav.ovens" },
  { tier: "test", key: "api", route: "/tokens", labelKey: "nav.api" },
  { tier: "test", key: "kitchen", route: "/kitchen", labelKey: "nav.kitchen" },
  { tier: "test", key: "container-flow", route: "/containers/flow", labelKey: "nav.containerFlow" },
  { tier: "test", key: "container-logistics", route: "/containers/flow", labelKey: "nav.containerLogistics" },
  { key: "leaders", route: "/leaders", labelKey: "nav.leaders" },
  { key: "cells", route: "/cells", labelKey: "nav.cells" },
  { key: "kaizen", route: "/kaizen", labelKey: "nav.kaizen" },
  { key: "notion-tasks", route: "/notion-tasks", labelKey: "nav.notionTasks" },
  { key: "quality", route: "/quality", labelKey: "nav.quality" },
  { key: "concerns", route: "/concerns", labelKey: "nav.concerns" },
  { key: "cell-concerns", route: "/cell-concerns", labelKey: "nav.cellConcerns" },
  { key: "leaders-kpi", route: "/leaders-kpi", labelKey: "nav.leadersKpi" },
  { key: "brigadirs-kpi", route: "/brigadirs-kpi", labelKey: "nav.brigadirsKpi" },
  { key: "tasks", route: "/tasks", labelKey: "nav.tasks" },
  { key: "activity", route: "/activity", labelKey: "nav.activity" },
  { key: "setup", route: "/setup-times", labelKey: "nav.setupTimes" },
  { tier: "test", key: "idle-cell", route: "/idle-cell", labelKey: "nav.idleCell" },
  { tier: "test", key: "zagruzka-cell", route: "/zagruzka-cell", labelKey: "nav.zagruzkaCell" },
  { tier: "test", key: "live", route: "/live", labelKey: "nav.live" },
  { key: "kelish", route: "/kelish", labelKey: "nav.kelish" },
  { key: "arc", route: "/arc", labelKey: "nav.arc" },
  { key: "education", route: "/education", labelKey: "nav.education" },
  { key: "exam", route: "/exam", labelKey: "nav.exam" },
  // «Yordamchi» — last on purpose: never anybody's landing page.
  { key: "assistant", route: "/assistant", labelKey: "nav.assistant" },
];

// Fallback matrix used before the API responds (matches the original hardcoded
// behavior, so nav/guards behave correctly while the real matrix loads).
export const DEFAULT_PAGE_ACCESS = {
  overview: ["shift-manager"],
  zagruzka: ["top-manager", "shift-manager", "supervisor", "leader"],
  leaderboard: [], // admin-only by default

  workers:  ["shift-manager"],
  plan:     ["shift-manager"],
  // «Kutish mas'uli» reads it narrowed to their own categories (the lock is
  // applied server-side on every endpoint the page calls).
  downtime: ["shift-manager", "idle-owner"],
  staff:    ["shift-manager", "supervisor"],
  daily:    ["shift-manager", "supervisor"],
  production: ["top-manager", "shift-manager"], // opened 2026-09-30 for the «Smena hisoboti» cell links
  trudoyomkost: ["top-manager", "shift-manager"], // analyst roles; supervisor toggleable
  ontime: [], // admin-only until the operator opens it (the on-time delivery report)
  // «Hisobotlar» — the period report (Laboratory). Admin-only until the
  // operator opens it on the Access tab: every section reads the whole plant.
  reports: [],
  // «Nomzodlarni baholash» — the supervisor-candidate panel (Laboratory).
  assessment: [],
  // «Xodim kartasi» — one person of the plant (Laboratory). Admin-only until
  // the operator opens it; the reach then follows the platform's locks.
  people: [],
  // «Pechlar» — the Revent ovens, read off the logs a collector on the factory
  // LAN posts (Laboratory). Admin-only until the operator opens it.
  ovens: [],
  // «Oshxona» — the people at work in the factory now (Verifix): counts only.
  // Admin-only until the operator opens it.
  kitchen: [],
  // «Konteyner berish» — AXO's steps of the container flow. Admin-only until opened.
  "container-flow": [],
  // …as Logistics: a request addressed to them, split across brigadirs.
  "container-logistics": [],
  // «API» — personal tokens for the external read API. Admin-only until the
  // operator opens it: a token reads every cell's plan and people.
  api: [],
  leaders: [], // pilot: admin-only until enabled from the Access tab
  cells: ["supervisor"], // Cell registry — supervisors read their OWN unit's
  //            cells, read-only (narrowed server-side); admins and per-person
  //            view/edit grants on the Permissions tab read the whole register
  kaizen: [], // Kaizen project analytics (Notion) — admin-only until enabled
  "notion-tasks": [], // the Notion "Production" task list, read-only — admin-only until enabled
  // Quality register (complaints & non-conformances) — a factory-wide management view
  quality: ["top-manager", "shift-manager"],
  // Leader concerns ("Xavotirlar") — role-scoped: leaders their own rows,
  // supervisors their unit, shift-managers their shift, top-managers read-only all.
  concerns: ["top-manager", "shift-manager", "supervisor", "leader"],
  // Cell concerns («Yacheyka havotirlari») — the page a WORKER types into on the
  // shop-floor PC, standing open on their cell leader's profile. Rows land in
  // leader_concerns at level="leader"; uplifting one is the ordinary escalate,
  // after which it belongs to the brigadir on /concerns and leaves this page.
  "cell-concerns": ["supervisor", "leader"],
  // «Liderlar KPI» — the leaders' five KPIs on one page (it merged the
  // worker-concerns, turnover and foreign-objects pages, 2026-10-19).
  // Admin-only until the operator opens it on the Access tab; a role's reach
  // is enforced server-side (routers/leaders_kpi.py, worker_concerns.py).
  "leaders-kpi": [],
  // «Brigadirlar KPI» — HR's monthly brigadir KPI (2026-11-02). Admin-only
  // until the operator opens it on the Access tab; a role's reach is enforced
  // server-side (routers/brigadirs_kpi.py `_lock`).
  "brigadirs-kpi": [],
  // THE task board — both tiers on one page: shift managers set tasks for
  // brigadirs, brigadirs for leaders, each assignee works their own queue.
  tasks: ["shift-manager", "supervisor", "leader"],
  activity: [], // Users activity & usage stats — admin-only until enabled
  setup: [], // Setup-times register (переналадка) — admin-only until enabled
  // Manual per-cell idle-time (ojidaniya) entry. Admin-only, plus the
  // «Kutish mas'uli», who reads the EVENTS behind their own categories
  // here — read-only by construction, never a filer.
  "idle-cell": ["idle-owner"],
  // Per-cell загрузка TEST twin of /zagruzka, locked to one supervisor's cells.
  // Admin-only while the per-cell method is validated; feeds nothing downstream.
  "zagruzka-cell": [],
  // Live shift monitor — the wall screen for shift managers (idle time and
  // plan pace right now). Laboratory, admin-only until the operator opens it.
  live: [],
  // «Kelish ro'yxati» — the T11 staff list: per cell, who is coming today and
  // tomorrow. Admin-only until the operator opens it; the reach for leaders,
  // supervisors and shift-managers is enforced server-side (routers/kelish.py).
  kelish: [],
  // ARC service-ticket register (synced from the ARC API) — admin-only until
  // a role is enabled from the Access tab.
  arc: [],
  // «Ta'lim» video lessons. Open to every role: the page shows a viewer only the
  // lessons addressed to their profile, so access to it is not access to any
  // content — while gating it would let a lesson somebody was DMed a link for
  // open onto "no access". Publishing stays admin-only, checked server-side.
  education: ["top-manager", "shift-manager", "supervisor", "leader", "guest"],
  // «Imtihon» — the dashboard exam (backend twin: permissions.DEFAULT_PAGE_ACCESS).
  exam: ["supervisor", "leader"],
  // «Yordamchi» — the AI assistant. Admin-only until the operator opens it.
  assistant: [],
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
// `pageKey` may be a LIST — the page opens for anyone who may open one of them
// (OR, like the backend's require_page): «Konteyner berish» is AXO's page
// AND Logistics' page.
export function canAccessPage(role, pageKey, access, capPages, deniedPages) {
  if (role === "admin") return true;
  if (Array.isArray(pageKey)) return pageKey.some((k) => canAccessPage(role, k, access, capPages, deniedPages));
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
