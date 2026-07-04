import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Plus, Pencil, Trash2, X, Search, AlertTriangle, Loader2, ClipboardList,
  ChevronDown, ChevronUp, ChevronsUpDown, Check,
  CalendarClock, UserCheck, UserRound, ShieldCheck, FileText, CircleDot, Clock,
  Hourglass, Gauge, TrendingUp, PieChart, Timer,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter, RngFilter } from "../components/ui/ColumnFilter";
import { SkeletonTable, SkeletonChart } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { padChartFrom } from "../utils/chartRange";

const STATUSES = ["todo", "doing", "done"];

// status → traffic-light tint from the admin-panel palette. Not-started stays
// neutral grey on purpose (a project exists but no process yet):
// todo grey · doing yellow · done green (overdue red lives in the charts).
const STATUS_COLOR = { todo: "#94a3b8", doing: "#eab308", done: "#22c55e" };

// Chart-only palette — same status language as the Kaizen page: red is the
// alarm hue for overdue, still-within-deadline "todo" stays the neutral grey.
const CHART_BRAND = "#C8973F";
const CHART_TODO = "#94a3b8";
const CHART_OVERDUE = "#ef4444";

// Localized ISO-date formatter (mirrors the Leaders page) — turns 2026-07-02
// into "2-iyul, 2026" / "2 июля 2026" / "2nd July, 2026" per the active lang.
const MONTHS = {
  en:      ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru:      ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  uz:      ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  uz_cyrl: ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"],
};
const fmtDate = (iso, lang) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split(/[T ]/)[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  const mn = (MONTHS[lang] || MONTHS.uz)[m - 1];
  if (lang === "en") return `${d} ${mn} ${y}`;               // 2 July 2026
  if (lang === "ru") return `${d} ${mn} ${y}`;               // 2 июля 2026
  return `${d}-${mn}, ${y}`;                                 // 2-iyul, 2026 / 2-июл, 2026
};

// Card chrome + the Notion-style grid rule shared by every cell (mirrors Kaizen).
const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };
const cellB = { borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" };

// Inline, editable status pill. Renders the traffic-light badge as a trigger and
// opens a compact portal dropdown (portal ⇒ never clipped by the table's
// overflow) so the status can be changed straight from the column.
function StatusSelect({ status, label, statusLabel, saving, disabled, onChange }) {
  const [open, setOpen] = useState(false);
  const [dropStyle, setDropStyle] = useState({});
  const triggerRef = useRef(null);
  const listRef = useRef(null);
  const color = STATUS_COLOR[status] || "var(--text-3)";

  function computeDropStyle() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return {};
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < 150 && spaceAbove > spaceBelow;
    return {
      position: "fixed",
      left: rect.left,
      minWidth: Math.max(rect.width, 140),
      zIndex: 9999,
      ...(openUp ? { bottom: vh - rect.top + 4 } : { top: rect.bottom + 4 }),
    };
  }

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (!triggerRef.current?.contains(e.target) && !listRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    const onScroll = () => setDropStyle(computeDropStyle());
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggle() {
    if (saving || disabled) return;
    if (open) setOpen(false);
    else { setDropStyle(computeDropStyle()); setOpen(true); }
  }

  function pick(s) {
    setOpen(false);
    if (s !== status) onChange(s);
  }

  const dropdown = open
    ? createPortal(
        <div
          ref={listRef}
          style={{
            ...dropStyle,
            background: "var(--bg-card)",
            border: "1px solid var(--border-md)",
            borderRadius: 10,
            boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
            padding: 4,
          }}
        >
          {STATUSES.map((s) => {
            const c = STATUS_COLOR[s] || "var(--text-3)";
            const isSel = s === status;
            return (
              <button
                key={s}
                type="button"
                onClick={() => pick(s)}
                className="w-full text-left px-2 py-1.5 rounded-md text-xs flex items-center gap-2 transition-colors"
                style={{ background: isSel ? `${c}1f` : "transparent", color: "var(--text-1)" }}
                onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "var(--bg-inner)"; }}
                onMouseLeave={(e) => { if (!isSel) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: c, flexShrink: 0 }} />
                <span className="flex-1 whitespace-nowrap">{statusLabel(s)}</span>
                {isSel && <Check size={12} style={{ color: c, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggle}
        className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{ background: `${color}24`, color, cursor: saving || disabled ? "default" : "pointer" }}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        {label}
        {saving
          ? <Loader2 size={10} className="animate-spin" />
          : !disabled && <ChevronDown size={10} style={{ opacity: 0.7 }} />}
      </button>
      {dropdown}
    </>
  );
}

// Sort affordance for the table headers — clicking cycles asc → desc → off, with
// neutral chevrons until a column is active (mirrors the Kaizen task table).
function SortIcon({ active, dir }) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <Icon size={11} style={{ opacity: active ? 1 : 0.4, color: active ? "var(--brand-text)" : "inherit" }} />
  );
}

// Revealed-row action button (matches the Staff requests table's ActionBtn).
function ActionBtn({ icon: Icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-opacity"
      style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: color || "var(--text-2)" }}
    >
      <Icon size={12} /> {label}
    </button>
  );
}

// Sortable, icon-led column header — brand-tinted glyph + label + sort state.
function Th({ icon: Icon, label, k, sort, onSort, align = "left", cls = "" }) {
  const active = sort.key === k;
  const alignCls = align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left";
  const justify = align === "right" ? "justify-end" : align === "center" ? "justify-center" : "justify-start";
  return (
    <th className={`font-medium px-3 py-2 select-none whitespace-nowrap ${alignCls} ${cls}`} style={cellB}>
      <button
        type="button" onClick={() => onSort(k)}
        className={`group inline-flex items-center gap-1.5 transition-colors ${justify}`}
        style={{ color: active ? "var(--text-1)" : "inherit" }}
      >
        {Icon && <Icon size={12} style={{ color: "var(--brand-text)" }} />}
        <span>{label}</span>
        <SortIcon active={active} dir={sort.dir} />
      </button>
    </th>
  );
}

