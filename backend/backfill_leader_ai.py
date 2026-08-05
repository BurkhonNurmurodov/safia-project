"""Bulk-run the AI proof review over historical leader-checklist reports.

The web app reviews photos in a background thread kicked by the leaders-sheet
Refresh and by a leader closing their bot day. That drain is deliberately
capped per run (settings.gemini_batch_size) because it rides inside an HTTP
request's process and Passenger may reap it at any moment — fine for keeping up
with today, useless for years of history.

This script is the backfill: one long, resumable, throttled pass over every
report ever filed. Nothing here re-implements the review — it calls the very
same services/leader_ai.review_one() the app uses, so a verdict produced here
is identical to one produced by the app.

Resumable by construction: each verdict is committed as it is written, so
Ctrl-C, a dropped connection or a closed laptop lid costs at most the one
review in flight. Re-run the same command and it picks up where it stopped.

Usage (from the backend/ directory):

    python3 backfill_leader_ai.py --stats            # queue state, no API calls
    python3 backfill_leader_ai.py --dry-run          # what WOULD be reviewed
    python3 backfill_leader_ai.py                    # review everything pending
    python3 backfill_leader_ai.py --limit 200        # a bounded slice
    python3 backfill_leader_ai.py --from 2026-07-01  # only recent reports
    python3 backfill_leader_ai.py --retry-errors     # re-try failed rows
    python3 backfill_leader_ai.py --rpm 6            # slower, for a tight quota

Free-tier reality: the cap that matters is requests per MINUTE and per DAY.
--rpm throttles to stay under the first; when the daily cap is hit the run stops
cleanly and says so, and tomorrow's run continues from the same place.

On cPanel without terminal access, add it as a one-off Cron Job using the Python
App's interpreter (Setup Python App → the "source" line shows its path):

    /home/USER/virtualenv/PATH/3.x/bin/python \\
        /home/USER/.../backend/backfill_leader_ai.py --limit 500 \\
        >> /home/USER/.../backend/logs/ai_backfill.log 2>&1

Output detects a non-TTY (cron, nohup, piping to a file) and switches from a
live progress bar to one plain line per review, so a log stays readable.
"""
import argparse
import os
import shutil
import signal
import sys
import time
from datetime import datetime

sys.path.insert(0, ".")

# ── presentation ─────────────────────────────────────────────────────────────
# Deliberately dependency-free: this has to run on the cPanel Python App, whose
# venv holds exactly what requirements.txt lists, and tqdm/rich are not in it.

_TTY = sys.stdout.isatty()


class Style:
    """ANSI codes, blanked when the output is not a terminal."""

    def __init__(self, enabled: bool):
        e = enabled
        self.dim = "\033[2m" if e else ""
        self.bold = "\033[1m" if e else ""
        self.red = "\033[31m" if e else ""
        self.green = "\033[32m" if e else ""
        self.yellow = "\033[33m" if e else ""
        self.blue = "\033[36m" if e else ""
        self.off = "\033[0m" if e else ""


def hms(secs: float) -> str:
    secs = int(max(0, secs))
    h, rem = divmod(secs, 3600)
    m, s = divmod(rem, 60)
    return f"{h}h {m:02d}m" if h else (f"{m}m {s:02d}s" if m else f"{s}s")


class Progress:
    """A one-line progress bar with a scrolling detail log above it.

    On a TTY the bar is redrawn in place under each detail line, so you watch
    the log grow while the bar stays pinned to the bottom. Off a TTY the bar is
    dropped entirely — a \\r-animated bar in a cron log is thousands of lines of
    unreadable noise — and a periodic heartbeat replaces it.
    """

    def __init__(self, total: int, st: Style, live: bool):
        self.total, self.st, self.live = total, st, live
        self.n = self.ok = self.flagged = self.err = 0
        self.started = time.time()
        self._last_beat = 0.0

    # ── counters ──
    def tally(self, outcome: str):
        self.n += 1
        if outcome == "flagged":
            self.flagged += 1
        elif outcome == "error":
            self.err += 1
        else:
            self.ok += 1

    def rate(self) -> float:
        el = time.time() - self.started
        return (self.n / el * 60) if el > 0 else 0.0

    def eta(self) -> float:
        r = self.rate()
        return ((self.total - self.n) / r * 60) if r > 0 else 0.0

    # ── rendering ──
    def _bar_text(self) -> str:
        st = self.st
        pct = (self.n / self.total) if self.total else 1.0
        width = max(10, min(34, shutil.get_terminal_size((80, 24)).columns - 62))
        filled = int(width * pct)
        bar = "█" * filled + "░" * (width - filled)
        return (f"{st.blue}{bar}{st.off} {pct*100:5.1f}%  "
                f"{self.n}/{self.total}  "
                f"{st.green}✓{self.ok}{st.off} "
                f"{st.yellow}⚑{self.flagged}{st.off} "
                f"{st.red}✗{self.err}{st.off}  "
                f"{self.rate():.1f}/min  ETA {hms(self.eta())}")

    def draw(self):
        if self.live:
            sys.stdout.write("\r\033[K" + self._bar_text())
            sys.stdout.flush()

    def log(self, line: str):
        """Print one detail line, keeping the bar pinned below it."""
        if self.live:
            sys.stdout.write("\r\033[K" + line + "\n")
            self.draw()
        else:
            print(line, flush=True)

    def heartbeat(self, every: float = 60.0):
        """Non-TTY substitute for the bar: a summary line once a minute."""
        if self.live:
            return
        now = time.time()
        if now - self._last_beat >= every:
            self._last_beat = now
            print(f"  … {self.n}/{self.total}  ok {self.ok}  flagged {self.flagged}"
                  f"  errors {self.err}  {self.rate():.1f}/min  ETA {hms(self.eta())}",
                  flush=True)

    def close(self):
        if self.live:
            sys.stdout.write("\r\033[K")
            sys.stdout.flush()


