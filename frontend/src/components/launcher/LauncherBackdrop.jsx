import latte from "../../assets/launcher/latte.webp";
import oreo from "../../assets/launcher/oreo.webp";
import parij from "../../assets/launcher/parij-far.webp";
import macPistachio from "../../assets/launcher/macaron-pistachio.webp";
import macChocolate from "../../assets/launcher/macaron-chocolate.webp";
import croissant from "../../assets/launcher/croissant.webp";
import bejeviy from "../../assets/launcher/bejeviy.webp";
import mishka from "../../assets/launcher/mishka.webp";
import smorodina from "../../assets/launcher/smorodina.webp";

/**
 * The launcher's backdrop (pages/AppLauncher.jsx, handed to Layout's
 * `backdrop`). The operator's reference (2026-11-03): a warm golden gradient
 * with Safia's own products floating in it at different depths — the far ones
 * small and soft, the near ones large and cut by the screen's edge.
 *
 * The products are REAL: photos from safiabakery.uz's catalog (the operator's
 * pick), lifted out of their studio scene with macOS Vision's subject lifting
 * and saved as small WebP files in assets/launcher (240 KB for all nine). The
 * depth is baked into each file — a far one exported small and blurred, a near
 * one sharp with a soft warm shadow — so the browser only ever moves a
 * finished picture (index.css, «Ilovalar»: a compositor transform).
 * To swap a product: lift a new cut-out the same way, export it with its blur
 * or shadow, and point a FLOATS row at it.
 */

// What floats where: [picture, position, width px, base tilt°, seconds,
// delay s, wide-only]. Positions keep to the edges — the tiles own the
// middle — and the near ones are cut by the screen's edge, as in the
// reference. `wide` ones are left out on a phone, where the tiles fill the
// width and only the corners above and below them are free.
const FLOATS = [
  [latte,        { left: "2%",   top: "26%" },    177,  -6, 19, 0,  true],
  [oreo,         { right: "0%",  top: "33%" },    224,   5, 23, 6,  true],
  [parij,        { left: "11%",  top: "-3%" },    200,  -8, 26, 3,  false],
  [macPistachio, { right: "10%", top: "11%" },    140,  10, 21, 9,  true],
  [macChocolate, { left: "33%",  top: "10%" },    96,   -8, 24, 4,  true],
  [croissant,    { left: "3%",   bottom: "1%" },  201, -24, 22, 12, false],
  [bejeviy,      { right: "-4%", bottom: "-8%" }, 330,  -5, 25, 2,  false],
  [mishka,       { left: "39%",  bottom: "-4%" }, 170,   4, 20, 15, true],
  [smorodina,    { right: "30%", bottom: "9%" },  130,  -6, 18, 7,  true],
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
      <span className="apps-light apps-light--a" />
      <span className="apps-light apps-light--c" />
      {FLOATS.map(([src, at, size, tilt, secs, delay, wide], i) => (
        <img
          key={i}
          src={src}
          alt=""
          draggable="false"
          decoding="async"
          className={`apps-float${wide ? " apps-float--wide" : ""}`}
          style={{ ...at, "--size": `${size}px`, "--tilt": `${tilt}deg`,
                   animationDuration: `${secs}s`, animationDelay: `-${delay}s` }}
        />
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
