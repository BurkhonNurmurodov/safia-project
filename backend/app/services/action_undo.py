"""Taking one recorded action back — THE definition of what an undo can reach.

The «Jurnal» register says what happened. This says which of those things can be
made *un*-happened, and does it.

## An undo is a new action, never an edit

`action_logs` is append-only and stays that way: nothing here rewrites the row
it reverses. An undo is an ordinary action that happens to be the inverse of an
old one, recorded under the INVERSE action's own key — undoing a day-close IS a
re-open, and belongs under Attendance beside every other re-open, not in some
separate "undo" category nobody filters by. The link between the two is the
indexed ``undo_of`` column, which is also what answers "was this one taken
back" for every row the tab renders.

An undo cannot itself be undone. Allowing it would make the chain arbitrarily
long, and then "already undone" stops being a fact about a row and becomes a
question about the parity of a chain — at which point the badge on screen can be
wrong. To put an undone action back, do it again through its own page.

## What may be undone, and why so little

**Only what the register PROVES it can put back.** A log row is not a snapshot:
it records what changed, not the whole record before it changed. So a delete
that cascaded — a profile taking its bindings, checklist entries, photos and AI
verdicts with it — is gone, and no button here will pretend otherwise. The
honest answer is a stated refusal, not a control that appears to offer one.

Every plan therefore lives or dies on one question: *is everything needed to
reverse this action written down in this row?* Four are, today:

* ``attendance.day_closed``    → the day re-opens (unit + date, nothing else)
* ``attendance.day_reopened``  → the day closes again, under its original closer
* ``config.settings_saved``    → each key goes back to its recorded old value
* ``config.translation_saved`` → each string goes back to its recorded old text

Adding a fifth is one ``Plan`` in ``_PLANS`` — a ``check`` and a ``run`` — not a
new mechanism. What it must never be is a *lossy* reverser: `task.status_changed`
looks trivial and is not, because moving a task out of «done» re-queues it at the
BACK of the leader's priority list, so an undo would restore the status and
silently lose the position. A reverser that quietly gets something wrong is worse
than no reverser at all, because the operator believes it worked.

## The rule that makes this safe: the world must still be as the action left it

Every ``check`` verifies that the CURRENT state still equals what the row
recorded as its result, and refuses with ``changed_since`` when it does not.
That single rule does most of the work here:

* it stops an undo from clobbering somebody else's later edit — restoring a
  setting from Tuesday would otherwise erase Wednesday's change without a word;
* it makes a double-tap harmless, which matters because the register is written
  by a background thread and the ``already_undone`` marker lands a beat after
  the undo itself, i.e. too late to be the only guard;
* it needs no locks, because the check and the write share one session and one
  transaction.
"""

import logging
from dataclasses import dataclass
from datetime import date as date_t, datetime, timezone
from typing import Callable, Optional

from sqlalchemy.orm import Session

from app.models import ActionLog, AppSetting, DayApproval, Translation
from app.services import action_log

logger = logging.getLogger(__name__)


# ── refusals ──────────────────────────────────────────────────────────────────
# Keys, never sentences — the tab renders them per viewer language, like every
# other label the register ships.

UNSUPPORTED = "unsupported"        # no plan: this kind of action cannot be reversed
NOT_DONE = "not_done"              # it was refused/denied/errored — nothing happened
IS_UNDO = "is_undo"                # this row IS an undo
ALREADY_UNDONE = "already_undone"  # somebody already took it back
CHANGED_SINCE = "changed_since"    # the world moved on; an undo would clobber it
NO_DATA = "no_data"                # the row is too thin to reverse (an automatic row)
MASKED = "masked"                  # the old value was a secret and was never stored
CAPPED = "capped"                  # the row records only part of what it changed

# What `/admin/settings` writes instead of a secret. The register must never be a
# second place a key is readable — which also means it can never put one back.
MASK = "•••"


class Refused(Exception):
    """An undo that may not run. Carries the refusal key, not a sentence."""

    def __init__(self, why: str):
        super().__init__(why)
        self.why = why