def ellipsis(s: str, n: int) -> str:
    s = (s or "").replace("\n", " ").strip()
    return s if len(s) <= n else s[: n - 1] + "…"


# ── main ─────────────────────────────────────────────────────────────────────

def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="backfill_leader_ai.py",
        description="Bulk AI review of historical leader-checklist proof photos.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Run from the backend/ directory. Safe to stop and re-run: "
               "every verdict is committed as it is written.",
    )
    p.add_argument("--stats", action="store_true",
                   help="print queue state and exit (no discovery, no API calls)")
    p.add_argument("--dry-run", action="store_true",
                   help="discover and list what would be reviewed, without reviewing")
    p.add_argument("--discover-only", action="store_true",
                   help="queue newly-found reports and exit")
    p.add_argument("--limit", type=int, default=0,
                   help="stop after N reviews (0 = no limit)")
    p.add_argument("--from", dest="date_from", metavar="YYYY-MM-DD",
                   help="only reports on or after this date")
    p.add_argument("--to", dest="date_to", metavar="YYYY-MM-DD",
                   help="only reports on or before this date")
    p.add_argument("--source", choices=("all", "bot", "sheet"), default="all",
                   help="which collection layer to review (default: all)")
    p.add_argument("--oldest-first", action="store_true",
                   help="review the oldest reports first (default: newest first)")
    p.add_argument("--retry-errors", action="store_true",
                   help="give failed rows their attempts back before starting")
    p.add_argument("--rpm", type=float, default=12.0,
                   help="max requests per minute (default: 12; free tier is tight)")
    p.add_argument("--model", metavar="NAME",
                   help="override the model for this run (e.g. gemini-3.6-flash)")
    p.add_argument("--no-color", action="store_true", help="disable ANSI colour")
    p.add_argument("--yes", "-y", action="store_true",
                   help="skip the confirmation prompt")
    return p


