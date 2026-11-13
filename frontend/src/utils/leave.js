/**
 * How a floating surface LEAVES the screen — the exit half of the motion
 * system (index.css, «Motion system (Tier 2)»; record in docs/motion.md).
 *
 * React removes an element the instant its state says so, and that is what the
 * LOGIC wants: focus goes back to the opener, Escape belongs to the next layer
 * down, the page under a dialog takes clicks again. Only the PIXELS should
 * linger. So nothing here delays an unmount. When a surface wearing
 * `useLeaveRef` is about to leave the document, a lifeless copy of it is left
 * in its place for the length of its exit animation and then removed.
 *
 * Why a copy, and why this is safe:
 *   · It is taken from the ref's cleanup, which React runs BEFORE it tears the
 *     children down and before it removes the node — in both ways a surface
 *     goes (the component unmounting, or `open` turning false). So the charts,
 *     photos and typed values are all still there to copy.
 *   · A clone carries no React handler, and it is `inert`, hidden from
 *     assistive tech and deaf to the pointer; its ids and names are stripped.
 *     Nothing can press it, focus it, find it or hear it announced twice.
 *   · React's own nodes are never moved or kept (`utils/domGuard.js` reports
 *     exactly that), so the reconciler sees what it always saw.
 *   · CSS decides the movement (`[data-leaving]` rules). The copy lives for
 *     the duration CSS gives its root and no longer; with no rule, under
 *     reduced motion, in a hidden tab, or for a surface too large to copy
 *     cheaply, there is no copy and the surface goes at once, as it always did.
 *
 * Only out-of-flow surfaces (fixed / absolute) get one: a copy of an in-flow
 * box would hold its space and then drop it — a list that moves by itself.
 */

// A surface this large is copied in more time than its exit lasts, on the
// phones this runs on. Menus are tens of nodes, form dialogs a few hundred.
const MAX_NODES = 1500;
// However CSS answers, a copy never outlives this.
const MAX_LIFE_MS = 500;

const ROOT_ONLY = ["id", "role", "tabindex", "aria-live", "aria-modal", "aria-label", "aria-labelledby", "aria-describedby"];

/** Longest time in a computed `animation-duration` / `-delay` list, in ms. */
function longest(list) {
  let ms = 0;
  for (const part of String(list || "").split(",")) {
    const n = parseFloat(part);
    if (n > 0) ms = Math.max(ms, part.trim().endsWith("ms") ? n : n * 1000);
  }
  return ms;
}

/** Child indexes from `root` down to `el` — the same walk finds its twin in a clone. */
function pathTo(root, el) {
  const path = [];
  for (let n = el; n !== root; n = n.parentNode) {
    if (!n || !n.parentNode) return null;
    path.push(Array.prototype.indexOf.call(n.parentNode.childNodes, n));
  }
  return path.reverse();
}

function follow(root, path) {
  let n = root;
  for (const i of path) {
    n = n.childNodes[i];
    if (!n) return null;
  }
  return n;
}

/**
 * Remember which elements inside `node` were scrolled. A clone starts at the
 * top, and a dialog read to its last row would jump back up as it fades.
 */
export function trackScroll(node) {
  const seen = new Set();
  try {
    node.addEventListener("scroll", (e) => { seen.add(e.target); }, { capture: true, passive: true });
  } catch { /* the surface still leaves; its copy starts unscrolled */ }
  return seen;
}

function dress(ghost) {
  ghost.setAttribute("data-leaving", "");
  ghost.setAttribute("aria-hidden", "true");
  ghost.setAttribute("inert", "");
  for (const a of ROOT_ONLY) ghost.removeAttribute(a);
  for (const el of ghost.querySelectorAll("[id], [name], [autofocus], [autoplay], iframe")) {
    // An SVG's ids are its own gradients and clip paths — a chart keeps them.
    if (!(el instanceof SVGElement)) el.removeAttribute("id");
    el.removeAttribute("name");
    el.removeAttribute("autofocus");
    el.removeAttribute("autoplay");
    if (el.tagName === "IFRAME") { el.removeAttribute("src"); el.removeAttribute("srcdoc"); }
  }
}

/**
 * Leave a copy of `node` behind to play its exit. Call it while `node` is
 * still in the document and about to be removed (a ref cleanup). `scrolled` is
 * what `trackScroll(node)` returned. Never throws: a surface that cannot be
 * copied simply goes.
 */
export function leaveGhost(node, scrolled) {
  try {
    if (!node || !node.isConnected || document.hidden) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;
    const parent = node.parentNode;
    const position = getComputedStyle(node).position;
    if (!parent || (position !== "fixed" && position !== "absolute")) return;
    if (node.getElementsByTagName("*").length > MAX_NODES) return;

    const next = node.nextSibling;
    const ghost = node.cloneNode(true);

    const offsets = [];
    scrolled?.forEach((el) => {
      if (!(el instanceof Element) || !(el.scrollTop || el.scrollLeft) || !node.contains(el)) return;
      const path = pathTo(node, el);
      if (path) offsets.push([path, el.scrollTop, el.scrollLeft]);
    });
    const canvases = [];
    for (const c of node.querySelectorAll("canvas")) {
      const path = pathTo(node, c);
      if (path) canvases.push([path, c]);
    }
    dress(ghost);

    // After the commit that is removing `node` — and before the next paint.
    queueMicrotask(() => {
      try {
        // Still there: React only rehearsed the unmount (StrictMode) or swapped
        // the ref. Nothing left, so nothing to show leaving.
        if (node.isConnected || !parent.isConnected) return;
        parent.insertBefore(ghost, next && next.parentNode === parent ? next : null);

        for (const [path, top, left] of offsets) {
          const el = follow(ghost, path);
          if (el) { el.scrollTop = top; el.scrollLeft = left; }
        }
        for (const [path, source] of canvases) {
          const el = follow(ghost, path);
          if (el && source.width && source.height) el.getContext("2d")?.drawImage(source, 0, 0);
        }

        const style = getComputedStyle(ghost);
        const life = longest(style.animationDuration) + longest(style.animationDelay);
        if (style.animationName === "none" || !(life > 0)) { ghost.remove(); return; }
        setTimeout(() => ghost.remove(), Math.min(life, MAX_LIFE_MS) + 34);
      } catch {
        ghost.remove();
      }
    });
  } catch { /* no copy — the surface leaves at once */ }
}
