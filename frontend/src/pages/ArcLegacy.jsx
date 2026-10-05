// /arc-legacy — ARC's OLD login API (username + password → bearer), the
// register /arc itself showed until 25 Aug 2026. Revived on 25 Sep 2026 as a
// page of its own: its own endpoints (/api/arc-legacy), query keys (arcl-*),
// saved filters (arcl_*), column prefs (arcl.list.cols) and strings (arcl.*),
// so nothing here can collide with the current /arc page.
//
// From 5 Oct 2026 it is TWO tabs over one register, exactly as /arc is:
// «Barcha so'rovlar» and «Yacheykalar bo'yicha». A ticket reaches our cell
// through the new app's `warehouse_name` (from 29 Sep 2026, the cell's Verifix
// code in front — services/arc_cells.warehouse_code_expr), which the backend
// serves as `cell_code` with a `cells` map naming each cell's brigadir and
// leader.
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  RefreshCw, CalendarClock, Download, Loader2, ClipboardList, Store, UserCog, Tag,
  CircleDot, Layers, Siren, AlertTriangle, PackageCheck, Camera, FileText, ExternalLink,
  MapPin, Phone, Check, Timer, CheckCircle2, ShieldCheck, Hourglass, Hash, UserRound,
  PlugZap, Zap, ListChecks, Radar, Boxes, Wrench, Clock, Link2Off, Building2, BarChart3,
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
import { cellLabel } from "../utils/cellName";
import { shortPerson } from "../utils/personName";
import { useTranslit } from "../utils/transliterate";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonCard } from "../components/ui/Skeleton";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import { usePersistentState } from "../hooks/usePersistentState";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import LegacyApiPanel from "../components/arc/LegacyApiPanel";
import ArcAnalysis from "../components/arc/ArcAnalysis";
import { inTelegram } from "../utils/session";
import { toneFor, hexA, C_DONE, C_DOING, C_OVERDUE, C_GREY } from "../utils/arcStatusLegacy";

// ── constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;
// «This warehouse names no cell» (or the ticket carries none — every ticket
// filed before 29 Sep 2026) — the twin of services/arc_cells.NO_CELL.
const NO_CELL = "none";
// «This ticket reaches no brigadir / no leader» — services/arc_cells.NO_OWNER.
const NO_OWNER = "none";
const COL_PREF_KEY = "arcl.list.cols";
const TZ = "Asia/Tashkent";

// Register column catalog — the ONE source of order, labels, header icons and
// sort keys for the ARC table. Cells render through a per-key switch
// (`listCell` below), so the ColumnsPicker's hide/reorder comes for free.
// `sortKey` is the backend `sort` field; a column without one is not sortable.
const COLS = [
  { key: "num",         labelKey: "arcl.colNum",         icon: Hash,          sortKey: "request_num" },
  { key: "created",     labelKey: "arcl.colCreated",     icon: CalendarClock, sortKey: "created_at" },
  { key: "branch",      labelKey: "arcl.colBranch",      icon: Store,         sortKey: "branch_name" },
  // The workshop the ticket is about, and the cell its code names — side by
  // side, because the cell is read OUT of that name.
  { key: "warehouse",   labelKey: "arcl.colWarehouse",   icon: Building2,     sortKey: "warehouse_name" },
  { key: "cell",        labelKey: "arcl.colCell",        icon: Boxes,         sortKey: "cell_code" },
  { key: "category",    labelKey: "arcl.colCategory",    icon: Tag,           sortKey: "category_name" },
  { key: "description", labelKey: "arcl.colDescription", icon: FileText },
  { key: "master",      labelKey: "arcl.colMaster",      icon: UserCog,       sortKey: "master_name" },
  { key: "status",      labelKey: "arcl.colStatus",      icon: CircleDot,     sortKey: "normalized_status" },
  { key: "due",         labelKey: "arcl.colDue",         icon: Timer,         sortKey: "deadline" },
  { key: "closed",      labelKey: "arcl.colClosed",      icon: CheckCircle2,  sortKey: "closed_at" },
  { key: "hours",       labelKey: "arcl.colHours",       icon: Hourglass,     sortKey: "hours_to_close", align: "right" },
  { key: "sap",         labelKey: "arcl.colSap",         icon: PackageCheck,  align: "center" },
  { key: "evidence",    labelKey: "arcl.colEvidence",    icon: Camera,        align: "center" },
  { key: "client",      labelKey: "arcl.colClient",      icon: UserRound },
];
// The ticket number and its status are the row's identity — never hideable.
const LOCKED_COLS = new Set(["num", "status"]);

// «Yacheykalar bo'yicha» is the SAME register read through another question —
// whose cell is this ticket on, and where does it stand — so it is a fixed,
// curated column set (/arc's CELL_COLS), not offered to the ColumnsPicker: a
// curated answer the reader can dismantle column by column is not one. The
// IT-side columns (branch, master, client) give way to our org chart; they stay
// one press away in the row's modal. `sup` and `leader` come off the payload's
// cells map, so no SQL orders by them and they carry no sortKey.
const CELL_COLS = [
  { key: "num",         labelKey: "arcl.colNum",         icon: Hash,          sortKey: "request_num" },
  { key: "sup",         labelKey: "arcl.colSup",         icon: Wrench },
  { key: "leader",      labelKey: "arcl.colLeader",      icon: UserCog },
  { key: "cell",        labelKey: "arcl.colCell",        icon: Boxes,         sortKey: "cell_code" },
  { key: "category",    labelKey: "arcl.colCategory",    icon: Tag,           sortKey: "category_name" },
  { key: "description", labelKey: "arcl.colDescription", icon: FileText },
  { key: "status",      labelKey: "arcl.colStatus",      icon: CircleDot,     sortKey: "normalized_status" },
  { key: "due",         labelKey: "arcl.colDue",         icon: Timer,         sortKey: "deadline" },
  { key: "closed",      labelKey: "arcl.colClosed",      icon: CheckCircle2,  sortKey: "closed_at" },
  { key: "hours",       labelKey: "arcl.colHours",       icon: Hourglass,     sortKey: "hours_to_close", align: "right" },
];

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

// ── dates ────────────────────────────────────────────────────────────────────
// ARC timestamps arrive as UTC ISO strings; every reader here is in Tashkent,
// so they are rendered in that zone explicitly rather than in whatever zone
// the browser happens to sit in (a laptop abroad must show the same clock the
// branch saw).
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

// ── small presentational bits ────────────────────────────────────────────────
// Status chip: traffic-light tone by vocabulary (utils/arcStatusLegacy.js); a NEW
// ticket's grey is dashed so it never reads as cancelled.
function StatusChip({ status, color, label }) {
  const tone = toneFor(status, color);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-semibold whitespace-nowrap"
      style={{
        background: hexA(tone.color, 0.14),
        color: tone.color,
        border: `1px ${tone.dashed ? "dashed" : "solid"} ${hexA(tone.color, 0.45)}`,
      }}
      title={label || status || ""}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: tone.color }} />
      {label || status || "—"}
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

