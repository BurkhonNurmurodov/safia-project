import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  Layers, Truck, Package, Info, RotateCw, SlidersHorizontal, RefreshCw, AlertTriangle, Database,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import { useToast } from "../components/ui/Toast";
import { SkeletonCard, SkeletonChart, SkeletonBlock } from "../components/ui/Skeleton";
import StatusBandsModal from "../components/overview/StatusBandsModal";
import OntimeOverview from "../components/ontime/OntimeOverview";
import OntimeProducts from "../components/ontime/OntimeProducts";
import OntimeDays from "../components/ontime/OntimeDays";
import OntimeProductModal from "../components/ontime/OntimeProductModal";
import { useOT, fill, ddmm, useGroupName } from "../components/ontime/ontimeUtil";
import { usePersistentState } from "../hooks/usePersistentState";
import useStatusBands from "../hooks/useStatusBands";
import { useTranslit } from "../utils/transliterate";
import { padChartParams } from "../utils/chartRange";
import api from "../utils/api";

const NO_LIST = [];

// «O'z vaqtida yetkazish» (/ontime) — of what the stores ordered, how much did
// production post inside its shipping wave's window, and where it did not:
// which products, which groups, which waves, on which days. The logistics
// team's «on time report» Google sheet, read by the server every two hours
// (services/ontime_sync.py) and computed the sheet's own way
// (services/ontime.py), so a day here equals the sheet's «свод» for that day.
//
// ONE request feeds three views (GET /api/ontime/analysis): the overview, the
// products register and the group × day heatmap. The period defaults to the
// last 14 days the sheet holds — the team pastes a day after it ends, so
// «today» is usually not in it yet. Filters: group, wave, product.
export default function Ontime() {
  const T = useOT();
  const { tx } = useTranslit();
  const gn = useGroupName();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const bands = useStatusBands();   // the on-time band paints every figure here

  const [tab, setTab] = usePersistentState("ontime_tab", "overview");
  const [range, setRange] = useState(null);           // null = the latest 14 days of data
  const [groupSel, setGroupSel] = usePersistentState("ontime_groups", NO_LIST);
  const [waveSel, setWaveSel] = usePersistentState("ontime_waves", NO_LIST);
  const [prodSel, setProdSel] = usePersistentState("ontime_prods", NO_LIST);
  const [prodShow, setProdShow] = usePersistentState("ontime_prod_show", "all");
  const [product, setProduct] = useState(null);
  const [bandsOpen, setBandsOpen] = useState(false);
  const bandFigures = useMemo(() => [{ key: "ontime", label: T.bandLabel, dir: "high", unit: "%" }], [T]);

  const reqParams = useMemo(() => {
    const p = {};
    if (range?.from) p.date_from = range.from;
    if (range?.to) p.date_to = range.to;
    if (groupSel.length) p.group = groupSel;
    if (waveSel.length) p.wave = waveSel;
    if (prodSel.length) p.material = prodSel;
    return p;
  }, [range, groupSel, waveSel, prodSel]);

  const { data, isPending, isPlaceholderData, isError, refetch } = useQuery({
    queryKey: ["ontime", reqParams],
    queryFn: () => api.get("/api/ontime/analysis", { params: reqParams }).then((r) => r.data),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // The trend never spans fewer than 7 days (utils/chartRange.js).
  const chartParams = useMemo(() => (reqParams.date_to ? padChartParams(reqParams) : reqParams), [reqParams]);
  const padded = chartParams !== reqParams;
  const { data: chartData } = useQuery({
    queryKey: ["ontime", chartParams],
    queryFn: () => api.get("/api/ontime/analysis", { params: chartParams }).then((r) => r.data),
    enabled: padded,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // ── the sheet read: while one runs, watch it land ─────────────────────────
  const running = !!data?.read?.running;
  const [watching, setWatching] = useState(false);
  const { data: readNow } = useQuery({
    queryKey: ["ontime-read"],
    queryFn: () => api.get("/api/ontime/read").then((r) => r.data),
    enabled: running || watching,
    refetchInterval: 4000,
  });
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!readNow) return;
    if (readNow.running) { wasRunning.current = true; return; }
    if (wasRunning.current || watching) {
      wasRunning.current = false;
      setWatching(false);
      qc.invalidateQueries({ queryKey: ["ontime"] });
      const last = readNow.last;
      if (last?.ok) toast.success(T.readDone);
      else if (last && last.ok === false) toast.error(fill(T.readFailedToast, { e: errText(last.error) }));
    }
  }, [readNow]); // eslint-disable-line react-hooks/exhaustive-deps

  async function startRead() {
    try {
      const { data: r } = await api.post("/api/ontime/read");
      if (r.started) { toast.info(T.readStarted); setWatching(true); wasRunning.current = true; }
      else toast.info(T.readBusy);
      qc.invalidateQueries({ queryKey: ["ontime-read"] });
    } catch (err) {
      toast.error(err?.response?.data?.detail?.code === "not_configured" ? T.notConfiguredTitle : T.loadError);
    }
  }

  // «no_tab: заявки» → «jadvalda «заявки» varag'i yo'q».
  function errText(e) {
    if (!e) return T.err.error;
    const [code, ...rest] = String(e).split(":");
    const tpl = T.err[code.trim()];
    return tpl ? fill(tpl, { d: rest.join(":").trim() }) : String(e);
  }

  // ── filters ───────────────────────────────────────────────────────────────
  const optGroups = data?.options?.groups || NO_LIST;
  const optWaves = data?.options?.waves || NO_LIST;
  const prodOptions = data?.product_options || NO_LIST;
  const prodNames = useMemo(() => new Map(prodOptions.map((o) => [o.material, o])), [prodOptions]);
  const groupOpts = useMemo(() => [...groupSel.filter((g) => !optGroups.includes(g)), ...optGroups], [optGroups, groupSel]);
  const prodOpts = useMemo(() => {
    const inGroup = groupSel.length ? prodOptions.filter((o) => groupSel.includes(o.grp)) : prodOptions;
    const keys = inGroup.map((o) => o.material);
    return [...prodSel.filter((k) => !keys.includes(k)), ...keys];
  }, [prodOptions, prodSel, groupSel]);
  const prodLabel = (k) => {
    const o = prodNames.get(k);
    return o?.name ? `${tx(o.name)} · ${k}` : k;
  };
  const brief = (sel, label) => (sel.length === 1 ? label(sel[0]) : sel.length ? fill(T.nSelected, { n: sel.length }) : "");
  const waveLabel = (w) => fill(T.waveN, { n: w });

  const sections = [
    {
      key: "group", icon: Layers, label: T.fGroup, group: T.grpScope, pinned: true,
      active: groupSel.length > 0, display: brief(groupSel, gn),
      onClear: () => setGroupSel([]),
      render: () => (
        <OptsFilter searchable opts={groupOpts} sel={groupSel} onChange={setGroupSel}
          labelOf={gn} render={gn} note={fill(T.groupsNote, { n: optGroups.length })} />
      ),
    },
    {
      key: "wave", icon: Truck, label: T.fWave, group: T.grpScope, pinned: true,
      active: waveSel.length > 0, display: brief(waveSel, waveLabel),
      onClear: () => setWaveSel([]),
      render: () => (
        <OptsFilter opts={optWaves} sel={waveSel} onChange={setWaveSel} labelOf={waveLabel} render={waveLabel} />
      ),
    },
    {
      key: "product", icon: Package, label: T.fProduct, group: T.grpScope,
      active: prodSel.length > 0, display: brief(prodSel, prodLabel),
      onClear: () => setProdSel([]),
      render: () => (
        <OptsFilter searchable opts={prodOpts} sel={prodSel} onChange={setProdSel}
          labelOf={prodLabel} render={prodLabel} note={fill(T.productsNote, { n: prodOpts.length })} />
      ),
    },
  ];
  const narrowed = groupSel.length || waveSel.length || prodSel.length;
  const clearPicks = () => { setGroupSel([]); setWaveSel([]); setProdSel([]); };

  // A group's name opens its products, narrowed to it.
  const openGroup = (g) => { setGroupSel([g]); setTab("products"); };
  const openTab = (to, show) => { if (show) setProdShow(show); setTab(to); };

  // ── what the page says about the data under it ────────────────────────────
  const read = data?.read;
  const ok = read?.ok;
  const last = read?.last;
  const stamp = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };
  const freshness = running || readNow?.running ? T.readRunning
    : ok?.finished_at ? fill(T.readAt, { at: stamp(ok.finished_at) }) : T.readNever;
  const failed = last && last.ok === false && last.finished_at;

  const notices = [];
  if (failed) {
    notices.push({ icon: AlertTriangle, warn: true,
      text: fill(T.readFailed, { at: stamp(last.finished_at), e: errText(last.error), ok: ok?.finished_at ? stamp(ok.finished_at) : "—" }) });
  }
  if (data?.notes?.overlap?.length) {
    notices.push({ icon: Info, text: fill(T.overlapNote, { g: data.notes.overlap.map(gn).join(", ") }) });
  }
  if (data?.notes?.no_window?.length) {
    notices.push({ icon: Info, text: fill(T.noWindowNote, {
      g: data.notes.no_window.map((x) => `${gn(x.grp)} (${Math.round(x.qty).toLocaleString("ru-RU")})`).join(", ") }) });
  }
  const skipped = ok?.notes ? Object.values(ok.notes.orders_skipped || {}).reduce((a, b) => a + b, 0)
    + Object.values(ok.notes.receipts_skipped || {}).reduce((a, b) => a + b, 0) : 0;
  if (skipped) notices.push({ icon: Info, text: fill(T.skippedNote, { n: skipped.toLocaleString("ru-RU") }) });

  const tabs = [
    ["overview", T.tabOverview],
    ["products", T.tabProducts],
    ["days", T.tabDays],
  ];
  const marked = useMemo(() => new Set(data?.data_days || NO_LIST), [data?.data_days]);
  const isAdmin = !!data?.is_admin;
  const notConfigured = data && !read?.configured;
  const neverRead = data && read?.configured && !ok;
  const empty = data && ok && !(data.totals?.demand > 0);

  return (
    <Layout title={T.title}>
      {/* The view switch is the page's first row: every filter below it
          narrows all three views. */}
      <div className="mb-3">
        <SegmentedToggle asTabs value={tab} onChange={setTab} options={tabs} ariaLabel={T.title} />
      </div>

      {/* ONE-ROW filter bar: the period inline, the scope in the panel, and on
          the right where the data comes from. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <DateRangePicker
          dateFrom={range?.from ?? data?.date_from ?? null}
          dateTo={range?.to ?? data?.date_to ?? null}
          setDateFrom={(v) => setRange((r) => ({ from: v, to: r?.to ?? data?.date_to ?? v }))}
          setDateTo={(v) => setRange((r) => ({ from: r?.from ?? data?.date_from ?? v, to: v }))}
          marked={marked}
          compactLabel triggerClassName="px-3 py-2 text-sm"
        />
        <FilterPanel sections={sections} chipsWrap />
        <div className="flex-1" />
        <span className="text-[11px] whitespace-nowrap flex items-center gap-1.5" style={{ color: failed ? "var(--status-warn)" : "var(--text-3)" }}
          title={ok?.order_rows ? `${ok.order_rows.toLocaleString("ru-RU")} · ${ok.receipt_rows?.toLocaleString("ru-RU")}` : undefined}>
          <Database size={12} /> {freshness}
        </span>
        {isAdmin && (
          <>
            <Button size="lg" variant="secondary" onClick={() => setBandsOpen(true)} title={T.bands} aria-label={T.bands}>
              <SlidersHorizontal size={14} />
            </Button>
            <Button size="lg" variant="secondary" onClick={startRead} loading={running || !!readNow?.running}
              disabled={!read?.configured} title={T.readNow} aria-label={T.readNow}>
              <RefreshCw size={14} />
            </Button>
          </>
        )}
      </div>

      {notices.length > 0 && (
        <div className="mb-4 space-y-2">
          {notices.map((n, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
              style={{ background: "var(--bg-inner)", border: `1px solid ${n.warn ? "var(--status-warn)" : "var(--border)"}`, color: "var(--text-2)" }}>
              <n.icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: n.warn ? "var(--status-warn)" : "var(--text-3)" }} />
              <span className="flex-1">{n.text}</span>
            </div>
          ))}
        </div>
      )}

      {isError && !data ? (
        <EmptyState tone="danger" title={T.loadError} message={T.loadErrorMsg} showUploadLink={false}
          action={<Button size="sm" variant="secondary" onClick={() => refetch()}><RotateCw size={12} /> {T.retry}</Button>} />
      ) : isPending || !data ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
            <SkeletonChart className="h-80 lg:col-span-2" />
            <SkeletonChart className="h-80" />
          </div>
          <SkeletonBlock className="h-64 rounded-2xl" />
        </div>
      ) : notConfigured ? (
        <EmptyState icon={Database} title={T.notConfiguredTitle}
          message={isAdmin ? T.notConfiguredAdmin : T.notConfiguredUser} showUploadLink={false}
          action={isAdmin ? <Button size="sm" variant="secondary" onClick={() => navigate("/admin/upload?tab=data")}>{T.openSources}</Button> : null} />
      ) : neverRead ? (
        <EmptyState icon={Database} title={running ? T.readRunning : T.neverReadTitle} message={T.neverReadMsg} showUploadLink={false}
          action={isAdmin && !running ? <Button size="sm" variant="secondary" onClick={startRead}><RefreshCw size={12} /> {T.readNow}</Button> : null} />
      ) : empty ? (
        <EmptyState
          title={narrowed ? T.emptyFiltered : T.emptyTitle}
          message={data.data_from ? fill(T.emptyRange, { from: ddmm(data.data_from), to: ddmm(data.data_to) }) : ""}
          showUploadLink={false}
          action={narrowed
            ? <Button size="sm" variant="secondary" onClick={clearPicks}>{T.clearPicks}</Button>
            : range ? <Button size="sm" variant="secondary" onClick={() => setRange(null)}>{T.showLatest}</Button> : null}
        />
      ) : (
        // Dimmed only while the figures on screen belong to the PREVIOUS filters.
        <div style={{ opacity: isPlaceholderData ? 0.6 : 1, transition: "opacity 150ms" }} aria-busy={isPlaceholderData}>
          {tab === "products" ? (
            <OntimeProducts data={data} onProduct={setProduct} show={prodShow} setShow={setProdShow} />
          ) : tab === "days" ? (
            <OntimeDays data={data} onGroup={openGroup} />
          ) : (
            <OntimeOverview data={data} chartData={padded ? chartData : null}
              onGroup={openGroup} onProduct={setProduct} onTab={openTab} />
          )}
        </div>
      )}

      {product && (
        <OntimeProductModal material={product} dateFrom={data?.date_from} dateTo={data?.date_to}
          onClose={() => setProduct(null)} />
      )}
      {isAdmin && (
        <StatusBandsModal open={bandsOpen} onClose={() => setBandsOpen(false)} bands={bands}
          figures={bandFigures} scope={T.bandScope} />
      )}
      {toast.node}
    </Layout>
  );
}
