"""«Tashkiliy tuzilma» — the platform's people as ONE chart (`/panel/orgchart`).

The page answers three questions an admin used to answer on three pages:
WHERE somebody stands (plant → shift → brigadir → leader, plus the roles that
hang on no unit), WHAT they may open (the role × page matrix, the position's
own entries, each login's own entries) and WHO is behind the position (its
approved logins). It is read-only: every change is still made on «Sahifa
ruxsatlari», «Shaxsiy ruxsatlar» and the profile page, which the chart links.

**Nothing here decides access.** :func:`resolve_access` repeats, for a profile
(and for one login acting as it), the three calls every guard makes —
``capabilities.caller_caps``, ``capabilities.caller_denied_pages`` and
``permissions.role_can_access`` — over rows read once, and hands the verdict to
``role_can_access`` itself, so «the chart says open» cannot come to mean
something the guard does not. A rule changed there must be repeated here
(`tests/test_org_chart.py` pins the pairs that have bitten: an account grant
re-opening a profile deny, an account deny closing a role page, a capability
implying its page).

The payload is FLAT — profiles with their place (`factory_id`, `shift`,
`unit_id`) — and the page draws the tree, because which tier sits where is
presentation. One sweep per table: the register is a few hundred rows, and a
query per profile would be 150 round-trips for an answer that fits in memory.
"""
from typing import Optional

from sqlalchemy.orm import Session

from app.capabilities import (
    CAPABILITIES, CAPABILITY_GROUPS, CAPABILITY_KEYS, DEFAULT_SCOPE, MODE_DENY,
    SCOPES, _READS_PAGE_WHOLE, page_cap,
)
from app.identity import photo_versions
from app.models import (
    Admin, Cell, Factory, Manager, ProfilePermission, RoleProfile, TelegramUser,
    TelegramUserRole, UserCapability, WebCredential,
)
from app.permissions import PAGE_KEYS, TOGGLEABLE_ROLES, get_page_access, role_can_access

# Tier order of the chart — the order the roles are listed everywhere else
# (`broadcast._profile_holders`), admins last: they run the platform, they are
# not a rung of the plant.
ROLES = ("top-manager", "shift-manager", "supervisor", "leader", "idle-owner",
         "guest", "admin")

_PAGE_OF = {c["key"]: c["page"] for c in CAPABILITIES if c["page"]}
_BY_KEY = {c["key"]: c for c in CAPABILITIES}


def _tabs_of(cap: dict) -> list[str]:
    tab = cap["tab"]
    return [] if not tab else [tab] if isinstance(tab, str) else list(tab)


def resolve_access(role: str, matrix: dict,
                   profile_grants: Optional[dict] = None,
                   profile_denies: Optional[list] = None,
                   account_grants: Optional[dict] = None,
                   account_denies: Optional[list] = None,
                   account: bool = False) -> dict:
    """What ONE position — or one login acting as it (``account=True``) — may
    open, as the guards would answer it.

    Returns ``{"all": bool, "pages": [...], "denied": [...], "caps": {...},
    "tabs": [...]}``. Each page row says WHY it is open: ``role`` (ticked for
    the role on the Access matrix), ``grant`` (a ``page.view`` entry's scope —
    «all» too where an action capability reads the page whole) and ``caps``
    (action capabilities that imply the page). ``denied`` are the pages an
    entry closes; ``caps`` every capability held with its scope; ``tabs`` the
    admin pages those open.
    """
    if role == "admin":
        return {"all": True, "pages": [], "denied": [], "caps": {}, "tabs": []}

    # capabilities.caller_caps — the position's grants, the login's on top.
    held: dict[str, str] = dict(profile_grants or {})
    if account:
        held.update(account_grants or {})

    # capabilities.caller_denied_pages — the login's denies stand; a position's
    # deny stands unless a held page grant re-opens it (only a login's can: one
    # row cannot be both for the same target).
    granted = {_PAGE_OF[k] for k in held if k in _PAGE_OF}
    denied = {_PAGE_OF[k] for k in (profile_denies or ()) if k in _PAGE_OF} - granted
    if account:
        denied |= {_PAGE_OF[k] for k in (account_denies or ()) if k in _PAGE_OF}

    # capabilities.capability_pages — a capability implies its pages.
    implied: dict[str, list[str]] = {}
    for c in CAPABILITIES:
        if c["key"] in held and not c["page"]:
            for p in c["pages"]:
                implied.setdefault(p, []).append(c["key"])
    cap_pages = sorted(granted | set(implied))

    whole = {p for cap, p in _READS_PAGE_WHOLE.items() if cap in held}
    pages = []
    for p in PAGE_KEYS:
        if not role_can_access(role, [p], matrix, cap_pages, list(denied)):
            continue
        pages.append({
            "page":  p,
            "role":  role in matrix.get(p, []),
            "grant": "all" if p in whole else held.get(page_cap(p)),
            "caps":  implied.get(p, []),
        })

    tabs: list[str] = []
    for c in CAPABILITIES:
        if c["key"] in held:
            tabs += [t for t in _tabs_of(c) if t not in tabs]

    return {"all": False, "pages": pages, "denied": sorted(denied),
            "caps": {k: held[k] for k in CAPABILITY_KEYS if k in held},
            "tabs": tabs}


