import { useEffect, useEffectEvent, useRef } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { isTopLayer, trapTab, useDialogLayer } from "./dialogLayers";
import useLeaveRef from "../../hooks/useLeaveRef";

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
 *
 * `onPrev` / `onNext` make it a set of photos (an audit minus's photos): a
 * chevron on each side, ← / → and a sideways swipe step through it; a
 * missing handler hides its chevron, so the ends show themselves.
 *
 * It opens and closes like a dialog (motion system, index.css): the dark
 * ground fades, the picture settles in from 96% and eases back out.
 */
const Z = 120;

export default function Lightbox({ src, onClose, alt = "", onPrev, onNext, prevLabel = "Previous", nextLabel = "Next" }) {
  const touchX = useRef(null);
  const rootRef = useRef(null);
  const setRoot = useLeaveRef(rootRef);
  const closeRef = useRef(null);
  const layer = useDialogLayer(Boolean(src), Z, rootRef);
  const onKey = useEffectEvent((e) => {
    if (e.defaultPrevented || !isTopLayer(layer)) return;
    if (e.key === "Escape") { e.preventDefault(); onClose?.(); return; }
    if (e.key === "ArrowLeft" && onPrev) { e.preventDefault(); onPrev(); return; }
    if (e.key === "ArrowRight" && onNext) { e.preventDefault(); onNext(); return; }
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
    <div ref={setRoot} role="dialog" aria-modal="true" aria-label={alt || undefined} onClick={onClose}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const dx = e.changedTouches[0].clientX - (touchX.current ?? e.changedTouches[0].clientX);
        touchX.current = null;
        if (dx > 50) onPrev?.();
        else if (dx < -50) onNext?.();
      }}
      className="modal-backdrop fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.92)",
               paddingTop: "calc(var(--tg-safe-top, 0px) + 1rem)",
               paddingBottom: "calc(var(--tg-safe-bottom, 0px) + 1rem)" }}>
      <button ref={closeRef} type="button" onClick={onClose} aria-label="Close"
        className="absolute top-3 right-3 rounded-full p-2"
        style={{ background: "rgba(255,255,255,0.14)", color: "#fff",
                 top: "calc(var(--tg-safe-top, 0px) + 0.75rem)" }}>
        <X size={20} />
      </button>
      {[[onPrev, prevLabel, ChevronLeft, "left-3"], [onNext, nextLabel, ChevronRight, "right-3"]].map(([fn, label, Icon, side]) => fn && (
        <button key={side} type="button" aria-label={label} title={label}
          onClick={(e) => { e.stopPropagation(); fn(); }}
          className={`absolute ${side} top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center`}
          style={{ background: "rgba(255,255,255,0.14)", color: "#fff" }}>
          <Icon size={24} />
        </button>
      ))}
      <img src={src} alt={alt} onClick={(e) => e.stopPropagation()}
        className="modal-card max-w-full max-h-full rounded-lg" style={{ objectFit: "contain" }} />
    </div>,
    document.body,
  );
}
