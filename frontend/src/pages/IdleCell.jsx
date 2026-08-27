import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  Info, ChevronDown, Flag, Repeat2, Plus, Trash2, Layers, UserRound, Boxes,
  Layers2, Archive, Play, Square, Pencil, Sunrise, FlaskConical,
  GanttChartSquare, ListTree, Clock, Timer, MessageSquareText,
  Lock, Unlock,
} from "lucide-react";
import { FilterPanel, PickFilter, OptsFilter } from "../components/ui/ColumnFilter";
import CategoryLegendModal from "../components/ui/CategoryLegendModal";
import { Th } from "../components/ui/DataTable";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import DayStepper from "../components/ui/DayStepper";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import RequestStateChip from "../components/ui/RequestStateChip";
import { useToast } from "../components/ui/Toast";
import { SkeletonBlock } from "../components/ui/Skeleton";
// The «Perenaladka» tab's table is the SAME component the Setup-times «Fakt»
// tab renders, over the same cell_perenaladka rows — an edit here is that edit.
import PerenaladkaFactTable, {
  usePerenaladkaFact, asIdleCell, useSortState, sortCmp,
} from "../components/setup/PerenaladkaFactTable";
import IntervalFormModal from "../components/idle/IntervalFormModal";
import DayTimeline from "../components/idle/DayTimeline";
import { CATS, iconFor, catColor } from "../components/idle/categories";
import api from "../utils/api";
import { cellName as pickCellName } from "../utils/cellName";
import { fmtDur, toMin } from "../utils/idleTime";
import { useAuth } from "../context/AuthContext";
import { useCapabilities } from "../hooks/useCapabilities";
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

// The category's meaning, or "" when that code was never seeded. `t()` answers
// with the KEY itself when a translation is missing, so the guard is what keeps
// a literal "downtime.cat.X.label" off the screen — the same test Downtime.jsx
// applies wherever it prints a category.
const catLabel = (code, t) => {
  const s = t(`downtime.cat.${code}.label`);
  return s && !s.startsWith("downtime.cat.") ? s : "";
};

// Cell identity block: verifix badge + workshop name on line 1, the cell's
// OWNING LEADER (role_profiles) muted underneath. Shared by both views so the
// leader always sits in exactly the same spot, and it lives on the row rather
// than as a grouping level because leaders are ~1:1 with cells (93 leaders /
// 108 cells) — grouping would put a heading over almost every single row.
function CellIdent({ cell, t, tl, lang, nameCls = "text-xs", extra }) {
  const name = cellName(cell, lang);
  return (
    <span className="min-w-0 flex-1 flex flex-col gap-0.5">
      <span className="flex items-center gap-2 min-w-0">
        {/* NEUTRAL, deliberately. The badge used to take a solid colour hashed
            from the verifix code — identity, in intent. On a platform whose own
            rule is that red and green are STATUS, a hash that paints 4811 red
            and 8411 green beside a downtime figure reads as a traffic light
            nobody set, and a reader scanning the list sees alarm where there is
            only a different number. A code is an identity, so it gets the same
            chrome as every other identity chip here. */}
        <span
          className="text-xs font-bold px-2 py-1 rounded-md flex-shrink-0 tabular-nums"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
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

// The day's two totals, labelled, for a cell row whether it is open or shut.
// «To'xtaganda» is the UNION of the stopped ranges — the workload figure, each
// minute once. «To'xtamaganda» is the plain SUM of the not-stopped entries: they
// may overlap each other freely and none of it is downtime, so it is never
// unioned with anything and never added to the first. Both are always shown
// once the cell holds anything, because a cell whose entries are all
// not-stopped must not read as a cell with no data — the reason the operator
// files them at all is that they explain the day.
function Totals({ summary, t, stacked = false }) {
  const stop = summary?.stopped_union_min || 0;
  const ns = summary?.not_stopped_sum_min || 0;
  const fig = (label, value, color, weight) => (
    <span className="inline-flex items-baseline gap-1.5 whitespace-nowrap">
      <span className="text-[10px]" style={{ color: "var(--text-4)" }}>{label}</span>
      <span className="tabular-nums" style={{ color, fontWeight: weight }}>
        {value ? fmtDur(value, t) : "—"}
      </span>
    </span>
  );
  return (
    <span
      className={`flex ${stacked ? "flex-col items-end gap-0.5 sm:flex-row sm:items-baseline sm:gap-3" : "flex-wrap items-baseline gap-x-3 gap-y-1"} text-xs`}
    >
      {fig(t("idleCell.stopped"), stop, stop ? "#ef4444" : "var(--text-4)", 700)}
      {fig(t("idleCell.notStopped"), ns, ns ? "var(--text-2)" : "var(--text-4)", 600)}
    </span>
  );
}

// Shown ONLY when ranges actually overlapped. The two totals live on the cell
// header now, so a strip that repeated them would be the same number twice, two
// lines apart; what cannot be read anywhere else is the correction — how many
// minutes two causes shared, and what the old minutes-only method would have
// reported by counting them twice.
function OverlapNote({ summary, t }) {
  const overlap = summary?.overlap_min || 0;
  if (!overlap) return null;
  return (
    <div
      className="px-3 py-2 flex flex-wrap items-baseline gap-x-3 gap-y-1"
      style={{ background: "var(--bg-inner)", borderTop: "1px solid var(--border)" }}
    >
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "#eab308" }}>
        <Layers2 size={10} />{t("idleCell.overlapChip")}
      </span>
      <span className="text-xs font-semibold tabular-nums" style={{ color: "#eab308" }}>
        {fmtDur(overlap, t)}
      </span>
      <span className="basis-full text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
        {t("idleCell.oldMethodWouldSay").replace("{v}", fmtDur(summary.stopped_sum_min, t))}
      </span>
    </div>
  );
}

