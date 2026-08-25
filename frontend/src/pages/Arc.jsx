import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  RefreshCw, CalendarClock, Download, Loader2, ClipboardList, Building2, Users, Tag,
  CircleDot, Layers, Siren, AlertTriangle, FileText, ExternalLink, Bot, Paperclip,
  Phone, Timer, CheckCircle2, ShieldCheck, Hourglass, Hash, UserRound, PlayCircle,
  PlugZap, Zap, MessageSquare, History, Smartphone, Boxes, Link2Off,
  Clock, Wrench, UserCog,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import DateRangePicker from "../components/ui/DateRangePicker";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import Pagination from "../components/ui/Pagination";
import SearchInput from "../components/ui/SearchInput";
import ColumnsPicker from "../components/ui/ColumnsPicker";
import KPICard from "../components/ui/KPICard";
import EmptyState from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import TableCard, { Th } from "../components/ui/DataTable";
import CellLink from "../components/ui/CellLink";
// The registry's workshop name in the viewer's language, Russian-first after
// that. `cellName`'s empty prefix IS the short {uz, uz_cyrl, ru, en} shape
// `cell_lookup` ships — the platform's one home for this fallback, so the
// register, the filter and the modal cannot disagree about a cell's name.
import { cellName } from "../utils/cellName";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonCard } from "../components/ui/Skeleton";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import { usePersistentState } from "../hooks/usePersistentState";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { inTelegram } from "../utils/session";
import { toneFor, statusName, hexA, STATUS_CODES, C_DONE, C_DOING, C_OVERDUE, C_GREY } from "../utils/arcStatus";

// ── constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;
// The filter value standing for «this division names no cell» — the twin of
// services/arc_cells.NO_CELL. Every real code is four digits, so a word can
// never collide with one.
const NO_CELL = "none";
const COL_PREF_KEY = "arc.list.cols";
const TZ = "Asia/Tashkent";

// Register column catalog — the ONE source of order, labels, header icons and
// sort keys for the ARC table. Cells render through a per-key switch
// (`listCell` below), so the ColumnsPicker's hide/reorder comes for free.
// `sortKey` is the backend `sort` field; a column without one is not sortable.
const COLS = [
  { key: "num",         labelKey: "arc.colNum",         icon: Hash,          sortKey: "request_num" },
  { key: "created",     labelKey: "arc.colCreated",     icon: CalendarClock, sortKey: "created_at" },
  { key: "division",    labelKey: "arc.colDivision",    icon: Building2,     sortKey: "division_name" },
  // The cell the division NAMES — see services/arc_cells.py. It sits beside
  // the division it is read out of, because that adjacency IS the rule.
  { key: "cell",        labelKey: "arc.colCell",        icon: Boxes,         sortKey: "cell_code" },
  { key: "category",    labelKey: "arc.colCategory",    icon: Tag,           sortKey: "category_name" },
  { key: "description", labelKey: "arc.colDescription", icon: FileText },
  { key: "author",      labelKey: "arc.colAuthor",      icon: UserRound,     sortKey: "user_name" },
  { key: "brigada",     labelKey: "arc.colBrigada",     icon: Users,         sortKey: "brigada_name" },
  { key: "status",      labelKey: "arc.colStatus",      icon: CircleDot,     sortKey: "status" },
  { key: "due",         labelKey: "arc.colDue",         icon: Timer,         sortKey: "due" },
  { key: "started",     labelKey: "arc.colStarted",     icon: PlayCircle,    sortKey: "started_at" },
  { key: "closed",      labelKey: "arc.colClosed",      icon: CheckCircle2,  sortKey: "closed_at" },
  { key: "hours",       labelKey: "arc.colHours",       icon: Hourglass,     sortKey: "hours_to_close", align: "right" },
  { key: "source",      labelKey: "arc.colSource",      icon: Bot,           align: "center" },
  { key: "files",       labelKey: "arc.colFiles",       icon: Paperclip,     align: "center" },
];
// The ticket number and its status are the row's identity — never hideable.
const LOCKED_COLS = new Set(["num", "status"]);

// «Yacheykalar bo'yicha» is the SAME register — one row per ticket, the same
// filters, the same page — read through a different question: whose cell is
// this ticket on, and where does it stand. So it is a fixed, curated column
// set rather than a second table: the register's IT-side columns (division,
// category, author, brigade) give way to this platform's org chart, and
// everything they carried is one press away in the row's modal.
//
// Deliberately NOT offered to the ColumnsPicker. A curated answer that the
// reader can dismantle column by column is not a curated answer, and the two
// views would stop being two questions about one set of tickets.
//
// `sup` and `leader` carry no `sortKey`: both are resolved from the cells map
// the payload already ships, and no SQL expression orders by them — a header
// that looks sortable and does nothing is worse than one that does not.
const CELL_COLS = [
  { key: "num",         labelKey: "arc.colNum",         icon: Hash,          sortKey: "request_num" },
  { key: "sup",         labelKey: "arc.colSup",         icon: Wrench },
  { key: "leader",      labelKey: "arc.colLeader",      icon: UserCog },
  { key: "cell",        labelKey: "arc.colCell",        icon: Boxes,         sortKey: "cell_code" },
  { key: "description", labelKey: "arc.colDescription", icon: FileText },
  { key: "status",      labelKey: "arc.colStatus",      icon: CircleDot,     sortKey: "status" },
  { key: "due",         labelKey: "arc.colDue",         icon: Timer,         sortKey: "due" },
  { key: "started",     labelKey: "arc.colStarted",     icon: PlayCircle,    sortKey: "started_at" },
  // Closed AND how long it took, in one cell: the two facts are one sentence
  // («closed on the 14th, after 3.9 h»), and on a register read for lateness
  // the duration is what the closing stamp is FOR. It sorts by the stamp.
  { key: "closed_h",    labelKey: "arc.colClosed",      icon: CheckCircle2,  sortKey: "closed_at" },
  { key: "source",      labelKey: "arc.colSource",      icon: Bot,           align: "center" },
];

// Screen column → the export's own columns. The table merges «closed» and how
// long it took into one cell because they read as one sentence; a SPREADSHEET
// must not, because a merged text cell can be neither sorted nor number-
// formatted, which is most of what a spreadsheet is for. So the file carries
// the two facts as the two columns the backend already knows how to write.
const EXPORT_SPLIT = { closed_h: ["closed", "hours"] };
const labelKeyOf = (key) =>
  (CELL_COLS.find((c) => c.key === key) || COLS.find((c) => c.key === key))?.labelKey;

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|heic)(\?|$)/i;

// ── dates ────────────────────────────────────────────────────────────────────
// ARC timestamps arrive with their own +05:00 offset; every reader here is in
// Tashkent, so they are rendered in that zone explicitly rather than in
// whatever zone the browser happens to sit in (a laptop abroad must show the
// same clock the division saw).
const localISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

const tsFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
});
const dFmt = new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "2-digit", month: "2-digit", year: "2-digit" });
const parts = (fmt, d) => Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
// dd.mm.yyyy HH:MM (Tashkent) — the full stamp for detail views and tooltips.
const fmtDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  const p = parts(tsFmt, d);
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
};
// dd.mm.yy HH:MM — the compact table stamp.
const fmtShort = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  const p = parts(dFmt, d);
  const q = parts(tsFmt, d);
  return `${p.day}.${p.month}.${p.year} ${q.hour}:${q.minute}`;
};
const fmtHours = (h) => (h == null || Number.isNaN(Number(h)) ? "—" : Number(h).toFixed(1));

// Substitute {name} placeholders in a translated template.
const tpl = (s, vars) => String(s || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m));

const truncate = (s, n = 60) => {
  const v = String(s || "");
  return v.length > n ? `${v.slice(0, n - 1)}…` : v;
};

// A comment object of an undocumented shape → its text, or nothing. The API
// contract does not name these fields, so the known spellings are tried and a
// row that yields none renders as a bare stamp instead of as «[object Object]».
const commentText = (c) => {
  if (typeof c === "string") return c;
  if (!c || typeof c !== "object") return "";
  for (const k of ["text", "comment", "message", "body", "content"]) {
    if (typeof c[k] === "string" && c[k].trim()) return c[k].trim();
  }
  return "";
};
const commentWho = (c) => {
  if (!c || typeof c !== "object") return "";
  const u = c.user || c.author || {};
  return (typeof u === "object" ? (u.full_name || u.name || u.username) : u) || c.user_name || "";
};
const commentWhen = (c) => (c && typeof c === "object" ? (c.created_at || c.date || c.time) : "") || "";

