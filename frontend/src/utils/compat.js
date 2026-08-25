/**
 * Is the bundle this tab is running still one the server serves?
 *
 * A push to main deploys straight to production and this app is left OPEN for
 * whole shifts, so an old bundle talking to a new backend is the normal case,
 * not the exceptional one. Two mechanisms already cover the benign half of
 * that: `useAppUpdate` polls `build.json` and OFFERS a reload, and
 * `lazyWithReload` catches a route chunk that has since been replaced. Neither
 * can tell "you are a few minutes behind" from "the server no longer speaks
 * your version" — and until it does, a genuinely incompatible tab shows the
 * user a 422 on a save, a column that renders empty, or nothing at all.
 *
 * The server answers that directly. Every API response carries `X-App-Version`
 * (which build replied) and `X-App-Min-Client` (the oldest bundle it serves,
 * derived from MAJOR — see backend/app/version.py). This reads them off the
 * response the app was making anyway: no extra request, and the answer lands
 * on the FIRST call a stale tab makes.
 *
 * Two rules it will not break:
 *
 *  • **Fail open.** A client the server cannot place is SERVED, never refused
 *    — a dev bundle (0.0.0), a stripped checkout, a backend too old to send
 *    the header, or a response the host's anti-bot layer mangled on the way
 *    through. Refusing on a non-answer would take the whole platform down on
 *    the day a proxy starts eating custom headers.
 *  • **Never reload by itself.** Being out of date is not permission to throw
 *    away an attendance draft or a half-typed comment; only some endpoints
 *    break, and the rest of the tab may still save. This flips a flag, and
 *    `UpdatePrompt` turns it into a notice the user acts on.
 */

import { APP_VERSION } from "./version";

/** [major, minor, patch], or null for anything that isn't an X.Y.Z string. */
function parse(value) {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(value || "").trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function below(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

let outdated = false;
let serverV = "";
let floorV = "";
const listeners = new Set();

/**
 * Feed this the headers of any API response. Cheap enough to call on every
 * one: it parses two short strings and returns early unless the verdict
 * actually changed.
 */
export function noteServerHeaders(headers) {
  if (!headers) return;

  const v = headers["x-app-version"];
  if (typeof v === "string" && v) serverV = v;
  const raw = headers["x-app-min-client"];
  if (typeof raw === "string" && raw) floorV = raw;

  const floor = parse(raw);
  const mine = parse(APP_VERSION);
  // `mine[0] > 0` is the fail-open guard: a major-0 bundle is an unversioned
  // build (dev, a stripped checkout), not an ancient release.
  const next = Boolean(floor && mine && mine[0] > 0 && below(mine, floor));

  if (next === outdated) return;
  outdated = next;
  listeners.forEach((fn) => {
    try {
      fn(outdated);
    } catch {
      /* a subscriber must never be able to break the response it rode in on */
    }
  });
}

/** True once the server has said this bundle is below its floor. */
export function isOutdated() {
  return outdated;
}

/** The build that last answered us, and the floor it published ("" if unknown). */
export function serverVersion() {
  return serverV;
}

export function minClient() {
  return floorV;
}

export function subscribeCompat(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
