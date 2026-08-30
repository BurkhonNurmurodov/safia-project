import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, CornerDownRight,
  Lock, Scissors, Split, TriangleAlert, Undo2, UserMinus, Users, X,
} from "lucide-react";

import api from "../../utils/api";
import { cellLabel } from "../../utils/cellName";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import ConfirmDialog from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import FormField from "../ui/FormField";
import Modal from "../ui/Modal";
import SearchInput from "../ui/SearchInput";
import StyledSelect from "../ui/StyledSelect";
import TimeField from "../ui/TimeField";
import { SkeletonBlock } from "../ui/Skeleton";
import { useToast } from "../ui/Toast";

/**
 * «Yacheykalarga taqsimlash» — the supervisor's own placement editor.
 *
 * A people-exchange no longer names a destination cell: an accepted move lands
 * the worker in the receiving unit with `verifix_code` NULL, because the person
 * deciding the exchange is not the person who knows which of the receiving
 * unit's cells has a pair of hands missing. That knowledge sits with the
 * supervisor, and this is where they spend it — so a day cannot be closed while
 * any counted worker in the unit has no cell (the backend refuses), and this
 * panel is the ONE way to clear that state.
 *
 * Three things happen here and they are all the same act — deciding where a
 * person's hours land:
 *   place  — an unplaced worker into one of the unit's own cells
 *   move   — a worker from one of the unit's cells into another
 *   split  — ONE worker across TWO of the unit's cells, cut by a clock time
 *
 * A SPLIT names the person in both cells and counts them as a FRACTION in each,
 * pro-rata by hours (`hc_weight`, the two halves summing to 1.0), because the
 * alternative answers are both lies: counting them once in each cell invents a
 * person the plant does not have, and picking one cell erases hours that were
 * genuinely worked in the other. The SERVER computes the exact shares from the
 * clock window on save — everything this panel shows for an unsaved split is a
 * preview and says so with «≈».
 *
 * EVERYTHING IS A LOCAL DRAFT until Save, the admin «Davomat» tab's model. A
 * placement is a judgement about a whole shift and is usually made in one
 * sitting across several cells; writing per tap would mean a half-finished
 * arrangement is the live one, and every intermediate state would notify and
 * re-score. The amber «N saqlanmagan» chip is the call to action.
 *
 * Read-only whenever the caller says so or the day is closed — and it SAYS
 * WHICH, because a control that is simply dead teaches the operator that the
 * page is broken rather than that the day is.
 */

