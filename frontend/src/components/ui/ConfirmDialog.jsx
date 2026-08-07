import { createPortal } from "react-dom";
import { AlertTriangle, Trash2 } from "lucide-react";
import Button from "./Button";

/**
 * Canonical confirmation dialog — THE template for every "are you sure"
 * prompt (delete, close day, irreversible actions). Structure matches the
 * Daily close-confirm: icon chip + bold title, muted message, right-aligned
 * cancel (secondary) + confirm (primary/danger) buttons.
 *
 * Props:
 *   open         – render nothing when false
 *   onCancel     – backdrop click / cancel button
 *   onConfirm    – confirm button
 *   title        – bold heading
 *   message      – muted explanation text (string or node, optional)
 *   confirmLabel / cancelLabel – button labels (pass page translations)
 *   tone         – "warning" (amber chip, brand confirm — default)
 *                  "danger"  (red chip, red confirm — deletions)
 *   icon         – override the chip icon (lucide element, optional)
 *   loading      – disables both buttons, spinner on confirm
 *   zIndex       – default 100 so it sits above form modals
 */
export default function ConfirmDialog({
  open = true,
  onCancel,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  tone = "warning",
  icon = null,
  loading = false,
  zIndex = 100,
}) {
  if (!open) return null;

  const chip = tone === "danger"
    ? { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444" }
    : { background: "#f59e0b22", border: "1px solid #f59e0b55", color: "#d97706" };
  const defaultIcon = tone === "danger" ? <Trash2 size={20} /> : <AlertTriangle size={20} />;

  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", zIndex, paddingTop: "calc(var(--tg-safe-top, 0px) + 1rem)" }}
      onClick={() => !loading && onCancel?.()}
    >
      <div
        className="modal-card rounded-2xl p-6 w-full max-w-md"
        style={{
          background: "var(--bg-card)",
          border: "1px solid var(--border-md)",
          boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={chip}>
            {icon ?? defaultIcon}
          </div>
          <div className="text-sm font-bold" style={{ color: "var(--text-1)" }}>{title}</div>
        </div>
        {message && (
          <p className="text-xs leading-relaxed mb-5" style={{ color: "var(--text-3)" }}>{message}</p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