// ── rich KPI card primitives ────────────────────────────────────────────────
// Card shell: tinted icon chip + uppercase label pinned top, body (subject
// headline + compact metric) pinned bottom so cards align across the KPI row
// regardless of how the labels wrap. Corner glow is a radial gradient (smooth
// falloff, no blur-filter banding).
function InsightCard({ icon: Icon, tint, label, children }) {
  return (
    <div className="relative rounded-2xl p-4 flex flex-col overflow-hidden" style={cardStyle}>
      <div aria-hidden className="absolute inset-0 pointer-events-none"
           style={{ background: `radial-gradient(140px 140px at calc(100% - 8px) -8px, ${tint}29, transparent 70%)` }} />
      <div className="flex items-center gap-2.5 relative">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-[10px] flex-shrink-0"
              style={{ background: `${tint}1f`, color: tint }}>
          <Icon size={16} />
        </span>
        <span className="text-[11px] uppercase tracking-[0.08em] font-semibold leading-tight" style={{ color: "var(--text-3)" }}>
          {label}
        </span>
      </div>
      <div className="relative flex flex-col gap-1 mt-4 grow justify-end min-h-[56px]">
        {children}
      </div>
    </div>
  );
}

// Compact colour-coded number + terse unit, with an optional quieter qualifier
// ("avg per concern"). Sits under the subject line as supporting detail.
function Metric({ value, unit, color, suffix }) {
  return (
    <div className="flex items-baseline gap-1 leading-none">
      <span className="text-base font-bold tabular-nums" style={{ color }}>{value}</span>
      {unit && <span className="text-[11px] font-semibold" style={{ color: "var(--text-3)" }}>{unit}</span>}
      {suffix && <span className="text-[10px] font-medium" style={{ color: "var(--text-4)" }}>· {suffix}</span>}
    </div>
  );
}

// Headline of the card body (problem text / name / date), clamped to a single
// line so every card body has identical height.
function Subject({ text, title }) {
  return (
    <div className="text-lg font-bold leading-snug truncate" style={{ color: "var(--text-1)" }} title={title || text}>
      {text}
    </div>
  );
}

// Placeholder body when a card has nothing meaningful to surface; my-auto
// centres it inside the reserved body height so empty cards don't collapse.
function Empty({ icon: Icon, color, text }) {
  return (
    <div className="flex items-center gap-2 my-auto">
      <Icon size={18} className="flex-shrink-0" style={{ color }} />
      <span className="text-sm font-medium" style={{ color: "var(--text-3)" }}>{text}</span>
    </div>
  );
}

const todayIso = () => new Date().toISOString().slice(0, 10);

// Local calendar helpers for the period filter. String comparison over ISO dates
// avoids the UTC-vs-local midnight drift that Date-based range math is prone to.
const pad2 = (n) => String(n).padStart(2, "0");
const localTodayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const isoMinusDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
const emptyForm = () => ({
  id: null,
  brigadir_id: null,        // create cascade (admin/shift-manager): chosen unit
  leader_profile_id: null,  // picker roles: which leader the concern belongs to
  leader_name: "",          // display-only, used when editing someone's row
  concern_owner: "",
  concern_text: "",
  status: "todo",
  deadline_days: "",
  entry_date: todayIso(),
  completion_date: "",
  solution: "",
});