@dataclass(frozen=True)
class Plan:
    """One reversible action.

    ``category`` / ``action`` are what the REVERSAL is recorded as — the inverse
    action's own keys, so the register reads as what it is.
    ``check`` returns a refusal key, or None when the undo may run.
    ``run`` performs it and returns the ``action_log.enrich`` fields describing
    what it did.
    """
    category: str
    action: str
    check: Callable[[Session, ActionLog], Optional[str]]
    run: Callable[[Session, ActionLog, dict], dict]


# ── reading a row ─────────────────────────────────────────────────────────────

def _changes(r: ActionLog) -> list[tuple]:
    return [tuple(c) for c in (r.changes or []) if len(c) == 3]


def _detail(r: ActionLog, key: str):
    for pair in (r.details or []):
        if len(pair) == 2 and pair[0] == key:
            return pair[1]
    return None


def _text(v) -> Optional[str]:
    return None if v is None else str(v)


def _day_ref(r: ActionLog) -> Optional[tuple[int, date_t]]:
    """The (unit, business day) a day-close row is about.

    Both close and reopen write ``unit_id`` and ``day`` as columns AND
    ``target_id`` as ``"<manager>:<date>"``. The columns are read first and the
    target id is the fallback, so a row from either writer answers.
    """
    mid, day = r.unit_id, r.day
    if (mid is None or day is None) and r.target_id and ":" in str(r.target_id):
        left, _, right = str(r.target_id).partition(":")
        try:
            mid = mid if mid is not None else int(left)
            day = day if day is not None else date_t.fromisoformat(right[:10])
        except ValueError:
            return None
    if mid is None or day is None:
        return None
    return int(mid), day


# ── attendance: the day ───────────────────────────────────────────────────────

def _notify_day(db: Session, mid: int, day: date_t, payload: dict,
                *, reopened: bool) -> None:
    """Tell the unit, exactly as the ordinary close/reopen endpoints do.

    A day that quietly changes state under a supervisor is the whole reason the
    forward endpoints notify; an undo that skipped it would be the one way to
    move that state in silence. Best-effort — a Telegram outage must not fail an
    undo that has already been committed.
    """
    try:
        from app.routers.staff import _notify_all_parties
        who = payload.get("full_name", "admin")
        _notify_all_parties(
            db, mid,
            "day_reopened" if reopened else "day_closed",
            {**({"reopener_name": who} if reopened else {"closer_name": who}),
             "date": day.isoformat()},
            ntype="warning" if reopened else "info",
            actor_tg_id=int(payload["sub"]) if str(payload.get("sub", "")).isdigit() else None,
            include_supervisor=True,
        )
        db.commit()
    except Exception:
        logger.warning("undo: day notification failed (%s %s)", mid, day, exc_info=True)
        db.rollback()


def _check_reopen(db: Session, r: ActionLog) -> Optional[str]:
    ref = _day_ref(r)
    if not ref:
        return NO_DATA
    if not db.query(DayApproval).filter_by(manager_id=ref[0], date=ref[1]).first():
        return CHANGED_SINCE   # already open — somebody got there first
    return None


def _run_reopen(db: Session, r: ActionLog, payload: dict) -> dict:
    mid, day = _day_ref(r)
    row = db.query(DayApproval).filter_by(manager_id=mid, date=day).first()
    closer = row.approved_by_name
    db.delete(row)
    db.commit()
    _notify_day(db, mid, day, payload, reopened=True)
    return {
        "target_kind": "day", "target_id": f"{mid}:{day.isoformat()}",
        "unit_id": mid, "unit_name": r.unit_name, "day": day,
        "details": [("date", day.isoformat()), ("closed_by", closer or "—")],
        "changes": [("status", "closed", "open")],
    }


def _check_close(db: Session, r: ActionLog) -> Optional[str]:
    ref = _day_ref(r)
    if not ref:
        return NO_DATA
    if db.query(DayApproval).filter_by(manager_id=ref[0], date=ref[1]).first():
        return CHANGED_SINCE   # already closed again
    return None


