// ── «Mening toifam» — the ojidaniya register read CAUSE-first ────────────────
//
// From 2026-09-10 each waiting category has one person answerable for driving
// it down (the «Kutish mas'uli» role). This is the page they work from.
//
// WHY IT IS NOT A NARROWED /downtime
// -----------------------------------
// The three views on /downtime answer FLEET questions — which brigadir waited
// most, how the causes share out a month, what the plant owes. Narrowed to one
// cause each of them stops answering anything: a doughnut of a single slice, a
// comparison matrix with nothing to compare, and a 50-minute flag that is a
// fact about a unit's WHOLE day sitting on top of one category's share of it.
// So this page asks the owner's questions instead:
//
//     is my cause getting better or worse · where is it concentrated ·
//     what did it cost · and what actually happened, in the leaders' own words
//
// The /downtime endpoints are still locked to the owner's categories on the
// server (services/idle_scope), so an admin may open those pages to the role
// without the lock leaking. This page is simply the one built for the question.
//
// THE MEASURE, and why it is not the one the fleet pages read
// -----------------------------------------------------------
// Every other ojidaniya figure on the platform is a headcount-weighted MEAN
// over units. This page SUMS the union of a category's own stopped ranges,
// which is what «how much did MY cause produce» means — and it is the same
// arithmetic the «Xarajat» tab already prints, reached through the same module
// (services/ojidaniya_cost), so the two can never state different numbers for
// one week. Consequently its totals do NOT match the «Tahlil» tab's, and the
// page says so in its own words before anybody reads a figure.
//
// A minute a cell stood still for two causes is owed ONCE (the union — the
// money) and is genuinely named under BOTH causes. An owner is asking about one
// cause, so a category's own union is the honest answer; where the categories
// on screen add up to more than the bill, the page prints both and names each.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Clock, Wallet, ListChecks, LayoutGrid, UserRound, TriangleAlert,
  FileSpreadsheet, Layers, TrendingDown, TrendingUp,
} from "lucide-react";
import ReactApexChart from "react-apexcharts";

import Button from "../components/ui/Button";
import DateRangePicker, { localISO } from "../components/ui/DateRangePicker";
import EmptyState from "../components/ui/EmptyState";
import KPICard from "../components/ui/KPICard";
import Pagination from "../components/ui/Pagination";
import SearchInput from "../components/ui/SearchInput";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import TableCard, { Th } from "../components/ui/DataTable";
import { SkeletonCard, SkeletonTable } from "../components/ui/Skeleton";
import { ChartCard, RankedList } from "../components/ui/AnalysisBoard";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import useElementWidth from "../hooks/useElementWidth";
import { axisLabelPx, ticksForWidth } from "../utils/chartRange";
import { useTranslit } from "../utils/transliterate";
import { shortPerson } from "../utils/personName";
import { exportXlsx } from "../utils/exportXlsx";
import api from "../utils/api";
import { CATS, catColor, iconFor } from "../components/idle/categories";
import OwnerChip from "../components/idle/OwnerChip";
import CellLink from "../components/ui/CellLink";

const PAGE_SIZE = 50;

const nf = (v, d = 0) =>
  v == null ? "—" : Number(v).toLocaleString("ru-RU", {
    minimumFractionDigits: d, maximumFractionDigits: d,
  });

// Money is printed WHOLE. A cost is minutes × people × an hourly rate, so its
// last digits are arithmetic noise, and «2 431 900» is the figure somebody
// quotes; «2 431 902,47» only looks more precise than it is.
const money = (v) => (v == null ? "—" : Math.round(v).toLocaleString("ru-RU"));

// Units come from the bundle, never from a literal: this string sits under the
// headline figure and is read by four languages.
const hhmm = (m, uH, uM) => {
  if (m == null) return "—";
  const h = Math.floor(m / 60);
  return h ? `${h} ${uH} ${Math.round(m % 60)} ${uM}` : `${Math.round(m)} ${uM}`;
};

