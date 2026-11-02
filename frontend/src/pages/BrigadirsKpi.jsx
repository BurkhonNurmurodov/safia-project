// «Brigadirlar KPI» (/brigadirs-kpi) — HR's monthly brigadir KPI (2026-11-02):
// four pass / fail criteria at 25% each. The two the platform answers are
// computed — «Qo'nimsizlik» (turnover, Verifix) and «OKK tuzatuvchi choralar»
// (the quality register) — and the three it has no source for yet —
// «Murabbiylik», «KRU» and the payout — are places with the rule printed.
// Brigadirs who are not units on the platform (washing, kitchen, supply,
// logistics…) come from Verifix, marked so. One request serves every tab
// (`GET /api/brigadirs-kpi`); `services/brigadirs_kpi.py` computes, this page
// only filters and orders what it shows.
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileSpreadsheet, Layers, Trophy, UserCog } from "lucide-react";
import Layout from "../components/layout/Layout";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Button from "../components/ui/Button";
import SearchInput from "../components/ui/SearchInput";
import EmptyState from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonTable } from "../components/ui/Skeleton";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { usePersistentState } from "../hooks/usePersistentState";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import { TXT, fill } from "./brigadirsKpiText";
import { BoardTab, OkkTab, PlaceholderTab, TurnoverTab } from "../components/brigadirkpi/BkpiTabs";
import { BrigadirModal, RulesModal } from "../components/brigadirkpi/BkpiModals";
import { PAST_FROM, curMonth, errText, monthLabel, sortRows, todayISO, useSort } from "../components/kpi/kpiUtil";

const TAB_KEYS = ["board", "turnover", "okk", "mentoring", "kru", "payout"];
const PLACES = new Set(["mentoring", "kru", "payout"]);

