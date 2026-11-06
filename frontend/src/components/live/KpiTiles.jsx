import CellLink from "../ui/CellLink";
import { STATUS_COLOR, STATUS_INK, tp, fmtInt, idleStatus } from "./liveUtils";
import { useCountUp } from "./liveHooks";

// Four equal tiles under the hero. Quiet until a figure crosses its line:
// the number takes the status ink only then, so on a calm shift the row reads
// as plain facts and on a bad one the eye goes straight to the red figure.
function Tile({ label, value, unit, ink, foot, children }) {
  const shown = useCountUp(value);
  return (
    <div className="rounded-2xl p-4 flex flex-col min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="text-[13px] font-medium" style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="font-semibold tabular-nums leading-none tracking-[-0.02em]"
          style={{ fontSize: 34, color: value == null ? "var(--text-3)" : ink || "var(--text-1)" }}>
          {shown == null ? "—" : fmtInt(shown)}
        </span>
        {unit && shown != null && <span className="text-sm" style={{ color: "var(--text-3)" }}>{unit}</span>}
      </div>
      <div className="mt-auto pt-3">{children}</div>
      {foot && <div className="mt-2 text-xs leading-snug" style={{ color: "var(--text-3)" }}>{foot}</div>}
    </div>
  );
}

// A thin track with a marker: the fill is the value, the tick is the line it
// is judged against.
function Meter({ pct, color, tick }) {
  return (
    <div className="relative h-1.5 rounded-full" style={{ background: "var(--bg-inner)" }}>
      <div className="absolute inset-y-0 left-0 rounded-full live-bar" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} />
      {tick != null && (
        <div className="absolute -top-1 -bottom-1 w-[2px] rounded-full" style={{ left: `calc(${Math.max(0, Math.min(100, tick))}% - 1px)`, background: "var(--text-3)" }} />
      )}
    </div>
  );
}

export default function KpiTiles({ kpi, cells, thresholds, t }) {
  if (!kpi) return null;
  const th = thresholds || {};
  const flag = th.unit_idle_flag || 50;
  const warn = th.unit_idle_warn || 25;

  const stopped = (cells || []).filter((c) => c.idle?.stopped_now)
    .sort((a, b) => (b.idle.now_min || 0) - (a.idle.now_min || 0));
  const idleSt = idleStatus(kpi.idle_mean, flag, warn);
  const idleMax = Math.max(flag * 1.5, kpi.idle_mean || 0);
  const by = kpi.units_by_status || {};
  const parts = [["crit", by.crit || 0], ["warn", by.warn || 0], ["ok", by.ok || 0], ["quiet", by.quiet || 0]].filter(([, n]) => n > 0);
  const total = parts.reduce((a, [, n]) => a + n, 0) || 1;
  const need = (by.crit || 0) + (by.warn || 0);

  return (
    <div className="grid gap-3 grid-cols-2 xl:grid-cols-4">
      <Tile label={t("live.kpi.stopped")} value={kpi.cells_stopped} unit={t("live.unit.cells")}
        ink={kpi.cells_stopped > 0 ? STATUS_INK.crit : undefined}
        foot={tp(t, "live.kpi.stoppedSub", { t: kpi.cells_total })}>
        {stopped.length ? (
          <div className="flex flex-wrap gap-1">
            {stopped.slice(0, 6).map((c) => (
              <CellLink key={c.id} id={c.id} className="text-[11px] font-semibold tabular-nums px-1.5 py-0.5 rounded-md"
                style={{ background: STATUS_COLOR.crit, color: "#fff" }}>{c.code}</CellLink>
            ))}
            {stopped.length > 6 && <span className="text-[11px] self-center" style={{ color: "var(--text-3)" }}>+{stopped.length - 6}</span>}
          </div>
        ) : (
          <Meter pct={0} color={STATUS_COLOR.ok} />
        )}
      </Tile>

      <Tile label={t("live.kpi.idle")} value={kpi.idle_mean} unit={t("live.min")}
        ink={idleSt === "crit" || idleSt === "warn" ? STATUS_INK[idleSt] : undefined}
        foot={[
          tp(t, "live.kpi.idleSub", { n: kpi.idle_units_counted, c: kpi.cells_with_idle }),
          kpi.idle_estimate_units ? tp(t, "live.kpi.idleEst", { n: kpi.idle_estimate_units }) : null,
        ].filter(Boolean).join(" · ")}>
        {kpi.idle_mean != null
          ? <Meter pct={(kpi.idle_mean / idleMax) * 100} color={STATUS_COLOR[idleSt] || STATUS_COLOR.quiet} tick={(flag / idleMax) * 100} />
          : <Meter pct={0} color={STATUS_COLOR.quiet} />}
      </Tile>

      <Tile label={t("live.kpi.people")} value={kpi.people}
        foot={tp(t, "live.kpi.peopleSub", { c: kpi.cells_with_people, u: kpi.units_with_attendance ?? 0 })}>
        <Meter pct={kpi.cells_total ? (kpi.cells_with_people / kpi.cells_total) * 100 : 0} color="var(--text-3)" />
      </Tile>

      <Tile label={t("live.kpi.units")} value={need} unit={tp(t, "live.kpi.unitsOf", { n: kpi.units })}
        ink={by.crit ? STATUS_INK.crit : by.warn ? STATUS_INK.warn : undefined}
        foot={parts.map(([k, n]) => `${n} ${t(`live.st.${k}`).toLowerCase()}`).join(" · ")}>
        <div className="flex h-1.5 rounded-full overflow-hidden gap-[2px]" style={{ background: "var(--bg-inner)" }}>
          {parts.map(([k, n]) => (
            <div key={k} className="h-full live-bar" style={{ width: `${(n / total) * 100}%`, background: STATUS_COLOR[k] }} title={`${t(`live.st.${k}`)}: ${n}`} />
          ))}
        </div>
      </Tile>
    </div>
  );
}
