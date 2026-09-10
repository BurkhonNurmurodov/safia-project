import { useCallback, useEffect, useRef, useState } from "react";
import api, { authHeaders } from "../utils/api";

/**
 * Watch it, and say WHICH parts were watched.
 *
 * The player calls `report(currentTime)` on every tick it produces; this turns
 * that stream of positions into SPANS — one per continuous run of playback —
 * and posts them. The server takes the union (`services/education_progress`),
 * which is what makes a skipped passage stay unwatched however long the person
 * sat on the page, and what stops a re-watched opening minute counting twice.
 * The union is deliberately NOT taken here: a client is never trusted with the
 * arithmetic its own score is computed from.
 *
 * A SEEK is inferred rather than listened for, because the three players agree
 * on nothing else: a position that moved further than the wall clock could
 * account for is a jump, so the open span is closed and a new one opened at the
 * new position. That one rule covers a scrub bar, a double-tap skip, a chapter
 * jump and a rewind, on a native <video> and inside two foreign iframes alike.
 */

// The player ticks ~4×/s; posting that often would be absurd. 15s bounds what a
// closed tab can lose while keeping the register live enough to watch.
const FLUSH_MS = 15000;
// Fastest legitimate playback. The server applies the same bound to what it is
// willing to believe (`education_progress.MAX_RATE`); this is the client half,
// and it is what tells a 2× run from a scrub.
const MAX_RATE = 2;
// Slack on top of the wall-clock test, for a tick delayed by a busy phone. Too
// small and ordinary jank splits a continuous watch into fragments — harmless
// for coverage, but it inflates the span list.
const STEP_SLACK_S = 1.5;
// Backward jitter that is not a rewind. Players re-report a slightly earlier
// position all the time when decoding catches up.
const BACK_TOL_S = 0.4;

function newSession() {
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch { /* older WebView */ }
  return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export default function useWatchTracker({ lessonId, enabled = true }) {
  const spans = useRef([]);          // closed spans, awaiting a flush
  const open = useRef(null);         // { start, end } — the run in progress
  const lastWall = useRef(0);
  const session = useRef(newSession());
  const duration = useRef(null);
  const inFlight = useRef(false);
  const [progress, setProgress] = useState(null);

  const close = useCallback(() => {
    const o = open.current;
    open.current = null;
    if (o && o.end > o.start) spans.current.push([o.start, o.end]);
  }, []);

  /** The player's current position. Called on every tick, and only while
   *  PLAYING — a paused player must not extend a span. */
  const report = useCallback((t, dur) => {
    if (!enabled || typeof t !== "number" || !isFinite(t) || t < 0) return;
    if (typeof dur === "number" && isFinite(dur) && dur > 0) duration.current = dur;

    const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
    const wall = lastWall.current ? (now - lastWall.current) / 1000 : 0;
    lastWall.current = now;

    const o = open.current;
    if (!o) { open.current = { start: t, end: t }; return; }
    const moved = t - o.end;
    if (moved >= -BACK_TOL_S && moved <= wall * MAX_RATE + STEP_SLACK_S) {
      o.end = Math.max(o.end, t);           // still the same continuous run
    } else {
      close();                              // a jump: this run ended, another begins
      open.current = { start: t, end: t };
    }
  }, [enabled, close]);

  /** Playback stopped (pause, tab hidden, player torn down). Ends the run so a
   *  later resume at the same second cannot bridge the gap it left. */
  const pause = useCallback(() => { close(); lastWall.current = 0; }, [close]);

  /** The video reached its end. The tail bucket of a video whose duration is not
   *  a whole number is otherwise unreachable — the last tick fires just short of
   *  it — and with only 100% counting as watched, that one bucket would hold
   *  every viewer below the line forever. */
  const markEnded = useCallback((dur) => {
    const end = (typeof dur === "number" && isFinite(dur) && dur > 0)
      ? dur : duration.current;
    if (!end) { close(); return; }
    duration.current = end;
    const o = open.current;
    if (o) { o.end = end; close(); }
    else spans.current.push([Math.max(0, end - 1), end]);
  }, [close]);

  /**
   * Send what has accumulated.
   *
   * `beacon` is for the page going away — `fetch(keepalive)` and not
   * `sendBeacon`, which cannot carry the auth headers this API requires on
   * every request. Spans are put BACK on failure, so a dropped line costs
   * nothing but a delay.
   */
  const flush = useCallback(async ({ beacon = false } = {}) => {
    if (!enabled || !lessonId) return;
    close();
    if (!spans.current.length) return;
    if (inFlight.current && !beacon) return;

    const batch = spans.current;
    spans.current = [];
    const body = {
      lesson_id: lessonId,
      session: session.current,
      duration: duration.current,
      spans: batch,
    };

    if (beacon) {
      try {
        await fetch(`${import.meta.env.VITE_API_URL || ""}/api/education/progress`, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(body),
        });
      } catch { spans.current = batch.concat(spans.current); }
      return;
    }

    inFlight.current = true;
    try {
      const { data } = await api.post("/api/education/progress", body);
      if (data) setProgress(data);
    } catch {
      spans.current = batch.concat(spans.current);
    } finally {
      inFlight.current = false;
    }
  }, [enabled, lessonId, close]);

  // The heartbeat, plus the two ways a lesson ends without anybody pressing
  // anything: the tab is hidden (Telegram backgrounded, a call comes in) and the
  // document goes away. `pagehide` rather than `beforeunload` — iOS WebViews
  // fire the latter unreliably, and it is the platform this runs on.
  useEffect(() => {
    if (!enabled || !lessonId) return undefined;
    const timer = setInterval(() => { flush(); }, FLUSH_MS);
    const onHide = () => { pause(); flush({ beacon: true }); };
    const onVis = () => { if (document.hidden) onHide(); };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onVis);
      // Unmounting is leaving the lesson: send the tail rather than dropping it.
      pause();
      flush({ beacon: true });
    };
  }, [enabled, lessonId, flush, pause]);

  return { report, pause, markEnded, flush, progress };
}
