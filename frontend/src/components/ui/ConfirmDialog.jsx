import { createElement, isValidElement, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Trash2, XCircle } from "lucide-react";
import Button from "./Button";
import { useLang } from "../../context/LangContext";
import { isTopLayer, useDialogLayer } from "./dialogLayers";

// `icon` may be an ELEMENT (<Sparkles size={16} />) or the COMPONENT itself
// (Sparkles). SectionHead / TableCard / EmptyState take the component and render
// it; this one renders `icon` as a child, and those two conventions live side by
// side in this codebase. Passing the component where an element was expected
// handed React a forwardRef object to render as a child — error #31, a blank
// page the instant the surface opened. Accepting both makes that impossible.
const iconEl = (icon, size) =>
  !icon || isValidElement(icon) ? icon : createElement(icon, { size });


/**
 * Canonical confirmation dialog — THE template for every "are you sure"
 * prompt (delete, close day, irreversible actions). Structure matches the
 * Daily close-confirm: icon chip + bold title, muted message, right-aligned
 * cancel (secondary) + confirm (primary/danger) buttons.
 *
 * Props:
 *   open         – render nothing when false
 *   onCancel     – backdrop click / cancel button / Escape
 *   onConfirm    – confirm button
 *   title        – bold heading
 *   message      – muted explanation text (string or node, optional)
 *   confirmLabel / cancelLabel – button labels (cancel defaults to common.cancel)
 *   tone         – "warning" (amber chip, brand confirm — default)
 *                  "danger"  (red chip, red confirm — deletions)
 *   icon         – override the chip icon (lucide element, optional)
 *   loading      – disables both buttons, spinner on confirm
 *   error        – failure text rendered INSIDE the dialog. A mutation that
 *                  fails should leave the dialog standing with the reason on
 *                  it; closing it and firing window.alert() loses the message
 *                  entirely on Telegram iOS, which suppresses native dialogs.
 *   challenge      – text the operator must retype before confirm enables. For
 *                    actions no undo can reach (full-DB restore, whole-day
 *                    wipe): two taps of muscle memory shouldn't be able to
 *                    complete them, and retyping forces a re-read of WHAT is
 *                    being destroyed.
 *   challengeLabel – prompt shown above that input
 *   zIndex       – default 100 so it sits above form modals
 *
 * Only the TOPMOST dialog answers Escape and Tab (`dialogLayers.js`), so the
 * form modal under it never closes with the confirm. The key handler is an
 * effect event, so a parent re-rendering while the dialog is open (a new
 * inline onCancel each render) no longer re-runs the focus effect — which
 * handed focus back to the opener and re-took it.
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
  error = null,
  challenge = null,
  challengeLabel = null,
  zIndex = 100,
}) {
  const { t } = useLang();
  const backdropRef = useRef(null);
  const cardRef = useRef(null);
  const cancelRef = useRef(null);
  const [typed, setTyped] = useState("");
  const titleId = useId();
  const messageId = useId();
  const layer = useDialogLayer(open, zIndex, backdropRef);

  // Reset the challenge whenever the dialog is (re)opened, so a previous
  // attempt can't leave confirm pre-armed.
  useEffect(() => { if (open) setTyped(""); }, [open, challenge]);

  const onKey = useEffectEvent((e) => {
    if (e.defaultPrevented || !isTopLayer(layer)) return;
    if (e.key === "Escape") {
      e.preventDefault();
      if (!loading) onCancel?.();
      return;
    }
    if (e.key !== "Tab") return;
    // Trap focus: without this, Tab walks into the page behind the backdrop
    // and a stray Enter fires whatever it landed on.
    const nodes = cardRef.current?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (!nodes?.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (!cardRef.current.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const card = cardRef.current;
    // Focus the SAFE action, never the destructive one.
    const id = setTimeout(() => cancelRef.current?.focus(), 0);

    const h = (e) => onKey(e);
    document.addEventListener("keydown", h);
    return () => {
      clearTimeout(id);
      document.removeEventListener("keydown", h);
      const a = document.activeElement;
      if ((!a || a === document.body || card?.contains(a)) && opener?.isConnected && opener !== document.body) {
        opener.focus?.({ preventScroll: true });
      }
    };
  }, [open]);

  if (!open) return null;

  const chip = tone === "danger"
    ? { background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444" }
    : { background: "#f59e0b22", border: "1px solid #f59e0b55", color: "#d97706" };
  const defaultIcon = tone === "danger" ? <Trash2 size={20} /> : <AlertTriangle size={20} />;
  const armed = !challenge || typed.trim().toLowerCase() === String(challenge).trim().toLowerCase();

  return createPortal(
    <div
      ref={backdropRef}
      className="modal-backdrop fixed inset-0 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)", zIndex, paddingTop: "calc(var(--tg-safe-top, 0px) + 1rem)", paddingBottom: "calc(var(--tg-safe-bottom, 0px) + 1rem)" }}
      onClick={() => !loading && onCancel?.()}
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
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
            {iconEl(icon, 20) ?? defaultIcon}
          </div>
          <div id={titleId} className="text-sm font-bold" style={{ color: "var(--text-1)" }}>{title}</div>
        </div>

        {message && (
          <div id={messageId} className="text-xs leading-relaxed mb-4" style={{ color: "var(--text-3)" }}>{message}</div>
        )}

        {challenge && (
          <div className="mb-4">
            <div className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: "var(--text-3)" }}>
              {challengeLabel ?? t("ui.confirm.challenge").replace("{text}", challenge)}
            </div>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={loading}
              autoComplete="off"
              spellCheck={false}
              className="w-full rounded-lg px-2.5 py-2 text-sm"
              style={{
                background: "var(--input-bg)",
                border: `1px solid ${armed ? "#22c55e" : "var(--border-md)"}`,
                color: "var(--text-1)",
              }}
            />
          </div>
        )}

        {error && (
          <div
            className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs mb-4"
            style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.30)", color: "#ef4444" }}
          >
            <XCircle size={13} className="flex-shrink-0 mt-0.5" />
            <span className="break-words">{error}</span>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel ?? t("common.cancel")}
          </Button>
          <Button
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            disabled={!armed}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
