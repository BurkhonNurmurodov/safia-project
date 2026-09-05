import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { reducedMotion } from "./liveUtils";

// A number that COUNTS to its new value instead of jumping — the eye catches
// motion from across a room, a replaced digit it does not. Ease-out cubic,
// ~0.8 s; under reduced-motion the value simply snaps.
export function useCountUp(value, ms = 800) {
  const target = Number.isFinite(Number(value)) ? Number(value) : null;
  const [disp, setDisp] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    if (target == null) { fromRef.current = null; setDisp(null); return undefined; }
    const from = fromRef.current == null ? target : fromRef.current;
    if (from === target || reducedMotion()) { fromRef.current = target; setDisp(target); return undefined; }
    let raf = 0;
    const t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      const v = from + (target - from) * e;
      fromRef.current = v;
      setDisp(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return disp;
}

// FLIP reorder for a list whose children carry `data-flip-key`: measure
// before, measure after, play the difference. A row that climbs from the
// bottom to the top of the board is SEEN climbing.
export function useFlip(deps) {
  const ref = useRef(null);
  const prev = useRef(new Map());
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = new Map();
    const kids = Array.from(el.children);
    for (const child of kids) {
      const k = child.dataset?.flipKey;
      if (k) next.set(k, child.getBoundingClientRect());
    }
    if (!reducedMotion() && typeof Element !== "undefined" && Element.prototype.animate) {
      for (const child of kids) {
        const k = child.dataset?.flipKey;
        const before = k && prev.current.get(k);
        const after = k && next.get(k);
        if (!before || !after) continue;
        const dy = before.top - after.top;
        const dx = before.left - after.left;
        if (Math.abs(dy) < 1 && Math.abs(dx) < 1) continue;
        child.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }],
          { duration: 550, easing: "cubic-bezier(.22, 1, .36, 1)" },
        );
      }
    }
    prev.current = next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

// A tick every `ms` — for the wall clock and the "updated N s ago" line.
export function useTick(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

// Fullscreen on ONE element (the page root), so the app chrome leaves with
// it. Unsupported inside Telegram's WebView — `supported` hides the button.
export function useFullscreen(ref) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const h = () => setOn(!!document.fullscreenElement && document.fullscreenElement === ref.current);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, [ref]);
  const toggle = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.().catch?.(() => {});
    } else {
      const p = ref.current?.requestFullscreen?.();
      if (p && typeof p.catch === "function") p.catch(() => {});
    }
  }, [ref]);
  const supported = typeof document !== "undefined" && !!document.fullscreenEnabled;
  return { on, toggle, supported };
}

// The page's own memory of the shift: one sample per successful poll, so the
// KPI tiles can draw a sparkline of how the figure moved since the screen
// was opened. Reset when the frame changes (a new shift-day, another shift).
export function useSamples(data, max = 240) {
  const ref = useRef({ key: null, rows: [] });
  const frameKey = data?.frame ? `${data.frame.shift}:${data.frame.day}` : null;
  const at = data?.generated_at;
  if (frameKey && frameKey !== ref.current.key) ref.current = { key: frameKey, rows: [] };
  if (at && data?.kpi) {
    const rows = ref.current.rows;
    if (!rows.length || rows[rows.length - 1].at !== at) {
      rows.push({
        at,
        plan: data.kpi.plan_pct,
        pace: data.kpi.pace,
        idle: data.kpi.idle_mean,
        stopped: data.kpi.cells_stopped,
        alerts: (data.kpi.alerts?.crit || 0) + (data.kpi.alerts?.warn || 0),
      });
      if (rows.length > max) rows.splice(0, rows.length - max);
    }
  }
  return ref.current.rows;
}

// Which alert keys are NEW since the last poll — those slide in. The first
// payload seeds the set silently, so a screen opened mid-shift does not play
// forty entrances at once.
const NONE = new Set();
export function useNewKeys(keys, holdMs = 2500) {
  const seen = useRef(null);
  const prevSig = useRef(null);
  const fresh = useRef({ set: NONE, until: 0 });
  const sig = (keys || []).join("|");
  if (seen.current === null) {
    seen.current = new Set(keys || []);
    prevSig.current = sig;
  } else if (sig !== prevSig.current) {
    const cur = new Set(keys || []);
    const set = new Set();
    for (const k of cur) if (!seen.current.has(k)) set.add(k);
    seen.current = cur;
    prevSig.current = sig;
    if (set.size) fresh.current = { set, until: Date.now() + holdMs };
  }
  return Date.now() < fresh.current.until ? fresh.current.set : NONE;
}
