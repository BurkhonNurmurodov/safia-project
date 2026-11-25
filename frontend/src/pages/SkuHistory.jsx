import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Layers, Wrench, CalendarRange, Users, ListTree, X, RotateCw, Package, Plus, Minus, ArchiveRestore, Hash, ArrowLeftRight } from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import { useFactorySection } from "../components/ui/FactorySelect";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import TableCard, { Th, EmptyRow } from "../components/ui/DataTable";
import Pagination from "../components/ui/Pagination";
import KPICard from "../components/ui/KPICard";
import { ChartCard, Chart, NoChart, StackLegend } from "../components/ui/AnalysisBoard";
import { SkeletonChart, SkeletonBlock } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { useChartTheme } from "../hooks/useChartTheme";
import useElementWidth from "../hooks/useElementWidth";
import { ticksForWidth, axisLabelPx, padChartParams } from "../utils/chartRange";
import { trendGrain, bucketTick, bucketTitle } from "../utils/trendBuckets";
import { useTranslit } from "../utils/transliterate";
import { surnameInitial } from "../utils/personName";
import { tipBox, esc, fill } from "../components/plan/planUtil";
import api from "../utils/api";

// «SKU tarixi» (/sku-history, 2026-11-24) — the «Zagruzka fayli» catalog as a
// LEDGER: what it held at the start of the period, what came in, what went
// out and why, what it holds at the end (backend services/sku_history.py,
// docs/production-catalog.md «SKU tarixi»). Concept: three plain answers —
// how many came in, went out, came back — then when (one line, one set of
// bars) and where (one number per brigadir); every click narrows the register.
// Re-coded / moved are shown only as their net, so the top row adds up.

const NO_LIST = [];
const PAGE = 50;

// One hue per KIND of change, worn everywhere it appears (cards, bars,
// brigadir columns, register). None is a status colour: a removed SKU is not
// «bad».
const HUE = {
  catalog: "#6366f1",
  new: "#3b82f6", restored: "#a855f7", recoded: "#14b8a6", moved: "#ec4899",
  removed: "#f97316", deleted: "#b45309",
};
const KIND_ICON = { new: Plus, restored: ArchiveRestore, removed: Minus, recoded: Hash, moved: ArrowLeftRight };
const KIND_HUE = {
  new: HUE.new, restored: HUE.restored, recoded: HUE.recoded,
  moved_in: HUE.moved, moved_out: HUE.moved, removed: HUE.removed,
};
const LOCAL = "~";
const isLocal = (k) => !!k && k.startsWith(LOCAL);
const fmtN = (n) => Number(n || 0).toLocaleString("ru-RU");
const sign = (n) => (n > 0 ? `+${fmtN(n)}` : n < 0 ? `−${fmtN(-n)}` : "0");

// The register's filter groups: what a bridge row / toggle segment selects.
const GROUP_OF = { new: "new", restored: "restored", recoded: "recoded", moved_in: "moved", moved_out: "moved", removed: "removed" };
const GROUPS = ["new", "restored", "recoded", "moved", "removed"];

