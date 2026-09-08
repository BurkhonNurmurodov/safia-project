/**
 * Task-board row controls — the status pill and the urgency flame.
 *
 * Shared by BOTH tiers of the task board on /tasks (brigadir → lider and
 * smena menejeri → brigadir). They are one interaction asked one tier apart, so
 * they live here rather than being copied — the rule behind them
 * (services/task_board.py) is deliberately one too.
 *
 * THE FLAME replaced a two-step queue editor on 2026-09-08 (the operator's
 * directive): pick a position 1..N, then say whether the rest of the queue
 * swaps or shifts. It asked the reader to rank their fourteenth task against
 * their fifteenth, which nobody was doing, and it could not be pressed at all
 * on a queue of one. A task is urgent or it is not.
 *
 * These are presentational only: they take a value, whether they are `editable`,
 * and a callback. Neither knows WHO may press it — that is decided server-side
 * and arrives per ROW, because the brigadir board mixes rows the viewer governs
 * with rows they may only read.
 */
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Loader2, ChevronDown, Check, Flame } from "lucide-react";

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

// The flame. Orange, not red: red is the traffic light's "overdue", a fact
// about the DUE DATE, and a row can easily be one without being the other.
export const URGENT_COLOR = "#f97316";

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

// The flame: one tap, one fact. Non-urgent renders as a ghost outline while the
// viewer may press it and as a plain dash while they may not — an inert control
// that looks pressable is how a reader learns the board ignores them.
export function UrgentToggle({ urgent, saving, editable, onToggle, t }) {
  if (!editable && !urgent) return <span style={{ color: "var(--text-4)" }}>—</span>;

  const on = !!urgent;
  const label = t(on ? "tasks.urgentOn" : "tasks.urgentOff");
  return (
    <button
      type="button"
      title={editable ? t("tasks.urgentToggle") : label}
      aria-label={label}
      aria-pressed={on}
      disabled={!editable || saving}
      onClick={() => editable && !saving && onToggle(!on)}
      className="inline-flex items-center justify-center rounded-full transition-opacity"
      style={{
        width: 28,
        height: 28,
        background: on ? `${URGENT_COLOR}24` : "transparent",
        border: `1px solid ${on ? `${URGENT_COLOR}59` : "var(--border-md)"}`,
        color: on ? URGENT_COLOR : "var(--text-4)",
        cursor: editable && !saving ? "pointer" : "default",
        opacity: saving ? 0.6 : 1,
      }}
    >
      {saving
        ? <Loader2 size={13} className="animate-spin" />
        : <Flame size={14} fill={on ? URGENT_COLOR : "none"} strokeWidth={on ? 2 : 1.75} />}
    </button>
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
