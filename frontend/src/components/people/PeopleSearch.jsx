import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronRight, Contact, Search } from "lucide-react";
import TableCard, { Th } from "../ui/DataTable";
import SearchInput from "../ui/SearchInput";
import EmptyState from "../ui/EmptyState";
import Button from "../ui/Button";
import { SkeletonBlock } from "../ui/Skeleton";
import { useTranslit } from "../../utils/transliterate";
import api from "../../utils/api";
import { useP, fill, fmtDate, nameCase } from "./peopleUtil";

/** A person's status as a quiet chip — working is the default and says
 *  nothing; dismissed / not started yet are named. */
export function StatusChip({ status, dismissed, P }) {
  if (status === "W") return null;
  const label = status === "D" ? fill(P.dismissedOn, { d: fmtDate(dismissed) }) : P.st[status] || status;
  return (
    <span className="inline-flex items-center rounded-md px-1.5 py-[2px] text-[11px] font-medium whitespace-nowrap"
      style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
      {label}
    </span>
  );
}

function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function ResultRows({ rows, P, tl, tx, onOpen }) {
  return (
    <>
      {rows.map((r) => (
        <tr key={r.employee_id} onClick={() => onOpen(r)} className="cursor-pointer">
          <td className="px-3 py-2 max-w-[320px]">
            <span className="flex items-center gap-2 min-w-0">
              <span className="font-medium truncate" style={{ color: "var(--text-1)" }}>{nameCase(tl(r.name))}</span>
              <StatusChip status={r.status} dismissed={r.dismissed} P={P} />
            </span>
          </td>
          <td className="px-3 py-2 max-w-[260px] truncate" style={{ color: "var(--text-2)" }} title={tx(r.job || "")}>{tx(r.job || "—")}</td>
          <td className="px-3 py-2 tabular-nums">{r.code || "—"}</td>
          <td className="px-3 py-2 max-w-[260px] truncate" style={{ color: "var(--text-3)" }} title={tx(r.unit || "")}>{tx(r.unit || "—")}</td>
        </tr>
      ))}
    </>
  );
}

/**
 * /people — find a person (the directory, folded like the assessment picker),
 * and `?find=<name>&code=<cell>` — the door every NAME-only row elsewhere
 * opens the card through: one match opens the card, several are listed.
 */
