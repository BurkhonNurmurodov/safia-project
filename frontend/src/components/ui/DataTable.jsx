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

// Uppercase card/section header — icon + title (optional lowercase subtitle
// under it) on the left, free slot on the right.
export function SectionHead({ icon: Icon, title, subtitle, right }) {
  return (
    <div className="flex items-center justify-between gap-2 px-4 py-2.5 flex-wrap" style={{ borderBottom: "1px solid var(--border)" }}>
      <div className="flex items-center gap-2 min-w-0">
        {Icon && <Icon size={14} className="flex-shrink-0" style={{ color: "var(--brand-text)" }} />}
        <div className="min-w-0">
          <div className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{title}</div>
          {subtitle && <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>{subtitle}</div>}
        </div>
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
export function Th({ label, icon: Icon, k, sort, onSort, align = "left", hint, cls = "", filter }) {
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
        {/* Optional per-column filter funnel (Google-Sheets style). Its own click
            must not fall through to the header's sort toggle. */}
        {filter && (
          <span className="inline-flex" onClick={(e) => e.stopPropagation()}>{filter}</span>
        )}
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
 *   fixed     – table-layout:fixed so column widths come from the header
 *               (set each column's width via its Th `cls`, e.g. "w-[20%]"),
 *               NOT row content — keeps columns from re-sizing when rows are
 *               filtered/sorted. Give overflow-prone cells wrap/truncate.
 *   hover     – row hover highlight (default true)
 *   mobile    – optional stacked-card list for phones: when given, the table
 *               renders from `sm:` up only and this node takes its place
 *               below `sm:` (same scroll cap)
 *   mobileCards – render the `mobile` node OUTSIDE the card as a stack of
 *               standalone cards (each child styles itself as a card); the
 *               card keeps only the header/toolbar on phones and the stack
 *               scrolls with the page instead of an inner scroll cap
 *   children  – <thead> + <tbody>
 */
export default function TableCard({
  icon,
  title,
  subtitle,
  right,
  toolbar,
  maxHeight = "70vh",
  wrap = false,
  hover = true,
  mobile,
  mobileCards = false,
  className = "",
  children,
}) {
  const detached = mobile != null && mobileCards;
  const card = (
    <div className={`rounded-2xl overflow-hidden ${detached ? "" : className}`} style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {title != null && <SectionHead icon={icon} title={title} subtitle={subtitle} right={right} />}
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          {toolbar}
        </div>
      )}
      <div className={`overflow-auto${mobile != null ? " hidden sm:block" : ""}`} style={{ maxHeight }}>
        <table
          className={`w-full text-xs ${wrap ? "" : "whitespace-nowrap"} [&_th:not(:last-child)]:border-r [&_td:not(:last-child)]:border-r [&_th]:border-[var(--border)] [&_td]:border-[var(--border)] [&_tbody_tr]:border-t [&_tbody_tr]:border-[var(--border)] ${hover ? "[&_tbody_tr:hover]:bg-[var(--bg-inner)]" : ""}`}
          style={{ color: "var(--text-1)" }}
        >
          {children}
        </table>
      </div>
      {mobile != null && !mobileCards && (
        <div className="sm:hidden overflow-y-auto" style={{ maxHeight }}>
          {mobile}
        </div>
      )}
    </div>
  );
  if (!detached) return card;
  return (
    <div className={className}>
      {card}
      <div className="sm:hidden mt-3 space-y-3">{mobile}</div>
    </div>
  );
}
