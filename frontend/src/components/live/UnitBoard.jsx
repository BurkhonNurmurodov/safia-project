import { useRef } from "react";
import { Link } from "react-router-dom";
import { Crown, CheckCircle2, AlertTriangle, Siren } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import CellLink from "../ui/CellLink";
import EmptyState from "../ui/EmptyState";
import { STATUS_COLOR, STATUS_RANK, hexA, tp, fmtInt, fmtPct, clockOf, planColor } from "./liveUtils";
import { useFlip } from "./liveHooks";

const COLS = "minmax(180px,1.6fr) 1.4fr .8fr 1.4fr .9fr .55fr .9fr";
const NONE = new Set();

function Bar({ pct, marker, color, flag }) {
  const p = Math.max(0, Math.min(100, pct ?? 0));
  return (
    <div className="relative h-2 rounded-full" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="absolute inset-y-0 left-0 rounded-full live-bar" style={{ width: `${p}%`, background: color }} />
      {marker != null && (
        <div className="absolute -top-1 -bottom-1 w-[2px] live-marker" style={{ left: `${Math.max(0, Math.min(100, marker))}%`, background: flag ? STATUS_COLOR.crit : "var(--text-2)", opacity: flag ? 0.8 : 1 }} />
      )}
    </div>
  );
}

function StatusChip({ status, t }) {
  const c = STATUS_COLOR[status] || STATUS_COLOR.quiet;
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap"
      style={{ background: hexA(c, 0.14), color: c, border: `1px solid ${hexA(c, 0.3)}` }}>
      {t(`live.st.${status}`)}
    </span>
  );
}

