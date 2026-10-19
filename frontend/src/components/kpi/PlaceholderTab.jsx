// «Liderlar KPI» — the tab of a KPI the platform has no source for yet (the
// operator's choice, 2026-10-19: an empty state with HR's rule printed, nothing
// to enter). On the board its column reads «—» and counts 0.
import { ClipboardCheck, FlaskConical } from "lucide-react";
import { fill } from "../../pages/leadersKpiText";
import { bandLines, scoreTone, toneInk, w100 } from "./kpiUtil";

export default function PlaceholderTab({ T, kind, rule }) {
  const Icon = kind === "audit" ? FlaskConical : ClipboardCheck;
  const maxScore = rule?.max_score ?? 5;
  return (
    <div className="rounded-2xl px-5 py-8 flex flex-col items-center text-center gap-3 max-w-2xl mx-auto"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <span className="grid place-items-center w-12 h-12 rounded-2xl" style={{ background: "var(--bg-inner)" }}>
        <Icon size={22} style={{ color: "var(--text-3)" }} aria-hidden />
      </span>
      <h2 className="text-base font-semibold" style={{ color: "var(--text-1)" }}>{fill(T.phTitle, { kpi: T.kpi[kind] })}</h2>
      <p className="text-sm leading-relaxed max-w-prose" style={{ color: "var(--text-2)" }}>
        {kind === "audit" ? T.phAudit : T.phCompliance}
      </p>
      <div className="rounded-xl px-4 py-3 w-full max-w-md text-left space-y-2"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
        <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
          {fill(T.phWeight, { w: w100(rule), max: maxScore })}
        </div>
        <div className="text-xs" style={{ color: "var(--text-3)" }}>{T.phBands}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm tabular-nums">
          {bandLines(kind, rule).map(([label, score], i) => (
            <div key={i} className="flex items-center justify-between gap-2">
              <span style={{ color: "var(--text-2)" }}>{label}</span>
              <span className="font-semibold" style={{ color: toneInk(scoreTone(score)) }}>{score}</span>
            </div>
          ))}
        </div>
      </div>
      <p className="text-xs leading-relaxed max-w-prose" style={{ color: "var(--text-3)" }}>{T.phNote}</p>
    </div>
  );
}
