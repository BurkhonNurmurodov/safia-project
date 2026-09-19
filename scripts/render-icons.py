#!/usr/bin/env python3
"""Render the four PWA launcher icons from frontend/public/logo.png.

    backend/venv/bin/python scripts/render-icons.py

THE renderer — the icons under frontend/public/icons are never hand-edited
(CLAUDE.md, «installable app»). Two purposes, two shapes:

  icon-{192,512}.png           purpose "any": the round logo as it is, the
                               transparent corners kept (the favicon look);
  icon-{192,512}-maskable.png  purpose "maskable": a full-bleed square of the
                               disc's own gold with the logo scaled into the
                               80% safe zone, so every launcher mask (circle,
                               squircle, rounded square) shows all of it.

Cloudflare edge-caches the outputs by extension for hours under their fixed
paths, so a regenerated icon must be renamed (and the manifest's `src` with it)
to reach anybody promptly.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "frontend" / "public"
SRC = ROOT / "logo.png"
OUT = ROOT / "icons"
GOLD = (213, 178, 111, 255)  # the disc's own colour, sampled off logo.png
SAFE_ZONE = 0.8  # the maskable spec: content inside the inner 80% is never clipped
SIZES = (192, 512)


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    OUT.mkdir(exist_ok=True)
    for n in SIZES:
        src.resize((n, n), Image.Resampling.LANCZOS).save(OUT / f"icon-{n}.png", optimize=True)
        canvas = Image.new("RGBA", (n, n), GOLD)
        inner = round(n * SAFE_ZONE)
        off = (n - inner) // 2
        canvas.alpha_composite(src.resize((inner, inner), Image.Resampling.LANCZOS), (off, off))
        canvas.convert("RGB").save(OUT / f"icon-{n}-maskable.png", optimize=True)
        print(f"icon-{n}.png · icon-{n}-maskable.png")


if __name__ == "__main__":
    main()