// The period-over-period move, as a whole percent. A previous period of ZERO
// has no percentage — «up from nothing» is not a number — so it renders as
// nothing rather than as an infinity somebody forwards.
function delta(now, prev) {
  const a = Number(now || 0), b = Number(prev || 0);
  if (!b) return null;
  return Math.round(((a - b) / b) * 100);
}

// UP is the bad direction here: this is waiting time and the wages it burns.
function DeltaChip({ value, title }) {
  if (value == null || value === 0) return null;
  const up = value > 0;
  const Icon = up ? TrendingUp : TrendingDown;
  const color = up ? "#ef4444" : "#22c55e";
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold shrink-0"
      style={{ background: `${color}18`, color, border: `1px solid ${color}44` }}
    >
      <Icon size={11} strokeWidth={2.4} />
      {up ? "+" : ""}{value}%
    </span>
  );
}

export default function IdleOwner() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();

  // The house i18n convention: whole sentences carrying {placeholders}, filled
  // by the caller. There is no params argument on `t`.
  const tp = useCallback(
    (k, vars) => Object.entries(vars || {}).reduce(
      (out, [a, b]) => out.split(`{${a}}`).join(String(b ?? "")), t(k)),
    [t]);

  const today = localISO(new Date());
  const [dateFrom, setDateFrom] = usePersistentState(
    "idleowner_from", localISO(new Date(Date.now() - 29 * 864e5)));
  const [dateTo, setDateTo] = usePersistentState("idleowner_to", today);
  const [shift, setShift] = usePersistentState("idleowner_shift", null);
  const [pickedCats, setPickedCats] = usePersistentState("idleowner_cats", []);
  const [mgrIds, setMgrIds] = usePersistentState("idleowner_mgrs", []);
  const [cellIds, setCellIds] = usePersistentState("idleowner_cells", []);
  const [board, setBoard] = usePersistentState("idleowner_board", "cells");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const factorySection = useFactorySection();

  const scope = useMemo(() => ({
    date_from: dateFrom, date_to: dateTo,
    ...(shift ? { shift } : {}),
    ...(mgrIds.length ? { manager_id: mgrIds } : {}),
    ...(pickedCats.length ? { cats: pickedCats } : {}),
  }), [dateFrom, dateTo, shift, mgrIds, pickedCats]);
  const fscope = useFactoryParams(scope);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["idle-owner", fscope],
    queryFn: () => api.get("/api/idle-owner/overview", { params: fscope }).then((r) => r.data),
  });

  // The register is its own request: it pages, it searches, and a keystroke in
  // the search box must not re-run the whole overview computation.
  const evParams = useMemo(() => ({
    ...fscope,
    ...(cellIds.length ? { cell_id: cellIds } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    offset: (page - 1) * PAGE_SIZE, limit: PAGE_SIZE,
  }), [fscope, cellIds, q, page]);

  const { data: events, isLoading: evLoading } = useQuery({
    queryKey: ["idle-owner-events", evParams],
    queryFn: () => api.get("/api/idle-owner/events", { params: evParams }).then((r) => r.data),
    keepPreviousData: true,
  });

  // A narrowing that shortens the register must send the reader back to its
  // first page, or a page-4 offset into a three-page answer renders empty and
  // reads as «there is nothing here».
  useEffect(() => { setPage(1); }, [fscope, cellIds, q]);

  const mine = data?.mine || {};
  const owners = data?.owners || {};
  const totals = data?.totals || {};
  const prev = data?.prev || {};
  const cats = data?.cats || [];
  const opts = data?.options || {};

  // The option lists must not vanish between fetches: every tick changes the
  // query key, so `data` is undefined for a beat, and a list that empties
  // itself in that beat takes the pick with it. The CostTab's own rule.
  const [lastOpts, setLastOpts] = useState({});
  useEffect(() => { if (data?.options) setLastOpts(data.options); }, [data]);
  const O = data?.options || lastOpts || {};

  const supName = (id) => tl((O.managers || []).find((m) => m.id === id)?.name || "") || String(id);
  // The cell list follows the brigadir pick, and the pick that list no longer
  // offers is dropped — a control naming a value the page cannot show is worse
  // than a reset.
  const cellOpts = useMemo(
    () => (O.cells || []).filter((c) => !mgrIds.length || mgrIds.includes(c.manager_id)),
    [O, mgrIds]);
  useEffect(() => {
    const live = new Set(cellOpts.map((c) => c.id));
    if (cellIds.some((id) => !live.has(id))) {
      setCellIds(cellIds.filter((id) => live.has(id)));
    }
  }, [cellOpts]);   // eslint-disable-line react-hooks/exhaustive-deps

  const catLabel = (name) => {
    const c = CATS.find((x) => x.name === name);
    return c ? t(`downtime.cat.${c.code}.label`) : name;
  };
  const catCode = (name) => CATS.find((x) => x.name === name)?.code || name;

  // ── the trend ─────────────────────────────────────────────────────────────
  const daily = data?.daily || [];
  const [chartRef, chartW] = useElementWidth();
  const dLabels = daily.map((d) => d.date.slice(8, 10) + "." + d.date.slice(5, 7));
  const trend = useMemo(() => ({
    options: {
      chart: { type: "area", toolbar: { show: false }, animations: { enabled: false },
               fontFamily: "inherit", background: "transparent" },
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 2.4 },
      colors: ["#C8973F"],
      fill: { type: "gradient", gradient: { shadeIntensity: 0.4, opacityFrom: 0.35, opacityTo: 0.02 } },
      grid: { borderColor: "var(--border)", strokeDashArray: 3, padding: { left: 6, right: 6 } },
      xaxis: {
        categories: dLabels,
        // Thinned to the chart's MEASURED width, never to a fixed count — the
        // platform's rule (utils/chartRange). Labels stay horizontal.
        tickAmount: ticksForWidth(chartW, dLabels.length, axisLabelPx(dLabels)),
        labels: { rotate: 0, style: { colors: "var(--text-3)", fontSize: "10px" } },
        axisBorder: { show: false }, axisTicks: { show: false },
      },
      yaxis: { labels: { style: { colors: "var(--text-3)", fontSize: "10px" },
                         formatter: (v) => nf(v) } },
      tooltip: { theme: "dark", y: { formatter: (v) => `${nf(v)} ${t("general.unitMin")}` } },
    },
    series: [{ name: t("idleOwner.kMinutes"), data: daily.map((d) => Math.round(d.minutes || 0)) }],
  }), [daily, dLabels, chartW, t, lang]);

  // ── the ranked boards ─────────────────────────────────────────────────────
  const boardRows = useMemo(() => {
    const src = board === "cells" ? (data?.cells || []) : (data?.managers || []);
    return src.slice(0, 12).map((r) => ({
      key: board === "cells" ? `c${r.cell_id}` : `m${r.manager_id}`,
      label: board === "cells"
        ? (r.code || "—")
        : tl(r.manager || ""),
      title: board === "cells"
        ? `${r.code || ""}${r.leader ? ` · ${tl(r.leader)}` : ""}`
        : tl(r.manager || ""),
      total: Math.round(r.minutes || 0),
      minutes: Math.round(r.minutes || 0),
      raw: r,
    }));
  }, [board, data, tl]);
  const boardMax = Math.max(1, ...boardRows.map((r) => r.total));

  // ── the two sums ──────────────────────────────────────────────────────────
  // The rows on screen add up to `cat_minutes` (a minute with two causes is
  // named under both); the BILL is `minutes`, the union, each minute paid once.
  // They are equal wherever nothing overlapped, and both are printed whenever
  // they are not: one alone is either a column that visibly does not add up or
  // a total that overstates what is owed.
  const overlaps = (totals.cat_minutes || 0) > (totals.minutes || 0);

  const rows = events?.rows || [];
  const evTotal = events?.total || 0;

  async function onExport() {
    setExporting(true);
    try {
      const fmtD = (v) => (v ? v.split("-").reverse().join(".") : "");
      const catsMeta = {};
      CATS.forEach(({ name, code }) => {
        catsMeta[name] = {
          label: t(`downtime.cat.${code}.label`),
          color: catColor(name),
          // The NAME is resolved on the server; only the words travel from here.
        };
      });
      await exportXlsx("/api/idle-owner/export.xlsx", {
        body: {
          date_from: dateFrom, date_to: dateTo, shift,
          manager_id: mgrIds, cell_id: cellIds, cats: pickedCats,
          factory: fscope.factory ?? null, q: q.trim(),
          title: t("idleOwner.title"),
          subtitle: `${fmtD(dateFrom)} — ${fmtD(dateTo)}`,
          cats_meta: catsMeta,
          scope: [
            { label: t("downtime.xl.period"), value: `${fmtD(dateFrom)} — ${fmtD(dateTo)}` },
            { label: t("downtime.filterCat"),
              value: (pickedCats.length ? pickedCats : mine.owned || []).join(", ")
                     || t("filter.all") },
            { label: t("filter.shift"), value: shift ? `S${shift}` : t("filter.all") },
            { label: t("downtime.xl.generated"),
              value: new Date().toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) },
          ],
          labels: {
            shOverview: t("idleOwner.xlOverview"), shDaily: t("idleOwner.xlDaily"),
            shCells: t("idleOwner.xlCells"), shEvents: t("idleOwner.xlEvents"),
            kMinutes: t("idleOwner.kMinutes"), kCost: t("idleOwner.kCost"),
            kEvents: t("idleOwner.kEvents"), kUnpriced: t("downtime.cost.kUnpriced"),
            kUnpricedHint: t("downtime.cost.kUnpricedHint"),
            kCostHint: tp("idleOwner.kCostHint", { m: totals.managers || 0, c: totals.cells || 0 }),
            hrs: t("downtime.cost.colHrs"), days: t("idleOwner.days"),
            sByCat: t("idleOwner.byCat"), sBySup: t("idleOwner.bySup"),
            sDaily: t("idleOwner.trend"), sCells: t("idleOwner.byCell"),
            sEvents: t("idleOwner.register"),
            cCat: t("downtime.mx.catCol"), cSup: t("filter.brigadir"),
            cCell: t("downtime.cost.colCell"), cLeader: t("idleCell.leader"),
            cHc: t("downtime.cost.colHc"), cMin: t("downtime.cost.colMin"),
            cHrs: t("downtime.cost.colHrs"), cCost: t("downtime.cost.colCost"),
            cShare: t("downtime.cost.colShare"), cOwner: t("idleOwners.ownerCol"),
            cShift: t("filter.shift"), cCats: t("downtime.filterCat"),
            cDate: t("downtime.cost.colDate"), cEvents: t("idleOwner.kEvents"),
            cStart: t("downtime.cost.colClock"), cEnd: t("downtime.cost.colClock"), cNote: t("idleCell.note"),
            total: t("downtime.mx.total"), chTrend: t("idleOwner.trend"),
            sumNote: t("idleOwner.sumNote"),
          },
        },
        fallbackName: `ojidaniya-toifa-${dateFrom}_${dateTo}.xlsx`,
      });
    } finally {
      setExporting(false);
    }
  }

  // ── the filter panel ──────────────────────────────────────────────────────
  // A locked owner still gets a category control: they may own several and
  // narrowing to one of them is a real question. It offers ONLY what they own
  // (the server builds the option list under the same lock), so it can never
  // name a value the page is unable to show.
  const sections = [
    ...(factorySection ? [factorySection] : []),
    {
      key: "shift", icon: Layers, label: t("filter.shift"),
      group: t("downtime.cost.grpWho"),
      active: shift != null, display: shift != null ? `S${shift}` : "",
      onClear: () => setShift(null),
      render: () => (
        <SegmentedToggle fill value={shift} onChange={setShift}
          options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]} />
      ),
    },
    {
      key: "sup", icon: UserRound, label: t("tasks.colSupervisor"),
      group: t("downtime.cost.grpWho"),
      active: mgrIds.length > 0,
      display: mgrIds.length === 1 ? supName(mgrIds[0]) : `${mgrIds.length}`,
      onClear: () => setMgrIds([]),
      render: () => (
        <OptsFilter
          searchable
          opts={(O.managers || []).map((m) => m.id)}
          sel={mgrIds} onChange={setMgrIds}
          labelOf={(id) => supName(id)}
          render={(id) => {
            const m = (O.managers || []).find((x) => x.id === id);
            return m ? `${tl(m.name)}${m.shift ? ` \u00b7 S${m.shift}` : ""}` : String(id);
          }}
        />
      ),
    },
    {
      key: "cell", icon: LayoutGrid, label: t("downtime.cost.colCell"),
      group: t("downtime.cost.grpWho"),
      active: cellIds.length > 0,
      display: cellIds.length === 1
        ? (cellOpts.find((c) => c.id === cellIds[0])?.code || "")
        : `${cellIds.length}`,
      onClear: () => setCellIds([]),
      render: () => (
        <OptsFilter
          searchable
          opts={cellOpts.map((c) => c.id)}
          sel={cellIds} onChange={setCellIds}
          labelOf={(id) => cellOpts.find((c) => c.id === id)?.code || String(id)}
          render={(id) => {
            const c = cellOpts.find((x) => x.id === id);
            return c ? `${c.code}${c.leader ? ` \u00b7 ${shortPerson(tl(c.leader))}` : ""}` : String(id);
          }}
          // A cascading level narrows the level below it and SAYS so, so a
          // shortened list is never mistaken for missing data.
          note={mgrIds.length
            ? tp("downtime.cost.cellNarrowed", {
                who: mgrIds.length === 1 ? supName(mgrIds[0]) : `${mgrIds.length}`,
                n: cellOpts.length })
            : null}
          empty={mgrIds.length ? {
            message: t("downtime.cost.cellEmpty"),
            action: { label: t("downtime.cost.clearSup"), onClick: () => setMgrIds([]) },
          } : null}
        />
      ),
    },
    {
      // A locked owner still gets this control: they may own several causes
      // and narrowing to one is a real question. It offers ONLY what they own
      // — the server builds the option list under the same lock — so it can
      // never name a category the page is unable to show.
      key: "cats", icon: Layers, label: t("downtime.filterCat"),
      group: t("downtime.cost.grpWhat"),
      active: pickedCats.length > 0,
      display: pickedCats.length === 1 ? pickedCats[0] : `${pickedCats.length}`,
      onClear: () => setPickedCats([]),
      render: () => (
        <OptsFilter
          opts={(O.categories || []).length ? O.categories : (mine.owned || [])}
          sel={pickedCats} onChange={setPickedCats}
          labelOf={(c) => `${c} \u2014 ${catLabel(c)}`}
          render={(c) => `${c} \u2014 ${catLabel(c)}`}
        />
      ),
    },
  ];

  if (isError) {
    return (
      <div className="p-4">
        <EmptyState icon={TriangleAlert} title={t("common.loadFailed")} />
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-4 space-y-4">
      {/* ── who am I, and what do I answer for ──────────────────────────── */}
      <div className="rounded-xl p-3 sm:p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest" style={{ color: "var(--text-3)" }}>
            {mine.locked ? t("idleOwner.myCats") : t("idleOwner.allCats")}
          </span>
          {(mine.locked ? mine.owned || [] : (O.categories || [])).map((name) => {
            const code = catCode(name);
            const hue = catColor(name);
            const Icon = iconFor(code);
            return (
              <span
                key={name}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11.5px] font-semibold"
                style={{ background: `${hue}18`, color: hue, border: `1px solid ${hue}44` }}
                title={catLabel(name)}
              >
                <Icon size={12} strokeWidth={2.2} />
                {code}
                <span className="font-normal opacity-80 hidden sm:inline">· {catLabel(name)}</span>
              </span>
            );
          })}
          {mine.locked && !(mine.owned || []).length && (
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              {t("idleOwner.noneAssigned")}
            </span>
          )}
        </div>
        {/* The page's measure, stated before anybody reads a figure. It is not
            the one the fleet pages read, and a reader who compares the two
            without being told is entitled to think one of them is broken. */}
        <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-3)" }}>
          {t("idleOwner.measureNote")}
        </p>
      </div>

      {/* ── one toolbar row: period · filters · chips · export ──────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker
          dateFrom={dateFrom} dateTo={dateTo}
          setDateFrom={setDateFrom} setDateTo={setDateTo}
          max={today} compactLabel
          triggerClassName="px-3 py-2 text-sm"
        />
        <FilterPanel sections={sections} />
        <span className="flex-1" />
        <Button
          size="lg" variant="secondary" onClick={onExport} loading={exporting}
          title={t("downtime.dt.export")}
        >
          <FileSpreadsheet size={16} />
          <span className="hidden sm:inline">{t("downtime.dt.export")}</span>
        </Button>
      </div>

      {/* ── KPI ─────────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <SkeletonCard key={i} />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPICard
            icon={Clock} color="#C8973F"
            label={t("idleOwner.kMinutes")}
            value={nf(totals.cat_minutes, 0)}
            sub={
              <span className="flex items-center gap-1.5 flex-wrap">
                {hhmm(totals.cat_minutes, t("general.unitHour"), t("general.unitMin"))}
                <DeltaChip
                  value={delta(totals.cat_minutes, prev.cat_minutes)}
                  title={data?.prev_window
                    ? tp("idleOwner.vsPrev", { from: data.prev_window.from, to: data.prev_window.to })
                    : ""}
                />
              </span>
            }
          />
          <KPICard
            icon={Wallet} color="#C8973F"
            label={t("idleOwner.kCost")}
            value={money(totals.cat_cost)}
            sub={
              <span className="flex items-center gap-1.5 flex-wrap">
                {tp("idleOwner.kCostHint", { m: totals.managers || 0, c: totals.cells || 0 })}
                <DeltaChip
                  value={delta(totals.cat_cost, prev.cat_cost)}
                  title={data?.prev_window
                    ? tp("idleOwner.vsPrev", { from: data.prev_window.from, to: data.prev_window.to })
                    : ""}
                />
              </span>
            }
          />
          <KPICard
            icon={ListChecks} color="#6366f1"
            label={t("idleOwner.kEvents")}
            value={nf(totals.events)}
            sub={tp("idleOwner.overDays", { n: totals.days || 0 })}
          />
          <KPICard
            icon={LayoutGrid} color="#6366f1"
            label={t("idleOwner.kCells")}
            value={nf(totals.cells)}
            sub={tp("idleOwner.nSups", { n: totals.managers || 0 })}
          />
        </div>
      )}

      {/* An unpriced figure is a NAMED gap, never a silent shortfall: a day
          inside a wage period nobody filled in, or a cell whose headcount
          nobody typed, keeps its minutes and loses its cost. */}
      {(totals.unpriced_minutes || 0) > 0 && (
        <div
          className="rounded-xl px-3 py-2 text-[11.5px] flex items-center gap-2"
          style={{ background: "#eab30814", border: "1px solid #eab30844", color: "var(--text-2)" }}
        >
          <TriangleAlert size={14} style={{ color: "#eab308" }} className="shrink-0" />
          {tp("downtime.cost.unpricedChip", { min: nf(totals.unpriced_minutes) })}
        </div>
      )}

      {/* ── trend + ranked board ────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <ChartCard icon={Clock} title={t("idleOwner.trend")} subtitle={t("idleOwner.trendSub")}>
            <div ref={chartRef}>
              {isLoading ? (
                <SkeletonCard />
              ) : daily.some((d) => d.minutes) ? (
                <ReactApexChart
                  options={trend.options} series={trend.series}
                  type="area" height={260}
                />
              ) : (
                <EmptyState icon={Clock} title={t("idleOwner.noEvents")} />
              )}
            </div>
          </ChartCard>
        </div>

        <ChartCard
          icon={board === "cells" ? LayoutGrid : UserRound}
          title={t("idleOwner.where")}
          subtitle={boardRows.length ? tp("idleOwner.whereSub", { n: boardRows.length }) : ""}
          right={
            <SegmentedToggle
              size="sm"
              value={board}
              onChange={setBoard}
              options={[
                ["cells", t("downtime.cost.colCell")],
                ["mgrs", t("filter.brigadir")],
              ]}
            />
          }
        >
          {isLoading ? <SkeletonCard /> : boardRows.length ? (
            <RankedList
              rows={boardRows}
              max={boardMax}
              parts={[{ key: "minutes", color: "#C8973F", label: t("downtime.cost.colMin") }]}
              unit={t("general.unitMin")}
              badge={(r) => (board === "cells" && r.raw.leader ? (
                <span className="text-[10.5px] shrink-0 truncate max-w-[110px]"
                      style={{ color: "var(--text-3)" }} title={tl(r.raw.leader)}>
                  {shortPerson(tl(r.raw.leader))}
                </span>
              ) : null)}
              extra={(r) => (
                <span className="text-[10.5px] shrink-0 tabular-nums" style={{ color: "var(--text-3)" }}>
                  {money(r.raw.cost)}
                </span>
              )}
            />
          ) : (
            <EmptyState icon={LayoutGrid} title={t("idleOwner.noEvents")} />
          )}
        </ChartCard>
      </div>

      {/* ── the causes ──────────────────────────────────────────────────── */}
      <TableCard
        icon={Layers}
        title={t("idleOwner.byCat")}
        right={overlaps ? (
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            {tp("idleOwner.sumVsBill", { sum: nf(totals.cat_minutes), bill: nf(totals.minutes) })}
          </span>
        ) : null}
      >
            <thead>
              <tr>
                <Th label={t("downtime.filterCat")} />
                <Th label={t("idleOwners.ownerCol")} />
                <Th label={t("downtime.cost.colMin")} align="right" />
                <Th label={t("downtime.cost.colHrs")} align="right" />
                <Th label={t("downtime.cost.colCost")} align="right" />
                <Th label={t("downtime.cost.colShare")} align="right" />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6}><SkeletonTable rows={4} cols={6} /></td></tr>
              ) : cats.length ? cats.map((k) => {
                const hue = catColor(k.category);
                const Icon = iconFor(catCode(k.category));
                const share = totals.cat_cost
                  ? Math.round(((k.cost || 0) / totals.cat_cost) * 100) : null;
                return (
                  <tr key={k.category} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-[24px] h-[24px] rounded-lg grid place-items-center shrink-0"
                          style={{ background: `${hue}22`, color: hue, border: `1px solid ${hue}55` }}
                        >
                          <Icon size={13} strokeWidth={2} />
                        </span>
                        <span className="font-bold shrink-0" style={{ color: hue }}>
                          {catCode(k.category)}
                        </span>
                        <span className="truncate" style={{ color: "var(--text-2)" }}>
                          {catLabel(k.category)}
                        </span>
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {/* The chip renders nothing where nobody is assigned —
                          that is a fact for the admin register, not a
                          placeholder on every row of every table. */}
                      <OwnerChip owners={owners} category={k.category} tint={hue} full />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{nf(k.minutes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>
                      {nf(k.hours, 1)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(k.cost)}</td>
                    <td className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-3)" }}>
                      {share == null ? "—" : `${share}%`}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
                    {t("idleOwner.noEvents")}
                  </td>
                </tr>
              )}
            </tbody>
      </TableCard>

      {/* ── the register: the evidence, in the leaders' own words ───────── */}
      <TableCard
        icon={ListChecks}
        title={t("idleOwner.register")}
        right={
          <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
            {tp("idleOwner.nEvents", { n: evTotal })}
          </span>
        }
        wrap
        toolbar={
          <>
            <SearchInput
              value={q} onChange={setQ}
              placeholder={t("idleOwner.searchPh")}
              className="w-full sm:w-72"
            />
            {/* Days the period covers that no EVENT can exist for: before
                `idle_source.CELLS_FROM` the minutes came off the «Смена отчёт»
                row. Named, so a thin register under a fat total reads as
                history rather than as a quiet month. */}
            {(totals.pre_days || 0) > 0 && (
              <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
                {tp("idleOwner.preDays", { n: totals.pre_days, from: data?.cells_from || "" })}
              </span>
            )}
          </>
        }
      >
            <thead>
              <tr>
                <Th label={t("downtime.cost.colDate")} />
                <Th label={t("downtime.filterCat")} />
                <Th label={t("downtime.cost.colCell")} />
                <Th label={t("idleCell.leader")} cls="hidden md:table-cell" />
                <Th label={t("tasks.colSupervisor")} cls="hidden lg:table-cell" />
                <Th label={t("idleOwner.clock")} align="center" />
                <Th label={t("downtime.cost.colMin")} align="right" />
                <Th label={t("downtime.cost.colCost")} align="right" cls="hidden sm:table-cell" />
                <Th label={t("idleCell.note")} />
              </tr>
            </thead>
            <tbody>
              {evLoading && !rows.length ? (
                <tr><td colSpan={9}><SkeletonTable rows={6} cols={9} /></td></tr>
              ) : rows.length ? rows.map((r) => {
                const hue = catColor(r.category);
                return (
                  <tr key={r.id} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                      {r.date.slice(8, 10)}.{r.date.slice(5, 7)}.{r.date.slice(0, 4)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="px-1.5 py-0.5 rounded-md text-[10.5px] font-bold whitespace-nowrap"
                        style={{ background: `${hue}22`, color: hue, border: `1px solid ${hue}55` }}
                        title={catLabel(r.category)}
                      >
                        {catCode(r.category)}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <CellLink id={r.cell_id}>{r.code || "—"}</CellLink>
                    </td>
                    <td className="px-3 py-2 hidden md:table-cell" style={{ color: "var(--text-2)" }}>
                      {r.leader ? shortPerson(tl(r.leader)) : "—"}
                    </td>
                    <td className="px-3 py-2 hidden lg:table-cell" style={{ color: "var(--text-2)" }}>
                      {r.manager ? shortPerson(tl(r.manager)) : "—"}
                    </td>
                    <td className="px-3 py-2 text-center whitespace-nowrap tabular-nums" style={{ color: "var(--text-3)" }}>
                      {r.start}–{r.end}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{nf(r.minutes)}</td>
                    <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">{money(r.cost)}</td>
                    {/* Verbatim. This is the leader's own account of what
                        stopped the cell, and it is the reason the table
                        exists — an owner deciding what to fix is reading
                        evidence, not a summary of it. */}
                    <td className="px-3 py-2 min-w-[220px]" style={{ color: "var(--text-2)" }}>
                      {r.note || <span style={{ color: "var(--text-4)" }}>—</span>}
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={9} className="px-3 py-8 text-center" style={{ color: "var(--text-3)" }}>
                    {t("idleOwner.noEvents")}
                  </td>
                </tr>
              )}
            </tbody>
      </TableCard>
      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(evTotal / PAGE_SIZE))}
        total={evTotal}
        pageSize={PAGE_SIZE}
        onPage={setPage}
      />
      {/* A per-event minute is that event's OWN length, so the column adds up
          by eye — and totals MORE than the figures above wherever two events of
          one cause overlapped, which the union counts once. */}
      {rows.length > 0 && (
        <p className="text-[11px] px-1" style={{ color: "var(--text-4)" }}>
          {t("idleOwner.sumNote")}
        </p>
      )}
    </div>
  );
}
