import json

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import AppSetting, LeaderChecklist, LeaderSyncMeta, Manager
from app.capabilities import page_scope_is_all
from app.permissions import require_page
from app import identity
from app.models import RoleProfile
from app.services import leader_bot
from app.services.name_map import (
    _norm as _fold_name,
    _name_tokens,
    leader_is,
    leader_match,
    supervisor_match,
)

router = APIRouter(prefix="/api", tags=["leaders"])


# Leaders-form supervisor relabels. The checklist form tags some rows with a
# person's name that doesn't match the supervisor unit those rows belong to;
# correct them on read so the dashboard groups, scopes and ranks them under the
# right unit (no re-sync needed). Keyed on the folded name skeleton so any
# alphabet/spelling of the source resolves to the same entry.
_SUPERVISOR_RELABEL = {
    _fold_name("Abdugamitov Muhammad"): "Suvonov Elshod OF",
}


def _relabel(name: str | None) -> str:
    return _SUPERVISOR_RELABEL.get(_fold_name(name or ""), name)


# ── Daraja tier cutoffs ───────────────────────────────────────────────────────
# The standings grade (Chempion / A'lo / O'rta / Past) cuts on the metric the
# list is ranked by. Stored GLOBALLY, not per viewer: a grade has to mean the
# same thing to the admin, the supervisor and the leader looking at their own
# row, so an admin edit is org policy rather than a personal lens.
#
# Defaults are tuned to the metric's real ceiling — every calendar day in the
# picked range counts, so a leader filing perfectly six days a week tops out
# near 87% and a 95 cutoff would make Chempion unreachable.
TIER_KEY = "leader_tier_cuts"
TIER_DEFAULTS = {"top": 85, "good": 65, "mid": 40}


def _read_tiers(db: Session) -> dict:
    row = db.query(AppSetting).filter_by(key=TIER_KEY).first()
    if not row:
        return dict(TIER_DEFAULTS)
    try:
        saved = json.loads(row.value)
    except (ValueError, TypeError):
        return dict(TIER_DEFAULTS)
    if not isinstance(saved, dict):
        return dict(TIER_DEFAULTS)
    # Merge over the defaults so a partial/older blob still yields three cuts.
    return {k: saved.get(k, v) for k, v in TIER_DEFAULTS.items()}


