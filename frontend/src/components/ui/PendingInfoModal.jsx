import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";

// One marker per blocking reason — the grid cells, their tooltips and this
// modal must always agree, so the maps live here and both chart components
// import them instead of hardcoding ⏳.
//   not_closed   – attendance uploaded, supervisor hasn't closed the day
//   requests     – day closed, edit requests still await the admin
//   no_headcount – day confirmed, «Odam soni» sheet data not loaded yet
export const PENDING_ICONS = {
  not_closed:   "⏳",
  requests:     "⏳",
  no_headcount: "👥",
};
export const PENDING_MSG_KEYS = {
  not_closed:   "zagruzka.pendingNotClosed",
  requests:     "zagruzka.pendingRequests",
  no_headcount: "zagruzka.pendingNoHeadcount",
};
const PENDING_TITLE_KEYS = {
  not_closed:   "zagruzka.pendingTitle",
  requests:     "zagruzka.pendingTitle",
  no_headcount: "zagruzka.pendingNoHcTitle",
};

/**
 * Explains why a heatmap/comparison cell shows a waiting marker instead of data.
 *
 * Props:
 *   managerName – brigadir name (raw, transliterated for display)
 *   date        – "dd.mm.yyyy"
 *   reason      – "not_closed" | "requests" | "no_headcount"
 *   onClose
 */
export default function PendingInfoModal({ managerName, date, reason, onClose }) {
  const { t } = useLang();
  const { tl } = useTranslit();
  return createPortal(
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", paddingTop: "var(--tg-safe-top, 0px)" }}
      onClick={onClose}
    >
      <div
        className="rounded-2xl w-full max-w-sm shadow-2xl"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}
        onClick={e => e.stopPropagation()}
      >
        <div
          className="flex items-start justify-between px-5 py-4"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <div>
            <div
              className="text-[10px] uppercase tracking-wider font-semibold mb-0.5"
              style={{ color: "var(--text-4)" }}
            >
              {tl(managerName)} · {date}
            </div>
            <div className="font-bold text-sm" style={{ color: "var(--text-1)" }}>
              ⏳ {t("zagruzka.pendingTitle")}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 mt-0.5 rounded-lg transition-colors hover:bg-white/10"
            style={{ color: "var(--text-3)" }}
          >
            <X size={16} />
          </button>
        </div>
        <div className="px-5 py-4 text-[12px] leading-relaxed" style={{ color: "var(--text-2)" }}>
          {reason === "requests"
            ? t("zagruzka.pendingRequests")
            : t("zagruzka.pendingNotClosed")}
        </div>
      </div>
    </div>,
    document.body
  );
}
