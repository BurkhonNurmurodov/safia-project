import { useLayoutEffect, useRef, useState } from "react";

/**
 * «Tashkiliy tuzilma» — the canvas fills what is left of the screen under the
 * toolbar. Returns `[ref, height]`: put the ref on the box holding the canvas.
 * `full` (the chart on the whole screen, FullView.jsx): the box is a flex
 * child that fills what the toolbar leaves, so the canvas takes all of it.
 */
export function useCanvasHeight(full = false) {
  const boxRef = useRef(null);
  const [top, setTop] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = boxRef.current;
      if (!el) return;
      // Outside <main>: on the whole screen there is nothing to measure
      // against; otherwise FullView has not put its host in the page yet
      // (it attaches after the view's own effects), so look again next frame.
      const main = el.closest("main");
      if (!main) { if (!full) requestAnimationFrame(measure); return; }
      setTop(Math.round(el.getBoundingClientRect().top + (main ? main.scrollTop : 0)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [full]);
  if (full) return [boxRef, "100%"];
  return [boxRef, `max(420px, calc(100dvh - ${top ?? 220}px - 2.75rem - var(--tg-safe-bottom, 0px)))`];
}
