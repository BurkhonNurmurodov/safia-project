import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Building2, CalendarClock, PlugZap, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import { SplitBar } from "../components/ui/Meter";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import DayStepper from "../components/ui/DayStepper";
import { SkeletonBlock, SkeletonTable } from "../components/ui/Skeleton";
import { tashkentNow } from "../components/production/HourlyContainers";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useCapabilities } from "../hooks/useCapabilities";
import { useTranslit } from "../utils/transliterate";
import { addDays } from "../utils/targets";
import api from "../utils/api";
import { TXT, fill } from "./kitchenText";

// «Oshxona» (/kitchen) — how many people are at work in the factory right now,
// for the kitchen that cooks for them. Counts and department names only, read
// from Verifix by the server (services/kitchen.py) and re-asked every minute.
// A picked past day shows that day from the clocks; tomorrow (the furthest a
// pick goes) its forecast — `mode` "today" | "past" | "next".

const STALE_S = 600;                                  // older than this = Verifix is silent
const num = (n) => (n ?? 0).toLocaleString("ru-RU");  // 1 482
const CARD = { background: "var(--bg-card)", border: "1px solid var(--border)" };

// Where today's people are — ONE hue per answer, the same on the roster bar,
// the hours and every department's row.
const PARTS = [
  { key: "inside",  color: "#22c55e", label: "kIn",     sub: "kInSub" },
  { key: "left",    color: "#94a3b8", label: "kLeft",   sub: "kLeftSub" },
  { key: "not_yet", color: "#3b82f6", label: "kNotYet", sub: "kNotYetSub" },
  { key: "absent",  color: "#ef4444", label: "kAbsent", sub: "kAbsentSub" },
];
const [GREEN, SLATE, BLUE] = PARTS.map((p) => p.color);

// Tomorrow nobody has come yet: everybody with a shift is «not in yet», or
// «did not come» where the schedule names no hours.
const planned = (r) => (r.not_yet || 0) + (r.absent || 0);
const val = (r, k) => (k === "planned" ? planned(r) : r[k] || 0);

// The day's roster of the plant or of one department, as SplitBar parts.
// Somebody still here from last night is at work but not on today's roster —
// their today is already one of the other three — so the parts never overlap.
// A past day has nobody «not in yet», and «still here» only while it lasts.
const roster = (r, T, mode = "today") => {
  if (mode === "next") {
    return [{ key: "planned", color: BLUE, label: T.kPlanned, sub: T.kPlannedSub, value: planned(r), text: num(planned(r)) }];
  }
  return PARTS.map((p) => {
    const value = p.key === "inside" ? Math.max(0, r.inside - (r.night || 0)) : r[p.key] || 0;
    const sub = T[mode === "past" ? `${p.sub}Past` : p.sub];
    return { key: p.key, color: p.color, label: T[p.label], sub, value, text: num(value) };
  }).filter((p) => mode === "today" || (p.key !== "not_yet" && (p.value || p.key !== "inside")));
};

// The department table's number columns per kind of day — the first is the
// row's headline (bold, and the one a phone row keeps); `part` = its colour dot.
const COLS = {
  today: [["inside", "cInside", 0], ["came", "cCame"], ["left", "cLeft", 1], ["not_yet", "cNotYet", 2], ["absent", "cAbsent", 3]],
  past: [["came", "cCame"], ["left", "cLeft", 1], ["absent", "cAbsent", 3]],
  next: [["planned", "kPlanned"]],
};
const peakOf = (hours) => hours.reduce((a, h) => (h.n > a.n ? h : a), hours[0]);

const Dot = ({ color }) => (
  <span aria-hidden className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: color }} />
);

/** Today hour by hour: how many people were at work at the start of each hour,
 *  then — dashed, in a lighter figure — how many the shift schedules put there.
 *  The numbers are printed: nothing hides behind a hover a phone does not have.
 *  The 24 hours WRAP to the card's own width (24 · 12 · 8 · 6 a row, one scale
 *  for every row), so no screen scrolls it sideways or squeezes a number. */
