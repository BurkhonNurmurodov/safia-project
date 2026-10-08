// What this tab has asked the server lately, and how long each answer took —
// THE record a stall report (utils/stallReport.js) is built from.
//
// Fed by utils/api.js's interceptors, the one place every request passes
// through. For each request it keeps the total time the tab waited AND the
// time the server says it spent (`X-Server-Ms`, stamped by the backend's
// services/perf_watch.py), because those two numbers are the whole diagnosis
// of a wait: a long total with a short server time is the network (or the
// request queued behind a frozen server, which `X-Server-Stall-Ms` says); a
// long server time is the server.
//
// Paths only — never a query string (filters carry names) and never a body.
// Memory only, bounded, and nothing here can throw into a request.

const MAX_DONE = 80;
const inflight = new Map(); // id → { m, p, t0 }
const done = [];            // { m, p, s, ms, sms, stall, x, t0, t1 }
let seq = 0;

const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());

function pathOf(url) {
  try {
    const s = String(url || "");
    const i = s.indexOf("?");
    const p = i >= 0 ? s.slice(0, i) : s;
    // An absolute URL (VITE_API_URL in dev) keeps only its path.
    return p.replace(/^https?:\/\/[^/]+/i, "").slice(0, 160);
  } catch {
    return "?";
  }
}

function header(headers, name) {
  if (!headers) return undefined;
  try {
    const v = typeof headers.get === "function" ? headers.get(name) : headers[name];
    if (v === undefined || v === null || v === "") return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  } catch {
    return undefined;
  }
}

/** A request is leaving — returns its id (also stored on the config). */
export function noteStart(config) {
  try {
    const id = ++seq;
    inflight.set(id, {
      m: String(config?.method || "get").toUpperCase(),
      p: pathOf(config?.url),
      t0: now(),
    });
    if (config) config._rl = id;
    return id;
  } catch {
    return 0;
  }
}

/**
 * Its answer arrived (or it failed — `response` is then the error's, or none).
 * `cancelled`: the app called it off itself — the losing copy of a request
 * asked twice (utils/hedge.js) — so it is no evidence of a request the server
 * left unanswered.
 */
export function noteEnd(config, response, cancelled = false) {
  try {
    const id = config?._rl;
    if (!id) return;
    const r = inflight.get(id);
    if (!r) return;
    inflight.delete(id);
    const t1 = now();
    done.push({
      ...r,
      s: response?.status ?? 0, // 0 = no answer at all
      ms: Math.round(t1 - r.t0),
      sms: header(response?.headers, "x-server-ms"),
      stall: header(response?.headers, "x-server-stall-ms"),
      x: cancelled ? 1 : undefined,
      t1,
    });
    if (done.length > MAX_DONE) done.splice(0, done.length - MAX_DONE);
  } catch {
    /* a record nobody gets is better than a request that fails */
  }
}

/**
 * Everything that overlapped the window starting at `since` (a performance.now()
 * instant): what is still pending, with its age, and what finished, with its
 * times — slowest first, capped.
 */
export function requestsSince(since, cap = 12) {
  const t = now();
  const pending = [];
  inflight.forEach((r) => {
    pending.push({ m: r.m, p: r.p, ms: Math.round(t - r.t0) });
  });
  const finished = done
    .filter((r) => r.t1 >= since)
    .map(({ m, p, s, ms, sms, stall, x }) => ({ m, p, s, ms, sms, stall, x }));
  pending.sort((a, b) => b.ms - a.ms);
  finished.sort((a, b) => b.ms - a.ms);
  return { pending: pending.slice(0, cap), done: finished.slice(0, cap) };
}
