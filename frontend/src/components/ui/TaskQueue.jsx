/**
 * Task-queue controls — the status pill and the two-step priority editor.
 *
 * Shared by BOTH tiers of the task board on /tasks (brigadir → lider and
 * smena menejeri → brigadir). They are one interaction asked one tier apart —
 * the same traffic-light pill, the same "pick a position, then say how the rest
 * of the queue reacts" flow — so they live here rather than being copied. Two
 * copies of a two-step editor drift into two different ways to reorder a queue,
 * and the queue engine behind them (services/task_board.py) is deliberately one.
 *
 * These are presentational only: they take a value, whether they are `editable`,
 * and a callback. Neither knows WHO may press it — that is decided server-side
 * and arrives per ROW, because the brigadir board mixes rows the viewer governs
 * with rows they may only read.
 */
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, ChevronDown, Check, ArrowLeft } from "lucide-react";

export const STATUSES = ["todo", "doing", "done"];

// Status pills share the app-wide traffic-light convention (Concerns/Kaizen):
// todo grey (no process yet) · doing yellow · done green; red is reserved for
// overdue, which lives on the due-date cell and in the charts.
export const STATUS_COLOR = { todo: "#94a3b8", doing: "#eab308", done: "#22c55e" };

// Chart accents for the same vocabulary, plus the two facts a status pill does
// not carry: brand gold for "open" (an accent, never a status — see CLAUDE.md)
// and traffic-light red for overdue, which is a fact about the due DATE.
export const CHART_BRAND = "#C8973F";
export const CHART_TODO = STATUS_COLOR.todo;
export const CHART_OVERDUE = "#ef4444";

// Priority chips mirror the old Google-Sheet urgency chips: 1 red, 2 orange,
// 3 amber, everything further back a neutral grey.
export const priorityColor = (p) =>
  p === 1 ? "#ef4444" : p === 2 ? "#f97316" : p === 3 ? "#eab308" : "#94a3b8";

export const dropCard = {
  background: "var(--bg-card)",
  border: "1px solid var(--border-md)",
  borderRadius: 10,
  boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
  padding: 4,
};

// Shared portal-dropdown positioning (mirrors the Concerns StatusSelect): the
// menu is portaled to the body so a table's overflow can never clip it.
export function useDropdown(minHeight = 150) {
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

// Inline, editable status pill (portal dropdown ⇒ never clipped by the table).
export function StatusSelect({ status, statusLabel, saving, editable, onChange }) {
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
        className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap"
        style={{ background: `${color}24`, color, cursor: editable && !saving ? "pointer" : "default" }}
      >
        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color }} />
        {statusLabel(status)}
        {saving
          ? <Loader2 size={12} className="animate-spin" />
          : editable && <ChevronDown size={12} style={{ opacity: 0.7 }} />}
      </button>
      {dropdown}
    </>
  );
}

// Two-step priority editor: pick the new position, then choose how the rest of
// the queue reacts — swap the two positions, or shift everything in between.
export function PrioritySelect({ priority, count, saving, editable, onApply, t }) {
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

export function ActionBtn({ icon: Icon, label, color, onClick }) {
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
