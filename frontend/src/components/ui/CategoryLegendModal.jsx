import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { CATS, catColor, iconFor } from "../idle/categories";

/**
 * Explains what EVERY ojidaniya category means — the platform's glossary, not a
 * view of the data on screen.
 *
 * It lists `CATS` (the canonical A→Z set) in full, whatever the caller passes.
 * A category nobody has filed minutes for yet is exactly the one a reader needs
 * explained, and `/api/downtime` builds its `cat_names` from the rows that
 * exist — so a data-driven legend silently omits every new category until
 * somebody has already used it, which is how Cat A2 shipped invisible here on
 * 2026-09-03. `kpi_only` drops Cat H from the chart for the same reason and it
 * is likewise still explained.
 *
 * Props:
 *   catNames  – the categories on the chart, in its own order (optional). Used
 *               only to keep each one's on-chart colour and to surface a name
 *               that is NOT canonical — never to shorten the list.
 *   catColors – colour per category, parallel to catNames (optional).
 *   onClose
 *
 * Each category's label + note live in translations.js under
 * `downtime.cat.<CODE>.label` / `.note`, where CODE is the name minus the
 * "Cat " prefix (A, A2, B, C, D, D2, D3, E, F, G, H, I) — all four languages.
 *
 * The icon comes from `iconFor` in components/idle/categories.js. This file
 * used to keep its own copy of that table, so adding a category meant editing
 * two lists that nothing checked against each other.
 */
export default function CategoryLegendModal({ catNames = [], catColors = [], onClose }) {
  const { t } = useLang();
  const code = (name) => name.replace(/^Cat\s*/i, "");

  // Every canonical category, plus anything the caller carries that this build
  // has never heard of — a category with data must never be hidden by a list
  // the frontend has not caught up with.
  const known = CATS.map((c) => c.name);
  const names = [...known, ...catNames.filter((n) => !known.includes(n))];
  // The chart's own hue wins for what is on it, so legend and doughnut match;
  // everything else takes its canonical identity hue.
  const hueOf = (name) => {
    const i = catNames.indexOf(name);
    return (i >= 0 && catColors[i]) || catColor(name) || "#888";
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", paddingTop: "var(--tg-safe-top, 0px)", paddingBottom: "calc(var(--tg-safe-bottom, 0px) + 1rem)" }}
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
          {names.map((name) => {
            const c = hueOf(name);
            const Icon = iconFor(code(name));
            return (
              <div
                key={name}
                className="rounded-lg px-3 py-2.5 flex gap-3"
                style={{ background: "var(--bg-inner)" }}
              >
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}
                >
                  <Icon size={18} strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
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
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