export default function BrigadirsKpi() {
  const { t, lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const { tl, tx } = useTranslit();
  const toast = useToast();

  const [tab, setTab] = usePersistentState("bkpi.tab", "board");
  const [month, setMonth] = usePersistentState("bkpi.month", null);
  const [shift, setShift] = usePersistentState("bkpi.shift", null);
  const [brig, setBrig] = usePersistentState("bkpi.brig", []);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(null);           // {key, part}
  const [rulesOpen, setRulesOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sortB, onSortB] = useSort("bkpi.sortB", { key: "passed", dir: "desc" });
  const [sortT, onSortT] = useSort("bkpi.sortT", { key: "rate", dir: "desc" });
  const [sortO, onSortO] = useSort("bkpi.sortO", { key: "pct", dir: "asc" });

  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const want = new URLSearchParams(window.location.search).get("tab");
    if (want && TAB_KEYS.includes(want)) setTab(want);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const tabKey = TAB_KEYS.includes(tab) ? tab : "board";

  const ym = month && month >= PAST_FROM ? month : curMonth();
  const mLabel = monthLabel(ym, t);
  const factorySection = useFactorySection();

  const base = useMemo(() => ({
    month: ym,
    ...(shift ? { shift } : {}),
    ...(brig?.length ? { managers: brig.join(",") } : {}),
  }), [ym, shift, brig]);
  const params = useFactoryParams(base);

  const dataQ = useQuery({
    queryKey: ["brigadirs-kpi", params],
    queryFn: () => api.get("/api/brigadirs-kpi", { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const data = dataQ.data;
  const state = data?.state;

  // A brigadir pick the narrowed list no longer offers is dropped.
  const brigOpts = useMemo(() => (data?.options?.brigadirs || [])
    .filter((b) => (shift == null || b.shift === shift) && (params.factory == null || b.factory_id === params.factory)),
  [data, shift, params.factory]);
  useEffect(() => {
    if (!data?.options || !brig?.length) return;
    const ok = new Set(brigOpts.map((b) => b.id));
    const kept = brig.filter((id) => ok.has(id));
    if (kept.length !== brig.length) setBrig(kept);
  }, [brigOpts]); // eslint-disable-line react-hooks/exhaustive-deps

  const brigName = (id) => tl((data?.options?.brigadirs || []).find((b) => b.id === id)?.name || `#${id}`);
  const shifts = data?.options?.shifts?.length ? data.options.shifts : [1, 2];
  const sections = [
    ...(factorySection ? [factorySection] : []),
    {
      key: "shift", icon: Layers, label: T.fShift, active: shift != null,
      display: shift ? fill(T.shiftN, { n: shift }) : "", onClear: () => setShift(null),
      render: ({ close } = {}) => (
        <PickFilter
          opts={[{ value: "__all__", label: T.all }, ...shifts.map((s) => ({ value: s, label: fill(T.shiftN, { n: s }) }))]}
          value={shift ?? "__all__"} onChange={(v) => setShift(v === "__all__" ? null : Number(v))} close={close} />
      ),
    },
    {
      key: "brig", icon: UserCog, label: T.fBrigadir, active: brig.length > 0,
      display: brig.map(brigName).join(", "), onClear: () => setBrig([]),
      render: () => (
        <OptsFilter opts={brigOpts.map((b) => b.id)} sel={brig} onChange={setBrig} render={brigName} searchable
          note={shift != null ? `${fill(T.shiftN, { n: shift })} · ${brigOpts.length}` : null} />
      ),
    },
  ];

  // ── the rows the search leaves, the board in its picked order ─────────────
  const needle = q.trim().toLowerCase();
  const allRows = useMemo(() => data?.rows || [], [data]);
  const found = useMemo(() => (needle
    ? allRows.filter((x) => [x.name, x.name ? tl(x.name) : null].some((v) => v && String(v).toLowerCase().includes(needle)))
    : allRows), [allRows, needle, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const boardRows = useMemo(() => sortRows(found, sortB, (x, k) => ({
    name: tl(x.name || ""), shift: x.shift, passed: x.passed,
    turnover: x.turnover?.value, okk: x.okk?.pct,
  })[k]), [found, sortB, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Excel ─────────────────────────────────────────────────────────────────
  const showMonth = !!data && ["open", "ended"].includes(state);
  const dmyOf = (iso) => (iso ? iso.split("-").reverse().join(".") : "");
  const runExport = async () => {
    setExporting(true);
    try {
      const scope = [
        params.factory != null && factorySection?.display,
        shift && fill(T.shiftN, { n: shift }),
        brig.length && brig.map(brigName).join(", "),
      ].filter(Boolean).join(" · ");
      const via = await exportXlsx("/api/brigadirs-kpi/export.xlsx", {
        body: {
          month: ym, factory: params.factory ?? null, shift: shift ?? null, managers: brig || [],
          title: `${T.title} — ${mLabel}`,
          subtitle: [`${dmyOf(data.period?.from)} — ${dmyOf(state === "open" ? data.as_of : data.period?.to)}`,
            state === "open" ? T.notOver : null, scope || null].filter(Boolean).join(" · "),
          filename: `${T.title} ${ym}`, caption: `📊 ${T.title} — ${mLabel}`,
          labels: { ...T.xl, statuses: T.statuses },
          order: boardRows.map((x) => x.key),
        },
        fallbackName: `brigadirs-kpi-${ym}.xlsx`,
      });
      toast.success(via === "download" ? T.tExportDl : T.tExportTg);
    } catch (e) {
      toast.error(fill(T.tExportFail, { e: await errText(e) }));
    } finally {
      setExporting(false);
    }
  };

  const openRow = open ? allRows.find((x) => x.key === open.key) : null;
  const onOpen = (x, part) => setOpen({ key: x.key, part });

  const toolbar = (
    <div className="flex items-center gap-2 mb-4 flex-wrap">
      <DateRangePicker month dateFrom={`${ym}-01`} dateTo={`${ym}-28`}
        setDateFrom={(iso) => setMonth(String(iso).slice(0, 7))} setDateTo={() => {}}
        min={`${PAST_FROM}-01`} max={todayISO()} triggerClassName="px-3 py-2 text-sm" />
      <FilterPanel sections={sections} />
      <SearchInput value={q} onChange={setQ} placeholder={T.search} className="flex-1 min-w-[160px] max-w-xs" />
      <Button size="lg" variant="secondary" className="ml-auto" icon={<FileSpreadsheet size={15} />}
        loading={exporting} disabled={!showMonth} onClick={runExport}>
        <span className="max-sm:hidden">{T.excel}</span>
      </Button>
    </div>
  );

  let body;
  if (dataQ.isLoading && !data) {
    body = (
      <>
        <SkeletonBlock className="h-[52px] w-full max-w-sm rounded-xl mb-4" />
        <SkeletonTable rows={8} cols={8} />
      </>
    );
  } else if (dataQ.isError && !data) {
    body = (
      <EmptyState tone="danger" icon={AlertTriangle} title={T.loadFailed} message={T.loadFailedMsg} showUploadLink={false}
        action={<Button variant="secondary" onClick={() => dataQ.refetch()}>{T.retry}</Button>} />
    );
  } else if (data) {
    if (PLACES.has(tabKey)) {
      body = <PlaceholderTab T={T} kind={tabKey} data={data} />;
    } else if (state === "before" || state === "future") {
      body = <EmptyState icon={Trophy} title={state === "before" ? T.beforeTitle : mLabel}
        message={state === "before" ? T.before : T.future} showUploadLink={false} />;
    } else if (tabKey === "turnover") {
      body = <TurnoverTab T={T} tl={tl} data={data} rows={found} sort={sortT} onSort={onSortT}
        onOpen={onOpen} onRules={() => setRulesOpen(true)} />;
    } else if (tabKey === "okk") {
      body = <OkkTab T={T} tl={tl} data={data} rows={found} sort={sortO} onSort={onSortO}
        onOpen={onOpen} onRules={() => setRulesOpen(true)} />;
    } else {
      body = <BoardTab T={T} tl={tl} data={data} rows={boardRows} sort={sortB} onSort={onSortB}
        onOpen={onOpen} onRules={() => setRulesOpen(true)} />;
    }
  }

  return (
    <Layout title={T.title}>
      <div className="mb-3">
        <SegmentedToggle asTabs value={tabKey} onChange={setTab} ariaLabel={T.title}
          options={TAB_KEYS.map((k) => [k, T.tabs[k]])} />
      </div>
      {toolbar}
      {body}

      {openRow && data && (
        <BrigadirModal T={T} tl={tl} tx={tx} row={openRow} data={data} part={open.part} mLabel={mLabel}
          onPart={(p) => setOpen((o) => ({ ...o, part: p }))} onClose={() => setOpen(null)} />
      )}
      {rulesOpen && data && <RulesModal T={T} data={data} onClose={() => setRulesOpen(false)} />}
      {toast.node}
    </Layout>
  );
}
