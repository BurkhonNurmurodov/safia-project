import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Info, ChevronDown, Flag, Repeat2, Plus, Trash2, Layers, UserRound, Boxes,
  Layers2, Archive, GanttChartSquare, ListTree,
} from "lucide-react";
import { FilterPanel, PickFilter, OptsFilter } from "../components/ui/ColumnFilter";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import DayStepper from "../components/ui/DayStepper";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import { useToast } from "../components/ui/Toast";
import { SkeletonBlock } from "../components/ui/Skeleton";
// The «Perenaladka» tab's table is the SAME component the Setup-times «Fakt»
// tab renders, over the same cell_perenaladka rows — an edit here is that edit.
import PerenaladkaFactTable, {
  usePerenaladkaFact, asIdleCell, useSortState, sortCmp,
} from "../components/setup/PerenaladkaFactTable";
import IntervalFormModal from "../components/idle/IntervalFormModal";
import IntervalRow from "../components/idle/IntervalRow";
import DayTimeline from "../components/idle/DayTimeline";
import { CATS, iconFor } from "../components/idle/categories";
import api from "../utils/api";
import { CATEGORY_COLORS } from "../utils/chartPalette";
import { cellName as pickCellName } from "../utils/cellName";
import { fmtDur } from "../utils/idleTime";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { usePersistentState } from "../hooks/usePersistentState";

const pad2 = (n) => String(n).padStart(2, "0");
const localTodayIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
// Viewer language first, then Russian — the shared registry fallback.
const cellName = (c, lang) => pickCellName(c, lang, "name_");
// Stable per-cell hue so each verifix badge is visually distinct (identity, not
// status) — solid mid-tone with white text reads in both themes.
function hueFromString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360;
  return h;
}

// Cell identity block: verifix badge + workshop name on line 1, the cell's
// OWNING LEADER (role_profiles) muted underneath. Shared by both views so the
// leader always sits in exactly the same spot, and it lives on the row rather
// than as a grouping level because leaders are ~1:1 with cells (93 leaders /
// 108 cells) — grouping would put a heading over almost every single row.
function CellIdent({ cell, t, tl, lang, nameCls = "text-xs", extra }) {
  const hue = hueFromString(cell.verifix_code || "");
  const name = cellName(cell, lang);
  return (
    <span className="min-w-0 flex-1 flex flex-col gap-0.5">
      <span className="flex items-center gap-2 min-w-0">
        <span
          className="text-xs font-bold px-2 py-1 rounded-md flex-shrink-0"
          style={{ background: `hsl(${hue},55%,42%)`, color: "#fff" }}
        >
          {cell.verifix_code}
        </span>
        <span className={`truncate ${nameCls}`} style={{ color: "var(--text-1)" }}>{name || "—"}</span>
        {extra}
      </span>
      <span className="flex items-center gap-1.5 min-w-0 text-[11px] leading-tight" title={t("idleCell.leader")}>
        <Flag size={11} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
        <span className="truncate" style={{ color: cell.leader ? "var(--text-3)" : "var(--text-4)" }}>
          {cell.leader ? tl(cell.leader) : t("idleCell.noLeader")}
        </span>
      </span>
    </span>
  );
}

// A pre-2026-08-20 minutes-only entry: shown, deletable, never editable and
// never added to the total. It has no start and no end, so there is no way to
// tell which of its minutes another entry already counted — folding it in would
// re-create the exact over-count this rebuild exists to remove. It says so on
// the row rather than quietly sitting outside the sum.
function LegacyRow({ entry, t, onDelete }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2" style={{ borderTop: "1px dashed var(--border-md)" }}>
      <Archive size={13} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-4)" }} />
      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0"
            style={{ background: "rgba(148,163,184,0.16)", color: "var(--text-3)" }}
            title={t("idleCell.legacyHint")}
          >
            {t("idleCell.legacyChip")}
          </span>
          <span className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
            {t("idleCell.stopped")} {entry.stopped} · {t("idleCell.notStopped")} {entry.not_stopped}
          </span>
        </div>
        <div className="text-[11px] leading-snug break-words" style={{ color: "var(--text-4)" }}>
          {entry.note}
        </div>
      </div>
      <Button
        size="sm" variant="danger" tint icon={<Trash2 size={13} />}
        className="min-h-[32px] min-w-[32px] flex-shrink-0"
        aria-label={t("idleCell.deleteLegacy")}
        title={t("idleCell.deleteLegacy")}
        onClick={() => onDelete(entry)}
      />
    </div>
  );
}

