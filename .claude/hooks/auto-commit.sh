#!/usr/bin/env bash
# Auto-commit at the end of a task, with a generated commit message.
#
# ONE script, two callers, so a cloud turn and a laptop turn cannot drift:
#
#   (no args)  ← the laptop's Stop hook in .claude/settings.local.json
#                (gitignored). Unchanged: bump, build, commit, push the current
#                branch to gitea first (main there IS the deploy), then every
#                mirror.
#   cloud      ← the committed .claude/settings.json Stop hook. A hard no-op
#                unless CLAUDE_CODE_REMOTE=true, so it never runs twice on a
#                laptop. In a claude.ai/code session it runs the same loop, with
#                three differences the platform forces:
#                  - the session works on a `claude/...` branch and the GitHub
#                    proxy lets it push ONLY that branch, so gitea gets
#                    HEAD:main (the deploy) and GitHub gets the session branch;
#                  - Claude often commits by itself mid-turn, so "what ships" is
#                    measured against gitea/main, not HEAD — a clean tree that
#                    is AHEAD of gitea/main still deploys, and still bumps;
#                  - SAFIA_CLOUD_DEPLOY=0 in the environment's variables panel
#                    turns the deploy off: gitea then gets the session branch.
#
# Replaces the old PostToolUse hook, which committed after EVERY Edit/Write.
# Since a push to gitea deploys to production.safiacorporate.uz, the old hook
# meant every keystroke-level edit went live. This one means: one turn, one
# commit, one deploy.
#
# Everything it does is logged to .claude/auto-commit.log (gitignored).

set -uo pipefail

MODE="${1:-local}"

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

# The committed copy must never act on a laptop, where settings.local.json
# already runs the local copy of this same script.
[ "$MODE" = "cloud" ] && [ "${CLAUDE_CODE_REMOTE:-}" != "true" ] && finish

# In the cloud a missing gitea credential must FAIL the push, never park it at
# a password prompt nobody can see until the hook's timeout kills the turn.
[ "$MODE" = "cloud" ] && export GIT_TERMINAL_PROMPT=0

# The repo this script lives in. The laptop's hook names it by absolute path in
# the main checkout and the cloud's by $CLAUDE_PROJECT_DIR — either way it is
# the checkout the hook was registered for, never a worktree the session sits in.
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd)"
LOG="$PROJECT/.claude/auto-commit.log"

cd "$PROJECT" 2>/dev/null || finish "auto-commit: cannot cd to $PROJECT"
mkdir -p "$(dirname "$LOG")"
{ echo; echo "===== $(date '+%Y-%m-%d %H:%M:%S') [$MODE] ====="; } >>"$LOG" 2>&1

# --- what production runs (cloud) ------------------------------------------
# Locally HEAD is level with gitea/main when a turn starts (auto-pull.sh), so
# HEAD is the baseline. In the cloud Claude commits by itself during the turn,
# so the baseline is what production actually runs: gitea/main, fetched fresh.
DEPLOYED=""
if [ "$MODE" = "cloud" ]; then
  git fetch -q gitea >>"$LOG" 2>&1 || echo "gitea fetch failed" >>"$LOG"
  git rev-parse -q --verify gitea/main >/dev/null 2>&1 && DEPLOYED="gitea/main"
fi

if [ -z "$(git status --porcelain)" ]; then
  if [ -z "$DEPLOYED" ] || git merge-base --is-ancestor HEAD "$DEPLOYED" 2>/dev/null; then
    echo "nothing changed" >>"$LOG"; finish
  fi
  echo "tree clean but HEAD is ahead of $DEPLOYED — shipping those commits" >>"$LOG"
fi

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
# mechanism, no second marker file to forget about. "Already edited" is judged
# against the baseline above, so a VERSION Claude committed mid-turn in the
# cloud counts exactly like one left in the working tree.
#
# If the build then fails, the bumped VERSION stays in the tree uncommitted and
# the next run leaves it be: the bump belongs to the commit that ships, not to
# every attempt at one.
VERSION_FILE="$PROJECT/VERSION"
if [ ! -f "$VERSION_FILE" ]; then
  echo "no VERSION file — skipping bump" >>"$LOG"
