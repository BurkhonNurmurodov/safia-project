// «Brigadirlar KPI» — WHY a brigadir's figure is what it is: the cells their
// turnover is made of (and how each was linked to them), who left, and the
// quality-register records behind OKK. Nothing is computed here that the
// server did not send.
import { ClipboardCheck, LayoutGrid, ListChecks, UserMinus } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import CellLink from "../ui/CellLink";
import SegmentedToggle from "../ui/SegmentedToggle";
import { fill } from "../../pages/brigadirsKpiText";
import { dmy, n0, pct1 } from "../kpi/kpiUtil";
import { Verdict } from "./BkpiTabs";

function Section({ icon: Icon, title, count, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={15} style={{ color: "var(--brand-text)" }} aria-hidden />
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
          {title}{count != null && <span className="font-normal tabular-nums" style={{ color: "var(--text-3)" }}> · {count}</span>}
        </h3>
      </div>
      {children}
    </section>
  );
}

function Headline({ value, x, T, lines }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-2xl font-bold tabular-nums" style={{ color: value == null ? "var(--text-4)" : "var(--text-1)" }}>
          {value == null ? "—" : pct1(value)}
        </span>
        <Verdict x={x} T={T} />
      </div>
      {lines.filter(Boolean).map((l, i) => (
        <p key={i} className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>{l}</p>
      ))}
    </div>
  );
}

const Table = ({ head, children }) => (
  <div className="overflow-x-auto rounded-xl" style={{ border: "1px solid var(--border)" }}>
    <table className="w-full text-xs whitespace-nowrap">
      <thead>
        <tr style={{ background: "var(--bg-inner)", color: "var(--text-3)" }}>
          {head.map(([label, align]) => (
            <th key={label} className={`px-3 py-2 font-semibold ${align === "right" ? "text-right" : "text-left"}`}>{label}</th>
          ))}
        </tr>
      </thead>
      <tbody className="[&_tr]:border-t [&_tr]:border-[var(--border)]">{children}</tbody>
    </table>
  </div>
);

