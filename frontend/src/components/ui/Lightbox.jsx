import { useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { isTopLayer, trapTab, useDialogLayer } from "./dialogLayers";

/* THE full-screen photo zoom (proof photos on the leader day report, example
 * photos on the /leaders «Vazifalar» tab, …).
 *
 * Portaled to document.body, NOT rendered in place: the page-enter transform
 * makes any ancestor the containing block for position:fixed, which would pin
 * a "full-screen" overlay inside the card it opened from. `src` is an object
 * URL or any image URL; falsy renders nothing. Escape and a backdrop tap close
 * it; the picture itself swallows the tap so a mis-aimed zoom does not dismiss.
 *
 * It is a dialog layer (`dialogLayers.js`): opened over a Modal — a day
 * report's photo — Escape closes the photo and leaves the Modal standing.
 * Focus moves to its close button and returns to the thumbnail after.
 */
const Z = 120;

export default function Lightbox({ src, onClose, alt = "" }) {
  const rootRef = useRef(null);
  const closeRef = useRef(null);
  const layer = useDialogLayer(Boolean(src), Z, rootRef);
  const onKey = useEffectEvent((e) => {
    if (e.defaultPrevented || !isTopLayer(layer)) return;
    if (e.key === "Escape") { e.preventDefault(); onClose?.(); return; }
    if (e.key === "Tab" && rootRef.current) trapTab(e, rootRef.current);
  });

  useEffect(() => {
    if (!src) return undefined;
    const opener = document.activeElement;
    const root = rootRef.current;
    closeRef.current?.focus({ preventScroll: true });
    const h = (e) => onKey(e);
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("keydown", h);
      const a = document.activeElement;
      if ((!a || a === document.body || root?.contains(a)) && opener?.isConnected && opener !== document.body) {
        opener.focus?.({ preventScroll: true });
      }
    };
  }, [src]);

  if (!src) return null;
  return createPortal(
    <div ref={rootRef} role="dialog" aria-modal="true" aria-label={alt || undefined} onClick={onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.92)",
               paddingTop: "calc(var(--tg-safe-top, 0px) + 1rem)",
               paddingBottom: "calc(var(--tg-safe-bottom, 0px) + 1rem)" }}>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
        className="absolute top-3 right-3 rounded-full p-2"
        style={{ background: "rgba(255,255,255,0.14)", color: "#fff",
                 top: "calc(var(--tg-safe-top, 0px) + 0.75rem)" }}>
        <X size={20} />
      </button>
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()}
        className="max-w-full max-h-full rounded-lg" style={{ objectFit: "contain" }} />
    </div>,
    document.body,
  );
}
