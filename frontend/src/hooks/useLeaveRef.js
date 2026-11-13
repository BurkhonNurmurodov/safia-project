import { useCallback } from "react";
import { leaveGhost, trackScroll } from "../utils/leave";

/**
 * useLeaveRef — the ref of a floating surface that should LEAVE with an
 * animation: a dialog's backdrop, a menu, a dropdown, a sheet, a toast.
 *
 *   const popRef = useRef(null);          // what the component already reads
 *   const setPop = useLeaveRef(popRef);   // …and what it now hands to React
 *   …
 *   {open && createPortal(<div ref={setPop} className="pop …">…</div>, document.body)}
 *
 * `targetRef` is optional: pass the object ref the component reads (outside-
 * click tests, measuring) and it is kept pointing at the node exactly as
 * before; leave it out when nothing reads the node.
 *
 * It changes nothing about WHEN the element unmounts. As the element leaves
 * the document a lifeless copy plays the exit its class is given in index.css
 * (`[data-leaving]`) — see utils/leave.js for why that is safe. The element
 * must be out of flow (fixed / absolute); an in-flow one is left alone.
 *
 * The callback's identity is stable for a stable `targetRef`, which matters:
 * React re-runs a ref whose identity changes, and every re-run would copy the
 * surface for nothing.
 */
export default function useLeaveRef(targetRef) {
  return useCallback((node) => {
    if (targetRef) targetRef.current = node;
    if (!node) return undefined;
    const scrolled = trackScroll(node);
    return () => {
      if (targetRef) targetRef.current = null;
      leaveGhost(node, scrolled);
    };
  }, [targetRef]);
}