// The stopped / not-stopped answer as a table cell. Colour alone never carries
// it — each state has its own icon and its own word, and the not-stopped one
// says outright that its minutes are outside the total, because that is the
// question the number in the next column would otherwise raise.
function StatusCell({ r, t }) {
  if (r.kind === "legacy") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
        style={{ background: "rgba(148,163,184,0.16)", color: "var(--text-2)" }}
        title={t("idleCell.legacyHint")}
      >
        <Archive size={10} />{t("idleCell.legacyChip")}
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded"
      style={r.stopped
        ? { background: "rgba(239,68,68,0.14)", color: "#ef4444", border: "1px solid rgba(239,68,68,0.35)" }
        : { background: "rgba(148,163,184,0.14)", color: "var(--text-2)", border: "1px solid rgba(148,163,184,0.35)" }}
      title={r.stopped ? t("idleCell.stoppedHint") : t("idleCell.notCountedHint")}
    >
      {r.stopped ? <Square size={9} /> : <Play size={9} />}
      {r.stopped ? t("idleCell.stopped") : t("idleCell.notStopped")}
      {!r.stopped && <span>· {t("idleCell.notCounted")}</span>}
    </span>
  );
}

// The refusal, UNDER the stopped/not-stopped answer — and only when there is
// one to report. An ordinary row wears nothing: it counted the moment it was
// saved, and a chip on every row would leave none of them reading as "look at
// me". Rejected rows are leftovers of the approval step this page no longer
// has (removed 2026-08-22); they stay readable, with their reason beside them,
// because a row that vanished from both lists is a row nobody can explain.
function RequestCell({ r, t }) {
  if (r.kind === "legacy" || r.status !== "rejected") return null;
  return (
    <div className="mt-1 flex flex-col gap-0.5 items-start">
      <RequestStateChip state="rejected" size="xs" label={t("idleCell.stRejected")} />
    </div>
  );
}

// ONE cell = one collapsible card. Shut, it states the day's two totals. Open,
// it shows ONE of two bodies, chosen by the page tab and nothing else:
//   view "table"    — every ojidaniya as a row of one sortable table
//   view "timeline" — the day drawn to scale, and nothing else
// The header, the totals, the add/edit modal and both delete flows are shared,
// so the two views can never drift into disagreeing about what the day was.
//
// Why a flat table rather than the category groups it replaced: category is one
// FACT about an ojidaniya, alongside its answer, its two clock times and its
// length. Promoting it to a grouping level made it the only fact you could sort
// or scan by, and cost a heading row per category on a card that usually holds
// two or three entries. As a column it is comparable with the rest, and the
// whole day reads in start order by default.
// One place that turns a refusal into a sentence. The API's `detail` is either a
// string or an object carrying a `code`, and the one state worth naming is the
// one the reader can act on: re-open the day.
function errText(e, t) {
  // The STRUCTURE lives on `detail_raw`: api.js's interceptor flattens every
  // non-string `detail` to text and keeps the original there. Reading `detail`
  // alone would find a JSON blob where the code should be — and print it.
  const raw = e?.response?.data?.detail_raw;
  const d = e?.response?.data?.detail;
  const code = raw && typeof raw === "object" ? raw.code : null;
  if (code === "day_closed") return t("idleCell.dayClosedErr");
  if (typeof d === "string" && d) return d;
  return t("idleCell.saveError");
}

