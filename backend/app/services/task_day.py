"""
The tasks management set for brigadirs, read for ONE DAY — the «Rahbariyat
vazifalari» block on «Smena kunligi» (2026-11-14).

The operator: «Top managers and shift managers and admins when they assign some
kind of task it should appear in the shift day … easy visible for top managers
to say like you are not doing or good doing» — and, the same day, «only
brigadirs' tasks»: the block is the BRIGADIR tier, the tasks a top-manager, a
shift-manager or an admin sets for a brigadir. So it answers, per brigadir, one
question — is the work they were set getting done? — and this module is the
whole of that answer. No database here: the router
(`routers/tasks.py::day_tasks`) reads the rows and their names, this folds
them, and the tests feed it plain objects. The fold itself is tier-blind (a
person is keyed by kind and id), so the router alone decides whose tasks it is
handed.

WHICH TASKS are a day's (the operator's pick, 2026-11-14: «all unfinished +
done that day»): a task set on or before the day that was still OPEN on it, or
that was FINISHED on it. A task finished on an earlier day has left; one set
later has not arrived. Nothing unfinished can hide behind the day switcher.

ITS STATE ON THAT DAY — four, and a task is in exactly one:

  ``done``      finished that day (``late`` when after its deadline)
  ``overdue``   open, and its deadline was before the day
  ``doing``     open, in time, and under way
  ``todo``      open, in time, not started

The board on `/tasks` keeps overdue as a FLAG beside its three statuses, and
that stays right there: it counts what the status column says. This block asks
another question — who is LATE — so late is a bucket of its own here, and the
four still add up to the person's total.

What a past day cannot know: whether a task still open on it was already
started. A task that is open NOW answers with its current status; one that was
finished on a LATER day was plainly under way, so it reads ``doing``.

A DAY is Tashkent's calendar day (``task_board.TZ``).
"""
from datetime import date, datetime, timezone
from typing import Iterable, Optional

from app.services import task_board as tb

STATES = ("overdue", "todo", "doing", "done")

# Inside one person's list: what is late first, what is finished last.
_STATE_ORDER = {"overdue": 0, "todo": 1, "doing": 2, "done": 3}

# A person's one-word answer, worst first — the order the block lists them in.
TONES = ("late", "going", "done")
_TONE_ORDER = {t: i for i, t in enumerate(TONES)}


def local_day(ts) -> Optional[date]:
    """The Tashkent calendar day of a stored instant (a naive one is UTC)."""
    if ts is None:
        return None
    if isinstance(ts, datetime):
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        return ts.astimezone(tb.TZ).date()
    return ts


def state_on(t, day: date) -> Optional[dict]:
    """One task as of ``day`` — ``{state, late, days_late, done_day}`` — or None
    when the task is not part of that day (see the module docstring).

    ``t`` needs ``created_at``, ``completed_at``, ``status`` and ``due_date``.
    """
    created = local_day(t.created_at)
    if created is not None and created > day:
        return None                                   # not set yet
    done_day = None
    if t.status == "done":
        done_day = local_day(t.completed_at)
        if done_day is None:
            return None            # finished, on a day nothing recorded
        if done_day < day:
            return None                               # finished earlier
        if done_day == day:
            late = bool(t.due_date and done_day > t.due_date)
            return {"state": "done", "late": late,
                    "days_late": (done_day - t.due_date).days if late else 0,
                    "done_day": done_day}
    # Open on `day` — still open now, or finished on a later day.
    if t.due_date and t.due_date < day:
        return {"state": "overdue", "late": True,
                "days_late": (day - t.due_date).days, "done_day": done_day}
    under_way = done_day is not None or t.status == "doing"
    return {"state": "doing" if under_way else "todo", "late": False,
            "days_late": 0, "done_day": done_day}


def tone(counts: dict) -> str:
    """A person's answer in one word: ``late`` — something is past its date;
    ``done`` — everything they were set is finished; ``going`` — open work,
    all of it in time."""
    if counts["overdue"]:
        return "late"
    if counts["total"] and counts["done"] == counts["total"]:
        return "done"
    return "going"


def _blank() -> dict:
    return {"overdue": 0, "todo": 0, "doing": 0, "done": 0, "total": 0}


def fold(entries: Iterable[tuple[dict, dict]]) -> dict:
    """``entries`` — ``(person, task)`` pairs, each ``task`` carrying its
    ``state`` (and ``days_late``); ``person`` = ``{kind, id, name, …}``.

    Returns ``{"totals", "people"}``: the people worst first (late → going →
    done; more late tasks, then longer late, then more open work, then the
    name), each with their counts, their ``tone`` and their tasks (late first,
    longest late on top; the flame above its neighbours).
    """
    people: dict[tuple, dict] = {}
    totals = _blank()
    for person, task in entries:
        key = (person["kind"], person["id"])
        p = people.get(key)
        if p is None:
            p = people[key] = {**person, "key": f"{person['kind']}:{person['id']}",
                               **_blank(), "max_late": 0, "tasks": []}
        st = task["state"]
        p[st] += 1
        p["total"] += 1
        totals[st] += 1
        totals["total"] += 1
        if st == "overdue":
            p["max_late"] = max(p["max_late"], task.get("days_late") or 0)
        p["tasks"].append(task)

    out = []
    for p in people.values():
        p["tasks"].sort(key=lambda x: (
            _STATE_ORDER[x["state"]], -(x.get("days_late") or 0),
            0 if x.get("urgent") else 1, x.get("due_date") or "", x["id"]))
        p["tone"] = tone(p)
        out.append(p)
    out.sort(key=lambda p: (
        _TONE_ORDER[p["tone"]], -p["overdue"], -p["max_late"],
        -(p["todo"] + p["doing"]), (p.get("name") or "").lower(), p["id"]))

    totals["people"] = len(out)
    totals["people_late"] = sum(1 for p in out if p["tone"] == "late")
    return {"totals": totals, "people": out}
