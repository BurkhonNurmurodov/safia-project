import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, X, Search, AlertTriangle, Loader2, ClipboardList,
  ChevronDown, ChevronUp, ChevronsUpDown, Check,
  CalendarClock, UserCheck, UserRound, ShieldCheck, FileText, CircleDot, Clock,
  Hourglass, Gauge, Layers,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import { SkeletonTable } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";

const STATUSES = ["todo", "doing", "done"];

// status → traffic-light-ish tint for the badge (open = rose, doing = amber,
// done = emerald — deliberately soft so they glow on the dark dashboard).
const STATUS_COLOR = { todo: "#F43F5E", doing: "#F59E0B", done: "#10B981" };

// Localized ISO-date formatter (mirrors the Leaders page) — turns 2026-07-02
// into "2-iyul, 2026" / "2 июля 2026" / "2nd July, 2026" per the active lang.
const MONTHS = {
  en:      ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru:      ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  uz:      ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  uz_cyrl: ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"],
};
const enOrd = (d) => { const t = d % 100; if (t >= 11 && t <= 13) return "th"; return ["th", "st", "nd", "rd"][d % 10] || "th"; };
const fmtDate = (iso, lang) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split(/[T ]/)[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  const mn = (MONTHS[lang] || MONTHS.uz)[m - 1];
  if (lang === "en") return `${d}${enOrd(d)} ${mn}, ${y}`;   // 2nd July, 2026
  if (lang === "ru") return `${d} ${mn} ${y}`;               // 2 июля 2026
  return `${d}-${mn}, ${y}`;                                 // 2-iyul, 2026 / 2-июл, 2026
};

// Card chrome + the Notion-style grid rule shared by every cell (mirrors Kaizen).
const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };
const cellB = { borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)" };

// Inline, editable status pill. Renders the traffic-light badge as a trigger and
// opens a compact portal dropdown (portal ⇒ never clipped by the table's
// overflow) so the status can be changed straight from the column.
function StatusSelect({ status, label, statusLabel, saving, onChange }) {
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
    if (saving) return;
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
        style={{ background: `${color}24`, color, cursor: saving ? "default" : "pointer" }}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        {label}
        {saving
          ? <Loader2 size={10} className="animate-spin" />
          : <ChevronDown size={10} style={{ opacity: 0.7 }} />}
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
// Card shell: tinted icon chip + uppercase label + a soft colour glow in the
// corner, with the metric body passed as children.
function InsightCard({ icon: Icon, tint, label, children }) {
  return (
    <div className="relative rounded-2xl p-4 flex flex-col gap-2 overflow-hidden" style={cardStyle}>
      <div aria-hidden className="absolute -top-10 -right-10 w-28 h-28 rounded-full pointer-events-none"
           style={{ background: tint, opacity: 0.1, filter: "blur(26px)" }} />
      <div className="flex items-center gap-2 relative">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
              style={{ background: `${tint}1f`, color: tint }}>
          <Icon size={15} />
        </span>
        <span className="text-[10px] uppercase tracking-wider font-semibold leading-tight" style={{ color: "var(--text-3)" }}>
          {label}
        </span>
      </div>
      {children}
    </div>
  );
}

// Big colour-coded number + unit, with an optional trailing qualifier ("avg").
function Metric({ value, unit, color, suffix }) {
  return (
    <div className="flex items-baseline gap-1.5 leading-none">
      <span className="text-3xl font-bold font-mono" style={{ color }}>{value}</span>
      {unit && <span className="text-xs font-medium" style={{ color: "var(--text-3)" }}>{unit}</span>}
      {suffix && <span className="text-[11px]" style={{ color: "var(--text-4)" }}>· {suffix}</span>}
    </div>
  );
}

// Small pill for the supporting detail row under each metric.
function Chip({ icon: Icon, children, color }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded-md whitespace-nowrap"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: color || "var(--text-3)" }}>
      {Icon && <Icon size={11} />}{children}
    </span>
  );
}

