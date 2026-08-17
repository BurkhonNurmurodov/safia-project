#!/usr/bin/env bash
#
# Upsert server-only secrets into backend/.env from the deploy job's environment.
#
# WHY THIS EXISTS
# ---------------
# `backend/.env` is untracked and lives only on the VPS, which is correct — a key
# committed to this repo would be pushed to Gitea AND mirrored to GitHub, and
# rewriting two remotes' history is not a recovery plan. But it left exactly one
# way to set a key: an SSH session. When nobody has a terminal, a feature that
# needs a new key simply cannot be switched on.
#
# So the secret is held by Gitea (repo → Settings → Actions → Secrets), injected
# into this script's environment by the workflow, and written here. It never
# touches a commit, a log line, or anyone's clipboard twice.
#
# CONTRACT
#   * Every name in KEYS is optional. An unset or empty secret leaves the
#     existing line ALONE — a half-configured secret store must never wipe a key
#     that somebody set by hand on the server.
#   * Idempotent: re-running with the same values changes nothing and reports so,
#     which is what lets the workflow restart the service only when it matters.
#   * Values are never echoed. Gitea masks secrets in logs, but a script that
#     depends on the log scrubber to keep a secret is one redaction bug from
#     leaking it.
#
# Prints `env-changed` or `env-unchanged` as its LAST line; the workflow reads
# that to decide whether the service needs a restart to pick the value up.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/var/www/production/backend/.env}"

# The secrets this deploy is allowed to write. Adding one here plus a matching
# `env:` line in .gitea/workflows/deploy.yaml is the whole procedure.
KEYS=(GEMINI_API_KEY ARC_USERNAME ARC_PASSWORD)

changed=0

for key in "${KEYS[@]}"; do
  # Indirect expansion: the value arrives as an environment variable of the same
  # name, so it is never an argument (arguments show up in `ps`).
  value="${!key:-}"
  [ -n "$value" ] || { echo "· $key: not provided, leaving as is"; continue; }

  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  # python3 rather than sed: a key can legitimately contain `/`, `&` and other
  # characters that are syntax in a sed replacement, and a mangled key fails at
  # runtime as a confusing 401 rather than as an error here.
  # `set +e` around it: the script signals "this key changed" through exit 3,
  # which set -e would otherwise treat as a crash.
  set +e
  KEY="$key" python3 - "$ENV_FILE" <<'PY'
import os, sys

path = sys.argv[1]
key = os.environ["KEY"]
value = os.environ[key]

try:
    lines = open(path, encoding="utf-8").read().splitlines()
except FileNotFoundError:
    lines = []

out, seen, changed = [], False, False
for line in lines:
    # Only a real assignment counts — a commented-out key stays a comment, so
    # `# GEMINI_API_KEY=...` left as a note is not silently resurrected.
    if not line.lstrip().startswith("#") and line.split("=", 1)[0].strip() == key:
        if seen:            # a duplicate assignment: the later one used to win
            changed = True  # silently, so collapse to one
            continue
        seen = True
        if line != f"{key}={value}":
            changed = True
        out.append(f"{key}={value}")
    else:
        out.append(line)

if not seen:
    out.append(f"{key}={value}")
    changed = True

if changed:
    open(path, "w", encoding="utf-8").write("\n".join(out) + "\n")

# Length only — enough to tell "pasted with a trailing newline" from "correct",
# never enough to reconstruct.
print(f"· {key}: {'updated' if changed else 'already current'} ({len(value)} chars)")
sys.exit(3 if changed else 0)
PY
  status=$?
  set -e
  # 3 = this key changed. 0 = already current. Anything else is a real failure,
  # and it must stop the deploy rather than leave a half-written .env behind.
  if [ "$status" -eq 3 ]; then
    changed=1
  elif [ "$status" -ne 0 ]; then
    echo "!! failed to write $key into $ENV_FILE (exit $status)" >&2
    exit "$status"
  fi
done

echo "$([ "$changed" -eq 1 ] && echo env-changed || echo env-unchanged)"
