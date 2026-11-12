import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Check, ChevronDown, ChevronUp, ChevronsDownUp, ChevronsUpDown, Clock3, Factory,
  KeyRound, LocateFixed, Minus, Plus, UserRound, UserRoundX,
} from "lucide-react";
import Button from "../ui/Button";
import BrandLogo from "../ui/BrandLogo";
import ProfileAvatar from "../ui/ProfileAvatar";
import { NODE_H, NODE_W, layoutTree, pathTo } from "../../utils/orgTree";
import { ROLE_ICON, roleHue, useNodeText } from "./orgNode";

/**
 * «Tashkiliy tuzilma» — the canvas: the tree drawn as cards and connectors on
 * a surface the reader drags and zooms.
 *
 *   - drag anywhere (a card too — a press that did not move is the click);
 *     two fingers pinch; a wheel pans and Ctrl/⌘ + wheel zooms at the cursor;
 *   - opening or folding a branch keeps the pressed card where it is on
 *     screen — the tree grows around it, never away from under the pointer;
 *   - `command` ({ type: "fit" | "focus", id?, seq }) is how the page asks for
 *     a move: fit the whole tree, or bring one card to the middle.
 *
 * The scene (cards + connectors) is memoised apart from the view, so a drag
 * re-renders one transform and not two hundred cards.
 */

// K_HOME_MIN is the smallest a card is still READ at: a fit never shrinks
// below it — a tree wider than that runs off the edges instead (the whole of
// an opened plant fitted to the screen is a row of specks at 30%).
const K_MIN = 0.25, K_MAX = 1.6, K_HOME_MIN = 0.9;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const GREEN = "#22c55e", YELLOW = "#eab308", BLUE = "#3b82f6";
// A secondary Button is the canvas's own colour; on it, it takes the card's.
const ON_CANVAS = { background: "var(--bg-card)" };

function IconChip({ icon: Icon, hue }) {
  return (
    <span
      className="chat-ink grid place-items-center w-9 h-9 rounded-xl flex-shrink-0"
      style={hue
        ? { "--ink": hue, background: `${hue}1f` }
        : { background: "var(--bg-inner)", color: "var(--text-2)", border: "1px solid var(--border)" }}
    >
      <Icon size={17} aria-hidden="true" />
    </span>
  );
}

function Badge({ icon: Icon, hue, title }) {
  return (
    <span
      title={title}
      className="grid place-items-center w-[18px] h-[18px] rounded-full flex-shrink-0"
      style={hue ? { background: `${hue}26`, color: hue } : { color: "var(--text-4)" }}
    >
      <Icon size={11} strokeWidth={2.4} aria-hidden="true" />
    </span>
  );
}