def _run_close(db: Session, r: ActionLog, payload: dict) -> dict:
    mid, day = _day_ref(r)
    # The re-open row snapshotted who had closed the day, precisely because the
    # DayApproval it deleted was about to be the only record of it. Their NAME
    # goes back; their Telegram id was never recorded and nothing reads it, so
    # inventing one would be the only untrue thing on the restored row.
    closer = _text(_detail(r, "closed_by"))
    if closer in ("", "—"):
        closer = None
    db.add(DayApproval(
        manager_id=mid, date=day,
        approved_by_telegram_id=None,
        approved_by_name=closer,
        approved_at=datetime.now(timezone.utc),
    ))
    db.commit()
    _notify_day(db, mid, day, payload, reopened=False)
    return {
        "target_kind": "day", "target_id": f"{mid}:{day.isoformat()}",
        "unit_id": mid, "unit_name": r.unit_name, "day": day,
        "details": [("date", day.isoformat()), ("closed_by", closer or "—")],
        "changes": [("status", "open", "closed")],
    }


# ── platform settings ─────────────────────────────────────────────────────────

def _check_settings(db: Session, r: ActionLog) -> Optional[str]:
    cs = _changes(r)
    if not cs:
        return NO_DATA
    for key, old, new in cs:
        if MASK in (old, new):
            # A secret's old value was never written down — by design. Writing
            # the mask back would set the literal string "•••" as the API key.
            return MASKED
        row = db.query(AppSetting).filter_by(key=str(key)).first()
        if _text(row.value if row else None) != _text(new):
            return CHANGED_SINCE
    return None


def _run_settings(db: Session, r: ActionLog, payload: dict) -> dict:
    cs = _changes(r)
    back = []
    for key, old, new in cs:
        row = db.query(AppSetting).filter_by(key=str(key)).first()
        if old is None:
            # The key did not exist before this action created it.
            if row:
                db.delete(row)
        elif row:
            row.value = str(old)
        else:
            db.add(AppSetting(key=str(key), value=str(old)))
        back.append((key, new, old))
    db.commit()
    one = cs[0][0] if len(cs) == 1 else None
    return {
        "target_kind": "setting", "target_id": one, "target_name": one,
        "details": [("count", len(cs))],
        "changes": back,
    }


# ── translations ──────────────────────────────────────────────────────────────

def _tr_ref(field) -> Optional[tuple[str, str]]:
    """``"ru:logs.title"`` → ``("ru", "logs.title")``. Split on the FIRST colon:
    a language code never contains one and a key may."""
    lang, sep, key = str(field).partition(":")
    return (lang, key) if sep and lang and key else None


def _cur_tr(db: Session, lang: str, key: str) -> str:
    row = db.query(Translation).filter_by(lang=lang, key=key).first()
    # No row IS the value: the editor stores "" by deleting the override.
    return row.value if row else ""


def _check_translations(db: Session, r: ActionLog) -> Optional[str]:
    cs = _changes(r)
    if not cs:
        return NO_DATA
    # One save of more than 50 strings records only the first 50 (the register
    # must not swallow a megabyte of JSON), so the row cannot put the save back
    # — and a HALF undo is the one outcome nobody could reason about.
    recorded = _detail(r, "count")
    if isinstance(recorded, int) and recorded > len(cs):
        return CAPPED
    for field, old, new in cs:
        ref = _tr_ref(field)
        if not ref:
            return NO_DATA
        if _cur_tr(db, *ref) != (new or ""):
            return CHANGED_SINCE
    return None


def _run_translations(db: Session, r: ActionLog, payload: dict) -> dict:
    cs = _changes(r)
    back = []
    for field, old, new in cs:
        lang, key = _tr_ref(field)
        row = db.query(Translation).filter_by(lang=lang, key=key).first()
        if not old:
            if row:
                db.delete(row)          # back to no override → the built-in text
        elif row:
            row.value = str(old)
        else:
            db.add(Translation(lang=lang, key=key, value=str(old)))
        back.append((field, new, old))
    db.commit()
    langs = {_tr_ref(f)[0] for f, _, _ in cs}
    keys = {_tr_ref(f)[1] for f, _, _ in cs}
    details: list[tuple] = [("count", len(cs))]
    if len(keys) == 1:
        details.append(("key", next(iter(keys))))
    if len(langs) == 1:
        details.append(("language", next(iter(langs))))
    return {
        "target_kind": "translation",
        "target_id": next(iter(keys)) if len(keys) == 1 else None,
        "details": details,
        "changes": back,
    }