export default function ArcLegacy() {
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const toast = useToast();
  const qc = useQueryClient();

  const today = localISO(new Date());

  // ── page state (persisted, like every page) ───────────────────────────────
  // No default period. A register answers «what do we have?», and a 30-day
  // window is a filter the reader never chose — it made a full mirror look
  // like a thin one. Both bounds empty = every ticket ever filed.
  // Which VIEW is on screen — the register («all») or the same tickets read by
  // the production cell their warehouse names («cells»).
  const [tab, setTab] = usePersistentState("arcl_tab", "all");
  // «Yacheykalar bo'yicha» opens on the cells a brigadir is on («manager»);
  // «leader» reads one level down, «all» lifts the narrowing (/arc's rule).
  const [owner, setOwner] = usePersistentState("arcl_owner", "manager");
  // Which MODE the open tab is read in — the table («Ma'lumotlar») or /arc's
  // charts («Tahlil»). Both read the SAME filtered tickets.
  const [mode, setMode] = usePersistentState("arcl_mode", "data");
  const [dateFrom, setDateFrom] = usePersistentState("arcl_date_from", "");
  const [dateTo, setDateTo] = usePersistentState("arcl_date_to", "");
  const [state, setState] = usePersistentState("arcl_state", "all");
  const [statusSel, setStatusSel] = usePersistentState("arcl_status", []);
  const [catSel, setCatSel] = usePersistentState("arcl_category", []);
  const [branch, setBranch] = usePersistentState("arcl_branch", "");
  const [master, setMaster] = usePersistentState("arcl_master", "");
  // The org chain — shift → brigadir → leader → cell — carried onto IT's
  // tickets by the cell code. Brigadir and leader are multi-select and one of
  // their values is NO_OWNER, «Biriktirilmagan».
  const [cell, setCell] = usePersistentState("arcl_cell", "");
  const [shift, setShift] = usePersistentState("arcl_shift", "");
  const [sups, setSups] = usePersistentState("arcl_sups", []);
  const [leaders, setLeaders] = usePersistentState("arcl_leaders", []);
  const [urgent, setUrgent] = usePersistentState("arcl_urgent", "all");
  const [overdue, setOverdue] = usePersistentState("arcl_overdue", "all");
  const [sap, setSap] = usePersistentState("arcl_sap", "all");
  const [q, setQ] = usePersistentState("arcl_q", "");
  const [page, setPage] = usePersistentState("arcl_page", 1);
  const [sort, setSort] = usePersistentState("arcl_sort", { key: "created_at", dir: "desc" });
  const [openId, setOpenId] = useState(null);
  const [apiOpen, setApiOpen] = useState(false);
  const isAdmin = useAuth()?.auth?.role === "admin";

  // ── meta (options + sync state) ───────────────────────────────────────────
  const metaQ = useQuery({
    queryKey: ["arcl-meta"],
    queryFn: () => api.get("/api/arc-legacy/meta").then((r) => r.data),
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
    ...(branch ? { branch: [branch] } : {}),
    ...(master ? { master: [master] } : {}),
    ...(cell ? { cell: [cell] } : {}),
    ...(shift ? { shift: [shift] } : {}),
    ...(sups.length ? { manager: sups } : {}),
    ...(leaders.length ? { leader: leaders } : {}),
    ...(urgent !== "all" ? { urgent } : {}),
    ...(overdue !== "all" ? { overdue } : {}),
    ...(sap !== "all" ? { sap } : {}),
    // The cells tab asks whose cell a ticket is on — a ticket whose warehouse
    // names none cannot answer, so that tab narrows to the ones that do, and
    // (unless lifted) to the cells an owner is on. Both ride the SHARED filter
    // set, so the table, the KPI strip and the export describe the same rows;
    // what they hide is counted back on /stats and named on the card.
    ...(tab === "cells" ? { cells_only: true } : {}),
    ...(tab === "cells" && owner !== "all" ? { owner_scope: owner } : {}),
    q: q.trim() || undefined,
  }), [tab, owner, dateFrom, dateTo, state, statusSel, catSel, branch, master, cell, shift, sups, leaders,
       urgent, overdue, sap, q]);
  const sortParam = `${sort.key}:${sort.dir}`;
  const listParams = useMemo(
    () => ({ ...filters, page, page_size: PAGE_SIZE, sort: sortParam }),
    [filters, page, sortParam]
  );

  const statsQ = useQuery({
    queryKey: ["arcl-stats", filters],
    queryFn: () => api.get("/api/arc-legacy/stats", { params: filters }).then((r) => r.data),
    enabled: configured && hasData,
    placeholderData: keepPreviousData,
  });
  const listQ = useQuery({
    queryKey: ["arcl-list", listParams],
    queryFn: () => api.get("/api/arc-legacy/list", { params: listParams }).then((r) => r.data),
    enabled: configured && hasData,
    placeholderData: keepPreviousData,
  });

  // A failed /stats or /list must not masquerade as an empty register (skeleton
  // tiles forever + «no matching requests» for a 500). Toast once per failure —
  // the error toast persists until dismissed, so the reason survives.
  const errMsg = (e) => e?.response?.data?.detail || e?.message || "";
  useEffect(() => {
    if (statsQ.isError) toast.error(`${t("arcl.loadFailed")}: ${errMsg(statsQ.error)}`);
  }, [statsQ.isError, statsQ.error]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (listQ.isError) toast.error(`${t("arcl.loadFailed")}: ${errMsg(listQ.error)}`);
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
    mutationFn: () => api.post("/api/arc-legacy/refresh").then((r) => r.data),
    onSuccess: () => {
      // A sync can finish INSIDE one meta-poll interval, so `running` may never
      // be observed true — arm the finish detector by hand or a fast sync would
      // end with no toast and stale tables.
      prevRunning.current = true;
      qc.invalidateQueries({ queryKey: ["arcl-meta"] });
    },
    onError: (e) => toast.error(`${t("arcl.syncFailed")}: ${e?.response?.data?.detail || e?.message || ""}`),
  });
  const prevRunning = useRef(false);
  useEffect(() => {
    if (prevRunning.current && !running) {
      // A sync just finished — pull fresh numbers and report the outcome.
      qc.invalidateQueries({ queryKey: ["arcl-stats"] });
      qc.invalidateQueries({ queryKey: ["arcl-list"] });
      qc.invalidateQueries({ queryKey: ["arcl-meta"] });
      qc.invalidateQueries({ queryKey: ["arcl-analysis"] });
      if (sync?.ok === false) toast.error(`${t("arcl.syncFailed")}: ${sync?.message || ""}`);
      else toast.success(t("arcl.syncDone"));
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
  // «Barcha so'rovlar» is the reader's own arrangement; «Yacheykalar bo'yicha»
  // the fixed curated set.
  const visibleCols = useMemo(() => {
    if (tab === "cells") return CELL_COLS;
    const hiddenSet = new Set(colCfg.hidden);
    return colCfg.order.map((k) => COLS.find((c) => c.key === k)).filter((c) => c && !hiddenSet.has(c.key));
  }, [colCfg, tab]);
  // One sort serves both views; a switch that lands on a key the new view has
  // no column for falls back to newest-first rather than an order nobody can
  // see or undo.
  useEffect(() => {
    const offered = new Set(visibleCols.map((c) => c.sortKey).filter(Boolean));
    if (!offered.has(sort.key) && sort.key !== "created_at") {
      setSort({ key: "created_at", dir: "desc" });
    }
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── option lookups ────────────────────────────────────────────────────────
  const statusOpts = options.statuses || [];
  const statusByValue = useMemo(() => Object.fromEntries(statusOpts.map((s) => [s.value, s])), [statusOpts]);
  const catOpts = options.categories || [];
  const catById = useMemo(() => Object.fromEntries(catOpts.map((c) => [c.id, c])), [catOpts]);
  const branchOpts = options.branches || [];
  const branchById = useMemo(() => Object.fromEntries(branchOpts.map((b) => [b.id, b])), [branchOpts]);
  const masterOpts = options.masters || [];
  const masterById = useMemo(() => Object.fromEntries(masterOpts.map((m) => [m.id, m])), [masterOpts]);
  const statusLabel = (v) => statusByValue[v]?.label || v || "—";

  // ── the org chain: shift → brigadir → leader → cell (/arc's wiring) ───────
  // Each level lists only what the levels ABOVE it leave, and says so. Every
  // option carries its own place in the chain (`sh`, `mgr`, `lead`), so the
  // narrowing is done here, off the one /meta payload.
  const cellOpts = options.cells || [];
  const cellByCode = useMemo(() => Object.fromEntries(cellOpts.map((c) => [c.code, c])), [cellOpts]);
  const org = options.org || {};
  const supAll = org.managers || [];
  const leadAll = org.leaders || [];
  const optsReady = !!meta;
  // One level's picks against one row's owner — the twin of arc_cells._owner_ok.
  const ownerOk = (sel, value) => (!sel.length ? true
    : value == null || value === "" ? sel.includes(NO_OWNER) : sel.includes(String(value)));
  const supOpts = useMemo(
    () => supAll.filter((m) => !shift || String(m.shift) === shift),
    [supAll, shift]);
  const leadOpts = useMemo(
    () => leadAll.filter((l) => (!shift || String(l.shift) === shift) && ownerOk(sups, l.manager_id)),
    [leadAll, shift, sups]);
  // Narrowed to a NAMED unit? A ticket naming no cell reaches no unit, so it
  // can never satisfy such a pick — but it IS what «Biriktirilmagan» picks.
  const orgNamed = !!shift || sups.some((v) => v !== NO_OWNER) || leaders.some((v) => v !== NO_OWNER);
  const cellPickOpts = useMemo(
    () => cellOpts.filter((o) => (!shift || String(o.sh) === shift)
      && ownerOk(sups, o.mgr) && ownerOk(leaders, o.lead)),
    [cellOpts, shift, sups, leaders]);
  const supById = useMemo(() => Object.fromEntries(supAll.map((m) => [String(m.id), m])), [supAll]);
  const leadById = useMemo(() => Object.fromEntries(leadAll.map((l) => [String(l.id), l])), [leadAll]);
  // A pick the shortened list no longer offers is DROPPED — a control naming a
  // value the page cannot show is worse than a reset. Only once /meta has
  // answered (before it every list is empty), and never NO_OWNER, which names
  // no unit.
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
    // «No cell» cannot survive a pick naming a unit, nor the cells tab, which
    // shows only tickets that name a cell.
    if (cell === NO_CELL ? (orgNamed || tab === "cells")
      : !cellPickOpts.some((o) => o.code === cell)) setCell("");
  }, [optsReady, cellPickOpts, orgNamed, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  // The chip / option text for one cell: its code, plus its leader.
  const cellDisplay = (code) => (code === NO_CELL ? t("arcl.cNoCell")
    : cellLabel(code, tl(cellByCode[code]?.cell?.leader || "")));

  // Three-way yes/no/all toggle used by urgent, overdue and SAP.
  const yesNoOpts = [["all", t("general.all")], ["yes", t("common.yes")], ["no", t("common.no")]];
  const yesNoDisplay = (v) => (v === "yes" ? t("common.yes") : v === "no" ? t("common.no") : "");
  const stateLabels = {
    all: t("arcl.stateAll"), open: t("arcl.stateOpen"), closed: t("arcl.stateClosed"), cancelled: t("arcl.stateCancelled"),
  };

  const grpWho = t("arcl.grpWho");
  const grpWhat = t("arcl.grpWhat");
  // The count beside an option — how many non-missing tickets carry it.
  const withCount = (label, n) => (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate">{label}</span>
      {n != null && <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{n}</span>}
    </span>
  );

  // Chain notes: a list shortened by a parent names the NEAREST parent, and a
  // level narrowed to nothing offers the way back.
  const shiftLabel = shift ? `${t("arcl.shift")} ${shift}` : null;
  const ownerName = (by, v) => (v === NO_OWNER ? t("arcl.unassigned") : tl(by[v]?.name || `#${v}`));
  const ownerDisplay = (sel, by) => (!sel.length ? null
    : sel.length === 1 ? ownerName(by, sel[0])
    : `${sel.length} ${t("filter.selected2")}`);
  const supLabel = ownerDisplay(sups, supById);
  const leadLabel = ownerDisplay(leaders, leadById);
  // «Biriktirilmagan» sits LAST, offered while a ticket reaches nobody and kept
  // while it is picked.
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
          <span className="truncate">{t("arcl.unassigned")}</span>
        </span>,
        noneN || 0)
    : withCount(tl(by[v]?.name || `#${v}`), by[v]?.count));
  // Asking for the tickets that reach nobody while the cells tab stands on an
  // owner scope asks for rows that scope removed — so the pick lifts it, and
  // the toggle moves to «Barcha yacheykalar» to say so.
  const pickOwner = (set) => (vals) => {
    set(vals);
    if (vals.includes(NO_OWNER) && tab === "cells" && owner !== "all") setOwner("all");
  };
  const chainNote = (parentsList, n) => {
    const p = parentsList.filter(Boolean).pop();
    return p ? `${t("arcl.narrowedBy").replace("{x}", p)} · ${n}` : null;
  };
  const widenTo = (label, onClick) => (
    <div className="text-center py-1">
      <p className="text-xs mb-2" style={{ color: "var(--text-3)" }}>{t("arcl.noneInScope")}</p>
      <Button size="sm" variant="secondary" onClick={onClick}>{label}</Button>
    </div>
  );

  // The org chain leads the «Kim va qayerda» group. On the cells tab its three
  // levels stay inline (pinned) — they are the columns that tab shows.
  const sections = [
    {
      key: "shift", icon: Clock, label: t("arcl.fShift"), group: grpWho, pinned: tab === "cells",
      active: !!shift,
      display: shiftLabel || "",
      onClear: () => setShift(""),
      render: () => (
        <SegmentedToggle fill value={shift || "all"} onChange={(v) => setShift(v === "all" ? "" : v)}
          options={[["all", t("arcl.shiftAll")], ["1", `${t("arcl.shift")} 1`], ["2", `${t("arcl.shift")} 2`]]} />
      ),
    },
    {
      key: "sup", icon: Wrench, label: t("arcl.fSup"), group: grpWho, pinned: tab === "cells",
      active: sups.length > 0,
      display: supLabel || "",
      onClear: () => setSups([]),
      render: () => (
        <OptsFilter searchable opts={supValues} sel={sups} onChange={pickOwner(setSups)}
          note={chainNote([shiftLabel], supValues.length)}
          empty={shiftLabel ? widenTo(t("arcl.shiftAll"), () => setShift("")) : null}
          labelOf={(v) => ownerName(supById, v)}
          render={(v) => ownerRow(supById, v, org.managers_none)} />
      ),
    },
    {
      key: "leader", icon: UserCog, label: t("arcl.fLeader"), group: grpWho, pinned: tab === "cells",
      active: leaders.length > 0,
      display: leadLabel || "",
      onClear: () => setLeaders([]),
      render: () => (
        <OptsFilter searchable opts={leadValues} sel={leaders} onChange={pickOwner(setLeaders)}
          note={chainNote([shiftLabel, supLabel], leadValues.length)}
          empty={supLabel ? widenTo(t("arcl.allSups"), () => setSups([]))
            : shiftLabel ? widenTo(t("arcl.shiftAll"), () => setShift("")) : null}
          labelOf={(v) => ownerName(leadById, v)}
          render={(v) => ownerRow(leadById, v, org.leaders_none)} />
      ),
    },
    {
      key: "cell", icon: Boxes, label: t("arcl.fCell"), group: grpWho,
      active: !!cell,
      display: cell ? cellDisplay(cell) : "",
      onClear: () => setCell(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          note={chainNote([shiftLabel, supLabel, leadLabel], cellPickOpts.length)}
          empty={leadLabel ? widenTo(t("arcl.allLeaders"), () => setLeaders([]))
            : supLabel ? widenTo(t("arcl.allSups"), () => setSups([]))
            : shiftLabel ? widenTo(t("arcl.shiftAll"), () => setShift("")) : null}
          opts={[
            { value: "", label: t("arcl.allCells") },
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
            // Last, and named: the tickets whose warehouse names no cell are a
            // real scope — offered on the register only, and only while no
            // level above names a unit.
            ...(options.no_cell_count && !orgNamed && tab !== "cells"
              ? [{ value: NO_CELL, title: t("arcl.cNoCell"),
                   label: withCount(t("arcl.cNoCell"), options.no_cell_count) }]
              : []),
          ]}
          value={cell}
          onChange={(v) => setCell(v || "")} />
      ),
    },
    {
      key: "branch", icon: Store, label: t("arcl.fBranch"), group: grpWho,
      active: !!branch,
      display: branch ? (branchById[branch]?.name || branch) : "",
      onClear: () => setBranch(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          opts={[{ value: "", label: t("arcl.allBranches") },
            ...branchOpts.map((b) => ({ value: b.id, label: withCount(b.name, b.count), title: b.name }))]}
          value={branch}
          onChange={(v) => setBranch(v || "")} />
      ),
    },
    {
      key: "master", icon: UserCog, label: t("arcl.fMaster"), group: grpWho,
      active: !!master,
      display: master ? (masterById[master]?.name || master) : "",
      onClear: () => setMaster(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          opts={[{ value: "", label: t("arcl.allMasters") },
            ...masterOpts.map((m) => ({ value: m.id, label: withCount(m.name, m.count), title: m.name }))]}
          value={master}
          onChange={(v) => setMaster(v || "")} />
      ),
    },
    {
      key: "state", icon: Layers, label: t("arcl.fState"), group: grpWhat,
      active: state !== "all",
      display: state !== "all" ? stateLabels[state] : "",
      onClear: () => setState("all"),
      render: () => (
        <SegmentedToggle fill value={state} onChange={setState}
          options={[["all", stateLabels.all], ["open", stateLabels.open], ["closed", stateLabels.closed], ["cancelled", stateLabels.cancelled]]} />
      ),
    },
    {
      key: "status", icon: CircleDot, label: t("arcl.fStatus"), group: grpWhat,
      active: statusSel.length > 0,
      display: statusSel.length === 1 ? statusLabel(statusSel[0]) : `${statusSel.length} ${t("filter.selected2")}`,
      onClear: () => setStatusSel([]),
      render: () => (
        <OptsFilter opts={statusOpts.map((s) => s.value)} sel={statusSel} onChange={setStatusSel}
          render={(v) => {
            const s = statusByValue[v];
            return (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: toneFor(v, s?.color).color }} />
                <span className="truncate">{s?.label || v}</span>
                {s?.count != null && <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{s.count}</span>}
              </span>
            );
          }} />
      ),
    },
    {
      key: "category", icon: Tag, label: t("arcl.fCategory"), group: grpWhat,
      active: catSel.length > 0,
      display: catSel.length === 1 ? (catById[catSel[0]]?.name || catSel[0]) : `${catSel.length} ${t("filter.selected2")}`,
      onClear: () => setCatSel([]),
      render: () => (
        <OptsFilter searchable={catOpts.length > 8} opts={catOpts.map((c) => c.id)} sel={catSel} onChange={setCatSel}
          labelOf={(id) => catById[id]?.name || id}
          render={(id) => {
            const c = catById[id];
            return (
              <span className="inline-flex items-center gap-1.5 min-w-0">
                {c?.is_urgent ? <Zap size={10} className="flex-shrink-0" style={{ color: C_OVERDUE }} /> : null}
                <span className="truncate">{c?.name || id}</span>
                {c?.count != null && <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{c.count}</span>}
              </span>
            );
          }} />
      ),
    },
    {
      key: "urgent", icon: Zap, label: t("arcl.fUrgent"), group: grpWhat,
      active: urgent !== "all", display: yesNoDisplay(urgent),
      onClear: () => setUrgent("all"),
      render: () => <SegmentedToggle fill value={urgent} onChange={setUrgent} options={yesNoOpts} />,
    },
    {
      key: "overdue", icon: Siren, label: t("arcl.fOverdue"), group: grpWhat,
      active: overdue !== "all", display: yesNoDisplay(overdue),
      onClear: () => setOverdue("all"),
      render: () => <SegmentedToggle fill value={overdue} onChange={setOverdue} options={yesNoOpts} />,
    },
    {
      key: "sap", icon: PackageCheck, label: t("arcl.fSap"), group: grpWhat,
      active: sap !== "all", display: yesNoDisplay(sap),
      onClear: () => setSap("all"),
      render: () => <SegmentedToggle fill value={sap} onChange={setSap} options={yesNoOpts} />,
    },
  ];
  const clearAll = () => {
    setBranch(""); setMaster(""); setState("all"); setStatusSel([]); setCatSel([]);
    setUrgent("all"); setOverdue("all"); setSap("all");
    setShift(""); setSups([]); setLeaders([]); setCell("");
  };

  // ── register ──────────────────────────────────────────────────────────────
  const list = listQ.data;
  const rows = list?.rows || [];
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

  // The cell a ticket's warehouse NAMES — the CODE alone, a CellLink to
  // /cells/:id (it stops propagation, so the row still opens the ticket). «No
  // cell» is said, never blank: a warehouse with no code, or a ticket filed
  // before 29 Sep 2026 that carries no warehouse at all.
  const cellMap = list?.cells || {};
  const cellCell = (r) => {
    if (!r.cell_code) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: "var(--text-4)" }}
          title={t("arcl.cNoCellHint")}>
          <Link2Off size={11} />{t("arcl.cNoCell")}
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
  // The cell's owners — brigadir and leader — off the same cells map. A ticket
  // reaches no owner three ways (no cell, a code the registry does not know, a
  // cell nobody is assigned to); all three are «—», the reason on hover.
  const ownerCell = (r, field) => {
    const name = r.cell_code ? tl(cellMap[r.cell_code]?.[field] || "") : "";
    if (name) return <span style={{ color: "var(--text-2)" }} title={name}>{shortPerson(name)}</span>;
    const why = !r.cell_code ? t("arcl.cNoCellHint")
      : !cellMap[r.cell_code] ? t("arcl.cUnknown")
      : t("arcl.ownerNone");
    return <span style={{ color: "var(--text-4)" }} title={why}>—</span>;
  };

  // Row → cell, keyed by column — hide/reorder needs no markup change of its own.
  const listCell = (key, r) => {
    switch (key) {
      case "sup":
        return <td key={key} className="px-3 py-2 whitespace-nowrap">{ownerCell(r, "sup")}</td>;
      case "leader":
        return <td key={key} className="px-3 py-2 whitespace-nowrap">{ownerCell(r, "leader")}</td>;
      case "warehouse":
        return <td key={key} className="px-3 py-2" style={{ color: "var(--text-2)" }}>{r.warehouse_name || "—"}</td>;
      case "cell":
        return <td key={key} className="px-3 py-2 whitespace-nowrap">{cellCell(r)}</td>;
      case "num":
        return <td key={key} className="px-3 py-2 font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{r.request_num ?? "—"}</td>;
      case "created":
        return <td key={key} className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }} title={fmtDateTime(r.created_at)}>{fmtShort(r.created_at) || "—"}</td>;
      case "branch":
        return <td key={key} className="px-3 py-2" style={{ color: "var(--text-1)" }}>{r.branch_name || "—"}</td>;
      case "category":
        return (
          <td key={key} className="px-3 py-2">
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <span style={{ color: "var(--text-2)" }}>{r.category_name || "—"}</span>
              {r.category_is_urgent && <RedBadge icon={Zap}>{t("arcl.urgent")}</RedBadge>}
            </span>
          </td>
        );
      case "description":
        return (
          <td key={key} className="px-3 py-2 max-w-[280px]" style={{ color: "var(--text-2)" }} title={r.description || ""}>
            {truncate(r.description, 60) || "—"}
          </td>
        );
      case "master":
        return <td key={key} className="px-3 py-2" style={{ color: "var(--text-2)" }}>{r.master_name || "—"}</td>;
      case "status":
        return (
          <td key={key} className="px-3 py-2">
            <StatusChip status={r.normalized_status} color={r.status_color} label={statusLabel(r.normalized_status)} />
          </td>
        );
      case "due":
        return (
          <td key={key} className="px-3 py-2 whitespace-nowrap">
            <span className="inline-flex items-center gap-1.5">
              <span className="tabular-nums" style={{ color: "var(--text-2)" }} title={fmtDateTime(r.due)}>{fmtShort(r.due) || "—"}</span>
              {(r.overdue_now || r.late) && <RedBadge icon={AlertTriangle}>{t("arcl.late")}</RedBadge>}
            </span>
          </td>
        );
      case "closed":
        return <td key={key} className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }} title={fmtDateTime(r.closed_at)}>{fmtShort(r.closed_at) || "—"}</td>;
      case "hours":
        return <td key={key} className="px-3 py-2 text-right tabular-nums" style={{ color: "var(--text-2)" }}>{fmtHours(r.hours_to_close)}</td>;
      case "sap":
        return (
          <td key={key} className="px-3 py-2 text-center">
            {r.sended_to_sap ? <Check size={14} className="inline" style={{ color: C_DONE }} /> : <span style={{ color: "var(--text-4)" }}>—</span>}
          </td>
        );
      case "evidence":
        return (
          <td key={key} className="px-3 py-2 text-center">
            <span className="inline-flex items-center gap-1.5" style={{ color: "var(--text-3)" }}>
              {r.photo_report && <Camera size={13} title={t("arcl.dPhoto")} />}
              {r.document_url && <FileText size={13} title={t("arcl.dDocument")} />}
              {!r.photo_report && !r.document_url && <span style={{ color: "var(--text-4)" }}>—</span>}
            </span>
          </td>
        );
      case "client":
        return <td key={key} className="px-3 py-2" style={{ color: "var(--text-2)" }}>{r.client_name || "—"}</td>;
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
          {t("arcl.noMatch")}
          {tab === "cells" && <div className="mt-1" style={{ color: "var(--text-3)" }}>{t("arcl.cellsSince")}</div>}
        </div>
      )}
      {!listLoading && rows.map((r) => {
        const late = r.overdue_now || r.late;
        const strip = late ? C_OVERDUE : toneFor(r.normalized_status, r.status_color).color;
        return (
          <div key={r.remote_id || r.id}
            onClick={() => setOpenId(r.remote_id)}
            className="rounded-xl p-3 flex flex-col gap-2 cursor-pointer"
            style={{ ...cardStyle, borderLeft: `3px solid ${strip}` }}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>№{r.request_num ?? "—"}</span>
              <StatusChip status={r.normalized_status} color={r.status_color} label={statusLabel(r.normalized_status)} />
            </div>
            <div className="text-xs font-medium" style={{ color: "var(--text-1)" }}>{r.branch_name || "—"}</div>
            <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{cellCell(r)}</div>
            {/* The card answers the tab's own question: on «Yacheykalar
                bo'yicha» whose cell it is, on the register what kind of job and
                who is working it. */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {tab === "cells" ? (
                <>
                  <Fact label={t("arcl.colSup")}>{ownerCell(r, "sup")}</Fact>
                  <Fact label={t("arcl.colLeader")}>{ownerCell(r, "leader")}</Fact>
                </>
              ) : (
                <>
                  <Fact label={t("arcl.colCategory")}>
                    <span className="inline-flex items-center gap-1 flex-wrap">
                      {r.category_name || "—"}
                      {r.category_is_urgent && <RedBadge icon={Zap}>{t("arcl.urgent")}</RedBadge>}
                    </span>
                  </Fact>
                  <Fact label={t("arcl.colMaster")}>{r.master_name || "—"}</Fact>
                </>
              )}
              <Fact label={t("arcl.colDue")}>
                <span className="inline-flex items-center gap-1 flex-wrap tabular-nums">
                  {fmtShort(r.due) || "—"}
                  {late && <RedBadge icon={AlertTriangle}>{t("arcl.late")}</RedBadge>}
                </span>
              </Fact>
              <Fact label={t("arcl.colCreated")}><span className="tabular-nums">{fmtShort(r.created_at) || "—"}</span></Fact>
            </div>
          </div>
        );
      })}
    </>
  );

  // ── «not connected» diagnostics (admin-only endpoint; others 403 → nothing) ─
  // The platform has no shell, so the page itself must say WHERE the process
  // looked and which credential NAMES it found — never a value.
  const diagQ = useQuery({
    queryKey: ["arcl-diag"],
    queryFn: () => api.get("/api/arc-legacy/diag").then((r) => r.data),
    enabled: !!meta && !configured,
    retry: false,
  });
  const diag = diagQ.data;

  // ── detail modal ──────────────────────────────────────────────────────────
  const detailQ = useQuery({
    queryKey: ["arcl-request", openId],
    queryFn: () => api.get(`/api/arc-legacy/requests/${openId}`).then((r) => r.data),
    enabled: openId != null,
  });
  // The clicked row, straight from the list payload — the modal paints from it
  // without waiting on the network.
  const openRow = useMemo(() => rows.find((r) => r.remote_id === openId) || null, [rows, openId]);
  const d = detailQ.data || openRow;
  // The fetched card carries its own one-entry cells map; before it lands the
  // page's map already names the row that was clicked.
  const dCell = d?.cell_code ? (detailQ.data?.cells || cellMap)[d.cell_code] : null;
  const ownerFact = (field) => {
    const name = tl(dCell?.[field] || "");
    if (name) return name;
    const why = !d?.cell_code ? t("arcl.cNoCellHint") : !dCell ? t("arcl.cUnknown") : t("arcl.ownerNone");
    return <span style={{ color: "var(--text-4)" }} title={why}>—</span>;
  };
  const [photoBroken, setPhotoBroken] = useState(false);
  useEffect(() => { setPhotoBroken(false); }, [openId]);

  // ── export ────────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      const via = await exportXlsx("/api/arc-legacy/export.xlsx", {
        body: {
          ...filters, sort: sortParam,
          columns: visibleCols.map((c) => c.key),
          // Headers in the viewer's language — the backend's own labels are an
          // English fallback only.
          labels: Object.fromEntries(visibleCols.map((c) => [c.key, t(c.labelKey)])),
          // Which tab the file came off (it names the file), and the language
          // the brigadir and leader names are spelled in on screen.
          view: tab === "cells" ? "cells" : "list",
          lang,
        },
        fallbackName: tab === "cells" ? `arc_legacy_cells_${today}.xlsx` : `arc_legacy_requests_${today}.xlsx`,
      });
      toast.success(via === "download" ? t("arcl.exportDownloaded") : t("arcl.exportSent"));
    } catch (e) {
      toast.error(`${t("arcl.exportFailed")}: ${e?.response?.data?.detail || e?.message || ""}`);
    } finally {
      setExporting(false);
    }
  };

  // ── header bits ───────────────────────────────────────────────────────────
  const lastSynced = fmtDateTime(sync?.last_synced);
  const refreshBtn = (
    <Button size="lg" variant="secondary" loading={running || refreshMut.isPending}
      disabled={!configured}
      icon={!(running || refreshMut.isPending) ? <RefreshCw size={14} /> : null}
      onClick={() => refreshMut.mutate()}>
      {/* Button hides its children while `loading` (overlay spinner keeps the
          width stable), so the sync progress lives in the pill instead. */}
      <span className="hidden sm:inline">{t("arcl.refresh")}</span>
    </Button>
  );
  // The last-synced pill doubles as the live progress feed during a sync —
  // a background walk with nothing but a spinner reads as frozen.
  const syncPill = running ? (
    <>
      <Loader2 size={14} className="animate-spin flex-shrink-0" style={{ color: "var(--brand-text)" }} />
      {t("arcl.refreshing")}
      <span className="tabular-nums" style={{ color: "var(--text-2)" }}>
        {tpl(t("arcl.syncProgress"), { done: sync?.progress_done ?? 0, total: sync?.progress_total || "…" })}
      </span>
    </>
  ) : (
    <>
      <CalendarClock size={14} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />
      {t("arcl.lastSynced")}: <span style={{ color: "var(--text-3)" }}>{lastSynced || t("arcl.never")}</span>
    </>
  );

  const isBoot = metaQ.isLoading;
  const loadError = metaQ.isError;

  const kpiTiles = stats ? [
    { label: t("arcl.kShown"), value: (stats.shown ?? 0).toLocaleString("ru-RU"), icon: ClipboardList },
    { label: t("arcl.kOpen"), value: (stats.open ?? 0).toLocaleString("ru-RU"), icon: Hourglass, color: C_DOING },
    { label: t("arcl.kOverdue"), value: (stats.overdue ?? 0).toLocaleString("ru-RU"), icon: Siren,
      color: (stats.overdue ?? 0) > 0 ? C_OVERDUE : C_GREY, danger: (stats.overdue ?? 0) > 0 },
    { label: t("arcl.kClosed"), value: (stats.closed ?? 0).toLocaleString("ru-RU"), icon: CheckCircle2, color: C_DONE },
    { label: t("arcl.kOnTime"), value: stats.on_time_pct == null ? "—" : `${Math.round(stats.on_time_pct)}%`, icon: ShieldCheck,
      // The share is computed over closed tickets that CARRY a deadline — a
      // ticket without one is neither on time nor late — so name that count.
      sub: tpl(t("arcl.kOnTimeSub"), { n: (stats.closed_with_due ?? 0).toLocaleString("ru-RU") }) },
    { label: t("arcl.kMedian"), value: fmtHours(stats.median_hours), icon: Timer, sub: t("arcl.kMedianSub") },
  ] : [];

  return (
    <Layout title={t("arcl.title")}>
      {/* header: title + last-synced + refresh */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{t("arcl.title")}</h2>
          <p className="text-xs sm:text-sm mt-0.5" style={{ color: "var(--text-3)" }}>{t("arcl.subtitle")}</p>
          <p className="sm:hidden text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: "var(--text-4)" }}>
            {syncPill}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs" style={{ ...cardStyle, color: "var(--text-2)" }}>
            {syncPill}
          </span>
          {isAdmin && (
            <Button size="lg" variant="secondary" icon={<Radar size={14} />}
              title={t("arcl.api.title")} onClick={() => setApiOpen(true)}>
              <span className="hidden sm:inline">{t("arcl.api.short")}</span>
            </Button>
          )}
          {refreshBtn}
        </div>
      </div>

      {isAdmin && apiOpen && (
        <LegacyApiPanel open onClose={() => setApiOpen(false)} sync={sync}
          onProbed={() => {
            // A probe can change WHAT the next walk fetches — say so, and let
            // the operator start that walk from the same place.
            toast.success(t("arcl.api.probed"));
            qc.invalidateQueries({ queryKey: ["arcl-meta"] });
          }} />
      )}

      {loadError && (
        <div className="rounded-2xl px-4 py-3 text-xs mb-4 flex items-center justify-between gap-3 flex-wrap"
          style={{ background: hexA(C_OVERDUE, 0.1), color: C_OVERDUE, border: `1px solid ${hexA(C_OVERDUE, 0.33)}` }}>
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <AlertTriangle size={14} className="flex-shrink-0" />
            <span className="min-w-0">{metaQ.error?.response?.data?.detail || t("arcl.loadFailed")}</span>
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
        /* the credential is missing on the server — nothing here can work */
        <div className="rounded-2xl" style={cardStyle}>
          <EmptyState icon={PlugZap} height="h-56" showUploadLink={false}
            title={t("arcl.notConfiguredTitle")} message={t("arcl.notConfigured")} />
          {diag && (
            /* admin diagnostics: file → credential names → parse problems */
            <div className="border-t px-4 py-3 text-xs space-y-2" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{t("arcl.diagTitle")}</div>
              <div className="flex flex-wrap gap-x-2">
                <span style={{ color: "var(--text-3)" }}>{t("arcl.diagFile")}:</span>
                <code className="break-all">{diag.env_file?.path}</code>
                {!diag.env_file?.exists && <span style={{ color: C_OVERDUE }}>· {t("arcl.diagMissingFile")}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span style={{ color: "var(--text-3)" }}>{t("arcl.diagCred")}:</span>
                {["USERNAME", "PASSWORD", "PASSAWORD", "ARC_USERNAME", "ARC_PASSWORD"].map((n) => {
                  const v = diag.env_file?.cred?.[n];
                  const tone = v === true ? C_DONE : v === false ? C_OVERDUE : C_GREY;
                  return (
                    <span key={n} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums"
                      style={{ background: hexA(tone, 0.12), color: tone, border: `1px solid ${hexA(tone, 0.4)}` }}>
                      <code>{n}</code>
                      <span>{v === true ? t("arcl.diagSet") : v === false ? t("arcl.diagEmpty") : t("arcl.diagAbsent")}</span>
                    </span>
                  );
                })}
              </div>
              {diag.env_file?.exists && (
                <div className="flex flex-wrap gap-x-2">
                  <span style={{ color: "var(--text-3)" }}>{t("arcl.diagKeys")}:</span>
                  <span className="break-all">{(diag.env_file.keys || []).join(", ") || "—"}</span>
                </div>
              )}
              {diag.env_file?.bad_lines?.length > 0 && (
                <div style={{ color: C_OVERDUE }}>{t("arcl.diagBadLines")}: {diag.env_file.bad_lines.join(", ")}</div>
              )}
              {(diag.env_file?.glued || []).map((g) => (
                <div key={`${g.key}-${g.name}`} style={{ color: C_OVERDUE }}>
                  {tpl(t("arcl.diagGlued"), { name: g.name, key: g.key })}
                </div>
              ))}
              {diag.other_env_files?.length > 0 && (
                <div className="flex flex-wrap gap-x-2">
                  <span style={{ color: "var(--text-3)" }}>{t("arcl.diagOther")}:</span>
                  <span className="break-all">
                    {diag.other_env_files.map((f) => `${f.path} (${Object.entries(f.cred || {}).filter(([, ok]) => ok).map(([k]) => k).join("+") || "—"})`).join("; ")}
                  </span>
                </div>
              )}
              {Object.values(diag.process_env || {}).some(Boolean) && (
                <div className="flex flex-wrap gap-x-2">
                  <span style={{ color: "var(--text-3)" }}>{t("arcl.diagProcess")}:</span>
                  <span>{Object.entries(diag.process_env).filter(([, ok]) => ok).map(([k]) => k).join(", ")}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-2">
                <span style={{ color: "var(--text-3)" }}>{t("arcl.diagResolved")}:</span>
                <span>
                  username <span style={{ color: diag.resolved?.username ? C_DONE : C_OVERDUE }}>{diag.resolved?.username ? "✓" : "✗"}</span>
                  {" · "}password <span style={{ color: diag.resolved?.password ? C_DONE : C_OVERDUE }}>{diag.resolved?.password ? "✓" : "✗"}</span>
                </span>
              </div>
              <p style={{ color: "var(--text-4)" }}>{t("arcl.diagHint")}</p>
            </div>
          )}
        </div>
      ) : !hasData ? (
        /* never synced — the page's only useful action is the first walk */
        <div className="rounded-2xl" style={cardStyle}>
          <EmptyState icon={ClipboardList} height="h-56" showUploadLink={false}
            title={t("arcl.emptyTitle")} message={t("arcl.emptyNote")}
            action={(
              <div className="flex flex-col items-center gap-2">
                {refreshBtn}
                {running && (
                  <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
                    {tpl(t("arcl.syncProgress"), { done: sync?.progress_done ?? 0, total: sync?.progress_total || "…" })}
                  </span>
                )}
              </div>
            )} />
        </div>
      ) : (
        <>
          {/* The view switch. Both views read the SAME filtered tickets — one as
              the register, one by the production cell their warehouse names —
              so the tabs sit above the filter row, not inside it. */}
          <div className="mb-3">
            <SegmentedToggle
              asTabs
              ariaLabel={t("arcl.title")}
              value={tab}
              onChange={setTab}
              options={[
                { value: "all", label: t("arcl.tabAll") },
                {
                  value: "cells",
                  label: (
                    <span className="inline-flex items-center gap-1.5">
                      <Boxes size={12} />{t("arcl.tabCells")}
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
            <SearchInput value={q} onChange={setQ} placeholder={t("arcl.search")} className="w-full sm:w-72" />
            <Button size="lg" variant="secondary" loading={exporting}
              disabled={listLoading || total === 0}
              icon={!exporting ? <Download size={14} /> : null}
              onClick={runExport}>
              <span className="hidden sm:inline">{t("arcl.export")}</span>
            </Button>
            {/* The register's columns only — the cells tab is a fixed set, and
                in analysis mode there is no table to configure. Hidden below
                `sm:` — that is where TableCard swaps the table for the stacked
                cards, and a picker over a table nobody can see is a control
                with no effect. */}
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

          {/* data / analysis mode, under the KPI strip so the headline numbers
              stay on screen either way — and, on the cells tab, WHICH cells
              that tab answers for (a brigadir is on them — the default — a
              lider is, or every cell). Both are /arc's controls, in /arc's
              place; the owner scope narrows every figure in both modes. */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <SegmentedToggle value={mode} onChange={setMode}
              options={[
                { value: "data", label: (<span className="inline-flex items-center gap-1.5"><ClipboardList size={12} />{t("arcl.modeData")}</span>) },
                { value: "analysis", label: (<span className="inline-flex items-center gap-1.5"><BarChart3 size={12} />{t("arcl.modeAnalysis")}</span>) },
              ]} />
            {tab === "cells" && (
              <SegmentedToggle value={owner} onChange={setOwner}
                options={[
                  { value: "manager", label: (<span className="inline-flex items-center gap-1.5"><Wrench size={12} />{t("arcl.ownerManager")}</span>), title: t("arcl.ownerManagerHint") },
                  { value: "leader", label: (<span className="inline-flex items-center gap-1.5"><UserCog size={12} />{t("arcl.ownerLeader")}</span>), title: t("arcl.ownerLeaderHint") },
                  { value: "all", label: (<span className="inline-flex items-center gap-1.5"><Boxes size={12} />{t("arcl.ownerAll")}</span>), title: t("arcl.ownerAllHint") },
                ]} />
            )}
          </div>

          {mode === "analysis" ? (
            <ArcAnalysis view={tab} filters={filters} enabled={configured && hasData}
              endpoint="/api/arc-legacy/analysis" queryKey="arcl-analysis" prefPrefix="arcl_an" />
          ) : (
          <>
          {/* ONE table for both views — same rows, filters, page and sort; only
              the columns differ. */}
          <TableCard
            icon={tab === "cells" ? Boxes : ClipboardList}
            title={tab === "cells" ? t("arcl.tabCells") : t("arcl.listTitle")}
            wrap
            minWidth={tab === "cells" ? 1000 : 1240}
            mobile={mobileList}
            mobileCards
            right={
              <span className="text-[11px] inline-flex items-center gap-1.5 flex-wrap justify-end" style={{ color: "var(--text-4)" }}>
                <span className="tabular-nums whitespace-nowrap">
                  {tpl(t("arcl.count"), { n: total.toLocaleString("ru-RU") })}
                </span>
                {/* What the cells tab is not showing, and where it is — a count
                    that silently omitted these would read as the whole register. */}
                {tab === "cells" && (stats?.hidden_no_cell || 0) > 0 && (
                  <button type="button" className="underline underline-offset-2 whitespace-nowrap text-left"
                    style={{ color: "var(--text-3)" }}
                    title={t("arcl.cellsOnlyHiddenHint")}
                    onClick={(e) => { e.stopPropagation(); setTab("all"); setCell(NO_CELL); }}>
                    · {tpl(t("arcl.cellsOnlyHidden"), { n: stats.hidden_no_cell.toLocaleString("ru-RU") })}
                  </button>
                )}
                {tab === "cells" && (stats?.hidden_unassigned || 0) > 0 && (
                  <button type="button" className="underline underline-offset-2 whitespace-nowrap text-left"
                    style={{ color: "var(--text-3)" }}
                    title={t(owner === "leader" ? "arcl.leaderlessHiddenHint" : "arcl.unassignedHiddenHint")}
                    onClick={(e) => { e.stopPropagation(); setOwner("all"); }}>
                    · {tpl(t(owner === "leader" ? "arcl.leaderlessHidden" : "arcl.unassignedHidden"),
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
                  {t("arcl.noMatch")}
                  {/* The cell code arrives only on tickets filed from 29 Sep
                      2026 — an empty cells tab over an older period is that,
                      not a gap. */}
                  {tab === "cells" && <div className="mt-1 text-xs" style={{ color: "var(--text-3)" }}>{t("arcl.cellsSince")}</div>}
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
          title={d ? tpl(t("arcl.detailTitle"), { num: d.request_num ?? "—", branch: d.branch_name || "—" }) : "…"}
          subtitle={d ? [d.category_name, fmtDateTime(d.created_at)].filter(Boolean).join(" · ") : ""}
          footer={<Button variant="secondary" onClick={() => setOpenId(null)}>{t("arcl.close")}</Button>}
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
                  {detailQ.error?.response?.data?.detail || t("arcl.dLoadFailed")}
                </div>
              )}
              {/* headline facts: status + the marks that ride beside it */}
              <div className="flex items-center gap-2 flex-wrap">
                <StatusChip status={d.normalized_status} color={d.status_color} label={statusLabel(d.normalized_status)} />
                {(d.overdue_now || d.late) && <RedBadge icon={AlertTriangle}>{t("arcl.late")}</RedBadge>}
                {d.category_is_urgent && <RedBadge icon={Zap}>{t("arcl.urgent")}</RedBadge>}
                {d.sended_to_sap && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: hexA(C_DONE, 0.12), color: C_DONE, border: `1px solid ${hexA(C_DONE, 0.35)}` }}>
                    <PackageCheck size={10} />{t("arcl.dSap")}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <Fact label={t("arcl.colWarehouse")}>{d.warehouse_name || "—"}</Fact>
                <Fact label={t("arcl.colCell")}>
                  {!d.cell_code ? (
                    <span style={{ color: "var(--text-4)" }} title={t("arcl.cNoCellHint")}>{t("arcl.cNoCell")}</span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <CellLink id={dCell?.id}><span className="tabular-nums">{d.cell_code}</span></CellLink>
                      {!dCell && <span className="text-[10px]" style={{ color: "var(--text-4)" }}>· {t("arcl.cUnknown")}</span>}
                    </span>
                  )}
                </Fact>
                <Fact label={t("arcl.colSup")}>{ownerFact("sup")}</Fact>
                <Fact label={t("arcl.colLeader")}>{ownerFact("leader")}</Fact>
                <Fact label={t("arcl.dMaster")}>{d.master_name || "—"}</Fact>
                <Fact label={t("arcl.dClient")}>{d.client_name || "—"}</Fact>
                <Fact label={t("arcl.dPhone")}>
                  {d.extra_phone
                    ? <a href={`tel:${d.extra_phone}`} className="inline-flex items-center gap-1 underline underline-offset-2" style={{ color: "var(--brand-text)" }}><Phone size={11} />{d.extra_phone}</a>
                    : "—"}
                </Fact>
                <Fact label={t("arcl.dSap")}>{d.sended_to_sap ? t("common.yes") : t("common.no")}</Fact>
                <Fact label={t("arcl.dDescription")} full>{d.description || "—"}</Fact>
                <Fact label={t("arcl.dDeadline")}><span className="tabular-nums">{fmtDateTime(d.deadline) || "—"}</span></Fact>
                <Fact label={t("arcl.dDeadlineTime")}><span className="tabular-nums">{fmtDateTime(d.deadline_time) || "—"}</span></Fact>
                <Fact label={t("arcl.dCreated")}><span className="tabular-nums">{fmtDateTime(d.created_at) || "—"}</span></Fact>
                <Fact label={t("arcl.dFinished")}><span className="tabular-nums">{fmtDateTime(d.finished_at) || "—"}</span></Fact>
                <Fact label={t("arcl.dCompleted")}><span className="tabular-nums">{fmtDateTime(d.completed_at) || "—"}</span></Fact>
                <Fact label={t("arcl.dCancelled")}><span className="tabular-nums">{fmtDateTime(d.cancelled_at) || "—"}</span></Fact>
                {d.hours_to_close != null && (
                  <Fact label={t("arcl.colHours")}><span className="tabular-nums">{fmtHours(d.hours_to_close)}</span></Fact>
                )}
                {d.deny_reason && <Fact label={t("arcl.dDenyReason")} full>{d.deny_reason}</Fact>}
                {d.comment_report && <Fact label={t("arcl.dComment")} full>{d.comment_report}</Fact>}
                {d.photo_report && (
                  <Fact label={t("arcl.dPhoto")} full>
                    {photoBroken ? (
                      extLink(d.photo_report, <><Camera size={11} />{t("arcl.dOpenLink")}<ExternalLink size={11} /></>)
                    ) : (
                      <a href={d.photo_report} target="_blank" rel="noopener noreferrer" onClick={(e) => openExt(e, d.photo_report)} className="inline-block">
                        <img src={d.photo_report} alt="" className="max-h-64 rounded-lg" style={{ border: "1px solid var(--border)" }}
                          onError={() => setPhotoBroken(true)} />
                      </a>
                    )}
                  </Fact>
                )}
                {d.document_url && (
                  <Fact label={t("arcl.dDocument")} full>
                    {extLink(d.document_url, <><FileText size={11} />{t("arcl.dOpenLink")}<ExternalLink size={11} /></>)}
                  </Fact>
                )}
                {d.latitude != null && d.longitude != null && (
                  <Fact label={t("arcl.dLocation")} full>
                    {extLink(`https://maps.google.com/?q=${d.latitude},${d.longitude}`,
                      <><MapPin size={11} />{t("arcl.dOpenMap")}<ExternalLink size={11} /></>)}
                    <span className="tabular-nums ml-2" style={{ color: "var(--text-4)" }}>{d.latitude}, {d.longitude}</span>
                  </Fact>
                )}
                {(d.other_active_count > 0 || d.has_other_active) && (
                  <div className="sm:col-span-2 rounded-lg px-3 py-2 text-xs inline-flex items-center gap-2"
                    style={{ background: hexA(C_DOING, 0.1), color: "var(--text-2)", border: `1px solid ${hexA(C_DOING, 0.3)}` }}>
                    <ListChecks size={13} className="flex-shrink-0" style={{ color: C_DOING }} />
                    {tpl(t("arcl.dOtherOpen"), { n: d.other_active_count ?? "" })}
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
