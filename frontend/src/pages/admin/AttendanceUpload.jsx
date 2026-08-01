/**
 * «Davomat» admin tab — the single-file attendance ingest.
 *
 * ONE «Отчёт по посещениям сотрудников» export covers the whole factory. Each
 * worker row carries a «Код подразделения» (a cell's verifix code) which
 * resolves to that cell's supervisor, so the page is a two-phase review:
 *
 *   upload  → the file is parsed into a DRAFT. Nothing is in `attendance`,
 *             no supervisor has been notified.
 *   adjust  → one section per supervisor, one ROW PER CELL. The row's checkbox
 *             says "these people count for this supervisor"; the row can be
 *             dragged into another supervisor's section (or back out to the
 *             "no supervisor" bucket at the top).
 *   save    → writes attendance and notifies the supervisors.
 *
 * Drag uses pointer events, not HTML5 dnd, so it works with a finger inside the
 * Telegram WebView — same choice ColumnsPicker made. Every drag is also
 * available as a plain «Move to…» menu item, because a drag is not a reliable
 * primary affordance on a phone.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDropzone } from "react-dropzone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, ArrowRightLeft, CalendarClock, Check, CheckCircle2, ChevronDown,
  ChevronRight, GripVertical, Lock, LockOpen, MoreVertical, Pencil, Pin, Plus,
  Save, Trash2, TriangleAlert, Upload, UserPlus, Users, X,
} from "lucide-react";

import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import DayStepper from "../../components/ui/DayStepper";
import FormField from "../../components/ui/FormField";
import Modal from "../../components/ui/Modal";
import SearchInput from "../../components/ui/SearchInput";
import StyledSelect from "../../components/ui/StyledSelect";
import { SkeletonCard } from "../../components/ui/Skeleton";

const QK = "attendance-batch";

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtNum(v, digits = 1) {
  if (v == null) return "—";
  return Number(v).toLocaleString(undefined, { maximumFractionDigits: digits });
}

/** Server error → a string we can actually show. FastAPI details may be objects. */
function errText(e, fallback) {
  const d = e?.response?.data?.detail;
  if (typeof d === "string") return d;
  if (d && typeof d === "object") return d.detail || d.code || fallback;
  return e?.message || fallback;
}

// ── small pieces ──────────────────────────────────────────────────────────────

function Chip({ tone = "neutral", icon: Icon, children, title }) {
  const colors = {
    ok:      "#22c55e",
    warn:    "#eab308",
    danger:  "#ef4444",
    neutral: "#94a3b8",
    brand:   "var(--brand)",
  };
  const c = colors[tone] || colors.neutral;
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap"
      style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}
    >
      {Icon && <Icon size={10} />}
      {children}
    </span>
  );
}

function Stat({ label, value, tone }) {
  return (
    <div
      className="rounded-xl px-3 py-2 min-w-0"
      style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
    >
      <div className="text-[10px] uppercase tracking-wider truncate" style={{ color: "var(--text-4)" }}>
        {label}
      </div>
      <div
        className="text-base font-bold tabular-nums mt-0.5"
        style={{ color: tone || "var(--text-1)" }}
      >
        {value}
      </div>
    </div>
  );
}