function CellCard({ cell, date, view, sort, onSort, t, tl, lang, autoOpen, toast, isLeader = false }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(autoOpen);
  const [form, setForm] = useState(null);          // {interval, category} | null
  const [confirm, setConfirm] = useState(null);    // {kind, row} | null
  const [delErr, setDelErr] = useState("");        // failure shown ON the confirm

  // Only ever opens (never forces closed, so a manual collapse sticks); also
  // catches already-mounted cells when the cell filter narrows the list.
  useEffect(() => { if (autoOpen) setOpen(true); }, [autoOpen]);

  const intervals = cell.intervals || [];
  // Rejected rows arrive in their OWN list, so nothing that computes a total
  // ever sees them: `summary` is the server's answer over `intervals` alone.
  // They rejoin here, at the point where the day is READ.
  const requests = cell.requests || [];
  const legacy = cell.legacy_entries || [];
  const summary = cell.summary || {};
  const overlapIds = useMemo(() => new Set(summary.overlap_ids || []), [summary]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["idle-cells"] });

  // ONE row model for both record types, so the table has a single schema.
  // A legacy row is a pre-2026-08-20 minutes-only entry: it has no start and no
  // end, so its time cells are honestly empty, it is never editable, and its
  // minutes never enter any total — with no endpoints there is no way to know
  // which of them another entry already counted, and folding them back in would
  // re-create the exact over-count this page was rebuilt to remove.
  const rows = useMemo(() => {
    const catOrder = (name) => {
      const i = CATS.findIndex((c) => c.name === name);
      return i < 0 ? CATS.length : i;
    };
    // The register first, then what was refused, then the undated legacy
    // records.
    const rank = (iv) => (iv.status === "rejected" ? 2 : (iv.stopped ? 1 : 1.5));
    const out = [
      ...[...intervals, ...requests].map((iv) => ({
        kind: "interval", key: `i${iv.id}`, src: iv,
        category: iv.category, catOrder: catOrder(iv.category),
        stopped: !!iv.stopped, statusOrder: rank(iv),
        status: iv.status || "approved",
        decisionNote: iv.decision_note || "",
        decidedByName: iv.decided_by_name || "",
        // Both travel ON the row from the server — never re-derived from the
        // viewer's role here. A leader's own entry answers false to both.
        canEdit: !!iv.can_edit, canDelete: !!iv.can_delete,
        start: iv.start, end: iv.end,
        startMin: toMin(iv.start) ?? -1,
        endMin: toMin(iv.end) ?? -1,
        minutes: Math.round(iv.minutes || 0),
        note: iv.note || "",
        // Who filed it. Three roles write to one day now — the cell's leader,
        // their brigadir, an admin — so without this a correction and the entry
        // it corrected are indistinguishable rows of free text.
        enteredBy: iv.entered_by_name || "",
        nextDay: !!iv.next_day,
        overlapping: overlapIds.has(iv.id),
      })),
      ...legacy.map((e) => ({
        kind: "legacy", key: `l${e.id}`, src: e,
        category: e.category, catOrder: catOrder(e.category),
        stopped: null, statusOrder: 3,
        status: "legacy", decisionNote: "", decidedByName: "",
        canEdit: false, canDelete: !!e.can_delete,
        start: "", end: "", startMin: -1, endMin: -1,
        // ONE expression feeds both the Minutes cell and the breakdown line
        // below the note. Rounding here and printing the raw float there put
        // two different renderings of the same figure on one row.
        minutes: Number(e.stopped) || 0,
        legacyStopped: Number(e.stopped) || 0,
        legacyNotStopped: Number(e.not_stopped) || 0,
        note: e.note || "",
        enteredBy: e.entered_by_name || "",
        nextDay: false, overlapping: false,
      })),
    ];
    // No sort picked = the order the API sent (already start-ascending), with
    // the undated legacy records after it — i.e. chronological, which is what
    // the day reads as.
    if (!sort?.key) return out;
    const val = (r) => ({
      category: r.catOrder, status: r.statusOrder,
      start: r.startMin, end: r.endMin,
      minutes: r.minutes, note: r.note,
    }[sort.key]);
    return [...out].sort(sortCmp(sort, val));
  }, [intervals, requests, legacy, overlapIds, sort]);

  // Everything the cell HOLDS — the header states the day's totals over it.
  const entryCount = intervals.length + requests.length + legacy.length;

  const del = useMutation({
    mutationFn: ({ kind, row }) =>
      api.delete(kind === "legacy" ? `/api/idle-cell/${row.id}` : `/api/idle-cell/intervals/${row.id}`),
    onSuccess: () => { setConfirm(null); refresh(); toast.success(t("idleCell.deleted")); },
    // The dialog stays standing with the reason ON it — a failure that closed
    // its own dialog would leave the operator unable to tell a refusal from a
    // deletion, which is the one thing a confirm exists to make unambiguous.
    onError: (e) => setDelErr(errText(e, t)),
  });

  const addBtn = (
    <Button
      size="lg"
      variant="primary"
      icon={<Plus size={15} />}
      className="w-full md:w-auto min-h-[44px] md:min-h-0"
      onClick={(e) => { e.stopPropagation(); setForm({ interval: null, category: "" }); }}
    >
      {t("idleCell.addInterval")}
    </Button>
  );

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 sm:gap-3 px-3 py-2 min-h-[44px] text-left">
        <ChevronDown
          size={16}
          style={{ color: "var(--text-3)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }}
        />
        <CellIdent cell={cell} t={t} tl={tl} lang={lang} nameCls="text-sm" />
        <span className="flex items-center gap-2 flex-shrink-0">
          {summary.overlap_min > 0 && (
            <span
              className="hidden sm:inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums"
              style={{ background: "rgba(234,179,8,0.16)", color: "#eab308" }}
              title={t("idleCell.overlapHint")}
            >
              <Layers2 size={10} />{fmtDur(summary.overlap_min, t)}
            </span>
          )}
          {/* Never hidden on a phone. A legacy record's minutes are in NEITHER
              total — with no start and no end there is no way to know which of
              them another entry already counted — so a cell holding only legacy
              rows states «To'xtaganda — · To'xtamaganda —», and this chip is the
              only thing on the row that distinguishes that from a cell where
              nothing was ever filed. */}
          {legacy.length > 0 && (
            <span
              className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
              style={{ background: "rgba(148,163,184,0.16)", color: "var(--text-2)" }}
              title={t("idleCell.legacyHint")}
            >
              {t("idleCell.legacyChip")}
            </span>
          )}
          {/* Both totals, labelled, on every cell row — the answer the page
              exists to give, available without opening anything. A cell holding
              only not-stopped ojidaniyas therefore reads «To'xtaganda — ·
              To'xtamaganda 12 daq» instead of a bare "—", which said "nothing
              was recorded" when it meant "nothing stopped the cell". */}
          {entryCount > 0
            ? <Totals summary={summary} t={t} stacked />
            : <span className="text-xs" style={{ color: "var(--text-4)" }}>—</span>}
        </span>
      </button>

      {open && (
        <>
          <OverlapNote summary={summary} t={t} />

          {entryCount === 0 ? (
            <div className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-4)" }}>
              {t("idleCell.noIntervals")}
            </div>
          ) : view === "timeline" ? (
            /* Bars and nothing else. The rows are one tab away and the header
               above already carries the totals, so repeating the log here would
               make this view a longer copy of the other one rather than a
               different way of reading the day.
               But "only bars" forbids re-listing the rows — it does not permit
               showing NOTHING for records the cell holds. A legacy entry has no
               start and no end, so it cannot be drawn at all; gate on what the
               chart can actually draw, not on the record count, or every day
               before the interval model began opens onto a blank card. */
            intervals.length > 0 ? (
              <DayTimeline
                intervals={intervals}
                summary={summary}
                t={t}
                // The permission travels ON the row, so the bars obey the
                // same rule the table does: never draw a control the API
                // would refuse. A leader's own entry, or any row on a closed
                // day, opens nothing.
                onPick={(iv) => iv.can_edit && setForm({ interval: iv, category: iv.category })}
              />
            ) : (
              <div className="px-3 py-6 text-center text-xs leading-snug" style={{ color: "var(--text-3)" }}>
                {t("idleCell.legacyOnlyTimeline")}
              </div>
            )
          ) : (
            /* Its OWN horizontal scrollport: six columns plus actions cannot fit
               390px, and the page body must never scroll sideways. */
            <div className="overflow-x-auto" style={{ borderTop: "1px solid var(--border)" }}>
              <table
                className="w-full text-xs min-w-[760px] [&_th:not(:last-child)]:border-r [&_td:not(:last-child)]:border-r [&_th]:border-[var(--border)] [&_td]:border-[var(--border)] [&_tbody_tr]:border-t [&_tbody_tr]:border-[var(--border)] [&_tbody_tr:hover]:bg-[var(--bg-inner)]"
                style={{ color: "var(--text-1)" }}
              >
                <thead>
                  <tr>
                    <Th icon={Layers} label={t("idleCell.category")} k="category" sort={sort} onSort={onSort} cls="w-[24%]" />
                    <Th icon={Play} label={t("idleCell.colStatus")} k="status" sort={sort} onSort={onSort} cls="w-[20%]" />
                    <Th icon={Clock} label={t("idleCell.startTime")} k="start" sort={sort} onSort={onSort} cls="w-[104px]" />
                    <Th icon={Clock} label={t("idleCell.endTime")} k="end" sort={sort} onSort={onSort} cls="w-[124px]" />
                    <Th icon={Timer} label={t("idleCell.colMinutes")} k="minutes" sort={sort} onSort={onSort} align="right" cls="w-[96px]" />
                    <Th icon={MessageSquareText} label={t("idleCell.colNote")} k="note" sort={sort} onSort={onSort} />
                    <Th label="" cls="w-[92px]" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const idx = CATS.findIndex((c) => c.name === r.category);
                    // The canonical hue every ojidaniya surface derives —
                    // one category, one colour, on every view.
                    const color = catColor(r.category);
                    const code = idx >= 0 ? CATS[idx].code : String(r.category || "").replace(/^Cat\s*/i, "");
                    const Icon = iconFor(code);
                    const label = catLabel(code, t);
                    return (
                      <tr key={r.key}>
                        <td className="px-3 py-2">
                          <span className="flex items-center gap-1.5 min-w-0">
                            {/* Letter for cross-referencing the Ojidaniya
                                register, meaning for reading this one. */}
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0"
                              style={{ background: `${color}22`, color, border: `1px solid ${color}55` }}
                            >
                              <Icon size={10} />{code}
                            </span>
                            <span className="truncate" title={label || `${t("idleCell.category")} ${code}`}>
                              {label || `${t("idleCell.category")} ${code}`}
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <StatusCell r={r} t={t} />
                          <RequestCell r={r} t={t} />
                        </td>
                        <td className="px-3 py-2 tabular-nums font-semibold">
                          {r.start || <span style={{ color: "var(--text-4)" }}>—</span>}
                        </td>
                        <td className="px-3 py-2 tabular-nums font-semibold">
                          <span className="inline-flex items-center gap-1.5">
                            {r.end || <span style={{ color: "var(--text-4)" }}>—</span>}
                            {r.nextDay && (
                              <span
                                className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded"
                                style={{ background: "rgba(148,163,184,0.18)", color: "var(--text-2)" }}
                                title={t("idleCell.nextDayHint")}
                              >
                                <Sunrise size={9} />{t("idleCell.nextDay")}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          <span className="inline-flex items-center gap-1.5 justify-end">
                            {/* The span carries the tooltip: `title` on an SVG
                                element is an attribute, not a tooltip — only an
                                HTML host shows it. */}
                            {r.overlapping && (
                              <span
                                className="inline-flex"
                                title={t("idleCell.overlapHint")}
                                aria-label={t("idleCell.overlapChip")}
                              >
                                <Layers2 size={11} style={{ color: "#eab308" }} />
                              </span>
                            )}
                            <span style={{ fontWeight: 600 }}>{r.minutes}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-normal">
                          <div className="leading-snug" style={{ color: "var(--text-2)" }}>{r.note}</div>
                          {/* A legacy record's own two figures, in the shape it
                              was filed in. Its Daqiqa cell can only carry one
                              number, and dropping the other would quietly lose
                              the half of an old row nothing else records. */}
                          {r.kind === "legacy" && (
                            <div className="text-[11px] mt-0.5 tabular-nums" style={{ color: "var(--text-3)" }}>
                              {t("idleCell.stopped")} {r.legacyStopped} · {t("idleCell.notStopped")} {r.legacyNotStopped}
                            </div>
                          )}
                          {/* Metadata about the row, so it sits with the row's
                              other prose rather than costing an eighth column
                              on a table already past the width of a phone. At
                              --text-3, not --text-4: legible is what makes an
                              attribution worth printing. */}
                          {/* Why it was refused, back when refusing was a
                              thing. Kept beside the entry it refers to: a
                              reason the leader cannot re-read is an entry they
                              will simply file again unchanged. */}
                          {r.status === "rejected" && r.decisionNote && (
                            <div className="text-[11px] mt-0.5 leading-snug" style={{ color: "#ef4444" }}>
                              {t("idleCell.reasonLabel")}: {r.decisionNote}
                            </div>
                          )}
                          {r.enteredBy && (
                            <div
                              className="text-[11px] mt-0.5 flex items-center gap-1 min-w-0"
                              style={{ color: "var(--text-3)" }}
                            >
                              <UserRound size={10} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
                              <span className="truncate">
                                {t("idleCell.enteredBy")}: {tl(r.enteredBy)}
                                {r.decidedByName && r.status === "rejected" && (
                                  <> · {t("idleCell.rejectedBy")} {tl(r.decidedByName)}</>
                                )}
                              </span>
                            </div>
                          )}
                        </td>
                        {/* Every button here is drawn from the server's own
                            answer for THIS row — never from the viewer's role.
                            A control the API would refuse is absent, not
                            greyed: a disabled button on a phone reads as "not
                            yet", which is a different and wrong story. */}
                        <td className="px-3 py-2">
                          <span className="flex items-center justify-end gap-1">
                            {r.canEdit && (
                              <Button
                                size="sm" variant="secondary" tint icon={<Pencil size={13} />}
                                className="min-h-[32px] min-w-[32px]"
                                aria-label={t("idleCell.editInterval")}
                                title={t("idleCell.editInterval")}
                                onClick={() => setForm({ interval: r.src, category: r.category })}
                              />
                            )}
                            {r.canDelete && (
                              <Button
                                size="sm" variant="danger" tint icon={<Trash2 size={13} />}
                                className="min-h-[32px] min-w-[32px]"
                                aria-label={t(r.kind === "legacy" ? "idleCell.deleteLegacy" : "idleCell.deleteInterval")}
                                title={t(r.kind === "legacy" ? "idleCell.deleteLegacy" : "idleCell.deleteInterval")}
                                onClick={() => { setDelErr(""); setConfirm({ kind: r.kind, row: r.src }); }}
                              />
                            )}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div
            className="flex flex-wrap items-center gap-2 px-3 pt-2"
            style={{
              borderTop: "1px solid var(--border)",
              paddingBottom: "calc(0.75rem + var(--tg-safe-bottom, 0px))",
            }}
          >
            {/* Said once per card, where the missing buttons are — not as a
                `title` on each row, which Telegram's WebView never shows. A
                leader files and never corrects (their rows answer can_edit /
                can_delete false), so the one sentence they need here is who
                does. Gated on the server's `can_manage` as well as the role: a
                leader holding the grant that covers their unit DOES get the
                buttons, and the sentence would then be a lie. */}
            <span className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
              {!cell.can_add ? t("idleCell.dayClosedNoAdd")
                : (isLeader && !cell.can_manage && intervals.length > 0) ? t("idleCell.leaderCannotEdit") : ""}
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-2">
              {cell.can_add && addBtn}
            </span>
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
        // A save lands on the register outright — a leader's included — so
        // «Saqlandi» is the truth for everyone.
        onSaved={(wasEdit) => {
          refresh();
          toast.success(t(wasEdit ? "idleCell.updated" : "idleCell.saved"));
        }}
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
//   «Kutish»        — every ojidaniya as a row of one sortable table
//   «Vaqt chizig'i» — the SAME ojidaniyas drawn to scale, and only that
//   «Perenaladka»   — that day's changeover minutes (cell_perenaladka), the very
//                     rows the Setup-times «Fakt» tab shows. Same table, same
//                     endpoints, same query key: editing one edits the other.
// All three share ONE filter bar (day → brigadir → smena → lider → yacheyka),
// so switching tabs keeps the operator exactly where they were — and both cell
// tabs state the day's two totals on the cell row itself, open or shut, so the
// choice of tab never changes what the day is reported to have been.
export default function IdleCell() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { auth } = useAuth();
  const { seesAllOn } = useCapabilities();
  // The page opened beyond admins on 2026-08-21 — one supervisor and their
  // leaders, by per-profile `page.view.idle-cell` grants. Their scope is
  // decided server-side by `_scoped_cells` and re-decided on every write, so
  // this flag changes DISPLAY only: it removes the controls whose every option
  // the server would answer identically — a brigadir picker holding one unit, a
  // shift filter over a list of one, a cell multi-select holding one cell. A
  // control that cannot change the answer still asks the operator to consider
  // it, and on a phone it costs the row that the day's data needs.
  // Same spelling as Quality's locked view, so "sees only their own rows" has
  // ONE definition on the platform.
  const isLeader = auth?.role === "leader";
  const locked = (auth?.role === "supervisor" || isLeader) && !seesAllOn("idle-cell");
  const toast = useToast({ position: "bottom" });
  // date deliberately NOT persisted: this is a data-entry page — a silently
  // restored stale day could direct entries to the wrong date.
  const [date, setDate] = useState(localTodayIso());
  const [tab, setTab] = usePersistentState("idle_cell_tab", "ojidaniya"); // "ojidaniya" | "timeline" | "peren"
  // ONE sort for every open cell table on the page. The columns are identical
  // from cell to cell, so per-card sort state would be a localStorage key per
  // cell and two tables sorted differently on one screen.
  const [rowSort, onRowSort] = useSortState("idle_cell_row_sort");
  const [shiftTab, setShiftTab] = usePersistentState("idle_cell_shift", "all"); // "all" | 1 | 2
  const [supervisorId, setSupervisorId] = usePersistentState("idle_cell_supervisor_id", null);
  const [leaderId, setLeaderId] = usePersistentState("idle_cell_leader_id", ""); // "" all · "none" leaderless · leader_id
  const [selectedCellIds, setSelectedCellIds] = usePersistentState("idle_cell_selected_cell_ids", []); // [] = show all of the supervisor's cells
  const [factSort, onFactSort] = useSortState("idle_cell_peren_sort");
  const qc = useQueryClient();
  const [legendOpen, setLegendOpen] = useState(false);
  const [reopen, setReopen] = useState(false);      // «re-open the day» dialog
  const [reopenErr, setReopenErr] = useState("");
  const isPeren = tab === "peren";

  const { data: supData, isError: supFailed } = useQuery({
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
  const { data: cellsData, isPending: cellsPending, isError: cellsFailed } = useQuery({
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
  // The day's lock arrives with the ROWS — never from a second call to
  // /api/staff/approvals/day, which is gated on a page a leader does not hold,
  // so for the person this page exists for it would 403.
  const day = cellsData?.day ?? null;

  const refreshCells = () => qc.invalidateQueries({ queryKey: ["idle-cells"] });

  // The ONE re-open door on the platform, reused as-is: a second endpoint would
  // be a second way for the day's state to change without the Daily page or its
  // notifications knowing.
  const reopenMut = useMutation({
    mutationFn: () => api.post("/api/staff/approvals/reopen", { manager_id: supervisorId, date }),
    onSuccess: () => {
      setReopen(false);
      refreshCells();
      qc.invalidateQueries({ queryKey: ["daily-approval"] });
      qc.invalidateQueries({ queryKey: ["staff-approvals-calendar"] });
      qc.invalidateQueries({ queryKey: ["approved-cells"] });
      toast.success(t("idleCell.reopened"));
    },
    onError: (e) => setReopenErr(errText(e, t)),
  });

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

  // The picked brigadir is ONE localStorage key for the whole browser, while
  // the scope it is read against belongs to the PROFILE — so an admin who
  // picked a unit and then switched into a supervisor profile came back holding
  // an id that profile cannot see. The page answered «this brigadir has no
  // cells» about a brigadir its own picker had already stopped showing: a
  // statement about the data, made from a dead pointer. Drop an id the list
  // does not offer, and adopt the list when it holds exactly one — which is
  // what every supervisor and leader sees, so nobody picks themselves out of a
  // list of one. The changeover tab keeps «all» as a real answer, so only the
  // entry tabs adopt.
  useEffect(() => {
    if (!supData) return;                       // nothing to reconcile against yet
    if (supervisorId != null && shiftSupervisors.some((s) => s.id === supervisorId)) return;
    // «All brigadirs» is a real answer on the changeover tab — but not to a
    // viewer whose scope IS one unit, where it would be the same list under a
    // word implying breadth they do not have. So a locked viewer adopts on
    // every tab; an admin keeps «all» there.
    const only = (!isPeren || locked) && shiftSupervisors.length === 1 ? shiftSupervisors[0].id : null;
    if (supervisorId === only) return;
    setSupervisorId(only);
    setLeaderId("");
    setSelectedCellIds([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supData, shiftSupervisors, isPeren, locked]);

  // A new shift may exclude the picked supervisor — drop it if so.
  function onShift(v) {
    setShiftTab(v);
    setSupervisorId((prev) =>
      prev != null && supervisors.some((s) => s.id === prev && (v === "all" || s.shift === v)) ? prev : null,
    );
    setLeaderId("");
    setSelectedCellIds([]);
  }

  // The unit behind a locked viewer's inert chip — the one fact the removed
  // brigadir picker was carrying. Falls back to the only row in scope while the
  // adopt effect is still settling, so the chip never blinks through «—».
  const lockedUnit = useMemo(
    () => supervisors.find((s) => s.id === supervisorId) || supervisors[0] || null,
    [supervisors, supervisorId],
  );

  const cellOptions = leaderCells.map((c) => ({
    value: String(c.cell_id),
    label: `${c.verifix_code}${cellName(c, lang) ? " · " + cellName(c, lang) : ""}`,
    title: `${c.verifix_code} ${cellName(c, lang)}`,
  }));

  // Auto-open when there is exactly one visible cell, or the user explicitly
  // narrowed to a few — a large selection stays collapsed to keep the list
  // scannable. Picking a leader counts as narrowing (they own ~1 cell each).
  // A leader's whole scope is one or two cells and they arrive to FILE, not to
  // browse: landing on shut rows puts a tap between them and the add button on
  // the one surface meant to be fast. Admins and brigadirs keep the browsing
  // default — open only what was explicitly narrowed to.
  const narrowed = selectedCellIds.length > 0 || !!leaderId;
  const autoOpen = shownCells.length === 1 || ((narrowed || isLeader) && shownCells.length <= 3);

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
        value={tab}
        onChange={setTab}
        ariaLabel={t("idleCell.title")}
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
            shift / leader / cells narrow the view from the panel as chips.
            A locked viewer never picks: their unit is adopted above and stated
            as an inert chip in the panel, the same shape a supervisor pinned to
            their plant gets from `useFactorySection`. A one-option dropdown is
            not a choice, and offering it here would suggest there are other
            brigadirs whose day this page could be pointed at. */}
        {/* `max` is left at its default (today) on purpose: `staff.close_day`
            refuses a future date, so a row filed there could never be locked
            with its day. The API refuses one too — this is the poka-yoke. */}
        <DayStepper value={date} onChange={setDate} />
        {!locked && <StyledSelect
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
        />}
        <FilterPanel
          sections={[
            // Whose unit these numbers are — stated, never implied. Removing
            // the picker without this would leave a day's totals on screen with
            // nothing naming the unit they belong to.
            ...(locked ? [{
              key: "unit", icon: UserRound, static: true,
              label: t("idleCell.pickSupervisor"),
              display: lockedUnit ? tl(lockedUnit.name) : "—",
            }] : []),
            // Shift only ever filtered the BRIGADIR picker (a cell's shift is
            // derived from its unit) — with one unit in scope it narrows
            // nothing, so for a locked viewer it is a control that cannot act.
            ...(locked ? [] : [{
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
            }]),
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
            // Was `cells.length > 0`. A multi-select over ONE cell offers the
            // same list whichever way it is answered — which is exactly what a
            // leader owning a single cell was handed. It stays visible while a
            // selection is live, so a filter that IS narrowing the view can
            // always be found and cleared.
            ...(cellOptions.length > 1 || selectedCellIds.length > 0 ? [{
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
        {/* The 11 category definitions, once for the page. They used to be
            reachable only through a per-category ⓘ inside every cell card —
            eleven triggers per cell, each opening one definition — which is
            what made the letters look like the name of the thing. Reference
            material belongs beside the page's controls, not multiplied down
            its content. */}
        <Button
          size="lg"
          variant="secondary"
          icon={<Info size={14} />}
          onClick={() => setLegendOpen(true)}
          title={t("idleCell.catGuideBtn")}
        >
          {t("idleCell.catGuideBtn")}
        </Button>
        <span
          className="w-full md:w-auto md:ml-auto text-xs inline-flex items-center gap-1.5"
          style={{ color: "var(--text-4)" }}
        >
          <FlaskConical size={12} className="flex-shrink-0" />
          {/* «does not replace the sheet import» answers a question only an
              admin has. What a leader needs from this chip is that the page is
              a trial — the rest is vocabulary from a job they do not do. */}
          {t(locked ? "idleCell.testNoteShort" : "idleCell.testNote")}
        </span>
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
      ) : supFailed || cellsFailed ? (
        // A dead request is NOT an empty answer. Both of these used to fall
        // through to «this brigadir has no cells» — the page reporting on data
        // it never received.
        emptyBox(t("common.loadFailed"))
      ) : supData && supervisors.length === 0 ? (
        // Nothing to pick: say so, instead of asking for a choice the picker
        // cannot offer. To a LEADER the same state has a different cause and a
        // different remedy — no cell is assigned to them, which their brigadir
        // fixes on /cells — so it must not be reported as an empty brigadir
        // list they were never shown.
        emptyBox(t(isLeader ? "idleCell.noOwnCells" : "idleCell.empty"))
      ) : supervisorId == null ? (
        // A locked viewer has no picker to act on this, so the instruction
        // would be an order they cannot follow.
        emptyBox(t(locked ? "idleCell.empty" : "idleCell.pickSupervisorHint"))
      ) : cellsPending ? (
        <div className="space-y-2">
          {/* h-14 = the collapsed row's real height now that the leader line
              sits under the cell name — the skeleton must not jump on load. */}
          {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-14 w-full rounded-xl" />)}
        </div>
      ) : shownCells.length === 0 ? (
        emptyBox(t(isLeader && locked ? "idleCell.noOwnCells" : "idleCell.noCells"))
      ) : (
        <div className="space-y-2">
          {/* The day's lock, stated once at the top rather than as an absence
              of buttons the reader has to notice. It names who shut it and
              when, because the next question is always "who do I ask" — and
              for the people who may lift it, the answer is a button here
              instead of a trip to the Daily page. */}
          {day && !day.can_write && (
            <div
              className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl text-xs"
              style={{
                background: "rgba(100,116,139,0.14)",
                border: "1px solid rgba(100,116,139,0.35)",
                color: "var(--text-2)",
              }}
            >
              <Lock size={14} style={{ color: "#94a3b8", flexShrink: 0 }} />
              <span className="font-semibold">{t("idleCell.dayClosedTitle")}</span>
              {day.closed_by && <span style={{ color: "var(--text-3)" }}>· {tl(day.closed_by)}</span>}
              <span className="w-full sm:w-auto sm:ml-1" style={{ color: "var(--text-3)" }}>
                {t("idleCell.dayClosedHint")}
              </span>
              {day.can_reopen && (
                <Button
                  size="sm" variant="secondary" tint icon={<Unlock size={13} />}
                  className="ml-auto"
                  onClick={() => { setReopenErr(""); setReopen(true); }}
                >
                  {t("idleCell.reopenDay")}
                </Button>
              )}
            </div>
          )}

          {shownCells.map((c) => (
            <CellCard
              key={`${c.cell_id}-${date}`}
              cell={c}
              date={date}
              isLeader={isLeader}
              view={tab === "timeline" ? "timeline" : "table"}
              sort={rowSort}
              onSort={onRowSort}
              t={t} tl={tl} lang={lang}
              autoOpen={autoOpen}
              toast={toast}
            />
          ))}
        </div>
      )}
      <ConfirmDialog
        open={reopen}
        title={t("idleCell.reopenTitle")}
        message={t("staff.apprReopenConfirm")}
        confirmLabel={t("idleCell.reopenDay")}
        cancelLabel={t("idleCell.cancel")}
        loading={reopenMut.isPending}
        error={reopenErr || null}
        onCancel={() => { setReopenErr(""); setReopen(false); }}
        onConfirm={() => reopenMut.mutate()}
      />

      {legendOpen && (
        <CategoryLegendModal
          catNames={CATS.map((c) => c.name)}
          catColors={CATS.map((c) => catColor(c.name))}
          onClose={() => setLegendOpen(false)}
        />
      )}
      {toast.node}
    </Layout>
  );
}
