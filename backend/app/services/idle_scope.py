"""WHO owns an ojidaniya category — and what that ownership is allowed to show.

From **2026-09-10** each waiting category has one named person answerable for
it: the «Kutish mas'uli» («idle-owner»). Two separate things follow from that
assignment, and this module is the ONE definition of both, for the same reason
``factory_scope`` is the one definition of the plant dimension — if each page
decided for itself what "Cat D3's owner" means, they would disagree the first
time a category changed hands and nobody could tell which page was lying.

1. **The NAME.** Every by-category surface prints its owner beside the
   category: the «Xarajat» tree, the «Toifalar bo'yicha» matrix, both
   workbooks, the categories glossary. A cost figure with nobody's name on it
   is a number nobody owns.

2. **The SCOPE.** A viewer holding the ``idle-owner`` role reads the ojidaniya
   register through their OWN categories and no others. The lock is applied
   HERE, on the server, and never by hiding a control: ``?cats=`` is a query
   parameter anyone can type — the rule ``factory_scope`` states for the plant
   and ``shift_scope`` for the shift.

**``None`` is "no narrowing", an EMPTY LIST is a real answer.** The convention
``factory_scope.scoped_manager_ids`` already uses, and the trap it exists to
mark: an owner whose categories have all been re-assigned matches NOTHING, and
reading that empty list as "no filter" would hand them the whole plant. Every
caller tests it with :func:`empty_scope`.

**Nothing here moves a figure.** The owner is resolved on read and is
denormalised nowhere, so re-assigning a category re-labels every past surface
at once with no migration and no re-sync — the property ``wage_rate`` and
``idle_source`` already have. What this module decides is who is NAMED and what
one role is allowed to look at, never what anything costs.

**The 50-minute flag does not survive a narrowing, and that is deliberate.**
``flagged`` is a fact about a unit's WHOLE-day UNION (``_downtime``), so it says
nothing whatever about one category's share of that day — the same reasoning
that keeps a traffic-light ramp off the «Toifalar bo'yicha» matrix. A payload
this module narrowed therefore carries ``flagged: False`` everywhere and says
so through ``cat_locked``, rather than leaving a red mark on screen that the
narrowed numbers underneath it cannot justify.
"""
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app import identity
from app.models import IdleCategoryOwner, Manager, RoleProfile
from app.services.sheets_reader import SHIFT_CATEGORY_ORDER

# The role whose whole reach is one or more categories. Only this role is
# LOCKED: admin, top-manager and everyone else keep the filters they always
# had, exactly as `factory_scope.LOCKED_ROLES` leaves the manager tiers free.
OWNER_ROLE = "idle-owner"

# The categories an owner can be assigned. The sheet's own order and the sheet's
# own keys — a key that does not match its column is a key nobody can look up.
CATEGORIES = list(SHIFT_CATEGORY_ORDER)


def is_owner(payload: dict) -> bool:
    """Is this viewer locked to their own categories?"""
    return (payload or {}).get("role") == OWNER_ROLE


# ── the register ─────────────────────────────────────────────────────────────

def owners(db: Session) -> dict[str, str]:
    """``{category: profile_key}`` — the assignment, and nothing else.

    At most one key per category by the unique constraint on the column, so
    there is never a second owner for a reader to disambiguate between.
    """
    return {r.category: r.profile_key
            for r in db.query(IdleCategoryOwner).all()
            if r.category and r.profile_key}


def _profile_names(db: Session, keys: Iterable[str]) -> dict[str, dict]:
    """``profile_key -> {name, name_uz_cyrl, name_ru, name_en}``, over BOTH
    profile namespaces.

    Supervisors are ``managers`` rows and everyone else is a ``role_profiles``
    row (``app/identity``), so a lookup that knew only one of them would print
    «—» for exactly the owners who are also brigadirs. Only the four name
    columns are selected, not the entities: a query that depends on every column
    a model has ever grown is the trap ``idle_source._n_by_cell`` documents.
    """
    want = {k for k in keys if k}
    if not want:
        return {}

    by_role: dict[str, set[int]] = {}
    for key in want:
        role, ref = identity.parse_profile_key(key)
        if role and ref:
            by_role.setdefault(role, set()).add(ref)

    out: dict[str, dict] = {}

    sup_ids = by_role.pop("supervisor", set())
    if sup_ids:
        for r in db.query(Manager.id, Manager.name).filter(
                Manager.id.in_(list(sup_ids))).all():
            out[f"supervisor:{r.id}"] = {
                "name": r.name, "name_uz_cyrl": None,
                "name_ru": None, "name_en": None,
            }

    rp_ids = {i for ids in by_role.values() for i in ids}
    if rp_ids:
        for r in db.query(
            RoleProfile.id, RoleProfile.role, RoleProfile.name,
            RoleProfile.name_uz_cyrl, RoleProfile.name_ru, RoleProfile.name_en,
        ).filter(RoleProfile.id.in_(list(rp_ids))).all():
            out[f"{r.role}:{r.id}"] = {
                "name": r.name, "name_uz_cyrl": r.name_uz_cyrl,
                "name_ru": r.name_ru, "name_en": r.name_en,
            }
    return out


