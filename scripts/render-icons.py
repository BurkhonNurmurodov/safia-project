#!/usr/bin/env python3
"""Render every browser icon from frontend/public/logo.png.

    backend/venv/bin/python scripts/render-icons.py

THE renderer — nothing under frontend/public/icons, and none of the favicons
beside logo.png, is ever hand-edited (CLAUDE.md, «installable app»). logo.png
is the Safia IMS emblem (2026-10-13): a square that is transparent outside its
inscribed circle, so it is round wherever a surface crops it round, and whose
own ground inside the circle is the site's ink (#0F1117). Outputs:

  icons/icon-{192,512}-v2.png           purpose "any": the logo as it is, the
                                        transparent corners kept;
  icons/icon-{192,512}-maskable-v2.png  purpose "maskable": a full-bleed ink
                                        square with the logo scaled into the
                                        80% safe zone, so every launcher mask
                                        (circle, squircle, rounded square)
                                        shows all of it;
  favicon.ico (16 · 32 · 48), favicon-32-v2.png, favicon-192-v2.png
                                        the tab icons, transparent corners;
  apple-touch-icon-v2.png               180 px, flattened onto ink, because
                                        iOS composites transparency onto black.

The LIGHT emblem (2026-10-14): the same drawing on a cream ground, for the
light theme, where the ink disc sat on a white sidebar as a black hole. It is
derived here, never drawn by hand: every pixel of the ground band (outside the
gold disc the mascot stands in) is read as ink + gold (+ the white bar inside
its own box) and repainted as cream + gold (+ an ink bar) with the same
amounts — so the ring, its ticks, the faded track (gold at ~23 % over ink →
over cream) and every anti-aliased edge keep their shape. A pixel that is
neither (the mascot's shirt reaching past the disc) is unblended against its
brightest neighbour and only its ink share is swapped for cream. The mascot
and the gold disc are not touched. Outputs:

  logo-light-v2.png                     384 px, for the ES5 boot screens in
                                        index.html (they show /logo.png in
                                        the dark theme);
  ../src/assets/logo-chrome{,-light}.png
                                        192 px, palette-quantised, inlined
                                        into the bundle (assets/logoChrome.js)
                                        for the sidebar, PageLoader and the
                                        browser login — one per theme, drawn
                                        by components/ui/BrandLogo.jsx.

Cloudflare edge-caches the outputs by extension for hours under their fixed
paths, so a regenerated icon carries a NEW suffix (TAG) — and the manifest,
index.html and vite.config.js's ROOT_STATICS name it with it; the files of the
previous tag are deleted here. favicon.ico keeps its path: browsers ask for it
by convention, and a few hours of the old one in a tab is the price.
"""
from pathlib import Path

import numpy as np  # the backend venv carries it (pandas)
from numpy.lib.stride_tricks import sliding_window_view
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "frontend" / "public"
ASSETS = ROOT.parent / "src" / "assets"
SRC = ROOT / "logo.png"
ICONS = ROOT / "icons"
TAG = "v2"
INK = (15, 17, 23, 255)  # the site's dark base, --bg-base
SAFE_ZONE = 0.8  # the maskable spec: content inside the inner 80% is never clipped
SIZES = (192, 512)
ICO_SIZES = (16, 32, 48)
TOUCH = 180
CHROME = 192  # the inlined sidebar / loader / login copy
BOOT_LIGHT = 384  # the light boot-screen copy (96 px at up to 4x)

# The light emblem. Colours of the source, then what each becomes.
GOLD = (200, 151, 63)  # --brand: the ring, the ticks, the disc, the bars
WHITE = (243, 244, 246)  # the tallest bar (dark --text-1)
CREAM = (244, 234, 217)  # the new ground: the brand gold at 20 % on white
BAR_INK = (17, 24, 39)  # the tallest bar on cream (light --text-1)
# Geometry, on the 1024 px source: the gold disc's radius, and the box the
# white bar stands in (a little wider than the bar, for its anti-aliasing).
DISC_R = 352  # the disc's edge sits at 357; the band starts a little inside
BAR_BOX = (594, 885, 653, 989)  # x0, y0, x1, y1
FIT_TOL = 14  # colour distance under which a pixel IS ink + gold (+ white)


def _fit(src: Image.Image, n: int) -> Image.Image:
    return src.resize((n, n), Image.Resampling.LANCZOS)


def _on_ink(src: Image.Image, n: int, share: float) -> Image.Image:
    canvas = Image.new("RGBA", (n, n), INK)
    inner = round(n * share)
    off = (n - inner) // 2
    canvas.alpha_composite(_fit(src, inner), (off, off))
    return canvas.convert("RGB")


