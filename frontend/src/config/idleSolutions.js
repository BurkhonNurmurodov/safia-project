/**
 * «Kutish yechimlari» (/idle-solutions) is the ADMINS' alone until its first day.
 *
 * The operator (2026-11-13): «we did not announce it yet … till then only
 * admins have to see it» — he names the day. Until then nobody else has the
 * menu row, the page, the number on the row or a reminder.
 *
 * The SERVER holds the same day (`backend/app/routers/idle_solutions.py`,
 * `OPEN_FROM`) and is the one that refuses; this file only keeps the menu, the
 * header search and the route from offering a page that would answer «no
 * access». SET BOTH IN ONE COMMIT. A tab open across midnight into the first
 * day gains the row on its next load.
 *
 * From 2026-11-15 brigadirs, shift-managers and top-managers have it EARLIER
 * (`EARLY_FROM`); cause owners still wait for `OPEN_FROM`.
 */
export const OPEN_FROM = "2026-11-15";         // named by the operator on 2026-11-15

// Who the page is built for, beside admins — from its first day on.
const ROLES = ["shift-manager", "top-manager", "supervisor", "idle-owner"];

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// …and the roles it opened to EARLIER (the operator, 2026-11-15). The server's
// twin is `EARLY_FROM` / `EARLY_ROLES` in routers/idle_solutions.py.
export const EARLY_FROM = "2026-11-15";
const EARLY_ROLES = ["supervisor", "shift-manager", "top-manager"];

/** Has the page's first day for everybody come? */
export const idleSolutionsOpen = () => !!OPEN_FROM && todayISO() >= OPEN_FROM;

/** Does this role have the page today? (Admins always.) */
export const idleSolutionsOpenFor = (role) => role === "admin" || (ROLES.includes(role)
  && (idleSolutionsOpen() || (EARLY_ROLES.includes(role) && !!EARLY_FROM && todayISO() >= EARLY_FROM)));

/** The roles beside admins that have the page today. */
export const idleSolutionsRoles = () => ROLES.filter(idleSolutionsOpenFor);
