// Sort state and ordering shared by the three /plan tables (Mahsulotlar ·
// Yacheykalar · Brigadirlar). Kept apart from planTable.jsx so that file
// exports components only (React Fast Refresh).
import { usePersistentState } from "../../hooks/usePersistentState";

// Columns whose natural first click is «largest first».
const DESC_FIRST = new Set(["short", "short_qty", "plan", "actual", "plan_qty", "actual_qty", "days", "nf", "delta"]);

export function usePlanSort(storageKey, initial) {
  const [sort, setSort] = usePersistentState(storageKey, initial);
  const onSort = (key) => setSort((s) => (s?.key === key
    ? { key, dir: s.dir === "asc" ? "desc" : "asc" }
    : { key, dir: DESC_FIRST.has(key) ? "desc" : "asc" }));
  return [sort?.key ? sort : initial, onSort];
}

// Sort rows by an accessor; a row with no value (null) always sinks, whichever
// way the column runs — a blank is not the smallest number.
export function sortRows(rows, sort, get) {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const va = get(a, sort.key), vb = get(b, sort.key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string") return dir * va.localeCompare(vb);
    return dir * (va - vb);
  });
}

// Right-aligned number cell text.
export const num = "px-3 py-2 text-right tabular-nums";
