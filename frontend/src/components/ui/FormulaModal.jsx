import { X } from "lucide-react";
import { useLang } from "../../context/LangContext";

/**
 * Explains how a metric is calculated.
 *
 * Props:
 *   title   – metric name
 *   value   – displayed value (string)
 *   formula – formula string (multi-line supported via \n)
 *   inputs  – [{ label, val, note?, source? }]
 *   onClose
 */
export default function FormulaModal({ title, value, formula, inputs, onClose }) {
  const { t } = useLang();
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", paddingTop: "var(--tg-safe-top, 0px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-sm shadow-2xl"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-md)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <div
              className="text-[10px] uppercase tracking-wider font-semibold mb-0.5"
              style={{ color: "var(--text-4)" }}
            >
              {t("formula.howCalc")}
            </div>
            <div className="font-bold text-sm" style={{ color: "var(--text-1)" }}>{title}</div>
            {value && (
              <div
                className="text-lg font-bold font-mono mt-0.5"
                style={{ color: "var(--brand-text)" }}
              >
                {value}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 mt-0.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: "var(--text-3)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Formula */}
        {formula && (
          <div
            className="px-5 py-4"
            style={{ borderBottom: inputs?.length ? "1px solid var(--border)" : "none" }}
          >
            <div
              className="text-[10px] uppercase tracking-wider font-semibold mb-2"
              style={{ color: "var(--text-4)" }}
            >
              {t("formula.formula")}
            </div>
            <div
              className="text-[11px] font-mono rounded-lg px-3 py-2.5 leading-relaxed whitespace-pre-line"
              style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}
            >
              {formula}
            </div>
          </div>
        )}

        {/* Inputs / Values used */}
        {inputs?.length > 0 && (
          <div className="px-5 py-4">
            <div
              className="text-[10px] uppercase tracking-wider font-semibold mb-2"
              style={{ color: "var(--text-4)" }}
            >
              {t("formula.valuesUsed")}
            </div>
            <div className="space-y-1.5">
              {inputs.map(({ label, val, note, source }) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2"
                  style={{ background: "var(--bg-inner)" }}
                >
                  <div className="min-w-0">
                    <div className="text-[11px]" style={{ color: "var(--text-2)" }}>{label}</div>
                    {source && (
                      <div className="text-[10px]" style={{ color: "var(--text-4)" }}>{source}</div>
                    )}
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <span
                      className="text-[11px] font-mono font-semibold"
                      style={{ color: "var(--text-1)" }}
                    >
                      {val}
                    </span>
                    {note && (
                      <span className="text-[10px] ml-1" style={{ color: "var(--text-4)" }}>
                        {note}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
