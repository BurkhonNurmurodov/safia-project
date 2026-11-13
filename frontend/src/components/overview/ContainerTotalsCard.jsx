import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Clock } from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useAuth } from "../../context/AuthContext";
import { SkeletonBlock } from "../ui/Skeleton";
import { DAY, clock, hourLabel, tashkentNow, prevISO } from "../production/HourlyContainers";

// The hour-by-hour table under the tiles (2026-11-12, the operator) — shown to
// these roles only, as «Soatlik» on «Zagruzka fayli» (the server refuses the
// rest: `HOURLY_ROLES` in routers/shift_report.py).
const HOURLY_ROLES = ["admin", "shift-manager"];

// The day's container totals for the whole scope (2026-10-30, the operator:
// «total number of each container type as a whole, not by supervisor or
// cells») — `GET /api/shift-report/containers`, Σ over every position of the
// count the «Pozitsiyalar» table's «soni» columns print. One tile per
// container; «—» where no position states a capacity.
const KEYS = ["yellow", "round", "grey", "bucket", "box"];
const fmt = (v) => (v == null ? "—" : Number(v).toLocaleString("ru-RU"));

export default function ContainerTotalsCard({ day, params, enabled = true }) {
  const { t } = useLang();
  const { auth } = useAuth();
  const showHourly = HOURLY_ROLES.includes(auth?.role);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["shift-daily-containers", day, params],
    queryFn: () => api.get("/api/shift-report/containers", { params: { ...params, day } }).then((r) => r.data),
    enabled: enabled && !!day,
    staleTime: 60_000,
  });
  return (
    <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-4 mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Package size={16} style={{ color: "var(--brand-text)" }} />
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
            {t("production.contTotals.title")}
          </div>
          <div className="text-[12px]" style={{ color: "var(--text-3)" }}>{t("production.contTotals.sub")}</div>
        </div>
      </div>
      {isError ? (
        <div className="text-sm" style={{ color: "var(--text-3)" }}>{t("production.contTotals.failed")}</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {KEYS.map((k) => {
            const v = data?.totals?.[k];
            return (
              <div key={k} className="rounded-xl p-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                <div className="text-[12px] leading-snug min-h-[2.5em]" style={{ color: "var(--text-3)" }}>{t(`production.cont.${k}`)}</div>
                {isLoading || !data ? (
                  <SkeletonBlock className="h-7 w-16 mt-1" />
                ) : (
                  <>
                    <div className="text-2xl font-bold tabular-nums mt-1" style={{ color: v == null ? "var(--text-4)" : "var(--text-1)" }}>{fmt(v)}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
                      {t("production.contTotals.lines").replace("{n}", String(data.lines?.[k] ?? 0))}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
      {showHourly && <HourlyTable day={day} params={params} enabled={enabled} t={t} />}
    </div>
  );
}

// Every hour of the day as a column, the five containers as rows: the scope's
// containers per clock hour (`GET /api/shift-report/containers-hourly`, the
// «Soatlik» timeline of every team summed), a «Jami» row adding the five up per
// hour. Each cell is tinted by its size within its row (the operator: make the
// hours readable at a glance). On today's page the CURRENT hour is outlined,
// the NEXT one gold with «tayyorlang» in its head, hours over dimmed, and the
// table scrolls itself to them; the clock is re-read every minute.
const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm ?? ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const heat = (n, max) => (n > 0 && max > 0 ? `rgba(200,151,63,${(0.06 + 0.34 * (n / max)).toFixed(3)})` : "transparent");

// Exported for «Konteynerlar» (/containers), which shows the same table on a
// TV: `refetchInterval` keeps it current without anyone touching it; `around`
// ({before, after}) shows only the hours from `before` ahead of the current
// one to `after` beyond it — a TV cannot be scrolled — while the «Jami»
// column still counts the whole day; `size="lg"` sets it in reading-distance
// type. Both apply only where they are passed («Smena kunligi» is unchanged).
export function HourlyTable({ day, params, enabled = true, t, refetchInterval = false, around = null, size = "md" }) {
  const big = size === "lg";
  const { data, isLoading, isError } = useQuery({
    queryKey: ["shift-daily-containers-hourly", day, params],
    queryFn: () => api.get("/api/shift-report/containers-hourly", { params: { ...params, day } }).then((r) => r.data),
    enabled: enabled && !!day,
    staleTime: 60_000,
    refetchInterval,
  });
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const now = tashkentNow();
  const nowMin = day === now.iso ? now.min : day === prevISO(now.iso) ? now.min + DAY : null;
  const nowHour = nowMin == null ? null : Math.floor(nowMin / 60);
  const prepHour = nowHour == null ? null : nowHour + 1;

  // Bring the current hour into view once the table is there: the sticky
  // first column covers the left edge, so the current hour lands just right
  // of it.
  const scrollRef = useRef(null);
  const nowRef = useRef(null);
  const firstRef = useRef(null);
  useEffect(() => {
    const sc = scrollRef.current, el = nowRef.current ?? null;
    if (!sc || !el) return;
    const stick = firstRef.current?.offsetWidth ?? 0;
    sc.scrollLeft = Math.max(0, el.offsetLeft - stick - 8);
  }, [data, nowHour]);

  const head = (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-4 mb-2">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
        <Clock size={13} style={{ color: "var(--brand-text)" }} />
        {t("production.contTotals.hourly")}
      </span>
      {prepHour != null ? (
        <span className="text-[12px] font-medium px-2 py-0.5 rounded-md"
          style={{ color: "var(--brand-text)", background: "rgba(200,151,63,0.14)", border: "1px solid rgba(200,151,63,0.35)" }}>
          {t("production.hourly.prepNow").replace("{at}", clock((prepHour - 1) * 60))
            .replace("{span}", `${clock(prepHour * 60)}–${clock((prepHour + 1) * 60)}`)}
        </span>
      ) : (
        <span className="text-[12px]" style={{ color: "var(--text-3)" }}>{t("production.contTotals.notToday")}</span>
      )}
    </div>
  );
  if (isError) return <>{head}<div className="text-sm" style={{ color: "var(--text-3)" }}>{t("production.contTotals.failed")}</div></>;
  if (isLoading || !data) return <>{head}<SkeletonBlock className="h-40 w-full" /></>;
  const hours = data.hours ?? [];
  const untimed = data.untimed ?? {};
  const keys = (data.keys ?? KEYS).filter((k) => hours.some((x) => x.counts?.[k]) || untimed[k]);
  if (!hours.length || !keys.length) {
    return <>{head}<div className="text-[12px]" style={{ color: "var(--text-3)" }}>{t("production.hourly.none")}</div></>;
  }
  // ONE production day (the operator): from shift 1's start to the same clock
  // next morning — or, with a shift picked on the page, that shift alone —
  // split at the shift change by a line. Hours a team works outside it (a plan
  // that overruns, a cell starting early) fold into «Oldin» / «Keyin».
  const shifts = (data.shifts ?? []).map((x) => {
    const st = toMin(x.start);
    let en = toMin(x.end);
    if (st != null && en != null && en <= st) en += DAY;
    return { n: x.shift, st, en };
  }).filter((x) => x.st != null && x.en != null);
  const pick = shifts.find((x) => x.n === Number(params?.shift));
  const s1 = shifts.find((x) => x.n === 1);
  const wStart = pick ? pick.st : (s1 ? s1.st : 8 * 60);
  const wEnd = pick ? pick.en : wStart + DAY;
  const lo = Math.floor(wStart / 60), hi = Math.ceil(wEnd / 60) - 1;
  const byH = Object.fromEntries(hours.map((x) => [x.h, x.counts || {}]));
  const cols = [];
  for (let h = lo; h <= hi; h++) cols.push(h);
  // What is drawn: every hour, or — `around` on the live day — a window round
  // the current hour, slid back inside the day at its edges. Totals stay on
  // `cols`, the whole day.
  const win = around && nowHour != null && cols.length > 0;
  let shown = cols;
  if (win) {
    const span = around.before + around.after + 1;
    let a = Math.max(lo, nowHour - around.before);
    a = Math.min(a, Math.max(lo, hi - span + 1));
    shown = cols.filter((h) => h >= a && h < a + span);
  }
  const outside = (cmp) => {
    const o = {};
    for (const x of hours) if (cmp(x.h)) for (const [k, n] of Object.entries(x.counts || {})) o[k] = (o[k] ?? 0) + n;
    return o;
  };
  const before = outside((h) => h < lo), after = outside((h) => h > hi);
  const hasBefore = keys.some((k) => before[k]), hasAfter = keys.some((k) => after[k]);
  // Which shift an hour belongs to (by its start), and where the line goes.
  const shiftOf = (h) => {
    const m = h * 60;
    const x = shifts.find((sh) => [m, m + DAY, m - DAY].some((v) => v >= sh.st && v < sh.en));
    return x ? x.n : null;
  };
  const isBoundary = (h) => h > shown[0] && shiftOf(h) !== shiftOf(h - 1);
  const divL = (h) => (isBoundary(h) ? { borderLeft: "2px solid var(--text-3)" } : {});
  const groups = [];
  for (const h of shown) {
    const n = shiftOf(h);
    const g = groups[groups.length - 1];
    if (g && g.n === n) g.span += 1; else groups.push({ n, span: 1, h });
  }
  const hasUntimed = !win && keys.some((k) => untimed[k]);
  const showBefore = !win && hasBefore, showAfter = !win && hasAfter;
  const val = (k, h) => byH[h]?.[k] ?? 0;
  const sumH = (h) => keys.reduce((s, k) => s + val(k, h), 0);
  const rowMax = Object.fromEntries(keys.map((k) => [k, Math.max(0, ...cols.map((h) => val(k, h)))]));
  const sumMax = Math.max(0, ...cols.map(sumH));
  const past = (h) => nowMin != null && (h + 1) * 60 <= nowMin;
  // The current hour is outlined, the next one carries the gold head.
  const ring = (h, top, bottom) => (h === nowHour ? {
    boxShadow: `inset 2px 0 0 var(--brand), inset -2px 0 0 var(--brand)${top ? ", inset 0 2px 0 var(--brand)" : ""}${bottom ? ", inset 0 -2px 0 var(--brand)" : ""}`,
  } : {});
  const cellBorder = { borderTop: "1px solid var(--border)", borderLeft: "1px solid var(--border)" };
  const lastKey = "__sum";
  const cell = (k, h, n, max, bold) => (
    <td key={h} className={`${big ? "px-3 py-3" : "px-2 py-2"} text-center`}
      style={{ ...cellBorder, ...divL(h), ...ring(h, false, k === lastKey),
        background: heat(n, max),
        opacity: past(h) ? 0.55 : 1,
        color: n ? "var(--text-1)" : "var(--text-4)",
        fontWeight: bold || (n && h === prepHour) ? 700 : n ? 600 : 400 }}>
      {n ? fmt(n) : "·"}
    </td>
  );
  return (
    <>
      {head}
      <div ref={scrollRef} className="overflow-x-auto rounded-xl" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
        <table className={`${big ? "text-lg" : "text-xs"} tabular-nums border-collapse w-full`}>
          <thead>
            {groups.some((g) => g.n != null) && (
              <tr>
                <th className="sticky left-0 z-[2]" style={{ background: "var(--bg-inner)" }} />
                {showBefore && <th />}
                {groups.map((g) => (
                  <th key={g.h} colSpan={g.span}
                    className="px-2 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-left whitespace-nowrap"
                    style={{ color: "var(--text-2)", ...divL(g.h) }}>
                    {g.n != null ? t("production.contTotals.shiftN").replace("{n}", String(g.n)) : ""}
                  </th>
                ))}
                {showAfter && <th />}
                {hasUntimed && <th />}
                <th />
              </tr>
            )}
            <tr>
              <th ref={firstRef} className="sticky left-0 z-[2] text-left font-medium px-3 py-2 whitespace-nowrap"
                style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>{t("production.hourly.container")}</th>
              {showBefore && (
                <th className="px-2 py-2 font-medium text-center whitespace-nowrap align-bottom"
                  title={t("production.contTotals.beforeHint")}
                  style={{ borderLeft: "1px solid var(--border)", color: "var(--text-3)" }}>{t("production.contTotals.before")}</th>
              )}
              {shown.map((h) => (
                <th key={h} ref={h === nowHour || (nowHour != null && nowHour < lo && h === lo) ? nowRef : undefined}
                  className={`${big ? "px-3 py-2" : "px-2 py-1.5"} font-medium text-center whitespace-nowrap align-bottom`}
                  title={h === prepHour ? t("production.hourly.prepHint") : h === nowHour ? t("production.contTotals.nowHint") : undefined}
                  style={{ borderLeft: "1px solid var(--border)", ...divL(h), ...ring(h, true, false),
                    background: h === prepHour ? "var(--brand)" : "transparent",
                    color: h === prepHour ? "var(--on-brand)" : h === nowHour ? "var(--brand-text)" : past(h) ? "var(--text-4)" : "var(--text-2)",
                    fontWeight: h === prepHour || h === nowHour ? 700 : 500 }}>
                  {h === prepHour && <div className={`${big ? "text-[11px]" : "text-[9px]"} uppercase tracking-wider leading-none mb-0.5`}>{t("production.hourly.prep")}</div>}
                  {h === nowHour && <div className={`${big ? "text-[11px]" : "text-[9px]"} uppercase tracking-wider leading-none mb-0.5`}>{t("production.contTotals.now")}</div>}
                  {hourLabel(h)}–{hourLabel(h + 1)}
                </th>
              ))}
              {showAfter && (
                <th className="px-2 py-2 font-medium text-center whitespace-nowrap align-bottom"
                  title={t("production.contTotals.afterHint")}
                  style={{ borderLeft: "2px solid var(--text-3)", color: "#ef4444" }}>{t("production.contTotals.after")}</th>
              )}
              {hasUntimed && (
                <th className="px-2 py-2 font-medium text-center whitespace-nowrap align-bottom" title={t("production.hourly.untimedHint")}
                  style={{ borderLeft: "1px solid var(--border)", color: "#eab308" }}>{t("production.hourly.untimed")}</th>
              )}
              <th className="px-3 py-2 font-semibold text-right whitespace-nowrap align-bottom"
                style={{ borderLeft: "1px solid var(--border)", color: "var(--text-2)" }}>{t("production.cont.total")}</th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k) => {
              const total = cols.reduce((s, h) => s + val(k, h), 0) + (untimed[k] ?? 0)
                + (before[k] ?? 0) + (after[k] ?? 0);
              return (
                <tr key={k}>
                  <td className={`sticky left-0 z-[1] px-3 ${big ? "py-3 max-w-[320px]" : "py-2 max-w-[200px]"} whitespace-nowrap truncate`}
                    title={t(`production.cont.${k}`)}
                    style={{ background: "var(--bg-inner)", color: "var(--text-1)", borderTop: "1px solid var(--border)" }}>
                    {t(`production.cont.${k}`)}
                  </td>
                  {showBefore && (
                    <td className="px-2 py-2 text-center" style={{ ...cellBorder, color: before[k] ? "var(--text-2)" : "var(--text-4)" }}>
                      {before[k] ? fmt(before[k]) : "·"}
                    </td>
                  )}
                  {shown.map((h) => cell(k, h, val(k, h), rowMax[k], false))}
                  {showAfter && (
                    <td className="px-2 py-2 text-center" style={{ ...cellBorder, borderLeft: "2px solid var(--text-3)", color: after[k] ? "#ef4444" : "var(--text-4)" }}>
                      {after[k] ? fmt(after[k]) : "·"}
                    </td>
                  )}
                  {hasUntimed && (
                    <td className="px-2 py-2 text-center"
                      style={{ ...cellBorder, color: untimed[k] ? "#eab308" : "var(--text-4)" }}>
                      {untimed[k] ? fmt(untimed[k]) : "·"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right font-bold" style={{ ...cellBorder, color: "var(--text-1)" }}>{fmt(total)}</td>
                </tr>
              );
            })}
            {/* «Jami» — every container added up for the hour */}
            <tr>
              <td className="sticky left-0 z-[1] px-3 py-2 whitespace-nowrap font-bold"
                style={{ background: "var(--bg-card)", color: "var(--text-1)", borderTop: "2px solid var(--border)" }}>
                {t("production.contTotals.sumRow")}
              </td>
              {showBefore && (
                <td className="px-2 py-2 text-center font-bold"
                  style={{ borderTop: "2px solid var(--border)", borderLeft: "1px solid var(--border)", color: "var(--text-2)" }}>
                  {fmt(keys.reduce((s, k) => s + (before[k] ?? 0), 0))}
                </td>
              )}
              {shown.map((h) => {
                const n = sumH(h);
                return (
                  <td key={h} className={`${big ? "px-3 py-3" : "px-2 py-2"} text-center`}
                    style={{ borderTop: "2px solid var(--border)", borderLeft: "1px solid var(--border)", ...divL(h), ...ring(h, false, true),
                      background: heat(n, sumMax), opacity: past(h) ? 0.55 : 1,
                      color: n ? "var(--text-1)" : "var(--text-4)", fontWeight: 700 }}>
                    {n ? fmt(n) : "·"}
                  </td>
                );
              })}
              {showAfter && (
                <td className="px-2 py-2 text-center font-bold"
                  style={{ borderTop: "2px solid var(--border)", borderLeft: "2px solid var(--text-3)", color: "#ef4444" }}>
                  {fmt(keys.reduce((s, k) => s + (after[k] ?? 0), 0))}
                </td>
              )}
              {hasUntimed && (
                <td className="px-2 py-2 text-center font-bold"
                  style={{ borderTop: "2px solid var(--border)", borderLeft: "1px solid var(--border)", color: "#eab308" }}>
                  {fmt(keys.reduce((s, k) => s + (untimed[k] ?? 0), 0))}
                </td>
              )}
              <td className="px-3 py-2 text-right font-bold"
                style={{ borderTop: "2px solid var(--border)", borderLeft: "1px solid var(--border)", color: "var(--text-1)" }}>
                {fmt(keys.reduce((s, k) => s + cols.reduce((a, h) => a + val(k, h), 0) + (untimed[k] ?? 0)
                  + (before[k] ?? 0) + (after[k] ?? 0), 0))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {!big && <p className="text-[11px] mt-1.5" style={{ color: "var(--text-3)" }}>{t("production.contTotals.hourlyHint")}</p>}
    </>
  );
}
