import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import {
  RefreshCw, CalendarClock, Download, Loader2, ClipboardList, Store, UserCog, Tag,
  CircleDot, Layers, Siren, AlertTriangle, PackageCheck, Camera, FileText, ExternalLink,
  MapPin, Phone, Check, Timer, CheckCircle2, ShieldCheck, Hourglass, Hash, UserRound,
  PlugZap, Zap, ListChecks, Radar,
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
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonCard } from "../components/ui/Skeleton";
import api from "../utils/api";
import { exportXlsx } from "../utils/exportXlsx";
import { usePersistentState } from "../hooks/usePersistentState";
import { useLang } from "../context/LangContext";
import { useAuth } from "../context/AuthContext";
import ApiPanel from "../components/arc/ApiPanel";
import { inTelegram } from "../utils/session";
import { toneFor, hexA, C_DONE, C_DOING, C_OVERDUE, C_GREY } from "../utils/arcStatus";

// ── constants ────────────────────────────────────────────────────────────────
const PAGE_SIZE = 50;
const COL_PREF_KEY = "arc.list.cols";
const TZ = "Asia/Tashkent";

// Register column catalog — the ONE source of order, labels, header icons and
// sort keys for the ARC table. Cells render through a per-key switch
// (`listCell` below), so the ColumnsPicker's hide/reorder comes for free.
// `sortKey` is the backend `sort` field; a column without one is not sortable.
const COLS = [
  { key: "num",         labelKey: "arc.colNum",         icon: Hash,          sortKey: "request_num" },
  { key: "created",     labelKey: "arc.colCreated",     icon: CalendarClock, sortKey: "created_at" },
  { key: "branch",      labelKey: "arc.colBranch",      icon: Store,         sortKey: "branch_name" },
  { key: "category",    labelKey: "arc.colCategory",    icon: Tag,           sortKey: "category_name" },
  { key: "description", labelKey: "arc.colDescription", icon: FileText },
  { key: "master",      labelKey: "arc.colMaster",      icon: UserCog,       sortKey: "master_name" },
  { key: "status",      labelKey: "arc.colStatus",      icon: CircleDot,     sortKey: "normalized_status" },
  { key: "due",         labelKey: "arc.colDue",         icon: Timer,         sortKey: "deadline" },
  { key: "closed",      labelKey: "arc.colClosed",      icon: CheckCircle2,  sortKey: "closed_at" },
  { key: "hours",       labelKey: "arc.colHours",       icon: Hourglass,     sortKey: "hours_to_close", align: "right" },
  { key: "sap",         labelKey: "arc.colSap",         icon: PackageCheck,  align: "center" },
  { key: "evidence",    labelKey: "arc.colEvidence",    icon: Camera,        align: "center" },
  { key: "client",      labelKey: "arc.colClient",      icon: UserRound },
];
// The ticket number and its status are the row's identity — never hideable.
const LOCKED_COLS = new Set(["num", "status"]);

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
// Status chip: traffic-light tone by vocabulary (utils/arcStatus.js); a NEW
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

