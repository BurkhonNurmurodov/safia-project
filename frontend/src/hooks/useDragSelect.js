import { useCallback, useEffect, useRef } from "react";

// Attribute each selectable row carries so a drag can locate it via
// document.elementFromPoint while the pointer travels over the column.
const KEY_ATTR = "data-ds-key";

/**
 * Click-and-drag "paint" selection for a vertical column of checkboxes.
 *
 * Spread the returned `rowProps(key)` onto each selectable row (or the
 * checkbox's own cell/label). Behaviour — mouse / pen only, so touch keeps its
 * native tap and the list can still be scrolled with a finger:
 *
 *   • A plain click is left untouched — the row's existing onChange/onClick
 *     toggles it as before.
 *   • Pressing on a row and dragging up or down paints every crossed row to the
 *     anchor row's *new* state (so a drag from an unchecked box checks the run,
 *     and a drag from a checked box unchecks it). The single trailing click is
 *     swallowed so the row's own handler doesn't double-toggle the anchor.
 *
 * @param {(key: string) => boolean} isSelected  current state of a row by key
 * @param {(key: string, value: boolean) => void} applyState  set a row's state
 * @param {{ onStart?: () => void, onEnd?: () => void }} [opts]  drag lifecycle
 *        hooks — useful for callers whose setter can't compose functionally and
 *        need to snapshot/reset a working copy across the drag.
 * @returns {(key: string|number) => object} props to spread onto each row
 */
export function useDragSelect(isSelected, applyState, opts) {
  const drag = useRef(null);
  const isSelRef = useRef(isSelected);
  const applyRef = useRef(applyState);
  const optsRef = useRef(opts);
  isSelRef.current = isSelected;
  applyRef.current = applyState;
  optsRef.current = opts;

  const onMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    const host = document.elementFromPoint(e.clientX, e.clientY)?.closest(`[${KEY_ATTR}]`);
    const key = host?.getAttribute(KEY_ATTR);
    if (key == null) return;
    // Crossing into a different row is what turns a press into a drag. Take
    // ownership of the anchor here too: when the pointer is released off-target
    // its native click never fires, so we must toggle it ourselves.
    if (!d.moved && key !== d.anchor) {
      d.moved = true;
      applyRef.current(d.anchor, d.value);
      document.body.style.userSelect = "none";
    }
    if (d.moved && !d.painted.has(key)) {
      d.painted.add(key);
      applyRef.current(key, d.value);
    }
  }, []);

  const onUp = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    document.body.style.userSelect = "";
    optsRef.current?.onEnd?.();
    // Swallow exactly the one click this drag is about to emit, so the row's own
    // onChange/onClick doesn't undo the anchor we already painted.
    if (d?.moved) {
      const swallow = (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
      document.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 350);
    }
  }, [onMove]);

  const start = useCallback((e, key) => {
    if (e.pointerType === "touch") return;                 // touch keeps native tap
    if (e.pointerType === "mouse" && e.button !== 0) return; // left button only
    const k = String(key);
    drag.current = { anchor: k, value: !isSelRef.current(k), painted: new Set([k]), moved: false };
    optsRef.current?.onStart?.();
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }, [onMove, onUp]);

  useEffect(() => () => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    document.body.style.userSelect = "";
  }, [onMove, onUp]);

  return useCallback((key) => ({
    [KEY_ATTR]: String(key),
    onPointerDown: (e) => start(e, key),
  }), [start]);
}
