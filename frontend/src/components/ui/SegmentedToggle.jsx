import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * SegmentedToggle — THE template for the app's inline "pill" toggles
 * (min/hrs, P·A·P−A, workload/headcount/idle, theme switch, shift, view
 * switch, …).
 *
 * Recessed-track pill look: a RECESSED track (--bg-inner + a subtle border)
 * holds the segments with a small inset; the SELECTED segment is a brand-gold
 * (--brand) pill with a white label; the rest are transparent with muted
 * --text-3 labels. No divider lines. This is ALSO the style for page-level
 * "view tabs" (Production view switch, Staff Workers/Requests) — same
 * component, not a hand-rolled copy. Never hand-roll this bar — use this so
 * every toggle shares the app's button height. Outer heights mirror Button:
 *   size="md" (default) → 38px  (= Button md / toolbar baseline)
 *   size="sm"           → 30px  (= Button sm)
 *
 * THE TRACK CAN NEVER OVERFLOW ITS CONTAINER. Labels are `whitespace-nowrap`,
 * so an option set that is wider than the box it sits in used to run straight
 * out of it — a `fill` toggle's segments are `flex-1`, but a flex item's
 * automatic minimum size is its CONTENT width, so they refuse to shrink and
 * push the track past the edge (a three-option «Ҳаммаси · Смена 1 · Смена 2»
 * inside a 240px filter dropdown), and a shrink-wrapped toolbar toggle had no
 * width cap at all. Either way the last label was clipped by whatever ancestor
 * was `overflow-hidden` and the surface around it grew a stray horizontal
 * scrollbar. So the track is ALWAYS a horizontal scroller capped at its
 * container: it shrink-wraps exactly as before while the options fit (`max-w-full`
 * and `overflow-x-auto` cost nothing then), and once they do not it scrolls,
 * scrolls the SELECTED segment into view, and fades whichever edge still has
 * content off-screen. This is deliberately NOT opt-in: it was, and 105 of the
 * 123 call sites had not opted in — the ones inside a narrow dropdown or a
 * phone toolbar least of all.
 *
 * Never wrap this in your own `overflow-x-auto` div: a bare wrapper hides the
 * scrollbar without replacing the affordance and leaves the selected segment
 * off-screen, at which point nothing looks selected and the user cannot tell
 * where they are.
 *
 * Props:
 *   value     – the currently selected option value (compared with ===)
 *   onChange  – (value) => void, called with the clicked option's value
 *   options   – array of either [value, label] tuples or
 *               { value, label, title, disabled } objects. `label` may be a
 *               string or a node (e.g. an icon for icon-only segments).
 *   size      – "md" (default) | "sm"
 *   fill      – when true, the track spans its container full-width and every
 *               segment grows to an equal share (flex-1). Use for form-panel
 *               fields (stacked in a flex column) so the pill fills the row
 *               instead of leaving dead track space on the right. Toolbars
 *               leave this off so the toggle shrink-wraps to its labels.
 *   asTabs    – give the track tablist/tab semantics with aria-selected and
 *               arrow-key navigation, for when the toggle switches VIEWS rather
 *               than setting a value. (Plain toggles get aria-pressed instead.)
 *   ariaLabel – accessible name for the group/tablist
 *   className – extra classes for the OUTER box (widths / shrink / margins
 *               only) — never the track's own skin.
 */
