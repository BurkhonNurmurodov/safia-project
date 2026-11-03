/**
 * The launcher's backdrop (pages/AppLauncher.jsx, handed to Layout's
 * `backdrop`). The operator's reference (2026-11-03): a warm golden gradient
 * with Safia's own products floating in it at different depths — the far ones
 * small and soft, the near ones large and cut by the screen's edge.
 *
 * Only the takeaway cup and macarons float (the operator, v4.396.1: the cakes
 * and the croissant were «too much distracting»), drawn as cartoons in one
 * soft-clay style. No image files: the shapes once, in a hidden sprite, each
 * floating product a <use> of one of them. The depth blur and the drop shadow
 * are SVG filters inside the drawing, so they are rasterised ONCE with the
 * object; the float itself is a CSS transform the compositor moves
 * (index.css, «Ilovalar»).
 */

// A cylinder's shading across its width: dark edge, light band, mid, dark edge.
function Cyl({ id, stops }) {
  return (
    <linearGradient id={id} x1="0" x2="1" y1="0" y2="0">
      {stops.map(([at, c]) => <stop key={at} offset={at} stopColor={c} />)}
    </linearGradient>
  );
}

// A soft lit ball: the light sits up and to the left.
function Ball({ id, light, mid, dark }) {
  return (
    <radialGradient id={id} cx=".36" cy=".3" r=".78">
      <stop offset="0" stopColor={light} />
      <stop offset=".55" stopColor={mid} />
      <stop offset="1" stopColor={dark} />
    </radialGradient>
  );
}

function Macaron({ id, shell, feet, cream }) {
  const [l, m, d] = shell;
  return (
    <symbol id={id} viewBox="0 0 200 200">
      <Ball id={`${id}-top`} light={l} mid={m} dark={d} />
      <linearGradient id={`${id}-low`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={m} /><stop offset="1" stopColor={d} />
      </linearGradient>
      <linearGradient id={`${id}-cream`} x1="0" x2="0" y1="0" y2="1">
        <stop offset="0" stopColor={cream[0]} /><stop offset="1" stopColor={cream[1]} />
      </linearGradient>
      <path d="M38 118c0 18 28 30 62 30s62-12 62-30c0-6-28-10-62-10s-62 4-62 10z" fill={`url(#${id}-low)`} />
      <ellipse cx="100" cy="116" rx="64" ry="12" fill={feet} stroke={l} strokeWidth="3" strokeDasharray="2.5 3" />
      <ellipse cx="100" cy="106" rx="58" ry="12" fill={`url(#${id}-cream)`} />
      <ellipse cx="100" cy="98" rx="64" ry="12" fill={feet} stroke={l} strokeWidth="3" strokeDasharray="2.5 3" />
      <path d="M36 96c0-30 30-46 64-46s64 16 64 46c0 6-28 10-64 10s-64-4-64-10z" fill={`url(#${id}-top)`} />
      <ellipse cx="78" cy="68" rx="20" ry="6" fill="#fff" opacity=".38" transform="rotate(-12 78 68)" />
    </symbol>
  );
}

function Sprite() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <defs>
        {/* Depth: a near object casts a soft warm shadow; a far one is out of
            focus. Generous regions, or the blur is clipped square. */}
        <filter id="lf-near" x="-40%" y="-40%" width="180%" height="190%">
          <feDropShadow dx="0" dy="12" stdDeviation="9" floodColor="#8a5a1c" floodOpacity=".28" />
        </filter>
        <filter id="lf-b2" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2" /></filter>
        <filter id="lf-b4" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="4" /></filter>
        <filter id="lf-b7" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="7" /></filter>

        {/* Takeaway coffee cup — the reference's own object. */}
        <symbol id="lo-cup" viewBox="0 0 200 200">
          <Cyl id="lo-cup-body" stops={[[0, "#e4c198"], [.2, "#fcefde"], [.55, "#f6dcbb"], [1, "#d3a777"]]} />
          <Cyl id="lo-cup-band" stops={[[0, "#c97c3f"], [.2, "#f2b47b"], [.6, "#e19659"], [1, "#b86a31"]]} />
          <Cyl id="lo-cup-rim" stops={[[0, "#33373d"], [.25, "#5f656e"], [.6, "#474c54"], [1, "#25282d"]]} />
          <Cyl id="lo-cup-lid" stops={[[0, "#3b3f46"], [.3, "#6c727b"], [.7, "#4f545c"], [1, "#2f3237"]]} />
          <Ball id="lo-cup-bean" light="#b77448" mid="#8a4a28" dark="#5c2c14" />
          <clipPath id="lo-cup-clip"><path d="M54 72h92l-11 96q-1.2 9-10 9H75q-8.8 0-10-9z" /></clipPath>
          <path d="M54 72h92l-11 96q-1.2 9-10 9H75q-8.8 0-10-9z" fill="url(#lo-cup-body)" />
          <g clipPath="url(#lo-cup-clip)">
            <rect x="40" y="140" width="120" height="40" fill="url(#lo-cup-band)" />
            <rect x="40" y="72" width="120" height="11" fill="#5a3a1a" opacity=".14" />
          </g>
          <ellipse cx="100" cy="108" rx="13" ry="17" fill="url(#lo-cup-bean)" transform="rotate(-22 100 108)" />
          <path d="M104 93c-8 8-1 22-8 30" fill="none" stroke="#4a220e" strokeWidth="2.6" strokeLinecap="round" />
          <rect x="46" y="58" width="108" height="18" rx="9" fill="url(#lo-cup-rim)" />
          <rect x="60" y="36" width="80" height="27" rx="13" fill="url(#lo-cup-lid)" />
          <rect x="72" y="41" width="22" height="5" rx="2.5" fill="#1f2226" opacity=".7" />
          <rect x="68" y="39" width="46" height="2.5" rx="1.25" fill="#fff" opacity=".2" />
          <rect x="54" y="61" width="66" height="2.5" rx="1.25" fill="#fff" opacity=".16" />
        </symbol>

        <Macaron id="lo-mac-pink" shell={["#fcd0da", "#f2a0b5", "#d9708c"]} feet="#f6b6c6" cream={["#fff7ec", "#f0dcc2"]} />
        <Macaron id="lo-mac-pist" shell={["#e2f0c8", "#b9d78f", "#8fb565"]} feet="#c8e0a4" cream={["#fff9ee", "#efe0c4"]} />
        <Macaron id="lo-mac-choc" shell={["#b88a70", "#86593f", "#5a3726"]} feet="#9b6c52" cream={["#6b3f26", "#4a2816"]} />
      </defs>
    </svg>
  );
}

