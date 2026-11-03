/**
 * The launcher's backdrop (pages/AppLauncher.jsx, handed to Layout's
 * `backdrop`). The operator's reference (2026-11-03): a warm golden gradient
 * with Safia's own products floating in it at different depths — the far ones
 * small and soft, the near ones large and cut by the screen's edge.
 *
 * The products are Safia's catalog — the Oreo, Bejeviy and Smorodina cakes, a
 * latte macchiato, the pistachio croissant, macarons, the takeaway cup — drawn
 * here as cartoons in one soft-clay style, the operator's pick over the real
 * photos («make them cartoonish like the coffee»). No image files: the shapes
 * once, in a hidden sprite, each floating product a <use> of one of them. The
 * depth blur and the drop shadow are SVG filters inside the drawing, so they
 * are rasterised ONCE with the object; the float itself is a CSS transform the
 * compositor moves (index.css, «Ilovalar»).
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

// A round cake on its board, seen from a little above: the body is a
// cylinder (BODY), the top an ellipse (cx 100, cy 82, rx 70, ry 20).
const BODY = "M30 82V136a70 20 0 0 0 140 0V82z";
function Cake({ id, body, top, children, under }) {
  return (
    <symbol id={id} viewBox="0 0 200 200">
      <Cyl id={`${id}-body`} stops={body} />
      <Ball id={`${id}-top`} light={top[0]} mid={top[1]} dark={top[2]} />
      <clipPath id={`${id}-clip`}><path d={BODY} /></clipPath>
      <ellipse cx="100" cy="144" rx="86" ry="24" fill="#cbbfae" />
      <ellipse cx="100" cy="140" rx="86" ry="24" fill="url(#lo-board)" />
      <path d={BODY} fill={`url(#${id}-body)`} />
      <g clipPath={`url(#${id}-clip)`}>{under}</g>
      <ellipse cx="100" cy="82" rx="70" ry="20" fill={`url(#${id}-top)`} />
      {children}
    </symbol>
  );
}

// Where a point on the cake top's front edge sits, for a given x.
const frontY = (x) => 82 + 20 * Math.sqrt(Math.max(0, 1 - ((x - 100) / 70) ** 2));

// Deterministic scatter (no Math.random: the drawing is the same every time).
const scatter = (n, seed, fn) => Array.from({ length: n }, (_, i) => {
  const a = Math.sin((i + 1) * 12.9898 + seed) * 43758.5453;
  const b = Math.sin((i + 1) * 78.233 + seed) * 12345.6789;
  return fn(a - Math.floor(a), b - Math.floor(b), i);
});

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

        <radialGradient id="lo-board" cx=".42" cy=".32" r=".8">
          <stop offset="0" stopColor="#ffffff" /><stop offset=".7" stopColor="#f3eee6" /><stop offset="1" stopColor="#e2d9cb" />
        </radialGradient>

        {/* Small pieces the cakes are decorated with. */}
        <Ball id="lo-oreo-w" light="#5a463e" mid="#2e211c" dark="#1a110d" />
        <g id="lo-oreo">
          <circle cx="2.4" cy="0" r="12" fill="#f6eddc" />
          <circle cx="0" cy="0" r="12" fill="url(#lo-oreo-w)" />
          <circle cx="0" cy="0" r="8.4" fill="none" stroke="#4a3830" strokeWidth="1.3" />
          {[[-3.5, -3.5], [3.5, -3.5], [-3.5, 3.5], [3.5, 3.5], [0, 0]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.2" fill="#4a3830" />
          ))}
        </g>
        <Ball id="lo-straw-g" light="#ff8f8f" mid="#e2384c" dark="#a3142b" />
        <g id="lo-straw">
          <path d="M0 -11C10 -11 12 -1 0 13C-12 -1 -10 -11 0 -11z" fill="url(#lo-straw-g)" />
          {[[-4, -4], [3, -5], [-1, 1], [4, 2], [-5, 3], [0, 7]].map(([x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx=".9" ry="1.3" fill="#ffe08a" />
          ))}
          <ellipse cx="-4" cy="-11" rx="6" ry="2.4" fill="#4f9a3a" transform="rotate(-25 -4 -11)" />
          <ellipse cx="4" cy="-11" rx="6" ry="2.4" fill="#5aa843" transform="rotate(25 4 -11)" />
          <ellipse cx="0" cy="-13" rx="2.2" ry="4.5" fill="#3f8a2d" />
        </g>
        <Ball id="lo-kiss-g" light="#ffffff" mid="#f6dfe4" dark="#d6a3ae" />
        <g id="lo-kiss">
          <path d="M0 -13C3 -7 10 -3 10 3C10 9 -10 9 -10 3C-10 -3 -3 -7 0 -13z" fill="url(#lo-kiss-g)" />
          <path d="M-6 2C-2 -2 4 0 6 -3" fill="none" stroke="#e6b9c3" strokeWidth="1.3" strokeLinecap="round" />
        </g>
        <Ball id="lo-rasp-g" light="#ff8fa1" mid="#e02a4c" dark="#9e1230" />
        <g id="lo-rasp">
          <circle r="7" fill="url(#lo-rasp-g)" />
          {[[-3, -3], [2, -4], [4, 1], [-1, 2], [-4, 2], [1, 5]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.6" fill="#ffb0be" opacity=".55" />
          ))}
        </g>
        <Ball id="lo-black-g" light="#7a4a78" mid="#3c1f3b" dark="#1d0e1c" />
        <g id="lo-black">
          <circle r="6.5" fill="url(#lo-black-g)" />
          {[[-2.6, -2.6], [2, -3], [3, 1.6], [-1, 2], [-3.4, 1.4]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="1.5" fill="#a06aa0" opacity=".5" />
          ))}
        </g>
        <Ball id="lo-rose-g" light="#ffe3ec" mid="#f3a1b8" dark="#d26b8a" />
        <g id="lo-rose">
          <circle r="11" fill="url(#lo-rose-g)" />
          <path d="M-3 0a3 3 0 1 1 6 0a5 5 0 1 1 -10 0a7 7 0 1 1 14 0" fill="none" stroke="#c45d7e" strokeWidth="1.3" strokeLinecap="round" opacity=".8" />
        </g>

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

        {/* Oreo cake: chocolate sponge, a ganache top running over the edge,
            Oreos standing in it and strawberries in front. */}
        <Cake id="lo-cake-oreo"
              body={[[0, "#3e2112"], [.22, "#7d4c2f"], [.55, "#5e3620"], [1, "#2f190c"]]}
              top={["#8a5838", "#5e361f", "#432414"]}
              under={scatter(46, 3, (a, b, i) => (
                <circle key={i} cx={32 + a * 136} cy={92 + b * 48} r={1 + (i % 3) * .5} fill="#9a6644" opacity=".55" />
              ))}>
          <path d="M31 84A69 19 0 0 0 169 84" fill="none" stroke="#4a2816" strokeWidth="7" strokeLinecap="round" />
          {[[46, 11], [66, 15], [92, 9], [120, 14], [146, 10]].map(([x, h]) => (
            <rect key={x} x={x - 3.5} y={frontY(x) - 3} width="7" height={h} rx="3.5" fill="#4a2816" />
          ))}
          {[[60, 70, -18], [82, 66, -6], [104, 65, 6], [126, 67, 14], [146, 72, 22]].map(([x, y, r]) => (
            <use key={x} href="#lo-oreo" transform={`translate(${x} ${y}) rotate(${r})`} />
          ))}
          {[[72, 84, -12], [98, 88, 6], [124, 85, 14], [148, 82, 20]].map(([x, y, r]) => (
            <use key={x} href="#lo-straw" transform={`translate(${x} ${y}) rotate(${r})`} />
          ))}
          <ellipse cx="62" cy="80" rx="12" ry="3" fill="#fff" opacity=".18" transform="rotate(-8 62 80)" />
        </Cake>

        {/* «Safiya bejeviy»: cream cake with gold lines, chocolate rings,
            meringue kisses and berries. */}
        <Cake id="lo-cake-bej"
              body={[[0, "#e0d0b2"], [.2, "#fffaf1"], [.55, "#f7efe0"], [1, "#d4c09d"]]}
              top={["#fffdf8", "#f8f0e2", "#e9dbbf"]}
              under={
                <g fill="none" stroke="#d3a148" strokeWidth="1.25" strokeOpacity=".9" strokeLinecap="round">
                  <path d="M38 96l26 50M70 88l-18 58M84 104l30 44M120 92l-20 56M136 100l26 44M160 92l-14 52M52 120l80-22M100 132l58-30" />
                </g>
              }>
          {scatter(34, 7, (a, b, i) => {
            const t = (i / 34) * Math.PI * 2;
            return <circle key={i} cx={100 + 67 * Math.cos(t)} cy={82 + 18 * Math.sin(t)} r={1.4 + a} fill="#f1dfb8" opacity={.7 + b * .3} />;
          })}
          {[[78, 70], [87, 70], [96, 70], [82, 77], [91, 77], [100, 77], [86, 84], [95, 84], [104, 84], [109, 70]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4.2" fill="none" stroke="#956238" strokeWidth="1.8" />
          ))}
          <use href="#lo-kiss" transform="translate(70 72)" />
          <use href="#lo-kiss" transform="translate(128 70)" />
          <use href="#lo-kiss" transform="translate(112 90)" />
          <use href="#lo-rasp" transform="translate(86 64)" />
          <use href="#lo-rasp" transform="translate(140 82)" />
          <use href="#lo-black" transform="translate(62 84)" />
          <use href="#lo-black" transform="translate(120 80)" />
          <use href="#lo-black" transform="translate(150 72)" />
        </Cake>

        {/* «Smorodina»: white cake, a pink ribbon, roses on top. */}
        <Cake id="lo-cake-smo"
              body={[[0, "#e4ded6"], [.2, "#ffffff"], [.55, "#f6f3ef"], [1, "#d6cec3"]]}
              top={["#ffffff", "#f8f5f1", "#e8e1d7"]}
              under={<path d="M30 124a70 20 0 0 0 140 0V136a70 20 0 0 1-140 0z" fill="url(#lo-smo-ribbon)" />}>
          <Cyl id="lo-smo-ribbon" stops={[[0, "#d97692"], [.2, "#fbc2d0"], [.6, "#f2a2b6"], [1, "#c9617f"]]} />
          <path d="M128 52l14 22-30 4z" fill="#f4dc9f" stroke="#d9b56a" strokeWidth="1.2" />
          <path d="M130 58l-12 18M135 63l-16 13M124 56l10 16" stroke="#d9b56a" strokeWidth=".9" />
          {[[-30, 70, 86], [25, 110, 88], [-55, 76, 74], [40, 120, 74]].map(([r, x, y], i) => (
            <ellipse key={i} cx={x} cy={y} rx="10" ry="4" fill={i % 2 ? "#6ea852" : "#82bb63"} transform={`rotate(${r} ${x} ${y})`} />
          ))}
          <use href="#lo-rose" transform="translate(86 72)" />
          <use href="#lo-rose" transform="translate(106 70) scale(.92)" />
          <use href="#lo-rose" transform="translate(96 84) scale(.85)" />
          {[[116, 80], [120, 76], [123, 81], [119, 84], [114, 85]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="2.6" fill="#c8a3e6" />
          ))}
        </Cake>

        {/* Latte macchiato: milk, espresso and foam in a stemmed glass on a
            saucer, a little heart drawn in the foam. */}
        <symbol id="lo-latte" viewBox="0 0 200 200">
          <radialGradient id="lo-latte-saucer" cx=".42" cy=".3" r=".8">
            <stop offset="0" stopColor="#ffffff" /><stop offset=".75" stopColor="#f2ece3" /><stop offset="1" stopColor="#dcd2c3" />
          </radialGradient>
          <linearGradient id="lo-latte-coffee" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#fff8ee" /><stop offset=".14" stopColor="#f8ead6" />
            <stop offset=".22" stopColor="#c99464" /><stop offset=".55" stopColor="#a8703f" />
            <stop offset=".72" stopColor="#d9b48c" /><stop offset="1" stopColor="#efe2cd" />
          </linearGradient>
          <clipPath id="lo-latte-clip"><path d="M64 42l9 84q2 14 16 14h22q14 0 16-14l9-84z" /></clipPath>
          <ellipse cx="100" cy="170" rx="66" ry="14" fill="#cdbfac" />
          <ellipse cx="100" cy="167" rx="66" ry="14" fill="url(#lo-latte-saucer)" />
          <ellipse cx="100" cy="165" rx="38" ry="7" fill="#e6ddd0" />
          <ellipse cx="100" cy="161" rx="25" ry="5.5" fill="#e9f2f6" stroke="#fff" strokeWidth="1.5" opacity=".9" />
          <rect x="96" y="138" width="8" height="24" rx="3" fill="#e4eef3" opacity=".9" />
          <path d="M136 62c22 0 24 40-6 42" fill="none" stroke="#eaf3f7" strokeWidth="7" strokeLinecap="round" opacity=".85" />
          <g clipPath="url(#lo-latte-clip)"><rect x="60" y="38" width="80" height="106" fill="url(#lo-latte-coffee)" /></g>
          <path d="M64 42l9 84q2 14 16 14h22q14 0 16-14l9-84z" fill="#ffffff" fillOpacity=".08" stroke="#ffffff" strokeOpacity=".8" strokeWidth="2.2" />
          <ellipse cx="100" cy="43" rx="36" ry="7" fill="#fffaf2" stroke="#fff" strokeWidth="1.5" />
          <path d="M100 47c-6-5-10 0-6 3l6 4 6-4c4-3 0-8-6-3z" fill="#c08a5a" />
          <path d="M71 52l6 70" stroke="#fff" strokeOpacity=".55" strokeWidth="3.5" strokeLinecap="round" />
        </symbol>

        {/* Pistachio croissant: one crescent, its rolled layers as ridges,
            crushed pistachio and a white drizzle down its back. */}
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
          <path d="M48 97L58 106L66 90L76 99L86 82L96 91L106 78L116 89L124 82L134 97L142 89L152 104" fill="none" stroke="#fff6e6" strokeWidth="2.4" strokeOpacity=".85" strokeLinecap="round" strokeLinejoin="round" />
          {scatter(46, 11, (a, b, i) => {
            // along the croissant's back: the body's centre line, a little up
            const x = 44 + (i / 45) * 112;
            const u = (x - 100) / 80;
            const y = 82 + 54 * u * u + (b - .5) * 14;
            const c = ["#a9cc6c", "#6f9a3a", "#cfe19a", "#86b04d"][i % 4];
            return <rect key={i} x={x - 2} y={y - 1.6} width={3 + a * 3} height={2.6 + b * 2} rx="1.2" fill={c} transform={`rotate(${a * 180} ${x} ${y})`} />;
          })}
        </symbol>

        <Macaron id="lo-mac-pink" shell={["#fcd0da", "#f2a0b5", "#d9708c"]} feet="#f6b6c6" cream={["#fff7ec", "#f0dcc2"]} />
        <Macaron id="lo-mac-pist" shell={["#e2f0c8", "#b9d78f", "#8fb565"]} feet="#c8e0a4" cream={["#fff9ee", "#efe0c4"]} />
        <Macaron id="lo-mac-choc" shell={["#b88a70", "#86593f", "#5a3726"]} feet="#9b6c52" cream={["#6b3f26", "#4a2816"]} />

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
  ["lo-cup",       { left: "2%",   top: "27%" },    160,  -12, "near", 19, 0,  true],
  ["lo-cake-oreo", { right: "0%",  top: "30%" },    210,    6, "near", 23, 6,  true],
  ["lo-cake-smo",  { left: "12%",  top: "8%" },      170,   -8, "b7",   26, 3,  true],
  ["lo-mac-pist",  { right: "10%", top: "11%" },    112,   12, "b2",   21, 9,  true],
  ["lo-mac-choc",  { left: "33%",  top: "10%" },    78,    -8, "b7",   24, 4,  true],
  ["lo-cro",       { left: "2%",   bottom: "1%" },  230,  -16, "near", 22, 12, false],
  ["lo-cake-bej",  { right: "-5%", bottom: "-9%" }, 330,   -4, "near", 25, 2,  false],
  ["lo-latte",     { left: "39%",  bottom: "-6%" }, 160,    6, "b2",   20, 15, true],
  ["lo-mac-pink",  { right: "30%", bottom: "9%" },  96,    -8, "b4",   18, 7,  true],
  ["lo-bean",      { left: "24%",  top: "19%" },    30,   -40, "b4",   17, 11, true],
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
