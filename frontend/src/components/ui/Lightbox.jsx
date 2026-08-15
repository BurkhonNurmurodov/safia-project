import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/* THE full-screen photo zoom (proof photos on the leader day report, example
 * photos on the /leaders «Vazifalar» tab, …).
 *
 * Portaled to document.body, NOT rendered in place: the page-enter transform
 * makes any ancestor the containing block for position:fixed, which would pin
 * a "full-screen" overlay inside the card it opened from. `src` is an object
 * URL or any image URL; falsy renders nothing. Escape and a backdrop tap close
 * it; the picture itself swallows the tap so a mis-aimed zoom does not dismiss.
 */
export default function Lightbox({ src, onClose, alt = "" }) {
  useEffect(() => {
    if (!src) return undefined;
    const onKey = (e) => { if (e.key === "Escape") onClose?.(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [src, onClose]);
  if (!src) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" onClick={onClose}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.92)",
               paddingTop: "calc(var(--tg-safe-top, 0px) + 1rem)",
               paddingBottom: "calc(var(--tg-safe-bottom, 0px) + 1rem)" }}>
      <button type="button" onClick={onClose} aria-label="Close"
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
