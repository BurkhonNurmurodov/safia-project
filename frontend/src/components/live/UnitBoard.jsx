import { useRef } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock3 } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import { STATUS_COLOR, STATUS_INK, STATUS_RANK, hexA, tp, fmtInt, fmtPct, clockOf, planColor, idleStatus } from "./liveUtils";
import { useFlip } from "./liveHooks";

const COLS = "minmax(170px,230px) minmax(0,1fr) 72px 92px 84px 56px";
const NUM_W = 48;      // the plan figure in front of the lane
const GAP = 10;
const NONE = new Set();

// The lane: how much of the plan this brigade has made, on the shift's axis.
// The NOW tick sits at the same x in every row, so down the whole board the
// ticks join into one line — a departure board where «behind» is a fill that
// stops short of the line.
function Lane({ p, expected, t, continuous }) {
  const pc = planColor(p.status);
  const hasPlan = p.pct != null;
  const tickLeft = `calc(${NUM_W + GAP}px + (100% - ${NUM_W + GAP}px) * ${Math.max(0, Math.min(100, expected)) / 100})`;
  return (
    <div className="relative self-stretch flex items-center min-w-0" style={{ gap: GAP }}>
      <span className="text-right font-semibold tabular-nums text-[15px] flex-shrink-0" style={{ width: NUM_W, color: hasPlan ? "var(--text-1)" : "var(--text-3)" }}>
        {hasPlan ? fmtPct(p.pct) : "—"}
      </span>
      <div className="relative flex-1 h-2 rounded-full min-w-0" style={{ background: "var(--bg-inner)" }}>
        {hasPlan && p.status !== "noactual" && (
          <div className="absolute inset-y-0 left-0 rounded-full live-bar"
            style={{ width: `${Math.max(0, Math.min(100, p.pct))}%`, background: p.status === "ok" || p.status === "warn" || p.status === "crit" ? pc : hexA(STATUS_COLOR.quiet, 0.7) }} />
        )}
        {(!hasPlan || p.status === "noactual") && (
          <span className="absolute inset-0 flex items-center pl-2 text-[11px] font-medium whitespace-nowrap overflow-hidden"
            style={{ color: p.status === "noactual" ? STATUS_INK.warn : "var(--text-3)" }}>
            {p.status === "noactual" ? t("live.kpi.paceNoActual") : t("live.plan.none")}
          </span>
        )}
      </div>
      <span aria-hidden="true" className={`absolute w-px live-marker ${continuous ? "-top-3 -bottom-[13px]" : "-top-1 -bottom-1"}`}
        style={{ left: tickLeft, background: "var(--text-2)", opacity: 0.55 }} />
    </div>
  );
}

function StopPill({ n }) {
  if (!n) return <span style={{ color: "var(--text-4)" }}>—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold tabular-nums pl-1.5 pr-2 py-0.5 rounded-md"
      style={{ background: STATUS_COLOR.crit, color: "#fff" }}>
      <span className="w-2 h-2 rounded-[2px]" style={{ background: "#fff" }} aria-hidden="true" />{n}
    </span>
  );
}