# ── the registry ──────────────────────────────────────────────────────────────

_PLANS: dict[str, Plan] = {
    "attendance.day_closed": Plan(
        "attendance", "attendance.day_reopened", _check_reopen, _run_reopen),
    "attendance.day_reopened": Plan(
        "attendance", "attendance.day_closed", _check_close, _run_close),
    "config.settings_saved": Plan(
        "config", "config.settings_saved", _check_settings, _run_settings),
    "config.translation_saved": Plan(
        "config", "config.translation_saved", _check_translations, _run_translations),
}


def undone_map(db: Session, ids) -> dict[int, ActionLog]:
    """Which of these rows have already been taken back, and by which row.

    One indexed lookup for a whole page — the reason ``undo_of`` is a column and
    not a line inside the ``details`` JSON.
    """
    ids = [int(i) for i in ids if i is not None]
    if not ids:
        return {}
    out: dict[int, ActionLog] = {}
    # `outcome == done` is load-bearing. A REFUSED undo carries `undo_of` too —
    # the row is re-badged before the check runs, so a refusal says what it tried
    # to reverse — and counting that as "taken back" would lock a row out of
    # being undone because an earlier attempt FAILED.
    for u in (db.query(ActionLog)
              .filter(ActionLog.undo_of.in_(ids), ActionLog.outcome == "done")
              .all()):
        prev = out.get(u.undo_of)
        if prev is None or (u.id or 0) > (prev.id or 0):
            out[u.undo_of] = u
    return out


def describe(db: Session, r: ActionLog, *, undone: bool = False) -> dict:
    """Can this row be taken back — and if not, why not.

    Always answers with a REASON. A row with no undo control and no explanation
    reads as an oversight; the refusals here are what the panel says out loud.
    """
    plan = _PLANS.get(r.action)
    if plan is None:
        return {"ok": False, "why": UNSUPPORTED, "action": None}
    if r.outcome != "done":
        return {"ok": False, "why": NOT_DONE, "action": plan.action}
    if r.undo_of is not None:
        return {"ok": False, "why": IS_UNDO, "action": plan.action}
    if undone:
        return {"ok": False, "why": ALREADY_UNDONE, "action": plan.action}
    try:
        why = plan.check(db, r)
    except Exception:
        logger.warning("undo check failed for #%s (%s)", r.id, r.action, exc_info=True)
        why = NO_DATA
    return {"ok": why is None, "why": why, "action": plan.action}


def run(db: Session, r: ActionLog, payload: dict, *, undone: bool = False) -> dict:
    """Take one action back. Raises :class:`Refused` with a refusal key.

    The reversal's own log row is re-badged to the inverse action BEFORE the
    check runs, so even a refusal is filed where a reader would look for it —
    a refused undo of a day-close belongs under Attendance, not in «other».
    """
    plan = _PLANS.get(r.action)
    # `undo_of` first and unconditionally, so even a refusal says what it tried
    # to reverse — `undone_map` reads only rows that succeeded, so a linked
    # failure can never be mistaken for one. The category/action re-badge needs a
    # plan; without one the row keeps the ROUTES fallback, which is exactly what
    # "somebody asked to undo something that cannot be undone" looks like.
    action_log.enrich(undo_of=r.id)
    if plan is not None:
        action_log.enrich(category=plan.category, action=plan.action)

    verdict = describe(db, r, undone=undone)
    if not verdict["ok"]:
        raise Refused(verdict["why"])

    out = plan.run(db, r, payload)
    action_log.enrich(
        **{k: v for k, v in out.items() if k not in ("details", "changes")},
        details=[("undo_of", f"#{r.id}"), ("undone_action", r.action)]
                + list(out.get("details") or []),
        changes=list(out.get("changes") or []),
    )
    return {"ok": True, "action": plan.action, "undo_of": r.id}
