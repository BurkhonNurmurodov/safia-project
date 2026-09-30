import { useEffect, useMemo } from "react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Layers, UserRound, Wrench, Boxes, Package, Info, Clock, RotateCw } from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import { useFactorySection } from "../components/ui/FactorySelect";
import EmptyState from "../components/ui/EmptyState";
import Button from "../components/ui/Button";
import { SkeletonCard, SkeletonChart, SkeletonBlock } from "../components/ui/Skeleton";
import PlanOverview from "../components/plan/PlanOverview";
import PlanProducts from "../components/plan/PlanProducts";
import PlanCells from "../components/plan/PlanCells";
import PlanUnits from "../components/plan/PlanUnits";
import { fill, ddmm } from "../components/plan/planUtil";
import { useFilters } from "../context/FilterContext";
import { useFactory, useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { usePageAccess } from "../hooks/usePageAccess";
import { useCapabilities } from "../hooks/useCapabilities";
import useStatusBands from "../hooks/useStatusBands";
import { canAccessPage } from "../config/pages";
import { useTranslit } from "../utils/transliterate";
import { surnameInitial } from "../utils/personName";
import { padChartParams } from "../utils/chartRange";
import api from "../utils/api";

const NO_LIST = [];

// «Plan Bajarish» (/plan) — how much of the plan was made, and where it was
// not: which products, which cells, which brigadirs, on which days (redesigned
// 2026-09-30 on the operator's directive). Every figure comes from ONE request,
// GET /api/plan-fulfillment/analysis (backend services/plan_fulfillment.py),
// which reads the «Zagruzka fayli» page's own per-line minutes — so a unit-day
// here IS that page's «Bajarish %». Four views over the one payload: the
// overview, and a register each for products, cells and brigadirs.
//
// Scope (one FilterPanel, the platform's chain): plant → shift → brigadir →
// leader → cell, then the product. The period and the shift are the shared
// filters every analytics page reads (FilterContext); the picks below them are
// this page's own. Each level narrows the list under it and says so, and a
// pick the new parent no longer offers is dropped before a request goes out.
export default function PlanFulfillment() {
  const { t } = useLang();
  const { tl, tx, lang } = useTranslit();
  const { auth } = useAuth();
  const { params, ready, dateFrom, dateTo, setDateFrom, setDateTo, shift, setShift } = useFilters();
  const { factory } = useFactory();
  const factorySection = useFactorySection();
  useStatusBands();   // the completion bands in force paint every figure here

  const [tab, setTab] = usePersistentState("plan_tab", "overview");
  const [brigSel, setBrigSel] = usePersistentState("plan_brig", NO_LIST);
  const [leadSel, setLeadSel] = usePersistentState("plan_lead", NO_LIST);
  const [cellSel, setCellSel] = usePersistentState("plan_cell", NO_LIST);
  const [prodSel, setProdSel] = usePersistentState("plan_prod", NO_LIST);

  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  const canOpenProduction = canAccessPage(auth?.role, "production", access, capPages, deniedPages);

  // The request: the shared period + plant + shift, and this page's picks.
  const base = useMemo(() => {
    const p = {};
    if (params.date_from) p.date_from = params.date_from;
    if (params.date_to) p.date_to = params.date_to;
    if (shift) p.shift = shift;
    if (brigSel.length) p.manager_id = brigSel;
    if (leadSel.length) p.leader_id = leadSel;
    if (cellSel.length) p.cell_id = cellSel;
    if (prodSel.length) p.product = prodSel;
    return p;
  }, [params.date_from, params.date_to, shift, brigSel, leadSel, cellSel, prodSel]);
  const reqParams = useFactoryParams(base);

  const { data, isPending, isFetching, isError, refetch } = useQuery({
    queryKey: ["plan-analysis", reqParams],
    queryFn: () => api.get("/api/plan-fulfillment/analysis", { params: reqParams }).then((r) => r.data),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // The trend chart never spans fewer than 7 days (utils/chartRange.js): a
  // shorter period asks for a padded window; the same key = the same request.
  const chartParams = useMemo(() => padChartParams(reqParams), [reqParams]);
  const padded = chartParams !== reqParams;
  const { data: chartData } = useQuery({
    queryKey: ["plan-analysis", chartParams],
    queryFn: () => api.get("/api/plan-fulfillment/analysis", { params: chartParams }).then((r) => r.data),
    enabled: ready && padded,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  // ── the registry the lists are drawn from (whole plant, both shifts) ────
  const scopeUnits = data?.scope_units || NO_LIST;
  const registry = data?.cells || NO_LIST;
  const unitById = useMemo(() => new Map(scopeUnits.map((u) => [u.manager_id, u])), [scopeUnits]);
  const cellById = useMemo(() => new Map(registry.map((c) => [c.id, c])), [registry]);
  const productById = useMemo(() => new Map((data?.products || NO_LIST).map((p) => [p.id, p])), [data?.products]);
  const unitName = (id) => unitById.get(id)?.name || "";

  // Each level listed under the levels above it.
  const brigOpts = useMemo(() => scopeUnits
    .filter((u) => !shift || u.shift === shift)
    .sort((a, b) => tl(a.name).localeCompare(tl(b.name)))
    .map((u) => u.manager_id), [scopeUnits, shift, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const inBrig = useMemo(() => {
    const allowed = new Set(brigSel.length ? brigSel : brigOpts);
    return registry.filter((c) => c.sap && allowed.has(c.manager_id));
  }, [registry, brigSel, brigOpts]);
  const leaderNames = useMemo(() => {
    const m = new Map();
    inBrig.forEach((c) => { if (c.leader_id) m.set(c.leader_id, c.leader || ""); });
    return m;
  }, [inBrig]);
  const leadOpts = useMemo(() => [...leaderNames.keys()]
    .sort((a, b) => tl(leaderNames.get(a)).localeCompare(tl(leaderNames.get(b)))), [leaderNames, lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const cellOpts = useMemo(() => inBrig
    .filter((c) => !leadSel.length || leadSel.includes(c.leader_id))
    .map((c) => c.id), [inBrig, leadSel]);
  const prodOptions = data?.product_options || NO_LIST;
  const prodNames = useMemo(() => {
    const m = new Map();
    prodOptions.forEach((o) => m.set(o.sku, o));
    return m;
  }, [prodOptions]);
  // A pick is always offered, even where this period holds none of it — a pick
  // missing from its own list could not be seen or undone.
  const prodOpts = useMemo(() => {
    const keys = prodOptions.map((o) => o.sku);
    const extra = prodSel.filter((k) => !prodNames.has(k));
    return [...extra, ...keys];
  }, [prodOptions, prodSel, prodNames]);

  // Drop a child pick its list no longer offers (the registry answers for the
  // whole plant, so this runs the moment a parent changes, before the request).
  useEffect(() => {
    if (!data) return;
    const ok = new Set(brigOpts);
    if (brigSel.some((id) => !ok.has(id))) setBrigSel(brigSel.filter((id) => ok.has(id)));
  }, [brigOpts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data) return;
    const ok = new Set(leadOpts);
    if (leadSel.some((id) => !ok.has(id))) setLeadSel(leadSel.filter((id) => ok.has(id)));
  }, [leadOpts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!data) return;
    const ok = new Set(cellOpts);
    if (cellSel.some((id) => !ok.has(id))) setCellSel(cellSel.filter((id) => ok.has(id)));
  }, [cellOpts]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── the filter panel ─────────────────────────────────────────────────────
  const grpWho = t("plan.grpWho");
  const shiftLabel = shift ? `${t("filter.shift")} ${shift}` : null;
  const briefBrig = brigSel.length === 1 ? surnameInitial(tl(unitName(brigSel[0]))) : brigSel.length ? fill(t("plan.nSelected"), { n: brigSel.length }) : null;
  const briefLead = leadSel.length === 1 ? surnameInitial(tl(leaderNames.get(leadSel[0]) || "")) : leadSel.length ? fill(t("plan.nSelected"), { n: leadSel.length }) : null;
  const briefCell = cellSel.length === 1 ? (cellById.get(cellSel[0])?.code || "") : cellSel.length ? fill(t("plan.nSelected"), { n: cellSel.length }) : null;
  const chainNote = (parents, n) => {
    const p = parents.filter(Boolean).pop();
    return p ? fill(t("plan.narrowedBy"), { x: p, n }) : null;
  };
  const widen = (label, onClick) => (
    <div className="text-center py-1">
      <p className="text-xs mb-2" style={{ color: "var(--text-3)" }}>{t("plan.noneInScope")}</p>
      <Button size="sm" variant="secondary" onClick={onClick}>{label}</Button>
    </div>
  );
  const cellLabel = (id) => {
    const c = cellById.get(id);
    if (!c) return String(id);
    return c.leader ? `${c.code} · ${surnameInitial(tl(c.leader))}` : c.code;
  };
  // An SKU is its SAP code, or «~name» for a line that has none.
  const prodLabel = (k) => {
    const local = k.startsWith("~");
    const o = prodNames.get(k);
    if (!o) return local ? k.slice(1) : k;
    return local ? tx(o.name) : `${tx(o.name)} · ${k}`;
  };

  const sections = [
    ...(factorySection ? [{ ...factorySection, group: grpWho }] : []),
    {
      key: "shift", icon: Layers, label: t("filter.shift"), group: grpWho,
      active: shift != null,
      display: shift != null ? `S${shift}` : "",
      onClear: () => setShift(null),
      render: () => (
        <SegmentedToggle fill value={shift} onChange={setShift}
          options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]} />
      ),
    },
    {
      key: "brig", icon: Wrench, label: t("plan.fBrig"), group: grpWho,
      active: brigSel.length > 0, display: briefBrig || "",
      onClear: () => setBrigSel([]),
      render: () => (
        <OptsFilter searchable opts={brigOpts} sel={brigSel} onChange={setBrigSel}
          labelOf={(id) => tl(unitName(id))}
          render={(id) => tl(unitName(id))}
          note={chainNote([shiftLabel], brigOpts.length)}
          empty={shift ? widen(t("plan.allShifts"), () => setShift(null)) : null} />
      ),
    },
    {
      key: "lead", icon: UserRound, label: t("plan.fLead"), group: grpWho,
      active: leadSel.length > 0, display: briefLead || "",
      onClear: () => setLeadSel([]),
      render: () => (
        <OptsFilter searchable opts={leadOpts} sel={leadSel} onChange={setLeadSel}
          labelOf={(id) => tl(leaderNames.get(id) || "")}
          render={(id) => tl(leaderNames.get(id) || "")}
          note={chainNote([shiftLabel, briefBrig], leadOpts.length)}
          empty={brigSel.length ? widen(t("plan.allBrig"), () => setBrigSel([])) : null} />
      ),
    },
    {
      key: "cell", icon: Boxes, label: t("plan.fCell"), group: grpWho,
      active: cellSel.length > 0, display: briefCell || "",
      onClear: () => setCellSel([]),
      render: () => (
        <OptsFilter searchable opts={cellOpts} sel={cellSel} onChange={setCellSel}
          labelOf={cellLabel} render={cellLabel}
          note={chainNote([shiftLabel, briefBrig, briefLead], cellOpts.length)}
          empty={leadSel.length ? widen(t("plan.allLead"), () => setLeadSel([]))
            : brigSel.length ? widen(t("plan.allBrig"), () => setBrigSel([])) : null} />
      ),
    },
    {
      key: "product", icon: Package, label: t("plan.fProduct"), group: t("plan.grpWhat"),
      active: prodSel.length > 0,
      display: prodSel.length === 1 ? prodLabel(prodSel[0]) : prodSel.length ? fill(t("plan.nSelected"), { n: prodSel.length }) : "",
      onClear: () => setProdSel([]),
      render: () => (
        <OptsFilter searchable opts={prodOpts} sel={prodSel} onChange={setProdSel}
          labelOf={prodLabel} render={prodLabel}
          note={chainNote([shiftLabel, briefBrig, briefLead, briefCell], prodOptions.length) || t("plan.productsByPlan")} />
      ),
    },
  ];

  // ── notices ──────────────────────────────────────────────────────────────
  const T = data?.totals;
  const notices = [];
  if (data?.capped) notices.push({ icon: Info, text: fill(t("plan.capped"), { n: data.max_days, d: ddmm(data.date_from) }) });
  if (data?.clamped && data.date_from) notices.push({ icon: Info, text: fill(t("plan.clamped"), { d: ddmm(data.floor) }) });
  if (T?.no_fact) {
    notices.push({
      icon: Clock, text: fill(t("plan.noFactNote"), { n: T.no_fact }),
      action: tab !== "units" ? { label: t("plan.showDays"), onClick: () => setTab("units") } : null,
    });
  }
  if (T?.no_plan) notices.push({ icon: Info, text: fill(t("plan.noPlanNote"), { n: T.no_plan }) });

  const beforeFloor = data && !data.date_from;
  const empty = data && !beforeFloor && !(T?.plan > 0) && !(T?.actual > 0) && !T?.no_fact;
  const narrowed = brigSel.length || leadSel.length || cellSel.length || prodSel.length || shift || factory != null;
  const clearPicks = () => { setBrigSel([]); setLeadSel([]); setCellSel([]); setProdSel([]); };

  const tabs = [
    ["overview", t("plan.tab.overview")],
    ["products", t("plan.tab.products")],
    ["cells", t("plan.tab.cells")],
    ["units", t("plan.tab.units")],
  ];

  return (
    <Layout title={t("plan.title")}>
      {/* The view switch is the page's first row: every filter below it
          narrows all four views, so it sits above them. */}
      <div className="mb-3">
        <SegmentedToggle asTabs value={tab} onChange={setTab} options={tabs} ariaLabel={t("plan.title")} />
      </div>

      {/* ONE-ROW filter bar: the period inline, everything else in the panel. */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <DateRangePicker
          dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
          compactLabel triggerClassName="px-3 py-2 text-sm"
        />
        <FilterPanel sections={sections} chipsWrap />
      </div>

      {notices.length > 0 && (
        <div className="mb-4 space-y-2">
          {notices.map((n, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl px-3 py-2 text-xs"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
              <n.icon size={14} className="mt-0.5 flex-shrink-0" style={{ color: "var(--text-3)" }} />
              <span className="flex-1">{n.text}</span>
              {n.action && (
                <button type="button" onClick={n.action.onClick} className="text-xs font-medium whitespace-nowrap hover:underline"
                  style={{ color: "var(--brand-text)" }}>{n.action.label}</button>
              )}
            </div>
          ))}
        </div>
      )}

      {isError && !data ? (
        <EmptyState title={t("plan.loadError")} message={t("plan.loadErrorMsg")} showUploadLink={false}
          action={<Button size="sm" variant="secondary" onClick={() => refetch()}><RotateCw size={12} /> {t("plan.retry")}</Button>} />
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
      ) : beforeFloor ? (
        <EmptyState title={t("plan.empty.title")} message={fill(t("plan.beforeFloor"), { d: ddmm(data.floor) })} showUploadLink={false} />
      ) : empty ? (
        <EmptyState
          title={narrowed ? t("plan.empty.filtered") : t("plan.empty.title")}
          message={t("plan.empty.msg")}
          showUploadLink={false}
          action={narrowed && (brigSel.length || leadSel.length || cellSel.length || prodSel.length)
            ? <Button size="sm" variant="secondary" onClick={clearPicks}>{t("plan.clearPicks")}</Button> : null}
        />
      ) : (
        <div style={{ opacity: isFetching ? 0.6 : 1, transition: "opacity 150ms" }} aria-busy={isFetching}>
          {tab === "products" ? (
            <PlanProducts data={data} unitName={unitName} cellById={cellById} />
          ) : tab === "cells" ? (
            <PlanCells data={data} unitName={unitName} cellById={cellById} productById={productById} />
          ) : tab === "units" ? (
            <PlanUnits data={data} productById={productById} canOpen={canOpenProduction} />
          ) : (
            <PlanOverview data={data} chartData={padded ? chartData : null} unitName={unitName}
              cellById={cellById} onTab={setTab} />
          )}
        </div>
      )}
    </Layout>
  );
}
