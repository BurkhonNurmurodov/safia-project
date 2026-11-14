import { useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Building2, CalendarClock, PlugZap, TrendingDown, TrendingUp, TriangleAlert } from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { SectionHead, Th } from "../components/ui/DataTable";
import { SplitBar } from "../components/ui/Meter";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import { SkeletonBlock, SkeletonTable } from "../components/ui/Skeleton";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import api from "../utils/api";
import { TXT, fill } from "./kitchenText";

// «Oshxona» (/kitchen) — how many people are at work in the factory right now,
// for the kitchen that cooks for them. Counts and department names only, read
// from Verifix by the server (services/kitchen.py) and re-asked every minute.

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

// Today's roster of the plant or of one department, as SplitBar parts. Somebody
// still here from last night is at work but not on today's roster — their
// today is already one of the other three — so the four parts never overlap.
const roster = (r, T) => PARTS.map((p) => {
  const value = p.key === "inside" ? Math.max(0, r.inside - (r.night || 0)) : r[p.key] || 0;
  return { key: p.key, color: p.color, label: T[p.label], sub: T[p.sub], value, text: num(value) };
});

const Dot = ({ color }) => (
  <span aria-hidden className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: color }} />
);

/** Today hour by hour: how many people were at work at the start of each hour,
 *  then — dashed, in a lighter figure — how many the shift schedules put there.
 *  The numbers are printed: nothing hides behind a hover a phone does not have.
 *  The 24 hours WRAP to the card's own width (24 · 12 · 8 · 6 a row, one scale
 *  for every row), so no screen scrolls it sideways or squeezes a number. */
function Hours({ hours, T }) {
  const max = Math.max(1, ...hours.map((h) => h.n));
  const nowAt = hours.reduce((a, h, i) => (h.plan ? a : i), 0);    // the hour we are in
  const peak = hours.reduce((a, h) => (h.n > a.n ? h : a), hours[0]);
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
            <span className="inline-flex items-center gap-1.5">{swatch(false)}{T.legendFact}</span>
            <span className="inline-flex items-center gap-1.5">{swatch(true)}{T.legendPlan}</span>
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
                <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: h.plan ? "var(--text-3)" : "var(--text-1)", fontWeight: now ? 700 : 500 }}>
                  {num(h.n)}
                </span>
                <span className="w-full h-[72px] @min-[936px]:h-28 flex items-end px-[3px]" aria-hidden>
                  <span
                    className="w-full rounded-t"
                    style={{
                      height: `${Math.max(2, (h.n / max) * 100)}%`,
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
      <p className="px-4 pb-3.5 text-xs" style={{ color: "var(--text-3)" }}>{T.hoursSub}</p>
    </section>
  );
}

