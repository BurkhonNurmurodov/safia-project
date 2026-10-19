import { useCallback, useRef, useState } from "react";

// The measured pixel width of ONE element, kept in sync with a ResizeObserver.
// Its one job on this platform is feeding `ticksForWidth` (utils/chartRange) so
// a date axis thins its labels to the room it actually has.
//
// Two properties are load-bearing:
//
//  • It is a CALLBACK ref, not a ref object watched by an effect. Every chart
//    here sits behind a loading / «ready» gate, so the node it measures mounts
//    and unmounts long after the component does — a `useLayoutEffect(…, [])`
//    would find `ref.current` null on the one pass it ever runs and then watch
//    nothing for the rest of the session. A callback ref re-attaches to
//    whatever node is currently there.
//
//  • It measures during the COMMIT, before the browser paints, so the first
//    width is already known when the chart mounts. Measuring in a passive
//    effect would paint the unfitted axis for a frame first, which on a dense
//    range is precisely the overlapping mess this exists to prevent.
//
// Returns [ref, width]; width is 0 until the node mounts — read that as "not
// measured yet", never as a real width.
//
// `box = "client"` measures the inside of a SCROLLER instead — its clientWidth,
// the part on screen without its scrollbar (the /leaders-kpi ranking pins an
// opened row's panel to it). The border box would count the scrollbar too and
// make anything sized to it wider than what the reader can see.
export default function useElementWidth(box = "border") {
  const [width, setWidth] = useState(0);
  const roRef = useRef(null);
  const rafRef = useRef(0);

  const ref = useCallback((el) => {
    // React hands us null on unmount and before re-attaching to a new node.
    if (roRef.current) { roRef.current.disconnect(); roRef.current = null; }
    cancelAnimationFrame(rafRef.current);
    if (!el) return;

    const measure = () => setWidth(box === "client" ? el.clientWidth : Math.round(el.getBoundingClientRect().width));
    measure();
    if (typeof ResizeObserver === "undefined") return;
    // rAF-debounced: a drag-resize or an orientation flip redraws the chart
    // once, not once per observer callback.
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(measure);
    });
    ro.observe(el);
    roRef.current = ro;
  }, [box]);

  return [ref, width];
}
