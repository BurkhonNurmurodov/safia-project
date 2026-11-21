import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList } from "lucide-react";
import TableCard, { Th, EmptyRow } from "../ui/DataTable";
import Pagination from "../ui/Pagination";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import SearchInput from "../ui/SearchInput";
import api from "../../utils/api";
import { useTranslit } from "../../utils/transliterate";
import { fill } from "../../pages/auditsText";
import { bandColor, fmtDay, fmtPct, shopLabel } from "./auditUtil";

/**
 * «Ro'yxat» — the panel's minuses, one row per question that lost points,
 * newest first, 50 a page (the register rule). A filter, the period, the
 * search or the sort send it back to page 1; a row opens the record whole.
 */

const SIZE = 50;

export default function AuditsRegister({ period, f, q, setQ, T, onClearAll }) {
  const { tx, tl } = useTranslit();
  const [sort, setSort] = useState({ key: "day", dir: "desc" });
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(null);
  const [qDeb, setQDeb] = useState(q);

  useEffect(() => { const t = setTimeout(() => setQDeb(q), 300); return () => clearTimeout(t); }, [q]);
  const filterKey = JSON.stringify([period, f, qDeb, sort]);
  useEffect(() => { setPage(1); }, [filterKey]);

  const params = {
    ...period, workshop: f.workshop, inspector: f.inspector, task: f.task,
    question: f.question || undefined, top: f.top || undefined, q: qDeb || undefined,
    sort: sort.key, dir: sort.dir, page, size: SIZE,
  };
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["audits-rows", params],
    queryFn: () => api.get("/api/audits/rows", { params }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const onSort = (k) => setSort((s) => (s.key === k ? { key: k, dir: s.dir === "asc" ? "desc" : "asc" }
    : { key: k, dir: k === "day" || k === "top" ? "desc" : "asc" }));
  const rows = data?.rows || [];
  const filtered = f.workshop.length || f.inspector.length || f.task.length || f.question || f.top || qDeb;
  const COLS = 9;

  return (
    <>
      <TableCard icon={ClipboardList} title={T.list}
        right={<span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-3)" }}>
          {data ? fill(T.rowsN, { n: data.total.toLocaleString("ru-RU") }) : ""}</span>}
        toolbar={<SearchInput value={q} onChange={setQ} placeholder={T.search} clearLabel={T.clear}
          className="w-full sm:w-80" />}
        maxHeight="68vh">
        <thead>
          <tr>
            <Th label={T.col.day} k="day" sort={sort} onSort={onSort} />
            <Th label={T.col.workshop} k="workshop" sort={sort} onSort={onSort} />
            <Th label={T.col.inspector} k="inspector" sort={sort} onSort={onSort} />
            <Th label={T.col.total} k="total" sort={sort} onSort={onSort} align="right" />
            <Th label={T.col.rating} k="rating" sort={sort} onSort={onSort} align="right" />
            <Th label={T.col.task} k="task" sort={sort} onSort={onSort} />
            <Th label={T.col.question} k="question" sort={sort} onSort={onSort} />
            <Th label={T.col.comment} />
            <Th label={T.col.top} k="top" sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {isLoading && Array.from({ length: 8 }).map((_, i) => (
            <tr key={i}>{Array.from({ length: COLS }).map((__, j) => (
              <td key={j} className="px-3 py-2.5"><div className="h-3 rounded skeleton" style={{ background: "var(--bg-inner)" }} /></td>
            ))}</tr>
          ))}
          {isError && (
            <EmptyRow colSpan={COLS}>
              <span style={{ color: "var(--text-3)" }}>{T.loadFail}</span>{" "}
              <Button size="sm" variant="ghost" onClick={() => refetch()}>{T.retry}</Button>
            </EmptyRow>
          )}
          {!isLoading && !isError && rows.length === 0 && (
            <EmptyRow colSpan={COLS}>
              <span style={{ color: "var(--text-3)" }}>{filtered ? T.noMatch : T.noData}</span>{" "}
              {filtered && <Button size="sm" variant="ghost" onClick={onClearAll}>{T.clearAll}</Button>}
            </EmptyRow>
          )}
          {rows.map((r) => (
            <tr key={r.id} tabIndex={0} className="cursor-pointer" onClick={() => setOpen(r)}
              onKeyDown={(e) => { if (e.key === "Enter") setOpen(r); }}>
              <td className="px-3 py-2 tabular-nums whitespace-nowrap">{fmtDay(r.day)}</td>
              <td className="px-3 py-2 whitespace-nowrap max-w-[220px] truncate" title={tx(r.workshop || "")}>{shopLabel(tx(r.workshop || "—"))}</td>
              <td className="px-3 py-2 whitespace-nowrap max-w-[180px] truncate" title={tl(r.inspector || "")}>{tl(r.inspector || "—")}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full mr-1.5 align-middle" style={{ background: bandColor(r.total) }} />
                {fmtPct(r.total)}
              </td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{fmtPct(r.rating)}</td>
              <td className="px-3 py-2 whitespace-nowrap max-w-[200px] truncate" title={tx(r.task || "")}>{tx(r.task || "—")}</td>
              <td className="px-3 py-2 whitespace-nowrap max-w-[320px] truncate" title={tx(r.question || "")}>{tx(r.question || "—")}</td>
              <td className="px-3 py-2 whitespace-nowrap max-w-[240px] truncate" style={{ color: "var(--text-2)" }} title={tx(r.comment || "")}>{tx(r.comment || "")}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{r.top != null ? `TOP ${r.top}` : ""}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {data && (
        <Pagination page={page} pageCount={Math.ceil(data.total / SIZE)} total={data.total} pageSize={SIZE} onPage={setPage} />
      )}

      {open && (
        <Modal open onClose={() => setOpen(null)} title={tx(open.question || T.detailTitle)}
          subtitle={[fmtDay(open.day), shopLabel(tx(open.workshop || "")), tl(open.inspector || "")].filter(Boolean).join(" · ")}
          footer={<Button variant="secondary" onClick={() => setOpen(null)}>{T.close}</Button>}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            {[
              [T.col.total, <span key="t" className="tabular-nums"><span aria-hidden className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ background: bandColor(open.total) }} />{fmtPct(open.total)}</span>],
              [T.col.rating, <span key="r" className="tabular-nums">{fmtPct(open.rating)}</span>],
              [T.col.task, tx(open.task || "—")],
              [T.col.comment, tx(open.comment || "—")],
              open.top != null && [T.col.top, `TOP ${open.top}`],
            ].filter(Boolean).map(([k, v]) => (
              <div key={k} className="contents">
                <dt style={{ color: "var(--text-3)" }}>{k}</dt>
                <dd className="min-w-0 break-words" style={{ color: "var(--text-1)" }}>{v}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
    </>
  );
}