export default function SegmentedToggle({
  value,
  onChange,
  options = [],
  size = "md",
  fill = false,
  asTabs = false,
  ariaLabel,
  className = "",
}) {
  // A 4px track inset gives the selected pill a little breathing room from the
  // track border on every side; with the segment padding below the OUTER height
  // lands exactly on Button md 38px / Button sm 30px so toggles align with the
  // rest of the toolbar controls.
  const seg = size === "sm" ? "px-2.5 py-[2px] text-xs" : "px-3 py-[6px] text-xs";
  const items = options.map((o) =>
    Array.isArray(o) ? { value: o[0], label: o[1], title: o[2] } : o
  );

  const trackRef = useRef(null);
  const activeRef = useRef(null);
  const btnRefs = useRef([]);
  const [edges, setEdges] = useState({ start: false, end: false });

  const syncEdges = () => {
    const el = trackRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setEdges({ start: el.scrollLeft > 2, end: el.scrollLeft < max - 2 });
  };

  // Keep the selected segment visible. Deliberately manual scrollLeft rather
  // than scrollIntoView: the latter also scrolls ANCESTORS, so on mount it
  // yanks the whole page down to the toggle.
  useLayoutEffect(() => {
    const track = trackRef.current;
    const btn = activeRef.current;
    if (!track || !btn) return;
    const pad = 12;
    const bLeft = btn.offsetLeft;
    const bRight = bLeft + btn.offsetWidth;
    const vLeft = track.scrollLeft;
    const vRight = vLeft + track.clientWidth;
    if (bLeft < vLeft + pad) track.scrollLeft = Math.max(0, bLeft - pad);
    else if (bRight > vRight - pad) track.scrollLeft = bRight - track.clientWidth + pad;
    syncEdges();
  }, [value, items.length]);

  useEffect(() => {
    syncEdges();
    const el = trackRef.current;
    if (!el) return undefined;
    const onScroll = () => syncEdges();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // The box a toggle sits in can change width without the WINDOW changing —
    // a filter dropdown opening, a card resizing, a modal switching tabs — and
    // the fades have to follow, or an overflowing track shows no hint that it
    // scrolls until the next resize.
    let ro;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(onScroll);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      ro?.disconnect();
    };
  }, [items.length]);

  const enabledIdx = items.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0);

  const onKeyDown = (e) => {
    if (!asTabs) return;
    const cur = items.findIndex((o) => o.value === value);
    const pos = enabledIdx.indexOf(cur);
    let next = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = enabledIdx[(pos + 1) % enabledIdx.length];
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = enabledIdx[(pos - 1 + enabledIdx.length) % enabledIdx.length];
    else if (e.key === "Home") next = enabledIdx[0];
    else if (e.key === "End") next = enabledIdx[enabledIdx.length - 1];
    if (next == null || next === cur) return;
    e.preventDefault();
    onChange?.(items[next].value);
    btnRefs.current[next]?.focus();
  };

  return (
    <div
      className={`relative ${
        // The fades are positioned against THIS box, so it has to be the width
        // of the track and not of the row: a block wrapper would park the end
        // fade at the far edge of the page while the track ended mid-row.
        // `fill` keeps the full-width block the track itself used to be, so a
        // toggle in a form column still fills its row.
        fill ? "w-full" : "inline-flex max-w-full min-w-0 align-top"
      } ${className}`}
    >
      <div
        ref={trackRef}
        role={asTabs ? "tablist" : "group"}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        // min-w-0 is what lets the track shrink below its content inside the
        // inline-flex wrapper above — without it the flex item keeps its
        // max-content width and overflows instead of scrolling.
        className={`${fill ? "flex w-full" : "inline-flex max-w-full"} min-w-0 overflow-x-auto no-scrollbar items-center gap-1 rounded-xl p-[4px]`}
        style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}
      >
        {items.map((o, i) => {
          const active = value === o.value;
          return (
            <button
              key={String(o.value)}
              ref={(el) => {
                btnRefs.current[i] = el;
                if (active) activeRef.current = el;
              }}
              type="button"
              role={asTabs ? "tab" : undefined}
              aria-selected={asTabs ? active : undefined}
              aria-pressed={asTabs ? undefined : active}
              // Roving tabindex: one stop for the whole tablist, arrows move within.
              tabIndex={asTabs ? (active ? 0 : -1) : undefined}
              title={o.title}
              disabled={o.disabled}
              onClick={() => !o.disabled && onChange?.(o.value)}
              // `flex-1` keeps the equal shares `fill` promises WHILE the labels
              // fit; a flex item's automatic minimum size then floors each
              // segment at its own text, so a set that does not fit overflows
              // the scroller instead of being squeezed into unreadable slivers.
              className={`${fill ? "flex-1" : "flex-shrink-0"} inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${seg}`}
              style={
                active
                  ? { background: "var(--brand)", color: "#fff", fontWeight: 600 }
                  : { background: "transparent", color: "var(--text-3)", opacity: o.disabled ? 0.45 : 1 }
              }
            >
              {o.label}
            </button>
          );
        })}
      </div>
      {/* Edge fades stand in for the scrollbar the track hides — without them an
          overflowing set of options gives no hint that more exist off-screen. */}
      {edges.start && (
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-8 rounded-l-xl"
          style={{ background: "linear-gradient(to right, var(--bg-inner), transparent)" }}
        />
      )}
      {edges.end && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-8 rounded-r-xl"
          style={{ background: "linear-gradient(to left, var(--bg-inner), transparent)" }}
        />
      )}
    </div>
  );
}