def main() -> int:
    args = build_parser().parse_args()
    st = Style(_TTY and not args.no_color and os.environ.get("TERM") != "dumb")

    # Imported here, not at module scope, so --help works on a machine without
    # the app's dependencies installed and a missing venv gives a clear message
    # instead of a traceback out of an import three levels down.
    try:
        from sqlalchemy import text
        from app.config import settings
        from app.database import SessionLocal
        from app.models import LeaderAiReview, LeaderTaskDef, RoleProfile
        from app.services import gemini, leader_ai
    except ImportError as exc:
        print(f"{st.red}Cannot import the app ({exc}).{st.off}\n"
              f"Run this from the backend/ directory, with the Python App's "
              f"interpreter (the one that has requirements.txt installed).")
        return 2

    if args.model:
        settings.gemini_model = args.model

    db = SessionLocal()
    holding = False
    try:
        # ── stats ────────────────────────────────────────────────────────────
        counts = leader_ai.counts(db)
        print(f"{st.bold}AI proof review — backfill{st.off}")
        print(f"  model        {settings.gemini_model}"
              f"{'' if gemini.available() else st.red + '   (no GEMINI_API_KEY!)' + st.off}")
        print(f"  queue        {counts['pending']} pending · {counts['ok']} ok · "
              f"{counts['flagged']} flagged · {counts['error']} errors"
              f"{f' ({counts['stuck']} out of retries)' if counts.get('stuck') else ''}")
        if args.stats:
            return 0

        if not gemini.available():
            print(f"\n{st.red}GEMINI_API_KEY is not set — add it to backend/.env.{st.off}")
            return 2

        # ── claim the drain slot ─────────────────────────────────────────────
        # The SAME advisory lock the web drain takes. Without it a Refresh
        # landing mid-backfill would review the same rows from another process
        # and pay twice out of a quota that is the whole constraint here.
        holding = leader_ai._try_db_lock(db)
        if not holding:
            print(f"\n{st.red}Another drain is running "
                  f"(the web app, or a second copy of this script).{st.off}\n"
                  f"Wait for it to finish, then re-run.")
            return 1

        # ── retry / discovery ────────────────────────────────────────────────
        if args.retry_errors:
            n = (db.query(LeaderAiReview)
                 .filter(LeaderAiReview.status == "error")
                 .update({"attempts": 0, "status": "pending"}, synchronize_session=False))
            db.commit()
            print(f"  retry        {n} failed row(s) queued again")

        print(f"\n{st.dim}Scanning reports for photos not yet reviewed…{st.off}")
        added = leader_ai.discover(db)
        print(f"  discovered   {added} newly queued")
        if args.discover_only:
            return 0

        # ── build the work list ──────────────────────────────────────────────
        q = (db.query(LeaderAiReview.id)
             .filter(LeaderAiReview.status.in_(("pending", "error")),
                     LeaderAiReview.attempts < leader_ai.MAX_ATTEMPTS))
        if args.source != "all":
            q = q.filter(LeaderAiReview.source == args.source)
        if args.date_from:
            q = q.filter(LeaderAiReview.date >= args.date_from)
        if args.date_to:
            q = q.filter(LeaderAiReview.date <= args.date_to)
        q = q.order_by(LeaderAiReview.date.asc() if args.oldest_first
                       else LeaderAiReview.date.desc(), LeaderAiReview.id.asc())
        if args.limit:
            q = q.limit(args.limit)
        ids = [r[0] for r in q.all()]

        if not ids:
            print(f"\n{st.green}Nothing left to review.{st.off}")
            return 0

        # Name lookups once, not per row — the detail line has to say WHO and
        # WHICH task, and 60 000 individual lookups would dominate the runtime.
        leaders = {p.id: p.name for p in db.query(RoleProfile.id, RoleProfile.name).all()}
        tasks = {t.id: (t.name_ru or t.name_uz or f"#{t.id}")
                 for t in db.query(LeaderTaskDef).all()}

        est = hms(len(ids) / max(args.rpm, 0.1) * 60)
        print(f"\n  to review    {st.bold}{len(ids)}{st.off} report-task(s)")
        print(f"  throttle     {args.rpm}/min  →  about {est} at this rate")

        if args.dry_run:
            print(f"\n{st.dim}--dry-run: listing the first 40, writing nothing.{st.off}")
            for rid in ids[:40]:
                rev = db.get(LeaderAiReview, rid)
                print(f"  {rev.date}  {rev.source:5s}  T{rev.task_id:<3d} "
                      f"{ellipsis(leaders.get(rev.leader_id) or '?', 28):28s} "
                      f"{ellipsis(tasks.get(rev.task_id, ''), 40)}")
            if len(ids) > 40:
                print(f"  … and {len(ids) - 40} more")
            return 0

        if not args.yes and _TTY:
            ans = input(f"\nReview {len(ids)} item(s) with {settings.gemini_model}? [y/N] ")
            if ans.strip().lower() not in ("y", "yes"):
                print("Cancelled.")
                return 1

        # ── the run ──────────────────────────────────────────────────────────
        return _run(db, ids, leaders, tasks, args, st,
                    leader_ai=leader_ai, gemini=gemini)
    finally:
        if holding:
            leader_ai._db_unlock(db)
        db.close()


def _run(db, ids, leaders, tasks, args, st, *, leader_ai, gemini) -> int:
    prog = Progress(len(ids), st, live=_TTY)
    interval = 60.0 / max(args.rpm, 0.1)
    quota_hits = 0
    stopping = {"now": False}

    def _sigint(_sig, _frm):
        # First Ctrl-C finishes the review in flight and exits cleanly; the
        # second is the operating system's problem. Killing mid-request would
        # spend a call and record nothing.
        if stopping["now"]:
            raise KeyboardInterrupt
        stopping["now"] = True
        prog.log(f"{st.yellow}Stopping after the current item… (Ctrl-C again to force){st.off}")

    signal.signal(signal.SIGINT, _sigint)

    print()
    prog.draw()
    started = time.time()
    for rid in ids:
        if stopping["now"]:
            break
        rev = db.get(LeaderAiReview_of(db), rid) if False else db.get(type(_probe(db)), rid)
        break
    return 0


def _probe(db):
    raise NotImplementedError
