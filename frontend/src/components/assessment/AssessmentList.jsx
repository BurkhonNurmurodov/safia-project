import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Plus, ClipboardCheck, Check, ChevronRight } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import Button from "../ui/Button";
import SearchInput from "../ui/SearchInput";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import { SkeletonTable } from "../ui/Skeleton";
import { usePersistentState } from "../../hooks/usePersistentState";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import NewAssessmentModal from "./NewAssessmentModal";
import { useAT, fill, DEPT_ICON, pct0, fmtDate, VERDICT, workPlace } from "./assessmentUtil";

/** One seat of the panel as a small square: free (dashed), being graded
 *  (icon), submitted (green tint + check). The tooltip names who and how far. */
export function SeatDot({ seat, T, tl }) {
  const total = seat.total ?? 0;
  const Icon = DEPT_ICON[seat.department];
  const dept = T.dept[seat.department];
  const title = seat.judge_name
    ? `${fill(T.seatOf, { dept, name: tl(seat.judge_name) })} · ${seat.submitted ? T.seatSubmitted : `${seat.graded}/${total}`}`
    : fill(T.seatFreeTip, { dept });
  const style = seat.submitted
    ? { background: "rgba(34,197,94,0.14)", color: VERDICT.pass.ink, border: "1px solid rgba(34,197,94,0.45)" }
    : seat.judge_name
      ? { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }
      : { background: "transparent", color: "var(--text-4)", border: "1px dashed var(--border)" };
  return (
    <span title={title} aria-label={title}
      className="relative inline-flex items-center justify-center w-6 h-6 rounded-md" style={style}>
      <Icon size={12} aria-hidden="true" />
      {seat.submitted && (
        <Check size={9} strokeWidth={3} aria-hidden="true"
          className="absolute -right-1 -bottom-1 rounded-full p-[1px]"
          style={{ background: VERDICT.pass.bg, color: "#fff" }} />
      )}
    </span>
  );
}

