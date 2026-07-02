import { useState, useMemo, useRef, useEffect, Fragment } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, X, Search, AlertTriangle, Loader2, ClipboardList,
  ChevronDown, ChevronUp, ChevronsUpDown, Check,
  CalendarClock, UserCheck, UserRound, ShieldCheck, FileText, CircleDot, Clock,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import KPICard from "../components/ui/KPICard";
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

const todayIso = () => new Date().toISOString().slice(0, 10);

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
  const { t } = useLang();
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const isAdmin = auth?.role === "admin";

  const statusLabel = (s) => t(`concerns.status.${s}`);

  const [leaderRef, setLeaderRef] = useState(null);   // admin: which leader to act for
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
  const { data: listResp, isLoading } = useQuery({
    queryKey: ["concerns", isAdmin ? (leaderRef ?? "all") : "own", statusFilter],
    queryFn: () =>
      api
        .get("/api/concerns", {
          params: {
            ...(isAdmin && leaderRef ? { leader_ref: leaderRef } : {}),
            ...(statusFilter !== "all" ? { status: statusFilter } : {}),
          },
        })
        .then((r) => r.data),
  });
  const rows = listResp?.data || [];

  // ── analytics (basic KPIs) ──────────────────────────────────────────────
  const kpi = useMemo(() => {
    const total = rows.length;
    const done = rows.filter((r) => r.status === "done").length;
    const open = total - done;
    const resolved = rows.filter((r) => r.status === "done" && r.resolution_days != null);
    const avg = resolved.length
      ? Math.round(resolved.reduce((s, r) => s + r.resolution_days, 0) / resolved.length)
      : null;
    return { total, done, open, avg };
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.concern_text || "").toLowerCase().includes(q) ||
        (r.concern_owner || "").toLowerCase().includes(q) ||
        (r.brigadir_name || "").toLowerCase().includes(q) ||
        (r.leader_name || "").toLowerCase().includes(q)
    );
  }, [rows, search]);

  // Show the leader column only when an admin is looking at everyone at once.
  const showLeaderCol = isAdmin && !leaderRef;

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
        case "cell":     return r.cell_code || "";
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
    qc.invalidateQueries({ queryKey: ["concern-cell-codes"] });
  };

  const buildPayload = () => ({
    cell_code: form.cell_code.trim() || null,
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
    setForm({ ...emptyForm(), leader_ref: isAdmin ? leaderRef : null });
    setAddingCode(false);
    setFormError("");
    setModalOpen(true);
  }
  function openEdit(r) {
    setForm({
      id: r.id,
      leader_ref: r.leader_role_ref,
      leader_name: r.leader_name || "",
      cell_code: r.cell_code || "",
      concern_owner: r.concern_owner || "",
      concern_text: r.concern_text || "",
      status: r.status || "todo",
      deadline_days: r.deadline_days ?? "",
      entry_date: r.entry_date || todayIso(),
      completion_date: r.completion_date || "",
      solution: r.solution || "",
    });
    setAddingCode(false);
    setFormError("");
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setForm(emptyForm());
    setAddingCode(false);
    setFormError("");
  }
  function submit() {
    if (isAdmin && !form.id && !form.leader_ref) return setFormError(t("concerns.pickLeaderFirst"));
    if (!form.concern_owner.trim()) return setFormError(t("concerns.ownerRequired"));
    if (!form.concern_text.trim()) return setFormError(t("concerns.textRequired"));
    saveMutation.mutate();
  }

  // Code dropdown options: the leader's known codes (+ the row's own code when
  // editing) plus an "add new" sentinel.
  const codeOptions = useMemo(() => {
    const set = new Set(cellCodes);
    if (form.cell_code) set.add(form.cell_code);
    const opts = [...set].sort().map((c) => ({ value: c, label: c }));
    opts.push({ value: "__new__", label: t("concerns.addNewCode") });
    return opts;
  }, [cellCodes, form.cell_code, t]);

  const leaderOptions = leaders.map((l) => ({
    value: String(l.role_ref),
    label: l.brigadir_name ? `${tl(l.name)} · ${tl(l.brigadir_name)}` : tl(l.name),
  }));

  return (
    <Layout title={t("concerns.title")} showFilters={false}>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <KPICard label={t("concerns.kpiTotal")} value={kpi.total} />
        <KPICard label={t("concerns.kpiOpen")} value={kpi.open} danger={kpi.open > 0} />
        <KPICard label={t("concerns.kpiDone")} value={kpi.done} accent />
        <KPICard
          label={t("concerns.kpiAvgDays")}
          value={kpi.avg == null ? "—" : kpi.avg}
          sub={kpi.avg == null ? undefined : t("concerns.days")}
        />
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
            {isAdmin && (
              <StyledSelect
                value={leaderRef ? String(leaderRef) : ""}
                onChange={(v) => setLeaderRef(v ? Number(v) : null)}
                options={[{ value: "", label: t("concerns.allLeaders") }, ...leaderOptions]}
                placeholder={t("concerns.pickLeader")}
                className="w-48"
              />
            )}
            <StyledSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: "all", label: t("concerns.allStatuses") },
                ...STATUSES.map((s) => ({ value: s, label: statusLabel(s) })),
              ]}
              className="w-36"
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
                  <Th icon={Hash}          label={t("concerns.colCell")}     k="cell"     sort={sort} onSort={onSort} />
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
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px]" style={{ ...cellB, color: "var(--text-2)" }}>{r.entry_date}</td>
                        {showLeaderCol && <td className="px-3 py-2.5 whitespace-nowrap" style={{ ...cellB, color: "var(--text-2)" }}>{tl(r.leader_name)}</td>}
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono text-[11px]" style={{ ...cellB, color: "var(--text-2)" }}>{r.cell_code || "—"}</td>
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
                      onChange={(v) => {
                        setAddingCode(false);
                        setForm((f) => ({ ...f, leader_ref: v ? Number(v) : null, cell_code: "" }));
                      }}
                      options={leaderOptions}
                      placeholder={t("concerns.pickLeader")}
                    />
                  )}
                </Field>
              )}

              {/* Date + cell code */}
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("concerns.fieldDate")}>
                  <input
                    type="date"
                    value={form.entry_date}
                    onChange={(e) => setForm((f) => ({ ...f, entry_date: e.target.value }))}
                    className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                  />
                </Field>
                <Field label={t("concerns.fieldCell")}>
                  <StyledSelect
                    value={addingCode ? "__new__" : form.cell_code}
                    onChange={(v) => {
                      if (v === "__new__") { setAddingCode(true); setForm((f) => ({ ...f, cell_code: "" })); }
                      else { setAddingCode(false); setForm((f) => ({ ...f, cell_code: v })); }
                    }}
                    options={codeOptions}
                    placeholder={t("concerns.selectCode")}
                  />
                  {addingCode && (
                    <input
                      autoFocus
                      value={form.cell_code}
                      onChange={(e) => setForm((f) => ({ ...f, cell_code: e.target.value }))}
                      placeholder={t("concerns.newCode")}
                      className="w-full rounded-lg px-3 py-2 text-sm outline-none mt-2"
                      style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" }}
                    />
                  )}
                </Field>
              </div>

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
