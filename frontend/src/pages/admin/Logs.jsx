import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp, Ban, Building2, CheckCircle2, FileSpreadsheet, Layers, Radio, ScrollText,
  TriangleAlert, Undo2, UserRound,
} from "lucide-react";
import api from "../../utils/api";
import { exportXlsx } from "../../utils/exportXlsx";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DateRangePicker from "../../components/ui/DateRangePicker";
import SearchInput from "../../components/ui/SearchInput";
import Pagination from "../../components/ui/Pagination";
import EmptyState from "../../components/ui/EmptyState";
import { SkeletonBlock } from "../../components/ui/Skeleton";
import { useToast } from "../../components/ui/Toast";
import { FilterPanel, OptsFilter, PickFilter } from "../../components/ui/ColumnFilter";
// Sibling parts live under `components/admin/actionlog/`, NOT `.../logs/`:
// frontend/.gitignore carries a bare `logs/` rule (for runtime log folders),
// which matches a directory of that name at ANY depth — a components folder
// called `logs` builds locally and ships nothing.
import LogTable from "../../components/admin/actionlog/LogTable";
import LogPanel from "../../components/admin/actionlog/LogPanel";
import {
  CAT_ICON, DANGER_CAT, GREEN, RED, fmtDay, labelOf, num, timeAgo, tpl,
} from "../../components/admin/actionlog/taxonomy";

/**
 * «Jurnal» — the register of everything anybody does on this platform.
 *
 * Rebuilt on 2026-11-03 (`docs/plan-logs-rebuild.md`). Three decisions shape
 * the screen.
 *
 * **One filter bar, and the table gets the width.** The category used to be a
 * 200px rail beside the table, with four stat tiles above it; the table was
 * left with its last column clipped. Now the period, the search, the category
 * and the outcome stand in one row (the long tail of filters folds into
 * «Filtrlar»), one line of figures sits under them, and the table is the page.
 * The category's counts are still computed WITHOUT the category filter — the
 * menu's job is telling the reader where the rest of the activity is — and a
 * category with nothing in it is dimmed, never hidden. Picking one category
 * still re-shapes the table's middle columns to what that category carries.
 *
 * **A row opens a panel beside the table, not inside it.** The reader is
 * scanning a sequence; an expansion pushed the sequence down, a modal hid it.
 * The panel (`LogPanel.jsx`) takes the right edge, ↑ ↓ walk the rows, Esc
 * closes it, `/` jumps to the search.
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

const SOURCES = ["telegram", "web", "bot", "system", "assistant", "ops"];
const OUTCOMES = ["done", "refused", "denied", "error"];
// What the «refused» figure counts, and what its chip narrows the table to.
const NOT_DONE = ["refused", "denied", "error"];
const LEVELS = ["", "rich", "auto"];

// The workbook's own columns (backend `_COLS`), so the sheet's headers are the
// ones the reader saw on screen. Not the same list as any one table view: the
// export is deliberately the full record.
// Backend column key → the dictionary key the table already localises.
const EXPORT_COL_T = { actor: "who", actor_role: "role" };

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

/** «{n} ta amal» with the number set in bold — the template stays one sentence
 *  per language, the figure is the part the eye lands on. */
function Stat({ tmpl, n }) {
  const [before, after] = String(tmpl).split("{n}");
  return (
    <span className="whitespace-nowrap">
      {before}<b className="tabular-nums font-semibold" style={{ color: "var(--text-1)" }}>{num(n)}</b>{after}
    </span>
  );
}

function Sep() {
  return <span aria-hidden="true" className="w-px h-3.5" style={{ background: "var(--border-md)" }} />;
}

/** One category in the «Bo'lim» menu: icon · name · count, dimmed when the
 *  period holds none of it — dimmed, never hidden, so the list keeps its shape
 *  and the eye learns where each section sits. */
function CatOption({ k, count, t }) {
  const Icon = CAT_ICON[k] || Layers;
  const danger = k === DANGER_CAT;
  return (
    <span
      className="inline-flex items-center gap-1.5 min-w-0"
      style={{ opacity: count ? 1 : 0.45 }}
      title={count ? undefined : t("logs.catEmpty")}
    >
      <Icon size={11} className="flex-shrink-0" style={{ color: danger ? RED : "var(--text-4)" }} />
      <span className="truncate" style={{ color: danger ? RED : undefined }}>{labelOf(t, "logs.cat.", k)}</span>
      <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>· {num(count)}</span>
    </span>
  );
}

