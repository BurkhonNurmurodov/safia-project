// «Liderlar KPI» — WHY a cell's technologists'-audit score is what it is: the
// month's average, the audits it is the average of (each one dated, its
// division as the audit table names it, its rating tinted the way a month at
// that average would be), the band the average lands in, and the KPI points.
// The figures are the board's own (the row's `audit`, the month's `audit.audits`
// for this cell); nothing is computed here.
import { Calculator, ListChecks } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { fill } from "../../pages/leadersKpiText";
import { ScoreChip } from "./KpiBits";
import { auditScoreOf, bandLines, dmy, fracTone, maxScore, n0, pct1, pts, toneInk, w100 } from "./kpiUtil";

function Scale({ bands, score, max }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {bands.map(([label, s], i) => {
        const hit = score != null && s === score;
        return (
          <span key={i} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs tabular-nums whitespace-nowrap"
            style={{
              border: `1px solid ${hit ? toneInk(fracTone(s, max)) : "var(--border)"}`,
              background: hit ? "var(--bg-inner)" : "transparent",
              color: hit ? "var(--text-1)" : "var(--text-3)", fontWeight: hit ? 600 : 400,
            }}>
            {label || "…"} → <span className="font-semibold" style={{ color: toneInk(fracTone(s, max)) }}>{s}</span>
          </span>
        );
      })}
    </div>
  );
}

export default function AuditExplain({ open, onClose, item, data, T, tx, title, subtitle, zIndex }) {
  const rule = data?.rules?.audit;
  const max = maxScore(data?.rules, "audit");
  const a = item?.audit || {};
  const list = (data?.audit?.audits || []).filter((x) => x.key === item?.key);
  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} maxWidth="max-w-xl" zIndex={zIndex}
      icon={<Calculator size={18} style={{ color: "var(--brand-text)" }} />}
      bodyClassName="px-5 py-4 space-y-4"
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      <section className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-[28px] font-bold tabular-nums leading-none"
            style={{ color: a.pct == null ? "var(--text-4)" : toneInk(fracTone(a.score, max)) }}>
            {a.pct == null ? "—" : pct1(a.pct)}
          </span>
          <ScoreChip score={a.score} max={max} />
        </div>
        {a.pct == null ? (
          <p className="text-sm" style={{ color: "var(--text-2)" }}>{T.auExNone}</p>
        ) : (
          <>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
              {[fill(T.auExFig, { n: n0(a.audits), pct: pct1(a.pct) }),
                a.audits > 1 ? fill(T.auExRange, { min: pct1(a.min), max: pct1(a.max) }) : null].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs" style={{ color: "var(--text-3)" }}>{T.auExMean}</p>
          </>
        )}
        {a.score != null && (
          <p className="text-xs tabular-nums" style={{ color: "var(--text-3)" }}>
            {fill(T.cmPoints, { score: a.score, w: w100(rule), p: pts(a.points) })}
          </p>
        )}
        <Scale bands={bandLines("audit", rule)} score={a.score} max={max} />
      </section>
      {list.length > 0 && (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <ListChecks size={15} style={{ color: "var(--brand-text)" }} aria-hidden />
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
              {T.auExList} <span className="font-normal tabular-nums" style={{ color: "var(--text-3)" }}>· {n0(list.length)}</span>
            </h3>
          </div>
          <ul className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
            {list.map((x, i) => (
              <li key={`${x.date}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm"
                style={{ borderTop: i ? "1px solid var(--border)" : "none" }}>
                <span className="tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{dmy(x.date)}</span>
                <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-2)" }} title={x.division}>
                  {x.division}{x.foreman ? <span style={{ color: "var(--text-3)" }}> · {tx(x.foreman)}</span> : null}
                </span>
                <span className="font-semibold tabular-nums whitespace-nowrap"
                  style={{ color: toneInk(fracTone(auditScoreOf(x.rating, rule), max)) }}>{pct1(x.rating)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </Modal>
  );
}