const Card = memo(function Card({
  node, root, x, y, selected, dim, mark, hits, lensOn, open, P, text, onSelect, onToggle,
}) {
  const { title, sub } = text(node, root);
  const p = node.profile;
  const vacant = node.kind === "person" && !p.accounts.length;
  const personal = node.kind === "person" && (
    Object.keys(p.grants).length > 0 || p.denies.length > 0
    || p.accounts.some((a) => Object.keys(a.grants).length > 0 || a.denies.length > 0));
  const under = node.people - (node.kind === "person" ? 1 : 0);

  let lead;
  if (node.kind === "person") {
    lead = (
      <ProfileAvatar
        name={title} colorKey={p.name} profileKey={p.key} photoVer={p.photo_ver} size={36}
        style={vacant ? { opacity: 0.45, filter: "grayscale(1)" } : undefined}
      />
    );
  } else if (node.kind === "root") {
    lead = <BrandLogo className="w-9 h-9 rounded-xl flex-shrink-0" />;
  } else if (node.kind === "group") {
    lead = <IconChip icon={ROLE_ICON[node.role] ?? UserRound} hue={roleHue(node.role)} />;
  } else {
    lead = <IconChip icon={node.kind === "factory" ? Factory : Clock3} />;
  }

  return (
    <div
      className="absolute"
      style={{ left: x, top: y, width: NODE_W, height: NODE_H, animation: "modalFade .2s ease-out" }}
    >
      {/* The dimming is the card's alone: a folded branch that holds matches
          says so on its pill, and that must stay readable. */}
      <button
        type="button"
        data-org-node={node.id}
        title={sub ? `${title} — ${sub}` : title}
        aria-pressed={selected}
        onClick={() => onSelect(node.id)}
        className="w-full h-full flex items-center gap-2.5 pl-2.5 pr-2 rounded-xl text-left transition-[box-shadow,opacity] hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          opacity: dim ? 0.36 : 1,
          background: selected
            ? "linear-gradient(var(--brand-bg), var(--brand-bg)), var(--bg-card)"
            : "var(--bg-card)",
          border: `1px ${vacant ? "dashed" : "solid"} ${selected ? "var(--brand)" : "var(--border-md)"}`,
          boxShadow: selected ? "0 0 0 1px var(--brand), 0 4px 14px rgba(0,0,0,.10)" : "0 1px 2px rgba(0,0,0,.06)",
          outlineColor: "var(--brand)",
        }}
      >
        {lead}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold leading-tight"
                style={{ color: vacant ? "var(--text-3)" : "var(--text-1)" }}>{title}</span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[11px] leading-tight" style={{ color: "var(--text-3)" }}>
            {node.kind === "person" && (
              <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: roleHue(p.role) }} />
            )}
            <span className="truncate">{sub || " "}</span>
          </span>
        </span>
        <span className="flex items-center gap-1 flex-shrink-0">
          {mark === "on" && <Badge icon={Check} hue={GREEN} title={P.lensOpen} />}
          {mark === "part" && <Badge icon={Check} hue={YELLOW} title={P.lensLogin} />}
          {personal && <Badge icon={KeyRound} hue={BLUE} title={P.personalTip} />}
          {vacant && <Badge icon={UserRoundX} title={P.vacantTip} />}
        </span>
      </button>

      {node.children.length > 0 && (
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${open ? P.collapse : P.expand}: ${title}`}
          title={open ? P.collapse : P.expand}
          onClick={() => onToggle(node.id)}
          className="absolute left-1/2 flex items-center gap-0.5 h-[22px] px-2 rounded-full text-[11px] font-semibold tabular-nums whitespace-nowrap before:absolute before:-inset-2 before:content-['']"
          style={{
            bottom: -11, transform: "translateX(-50%)",
            background: "var(--bg-card)", border: "1px solid var(--border-md)",
            color: "var(--text-2)", boxShadow: "0 1px 2px rgba(0,0,0,.08)",
          }}
        >
          {lensOn && hits > 0 && (
            <span className="flex items-center gap-1 mr-0.5" style={{ color: GREEN }}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: GREEN }} />{hits}
              <span style={{ color: "var(--text-4)" }}>/</span>
            </span>
          )}
          {open && !(lensOn && hits > 0) ? null : <span>{lensOn && hits > 0 ? under : `+${under}`}</span>}
          {open ? <ChevronUp size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
});

const Scene = memo(function Scene({
  layout, root, expanded, selected, trail, marks, hits, lensOn, P, text, onSelect, onToggle,
}) {
  // Top-down, left-to-right — the order Tab should walk the cards in.
  const cards = useMemo(
    () => [...layout.nodes].sort((a, b) => a.y - b.y || a.x - b.x),
    [layout],
  );
  const lit = layout.links.filter((l) => trail.has(l.id));
  return (
    <>
      <svg
        className="absolute left-0 top-0 pointer-events-none" aria-hidden="true"
        width={layout.width} height={layout.height} style={{ overflow: "visible" }}
        fill="none" strokeLinecap="round"
      >
        <g stroke="var(--text-4)" strokeWidth="1.5" opacity="0.75">
          {layout.links.map((l) => <path key={l.id} d={l.d} />)}
        </g>
        <g stroke="var(--brand)" strokeWidth="2">
          {lit.map((l) => <path key={l.id} d={l.d} />)}
        </g>
      </svg>
      {cards.map(({ node, x, y }) => {
        const mark = node.kind === "person" ? marks?.get(node.id) : undefined;
        const n = hits?.get(node.id) || 0;
        return (
          <Card
            key={node.id} node={node} root={root} x={x} y={y}
            selected={selected === node.id}
            dim={lensOn && (node.kind === "person" ? !mark : n === 0)}
            mark={lensOn ? mark : undefined}
            hits={node.kind === "person" ? n - (mark ? 1 : 0) : n}
            lensOn={lensOn}
            open={expanded.has(node.id)}
            P={P} text={text} onSelect={onSelect} onToggle={onToggle}
          />
        );
      })}
    </>
  );
});

export default function OrgCanvas({
  tree, expanded, selected, marks, hits, lensOn, P, command, insetLeft = 0,
  onSelect, onToggle, onExpandAll, onCollapseAll, height, children,
}) {
  const text = useNodeText(P);
  const layout = useMemo(() => layoutTree(tree.root, expanded), [tree, expanded]);
  const trail = useMemo(
    () => new Set(selected ? pathTo(tree.index, selected) : []),
    [tree, selected],
  );

  const vpRef = useRef(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const [glide, setGlide] = useState(false);   // animate the next programmatic move
  const [grabbing, setGrabbing] = useState(false);
  // What the handlers and the effects below read: the latest of everything,
  // without re-subscribing a listener on every drag frame. Written first among
  // the layout effects, so each one after it sees this render's values.
  const live = useRef({ view, vp, layout, insetLeft, tree });
  useLayoutEffect(() => { live.current = { view, vp, layout, insetLeft, tree }; });

  useLayoutEffect(() => {
    const el = vpRef.current;
    if (!el) return undefined;
    const measure = () => setVp({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const moveTo = useCallback((next, animate) => {
    setGlide(Boolean(animate));
    setView(next);
  }, []);

  // The home view (the first sight, the «centre» button, after «expand all»):
  // the whole tree when it fits at a size a card still reads at; otherwise the
  // root in the middle and the branches running off both edges, to drag.
  const fit = useCallback((animate = true) => {
    const { vp: v, layout: l, insetLeft: inset, tree: tr } = live.current;
    if (!v.w || !v.h) return;
    const pad = 28, room = Math.max(160, v.w - inset);
    const all = Math.min((room - 2 * pad) / l.width, (v.h - 2 * pad - 44) / l.height);
    const k = clamp(all, K_HOME_MIN, 1);
    const rootMid = (l.pos.get(tr.root.id)?.x ?? 0) + NODE_W / 2;
    moveTo({
      k,
      x: l.width * k <= room - 2 * pad
        ? inset + (room - l.width * k) / 2
        : inset + room / 2 - rootMid * k,
      y: pad,
    }, animate);
  }, [moveTo]);

  const focus = useCallback((id) => {
    const { vp: v, layout: l, view: cur, insetLeft: inset } = live.current;
    const p = l.pos.get(id);
    if (!p || !v.w) return;
    const k = clamp(Math.max(cur.k, 0.85), K_MIN, 1.15);
    moveTo({
      k,
      x: inset + (v.w - inset) / 2 - (p.x + NODE_W / 2) * k,
      y: v.h * 0.4 - (p.y + NODE_H / 2) * k,
    }, true);
  }, [moveTo]);

  // The first sight of a tree is the whole of it.
  const fitted = useRef(null);
  useLayoutEffect(() => {
    if (!vp.w || !vp.h || fitted.current === tree) return;
    fitted.current = tree;
    fit(false);
  }, [tree, vp.w, vp.h, fit]);

  // A branch opened or folded: the pressed card stays where it was on screen.
  const anchor = useRef(null);
  const toggle = useCallback((id) => {
    const { view: v, layout: l } = live.current;
    const p = l.pos.get(id);
    anchor.current = p ? { id, sx: p.x * v.k + v.x, sy: p.y * v.k + v.y } : null;
    onToggle(id);
  }, [onToggle]);

  const done = useRef(0);
  useLayoutEffect(() => {
    const a = anchor.current;
    anchor.current = null;
    if (a) {
      const p = layout.pos.get(a.id);
      if (p) { setGlide(false); setView((v) => ({ ...v, x: a.sx - p.x * v.k, y: a.sy - p.y * v.k })); }
    }
    if (command && command.seq !== done.current) {
      done.current = command.seq;
      if (command.type === "focus") focus(command.id);
      else fit(true);
    }
    // `layout` is the trigger: a command usually arrives with the expansion
    // that makes its card exist.
  }, [layout, command, focus, fit]);

  // The side panel covers the canvas's left edge: a card picked under it
  // slides out, by just as much as was hidden.
  useEffect(() => {
    if (!selected || !insetLeft) return;
    const { view: v, layout: l } = live.current;
    const p = l.pos.get(selected);
    if (!p) return;
    const sx = p.x * v.k + v.x;
    if (sx < insetLeft) moveTo({ ...v, x: v.x + insetLeft + 16 - sx }, true);
  }, [selected, insetLeft, moveTo]);

  const zoomAt = useCallback((mx, my, k2, animate) => {
    const v = live.current.view;
    const k = clamp(k2, K_MIN, K_MAX);
    moveTo({ k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k }, animate);
  }, [moveTo]);

  const zoomStep = (f) => {
    const { vp: v, view: cur, insetLeft: inset } = live.current;
    zoomAt(inset + (v.w - inset) / 2, v.h / 2, cur.k * f, true);
  };

  // Wheel: a native, non-passive listener — React's is passive and could not
  // keep the page from scrolling (or the browser from zooming) underneath.
  useEffect(() => {
    const el = vpRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (e.target.closest?.("[data-org-nopan]")) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(e.clientX - r.left, e.clientY - r.top, live.current.view.k * Math.exp(-e.deltaY * 0.0022), false);
      } else {
        const unit = e.deltaMode === 1 ? 32 : 1;
        setGlide(false);
        setView((v) => ({ ...v, x: v.x - e.deltaX * unit, y: v.y - e.deltaY * unit }));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // Pointers: one drags, two pinch.
  const ptrs = useRef(new Map());
  const drag = useRef(null);
  const pinch = useRef(null);
  const swallow = useRef(false);

  const startDrag = (e, moved) => {
    const v = live.current.view;
    drag.current = { sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved };
  };
  const onPointerDown = (e) => {
    if (e.target.closest?.("[data-org-nopan]")) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    swallow.current = false;
    if (ptrs.current.size === 1) startDrag(e, false);
    else if (ptrs.current.size === 2) {
      const [a, b] = [...ptrs.current.values()];
      const r = vpRef.current.getBoundingClientRect();
      const v = live.current.view;
      const mx = (a.x + b.x) / 2 - r.left, my = (a.y + b.y) / 2 - r.top;
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: v.k, wx: (mx - v.x) / v.k, wy: (my - v.y) / v.k, left: r.left, top: r.top };
      swallow.current = true;
      setGlide(false);
    }
  };
  const onPointerMove = (e) => {
    if (!ptrs.current.has(e.pointerId)) return;
    ptrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch.current && ptrs.current.size >= 2) {
      const [a, b] = [...ptrs.current.values()];
      const q = pinch.current;
      const k = clamp(q.k * (Math.hypot(a.x - b.x, a.y - b.y) / q.d), K_MIN, K_MAX);
      const mx = (a.x + b.x) / 2 - q.left, my = (a.y + b.y) / 2 - q.top;
      setView({ k, x: mx - q.wx * k, y: my - q.wy * k });
      return;
    }
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx, dy = e.clientY - d.sy;
    if (!d.moved) {
      if (Math.hypot(dx, dy) < 5) return;
      d.moved = true;
      swallow.current = true;
      setGrabbing(true);
      setGlide(false);
      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* gone */ }
    }
    setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = (e) => {
    if (!ptrs.current.delete(e.pointerId)) return;
    if (ptrs.current.size < 2) pinch.current = null;
    if (ptrs.current.size === 1) {
      const [rest] = [...ptrs.current.values()];
      startDrag({ clientX: rest.x, clientY: rest.y }, true);
    } else if (ptrs.current.size === 0) {
      drag.current = null;
      setGrabbing(false);
      // The click this gesture may still produce comes in the same task; one
      // that comes later (Enter on a focused card) is its own and must count.
      if (swallow.current) setTimeout(() => { swallow.current = false; }, 60);
    }
  };
  // A press that turned into a drag is not a click on the card under it.
  const onClickCapture = (e) => {
    if (!swallow.current) return;
    swallow.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const dot = 20 * view.k;
  return (
    <div
      ref={vpRef}
      className="relative overflow-hidden rounded-2xl select-none"
      style={{
        height, touchAction: "none", cursor: grabbing ? "grabbing" : "grab",
        background: "var(--bg-inner)", border: "1px solid var(--border)",
        backgroundImage: "radial-gradient(circle, var(--border-md) 1px, transparent 1.2px)",
        backgroundSize: `${dot}px ${dot}px`,
        backgroundPosition: `${view.x}px ${view.y}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onClickCapture={onClickCapture}
    >
      <div
        className="absolute left-0 top-0"
        style={{
          width: layout.width, height: layout.height, transformOrigin: "0 0",
          transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`,
          transition: glide ? "transform .32s cubic-bezier(.2,.7,.2,1)" : "none",
        }}
        onTransitionEnd={(e) => { if (e.target === e.currentTarget) setGlide(false); }}
      >
        <Scene
          layout={layout} root={tree.root} expanded={expanded} selected={selected} trail={trail}
          marks={marks} hits={hits} lensOn={lensOn} P={P} text={text}
          onSelect={onSelect} onToggle={toggle}
        />
      </div>

      {children}

      <div data-org-nopan className="absolute left-3 bottom-3 flex items-center gap-2" style={{ cursor: "default" }}>
        <Button variant="secondary" size="md" style={ON_CANVAS} icon={<ChevronsUpDown size={14} />} onClick={onExpandAll} title={P.expandAll} aria-label={P.expandAll}>
          <span className="hidden sm:inline">{P.expandAll}</span>
        </Button>
        <Button variant="secondary" size="md" style={ON_CANVAS} icon={<ChevronsDownUp size={14} />} onClick={onCollapseAll} title={P.collapseAll} aria-label={P.collapseAll}>
          <span className="hidden sm:inline">{P.collapseAll}</span>
        </Button>
        <span className="hidden lg:inline text-[11px] ml-1" style={{ color: "var(--text-3)" }}>{P.hint}</span>
      </div>

      <div data-org-nopan className="absolute right-3 bottom-3 flex items-center gap-2" style={{ cursor: "default" }}>
        <Button variant="secondary" size="md" style={ON_CANVAS} icon={<LocateFixed size={14} />} onClick={() => fit(true)} title={P.fit} aria-label={P.fit} />
        <div className="flex items-center rounded-lg" style={{ background: "var(--bg-card)", border: "1px solid var(--border-md)" }}>
          <Button variant="ghost" size="md" icon={<Minus size={14} />} onClick={() => zoomStep(1 / 1.25)} disabled={view.k <= K_MIN + 0.001} title={P.zoomOut} aria-label={P.zoomOut} />
          <span className="w-11 text-center text-xs font-semibold tabular-nums" style={{ color: "var(--text-2)" }}>
            {Math.round(view.k * 100)}%
          </span>
          <Button variant="ghost" size="md" icon={<Plus size={14} />} onClick={() => zoomStep(1.25)} disabled={view.k >= K_MAX - 0.001} title={P.zoomIn} aria-label={P.zoomIn} />
        </div>
      </div>
    </div>
  );
}