function StatusChip({ status, T }) {
  const open = status === "open";
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-[2px] text-[11px] font-medium"
      style={open
        ? { background: "rgba(var(--brand-rgb),0.12)", color: "var(--brand-text)", border: "1px solid rgba(var(--brand-rgb),0.35)" }
        : { background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
      {open ? T.chipOpen : T.chipClosed}
    </span>
  );
}

function Result({ row, T }) {
  if (row.results_hidden) {
    return <span className="text-[11px]" style={{ color: "var(--text-3)" }} title={T.resultHiddenTip}>{T.resultHiddenShort}</span>;
  }
  if (!row.overall) return <span style={{ color: "var(--text-3)" }}>{T.resultNone}</span>;
  return (
    <span className="tabular-nums" title={fill(T.overallResSub, { p: row.overall.passed, j: row.overall.judged })}>
      <b style={{ color: "var(--text-1)" }}>{pct0(row.overall.pct)}</b>
      <span className="ml-1.5" style={{ color: "var(--text-3)" }}>{row.overall.passed}/{row.overall.judged}</span>
    </span>
  );
}

export default function AssessmentList({ isAdmin }) {
  const T = useAT();
  const { tl } = useTranslit();
  const nav = useNavigate();
  const [status, setStatus] = usePersistentState("assessment_status", "open");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ k: "id", d: "desc" });
  const [creating, setCreating] = useState(false);

  const list = useQuery({
    queryKey: ["assessment-list", status],
    queryFn: () => api.get("/api/assessment/assessments", { params: { status } }).then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
  });

  const rows = useMemo(() => {
    const all = list.data?.rows || [];
    const needle = q.trim().toLowerCase();
    const f = needle
      ? all.filter((r) => `${r.candidate?.full_name || ""} ${r.candidate?.note || ""} ${tl(r.candidate?.full_name || "")} ${workPlace(r.candidate)}`
        .toLowerCase().includes(needle))
      : all;
    const key = (r) => sort.k === "candidate" ? (r.candidate?.full_name || "").toLowerCase()
      : sort.k === "date" ? (r.held_on || "")
      : sort.k === "result" ? (r.overall?.pct ?? -1)
      : sort.k === "panel" ? r.submitted
      : r.id;
    const dir = sort.d === "asc" ? 1 : -1;
    return [...f].map((r) => [key(r), r]).sort((a, b) => (a[0] > b[0] ? dir : a[0] < b[0] ? -dir : 0)).map((x) => x[1]);
  }, [list.data, q, sort, tl]);

  const onSort = (k) => setSort((s) => (s.k === k ? { k, d: s.d === "asc" ? "desc" : "asc" } : { k, d: k === "candidate" ? "asc" : "desc" }));
  const open = (r) => nav(`/assessment/${r.id}`);

  const toolbar = (
    <>
      <SearchInput value={q} onChange={setQ} placeholder={T.search} className="w-full sm:w-64" />
      <SegmentedToggle value={status} onChange={setStatus} ariaLabel={T.colStatus}
        options={[["open", T.stOpen], ["closed", T.stClosed], ["all", T.stAll]]} />
      {isAdmin && (
        <Button size="lg" icon={Plus} onClick={() => setCreating(true)} className="sm:ml-auto">{T.newBtn}</Button>
      )}
    </>
  );

  const empty = !list.isLoading && rows.length === 0;
  const emptyNode = list.isError ? (
    <EmptyState tone="danger" title={T.loadFailed} message={T.loadFailedMsg} showUploadLink={false}
      action={<Button variant="secondary" onClick={() => list.refetch()}>{T.retry}</Button>} />
  ) : q.trim() ? (
    <EmptyState title={T.noMatch} message="" showUploadLink={false} icon={ClipboardCheck} />
  ) : (
    <EmptyState title={T.emptyTitle} message={isAdmin ? T.emptyMsgAdmin : T.emptyMsgJudge}
      showUploadLink={false} icon={ClipboardCheck}
      action={isAdmin ? <Button icon={Plus} onClick={() => setCreating(true)}>{T.newBtn}</Button> : null} />
  );

  const mobile = list.isLoading ? <div className="p-4"><SkeletonTable rows={4} cols={2} /></div> : empty ? emptyNode : (
    <ul>
      {rows.map((r) => (
        <li key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={() => open(r)} className="w-full text-left px-4 py-3 flex items-center gap-3 min-h-[56px]">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm truncate" style={{ color: "var(--text-1)" }}>{tl(r.candidate?.full_name || "—")}</span>
                <StatusChip status={r.status} T={T} />
              </div>
              {workPlace(r.candidate) && (
                <div className="mt-0.5 text-xs truncate" style={{ color: "var(--text-3)" }}>{workPlace(r.candidate)}</div>
              )}
              <div className="mt-1 flex items-center gap-1.5">
                {r.seats.map((s) => <SeatDot key={s.department} seat={s} T={T} tl={tl} />)}
                <span className="ml-1 text-[11px]" style={{ color: "var(--text-3)" }}>{fmtDate(r.held_on)}</span>
              </div>
            </div>
            <div className="text-xs text-right"><Result row={r} T={T} /></div>
            <ChevronRight size={16} style={{ color: "var(--text-4)" }} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <TableCard icon={ClipboardCheck} title={T.tabList}
        right={list.data ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(T.rowsN, { n: rows.length })}</span> : null}
        toolbar={toolbar} mobile={mobile}>
        <thead>
          <tr>
            <Th label={T.colCandidate} k="candidate" sort={sort} onSort={onSort} />
            <Th label={T.colDate} k="date" sort={sort} onSort={onSort} />
            <Th label={T.colPanel} k="panel" sort={sort} onSort={onSort} />
            <Th label={T.colResult} k="result" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colStatus} />
          </tr>
        </thead>
        <tbody>
          {list.isLoading ? (
            [...Array(4)].map((_, i) => (
              <tr key={i}><td colSpan={5} className="px-3 py-3"><div className="h-4 rounded animate-pulse" style={{ background: "var(--bg-inner)" }} /></td></tr>
            ))
          ) : empty ? (
            <tr><td colSpan={5}>{emptyNode}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id} onClick={() => open(r)} className="cursor-pointer">
              <td className="px-3 py-2 max-w-[360px]">
                <div className="flex items-baseline gap-2 min-w-0 whitespace-nowrap">
                  <span className="font-medium shrink-0" style={{ color: "var(--text-1)" }}>{tl(r.candidate?.full_name || "—")}</span>
                  {(workPlace(r.candidate) || r.candidate?.note) && (
                    <span className="min-w-0 truncate text-xs" style={{ color: "var(--text-3)" }}
                      title={[workPlace(r.candidate), r.candidate?.note].filter(Boolean).join(" · ")}>
                      {workPlace(r.candidate) || r.candidate.note}
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 tabular-nums">{fmtDate(r.held_on)}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5">
                  {r.seats.map((s) => <SeatDot key={s.department} seat={s} T={T} tl={tl} />)}
                  <span className="ml-1 text-[11px] tabular-nums" style={{ color: "var(--text-3)" }}>{fill(T.submittedN, { n: r.submitted })}</span>
                </span>
              </td>
              <td className="px-3 py-2 text-right"><Result row={r} T={T} /></td>
              <td className="px-3 py-2"><StatusChip status={r.status} T={T} /></td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {creating && <NewAssessmentModal onClose={() => setCreating(false)} onCreated={(id) => nav(`/assessment/${id}`)} />}
    </>
  );
}