export default function SkuHistory() {
  const { t } = useLang();
  const { tl, tx, lang } = useTranslit();
  const { params, ready, dateFrom, dateTo, setDateFrom, setDateTo, shift, setShift } = useFilters();
  const factorySection = useFactorySection();
  const [brigSel, setBrigSel] = usePersistentState("skuh_brig", NO_LIST);

  const base = useMemo(() => {
    const p = {};
    if (params.date_from) p.date_from = params.date_from;
    if (params.date_to) p.date_to = params.date_to;
    if (shift) p.shift = shift;
    if (brigSel.length) p.manager_id = brigSel;
    return p;
  }, [params.date_from, params.date_to, shift, brigSel]);
  const reqParams = useFactoryParams(base);
  const { data, isPending, isPlaceholderData, isError, refetch } = useQuery({
    queryKey: ["sku-history", reqParams],
    queryFn: () => api.get("/api/sku-history", { params: reqParams }).then((r) => r.data),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  // The time chart never spans fewer than 7 days (utils/chartRange.js): a
  // shorter period asks for a padded window; everything else keeps the pick.
  const chartParams = useMemo(() => padChartParams(reqParams), [reqParams]);
  const padded = chartParams !== reqParams;
  const { data: chartData } = useQuery({
    queryKey: ["sku-history", chartParams],
    queryFn: () => api.get("/api/sku-history", { params: chartParams }).then((r) => r.data),
    enabled: ready && padded,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const fmtD = (iso) => {
    if (!iso) return "";
    const y = iso.slice(0, 4);
    const s = `${Number(iso.slice(8, 10))} ${t(`cal.mg${Number(iso.slice(5, 7)) - 1}`)}`;
    return y === String(new Date().getFullYear()) ? s : `${s} ${y}`;
  };

  // ── scope: plant → shift → brigadir ──────────────────────────────────────
  const scopeUnits = data?.scope_units || NO_LIST;
  const unitById = useMemo(() => new Map(scopeUnits.map((u) => [u.manager_id, u])), [scopeUnits]);
  const unitName = (id) => tl(unitById.get(id)?.name || "");
  const brigOpts = useMemo(() => scopeUnits
    .filter((u) => !shift || u.shift === shift)
    .sort((a, b) => tl(a.name).localeCompare(tl(b.name)))
    .map((u) => u.manager_id), [scopeUnits, shift, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data) return;
    const ok = new Set(brigOpts);
    if (brigSel.some((id) => !ok.has(id))) setBrigSel(brigSel.filter((id) => ok.has(id)));
  }, [brigOpts]); // eslint-disable-line react-hooks/exhaustive-deps

  const sections = [
    ...(factorySection ? [factorySection] : []),
    {
      key: "shift", icon: Layers, label: t("filter.shift"),
      active: shift != null, display: shift != null ? `S${shift}` : "",
      onClear: () => setShift(null),
      render: () => (
        <SegmentedToggle fill value={shift} onChange={setShift}
          options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]} />
      ),
    },
    {
      key: "brig", icon: Wrench, label: t("plan.fBrig"),
      active: brigSel.length > 0,
      display: brigSel.length === 1 ? surnameInitial(unitName(brigSel[0])) : brigSel.length ? fill(t("plan.nSelected"), { n: brigSel.length }) : "",
      onClear: () => setBrigSel([]),
      render: () => (
        <OptsFilter searchable opts={brigOpts} sel={brigSel} onChange={setBrigSel}
          labelOf={unitName} render={unitName}
          note={shift ? fill(t("plan.narrowedBy"), { x: `${t("filter.shift")} ${shift}`, n: brigOpts.length }) : null} />
      ),
    },
  ];

  // ── the register's own narrowing (bridge rows, chart columns, brigadir rows)
  // A chart pick belongs to the scope it was made in, and the page number to
  // the filters it was turned under: each is read back only while those hold,
  // so a new scope or filter starts clean without an effect.
  const scopeKey = JSON.stringify(reqParams);
  const [kind, setKind] = useState("all");
  const [rangeAt, setRangeAt] = useState({ at: scopeKey, v: null });   // {from, to} — a column of the time chart
  const [unitAt, setUnitAt] = useState({ at: scopeKey, v: null });     // a brigadir row
  const range = rangeAt.at === scopeKey ? rangeAt.v : null;
  const unit = unitAt.at === scopeKey ? unitAt.v : null;
  const setRange = (v) => setRangeAt({ at: scopeKey, v });
  const setUnit = (v) => setUnitAt({ at: scopeKey, v });
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ key: "date", dir: "desc" });
  const sig = JSON.stringify([kind, range, unit, q, sort, scopeKey]);
  const [pageAt, setPageAt] = useState({ at: sig, n: 1 });
  const page = pageAt.at === sig ? pageAt.n : 1;
  const setPage = (n) => setPageAt({ at: sig, n });
  const registerRef = useRef(null);
  const toRegister = () => {
    const smooth = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    registerRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  };
  const pickKind = (k) => { setKind((cur) => (cur === k ? "all" : k)); toRegister(); };
  const pickRange = (r) => { setRange(r); toRegister(); };
  const pickUnit = (m) => { setUnit(unit === m ? null : m); toRegister(); };

  const beforeFloor = data && !data.date_from;
  const endLabel = data && (data.date_to === data.today ? t("skuh.today") : fill(t("skuh.asOf"), { d: fmtD(data.date_to) }));

  return (
    <Layout title={t("skuh.title")}>
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <DateRangePicker
          dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
          compactLabel triggerClassName="px-3 py-2 text-sm"
        />
        <FilterPanel sections={sections} />
      </div>

      {isError && !data ? (
        <EmptyState title={t("plan.loadError")} message={t("plan.loadErrorMsg")} showUploadLink={false}
          action={<Button size="sm" variant="secondary" onClick={() => refetch()}><RotateCw size={12} /> {t("plan.retry")}</Button>} />
      ) : isPending || !data ? (
        <div className="space-y-4">
          <SkeletonBlock className="h-28 rounded-2xl" />
          <SkeletonChart className="h-96" />
          <SkeletonBlock className="h-64 rounded-2xl" />
        </div>
      ) : beforeFloor ? (
        <EmptyState title={t("skuh.title")} message={fill(t("skuh.beforeFloor"), { d: fmtD(data.floor) })} showUploadLink={false} />
      ) : (
        <div className="space-y-4 lg:space-y-6" style={{ opacity: isPlaceholderData ? 0.6 : 1, transition: "opacity 150ms" }} aria-busy={isPlaceholderData}>
          <Summary data={data} t={t} endLabel={endLabel} onPick={pickKind} />
          <TimeCard data={data} chart={padded && chartData?.days ? chartData : data} t={t} fmtD={fmtD} range={range} onPick={pickRange} />
          <UnitsCard data={data} t={t} unitName={unitName} unitById={unitById} unit={unit} onPick={pickUnit} endLabel={endLabel} />
          <div ref={registerRef} style={{ scrollMarginTop: 72 }}>
            <Register data={data} t={t} tx={tx} fmtD={fmtD} unitName={unitName}
              kind={kind} setKind={setKind} range={range} setRange={setRange}
              unit={unit} setUnit={setUnit} q={q} setQ={setQ}
              sort={sort} setSort={setSort} page={page} setPage={setPage} />
          </div>
        </div>
      )}
    </Layout>
  );
}