// Placeholder body when a card has nothing meaningful to surface.
function Empty({ icon: Icon, color, text }) {
  return (
    <div className="flex items-center gap-2 py-2">
      <Icon size={18} style={{ color }} />
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
// Period → [lo, hi] inclusive ISO bounds (null = unbounded on that side).
function periodBounds(period, startDate, endDate) {
  const today = localTodayIso();
  if (period === "today") return [today, today];
  if (period === "yesterday") { const y = isoMinusDays(today, 1); return [y, y]; }
  if (period === "last-week") return [isoMinusDays(today, 6), today];
  if (period === "custom") return [startDate || null, endDate || null];
  return [null, null];   // all time
}

const emptyForm = () => ({
  id: null,
  leader_ref: null,   // admin only: which leader this concern belongs to
  leader_name: "",    // display-only, used when editing an admin-owned row
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
  const qc = useQueryClient();
  const isAdmin = auth?.role === "admin";

  const statusLabel = (s) => t(`concerns.status.${s}`);

  // Top filter bar (mirrors the Leaders page): period + brigadir + leader.
  const [period, setPeriod] = useState("all");        // all | today | yesterday | last-week | custom
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [fBrig, setFBrig] = useState("All");          // admin: brigadir_manager_id (string) | "All"
  const [fLeader, setFLeader] = useState("All");      // admin: leader_role_ref (string) | "All"
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: null, dir: "asc" });   // table column sort

  const [expandedId, setExpandedId] = useState(null);   // row whose action bar is open
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Admin leader picker source ─────────────────────────────────────────────
  const { data: leaders = [] } = useQuery({
    queryKey: ["concern-leaders"],
    queryFn: () => api.get("/api/concerns/leaders").then((r) => r.data),
    enabled: isAdmin,
  });

  // Concern list ─────────────────────────────────────────────────────────────
  // Admins always fetch every concern and slice locally (period/brigadir/leader);
  // leaders only ever get their own rows from the backend.
  const { data: listResp, isLoading } = useQuery({
    queryKey: ["concerns", isAdmin ? "all" : "own", statusFilter],
    queryFn: () =>
      api
        .get("/api/concerns", {
          params: {
            ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          },
        })
        .then((r) => r.data),
  });
  const rows = listResp?.data || [];

  // ── brigadir → leader cascade, built from the fetched rows (admin only) ──────
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
      if (r.leader_role_ref == null) continue;
      if (fBrig !== "All" && String(r.brigadir_manager_id) !== fBrig) continue;
      if (!m.has(r.leader_role_ref)) m.set(r.leader_role_ref, r.leader_name || "—");
    }
    return [...m.entries()]
      .map(([id, name]) => ({ value: String(id), label: tl(name) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, fBrig, tl]);

  // Period + brigadir + leader filters (client-side, over the fetched rows).
  const scoped = useMemo(() => {
    const [lo, hi] = periodBounds(period, startDate, endDate);
    return rows.filter((r) => {
      if (lo && !(r.entry_date && r.entry_date >= lo)) return false;
      if (hi && !(r.entry_date && r.entry_date <= hi)) return false;
      if (fBrig !== "All" && String(r.brigadir_manager_id) !== fBrig) return false;
      if (fLeader !== "All" && String(r.leader_role_ref) !== fLeader) return false;
      return true;
    });
  }, [rows, period, startDate, endDate, fBrig, fLeader]);

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
      if (!slowest || avg > slowest.avg) slowest = { name, avg: Math.round(avg), n: g.n, open: g.open };
    }

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
    const peakShare = peak && open.length ? Math.round((peak.count / open.length) * 100) : 0;

    return { longest, slowest, peak, peakShare, openTotal: open.length };
  }, [scoped]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(
      (r) =>
        (r.concern_text || "").toLowerCase().includes(q) ||
        (r.concern_owner || "").toLowerCase().includes(q) ||
        (r.brigadir_name || "").toLowerCase().includes(q) ||
        (r.leader_name || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Admins always see the leader column (even when filtered to one leader).
  const showLeaderCol = isAdmin;

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
    ...(isAdmin ? { leader_ref: form.leader_ref } : {}),
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
    // Pre-select the leader the admin is currently filtering by, if any.
    setForm({ ...emptyForm(), leader_ref: isAdmin && fLeader !== "All" ? Number(fLeader) : null });
    setFormError("");
    setModalOpen(true);
  }
  function openEdit(r) {
    setForm({
      id: r.id,
      leader_ref: r.leader_role_ref,
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
    if (isAdmin && !form.id && !form.leader_ref) return setFormError(t("concerns.pickLeaderFirst"));
    if (!form.concern_owner.trim()) return setFormError(t("concerns.ownerRequired"));
    if (!form.concern_text.trim()) return setFormError(t("concerns.textRequired"));
    saveMutation.mutate();
  }

  const leaderOptions = leaders.map((l) => ({
    value: String(l.role_ref),
    label: l.brigadir_name ? `${tl(l.name)} · ${tl(l.brigadir_name)}` : tl(l.name),
  }));

  return (
    <Layout title={t("concerns.title")} showFilters={false}>
      {/* Filters — period + brigadir + leader (mirrors the Leaders page). Brigadir
          and leader are admin-only; a leader only ever sees their own concerns. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        {/* Period */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: "var(--text-4)" }}>{t("concerns.period")}</label>
          <StyledSelect
            value={period}
            onChange={setPeriod}
            options={[
              { value: "all", label: t("concerns.periodAll") },
              { value: "today", label: t("concerns.periodToday") },
              { value: "yesterday", label: t("concerns.periodYesterday") },
              { value: "last-week", label: t("concerns.periodWeek") },
              { value: "custom", label: t("concerns.periodCustom") },
            ]}
          />
          {period === "custom" && (
            <div className="flex items-center gap-1.5 mt-2">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="min-w-0 flex-1 text-xs rounded-lg px-2 py-1.5 outline-none" style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }} />
              <span style={{ color: "var(--text-4)" }}>—</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="min-w-0 flex-1 text-xs rounded-lg px-2 py-1.5 outline-none" style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }} />
            </div>
          )}
        </div>

        {/* Brigadir — admin only */}
        {isAdmin && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: "var(--text-4)" }}>{t("concerns.colSupervisor")}</label>
            <StyledSelect
              value={fBrig}
              onChange={(v) => { setFBrig(v); setFLeader("All"); }}
              options={[{ value: "All", label: t("concerns.allBrigadirs") }, ...brigOptions]}
            />
          </div>
        )}

        {/* Leader — admin only */}
        {isAdmin && (
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

      {/* KPIs — three headline insights (rich, colour-coded cards) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        {/* 1 ─ longest-running unresolved problem */}
        <InsightCard icon={Hourglass} tint="#ef4444" label={t("concerns.kpiLongestOpen")}>
          {insights.longest ? (
            <>
              <Metric value={insights.longest.age} unit={t("concerns.days")} color="#ef4444" />
              <div className="text-[13px] font-medium leading-snug line-clamp-2" style={{ color: "var(--text-1)" }} title={insights.longest.row.concern_text}>
                {tl(insights.longest.row.concern_text)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <Chip icon={UserRound}>{tl(insights.longest.row.concern_owner)}</Chip>
                <Chip icon={CalendarClock}><span className="font-mono">{insights.longest.row.entry_date}</span></Chip>
              </div>
            </>
          ) : (
            <Empty icon={ShieldCheck} color="#22c55e" text={t("concerns.allClear")} />
          )}
        </InsightCard>

        {/* 2 ─ slowest-resolving brigadir */}
        <InsightCard icon={Gauge} tint="#f59e0b" label={t("concerns.kpiSlowestBrigadir")}>
          {insights.slowest ? (
            <>
              <Metric value={insights.slowest.avg} unit={t("concerns.days")} color="#f59e0b" suffix={t("concerns.avgShort")} />
              <div className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: "var(--text-1)" }} title={insights.slowest.name}>
                {tl(insights.slowest.name)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <Chip icon={Layers}>{insights.slowest.n} {t("concerns.itemsUnit")}</Chip>
                {insights.slowest.open > 0 && (
                  <Chip color="#f59e0b"><span className="w-1.5 h-1.5 rounded-full" style={{ background: "#f59e0b" }} />{insights.slowest.open} {t("concerns.openLower")}</Chip>
                )}
              </div>
            </>
          ) : (
            <Empty icon={Gauge} color="var(--text-4)" text={t("concerns.noData")} />
          )}
        </InsightCard>

        {/* 3 ─ date carrying the most still-open concerns */}
        <InsightCard icon={CalendarClock} tint="#3b82f6" label={t("concerns.kpiPeakDate")}>
          {insights.peak ? (
            <>
              <Metric value={insights.peak.count} unit={t("concerns.openLower")} color="#3b82f6" />
              <div className="text-[15px] font-bold font-mono leading-snug" style={{ color: "var(--text-1)" }}>
                {insights.peak.date}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <Chip icon={Layers}>{insights.peakShare}% {t("concerns.ofOpen")}</Chip>
              </div>
            </>
          ) : (
            <Empty icon={ShieldCheck} color="#22c55e" text={t("concerns.allClear")} />
          )}
        </InsightCard>
      </div>

      {/* Task table — header band (title · count · search · filters · add) over a
          grid-ruled, sortable, icon-led table (mirrors the Kaizen task list). */}
      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
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
                className="pl-8 pr-3 py-1.5 rounded-lg text-xs w-44 outline-none"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
              />
            </div>
            <StyledSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: t("concerns.allStatuses") },
                ...STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
              ]}
              className="w-36"
              triggerClassName="px-3 py-1.5 text-xs"
            />
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[var(--brand)] hover:bg-[var(--brand-text)] text-white transition-colors"
            >
              <Plus size={14} /> {t("concerns.add")}
            </button>
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
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const expanded = expandedId === r.id;
                  const colSpan = showLeaderCol ? 7 : 6;
                  return (
                    <Fragment key={r.id}>
                      {/* Click a row to reveal its Edit/Delete action bar (Staff-style) */}
                      <tr
                        onClick={() => setExpandedId(expanded ? null : r.id)}
                        className="align-top cursor-pointer hover:bg-white/5"
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
              {/* Leader — admin picks who the concern belongs to (fixed on edit) */}
              {isAdmin && (
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
                      value={form.leader_ref ? String(form.leader_ref) : ""}
                      onChange={(v) => setForm((f) => ({ ...f, leader_ref: v ? Number(v) : null }))}
                      options={leaderOptions}
                      placeholder={t("concerns.pickLeader")}
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
