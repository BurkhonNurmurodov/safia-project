"""The four CONTAINERS a position is packed into, and how many of each a
plan fills (2026-10-30, the operator, from the brigadirs' «Umar oka» form).

A catalog line carries one CAPACITY per container — how much of the product
ONE container holds, in GRAMS when the line's ПЛАН is counted in kg
(`services/pp_uom`), in the line's own unit otherwise — and the
«Pozitsiyalar» table prints, beside each, how many containers the day's plan
needs:

    count = ROUNDUP(ПЛАН × (1000 if kg else 1) ÷ capacity)

the form's own formula, rounded to six places first so a plan that divides
exactly never reads one container too many. A blank capacity has no count.

The capacity is a property of the LINE, not of a day — a product's container
does not change from shift to shift — so it lives on `pp_products` beside
«O'lchov birligi» and is dated by `pp_catalog` like it. No загрузка figure reads
it; the counts are computed by the page, which is why this module holds the
keys and nothing else. The client twin is `CONTAINERS` in Production.jsx.
"""
from __future__ import annotations

# (column on pp_products, the form's header) — in the form's own order:
# сарик контенер (rectangle) · сарик контенер (round, 2026-10-30) · серий
# контенер · челак · сарик яшик.
CONTAINERS = ("cap_yellow", "cap_round", "cap_grey", "cap_bucket", "cap_box")


class InvalidCapacity(ValueError):
    pass


def norm_capacity(value):
    """A capacity as stored: None (blank / "" clears) or a positive number.
    Refused: zero, a negative, anything that is not a number."""
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        v = float(str(value).replace(" ", "").replace(",", "."))
    except (TypeError, ValueError):
        raise InvalidCapacity("capacity must be a number")
    if not (v > 0) or v >= 1e10:
        raise InvalidCapacity("capacity must be a positive number")
    return round(v, 4)