// ── the answer: the catalog now, and what came in, went out, came back ──────
// Re-coded / moved show only when they happened, as their NET, so the row
// adds up: start + every card = now.
function Summary({ data, t, endLabel, onPick }) {
  const T = data.totals;
  const cards = [
    ["new", T.new, true],
    ["restored", T.restored, true],
    ["removed", -T.removed, true],
    ["recoded", T.recoded_in - T.recoded_out, T.recoded_in + T.recoded_out > 0],
    ["moved", T.moved_in - T.moved_out, T.moved_in + T.moved_out > 0],
  ].filter(([, , show]) => show);
  // Two per row on a phone: the catalog card takes a row of its own when the
  // rest would otherwise leave one card alone.
  const grid = { 3: "lg:grid-cols-4", 4: "xl:grid-cols-5", 5: "xl:grid-cols-6" }[cards.length];
  return (
    <div className={`grid grid-cols-2 ${grid} gap-3`}>
      <KPICard className={cards.length % 2 === 0 ? "col-span-2 xl:col-span-1" : ""} size="lg"
        icon={Package} color={HUE.catalog} valueColor="var(--text-1)"
        label={`${t("skuh.inCatalog")} · ${endLabel}`} value={fmtN(data.end.total)}
        sub={`${t("skuh.start")}: ${fmtN(data.start.total)}`} />
      {cards.map(([k, v]) => (
        <KPICard key={k} icon={KIND_ICON[k]} color={HUE[k]} valueColor="var(--text-1)"
          label={t(`skuh.k.${k}`)} value={sign(v)} onValueClick={v ? () => onPick(k) : undefined} />
      ))}
    </div>
  );
}