def _entries(rows, key_of) -> tuple[dict, dict]:
    """``({target: {capability: scope}}, {target: [capability]})`` — grants and
    denies of one entry table, unknown capabilities dropped as the guards do."""
    grants: dict = {}
    denies: dict = {}
    for r in rows:
        if r.capability not in _BY_KEY:
            continue
        if r.mode == MODE_DENY:
            denies.setdefault(key_of(r), []).append(r.capability)
        else:
            grants.setdefault(key_of(r), {})[r.capability] = (
                r.scope if r.scope in SCOPES else DEFAULT_SCOPE)
    return grants, denies


def _holders(db: Session, leaders: list) -> dict[str, list[int]]:
    """``{profile key: [telegram id]}`` of every APPROVED login —
    ``identity.profile_holders`` for all profiles in one sweep."""
    out: dict[str, set[int]] = {}
    by_unit_name = {(p.manager_id, p.name): p for p in leaders}
    by_id = {p.id: p for p in leaders}
    rows = db.query(TelegramUserRole).filter(TelegramUserRole.status == "approved").all()
    for r in rows:
        if not r.telegram_id:
            continue
        if r.role == "leader":
            prof = None
            if r.profile_key:
                _, _, ref = r.profile_key.partition(":")
                prof = by_id.get(int(ref)) if ref.isdigit() else None
                if prof is not None and prof.manager_id != r.role_id:
                    prof = None
            else:
                prof = by_unit_name.get((r.role_id, r.full_name))
            key = f"leader:{prof.id}" if prof is not None else None
        elif r.role == "admin" or not r.role_id:
            key = None
        else:
            key = f"{r.role}:{r.role_id}"
            if r.profile_key and r.profile_key != key:
                key = None
        if key:
            out.setdefault(key, set()).add(r.telegram_id)
    for a in db.query(Admin).all():
        if a.telegram_id and a.profile_id:
            out.setdefault(f"admin:{a.profile_id}", set()).add(a.telegram_id)
    return {k: sorted(v) for k, v in out.items()}