def owner_labels(db: Session) -> dict[str, dict]:
    """``{category: {profile_key, role, id, name, name_*}}`` — what a by-category
    surface PRINTS.

    Served as a map keyed by category rather than repeated on every row: a tree
    names a category once per brigadir and once per cell under it, and a name
    object copied onto each of those is the same fact travelling a hundred
    times. The ARC register's `cells` map is the precedent.

    A category whose owner's profile has since been deleted is ABSENT, never a
    row with a blank name: «nobody is assigned» and «somebody is assigned whose
    name we cannot resolve» are different facts, and only the first is worth
    printing.
    """
    assigned = owners(db)
    names = _profile_names(db, assigned.values())
    out: dict[str, dict] = {}
    for cat, key in assigned.items():
        who = names.get(key)
        if not who:
            continue
        role, ref = identity.parse_profile_key(key)
        out[cat] = {"profile_key": key, "role": role, "id": ref, **who}
    return out


def categories_of(db: Session, profile_key: Optional[str]) -> list[str]:
    """The categories this ONE profile owns, in the sheet's order.

    Ordered by ``CATEGORIES`` rather than alphabetically so a person holding
    Cat A2 and Cat D3 reads them in the order every other surface lists
    categories in; an unknown key (a category retired from the sheet but still
    assigned) sorts last rather than being dropped, because an assignment the
    platform cannot place is exactly the thing an admin needs to see.
    """
    if not profile_key:
        return []
    mine = [c for c, k in owners(db).items() if k == profile_key]
    order = {c: i for i, c in enumerate(CATEGORIES)}
    return sorted(mine, key=lambda c: (order.get(c, len(order)), c))


# ── the lock ─────────────────────────────────────────────────────────────────

def viewer_categories(db: Session, payload: dict) -> Optional[list[str]]:
    """The categories this viewer is PINNED to, or ``None`` for no narrowing.

    ``None`` for everyone but the ``idle-owner`` role — the manager tiers,
    supervisors and leaders keep the category picks they have always had, and an
    admin who happens to own a category is not thereby locked out of the rest of
    the plant (the rule ``factory_scope.viewer_factory_id`` applies to the plant).

    An EMPTY LIST is a real answer: an owner whose categories were all
    re-assigned matches nothing, and that must read as "nothing", never as
    "everything".
    """
    if not is_owner(payload):
        return None
    return categories_of(db, identity.viewer_profile_key(db, payload))


def resolve_cats(db: Session, payload: dict,
                 requested: Optional[Iterable[str]]) -> Optional[list[str]]:
    """THE category filter for one request: the caller's own pick INTERSECTED
    with whatever the viewer is locked to.

    Returns ``None`` when nothing narrows — no lock and no pick — so an
    unlocked caller's payload is byte-identical to what it has always been.
    Returns a list otherwise, and an EMPTY list where the two do not overlap,
    which is the honest answer to «show me Cat A» from somebody who owns Cat B:
    no rows, rather than every row.

    The intersection direction is what makes the lock a lock — a locked viewer
    can narrow FURTHER (their own filter panel still works) but can never widen
    past the categories they own, whatever ``?cats=`` says.
    """
    pick = [c for c in (requested or []) if c]
    lock = viewer_categories(db, payload)
    if lock is None:
        return pick or None
    if not pick:
        return list(lock)
    keep = set(lock)
    return [c for c in pick if c in keep]


def empty_scope(cats: Optional[Iterable[str]]) -> bool:
    """True when the narrowing matches NOTHING — an empty list, never ``None``.

    The twin of ``factory_scope.empty_scope`` and it exists for the same trap:
    ``if not cats`` reads an empty list as "no filter" and hands a locked viewer
    the whole register.
    """
    return cats is not None and not list(cats)


# ── narrowing a finished payload ─────────────────────────────────────────────