function Hours({ hours, T, mode }) {
  const max = Math.max(1, ...hours.map((h) => h.n));
  const nowAt = mode === "today" ? hours.reduce((a, h, i) => (h.plan ? a : i), 0) : -1;   // the hour we are in
  const peak = peakOf(hours);
  const swatch = (plan) => (
    <span className="inline-block w-3 h-3 rounded-sm" aria-hidden
      style={plan ? { border: `1.5px dashed ${GREEN}` } : { background: GREEN }} />
  );
  return (
    <section className="rounded-2xl overflow-hidden" style={CARD}>
      <SectionHead
        icon={CalendarClock} color="#a855f7" title={T.hoursTitle}
        right={(
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: "var(--text-2)" }}>
            {peak && (
              <span>
                {T.peak}: <b className="font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{peak.t} · {num(peak.n)}</b>
              </span>
            )}
            {mode !== "next" && <span className="inline-flex items-center gap-1.5">{swatch(false)}{T.legendFact}</span>}
            {mode !== "past" && <span className="inline-flex items-center gap-1.5">{swatch(true)}{T.legendPlan}</span>}
          </div>
        )}
      />
      <div className="@container px-3 sm:px-4 pt-4 pb-2">
        <ol
          className="grid gap-x-[3px] gap-y-3 grid-cols-6 @min-[296px]:grid-cols-8 @min-[456px]:grid-cols-12 @min-[936px]:grid-cols-24"
          aria-label={T.hoursTitle}
        >
          {hours.map((h, i) => {
            const now = i === nowAt;
            return (
              <li
                key={h.t}
                className="min-w-0 flex flex-col items-center gap-1 rounded-lg pt-1.5 pb-1"
                style={now ? { background: "var(--bg-inner)" } : undefined}
              >
                {/* The number rides its own bar — a short bar under a number
                    left at the top of the column read as two separate things. */}
                <span className="w-full h-[92px] @min-[936px]:h-[132px] flex flex-col items-center justify-end gap-1 px-[3px]">
                  <span className="text-[11px] leading-4 tabular-nums whitespace-nowrap" style={{ color: h.plan ? "var(--text-3)" : "var(--text-1)", fontWeight: now ? 700 : 500 }}>
                    {num(h.n)}
                  </span>
                  <span
                    aria-hidden className="w-full rounded-t"
                    style={{
                      height: `calc((100% - 20px) * ${h.n / max})`, minHeight: 2,
                      ...(h.plan
                        ? { border: `1.5px dashed ${GREEN}`, borderBottom: "none", background: `${GREEN}24` }
                        : { background: GREEN, opacity: now ? 1 : 0.75 }),
                    }}
                  />
                </span>
                <span className="text-[11px] tabular-nums" style={{ color: now ? "var(--text-1)" : "var(--text-3)", fontWeight: now ? 700 : 400 }}>{h.t}</span>
              </li>
            );
          })}
        </ol>
      </div>
      <p className="px-4 pb-3.5 text-xs" style={{ color: "var(--text-3)" }}>{T[{ today: "hoursSub", past: "hoursSubPast", next: "hoursSubNext" }[mode]]}</p>
    </section>
  );
}