function TurnoverPart({ T, tl, tx, row, data }) {
  const t = row.turnover;
  const rule = data?.rule?.turnover || {};
  const cells = (data?.turnover?.cells || []).filter((c) => c.brigadir === row.key)
    .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
  const leavers = (data?.turnover?.leavers || {})[row.key] || [];
  const how = { register: T.howRegister, verifix: T.howVerifix, verifix_unit: T.howVerifixUnit };
  if (!t) return <p className="text-sm" style={{ color: "var(--text-3)" }}>{T.tvPastMsg}</p>;
  return (
    <div className="space-y-5">
      <Headline value={t.value} x={t} T={T} lines={[
        fill(T.threshold, { rule: fill(T.tvRule, { max: rule.max }) }),
        fill(T.method, { m: rule.method === "pooled" ? T.tvMethodPooled : T.tvMethodMean }),
        t.value == null && T.noPeople,
        t.left_unrated ? fill(T.unrated, { n: n0(t.left_unrated) }) : null,
      ]} />
      <Section icon={LayoutGrid} title={T.cellsOf} count={n0(cells.length)}>
        {cells.length === 0 ? <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.noPeople}</p> : (
          <Table head={[[T.colCell], [T.colWorking, "right"], [T.colLeft, "right"], [T.colRate, "right"], [T.colHow]]}>
            {cells.map((c) => (
              <tr key={c.key}>
                <td className="px-3 py-1.5 tabular-nums">
                  {c.id ? <CellLink id={c.id}>{c.code}</CellLink> : c.code}
                  {!c.registered && <span className="ml-2" style={{ color: "var(--text-3)" }} title={c.unit || ""}>{T.unregistered}</span>}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{n0(c.working)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{n0(c.left)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{pct1(c.rate)}</td>
                <td className="px-3 py-1.5" style={{ color: "var(--text-2)" }} title={T.hHow}>{how[c.how] || c.how}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
      <Section icon={UserMinus} title={T.leaversOf} count={n0(leavers.length)}>
        {leavers.length === 0 ? <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.noLeavers}</p> : (
          <Table head={[[T.colName], [T.colCell], [T.colJob], [T.colLeftOn], [T.colReason]]}>
            {leavers.map((p, i) => (
              <tr key={`${p.name}-${i}`}>
                <td className="px-3 py-1.5 font-medium" style={{ color: "var(--text-1)" }}>{tl(p.name)}</td>
                <td className="px-3 py-1.5 tabular-nums">{p.code || "—"}</td>
                <td className="px-3 py-1.5 max-w-[180px] truncate" style={{ color: "var(--text-2)" }} title={p.job || ""}>{p.job ? tx(p.job) : "—"}</td>
                <td className="px-3 py-1.5 tabular-nums">{dmy(p.left)}</td>
                <td className="px-3 py-1.5 max-w-[200px] truncate" style={{ color: "var(--text-2)" }} title={p.reason || ""}>{p.reason ? tx(p.reason) : "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}

function OkkPart({ T, tx, row, data }) {
  const o = row.okk || {};
  const rule = data?.rule?.okk || {};
  const recs = (data?.okk?.records || {})[row.key] || [];
  const spelled = Object.keys((data?.okk?.spellings || {})[row.key] || {});
  const stColor = (s) => (s === "done" ? "var(--status-ok)" : s === "open" || s === "repeat" ? "var(--status-bad)" : s === "waiting" ? "var(--status-warn)" : "var(--text-3)");
  return (
    <div className="space-y-5">
      <Headline value={o.pct} x={o} T={T} lines={[
        fill(T.threshold, { rule: fill(T.okkRule, { min: rule.min }) }),
        o.total ? fill(T.countsLine, { t: n0(o.total), d: n0(o.done), u: n0(o.unresolved), r: n0(o.repeat) }) : T.noRecords,
        (o.not_required || o.hair) ? fill(T.extraLine, { nr: n0(o.not_required || 0), h: n0(o.hair || 0) }) : null,
        spelled.length ? fill(T.spelled, { names: spelled.join(", ") }) : null,
      ]} />
      <Section icon={ListChecks} title={T.recordsOf} count={n0(recs.length)}>
        {recs.length === 0 ? <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.noRecords}</p> : (
          <Table head={[[T.colDate], [T.colRef], [T.colStatus], [T.colProduct], [T.colWhat]]}>
            {recs.map((q) => (
              <tr key={q.id}>
                <td className="px-3 py-1.5 tabular-nums">{dmy(q.date)}</td>
                <td className="px-3 py-1.5 tabular-nums">{q.ref || "—"}</td>
                <td className="px-3 py-1.5 font-medium" style={{ color: stColor(q.status) }}>{T.statuses[q.status] || q.status || "—"}</td>
                <td className="px-3 py-1.5 max-w-[160px] truncate" title={q.product || ""}>{q.product ? tx(q.product) : "—"}</td>
                <td className="px-3 py-1.5 max-w-[320px] truncate" style={{ color: "var(--text-2)" }}
                  title={[q.description, q.action].filter(Boolean).join(" · ")}>
                  {[q.description, q.action].filter(Boolean).map((v) => tx(v)).join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Section>
    </div>
  );
}

export function BrigadirModal({ T, tl, tx, row, data, part, onPart, onClose, mLabel }) {
  const sub = [row.shift ? fill(T.shiftN, { n: row.shift }) : null,
    row.kind === "verifix" ? T.srcVerifix : null, mLabel].filter(Boolean).join(" · ");
  return (
    <Modal open onClose={onClose} title={tl(row.name || "—")} subtitle={sub} maxWidth="max-w-3xl"
      icon={<ClipboardCheck size={18} style={{ color: "var(--brand-text)" }} />}
      footer={<Button variant="secondary" onClick={onClose}>{T.close}</Button>}>
      <SegmentedToggle asTabs value={part} onChange={onPart} ariaLabel={row.name}
        options={[["turnover", T.dlgTurnover], ["okk", T.dlgOkk]]} />
      <div className="pt-2">
        {part === "okk"
          ? <OkkPart T={T} tx={tx} row={row} data={data} />
          : <TurnoverPart T={T} tl={tl} tx={tx} row={row} data={data} />}
      </div>
    </Modal>
  );
}

export function RulesModal({ T, data, onClose }) {
  const r = data?.rule || {};
  const tv = r.turnover || {};
  const ok = r.okk || {};
  return (
    <Modal open onClose={onClose} title={T.rulesTitle} maxWidth="max-w-xl"
      footer={<Button variant="secondary" onClick={onClose}>{T.close}</Button>}>
      <div className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
        <p>{T.rulesIntro}</p>
        <p>{fill(T.rulesTurnover, { m: tv.method === "pooled" ? T.tvMethodPooled : T.tvMethodMean, max: tv.max })}</p>
        <p>{fill(T.rulesOkk, { min: ok.min, hair: ok.skip_hair ? T.rulesHair : "" })}</p>
        <p>{T.rulesWho}</p>
        <p style={{ color: "var(--text-3)" }}>{T.rulesRest}</p>
      </div>
    </Modal>
  );
}