/** Checkbox styled like the rest of the app (no native control). */
function Tick({ checked, disabled, onChange, title }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className="flex-shrink-0 w-[18px] h-[18px] rounded-[5px] flex items-center justify-center transition-colors"
      style={{
        background: checked ? "var(--brand)" : "var(--bg-card)",
        border: `1px solid ${checked ? "var(--brand)" : "var(--border-md)"}`,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {checked && <Check size={12} color="#fff" strokeWidth={3} />}
    </button>
  );
}

/** Portal-anchored ⋯ menu — never clipped by the section card's overflow. */
function RowMenu({ items }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  const show = (e) => {
    e.stopPropagation();
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = 232;
    setPos({
      top: Math.min(r.bottom + 4, window.innerHeight - 8),
      left: Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8)),
      width,
    });
    setOpen(true);
  };

  const visible = items.filter(Boolean);
  if (!visible.length) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={show}
        className="flex-shrink-0 p-1.5 rounded-lg transition-colors hover:bg-white/10"
        style={{ color: "var(--text-3)" }}
      >
        <MoreVertical size={14} />
      </button>
      {open && pos && createPortal(
        <div className="fixed inset-0" style={{ zIndex: 90 }} onClick={() => setOpen(false)}>
          <div
            className="absolute rounded-xl overflow-hidden py-1"
            style={{
              top: pos.top, left: pos.left, width: pos.width,
              background: "var(--bg-card)",
              border: "1px solid var(--border-md)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {visible.map((it, i) => (
              <button
                key={i}
                type="button"
                onClick={() => { setOpen(false); it.onClick(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors hover:bg-white/5"
                style={{ color: it.danger ? "#ef4444" : "var(--text-2)" }}
              >
                {it.icon && <it.icon size={13} className="flex-shrink-0" />}
                <span className="truncate">{it.label}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ── worker table (inside an expanded cell row) ────────────────────────────────

function WorkerTable({ cell, locked, t, tl, onEdit, onDelete, onAdd }) {
  const cols = [
    t("attUp.colWorker"), t("attUp.colJob"), t("attUp.colSchedule"),
    t("attUp.colClock"), t("attUp.colHours"), t("attUp.colEarly"),
    t("attUp.colEffective"), "",
  ];
  return (
    <div style={{ background: "var(--bg-base)", borderTop: "1px solid var(--border)" }}>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: 720 }}>
          <thead>
            <tr style={{ background: "var(--bg-inner)" }}>
              {cols.map((c, i) => (
                <th
                  key={i}
                  className="px-3 py-2 text-left font-semibold uppercase tracking-wider text-[10px] whitespace-nowrap"
                  style={{ color: "var(--text-4)", borderRight: i < cols.length - 1 ? "1px solid var(--border)" : "none" }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {cell.rows.length === 0 && (
              <tr>
                <td colSpan={cols.length} className="px-3 py-6 text-center" style={{ color: "var(--text-4)" }}>
                  {t("attUp.noWorkers")}
                </td>
              </tr>
            )}
            {cell.rows.map((r) => (
              <tr
                key={r.id}
                style={{
                  borderTop: "1px solid var(--border)",
                  opacity: r.counted ? 1 : 0.55,
                }}
              >
                <td className="px-3 py-2" style={{ borderRight: "1px solid var(--border)" }}>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate" style={{ color: "var(--text-1)" }}>{tl(r.worker_name)}</span>
                    {r.manual && <Chip tone="brand">{t("attUp.manual")}</Chip>}
                    {!r.manual && r.edited && <Chip tone="warn">{t("attUp.edited")}</Chip>}
                  </div>
                </td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-3)", borderRight: "1px solid var(--border)" }}>
                  {tl(r.job_title) || "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-3)", borderRight: "1px solid var(--border)" }}>
                  {r.schedule || "—"}
                </td>
                <td className="px-3 py-2 whitespace-nowrap font-mono text-[11px]" style={{ color: "var(--text-2)", borderRight: "1px solid var(--border)" }}>
                  {r.clock_in_out || "—"}
                </td>
                <td className="px-3 py-2 tabular-nums font-semibold whitespace-nowrap" style={{ color: r.counted ? "var(--text-1)" : "var(--text-4)", borderRight: "1px solid var(--border)" }}>
                  {r.hours_worked == null ? "—" : fmtNum(r.hours_worked, 2)}
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)", borderRight: "1px solid var(--border)" }}>
                  {r.early_arrival_min ? `${fmtNum(r.early_arrival_min, 0)}′` : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)", borderRight: "1px solid var(--border)" }}>
                  {r.effective_hours == null ? "—" : fmtNum(r.effective_hours, 2)}
                </td>
                <td className="px-3 py-2">
                  {!locked && (
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => onEdit(r)}
                        title={t("attUp.editWorker")}
                        className="p-1 rounded-md transition-colors hover:bg-white/10"
                        style={{ color: "var(--text-3)" }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(r)}
                        title={t("attUp.delete")}
                        className="p-1 rounded-md transition-colors hover:bg-white/10"
                        style={{ color: "#ef4444" }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="px-3 py-2" style={{ borderTop: "1px solid var(--border)" }}>
          <Button variant="ghost" size="sm" icon={<UserPlus size={12} />} onClick={onAdd}>
            {t("attUp.addWorker")}
          </Button>
        </div>
      )}
    </div>
  );
}

// ── one cell row ──────────────────────────────────────────────────────────────

function CellRow({
  cell, locked, expanded, dragging, t, cellName,
  onToggleExpand, onToggleTick, onDragStart, menuItems,
}) {
  const dim = !cell.included;
  return (
    <div
      style={{
        borderTop: "1px solid var(--border)",
        background: dragging ? "var(--bg-inner)" : "transparent",
        opacity: dragging ? 0.4 : 1,
      }}
    >
      <div className="flex items-center gap-2 px-2 sm:px-3 py-2">
        <button
          type="button"
          onPointerDown={(e) => !locked && onDragStart(e, cell)}
          title={t("attUp.dragHint")}
          className="flex-shrink-0 p-1 rounded-md"
          style={{
            color: "var(--text-4)",
            touchAction: "none",
            cursor: locked ? "not-allowed" : "grab",
            opacity: locked ? 0.3 : 1,
          }}
        >
          <GripVertical size={14} />
        </button>

        <Tick
          checked={cell.included}
          disabled={locked || !cell.manager_id}
          onChange={(v) => onToggleTick(cell, v)}
          title={cell.manager_id ? t("attUp.tickHint") : t("attUp.tickNeedsSupervisor")}
        />

        <button
          type="button"
          onClick={() => onToggleExpand(cell.verifix_code)}
          className="flex items-center gap-2 min-w-0 flex-1 text-left"
        >
          {expanded ? <ChevronDown size={13} style={{ color: "var(--text-4)" }} /> : <ChevronRight size={13} style={{ color: "var(--text-4)" }} />}
          <span
            className="font-mono text-[11px] font-bold flex-shrink-0 px-1.5 py-0.5 rounded"
            style={{ background: "var(--bg-inner)", color: dim ? "var(--text-4)" : "var(--brand-text)" }}
          >
            {cell.verifix_code}
          </span>
          <span className="truncate text-xs" style={{ color: dim ? "var(--text-4)" : "var(--text-1)" }}>
            {cellName(cell)}
          </span>
          {cell.moved && <Chip tone="warn" icon={ArrowRightLeft} title={t("attUp.movedHint")}>{t("attUp.moved")}</Chip>}
        </button>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <span className="hidden sm:inline text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
            {cell.present}/{cell.workers} <span className="hidden md:inline">{t("attUp.people")}</span>
          </span>
          <span
            className="text-[11px] tabular-nums font-semibold w-[58px] text-right"
            style={{ color: dim ? "var(--text-4)" : "var(--text-2)" }}
          >
            {fmtNum(cell.hours, 1)} {t("attUp.hoursShort")}
          </span>
          {!locked && <RowMenu items={menuItems(cell)} />}
        </div>
      </div>
    </div>
  );
}

// ── supervisor section ────────────────────────────────────────────────────────

function Section({
  section, orphan, locked, t, tl, cellName, expandedCells, dragCode, dropTarget,
  sectionRef, onToggleExpand, onToggleTick, onDragStart, cellMenuItems, sectionMenuItems,
  renderWorkers,
}) {
  const isDropTarget = dropTarget != null && dropTarget === (section.manager_id ?? "none");
  const dayTone = section.day_state === "open" ? "ok"
    : section.day_state === "confirmed" ? "neutral" : "warn";
  const dayLabel = t(`attUp.day.${section.day_state}`);

  return (
    <div
      ref={sectionRef}
      className="rounded-xl overflow-hidden transition-shadow"
      style={{
        background: "var(--bg-card)",
        border: `1px solid ${isDropTarget ? "var(--brand)" : orphan ? "#eab308" : "var(--border)"}`,
        boxShadow: isDropTarget ? "0 0 0 3px color-mix(in srgb, var(--brand) 22%, transparent)" : "none",
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 flex-wrap"
        style={{ background: orphan ? "color-mix(in srgb, #eab308 8%, var(--bg-inner))" : "var(--bg-inner)" }}
      >
        {orphan
          ? <TriangleAlert size={14} className="flex-shrink-0" style={{ color: "#eab308" }} />
          : <Users size={14} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider truncate" style={{ color: "var(--text-2)" }}>
              {orphan ? t("attUp.noSupervisor") : tl(section.manager_name)}
            </span>
            {!orphan && section.shift != null && (
              <Chip tone="neutral">{t("attUp.shift")} {section.shift}</Chip>
            )}
            {!orphan && <Chip tone={dayTone} icon={section.day_state === "open" ? LockOpen : Lock}>{dayLabel}</Chip>}
          </div>
          <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>
            {orphan
              ? t("attUp.noSupervisorHint")
              : `${section.totals.included}/${section.totals.cells} ${t("attUp.cellsWord")} · ${section.totals.present}/${section.totals.workers} ${t("attUp.people")} · ${fmtNum(section.totals.hours, 1)} ${t("attUp.hoursShort")}`}
          </div>
        </div>

        {!orphan && <RowMenu items={sectionMenuItems(section)} />}
      </div>

      {/* Cells */}
      {section.cells.length === 0 ? (
        <div className="px-3 py-5 text-center text-xs" style={{ color: "var(--text-4)", borderTop: "1px solid var(--border)" }}>
          {t("attUp.dropHere")}
        </div>
      ) : section.cells.map((cell) => (
        <div key={cell.verifix_code}>
          <CellRow
            cell={cell}
            locked={locked || (!orphan && section.day_state !== "open")}
            expanded={expandedCells.includes(cell.verifix_code)}
            dragging={dragCode === cell.verifix_code}
            t={t}
            cellName={cellName}
            onToggleExpand={onToggleExpand}
            onToggleTick={onToggleTick}
            onDragStart={onDragStart}
            menuItems={cellMenuItems}
          />
          {expandedCells.includes(cell.verifix_code) && renderWorkers(cell, section)}
        </div>
      ))}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AttendanceUpload() {
  const { t } = useLang();
  const { tl, lang } = useTranslit();
  const qc = useQueryClient();

  const [date, setDate] = usePersistentState("attup_date", todayISO());
  const [expandedCells, setExpandedCells] = usePersistentState("attup_expanded", []);
  const [search, setSearch] = useState("");
  const [toast, setToast] = useState(null);            // {tone, text}
  const [confirm, setConfirm] = useState(null);        // ConfirmDialog config
  const [savePreview, setSavePreview] = useState(null);
  const [rowForm, setRowForm] = useState(null);        // {mode, row?, cell}
  const [moveFor, setMoveFor] = useState(null);        // cell awaiting a "move to"
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);

  const toastTimer = useRef(null);
  const say = useCallback((text, tone = "ok") => {
    setToast({ text, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4200);
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  // ── data ───────────────────────────────────────────────────────────────────
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: [QK, date],
    queryFn: () => api.get("/api/attendance-batch", { params: { date } }).then((r) => r.data),
    retry: 1,
  });

  const { data: managers = [] } = useQuery({
    queryKey: [QK, "managers"],
    queryFn: () => api.get("/api/attendance-batch/managers").then((r) => r.data),
    staleTime: 300_000,
  });

  const applyData = useCallback((payload) => {
    qc.setQueryData([QK, date], payload);
  }, [qc, date]);

  const status = data?.status ?? "none";
  const isDraft = status === "draft";
  const isPartial = status === "partial";   // some cells saved, others still staged
  const isLegacy = status === "legacy";
  const locked = isLegacy;   // days from the old per-supervisor path are read-only
  // Nothing reaches `attendance` until Save, so this count IS the call to action.
  const pendingCells = data?.totals?.pending ?? 0;

  // ── mutations ──────────────────────────────────────────────────────────────
  const onMutError = useCallback((e) => {
    const d = e?.response?.data?.detail;
    if (d && typeof d === "object" && d.code === "day_closed") {
      say(t("attUp.dayClosedErr").replace("{name}", tl(d.manager_name)), "danger");
      return;
    }
    say(errText(e, t("attUp.actionFailed")), "danger");
  }, [say, t, tl]);

  const mapMut = useMutation({
    mutationFn: (body) => api.put("/api/attendance-batch/cells", { date, ...body }).then((r) => r.data),
    onSuccess: (payload) => {
      applyData(payload);
      if (payload.skipped_managers?.length) say(t("attUp.someSkipped"), "warn");
    },
    onError: onMutError,
  });

  const rowMut = useMutation({
    mutationFn: async ({ action, row, body }) => {
      if (action === "add") return (await api.post("/api/attendance-batch/rows", { date, ...body })).data;
      if (action === "edit") return (await api.patch(`/api/attendance-batch/rows/${row.id}`, { date, ...body })).data;
      return (await api.delete(`/api/attendance-batch/rows/${row.id}`, { params: { date } })).data;
    },
    onSuccess: (payload) => { applyData(payload); say(t("attUp.savedChange")); },
    onError: onMutError,
  });

  const cellDayMut = useMutation({
    mutationFn: (code) => api.delete("/api/attendance-batch/cell-day", {
      params: { date, verifix_code: code },
    }).then((r) => r.data),
    onSuccess: (payload) => { applyData(payload); say(t("attUp.deleted"), "warn"); },
    onError: onMutError,
  });

  const supDayMut = useMutation({
    mutationFn: (managerId) => api.delete("/api/attendance-batch/supervisor-day", {
      params: { date, manager_id: managerId },
    }).then((r) => r.data),
    onSuccess: (payload) => { applyData(payload); say(t("attUp.deleted"), "warn"); },
    onError: onMutError,
  });

  const reopenMut = useMutation({
    mutationFn: (managerId) => api.post("/api/staff/approvals/reopen", { manager_id: managerId, date }),
    onSuccess: () => { refetch(); say(t("attUp.reopened")); },
    onError: onMutError,
  });

  const saveMut = useMutation({
    mutationFn: () => api.post("/api/attendance-batch/save", { date, notify: true }).then((r) => r.data),
    onSuccess: (payload) => {
      applyData(payload);
      setSavePreview(null);
      const s = payload.saved || {};
      say(t("attUp.saveDone")
        .replace("{rows}", s.rows ?? 0)
        .replace("{n}", s.notified?.length ?? 0));
      if (s.skipped?.length) say(t("attUp.someSkipped"), "warn");
      qc.invalidateQueries({ queryKey: [QK, "dates"] });
    },
    onError: (e) => { setSavePreview(null); onMutError(e); },
  });

  const discardMut = useMutation({
    mutationFn: () => api.delete("/api/attendance-batch", { params: { date } }),
    onSuccess: () => { refetch(); say(t("attUp.discarded"), "warn"); },
    onError: onMutError,
  });

  // ── upload ─────────────────────────────────────────────────────────────────
  // A day is fed by SEVERAL files (one per «Орг. единица» group), so an upload
  // always merges: no "replace existing?" prompt, and cells the file doesn't
  // mention keep their routing, ticks and row edits untouched.
  const doUpload = useCallback(async (file) => {
    setUploading(true);
    const form = new FormData();
    form.append("files", file);
    try {
      const { data: payload } = await api.post("/api/attendance-batch/upload", form);
      setDate(payload.date);
      qc.setQueryData([QK, payload.date], payload);
      qc.invalidateQueries({ queryKey: [QK, "dates"] });
      setUploadSummary(payload.upload_result || null);
      say(t("attUp.uploaded").replace("{date}", payload.date));
    } catch (e) {
      say(errText(e, t("attUp.uploadFailed")), "danger");
    } finally {
      setUploading(false);
    }
  }, [qc, say, setDate, t]);

  const removeUploadMut = useMutation({
    mutationFn: (uploadId) => api.delete(`/api/attendance-batch/uploads/${uploadId}`, {
      params: { date },
    }).then((r) => r.data),
    onSuccess: (payload) => {
      applyData(payload);
      setUploadSummary(null);
      const r = payload.removed || {};
      say(t("attUp.uploadRemoved")
        .replace("{cells}", r.cells_removed?.length ?? 0)
        .replace("{rows}", r.rows_deleted ?? 0), "warn");
    },
    onError: onMutError,
  });

  const onDrop = useCallback((accepted) => {
    if (accepted.length) doUpload(accepted[0]);
  }, [doUpload]);

  const { getRootProps, getInputProps, isDragActive, open: openFilePicker } = useDropzone({
    onDrop,
    accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: uploading,
  });

  // ── drag between sections ──────────────────────────────────────────────────
  const sectionRefs = useRef({});
  const [drag, setDrag] = useState(null);          // {code, from, x, y}
  const [dropTarget, setDropTarget] = useState(null);
  const dragState = useRef(null);

  const onDragStart = useCallback((e, cell) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const from = cell.manager_id ?? "none";
    dragState.current = { code: cell.verifix_code, from, target: from };
    setDrag({ code: cell.verifix_code, from, x: e.clientX, y: e.clientY });
    setDropTarget(from);

    const onMove = (ev) => {
      const x = ev.clientX, y = ev.clientY;
      let hit = null;
      for (const [key, el] of Object.entries(sectionRefs.current)) {
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) { hit = key; break; }
      }
      dragState.current.target = hit;
      setDropTarget(hit);
      setDrag((d) => (d ? { ...d, x, y } : d));
    };

    const finish = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      const st = dragState.current;
      dragState.current = null;
      setDrag(null);
      setDropTarget(null);
      if (!st || st.target == null || String(st.target) === String(st.from)) return;
      if (st.target === "none") {
        mapMut.mutate({ changes: [{ verifix_code: st.code, clear_manager: true }] });
      } else {
        mapMut.mutate({ changes: [{ verifix_code: st.code, manager_id: Number(st.target), included: true }] });
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }, [mapMut]);

  // ── derived view ───────────────────────────────────────────────────────────
  const cellName = useCallback((cell) => {
    const byLang = {
      uz: cell.name_uz, uz_cyrl: cell.name_uz_cyrl, ru: cell.name_ru, en: cell.name_en,
    }[lang];
    return tl(byLang || cell.name_ru || cell.name || "") || t("attUp.unnamedCell");
  }, [lang, tl, t]);

  const filtered = useMemo(() => {
    if (!data) return { sections: [], unassigned: [] };
    const q = search.trim().toLowerCase();
    if (!q) return { sections: data.sections, unassigned: data.unassigned };
    const matchCell = (c) =>
      (c.verifix_code || "").toLowerCase().includes(q) ||
      cellName(c).toLowerCase().includes(q) ||
      c.rows.some((r) => (r.worker_name || "").toLowerCase().includes(q) || tl(r.worker_name || "").toLowerCase().includes(q));
    return {
      sections: data.sections
        .map((s) => ({ ...s, cells: s.cells.filter(matchCell) }))
        .filter((s) => s.cells.length || tl(s.manager_name || "").toLowerCase().includes(q)),
      unassigned: data.unassigned.filter(matchCell),
    };
  }, [data, search, cellName, tl]);

  const managerOptions = useMemo(
    () => [...managers]
      .sort((a, b) => tl(a.name).localeCompare(tl(b.name)))
      .map((m) => ({ value: String(m.manager_id), label: tl(m.name), title: tl(m.name) })),
    [managers, tl],
  );

  const toggleExpand = useCallback((code) => {
    setExpandedCells((prev) => prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]);
  }, [setExpandedCells]);

  // ── menus ──────────────────────────────────────────────────────────────────
  const cellMenuItems = useCallback((cell) => [
    { label: t("attUp.moveTo"), icon: ArrowRightLeft, onClick: () => setMoveFor(cell) },
    cell.manager_id && {
      label: t("attUp.removeFromSupervisor"), icon: X,
      onClick: () => mapMut.mutate({ changes: [{ verifix_code: cell.verifix_code, clear_manager: true }] }),
    },
    {
      label: t("attUp.makePermanent"), icon: Pin,
      onClick: () => setConfirm({
        tone: "warning",
        title: t("attUp.makePermanentTitle"),
        message: t("attUp.makePermanentMsg").replace("{code}", cell.verifix_code),
        confirmLabel: t("attUp.makePermanent"),
        onConfirm: () => {
          mapMut.mutate({
            permanent: true,
            changes: [{ verifix_code: cell.verifix_code, manager_id: cell.manager_id, included: cell.included }],
          });
          setConfirm(null);
          say(t("attUp.madePermanent"));
        },
      }),
    },
    { label: t("attUp.addWorker"), icon: UserPlus, onClick: () => setRowForm({ mode: "add", cell }) },
    {
      label: t("attUp.deleteCellDay"), icon: Trash2, danger: true,
      onClick: () => setConfirm({
        tone: "danger",
        title: t("attUp.deleteCellDayTitle"),
        message: t("attUp.deleteCellDayMsg")
          .replace("{code}", cell.verifix_code)
          .replace("{n}", cell.workers),
        confirmLabel: t("attUp.delete"),
        onConfirm: () => { cellDayMut.mutate(cell.verifix_code); setConfirm(null); },
      }),
    },
  ], [t, mapMut, cellDayMut, say]);

  const sectionMenuItems = useCallback((section) => [
    section.day_state !== "open" && {
      label: t("attUp.reopenDay"), icon: LockOpen,
      onClick: () => setConfirm({
        tone: "warning",
        title: t("attUp.reopenTitle"),
        message: t("attUp.reopenMsg").replace("{name}", tl(section.manager_name)),
        confirmLabel: t("attUp.reopenDay"),
        onConfirm: () => { reopenMut.mutate(section.manager_id); setConfirm(null); },
      }),
    },
    {
      label: t("attUp.deleteSupervisorDay"), icon: Trash2, danger: true,
      onClick: () => setConfirm({
        tone: "danger",
        title: t("attUp.deleteSupervisorDayTitle"),
        message: t("attUp.deleteSupervisorDayMsg")
          .replace("{name}", tl(section.manager_name))
          .replace("{n}", section.totals.workers),
        confirmLabel: t("attUp.delete"),
        onConfirm: () => { supDayMut.mutate(section.manager_id); setConfirm(null); },
      }),
    },
  ], [t, tl, reopenMut, supDayMut]);

  const renderWorkers = useCallback((cell, section) => (
    <WorkerTable
      cell={cell}
      locked={locked || (section && section.manager_id && section.day_state !== "open")}
      t={t}
      tl={tl}
      onEdit={(row) => setRowForm({ mode: "edit", row, cell })}
      onAdd={() => setRowForm({ mode: "add", cell })}
      onDelete={(row) => setConfirm({
        tone: "danger",
        title: t("attUp.deleteWorkerTitle"),
        message: t("attUp.deleteWorkerMsg").replace("{name}", tl(row.worker_name)),
        confirmLabel: t("attUp.delete"),
        onConfirm: () => { rowMut.mutate({ action: "delete", row }); setConfirm(null); },
      })}
    />
  ), [locked, t, tl, rowMut]);

  // ── save flow ──────────────────────────────────────────────────────────────
  async function openSave() {
    try {
      const { data: preview } = await api.get("/api/attendance-batch/save-preview", { params: { date } });
      setSavePreview(preview);
    } catch (e) {
      say(errText(e, t("attUp.actionFailed")), "danger");
    }
  }

  const totals = data?.totals;
  const hasUnassigned = (data?.unassigned?.length ?? 0) > 0;

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div {...getRootProps()} className="max-w-6xl mx-auto p-3 sm:p-6 space-y-4">
      <input {...getInputProps()} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <DayStepper value={date} onChange={setDate} max={null} />
        {status === "draft" && <Chip tone="warn" icon={AlertTriangle}>{t("attUp.statusDraft")}</Chip>}
        {isPartial && (
          <Chip tone="warn" icon={AlertTriangle}>
            {t("attUp.statusPartial").replace("{n}", pendingCells)}
          </Chip>
        )}
        {status === "saved" && <Chip tone="ok" icon={CheckCircle2}>{t("attUp.statusSaved")}</Chip>}
        {status === "legacy" && <Chip tone="neutral" icon={CalendarClock}>{t("attUp.statusLegacy")}</Chip>}

        <div className="flex-1 min-w-[140px]">
          <SearchInput value={search} onChange={setSearch} placeholder={t("attUp.search")} />
        </div>

        <Button
          size="lg"
          variant="secondary"
          icon={<Upload size={14} />}
          onClick={openFilePicker}
          loading={uploading}
        >
          {t("attUp.upload")}
        </Button>
        {!locked && status !== "none" && (
          <Button
            size="lg"
            icon={<Save size={14} />}
            onClick={openSave}
            loading={saveMut.isPending}
            // Nothing pending = everything on this page is already in attendance.
            disabled={!data || pendingCells === 0}
            title={pendingCells === 0 ? t("attUp.allSaved") : undefined}
          >
            {isDraft ? t("attUp.save") : t("attUp.saveChanges")}
          </Button>
        )}
      </div>

      {/* Drop overlay */}
      {isDragActive && (
        <div
          className="rounded-xl border-2 border-dashed p-8 text-center text-sm"
          style={{ borderColor: "var(--brand)", background: "var(--brand-bg)", color: "var(--brand-text)" }}
        >
          {t("attUp.dropActive")}
        </div>
      )}

      {/* What the last upload actually did — merges are invisible otherwise. */}
      {uploadSummary && (
        <div
          className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: "color-mix(in srgb, #22c55e 10%, transparent)", border: "1px solid color-mix(in srgb, #22c55e 30%, transparent)" }}
        >
          <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#22c55e" }} />
          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="text-xs font-semibold truncate" style={{ color: "var(--text-1)" }}>
              {uploadSummary.filename}
            </div>
            <div className="text-[11px]" style={{ color: "var(--text-3)" }}>
              {t("attUp.mergeSummary")
                .replace("{added}", uploadSummary.cells_added?.length ?? 0)
                .replace("{updated}", uploadSummary.cells_replaced?.length ?? 0)
                .replace("{rows}", uploadSummary.rows_added ?? 0)}
            </div>
            {uploadSummary.created_cells?.length > 0 && (
              <div className="text-[11px]" style={{ color: "#eab308" }}>
                {t("attUp.mergeNewCells").replace("{n}", uploadSummary.created_cells.length)}
                {": "}{uploadSummary.created_cells.join(", ")}
              </div>
            )}
            {uploadSummary.kept_edits > 0 && (
              <div className="text-[11px]" style={{ color: "#eab308" }}>
                {t("attUp.mergeKeptEdits").replace("{n}", uploadSummary.kept_edits)}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setUploadSummary(null)}
            className="p-1 rounded-md flex-shrink-0"
            style={{ color: "var(--text-4)" }}
          >
            <X size={13} />
          </button>
        </div>
      )}

      {/* Banners */}
      {(isDraft || isPartial) && (
        <div
          className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: "color-mix(in srgb, #eab308 12%, transparent)", border: "1px solid color-mix(in srgb, #eab308 35%, transparent)" }}
        >
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-semibold" style={{ color: "var(--text-1)" }}>
              {isDraft
                ? t("attUp.draftTitle")
                : t("attUp.partialTitle").replace("{n}", pendingCells)}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-3)" }}>
              {isDraft ? t("attUp.draftMsg") : t("attUp.partialMsg")}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirm({
              tone: "danger",
              title: t("attUp.discardTitle"),
              message: t("attUp.discardMsg"),
              confirmLabel: t("attUp.discard"),
              onConfirm: () => { discardMut.mutate(); setConfirm(null); },
            })}
          >
            {t("attUp.discard")}
          </Button>
        </div>
      )}

      {/* The day's files — each removable on its own. */}
      {(data?.uploads?.length ?? 0) > 0 && (
        <UploadsList
          uploads={data.uploads}
          t={t}
          tl={tl}
          busy={removeUploadMut.isPending}
          onRemove={(u) => setConfirm({
            tone: "danger",
            title: t("attUp.removeUploadTitle"),
            message: t("attUp.removeUploadMsg")
              .replace("{file}", u.filename || "—")
              .replace("{n}", u.cells_now),
            confirmLabel: t("attUp.removeUpload"),
            onConfirm: () => { removeUploadMut.mutate(u.id); setConfirm(null); },
          })}
        />
      )}

      {status !== "legacy" && data?.batch?.saved_at && (
        <div className="text-[11px] px-1" style={{ color: "var(--text-4)" }}>
          {t("attUp.savedMeta")
            .replace("{by}", tl(data.batch.saved_by || "—"))
            .replace("{at}", new Date(data.batch.saved_at).toLocaleString())}
        </div>
      )}

      {isLegacy && (
        <div
          className="flex items-start gap-2.5 rounded-xl px-3.5 py-3"
          style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
        >
          <CalendarClock size={15} className="flex-shrink-0 mt-0.5" style={{ color: "var(--text-3)" }} />
          <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("attUp.legacyMsg")}</div>
        </div>
      )}

      {/* Stats */}
      {totals && (
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <Stat label={t("attUp.statSupervisors")} value={totals.supervisors} />
          <Stat label={t("attUp.statCells")} value={`${totals.included}/${totals.cells}`} />
          <Stat label={t("attUp.statWorkers")} value={totals.workers} />
          <Stat label={t("attUp.statCounted")} value={totals.counted} />
          <Stat label={t("attUp.statHours")} value={fmtNum(totals.hours, 1)} />
          <Stat
            label={t("attUp.statUnassigned")}
            value={totals.unassigned}
            tone={totals.unassigned ? "#eab308" : undefined}
          />
        </div>
      )}

      {/* Body */}
      {isLoading && <SkeletonCard />}

      {isError && !isLoading && (
        <div
          className="rounded-xl px-4 py-6 text-center"
          style={{ background: "var(--bg-card)", border: "1px solid #ef4444" }}
        >
          <TriangleAlert size={22} className="mx-auto mb-2" style={{ color: "#ef4444" }} />
          <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{t("attUp.loadFailed")}</div>
          <div className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{errText(error, "")}</div>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => refetch()}>{t("attUp.retry")}</Button>
        </div>
      )}

      {!isLoading && !isError && status === "none" && (
        <div
          className="rounded-xl px-4 py-12 text-center"
          style={{ background: "var(--bg-card)", border: "1px dashed var(--border-md)" }}
        >
          <Upload size={26} className="mx-auto mb-3" style={{ color: "var(--text-4)" }} />
          <div className="text-sm font-semibold" style={{ color: "var(--text-2)" }}>{t("attUp.emptyTitle")}</div>
          <div className="text-xs mt-1 mb-4" style={{ color: "var(--text-4)" }}>{t("attUp.emptyMsg")}</div>
          <Button size="lg" icon={<Upload size={14} />} onClick={openFilePicker} loading={uploading}>
            {t("attUp.upload")}
          </Button>
        </div>
      )}

      {!isLoading && !isError && status !== "none" && (
        <div className="space-y-3">
          {/* Unassigned first — it is the work the admin still has to do. */}
          {(hasUnassigned || drag) && (
            <Section
              section={{
                manager_id: null, manager_name: "", shift: null, day_state: "open",
                cells: filtered.unassigned,
                totals: { cells: filtered.unassigned.length, included: 0, workers: 0, present: 0, hours: 0 },
              }}
              orphan
              locked={locked}
              t={t} tl={tl} cellName={cellName}
              expandedCells={expandedCells}
              dragCode={drag?.code}
              dropTarget={dropTarget}
              sectionRef={(el) => { sectionRefs.current.none = el; }}
              onToggleExpand={toggleExpand}
              onToggleTick={(cell, v) => mapMut.mutate({ changes: [{ verifix_code: cell.verifix_code, included: v }] })}
              onDragStart={onDragStart}
              cellMenuItems={cellMenuItems}
              sectionMenuItems={sectionMenuItems}
              renderWorkers={renderWorkers}
            />
          )}

          {filtered.sections.map((s) => (
            <Section
              key={s.manager_id}
              section={s}
              locked={locked}
              t={t} tl={tl} cellName={cellName}
              expandedCells={expandedCells}
              dragCode={drag?.code}
              dropTarget={dropTarget}
              sectionRef={(el) => { sectionRefs.current[s.manager_id] = el; }}
              onToggleExpand={toggleExpand}
              onToggleTick={(cell, v) => mapMut.mutate({ changes: [{ verifix_code: cell.verifix_code, included: v }] })}
              onDragStart={onDragStart}
              cellMenuItems={cellMenuItems}
              sectionMenuItems={sectionMenuItems}
              renderWorkers={renderWorkers}
            />
          ))}

          {filtered.sections.length === 0 && !hasUnassigned && (
            <div className="rounded-xl px-4 py-10 text-center text-xs"
                 style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-4)" }}>
              {search ? t("attUp.noMatch") : t("attUp.emptyMsg")}
            </div>
          )}
        </div>
      )}

      {/* Drag ghost */}
      {drag && createPortal(
        <div
          className="fixed pointer-events-none rounded-lg px-2.5 py-1.5 text-xs font-semibold"
          style={{
            left: drag.x + 12, top: drag.y + 12, zIndex: 120,
            background: "var(--brand)", color: "#fff",
            boxShadow: "0 8px 24px rgba(0,0,0,0.35)",
          }}
        >
          {drag.code}
        </div>,
        document.body,
      )}

      {/* Toast */}
      {toast && createPortal(
        <div className="fixed left-1/2 -translate-x-1/2 bottom-6" style={{ zIndex: 130 }}>
          <div
            className="toast-in flex items-center gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg max-w-[92vw]"
            style={{
              background: toast.tone === "danger" ? "#ef4444" : toast.tone === "warn" ? "#eab308" : "#22c55e",
              color: "#fff",
            }}
          >
            {toast.tone === "danger" ? <TriangleAlert size={16} /> : <CheckCircle2 size={16} />}
            <span className="min-w-0">{toast.text}</span>
          </div>
        </div>,
        document.body,
      )}

      {/* Replace-existing-upload confirm */}
      {pendingFile && (
        <ConfirmDialog
          open
          tone="warning"
          title={t("attUp.replaceTitle")}
          message={t("attUp.replaceMsg")
            .replace("{date}", pendingFile.existing.date)
            .replace("{status}", t(`attUp.status${pendingFile.existing.status === "draft" ? "Draft" : "Saved"}`))}
          confirmLabel={t("attUp.replaceConfirm")}
          cancelLabel={t("attUp.cancel")}
          loading={uploading}
          onCancel={() => setPendingFile(null)}
          onConfirm={() => doUpload(pendingFile.file, true)}
        />
      )}

      {/* Generic confirm */}
      {confirm && (
        <ConfirmDialog
          open
          tone={confirm.tone}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          cancelLabel={t("attUp.cancel")}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm.onConfirm}
        />
      )}

      {/* Move-to-supervisor picker (the drag's accessible twin) */}
      {moveFor && (
        <Modal
          open
          onClose={() => setMoveFor(null)}
          title={t("attUp.moveTo")}
          subtitle={`${moveFor.verifix_code} · ${cellName(moveFor)}`}
          icon={<ArrowRightLeft size={15} style={{ color: "var(--brand-text)" }} />}
          maxWidth="max-w-sm"
          footer={<Button variant="secondary" onClick={() => setMoveFor(null)}>{t("attUp.cancel")}</Button>}
        >
          <FormField label={t("attUp.supervisor")}>
            <StyledSelect
              value={moveFor.manager_id ? String(moveFor.manager_id) : ""}
              onChange={(v) => {
                mapMut.mutate({ changes: [{ verifix_code: moveFor.verifix_code, manager_id: Number(v), included: true }] });
                setMoveFor(null);
              }}
              options={managerOptions}
              placeholder={t("attUp.pickSupervisor")}
              searchable
              searchPlaceholder={t("attUp.search")}
            />
          </FormField>
          <div className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("attUp.moveHint")}</div>
        </Modal>
      )}

      {/* Add / edit worker */}
      {rowForm && (
        <RowFormModal
          // Remount per target row: the form seeds its state from `form.row`
          // once, so switching rows without a remount would keep the previous
          // worker's values in the inputs.
          key={`${rowForm.mode}:${rowForm.row?.id ?? rowForm.cell.verifix_code}`}
          form={rowForm}
          t={t}
          busy={rowMut.isPending}
          onClose={() => setRowForm(null)}
          onSubmit={(body) => {
            rowMut.mutate(
              rowForm.mode === "add"
                ? { action: "add", body: { ...body, verifix_code: rowForm.cell.verifix_code } }
                : { action: "edit", row: rowForm.row, body },
              { onSuccess: () => setRowForm(null) },
            );
          }}
        />
      )}

      {/* Save preview */}
      {savePreview && (
        <SavePreviewModal
          preview={savePreview}
          t={t}
          tl={tl}
          busy={saveMut.isPending}
          onClose={() => setSavePreview(null)}
          onConfirm={() => saveMut.mutate()}
        />
      )}
    </div>
  );
}

// ── modals ────────────────────────────────────────────────────────────────────

function RowFormModal({ form, t, busy, onClose, onSubmit }) {
  const r = form.row || {};
  const [v, setV] = useState({
    worker_name: r.worker_name || "",
    job_title: r.job_title || "",
    schedule: r.schedule || "",
    clock_in_out: r.clock_in_out || "",
    hours_worked: r.hours_worked ?? "",
  });
  const set = (k) => (e) => setV((p) => ({ ...p, [k]: e.target.value }));

  const inputCls = "w-full rounded-lg px-3 py-2 text-sm outline-none";
  const inputStyle = { background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-1)" };
  const valid = v.worker_name.trim().length > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={form.mode === "add" ? t("attUp.addWorker") : t("attUp.editWorker")}
      subtitle={`${form.cell.verifix_code}`}
      icon={form.mode === "add"
        ? <UserPlus size={15} style={{ color: "var(--brand-text)" }} />
        : <Pencil size={15} style={{ color: "var(--brand-text)" }} />}
      maxWidth="max-w-md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t("attUp.cancel")}</Button>
          <Button
            loading={busy}
            disabled={!valid}
            onClick={() => onSubmit({
              ...v,
              hours_worked: v.hours_worked === "" ? null : Number(v.hours_worked),
            })}
          >
            {t("attUp.saveRow")}
          </Button>
        </>
      }
    >
      <FormField label={t("attUp.colWorker")} required>
        <input className={inputCls} style={inputStyle} value={v.worker_name} onChange={set("worker_name")} />
      </FormField>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("attUp.colJob")}>
          <input className={inputCls} style={inputStyle} value={v.job_title} onChange={set("job_title")} />
        </FormField>
        <FormField label={t("attUp.colSchedule")}>
          <input className={inputCls} style={inputStyle} placeholder="08-00 до 17-00" value={v.schedule} onChange={set("schedule")} />
        </FormField>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label={t("attUp.colClock")}>
          <input className={inputCls} style={inputStyle} placeholder="07:55 - 17:02 (8.4)" value={v.clock_in_out} onChange={set("clock_in_out")} />
        </FormField>
        <FormField label={t("attUp.colHours")}>
          <input
            className={inputCls} style={inputStyle} type="number" step="0.01" min="0" max="24"
            value={v.hours_worked} onChange={set("hours_worked")}
          />
        </FormField>
      </div>
      <div className="text-[11px]" style={{ color: "var(--text-4)" }}>{t("attUp.rowFormHint")}</div>
    </Modal>
  );
}

