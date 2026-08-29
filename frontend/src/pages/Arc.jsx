import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  RefreshCw, CalendarClock, Download, Loader2, ClipboardList, Building2, Users, Tag,
  CircleDot, Layers, Siren, AlertTriangle, FileText, ExternalLink, Bot, Paperclip,
  Phone, Timer, CheckCircle2, ShieldCheck, Hourglass, Hash, UserRound, PlayCircle,
  PlugZap, Zap, MessageSquare, History, Smartphone, Boxes, Link2Off,
  Clock, Wrench, UserCog, BarChart3,
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
// A cell is its CODE here as everywhere else — the workshop name is never
// printed (utils/cellName.js). Where a code alone is thin, the second fact is
// the cell's LEADER, whose name rides on the same `cells` map the owner columns
// read, so the label and the column name one person the same way.
import { cellLabel } from "../utils/cellName";
import ArcAnalysis from "../components/arc/ArcAnalysis";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonCard } from "../components/ui/Skeleton";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import { usePersistentState } from "../hooks/usePersistentState";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { inTelegram } from "../utils/session";
import { shortPerson } from "../utils/personName";
import { toneFor, dotStyle, stripeColor, statusName, hexA, STATUS_CODES, C_DONE, C_DOING, C_OVERDUE, C_GREY } from "../utils/arcStatus";

// ── constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;
// The filter value standing for «this division names no cell» — the twin of
// services/arc_cells.NO_CELL. Every real code is four digits, so a word can
// never collide with one.
const NO_CELL = "none";
// The same word in the OWNER dimension — the twin of services/arc_cells.NO_OWNER:
// «this ticket reaches no brigadir» / «…no leader», which is what a blank owner
// column on the register means. Every real owner pick is a numeric id, so a word
// cannot collide with one.
const NO_OWNER = "none";
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
// author, brigade) give way to this platform's org chart, and everything they
// carried is one press away in the row's modal. Category stays, because it is
// the one IT-side fact this view's own columns depend on — `due` IS
// `created_at + category.ftime`, so the deadline standing two columns along
// cannot be read without it.
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
  { key: "category",    labelKey: "arc.colCategory",    icon: Tag,           sortKey: "category_name" },
  { key: "description", labelKey: "arc.colDescription", icon: FileText },
  { key: "status",      labelKey: "arc.colStatus",      icon: CircleDot,     sortKey: "status" },
  { key: "due",         labelKey: "arc.colDue",         icon: Timer,         sortKey: "due" },
  { key: "started",     labelKey: "arc.colStarted",     icon: PlayCircle,    sortKey: "started_at" },
  // Closed and how long it took stand as TWO columns, as they do on the
  // register: they are one sentence to read but two facts to compare, and a
  // merged cell can be sorted by only one of them — on a register read for
  // lateness, the duration is the half the reader ranks by.
  { key: "closed",      labelKey: "arc.colClosed",      icon: CheckCircle2,  sortKey: "closed_at" },
  { key: "hours",       labelKey: "arc.colHours",       icon: Hourglass,     sortKey: "hours_to_close", align: "right" },
  { key: "source",      labelKey: "arc.colSource",      icon: Bot,           align: "center" },
];

const labelKeyOf = (key) =>
  (CELL_COLS.find((c) => c.key === key) || COLS.find((c) => c.key === key))?.labelKey;

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

const IMG_RE = /\.(jpe?g|png|webp|gif|bmp|heic)(\?|$)/i;

// ── people ───────────────────────────────────────────────────────────────────
// Long surname-first DB names would wrap the two owner columns to three lines
// each and push the row's own facts off a phone — so they render as
// «R. Shuxrat» via the shared `shortPerson` (utils/personName.js, ONE rule
// with the analysis charts), applied AFTER `tl()` so the initial is in the
// same script as the name beside it. Full spelling stays in the cell's title.

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
const parts = (fmt, d) => Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));

