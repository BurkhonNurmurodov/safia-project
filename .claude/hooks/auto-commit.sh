#!/usr/bin/env bash
# Auto-commit at the end of a task, with a generated commit message.
# Wired as a Stop hook in .claude/settings.local.json.
#
# Replaces the old PostToolUse hook, which committed after EVERY Edit/Write.
# Since a push to gitea deploys to production.safiacorporate.uz, the old hook
# meant every keystroke-level edit went live. This one means: one turn, one
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

# --- version bump ----------------------------------------------------------
# Every deploy ships a new number. The version is shown to every user in the
# sidebar's «Versiya» dialog and served by /api/version, so a deploy that
# leaves it alone makes both of them lie about what is running.
#
# This runs BEFORE the build, not merely before the commit: Vite bakes VERSION
# into the bundle, so a bump applied afterwards would ship a bundle claiming
# the previous number — the one place the mistake is invisible from here and
# visible to everyone else.
#
# Only PATCH is automatic. MINOR and MAJOR are judgements about impact that
# nothing in a diff can make, so they are expressed by EDITING VERSION during
# the turn — and an already-edited VERSION is left strictly alone below. One
# mechanism, no second marker file to forget about.
#
# If the build then fails, the bumped VERSION stays in the tree uncommitted and
# the next run leaves it be: the bump belongs to the commit that ships, not to
# every attempt at one.
VERSION_FILE="$PROJECT/VERSION"
if [ ! -f "$VERSION_FILE" ]; then
  echo "no VERSION file — skipping bump" >>"$LOG"
elif ! git diff --quiet HEAD -- VERSION 2>/dev/null; then
  echo "VERSION already set this turn — leaving it" >>"$LOG"
else
  CUR=$(tr -d '[:space:]' <"$VERSION_FILE")
  if printf '%s' "$CUR" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+$'; then
    NEW="${CUR%.*}.$(( ${CUR##*.} + 1 ))"
    printf '%s\n' "$NEW" >"$VERSION_FILE"
    echo "version $CUR -> $NEW (patch)" >>"$LOG"
  else
    # Never rewrite something we don't understand, and never block the deploy
    # over bookkeeping — a missed bump is a nuisance, a blocked deploy is not.
    echo "VERSION is not X.Y.Z ('$CUR') — skipping bump" >>"$LOG"
  fi
fi
VER=$(tr -d '[:space:]' <"$VERSION_FILE" 2>/dev/null)

# --- build -----------------------------------------------------------------
# Prod serves the SPA from the committed frontend/dist, so the build has to
# land in the same commit as the source. A broken build must never be pushed.
if ! ( cd frontend && npm run build ) >>"$LOG" 2>&1; then
  echo "BUILD FAILED — nothing committed" >>"$LOG"
  finish "Build failed — nothing was committed or deployed. See .claude/auto-commit.log"
fi

git add -A >>"$LOG" 2>&1
git diff --cached --quiet && { echo "nothing staged" >>"$LOG"; finish; }

# --- deterministic fallback message ----------------------------------------
# frontend/dist is excluded everywhere below: minified bundles are pure noise.
# VERSION joins it now that it changes on EVERY commit — it says nothing about
# what THIS one did, it would crowd out a real filename in the fallback, and
# left in the diff it tempts the generator into writing "Bump version to x.y.z"
# as the whole message.
SRC=':(exclude)frontend/dist'
VSRC=':(exclude)VERSION'
NAMES=$(git diff --cached --name-only -- . "$SRC" "$VSRC")
N=$(printf '%s\n' "$NAMES" | grep -c . )
HEADS=$(printf '%s\n' "$NAMES" | head -3 | sed 's:.*/::' | tr '\n' '|' | sed 's/|$//; s/|/, /g')
if   [ "$N" -gt 3 ]; then FALLBACK="Update $HEADS and $((N-3)) more"
elif [ "$N" -gt 0 ]; then FALLBACK="Update $HEADS"
elif [ -n "$VER"  ]; then FALLBACK="Release v$VER"
else                      FALLBACK="Rebuild frontend"
fi

