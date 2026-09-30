import { Clock } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { activeBands, TONE_HEX } from "../../utils/statusBands";
import { fill } from "./planUtil";

// What the squares on this page mean — the completion bands in force (they
// are admin-editable, so the edges are read, never printed as constants) and
// the kinds of day that carry no percentage. Every square is judged by the
// WHOLE percent it prints, like every band on the platform.
export default function PlanLegend({ compact = false }) {
  const { t } = useLang();
  const { ok, warn } = activeBands().compl;
  const chip = (bg, label, style) => (
    <span className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap" style={{ color: "var(--text-3)" }}>
      <span className="w-3 h-3 rounded-[3px] flex-shrink-0" style={{ background: bg, ...style }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {chip(TONE_HEX.ok, fill(t("plan.legend.ok"), { ok }))}
      {chip(TONE_HEX.warn, fill(t("plan.legend.warn"), { warn, ok1: ok - 1 }))}
      {chip(TONE_HEX.bad, fill(t("plan.legend.bad"), { warn }))}
      {!compact && (
        <span className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap" style={{ color: "var(--text-3)" }}>
          <span className="w-3 h-3 rounded-[3px] inline-flex items-center justify-center flex-shrink-0"
            style={{ background: "repeating-linear-gradient(135deg, var(--border-md) 0 2px, transparent 2px 4px)", border: "1px solid var(--border-md)" }}>
            <Clock size={8} style={{ color: "var(--text-3)" }} />
          </span>
          {t("plan.legend.nf")}
        </span>
      )}
      {!compact && chip("transparent", t("plan.legend.np"), { border: "1px dashed var(--text-4)" })}
      {chip("var(--bg-inner)", t("plan.legend.none"))}
    </div>
  );
}
