import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { hasOpenDialog } from "../ui/dialogLayers";

/**
 * «Tashkiliy tuzilma» on the whole screen (2026-11-15, the operator: «open
 * this org structure itself in full / wide»): the view — toolbar and canvas —
 * lifted over the shell, sidebar and header included.
 *
 * It cannot simply turn `fixed`: the page sits in `.page-enter`, whose
 * transform makes a fixed box the size of the content column (Layout.jsx). So
 * the view always renders into ONE host node, and that node is MOVED — into
 * the page, or onto <body> while full. A moved node keeps its React tree, so
 * the draft, the lens, the open panel and a half-filled dialog all survive the
 * switch; a portal toggled on and off would remount them.
 *
 * z 45: over the rail (z-20 / 40) and under every dialog (Modal 50,
 * ConfirmDialog 100) and every portaled menu, so editing works unchanged.
 * Escape leaves — unless a dialog is up or a popover already took the key.
 */
const FULL_STYLE = [
  "position:fixed", "inset:0", "z-index:45", "display:flex", "flex-direction:column",
  "background:var(--bg-base)",
  "padding:calc(var(--tg-safe-top, 0px) + 12px) 16px calc(var(--tg-safe-bottom, 0px) + 12px)",
].join(";");

export default function FullView({ full, onExit, children }) {
  const slot = useRef(null);
  const [host] = useState(() => document.createElement("div"));

  useLayoutEffect(() => {
    const to = full ? document.body : slot.current;
    if (!to) return;
    host.style.cssText = full ? FULL_STYLE : "";
    host.className = full ? "fade-in" : "";
    if (host.parentNode !== to) to.appendChild(host);
  }, [full, host]);
  useEffect(() => () => host.remove(), [host]);

  useEffect(() => {
    if (!full) return undefined;
    const onKey = (e) => {
      if (e.key !== "Escape" || e.defaultPrevented || hasOpenDialog()) return;
      onExit();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [full, onExit]);

  return <div ref={slot}>{createPortal(children, host)}</div>;
}
