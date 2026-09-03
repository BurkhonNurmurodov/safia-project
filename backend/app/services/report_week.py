"""THE weekly reporting window: last Wednesday back to the Wednesday before it.

One definition, because four things read it — the export endpoint, the cover
slide, the comparison figures and the file name — and four spellings would put
a different period on the file than in its own title.

**Both Wednesdays are INCLUDED**, so a window is eight calendar days and two
consecutive reports share their boundary day. That is the operator's choice
(2026-09-03) and it mirrors the hand-made deck this generator replaces
(«14–21-avgust», also eight days, also sharing a day with the report before
it). The comparison window is the eight days ending on the current window's
FIRST day, so both are the same length and the percentage between them means
something — at the cost of that one shared day being counted in both. Equal
lengths were judged worth more than a clean cut; a 7-day comparison against an
8-day period would read as a fall of an eighth that nobody caused.

`last_wednesday` is deliberately STRICTLY BEFORE today: a report pressed on a
Wednesday is about the week that just ended, not about the day still being
collected — the same reason the bot's /ojidaniya card defaults to yesterday.
"""
from datetime import date, timedelta

# The span in days BETWEEN the two Wednesdays. The window covers SPAN + 1
# calendar days, because both ends are included.
SPAN = 7

_WEDNESDAY = 2  # date.weekday(): Monday 0 … Wednesday 2 … Sunday 6


def last_wednesday(today: date | None = None) -> date:
    """The most recent Wednesday strictly before `today`."""
    d = today or date.today()
    # `or 7` is what makes it strict: on a Wednesday the modulo is 0, which
    # would otherwise answer "today".
    return d - timedelta(days=((d.weekday() - _WEDNESDAY) % 7 or 7))


def window(today: date | None = None) -> tuple[date, date]:
    """(from, to) for the report — Wednesday to Wednesday, both included."""
    end = last_wednesday(today)
    return end - timedelta(days=SPAN), end


def previous(win: tuple[date, date]) -> tuple[date, date]:
    """The window before `win`, same length, ending where `win` begins."""
    start, _ = win
    return start - timedelta(days=SPAN), start


def label(win: tuple[date, date]) -> str:
    """«26.08.2026 — 02.09.2026», the spelling every surface prints."""
    a, b = win
    return f"{a.strftime('%d.%m.%Y')} — {b.strftime('%d.%m.%Y')}"
