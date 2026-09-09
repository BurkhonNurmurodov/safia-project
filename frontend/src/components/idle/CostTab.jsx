import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock, ChevronRight, Coins, FileSpreadsheet, Layers, Settings2, Tag,
  UserRound, Grid3x3,
} from "lucide-react";
import Button from "../ui/Button";
import SegmentedToggle from "../ui/SegmentedToggle";
import DateRangePicker, { localISO } from "../ui/DateRangePicker";
import EmptyState from "../ui/EmptyState";
import KPICard from "../ui/KPICard";
import { SectionHead } from "../ui/DataTable";
import { SkeletonCard } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";
import { FilterPanel, OptsFilter } from "../ui/ColumnFilter";
import { useFactorySection } from "../ui/FactorySelect";
import { useFactory, useFactoryParams } from "../../context/FactoryContext";
import { useLang } from "../../context/LangContext";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useTranslit } from "../../utils/transliterate";
import { useAuth } from "../../context/AuthContext";
import { exportXlsx } from "../../utils/exportXlsx";
import { shortPerson } from "../../utils/personName";
import api from "../../utils/api";
import { CATS } from "./categories";
import CostEntriesModal from "./CostEntriesModal";
import WageRatesModal from "./WageRatesModal";

/**
 * «Xarajat» — what stopped waiting cost in wages.
 *
 * A third view over the /downtime register, and the one that is a SUM where
 * every other ojidaniya figure on the platform is a headcount-weighted mean.
 * That is stated on the card rather than discovered: this tab's minutes read
 * higher than «Tahlil»'s, both because it sums and because it prices EVERY
 * category (Cat H included — a cell stopped for cleaning pays the same wages).
 *
 * It keeps its OWN filter state, deliberately: the operator asked for a
 * multi-select brigadir and a cascading cell picker, neither of which the other
 * two views carry, and switching tabs must not silently rewrite what they were
 * showing. Every figure is computed server-side by `services/ojidaniya_cost`,
 * so the screen, the modal and the workbook cannot disagree.
 */
