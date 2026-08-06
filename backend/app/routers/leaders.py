import json
import logging
from datetime import datetime, time, timezone

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AppSetting, LeaderChecklist, LeaderLateRequest, LeaderSyncMeta, Manager,
)
from app.capabilities import page_scope_is_all
from app.permissions import require_page
from app import identity
from app.models import RoleProfile
from app.services import leader_bot
from app.services.name_map import (
    _name_tokens,
    leader_is,
    leader_match,
    relabel_supervisor,
    supervisor_match,
)

router = APIRouter(prefix="/api", tags=["leaders"])

logger = logging.getLogger(__name__)


# Leaders-form supervisor relabels: the checklist form tags some rows with a
# person's name that doesn't match the supervisor unit those rows belong to,
# and they're corrected on read so the dashboard groups, scopes and ranks them
# under the right unit (no re-sync needed). The table itself lives in
# services/name_map.py — the AI proof reviewer resolves the same rows to a unit
# and must not diverge from this one.
_relabel = relabel_supervisor


# ── Shift-1 submission window ─────────────────────────────────────────────────
# Policy (user, 2026-08-06): a shift-1 leader files the day's checklist DURING
# that day, between 08:00 and 20:00. A row that arrives outside those hours — or
# on a different date than the day it reports on, or with no readable timestamp
# at all — is not a submission. It still travels to the page and still shows in
# the register, flagged, but it scores as the missed day it is.
#
# Deliberately narrow, so the rule can only ever bite where it was meant to:
#   * only days from WINDOW_FROM onwards — every earlier day keeps the score it
#     has always had, whenever its row happens to have been filed;
#   * only shift 1 — shift 2 files against a 17:00 → 16:59 day and has no window
#     of its own yet;
#   * only rows whose supervisor RESOLVED to a shift-1 unit. An unmatched name
#     carries a null shift (see sup_shift below), and a name-matching miss must
#     never cost a leader a day's score.
# The timestamp is the sheet's own wall clock — Tashkent, no DST — which is what
# the leader who filed it and the brigadir reading it both see on the form.
WINDOW_FROM = "2026-08-06"      # first REPORTED day the rule judges
WINDOW_SHIFT = 1
WINDOW_OPEN = time(8, 0)
WINDOW_CLOSE = time(20, 0)      # both ends inclusive: 20:00:00 still counts


def _in_window(date_iso: str, submitted_at: datetime | None) -> bool:
    """Did this row arrive on the day it reports on, inside 08:00–20:00?"""
    if submitted_at is None:
        return False
    return (
        submitted_at.strftime("%Y-%m-%d") == str(date_iso)[:10]
        and WINDOW_OPEN <= submitted_at.time() <= WINDOW_CLOSE
    )


def _rejected(date_iso: str, shift: int | None, submitted_at: datetime | None) -> bool:
    """Whether the window rule voids this row. False for every day, shift and
    unresolved unit the rule does not cover — so it can only ever subtract from
    what the page already scored, never rewrite history."""
    if str(date_iso)[:10] < WINDOW_FROM or shift != WINDOW_SHIFT:
        return False
    return not _in_window(date_iso, submitted_at)


# ── Opening a voided day (supervisor requests → admin approves) ───────────────
# A voided day is not final: the unit's own brigadir can ask for it to count, an
# admin decides, and an approved day counts at its FULL checklist score while
# staying flagged as late for good. The decision is keyed by (leader, day) —
# never by checklist row — because leader_checklists is wiped and reloaded on
# every sheet refresh; see the LeaderLateRequest docstring.

LATE_STATES = ("pending", "approved", "rejected")


def _late_key(leader_id: int | None, leader_name: str | None, date_iso: str) -> str:
    """Identity of one leader-day. The profile id when the sheet name resolved to
    a person (so a re-spelled name keeps its decision), else the folded raw name."""
    who = f"p{leader_id}" if leader_id else f"n{(leader_name or '').strip().lower()}"
    return f"{who}|{str(date_iso)[:10]}"


def _late_map(db: Session) -> dict[str, LeaderLateRequest]:
    """Every live request by leader-day. Newest wins, so a re-filed request after
    a rejection is the one that counts."""
    out: dict[str, LeaderLateRequest] = {}
    for r in db.query(LeaderLateRequest).order_by(LeaderLateRequest.id).all():
        out[_late_key(r.leader_profile_id, r.leader_name, r.date)] = r
    return out


def _may_decide(payload: dict) -> bool:
    """Only an admin opens a day. Deliberately NOT a page grant or a capability:
    the whole point of the flow is that the brigadir who wants the day open is
    not the one who opens it."""
    return payload.get("role") == "admin"


