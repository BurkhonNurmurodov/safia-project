import { useMemo, useState } from "react";
import TableCard, { Th } from "../ui/DataTable";
import Pagination from "../ui/Pagination";
import { SkeletonBlock } from "../ui/Skeleton";
import { useLang } from "../../context/LangContext";
import { usePersistentState } from "../../hooks/usePersistentState";

/* THE list of the «Verifix (test)» section: the house TableCard with sortable
 * headers, a pager under it, skeleton rows while loading and one plain row
 * when nothing matches. The page filters; this sorts and pages.
 *
 *   columns – [{ key, label, render(row), sort(row) → value | undefined,
 *               align, cls, hint }] — a column without `sort` is not sortable.
 *   rowKey  – row → stable key
 *   onRowClick – the whole row opens the record (Enter does too).
 */

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

function compare(a, b) {
  const an = a == null || a === "";
  const bn = b == null || b === "";
  if (an || bn) return an && bn ? 0 : an ? 1 : -1;      // blanks sink, either way
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? -1 : 1;
  return collator.compare(String(a), String(b));
}

export default function VfxTable({
  rows, columns, rowKey, title, icon, right, toolbar, onRowClick, loading = false,
  empty, defaultSort = null, sortStoreKey, pageSize = 50, maxHeight = "70vh", footer,
}) {
  const { t } = useLang();
  const persisted = usePersistentState(sortStoreKey || "vfx_tbl_sort_unused", defaultSort);
  const local = useState(defaultSort);
  const [sort, setSort] = sortStoreKey ? persisted : local;
  // A page number belongs to the rows and the sort it was picked under: a new
  // filter or sort starts again at page 1 without an effect resetting it.
  const [pg, setPg] = useState({ rows: null, sort: null, n: 1 });
  const page = pg.rows === rows && pg.sort === sort ? pg.n : 1;
  const setPage = (n) => setPg({ rows, sort, n });

  const col = columns.find((c) => c.key === sort?.key && c.sort);
  const sorted = useMemo(() => {
    const list = rows || [];
    if (!col) return list;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      const va = col.sort(a);
      const vb = col.sort(b);
      const blankA = va == null || va === "";
      const blankB = vb == null || vb === "";
      if (blankA || blankB) return compare(va, vb);
      return compare(va, vb) * dir;
    });
  }, [rows, col, sort?.dir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const shown = sorted.slice((Math.min(page, pageCount) - 1) * pageSize, Math.min(page, pageCount) * pageSize);

  const onSort = (k) => setSort((s) => (s?.key === k
    ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" }
    : { key: k, dir: columns.find((c) => c.key === k)?.firstDir || "asc" }));

  return (
    <div>
      <TableCard icon={icon} title={title} right={right} toolbar={toolbar} maxHeight={maxHeight} footer={footer}>
        <thead>
          <tr>
            {columns.map((c) => (
              <Th key={c.key} label={c.label} k={c.sort ? c.key : undefined} sort={sort}
                onSort={c.sort ? onSort : undefined} align={c.align} hint={c.hint} cls={c.thCls || ""} />
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: 8 }).map((_, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className="px-3 py-2.5"><SkeletonBlock className="h-3.5 w-full max-w-[160px]" /></td>
                ))}
              </tr>
            ))
          ) : shown.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-10 text-center text-xs" style={{ color: "var(--text-3)" }}>
                {empty || t("vfx.noMatch")}
              </td>
            </tr>
          ) : (
            shown.map((r) => (
              <tr key={rowKey(r)}
                onClick={onRowClick ? () => onRowClick(r) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === "Enter") onRowClick(r); } : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={onRowClick ? "cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--brand)]" : ""}>
                {columns.map((c) => (
                  <td key={c.key}
                    className={`px-3 py-2 align-middle ${c.align === "right" ? "text-right tabular-nums" : c.align === "center" ? "text-center" : ""} ${c.cls || ""}`}>
                    {c.render(r)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </TableCard>
      {!loading && (
        <Pagination page={Math.min(page, pageCount)} pageCount={pageCount} total={sorted.length}
          pageSize={pageSize} onPage={setPage} />
      )}
    </div>
  );
}
