#!/usr/bin/env bash
# Auto-commit at the end of a task, with a generated commit message.
# Wired as a Stop hook in .claude/settings.local.json.
#
# Replaces the old PostToolUse hook, which committed after EVERY Edit/Write.
# Since a push to gitea deploys to production.safiacorporate.uz, the old hook
# meant every keystroke-level edit went live. This one means: one task, one
# commit, one deploy.
#
# Everything it does is logged to .claude/auto-commit.log (gitignored).

set -uo pipefail

PROJECT="/Users/burkhonnurmurodov/Documents/safia-project"
LOG="$PROJECT/.claude/auto-commit.log"

# Always hand a valid response back to Claude Code, whatever happened.
finish() {
  if [ -n "${1:-}" ]; then
    jq -n --arg m "$1" '{continue:true, systemMessage:$m}' 2>/dev/null \
      || printf '{"continue":true}\n'
  else
    printf '{"continue":true}\n'
  fi
  exit 0
}

# --- recursion guard -------------------------------------------------------
# The message generator below runs `claude`, which fires this same Stop hook.
# The exported guard makes that nested run bail out here immediately.
[ -n "${SAFIA_AUTOCOMMIT_RUNNING:-}" ] && finish

cd "$PROJECT" 2>/dev/null || finish "auto-commit: cannot cd to $PROJECT"
mkdir -p "$(dirname "$LOG")"
{ echo; echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="; } >>"$LOG" 2>&1

[ -z "$(git status --porcelain)" ] && { echo "nothing changed" >>"$LOG"; finish; }

# --- build -----------------------------------------------------------------
# Prod serves the SPA from the committed frontend/dist, so the build has to
# land in the same commit as the source. A broken build must never be pushed.
if ! ( cd frontend && npm run build ) >>"$LOG" 2>&1; then
  echo "BUILD FAILED — nothing committed" >>"$LOG"
  finish "Build failed — nothing was committed or deployed. See .claude/auto-commit.log"
fi

git add -A >>"$LOG" 2>&1
git diff --cached --quiet && { echo "nothing staged" >>"$LOG"; finish; }

# --- write the commit message ----------------------------------------------
# frontend/dist is excluded: it is minified bundles, pure noise to summarise.
SRC=':(exclude)frontend/dist'
DIFF=$( { git diff --cached --stat -- . "$SRC" | tail -40
          git diff --cached        -- . "$SRC" | head -600; } 2>/dev/null )

MSG=""
if [ -n "$DIFF" ] && command -v claude >/dev/null 2>&1; then
  MSG=$( printf '%s\n' "$DIFF" \
    | SAFIA_AUTOCOMMIT_RUNNING=1 perl -e 'alarm shift; exec @ARGV' 90 \
        claude -p "Read the staged git diff on stdin and write ONE git commit message for it.

Rules: imperative mood, max 72 characters, describe what changed and why it matters, no conventional-commit prefix, no quotes, no code fences, no trailing period. Output the message alone and nothing else." \
        2>>"$LOG" \
    | head -1 \
    | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^["'"'"'`]*//; s/["'"'"'`]*$//' )
fi

# Fall back to a plain summary if claude is missing, times out, or says nothing.
if [ -z "$MSG" ]; then
  NAMES=$(git diff --cached --name-only -- . "$SRC")
  N=$(printf '%s\n' "$NAMES" | grep -c . )
  HEADS=$(printf '%s\n' "$NAMES" | head -3 | sed 's:.*/::' | tr '\n' '|' | sed 's/|$//; s/|/, /g')
  if   [ "$N" -gt 3 ]; then MSG="Update $HEADS and $((N-3)) more"
  elif [ "$N" -gt 0 ]; then MSG="Update $HEADS"
  else                      MSG="Rebuild frontend"
  fi
  echo "used fallback message" >>"$LOG"
fi

echo "message: $MSG" >>"$LOG"
git commit -m "$MSG" >>"$LOG" 2>&1 \
  || finish "Commit failed — see .claude/auto-commit.log"

# --- push to every remote, and say which ones took it ----------------------
BRANCH=$(git rev-parse --abbrev-ref HEAD)
OK=""; BAD=""
for R in $(git remote); do
  if git push "$R" "$BRANCH" >>"$LOG" 2>&1; then OK="$OK $R"; else BAD="$BAD $R"; fi
done

SUMMARY="Committed \"$MSG\""
[ -n "$OK"  ] && SUMMARY="$SUMMARY · pushed to$OK"
if [ -n "$BAD" ]; then
  SUMMARY="$SUMMARY · PUSH FAILED:$BAD — see .claude/auto-commit.log"
elif [ "$BRANCH" = "main" ] && printf '%s' "$OK" | grep -q gitea; then
  SUMMARY="$SUMMARY · deploying to production.safiacorporate.uz"
fi

echo "$SUMMARY" >>"$LOG"
finish "$SUMMARY"
