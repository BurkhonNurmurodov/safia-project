"""
The factory (plant) dimension — ONE definition, shared by every page that
reports per-factory.

Why this module exists at all: the six factory-aware pages reach their data
through five different shapes — a manager_id list (Overview / Zagruzka /
Workers), a manager NAME resolved through the alias map (Ojidaniya), a
free-text responsible person resolved by fuzzy match (Quality), and a
brigadir_manager_id column (Concerns). If each page decided for itself what
"factory 3" means, they would disagree the first time a supervisor moved
plants, and nobody would be able to tell which page was lying. So every page
funnels through :func:`scoped_manager_ids` and the answer is computed once.

Two things happen here, and they must happen together:

1. **Narrowing** — turn the requested factory into the manager-id set it covers.
2. **Locking** — a supervisor or leader may only ever read their OWN factory
   (the access model chosen for this feature). The lock is applied HERE, on the
   server, not by hiding tabs in the UI: a hidden tab is a suggestion, and
   ``?factory=`` is a query parameter anyone can type.

The "no narrowing" answer is ``None`` — the same convention
``capabilities.profile_unit_ids`` uses — meaning "every manager the caller's
other filters allow". ``None`` is what the «All factories» tab sends, and it is
also what a caller with no factory constraint gets when they ask for nothing.
"""
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models import AppSetting, Factory, Manager

# Global default tab + whether «All factories» is offered. Both are set in the
# admin Factories destination and read by /api/factories.
DEFAULT_FACTORY_SETTING = "default_factory_id"
FACTORY_ALL_TAB_SETTING = "factory_all_tab_enabled"

# Roles pinned to the factory of their own supervisor unit. Everyone else
# (admin, top-manager, shift-manager) may switch freely — management is
# plant-wide by decision, see the feature's access model.
LOCKED_ROLES = ("supervisor", "leader")


def list_factories(db: Session, include_archived: bool = False) -> list[Factory]:
    """Factories in tab order. ``sort_order`` first so the admin controls the
    order outright, then id as a stable tie-break."""
    q = db.query(Factory)
    if not include_archived:
        q = q.filter(Factory.archived.is_(False))
    return q.order_by(Factory.sort_order, Factory.id).all()


def default_factory_id(db: Session) -> Optional[int]:
    """The globally configured landing tab, or None for «All factories».

    Reconciled against reality on read: if the configured factory has since been
    archived or deleted, fall back to the first live one rather than opening a
    tab that no longer exists.
    """
    row = db.query(AppSetting).filter_by(key=DEFAULT_FACTORY_SETTING).first()
    raw = (row.value or "").strip() if row else ""
    live = list_factories(db)
    live_ids = {f.id for f in live}
    if raw == "all":
        return None
    try:
        wanted = int(raw)
    except (TypeError, ValueError):
        wanted = None
    if wanted in live_ids:
        return wanted
    return live[0].id if live else None


def all_tab_enabled(db: Session) -> bool:
    """Is the «All factories» tab offered? Defaults ON — it is the view that
    existed before factories did, so it must not disappear by omission."""
    row = db.query(AppSetting).filter_by(key=FACTORY_ALL_TAB_SETTING).first()
    return True if row is None else (row.value or "1") != "0"


def viewer_factory_id(db: Session, payload: dict) -> Optional[int]:
    """The factory a LOCKED caller belongs to, or None when they may switch.

    Supervisors and leaders both carry their supervisor unit's id in
    ``role_id`` (see RoleProfile: leader role rows keep pointing at the unit),
    so one lookup covers both. A locked caller whose unit has no factory yet
    returns None too — pinning them to nothing would empty their pages, so they
    keep the unfiltered view until an admin assigns the unit.
    """
    if payload.get("role") not in LOCKED_ROLES:
        return None
    unit_id = payload.get("role_id")
    if not unit_id:
        return None
    mgr = db.query(Manager).filter(Manager.id == unit_id).first()
    return mgr.factory_id if mgr else None


def resolve_factory(db: Session, payload: dict, requested: Optional[int]) -> Optional[int]:
    """The factory this request will actually be answered for.

    A locked caller's own factory always wins over whatever ``requested`` says —
    including over «All factories» — so a supervisor cannot widen their view by
    dropping the parameter or typing another id.
    """
    locked = viewer_factory_id(db, payload)
    if locked is not None:
        return locked
    return requested


def factory_manager_ids(db: Session, factory_id: Optional[int]) -> Optional[list[int]]:
    """Manager ids belonging to a factory; None when nothing should be narrowed.

    Archived units are included on purpose: they are excluded (or not) by each
    endpoint's own rules, and silently dropping them here would make a factory's
    history shrink the moment a unit is archived.
    """
    if factory_id is None:
        return None
    return [m.id for m in db.query(Manager.id).filter(Manager.factory_id == factory_id).all()]


def scoped_manager_ids(db: Session, payload: dict, requested: Optional[int],
                       manager_id: Optional[Iterable[int]] = None) -> Optional[list[int]]:
    """THE entry point for endpoints that already filter by ``manager_id``.

    Intersects the caller's existing supervisor filter with the resolved
    factory, so the two filters compose instead of overwriting each other:
    picking one supervisor inside factory A and then switching to factory B
    correctly yields *nothing* rather than silently showing that supervisor's
    factory-A data under a factory-B tab.

    Returns None when neither filter applies, an explicit list otherwise. An
    EMPTY list is a real answer meaning "no supervisor matches" — endpoints must
    not treat it as "no filter" (that is why every caller below passes the
    result through :func:`empty_scope`).
    """
    picked = list(manager_id or [])
    fac_ids = factory_manager_ids(db, resolve_factory(db, payload, requested))
    if fac_ids is None:
        return picked or None
    if not picked:
        return fac_ids
    allowed = set(fac_ids)
    return [m for m in picked if m in allowed]


def empty_scope(ids: Optional[list[int]]) -> bool:
    """True when the scope resolved to "no supervisor at all" — the caller
    should return an empty payload instead of running an unfiltered query.

    Endpoints spell "no filter" as an empty list (``manager_id or None``), so
    without this check an empty factory would read as the whole plant.
    """
    return ids is not None and len(ids) == 0


def factory_of_managers(db: Session) -> dict[int, Optional[int]]:
    """manager id → factory id, for payloads that tag rows rather than filter
    them (Quality ships its whole register and filters client-side)."""
    return {m.id: m.factory_id for m in db.query(Manager.id, Manager.factory_id).all()}


def serialize(f: Factory) -> dict:
    """Wire shape of a factory. Per-language names ride along so the frontend
    renders in the viewer's language with the same ru-first fallback every other
    DB-held name uses (utils/cellName.js)."""
    return {
        "id": f.id,
        "code": f.code,
        "name_uz": f.name_uz,
        "name_uz_cyrl": f.name_uz_cyrl,
        "name_ru": f.name_ru,
        "name_en": f.name_en,
        "sort_order": f.sort_order,
        "archived": f.archived,
    }
