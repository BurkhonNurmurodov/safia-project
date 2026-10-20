import { activeBands, TONE_HEX } from "../../utils/statusBands";
import { useOT, fill } from "./ontimeUtil";

// What the colours on this page mean — the on-time band in force (admin-
// editable, so its edges are read, never printed as constants). Every square
// is judged by the WHOLE percent it prints, like every band on the platform.
export default function OntimeLegend() {
  const T = useOT();
  const { ok, warn } = activeBands().ontime;
  const chip = (bg, label, edge = false) => (
    <span className="inline-flex items-center gap-1.5 text-[11px] whitespace-nowrap" style={{ color: "var(--text-3)" }}>
      <span className="w-3 h-3 rounded-[3px] flex-shrink-0"
        style={{ background: bg, border: edge ? "1px solid var(--border)" : undefined }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {chip(TONE_HEX.ok, fill(T.legendOk, { ok }))}
      {chip(TONE_HEX.warn, fill(T.legendWarn, { warn, ok1: ok - 1 }))}
      {chip(TONE_HEX.bad, fill(T.legendBad, { warn }))}
      {chip("var(--bg-inner)", T.legendNone, true)}
    </div>
  );
}