// ── when: the catalog's size, and what came in and went out ───────────────────
function TimeCard({ data, chart, t, fmtD, range, onPick }) {
  const { gridColor, labelColor, chartTheme } = useChartTheme();
  const [ref, w] = useElementWidth();
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let r2 = 0;
    const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setReady(true)); });
    return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
  }, []);

  const grain = trendGrain(chart.days.length);
  const points = useMemo(() => {
    if (grain === "day") return chart.days.map((d) => ({ ...d, day: d.date, from: d.date, to: d.date }));
    const out = [];
    let cur = null;
    for (const d of chart.days) {
      const dt = new Date(`${d.date}T00:00:00`);
      const key = grain === "week"
        ? new Date(dt.getTime() - ((dt.getDay() + 6) % 7) * 86400000).toDateString()
        : d.date.slice(0, 7);
      if (!cur || cur.key !== key) {
        cur = { key, day: d.date, from: d.date, to: d.date, new: 0, restored: 0, removed: 0, moved_in: 0, moved_out: 0, recoded_in: 0, recoded_out: 0 };
        out.push(cur);
      }
      cur.to = d.date;
      cur.total = d.total;
      cur.coded = d.coded;
      ["new", "restored", "removed", "moved_in", "moved_out", "recoded_in", "recoded_out"].forEach((k) => { cur[k] += d[k]; });
    }
    return out;
  }, [chart.days, grain]);
  const cats = points.map((p) => bucketTick(p.day, grain));
  const tickAmount = ticksForWidth(w, cats.length, axisLabelPx(cats));
  // Three bars only: in above the zero line, out below it. Re-coded / moved
  // are no bars — the tooltip names them, so a step in the line is explained.
  const kinds = [
    { key: "new", sign: 1, get: (p) => p.new },
    { key: "restored", sign: 1, get: (p) => p.restored },
    { key: "removed", sign: -1, get: (p) => p.removed },
  ];
  const used = kinds.filter((s) => points.some((p) => s.get(p) > 0));
  const flowSeries = used.map((s) => ({ name: t(`skuh.k.${s.key}`), data: points.map((p) => s.sign * s.get(p)) }));
  const tip = (i) => {
    const p = points[i];
    if (!p) return "";
    const nets = [["recoded", p.recoded_in - p.recoded_out, p.recoded_in + p.recoded_out], ["moved", p.moved_in - p.moved_out, p.moved_in + p.moved_out]];
    return tipBox(esc(bucketTitle(p, grain, fmtD, t)), [
      [t("skuh.inCatalog"), fmtN(p.total), HUE.catalog],
      ...kinds.filter((s) => s.get(p) > 0).map((s) => [esc(t(`skuh.k.${s.key}`)), sign(s.sign * s.get(p)), HUE[s.key]]),
      ...nets.filter(([, , n]) => n > 0).map(([k, v]) => [esc(t(`skuh.k.${k}`)), sign(v), HUE[k]]),
    ]);
  };
  // The line's axis fits the catalog: hundreds of SKUs moving by tens would
  // be a flat line drawn from zero.
  const totals = points.map((p) => p.total);
  const lo = Math.min(...totals), hi = Math.max(...totals);
  const pad = Math.max(5, (hi - lo) * 0.2);
  const yMin = Math.max(0, Math.floor((lo - pad) / 10) * 10), yMax = Math.ceil((hi + pad) / 10) * 10;
  const xaxis = {
    categories: cats, tickAmount,
    labels: { rotate: 0, rotateAlways: false, hideOverlappingLabels: true, style: { colors: labelColor, fontSize: "10px" } },
    axisBorder: { color: gridColor }, axisTicks: { show: false }, tooltip: { enabled: false },
  };
  const yLabels = { minWidth: 40, maxWidth: 40, style: { colors: labelColor, fontSize: "10px" } };
  const common = {
    theme: chartTheme,
    grid: { borderColor: gridColor, strokeDashArray: 0, padding: { left: 6, right: 10 } },
    legend: { show: false }, dataLabels: { enabled: false },
    tooltip: { custom: ({ dataPointIndex }) => tip(dataPointIndex) },
  };
  // Each chart its own axis object: Apex writes into the options it is given.
  const ownAxis = () => ({ ...xaxis, labels: { ...xaxis.labels, style: { ...xaxis.labels.style } } });
  // Two charts, never an Apex `group`: a grouped chart's updateOptions is
  // copied onto its siblings, and the size chart turned into the flow's bars.
  const sizeOpts = {
    ...common,
    chart: { id: "skuh-size", type: "area", background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, parentHeightOffset: 0 },
    xaxis: ownAxis(),
    colors: [HUE.catalog],
    stroke: { curve: "straight", width: 2.5 },
    fill: { type: "solid", opacity: 0.12 },
    markers: { size: 0, hover: { size: 4 } },
    yaxis: { min: yMin, max: yMax, tickAmount: 4, labels: { ...yLabels, formatter: (v) => fmtN(Math.round(v)) } },
  };
  const selIdx = range ? points.findIndex((p) => p.from <= range.from && range.from <= p.to) : -1;
  const flowOpts = {
    ...common,
    chart: {
      id: "skuh-flow", type: "bar", stacked: true, background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, parentHeightOffset: 0,
      events: {
        dataPointSelection: (_e, _c, cfg) => {
          // A padded column before the period holds nothing the register lists.
          const p = points[cfg.dataPointIndex];
          if (p && p.to >= data.date_from) {
            onPick({ from: p.from < data.date_from ? data.date_from : p.from, to: p.to > data.date_to ? data.date_to : p.to });
          }
        },
      },
    },
    xaxis: ownAxis(),
    colors: used.map((s) => HUE[s.key]),
    plotOptions: { bar: { columnWidth: points.length > 40 ? "85%" : "60%", borderRadius: 2, borderRadiusApplication: "end", borderRadiusWhenStacked: "last" } },
    states: { active: { filter: { type: "none" } } },
    yaxis: { labels: { ...yLabels, formatter: (v) => (v < 0 ? `−${fmtN(Math.round(-v))}` : fmtN(Math.round(v))) } },
    annotations: {
      yaxis: [{ y: 0, borderColor: labelColor, strokeDashArray: 0 }],
      xaxis: selIdx >= 0 ? [{ x: cats[selIdx], borderColor: labelColor, strokeDashArray: 3 }] : [],
    },
  };
  const flowLegend = used.map((s) => ({ key: s.key, label: t(`skuh.k.${s.key}`), color: HUE[s.key] }));
  const title = (text, color) => (
    <div className="flex items-center gap-2 px-3 text-[13px] font-medium" style={{ color: "var(--text-1)" }}>
      {color && <span aria-hidden className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />}{text}
    </div>
  );

  return (
    <ChartCard icon={CalendarRange} title={t(`skuh.when.${grain}`)}>
      <div ref={ref} className="px-2 pt-3 pb-2 apx-bare-tip">
        {title(t("skuh.inCatalog"), HUE.catalog)}
        <Chart ready={ready} height={180} type="area" options={sizeOpts}
          series={[{ name: t("skuh.inCatalog"), data: totals }]} />
        <div className="mt-2 pt-3" style={{ borderTop: "1px solid var(--border)" }}>{title(t("skuh.inOut"))}</div>
        {used.length ? (
          <>
            <Chart ready={ready} height={210} type="bar" options={flowOpts} series={flowSeries} />
            <StackLegend parts={flowLegend} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3" />
          </>
        ) : <NoChart height={160} text={t("skuh.noChanges")} />}
      </div>
    </ChartCard>
  );
}