elif ! git diff --quiet "${DEPLOYED:-HEAD}" -- VERSION 2>/dev/null; then
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

# In the cloud the message describes the whole DEPLOY — Claude's own commits
# since gitea/main plus what is staged — not just the last few edits.
# Left UNQUOTED where it is used, so an empty one vanishes — an empty array
# under `set -u` is an error on the bash 3.2 macOS ships.
DBASE="$DEPLOYED"

MSG=""
USED_AI="no"

# Always rebuilt — also when Claude committed everything itself in the cloud:
# the bundle carries VERSION and must be built from the tree that ships, which
# is what a laptop turn guarantees by building on every commit.
{

  # --- build ---------------------------------------------------------------
  # Prod serves the SPA from the committed frontend/dist, so the build has to
  # land in the same commit as the source. A broken build must never be pushed.
  if ! ( cd frontend && npm run build ) >>"$LOG" 2>&1; then
    echo "BUILD FAILED — nothing committed" >>"$LOG"
    finish "Build failed — nothing was committed or deployed. See .claude/auto-commit.log"
  fi

  git add -A >>"$LOG" 2>&1

  # The cloud symlinks frontend/node_modules in from /opt. A symlink is a FILE
  # to git, so the old `node_modules/` ignore never matched it — committed, it
  # would reach the production box in place of the real directory. .gitignore
  # now says `node_modules`; this is the second line, for any symlink at all.
  if [ "$MODE" = "cloud" ]; then
    git diff --cached --raw --no-renames 2>/dev/null \
      | awk '$2 == "120000" { print $NF }' \
      | while read -r P; do git reset -q -- "$P"; echo "unstaged symlink $P" >>"$LOG"; done
  fi

  if git diff --cached --quiet; then
    if [ -z "$DEPLOYED" ] || git merge-base --is-ancestor HEAD "$DEPLOYED" 2>/dev/null; then
      echo "nothing staged" >>"$LOG"; finish
    fi
  else

    # --- deterministic fallback message ------------------------------------
    # frontend/dist is excluded everywhere below: minified bundles are pure
    # noise. VERSION joins it now that it changes on EVERY commit — it says
    # nothing about what THIS one did, it would crowd out a real filename in
    # the fallback, and left in the diff it tempts the generator into writing
    # "Bump version to x.y.z" as the whole message.
    SRC=':(exclude)frontend/dist'
    VSRC=':(exclude)VERSION'
    NAMES=$(git diff --cached --name-only $DBASE -- . "$SRC" "$VSRC")
    N=$(printf '%s\n' "$NAMES" | grep -c . )
    HEADS=$(printf '%s\n' "$NAMES" | head -3 | sed 's:.*/::' | tr '\n' '|' | sed 's/|$//; s/|/, /g')
    if   [ "$N" -gt 3 ]; then FALLBACK="Update $HEADS and $((N-3)) more"
    elif [ "$N" -gt 0 ]; then FALLBACK="Update $HEADS"
    elif [ -n "$VER"  ]; then FALLBACK="Release v$VER"
    else                      FALLBACK="Rebuild frontend"
    fi

    # --- try to do better than the fallback --------------------------------
    MSG="$FALLBACK"
    DIFF=$( { git diff --cached --stat $DBASE -- . "$SRC" "$VSRC" | tail -40
              git diff --cached        $DBASE -- . "$SRC" "$VSRC" | head -600; } 2>/dev/null )

    if [ -n "$DIFF" ] && command -v claude >/dev/null 2>&1; then
      RAW=$( printf '%s\n' "$DIFF" \
        | SAFIA_AUTOCOMMIT_RUNNING=1 perl -e 'alarm shift; exec @ARGV' 90 \
            claude -p "Read the staged git diff on stdin and write ONE git commit message for it.

Rules: imperative mood, max 72 characters, describe what changed and why it matters, no conventional-commit prefix, no quotes, no code fences, no trailing period. Output the message alone and nothing else." \
            2>>"$LOG" )
      RC=$?
      CAND=$( printf '%s' "$RAW" | head -1 \
            | sed 's/^[[:space:]]*//; s/[[:space:]]*$//; s/^["'"'"'`]*//; s/["'"'"'`]*$//' )

      # Validate hard. `claude` prints its errors to STDOUT and still looks
      # like text, so a bare non-empty check is not enough — that is exactly
      # how "Failed to authenticate. API Error: 401 ..." became a commit
      # message.
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
    # release history it now is, and the number that shipped a change can be
    # found without opening the commit.
    [ -n "$VER" ] && MSG="v$VER: $MSG"

    echo "message ($USED_AI): $MSG" >>"$LOG"
    git commit -m "$MSG" >>"$LOG" 2>&1 \
      || finish "Commit failed — see .claude/auto-commit.log"
  fi
}

# --- push: gitea first, then the mirrors -----------------------------------
# gitea is the remote that matters — pushing main there deploys production.
# It goes FIRST so nothing can delay the deploy. Every other remote (GitHub)
# is a best-effort mirror: it cannot block the deploy, and its failure is
# cosmetic, not an incident. The summary must not blur those two together.
BRANCH=$(git rev-parse --abbrev-ref HEAD)
ORDER=$( { git remote | grep -x gitea; git remote | grep -vx gitea; } 2>/dev/null )

# Where each remote gets this turn. Locally: the current branch, everywhere —
# byte-for-byte what this hook always did. In the cloud: gitea gets HEAD:main,
# the deploy, exactly as a laptop turn on main; every other remote (the GitHub
# mirror, behind a proxy that accepts only the session's own branch) gets the
# session branch.
dest_for() {
  if [ "$MODE" != "cloud" ]; then printf '%s' "$BRANCH"; return; fi
  if [ "$1" = "gitea" ]; then
    if [ "${SAFIA_CLOUD_DEPLOY:-1}" != "0" ]; then printf 'main'
    elif [ "$BRANCH" = "main" ] || [ "$BRANCH" = "HEAD" ]; then printf 'cloud-session'
    else printf '%s' "$BRANCH"
    fi
  elif [ "$BRANCH" != "HEAD" ]; then
    printf '%s' "$BRANCH"
  fi
}

OK=""; MIRROR_BAD=""; GITEA_BAD=""; DEPLOYS=""
for R in $ORDER; do
  DEST=$(dest_for "$R")
  [ -z "$DEST" ] && continue
  REF="$DEST"
  [ "$MODE" = "cloud" ] && REF="HEAD:refs/heads/$DEST"
  if git push "$R" "$REF" >>"$LOG" 2>&1; then
    OK="$OK $R"
    [ "$R" = "gitea" ] && [ "$DEST" = "main" ] && DEPLOYS=1
  elif [ "$R" = "gitea" ]; then
    GITEA_BAD=1
  else
    MIRROR_BAD="$MIRROR_BAD $R"
  fi
done

if [ -n "$MSG" ]; then
  SUMMARY="Committed \"$MSG\""
  [ "$USED_AI" = "no" ] && SUMMARY="$SUMMARY (generic message — claude unavailable)"
else
  SUMMARY="Shipped \"$(git log -1 --format=%s | cut -c1-90)\""
fi
[ -n "$OK"  ] && SUMMARY="$SUMMARY · pushed to$OK"
if [ -n "$GITEA_BAD" ]; then
  SUMMARY="$SUMMARY · GITEA PUSH FAILED — NOT deployed, see .claude/auto-commit.log"
  [ "$MODE" = "cloud" ] && SUMMARY="$SUMMARY (gitea/main moved on? fast-forward onto it and re-run. No GITEA_TOKEN? set it on the environment)"
elif [ -n "$DEPLOYS" ]; then
  SUMMARY="$SUMMARY · deploying to production.safiacorporate.uz"
fi
[ -n "$MIRROR_BAD" ] && SUMMARY="$SUMMARY · mirror push failed:$MIRROR_BAD (harmless)"

echo "$SUMMARY" >>"$LOG"
finish "$SUMMARY"
