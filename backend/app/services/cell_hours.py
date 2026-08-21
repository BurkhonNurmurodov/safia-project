"""Cell working hours — THE definition of when a production cell starts and
stops working. Everything that reads or writes those two clocks goes through
this module; a second spelling of "what hours does this cell work" is how two
surfaces end up disagreeing about the same cell.

**What these hours are.** A start clock and an end clock per CELL, Tashkent
wall-clock, stored as "HH:MM" strings exactly like every other clock on the
platform (the leader-task photo window, the ojidaniya ranges, the per-task
deadline). Never a datetime — a datetime would pin a rule to a day, and this is
the rule that holds every day. Never a duration column either: the duration is
DERIVED here (:func:`duration_min`), so a stored length can never contradict the
two clocks beside it.

**Inheritance.** Two platform defaults, one per shift, in ``AppSetting`` under
:data:`DEFAULT_KEYS`. A cell whose own columns are NULL inherits its
SUPERVISOR's shift default; a cell that carries its own pair overrides it. A
cell with no supervisor — or a supervisor with no shift — inherits nothing and
resolves to ``"none"``, which is stated rather than padded onto shift 1: an
invented answer here would look exactly like a real one.

**Both or neither.** A cell either holds BOTH clocks or NEITHER. A half-set pair
is refused on write and read as "inherit", because half a window is not a window
and the honest reading of "start 08:00, end unknown" is that nobody has set the
hours yet.

**Midnight is not a special case.** Clocks are minutes-from-midnight and an end
at or before its start crossed midnight, so its end carries into the next day
(+1440) — the same convention ``services/idle_intervals`` uses, which is what
makes shift 2 (20:00 → 08:00) ordinary arithmetic instead of a branch. A start
EQUAL to its end is not a 24-hour day, it is an unset window, and
:func:`duration_min` answers ``None`` for it.

**Nothing consumes these hours yet** (user's decision, 2026-08-21). They are a
REGISTER: the «Smena vaqtlari» admin tab writes them and the cell details page
shows them, and that is the whole set of readers. They feed no KPI, no scoring,
no загрузка, no idle-cell union, no attendance rule and no validation. Wiring
them into any of those is a separate decision — ask before doing it.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.models import AppSetting
from app.services.leader_ai import hhmm  # THE clock normaliser — never re-spelled

DAY = 1440

# One AppSetting row per shift, holding the pair as ONE "HH:MM-HH:MM" string:
# the two clocks are meaningless apart, so they are stored the way they are read.
DEFAULT_KEYS = {1: "cell_hours_shift_1", 2: "cell_hours_shift_2"}

# What a box with no rows (or a corrupted one) answers. Placeholders an admin is
# expected to confirm — never a value anybody agreed to.
FALLBACK = {1: ("08:00", "20:00"), 2: ("20:00", "08:00")}

__all__ = [
    "DAY", "DEFAULT_KEYS", "FALLBACK", "hhmm", "parse_pair", "fmt_pair",
    "defaults", "set_default", "duration_min", "resolve", "crosses_midnight",
]


def parse_pair(s: Optional[str]) -> Optional[tuple[str, str]]:
    """"08:00-20:00" -> ("08:00", "20:00"). Anything that is not two clocks —
    junk, a half pair, a stored blank — is None, so the caller falls back rather
    than inventing one half of a window."""
    raw = str(s or "").strip()
    if "-" not in raw:
        return None
    left, _, right = raw.partition("-")
    a, b = hhmm(left), hhmm(right)
    if not a or not b:
        return None
    return a, b


def fmt_pair(start: Optional[str], end: Optional[str]) -> str:
    """The stored form of a pair. Normalises through hhmm() so what is written
    is exactly what parse_pair() will read back."""
    a, b = hhmm(start), hhmm(end)
    if not a or not b:
        return ""
    return f"{a}-{b}"


def defaults(db: Session) -> dict[int, tuple[str, str]]:
    """{1: (start, end), 2: (start, end)} — the per-shift platform defaults.
    A missing or unparseable row reads as FALLBACK: this is consulted on every
    render, so it must always answer something."""
    keys = list(DEFAULT_KEYS.values())
    rows = {r.key: r.value for r in
            db.query(AppSetting).filter(AppSetting.key.in_(keys)).all()}
    out: dict[int, tuple[str, str]] = {}
    for shift, key in DEFAULT_KEYS.items():
        out[shift] = parse_pair(rows.get(key)) or FALLBACK[shift]
    return out


def set_default(db: Session, shift: int, start: str, end: str) -> tuple[str, str]:
    """Write one shift's default. Validates the pair the same way a cell's own
    pair is validated — a default nobody could have typed into a cell would be
    inheritable but not settable. Does NOT commit: the caller owns the
    transaction (and its audit line)."""
    if shift not in DEFAULT_KEYS:
        raise ValueError("shift must be 1 or 2")
    a, b = hhmm(start), hhmm(end)
    if not a or not b:
        raise ValueError("both")
    if a == b:
        raise ValueError("same")
    key = DEFAULT_KEYS[shift]
    row = db.query(AppSetting).filter_by(key=key).first()
    value = fmt_pair(a, b)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=key, value=value))
    return a, b


def _to_min(v: Optional[str]) -> Optional[int]:
    c = hhmm(v)
    if not c:
        return None
    h, m = c.split(":")
    return int(h) * 60 + int(m)


def duration_min(start: Optional[str], end: Optional[str]) -> Optional[int]:
    """How long the window lasts, in minutes. ``end < start`` crossed midnight
    and carries +1440; ``end == start`` is NOT a 24-hour day but an invalid
    window, and answers None — the same door idle_intervals shuts, for the same
    reason (a start equal to its end silently becoming a full day is the one
    error nothing on screen could reveal)."""
    a, b = _to_min(start), _to_min(end)
    if a is None or b is None or a == b:
        return None
    return (b - a) if b > a else (b + DAY - a)


def crosses_midnight(start: Optional[str], end: Optional[str]) -> bool:
    """True when the window runs into the next day. False for an invalid or
    incomplete pair — an unset window crosses nothing."""
    a, b = _to_min(start), _to_min(end)
    if a is None or b is None or a == b:
        return False
    return b < a


def resolve(start: Optional[str], end: Optional[str], shift: Optional[int],
            defs: dict[int, tuple[str, str]]) -> tuple[Optional[str], Optional[str], str]:
    """(effective start, effective end, source) for one cell.

    ``source`` is exactly one of:
      "own"      — the cell carries both clocks; the default is not consulted.
      "default"  — the cell carries neither (or half, which is neither) and its
                   supervisor's shift default applies.
      "none"     — no shift to inherit from: the cell has no supervisor, or its
                   supervisor has none. Deliberately NOT folded onto shift 1 —
                   "we do not know" and "08:00–20:00" are different answers.
    """
    a, b = hhmm(start), hhmm(end)
    if a and b:                       # both-or-neither: half a pair is neither
        return a, b, "own"
    if shift in defs:
        d = defs[shift]
        return d[0], d[1], "default"
    return None, None, "none"