def _may_request_for(payload: dict, manager_id: int | None) -> bool:
    """Who may ask for a day to be opened: the unit's own supervisor, or an admin
    (who then does not need to ask at all — see _open_day). A "see all" page grant
    deliberately does NOT widen this; it widens reading, never authority."""
    if payload.get("role") == "admin":
        return True
    return (
        payload.get("role") == "supervisor"
        and manager_id is not None
        and payload.get("role_id") == manager_id
    )


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

    def _shift_of(r):
        return sup_shift.get(_relabel(r.supervisor))

    meta = db.query(LeaderSyncMeta).filter_by(id=1).first()
    late = _late_map(db)

    sheet_data = []
    for r in rows:
        prof = _leader_of(r) or {}
        voided = _rejected(r.date, _shift_of(r), r.submitted_at)
        # An APPROVED request un-voids the day — it counts at its own score again
        # — but `late_state` survives on the row for good, so the dashboard can
        # keep flagging it as a late day. Opened, not laundered.
        req = late.get(_late_key(prof.get("id"), r.leader, r.date)) if voided else None
        opened = bool(req and req.status == "approved")
        sheet_data.append({
            # The form's submission id when we have it — unlike the row id it
            # survives the wipe-and-reload of every sheet refresh.
            "uid": r.submission_id or f"row-{r.id}",
            "source": "sheet",
            "date": r.date,
            "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
            "supervisor": _relabel(r.supervisor),
            "shift": _shift_of(r),
            # Voided by the shift-1 submission window: the client still lists the
            # row (flagged) but scores the day as missed. Computed here, not on
            # the client, so every consumer of this feed reads one verdict.
            "rejected": voided and not opened,
            # Where the day sits in the open-it flow: null when the window never
            # touched it, else pending | approved | rejected. Distinct from the
            # `rejected` boolean above, which is only ever "does this day count".
            "late_state": req.status if req else ("void" if voided else None),
            "late_by": req.decided_by_name if opened else None,
            "late_at": req.decided_at.isoformat() if opened and req.decided_at else None,
            "late_reason": req.reason if req else None,
            # The PERSON: a stable profile id plus their canonical profile
            # name, so every spelling of one leader groups as one person.
            "leader_id": prof.get("id"),
            "leader": prof.get("name") or r.leader,
            "completion": float(r.completion or 0),
            "tasks": r.tasks or [],
        })

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
        # The bot layer is shift 2 only, which the window rule does not judge —
        # but the keys are set anyway so both layers hand the client one shape.
        for b in bot_rows:
            b["rejected"] = False
            b["late_state"] = None

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
        # Whether this viewer can act in the open-a-day flow at all. The client
        # shows the «Late reports» tab off these, so authority is never a guess
        # made from the role string on the client.
        "can_request_late": role in ("admin", "supervisor"),
        "can_decide_late": _may_decide(payload),
    }


# ── «Late reports» — the review queue ────────────────────────────────────────

def _late_queue_items(db: Session, payload: dict) -> list[dict]:
    """Every voided leader-day this viewer has business with, one item per DAY
    (the unit the whole flow is keyed on), newest first.

    Scoped by authority, not by the page's read scope: a supervisor sees their
    own unit's days, an admin sees every unit's. A viewer who can neither ask nor
    decide gets nothing — the queue is a work surface, not a second dashboard.
    """
    role = payload.get("role")
    if role not in ("admin", "supervisor"):
        return []

    rows = db.query(LeaderChecklist).order_by(LeaderChecklist.date.desc()).all()
    managers = db.query(Manager).all()
    sup_match = supervisor_match(
        managers, {_relabel(r.supervisor) for r in rows if r.supervisor}
    )
    lead_match = leader_match(
        db.query(RoleProfile).filter(RoleProfile.role == "leader").all(),
        {(r.leader, (sup_match.get(_relabel(r.supervisor)) or {}).get("id"))
         for r in rows if r.leader},
    )
    late = _late_map(db)
    mgr_name = {m.id: m.name for m in managers}

    # Collapse the day's rows into one item: the window voids a submission, but
    # the DAY is what gets opened, so a leader who filed twice out of hours is
    # one decision, not two.
    items: dict[str, dict] = {}
    for r in rows:
        info = sup_match.get(_relabel(r.supervisor)) or {}
        mid, shift = info.get("id"), info.get("shift")
        if not _rejected(r.date, shift, r.submitted_at):
            continue
        if role == "supervisor" and mid != payload.get("role_id"):
            continue
        prof = lead_match.get((r.leader, mid)) or {}
        key = _late_key(prof.get("id"), r.leader, r.date)
        req = late.get(key)
        it = items.get(key)
        if it is None:
            it = items[key] = {
                "key": key,
                "date": str(r.date)[:10],
                "leader_id": prof.get("id"),
                "leader": prof.get("name") or r.leader,
                "leader_raw": r.leader,
                "supervisor": _relabel(r.supervisor),
                "manager_id": mid,
                "unit": mgr_name.get(mid),
                "shift": shift,
                "completion": 0.0,
                "submitted_at": None,
                "rows": 0,
                "state": req.status if req else "void",
                "request": None,
                "can_request": _may_request_for(payload, mid),
                "can_decide": _may_decide(payload),
            }
            if req:
                it["request"] = {
                    "id": req.id,
                    "reason": req.reason,
                    "by": req.requested_by_name,
                    "at": req.requested_at.isoformat() if req.requested_at else None,
                    "decided_by": req.decided_by_name,
                    "decided_at": req.decided_at.isoformat() if req.decided_at else None,
                }
        it["rows"] += 1
        # The day's own figure: the mean of its rows, exactly what it would score
        # on the dashboard once opened.
        it["completion"] += (float(r.completion or 0) - it["completion"]) / it["rows"]
        ts = r.submitted_at.isoformat() if r.submitted_at else None
        if ts and (it["submitted_at"] is None or ts > it["submitted_at"]):
            it["submitted_at"] = ts

    return sorted(items.values(), key=lambda i: (i["date"], i["leader"]), reverse=True)


