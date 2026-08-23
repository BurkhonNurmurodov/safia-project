import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Activity, ArrowUp, Building2, CheckCircle2, Clock, FileSpreadsheet, Layers,
  Radio, ScrollText, ShieldAlert, TriangleAlert, UserRound, Users,
} from "lucide-react";
import api from "../../utils/api";
import { exportXlsx } from "../../utils/exportXlsx";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import Button from "../../components/ui/Button";
import DateRangePicker from "../../components/ui/DateRangePicker";
import SearchInput from "../../components/ui/SearchInput";
import Pagination from "../../components/ui/Pagination";
import EmptyState from "../../components/ui/EmptyState";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { FilterPanel, OptsFilter, PickFilter } from "../../components/ui/ColumnFilter";
import CategoryRail from "../../components/admin/logs/CategoryRail";
import LogTable from "../../components/admin/logs/LogTable";
import {
  GREEN, RED, fmtDay, labelOf, num, timeAgo, tpl,
} from "../../components/admin/logs/taxonomy";

/**
 * «Jurnal» — the register of everything anybody does on this platform.
 *
 * Two decisions shape the whole screen.
 *
 * **The category is the page's spine, not a filter.** Fourteen kinds of event
 * share one table only if the reader is willing to treat them as one kind of
 * thing, and they are not: "who reopened a day" and "who revealed a browser
 * password" are different questions with different columns. So the rail is
 * always on screen, its counts are computed WITHOUT the category filter (the
 * rail's job is telling you where the rest of the activity is), and picking a
 * category re-shapes the table's middle columns to what that category carries.
 *
 * **Live, but never under the reader's hands.** The register is appended to
 * constantly; a table that reflowed every thirty seconds would move the line
 * somebody is reading. So the page freezes at a generation, polls only a
 * one-row probe for the count, and offers «N new» as a button. The reader
 * decides when the floor moves.
 *
 * Everything here is server-side — page, counts, facets, export — because this
 * table outgrows the browser by design.
 */

const PAGE_SIZE = 50;
const POLL_MS = 30_000;

const SOURCES = ["telegram", "web", "bot", "system"];
const OUTCOMES = ["done", "refused", "denied", "error"];
const LEVELS = ["", "rich", "auto"];

// The workbook's own columns (backend `_COLS`), so the sheet's headers are the
// ones the reader saw on screen. Not the same list as any one table view: the
// export is deliberately the full record.
const EXPORT_COLS = [
  "date", "time", "category", "action", "actor", "actor_role", "source",
  "outcome", "unit", "target", "day", "changes", "reason", "path", "status",
];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const daysAgoISO = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const spanDays = (from, to) =>
  Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000) + 1;

/** One stat tile. Every number on this page describes the FILTERED window, and
 *  the hint line is where each tile says so — a bare figure beside a filtered
 *  table is the oldest way to mislead somebody with true data. */
