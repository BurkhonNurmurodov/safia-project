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
 *   scrollable – for option sets that overflow on phones. The track scrolls
 *               horizontally, the SELECTED segment is scrolled into view on
 *               mount and on change, and edge fades appear on whichever side
 *               still has content. Prefer this over wrapping the toggle in your
 *               own `overflow-x-auto` div: a bare wrapper hides the scrollbar
 *               without replacing the affordance, and leaves the selected
 *               segment off-screen — at which point nothing looks selected and
 *               the user can't tell where they are.
 *               It costs nothing while the options FIT: without `fill` the
 *               track is inline and shrink-wraps to its labels exactly like a
 *               plain toggle (capped at max-w-full), so a toolbar or tab strip
 *               can carry it permanently and only scrolls on the narrow screen
 *               that needs it. With `fill` it stays full-width, for the form
 *               panels that want the row filled.
 *   asTabs    – give the track tablist/tab semantics with aria-selected and
 *               arrow-key navigation, for when the toggle switches VIEWS rather
 *               than setting a value. (Plain toggles get aria-pressed instead.)
 *   ariaLabel – accessible name for the group/tablist
 *   className – extra wrapper classes (widths / shrink / margins only)
 */
export default function SegmentedToggle({
  value,
  onChange,
  options = [],
  size = "md",
  fill = false,
  scrollable = false,
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
    if (!scrollable) return;
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
  }, [value, scrollable, items.length]);

  useEffect(() => {
    if (!scrollable) return undefined;
    syncEdges();
    const el = trackRef.current;
    if (!el) return undefined;
    const onScroll = () => syncEdges();
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [scrollable, items.length]);

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

  const track = (
    <div
      ref={trackRef}
      role={asTabs ? "tablist" : "group"}
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={`${
        scrollable
          // min-w-0 is what lets the track shrink below its content inside the
          // inline-flex wrapper below — without it the flex item keeps its
          // max-content width and overflows instead of scrolling.
          ? `${fill ? "flex w-full" : "inline-flex max-w-full min-w-0"} overflow-x-auto no-scrollbar`
          : fill ? "flex w-full" : "inline-flex"
      } items-center gap-1 rounded-xl p-[4px] ${scrollable ? "" : className}`}
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
            className={`${fill && !scrollable ? "flex-1" : ""} ${
              scrollable ? "flex-shrink-0" : ""
            } inline-flex items-center justify-center gap-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${seg}`}
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
  );

  if (!scrollable) return track;

  // Edge fades stand in for the scrollbar the track hides — without them an
  // overflowing set of options gives no hint that more exist off-screen.
  return (
    <div
      className={`relative min-w-0 ${
        // The fades are positioned against THIS box, so it has to be the width
        // of the track and not of the row: a block wrapper would park the end
        // fade at the far edge of the page while the track ended mid-row.
        fill ? "" : "inline-flex max-w-full align-top"
      } ${className}`}
    >
      {track}
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
