// «Liderlar KPI» — the foreign-objects tab: the month's at-fault complaints as
// the one summary (the Quality register's last sync and the admin's refresh on
// its muted line), then the ranking (one row per owned cell, most complaints
// first) or the complaints themselves behind the card's own view switch, and
// folded under the ranking whatever counted toward nobody. Its words are the
// foreign-objects page's own bundle (TF) beside the page's (TK); every figure
// is the board payload's `foreign` half, which IS `foreign_objects.month_payload`.
import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Microscope, RefreshCw } from "lucide-react";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import EmptyState from "../ui/EmptyState";
import TableCard, { Th } from "../ui/DataTable";
import api from "../../utils/api";
import { usePersistentState } from "../../hooks/usePersistentState";
import { fill } from "../../pages/foreignObjectsText";
import ForeignRules from "../foreign/ForeignRules";
import { kindsText, wordOf } from "../foreign/foreignUtil";
import { Count, MobileRow, Notes, RulesButton, ScoreChip, Summary, ViewHead, Warn, EmptyRow } from "./KpiBits";
import { dmHm, dmy, errText, n0, pts, scoreTone, sortRows, toneInk, useSort } from "./kpiUtil";

const LINKS_FROM = "12.10.2026";   // the dated cell links begin here (cell_links)

