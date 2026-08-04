import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

/**
 * Toast — THE template for transient action feedback (saved / sent / deleted /
 * failed). Before this existed the same fixed green box was pasted into a dozen
 * pages, so every fix to position, timing or the Telegram safe area had to be
 * made twelve times and never was.
 *
 * Three things the copies all got wrong and this one gets right:
 *   • it portals to document.body — `.page-enter`'s animated transform makes it
 *     the containing block for position:fixed children, so an in-tree toast
 *     anchors to the page instead of the viewport;
 *   • it offsets by var(--tg-safe-top) like Modal/ConfirmDialog, so in a
 *     fullscreen Telegram session it can't hide under the client's own header;
 *   • it announces itself (role=status / aria-live), so the one confirmation a
 *     destructive flow gives isn't invisible to assistive tech.
 *
 * Failures deserve a toast as much as successes: `tone="error"` is why pages no
 * longer need window.alert, which Telegram's iOS WebView silently swallows.
 *
 * Props:
 *   open      – render nothing when false
 *   message   – string or node
 *   tone      – "success" (default) | "error" | "warning" | "info"
 *   duration  – ms before auto-dismiss; 0 / null keeps it until dismissed.
 *               Errors default to staying put — you cannot re-read a toast that
 *               vanished, and a failure is exactly what needs re-reading.
 *   onClose   – called on auto-dismiss and on the close button
 *   closable  – show the × (default true when there's an onClose)
 *   zIndex    – default 9999 (above modals; a toast reports on what they did)
 */

const TONES = {
  success: { bg: "#22c55e", fg: "#fff",     Icon: CheckCircle2,  live: "polite" },
  error:   { bg: "#ef4444", fg: "#fff",     Icon: XCircle,       live: "assertive" },
  // White on #eab308 fails contrast — warning is the one tone that takes dark ink.
  warning: { bg: "#eab308", fg: "#1f2937",  Icon: AlertTriangle, live: "polite" },
  info:    { bg: "var(--bg-card)", fg: "var(--text-1)", Icon: Info, live: "polite" },
};

export default function Toast({
  open = true,
  message,
  tone = "success",
  duration,
  onClose,
  closable,
  zIndex = 9999,
}) {
  const { bg, fg, Icon, live } = TONES[tone] ?? TONES.success;
  // Errors persist by default; everything else self-dismisses.
  const ms = duration === undefined ? (tone === "error" ? 0 : 4000) : duration;
  const showClose = closable ?? !!onClose;

  useEffect(() => {
    if (!open || !ms) return undefined;
    const id = setTimeout(() => onClose?.(), ms);
    return () => clearTimeout(id);
  }, [open, ms, onClose, message]);

  if (!open || !message) return null;

  return createPortal(
    <div
      role="status"
      aria-live={live}
      className="toast-in flex items-start gap-2.5 px-4 py-3 rounded-xl text-sm shadow-lg"
      style={{
        position: "fixed",
        // Same safe-area contract the Modal template uses.
        top: "calc(var(--tg-safe-top, 0px) + 16px)",
        right: 16,
        // Never wider than the viewport at 390px.
        maxWidth: "min(360px, calc(100vw - 32px))",
        zIndex,
        background: bg,
        color: fg,
        border: tone === "info" ? "1px solid var(--border-md)" : "1px solid transparent",
        boxShadow: "0 8px 24px rgba(0,0,0,0.25)",
      }}
    >
      <Icon size={15} style={{ flexShrink: 0, marginTop: 1 }} />
      <span className="flex-1 leading-snug break-words">{message}</span>
      {showClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex-shrink-0 -mr-1 -mt-0.5 p-1 rounded-md opacity-70 hover:opacity-100 transition-opacity"
          style={{ color: fg }}
        >
          <X size={13} />
        </button>
      )}
    </div>,
    document.body,
  );
}

/**
 * useToast — the state + timer half, so pages stop hand-rolling
 * `useState(null)` + `setTimeout` around every mutation.
 *
 *   const toast = useToast();
 *   ...
 *   onSuccess: () => toast.success(t("saved")),
 *   onError:   (e) => toast.error(e?.response?.data?.detail || t("failed")),
 *   ...
 *   {toast.node}
 */
export function useToast() {
  const [state, setState] = useState(null);
  // Keeps `show` identity stable so it can sit in effect/callback deps safely.
  const seq = useRef(0);

  const show = useCallback((message, tone = "success", duration) => {
    seq.current += 1;
    setState({ message, tone, duration, key: seq.current });
  }, []);
  const hide = useCallback(() => setState(null), []);

  const success = useCallback((m, d) => show(m, "success", d), [show]);
  const error   = useCallback((m, d) => show(m, "error", d), [show]);
  const warning = useCallback((m, d) => show(m, "warning", d), [show]);
  const info    = useCallback((m, d) => show(m, "info", d), [show]);

  const node = (
    <Toast
      key={state?.key}
      open={!!state}
      message={state?.message}
      tone={state?.tone}
      duration={state?.duration}
      onClose={hide}
    />
  );

  return { show, hide, success, error, warning, info, node, active: !!state };
}
