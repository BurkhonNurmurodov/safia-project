import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Briefcase, CalendarClock, Cake, Grid3x3, MapPin, RefreshCw, UserRound, Users,
} from "lucide-react";
import KPICard from "../ui/KPICard";
import Button from "../ui/Button";
import EmptyState from "../ui/EmptyState";
import Tooltip from "../ui/Tooltip";
import SegmentedToggle from "../ui/SegmentedToggle";
import SearchInput from "../ui/SearchInput";
import TableCard, { Th } from "../ui/DataTable";
import { SplitBar, SplitLegend } from "../ui/Meter";
import { RankedList } from "../ui/AnalysisBoard";
import { SkeletonChart } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { useAuth } from "../../context/AuthContext";
import { useLang } from "../../context/LangContext";
import { convertFromUz, useTranslit } from "../../utils/transliterate";
import { useChartTheme } from "../../hooks/useChartTheme";
import { usePersistentState } from "../../hooks/usePersistentState";
import useIsMobile from "../../hooks/useIsMobile";
import { surnameInitial } from "../../utils/personName";
import { searchFold, matchScore } from "../../utils/searchFold";
import { FOLD_COLOR } from "../../utils/chartPalette";
import api from "../../utils/api";
import { WorkersPage, ChartCard, ScopeSwitch, TileSkeletons } from "./WorkersPage";
import { TXT, fill } from "./demographicsText";

/* «Tarkib» — who is on the brigadirs' lists today: gender, age, years at
 * Safia and where people live, from Verifix (backend services/workforce.py).
 * A snapshot of TODAY (Verifix keeps only today's placement), so the page's
 * period does not reach it — no period control is drawn — while plant, shift,
 * brigadir and the page's role switch do.
 *
 * It draws the whole page, frame included (WorkersPage), because what stands
 * at the far end of the toolbar is its own: which read the figures are from,
 * the population switch and the admin's refresh — one row, not a second one
 * under the filters. Then the five answers in the order asked (how many, how
 * many women, how old, how long here, where from), the three distributions
 * two to a row (never three: the operator, 2026-11-14 — «dont squeeze like
 * that», the tenure axis ran its labels together)
 * side by side, and the breakdown they are made of.
 *
 * Colours: men / women are the categorical blue and pink of
 * utils/chartPalette (validated for colour-blind separation on both themes),
 * the same two on every card; a single measure (tenure, place) is brand gold,
 * a «not stated» or «others» bucket the slate fold. */

export const MEN = "#3b82f6";
export const WOMEN = "#ec4899";
const ONE = "#C8973F";
const TOP = 8;

const pct = (n, d) => (d ? Math.round((n / d) * 100) : null);
// A round axis end the ticks divide evenly (four ticks: −max, −max/2, 0, …).
const niceMax = (v) => {
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, v)));
  for (const m of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (m * mag >= v) return m * mag;
  return 10 * mag;
};

function Foot({ children }) {
  return <div className="text-[11px] mt-2" style={{ color: "var(--text-3)" }}>{children}</div>;
}

