import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import useLeaveRef from "../../hooks/useLeaveRef";

/**
 * «Ilovalar» — what is INSIDE an app, shown while its tile is hovered
 * (2026-11-15, the operator: «when I hover over the app, the screens and menu
 * tabs inside should be visible and I should be able to go by pressing to a
 * certain screen»). The tile itself still opens the app where it was left;
 * this is the short way to one screen of it.
 *
 *   anchor  – the tile's element; the panel hangs under it, centred — over
 *             it when only that side has the room, BESIDE it (the screen's
 *             whole height) when neither does — pushed back inside the edges
 *             and kept clear of the header.
 *   groups  – [{ id, name, icon, app, danger, links: [{ to, label, icon, danger, count }] }]
 *             the app's own screens first (headed by the app's name, `app`),
 *             then one group per menu tab — the sidebar's own order, already
 *             narrowed to what this viewer may open (pages/AppLauncher.jsx).
 *   focus   – opened from the keyboard (↓ on the tile): focus the first screen.
 *   onEnter / onLeave – the pointer is on / off the panel (the launcher keeps
 *             it open while the pointer travels from the tile).
 *   onClose(refocus) – Escape, Tab, a press elsewhere, a scroll, a resize.
 *
 * Portaled to <body>: every tile is a stacking context of its own (its arrival
 * animation fills), so a panel inside one would paint under the next tile.
 * Groups sit side by side as columns and wrap when the screen is narrow; a
 * group of more than `TALL` screens (the admin app's «Tools») is laid in two
 * or three columns of its own, so one long menu tab does not decide the
 * panel's height; a panel still taller than the screen scrolls inside itself.
 */
const PAD = 8;   // kept clear of the screen's edges
const LAP = 6;   // how far the panel laps over the tile's own padding — no gap for the pointer to fall into
const TALL = 10; // screens in one column of a group
const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));

export default function AppPeek({ anchor, hue, label, groups, focus, onEnter, onLeave, onClose }) {
  const node = useRef(null);
  const setNode = useLeaveRef(node); // eases out as it closes

  const items = () => [...(node.current?.querySelectorAll('[role="menuitem"]') || [])];

  // Seated against the tile before it paints; written onto the node, since a
  // measurement must not cost a re-render (ActionMenu's way).
  useLayoutEffect(() => {
    const el = node.current;
    if (!el || !anchor) return;
    const r = anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    // Never over the header: its search and menus stay in reach.
    const floor = (document.querySelector(".hdr-on-backdrop")?.getBoundingClientRect().bottom ?? 0) + PAD;
    const below = vh - PAD - (r.bottom - LAP);
    const above = r.top + LAP - floor;
    let left, top;
    if (h <= below || h <= above) {
      const up = h > below;
      left = clamp(cx - w / 2, PAD, vw - w - PAD);
      top = up ? r.top + LAP - h : r.bottom - LAP;
      el.style.transformOrigin = `${cx - left}px ${up ? "100%" : "0"}`;
      if (up) el.dataset.side = "top";
    } else {
      const room = vh - PAD - floor;
      const height = Math.min(h, room);
      if (h > room) el.style.maxHeight = `${room}px`;
      const right = vw - PAD - (r.right - LAP);
      const onRight = w <= right || right >= r.left + LAP - PAD;
      left = clamp(onRight ? r.right - LAP : r.left + LAP - w, PAD, vw - w - PAD);
      top = clamp(cy - height / 2, floor, vh - PAD - height);
      el.style.transformOrigin = `${onRight ? "0" : "100%"} ${cy - top}px`;
    }
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
    if (focus) items()[0]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const inside = (t) => node.current?.contains(t) || anchor?.contains(t);
    const pressed = (e) => { if (!inside(e.target)) onClose(false); };
    const scrolled = (e) => { if (!node.current?.contains(e.target)) onClose(false); };
    const resized = () => onClose(false);
    const key = (e) => {
      if (e.key !== "Escape") return;
      onClose(Boolean(node.current?.contains(document.activeElement)));
    };
    document.addEventListener("pointerdown", pressed, true);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", resized);
    return () => {
      document.removeEventListener("pointerdown", pressed, true);
      document.removeEventListener("keydown", key);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", resized);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onKey = (e) => {
    const all = items();
    const i = all.indexOf(document.activeElement);
    if (e.key === "ArrowDown") { e.preventDefault(); all[(i + 1) % all.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); all[(i - 1 + all.length) % all.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); all[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); all[all.length - 1]?.focus(); }
    // Tab leaves from the TILE, so the next stop is the tile beside it — the
    // panel sits at the end of <body>, where Tab would walk out of the page.
    else if (e.key === "Tab") onClose(true);
  };

  return createPortal(
    <div
      ref={setNode}
      role="menu"
      aria-label={label}
      data-app-hue={hue}
      className="app-peek pop"
      style={{ visibility: "hidden" }}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      onKeyDown={onKey}
    >
      <div className="app-peek-cols">
        {groups.map((g) => {
          const GroupIcon = g.icon;
          const cols = Math.min(Math.ceil(g.links.length / TALL), 3);
          return (
            <div key={g.id} role="group" aria-label={g.name} className="app-peek-col" style={{ "--cols": cols }}>
              <div className={`app-peek-cap${g.app ? " is-app" : ""}${g.danger ? " is-danger" : ""}`}>
                {GroupIcon && <GroupIcon aria-hidden="true" />}
                <span className="truncate">{g.name}</span>
              </div>
              <div className="app-peek-list">
                {g.links.map((l) => {
                  const Icon = l.icon;
                  return (
                    <Link key={l.to} to={l.to} role="menuitem" tabIndex={-1} title={l.label}
                      className={`app-peek-row${l.danger ? " is-danger" : ""}`}>
                      {Icon && <Icon aria-hidden="true" />}
                      <span className="truncate">{l.label}</span>
                      {l.count > 0 && <span className="app-peek-count">{l.count > 99 ? "99+" : l.count}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>,
    document.body,
  );
}
