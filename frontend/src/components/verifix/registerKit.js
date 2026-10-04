import { createElement as h } from "react";
import { localISO } from "../ui/DateRangePicker";
import { OptsFilter, PickFilter } from "../ui/ColumnFilter";
import { SkeletonBlock } from "../ui/Skeleton";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useVfx, dmy, hm, shiftISO } from "./vfx";

/* Phase 2 of «Verifix (test)» — the hooks, formatters and filter builders
 * the nine register pages share. The components they share live in
 * `registers.jsx` (a file exporting components only keeps fast refresh), which
 * is why the few elements here are built with createElement, not JSX.
 * Backend: services/verifix_registers.py. */

/** A register read. A big Verifix list is read in the BACKGROUND on the
 * server: an answer may carry `loading: true` with the pages that have
 * arrived, and this asks again every 2.5 s until the list is whole. */
export function useRegister(key, path, params) {
  return useVfx(key, path, params, {
    refetchInterval: (query) => (query.state.data?.loading ? 2500 : false),
  });
}

/** A period kept per page: [from, to, setFrom, setTo]. `back`/`fwd` days
 * around today are the first visit's window. */
export function useRange(store, back, fwd = 0) {
  const base = localISO(new Date());
  const [from, setFrom] = usePersistentState(`${store}_from`, shiftISO(base, -back));
  const [to, setTo] = usePersistentState(`${store}_to`, shiftISO(base, fwd));
  return [from, to, setFrom, setTo];
}

// ── formatting ────────────────────────────────────────────────────────────────

/** «01.03.2025», «01.03.2025 09:00–13:00» or «01.03.2025 – 31.03.2025». */
export function span(b, e) {
  if (!b) return "—";
  const tb = b.length > 10;
  const te = !!e && e.length > 10;
  const one = (x, timed) => (timed ? `${dmy(x)} ${hm(x)}` : dmy(x));
  if (!e || e === b) return one(b, tb);
  if (b.slice(0, 10) === e.slice(0, 10)) return tb ? `${dmy(b)} ${hm(b)}–${hm(e)}` : dmy(b);
  return `${one(b, tb)} – ${one(e, te)}`;
}

export const when = (iso) => (iso ? (iso.length > 10 ? `${dmy(iso)} ${hm(iso)}` : dmy(iso)) : "—");

export const minutesHM = (m) => (m == null ? "—" : `${Math.floor(m / 60)}:${String(Math.round(m % 60)).padStart(2, "0")}`);

export const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

/** «Mart 2025» — the month a document is FOR, from its first day. */
export const monthLabel = (t, iso) => (iso ? `${t(`cal.m${Number(iso.slice(5, 7)) - 1}`)} ${iso.slice(0, 4)}` : "—");

export const dash = h("span", { style: { color: "var(--text-4)" } }, "—");

export const sk = h(SkeletonBlock, { className: "h-7 w-16 mt-1" });

// ── filters ───────────────────────────────────────────────────────────────────

export function facet(rows, keyOf, nameOf = (v) => v) {
  const counts = new Map();
  for (const r of rows) {
    const k = keyOf(r);
    if (k) counts.set(k, (counts.get(k) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([value, n]) => ({ value, n, name: nameOf(value) }));
}

export function optsSection({ key, icon, label, opts, sel, setSel, t, group }) {
  const byVal = new Map(opts.map((o) => [o.value, o]));
  return {
    key, icon, label, group, active: sel.length > 0,
    display: sel.length === 1 ? (byVal.get(sel[0])?.name || sel[0]) : `${sel.length} ${t("filter.selected2")}`,
    onClear: () => setSel([]),
    render: () => h(OptsFilter, {
      searchable: opts.length > 8, opts: opts.map((o) => o.value), sel, onChange: setSel,
      labelOf: (v) => byVal.get(v)?.name || v,
      render: (v) => h("span", { className: "inline-flex items-center gap-1.5 min-w-0" },
        h("span", { className: "truncate" }, byVal.get(v)?.name || v),
        h("span", { className: "tabular-nums flex-shrink-0", style: { color: "var(--text-4)" } }, byVal.get(v)?.n ?? 0)),
    }),
  };
}

/** One-of-many filter whose «all» value is `def`. `opts` = [[value, label]]. */
export function pickSection({ key, icon, label, value, set, opts, group, def = "all" }) {
  const byVal = new Map(opts);
  return {
    key, icon, label, group, active: value !== def,
    display: byVal.get(value) || value,
    onClear: () => set(def),
    render: ({ close }) => h(PickFilter, {
      close, value, onChange: set, opts: opts.map(([v, l]) => ({ value: v, label: l })),
    }),
  };
}

export { C_OK, C_WARN, C_BAD, C_NONE } from "./vfx";