# --- try to do better than the fallback ------------------------------------
MSG="$FALLBACK"
USED_AI="no"
DIFF=$( { git diff --cached --stat -- . "$SRC" "$VSRC" | tail -40
          git diff --cached        -- . "$SRC" "$VSRC" | head -600; } 2>/dev/null )

if [ -n "$DIFF" ] && command -v claude >/dev/null 2>&1; then
  RAW=$( printf '%s\n' "$DIFF" \
    | SAFIA_AUTOCOMMIT_RUNNING=1 perl -e 'alarm shift; exec @ARGV' 90 \
        claude -p "Read the staged git diff on stdin and write ONE git commit message for it.

Rules: imperative mood, max 72 characters, describe what changed and why it matters, no conventional-commit prefix, no quotes, no code fences, no trailing period. Output the message alone and nothing else." \
        2>>"$LOG" )
  RC=$?
  CAND=$( printf '%s' "$RAW" | head -1 \
        | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^["'"'"'`]*//; s/["'"'"'`]*$//' )

  # Validate hard. `claude` prints its errors to STDOUT and still looks like
  # text, so a bare non-empty check is not enough — that is exactly how
  # "Failed to authenticate. API Error: 401 ..." became a commit message.
  if [ "$RC" -ne 0 ]; then
    echo "claude exited $RC — using fallback" >>"$LOG"
  elif [ ${#CAND} -lt 10 ] || [ ${#CAND} -gt 100 ]; then
    echo "claude output was ${#CAND} chars — using fallback" >>"$LOG"
  elif printf '%s' "$CAND" | grep -qiE 'api error|http [45][0-9][0-9]|\b40[13]\b|unauthoriz|revoked|not authenticated|invalid.*(key|token|credential)|rate.?limit|quota|usage limit|^(failed|error|usage|invalid|sorry|i )'; then
    echo "claude output looks like an error, not a message — using fallback: $CAND" >>"$LOG"
  else
    MSG="$CAND"
    USED_AI="yes"
  fi
else
  echo "claude not on PATH or empty diff — using fallback" >>"$LOG"
fi

# The version leads the subject line, so `git log --oneline` reads as the
# release history it now is, and the number that shipped a change can be found
# without opening the commit.
[ -n "$VER" ] && MSG="v$VER: $MSG"

echo "message ($USED_AI): $MSG" >>"$LOG"
git commit -m "$MSG" >>"$LOG" 2>&1 \
  || finish "Commit failed — see .claude/auto-commit.log"

# --- push: gitea first, then the mirrors -----------------------------------
# gitea is the remote that matters — pushing main there deploys production.
# It goes FIRST so nothing can delay the deploy. Every other remote (GitHub)
# is a best-effort mirror: it cannot block the deploy, and its failure is
# cosmetic, not an incident. The summary must not blur those two together.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
ORDER=$( { git remote | grep -x gitea; git remote | grep -vx gitea; } 2>/dev/null )

OK=""; MIRROR_BAD=""; GITEA_BAD=""
for R in $ORDER; do
  if git push "$R" "$BRANCH" >>"$LOG" 2>&1; then
    OK="$OK $R"
  elif [ "$R" = "gitea" ]; then
    GITEA_BAD=1
  else
    MIRROR_BAD="$MIRROR_BAD $R"
  fi
done

SUMMARY="Committed \"$MSG\""
[ "$USED_AI" = "no" ] && SUMMARY="$SUMMARY (generic message — claude unavailable)"
[ -n "$OK"  ] && SUMMARY="$SUMMARY · pushed to$OK"
if [ -n "$GITEA_BAD" ]; then
  SUMMARY="$SUMMARY · GITEA PUSH FAILED — NOT deployed, see .claude/auto-commit.log"
elif [ "$BRANCH" = "main" ] && printf '%s' "$OK" | grep -q gitea; then
  SUMMARY="$SUMMARY · deploying to production.safiacorporate.uz"
fi
[ -n "$MIRROR_BAD" ] && SUMMARY="$SUMMARY · mirror push failed:$MIRROR_BAD (harmless)"

echo "$SUMMARY" >>"$LOG"
finish "$SUMMARY"
