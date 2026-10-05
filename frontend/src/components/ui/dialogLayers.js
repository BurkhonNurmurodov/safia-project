import { createContext, useContext, useEffect, useId } from "react";

/**
 * Which open dialog owns the keyboard — THE answer, shared by Modal,
 * ConfirmDialog and Lightbox.
 *
 * Each of them listens for Escape and Tab on the document or the window, so a
 * ConfirmDialog opened over a form modal, a nested modal (zIndex 60+) or a
 * photo lightbox over a day report would otherwise ALL answer one key press:
 * one Escape would cancel the confirm and close the form under it, and two
 * focus traps would fight over every Tab. Every open layer registers here and
 * only the TOP one acts.
 *
 * "Top" is what the eye sees: the highest z-index, and at an equal z-index the
 * one later in the document — portals append to <body> as they open, so a
 * ConfirmDialog opened over a z-100 /staff document modal sits after it. The
 * registration order alone cannot say that: effects run child-first, so a
 * parent and a child mounting together register in the wrong order.
 *
 * A layer that acts on a key also calls `e.preventDefault()`, and every layer
 * skips an event already prevented — a second guard for the instant between
 * the top layer closing and its registration being removed. Popovers that sit
 * INSIDE a dialog (StyledSelect, DateRangePicker, the RichTextEditor menus…)
 * follow the same convention when Escape closes them, so closing a dropdown
 * never closes the dialog it is in.
 */
const layers = []; // { id, z, el: ref to the layer's outermost node, seq }
let seq = 0;

function above(a, b) {
  if (a.z !== b.z) return a.z > b.z;
  const ea = a.el.current;
  const eb = b.el.current;
  if (ea && eb && ea !== eb) {
    // b precedes a in the document → a is painted over it.
    return Boolean(ea.compareDocumentPosition(eb) & Node.DOCUMENT_POSITION_PRECEDING);
  }
  return a.seq > b.seq;
}

/** True while the layer `id` is the topmost open one. */
export function isTopLayer(id) {
  let top = null;
  for (const l of layers) if (!top || above(l, top)) top = l;
  return top?.id === id;
}

/**
 * Is any dialog open? A page-level Escape (a fullscreen overlay's) steps aside
 * while one is: the dialog answers the key, the page under it stays as it is.
 */
export function hasOpenDialog() {
  return layers.length > 0;
}

/**
 * Register a layer while `open`. `elRef` points at its outermost node (the
 * backdrop); `z` is its z-index. Returns the layer's id for `isTopLayer`.
 */
export function useDialogLayer(open, z, elRef) {
  const id = useId();
  useEffect(() => {
    if (!open) return undefined;
    const entry = { id, z: Number(z) || 0, el: elRef, seq: ++seq };
    layers.push(entry);
    return () => {
      const i = layers.indexOf(entry);
      if (i >= 0) layers.splice(i, 1);
    };
  }, [id, open, z, elRef]);
  return id;
}

/**
 * The elements Tab can reach inside `root`, in document order — visible,
 * enabled, and not taken out of the tab order (tabIndex < 0, e.g. a roving
 * grid's inactive cells).
 */
const FOCUSABLE =
  'a[href], area[href], button, input:not([type="hidden"]), select, textarea, iframe, ' +
  '[contenteditable]:not([contenteditable="false"]), [tabindex]';

export function tabbables(root) {
  if (!root) return [];
  return [...root.querySelectorAll(FOCUSABLE)].filter((el) =>
    el.tabIndex >= 0 &&
    !el.disabled &&
    !el.closest("[inert]") &&
    el.getClientRects().length > 0
  );
}

/**
 * Keep Tab inside `root`. `isOwn(el)` answers whether a node OUTSIDE `root`
 * still belongs to the dialog (a portaled dropdown it opened) — Tab there is
 * left to the dropdown. Everywhere else the order wraps: past the last
 * reachable element back to the first, and from anything that is not one of
 * them (the card itself, the page behind) to the nearest one in that
 * direction.
 */
export function trapTab(e, root, isOwn) {
  const a = document.activeElement;
  const inside = root.contains(a);
  if (!inside && a && a !== document.body && isOwn?.(a)) return;
  const nodes = tabbables(root);
  if (!nodes.length) { e.preventDefault(); root.focus({ preventScroll: true }); return; }
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  const idx = inside ? nodes.indexOf(a) : -1;
  if (idx >= 0) {
    // Between the edges the browser's own order is right (radio groups, etc.).
    if (e.shiftKey && idx === 0) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && idx === nodes.length - 1) { e.preventDefault(); first.focus(); }
    return;
  }
  e.preventDefault();
  if (!inside) { (e.shiftKey ? last : first).focus(); return; }
  // The card itself, or an element Tab cannot otherwise land on: move to the
  // nearest reachable one in the direction pressed.
  const fwd = nodes.find((n) => a.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING);
  const back = [...nodes].reverse().find((n) => a.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_PRECEDING);
  (e.shiftKey ? (back ?? last) : (fwd ?? first)).focus();
}

/**
 * «Something was entered in this dialog.» Modal provides it; the value
 * templates (StyledSelect, DateRangePicker, CountStepper) call it when the
 * USER changes their value, because a pick from a custom control fires no
 * native input event for Modal to notice. Outside a Modal it is a no-op.
 */
export const DialogDraftContext = createContext(null);

export function useMarkDraft() {
  const mark = useContext(DialogDraftContext);
  return mark ?? noop;
}

function noop() {}