export default function Concerns() {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, labelColor, legendColor, gridColor, tooltipTheme } = useChartTheme();
  const qc = useQueryClient();

  // Role-scoped access (the backend enforces the same scopes): admins and
  // shift-managers create via a supervisor → leader cascade, supervisors pick
  // among their own leaders, leaders always write on themselves, top-managers
  // get a read-only view of everything in their scope.
  const role = auth?.role;
  const isAdmin = role === "admin";
  const canPickSupervisor = isAdmin || role === "shift-manager";
  const canPickLeader = canPickSupervisor || role === "supervisor";
  const readOnly = role === "top-manager";
  const isLeaderViewer = role === "leader";

  const statusLabel = (s) => t(`concerns.status.${s}`);

  // Top filter bar (mirrors the Leaders page): period + brigadir + leader.
  // Period is a concrete date range picked with the same control as Leaders
  // (presets + calendar popover); defaults to the last 7 days.
  const [startDate, setStartDate] = useState(() => isoMinusDays(localTodayIso(), 6));
  const [endDate, setEndDate] = useState(() => localTodayIso());
  const [fBrig, setFBrig] = useState("All");          // brigadir_manager_id (string) | "All"
  const [fLeader, setFLeader] = useState("All");      // leaderKey(row) (string) | "All"
  const [search, setSearch] = useState("");

  // Table-level filters, consolidated behind the "Filtrlar" button (mirrors the
  // Production/Staff tables) — status + owner multi-selects, deadline-day range.
  const [statusSel, setStatusSel] = useState([]);       // [] = all statuses
  const [ownerSel, setOwnerSel] = useState([]);         // [] = all owners
  const [deadlineMin, setDeadlineMin] = useState("");
  const [deadlineMax, setDeadlineMax] = useState("");
  const [sort, setSort] = useState({ key: null, dir: "asc" });   // table column sort

  const [expandedId, setExpandedId] = useState(null);   // row whose action bar is open
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Create-cascade picker sources (both backend-scoped to the caller's role):
  // supervisors of the caller's scope, then every pre-created leader profile
  // (claimed or not — a not-yet-registered leader inherits the concern later).
  const { data: supervisors = [] } = useQuery({
    queryKey: ["concern-supervisors"],
    queryFn: () => api.get("/api/concerns/supervisors").then((r) => r.data),
    enabled: canPickSupervisor,
  });
  const { data: leaders = [] } = useQuery({
    queryKey: ["concern-leaders"],
    queryFn: () => api.get("/api/concerns/leaders").then((r) => r.data),
    enabled: canPickLeader,
  });

  // Concern list ─────────────────────────────────────────────────────────────
  // The backend returns only the caller's scope (admin/top-manager: all,
  // shift-manager: their shift, supervisor: their unit, leader: own rows);
  // every filter below slices those rows locally.
  const { data: listResp, isLoading } = useQuery({
    queryKey: ["concerns", role],
    queryFn: () => api.get("/api/concerns").then((r) => r.data),
  });
  const rows = listResp?.data || [];

  // Stable per-leader key for filter options: profile-first, with the role-row
  // fallback for legacy rows that never matched a profile.
  const leaderKey = (r) =>
    r.leader_profile_id != null ? `p${r.leader_profile_id}` : `r${r.leader_role_ref}`;

  // ApexCharts measures its container width once at mount; inside the
  // responsive grid the cells only get their final width a frame or two after
  // the data render lands. Hold the charts back until layout has settled, then
  // mount them once at the right width — no global resize nudges, no
  // mid-render redraw flashes (same fix as Kaizen).
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    if (isLoading) return undefined;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setChartsReady(true));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [isLoading]);

  // ── brigadir → leader filter cascade, built from the fetched (scoped) rows ──
  const brigOptions = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.brigadir_manager_id == null) continue;
      if (!m.has(r.brigadir_manager_id)) m.set(r.brigadir_manager_id, r.brigadir_name || "—");
    }
    return [...m.entries()]
      .map(([id, name]) => ({ value: String(id), label: tl(name) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, tl]);

  const leaderFilterOptions = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.leader_profile_id == null && r.leader_role_ref == null) continue;
      if (fBrig !== "All" && String(r.brigadir_manager_id) !== fBrig) continue;
      if (!m.has(leaderKey(r))) m.set(leaderKey(r), r.leader_name || "—");
    }
    return [...m.entries()]
      .map(([key, name]) => ({ value: key, label: tl(name) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, fBrig, tl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Period + brigadir + leader filters (client-side, over the fetched rows).
  const scoped = useMemo(() => {
    return rows.filter((r) => {
      if (startDate && !(r.entry_date && r.entry_date >= startDate)) return false;
      if (endDate && !(r.entry_date && r.entry_date <= endDate)) return false;
      if (fBrig !== "All" && String(r.brigadir_manager_id) !== fBrig) return false;
      if (fLeader !== "All" && leaderKey(r) !== fLeader) return false;
      return true;
    });
  }, [rows, startDate, endDate, fBrig, fLeader]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trend-chart scope: same filters, but the period start is pulled back so the
  // chart never spans fewer than 7 days (n..n+4 charts as n-2..n+4). KPIs,
  // donut and table keep the exact selected period.
  const chartStart = padChartFrom(startDate, endDate);
  const chartScoped = useMemo(() => {
    if (chartStart === startDate) return scoped;
    return rows.filter((r) => {
      if (chartStart && !(r.entry_date && r.entry_date >= chartStart)) return false;
      if (endDate && !(r.entry_date && r.entry_date <= endDate)) return false;
      if (fBrig !== "All" && String(r.brigadir_manager_id) !== fBrig) return false;
      if (fLeader !== "All" && leaderKey(r) !== fLeader) return false;
      return true;
    });
  }, [rows, scoped, chartStart, startDate, endDate, fBrig, fLeader]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── analytics (the three headline KPIs) ─────────────────────────────────────
  //  1) longest-running unresolved problem  2) slowest-resolving brigadir
  //  3) the date carrying the most still-open concerns.
  const insights = useMemo(() => {
    // days elapsed between an ISO date and `to` (default: now), floored, never < 0.
    const daysSince = (iso, to = Date.now()) => {
      if (!iso) return null;
      const from = new Date(iso + "T00:00:00").getTime();
      return Math.max(0, Math.floor((to - from) / 86400000));
    };
    const open = scoped.filter((r) => r.status !== "done");

    // 1 ─ the open concern that has been waiting the longest.
    let longest = null;
    for (const r of open) {
      const age = daysSince(r.entry_date);
      if (age == null) continue;
      if (!longest || age > longest.age) longest = { row: r, age };
    }

    // 2 ─ slowest brigadir: average time a concern spends with them, counting the
    //     resolution span for done rows and the current wait for still-open ones.
    const byBrig = new Map();
    for (const r of scoped) {
      const name = r.brigadir_name;
      if (!name) continue;
      const span = r.status === "done"
        ? (r.resolution_days != null ? r.resolution_days : daysSince(r.entry_date, r.completion_date ? new Date(r.completion_date + "T00:00:00").getTime() : Date.now()))
        : daysSince(r.entry_date);
      if (span == null) continue;
      const g = byBrig.get(name) || { sum: 0, n: 0, open: 0 };
      g.sum += span; g.n += 1;
      if (r.status !== "done") g.open += 1;
      byBrig.set(name, g);
    }
    let slowest = null;
    for (const [name, g] of byBrig) {
      const avg = g.sum / g.n;
      if (!slowest || avg > slowest.avg) slowest = { name, avg, n: g.n, open: g.open };
    }
    if (slowest) slowest.avg = Math.round(slowest.avg * 10) / 10;

    // 3 ─ the entry date that carries the most still-open concerns (ties → oldest).
    const byDate = new Map();
    for (const r of open) {
      if (!r.entry_date) continue;
      byDate.set(r.entry_date, (byDate.get(r.entry_date) || 0) + 1);
    }
    let peak = null;
    for (const [date, count] of byDate) {
      if (!peak || count > peak.count || (count === peak.count && date < peak.date)) peak = { date, count };
    }
    return { longest, slowest, peak, openTotal: open.length };
  }, [scoped]);

  // Distinct concern owners in the current (period/brigadir/leader) scope — feeds
  // the owner multi-select in the table filter button.
  const ownerOptions = useMemo(() => {
    const s = new Set();
    for (const r of scoped) if (r.concern_owner) s.add(r.concern_owner);
    return [...s].sort((a, b) => tl(a).localeCompare(tl(b)));
  }, [scoped, tl]);

  // Table-level filters (status/owner/deadline) + free-text search, applied to
  // both the period-scoped rows (table/donut) and the chart-scoped rows.
  const tableFilterPred = useMemo(() => {
    const q = search.trim().toLowerCase();
    const dMin = deadlineMin === "" ? null : Number(deadlineMin);
    const dMax = deadlineMax === "" ? null : Number(deadlineMax);
    return (r) => {
      if (statusSel.length && !statusSel.includes(r.status)) return false;
      if (ownerSel.length && !ownerSel.includes(r.concern_owner)) return false;
      if (dMin != null || dMax != null) {
        const d = r.deadline_days;
        if (d == null) return false;
        if (dMin != null && d < dMin) return false;
        if (dMax != null && d > dMax) return false;
      }
      if (q) {
        const hit =
          (r.concern_text || "").toLowerCase().includes(q) ||
          (r.concern_owner || "").toLowerCase().includes(q) ||
          (r.brigadir_name || "").toLowerCase().includes(q) ||
          (r.leader_name || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    };
  }, [search, statusSel, ownerSel, deadlineMin, deadlineMax]);

  const filtered = useMemo(() => scoped.filter(tableFilterPred), [scoped, tableFilterPred]);
  const chartFiltered = useMemo(
    () => (chartScoped === scoped ? null : chartScoped.filter(tableFilterPred)),
    [chartScoped, scoped, tableFilterPred]);

  // ── chart data — built over the fully filtered rows, so every filter (period /
  // brigadir / leader, status / owner / deadline, search) reshapes both charts.
  const charts = useMemo(() => {
    const today = localTodayIso();
    // overdue = still open and older than its deadline_days (ISO string math,
    // same convention as the period-filter helpers).
    const isOverdue = (r) =>
      r.status !== "done" && r.deadline_days != null && r.entry_date &&
      r.entry_date < isoMinusDays(today, r.deadline_days);

    // Donut buckets stay disjoint: an overdue row leaves its todo/doing bucket.
    // Buckets come from the selected period only — the padding below is chart-axis only.
    let done = 0, doing = 0, todo = 0, overdue = 0;
    for (const r of filtered) {
      if (r.status === "done") done += 1;
      else if (isOverdue(r)) overdue += 1;
      else if (r.status === "doing") doing += 1;
      else todo += 1;
    }

    // Trend rows come from the padded chart window (≥7 days) when the selected
    // period is shorter.
    const trendRows = chartFiltered ?? filtered;
    const opened = new Map(), closed = new Map();
    let trendOpen = 0;
    for (const r of trendRows) {
      if (r.status !== "done") trendOpen += 1;
      if (!r.entry_date) continue;   // undatable rows can't sit on the axis
      opened.set(r.entry_date, (opened.get(r.entry_date) || 0) + 1);
      if (r.status === "done") {
        // A done row leaves the open pool on its completion date; rows finished
        // without one (or dated before entry) fall back to the entry date.
        const closeIso = r.completion_date && r.completion_date >= r.entry_date ? r.completion_date : r.entry_date;
        closed.set(closeIso, (closed.get(closeIso) || 0) + 1);
      }
    }

    // Running end-of-day open count over a continuous day axis, from the chart
    // window's start (or first entry, if earlier) through today while anything
    // is still open — never ending before the selected period does — so quiet
    // days plot as a flat line instead of gaps.
    const dayKeys = [...opened.keys(), ...closed.keys()].sort();
    const trend = [];
    let maxOpen = 0;
    if (dayKeys.length) {
      let firstIso = dayKeys[0];
      if (chartStart && chartStart < firstIso) firstIso = chartStart;
      let lastIso = dayKeys[dayKeys.length - 1];
      if (trendOpen > 0 && lastIso < today) lastIso = today;
      if (endDate && endDate > lastIso) lastIso = endDate;
      const end = new Date(lastIso + "T00:00:00");
      let run = 0;
      for (const d = new Date(firstIso + "T00:00:00"); d <= end; d.setDate(d.getDate() + 1)) {
        const iso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        run += (opened.get(iso) || 0) - (closed.get(iso) || 0);
        const open = Math.max(0, run);
        if (open > maxOpen) maxOpen = open;
        trend.push({ day: iso, open });
      }
    }
    return { done, doing, todo, overdue, total: filtered.length, trend, maxOpen };
  }, [filtered, chartFiltered, chartStart, endDate]);

  // Everyone but the leader themself sees whose concern each row is (even when
  // filtered to one leader). Brigadir filter is pointless for a supervisor
  // (single unit), so it stays with the multi-unit roles.
  const showLeaderCol = !isLeaderViewer;
  const showBrigFilter = canPickSupervisor || readOnly;
  const showLeaderFilter = showBrigFilter || role === "supervisor";

  // ── column sort (asc → desc → off), applied over the filtered rows ──────────
  const onSort = (k) => setSort((s) =>
    s.key !== k ? { key: k, dir: "asc" }
      : s.dir === "asc" ? { key: k, dir: "desc" }
      : { key: null, dir: "asc" });

  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    const val = (r) => {
      switch (sort.key) {
        case "date":     return r.entry_date || "";
        case "leader":   return tl(r.leader_name || "");
        case "supervisor": return tl(r.brigadir_name || "");
        case "owner":    return tl(r.concern_owner || "");
        case "concern":  return tl(r.concern_text || "");
        case "deadline": return r.deadline_days;
        case "status":   return STATUSES.indexOf(r.status);
        default:         return "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (sort.key === "deadline") {                 // blank deadlines always sink
        const an = va == null, bn = vb == null;
        if (an && bn) return 0;
        if (an) return 1;
        if (bn) return -1;
        return (Number(va) - Number(vb)) * dir;
      }
      if (sort.key === "status") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [filtered, sort, tl]);

  // ── mutations ───────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["concerns"] });
  };

  const buildPayload = () => ({
    concern_owner: form.concern_owner.trim(),
    concern_text: form.concern_text.trim(),
    status: form.status,
    deadline_days: form.deadline_days === "" ? null : Number(form.deadline_days),
    entry_date: form.entry_date || null,
    completion_date: form.status === "done" ? form.completion_date || null : null,
    solution: form.solution.trim() || null,
    ...(canPickLeader ? { leader_profile_id: form.leader_profile_id } : {}),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      form.id
        ? api.put(`/api/concerns/${form.id}`, buildPayload()).then((r) => r.data)
        : api.post("/api/concerns", buildPayload()).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      closeModal();
    },
    onError: (e) =>
      setFormError(e?.response?.data?.detail || t("concerns.saveError")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/concerns/${id}`),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
    },
  });

  // Inline status change from the table — PUTs the whole row (the endpoint
  // requires the concern fields) with just the status swapped. Completion date is
  // left to the backend, which stamps today when a row flips to "done".
  const statusMutation = useMutation({
    mutationFn: ({ row, status }) =>
      api
        .put(`/api/concerns/${row.id}`, {
          cell_code: row.cell_code || null,
          concern_owner: row.concern_owner,
          concern_text: row.concern_text,
          status,
          deadline_days: row.deadline_days ?? null,
          entry_date: row.entry_date || null,
          completion_date: status === "done" ? row.completion_date || null : null,
          solution: row.solution || null,
        })
        .then((r) => r.data),
    onSuccess: () => invalidate(),
  });
  const savingStatusId = statusMutation.isPending ? statusMutation.variables?.row?.id : null;

  // ── modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    // Pre-select whatever the creator is currently filtering by, if anything.
    const f = { ...emptyForm() };
    if (canPickLeader && fLeader.startsWith("p")) {
      const prof = leaders.find((l) => l.profile_id === Number(fLeader.slice(1)));
      if (prof) {
        f.leader_profile_id = prof.profile_id;
        f.brigadir_id = prof.manager_id;
      }
    }
    if (canPickSupervisor && !f.brigadir_id && fBrig !== "All") f.brigadir_id = Number(fBrig);
    setForm(f);
    setFormError("");
    setModalOpen(true);
  }
  function openEdit(r) {
    setForm({
      id: r.id,
      brigadir_id: r.brigadir_manager_id,
      leader_profile_id: r.leader_profile_id,
      leader_name: r.leader_name || "",
      concern_owner: r.concern_owner || "",
      concern_text: r.concern_text || "",
      status: r.status || "todo",
      deadline_days: r.deadline_days ?? "",
      entry_date: r.entry_date || todayIso(),
      completion_date: r.completion_date || "",
      solution: r.solution || "",
    });
    setFormError("");
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setForm(emptyForm());
    setFormError("");
  }
  function submit() {
    if (!form.id && canPickSupervisor && !form.brigadir_id) return setFormError(t("concerns.pickBrigadirFirst"));
    if (!form.id && canPickLeader && !form.leader_profile_id) return setFormError(t("concerns.pickLeaderFirst"));
    if (!form.concern_owner.trim()) return setFormError(t("concerns.ownerRequired"));
    if (!form.concern_text.trim()) return setFormError(t("concerns.textRequired"));
    saveMutation.mutate();
  }

  const brigadirSelectOptions = supervisors.map((s) => ({
    value: String(s.manager_id),
    label: tl(s.name),
  }));

  // Leader options for the modal — admin/shift-manager cascade by the chosen
  // brigadir (a supervisor's list is already just their own unit). Unclaimed
  // profiles stay pickable, quietly marked; the leader inherits the concern
  // once they register.
  const leaderOptions = leaders
    .filter((l) => !canPickSupervisor || (form.brigadir_id && l.manager_id === form.brigadir_id))
    .map((l) => ({
      value: String(l.profile_id),
      label: l.registered ? tl(l.name) : `${tl(l.name)} · ${t("concerns.notRegistered")}`,
    }));

  // ── consolidated table filter button (shared <FilterPanel>) ─────────────────
  const deadlineActive = deadlineMin !== "" || deadlineMax !== "";
  const filterSections = [
    {
      key: "status", icon: CircleDot, label: t("concerns.colStatus"),
      active: statusSel.length > 0,
      display: `${statusSel.length} ${t("filter.selected2")}`,
      render: () => (
        <OptsFilter opts={STATUSES} sel={statusSel} onChange={setStatusSel} render={(s) => statusLabel(s)} />
      ),
    },
    {
      key: "owner", icon: UserRound, label: t("concerns.colOwner"),
      active: ownerSel.length > 0,
      display: `${ownerSel.length} ${t("filter.selected2")}`,
      render: () => (
        <OptsFilter opts={ownerOptions} sel={ownerSel} onChange={setOwnerSel} render={(o) => tl(o) || o} />
      ),
    },
    {
      key: "deadline", icon: Clock, label: t("concerns.colDeadline"),
      active: deadlineActive,
      display: `${deadlineMin || "0"}–${deadlineMax || "∞"}`,
      render: () => (
        <RngFilter minV={deadlineMin} maxV={deadlineMax} onMin={setDeadlineMin} onMax={setDeadlineMax} />
      ),
    },
  ];
  const filterActiveCount =
    (statusSel.length > 0 ? 1 : 0) + (ownerSel.length > 0 ? 1 : 0) + (deadlineActive ? 1 : 0);
  const anyFilterActive = filterActiveCount > 0;
  const clearAllFilters = () => { setStatusSel([]); setOwnerSel([]); setDeadlineMin(""); setDeadlineMax(""); };

  // ── charts: daily still-open trend + status donut (Kaizen styling) ──────────
  // Category axis over the pre-built day list (one point per day) keeps the
  // ticks on whole days — a datetime axis would interpolate 12:00 ticks.
  const trendDays = charts.trend.map((p) => p.day);
  const dayTick = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
  const lineSeries = [
    { name: t("concerns.seriesOpen"), data: charts.trend.map((p) => p.open) },
  ];
  const lineOpts = {
    chart: { type: "area", toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "inherit", background: "transparent", animations: { enabled: false } },
    theme: chartTheme,
    colors: [CHART_BRAND],
    stroke: { curve: "smooth", width: 2.5 },
    fill: { type: "solid", opacity: 0.15 },
    dataLabels: { enabled: false },
    xaxis: {
      type: "category",
      categories: trendDays,
      tickAmount: Math.min(Math.max(trendDays.length - 1, 1), 10),
      labels: { rotate: 0, hideOverlappingLabels: true, formatter: dayTick, style: { colors: labelColor, fontSize: "11px" } },
      axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    // Whole-count ticks: capping tickAmount at the data max keeps every step ≥ 1,
    // so the rounded labels never repeat (no more 2/2/2/1/1/1 axes).
    yaxis: {
      min: 0,
      max: Math.max(charts.maxOpen, 1),
      tickAmount: Math.min(Math.max(charts.maxOpen, 1), 5),
      labels: { style: { colors: labelColor, fontSize: "11px" }, formatter: (v) => Math.round(v) },
    },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 6, right: 6 } },
    markers: { size: charts.trend.length === 1 ? 4 : 0, hover: { size: 5 } },
    legend: { show: false },
    tooltip: {
      theme: tooltipTheme,
      x: { formatter: (_v, { dataPointIndex }) => fmtDate(trendDays[dataPointIndex] || "", lang) },
    },
  };

  // End-of-day cards under the trend: the unresolved pool as it stands now —
  // total plus its per-status split (chart palette, donut-consistent buckets).
  const openCards = [
    { label: t("concerns.cardUnresolved"), color: CHART_BRAND,       n: charts.todo + charts.doing + charts.overdue },
    { label: statusLabel("todo"),          color: CHART_TODO,        n: charts.todo },
    { label: statusLabel("doing"),         color: STATUS_COLOR.doing, n: charts.doing },
    { label: t("concerns.chartOverdue"),   color: CHART_OVERDUE,     n: charts.overdue },
  ];

  const donutRows = [
    { label: statusLabel("done"),        color: STATUS_COLOR.done,  n: charts.done },
    { label: statusLabel("doing"),       color: STATUS_COLOR.doing, n: charts.doing },
    { label: statusLabel("todo"),        color: CHART_TODO,         n: charts.todo },
    { label: t("concerns.chartOverdue"), color: CHART_OVERDUE,      n: charts.overdue },
  ];
  const donutSeries = donutRows.map((r) => r.n);
  const donutOpts = {
    chart: { type: "donut", fontFamily: "inherit", background: "transparent", animations: { enabled: false } },
    labels: donutRows.map((r) => r.label),
    colors: donutRows.map((r) => r.color),
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${v} ${t("concerns.itemsUnit")}` } },
    plotOptions: { pie: { donut: {
      size: "72%",
      labels: {
        show: true,
        name: { offsetY: 20, color: legendColor, fontSize: "11px" },
        value: { offsetY: -16, color: "var(--text-1)", fontSize: "28px", fontWeight: 700 },
        total: { show: true, label: t("concerns.kpiTotal"), color: legendColor, fontSize: "11px", formatter: () => String(charts.total) },
      },
    } } },
  };

  return (
    <Layout title={t("concerns.title")} showFilters={false}>
      {/* Filters — period + brigadir + leader (mirrors the Leaders page). The
          brigadir filter shows for multi-unit roles (admin/shift-manager/
          top-manager), the leader filter for everyone above a leader; a leader
          only ever sees their own concerns. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        {/* Period — same range picker as the Leaders page (presets + calendar) */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: "var(--text-4)" }}>{t("concerns.period")}</label>
          <DateRangePicker
            dateFrom={startDate}
            dateTo={endDate}
            setDateFrom={setStartDate}
            setDateTo={setEndDate}
            triggerClassName="w-full px-3 py-2 text-sm"
          />
        </div>

        {/* Brigadir — multi-unit roles only */}
        {showBrigFilter && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: "var(--text-4)" }}>{t("concerns.colSupervisor")}</label>
            <StyledSelect
              value={fBrig}
              onChange={(v) => { setFBrig(v); setFLeader("All"); }}
              options={[{ value: "All", label: t("concerns.allBrigadirs") }, ...brigOptions]}
            />
          </div>
        )}

        {/* Leader — everyone above a leader */}
        {showLeaderFilter && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: "var(--text-4)" }}>{t("concerns.fieldLeader")}</label>
            <StyledSelect
              value={fLeader}
              onChange={setFLeader}
              options={[{ value: "All", label: t("concerns.allLeaders") }, ...leaderFilterOptions]}
            />
          </div>
        )}
      </div>

      {/* KPIs — three headline insights (rich, colour-coded cards). Units are
          pluralised ("1 day" / "3 days"; invariant in uz, abbreviated in ru)
          and accent colours come from theme-aware --kpi-* variables. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {/* 1 ─ longest-running unresolved problem */}
        <InsightCard icon={Hourglass} tint="#ef4444" label={t("concerns.kpiLongestOpen")}>
          {insights.longest ? (
            <>
              <Subject text={tl(insights.longest.row.concern_text)} title={insights.longest.row.concern_text} />
              <Metric value={insights.longest.age} unit={t(insights.longest.age === 1 ? "concerns.day" : "concerns.days")} color="var(--kpi-red)" />
            </>
          ) : (
            <Empty icon={ShieldCheck} color="#22c55e" text={t("concerns.allClear")} />
          )}
        </InsightCard>

        {/* 2 ─ slowest-resolving brigadir */}
        <InsightCard icon={Gauge} tint="#f59e0b" label={t("concerns.kpiSlowestBrigadir")}>
          {insights.slowest ? (
            <>
              <Subject text={tl(insights.slowest.name)} />
              <Metric value={insights.slowest.avg} unit={t(insights.slowest.avg === 1 ? "concerns.day" : "concerns.days")} suffix={t("concerns.avgSuffix")} color="var(--kpi-amber)" />
            </>
          ) : (
            <Empty icon={Gauge} color="var(--text-4)" text={t("concerns.noData")} />
          )}
        </InsightCard>

        {/* 3 ─ date carrying the most still-open concerns */}
        <InsightCard icon={CalendarClock} tint="#3b82f6" label={t("concerns.kpiPeakDate")}>
          {insights.peak ? (
            <>
              <Subject text={fmtDate(insights.peak.date, lang)} />
              <Metric value={insights.peak.count} unit={t("concerns.openLower")} color="var(--kpi-blue)" />
            </>
          ) : (
            <Empty icon={ShieldCheck} color="#22c55e" text={t("concerns.allClear")} />
          )}
        </InsightCard>
      </div>

      {/* Charts — daily still-open trend + status donut, both computed from
          the fully filtered rows so every filter reshapes them live. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        {/* Trend line + end-of-day status strip */}
        <div className="lg:col-span-2 rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              <TrendingUp size={14} style={{ color: "var(--brand-text)" }} />
              {t("concerns.chartTrend")}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>{t("concerns.chartTrendSub")}</div>
          </div>
          {isLoading ? (
            <div className="p-4"><SkeletonChart className="h-52" /></div>
          ) : charts.trend.length ? (
            <>
              <div className="px-1 pt-1">
                {chartsReady
                  ? <ReactApexChart options={lineOpts} series={lineSeries} type="area" height={232} />
                  : <div style={{ height: 232 }} />}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 mt-auto">
                {openCards.map((c) => (
                  <div key={c.label} className="px-4 py-3 flex flex-col gap-1.5" style={{ borderTop: "1px solid var(--border)", borderRight: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-semibold" style={{ color: "var(--text-3)" }}>
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.color }} />
                      <span className="truncate">{c.label}</span>
                    </div>
                    <div className="text-xl font-bold font-mono leading-none" style={{ color: c.color }}>{c.n}</div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="grid place-items-center text-xs" style={{ color: "var(--text-4)", height: 232 }}>{t("concerns.noData")}</div>
          )}
        </div>

        {/* Status donut + side legend */}
        <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
            <PieChart size={14} style={{ color: "var(--brand-text)" }} />
            {t("concerns.chartStatusTitle")}
          </div>
          {isLoading ? (
            <div className="p-4"><SkeletonChart className="h-52" /></div>
          ) : charts.total ? (
            <div className="p-4 flex flex-col items-center gap-3">
              {chartsReady
                ? <ReactApexChart options={donutOpts} series={donutSeries} type="donut" height={180} />
                : <div style={{ height: 180 }} />}
              <div className="w-full space-y-2">
                {donutRows.map((r) => (
                  <div key={r.label} className="flex items-center gap-2 text-xs">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                    <span className="flex-1 truncate" style={{ color: "var(--text-2)" }}>{r.label}</span>
                    <span className="font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{r.n}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid place-items-center text-xs flex-1" style={{ color: "var(--text-4)", minHeight: 180 }}>{t("concerns.noData")}</div>
          )}
        </div>
      </div>

      {/* Task table — header band (title · count · search · filters · add) over a
          grid-ruled, sortable, icon-led table (mirrors the Kaizen task list). */}
      <div className="rounded-2xl overflow-hidden mb-8" style={cardStyle}>
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            <ClipboardList size={14} style={{ color: "var(--brand-text)" }} />
            {t("concerns.listTitle")}
            <span className="text-[11px] font-normal normal-case tracking-normal" style={{ color: "var(--text-4)" }}>({filtered.length})</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "var(--text-4)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("concerns.search")}
                className="h-8 pl-8 pr-3 rounded-lg text-xs w-44 outline-none"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
              />
            </div>
            <FilterPanel
              sections={filterSections}
              activeCount={filterActiveCount}
              anyActive={anyFilterActive}
              onClearAll={clearAllFilters}
              compact
            />
            {!readOnly && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-[var(--brand)] hover:bg-[var(--brand-text)] text-white transition-colors"
              >
                <Plus size={14} /> {t("concerns.add")}
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-4">
            <SkeletonTable rows={6} cols={showLeaderCol ? 8 : 7} />
          </div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <ClipboardList size={28} style={{ color: "var(--text-4)" }} />
            <div className="text-sm" style={{ color: "var(--text-3)" }}>{t("concerns.empty")}</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
                  <Th icon={CalendarClock} label={t("concerns.colDate")}     k="date"     sort={sort} onSort={onSort} />
                  {showLeaderCol && <Th icon={UserCheck} label={t("concerns.colLeader")} k="leader" sort={sort} onSort={onSort} />}
                  <Th icon={ShieldCheck}   label={t("concerns.colSupervisor")} k="supervisor" sort={sort} onSort={onSort} />
                  <Th icon={UserRound}     label={t("concerns.colOwner")}    k="owner"    sort={sort} onSort={onSort} />
                  <Th icon={FileText}      label={t("concerns.colConcern")}  k="concern"  sort={sort} onSort={onSort} />
                  <Th icon={CircleDot}     label={t("concerns.colStatus")}   k="status"   sort={sort} onSort={onSort} />
                  <Th icon={Clock}         label={t("concerns.colDeadline")} k="deadline" sort={sort} onSort={onSort} align="center" />
                  <Th icon={Timer}         label={t("concerns.colResolution")} k="resolution" sort={sort} onSort={onSort} align="center" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const expanded = expandedId === r.id;
                  const colSpan = showLeaderCol ? 7 : 6;
                  return (
                    <Fragment key={r.id}>
                      {/* Click a row to reveal its Edit/Delete action bar (Staff-style);
                          read-only viewers have no actions, so rows stay inert. */}
                      <tr
                        onClick={readOnly ? undefined : () => setExpandedId(expanded ? null : r.id)}
                        className={`align-top hover:bg-white/5 ${readOnly ? "" : "cursor-pointer"}`}
                        style={{ background: expanded ? "var(--bg-inner)" : "transparent" }}
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ ...cellB, color: "var(--text-2)" }}>{fmtDate(r.entry_date, lang)}</td>
                        {showLeaderCol && <td className="px-3 py-2.5 whitespace-nowrap" style={{ ...cellB, color: "var(--text-2)" }}>{tl(r.leader_name)}</td>}
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ ...cellB, color: "var(--text-2)" }}>{tl(r.brigadir_name) || "—"}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ ...cellB, color: "var(--text-1)" }}>{tl(r.concern_owner)}</td>
                        <td className="px-3 py-2.5 min-w-[240px] max-w-sm" style={{ ...cellB, color: "var(--text-1)" }}>
                          <div className="line-clamp-2" title={r.concern_text}>{tl(r.concern_text)}</div>
                          {r.solution && (
                            <div className="text-[11px] mt-1 line-clamp-1" style={{ color: "var(--text-3)" }} title={r.solution}>
                              ✓ {tl(r.solution)}
                            </div>
                          )}
                        </td>
                        {/* Status stays inline-editable → swallow the click so it doesn't toggle the row */}
                        <td className="px-3 py-2.5" style={cellB} onClick={(e) => e.stopPropagation()}>
                          <StatusSelect
                            status={r.status}
                            label={statusLabel(r.status)}
                            statusLabel={statusLabel}
                            saving={savingStatusId === r.id}
                            disabled={readOnly}
                            onChange={(s) => statusMutation.mutate({ row: r, status: s })}
                          />
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-[11px]" style={{ ...cellB, color: "var(--text-2)" }}>{r.deadline_days ?? "—"}</td>
                      </tr>
                      {expanded && (
                        <tr style={{ background: "var(--bg-inner)" }}>
                          <td colSpan={colSpan} className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                            <div className="flex flex-wrap items-center gap-2">
                              <ActionBtn icon={Pencil} label={t("concerns.edit")} onClick={() => openEdit(r)} />
                              <ActionBtn icon={Trash2} label={t("concerns.delete")} color="#ef4444" onClick={() => setConfirmDelete(r)} />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / edit modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)", paddingTop: "var(--tg-safe-top, 0px)" }} onClick={closeModal}>
          <div
            className="rounded-2xl w-full max-w-lg flex flex-col overflow-hidden"
            style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", maxHeight: "90vh" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 flex-shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>
                {form.id ? t("concerns.editTitle") : t("concerns.addTitle")}
              </div>
              <button onClick={closeModal} style={{ color: "var(--text-3)" }} className="hover:text-red-400 transition-colors"><X size={18} /></button>
            </div>

            <div className="overflow-y-auto px-5 py-4 space-y-3" style={{ flex: "1 1 auto", minHeight: 0 }}>
              {/* Who the concern belongs to (fixed on edit — ownership is never
                  reassigned): admin/shift-manager cascade supervisor → leader,
                  a supervisor picks straight from their own leaders. */}
              {canPickSupervisor && !form.id && (
                <Field label={t("concerns.colSupervisor")} required>
                  <StyledSelect
                    value={form.brigadir_id ? String(form.brigadir_id) : ""}
                    onChange={(v) => setForm((f) => ({
                      ...f,
                      brigadir_id: v ? Number(v) : null,
                      leader_profile_id: null,   // unit changed — reselect the leader
                    }))}
                    options={brigadirSelectOptions}
                    placeholder={t("concerns.pickBrigadir")}
                  />
                </Field>
              )}
              {canPickLeader && (
                <Field label={t("concerns.fieldLeader")} required={!form.id}>
                  {form.id ? (
                    <div
                      className="w-full rounded-lg px-3 py-2 text-sm"
                      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
                    >
                      {tl(form.leader_name) || "—"}
                    </div>
                  ) : (
                    <StyledSelect
                      value={form.leader_profile_id ? String(form.leader_profile_id) : ""}
                      onChange={(v) => setForm((f) => ({ ...f, leader_profile_id: v ? Number(v) : null }))}
                      options={leaderOptions}
                      placeholder={t(canPickSupervisor && !form.brigadir_id ? "concerns.pickBrigadirFirst" : "concerns.pickLeader")}
                    />
                  )}
                </Field>
              )}

              {/* Date */}
              <Field label={t("concerns.fieldDate")}>
                <input
                  type="date"
                  value={form.entry_date}
                  onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                />
              </Field>

              {/* Concern owner */}
              <Field label={t("concerns.fieldOwner")} required>
                <input
                  value={form.concern_owner}
                  onChange={(e) => setForm((f) => ({ ...f, concern_owner: e.target.value }))}
                  placeholder={t("concerns.fieldOwnerHint")}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                />
              </Field>

              {/* Concern text */}
              <Field label={t("concerns.fieldConcern")} required>
                <textarea
                  value={form.concern_text}
                  onChange={(e) => setForm((f) => ({ ...f, concern_text: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                />
              </Field>

              {/* Status + deadline */}
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("concerns.fieldStatus")}>
                  <StyledSelect
                    value={form.status}
                    onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                    options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
                  />
                </Field>
                <Field label={t("concerns.fieldDeadline")}>
                  <input
                    type="number"
                    min="0"
                    value={form.deadline_days}
                    onChange={(e) => setForm((f) => ({ ...f, deadline_days: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                  />
                </Field>
              </div>

              {/* Completion + solution — only relevant when done */}
              {form.status === "done" && (
                <div className="grid grid-cols-1 gap-3 rounded-lg p-3" style={{ background: "var(--bg-inner)" }}>
                  <Field label={t("concerns.fieldCompletion")}>
                    <input
                      type="date"
                      value={form.completion_date}
                      onChange={(e) => setForm((f) => ({ ...f, completion_date: e.target.value }))}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                    />
                  </Field>
                  <Field label={t("concerns.fieldSolution")}>
                    <textarea
                      value={form.solution}
                      onChange={(e) => setForm((f) => ({ ...f, solution: e.target.value }))}
                      rows={2}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                      style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                    />
                  </Field>
                </div>
              )}

              {formError && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertTriangle size={13} /> {formError}
                </div>
              )}
            </div>

            <div className="px-5 py-4 flex-shrink-0 flex gap-2" style={{ borderTop: "1px solid var(--border)" }}>
              <button
                onClick={submit}
                disabled={saveMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-[var(--brand)] hover:bg-[var(--brand-text)] text-white disabled:opacity-40 transition-colors"
              >
                {saveMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {t("concerns.save")}
              </button>
              <button onClick={closeModal} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-3)", border: "1px solid var(--border-md)" }}>
                {t("concerns.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setConfirmDelete(null)}>
          <div className="rounded-2xl w-full max-w-sm p-5" style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle size={18} className="text-red-400" />
              <div className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>{t("concerns.deleteTitle")}</div>
            </div>
            <div className="text-xs mb-4" style={{ color: "var(--text-3)" }}>{t("concerns.deleteConfirm")}</div>
            <div className="flex gap-2">
              <button
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-semibold bg-red-500/90 hover:bg-red-500 text-white disabled:opacity-40 transition-colors"
              >
                {deleteMutation.isPending && <Loader2 size={14} className="animate-spin" />}
                {t("concerns.delete")}
              </button>
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-lg text-sm" style={{ color: "var(--text-3)", border: "1px solid var(--border-md)" }}>
                {t("concerns.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

function Field({ label, required, children }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider mb-1" style={{ color: "var(--text-3)" }}>
        {label}{required && <span className="text-red-400"> *</span>}
      </div>
      {children}
    </div>
  );
}
