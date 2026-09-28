/**
 * «Kelish ro'yxati» — the T11 staff list on the platform (`/kelish`).
 *
 * One list per CELL per shift-day: every worker the ORIGINAL Verifix upload
 * filed under the cell in the last 30 days, and beside each name whether they
 * are coming. A tap marks «Keladi» (green), the next «Kelmaydi» (red), the
 * third clears it again (empty → green → red → empty, the operator's call) —
 * an unmarked worker is simply not filled yet. «+» and «−»
 * at the table's foot change who is on the list, permanently, from today on.
 *
 * Only today and tomorrow (the unit's shift-day frame) are editable; earlier
 * days are read-only and later ones are not offered. The server decides every
 * one of those questions and ships the answers (`editable`, `can_edit`,
 * `when`), so the page derives nothing from the viewer's role or the browser's
 * clock. Rules and scope: backend `services/kelish.py` + `routers/kelish.py`.
 *
 * Page key `kelish` — admin-only until the operator opens it. Checklist task
 * #11 is untouched: nothing here scores anything.
 */
import { useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check, CheckCircle2, Clock, Info, Lock, Minus, Plus, Trash2, Undo2, UserCheck,
  UserMinus, UserPlus, Users, X,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import TableCard, { Th } from "../components/ui/DataTable";
import Button from "../components/ui/Button";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import DayStepper from "../components/ui/DayStepper";
import EmptyState from "../components/ui/EmptyState";
import FormField from "../components/ui/FormField";
import Modal from "../components/ui/Modal";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock } from "../components/ui/Skeleton";
import { useFactorySection } from "../components/ui/FactorySelect";
import { useToast } from "../components/ui/Toast";
import { useFactory, useFactoryParams } from "../context/FactoryContext";
import { useLang } from "../context/LangContext";
import { usePersistentState } from "../hooks/usePersistentState";
import { cellLabel } from "../utils/cellName";
import { shortPerson } from "../utils/personName";
import { transliterate, useTranslit } from "../utils/transliterate";
import api from "../utils/api";

const NONE = "none";          // the «cells with no brigadir» bucket
const WINDOW_DAYS = 30;       // services/kelish.WINDOW_DAYS
const GREEN = "#22c55e";
const RED = "#ef4444";

const fill = (s, params) =>
  Object.entries(params || {}).reduce((out, [k, v]) => out.split(`{${k}}`).join(String(v ?? "")), s);

// "2026-09-29" → "29.09"
const dm = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");

// The file spells names in capitals («RUSTAMOV XURSHIDBEK BAXTIYOR O'G'LI»);
// read in sentence-case they are far quicker to scan. Only the first letter of
// each word is raised, so «O'G'LI» reads «O'g'li».
const titleCase = (s) =>
  String(s || "").toLocaleLowerCase().replace(/(^|[\s-])(\S)/gu, (_, a, b) => a + b.toLocaleUpperCase());

