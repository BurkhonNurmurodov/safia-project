/**
 * /tasks — THE task board: both tiers of the assignment chain on ONE page.
 *
 * Until 2026-09-04 the same board was served twice — /tasks for the brigadir →
 * lider tier and /brigadir-tasks for the smena menejeri → brigadir tier — and a
 * shift manager read their brigadirs' work on one page and the leaders' beneath
 * it on another, with the same filters drawn twice. Concerns had already shown
 * the shape that works: one register, a LEVEL on every row, an analysis tab
 * beside it. This page is that shape for tasks.
 *
 * ONE PAYLOAD, RIGHTS PER ROW. `GET /api/tasks/board` returns every task the
 * viewer may see from either tier, with `can_edit` / `can_status` /
 * `can_reorder` / `can_comment` resolved server-side per row — a shift manager
 * governs the brigadir rows and only reads the leader rows, a brigadir the
 * reverse — so nothing here derives a right from the viewer's role. A row is
 * WRITTEN through the router that owns its tier (`endpointFor`), which is the
 * one rule the backend keeps: leader rows through /api/tasks, brigadir rows
 * through /api/brigadir-tasks.
 *
 * STATUS IS THE PARTITION; OVERDUE IS A FLAG. The donut and the KPI cards count
 * what the status column says — todo / doing / done — and «muddati o'tgan» is
 * counted BESIDE them as the open tasks past their date. The earlier reading
 * pulled an overdue task out of its status bucket, so a board of twelve overdue
 * «to do» tasks printed «to do: 0» over a table of twelve «to do» rows.
 */