@router.get("/leaders/late")
def get_late_queue(
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    """The «Late reports» tab. Returns the whole queue regardless of the
    dashboard's date filter — a decision waiting on you must not be hidden by a
    period someone happened to pick."""
    items = _late_queue_items(db, payload)
    return {
        "items": items,
        "can_decide": _may_decide(payload),
        # What the tab badge counts: whose TURN it is, not what they are allowed
        # to touch. An admin owes decisions on pending requests; a brigadir owes
        # a request on days nobody has raised yet. An admin may open any of those
        # days directly, but it is the unit's turn to ask first — counting them
        # would put every voided day in the factory on the admin's badge.
        "todo": sum(
            1 for i in items
            if (i["state"] == "pending" and i["can_decide"])
            or (i["state"] == "void" and i["can_request"] and not i["can_decide"])
        ),
        "window": {"from": WINDOW_FROM, "open": "08:00", "close": "20:00"},
    }


def _day_facts(db: Session, req: LeaderLateRequest) -> dict:
    """What the day actually holds: the score it settles at (the mean of its
    checklist rows, exactly what the dashboard shows once it counts) and the
    clock time it was filed — the fact the whole decision turns on, so the admin
    reads it in the DM instead of taking "it was late" on trust."""
    rows = (
        db.query(LeaderChecklist)
        .filter(LeaderChecklist.date == req.date,
                LeaderChecklist.leader == req.leader_name)
        .all()
    )
    vals = [float(r.completion or 0) for r in rows]
    filed = max((r.submitted_at for r in rows if r.submitted_at), default=None)
    return {
        "score": round(sum(vals) / len(vals)) if vals else 0,
        "filed_at": filed.strftime("%H:%M") if filed else None,
    }


def _day_score(db: Session, req: LeaderLateRequest) -> int:
    return _day_facts(db, req)["score"]


def _notify_leader_opened(db: Session, req: LeaderLateRequest) -> None:
    """Tell the leader their day counts again — bell row + Telegram DM to every
    account holding the profile, each in its own language. A leader whose sheet
    name never resolved to a profile has nobody to tell; the day still counts."""
    if not req.leader_profile_id:
        return
    try:
        from app.routers.staff import notify_profile
        notify_profile(
            db, f"leader:{req.leader_profile_id}", nkey="leader_late_approved",
            params={
                "date": req.date,
                "decided_by": req.decided_by_name or "—",
                "score": _day_score(db, req),
            },
        )
    except Exception:   # a failed DM must never roll back the decision
        logger.exception("late-open: could not notify leader profile %s", req.leader_profile_id)


def decide_late_request(db: Session, req: LeaderLateRequest, status: str,
                        by_name: str | None, by_telegram: int | None) -> bool:
    """Record an admin decision. THE decision core — the web-app endpoint below
    and the Telegram inline tap both come through here, so a day opened from a
    DM and one opened in the panel are the same event. Returns False when the
    request already sat in that state (a second tap, or a race between admins)."""
    if req.status == status:
        return False
    req.status = status
    req.decided_by_name = by_name
    req.decided_by_telegram = by_telegram
    req.decided_at = datetime.now(timezone.utc)
    db.commit()
    if status == "approved":
        _notify_leader_opened(db, req)
    return True


@router.post("/leaders/late")
def request_late_open(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    """Ask for a voided day to count. The supervisor of the unit files it with a
    reason and every admin gets it as an inline card in their Telegram DM; an
    admin filing the same thing IS the approval, so they are not made to send a
    request to themselves.

    The day is re-derived from the caller's own queue rather than trusted from
    the body: a key that is not in your queue is not yours to open, which makes
    the scope check and the "is it really voided" check the same check."""
    reason = str(body.get("reason") or "").strip()
    key = str(body.get("key") or "")
    if len(reason) < 3:
        raise HTTPException(status_code=400, detail="A reason is required")
    if len(reason) > 1000:
        raise HTTPException(status_code=400, detail="Reason is too long")

    it = {i["key"]: i for i in _late_queue_items(db, payload)}.get(key)
    if it is None:
        raise HTTPException(status_code=404, detail="No such late day in your scope")
    if not it["can_request"]:
        raise HTTPException(status_code=403, detail="Not your unit")
    if it["state"] == "pending":
        raise HTTPException(status_code=409, detail="Already awaiting a decision")
    if it["state"] == "approved":
        raise HTTPException(status_code=409, detail="This day is already open")

    # A rejected request may be re-filed with a better reason; the new one
    # replaces it, so a leader-day never carries two live rows.
    old = _late_map(db).get(key)
    if old is not None:
        db.delete(old)
        db.flush()

    is_admin = payload.get("role") == "admin"
    who = payload.get("full_name") or ""
    tid = int(payload["sub"]) if str(payload.get("sub") or "").isdigit() else None
    req = LeaderLateRequest(
        date=it["date"],
        leader_profile_id=it["leader_id"],
        leader_name=it["leader_raw"],
        manager_id=it["manager_id"],
        status="approved" if is_admin else "pending",
        reason=reason,
        requested_by_profile=identity.viewer_profile_key(db, payload),
        requested_by_name=who,
        requested_by_telegram=tid,
    )
    if is_admin:
        req.decided_by_name = who
        req.decided_by_telegram = tid
        req.decided_at = datetime.now(timezone.utc)
    db.add(req)
    db.commit()
    db.refresh(req)

    if is_admin:
        _notify_leader_opened(db, req)
    else:
        try:
            from app.approvals import send_leader_late_to_admins
            send_leader_late_to_admins(db, req)
        except Exception:   # the request stands even if Telegram is unreachable
            logger.exception("late-open: could not send request %s to admins", req.id)
    return {"id": req.id, "status": req.status}


@router.post("/leaders/late/{req_id}/decide")
def decide_late_open(
    req_id: int,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    """Approve or reject a request — admins only. Approving an already-approved
    day (or rejecting a rejected one) is a no-op, not an error, so two admins
    tapping at once never produces a contradiction."""
    if not _may_decide(payload):
        raise HTTPException(status_code=403, detail="Admins only")
    status = str(body.get("status") or "")
    if status not in ("approved", "rejected"):
        raise HTTPException(status_code=400, detail="status must be approved|rejected")

    req = db.query(LeaderLateRequest).filter_by(id=req_id).first()
    if req is None:
        raise HTTPException(status_code=404, detail="No such request")

    tid = int(payload["sub"]) if str(payload.get("sub") or "").isdigit() else None
    changed = decide_late_request(db, req, status, payload.get("full_name"), tid)
    if changed:
        # Every admin's DM card gets the outcome and loses its buttons, whichever
        # surface the decision came from.
        try:
            from app.approvals import edit_admin_notices
            edit_admin_notices("leader_late", req.id, status, payload.get("full_name"))
        except Exception:
            logger.exception("late-open: could not edit admin notices for %s", req.id)
    return {"id": req.id, "status": req.status, "changed": changed}


@router.delete("/leaders/late/{req_id}")
def cancel_late_open(
    req_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    """Withdraw a request that has not been decided yet. The requester can take
    back their own; an admin can clear any. A decided one stays on the record —
    it is the audit trail for a day that counts (or pointedly does not)."""
    req = db.query(LeaderLateRequest).filter_by(id=req_id).first()
    if req is None:
        raise HTTPException(status_code=404, detail="No such request")
    if req.status != "pending":
        raise HTTPException(status_code=409, detail="Already decided")
    mine = req.requested_by_profile and req.requested_by_profile == identity.viewer_profile_key(db, payload)
    if not (_may_decide(payload) or mine):
        raise HTTPException(status_code=403, detail="Not your request")

    db.delete(req)
    db.commit()
    try:
        from app.approvals import edit_admin_notices
        edit_admin_notices("leader_late", req_id, "cancelled", payload.get("full_name"))
    except Exception:
        logger.exception("late-open: could not clear admin notices for %s", req_id)
    return {"ok": True}
