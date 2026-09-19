"""Two things the 19 September go-live left behind, cleared once.

The operator asked, on the morning of 19 Sep 2026, to remove what no longer
says anything true:

1. **The preview notice.** `leader_rules_sep19.PREVIEW_NOTE` was prefixed to
   every instruction published early, and it reads «YANGI TALAB — starts on 19
   September». Today IS 19 September, so it now contradicts itself on the page.
   It was designed to remove itself — the 19 Sep passes rewrite the same column
   without it — but only where those passes reach: the per-unit passes write the
   UNIT level, and the GLOBAL level is rewritten by `apply_global`, which runs
   inside whichever pass finishes LAST. Shift 2's fires at 16:30, so the notice
   is still on the global level that «Vazifalar» opens on for most of the day,
   and a shift-1 leader whose pass was deferred to 20:00 still reads it too.

   Stripped from the PREFIX only, and only where it is exactly `PREVIEW_NOTE`.
   Nothing else in a description is touched, so a text an admin has since edited
   by hand keeps every word they wrote.

2. **The example photos of the AUTOMATIC tasks.** Tasks 1, 8 and 9 were given
   an instruction and deliberately NO criteria — they become code checks, not
   photo judgements — so an example proof for them states a requirement the
   platform has stopped having. Removed at EVERY level, because the reason is a
   property of the task and not of who is looking at it.

Both are RECOVERABLE: every deleted example is named by id, and the bytes are in
the operator's own «checklist-setup» export of 17 Sep.

It writes nothing else. In particular it does NOT touch `criteria` at any level
— what a leader is judged by is not a cleanup — nor any description that does
not begin with the notice.

Delete this module, `startup.cleanup_rules_sep19` and the call in BOTH
entrypoints once it has landed, together with `leader_rules_sep19` itself.
"""
from __future__ import annotations

import logging

from sqlalchemy.orm import Session

from app.models import (
    LeaderTaskDef, LeaderTaskExample, LeaderTaskLeaderSetting, LeaderTaskSetting,
)

log = logging.getLogger(__name__)

# The three tables `description` lives on — the same global → supervisor →
# leader chain the criteria walks. Read from the models rather than re-listed as
# strings, so a renamed column is an ImportError here and not a silent no-op.
_DESC_TABLES = (LeaderTaskDef, LeaderTaskSetting, LeaderTaskLeaderSetting)


def auto_tasks() -> list[int]:
    """The tasks that become automatic checks — DERIVED, never re-listed.

    `leader_rules_sep19.AUTO_DESCRIPTIONS` is the statement of which tasks got
    an instruction and no criteria; a second copy of those numbers here is a
    copy that is wrong the first time one of them moves.
    """
    from app.services import leader_rules_sep19 as R
    return sorted(getattr(R, "AUTO_DESCRIPTIONS", {}))


def strip_preview_note(db: Session) -> dict:
    """Take `PREVIEW_NOTE` off the front of every description carrying it."""
    from app.services.leader_rules_sep19 import PREVIEW_NOTE

    out: dict[str, int] = {}
    for cls in _DESC_TABLES:
        n = 0
        rows = (db.query(cls)
                .filter(cls.description.isnot(None),
                        cls.description.like(PREVIEW_NOTE[:40] + "%"))
                .all())
        for row in rows:
            text = row.description or ""
            # The exact prefix, never a fuzzy match: `like` above only narrows
            # the scan, and a description that merely resembles the notice must
            # come through untouched.
            if not text.startswith(PREVIEW_NOTE):
                continue
            row.description = text[len(PREVIEW_NOTE):]
            n += 1
        out[cls.__tablename__] = n
    db.commit()
    return out


def drop_auto_examples(db: Session) -> list[dict]:
    """Delete every example photo of the automatic tasks, at every level."""
    tasks = auto_tasks()
    if not tasks:
        return []
    rows = (db.query(LeaderTaskExample)
            .filter(LeaderTaskExample.task_id.in_(tasks))
            .order_by(LeaderTaskExample.task_id, LeaderTaskExample.id)
            .all())
    removed = [{"task": r.task_id, "id": r.id,
                "level": ("leader" if r.leader_id else
                          "supervisor" if r.manager_id else "global"),
                "bytes": len(r.data or b"")}
               for r in rows]
    for r in rows:
        db.delete(r)
    db.commit()
    return removed


def apply(db: Session) -> dict:
    """Both cleanups. Each commits for itself, so one failing cannot undo the
    other — they are independent errands that happen to be asked together."""
    stripped = strip_preview_note(db)
    removed = drop_auto_examples(db)
    return {"stripped": stripped, "removed": removed, "auto_tasks": auto_tasks()}
