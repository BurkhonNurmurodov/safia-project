// «Liderlar KPI» — the five rules in one dialog: weight, the most a KPI can
// add, whether the platform computes it, its scale (drawn from the rule the
// month was scored by, never a second copy) and where its figure comes from.
import { BookOpen } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { KPI_KEYS, LIVE, bandLines, maxPts, scoreTone, toneInk, w100 } from "./kpiUtil";

export default function KpiRulesModal({ open, onClose, data, T, zIndex }) {
  const rules = data?.rules || {};
  return (
    <Modal open={open} onClose={onClose} title={T.rulesTitle} maxWidth="max-w-2xl" zIndex={zIndex}
      icon={<BookOpen size={18} style={{ color: "var(--brand-text)" }} />}
      bodyClassName="px-5 py-4 space-y-4"
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{T.rulesIntro}</p>
      <div className="rounded-xl px-3 py-2.5 text-sm font-semibold"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
        {T.formula}
      </div>
      <ol className="space-y-3">
        {KPI_KEYS.map((key, i) => {
          const rule = rules[key];
          const live = LIVE.has(key);
          return (
            <li key={key} className="rounded-xl p-3 space-y-1.5" style={{ border: "1px solid var(--border)", opacity: live ? 1 : 0.85 }}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{i + 1}. {T.kpi[key]}</span>
                <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>
                  {T.rWeight} {w100(rule)}% · {T.rMax} {maxPts(rule).toFixed(2)} · {T.rLive}: {live ? T.rYes : T.rNo}
                </span>
              </div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>{T.rSource[key]}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-3)" }}>
                <span className="font-semibold" style={{ color: "var(--text-2)" }}>{T.rBands}:</span>
                {bandLines(key, rule).map(([label, score], j) => (
                  <span key={j} className="tabular-nums whitespace-nowrap">
                    {label ? `${label} → ` : "→ "}<span className="font-semibold" style={{ color: toneInk(scoreTone(score)) }}>{score}</span>
                  </span>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
      <ul className="text-xs space-y-1 list-disc pl-5" style={{ color: "var(--text-3)" }}>
        <li>{T.rMissing}</li>
        <li>{T.rNoConcern}</li>
        <li>{T.rAuditNote}</li>
      </ul>
    </Modal>
  );
}
