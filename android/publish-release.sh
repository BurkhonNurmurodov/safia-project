#!/usr/bin/env bash
# Publish a built Safia IMS APK to production (CLAUDE.md, «The Android app»):
# every installed app then offers «Yangilash» (AppUpdates.java) and Android's
# own install screen. Run AFTER build-release.sh, and only for a release you
# mean to hand to every phone — there is no staging.
#
#   bash android/publish-release.sh            # the version in app/build.gradle
#   bash android/publish-release.sh 1.4.0
#
# The key is ~/.safia-android/signing/publish.key; the server keeps only its
# SHA-256 (backend/app/services/android_release.py) and refuses an APK that is
# not this package, not newer, or not signed with the release key.
set -euo pipefail
cd "$(dirname "$0")"

VER="${1:-$(sed -n 's/^ *versionName "\(.*\)"$/\1/p' app/build.gradle)}"
APK="$HOME/.safia-android/releases/Safia-IMS-$VER.apk"
KEY="$HOME/.safia-android/signing/publish.key"
[ -f "$APK" ] || { echo "no $APK — run build-release.sh first" >&2; exit 1; }
[ -f "$KEY" ] || { echo "no $KEY" >&2; exit 1; }

curl --fail-with-body -sS -X POST \
  -H "X-Publish-Key: $(tr -d '\n' < "$KEY")" \
  -H "Content-Type: application/vnd.android.package-archive" \
  --data-binary @"$APK" \
  https://production.safiacorporate.uz/api/android/publish
echo
echo "Published $VER — share link: https://production.safiacorporate.uz/api/android/download"