@router.get("/leader-tiers")
def get_leader_tiers(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    """The active cutoffs. Readable by anyone who can open the page — everyone
    has to render the same chips — while writing stays admin-only."""
    return {**_read_tiers(db), "can_edit": payload.get("role") == "admin"}


@router.put("/leader-tiers")
def put_leader_tiers(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")

    cuts = {}
    for k in TIER_DEFAULTS:
        try:
            cuts[k] = int(body[k])
        except (KeyError, TypeError, ValueError):
            raise HTTPException(status_code=400, detail=f"Bad value for '{k}'")
        if not 0 <= cuts[k] <= 100:
            raise HTTPException(status_code=400, detail=f"'{k}' must be 0-100")
    # Strictly descending, else a band would be unreachable (a value can never
    # land in "good" if its floor sits at or above the "top" floor).
    if not cuts["top"] > cuts["good"] > cuts["mid"]:
        raise HTTPException(status_code=400, detail="Cutoffs must be strictly descending")

    row = db.query(AppSetting).filter_by(key=TIER_KEY).first()
    if row is None:
        row = AppSetting(key=TIER_KEY, value="")
        db.add(row)
    row.value = json.dumps(cuts)
    db.commit()
    return {**cuts, "can_edit": True}


@router.get("/leaders")
def get_leaders(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    """All leader checklist submissions. Period/leader filtering is done
    client-side, mirroring the original Apps Script dashboard. A supervisor is
    scoped server-side to their own unit's rows so they can never read another
    brigadir's data via the raw API; a leader is likewise scoped to their own
    checklist rows; admins / shift-managers / top-managers see everything — as
    does anyone holding a personal ``page.view.leaders`` grant at "all".

    **Two collection layers.** Shift 2 files the checklist in the bot, so a
    shift-2 (leader, date) with a CLOSED bot day is served from the bot and its
    sheet row is dropped; every other day still comes from the Google Form
    sheet, which keeps the whole history. Shift 1 is sheet-only — the rule is
    the ROW's shift, not the viewer's, so one (leader, date) reads the same to
    everybody. See services/leader_bot.py."""
    role = payload.get("role")
    # A personal "see all" page grant lifts both scoping passes below. The
    # reported `role` stays the caller's own — it drives the page's layout, not
    # its data — so a granted supervisor keeps their own view, widened.
    sees_all = page_scope_is_all(db, payload, "leaders")

    rows = (
        db.query(LeaderChecklist)
        .order_by(LeaderChecklist.date.desc(), LeaderChecklist.id.desc())
        .all()
    )

    # Each row's (relabeled) supervisor resolves to a unit via the Manager table.
    # The leaders sheet's «Бригадир ФИО» column is a FULL passport-form name in
    # either alphabet ("XAKIMOV RUSLAN ..."), while Manager.name is the short
    # canonical unit name ("Хакимов Руслан") — so the fuzzy supervisor_match (the
    # same matcher the QA register uses) is what bridges the alphabet + short-vs-
    # full-form gap. Both the supervisor scoping below and the shift tagging hang
    # off this one map; a short-name matcher like sheet_alias_map only catches the
    # few rows already in short form. Lets the client offer a shift filter without
    # a separate, auth-gated /api/staff/supervisors round-trip (top-managers can't
    # call it). Unmatched names carry a null shift.
    managers = db.query(Manager).all()
    sup_match = supervisor_match(
        managers, {_relabel(r.supervisor) for r in rows if r.supervisor}
    )

    # unit id → the spelling the SHEET rows print for it (the most frequent one
    # when the form collected several). Bot rows adopt it, because a unit that
    # answered under two different names splits its own supervisor picker entry
    # and its own standings row. Built before the scoping pass so the label a
    # unit carries never depends on who is looking. Units the sheet never named
    # fall back to Manager.name inside dashboard_rows().
    _spellings: dict[int, dict[str, int]] = {}
    for r in rows:
        mid = (sup_match.get(_relabel(r.supervisor)) or {}).get("id")
        if mid is not None:
            seen = _spellings.setdefault(mid, {})
            name = _relabel(r.supervisor)
            seen[name] = seen.get(name, 0) + 1
    sup_display = {
        mid: max(seen.items(), key=lambda kv: (kv[1], kv[0]))[0]
        for mid, seen in _spellings.items()
    }

    if role == "supervisor" and not sees_all:
        # Scope by the matched unit id, not name equality: the sheet name never
        # string-equals the JWT/Manager short canonical name (alphabet + patronymic
        # + spelling drift), which used to drop every row for supervisors.
        rows = [
            r
            for r in rows
            if (sup_match.get(_relabel(r.supervisor)) or {}).get("id")
            == payload.get("role_id")
        ]
    # Resolve every row's «Лидер ФИО» to a leader PROFILE — the person. The sheet
    # spells people freely, so identity-by-name split one leader's score across
    # two spellings and merged two same-named leaders from different units; the
    # matched unit disambiguates. Unmatched rows keep their raw spelling.
    lead_match = leader_match(
        db.query(RoleProfile).filter(RoleProfile.role == "leader").all(),
        {(r.leader, (sup_match.get(_relabel(r.supervisor)) or {}).get("id"))
         for r in rows if r.leader},
    )

    def _leader_of(r):
        return lead_match.get(
            (r.leader, (sup_match.get(_relabel(r.supervisor)) or {}).get("id"))
        )

    if role == "leader" and not sees_all:
        # Scope a leader to their OWN rows by profile identity — from any of
        # their logins, and immune to the sheet's spelling of their name.
        # No confident match ⇒ no rows, never another leader's data.
        my_pid = identity.viewer_leader_profile_id(db, payload)
        if my_pid:
            rows = [r for r in rows if (_leader_of(r) or {}).get("id") == my_pid]
        else:
            me = payload.get("full_name") or ""
            rows = (
                [r for r in rows if r.leader and leader_is(r.leader, me)]
                if len(_name_tokens(me)) >= 2 else []
            )

    sup_shift = {name: info["shift"] for name, info in sup_match.items()}

    meta = db.query(LeaderSyncMeta).filter_by(id=1).first()

    sheet_data = [
        {
            # The form's submission id when we have it — unlike the row id it
            # survives the wipe-and-reload of every sheet refresh.
            "uid": r.submission_id or f"row-{r.id}",
            "source": "sheet",
            "date": r.date,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "supervisor": _relabel(r.supervisor),
            "shift": sup_shift.get(_relabel(r.supervisor)),
            # The PERSON: a stable profile id plus their canonical profile
            # name, so every spelling of one leader groups as one person.
            "leader_id": (_leader_of(r) or {}).get("id"),
            "leader": (_leader_of(r) or {}).get("name") or r.leader,
            "completion": float(r.completion or 0),
            "tasks": r.tasks or [],
        }
        for r in rows
    ]

    # ── the bot layer (shift 2 only) ──────────────────────────────────────────
    # Scoped exactly like the sheet rows above. A leader with no resolvable
    # PROFILE gets no bot rows at all rather than a name-matched guess: bot days
    # are keyed by profile id, so a name fallback could only ever mis-attribute.
    bot_rows = []
    skip_bot = False
    bot_manager_id = bot_leader_id = None
    if not sees_all:
        if role == "supervisor":
            bot_manager_id = payload.get("role_id")
        elif role == "leader":
            bot_leader_id = identity.viewer_leader_profile_id(db, payload)
            skip_bot = bot_leader_id is None
    if not skip_bot:
        bot_rows = leader_bot.dashboard_rows(
            db,
            leader_bot.closed_days(db, manager_id=bot_manager_id, leader_id=bot_leader_id),
            sup_display=sup_display,
        )

    # A closed bot day REPLACES the sheet row for the same person and date —
    # the leader answered twice through two channels, and the bot is the live
    # one. Sheet rows the bot never covered stay as history.
    filed = {(b["leader_id"], b["date"]) for b in bot_rows}
    data = [r for r in sheet_data if (r["leader_id"], r["date"]) not in filed] + bot_rows
    data.sort(key=lambda r: str(r["date"]), reverse=True)

    return {
        "role": role,
        "last_synced": meta.last_synced.isoformat() if meta and meta.last_synced else None,
        "data": data,
    }