export default function Logs() {
  const { t } = useLang();
  const { tl } = useTranslit();
  const toast = useToast();
  const qc = useQueryClient();
  const today = todayISO();

  // ── the view, remembered ────────────────────────────────────────────────────
  const [cats, setCats] = usePersistentState("logs_cats", []);
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
  const [exporting, setExporting] = useState(false);
  // The generation the table is frozen at. Bumped only by the reader.
  const [gen, setGen] = useState(0);
  // The event open in the side panel — by id, so a refetch that still holds
  // the row keeps it open and one that does not closes the panel.
  const [selectedId, setSelectedId] = useState(null);

  // One category keeps its own column set; several fall back to the generic one.
  const category = cats.length === 1 ? cats[0] : "";

  const params = useMemo(() => ({
    from: dateFrom,
    to: dateTo,
    category: cats.length ? cats.join(",") : undefined,
    action: action || undefined,
    outcome: outcome.length ? outcome.join(",") : undefined,
    source: source.length ? source.join(",") : undefined,
    actor: actor || undefined,
    unit_id: unitId || undefined,
    q: qq.trim() || undefined,
    enriched: level || undefined,
  }), [dateFrom, dateTo, cats, action, outcome, source, actor, unitId, qq, level]);

  const sig = JSON.stringify(params);
  // Any narrowing puts the reader back on page 1 — page 7 of a different result
  // set is not the page they were on.
  useEffect(() => { setPage(1); }, [sig]);

  // ── data ────────────────────────────────────────────────────────────────────
  // The list and the summary are FROZEN together at `gen`: the figures must
  // never count rows the table is not showing.
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
  const rows = useMemo(() => data?.rows || [], [data]);
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

  // ── the open event ──────────────────────────────────────────────────────────
  const selIndex = rows.findIndex((r) => r.id === selectedId);
  const selected = selIndex >= 0 ? rows[selIndex] : null;
  // The page moved on (a filter, the next page, the new rows) and the open row
  // went with it: the panel closes rather than show a row the table does not.
  useEffect(() => {
    if (selectedId != null && !loading && !rows.some((r) => r.id === selectedId)) setSelectedId(null);
  }, [rows, loading, selectedId]);
  const openRow = useCallback((r) => setSelectedId(r.id), []);
  const closePanel = useCallback(() => setSelectedId(null), []);

  // `/` focuses the search from anywhere on the page that is not already a
  // field — the one key a register's reader presses most.
  const searchRef = useRef(null);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target;
      const tag = (el?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ── labels ──────────────────────────────────────────────────────────────────
  const catLabel = cats.length === 0
    ? t("logs.all")
    : cats.length === 1 ? labelOf(t, "logs.cat.", cats[0]) : tpl(t("logs.selectedN"), { n: cats.length });
  const periodText = dateFrom === dateTo ? fmtDay(dateFrom) : `${fmtDay(dateFrom)} – ${fmtDay(dateTo)}`;
  const multiDay = dateFrom !== dateTo;

  const srcCount = useMemo(
    () => Object.fromEntries((sum?.sources || []).map((s) => [s.key, s.count])), [sum]);
  const outCount = useMemo(
    () => Object.fromEntries((sum?.outcomes || []).map((s) => [s.key, s.count])), [sum]);
  // The category list and its counts, in the register's own order. Until the
  // summary answers, the vocabulary's order stands in, so the menu is never
  // empty.
  const catList = useMemo(
    () => (sum?.categories?.length ? sum.categories : Object.keys(CAT_ICON).map((key) => ({ key, count: 0 }))),
    [sum]);
  const catCount = useMemo(() => Object.fromEntries(catList.map((c) => [c.key, c.count])), [catList]);

  const levelLabel = (v) =>
    v === "auto" ? t("logs.level.auto") : v === "rich" ? t("logs.level.rich") : t("logs.level.all");

  // ── filters ─────────────────────────────────────────────────────────────────
  // The category and the outcome are PINNED: they stand on the toolbar as their
  // own controls, named, with their value on the trigger. The rest fold into
  // «Filtrlar» — still a press away, but not in the way.
  const sections = [
    {
      key: "category",
      pinned: true,
      icon: Layers,
      label: t("logs.filter.category"),
      active: cats.length > 0,
      display: catLabel,
      onClear: () => setCats([]),
      render: () => (
        <OptsFilter
          opts={catList.map((c) => c.key)}
          sel={cats}
          onChange={setCats}
          labelOf={(k) => labelOf(t, "logs.cat.", k)}
          render={(k) => <CatOption k={k} count={catCount[k] || 0} t={t} />}
        />
      ),
    },
    {
      key: "outcome",
      pinned: true,
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
          empty={cats.length ? (
            <div className="text-center px-1 py-1.5">
              <p className="text-[11px] mb-2 leading-snug" style={{ color: "var(--text-3)" }}>
                {tpl(t("logs.noActions"), { section: catLabel })}
              </p>
              <Button size="sm" variant="secondary" onClick={() => { setCats([]); close && close(); }}>
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

  const anyFilter = !!(cats.length || source.length || outcome.length || actor || unitId || action || level || q.trim());
  const clearAll = () => {
    setCats([]); setSource([]); setOutcome([]); setActor(""); setUnitId(""); setAction(""); setLevel("");
  };

  // The «refused» figure is also the quickest filter: one press narrows the
  // table to everything that did not go through, a second one lifts it.
  const refusedOn = outcome.length === NOT_DONE.length && NOT_DONE.every((o) => outcome.includes(o));
  const toggleRefused = () => setOutcome(refusedOn ? [] : [...NOT_DONE]);

  // ── taking one action back ──────────────────────────────────────────────────
  // The only WRITE on this tab. Two rules it is built on:
  //
  // The verdict is the server's — `undo.ok` and `undo.why` ride on every row and
  // nothing is re-derived here, so the button and the endpoint can never
  // disagree about what is reversible.
  //
  // A refusal lands INSIDE the dialog and the dialog stays standing. Undo's
  // commonest failure is `changed_since` — somebody edited the same thing after
  // this row — and that is precisely the message the operator must read before
  // deciding what to do instead; a toast that has already faded, or Telegram's
  // suppressed `alert()`, would lose it.
  const [undoRow, setUndoRow] = useState(null);
  const [undoErr, setUndoErr] = useState(null);

  const undoM = useMutation({
    mutationFn: async (row) => (await api.post(`/api/admin/logs/${row.id}/undo`)).data,
    onSuccess: (_d, row) => {
      setUndoRow(null);
      setUndoErr(null);
      toast.success(tpl(t("logs.undo.done"), {
        action: labelOf(t, "logs.act.", row.action),
      }));
      // The reversal is itself a row in this register, and the row it reversed
      // now reads as taken back — both are on screen, so both are re-read.
      qc.invalidateQueries({ queryKey: ["admin-logs"] });
    },
    onError: (e) => {
      // 409 → {code, why}; `detail_raw` keeps the structure the interceptor
      // flattens for the eighty call sites that print a sentence.
      const why = e?.response?.data?.detail_raw?.why;
      setUndoErr(why
        ? labelOf(t, "logs.undo.why.", why)
        : (e?.response?.data?.detail || t("logs.undo.failed")));
    },
  });

  const askUndo = (row) => { setUndoErr(null); setUndoRow(row); };

  // ── export ──────────────────────────────────────────────────────────────────
  const runExport = async () => {
    setExporting(true);
    try {
      // The sheet reads in the language the tab was read in: the backend holds
      // keys only, so every label it prints comes from here.
      const fieldKeys = [...new Set(rows.flatMap((r) => (r.changes || []).map((c) => c.f)))];
      const labels = {
        // The backend names two columns differently from the table's own
        // dictionary (`actor`/`actor_role` vs `who`/`role`). Mapped, and routed
        // through `labelOf`, because a bare t() miss returns the KEY — and the
        // backend treats that truthy string as a valid header, so the workbook
        // shipped a column literally titled "logs.col.actor" in every language.
        ...Object.fromEntries(EXPORT_COLS.map(
          (k) => [`col.${k}`, labelOf(t, "logs.col.", EXPORT_COL_T[k] || k)])),
        ...Object.fromEntries(catList.map((c) => [`cat.${c.key}`, labelOf(t, "logs.cat.", c.key)])),
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
    <Button size="sm" variant="secondary" onClick={() => { clearAll(); setQ(""); }}>
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
  const denied = sum?.denied ?? 0;
  const isError = listQ.isError || sumQ.isError;

  return (
    <div className="space-y-3">
      {/* ONE toolbar row, every control on the 38px baseline. */}
      <div className="flex items-center gap-2 flex-wrap">
        <DateRangePicker
          dateFrom={dateFrom} dateTo={dateTo}
          setDateFrom={setDateFrom} setDateTo={setDateTo}
          max={today} compactLabel triggerClassName="px-3 py-2 text-sm"
        />
        <SearchInput
          ref={searchRef}
          value={q}
          onChange={setQ}
          placeholder={t("logs.search")}
          className="w-44 sm:w-64"
          title={t("logs.searchKey")}
          hint={(
            <kbd
              className="text-[10px] leading-none px-1 py-0.5 rounded font-sans"
              style={{ border: "1px solid var(--border-md)", color: "var(--text-4)" }}
            >
              /
            </kbd>
          )}
        />
        <FilterPanel sections={sections} onClearAll={clearAll} />
        <Button
          size="lg" variant="secondary" className="ml-auto"
          loading={exporting} disabled={loading || total === 0}
          icon={!exporting ? <FileSpreadsheet size={14} /> : null}
          onClick={runExport}
        >
          <span className="hidden sm:inline">
            {anyFilter ? tpl(t("logs.exportN"), { n: num(total) }) : t("logs.export")}
          </span>
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

      {/* ONE line of figures, every one describing the FILTERED window the
          table shows. The «refused» figure is a control; the rest are facts. */}
      <div
        className="flex items-center gap-x-3 gap-y-1.5 flex-wrap px-1 text-xs min-h-[24px]"
        style={{ color: "var(--text-2)" }}
        aria-live="polite"
      >
        {sumQ.isLoading ? (
          <SkeletonBlock className="h-4 w-56" />
        ) : (
          <>
            <Stat tmpl={t("logs.stat.events")} n={sum?.total ?? 0} />
            <Sep />
            <Stat tmpl={t("logs.stat.people")} n={sum?.actors ?? 0} />
            <Sep />
            <button
              type="button"
              onClick={toggleRefused}
              aria-pressed={refusedOn}
              title={tpl(t("logs.tile.deniedHint"), { n: num(sum?.total ?? 0) })}
              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
              style={denied
                ? { background: `${RED}1f`, color: RED, border: `1px solid ${RED}${refusedOn ? "" : "55"}` }
                : { background: "var(--bg-inner)", color: "var(--text-3)", border: `1px solid ${refusedOn ? "var(--brand)" : "var(--border)"}` }}
            >
              <Ban size={11} />
              {tpl(t("logs.stat.refused"), { n: num(denied) })}
            </button>
            <span className="ml-auto inline-flex items-center gap-1.5 min-w-0" style={{ color: "var(--text-3)" }}>
              <span
                aria-hidden="true"
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: GREEN, boxShadow: `0 0 0 3px ${GREEN}33` }}
              />
              <span className="truncate tabular-nums">
                {last ? tpl(t("logs.stat.live"), { time: last.time || "—" }) : t("logs.stat.liveNone")}
                {last && (
                  <span style={{ color: "var(--text-4)" }}>
                    {" · "}{tl(last.actor) || "—"}{" · "}{labelOf(t, "logs.act.", last.action)}
                  </span>
                )}
              </span>
            </span>
          </>
        )}
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
        selectedId={selectedId}
        onSelect={openRow}
      />

      <Pagination
        page={page}
        pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))}
        total={total}
        pageSize={PAGE_SIZE}
        onPage={setPage}
      />

      {selected && (
        <LogPanel
          r={selected}
          onClose={closePanel}
          onPrev={() => selIndex > 0 && setSelectedId(rows[selIndex - 1].id)}
          onNext={() => selIndex < rows.length - 1 && setSelectedId(rows[selIndex + 1].id)}
          hasPrev={selIndex > 0}
          hasNext={selIndex < rows.length - 1}
          onUndo={askUndo}
          busy={undoM.isPending && undoM.variables?.id === selected.id}
        />
      )}

      {undoRow && (
        <ConfirmDialog
          open
          icon={<Undo2 size={16} />}
          title={t("logs.undo.confirmTitle")}
          message={(
            <>
              <span className="block">
                {tpl(t("logs.undo.confirmBody"), {
                  action: labelOf(t, "logs.act.", undoRow.action),
                  who: tl(undoRow.actor) || undoRow.actor_key || "—",
                  ago: timeAgo(undoRow.at, t),
                })}
              </span>
              <span className="block mt-2 font-medium" style={{ color: "var(--text-2)" }}>
                {tpl(t("logs.undo.will"), {
                  action: labelOf(t, "logs.act.", undoRow.undo?.action),
                })}
              </span>
              <span className="block mt-2 text-[11px]" style={{ color: "var(--text-4)" }}>
                {t("logs.undo.recorded")}
              </span>
            </>
          )}
          confirmLabel={t("logs.undo.do")}
          loading={undoM.isPending}
          error={undoErr}
          onCancel={() => { if (!undoM.isPending) { setUndoRow(null); setUndoErr(null); } }}
          onConfirm={() => undoM.mutate(undoRow)}
        />
      )}

      {toast.node}
    </div>
  );
}
