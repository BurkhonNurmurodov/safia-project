import { useEffect, useMemo, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  TrendingUp, Tag, Building2, Timer, Users, Wrench, UserCog, Boxes,
  AlertTriangle, ClipboardList, Gauge, Hourglass,
} from "lucide-react";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import { SkeletonBlock, SkeletonChart } from "../ui/Skeleton";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { useChartTheme } from "../../hooks/useChartTheme";
import { usePersistentState } from "../../hooks/usePersistentState";
import useIsMobile from "../../hooks/useIsMobile";
import useElementWidth from "../../hooks/useElementWidth";
import { ticksForWidth, axisLabelPx } from "../../utils/chartRange";
import { shortPerson } from "../../utils/personName";
import { C_DONE, C_DOING, C_OVERDUE, C_GREY, hexA } from "../../utils/arcStatus";

// «Tahlil» — the ARC register read as charts. Same tickets, same filters, same
// page as the table (the parent hands its `filters` memo straight through, the
// «by cells» narrowing included), so a figure here is always a count over
// exactly the rows the «Ma'lumotlar» mode would list. The two tabs get two
// different question sets: «Barchasi» reads IT's flow (what breaks, where
// from, how fast, whose crew), «Yacheykalar bo'yicha» reads the org chart
// (whose cells call, which cells are hotspots).
//
// Chart types are picked per question, the Quality page's way: a LINE for the
// two flows over time (they compare, never stack), stacked traffic-light BARS
// for every «what/who/where and how does it stand» ranking — categories,
// divisions, IT brigades, units, cells (green closed · yellow waiting · red
// overdue — the palette every page here already taught) — and a bar with a
// goal marker for speed-vs-allowance, where «the bar crossed the line» IS the
// verdict.

// «Filed» is an EVENT series, not a status, so it takes a categorical hue the
// status palette does not use; «closed» keeps the done-green the whole page
// speaks.
const C_CREATED = "#3b82f6";

// Categories on screen — the backend's `_TOP` for every other ranked bar,
// so the four ranked cards cut their tails at the same place.
const TOP_CATS = 12;

const CARD_CHROME = 78;  // ChartCard around its chart: header + padding + borders
const GRID_GAP = 16;     // gap-4

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

const tpl = (s, vars) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));

