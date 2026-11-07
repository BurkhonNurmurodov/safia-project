import { useState } from "react";
import { Sparkline } from "../ui/KpiDeltaCard";
import { ChevronDown, ChevronRight, AlertTriangle, CheckCircle2, Clock, Repeat2, TrendingDown, TrendingUp, Minus } from "lucide-react";
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

function pctChange(values) {
  const h = Math.floor(values.length / 2);
  const f = values.slice(0, h).reduce((x, y) => x + y, 0), l = values.slice(h).reduce((x, y) => x + y, 0);
  return { ch: h && f > 0 ? Math.round((100 * (l - f)) / f) : null, l };
}
const fmtPct = (ch) => `${ch > 0 ? "+" : ch < 0 ? "−" : ""}${Math.abs(ch)}%`;

function WeeklyRow({ w, T, label, trendInk, trendIcon }) {
  const { tl } = useTranslit();
  const [open, setOpen] = useState(false);
  const TI = trendIcon[w.trend];
  const { ch, l } = pctChange(w.values);
  const units = w.by_unit || [];
  const total = units.reduce((x, u) => x + u.minutes, 0) || 1;
  return (
    <div style={{ borderTop: "1px solid var(--border)" }}>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-[var(--bg-inner)] transition-colors">
        <span className="flex-shrink-0" style={{ color: "var(--text-3)" }}>{open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
        <div className="w-44 min-w-0 flex-shrink-0">
          <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
            {w.category} <span className="font-normal" style={{ color: "var(--text-2)" }}>— {label(catCode(w.category))}</span>
          </div>
          <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.minutes, { m: Math.round(w.minutes) })}</div>
        </div>
        <div className="flex-1 min-w-0"><Sparkline values={w.values} color={trendInk[w.trend]} /></div>
        <div className="flex-shrink-0 w-32 text-right" style={{ color: trendInk[w.trend] }}>
          <div className="flex items-center gap-1 text-xs font-medium justify-end"><TI size={14} /> {T.aTrend[w.trend]}</div>
          <div className="text-base font-bold tabular-nums leading-tight">{ch == null ? (l > 0 ? T.aNewShort : "—") : fmtPct(ch)}</div>
        </div>
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1" style={{ background: "var(--bg-inner)", borderTop: "1px solid var(--border)" }}>
          <div className="text-[11px] font-semibold uppercase tracking-wider py-2" style={{ color: "var(--text-3)" }}>{T.aWhoTitle}</div>
          {units.length === 0 ? (
            <div className="text-xs pb-1" style={{ color: "var(--text-3)" }}>{T.aWhoNone}</div>
          ) : units.map((u) => {
            const c = pctChange(u.values);
            const share = Math.round((100 * u.minutes) / total);
            const ink = c.ch == null ? "#94a3b8" : c.ch >= 15 ? trendInk.up : c.ch <= -20 ? trendInk.down : trendInk.flat;
            return (
              <div key={u.manager_id} className="flex items-center gap-3 py-1.5" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="w-44 min-w-0 flex-shrink-0 pl-6">
                  <div className="text-sm font-medium truncate" style={{ color: "var(--text-1)" }}>{shortPerson(tl(u.manager_name) || u.manager_name)}</div>
                  <div className="text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>
                    {u.cell ? `${T.aCellShort} ${u.cell} · ` : ""}{fill(T.aStopsN, { n: u.stops })}
                  </div>
                </div>
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  <div className="w-28 flex-shrink-0 h-2 rounded-full overflow-hidden" style={{ background: "var(--border)" }} aria-hidden="true">
                    <div className="h-full rounded-full" style={{ width: `${share}%`, background: catColor(w.category) }} />
                  </div>
                  <span className="text-xs tabular-nums w-24 flex-shrink-0" style={{ color: "var(--text-2)" }}>{share}% · {Math.round(u.minutes)} {T.aMinShort}</span>
                  <div className="flex-1 min-w-0"><Sparkline values={u.values} color={ink} /></div>
                </div>
                <div className="flex-shrink-0 w-32 text-right text-sm font-bold tabular-nums" style={{ color: ink }}>
                  {c.ch == null ? (c.l > 0 ? T.aNewShort : "—") : fmtPct(c.ch)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// TEMP-DEMO (remove in the next commit): invented weekly figures so the dynamics block can be previewed.
function tempDemo(d) {
  // follows the picked period: one point per Monday-week the server returned
  const weeks = d.weeks && d.weeks.length ? d.weeks : [];
  const n = weeks.length;
  const jit = (w, k) => ((Date.parse(w) / 864e5 * 7 + k * 13) % 11) - 5; // stable ±5 per week
  const mk = (category, k, shape) => {
    const values = weeks.map((w, i) => Math.max(0, Math.round(shape(n > 1 ? i / (n - 1) : 1) + jit(w, k))));
    return { category, values, trend: "flat", minutes: values.reduce((x, y) => x + y, 0), solutions_n: 1 };
  };
  const trendOf = (r) => {
    const h = Math.floor(n / 2), f = r.values.slice(0, h).reduce((x, y) => x + y, 0), l = r.values.slice(h).reduce((x, y) => x + y, 0);
    return !h || !f ? (l > 0 ? "up" : "flat") : (l - f) / f <= -0.2 ? "down" : (l - f) / f >= 0.15 ? "up" : "flat";
  };
  const weekly = n ? [
    mk("Cat D3", 1, (x) => 40 + 130 * x),
    mk("Cat B", 2, (x) => 200 - 140 * x),
    mk("Cat F", 3, () => 80),
    mk("Cat K", 4, (x) => (x < 0.5 ? 0 : 60 * (x - 0.4))),
  ].map((r) => ({ ...r, trend: trendOf(r) })) : [];
  const people = [["R. Kamola", "8613", 0.5], ["K. Nargiza", "8623", 0.3], ["I. Sayyora", "7424", 0.2]];
  weekly.forEach((r, k) => {
    r.by_unit = people.map(([name, cell, share], j) => {
      const values = r.values.map((v, i) => Math.round(v * share * (j === 0 && r.trend === "up" ? 1.15 : 1) + ((i + j + k) % 3)));
      return { manager_id: 800 + j, manager_name: name, minutes: values.reduce((x, y) => x + y, 0), values, cell, stops: 3 + j };
    });
  });
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const iso = (x) => x.toISOString().slice(0, 10);
  const demoEffect = (id, category, mgr, text, status, back, pattern) => {
    const sd = new Date(today); sd.setDate(sd.getDate() - back);
    const s0 = new Date(sd); s0.setDate(s0.getDate() - 14);
    const len = 14 + back + 1 > 29 ? 29 : 14 + back + 1;
    const daily = Array.from({ length: len }, (_, i) => Math.max(0, Math.round(pattern(i - 14, i))));
    const b = daily.slice(0, 14), a = daily.slice(15);
    const before = b.reduce((x, y) => x + y, 0) / 14, after = a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    const ch = before ? Math.round((100 * (after - before)) / before) : null;
    const verdict = a.length < 3 ? "early" : ch <= -30 ? "works" : ch >= 15 ? "worse" : "weak";
    return { id, category, manager_id: id, manager_name: mgr, text, status, date: iso(sd), daily, daily_from: iso(s0), marker: 14,
      before: Math.round(before * 10) / 10, after: Math.round(after * 10) / 10, after_days: a.length, change: ch, verdict, rethink: false };
  };
  const effect = [
    demoEffect(901, "Cat B", "R. Kamola", "Oborudivaniya navbatchi texnik biriktirildi", "done", 12, (k, i) => (k < 0 ? 22 + ((i * 7) % 9) : k < 3 ? 12 : (i % 5 === 0 ? 4 : 0))),
    demoEffect(902, "Cat D3", "K. Nargiza", "Otdel bilan kelishuv grafigi tuzildi", "doing", 12, (k, i) => (k < 0 ? 20 + ((i * 5) % 8) : 18 + ((i * 3) % 9))),
    demoEffect(903, "Cat I", "I. Sayyora", "Smena topshirish ro'yxati kiritildi", "done", 9, (k, i) => (k < 0 ? 15 + ((i * 3) % 7) : 14 + ((i * 11) % 14) + k)),
  ];
  return { ...d, weeks, weekly, effect, counts: { works: 1, weak: 1, worse: 1, early: 0 }, rethink_n: 0 };
}

function RepeatChart({ e, T }) {
  const v = e.daily || [];
  if (v.length < 3) return null;
  const W = 600, H = 70, P = 2, m = e.marker;
  const max = Math.max(1, ...v);
  const bw = (W - P * 2) / v.length;
  const ink = INK[e.verdict] || "#94a3b8";
  const afterDays = v.slice(m + 1), repeated = afterDays.filter((x) => x > 0).length;
  const beforeDays = v.slice(0, m), repeatedB = beforeDays.filter((x) => x > 0).length;
  return (
    <div className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>
            <span style={{ color: catColor(e.category) }}>{e.category}</span> · {e.manager_name || T.aWhole}
          </div>
          <div className="text-xs truncate" style={{ color: "var(--text-2)" }} title={e.text}>«{e.text}» · {ddmmyy(e.date)}</div>
        </div>
        <Chip ink={ink}>{T.aV[e.verdict]}</Chip>
      </div>
      <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img"
        aria-label={fill(T.aRepeatAfterSum, { r: repeated, n: afterDays.length })}>
        {v.map((x, i) => {
          const h = x > 0 ? Math.max(3, (x / max) * (H - 8)) : 1.5;
          return <rect key={i} x={P + i * bw + 0.5} y={H - h} width={Math.max(1, bw - 1.5)} height={h} rx={1}
            fill={i < m ? "#94a3b8" : i === m ? "var(--brand)" : ink} opacity={x > 0 ? 0.9 : 0.35} />;
        })}
        <line x1={P + m * bw + bw / 2} x2={P + m * bw + bw / 2} y1={0} y2={H} stroke="var(--brand)" strokeWidth={1.5}
          strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-1.5 text-xs tabular-nums">
        <span style={{ color: "var(--text-3)" }}>{fill(T.aBeforeLine, { r: repeatedB, n: beforeDays.length, m: e.before })}</span>
        <span style={{ color: "var(--brand-text)" }}>{T.aMarkSol}</span>
        <span className="font-semibold" style={{ color: ink }}>
          {afterDays.length ? fill(T.aRepeatAfterSum, { r: repeated, n: afterDays.length }) + ` · ${e.after} ${T.aPerDay}` : T.aEarlyShort}
          {e.change != null && afterDays.length ? ` · ${e.change > 0 ? "+" : ""}${e.change}%` : ""}
        </span>
      </div>
    </div>
  );
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
        ) : data.weekly.map((w) => (
          <WeeklyRow key={w.category} w={w} T={T} label={label} trendInk={trendInk} trendIcon={trendIcon} />
        ))}
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-[11px]"
          style={{ borderTop: "1px solid var(--border)", background: "var(--bg-inner)", color: "var(--text-2)" }}>
          {[["up", T.aLegUp], ["down", T.aLegDown], ["flat", T.aLegFlat]].map(([k, txt]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className="inline-block w-3 h-[3px] rounded-full" style={{ background: trendInk[k] }} />{txt}
            </span>
          ))}
          <span className="w-full sm:w-auto sm:ml-auto" style={{ color: "var(--text-3)" }}>{T.aLegHow}</span>
        </div>
      </div>

      {data.effect.length > 0 && (
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={CheckCircle2} title={T.aSecRepeatAfter} right={fill(T.aRows, { n: data.effect.length })} />
          <div className="px-4 pb-2 text-[11px]" style={{ color: "var(--text-3)" }}>{T.aRepeatAfterHint}</div>
          {data.effect.map((e) => <RepeatChart key={e.id} e={e} T={T} />)}
        </div>
      )}

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
