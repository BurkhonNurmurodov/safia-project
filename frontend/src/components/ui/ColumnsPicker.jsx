// Column visibility & order picker — THE template for showing/hiding table
// columns. 38px square trigger (toolbar baseline) + a portaled panel listing
// every column IN TABLE ORDER: hidden ones stay in place (dimmed, eye-off)
// instead of moving to a bottom group, so toggling never loses a column's
// slot. Hide all / Show all links, and drag-to-reorder that only arms via the
// explicit reorder button.
//
// Controlled component:
//   columns  — [{ key, label, locked }] full catalog (locked = never hideable)
//   order    — [key, …] full column order (shown AND hidden)
//   hidden   — [key, …] currently hidden
//   onChange — ({ order, hidden }) fired on every commit (toggle / drag drop)
import { useMemo, useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Columns3, Eye, EyeOff, GripVertical, Lock } from "lucide-react";
import { useLang } from "../../context/LangContext";

const PANEL_WIDTH = 272;

function Row({ col, isHidden, reorderMode, dragging, onToggle, onDragStart, rowRef }) {
  return (
    <div
      ref={rowRef}
      className="flex items-center gap-2 px-2 py-1.5 rounded-lg select-none"
      style={{
        background: dragging ? "var(--bg-inner)" : "transparent",
        opacity: dragging ? 0.75 : 1,
      }}
    >
      {reorderMode && (
        <span
          onPointerDown={(e) => onDragStart(e, col.key)}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing"
          style={{ color: "var(--text-4)", touchAction: "none" }}
        >
          <GripVertical size={14} />
        </span>
      )}
      <span
        className="flex-1 text-[13px] truncate"
        style={{ color: isHidden ? "var(--text-4)" : "var(--text-2)" }}
      >
        {col.label}
      </span>
      {col.locked ? (
        <span className="flex-shrink-0 p-1" style={{ color: "var(--text-4)" }}>
          <Lock size={13} />
        </span>
      ) : (
        <button
          onClick={() => onToggle(col.key)}
          className="flex-shrink-0 p-1 rounded transition-colors"
          style={{ color: isHidden ? "var(--text-4)" : "var(--text-3)" }}
        >
          {isHidden ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
      )}
    </div>
  );
}

export default function ColumnsPicker({ columns, order, hidden, onChange, className = "" }) {
  const { t } = useLang();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  // Live order while a drag is in flight (null = no drag).
  const [dragOrder, setDragOrder] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const ref = useRef(null);     // trigger wrapper
  const popRef = useRef(null);  // portaled panel
  const rowRefs = useRef({});   // row key → element (drag hit-testing)

  const byKey = useMemo(() => Object.fromEntries(columns.map((c) => [c.key, c])), [columns]);
  const hiddenSet = useMemo(() => new Set(hidden), [hidden]);
  const listKeys = (dragOrder ?? order).filter((k) => byKey[k]);
  const nHidden = hidden.filter((k) => byKey[k]).length;
  const anyHideable = listKeys.some((k) => !byKey[k].locked && !hiddenSet.has(k));

  // Close on click outside the trigger or the portaled panel.
  useEffect(() => {
    if (!open) return;
    function onOutside(e) {
      if (ref.current && ref.current.contains(e.target)) return;
      if (popRef.current && popRef.current.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, [open]);

  // Portal + fixed positioning: table cards are overflow-hidden, a plain
  // absolute dropdown would get clipped (same trick as FilterPanel).
  useEffect(() => {
    if (!open) { setPos(null); return; }
    function update() {
      if (!ref.current) return;
      const rect = ref.current.getBoundingClientRect();
      const left = Math.max(8, Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 8));
      setPos({ top: rect.bottom + 6, left });
    }
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  useEffect(() => { if (!open) setReorderMode(false); }, [open]);

  const toggle = (key) => {
    const col = byKey[key];
    if (!col || col.locked) return;
    const next = hiddenSet.has(key) ? hidden.filter((k) => k !== key) : [...hidden, key];
    onChange({ order, hidden: next });
  };
  const hideAll = () =>
    onChange({ order, hidden: order.filter((k) => byKey[k] && !byKey[k].locked) });
  const showAll = () => onChange({ order, hidden: [] });

  // Pointer-based drag (works for mouse AND touch, unlike HTML5 dnd): the
  // handle captures the pointer, rows re-sort live against row midpoints,
  // pointerup commits the new order. Hidden rows drag too — they keep a
  // real slot, so their position matters when re-shown.
  const onDragStart = (e, key) => {
    e.preventDefault();
    const start = listKeys;
    setDragKey(key);
    setDragOrder(start);
    let current = start;

    const onMove = (ev) => {
      const y = ev.clientY;
      const others = current.filter((k) => k !== key);
      let idx = others.length;
      for (let i = 0; i < others.length; i++) {
        const el = rowRefs.current[others[i]];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) { idx = i; break; }
      }
      const next = [...others.slice(0, idx), key, ...others.slice(idx)];
      if (next.join() !== current.join()) {
        current = next;
        setDragOrder(next);
      }
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      setDragKey(null);
      setDragOrder(null);
      if (current.join() !== start.join()) onChange({ order: current, hidden });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  return (
    <div ref={ref} className={`relative flex-shrink-0 ${className}`}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={t("cols.title")}
        className="relative flex items-center justify-center rounded-xl transition-colors"
        style={{
          width: 38, height: 38,
          background: "var(--bg-card)",
          border: `1px solid ${open || nHidden > 0 ? "var(--brand)" : "var(--border-md)"}`,
          color: nHidden > 0 ? "var(--brand-text)" : "var(--text-3)",
        }}
      >
        <Columns3 size={15} />
        {nHidden > 0 && (
          <span
            className="absolute -top-1.5 -right-1.5 min-w-[16px] h-4 px-1 rounded-full text-[10px] font-semibold flex items-center justify-center"
            style={{ background: "var(--brand)", color: "#fff" }}
          >
            {nHidden}
          </span>
        )}
      </button>

      {open && pos && createPortal(
        <div
          ref={popRef}
          className="rounded-xl p-2"
          style={{
            position: "fixed", top: pos.top, left: pos.left, zIndex: 1000,
            width: PANEL_WIDTH,
            maxHeight: `calc(100vh - ${pos.top + 12}px)`, overflowY: "auto",
            background: "var(--bg-card)", border: "1px solid var(--border-md)",
            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
          }}
        >
          <div className="flex items-center justify-between px-2 pb-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-4)" }}>
              {t("cols.title")}
            </span>
            <button
              onClick={() => setReorderMode((m) => !m)}
              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium transition-colors"
              style={{
                background: reorderMode ? "var(--brand)" : "var(--bg-inner)",
                color: reorderMode ? "#fff" : "var(--text-3)",
                border: `1px solid ${reorderMode ? "var(--brand)" : "var(--border)"}`,
              }}
            >
              <GripVertical size={12} />
              {t("cols.reorder")}
            </button>
          </div>

          <div className="flex items-center justify-end gap-3 px-2 pb-1">
            {anyHideable && (
              <button
                onClick={hideAll}
                className="text-[11px] font-medium transition-colors"
                style={{ color: "var(--brand-text)" }}
              >
                {t("cols.hideAll")}
              </button>
            )}
            {nHidden > 0 && (
              <button
                onClick={showAll}
                className="text-[11px] font-medium transition-colors"
                style={{ color: "var(--brand-text)" }}
              >
                {t("cols.showAll")}
              </button>
            )}
          </div>

          {listKeys.map((k) => (
            <Row
              key={k}
              col={byKey[k]}
              isHidden={hiddenSet.has(k)}
              reorderMode={reorderMode}
              dragging={dragKey === k}
              onToggle={toggle}
              onDragStart={onDragStart}
              rowRef={(el) => { rowRefs.current[k] = el; }}
            />
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