def _light(src: Image.Image) -> Image.Image:
    """The emblem on a cream ground (see the module docstring)."""
    px = np.asarray(src, dtype=float)
    h, w = px.shape[:2]
    rgb = px[..., :3]
    ink, gold, white = (np.array(c[:3], float) for c in (INK, GOLD, WHITE))
    cream, bar_ink = np.array(CREAM, float), np.array(BAR_INK, float)
    yy, xx = np.mgrid[0:h, 0:w]
    k = w / 1024
    band = np.hypot(xx + .5 - w / 2, yy + .5 - h / 2) >= DISC_R * k
    x0, y0, x1, y1 = (v * k for v in BAR_BOX)
    in_bar = (xx >= x0) & (xx <= x1) & (yy >= y0) & (yy <= y1)

    d = rgb - ink

    def fit(axis):
        # The source is sharpened, so an edge overshoots its colour a little
        # (255 beside a 243 bar); the residual is taken at the overshoot and
        # the amount clipped afterwards.
        amt = np.clip((d @ axis) / (axis @ axis), -0.1, 1.15)
        return np.clip(amt, 0, 1), np.linalg.norm(d - amt[..., None] * axis, axis=-1)

    ag, res_g = fit(gold - ink)
    aw, res_w = fit(white - ink)
    use_w = in_bar & (res_w < res_g)
    ag, aw = np.where(use_w, 0, ag), np.where(use_w, aw, 0)
    res = np.where(use_w, res_w, res_g)
    mixed = cream + ag[..., None] * (gold - cream) + aw[..., None] * (bar_ink - cream)

    # Anything else over ink: unblend against the brightest pixel within 3 px.
    r = 3
    dist = np.pad(np.linalg.norm(d, axis=-1), r, mode="edge")
    best = sliding_window_view(dist, (2 * r + 1, 2 * r + 1)).reshape(h, w, -1).argmax(-1)
    oy, ox = np.divmod(best, 2 * r + 1)
    fg = np.pad(d, ((r, r), (r, r), (0, 0)), mode="edge")[yy + oy, xx + ox]
    share = np.clip(np.einsum("ijk,ijk->ij", d, fg)
                    / np.maximum(np.einsum("ijk,ijk->ij", fg, fg), 1e-6), 0, 1)
    other = rgb + (1 - share)[..., None] * (cream - ink)

    out = np.where((res < FIT_TOL)[..., None], mixed, other)
    out = np.where(band[..., None], out, rgb)
    return Image.fromarray(
        np.dstack([np.clip(np.rint(out), 0, 255), px[..., 3]]).astype(np.uint8), "RGBA")


def _chrome(src: Image.Image, path: Path) -> None:
    # 256 colours with their alpha: a few KB in the JS bundle, not 40.
    _fit(src, CHROME).quantize(256, method=Image.Quantize.FASTOCTREE).save(path, optimize=True)


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    ICONS.mkdir(exist_ok=True)
    for stale in [*ICONS.glob("icon-*.png"), *ROOT.glob("favicon-*.png"), *ROOT.glob("apple-touch-icon*.png"),
                  *ROOT.glob("logo-light*.png")]:
        if f"-{TAG}." not in stale.name:
            stale.unlink()
            print("removed", stale.relative_to(ROOT))
    for n in SIZES:
        _fit(src, n).save(ICONS / f"icon-{n}-{TAG}.png", optimize=True)
        _on_ink(src, n, SAFE_ZONE).save(ICONS / f"icon-{n}-maskable-{TAG}.png", optimize=True)
        print(f"icons/icon-{n}-{TAG}.png · icons/icon-{n}-maskable-{TAG}.png")
    # Pillow keeps only frames no larger than the base image, so the base is
    # the biggest one and the smaller frames ride along as append_images.
    frames = [_fit(src, n) for n in sorted(ICO_SIZES, reverse=True)]
    frames[0].save(ROOT / "favicon.ico", format="ICO", sizes=[(n, n) for n in ICO_SIZES],
                   append_images=frames[1:])
    _fit(src, 32).save(ROOT / f"favicon-32-{TAG}.png", optimize=True)
    _fit(src, 192).save(ROOT / f"favicon-192-{TAG}.png", optimize=True)
    _on_ink(src, TOUCH, 1.0).save(ROOT / f"apple-touch-icon-{TAG}.png", optimize=True)
    print(f"favicon.ico · favicon-32-{TAG}.png · favicon-192-{TAG}.png · apple-touch-icon-{TAG}.png")
    light = _light(src)
    _fit(light, BOOT_LIGHT).save(ROOT / f"logo-light-{TAG}.png", optimize=True)
    _chrome(src, ASSETS / "logo-chrome.png")
    _chrome(light, ASSETS / "logo-chrome-light.png")
    print(f"logo-light-{TAG}.png · src/assets/logo-chrome.png · src/assets/logo-chrome-light.png")


if __name__ == "__main__":
    main()
