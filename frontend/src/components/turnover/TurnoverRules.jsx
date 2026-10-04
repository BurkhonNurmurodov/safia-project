// «Kadrlar qo'nimsizligi» — the whole rule in words, then the score scale and
// the KPI weight from the rule the month was scored by.
import { BookOpen } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { fill } from "../../pages/turnoverText";
import { weightPct } from "./turnoverUtil";
import { BandScale } from "./TurnoverBits";

export default function TurnoverRules({ open, onClose, rule, T }) {
  return (
    <Modal open={open} onClose={onClose} title={T.rulesTitle} maxWidth="max-w-2xl"
      icon={<BookOpen size={18} style={{ color: "var(--brand-text)" }} />}
      bodyClassName="px-5 py-4 space-y-5"
      footer={<Button variant="secondary" onClick={onClose}>{T.done}</Button>}>
      <div className="rounded-xl px-3 py-2.5 text-sm font-semibold"
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }}>
        {T.formula}
      </div>
      <dl className="space-y-3">
        {T.rules.map(([h, text]) => (
          <div key={h}>
            <dt className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{h}</dt>
            <dd className="text-sm leading-relaxed mt-0.5" style={{ color: "var(--text-2)" }}>{text}</dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2">
        <div className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{T.bandsTitle}</div>
        <BandScale rule={rule} rate={null} T={T} />
        <p className="text-xs" style={{ color: "var(--text-3)" }}>
          {fill(T.kpiLine, { w: weightPct(rule) })} · {T.smallTeam}
        </p>
      </div>
    </Modal>
  );
}