// The two numbers that carry the whole point of the rebuild. The total is the
// UNION of the stopped ranges; the second line appears only when ranges
// actually overlapped, and says what the old minutes-only method would have
// reported instead. A figure that silently changed would look like a bug —
// this one shows its own correction.
function SummaryStrip({ summary, t }) {
  const overlap = summary?.overlap_min || 0;
  return (
    <div
      className="px-3 py-2.5 flex flex-wrap items-baseline gap-x-4 gap-y-1"
      style={{ background: "var(--bg-inner)", borderTop: "1px solid var(--border)" }}
    >
      <span className="flex items-baseline gap-2">
        <span className="text-[10px] uppercase tracking-wide" style={{ color: "var(--text-4)" }}>
          {t("idleCell.totalStopped")}
        </span>
        <span className="text-base font-bold tabular-nums" style={{ color: summary?.stopped_union_min ? "#ef4444" : "var(--text-3)" }}>
          {summary?.stopped_union_min ? fmtDur(summary.stopped_union_min, t) : "—"}
        </span>
      </span>
      {overlap > 0 && (
        <span className="flex items-baseline gap-2">
          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide" style={{ color: "#eab308" }}>
            <Layers2 size={10} />{t("idleCell.overlapChip")}
          </span>
          <span className="text-xs font-semibold tabular-nums" style={{ color: "#eab308" }}>
            {fmtDur(overlap, t)}
          </span>
        </span>
      )}
      {overlap > 0 && (
        <span className="basis-full text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
          {t("idleCell.oldMethodWouldSay").replace("{v}", fmtDur(summary.stopped_sum_min, t))}
        </span>
      )}
    </div>
  );
}

