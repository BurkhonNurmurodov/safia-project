// «Brigadirlar KPI» — the tabs. Every figure is the board payload's own
// (`services/brigadirs_kpi.py`); nothing here re-derives one, it only filters
// and orders what it shows. Each tab reads the leaders' KPI way: ONE summary,
// then ONE card, and folded under it whatever the month could not count.
import { BadgeCheck, ClipboardList, GraduationCap, Wallet } from "lucide-react";
import EmptyState from "../ui/EmptyState";
import TableCard, { Th } from "../ui/DataTable";
import { fill } from "../../pages/brigadirsKpiText";
import { Count, EmptyRow, MobileRow, Notes, RulesButton, Summary, VerdictChip } from "../kpi/KpiBits";
import { dmHm, n0, pct1, sortRows } from "../kpi/kpiUtil";

// A criterion's verdict, said in words and colour together.
export function Verdict({ x, T }) {
  if (!x) return <span className="text-xs" style={{ color: "var(--text-3)" }}>{T.notYet}</span>;
  if (x.pass == null) return <VerdictChip counted={false}>—</VerdictChip>;
  return <VerdictChip counted compliant={x.pass}>{x.pass ? T.pass : T.fail}</VerdictChip>;
}

// The figure and its verdict on one line — a button onto the brigadir's working.
function FigureCell({ value, x, T, onClick, title }) {
  // No figure and no verdict — one dash, the reason on hover.
  if (value == null && x?.pass == null) {
    return (
      <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} title={title}
        className="rounded-md px-1 -mx-1 outline-none hover:bg-[var(--bg-inner)] focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
        style={{ color: "var(--text-3)" }}>—</button>
    );
  }
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} title={title}
      className="inline-flex items-center gap-2 rounded-md px-1 -mx-1 outline-none hover:bg-[var(--bg-inner)] focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
      <span className="tabular-nums font-semibold" style={{ color: value == null ? "var(--text-3)" : "var(--text-1)" }}>
        {value == null ? "—" : pct1(value)}
      </span>
      <Verdict x={x} T={T} />
    </button>
  );
}

// A brigadir's name, with «Verifix» beside one that is not a unit here.
export function NameCell({ x, T, tl }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <span className="font-medium truncate" style={{ color: "var(--text-1)" }}>{tl(x.name || "—")}</span>
      {x.kind === "verifix" && (
        <span className="text-[11px] px-1.5 py-0.5 rounded-md flex-shrink-0" title={T.srcVerifixHint}
          style={{ background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}>
          {T.srcVerifix}
        </span>
      )}
    </span>
  );
}

const shiftOf = (x, T) => (x.shift ? fill(T.shiftN, { n: x.shift }) : "—");
// A phone row's second line: the shift, or where a Verifix brigadir came from.
const subOf = (x, T) => (x.kind === "verifix" ? T.srcVerifixHint : shiftOf(x, T));

// The notes every tab folds under its table — the same facts, said once each.
export function notesOf(data, T) {
  const n = data?.notes || {};
  const out = [];
  if (n.org && !n.org.ok) out.push(T.nNoOrg);
  if (n.via_verifix) out.push(fill(T.nViaVerifix, { n: n0(n.via_verifix) }));
  if (n.uncredited?.length) {
    const u = n.uncredited;
    out.push(fill(T.nUncredited, {
      codes: u.slice(0, 12).map((c) => c.code).join(", ") + (u.length > 12 ? ` +${u.length - 12}` : ""),
      w: n0(u.reduce((s, c) => s + c.working, 0)), l: n0(u.reduce((s, c) => s + c.left, 0)),
    }));
  }
  if (n.nobody?.length) {
    out.push(fill(T.nNobody, { names: n.nobody.slice(0, 10).map((x) => `${x.name} (${x.count})`).join(", ") + (n.nobody.length > 10 ? ` +${n.nobody.length - 10}` : "") }));
  }
  if (n.no_brigadir) out.push(fill(T.nNoBrigadir, { n: n0(n.no_brigadir) }));
  if ((data?.rows || []).some((x) => x.kind === "verifix")) out.push(T.nVerifixRows);
  return out;
}

function monthMeta(data, T) {
  return data?.state === "open" ? T.notOver : null;
}

// ── the board ────────────────────────────────────────────────────────────────