// Three-letter month names (the Arc page's own stamp convention).
const MONTHS_SHORT = {
  uz:      ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"],
  uz_cyrl: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
  ru:      ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en:      ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// A trend bucket's axis label: day/week → «25 Avg», month → «Avg 26». The
// bucket key is a plain ISO date, so this never touches timezones.
const fmtBucket = (iso, gran, lang) => {
  const mn = (MONTHS_SHORT[lang] || MONTHS_SHORT.en)[Number(iso.slice(5, 7)) - 1];
  return gran === "month" ? `${mn} ${iso.slice(2, 4)}` : `${Number(iso.slice(8, 10))} ${mn}`;
};

// The chart card — the Quality page's pattern: icon chip + title + one-line
// «how to read me» subtitle + a right slot for the card's own toggle.
// `bodyRef` is the seam a chart measures ITS OWN WIDTH through (see the flow
// card): the body div is the chart's width container and — unlike `children`
// — it is mounted whether or not the card is `ready`, so the width is known
// before Apex ever mounts.
function ChartCard({ icon: Icon, title, subtitle, right, height = 300, empty, emptyText, ready, bodyRef, children }) {
  return (
    <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
      <div className="flex items-center justify-between gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 min-w-0">
          {Icon && (
            <span className="grid place-items-center w-6 h-6 rounded-md flex-shrink-0"
              style={{ background: "var(--brand-bg)", color: "var(--brand-text)" }}>
              <Icon size={13} />
            </span>
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate" style={{ color: "var(--text-1)" }}>{title}</div>
            {subtitle && <div className="text-[11px] truncate" style={{ color: "var(--text-4)" }} title={subtitle}>{subtitle}</div>}
          </div>
        </div>
        {right}
      </div>
      <div ref={bodyRef} className="px-1 py-2 flex-1">
        {empty
          ? <div className="grid place-items-center text-xs" style={{ height, color: "var(--text-4)" }}>{emptyText}</div>
          : ready ? children : <div style={{ height }} />}
      </div>
    </div>
  );
}

// ── the SLA scorecard («Muddat intizomi») ───────────────────────────────────
// IT's «Статистика по заявкам» sheet, redrawn as a UI element: per category —
// received, closed on time, closed late, still in progress, and the mean
// close time — with a 100% meter carrying the same shares the numbers state.
// Every share is OF RECEIVED (the meter's own denominator), so the meter and
// the columns can never disagree; the header labels wear the segment colours,
// so the header IS the legend. A closure the category gives no norm for
// (`ftime` absent → no due date exists) is a washed-green «no verdict» share —
// counted and shown, never painted on-time — and its row answers «—» in the
// two verdict columns rather than a zero that reads as a score. Deliberately
// NOT an Apex chart: a scorecard is rows of aligned numbers, and a component
// owns alignment the way a chart owns axes. (Colour never stands alone here:
// every tinted figure sits under a labelled header or beside its own label.)
const C_NONORM = hexA(C_DONE, 0.4);
const SLA_GRID = "minmax(0,1.4fr) 5rem minmax(6rem,1fr) 6.8rem 7.4rem 6rem 7.6rem";

function SlaMeter({ parts }) {
  const on = parts.filter((p) => p.v > 0);
  if (!on.length) return <div className="h-2.5 rounded-full" style={{ background: "var(--bg-inner)" }} />;
  return (
    <div className="h-2.5 rounded-full overflow-hidden flex gap-px w-full" style={{ background: "var(--bg-inner)" }}>
      {on.map((p, i) => (
        // flexGrow keeps the shares proportional while flexBasis keeps a tiny
        // share visible — a 0.3% segment that renders 0px wide is a fact the
        // reader was shown nowhere.
        <div key={i} title={p.tip} style={{ flexGrow: p.v, flexBasis: 4, background: p.color }} />
      ))}
    </div>
  );
}

function SlaCard({ rows, totals, right }) {
  const { t } = useLang();

  const fmtPct = (v) => {
    const r = Math.round(v * 10) / 10;
    return `${Number.isInteger(r) ? r : r.toFixed(1)}%`;
  };
  // «19.0 soat (0.8 kun)» — the day restatement only once it says something
  // an hour figure does not.
  const fmtAvg = (h) => {
    if (h == null) return "—";
    const hs = h >= 100 ? String(Math.round(h)) : h.toFixed(1);
    const days = h >= 24 ? ` (${(h / 24).toFixed(1)} ${t("arc.slaDays")})` : "";
    return `${hs} ${t("arc.anHours")}${days}`;
  };

  const derive = (r) => {
    const total = r.total || 0;
    const cwd = r.cwd || 0;
    const late = r.late || 0;
    const onTime = Math.max(0, cwd - late);
    const noVerdict = Math.max(0, (r.done || 0) - cwd);
    const open = r.open || 0;
    const cancelled = r.cancelled || 0;
    const overdue = r.overdue || 0;
    const p = (v) => (total ? (100 * v) / total : 0);
    const parts = [
      { v: onTime, color: C_DONE, tip: `${t("arc.slaOnTime")}: ${onTime} (${fmtPct(p(onTime))})` },
      { v: late, color: C_OVERDUE, tip: `${t("arc.slaLate")}: ${late} (${fmtPct(p(late))})` },
      { v: noVerdict, color: C_NONORM, tip: `${t("arc.slaNoDue")}: ${noVerdict}` },
      { v: open, color: C_DOING, tip: `${t("arc.slaOpen")}: ${open}${overdue ? ` · ${t("arc.kOverdue")}: ${overdue}` : ""}` },
      { v: cancelled, color: C_GREY, tip: `${t("arc.stateCancelled")}: ${cancelled}` },
    ];
    return { total, onTime, late, open, p, parts };
  };

  // A zero is shown muted — a bright red «0» drags the eye to nothing.
  const CountPct = ({ v, share, color, dash }) =>
    dash ? (
      <span className="text-right text-xs" style={{ color: "var(--text-4)" }} title={t("arc.anNoNorm")}>—</span>
    ) : !v ? (
      <span className="text-right text-xs tabular-nums" style={{ color: "var(--text-4)" }}>0</span>
    ) : (
      <span className="text-right text-xs tabular-nums whitespace-nowrap">
        <span className="font-semibold" style={{ color }}>{v}</span>
        <span style={{ color: hexA(color, 0.66) }}> · {fmtPct(share)}</span>
      </span>
    );

  const Hd = ({ children, right: r, dot }) => (
    <div className={`flex items-center gap-1.5 text-[10px] uppercase tracking-wide ${r ? "justify-end" : ""}`}
      style={{ color: "var(--text-4)" }}>
      {dot && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dot }} />}
      <span className="truncate">{children}</span>
    </div>
  );

  const DeskRow = ({ name, r, d, bold, noNorm }) => (
    <div className="hidden md:grid items-center gap-3 px-3 py-2" style={{ gridTemplateColumns: SLA_GRID }}>
      <span className={`text-xs truncate ${bold ? "font-bold" : "font-medium"}`}
        style={{ color: "var(--text-1)" }} title={name}>{name}</span>
      <span className={`text-right text-xs tabular-nums ${bold ? "font-bold" : "font-semibold"}`}
        style={{ color: "var(--text-2)" }}>{d.total}</span>
      <SlaMeter parts={d.parts} />
      <CountPct v={d.onTime} share={d.p(d.onTime)} color={C_DONE} dash={noNorm} />
      <CountPct v={d.late} share={d.p(d.late)} color={C_OVERDUE} dash={noNorm} />
      <CountPct v={d.open} share={d.p(d.open)} color={C_DOING} />
      <span className="text-right text-[11px] tabular-nums whitespace-nowrap"
        style={{ color: "var(--text-2)" }}>{fmtAvg(r.avg_h)}</span>
    </div>
  );

  // The header row is hidden on a phone, so every figure brings its own label.
  const MStat = ({ color, label, v, share, dash }) =>
    dash ? null : (
      <span className="inline-flex items-center gap-1 whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        <span style={{ color: "var(--text-4)" }}>{label}</span>
        <span className="font-semibold tabular-nums" style={{ color: v ? color : "var(--text-4)" }}>
          {v}{v && share != null ? ` · ${fmtPct(share)}` : ""}
        </span>
      </span>
    );

  const MobRow = ({ name, r, d, bold, noNorm }) => (
    <div className="md:hidden px-3 py-2.5 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className={`text-xs truncate ${bold ? "font-bold" : "font-medium"}`}
          style={{ color: "var(--text-1)" }}>{name}</span>
        <span className="text-xs tabular-nums font-semibold flex-shrink-0"
          style={{ color: "var(--text-2)" }}>{d.total}</span>
      </div>
      <SlaMeter parts={d.parts} />
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
        <MStat color={C_DONE} label={t("arc.slaOnTime")} v={d.onTime} share={d.p(d.onTime)} dash={noNorm} />
        <MStat color={C_OVERDUE} label={t("arc.slaLate")} v={d.late} share={d.p(d.late)} dash={noNorm} />
        <MStat color={C_DOING} label={t("arc.slaOpen")} v={d.open} share={d.p(d.open)} />
        {noNorm && <span style={{ color: "var(--text-4)" }}>{t("arc.anNoNorm")}</span>}
        <span className="inline-flex items-center gap-1 whitespace-nowrap">
          <span style={{ color: "var(--text-4)" }}>{t("arc.slaAvg")}</span>
          <span className="tabular-nums" style={{ color: "var(--text-2)" }}>{fmtAvg(r.avg_h)}</span>
        </span>
      </div>
    </div>
  );

  const td = totals ? derive(totals) : null;
  return (
    <ChartCard icon={Gauge} title={t("arc.slaTitle")} subtitle={t("arc.slaSub")}
      empty={!rows.length} emptyText={t("arc.noMatch")} ready height={200} right={right}>
      <div className="pb-1">
        <div className="hidden md:grid items-center gap-3 px-3 pt-1 pb-2"
          style={{ gridTemplateColumns: SLA_GRID, borderBottom: "1px solid var(--border)" }}>
          <Hd>{t("arc.fCategory")}</Hd>
          <Hd right>{t("arc.slaIn")}</Hd>
          <span />
          <Hd right dot={C_DONE}>{t("arc.slaOnTime")}</Hd>
          <Hd right dot={C_OVERDUE}>{t("arc.slaLate")}</Hd>
          <Hd right dot={C_DOING}>{t("arc.slaOpen")}</Hd>
          <Hd right>{t("arc.slaAvg")}</Hd>
        </div>
        {rows.map((r, i) => {
          const d = derive(r);
          const noNorm = r.allowed_h == null;
          const name = r.name || t("arc.anUnassigned");
          return (
            <div key={r.id ?? `${name}-${i}`} style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
              <DeskRow name={name} r={r} d={d} noNorm={noNorm} />
              <MobRow name={name} r={r} d={d} noNorm={noNorm} />
            </div>
          );
        })}
        {td && (
          <div style={{ borderTop: "1px solid var(--border)", background: "var(--bg-inner)" }}>
            <DeskRow name={t("arc.slaTotal")} r={totals} d={td} bold />
            <MobRow name={t("arc.slaTotal")} r={totals} d={td} bold />
          </div>
        )}
      </div>
    </ChartCard>
  );
}

// ── the closing-time table («Yopilish vaqti») ────────────────────────────────
// The one card that answers «how long does this kind of request actually take,
// and how long was it MEANT to take». Per category, the mean and the median
// over the hours to close, beside the number of closures they stand on and the
// category's own NORM — `category.ftime`, the allowance every `due` on this
// register is derived over.
//
// Mean and median are shown together because each is wrong on its own and their
// DISAGREEMENT is the answer: a mean far above the median says a handful of
// tickets sat for weeks while the typical one closed fast. Neither is shown
// without the closure count, because an average over three tickets is not an
// average.
//
// The norm is the column that makes the other two mean something. A median of
// 3.1 h is neither good nor bad until the row states what the category was
// given, and it is the ONE number here the register did not measure — it is
// the standard IT files against. It is rendered plainly, in the same hours as
// its neighbours: the verdict «did this category beat its norm» belongs to the
// SLA scorecard and the speed chart, which already say it once each, and a
// third differently-worded verdict is how one page starts disagreeing with
// itself. A category carrying no `ftime` has no norm and says so — it is not
// a norm of zero, and every timeliness figure on this page already excludes it.
//
// Every measured figure counts CLOSED tickets only — an open ticket has no
// closing time yet, and folding it in as a zero would reward a backlog.
const SPD_GRID = "minmax(0,1fr) 5rem 6.4rem 6.4rem 6.4rem";

function SpeedTable({ rows, right }) {
  const { t } = useLang();

  // Bare numbers in the three hour columns — the unit rides in the header, so
  // the digits stay a column a reader can compare down. The day restatement
  // moves into the cell's own tooltip, where it costs no width.
  const num = (h) => (h == null ? "—" : h >= 100 ? String(Math.round(h)) : h.toFixed(1));
  const hoursTip = (h) => {
    if (h == null) return t("arc.spdNoClose");
    const days = h >= 24 ? ` (${(h / 24).toFixed(1)} ${t("arc.slaDays")})` : "";
    return `${num(h)} ${t("arc.anHours")}${days}`;
  };

  // The norm's own tooltip: the allowance restated in days once it runs past
  // one, and the plain fact that a category has none — a «—» in a column of
  // hours otherwise reads as «nobody closed one», which is the column to its
  // left, not this one.
  const normTip = (h) => (h == null ? t("arc.anNoNorm") : hoursTip(h));

  const Hd = ({ children, right: r }) => (
    <div className={`text-[10px] uppercase tracking-wide truncate ${r ? "text-right" : ""}`}
      style={{ color: "var(--text-4)" }}>{children}</div>
  );

  const DeskRow = ({ name, r }) => (
    <div className="hidden md:grid items-center gap-3 px-3 py-2" style={{ gridTemplateColumns: SPD_GRID }}>
      <span className="text-xs font-medium truncate" style={{ color: "var(--text-1)" }} title={name}>{name}</span>
      <span className="text-right text-xs tabular-nums" style={{ color: r.closed_n ? "var(--text-2)" : "var(--text-4)" }}>
        {r.closed_n || 0}
      </span>
      <span className="text-right text-xs tabular-nums font-semibold"
        style={{ color: r.avg_h == null ? "var(--text-4)" : "var(--text-1)" }} title={hoursTip(r.avg_h)}>
        {num(r.avg_h)}
      </span>
      <span className="text-right text-xs tabular-nums font-semibold"
        style={{ color: r.median_h == null ? "var(--text-4)" : "var(--text-1)" }} title={hoursTip(r.median_h)}>
        {num(r.median_h)}
      </span>
      <span className="text-right text-xs tabular-nums"
        style={{ color: r.allowed_h == null ? "var(--text-4)" : "var(--text-2)" }} title={normTip(r.allowed_h)}>
        {num(r.allowed_h)}
      </span>
    </div>
  );

  // The header row is hidden on a phone, so every figure brings its own label —
  // the unit included, beside the value it belongs to rather than once at the
  // end of the line, where «— soat» reads as a measurement of nothing.
  // `none` is the word a missing value gets instead of a dash: on a phone the
  // header is gone, so «Norma —» has to say WHICH nothing it means.
  const MStat = ({ label, h, none }) => (
    <span className="inline-flex items-center gap-1 whitespace-nowrap">
      <span style={{ color: "var(--text-4)" }}>{label}</span>
      {h == null && none
        ? <span style={{ color: "var(--text-4)" }}>{none}</span>
        : (<>
          <span className="font-semibold tabular-nums"
            style={{ color: h == null ? "var(--text-4)" : "var(--text-1)" }}>{num(h)}</span>
          {h != null && <span style={{ color: "var(--text-4)" }}>{t("arc.anHours")}</span>}
        </>)}
    </span>
  );

  const MobRow = ({ name, r }) => (
    <div className="md:hidden px-3 py-2.5 space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs font-medium truncate" style={{ color: "var(--text-1)" }}>{name}</span>
        <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>
          {t("arc.spdClosed")} {r.closed_n || 0}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <MStat label={t("arc.spdMeanShort")} h={r.avg_h} />
        <MStat label={t("arc.spdMedianShort")} h={r.median_h} />
        <MStat label={t("arc.spdNormShort")} h={r.allowed_h} none={t("arc.anNoNorm")} />
      </div>
    </div>
  );

  return (
    <ChartCard icon={Hourglass} title={t("arc.spdTitle")} subtitle={t("arc.spdSub")}
      empty={!rows.length} emptyText={t("arc.noMatch")} ready height={200} right={right}>
      <div className="pb-1">
        <div className="hidden md:grid items-center gap-3 px-3 pt-1 pb-2"
          style={{ gridTemplateColumns: SPD_GRID, borderBottom: "1px solid var(--border)" }}>
          <Hd>{t("arc.fCategory")}</Hd>
          <Hd right>{t("arc.spdClosed")}</Hd>
          <Hd right>{t("arc.spdMean")}</Hd>
          <Hd right>{t("arc.spdMedian")}</Hd>
          <Hd right>{t("arc.spdNorm")}</Hd>
        </div>
        {rows.map((r, i) => {
          const name = r.name || t("arc.anUnassigned");
          return (
            <div key={r.id ?? `${name}-${i}`} style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
              <DeskRow name={name} r={r} />
              <MobRow name={name} r={r} />
            </div>
          );
        })}
      </div>
    </ChartCard>
  );
}

export default function ArcAnalysis({ view, filters, enabled }) {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, gridColor, labelColor, legendColor } = useChartTheme();
  // Below `lg` the grid is ONE column: nothing sits beside anything, so a
  // chart grown to match a row-mate would just be a needlessly tall chart
  // on a phone. Every height below falls back to its own natural size.
  const narrow = useIsMobile(1024);

  // ── the trend's granularity: auto from the picked span, overridable ───────
  // No period = the whole mirror → months; a short window → days. «» = auto,
  // so the default keeps following the period until the reader picks one.
  const span = useMemo(() => {
    if (!filters.date_from || !filters.date_to) return null;
    const d = (new Date(filters.date_to) - new Date(filters.date_from)) / 86400000;
    return Number.isNaN(d) ? null : Math.round(d) + 1;
  }, [filters.date_from, filters.date_to]);
  const autoGran = span == null ? "month" : span <= 92 ? "day" : span <= 400 ? "week" : "month";
  const [granPick, setGranPick] = usePersistentState("arc_an_gran", "");
  const gran = granPick || autoGran;
  // Units chart dimension — brigadir or lider, the Quality «acc» toggle model.
  const [dim, setDim] = usePersistentState("arc_an_dim", "sup");

  const viewKey = view === "cells" ? "cells" : "all";
  const anQ = useQuery({
    queryKey: ["arc-analysis", viewKey, gran, filters],
    queryFn: () => api.get("/api/arc/analysis", { params: { ...filters, view: viewKey, gran } }).then((r) => r.data),
    enabled,
    placeholderData: keepPreviousData,
  });
  const A = anQ.data;
  const loading = anQ.isLoading || (anQ.isFetching && !anQ.data);

  // Apex mounts are heavy; let the frame paint first (the Quality page's rule).
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let raf2;
    const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, []);

  const baseChart = {
    fontFamily: "inherit",
    toolbar: { show: false },
    background: "transparent",
    animations: { enabled: false },
    zoom: { enabled: false },
    selection: { enabled: false },
  };

  // ── flow: filed vs closed per bucket ──────────────────────────────────────
  // The one card on this page with a DATE axis, and the one whose width is not
  // knowable from the code: it is two thirds of the grid on «Barchasi», a third
  // of it in the rail on «Yacheykalar bo'yicha», and a single column on a
  // phone. So it measures itself and thins its own labels — see the xaxis.
  const [flowRef, flowW] = useElementWidth();
  const trend = A?.trend || [];
  const trendLabels = trend.map((b) => fmtBucket(b.d, A?.gran || gran, lang));
  const flowOpts = {
    chart: { ...baseChart, type: "line" },
    theme: chartTheme,
    colors: [C_CREATED, C_DONE],
    stroke: { curve: "smooth", width: 2.5 },
    markers: { size: 0, hover: { size: 4 } },
    dataLabels: { enabled: false },
    xaxis: {
      categories: trendLabels,
      // Thinned to what the card's MEASURED width fits (the fleet-trend rule,
      // utils/chartRange). A fixed 12 was the bug: twelve «29 Дек» anchors need
      // ~670px and this card is ~470px in the rail and narrower still on a
      // phone, so the labels ran into each other on every width but the widest.
      // Apex's hideOverlappingLabels is only the last safety net — on a category
      // axis it drops colliding labels rather than thinning them evenly, which
      // reads as a random subset of the range. Labels stay HORIZONTAL (never
      // Apex's -45° slant, the platform's convention) and no precision is lost:
      // every bucket is still named in the tooltip.
      tickAmount: ticksForWidth(flowW, trendLabels.length, axisLabelPx(trendLabels)),
      tickPlacement: "on",
      labels: {
        style: { colors: labelColor, fontSize: "10px" },
        rotate: 0, rotateAlways: false, hideOverlappingLabels: true, trim: false,
      },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "10px" } } },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 6, right: 10 } },
    legend: { position: "top", horizontalAlign: "right", markers: { radius: 4 }, labels: { colors: legendColor }, fontSize: "11px" },
    tooltip: { theme: chartTheme.mode, shared: true, intersect: false },
  };
  const flowSeries = [
    { name: t("arc.anCreated"), data: trend.map((b) => b.created) },
    { name: t("arc.anClosed"), data: trend.map((b) => b.closed) },
  ];
  const granToggle = (
    <SegmentedToggle size="sm" value={gran} onChange={setGranPick}
      options={[["day", t("arc.anGranDay")], ["week", t("arc.anGranWeek")], ["month", t("arc.anGranMonth")]]} />
  );

  // ── the category ranking ─────────────────────────────────────────────────
  // A donut until v3.50, and it was the wrong shape for this card twice over:
  // a pie is fixed-height by construction, so beside a taller row-mate it left
  // a column of dead space no data could ever fill, and at a phone's width its
  // small slices collapsed into unlabelled slivers. Ranked bars grow with
  // their own row count (the chart IS the card's height), name every category,
  // and — being the page's one traffic-light grammar — answer the second
  // question for free: not just which kind of request dominates, but how much
  // of it is still open or already overdue.
  const cats = A?.categories || [];
  const catTotal = cats.reduce((s, c) => s + (c.total || 0), 0);
  const catRows = cats.slice(0, TOP_CATS);
  const catLabels = catRows.map((c) => c.name || t("arc.anUnassigned"));

  // ── stacked traffic-light rankings (divisions · brigades · units · cells) ─
  // One options builder + one series builder, so «green closed · yellow
  // waiting · red overdue · grey cancelled» reads identically on every chart —
  // learn the legend once, read four charts. The bar's end label is the total.
  const stackSeries = (rows) => [
    { name: t("arc.kDone"), data: rows.map((r) => r.done || 0) },
    { name: t("arc.kOpen"), data: rows.map((r) => Math.max(0, (r.open || 0) - (r.overdue || 0))) },
    { name: t("arc.kOverdue"), data: rows.map((r) => r.overdue || 0) },
    { name: t("arc.stateCancelled"), data: rows.map((r) => r.cancelled || 0) },
  ];
  const stackOpts = (labels) => ({
    chart: { ...baseChart, type: "bar", stacked: true },
    theme: chartTheme,
    colors: [C_DONE, C_DOING, C_OVERDUE, C_GREY],
    plotOptions: {
      bar: {
        horizontal: true, borderRadius: 3, barHeight: "68%",
        dataLabels: { total: { enabled: true, offsetX: 4, style: { fontSize: "10px", fontWeight: 700, color: legendColor } } },
      },
    },
    dataLabels: { enabled: false },
    xaxis: {
      categories: labels,
      labels: { style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 190 } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: { position: "top", horizontalAlign: "right", markers: { radius: 4 }, labels: { colors: legendColor }, fontSize: "11px" },
    tooltip: { theme: chartTheme.mode, shared: true, intersect: false },
  });
  const stackHeight = (n) => Math.max(260, n * 34 + 104);
  // A ranked bar card's height is DICTATED by its row count, so two of them
  // in one row can differ by 500px and neither can be talked out of it. The
  // narrow column is therefore a RAIL of two cards, and the free-height line
  // chart at its foot takes exactly what the tall ranking leaves — the only
  // way this row ends level without a hollow card or a hollow column.
  // CARD_CHROME ≈ ChartCard's header + borders + body padding.
  const railFill = (tall, above) =>
    narrow ? 320 : Math.min(720, Math.max(280, tall - above - CARD_CHROME - GRID_GAP));
  // The same trade one row up: a line chart's height is free, so it adopts the
  // bar chart's beside it rather than leaving half a column empty.
  const matchH = (base, mate) => (narrow ? base : Math.max(base, mate));
  // «top N of M» — what a ranked card is NOT showing, named on the card.
  const topOf = (shown, total) =>
    total > shown ? (
      <span className="text-[11px] tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>
        {tpl(t("arc.anTopOf"), { top: shown, n: total })}
      </span>
    ) : null;

  // ── «Barchasi»: divisions, closing speed vs allowance, IT brigades ────────
  const divs = A?.divisions || [];
  const divLabels = divs.map((d) => d.name || "—");

  const speed = A?.speed || [];
  const speedVerdict = (x) => (x.allowed_h == null ? C_GREY : x.median_h <= x.allowed_h ? C_DONE : C_OVERDUE);
  const speedData = speed.map((x) => ({
    x: x.name || "—",
    y: x.median_h,
    goals: x.allowed_h != null
      ? [{ name: t("arc.anAllowed"), value: x.allowed_h, strokeWidth: 3, strokeHeight: 18, strokeColor: legendColor }]
      : [],
  }));
  const speedOpts = {
    chart: { ...baseChart, type: "bar" },
    theme: chartTheme,
    colors: speed.map(speedVerdict),
    plotOptions: { bar: { horizontal: true, borderRadius: 3, barHeight: "56%", distributed: true } },
    dataLabels: {
      enabled: true, offsetX: 18,
      formatter: (v) => `${v}`,
      style: { fontSize: "10px", fontWeight: 700, colors: ["#fff"] },
      dropShadow: { enabled: false },
    },
    // No xaxis.categories here — the series data is {x, y, goals} and the
    // labels come off its own x, a second list would fight it.
    xaxis: {
      labels: { style: { colors: labelColor, fontSize: "10px" } },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: labelColor, fontSize: "11px" }, maxWidth: 190 } },
    grid: { borderColor: gridColor, strokeDashArray: 3 },
    legend: { show: false },
    tooltip: {
      theme: chartTheme.mode,
      y: { formatter: (v, { dataPointIndex }) => {
        const x = speed[dataPointIndex];
        const base_ = `${v} ${t("arc.anHours")}`;
        return x ? `${base_} · ${tpl(t("arc.anClosedOver"), { n: x.closed })}` : base_;
      } },
    },
  };

  const brig = A?.brigadas || [];
  const brigLabels = brig.map((b) => b.name || t("arc.anUnassigned"));

  // ── «Yacheykalar bo'yicha»: units (brigadir/lider) + hotspot cells ────────
  const units = (dim === "leader" ? A?.leaders : A?.sups) || [];
  const unitLabels = units.map((u) => (u.name ? shortPerson(tl(u.name)) : t("arc.anUnassigned")));
  const unitsN = dim === "leader" ? A?.leaders_n : A?.sups_n;

  const cellRows = A?.cells || [];
  const cellsMap = A?.cells_map || {};
  // A cell axis is its CODE (utils/cellName.js) — the workshop name is never
  // printed. The second fact is the LEADER, shortened like every other person
  // on these axes, so a bar names whom to ask about it.
  const cellLabels = cellRows.map((c) => {
    const leader = tl(cellsMap[c.code]?.leader || "");
    return leader ? `${c.code} · ${shortPerson(leader)}` : c.code;
  });

  // ── frame states ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2 rounded-2xl p-4" style={cardStyle}>
            <SkeletonBlock className="h-3 w-28 mb-4" /><SkeletonChart className="h-64" />
          </div>
          <div className="rounded-2xl p-4" style={cardStyle}>
            <SkeletonBlock className="h-3 w-24 mb-4" /><SkeletonChart className="h-64" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-2xl p-4" style={cardStyle}>
              <SkeletonBlock className="h-3 w-24 mb-4" /><SkeletonChart className="h-56" />
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (anQ.isError) {
    return (
      <div className="rounded-2xl px-4 py-3 text-xs flex items-center justify-between gap-3 flex-wrap"
        style={{ background: hexA(C_OVERDUE, 0.1), color: C_OVERDUE, border: `1px solid ${hexA(C_OVERDUE, 0.33)}` }}>
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <AlertTriangle size={14} className="flex-shrink-0" />
          <span className="min-w-0">{anQ.error?.response?.data?.detail || t("arc.loadFailed")}</span>
        </span>
        <Button size="sm" variant="secondary" onClick={() => anQ.refetch()}>{t("common.retry")}</Button>
      </div>
    );
  }
  // The category rollup counts EVERY filtered row (a NULL category still
  // groups), so a zero total means the filters matched nothing at all — one
  // empty state, not five cards apologising separately. (The trend can still
  // hold zero-filled buckets for a picked period, so it is no test of this.)
  if (A && catTotal === 0) {
    return (
      <div className="rounded-2xl" style={cardStyle}>
        <EmptyState icon={ClipboardList} height="h-56" showUploadLink={false}
          title={t("arc.noMatch")} message={t("arc.anEmptyNote")} />
      </div>
    );
  }

  const catsCard = (
    <ChartCard icon={Tag} title={t("arc.anCats")} subtitle={t("arc.anCatsSub")}
      empty={catRows.length === 0} emptyText={t("arc.noMatch")} ready={ready}
      height={stackHeight(catRows.length)}
      right={topOf(catRows.length, cats.length)}>
      <ReactApexChart options={stackOpts(catLabels)} series={stackSeries(catRows)}
        type="bar" height={stackHeight(catRows.length)} />
    </ChartCard>
  );

  const flowCard = (height) => (
    <ChartCard icon={TrendingUp} title={t("arc.anFlow")} subtitle={t("arc.anFlowSub")}
      empty={trend.length === 0} emptyText={t("arc.noMatch")} ready={ready} height={height}
      right={granToggle} bodyRef={flowRef}>
      <ReactApexChart options={flowOpts} series={flowSeries} type="line" height={height} />
    </ChartCard>
  );

  // Same rows, same cut, same «TOP n / N» as the ranked category bars — the
  // two category cards must never disagree about which categories they read.
  const slaCard = (
    <SlaCard rows={catRows} totals={A?.sla_totals}
      right={topOf(catRows.length, cats.length)} />
  );

  // Third card off the SAME category rows and the SAME cut as the ranked bars
  // and the scorecard — three cards about categories that disagreed about
  // which categories they read would be three cards nobody could reconcile.
  const speedTable = (
    <SpeedTable rows={catRows} right={topOf(catRows.length, cats.length)} />
  );

  if (viewKey === "cells") {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
          <div className="lg:col-span-2">
            <ChartCard icon={dim === "leader" ? UserCog : Wrench}
              title={dim === "leader" ? t("arc.anByLeader") : t("arc.anBySup")}
              subtitle={t("arc.anUnitsSub")}
              empty={units.length === 0} emptyText={t("arc.noMatch")} ready={ready}
              height={stackHeight(units.length)}
              right={
                <div className="flex items-center gap-2 flex-shrink-0">
                  {topOf(units.length, unitsN || units.length)}
                  <SegmentedToggle size="sm" value={dim} onChange={setDim}
                    options={[["sup", t("arc.fSup")], ["leader", t("arc.fLeader")]]} />
                </div>
              }>
              <ReactApexChart options={stackOpts(unitLabels)} series={stackSeries(units)}
                type="bar" height={stackHeight(units.length)} />
            </ChartCard>
          </div>
          <div className="flex flex-col gap-4">
            {catsCard}
            {flowCard(railFill(stackHeight(units.length), stackHeight(catRows.length)))}
          </div>
        </div>
        <ChartCard icon={Boxes} title={t("arc.anCellsTop")} subtitle={t("arc.anCellsTopSub")}
          empty={cellRows.length === 0} emptyText={t("arc.noMatch")} ready={ready}
          height={stackHeight(cellRows.length)}
          right={topOf(cellRows.length, A?.cells_n || cellRows.length)}>
          <ReactApexChart options={stackOpts(cellLabels)} series={stackSeries(cellRows)}
            type="bar" height={stackHeight(cellRows.length)} />
        </ChartCard>
        {slaCard}
        {speedTable}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2">{flowCard(matchH(286, stackHeight(catRows.length)))}</div>
        {catsCard}
      </div>
      {slaCard}
      {speedTable}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <ChartCard icon={Building2} title={t("arc.anDivs")} subtitle={t("arc.anDivsSub")}
          empty={divs.length === 0} emptyText={t("arc.noMatch")} ready={ready}
          height={stackHeight(divs.length)}
          right={topOf(divs.length, A?.divisions_n || divs.length)}>
          <ReactApexChart options={stackOpts(divLabels)} series={stackSeries(divs)}
            type="bar" height={stackHeight(divs.length)} />
        </ChartCard>
        <ChartCard icon={Timer} title={t("arc.anSpeed")} subtitle={t("arc.anSpeedSub")}
          empty={speed.length === 0} emptyText={t("arc.noMatch")} ready={ready}
          height={stackHeight(speed.length)}
          right={topOf(speed.length, A?.speed_n || speed.length)}>
          <ReactApexChart options={speedOpts} series={[{ name: t("arc.anMedian"), data: speedData }]}
            type="bar" height={stackHeight(speed.length) - 34} />
          {/* the verdict legend — the goal marker has no automatic entry */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 justify-center pb-2 px-3">
            {[[C_DONE, t("arc.anFast")], [C_OVERDUE, t("arc.anSlow")], [C_GREY, t("arc.anNoNorm")]].map(([c, l]) => (
              <span key={l} className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-3)" }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c }} />{l}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-3)" }}>
              <span className="w-3 h-0.5 flex-shrink-0" style={{ background: legendColor }} />{t("arc.anAllowed")}
            </span>
          </div>
        </ChartCard>
      </div>
      <ChartCard icon={Users} title={t("arc.anBrig")} subtitle={t("arc.anBrigSub")}
        empty={brig.length === 0} emptyText={t("arc.noMatch")} ready={ready}
        height={stackHeight(brig.length)}
        right={topOf(brig.length, A?.brigadas_n || brig.length)}>
        <ReactApexChart options={stackOpts(brigLabels)} series={stackSeries(brig)}
          type="bar" height={stackHeight(brig.length)} />
      </ChartCard>
    </div>
  );
}
