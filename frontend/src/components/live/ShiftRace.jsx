import { WifiOff } from "lucide-react";
import { STATUS_COLOR, STATUS_INK, tp, fmtInt, fmtHM, clockOf, paceStatus } from "./liveUtils";
import { useCountUp } from "./liveHooks";

// The hero of the wall screen: the shift CLOCK and the PLAN on one axis.
// The track is the shift (start → end); the hatched band is the time already
// spent; the fill is the share of the plan made; the vertical line is now.
// Under the backend's linear expectation (expected = share of shift elapsed)
// the two are the same scale, so «behind» is literally the gap between where
// the fill stops and where the line stands — readable from across the room.
function ticksOf(frame, every) {
  const [sh, sm] = String(frame.start).split(":").map(Number);
  const startMin = sh * 60 + sm;
  const out = [];
  const first = Math.ceil(startMin / (every * 60)) * every * 60;
  for (let m = first; m <= startMin + frame.duration_min; m += every * 60) {
    out.push({ pos: (m - startMin) / frame.duration_min, label: `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:00` });
  }
  return out;
}

export default function ShiftRace({ frame, kpi, thresholds, t, now, refreshedAt, interval, fetching, offline, mobile }) {
  const state = frame?.state || "running";
  const running = state === "running";

  // Elapsed runs off the client clock between polls, so the line moves every
  // second rather than every 30 — the server's own figure is the anchor.
  let elapsed = frame?.elapsed_min ?? 0;
  let progress = frame?.progress ?? 0;
  if (frame && running && frame.started_at) {
    const started = new Date(frame.started_at).getTime();
    if (!Number.isNaN(started)) {
      elapsed = Math.max(0, Math.min(frame.duration_min, (now - started) / 60000));
      progress = frame.duration_min ? elapsed / frame.duration_min : 0;
    }
  }
  const expected = running ? progress * 100 : 100;
  const pct = kpi?.plan_pct;
  const shownPct = useCountUp(pct);
  const st = paceStatus(kpi?.pace, thresholds);
  const fill = st ? STATUS_COLOR[st] : STATUS_COLOR.quiet;
  const gap = pct == null ? null : Math.round(pct - expected);

  let verdict;
  let ink = "var(--text-2)";
  if (pct == null) verdict = t("live.kpi.planNone");
  else if (kpi.pace == null) verdict = (kpi.actual_min || 0) > 0 ? t("live.kpi.paceEarly") : t("live.kpi.paceNoActual");
  else {
    ink = STATUS_INK[st];
    const lead = gap < 0 ? tp(t, "live.hero.behind", { n: Math.abs(gap) })
      : gap > 0 ? tp(t, "live.hero.ahead", { n: gap }) : t("live.hero.onPlan");
    verdict = `${lead} · ${tp(t, "live.hero.pace", { p: fmtInt(kpi.pace) })}`;
  }
  const projected = pct != null && running && progress > 0.05 ? Math.min(300, pct / Math.max(progress, 0.05)) : null;
  const left = fmtHM(frame ? Math.max(0, frame.duration_min - elapsed) : null);
  const ago = refreshedAt ? Math.max(0, Math.round((now - refreshedAt) / 1000)) : null;
  const d = new Date(now);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");

  const P = Math.max(0, Math.min(100, pct ?? 0));
  const E = Math.max(0, Math.min(100, expected));
  const ticks = frame ? ticksOf(frame, mobile ? 4 : 2) : [];
  const nowLabel = running ? `${hh}:${mm}` : frame?.end;

  return (
    <section className="relative rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      aria-label={t("live.kpi.plan")}>
      {/* Poll sweep: fills over one interval and restarts on every refresh, so
          the screen visibly breathes and a frozen one is noticeable. */}
      <div className="h-[2px] w-full" style={{ background: "var(--bg-inner)" }} aria-hidden="true">
        <div key={refreshedAt || 0} className="h-full live-sweep"
          style={{ background: offline ? STATUS_COLOR.quiet : "rgba(var(--brand-rgb), .75)", "--live-interval": `${interval / 1000}s` }} />
      </div>

      <div className="px-4 pt-4 md:px-6 md:pt-5 flex items-end justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[13px] font-medium" style={{ color: "var(--text-3)" }}>{t("live.kpi.plan")}</div>
          <div className="mt-1.5 flex items-baseline gap-x-3 gap-y-1 flex-wrap">
            <span className="font-semibold tabular-nums leading-none tracking-[-0.03em]"
              style={{ fontSize: mobile ? 44 : 58, color: pct == null ? "var(--text-3)" : "var(--text-1)" }}>
              {shownPct == null ? "—" : fmtInt(shownPct)}
              {shownPct != null && <span className="font-medium" style={{ fontSize: mobile ? 22 : 28, color: "var(--text-3)" }}>%</span>}
            </span>
            {pct != null && (
              <span className="text-sm tabular-nums" style={{ color: "var(--text-3)" }}>
                {tp(t, "live.plan.expected", { e: fmtInt(expected) })}
              </span>
            )}
          </div>
          <div className="mt-2 text-[15px] font-semibold" style={{ color: ink }}>{verdict}</div>
        </div>
        {!mobile && (
          <div className="text-right flex-shrink-0">
            <div className="font-medium tabular-nums leading-none tracking-[-0.02em]" style={{ fontSize: 36, color: "var(--text-1)" }}>
              {running ? <>{hh}:{mm}<span style={{ fontSize: 20, color: "var(--text-3)" }}>:{ss}</span></> : frame?.end}
            </div>
            <div className="mt-2 text-[13px]" style={{ color: "var(--text-3)" }}>
              {running && left ? tp(t, "live.left", { h: left.h, m: left.m })
                : state === "replay" ? t("live.replay")
                : frame?.next_start_at ? tp(t, "live.nextStart", { t: clockOf(frame.next_start_at) }) : t("live.ended")}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 pb-4 pt-5 md:px-6 md:pb-5">
        <div className="relative h-4 rounded-full" style={{ background: "var(--bg-inner)", boxShadow: "inset 0 0 0 1px var(--border)" }}>
          {/* time spent */}
          <div className="absolute inset-y-0 left-0 rounded-full live-bar" aria-hidden="true"
            style={{ width: `${E}%`, background: "repeating-linear-gradient(135deg, rgba(148,163,184,.20) 0 2px, transparent 2px 7px)" }} />
          {/* plan made */}
          {pct != null && (
            <div className="absolute inset-y-0 left-0 rounded-full live-bar" aria-hidden="true"
              style={{ width: `${P}%`, background: fill }} />
          )}
          {/* now */}
          {frame && (
            <div className="absolute -top-2 -bottom-2 w-[2px] rounded-full live-marker" aria-hidden="true"
              style={{ left: `calc(${E}% - 1px)`, background: "var(--text-1)", boxShadow: "0 0 0 3px var(--bg-card)" }} />
          )}
        </div>
        <div className="relative h-5 mt-2 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }} aria-hidden="true">
          {ticks.filter((k) => Math.abs(k.pos * 100 - E) > (mobile ? 13 : 6)).map((k) => (
            <span key={k.label} className="absolute"
              style={{ left: `${k.pos * 100}%`, transform: k.pos <= 0.001 ? "none" : k.pos >= 0.999 ? "translateX(-100%)" : "translateX(-50%)" }}>
              {k.label}
            </span>
          ))}
          {frame && (
            <span className="absolute font-semibold live-marker"
              style={{ left: `${E}%`, transform: E < 4 ? "none" : E > 96 ? "translateX(-100%)" : "translateX(-50%)", color: "var(--text-1)" }}>
              {nowLabel}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 flex-wrap text-xs" style={{ color: "var(--text-3)" }}>
          <span className="tabular-nums">
            {projected != null ? tp(t, "live.plan.projected", { x: fmtInt(projected) })
              : pct != null ? tp(t, "live.kpi.planSub", { e: fmtInt(expected), a: fmtInt(kpi.actual_min), p: fmtInt(kpi.plan_min) }) : ""}
            {mobile && running && left ? ` · ${tp(t, "live.left", { h: left.h, m: left.m })}` : ""}
          </span>
          {offline ? (
            <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: STATUS_INK.warn }}>
              <WifiOff size={13} aria-hidden="true" />
              {tp(t, "live.offline", { t: refreshedAt ? clockOf(new Date(refreshedAt).toISOString()) : "—" })}
            </span>
          ) : (
            <span className="tabular-nums">{fetching ? t("live.updating") : ago != null ? tp(t, "live.updated", { s: ago }) : ""}</span>
          )}
        </div>
        {state === "replay" && (
          <div className="mt-3 text-xs font-medium px-3 py-2 rounded-xl" style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
            {t("live.replayHint")}
          </div>
        )}
      </div>
    </section>
  );
}
