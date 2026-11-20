import { Fragment, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { Ticket, BookCheck, ArrowRight } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import SearchInput from "../ui/SearchInput";
import SegmentedToggle from "../ui/SegmentedToggle";
import EmptyState from "../ui/EmptyState";
import { SkeletonTable, SkeletonBlock } from "../ui/Skeleton";
import { useTranslit } from "../../utils/transliterate";
import { nameCase } from "../../utils/personName";
import api from "../../utils/api";
import {
  useAT, fill, fmtDate, errText, workPlace, DEPT_ICON, TYPE_ICON, BLOCK_OF, BLOCK_ORDER,
  DeptChip, TypeChip, CandidateAvatar,
} from "./assessmentUtil";
import { StatusChip } from "./AssessmentList";

// The panel's own order (services/assessment.py SEAT_ORDER), and the draw's types.
const DEPT_ORDER = ["kaizen", "production", "tb", "hr", "okk"];
const TYPE_ORDER = ["theory", "practical"];

/** A count behind an icon — one department's or one type's share of a ticket.
 *  A category, not a status: neutral, its name in the tooltip. */
function CountTag({ Icon, n, title }) {
  return (
    <span title={title} aria-label={title}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-[2px] text-[11px] font-medium tabular-nums whitespace-nowrap"
      style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
      {Icon && <Icon size={11} aria-hidden="true" />}{n}
    </span>
  );
}

function Composition({ row, T }) {
  return (
    <span className="inline-flex items-center gap-1">
      {DEPT_ORDER.filter((d) => row.departments?.[d]).map((d) => (
        <CountTag key={d} Icon={DEPT_ICON[d]} n={row.departments[d]} title={`${T.dept[d]}: ${row.departments[d]}`} />
      ))}
    </span>
  );
}

function Types({ row, T }) {
  return (
    <span className="inline-flex items-center gap-1">
      {TYPE_ORDER.filter((k) => row.types?.[k]).map((k) => (
        <CountTag key={k} Icon={TYPE_ICON[k]} n={row.types[k]} title={`${T.type[k]}: ${row.types[k]}`} />
      ))}
    </span>
  );
}

/**
 * «Biletlar» (2026-11-20, the operator: «we need a table to see tickets
 * separately») — every sitting's drawn set as a ticket: its number, whose it
 * is, when, and what it holds. A row opens the ticket whole (`TicketModal`).
 * Admins only, like the bank: a ticket is the bank's questions with their
 * expected answers. A redrawn set is replaced by the new one, never kept.
 */
export default function TicketList() {
  const T = useAT();
  const { tl } = useTranslit();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState({ k: "ticket", d: "desc" });
  const [openId, setOpenId] = useState(null);

  const list = useQuery({
    queryKey: ["assessment-tickets"],
    queryFn: () => api.get("/api/assessment/tickets").then((r) => r.data),
    placeholderData: keepPreviousData,
    refetchInterval: 30000,
  });

  const rows = useMemo(() => {
    const all = list.data?.rows || [];
    const needle = q.trim().toLowerCase();
    // A number (with or without «№» / «#») is a ticket; anything else a name.
    const num = needle.replace(/^[№#]\s*/, "");
    const f = needle
      ? all.filter((r) => (/^\d+$/.test(num) && String(r.ticket_no ?? "") === num)
        || `${r.candidate?.full_name || ""} ${tl(r.candidate?.full_name || "")} ${workPlace(r.candidate)}`
          .toLowerCase().includes(needle))
      : all;
    const key = (r) => sort.k === "candidate" ? (r.candidate?.full_name || "").toLowerCase()
      : sort.k === "date" ? (r.held_on || "")
      : (r.ticket_no ?? -1);
    const dir = sort.d === "asc" ? 1 : -1;
    return f.map((r) => [key(r), r]).sort((a, b) => (a[0] > b[0] ? dir : a[0] < b[0] ? -dir : 0)).map((x) => x[1]);
  }, [list.data, q, sort, tl]);

  const onSort = (k) => setSort((s) => (s.k === k ? { k, d: s.d === "asc" ? "desc" : "asc" } : { k, d: k === "candidate" ? "asc" : "desc" }));
  const ticketText = (r) => (r.ticket_no == null ? "—" : fill(T.ticketShort, { n: r.ticket_no }));

  const empty = !list.isLoading && rows.length === 0;
  const emptyNode = list.isError ? (
    <EmptyState tone="danger" title={T.loadFailed} message={errText(list.error, T)} showUploadLink={false}
      action={<Button variant="secondary" onClick={() => list.refetch()}>{T.retry}</Button>} />
  ) : q.trim() ? (
    <EmptyState title={T.noMatch} message="" showUploadLink={false} icon={Ticket} />
  ) : (
    <EmptyState title={T.ticketsEmptyTitle} message={T.ticketsEmptyMsg} showUploadLink={false} icon={Ticket} />
  );

  const mobile = list.isLoading ? <div className="p-4"><SkeletonTable rows={4} cols={2} /></div> : empty ? emptyNode : (
    <ul>
      {rows.map((r) => (
        <li key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={() => setOpenId(r.id)} className="w-full text-left px-4 py-3 flex items-center gap-3 min-h-[56px]">
            <CandidateAvatar cand={r.candidate} size={40} tl={tl} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm tabular-nums" style={{ color: "var(--text-1)" }}>
                  {r.ticket_no == null ? "—" : fill(T.ticket, { n: r.ticket_no })}
                </span>
                <StatusChip status={r.status} T={T} />
              </div>
              <div className="mt-0.5 text-xs truncate" style={{ color: "var(--text-2)" }}>
                {tl(r.candidate?.full_name || "—")} · <span className="tabular-nums">{fmtDate(r.held_on)}</span>
              </div>
              <div className="mt-1.5"><Composition row={r} T={T} /></div>
            </div>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <>
      <TableCard icon={Ticket} title={T.tabTickets}
        right={list.data ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{fill(T.rowsN, { n: rows.length })}</span> : null}
        toolbar={<SearchInput value={q} onChange={setQ} placeholder={T.ticketsSearch} className="w-full sm:w-64" />}
        mobile={mobile}>
        <thead>
          <tr>
            <Th label={T.colTicket} k="ticket" sort={sort} onSort={onSort} />
            <Th label={T.colCandidate} k="candidate" sort={sort} onSort={onSort} />
            <Th label={T.colDate} k="date" sort={sort} onSort={onSort} />
            <Th label={T.colComposition} />
            <Th label={T.colTypes} />
            <Th label={T.colStatus} />
          </tr>
        </thead>
        <tbody>
          {list.isLoading ? (
            [...Array(4)].map((_, i) => (
              <tr key={i}><td colSpan={6} className="px-3 py-3"><div className="h-4 rounded animate-pulse" style={{ background: "var(--bg-inner)" }} /></td></tr>
            ))
          ) : empty ? (
            <tr><td colSpan={6}>{emptyNode}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer">
              <td className="px-3 py-1.5 whitespace-nowrap tabular-nums font-semibold" title={T.ticketTip}
                style={{ color: r.ticket_no == null ? "var(--text-3)" : "var(--text-1)" }}>{ticketText(r)}</td>
              <td className="px-3 py-1.5 max-w-[360px]">
                <div className="flex items-center gap-2 min-w-0 whitespace-nowrap">
                  <CandidateAvatar cand={r.candidate} size={28} tl={tl} />
                  <span className="font-medium shrink-0" style={{ color: "var(--text-1)" }}>{tl(r.candidate?.full_name || "—")}</span>
                  {workPlace(r.candidate) && (
                    <span className="min-w-0 truncate text-xs" style={{ color: "var(--text-3)" }} title={workPlace(r.candidate)}>{workPlace(r.candidate)}</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-1.5 tabular-nums whitespace-nowrap">{fmtDate(r.held_on)}</td>
              <td className="px-3 py-1.5 whitespace-nowrap"><Composition row={r} T={T} /></td>
              <td className="px-3 py-1.5 whitespace-nowrap"><Types row={r} T={T} /></td>
              <td className="px-3 py-1.5"><StatusChip status={r.status} T={T} /></td>
            </tr>
          ))}
        </tbody>
      </TableCard>
      {openId != null && <TicketModal id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

/** One ticket whole: its questions in the sitting's order, block by block.
 *  The expected answers stay folded until asked for — a ticket may be on a
 *  screen the candidate can see, and the answers are the panel's alone. */
export function TicketModal({ id, onClose }) {
  const T = useAT();
  const { tl } = useTranslit();
  const nav = useNavigate();
  const [answers, setAnswers] = useState("hide");
  const det = useQuery({
    queryKey: ["assessment-ticket", id],
    queryFn: () => api.get(`/api/assessment/tickets/${id}`).then((r) => r.data),
  });
  const d = det.data;
  const items = d?.items || [];
  const blocks = BLOCK_ORDER.map((b) => ({ key: b, items: items.filter((it) => BLOCK_OF[it.department] === b) }))
    .filter((b) => b.items.length);
  const cand = d?.candidate;
  const title = d?.ticket_no != null ? fill(T.ticket, { n: d.ticket_no }) : T.tabTickets;
  const subtitle = d ? [cand ? nameCase(tl(cand.full_name)) : null, fmtDate(d.held_on), fill(T.questionsN, { n: items.length })]
    .filter(Boolean).join(" · ") : undefined;

  return (
    <Modal open onClose={onClose} title={title} subtitle={subtitle} maxWidth="max-w-3xl" icon={<Ticket size={18} />}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>{T.close}</Button>
          <Button icon={ArrowRight} onClick={() => nav(`/assessment/${id}`)} disabled={!d}>{T.openAssessment}</Button>
        </>
      )}>
      {det.isLoading ? (
        <div className="space-y-3">
          <SkeletonBlock className="h-[38px] w-64 rounded-xl" />
          {[...Array(4)].map((_, i) => <SkeletonBlock key={i} className="h-16 rounded-xl" />)}
        </div>
      ) : det.isError ? (
        <EmptyState tone="danger" title={T.loadFailed} message={errText(det.error, T)} showUploadLink={false}
          action={<Button variant="secondary" onClick={() => det.refetch()}>{T.retry}</Button>} />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedToggle value={answers} onChange={setAnswers} ariaLabel={T.answer}
              options={[{ value: "hide", label: T.ansHide }, { value: "show", label: T.ansShow, title: T.ansShowTip }]} />
            {cand && <span className="ml-auto inline-flex items-center gap-2 min-w-0">
              <CandidateAvatar cand={cand} size={32} tl={tl} />
              <span className="text-xs truncate" style={{ color: "var(--text-3)" }}>{workPlace(cand)}</span>
            </span>}
          </div>
          {blocks.map((b) => (
            <Fragment key={b.key}>
              <div className="pt-1 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-3)" }}>{T.block[b.key]}</div>
              <ol className="space-y-2">
                {b.items.map((it) => (
                  <li key={it.id} className="flex gap-3 rounded-xl px-3 py-2.5"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
                    <span className="inline-flex items-center justify-center rounded-lg font-semibold tabular-nums flex-shrink-0 text-xs"
                      style={{ minWidth: 28, height: 28, padding: "0 6px", background: "var(--bg-card)", color: "var(--text-2)", boxShadow: "inset 0 0 0 1px var(--border-md)" }}>
                      {it.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <DeptChip dept={it.department} T={T} /><TypeChip type={it.qtype} T={T} />
                      </div>
                      {/* Authored prose, often Russian: printed as written, never through tx. */}
                      <p className="mt-1.5 text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: "var(--text-1)" }}>{it.text}</p>
                      {answers === "show" && (
                        <div className="mt-2 rounded-lg px-3 py-2"
                          style={{ background: "var(--bg-card)", borderLeft: `3px solid ${it.answer ? "var(--brand)" : "var(--border)"}` }}>
                          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--text-3)" }}>
                            <BookCheck size={13} aria-hidden="true" />{T.answer}
                          </div>
                          {it.answer
                            ? <p className="text-sm leading-relaxed whitespace-pre-wrap break-words" style={{ color: "var(--text-2)" }}>{it.answer}</p>
                            : <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.noAnswer}</p>}
                        </div>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            </Fragment>
          ))}
        </>
      )}
    </Modal>
  );
}
