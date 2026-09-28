#!/usr/bin/env bash
# Build the signed Safia IMS Android packages (CLAUDE.md, «The Android app»).
#
#   bash android/build-release.sh
#
# Needs the toolchain in ~/.safia-android (JDK 21) and ~/Library/Android/sdk,
# and the release key in ~/.safia-android/signing/ — the build refuses to run
# without it. The site's pages go inside the APK from the committed
# frontend/dist, and the build refuses a dist production is not serving: run
# it right after a deploy has landed. Once installed, the app follows every
# later deploy by itself (PageUpdates.java) — a new APK is needed only when
# android/ changes. The APK (sideloading) and the AAB (Google Play) are
# copied to ~/.safia-android/releases/, never into the repo.
set -euo pipefail
cd "$(dirname "$0")"

export JAVA_HOME="${SAFIA_JAVA_HOME:-$HOME/.safia-android/jdk-21/Contents/Home}"
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"

./gradlew --no-daemon clean assembleRelease bundleRelease

VER=$(sed -n 's/^ *versionName "\(.*\)"$/\1/p' app/build.gradle)
CODE=$(sed -n 's/^ *versionCode \([0-9][0-9]*\)$/\1/p' app/build.gradle)
OUT="$HOME/.safia-android/releases"
mkdir -p "$OUT"
cp app/build/outputs/apk/release/app-release.apk "$OUT/Safia-IMS-$VER.apk"
cp app/build/outputs/bundle/release/app-release.aab "$OUT/Safia-IMS-$VER.aab"

# The printed SHA-256 must be the one backend/app/main.py serves in
# /.well-known/assetlinks.json, or production links stop opening in the app.
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs "$OUT/Safia-IMS-$VER.apk" | grep 'SHA-256'
echo "Safia IMS $VER (versionCode $CODE) -> $OUT"