export function BoardTab({ T, tl, data, rows, sort, onSort, onOpen, onRules }) {
  const live = (data?.kpis || []).filter((k) => k.live).length;
  const notes = notesOf(data, T);
  const passedTone = (x) => (x.passed > 0 ? "var(--text-1)" : "var(--text-3)");
  return (
    <>
      <Summary value={n0(data?.totals?.brigadirs ?? rows.length)} label={T.sumBrigadirs}
        meta={[
          fill(T.liveNote, { n: live, max: live }),
          monthMeta(data, T),
          data?.quality_sync?.at && fill(T.qualityAt, { at: dmHm(data.quality_sync.at) }),
          data?.notes?.org?.at ? fill(T.orgAt, { at: dmHm(data.notes.org.at) }) : T.orgNone,
        ]}
        actions={<RulesButton label={T.rulesBtn} onClick={onRules} />} />
      <TableCard title={T.title} right={<Count>{n0(rows.length)}</Count>}
        footer={notes.length ? <Notes notes={notes} label={fill(T.notesN, { n: notes.length })} /> : null}
        mobile={rows.length ? rows.map((x) => (
          <MobileRow key={x.key} onClick={() => onOpen(x, "turnover")}
            title={tl(x.name || "—")}
            sub={subOf(x, T)}
            foot={`${T.kpi.turnover} ${x.turnover ? pct1(x.turnover.value) : "—"} · ${T.tabs.okk} ${pct1(x.okk?.pct)}`}
            right={<span className="text-sm font-semibold tabular-nums" style={{ color: passedTone(x) }}>{fill(T.passedOf, { n: x.passed, of: x.of })}</span>} />
        )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.noRows}</p>}>
        <thead>
          <tr>
            <Th label={T.colBrigadir} k="name" sort={sort} onSort={onSort} />
            <Th label={T.colShift} k="shift" sort={sort} onSort={onSort} align="center" />
            <Th label={T.kpi.turnover} k="turnover" sort={sort} onSort={onSort} hint={fill(T.tvRule, { max: data?.rule?.turnover?.max })} />
            <Th label={T.kpi.okk} k="okk" sort={sort} onSort={onSort} hint={fill(T.okkRule, { min: data?.rule?.okk?.min })} />
            <Th label={T.kpi.mentoring} align="center" hint={`${T.notYet} — ${T.phBoard}`} />
            <Th label={T.kpi.kru} align="center" hint={`${T.notYet} — ${T.phBoard}`} />
            <Th label={T.colResult} k="passed" sort={sort} onSort={onSort} align="center" hint={T.hResult} />
            <Th label={T.colPayout} align="center" hint={T.hPayout} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? <EmptyRow cols={8} text={T.noRows} /> : rows.map((x) => (
            <tr key={x.key} className="cursor-pointer" onClick={() => onOpen(x, "turnover")}>
              <td className="px-3 py-2 max-w-[320px]"><NameCell x={x} T={T} tl={tl} /></td>
              <td className="px-3 py-2 text-center" style={{ color: "var(--text-2)" }}>{shiftOf(x, T)}</td>
              <td className="px-3 py-1.5">
                {x.turnover
                  ? <FigureCell value={x.turnover.value} x={x.turnover} T={T} onClick={() => onOpen(x, "turnover")} />
                  : <Verdict x={null} T={T} />}
              </td>
              <td className="px-3 py-1.5">
                <FigureCell value={x.okk?.pct} x={x.okk} T={T} onClick={() => onOpen(x, "okk")}
                  title={x.okk?.total ? fill(T.countsLine, { t: x.okk.total, d: x.okk.done, u: x.okk.unresolved, r: x.okk.repeat }) : T.noRecords} />
              </td>
              <td className="px-3 py-2 text-center" style={{ color: "var(--text-3)" }} title={`${T.notYet} — ${T.phBoard}`}>—</td>
              <td className="px-3 py-2 text-center" style={{ color: "var(--text-3)" }} title={`${T.notYet} — ${T.phBoard}`}>—</td>
              <td className="px-3 py-2 text-center tabular-nums font-semibold" style={{ color: passedTone(x) }}>
                {fill(T.passedOf, { n: x.passed, of: x.of })}
              </td>
              <td className="px-3 py-2 text-center" style={{ color: "var(--text-3)" }} title={T.hPayout}>—</td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}

// ── turnover ─────────────────────────────────────────────────────────────────

export function TurnoverTab({ T, tl, data, rows, sort, onSort, onOpen, onRules }) {
  const tv = data?.turnover || {};
  if (!tv.cells) {
    return (
      <EmptyState icon={ClipboardList} height="h-auto py-12" showUploadLink={false}
        title={T.tvPast} message={T.tvPastMsg} />
    );
  }
  const list = sortRows(rows.filter((x) => x.turnover), sort, (x, k) => ({
    name: tl(x.name || ""), shift: x.shift, cells: x.turnover.cells, working: x.turnover.working,
    left: x.turnover.left, rate: x.turnover.value, verdict: x.turnover.pass == null ? -1 : x.turnover.pass ? 1 : 0,
  })[k]);
  const passed = list.filter((x) => x.turnover.pass).length;
  const rule = data?.rule?.turnover || {};
  const notes = notesOf(data, T);
  return (
    <>
      <Summary value={n0(passed)} label={fill(T.tvSum, { of: n0(list.length) })}
        meta={[
          fill(T.tvRule, { max: rule.max }),
          fill(T.method, { m: rule.method === "pooled" ? T.tvMethodPooled : T.tvMethodMean }),
          monthMeta(data, T),
          tv.read?.ok ? fill(T.tvRead, { at: dmHm(tv.read.ok.at) }) : T.tvReadNever,
        ]}
        actions={<RulesButton label={T.rulesBtn} onClick={onRules} />} />
      <TableCard title={T.tvTitle} right={<Count>{n0(list.length)}</Count>}
        footer={notes.length ? <Notes notes={notes} label={fill(T.notesN, { n: notes.length })} /> : null}
        mobile={list.length ? list.map((x) => (
          <MobileRow key={x.key} onClick={() => onOpen(x, "turnover")}
            title={tl(x.name || "—")} sub={subOf(x, T)}
            foot={`${T.colWorking} ${n0(x.turnover.working)} · ${T.colLeft} ${n0(x.turnover.left)}`}
            right={<><span className="text-sm font-semibold tabular-nums">{pct1(x.turnover.value)}</span><Verdict x={x.turnover} T={T} /></>} />
        )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.noRows}</p>}>
        <thead>
          <tr>
            <Th label={T.colBrigadir} k="name" sort={sort} onSort={onSort} />
            <Th label={T.colShift} k="shift" sort={sort} onSort={onSort} align="center" />
            <Th label={T.colCells} k="cells" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colWorking} k="working" sort={sort} onSort={onSort} align="right" hint={T.hWorking} />
            <Th label={T.colLeft} k="left" sort={sort} onSort={onSort} align="right" hint={T.hLeft} />
            <Th label={T.colRate} k="rate" sort={sort} onSort={onSort} align="right" hint={T.hRate} />
            <Th label={T.colVerdict} k="verdict" sort={sort} onSort={onSort} align="center" />
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? <EmptyRow cols={7} text={T.noRows} /> : list.map((x) => (
            <tr key={x.key} className="cursor-pointer" onClick={() => onOpen(x, "turnover")}>
              <td className="px-3 py-2 max-w-[320px]"><NameCell x={x} T={T} tl={tl} /></td>
              <td className="px-3 py-2 text-center" style={{ color: "var(--text-2)" }}>{shiftOf(x, T)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n0(x.turnover.cells)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n0(x.turnover.working)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n0(x.turnover.left)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold"
                title={x.turnover.value == null ? T.noPeople : undefined}>{pct1(x.turnover.value)}</td>
              <td className="px-3 py-1.5 text-center"><Verdict x={x.turnover} T={T} /></td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}

// ── OKK ──────────────────────────────────────────────────────────────────────

export function OkkTab({ T, tl, data, rows, sort, onSort, onOpen, onRules }) {
  const list = sortRows(rows, sort, (x, k) => ({
    name: tl(x.name || ""), shift: x.shift, total: x.okk?.total, done: x.okk?.done,
    unresolved: x.okk?.unresolved, repeat: x.okk?.repeat, pct: x.okk?.pct,
    verdict: x.okk?.pass == null ? -1 : x.okk.pass ? 1 : 0,
  })[k]);
  const passed = list.filter((x) => x.okk?.pass).length;
  const rule = data?.rule?.okk || {};
  const notes = notesOf(data, T);
  return (
    <>
      <Summary value={n0(passed)} label={fill(T.okkSum, { of: n0(list.length) })}
        meta={[
          fill(T.okkRule, { min: rule.min }),
          monthMeta(data, T),
          data?.quality_sync?.at && fill(T.qualityAt, { at: dmHm(data.quality_sync.at) }),
        ]}
        actions={<RulesButton label={T.rulesBtn} onClick={onRules} />} />
      <TableCard title={T.okkTitle} right={<Count>{n0(list.length)}</Count>}
        footer={notes.length ? <Notes notes={notes} label={fill(T.notesN, { n: notes.length })} /> : null}
        mobile={list.length ? list.map((x) => (
          <MobileRow key={x.key} onClick={() => onOpen(x, "okk")}
            title={tl(x.name || "—")} sub={subOf(x, T)}
            foot={fill(T.countsLine, { t: x.okk.total, d: x.okk.done, u: x.okk.unresolved, r: x.okk.repeat })}
            right={<><span className="text-sm font-semibold tabular-nums">{pct1(x.okk.pct)}</span><Verdict x={x.okk} T={T} /></>} />
        )) : <p className="px-4 py-8 text-center text-sm" style={{ color: "var(--text-3)" }}>{T.noRows}</p>}>
        <thead>
          <tr>
            <Th label={T.colBrigadir} k="name" sort={sort} onSort={onSort} />
            <Th label={T.colShift} k="shift" sort={sort} onSort={onSort} align="center" />
            <Th label={T.colTotal} k="total" sort={sort} onSort={onSort} align="right" hint={T.hTotal} />
            <Th label={T.colDone} k="done" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colUnresolved} k="unresolved" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colRepeat} k="repeat" sort={sort} onSort={onSort} align="right" />
            <Th label={T.colOkkPct} k="pct" sort={sort} onSort={onSort} align="right" hint={T.hOkkPct} />
            <Th label={T.colVerdict} k="verdict" sort={sort} onSort={onSort} align="center" />
          </tr>
        </thead>
        <tbody>
          {list.length === 0 ? <EmptyRow cols={8} text={T.noRows} /> : list.map((x) => (
            <tr key={x.key} className="cursor-pointer" onClick={() => onOpen(x, "okk")}>
              <td className="px-3 py-2 max-w-[320px]"><NameCell x={x} T={T} tl={tl} /></td>
              <td className="px-3 py-2 text-center" style={{ color: "var(--text-2)" }}>{shiftOf(x, T)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n0(x.okk.total)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n0(x.okk.done)}</td>
              <td className="px-3 py-2 text-right tabular-nums" style={{ color: x.okk.unresolved ? "var(--status-bad)" : undefined }}>{n0(x.okk.unresolved)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{n0(x.okk.repeat)}</td>
              <td className="px-3 py-2 text-right tabular-nums font-semibold"
                title={x.okk.pct == null ? T.noRecords : undefined}>{pct1(x.okk.pct)}</td>
              <td className="px-3 py-1.5 text-center"><Verdict x={x.okk} T={T} /></td>
            </tr>
          ))}
        </tbody>
      </TableCard>
    </>
  );
}

// ── the three places left for what the platform has no source for ───────────

const PH = {
  mentoring: { Icon: GraduationCap, text: "phMentoring", rule: "phRuleMentoring" },
  kru: { Icon: BadgeCheck, text: "phKru", rule: "phRuleKru" },
  payout: { Icon: Wallet, text: "phPayout", rule: null },
};

export function PlaceholderTab({ T, kind, data }) {
  const p = PH[kind];
  const r = data?.rule?.[kind];
  return (
    <div className="flex flex-col items-center text-center gap-2.5 px-4 py-14 max-w-xl mx-auto">
      <p.Icon size={28} style={{ color: "var(--text-4)" }} aria-hidden />
      <h2 className="text-base font-semibold mt-1" style={{ color: "var(--text-1)" }}>{fill(T.phTitle, { kpi: T.kpi[kind] })}</h2>
      <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{T[p.text]}</p>
      {p.rule && r && (
        <p className="text-xs tabular-nums leading-relaxed" style={{ color: "var(--text-3)" }}>
          {fill(T.phRule, { rule: fill(T[p.rule], { min: r.min }) })}
        </p>
      )}
      <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>{T.phBoard}</p>
    </div>
  );
}

