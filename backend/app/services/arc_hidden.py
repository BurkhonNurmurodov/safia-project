"""
Categories the ARC register does not carry.

IT files their own test tickets against a test category — «Test АРС Фабрика»
and its spellings — and those are not work this plant ever did. They must not
be shown, counted, charted, exported or even downloaded, so the rule lives
here and every reader takes it from here.

It has two spellings and they must stay ONE rule: :func:`is_hidden` for a name
already in memory (the sync drops such a ticket before it is ever written to
the mirror) and :func:`hidden_clause` as the SQL the register filters by — so
a row an older pass already wrote is exactly as invisible as one that was
never downloaded, and a mirror that predates the rule needs no migration. Two
spellings of «is this a test category» is how the table and the KPI strip
above it start counting different tickets.

**The match is anchored and deliberately narrow.** The name is stripped to its
letters and digits and must then consist of NOTHING BUT the marker words: a
test token, optionally an ARC token, optionally a Фабрика token, optionally a
trailing number. That is what keeps real work visible — «Тесто» (dough, which
several divisions here are named after), «Теста», «Тест качества» all stay,
while «Test ARC Fabrika», «ТЕСТ АРС ФАБРИКА», «Тест-АПС Фабрика 2» and a bare
«Test» do not. A name that puts the words in some other order does not match:
extend the pattern rather than loosening the anchors, because a rule that
merely CONTAINS «тест» hides the dough shops.

A ticket IT filed with NO category is a real ticket and stays — see the
``coalesce`` in :func:`hidden_clause`.

This is about the CATEGORY only. A division, a brigade or an author whose name
reads as a test is not touched: the user's rule names the category, and each
of those would need its own decision.
"""
from __future__ import annotations

import re
from typing import Optional

from sqlalchemy import func

from app.models import ArcRequest

# Everything that is not a letter or a digit is noise for this comparison:
# «Test-ARC (Фабрика)» and «test arc fabrika» name the same category. The
# class is spelled out rather than left to [[:alnum:]] / \w so the Python and
# the Postgres side cannot disagree about a locale.
_STRIP_PY = re.compile(r"[^0-9a-zа-яё]+")
_STRIP_SQL = r"[^0-9a-zа-яё]"

# The marker words, in both alphabets, anchored end to end.
_MARKER = (r"^(?:test|тест)"
           r"(?:arc|ars|ark|apc|арс|арк|апс)?"
           r"(?:(?:fabrik|фабрик)[a-zа-яё]*|factory)?"
           r"[0-9]*$")
_MARKER_PY = re.compile(_MARKER)


def _norm(name: str) -> str:
    return _STRIP_PY.sub("", name.lower())


def is_hidden(category_name: Optional[str]) -> bool:
    """Is this category name one of IT's test categories?

    The sync's door: an item that answers True is never written to the mirror,
    so nothing downstream has to know it existed."""
    if not category_name:
        return False
    return bool(_MARKER_PY.match(_norm(category_name)))


def hidden_clause():
    """The same rule as a SQL boolean over ``ArcRequest.category_name``.

    ``coalesce`` is load-bearing. A NULL name makes the comparison NULL, and
    ``not_(NULL)`` is NULL, not TRUE — so without it every ticket IT filed
    with no category at all would drop out of the register instead of the test
    ones, silently, on every endpoint at once."""
    norm = func.regexp_replace(
        func.lower(func.coalesce(ArcRequest.category_name, "")),
        _STRIP_SQL, "", "g")
    return norm.op("~")(_MARKER)
