import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, MessageSquareWarning } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import Pagination from "../ui/Pagination";
import { SkeletonBlock } from "../ui/Skeleton";
import { StChip } from "../kpi/ConcernsPieces";
import { useAuth } from "../../context/AuthContext";
import { usePageAccess } from "../../hooks/usePageAccess";
import { useCapabilities } from "../../hooks/useCapabilities";
import { canAccessPage } from "../../config/pages";
import { fill, fmtDate } from "./peopleUtil";

const PAGE_SIZE = 50;
const LEVEL_KEY = { "shift-manager": "shift_manager", "top-manager": "top_manager" };

/** «Havotirlar» — what THIS worker filed on /cell-concerns, in /leaders-kpi's
 *  status words and colours. */
export default function ConcernsTab({ data, P, ready }) {
  const nav = useNavigate();
  const { auth } = useAuth();
  const { access } = usePageAccess();
  const { capPages, deniedPages } = useCapabilities();
  const openable = canAccessPage(auth?.role, "concerns", access, capPages, deniedPages);
  const c = ready ? data.concerns : null;
  const [page, setPage] = useState(1);
  const rows = c?.rows || [];
  const pageRows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const open = (r) => { if (openable) nav(`/concerns?open=${r.id}`); };
  const level = (l) => P.level[LEVEL_KEY[l] || l] || l;

  return (
    <div className="space-y-3">
      <TableCard icon={MessageSquareWarning} title={P.concernsTitle}
        right={c ? <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
          {fill(P.concernsCounts, { f: c.filed, r: c.resolved, o: c.open })}</span> : null}
        footer={c?.withheld ? (
          <p className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--status-warn)" }}>
            <AlertTriangle size={12} className="flex-shrink-0 mt-[1px]" aria-hidden="true" />
            {fill(P.concernsWithheld, { n: c.withheld })}
          </p>
        ) : null}
        mobile={!c ? <div className="p-4"><SkeletonBlock className="h-20 w-full" /></div> : rows.length === 0 ? (
          <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--text-3)" }}>{P.concernsEmpty}</p>
        ) : (
          <ul>
            {pageRows.map((r) => (
              <li key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                <button type="button" onClick={() => open(r)} className="w-full text-left px-4 py-2.5 min-h-[56px]">
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>№{r.seq ?? r.id} · {fmtDate(r.date)}{r.code ? ` · ${r.code}` : ""}</span>
                    <StChip st={r.bucket} label={P.bucket[r.bucket] || r.bucket} />
                  </span>
                  <span className="block mt-1 text-sm truncate" style={{ color: "var(--text-1)" }}>{r.text}</span>
                </button>
              </li>
            ))}
          </ul>
        )}>
        <thead>
          <tr>
            <Th label={P.colNo} />
            <Th label={P.colDate} />
            <Th label={P.colCellShort} />
            <Th label={P.colText} />
            <Th label={P.colStatus} />
            <Th label={P.colLevel} />
            <Th label={P.colResolved} />
          </tr>
        </thead>
        <tbody>
          {!c ? (
            [...Array(4)].map((_, i) => <tr key={i}><td colSpan={7} className="px-3 py-2.5"><SkeletonBlock className="h-4 w-full" /></td></tr>)
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{P.concernsEmpty}</td></tr>
          ) : pageRows.map((r) => (
            <tr key={r.id} onClick={() => open(r)} className={openable ? "cursor-pointer" : ""}>
              <td className="px-3 py-2 tabular-nums">{r.seq ?? r.id}</td>
              <td className="px-3 py-2 tabular-nums">{fmtDate(r.date)}</td>
              <td className="px-3 py-2 tabular-nums">{r.code || "—"}</td>
              <td className="px-3 py-2 max-w-[380px] truncate" title={r.text}>{r.text}</td>
              <td className="px-3 py-2"><StChip st={r.bucket} label={P.bucket[r.bucket] || r.bucket} /></td>
              <td className="px-3 py-2">{level(r.level)}</td>
              <td className="px-3 py-2 tabular-nums">{r.resolved_on ? fmtDate(r.resolved_on) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {rows.length > PAGE_SIZE && (
        <Pagination page={page} pageCount={Math.ceil(rows.length / PAGE_SIZE)} total={rows.length}
          pageSize={PAGE_SIZE} onPage={setPage} />
      )}
    </div>
  );
}