export default function ForeignTab({ T: TF, TK, tl, tx, data, mLabel, needle, isAdmin, toast, refetch, onExplain }) {
  const qc = useQueryClient();
  const fo = data?.foreign || {};
  const state = fo.state;
  const tot = fo.totals;
  const rule = fo.rule;
  const [view, setView] = usePersistentState("lkpi.fView", "ranking");
  const [sortL, onSortL] = useSort("lkpi.sortF", { key: "count", dir: "desc" });
  const [sortP, onSortP] = useSort("lkpi.sortFC", { key: "date", dir: "desc" });
  const [rulesOpen, setRulesOpen] = useState(false);

  // An admin re-pulls the Quality register — the Quality page's own refresh.
  const refreshM = useMutation({
    mutationFn: () => api.post("/api/foreign-objects/refresh").then((r) => r.data),
    onSuccess: () => {
      toast.success(TF.tRefreshDone);
      qc.invalidateQueries({ queryKey: ["quality"] });
      refetch();
    },
    onError: async (e) => toast.error(fill(TF.tRefreshFail, { e: await errText(e) })),
  });

  const has = (...vals) => !needle || vals.some((v) => v && String(v).toLowerCase().includes(needle));
  const nameBoth = (v) => [v, v ? tl(v) : null];
  const kindWord = (k) => wordOf(TF, "kinds", k, tx);
  const srcWord = (s) => wordOf(TF, "sources", s, tx);
  const stWord = (s) => wordOf(TF, "statuses", s, tx);

  const ranking = useMemo(() => {
    const rows = (fo.ranking || []).filter((x) => has(x.code, ...nameBoth(x.owner), ...nameBoth(x.brigadir)));
    return sortRows(rows, sortL, (x, k) => ({
      code: x.code, owner: tl(x.owner || ""), brigadir: tl(x.brigadir || ""),
      count: x.count, kinds: kindsText(x.kinds, TF, tx), score: x.score, points: x.points,
    })[k]);
  }, [fo.ranking, needle, sortL, TF]); // eslint-disable-line react-hooks/exhaustive-deps

  const complaints = useMemo(() => {
    const rows = (fo.complaints || []).filter((c) => has(c.code, ...nameBoth(c.owner), c.product, c.place,
      kindWord(c.kind), srcWord(c.source), c.ref_no));
    return sortRows(rows, sortP, (c, k) => ({
      date: c.date, code: c.code, owner: c.owner ? tl(c.owner) : "", kind: kindWord(c.kind), source: srcWord(c.source),
      product: c.product ? tx(c.product) : "", place: c.place ? tx(c.place) : "", status: stWord(c.status),
      counted: c.counted,
    })[k]);
  }, [fo.complaints, needle, sortP, TF]); // eslint-disable-line react-hooks/exhaustive-deps

  const syncBroken = fo.sync && fo.sync.ok === false;

  const notices = [];
  if (tot && ["open", "ended"].includes(state)) {
    if (fo.approx_owners) notices.push(fill(TF.nApprox, { date: LINKS_FROM }));
    if (tot.fault_no_owner) notices.push(fill(TF.nNoOwner, { n: n0(tot.fault_no_owner) }));
    const unreg = fo.unregistered || [];
    if (unreg.length) {
      const codes = unreg.slice(0, 10).map((u) => u.code || "—").join(", ") + (unreg.length > 10 ? ` +${unreg.length - 10}` : "");
      notices.push(fill(TF.nUnreg, { codes, n: n0(tot.fault_no_cell) }));
    }
    if (tot.not_fault) notices.push(fill(TF.nNotFault, { n: n0(tot.not_fault) }));
    if (tot.unknown) notices.push(fill(TF.nUnknown, { n: n0(tot.unknown) }));
  }

  const counted = (c) => ({
    owner: TF.countedOwner, no_owner: TF.countedNoOwner, no_cell: TF.countedNoCell,
    not_fault: TF.countedNotFault, unknown: TF.countedUnknown,
  })[c.counted] || c.counted;

  const summary = (
    <Summary value={tot ? n0(tot.fault) : "—"}
      label={tot ? `${TK.sumForeign} · ${fill(TK.sumForeignOf, { n: n0(tot.complaints) })}` : TK.sumForeign}
      meta={[
        state === "open" && TK.notOver,
        refreshM.isPending
          ? <span className="inline-flex items-center gap-1"><RefreshCw size={11} className="animate-spin" aria-hidden />{fo.sync?.at ? fill(TF.syncAt, { at: dmHm(fo.sync.at) }) : TF.syncNever}</span>
          : fo.sync?.at ? fill(TF.syncAt, { at: dmHm(fo.sync.at) }) : TF.syncNever,
        syncBroken && <Warn>{fill(TF.syncFailed, { e: fo.sync.message || "?" })}</Warn>,
      ]}
      actions={(
        <>
          <RulesButton label={TF.rulesBtn} onClick={() => setRulesOpen(true)} />
          {isAdmin && (
            <Button size="md" variant="secondary" icon={<RefreshCw size={13} className={refreshM.isPending ? "animate-spin" : ""} />}
              loading={refreshM.isPending} onClick={() => refreshM.mutate()}>
              {TF.refresh}
            </Button>
          )}
        </>
      )} />
  );

  const head = (right) => (
    <ViewHead value={view} onChange={setView} ariaLabel={TF.title} right={right}
      options={[["ranking", TF.tabRanking], ["complaints", TF.tabComplaints]]} />
  );

  const openCell = (c) => onExplain("foreign", c);
  const kindsCell = (x) => {
    const s = kindsText(x.kinds, TF, tx);
    return s ? <span className="block max-w-[16rem] truncate" title={s}>{s}</span> : <span style={{ color: "var(--text-4)" }}>—</span>;
  };

  const rankingTable = (
    <TableCard head={head(<Count>{fill(TF.nLeaders, { o: n0(tot?.owners ?? 0), c: n0(tot?.owned_cells ?? 0) })}</Count>)}
      footer={notices.length ? <Notes notes={notices} label={fill(TK.notesN, { n: notices.length })} /> : null}
      mobile={ranking.length ? ranking.map((x) => (
        <MobileRow key={x.key} onClick={() => openCell(x)}
          title={<span className="tabular-nums">{x.code} · {tl(x.owner)}</span>}
          sub={x.brigadir ? tl(x.brigadir) : ""}
          foot={x.count ? kindsText(x.kinds, TF, tx) : null}
          right={<><span className="text-sm font-semibold tabular-nums" style={{ color: toneInk(scoreTone(x.score)) }}>{n0(x.count)}</span><ScoreChip score={x.score} size="sm" /></>} />
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{TF.nothing}</p>}>
      <thead>
        <tr>
          <Th label={TF.colCell} k="code" sort={sortL} onSort={onSortL} />
          <Th label={TF.colOwner} k="owner" sort={sortL} onSort={onSortL} hint={TF.hOwner} />
          <Th label={TF.colBrigadir} k="brigadir" sort={sortL} onSort={onSortL} />
          <Th label={TF.colCount} k="count" sort={sortL} onSort={onSortL} align="right" hint={TF.hCount} />
          <Th label={TF.colKinds} k="kinds" sort={sortL} onSort={onSortL} hint={TF.hKinds} />
          <Th label={TF.colScore} k="score" sort={sortL} onSort={onSortL} align="center" hint={TF.hScore} />
          <Th label={TF.colPoints} k="points" sort={sortL} onSort={onSortL} align="right" hint={TF.hPoints} />
        </tr>
      </thead>
      <tbody>
        {ranking.length === 0 ? <EmptyRow cols={7} text={TF.nothing} /> : ranking.map((x) => (
          <tr key={x.key} className="cursor-pointer" onClick={() => openCell(x)}>
            <td className="px-3 py-2 tabular-nums"><CellLink id={x.id}>{x.code}</CellLink></td>
            <td className="px-3 py-2 whitespace-nowrap">
              <button type="button" className="font-medium text-left hover:underline underline-offset-2 focus-visible:underline outline-none"
                style={{ color: "var(--text-1)" }} onClick={(e) => { e.stopPropagation(); openCell(x); }}>
                {tl(x.owner)}
              </button>
            </td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{x.brigadir ? tl(x.brigadir) : "—"}</td>
            <td className="px-3 py-2 text-right tabular-nums font-semibold" style={{ color: toneInk(scoreTone(x.score)) }}>{n0(x.count)}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>{kindsCell(x)}</td>
            <td className="px-3 py-1.5 text-center"><ScoreChip score={x.score} size="sm" /></td>
            <td className="px-3 py-2 text-right tabular-nums">{pts(x.points)}</td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  const complaintsTable = (
    <TableCard head={head(<Count>{fill(TF.nRows, { n: n0(complaints.length) })}</Count>)}
      mobile={complaints.length ? complaints.map((c) => (
        <div key={c.id} className="px-4 py-3" style={{ borderTop: "1px solid var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="text-sm font-medium" style={{ color: "var(--text-1)" }}>
              {kindWord(c.kind)}{c.product && <span className="font-normal" style={{ color: "var(--text-2)" }}> · {tx(c.product)}</span>}
            </span>
            <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{dmy(c.date)}</span>
          </div>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--text-3)" }}>
            <span className="tabular-nums">{c.code || "—"}</span>
            <span>{c.owner ? tl(c.owner) : counted(c)}</span>
            <span>{srcWord(c.source)}</span>
            {c.place && <span>{tx(c.place)}</span>}
            <span style={{ color: c.counted === "owner" ? "var(--text-3)" : "var(--status-warn)" }}>{counted(c)}</span>
          </div>
          {c.description && <div className="text-xs mt-1 leading-snug" style={{ color: "var(--text-2)" }}>{tx(c.description)}</div>}
        </div>
      )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{(fo.complaints || []).length ? TF.nothing : TF.noneComplaints}</p>}>
      <thead>
        <tr>
          <Th label={TF.colDate} k="date" sort={sortP} onSort={onSortP} align="center" />
          <Th label={TF.colCell} k="code" sort={sortP} onSort={onSortP} />
          <Th label={TF.colOwner} k="owner" sort={sortP} onSort={onSortP} hint={TF.hOwner} />
          <Th label={TF.colKind} k="kind" sort={sortP} onSort={onSortP} />
          <Th label={TF.colSource} k="source" sort={sortP} onSort={onSortP} />
          <Th label={TF.colProduct} k="product" sort={sortP} onSort={onSortP} />
          <Th label={TF.colPlace} k="place" sort={sortP} onSort={onSortP} />
          <Th label={TF.colCounted} k="counted" sort={sortP} onSort={onSortP} />
          <Th label={TF.colStatus} k="status" sort={sortP} onSort={onSortP} />
          <Th label={TF.colDescription} />
        </tr>
      </thead>
      <tbody>
        {complaints.length === 0 ? <EmptyRow cols={10} text={(fo.complaints || []).length ? TF.nothing : TF.noneComplaints} /> : complaints.map((c) => (
          <tr key={c.id}>
            <td className="px-3 py-2 text-center tabular-nums whitespace-nowrap">{dmy(c.date)}</td>
            <td className="px-3 py-2 tabular-nums whitespace-nowrap">{c.cell_id ? <CellLink id={c.cell_id}>{c.code}</CellLink> : (c.code || "—")}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: c.owner ? "var(--text-2)" : "var(--text-3)" }}>{c.owner ? tl(c.owner) : "—"}</td>
            <td className="px-3 py-2 whitespace-nowrap font-medium" style={{ color: "var(--text-1)" }}>{kindWord(c.kind)}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{srcWord(c.source)}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
              <span className="block max-w-[12rem] truncate" title={c.product ? tx(c.product) : ""}>{c.product ? tx(c.product) : "—"}</span>
            </td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
              <span className="block max-w-[9rem] truncate" title={c.place ? tx(c.place) : ""}>{c.place ? tx(c.place) : "—"}</span>
            </td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: c.counted === "owner" ? "var(--text-2)" : "var(--status-warn)" }}>{counted(c)}</td>
            <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-2)" }}>{c.status ? stWord(c.status) : "—"}</td>
            <td className="px-3 py-2" style={{ color: "var(--text-2)" }}>
              <span className="block max-w-[20rem] truncate" title={c.description ? tx(c.description) : ""}>{c.description ? tx(c.description) : "—"}</span>
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );

  let body;
  if (state === "before" || state === "future") {
    body = (
      <EmptyState icon={Microscope} title={state === "before" ? TF.beforeTitle : mLabel}
        message={state === "before" ? TF.before : TF.future} showUploadLink={false} />
    );
  } else if (!fo.sync?.at) {
    body = (
      <>
        <EmptyState icon={RefreshCw} title={TF.noSyncTitle} message={TF.noSyncMsg} showUploadLink={false}
          action={isAdmin ? (
            <Button icon={<RefreshCw size={14} />} loading={refreshM.isPending} onClick={() => refreshM.mutate()}>{TF.refresh}</Button>
          ) : null} />
      </>
    );
  } else {
    body = (
      <>
        {summary}
        {view === "complaints" ? complaintsTable : rankingTable}
      </>
    );
  }

  return (
    <>
      {body}
      {rulesOpen && rule && <ForeignRules open onClose={() => setRulesOpen(false)} rule={rule} T={TF} />}
    </>
  );
}