// ONE cell = one collapsible card, with two interchangeable bodies:
//   view "category" — the 11 categories, each holding its own ojidaniyas
//   view "timeline" — the day drawn to scale + one chronological log
// The header, the totals, the add/edit modal and both delete flows are shared,
// so the two tabs are genuinely two views of one thing and can never drift into
// disagreeing about what the cell's day was.
function CellCard({ cell, date, view, t, tl, lang, autoOpen, toast }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(autoOpen);
  const [infoOpen, setInfoOpen] = useState(null);
  const [form, setForm] = useState(null);          // {interval, category} | null
  const [confirm, setConfirm] = useState(null);    // {kind, row} | null
  const [delErr, setDelErr] = useState("");        // failure shown ON the confirm

  // Only ever opens (never forces closed, so a manual collapse sticks); also
  // catches already-mounted cells when the cell filter narrows the list.
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);

  const intervals = cell.intervals || [];
  const legacy = cell.legacy_entries || [];
  const summary = cell.summary || {};
  const overlapIds = useMemo(() => new Set(summary.overlap_ids || []), [summary]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["idle-cells"] });

  const byCat = useMemo(() => {
    const m = {};
    for (const iv of intervals) (m[iv.category] ||= []).push(iv);
    return m;
  }, [intervals]);
  const legacyByCat = useMemo(() => {
    const m = {};
    for (const e of legacy) (m[e.category] ||= []).push(e);
    return m;
  }, [legacy]);

  const del = useMutation({
    mutationFn: ({ kind, row }) =>
      api.delete(kind === "legacy" ? `/api/idle-cell/${row.id}` : `/api/idle-cell/intervals/${row.id}`),
    onSuccess: () => { setConfirm(null); refresh(); toast.success(t("idleCell.deleted")); },
    // The dialog stays standing with the reason ON it — a failure that closed
    // its own dialog would leave the operator unable to tell a refusal from a
    // deletion, which is the one thing a confirm exists to make unambiguous.
    onError: (e) => setDelErr(e?.response?.data?.detail || t("idleCell.saveError")),
  });

  const addBtn = (category, compact) => (
    <Button
      size={compact ? "sm" : "lg"}
      variant={compact ? "secondary" : "primary"}
      tint={compact || undefined}
      icon={<Plus size={compact ? 13 : 15} />}
      className={compact
        ? "min-h-[32px] min-w-[32px] flex-shrink-0"
        : "w-full md:w-auto min-h-[44px] md:min-h-0"}
      aria-label={t("idleCell.addInterval")}
      title={t("idleCell.addInterval")}
      onClick={(e) => { e.stopPropagation(); setForm({ interval: null, category }); }}
    >
      {compact ? "" : t("idleCell.addInterval")}
    </Button>
  );

  const rowFor = (iv, showCategory) => (
    <IntervalRow
      key={iv.id}
      iv={iv}
      t={t}
      showCategory={showCategory}
      overlapping={overlapIds.has(iv.id)}
      onEdit={(x) => setForm({ interval: x, category: x.category })}
      onDelete={(x) => { setDelErr(""); setConfirm({ kind: "interval", row: x }); }}
    />
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2 min-h-[44px] text-left">
        <ChevronDown
          size={16}
          style={{ color: "var(--text-3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
        />
        <CellIdent cell={cell} t={t} tl={tl} lang={lang} nameCls="text-sm" />
        <span className="flex items-center gap-2 flex-shrink-0 text-xs tabular-nums">
          {summary.overlap_min > 0 && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "rgba(234,179,8,0.16)", color: "#eab308" }}
              title={t("idleCell.overlapHint")}
            >
              <Layers2 size={10} />{fmtDur(summary.overlap_min, t)}
            </span>
          )}
          {legacy.length > 0 && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "rgba(148,163,184,0.16)", color: "var(--text-3)" }}
              title={t("idleCell.legacyHint")}
            >
              {t("idleCell.legacyChip")}
            </span>
          )}
          {summary.stopped_union_min ? (
            <span style={{ color: "#ef4444", fontWeight: 700 }}>{fmtDur(summary.stopped_union_min, t)}</span>
          ) : (
            <span style={{ color: "var(--text-4)" }}>—</span>
          )}
        </span>
      </button>

      {open && (
        <>
          <SummaryStrip summary={summary} t={t} />

          {view === "timeline" ? (
            <>
              {intervals.length > 0 ? (
                <DayTimeline
                  intervals={intervals}
                  summary={summary}
                  t={t}
                  onPick={(iv) => setForm({ interval: iv, category: iv.category })}
                />
              ) : (
                <div className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-4)" }}>
                  {t("idleCell.noIntervals")}
                </div>
              )}
              {intervals.map((iv) => rowFor(iv, true))}
              {legacy.map((e) => (
                <LegacyRow key={`l${e.id}`} entry={e} t={t} onDelete={(row) => { setDelErr(""); setConfirm({ kind: "legacy", row }); }} />
              ))}
            </>
          ) : (
            CATS.map((cat, i) => {
              const Icon = iconFor(cat.code);
              const color = CATEGORY_COLORS[i % CATEGORY_COLORS.length];
              const rows = byCat[cat.name] || [];
              const legacyRows = legacyByCat[cat.name] || [];
              const catUnion = summary.by_category?.[cat.name]?.union_min || 0;
              const showInfo = infoOpen === cat.code;
              return (
                <div key={cat.code} style={{ borderTop: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 min-h-[40px]">
                    <Icon size={14} style={{ color, flexShrink: 0 }} />
                    <span className="text-xs truncate" style={{ color: "var(--text-1)" }}>
                      {t("idleCell.category")} {cat.code}
                    </span>
                    <button
                      type="button"
                      onClick={() => setInfoOpen((c) => (c === cat.code ? null : cat.code))}
                      className="flex-shrink-0 inline-flex items-center justify-center rounded-md p-2 -m-1.5"
                      style={{ color: showInfo ? "var(--brand-text)" : "var(--text-3)", cursor: "pointer" }}
                      aria-label={t(`downtime.cat.${cat.code}.label`)}
                      aria-expanded={showInfo}
                    >
                      <Info size={16} />
                    </button>
                    <span className="ml-auto text-xs tabular-nums flex-shrink-0" style={{ color: catUnion ? "var(--text-1)" : "var(--text-4)", fontWeight: catUnion ? 600 : 400 }}>
                      {catUnion ? fmtDur(catUnion, t) : "—"}
                    </span>
                    {addBtn(cat.name, true)}
                  </div>
                  {showInfo && (
                    <div className="px-3 pb-2.5 pt-0.5 text-xs" style={{ background: "var(--bg-inner)" }}>
                      <div className="font-semibold mb-0.5" style={{ color: "var(--text-1)" }}>
                        {t(`downtime.cat.${cat.code}.label`)}
                      </div>
                      <div style={{ color: "var(--text-3)", lineHeight: 1.5 }}>
                        {t(`downtime.cat.${cat.code}.note`)}
                      </div>
                    </div>
                  )}
                  {rows.map((iv) => rowFor(iv, false))}
                  {legacyRows.map((e) => (
                    <LegacyRow key={`l${e.id}`} entry={e} t={t} onDelete={(row) => { setDelErr(""); setConfirm({ kind: "legacy", row }); }} />
                  ))}
                </div>
              );
            })
          )}

          <div
            className="flex items-center justify-end px-3 pt-2"
            style={{
              borderTop: "1px solid var(--border)",
              paddingBottom: "calc(0.75rem + var(--tg-safe-bottom, 0px))",
            }}
          >
            {addBtn("", false)}
          </div>
        </>
      )}

      <IntervalFormModal
        open={!!form}
        onClose={() => setForm(null)}
        cell={cell}
        date={date}
        interval={form?.interval || null}
        initialCategory={form?.category || ""}
        onSaved={(wasEdit) => { refresh(); toast.success(t(wasEdit ? "idleCell.updated" : "idleCell.saved")); }}
      />

      <ConfirmDialog
        open={!!confirm}
        tone="danger"
        title={t(confirm?.kind === "legacy" ? "idleCell.deleteLegacyTitle" : "idleCell.deleteTitle")}
        message={t(confirm?.kind === "legacy" ? "idleCell.deleteLegacyConfirm" : "idleCell.deleteConfirm")}
        confirmLabel={t("idleCell.delete")}
        cancelLabel={t("idleCell.cancel")}
        loading={del.isPending}
        error={delErr || null}
        onCancel={() => { setDelErr(""); setConfirm(null); }}
        onConfirm={() => confirm && del.mutate(confirm)}
      />
    </div>
  );
}

