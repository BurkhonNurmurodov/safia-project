// SortableList — THE drag-to-reorder list of rows (2026-11-12, first for the
// «Navbat» dialog on «Zagruzka fayli»). The same handle and live re-sort as the
// `ColumnsPicker` panel: pointer-based (mouse AND touch, unlike HTML5 dnd), the
// grip captures the pointer, rows re-sort against row midpoints while it moves
// and the new order is committed on release. Near the top or bottom edge of its
// scroll container the list scrolls itself, so a long list inside a `Modal`
// body can be dragged end to end. On the keyboard the grip is a button:
// ↑ / ↓ move the row by one.
//
//   items    — [{ key, render: (index) => node }] in the current order
//   onChange — (keys) => void, the new order, fired once per drop / key press
//   label    — (key) => string, the grip's aria-label («Move: …»)
import { useRef, useState } from "react";
import { GripVertical } from "lucide-react";

const scrollParent = (el) => {
  for (let n = el?.parentElement; n; n = n.parentElement) {
    const o = getComputedStyle(n).overflowY;
    if ((o === "auto" || o === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
};

export default function SortableList({ items, onChange, label }) {
  const [dragOrder, setDragOrder] = useState(null);
  const [dragKey, setDragKey] = useState(null);
  const rowRefs = useRef({});
  const listRef = useRef(null);
  const byKey = Object.fromEntries(items.map((it) => [it.key, it]));
  const keys = (dragOrder ?? items.map((it) => it.key)).filter((k) => byKey[k]);

  const onDragStart = (e, key) => {
    e.preventDefault();
    const start = items.map((it) => it.key);
    const sc = scrollParent(listRef.current);
    setDragKey(key);
    setDragOrder(start);
    let current = start;
    const onMove = (ev) => {
      const y = ev.clientY;
      if (sc) {
        const r = sc.getBoundingClientRect();
        if (y < r.top + 48) sc.scrollTop -= 14;
        else if (y > r.bottom - 48) sc.scrollTop += 14;
      }
      const others = current.filter((k) => k !== key);
      let idx = others.length;
      for (let i = 0; i < others.length; i++) {
        const el = rowRefs.current[others[i]];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (y < r.top + r.height / 2) { idx = i; break; }
      }
      const next = [...others.slice(0, idx), key, ...others.slice(idx)];
      if (next.join("\u0001") !== current.join("\u0001")) {
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
      if (current.join("\u0001") !== start.join("\u0001")) onChange(current);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  const step = (key, d) => {
    const cur = items.map((it) => it.key);
    const i = cur.indexOf(key), j = i + d;
    if (i < 0 || j < 0 || j >= cur.length) return;
    const next = [...cur];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
    requestAnimationFrame(() => rowRefs.current[key]?.querySelector("button")?.focus());
  };

  return (
    <div ref={listRef} className="flex flex-col gap-1">
      {keys.map((k, i) => (
        <div key={k} ref={(el) => { rowRefs.current[k] = el; }}
          className="flex items-center gap-2 px-2 min-h-[40px] rounded-lg select-none"
          style={{
            background: dragKey === k ? "var(--bg-card)" : "var(--bg-inner)",
            border: "1px solid var(--border)",
            opacity: dragKey === k ? 0.8 : 1,
            boxShadow: dragKey === k ? "0 4px 14px rgba(0,0,0,0.25)" : undefined,
          }}>
          <button type="button"
            aria-label={label ? label(k) : undefined}
            onPointerDown={(e) => onDragStart(e, k)}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp") { e.preventDefault(); step(k, -1); }
              else if (e.key === "ArrowDown") { e.preventDefault(); step(k, 1); }
            }}
            className="flex-shrink-0 w-8 h-8 -ml-1 flex items-center justify-center rounded-md cursor-grab active:cursor-grabbing outline-none focus-visible:ring-1"
            style={{ color: "var(--text-3)", touchAction: "none" }}>
            <GripVertical size={16} />
          </button>
          <div className="flex-1 min-w-0">{byKey[k].render(i)}</div>
        </div>
      ))}
    </div>
  );
}
