// THE roles whose «/» is the app launcher «Ilovalar» (admins from 2026-11-02,
// top-managers from 2026-11-04 — the operator). Every other role keeps the
// overview there. A leaf on purpose: App.jsx and DocumentTitle ride in the
// boot chunk, and config/navLinks.js (the apps, their icons) must not.
export const LAUNCHER_ROLES = ["admin", "top-manager"];
export const usesLauncher = (role) => LAUNCHER_ROLES.includes(role);
