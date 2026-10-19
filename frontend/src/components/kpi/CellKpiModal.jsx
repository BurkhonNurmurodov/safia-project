// «Liderlar KPI» — one row of the board opened: the cell's five KPIs with their
// figure, score and points, the total, and a way into each live KPI's own
// working (the explain dialogs the category tabs open). Nothing is computed
// here that the server did not send.
import { Trophy, ChevronRight } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import { fill } from "../../pages/leadersKpiText";
import { ScoreChip, TotalCell } from "./KpiBits";
import { KPI_KEYS, LIVE, MAX_POINTS, figureOf, pointsOf, pts, scoreOf, w100 } from "./kpiUtil";

export default function CellKpiModal({ T, tl, row, data, count, onClose, onExplain }) {
  const rules = data?.rules || {};
  const title = `${row.code} · ${row.owner ? tl(row.owner) : "—"}`;
  const sub = [row.brigadir ? tl(row.brigadir) : "", fill(T.cmRank, { r: row.rank, n: count })].filter(Boolean).join(" · ");
  return (
    <Modal open onClose={onClose} title={title} subtitle={sub} maxWidth="max-w-xl"
      icon={<Trophy size={18} style={{ color: "var(--brand-text)" }} />}
      bodyClassName="px-5 py-4 space-y-3"
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      <ul className="divide-y rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", borderColor: "var(--border)" }}>
        {KPI_KEYS.map((key, i) => {
          const live = LIVE.has(key);
          const score = scoreOf(row, key);
          const points = pointsOf(row, key);
          const w = w100(rules[key]);
          return (
            <li key={key} className="px-3 py-2.5 flex items-center gap-3" style={{ borderColor: "var(--border)" }}>
              <ScoreChip score={score} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium" style={{ color: live ? "var(--text-1)" : "var(--text-3)" }}>
                  {i + 1}. {T.kpi[key]}
                </div>
                <div className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>
                  {live ? figureOf(row, key, T) : T.cmNotLive}
                </div>
              </div>
              <div className="text-right whitespace-nowrap">
                <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{points == null ? "0" : pts(points)}</div>
                <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                  {score == null ? (live ? T.cmNoScore : T.notLive) : fill(T.cmPoints, { score, w, p: pts(points) })}
                </div>
              </div>
              {live && (
                <button type="button" onClick={() => onExplain(key, row)} aria-label={`${T.cmSee}: ${T.kpi[key]}`}
                  className="grid place-items-center w-9 h-9 rounded-lg flex-shrink-0 hover:bg-[var(--bg-inner)] focus-visible:bg-[var(--bg-inner)] outline-none"
                  style={{ color: "var(--brand-text)" }}>
                  <ChevronRight size={16} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
        <div>
          <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.cmTotal}</div>
          <div className="text-xs" style={{ color: "var(--text-3)" }}>
            <CellLink id={row.id}>{row.code}</CellLink> · {row.pct}%
          </div>
        </div>
        <div className="flex items-baseline gap-1">
          <TotalCell total={row.total} max={MAX_POINTS} />
          <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>/ {MAX_POINTS}</span>
        </div>
      </div>
      {data?.state === "open" && <p className="text-xs" style={{ color: "var(--status-warn)" }}>{T.provisional}</p>}
    </Modal>
  );
}
