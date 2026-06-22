import { useEffect, useMemo, useRef } from "react";

// Suppress text selection while a drag is in progress (module scope so the DOM
// write stays out of the memoized handler closure).
function setBodyUserSelect(value) { document.body.style.userSelect = value; }

/**
 * Click-and-drag "paint" selection for a vertical column of checkboxes.
 * Now also supports Shift+Click for range selection and Shift+Up/Down for keyboard selection.
 *
 * Spread the returned `rowProps(key)` onto each selectable row (or the
 * checkbox's own cell/label). Behaviour — mouse / pen only, so touch keeps its
 * native tap and the list can still be scrolled with a finger:
 *
 *   • A plain click is left untouched — the row's existing onChange/onClick
 *     toggles it as before.
 *   • Pressing on a row and dragging up or down paints every crossed row to the
 *     anchor row's *new* state.
 *   • Shift+Click selects all rows between the last clicked row and the new one.
 *   • Shift+Up/Down extends the selection to the adjacent row.
 *
 * @param {(key: string) => boolean} isSelected  current state of a row by key
 * @param {(key: string, value: boolean) => void} applyState  set a row's state
 * @param {{ onStart?: () => void, onEnd?: () => void }} [opts]  drag lifecycle hooks
 * @returns {(key: string|number) => object} props to spread onto each row
 */
export function useDragSelect(isSelected, applyState, opts) {
  const instanceId = useMemo(() => Math.random().toString(36).slice(2, 9), []);
  const keyAttr = `data-ds-key-${instanceId}`;

  // Latest props, read by the identity-stable pointer handlers at drag time.
  const cfg = useRef({ isSelected, applyState, opts });
  useEffect(() => { cfg.current = { isSelected, applyState, opts }; });

  const drag = useRef(null);
  const lastClicked = useRef(null);

  // Build the handler set once; function declarations are hoisted so they can
  // reference each other (onUp removes onMove and itself) without TDZ issues.
  const api = useMemo(() => {
    function paint(x, y) {
      const d = drag.current;
      if (!d) return;
      const host = document.elementFromPoint(x, y)?.closest(`[${keyAttr}]`);
      const key = host?.getAttribute(keyAttr);
      if (key == null) return;
      
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
      setBodyUserSelect("");
    }
    
    function onUp() {
      const d = drag.current;
      drag.current = null;
      teardown();
      cfg.current.opts?.onEnd?.();
      
      if (d?.moved) {
        const swallow = (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
        document.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 350);
      }
    }
    
    function start(e, key) {
      if (e.pointerType === "touch") return;                 
      if (e.pointerType === "mouse" && e.button !== 0) return; 
      
      const k = String(key);
      const isCurrentlySelected = cfg.current.isSelected(k);

      if (e.shiftKey && lastClicked.current != null) {
        e.preventDefault();
        
        const elements = Array.from(document.querySelectorAll(`[${keyAttr}]`));
        const keys = elements.map(el => el.getAttribute(keyAttr));
        
        const startIdx = keys.indexOf(lastClicked.current);
        const endIdx = keys.indexOf(k);
        
        if (startIdx !== -1 && endIdx !== -1) {
          const min = Math.min(startIdx, endIdx);
          const max = Math.max(startIdx, endIdx);
          
          const targetState = !isCurrentlySelected;
          
          cfg.current.opts?.onStart?.();
          for (let i = min; i <= max; i++) {
            if (cfg.current.isSelected(keys[i]) !== targetState) {
              cfg.current.applyState(keys[i], targetState);
            }
          }
          cfg.current.opts?.onEnd?.();
        }
        
        lastClicked.current = k;
        
        const swallow = (ev) => { ev.stopImmediatePropagation(); ev.preventDefault(); };
        document.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(() => document.removeEventListener("click", swallow, { capture: true }), 350);
        return;
      }

      lastClicked.current = k;
      drag.current = { anchor: k, value: !isCurrentlySelected, painted: new Set([k]), moved: false };
      cfg.current.opts?.onStart?.();
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    }
    
    function keyDown(e, key) {
      if (e.shiftKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
        e.preventDefault(); // prevent page scrolling
        
        const elements = Array.from(document.querySelectorAll(`[${keyAttr}]`));
        const keys = elements.map(el => el.getAttribute(keyAttr));
        const idx = keys.indexOf(String(key));
        if (idx === -1) return;
        
        let nextIdx = -1;
        if (e.key === 'ArrowDown' && idx < keys.length - 1) {
          nextIdx = idx + 1;
        } else if (e.key === 'ArrowUp' && idx > 0) {
          nextIdx = idx - 1;
        }
        
        if (nextIdx !== -1) {
          const nextKey = keys[nextIdx];
          const nextEl = elements[nextIdx];
          const currentState = cfg.current.isSelected(String(key));
          
          cfg.current.opts?.onStart?.();
          if (cfg.current.isSelected(nextKey) !== currentState) {
             cfg.current.applyState(nextKey, currentState);
          }
          cfg.current.opts?.onEnd?.();
          
          lastClicked.current = nextKey;
          
          // Focus the next element (preferring a checkbox if one exists)
          const focusable = nextEl.querySelector('input[type="checkbox"]') || nextEl;
          if (focusable && typeof focusable.focus === 'function') {
             focusable.focus();
          }
        }
      }
    }

    return { start, keyDown, teardown };
  }, [keyAttr]);

  // Detach any stray listeners if the component unmounts mid-drag.
  useEffect(() => api.teardown, [api]);

  return useMemo(() => (key) => ({
    [keyAttr]: String(key),
    onPointerDown: (e) => api.start(e, key),
    onKeyDown: (e) => api.keyDown(e, key),
  }), [api, keyAttr]);
}