// Three-letter month names per language (the map the Kaizen deadlines read).
// A numeric month beside a numeric day is two figures the eye has to tell
// apart — «26.08.26» is three of them, and which one is the year depends on
// knowing the convention. A word in the middle names itself and cannot be read
// in the wrong order.
const MONTHS_SHORT = {
  uz:      ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"],
  uz_cyrl: ["Янв", "Фев", "Мар", "Апр", "Май", "Июн", "Июл", "Авг", "Сен", "Окт", "Ноя", "Дек"],
  ru:      ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"],
  en:      ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

// «25 Avg, 2026 14:45» (Tashkent) — THE stamp on this page. One format for the
// table cells, the detail card, the timeline, the comments and the header pill,
// so a figure is never re-read in a second shape; and the year stays FOUR
// digits, because the register spans several and a two-digit one is one more
// thing to decode. This replaced the dd.mm.yy / dd.mm.yyyy pair — the compact
// form existed only to fit the column, and the tooltips that used to spell it
// out went with it.
const fmtDT = (iso, lang) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(+d)) return "";
  const p = parts(tsFmt, d);
  const mn = (MONTHS_SHORT[lang] || MONTHS_SHORT.en)[Number(p.month) - 1];
  return `${p.day} ${mn}, ${p.year} ${p.hour}:${p.minute}`;
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
// Status chip: hue = the backend's derived state, ring + dashed border = the
// ticket is waiting on somebody (utils/arcStatus.js). Both marks, always —
// «Yakunlangan» and «Tasdiq kutilmoqda» share a hue by definition, so the ring
// is the only thing that tells them apart.
function StatusChip({ status, label }) {
  const tone = toneFor(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{
        background: hexA(tone.color, 0.14),
        color: tone.color,
        border: `1px ${tone.waiting ? "dashed" : "solid"} ${hexA(tone.color, 0.45)}`,
      }}
      title={label || ""}
    >
      <span className="rounded-full flex-shrink-0" style={dotStyle(status, 7)} />
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
  // Which MODE the open tab is read in — the table («Ma'lumotlar») or the
  // charts («Tahlil»). Both read the SAME filtered tickets, and each tab keeps
  // its own analysis set, so the toggle changes how the register is shown and
  // nothing about what is in it.
  const [mode, setMode] = usePersistentState("arc_mode", "data");
  // «Yacheykalar bo'yicha» asks whose cell a ticket is on, so it OPENS on the
  // cells this platform can actually answer that for — the ones with a
  // brigadir assigned. A cell with none reaches no unit, no shift and no
  // leader, so its rows carry three blank owner columns and read as a hole in
  // the register rather than as an answer.
  //
  // «manager» is that opening scope, «leader» reads the same question one
  // level down (only the cells a lider is on), and «all» lifts the narrowing
  // entirely. The two levels are separate questions about the same cell, not
  // a stricter form of each other: plenty of cells legitimately have a
  // brigadir and no leader. Whatever the scope hides is counted on the card
  // with the way out of it, and the toggle lives on the CELLS tab only —
  // «Barchasi» is IT's register as filed, where our org chart is not the
  // question. The storage key is versioned because the value used to be
  // «assigned»/«all», and a saved «assigned» would come back selecting
  // nothing at all.
  const [owner, setOwner] = usePersistentState("arc_owner2", "manager");
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
  // Brigadir and lider are MULTI-select: the question they answer is «these
  // people», which is one pick or five, and one of their values is not a person
  // at all — NO_OWNER, «Biriktirilmagan», the tickets that reach nobody. The
  // storage keys are versioned (…s) because the value used to be a single id
  // string and a saved one would come back as the wrong SHAPE, which no guard
  // below can tell from a real pick.
  const [sups, setSups] = usePersistentState("arc_sups", []);
  const [leaders, setLeaders] = usePersistentState("arc_leaders", []);
  const [brigada, setBrigada] = usePersistentState("arc_brigada", "");
  const [author, setAuthor] = usePersistentState("arc_author", "");
  const [urgent, setUrgent] = usePersistentState("arc_urgent", "all");
  const [overdue, setOverdue] = usePersistentState("arc_overdue", "all");
  const [source, setSource] = usePersistentState("arc_source", "all");
  const [q, setQ] = usePersistentState("arc_q", "");
  const [page, setPage] = usePersistentState("arc_page", 1);
  const [sort, setSort] = usePersistentState("arc_sort", { key: "created_at", dir: "desc" });
  const [openId, setOpenId] = useState(null);

  // ── meta (sync state) ─────────────────────────────────────────────────────
  const metaQ = useQuery({
    queryKey: ["arc-meta"],
    queryFn: () => api.get("/api/arc/meta", { params: { options: 0 } }).then((r) => r.data),
    // While a sync runs the meta row is the progress feed — poll it. The
    // filter lists are NOT on it (`options: 0`): they move with every pick and
    // this call moves with nothing, so putting them here would recompute all
    // of them every 2.5 s and re-fetch the progress feed on every filter
    // change. They come from /facets below.
    refetchInterval: (query) => (query.state.data?.sync?.running ? 2500 : false),
  });
  const meta = metaQ.data;
  const sync = meta?.sync;
  const running = !!sync?.running;
  const configured = meta?.configured !== false;
  const hasData = (sync?.row_count || 0) > 0;

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
    ...(sups.length ? { manager: sups } : {}),
    ...(leaders.length ? { leader: leaders } : {}),
    ...(brigada ? { brigada: [brigada] } : {}),
    ...(author ? { author: [author] } : {}),
    ...(urgent !== "all" ? { urgent } : {}),
    ...(overdue !== "all" ? { overdue } : {}),
    ...(source !== "all" ? { source } : {}),
    // «Yacheykalar bo'yicha» asks whose cell a ticket is on — a question a
    // ticket whose division names no cell cannot answer, and whose cell,
    // brigadir and leader columns could only ever be blank. So that tab
    // narrows the register to the tickets that name one. It goes in the shared
    // filter set on purpose: the table, the KPI strip, the row count and the
    // export then all describe the same rows. What it hides is not dropped in
    // silence — `stats.hidden_no_cell` counts it and the card header says so,
    // with the way over to «Barchasi», where those tickets are.
    ...(tab === "cells" ? { cells_only: true } : {}),
    // …and, unless the reader asked for every cell, to the ones an owner is on
    // at the level the toggle names. Same shape and the same reason as the line
    // above — a shared narrowing, so the table, the KPI strip, the option
    // lists, the charts and the export all describe one set of rows, with
    // `stats.hidden_unassigned` naming what is left out at that same level and
    // the toggle standing right beside the count.
    ...(tab === "cells" && owner !== "all" ? { owner_scope: owner } : {}),
    q: q.trim() || undefined,
  }), [tab, owner, dateFrom, dateTo, state, statusSel, catSel, division, cell, shift, sups, leaders,
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
  // The filter option lists, over exactly the rows the table holds — every
  // page of them, not the page on screen. Same filter set as /list and /stats,
  // so a count beside a name and the table under it can never describe two
  // different registers. `keepPreviousData` keeps the previous lists on screen
  // while the new ones land: an empty list for one render would read as «this
  // dimension has nothing» and, worse, would take the chain guards' picks with
  // it.
  const facetsQ = useQuery({
    queryKey: ["arc-facets", filters],
    queryFn: () => api.get("/api/arc/facets", { params: filters }).then((r) => r.data),
    enabled: configured && hasData,
    placeholderData: keepPreviousData,
  });
  const options = facetsQ.data || {};
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
      qc.invalidateQueries({ queryKey: ["arc-facets"] });
      qc.invalidateQueries({ queryKey: ["arc-analysis"] });
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
  // The chip / option text for one cell: the code, plus its leader when the
  // registry knows one.
  const cellDisplay = (code) => {
    if (code === NO_CELL) return t("arc.cNoCell");
    return cellLabel(code, tl(cellByCode[code]?.cell?.leader || ""));
  };

  // ── the org chain: shift → brigadir → leader → cell ───────────────────────
  // Each level lists only what the levels ABOVE it leave, and says so — a list
  // shortened by a parent must never read as a dimension with nothing in it.
  // The lists come off the register's own cells (the backend counts them in
  // TICKETS over the current view), so every name offered is a narrowing with
  // rows behind it. /facets already applies the parent picks; the filtering
  // below is the same rule on the client, which is what keeps a pick from
  // surviving a render on the previous scope's lists while the new ones land.
  const org = options.org || {};
  const supAll = org.managers || [];
  const leadAll = org.leaders || [];
  const optsReady = !!facetsQ.data;
  // One level's picks against one row's owner: no pick is no narrowing, a named
  // id matches its own unit, and NO_OWNER matches an owner this platform cannot
  // name. The exact twin of `arc_cells._owner_ok` — the server decides, this
  // keeps a pick from surviving a render on the previous scope's lists, and the
  // two must give the same answer about the same row.
  const ownerOk = (sel, value) => (!sel.length ? true
    : value == null || value === "" ? sel.includes(NO_OWNER) : sel.includes(String(value)));
  const supOpts = useMemo(
    () => supAll.filter((m) => !shift || String(m.shift) === shift),
    [supAll, shift]);
  const leadOpts = useMemo(
    () => leadAll.filter((l) => (!shift || String(l.shift) === shift)
      && ownerOk(sups, l.manager_id)),
    [leadAll, shift, sups]); // eslint-disable-line react-hooks/exhaustive-deps
  // Whether the org chain is narrowed to a NAMED unit. A ticket whose division
  // names no cell reaches no unit, no shift and no leader, so it can never
  // satisfy a named pick; but «Biriktirilmagan» is precisely the bucket it
  // falls in, so the «Yacheykasiz» cell pick stands beside that one instead of
  // being dropped by it.
  const orgNamed = !!shift || sups.some((v) => v !== NO_OWNER)
    || leaders.some((v) => v !== NO_OWNER);
  const cellPickOpts = useMemo(
    () => cellOpts.filter((o) => (!shift || String(o.sh) === shift)
      && ownerOk(sups, o.mgr) && ownerOk(leaders, o.lead)),
    [cellOpts, shift, sups, leaders]); // eslint-disable-line react-hooks/exhaustive-deps
  const supById = useMemo(() => Object.fromEntries(supAll.map((m) => [String(m.id), m])), [supAll]);
  const leadById = useMemo(() => Object.fromEntries(leadAll.map((l) => [String(l.id), l])), [leadAll]);

  // A pick the shortened list below no longer offers is DROPPED: a control
  // naming a value the page cannot show is worse than a reset. Guarded on the
  // options actually having arrived — before /meta answers, every list is
  // empty and clearing on that would wipe the reader's saved scope. NO_OWNER is
  // never dropped: it names no unit, so no shortened list of units can retire
  // it, and the register can always answer it.
  const keepPicks = (sel, opts) =>
    sel.filter((v) => v === NO_OWNER || opts.some((o) => String(o.id) === v));
  useEffect(() => {
    if (!optsReady) return;
    const keep = keepPicks(sups, supOpts);
    if (keep.length !== sups.length) setSups(keep);
  }, [optsReady, supOpts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!optsReady) return;
    const keep = keepPicks(leaders, leadOpts);
    if (keep.length !== leaders.length) setLeaders(keep);
  }, [optsReady, leadOpts]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!optsReady || !cell) return;
    // «No cell» is a division this platform's org chart cannot reach at all, so
    // it cannot survive a pick that NAMES a unit — nor the «by cells» view,
    // which shows only the tickets that name a cell and would answer this pick
    // with an empty table the reader has no way to explain.
    if (cell === NO_CELL ? (orgNamed || tab === "cells")
      : !cellPickOpts.some((o) => o.code === cell)) setCell("");
  }, [optsReady, cellPickOpts, orgNamed, tab]); // eslint-disable-line react-hooks/exhaustive-deps
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
  // The count beside an option — how many tickets in the CURRENT VIEW carry
  // it, if this one control were the only thing changed. Not the whole mirror
  // (the reader would be sent to a category the period holds nothing of) and
  // not the page on screen (a list that rewrote itself on every page turn).
  const withCount = (label, n) => (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate">{label}</span>
      {n != null && <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{n}</span>}
    </span>
  );

  // Every list is narrowed twice over, and both narrowings SAY SO — a short
  // list must never read as a dimension the register has nothing in.
  //  · by the levels ABOVE it in the org chain (`note`), naming only the
  //    NEAREST one — that is the control the reader has to touch to get a
  //    missing name back. A level narrowed to nothing offers the way out
  //    (`empty`) instead of an empty box.
  //  · by the view itself — the period, the search and every other pick, which
  //    is what the counts are over. That one is a standing sentence on every
  //    list (`viewNote`) whenever anything at all is narrowing the page.
  const shiftLabel = shift ? `${t("arc.shift")} ${shift}` : null;
  // An owner pick names a person, or names the bucket of tickets that reach
  // none — and a multi-select says how many rather than running the names off
  // the chip, exactly as the status and category filters already do.
  const ownerName = (by, v) => (v === NO_OWNER ? t("arc.unassigned")
    : tl(by[v]?.name || `#${v}`));
  const ownerDisplay = (sel, by) => (!sel.length ? null
    : sel.length === 1 ? ownerName(by, sel[0])
    : `${sel.length} ${t("filter.selected2")}`);
  const supLabel = ownerDisplay(sups, supById);
  const leadLabel = ownerDisplay(leaders, leadById);
  // «Biriktirilmagan» is an option like any other and sits LAST — it names no
  // person, and a list of people should read as a list of people first. It is
  // offered while the view holds a ticket that reaches nobody, and kept while
  // it is picked even at 0, exactly as a named unit is.
  const ownerValues = (opts, noneN, sel) => {
    const vals = opts.map((o) => String(o.id));
    if (noneN > 0 || sel.includes(NO_OWNER)) vals.push(NO_OWNER);
    return vals;
  };
  const supValues = ownerValues(supOpts, org.managers_none || 0, sups);
  const leadValues = ownerValues(leadOpts, org.leaders_none || 0, leaders);
  const ownerRow = (by, v, noneN) => (v === NO_OWNER
    ? withCount(
        <span className="inline-flex items-center gap-1.5 min-w-0" style={{ color: "var(--text-3)" }}>
          <Link2Off size={10} className="flex-shrink-0" />
          <span className="truncate">{t("arc.unassigned")}</span>
        </span>,
        noneN || 0)
    : withCount(tl(by[v]?.name || `#${v}`), by[v]?.count));
  // Asking for the tickets that reach nobody, while «Yacheykalar bo'yicha» is
  // standing on its own «Biriktirilgan» scope, asks for rows that scope has
  // already removed — an empty table with nothing on screen explaining it. So
  // the pick lifts that scope, and lifts it VISIBLY: the toggle beside the
  // tabs moves to «Barcha yacheykalar», which is the sentence for what the
  // register is now showing.
  const pickOwner = (set) => (vals) => {
    set(vals);
    if (vals.includes(NO_OWNER) && tab === "cells" && owner === "assigned") setOwner("all");
  };
  const chainNote = (parents, n) => {
    const p = parents.filter(Boolean).pop();
    return p ? `${t("arc.narrowedBy").replace("{x}", p)} · ${n}` : null;
  };
  // Anything at all narrowing the page — the tab included, since «Yacheykalar
  // bo'yicha» drops every ticket whose division names no cell.
  const viewNarrowed = !!(dateFrom || dateTo || q.trim() || state !== "all"
    || statusSel.length || catSel.length || division || cell || shift || sups.length
    || leaders.length || brigada || author || urgent !== "all" || overdue !== "all"
    || source !== "all" || tab === "cells");
  const viewNote = viewNarrowed ? t("arc.optsInView") : null;
  // The chain note and the view note are two different facts, so they get two
  // lines rather than one run-on sentence.
  const listNote = (chain) => {
    const parts = [chain, viewNote].filter(Boolean);
    if (!parts.length) return null;
    return parts.length === 1 ? parts[0] : <>{parts[0]}<br />{parts[1]}</>;
  };
  const widenTo = (label, onClick) => (
    <div className="text-center py-1">
      <p className="text-xs mb-2" style={{ color: "var(--text-3)" }}>{t("arc.noneInScope")}</p>
      <Button size="sm" variant="secondary" onClick={onClick}>{label}</Button>
    </div>
  );

  // Pinning follows the OPEN TAB: thirteen filters can never pass the panel's
  // fit check, so the two or three controls the reader steers with stay inline
  // — and which those are is the tab's own question. «Yacheykalar bo'yicha»
  // pins the org chain its columns show (smena → brigadir → lider); «Barchasi»
  // pins the register's own axes (bo'lim, kategoriya, holat). Every filter
  // still narrows BOTH tabs, the KPI strip and the export — only where its
  // control sits changes with the tab.
  const sections = [
    {
      key: "shift", icon: Clock, label: t("arc.fShift"), group: grpWho, pinned: tab === "cells",
      active: !!shift,
      display: shiftLabel || "",
      onClear: () => setShift(""),
      render: () => (
        <SegmentedToggle fill value={shift || "all"} onChange={(v) => setShift(v === "all" ? "" : v)}
          options={[["all", t("arc.shiftAll")], ["1", `${t("arc.shift")} 1`], ["2", `${t("arc.shift")} 2`]]} />
      ),
    },
    {
      key: "sup", icon: Wrench, label: t("arc.fSup"), group: grpWho, pinned: tab === "cells",
      active: sups.length > 0,
      display: supLabel || "",
      onClear: () => setSups([]),
      render: () => (
        <OptsFilter searchable opts={supValues} sel={sups} onChange={pickOwner(setSups)}
          note={listNote(chainNote([shiftLabel], supValues.length))}
          empty={shiftLabel ? widenTo(t("arc.shiftAll"), () => setShift("")) : null}
          labelOf={(v) => ownerName(supById, v)}
          render={(v) => ownerRow(supById, v, org.managers_none)} />
      ),
    },
    {
      key: "leader", icon: UserCog, label: t("arc.fLeader"), group: grpWho, pinned: tab === "cells",
      active: leaders.length > 0,
      display: leadLabel || "",
      onClear: () => setLeaders([]),
      render: () => (
        <OptsFilter searchable opts={leadValues} sel={leaders} onChange={pickOwner(setLeaders)}
          note={listNote(chainNote([shiftLabel, supLabel], leadValues.length))}
          empty={supLabel ? widenTo(t("arc.allSups"), () => setSups([]))
            : shiftLabel ? widenTo(t("arc.shiftAll"), () => setShift("")) : null}
          labelOf={(v) => ownerName(leadById, v)}
          render={(v) => ownerRow(leadById, v, org.leaders_none)} />
      ),
    },
    {
      key: "cell", icon: Boxes, label: t("arc.fCell"), group: grpWho,
      active: !!cell,
      display: cell ? cellDisplay(cell) : "",
      onClear: () => setCell(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          note={listNote(chainNote([shiftLabel, supLabel, leadLabel], cellPickOpts.length))}
          empty={leadLabel ? widenTo(t("arc.allLeaders"), () => setLeaders([]))
            : supLabel ? widenTo(t("arc.allSups"), () => setSups([]))
            : shiftLabel ? widenTo(t("arc.shiftAll"), () => setShift("")) : null}
          opts={[
            { value: "", label: t("arc.allCells") },
            ...cellPickOpts.map((o) => {
              const leader = tl(o.cell?.leader || "");
              return {
                value: o.code,
                title: cellLabel(o.code, leader),
                label: withCount(
                  <span className="inline-flex items-center gap-1.5 min-w-0">
                    <span className="tabular-nums flex-shrink-0">{o.code}</span>
                    {leader && <span className="truncate" style={{ color: "var(--text-4)" }}>{shortPerson(leader)}</span>}
                  </span>,
                  o.count,
                ),
              };
            }),
            // Last, and named — the divisions this rule cannot resolve are a
            // real scope, not a gap in the list. They belong to no unit, so an
            // org pick above takes them off the list rather than offering a
            // scope that can only ever be empty.
            ...(options.no_cell_count && !orgNamed && tab !== "cells"
              ? [{ value: NO_CELL, title: t("arc.cNoCell"),
                   label: withCount(t("arc.cNoCell"), options.no_cell_count) }]
              : []),
          ]}
          value={cell}
          onChange={(v) => setCell(v || "")} />
      ),
    },
    {
      key: "division", icon: Building2, label: t("arc.fDivision"), group: grpWho, pinned: tab === "all",
      active: !!division,
      display: division ? (divById[division]?.name || division) : "",
      onClear: () => setDivision(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          note={viewNote}
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
          note={viewNote}
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
          note={viewNote}
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
      key: "status", icon: CircleDot, label: t("arc.fStatus"), group: grpWhat, pinned: tab === "all",
      active: statusSel.length > 0,
      display: statusSel.length === 1 ? stName(statusSel[0]) : `${statusSel.length} ${t("filter.selected2")}`,
      onClear: () => setStatusSel([]),
      render: () => (
        <OptsFilter opts={statusValues} sel={statusSel} onChange={setStatusSel} note={viewNote}
          labelOf={(v) => stName(v)}
          render={(v) => (
            <span className="inline-flex items-center gap-1.5 min-w-0">
              <span className="rounded-full flex-shrink-0" style={dotStyle(Number(v), 9)} />
              <span className="truncate">{stName(v)}</span>
              {statusCount[v] != null && <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{statusCount[v]}</span>}
            </span>
          )} />
      ),
    },
    {
      key: "category", icon: Tag, label: t("arc.fCategory"), group: grpWhat, pinned: tab === "all",
      active: catSel.length > 0,
      display: catSel.length === 1 ? (catById[catSel[0]]?.name || catSel[0]) : `${catSel.length} ${t("filter.selected2")}`,
      onClear: () => setCatSel([]),
      render: () => (
        <OptsFilter searchable={catOpts.length > 8} opts={catOpts.map((c) => String(c.id))} sel={catSel} onChange={setCatSel}
          note={viewNote}
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
    setShift(""); setSups([]); setLeaders([]);
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
    return (
      <CellLink id={c?.id} title={cellLabel(r.cell_code, tl(c?.leader || ""))}>
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
    if (name) return <span style={{ color: "var(--text-2)" }} title={name}>{shortPerson(name)}</span>;
    const why = !r.cell_code ? t("arc.cNoCellHint")
      : !cellMap[r.cell_code] ? t("arc.cUnknown")
      : t("arc.ownerNone");
    return <span style={{ color: "var(--text-4)" }} title={why}>—</span>;
  };

  // Row → cell, keyed by column — hide/reorder needs no markup change of its own.
  const listCell = (key, r) => {
    switch (key) {
      case "sup":
        return <td key={key} className="px-3 py-2 whitespace-nowrap">{ownerCell(r, "sup")}</td>;
      case "leader":
        return <td key={key} className="px-3 py-2 whitespace-nowrap">{ownerCell(r, "leader")}</td>;
      case "num":
        return <td key={key} className="px-3 py-2 font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{r.request_num ?? "—"}</td>;
      case "created":
        return <td key={key} className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{fmtDT(r.created_at, lang) || "—"}</td>;
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
              <span className="tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDT(r.due, lang) || "—"}</span>
              {(r.overdue_now || r.late) && <RedBadge icon={AlertTriangle}>{t("arc.late")}</RedBadge>}
            </span>
          </td>
        );
      case "started":
        return <td key={key} className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{fmtDT(r.started_at, lang) || "—"}</td>;
      case "closed":
        return <td key={key} className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{fmtDT(r.closed_at, lang) || "—"}</td>;
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
        const strip = late ? C_OVERDUE : stripeColor(r.status);
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
                  {fmtDT(r.due, lang) || "—"}
                  {late && <RedBadge icon={AlertTriangle}>{t("arc.late")}</RedBadge>}
                </span>
              </Fact>
              {tab === "cells" ? (
                <>
                  <Fact label={t("arc.colClosed")}>
                    <span className="tabular-nums">{fmtDT(r.closed_at, lang) || "—"}</span>
                  </Fact>
                  {/* Its own fact, as on the table. An open ticket shows the
                      bare «—» rather than a figure that would read as zero. */}
                  <Fact label={t("arc.colHours")}>
                    <span className="tabular-nums">{r.closed_at ? fmtHours(r.hours_to_close) : "—"}</span>
                  </Fact>
                </>
              ) : (
                <Fact label={t("arc.colCreated")}><span className="tabular-nums">{fmtDT(r.created_at, lang) || "—"}</span></Fact>
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
    const leader = tl(c?.leader || "");
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <CellLink id={c?.id}><span className="tabular-nums">{row.cell_code}</span></CellLink>
        {leader && <span className="text-[11px]" style={{ color: "var(--text-4)" }}>· {leader}</span>}
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
    const exportKeys = visibleCols.map((c) => c.key);
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
  const lastSynced = fmtDT(sync?.last_synced, lang);
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
              panel, export + column picker on the right. The text search sits
              INSIDE the table card — it filters that table's rows and nothing
              else, so it belongs on the table, not on the page bar. */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <DateRangePicker dateFrom={dateFrom} dateTo={dateTo} setDateFrom={setDateFrom} setDateTo={setDateTo}
              max={today} compactLabel triggerClassName="px-3 py-2 text-sm" />
            <FilterPanel sections={sections} onClearAll={clearAll} />
            <div className="flex-1" />
            <Button size="lg" variant="secondary" loading={exporting}
              disabled={listLoading || total === 0}
              icon={!exporting ? <Download size={14} /> : null}
              onClick={runExport}>
              <span className="hidden sm:inline">{t("arc.export")}</span>
            </Button>
            {/* The picker describes the REGISTER's columns, so it is offered on
                that tab only, and only while the table is the thing on screen —
                in analysis mode it would configure something nobody can see.
                Hidden below `sm:` too — that is where TableCard swaps the table
                for stacked cards, and a picker over a table nobody can see is a
                control with no effect. */}
            {tab === "all" && mode === "data" && <ColumnsPicker
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

          {/* ── data / analysis mode — under the KPI strip, so the headline
              numbers stay on screen either way. Both modes read the SAME
              filtered tickets; the toggle changes nothing about scope, only
              how it is shown. In analysis mode the text search keeps a
              control HERE (it lives on the table's toolbar otherwise): a
              filter that narrows every chart must never become invisible. */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <SegmentedToggle value={mode} onChange={setMode}
              options={[
                { value: "data", label: (<span className="inline-flex items-center gap-1.5"><ClipboardList size={12} />{t("arc.modeData")}</span>) },
                { value: "analysis", label: (<span className="inline-flex items-center gap-1.5"><BarChart3 size={12} />{t("arc.modeAnalysis")}</span>) },
              ]} />
            {/* WHICH cells this view answers for — the ones a brigadir is on
                (the default), the ones a lider is on, or every cell the
                register names. It is a scope, so it narrows both modes and
                every figure in them; it belongs to the cells tab's question
                alone, so «Barchasi» never shows it. The two owner segments
                carry the SAME marks the brigadir and lider columns and filters
                carry, so the toggle names the two people the table already
                names rather than inventing a third vocabulary for them. */}
            {tab === "cells" && (
              <SegmentedToggle value={owner} onChange={setOwner}
                options={[
                  { value: "manager", label: (<span className="inline-flex items-center gap-1.5"><Wrench size={12} />{t("arc.ownerManager")}</span>), title: t("arc.ownerManagerHint") },
                  { value: "leader", label: (<span className="inline-flex items-center gap-1.5"><UserCog size={12} />{t("arc.ownerLeader")}</span>), title: t("arc.ownerLeaderHint") },
                  { value: "all", label: (<span className="inline-flex items-center gap-1.5"><Boxes size={12} />{t("arc.ownerAll")}</span>), title: t("arc.ownerAllHint") },
                ]} />
            )}
            {mode === "analysis" && (
              <SearchInput value={q} onChange={setQ} placeholder={t("arc.search")}
                className="ml-auto w-full sm:w-72" />
            )}
          </div>

          {mode === "analysis" ? (
            <ArcAnalysis view={tab} filters={filters} enabled={configured && hasData} />
          ) : (
          <>
          {/* ONE table for both views. They differ only in which columns are on
              it — the rows, the filters, the page and the sort are the same
              register, which is the whole reason the two are tabs and not two
              pages. The cells view is narrower, so it needs less minimum width
              before it has to scroll. */}
          <TableCard
            icon={tab === "cells" ? Boxes : ClipboardList}
            title={tab === "cells" ? t("arc.tabCells") : t("arc.listTitle")}
            wrap
            minWidth={tab === "cells" ? 1040 : 1200}
            mobile={mobileList}
            mobileCards
            toolbar={<SearchInput value={q} onChange={setQ} placeholder={t("arc.search")} className="w-full" />}
            right={
              <span className="text-[11px] inline-flex items-center gap-1.5 flex-wrap justify-end" style={{ color: "var(--text-4)" }}>
                <span className="tabular-nums whitespace-nowrap">
                  {tpl(t("arc.count"), { n: total.toLocaleString("ru-RU") })}
                </span>
                {/* What this view is not showing, and where it is. A count that
                    silently omitted these would read as the whole register. */}
                {tab === "cells" && (stats?.hidden_no_cell || 0) > 0 && (
                  <button type="button" className="underline underline-offset-2 whitespace-nowrap text-left"
                    style={{ color: "var(--text-3)" }}
                    title={t("arc.cellsOnlyHiddenHint")}
                    onClick={(e) => { e.stopPropagation(); setTab("all"); setCell(NO_CELL); }}>
                    · {tpl(t("arc.cellsOnlyHidden"), { n: stats.hidden_no_cell.toLocaleString("ru-RU") })}
                  </button>
                )}
                {/* The other half of what this view leaves out, and the way to
                    it: the tickets on cells nobody is assigned to. Counted and
                    named for the same reason as the line above — a count that
                    silently omitted them would read as the whole register.
                    The SENTENCE follows the level the toggle is reading, since
                    the number alone cannot say which person is missing, and a
                    chip naming the brigadir over a leader-scoped count would be
                    the page disagreeing with itself. */}
                {tab === "cells" && (stats?.hidden_unassigned || 0) > 0 && (
                  <button type="button" className="underline underline-offset-2 whitespace-nowrap text-left"
                    style={{ color: "var(--text-3)" }}
                    title={t(owner === "leader" ? "arc.leaderlessHiddenHint" : "arc.unassignedHiddenHint")}
                    onClick={(e) => { e.stopPropagation(); setOwner("all"); }}>
                    · {tpl(t(owner === "leader" ? "arc.leaderlessHidden" : "arc.unassignedHidden"),
                           { n: stats.hidden_unassigned.toLocaleString("ru-RU") })}
                  </button>
                )}
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
          )}
        </>
      )}

      {/* ── ticket detail ── */}
      {openId != null && (
        <Modal
          onClose={() => setOpenId(null)}
          maxWidth="max-w-2xl"
          icon={<ClipboardList size={16} />}
          title={d ? tpl(t("arc.detailTitle"), { num: d.request_num ?? "—", division: d.division_name || "—" }) : "…"}
          subtitle={d ? [d.category_name, fmtDT(d.created_at, lang)].filter(Boolean).join(" · ") : ""}
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
                <Fact label={t("arc.dCreated")}><span className="tabular-nums">{fmtDT(d.created_at, lang) || "—"}</span></Fact>
                <Fact label={t("arc.dDue")}><span className="tabular-nums">{fmtDT(d.due, lang) || "—"}</span></Fact>
                <Fact label={t("arc.dStarted")}>
                  <span className="tabular-nums">{fmtDT(d.started_at, lang) || "—"}</span>
                  {d.hours_to_start != null && (
                    <span style={{ color: "var(--text-4)" }}> · {tpl(t("arc.dAfterHours"), { n: fmtHours(d.hours_to_start) })}</span>
                  )}
                </Fact>
                <Fact label={t("arc.dFinished")}>
                  <span className="tabular-nums">{fmtDT(d.finished_at, lang) || "—"}</span>
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
                          <span className="tabular-nums" style={{ color: "var(--text-3)" }}>{fmtDT(e.at, lang) || e.at}</span>
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
                            <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{fmtDT(commentWhen(c), lang)}</span>
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