export default function CostTab() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const { factory } = useFactory();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { show, node: toastNode } = useToast();
  // The house i18n convention: whole sentences carrying {placeholders}, filled
  // by the caller. There is no params argument on `t`.
  const tp = useCallback(
    (k, vars) => Object.entries(vars || {}).reduce(
      (out, [a, b]) => out.split(`{${a}}`).join(String(b)), t(k)),
    [t]);

  // ── this tab's own scope ───────────────────────────────────────────────────
  const today = useMemo(() => localISO(new Date()), []);
  const ago = useMemo(() => {
    const d = new Date(); d.setDate(d.getDate() - 13); return localISO(d);
  }, []);
  const [dateFrom, setDateFrom] = usePersistentState("dtcost_from", ago);
  const [dateTo, setDateTo] = usePersistentState("dtcost_to", today);
  const [shift, setShift] = usePersistentState("dtcost_shift", null);
  const [sups, setSups] = usePersistentState("dtcost_sups", []);
  const [cellIds, setCellIds] = usePersistentState("dtcost_cells", []);
  const [cats, setCats] = usePersistentState("dtcost_cats", []);

  const [open, setOpen] = useState({});          // "sup:3" / "cell:3:12" → expanded
  const [entryCtx, setEntryCtx] = useState(null);
  const [ratesOpen, setRatesOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const params = useMemo(() => ({
    date_from: dateFrom, date_to: dateTo,
    ...(shift ? { shift } : {}),
    ...(sups.length ? { manager_id: sups } : {}),
    ...(cellIds.length ? { cell_id: cellIds } : {}),
    ...(cats.length ? { cats } : {}),
  }), [dateFrom, dateTo, shift, sups, cellIds, cats]);
  const fparams = useFactoryParams(params);
  const factorySection = useFactorySection();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["downtime-cost", fparams],
    queryFn: () => api.get("/api/downtime/cost", { params: fparams }).then((r) => r.data),
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {};
  const opts = data?.options || {};
  const rates = data?.rates || [];

  // ── formatting ─────────────────────────────────────────────────────────────
  // Whole so'm with grouped digits. Money is the number a reader quotes, so the
  // table prints it in full; only the KPI headline may abbreviate.
  const money = useCallback(
    (v) => (v == null ? "—" : Math.round(v).toLocaleString("ru-RU")), []);
  const num = useCallback((v, d = 0) => (v == null ? "—"
    : Number(v).toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d })), []);

  const catLabel = useCallback((cat) => {
    const meaning = t(`downtime.cat.${String(cat).replace(/^Cat\s*/i, "")}.label`);
    return meaning && !meaning.startsWith("downtime.cat.") ? meaning : "";
  }, [t]);

  // ── cascading cell list: narrowed by the brigadir picks, and it SAYS so ────
  const supName = useCallback((id) => {
    const m = (opts.managers || []).find((x) => x.id === id);
    return m ? tl(m.name) : String(id);
  }, [opts.managers, tl]);

  const cellOpts = useMemo(() => {
    const all = opts.cells || [];
    return sups.length ? all.filter((c) => sups.includes(c.manager_id)) : all;
  }, [opts.cells, sups]);

  // A cell pick the narrowed list no longer offers is DROPPED: a control naming
  // a value the page cannot show is worse than a reset.
  useEffect(() => {
    if (!cellOpts.length && !cellIds.length) return;
    const ok = new Set(cellOpts.map((c) => c.id));
    if (cellIds.some((id) => !ok.has(id))) setCellIds(cellIds.filter((id) => ok.has(id)));
  }, [cellOpts, cellIds, setCellIds]);

  const grand = totals.cost || 0;
  const share = (v) => (grand && v != null ? (v / grand) * 100 : null);
  const perDay = totals.cost && totals.days ? Math.round(totals.cost / totals.days) : null;
  const unpriced = totals.unpriced_minutes || 0;

  const activeRate = useMemo(() => {
    const inWindow = rates.filter((p) => !p.from || p.from <= dateTo);
    if (!inWindow.length) return null;
    const spanning = rates.filter((p) => (!p.from || p.from <= dateTo)
      && (p.from == null || p.from >= dateFrom));
    if (spanning.length > 1) return "multi";
    return inWindow[inWindow.length - 1]?.rate ?? null;
  }, [rates, dateFrom, dateTo]);

  const clearAll = () => { setShift(null); setSups([]); setCellIds([]); setCats([]); };

  const onExport = async () => {
    setBusy(true);
    try {
      const where = await exportXlsx("/api/downtime/cost.xlsx", {
        body: {
          date_from: dateFrom, date_to: dateTo, shift, manager_id: sups,
          cell_id: cellIds, cats, factory,
          title: t("downtime.cost.title"),
          subtitle: `${dateFrom} — ${dateTo}`,
          scope: [
            { label: t("downtime.xl.period"), value: `${dateFrom} — ${dateTo}` },
            { label: t("filter.shift"), value: shift ? `S${shift}` : t("filter.all") },
            { label: t("tasks.colSupervisor"), value: sups.length ? sups.map(supName).join(", ") : t("filter.all") },
            { label: t("downtime.filterCat"), value: cats.length ? cats.join(", ") : t("filter.all") },
            { label: t("downtime.cost.rate.title"), value: activeRate === "multi"
                ? t("downtime.cost.rate.multi") : `${money(activeRate)} ${t("downtime.cost.rate.unit")}` },
          ],
          labels: {
            shOverview: t("downtime.cost.shOverview"), shDetail: t("downtime.cost.shDetail"),
            kMinutes: t("downtime.cost.kMinutes"), kCost: t("downtime.cost.kCost"),
            kPerDay: t("downtime.cost.kPerDay"), kUnpriced: t("downtime.cost.kUnpriced"),
            kUnpricedHint: t("downtime.cost.kUnpricedHint"),
            hrs: t("general.hrs"), days: t("downtime.cost.days"),
            sBySup: t("downtime.cost.sBySup"), sTree: t("downtime.cost.sTree"),
            cName: t("tasks.colSupervisor"), cSup: t("tasks.colSupervisor"),
            cCell: t("downtime.cost.colCell"), cLeader: t("downtime.cost.colLeader"),
            cCat: t("downtime.filterCat"), cHc: t("downtime.cost.colHc"),
            cMin: t("downtime.cost.colMin"), cHrs: t("downtime.cost.colHrs"),
            cCost: t("downtime.cost.colCost"), cShare: t("downtime.cost.colShare"),
            total: t("downtime.cost.total"),
          },
          cats_meta: Object.fromEntries((opts.categories || []).map((c) => [c, catLabel(c)])),
        },
        fallbackName: `ojidaniya-xarajat-${dateFrom}_${dateTo}.xlsx`,
      });
      show(t(where === "download" ? "downtime.dt.downloaded" : "downtime.dt.sentToChat"), "success");
    } catch (e) {
      show(e?.response?.data?.detail || t("downtime.cost.exportFailed"), "error");
    } finally { setBusy(false); }
  };

  // ── table cells ────────────────────────────────────────────────────────────
  const th = "px-3 py-2 text-[10.5px] font-semibold uppercase tracking-wider whitespace-nowrap";
  const td = "px-3 py-2 text-[13.5px] align-middle";
  const bd = { borderColor: "var(--border)" };

  const Figures = ({ r, showShare = true, muted = false }) => (
    <>
      {/* «Odam soni» is a FACT — the number somebody typed on /production —
          so it is never printed with a ~. A row folding days that carried
          DIFFERENT headcounts shows the minute-weighted mean and says so on
          hover, rather than hedging a figure that is not an estimate. */}
      <td className={`${td} text-right tabular-nums border-l`} style={bd}
          title={r.hc_varies ? tp("downtime.cost.hcVaries",
            { lo: num(r.hc_lo, 1), hi: num(r.hc_hi, 1) }) : undefined}>
        {r.hc == null ? <span style={{ color: "var(--text-4)" }}>—</span> : (
          <>{num(r.hc, 1)}{r.hc_varies && (
            <span style={{ color: "var(--text-4)" }}>*</span>)}</>
        )}
      </td>
      <td className={`${td} text-right tabular-nums border-l`} style={bd}>{num(r.minutes)}</td>
      <td className={`${td} text-right tabular-nums border-l`} style={{ ...bd, color: "var(--text-2)" }}>
        {num(r.hours, 1)}
      </td>
      <td className={`${td} text-right tabular-nums border-l font-semibold`} style={bd}>
        {r.cost == null ? <span style={{ color: "var(--text-4)", fontWeight: 400 }}>—</span> : money(r.cost)}
      </td>
      <td className={`${td} text-right tabular-nums border-l hidden md:table-cell`} style={{ ...bd, color: "var(--text-3)" }}>
        {showShare && share(r.cost) != null ? (
          <span className="inline-flex items-center gap-2 justify-end">
            <span className="inline-block w-[46px] h-[5px] rounded-full overflow-hidden shrink-0"
                  style={{ background: "var(--bg-accent)" }}>
              <span className="block h-full rounded-full"
                    style={{ width: `${Math.min(100, share(r.cost)).toFixed(1)}%`, background: "var(--brand)" }} />
            </span>
            {share(r.cost).toFixed(1)}%
          </span>
        ) : <span style={{ color: "var(--text-4)" }}>{muted ? "" : "—"}</span>}
      </td>
    </>
  );

  const Unpriced = ({ min }) => min > 0 ? (
    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
          style={{ background: "rgba(217,119,6,.14)", color: "var(--kpi-amber)" }}>
      {tp("downtime.cost.unpricedChip", { min: num(min) })}
    </span>
  ) : null;

  const toggle = (k) => setOpen((p) => ({ ...p, [k]: !p[k] }));
  const rowKeys = (e) => (e.key === "Enter" || e.key === " ");

  return (
    <>
      {/* ── ONE toolbar row ───────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <DateRangePicker
          dateFrom={dateFrom} dateTo={dateTo}
          setDateFrom={setDateFrom} setDateTo={setDateTo}
          compactLabel triggerClassName="px-3 py-2 text-sm"
        />
        <FilterPanel
          sections={[
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
              active: sups.length > 0,
              display: sups.length === 1 ? supName(sups[0]) : `${sups.length} ${t("filter.selected2")}`,
              onClear: () => setSups([]),
              render: () => (
                <OptsFilter
                  searchable
                  opts={(opts.managers || []).map((m) => m.id)}
                  sel={sups} onChange={setSups}
                  labelOf={(id) => supName(id)}
                  render={(id) => {
                    const m = (opts.managers || []).find((x) => x.id === id);
                    return m ? `${tl(m.name)}${m.shift ? ` · S${m.shift}` : ""}` : String(id);
                  }}
                />
              ),
            },
            {
              key: "cell", icon: Grid3x3, label: t("downtime.cost.colCell"),
              group: t("downtime.cost.grpWho"),
              active: cellIds.length > 0,
              display: cellIds.length === 1
                ? (cellOpts.find((c) => c.id === cellIds[0])?.code || "")
                : `${cellIds.length} ${t("filter.selected2")}`,
              onClear: () => setCellIds([]),
              render: () => (
                <OptsFilter
                  searchable
                  opts={cellOpts.map((c) => c.id)}
                  sel={cellIds} onChange={setCellIds}
                  labelOf={(id) => cellOpts.find((c) => c.id === id)?.code || String(id)}
                  render={(id) => {
                    const c = cellOpts.find((x) => x.id === id);
                    return c ? `${c.code}${c.leader ? ` · ${shortPerson(tl(c.leader))}` : ""}` : String(id);
                  }}
                  // A cascading level narrows the level below it and SAYS so, so
                  // a shortened list is never mistaken for missing data.
                  note={sups.length
                    ? tp("downtime.cost.cellNarrowed", {
                        who: sups.length === 1 ? supName(sups[0]) : `${sups.length}`,
                        n: cellOpts.length })
                    : null}
                  empty={sups.length ? {
                    message: t("downtime.cost.cellEmpty"),
                    action: { label: t("downtime.cost.clearSup"), onClick: () => setSups([]) },
                  } : null}
                />
              ),
            },
            {
              key: "cats", icon: Tag, label: t("downtime.filterCat"),
              group: t("downtime.cost.grpWhat"),
              active: cats.length > 0,
              display: cats.length === 1 ? cats[0] : `${cats.length} ${t("filter.selected2")}`,
              onClear: () => setCats([]),
              render: () => (
                <OptsFilter
                  opts={(opts.categories || []).length ? opts.categories : CATS}
                  sel={cats} onChange={setCats}
                  labelOf={(c) => (catLabel(c) ? `${c} — ${catLabel(c)}` : c)}
                  render={(c) => (catLabel(c) ? `${c} — ${catLabel(c)}` : c)}
                />
              ),
            },
          ]}
        />
        <Button
          size="lg" variant="secondary" className="ml-auto"
          loading={busy} disabled={isLoading || !rows.length}
          icon={!busy ? <FileSpreadsheet size={14} /> : null}
          onClick={onExport}
          title={t("downtime.dt.export")} aria-label={t("downtime.dt.export")}
        >
          <span className="hidden sm:inline">{t("downtime.dt.export")}</span>
        </Button>
        {/* Editing the rate is admin-only; the ⚙ is hidden for everyone else,
            and the endpoint refuses them too. */}
        {isAdmin && (
          <Button
            size="lg" variant="secondary"
            icon={<Settings2 size={14} />}
            onClick={() => setRatesOpen(true)}
            title={t("downtime.cost.rate.title")} aria-label={t("downtime.cost.rate.title")}
          />
        )}
      </div>

      {/* What this tab counts, said out loud — the stopped/scope toggles the
          other views carry have no meaning here: only a stopped cell costs, and
          every category is priced. */}
      <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mb-4 px-3 py-2 rounded-r-xl"
           style={{ background: "var(--brand-bg)", borderLeft: "3px solid var(--brand)" }}>
        <span className="text-[12px]" style={{ color: "var(--text-2)" }}>
          {t("downtime.cost.scopeLine")}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[12px]" style={{ color: "var(--text-3)" }}>
          {t("downtime.cost.rate.title")}
          <button
            type="button"
            onClick={() => setRatesOpen(true)}
            className="px-2 py-0.5 rounded-lg text-[12.5px] font-semibold border"
            style={{ borderColor: "var(--brand-border)", color: "var(--brand-text)" }}
          >
            {activeRate === "multi" ? t("downtime.cost.rate.multi")
              : activeRate == null ? t("downtime.cost.rate.unset")
              : `${money(activeRate)} ${t("downtime.cost.rate.unit")}`}
          </button>
        </span>
      </div>

      {/* ── KPI strip ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KPICard
          label={t("downtime.cost.kMinutes")}
          value={num(totals.minutes)}
          sub={`${num(totals.hours, 1)} ${t("general.hrs")} · ${totals.days || 0} ${t("downtime.cost.days")}`}
        />
        <KPICard
          accent
          label={t("downtime.cost.kCost")}
          value={money(totals.cost)}
          sub={tp("downtime.cost.kCostSub", { m: totals.managers || 0, c: totals.cells || 0 })}
        />
        <KPICard
          label={t("downtime.cost.kPerDay")}
          value={money(perDay)}
          sub={t("downtime.cost.kPerDaySub")}
        />
        {/* The blank IS the warning: minutes that could not be priced are named
            rather than quietly missing from the total above. */}
        <KPICard
          label={t("downtime.cost.kUnpriced")}
          value={num(unpriced)}
          color={unpriced ? "var(--kpi-amber)" : undefined}
          sub={unpriced ? t("downtime.cost.kUnpricedHint") : t("downtime.cost.kUnpricedNone")}
        />
      </div>

      {/* ── the tree ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border overflow-hidden mb-4"
           style={{ background: "var(--bg-card)", borderColor: "var(--border)" }}>
        <div className="px-4 pt-4 pb-3 border-b" style={{ borderColor: "var(--border)" }}>
          <SectionHead
            icon={Coins}
            title={t("downtime.cost.sBySup")}
            right={<span className="text-[11px]" style={{ color: "var(--text-4)" }}>
              {tp("downtime.cost.nRows", { n: rows.length })}
            </span>}
          />
        </div>

        {isLoading ? (
          <div className="p-4"><SkeletonCard /></div>
        ) : isError ? (
          <p className="px-4 py-10 text-center text-[13px]" style={{ color: "var(--text-3)" }}>
            {t("common.loadFailed")}
          </p>
        ) : !rows.length ? (
          <div className="px-4 py-6">
            <EmptyState
              icon={Coins}
              title={t("downtime.cost.emptyTitle")}
              message={t("downtime.cost.emptyBody")}
              showUploadLink={false}
              height="h-32"
              action={<Button size="md" variant="secondary" onClick={clearAll}>
                {t("filter.clear")}
              </Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full" style={{ minWidth: 720 }}>
              <thead>
                <tr style={{ background: "var(--bg-inner)" }}>
                  <th className={`${th} text-left`} style={{ color: "var(--text-3)" }}>{t("downtime.cost.colName")}</th>
                  <th className={`${th} text-right border-l`} style={{ ...bd, color: "var(--text-3)" }}>{t("downtime.cost.colHc")}</th>
                  <th className={`${th} text-right border-l`} style={{ ...bd, color: "var(--text-3)" }}>{t("downtime.cost.colMin")}</th>
                  <th className={`${th} text-right border-l`} style={{ ...bd, color: "var(--text-3)" }}>{t("downtime.cost.colHrs")}</th>
                  <th className={`${th} text-right border-l`} style={{ ...bd, color: "var(--text-3)" }}>{t("downtime.cost.colCost")}</th>
                  <th className={`${th} text-right border-l hidden md:table-cell`} style={{ ...bd, color: "var(--text-3)" }}>{t("downtime.cost.colShare")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const sk = `sup:${r.manager_id}`;
                  const sOpen = !!open[sk];
                  return [
                    <tr
                      key={sk}
                      role="button" tabIndex={0} aria-expanded={sOpen}
                      onClick={() => toggle(sk)}
                      onKeyDown={(e) => { if (rowKeys(e)) { e.preventDefault(); toggle(sk); } }}
                      className="cursor-pointer border-t hover:bg-[var(--hover-bg)] focus-visible:outline-none"
                      style={bd}
                    >
                      <td className={`${td} font-semibold`}>
                        <span className="flex items-center gap-2 min-w-0">
                          <ChevronRight size={15} className="shrink-0 transition-transform"
                            style={{ color: sOpen ? "var(--brand-text)" : "var(--text-3)",
                                     transform: sOpen ? "rotate(90deg)" : "none" }} />
                          <span className="truncate">{tl(r.manager)}</span>
                          <span className="text-[12.5px] font-normal shrink-0" style={{ color: "var(--text-3)" }}>
                            {r.shift ? `· S${r.shift}` : ""} · {tp("downtime.cost.nCells", { n: r.cells.length })}
                          </span>
                          <Unpriced min={r.unpriced_minutes} />
                        </span>
                      </td>
                      <Figures r={{ ...r, hc: null }} />
                    </tr>,

                    ...(sOpen ? r.cells.flatMap((c) => {
                      // The pre-floor lump: one marked row per brigadir for
                      // everything before the typed headcount existed. No
                      // chevron and no categories under it — there is no
                      // per-cell answer to open, and a control that opens onto
                      // nothing is worse than no control.
                      if (c.pre) return [(
                        <tr key={`pre:${r.manager_id}`} className="border-t"
                            style={{ ...bd, background: "var(--bg-inner)" }}>
                          <td className={td}>
                            <span className="flex items-center gap-2 min-w-0 pl-5">
                              <CalendarClock size={14} className="shrink-0" style={{ color: "var(--text-4)" }} />
                              <span className="font-semibold">{t("downtime.cost.preLabel")}</span>
                              <span className="text-[12.5px] truncate" style={{ color: "var(--text-3)" }}>
                                · {t("downtime.cost.preNote")}
                              </span>
                            </span>
                          </td>
                          <Figures r={c} showShare={false} muted />
                        </tr>
                      )];
                      const ck = `cell:${r.manager_id}:${c.cell_id}`;
                      const cOpen = !!open[ck];
                      return [
                        <tr
                          key={ck}
                          role="button" tabIndex={0} aria-expanded={cOpen}
                          onClick={() => toggle(ck)}
                          onKeyDown={(e) => { if (rowKeys(e)) { e.preventDefault(); toggle(ck); } }}
                          className="cursor-pointer border-t hover:bg-[var(--hover-bg)] focus-visible:outline-none"
                          style={{ ...bd, background: "var(--bg-inner)" }}
                        >
                          <td className={td}>
                            <span className="flex items-center gap-2 min-w-0 pl-5">
                              <ChevronRight size={14} className="shrink-0 transition-transform"
                                style={{ color: cOpen ? "var(--brand-text)" : "var(--text-3)",
                                         transform: cOpen ? "rotate(90deg)" : "none" }} />
                              {/* The cell is its CODE. Not a CellLink: this row
                                  is a disclosure, and a link inside it would
                                  navigate away mid-drill-down. */}
                              <span className="font-semibold">{c.code}</span>
                              {c.leader && (
                                <span className="text-[12.5px] truncate" style={{ color: "var(--text-3)" }}>
                                  · {shortPerson(tl(c.leader))}
                                </span>
                              )}
                              {c.hc == null && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
                                      style={{ background: "rgba(217,119,6,.14)", color: "var(--kpi-amber)" }}>
                                  {t("downtime.cost.noHc")}
                                </span>
                              )}
                            </span>
                          </td>
                          <Figures r={c} />
                        </tr>,

                        ...(cOpen ? c.cats.map((k) => (
                          <tr
                            key={`${ck}:${k.category}`}
                            role="button" tabIndex={0}
                            onClick={() => setEntryCtx({
                              managerId: r.manager_id, cellId: c.cell_id, category: k.category,
                              catLabel: catLabel(k.category), code: c.code,
                              leader: c.leader ? shortPerson(tl(c.leader)) : "", hc: c.hc,
                              hcVaries: c.hc_varies,
                            })}
                            onKeyDown={(e) => {
                              if (!rowKeys(e)) return;
                              e.preventDefault();
                              setEntryCtx({
                                managerId: r.manager_id, cellId: c.cell_id, category: k.category,
                                catLabel: catLabel(k.category), code: c.code,
                                leader: c.leader ? shortPerson(tl(c.leader)) : "", hc: c.hc,
                                hcVaries: c.hc_varies,
                              });
                            }}
                            className="cursor-pointer border-t hover:bg-[var(--hover-bg)] focus-visible:outline-none group"
                            style={{ ...bd, background: "var(--bg-inner)" }}
                          >
                            <td className={`${td} text-[13px]`}>
                              <span className="flex items-center gap-2 min-w-0 pl-11">
                                <span className="px-1.5 py-0.5 rounded text-[11px] font-semibold shrink-0"
                                      style={{ background: "var(--bg-accent)", color: "var(--text-2)" }}>
                                  {k.category}
                                </span>
                                <span className="truncate" style={{ color: "var(--text-2)" }}>{catLabel(k.category)}</span>
                                <span className="ml-auto text-[11.5px] whitespace-nowrap group-hover:text-[var(--brand-text)]"
                                      style={{ color: "var(--text-4)" }}>
                                  {t("downtime.cost.openEntries")} →
                                </span>
                              </span>
                            </td>
                            {/* No share on a category row: the minutes overlap
                                across causes, and a percentage of an
                                overlapping quantity is not a percentage. */}
                            <Figures r={k} showShare={false} muted />
                          </tr>
                        )) : []),

                        ...(cOpen && c.cat_sum > c.minutes ? [(
                          <tr key={`${ck}:ovl`} style={{ background: "var(--bg-inner)" }}>
                            <td colSpan={6} className="px-3 pl-14 py-2 text-[12px] border-t"
                                style={{ ...bd, color: "var(--text-3)" }}>
                              {tp("downtime.cost.overlapNote", {
                                sum: num(c.cat_sum), total: num(c.minutes),
                                diff: num(c.cat_sum - c.minutes),
                              })}
                            </td>
                          </tr>
                        )] : []),
                      ];
                    }) : []),
                  ];
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "var(--bg-inner)" }}>
                  <td className={`${td} font-bold border-t-2`} style={{ borderColor: "var(--border-md)" }}>
                    {t("downtime.cost.total")}
                  </td>
                  <td className={`${td} text-right border-l border-t-2`} style={{ borderColor: "var(--border-md)", color: "var(--text-4)" }}>—</td>
                  <td className={`${td} text-right tabular-nums font-bold border-l border-t-2`} style={{ borderColor: "var(--border-md)" }}>{num(totals.minutes)}</td>
                  <td className={`${td} text-right tabular-nums font-bold border-l border-t-2`} style={{ borderColor: "var(--border-md)" }}>{num(totals.hours, 1)}</td>
                  <td className={`${td} text-right tabular-nums font-bold border-l border-t-2`} style={{ borderColor: "var(--border-md)" }}>{money(totals.cost)}</td>
                  <td className={`${td} text-right tabular-nums font-bold border-l border-t-2 hidden md:table-cell`} style={{ borderColor: "var(--border-md)" }}>
                    {grand ? "100.0%" : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-2.5 border-t text-[11.5px]"
             style={{ ...bd, color: "var(--text-3)" }}>
          <span>{t("downtime.cost.legendExpand")}</span>
          <span>{t("downtime.cost.legendDash")}</span>
          <span>{t("downtime.cost.legendShare")}</span>
        </div>
      </div>

      <p className="text-[12px] leading-snug mb-6" style={{ color: "var(--text-3)" }}>
        {t("downtime.cost.footNote")}
      </p>

      <CostEntriesModal
        open={!!entryCtx} onClose={() => setEntryCtx(null)}
        ctx={entryCtx} from={dateFrom} to={dateTo} money={money}
      />
      <WageRatesModal
        open={ratesOpen} onClose={() => setRatesOpen(false)}
        periods={rates} canEdit={!!data?.can_edit_rates}
        from={dateFrom} to={dateTo}
        onSaved={(d) => show(d?.days_repriced
          ? tp("downtime.cost.rate.saved", { n: d.days_repriced })
          : t("common.saved"), "success")}
      />
      {toastNode}
    </>
  );
}
