import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

/**
 * Canonical data-table kit — THE template for every generic data table,
 * styled after the Production «Позиции» table:
 *   rounded-2xl card · SectionHead (icon + uppercase title + right slot)
 *   · optional toolbar row · scrollable body (max-h 70vh) · sticky bg-inner
 *   header cells with sort chevrons · vertical column separators · bordered
 *   rows with bg-inner hover · px-3 py-2 cells · tabular-nums for numbers.
 *
 * Unique visualisation tables (fleet heatmap, comparison/difference tables,
 * stat matrices) keep their own layouts — this kit is for generic lists.
 *
 * Composition:
 *   <TableCard icon={Boxes} title={t("…")} right={<count/>} toolbar={<SearchInput/>}>
 *     <thead><tr><Th label=… k="col" sort={sort} onSort={onSort} /></tr></thead>
 *     <tbody>…rows with <td className="px-3 py-2 …">…</tbody>
 *   </TableCard>
 */

// Uppercase card/section header — icon + title on the left, free slot on the right.
export function SectionHead({ icon: Icon, title, right }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>
        {Icon && <Icon size={14} style={{ color: "var(--brand-text)" }} />}
        {title}
      </div>
      {right}
    </div>
  );
}

// Sort direction indicator for header cells.
export function SortIcon({ active, dir }) {
  if (!active) return <ChevronsUpDown size={12} style={{ opacity: 0.3 }} />;
  const Icon = dir === "asc" ? ChevronUp : ChevronDown;
  return <Icon size={12} style={{ color: "var(--brand-text)" }} />;
}

/**
 * Canonical header cell: sticky, bg-inner, sortable when `k` + `onSort` given.
 *   label / icon – header content
 *   k / sort / onSort – column key + {key, dir} state + toggle callback
 *   align  – "left" (default) | "center" | "right"
 *   hint   – tooltip text (title attribute)
 *   cls    – extra classes (e.g. responsive "hidden sm:table-cell")
 */
export function Th({ label, icon: Icon, k, sort, onSort, align = "left", hint, cls = "" }) {
  const sortable = !!(k && onSort);
  const active = sortable && sort?.key === k;
  const alignCls = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
  const justify = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "";
  return (
    <th
      title={hint}
      onClick={sortable ? () => onSort(k) : undefined}
      aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`sticky top-0 z-10 px-3 py-2.5 font-semibold select-none whitespace-nowrap transition-colors ${sortable ? "cursor-pointer hover:bg-[var(--bg-accent)]" : ""} ${alignCls} ${cls}`}
      style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}
    >
      <span className={`inline-flex items-center gap-1 ${justify}`}>
        {Icon && <Icon size={12} style={{ color: "var(--brand-text)" }} />}
        {label}
        {sortable && <SortIcon active={active} dir={sort.dir} />}
      </span>
    </th>
  );
}

/**
 * Card + header + toolbar + scrollable canonical table.
 *   icon / title / right – SectionHead (omitted when no title)
 *   toolbar   – row under the header (search + filters), px-4 py-3, bordered
 *   maxHeight – scroll container cap (default "70vh")
 *   wrap      – allow cell text to wrap (default false = whitespace-nowrap)
 *   hover     – row hover highlight (default true)
 *   children  – <thead> + <tbody>
 */
export default function TableCard({
  icon,
  title,
  right,
  toolbar,
  maxHeight = "70vh",
  wrap = false,
  hover = true,
  className = "",
  children,
}) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {title != null && <SectionHead icon={icon} title={title} right={right} />}
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          {toolbar}
        </div>
      )}
      <div className="overflow-auto" style={{ maxHeight }}>
        <table
          className={`w-full text-xs ${wrap ? "" : "whitespace-nowrap"} [&_th:not(:last-child)]:border-r [&_td:not(:last-child)]:border-r [&_th]:border-[var(--border)] [&_td]:border-[var(--border)] [&_tbody_tr]:border-t [&_tbody_tr]:border-[var(--border)] ${hover ? "[&_tbody_tr:hover]:bg-[var(--bg-inner)]" : ""}`}
          style={{ color: "var(--text-1)" }}
        >
          {children}
        </table>
      </div>
    </div>
  );
}
