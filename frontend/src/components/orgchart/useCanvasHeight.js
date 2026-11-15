import { useLayoutEffect, useRef, useState } from "react";

/**
 * «Tashkiliy tuzilma» — the canvas fills what is left of the screen under the
 * toolbar. Returns `[ref, height]`: put the ref on the box holding the canvas.
 */
export function useCanvasHeight() {
  const boxRef = useRef(null);
  const [top, setTop] = useState(null);
  useLayoutEffect(() => {
    const measure = () => {
      const el = boxRef.current;
      if (!el) return;
      const main = el.closest("main");
      setTop(Math.round(el.getBoundingClientRect().top + (main ? main.scrollTop : 0)));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);
  return [boxRef, `max(420px, calc(100dvh - ${top ?? 220}px - 2.75rem - var(--tg-safe-bottom, 0px)))`];
}
