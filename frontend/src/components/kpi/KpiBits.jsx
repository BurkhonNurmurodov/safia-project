// «Liderlar KPI» — the small components the board and its tabs share. The
// score chip is turnover's (one chip for every leaders' KPI surface).
import { ChevronRight, CircleCheck, CircleDot } from "lucide-react";
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

export function StateChip({ state, T }) {
  const map = {
    open: { Icon: CircleDot, label: T.stOpen, color: "var(--status-warn)", bg: "rgba(234,179,8,0.12)" },
    ended: { Icon: CircleCheck, label: T.stEnded, color: "var(--status-ok)", bg: "rgba(34,197,94,0.12)" },
  };
  const s = map[state];
  if (!s) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap"
      style={{ color: s.color, background: s.bg }}>
      <s.Icon size={13} aria-hidden /> {s.label}
    </span>
  );
}

export function GreyChip({ children, title }) {
  return (
    <span className="ml-1.5 px-1.5 py-px rounded text-[11px] font-medium whitespace-nowrap" title={title}
      style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
      {children}
    </span>
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

// One figure of a tab's strip: label over value, a sub-line under it.
export function Figure({ label, value, sub, tone }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide leading-tight" style={{ color: "var(--text-3)" }}>{label}</div>
      <div className="text-xl font-bold tabular-nums leading-tight mt-0.5" style={{ color: tone || "var(--text-1)" }}>{value}</div>
      {sub && <div className="text-xs leading-snug" style={{ color: "var(--text-3)" }}>{sub}</div>}
    </div>
  );
}

// The strip card every tab opens with — the month's state, the figures, the rule.
export function StripCard({ children, className = "" }) {
  return (
    <div className={`rounded-2xl px-4 py-3 mb-4 ${className}`}
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {children}
    </div>
  );
}

// The one «nothing here» row of a table on this page.
export function EmptyRow({ cols, text }) {
  return <tr><td colSpan={cols} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{text}</td></tr>;
}
