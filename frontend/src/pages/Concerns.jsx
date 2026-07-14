import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Plus, Pencil, Trash2, AlertTriangle, Loader2, ClipboardList,
  ChevronDown, Check,
  CalendarClock, UserRound, ShieldCheck, FileText, CircleDot, Clock,
  Hourglass, Gauge, TrendingUp, PieChart, Timer,
  Layers, ArrowUp, ArrowDown, ArrowRight, History, LayoutGrid, Tag,
  Wrench, Boxes, Warehouse, Refrigerator, ShoppingCart, Truck, MonitorCog,
  Droplets, CalendarRange, Users, FlaskConical, Wheat,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import StyledSelect from "../components/ui/StyledSelect";
import DateRangePicker from "../components/ui/DateRangePicker";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import Field from "../components/ui/FormField";
import SearchInput from "../components/ui/SearchInput";
import TableCard, { Th } from "../components/ui/DataTable";
import { FilterPanel, OptsFilter, RngFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { padChartFrom } from "../utils/chartRange";

const STATUSES = ["todo", "doing", "done"];

// Department categories ("по отделам") a concern is bucketed into. Keys are
// stable; labels render per-language via concerns.category.<key>. Keep in sync
// with CATEGORIES in backend/app/routers/concerns.py.
const CATEGORIES = [
  "ars", "inventory", "warehouse", "fridge", "procurement", "logistics",
  "it", "washing", "plan", "hr", "technologist", "raw_material",
];

// Per-category identity hue for the category chip — deliberately NOT the
// traffic-light palette (category is a bucket, not a status). A fixed spread of
// distinct tints keyed by the category so each department reads consistently.
const CATEGORY_COLOR = {
  ars: "#6366f1", inventory: "#0ea5e9", warehouse: "#14b8a6", fridge: "#06b6d4",
  procurement: "#8b5cf6", logistics: "#f97316", it: "#3b82f6", washing: "#10b981",
  plan: "#a855f7", hr: "#ec4899", technologist: "#f59e0b", raw_material: "#84cc16",
};

// Icon per department — same visual language as the downtime category legend
// (Wrench = repair service, Warehouse, Truck = logistics, FlaskConical =
// technologist), extended to the departments the legend doesn't cover.
const CATEGORY_ICON = {
  ars: Wrench, inventory: Boxes, warehouse: Warehouse, fridge: Refrigerator,
  procurement: ShoppingCart, logistics: Truck, it: MonitorCog, washing: Droplets,
  plan: CalendarRange, hr: Users, technologist: FlaskConical, raw_material: Wheat,
};

// Escalation chain, bottom → top. A concern starts at "supervisor" and is
// uplifted one step at a time by whoever can't solve it (see the uplift/
// send-back actions); the level column shows who currently holds it. Leaders
// sit below the chain: they create and edit but never hold a level.
const LEVELS = ["supervisor", "shift-manager", "top-manager"];

// Level → identity hue (never traffic-light — level is a position, not a
// status): teal → blue → violet as the concern climbs the chain. "leader"
// stays only so pre-migration escalation-history entries keep rendering.
const LEVEL_COLOR = {
  leader: "#94a3b8",
  supervisor: "#14b8a6",
  "shift-manager": "#3b82f6",
  "top-manager": "#8b5cf6",
};

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

// Card chrome (mirrors Kaizen).
const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

// Inline, editable status pill. Renders the traffic-light badge as a trigger and
// opens a compact portal dropdown (portal ⇒ never clipped by the table's
// overflow) so the status can be changed straight from the column.
function StatusSelect({ status, label, statusLabel, saving, disabled, onChange, options = STATUSES }) {
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
          {options.map((s) => {
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
        className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
        style={{ background: `${color}24`, color, cursor: saving || disabled ? "default" : "pointer" }}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        {label}
        {saving
          ? <Loader2 size={12} className="animate-spin" />
          : !disabled && <ChevronDown size={12} style={{ opacity: 0.7 }} />}
      </button>
      {dropdown}
    </>
  );
}

// Non-interactive level pill (same silhouette as the status pill so the two
// chip columns read as one visual family). The optional title carries the
// assigned top-manager's name on top-level rows — a tooltip, so row heights
// stay uniform.
function LevelChip({ level, label, title }) {
  const color = LEVEL_COLOR[level] || "var(--text-3)";
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `${color}24`, color }}
      title={title}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
      {label}
    </span>
  );
}

// Category chip — a soft tinted pill with the department's identity hue (icon
// tint chip convention). Renders "—" plainly when a legacy row has no category.
function CategoryChip({ category, label }) {
  if (!category) return <span style={{ color: "var(--text-4)" }}>—</span>;
  const color = CATEGORY_COLOR[category] || "var(--text-3)";
  const Icon  = CATEGORY_ICON[category] || Tag;
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
      style={{ background: `${color}24`, color }}
    >
      <Icon size={11} strokeWidth={2.5} className="flex-shrink-0" />
      {label}
    </span>
  );
}

// Department icon in a soft tint square (mirrors ProjectIcon in Kaizen.jsx) —
// used next to the label in the category picker and the category filter.
function CategoryIconChip({ category, size = 24 }) {
  const color = CATEGORY_COLOR[category] || "var(--text-3)";
  const Icon  = CATEGORY_ICON[category] || Tag;
  return (
    <span
      className="grid place-items-center flex-shrink-0 rounded-md"
      style={{ width: size, height: size, background: `${color}21`, color }}
    >
      <Icon size={Math.round(size * 0.54)} strokeWidth={2.4} />
    </span>
  );
}

