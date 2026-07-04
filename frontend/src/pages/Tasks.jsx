import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Plus, Pencil, Trash2, X, Search, AlertTriangle, Loader2, ClipboardList,
  ChevronDown, ChevronUp, ChevronsUpDown, Check, MessageSquare, Send,
  CalendarClock, UserCheck, ShieldCheck, FileText, CircleDot, Hash,
  ListTodo, CheckCircle2, Timer, TrendingUp, PieChart, XCircle, ArrowLeft, Gauge,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import DateRangePicker from "../components/ui/DateRangePicker";
import { FilterPanel, OptsFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonTable, SkeletonChart } from "../components/ui/Skeleton";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { padChartFrom } from "../utils/chartRange";

const STATUSES = ["todo", "doing", "done"];

// Status pills share the app-wide traffic-light convention (Concerns/Kaizen):
// todo grey (no process yet) · doing yellow · done green; red is reserved for
// overdue, which lives on the due-date cell and in the charts.
const STATUS_COLOR = { todo: "#94a3b8", doing: "#eab308", done: "#22c55e" };
const CHART_BRAND = "#C8973F";
const CHART_TODO = "#94a3b8";
const CHART_OVERDUE = "#ef4444";

// Priority chips mirror the old Google-Sheet urgency chips: 1 red, 2 orange,
// 3 amber, everything further back a neutral grey.
const priorityColor = (p) =>
  p === 1 ? "#ef4444" : p === 2 ? "#f97316" : p === 3 ? "#eab308" : "#94a3b8";

// Localized ISO-date formatter (same as Concerns/Leaders).
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
  if (lang === "en" || lang === "ru") return `${d} ${mn} ${y}`;
  return `${d}-${mn}, ${y}`;
};
const fmtTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const cardStyle = { background: "var(--bg-card)", border: "1px solid var(--border)" };

const pad2 = (n) => String(n).padStart(2, "0");
const localTodayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const isoMinusDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
// Shared portal-dropdown positioning (mirrors the Concerns StatusSelect).
function useDropdown(minHeight = 150) {
  const [open, setOpen] = useState(false);
  const [dropStyle, setDropStyle] = useState({});
  const triggerRef = useRef(null);
  const listRef = useRef(null);

  function computeDropStyle() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return {};
    const vh = window.innerHeight;
    const spaceBelow = vh - rect.bottom - 8;
    const spaceAbove = rect.top - 8;
    const openUp = spaceBelow < minHeight && spaceAbove > spaceBelow;
    return {
      position: "fixed",
      left: Math.min(rect.left, window.innerWidth - 240),
      minWidth: Math.max(rect.width, 150),
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

  function toggle(saving) {
    if (saving) return;
    if (open) setOpen(false);
    else { setDropStyle(computeDropStyle()); setOpen(true); }
  }

  return { open, setOpen, dropStyle, triggerRef, listRef, toggle };
}

const dropCard = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-md)",
  borderRadius: 10,
  boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
  padding: 4,
};

// Inline, editable status pill (portal dropdown ⇒ never clipped by the table).
function StatusSelect({ status, statusLabel, saving, editable, onChange }) {
  const { open, setOpen, dropStyle, triggerRef, listRef, toggle } = useDropdown();
  const color = STATUS_COLOR[status] || "var(--text-3)";

  const dropdown = open
    ? createPortal(
        <div ref={listRef} style={{ ...dropStyle, ...dropCard }}>
          {STATUSES.map((s) => {
            const c = STATUS_COLOR[s] || "var(--text-3)";
            const isSel = s === status;
            return (
              <button
                key={s}
                type="button"
                onClick={() => { setOpen(false); if (s !== status) onChange(s); }}
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
        onClick={() => editable && toggle(saving)}
        className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
        style={{ background: `${color}24`, color, cursor: editable && !saving ? "pointer" : "default" }}
      >
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
        {statusLabel(status)}
        {saving
          ? <Loader2 size={10} className="animate-spin" />
          : editable && <ChevronDown size={10} style={{ opacity: 0.7 }} />}
      </button>
      {dropdown}
    </>
  );
}

// Two-step priority editor: pick the new position, then choose how the rest of
// the queue reacts — swap the two positions, or shift everything in between.
function PrioritySelect({ priority, count, saving, editable, onApply, t }) {
  const { open, setOpen, dropStyle, triggerRef, listRef, toggle } = useDropdown(220);
  const [picked, setPicked] = useState(null);
  const color = priorityColor(priority);

  function openMenu() {
    setPicked(null);
    toggle(saving);
  }

  const options = [];
  for (let p = 1; p <= count; p++) if (p !== priority) options.push(p);

  const dropdown = open
    ? createPortal(
        <div ref={listRef} style={{ ...dropStyle, ...dropCard, width: 230, padding: 10 }}>
          {picked == null ? (
            <>
              <div className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: "var(--text-4)" }}>
                {t("tasks.priorityPick")}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {options.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPicked(p)}
                    className="h-8 rounded-lg text-xs font-bold tabular-nums transition-colors"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
                    onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-md)")}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold mb-2 transition-colors"
                style={{ color: "var(--text-4)" }}
              >
                <ArrowLeft size={11} />
                <span className="tabular-nums" style={{ color: "var(--text-2)" }}>{priority} → {picked}</span>
              </button>
              {[
                { mode: "swap", label: t("tasks.prioritySwap"), desc: t("tasks.prioritySwapDesc") },
                { mode: "shift", label: t("tasks.priorityShift"), desc: t("tasks.priorityShiftDesc") },
              ].map((o) => (
                <button
                  key={o.mode}
                  type="button"
                  onClick={() => { setOpen(false); onApply(picked, o.mode); }}
                  className="w-full text-left px-2.5 py-2 rounded-lg mb-1 transition-colors"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--brand)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-md)")}
                >
                  <div className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>{o.label}</div>
                  <div className="text-[10px] mt-0.5" style={{ color: "var(--text-4)" }}>{o.desc}</div>
                </button>
              ))}
            </>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => editable && openMenu()}
        className="inline-flex items-center gap-1 text-[11px] font-bold tabular-nums px-2 py-0.5 rounded-full"
        style={{ background: `${color}24`, color, cursor: editable && !saving ? "pointer" : "default" }}
      >
        {priority}
        {saving
          ? <Loader2 size={10} className="animate-spin" />
          : editable && <ChevronDown size={10} style={{ opacity: 0.7 }} />}
      </button>
      {dropdown}
    </>
  );
}

