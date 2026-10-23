/**
 * The build the user is looking at.
 *
 * vite.config.js writes both into index.html at build time (a meta tag, read
 * below); the version itself comes from the repo-root VERSION file, which
 * backend/app/version.py reads as well, so the two halves of the app can never
 * disagree about which release they belong to.
 *
 * The build TIME is stamped rather than the commit SHA on purpose: the Stop
 * hook builds before it commits, so a SHA captured here names the previous
 * commit. The deployed commit is reported by the server (/api/version).
 */

// Both are read from the `<meta name="safia-build">` vite.config.js writes into
// index.html — NEVER compiled into a chunk: a value that changes every build
// inside a shared chunk renamed every asset on every deploy (see
// injectBuildMeta there). index.html is the build this tab loaded, so the tag
// names exactly the bundle that is running. No tag (a test, a document that is
// not the app) reads as "0.0.0" / "", which the update check and the
// compatibility floor both treat as "unknown — serve, never prompt".
function fromHtml(attr) {
  try {
    const tag = document.querySelector('meta[name="safia-build"]');
    const value = tag && tag.getAttribute(attr);
    return typeof value === "string" ? value : "";
  } catch (e) {
    return "";
  }
}
export const APP_VERSION = fromHtml("data-version") || "0.0.0";
export const BUILD_TIME = fromHtml("data-built");

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
