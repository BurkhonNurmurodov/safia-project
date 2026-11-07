import { Sparkline } from "../ui/KpiDeltaCard";
import { AlertTriangle, CheckCircle2, Clock, Repeat2, TrendingDown, TrendingUp, Minus } from "lucide-react";
import TableCard, { SectionHead } from "../ui/DataTable";
import EmptyState from "../ui/EmptyState";
import { useTranslit } from "../../utils/transliterate";
import { shortPerson } from "../../utils/personName";
import { catColor } from "./categories";
import { fill } from "../../pages/idleSolutionsText";

/**
 * «Tahlil» tab of «Kutish yechimlari» (GET /api/idle-solutions/analytics,
 * routers/idle_solutions.py): is a waiting reason repeating, and did the
 * written solution change it? Minutes per day, WINDOW days before the solution
 * against the days since. Verdict colours are the status palette; a cause's
 * identity is its category hue.
 */
const INK = {
  works: "var(--status-ok)", weak: "var(--status-warn)", worse: "var(--status-bad)",
  early: "#94a3b8", none: "#94a3b8", new: "var(--status-bad)",
};
const catCode = (n) => String(n || "").replace(/^Cat\s*/i, "");
const ddmmyy = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : "");

function Chip({ ink, children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{ color: ink, background: `color-mix(in srgb, ${ink} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${ink} 35%, transparent)` }}>{children}</span>
  );
}

function Kpi({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className="rounded-2xl p-4 min-w-0" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        <Icon size={13} className="flex-shrink-0" /> <span>{label}</span>
      </div>
      <div className="text-2xl font-bold mt-1 tabular-nums" style={{ color: tone || "var(--text-1)" }}>{value}</div>
      <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-3)" }}>{sub || " "}</div>
    </div>
  );
}

function Bars({ values, hue }) {
  const max = Math.max(1, ...values);
  return (
    <div className="flex items-end gap-0.5 h-8" aria-hidden="true">
      {values.map((v, i) => (
        <div key={i} className="flex-1 min-w-[4px] rounded-sm" title={String(Math.round(v))}
          style={{ height: `${Math.max(v > 0 ? 8 : 2, (v / max) * 100)}%`, background: hue, opacity: v > 0 ? 1 : 0.25 }} />
      ))}
    </div>
  );
}

function explainWeekly(T, data, label) {
  const rows = data.weekly || [];
  const weeks = data.weeks || [];
  if (!rows.length || weeks.length < 2) return null;
  const half = Math.floor(weeks.length / 2);
  const sum = (a) => a.reduce((x, y) => x + y, 0);
  const per = rows.map((r) => ({ c: r.category, a: sum(r.values.slice(0, half)), b: sum(r.values.slice(half)), v: r.values }));
  const A = Math.round(sum(per.map((r) => r.a))), B = Math.round(sum(per.map((r) => r.b)));
  const lines = [];
  const pct = (a, b) => Math.round((100 * Math.abs(b - a)) / a);
  if (A > 0) {
    const ch = (100 * (B - A)) / A;
    const dir = Math.abs(ch) < 5 ? T.aExplainSame : ch > 0 ? T.aExplainWentUp : T.aExplainWentDown;
    lines.push(fill(T.aExplainTotal, { a: A, b: B, dir, p: (ch > 0 ? "+" : ch < 0 ? "−" : "") + pct(A, B) }));
  }
  const grew = per.filter((r) => r.a > 0 && r.b > r.a).sort((x, y) => (y.b - y.a) - (x.b - x.a))[0];
  const fell = per.filter((r) => r.a > 0 && r.b < r.a).sort((x, y) => (x.b - x.a) - (y.b - y.a))[0];
  const fresh = per.filter((r) => r.a === 0 && r.b > 0).sort((x, y) => y.b - x.b)[0];
  const nm = (c) => `${c} — ${label(catCode(c))}`;
  if (grew) lines.push(fill(T.aExplainUp, { c: nm(grew.c), a: Math.round(grew.a), b: Math.round(grew.b), p: pct(grew.a, grew.b) }));
  if (fresh) lines.push(fill(T.aExplainNew, { c: nm(fresh.c), b: Math.round(fresh.b) }));
  if (fell) lines.push(fill(T.aExplainDown, { c: nm(fell.c), a: Math.round(fell.a), b: Math.round(fell.b), p: pct(fell.a, fell.b) }));
  const tot = weeks.map((_, i) => sum(per.map((r) => r.v[i] || 0)));
  const pi = tot.indexOf(Math.max(...tot));
  if (tot[pi] > 0) {
    const top = per.slice().sort((x, y) => (y.v[pi] || 0) - (x.v[pi] || 0))[0];
    const d = weeks[pi].slice(5).split("-").reverse().join(".");
    lines.push(fill(T.aExplainPeak, { w: d, m: Math.round(tot[pi]), c: nm(top.c) }));
  }
  return { lines, how: fill(T.aExplainHow, { a: A, b: B }) };
}

