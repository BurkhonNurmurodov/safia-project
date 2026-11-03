/**
 * The launcher's backdrop (pages/AppLauncher.jsx, handed to Layout's
 * `backdrop`). The operator's reference (2026-11-03): a warm golden gradient
 * with Safia's own things floating in it at different depths — a takeaway
 * coffee cup, macarons, a donut, a croissant, coffee beans — the far ones
 * small and soft, the near ones large and cut by the screen's edge.
 *
 * Everything is drawn here as SVG in one soft-clay style (no image files): the
 * shapes once, in a hidden sprite, and each floating object a <use> of one of
 * them. The depth blur and the drop shadow are SVG filters inside the drawing,
 * so they are rasterised ONCE with the object; the float itself is a CSS
 * transform the compositor moves (index.css, «Ilovalar»).
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
        <Macaron id="lo-mac-van" shell={["#fff1d2", "#f3d9a0", "#d9b46c"]} feet="#f6e2b6" cream={["#7b4a2c", "#5b331c"]} />

        {/* Glazed donut, tilted towards the viewer. */}
        <symbol id="lo-donut" viewBox="0 0 200 200">
          <Ball id="lo-donut-dough" light="#f7d39c" mid="#e3a462" dark="#b8742f" />
          <Ball id="lo-donut-glaze" light="#ffd3e1" mid="#f79bbb" dark="#de6f97" />
          <mask id="lo-donut-hole">
            <rect width="200" height="200" fill="#fff" />
            <ellipse cx="100" cy="98" rx="21" ry="14" fill="#000" />
          </mask>
          <g mask="url(#lo-donut-hole)">
            <ellipse cx="100" cy="106" rx="76" ry="56" fill="url(#lo-donut-dough)" />
            <path d="M34 98c0-28 30-46 66-46s66 18 66 46c0 10-6 16-12 15-6 0-6 8-12 9-7 1-8-7-14-6-7 1-8 10-16 10s-9-9-15-9-7 8-14 7-7-9-13-9-6 7-13 6c-9-1-13-10-13-23z" fill="url(#lo-donut-glaze)" />
          </g>
          <ellipse cx="100" cy="99" rx="23" ry="16" fill="none" stroke="#b05c7d" strokeOpacity=".35" strokeWidth="3" />
          {[[64, 78, 30, "#fff"], [84, 66, -20, "#7cc6e0"], [124, 70, 40, "#ffd166"], [140, 86, -35, "#8fd3a8"],
            [56, 98, 70, "#c3a6f5"], [122, 116, 15, "#fff"], [76, 116, -50, "#ffd166"], [148, 104, 60, "#7cc6e0"],
            [104, 62, 80, "#c3a6f5"], [96, 124, -10, "#8fd3a8"]].map(([x, y, r, c], i) => (
            <rect key={i} x={x - 5} y={y - 1.6} width="10" height="3.2" rx="1.6" fill={c} transform={`rotate(${r} ${x} ${y})`} />
          ))}
          <ellipse cx="70" cy="72" rx="16" ry="5" fill="#fff" opacity=".42" transform="rotate(-18 70 72)" />
        </symbol>

        {/* Croissant: one crescent, thick in the middle and thin at the horns,
            with the rolled layers drawn as ridges across it. */}
        <symbol id="lo-cro" viewBox="0 0 200 200">
          <radialGradient id="lo-cro-g" cx=".45" cy=".25" r=".8">
            <stop offset="0" stopColor="#fbd99a" /><stop offset=".45" stopColor="#e9a44c" /><stop offset="1" stopColor="#b5652a" />
          </radialGradient>
          <linearGradient id="lo-cro-ends" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0" stopColor="#7a3a12" stopOpacity=".45" /><stop offset=".3" stopColor="#7a3a12" stopOpacity="0" />
            <stop offset=".7" stopColor="#7a3a12" stopOpacity="0" /><stop offset="1" stopColor="#7a3a12" stopOpacity=".45" />
          </linearGradient>
          <path d="M20 142C34 92 66 58 100 58s66 34 80 84c-22-16-48-24-80-24s-58 8-80 24z" fill="url(#lo-cro-g)" />
          <path d="M20 142C34 92 66 58 100 58s66 34 80 84c-22-16-48-24-80-24s-58 8-80 24z" fill="url(#lo-cro-ends)" />
          <g fill="none" strokeLinecap="round">
            <g stroke="#8a4416" strokeOpacity=".5" strokeWidth="3.2">
              <path d="M44 98c10 10 12 20 6 30" /><path d="M70 72c12 14 14 30 8 46" />
              <path d="M130 72c-12 14-14 30-8 46" /><path d="M156 98c-10 10-12 20-6 30" />
            </g>
            <g stroke="#fff" strokeOpacity=".3" strokeWidth="2">
              <path d="M49 95c9 10 11 19 6 28" /><path d="M76 70c11 14 13 28 8 43" />
              <path d="M124 70c-11 14-13 28-8 43" /><path d="M151 95c-9 10-11 19-6 28" />
            </g>
          </g>
          <path d="M84 70c10-6 24-6 34 0" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="4" strokeLinecap="round" />
        </symbol>

        <symbol id="lo-bean" viewBox="0 0 200 200">
          <Ball id="lo-bean-g" light="#b47246" mid="#7f4223" dark="#4f2410" />
          <ellipse cx="100" cy="100" rx="52" ry="70" fill="url(#lo-bean-g)" />
          <path d="M108 34c-26 30 2 74-16 132" fill="none" stroke="#3a1a09" strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="80" cy="68" rx="12" ry="20" fill="#fff" opacity=".18" transform="rotate(-15 80 68)" />
        </symbol>
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
  ["lo-cup",      { left: "3%",   top: "30%" },    150, -16, "near", 19, 0,  true],
  ["lo-cup",      { right: "2%",  top: "36%" },    118,  14, "near", 23, 6,  true],
  ["lo-cup",      { left: "12%",  top: "-5%" },    104, -26, "b7",   26, 3,  false],
  ["lo-mac-pink", { right: "11%", top: "12%" },    96,   12, "b2",   21, 9,  true],
  ["lo-mac-pist", { left: "34%",  top: "11%" },    62,   -8, "b7",   24, 4,  true],
  ["lo-donut",    { left: "7%",   bottom: "5%" },  140, -10, "b2",   22, 12, false],
  ["lo-cro",      { right: "-3%", bottom: "-6%" }, 250, -12, "near", 25, 2,  false],
  ["lo-mac-van",  { left: "40%",  bottom: "-4%" }, 112,   8, "b4",   20, 15, true],
  ["lo-bean",     { right: "33%", bottom: "12%" }, 38,   32, "b4",   18, 7,  true],
  ["lo-bean",     { left: "24%",  top: "18%" },    30,  -40, "b7",   17, 11, true],
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
          className={`apps-float${wide ? " apps-float--wide" : ""}${depth === "near" ? " apps-float--near" : ""}`}
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
