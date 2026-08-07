#!/usr/bin/env bash
# Pull from gitea at the start of a session, before anything gets edited.
# Wired as a SessionStart hook in .claude/settings.local.json.
#
# gitea (git.safiabakery.uz) is the authoritative remote — a push to its main
# deploys production.safiacorporate.uz. GitHub is only a mirror, so "up to
# date" here always means "up to date with gitea", never with origin.
#
# Deliberately FAST-FORWARD ONLY. If main has diverged, or if uncommitted work
# stands in the way, this stops and says so rather than merging, rebasing or
# clobbering: the tree is left exactly as it was found. Editing on top of a
# silently-merged tree is how you ship someone else's half-finished work.
#
# Everything it does is logged to .claude/auto-pull.log (gitignored via *.log).

set -uo pipefail

PROJECT="/Users/burkhonnurmurodov/Documents/safia-project"
LOG="$PROJECT/.claude/auto-pull.log"
REMOTE="gitea"

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
# The auto-commit Stop hook shells out to `claude -p` to write its commit
# message. That nested session fires THIS hook — mid-commit, between the
# `git add -A` and the `git commit`. The exported guard makes it bail out
# before it can touch git.
[ -n "${SAFIA_AUTOCOMMIT_RUNNING:-}" ] && finish

cd "$PROJECT" 2>/dev/null || finish "auto-pull: cannot cd to $PROJECT"
mkdir -p "$(dirname "$LOG")"
{ echo; echo "===== $(date '+%Y-%m-%d %H:%M:%S') ====="; } >>"$LOG" 2>&1

git remote get-url "$REMOTE" >/dev/null 2>&1 || {
  echo "no '$REMOTE' remote" >>"$LOG"
  finish "auto-pull: no '$REMOTE' remote — nothing pulled."
}

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)

if ! git fetch "$REMOTE" >>"$LOG" 2>&1; then
  echo "fetch failed" >>"$LOG"
  finish "Could not reach $REMOTE — working from the local tree, which may be stale. See .claude/auto-pull.log"
fi

if [ "$BRANCH" != "main" ]; then
  echo "on '$BRANCH', not main — fetched only" >>"$LOG"
  finish "Fetched $REMOTE. On branch '$BRANCH', so nothing was merged."
fi

LOCAL=$(git rev-parse HEAD)
UPSTREAM=$(git rev-parse "$REMOTE/main")
BASE=$(git merge-base HEAD "$REMOTE/main")

# Already level with gitea — the common case, stay silent.
if [ "$LOCAL" = "$UPSTREAM" ]; then
  echo "already up to date" >>"$LOG"
  finish
fi

# Local main is ahead: unpushed commits, nothing to pull.
if [ "$BASE" = "$UPSTREAM" ]; then
  N=$(git rev-list --count "$REMOTE/main"..HEAD)
  echo "ahead by $N — nothing to pull" >>"$LOG"
  finish "Local main is $N commit(s) ahead of $REMOTE — nothing to pull. They deploy on the next push."
fi

# Both sides moved. Never auto-resolve this: a merge or rebase here rewrites
# work nobody has looked at, and the result deploys straight to production.
if [ "$BASE" != "$LOCAL" ]; then
  echo "DIVERGED — refusing to merge" >>"$LOG"
  finish "main has DIVERGED from $REMOTE/main — NOT merged, tree untouched. Resolve by hand before editing, or the auto-push at the end of the turn will be rejected."
fi

# Strictly behind: fast-forward is safe.
N=$(git rev-list --count HEAD.."$REMOTE/main")
if git merge --ff-only "$REMOTE/main" >>"$LOG" 2>&1; then
  echo "fast-forwarded $N commit(s)" >>"$LOG"
  finish "Pulled $N commit(s) from $REMOTE into main."
fi

# git refuses a fast-forward that would overwrite uncommitted local changes.
# That refusal is the feature — report it, change nothing.
echo "ff-merge FAILED (uncommitted changes in the way?)" >>"$LOG"
finish "main is $N commit(s) behind $REMOTE but the fast-forward FAILED — uncommitted local changes are probably in the way. Tree untouched; see .claude/auto-pull.log"