// Script- and apostrophe-blind folding for matching a typed name against the
// removed list — a leader may type Cyrillic on a Latin list.
const fold = (s) =>
  transliterate(String(s || ""), "uz").toLowerCase().replace(/[ʻʼ'’‘`]/g, "").replace(/\s+/g, " ").trim();

function whenText(w, t) {
  if (!w) return "";
  const f = (k) => fill(t(k), { start: w.start, end: w.end });
  switch (w.kind) {
    case "past": return t("kelish.whenPast");
    case "today": return t("kelish.whenToday");
    case "tomorrow": return t("kelish.whenTomorrow");
    case "running": return f("kelish.whenRunning");
    case "ended": return f("kelish.whenEnded");
    case "starts_today": return f("kelish.whenStartsToday");
    case "starts_tomorrow": return f("kelish.whenStartsTomorrow");
    default: return "";
  }
}

function patchRow(old, key, patch) {
  if (!old) return old;
  const rows = old.rows.map((r) => (r.key === key ? { ...r, ...patch } : r));
  const yes = rows.filter((r) => r.mark === "yes").length;
  const no = rows.filter((r) => r.mark === "no").length;
  return { ...old, rows, counts: { yes, no, none: rows.length - yes - no, total: rows.length } };
}

// NOTHING above the table may change size because of a tap: a row that moves
// under the thumb gets the next tap meant for its neighbour. So each chip has a
// FIXED width on a phone — the number alone (the words stay for screen readers,
// and show from lg up, where the header has room to spare) — and the third
// chip is as wide as its «complete» form, so marking the last worker cannot
// re-wrap the header either.
const CHIP_W = "min-w-[3.25rem]";
const CHIP_W3 = "min-w-[4.75rem]";

function Chip({ color, icon, n, word, wide = false }) {
  const style = color
    ? { background: `${color}1f`, color, border: `1px solid ${color}59` }
    : { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border-md)" };
  return (
    <span
      title={word}
      className={`inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg text-xs font-semibold tabular-nums whitespace-nowrap ${wide ? CHIP_W3 : CHIP_W}`}
      style={style}
    >
      {icon}
      <span aria-hidden="true" className="lg:hidden">{n}</span>
      <span className="sr-only lg:not-sr-only">{word}</span>
    </span>
  );
}

function Counts({ c, t }) {
  if (!c) {
    return (
      <div className="flex items-center gap-1.5">
        <SkeletonBlock className={`h-7 rounded-lg ${CHIP_W}`} />
        <SkeletonBlock className={`h-7 rounded-lg ${CHIP_W}`} />
        <SkeletonBlock className={`h-7 rounded-lg ${CHIP_W3}`} />
      </div>
    );
  }
  const done = c.total > 0 && c.none === 0;
  return (
    <div className="flex items-center gap-1.5">
      <Chip color={GREEN} icon={<Check size={12} strokeWidth={3} />} n={c.yes} word={fill(t("kelish.countYes"), { n: c.yes })} />
      <Chip color={RED} icon={<X size={12} strokeWidth={3} />} n={c.no} word={fill(t("kelish.countNo"), { n: c.no })} />
      {done
        ? <Chip wide color={GREEN} icon={<CheckCircle2 size={12} />} n={t("kelish.complete")} word={t("kelish.complete")} />
        : <Chip wide icon={<Minus size={12} strokeWidth={3} />} n={c.none} word={fill(t("kelish.countNone"), { n: c.none })} />}
    </div>
  );
}

// THE mark. Colour + icon + word, so it reads without colour. Read-only marks
// keep full strength (a past day is a record, not a disabled control).
function MarkButton({ mark, editable, onClick, name, t }) {
  const variant = mark === "yes" ? "success" : mark === "no" ? "danger" : "ghost";
  const Icon = mark === "yes" ? Check : mark === "no" ? X : null;
  const word = mark === "yes" ? t("kelish.yes") : mark === "no" ? t("kelish.no") : t("kelish.none");
  return (
    <Button
      variant={variant} tint size="lg"
      disabled={!editable}
      onClick={onClick}
      icon={Icon ? <Icon size={15} strokeWidth={2.75} /> : null}
      aria-label={`${name}: ${word}`}
      className="w-full h-10 whitespace-nowrap"
      style={{
        ...(mark ? {} : { borderStyle: "dashed" }),
        ...(editable ? {} : { opacity: 1, cursor: "default" }),
      }}
    >
      {mark ? word : "—"}
    </Button>
  );
}

export default function Kelish() {
  const { t } = useLang();
  const { tl, tx } = useTranslit();
  const qc = useQueryClient();
  const toast = useToast();
  const { ready } = useFactory();
  const factorySection = useFactorySection();

  const [date, setDate] = useState(null);                 // null = the cell's tomorrow
  const [unitPick, setUnitPick] = usePersistentState("kelish.unit", null);
  const [shiftPick, setShiftPick] = usePersistentState("kelish.shift", null);
  const [cellPick, setCellPick] = usePersistentState("kelish.cell", null);

  const [selecting, setSelecting] = useState(false);
  const [sel, setSel] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeErr, setRemoveErr] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addErr, setAddErr] = useState("");
  const [adding, setAdding] = useState(false);

  // One request chain per worker, so two quick taps land in order; `ver` keeps
  // an older answer from repainting a newer tap.
  const queues = useRef(new Map());
  const ver = useRef(new Map());
  const pending = useRef(0);

  const nameOf = (raw) => titleCase(tl(raw));

  const errText = (e) => {
    const d = e?.response?.data;
    const raw = d?.detail_raw ?? d?.detail;
    const code = raw && typeof raw === "object" ? raw.code : null;
    switch (code) {
      case "exists": return fill(t("kelish.errExists"), { name: nameOf(raw.name) });
      case "name_required": return t("kelish.errName");
      case "day_locked": return t("kelish.errDayLocked");
      case "read_only": return t("kelish.errReadOnly");
      case "not_on_list": return t("kelish.errNotOnList");
      default: return (typeof d?.detail === "string" && d.detail) || t("kelish.errSave");
    }
  };

  // ── which cells ───────────────────────────────────────────────────────────
  const baseParams = useMemo(() => (date ? { date } : {}), [date]);
  const cellsParams = useFactoryParams(baseParams);
  const cellsQ = useQuery({
    queryKey: ["kelish-cells", cellsParams],
    queryFn: () => api.get("/api/kelish/cells", { params: cellsParams }).then((r) => r.data),
    enabled: ready,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const cells = cellsQ.data?.cells || [];
  const units = cellsQ.data?.units || [];
  const scopeKind = cellsQ.data?.scope?.kind;
  const scopeAll = scopeKind === "all";
  const hasOrphans = cells.some((c) => !c.manager_id);

  const unitList = useMemo(
    () => units.filter((u) => !shiftPick || u.shift === shiftPick),
    [units, shiftPick],
  );
  const unitIds = [...unitList.map((u) => u.id), ...(hasOrphans && !shiftPick ? [NONE] : [])];
  // A leader's own cells are never narrowed by unit — one of them may stand in
  // another brigadir's unit, and hiding it would hide half their work.
  const narrowByUnit = scopeKind !== "leader" && units.length + (hasOrphans ? 1 : 0) > 1;
  const activeUnit = narrowByUnit ? (unitIds.includes(unitPick) ? unitPick : unitIds[0] ?? null) : null;
  const cellsShown = narrowByUnit ? cells.filter((c) => (c.manager_id ?? NONE) === activeUnit) : cells;
  const cell = cellsShown.find((c) => c.id === cellPick) || cellsShown[0] || null;
  const shownDate = cell ? (date && date <= cell.tomorrow ? date : cell.tomorrow) : null;

  // ── the list ──────────────────────────────────────────────────────────────
  const listKey = ["kelish-list", cell?.id ?? null, shownDate];
  const listQ = useQuery({
    queryKey: listKey,
    queryFn: () => api.get("/api/kelish/list", { params: { cell_id: cell.id, date: shownDate } }).then((r) => r.data),
    enabled: !!cell && !!shownDate,
    // Keep the table while only the DAY changes; never show one cell's names
    // under another cell's title.
    placeholderData: (prev, prevQuery) => (prevQuery?.queryKey?.[1] === cell?.id ? prev : undefined),
    refetchInterval: () => (pending.current > 0 ? false : 60_000),
    refetchOnWindowFocus: () => pending.current === 0,
  });
  const data = listQ.data && listQ.data.cell?.id === cell?.id ? listQ.data : null;
  const editable = !!data?.editable;

  const view = useMemo(() => {
    if (!data) return [];
    const rows = data.rows.map((r) => {
      const full = nameOf(r.name);
      const parts = full.split(" ");
      return { ...r, full, short: parts.length > 2 ? parts.slice(0, 2).join(" ") : full };
    });
    // Surname + first name is how a leader knows their people; the patronymic
    // comes back only where two workers of one list would otherwise read alike.
    const seen = {};
    rows.forEach((r) => { seen[r.short] = (seen[r.short] || 0) + 1; });
    return rows.map((r) => ({ ...r, display: seen[r.short] > 1 ? r.full : r.short }));
  }, [data, tl]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["kelish-list"] });
    qc.invalidateQueries({ queryKey: ["kelish-cells"] });
  };
  const exitSelect = () => { setSelecting(false); setSel(new Set()); };

  const pickCell = (id) => {
    setCellPick(id);
    exitSelect();
    qc.invalidateQueries({ queryKey: ["kelish-cells"] });
  };
  const pickDay = (iso) => { setDate(iso); exitSelect(); };

  // ── a tap ─────────────────────────────────────────────────────────────────
  const tap = (row) => {
    if (!editable || selecting || !data) return;
    // empty → yes → no → empty; null CLEARS the mark server-side.
    const next = row.mark === "yes" ? "no" : row.mark === "no" ? null : "yes";
    const key = listKey;
    const v = (ver.current.get(row.key) || 0) + 1;
    ver.current.set(row.key, v);
    // Only a CLEAR drops «belgiladi: …» at once; a colour change keeps it until
    // the server says who set the mark, so the line does not blink per tap.
    qc.setQueryData(key, (old) => patchRow(old, row.key,
      next ? { mark: next } : { mark: null, by: null, by_other: false }));
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.();
    pending.current += 1;
    const body = { cell_id: data.cell.id, date: data.date, key: row.key, status: next };
    const prev = queues.current.get(row.key) || Promise.resolve();
    const run = prev.catch(() => {})
      .then(() => api.put("/api/kelish/mark", body))
      .then((r) => {
        if (ver.current.get(row.key) === v) {
          qc.setQueryData(key, (old) => patchRow(old, row.key, { mark: r.data.mark, by: r.data.by, by_other: r.data.by_other }));
        }
      })
      .catch((e) => {
        toast.error(`${t("kelish.errSave")}: ${errText(e)}`);
        qc.invalidateQueries({ queryKey: key });
      })
      .finally(() => { pending.current -= 1; });
    queues.current.set(row.key, run);
  };

  // ── «+» ───────────────────────────────────────────────────────────────────
  const openAdd = () => { setAddName(""); setAddErr(""); setAddOpen(true); };
  const submitAdd = async (name) => {
    const v = String(name || "").replace(/\s+/g, " ").trim();
    if (v.length < 3) { setAddErr(t("kelish.errName")); return; }
    setAdding(true);
    try {
      const r = await api.post("/api/kelish/workers", { cell_id: data.cell.id, name: v });
      toast.success(fill(t(r.data.restored ? "kelish.restoredToast" : "kelish.addedToast"), { name: nameOf(r.data.name) }));
      setAddOpen(false);
      setAddName("");
      refreshAll();
    } catch (e) {
      setAddErr(errText(e));
    } finally {
      setAdding(false);
    }
  };
  const suggestions = useMemo(() => {
    const q = fold(addName);
    return (data?.removed || []).filter((g) => !q || fold(g.name).includes(q));
  }, [data, addName]);

  // ── «−» ───────────────────────────────────────────────────────────────────
  const toggleSel = (key) => setSel((s) => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const allSel = view.length > 0 && view.every((r) => sel.has(r.key));
  const someSel = view.some((r) => sel.has(r.key));
  const toggleAll = () => setSel(allSel ? new Set() : new Set(view.map((r) => r.key)));
  const selNames = useMemo(() => {
    const picked = view.filter((r) => sel.has(r.key)).map((r) => r.display);
    const head = picked.slice(0, 5).join(", ");
    return picked.length > 5 ? `${head} ${fill(t("kelish.andMore"), { n: picked.length - 5 })}` : head;
  }, [view, sel, t]);
  const doRemove = async () => {
    setRemoving(true);
    setRemoveErr("");
    try {
      const r = await api.post("/api/kelish/workers/remove", { cell_id: data.cell.id, keys: [...sel] });
      toast.success(fill(t("kelish.removedToast"), { n: r.data.removed }));
      setConfirmOpen(false);
      exitSelect();
      refreshAll();
    } catch (e) {
      setRemoveErr(errText(e));
    } finally {
      setRemoving(false);
    }
  };

  // ── the filter bar (only where there is something to choose) ─────────────
  const unitName = (id) => (id === NONE ? t("kelish.noUnit") : tl(units.find((u) => u.id === id)?.name || ""));
  const sections = [];
  if (scopeAll && factorySection) sections.push(factorySection);
  if (scopeAll) {
    sections.push({
      key: "shift", icon: Clock, label: t("kelish.shift"),
      active: shiftPick != null,
      display: shiftPick ? fill(t("kelish.shiftN"), { n: shiftPick }) : "",
      onClear: () => setShiftPick(null),
      render: ({ close } = {}) => (
        <PickFilter
          opts={[
            { value: "all", label: t("kelish.allShifts") },
            { value: 1, label: fill(t("kelish.shiftN"), { n: 1 }) },
            { value: 2, label: fill(t("kelish.shiftN"), { n: 2 }) },
          ]}
          value={shiftPick ?? "all"}
          onChange={(v) => { setShiftPick(v === "all" ? null : v); exitSelect(); }}
          close={close}
        />
      ),
    });
  }
  if (narrowByUnit) {
    const opts = unitIds.map((id) => ({ value: id, label: unitName(id) }));
    sections.push({
      key: "unit", icon: Users, label: t("kelish.unit"), pinned: true,
      active: activeUnit != null,
      display: activeUnit != null ? unitName(activeUnit) : "",
      render: ({ close } = {}) => (
        <PickFilter
          opts={opts} value={activeUnit} searchable
          note={shiftPick ? fill(t("kelish.unitNarrowed"), { v: fill(t("kelish.shiftN"), { n: shiftPick }), n: opts.length }) : null}
          empty={shiftPick ? (
            <Button variant="secondary" size="sm" onClick={() => setShiftPick(null)}>{t("kelish.allShifts")}</Button>
          ) : null}
          onChange={(v) => { setUnitPick(v); setCellPick(null); exitSelect(); }}
          close={close}
        />
      ),
    });
  }

  const cellOptions = cellsShown.map((c) => {
    const p = c.id === cell?.id && data ? data.counts : c.progress;
    return {
      value: c.id,
      title: c.leader ? tl(c.leader) : undefined,
      label: p && p.total ? `${c.code} · ${p.yes + p.no}/${p.total}` : c.code,
    };
  });

  // ── header of the card ────────────────────────────────────────────────────
  const leaderShort = (name) => {
    const parts = titleCase(tl(name || "")).split(" ").filter(Boolean);
    return parts.slice(0, 2).join(" ");
  };
  const cellTitle = cell ? cellLabel(cell.code, cell.leader ? leaderShort(cell.leader) : "") : "";
  const locked = data && (data.when?.kind === "past" || !data.can_edit);
  // A skeleton of the same line while the list loads, so the header does not
  // grow a line (and push the table down) the moment the data arrives.
  const subtitle = data ? (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {locked && <Lock size={11} aria-hidden="true" />}
      {[whenText(data.when, t),
        data.cell.shift ? fill(t("kelish.shiftN"), { n: data.cell.shift }) : null,
        !data.can_edit ? t("kelish.readOnly") : null].filter(Boolean).join(" · ")}
    </span>
  ) : (
    <SkeletonBlock className="inline-block align-middle h-3 w-44" />
  );

  const marked = data ? data.counts.yes + data.counts.no : 0;
  const colCount = selecting ? 3 : 2;

  const subLine = (r) => {
    const bits = [];
    if (r.job) bits.push({ text: tx(r.job) });
    if (r.source === "manual") bits.push({ text: t("kelish.manual") });
    if (r.source === "kept") bits.push({ text: t("kelish.kept") });
    if (r.never) bits.push({ text: fill(t("kelish.never"), { n: WINDOW_DAYS }), warn: true });
    else if (r.quiet != null && r.quiet >= (data?.quiet_days ?? 7)) bits.push({ text: fill(t("kelish.quiet"), { n: r.quiet }), warn: true });
    if (r.by_other && r.by) bits.push({ text: fill(t("kelish.by"), { name: shortPerson(tl(r.by)) }) });
    return bits;
  };

  const footer = !data ? null : selecting ? (
    <>
      <Button
        variant="danger" tint size="lg" icon={<Trash2 size={15} />}
        disabled={!sel.size} onClick={() => { setRemoveErr(""); setConfirmOpen(true); }}
      >
        {fill(t("kelish.removeN"), { n: sel.size })}
      </Button>
      <span className="hidden sm:inline text-xs" style={{ color: "var(--text-3)" }}>{t("kelish.selectHint")}</span>
      <Button variant="secondary" size="lg" className="ml-auto" onClick={exitSelect}>{t("common.cancel")}</Button>
    </>
  ) : (
    <>
      {/* The how-to lives UNDER the table and is there for the whole day: a
          hint above it that came and went with the marks moved every row. */}
      <div className="min-w-0 flex-1 space-y-1 text-[11px] leading-snug" style={{ color: "var(--text-3)" }}>
        {editable && (
          <div className="flex items-start gap-1.5">
            <Info size={13} className="flex-shrink-0 mt-px" aria-hidden="true" />
            <span>{t("kelish.hint")}</span>
          </div>
        )}
        <div title={t("kelish.sourceHint")}>
          {fill(t("kelish.source"), { from: dm(data.source.from), to: dm(data.source.last_upload || data.source.to) })}
        </div>
        {data.when?.kind === "past" && marked === 0 && data.counts.total > 0 && <div>{t("kelish.pastNoMarks")}</div>}
      </div>
      {editable && (
        <div className="ml-auto flex items-center gap-2 self-center">
          <Button variant="secondary" size="lg" icon={<Plus size={17} />} aria-label={t("kelish.add")} title={t("kelish.add")} onClick={openAdd} />
          <Button
            variant="secondary" size="lg" icon={<Minus size={17} />}
            aria-label={t("kelish.remove")} title={t("kelish.remove")}
            disabled={!view.length} onClick={() => { setSel(new Set()); setSelecting(true); }}
          />
        </div>
      )}
    </>
  );

  // ── render ────────────────────────────────────────────────────────────────
  let body;
  if (!cellsQ.data && (cellsQ.isLoading || !ready)) {
    body = (
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-10 w-full" />)}
      </div>
    );
  } else if (cellsQ.isError && !cellsQ.data) {
    body = (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState
          title={t("kelish.errLoad")} message={errText(cellsQ.error)} showUploadLink={false}
          action={<Button variant="secondary" onClick={() => cellsQ.refetch()}>{t("kelish.retry")}</Button>}
        />
      </div>
    );
  } else if (!cell) {
    body = (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState
          icon={UserCheck} showUploadLink={false} height="h-48"
          title={t("kelish.noCellsTitle")}
          message={scopeKind === "leader" ? t("kelish.noCellsLeader") : t("kelish.noCells")}
        />
      </div>
    );
  } else if (listQ.isError && !data) {
    body = (
      <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <EmptyState
          title={t("kelish.errLoad")} message={errText(listQ.error)} showUploadLink={false}
          action={<Button variant="secondary" onClick={() => listQ.refetch()}>{t("kelish.retry")}</Button>}
        />
      </div>
    );
  } else {
    body = (
      <TableCard
        icon={UserCheck} headSize="lg"
        title={cellTitle} subtitle={subtitle}
        right={<Counts c={data?.counts} t={t} />}
        fixed footer={footer}
      >
        <thead>
          <tr>
            {selecting && (
              <Th
                cls="w-11"
                label={(
                  <input
                    type="checkbox" aria-label={t("kelish.selectAll")}
                    checked={allSel}
                    ref={(el) => { if (el) el.indeterminate = someSel && !allSel; }}
                    onChange={toggleAll}
                    className="w-4 h-4 cursor-pointer accent-[var(--brand)]"
                  />
                )}
              />
            )}
            <Th label={t("kelish.colWorker")} />
            <Th label={t("kelish.colStatus")} align="center" cls="w-[132px] sm:w-[156px]" />
          </tr>
        </thead>
        <tbody>
          {!data && Array.from({ length: 6 }).map((_, i) => (
            <tr key={`sk${i}`}>
              {selecting && <td className="px-3 py-2" />}
              <td className="px-3 py-2">
                <SkeletonBlock className={`h-3.5 ${["w-2/3", "w-1/2", "w-3/5"][i % 3]}`} />
                <SkeletonBlock className="h-2.5 w-1/3 mt-2" />
              </td>
              <td className="px-3 py-2"><SkeletonBlock className="h-10 w-full" /></td>
            </tr>
          ))}
          {data && view.length === 0 && (
            <tr>
              <td colSpan={colCount} className="px-4 py-10 text-center text-sm whitespace-normal" style={{ color: "var(--text-3)" }}>
                {editable ? t("kelish.emptyList") : t("kelish.emptyListRO")}
              </td>
            </tr>
          )}
          {data && view.map((r) => {
            const bits = subLine(r);
            const picked = sel.has(r.key);
            return (
              <tr
                key={r.key}
                onClick={selecting ? () => toggleSel(r.key) : undefined}
                style={selecting ? { cursor: "pointer", background: picked ? "var(--brand-bg)" : undefined } : undefined}
              >
                {selecting && (
                  <td className="px-3 py-2 align-middle">
                    <input
                      type="checkbox" checked={picked} aria-label={r.display}
                      onChange={() => toggleSel(r.key)} onClick={(e) => e.stopPropagation()}
                      className="w-4 h-4 cursor-pointer accent-[var(--brand)]"
                    />
                  </td>
                )}
                <td className="px-3 py-2 align-middle">
                  <div className="text-sm font-medium truncate" title={r.full}>{r.display}</div>
                  {/* Always one line, even empty: «belgiladi: …» arriving with
                      a tap must not make the row taller and push the rows
                      under it. */}
                  <div className="text-[11px] leading-4 mt-0.5 truncate" style={{ color: "var(--text-3)" }}>
                    {bits.length > 0 ? bits.map((b, i) => (
                      <span key={i} style={b.warn ? { color: "var(--status-warn)" } : undefined}>
                        {i > 0 && " · "}{b.text}
                      </span>
                    )) : " "}
                  </div>
                </td>
                <td className="px-3 py-2 align-middle">
                  <MarkButton mark={r.mark} editable={editable && !selecting} onClick={() => tap(r)} name={r.display} t={t} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableCard>
    );
  }

  return (
    <Layout title={t("nav.kelish")}>
      <div className="flex flex-col gap-3">
        {(cell || sections.length > 0) && (
          <div className="flex flex-wrap items-center gap-2">
            {cell && shownDate && <DayStepper value={shownDate} onChange={pickDay} max={cell.tomorrow} />}
            {sections.length > 0 && <FilterPanel sections={sections} />}
          </div>
        )}

        {cellsShown.length > 1 && cell && (
          <SegmentedToggle value={cell.id} onChange={pickCell} options={cellOptions} ariaLabel={t("kelish.cell")} />
        )}

        {body}
      </div>

      <Modal
        open={addOpen}
        onClose={() => { if (!adding) setAddOpen(false); }}
        title={t("kelish.addTitle")}
        subtitle={cellTitle}
        icon={<UserPlus size={18} />}
        maxWidth="max-w-md"
        dismissable={!adding}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={adding}>{t("common.cancel")}</Button>
            <Button variant="primary" onClick={() => submitAdd(addName)} loading={adding}>{t("kelish.addSubmit")}</Button>
          </>
        )}
      >
        <FormField label={t("kelish.addLabel")} required hint={t("kelish.addHint")} error={addErr}>
          <input
            autoFocus value={addName} maxLength={120} autoComplete="off"
            placeholder={t("kelish.addPlaceholder")}
            onChange={(e) => { setAddName(e.target.value); setAddErr(""); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitAdd(addName); } }}
            className="w-full px-3 py-2 rounded-xl text-base sm:text-sm outline-none"
            style={{ background: "var(--bg-inner)", border: `1px solid ${addErr ? RED : "var(--border-md)"}`, color: "var(--text-1)" }}
          />
        </FormField>
        {suggestions.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>
              {t("kelish.removedList")}
            </div>
            <div className="rounded-xl overflow-hidden max-h-60 overflow-y-auto" style={{ border: "1px solid var(--border)" }}>
              {suggestions.map((g, i) => (
                <div key={g.key} className="flex items-center gap-2 px-3 py-2" style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate" style={{ color: "var(--text-1)" }}>{nameOf(g.name)}</div>
                    {g.job && <div className="text-[11px] truncate" style={{ color: "var(--text-3)" }}>{tx(g.job)}</div>}
                  </div>
                  <Button variant="secondary" size="md" icon={<Undo2 size={13} />} disabled={adding} onClick={() => submitAdd(g.name)}>
                    {t("kelish.restore")}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmOpen}
        tone="danger"
        icon={<UserMinus size={18} />}
        title={fill(t("kelish.removeTitle"), { n: sel.size })}
        message={(
          <>
            <span className="block font-medium" style={{ color: "var(--text-2)" }}>{selNames}</span>
            <span className="block mt-1.5">{t("kelish.removeBody")}</span>
          </>
        )}
        confirmLabel={t("kelish.removeConfirm")}
        onCancel={() => { if (!removing) setConfirmOpen(false); }}
        onConfirm={doRemove}
        loading={removing}
        error={removeErr}
      />

      {toast.node}
    </Layout>
  );
}
