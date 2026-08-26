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

**Two live categories, and the rule is written for the shape they have.** IT
files against «test apc fabric» (category 84) and «child  test apc fabric»
(85, the child of the first — two spaces, and the reason the rule cannot be
anchored to the start of the name): 17 tickets of the 32,487 the register held
on 2026-08-26. Matching by NAME rather than by those two ids is deliberate —
an id is IT's to change and a third test category is theirs to add, and either
would put test tickets back on the page with nothing on screen saying so.

**The match is deliberately narrow.** The name is stripped to its letters and
digits, and then has to be either NOTHING BUT marker words or to carry the
test token with an ARC or a Фабрика one straight after it. That is what keeps
real work visible: «Тесто» (dough, which several divisions here are named
after), «Теста» and «Тест качества» all stay. Widening this to a bare «тест»
substring is what would hide the dough shops.

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

# The Cyrillic case fold, done by hand — see :func:`hidden_clause`.
_CYR_UPPER = "АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ"
_CYR_LOWER = "абвгдеёжзийклмнопрстуфхцчшщъыьэюя"

# The marker words, in both alphabets. IT writes the section as «apc» where
# this platform writes «ARC», so both spellings are here; so are the Cyrillic
# ones, which nothing in the register uses today.
_TEST = r"(?:test|тест)"
_ARC = r"(?:a(?:rc|rk|rs|pc|pk|ps)|а(?:рс|рк|пс|пк))"
_FAB = r"(?:fabri[ck][a-zа-яё]*|фабрик[a-zа-яё]*|factory)"

# Two shapes, and they answer two different questions.
#
# Anchored: the name is NOTHING BUT marker words — «Test», «Тест АРС Фабрика»,
# «Test ARC Fabrika 2». A bare «Тест» is safely a test category only because
# the anchors make it the whole name; «Тесто» and «Тест качества» are real.
#
# Contains: the PHRASE, anywhere in the name — which is what the two live
# categories need, since IT named them «test apc fabric» (id 84) and
# «child  test apc fabric» (id 85, two spaces, the child of the first). Here
# the test token must be followed IMMEDIATELY by an ARC or a Фабрика one:
# «testapc», «тестарс» and «testfabric» cannot occur inside a real category
# name, while a bare «тест» substring occurs inside «тесто» — the dough
# several divisions here are named after.
_MARKER = (rf"(?:^{_TEST}{_ARC}?{_FAB}?[0-9]*$)"
           rf"|(?:{_TEST}(?:{_ARC}{_FAB}?|{_FAB}))")
_MARKER_PY = re.compile(_MARKER)


def _norm(name: str) -> str:
    return _STRIP_PY.sub("", name.lower())


def is_hidden(category_name: Optional[str]) -> bool:
    """Is this category name one of IT's test categories?

    The sync's door: an item that answers True is never written to the mirror,
    so nothing downstream has to know it existed."""
    if not category_name:
        return False
    # `search`, not `match`: one of the two shapes is a phrase that may sit
    # anywhere in the name (that is exactly what «child  test apc fabric» is),
    # and the other carries its own anchors. Postgres's `~` searches too, so
    # this is also what keeps the two spellings one rule.
    return bool(_MARKER_PY.search(_norm(category_name)))


def hidden_clause():
    """The same rule as a SQL boolean over ``ArcRequest.category_name``.

    Two details are load-bearing.

    ``coalesce``: a NULL name makes the comparison NULL, and ``not_(NULL)`` is
    NULL, not TRUE — so without it every ticket IT filed with no category at
    all would drop out of the register instead of the test ones, silently, on
    every endpoint at once.

    ``translate``: Postgres ``lower()`` folds ASCII only unless the database
    was created with a UTF-8 ctype (this one was not), so «ТЕСТ АРС ФАБРИКА»
    reaches the pattern as «ТЕСТ АРС ФАБРИКА» and the strip then deletes every
    capital letter in it. Folding the Cyrillic alphabet by hand is the one
    spelling that answers the same in both, on any box."""
    norm = func.regexp_replace(
        func.lower(func.translate(func.coalesce(ArcRequest.category_name, ""),
                                  _CYR_UPPER, _CYR_LOWER)),
        _STRIP_SQL, "", "g")
    return norm.op("~")(_MARKER)
