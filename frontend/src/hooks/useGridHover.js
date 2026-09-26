import { useCallback, useRef } from "react";

// The row + column hover highlight of the big grids (HeatmapChart,
// ComparisonTable), done in the DOM instead of in React state. Held in state,
// every cell the pointer crossed re-rendered the WHOLE grid — twice, once on
// leave and once on enter — which is what froze /zagruzka for a moment on
// every mouse move.
//
// A cell that TRIGGERS the highlight carries `data-gt` and its coordinates,
// `data-gr` (row) and/or `data-gc` (column). Every element carrying the same
// `data-gr` / `data-gc` — the other cells, a date header, a row's name — gets
// `data-hl`, and the trigger itself `data-hot` when it has both. What each
// mark looks like is index.css's business («Grid hover»), which also switches
// it all off while the container carries `data-sel` (a row/column selection).
// React never owns these attributes, so a re-render cannot fight them.
//
// Spread the returned handlers onto the grid's container.
export default function useGridHover() {
  const marked = useRef([]);
  const at = useRef(null);

  const onMouseLeave = useCallback(() => {
    for (const el of marked.current) {
      el.removeAttribute("data-hl");
      el.removeAttribute("data-hot");
    }
    marked.current = [];
    at.current = null;
  }, []);

  const onMouseOver = useCallback((e) => {
    const root = e.currentTarget;
    const cell = e.target.closest?.("[data-gt]");
    if (!cell || !root.contains(cell)) {
      if (at.current !== null) onMouseLeave();
      return;
    }
    const r = cell.getAttribute("data-gr");
    const c = cell.getAttribute("data-gc");
    const key = `${r}|${c}`;
    if (key === at.current) return;
    onMouseLeave();
    at.current = key;
    const els = [];
    if (r !== null) els.push(...root.querySelectorAll(`[data-gr="${r}"]`));
    if (c !== null) els.push(...root.querySelectorAll(`[data-gc="${c}"]`));
    for (const el of els) el.setAttribute("data-hl", "");
    if (r !== null && c !== null) {
      cell.setAttribute("data-hot", "");
      els.push(cell);
    }
    marked.current = els;
  }, [onMouseLeave]);

  return { onMouseOver, onMouseLeave };
}