export default function Demographics({ params, ready, scope, setScope }) {
  const { lang, t } = useLang();
  const T = TXT[lang] || TXT.uz;
  const { tl, tx } = useTranslit();
  const { auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const toast = useToast();
  const qc = useQueryClient();
  const { chartTheme, cardBg, gridColor, labelColor, legendColor, tooltipTheme } = useChartTheme();
  const [src, setSrc] = usePersistentState("workers_demo_src", "live");       // "live" | "prop"
  const [lvl, setLvl] = usePersistentState("workers_demo_lvl", "district");   // "district" | "region"
  const [group, setGroup] = usePersistentState("workers_demo_group", "unit"); // "unit" | "job" | "cell"
  const [sort, setSort] = usePersistentState("workers_demo_sort", { key: "n", dir: "desc" });
  const [starting, setStarting] = useState(false);
  // Eight tenure columns do not fit a phone's width with their labels: there
  // the bands are rows.
  const phone = useIsMobile();

  const qparams = useMemo(() => ({ ...params, scope }), [params, scope]);
  const q = useQuery({
    queryKey: ["worker-demographics", qparams],
    queryFn: () => api.get("/api/workers/demographics", { params: qparams }).then((r) => r.data),
    enabled: ready,
    staleTime: 60_000,
    refetchInterval: (query) => (query.state.data?.read?.running ? 4000 : false),
  });
  const d = q.data;
  const read = d?.read;
  const s = d?.summary;
  const total = d?.total || 0;

  const atText = (iso) => {
    if (!iso) return "—";
    const dt = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    return `${p(dt.getDate())}.${p(dt.getMonth() + 1)} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
  };
  const months = (m) => {
    if (m == null) return "—";
    const n = Math.round(m);
    if (n < 12) return fill(T.months, { n });
    const y = Math.floor(n / 12), mo = n % 12;
    return mo ? fill(T.yearsMonths, { y, m: mo }) : fill(T.yearsOnly, { y });
  };
  const regionName = (k) => T.region[k] || k;
  // District names arrive in Uzbek Latin; the Cyrillic readers get them in
  // Cyrillic, English keeps the Uzbek spelling (a place, not a person).
  const placeText = (v) => (v && (lang === "uz_cyrl" || lang === "ru") ? convertFromUz(v, lang) : v);
  const placeName = (row) => (lvl === "region" ? regionName(row.key) : placeText(row.label));

  async function refresh() {
    setStarting(true);
    try {
      const r = await api.post("/api/workers/demographics/refresh");
      if (r.data?.started) toast.info(T.refreshStarted);
      else toast.warning(T.refreshBusy);
      qc.invalidateQueries({ queryKey: ["worker-demographics"] });
    } catch {
      toast.error(T.refreshFailed);
    } finally {
      setStarting(false);
    }
  }

  // ── charts ─────────────────────────────────────────────────────────────────
  const baseChart = {
    background: "transparent", toolbar: { show: false }, animations: { enabled: false },
    redrawOnParentResize: true, fontFamily: "inherit",
  };
  const legendCfg = { labels: { colors: legendColor }, fontSize: "11px", position: "bottom", markers: { size: 6 } };
  const ageLabel = (k) => T.ageBand[k] || (k === "lt20" ? "<20" : `${k}–${Number(k) + 4}`);

  const genderParts = d ? [
    { key: "F", label: T.women, color: WOMEN, n: d.gender.F },
    { key: "M", label: T.men, color: MEN, n: d.gender.M },
    { key: "none", label: T.gNone, color: FOLD_COLOR, n: d.gender.none },
  ].filter((p) => p.n > 0) : [];
  // Oldest at the top, men to the left — a population pyramid.
  const ageBands = useMemo(() => [...(d?.age?.bands || [])].reverse(), [d]);
  const ageMax = niceMax(Math.max(1, ...ageBands.map((b) => Math.max(b.M, b.F))));
  const pyramidOptions = {
    chart: { ...baseChart, type: "bar", stacked: true },
    colors: [MEN, WOMEN],
    plotOptions: { bar: { horizontal: true, barHeight: "76%", borderRadius: 3, borderRadiusApplication: "end" } },
    dataLabels: { enabled: false },
    stroke: { width: 1, colors: [cardBg] },
    grid: { borderColor: gridColor, strokeDashArray: 0, xaxis: { lines: { show: true } }, yaxis: { lines: { show: false } } },
    xaxis: {
      categories: ageBands.map((b) => ageLabel(b.key)),
      min: -ageMax, max: ageMax, tickAmount: 4,
      labels: { formatter: (v) => String(Math.abs(Math.round(Number(v)))), style: { colors: labelColor, fontSize: "10px" } },
    },
    yaxis: { labels: { style: { colors: legendColor, fontSize: "11px" } } },
    legend: { ...legendCfg, position: "top" },
    tooltip: {
      theme: tooltipTheme, shared: true, intersect: false,
      y: { formatter: (v) => `${Math.abs(v)} ${T.people}` },
    },
    theme: chartTheme,
  };
  const pyramidSeries = [
    { name: T.men, data: ageBands.map((b) => -b.M) },
    { name: T.women, data: ageBands.map((b) => b.F) },
  ];

  const tenBands = d?.tenure?.bands || [];
  const tenKnown = tenBands.reduce((a, b) => a + b.n, 0);
  const tenureOptions = {
    chart: { ...baseChart, type: "bar" },
    colors: [ONE],
    plotOptions: { bar: {
      horizontal: phone, columnWidth: "62%", barHeight: "72%", borderRadius: 4, borderRadiusApplication: "end",
      dataLabels: { position: "top" },
    } },
    dataLabels: {
      enabled: true, offsetY: phone ? 0 : -16, offsetX: phone ? 26 : 0,
      formatter: (v) => (tenKnown ? `${pct(v, tenKnown)}%` : ""),
      style: { fontSize: "10px", colors: [legendColor], fontWeight: 500 },
    },
    grid: { borderColor: gridColor, strokeDashArray: 0, padding: { right: phone ? 24 : 8 } },
    xaxis: {
      categories: tenBands.map((b) => T.tenureBand[b.key] || b.key),
      labels: { style: { colors: labelColor, fontSize: "10px" }, rotate: 0, hideOverlappingLabels: false, trim: false,
        formatter: phone ? (v) => String(Math.round(Number(v))) : undefined },
      axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: phone ? legendColor : labelColor, fontSize: phone ? "11px" : "10px" },
      formatter: phone ? undefined : (v) => String(Math.round(v)) } },
    legend: { show: false },
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${v} ${T.people} · ${pct(v, tenKnown)}%` } },
    theme: chartTheme,
  };

  // Where people live: the top places, the rest folded, the unplaced named.
  const placeData = d?.place?.[src];
  const placeRows = useMemo(() => {
    const list = (lvl === "region" ? placeData?.regions : placeData?.districts) || [];
    const top = list.slice(0, TOP).map((r) => ({ key: r.key, label: r.label, region: r.region, total: r.n, n: r.n }));
    const rest = list.slice(TOP).reduce((a, r) => a + r.n, 0);
    // The fold is slate, never the measure's gold: «everything else» must not
    // read as the largest place on the list.
    if (rest) top.push({ key: "__rest", total: rest, n: 0, fold: rest, rest: true });
    return top;
  }, [placeData, lvl]);
  const placed = placeRows.reduce((a, r) => a + r.total, 0);
  const placeUnknown = (lvl === "region" ? placeData?.region_unknown : placeData?.district_unknown) || 0;
  const placeMax = Math.max(1, ...placeRows.map((r) => r.total));

  // ── the breakdown table ────────────────────────────────────────────────────
  const unitName = useMemo(() => Object.fromEntries((d?.groups?.unit || []).map((r) => [r.key, r.label])), [d]);
  const rows = useMemo(() => {
    const src0 = d?.groups?.[group] || [];
    const val = {
      name: (r) => (group === "unit" ? tl(r.label) : group === "job" ? tx(r.label) : r.label) || "",
      n: (r) => r.n,
      women: (r) => pct(r.women, r.n) ?? -1,
      age: (r) => r.age_mean ?? -1,
      young: (r) => pct(r.young, r.age_known) ?? -1,
      tenure: (r) => r.ten_median ?? -1,
      fresh: (r) => pct(r.new, r.ten_known) ?? -1,
      place: (r) => placeText(r.top_place_label) || "",
    }[sort.key] || ((r) => r.n);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...src0].sort((a, b) => {
      const av = val(a), bv = val(b);
      return (typeof av === "string" ? av.localeCompare(bv) : av - bv) * dir;
    });
  }, [d, group, sort, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const onSort = (key) => setSort((p) => (p.key === key
    ? { key, dir: p.dir === "asc" ? "desc" : "asc" }
    : { key, dir: key === "name" || key === "place" ? "asc" : "desc" }));

  // The search reads the name cell as it is printed (a cell row: its code and
  // its brigadir), folded on both sides by the header search's own rule — a
  // Cyrillic «конд» finds the «Konditer» an Uzbek reader sees, «xolmatov» the
  // «Холматов» a Russian one does.
  // One query per grouping, so a job's name never filters a list of people.
  const [queries, setQueries] = useState({});
  const query = queries[group] || "";
  const setQuery = (v) => setQueries((p) => ({ ...p, [group]: v }));
  const items = useMemo(() => rows.map((r) => {
    const name = group === "unit" ? tl(r.label) : group === "job" ? (r.label ? tx(r.label) : T.noJob) : r.label;
    const boss = group === "cell" && r.unit != null && unitName[r.unit] ? tl(unitName[r.unit]) : null;
    const hay = searchFold([name, r.label, boss, boss && unitName[r.unit]].filter(Boolean).join(" "));
    return { r, name, boss, hay };
  }), [rows, unitName, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const needle = searchFold(query);
  const shown = useMemo(
    () => (needle ? items.filter((it) => matchScore(needle, [it.hay]) > 0) : items),
    [items, needle],
  );

  // ── the frame ──────────────────────────────────────────────────────────────
  // The toolbar's far end, in the order things arrive: the population switch
  // is there from the first frame and keeps the edge; the read line and the
  // refresh land to its LEFT once the answer is in, so nothing already on
  // screen moves.
  const right = (
    <>
      {toast.node}
      {d && (
        <span className="flex items-center gap-1.5 text-xs min-w-0" style={{ color: "var(--text-3)" }}>
          <span className="truncate">{T.snapshot}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums whitespace-nowrap">
            {read?.running ? T.readRunning : read?.at ? fill(T.readAt, { at: atText(read.at) }) : T.readNever}
          </span>
          <Tooltip text={T.privacy} />
        </span>
      )}
      {isAdmin && read?.configured && (
        <Button size="lg" variant="secondary" onClick={refresh} loading={starting || !!read?.running}
          title={T.refresh} aria-label={T.refresh}>
          <RefreshCw size={15} />
        </Button>
      )}
      <ScopeSwitch scope={scope} setScope={setScope} t={t} />
    </>
  );
  const frame = (body) => (
    <WorkersPage titleKey="nav.workersComposition" period={false} right={right}>
      {read?.error && (
        <div className="-mt-1 mb-4 text-xs" style={{ color: "var(--status-warn)" }}>
          {fill(T.readFailed, { at: atText(read.error_at) })}
        </div>
      )}
      {body}
    </WorkersPage>
  );
  const card = (node) => (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>{node}</div>
  );

  // ── states ─────────────────────────────────────────────────────────────────
  if (q.isError) {
    return frame(card(
      <EmptyState tone="danger" title={T.loadError} message={T.loadErrorMsg} showUploadLink={false} height="h-56"
        action={<Button variant="secondary" onClick={() => q.refetch()}>{T.retry}</Button>} />,
    ));
  }
  if (!d) {
    return frame(
      <>
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 lg:gap-4 mb-4 lg:mb-6"><TileSkeletons n={5} /></div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
          <SkeletonChart className="h-[380px] rounded-2xl" /><SkeletonChart className="h-[380px] rounded-2xl" />
          <SkeletonChart className="h-[380px] rounded-2xl lg:col-span-2" />
        </div>
      </>,
    );
  }
  if (!read?.at) {
    return frame(card(
      <EmptyState height="h-56" showUploadLink={false} icon={Users}
        title={read?.configured ? T.neverTitle : T.notConfiguredTitle}
        message={read?.configured ? T.neverMsg : T.notConfiguredMsg} />,
    ));
  }
  if (!total) {
    return frame(card(
      <EmptyState height="h-56" showUploadLink={false} icon={Users} title={T.emptyTitle} message={T.emptyMsg} />,
    ));
  }

  const topRegion = s?.top_place ? (d.place.live.districts.find((x) => x.key === s.top_place)?.region) : null;
  const numCell = "px-3 py-2 text-right tabular-nums";
  // The two charts stand beside the nine-row place list: tall enough to end
  // where it ends on a desktop, a phone's own height where each is a row.
  const chartH = phone ? 320 : 340;

  const newShare = s.ten_known ? pct(s.new, s.ten_known) : null;
  const youngShare = s.age_known ? pct(s.young, s.age_known) : null;
  const placeShare = s.top_place_label ? pct(s.top_place_n, total) : null;
  // One share of the whole, as a bar with its name: the part in gold (the
  // page's single-measure accent), the rest in the slate of «everything else».
  const share = (p, label) => (p == null ? null : (
    <>
      <SplitBar parts={[
        { key: "part", label, value: p, text: `${p}%`, color: ONE },
        { key: "rest", label: T.others, value: 100 - p, text: `${100 - p}%`, color: FOLD_COLOR },
      ]} />
      <SplitLegend className="mt-2" parts={[{ key: "part", label, text: `${p}%`, color: ONE }]} />
    </>
  ));

  return frame(
    <>
      {/* The five answers, in the order asked: how many, how many women, how
          old, how long here, where from. A share carries its split — the
          gender donut that used to stand under this row said only what the
          «Women» tile's bar now does. */}
      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3 lg:gap-4 mb-4 lg:mb-6">
        <KPICard className="max-sm:col-span-2" size="lg" label={T.kPeople} value={total.toLocaleString("ru-RU")}
          sub={fill(T.kPeopleSub, { n: d.groups.unit.length })}
          tooltip={scope === "zagruzka" ? T.kPeopleTipZag : T.kPeopleTipAll} />
        <KPICard label={T.kWomen} value={`${pct(d.gender.F, total) ?? 0}%`} tooltip={T.kWomenTip}>
          <SplitBar parts={genderParts.map((p) => ({ key: p.key, label: p.label, value: p.n, color: p.color }))} />
          <SplitLegend className="mt-2"
            parts={genderParts.map((p) => ({ key: p.key, label: p.label, text: p.n.toLocaleString("ru-RU"), color: p.color }))} />
        </KPICard>
        <KPICard label={T.kAge} value={s.age_mean != null ? s.age_mean.toFixed(1) : "—"} tooltip={T.kAgeTip}
          sub={s.age_known ? fill(T.kAgeMedian, { med: Math.round(s.age_median) }) : undefined}>
          {share(youngShare, T.colYoung)}
        </KPICard>
        <KPICard label={T.kTenure} value={months(s.ten_median)} tooltip={T.kTenureTip}>
          {share(newShare, T.colNew)}
        </KPICard>
        <KPICard label={T.kPlace} value={s.top_place_label ? placeText(s.top_place_label) : "—"} tooltip={T.kPlaceTip}
          sub={topRegion ? regionName(topRegion) : undefined}>
          {share(placeShare, T.kPlaceShare)}
        </KPICard>
      </div>

      {/* Age · tenure side by side, then where people live across the
          width — its list in two columns, so nothing is squeezed. */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6 mb-4 lg:mb-6">
        <ChartCard icon={Cake} title={T.pyramid} info={T.pyramidTip} bodyClassName="px-2 pt-2 pb-3">
          <ReactApexChart key={`p-${lang}-${chartTheme.mode}-${ageMax}-${phone}`} type="bar" height={chartH}
            series={pyramidSeries} options={pyramidOptions} />
          {d.age.unknown > 0 && <div className="px-2"><Foot>{fill(T.ageUnknown, { n: d.age.unknown })}</Foot></div>}
        </ChartCard>
        <ChartCard icon={CalendarClock} title={T.tenure} info={T.tenureTip} bodyClassName="px-2 pt-2 pb-3">
          <ReactApexChart key={`t-${lang}-${chartTheme.mode}-${phone}`} type="bar" height={chartH}
            series={[{ name: T.people, data: tenBands.map((b) => b.n) }]} options={tenureOptions} />
          {d.tenure.unknown > 0 && <div className="px-2"><Foot>{fill(T.tenureUnknown, { n: d.tenure.unknown })}</Foot></div>}
        </ChartCard>
        <ChartCard icon={MapPin} title={T.place} info={T.placeTip} className="lg:col-span-2"
          right={(
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <SegmentedToggle size="sm" value={src} onChange={setSrc}
                options={[["live", T.srcLive], ["prop", T.srcProp]]} />
              <SegmentedToggle size="sm" value={lvl} onChange={setLvl}
                options={[["district", T.lvlDistrict], ["region", T.lvlRegion]]} />
            </div>
          )}>
          {/* Two columns from lg up, read down the first then the second —
              the same order and one shared scale, so bars compare across. */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-3">
          {[placeRows.slice(0, Math.ceil(placeRows.length / 2)), placeRows.slice(Math.ceil(placeRows.length / 2))].map((half, hi) => (
          <RankedList key={hi}
            rows={half.map((r) => ({
              ...r,
              label: r.rest ? T.others : placeName(r),
              title: r.rest ? T.others : (lvl === "district" && r.region ? `${placeName(r)} · ${regionName(r.region)}` : placeName(r)),
            }))}
            max={placeMax}
            parts={[{ key: "n", label: T.people, color: ONE }, { key: "fold", label: T.people, color: FOLD_COLOR }]}
            unit={T.people}
            extra={(r) => (lvl === "district" && !r.rest && r.region
              ? <span className="text-[11px] truncate max-w-[40%]" style={{ color: "var(--text-3)" }}>{regionName(r.region)}</span>
              : null)}
            value={(r) => (
              <span className="text-xs font-bold tabular-nums whitespace-nowrap" style={{ color: "var(--text-1)" }}>
                {fill(T.placeShare, { n: r.total, pct: pct(r.total, placed + placeUnknown) })}
              </span>
            )}
          />
          ))}
          </div>
          {placeUnknown > 0 && <Foot>{fill(T.placeUnknown, { n: placeUnknown })}</Foot>}
        </ChartCard>
      </div>

      {/* The breakdown — who these figures are made of. */}
      <TableCard
        icon={group === "unit" ? UserRound : group === "job" ? Briefcase : Grid3x3}
        title={T.table}
        right={(
          <div className="flex items-center gap-2">
            <SegmentedToggle size="sm" value={group} onChange={setGroup}
              options={[["unit", T.byUnit], ["job", T.byJob], ["cell", T.byCell]]} />
            <span className="text-xs tabular-nums whitespace-nowrap max-sm:hidden" style={{ color: "var(--text-3)" }}>
              {needle ? fill(T.rowsOf, { n: shown.length, total: items.length }) : fill(T.rows, { n: items.length })}
            </span>
          </div>
        )}
        toolbar={(
          <SearchInput value={query} onChange={setQuery} placeholder={T.searchPh[group]}
            aria-label={T.searchAria} clearLabel={T.searchClear} className="w-full sm:w-72" />
        )}
        minWidth={820}
      >
        <thead>
          <tr>
            <Th label={T.colName[group]} k="name" sort={sort} onSort={onSort} />
            <Th label={T.colN} k="n" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colWomen} k="women" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colAge} k="age" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colYoung} k="young" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colTenure} k="tenure" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colNew} k="fresh" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colPlace} k="place" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {shown.map(({ r, name, boss }) => {
            const sub = boss ? surnameInitial(boss) : null;
            const wp = pct(r.women, r.n);
            return (
              <tr key={String(r.key)}>
                <td className="px-3 py-2 max-w-[260px] truncate" title={boss ? `${name} · ${boss}` : name}>
                  <span className={group === "cell" ? "font-mono" : ""}>{name}</span>
                  {sub && <span className="ml-2" style={{ color: "var(--text-3)" }}>{sub}</span>}
                </td>
                <td className={`${numCell} font-semibold`}>{r.n}</td>
                <td className={numCell}>
                  <span className="inline-flex items-center justify-end gap-2">
                    <span aria-hidden className="w-10 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}>
                      <span className="block h-full rounded-full" style={{ width: `${wp ?? 0}%`, background: WOMEN }} />
                    </span>
                    {wp == null ? "—" : `${wp}%`}
                  </span>
                </td>
                <td className={numCell}>{r.age_mean != null ? r.age_mean.toFixed(1) : "—"}</td>
                <td className={numCell}>{r.age_known ? `${pct(r.young, r.age_known)}%` : "—"}</td>
                <td className={numCell}>{months(r.ten_median)}</td>
                <td className={numCell}>{r.ten_known ? `${pct(r.new, r.ten_known)}%` : "—"}</td>
                <td className="px-3 py-2 max-w-[200px] truncate" title={placeText(r.top_place_label) || ""}>
                  {r.top_place_label
                    ? <>{placeText(r.top_place_label)} <span style={{ color: "var(--text-3)" }}>{pct(r.top_place_n, r.n)}%</span></>
                    : "—"}
                </td>
              </tr>
            );
          })}
          {needle && !shown.length && (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center whitespace-normal" style={{ color: "var(--text-3)" }}>
                {fill(T.noMatch, { q: query.trim().slice(0, 60) })}
              </td>
            </tr>
          )}
        </tbody>
      </TableCard>
    </>,
  );
}