const QK = "staff-cell-placement";

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtNum(v, digits = 1) {
  if (v == null) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Server error → a string we can actually show. FastAPI details may be objects. */
function errText(e, fallback) {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") return d.detail || d.message || d.code || fallback;
  return e?.message || fallback;
}

function parseHHMM(v) {
  const m = /^\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*$/.exec(String(v ?? ""));
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

/** '08:00-19:47' → [in, out] in minutes; [null, null] when unparseable. */
function clockBounds(clock) {
  const s = String(clock ?? "");
  if (!s.includes("-")) return [null, null];
  const [left, right] = s.split("-");
  return [parseHHMM(left), parseHHMM(right)];
}

/**
 * The two shares a split at `at` would produce — a PREVIEW of what the server
 * will compute, never the answer itself.
 *
 * Same clock convention as everywhere else on the platform: Tashkent wall clock,
 * an end at or before the start means the window crossed midnight, and the split
 * moment crosses with it. `null` means the question cannot be answered from what
 * is on screen (an unparseable clock, or a time outside the window) — the caller
 * decides whether that is a refusal or a shrug.
 */
function shareAt(clock, at) {
  const [ci, co] = clockBounds(clock);
  const mid0 = parseHHMM(at);
  if (ci == null || co == null || mid0 == null) return null;
  const end = co <= ci ? co + 1440 : co;
  const mid = mid0 < ci ? mid0 + 1440 : mid0;
  const span = end - ci;
  if (span <= 0 || mid <= ci || mid >= end) return null;
  const a = (mid - ci) / span;
  return [a, 1 - a];
}

const pct = (w) => `${Math.round((Number(w) || 0) * 100)}%`;

// ── small pieces ──────────────────────────────────────────────────────────────

const TONES = {
  ok: "#22c55e",
  warn: "#eab308",
  danger: "#ef4444",
  neutral: "#94a3b8",
  brand: "var(--brand)",
};

function Chip({ tone = "neutral", icon: Icon, children, title }) {
  const c = TONES[tone] || TONES.neutral;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
    >
      {Icon && <Icon size={10} />}
      {children}
    </span>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div
      className="rounded-xl px-3 py-2 min-w-0"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
    >
      <div className="text-[10px] uppercase tracking-wider truncate" style={{ color: "var(--text-4)" }}>
        {label}
      </div>
      <div className="text-base font-bold tabular-nums mt-0.5" style={{ color: tone || "var(--text-1)" }}>
        {value}
      </div>
    </div>
  );
}

/**
 * One person, one line. The whole line is the SELECT target — a phone has no
 * hover, so a small handle beside the name would be the only way in and would
 * be missed. The undo control is a SIBLING button, never nested inside it.
 */
function WorkerLine({ entry, t, tl, selected, selectable, onSelect, onUndo }) {
  const isSplit = entry.splitKind != null;
  return (
    <div
      className="flex items-center gap-1.5 px-2 sm:px-3"
      style={{
        borderTop: "1px solid var(--border)",
        background: selected ? "var(--brand-bg)" : "transparent",
      }}
    >
      <button
        type="button"
        disabled={!selectable}
        onClick={() => onSelect?.(entry)}
        className="flex items-center gap-2 min-w-0 flex-1 text-left py-2"
        style={{ minHeight: 44, cursor: selectable ? "pointer" : "default" }}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span
              className="text-xs font-semibold truncate"
              style={{ color: entry.counted ? "var(--text-1)" : "var(--text-3)" }}
            >
              {tl(entry.name)}
            </span>
            {isSplit && (
              <Chip tone="brand" icon={Split} title={entry.approx ? t("cellPlace.approx") : undefined}>
                {entry.approx ? "≈" : ""}{pct(entry.weight)}
              </Chip>
            )}
            {entry.staged === "move" && <Chip tone="warn" icon={CornerDownRight}>{t("cellPlace.movedChip")}</Chip>}
            {entry.staged === "split" && <Chip tone="warn" icon={Scissors}>{t("cellPlace.splitChip")}</Chip>}
            {entry.staged === "unsplit" && <Chip tone="warn" icon={Undo2}>{t("cellPlace.unsplitChip")}</Chip>}
            {!entry.counted && <Chip tone="neutral">{t("cellPlace.notCounted")}</Chip>}
          </div>
          <div className="text-[10px] mt-0.5 truncate" style={{ color: "var(--text-4)" }}>
            {[
              entry.job ? tl(entry.job) : null,
              entry.clock || null,
              entry.splitAt ? `${t("cellPlace.splitAtShort")} ${entry.splitAt}` : null,
              entry.fromUnit ? t("cellPlace.fromUnit").replace("{name}", tl(entry.fromUnit)) : null,
            ].filter(Boolean).join(" · ") || "—"}
          </div>
        </div>
        <span
          className="text-[11px] tabular-nums whitespace-nowrap flex-shrink-0"
          style={{ color: "var(--text-3)" }}
        >
          {entry.approx ? "≈" : ""}{fmtNum(entry.hours, 1)} {t("cellPlace.hoursShort")}
        </span>
      </button>

      {onUndo && (
        <Button
          variant="ghost"
          size="lg"
          tint
          className="flex-shrink-0"
          style={{ minHeight: 44, paddingInline: 10, color: "#eab308" }}
          icon={<Undo2 size={14} />}
          title={t("cellPlace.undo")}
          aria-label={t("cellPlace.undo")}
          onClick={onUndo}
        />
      )}
    </div>
  );
}

// ── panel ─────────────────────────────────────────────────────────────────────

export default function CellPlacementPanel({ managerId, selectedDate, canEdit = false }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  // Bottom-centred: this is a dense editing surface and a top-right toast lands
  // on the toolbar the operator is working in.
  const toast = useToast({ position: "bottom" });

  // ── the draft. Nothing here has reached the server. ────────────────────────
  const [moves, setMoves] = useState({});       // attendance_id → target verifix_code
  const [splits, setSplits] = useState({});     // attendance_id → { code, second, at }
  const [unsplits, setUnsplits] = useState([]); // SECONDARY row ids to merge back

  const [sel, setSel] = useState(null);         // the selected entry key
  const [expanded, setExpanded] = useState([]); // open cell codes
  const [search, setSearch] = useState("");
  const [splitFor, setSplitFor] = useState(null); // { id, name, clock, code }
  const [splitForm, setSplitForm] = useState({ code: "", second: "", at: "" });
  const [splitErr, setSplitErr] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const enabled = !!managerId && !!selectedDate;

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [QK, managerId, selectedDate],
    queryFn: () => api
      .get("/api/staff/cell-placement", { params: { manager_id: managerId, attend_date: selectedDate } })
      .then((r) => r.data),
    enabled,
    retry: 1,
  });

  const dayClosed = !!data?.day_closed;
  // Three separate answers to "may this be edited" — the caller's, the server's
  // and the day's — and the reader is told WHICH one closed the door.
  const editable = canEdit && !!data?.can_edit && !dayClosed;

  const resetDraft = useCallback(() => {
    setMoves({});
    setSplits({});
    setUnsplits([]);
    setSel(null);
  }, []);

  // ── projection: server rows + draft → what is on screen ────────────────────
  //
  // ONE rule builds every figure on this panel — the per-cell «n/m kishi», the
  // hours, and the KPI strip — so a cell's own line and the strip above it can
  // never disagree about the same worker.
  const view = useMemo(() => {
    const cells = data?.cells ?? [];
    const unplacedRows = data?.unplaced ?? [];

    const server = [];
    for (const r of unplacedRows) server.push({ r, code: null });
    for (const c of cells) for (const r of (c.workers ?? [])) server.push({ r, code: c.verifix_code });

    const byId = new Map(server.map((s) => [s.r.id, s]));
    // A saved split's SECONDARY row, indexed by the primary it belongs to.
    const secondaryOf = new Map();
    for (const s of server) if (s.r.split_of != null) secondaryOf.set(s.r.split_of, s.r);

    // Only ids that really are secondary rows in THIS payload can be unsplit —
    // a stale draft entry (the day was re-read, somebody else merged it) must
    // not silently delete a row it no longer describes.
    const dropped = new Set(unsplits.filter((id) => byId.get(id)?.r.split_of != null));

    const entries = [];
    for (const { r, code: serverCode } of server) {
      if (dropped.has(r.id)) continue;

      const mergedBack = secondaryOf.has(r.id) && dropped.has(secondaryOf.get(r.id).id);
      const half = mergedBack ? secondaryOf.get(r.id) : null;

      const target = moves[r.id];
      const moved = target != null && target !== serverCode;

      entries.push({
        key: `r${r.id}`,
        id: r.id,
        virtual: false,
        name: r.worker_name,
        job: r.job_title,
        clock: r.clock_in_out,
        fromUnit: r.from_unit || null,
        counted: r.counted !== false,
        // Merging the halves back gives the person their whole day again; the
        // other half's hours come with them, since that is where they went.
        hours: (Number(r.hours) || 0) + (half ? (Number(half.hours) || 0) : 0),
        weight: mergedBack ? 1 : (r.hc_weight == null ? 1 : Number(r.hc_weight)),
        code: moved ? target : serverCode,
        serverCode,
        splitAt: mergedBack ? null : (r.split_at || null),
        splitKind: mergedBack ? null : (r.split_of != null ? "secondary" : (r.hc_weight != null ? "primary" : null)),
        // A saved split is undone from its SECONDARY row — that is the id the
        // contract's `unsplits` names — so the primary carries both handles:
        // the one that stages the merge and the one that takes it back.
        secondaryId: mergedBack ? null : (secondaryOf.get(r.id)?.id ?? null),
        undoUnsplitId: mergedBack ? half.id : null,
        // Only a WHOLE person can be split, and a person merged back in this
        // same draft stays whole until the merge is saved: one PUT carrying an
        // unsplit AND a split for the same row asks the server to order two
        // edits of one arrangement, which the contract does not promise.
        splittable: r.hc_weight == null && r.split_of == null,
        staged: mergedBack ? "unsplit" : (moved ? "move" : null),
        approx: false,
      });
    }

    const byEntryId = new Map(entries.map((e) => [e.id, e]));

    // Staged splits: the primary keeps its row and gains a share; the second
    // half is VIRTUAL until Save, which is why it carries no attendance id of
    // its own and is drawn with «≈».
    for (const [rawId, s] of Object.entries(splits)) {
      const id = Number(rawId);
      const prim = byEntryId.get(id);
      // A stale draft entry — the row was merged, deleted, or came back from
      // the server already split — describes an arrangement this payload no
      // longer has, so it is ignored rather than applied to whatever now
      // carries that id.
      if (!prim || !prim.splittable || !s?.code || !s?.second) continue;
      const parts = shareAt(prim.clock, s.at) || [0.5, 0.5];
      const whole = prim.hours;
      prim.code = s.code;
      prim.weight = parts[0];
      prim.hours = whole * parts[0];
      prim.splitAt = s.at;
      prim.splitKind = "primary";
      prim.staged = "split";
      prim.approx = true;
      entries.push({
        ...prim,
        key: `s${id}`,
        virtual: true,
        code: s.second,
        weight: parts[1],
        hours: whole * parts[1],
        splitKind: "secondary",
        secondaryId: null,
        splittable: false,
      });
    }

    // Per-cell buckets, EMPTY cells included: somebody must always be placeable
    // into a cell that currently holds nobody.
    const buckets = new Map();
    for (const c of cells) {
      buckets.set(c.verifix_code, {
        code: c.verifix_code,
        cellId: c.cell_id,
        leader: c.leader_name,
        entries: [],
        counted: 0,
        hours: 0,
      });
    }
    const loose = [];
    for (const e of entries) {
      const b = e.code != null ? buckets.get(e.code) : null;
      if (!b) { loose.push(e); continue; }
      b.entries.push(e);
      if (e.counted) b.counted += e.weight;
      b.hours += e.hours;
    }

    const totals = {
      cells: cells.length,
      workers: entries.length,
      counted: entries.reduce((a, e) => a + (e.counted ? e.weight : 0), 0),
      hours: entries.reduce((a, e) => a + e.hours, 0),
      unplaced: loose.length,
    };

    return { buckets: [...buckets.values()], loose, totals, byEntryId, dropped };
  }, [data, moves, splits, unsplits]);

  // ── search ─────────────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const hit = useCallback((s) => !q || String(s ?? "").toLowerCase().includes(q), [q]);

  const shown = useMemo(() => {
    if (!q) return { cells: view.buckets, loose: view.loose };
    const cells = [];
    for (const b of view.buckets) {
      // A cell matched by its own code shows everybody in it; otherwise only the
      // people the search actually found.
      const self = hit(b.code) || hit(b.leader);
      const rows = self ? b.entries : b.entries.filter((e) => hit(e.name) || hit(e.job));
      if (self || rows.length) cells.push({ ...b, entries: rows });
    }
    return { cells, loose: view.loose.filter((e) => hit(e.name) || hit(e.job)) };
  }, [q, view, hit]);

  // ── selection & staging ────────────────────────────────────────────────────
  const selected = sel ? [...view.buckets.flatMap((b) => b.entries), ...view.loose].find((e) => e.key === sel) : null;
  // Half of a split is not moved on its own — the two legs and the time they
  // were cut at describe ONE arrangement, so the way to change where a half
  // lands is to undo the split and make it again.
  const movable = !!selected && !selected.virtual && selected.splitKind == null;

  const toggleExpand = (code) =>
    setExpanded((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));

  const place = (entry, code) => {
    if (!entry || entry.code === code) return;
    if (entry.virtual || entry.splitKind != null) {
      // Half of a split is placed by editing the split, not by moving one leg
      // out from under it — otherwise the two halves and the time they were cut
      // at stop describing the same arrangement.
      toast.warning(t("cellPlace.cantMoveHalf"));
      return;
    }
    setMoves((cur) => {
      const next = { ...cur };
      if (code === entry.serverCode) delete next[entry.id];   // back where it started = no change
      else next[entry.id] = code;
      return next;
    });
    setSel(null);
    setExpanded((cur) => (cur.includes(code) ? cur : [...cur, code]));
  };

  const undoEntry = (entry) => {
    if (entry.staged === "move") {
      setMoves((cur) => { const n = { ...cur }; delete n[entry.id]; return n; });
    } else if (entry.staged === "split") {
      setSplits((cur) => { const n = { ...cur }; delete n[entry.id]; return n; });
    } else if (entry.staged === "unsplit") {
      setUnsplits((cur) => cur.filter((id) => id !== entry.undoUnsplitId));
    }
    setSel(null);
  };

  const openSplit = () => {
    if (!selected) return;
    setSplitFor({ id: selected.id, name: selected.name, clock: selected.clock });
    setSplitForm({ code: selected.code || "", second: "", at: "" });
    setSplitErr(null);
  };

  const commitSplit = () => {
    const { code, second, at } = splitForm;
    if (!code || !second || !at) { setSplitErr(t("cellPlace.splitNeedAll")); return; }
    if (code === second) { setSplitErr(t("cellPlace.splitSame")); return; }
    // Only refuse what we can actually prove wrong: with an unparseable clock
    // window there is no question to answer here and the server is the judge.
    const [ci, co] = clockBounds(splitFor.clock);
    if (ci != null && co != null && !shareAt(splitFor.clock, at)) {
      setSplitErr(t("cellPlace.splitOutside"));
      return;
    }
    setSplits((cur) => ({ ...cur, [splitFor.id]: { code, second, at } }));
    // A split names its own first cell, so any move staged for the same person
    // is now a second, contradictory answer to the same question.
    setMoves((cur) => { const n = { ...cur }; delete n[splitFor.id]; return n; });
    setExpanded((cur) => [...new Set([...cur, code, second])]);
    setSplitFor(null);
    setSel(null);
  };

  const askUnsplit = (entry) => {
    const secId = entry.splitKind === "secondary" ? entry.id : entry.secondaryId;
    if (secId == null) return;
    setUnsplits((cur) => (cur.includes(secId) ? cur : [...cur, secId]));
    setSel(null);
  };

  // ── save ───────────────────────────────────────────────────────────────────
  // The payload is built from the PROJECTION, not from the raw draft, so a
  // staged change the current payload no longer describes (the row was merged,
  // deleted, or re-read as somebody else's) is dropped rather than sent —
  // otherwise «N saqlanmagan» counts edits nothing on screen can show and the
  // save comes back with a 400 the operator cannot act on.
  const payload = useMemo(() => ({
    manager_id: managerId,
    date: selectedDate,
    // A row whose split was just undone is an ordinary row again, so it can be
    // moved in the same draft — and the server runs unsplits BEFORE moves, so
    // the pair is safe to send together. Its `staged` still reads "unsplit"
    // (that is the louder of the two facts), which is why filtering on
    // `staged === "move"` alone silently dropped the move while the table drew
    // the worker in their new cell.
    moves: Object.entries(moves)
      .filter(([id, code]) => {
        const e = view.byEntryId.get(Number(id));
        return !!e && (e.staged === "move" || e.staged === "unsplit") && code !== e.serverCode;
      })
      .map(([id, code]) => ({ attendance_id: Number(id), verifix_code: code })),
    splits: Object.entries(splits)
      .filter(([id, s]) => view.byEntryId.get(Number(id))?.staged === "split" && s?.at)
      .map(([id, s]) => ({
        attendance_id: Number(id), verifix_code: s.code, second_code: s.second, split_at: s.at,
      })),
    unsplits: [...view.dropped],
  }), [managerId, selectedDate, moves, splits, view]);

  const pending = payload.moves.length + payload.splits.length + payload.unsplits.length;

  const saveMut = useMutation({
    mutationFn: () => api.put("/api/staff/cell-placement", payload).then((r) => r.data),
    onSuccess: (res) => {
      resetDraft();
      qc.invalidateQueries({ queryKey: [QK, managerId, selectedDate] });
      // The tab badge and the close button's warning both read `needs_cell` off
      // the day-state endpoint, and the whole point of a placement is to bring
      // that number down — leaving it stale would show the operator a refusal
      // they have already cleared.
      qc.invalidateQueries({ queryKey: ["daily-approval"] });
      qc.invalidateQueries({ queryKey: ["staff-attendance"] });
      toast.success(t("cellPlace.saved")
        .replace("{moved}", res?.moved ?? 0)
        .replace("{split}", res?.split ?? 0)
        .replace("{unsplit}", res?.unsplit ?? 0));
      if ((res?.unplaced ?? 0) > 0) toast.warning(t("cellPlace.stillUnplaced").replace("{n}", res.unplaced));
    },
    onError: (e) => {
      // 409 = the day closed under the operator. The draft is still theirs, but
      // the page must stop showing a world that no longer exists.
      if (e?.response?.status === 409) {
        refetch();
        toast.error(t("cellPlace.staleDay"));
        return;
      }
      toast.error(errText(e, t("cellPlace.saveFailed")));
    },
  });

  // ── render ─────────────────────────────────────────────────────────────────
  if (!enabled) {
    return (
      <EmptyState
        title={t("cellPlace.needManager")}
        message={t("cellPlace.needManagerMsg")}
        showUploadLink={false}
        icon={Users}
      />
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {Array.from({ length: 5 }).map((_, i) => <SkeletonBlock key={i} className="h-[52px] rounded-xl" />)}
        </div>
        <SkeletonBlock className="h-10 rounded-xl" />
        <SkeletonBlock className="h-40 rounded-xl" />
        <SkeletonBlock className="h-40 rounded-xl" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-xl px-4 py-6 text-center" style={{ background: "var(--bg-card)", border: "1px solid #ef4444" }}>
        <TriangleAlert size={22} className="mx-auto mb-2" style={{ color: "#ef4444" }} />
        <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{t("cellPlace.loadFailed")}</div>
        <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{errText(error, "")}</div>
        <Button className="mt-3" size="lg" variant="secondary" onClick={() => refetch()}>{t("cellPlace.retry")}</Button>
      </div>
    );
  }

  const { totals } = view;
  // Two different nothings. NO CELLS with people still on the roster is the
  // dead end: the «Yacheykasiz» card fills with the whole unit, the selection
  // bar invites a pick, and the list it points at is empty — while the day-close
  // gate refuses on exactly those people. Nothing on screen would explain it, so
  // it gets said out loud rather than folded into the generic empty state.
  const noCells     = totals.cells === 0;
  const nothingHere = noCells && totals.workers === 0;

  const cellOptions = view.buckets.map((b) => ({
    value: b.code,
    label: cellLabel(b.code, tl(b.leader)),
  }));

  const splitParts = splitFor ? (shareAt(splitFor.clock, splitForm.at) || null) : null;

  return (
    <div className="space-y-3">
      {/* One line naming the three acts. Nobody has seen this surface before and
          the split rule in particular is not guessable from the controls. */}
      <div className="text-[11px] leading-snug px-1" style={{ color: "var(--text-3)" }}>
        {t("cellPlace.intro")}
      </div>

      {/* Why the panel is read-only — never a silently dead control. */}
      {!editable && (
        <div
          className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{
            background: dayClosed ? "var(--bg-inner)" : "color-mix(in srgb, #eab308 12%, transparent)",
            border: `1px solid ${dayClosed ? "var(--border)" : "color-mix(in srgb, #eab308 35%, transparent)"}`,
          }}
        >
          {dayClosed
            ? <Lock size={15} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-3)" }} />
            : <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />}
          <div className="text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
            {dayClosed ? t("cellPlace.dayClosed") : t("cellPlace.noRight")}
          </div>
        </div>
      )}

      {/* KPI strip. «Yacheykasiz» is the only one that carries a verdict: it is
          amber while anybody is unplaced, because the day cannot close until it
          reads zero, and green the moment it does. */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
        <Stat label={t("cellPlace.statCells")} value={totals.cells} />
        <Stat label={t("cellPlace.statWorkers")} value={totals.workers} />
        <Stat label={t("cellPlace.statCounted")} value={fmtNum(totals.counted, 2)} />
        <Stat label={t("cellPlace.statHours")} value={fmtNum(totals.hours, 1)} />
        <Stat
          label={t("cellPlace.statUnplaced")}
          value={totals.unplaced}
          tone={totals.unplaced ? "#eab308" : "#22c55e"}
        />
      </div>

      {/* Toolbar: search, the draft chip, and the two staged-editing actions. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex-1 min-w-[150px]">
          <SearchInput value={search} onChange={setSearch} placeholder={t("cellPlace.search")} />
        </div>
        {pending > 0 && (
          <Chip tone="warn" icon={AlertTriangle}>{t("cellPlace.unsaved").replace("{n}", pending)}</Chip>
        )}
        {/* Toolbar controls stay on the 38px baseline (`Button` lg) so they line
            up with the SearchInput beside them — the one place on this panel
            where alignment outranks the 44px touch floor. */}
        {editable && pending > 0 && (
          <Button
            size="lg"
            variant="ghost"
            tint
            icon={<Undo2 size={14} />}
            onClick={() => setConfirm({
              tone: "danger",
              title: t("cellPlace.discardTitle"),
              message: t("cellPlace.discardMsg").replace("{n}", pending),
              confirmLabel: t("cellPlace.discard"),
              onConfirm: () => { resetDraft(); setConfirm(null); },
            })}
          >
            {t("cellPlace.discard")}
          </Button>
        )}
        {editable && (
          <Button
            size="lg"
            icon={<CheckCircle2 size={14} />}
            loading={saveMut.isPending}
            disabled={pending === 0}
            title={pending === 0 ? t("cellPlace.nothingToSave") : undefined}
            onClick={() => saveMut.mutate()}
          >
            {t("cellPlace.save").replace("{n}", pending)}
          </Button>
        )}
      </div>

      {/* The selection bar. It is the only place that says what the next tap
          will do, so it stays pinned above the lists rather than living inside
          the row that happens to be selected. */}
      {editable && selected && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: "var(--brand-bg)", border: "1px solid var(--brand)" }}
        >
          <CornerDownRight size={14} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>
              {tl(selected.name)}
            </div>
            <div className="text-[10px]" style={{ color: "var(--text-3)" }}>
              {movable ? t("cellPlace.pickCell") : t("cellPlace.splitLocked")}
            </div>
          </div>
          {selected.splittable && (
            <Button
              size="lg"
              variant="secondary"
              style={{ minHeight: 44 }}
              icon={<Scissors size={14} />}
              onClick={openSplit}
            >
              {t("cellPlace.split")}
            </Button>
          )}
          {(selected.splitKind === "secondary" || selected.secondaryId != null) && selected.staged !== "split" && (
            <Button
              size="lg"
              variant="secondary"
              style={{ minHeight: 44 }}
              icon={<Undo2 size={14} />}
              onClick={() => askUnsplit(selected)}
            >
              {t("cellPlace.unsplit")}
            </Button>
          )}
          <Button
            size="lg"
            variant="ghost"
            style={{ minHeight: 44 }}
            icon={<X size={14} />}
            title={t("cellPlace.clearSel")}
            aria-label={t("cellPlace.clearSel")}
            onClick={() => setSel(null)}
          />
        </div>
      )}

      {nothingHere && (
        <EmptyState
          title={t("cellPlace.noCells")}
          message={t("cellPlace.noCellsMsg")}
          showUploadLink={false}
          icon={Users}
        />
      )}

      {noCells && !nothingHere && (
        <div
          className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{
            background: "color-mix(in srgb, #eab308 12%, transparent)",
            border: "1px solid color-mix(in srgb, #eab308 35%, transparent)",
          }}
        >
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />
          <div className="text-[11px] leading-snug" style={{ color: "var(--text-2)" }}>
            <span className="font-semibold" style={{ color: "var(--text-1)" }}>{t("cellPlace.noCells")}</span>
            {" — "}{t("cellPlace.noCellsMsg")}
          </div>
        </div>
      )}

      {/* «Yacheykasiz» FIRST — it is the work that has to be done before the day
          can be closed, so it must never sit below a scroll of settled cells. */}
      {shown.loose.length > 0 && (
        <div
          className="rounded-xl overflow-hidden"
          style={{ background: "var(--bg-card)", border: "1px solid #eab308" }}
        >
          <div
            className="flex items-center gap-2 px-3 py-2.5"
            style={{ background: "color-mix(in srgb, #eab308 8%, var(--bg-inner))" }}
          >
            <UserMinus size={14} className="flex-shrink-0" style={{ color: "#eab308" }} />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--text-2)" }}>
                {t("cellPlace.unplacedTitle")}
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>
                {t("cellPlace.unplacedHint")}
              </div>
            </div>
            <Chip tone="warn">{shown.loose.length}</Chip>
          </div>
          {shown.loose.map((e) => (
            <WorkerLine
              key={e.key}
              entry={e}
              t={t}
              tl={tl}
              selected={sel === e.key}
              selectable={editable}
              onSelect={(x) => setSel((cur) => (cur === x.key ? null : x.key))}
              onUndo={editable && e.staged ? () => undoEntry(e) : null}
            />
          ))}
        </div>
      )}

      {/* Everyone is placed — the state the day close is waiting for. */}
      {!nothingHere && view.loose.length === 0 && (
        <div
          className="flex items-center gap-2 rounded-xl px-3.5 py-2.5"
          style={{ background: "color-mix(in srgb, #22c55e 10%, transparent)", border: "1px solid color-mix(in srgb, #22c55e 30%, transparent)" }}
        >
          <CheckCircle2 size={14} className="flex-shrink-0" style={{ color: "#22c55e" }} />
          <div className="text-[11px]" style={{ color: "var(--text-2)" }}>{t("cellPlace.allPlaced")}</div>
        </div>
      )}

      {/* The unit's cells. */}
      {shown.cells.map((b) => {
        const open = expanded.includes(b.code);
        const placeable = editable && movable && selected.code !== b.code;
        return (
          <div
            key={b.code}
            className="rounded-xl overflow-hidden"
            style={{
              background: "var(--bg-card)",
              border: `1px solid ${placeable ? "var(--brand)" : "var(--border)"}`,
              boxShadow: placeable ? "0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent)" : "none",
            }}
          >
            <div
              className="flex items-center gap-2 px-2 sm:px-3 py-2 flex-wrap"
              style={{ background: "var(--bg-inner)" }}
            >
              {/* Expansion is its own control, so the code beside it can stay a
                  CellLink — nested interactive elements are not a thing. */}
              <button
                type="button"
                onClick={() => toggleExpand(b.code)}
                className="flex-shrink-0 flex items-center justify-center rounded-lg"
                style={{ minHeight: 44, minWidth: 44, color: "var(--text-4)" }}
                title={open ? t("cellPlace.collapse") : t("cellPlace.expand")}
                aria-expanded={open}
              >
                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <CellLink
                    id={b.cellId}
                    className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded"
                    style={{ background: "var(--bg-card)", color: "var(--brand-text)" }}
                  >
                    {b.code}
                  </CellLink>
                  {b.leader && (
                    <span className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{tl(b.leader)}</span>
                  )}
                </div>
                <div className="text-[11px] mt-0.5 tabular-nums" style={{ color: "var(--text-4)" }}>
                  {fmtNum(b.counted, 2)}/{b.entries.length} {t("cellPlace.peopleShort")} · {fmtNum(b.hours, 1)} {t("cellPlace.hoursShort")}
                </div>
              </div>

              {placeable && (
                <Button
                  size="lg"
                  tint
                  className="flex-shrink-0"
                  style={{ minHeight: 44 }}
                  icon={<CornerDownRight size={14} />}
                  onClick={() => place(selected, b.code)}
                >
                  {t("cellPlace.placeHere")}
                </Button>
              )}
            </div>

            {open && (b.entries.length === 0 ? (
              <div
                className="px-3 py-4 text-center text-[11px]"
                style={{ color: "var(--text-4)", borderTop: "1px solid var(--border)" }}
              >
                {t("cellPlace.emptyCell")}
              </div>
            ) : b.entries.map((e) => (
              <WorkerLine
                key={e.key}
                entry={e}
                t={t}
                tl={tl}
                selected={sel === e.key}
                selectable={editable && !e.virtual}
                onSelect={(x) => setSel((cur) => (cur === x.key ? null : x.key))}
                // A staged split's virtual half carries its PRIMARY's id, so
                // undoing from either leg retires the same one arrangement.
                onUndo={editable && e.staged ? () => undoEntry(e) : null}
              />
            )))}
          </div>
        );
      })}

      {!nothingHere && q && shown.cells.length === 0 && shown.loose.length === 0 && (
        <div
          className="rounded-xl px-4 py-8 text-center text-xs"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}
        >
          {t("cellPlace.noMatch")}
        </div>
      )}

      {/* Split form. Two of the unit's own cells and the clock time between
          them — the shares follow from the hours and are never typed. */}
      {splitFor && (
        <Modal
          open
          onClose={() => setSplitFor(null)}
          title={t("cellPlace.splitTitle")}
          subtitle={tl(splitFor.name)}
          icon={<Scissors size={16} />}
          maxWidth="max-w-md"
          footer={(
            <>
              <Button variant="secondary" size="lg" style={{ minHeight: 44 }} onClick={() => setSplitFor(null)}>
                {t("common.cancel")}
              </Button>
              <Button size="lg" style={{ minHeight: 44 }} onClick={commitSplit}>
                {t("cellPlace.splitAdd")}
              </Button>
            </>
          )}
        >
          <FormField label={t("cellPlace.splitFirst")} required>
            <StyledSelect
              value={splitForm.code}
              onChange={(v) => { setSplitForm((f) => ({ ...f, code: v })); setSplitErr(null); }}
              options={cellOptions}
              placeholder={t("cellPlace.pickCellPh")}
              searchable
            />
          </FormField>

          <FormField label={t("cellPlace.splitSecond")} required>
            <StyledSelect
              value={splitForm.second}
              onChange={(v) => { setSplitForm((f) => ({ ...f, second: v })); setSplitErr(null); }}
              options={cellOptions.filter((o) => o.value !== splitForm.code)}
              placeholder={t("cellPlace.pickCellPh")}
              searchable
            />
          </FormField>

          <FormField
            label={t("cellPlace.splitAt")}
            required
            hint={splitFor.clock
              ? t("cellPlace.splitAtHint").replace("{clock}", splitFor.clock)
              : t("cellPlace.splitNoClock")}
            error={splitErr}
          >
            <TimeField
              value={splitForm.at}
              onChange={(v) => { setSplitForm((f) => ({ ...f, at: v })); setSplitErr(null); }}
              clearable
            />
          </FormField>

          {/* The preview, marked «≈» throughout: the server recomputes both
              shares on save and its answer is the one that is stored. */}
          {splitForm.code && splitForm.second && splitParts && (
            <div className="rounded-xl px-3 py-2 space-y-1" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <div className="text-[11px] tabular-nums" style={{ color: "var(--text-2)" }}>
                {t("cellPlace.splitShare")
                  .replace("{cell}", cellLabel(splitForm.code, tl(view.buckets.find((b) => b.code === splitForm.code)?.leader)))
                  .replace("{pct}", pct(splitParts[0]))}
              </div>
              <div className="text-[11px] tabular-nums" style={{ color: "var(--text-2)" }}>
                {t("cellPlace.splitShare")
                  .replace("{cell}", cellLabel(splitForm.second, tl(view.buckets.find((b) => b.code === splitForm.second)?.leader)))
                  .replace("{pct}", pct(splitParts[1]))}
              </div>
              <div className="text-[10px]" style={{ color: "var(--text-3)" }}>{t("cellPlace.approx")}</div>
            </div>
          )}
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          open
          tone={confirm.tone}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      )}

      {toast.node}
    </div>
  );
}