import { useState, useMemo, useEffect, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, AlertTriangle, ClipboardList, MessageSquare,
  CalendarClock, UserCheck, ShieldCheck, FileText, CircleDot, Hash,
  TrendingUp, PieChart, Layers, UserRound, UserPen, ArrowLeftRight,
  Hourglass, Inbox, CheckCheck, Building2, ChevronDown,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import Modal from "../components/ui/Modal";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import Button from "../components/ui/Button";
import Field from "../components/ui/FormField";
import SearchInput from "../components/ui/SearchInput";
import TableCard, { Th } from "../components/ui/DataTable";
import {
  STATUSES, STATUS_COLOR, CHART_BRAND, CHART_TODO, CHART_OVERDUE,
  StatusSelect, PrioritySelect, ActionBtn,
} from "../components/ui/TaskQueue";
import CommentsModal, { CommentsButton } from "../components/ui/CommentsModal";
import { FilterPanel, OptsFilter, PickFilter } from "../components/ui/ColumnFilter";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import {
  LevelChip, InsightCard, Metric, Subject, ChartCard, Chart, NoChart, Empty,
  StackLegend, RankedList,
} from "../components/ui/AnalysisBoard";
import { ROLE_LABEL_KEYS } from "../config/pages";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { shortPerson } from "../utils/personName";
import { useChartTheme } from "../hooks/useChartTheme";
import { usePersistentState } from "../hooks/usePersistentState";
import { padChartFrom } from "../utils/chartRange";

const KIND_SUP = "supervisor";
const KIND_LEADER = "leader";
const NO_ONE = "__none__";

// The router that OWNS a row's tier — the one place the split survives.
const endpointFor = (kind) => (kind === KIND_SUP ? "/api/brigadir-tasks" : "/api/tasks");

// The queue a row belongs to. A brigadir queue and a leader queue can both hold
// a "priority 1" inside ONE unit — they are two different people's lists — so
// the active-count that drives the priority editor is keyed by ASSIGNEE.
const queueKey = (r) =>
  r.assignee_kind === KIND_SUP ? `s${r.supervisor_manager_id}` : `l${r.leader_profile_id}`;

// Who set the task, as a PERSON: the creating profile, falling back to the
// name snapshot on rows that predate profile keys.
const creatorKey = (r) =>
  r.created_by_profile || (r.created_by_name ? `n:${r.created_by_name}` : NO_ONE);

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

const pad2 = (n) => String(n).padStart(2, "0");
const localTodayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
const isoMinusDays = (iso, n) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
// Whole days from b to a (positive when a is later).
const isoDiffDays = (a, b) =>
  Math.round((new Date(`${a}T00:00:00`) - new Date(`${b}T00:00:00`)) / 86400000);
const createdDay = (r) => (r.created_at || "").slice(0, 10);
const completedDay = (r) => (r.completed_at || "").slice(0, 10);

const emptyForm = () => ({
  id: null,
  kind: KIND_LEADER,
  assignee_id: null,
  assignee_name: "",
  task_text: "",
  due_date: "",
  comment: "",
});

// Shows the top slice of a ranked board; the rest opens in a modal.
const RANK_SHOWN = 8;

export default function Tasks() {
  const { auth } = useAuth();
  const { t, lang } = useLang();
  const { tl } = useTranslit();
  const { chartTheme, labelColor, legendColor, gridColor, tooltipTheme } = useChartTheme();
  const qc = useQueryClient();
  const isLeader = auth?.role === "leader";

  const statusLabel = (s) => t(`tasks.status.${s}`);
  const tierLabel = (k) => t(`tasks.tier.${k}`);
  const roleLabel = (r) => (r && ROLE_LABEL_KEYS[r] ? t(ROLE_LABEL_KEYS[r]) : null);

  // ── page state ─────────────────────────────────────────────────────────────
  const [view, setView] = usePersistentState("tasks_view", "list");
  const [startDate, setStartDate] = usePersistentState("tasks_date_from", () => isoMinusDays(localTodayIso(), 6));
  const [endDate, setEndDate] = usePersistentState("tasks_date_to", () => localTodayIso());
  const [fTier, setFTier] = usePersistentState("tasks_tier", null);          // null = both | supervisor | leader
  const [fShift, setFShift] = usePersistentState("tasks_shift", null);       // null = all shifts | 1 | 2
  const [fSup, setFSup] = usePersistentState("tasks_supervisor", "All");     // "All" | String(manager_id)
  const [fLeader, setFLeader] = usePersistentState("tasks_leader", "All");   // "All" | String(profile_id)
  const [creatorSel, setCreatorSel] = usePersistentState("tasks_creator_sel", []);
  const [search, setSearch] = usePersistentState("tasks_search", "");
  const [statusSel, setStatusSel] = usePersistentState("tasks_status_sel", []);
  const [sort, setSort] = usePersistentState("tasks_sort", { key: "priority", dir: "asc" });

  const [expandedId, setExpandedId] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [commentsTask, setCommentsTask] = useState(null);
  const [moreList, setMoreList] = useState(null);   // "creators" | "assignees" | null

  // ── data ───────────────────────────────────────────────────────────────────
  const { data: listResp, isLoading } = useQuery({
    queryKey: ["task-board"],
    queryFn: () => api.get("/api/tasks/board").then((r) => r.data),
  });
  const allRows = listResp?.data || [];
  const canCreateLeader = !!listResp?.can_create_leader;
  const canCreateBrigadir = !!listResp?.can_create_brigadir;
  const canCreate = canCreateLeader || canCreateBrigadir;

  // Create-form picker sources — each is exactly the set its endpoint accepts.
  const { data: leaders = [] } = useQuery({
    queryKey: ["task-leaders"],
    queryFn: () => api.get("/api/tasks/leaders").then((r) => r.data),
    enabled: canCreateLeader,
  });
  const { data: brigadirs = [] } = useQuery({
    queryKey: ["btask-brigadirs"],
    queryFn: () => api.get("/api/brigadir-tasks/brigadirs").then((r) => r.data),
    enabled: canCreateBrigadir,
  });

  // Hold charts back until the grid has its final width (same fix as Kaizen);
  // switching views mounts fresh containers, so the settle runs again.
  const [chartsReady, setChartsReady] = useState(false);
  useEffect(() => {
    if (isLoading) return undefined;
    setChartsReady(false);
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setChartsReady(true));
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [isLoading, view]);

  // What the payload holds decides which controls and columns exist: a tier
  // filter over one tier, or a unit column over one unit, names a value the
  // page cannot show.
  const shape = useMemo(() => {
    let sup = 0, lead = 0;
    const units = new Set();
    for (const r of allRows) {
      if (r.assignee_kind === KIND_SUP) sup += 1; else lead += 1;
      if (r.supervisor_manager_id != null) units.add(r.supervisor_manager_id);
    }
    return { bothKinds: sup > 0 && lead > 0, unitCount: units.size };
  }, [allRows]);

  // Active-queue size per ASSIGNEE over ALL rows: the queue is 1..N whatever
  // the page is showing, and a shorter list would let somebody move a task to
  // a position the backend then rejects.
  const activeCounts = useMemo(() => {
    const m = new Map();
    for (const r of allRows) {
      if (r.status === "done") continue;
      const k = queueKey(r);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [allRows]);

  // ── filter option lists (cascade: shift → brigadir → leader) ───────────────
  const supOptions = useMemo(() => {
    const m = new Map();
    for (const r of allRows) {
      if (r.supervisor_manager_id == null) continue;
      if (fShift != null && r.supervisor_shift !== fShift) continue;
      if (!m.has(r.supervisor_manager_id)) m.set(r.supervisor_manager_id, r.supervisor_name || "—");
    }
    return [...m.entries()]
      .map(([id, name]) => ({ value: String(id), label: tl(name) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allRows, fShift, tl]);

  const leaderOptions = useMemo(() => {
    const m = new Map();
    for (const r of allRows) {
      if (r.assignee_kind !== KIND_LEADER || r.leader_profile_id == null) continue;
      if (fShift != null && r.supervisor_shift !== fShift) continue;
      if (fSup !== "All" && String(r.supervisor_manager_id) !== fSup) continue;
      if (!m.has(r.leader_profile_id)) m.set(r.leader_profile_id, r.leader_name || "—");
    }
    return [...m.entries()]
      .map(([id, name]) => ({ value: String(id), label: tl(name) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allRows, fShift, fSup, tl]);

  // One option per PERSON who set a task, with the role they set it from.
  const creators = useMemo(() => {
    const m = new Map();
    for (const r of allRows) {
      const k = creatorKey(r);
      if (!m.has(k)) m.set(k, { name: r.created_by_name || "", role: r.creator_role || null });
    }
    return m;
  }, [allRows]);
  const creatorKeys = useMemo(
    () => [...creators.keys()].sort((a, b) => tl(creators.get(a).name).localeCompare(tl(creators.get(b).name))),
    [creators, tl]);
  const creatorLabel = (k) => (k === NO_ONE ? t("tasks.noCreator") : tl(creators.get(k)?.name || ""));

  // A child pick its parent no longer offers is dropped — never while the
  // list is empty, which reads as "still loading" and would wipe the pick on
  // every refetch.
  useEffect(() => {
    if (fSup !== "All" && supOptions.length && !supOptions.some((o) => o.value === fSup)) setFSup("All");
  }, [supOptions, fSup]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (fLeader !== "All" && leaderOptions.length && !leaderOptions.some((o) => o.value === fLeader)) setFLeader("All");
  }, [leaderOptions, fLeader]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── scope: period (by creation day) + tier + shift + brigadir + leader ──────
  const inScope = (r, from) => {
    const day = createdDay(r);
    if (from && !(day && day >= from)) return false;
    if (endDate && !(day && day <= endDate)) return false;
    if (fTier && r.assignee_kind !== fTier) return false;
    if (fShift != null && r.supervisor_shift !== fShift) return false;
    if (fSup !== "All" && String(r.supervisor_manager_id) !== fSup) return false;
    if (fLeader !== "All" && String(r.leader_profile_id) !== fLeader) return false;
    return true;
  };
  const scoped = useMemo(() => allRows.filter((r) => inScope(r, startDate)),
    [allRows, startDate, endDate, fTier, fShift, fSup, fLeader]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trend-chart scope: same filters with the period start pulled back so the
  // chart never spans fewer than 7 days. KPIs, donut and table keep the period.
  const chartStart = padChartFrom(startDate, endDate);
  const chartScoped = useMemo(() => {
    if (chartStart === startDate) return scoped;
    return allRows.filter((r) => inScope(r, chartStart));
  }, [allRows, scoped, chartStart, startDate, endDate, fTier, fShift, fSup, fLeader]); // eslint-disable-line react-hooks/exhaustive-deps

  // Table filters (status · creator · free text) over the scoped rows.
  const tableFilterPred = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (r) => {
      if (statusSel.length && !statusSel.includes(r.status)) return false;
      if (creatorSel.length && !creatorSel.includes(creatorKey(r))) return false;
      if (q) {
        const hit =
          (r.task_text || "").toLowerCase().includes(q) ||
          (r.assignee_name || "").toLowerCase().includes(q) ||
          (r.supervisor_name || "").toLowerCase().includes(q) ||
          (r.created_by_name || "").toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    };
  }, [search, statusSel, creatorSel]);

  const filtered = useMemo(() => scoped.filter(tableFilterPred), [scoped, tableFilterPred]);
  const chartFiltered = useMemo(
    () => (chartScoped === scoped ? null : chartScoped.filter(tableFilterPred)),
    [chartScoped, scoped, tableFilterPred]);

  const today = localTodayIso();
  const isOverdue = (r) => r.status !== "done" && !!r.due_date && r.due_date < today;

  // ── headline figures ───────────────────────────────────────────────────────
  // Status is the partition (done / doing / todo); overdue is counted BESIDE
  // it as the open rows past their date, so the donut can never contradict
  // the status column it is drawn from.
  const stats = useMemo(() => {
    let done = 0, doing = 0, todo = 0, overdue = 0;
    for (const r of filtered) {
      if (r.status === "done") done += 1;
      else {
        if (r.status === "doing") doing += 1; else todo += 1;
        if (isOverdue(r)) overdue += 1;
      }
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
        const closeIso = completedDay(r);
        const eff = closeIso && closeIso >= day ? closeIso : day;
        closed.set(eff, (closed.get(eff) || 0) + 1);
      }
    }

    const dayKeys = [...opened.keys(), ...closed.keys()].sort();
    const trend = [];
    let maxOpen = 0, maxFlow = 0;
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
        const inn = opened.get(iso) || 0;
        const out = closed.get(iso) || 0;
        run += inn - out;
        const open = Math.max(0, run);
        if (open > maxOpen) maxOpen = open;
        if (inn > maxFlow) maxFlow = inn;
        if (out > maxFlow) maxFlow = out;
        trend.push({ day: iso, open, opened: inn, closed: out });
      }
    }
    return { done, doing, todo, overdue, open: doing + todo, total: filtered.length, trend, maxOpen, maxFlow };
  }, [filtered, chartFiltered, chartStart, endDate, today]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── analysis aggregates ────────────────────────────────────────────────────
  // Who sets the work, who receives it, which unit it lands in, how long it
  // takes — all over the SAME filtered rows the headline charts use, so both
  // views tell one story. Keys and counts only; labels are mapped outside.
  const analytics = useMemo(() => {
    const fresh = () => ({ done: 0, doing: 0, todo: 0, overdue: 0, open: 0, total: 0 });
    const push = (map, key, r, meta) => {
      const g = map.get(key) || { ...fresh(), ...meta };
      g[r.status === "doing" ? "doing" : r.status === "done" ? "done" : "todo"] += 1;
      if (r.status !== "done") g.open += 1;
      if (isOverdue(r)) g.overdue += 1;
      g.total += 1;
      map.set(key, g);
    };
    const byCreator = new Map(), byAssignee = new Map(), byUnit = new Map();
    // Day buckets: 0–1 · 2–3 · 4–7 · 8–14 · 15+. Done rows contribute their
    // span to completion, open ones how long they have been waiting.
    const bucketIdx = (d) => (d <= 1 ? 0 : d <= 3 ? 1 : d <= 7 ? 2 : d <= 14 ? 3 : 4);
    const ageDone = [0, 0, 0, 0, 0];
    const ageOpen = [0, 0, 0, 0, 0];
    let onTime = 0, judged = 0;
    let oldest = null;

    for (const r of filtered) {
      const ck = creatorKey(r);
      push(byCreator, ck, r, { name: r.created_by_name || "", role: r.creator_role || null });
      push(byAssignee, queueKey(r), r, { name: r.assignee_name || "", kind: r.assignee_kind });
      push(byUnit, r.supervisor_manager_id ?? NO_ONE, r, { name: r.supervisor_name || "" });

      const day = createdDay(r);
      if (!day) continue;
      if (r.status === "done") {
        const cd = completedDay(r);
        if (cd) {
          ageDone[bucketIdx(Math.max(0, isoDiffDays(cd, day)))] += 1;
          if (r.due_date) { judged += 1; if (cd <= r.due_date) onTime += 1; }
        }
      } else {
        const age = Math.max(0, isoDiffDays(today, day));
        ageOpen[bucketIdx(age)] += 1;
        if (!oldest || age > oldest.age) oldest = { row: r, age };
      }
    }

    const rank = (map) => [...map.entries()]
      .map(([key, g]) => ({ key, ...g }))
      .sort((a, b) => b.total - a.total || String(a.name).localeCompare(String(b.name)));
    // The un-named bucket is a data gap, not a person: it sorts last.
    const last = (rows) => rows.sort((a, b) => (a.key === NO_ONE ? 1 : 0) - (b.key === NO_ONE ? 1 : 0));

    const assignees = last(rank(byAssignee));
    let topLoad = null;
    for (const a of assignees) if (a.open > 0 && (!topLoad || a.open > topLoad.open)) topLoad = a;

    return {
      creators: last(rank(byCreator)),
      assignees,
      units: last(rank(byUnit)),
      ageDone, ageOpen, ageMax: Math.max(...ageDone, ...ageOpen, 0),
      onTime, judged,
      oldest, topLoad,
    };
  }, [filtered, today]); // eslint-disable-line react-hooks/exhaustive-deps

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
        tl(a.assignee_name || "").localeCompare(tl(b.assignee_name || "")) || (a.priority || 0) - (b.priority || 0));
      done.sort((a, b) => (b.completed_at || "").localeCompare(a.completed_at || ""));
      return [...active, ...done];
    }

    const val = (r) => {
      switch (sort.key) {
        case "task":     return tl(r.task_text || "");
        case "priority": return r.priority ?? Infinity;
        case "tier":     return r.assignee_kind === KIND_SUP ? 0 : 1;
        case "unit":     return tl(r.supervisor_name || "");
        case "assignee": return tl(r.assignee_name || "");
        case "status":   return STATUSES.indexOf(r.status);
        case "due":      return r.due_date || "";
        case "creator":  return tl(r.created_by_name || "");
        case "comments": return r.comment_count || 0;
        default:         return "";
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

  // ── mutations — every write goes to the router that owns the row's tier ───
  const invalidate = () => qc.invalidateQueries({ queryKey: ["task-board"] });

  const saveMutation = useMutation({
    mutationFn: () => {
      const base = endpointFor(form.kind);
      if (form.id) {
        return api.put(`${base}/${form.id}`, { task_text: form.task_text.trim(), due_date: form.due_date }).then((r) => r.data);
      }
      const body = {
        task_text: form.task_text.trim(),
        due_date: form.due_date,
        comment: form.comment.trim() || null,
      };
      if (form.kind === KIND_SUP) body.supervisor_manager_id = form.assignee_id;
      else body.leader_profile_id = form.assignee_id;
      return api.post(base, body).then((r) => r.data);
    },
    onSuccess: () => { invalidate(); closeModal(); },
    onError: (e) => setFormError(e?.response?.data?.detail || t("tasks.saveError")),
  });

  const deleteMutation = useMutation({
    mutationFn: (r) => api.delete(`${endpointFor(r.assignee_kind)}/${r.id}`),
    onSuccess: () => { invalidate(); setConfirmDelete(null); setExpandedId(null); },
  });

  const statusMutation = useMutation({
    mutationFn: ({ row, status }) => api.patch(`${endpointFor(row.assignee_kind)}/${row.id}/status`, { status }).then((r) => r.data),
    onSuccess: invalidate,
  });
  const savingStatusId = statusMutation.isPending ? statusMutation.variables?.row?.id : null;

  const priorityMutation = useMutation({
    mutationFn: ({ row, priority, mode }) => api.patch(`${endpointFor(row.assignee_kind)}/${row.id}/priority`, { priority, mode }).then((r) => r.data),
    onSuccess: invalidate,
  });
  const savingPriorityId = priorityMutation.isPending ? priorityMutation.variables?.row?.id : null;

  // ── modal helpers ──────────────────────────────────────────────────────────
  function openCreate() {
    // The tier follows the filter when it can be created at, else whichever
    // the viewer may create; the assignee is pre-filled from the matching pick.
    const kind = fTier && ((fTier === KIND_SUP && canCreateBrigadir) || (fTier === KIND_LEADER && canCreateLeader))
      ? fTier : (canCreateLeader ? KIND_LEADER : KIND_SUP);
    const preset = kind === KIND_SUP
      ? (fSup !== "All" ? Number(fSup) : null)
      : (fLeader !== "All" ? Number(fLeader) : null);
    setForm({ ...emptyForm(), kind, assignee_id: preset });
    setFormError("");
    setModalOpen(true);
  }
  function openEdit(r) {
    setForm({
      id: r.id,
      kind: r.assignee_kind,
      assignee_id: r.assignee_kind === KIND_SUP ? r.supervisor_manager_id : r.leader_profile_id,
      assignee_name: r.assignee_name || "",
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
    if (!form.id && !form.assignee_id) {
      return setFormError(form.kind === KIND_SUP ? t("btasks.pickBrigadir") : t("tasks.pickLeader"));
    }
    if (!form.task_text.trim()) return setFormError(t("tasks.textRequired"));
    if (!form.due_date) return setFormError(t("tasks.dueRequired"));
    saveMutation.mutate();
  }

  // One option per leader PROFILE / per brigadir UNIT — per person.
  const leaderPickOptions = leaders.map((l) => ({
    value: String(l.leader_profile_id),
    label: l.supervisor_name && shape.unitCount !== 1 ? `${tl(l.name)} · ${tl(l.supervisor_name)}` : tl(l.name),
  }));
  const brigadirPickOptions = brigadirs.map((b) => ({
    value: String(b.supervisor_manager_id),
    label: b.shift ? `${tl(b.name)} · S${b.shift}` : tl(b.name),
  }));

  // ── one consolidated filter zone ───────────────────────────────────────────
  // The org chain («Kim va qayerda») and the record filters («Vazifa») as two
  // labelled blocks; every section narrows BOTH views. A control over a value
  // the payload cannot show is not offered.
  const grpWho = t("tasks.grpWho");
  const grpWhat = t("tasks.grpWhat");
  const supLabel = fSup !== "All" ? (supOptions.find((o) => o.value === fSup)?.label || "") : "";
  const filterSections = [
    ...(shape.unitCount > 1 ? [{
      key: "shift", icon: Layers, label: t("filter.shift"), group: grpWho,
      active: fShift != null,
      display: fShift != null ? `S${fShift}` : "",
      onClear: () => { setFShift(null); setFSup("All"); setFLeader("All"); },
      render: () => (
        <SegmentedToggle
          fill
          value={fShift}
          onChange={(v) => { setFShift(v); setFSup("All"); setFLeader("All"); }}
          options={[[null, t("filter.all")], [1, "S1"], [2, "S2"]]}
        />
      ),
    }, {
      key: "supervisor", icon: ShieldCheck, label: t("tasks.colSupervisor"), group: grpWho,
      active: fSup !== "All",
      display: supLabel,
      onClear: () => { setFSup("All"); setFLeader("All"); },
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          opts={[{ value: "All", label: t("tasks.allSupervisors") }, ...supOptions]}
          value={fSup}
          onChange={(v) => { setFSup(v); setFLeader("All"); }} />
      ),
    }] : []),
    ...(!isLeader ? [{
      key: "leader", icon: UserRound, label: t("tasks.colLeader"), group: grpWho,
      active: fLeader !== "All",
      display: fLeader !== "All" ? (leaderOptions.find((o) => o.value === fLeader)?.label || "") : "",
      onClear: () => setFLeader("All"),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close}
          opts={[{ value: "All", label: t("tasks.allLeaders") }, ...leaderOptions]}
          value={fLeader}
          onChange={setFLeader}
          // A shortened list says why, so it is never mistaken for missing data.
          note={fSup !== "All" ? t("tasks.narrowedBy").replace("{x}", supLabel).replace("{n}", String(leaderOptions.length)) : null}
          empty={fSup !== "All" && !leaderOptions.length ? (
            <div className="flex flex-col gap-2 text-xs" style={{ color: "var(--text-3)" }}>
              <span>{t("tasks.noMatch")}</span>
              <Button size="sm" variant="secondary" onClick={() => { setFSup("All"); close?.(); }}>{t("tasks.allSupervisors")}</Button>
            </div>
          ) : null} />
      ),
    }] : []),
    ...(shape.bothKinds ? [{
      key: "tier", icon: Layers, label: t("tasks.colTier"), group: grpWhat,
      active: !!fTier,
      display: fTier ? t(fTier === KIND_SUP ? "btasks.tabBrigadir" : "btasks.tabLeader") : "",
      onClear: () => setFTier(null),
      render: () => (
        <SegmentedToggle
          fill
          value={fTier}
          onChange={setFTier}
          options={[[null, t("filter.all")], [KIND_SUP, t("btasks.tabBrigadir")], [KIND_LEADER, t("btasks.tabLeader")]]}
        />
      ),
    }] : []),
    ...(creatorKeys.length > 1 ? [{
      key: "creator", icon: UserPen, label: t("tasks.colCreator"), group: grpWhat,
      active: creatorSel.length > 0,
      display: `${creatorSel.length} ${t("filter.selected2")}`,
      onClear: () => setCreatorSel([]),
      render: () => (
        <OptsFilter searchable opts={creatorKeys} sel={creatorSel} onChange={setCreatorSel}
          render={(k) => creatorLabel(k)} labelOf={(k) => creatorLabel(k)} />
      ),
    }] : []),
    {
      key: "status", icon: CircleDot, label: t("tasks.colStatus"), group: grpWhat,
      active: statusSel.length > 0,
      display: `${statusSel.length} ${t("filter.selected2")}`,
      onClear: () => setStatusSel([]),
      render: () => (
        <OptsFilter opts={STATUSES} sel={statusSel} onChange={setStatusSel} render={(s) => statusLabel(s)} />
      ),
    },
  ];

  // ── table columns — follow what the payload holds ──────────────────────────
  const COLS = [
    { key: "task",     icon: FileText,      label: t("tasks.colTask"),     align: "left" },
    { key: "priority", icon: Hash,          label: t("tasks.colPriority"), align: "center" },
    ...(shape.bothKinds ? [{ key: "tier", icon: Layers, label: t("tasks.colTier"), align: "left" }] : []),
    ...(shape.unitCount > 1 ? [{ key: "unit", icon: ShieldCheck, label: t("tasks.colSupervisor"), align: "left" }] : []),
    ...(!isLeader ? [{ key: "assignee", icon: UserCheck, label: t("tasks.colAssignee"), align: "left" }] : []),
    { key: "status",   icon: CircleDot,     label: t("tasks.colStatus"),   align: "left" },
    { key: "due",      icon: CalendarClock, label: t("tasks.colDue"),      align: "left" },
    { key: "creator",  icon: UserPen,       label: t("tasks.colCreator"),  align: "left" },
    { key: "comments", icon: MessageSquare, label: t("tasks.colComments"), align: "center" },
  ];

  // ONE cell per column key, so the column set can change without the row
  // markup changing with it.
  const cell = (key, r) => {
    switch (key) {
      case "task":
        return (
          <td key={key} className="px-3 py-2.5 min-w-[240px] max-w-md">
            <div className="line-clamp-2" title={r.task_text}>{tl(r.task_text)}</div>
          </td>
        );
      case "priority": {
        const nActive = activeCounts.get(queueKey(r)) || 0;
        return (
          <td key={key} className="px-3 py-2.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            {r.status === "done" || r.priority == null ? (
              <span style={{ color: "var(--text-4)" }}>—</span>
            ) : (
              <PrioritySelect
                priority={r.priority}
                count={nActive}
                saving={savingPriorityId === r.id}
                editable={!!r.can_reorder && nActive > 1}
                onApply={(p, mode) => priorityMutation.mutate({ row: r, priority: p, mode })}
                t={t}
              />
            )}
          </td>
        );
      }
      case "tier":
        return (
          <td key={key} className="px-3 py-2.5 whitespace-nowrap">
            <LevelChip level={r.assignee_kind} label={tierLabel(r.assignee_kind)} />
          </td>
        );
      case "unit":
        return (
          <td key={key} className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-2)" }}>
            {tl(r.supervisor_name) || "—"}
          </td>
        );
      case "assignee":
        return (
          <td key={key} className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-2)" }}>
            {tl(r.assignee_name) || "—"}
          </td>
        );
      case "status":
        return (
          <td key={key} className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            <StatusSelect
              status={r.status}
              statusLabel={statusLabel}
              saving={savingStatusId === r.id}
              editable={!!r.can_status}
              onChange={(s) => statusMutation.mutate({ row: r, status: s })}
            />
          </td>
        );
      case "due": {
        const overdue = isOverdue(r);
        return (
          <td key={key} className="px-3 py-2.5 whitespace-nowrap" style={{ color: overdue ? CHART_OVERDUE : "var(--text-2)", fontWeight: overdue ? 600 : 400 }}>
            <span className="inline-flex items-center gap-1.5">
              {overdue && <AlertTriangle size={11} />}
              {fmtDate(r.due_date, lang)}
            </span>
          </td>
        );
      }
      case "creator":
        return (
          <td key={key} className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--text-2)" }}
              title={roleLabel(r.creator_role) || undefined}>
            {tl(r.created_by_name) || <span style={{ color: "var(--text-4)" }}>—</span>}
          </td>
        );
      case "comments":
        return (
          <td key={key} className="px-3 py-2.5 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
            <CommentsButton
              count={r.comment_count}
              label={t("tasks.commentsTitle")}
              onClick={() => setCommentsTask(r)}
            />
          </td>
        );
      default:
        return <td key={key} />;
    }
  };

  // ── charts (Concerns styling) ──────────────────────────────────────────────
  const trendDays = stats.trend.map((p) => p.day);
  const dayTick = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "");
  const axisLabel = { style: { colors: labelColor, fontSize: "11px" } };
  const gridStyle = { borderColor: gridColor, strokeDashArray: 3, padding: { left: 6, right: 6 } };
  const topLegend = {
    show: true, position: "top", horizontalAlign: "right", fontSize: "11px",
    labels: { colors: legendColor }, markers: { width: 8, height: 8, radius: 4 },
    itemMargin: { horizontal: 8, vertical: 0 }, offsetY: -4,
  };
  // Whole-count value ticks: capping tickAmount at the data max keeps every
  // step ≥ 1, so rounded labels never repeat.
  const countAxis = (max) => ({
    min: 0, max: Math.max(max, 1),
    tickAmount: Math.min(Math.max(max, 1), 5),
    labels: { ...axisLabel, formatter: (v) => (typeof v === "number" ? Math.round(v) : v) },
  });
  const unit = t("tasks.itemsUnit");

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
      labels: { rotate: 0, hideOverlappingLabels: true, formatter: dayTick, ...axisLabel },
      axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: countAxis(stats.maxOpen),
    grid: gridStyle,
    markers: { size: stats.trend.length === 1 ? 4 : 0, hover: { size: 5 } },
    legend: { show: false },
    tooltip: {
      theme: tooltipTheme,
      x: { formatter: (_v, { dataPointIndex }) => fmtDate(trendDays[dataPointIndex] || "", lang) },
    },
  };

  // End-of-period cards under the trend: the open pool and its status split,
  // plus the overdue count — which is PART of the open pool, not a fourth
  // status, so open = todo + doing and the two never disagree with the table.
  const openCards = [
    { label: t("tasks.cardOpen"),   color: CHART_BRAND,        n: stats.open },
    { label: statusLabel("todo"),   color: CHART_TODO,         n: stats.todo },
    { label: statusLabel("doing"),  color: STATUS_COLOR.doing, n: stats.doing },
    { label: t("tasks.kpiOverdue"), color: CHART_OVERDUE,      n: stats.overdue },
  ];

  const donutRows = [
    { label: statusLabel("done"),  color: STATUS_COLOR.done,  n: stats.done },
    { label: statusLabel("doing"), color: STATUS_COLOR.doing, n: stats.doing },
    { label: statusLabel("todo"),  color: CHART_TODO,         n: stats.todo },
  ];
  const donutSeries = donutRows.map((r) => r.n);
  const donutOpts = {
    chart: { type: "donut", fontFamily: "inherit", background: "transparent", animations: { enabled: false } },
    labels: donutRows.map((r) => r.label),
    colors: donutRows.map((r) => r.color),
    legend: { show: false },
    dataLabels: { enabled: false },
    stroke: { width: 0 },
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${v} ${unit}` } },
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

  // Opened vs closed per day — is the inflow being kept up with?
  const flowSeries = [
    { name: t("tasks.seriesOpened"), data: stats.trend.map((p) => p.opened) },
    { name: t("tasks.seriesClosed"), data: stats.trend.map((p) => p.closed) },
  ];
  const flowOpts = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit", background: "transparent", animations: { enabled: false } },
    theme: chartTheme,
    colors: [CHART_BRAND, STATUS_COLOR.done],
    plotOptions: { bar: { columnWidth: "60%", borderRadius: 3, borderRadiusApplication: "end" } },
    dataLabels: { enabled: false },
    stroke: { show: false },
    xaxis: {
      type: "category", categories: trendDays,
      tickAmount: Math.min(Math.max(trendDays.length - 1, 1), 10),
      labels: { rotate: 0, hideOverlappingLabels: true, formatter: dayTick, ...axisLabel },
      axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: countAxis(stats.maxFlow),
    grid: gridStyle,
    legend: topLegend,
    tooltip: {
      theme: tooltipTheme,
      x: { formatter: (_v, { dataPointIndex }) => fmtDate(trendDays[dataPointIndex] || "", lang) },
    },
  };

  // The status stack every ranked board reads — the donut's three buckets, so
  // a colour means one thing on the whole page. Overdue rides beside the bar
  // as a red mark, never as a fourth segment stealing from its status.
  const STACK_PARTS = [
    { key: "done",  label: statusLabel("done"),  color: STATUS_COLOR.done },
    { key: "doing", label: statusLabel("doing"), color: STATUS_COLOR.doing },
    { key: "todo",  label: statusLabel("todo"),  color: CHART_TODO },
  ];
  const overdueMark = (row) => (row.overdue > 0 ? (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded-full"
      style={{ background: `${CHART_OVERDUE}1f`, color: CHART_OVERDUE }}
      title={`${t("tasks.kpiOverdue")}: ${row.overdue} ${unit}`}
    >
      <AlertTriangle size={10} /> {row.overdue}
    </span>
  ) : null);
  const neutralChip = (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
          style={{ background: "var(--bg-inner)", color: "var(--text-4)" }}>—</span>
  );

  // Who sets the work — badged with the role they set it from.
  const creatorRows = analytics.creators.map((r) => ({
    ...r,
    label: r.key === NO_ONE ? t("tasks.noCreator") : shortPerson(tl(r.name)),
    title: r.key === NO_ONE ? t("tasks.noCreator") : tl(r.name),
  }));
  const creatorBadge = (row) => (row.role && roleLabel(row.role)
    ? <LevelChip level={row.role} label={roleLabel(row.role)} />
    : neutralChip);
  const creatorMax = creatorRows.reduce((m, r) => Math.max(m, r.total), 0);

  // Who receives it — badged with the tier it was set at.
  const assigneeRows = analytics.assignees.map((r) => ({
    ...r,
    label: shortPerson(tl(r.name)) || "—",
    title: tl(r.name),
  }));
  const assigneeBadge = (row) => <LevelChip level={row.kind} label={tierLabel(row.kind)} />;
  const assigneeMax = assigneeRows.reduce((m, r) => Math.max(m, r.total), 0);

  // Which unit it lands in — a horizontal status stack, one bar per brigadir.
  const unitRows = analytics.units;
  const unitLabels = unitRows.map((r) => (r.key === NO_ONE ? t("tasks.noUnit") : shortPerson(tl(r.name))));
  const unitSeries = STACK_PARTS.map((p) => ({ name: p.label, data: unitRows.map((r) => r[p.key]) }));
  const unitOpts = {
    chart: { type: "bar", stacked: true, toolbar: { show: false }, fontFamily: "inherit", background: "transparent", animations: { enabled: false } },
    theme: chartTheme,
    colors: STACK_PARTS.map((p) => p.color),
    plotOptions: { bar: { horizontal: true, barHeight: "62%", borderRadius: 3, borderRadiusApplication: "end" } },
    dataLabels: { enabled: false },
    stroke: { show: false },
    xaxis: {
      categories: unitLabels, ...countAxis(unitRows[0]?.total || 0),
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { ...axisLabel, maxWidth: 150 } },
    grid: gridStyle,
    legend: topLegend,
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${v} ${unit}` } },
  };
  const stackHeight = (n) => Math.max(200, n * 34 + 66);

  // How long things take: completion span of the done rows against the wait
  // of the open ones, over shared day buckets.
  const AGE_BUCKETS = ["0–1", "2–3", "4–7", "8–14", "15+"];
  const ageSeries = [
    { name: statusLabel("done"),  data: analytics.ageDone },
    { name: t("tasks.ageOpen"),   data: analytics.ageOpen },
  ];
  const ageOpts = {
    chart: { type: "bar", toolbar: { show: false }, fontFamily: "inherit", background: "transparent", animations: { enabled: false } },
    theme: chartTheme,
    colors: [STATUS_COLOR.done, CHART_BRAND],
    plotOptions: { bar: { columnWidth: "34%", borderRadius: 3, borderRadiusApplication: "end" } },
    dataLabels: { enabled: false },
    stroke: { show: false },
    xaxis: {
      categories: AGE_BUCKETS, labels: axisLabel,
      axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false },
    },
    yaxis: countAxis(analytics.ageMax),
    grid: gridStyle,
    legend: topLegend,
    tooltip: { theme: tooltipTheme, y: { formatter: (v) => `${v} ${unit}` } },
  };

  const topCreator = creatorRows.find((r) => r.key !== NO_ONE) || null;
  const onTimePct = analytics.judged ? Math.round((analytics.onTime / analytics.judged) * 100) : null;

  // A ranked board card: the top slice, a legend, and the way to the rest.
  const rankedCard = (rows, max, badge, listKey) => (
    <div className="p-4 flex-1 flex flex-col min-h-0">
      <StackLegend parts={STACK_PARTS} />
      <RankedList rows={rows.slice(0, RANK_SHOWN)} max={max} parts={STACK_PARTS} unit={unit} badge={badge} extra={overdueMark} />
      {rows.length > RANK_SHOWN && (
        <Button variant="ghost" size="sm" className="w-full mt-3 flex-shrink-0" onClick={() => setMoreList(listKey)}>
          {t("tasks.respMore").replace("{n}", String(rows.length - RANK_SHOWN))}
          <ChevronDown size={13} />
        </Button>
      )}
    </div>
  );

  return (
    <Layout title={t("tasks.title")}>
      {/* ONE-ROW filter bar: period inline; the org chain, tier, creator and
          status live in the consolidated panel and surface as chips. */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <DateRangePicker
          dateFrom={startDate}
          dateTo={endDate}
          setDateFrom={setStartDate}
          setDateTo={setEndDate}
          compactLabel
          triggerClassName="px-3 py-2 text-sm"
        />
        <FilterPanel sections={filterSections} />
      </div>

      {/* Page view tabs — register vs chart board. Only the text search
          follows the view (on the register it sits in the table toolbar). */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SegmentedToggle
          value={view}
          onChange={setView}
          options={[["list", t("tasks.viewList")], ["analytics", t("tasks.viewAnalytics")]]}
        />
        {view === "analytics" && (
          <>
            <div className="flex-1" />
            <SearchInput value={search} onChange={setSearch} placeholder={t("tasks.search")} className="w-full sm:w-44" />
          </>
        )}
      </div>

      {/* ── Analysis — every board is computed from the fully filtered rows. */}
      {view === "analytics" && (
        <div className="pb-8 space-y-3">
          {/* The four questions the board is opened to answer */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <InsightCard icon={UserPen} tint="#3b82f6" label={t("tasks.insTopCreator")}>
              {isLoading ? <SkeletonBlock className="h-10 w-full" /> : topCreator ? (
                <>
                  <Subject text={topCreator.label} title={topCreator.title} />
                  <Metric value={topCreator.total} unit={unit} color="#3b82f6"
                          suffix={`${topCreator.open} ${t("tasks.openLower")}`} />
                </>
              ) : <Empty icon={UserPen} color="#3b82f6" text={t("tasks.insNone")} />}
            </InsightCard>

            <InsightCard icon={Inbox} tint={CHART_BRAND} label={t("tasks.insTopLoad")}>
              {isLoading ? <SkeletonBlock className="h-10 w-full" /> : analytics.topLoad ? (
                <>
                  <Subject text={shortPerson(tl(analytics.topLoad.name)) || "—"} title={tl(analytics.topLoad.name)} />
                  <Metric value={analytics.topLoad.open} unit={t("tasks.openLower")} color={CHART_BRAND}
                          suffix={analytics.topLoad.overdue ? `${analytics.topLoad.overdue} ${t("tasks.kpiOverdue").toLowerCase()}` : null} />
                </>
              ) : <Empty icon={Inbox} color={CHART_BRAND} text={t("tasks.insNone")} />}
            </InsightCard>

            <InsightCard icon={Hourglass} tint={CHART_OVERDUE} label={t("tasks.insOldest")}>
              {isLoading ? <SkeletonBlock className="h-10 w-full" /> : analytics.oldest ? (
                <>
                  <Subject text={tl(analytics.oldest.row.task_text)} />
                  <Metric value={analytics.oldest.age} unit={t("tasks.daysUnit")} color={CHART_OVERDUE}
                          suffix={shortPerson(tl(analytics.oldest.row.assignee_name || ""))} />
                </>
              ) : <Empty icon={Hourglass} color={CHART_OVERDUE} text={t("tasks.insNone")} />}
            </InsightCard>

            <InsightCard icon={CheckCheck} tint={STATUS_COLOR.done} label={t("tasks.insOnTime")}>
              {isLoading ? <SkeletonBlock className="h-10 w-full" /> : onTimePct != null ? (
                <>
                  <Subject text={`${onTimePct}%`} />
                  <Metric value={`${analytics.onTime} / ${analytics.judged}`} unit={t("tasks.ofDone")} color={STATUS_COLOR.done} />
                </>
              ) : <Empty icon={CheckCheck} color={STATUS_COLOR.done} text={t("tasks.insNone")} />}
            </InsightCard>
          </div>

          {/* Open-task trend + status strip · status donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <ChartCard className="lg:col-span-2" icon={TrendingUp} title={t("tasks.chartTrend")} subtitle={t("tasks.chartTrendSub")}>
              {isLoading ? (
                <div className="p-4"><SkeletonChart className="h-52" /></div>
              ) : stats.trend.length ? (
                <>
                  <div className="px-1 pt-1">
                    <Chart ready={chartsReady} height={232} options={lineOpts} series={lineSeries} type="area" />
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
                <NoChart height={232} text={t("tasks.noData")} />
              )}
            </ChartCard>

            <ChartCard icon={PieChart} title={t("tasks.chartStatusTitle")}>
              {isLoading ? (
                <div className="p-4"><SkeletonChart className="h-52" /></div>
              ) : stats.total ? (
                <div className="p-4 flex flex-col items-center gap-3">
                  <Chart ready={chartsReady} height={180} options={donutOpts} series={donutSeries} type="donut" />
                  <div className="w-full space-y-2">
                    {donutRows.map((r) => (
                      <div key={r.label} className="flex items-center gap-2 text-xs">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: r.color }} />
                        <span className="flex-1 truncate" style={{ color: "var(--text-2)" }}>{r.label}</span>
                        <span className="font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{r.n}</span>
                      </div>
                    ))}
                    {/* Overdue is a fact about the open rows' DATES, not a
                        fourth status — so it sits under a rule, named as a
                        subset, never as a slice. */}
                    <div className="flex items-center gap-2 text-xs pt-2" style={{ borderTop: "1px solid var(--border)", color: CHART_OVERDUE }}>
                      <AlertTriangle size={11} className="flex-shrink-0" />
                      <span className="flex-1 truncate">{t("tasks.kpiOverdue")} · <span style={{ color: "var(--text-4)" }}>{t("tasks.overdueOfOpen")}</span></span>
                      <span className="font-bold tabular-nums">{stats.overdue}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <NoChart height={180} text={t("tasks.noData")} />
              )}
            </ChartCard>
          </div>

          {/* Inflow vs outflow per day · where the work lands, by unit */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <ChartCard className="lg:col-span-2" icon={ArrowLeftRight} title={t("tasks.chartFlow")} subtitle={t("tasks.chartFlowSub")}>
              {isLoading ? (
                <div className="p-4"><SkeletonChart className="h-52" /></div>
              ) : stats.trend.length ? (
                <div className="px-1 pt-1 pb-1">
                  <Chart ready={chartsReady} height={244} options={flowOpts} series={flowSeries} type="bar" />
                </div>
              ) : (
                <NoChart height={244} text={t("tasks.noData")} />
              )}
            </ChartCard>

            <ChartCard icon={Building2} title={t("tasks.chartByUnit")} subtitle={t("tasks.chartByUnitSub")}>
              {isLoading ? (
                <div className="p-4"><SkeletonChart className="h-52" /></div>
              ) : unitRows.length ? (
                <div className="px-1 pt-1 pb-1">
                  <Chart ready={chartsReady} height={stackHeight(unitRows.length)} options={unitOpts} series={unitSeries} type="bar" />
                </div>
              ) : (
                <NoChart height={220} text={t("tasks.noData")} />
              )}
            </ChartCard>
          </div>

          {/* Who sets the work · who receives it — the pair is the question */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <ChartCard icon={UserPen} title={t("tasks.chartByCreator")}
                       subtitle={t("tasks.chartByCreatorSub").replace("{n}", String(creatorRows.length))}>
              {isLoading ? (
                <div className="p-4"><SkeletonChart className="h-52" /></div>
              ) : creatorRows.length ? rankedCard(creatorRows, creatorMax, creatorBadge, "creators") : (
                <NoChart height={220} text={t("tasks.noData")} />
              )}
            </ChartCard>

            <ChartCard icon={UserCheck} title={t("tasks.chartByAssignee")}
                       subtitle={t("tasks.chartByAssigneeSub").replace("{n}", String(assigneeRows.length))}>
              {isLoading ? (
                <div className="p-4"><SkeletonChart className="h-52" /></div>
              ) : assigneeRows.length ? rankedCard(assigneeRows, assigneeMax, assigneeBadge, "assignees") : (
                <NoChart height={220} text={t("tasks.noData")} />
              )}
            </ChartCard>
          </div>

          {/* How long things take */}
          <ChartCard icon={Hourglass} title={t("tasks.chartAge")} subtitle={t("tasks.chartAgeSub")}>
            {isLoading ? (
              <div className="p-4"><SkeletonChart className="h-52" /></div>
            ) : stats.total ? (
              <div className="px-1 pt-1 pb-1">
                <Chart ready={chartsReady} height={252} options={ageOpts} series={ageSeries} type="bar" />
              </div>
            ) : (
              <NoChart height={252} text={t("tasks.noData")} />
            )}
          </ChartCard>
        </div>
      )}

      {/* ── Register — canonical POSITIONS-style TableCard with per-column sort. */}
      {view === "list" && (
        <TableCard
          className="mb-8"
          icon={ClipboardList}
          title={t("tasks.listTitle")}
          wrap
          right={
            <span className="text-[11px] tabular-nums whitespace-nowrap" style={{ color: "var(--text-4)" }}>
              {sorted.length}{sorted.length !== allRows.length ? ` / ${allRows.length}` : ""}
            </span>
          }
          toolbar={
            <>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t("tasks.search")}
                className="w-44"
              />
              {canCreate && (
                <Button size="lg" icon={<Plus size={14} />} onClick={openCreate}>{t("tasks.add")}</Button>
              )}
            </>
          }
        >
          <thead>
            <tr>
              {COLS.map((c) => (
                <Th key={c.key} label={c.label} icon={c.icon} k={c.key} sort={sort} onSort={onSort} align={c.align} />
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 6 }).map((_, i) => (
              <tr key={`sk-${i}`}>
                {COLS.map((c, j) => (
                  <td key={j} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && sorted.length === 0 && (
              <tr><td colSpan={COLS.length} className="px-3 py-8 text-center" style={{ color: "var(--text-4)" }}>
                {allRows.length === 0 ? t("tasks.empty") : t("tasks.noMatch")}
              </td></tr>
            )}
            {!isLoading && sorted.map((r) => {
              const expanded = expandedId === r.id;
              return (
                <Fragment key={r.id}>
                  <tr
                    onClick={() => r.can_edit && setExpandedId(expanded ? null : r.id)}
                    className={`align-top transition-colors hover:bg-[var(--bg-inner)] ${r.can_edit ? "cursor-pointer" : ""}`}
                    style={{ background: expanded ? "var(--bg-inner)" : "transparent", opacity: r.status === "done" ? 0.75 : 1 }}
                  >
                    {COLS.map((c) => cell(c.key, r))}
                  </tr>
                  {expanded && (
                    <tr style={{ background: "var(--bg-inner)" }}>
                      <td colSpan={COLS.length} className="px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
                        <div className="flex flex-wrap items-center gap-2">
                          <ActionBtn icon={Pencil} label={t("tasks.edit")} onClick={() => openEdit(r)} />
                          <ActionBtn icon={Trash2} label={t("tasks.delete")} color={CHART_OVERDUE} onClick={() => setConfirmDelete(r)} />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </TableCard>
      )}

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
          {/* Which tier — only asked when the viewer may create at both */}
          {!form.id && canCreateLeader && canCreateBrigadir && (
            <Field label={t("tasks.fieldTier")} required>
              <SegmentedToggle
                fill
                value={form.kind}
                onChange={(k) => setForm((f) => ({ ...f, kind: k, assignee_id: null }))}
                options={[[KIND_LEADER, t("btasks.tabLeader")], [KIND_SUP, t("btasks.tabBrigadir")]]}
              />
            </Field>
          )}

          <Field label={t("tasks.fieldTask")} required>
            <textarea
              value={form.task_text}
              onChange={(e) => setForm((f) => ({ ...f, task_text: e.target.value }))}
              rows={3}
              className="w-full rounded-lg px-3 py-2 text-sm outline-none resize-none"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
            />
          </Field>

          {/* Assignee — fixed on edit (re-queueing across people is not supported) */}
          <Field label={form.kind === KIND_SUP ? t("btasks.fieldBrigadir") : t("tasks.fieldLeader")} required={!form.id}>
            {form.id ? (
              <div
                className="w-full rounded-lg px-3 py-2 text-sm"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}
              >
                {tl(form.assignee_name) || "—"}
              </div>
            ) : (
              <StyledSelect
                value={form.assignee_id ? String(form.assignee_id) : ""}
                onChange={(v) => setForm((f) => ({ ...f, assignee_id: v ? Number(v) : null }))}
                options={form.kind === KIND_SUP ? brigadirPickOptions : leaderPickOptions}
                placeholder={form.kind === KIND_SUP ? t("btasks.pickBrigadir") : t("tasks.pickLeader")}
              />
            )}
          </Field>

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

      {/* The rest of a ranked board */}
      {moreList && (
        <Modal
          onClose={() => setMoreList(null)}
          title={moreList === "creators" ? t("tasks.chartByCreator") : t("tasks.chartByAssignee")}
        >
          <StackLegend parts={STACK_PARTS} />
          {moreList === "creators"
            ? <RankedList rows={creatorRows} max={creatorMax} parts={STACK_PARTS} unit={unit} badge={creatorBadge} extra={overdueMark} />
            : <RankedList rows={assigneeRows} max={assigneeMax} parts={STACK_PARTS} unit={unit} badge={assigneeBadge} extra={overdueMark} />}
        </Modal>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!confirmDelete}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => deleteMutation.mutate(confirmDelete)}
        title={t("tasks.deleteTitle")}
        message={t("tasks.deleteConfirm")}
        confirmLabel={t("tasks.delete")}
        cancelLabel={t("tasks.cancel")}
        tone="danger"
        loading={deleteMutation.isPending}
      />

      {/* Chat-style comments — the thread lives on the router that owns the row */}
      {commentsTask && (
        <CommentsModal
          endpoint={`${endpointFor(commentsTask.assignee_kind)}/${commentsTask.id}/comments`}
          queryKey={["task-comments", commentsTask.assignee_kind, commentsTask.id]}
          refreshKeys={[["task-board"]]}   // comment_count on the row
          title={t("tasks.commentsTitle")}
          subtitle={tl(commentsTask.task_text)}
          canComment={!!commentsTask.can_comment}
          onClose={() => setCommentsTask(null)}
        />
      )}
    </Layout>
  );
}
