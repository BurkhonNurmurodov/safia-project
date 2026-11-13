import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import useLeaveRef from "../../hooks/useLeaveRef";

/**
 * ActionMenu — THE row-actions control: a ⋮ button that opens a short list of
 * actions (edit · archive · delete …). One per table row or phone card, in place
 * of a row of icon buttons.
 *
 *   items  – [{ key, label, icon, onSelect, tone: "danger", disabled, title }]
 *            Falsy entries are skipped, so callers can write `cond && {...}`.
 *            A "danger" item after a normal one gets a divider above it.
 *            A disabled item stays listed, dimmed, its reason in `title`.
 *   label  – accessible name of the trigger and the menu (name the ROW in it:
 *            «Amallar: 9422»), also the trigger's tooltip.
 *   zIndex – 80 by default; pass 210+ inside a page's fullscreen overlay.
 *
 * The menu is portaled to <body> and positioned against the trigger, so a
 * scrolling table card never clips it; it opens downward, flips up when the
 * viewport has no room below, and is pushed back inside the screen's edges.
 * It closes on a pick, Escape, Tab, a tap outside, a scroll or a resize.
 * Clicks never reach the row underneath (rows here navigate on click — and
 * React carries a portal's events up its component tree, not the DOM's).
 * Keyboard: Enter / Space / ↓ open it on the first item, ↑ on the last;
 * ↑ ↓ Home End walk the enabled items; focus returns to the ⋮ on close.
 */
export default function ActionMenu({ items, label, zIndex = 80, className = "" }) {
  const list = (items || []).filter(Boolean);
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const menu = useRef(null);
  const setMenu = useLeaveRef(menu); // the list eases out when it closes
  const startAt = useRef("first");

  const enabled = () => [...(menu.current?.querySelectorAll('[role="menuitem"]:not([aria-disabled="true"])') || [])];

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  // Seat the menu against the trigger before it paints; written onto the node,
  // since a measurement must not cost a re-render.
  useLayoutEffect(() => {
    const el = menu.current;
    const btn = trigger.current;
    if (!open || !el || !btn) return;
    const r = btn.getBoundingClientRect();
    const pad = 8;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const left = Math.max(pad, Math.min(r.right - w, vw - w - pad));
    const below = r.bottom + 4;
    const flipped = below + h > vh - pad && r.top - 4 - h >= pad;
    const top = flipped ? r.top - 4 - h : Math.min(below, vh - h - pad);
    el.style.left = `${left}px`;
    el.style.top = `${Math.max(pad, top)}px`;
    // Opened upward: it rises out of the ⋮ instead of dropping from it.
    if (flipped) el.dataset.side = "top"; else delete el.dataset.side;
    el.style.visibility = "visible";
    const all = enabled();
    (startAt.current === "last" ? all[all.length - 1] : all[0])?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => {
      if (menu.current?.contains(e.target) || trigger.current?.contains(e.target)) return;
      close(false);
    };
    const scrolled = (e) => { if (!menu.current?.contains(e.target)) close(false); };
    const resized = () => close(false);
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", resized);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", resized);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!list.length) return null;

  const openAt = (where) => { startAt.current = where; setOpen(true); };

  const onTriggerKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); openAt("first"); }
    else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); openAt("last"); }
  };

  const onMenuKey = (e) => {
    e.stopPropagation();
    const all = enabled();
    const i = all.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); all[(i + 1) % all.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); all[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); all[all.length - 1]?.focus(); }
    else if (e.key === "Tab") close(false);
  };

  const pick = (it) => {
    if (it.disabled) return;
    // Focus back on the ⋮ first: a dialog the action opens takes the focused
    // element as its opener and hands focus back to it on close.
    close();
    it.onSelect?.();
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        onClick={(e) => { e.stopPropagation(); if (open) close(false); else openAt("first"); }}
        onKeyDown={onTriggerKey}
        // 32px square; an invisible pad takes the tap area to 44px.
        className={`relative inline-flex items-center justify-center w-8 h-8 rounded-lg border transition-colors outline-none
          hover:bg-[var(--bg-inner)] hover:text-[var(--text-1)] focus-visible:ring-2 focus-visible:ring-[var(--brand)]
          after:absolute after:-inset-1.5 after:content-[''] ${open ? "bg-[var(--bg-inner)] text-[var(--text-1)] border-[var(--border-md)]" : "text-[var(--text-3)] border-transparent"} ${className}`}
      >
        <MoreVertical size={16} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={setMenu}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          onClick={(e) => e.stopPropagation()}
          className="pop fixed rounded-xl py-1 overflow-hidden"
          style={{
            zIndex, top: 0, left: 0, visibility: "hidden",
            minWidth: 200, maxWidth: "calc(100vw - 16px)",
            background: "var(--bg-card)", border: "1px solid var(--border-md)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
          }}
        >
          {list.map((it, i) => {
            const Icon = it.icon;
            const danger = it.tone === "danger";
            const divider = danger && i > 0 && list[i - 1].tone !== "danger";
            return (
              <div key={it.key ?? i}>
                {divider && <div role="separator" className="my-1" style={{ borderTop: "1px solid var(--border)" }} />}
                <button
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={it.disabled || undefined}
                  title={it.title || undefined}
                  onClick={() => pick(it)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 sm:py-2 text-sm text-left whitespace-nowrap outline-none transition-colors
                    aria-disabled:cursor-not-allowed aria-disabled:opacity-50
                    ${danger
                      ? "hover:bg-[rgba(239,68,68,0.10)] focus-visible:bg-[rgba(239,68,68,0.10)] aria-disabled:hover:bg-transparent"
                      : "hover:bg-[var(--bg-inner)] focus-visible:bg-[var(--bg-inner)] aria-disabled:hover:bg-transparent"}`}
                  style={{ color: danger ? "var(--status-bad)" : "var(--text-1)" }}
                >
                  {Icon && (
                    <Icon size={15} aria-hidden="true" className="flex-shrink-0"
                      style={{ color: danger ? "var(--status-bad)" : "var(--text-3)" }} />
                  )}
                  <span>{it.label}</span>
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
