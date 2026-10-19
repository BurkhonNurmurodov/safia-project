// «Liderlar KPI» — the concerns tab's pieces: the status vocabulary (the
// platform's colours — resolved green, in progress amber, new GREY, escalated
// darker slate — each with its icon, so two similar colours still differ by
// shape), a concern row, the cell dialog (its month's counts and the open
// concerns waiting on the leader), the detail dialog and the paged register.
// Every row comes from `/api/worker-concerns/list`; nothing is computed here.
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ArrowUp, ArrowUpRight, CheckCheck, CircleDot, ClipboardList, Clock, LayoutGrid, Megaphone } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import Pagination from "../ui/Pagination";
import SearchInput from "../ui/SearchInput";
import TableCard, { Th } from "../ui/DataTable";
import { SkeletonBlock } from "../ui/Skeleton";
import { TONE_HEX } from "../../utils/statusBands";
import { surnameInitial } from "../../utils/personName";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import { fill } from "../../pages/leadersKpiText";
import { ScoreChip } from "./KpiBits";
import { n0, pts, scoreTone, toneInk } from "./kpiUtil";

const SLATE = "#94a3b8";
const SLATE_DARK = "#64748b";
const OPEN_KEYS = ["doing", "todo"];
const ST_FILL = { done: TONE_HEX.ok, doing: TONE_HEX.warn, todo: SLATE, uplifted: SLATE_DARK };
const ST_INK = { done: "var(--status-ok)", doing: "var(--status-warn)", todo: "var(--text-2)", uplifted: "var(--text-2)" };
const ST_ICON = { done: CheckCheck, doing: Clock, todo: CircleDot, uplifted: ArrowUp };
const PAGE_SIZE = 50;

const fmtDate = (s) => (s ? s.split("-").reverse().join(".") : "—");
const fmtShort = (s) => (s ? `${s.slice(8, 10)}.${s.slice(5, 7)}` : "—");
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const unresolved = (c) => (c.status ? c.status !== "done" : c.st !== "done");

export function StChip({ st, label, hint }) {
  const Icon = ST_ICON[st] || CircleDot;
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-medium whitespace-nowrap"
      style={{ background: `${ST_FILL[st] || SLATE}1a`, color: ST_INK[st] || "var(--text-2)" }} title={hint}>
      <Icon size={12} strokeWidth={2.4} aria-hidden className="flex-shrink-0" style={{ color: ST_FILL[st] || SLATE }} />
      {label}
    </span>
  );
}

export function ConcernStatus({ T, c, inline = false }) {
  const up = c.st === "uplifted";
  const doneAbove = up && c.status === "done";
  return (
    <>
      <StChip st={c.st} label={T.statuses[c.st] || c.st} hint={up ? T.cUpHint : undefined} />
      {doneAbove && (
        <span className={`${inline ? "inline-flex" : "flex mt-1"} items-center gap-1 text-[11px]`} style={{ color: "var(--status-ok)" }}>
          <CheckCheck size={12} strokeWidth={2.4} aria-hidden className="flex-shrink-0" />{T.cUpDone}
        </span>
      )}
    </>
  );
}

// «worker → owner» under a concern's text: who wrote it, whose cell it is.
const whoLine = (c, tl, T) => {
  const parts = [];
  if (c.owner) parts.push(tl(c.owner));
  if (c.cell) parts.push(c.cell);
  if (c.leader) parts.push(`${T.cOwner}: ${tl(c.leader)}`);
  return parts.join(" · ");
};

