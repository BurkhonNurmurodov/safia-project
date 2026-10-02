#!/usr/bin/env python3
"""Render the Android app's launcher icons and splash image from frontend/public/logo.png.

    backend/venv/bin/python scripts/render-android-icons.py

The twin of render-icons.py (the PWA's four icons) and THE renderer for
android/app/src/main/res — never hand-edit its PNGs (CLAUDE.md, «The Android
app»). Three images per screen density:

  mipmap-*/ic_launcher.png, ic_launcher_round.png
      48 dp, the round logo as it is — what Android 7 launchers show
      (the app supports Android 7+, adaptive icons exist from Android 8).
  mipmap-*/ic_launcher_foreground.png
      the adaptive icon's front layer, 108 dp. A launcher shows only its middle
      72 dp, through whatever mask it likes; the logo fills 80 % of that, the
      same proportion as the PWA's maskable icon, so both installs read alike.
      The back layer is @color/iconBackground, the disc's own gold.
  drawable-*/splash.png
      160 dp, shown centred and unscaled while the site loads — one per
      density so it is the same physical size on every screen.
  drawable-*/ic_stat_notify.png
      24 dp, the phone notification's status-bar icon (Push). Android paints
      a status-bar icon as a one-colour silhouette from its alpha alone, so a
      disc would read as a white blob: this is the chef girl CUT OUT of the
      gold disc — hat, head and hair — with her hair and eyes knocked back
      out, so she is still recognisable at 24 dp.
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "public" / "logo.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
LEGACY_DP = 48
ADAPTIVE_DP = 108
VISIBLE_DP = 72  # what the launcher mask lets through
LOGO_SHARE = 0.8  # of the visible area — the PWA maskable icon's proportion
SPLASH_DP = 160
STATUS_DP = 24
GOLD = (0xD5, 0xB2, 0x6F)  # the disc's ring colour — the part that is NOT her


def _logo(src: Image.Image, px: int) -> Image.Image:
    return src.resize((px, px), Image.Resampling.LANCZOS)


def _silhouette(src: Image.Image) -> Image.Image:
    """The status-bar mask, square and with a little air round it (L mode)."""
    a = np.asarray(src).astype(int)
    r, g, b, al = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    disc = (abs(r - GOLD[0]) < 28) & (abs(g - GOLD[1]) < 28) & (abs(b - GOLD[2]) < 35)
    figure = Image.fromarray((((al > 128) & ~disc) * 255).astype("uint8"))
    figure = np.asarray(figure.filter(ImageFilter.MedianFilter(9))) > 0
    dark = (al > 128) & (r < 110) & (g < 90) & (b < 80)  # hair, eyes, lashes
    mask = Image.fromarray(((figure & ~dark) * 255).astype("uint8"))
    mask = mask.filter(ImageFilter.MedianFilter(5))
    crop = mask.crop(mask.getbbox())
    side = round(max(crop.size) * 1.08)
    out = Image.new("L", (side, side), 0)
    out.paste(crop, ((side - crop.width) // 2, (side - crop.height) // 2))
    return out


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    status = _silhouette(src)
    for name, scale in DENSITIES.items():
        mipmap = RES / f"mipmap-{name}"
        drawable = RES / f"drawable-{name}"
        mipmap.mkdir(parents=True, exist_ok=True)
        drawable.mkdir(parents=True, exist_ok=True)

        legacy = _logo(src, round(LEGACY_DP * scale))
        legacy.save(mipmap / "ic_launcher.png", optimize=True)
        legacy.save(mipmap / "ic_launcher_round.png", optimize=True)

        side = round(ADAPTIVE_DP * scale)
        inner = round(VISIBLE_DP * LOGO_SHARE * scale)
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        off = (side - inner) // 2
        canvas.alpha_composite(_logo(src, inner), (off, off))
        canvas.save(mipmap / "ic_launcher_foreground.png", optimize=True)

        _logo(src, round(SPLASH_DP * scale)).save(drawable / "splash.png", optimize=True)
        px = round(STATUS_DP * scale)
        stat = Image.new("RGBA", (px, px), (255, 255, 255, 0))
        stat.putalpha(status.resize((px, px), Image.Resampling.LANCZOS))
        stat.save(drawable / "ic_stat_notify.png", optimize=True)

        print(f"{name}: ic_launcher {legacy.width}px · foreground {side}px · splash {round(SPLASH_DP * scale)}px")


if __name__ == "__main__":
    main()
