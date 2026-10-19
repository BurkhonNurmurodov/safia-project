// «Liderlar KPI» — the compliance rule in words: HR's ladder and how a
// month is read against it, the score scale and the weight, then the ladder
// itself (every job's steps) and the Verifix job → ladder map — all drawn
// from the rule the month was scored by, never a second copy of it.
import { BookOpen } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { fill } from "../../pages/leadersKpiText";
import { bandLines, n0, scoreTone, toneInk, w100 } from "./kpiUtil";

export default function ComplianceRules({ open, onClose, rule, T, tx }) {
  const bands = bandLines("compliance", rule);
  const ladders = Object.entries(rule?.ladders || {});
  const jobs = Object.entries(rule?.jobs || {});
  const amb = rule?.ambiguous || {};
  return (
    <Modal open={open} onClose={onClose} title={T.cpRuleTitle} maxWidth="max-w-2xl"
      icon={<BookOpen size={18} style={{ color: "var(--brand-text)" }} />}
      bodyClassName="px-5 py-4 space-y-5"
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{T.cpRuleIntro}</p>
      <dl className="space-y-3">
        {T.cpRuleSteps.map(([h, text]) => (
          <div key={h}>
            <dt className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{h}</dt>
            <dd className="text-sm leading-relaxed mt-0.5" style={{ color: "var(--text-2)" }}>{text}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-1.5">
        <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.cpExBands}</div>
        <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
          {bands.map(([label, score], i) => (
            <span key={i} className="whitespace-nowrap">{label ? `${label} → ` : "→ "}<span className="font-semibold" style={{ color: toneInk(scoreTone(score)) }}>{score}</span></span>
          ))}
          <span className="whitespace-nowrap">· KPI = {T.colScore.toLowerCase()} × {w100(rule)}%</span>
        </p>
        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          {rule?.mode === "exact" ? T.cpModeExact : T.cpModeAtLeast} · {rule?.no_category === "skip" ? T.cpNoCatSkip : T.cpNoCatFail}
        </p>
      </div>
      <div className="space-y-2">
        <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.cpRuleLadders}</div>
        <ul className="space-y-2">
          {ladders.map(([name, steps]) => (
            <li key={name} className="text-sm">
              <span className="font-medium" style={{ color: "var(--text-1)" }}>{tx(name)}</span>
              <span className="block text-xs leading-relaxed tabular-nums" style={{ color: "var(--text-2)" }}>
                {(steps || []).map(([c, m]) => fill(T.cpRuleStep, { c: tx(c), m: n0(m) })).join(" → ")}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold" style={{ color: "var(--text-1)" }}>
          {T.cpRuleJobs} <span className="font-normal tabular-nums" style={{ color: "var(--text-3)" }}>· {fill(T.cpRuleJobsN, { n: n0(jobs.length) })}</span>
        </summary>
        <ul className="mt-2 space-y-1 text-xs" style={{ color: "var(--text-2)" }}>
          {jobs.map(([job, lad]) => (
            <li key={job}>
              {tx(job)} → <span style={{ color: "var(--text-3)" }}>{tx(lad)}</span>
              {amb[job] && <span style={{ color: "var(--status-warn)" }}> · {fill(T.cpRuleAmbiguous, { alts: amb[job].map((a) => tx(a)).join(" / ") })}</span>}
            </li>
          ))}
        </ul>
      </details>
    </Modal>
  );
}
