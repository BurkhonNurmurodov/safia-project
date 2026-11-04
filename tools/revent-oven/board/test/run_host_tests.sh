#!/bin/bash
# Build and run the board core's host tests on this Mac (no board needed).
#   bash test/run_host_tests.sh <dir with the saved oven answers>
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${TMPDIR:-/tmp}/safia-board-host-test"
SRC=("$HERE/host_test.cpp" "$HERE"/../src/core/*.cpp)
FLAGS=(-std=c++17 -O1 -Wall -Wextra -Werror -fsanitize=address,undefined)
# The newest macOS SDK can be ahead of the installed linker; fall back to the
# newest SDK that links.
build() { c++ "${FLAGS[@]}" "$@" -o "$OUT" "${SRC[@]}" 2>/tmp/safia-board-build.log; }
if ! build; then
  ok=""
  for S in $(ls -d /Library/Developer/CommandLineTools/SDKs/MacOSX[0-9]*.sdk 2>/dev/null | sort -rV); do
    if build -isysroot "$S"; then ok=1; break; fi
  done
  [ -n "$ok" ] || { cat /tmp/safia-board-build.log; exit 1; }
fi
"$OUT" "${1:?the folder with raw_logs.bin, raw_settings.bin, raw_status.bin, status.txt}"