// Labelled fact on a mobile concern card — every value gets a caption so
// nobody has to guess which name is the leader and which is the brigadir.
function MobField({ label, children }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--text-4)" }}>
        {label}
      </div>
      <div className="text-xs break-words" style={{ color: "var(--text-1)" }}>{children}</div>
    </div>
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
const isoPlusDays = (iso, n) => isoMinusDays(iso, -n);
// Whole days from b to a (positive when a is later) — deadline countdowns.
const isoDiffDays = (a, b) =>
  Math.round((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 86400000);
const emptyForm = () => ({
  id: null,
  leader_name: "",          // display-only, kept for legacy rows shown on edit
  cell_code: "",            // the production cell the concern is about (required)
  category: "",             // department bucket (required)
  concern_text: "",
  status: "todo",
  deadline_days: "",
  entry_date: todayIso(),
  completion_date: "",
  solution: "",
  can_set_status: false,    // edit form: may this viewer change the status?
  // New-concern target (see createLevel): admins pick the level (+ shift), the
  // chosen holder is a shift-manager or top-manager profile id.
  level: "shift-manager",
  shift: "",                     // admin, shift-manager level: 1 | 2
  shift_manager_profile_id: null,
  top_manager_profile_id: null,
});

export default function Concerns() {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, labelColor, legendColor, gridColor, tooltipTheme } = useChartTheme();
  const qc = useQueryClient();

  // Role-scoped access (the backend enforces the same scopes). Each role raises
  // a concern to the step above it: leader → supervisor, supervisor →
  // shift-manager, shift-manager → top-manager; admins pick the level. Only the
  // responsible holder at a concern's current level may change its status.
  const role = auth?.role;
  const isAdmin = role === "admin";
  const isSupervisor = role === "supervisor";
  const isShiftManager = role === "shift-manager";
  const readOnly = role === "top-manager";
  // Where a NEW concern this viewer creates lands: each role raises it to the
  // step above them; admins choose between shift-manager and top-manager.
  const createLevel = isAdmin ? null : isSupervisor ? "shift-manager" : isShiftManager ? "top-manager" : "supervisor";

  const statusLabel = (s) => t(`concerns.status.${s}`);
  const levelLabel = (l) => t(`concerns.level.${l}`);
  const categoryLabel = (c) => (c ? t(`concerns.category.${c}`) : "");
  // Owner-column position (= the creator's role). Chain roles + leader reuse
  // the level labels; admin has its own key.
  const roleLabel = (r) => (r === "admin" ? t("concerns.roleAdmin") : t(`concerns.level.${r}`));

  // Chain roles get the "my level only" toggle; admin is outside the chain and
  // slices by level via the Filtrlar multi-select instead. Leaders no longer
  // hold a level, so they get neither.
  const myLevel = LEVELS.includes(role) ? role : null;

  // Elapsed time for the "time since created" column. Done concerns show the
  // tracked creation→done span; still-open ones count up from creation to now.
  // Legacy done rows without a done_at timestamp stay blank.
  const resolutionMinutes = (r) => {
    if (r.resolution_minutes != null) return r.resolution_minutes;
    if (r.status !== "done" && r.created_at) {
      return Math.max(0, Math.floor((Date.now() - new Date(r.created_at).getTime()) / 60000));
    }
    return null;
  };

  // Days / hours / minutes span, dropping any leading zero units. Day and hour
  // units are full words, minutes stay short (e.g. "56 daq", "1 soat 41 daq",
  // "3 kun 22 soat"). Minutes are always shown when nothing larger is present
  // so a value never renders empty.
  const fmtResolution = (mins) => {
    if (mins == null) return "—";
    const days = Math.floor(mins / 1440);
    const hrs = Math.floor((mins % 1440) / 60);
    const rem = mins % 60;
    const parts = [];
    if (days) parts.push(`${days} ${t("general.unitDay")}`);
    if (hrs) parts.push(`${hrs} ${t("general.unitHour")}`);
    if (rem || parts.length === 0) parts.push(`${rem} ${t("general.unitMin")}`);
    return parts.join(" ");
  };

  // Compact owner label: "Abbos Mustafakulov" → "M. Abbos" (surname initial +
  // first name). Single-word names are left as-is. The full name still drives
  // search, sort and the filter list — this only shrinks the table display.
  const shortOwner = (name) => {
    const full = tl(name || "").trim();
    if (!full) return "—";
    const parts = full.split(/\s+/);
    if (parts.length < 2) return full;
    const last = parts[parts.length - 1];
    return `${last[0].toUpperCase()}. ${parts[0]}`;
  };

  // Top filter bar (mirrors the Leaders page): period + brigadir + leader.
  // Period is a concrete date range picked with the same control as Leaders
  // (presets + calendar popover); defaults to the last 7 days.
  const [startDate, setStartDate] = useState(() => isoMinusDays(localTodayIso(), 6));
  const [endDate, setEndDate] = useState(() => localTodayIso());
  const [search, setSearch] = useState("");

  // Table-level filters, consolidated behind the "Filtrlar" button (mirrors the
  // Production/Staff tables) — status + owner multi-selects, deadline-day range.
  const [statusSel, setStatusSel] = useState([]);       // [] = all statuses
  const [ownerSel, setOwnerSel] = useState([]);         // [] = all owners
  const [levelSel, setLevelSel] = useState([]);         // [] = all levels
  const [categorySel, setCategorySel] = useState([]);   // [] = all categories
  const [deadlineMin, setDeadlineMin] = useState("");
  const [deadlineMax, setDeadlineMax] = useState("");
  const [onlyMyLevel, setOnlyMyLevel] = useState(false); // toolbar toggle (chain roles), default OFF
  const [sort, setSort] = useState({ key: null, dir: "asc" });   // table column sort

  const [expandedId, setExpandedId] = useState(null);   // row whose action bar is open
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  // Cell-picker brigadir filter (form-local, never sent — it only narrows the
  // cell list to one supervisor's cells). "" = every cell in scope.
  const [cellSupervisor, setCellSupervisor] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Escalation UI: the uplift/send-back modal ({ row, direction }) with its
  // mandatory reason (+ top-manager pick on the last up-step), and the
  // per-concern history modal.
  const [escalate, setEscalate] = useState(null);       // { row, direction: "up"|"down" } | null
  const [escReason, setEscReason] = useState("");
  const [escTop, setEscTop] = useState(null);           // top-manager profile_id (up from shift-manager)
  const [escSM, setEscSM] = useState(null);             // shift-manager profile_id (up from supervisor)
  const [escError, setEscError] = useState("");
  const [historyRow, setHistoryRow] = useState(null);   // row whose escalation trail is open
  // Inline "done" needs a resolution note first — this holds the row whose pill
  // was flipped to done until the note is entered.
  const [resolveRow, setResolveRow] = useState(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveError, setResolveError] = useState("");

  // A new concern is raised to the step above the creator; the holder at that
  // step is named on the form (supervisor/admin → a shift-manager, shift-manager
  // /admin → a top-manager). formLevel is the level being created.
  const formLevel = isAdmin ? form.level : createLevel;
  const formNeedsSM = modalOpen && !form.id && formLevel === "shift-manager";
  const formNeedsTop = modalOpen && !form.id && formLevel === "top-manager";
  // The brigadir step of the cell cascade stays locked until the concern's
  // target holder is named above it (shift → smena menejeri → brigadir → cell).
  // Editing an existing concern has no target step, so it is always unlocked.
  const targetPicked = !!form.id || (
    formLevel === "shift-manager" ? !!form.shift_manager_profile_id
      : formLevel === "top-manager" ? !!form.top_manager_profile_id
      : true
  );
  // Escalation up-steps that must name the receiving holder.
  const escLvl = escalate ? (escalate.row.level || "supervisor") : null;
  const needsSMPick = escalate?.direction === "up" && escLvl === "supervisor";       // → shift-manager
  const needsTopPick = escalate?.direction === "up" && escLvl === "shift-manager";   // → top-manager

  // Shift-manager targets: admins narrow by the shift they picked; supervisors
  // are backend-pinned to their own shift. Fetched only when a step needs them.
  const smShiftParam = isAdmin && !form.id && form.shift ? `?shift=${form.shift}` : "";
  const { data: shiftManagers = [] } = useQuery({
    queryKey: ["concern-shift-managers", smShiftParam || "scoped"],
    queryFn: () => api.get(`/api/concerns/shift-managers${smShiftParam}`).then((r) => r.data),
    enabled: needsSMPick || (formNeedsSM && (!isAdmin || !!form.shift)),
  });
  // Top-manager targets — fetched only when that step's modal is open.
  const { data: topManagers = [] } = useQuery({
    queryKey: ["concern-top-managers"],
    queryFn: () => api.get("/api/concerns/top-managers").then((r) => r.data),
    enabled: needsTopPick || formNeedsTop,
  });
  // Cell picker source — every production cell in the caller's scope with the
  // leader(s) assigned to it. Fetched only while the create/edit modal is open.
  const { data: cells = [] } = useQuery({
    queryKey: ["concern-cells"],
    queryFn: () => api.get("/api/concerns/cells").then((r) => r.data),
    enabled: modalOpen && !readOnly,
  });
  // When the scope has exactly one cell (e.g. a leader logging for their own
  // cell), pre-select it so they don't have to open the picker at all.
  useEffect(() => {
    if (modalOpen && !form.id && !form.cell_code && shiftCells.length === 1) {
      setForm((f) => ({ ...f, cell_code: shiftCells[0].cell }));
    }
  }, [modalOpen, form.id, form.cell_code, shiftCells]);

  // Cells (and therefore brigadirs) belong to a shift: once the form names the
  // shift the concern is raised for, only that shift's units are in play.
  const shiftCells = useMemo(() => (
    form.shift ? cells.filter((c) => c.supervisor_shift === Number(form.shift)) : cells
  ), [cells, form.shift]);

  // Brigadir pre-filter for the cell picker: the full cell list is long (100+),
  // so viewers whose scope spans several units first pick the supervisor and
  // the cell picker collapses to that unit's cells. "" = every cell in scope.
  const supervisorOptions = useMemo(() => {
    const seen = new Map();
    shiftCells.forEach((c) => {
      if (c.supervisor_id && !seen.has(c.supervisor_id)) seen.set(c.supervisor_id, c.supervisor || "");
    });
    return [...seen.entries()]
      .map(([id, name]) => ({ value: String(id), label: tl(name) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [shiftCells, tl]);
  const cellSupOptions = [{ value: "", label: t("concerns.allSupervisors") }, ...supervisorOptions];
  const shownCells = cellSupervisor
    ? shiftCells.filter((c) => String(c.supervisor_id) === cellSupervisor)
    : shiftCells;
  const cellOptions = shownCells.map((c) => ({
    value: c.cell,
    label: c.leader ? `${c.cell} · ${tl(c.leader)}` : c.cell,
  }));

  // Concern list ─────────────────────────────────────────────────────────────
  // The backend returns only the caller's scope (admin/top-manager: all,
  // shift-manager: their shift, supervisor: their unit, leader: own rows);
  // every filter below slices those rows locally.
  const { data: listResp, isLoading } = useQuery({
    queryKey: ["concerns", role],
    queryFn: () => api.get("/api/concerns").then((r) => r.data),
  });
  const rows = listResp?.data || [];

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

  // Period filter (client-side, over the fetched rows). Concerns are level-based
  // now, so there's no brigadir/leader slicing here.
  const scoped = useMemo(() => {
    return rows.filter((r) => {
      if (startDate && !(r.entry_date && r.entry_date >= startDate)) return false;
      if (endDate && !(r.entry_date && r.entry_date <= endDate)) return false;
      return true;
    });
  }, [rows, startDate, endDate]);

  // Trend-chart scope: same filter, but the period start is pulled back so the
  // chart never spans fewer than 7 days. KPIs, donut and table keep the exact
  // selected period.
  const chartStart = padChartFrom(startDate, endDate);
  const chartScoped = useMemo(() => {
    if (chartStart === startDate) return scoped;
    return rows.filter((r) => {
      if (chartStart && !(r.entry_date && r.entry_date >= chartStart)) return false;
      if (endDate && !(r.entry_date && r.entry_date <= endDate)) return false;
      return true;
    });
  }, [rows, scoped, chartStart, startDate, endDate]);

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

  // Distinct owners (= creators) in the current (period/brigadir/leader) scope
  // — feeds the owner multi-select in the table filter button.
  const ownerOptions = useMemo(() => {
    const s = new Set();
    for (const r of scoped) if (r.owner_name) s.add(r.owner_name);
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
      if (ownerSel.length && !ownerSel.includes(r.owner_name)) return false;
      if (levelSel.length && !levelSel.includes(r.level || "supervisor")) return false;
      if (categorySel.length && !categorySel.includes(r.category)) return false;
      // "My level only": concerns currently sitting on the viewer's step. For a
      // top-manager that's the ones assigned to THEM (can_edit), not every
      // top-level concern in the read-only global view.
      if (onlyMyLevel && myLevel) {
        if ((r.level || "supervisor") !== myLevel) return false;
        if (role === "top-manager" && !r.can_edit) return false;
      }
      if (dMin != null || dMax != null) {
        const d = r.deadline_days;
        if (d == null) return false;
        if (dMin != null && d < dMin) return false;
        if (dMax != null && d > dMax) return false;
      }
      if (q) {
        const hit =
          (r.concern_text || "").toLowerCase().includes(q) ||
          (r.owner_name || "").toLowerCase().includes(q) ||
          (r.cell_code || "").toLowerCase().includes(q) ||
          (r.cell_leader_name || "").toLowerCase().includes(q) ||
          (r.category ? categoryLabel(r.category).toLowerCase().includes(q) : false);
        if (!hit) return false;
      }
      return true;
    };
  }, [search, statusSel, ownerSel, levelSel, categorySel, onlyMyLevel, myLevel, role, deadlineMin, deadlineMax]); // eslint-disable-line react-hooks/exhaustive-deps

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
        case "cell":     return (r.cell_code || "").toLowerCase();
        case "category": return categoryLabel(r.category || "");
        case "owner":    return tl(r.owner_name || "");
        case "concern":  return tl(r.concern_text || "");
        case "deadline": return r.deadline_days;
        case "resolution": return resolutionMinutes(r);
        case "status":   return STATUSES.indexOf(r.status);
        case "level":    return LEVELS.indexOf(r.level || "supervisor");
        default:         return "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = val(a), vb = val(b);
      if (sort.key === "deadline" || sort.key === "resolution") {   // blanks always sink
        const an = va == null, bn = vb == null;
        if (an && bn) return 0;
        if (an) return 1;
        if (bn) return -1;
        return (Number(va) - Number(vb)) * dir;
      }
      if (sort.key === "status" || sort.key === "level") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [filtered, sort, tl]);

  // ── mutations ───────────────────────────────────────────────────────────
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["concerns"] });
  };

  const buildPayload = () => ({
    cell_code: form.cell_code || null,
    category: form.category || null,
    concern_text: form.concern_text.trim(),
    status: form.status,
    deadline_days: form.deadline_days === "" ? null : Number(form.deadline_days),
    entry_date: form.entry_date || null,
    completion_date: form.status === "done" ? form.completion_date || null : null,
    solution: form.solution.trim() || null,
    // New concern only: where it lands + who holds it. The backend derives the
    // level from the role (admins send it explicitly) and requires the holder.
    ...(!form.id ? {
      ...(isAdmin ? { level: form.level } : {}),
      ...(formLevel === "shift-manager" ? { shift_manager_profile_id: form.shift_manager_profile_id } : {}),
      ...(formLevel === "top-manager" ? { top_manager_profile_id: form.top_manager_profile_id } : {}),
    } : {}),
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
    mutationFn: ({ row, status, solution }) =>
      api
        .put(`/api/concerns/${row.id}`, {
          cell_code: row.cell_code || null,
          category: row.category || null,
          concern_text: row.concern_text,
          status,
          deadline_days: row.deadline_days ?? null,
          entry_date: row.entry_date || null,
          completion_date: status === "done" ? row.completion_date || null : null,
          // `solution` is passed through only for the note-prompted "done" flow;
          // plain status swaps keep whatever the row already had.
          solution: solution !== undefined ? solution || null : row.solution || null,
        })
        .then((r) => r.data),
    onSuccess: () => {
      invalidate();
      setResolveRow(null);
    },
    onError: (e) => setResolveError(e?.response?.data?.detail || t("concerns.saveError")),
  });

  // Inline pill → "done" opens the note prompt (pre-filled with any existing
  // solution); every other status applies immediately.
  function requestStatusChange(row, status) {
    if (status === "done") {
      setResolveRow(row);
      setResolveNote(row.solution || "");
      setResolveError("");
    } else {
      statusMutation.mutate({ row, status });
    }
  }
  function submitResolve() {
    if (!resolveNote.trim()) return setResolveError(t("concerns.noteRequired"));
    statusMutation.mutate({ row: resolveRow, status: "done", solution: resolveNote.trim() });
  }
  const savingStatusId = statusMutation.isPending ? statusMutation.variables?.row?.id : null;

  // ── escalation (uplift / send back one step, reason mandatory) ─────────────
  function openEscalate(row, direction) {
    setEscalate({ row, direction });
    setEscReason("");
    setEscTop(null);
    setEscSM(null);
    setEscError("");
  }
  const escTargetLevel = escalate
    ? LEVELS[LEVELS.indexOf(escalate.row.level || "supervisor") + (escalate.direction === "up" ? 1 : -1)]
    : null;
  const escalateMutation = useMutation({
    mutationFn: () =>
      api.post(`/api/concerns/${escalate.row.id}/escalate`, {
        direction: escalate.direction,
        reason: escReason.trim(),
        ...(needsTopPick ? { top_manager_profile_id: escTop } : {}),
        ...(needsSMPick ? { shift_manager_profile_id: escSM } : {}),
      }).then((r) => r.data),
    onSuccess: () => {
      invalidate();
      setEscalate(null);
    },
    onError: (e) => setEscError(e?.response?.data?.detail || t("concerns.saveError")),
  });
  function submitEscalate() {
    if (!escReason.trim()) return setEscError(t("concerns.reasonRequired"));
    if (needsTopPick && !escTop) return setEscError(t("concerns.pickTopManager"));
    if (needsSMPick && !escSM) return setEscError(t("concerns.pickShiftManager"));
    escalateMutation.mutate();
  }

  // Escalation trail for the history modal — fetched when a row's History
  // button opens it.
  const { data: escHistory = [], isLoading: historyLoading } = useQuery({
    queryKey: ["concern-history", historyRow?.id],
    queryFn: () => api.get(`/api/concerns/${historyRow.id}/history`).then((r) => r.data),
    enabled: !!historyRow,
  });
  const fmtDateTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const localIso = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    return `${fmtDate(localIso, lang)}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  };

  // ── modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setForm(emptyForm());
    setFormError("");
    setCellSupervisor("");
    setModalOpen(true);
  }
  function openEdit(r) {
    setForm({
      ...emptyForm(),
      id: r.id,
      leader_name: r.leader_name || "",
      cell_code: r.cell_code || "",
      category: r.category || "",
      concern_text: r.concern_text || "",
      status: r.status || "todo",
      deadline_days: r.deadline_days ?? "",
      entry_date: r.entry_date || todayIso(),
      completion_date: r.completion_date || "",
      solution: r.solution || "",
      can_set_status: !!r.can_set_status,
    });
    setFormError("");
    setCellSupervisor("");
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setForm(emptyForm());
    setFormError("");
    setCellSupervisor("");
  }
  function submit() {
    if (!form.id && formLevel === "shift-manager" && !form.shift_manager_profile_id) return setFormError(t("concerns.pickShiftManager"));
    if (!form.id && formLevel === "top-manager" && !form.top_manager_profile_id) return setFormError(t("concerns.pickTopManager"));
    if (!form.cell_code) return setFormError(t("concerns.cellRequired"));
    if (!form.category) return setFormError(t("concerns.categoryRequired"));
    if (!form.concern_text.trim()) return setFormError(t("concerns.textRequired"));
    saveMutation.mutate();
  }

  // Target picker options for the create modal.
  const shiftManagerOptions = shiftManagers.map((m) => ({
    value: String(m.profile_id),
    label: m.registered ? tl(m.name) : `${tl(m.name)} · ${t("concerns.notRegistered")}`,
  }));
  const topManagerOptions = topManagers.map((m) => ({
    value: String(m.profile_id),
    label: m.registered ? tl(m.name) : `${tl(m.name)} · ${t("concerns.notRegistered")}`,
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
      key: "level", icon: Layers, label: t("concerns.colLevel"),
      active: levelSel.length > 0,
      display: `${levelSel.length} ${t("filter.selected2")}`,
      render: () => (
        <OptsFilter opts={LEVELS} sel={levelSel} onChange={setLevelSel} render={(l) => levelLabel(l)} />
      ),
    },
    {
      key: "category", icon: Tag, label: t("concerns.colCategory"),
      active: categorySel.length > 0,
      display: `${categorySel.length} ${t("filter.selected2")}`,
      render: () => (
        <OptsFilter
          opts={CATEGORIES}
          sel={categorySel}
          onChange={setCategorySel}
          render={(c) => (
            <span className="inline-flex items-center gap-1.5">
              <CategoryIconChip category={c} size={18} />
              {categoryLabel(c)}
            </span>
          )}
        />
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
    (statusSel.length > 0 ? 1 : 0) + (ownerSel.length > 0 ? 1 : 0) +
    (levelSel.length > 0 ? 1 : 0) + (categorySel.length > 0 ? 1 : 0) + (deadlineActive ? 1 : 0);
  const anyFilterActive = filterActiveCount > 0;
  const clearAllFilters = () => {
    setStatusSel([]); setOwnerSel([]); setLevelSel([]); setCategorySel([]); setDeadlineMin(""); setDeadlineMax("");
  };

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

  // Per-row action buttons — one source for the desktop expanded row and the
  // expanded mobile card, so the two layouts always offer the same actions.
  const rowActions = (r) => (
    <>
      {r.can_edit && (
        <ActionBtn icon={Pencil} label={t("concerns.edit")} onClick={() => openEdit(r)} />
      )}
      {r.can_escalate && (
        <ActionBtn icon={ArrowUp} label={t("concerns.uplift")} color="#3b82f6" onClick={() => openEscalate(r, "up")} />
      )}
      {r.can_deescalate && (
        <ActionBtn icon={ArrowDown} label={t("concerns.sendBack")} color="#f59e0b" onClick={() => openEscalate(r, "down")} />
      )}
      {r.escalation_count > 0 && (
        <ActionBtn icon={History} label={t("concerns.history")} onClick={() => setHistoryRow(r)} />
      )}
      {r.can_delete && (
        <ActionBtn icon={Trash2} label={t("concerns.delete")} color="#ef4444" onClick={() => setConfirmDelete(r)} />
      )}
    </>
  );

  // Phone layout for the concern list — each concern is its own standalone
  // card (TableCard's `mobileCards` mode); the 9-column table keeps rendering
  // from `sm:` up. Same data, same tap-to-reveal actions, same status pill.
  const mobileList = (
    <>
      {isLoading && Array.from({ length: 4 }).map((_, i) => (
        <div key={`sk-${i}`} className="rounded-xl p-3 space-y-2" style={cardStyle}>
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-3 w-full" />
          <SkeletonBlock className="h-3 w-2/3" />
        </div>
      ))}
      {!isLoading && sorted.length === 0 && (
        <div className="rounded-xl px-3 py-8 text-center text-xs" style={{ ...cardStyle, color: "var(--text-4)" }}>
          {t("concerns.empty")}
        </div>
      )}
      {!isLoading && sorted.map((r) => {
        const expanded = expandedId === r.id;
        const hasActions =
          r.can_edit || r.can_escalate || r.can_deescalate || r.escalation_count > 0;
        // Deadline as a state, not arithmetic: days remaining until
        // entry_date + deadline_days, negative = overdue (matches the charts'
        // isOverdue convention — the due date itself is not yet overdue).
        const dueIso = r.status !== "done" && r.deadline_days != null && r.entry_date
          ? isoPlusDays(r.entry_date, r.deadline_days)
          : null;
        const daysLeft = dueIso ? isoDiffDays(dueIso, localTodayIso()) : null;
        const overdue = daysLeft != null && daysLeft < 0;
        // Traffic-light edge strip — status at arm's length; overdue trumps.
        const strip = overdue ? "#ef4444" : STATUS_COLOR[r.status] || "var(--border)";
        return (
          <div
            key={r.id}
            onClick={hasActions ? () => setExpandedId(expanded ? null : r.id) : undefined}
            className={`rounded-xl p-3 flex flex-col gap-2.5 ${hasActions ? "cursor-pointer" : ""}`}
            style={{
              border: "1px solid var(--border)",
              borderLeft: `3px solid ${strip}`,
              background: expanded ? "var(--bg-inner)" : "var(--bg-card)",
            }}
          >
            {/* date + inline-editable status (tap must not toggle the card) */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px]" style={{ color: "var(--text-4)" }}>{fmtDate(r.entry_date, lang)}</span>
              <span className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <StatusSelect
                  status={r.status}
                  label={statusLabel(r.status)}
                  statusLabel={statusLabel}
                  saving={savingStatusId === r.id}
                  disabled={!r.can_set_status}
                  options={STATUSES}
                  onChange={(s) => requestStatusChange(r, s)}
                />
              </span>
            </div>

            {/* the concern itself is the headline */}
            <div className="text-sm font-semibold leading-snug" style={{ color: "var(--text-1)" }}>
              {tl(r.concern_text)}
            </div>
            {r.solution && (
              <div className="flex items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] leading-snug"
                   style={{ background: `${STATUS_COLOR.done}14` }}>
                <Check size={12} className="flex-shrink-0 mt-px" style={{ color: STATUS_COLOR.done }} />
                <span>
                  <span className="font-semibold" style={{ color: STATUS_COLOR.done }}>{t("concerns.fieldSolution")}: </span>
                  <span style={{ color: "var(--text-2)" }}>{tl(r.solution)}</span>
                </span>
              </div>
            )}

            {/* labelled facts — fixed positions, no guessing which name is which */}
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              <MobField label={t("concerns.colCell")}>
                {r.cell_code || "—"}
                {r.cell_leader_name && (
                  <div className="text-[10px]" style={{ color: "var(--text-3)" }}>{shortOwner(r.cell_leader_name)}</div>
                )}
              </MobField>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--text-4)" }}>
                  {t("concerns.colCategory")}
                </div>
                <CategoryChip category={r.category} label={categoryLabel(r.category)} />
              </div>
              <MobField label={t("concerns.colOwner")}>
                {shortOwner(r.owner_name)}
                {r.owner_role && (
                  <div className="text-[10px]" style={{ color: "var(--text-3)" }}>{roleLabel(r.owner_role)}</div>
                )}
              </MobField>
              <MobField label={t("concerns.responsible")}>
                {r.responsible_name ? shortOwner(r.responsible_name) : levelLabel(r.level || "supervisor")}
              </MobField>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--text-4)" }}>
                  {t("concerns.colLevel")}
                </div>
                <LevelChip
                  level={r.level || "supervisor"}
                  label={levelLabel(r.level || "supervisor")}
                  title={r.top_manager_name ? tl(r.top_manager_name) : undefined}
                />
              </div>
              {daysLeft != null && (
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-wider font-semibold mb-0.5" style={{ color: "var(--text-4)" }}>
                    {t("concerns.deadline")}
                  </div>
                  {overdue ? (
                    <div className="text-xs font-semibold flex items-center gap-1" style={{ color: "#ef4444" }}>
                      <AlertTriangle size={12} className="flex-shrink-0" />
                      {t("concerns.chartOverdue")} — {-daysLeft} {t(-daysLeft === 1 ? "concerns.day" : "concerns.days")}
                    </div>
                  ) : (
                    <div className="text-xs flex items-center gap-1" style={{ color: "var(--text-1)" }}>
                      <Clock size={12} className="flex-shrink-0" style={{ color: "var(--text-3)" }} />
                      {daysLeft} {t("concerns.daysLeft")}
                    </div>
                  )}
                </div>
              )}
              {resolutionMinutes(r) != null && (
                <MobField label={t("concerns.colResolution")}>
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Timer size={12} className="flex-shrink-0" style={{ color: "var(--text-3)" }} />
                    {fmtResolution(resolutionMinutes(r))}
                  </span>
                </MobField>
              )}
            </div>

            {/* explicit actions affordance — the whole card toggles too, but
                older users need a button that says so */}
            {hasActions && (
              <div className="flex justify-end pt-2" style={{ borderTop: "1px solid var(--border)" }}>
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
                  style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
                >
                  {t("concerns.actions")}
                  <ChevronDown size={13} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
                </span>
              </div>
            )}
            {expanded && (
              <div className="flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
                {rowActions(r)}
              </div>
            )}
          </div>
        );
      })}
    </>
  );

  return (
    <Layout title={t("concerns.title")} showFilters={false}>
      {/* Filter — period only. Concerns are level-based now (no brigadir/leader
          slicing); status / owner / level live behind the Filtrlar button. */}
      <div className="mb-3">
        <label className="hidden sm:block text-[10px] uppercase tracking-wider font-semibold mb-1" style={{ color: "var(--text-4)" }}>{t("concerns.period")}</label>
        <DateRangePicker
          dateFrom={startDate}
          dateTo={endDate}
          setDateFrom={setStartDate}
          setDateTo={setEndDate}
          triggerClassName="w-full sm:w-auto px-3 py-2 text-sm"
        />
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

      {/* Concern table — canonical POSITIONS-style TableCard with per-column sort. */}
      <TableCard
        className="mb-8"
        icon={ClipboardList}
        title={t("concerns.listTitle")}
        wrap
        mobile={mobileList}
        mobileCards
        right={
          <div className="flex items-center gap-2">
            {/* "My level only" — chain roles narrow the table to the concerns
                currently sitting on their step; admins slice by level via the
                Filtrlar multi-select instead. Off (= all) by default. */}
            {myLevel && (
              <SegmentedToggle
                value={onlyMyLevel}
                onChange={setOnlyMyLevel}
                options={[[false, t("general.all")], [true, t("concerns.myLevelOnly")]]}
              />
            )}
            <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
              {filtered.length}
            </span>
          </div>
        }
        toolbar={
          <>
            {/* Mobile: search takes its own full row (w-full wraps) while the
                add button stretches over the rest of the second row (label
                always on one line). Desktop: inline row. All controls share the
                FilterPanel-trigger height. FilterPanel stays a DIRECT child of
                the toolbar row — its fits-on-one-row check measures the row. */}
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder={t("concerns.search")}
              className="w-full sm:w-44"
            />
            <FilterPanel
              sections={filterSections}
              activeCount={filterActiveCount}
              anyActive={anyFilterActive}
              onClearAll={clearAllFilters}
            />
            {!readOnly && (
              <Button
                size="lg"
                className="flex-1 sm:flex-none whitespace-nowrap"
                icon={<Plus size={14} />}
                onClick={openCreate}
              >
                {t("concerns.add")}
              </Button>
            )}
          </>
        }
      >
              <thead>
                <tr>
                  <Th icon={CalendarClock} label={t("concerns.colDate")}     k="date"     sort={sort} onSort={onSort} />
                  <Th icon={LayoutGrid}    label={t("concerns.colCell")}     k="cell"     sort={sort} onSort={onSort} />
                  <Th icon={Tag}           label={t("concerns.colCategory")} k="category" sort={sort} onSort={onSort} />
                  <Th icon={UserRound}     label={t("concerns.colOwner")}    k="owner"    sort={sort} onSort={onSort} />
                  <Th icon={FileText}      label={t("concerns.colConcern")}  k="concern"  sort={sort} onSort={onSort} />
                  <Th icon={CircleDot}     label={t("concerns.colStatus")}   k="status"   sort={sort} onSort={onSort} />
                  <Th icon={Layers}        label={t("concerns.colLevel")}    k="level"    sort={sort} onSort={onSort} />
                  <Th icon={Clock}         label={t("concerns.colDeadline")} k="deadline" sort={sort} onSort={onSort} align="center" />
                  <Th icon={Timer}         label={t("concerns.colResolution")} k="resolution" sort={sort} onSort={onSort} align="center" />
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
                    ))}
                  </tr>
                ))}
                {!isLoading && sorted.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                    {t("concerns.empty")}
                  </td></tr>
                )}
                {!isLoading && sorted.map((r) => {
                  const expanded = expandedId === r.id;
                  const colSpan = 9;
                  // Per-row rights come from the backend (responsibility moves up
                  // the chain): a row with no actions at all stays inert.
                  const hasActions =
                    r.can_edit || r.can_escalate || r.can_deescalate || r.escalation_count > 0;
                  // Overdue = still open and past entry_date + deadline_days
                  // (same convention as the mobile card and the charts).
                  const dueIso = r.status !== "done" && r.deadline_days != null && r.entry_date
                    ? isoPlusDays(r.entry_date, r.deadline_days)
                    : null;
                  const overdue = dueIso != null && isoDiffDays(dueIso, localTodayIso()) < 0;
                  return (
                    <Fragment key={r.id}>
                      {/* Click a row to reveal its action bar (Staff-style);
                          rows the viewer can't act on stay inert. */}
                      <tr
                        onClick={hasActions ? () => setExpandedId(expanded ? null : r.id) : undefined}
                        className={`align-top ${hasActions ? "cursor-pointer" : ""}`}
                        style={{ background: expanded ? "var(--bg-inner)" : "transparent" }}
                      >
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-2)" }}>{fmtDate(r.entry_date, lang)}</td>
                        {/* Cell (the "Ячейка номер") + the leader currently
                            assigned to it — the concern's subject at a glance */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          {r.cell_code ? (
                            <>
                              <div className="font-semibold" style={{ color: "var(--text-1)" }}>{r.cell_code}</div>
                              {r.cell_leader_name && (
                                <div className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }} title={tl(r.cell_leader_name)}>
                                  {shortOwner(r.cell_leader_name)}
                                </div>
                              )}
                            </>
                          ) : <span style={{ color: "var(--text-4)" }}>—</span>}
                        </td>
                        {/* Department category */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <CategoryChip category={r.category} label={categoryLabel(r.category)} />
                        </td>
                        {/* Owner = whoever created the concern; the line under
                            the name is their position */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div style={{ color: "var(--text-1)" }} title={tl(r.owner_name)}>{shortOwner(r.owner_name)}</div>
                          {r.owner_role && (
                            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-3)" }}>
                              {roleLabel(r.owner_role)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 min-w-[240px] max-w-sm" style={{ color: "var(--text-1)" }}>
                          <div className="line-clamp-2" title={r.concern_text}>{tl(r.concern_text)}</div>
                          {r.solution && (
                            <div className="text-[11px] mt-1 line-clamp-1" style={{ color: "var(--text-3)" }} title={r.solution}>
                              ✓ {tl(r.solution)}
                            </div>
                          )}
                        </td>
                        {/* Status stays inline-editable → swallow the click so it doesn't toggle the row */}
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <StatusSelect
                            status={r.status}
                            label={statusLabel(r.status)}
                            statusLabel={statusLabel}
                            saving={savingStatusId === r.id}
                            disabled={!r.can_set_status}
                            options={STATUSES}
                            onChange={(s) => requestStatusChange(r, s)}
                          />
                        </td>
                        {/* Escalation level + who concretely holds it — the
                            chip names the step, the line under it the person */}
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <LevelChip
                            level={r.level || "supervisor"}
                            label={levelLabel(r.level || "supervisor")}
                            title={r.top_manager_name ? tl(r.top_manager_name) : undefined}
                          />
                          {r.responsible_name && (
                            <div className="text-[10px] mt-1" style={{ color: "var(--text-3)" }} title={tl(r.responsible_name)}>
                              {shortOwner(r.responsible_name)}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center font-mono text-[11px]" style={{ color: overdue ? "#ef4444" : "var(--text-2)", fontWeight: overdue ? 600 : undefined }}>{r.deadline_days ?? "—"}</td>
                        {/* Time since creation: done rows show the creation→done
                            span, open rows count up to now. Legacy done rows with
                            no done_at timestamp show "—". */}
                        <td className="px-3 py-2.5 text-center font-mono text-[11px]" style={{ color: "var(--text-2)" }}>
                          {fmtResolution(resolutionMinutes(r))}
                        </td>
                      </tr>
                      {expanded && (
                        <tr style={{ background: "var(--bg-inner)" }}>
                          <td colSpan={colSpan} className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                            <div className="flex flex-wrap items-center gap-2">
                              {rowActions(r)}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
      </TableCard>

      {/* Create / edit modal */}
      {modalOpen && (
        <Modal
          onClose={closeModal}
          title={form.id ? t("concerns.editTitle") : t("concerns.addTitle")}
          footer={
            <>
              <Button variant="secondary" onClick={closeModal}>{t("concerns.cancel")}</Button>
              <Button loading={saveMutation.isPending} onClick={submit}>{t("concerns.save")}</Button>
            </>
          }
        >
              {/* Target — where the concern is raised to (create only; the level
                  and its holder are fixed once created). Each role raises it to
                  the step above them; admins choose the level and the person. */}
              {!form.id && isAdmin && (
                <Field label={t("concerns.colLevel")}>
                  <StyledSelect
                    value={form.level}
                    onChange={(v) => {
                      setCellSupervisor("");   // re-locks the brigadir step below
                      setForm((f) => ({
                        ...f, level: v, shift: "", shift_manager_profile_id: null, top_manager_profile_id: null, cell_code: "",
                      }));
                    }}
                    options={["shift-manager", "top-manager"].map((l) => ({ value: l, label: levelLabel(l) }))}
                  />
                </Field>
              )}
              {!form.id && isAdmin && form.level === "shift-manager" && (
                <Field label={t("concerns.fieldShift")} required>
                  <StyledSelect
                    value={form.shift ? String(form.shift) : ""}
                    onChange={(v) => {
                      // A new shift means new units: the holder, the brigadir and
                      // the cell all belonged to the old one.
                      setCellSupervisor("");
                      setForm((f) => ({
                        ...f, shift: v ? Number(v) : "", shift_manager_profile_id: null, cell_code: "",
                      }));
                    }}
                    options={[{ value: "1", label: t("concerns.shift1") }, { value: "2", label: t("concerns.shift2") }]}
                    placeholder={t("concerns.pickShift")}
                  />
                </Field>
              )}
              {!form.id && formLevel === "shift-manager" && (
                <Field label={t("concerns.fieldShiftManager")} required>
                  <StyledSelect
                    value={form.shift_manager_profile_id ? String(form.shift_manager_profile_id) : ""}
                    onChange={(v) => setForm((f) => ({ ...f, shift_manager_profile_id: v ? Number(v) : null }))}
                    options={shiftManagerOptions}
                    placeholder={t(isAdmin && !form.shift ? "concerns.pickShiftFirst" : "concerns.pickShiftManager")}
                  />
                </Field>
              )}
              {!form.id && formLevel === "top-manager" && (
                <Field label={t("concerns.fieldTopManager")} required>
                  <StyledSelect
                    value={form.top_manager_profile_id ? String(form.top_manager_profile_id) : ""}
                    onChange={(v) => setForm((f) => ({ ...f, top_manager_profile_id: v ? Number(v) : null }))}
                    options={topManagerOptions}
                    placeholder={t("concerns.pickTopManager")}
                  />
                </Field>
              )}

              {/* Brigadir — narrows the cell picker below to one unit's cells.
                  Only shown when the viewer's scope spans several supervisors
                  (a supervisor/leader already sees just their own cells), and
                  only unlocked once the target holder above has been named —
                  the form is a cascade: shift → smena menejeri → brigadir. */}
              {supervisorOptions.length > 1 && (
                <Field label={t("concerns.fieldSupervisor")}>
                  <StyledSelect
                    disabled={!targetPicked}
                    value={cellSupervisor}
                    onChange={(v) => {
                      setCellSupervisor(v);
                      // Drop a cell that no longer belongs to the picked unit.
                      setForm((f) => {
                        const keep = !v || cells.some(
                          (c) => c.cell === f.cell_code && String(c.supervisor_id) === v,
                        );
                        return keep ? f : { ...f, cell_code: "" };
                      });
                    }}
                    options={cellSupOptions}
                    placeholder={targetPicked
                      ? t("concerns.allSupervisors")
                      : t(formLevel === "top-manager" ? "concerns.pickTopManagerFirst" : "concerns.pickShiftManagerFirst")}
                    searchable
                    searchPlaceholder={t("concerns.searchSupervisor")}
                  />
                </Field>
              )}

              {/* Cell — the "Ячейка номер"; a searchable picker over the cells
                  in scope (each labelled with the leader assigned to it),
                  narrowed to the brigadir picked above. */}
              <Field label={t("concerns.fieldCell")} required>
                <StyledSelect
                  value={form.cell_code}
                  onChange={(v) => setForm((f) => ({ ...f, cell_code: v }))}
                  options={cellOptions}
                  placeholder={t("concerns.pickCell")}
                  searchable
                  searchPlaceholder={t("concerns.searchCell")}
                />
              </Field>

              {/* Category — the department bucket ("по отделам"). */}
              <Field label={t("concerns.fieldCategory")} required>
                <StyledSelect
                  value={form.category}
                  onChange={(v) => setForm((f) => ({ ...f, category: v }))}
                  options={CATEGORIES.map((c) => ({
                    value: c,
                    label: (
                      <span className="inline-flex items-center gap-2.5">
                        <CategoryIconChip category={c} />
                        {categoryLabel(c)}
                      </span>
                    ),
                  }))}
                  placeholder={t("concerns.pickCategory")}
                />
              </Field>

              {/* Date */}
              <Field label={t("concerns.fieldDate")}>
                <DateRangePicker
                  single
                  dateFrom={form.entry_date} dateTo={form.entry_date}
                  setDateFrom={(iso) => setForm((f) => ({ ...f, entry_date: iso }))}
                  setDateTo={() => {}}
                  triggerClassName="px-3 py-2 text-sm w-full"
                />
              </Field>

              {/* Concern text (the owner is stamped server-side: the creator) */}
              <Field label={t("concerns.fieldConcern")} required>
                <textarea
                  value={form.concern_text}
                  onChange={(e) => setForm((f) => ({ ...f, concern_text: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                />
              </Field>

              {/* Status (edit only — a new concern always opens at "To do", and
                  only its responsible holder may change the status) + deadline */}
              <div className={`grid gap-3 ${form.id ? "grid-cols-2" : "grid-cols-1"}`}>
                {form.id && (
                  <Field label={t("concerns.fieldStatus")}>
                    <StyledSelect
                      value={form.status}
                      disabled={!form.can_set_status}
                      onChange={(v) => setForm((f) => ({ ...f, status: v }))}
                      options={STATUSES.map((s) => ({ value: s, label: statusLabel(s) }))}
                    />
                  </Field>
                )}
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
                    <DateRangePicker
                      single
                      dateFrom={form.completion_date} dateTo={form.completion_date}
                      setDateFrom={(iso) => setForm((f) => ({ ...f, completion_date: iso }))}
                      setDateTo={() => {}}
                      triggerClassName="px-3 py-2 text-sm w-full"
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
        </Modal>
      )}

      {/* Uplift / send-back modal — one step along the chain, reason mandatory;
          the shift-manager → top step additionally picks the exact top-manager. */}
      {escalate && (
        <Modal
          onClose={() => setEscalate(null)}
          title={escalate.direction === "up" ? t("concerns.upliftTitle") : t("concerns.sendBackTitle")}
          subtitle={tl(escalate.row.concern_text || "").slice(0, 90)}
          icon={escalate.direction === "up" ? <ArrowUp size={16} /> : <ArrowDown size={16} />}
          footer={
            <>
              <Button variant="secondary" onClick={() => setEscalate(null)}>{t("concerns.cancel")}</Button>
              <Button loading={escalateMutation.isPending} onClick={submitEscalate}>
                {escalate.direction === "up" ? t("concerns.uplift") : t("concerns.sendBack")}
              </Button>
            </>
          }
        >
          {/* current → new level */}
          <Field label={t("concerns.newLevel")}>
            <div className="flex items-center gap-2 py-1">
              <LevelChip
                level={escalate.row.level || "supervisor"}
                label={levelLabel(escalate.row.level || "supervisor")}
              />
              <ArrowRight size={14} style={{ color: "var(--text-4)" }} />
              {escTargetLevel && <LevelChip level={escTargetLevel} label={levelLabel(escTargetLevel)} />}
            </div>
          </Field>

          {needsSMPick && (
            <Field label={t("concerns.fieldShiftManager")} required>
              <StyledSelect
                value={escSM ? String(escSM) : ""}
                onChange={(v) => setEscSM(v ? Number(v) : null)}
                options={shiftManagers.map((m) => ({
                  value: String(m.profile_id),
                  label: m.registered ? tl(m.name) : `${tl(m.name)} · ${t("concerns.notRegistered")}`,
                }))}
                placeholder={t("concerns.pickShiftManager")}
              />
            </Field>
          )}

          {needsTopPick && (
            <Field label={t("concerns.fieldTopManager")} required>
              <StyledSelect
                value={escTop ? String(escTop) : ""}
                onChange={(v) => setEscTop(v ? Number(v) : null)}
                options={topManagers.map((m) => ({
                  value: String(m.profile_id),
                  label: m.registered ? tl(m.name) : `${tl(m.name)} · ${t("concerns.notRegistered")}`,
                }))}
                placeholder={t("concerns.pickTopManager")}
              />
            </Field>
          )}

          <Field label={t("concerns.fieldReason")} required>
            <textarea
              value={escReason}
              onChange={(e) => setEscReason(e.target.value)}
              rows={3}
              placeholder={t("concerns.reasonHint")}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </Field>

          {escError && (
            <div className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle size={13} /> {escError}
            </div>
          )}
        </Modal>
      )}

      {/* Resolution-note prompt — flipping a concern to "done" from the inline
          pill first asks how it was resolved; the note is saved as the solution. */}
      {resolveRow && (
        <Modal
          onClose={() => setResolveRow(null)}
          title={t("concerns.resolveTitle")}
          subtitle={tl(resolveRow.concern_text || "").slice(0, 90)}
          icon={<Check size={16} />}
          footer={
            <>
              <Button variant="secondary" onClick={() => setResolveRow(null)}>{t("concerns.cancel")}</Button>
              <Button loading={statusMutation.isPending} onClick={submitResolve}>
                {t("concerns.status.done")}
              </Button>
            </>
          }
        >
          <Field label={t("concerns.fieldSolution")} required>
            <textarea
              value={resolveNote}
              onChange={(e) => setResolveNote(e.target.value)}
              rows={3}
              placeholder={t("concerns.noteHint")}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </Field>

          {resolveError && (
            <div className="flex items-center gap-1.5 text-xs text-red-400">
              <AlertTriangle size={13} /> {resolveError}
            </div>
          )}
        </Modal>
      )}

      {/* Escalation history modal — the trail lives here (not inline in the
          table) so row heights stay uniform. */}
      {historyRow && (
        <Modal
          onClose={() => setHistoryRow(null)}
          title={t("concerns.historyTitle")}
          subtitle={tl(historyRow.concern_text || "").slice(0, 90)}
          icon={<History size={16} />}
          footer={
            <Button variant="secondary" onClick={() => setHistoryRow(null)}>{t("concerns.cancel")}</Button>
          }
        >
          {historyLoading ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-16 w-full" />
              <SkeletonBlock className="h-16 w-full" />
            </div>
          ) : escHistory.length === 0 ? (
            <div className="text-xs text-center py-6" style={{ color: "var(--text-4)" }}>
              {t("concerns.historyEmpty")}
            </div>
          ) : (
            <div className="space-y-2">
              {escHistory.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg p-3 space-y-1.5"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <LevelChip level={e.from_level} label={levelLabel(e.from_level)} />
                    <ArrowRight size={12} style={{ color: "var(--text-4)" }} />
                    <LevelChip level={e.to_level} label={levelLabel(e.to_level)} />
                    {e.target_name && (
                      <span className="text-[11px]" style={{ color: "var(--text-3)" }}>{tl(e.target_name)}</span>
                    )}
                    <span className="ml-auto text-[10px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
                      {fmtDateTime(e.created_at)}
                    </span>
                  </div>
                  <div className="text-xs" style={{ color: "var(--text-1)" }}>{tl(e.reason)}</div>
                  {e.actor_name && (
                    <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{tl(e.actor_name)}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
        title={t("concerns.deleteTitle")}
        message={t("concerns.deleteConfirm")}
        confirmLabel={t("concerns.delete")}
        cancelLabel={t("concerns.cancel")}
        tone="danger"
        loading={deleteMutation.isPending}
      />
    </Layout>
  );
}
