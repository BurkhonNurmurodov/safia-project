"""Which build is running — the app's own answer to that question.

ONE source of truth for the version string: the repo-root ``VERSION`` file,
read here and injected into the frontend bundle by ``frontend/vite.config.js``.
Bump that file and both halves move together; a version kept in two places is a
version that eventually disagrees with itself.

The COMMIT is read straight out of the checkout's git metadata — no subprocess,
no git binary required. ``/var/www/production`` is a checkout that the deploy
script hard-resets on every push, so ``.git/HEAD`` names exactly what was
deployed. It is read LIVE on each call rather than cached at import, because a
frontend-only deploy moves the checkout without restarting this process: the
pair (commit, started_at) is what tells you whether a backend change is still
waiting on a restart.

``MIN_CLIENT`` is the other half of the answer: the version says which build is
running, the floor says how old a build it still serves. Both are published on
every API response, because a tab left open across a deploy is the only client
this platform has and the only one that can silently fall behind.
"""

import os
from datetime import datetime, timezone
from typing import Optional

# backend/app/version.py → repo root
_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def _read_version() -> str:
    """The VERSION file, or 0.0.0 when it is missing (never raise on import)."""
    for path in (
        os.path.join(_ROOT, "VERSION"),
        # A backend-only deployment (no repo root above it).
        os.path.join(_ROOT, "backend", "VERSION"),
    ):
        try:
            with open(path, "r", encoding="utf-8") as fh:
                value = fh.read().strip()
        except OSError:
            continue
        if value:
            return value
    return "0.0.0"


def _git_dir() -> Optional[str]:
    """.git as a directory, resolving the `gitdir:` pointer file of a worktree."""
    path = os.path.join(_ROOT, ".git")
    if os.path.isdir(path):
        return path
    try:
        with open(path, "r", encoding="utf-8") as fh:
            head = fh.read().strip()
    except OSError:
        return None
    if head.startswith("gitdir:"):
        target = head[len("gitdir:"):].strip()
        if not os.path.isabs(target):
            target = os.path.join(_ROOT, target)
        return target if os.path.isdir(target) else None
    return None


def _packed_ref(git_dir: str, ref: str) -> Optional[str]:
    """Resolve a ref from packed-refs — `git gc` deletes the loose ref file."""
    try:
        with open(os.path.join(git_dir, "packed-refs"), "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith(("#", "^")):
                    continue
                sha, _, name = line.partition(" ")
                if name.strip() == ref:
                    return sha
    except OSError:
        return None
    return None


def current_commit() -> Optional[str]:
    """Short SHA of the commit sitting in the checkout right now, or None."""
    git_dir = _git_dir()
    if not git_dir:
        return None
    try:
        with open(os.path.join(git_dir, "HEAD"), "r", encoding="utf-8") as fh:
            head = fh.read().strip()
    except OSError:
        return None
    if head.startswith("ref:"):
        ref = head[len("ref:"):].strip()
        try:
            with open(os.path.join(git_dir, ref), "r", encoding="utf-8") as fh:
                head = fh.read().strip()
        except OSError:
            head = _packed_ref(git_dir, ref) or ""
    head = head.strip()
    return head[:12] if head else None


APP_VERSION = _read_version()
# When this process booted. Compared against the deploy time, it answers
# "is the running code the code in the checkout?"
STARTED_AT = datetime.now(timezone.utc).isoformat()


def _major(version: str) -> int:
    """The MAJOR digit of an ``X.Y.Z`` string; 0 for anything unparseable.

    0 doubles as the "I cannot tell" answer and as a real major-0 release, and
    both are treated identically on purpose — see ``MIN_CLIENT``.
    """
    head = version.strip().split(".", 1)[0]
    return int(head) if head.isdigit() else 0


_MAJOR = _major(APP_VERSION)

# ── The compatibility floor ──────────────────────────────────────────────────
# The oldest frontend bundle this backend still answers correctly, published to
# every client on ``X-App-Min-Client`` (see AppVersionMiddleware in main.py).
#
# It is DERIVED — ``<MAJOR>.0.0`` of the running version — and there is
# deliberately NO override. That is what turns the version number from a label
# into a rule: a bundle from an older MAJOR line is incompatible, every bundle
# in the current line is served, and therefore a change that breaks an open tab
# can only be expressed by bumping MAJOR. A hand-set floor would let a MINOR
# quietly cut clients off, which is exactly the break-nobody-had-to-describe
# this exists to prevent.
#
# Empty means NO floor, and that is the fail-open answer for an unversioned
# checkout (a missing VERSION file reads as "0.0.0" → major 0). A backend that
# cannot say how old is too old must serve everyone rather than refuse everyone.
MIN_CLIENT = f"{_MAJOR}.0.0" if _MAJOR else ""
