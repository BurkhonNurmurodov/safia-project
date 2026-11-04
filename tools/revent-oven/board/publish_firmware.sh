#!/usr/bin/env bash
# Publish the oven board's firmware to IMS: the board installs it by itself at
# its next round (board/ota.h). Builds first, so the image IS the version in
# platformio.ini. The publish key is the APK's (~/.safia-android/signing/publish.key).
#
#   bash tools/revent-oven/board/publish_firmware.sh
#
# Raise FW_VERSION in platformio.ini for every publish: the board installs any
# version other than its own, and never again one whose trial failed on it.
set -euo pipefail
cd "$(dirname "$0")"

PIO="$HOME/.safia-esp/venv/bin/pio"
KEY="$HOME/.safia-android/signing/publish.key"
SERVER="${SERVER:-https://production.safiacorporate.uz}"
VER="$(sed -n 's/.*-DFW_VERSION=\\"\([0-9.]*\)\\".*/\1/p' platformio.ini)"
BIN=".pio/build/s2mini/firmware.bin"

[ -n "$VER" ] || { echo "no FW_VERSION in platformio.ini" >&2; exit 1; }
[ -f "$KEY" ] || { echo "no $KEY" >&2; exit 1; }
"$PIO" run >/dev/null
[ -f "$BIN" ] || { echo "no $BIN after the build" >&2; exit 1; }

echo "Publishing firmware $VER ($(wc -c < "$BIN" | tr -d ' ') bytes, sha256 $(shasum -a 256 "$BIN" | cut -c1-12)…)"
curl --fail-with-body -sS -X POST \
  -H "X-Publish-Key: $(tr -d '\n' < "$KEY")" \
  -H "Content-Type: application/octet-stream" \
  --data-binary @"$BIN" \
  "$SERVER/api/ovens/collector/firmware/publish?version=$VER"
echo
echo "Published $VER — the board installs it after its next round (/panel/ovens → «Kollektor qurilmasi»)."
