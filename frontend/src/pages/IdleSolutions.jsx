import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Lightbulb, MapPin, UserRound } from "lucide-react";
import Layout from "../components/layout/Layout";
import { useAuth } from "../context/AuthContext";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useFilters } from "../context/FilterContext";
import { useFactoryParams, useFactorySupervisors } from "../context/FactoryContext";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import SolutionAnalytics from "../components/idle/SolutionAnalytics";
import SolutionStops from "../components/idle/SolutionStops";
import { usePersistentState } from "../hooks/usePersistentState";
import { CATS } from "../components/idle/categories";
import { TXT } from "./idleSolutionsText";
import api from "../utils/api";

/**
 * «Kutish yechimlari» — beside /downtime in Production. Two tabs:
 *
 *   Muammolar  every filed stop in reach as one flat list, and the sheet that
 *              writes a solution to it (components/idle/SolutionStops.jsx,
 *              GET /api/idle-solutions/stops) — for a brigadir and a cause's
 *              owner it opens on «Sizni kutmoqda», what waits on them, which
 *              the period below does not cut
 *   Tahlil     five plain questions about the period
 *              (components/idle/SolutionAnalytics.jsx, …/analytics)
 *
 * EVERYBODY who reads the page writes their OWN solution to a stop they can
 * see — the unit's brigadir, the cause's owner, a manager, an admin. A brigadir
 * has the first tab only, cut to their own unit by the server. This file is
 * the shell: the period, the filters, the tabs and the two reads.
 */
const catCode = (name) => String(name || "").replace(/^Cat\s*/i, "");
const CAT_ORDER = new Map(CATS.map((c, i) => [c.name, i]));

function useT() {
  const { lang } = useLang();
  return TXT[lang] || TXT.uz;
}

