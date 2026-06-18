import { X } from "lucide-react";
import { useLang } from "../../context/LangContext";

/**
 * Explains what each downtime category (Cat A … Cat G) means.
 * Opened by the info icon on the "Toifalar Ulushi" doughnut chart.
 *
 * Props:
 *   catNames  – ["Cat A", "Cat B", …] in the same order as the doughnut
 *   catColors – colour per category (parallel to catNames)
 *   onClose
 *
 * Each category's label + note live in translations.js under
 * `downtime.cat.<CODE>.label` / `.note`, where CODE is the name minus the
 * "Cat " prefix (A, B, C, D, D2, D3, E, F, G) — so all four languages work.
 */
export default function CategoryLegendModal({ catNames = [], catColors = [], onClose }) {
  const { t } = useLang();
  const code = (name) => name.replace(/^Cat\s*/i, "");

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.65)", paddingTop: "var(--tg-safe-top, 0px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-md shadow-2xl"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-md)",
          maxHeight: "85vh",
          overflowY: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-start justify-between px-5 py-4 sticky top-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)" }}
        >
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--text-1)" }}>
              {t("downtime.catGuide")}
            </div>
            <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>
              {t("downtime.catGuideSub")}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 mt-0.5 rounded-lg transition-colors hover:bg-white/10 flex-shrink-0"
            style={{ color: "var(--text-3)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Category list */}
        <div className="px-5 py-4 space-y-2.5">
          {catNames.map((name, i) => {
            const c = catColors[i] || "#888";
            return (
              <div
                key={name}
                className="rounded-lg px-3 py-2.5"
                style={{ background: "var(--bg-inner)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0"
                    style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}
                  >
                    {name}
                  </span>
                  <span
                    className="text-[12px] font-semibold leading-snug"
                    style={{ color: "var(--text-1)" }}
                  >
                    {t(`downtime.cat.${code(name)}.label`)}
                  </span>
                </div>
                <div
                  className="text-[11px] leading-snug"
                  style={{ color: "var(--text-3)" }}
                >
                  {t(`downtime.cat.${code(name)}.note`)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