export function ConcernRows({ T, tl, rows, today, onOpen }) {
  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((c) => {
        const age = c.d && unresolved(c) ? daysBetween(c.d, today) : null;
        return (
          <li key={c.id}>
            <button type="button" onClick={() => onOpen(c)}
              className="w-full text-left py-3 px-1 -mx-1 rounded-lg transition-colors hover:bg-[var(--bg-inner)] focus-visible:outline-none focus-visible:bg-[var(--bg-inner)]">
              <span className="flex items-center gap-2 flex-wrap">
                <ConcernStatus T={T} c={c} inline />
                <span className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>
                  №{c.no} · {fmtShort(c.d)}{age != null ? ` · ${age === 0 ? T.cAgeToday : fill(T.cAge, { n: age })}` : ""}
                </span>
              </span>
              <span className="text-sm mt-1.5 line-clamp-2 leading-snug" style={{ color: "var(--text-1)" }}>{c.text}</span>
              <span className="text-xs mt-1 line-clamp-2 break-words" style={{ color: "var(--text-2)" }}>{whoLine(c, tl, T)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// The four statuses of a cell's month as four figures that add up to the total.
function StatusSplit({ T, c }) {
  const parts = [["done", c.done], ["doing", c.doing], ["todo", c.todo], ["uplifted", c.uplifted]];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {parts.map(([st, n]) => {
        const Icon = ST_ICON[st];
        return (
          <div key={st} className="rounded-xl px-3 py-2" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-3)" }}>
              <span aria-hidden className="grid place-items-center rounded-full flex-shrink-0" style={{ width: 14, height: 14, background: ST_FILL[st] }}>
                <Icon size={8} strokeWidth={3} style={{ color: st === "uplifted" ? "#fff" : "#0f172a" }} />
              </span>
              {T.statuses[st]}
            </div>
            <div className="text-base font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{n0(n || 0)}</div>
          </div>
        );
      })}
    </div>
  );
}

// One cell of the concerns KPI opened: its month's figures, the score, and
// what still waits on the leader (asked only when the dialog opens).
export function ConcernsCellModal({ T, tl, row, data, listParams, zIndex, onClose, onOpenConcern }) {
  const c = row.concerns || {};
  const rule = data?.rules?.concerns;
  const params = useMemo(() => ({
    ...listParams, cell: [row.code], status: OPEN_KEYS, sort: "date_asc", page: 1, page_size: 20,
  }), [listParams, row.code]);
  const openQ = useQuery({
    queryKey: ["lkpi-cell-open", params],
    queryFn: () => api.get("/api/worker-concerns/list", { params }).then((r) => r.data),
    enabled: !!row.code && (c.open || 0) > 0,
  });
  const today = localISO(new Date());
  const w = Math.round((rule?.weight ?? 0.25) * 100);
  return (
    <Modal open onClose={onClose} zIndex={zIndex} maxWidth="max-w-xl" icon={<LayoutGrid size={16} />}
      title={`${row.code} · ${row.owner ? tl(row.owner) : "—"}`}
      subtitle={row.brigadir ? `${T.cBrig}: ${tl(row.brigadir)}` : undefined}
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      <div className="flex items-center gap-3 flex-wrap">
        <ScoreChip score={c.score ?? null} />
        <div className="min-w-0">
          <p className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
            {!c.total ? T.figConcernsNone : !c.rated ? fill(T.figConcernsNoPct, { n: c.total })
              : <>{fill(T.cOf, { done: n0(c.done), rated: n0(c.rated) })} — <span style={{ color: toneInk(scoreTone(c.score)) }}>{c.pct0}%</span></>}
          </p>
          <p className="text-xs mt-0.5 tabular-nums" style={{ color: "var(--text-2)" }}>
            {c.score != null ? fill(T.cmPoints, { score: c.score, w, p: pts(c.points) }) : T.cmNoScore}
            {c.uplifted > 0 && ` · ${fill(T.cUpOut, { u: n0(c.uplifted) })}`}
          </p>
        </div>
      </div>
      {c.total > 0 && <StatusSplit T={T} c={c} />}
      <p className="text-xs" style={{ color: "var(--text-2)" }}>
        {T.colCell}: <CellLink id={row.id}>{row.code}</CellLink>
        {" · "}{T.colOwner}: <span style={{ color: "var(--text-1)" }}>{row.owner ? tl(row.owner) : "—"}</span>
      </p>
      {c.open > 0 && (
        <div className="pt-1">
          <h3 className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-2)" }}>
            {T.cOpenTitle} · <span className="normal-case tracking-normal font-normal">{T.cOpenSub}</span>
          </h3>
          {openQ.isError ? <p className="text-sm py-2" style={{ color: "var(--status-bad)" }}>{T.cErrList}</p>
            : !openQ.data ? (
              <div className="space-y-2 py-2">{Array.from({ length: 3 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
            ) : (
              <>
                <ConcernRows T={T} tl={tl} rows={openQ.data.rows} today={today} onOpen={onOpenConcern} />
                {openQ.data.total > openQ.data.rows.length && (
                  <p className="text-xs pt-2" style={{ color: "var(--text-2)" }}>{fill(T.cShowing, { n: n0(openQ.data.total), k: openQ.data.rows.length })}</p>
                )}
              </>
            )}
        </div>
      )}
      {data?.state === "open" && <p className="text-xs" style={{ color: "var(--status-warn)" }}>{T.provisional}</p>}
    </Modal>
  );
}

export function ConcernDetailModal({ T, t, tl, detail, zIndex, onClose, mayConcerns, onOpenPage }) {
  return (
    <Modal open onClose={onClose} zIndex={zIndex} title={`№${detail.no}`}
      subtitle={detail.leader ? `${detail.cell || "—"} · ${tl(detail.leader)}` : (detail.cell || "—")}
      icon={<Megaphone size={16} />}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{T.close}</Button>
          {mayConcerns && (
            <Button icon={<ArrowUpRight size={14} />} onClick={() => onOpenPage(detail)}>
              {fill(T.cDetailOpen, { page: t("nav.concerns") })}
            </Button>
          )}
        </>
      }>
      <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-1)" }}>{detail.text}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm pt-3" style={{ borderTop: "1px solid var(--border)" }}>
        {[
          [T.cColDate, fmtDate(detail.d)],
          [T.cColStatus, <ConcernStatus key="s" T={T} c={detail} />],
          [T.colCell, detail.cell ? <CellLink key="c" id={detail.cell_id}>{detail.cell}</CellLink> : "—"],
          [T.cWorker, tl(detail.owner || "") || "—"],
          [T.cOwner, detail.leader ? tl(detail.leader) : "—"],
          [T.cBrig, tl(detail.brigadir || "") || "—"],
          [T.cCategory, detail.category ? t(`concerns.category.${detail.category}`) : "—"],
          [T.cStep, t(`concerns.level.${detail.level}`)],
          ...(detail.done_on ? [[T.cDoneOn, fmtDate(detail.done_on)]] : []),
        ].map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs mb-0.5" style={{ color: "var(--text-3)" }}>{k}</dt>
            <dd className="break-words" style={{ color: "var(--text-1)" }}>{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

// The month's filings, paged and searchable — the register behind the
// ranking. Every row names its cell's OWNER (the operator, 2026-10-14).
export function ConcernsRegister({ T, tl, listParams, onOpen }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = usePersistentState("lkpi.cSort", "date_desc");
  const [page, setPage] = useState(1);
  const params = useMemo(() => ({
    ...listParams, q: q.trim() || undefined, sort, page, page_size: PAGE_SIZE,
  }), [listParams, q, sort, page]);
  const listQ = useQuery({
    queryKey: ["lkpi-list", params],
    queryFn: () => api.get("/api/worker-concerns/list", { params }).then((r) => r.data),
    placeholderData: keepPreviousData,
  });
  const list = listQ.data;
  const rows = list?.rows || [];
  const today = localISO(new Date());
  const toolbar = <SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder={T.cRegSearch} className="w-full sm:w-80" />;
  const right = list ? <span className="text-xs tabular-nums" style={{ color: "var(--text-2)" }}>{fill(T.cRegCount, { n: n0(list.total) })}</span> : null;
  const pageCount = list ? Math.max(1, Math.ceil(list.total / PAGE_SIZE)) : 1;
  const mobile = listQ.isLoading && !list ? (
    <div className="p-4 space-y-3">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-12 w-full" />)}</div>
  ) : rows.length === 0 ? (
    <p className="px-4 py-10 text-center text-sm" style={{ color: "var(--text-2)" }}>{listQ.isError ? T.cErrList : T.cNoMatch}</p>
  ) : (
    <div className="px-4"><ConcernRows T={T} tl={tl} rows={rows} today={today} onOpen={onOpen} /></div>
  );
  return (
    <div style={{ opacity: listQ.isFetching && list ? 0.7 : 1, transition: "opacity .15s" }}>
      <TableCard icon={ClipboardList} title={T.cRegister} right={right} toolbar={toolbar} wrap fixed mobile={mobile}
        footer={list && pageCount > 1 ? <Pagination page={page} pageCount={pageCount} total={list.total} pageSize={PAGE_SIZE} onPage={setPage} /> : null}>
        <thead>
          <tr>
            <Th label={T.cColNo} align="right" cls="w-[72px]" />
            <Th label={T.cColDate} k="date" sort={{ key: "date", dir: sort === "date_asc" ? "asc" : "desc" }}
              onSort={() => setSort((s) => (s === "date_desc" ? "date_asc" : "date_desc"))} cls="w-[108px]" />
            <Th label={T.colCell} cls="w-[88px]" />
            <Th label={<><span className="xl:hidden">{T.cColTextWho}</span><span className="hidden xl:inline">{T.cColText}</span></>} />
            <Th label={T.cColWorker} cls="hidden xl:table-cell w-[15%]" />
            <Th label={T.colOwner} cls="hidden xl:table-cell w-[15%]" />
            <Th label={T.cColStatus} cls="w-[136px]" />
          </tr>
        </thead>
        <tbody>
          {listQ.isLoading && !list ? (
            <tr><td colSpan={7} className="px-3 py-4"><div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <SkeletonBlock key={i} className="h-8 w-full" />)}</div></td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="px-3 py-10 text-center text-sm" style={{ color: "var(--text-2)" }}>{listQ.isError ? T.cErrList : T.cNoMatch}</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id} className="cursor-pointer align-top" onClick={() => onOpen(r)}>
              <td className="px-3 py-2.5 text-right text-sm tabular-nums" style={{ color: "var(--text-2)" }}>{r.no}</td>
              <td className="px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-2)" }}>{fmtDate(r.d)}</td>
              <td className="px-3 py-2.5 text-sm tabular-nums" style={{ color: "var(--text-2)" }}>{r.cell ? <CellLink id={r.cell_id}>{r.cell}</CellLink> : "—"}</td>
              <td className="px-3 py-2.5">
                <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(r); }}
                  className="w-full text-left text-sm leading-snug line-clamp-2 focus-visible:outline-none focus-visible:underline"
                  style={{ color: "var(--text-1)" }}>
                  {r.text}
                </button>
                <span className="block xl:hidden text-xs mt-1 truncate" style={{ color: "var(--text-2)" }}>{whoLine({ ...r, cell: null }, tl, T)}</span>
              </td>
              <td className="px-3 py-2.5 text-sm hidden xl:table-cell break-words" style={{ color: "var(--text-2)" }} title={tl(r.owner || "")}>{surnameInitial(tl(r.owner || "")) || "—"}</td>
              <td className="px-3 py-2.5 text-sm hidden xl:table-cell break-words" style={{ color: "var(--text-2)" }} title={r.leader ? tl(r.leader) : ""}>{r.leader ? surnameInitial(tl(r.leader)) : "—"}</td>
              <td className="px-3 py-2.5"><ConcernStatus T={T} c={r} /></td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </div>
  );
}
