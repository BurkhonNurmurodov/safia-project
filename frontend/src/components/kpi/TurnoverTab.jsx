// «Liderlar KPI» — the turnover tab: the month's rate as the one summary (its
// state, its Verifix read and the admin's actions on one muted line), then the
// ranking (one row per owned cell, worst rate first) or the leavers behind the
// card's own view switch, and folded under the ranking whatever counted
// toward nobody. Its words are the turnover page's own bundle (TT) beside the
// page's (TK); every figure is the board payload's `turnover` half, which IS
// `turnover.month_payload`.
import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Archive, Calculator, Lock, LockOpen, RefreshCw, UserMinus } from "lucide-react";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import ConfirmDialog from "../ui/ConfirmDialog";
import EmptyState from "../ui/EmptyState";
import TableCard, { Th } from "../ui/DataTable";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import { fill } from "../../pages/turnoverText";
import TurnoverRules from "../turnover/TurnoverRules";
import { tenure } from "../turnover/turnoverUtil";
import { Count, MobileRow, Notes, RulesButton, ScoreChip, Summary, ViewHead, Warn, EmptyRow } from "./KpiBits";
import { dm, dmHm, dmy, errText, n0, pct1, pts, scoreTone, sortRows, toneInk, useSort } from "./kpiUtil";

