import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./Button";
import { useLang } from "../../context/LangContext";

/**
 * THE pager for long data tables (the register-style tables that hold
 * thousands of rows and would otherwise dump everything into one DOM).
 *
 * Sits directly under a <TableCard>: range read-out on the left, page buttons
 * on the right, built from the Button template so heights match the rest of
 * the chrome. Renders nothing for a single page.
 *
 *   page      – current page, 1-based
 *   pageCount – total number of pages
 *   total     – row count across all pages (for the "x–y of N" read-out)
 *   pageSize  – rows per page
 *   onPage    – (nextPage) => void
 */
export default function Pagination({ page, pageCount, total, pageSize, onPage }) {
  const { t } = useLang();
  if (pageCount <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  // Windowed page numbers: always the first and last, plus the two neighbours
  // of the current page; the gaps collapse to an ellipsis.
  const nums = [];
  for (let i = 1; i <= pageCount; i++) {
    if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "…") nums.push("…");
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap px-1 pt-3">
      <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
        {from}–{to} {t("pager.of")} {total.toLocaleString("ru-RU")}
      </span>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}
          aria-label={t("pager.prev")}>
          <ChevronLeft size={14} />
        </Button>
        {nums.map((n, i) =>
          n === "…" ? (
            <span key={`gap-${i}`} className="px-1 text-[11px]" style={{ color: "var(--text-4)" }}>…</span>
          ) : (
            <Button key={n} size="sm" variant={n === page ? "primary" : "ghost"} onClick={() => onPage(n)}
              className="tabular-nums min-w-[30px] justify-center">
              {n}
            </Button>
          )
        )}
        <Button size="sm" variant="ghost" disabled={page >= pageCount} onClick={() => onPage(page + 1)}
          aria-label={t("pager.next")}>
          <ChevronRight size={14} />
        </Button>
      </div>
    </div>
  );
}
