// «Liderlar KPI» (/leaders-kpi) — the leaders' five KPIs on ONE page, as a
// leaderboard, month by month (2026-10-19, the operator's rulings; it merged
// /worker-concerns, /turnover and /foreign-objects, which now redirect here).
//
// One question per screen: «which cell — and so which owner — stands where
// this month, and why». Six tabs over ONE request (`GET /api/leaders-kpi`):
// the board (one row per OWNED cell, the Σ of five KPI scores × weights out
// of 5), then one tab per KPI — the four the platform computes (worker
// concerns · turnover · foreign objects · category compliance: a ranking with
// its register behind a toggle) and the one it has no source for yet (the
// technologists' audit: an empty state with HR's rule). The month, the plant / shift / brigadir scope and the search are
// shared by every tab. `services/leaders_kpi.py` computes; this page never
// re-derives a figure, only filters what it shows.
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
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
import { useAuth } from "../context/AuthContext";
import { useTranslit } from "../utils/transliterate";
import { usePersistentState } from "../hooks/usePersistentState";
import { usePageAccess } from "../hooks/usePageAccess";
import { useCapabilities } from "../hooks/useCapabilities";
import { canAccessPage } from "../config/pages";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import { TXT, fill } from "./leadersKpiText";
import { TXT as TXT_T } from "./turnoverText";
import { TXT as TXT_F } from "./foreignObjectsText";
import LeaderboardTab from "../components/kpi/LeaderboardTab";
import ConcernsTab from "../components/kpi/ConcernsTab";
import TurnoverTab from "../components/kpi/TurnoverTab";
import ForeignTab from "../components/kpi/ForeignTab";
import ComplianceTab from "../components/kpi/ComplianceTab";
import PlaceholderTab from "../components/kpi/PlaceholderTab";
import CellKpiModal from "../components/kpi/CellKpiModal";
import KpiRulesModal from "../components/kpi/KpiRulesModal";
import { ConcernsCellModal, ConcernDetailModal } from "../components/kpi/ConcernsPieces";
import TurnoverExplain from "../components/turnover/TurnoverExplain";
import ForeignExplain from "../components/foreign/ForeignExplain";
import ComplianceExplain from "../components/kpi/ComplianceExplain";
import { PAST_FROM, curMonth, errText, monthLabel, scoreOf, sortRows, todayISO, useSort } from "../components/kpi/kpiUtil";

const TAB_KEYS = ["board", "concerns", "turnover", "foreign", "compliance", "audit"];