// TEMP-DEMO (remove in the next commit): invented weekly figures so the dynamics block can be previewed.
function tempDemo(d) {
  const mon = new Date(); mon.setDate(mon.getDate() - ((mon.getDay() + 6) % 7) - 49);
  const weeks = Array.from({ length: 8 }, (_, i) => { const x = new Date(mon); x.setDate(x.getDate() + 7 * i); return x.toISOString().slice(0, 10); });
  const mk = (category, values, trend) => ({ category, values, trend, minutes: values.reduce((a, b) => a + b, 0), solutions_n: 1 });
  return { ...d, weeks, weekly: [
    mk("Cat D3", [40, 55, 60, 90, 120, 150, 170, 160], "up"),
    mk("Cat B", [200, 180, 190, 150, 110, 90, 70, 60], "down"),
    mk("Cat F", [80, 75, 85, 80, 78, 82, 79, 81], "flat"),
    mk("Cat K", [0, 0, 0, 0, 30, 45, 60, 55], "up"),
  ] };
}

export default function SolutionAnalytics({ T, data: realData, label }) {
  const data = tempDemo(realData); // TEMP-DEMO
  const { tl } = useTranslit();
  const c = data.counts || {};
  const trendIcon = { down: TrendingDown, up: TrendingUp, flat: Minus };
  const trendInk = { down: "var(--status-ok)", up: "var(--status-bad)", flat: "#94a3b8" };
  const judged = (c.works || 0) + (c.weak || 0) + (c.worse || 0);
  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi icon={Repeat2} label={T.aRepeat} value={data.repeats.length}
          sub={fill(T.aRepeatSub, { n: data.repeat_days })} tone={data.repeats.length ? "var(--status-warn)" : undefined} />
        <Kpi icon={CheckCircle2} label={T.aWorks} value={c.works || 0}
          sub={fill(T.aOf, { n: judged })} tone={c.works ? "var(--status-ok)" : undefined} />
        <Kpi icon={AlertTriangle} label={T.aRethink} value={data.rethink_n}
          sub={T.aRethinkSub} tone={data.rethink_n ? "var(--status-bad)" : undefined} />
        <Kpi icon={Clock} label={T.aEarly} value={c.early || 0} sub={fill(T.aEarlySub, { n: data.min_after_days })} />
      </div>

      <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <SectionHead icon={Repeat2} title={T.aSecWeekly} right={fill(T.aWeeks, { n: data.weeks.length })} />
        {data.weekly.length === 0 ? (
          <div className="px-4 py-6 text-xs" style={{ color: "var(--text-3)" }}>{T.empty}</div>
        ) : data.weekly.map((w) => {
          const hue = catColor(w.category);
          const TI = trendIcon[w.trend];
          return (
            <div key={w.category} className="px-4 py-3 flex items-center gap-3" style={{ borderTop: "1px solid var(--border)" }}>
              <div className="w-44 min-w-0 flex-shrink-0">
                <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
                  {w.category} <span className="font-normal" style={{ color: "var(--text-2)" }}>— {label(catCode(w.category))}</span>
                </div>
                <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.minutes, { m: Math.round(w.minutes) })}</div>
              </div>
              <div className="flex-1 min-w-0"><Sparkline values={w.values} color={trendInk[w.trend]} /></div>
              <div className="flex items-center gap-1 text-xs font-medium flex-shrink-0 w-28 justify-end" style={{ color: trendInk[w.trend] }}>
                <TI size={14} /> {T.aTrend[w.trend]}
              </div>
            </div>
          );
        })}
        {(() => {
          const ex = explainWeekly(T, data, label);
          if (!ex) return null;
          return (
            <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)", background: "var(--bg-inner)" }}>
              <div className="text-xs font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>{T.aExplainTitle}</div>
              <ul className="space-y-1 text-sm" style={{ color: "var(--text-1)" }}>
                {ex.lines.map((l, i) => <li key={i}>{l}</li>)}
              </ul>
              <div className="text-[11px] mt-1.5" style={{ color: "var(--text-3)" }}>{ex.how}</div>
            </div>
          );
        })()}
      </div>

      <TableCard icon={Repeat2} title={T.aSecRepeat} right={fill(T.aRows, { n: data.repeats.length })} maxHeight="50vh">
        <thead>
          <tr>
            {[T.cCause, T.cUnit, T.aDays, T.aStops, T.aCell, T.cTotal, T.aSolved].map((h, i) => (
              <th key={i} className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${i >= 2 ? "text-right" : "text-left"}`}
                style={{ color: "var(--text-3)", background: "var(--bg-inner)" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.repeats.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-6 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.aNoRepeat}</td></tr>
          ) : data.repeats.map((r) => (
            <tr key={`${r.category}-${r.manager_id}`}>
              <td className="px-3 py-2 whitespace-nowrap font-medium" style={{ color: catColor(r.category) }}>{r.category}</td>
              <td className="px-3 py-2 whitespace-nowrap">{shortPerson(tl(r.manager_name) || r.manager_name)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.days}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.stops}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.cell ? `${r.cell} · ${r.cell_days}` : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{Math.round(r.minutes)}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: r.solved < r.stops ? "var(--status-warn)" : "var(--status-ok)" }}>
                {r.solved}/{r.stops}
              </td>
            </tr>
          ))}
        </tbody>
      </TableCard>

      <div className="mt-4">
        <TableCard icon={CheckCircle2} title={T.aSecEffect} right={fill(T.aRows, { n: data.effect.length })} maxHeight="70vh">
          <thead>
            <tr>
              {[T.cCause, T.cUnit, T.aSolution, T.aWritten, T.aBefore, T.aAfter, T.aChange, T.aVerdict].map((h, i) => (
                <th key={i} className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider ${i >= 4 && i < 7 ? "text-right" : "text-left"}`}
                  style={{ color: "var(--text-3)", background: "var(--bg-inner)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.effect.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.aNoEffect}</td></tr>
            ) : data.effect.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2 whitespace-nowrap font-medium" style={{ color: catColor(e.category) }}>{e.category}</td>
                <td className="px-3 py-2 whitespace-nowrap">
                  {e.manager_name ? shortPerson(tl(e.manager_name) || e.manager_name) : T.aWhole}
                </td>
                <td className="px-3 py-2 max-w-[280px]">
                  <div className="truncate" title={e.text}>{e.text}</div>
                  {e.rethink && (
                    <div className="text-[11px] font-medium truncate" style={{ color: "var(--status-bad)" }}>{T.aAdvice}</div>
                  )}
                </td>
                <td className="px-3 py-2 whitespace-nowrap tabular-nums">{ddmmyy(e.date)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.before}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.after_days ? e.after : "—"}</td>
                <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: INK[e.verdict] }}>
                  {e.change == null ? "—" : `${e.change > 0 ? "+" : ""}${e.change}%`}
                </td>
                <td className="px-3 py-2 whitespace-nowrap"><Chip ink={INK[e.verdict]}>{T.aV[e.verdict]}</Chip></td>
              </tr>
            ))}
          </tbody>
        </TableCard>
        <p className="text-[11px] mt-2" style={{ color: "var(--text-3)" }}>
          {fill(T.aMethod, { w: data.window, d: data.works_drop, r: data.worse_rise, a: data.min_after_days })}
        </p>
      </div>
    </>
  );
}