// ── small presentational bits ────────────────────────────────────────────────
// Status chip: traffic-light tone by code (utils/arcStatus.js); a status that
// is waiting on somebody is dashed, so it never reads as settled.
function StatusChip({ status, label }) {
  const tone = toneFor(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{
        background: hexA(tone.color, 0.14),
        color: tone.color,
        border: `1px ${tone.dashed ? "dashed" : "solid"} ${hexA(tone.color, 0.45)}`,
      }}
      title={label || ""}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tone.color }} />
      {label || "—"}
    </span>
  );
}

// Overdue / urgent marks — separate from status on purpose: a ticket can be
// «in progress» AND late, and the two facts must not compete for one chip.
function RedBadge({ icon: Icon, children, title }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap"
      style={{ background: hexA(C_OVERDUE, 0.12), color: C_OVERDUE, border: `1px solid ${hexA(C_OVERDUE, 0.35)}` }}
      title={title}
    >
      {Icon && <Icon size={10} />}
      {children}
    </span>
  );
}

// Labelled fact for the detail modal and the phone cards.
function Fact({ label, children, full = false }) {
  return (
    <div className={`min-w-0 ${full ? "sm:col-span-2" : ""}`}>
      <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: "var(--text-4)" }}>{label}</div>
      <div className="text-xs leading-snug break-words" style={{ color: "var(--text-1)" }}>{children ?? "—"}</div>
    </div>
  );
}