// The last calendar day of «YYYY-MM» — the register's `date_to`.
const lastDayOf = (ym) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, "0")}`;
};

export default function LeadersKpi() {
  const { t, lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const TT = TXT_T[lang] || TXT_T.uz;
  const TF = TXT_F[lang] || TXT_F.uz;
  const { tl, tx } = useTranslit();
  const { auth } = useAuth();
  const isAdmin = auth?.role === "admin";
  const toast = useToast();
  const navigate = useNavigate();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  const mayConcerns = canAccessPage(auth?.role, "concerns", access, capPages, deniedPages);

  const [tab, setTab] = usePersistentState("lkpi.tab", "board");
  const [month, setMonth] = usePersistentState("lkpi.month", null);
  const [shift, setShift] = usePersistentState("lkpi.shift", null);
  const [brig, setBrig] = usePersistentState("lkpi.brig", []);
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState(null);     // a board row's dialog
  const [ex, setEx] = useState(null);               // {kind, key, item} — a KPI's own working
  const [detail, setDetail] = useState(null);       // one concern, opened from a cell's dialog
  const [rulesOpen, setRulesOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sort, onSort] = useSort("lkpi.sortB", { key: "rank", dir: "asc" });

  // A deep link opens its tab once per mount (the /leaders rule): the three
  // retired pages redirect here with their own tab named.
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
    queryKey: ["leaders-kpi", params],
    queryFn: () => api.get("/api/leaders-kpi", { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
    // A Verifix read the turnover or the compliance tab started finishes in
    // the background — ask again until it has.
    refetchInterval: (query) => {
      const d = query.state.data;
      return d?.turnover?.read?.running || d?.compliance?.read?.running ? 4000 : false;
    },
  });
  const data = dataQ.data;
  const refetch = () => dataQ.refetch();

  // A brigadir pick the narrowed list no longer offers is dropped — a filter
  // naming a value the page cannot show is worse than a reset.
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

  // ── the board's rows: what the search leaves, in the picked order ──────────
  const needle = q.trim().toLowerCase();
  const has = (...vals) => !needle || vals.some((v) => v && String(v).toLowerCase().includes(needle));
  const nameBoth = (v) => [v, v ? tl(v) : null];
  const allRows = useMemo(() => data?.rows || [], [data]);
  const rows = useMemo(() => {
    const kept = allRows.filter((x) => has(x.code, ...nameBoth(x.owner), ...nameBoth(x.brigadir)));
    return sortRows(kept, sort, (x, k) => {
      switch (k) {
        case "rank": return x.rank;
        case "code": return x.code;
        case "owner": return tl(x.owner || "");
        case "brigadir": return tl(x.brigadir || "");
        case "total": return x.total;
        case "pct": return x.pct;
        default: return scoreOf(x, k);
      }
    });
  }, [allRows, needle, sort, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  // The concerns register (the list behind the concerns tab and a cell's open
  // concerns) is asked for the same month and scope the board was scored
  // over: a shift pick narrows it to that shift's brigadirs.
  const listParams = useMemo(() => {
    const ids = brig.length ? brig : (shift != null ? brigOpts.map((b) => b.id) : []);
    return {
      date_from: `${ym}-01`, date_to: lastDayOf(ym),
      ...(params.factory != null ? { factory: params.factory } : {}),
      ...(ids.length ? { manager_id: ids } : {}),
    };
  }, [ym, params.factory, brig, shift, brigOpts]);

  // ── Excel ─────────────────────────────────────────────────────────────────
  const state = data?.state;
  const showMonth = !!data && ["open", "ended"].includes(state);
  const scopeText = [
    params.factory != null && factorySection?.display,
    shift && fill(T.shiftN, { n: shift }),
    brig.length && brig.map(brigName).join(", "),
  ].filter(Boolean).join(" · ") || T.mScopeAll;
  const runExport = async () => {
    setExporting(true);
    try {
      const via = await exportXlsx("/api/leaders-kpi/export.xlsx", {
        body: {
          month: ym, factory: params.factory ?? null, shift: shift ?? null, managers: brig || [], lang,
          title: `${T.title} — ${mLabel}`,
          subtitle: state === "open"
            ? fill(T.lineOpen, { from: data.period?.from?.split("-").reverse().join("."), asOf: data.as_of?.split("-").reverse().join(".") })
            : fill(T.lineEnded, { from: data.period?.from?.split("-").reverse().join("."), to: data.period?.to?.split("-").reverse().join(".") }),
          filename: `${T.title} ${ym}`, caption: `📊 ${T.title} — ${mLabel}`,
          labels: { ...T.xl, kinds: TF.kinds, sources: TF.sources, qstatuses: TF.statuses, statuses: T.statuses },
          meta: [
            { label: T.mMonth, value: mLabel },
            { label: T.mState, value: ({ open: T.stOpen, ended: T.stEnded })[state] || "—" },
            { label: T.mScope, value: scopeText },
          ],
          order: rows.map((x) => x.key),
        },
        fallbackName: `leaders-kpi-${ym}.xlsx`,
      });
      toast.success(via === "download" ? T.tExportDl : T.tExportTg);
    } catch (e) {
      toast.error(fill(T.tExportFail, { e: await errText(e) }));
    } finally {
      setExporting(false);
    }
  };

  // ── the dialogs ───────────────────────────────────────────────────────────
  const openRow = openKey ? allRows.find((x) => x.key === openKey) : null;
  // A KPI's own working opens over the board's dialog (or from its tab): the
  // item is re-read from the live payload each render, so a refetch — a
  // Verifix read finishing — updates what the dialog says.
  const openExplain = (kind, item) => setEx({ kind, key: item.key, item });
  const exItem = useMemo(() => {
    if (!ex || !data) return null;
    if (ex.kind === "turnover") {
      const r = (data.turnover?.ranking || []).find((x) => x.key === ex.key);
      if (r) return r;
      const b = allRows.find((x) => x.key === ex.key) || ex.item;
      return { key: b.key, id: b.id, code: b.code, owner: b.owner, brigadir: b.brigadir, ...(b.turnover || {}) };
    }
    if (ex.kind === "foreign") {
      const r = (data.foreign?.ranking || []).find((x) => x.key === ex.key);
      if (r) return r;
      const b = allRows.find((x) => x.key === ex.key) || ex.item;
      return { key: b.key, id: b.id, code: b.code, owner: b.owner, brigadir: b.brigadir, ...(b.foreign || {}) };
    }
    if (ex.kind === "compliance") {
      const r = (data.compliance?.ranking || []).find((x) => x.key === ex.key);
      if (r) return r;
      const b = allRows.find((x) => x.key === ex.key) || ex.item;
      return { key: b.key, id: b.id, code: b.code, owner: b.owner, brigadir: b.brigadir, ...(b.compliance || {}) };
    }
    return allRows.find((x) => x.key === ex.key) || ex.item;
  }, [ex, data, allRows]);
  const exTitle = exItem ? `${exItem.code} · ${exItem.owner ? tl(exItem.owner) : "—"}` : "";
  const exSub = exItem ? [exItem.brigadir ? tl(exItem.brigadir) : "", mLabel].filter(Boolean).join(" · ") : "";

  // ── rendering ─────────────────────────────────────────────────────────────
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

  const monthEmpty = (
    <EmptyState icon={Trophy} title={state === "before" ? T.beforeTitle : mLabel}
      message={state === "before" ? T.before : T.future} showUploadLink={false} />
  );

  let body;
  if (dataQ.isLoading && !data) {
    body = (
      <>
        <SkeletonBlock className="h-[88px] rounded-2xl mb-4" />
        <SkeletonTable rows={8} cols={7} />
      </>
    );
  } else if (dataQ.isError && !data) {
    body = (
      <EmptyState tone="danger" icon={AlertTriangle} title={T.loadFailed} message={T.loadFailedMsg} showUploadLink={false}
        action={<Button variant="secondary" onClick={() => dataQ.refetch()}>{T.retry}</Button>} />
    );
  } else if (data) {
    const noMonth = state === "before" || state === "future";
    switch (tabKey) {
      case "concerns":
        body = noMonth ? monthEmpty : (
          <ConcernsTab T={T} t={t} tl={tl} data={data} rows={allRows} needle={needle} listParams={listParams}
            onOpenCell={(x) => openExplain("concerns", x)} mayConcerns={mayConcerns} />
        );
        break;
      case "turnover":
        body = (
          <TurnoverTab T={TT} tl={tl} tx={tx} data={data} ym={ym} mLabel={mLabel} needle={needle}
            isAdmin={isAdmin} toast={toast} refetch={refetch} onExplain={openExplain} />
        );
        break;
      case "foreign":
        body = (
          <ForeignTab T={TF} tl={tl} tx={tx} data={data} mLabel={mLabel} needle={needle}
            isAdmin={isAdmin} toast={toast} refetch={refetch} onExplain={openExplain} />
        );
        break;
      case "compliance":
        body = (
          <ComplianceTab T={T} tl={tl} tx={tx} data={data} ym={ym} mLabel={mLabel} needle={needle}
            isAdmin={isAdmin} toast={toast} refetch={refetch} onExplain={openExplain} />
        );
        break;
      case "audit":
        body = <PlaceholderTab T={T} kind={tabKey} rule={data.rules?.[tabKey]} />;
        break;
      default:
        body = noMonth ? monthEmpty : (
          <LeaderboardTab T={T} tl={tl} data={data} rows={rows} sort={sort} onSort={onSort}
            onOpen={(x) => setOpenKey(x.key)} onRules={() => setRulesOpen(true)} />
        );
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
        <CellKpiModal T={T} tl={tl} row={openRow} data={data} count={allRows.length}
          onClose={() => setOpenKey(null)} onExplain={openExplain} />
      )}
      {ex?.kind === "turnover" && exItem && data?.turnover && (
        <TurnoverExplain open onClose={() => setEx(null)} item={exItem} kind="cell" data={data.turnover}
          T={TT} tl={tl} tx={tx} title={exTitle} subtitle={exSub} zIndex={openRow ? 60 : undefined} />
      )}
      {ex?.kind === "foreign" && exItem && data?.foreign && (
        <ForeignExplain open onClose={() => setEx(null)} item={exItem} data={data.foreign}
          T={TF} tx={tx} title={exTitle} subtitle={exSub} zIndex={openRow ? 60 : undefined} />
      )}
      {ex?.kind === "compliance" && exItem && data?.compliance && (
        <ComplianceExplain open onClose={() => setEx(null)} item={exItem} data={data.compliance} ym={ym}
          T={T} tl={tl} tx={tx} title={exTitle} subtitle={exSub} zIndex={openRow ? 60 : undefined} />
      )}
      {ex?.kind === "concerns" && exItem && data && (
        <ConcernsCellModal T={T} tl={tl} row={exItem} data={data} listParams={listParams}
          zIndex={openRow ? 60 : undefined} onClose={() => setEx(null)} onOpenConcern={setDetail} />
      )}
      {detail && (
        <ConcernDetailModal T={T} t={t} tl={tl} detail={detail} zIndex={70} onClose={() => setDetail(null)}
          mayConcerns={mayConcerns} onOpenPage={(d) => navigate(`/concerns?open=${d.id}`)} />
      )}
      {rulesOpen && <KpiRulesModal open onClose={() => setRulesOpen(false)} data={data} T={T} />}
      {toast.node}
    </Layout>
  );
}