export default function Arc() {
  const { t } = useLang();
  const toast = useToast();
  const qc = useQueryClient();

  const today = localISO(new Date());

  // ── page state (persisted, like every page) ───────────────────────────────
  // No default period. A register answers «what do we have?», and a 30-day
  // window is a filter the reader never chose — it made a full mirror look
  // like a thin one. Both bounds empty = every ticket ever filed.
  const [dateFrom, setDateFrom] = usePersistentState("arc_date_from", "");
  const [dateTo, setDateTo] = usePersistentState("arc_date_to", "");
  const [state, setState] = usePersistentState("arc_state", "all");
  const [statusSel, setStatusSel] = usePersistentState("arc_status", []);
  const [catSel, setCatSel] = usePersistentState("arc_category", []);
  const [branch, setBranch] = usePersistentState("arc_branch", "");
  const [master, setMaster] = usePersistentState("arc_master", "");
  const [urgent, setUrgent] = usePersistentState("arc_urgent", "all");
  const [overdue, setOverdue] = usePersistentState("arc_overdue", "all");
  const [sap, setSap] = usePersistentState("arc_sap", "all");
  const [q, setQ] = usePersistentState("arc_q", "");
  const [page, setPage] = usePersistentState("arc_page", 1);
  const [sort, setSort] = usePersistentState("arc_sort", { key: "created_at", dir: "desc" });
  const [openId, setOpenId] = useState(null);
  const [apiOpen, setApiOpen] = useState(false);
  const isAdmin = useAuth()?.auth?.role === "admin";

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
    ...(branch ? { branch: [branch] } : {}),
    ...(master ? { master: [master] } : {}),
    ...(urgent !== "all" ? { urgent } : {}),
    ...(overdue !== "all" ? { overdue } : {}),
    ...(sap !== "all" ? { sap } : {}),
    q: q.trim() || undefined,
  }), [dateFrom, dateTo, state, statusSel, catSel, branch, master, urgent, overdue, sap, q]);
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
  const visibleCols = useMemo(() => {
    const hiddenSet = new Set(colCfg.hidden);
    return colCfg.order.map((k) => COLS.find((c) => c.key === k)).filter((c) => c && !hiddenSet.has(c.key));
  }, [colCfg]);

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

  // Three-way yes/no/all toggle used by urgent, overdue and SAP.
  const yesNoOpts = [["all", t("general.all")], ["yes", t("common.yes")], ["no", t("common.no")]];
  const yesNoDisplay = (v) => (v === "yes" ? t("common.yes") : v === "no" ? t("common.no") : "");
  const stateLabels = {
    all: t("arc.stateAll"), open: t("arc.stateOpen"), closed: t("arc.stateClosed"), cancelled: t("arc.stateCancelled"),
  };

  const grpWho = t("arc.grpWho");
  const grpWhat = t("arc.grpWhat");
  // The count beside an option — how many non-missing tickets carry it.
  const withCount = (label, n) => (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="truncate">{label}</span>
      {n != null && <span className="tabular-nums flex-shrink-0" style={{ color: "var(--text-4)" }}>{n}</span>}
    </span>
  );

  const sections = [
    {
      key: "branch", icon: Store, label: t("arc.fBranch"), group: grpWho,
      active: !!branch,
      display: branch ? (branchById[branch]?.name || branch) : "",
      onClear: () => setBranch(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          opts={[{ value: "", label: t("arc.allBranches") },
            ...branchOpts.map((b) => ({ value: b.id, label: withCount(b.name, b.count), title: b.name }))]}
          value={branch}
          onChange={(v) => setBranch(v || "")} />
      ),
    },
    {
      key: "master", icon: UserCog, label: t("arc.fMaster"), group: grpWho,
      active: !!master,
      display: master ? (masterById[master]?.name || master) : "",
      onClear: () => setMaster(""),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          opts={[{ value: "", label: t("arc.allMasters") },
            ...masterOpts.map((m) => ({ value: m.id, label: withCount(m.name, m.count), title: m.name }))]}
          value={master}
          onChange={(v) => setMaster(v || "")} />
      ),
    },
    {
      key: "state", icon: Layers, label: t("arc.fState"), group: grpWhat,
      active: state !== "all",
      display: state !== "all" ? stateLabels[state] : "",
      onClear: () => setState("all"),
      render: () => (
        <SegmentedToggle fill value={state} onChange={setState}
          options={[["all", stateLabels.all], ["open", stateLabels.open], ["closed", stateLabels.closed], ["cancelled", stateLabels.cancelled]]} />
      ),
    },
    {
      key: "status", icon: CircleDot, label: t("arc.fStatus"), group: grpWhat,
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
      key: "category", icon: Tag, label: t("arc.fCategory"), group: grpWhat,
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
      key: "sap", icon: PackageCheck, label: t("arc.fSap"), group: grpWhat,
      active: sap !== "all", display: yesNoDisplay(sap),
      onClear: () => setSap("all"),
      render: () => <SegmentedToggle fill value={sap} onChange={setSap} options={yesNoOpts} />,
    },
  ];
  const clearAll = () => {
    setBranch(""); setMaster(""); setState("all"); setStatusSel([]); setCatSel([]);
    setUrgent("all"); setOverdue("all"); setSap("all");
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

  // Row → cell, keyed by column — hide/reorder needs no markup change of its own.
  const listCell = (key, r) => {
    switch (key) {
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
              {r.category_is_urgent && <RedBadge icon={Zap}>{t("arc.urgent")}</RedBadge>}
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
              {(r.overdue_now || r.late) && <RedBadge icon={AlertTriangle}>{t("arc.late")}</RedBadge>}
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
              {r.photo_report && <Camera size={13} title={t("arc.dPhoto")} />}
              {r.document_url && <FileText size={13} title={t("arc.dDocument")} />}
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
          {t("arc.noMatch")}
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
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <Fact label={t("arc.colCategory")}>
                <span className="inline-flex items-center gap-1 flex-wrap">
                  {r.category_name || "—"}
                  {r.category_is_urgent && <RedBadge icon={Zap}>{t("arc.urgent")}</RedBadge>}
                </span>
              </Fact>
              <Fact label={t("arc.colMaster")}>{r.master_name || "—"}</Fact>
              <Fact label={t("arc.colDue")}>
                <span className="inline-flex items-center gap-1 flex-wrap tabular-nums">
                  {fmtShort(r.due) || "—"}
                  {late && <RedBadge icon={AlertTriangle}>{t("arc.late")}</RedBadge>}
                </span>
              </Fact>
              <Fact label={t("arc.colCreated")}><span className="tabular-nums">{fmtShort(r.created_at) || "—"}</span></Fact>
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
  // without waiting on the network.
  const openRow = useMemo(() => rows.find((r) => r.remote_id === openId) || null, [rows, openId]);
  const d = detailQ.data || openRow;
  const [photoBroken, setPhotoBroken] = useState(false);
  useEffect(() => { setPhotoBroken(false); }, [openId]);

  // ── export ────────────────────────────────────────────────────────────────
  const [exporting, setExporting] = useState(false);
  const runExport = async () => {
    setExporting(true);
    try {
      const via = await exportXlsx("/api/arc/export.xlsx", {
        body: {
          ...filters, sort: sortParam,
          columns: visibleCols.map((c) => c.key),
          // Headers in the viewer's language — the backend's own labels are an
          // English fallback only.
          labels: Object.fromEntries(visibleCols.map((c) => [c.key, t(c.labelKey)])),
        },
        fallbackName: `arc_requests_${today}.xlsx`,
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
  // a background walk with nothing but a spinner reads as frozen.
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
    </>
  );

  const isBoot = metaQ.isLoading;
  const loadError = metaQ.isError;

  const kpiTiles = stats ? [
    { label: t("arc.kShown"), value: (stats.shown ?? 0).toLocaleString("ru-RU"), icon: ClipboardList },
    { label: t("arc.kOpen"), value: (stats.open ?? 0).toLocaleString("ru-RU"), icon: Hourglass, color: C_DOING },
    { label: t("arc.kOverdue"), value: (stats.overdue ?? 0).toLocaleString("ru-RU"), icon: Siren,
      color: (stats.overdue ?? 0) > 0 ? C_OVERDUE : C_GREY, danger: (stats.overdue ?? 0) > 0 },
    { label: t("arc.kClosed"), value: (stats.closed ?? 0).toLocaleString("ru-RU"), icon: CheckCircle2, color: C_DONE },
    { label: t("arc.kOnTime"), value: stats.on_time_pct == null ? "—" : `${Math.round(stats.on_time_pct)}%`, icon: ShieldCheck,
      // The share is computed over closed tickets that CARRY a deadline — a
      // ticket without one is neither on time nor late — so name that count.
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
              title={t("arc.api.title")} onClick={() => setApiOpen(true)}>
              <span className="hidden sm:inline">{t("arc.api.short")}</span>
            </Button>
          )}
          {refreshBtn}
        </div>
      </div>

      {isAdmin && apiOpen && (
        <ApiPanel open onClose={() => setApiOpen(false)} sync={sync}
          onProbed={() => {
            // A probe can change WHAT the next walk fetches — say so, and let
            // the operator start that walk from the same place.
            toast.success(t("arc.api.probed"));
            qc.invalidateQueries({ queryKey: ["arc-meta"] });
          }} />
      )}

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
        /* the credential is missing on the server — nothing here can work */
        <div className="rounded-2xl" style={cardStyle}>
          <EmptyState icon={PlugZap} height="h-56" showUploadLink={false}
            title={t("arc.notConfiguredTitle")} message={t("arc.notConfigured")} />
          {diag && (
            /* admin diagnostics: file → credential names → parse problems */
            <div className="border-t px-4 py-3 text-xs space-y-2" style={{ borderColor: "var(--border)", color: "var(--text-2)" }}>
              <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-4)" }}>{t("arc.diagTitle")}</div>
              <div className="flex flex-wrap gap-x-2">
                <span style={{ color: "var(--text-3)" }}>{t("arc.diagFile")}:</span>
                <code className="break-all">{diag.env_file?.path}</code>
                {!diag.env_file?.exists && <span style={{ color: C_OVERDUE }}>· {t("arc.diagMissingFile")}</span>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span style={{ color: "var(--text-3)" }}>{t("arc.diagCred")}:</span>
                {["USERNAME", "PASSWORD", "PASSAWORD", "ARC_USERNAME", "ARC_PASSWORD"].map((n) => {
                  const v = diag.env_file?.cred?.[n];
                  const tone = v === true ? C_DONE : v === false ? C_OVERDUE : C_GREY;
                  return (
                    <span key={n} className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 tabular-nums"
                      style={{ background: hexA(tone, 0.12), color: tone, border: `1px solid ${hexA(tone, 0.4)}` }}>
                      <code>{n}</code>
                      <span>{v === true ? t("arc.diagSet") : v === false ? t("arc.diagEmpty") : t("arc.diagAbsent")}</span>
                    </span>
                  );
                })}
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
                    {diag.other_env_files.map((f) => `${f.path} (${Object.entries(f.cred || {}).filter(([, ok]) => ok).map(([k]) => k).join("+") || "—"})`).join("; ")}
                  </span>
                </div>
              )}
              {Object.values(diag.process_env || {}).some(Boolean) && (
                <div className="flex flex-wrap gap-x-2">
                  <span style={{ color: "var(--text-3)" }}>{t("arc.diagProcess")}:</span>
                  <span>{Object.entries(diag.process_env).filter(([, ok]) => ok).map(([k]) => k).join(", ")}</span>
                </div>
              )}
              <div className="flex flex-wrap gap-x-2">
                <span style={{ color: "var(--text-3)" }}>{t("arc.diagResolved")}:</span>
                <span>
                  username <span style={{ color: diag.resolved?.username ? C_DONE : C_OVERDUE }}>{diag.resolved?.username ? "✓" : "✗"}</span>
                  {" · "}password <span style={{ color: diag.resolved?.password ? C_DONE : C_OVERDUE }}>{diag.resolved?.password ? "✓" : "✗"}</span>
                </span>
              </div>
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
            {/* Hidden below `sm:` — that is where TableCard swaps the table for
                the stacked cards, and a picker over a table nobody can see is a
                control with no effect. */}
            <ColumnsPicker
              className="ml-auto hidden sm:block"
              columns={COLS.map((c) => ({ key: c.key, label: t(c.labelKey), locked: LOCKED_COLS.has(c.key) }))}
              order={colCfg.order}
              hidden={colCfg.hidden}
              onChange={onColsChange}
            />
          </div>

          {/* ── KPI strip — the SAME filtered set as the table ── */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
            {statsLoading || !stats
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
              : kpiTiles.map((k) => <KPICard key={k.label} {...k} />)}
          </div>

          <TableCard
            icon={ClipboardList}
            title={t("arc.listTitle")}
            wrap
            minWidth={1100}
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
      )}

      {/* ── ticket detail ── */}
      {openId != null && (
        <Modal
          onClose={() => setOpenId(null)}
          maxWidth="max-w-2xl"
          icon={<ClipboardList size={16} />}
          title={d ? tpl(t("arc.detailTitle"), { num: d.request_num ?? "—", branch: d.branch_name || "—" }) : "…"}
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
                <StatusChip status={d.normalized_status} color={d.status_color} label={statusLabel(d.normalized_status)} />
                {(d.overdue_now || d.late) && <RedBadge icon={AlertTriangle}>{t("arc.late")}</RedBadge>}
                {d.category_is_urgent && <RedBadge icon={Zap}>{t("arc.urgent")}</RedBadge>}
                {d.sended_to_sap && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold"
                    style={{ background: hexA(C_DONE, 0.12), color: C_DONE, border: `1px solid ${hexA(C_DONE, 0.35)}` }}>
                    <PackageCheck size={10} />{t("arc.dSap")}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                <Fact label={t("arc.dMaster")}>{d.master_name || "—"}</Fact>
                <Fact label={t("arc.dClient")}>{d.client_name || "—"}</Fact>
                <Fact label={t("arc.dPhone")}>
                  {d.extra_phone
                    ? <a href={`tel:${d.extra_phone}`} className="inline-flex items-center gap-1 underline underline-offset-2" style={{ color: "var(--brand-text)" }}><Phone size={11} />{d.extra_phone}</a>
                    : "—"}
                </Fact>
                <Fact label={t("arc.dSap")}>{d.sended_to_sap ? t("common.yes") : t("common.no")}</Fact>
                <Fact label={t("arc.dDescription")} full>{d.description || "—"}</Fact>
                <Fact label={t("arc.dDeadline")}><span className="tabular-nums">{fmtDateTime(d.deadline) || "—"}</span></Fact>
                <Fact label={t("arc.dDeadlineTime")}><span className="tabular-nums">{fmtDateTime(d.deadline_time) || "—"}</span></Fact>
                <Fact label={t("arc.dCreated")}><span className="tabular-nums">{fmtDateTime(d.created_at) || "—"}</span></Fact>
                <Fact label={t("arc.dFinished")}><span className="tabular-nums">{fmtDateTime(d.finished_at) || "—"}</span></Fact>
                <Fact label={t("arc.dCompleted")}><span className="tabular-nums">{fmtDateTime(d.completed_at) || "—"}</span></Fact>
                <Fact label={t("arc.dCancelled")}><span className="tabular-nums">{fmtDateTime(d.cancelled_at) || "—"}</span></Fact>
                {d.hours_to_close != null && (
                  <Fact label={t("arc.colHours")}><span className="tabular-nums">{fmtHours(d.hours_to_close)}</span></Fact>
                )}
                {d.deny_reason && <Fact label={t("arc.dDenyReason")} full>{d.deny_reason}</Fact>}
                {d.comment_report && <Fact label={t("arc.dComment")} full>{d.comment_report}</Fact>}
                {d.photo_report && (
                  <Fact label={t("arc.dPhoto")} full>
                    {photoBroken ? (
                      extLink(d.photo_report, <><Camera size={11} />{t("arc.dOpenLink")}<ExternalLink size={11} /></>)
                    ) : (
                      <a href={d.photo_report} target="_blank" rel="noopener noreferrer" onClick={(e) => openExt(e, d.photo_report)} className="inline-block">
                        <img src={d.photo_report} alt="" className="max-h-64 rounded-lg" style={{ border: "1px solid var(--border)" }}
                          onError={() => setPhotoBroken(true)} />
                      </a>
                    )}
                  </Fact>
                )}
                {d.document_url && (
                  <Fact label={t("arc.dDocument")} full>
                    {extLink(d.document_url, <><FileText size={11} />{t("arc.dOpenLink")}<ExternalLink size={11} /></>)}
                  </Fact>
                )}
                {d.latitude != null && d.longitude != null && (
                  <Fact label={t("arc.dLocation")} full>
                    {extLink(`https://maps.google.com/?q=${d.latitude},${d.longitude}`,
                      <><MapPin size={11} />{t("arc.dOpenMap")}<ExternalLink size={11} /></>)}
                    <span className="tabular-nums ml-2" style={{ color: "var(--text-4)" }}>{d.latitude}, {d.longitude}</span>
                  </Fact>
                )}
                {(d.other_active_count > 0 || d.has_other_active) && (
                  <div className="sm:col-span-2 rounded-lg px-3 py-2 text-xs inline-flex items-center gap-2"
                    style={{ background: hexA(C_DOING, 0.1), color: "var(--text-2)", border: `1px solid ${hexA(C_DOING, 0.3)}` }}>
                    <ListChecks size={13} className="flex-shrink-0" style={{ color: C_DOING }} />
                    {tpl(t("arc.dOtherOpen"), { n: d.other_active_count ?? "" })}
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
