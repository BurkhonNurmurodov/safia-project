// «Yot jismlar» — WHY a cell's score is what it is: the count, the band it
// lands in, the KPI points, then every complaint behind the count and every
// complaint written against the cell that was NOT counted (and why). Nothing
// is computed here that the server did not send.
import { Calculator, CircleAlert, CircleOff } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { fill } from "../../pages/foreignObjectsText";
import { dmy, n0, pts, scoreTone, toneInk, weightPct, wordOf } from "./foreignUtil";
import { CountScale, ScoreChip } from "./ForeignBits";

function Section({ icon: Icon, title, count, caption, children }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center gap-2">
        <Icon size={15} style={{ color: "var(--brand-text)" }} aria-hidden />
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>
          {title}{count != null && <span className="font-normal tabular-nums" style={{ color: "var(--text-3)" }}> · {count}</span>}
        </h3>
      </div>
      {caption && <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)" }}>{caption}</p>}
      {children}
    </section>
  );
}

function ComplaintList({ rows, T, tx, reason }) {
  if (!rows.length) return <p className="text-sm" style={{ color: "var(--text-3)" }}>{T.exNone}</p>;
  return (
    <ul className="divide-y rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", borderColor: "var(--border)" }}>
      {rows.map((c) => (
        <li key={c.id} className="px-3 py-2 text-sm" style={{ borderColor: "var(--border)" }}>
          <div className="flex items-start justify-between gap-3">
            <span className="font-medium" style={{ color: "var(--text-1)" }}>
              {wordOf(T, "kinds", c.kind, tx)}
              {c.product && <span className="font-normal" style={{ color: "var(--text-2)" }}> · {tx(c.product)}</span>}
            </span>
            <span className="tabular-nums whitespace-nowrap" style={{ color: "var(--text-2)" }}>{dmy(c.date)}</span>
          </div>
          <div className="text-xs mt-0.5 flex flex-wrap gap-x-2" style={{ color: "var(--text-3)" }}>
            <span>{wordOf(T, "sources", c.source, tx)}</span>
            {c.place && <span>{tx(c.place)}</span>}
            {c.status && <span>{T.exStatus}: {wordOf(T, "statuses", c.status, tx)}</span>}
            {c.ref_no && <span className="tabular-nums">№ {c.ref_no}</span>}
            {reason && <span style={{ color: "var(--status-warn)" }}>{reason(c)}</span>}
          </div>
          {c.description && (
            <p className="text-xs mt-1 leading-relaxed" style={{ color: "var(--text-2)" }}>{tx(c.description)}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

export default function ForeignExplain({ open, onClose, item, data, T, tx, title, subtitle, zIndex }) {
  const rule = data.rule;
  const w = weightPct(rule);
  const count = item.count ?? 0;
  const score = item.score ?? null;
  const points = item.points ?? null;
  const provisional = data.state === "open";
  const rows = (data.complaints || []).filter((c) => c.cell_key === item.key);
  const counted = rows.filter((c) => c.counted === "owner" || c.counted === "no_owner");
  const other = rows.filter((c) => c.counted !== "owner" && c.counted !== "no_owner");

  return (
    <Modal open={open} onClose={onClose} title={title} subtitle={subtitle} maxWidth="max-w-2xl" zIndex={zIndex}
      icon={<Calculator size={18} style={{ color: "var(--brand-text)" }} />}
      bodyClassName="px-5 py-4 space-y-6"
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      {/* 1 — the arithmetic, with the real numbers in it */}
      <Section icon={Calculator} title={T.exCalc}>
        <div className="rounded-xl p-3 space-y-3" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
          <div className="text-base font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>
            {fill(T.exCount.split("{score}")[0], { n: n0(count) })}
            <span style={{ color: toneInk(scoreTone(score)) }}>{score ?? "—"}</span>
            {T.exCount.split("{score}")[1] || ""}
          </div>
          <CountScale rule={rule} count={count} T={T} />
          <div className="flex items-center gap-2 text-sm" style={{ color: "var(--text-2)" }}>
            <ScoreChip score={score} size="sm" />
            {points != null && (
              <span className="tabular-nums">{fill(T.exPoints, { score, w, p: pts(points) })}</span>
            )}
          </div>
          {provisional && <p className="text-xs" style={{ color: "var(--status-warn)" }}>{T.provisional}</p>}
        </div>
      </Section>

      {/* 2 — the complaints behind the count */}
      <Section icon={CircleAlert} title={T.exCounted} count={n0(counted.length)} caption={T.exWhyCounted}>
        <ComplaintList rows={counted} T={T} tx={tx} />
      </Section>

      {/* 3 — written against the cell, not counted */}
      {other.length > 0 && (
        <Section icon={CircleOff} title={T.exOther} count={n0(other.length)} caption={T.exWhyOther}>
          <ComplaintList rows={other} T={T} tx={tx}
            reason={(c) => (c.fault === false ? `${T.colFault}: ${T.faultNo}` : `${T.colFault}: ${T.faultBlank}`)} />
        </Section>
      )}
    </Modal>
  );
}
