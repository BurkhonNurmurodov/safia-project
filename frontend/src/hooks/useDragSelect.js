import { useEffect, useMemo, useRef } from "react";

// Attribute each selectable row carries so a drag can locate it via
// document.elementFromPoint while the pointer travels over the column.
const KEY_ATTR = "data-ds-key";

// Suppress text selection while a drag is in progress (module scope so the DOM
// write stays out of the memoized handler closure).
function setBodyUserSelect(value) { document.body.style.userSelect = value; }

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
  // Latest props, read by the identity-stable pointer handlers at drag time.
  const cfg = useRef({ isSelected, applyState, opts });
  useEffect(() => { cfg.current = { isSelected, applyState, opts }; });

  const drag = useRef(null);

  // Build the handler set once; function declarations are hoisted so they can
  // reference each other (onUp removes onMove and itself) without TDZ issues.
  const api = useMemo(() => {
    function paint(x, y) {
      const d = drag.current;
      if (!d) return;
      const host = document.elementFromPoint(x, y)?.closest(`[${KEY_ATTR}]`);
      const key = host?.getAttribute(KEY_ATTR);
      if (key == null) return;
      // Crossing into a different row turns a press into a drag. Take ownership
      // of the anchor here too: released off-target, its native click never
      // fires, so we must toggle it ourselves.
      if (!d.moved && key !== d.anchor) {
        d.moved = true;
        cfg.current.applyState(d.anchor, d.value);
        setBodyUserSelect("none");
      }
      if (d.moved && !d.painted.has(key)) {
        d.painted.add(key);
        cfg.current.applyState(key, d.value);
      }
    }
    function onMove(e) { if (drag.current) paint(e.clientX, e.clientY); }
    function teardown() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
    }
    function onUp() {
      const d = drag.current;
      drag.current = null;
      teardown();
      cfg.current.opts?.onEnd?.();
      // Swallow exactly the one click this drag is about to emit, so the row's
      // own onChange/onClick doesn't undo the anchor we already painted.
      // preventDefault also cancels a <label>'s would-be second click on its
      // input, so a single capture is enough for label-wrapped checkboxes.
      if (d?.moved) {
        const swallow = (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
        document.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 350);
      }
    }
    function start(e, key) {
      if (e.pointerType === "touch") return;                 // touch keeps native tap
      if (e.pointerType === "mouse" && e.button !== 0) return; // left button only
      const k = String(key);
      drag.current = { anchor: k, value: !cfg.current.isSelected(k), painted: new Set([k]), moved: false };
      cfg.current.opts?.onStart?.();
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }
    return { start, teardown };
  }, []);

  // Detach any stray listeners if the component unmounts mid-drag.
  useEffect(() => api.teardown, [api]);

  return useMemo(() => (key) => ({
    [KEY_ATTR]: String(key),
    onPointerDown: (e) => api.start(e, key),
  }), [api]);
}
