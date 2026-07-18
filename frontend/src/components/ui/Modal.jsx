import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Canonical modal shell — THE template for every dialog in the app.
 * Structure (matches the Staff/Concerns document modals):
 *   backdrop rgba(0,0,0,0.6) + Telegram safe-top padding
 *   rounded-2xl card, bordered header with title + X close,
 *   scrollable body, bordered footer with right-aligned buttons
 *   (cancel/secondary on the left, primary action on the right).
 *
 * Props:
 *   open        – render nothing when false (optional; you can also
 *                 conditionally render <Modal> yourself)
 *   onClose     – called on backdrop click / X. Omit X by passing null.
 *   title       – header title (string or node). No header when omitted.
 *   subtitle    – small muted line under the title (optional)
 *   icon        – lucide icon element shown before the title (optional)
 *   footer      – right-aligned footer row; pass <Button>s (optional)
 *   maxWidth    – tailwind max-w class for the card (default "max-w-lg")
 *   zIndex      – backdrop z-index (default 50; use 60+ for nested modals)
 *   bodyClassName – body padding/spacing (default "px-5 py-4 space-y-3")
 *   dismissable – set false to ignore backdrop clicks while saving
 */
export default function Modal({
  open = true,
  onClose,
  title,
  subtitle,
  icon = null,
  footer = null,
  maxWidth = "max-w-lg",
  zIndex = 50,
  bodyClassName = "px-5 py-4 space-y-3",
  dismissable = true,
  children,
}) {
  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", zIndex, paddingTop: "calc(var(--tg-safe-top, 0px) + 1rem)" }}
      onClick={() => dismissable && onClose?.()}
    >
      <div
        className={`modal-card w-full ${maxWidth} rounded-2xl flex flex-col overflow-hidden`}
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-md)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
          maxHeight: "90dvh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {title != null && (
          <div
            className="flex items-center justify-between gap-3 px-5 py-4 flex-shrink-0"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {icon}
              <div className="min-w-0">
                <div className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>{title}</div>
                {subtitle && (
                  <div className="text-[11px] mt-0.5 truncate" style={{ color: "var(--text-4)" }}>{subtitle}</div>
                )}
              </div>
            </div>
            {onClose && (
              <button
                onClick={onClose}
                className="hover:text-red-400 transition-colors flex-shrink-0"
                style={{ color: "var(--text-3)" }}
              >
                <X size={18} />
              </button>
            )}
          </div>
        )}

        <div className={`overflow-y-auto ${bodyClassName}`} style={{ flex: "1 1 auto", minHeight: 0 }}>
          {children}
        </div>

        {footer && (
          <div
            className="flex justify-end gap-2 px-5 py-3 flex-shrink-0"
            style={{ borderTop: "1px solid var(--border)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