// What floats where: [shape, position, size px, base tilt°, depth filter,
// float seconds, delay s, wide-only]. Positions keep to the edges — the tiles
// own the middle — and the near ones are cut by the screen's edge, as in the
// reference. `wide` ones are left out on a phone, where the tiles fill the
// width and only the corners above and below them are free.
const FLOATS = [
  ["lo-cup",      { left: "3%",   top: "25%" },    170,  -12, "near", 19, 0,  true],
  ["lo-mac-pist", { left: "14%",  top: "7%" },     104,  -14, "b4",   23, 6,  true],
  ["lo-cup",      { right: "15%", top: "10%" },    104,   10, "b7",   26, 3,  true],
  ["lo-mac-pink", { right: "1%",  top: "33%" },    150,   10, "near", 21, 9,  true],
  ["lo-mac-choc", { left: "35%",  top: "11%" },    66,    -8, "b7",   24, 4,  true],
  ["lo-mac-choc", { left: "2%",   bottom: "3%" },  176,  -10, "near", 22, 12, false],
  ["lo-cup",      { right: "-3%", bottom: "-6%" }, 270,    8, "near", 25, 2,  false],
  ["lo-mac-pist", { left: "39%",  bottom: "-3%" }, 124,    8, "b2",   20, 15, true],
  ["lo-mac-pink", { right: "31%", bottom: "10%" }, 82,    -8, "b4",   18, 7,  true],
];

// Gold dust — night only (index.css hides it by day, where the gold is the
// ground): [x %, y %, size px, rise s, start s].
const MOTES = [
  [8, 78, 3, 19, 0], [17, 34, 2, 23, 6], [26, 88, 4, 21, 11], [34, 52, 2, 26, 3],
  [43, 18, 3, 24, 15], [51, 72, 2, 20, 8], [59, 40, 4, 25, 1], [67, 90, 2, 22, 13],
  [74, 24, 3, 27, 5], [82, 64, 2, 21, 17], [90, 38, 3, 24, 9], [95, 84, 2, 23, 4],
];

export default function LauncherBackdrop() {
  return (
    <div className="apps-backdrop" aria-hidden="true">
      <Sprite />
      <span className="apps-light apps-light--a" />
      <span className="apps-light apps-light--c" />
      {FLOATS.map(([shape, at, size, tilt, depth, secs, delay, wide], i) => (
        <span
          key={i}
          className={`apps-float${wide ? " apps-float--wide" : ""}`}
          style={{ ...at, "--size": `${size}px`, "--tilt": `${tilt}deg`,
                   animationDuration: `${secs}s`, animationDelay: `-${delay}s` }}
        >
          <svg viewBox="0 0 200 200" width="100%" height="100%">
            <use href={`#${shape}`} filter={`url(#lf-${depth})`} />
          </svg>
        </span>
      ))}
      <span className="apps-veil" />
      {MOTES.map(([x, y, s, d, at], i) => (
        <i
          key={i}
          className="apps-mote"
          style={{ left: `${x}%`, top: `${y}%`, width: s, height: s,
                   animationDuration: `${d}s`, animationDelay: `-${at}s` }}
        />
      ))}
    </div>
  );
}