def narrow_downtime(out: dict, cats: Optional[Iterable[str]],
                    lock: Optional[Iterable[str]] = None) -> dict:
    """Apply a category narrowing to `routers/downtime._downtime`'s payload.

    Applied to the FINISHED answer rather than pushed into the query, because
    `_downtime` merges two eras (the «Смена отчёт» row and the cells' own
    intervals) and re-spelling the filter inside each of them is how the two
    halves start disagreeing about which categories a day held.

    Three rules, each of which the surfaces above depend on:

    * **the totals are re-summed from the kept categories.** `total` is a
      whole-day UNION and its slices may overlap, so a narrowed total is the SUM
      of what survived — larger than a union where two causes shared a minute.
      That is exactly the convention the page's own doughnut picks already use,
      and the one `ojidaniya_cost` states for its `cat_minutes`.
    * **the 50-minute flag is dropped.** It is a fact about the unit's whole
      day; carried onto a narrowed row it would mark a unit red for minutes the
      reader is not being shown. `cat_locked` on the payload is how the client
      knows to hide the column rather than render a lie.
    * **the option list is left whole.** `cat_names` narrows (those are the
      table's columns) but a caller who needs to know what EXISTS reads
      `cat_all`, so picking a category never shortens the list it was picked
      from — the rule `ojidaniya_cost.build` already keeps for its own options.

    ``lock`` is what the payload PUBLISHES as `cat_locked`, and it is a separate
    argument from ``cats`` for the reason `resolve_cats` and `viewer_categories`
    are two functions: ``cats`` is the pick ∩ the lock, so passing it here would
    make an ADMIN who clicked one slice of the doughnut look pinned to it — and
    the page would tell them, in so many words, that they may only see the
    categories they answer for. `cat_locked` means «this viewer cannot widen
    past these», nothing else, and is null for everybody who can.
    """
    if cats is None:
        return out
    keep = [c for c in (out.get("cat_names") or []) if c in set(cats)]
    keep_set = set(keep)

    def _cut(d):
        if not isinstance(d, dict):
            return d
        return {k: v for k, v in d.items() if k in keep_set}

    rows = []
    for r in out.get("rows") or []:
        cat = _cut(r.get("by_category") or {})
        cat_ns = _cut(r.get("by_category_ns") or {})
        row = {
            **r,
            "by_category": cat,
            "by_category_ns": cat_ns,
            "total": round(sum(float(v or 0) for v in cat.values()), 2),
            "total_ns": round(sum(float(v or 0) for v in cat_ns.values()), 2),
            # The flag measures the whole day and cannot be re-derived from a
            # slice of it. False, never recomputed against the narrowed total.
            "flagged": False,
            "flagged_ns": False,
        }
        for k in ("by_category_avg", "by_category_ns_avg"):
            if isinstance(r.get(k), dict):
                row[k] = _cut(r[k])
        rows.append(row)

    summary: dict[str, dict] = {}
    for r in rows:
        n = r["manager_name"]
        s = summary.setdefault(n, {
            "manager_id": r["manager_id"], "manager_name": n, "shift": r["shift"],
            "total": 0.0, "flagged_days": 0, "total_ns": 0.0, "flagged_days_ns": 0,
        })
        s["total"] += r["total"]
        s["total_ns"] += r["total_ns"]

    return {
        **out,
        "cat_all": out.get("cat_names") or [],
        "cat_names": keep,
        "cat_locked": None if lock is None else list(lock),
        "rows": rows,
        "summary": sorted(summary.values(), key=lambda x: x["total"], reverse=True),
    }


# ── the writer ───────────────────────────────────────────────────────────────

def set_owner(db: Session, category: str, profile_key: Optional[str],
              actor: Optional[int] = None) -> Optional[dict]:
    """Assign (or clear) one category's owner. The caller commits.

    ``profile_key=None`` DELETES the row, so «nobody is responsible» is the
    absence of a record rather than a third value every reader has to spell out
    — the shape ``LeaderDaySource`` already uses for "no opinion".

    Re-assigning REPLACES: the unique key on ``category`` is the «one for each
    category» rule, so there is nothing to merge and no second row to retire.
    """
    if category not in CATEGORIES:
        raise ValueError(f"unknown ojidaniya category: {category!r}")

    row = db.query(IdleCategoryOwner).filter(
        IdleCategoryOwner.category == category).first()

    if not profile_key:
        if row is not None:
            db.delete(row)
        return None

    if row is None:
        row = IdleCategoryOwner(category=category, profile_key=profile_key,
                                assigned_by=actor)
        db.add(row)
    else:
        row.profile_key = profile_key
        row.assigned_by = actor
    return {"category": category, "profile_key": profile_key}
