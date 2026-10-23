// «Liderlar KPI» — the compliance tab («Muvofiqlik»): the month's compliance
// rate as the one summary (when Verifix's HR journals were read, and the
// admin's read, on its muted line), then the ranking (one row per owned cell,
// worst rate first) or every judged person behind the card's own view switch,
// and folded under the ranking whatever counted toward nobody. Every figure is
// the board payload's `compliance` half, which IS
// `category_compliance.month_payload`; the people are asked only when that
// view opens (`GET /api/category-compliance/people`), never computed here.
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AlertTriangle, RefreshCw, Users } from "lucide-react";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import EmptyState from "../ui/EmptyState";
import TableCard, { Th } from "../ui/DataTable";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import { fill } from "../../pages/leadersKpiText";
import ComplianceRules from "./ComplianceRules";
import { Count, MobileRow, Notes, RulesButton, ScoreChip, Summary, ViewHead, Warn, EmptyRow, VerdictChip } from "./KpiBits";
import { VERDICT_RANK, dmHm, dmy, errText, fetchPeople, n0, pct1, pts, scoreTone, sortRows, toneInk, useSort } from "./kpiUtil";

const LINKS_FROM = "12.10.2026";   // the dated cell links begin here (cell_links)

export default function ComplianceTab({ T, tl, tx, data, ym, mLabel, needle, isAdmin, toast, refetch, onExplain }) {
  const cp = data?.compliance || {};
  const state = cp.state;
  const tot = cp.totals;
  const rule = cp.rule;
  const read = cp.read;
  const dir = cp.directory;
  const running = !!read?.running;
  const showMonth = ["open", "ended"].includes(state);
  const [view, setView] = usePersistentState("lkpi.cpView", "ranking");
  const [sortL, onSortL] = useSort("lkpi.sortCp", { key: "rate", dir: "asc" });
  const [sortP, onSortP] = useSort("lkpi.sortCpP", { key: "verdict", dir: "asc" });
  const [rulesOpen, setRulesOpen] = useState(false);

  // An admin starts a read of the three HR journals; while it runs
  // (`read.running`) the page polls the read's state alone and asks for the
  // board again once it has finished, so the figures follow.
  const readM = useMutation({
    mutationFn: () => api.post("/api/category-compliance/read").then((r) => r.data),
    onSuccess: (r) => {
      if (r?.started) toast.success(T.cpReadStarted); else toast.info(T.cpReadBusy);
      refetch();
    },
    onError: async (e) => toast.error(fill(T.cpReadFail, { e: await errText(e) })),
  });

  const has = (...vals) => !needle || vals.some((v) => v && String(v).toLowerCase().includes(needle));
  const nameBoth = (v) => [v, v ? tl(v) : null];
  const textBoth = (v) => [v, v ? tx(v) : null];
  const word = (v) => (v ? tx(v) : "—");
  const verdictWord = (v) => T.cpV[v] || v || "—";

  const ranking = useMemo(() => {
    const rows = (cp.ranking || []).filter((x) => has(x.code, ...nameBoth(x.owner), ...nameBoth(x.brigadir)));
    return sortRows(rows, sortL, (x, k) => ({
      code: x.code, owner: tl(x.owner || ""), brigadir: tl(x.brigadir || ""),
      counted: x.counted, compliant: x.compliant, rate: x.rate, score: x.score, points: x.points,
    })[k]);
  }, [cp.ranking, needle, sortL, T]); // eslint-disable-line react-hooks/exhaustive-deps

  // The people behind the ranking — every owned cell in scope, by code key.
  const byKey = useMemo(() => Object.fromEntries((cp.ranking || []).map((x) => [x.key, x])), [cp.ranking]);
  const keys = useMemo(() => Object.keys(byKey).sort(), [byKey]);
  const peopleQ = useQuery({
    queryKey: ["cc-people", ym, keys.join(",")],
    queryFn: () => fetchPeople(ym, keys),
    enabled: showMonth && view === "people" && keys.length > 0,
    staleTime: 60_000,
  });
  const people = useMemo(() => {
    const out = [];
    for (const [k, list] of Object.entries(peopleQ.data || {})) {
      const cell = byKey[k];
      if (!cell) continue;
      for (const p of list) out.push({ ...p, key: k, code: cell.code, cell_id: cell.id, owner: cell.owner });
    }
    const kept = out.filter((p) => has(...nameBoth(p.name), p.code, ...nameBoth(p.owner), ...textBoth(p.job),
      ...textBoth(p.actual), ...textBoth(p.expected)));
    return sortRows(kept, sortP, (p, k) => ({
      name: tl(p.name || ""), code: p.code, owner: tl(p.owner || ""), job: p.job ? tx(p.job) : "", ladder: p.ladder ? tx(p.ladder) : "",
      tenure: p.tenure, expected: p.expected ? tx(p.expected) : "", actual: p.actual ? tx(p.actual) : "", since: p.since,
      verdict: VERDICT_RANK[p.verdict] ?? 9,
    })[k]);
  }, [peopleQ.data, byKey, needle, sortP, T]); // eslint-disable-line react-hooks/exhaustive-deps

  const readBroken = !running && !!read?.last && read.last.ok === false;

  const notices = [];
  if (tot && showMonth) {
    const nt = cp.notices || {};
    if (cp.approx_owners) notices.push(fill(T.cpNApproxOwners, { date: LINKS_FROM }));
    if (cp.approx_roster) notices.push(T.cpNApproxRoster);
    if (nt.no_owner_cells) notices.push(fill(T.cpNNoOwner, { n: n0(nt.no_owner_cells) }));
    if (nt.no_ladder?.length) {
      const jobs = nt.no_ladder.slice(0, 5).map((j) => word(j.job)).join(", ") + (nt.no_ladder.length > 5 ? ` +${nt.no_ladder.length - 5}` : "");
      notices.push(fill(T.cpNNoLadder, { jobs, n: n0(nt.no_ladder.reduce((s, j) => s + (j.people || 0), 0)) }));
    }
    if (nt.ambiguous?.length) notices.push(fill(T.cpNAmbiguous, { jobs: nt.ambiguous.map((j) => `${word(j.job)} (${n0(j.people)})`).join(", ") }));
    if (nt.unregistered?.length) {
      const codes = nt.unregistered.slice(0, 10).map((u) => u.code || "—").join(", ") + (nt.unregistered.length > 10 ? ` +${nt.unregistered.length - 10}` : "");
      notices.push(fill(T.cpNUnreg, { codes, n: n0(tot.unregistered) }));
    }
    if (nt.no_cell) notices.push(fill(T.cpNNoCell, { n: n0(nt.no_cell) }));
  }

  const readBtn = (label) => isAdmin && (
    <Button size="md" variant="secondary" icon={<RefreshCw size={13} className={running || readM.isPending ? "animate-spin" : ""} />}
      loading={readM.isPending} disabled={running} onClick={() => readM.mutate()}>
      {label}
    </Button>
  );

  // The two Verifix reads behind the month: the HR journals (this KPI's own)
  // and the directory (who works where, the turnover tab's). One time is
  // printed — the journals'; the directory speaks only when it is missing.
  const readMeta = running
    ? <span className="inline-flex items-center gap-1"><RefreshCw size={11} className="animate-spin" aria-hidden />{T.cpReadRunning}</span>
    : read?.ok ? fill(T.srcVerifix, { at: dmHm(read.ok.at) }) : T.cpReadNever;
  const warnMeta = readBroken ? <Warn>{fill(T.cpReadFailed, { e: read.last.error || "?" })}</Warn>
    : read?.ok && read?.stale ? <Warn>{T.cpReadStale}</Warn>
      : !dir?.ok ? <Warn>{T.cpDirNever}</Warn> : null;

  const summary = showMonth && tot && (
    <Summary value={tot.rate == null ? "—" : pct1(tot.rate)}
      label={`${T.sumCompliance} · ${fill(T.sumCompOf, { ok: n0(tot.compliant), n: n0(tot.counted) })}`}
      meta={[state === "open" && T.notOver, readMeta, warnMeta]}
      actions={(
        <>
          <RulesButton label={T.rulesBtn} onClick={() => setRulesOpen(true)} />
          {readBtn(T.cpRead)}
        </>
      )} />
  );

  const head = (right) => (
    <ViewHead value={view} onChange={setView} ariaLabel={T.tabs.compliance} right={right}
      options={[["ranking", T.cpTabRanking], ["people", T.cpTabPeople]]} />
  );

  const openCell = (x) => onExplain("compliance", x);
  const rateCell = (x) => (x.rate == null
    ? <span style={{ color: "var(--text-4)" }}>—</span>
    : <span className="font-semibold" style={{ color: toneInk(scoreTone(x.score)) }}>{pct1(x.rate)}</span>);

  const rankingTable = (
    <TableCard head={head(<Count>{fill(T.countLine, { o: n0(tot?.owners ?? 0), c: n0(tot?.owned_cells ?? 0) })}</Count>)}
      footer={notices.length ? <Notes notes={notices} label={fill(T.notesN, { n: notices.length })} /> : null}
      mobile={ranking.length ? ranking.map((x) => (
        <MobileRow key={x.key} onClick={() => openCell(x)}
          title={<span className="tabular-nums">{x.code} · {x.owner ? tl(x.owner) : "—"}</span>}
          sub={x.brigadir ? tl(x.brigadir) : ""}
          foot={x.counted ? `${n0(x.compliant)} / ${n0(x.counted)}` : T.figComplianceNone}
          right={<><span className="text-sm tabular-nums">{rateCell(x)}</span><ScoreChip score={x.score} size="sm" /></>} />
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.nothing}</p>}>
      <thead>
        <tr>
          <Th label={T.colCell} k="code" sort={sortL} onSort={onSortL} />
          <Th label={T.colOwner} k="owner" sort={sortL} onSort={onSortL} hint={T.hOwner} />
          <Th label={T.colBrigadir} k="brigadir" sort={sortL} onSort={onSortL} />
          <Th label={T.cpColCounted} k="counted" sort={sortL} onSort={onSortL} align="right" hint={T.cpHCounted} />
          <Th label={T.cpColCompliant} k="compliant" sort={sortL} onSort={onSortL} align="right" hint={T.cpHCompliant} />
          <Th label={T.cpColRate} k="rate" sort={sortL} onSort={onSortL} align="right" hint={T.cpHRate} />
          <Th label={T.colScore} k="score" sort={sortL} onSort={onSortL} align="center" />
          <Th label={T.colPoints} k="points" sort={sortL} onSort={onSortL} align="right" />
        </tr>
      </thead>
      <tbody>
        {ranking.length === 0 ? <EmptyRow cols={8} text={T.nothing} /> : ranking.map((x) => (
          <tr key={x.key} className="cursor-pointer" onClick={() => openCell(x)}>
            <td className="px-3 py-2 tabular-nums"><CellLink id={x.id}>{x.code}</CellLink></td>
            <td className="px-3 py-2 whitespace-nowrap">
              <button type="button" className="font-medium text-left hover:underline underline-offset-2 focus-visible:underline outline-none"
                style={{ color: "var(--text-1)" }} onClick={(e) => { e.stopPropagation(); openCell(x); }}>
                {x.owner ? tl(x.owner) : "—"}
              </button>
            </td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{x.brigadir ? tl(x.brigadir) : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(x.counted)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(x.compliant)}</td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{rateCell(x)}</td>
            <td className="px-3 py-1.5 text-center"><ScoreChip score={x.score} size="sm" /></td>
            <td className="px-3 py-2 text-right tabular-nums">{x.points == null ? "0" : pts(x.points)}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  // The ladder a job is read against is the job's own name nearly always;
  // where it is another, the job's hover says so instead of a column of repeats.
  const jobTitle = (p) => {
    const job = word(p.job);
    const lad = p.ladder ? tx(p.ladder) : "";
    return lad && lad !== job ? `${job} → ${T.cpColLadder}: ${lad}` : job;
  };
  const peopleEmpty = peopleQ.isLoading ? T.cpPeopleLoading : peopleQ.isError ? T.cpPeopleErr
    : Object.keys(peopleQ.data || {}).length === 0 ? T.cpPeopleNone : T.nothing;
  const peopleTable = (
    <TableCard head={head(<Count>{fill(T.cpNPeople, { n: n0(people.length) })}</Count>)}
      footer={peopleQ.isError ? (
        <Button size="sm" variant="secondary" onClick={() => peopleQ.refetch()}>{T.retry}</Button>
      ) : null}
      mobile={people.length ? people.map((p) => (
        <div key={`${p.key}-${p.employee_id}`} className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{tl(p.name)}</span>
            <VerdictChip counted={p.counted} compliant={p.compliant}>{verdictWord(p.verdict)}</VerdictChip>
          </div>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--text-3)" }}>
            <span className="tabular-nums">{p.code}</span>
            <span>{word(p.job)}</span>
            {p.tenure != null && <span className="tabular-nums">{fill(T.cpTenure, { n: n0(p.tenure) })}</span>}
          </div>
          <div className="text-xs mt-1 tabular-nums" style={{ color: "var(--text-2)" }}>
            {p.expected ? fill(T.cpExExpected, { c: tx(p.expected) }) : "—"} · {T.cpColActual.toLowerCase()}: {word(p.actual)}{p.since ? ` (${dmy(p.since)})` : ""}
          </div>
        </div>
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{peopleEmpty}</p>}>
      <thead>
        <tr>
          <Th label={T.cpColName} k="name" sort={sortP} onSort={onSortP} />
          <Th label={T.colCell} k="code" sort={sortP} onSort={onSortP} />
          <Th label={T.colOwner} k="owner" sort={sortP} onSort={onSortP} hint={T.hOwner} />
          <Th label={T.cpColJob} k="job" sort={sortP} onSort={onSortP} />
          <Th label={T.cpColTenure} k="tenure" sort={sortP} onSort={onSortP} align="right" />
          <Th label={T.cpColExpected} k="expected" sort={sortP} onSort={onSortP} />
          <Th label={T.cpColActual} k="actual" sort={sortP} onSort={onSortP} />
          <Th label={T.cpColSince} k="since" sort={sortP} onSort={onSortP} align="center" />
          <Th label={T.cpColVerdict} k="verdict" sort={sortP} onSort={onSortP} />
        </tr>
      </thead>
      <tbody>
        {people.length === 0 ? <EmptyRow cols={9} text={peopleEmpty} /> : people.map((p) => (
          <tr key={`${p.key}-${p.employee_id}`}>
            <td className="px-3 py-2 whitespace-nowrap font-medium" style={{ color: "var(--text-1)" }}>{tl(p.name)}</td>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap"><CellLink id={p.cell_id}>{p.code}</CellLink></td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{p.owner ? tl(p.owner) : "—"}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
              <span className="block max-w-[16rem] truncate" title={jobTitle(p)}>{word(p.job)}</span>
            </td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{p.tenure == null ? "—" : fill(T.cpTenure, { n: n0(p.tenure) })}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{word(p.expected)}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-1)" }}>{word(p.actual)}</td>
            <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{p.since ? dmy(p.since) : "—"}</td>
            <td className="px-3 py-1.5 whitespace-nowrap"><VerdictChip counted={p.counted} compliant={p.compliant}>{verdictWord(p.verdict)}</VerdictChip></td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  let body;
  if (state === "before" || state === "future") {
    body = (
      <EmptyState icon={Users} title={state === "before" ? T.beforeTitle : mLabel}
        message={state === "before" ? T.before : T.future} showUploadLink={false} />
    );
  } else if (cp.configured === false) {
    body = <EmptyState icon={AlertTriangle} title={T.cpNotConfTitle} message={T.cpNotConfMsg} showUploadLink={false} />;
  } else if (!read?.ok) {
    body = (
      <>
        <EmptyState icon={RefreshCw} title={T.cpNoReadTitle} message={T.cpNoReadMsg} showUploadLink={false}
          action={isAdmin ? (
            <Button icon={<RefreshCw size={14} />} loading={readM.isPending || running} onClick={() => readM.mutate()}>{T.cpRead}</Button>
          ) : null} />
      </>
    );
  } else if (!dir?.ok) {
    body = (
      <>
        <EmptyState icon={Users} title={T.cpNoDirTitle} message={T.cpNoDirMsg} showUploadLink={false} />
      </>
    );
  } else {
    body = (
      <>
        {summary}
        {view === "people" ? peopleTable : rankingTable}
      </>
    );
  }

  return (
    <>
      {body}
      {rulesOpen && rule && <ComplianceRules open onClose={() => setRulesOpen(false)} rule={rule} T={T} tx={tx} />}
    </>
  );
}