// This page has three tabs over the same day and the same cells:
//   «Kutish»       — the ojidaniyas grouped under their 11 categories
//   «Vaqt chizig'i» — the SAME ojidaniyas drawn to scale on the day (test view)
//   «Perenaladka»  — that day's changeover minutes (cell_perenaladka), the very
//                    rows the Setup-times «Fakt» tab shows. Same table, same
//                    endpoints, same query key: editing one edits the other.
// All three share ONE filter bar (day → brigadir → smena → lider → yacheyka),
// so switching tabs keeps the operator exactly where they were.
export default function IdleCell() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const toast = useToast({ position: "bottom" });
  // date deliberately NOT persisted: this is a data-entry page — a silently
  // restored stale day could direct entries to the wrong date.
  const [date, setDate] = useState(localTodayIso());
  const [tab, setTab] = usePersistentState("idle_cell_tab", "ojidaniya"); // "ojidaniya" | "timeline" | "peren"
  const [shiftTab, setShiftTab] = usePersistentState("idle_cell_shift", "all"); // "all" | 1 | 2
  const [supervisorId, setSupervisorId] = usePersistentState("idle_cell_supervisor_id", null);
  const [leaderId, setLeaderId] = usePersistentState("idle_cell_leader_id", ""); // "" all · "none" leaderless · leader_id
  const [selectedCellIds, setSelectedCellIds] = usePersistentState("idle_cell_selected_cell_ids", []); // [] = show all of the supervisor's cells
  const [factSort, onFactSort] = useSortState("idle_cell_peren_sort");
  const isPeren = tab === "peren";

  const { data: supData } = useQuery({
    queryKey: ["idle-supervisors"],
    queryFn: () => api.get("/api/idle-cell/supervisors").then((r) => r.data),
  });
  const supervisors = supData ?? [];
  const shiftSupervisors = useMemo(
    () => supervisors.filter((s) => shiftTab === "all" || s.shift === shiftTab),
    [supervisors, shiftTab],
  );

  // `isPending`, never `isFetching`: a BACKGROUND refetch must leave the list
  // standing. Swapping it for skeletons unmounts every CellCard, and `open`
  // lives inside the card — so saving or deleting one ojidaniya (both call
  // `refresh()`) silently collapsed the very cell being worked on.
  const { data: cellsData, isPending: cellsPending } = useQuery({
    queryKey: ["idle-cells", supervisorId, date],
    queryFn: () => api.get(`/api/idle-cell/cells?supervisor_id=${supervisorId}&date=${date}`).then((r) => r.data),
    enabled: !isPeren && supervisorId != null,
  });
  // The changeover day ships every cell in scope at once; a null date keeps the
  // query idle while another tab is open.
  const { cells: factAll, isLoading: factLoading } = usePerenaladkaFact(isPeren ? date : null);

  // Unlike the Ojidaniya endpoint (scoped server-side by the picked brigadir),
  // the fact payload is the caller's whole scope — narrow it here, and treat
  // "no brigadir picked" as ALL brigadirs rather than an empty page.
  const factCells = useMemo(() => {
    let list = factAll.map(asIdleCell);
    if (shiftTab !== "all") list = list.filter((c) => c.shift === shiftTab);
    if (supervisorId != null) list = list.filter((c) => c.manager_id === supervisorId);
    return list;
  }, [factAll, shiftTab, supervisorId]);

  // All tabs feed the same leader → cell chain below.
  const cells = isPeren ? factCells : (cellsData?.cells ?? []);

  // Leader narrows the supervisor's cells, and the cell picker below it only
  // offers what the leader filter left — the toolbar reads as one chain,
  // day → shift → brigadir → lider → yacheyka.
  const leaderCells = useMemo(() => {
    if (!leaderId) return cells;
    return cells.filter((c) => (leaderId === "none" ? !c.leader_id : String(c.leader_id) === leaderId));
  }, [cells, leaderId]);

  const shownCells = useMemo(() => {
    if (!selectedCellIds.length) return leaderCells;
    const set = new Set(selectedCellIds);
    return leaderCells.filter((c) => set.has(String(c.cell_id)));
  }, [leaderCells, selectedCellIds]);

  // Distinct leaders owning the supervisor's cells, name-sorted, "all" first and
  // the leaderless bucket only when there IS one.
  const leaderOptions = useMemo(() => {
    const byId = new Map();
    let anyNone = false;
    for (const c of cells) {
      if (c.leader_id) byId.set(String(c.leader_id), tl(c.leader) || String(c.leader_id));
      else anyNone = true;
    }
    return [
      { value: "", label: t("idleCell.allLeaders") },
      ...(anyNone ? [{ value: "none", label: t("idleCell.noLeader") }] : []),
      ...[...byId.entries()]
        .map(([value, label]) => ({ value, label, title: label }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, lang]);

  // A persisted leader survives a supervisor switch — drop it when nobody in the
  // new list matches, so the page never shows an unexplained empty list.
  useEffect(() => {
    if (!leaderId || !cells.length) return;
    if (!leaderOptions.some((o) => o.value === leaderId)) setLeaderId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderOptions]);

  // A new shift may exclude the picked supervisor — drop it if so.
  function onShift(v) {
    setShiftTab(v);
    setSupervisorId((prev) =>
      prev != null && supervisors.some((s) => s.id === prev && (v === "all" || s.shift === v)) ? prev : null,
    );
    setLeaderId("");
    setSelectedCellIds([]);
  }

  const cellOptions = leaderCells.map((c) => ({
    value: String(c.cell_id),
    label: `${c.verifix_code}${cellName(c, lang) ? " · " + cellName(c, lang) : ""}`,
    title: `${c.verifix_code} ${cellName(c, lang)}`,
  }));

  // Auto-open when there is exactly one visible cell, or the user explicitly
  // narrowed to a few — a large selection stays collapsed to keep the list
  // scannable. Picking a leader counts as narrowing (they own ~1 cell each).
  const narrowed = selectedCellIds.length > 0 || !!leaderId;
  const autoOpen = shownCells.length === 1 || (narrowed && shownCells.length <= 3);

  // The changeover table sorts by its own header clicks; the same filtered set
  // the Ojidaniya list would have shown.
  const factRows = useMemo(() => {
    if (!factSort.key) return shownCells;
    const val = (c) => ({
      cell: c.code, standard: c.standard ?? -1,
      fact: c.entry?.minutes ?? -1, note: c.entry?.note || "",
    }[factSort.key]);
    return [...shownCells].sort(sortCmp(factSort, val));
  }, [shownCells, factSort]);

  const emptyBox = (msg) => (
    <div
      className="rounded-2xl py-12 text-center text-sm"
      style={{ background: "var(--bg-card)", border: "1px dashed var(--border-md)", color: "var(--text-3)" }}
    >
      {msg}
    </div>
  );

  return (
    <Layout title={t("idleCell.title")}>
      {/* View switch — stays OUTSIDE the filter zone (platform rule). */}
      <SegmentedToggle
        asTabs
        scrollable
        value={tab}
        onChange={setTab}
        options={[
          { value: "ojidaniya", label: (<span className="inline-flex items-center gap-1.5"><ListTree size={13} />{t("idleCell.tabOjidaniya")}</span>), title: t("idleCell.tabOjidaniya") },
          { value: "timeline", label: (<span className="inline-flex items-center gap-1.5"><GanttChartSquare size={13} />{t("idleCell.tabTimeline")}</span>), title: t("idleCell.tabTimelineHint") },
          { value: "peren", label: t("idleCell.tabPerenaladka"), title: t("idleCell.tabPerenaladka") },
        ]}
        className="mb-3"
      />
      <div
        className="rounded-2xl px-3 py-2.5 md:px-4 md:py-3 mb-4 flex flex-wrap items-center gap-2"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}
      >
        {/* Date + the supervisor pick stay inline (on the entry tabs the page is
            empty until a supervisor is chosen — that control must never hide);
            shift / leader / cells narrow the view from the panel as chips. */}
        <DayStepper value={date} onChange={setDate} />
        <StyledSelect
          value={supervisorId != null ? String(supervisorId) : ""}
          onChange={(v) => { setSupervisorId(v ? Number(v) : null); setLeaderId(""); setSelectedCellIds([]); }}
          options={[
            // The changeover tab loads every cell in scope at once, so "no
            // brigadir" is a real answer there — an explicit option says so,
            // instead of a placeholder that reads as "nothing chosen yet".
            ...(isPeren ? [{ value: "", label: t("idleCell.allSupervisors") }] : []),
            ...shiftSupervisors.map((s) => ({ value: String(s.id), label: s.name, title: s.name })),
          ]}
          placeholder={t("idleCell.pickSupervisor")}
          searchable
          searchPlaceholder={t("idleCell.searchSupervisor")}
          triggerClassName="px-3 py-2 text-sm"
          className="w-full md:w-auto md:min-w-[180px]"
        />
        <FilterPanel
          sections={[
            {
              key: "shift", icon: Layers, label: t("idleCell.shiftAll"),
              active: shiftTab !== "all",
              display: shiftTab !== "all" ? (shiftTab === 1 ? t("idleCell.shift1") : t("idleCell.shift2")) : "",
              onClear: () => onShift("all"),
              render: () => (
                <SegmentedToggle
                  fill
                  value={shiftTab}
                  onChange={onShift}
                  options={[["all", t("idleCell.shiftAll")], [1, t("idleCell.shift1")], [2, t("idleCell.shift2")]]}
                />
              ),
            },
            // The brigadir's leaders, between shift and cells: each pick narrows
            // the next. Hidden when the unit has a single leader — a one-option
            // filter is just noise. The gate is "are there cells to narrow",
            // not "is a brigadir picked": the changeover tab has its whole
            // scope loaded with no brigadir chosen, and would otherwise offer
            // no way at all to find one leader among a hundred rows.
            ...(cells.length > 0 && leaderOptions.length > 2 ? [{
              key: "leader", icon: UserRound, label: t("idleCell.searchLeader"),
              active: leaderId !== "",
              display: leaderId !== "" ? (leaderOptions.find((o) => o.value === leaderId)?.label || "") : "",
              onClear: () => { setLeaderId(""); setSelectedCellIds([]); },
              render: ({ close } = {}) => (
                <PickFilter searchable close={close}
                  opts={leaderOptions}
                  value={leaderId}
                  onChange={(v) => { setLeaderId(v); setSelectedCellIds([]); }} />
              ),
            }] : []),
            ...(cells.length > 0 ? [{
              key: "cells", icon: Boxes, label: t("idleCell.allCells"),
              active: selectedCellIds.length > 0,
              display: selectedCellIds.length === 1
                ? (cellOptions.find((o) => o.value === selectedCellIds[0])?.label || "")
                : `${selectedCellIds.length} ${t("idleCell.cellsWord")}`,
              onClear: () => setSelectedCellIds([]),
              render: () => (
                <OptsFilter searchable
                  opts={cellOptions.map((o) => o.value)}
                  sel={selectedCellIds}
                  onChange={setSelectedCellIds}
                  render={(v) => cellOptions.find((o) => o.value === v)?.label || v} />
              ),
            }] : []),
          ]}
        />
        <span className="w-full md:w-auto md:ml-auto text-xs" style={{ color: "var(--text-4)" }}>{t("idleCell.testNote")}</span>
      </div>

      {isPeren ? (
        // Standard is read-only here (it is the Setup-times «Standart» register,
        // which only an admin edits); Fakt and the optional note are typed in
        // the row. No supervisor column — the bar above already names one, or
        // says «all», and the leader still rides under the cell code.
        <PerenaladkaFactTable
          icon={Repeat2}
          date={date}
          rows={factRows}
          totalCount={factAll.length}
          isLoading={factLoading}
          sort={factSort}
          onSort={onFactSort}
          showSupervisor={false}
        />
      ) : supervisorId == null ? (
        emptyBox(t("idleCell.pickSupervisorHint"))
      ) : cellsPending ? (
        <div className="space-y-2">
          {/* h-14 = the collapsed row's real height now that the leader line
              sits under the cell name — the skeleton must not jump on load. */}
          {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : shownCells.length === 0 ? (
        emptyBox(t("idleCell.noCells"))
      ) : (
        <div className="space-y-2">
          {shownCells.map((c) => (
            <CellCard
              key={`${c.cell_id}-${date}`}
              cell={c}
              date={date}
              view={tab === "timeline" ? "timeline" : "category"}
              t={t} tl={tl} lang={lang}
              autoOpen={autoOpen}
              toast={toast}
            />
          ))}
        </div>
      )}
      {toast.node}
    </Layout>
  );
}
