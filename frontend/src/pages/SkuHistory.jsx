import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Layers, Wrench, Scale, CalendarRange, Users, ListTree, X, RotateCw } from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import { useFactorySection } from "../components/ui/FactorySelect";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import TableCard, { Th, EmptyRow, SectionHead } from "../components/ui/DataTable";
import Pagination from "../components/ui/Pagination";
import { SplitLegend } from "../components/ui/Meter";
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
// docs/production-catalog.md «SKU tarixi»). Concept: the bridge is the answer
// (start → +new → +restored → re-coded → moved → −removed → end), the rest
// says when, where and which — every chart click narrows the register.

const NO_LIST = [];
const PAGE = 50;

// One hue per KIND of change, worn everywhere it appears (bridge, columns,
// brigadir bars, register). None is a status colour: a removed SKU is not
// «bad». Coded SKUs share the re-coding hue — a re-code is a code-less line
// turning coded.
const HUE = {
  new: "#3b82f6", restored: "#a855f7", recoded: "#14b8a6", moved: "#ec4899",
  removed: "#f97316", deleted: "#b45309", coded: "#14b8a6", nocode: "#94a3b8",
};
const KIND_HUE = {
  new: HUE.new, restored: HUE.restored, recoded: HUE.recoded,
  moved_in: HUE.moved, moved_out: HUE.moved, removed: HUE.removed,
};
const LOCAL = "~";
const isLocal = (k) => !!k && k.startsWith(LOCAL);
const fmtN = (n) => Number(n || 0).toLocaleString("ru-RU");
const sign = (n) => (n > 0 ? `+${fmtN(n)}` : n < 0 ? `−${fmtN(-n)}` : "0");
const dayNo = (iso) => Date.parse(`${iso}T00:00:00Z`) / 86400000;

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
          <SkeletonBlock className="h-80 rounded-2xl" />
          <SkeletonChart className="h-96" />
          <SkeletonBlock className="h-64 rounded-2xl" />
        </div>
      ) : beforeFloor ? (
        <EmptyState title={t("skuh.title")} message={fill(t("skuh.beforeFloor"), { d: fmtD(data.floor) })} showUploadLink={false} />
      ) : (
        <div className="space-y-4 lg:space-y-6" style={{ opacity: isPlaceholderData ? 0.6 : 1, transition: "opacity 150ms" }} aria-busy={isPlaceholderData}>
          <Bridge data={data} t={t} fmtD={fmtD} kind={kind} onPick={pickKind} />
          <TimeCard data={data} chart={padded && chartData?.days ? chartData : data} t={t} fmtD={fmtD} range={range} onPick={pickRange} />
          <UnitsCard data={data} t={t} unitName={unitName} unitById={unitById} unit={unit} onPick={pickUnit} />
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

function TotalRow({ label, sub, size, big, pct, t }) {
  return (
    <div className={`grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,13rem)_1fr_7rem] items-center gap-x-3 sm:gap-x-4 gap-y-1.5 px-3 sm:px-6 ${big ? "py-3" : "py-2.5"}`}>
      <div className="min-w-0">
        <div className={`truncate ${big ? "text-sm font-semibold" : "text-[13px] font-medium"}`} style={{ color: "var(--text-1)" }}>{label}</div>
        {sub && <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{sub}</div>}
      </div>
      <div className="relative col-span-2 order-last sm:col-span-1 sm:order-none" style={{ height: big ? 16 : 12 }} role="img"
        aria-label={`${label}: ${fmtN(size.total)} — ${t("skuh.coded")} ${fmtN(size.coded)}, ${t("skuh.nocode")} ${fmtN(size.total - size.coded)}`}>
        <div className="absolute inset-y-0 left-0 flex gap-[2px] rounded-[4px] overflow-hidden" style={{ width: pct(size.total) }}>
          {size.coded > 0 && <div style={{ flex: `${size.coded} 1 0%`, background: HUE.coded }} />}
          {size.total - size.coded > 0 && <div style={{ flex: `${size.total - size.coded} 1 0%`, background: HUE.nocode }} />}
        </div>
      </div>
      <div className="text-right tabular-nums whitespace-nowrap">
        <span className={big ? "text-[24px] sm:text-[28px] leading-none font-semibold" : "text-[15px] font-semibold"} style={{ color: "var(--text-1)" }}>{fmtN(size.total)}</span>
        <span className="text-[11px] ml-1" style={{ color: "var(--text-3)" }}>{t("skuh.sku")}</span>
      </div>
    </div>
  );
}

// ── the bridge: start → each kind of change → end ─────────────────────────────
function Bridge({ data, t, fmtD, kind, onPick }) {
  const T = data.totals, S = data.start, E = data.end;
  const steps = [];
  let run = S.total;
  const step = (key, delta, sub, active) => {
    if (!active) return;
    steps.push({ key, from: run, to: run + delta, delta, sub });
    run += delta;
  };
  step("new", T.new, null, T.new > 0);
  step("restored", T.restored, null, T.restored > 0);
  step("recoded", T.recoded_in - T.recoded_out,
    fill(t("skuh.recodedSub"), { a: fmtN(T.recoded_out), b: fmtN(T.recoded_in) }), T.recoded_in + T.recoded_out > 0);
  step("moved", T.moved_in - T.moved_out,
    fill(t("skuh.movedSub"), { a: fmtN(T.moved_in), b: fmtN(T.moved_out) }), T.moved_in + T.moved_out > 0);
  step("removed", -T.removed,
    [T.archived ? fill(t("skuh.archivedN"), { n: fmtN(T.archived) }) : null,
      T.deleted ? fill(t("skuh.deletedN"), { n: fmtN(T.deleted) }) : null].filter(Boolean).join(" · "), T.removed > 0);
  const max = Math.max(1, S.total, E.total, ...steps.map((s) => Math.max(s.from, s.to)));
  const pct = (v) => `${(v / max) * 100}%`;
  const composition = (sz) => [
    { key: "coded", label: t("skuh.coded"), value: sz.coded, color: HUE.coded, text: fmtN(sz.coded) },
    { key: "nocode", label: t("skuh.nocode"), value: sz.total - sz.coded, color: HUE.nocode, text: fmtN(sz.total - sz.coded) },
  ];
  const endLabel = data.date_to === data.today ? t("skuh.today") : fill(t("skuh.asOf"), { d: fmtD(data.date_to) });
  const net = E.total - S.total;


  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <SectionHead icon={Scale} color={HUE.coded} size="lg" title={t("skuh.ledger")}
        right={(
          <div className="text-right">
            <div className="text-[15px] font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{sign(net)}</div>
            <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("skuh.netLabel")}</div>
          </div>
        )} />
      <div className="pt-1.5"><TotalRow label={t("skuh.start")} sub={fmtD(data.date_from)} size={S} pct={pct} t={t} /></div>
      <div className="py-1">
        {steps.length === 0 && (
          <div className="px-3 sm:px-6 py-3 text-[13px]" style={{ color: "var(--text-3)" }}>{t("skuh.noChanges")}</div>
        )}
        {steps.map((s) => {
          const lo = Math.min(s.from, s.to);
          const on = kind === s.key;
          const hue = HUE[s.key];
          return (
            <button key={s.key} type="button" aria-pressed={on} onClick={() => onPick(s.key)}
              className="w-full grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,13rem)_1fr_7rem] items-center gap-x-3 sm:gap-x-4 gap-y-1.5 px-3 sm:px-6 py-2 text-left transition-colors hover:bg-[var(--bg-inner)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
              style={on ? { background: "var(--bg-inner)", boxShadow: `inset 3px 0 0 ${hue}` } : undefined}>
              <span className="min-w-0">
                <span className="flex items-center gap-2 min-w-0">
                  <span aria-hidden className="w-2.5 h-2.5 rounded-[3px] flex-shrink-0" style={{ background: hue }} />
                  <span className="truncate text-[13px] font-medium" style={{ color: "var(--text-1)" }}>{t(`skuh.k.${s.key}`)}</span>
                </span>
                {s.sub && <span className="block text-[11px] pl-[18px]" style={{ color: "var(--text-3)" }}>{s.sub}</span>}
              </span>
              <span className="relative block col-span-2 order-last sm:col-span-1 sm:order-none" style={{ height: 12 }}>
                <span aria-hidden className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: pct(Math.max(s.from, s.to)), background: "var(--bg-inner)" }} />
                <span aria-hidden className="absolute inset-y-0 rounded-[4px]"
                  style={{ left: pct(lo), width: s.delta ? pct(Math.abs(s.delta)) : 2, minWidth: 3, background: hue }} />
              </span>
              <span className="text-right text-[15px] font-semibold tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}>{sign(s.delta)}</span>
            </button>
          );
        })}
      </div>
      <div style={{ borderTop: "1px solid var(--border)" }}>
        <TotalRow label={endLabel} size={E} big pct={pct} t={t} />
      </div>
      <div className="px-3 sm:px-6 pb-4">
        <SplitLegend parts={composition(E)} />
      </div>
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
  const any = points.some((p) => p.new || p.restored || p.removed || p.moved_in || p.moved_out || p.recoded_in || p.recoded_out);

  const ins = [
    { key: "new", name: t("skuh.k.new"), color: HUE.new, get: (p) => p.new },
    { key: "restored", name: t("skuh.k.restored"), color: HUE.restored, get: (p) => p.restored },
    { key: "recoded_in", name: t("skuh.recodedIn"), color: HUE.recoded, get: (p) => p.recoded_in },
    { key: "moved_in", name: t("skuh.movedIn"), color: HUE.moved, get: (p) => p.moved_in },
  ];
  const outs = [
    { key: "removed", name: t("skuh.k.removed"), color: HUE.removed, get: (p) => p.removed },
    { key: "recoded_out", name: t("skuh.recodedOut"), color: HUE.recoded, get: (p) => p.recoded_out },
    { key: "moved_out", name: t("skuh.movedOut"), color: HUE.moved, get: (p) => p.moved_out },
  ];
  const used = [...ins, ...outs].filter((s) => points.some((p) => s.get(p) > 0));
  const flowSeries = used.map((s) => ({
    name: s.name,
    data: points.map((p) => (outs.includes(s) ? -s.get(p) : s.get(p))),
  }));
  const tip = (i) => {
    const p = points[i];
    if (!p) return "";
    return tipBox(esc(bucketTitle(p, grain, fmtD, t)), [
      [t("skuh.inCatalog"), fmtN(p.total)],
      [t("skuh.coded"), fmtN(p.coded), HUE.coded],
      [t("skuh.nocode"), fmtN(p.total - p.coded), HUE.nocode],
      ...used.filter((s) => s.get(p) > 0).map((s) => [esc(s.name), (outs.includes(s) ? "−" : "+") + fmtN(s.get(p)), s.color]),
    ]);
  };
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
    chart: { id: "skuh-size", type: "area", stacked: true, background: "transparent", toolbar: { show: false }, zoom: { enabled: false }, animations: { enabled: false }, parentHeightOffset: 0 },
    xaxis: ownAxis(),
    colors: [HUE.coded, HUE.nocode],
    stroke: { curve: "stepline", width: 2 },
    fill: { type: "solid", opacity: 0.35 },
    yaxis: { min: 0, labels: { ...yLabels, formatter: (v) => fmtN(Math.round(v)) } },
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
    colors: used.map((s) => s.color),
    plotOptions: { bar: { columnWidth: points.length > 40 ? "85%" : "60%", borderRadius: 2, borderRadiusApplication: "end", borderRadiusWhenStacked: "last" } },
    states: { active: { filter: { type: "none" } } },
    yaxis: { labels: { ...yLabels, formatter: (v) => (v < 0 ? `−${fmtN(Math.round(-v))}` : fmtN(Math.round(v))) } },
    annotations: {
      yaxis: [{ y: 0, borderColor: labelColor, strokeDashArray: 0 }],
      xaxis: selIdx >= 0 ? [{ x: cats[selIdx], borderColor: labelColor, strokeDashArray: 3 }] : [],
    },
  };
  const legend = [
    { key: "coded", label: t("skuh.coded"), color: HUE.coded },
    { key: "nocode", label: t("skuh.nocode"), color: HUE.nocode },
  ];
  const flowLegend = [];
  used.forEach((s) => {
    const g = s.key.replace(/_(in|out)$/, "");
    if (!flowLegend.some((p) => p.key === g)) flowLegend.push({ key: g, label: t(`skuh.k.${g}`), color: s.color });
  });

  return (
    <ChartCard icon={CalendarRange} title={t(`skuh.when.${grain}`)}>
      <div ref={ref} className="px-2 pt-3 pb-2 apx-bare-tip">
        <div className="px-3 text-[12px] font-medium" style={{ color: "var(--text-2)" }}>{t("skuh.inCatalog")}</div>
        <Chart ready={ready} height={190} type="area" options={sizeOpts}
          series={[
            { name: t("skuh.coded"), data: points.map((p) => p.coded) },
            { name: t("skuh.nocode"), data: points.map((p) => p.total - p.coded) },
          ]} />
        <StackLegend parts={legend} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 mb-3" />
        <div className="px-3 pt-2 text-[12px] font-medium" style={{ color: "var(--text-2)", borderTop: "1px solid var(--border)" }}>{t("skuh.inOut")}</div>
        {any ? (
          <>
            <Chart ready={ready} height={210} type="bar" options={flowOpts} series={flowSeries} />
            <StackLegend parts={flowLegend} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3" />
          </>
        ) : <NoChart height={160} text={t("skuh.noChanges")} />}
      </div>
    </ChartCard>
  );
}