export default function Kitchen() {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const { tx } = useTranslit();
  const navigate = useNavigate();
  const isAdmin = useAuth()?.auth?.role === "admin";

  const q = useQuery({
    queryKey: ["kitchen-now"],
    queryFn: () => api.get("/api/kitchen/now").then((r) => r.data),
    refetchInterval: 60_000,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });
  const d = q.data;

  let body;
  if (!d && q.isLoading) {
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
        action={isAdmin && <Button variant="secondary" onClick={() => navigate("/panel/verifix")}>{T.offOpen}</Button>}
      />
    );
  } else {
    const stale = d.age_s > STALE_S;
    const at = (d.read_at || "").slice(11, 16);
    const live = stale ? "var(--status-warn)" : "var(--status-ok)";
    const deps = d.departments || [];
    const hours = d.hours || [];
    const parts = roster(d, T);
    const total = parts.reduce((a, p) => a + p.value, 0);
    const next = hours.find((h) => h.plan);            // the first hour still ahead
    const Trend = next && next.n < d.inside ? TrendingDown : TrendingUp;
    const head = (p, text) => <span className="inline-flex items-center gap-1.5"><Dot color={p.color} />{text}</span>;
    body = (
      <div className="space-y-4">
        {/* ONE card: the number, and beside it the whole day it is a part of.
            The 1px gap over a border-coloured ground draws the divider on
            whichever side the halves meet — beside each other, or stacked. */}
        <section className="rounded-2xl overflow-hidden flex flex-wrap gap-px" style={{ background: "var(--border)", border: "1px solid var(--border)" }}>
          <div className="min-w-0 p-5 sm:p-7 flex flex-col justify-center" style={{ flex: "1 1 auto", background: "var(--bg-card)" }}>
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
              <span className="relative flex h-2.5 w-2.5">
                {!stale && <span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping motion-reduce:hidden" style={{ background: live }} />}
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full" style={{ background: live }} />
              </span>
              {T.nowLabel}
            </div>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-3">
              <span className="leading-none font-bold font-mono tabular-nums" style={{ fontSize: "clamp(56px, 9vw, 88px)", color: "var(--text-1)" }}>
                {num(d.inside)}
              </span>
              <span className="text-base" style={{ color: "var(--text-3)" }}>{T.people}</span>
            </div>
            {next && (
              <p className="mt-3 flex items-center gap-1.5 text-sm" style={{ color: "var(--text-2)" }}>
                <Trend size={16} className="flex-shrink-0" style={{ color: Trend === TrendingUp ? BLUE : SLATE }} aria-hidden />
                {fill(T.nextLine, { t: next.t, n: num(next.n) })}
              </p>
            )}
            <p className="mt-2 flex items-center gap-1.5 text-xs" style={{ color: stale ? "var(--status-warn)" : "var(--text-3)" }} role={stale ? "status" : undefined}>
              {stale && <TriangleAlert size={14} className="flex-shrink-0" aria-hidden />}
              {fill(stale ? T.stale : T.asOf, { t: at })}
            </p>
          </div>

          <div className="@container min-w-0 p-5 sm:p-7" style={{ flex: "999 1 420px", background: "var(--bg-card)" }}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: "var(--text-3)" }}>{T.rosterTitle}</h2>
              <span className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>{fill(T.rosterTotal, { came: num(d.came), n: num(total) })}</span>
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
            {d.night > 0 && (
              <p className="mt-4 text-xs" style={{ color: "var(--text-3)" }}>{fill(T.nightLine, { n: num(d.night) })}</p>
            )}
          </div>
        </section>

        <Hours hours={hours} T={T} />

        <TableCard
          head={<SectionHead icon={Building2} color="#14b8a6" title={T.depTitle} right={deps.length || null} />}
          mobileMaxHeight="none"
          mobile={deps.length ? (
            <div>
              <div className="flex justify-between px-4 py-2 text-[11px] font-semibold uppercase" style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                <span>{T.cDep}</span><span>{T.cInside}</span>
              </div>
              {deps.map((r) => (
                <div key={r.name} className="flex items-center gap-3 px-4 min-h-[44px] text-sm" style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="flex-1 truncate" style={{ color: "var(--text-1)" }}>{tx(r.name) || T.noDep}</span>
                  <span className="w-16 flex-shrink-0"><SplitBar parts={roster(r, T)} /></span>
                  <span className="w-12 text-right font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{num(r.inside)}</span>
                </div>
              ))}
            </div>
          ) : <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.depEmpty}</div>}
        >
          <thead>
            <tr>
              <Th label={T.cDep} />
              <Th label={T.cRoster} cls="w-[220px] min-w-[120px]" />
              <Th label={head(PARTS[0], T.cInside)} align="right" />
              <Th label={T.cCame} align="right" />
              <Th label={head(PARTS[1], T.cLeft)} align="right" />
              <Th label={head(PARTS[2], T.cNotYet)} align="right" />
              <Th label={head(PARTS[3], T.cAbsent)} align="right" />
            </tr>
          </thead>
          <tbody>
            {deps.map((r) => (
              <tr key={r.name}>
                <td className="px-3 py-2 max-w-[360px] truncate" title={tx(r.name) || T.noDep}>{tx(r.name) || T.noDep}</td>
                <td className="px-3 py-2"><SplitBar parts={roster(r, T)} /></td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{num(r.inside)}</td>
                {["came", "left", "not_yet", "absent"].map((k) => (
                  <td key={k} className="px-3 py-2 text-right tabular-nums" style={{ color: r[k] ? "var(--text-1)" : "var(--text-3)" }}>{num(r[k])}</td>
                ))}
              </tr>
            ))}
            {!deps.length && (
              <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>{T.depEmpty}</td></tr>
            )}
          </tbody>
        </TableCard>
      </div>
    );
  }

  return <Layout title={T.title}>{body}</Layout>;
}