function SortIcon({ active, dir }) {
  const Icon = !active ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
  return <Icon size={11} style={{ opacity: active ? 1 : 0.4, color: active ? "var(--brand-text)" : "inherit" }} />;
}

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

// Compact KPI card — icon chip + label + big number (six of them fit one row).
function Kpi({ icon: Icon, tint, label, value, sub }) {
  return (
    <div className="rounded-2xl px-3.5 py-3 flex flex-col gap-2" style={cardStyle}>
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg flex-shrink-0"
              style={{ background: `${tint}1f`, color: tint }}>
          <Icon size={14} />
        </span>
        <span className="text-[10px] uppercase tracking-wider font-semibold leading-tight truncate" style={{ color: "var(--text-3)" }}>
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5 leading-none">
        <span className="text-2xl font-bold tracking-tight tabular-nums" style={{ color: tint }}>{value}</span>
        {sub && <span className="text-[10px] font-medium" style={{ color: "var(--text-4)" }}>{sub}</span>}
      </div>
    </div>
  );
}

// ── chat-style comments modal ─────────────────────────────────────────────────
function CommentsModal({ task, canComment, onClose }) {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const myId = auth?.telegram_id ? String(auth.telegram_id) : null;
  const [text, setText] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const listEndRef = useRef(null);
  const qKey = ["task-comments", task.id];

  const { data: comments = [], isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => api.get(`/api/tasks/${task.id}/comments`).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: qKey });
    qc.invalidateQueries({ queryKey: ["leader-tasks"] });   // comment_count on the row
  };

  const addMutation = useMutation({
    mutationFn: () => api.post(`/api/tasks/${task.id}/comments`, { text }),
    onSuccess: () => { setText(""); invalidate(); },
  });
  const editMutation = useMutation({
    mutationFn: (id) => api.put(`/api/tasks/${task.id}/comments/${id}`, { text: editText }),
    onSuccess: () => { setEditingId(null); setEditText(""); invalidate(); },
  });
  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/tasks/${task.id}/comments/${id}`),
    onSuccess: invalidate,
  });

  // Keep the newest message in view when the thread loads or grows.
  useEffect(() => {
    listEndRef.current?.scrollIntoView({ block: "end" });
  }, [comments.length, isLoading]);

  // Server-resolved: ownership is per-profile (one account can hold several
  // profiles). Fallback for responses cached before is_own existed.
  const isOwn = (c) => c.is_own ?? (myId && String(c.author_telegram_id) === myId);

  function send() {
    if (!text.trim() || addMutation.isPending) return;
    addMutation.mutate();
  }

  return (
    <Modal
      onClose={onClose}
      maxWidth="max-w-md"
      icon={<MessageSquare size={15} className="flex-shrink-0 text-[var(--brand-text)]" />}
      title={t("tasks.commentsTitle")}
      subtitle={tl(task.task_text)}
      bodyClassName="p-0 flex flex-col"
    >
        {/* Thread */}
        <div className="overflow-y-auto px-4 py-3 space-y-2.5" style={{ flex: "1 1 auto", minHeight: 160 }}>
          {isLoading ? (
            <div className="space-y-2.5">
              <SkeletonBlock className="h-14 w-3/4" />
              <SkeletonBlock className="h-14 w-3/4 ml-auto" />
              <SkeletonBlock className="h-14 w-2/3" />
            </div>
          ) : comments.length === 0 ? (
            <div className="text-xs text-center py-8" style={{ color: "var(--text-4)" }}>{t("tasks.noComments")}</div>
          ) : (
            comments.map((c) => {
              const own = isOwn(c);
              return (
                <div key={c.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-2"
                    style={own
                      ? { background: "var(--brand-bg)", border: "1px solid var(--brand-border)" }
                      : { background: "var(--bg-inner)", border: "1px solid var(--border)" }}
                  >
                    <div className="text-[10px] font-semibold mb-0.5" style={{ color: "var(--brand-text)" }}>
                      {tl(c.author_name) || "—"}
                    </div>
                    {editingId === c.id ? (
                      <div>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={2}
                          autoFocus
                          className="w-full rounded-lg px-2 py-1.5 text-xs outline-none resize-none"
                          style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: "var(--text-1)", minWidth: 180 }}
                        />
                        <div className="flex gap-2 mt-1.5">
                          <button
                            onClick={() => editMutation.mutate(c.id)}
                            disabled={!editText.trim() || editMutation.isPending}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold bg-[var(--brand)] text-white disabled:opacity-40"
                          >
                            {editMutation.isPending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                            {t("tasks.save")}
                          </button>
                          <button onClick={() => { setEditingId(null); setEditText(""); }} className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px]" style={{ color: "var(--text-3)" }}>
                            <XCircle size={11} /> {t("tasks.cancel")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{c.text}</div>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px]" style={{ color: "var(--text-4)" }}>
                        {fmtDate(c.created_at, lang)} · {fmtTime(c.created_at)}
                        {c.edited_at && <> · {t("tasks.edited")}</>}
                      </span>
                      {own && editingId !== c.id && (
                        <span className="flex items-center gap-1.5 ml-auto">
                          <button onClick={() => { setEditingId(c.id); setEditText(c.text); }} style={{ color: "var(--text-4)" }} className="hover:text-[var(--brand-text)] transition-colors">
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(c.id)}
                            disabled={deleteMutation.isPending}
                            style={{ color: "var(--text-4)" }}
                            className="hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={11} />
                          </button>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={listEndRef} />
        </div>

        {/* Composer */}
        {canComment && (
          <div className="px-4 py-3 flex items-end gap-2 flex-shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t("tasks.commentPlaceholder")}
              rows={2}
              className="flex-1 rounded-xl px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
            <button
              onClick={send}
              disabled={!text.trim() || addMutation.isPending}
              className="flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 bg-[var(--brand)] hover:bg-[var(--brand-text)] text-white disabled:opacity-40 transition-colors"
              aria-label={t("tasks.commentPlaceholder")}
            >
              {addMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
            </button>
          </div>
        )}
    </Modal>
  );
}

const emptyForm = () => ({
  id: null,
  leader_ref: null,
  leader_name: "",
  task_text: "",
  due_date: "",
  comment: "",
});

export default function Tasks() {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, labelColor, legendColor, gridColor, tooltipTheme } = useChartTheme();
  const qc = useQueryClient();
  const role = auth?.role;
  const isAdmin = role === "admin";
  const isSupervisor = role === "supervisor";
  const isLeader = role === "leader";
  const canMutateStatus = isAdmin || isSupervisor || isLeader;
  const canReorder = isAdmin || isSupervisor;

  const statusLabel = (s) => t(`tasks.status.${s}`);

  // Top filter bar: period (by creation date) + supervisor/leader cascade.
  // Period is a concrete date range picked with the same control as Leaders
  // (presets + calendar popover); defaults to the last 7 days.
  const [startDate, setStartDate] = useState(() => isoMinusDays(localTodayIso(), 6));
  const [endDate, setEndDate] = useState(() => localTodayIso());
  const [fSup, setFSup] = useState("All");       // admin only
  const [fLeader, setFLeader] = useState("All"); // admin + supervisor
  const [search, setSearch] = useState("");
  const [statusSel, setStatusSel] = useState([]);
  const [sort, setSort] = useState({ key: null, dir: "asc" });

  const [expandedId, setExpandedId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [commentsTask, setCommentsTask] = useState(null);

  // Task list — backend scopes by role (admin all / supervisor unit / leader own).
  const { data: listResp, isLoading } = useQuery({
    queryKey: ["leader-tasks"],
    queryFn: () => api.get("/api/tasks").then((r) => r.data),
  });
  const rows = listResp?.data || [];
  const canCreate = !!listResp?.can_create;

  // Create-form picker source (admins: all leaders; supervisors: their own).
  const { data: leaders = [] } = useQuery({
    queryKey: ["task-leaders"],
    queryFn: () => api.get("/api/tasks/leaders").then((r) => r.data),
    enabled: canCreate,
  });

  // Hold charts back until the grid has its final width (same fix as Kaizen).
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    if (isLoading) return undefined;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setChartsReady(true));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [isLoading]);

  // Active-queue size per leader — drives the priority editor's option list.
  const activeCounts = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.status === "done") continue;
      m.set(r.leader_role_ref, (m.get(r.leader_role_ref) || 0) + 1);
    }
    return m;
  }, [rows]);

  // Supervisor → leader cascade options, built from the fetched rows.
  const supOptions = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.supervisor_manager_id == null) continue;
      if (!m.has(r.supervisor_manager_id)) m.set(r.supervisor_manager_id, r.supervisor_name || "—");
    }
    return [...m.entries()]
      .map(([id, name]) => ({ value: String(id), label: tl(name) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, tl]);

  const leaderFilterOptions = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.leader_role_ref == null) continue;
      if (fSup !== "All" && String(r.supervisor_manager_id) !== fSup) continue;
      if (!m.has(r.leader_role_ref)) m.set(r.leader_role_ref, r.leader_name || "—");
    }
    return [...m.entries()]
      .map(([id, name]) => ({ value: String(id), label: tl(name) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, fSup, tl]);

  const createdDay = (r) => (r.created_at || "").slice(0, 10);

  // Period + supervisor + leader scope.
  const scoped = useMemo(() => {
    return rows.filter((r) => {
      const day = createdDay(r);
      if (startDate && !(day && day >= startDate)) return false;
      if (endDate && !(day && day <= endDate)) return false;
      if (fSup !== "All" && String(r.supervisor_manager_id) !== fSup) return false;
      if (fLeader !== "All" && String(r.leader_role_ref) !== fLeader) return false;
      return true;
    });
  }, [rows, startDate, endDate, fSup, fLeader]);

  // Trend-chart scope: same filters with the period start pulled back so the
  // chart never spans fewer than 7 days (n..n+4 charts as n-2..n+4). KPIs,
  // donut and table keep the exact selected period.
  const chartStart = padChartFrom(startDate, endDate);
  const chartScoped = useMemo(() => {
    if (chartStart === startDate) return scoped;
    return rows.filter((r) => {
      const day = createdDay(r);
      if (chartStart && !(day && day >= chartStart)) return false;
      if (endDate && !(day && day <= endDate)) return false;
      if (fSup !== "All" && String(r.supervisor_manager_id) !== fSup) return false;
      if (fLeader !== "All" && String(r.leader_role_ref) !== fLeader) return false;
      return true;
    });
  }, [rows, scoped, chartStart, startDate, endDate, fSup, fLeader]);

  // Table filters (status multi-select + free text) over the scoped rows.
  const tableFilterPred = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (r) => {
      if (statusSel.length && !statusSel.includes(r.status)) return false;
      if (q) {
        const hit =
          (r.task_text || "").toLowerCase().includes(q) ||
          (r.leader_name || "").toLowerCase().includes(q) ||
          (r.supervisor_name || "").toLowerCase().includes(q) ||
          (r.created_by_name || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    };
  }, [search, statusSel]);

  const filtered = useMemo(() => scoped.filter(tableFilterPred), [scoped, tableFilterPred]);
  const chartFiltered = useMemo(
    () => (chartScoped === scoped ? null : chartScoped.filter(tableFilterPred)),
    [chartScoped, scoped, tableFilterPred]);

  const today = localTodayIso();
  const isOverdue = (r) => r.status !== "done" && r.due_date && r.due_date < today;

  // KPIs + chart data over the fully filtered rows, so every filter reshapes
  // them. KPI buckets use the selected period; the trend uses the padded
  // chart window (≥7 days) with the axis pinned to it.
  const stats = useMemo(() => {
    let done = 0, doing = 0, todo = 0, overdue = 0;
    for (const r of filtered) {
      if (r.status === "done") done += 1;
      else if (isOverdue(r)) overdue += 1;
      else if (r.status === "doing") doing += 1;
      else todo += 1;
    }

    const trendRows = chartFiltered ?? filtered;
    const opened = new Map(), closed = new Map();
    let trendOpen = 0;
    for (const r of trendRows) {
      if (r.status !== "done") trendOpen += 1;
      const day = createdDay(r);
      if (!day) continue;
      opened.set(day, (opened.get(day) || 0) + 1);
      if (r.status === "done") {
        const closeIso = (r.completed_at || "").slice(0, 10);
        const eff = closeIso && closeIso >= day ? closeIso : day;
        closed.set(eff, (closed.get(eff) || 0) + 1);
      }
    }

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
    const total = filtered.length;
    return { done, doing, todo, overdue, total, trend, maxOpen, completion: total ? done / total : null };
  }, [filtered, chartFiltered, chartStart, endDate, today]);

  // ── column sort (asc → desc → off). Done tasks always sit below the active
  // queue; sorting applies within each group.
  const onSort = (k) => setSort((s) =>
    s.key !== k ? { key: k, dir: "asc" }
      : s.dir === "asc" ? { key: k, dir: "desc" }
      : { key: null, dir: "asc" });

  const sorted = useMemo(() => {
    const active = filtered.filter((r) => r.status !== "done");
    const done = filtered.filter((r) => r.status === "done");

    if (!sort.key) {
      active.sort((a, b) =>
        tl(a.leader_name || "").localeCompare(tl(b.leader_name || "")) || (a.priority || 0) - (b.priority || 0));
      done.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
      return [...active, ...done];
    }

    const val = (r) => {
      switch (sort.key) {
        case "task":       return tl(r.task_text || "");
        case "priority":   return r.priority ?? Infinity;
        case "supervisor": return tl(r.supervisor_name || "");
        case "leader":     return tl(r.leader_name || "");
        case "status":     return STATUSES.indexOf(r.status);
        case "due":        return r.due_date || "";
        case "comments":   return r.comment_count || 0;
        default:           return "";
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    const cmp = (a, b) => {
      const va = val(a), vb = val(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    };
    active.sort(cmp);
    done.sort(cmp);
    return [...active, ...done];
  }, [filtered, sort, tl]);

  // ── mutations ────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries({ queryKey: ["leader-tasks"] });

  const saveMutation = useMutation({
    mutationFn: () =>
      form.id
        ? api.put(`/api/tasks/${form.id}`, { task_text: form.task_text.trim(), due_date: form.due_date }).then((r) => r.data)
        : api.post("/api/tasks", {
            task_text: form.task_text.trim(),
            leader_ref: form.leader_ref,
            due_date: form.due_date,
            comment: form.comment.trim() || null,
          }).then((r) => r.data),
    onSuccess: () => { invalidate(); closeModal(); },
    onError: (e) => setFormError(e?.response?.data?.detail || t("tasks.saveError")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.delete(`/api/tasks/${id}`),
    onSuccess: () => { invalidate(); setConfirmDelete(null); setExpandedId(null); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/api/tasks/${id}/status`, { status }).then((r) => r.data),
    onSuccess: invalidate,
  });
  const savingStatusId = statusMutation.isPending ? statusMutation.variables?.id : null;

  const priorityMutation = useMutation({
    mutationFn: ({ id, priority, mode }) => api.patch(`/api/tasks/${id}/priority`, { priority, mode }).then((r) => r.data),
    onSuccess: invalidate,
  });
  const savingPriorityId = priorityMutation.isPending ? priorityMutation.variables?.id : null;

  // ── modal helpers ─────────────────────────────────────────────────────────
  function openCreate() {
    setForm({ ...emptyForm(), leader_ref: fLeader !== "All" ? Number(fLeader) : null });
    setFormError("");
    setModalOpen(true);
  }
  function openEdit(r) {
    setForm({
      id: r.id,
      leader_ref: r.leader_role_ref,
      leader_name: r.leader_name || "",
      task_text: r.task_text || "",
      due_date: r.due_date || "",
      comment: "",
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
    if (!form.id && !form.leader_ref) return setFormError(t("tasks.pickLeader"));
    if (!form.task_text.trim()) return setFormError(t("tasks.textRequired"));
    if (!form.due_date) return setFormError(t("tasks.dueRequired"));
    saveMutation.mutate();
  }

  const leaderOptions = leaders.map((l) => ({
    value: String(l.role_ref),
    label: isAdmin && l.supervisor_name ? `${tl(l.name)} · ${tl(l.supervisor_name)}` : tl(l.name),
  }));

  // ── consolidated table filter button ────────────────────────────────────────
  const filterSections = [
    {
      key: "status", icon: CircleDot, label: t("tasks.colStatus"),
      active: statusSel.length > 0,
      display: `${statusSel.length} ${t("filter.selected2")}`,
      render: () => (
        <OptsFilter opts={STATUSES} sel={statusSel} onChange={setStatusSel} render={(s) => statusLabel(s)} />
      ),
    },
  ];
  const filterActiveCount = statusSel.length > 0 ? 1 : 0;

  // ── table columns (role-dependent) ─────────────────────────────────────────
  const COLS = [
    { key: "task",       icon: FileText,      label: t("tasks.colTask"),       align: "left" },
    { key: "priority",   icon: Hash,          label: t("tasks.colPriority"),   align: "center" },
    ...(isAdmin ? [{ key: "supervisor", icon: ShieldCheck, label: t("tasks.colSupervisor"), align: "left" }] : []),
    ...(!isLeader ? [{ key: "leader",   icon: UserCheck,   label: t("tasks.colLeader"),     align: "left" }] : []),
    { key: "status",     icon: CircleDot,     label: t("tasks.colStatus"),     align: "left" },
    { key: "due",        icon: CalendarClock, label: t("tasks.colDue"),        align: "left" },
    { key: "comments",   icon: MessageSquare, label: t("tasks.colComments"),   align: "center" },
  ];

  // ── charts (Concerns/Kaizen styling) ────────────────────────────────────────
  const trendDays = stats.trend.map((p) => p.day);
  const dayTick = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
  const lineSeries = [{ name: t("tasks.seriesOpen"), data: stats.trend.map((p) => p.open) }];
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
    yaxis: {
      min: 0,
      max: Math.max(stats.maxOpen, 1),
      tickAmount: Math.min(Math.max(stats.maxOpen, 1), 5),
      labels: { style: { colors: labelColor, fontSize: "11px" }, formatter: (v) => Math.round(v) },
    },
    grid: { borderColor: gridColor, strokeDashArray: 3, padding: { left: 6, right: 6 } },
    markers: { size: stats.trend.length === 1 ? 4 : 0, hover: { size: 5 } },
    legend: { show: false },
    tooltip: {
      theme: tooltipTheme,
      x: { formatter: (_v, { dataPointIndex }) => fmtDate(trendDays[dataPointIndex] || "", lang) },
    },
  };

  const openCards = [
    { label: t("tasks.cardOpen"),      color: CHART_BRAND,        n: stats.todo + stats.doing + stats.overdue },
    { label: statusLabel("todo"),      color: CHART_TODO,         n: stats.todo },
    { label: statusLabel("doing"),     color: STATUS_COLOR.doing, n: stats.doing },
    { label: t("tasks.kpiOverdue"),    color: CHART_OVERDUE,      n: stats.overdue },
  ];

  const donutRows = [
    { label: statusLabel("done"),   color: STATUS_COLOR.done,  n: stats.done },
    { label: statusLabel("doing"),  color: STATUS_COLOR.doing, n: stats.doing },
    { label: statusLabel("todo"),   color: CHART_TODO,         n: stats.todo },
    { label: t("tasks.kpiOverdue"), color: CHART_OVERDUE,      n: stats.overdue },
  ];
  const donutSeries = donutRows.map((r) => r.n);
  const donutOpts = {
    chart: { type: "donut", fontFamily: "inherit", background: "transparent", animations: { enabled: false } },
    labels: donutRows.map((r) => r.label),
    colors: donutRows.map((r) => r.color),
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${v} ${t("tasks.itemsUnit")}` } },
    plotOptions: { pie: { donut: {
      size: "72%",
      labels: {
        show: true,
        name: { offsetY: 20, color: legendColor, fontSize: "11px" },
        value: { offsetY: -16, color: "var(--text-1)", fontSize: "28px", fontWeight: 700 },
        total: { show: true, label: t("tasks.kpiTotal"), color: legendColor, fontSize: "11px", formatter: () => String(stats.total) },
      },
    } } },
  };

  const completionPct = stats.completion == null ? "—" : `${Math.round(stats.completion * 100)}%`;
  const completionColor = stats.completion == null ? "var(--text-3)"
    : stats.completion >= 0.8 ? "#22c55e" : stats.completion >= 0.5 ? "#eab308" : "#ef4444";

  const cellB = { borderBottom: "1px solid var(--border)" };

  return (
    <Layout title={t("tasks.title")} showFilters={false}>
      {/* Filters — period + supervisor/leader cascade (role-scoped) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
        {/* Period — same range picker as the Leaders page (presets + calendar) */}
        <div>
          <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: "var(--text-4)" }}>{t("tasks.period")}</label>
          <DateRangePicker
            dateFrom={startDate}
            dateTo={endDate}
            setDateFrom={setStartDate}
            setDateTo={setEndDate}
            triggerClassName="w-full px-3 py-2 text-sm"
          />
        </div>

        {isAdmin && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: "var(--text-4)" }}>{t("tasks.colSupervisor")}</label>
            <StyledSelect
              value={fSup}
              onChange={(v) => { setFSup(v); setFLeader("All"); }}
              options={[{ value: "All", label: t("tasks.allSupervisors") }, ...supOptions]}
            />
          </div>
        )}

        {!isLeader && (
          <div>
            <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: "var(--text-4)" }}>{t("tasks.colLeader")}</label>
            <StyledSelect
              value={fLeader}
              onChange={setFLeader}
              options={[{ value: "All", label: t("tasks.allLeaders") }, ...leaderFilterOptions]}
            />
          </div>
        )}
      </div>

      {/* KPI row — six compact, colour-coded cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={`kpi-sk-${i}`} className="rounded-2xl px-3.5 py-3" style={cardStyle}>
              <SkeletonBlock className="h-3 w-16 mb-3" />
              <SkeletonBlock className="h-7 w-12" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-4">
          <Kpi icon={ClipboardList} tint={CHART_BRAND}        label={t("tasks.kpiTotal")}      value={stats.total} />
          <Kpi icon={ListTodo}      tint={CHART_TODO}         label={statusLabel("todo")}      value={stats.todo} />
          <Kpi icon={Timer}         tint={STATUS_COLOR.doing} label={statusLabel("doing")}     value={stats.doing} />
          <Kpi icon={CheckCircle2}  tint={STATUS_COLOR.done}  label={statusLabel("done")}      value={stats.done} />
          <Kpi icon={AlertTriangle} tint={CHART_OVERDUE}      label={t("tasks.kpiOverdue")}    value={stats.overdue} />
          <Kpi icon={Gauge}         tint={completionColor}    label={t("tasks.kpiCompletion")} value={completionPct} />
        </div>
      )}

      {/* Charts — open-task trend + status donut over the fully filtered rows */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
        <div className="lg:col-span-2 rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <div className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
              <TrendingUp size={14} style={{ color: "var(--brand-text)" }} />
              {t("tasks.chartTrend")}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>{t("tasks.chartTrendSub")}</div>
          </div>
          {isLoading ? (
            <div className="p-4"><SkeletonChart className="h-52" /></div>
          ) : stats.trend.length ? (
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
            <div className="grid place-items-center text-xs" style={{ color: "var(--text-4)", height: 232 }}>{t("tasks.noData")}</div>
          )}
        </div>

        <div className="rounded-2xl overflow-hidden flex flex-col" style={cardStyle}>
          <div className="flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)", borderBottom: "1px solid var(--border)" }}>
            <PieChart size={14} style={{ color: "var(--brand-text)" }} />
            {t("tasks.chartStatusTitle")}
          </div>
          {isLoading ? (
            <div className="p-4"><SkeletonChart className="h-52" /></div>
          ) : stats.total ? (
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
            <div className="grid place-items-center text-xs flex-1" style={{ color: "var(--text-4)", minHeight: 180 }}>{t("tasks.noData")}</div>
          )}
        </div>
      </div>

      {/* Task table — POSITIONS-style card: header band, toolbar, sticky-header
          grid table with per-column sort. */}
      <div className="rounded-2xl overflow-hidden mb-8" style={cardStyle}>
        <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
            <ClipboardList size={14} style={{ color: "var(--brand-text)" }} />
            {t("tasks.listTitle")}
            <span className="text-[11px] font-normal normal-case tracking-normal tabular-nums" style={{ color: "var(--text-4)" }}>
              ({sorted.length}{sorted.length !== rows.length ? ` / ${rows.length}` : ""})
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-4)" }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("tasks.search")}
                className="h-8 pl-8 pr-7 rounded-lg text-xs w-44 outline-none"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2" style={{ color: "var(--text-4)" }} aria-label="clear">
                  <X size={13} />
                </button>
              )}
            </div>
            <FilterPanel
              sections={filterSections}
              activeCount={filterActiveCount}
              anyActive={filterActiveCount > 0}
              onClearAll={() => setStatusSel([])}
              compact
            />
            {canCreate && (
              <button
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold bg-[var(--brand)] hover:bg-[var(--brand-text)] text-white transition-colors"
              >
                <Plus size={14} /> {t("tasks.add")}
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="p-4"><SkeletonTable rows={6} cols={COLS.length} /></div>
        ) : sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3">
            <ClipboardList size={28} style={{ color: "var(--text-4)" }} />
            <div className="text-sm" style={{ color: "var(--text-3)" }}>
              {rows.length === 0 ? t("tasks.empty") : t("tasks.noMatch")}
            </div>
          </div>
        ) : (
          <div className="overflow-auto max-h-[70vh]">
            <table className="w-full text-xs [&_th:not(:last-child)]:border-r [&_td:not(:last-child)]:border-r [&_th]:border-[var(--border)] [&_td]:border-[var(--border)]" style={{ color: "var(--text-1)", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: "var(--text-3)" }}>
                  {COLS.map((c) => (
                    <th key={c.key}
                      onClick={() => onSort(c.key)}
                      aria-sort={sort.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                      className={`sticky top-0 z-10 px-3 py-2.5 font-semibold cursor-pointer select-none whitespace-nowrap transition-colors hover:bg-[var(--bg-accent)] ${c.align === "center" ? "text-center" : "text-left"}`}
                      style={{ background: "var(--bg-inner)", borderBottom: "1px solid var(--border)" }}>
                      <span className={`inline-flex items-center gap-1.5 ${c.align === "center" ? "justify-center" : ""}`}>
                        <c.icon size={12} style={{ color: "var(--brand-text)" }} />
                        {c.label}
                        <SortIcon active={sort.key === c.key} dir={sort.dir} />
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const expanded = expandedId === r.id;
                  const overdue = isOverdue(r);
                  const canEditRow = r.can_edit;
                  const nActive = activeCounts.get(r.leader_role_ref) || 0;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => canEditRow && setExpandedId(expanded ? null : r.id)}
                        className={`align-top transition-colors hover:bg-[var(--bg-inner)] ${canEditRow ? "cursor-pointer" : ""}`}
                        style={{ background: expanded ? "var(--bg-inner)" : "transparent", opacity: r.status === "done" ? 0.75 : 1 }}
                      >
                        <td className="px-3 py-2.5 min-w-[240px] max-w-md" style={cellB}>
                          <div className="line-clamp-2" title={r.task_text}>{tl(r.task_text)}</div>
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap" style={cellB} onClick={(e) => e.stopPropagation()}>
                          {r.status === "done" || r.priority == null ? (
                            <span style={{ color: "var(--text-4)" }}>—</span>
                          ) : (
                            <PrioritySelect
                              priority={r.priority}
                              count={nActive}
                              saving={savingPriorityId === r.id}
                              editable={canReorder && nActive > 1}
                              onApply={(p, mode) => priorityMutation.mutate({ id: r.id, priority: p, mode })}
                              t={t}
                            />
                          )}
                        </td>
                        {isAdmin && (
                          <td className="px-3 py-2.5 whitespace-nowrap" style={{ ...cellB, color: "var(--text-2)" }}>{tl(r.supervisor_name) || "—"}</td>
                        )}
                        {!isLeader && (
                          <td className="px-3 py-2.5 whitespace-nowrap" style={{ ...cellB, color: "var(--text-2)" }}>{tl(r.leader_name)}</td>
                        )}
                        <td className="px-3 py-2.5 whitespace-nowrap" style={cellB} onClick={(e) => e.stopPropagation()}>
                          <StatusSelect
                            status={r.status}
                            statusLabel={statusLabel}
                            saving={savingStatusId === r.id}
                            editable={canMutateStatus}
                            onChange={(s) => statusMutation.mutate({ id: r.id, status: s })}
                          />
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap" style={{ ...cellB, color: overdue ? "#ef4444" : "var(--text-2)", fontWeight: overdue ? 600 : 400 }}>
                          <span className="inline-flex items-center gap-1.5">
                            {overdue && <AlertTriangle size={11} />}
                            {fmtDate(r.due_date, lang)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-center whitespace-nowrap" style={cellB} onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setCommentsTask(r)}
                            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors hover:border-[var(--brand)]"
                            style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)", color: r.comment_count ? "var(--brand-text)" : "var(--text-3)" }}
                          >
                            <MessageSquare size={12} />
                            <span className="tabular-nums">{r.comment_count || 0}</span>
                          </button>
                        </td>
                      </tr>
                      {expanded && (
                        <tr style={{ background: "var(--bg-inner)" }}>
                          <td colSpan={COLS.length} className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                            <div className="flex flex-wrap items-center gap-2">
                              <ActionBtn icon={Pencil} label={t("tasks.edit")} onClick={() => openEdit(r)} />
                              <ActionBtn icon={Trash2} label={t("tasks.delete")} color="#ef4444" onClick={() => setConfirmDelete(r)} />
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
        <Modal
          onClose={closeModal}
          title={form.id ? t("tasks.editTitle") : t("tasks.addTitle")}
          footer={
            <>
              <Button variant="secondary" onClick={closeModal}>{t("tasks.cancel")}</Button>
              <Button loading={saveMutation.isPending} onClick={submit}>{t("tasks.save")}</Button>
            </>
          }
        >
              {/* Task text */}
              <Field label={t("tasks.fieldTask")} required>
                <textarea
                  value={form.task_text}
                  onChange={(e) => setForm((f) => ({ ...f, task_text: e.target.value }))}
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                />
              </Field>

              {/* Leader — fixed on edit (re-queueing across leaders is not supported) */}
              <Field label={t("tasks.fieldLeader")} required={!form.id}>
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
                    placeholder={t("tasks.pickLeader")}
                  />
                )}
              </Field>

              {/* Due date — custom calendar picker in single-date mode */}
              <Field label={t("tasks.fieldDue")} required>
                <DateRangePicker
                  single
                  dateFrom={form.due_date}
                  dateTo={form.due_date}
                  setDateFrom={(v) => setForm((f) => ({ ...f, due_date: v }))}
                  setDateTo={() => {}}
                />
              </Field>

              {/* Optional first comment — becomes the opening message of the thread */}
              {!form.id && (
                <Field label={t("tasks.fieldComment")}>
                  <textarea
                    value={form.comment}
                    onChange={(e) => setForm((f) => ({ ...f, comment: e.target.value }))}
                    rows={2}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                  />
                </Field>
              )}

              {formError && (
                <div className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertTriangle size={13} /> {formError}
                </div>
              )}
        </Modal>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => deleteMutation.mutate(confirmDelete.id)}
        title={t("tasks.deleteTitle")}
        message={t("tasks.deleteConfirm")}
        confirmLabel={t("tasks.delete")}
        cancelLabel={t("tasks.cancel")}
        tone="danger"
        loading={deleteMutation.isPending}
      />

      {/* Chat-style comments */}
      {commentsTask && (
        <CommentsModal
          task={commentsTask}
          canComment={canMutateStatus}
          onClose={() => setCommentsTask(null)}
        />
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
