import { createPortal } from "react-dom";
import { createElement, isValidElement, useCallback, useEffect, useEffectEvent, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { useLang } from "../../context/LangContext";
import ConfirmDialog from "./ConfirmDialog";
import { DialogDraftContext, isTopLayer, trapTab, useDialogLayer } from "./dialogLayers";

// `icon` may be an ELEMENT (<Sparkles size={16} />) or the COMPONENT itself
// (Sparkles). SectionHead / TableCard / EmptyState take the component and render
// it; this one renders `icon` as a child, and those two conventions live side by
// side in this codebase. Passing the component where an element was expected
// handed React a forwardRef object to render as a child — error #31, a blank
// page the instant the surface opened. Accepting both makes that impossible.
const iconEl = (icon, size) =>
  !icon || isValidElement(icon) ? icon : createElement(icon, { size });


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
 *   dismissable – set false to ignore backdrop clicks AND Escape (while saving,
 *                 or while the caller holds a draft it must not lose)
 *   dirty       – does this dialog hold unsaved work? Leave it out and the
 *                 Modal works it out (below); pass true/false to decide.
 *
 * Accessibility (every caller gets it, nothing to wire):
 *   role="dialog" + aria-modal, labelled by the title (described by the
 *   subtitle); on open focus moves INTO the card — onto the card itself, unless
 *   a field inside took it (autoFocus): a focused input raises the keyboard on
 *   a phone, so the shell never picks one. Tab is trapped inside, and on close
 *   focus goes back to whatever opened the dialog. Only the TOPMOST dialog
 *   answers the keyboard (`dialogLayers.js`), so a ConfirmDialog or a nested
 *   modal on top never fights this one.
 *
 * Escape is an implicit close, like a backdrop click, so it obeys
 * `dismissable` — and it NEVER silently discards entered work. With a draft it
 * asks first (ConfirmDialog: «Close without saving?», the safe button
 * focused). The draft is `dirty` when the caller passes it; otherwise it is
 * «the user changed something in this card since it opened»: any typed /
 * ticked / chosen native field (search boxes and anything under
 * `data-no-draft` excepted), plus a pick in StyledSelect, DateRangePicker or
 * CountStepper (`useMarkDraft`). Without a draft Escape closes at once. The X
 * is an explicit close and never asks; the backdrop keeps its old behaviour.
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
  dirty,
  children,
}) {
  const lang = useLang();
  // Modal renders under the language provider everywhere today; the English
  // fallbacks only keep a surface outside it from crashing on a label.
  const say = (key, en) => {
    const v = lang?.t?.(key);
    return v && v !== key ? v : en;
  };
  const backdropRef = useRef(null);
  const cardRef = useRef(null);
  const ownFocusRef = useRef(null);
  const editedRef = useRef(false);
  const [asking, setAsking] = useState(false);
  // A dialog closed while asking must not reopen still asking.
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) { setWasOpen(open); setAsking(false); }
  const titleId = useId();
  const subtitleId = useId();
  const layer = useDialogLayer(open, zIndex, backdropRef);

  const markDraft = useCallback(() => { editedRef.current = true; }, []);

  // Every opening starts clean.
  useEffect(() => {
    if (open) editedRef.current = false;
  }, [open]);

  // Focus in on open, back to the opener on close.
  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    const card = cardRef.current;
    // A child's own autoFocus / focus effect runs first and wins.
    const id = setTimeout(() => {
      if (card && !card.contains(document.activeElement)) card.focus({ preventScroll: true });
    }, 0);
    return () => {
      clearTimeout(id);
      const a = document.activeElement;
      // Only take back focus this dialog was holding (it falls to <body> when
      // the card leaves the DOM) — never focus somebody moved on purpose.
      const lost = !a || a === document.body || card?.contains(a);
      if (lost && opener && opener !== document.body && opener.isConnected) {
        opener.focus?.({ preventScroll: true });
      }
    };
  }, [open]);

  // Escape + Tab, for the topmost dialog only. On the WINDOW, so a popover
  // inside the card (its own listener on the document) answers Escape first
  // and marks it handled.
  const onKey = useEffectEvent((e) => {
    if (e.defaultPrevented || !isTopLayer(layer)) return;
    const card = cardRef.current;
    if (!card) return;
    if (e.key === "Escape") {
      if (e.isComposing) return;
      e.preventDefault();
      if (!onClose || !dismissable) return;
      if (dirty ?? editedRef.current) setAsking(true);
      else onClose();
      return;
    }
    if (e.key === "Tab") trapTab(e, card, (el) => el === ownFocusRef.current);
  });
  useEffect(() => {
    if (!open) return undefined;
    const h = (e) => onKey(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open]);

  if (!open) return null;

  // A native field the user changed inside THIS card (React events bubble
  // through portals, so a nested dialog's fields are left to that dialog by
  // the contains() test).
  const noteEdit = (e) => {
    const el = e.target;
    if (!el || !cardRef.current?.contains(el)) return;
    if (el.type === "search" || el.closest?.("[data-no-draft]")) return;
    editedRef.current = true;
  };

  const ask = asking && (
    <ConfirmDialog
      open
      zIndex={Math.max(100, zIndex + 10)}
      title={say("ui.modal.discardTitle", "Close without saving?")}
      message={say("ui.modal.discardMsg", "What you entered in this window will not be saved.")}
      confirmLabel={say("ui.modal.discardConfirm", "Close")}
      cancelLabel={say("ui.modal.discardKeep", "Keep editing")}
      onCancel={() => setAsking(false)}
      onConfirm={() => { setAsking(false); onClose?.(); }}
    />
  );

  return (
    <>
      {createPortal(
        <div
          ref={backdropRef}
          className="modal-backdrop fixed inset-0 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.6)", zIndex, paddingTop: "calc(var(--tg-safe-top, 0px) + 1rem)", paddingBottom: "calc(var(--tg-safe-bottom, 0px) + 1rem)" }}
          onClick={() => dismissable && onClose?.()}
        >
          <div
            ref={cardRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={title != null ? titleId : undefined}
            aria-describedby={title != null && subtitle ? subtitleId : undefined}
            tabIndex={-1}
            className={`modal-card w-full ${maxWidth} rounded-2xl flex flex-col overflow-hidden outline-none`}
            style={{
              background: "var(--bg-card)",
              border: "1px solid var(--border-md)",
              boxShadow: "0 24px 60px rgba(0,0,0,0.35)",
              // % of the backdrop's PADDED box, never dvh: a 90dvh card overflows
              // the safe-area paddings and its footer lands under the Android nav bar.
              maxHeight: "100%",
            }}
            onClick={(e) => e.stopPropagation()}
            onFocusCapture={(e) => { ownFocusRef.current = e.target; }}
            onChangeCapture={noteEdit}
            onInputCapture={noteEdit}
          >
            <DialogDraftContext.Provider value={markDraft}>
              {title != null && (
                <div
                  className="flex items-center justify-between gap-3 px-5 py-4 flex-shrink-0"
                  style={{ borderBottom: "1px solid var(--border)" }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {iconEl(icon, 16)}
                    <div className="min-w-0">
                      <div id={titleId} className="font-semibold text-sm" style={{ color: "var(--text-1)" }}>{title}</div>
                      {subtitle && (
                        // Readable (it often names WHO — a brigadir, a cell) and
                        // never cut: a touch screen has no hover to read the rest.
                        <div id={subtitleId} className="text-xs mt-0.5 break-words" style={{ color: "var(--text-2)" }}>{subtitle}</div>
                      )}
                    </div>
                  </div>
                  {onClose && (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label={say("ui.modal.close", "Close")}
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
            </DialogDraftContext.Provider>
            {/* Portaled by itself; rendered HERE in the tree so a click on its
                backdrop stops at this card instead of reaching the caller. */}
            {ask}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
