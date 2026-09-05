import { Target, Gauge, Timer, Siren, Bell, Users } from "lucide-react";
import { STATUS_COLOR, hexA, tp, fmtInt } from "./liveUtils";
import { useCountUp } from "./liveHooks";

// A polyline of the page's own samples — how the figure moved since this
// screen was opened. Two points or fewer draw nothing.
function Spark({ rows, pick, color }) {
  const vals = (rows || []).map(pick).filter((v) => v != null && !Number.isNaN(Number(v))).map(Number);
  if (vals.length < 3) return null;
  const w = 120, h = 30;
  const min = Math.min(...vals), max = Math.max(...vals);
  const span = max - min || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - 2 - ((v - min) / span) * (h - 4)).toFixed(1)}`).join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block flex-shrink-0" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity=".85" />
    </svg>
  );
}

function Tile({ icon: Icon, label, value, unit, sub, color, pulse, spark, bar }) {
  const shown = useCountUp(value);
  const c = color || STATUS_COLOR.quiet;
  return (
    <div
      className={`relative rounded-2xl p-4 flex flex-col gap-2 overflow-hidden ${pulse ? "live-pulse" : ""}`}
      style={{ background: "var(--bg-card)", border: `1px solid ${pulse ? hexA(c, 0.55) : "var(--border)"}` }}
    >
      <div className="absolute inset-x-0 top-0 h-1" style={{ background: c, opacity: 0.9 }} />
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] uppercase tracking-widest font-semibold" style={{ color: "var(--text-3)" }}>{label}</div>
        <span className="grid place-items-center w-8 h-8 rounded-lg flex-shrink-0 -mt-1" style={{ background: hexA(c, 0.14), color: c }}>
          <Icon size={16} strokeWidth={2.3} />
        </span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="font-mono font-bold tabular-nums leading-none" style={{ color: value == null ? "var(--text-3)" : c, fontSize: "clamp(30px, 2.6vw, 42px)" }}>
          {shown == null ? "—" : fmtInt(shown)}
          {unit && shown != null && <span className="text-base font-semibold ml-1" style={{ color: "var(--text-3)" }}>{unit}</span>}
        </div>
        {spark}
      </div>
      {bar}
      {sub && <div className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>{sub}</div>}
    </div>
  );
}

// ПЛАН bar with the EXPECTED marker: the fill is what was made, the tick is
// where the linear clock says it should be by now.
function PlanBar({ pct, expected, color }) {
  const p = Math.max(0, Math.min(100, pct ?? 0));
  const e = Math.max(0, Math.min(100, expected ?? 0));
  return (
    <div className="relative h-2 rounded-full overflow-visible" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="absolute inset-y-0 left-0 rounded-full live-bar" style={{ width: `${p}%`, background: color }} />
      <div className="absolute -top-1 -bottom-1 w-[2px] live-marker" style={{ left: `${e}%`, background: "var(--text-2)" }} title={`${Math.round(e)}%`} />
    </div>
  );
}

function IdleBar({ value, flag, warn }) {
  const max = Math.max(flag * 1.5, value || 0);
  const w = (v) => `${Math.max(0, Math.min(100, ((v || 0) / max) * 100))}%`;
  const color = value == null ? STATUS_COLOR.quiet : value >= flag ? STATUS_COLOR.crit : value >= warn ? STATUS_COLOR.warn : STATUS_COLOR.ok;
  return (
    <div className="relative h-2 rounded-full" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="absolute inset-y-0 left-0 rounded-full live-bar" style={{ width: w(value), background: color }} />
      <div className="absolute -top-1 -bottom-1 w-[2px]" style={{ left: w(flag), background: STATUS_COLOR.crit, opacity: 0.8 }} title={`${flag}`} />
    </div>
  );
}

export default function KpiTiles({ kpi, frame, thresholds, samples, t }) {
  if (!kpi) return null;
  const th = thresholds || {};
  const live = frame?.state === "running";

  const paceStatus = (p) => (p == null ? null : p >= th.pace_warn * 100 ? "ok" : p >= th.pace_crit * 100 ? "warn" : "crit");
  const planColor = kpi.plan_pct == null ? STATUS_COLOR.quiet
    : kpi.pace == null ? STATUS_COLOR.info
    : STATUS_COLOR[paceStatus(kpi.pace)];
  const planSub = kpi.plan_pct == null
    ? t("live.kpi.planNone")
    : tp(t, "live.kpi.planSub", { e: fmtInt(kpi.expected_pct), a: fmtInt(kpi.actual_min), p: fmtInt(kpi.plan_min) });

  const projected = kpi.plan_pct != null && frame?.progress > 0.05
    ? Math.min(300, kpi.plan_pct / Math.max(frame.progress, 0.05))
    : null;
  const paceSub = kpi.pace != null
    ? tp(t, "live.kpi.paceSub", { x: projected == null ? "—" : fmtInt(projected) })
    : kpi.plan_pct == null ? t("live.kpi.planNone")
    : (kpi.actual_min || 0) > 0 ? t("live.kpi.paceEarly") : t("live.kpi.paceNoActual");

  const idleColor = kpi.idle_mean == null ? STATUS_COLOR.quiet
    : kpi.idle_mean >= th.unit_idle_flag ? STATUS_COLOR.crit
    : kpi.idle_mean >= th.unit_idle_warn ? STATUS_COLOR.warn : STATUS_COLOR.ok;
  const idleSub = [
    tp(t, "live.kpi.idleSub", { n: kpi.idle_units_counted, c: kpi.cells_with_idle }),
    kpi.idle_estimate_units ? tp(t, "live.kpi.idleEst", { n: kpi.idle_estimate_units }) : null,
  ].filter(Boolean).join(" · ");

  const stoppedColor = kpi.cells_stopped > 0 ? STATUS_COLOR.crit : live ? STATUS_COLOR.ok : STATUS_COLOR.quiet;
  const alertsTotal = (kpi.alerts?.crit || 0) + (kpi.alerts?.warn || 0);
  const alertsColor = kpi.alerts?.crit ? STATUS_COLOR.crit : kpi.alerts?.warn ? STATUS_COLOR.warn : STATUS_COLOR.ok;

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      <Tile icon={Target} label={t("live.kpi.plan")} value={kpi.plan_pct} unit="%" color={planColor} sub={planSub}
        spark={<Spark rows={samples} pick={(r) => r.plan} color={planColor} />}
        bar={kpi.plan_pct != null ? <PlanBar pct={kpi.plan_pct} expected={kpi.expected_pct} color={planColor} /> : null} />
      <Tile icon={Gauge} label={t("live.kpi.pace")} value={kpi.pace} unit="%" color={kpi.pace == null ? STATUS_COLOR.quiet : STATUS_COLOR[paceStatus(kpi.pace)]} sub={paceSub}
        spark={<Spark rows={samples} pick={(r) => r.pace} color={kpi.pace == null ? STATUS_COLOR.quiet : STATUS_COLOR[paceStatus(kpi.pace)]} />} />
      <Tile icon={Timer} label={t("live.kpi.idle")} value={kpi.idle_mean} unit={t("live.min")} color={idleColor} sub={idleSub}
        spark={<Spark rows={samples} pick={(r) => r.idle} color={idleColor} />}
        bar={kpi.idle_mean != null ? <IdleBar value={kpi.idle_mean} flag={th.unit_idle_flag || 50} warn={th.unit_idle_warn || 25} /> : null} />
      <Tile icon={Siren} label={t("live.kpi.stopped")} value={kpi.cells_stopped} color={stoppedColor} pulse={kpi.cells_stopped > 0}
        sub={tp(t, "live.kpi.stoppedSub", { t: kpi.cells_total })} />
      <Tile icon={Users} label={t("live.kpi.people")} value={kpi.people} color={kpi.people > 0 ? STATUS_COLOR.info : STATUS_COLOR.quiet}
        sub={tp(t, "live.kpi.peopleSub", { c: kpi.cells_with_people, u: kpi.units_with_attendance ?? 0 })} />
      <Tile icon={Bell} label={t("live.kpi.alerts")} value={alertsTotal} color={alertsColor}
        sub={tp(t, "live.kpi.alertsSub", { c: kpi.alerts?.crit || 0, w: kpi.alerts?.warn || 0 })} />
    </div>
  );
}
