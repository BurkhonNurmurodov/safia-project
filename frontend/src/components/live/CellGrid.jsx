import { Sparkles } from "lucide-react";
import { SectionHead } from "../ui/DataTable";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import { catColor } from "../idle/categories";
import { shortPerson } from "../../utils/personName";
import { STATUS_COLOR, STATUS_INK, hexA, tp, fmtInt, fmtPct, fmtTimer, stopStartedAt } from "./liveUtils";

// The floor plan: one tile per cell, grouped under its brigadir in the board's
// order. A calm cell is a plain tile; only a cell with a problem takes colour,
// and a cell stopped RIGHT NOW is solid red with its own ticking timer, so
// from across the room the map reads as «grey, grey, grey, RED». Tiles are
// INERT on purpose: a dense grid on a touch TV must not navigate away.
function Tile({ c, frame, now, t, tl }) {
  const st = c.status;
  const idle = c.idle || {};
  const stopped = idle.stopped_now;
  const cleaning = !stopped && idle.cleaning_now;
  const problem = st === "crit" || st === "warn";
  const col = STATUS_COLOR[st] || STATUS_COLOR.quiet;
  const at = stopped ? stopStartedAt(frame, idle.since) : null;
  const style = stopped
    ? { background: STATUS_COLOR.crit, color: "#fff", border: `1px solid ${STATUS_COLOR.crit}` }
    : problem
      ? { background: hexA(col, 0.08), border: `1px solid ${hexA(col, 0.45)}` }
      : { background: "var(--bg-inner)", border: "1px solid var(--border)" };
  const ink = stopped ? "#fff" : problem ? STATUS_INK[st] : "var(--text-3)";
  const title = [
    c.code, c.leader ? tl(c.leader) : "", tl(c.unit || ""),
    idle.events ? tp(t, "live.events", { n: idle.events }) : "",
    idle.last_end && !stopped ? tp(t, "live.lastStop", { t: idle.last_end }) : "",
    c.plan ? `${t("live.cellPlan")} ${fmtPct(c.plan.pct)} / ${tp(t, "live.plan.expected", { e: fmtInt(c.plan.expected_pct) })}` : "",
  ].filter(Boolean).join("\n");
  return (
    <div className={`relative rounded-xl px-2.5 py-2 flex flex-col justify-between ${stopped ? "live-stopped" : ""}`}
      style={{ ...style, height: 64 }} title={title}>
      <div className="flex items-center justify-between gap-1">
        <span className="font-semibold text-[15px] leading-none tabular-nums" style={{ color: stopped ? "#fff" : "var(--text-1)" }}>{c.code}</span>
        {stopped ? (
          <span className="text-[11px] font-semibold tabular-nums leading-none">{fmtTimer(at != null ? now - at : (idle.now_min || 0) * 60000)}</span>
        ) : cleaning ? (
          <Sparkles size={12} style={{ color: catColor("Cat H") }} aria-label={t("live.cleaningNow")} />
        ) : idle.idle_min > 0 ? (
          <span className="text-[11px] font-medium tabular-nums leading-none" style={{ color: ink }}>{fmtInt(idle.idle_min)} {t("live.min")}</span>
        ) : c.plan?.pct != null && (c.plan.status === "warn" || c.plan.status === "crit") ? (
          // No waiting, yet the cell is flagged: its PLAN is the reason — say it.
          <span className="text-[11px] font-medium tabular-nums leading-none" style={{ color: STATUS_INK[c.plan.status] }}
            title={`${t("live.cellPlan")} ${fmtPct(c.plan.pct)} / ${tp(t, "live.plan.expected", { e: fmtInt(c.plan.expected_pct) })}`}>
            {fmtPct(c.plan.pct)}
          </span>
        ) : null}
      </div>
      <div className="text-[11px] truncate leading-tight" style={{ color: stopped ? "rgba(255,255,255,.85)" : cleaning ? catColor("Cat H") : "var(--text-3)" }}>
        {cleaning
          ? (idle.cleaners != null ? tp(t, "live.cleaningNowN", { n: fmtInt(idle.cleaners) }) : t("live.cleaningNow"))
          : c.leader ? shortPerson(tl(c.leader)) : "—"}
      </div>
    </div>
  );
}

export default function CellGrid({ cells, units, frame, now, mobile, onlyProblems, onToggleOnly, t, tl }) {
  const list = (cells || []).filter((c) => !onlyProblems || c.status === "crit" || c.status === "warn");
  const byUnit = new Map();
  for (const c of list) {
    if (!byUnit.has(c.unit_id)) byUnit.set(c.unit_id, []);
    byUnit.get(c.unit_id).push(c);
  }
  const groups = (units || []).filter((u) => byUnit.has(u.id));

  return (
    <section className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead
        title={t("live.cells")}
        subtitle={t("live.cellsSub")}
        right={
          <SegmentedToggle size="sm" value={onlyProblems ? "problems" : "all"}
            onChange={(v) => onToggleOnly(v === "problems")}
            options={[["all", t("live.all")], ["problems", t("live.onlyProblems")]]} />
        }
      />
      {!(cells || []).length ? (
        <EmptyState title={t("live.noCells")} message="" showUploadLink={false} height="h-32" />
      ) : !list.length ? (
        <EmptyState title={t("live.noProblemCells")} message="" showUploadLink={false} height="h-32" />
      ) : (
        <div className="p-4 flex flex-col gap-4">
          {groups.map((u) => {
            const rows = byUnit.get(u.id) || [];
            return (
              <div key={u.id}>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="w-2 h-2 rounded-full" style={{ background: STATUS_COLOR[u.status] || STATUS_COLOR.quiet }} aria-hidden="true" />
                  <span className="text-[13px] font-medium" style={{ color: "var(--text-1)" }}>{tl(u.name)}</span>
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                    {tp(t, "live.cellsN", { n: rows.length })}
                    {u.cells_stopped > 0 && <span style={{ color: STATUS_INK.crit }}> · {tp(t, "live.stoppedN", { n: u.cells_stopped })}</span>}
                  </span>
                </div>
                <div className="grid gap-2" style={{ gridTemplateColumns: mobile ? "repeat(3, minmax(0, 1fr))" : "repeat(auto-fill, minmax(112px, 1fr))" }}>
                  {rows.map((c) => <Tile key={c.id} c={c} frame={frame} now={now} t={t} tl={tl} />)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