// ── where: each brigadir's own catalog, start → end, and what moved it ───────
const IN_PARTS = [["new", HUE.new], ["restored", HUE.restored], ["recoded_in", HUE.recoded], ["moved_in", HUE.moved]];
const OUT_PARTS = [["removed", HUE.removed], ["recoded_out", HUE.recoded], ["moved_out", HUE.moved]];
const U_LABEL = {
  new: "skuh.k.new", restored: "skuh.k.restored", recoded_in: "skuh.recodedIn", moved_in: "skuh.movedIn",
  removed: "skuh.k.removed", recoded_out: "skuh.recodedOut", moved_out: "skuh.movedOut",
};
const sumOf = (u, parts) => parts.reduce((s, [k]) => s + (u[k] || 0), 0);

function UnitsCard({ data, t, unitName, unitById, unit, onPick }) {
  const rows = (data.units || [])
    .map((u) => ({ ...u, ins: sumOf(u, IN_PARTS), outs: sumOf(u, OUT_PARTS) }))
    .filter((u) => u.ins + u.outs > 0)
    .sort((a, b) => (b.ins + b.outs) - (a.ins + a.outs) || unitName(a.manager_id).localeCompare(unitName(b.manager_id)));
  if ((data.units || []).length < 2 || !rows.length) return null;
  const max = Math.max(1, ...rows.map((u) => Math.max(u.ins, u.outs)));
  const half = (u, parts, side) => (
    <span className={`flex h-full gap-[1px] ${side === "out" ? "justify-end" : ""}`} style={{ width: "100%" }}>
      <span className={`flex h-full gap-[1px] overflow-hidden ${side === "out" ? "rounded-l-[4px] flex-row-reverse" : "rounded-r-[4px]"}`}
        style={{ width: `${(sumOf(u, parts) / max) * 100}%` }}>
        {parts.filter(([k]) => u[k] > 0).map(([k, c]) => (
          <span key={k} title={`${t(U_LABEL[k])}: ${fmtN(u[k])}`} style={{ flex: `${u[k]} 1 0%`, background: c, minWidth: 2 }} />
        ))}
      </span>
    </span>
  );
  const legend = [
    { key: "new", label: t("skuh.k.new"), color: HUE.new },
    { key: "restored", label: t("skuh.k.restored"), color: HUE.restored },
    { key: "recoded", label: t("skuh.k.recoded"), color: HUE.recoded },
    { key: "moved", label: t("skuh.k.moved"), color: HUE.moved },
    { key: "removed", label: t("skuh.k.removed"), color: HUE.removed },
  ].filter((p) => rows.some((u) => (p.key === "recoded" ? u.recoded_in + u.recoded_out
    : p.key === "moved" ? u.moved_in + u.moved_out : u[p.key]) > 0));

  return (
    <ChartCard icon={Users} title={t("skuh.byUnit")}
      right={<span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>{fill(t("skuh.nUnits"), { n: rows.length })}</span>}>
      <div className="px-4 pt-2 pb-1 hidden sm:grid grid-cols-[minmax(0,14rem)_7rem_1fr_1fr_4rem] gap-4 text-[11px] font-medium" style={{ color: "var(--text-3)" }}>
        <span>{t("plan.fBrig")}</span>
        <span className="text-right">{t("skuh.startEnd")}</span>
        <span className="text-right">{t("skuh.wentOut")}</span>
        <span>{t("skuh.cameIn")}</span>
        <span className="text-right">{t("skuh.net")}</span>
      </div>
      <div className="sm:hidden grid grid-cols-2 gap-4 px-4 pt-2 text-[11px] font-medium" style={{ color: "var(--text-3)" }}>
        <span className="text-right">← {t("skuh.wentOut")}</span>
        <span>{t("skuh.cameIn")} →</span>
      </div>
      <div className="pb-2">
        {rows.map((u) => {
          const on = unit === u.manager_id;
          const archived = unitById.get(u.manager_id)?.archived;
          return (
            <button key={u.manager_id} type="button" aria-pressed={on} onClick={() => onPick(u.manager_id)}
              className="w-full grid grid-cols-[minmax(0,1fr)_auto_3.5rem] sm:grid-cols-[minmax(0,14rem)_7rem_1fr_1fr_4rem] items-center gap-x-3 sm:gap-x-4 gap-y-1.5 px-4 py-2 text-left transition-colors hover:bg-[var(--bg-inner)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]"
              style={on ? { background: "var(--bg-inner)", boxShadow: "inset 3px 0 0 var(--text-2)" } : undefined}>
              <span className="truncate text-[13px] font-medium" style={{ color: archived ? "var(--text-3)" : "var(--text-1)" }}>{unitName(u.manager_id)}</span>
              <span className="text-right text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>
                {fmtN(u.start)} → <b style={{ color: "var(--text-1)" }}>{fmtN(u.end)}</b>
              </span>
              <span className="relative col-span-3 sm:col-span-2 sm:col-start-3 grid grid-cols-2 gap-[2px] h-3 sm:order-none order-last"
                role="img" aria-label={`${t("skuh.wentOut")} ${fmtN(u.outs)} · ${t("skuh.cameIn")} ${fmtN(u.ins)}`}>
                <span aria-hidden className="absolute left-1/2 -top-1 -bottom-1 w-px" style={{ background: "var(--border-md)" }} />
                {half(u, OUT_PARTS, "out")}
                {half(u, IN_PARTS, "in")}
              </span>
              <span className="text-right text-[13px] font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{sign(u.end - u.start)}</span>
            </button>
          );
        })}
      </div>
      <StackLegend parts={legend} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-4" />
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

function Life({ spans, d0, d1, at, hue, className = "w-32" }) {
  const a = dayNo(d0), n = Math.max(1, dayNo(d1) - a + 1);
  const x = (iso) => ((dayNo(iso) - a) / n) * 100;
  return (
    <span className={`relative block h-2.5 rounded-full ${className}`} style={{ background: "var(--bg-inner)" }} aria-hidden>
      {(spans || []).map(([f, z], i) => (
        <span key={i} className="absolute inset-y-0 rounded-full" style={{ left: `${x(f)}%`, width: `max(3px, ${x(z) + 100 / n - x(f)}%)`, background: "#94a3b8" }} />
      ))}
      <span className="absolute w-[3px] rounded-sm" style={{ left: `calc(${x(at)}% - 1px)`, top: -2, bottom: -2, background: hue }} />
    </span>
  );
}

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
  const lives = data.lives || {};
  const code = (k) => (isLocal(k) ? "" : k);
  // A re-coded position is one line under two codes: its strip joins both.
  const lifeOf = (e) => (e.kind === "recoded" ? [...(lives[e.from_key] || []), ...(lives[e.key] || [])] : lives[e.key]);
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
          <Life spans={lifeOf(e)} d0={data.date_from} d1={data.date_to} at={e.date} hue={eventHue(e)} className="w-full" />
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
            <Th label={t("skuh.col.life")} />
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <EmptyRow colSpan={7}><span className="text-xs" style={{ color: "var(--text-3)" }}>{t("skuh.noneMatch")}</span></EmptyRow>
          ) : shown.map((e, i) => (
            <tr key={`${e.date}|${e.kind}|${e.from_key || ""}|${e.key}|${i}`}>
              <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>{fmtD(e.date)}</td>
              <td className="px-3 py-2"><KindLabel e={e} t={t} /></td>
              <td className="px-3 py-2 font-mono">{skuCell(e)}</td>
              <td className="px-3 py-2 max-w-[22rem] truncate" title={nameTitle(e)}>{tx(e.name)}</td>
              <td className="px-3 py-2 max-w-[14rem] truncate" style={{ color: "var(--text-2)" }}>{unitName(e.manager_id)}</td>
              <td className="px-3 py-2 font-mono" style={{ color: "var(--text-2)" }}>{e.wc || "—"}</td>
              <td className="px-3 py-2"><Life spans={lifeOf(e)} d0={data.date_from} d1={data.date_to} at={e.date} hue={eventHue(e)} /></td>
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
