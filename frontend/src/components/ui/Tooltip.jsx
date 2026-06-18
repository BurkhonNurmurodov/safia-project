import { useState, useRef, useLayoutEffect, useEffect } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

/**
 * Info icon with a hover/tap popup.
 *
 * The popup is rendered in a portal to <body> with position:fixed so it can
 * never be clipped by the scroll container (<main> has overflow-y:auto) or
 * covered by the sticky header — the old absolute/bottom-full popup got
 * cropped by the navbar on the top-row KPI cards. It prefers to sit above the
 * icon, flips below when there isn't room (e.g. near the navbar), and is
 * clamped horizontally so it stays inside the viewport.
 */
export default function Tooltip({ text, size = 11 }) {
  const [show, setShow] = useState(false);
  const triggerRef = useRef(null);
  const tipRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0, visible: false });

  useLayoutEffect(() => {
    if (!show || !triggerRef.current || !tipRef.current) return;
    const m = 8; // viewport margin
    const trig = triggerRef.current.getBoundingClientRect();
    const tip = tipRef.current.getBoundingClientRect();
    // Keep the popup below the header: don't let it rise above the content area.
    const mainTop = document.querySelector("main")?.getBoundingClientRect().top ?? m;

    let left = trig.left + trig.width / 2 - tip.width / 2;
    left = Math.max(m, Math.min(left, window.innerWidth - tip.width - m));

    const aboveTop = trig.top - tip.height - 6;
    const placeAbove = aboveTop >= mainTop + 4;
    const top = placeAbove ? aboveTop : trig.bottom + 6;

    setPos({ top, left, visible: true });
  }, [show, text]);

  // While open, drift would look broken on scroll/resize — just close it.
  useEffect(() => {
    if (!show) return;
    const close = () => setShow(false);
    const onDown = (e) => { if (!triggerRef.current?.contains(e.target)) setShow(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [show]);

  return (
    <span
      ref={triggerRef}
      className="cursor-help ml-0.5 inline-flex items-center flex-shrink-0"
      style={{ color: "var(--text-4)" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onClick={(e) => { e.stopPropagation(); setShow((v) => !v); }}
    >
      <Info size={size} />
      {show &&
        createPortal(
          <span
            ref={tipRef}
            className="fixed z-[9999] w-56 text-[11px] rounded-lg px-2.5 py-2 shadow-xl leading-snug whitespace-pre-line pointer-events-none"
            style={{
              top: pos.top,
              left: pos.left,
              visibility: pos.visible ? "visible" : "hidden",
              background: "var(--bg-card)",
              border: "1px solid var(--border-md)",
              color: "var(--text-2)",
            }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}