export default function TurnoverTab({ T: TT, TK, tl, tx, data, ym, mLabel, needle, isAdmin, toast, refetch, onExplain }) {
  const tv = data?.turnover || {};
  const state = tv.state;
  const tot = tv.totals;
  const running = !!tv.read?.running;
  const [view, setView] = usePersistentState("lkpi.tView", "ranking");
  const [sortL, onSortL] = useSort("lkpi.sortT", { key: "rate", dir: "desc" });
  const [sortP, onSortP] = useSort("lkpi.sortTL", { key: "leftOn", dir: "desc" });
  const [rulesOpen, setRulesOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [confirmErr, setConfirmErr] = useState(null);

  // A read finishing is news: say how it ended, once.
  const wasRunning = useRef(false);
  useEffect(() => {
    if (!tv.read) return;
    if (wasRunning.current && !running) {
      const trig = tv.read.last?.trigger || "";
      if (!tv.read.last?.ok) toast.error(fill(TT.tReadFailed, { e: tv.read.last?.error || "?" }));
      else if (trig.startsWith("compute:")) toast.success(fill(TT.tComputed, { month: mLabel }));
      else toast.success(TT.tReadDone);
    }
    wasRunning.current = running;
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  const readM = useMutation({
    mutationFn: () => api.post("/api/turnover/read").then((r) => r.data),
    onSuccess: (r) => { if (r.started) toast.info(TT.tReadStarted); else toast.warning(TT.tReadBusy); refetch(); },
    onError: async (e) => toast.error(fill(TT.tReadFailed, { e: await errText(e) })),
  });
  const computeM = useMutation({
    mutationFn: () => api.post("/api/turnover/compute", { month: ym }).then((r) => r.data),
    onSuccess: (r) => { if (r.started) toast.info(fill(TT.tComputeStarted, { month: mLabel })); else toast.warning(TT.tReadBusy); refetch(); },
    onError: async (e) => toast.error(fill(TT.tFailed, { e: await errText(e) })),
  });
  const computing = running && (tv.read?.last?.trigger || "").startsWith(`compute:${ym}`);
  const computeFailed = !running && tv.read?.last?.ok === false && (tv.read.last.trigger || "").startsWith(`compute:${ym}`);
  const stateM = useMutation({
    mutationFn: (kind) => api.post(`/api/turnover/${kind}`, { month: ym }).then((r) => r.data),
    onSuccess: (_r, kind) => {
      toast.success(fill(kind === "close" ? TT.tClosed : TT.tReopened, { month: mLabel }));
      setConfirm(null); setConfirmErr(null); refetch();
    },
    onError: async (e) => setConfirmErr(await errText(e)),
  });

  const has = (...vals) => !needle || vals.some((v) => v && String(v).toLowerCase().includes(needle));
  const nameBoth = (v) => [v, v ? tl(v) : null];
  const ranking = sortRows((tv.ranking || []).filter((x) => has(x.code, ...nameBoth(x.owner), ...nameBoth(x.brigadir))), sortL, (x, k) => ({
    code: x.code, owner: tl(x.owner || ""), brigadir: tl(x.brigadir || ""),
    working: x.working, left: x.left, rate: x.rate, score: x.score, points: x.points,
  })[k]);
  const leavers = sortRows((tv.leavers || []).filter((p) => has(...nameBoth(p.name), p.code, ...nameBoth(p.owner), p.job, p.reason)), sortP, (p, k) => ({
    name: tl(p.name), code: p.code, owner: p.owner ? tl(p.owner) : "", job: p.job || "",
    hired: p.hired, leftOn: p.left, days: p.days, reason: p.reason || "", counted: p.counted,
  })[k]);

  const closeAt = tv.close_at ? `${dm(tv.close_at.slice(0, 10))} ${tv.close_at.slice(11, 16)}` : "";
  const readBroken = tv.read?.last && tv.read.last.ok === false && !running;

  const notices = [];
  if (tot && ["open", "closing", "closed", "saved"].includes(state)) {
    if (state === "saved") notices.push(TT.nPastApprox);
    if (tv.approx_left) notices.push(fill(TT.nRehired, { n: n0(tv.approx_left) }));
    const unreg = tv.unregistered || [];
    if (unreg.length) {
      const codes = unreg.slice(0, 10).map((u) => u.code).join(", ") + (unreg.length > 10 ? ` +${unreg.length - 10}` : "");
      notices.push(fill(TT.nUnreg, { codes, w: n0(tot.unregistered_working), l: n0(tot.unregistered_left) }));
    }
    if (tot.left_no_owner) notices.push(fill(TT.nNoOwner, { n: n0(tot.left_no_owner) }));
    if (tot.no_people) notices.push(fill(TT.nNoPeople, { n: n0(tot.no_people) }));
    if (tot.other_left) notices.push(fill(TT.nOther, { n: n0(tot.other_left) }));
    if (tv.read?.ok?.reasons === "closed") notices.push(TT.nReasons);
    if (tv.roster_late_days > 1) notices.push(fill(TT.nRosterLate, { n: tv.roster_late_days }));
    if (tv.dropped) notices.push(fill(TT.nDropped, { n: n0(tv.dropped) }));
    if (tv.late?.length) {
      notices.push(fill(TT.nLate, { added: n0(tv.late.filter((x) => x.kind === "added").length), gone: n0(tv.late.filter((x) => x.kind === "gone").length) }));
    }
  }

  const rule = tv.rule;
  const counted = (p) => ({ owner: TT.countedOwner, no_owner: TT.countedNoOwner, no_cell: TT.countedNoCell })[p.counted] || p.counted;

  // The month's state in a few words — the turnover month has a life of its
  // own (open · closing · closed · saved), so it is said here, once.
  const stateMeta = state === "open"
    ? [TK.notOver, closeAt && fill(TK.tvCloses, { at: closeAt })]
    : state === "closing"
      ? (tv.reopened ? [fill(TK.tvReopened, { by: tl(tv.reopened.by), at: dmHm(tv.reopened.at) })]
        : tv.roster_source === "approx" ? [TK.tvClosingApprox, closeAt && fill(TK.tvCloses, { at: closeAt })]
          : [fill(TK.tvClosing, { at: closeAt })])
      : state === "closed"
        ? [fill(TK.tvClosed, { at: dmHm(tv.closed?.at), by: tv.closed?.by === "system" ? TT.bySystem : tl(tv.closed?.by || "") })]
        : state === "saved" ? [fill(TK.tvSaved, { at: dmHm(tv.saved?.at), by: tl(tv.saved?.by || "") })] : [];
  const readMeta = state === "saved" ? null : running
    ? <span className="inline-flex items-center gap-1"><RefreshCw size={11} className="animate-spin" aria-hidden />{TT.readRunning}</span>
    : tv.read?.ok ? fill(TT.readAt, { at: dmHm(tv.read.ok.at) }) : TT.readNever;
  const warnMeta = state === "saved"
    ? (computeFailed ? <Warn>{fill(TT.readFailed, { e: tv.read.last.error || "?" })}</Warn> : null)
    : readBroken ? <Warn>{fill(TT.readFailed, { e: tv.read.last.error || "?" })}</Warn>
      : tv.read?.stale && tv.read?.ok ? <Warn>{TT.readStale}</Warn> : null;

  const actions = (
    <>
      <RulesButton label={TT.rulesBtn} onClick={() => setRulesOpen(true)} />
      {isAdmin && state === "saved" && (
        <Button size="md" variant="secondary" icon={<RefreshCw size={13} className={computing ? "animate-spin" : ""} />}
          loading={computeM.isPending} disabled={running || !tv.configured} onClick={() => computeM.mutate()}>
          {computing ? TT.computing : TT.update}
        </Button>
      )}
      {isAdmin && state !== "saved" && (
        <Button size="md" variant="secondary" icon={<RefreshCw size={13} className={running ? "animate-spin" : ""} />}
          loading={readM.isPending} disabled={running || !tv.configured} onClick={() => readM.mutate()}>{TT.refresh}</Button>
      )}
      {isAdmin && state === "closing" && (
        <Button size="md" variant="secondary" icon={<Lock size={13} />} onClick={() => { setConfirmErr(null); setConfirm("close"); }}>{TT.close}</Button>
      )}
      {isAdmin && state === "closed" && (
        <Button size="md" variant="secondary" icon={<LockOpen size={13} />} onClick={() => { setConfirmErr(null); setConfirm("reopen"); }}>{TT.reopen}</Button>
      )}
    </>
  );
  const summary = (
    <Summary value={tot ? pct1(tot.rate) : "—"}
      label={tot ? `${TK.sumTurnover} · ${fill(TK.sumTurnOf, { l: n0(tot.left), w: n0(tot.working) })}` : TK.sumTurnover}
      meta={[...stateMeta, readMeta, warnMeta]} actions={actions} />
  );

  const head = (right) => (
    <ViewHead value={view} onChange={setView} ariaLabel={TT.title} right={right}
      options={[["ranking", TT.tabLeaders], ["left", TT.tabLeft]]} />
  );

  const openCell = (c) => onExplain("turnover", c);
  const rankingTable = (
    <TableCard head={head(<Count>{fill(TT.nLeaders, { o: n0(tot?.owners ?? 0), c: n0(tot?.owned_cells ?? 0) })}</Count>)}
      footer={notices.length ? <Notes notes={notices} label={fill(TK.notesN, { n: notices.length })} /> : null}
      mobile={ranking.length ? ranking.map((x) => (
        <MobileRow key={x.key} onClick={() => openCell(x)}
          title={<span className="tabular-nums">{x.code} · {tl(x.owner)}</span>}
          sub={x.brigadir ? tl(x.brigadir) : ""}
          foot={fill(TT.exWorkingLeft, { w: n0(x.working), l: n0(x.left) })}
          right={<><span className="text-sm font-semibold tabular-nums" style={{ color: toneInk(scoreTone(x.score)) }}>{pct1(x.rate)}</span><ScoreChip score={x.score} size="sm" /></>} />
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{TT.nothing}</p>}>
      <thead>
        <tr>
          <Th label={TT.colCell} k="code" sort={sortL} onSort={onSortL} />
          <Th label={TT.colOwner} k="owner" sort={sortL} onSort={onSortL} hint={TT.hOwner} />
          <Th label={TT.colBrigadir} k="brigadir" sort={sortL} onSort={onSortL} />
          <Th label={TT.colWorking} k="working" sort={sortL} onSort={onSortL} align="right" hint={TT.hWorking} />
          <Th label={TT.colLeft} k="left" sort={sortL} onSort={onSortL} align="right" hint={TT.hLeft} />
          <Th label={TT.colRate} k="rate" sort={sortL} onSort={onSortL} align="right" hint={TT.hRate} />
          <Th label={TT.colScore} k="score" sort={sortL} onSort={onSortL} align="center" hint={TT.hScore} />
          <Th label={TT.colPoints} k="points" sort={sortL} onSort={onSortL} align="right" hint={TT.hPoints} />
        </tr>
      </thead>
      <tbody>
        {ranking.length === 0 ? <EmptyRow cols={8} text={TT.nothing} /> : ranking.map((x) => (
          <tr key={x.key} className="cursor-pointer" onClick={() => openCell(x)}>
            <td className="px-3 py-2 tabular-nums"><CellLink id={x.id}>{x.code}</CellLink></td>
            <td className="px-3 py-2 whitespace-nowrap">
              <button type="button" className="font-medium text-left hover:underline underline-offset-2 focus-visible:underline outline-none"
                style={{ color: "var(--text-1)" }} onClick={(e) => { e.stopPropagation(); openCell(x); }}>{tl(x.owner)}</button>
            </td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{x.brigadir ? tl(x.brigadir) : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(x.working)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{n0(x.left)}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: toneInk(scoreTone(x.score)) }}
              title={x.rate == null ? TT.noRateHint : undefined}>{pct1(x.rate)}</td>
            <td className="px-3 py-1.5 text-center"><ScoreChip score={x.score} size="sm" /></td>
            <td className="px-3 py-2 text-right tabular-nums">{pts(x.points)}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  const leaversTable = (
    <TableCard head={head(<Count>{fill(TT.nPeople, { n: n0(leavers.length) })}</Count>)}
      wrap
      mobile={leavers.length ? leavers.map((p) => (
        <div key={p.key} className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>{tl(p.name)}</span>
            <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{dmy(p.left)}</span>
          </div>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--text-3)" }}>
            <span className="tabular-nums">{p.code}{p.approx && <span title={TT.approxHint} style={{ color: "var(--status-warn)" }}> ≈</span>}</span>
            <span>{p.owner ? tl(p.owner) : counted(p)}</span>
            {p.job && <span>{tx(p.job)}</span>}
            <span>{tenure(p.days, TT)}</span>
          </div>
          {p.reason && <div className="text-xs mt-0.5" style={{ color: "var(--text-2)" }}>{tx(p.reason)}</div>}
        </div>
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{(tv.leavers || []).length ? TT.nothing : TT.noneLeft}</p>}>
      <thead>
        <tr>
          <Th label={TT.colName} k="name" sort={sortP} onSort={onSortP} />
          <Th label={TT.colCell} k="code" sort={sortP} onSort={onSortP} />
          <Th label={TT.colOwner} k="owner" sort={sortP} onSort={onSortP} hint={TT.hOwner} />
          <Th label={TT.colJob} k="job" sort={sortP} onSort={onSortP} />
          <Th label={TT.colLeftOn} k="leftOn" sort={sortP} onSort={onSortP} align="center" />
          <Th label={TT.colTenure} k="days" sort={sortP} onSort={onSortP} align="right" />
          <Th label={TT.colReason} k="reason" sort={sortP} onSort={onSortP} />
          <Th label={TT.colCounted} k="counted" sort={sortP} onSort={onSortP} />
        </tr>
      </thead>
      <tbody>
        {leavers.length === 0 ? <EmptyRow cols={8} text={(tv.leavers || []).length ? TT.nothing : TT.noneLeft} /> : leavers.map((p) => (
          <tr key={p.key}>
            <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>{tl(p.name)}</td>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap">
              {p.cell_id ? <CellLink id={p.cell_id}>{p.code}</CellLink> : (p.code || "—")}
              {p.approx && <span className="ml-1" title={TT.approxHint} style={{ color: "var(--status-warn)" }}>≈</span>}
            </td>
            <td className="px-3 py-2" style={{ color: p.owner ? "var(--text-2)" : "var(--text-3)" }}>{p.owner ? tl(p.owner) : "—"}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{p.job ? tx(p.job) : "—"}</td>
            <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">{dmy(p.left)}</td>
            <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{tenure(p.days, TT)}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{p.reason ? tx(p.reason) : "—"}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: p.counted === "owner" ? "var(--text-2)" : "var(--status-warn)" }}>{counted(p)}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  let body;
  if (state === "before" || state === "future") {
    body = <EmptyState icon={UserMinus} title={state === "before" ? TT.beforeTitle : mLabel} message={state === "before" ? TT.before : TT.future} showUploadLink={false} />;
  } else if (state === "past") {
    body = (
      <>
        {computeFailed && <p className="mb-3 text-sm text-center" style={{ color: "var(--status-bad)" }}>{fill(TT.readFailed, { e: tv.read.last.error || "?" })}</p>}
        <EmptyState icon={Archive} height="h-auto py-12" title={fill(TT.pastTitle, { month: mLabel })}
          message={!tv.configured ? `${TT.pastMsg} ${TT.notConfMsg}` : isAdmin ? TT.pastMsg : `${TT.pastMsg} ${TT.pastNoAdmin}`}
          showUploadLink={false}
          action={isAdmin && tv.configured ? (
            <Button icon={<Calculator size={14} />} loading={computeM.isPending || computing} disabled={running} onClick={() => computeM.mutate()}>
              {computing ? TT.computing : TT.compute}
            </Button>
          ) : null} />
      </>
    );
  } else if (state !== "saved" && !tv.configured && !tv.read?.ok) {
    body = <EmptyState icon={AlertTriangle} title={TT.notConfTitle} message={TT.notConfMsg} showUploadLink={false} />;
  } else if (state !== "saved" && !tv.read?.ok) {
    body = (
      <>
        <EmptyState icon={RefreshCw} title={running ? TT.readRunning : TT.noReadTitle} message={TT.noReadMsg} showUploadLink={false}
          action={isAdmin && !running ? <Button icon={<RefreshCw size={14} />} loading={readM.isPending} onClick={() => readM.mutate()}>{TT.readNow}</Button> : null} />
      </>
    );
  } else {
    body = (
      <>
        {summary}
        {view === "left" ? leaversTable : rankingTable}
      </>
    );
  }

  return (
    <>
      {body}
      {rulesOpen && rule && <TurnoverRules open onClose={() => setRulesOpen(false)} rule={rule} T={TT} />}
      {confirm && (
        <ConfirmDialog open onCancel={() => { setConfirm(null); setConfirmErr(null); }} onConfirm={() => stateM.mutate(confirm)}
          title={fill(confirm === "close" ? TT.closeTitle : TT.reopenTitle, { month: mLabel })}
          message={confirm === "close" ? TT.closeMsg : TT.reopenMsg}
          confirmLabel={confirm === "close" ? TT.close : TT.reopen} cancelLabel={TT.cancel}
          loading={stateM.isPending} error={confirmErr} />
      )}
    </>
  );
}
