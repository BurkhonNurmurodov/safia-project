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

Cloudflare edge-caches the outputs by extension for hours under their fixed
paths, so a regenerated icon carries a NEW suffix (TAG) — and the manifest,
index.html and vite.config.js's ROOT_STATICS name it with it; the files of the
previous tag are deleted here. favicon.ico keeps its path: browsers ask for it
by convention, and a few hours of the old one in a tab is the price.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "frontend" / "public"
SRC = ROOT / "logo.png"
ICONS = ROOT / "icons"
TAG = "v2"
INK = (15, 17, 23, 255)  # the site's dark base, --bg-base
SAFE_ZONE = 0.8  # the maskable spec: content inside the inner 80% is never clipped
SIZES = (192, 512)
ICO_SIZES = (16, 32, 48)
TOUCH = 180


def _fit(src: Image.Image, n: int) -> Image.Image:
    return src.resize((n, n), Image.Resampling.LANCZOS)


def _on_ink(src: Image.Image, n: int, share: float) -> Image.Image:
    canvas = Image.new("RGBA", (n, n), INK)
    inner = round(n * share)
    off = (n - inner) // 2
    canvas.alpha_composite(_fit(src, inner), (off, off))
    return canvas.convert("RGB")


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    ICONS.mkdir(exist_ok=True)
    for stale in [*ICONS.glob("icon-*.png"), *ROOT.glob("favicon-*.png"), *ROOT.glob("apple-touch-icon*.png")]:
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


if __name__ == "__main__":
    main()
