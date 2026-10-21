import { FileWarning } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import { useOT, fill } from "./ontimeUtil";

const n0 = (n) => Number(n || 0).toLocaleString("ru-RU");

// The rows of the sheet the last read left out — per tab, per reason, with the
// sheet's own row numbers (services/ontime_sync._Skips records them). A read
// from before row numbers were kept still names the tab, the reason and how
// many; its rows appear from the next read.

const span = ([a, b]) => (a === b ? `${a}` : `${a}–${b}`);

function Reason({ r, T }) {
  const rowWords = r.key === "no_material";
  return (
    <div className="rounded-xl px-3 py-2.5 space-y-1.5" style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-sm font-semibold flex-1 min-w-0" style={{ color: "var(--text-1)" }}>{T.skReason[r.key]}</span>
        <span className="text-xs font-semibold tabular-nums" style={{ color: "var(--text-1)" }}>{fill(T.skRowsN, { n: n0(r.n) })}</span>
      </div>
      {r.column && <div className="text-xs" style={{ color: "var(--text-3)" }}>{fill(T.skColumn, { c: r.column })}</div>}
      {r.rows.length > 0 && (
        <div className="text-xs leading-relaxed" style={{ color: "var(--text-2)" }}>
          <span style={{ color: "var(--text-3)" }}>{T.skRows}: </span>
          <span className="tabular-nums break-words">{r.rows.map(span).join(", ")}</span>
          {r.rest > 0 && <span style={{ color: "var(--text-3)" }}> {fill(T.skRest, { n: n0(r.rest) })}</span>}
        </div>
      )}
      {r.values.length > 0 && (
        <div className="flex items-center gap-1 flex-wrap text-xs">
          <span style={{ color: "var(--text-3)" }}>{rowWords ? T.skRowHolds : T.skValues}:</span>
          {r.values.map((v) => (
            <span key={v} className="px-1.5 py-0.5 rounded-md max-w-full truncate" title={v || undefined}
              style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: v ? "var(--text-1)" : "var(--text-3)" }}>
              {v ? `«${v}»` : T.skBlank}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function OntimeSkipped({ tabs, onClose }) {
  const T = useOT();
  const anyUndetailed = tabs.some((t) => !t.detailed);
  return (
    <Modal open onClose={onClose} icon={FileWarning} title={T.skTitle} subtitle={T.skSub} maxWidth="max-w-2xl"
      footer={<Button variant="secondary" size="md" onClick={onClose}>{T.close}</Button>}>
      {tabs.map((t) => (
        <section key={t.key} className="space-y-2">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-1)" }}>{fill(T.skTabHead, { tab: t.tab })}</h3>
            <span className="text-xs" style={{ color: "var(--text-3)" }}>
              {t.read != null ? fill(T.skTabCount, { n: n0(t.n), read: n0(t.read) }) : fill(T.skTabCountOnly, { n: n0(t.n) })}
            </span>
          </div>
          {t.reasons.map((r) => <Reason key={r.key} r={r} T={T} />)}
        </section>
      ))}
      <p className="text-xs" style={{ color: "var(--text-3)" }}>{anyUndetailed ? T.skNoRows : T.skFix}</p>
    </Modal>
  );
}