export default function Kitchen() {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const { tx } = useTranslit();
  const navigate = useNavigate();
  const { capTabs } = useCapabilities();
  // The button opens the «Verifix» admin tab — offered to whoever may open it.
  const isAdmin = useAuth()?.auth?.role === "admin" || capTabs.includes("verifixsync");

  // null = today, and the page rolls over to the next day by itself at midnight.
  const live = tashkentNow().iso;
  const [picked, setPicked] = useState(null);
  const day = picked ?? live;
  const mode = day === live ? "today" : day > live ? "next" : "past";
  // Each other day is a plant-wide Verifix read: steps clicked in a row ask once, for the last.
  const [settled, setSettled] = useState(day);
  useEffect(() => {
    const id = setTimeout(() => setSettled(day), 350);
    return () => clearTimeout(id);
  }, [day]);
  const asked = day === live ? live : settled;            // back to today: at once, it is kept

  const q = useQuery({
    queryKey: asked === live ? ["kitchen-now"] : ["kitchen-now", asked],
    queryFn: () => api.get("/api/kitchen/now", { params: asked === live ? {} : { day: asked } }).then((r) => r.data),
    // An older snapshot served while the server reads a new one: ask again soon.
    // A past day does not change much; tomorrow's forecast is re-read every 5 minutes.
    refetchInterval: (query) => (asked !== live ? (asked > live ? 300_000 : false)
      : query.state.data?.refreshing ? 5000 : 60_000),
    staleTime: asked === live ? 30_000 : 300_000,
    ...(asked === live ? {} : { retry: false }),        // a failed plant-wide read is not repeated by itself
    placeholderData: keepPreviousData,
  });
  const d = asked === day && !q.isPlaceholderData ? q.data : undefined;   // never another day's numbers under this date

  let body;
  if (!d && (q.isFetching || asked !== day)) {
    body = (
      <div className="space-y-4">
        <SkeletonBlock className="h-56 w-full rounded-2xl" />
        <SkeletonBlock className="h-56 w-full rounded-2xl" />
        <SkeletonTable rows={6} cols={7} />
      </div>
    );
  } else if (!d) {
    body = (
      <EmptyState
        tone="danger" icon={TriangleAlert} height="h-72" showUploadLink={false}
        title={T.errTitle} message={T.errText}
        action={<Button variant="secondary" loading={q.isFetching} onClick={() => q.refetch()}>{T.retry}</Button>}
      />
    );
  } else if (!d.configured) {
    body = (
      <EmptyState
        icon={PlugZap} height="h-72" showUploadLink={false} title={T.offTitle} message={T.offText}
        action={isAdmin && <Button variant="secondary" onClick={() => navigate("/panel/verifixsync?t=connection")}>{T.offOpen}</Button>}
      />
    );
  } else {
    const today = mode === "today";
    const stale = today && d.age_s > STALE_S && !d.refreshing;   // a read is running, not silent
    const at = (d.read_at || "").slice(11, 16);
    const dot = stale ? "var(--status-warn)" : "var(--status-ok)";
    const hours = d.hours || [];
    const cols = COLS[mode];
    const main = cols[0][0];
    // The server orders departments by who is in now; another day, by its own headline.
    const deps = today ? d.departments || [] : (d.departments || []).filter((r) => val(r, main) || mode !== "next")
      .sort((a, b) => val(b, main) - val(a, main));
    const parts = roster(d, T, mode);
    const total = parts.reduce((a, p) => a + p.value, 0);
    const next = today && hours.find((h) => h.plan);   // the first hour still ahead
    const peak = peakOf(hours);
    const emptyText = T[{ today: "depEmpty", past: "depEmptyPast", next: "depEmptyNext" }[mode]];
    const Trend = next && next.n < d.inside ? TrendingDown : TrendingUp;
    const head = (i, text) => (i == null ? text
      : <span className="inline-flex items-center gap-1.5"><Dot color={PARTS[i].color} />{text}</span>);
    // The headline: who is in now · who came that day · tomorrow's busiest hour.
    const big = { today: [T.nowLabel, d.inside], past: [T.dayCame, d.came], next: [T.nextPeak, peak?.n] }[mode];
    body = (
      <div className="space-y-4">
        {/* ONE card: the number, and beside it the whole day it is a part of.
            The 1px gap over a border-coloured ground draws the divider on
            whichever side the halves meet — beside each other, or stacked. */}
        <section className="rounded-2xl overflow-hidden flex flex-wrap gap-px" style={{ background: "var(--border)", border: "1px solid var(--border)" }}>
          <div className="min-w-0 p-5 sm:p-7 flex flex-col justify-center" style={{ flex: "1 1 auto", background: "var(--bg-card)" }}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              {today && (
                <span className="relative flex h-2.5 w-2.5">
                  {!stale && <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping motion-reduce:hidden" style={{ background: dot }} />}
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: dot }} />
                </span>
              )}
              {big[0]}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
              <span className="leading-none font-bold font-mono tabular-nums" style={{ fontSize: "clamp(56px, 9vw, 88px)", color: mode === "next" ? "var(--text-2)" : "var(--text-1)" }}>
                {num(big[1])}
              </span>
              <span className="text-base" style={{ color: "var(--text-3)" }}>{T.people}</span>
            </div>
            {next && (
              <p className="mt-3 flex items-center gap-1.5 text-sm" style={{ color: "var(--text-2)" }}>
                <Trend size={16} className="flex-shrink-0" style={{ color: Trend === TrendingUp ? BLUE : SLATE }} aria-hidden />
                {fill(T.nextLine, { t: next.t, n: num(next.n) })}
              </p>
            )}
            {!today && peak && (
              <p className="mt-3 text-sm" style={{ color: "var(--text-2)" }}>
                {fill(mode === "past" ? T.peakLine : T.nextAt, { t: peak.t, n: num(peak.n) })}
              </p>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: stale ? "var(--status-warn)" : "var(--text-3)" }} role={stale ? "status" : undefined}>
              {stale && <TriangleAlert size={14} className="flex-shrink-0" aria-hidden />}
              {fill(stale ? T.stale : { today: T.asOf, past: T.asOfPast, next: T.asOfNext }[mode], { t: at })}
            </p>
          </div>

          <div className="@container min-w-0 p-5 sm:p-7" style={{ flex: "999 1 420px", background: "var(--bg-card)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
                {{ today: T.rosterTitle, past: T.rosterTitlePast, next: T.rosterTitleNext }[mode]}
              </h2>
              {mode !== "next" && (
                <span className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>{fill(T.rosterTotal, { came: num(d.came), n: num(total) })}</span>
              )}
            </div>
            <div className="mt-3"><SplitBar parts={parts} height={12} /></div>
            <dl className="mt-5 grid grid-cols-2 @min-[520px]:grid-cols-4 gap-4">
              {parts.map((p) => (
                <div key={p.key} className="min-w-0">
                  <dt className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-2)" }}>
                    <Dot color={p.color} /><span className="truncate">{p.label}</span>
                  </dt>
                  <dd className="mt-1.5 text-2xl leading-none font-bold font-mono tabular-nums" style={{ color: "var(--text-1)" }}>{p.text}</dd>
                  <dd className="mt-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>{p.sub}</dd>
                </div>
              ))}
            </dl>
            {today && d.night > 0 && (
              <p className="mt-4 text-xs" style={{ color: "var(--text-3)" }}>{fill(T.nightLine, { n: num(d.night) })}</p>
            )}
          </div>
        </section>

        <Hours hours={hours} T={T} mode={mode} />

        <TableCard
          head={<SectionHead icon={Building2} color="#14b8a6" title={T.depTitle} right={deps.length || null} />}
          mobileMaxHeight="none"
          mobile={deps.length ? (
            <div>
              <div className="flex justify-between px-4 py-2 text-[11px] font-semibold uppercase" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                <span>{T.cDep}</span><span>{T[cols[0][1]]}</span>
              </div>
              {deps.map((r) => (
                <div key={r.name} className="flex items-center gap-3 px-4 min-h-[44px] text-sm" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="flex-1 truncate" style={{ color: "var(--text-1)" }}>{tx(r.name) || T.noDep}</span>
                  {mode !== "next" && <span className="w-16 flex-shrink-0"><SplitBar parts={roster(r, T, mode)} /></span>}
                  <span className="w-12 text-right font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{num(val(r, main))}</span>
                </div>
              ))}
            </div>
          ) : <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{emptyText}</div>}
        >
          <thead>
            <tr>
              <Th label={T.cDep} />
              {mode !== "next" && <Th label={T.cRoster} cls="w-[220px] min-w-[120px]" />}
              {cols.map(([k, label, i]) => <Th key={k} label={head(i, T[label])} align="right" />)}
            </tr>
          </thead>
          <tbody>
            {deps.map((r) => (
              <tr key={r.name}>
                <td className="px-3 py-2 max-w-[360px] truncate" title={tx(r.name) || T.noDep}>{tx(r.name) || T.noDep}</td>
                {mode !== "next" && <td className="px-3 py-2"><SplitBar parts={roster(r, T, mode)} /></td>}
                {cols.map(([k], j) => (
                  <td key={k} className={`px-3 py-2 text-right tabular-nums${j ? "" : " font-semibold"}`}
                    style={j ? { color: val(r, k) ? "var(--text-1)" : "var(--text-3)" } : undefined}>{num(val(r, k))}</td>
                ))}
              </tr>
            ))}
            {!deps.length && (
              <tr><td colSpan={cols.length + (mode === "next" ? 1 : 2)} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
                {emptyText}
              </td></tr>
            )}
          </tbody>
        </TableCard>
      </div>
    );
  }

  return (
    <Layout title={T.title}>
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <DayStepper value={day} onChange={(v) => setPicked(v === live ? null : v)} max={addDays(live, 1)} fillPhone />
      </div>
      {body}
    </Layout>
  );
}
