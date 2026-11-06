// «Liderlar KPI» — the rules in one dialog: weight, the most a KPI can add,
// whether the platform computes it, its scale (drawn from the rule the month
// was scored by, never a second copy) and where its figure comes from. With
// `only` it explains ONE KPI — the concerns tab's «Qanday hisoblanadi?».
import { BookOpen } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { fill } from "../../pages/leadersKpiText";
import { KPI_KEYS, LIVE, bandLines, maxPts, scoreTone, toneInk, w100 } from "./kpiUtil";

export default function KpiRulesModal({ open, onClose, data, T, zIndex, only }) {
  const rules = data?.rules || {};
  const keys = only ? [only] : KPI_KEYS;
  const notes = only === "concerns" ? [T.cRule, T.rNoConcern] : only ? [] : [T.rMissing, T.rNoConcern, T.rAuditNote];
  return (
    <Modal open={open} onClose={onClose} title={only ? fill(T.ruleOneTitle, { kpi: T.kpi[only] }) : T.rulesTitle}
      maxWidth="max-w-2xl" zIndex={zIndex}
      icon={<BookOpen size={18} style={{ color: "var(--brand-text)" }} />}
      bodyClassName="px-5 py-4 space-y-4"
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      {!only && (
        <>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{T.rulesIntro}</p>
          <div className="rounded-xl px-3 py-2.5 text-sm font-semibold"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
            {T.formula}
          </div>
        </>
      )}
      <ol className="space-y-3">
        {keys.map((key) => {
          const rule = rules[key];
          const live = LIVE.has(key);
          return (
            <li key={key} className="rounded-xl p-3 space-y-1.5" style={{ border: "1px solid var(--border)", opacity: live ? 1 : 0.85 }}>
              <div className="flex items-baseline justify-between gap-3 flex-wrap">
                <span className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{KPI_KEYS.indexOf(key) + 1}. {T.kpi[key]}</span>
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
      {notes.length > 0 && (
        <ul className="text-xs space-y-1 list-disc pl-5" style={{ color: "var(--text-3)" }}>
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}
    </Modal>
  );
}
