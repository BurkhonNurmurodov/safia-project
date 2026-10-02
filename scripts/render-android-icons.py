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
      24 dp, the phone notification's status-bar icon (Push): Safia's big S.
      Android paints a status-bar icon as a one-colour silhouette from its
      alpha alone, so the round logo would read as a white blob. The source
      is android/brand/safia-s.png — the S of the «Safia» wordmark (taken
      from Safia's own customer app, slightly thickened so it holds at 24 dp),
      white on transparent, 1024 px.
"""
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "frontend" / "public" / "logo.png"
STATUS_SRC = ROOT / "android" / "brand" / "safia-s.png"
RES = ROOT / "android" / "app" / "src" / "main" / "res"
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
LEGACY_DP = 48
ADAPTIVE_DP = 108
VISIBLE_DP = 72  # what the launcher mask lets through
LOGO_SHARE = 0.8  # of the visible area — the PWA maskable icon's proportion
SPLASH_DP = 160
STATUS_DP = 24


def _logo(src: Image.Image, px: int) -> Image.Image:
    return src.resize((px, px), Image.Resampling.LANCZOS)


def main() -> None:
    src = Image.open(SRC).convert("RGBA")
    status = Image.open(STATUS_SRC).convert("RGBA")
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
        stat = status.resize((px, px), Image.Resampling.LANCZOS)
        stat.save(drawable / "ic_stat_notify.png", optimize=True)

        print(f"{name}: ic_launcher {legacy.width}px · foreground {side}px · splash {round(SPLASH_DP * scale)}px")


if __name__ == "__main__":
    main()