function SavePreviewModal({ preview, t, tl, busy, onClose, onConfirm }) {
  const nothing = preview.supervisors.length === 0;
  return (
    <Modal
      open
      onClose={onClose}
      title={t("attUp.saveTitle")}
      subtitle={preview.date}
      icon={<Save size={15} style={{ color: "var(--brand-text)" }} />}
      maxWidth="max-w-lg"
      dismissable={!busy}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>{t("attUp.cancel")}</Button>
          <Button onClick={onConfirm} loading={busy} disabled={nothing}>{t("attUp.saveConfirm")}</Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-2">
        <Stat label={t("attUp.saveSupervisors")} value={preview.supervisors.length} />
        <Stat label={t("attUp.saveRows")} value={preview.rows_to_write} />
        <Stat
          label={t("attUp.saveReplaces")}
          value={preview.rows_to_replace}
          tone={preview.rows_to_replace ? "#eab308" : undefined}
        />
      </div>

      <div className="text-[11px]" style={{ color: "var(--text-3)" }}>{t("attUp.saveMsg")}</div>

      <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="max-h-56 overflow-y-auto">
          {preview.supervisors.map((s) => (
            <div
              key={s.manager_id}
              className="flex items-center gap-2 px-3 py-2 text-xs"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <Users size={12} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
              <span className="truncate flex-1" style={{ color: "var(--text-1)" }}>{tl(s.manager_name)}</span>
              {s.rows_existing > 0 && <Chip tone="warn">{t("attUp.replaces").replace("{n}", s.rows_existing)}</Chip>}
              <span className="tabular-nums font-semibold flex-shrink-0" style={{ color: "var(--text-2)" }}>
                +{s.rows_to_write}
              </span>
            </div>
          ))}
          {nothing && (
            <div className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-4)" }}>
              {t("attUp.saveNothing")}
            </div>
          )}
        </div>
      </div>

      {preview.skipped.length > 0 && (
        <div
          className="rounded-lg px-3 py-2.5"
          style={{ background: "color-mix(in srgb, #eab308 12%, transparent)", border: "1px solid color-mix(in srgb, #eab308 35%, transparent)" }}
        >
          <div className="flex items-center gap-1.5 text-[11px] font-semibold" style={{ color: "#eab308" }}>
            <Lock size={12} /> {t("attUp.saveSkippedTitle")}
          </div>
          <div className="text-[11px] mt-1" style={{ color: "var(--text-3)" }}>{t("attUp.saveSkippedMsg")}</div>
          <div className="text-[11px] mt-1.5" style={{ color: "var(--text-2)" }}>
            {preview.skipped.map((s) => tl(s.manager_name)).join(", ")}
          </div>
        </div>
      )}

      {(preview.unassigned_cells.length > 0 || preview.excluded_cells.length > 0) && (
        <div className="text-[11px] space-y-1" style={{ color: "var(--text-4)" }}>
          {preview.unassigned_cells.length > 0 && (
            <div>{t("attUp.saveUnassigned").replace("{n}", preview.unassigned_cells.length)}: {preview.unassigned_cells.join(", ")}</div>
          )}
          {preview.excluded_cells.length > 0 && (
            <div>{t("attUp.saveExcluded").replace("{n}", preview.excluded_cells.length)}: {preview.excluded_cells.join(", ")}</div>
          )}
        </div>
      )}

      <div className="flex items-start gap-2 text-[11px]" style={{ color: "var(--text-3)" }}>
        <Plus size={12} className="flex-shrink-0 mt-0.5" style={{ color: "var(--brand-text)" }} />
        <span>{t("attUp.saveNotifyNote")}</span>
      </div>
    </Modal>
  );
}