function Tile({ Icon, label, value, hint, tone, loading }) {
  return (
    <div
      className="rounded-2xl px-3 py-2.5 min-w-0"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-center gap-1.5 mb-1">
        <span
          className="grid place-items-center w-5 h-5 rounded-md flex-shrink-0"
          style={{ background: "var(--bg-inner)" }}
        >
          <Icon size={11} style={{ color: "var(--text-4)" }} />
        </span>
        <span className="text-[10px] uppercase tracking-wide truncate" style={{ color: "var(--text-4)" }}>
          {label}
        </span>
      </div>
      {loading ? (
        <SkeletonBlock className="h-6 w-16" />
      ) : (
        <div className="text-xl font-bold tabular-nums truncate" style={{ color: tone || "var(--text-1)" }}>
          {value}
        </div>
      )}
      {hint && (
        <div className="text-[10px] mt-0.5 leading-tight truncate" style={{ color: "var(--text-4)" }} title={hint}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default function Logs() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const toast = useToast();
  const today = todayISO();

  // ── the view, remembered ────────────────────────────────────────────────────
  const [category, setCategory] = usePersistentState("logs_category", "");
  const [dateFrom, setDateFrom] = usePersistentState("logs_from", today);
  const [dateTo, setDateTo] = usePersistentState("logs_to", today);
  const [q, setQ] = usePersistentState("logs_q", "");
  const [source, setSource] = usePersistentState("logs_source", []);
  const [outcome, setOutcome] = usePersistentState("logs_outcome", []);
  const [actor, setActor] = usePersistentState("logs_actor", "");
  const [unitId, setUnitId] = usePersistentState("logs_unit", "");
  const [action, setAction] = usePersistentState("logs_action", "");
  const [level, setLevel] = usePersistentState("logs_level", "");

  // The search box types locally and queries on a pause. Every keystroke here
  // is a server-side count over a table that grows forever; the box has to feel
  // instant and the SQL must not run six times for one word.
  const [qq, setQq] = useState(q);
  useEffect(() => {
    const id = setTimeout(() => setQq(q), 350);
    return () => clearTimeout(id);
  }, [q]);

  const [page, setPage] = useState(1);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // The generation the table is frozen at. Bumped only by the reader.
  const [gen, setGen] = useState(0);

  const params = useMemo(() => ({
    from: dateFrom,
    to: dateTo,
    category: category || undefined,
    action: action || undefined,
    outcome: outcome.length ? outcome.join(",") : undefined,
    source: source.length ? source.join(",") : undefined,
    actor: actor || undefined,
    unit_id: unitId || undefined,
    q: qq.trim() || undefined,
    enriched: level || undefined,
  }), [dateFrom, dateTo, category, action, outcome, source, actor, unitId, qq, level]);

  const sig = JSON.stringify(params);
  // Any narrowing puts the reader back on page 1 — page 7 of a different result
  // set is not the page they were on.
  useEffect(() => { setPage(1); }, [sig]);

  // ── data ────────────────────────────────────────────────────────────────────
  // The list and the summary are FROZEN together at `gen`: the tiles must never
  // count rows the table is not showing.
  const frozen = { staleTime: 30_000, refetchOnWindowFocus: false, placeholderData: keepPreviousData };

  const listQ = useQuery({
    queryKey: ["admin-logs", "list", sig, page, gen],
    queryFn: async () =>
      (await api.get("/api/admin/logs", { params: { ...params, page, page_size: PAGE_SIZE } })).data,
    ...frozen,
  });

  const sumQ = useQuery({
    queryKey: ["admin-logs", "summary", sig, gen],
    queryFn: async () => (await api.get("/api/admin/logs/summary", { params })).data,
    ...frozen,
  });

  const facetQ = useQuery({
    queryKey: ["admin-logs", "facets", sig, gen],
    queryFn: async () => (await api.get("/api/admin/logs/facets", { params })).data,
    ...frozen,
  });

  // The freshness probe: one row, purely for its `total`. The register is
  // append-only, so the delta against the frozen page IS the number of new
  // rows — no cursor, no id arithmetic. react-query pauses `refetchInterval`
  // while the tab is in the background, so nothing polls off-screen.
  const liveQ = useQuery({
    queryKey: ["admin-logs", "live", sig],
    queryFn: async () =>
      (await api.get("/api/admin/logs", { params: { ...params, page: 1, page_size: 1 } })).data,
    refetchInterval: POLL_MS,
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const data = listQ.data;
  const sum = sumQ.data;
  const facets = facetQ.data;
  const rows = data?.rows || [];
  const total = data?.total ?? 0;
  const loading = listQ.isLoading || (listQ.isFetching && listQ.isPlaceholderData);

  const settled = !listQ.isPlaceholderData && !liveQ.isPlaceholderData;
  const newCount = settled && liveQ.data && data
    ? Math.max(0, (liveQ.data.total ?? 0) - total)
    : 0;

  const applyNew = () => { setGen((g) => g + 1); setPage(1); };

  // ── a pick whose list no longer offers it is dropped ────────────────────────
  // Facet lists are built with their own dimension excluded, so a selected value
  // that has rows is always in its list. Missing means the OTHER filters
  // narrowed it away — and a control naming a value the page cannot show is
  // worse than a reset.
  const facetsFresh = !!facets && !facetQ.isPlaceholderData && !facetQ.isFetching;
  useEffect(() => {
    if (!facetsFresh) return;
    if (action && !facets.actions.some((a) => a.key === action)) setAction("");
    if (actor && !facets.actors.some((a) => a.key === actor)) setActor("");
    if (unitId && !facets.units.some((u) => String(u.id) === String(unitId))) setUnitId("");
  }, [facetsFresh, facets, action, actor, unitId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── labels ──────────────────────────────────────────────────────────────────
  const catLabel = category ? labelOf(t, "logs.cat.", category) : t("logs.all");
  const periodText = dateFrom === dateTo ? fmtDay(dateFrom) : `${fmtDay(dateFrom)} – ${fmtDay(dateTo)}`;
  const multiDay = dateFrom !== dateTo;

  const srcCount = useMemo(
    () => Object.fromEntries((sum?.sources || []).map((s) => [s.key, s.count])), [sum]);
  const outCount = useMemo(
    () => Object.fromEntries((sum?.outcomes || []).map((s) => [s.key, s.count])), [sum]);

  const levelLabel = (v) =>
    v === "auto" ? t("logs.level.auto") : v === "rich" ? t("logs.level.rich") : t("logs.level.all");

  // ── filters ─────────────────────────────────────────────────────────────────
  const sections = [
    {
      key: "source",
      icon: Radio,
      label: t("logs.filter.source"),
      active: source.length > 0,
      display: source.map((s) => labelOf(t, "logs.src.", s)).join(", "),
      onClear: () => setSource([]),
      render: () => (
        <OptsFilter
          opts={SOURCES}
          sel={source}
          onChange={setSource}
          labelOf={(o) => labelOf(t, "logs.src.", o)}
          render={(o) => `${labelOf(t, "logs.src.", o)} · ${num(srcCount[o] || 0)}`}
        />
      ),
    },
    {
      key: "outcome",
      icon: CheckCircle2,
      label: t("logs.filter.outcome"),
      active: outcome.length > 0,
      display: outcome.map((o) => labelOf(t, "logs.out.", o)).join(", "),
      onClear: () => setOutcome([]),
      render: () => (
        <OptsFilter
          opts={OUTCOMES}
          sel={outcome}
          onChange={setOutcome}
          labelOf={(o) => labelOf(t, "logs.out.", o)}
          render={(o) => `${labelOf(t, "logs.out.", o)} · ${num(outCount[o] || 0)}`}
        />
      ),
    },
    {
      key: "actor",
      icon: UserRound,
      label: t("logs.filter.person"),
      active: !!actor,
      display: tl(facets?.actors?.find((a) => a.key === actor)?.name) || actor,
      onClear: () => setActor(""),
      render: ({ close }) => (
        <PickFilter
          searchable
          close={close}
          value={actor}
          onChange={setActor}
          opts={[
            { value: "", label: t("logs.allPeople") },
            ...(facets?.actors || []).map((a) => ({
              value: a.key,
              title: a.name || a.key,
              label: `${tl(a.name) || a.key} · ${num(a.count)}`,
            })),
          ]}
        />
      ),
    },
    {
      key: "unit",
      icon: Building2,
      label: t("logs.filter.unit"),
      active: !!unitId,
      display: tl(facets?.units?.find((u) => String(u.id) === String(unitId))?.name) || String(unitId),
      onClear: () => setUnitId(""),
      render: ({ close }) => (
        <PickFilter
          searchable
          close={close}
          value={unitId}
          onChange={setUnitId}
          opts={[
            { value: "", label: t("logs.allUnits") },
            ...(facets?.units || []).map((u) => ({
              value: u.id,
              title: u.name || String(u.id),
              label: `${tl(u.name) || u.id} · ${num(u.count)}`,
            })),
          ]}
        />
      ),
    },
    {
      key: "action",
      icon: ScrollText,
      label: t("logs.filter.action"),
      active: !!action,
      display: action ? labelOf(t, "logs.act.", action) : "",
      onClear: () => setAction(""),
      render: ({ close }) => (
        <PickFilter
          searchable
          close={close}
          value={action}
          onChange={setAction}
          // A list shortened by the category says so, or a short list reads as
          // missing data.
          note={facets?.actions_narrowed
            ? tpl(t("logs.narrowed"), { section: catLabel, n: (facets.actions || []).length })
            : null}
          empty={category ? (
            <div className="text-center px-1 py-1.5">
              <p className="text-[11px] mb-2 leading-snug" style={{ color: "var(--text-3)" }}>
                {tpl(t("logs.noActions"), { section: catLabel })}
              </p>
              <Button size="sm" variant="secondary" onClick={() => { setCategory(""); close && close(); }}>
                {t("logs.showAllSections")}
              </Button>
            </div>
          ) : null}
          opts={[
            { value: "", label: t("logs.allActions") },
            ...(facets?.actions || []).map((a) => ({
              value: a.key,
              title: labelOf(t, "logs.act.", a.key),
              label: `${labelOf(t, "logs.act.", a.key)} · ${num(a.count)}`,
            })),
          ]}
        />
      ),
    },
    {
      key: "level",
      icon: Layers,
      label: t("logs.filter.level"),
      active: !!level,
      display: levelLabel(level),
      onClear: () => setLevel(""),
      render: ({ close }) => (
        <PickFilter
          close={close}
          value={level}
          onChange={setLevel}
          note={t("logs.levelNote")}
          opts={LEVELS.map((v) => ({
            value: v,
            label: v === "auto" && sum
              ? `${levelLabel(v)} · ${num(sum.auto)}`
              : v === "rich" && sum
                ? `${levelLabel(v)} · ${num(Math.max(0, (sum.total || 0) - (sum.auto || 0)))}`
                : levelLabel(v),
          }))}
        />
      ),
    },
  ];

  const anyFilter = !!(source.length || outcome.length || actor || unitId || action || level || q.trim() || category);
  const clearAll = () => {
    setSource([]); setOutcome([]); setActor(""); setUnitId(""); setAction(""); setLevel("");
  };

  // ── export ──────────────────────────────────────────────────────────────────
  const runExport = async () => {
    setExporting(true);
    try {
      // The sheet reads in the language the tab was read in: the backend holds
      // keys only, so every label it prints comes from here.
      const fieldKeys = [...new Set(rows.flatMap((r) => (r.changes || []).map((c) => c.f)))];
      const labels = {
        ...Object.fromEntries(EXPORT_COLS.map((k) => [`col.${k}`, t(`logs.col.${k}`)])),
        ...Object.fromEntries((sum?.categories || []).map((c) => [`cat.${c.key}`, labelOf(t, "logs.cat.", c.key)])),
        ...Object.fromEntries(OUTCOMES.map((k) => [`out.${k}`, labelOf(t, "logs.out.", k)])),
        ...Object.fromEntries(SOURCES.map((k) => [`src.${k}`, labelOf(t, "logs.src.", k)])),
        ...Object.fromEntries((facets?.actions || []).map((a) => [`act.${a.key}`, labelOf(t, "logs.act.", a.key)])),
        ...Object.fromEntries(fieldKeys.map((f) => [`f.${f}`, labelOf(t, "logs.f.", f)])),
        capped: t("logs.capped"),
      };
      const filename = `actions_${dateFrom}_${dateTo}.xlsx`;
      const via = await exportXlsx("/api/admin/logs/export.xlsx", {
        params,
        body: { labels, filename, caption: tpl(t("logs.exportCaption"), { period: periodText, section: catLabel }) },
        fallbackName: filename,
      });
      toast.success(via === "download" ? t("logs.exportDownloaded") : t("logs.exportSent"));
    } catch (e) {
      toast.error(`${t("logs.exportFailed")}: ${e?.response?.data?.detail || e?.message || ""}`);
    } finally {
      setExporting(false);
    }
  };

  // ── empty state ─────────────────────────────────────────────────────────────
  const widenable = spanDays(dateFrom, dateTo) < 7;
  const emptyAction = widenable ? (
    <Button size="sm" variant="secondary" onClick={() => { setDateFrom(daysAgoISO(6)); setDateTo(today); }}>
      {t("logs.emptyWiden")}
    </Button>
  ) : anyFilter ? (
    <Button size="sm" variant="secondary" onClick={() => { clearAll(); setQ(""); setCategory(""); }}>
      {t("logs.emptyClear")}
    </Button>
  ) : null;

  const empty = (
    <EmptyState
      showUploadLink={false}
      icon={ScrollText}
      height="h-32"
      title={t("logs.emptyTitle")}
      message={tpl(t("logs.emptyMsg"), { period: periodText, section: catLabel })}
      action={emptyAction}
    />
  );

  const last = sum?.last;
  const isError = listQ.isError || sumQ.isError;

  return (
    <div className="lg:flex lg:gap-4 lg:items-start">
      <CategoryRail
        cats={sum?.categories || []}
        total={sum?.total ?? 0}
        value={category}
        loading={sumQ.isLoading}
        onChange={setCategory}
        sheetOpen={sheetOpen}
        onSheet={setSheetOpen}
      />

      <div className="flex-1 min-w-0 space-y-3">
        {/* ONE toolbar row, every control on the 38px baseline. */}
        <div className="flex items-center gap-2 flex-wrap">
          <DateRangePicker
            dateFrom={dateFrom} dateTo={dateTo}
            setDateFrom={setDateFrom} setDateTo={setDateTo}
            max={today} compactLabel triggerClassName="px-3 py-2 text-sm"
          />
          <SearchInput value={q} onChange={setQ} placeholder={t("logs.search")} className="w-44 sm:w-60" />
          <FilterPanel sections={sections} onClearAll={clearAll} />
          <Button
            size="lg" variant="secondary" className="ml-auto"
            loading={exporting} disabled={loading || total === 0}
            icon={!exporting ? <FileSpreadsheet size={14} /> : null}
            onClick={runExport}
          >
            <span className="hidden sm:inline">{t("logs.export")}</span>
          </Button>
        </div>

        {isError && (
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
            style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", color: RED }}
          >
            <TriangleAlert size={13} className="flex-shrink-0 mt-0.5" />
            <span className="min-w-0">
              {listQ.error?.response?.data?.detail || sumQ.error?.response?.data?.detail || t("logs.loadFailed")}
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile
            Icon={Activity}
            label={t("logs.tile.actions")}
            value={num(sum?.total ?? 0)}
            hint={tpl(t("logs.tile.actionsHint"), { period: periodText, section: catLabel })}
            loading={sumQ.isLoading}
          />
          <Tile
            Icon={ShieldAlert}
            label={t("logs.tile.denied")}
            value={num(sum?.denied ?? 0)}
            tone={sum?.denied ? RED : GREEN}
            hint={tpl(t("logs.tile.deniedHint"), { n: num(sum?.total ?? 0) })}
            loading={sumQ.isLoading}
          />
          <Tile
            Icon={Users}
            label={t("logs.tile.people")}
            value={num(sum?.actors ?? 0)}
            hint={t("logs.tile.peopleHint")}
            loading={sumQ.isLoading}
          />
          <Tile
            Icon={Clock}
            label={t("logs.tile.last")}
            value={last ? timeAgo(last.at, t) : "—"}
            hint={last
              ? `${tl(last.actor) || "—"} · ${labelOf(t, "logs.act.", last.action)}`
              : t("logs.tile.lastNone")}
            loading={sumQ.isLoading}
          />
        </div>

        {/* New rows never arrive under the reader's hands — they wait behind a
            button that says how many there are. */}
        {newCount > 0 && (
          <div className="flex justify-center">
            <Button
              size="sm" variant="primary" tint
              icon={<ArrowUp size={13} />}
              onClick={applyNew}
              title={t("logs.newHint")}
            >
              {tpl(t("logs.new"), { n: num(newCount) })}
            </Button>
          </div>
        )}

        <LogTable
          rows={rows}
          category={category}
          loading={loading}
          multiDay={multiDay}
          empty={empty}
          icon={ScrollText}
          title={catLabel}
          subtitle={category ? labelOf(t, "logs.catHint.", category) : t("logs.allHint")}
          right={
            <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
              {tpl(t("logs.rows"), { n: num(total) })}
            </span>
          }
        />

        <Pagination
          page={page}
          pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
          total={total}
          pageSize={PAGE_SIZE}
          onPage={setPage}
        />
      </div>

      {toast.node}
    </div>
  );
}
