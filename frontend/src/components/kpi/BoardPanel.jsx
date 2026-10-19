// «Liderlar KPI» — one board row opened in place: the cell's radar against the
// team, and beside it the same KPIs in words — its strengths (scored in the
// green band) and its growth areas (amber, red, or no score this month, which
// counts 0 in the total). Every live KPI sits in exactly one of the two lists,
// so they are the radar's table view too. Hovering an item lights its spoke
// and the other way round; a click opens that KPI's own working, and «Ballar
// hisobi» the score × weight arithmetic.
import { useState } from "react";
import { ArrowDownRight, ArrowUpRight, Calculator, ChevronRight, Minus } from "lucide-react";
import Button from "../ui/Button";
import { TONE_HEX } from "../../utils/statusBands";
import { fill } from "../../pages/leadersKpiText";
import KpiRadar from "./KpiRadar";
import { Delta, ScorePips } from "./KpiBits";
import { boardAxes, figureOf, fracTone } from "./kpiUtil";

function Item({ it, row, T, on, setHover, onExplain }) {
  const tone = fracTone(it.value, it.max);
  const hex = tone ? TONE_HEX[tone] : null;
  const Icon = it.value == null ? Minus : tone === "ok" ? ArrowUpRight : ArrowDownRight;
  const bits = [figureOf(row, it.key, T)];
  if (it.value == null) bits.push(T.bdNoScoreLine);
  if (it.team != null) bits.push(fill(T.bdTeam, { v: it.team.toFixed(1) }));
  if (it.prev != null) bits.push(fill(T.bdPrev, { v: it.prev }));
  return (
    <button type="button" onClick={() => onExplain(it.key, row)}
      onMouseEnter={() => setHover(it.key)} onMouseLeave={() => setHover(null)}
      onFocus={() => setHover(it.key)} onBlur={() => setHover(null)}
      className="w-full flex items-center gap-3 px-2.5 py-2 rounded-xl text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--brand-ring)]"
      style={{ background: on ? "var(--bg-card)" : "transparent", boxShadow: on ? "inset 0 0 0 1px var(--border-md)" : "none" }}>
      <span className="grid place-items-center w-8 h-8 rounded-lg flex-shrink-0"
        style={{ background: hex ? `${hex}1f` : "var(--border)", color: hex || "var(--text-3)" }} aria-hidden>
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium" style={{ color: "var(--text-1)" }}>
          <span className="min-w-0 break-words">{it.full}</span>
          {it.delta != null && <Delta d={it.delta} />}
        </span>
        <span className="block text-xs mt-0.5 leading-snug" style={{ color: "var(--text-3)" }}>{bits.join(" · ")}</span>
      </span>
      <ScorePips score={it.value} max={it.max} />
      <ChevronRight size={14} className="flex-shrink-0" style={{ color: "var(--text-4)" }} aria-hidden />
    </button>
  );
}

function Section({ title, tone, items, empty, hover, ...rest }) {
  return (
    <section>
      <h4 className="flex items-center gap-2 px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: "var(--text-3)" }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: TONE_HEX[tone] }} aria-hidden />
        {title}
      </h4>
      {items.length
        ? <div className="space-y-0.5">{items.map((it) => <Item key={it.key} it={it} on={hover === it.key} {...rest} />)}</div>
        : <p className="px-2.5 py-2 text-sm" style={{ color: "var(--text-3)" }}>{empty}</p>}
    </section>
  );
}

export default function BoardPanel({ row, data, prevRow, keys, T, tl, onExplain, onPoints }) {
  const [hover, setHover] = useState(null);
  const axes = boardAxes(row, data, prevRow, keys, T);
  const live = axes.filter((a) => a.live);
  const rel = (a) => (a.team == null ? 0 : a.value / a.max - a.team / a.max);
  const strengths = live.filter((a) => fracTone(a.value, a.max) === "ok")
    .sort((a, b) => b.value / b.max - a.value / a.max || rel(b) - rel(a));
  const growth = [
    ...live.filter((a) => a.value != null && fracTone(a.value, a.max) !== "ok")
      .sort((a, b) => a.value / a.max - b.value / b.max || rel(a) - rel(b)),
    ...live.filter((a) => a.value == null),
  ];
  const name = `${row.code} · ${row.owner ? tl(row.owner) : "—"}`;
  const shared = { row, T, setHover, onExplain };
  return (
    <div className="grid gap-x-10 gap-y-5 items-center px-3 py-6 sm:px-6 lg:grid-cols-2">
      <KpiRadar axes={axes} name={name} T={T} active={hover} onHover={setHover} onAxis={(k) => onExplain(k, row)} />
      <div className="min-w-0 space-y-4">
        <Section title={T.bdStrengths} tone="ok" items={strengths} empty={T.bdNoStrengths}
          {...shared} hover={hover} />
        <Section title={T.bdGrowth} tone="bad" items={growth} empty={T.bdNoGrowth}
          {...shared} hover={hover} />
        <div className="px-1">
          <Button size="md" variant="ghost" icon={<Calculator size={14} />} onClick={() => onPoints(row)}>{T.bdPoints}</Button>
        </div>
      </div>
    </div>
  );
}