def build(db: Session) -> dict:
    """THE answer of ``GET /admin/org-chart``."""
    matrix = get_page_access(db)
    p_grants, p_denies = _entries(db.query(ProfilePermission).all(), lambda r: r.profile_key)
    a_grants, a_denies = _entries(db.query(UserCapability).all(), lambda r: r.telegram_id)

    units = db.query(Manager).filter(Manager.archived.is_(False)).order_by(Manager.name).all()
    unit_ids = {m.id for m in units}
    # A leader who left (`ended_on`) is not on the chart: it shows today.
    profiles = (db.query(RoleProfile).filter(RoleProfile.ended_on.is_(None))
                .order_by(RoleProfile.name).all())
    leaders = [p for p in profiles if p.role == "leader"]
    holders = _holders(db, leaders)
    users = {u.telegram_id: u for u in db.query(TelegramUser).all()}
    photos = photo_versions(db)
    web = {c.profile_key for c in db.query(WebCredential).all() if c.enabled}

    cells = [c for c in db.query(Cell).order_by(Cell.verifix_code).all()
             if c.archived_at is None]
    cells_of_unit: dict[int, list] = {}
    cells_of_leader: dict[int, list] = {}
    for c in cells:
        row = {"id": c.id, "code": c.verifix_code, "group": c.wc_group,
               "leader_id": c.leader_id}
        if c.manager_id:
            cells_of_unit.setdefault(c.manager_id, []).append(row)
        if c.leader_id:
            cells_of_leader.setdefault(c.leader_id, []).append(row)

    def account(tid: int, role: str, key: str) -> dict:
        u = users.get(tid)
        own = bool(a_grants.get(tid) or a_denies.get(tid))
        return {
            "telegram_id": tid,
            "name":        (u.tg_name or u.full_name) if u else None,
            "username":    u.username if u else None,
            "last_seen":   u.last_seen.isoformat() if u and u.last_seen else None,
            "grants":      a_grants.get(tid, {}) if role != "admin" else {},
            "denies":      sorted(a_denies.get(tid, [])) if role != "admin" else [],
            # Only where the login differs from its position: the position's
            # own answer already covers every login without entries.
            "access":      resolve_access(
                role, matrix, p_grants.get(key), p_denies.get(key),
                a_grants.get(tid), a_denies.get(tid), account=True,
            ) if own and role != "admin" else None,
        }

    def node(role: str, ref: int, name: str, **extra) -> dict:
        key = f"{role}:{ref}"
        return {
            "key": key, "role": role, "id": ref, "name": name,
            "photo_ver": photos.get(key),
            "web":       key in web,
            "accounts":  [account(t, role, key) for t in holders.get(key, [])],
            "grants":    p_grants.get(key, {}) if role != "admin" else {},
            "denies":    sorted(p_denies.get(key, [])) if role != "admin" else [],
            "access":    resolve_access(role, matrix, p_grants.get(key), p_denies.get(key)),
            **extra,
        }

    out = []
    for m in units:
        out.append(node(
            "supervisor", m.id, m.name,
            shift=m.shift, factory_id=m.factory_id,
            employee_id=m.vfx_employee_id, kind=m.supervisor_kind,
            cells=cells_of_unit.get(m.id, []),
        ))
    for p in profiles:
        if p.role not in ROLES:
            continue
        extra = {"employee_id": p.vfx_employee_id}
        if p.role == "leader":
            # A leader of an archived (or no) unit still holds a profile and
            # its access — the page hangs them under «no brigadir».
            extra.update(unit_id=p.manager_id if p.manager_id in unit_ids else None,
                         kind=p.leader_kind, cells=cells_of_leader.get(p.id, []))
        elif p.role == "shift-manager":
            extra.update(shift=p.shift, factory_id=p.factory_id)
        out.append(node(p.role, p.id, p.name, **extra))

    return {
        "roles":      list(ROLES),
        "page_keys":  PAGE_KEYS,
        # role → the pages the Access matrix opens for everybody holding it.
        "role_pages": {r: [p for p in PAGE_KEYS if r in matrix.get(p, [])]
                       for r in TOGGLEABLE_ROLES},
        "capabilities": [{"key": c["key"], "group": c["group"], "page": c["page"],
                          "scoped": c["scoped"], "tabs": _tabs_of(c)} for c in CAPABILITIES],
        "groups":     CAPABILITY_GROUPS,
        "factories":  [{"id": f.id, "code": f.code, "name_uz": f.name_uz,
                        "name_uz_cyrl": f.name_uz_cyrl, "name_ru": f.name_ru,
                        "name_en": f.name_en}
                       for f in db.query(Factory).filter(Factory.archived.is_(False))
                       .order_by(Factory.sort_order, Factory.id).all()],
        "profiles":   out,
    }
