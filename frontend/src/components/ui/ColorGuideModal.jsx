import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { orderedSegments, formatRange } from "../../utils/segments";

/**
 * Explains what each cell color means on the comparison table / fleet heatmap.
 * Opened by the info icon on those cards.
 *
 * Numeric ranges are derived live from the admin-panel thresholds, and each
 * band's description comes from its admin-entered `desc` for the current
 * language. When a band has no description in that language, only the range is
 * shown.
 *
 * Props:
 *   title    – modal heading
 *   subtitle – small line under the heading
 *   sections – [{ heading, segments }]
 *                segments: [{ from, color, desc: { <lang>: text } }]
 *   onClose
 */
export default function ColorGuideModal({ title, subtitle, sections = [], onClose }) {
  const { lang } = useLang();
  return createPortal(
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", paddingTop: "var(--tg-safe-top, 0px)" }}
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
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-card)", zIndex: 1 }}
        >
          <div>
            <div className="font-bold text-sm" style={{ color: "var(--text-1)" }}>
              {title}
            </div>
            {subtitle && (
              <div className="text-[11px] mt-0.5" style={{ color: "var(--text-4)" }}>
                {subtitle}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 mt-0.5 rounded-lg transition-colors hover:bg-white/10 flex-shrink-0"
            style={{ color: "var(--text-3)" }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Sections */}
        <div className="px-5 py-4 space-y-4">
          {sections.map((section, si) => {
            const rows = orderedSegments(section.segments);
            return (
              <div key={si}>
                {section.heading && (
                  <div
                    className="text-[10px] font-bold uppercase tracking-wider mb-2"
                    style={{ color: "var(--text-3)" }}
                  >
                    {section.heading}
                  </div>
                )}
                <div className="space-y-2">
                  {rows.map((seg, i) => {
                    const desc  = seg.desc?.[lang];
                    const range = formatRange(rows, i);
                    return (
                      <div
                        key={i}
                        className="flex items-start gap-3 rounded-lg px-3 py-2.5"
                        style={{ background: "var(--bg-inner)" }}
                      >
                        <span
                          className="w-4 h-4 rounded-sm flex-shrink-0 mt-0.5"
                          style={{ background: seg.color, border: "1px solid rgba(0,0,0,0.15)" }}
                        />
                        <div className="min-w-0 flex-1">
                          <div
                            className="text-[12px] font-semibold leading-snug"
                            style={{ color: "var(--text-1)" }}
                          >
                            {range}
                          </div>
                          {desc && (
                            <div
                              className="text-[11px] leading-snug mt-0.5"
                              style={{ color: "var(--text-3)" }}
                            >
                              {desc}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