export default function IdleSolutions() {
  const T = useT();
  const { t } = useLang();
  const { tl } = useTranslit();
  const { auth } = useAuth();
  const isSupervisor = auth?.role === "supervisor"; // own unit's stops only: no Tahlil, no shift or brigadir filter
  const qc = useQueryClient();
  const { params, ready, dateFrom, dateTo, setDateFrom, setDateTo, shift, setShift, brigadirIds, setBrigadirIds } = useFilters();
  const fparams = useFactoryParams(params);
  const factorySection = useFactorySection();
  const [cats, setCats] = useState([]);       // causes picked, by stored name («Cat B»)
  const [cells, setCells] = useState([]);     // cells picked, by code
  const [startAll, setStartAll] = useState(false);   // Tahlil sent the reader here to see a problem whole
  const [savedView, setView] = usePersistentState("idle_solutions_view", "problems"); // problems | analytics
  const view = isSupervisor ? "problems" : savedView;
  // Brigadir picker: several at once, limited to the plant on screen (a pick
  // the plant no longer offers is dropped, never left over an empty page).
  const { data: allSupervisors = [] } = useQuery({
    queryKey: ["brigadirs-list"],
    queryFn: () => api.get("/api/managers/all").then((r) => r.data),
    staleTime: 300_000,
    enabled: !isSupervisor,
  });
  const scopedSupervisors = useFactorySupervisors(allSupervisors, brigadirIds, setBrigadirIds);
  const supOptions = useMemo(
    () => [...scopedSupervisors]
      .map((b) => ({ value: String(b.manager_id), label: tl(b.name) }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [scopedSupervisors, tl]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["idle-solutions-stops", fparams],
    queryFn: () => api.get("/api/idle-solutions/stops", { params: fparams }).then((r) => r.data),
    enabled: ready,
  });
  const analyticsQ = useQuery({
    queryKey: ["idle-solutions-analytics", fparams],
    queryFn: () => api.get("/api/idle-solutions/analytics", { params: fparams }).then((r) => r.data),
    enabled: ready && view === "analytics",
  });
  // A payload of another shape — the server still on the release before this
  // one, for the seconds a deploy takes — is a read that failed, never a crash.
  const stopsOk = Array.isArray(data?.stops);
  const tahlilOk = !!analyticsQ.data?.total;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["idle-solutions-stops"] });
    qc.invalidateQueries({ queryKey: ["idle-solutions-analytics"] });
    // the number on the menu row (Sidebar.jsx) counts the same waiting stops
    qc.invalidateQueries({ queryKey: ["idle-solutions-waiting"] });
  };

  const label = (code) => {
    const v = t(`downtime.cat.${code}.label`);
    return v && !v.startsWith("downtime.cat.") ? v : "";
  };
  const causeName = (c) => label(catCode(c)) || c;

  // The cause and cell pickers offer what the period holds, plus whatever is
  // picked — a pick the new period no longer has stays visible, so it can be cleared.
  const stops = data?.stops;
  const catOptions = useMemo(() => {
    const seen = new Set([...(stops || []).map((s) => s.category), ...cats]);
    return [...seen].sort((a, b) => (CAT_ORDER.get(a) ?? 99) - (CAT_ORDER.get(b) ?? 99));
  }, [stops, cats]);
  const cellOptions = useMemo(() => {
    const seen = new Set([...(stops || []).map((s) => s.cell).filter(Boolean), ...cells]);
    return [...seen].sort((a, b) => String(a).localeCompare(String(b)));
  }, [stops, cells]);
  const picked = (list, name) => (list.length === 1 ? name(list[0]) : `${list.length} ${t("filter.selected2")}`);

  // «Open in Problems» from the Tahlil tab: that cause (and cell), every stop of it.
  const openCause = (category, cell) => {
    setCats(category ? [category] : []);
    setCells(cell ? [cell] : []);
    setStartAll(true);
    setView("problems");
    // the reader was deep in the Tahlil tab: the list they asked for starts at its top
    requestAnimationFrame(() => document.querySelector("main")?.scrollTo({ top: 0 }));
  };
  const pickView = (v) => { setStartAll(false); setView(v); };

  const sections = [
    ...(factorySection ? [factorySection] : []),
    ...(isSupervisor ? [] : [{
      key: "shift", icon: Clock, label: t("filter.shift"),
      active: shift != null, display: shift != null ? `S${shift}` : "",
      onClear: () => setShift(null),
      render: () => (
        <SegmentedToggle fill value={shift} onChange={setShift}
          options={[[null, t("filter.all") || "—"], [1, "S1"], [2, "S2"]]} />
      ),
    }, {
      key: "supervisor", icon: UserRound, label: t("tasks.colSupervisor"),
      active: brigadirIds.length > 0,
      display: brigadirIds.length === 1
        ? (supOptions.find((o) => o.value === String(brigadirIds[0]))?.label || "")
        : `${brigadirIds.length} ${t("filter.selected2")}`,
      onClear: () => setBrigadirIds([]),
      render: () => (
        <OptsFilter
          opts={supOptions.map((o) => o.value)}
          sel={brigadirIds.map(String)}
          onChange={(v) => setBrigadirIds(v.map(Number))}
          render={(v) => supOptions.find((o) => o.value === v)?.label || v}
        />
      ),
    }]),
    // the two pickers of the list itself — they narrow «Muammolar» only
    ...(view === "problems" ? [{
      key: "cause", icon: Lightbulb, label: T.fCause,
      active: cats.length > 0, display: picked(cats, causeName),
      onClear: () => setCats([]),
      render: () => <OptsFilter opts={catOptions} sel={cats} onChange={setCats} render={causeName} />,
    }, {
      key: "cell", icon: MapPin, label: T.fCell,
      active: cells.length > 0, display: picked(cells, (c) => c),
      onClear: () => setCells([]),
      render: () => <OptsFilter opts={cellOptions} sel={cells} onChange={setCells} render={(c) => c} />,
    }] : []),
  ];

  return (
    <Layout title={T.title} subtitle={null}>
      {!isSupervisor && (
        <div className="mb-3">
          <SegmentedToggle asTabs value={view === "analytics" ? "analytics" : "problems"} onChange={pickView}
            options={[["problems", T.tabProblems], ["analytics", T.tabAnalytics]]} />
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
          compactLabel triggerClassName="px-3 py-2 text-sm" />
        <FilterPanel sections={sections} chipsWrap />
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--text-3)" }}>{view === "analytics" ? T.hintAnalytics : T.hint}</p>

      {view === "analytics" ? (
        analyticsQ.isError || (analyticsQ.data && !tahlilOk) ? (
          <EmptyState tone="danger" title={T.errLoad} message="" showUploadLink={false} action={<Button onClick={() => analyticsQ.refetch()}>{T.retry}</Button>} />
        ) : analyticsQ.isLoading || !analyticsQ.data ? (
          <div className="space-y-3"><SkeletonBlock className="h-32" /><SkeletonBlock className="h-64" /><SkeletonBlock className="h-72" /></div>
        ) : (
          <SolutionAnalytics T={T} data={analyticsQ.data} label={label} onOpenCause={openCause} />
        )
      ) : isError || (data && !stopsOk) ? (
        <EmptyState tone="danger" title={T.errLoad} message="" showUploadLink={false} action={<Button onClick={() => refetch()}>{T.retry}</Button>} />
      ) : isLoading || !data ? (
        <div className="space-y-3"><SkeletonBlock className="h-28" /><SkeletonBlock className="h-96" /></div>
      ) : (
        <SolutionStops T={T} data={data} label={label} isSupervisor={isSupervisor}
          cats={cats} cells={cells} listKey={JSON.stringify(fparams)} initialShow={startAll ? "all" : undefined}
          onClearFilters={() => { setCats([]); setCells([]); }} refresh={refresh} />
      )}
    </Layout>
  );
}