// The ranked board: every brigadir of the shift, worst first, each row saying
// where the plan stands against the clock and how much the unit has waited.
// Rows reorder with a FLIP animation, and a row that got WORSE since the last
// poll flashes — the eye is pulled to the change, not to the table.
export default function UnitBoard({ units, thresholds, frame, t, tl, mobile }) {
  const th = thresholds || {};
  const orderKey = (units || []).map((u) => `${u.id}:${u.status}`).join(",");
  const listRef = useFlip([orderKey]);
  const prevStatus = useRef(new Map());
  const prevSig = useRef(null);
  const flash = useRef({ ids: NONE, until: 0 });
  if (prevSig.current !== orderKey) {
    const esc = new Set();
    for (const u of units || []) {
      const prev = prevStatus.current.get(u.id);
      if (prev && (STATUS_RANK[u.status] ?? 0) > (STATUS_RANK[prev] ?? 0)) esc.add(u.id);
    }
    prevStatus.current = new Map((units || []).map((u) => [u.id, u.status]));
    prevSig.current = orderKey;
    if (esc.size) flash.current = { ids: esc, until: Date.now() + 2500 };
  }
  const escalated = Date.now() < flash.current.until ? flash.current.ids : NONE;

  const noPlan = (units || []).filter((u) => !(u.plan?.plan_min > 0)).length;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead
        icon={Crown}
        title={t("live.units")}
        subtitle={t("live.unitsSub")}
        right={
          <div className="flex items-center gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
            {noPlan > 0 && <span>{tp(t, "live.noPlanUnits", { n: noPlan })}</span>}
            <span className="font-mono">{(units || []).length}</span>
          </div>
        }
      />
      {!units?.length ? (
        <EmptyState title={t("live.noUnits")} message="" showUploadLink={false} height="h-32" />
      ) : (
        <div>
          {!mobile && (
            <div className="grid gap-3 px-4 py-2 text-[10px] font-semibold uppercase tracking-wider"
              style={{ gridTemplateColumns: COLS, color: "var(--text-4)", borderBottom: "1px solid var(--border)" }}>
              <div />
              <div>{t("live.col.plan")}</div>
              <div>{t("live.col.pace")}</div>
              <div>{t("live.col.idle")}</div>
              <div>{t("live.col.cells")}</div>
              <div>{t("live.col.people")}</div>
              <div>{t("live.col.fresh")}</div>
            </div>
          )}
          <div ref={listRef}>
            {units.map((u) => {
              const c = STATUS_COLOR[u.status] || STATUS_COLOR.quiet;
              const p = u.plan || {};
              const pc = planColor(p.status);
              const idle = u.idle || {};
              const idleColor = idle.basis === "none" ? STATUS_COLOR.quiet
                : idle.min >= th.unit_idle_flag ? STATUS_COLOR.crit
                : idle.min >= th.unit_idle_warn ? STATUS_COLOR.warn : STATUS_COLOR.ok;
              const idleMax = Math.max((th.unit_idle_flag || 50) * 1.5, idle.min || 0);
              const lag = p.lag_min;
              const flash = escalated.has(u.id) ? "live-flash" : "";
              const planCell = (
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono font-bold text-lg tabular-nums leading-none" style={{ color: p.pct == null ? "var(--text-3)" : pc }}>
                      {p.pct == null ? t("live.plan.none") : fmtPct(p.pct)}
                    </span>
                    {p.pct != null && (
                      <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{tp(t, "live.plan.expected", { e: fmtInt(p.expected_pct) })}</span>
                    )}
                    {p.status === "noactual" && <span className="text-[11px] font-semibold" style={{ color: STATUS_COLOR.warn }}>{t("live.plan.noactual")}</span>}
                    {p.status === "early" && <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("live.plan.early")}</span>}
                  </div>
                  {p.pct != null && <Bar pct={p.pct} marker={p.expected_pct} color={pc} />}
                </div>
              );
              const paceCell = (
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-mono font-bold text-lg tabular-nums leading-none" style={{ color: p.pace == null ? "var(--text-3)" : pc }}>
                    {p.pace == null ? "—" : fmtPct(p.pace)}
                  </span>
                  {lag != null && p.pace != null && (
                    <span className="text-[11px]" style={{ color: lag > 0 ? STATUS_COLOR.warn : STATUS_COLOR.ok }}>
                      {lag > 0 ? tp(t, "live.plan.lag", { m: fmtInt(lag) }) : tp(t, "live.plan.ahead", { m: fmtInt(-lag) })}
                    </span>
                  )}
                  {p.projected_pct != null && frame?.state === "running" && (
                    <span className="text-[10px]" style={{ color: "var(--text-4)" }}>{tp(t, "live.plan.projected", { x: fmtInt(p.projected_pct) })}</span>
                  )}
                </div>
              );
              const idleCell = (
                <div className="flex flex-col gap-1 min-w-0">
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="font-mono font-bold text-lg tabular-nums leading-none" style={{ color: idleColor }} title={idle.basis === "estimate" ? t("live.idle.estimate") : t("live.idle.weighted")}>
                      {idle.basis === "none" ? "—" : fmtInt(idle.min)}
                      {idle.basis !== "none" && <span className="text-[11px] font-semibold ml-1" style={{ color: "var(--text-3)" }}>{t("live.min")}{idle.basis === "estimate" ? " ~" : ""}</span>}
                    </span>
                    {idle.worst_cell && (
                      <span className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>
                        {t("live.idle.worst").split("{cell}")[0]}
                        <CellLink id={idle.worst_cell_id} className="font-mono font-semibold" style={{ color: "var(--text-2)" }}>{idle.worst_cell}</CellLink>
                        {` · ${fmtInt(idle.worst_cell_min)} ${t("live.min")}`}
                      </span>
                    )}
                  </div>
                  {idle.basis !== "none" && (
                    <Bar pct={((idle.min || 0) / idleMax) * 100} marker={((th.unit_idle_flag || 50) / idleMax) * 100} color={idleColor} flag />
                  )}
                </div>
              );
              const cellsCell = (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono font-semibold tabular-nums" style={{ color: "var(--text-2)" }}>{u.cells}</span>
                  {u.cells_stopped > 0 && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-full live-pulse"
                      style={{ background: hexA(STATUS_COLOR.crit, 0.16), color: STATUS_COLOR.crit, border: `1px solid ${hexA(STATUS_COLOR.crit, 0.4)}` }}>
                      <Siren size={11} /> {u.cells_stopped}
                    </span>
                  )}
                  {u.cells_with_idle > 0 && u.cells_stopped === 0 && (
                    <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{u.cells_with_idle} ⏱</span>
                  )}
                </div>
              );
              const peopleCell = (
                <span className="font-mono font-semibold tabular-nums" style={{ color: u.people > 0 ? "var(--text-2)" : "var(--text-4)" }}>
                  {u.people > 0 ? fmtInt(u.people) : "—"}
                </span>
              );
              const freshCell = (
                <div className="flex items-center gap-1.5 flex-wrap text-[12px]">
                  {p.updated_at ? (
                    <span className="font-mono" style={{ color: p.stale ? STATUS_COLOR.warn : "var(--text-2)" }}>{clockOf(p.updated_at)}</span>
                  ) : (
                    <span style={{ color: "var(--text-4)" }}>—</span>
                  )}
                  {p.stale && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase" style={{ color: STATUS_COLOR.warn }}>
                      <AlertTriangle size={11} /> {t("live.stale")}
                    </span>
                  )}
                  {u.day_closed && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase" style={{ color: STATUS_COLOR.ok }} title={t("live.dayClosed")}>
                      <CheckCircle2 size={11} /> {t("live.dayClosed")}
                    </span>
                  )}
                </div>
              );
              const nameCell = (
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-1.5 self-stretch rounded-full flex-shrink-0" style={{ background: c }} />
                  <div className="min-w-0">
                    <Link to={`/brigadir/${u.id}`} className="font-semibold text-sm truncate block hover:underline underline-offset-2" style={{ color: "var(--text-1)" }} title={tl(u.name)}>
                      {tl(u.name)}
                    </Link>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <StatusChip status={u.status} t={t} />
                      {!u.attendance && frame?.state !== "replay" && (
                        <span className="text-[10px]" style={{ color: "var(--text-4)" }}>{t("live.a.no_attendance").split(": ")[1]}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
              if (mobile) {
                return (
                  <div key={u.id} data-flip-key={String(u.id)} className={`px-4 py-3 flex flex-col gap-2 ${flash}`} style={{ borderBottom: "1px solid var(--border)" }}>
                    {nameCell}
                    <div className="grid grid-cols-2 gap-3">
                      {planCell}
                      {idleCell}
                    </div>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      {paceCell}
                      {cellsCell}
                      {peopleCell}
                      {freshCell}
                    </div>
                  </div>
                );
              }
              return (
                <div key={u.id} data-flip-key={String(u.id)}
                  className={`grid gap-3 items-center px-4 py-2.5 ${flash}`}
                  style={{ gridTemplateColumns: COLS, borderBottom: "1px solid var(--border)", background: u.status === "crit" ? hexA(STATUS_COLOR.crit, 0.05) : undefined }}>
                  {nameCell}
                  {planCell}
                  {paceCell}
                  {idleCell}
                  {cellsCell}
                  {peopleCell}
                  {freshCell}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
