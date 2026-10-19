// «Liderlar KPI» — the small components the board and its tabs share. The
// score chip is turnover's (one chip for every leaders' KPI surface).
//
// Every tab reads the same way, top to bottom (2026-10-19, the operator: «remove
// the noise»): ONE summary — the headline figure with what it measures and its
// base on one line, a muted line saying as of when and from where, the rules
// behind «Qanday hisoblanadi?» — then ONE card whose header is the view switch,
// and under the table, folded, whatever the month could not count. The scale,
// the weight and the mode are the rules dialog's, never printed on the tab.
import { ChevronDown, ChevronRight, HelpCircle, Info } from "lucide-react";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import { MAX_POINTS } from "./kpiUtil";

export { ScoreChip } from "../turnover/TurnoverBits";

// A total out of 5 — the figure, then a slim brand bar underneath it. Brand
// gold is the single-metric accent here, never a verdict: no band exists for
// a total yet, so the bar states a share and nothing more.
export function TotalCell({ total, max = MAX_POINTS, align = "right" }) {
  const v = total == null ? 0 : Math.min(1, Math.max(0, total / max));
  return (
    <span className={`inline-flex flex-col gap-1 min-w-[64px] ${align === "right" ? "items-end" : "items-start"}`}>
      <span className="font-semibold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>
        {total == null ? "—" : Number(total).toFixed(2)}
      </span>
      <span className="block h-1 w-16 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }} aria-hidden>
        <span className="block h-full rounded-full" style={{ width: `${v * 100}%`, background: "var(--brand)" }} />
      </span>
    </span>
  );
}

// The tab's one summary — no box around it. `value` is the headline figure,
// `label` what it measures and its base; `meta` the muted facts under it (an
// array; falsy entries are dropped, the rest joined by «·»); `actions` sit at
// the right edge and wrap under the figure on a phone.
export function Summary({ value, label, meta = [], actions }) {
  const items = meta.filter(Boolean);
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 mb-4">
      <div className="min-w-0">
        <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-[28px] font-bold tabular-nums leading-none" style={{ color: value === "—" ? "var(--text-4)" : "var(--text-1)" }}>{value}</span>
          {label && <span className="text-sm" style={{ color: "var(--text-2)" }}>{label}</span>}
        </p>
        {items.length > 0 && (
          <p className="text-xs mt-2 leading-relaxed" style={{ color: "var(--text-3)" }}>
            {items.map((m, i) => (
              <span key={i}>{i > 0 && <span aria-hidden> · </span>}{m}</span>
            ))}
          </p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

// A meta fact that needs looking at — a read that failed, data gone stale.
export const Warn = ({ children }) => <span style={{ color: "var(--status-warn)" }}>{children}</span>;

// «Qanday hisoblanadi?» — the one way to the rules, the same on every tab.
export function RulesButton({ label, onClick }) {
  return <Button size="md" variant="ghost" icon={<HelpCircle size={14} />} onClick={onClick}>{label}</Button>;
}

// A card header that IS the view switch — the ranking or the list behind it —
// with the rows' count on the right. It replaces the card's title: a title
// repeating the switch's own selected word was the same word twice.
export function ViewHead({ value, onChange, options, ariaLabel, right }) {
  return (
    <div className="flex items-center justify-between gap-x-3 gap-y-2 flex-wrap px-4 py-2"
      style={{ borderBottom: "1px solid var(--border)" }}>
      <SegmentedToggle asTabs size="sm" value={value} onChange={onChange} ariaLabel={ariaLabel} options={options} />
      {right}
    </div>
  );
}

export const Count = ({ children }) => (
  <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{children}</span>
);

// What the month could not count (a cell with no owner, a code not on /cells,
// a job off the scale …), folded under the table: said, never dropped, and
// never louder than the ranking it qualifies.
export function Notes({ notes, label }) {
  if (!notes?.length) return null;
  return (
    <details className="group w-full text-xs">
      <summary className="list-none [&::-webkit-details-marker]:hidden cursor-pointer select-none inline-flex items-center gap-1.5 py-1 outline-none rounded text-[var(--text-3)] hover:text-[var(--text-2)] focus-visible:text-[var(--text-1)] focus-visible:underline">
        <Info size={13} aria-hidden />
        {label}
        <ChevronDown size={13} aria-hidden className="transition-transform group-open:rotate-180" />
      </summary>
      <ul className="mt-1.5 mb-0.5 space-y-1.5 list-disc pl-5 leading-snug" style={{ color: "var(--text-2)" }}>
        {notes.map((n, i) => <li key={i}>{n}</li>)}
      </ul>
    </details>
  );
}

// A phone row: title · sub · foot on the left, a figure and a chevron on the right.
export function MobileRow({ onClick, title, sub, right, foot }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-[var(--bg-inner)] focus-visible:bg-[var(--bg-inner)] outline-none"
      style={{ borderTop: "1px solid var(--border)" }}>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{title}</div>
        {sub && <div className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>{sub}</div>}
        {foot && <div className="text-xs mt-1 tabular-nums" style={{ color: "var(--text-2)" }}>{foot}</div>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{right}<ChevronRight size={14} style={{ color: "var(--text-4)" }} /></div>
    </button>
  );
}

// A person's verdict on the compliance tab: green where they comply, red
// where they count and do not, grey where they are out of the count — the
// colour says the same as the word, so neither stands alone.
export function VerdictChip({ counted, compliant, children }) {
  const tone = !counted ? null : compliant ? "ok" : "bad";
  const ink = tone === "ok" ? "var(--status-ok)" : tone === "bad" ? "var(--status-bad)" : "var(--text-3)";
  const bg = tone === "ok" ? "rgba(34,197,94,0.12)" : tone === "bad" ? "rgba(239,68,68,0.12)" : "var(--bg-inner)";
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap" style={{ color: ink, background: bg }}>
      {children}
    </span>
  );
}

// The one «nothing here» row of a table on this page.
export function EmptyRow({ cols, text }) {
  return <tr><td colSpan={cols} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{text}</td></tr>;
}
