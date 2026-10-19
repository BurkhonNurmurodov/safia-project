// «Liderlar KPI» — the tab of a KPI the platform has no source for yet (the
// operator's choice, 2026-10-19: an empty state with HR's rule printed, nothing
// to enter). On the board its column reads «—» and counts 0. One quiet block,
// the rule on one line under it — no card inside a card.
import { ClipboardCheck, FlaskConical } from "lucide-react";
import { fill } from "../../pages/leadersKpiText";
import { bandLines, w100 } from "./kpiUtil";

export default function PlaceholderTab({ T, kind, rule }) {
  const Icon = kind === "audit" ? FlaskConical : ClipboardCheck;
  const scale = bandLines(kind, rule).map(([label, score]) => `${label} → ${score}`).join(" · ");
  return (
    <div className="flex flex-col items-center text-center gap-2.5 px-4 py-14 max-w-xl mx-auto">
      <Icon size={28} style={{ color: "var(--text-4)" }} aria-hidden />
      <h2 className="text-base font-semibold mt-1" style={{ color: "var(--text-1)" }}>{fill(T.phTitle, { kpi: T.kpi[kind] })}</h2>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
        {kind === "audit" ? T.phAudit : T.phCompliance} {T.phNote}
      </p>
      <p className="text-xs tabular-nums leading-relaxed" style={{ color: "var(--text-3)" }}>
        {fill(T.phWeight, { w: w100(rule), max: rule?.max_score ?? 5 })} · {scale}
      </p>
    </div>
  );
}