export default function UnitBoard({ units, thresholds, frame, t, tl, mobile }) {
  const th = thresholds || {};
  const flag = th.unit_idle_flag || 50;
  const warnMin = th.unit_idle_warn || 25;
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
  const expected = frame?.state === "running" ? (frame.progress || 0) * 100 : 100;
  const noPlan = (units || []).filter((u) => !(u.plan?.plan_min > 0)).length;

  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead
        title={t("live.units")}
        subtitle={t("live.unitsSub")}
        right={
          <div className="flex items-center gap-2 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
            {noPlan > 0 && <span>{tp(t, "live.noPlanUnits", { n: noPlan })}</span>}
          </div>
        }
      />
      {!units?.length ? (
        <EmptyState title={t("live.noUnits")} message="" showUploadLink={false} height="h-32" />
      ) : (
        <div>
          {!mobile && (
            <div className="grid gap-4 items-end px-4 pt-2.5 pb-2 text-[11px] font-medium" role="presentation"
              style={{ gridTemplateColumns: COLS, color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
              <div />
              <div className="relative">
                <span>{t("live.col.plan")}</span>
                <span className="absolute bottom-0 tabular-nums font-semibold live-marker whitespace-nowrap"
                  style={{ left: `calc(${NUM_W + GAP}px + (100% - ${NUM_W + GAP}px) * ${expected / 100})`, transform: expected > 80 ? "translateX(-100%)" : "translateX(-50%)", color: "var(--text-2)" }}>
                  {tp(t, "live.board.nowAt", { e: fmtInt(expected) })}
                </span>
              </div>
              <div className="text-right">{t("live.col.pace")}</div>
              <div className="text-right">{t("live.col.idle")}</div>
              <div className="text-center">{t("live.kpi.stopped")}</div>
              <div className="text-right">{t("live.col.people")}</div>
            </div>
          )}
          <div ref={listRef}>
            {units.map((u) => {
              const p = u.plan || {};
              const idle = u.idle || {};
              const ist = idle.basis === "none" ? "quiet" : idleStatus(idle.min, flag, warnMin);
              const paceInk = p.pace == null ? "var(--text-3)" : p.status === "warn" || p.status === "crit" ? STATUS_INK[p.status] : "var(--text-2)";
              const idleInk = ist === "warn" || ist === "crit" ? STATUS_INK[ist] : "var(--text-2)";
              const fl = escalated.has(u.id) ? "live-flash" : "";
              const idleTitle = [
                idle.basis === "estimate" ? t("live.idle.estimate") : t("live.idle.weighted"),
                idle.worst_cell ? tp(t, "live.idle.worst", { cell: idle.worst_cell, m: fmtInt(idle.worst_cell_min) }) : null,
              ].filter(Boolean).join(" · ");
              const name = (
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: STATUS_COLOR[u.status] || STATUS_COLOR.quiet }}
                    title={t(`live.st.${u.status}`)} aria-label={t(`live.st.${u.status}`)} />
                  <Link to={`/brigadir/${u.id}`} className="font-medium text-sm truncate hover:underline underline-offset-2"
                    style={{ color: "var(--text-1)" }} title={tl(u.name)}>
                    {tl(u.name)}
                  </Link>
                  {p.stale && (
                    <Clock3 size={13} className="flex-shrink-0" style={{ color: STATUS_INK.warn }}
                      aria-label={tp(t, "live.a.plan_stale", { unit: "", m: fmtInt(p.stale_min) })}>
                      <title>{tp(t, "live.a.plan_stale", { unit: tl(u.name), m: fmtInt(p.stale_min) })} · {clockOf(p.updated_at)}</title>
                    </Clock3>
                  )}
                  {u.day_closed && (
                    <CheckCircle2 size={13} className="flex-shrink-0" style={{ color: "var(--text-3)" }} aria-label={t("live.dayClosed")}>
                      <title>{t("live.dayClosed")}</title>
                    </CheckCircle2>
                  )}
                </div>
              );
              const pace = <span className="tabular-nums font-medium" style={{ color: paceInk }}>{p.pace == null ? "—" : fmtPct(p.pace)}</span>;
              const wait = (
                <span className="tabular-nums font-medium" style={{ color: idle.basis === "none" ? "var(--text-4)" : idleInk }} title={idleTitle}>
                  {idle.basis === "none" ? "—" : `${fmtInt(idle.min)}${idle.basis === "estimate" ? "~" : ""}`}
                  {idle.basis !== "none" && <span className="ml-1 text-[11px] font-normal" style={{ color: "var(--text-3)" }}>{t("live.min")}</span>}
                </span>
              );
              const people = <span className="tabular-nums" style={{ color: u.people > 0 ? "var(--text-2)" : "var(--text-4)" }}>{u.people > 0 ? fmtInt(u.people) : "—"}</span>;
              if (mobile) {
                return (
                  <div key={u.id} data-flip-key={String(u.id)} className={`px-4 py-3 ${fl}`} style={{ borderBottom: "1px solid var(--border)" }}>
                    <div className="flex items-center justify-between gap-3">{name}<StopPill n={u.cells_stopped} /></div>
                    <div className="mt-2.5"><Lane p={p} expected={expected} t={t} /></div>
                    <div className="mt-2 flex items-center gap-x-4 gap-y-1 flex-wrap text-xs" style={{ color: "var(--text-3)" }}>
                      <span>{t("live.col.pace")} {pace}</span>
                      <span>{t("live.col.idle")} {wait}</span>
                      <span>{t("live.col.people")} {people}</span>
                    </div>
                  </div>
                );
              }
              return (
                <div key={u.id} data-flip-key={String(u.id)} className={`grid gap-4 items-center px-4 py-3 text-sm ${fl}`}
                  style={{ gridTemplateColumns: COLS, borderBottom: "1px solid var(--border)" }}>
                  {name}
                  <Lane p={p} expected={expected} t={t} continuous />
                  <div className="text-right">{pace}</div>
                  <div className="text-right">{wait}</div>
                  <div className="text-center"><StopPill n={u.cells_stopped} /></div>
                  <div className="text-right">{people}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