export default function Arc() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const toast = useToast();
  const qc = useQueryClient();

  const today = localISO(new Date());

  // ── page state (persisted, like every page) ───────────────────────────────
  // No default period. A register answers «what do we have?», and a 30-day
  // window is a filter the reader never chose — it made a full mirror look
  // like a thin one. Both bounds empty = every ticket ever filed.
  // Which VIEW is on screen. «all» is the ticket register; «cells» reads the
  // same filtered tickets grouped by the production cell their division names.
  const [tab, setTab] = usePersistentState("arc_tab", "all");
  const [dateFrom, setDateFrom] = usePersistentState("arc_date_from", "");
  const [dateTo, setDateTo] = usePersistentState("arc_date_to", "");
  const [state, setState] = usePersistentState("arc_state", "all");
  const [statusSel, setStatusSel] = usePersistentState("arc_status", []);
  const [catSel, setCatSel] = usePersistentState("arc_category", []);
  const [division, setDivision] = usePersistentState("arc_division", "");
  // The cell scope is the four-digit CODE the division name carries — the same
  // value the «by cells» rows are keyed by, so a row clicked there and the
  // filter it sets can never mean two different things. NO_CELL ("none") is a
  // pick like any other: the tickets whose division names no cell.
  const [cell, setCell] = usePersistentState("arc_cell", "");
  // The org chain this platform reads the register by — shift → brigadir →
  // leader — carried onto IT's tickets by the cell their division names, and
  // narrowed server-side into that same set of codes. One pick per level, like
  // every other org chain on the platform.
  const [shift, setShift] = usePersistentState("arc_shift", "");
  const [sup, setSup] = usePersistentState("arc_sup", "");
  const [leader, setLeader] = usePersistentState("arc_leader", "");
  const [brigada, setBrigada] = usePersistentState("arc_brigada", "");
  const [author, setAuthor] = usePersistentState("arc_author", "");
  const [urgent, setUrgent] = usePersistentState("arc_urgent", "all");
  const [overdue, setOverdue] = usePersistentState("arc_overdue", "all");
  const [source, setSource] = usePersistentState("arc_source", "all");
  const [q, setQ] = usePersistentState("arc_q", "");
  const [page, setPage] = usePersistentState("arc_page", 1);
  const [sort, setSort] = usePersistentState("arc_sort", { key: "created_at", dir: "desc" });
  const [openId, setOpenId] = useState(null);

  // ── meta (options + sync state) ───────────────────────────────────────────
  const metaQ = useQuery({
    queryKey: ["arc-meta"],
    queryFn: () => api.get("/api/arc/meta").then((r) => r.data),
    // While a sync runs the meta row is the progress feed — poll it.
    refetchInterval: (query) => (query.state.data?.sync?.running ? 2500 : false),
  });
  const meta = metaQ.data;
  const sync = meta?.sync;
  const running = !!sync?.running;
  const configured = meta?.configured !== false;
  const hasData = (sync?.row_count || 0) > 0;
  const options = meta?.options || {};

  // ── request params ────────────────────────────────────────────────────────
  const filters = useMemo(() => ({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    ...(state !== "all" ? { state } : {}),
    ...(statusSel.length ? { status: statusSel } : {}),
    ...(catSel.length ? { category: catSel } : {}),
    ...(division ? { division: [division] } : {}),
    ...(cell ? { cell: [cell] } : {}),
    ...(shift ? { shift: [shift] } : {}),
    ...(sup ? { manager: [sup] } : {}),
    ...(leader ? { leader: [leader] } : {}),
    ...(brigada ? { brigada: [brigada] } : {}),
    ...(author ? { author: [author] } : {}),
    ...(urgent !== "all" ? { urgent } : {}),
    ...(overdue !== "all" ? { overdue } : {}),
    ...(source !== "all" ? { source } : {}),
    q: q.trim() || undefined,
  }), [dateFrom, dateTo, state, statusSel, catSel, division, cell, shift, sup, leader,
       brigada, author, urgent, overdue, source, q]);
  const sortParam = `${sort.key}:${sort.dir}`;
  const listParams = useMemo(
    () => ({ ...filters, page, page_size: PAGE_SIZE, sort: sortParam }),
    [filters, page, sortParam]
  );

  const statsQ = useQuery({
    queryKey: ["arc-stats", filters],
    queryFn: () => api.get("/api/arc/stats", { params: filters }).then((r) => r.data),
    enabled: configured && hasData,
    placeholderData: keepPreviousData,
  });
  const listQ = useQuery({
    queryKey: ["arc-list", listParams],
    queryFn: () => api.get("/api/arc/list", { params: listParams }).then((r) => r.data),
    // BOTH tabs are this register — they differ only in which columns are on
    // the table — so this must never be gated on which one is open. It was,
    // back when «Yacheykalar bo'yicha» had its own aggregate endpoint, and
    // leaving that gate behind left the cells tab fetching nothing at all.
    enabled: configured && hasData,
    placeholderData: keepPreviousData,
  });
  // A failed /stats or /list must not masquerade as an empty register (skeleton
  // tiles forever + «no matching requests» for a 500). Toast once per failure —
  // the error toast persists until dismissed, so the reason survives.
  const errMsg = (e) => e?.response?.data?.detail || e?.message || "";
  useEffect(() => {
    if (statsQ.isError) toast.error(`${t("arc.loadFailed")}: ${errMsg(statsQ.error)}`);
  }, [statsQ.isError, statsQ.error]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (listQ.isError) toast.error(`${t("arc.loadFailed")}: ${errMsg(listQ.error)}`);
  }, [listQ.isError, listQ.error]); // eslint-disable-line react-hooks/exhaustive-deps
  // Filters changed → back to page 1 of the register.
  const filterSig = JSON.stringify([filters, sortParam]);
  const prevSig = useRef(filterSig);
  useEffect(() => {
    if (prevSig.current !== filterSig) {
      prevSig.current = filterSig;
      if (page !== 1) setPage(1);
    }
  }, [filterSig]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── refresh (full walk of the ARC API — progress polled via meta) ─────────
  const refreshMut = useMutation({
    mutationFn: () => api.post("/api/arc/refresh").then((r) => r.data),
    onSuccess: () => {
      // A sync can finish INSIDE one meta-poll interval, so `running` may never
      // be observed true — arm the finish detector by hand or a fast sync would
      // end with no toast and stale tables.
      prevRunning.current = true;
      qc.invalidateQueries({ queryKey: ["arc-meta"] });
    },
    onError: (e) => toast.error(`${t("arc.syncFailed")}: ${e?.response?.data?.detail || e?.message || ""}`),
  });
  const prevRunning = useRef(false);
  useEffect(() => {
    if (prevRunning.current && !running) {
      // A sync just finished — pull fresh numbers and report the outcome.
      qc.invalidateQueries({ queryKey: ["arc-stats"] });
      qc.invalidateQueries({ queryKey: ["arc-list"] });
      qc.invalidateQueries({ queryKey: ["arc-meta"] });
      if (sync?.ok === false) toast.error(`${t("arc.syncFailed")}: ${sync?.message || ""}`);
      else toast.success(t("arc.syncDone"));
    }
    prevRunning.current = running;
    // last_synced flips at completion — it re-runs this effect even when the
    // sync was too fast for `running` to ever render as true.
  }, [running, sync?.last_synced]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── column visibility / order (per-profile, /api/ui-prefs) ────────────────
  const { data: savedCols } = useQuery({
    queryKey: ["ui-pref", COL_PREF_KEY],
    queryFn: () => api.get(`/api/ui-prefs/${COL_PREF_KEY}`).then((r) => r.data?.value),
    staleTime: Infinity,
  });
  const [colsLocal, setColsLocal] = useState(null);   // this session's edits win over the fetch
  const colCfg = useMemo(() => {
    // Reconcile the saved pref against the current catalog: drop keys that no
    // longer exist, append new columns at the end, never let a locked one hide.
    const saved = colsLocal ?? savedCols;
    const keys = COLS.map((c) => c.key);
    const savedOrder = Array.isArray(saved?.order) ? saved.order.filter((k) => keys.includes(k)) : [];
    const order = [...savedOrder, ...keys.filter((k) => !savedOrder.includes(k))];
    const hidden = Array.isArray(saved?.hidden)
      ? saved.hidden.filter((k) => keys.includes(k) && !LOCKED_COLS.has(k))
      : [];
    return { order, hidden };
  }, [colsLocal, savedCols]);
  const saveCols = useMutation({
    mutationFn: (value) => api.put(`/api/ui-prefs/${COL_PREF_KEY}`, { value }),
  });
  const onColsChange = (value) => {
    setColsLocal(value);
    qc.setQueryData(["ui-pref", COL_PREF_KEY], value);
    saveCols.mutate(value);
  };
  // The columns on screen. «Barchasi» is the reader's own arrangement (the
  // picker's order minus what they hid); «Yacheykalar bo'yicha» is the fixed
  // curated set — same rows, a different question, so the picker is neither
  // consulted nor offered there.
  const visibleCols = useMemo(() => {
    if (tab === "cells") return CELL_COLS;
    const hiddenSet = new Set(colCfg.hidden);
    return colCfg.order.map((k) => COLS.find((c) => c.key === k)).filter((c) => c && !hiddenSet.has(c.key));
  }, [colCfg, tab]);

  // One sort is shared by both views, so a switch can land on a key the new
  // view has no column for — the rows really are ordered by it, and nothing on
  // screen says so. Fall back to the register's own default (newest first)
  // rather than leaving an order the reader can neither see nor undo. A key
  // both views carry (№, cell, status, due…) survives the switch untouched.
  useEffect(() => {
    const offered = new Set(visibleCols.map((c) => c.sortKey).filter(Boolean));
    if (!offered.has(sort.key) && sort.key !== "created_at") {
      setSort({ key: "created_at", dir: "desc" });
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── option lookups ────────────────────────────────────────────────────────
  // The API ships a bare status integer, so the filter offers the codes the
  // mirror actually holds, in the order a ticket travels through them.
  const statusOpts = options.statuses || [];
  const statusCount = useMemo(
    () => Object.fromEntries(statusOpts.map((s) => [String(s.value), s.count])), [statusOpts]);
  const statusValues = useMemo(() => {
    const held = statusOpts.map((s) => Number(s.value));
    const known = STATUS_CODES.filter((c) => held.includes(c));
    const unknown = held.filter((c) => !STATUS_CODES.includes(c)).sort((a, b) => a - b);
    return [...known, ...unknown].map(String);
  }, [statusOpts]);
  const catOpts = options.categories || [];
  const catById = useMemo(() => Object.fromEntries(catOpts.map((c) => [String(c.id), c])), [catOpts]);
  const divOpts = options.divisions || [];
  const divById = useMemo(() => Object.fromEntries(divOpts.map((d) => [d.id, d])), [divOpts]);
  // The cells the register actually carries, as {code, count, cell}. A code no
  // registered cell answers to is offered too — it narrows real tickets — and
  // «no cell» is the last option rather than an absence.
  const cellOpts = options.cells || [];
  const cellByCode = useMemo(() => Object.fromEntries(cellOpts.map((c) => [c.code, c])), [cellOpts]);
  const cellDisplay = (code) => {
    if (code === NO_CELL) return t("arc.cNoCell");
    const o = cellByCode[code];
    return cellName(o?.cell, lang, "") || code;
  };

  // ── the org chain: shift → brigadir → leader → cell ───────────────────────
  // Each level lists only what the levels ABOVE it leave, and says so — a list
  // shortened by a parent must never read as a dimension with nothing in it.
  // The lists come off the register's own cells (the backend counts them in
  // TICKETS), so every name offered is a narrowing with rows behind it.
  const org = options.org || {};
  const supAll = org.managers || [];
  const leadAll = org.leaders || [];
  const optsReady = !!meta?.options;
  const supOpts = useMemo(
    () => supAll.filter((m) => !shift || String(m.shift) === shift),
    [supAll, shift]);
  const leadOpts = useMemo(
    () => leadAll.filter((l) => (!shift || String(l.shift) === shift)
      && (!sup || String(l.manager_id) === sup)),
    [leadAll, shift, sup]);
  const orgActive = !!(shift || sup || leader);
  const cellPickOpts = useMemo(
    () => cellOpts.filter((o) => (!shift || String(o.sh) === shift)
      && (!sup || String(o.mgr) === sup)
      && (!leader || String(o.lead) === leader)),
    [cellOpts, shift, sup, leader]);
  const supById = useMemo(() => Object.fromEntries(supAll.map((m) => [String(m.id), m])), [supAll]);
  const leadById = useMemo(() => Object.fromEntries(leadAll.map((l) => [String(l.id), l])), [leadAll]);

  // A pick the shortened list below no longer offers is DROPPED: a control
  // naming a value the page cannot show is worse than a reset. Guarded on the
  // options actually having arrived — before /meta answers, every list is
  // empty and clearing on that would wipe the reader's saved scope.
  useEffect(() => {
    if (optsReady && sup && !supOpts.some((m) => String(m.id) === sup)) setSup("");
  }, [optsReady, supOpts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (optsReady && leader && !leadOpts.some((l) => String(l.id) === leader)) setLeader("");
  }, [optsReady, leadOpts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!optsReady || !cell) return;
    // «No cell» is a division this platform's org chart cannot reach at all, so
    // it cannot survive an org pick.
    if (cell === NO_CELL ? orgActive : !cellPickOpts.some((o) => o.code === cell)) setCell("");
  }, [optsReady, cellPickOpts, orgActive]); // eslint-disable-line react-hooks/exhaustive-deps
  const brigOpts = options.brigadas || [];
  const brigById = useMemo(() => Object.fromEntries(brigOpts.map((b) => [String(b.id), b])), [brigOpts]);
  const authorOpts = options.authors || [];
  const authorById = useMemo(() => Object.fromEntries(authorOpts.map((a) => [String(a.id), a])), [authorOpts]);
  const stName = (v) => statusName(v, t);

  // Three-way yes/no/all toggle used by urgent and overdue.
  const yesNoOpts = [["all", t("general.all")], ["yes", t("common.yes")], ["no", t("common.no")]];
  const yesNoDisplay = (v) => (v === "yes" ? t("common.yes") : v === "no" ? t("common.no") : "");
  const stateLabels = {
    all: t("arc.stateAll"), open: t("arc.stateOpen"), done: t("arc.stateDone"), cancelled: t("arc.stateCancelled"),
  };
  const sourceLabels = { all: t("general.all"), bot: t("arc.srcBot"), app: t("arc.srcApp") };

  const grpWho = t("arc.grpWho");
  const grpWhat = t("arc.grpWhat");
  // The count beside an option — how many non-missing tickets carry it.
  const withCount = (label, n) => (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate">{label}</span>
      {n != null && <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{n}</span>}
    </span>
  );

  // A list a level above it narrowed says so above itself (`note`), naming only
  // the NEAREST narrowing level — that is the control the reader has to touch
  // to get a missing name back. A level narrowed to nothing offers the way out
  // (`empty`) instead of an empty box.
  const shiftLabel = shift ? `${t("arc.shift")} ${shift}` : null;
  const supLabel = sup ? tl(supById[sup]?.name || `#${sup}`) : null;
  const leadLabel = leader ? tl(leadById[leader]?.name || `#${leader}`) : null;
  const chainNote = (parents, n) => {
    const p = parents.filter(Boolean).pop();
    return p ? `${t("arc.narrowedBy").replace("{x}", p)} · ${n}` : null;
  };
  const widenTo = (label, onClick) => (
    <div className="text-center py-1">
      <p className="text-xs mb-2" style={{ color: "var(--text-3)" }}>{t("arc.noneInScope")}</p>
      <Button size="sm" variant="secondary" onClick={onClick}>{label}</Button>
    </div>
  );

  // The org chain is PINNED to the toolbar (`pinned`): thirteen filters can
  // never pass the panel's fit check, so without it the three controls that
  // steer the whole page — both tabs, the KPI strip and the export — sat behind
  // a «Filtrlar» button that named none of them. The record filters stay in the
  // panel, where a reader goes looking for them.
  const sections = [
    {
      key: "shift", icon: Clock, label: t("arc.fShift"), group: grpWho, pinned: true,
      active: !!shift,
      display: shiftLabel || "",
      onClear: () => setShift(""),
      render: () => (
        <SegmentedToggle fill value={shift || "all"} onChange={(v) => setShift(v === "all" ? "" : v)}
          options={[["all", t("arc.shiftAll")], ["1", `${t("arc.shift")} 1`], ["2", `${t("arc.shift")} 2`]]} />
      ),
    },
    {
      key: "sup", icon: Wrench, label: t("arc.fSup"), group: grpWho, pinned: true,
      active: !!sup,
      display: supLabel || "",
      onClear: () => setSup(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          note={chainNote([shiftLabel], supOpts.length)}
          empty={shiftLabel ? widenTo(t("arc.shiftAll"), () => setShift("")) : null}
          opts={[{ value: "", label: t("arc.allSups") },
            ...supOpts.map((m) => ({ value: String(m.id), label: withCount(tl(m.name), m.count), title: tl(m.name) }))]}
          value={sup}
          onChange={(v) => setSup(v || "")} />
      ),
    },
    {
      key: "leader", icon: UserCog, label: t("arc.fLeader"), group: grpWho, pinned: true,
      active: !!leader,
      display: leadLabel || "",
      onClear: () => setLeader(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          note={chainNote([shiftLabel, supLabel], leadOpts.length)}
          empty={supLabel ? widenTo(t("arc.allSups"), () => setSup(""))
            : shiftLabel ? widenTo(t("arc.shiftAll"), () => setShift("")) : null}
          opts={[{ value: "", label: t("arc.allLeaders") },
            ...leadOpts.map((l) => ({ value: String(l.id), label: withCount(tl(l.name), l.count), title: tl(l.name) }))]}
          value={leader}
          onChange={(v) => setLeader(v || "")} />
      ),
    },
    {
      key: "cell", icon: Boxes, label: t("arc.fCell"), group: grpWho,
      active: !!cell,
      display: cell ? cellDisplay(cell) : "",
      onClear: () => setCell(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          note={chainNote([shiftLabel, supLabel, leadLabel], cellPickOpts.length)}
          empty={leadLabel ? widenTo(t("arc.allLeaders"), () => setLeader(""))
            : supLabel ? widenTo(t("arc.allSups"), () => setSup(""))
            : shiftLabel ? widenTo(t("arc.shiftAll"), () => setShift("")) : null}
          opts={[
            { value: "", label: t("arc.allCells") },
            ...cellPickOpts.map((o) => {
              const name = cellName(o.cell, lang, "");
              return {
                value: o.code,
                title: name ? `${o.code} · ${name}` : o.code,
                label: withCount(
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{name || o.code}</span>
                    {name && <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{o.code}</span>}
                  </span>,
                  o.count,
                ),
              };
            }),
            // Last, and named — the divisions this rule cannot resolve are a
            // real scope, not a gap in the list. They belong to no unit, so an
            // org pick above takes them off the list rather than offering a
            // scope that can only ever be empty.
            ...(options.no_cell_count && !orgActive
              ? [{ value: NO_CELL, title: t("arc.cNoCell"),
                   label: withCount(t("arc.cNoCell"), options.no_cell_count) }]
              : []),
          ]}
          value={cell}
          onChange={(v) => setCell(v || "")} />
      ),
    },
    {
      key: "division", icon: Building2, label: t("arc.fDivision"), group: grpWho,
      active: !!division,
      display: division ? (divById[division]?.name || division) : "",
      onClear: () => setDivision(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          opts={[{ value: "", label: t("arc.allDivisions") },
            ...divOpts.map((d) => ({ value: d.id, label: withCount(d.name, d.count), title: d.name }))]}
          value={division}
          onChange={(v) => setDivision(v || "")} />
      ),
    },
    {
      key: "brigada", icon: Users, label: t("arc.fBrigada"), group: grpWho,
      active: !!brigada,
      display: brigada ? (brigById[brigada]?.name || brigada) : "",
      onClear: () => setBrigada(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          opts={[{ value: "", label: t("arc.allBrigadas") },
            ...brigOpts.map((b) => ({ value: String(b.id), label: withCount(b.name || `#${b.id}`, b.count), title: b.name || `#${b.id}` }))]}
          value={brigada}
          onChange={(v) => setBrigada(v || "")} />
      ),
    },
    {
      key: "author", icon: UserRound, label: t("arc.fAuthor"), group: grpWho,
      active: !!author,
      display: author ? (authorById[author]?.name || author) : "",
      onClear: () => setAuthor(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          opts={[{ value: "", label: t("arc.allAuthors") },
            ...authorOpts.map((a) => ({ value: String(a.id), label: withCount(a.name || `#${a.id}`, a.count), title: a.name || `#${a.id}` }))]}
          value={author}
          onChange={(v) => setAuthor(v || "")} />
      ),
    },
    {
      key: "state", icon: Layers, label: t("arc.fState"), group: grpWhat,
      active: state !== "all",
      display: state !== "all" ? stateLabels[state] : "",
      onClear: () => setState("all"),
      render: () => (
        <SegmentedToggle fill value={state} onChange={setState}
          options={[["all", stateLabels.all], ["open", stateLabels.open], ["done", stateLabels.done], ["cancelled", stateLabels.cancelled]]} />
      ),
    },
    {
      key: "status", icon: CircleDot, label: t("arc.fStatus"), group: grpWhat,
      active: statusSel.length > 0,
      display: statusSel.length === 1 ? stName(statusSel[0]) : `${statusSel.length} ${t("filter.selected2")}`,
      onClear: () => setStatusSel([]),
      render: () => (
        <OptsFilter opts={statusValues} sel={statusSel} onChange={setStatusSel}
          labelOf={(v) => stName(v)}
          render={(v) => (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: toneFor(Number(v)).color }} />
              <span className="truncate">{stName(v)}</span>
              {statusCount[v] != null && <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{statusCount[v]}</span>}
            </span>
          )} />
      ),
    },
    {
      key: "category", icon: Tag, label: t("arc.fCategory"), group: grpWhat,
      active: catSel.length > 0,
      display: catSel.length === 1 ? (catById[catSel[0]]?.name || catSel[0]) : `${catSel.length} ${t("filter.selected2")}`,
      onClear: () => setCatSel([]),
      render: () => (
        <OptsFilter searchable={catOpts.length > 8} opts={catOpts.map((c) => String(c.id))} sel={catSel} onChange={setCatSel}
          labelOf={(id) => catById[id]?.name || id}
          render={(id) => {
            const c = catById[id];
            return (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                {c?.urgent ? <Zap size={10} className="flex-shrink-0" style={{ color: C_OVERDUE }} /> : null}
                <span className="truncate">{c?.name || id}</span>
                {c?.count != null && <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{c.count}</span>}
              </span>
            );
          }} />
      ),
    },
    {
      key: "urgent", icon: Zap, label: t("arc.fUrgent"), group: grpWhat,
      active: urgent !== "all", display: yesNoDisplay(urgent),
      onClear: () => setUrgent("all"),
      render: () => <SegmentedToggle fill value={urgent} onChange={setUrgent} options={yesNoOpts} />,
    },
    {
      key: "overdue", icon: Siren, label: t("arc.fOverdue"), group: grpWhat,
      active: overdue !== "all", display: yesNoDisplay(overdue),
      onClear: () => setOverdue("all"),
      render: () => <SegmentedToggle fill value={overdue} onChange={setOverdue} options={yesNoOpts} />,
    },
    {
      key: "source", icon: Bot, label: t("arc.fSource"), group: grpWhat,
      active: source !== "all", display: source !== "all" ? sourceLabels[source] : "",
      onClear: () => setSource("all"),
      render: () => (
        <SegmentedToggle fill value={source} onChange={setSource}
          options={[["all", sourceLabels.all], ["bot", sourceLabels.bot], ["app", sourceLabels.app]]} />
      ),
    },
  ];
  const clearAll = () => {
    setShift(""); setSup(""); setLeader("");
    setDivision(""); setCell(""); setBrigada(""); setAuthor(""); setState("all"); setStatusSel([]);
    setCatSel([]); setUrgent("all"); setOverdue("all"); setSource("all");
  };

  // ── register ──────────────────────────────────────────────────────────────
  const list = listQ.data;
  const rows = list?.rows || [];
  // {code → cell} for this page of rows: the payload names each workshop once
  // instead of once per ticket.
  const cellMap = list?.cells || {};
  const total = list?.total || 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const listLoading = listQ.isLoading || (listQ.isFetching && !listQ.data);
  const onSort = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === "desc" ? "asc" : "desc" }));

  const stats = statsQ.data;
  const statsLoading = statsQ.isLoading || (statsQ.isFetching && !statsQ.data);

  // Telegram's WebView swallows target=_blank; openLink hands the URL to the
  // real browser. In a desktop browser the plain <a> is already correct.
  const openExt = (e, url) => {
    const tg = window?.Telegram?.WebApp;
    if (!url || !inTelegram() || !tg?.openLink) return;
    e.preventDefault();
    try { tg.openLink(url); } catch { window.open(url, "_blank", "noopener"); }
  };
  // Plain render helper (not a nested component — a component declared inside
  // render remounts on every paint).
  const extLink = (href, children) => (
    <a href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => { e.stopPropagation(); openExt(e, href); }}
      className="inline-flex items-center gap-1 underline underline-offset-2"
      style={{ color: "var(--brand-text)" }}>
      {children}
    </a>
  );

  // The description lives on the ticket CARD, one call per ticket, so a row the
  // background hydration has not reached yet has none — and «no description
  // yet» must not render the same as «this ticket has none».
  const descCell = (r) => {
    if (r.description) return truncate(r.description, 60);
    return r.has_detail
      ? "—"
      : <span title={t("arc.notFetched")} style={{ color: "var(--text-4)" }}>…</span>;
  };

  // The production cell a ticket's division NAMES — as the CODE alone (the
  // user's call): the workshop names are long enough to wrap every row onto two
  // lines, and the code is the identifier both registers actually share. The
  // name still rides the tooltip, so nothing is lost, only unstacked. An
  // explicit «no cell» stays for a division carrying no code — that is a
  // different fact from a code the registry has never heard of, and neither may
  // render as a blank. The code is a CellLink (→ /cells/:id); it stops
  // propagation, so it opens the CELL while the row opens the ticket.
  const cellCell = (r) => {
    if (!r.cell_code) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-4)" }}
          title={t("arc.cNoCellHint")}>
          <Link2Off size={11} />{t("arc.cNoCell")}
        </span>
      );
    }
    const c = cellMap[r.cell_code];
    const name = cellName(c, lang, "");
    return (
      <CellLink id={c?.id} title={name ? `${r.cell_code} · ${name}` : r.cell_code}>
        <span className="tabular-nums">{r.cell_code}</span>
      </CellLink>
    );
  };

  // The cell's owners on THIS platform's org chart — brigadir and leader — both
  // reached through the code the division names, off the same `cells` map the
  // cell column reads. Names are DB text, so they ride through the
  // transliterator like every other name here: the column and the filter that
  // narrows it spell the same person the same way.
  //
  // A ticket can fail to reach an owner three ways — its division names no
  // cell, it names one the registry has never heard of, or the cell has nobody
  // assigned. All three render «—», because the CELL column standing right
  // beside it already says which of the three it is; the tooltip carries the
  // reason for a reader who wants it rather than repeating it in two columns.
  const ownerCell = (r, field) => {
    const name = r.cell_code ? tl(cellMap[r.cell_code]?.[field] || "") : "";
    if (name) return <span style={{ color: "var(--text-2)" }}>{name}</span>;
    const why = !r.cell_code ? t("arc.cNoCellHint")
      : !cellMap[r.cell_code] ? t("arc.cUnknown")
      : t("arc.ownerNone");
    return <span style={{ color: "var(--text-4)" }} title={why}>—</span>;
  };

  // Row → cell, keyed by column — hide/reorder needs no markup change of its own.
  const listCell = (key, r) => {
    switch (key) {
      case "sup":
        return <td key={key} className="px-3 py-2">{ownerCell(r, "sup")}</td>;
      case "leader":
        return <td key={key} className="px-3 py-2">{ownerCell(r, "leader")}</td>;
      // Closed + how long it took, one sentence. The duration is muted: it
      // qualifies the stamp rather than competing with it, and an open ticket
      // shows the bare «—» with no trailing figure to misread as zero hours.
      case "closed_h":
        return (
          <td key={key} className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}
            title={fmtDateTime(r.closed_at)}>
            <span className="tabular-nums">{fmtShort(r.closed_at) || "—"}</span>
            {r.closed_at && r.hours_to_close != null && (
              <span className="tabular-nums text-[11px]" style={{ color: "var(--text-4)" }}>
                {" · "}{tpl(t("arc.hoursShort"), { n: fmtHours(r.hours_to_close) })}
              </span>
            )}
          </td>
        );
      case "num":
        return <td key={key} className="px-3 py-2 font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{r.request_num ?? "—"}</td>;
      case "created":
        return <td key={key} className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }} title={fmtDateTime(r.created_at)}>{fmtShort(r.created_at) || "—"}</td>;
      case "division":
        return <td key={key} className="px-3 py-2" style={{ color: "var(--text-1)" }}>{r.division_name || "—"}</td>;
      case "cell":
        return <td key={key} className="px-3 py-2">{cellCell(r)}</td>;
      case "category":
        return (
          <td key={key} className="px-3 py-2">
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <span style={{ color: "var(--text-2)" }}>{r.category_name || "—"}</span>
              {r.category_urgent && <RedBadge icon={Zap}>{t("arc.urgent")}</RedBadge>}
            </span>
          </td>
        );
      case "description":
        return (
          <td key={key} className="px-3 py-2 max-w-[280px]" style={{ color: "var(--text-2)" }} title={r.description || ""}>
            {descCell(r)}
          </td>
        );
      case "author":
        return <td key={key} className="px-3 py-2" style={{ color: "var(--text-2)" }}>{r.user_name || "—"}</td>;
      case "brigada":
        return <td key={key} className="px-3 py-2" style={{ color: "var(--text-2)" }}>{r.brigada_name || "—"}</td>;
      case "status":
        return (
          <td key={key} className="px-3 py-2">
            <StatusChip status={r.status} label={stName(r.status)} />
          </td>
        );
      case "due":
        return (
          <td key={key} className="px-3 py-2 whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="tabular-nums" style={{ color: "var(--text-2)" }} title={fmtDateTime(r.due)}>{fmtShort(r.due) || "—"}</span>
              {(r.overdue_now || r.late) && <RedBadge icon={AlertTriangle}>{t("arc.late")}</RedBadge>}
            </span>
          </td>
        );
      case "started":
        return <td key={key} className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }} title={fmtDateTime(r.started_at)}>{fmtShort(r.started_at) || "—"}</td>;
      case "closed":
        return <td key={key} className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }} title={fmtDateTime(r.closed_at)}>{fmtShort(r.closed_at) || "—"}</td>;
      case "hours":
        return <td key={key} className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{fmtHours(r.hours_to_close)}</td>;
      case "source":
        return (
          <td key={key} className="px-3 py-2 text-center" style={{ color: "var(--text-3)" }}>
            {r.is_bot ? <Bot size={14} className="inline" title={t("arc.srcBot")} />
              : <Smartphone size={14} className="inline" title={t("arc.srcApp")} />}
          </td>
        );
      case "files":
        return (
          <td key={key} className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>
            {Array.isArray(r.files) && r.files.length > 0
              ? <span className="inline-flex items-center gap-1"><Paperclip size={12} />{r.files.length}</span>
              : <span style={{ color: "var(--text-4)" }}>{r.has_detail ? "—" : "…"}</span>}
          </td>
        );
      default:
        return <td key={key} className="px-3 py-2" />;
    }
  };

  // Phone layout — each ticket is its own standalone card (TableCard's
  // `mobileCards` mode); the table keeps rendering from `sm:` up.
  const mobileList = (
    <>
      {listLoading && Array.from({ length: 4 }).map((_, i) => (
        <div key={`sk-${i}`} className="rounded-xl p-3 space-y-2" style={cardStyle}>
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-2/3" />
        </div>
      ))}
      {!listLoading && rows.length === 0 && (
        <div className="rounded-xl px-3 py-8 text-center text-xs" style={{ ...cardStyle, color: "var(--text-4)" }}>
          {t("arc.noMatch")}
        </div>
      )}
      {!listLoading && rows.map((r) => {
        const late = r.overdue_now || r.late;
        const strip = late ? C_OVERDUE : toneFor(r.status).color;
        return (
          <div key={r.remote_id || r.id}
            onClick={() => setOpenId(r.remote_id)}
            className="rounded-xl p-3 flex flex-col gap-2 cursor-pointer"
            style={{ ...cardStyle, borderLeft: `3px solid ${strip}` }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>№{r.request_num ?? "—"}</span>
              <StatusChip status={r.status} label={stName(r.status)} />
            </div>
            <div className="text-xs font-medium" style={{ color: "var(--text-1)" }}>{r.division_name || "—"}</div>
            <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{cellCell(r)}</div>
            {/* The card answers the tab's own question. On «Yacheykalar
                bo'yicha» that is who owns the cell and when it closed; on the
                register it is what kind of job and who is working it. */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {tab === "cells" ? (
                <>
                  <Fact label={t("arc.colSup")}>{ownerCell(r, "sup")}</Fact>
                  <Fact label={t("arc.colLeader")}>{ownerCell(r, "leader")}</Fact>
                </>
              ) : (
                <>
                  <Fact label={t("arc.colCategory")}>
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      {r.category_name || "—"}
                      {r.category_urgent && <RedBadge icon={Zap}>{t("arc.urgent")}</RedBadge>}
                    </span>
                  </Fact>
                  <Fact label={t("arc.colBrigada")}>{r.brigada_name || "—"}</Fact>
                </>
              )}
              <Fact label={t("arc.colDue")}>
                <span className="inline-flex items-center gap-1 flex-wrap tabular-nums">
                  {fmtShort(r.due) || "—"}
                  {late && <RedBadge icon={AlertTriangle}>{t("arc.late")}</RedBadge>}
                </span>
              </Fact>
              {tab === "cells" ? (
                <Fact label={t("arc.colClosed")}>
                  <span className="tabular-nums">{fmtShort(r.closed_at) || "—"}</span>
                  {r.closed_at && r.hours_to_close != null && (
                    <span className="tabular-nums" style={{ color: "var(--text-4)" }}>
                      {" · "}{tpl(t("arc.hoursShort"), { n: fmtHours(r.hours_to_close) })}
                    </span>
                  )}
                </Fact>
              ) : (
                <Fact label={t("arc.colCreated")}><span className="tabular-nums">{fmtShort(r.created_at) || "—"}</span></Fact>
              )}
            </div>
          </div>
        );
      })}
    </>
  );

  // ── «not connected» diagnostics (admin-only endpoint; others 403 → nothing) ─
  // The platform has no shell, so the page itself must say WHERE the process
  // looked and whether it found the key — never the key.
  const diagQ = useQuery({
    queryKey: ["arc-diag"],
    queryFn: () => api.get("/api/arc/diag").then((r) => r.data),
    enabled: !!meta && !configured,
    retry: false,
  });
  const diag = diagQ.data;

  // ── detail modal ──────────────────────────────────────────────────────────
  const detailQ = useQuery({
    queryKey: ["arc-request", openId],
    queryFn: () => api.get(`/api/arc/requests/${openId}`).then((r) => r.data),
    enabled: openId != null,
  });
  // The clicked row, straight from the list payload — the modal paints from it
  // without waiting on the network. The fetched card wins once it lands,
  // because it is the only thing carrying the description and the files.
  const openRow = useMemo(() => rows.find((r) => r.remote_id === openId) || null, [rows, openId]);
  const d = detailQ.data || openRow;
  // The fetched card carries its own one-entry cells map; before it lands the
  // page's map already names the row that was clicked.
  const cellFact = (row) => {
    if (!row?.cell_code) {
      return <span style={{ color: "var(--text-4)" }}>{t("arc.cNoCell")}</span>;
    }
    const c = (detailQ.data?.cells || cellMap)[row.cell_code];
    const name = cellName(c, lang, "");
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <CellLink id={c?.id}>{name || row.cell_code}</CellLink>
        {name && <span className="tabular-nums" style={{ color: "var(--text-4)" }}>{row.cell_code}</span>}
        {!c && (
          <span className="text-[10px]" style={{ color: "var(--text-4)" }}>· {t("arc.cUnknown")}</span>
        )}
      </span>
    );
  };
  // The cell's owners, resolved through the SAME map the cell fact above uses
  // (the fetched card's own one-entry map wins once it lands). The table's
  // `ownerCell` reads the page map only, so this cannot borrow it.
  const ownerFact = (row, field) => {
    const c = row?.cell_code ? (detailQ.data?.cells || cellMap)[row.cell_code] : null;
    const name = tl(c?.[field] || "");
    if (name) return name;
    // Same three reasons, same wording as the table's `ownerCell` — the two
    // surfaces answer «why is this blank» identically or they are two rules.
    const why = !row?.cell_code ? t("arc.cNoCellHint")
      : !c ? t("arc.cUnknown")
      : t("arc.ownerNone");
    return <span style={{ color: "var(--text-4)" }} title={why}>—</span>;
  };
  const [brokenImgs, setBrokenImgs] = useState({});
  useEffect(() => { setBrokenImgs({}); }, [openId]);

  // The ticket's own history: status code → the moment it was entered. Sorted
  // by that moment, not by the code, so it reads as what happened in order.
  const timeline = useMemo(() => {
    const ut = d?.update_time;
    if (!ut || typeof ut !== "object") return [];
    return Object.entries(ut)
      .map(([code, at]) => ({ code: Number(code), at: String(at || "") }))
      .filter((e) => e.at)
      .sort((a, b) => new Date(a.at) - new Date(b.at));
  }, [d]);

  // ── export ────────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  // The file is whatever is on SCREEN — the same tickets, through the same
  // filters and sort, in the column set the open tab is showing. Both views are
  // the register now, so there is one export shape and the tab only decides
  // which columns ride in it and what the file is called.
  const runExport = async () => {
    setExporting(true);
    const exportKeys = visibleCols.flatMap((c) => EXPORT_SPLIT[c.key] || [c.key]);
    try {
      const via = await exportXlsx("/api/arc/export.xlsx", {
        body: {
          ...filters, sort: sortParam,
          // Which tab the file came off. It no longer picks a builder — both
          // views are the register — but it still names the file, and the
          // backend's name is the one Telegram delivers, so dropping it would
          // let a DM and a browser download of the same press disagree.
          view: tab === "cells" ? "cells" : "list",
          // The one value the backend has to pick a spelling of: a workshop
          // name exists in four languages and the file carries one.
          lang,
          columns: exportKeys,
          // Headers in the viewer's language — the backend's own labels are an
          // English fallback only. `_bot` / `_app` are the two words the source
          // column needs; the API ships a flag, not a name.
          labels: {
            ...Object.fromEntries(
              exportKeys.map((k) => [k, t(labelKeyOf(k) || k)])),
            _bot: t("arc.srcBot"), _app: t("arc.srcApp"),
          },
          // Same reason: a status is an integer upstream.
          status_labels: Object.fromEntries(STATUS_CODES.map((c) => [String(c), t(`arc.st.${c}`)])),
        },
        fallbackName: tab === "cells" ? `arc_cells_${today}.xlsx` : `arc_requests_${today}.xlsx`,
      });
      toast.success(via === "download" ? t("arc.exportDownloaded") : t("arc.exportSent"));
    } catch (e) {
      toast.error(`${t("arc.exportFailed")}: ${e?.response?.data?.detail || e?.message || ""}`);
    } finally {
      setExporting(false);
    }
  };

  // ── header bits ───────────────────────────────────────────────────────────
  const lastSynced = fmtDateTime(sync?.last_synced);
  const pendingCards = sync?.detail_pending || 0;
  const refreshBtn = (
    <Button size="lg" variant="secondary" loading={running || refreshMut.isPending}
      disabled={!configured}
      icon={!(running || refreshMut.isPending) ? <RefreshCw size={14} /> : null}
      onClick={() => refreshMut.mutate()}>
      {/* Button hides its children while `loading` (overlay spinner keeps the
          width stable), so the sync progress lives in the pill instead. */}
      <span className="hidden sm:inline">{t("arc.refresh")}</span>
    </Button>
  );
  // The last-synced pill doubles as the live progress feed during a sync —
  // a background walk with nothing but a spinner reads as frozen. Ticket cards
  // are fetched one at a time and bounded per pass, so an outstanding count is
  // named too: it is the difference between «still loading» and «this ticket
  // has no description».
  const syncPill = running ? (
    <>
      <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: "var(--brand-text)" }} />
      {t("arc.refreshing")}
      <span className="tabular-nums" style={{ color: "var(--text-2)" }}>
        {tpl(t("arc.syncProgress"), { done: sync?.progress_done ?? 0, total: sync?.progress_total || "…" })}
      </span>
    </>
  ) : (
    <>
      <CalendarClock size={14} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />
      {t("arc.lastSynced")}: <span style={{ color: "var(--text-3)" }}>{lastSynced || t("arc.never")}</span>
      {pendingCards > 0 && (
        <span className="tabular-nums" style={{ color: "var(--text-4)" }} title={t("arc.cardsPendingHint")}>
          · {tpl(t("arc.cardsPending"), { n: pendingCards.toLocaleString("ru-RU") })}
        </span>
      )}
    </>
  );

  const isBoot = metaQ.isLoading;
  const loadError = metaQ.isError;

  const kpiTiles = stats ? [
    { label: t("arc.kShown"), value: (stats.shown ?? 0).toLocaleString("ru-RU"), icon: ClipboardList },
    { label: t("arc.kOpen"), value: (stats.open ?? 0).toLocaleString("ru-RU"), icon: Hourglass, color: C_DOING },
    { label: t("arc.kOverdue"), value: (stats.overdue ?? 0).toLocaleString("ru-RU"), icon: Siren,
      color: (stats.overdue ?? 0) > 0 ? C_OVERDUE : C_GREY, danger: (stats.overdue ?? 0) > 0 },
    { label: t("arc.kDone"), value: (stats.done ?? 0).toLocaleString("ru-RU"), icon: CheckCircle2, color: C_DONE },
    { label: t("arc.kOnTime"), value: stats.on_time_pct == null ? "—" : `${Math.round(stats.on_time_pct)}%`, icon: ShieldCheck,
      // The share is computed over closed tickets whose category CARRIES an
      // allowed time — a ticket without one is neither on time nor late — so
      // name that count.
      sub: tpl(t("arc.kOnTimeSub"), { n: (stats.closed_with_due ?? 0).toLocaleString("ru-RU") }) },
    { label: t("arc.kMedian"), value: fmtHours(stats.median_hours), icon: Timer, sub: t("arc.kMedianSub") },
  ] : [];

  return (
    <Layout title={t("arc.title")}>
      {/* header: title + last-synced + refresh */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{t("arc.title")}</h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>{t("arc.subtitle")}</p>
          <p className="sm:hidden text-[11px] mt-1 inline-flex items-center gap-1 flex-wrap" style={{ color: "var(--text-4)" }}>
            {syncPill}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs" style={{ ...cardStyle, color: "var(--text-2)" }}>
            {syncPill}
          </span>
          {refreshBtn}
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl px-4 py-3 text-xs mb-4 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: hexA(C_OVERDUE, 0.1), color: C_OVERDUE, border: `1px solid ${hexA(C_OVERDUE, 0.33)}` }}>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="min-w-0">{metaQ.error?.response?.data?.detail || t("arc.loadFailed")}</span>
          </span>
          <Button size="sm" variant="secondary" onClick={() => metaQ.refetch()}>{t("common.retry")}</Button>
        </div>
      )}

      {isBoot ? (
        <div className="space-y-4">
          <SkeletonBlock className="h-9 w-64" />
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
          <div className="rounded-2xl p-4" style={cardStyle}>
            {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-5 w-full mb-2.5" />)}
          </div>
        </div>
      ) : !configured ? (
        /* the key is missing on the server — nothing here can work */
        <div className="rounded-2xl" style={cardStyle}>
          <EmptyState icon={PlugZap} height="h-56" showUploadLink={false}
            title={t("arc.notConfiguredTitle")} message={t("arc.notConfigured")} />
          {diag && (
            /* admin diagnostics: file → key presence → parse problems → a live knock */
            <div className="border-t px-4 py-3 text-xs space-y-2" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{t("arc.diagTitle")}</div>
              <div className="flex flex-wrap gap-x-2">
                <span style={{ color: "var(--text-3)" }}>{t("arc.diagFile")}:</span>
                <code className="break-all">{diag.env_file?.path}</code>
                {!diag.env_file?.exists && <span style={{ color: C_OVERDUE }}>· {t("arc.diagMissingFile")}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span style={{ color: "var(--text-3)" }}>{t("arc.diagCred")}:</span>
                {(() => {
                  const v = diag.env_file?.cred?.INTERNAL_API_KEY;
                  const tone = v === true ? C_DONE : v === false ? C_OVERDUE : C_GREY;
                  return (
                    <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
                      style={{ background: hexA(tone, 0.12), color: tone, border: `1px solid ${hexA(tone, 0.4)}` }}>
                      <code>INTERNAL_API_KEY</code>
                      <span>{v === true ? t("arc.diagSet") : v === false ? t("arc.diagEmpty") : t("arc.diagAbsent")}</span>
                    </span>
                  );
                })()}
              </div>
              {diag.env_file?.exists && (
                <div className="flex flex-wrap gap-x-2">
                  <span style={{ color: "var(--text-3)" }}>{t("arc.diagKeys")}:</span>
                  <span className="break-all">{(diag.env_file.keys || []).join(", ") || "—"}</span>
                </div>
              )}
              {diag.env_file?.bad_lines?.length > 0 && (
                <div style={{ color: C_OVERDUE }}>{t("arc.diagBadLines")}: {diag.env_file.bad_lines.join(", ")}</div>
              )}
              {(diag.env_file?.glued || []).map((g) => (
                <div key={`${g.key}-${g.name}`} style={{ color: C_OVERDUE }}>
                  {tpl(t("arc.diagGlued"), { name: g.name, key: g.key })}
                </div>
              ))}
              {diag.other_env_files?.length > 0 && (
                <div className="flex flex-wrap gap-x-2">
                  <span style={{ color: "var(--text-3)" }}>{t("arc.diagOther")}:</span>
                  <span className="break-all">
                    {diag.other_env_files.map((f) => `${f.path} (${f.cred?.INTERNAL_API_KEY ? "INTERNAL_API_KEY" : "—"})`).join("; ")}
                  </span>
                </div>
              )}
              {diag.process_env?.INTERNAL_API_KEY && (
                <div className="flex flex-wrap gap-x-2">
                  <span style={{ color: "var(--text-3)" }}>{t("arc.diagProcess")}:</span>
                  <span>INTERNAL_API_KEY</span>
                </div>
              )}
              {diag.ping && (
                <div className="flex flex-wrap gap-x-2">
                  <span style={{ color: "var(--text-3)" }}>{t("arc.diagPing")}:</span>
                  <span style={{ color: diag.ping.ok ? C_DONE : C_OVERDUE }}>
                    {diag.ping.ok ? tpl(t("arc.diagPingOk"), { n: diag.ping.total ?? 0 }) : (diag.ping.error || "—")}
                  </span>
                </div>
              )}
              <p style={{ color: "var(--text-4)" }}>{t("arc.diagHint")}</p>
            </div>
          )}
        </div>
      ) : !hasData ? (
        /* never synced — the page's only useful action is the first walk */
        <div className="rounded-2xl" style={cardStyle}>
          <EmptyState icon={ClipboardList} height="h-56" showUploadLink={false}
            title={t("arc.emptyTitle")} message={t("arc.emptyNote")}
            action={(
              <div className="flex flex-col items-center gap-2">
                {refreshBtn}
                {running && (
                  <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                    {tpl(t("arc.syncProgress"), { done: sync?.progress_done ?? 0, total: sync?.progress_total || "…" })}
                  </span>
                )}
              </div>
            )} />
        </div>
      ) : (
        <>
          {/* The view switch. Both views read the SAME filtered tickets — one
              as a ticket register, one grouped by the production cell their
              division names — so the tabs sit above the filter row rather than
              inside it. */}
          <div className="mb-3">
            <SegmentedToggle
              asTabs
              ariaLabel={t("arc.title")}
              value={tab}
              onChange={setTab}
              options={[
                { value: "all", label: t("arc.tabAll") },
                {
                  value: "cells",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Boxes size={12} />{t("arc.tabCells")}
                    </span>
                  ),
                },
              ]}
            />
          </div>

          {/* ONE filter row: period inline, scopes + record filters in the
              panel, text search inline, export + column picker on the right. */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
              max={today} compactLabel triggerClassName="px-3 py-2 text-sm" />
            <FilterPanel sections={sections} onClearAll={clearAll} />
            <div className="flex-1" />
            <SearchInput value={q} onChange={setQ} placeholder={t("arc.search")} className="w-full sm:w-72" />
            <Button size="lg" variant="secondary" loading={exporting}
              disabled={listLoading || total === 0}
              icon={!exporting ? <Download size={14} /> : null}
              onClick={runExport}>
              <span className="hidden sm:inline">{t("arc.export")}</span>
            </Button>
            {/* The picker describes the REGISTER's columns, so it is offered on
                that tab only. Hidden below `sm:` too — that is where TableCard
                swaps the table for stacked cards, and a picker over a table
                nobody can see is a control with no effect. */}
            {tab === "all" && <ColumnsPicker
              className="ml-auto hidden sm:block"
              columns={COLS.map((c) => ({ key: c.key, label: t(c.labelKey), locked: LOCKED_COLS.has(c.key) }))}
              order={colCfg.order}
              hidden={colCfg.hidden}
              onChange={onColsChange}
            />}
          </div>

          {/* ── KPI strip — the SAME filtered set as the table ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {statsLoading || !stats
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
              : kpiTiles.map((k) => <KPICard key={k.label} {...k} />)}
          </div>

          {/* ONE table for both views. They differ only in which columns are on
              it — the rows, the filters, the page and the sort are the same
              register, which is the whole reason the two are tabs and not two
              pages. The cells view is narrower, so it needs less minimum width
              before it has to scroll. */}
          <>
          <TableCard
            icon={tab === "cells" ? Boxes : ClipboardList}
            title={tab === "cells" ? t("arc.tabCells") : t("arc.listTitle")}
            wrap
            minWidth={tab === "cells" ? 1040 : 1200}
            mobile={mobileList}
            mobileCards
            right={
              <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
                {tpl(t("arc.count"), { n: total.toLocaleString("ru-RU") })}
              </span>
            }
          >
            <thead>
              <tr>
                {visibleCols.map((c) => (
                  <Th key={c.key} icon={c.icon} label={t(c.labelKey)} k={c.sortKey}
                    sort={sort} onSort={c.sortKey ? onSort : undefined} align={c.align} />
                ))}
              </tr>
            </thead>
            <tbody>
              {listLoading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`}>
                  {visibleCols.map((c) => (
                    <td key={c.key} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))}
              {!listLoading && rows.length === 0 && (
                <tr><td colSpan={visibleCols.length} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                  {t("arc.noMatch")}
                </td></tr>
              )}
              {!listLoading && rows.map((r) => (
                <tr key={r.remote_id || r.id} onClick={() => setOpenId(r.remote_id)} className="align-top cursor-pointer">
                  {visibleCols.map((c) => listCell(c.key, r))}
                </tr>
              ))}
            </tbody>
          </TableCard>
          <Pagination page={page} pageCount={pageCount} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
          </>
        </>
      )}

      {/* ── ticket detail ── */}
      {openId != null && (
        <Modal
          onClose={() => setOpenId(null)}
          maxWidth="max-w-2xl"
          icon={<ClipboardList size={16} />}
          title={d ? tpl(t("arc.detailTitle"), { num: d.request_num ?? "—", division: d.division_name || "—" }) : "…"}
          subtitle={d ? [d.category_name, fmtDateTime(d.created_at)].filter(Boolean).join(" · ") : ""}
          footer={<Button variant="secondary" onClick={() => setOpenId(null)}>{t("arc.close")}</Button>}
        >
          {!d ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-4 w-full" />)}
            </div>
          ) : (
            <>
              {detailQ.isError && (
                <div className="rounded-xl px-3 py-2 text-xs flex items-center gap-2"
                  style={{ background: hexA(C_OVERDUE, 0.1), color: C_OVERDUE, border: `1px solid ${hexA(C_OVERDUE, 0.33)}` }}>
                  <AlertTriangle size={13} className="flex-shrink-0" />
                  {detailQ.error?.response?.data?.detail || t("arc.dLoadFailed")}
                </div>
              )}
              {/* headline facts: status + the marks that ride beside it */}
              <div className="flex items-center gap-2 flex-wrap">
                <StatusChip status={d.status} label={stName(d.status)} />
                {(d.overdue_now || d.late) && <RedBadge icon={AlertTriangle}>{t("arc.late")}</RedBadge>}
                {d.category_urgent && <RedBadge icon={Zap}>{t("arc.urgent")}</RedBadge>}
                {d.is_bot && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: hexA(C_GREY, 0.14), color: "var(--text-3)", border: `1px solid ${hexA(C_GREY, 0.35)}` }}>
                    <Bot size={10} />{t("arc.srcBot")}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <Fact label={t("arc.dAuthor")}>{d.user_name || "—"}</Fact>
                <Fact label={t("arc.dPhone")}>
                  {d.user_phone
                    ? <a href={`tel:${d.user_phone}`} className="inline-flex items-center gap-1 underline underline-offset-2" style={{ color: "var(--brand-text)" }}><Phone size={11} />{d.user_phone}</a>
                    : "—"}
                </Fact>
                <Fact label={t("arc.dDivision")}>{d.division_name || "—"}</Fact>
                {/* Which production cell that division names, read off the same
                    rule the register column and the «by cells» tab use. */}
                <Fact label={t("arc.dCell")}>{cellFact(d)}</Fact>
                {/* THIS platform's org chart, reached through that cell —
                    distinct from «Rahbar» below, which is the manager block
                    IT's own division record carries. */}
                <Fact label={t("arc.colSup")}>{ownerFact(d, "sup")}</Fact>
                <Fact label={t("arc.colLeader")}>{ownerFact(d, "leader")}</Fact>
                <Fact label={t("arc.dManager")}>{d.manager_name || "—"}</Fact>
                <Fact label={t("arc.dBrigada")}>{d.brigada_name || "—"}</Fact>
                <Fact label={t("arc.dCategory")}>
                  <span className="inline-flex items-center gap-1 flex-wrap">
                    {d.category_name || "—"}
                    {d.category_ftime > 0 && (
                      <span style={{ color: "var(--text-4)" }}>· {tpl(t("arc.dFtime"), { n: d.category_ftime })}</span>
                    )}
                  </span>
                </Fact>
                <Fact label={t("arc.dDescription")} full>
                  {d.description || (d.has_detail ? "—" : <span style={{ color: "var(--text-4)" }}>{t("arc.notFetched")}</span>)}
                </Fact>
                <Fact label={t("arc.dCreated")}><span className="tabular-nums">{fmtDateTime(d.created_at) || "—"}</span></Fact>
                <Fact label={t("arc.dDue")}><span className="tabular-nums">{fmtDateTime(d.due) || "—"}</span></Fact>
                <Fact label={t("arc.dStarted")}>
                  <span className="tabular-nums">{fmtDateTime(d.started_at) || "—"}</span>
                  {d.hours_to_start != null && (
                    <span style={{ color: "var(--text-4)" }}> · {tpl(t("arc.dAfterHours"), { n: fmtHours(d.hours_to_start) })}</span>
                  )}
                </Fact>
                <Fact label={t("arc.dFinished")}>
                  <span className="tabular-nums">{fmtDateTime(d.finished_at) || "—"}</span>
                  {d.hours_to_close != null && (
                    <span style={{ color: "var(--text-4)" }}> · {tpl(t("arc.dAfterHours"), { n: fmtHours(d.hours_to_close) })}</span>
                  )}
                </Fact>
                {d.deny_reason && <Fact label={t("arc.dDenyReason")} full>{d.deny_reason}</Fact>}

                {Array.isArray(d.files) && d.files.length > 0 && (
                  <Fact label={t("arc.dFiles")} full>
                    <div className="flex flex-wrap gap-2">
                      {d.files.map((f, i) => {
                        const href = f?.href || f?.url;
                        const isImg = IMG_RE.test(String(f?.url || ""));
                        if (isImg && !brokenImgs[i]) {
                          return (
                            <a key={f?.id ?? i} href={href} target="_blank" rel="noopener noreferrer"
                              onClick={(e) => openExt(e, href)} className="inline-block">
                              <img src={href} alt="" className="max-h-40 rounded-lg" style={{ border: "1px solid var(--border)" }}
                                onError={() => setBrokenImgs((s) => ({ ...s, [i]: true }))} />
                            </a>
                          );
                        }
                        return (
                          <span key={f?.id ?? i}>
                            {extLink(href, <><Paperclip size={11} />{truncate(String(f?.url || "").split("/").pop(), 28)}<ExternalLink size={11} /></>)}
                          </span>
                        );
                      })}
                    </div>
                  </Fact>
                )}

                {timeline.length > 0 && (
                  <div className="sm:col-span-2">
                    <div className="text-[10px] uppercase tracking-wider mb-1 inline-flex items-center gap-1" style={{ color: "var(--text-4)" }}>
                      <History size={11} />{t("arc.dTimeline")}
                    </div>
                    <div className="rounded-lg divide-y" style={{ border: "1px solid var(--border)", borderColor: "var(--border)" }}>
                      {timeline.map((e) => (
                        <div key={`${e.code}-${e.at}`} className="flex items-center justify-between gap-3 px-3 py-1.5 text-xs">
                          <StatusChip status={e.code} label={stName(e.code)} />
                          <span className="tabular-nums" style={{ color: "var(--text-3)" }}>{fmtDateTime(e.at) || e.at}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {Array.isArray(d.comments) && d.comments.length > 0 && (
                  <div className="sm:col-span-2">
                    <div className="text-[10px] uppercase tracking-wider mb-1 inline-flex items-center gap-1" style={{ color: "var(--text-4)" }}>
                      <MessageSquare size={11} />{tpl(t("arc.dComments"), { n: d.comments.length })}
                    </div>
                    <div className="rounded-lg divide-y" style={{ border: "1px solid var(--border)", borderColor: "var(--border)" }}>
                      {d.comments.map((c, i) => (
                        <div key={c?.id ?? i} className="px-3 py-2 text-xs">
                          <div className="flex items-center justify-between gap-3 mb-0.5">
                            <span style={{ color: "var(--text-2)" }}>{commentWho(c) || "—"}</span>
                            <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{fmtDateTime(commentWhen(c))}</span>
                          </div>
                          {commentText(c) && <div style={{ color: "var(--text-1)" }}>{commentText(c)}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </Modal>
      )}
      {toast.node}
    </Layout>
  );
}