export default function PeopleSearch() {
  const P = useP();
  const { tl, tx } = useTranslit();
  const nav = useNavigate();
  const location = useLocation();
  const params = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const find = params.get("find") || "";
  const code = params.get("code") || "";

  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim());
  const open = (r) => nav(`/people/${encodeURIComponent(r.employee_id)}`);

  const resolve = useQuery({
    queryKey: ["people-resolve", find, code],
    queryFn: () => api.get("/api/people/resolve", { params: { name: find, ...(code ? { code } : {}) } }).then((r) => r.data),
    enabled: find.length >= 2,
    staleTime: 60_000,
  });
  useEffect(() => {
    const rows = resolve.data?.rows;
    if (rows && rows.length === 1) nav(`/people/${encodeURIComponent(rows[0].employee_id)}`, { replace: true });
  }, [resolve.data, nav]);

  const letters = dq.replace(/\s+/g, "").length;
  const search = useQuery({
    queryKey: ["people-search", dq],
    queryFn: () => api.get("/api/people/search", { params: { q: dq } }).then((r) => r.data),
    enabled: letters >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  // The directory's size and read time — asked once, with an empty query.
  const dir = useQuery({
    queryKey: ["people-search", ""],
    queryFn: () => api.get("/api/people/search", { params: { q: "" } }).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
  const dirInfo = dir.data?.directory;

  const head = (
    <tr>
      <Th label={P.colName} />
      <Th label={P.colJob} />
      <Th label={P.colCell} />
      <Th label={P.unitVerifix} />
    </tr>
  );

  const mobileList = (rows) => (
    <ul>
      {rows.map((r) => (
        <li key={r.employee_id} style={{ borderTop: "1px solid var(--border)" }}>
          <button type="button" onClick={() => open(r)} className="w-full text-left px-4 py-3 flex items-center gap-3 min-h-[56px]">
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 min-w-0">
                <span className="font-semibold text-sm truncate" style={{ color: "var(--text-1)" }}>{nameCase(tl(r.name))}</span>
                <StatusChip status={r.status} dismissed={r.dismissed} P={P} />
              </span>
              <span className="block mt-0.5 text-xs truncate" style={{ color: "var(--text-3)" }}>
                {[tx(r.job || ""), r.code].filter(Boolean).join(" · ") || "—"}
              </span>
            </span>
            <ChevronRight size={16} style={{ color: "var(--text-4)" }} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );

  // ── a name handed over by another page ──
  if (find) {
    const rows = resolve.data?.rows || [];
    const many = rows.length > 1;
    return (
      <div className="space-y-4">
        {resolve.isLoading || (rows.length === 1) ? (
          <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SkeletonBlock className="h-5 w-56" />
            <SkeletonBlock className="h-9 w-full" />
          </div>
        ) : resolve.isError ? (
          <EmptyState tone="danger" title={P.loadFailed} message={P.loadFailedMsg} showUploadLink={false}
            action={<Button variant="secondary" onClick={() => resolve.refetch()}>{P.retry}</Button>} />
        ) : many ? (
          <TableCard icon={Contact} title={fill(P.whichOne, { name: nameCase(tl(find)) })} subtitle={P.whichOneSub}
            mobile={mobileList(rows)}>
            <thead>{head}</thead>
            <tbody><ResultRows rows={rows} P={P} tl={tl} tx={tx} onOpen={open} /></tbody>
          </TableCard>
        ) : (
          <EmptyState icon={Search} title={fill(P.resolveNone, { name: nameCase(tl(find)) })} message="" showUploadLink={false}
            action={<Button variant="secondary" onClick={() => nav("/people", { replace: true })}>{P.backToSearch}</Button>} />
        )}
      </div>
    );
  }

  // ── the search ──
  const rows = letters >= 2 ? search.data?.rows || [] : [];
  const toolbar = (
    <div className="w-full flex flex-col gap-1.5">
      <SearchInput value={q} onChange={setQ} placeholder={P.searchPh} className="w-full sm:max-w-md" autoFocus />
      <span className="text-[11px]" style={{ color: "var(--text-3)" }}>
        {letters < 2 ? P.typeMore
          : search.isFetching && !search.data ? P.searching
          : dirInfo ? fill(P.dirInfo, { n: dirInfo.count, at: dirInfo.read_at ? fmtDate(dirInfo.read_at) : "—" }) : ""}
      </span>
    </div>
  );
  const empty = letters >= 2 && !search.isFetching && rows.length === 0;
  return (
    <TableCard icon={Search} title={P.findTitle}
      right={rows.length ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{rows.length}{search.data?.more ? "+" : ""}</span> : null}
      toolbar={toolbar}
      mobile={letters < 2 ? null : empty ? <p className="px-4 py-6 text-sm text-center" style={{ color: "var(--text-3)" }}>{P.notFound}</p> : mobileList(rows)}
      footer={search.data?.more ? <span className="text-xs" style={{ color: "var(--text-3)" }}>{P.moreHits}</span> : null}>
      {letters >= 2 && <thead>{head}</thead>}
      <tbody>
        {letters < 2 ? null : search.isLoading ? (
          [...Array(4)].map((_, i) => (
            <tr key={i}><td colSpan={4} className="px-3 py-3"><SkeletonBlock className="h-4 w-full" /></td></tr>
          ))
        ) : empty ? (
          <tr><td colSpan={4} className="px-3 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{P.notFound}</td></tr>
        ) : (
          <ResultRows rows={rows} P={P} tl={tl} tx={tx} onOpen={open} />
        )}
      </tbody>
    </TableCard>
  );
}
