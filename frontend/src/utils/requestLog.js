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
// Each finished request also carries the BROWSER's own account of where its
// time went (`rt`, off PerformanceResourceTiming, matched by path and start
// instant): `stall` — held in the browser before it was sent (a connection that
// died while the app was in the background shows here: Chrome sends the request
// on the dead one, waits ~10 s for its PING, then opens a new one), `conn` —
// DNS + connecting, `ttfb` — sent to first byte, `dl` — the download, `size`,
// `proto` (h2 / h3). Our wall clock says HOW LONG; this says WHERE. The same
// for the page chunks a lazy route loads (`scriptsSince`) — those never pass
// through axios, and the «page» gate waits on exactly them.
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

// ---- the browser's own timing -------------------------------------------

// The buffer holds 250 entries by default and then STOPS recording: a tab
// polling the bell every minute fills it within the hour, and the request a
// report needs is then the one with no entry. Widen it, and clear it when it
// fills — only the recent window is ever read.
try {
  if (typeof performance !== "undefined") {
    performance.setResourceTimingBufferSize?.(600);
    performance.addEventListener?.("resourcetimingbufferfull", () => {
      try { performance.clearResourceTimings(); } catch { /* nothing to clear */ }
    });
  }
} catch {
  /* an old engine without the API — reports simply carry no phases */
}

function entries() {
  try {
    return performance.getEntriesByType("resource") || [];
  } catch {
    return [];
  }
}

/** The phases of one PerformanceResourceTiming entry, in whole ms. */
function phases(e) {
  const fs = e.fetchStart || e.startTime;
  // Same-origin, so every phase is readable; a 0 requestStart means the entry
  // is opaque after all (a proxy answered?) and its phases would be guesses.
  if (!e.requestStart || !e.responseStart) return undefined;
  const dns0 = e.domainLookupStart || fs;
  const dns1 = e.domainLookupEnd || dns0;
  const c0 = e.connectStart || dns1;
  const c1 = e.connectEnd || c0;
  const nz = (v) => (v > 0 ? Math.round(v) : 0);
  return {
    // Waited in the browser before anything was sent: before DNS/connecting
    // began, plus between the socket being ready and the request going out.
    stall: nz(dns0 - fs) + nz(e.requestStart - c1),
    conn: nz(dns1 - dns0) + nz(c1 - c0),
    ttfb: nz(e.responseStart - e.requestStart),
    dl: nz(e.responseEnd - e.responseStart),
    size: nz(e.transferSize),
    proto: String(e.nextHopProtocol || "").slice(0, 12) || undefined,
  };
}

/** The browser's timing of a finished request of ours, or undefined. */
function timingFor(r) {
  try {
    let best;
    let bestGap = Infinity;
    for (const e of entries()) {
      if (e.initiatorType !== "xmlhttprequest" && e.initiatorType !== "fetch") continue;
      if (pathOf(e.name) !== r.p) continue;
      // Started within a breath of our own stamp (noteStart runs just before
      // send), ended about when we saw the answer — the second copy of a
      // hedged request has the same path and a later start.
      const gap = Math.abs(e.startTime - r.t0) + Math.abs(e.responseEnd - r.t1) / 4;
      if (Math.abs(e.startTime - r.t0) > 250 || gap >= bestGap) continue;
      best = e;
      bestGap = gap;
    }
    return best ? phases(best) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The page code (and styles) the browser fetched in the window from `since`:
 * the chunks a lazy route imports, which the «page» gate waits on. Slowest
 * first, capped; each with the browser's phases.
 */
export function scriptsSince(since, cap = 4) {
  try {
    const out = [];
    for (const e of entries()) {
      const path = pathOf(e.name);
      if (!/\/assets\/[^/]+\.(js|css)$/.test(path)) continue;
      if (e.responseEnd < since) continue;
      out.push({
        n: path.slice(path.lastIndexOf("/") + 1).slice(0, 60),
        ms: Math.round(e.responseEnd - e.startTime),
        at: Math.round(e.startTime - since), // when it was asked for, from the wait's start
        ...(phases(e) || {}),
      });
    }
    out.sort((a, b) => b.ms - a.ms);
    return out.slice(0, cap);
  } catch {
    return [];
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
    .map((r) => {
      const { m, p, s, ms, sms, stall, x } = r;
      return { m, p, s, ms, sms, stall, x, at: Math.round(r.t0 - since), rt: x ? undefined : timingFor(r) };
    });
  pending.sort((a, b) => b.ms - a.ms);
  finished.sort((a, b) => b.ms - a.ms);
  return { pending: pending.slice(0, cap), done: finished.slice(0, cap) };
}
