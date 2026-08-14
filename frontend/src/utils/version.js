/**
 * The build the user is looking at.
 *
 * `__APP_VERSION__` / `__BUILD_TIME__` are substituted by vite.config.js at
 * build time; the version itself comes from the repo-root VERSION file, which
 * backend/app/version.py reads as well, so the two halves of the app can never
 * disagree about which release they belong to.
 *
 * The build TIME is stamped rather than the commit SHA on purpose: the Stop
 * hook builds before it commits, so a SHA captured here names the previous
 * commit. The deployed commit is reported by the server (/api/version).
 */

// `typeof` survives the define substitution (it becomes `typeof "1.0.0"`), so
// this also holds in any context where the define never ran (tests, a stray
// import outside the bundle).
export const APP_VERSION = typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "0.0.0";
export const BUILD_TIME = typeof __BUILD_TIME__ === "string" ? __BUILD_TIME__ : "";

/**
 * "14.08.2026 15:04" — local time, in the day-first order every other date on
 * the platform uses. Returns "" for a missing or unparseable stamp so callers
 * can fall back to an em dash instead of printing "Invalid Date".
 */
export function fmtStamp(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