// ── where: how many came in, went out, came back — per brigadir ───────────────
const UNIT_COLS = ["new", "restored", "removed"];
const touched = (u) => u.new + u.restored + u.removed;

function UnitsCard({ data, t, unitName, unitById, unit, onPick, endLabel }) {
  const rows = (data.units || [])
    .filter((u) => touched(u) > 0)
    .sort((a, b) => touched(b) - touched(a) || unitName(a.manager_id).localeCompare(unitName(b.manager_id)));
  if ((data.units || []).length < 2 || !rows.length) return null;
  // Phone: the three counts under their icons; the catalog column from sm up.
  const grid = "grid grid-cols-[minmax(0,1fr)_repeat(3,3rem)] sm:grid-cols-[minmax(0,1fr)_repeat(3,7.5rem)_7.5rem] items-center gap-x-2 sm:gap-x-4 px-4";
  const num = (v) => (v
    ? <span className="text-[14px] font-semibold" style={{ color: "var(--text-1)" }}>{fmtN(v)}</span>
    : <span style={{ color: "var(--text-4)" }}>—</span>);

  return (
    <ChartCard icon={Users} title={t("skuh.byUnit")}
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(t("skuh.nUnits"), { n: rows.length })}</span>}>
      <div className={`${grid} pt-2 pb-2 text-[11px] font-medium`} style={{ color: "var(--text-3)" }}>
        <span>{t("plan.fBrig")}</span>
        {UNIT_COLS.map((k) => {
          const Icon = KIND_ICON[k];
          return (
            <span key={k} className="flex items-center justify-end gap-1.5 min-w-0" title={t(`skuh.k.${k}`)}>
              <span aria-hidden className="grid place-items-center w-5 h-5 rounded-md flex-shrink-0" style={{ background: `${HUE[k]}24`, color: HUE[k] }}>
                <Icon size={12} strokeWidth={2.6} />
              </span>
              <span className="max-sm:sr-only truncate">{t(`skuh.k.${k}`)}</span>
            </span>
          );
        })}
        <span className="hidden sm:block text-right truncate">{endLabel}</span>
      </div>
      <div className="pb-2">
        {rows.map((u) => {
          const on = unit === u.manager_id;
          const archived = unitById.get(u.manager_id)?.archived;
          return (
            <button key={u.manager_id} type="button" aria-pressed={on} onClick={() => onPick(u.manager_id)}
              className={`w-full ${grid} min-h-[44px] py-2 text-left tabular-nums transition-colors hover:bg-[var(--bg-inner)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]`}
              style={on ? { background: "var(--bg-inner)", boxShadow: "inset 3px 0 0 var(--text-2)" } : undefined}>
              <span className="truncate text-[13px] font-medium" style={{ color: archived ? "var(--text-3)" : "var(--text-1)" }}>{unitName(u.manager_id)}</span>
              {UNIT_COLS.map((k) => <span key={k} className="text-right">{num(u[k])}</span>)}
              <span className="hidden sm:block text-right text-[13px]" style={{ color: "var(--text-2)" }}>{fmtN(u.end)}</span>
            </button>
          );
        })}
      </div>
    </ChartCard>
  );
}

// ── which: every change, one row each ─────────────────────────────────────────
function changeLabel(e, t) {
  if (e.kind === "removed") return t(e.how === "deleted" ? "skuh.e.deleted" : "skuh.e.archived");
  if (e.kind === "recoded") {
    const a = isLocal(e.from_key), b = isLocal(e.key);
    return t(a && !b ? "skuh.e.codeGiven" : !a && b ? "skuh.e.codeTaken" : a && b ? "skuh.e.renamed" : "skuh.e.codeChanged");
  }
  return t(`skuh.e.${e.kind}`);
}
const eventHue = (e) => (e.kind === "removed" && e.how === "deleted" ? HUE.deleted : KIND_HUE[e.kind]);

function KindLabel({ e, t }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: eventHue(e) }} />
      {changeLabel(e, t)}
    </span>
  );
}

function Register({ data, t, tx, fmtD, unitName, kind, setKind, range, setRange, unit, setUnit, q, setQ, sort, setSort, page, setPage }) {
  const events = data.events || NO_LIST;
  const code = (k) => (isLocal(k) ? "" : k);
  const needle = q.trim().toLowerCase();
  const base = useMemo(() => events.filter((e) => (!range || (e.date >= range.from && e.date <= range.to))
    && (unit == null || e.manager_id === unit)
    && (!needle || `${e.key} ${e.from_key || ""} ${tx(e.name)} ${tx(e.from_name || "")}`.toLowerCase().includes(needle))),
  [events, range, unit, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => {
    const c = {};
    base.forEach((e) => { const g = GROUP_OF[e.kind]; c[g] = (c[g] || 0) + 1; });
    return c;
  }, [base]);
  const rows = useMemo(() => {
    const r = kind === "all" ? base : base.filter((e) => GROUP_OF[e.kind] === kind);
    const val = {
      date: (e) => e.date, sku: (e) => code(e.key) || `~${e.name}`, name: (e) => tx(e.name).toLowerCase(),
      unit: (e) => unitName(e.manager_id).toLowerCase(), wc: (e) => e.wc,
    }[sort.key];
    const keyed = r.map((e) => [val(e), e]);
    keyed.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0) * (sort.dir === "asc" ? 1 : -1));
    return keyed.map(([, e]) => e);
  }, [base, kind, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE));
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const onSort = (k) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" } : { key: k, dir: k === "date" ? "desc" : "asc" }));

  const kindOpts = [
    ["all", <span key="all">{t("skuh.all")} <b className="tabular-nums">{fmtN(base.length)}</b></span>],
    ...GROUPS.filter((g) => counts[g] || kind === g).map((g) => [g, (
      <span key={g} className="inline-flex items-center gap-1.5">
        <span aria-hidden className="w-2 h-2 rounded-[2px]" style={{ background: HUE[g] }} />
        {t(`skuh.k.${g}`)} <b className="tabular-nums">{fmtN(counts[g] || 0)}</b>
      </span>
    )]),
  ];
  const rangeLabel = range ? (range.from === range.to ? fmtD(range.from) : `${fmtD(range.from)} – ${fmtD(range.to)}`) : null;

  const skuCell = (e) => {
    if (e.kind !== "recoded") return code(e.key) || <span style={{ color: "var(--text-4)" }}>—</span>;
    return (
      <span className="inline-flex items-center gap-1">
        <span style={{ color: "var(--text-3)" }}>{code(e.from_key) || t("skuh.noCodeShort")}</span>
        <span style={{ color: "var(--text-4)" }}>→</span>
        <span>{code(e.key) || t("skuh.noCodeShort")}</span>
      </span>
    );
  };
  const nameTitle = (e) => (e.kind === "recoded" && e.from_name && e.from_name !== e.name ? `${tx(e.from_name)} → ${tx(e.name)}` : tx(e.name));

  const mobile = (
    <div className="divide-y" style={{ borderColor: "var(--border)" }}>
      {shown.length === 0 && <div className="px-4 py-10 text-center text-xs" style={{ color: "var(--text-3)" }}>{t("skuh.noneMatch")}</div>}
      {shown.map((e, i) => (
        <div key={`${e.date}|${e.kind}|${e.from_key || ""}|${e.key}|${i}`} className="px-4 py-3 space-y-1" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="font-medium min-w-0 truncate" style={{ color: "var(--text-1)" }}><KindLabel e={e} t={t} /></span>
            <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-3)" }}>{fmtD(e.date)}</span>
          </div>
          <div className="text-[13px] truncate" style={{ color: "var(--text-1)" }} title={nameTitle(e)}>{tx(e.name)}</div>
          <div className="flex items-center justify-between gap-3 text-[11px]" style={{ color: "var(--text-3)" }}>
            <span className="font-mono truncate min-w-0">{skuCell(e)}</span>
            <span className="truncate min-w-0 text-right">{unitName(e.manager_id)}{e.wc ? ` · ${e.wc}` : ""}</span>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <>
      <TableCard icon={ListTree} title={t("skuh.changes")}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fmtN(rows.length)}</span>}
        toolbar={(
          <>
            <SegmentedToggle value={kind} onChange={setKind} options={kindOpts} ariaLabel={t("skuh.changes")} />
            {rangeLabel && (
              <Button size="lg" variant="secondary" onClick={() => setRange(null)} aria-label={`${rangeLabel} — ${t("skuh.clear")}`}>
                {rangeLabel} <X size={14} />
              </Button>
            )}
            {unit != null && (
              <Button size="lg" variant="secondary" onClick={() => setUnit(null)} aria-label={`${unitName(unit)} — ${t("skuh.clear")}`}>
                <span className="max-w-[12rem] truncate">{unitName(unit)}</span> <X size={14} />
              </Button>
            )}
            <div className="w-full sm:w-64 sm:ml-auto">
              <SearchInput value={q} onChange={setQ} placeholder={t("skuh.search")} />
            </div>
          </>
        )}
        mobile={mobile}>
        <thead>
          <tr>
            <Th label={t("skuh.col.date")} k="date" sort={sort} onSort={onSort} />
            <Th label={t("skuh.col.change")} />
            <Th label={t("skuh.col.sku")} k="sku" sort={sort} onSort={onSort} />
            <Th label={t("skuh.col.name")} k="name" sort={sort} onSort={onSort} />
            <Th label={t("plan.fBrig")} k="unit" sort={sort} onSort={onSort} />
            <Th label={t("production.col.wc")} k="wc" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <EmptyRow colSpan={6}><span className="text-xs" style={{ color: "var(--text-3)" }}>{t("skuh.noneMatch")}</span></EmptyRow>
          ) : shown.map((e, i) => (
            <tr key={`${e.date}|${e.kind}|${e.from_key || ""}|${e.key}|${i}`}>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>{fmtD(e.date)}</td>
              <td className="px-3 py-2"><KindLabel e={e} t={t} /></td>
              <td className="px-3 py-2 font-mono">{skuCell(e)}</td>
              <td className="px-3 py-2 max-w-[22rem] truncate" title={nameTitle(e)}>{tx(e.name)}</td>
              <td className="px-3 py-2 max-w-[14rem] truncate" style={{ color: "var(--text-2)" }}>{unitName(e.manager_id)}</td>
              <td className="px-3 py-2 font-mono" style={{ color: "var(--text-2)" }}>{e.wc || "—"}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      <div className="mt-3">
        <Pagination page={page} pageCount={pageCount} total={rows.length} pageSize={PAGE} onPage={setPage} />
      </div>
    </>
  );
}
