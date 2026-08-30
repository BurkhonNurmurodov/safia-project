import json
import logging
import threading
from collections import Counter
from datetime import datetime, time, timedelta, timezone
from decimal import Decimal
from time import monotonic
from urllib.parse import urlparse

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import Text, cast
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import (
    AppSetting, LeaderAiDispute, LeaderAiReview, LeaderChecklist,
    LeaderLateProof, LeaderLateProofMedia, LeaderLateRequest, LeaderSyncMeta,
    LeaderTaskDay, LeaderTaskOverride, Manager,
)
from app.capabilities import page_scope_is_all
from app.permissions import page_allowed, require_page
from app.security import require_auth
from app import identity
from app.models import RoleProfile
from app.services import (
    action_log, leader_ai, leader_bot, leader_dispute, leader_exclusions,
    leader_late_proof, leader_reports)
from app.services.name_map import (
    _name_tokens,
    leader_is,
    leader_match,
    relabel_supervisor,
    supervisor_match,
    unit_display_names,
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


# ── The register's wire shape ────────────────────────────────────────────────
# `/api/leaders` is the whole history in one response — every report ever
# filed, because the period/leader filtering is client-side (see get_leaders).
# What made that response 10 MB (3.7 MB gzipped, and mostly incompressible) was
# not the rows: it was every task's `photo` field, a comma-joined list of
# ~250-character signed S3 URLs — 7.6 MB of the 10, for links nobody sees until
# ONE report's modal is opened. So the register ships a per-task COUNT instead,
# and the modal fetches the URLs for the one report it opens from
# `/api/leaders/report/{uid}` (row-scoped, and the same row the DM links to).
# The day report, the report DM and the AI reviewer read the source row through
# build_report_row() and keep the URLs — only the bulk feed is projected.

def _photo_count(photo) -> int:
    """How many proof links a sheet task carries — the same rule the client
    used to apply to the raw field (comma-split, keep the http ones)."""
    return sum(1 for p in str(photo or "").split(",") if "http" in p)


def _wire_task(t: dict) -> dict:
    """A task as the register feed ships it: the source dict minus the URL
    string, plus its count. A NEW dict — the source list belongs to the ORM
    row and the overlays already mutate it in place; the projection must not
    also strip it, or a later reader of the same row would find no photos."""
    out = {k: v for k, v in t.items() if k != "photo"}
    out["photos"] = _photo_count(t.get("photo"))
    return out


# ── "is this row mine?", for a leader reading their own register ─────────────
# A leader is scoped by PROFILE id: the row's «Лидер ФИО» is resolved to a
# leader profile (leader_match) and only their own id counts. That is right for
# a row the register DID resolve — two leaders spelled alike in different units
# must never read each other — and wrong for a row it resolved to NOBODY.
#
# Unresolved is common and not the leader's doing: the sheet's spelling has to
# reach a profile inside the unit its «Бригадир ФИО» matched, so a leader whose
# profile sits under a different unit than the one the form files them under —
# or who has no profile yet — carries a null `leader_id`. On the snapshot this
# was ~18% of all rows (16 leaders). Their brigadir and every admin saw those
# reports; the one person who could not was the leader who filed them, whose
# own page said «Ma'lumot yo'q».
#
# So: a row that belongs to a profile is matched by id, exactly as before. A row
# that belongs to NO profile falls back to the name test — the same fuzzy
# `leader_is` the pid-less branch has always used, and it cannot hand over
# another profile's rows, because the row is attributed to no profile at all.
#
# One case is left, and it is the one that keeps a leader off their own page
# after all of the above: the row resolved to a DIFFERENT profile of the SAME
# person. One human commonly owns several leader profiles here — the seeded
# passport-form one ("Bozorova Moxinur Safarali Qizi") and a short one an admin
# created later ("Bozorova Moxinur") — and the register resolves each sheet
# spelling to whichever of them it matches, while the session holds the other.
# `_same_person` is the tie-break, and it is deliberately STRICTER than
# `leader_is`: the surname and the first name must fold IDENTICALLY, no fuzzy
# score, no prefix. Across the whole 93-profile roster that pair is unique to
# one person (the only fuzzy collision, Babayeva / Xadjibayeva Sevara, fails it
# on the surname), so it can only ever join two records of the same human — and
# where two leaders really did share both names, the sheet could not tell them
# apart either and neither could the register.
def _self_names(db: Session, payload: dict, my_pid: int | None) -> set[str]:
    """Every spelling of the viewer's own name worth matching a sheet row
    against: their profile's canonical name (which survives a rename of the
    JWT's copy) plus the name the token was issued with. Names too short to
    identify anyone are dropped — `leader_is` needs two tokens."""
    names = {payload.get("full_name") or ""}
    if my_pid:
        prof = db.query(RoleProfile).filter_by(id=my_pid, role="leader").first()
        if prof:
            names.add(prof.name or "")
    return {n for n in names if len(_name_tokens(n)) >= 2}


def _names_viewer(sheet_name: str | None, names: set[str]) -> bool:
    """Does this sheet spelling name the viewer? Fuzzy — the register's own
    scorer, used only where the row belongs to no profile at all."""
    return bool(sheet_name) and any(leader_is(sheet_name, n) for n in names)


def _same_person(sheet_name: str | None, names: set[str]) -> bool:
    """Is this sheet spelling the SAME person as the viewer, strictly?

    Surname and first name must fold to the same two tokens; anything the
    passport form adds after them (patronymic, «qizi») is ignored, which is
    exactly the difference between one person's two profiles. Used only to
    join a row the register gave to another profile — see the note above.
    """
    tok = _name_tokens(sheet_name or "")
    if len(tok) < 2:
        return False
    key = tuple(tok[:2])
    return any(len(t) >= 2 and tuple(t[:2]) == key
               for t in (_name_tokens(n) for n in names))


def _json_default(o):
    if isinstance(o, datetime):
        return o.isoformat()
    if hasattr(o, "isoformat"):            # date / time
        return o.isoformat()
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (set, frozenset)):
        return sorted(o)
    raise TypeError(f"not JSON serialisable: {type(o).__name__}")


def _json_response(payload) -> Response:
    """Serialise the register straight to bytes.

    Returning a plain dict hands it to FastAPI's `jsonable_encoder`, which walks
    every one of the ~150k nested values (rows × tasks × keys) in Python — and
    does so on the EVENT LOOP, not in the threadpool the handler ran in, so for
    the duration every other request on the single worker waits behind it. The
    dict is already JSON-native (dates pre-formatted, Decimals cast), so the C
    encoder does the whole job in a few tens of ms; `separators` drops the
    whitespace the default renderer would add to every one of those values."""
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"),
                      default=_json_default).encode("utf-8")
    return Response(content=body, media_type="application/json")


# ── Submission windows ────────────────────────────────────────────────────────
# Policy (user, 2026-08-06 for shift 1, 2026-08-11 for shift 2): a leader files
# the day's checklist inside their own shift's hours. A row that arrives outside
# them — or with no readable timestamp at all — is not a submission. It still
# travels to the page and still shows in the register, flagged, but it scores as
# the missed day it is.
#
#   * shift 1 files DURING the day it reports on, 08:00 → 20:00.
#   * shift 2 works and files across midnight, 17:00 on its own day → 09:00 the
#     next morning. Both dated halves are on time; 09:00 is the deadline, so a
#     night report filed at 11:00 is late exactly like an 07:00 shift-1 one.
#
# Shift 2's open was 21:00 until 2026-08-22 (user) — an hour that was never the
# crew's. They are on the floor from 17:00, so the first four hours of every
# night were filed into a window that had not opened yet and the day scored 0
# for paperwork that was in fact early. This is the same correction the AI photo
# window took on 2026-08-14 (services/leader_ai.SHIFT_WINDOW) and the hour the
# day boundary itself turns at (leader_tasks.SHIFT2_START_HOUR): three rules
# that all answer "when does a shift-2 night begin", now saying one thing.
# Nothing is stored — the verdict is derived per request — so every past night
# re-reads under the new hours, and it can only ever move one way: a day voided
# for an 18:00 filing counts again, and no day that counted can start failing.
#
# Deliberately narrow, so the rule can only ever bite where it was meant to:
#   * only days from that shift's WINDOW_FROM onwards — every earlier day keeps
#     the score it has always had, whenever its row happens to have been filed;
#   * only rows whose supervisor RESOLVED to a unit. An unmatched name carries a
#     null shift (see sup_shift below), and a name-matching miss must never cost
#     a leader a day's score.
# The timestamp is the sheet's own wall clock — Tashkent, no DST — which is what
# the leader who filed it and the brigadir reading it both see on the form.
#
# The DAY a row belongs to is settled before this rule ever sees it, at sync
# time, by services/leader_tasks.filed_date — a shift-2 row filed at 06:00 is
# attributed to the night that started at 17:00, not to the calendar date the
# form stamped on it. Lateness is judged against that day, never against the
# stamp, or a report would be voided for the very thing it was re-dated for.
WINDOW_FROM = {1: "2026-08-06", 2: "2026-08-11"}   # first REPORTED day judged
WINDOW = {
    # shift: (open, close, crosses_midnight)
    1: (time(8, 0), time(20, 0), False),   # both ends inclusive: 20:00:00 counts
    2: (time(17, 0), time(9, 0), True),    # 17:00 → 09:00 next morning
}
# The CLOSE carries a wrap-up allowance; the open does not (user, 2026-08-11).
# A leader filling the last answers as the shift hands over lands a minute or ten
# past the hour — a real 20:09 report was voided for it — while a leader filing
# BEFORE their shift opens has not done the work yet, which is the asymmetry the
# user chose, and it is unchanged by the open moving to 17:00. Deliberately not
# folded into WINDOW: 20:00 stays the deadline everyone is told, and this is the
# slack behind it, not a later one to aim at.
CLOSE_GRACE = timedelta(minutes=15)


def _in_window(date_iso: str, shift: int | None,
               submitted_at: datetime | None) -> bool:
    """Did this row arrive inside its shift's filing window for the day it
    reports on? For shift 2 that window ends on the NEXT calendar date, so the
    comparison is made on the full timestamp rather than on a time-of-day inside
    one date — a 02:00 report carries tomorrow's date and is still on time."""
    if submitted_at is None:
        return False
    opens, closes, overnight = WINDOW[shift]
    try:
        day = datetime.strptime(str(date_iso)[:10], "%Y-%m-%d")
    except ValueError:
        return False
    start = day.replace(hour=opens.hour, minute=opens.minute)
    end = day.replace(hour=closes.hour, minute=closes.minute) + CLOSE_GRACE
    if overnight:
        end += timedelta(days=1)
    return start <= submitted_at <= end


def _rejected(date_iso: str, shift: int | None, submitted_at: datetime | None) -> bool:
    """Whether the window rule voids this row. False for every day, shift and
    unresolved unit the rule does not cover — so it can only ever subtract from
    what the page already scored, never rewrite history."""
    if shift not in WINDOW or str(date_iso)[:10] < WINDOW_FROM[shift]:
        return False
    return not _in_window(date_iso, shift, submitted_at)


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
    # The cutoffs in force until this request — already in hand, so the register
    # can say which band moved rather than only where it landed.
    try:
        prev = json.loads(row.value) if row is not None and row.value else {}
    except (TypeError, ValueError):
        prev = {}
    if row is None:
        row = AppSetting(key=TIER_KEY, value="")
        db.add(row)
    row.value = json.dumps(cuts)
    db.commit()
    action_log.enrich(
        target_kind="tier", target_id=TIER_KEY,
        details=[("threshold",
                  ", ".join(f"{k} {cuts[k]}" for k in TIER_DEFAULTS))],
        changes=[(k, prev.get(k), cuts[k]) for k in TIER_DEFAULTS
                 if prev.get(k) != cuts[k]],
    )
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

    **Two collection layers.** A (leader, date) with a CLOSED bot day that the
    merge rule carries is served from the bot and its sheet row is dropped;
    every other day comes from the Google Form sheet, which keeps the whole
    history. The rule is the ROW, not the viewer, so one (leader, date) reads
    the same to everybody. It is shift 2 — which files in the bot — plus units
    enrolled in in-app camera capture, from the day that shipped. See
    `leader_bot.merges`.

    **Wire shape.** Every task ships `photos` (a count), never the URL string
    the source row holds — see `_wire_task`. The modal that needs the links
    fetches them for its ONE report from `/api/leaders/report/{uid}`."""
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
    # fall back to Manager.name inside dashboard_rows(). The census itself is
    # `name_map.unit_display_names`, shared with the AI queue's `_project`,
    # which has to label a bot row with the SAME string the picker holds.
    sup_display = unit_display_names(
        sup_match, Counter(r.supervisor for r in rows).items()
    )

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

    # Every leader profile record that IS this viewer (see
    # `identity.viewer_leader_profile_ids`) — the set both halves of the
    # register scope by, so a person entered twice reads one history.
    my_pids: set[int] = set()

    if role == "leader" and not sees_all:
        # Scope a leader to their OWN rows by profile identity — from any of
        # their logins, and immune to the sheet's spelling of their name.
        # A row the register attributed to a profile is matched by id: any of
        # this person's own records counts, another person's never does. A row
        # it attributed to NO profile falls back to the name (see `_self_names`
        # above) — it belongs to nobody, so matching it by name takes it from
        # no one, and refusing it hid a leader from reports they filed
        # themselves.
        my_pid = identity.viewer_leader_profile_id(db, payload)
        my_pids = set(identity.viewer_leader_profile_ids(db, payload))
        me = _self_names(db, payload, my_pid)

        def _is_mine(r) -> bool:
            pid = (_leader_of(r) or {}).get("id")
            if not pid or not my_pids:
                return _names_viewer(r.leader, me)
            return pid in my_pids or _same_person(r.leader, me)

        rows = [r for r in rows if _is_mine(r)]

    sup_shift = {name: info["shift"] for name, info in sup_match.items()}

    def _shift_of(r):
        return sup_shift.get(_relabel(r.supervisor))

    meta = db.query(LeaderSyncMeta).filter_by(id=1).first()
    late = _late_map(db)
    # Days an admin took out of the results entirely. Loaded here, once, and
    # stamped per row: the client scores this feed, so a day it is not told
    # about is a day it counts.
    excl = leader_exclusions.load(db)

    sheet_data = []
    # Every leader-day the two FILED layers account for. An exclusion whose key
    # is not in here has no row to carry it — `orphan_rows` builds one, because
    # the client drops a day from its denominator only when handed a row saying
    # so, and a day nobody filed already costs its leader a full slot.
    covered: set[str] = set()
    for r in rows:
        prof = _leader_of(r) or {}
        excl_key = leader_exclusions.key(prof.get("id"), r.leader, r.date)
        covered.add(excl_key)
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
            # OUT of the results — not 0%, absent. Outranks `rejected`: an
            # exclusion is a person's explicit answer about this exact day and
            # the void is a rule about all of them, the same precedence
            # `LeaderDaySource` has over `merges()`.
            "excluded": leader_exclusions.wire(excl.get(excl_key)),
            # The PERSON: a stable profile id plus their canonical profile
            # name, so every spelling of one leader groups as one person.
            "leader_id": prof.get("id"),
            "leader": prof.get("name") or r.leader,
            "completion": float(r.completion or 0),
            "tasks": r.tasks or [],
        })

    # ── the bot layer (shift 2 only) ──────────────────────────────────────────
    # Scoped exactly like the sheet rows above. A bot day is keyed by profile
    # id and carries no name of its own, so there is nothing here to match
    # loosely — but it is keyed by ONE record of a person who may hold several,
    # which is why the scope is the viewer's whole record set rather than the
    # single id their token names. A viewer we cannot resolve to any leader
    # record still gets no bot rows: with no id there is nothing to ask for.
    bot_rows = []
    skip_bot = False
    bot_manager_id = None
    bot_leader_ids: list[int] | None = None
    if not sees_all:
        if role == "supervisor":
            bot_manager_id = payload.get("role_id")
        elif role == "leader":
            bot_leader_ids = sorted(my_pids)
            skip_bot = not bot_leader_ids
    if not skip_bot:
        bot_rows = leader_bot.dashboard_rows(
            db,
            leader_bot.closed_days(db, manager_id=bot_manager_id, leader_id=bot_leader_ids),
            sup_display=sup_display,
        )
        # The filing-window rule judges SHEET rows: a bot day is filed by being
        # closed, and the close is already refused once the window has shut. The
        # keys are set anyway so both layers hand the client one shape.
        for b in bot_rows:
            b["rejected"] = False
            b["late_state"] = None
            bot_key = leader_exclusions.key(b.get("leader_id"), None, b["date"])
            covered.add(bot_key)
            b["excluded"] = leader_exclusions.wire(excl.get(bot_key))

    # A closed bot day REPLACES the sheet row for the same person and date —
    # the leader answered twice through two channels, and the bot is the live
    # one. Sheet rows the bot never covered stay as history.
    filed = {(b["leader_id"], b["date"]) for b in bot_rows}
    data = [r for r in sheet_data if (r["leader_id"], r["date"]) not in filed] + bot_rows

    # A THIRD kind of row: a day an admin excluded that neither layer ever
    # carried. It exists only because somebody recorded a decision about that
    # exact day — the register still invents nothing — and it is scoped exactly
    # as the filed layers are, because it moves the denominator: a viewer not
    # handed it would read a different mean for a leader than everyone else
    # reads for that same leader.
    data += leader_exclusions.orphan_rows(
        db, excl, covered,
        sup_display=sup_display,
        manager_ids=({payload.get("role_id")}
                     if role == "supervisor" and not sees_all else None),
        leader_ids=(my_pids if role == "leader" and not sees_all else None),
    )
    data.sort(key=lambda r: str(r["date"]), reverse=True)

    _apply_overlays(db, data)

    # What verification has done to each report, so the register can print the
    # state beside the score. Stamped on the row rather than fetched beside it
    # — the header's numbers and the table's rows then come out of one read and
    # cannot describe different sets.
    #
    # Served to EVERY viewer since the automatic regime shipped, not just
    # admins: a rejection now moves the score of the brigadir and the leader
    # reading this, and hiding the reason from the two people it costs would
    # leave them with a number that dropped for no visible cause. It stays one
    # aggregated query scoped to the dates already on screen.
    ai_stats = leader_ai.stats_by_uid(db, {str(r["date"]) for r in data})
    for row in data:
        hit = ai_stats.get(row["uid"])
        if hit:
            row["ai"] = hit
        # LAST, after every overlay has stamped the source tasks: the wire copy
        # carries the count, not the links (see _wire_task).
        row["tasks"] = [_wire_task(t) for t in (row.get("tasks") or [])]

    # Who was SUPPOSED to file. The feed above answers "what was submitted", and
    # nothing on the platform answered "by whom, on a day where the answer was
    # nothing" — which is the only question the exclusions tab can build a
    # missing day from. Served to ADMINS alone: it is the roster of every leader
    # on the platform, the tab that needs it is admin-only, and the endpoint
    # that acts on it refuses anybody else. The supervisor spelling is
    # `sup_display`, the same one the rows carry, so a day named here lands in
    # the unit bucket its leader's filed days land in.
    roster = []
    if role == "admin":
        by_unit = {m.id: m for m in managers}
        for p in (db.query(RoleProfile)
                  .filter(RoleProfile.role == "leader",
                          RoleProfile.manager_id.isnot(None))
                  .order_by(RoleProfile.name).all()):
            unit = by_unit.get(p.manager_id)
            # An archived unit keeps its history and leaves every picker — a
            # leader nobody can file for is not a leader with missing days.
            if unit is None or unit.archived:
                continue
            roster.append({
                "id": p.id,
                "name": p.name,
                "manager_id": p.manager_id,
                "supervisor": sup_display.get(p.manager_id) or unit.name,
                "shift": unit.shift,
            })

    return _json_response({
        "role": role,
        "last_synced": meta.last_synced.isoformat() if meta and meta.last_synced else None,
        "data": data,
        "roster": roster,
        # Whether this viewer can act in the open-a-day flow at all. The client
        # shows the «Late reports» tab off these, so authority is never a guess
        # made from the role string on the client.
        "can_request_late": role in ("admin", "supervisor"),
        "can_decide_late": _may_decide(payload),
    })


def _apply_overlays(db: Session, data: list[dict]) -> None:
    """Make every human ruling change the number it judged, in place.

    Two overlays, one pass. An upheld AI flag has to cost the day its points,
    or the whole review loop is theatre — the admin rules on a photo and the
    leaderboard goes on showing the score the fake earned. And an admin's own
    done/not-done ruling (LeaderTaskOverride, set from the detail modal) has to
    move the same number the same way. Neither source can be written back (the
    leaders sheet is wipe-and-reloaded, a closed bot day is immutable), so both
    are applied here, at read time, every time.

    The rule is a DELTA, not a re-derivation: a report nobody ruled on is left
    byte-for-byte as it was, and a ruling moves exactly that task's share of
    its own answered weight. Re-deriving every completion from the task list
    would silently restate the sheet's own arithmetic for thousands of rows
    that nobody ruled on.

    Where both overlays hit one task, the admin override wins — it is the
    explicit human statement of the task's state, and printing «AI dalili rad
    etildi» beside an admin's «done» would be a contradiction on screen.

    Deliberately AFTER the merge and sort, so it sees the rows the client will
    actually score — a sheet row a bot day replaced must not be penalised for a
    verdict on a task nobody ends up reading.
    """
    dates = {str(r["date"]) for r in data}
    rejected = leader_ai.rejected_by_uid(db, dates)
    overrides: dict[str, dict[int, LeaderTaskOverride]] = {}
    if dates:
        for o in (db.query(LeaderTaskOverride)
                  .filter(LeaderTaskOverride.date.in_(dates)).all()):
            overrides.setdefault(o.uid, {})[o.task_id] = o
    if not rejected and not overrides:
        return
    weights = leader_ai.task_weights(db)

    for row in data:
        hit = rejected.get(row["uid"]) or set()
        ovs = overrides.get(row["uid"]) or {}
        if not hit and not ovs:
            continue
        tasks = row.get("tasks") or []
        # Denominator = the weight this report actually put in front of the
        # leader. A question the form never asked (`answered: False`) was never
        # theirs to fail, so it cannot dilute the penalty either.
        total = sum(weights.get(int(t.get("id") or 0), 0)
                    for t in tasks if t.get("answered") is not False)
        if total <= 0:
            continue
        delta = 0
        for t in tasks:
            tid = int(t.get("id") or 0)
            ov = ovs.get(tid)
            # An unasked question was never the leader's to pass or fail, so it
            # is not the admin's to rule on either — the modal offers no control
            # there, and a stray API call must not mint weight out of thin air.
            if ov is not None and t.get("answered") is not False:
                # Stamped on the row so the modal can show the ruling, who made
                # it and when — to the leader too, whose score it just moved.
                t["admin_done"] = bool(ov.done)
                t["admin_by"] = ov.set_by
                t["admin_at"] = ov.set_at.isoformat() if ov.set_at else None
                if ov.done and not t.get("done"):
                    delta += weights.get(tid, 0)
                elif not ov.done and t.get("done"):
                    delta -= weights.get(tid, 0)
                continue    # the override supersedes the AI ruling for this task
            if tid not in hit:
                continue
            # Flagged on the row itself so the detail modal can say WHY the task
            # reads as failed while the leader's own answer still says «Ha».
            t["ai_rejected"] = True
            # Only a task that was counting as done has anything to take away.
            if t.get("done"):
                delta -= weights.get(tid, 0)
        if delta:
            row["completion"] = min(100.0, max(0.0, row["completion"] + delta / total * 100))


def build_report_row(db: Session, uid: str) -> dict | None:
    """ONE report, shaped exactly as `/api/leaders` ships it — same matchers,
    same window verdict, same overlays, same keys. None when the uid names
    nothing (a deleted bot day, a sheet row the register no longer carries).

    The day-report page and the report DM both read the day through this, so a
    score can never differ between the register, the page and the message. The
    alternative — re-deriving a completion in the notifier — is how three
    surfaces end up printing three numbers for one day, which is exactly the
    thing this feature exists to avoid.

    Narrowed to one row rather than reusing get_leaders(): the matchers are
    fuzzy and cost real time over the whole table, and `queue_report` already
    matches a single row this way.
    """
    uid = str(uid or "").strip()
    if not uid:
        return None

    if uid.startswith("bot-"):
        try:
            day_id = int(uid[4:])
        except ValueError:
            return None
        day = db.query(LeaderTaskDay).filter_by(id=day_id).first()
        if day is None or day.closed_at is None:
            return None
        rows = leader_bot.dashboard_rows(db, [day])
        if not rows:
            return None
        row = rows[0]
        row["rejected"] = False
        row["late_state"] = None
        # dashboard_rows names the unit; the scope check needs its id.
        row["manager_id"] = day.manager_id
        row["raw_completion"] = row["completion"]
        _apply_overlays(db, [row])
        return row

    q = db.query(LeaderChecklist)
    src = (q.filter_by(id=int(uid[4:])).first()
           if uid.startswith("row-") and uid[4:].isdigit()
           else q.filter_by(submission_id=uid).first())
    if src is None:
        return None

    name = _relabel(src.supervisor)
    info = (supervisor_match(db.query(Manager).all(), {name}) or {}).get(name) or {}
    prof = {}
    if src.leader:
        prof = (leader_match(
            db.query(RoleProfile).filter(RoleProfile.role == "leader").all(),
            {(src.leader, info.get("id"))},
        ) or {}).get((src.leader, info.get("id"))) or {}

    shift = info.get("shift")
    voided = _rejected(src.date, shift, src.submitted_at)
    req = None
    if voided:
        req = _late_map(db).get(_late_key(prof.get("id"), src.leader, src.date))
    opened = bool(req and req.status == "approved")

    row = {
        "uid": leader_ai.row_uid(src),
        "source": "sheet",
        "date": src.date,
        "submitted_at": src.submitted_at.isoformat() if src.submitted_at else None,
        "supervisor": name,
        "manager_id": info.get("id"),
        "shift": shift,
        "rejected": voided and not opened,
        "late_state": req.status if req else ("void" if voided else None),
        "late_by": req.decided_by_name if opened else None,
        "late_reason": req.reason if req else None,
        "leader_id": prof.get("id"),
        "leader": prof.get("name") or src.leader,
        "completion": float(src.completion or 0),
        "tasks": src.tasks or [],
    }
    # What the leader's own answers added up to, before any overlay moved it.
    # The page and the DM both print the pair — a score that dropped without
    # showing what it dropped from reads as an error, not a verdict.
    row["raw_completion"] = row["completion"]
    _apply_overlays(db, [row])
    return row


def report_scope_ok(db: Session, payload: dict, row: dict) -> bool:
    """May this viewer read this one report? Mirrors the row scoping in
    `get_leaders` exactly — admins, shift- and top-managers see every report,
    a supervisor their own unit's, a leader their own, a guest whatever the
    page shows them.

    The day report is reachable straight from a Telegram DM, so it is
    auth-only rather than page-gated (like `/cells/:id`): a brigadir who was
    never granted the `/leaders` page still has to be able to open the report
    about their own unit that the bot just sent them. Authority to READ is the
    row scope; authority to ACT is checked separately.
    """
    role = payload.get("role")
    if role in ("admin", "shift-manager", "top-manager"):
        return True
    if page_scope_is_all(db, payload, "leaders"):
        return True
    if role == "guest":
        # A guest has no unit and no rows of their own, so `get_leaders` scopes
        # nothing for them: holding the page IS the whole scope, and a guest
        # who was given it reads the register whole — rows, photos, verdicts.
        # Without this clause the same guest could open every row in the table
        # and none of the day reports (or verdicts) behind them. A guest with
        # no page grant still reads nothing here.
        return page_allowed(db, payload, "leaders")
    if role == "supervisor":
        return row.get("manager_id") is not None and \
            row.get("manager_id") == payload.get("role_id")
    if role == "leader":
        # The SAME three-way rule as get_leaders, and it has to stay the same
        # three-way rule: this door opens exactly what that page lists, or a
        # report the leader can see turns into a 404 the moment they tap it.
        # Profile id decides a row the register resolved; the fuzzy name test
        # only ever reaches a row resolved to nobody; `_same_person` (surname
        # and first name folding identically) joins a row the register gave to
        # this person's other profile. What is still refused is what always
        # was: a row belonging to a profile whose person is somebody else.
        my_pid = identity.viewer_leader_profile_id(db, payload)
        my_pids = set(identity.viewer_leader_profile_ids(db, payload))
        me = _self_names(db, payload, my_pid)
        pid = row.get("leader_id")
        if not pid or not my_pids:
            return _names_viewer(row.get("leader"), me)
        return pid in my_pids or _same_person(row.get("leader"), me)
    return False


# ── the day report (one leader, one day, every verdict) ──────────────────────
# Reached from the Telegram DM the automatic regime sends, so it is AUTH-ONLY
# and row-scoped rather than page-gated: the brigadir being told their unit's
# score is often someone no admin ever granted the /leaders page to, and a
# notification that lands on a "no access" screen is worse than no
# notification. Reading is the row scope; acting is checked per action below.

@router.get("/leaders/report/{uid}")
def get_day_report(
    uid: str,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    row = leader_reports.day_report(db, uid)
    if row is None:
        raise HTTPException(status_code=404, detail="No such report")
    if not report_scope_ok(db, payload, {
        "manager_id": row["managerId"], "leader_id": row["leaderId"],
        "leader": row["leader"],
    }):
        # 404, not 403: a supervisor probing ids must not learn which ones name
        # a real report in another unit.
        raise HTTPException(status_code=404, detail="No such report")

    return _stamp_report_rights(db, payload, row)


def _stamp_report_rights(db: Session, payload: dict, row: dict) -> dict:
    """What THIS viewer may do on this report — stamped in one place, because
    the page draws its buttons from it and the endpoints re-check the same
    rules. Two spellings would grow a button that answers 403.

    `canAct` is per TASK, not per page: which of the chain's two rulings is
    available depends on the stage that objection is actually at, and the page
    must never offer the other one.
    """
    role = payload.get("role")
    # Objecting is the LEADER's door first — `_may_dispute_for`, not the
    # late-DAY flow's `_may_request_for`, which answers a different question
    # about a different table.
    row["canDispute"] = _may_dispute_for(db, payload, row)
    sup_ok = (role == "admin") or (
        role == "supervisor" and row.get("managerId") is not None
        and payload.get("role_id") == row["managerId"])
    adm_ok = _may_decide(payload)
    row["canSupervise"] = sup_ok
    row["canDecide"] = adm_ok
    row["viewerRole"] = role
    for t in (row.get("tasks") or []):
        d = t.get("dispute")
        if not d:
            continue
        # Stage 1 is answered against the OBJECTION's own unit, never the
        # report's. They are the same value at filing time, but a sheet report
        # re-resolves `managerId` on every read from a supervisor name the next
        # Refresh may respell — and `_dispute_stage_rights`, which the write
        # re-checks, reads the row. Two sources here is a button that 403s.
        d_sup = adm_ok or (
            role == "supervisor" and d.get("managerId") is not None
            and int(payload.get("role_id") or 0) == int(d["managerId"]))
        d["canAct"] = bool(
            (d.get("status") == leader_dispute.SUPERVISOR and d_sup)
            or (d.get("status") == leader_dispute.ADMIN and adm_ok))
    return row


def _may_dispute_for(db: Session, payload: dict, report: dict) -> bool:
    """Who may OBJECT to an automatic rejection on this report.

    The leader the verdict judged, their unit's brigadir, or an admin — the
    three people the chain is built out of, and nobody else. A "see all" page
    grant deliberately does NOT widen it: it widens reading, never authority.

    The LEADER is the point of the whole flow — they read the verdict on their
    own day report and are the only person who was there — but the brigadir
    keeps the door they already had, because about 18% of leader rows never
    resolve to a profile (`leader-register-unlinked-rows`) and for those
    leaders the brigadir is the only person who can raise the objection at all.
    Where they file it lands is decided by `leader_dispute.entry_stage`, not by
    this predicate: a supervisor's own filing is their uplift.

    Deliberately NOT `_may_request_for`, which answers the same question for
    opening a voided DAY. Two flows that happen to agree today are two flows.
    """
    role = payload.get("role")
    if role == "admin":
        return True
    if role == "supervisor":
        return (report.get("managerId") is not None
                and payload.get("role_id") == report["managerId"])
    if role == "leader":
        lid = report.get("leaderId")
        return bool(lid) and int(lid) in set(
            identity.viewer_leader_profile_ids(db, payload) or [])
    return False


def _dispute_stage_rights(payload: dict, d: LeaderAiDispute) -> tuple[bool, bool]:
    """(may rule at stage 1, may rule at stage 2) for this caller on this row.

    Authority is per ROW, not per page: a brigadir owns their own unit's
    objections and nobody else's, and only an admin can put a point back. The
    same shape — and the same reason — as `_lp_stage_rights` next door: a
    supervisor holding the leaders page at scope «all» is served every unit's
    rows, and "you are a brigadir" is not "you are THIS unit's brigadir".
    """
    if payload.get("role") == "admin":
        return True, True
    is_sup = (payload.get("role") == "supervisor"
              and d.manager_id is not None
              and int(payload.get("role_id") or 0) == int(d.manager_id))
    return is_sup, False


@router.post("/leaders/report/{uid}/dispute")
def file_dispute(
    uid: str,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Object to one automatic rejection, with the filer's own account of it.

    A LEADER's objection goes to their unit's brigadir, who reads it and either
    refuses it or makes the case for it to the admins. A SUPERVISOR filing goes
    straight up — their text IS that case. An admin filing one IS the decision,
    the same rule as opening a late day, because it is the same authority
    question. `leader_dispute.entry_stage` owns that placement.

    The task is re-derived from the report the caller can actually read, so
    "is this yours" and "does this rejection exist" are one check.
    """
    reason = str(body.get("reason") or "").strip()
    if len(reason) < 3:
        raise HTTPException(status_code=400, detail="A reason is required")
    if len(reason) > leader_dispute.REASON_MAX:
        raise HTTPException(status_code=400, detail="Reason is too long")
    try:
        task_id = int(body.get("task_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="task_id must be an integer")

    report = leader_reports.day_report(db, uid)
    if report is None or not report_scope_ok(db, payload, {
        "manager_id": report["managerId"], "leader_id": report["leaderId"],
        "leader": report["leader"],
    }):
        raise HTTPException(status_code=404, detail="No such report")
    if not _may_dispute_for(db, payload, report):
        raise HTTPException(status_code=403, detail="Not yours to dispute")

    task = next((t for t in report["tasks"] if t["id"] == task_id), None)
    if task is None:
        raise HTTPException(status_code=404, detail="No such task on this report")
    if not task["ai_rejected"]:
        raise HTTPException(status_code=409, detail="This task was not rejected")
    live = task.get("dispute")
    if live and live["status"] in leader_dispute.OPEN_STATES:
        raise HTTPException(status_code=409, detail="Already awaiting a decision")

    ref = leader_reports.ref_of_task(db, uid, task_id)
    rev = db.query(LeaderAiReview).filter_by(ref=ref).first() if ref else None
    if rev is None:
        raise HTTPException(status_code=404, detail="No verdict to dispute")

    role = payload.get("role")
    who = payload.get("full_name") or ""
    tid = int(payload["sub"]) if str(payload.get("sub") or "").isdigit() else None
    d = leader_dispute.create(
        db, ref=ref, review_id=rev.id, report=report, task_id=task_id,
        reason=reason, role=role,
        profile=identity.viewer_profile_key(db, payload),
        actor_name=who, actor_telegram=tid)
    db.commit()

    if role == "admin":
        # An admin asking themselves for permission is not a flow. Filing IS
        # the decision — the same rule as opening a late day.
        leader_dispute.decide_admin(db, d, action="approved", note=None,
                                    actor_name=who, actor_telegram=tid)
        db.commit()
        _report_after_ruling(db, d)
    else:
        _dispute_announce(db, d)
    logger.info("leader-dispute: %s filed by %s (%s) on %s task %s (%s)",
                d.status, who, role, uid, task_id, reason[:80])
    # An admin's own filing IS the ruling, so the row says which of the two
    # happened — a stage and an outcome are different events here.
    action_log.enrich(
        target_kind="dispute", target_id=d.id, target_name=d.leader_name,
        unit_id=d.manager_id, day=d.date, reason=reason,
        details=[("leader", d.leader_name), ("task", task_id),
                 ("filed_by", role), ("status", d.status), ("report", uid)],
    )
    return {"ok": True, "status": d.status,
            "report": _stamp_report_rights(db, payload,
                                           leader_reports.day_report(db, uid))}


def _dispute_announce(db: Session, d: LeaderAiDispute) -> None:
    """Put a freshly filed objection in front of whoever has to rule on it.

    Never fatal: a Telegram outage must not roll back a filing the leader was
    already told went through, and re-pressing would then be refused as a live
    objection while nobody had ever been told about the first one.
    """
    try:
        if d.status == leader_dispute.SUPERVISOR:
            from app.telegram_bot import _ad_send_to_supervisor
            _ad_send_to_supervisor(db, d)
            leader_dispute.notify_filed(db, d)
            db.commit()
        else:
            from app.approvals import send_leader_dispute_to_admins
            send_leader_dispute_to_admins(db, d)
    except Exception:
        logger.exception("leader-dispute: card failed for %s", d.id)


def _settle_dispute(db: Session, d: LeaderAiDispute, status: str,
                    by_name: str | None, by_telegram: int | None,
                    note: str | None = None) -> bool:
    """An ADMIN's ruling on one objection — the stage-2 core, kept under its
    old name because the inline Telegram card in `approvals.py` runs it and
    cards already sitting in admins' chats must go on working.

    `leader_dispute.decide_admin` is the definition; this only absorbs the
    "already settled" case, which a stale card is exactly how you reach.
    """
    try:
        leader_dispute.decide_admin(db, d, action=status, note=note,
                                    actor_name=by_name, actor_telegram=by_telegram)
    except leader_dispute.Refused:
        return False
    db.commit()
    return True


@router.post("/leaders/disputes/{dispute_id}/decide")
def decide_dispute(
    dispute_id: int,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Rule on one objection. WHICH ruling is decided by the row's own stage.

    One endpoint rather than two, for the same reason `decide_late_proof` is
    one: the stage is a property of the row, so a caller naming the stage could
    name the wrong one — and the answer to "which decision is available here"
    must not be able to differ between the page and the server.

    `status` is accepted as an alias for `action` so a tab still open on the
    one-stage bundle can settle an uplifted row it is looking at, which is the
    only thing that bundle could ever do here anyway.
    """
    d = db.query(LeaderAiDispute).filter_by(id=dispute_id).first()
    if d is None:
        raise HTTPException(status_code=404, detail="No such dispute")
    action = str(body.get("action") or body.get("status") or "").strip()
    note = str(body.get("note") or "").strip()
    sup_ok, adm_ok = _dispute_stage_rights(payload, d)
    who = payload.get("full_name") or "—"
    tid = int(payload["sub"]) if str(payload.get("sub") or "").isdigit() else None
    was = d.status

    if d.status == leader_dispute.SUPERVISOR:
        if not sup_ok:
            raise HTTPException(status_code=403, detail="Not yours to decide")
        if action not in leader_dispute.SUP_ACTIONS:
            raise HTTPException(status_code=400,
                                detail="action must be rejected or uplifted")
        if action == "uplifted" and not note:
            raise HTTPException(status_code=400,
                                detail="A comment is required to pass this up")
        try:
            leader_dispute.decide_supervisor(
                db, d, action=action, note=note, actor_name=who,
                actor_telegram=tid)
        except leader_dispute.Refused as e:
            raise HTTPException(status_code=409, detail=str(e))
        db.commit()
        stage = "supervisor"
    elif d.status == leader_dispute.ADMIN:
        if not adm_ok:
            raise HTTPException(status_code=403, detail="Admins only")
        if action not in leader_dispute.ADM_ACTIONS:
            raise HTTPException(status_code=400,
                                detail="action must be approved or rejected")
        try:
            leader_dispute.decide_admin(
                db, d, action=action, note=note or None, actor_name=who,
                actor_telegram=tid)
        except leader_dispute.Refused as e:
            raise HTTPException(status_code=409, detail=str(e))
        db.commit()
        stage = "admin"
    else:
        raise HTTPException(status_code=409, detail="Already decided")

    # The words the ruling answered travel with it: a decision recorded without
    # the objection cannot be read back later.
    action_log.enrich(
        target_kind="dispute", target_id=d.id, target_name=d.leader_name,
        unit_id=d.manager_id, day=d.date, reason=note or d.reason,
        details=[("leader", d.leader_name), ("task", d.task_id)],
        changes=[("status", was, d.status)],
    )
    _dispute_after(db, d, stage=stage,
                   uplifted=(action == "uplifted"))
    return {"ok": True, "status": d.status,
            "reported": _report_after_ruling(db, d)}


def _dispute_after(db: Session, d: LeaderAiDispute, *, stage: str,
                   uplifted: bool) -> None:
    """Everything a ruling owes the outside world, and none of it fatal.

    A DM that will not send must never roll back a decision somebody already
    made — re-pressing would then find the row already decided and tell nobody
    at all, which is strictly worse than a missing message.
    """
    try:
        from app.approvals import edit_admin_notices
        from app.telegram_bot import _ad_retire, _ad_send_to_admins
        if stage == "supervisor":
            # The KEY, never a rendered string: the card sits in several chats
            # and each reader has their own language. `d.status` is a storage
            # word ("admin") — an uplift reads as «passed up» to a person.
            _ad_retire(db, d, "ad_done_uplifted" if uplifted else "ad_done_rejected")
            if uplifted:
                _ad_send_to_admins(db, d)
        else:
            # Retire the inline cards sitting in every admin's DM, so a decided
            # objection cannot be decided a second time from a stale message.
            edit_admin_notices("leader_dispute", d.id, d.status, d.decided_by_name)
    except Exception:
        logger.warning("leader-dispute: card retire/forward failed", exc_info=True)
    try:
        leader_dispute.notify_decided(db, d, stage=stage)
        db.commit()
    except Exception:
        logger.warning("leader-dispute: decision notice failed", exc_info=True)


@router.post("/leaders/disputes/{dispute_id}/undo")
def undo_dispute(
    dispute_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Take a ruling back — the way out of a decision made in error.

    Deciding is one tap, an ADMIN's own filing IS its approval (see
    `file_dispute`), and `decide` refuses anything already settled, so the
    wrong outcome is one mis-tap away with no route back. It reaches a
    brigadir's stage-1 refusal too: that is final for the brigadir, not for the
    platform, and an admin is who fixes a leader's account of the shift being
    ended before it was read.

    The undo reverses exactly the two writes the ruling made. The verdict goes
    back to `open` — nobody has ruled, which in the automatic regime means the
    flag costs its weight again, the state the day was in before anyone touched
    it. The row is `cancelled` rather than deleted, because a score that moved
    twice has to stay explainable, and because only a LIVE row blocks a
    re-filing: a cancelled one lets the leader object again with a better
    account.

    The day re-scores and re-DMs itself through the same `resend_if_changed`
    every other correction uses, and whoever was told the outcome is told it
    was reversed.
    """
    if not _may_decide(payload):
        raise HTTPException(status_code=403, detail="Admins only")
    d = db.query(LeaderAiDispute).filter_by(id=dispute_id).first()
    if d is None:
        raise HTTPException(status_code=404, detail="No such dispute")
    if d.status in leader_dispute.OPEN_STATES:
        raise HTTPException(status_code=409, detail="Not decided yet")
    if d.status == leader_dispute.CANCELLED:
        raise HTTPException(status_code=409, detail="Already undone")

    who = payload.get("full_name") or ""
    tid = int(payload["sub"]) if str(payload.get("sub") or "").isdigit() else None
    try:
        was = leader_dispute.undo(db, d, actor_name=who, actor_telegram=tid)
    except leader_dispute.Refused as e:
        raise HTTPException(status_code=409, detail=str(e))
    db.commit()

    # The score moved twice, so both moves stay on the record: WHAT the ruling
    # was is the whole content of an undo.
    action_log.enrich(
        target_kind="dispute", target_id=d.id, target_name=d.leader_name,
        unit_id=d.manager_id, day=d.date, reason=d.reason,
        details=[("leader", d.leader_name), ("task", d.task_id)],
        changes=[("status", was, "cancelled"), ("verdict", was, "open")],
    )
    try:
        leader_dispute.notify_decided(db, d, stage="admin")
        db.commit()
    except Exception:
        logger.warning("leader-dispute: undo notice failed", exc_info=True)
    logger.info("leader-dispute: %s undone (was %s) by %s on %s task %s",
                d.id, was, who, d.date, d.task_id)
    return {"ok": True, "status": d.status, "was": was,
            "reported": _report_after_ruling(db, d)}


def supersede_dispute(db: Session, ref: str, resolution: str | None,
                      by: str | None = None) -> bool:
    """Kept under its old name for `routers/leader_ai`, which imports it from
    here. `leader_dispute.supersede` is the definition."""
    return leader_dispute.supersede(db, ref, resolution, by)


def _report_after_ruling(db: Session, d: LeaderAiDispute) -> bool:
    """A ruling that MOVED the day's score re-sends its report; one that did
    not stays silent. `resend_if_changed` owns that comparison — it is the same
    rule the drain uses, so a correction cannot mean two different things."""
    uid = leader_reports.uid_of_ref(db, d.ref)
    return leader_reports.resend_if_changed(db, uid) if uid else False


# How much of the objection queue one read hands over. Cancelled and decided
# rows accumulate forever while the work — `pending` — never does, so the cap
# bounds the HISTORY, not the queue. Newest first, so what it drops is the
# oldest settled row and never a decision anybody is waiting on.
DISPUTE_CAP = 300


@router.get("/leaders/disputes")
def list_disputes(
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """The «Norozliklar» queue — every objection to an automatic rejection,
    newest first, with the verdict it argues against carried beside it.

    The ruling used to be reachable from exactly two places: an inline Telegram
    card that scrolls out of the chat, and the day report of the one leader it
    belongs to. An admin who missed the card had no list to work from and no
    way to find the report holding the objection. This is that list.

    It carries the AI's flags, its prose and the window it measured against,
    because a decision made without them is a decision made by opening thirteen
    reports to find the one in question — and every one of those facts comes
    off the SAME helpers the day report reads, never re-derived here. Names are
    the REGISTER's names (`_project`), so the page's supervisor and leader
    filters reach these rows exactly as they reach the dashboard's.

    Scoped like every other read on this page: an admin sees all, a brigadir
    their own unit's. Reading is not deciding — `canDecide` is the admin's
    alone and every write re-checks it.
    """
    role = payload.get("role")
    can_decide = _may_decide(payload)
    empty = {"items": [], "canDecide": False, "canSupervise": False,
             "canApprove": False, "todo": 0}
    q = db.query(LeaderAiDispute)
    if status:
        q = q.filter(LeaderAiDispute.status == status)
    if not (can_decide or role in ("shift-manager", "top-manager")
            or page_scope_is_all(db, payload, "leaders")):
        if role == "supervisor":
            q = q.filter(LeaderAiDispute.manager_id == payload.get("role_id"))
        elif role == "leader":
            # A leader reads their OWN objections. The flow asks them to
            # explain themselves, so where the explanation got to has to be
            # visible to them — the same rule the late-proof queue states.
            own = identity.viewer_leader_profile_ids(db, payload)
            if not own:
                return empty
            q = q.filter(LeaderAiDispute.leader_id.in_(own))
        else:
            return empty
    rows = q.order_by(LeaderAiDispute.id.desc()).limit(DISPUTE_CAP).all()
    uids = leader_reports.uids_of_refs(db, [r.ref for r in rows])

    # The verdict under objection. Local import: routers/leader_ai imports this
    # module back for `supersede_dispute`.
    from app.routers.leader_ai import (
        _as_verdict, _date_check, _date_plus, _project, _task_cfg, _time_check,
        _window,
    )
    revs = (db.query(LeaderAiReview)
            .filter(LeaderAiReview.ref.in_({d.ref for d in rows})).all()) if rows else []
    # Loaded off `rows`, not off `revs`: a verdict «stop and clear» deleted
    # leaves its dispute standing, and that card still has to name its task.
    cfg = _task_cfg(db, revs) if rows else None
    verdicts = {r.ref: _as_verdict(r, _window(cfg, r), _date_check(cfg, r),
                                   _time_check(cfg, r), _date_plus(cfg, r))
                for r in revs}
    shifts = {r.ref: r.shift for r in revs}
    proj = _project(db, revs)

    # Task names in all four languages — the card is read by the same people in
    # the same four languages as the report behind it, and a unit that renamed
    # a task must not read its old wording here.
    names = leader_reports.names_for_pairs(
        db, {(d.manager_id, d.leader_id) for d in rows}, (cfg[0] if cfg else {}))
    mgr_shift = ({m.id: m.shift for m in db.query(Manager).all()} if rows else {})

    # `_project` fills an unresolvable name with an em dash rather than a null,
    # so read it as blank here — otherwise the placeholder wins over the name
    # the dispute row stamped when it was filed.
    def _named(v):
        v = (v or "").strip()
        return v if v and v != "\u2014" else None

    items = []
    todo = 0
    for d in rows:
        who = proj.get(d.ref) or {}
        sup_ok, adm_ok = _dispute_stage_rights(payload, d)
        # Whether THIS caller may rule on THIS row, by the same predicate the
        # write re-checks. Deriving it from page-level flags is a different
        # question: a supervisor holding the page at scope «all» is served
        # every unit's rows, and every foreign card would grow buttons that
        # answer 403.
        can_act = ((d.status == leader_dispute.SUPERVISOR and sup_ok)
                   or (d.status == leader_dispute.ADMIN and adm_ok))
        todo += 1 if can_act else 0
        items.append({
            "id": d.id, "status": d.status, "date": d.date,
            "canAct": bool(can_act),
            "taskId": d.task_id,
            "taskName": (names.get((d.manager_id, d.leader_id)) or {}).get(d.task_id),
            # The register's spelling first; the row's own stamp is the floor
            # for a verdict whose source row has since been deleted.
            "leader": _named(who.get("leader")) or d.leader_name,
            "leaderId": d.leader_id,
            "supervisor": _named(who.get("supervisor")),
            "managerId": d.manager_id,
            "shift": shifts.get(d.ref) or mgr_shift.get(d.manager_id),
            "reason": d.reason,
            "by": d.requested_by_name,
            # WHOSE words the first note is. A row filed by a brigadir — the
            # only route open to a leader who resolves to no profile — must not
            # be printed as the leader's own account of their shift.
            "byRole": (str(d.requested_by_profile or "").split(":")[0] or None),
            "at": d.requested_at.isoformat() if d.requested_at else None,
            # None when the note merely echoes the text the row was FILED with
            # — see `leader_dispute.sup_case`. One sentence must never appear
            # twice as two different people's accounts.
            "sup": {
                "action": d.sup_action, "note": leader_dispute.sup_case(d),
                "by": d.sup_by_name,
                "at": d.sup_at.isoformat() if d.sup_at else None,
            } if d.sup_action else None,
            "decidedBy": d.decided_by_name,
            "decidedAt": d.decided_at.isoformat() if d.decided_at else None,
            "note": d.decision_note,
            "uid": uids.get(d.ref),
            "verdict": verdicts.get(d.ref),
        })
    return {
        "canDecide": can_decide,
        # What the two stages look like to this caller at all — the row's own
        # `canAct` is the authority; these only decide whether the queue
        # explains itself as a place you rule or a place you watch.
        "canSupervise": can_decide or role == "supervisor",
        "canApprove": can_decide,
        # What the tab badge counts: the rows waiting on THIS caller. A brigadir
        # never carries a badge for an uplifted row only an admin can settle,
        # and an admin never carries one for a row still sitting with a
        # brigadir — a badge counting work you cannot do never clears.
        "todo": todo,
        "items": items,
    }


@router.post("/leaders/task-override")
def set_task_override(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    """Record — or clear — an admin's done/not-done ruling on one task of one
    report, from the detail modal. `done: null` deletes the override, which
    restores the leader's own answer (and any AI ruling) on the next read.

    Idempotent per (uid, task): re-ruling overwrites the previous row and
    re-stamps the actor, so a correction is a normal action, not a DB edit.
    """
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admins only")
    uid = str(body.get("uid") or "").strip()
    date = str(body.get("date") or "")[:10]
    try:
        task_id = int(body.get("task_id"))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="task_id must be an integer")
    if not uid or not date:
        raise HTTPException(status_code=400, detail="uid and date are required")
    done = body.get("done")
    if done is not None and not isinstance(done, bool):
        raise HTTPException(status_code=400, detail="done must be true, false or null")

    who = (payload.get("full_name") or payload.get("username")
           or str(payload.get("sub") or "admin"))[:160]
    row = db.query(LeaderTaskOverride).filter_by(uid=uid, task_id=task_id).first()

    leader = str(body.get("leader") or "").strip()[:160] or None
    if done is None:
        was = row.done if row is not None else None
        if row is not None:
            db.delete(row)
            db.commit()
        logger.info("leader-override: %s cleared %s task %s", who, uid, task_id)
        action_log.enrich(
            target_kind="task", target_id=task_id, target_name=leader,
            day=date,
            details=([("leader", leader)] if leader else []) + [
                ("task", task_id), ("report", uid), ("override", "cleared")],
            changes=([("done", was, None)] if was is not None else None),
        )
        return {"ok": True, "override": None}

    was = row.done if row is not None else None
    if row is None:
        row = LeaderTaskOverride(uid=uid, task_id=task_id)
        db.add(row)
    row.date = date
    row.leader = leader
    row.done = done
    row.set_by = who
    row.set_at = datetime.now(timezone.utc)
    db.commit()
    logger.info("leader-override: %s ruled task %s on %s -> %s",
                who, task_id, uid, "done" if done else "not done")
    # An admin overruling the leader's own answer is the one write here that
    # changes a score by hand, so the previous ruling rides with the new one.
    action_log.enrich(
        target_kind="task", target_id=task_id, target_name=leader, day=date,
        details=([("leader", leader)] if leader else []) + [
            ("task", task_id), ("report", uid)],
        changes=[("done", was, done)],
    )
    return {"ok": True, "override": {"done": row.done, "by": row.set_by,
                                     "at": row.set_at.isoformat()}}


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
        # Per shift, because they are different windows and the tab now holds
        # both: a shift-2 supervisor reading "08:00–20:00" would be told their
        # night was late against hours it was never meant to be filed in.
        "windows": {
            str(sh): {"from": WINDOW_FROM[sh],
                      "open": opens.strftime("%H:%M"),
                      "close": closes.strftime("%H:%M"),
                      "grace_min": int(CLOSE_GRACE.total_seconds() // 60),
                      "overnight": overnight}
            for sh, (opens, closes, overnight) in WINDOW.items()
        },
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

    # Same rule as a dispute: an admin filing one has approved it, and the row
    # must not read as though a decision were still outstanding.
    action_log.enrich(
        target_kind="day", target_id=key, target_name=it["leader"],
        unit_id=it["manager_id"], unit_name=it.get("unit"), day=it["date"],
        reason=reason,
        details=[("leader", it["leader"]), ("status", req.status)],
    )

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
    was = req.status
    changed = decide_late_request(db, req, status, payload.get("full_name"), tid)
    # `changed` False = a second admin tapped the same card; the ruling stands
    # and the register says the request was already in that state.
    action_log.enrich(
        target_kind="day", target_id=req.id, target_name=req.leader_name,
        unit_id=req.manager_id, day=req.date, reason=req.reason,
        details=[("leader", req.leader_name), ("status", req.status)]
                + ([] if changed else [("note", "no_change")]),
        changes=[("status", was, status)] if changed else None,
    )
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

    # Read off the row before it goes: after the delete these attributes have
    # no row behind them.
    who_for, day_for = req.leader_name, req.date
    unit_for, why = req.manager_id, req.reason
    db.delete(req)
    db.commit()
    action_log.enrich(
        target_kind="day", target_id=req_id, target_name=who_for,
        unit_id=unit_for, day=day_for, reason=why,
        details=[("leader", who_for), ("status", "cancelled")],
    )
    try:
        from app.approvals import edit_admin_notices
        edit_admin_notices("leader_late", req_id, "cancelled", payload.get("full_name"))
    except Exception:
        logger.exception("late-open: could not clear admin notices for %s", req_id)
    return {"ok": True}


# ── Sheet proof photos ────────────────────────────────────────────────────────
# The Fillout form uploads a leader's proof photo to Google Drive and writes the
# SHARE url into the sheet cell. That url is an HTML viewer page, not an image —
# a spreadsheet renders it because Sheets resolves the file itself, but a browser
# <img src> pointed at it loads markup and fires onerror. On top of that the app's
# CSP is img-src 'self' data: blob:, so a foreign image host would be blocked even
# if the url did serve bytes.
#
# So the page fetches proof photos THROUGH here, exactly as bot photos already go
# through /api/leader-tasks/media/…: one origin, no CSP hole, and the Drive-share
# → direct-content rewrite lives in one place (services/leader_ai.fetch_sheet_image,
# which the AI proof reviewer has been reading these same photos with all along).

_PHOTO_HOSTS = {"drive.google.com", "docs.google.com",
                "drive.usercontent.google.com"}


def _photo_allowed(db: Session, url: str) -> bool:
    """The url arrives from the client, so it has to be vouched for — otherwise
    the endpoint is a general-purpose fetcher for anyone with page access
    (fetch_sheet_image blocks internal addresses, not the public web).

    Two ways to vouch. The cheap one is the host: Google's own file hosts, which
    is what the Drive-backed form writes today. Anything else has to be a string
    the SHEET itself put in a checklist row — so if the form is ever repointed at
    another upload host, its photos keep working without a code change here,
    while an arbitrary url still gets nothing."""
    host = (urlparse(url).hostname or "").lower()
    if host in _PHOTO_HOSTS or host.endswith(".googleusercontent.com"):
        return True
    if not url.startswith(("http://", "https://")):
        return False
    return db.query(LeaderChecklist.id).filter(
        cast(LeaderChecklist.tasks, Text).contains(url, autoescape=True)
    ).first() is not None


# Every /api response is Cache-Control: no-store (NoStoreAPIMiddleware), so the
# browser re-asks on each open of the detail modal — and a 20-photo day would be
# 20 fresh Drive round-trips every time. A small server-side TTL cache absorbs
# that: reopening a report is instant and Google sees one fetch per photo.
_PHOTO_TTL = 900.0                    # seconds
_PHOTO_MAX = 48                       # entries
_PHOTO_MAX_BYTES = 4 * 1024 * 1024    # don't cache anything oversized
_photo_cache: dict[str, tuple[float, bytes, str]] = {}
_photo_lock = threading.Lock()


def _photo_cached(url: str) -> tuple[bytes, str] | None:
    now = monotonic()
    with _photo_lock:
        hit = _photo_cache.get(url)
        if not hit:
            return None
        stamp, data, ctype = hit
        if now - stamp > _PHOTO_TTL:
            _photo_cache.pop(url, None)
            return None
        return data, ctype


def _photo_store(url: str, data: bytes, ctype: str) -> None:
    if len(data) > _PHOTO_MAX_BYTES:
        return
    now = monotonic()
    with _photo_lock:
        # drop what expired, then the oldest, so the dict can't grow unbounded
        for k in [k for k, (s, _, _) in _photo_cache.items() if now - s > _PHOTO_TTL]:
            _photo_cache.pop(k, None)
        while len(_photo_cache) >= _PHOTO_MAX:
            _photo_cache.pop(min(_photo_cache, key=lambda k: _photo_cache[k][0]), None)
        _photo_cache[url] = (now, data, ctype)


def photo_scope_ok(db: Session, payload: dict, uid: str | None,
                   in_report) -> bool:
    """May this viewer fetch a proof photo they reached through report `uid`?

    The day report is auth-only by design — the brigadir it is written for
    often has no `leaders` page grant — but its photos hung off endpoints that
    were page-gated, so the score, the verdicts and the windows loaded while
    every thumbnail 403'd. A report that says "the proof does not show the work"
    and then cannot show the proof is an accusation with the evidence removed.

    So a photo is authorised the way the report is: by the ROW it belongs to.
    `in_report(row)` asks the caller's own question — does this report actually
    contain the photo being requested — because scope alone would otherwise let
    anyone name a report they can read and pull any photo on the platform
    through it.
    """
    if not uid:
        return False
    row = build_report_row(db, uid)
    if row is None or not report_scope_ok(db, payload, row):
        return False
    return bool(in_report(row))


@router.get("/leaders/photo")
def get_leader_photo(
    url: str = Query(..., max_length=2000),
    uid: str | None = Query(None, max_length=200),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Stream one sheet proof photo, rewritten from its Drive share url to the
    direct-content host and served from this origin.

    Two doors, because two surfaces show these photos. The register's detail
    modal is behind the `leaders` page, as it always was. The day report is
    auth-only and passes its `uid`, which authorises the photo against that
    report's own row scope — see `photo_scope_ok`.
    """
    if not page_allowed(db, payload, "leaders") and not photo_scope_ok(
        db, payload, uid,
        lambda row: any(url in (t.get("photo") or "")
                        for t in (row.get("tasks") or [])),
    ):
        raise HTTPException(status_code=404, detail="Photo not found")
    if not _photo_allowed(db, url):
        raise HTTPException(status_code=400, detail="Unsupported photo host")

    hit = _photo_cached(url)
    if hit is None:
        from app.services.leader_ai import fetch_sheet_image
        try:
            data, ctype = fetch_sheet_image(url)
        except Exception as exc:
            # 502, not 500: the failure is upstream (Drive permissions, a deleted
            # file), and the page's retry button is the right answer to it.
            logger.warning("leaders: proof photo unreachable (%s): %s", url, exc)
            raise HTTPException(status_code=502, detail=f"Photo unreachable: {exc}")
        _photo_store(url, data, ctype)
    else:
        data, ctype = hit
    return Response(content=data, media_type=ctype)


# ── taking a leader-day OUT of the results ───────────────────────────────────

_EXCL_CAP = 400          # one press, one batch — a bulk bar, not a migration


@router.post("/leaders/exclusions")
def set_exclusions(
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Exclude leader-days from the results, or put them back.

    **Admin-only, and deliberately not grantable** — no capability names it, so
    `page.view.leaders` at "all" does not reach it either. It moves the score of
    a leader AND of their brigadir, and it is the one control on the platform
    that can make a bad night cost nobody anything; that authority is the same
    one that opens a late day, and it is not delegated for the same reason.

    The candidates come from `/api/leaders` — the register's own projection for
    a day that was filed, and the leader roster served beside it for a day that
    was not. The second is not a loophole in the first: the page scores over the
    CALENDAR days of a period, so an unfiled day already costs its leader a full
    slot of the denominator, and it was the only day an operator could not
    forgive. This endpoint has never needed the row to exist — the key is the
    leader-DAY — and `leader_exclusions.orphan_rows` gives the decision a
    register row from the next read on.

    `excluded: false` lifts. A reason is mandatory to exclude and pointless to
    lift, because the reason answers "why does this day not count" and a day
    that counts needs no answer.
    """
    if payload.get("role") != "admin":
        raise HTTPException(403, "Faqat administrator")

    items = body.get("items") or []
    if not isinstance(items, list) or not items:
        raise HTTPException(400, "Kun tanlanmagan")
    if len(items) > _EXCL_CAP:
        raise HTTPException(400, f"Bir vaqtda {_EXCL_CAP} tadan ko'p kun bo'lmaydi")

    on = bool(body.get("excluded", True))
    reason = str(body.get("reason") or "").strip()
    if on and not reason:
        raise HTTPException(400, "Sabab majburiy")
    notify = bool(body.get("notify", True))
    who = payload.get("full_name") or "admin"

    done, told, dropped = 0, 0, 0
    seen: set[str] = set()
    for raw in items:
        if not isinstance(raw, dict):
            continue
        date = str(raw.get("date") or "")[:10]
        if len(date) != 10 or date[4] != "-" or date[7] != "-":
            continue
        lid = raw.get("leader_id")
        lid = int(lid) if str(lid or "").isdigit() else None
        name = str(raw.get("leader") or "") or None
        if not lid and not name:
            continue                       # nothing to key the decision by
        k = leader_exclusions.key(lid, name, date)
        if k in seen:
            continue                       # the same day sent twice in one batch
        seen.add(k)
        score = raw.get("score")
        score = float(score) if isinstance(score, (int, float)) else None
        mgr = raw.get("manager_id")
        mgr = int(mgr) if str(mgr or "").isdigit() else None

        if on:
            row, created = leader_exclusions.exclude(
                db, leader_id=lid, leader_name=name, date=date,
                manager_id=mgr, reason=reason, score=score, actor=who)
            if not created:
                continue                   # already out; the reason was updated
            # Whatever was queued before the decision would be spent on Gemini
            # and then displayed on a day that counts nowhere.
            dropped += leader_exclusions.drop_pending_reviews(db, lid, date)
        else:
            row = leader_exclusions.lift(db, leader_id=lid, leader_name=name,
                                         date=date)
            if row is None:
                continue                   # already counting
            score = score if score is not None else row.score_at
            mgr = mgr if mgr is not None else row.manager_id
        done += 1
        db.commit()

        if notify:
            try:
                told += leader_reports.notify_excluded(
                    db, leader_id=lid, leader_name=name, manager_id=mgr,
                    date=date, score=score, reason=reason, actor=who,
                    restored=not on)
                db.commit()
            except Exception:
                # A DM failure must never roll back the decision: the exclusion
                # is what the register reads, and re-pressing the button would
                # find the day already excluded and tell nobody at all.
                logger.exception("leader-exclusion: could not notify %s on %s",
                                 lid or name, date)
                db.rollback()

    # A bulk decision has no single target, so the row identifies the BATCH and
    # counts what it did. Names are deliberately absent: the batch can be 400
    # leader-days and the register rides in every db-dump, where anything
    # unbounded belongs as a count (the log's own rule).
    action_log.enrich(
        target_kind="day", target_name=f"{done} leader-day(s)",
        reason=reason or None,
        details=[("action", "excluded" if on else "restored"),
                 ("days", done), ("requested", len(seen)),
                 ("notified", told), ("reviews_dropped", dropped)],
    )
    logger.info("leader-exclusion: %s %s leader-day(s) by %s — %s notified, "
                "%s queued review(s) dropped",
                "excluded" if on else "restored", done, who, told, dropped)
    return {"ok": True, "changed": done, "notified": told,
            "reviewsDropped": dropped}


# ── Late proofs: the two-stage queue ─────────────────────────────────────────
# The dashboard half of services/leader_late_proof.py. The bot card and this
# page are two views of ONE row and one rule — every write here goes through
# the same `decide_supervisor` / `decide_admin` the Telegram buttons call, so a
# ruling made in a workshop and a ruling made at a desk cannot end differently.

LATE_PROOF_CAP = 400


def _lp_stage_rights(db: Session, payload: dict, row) -> tuple[bool, bool]:
    """(may rule at stage 1, may rule at stage 2) for this caller on this row.

    Authority is per ROW, not per page: a brigadir owns their own unit's late
    proofs and nobody else's, and only an admin can put a point back. A "see
    all" page grant widens READING and never this — the same rule the late-day
    flow already states.
    """
    if payload.get("role") == "admin":
        return True, True
    is_sup = (payload.get("role") == "supervisor"
              and row.manager_id is not None
              and int(payload.get("role_id") or 0) == int(row.manager_id))
    return is_sup, False


def _lp_item(db: Session, row, names: dict, mgr_names: dict,
             can_act: bool = False) -> dict:
    media = leader_late_proof.photos(db, row.id)
    return {
        "id": row.id,
        "status": row.status,
        # Whether THIS caller may rule on THIS row, decided by the same
        # `_lp_stage_rights` the write re-checks. The page used to derive it
        # from two page-level flags, which is a different question: a
        # supervisor holding the leaders page at scope «all» is served every
        # unit's rows, and "you are a brigadir" is not "you are THIS unit's
        # brigadir". Every foreign card then grew buttons that answered 403.
        "canAct": bool(can_act),
        "date": row.date,
        "shift": row.shift,
        "taskId": row.task_id,
        "taskName": (names.get((row.manager_id, row.leader_id)) or {}).get(row.task_id),
        "leader": row.leader_name,
        "leaderId": row.leader_id,
        "supervisor": mgr_names.get(row.manager_id),
        "managerId": row.manager_id,
        "deadline": row.deadline,
        "reason": row.reason,
        "uid": row.uid,
        "at": row.created_at.isoformat() if row.created_at else None,
        # WHICH DOOR each photo came through. A stamped in-app shot and a file
        # the leader picked must not read identically to the reviewer, or the
        # stamp becomes decoration — the one way offering both doors could
        # weaken the camera. NULL predates the camera door and reads as upload.
        "photos": [{"id": m.id, "pos": m.pos,
                    "source": m.source or "upload", "stamp": m.stamp,
                    "at": m.captured_at.isoformat() if m.captured_at else None}
                   for m in media],
        "sup": {
            "action": row.sup_action, "note": row.sup_note,
            "by": row.sup_by_name,
            "at": row.sup_at.isoformat() if row.sup_at else None,
        } if row.sup_action else None,
        "adm": {
            "action": row.adm_action, "note": row.adm_note,
            "by": row.adm_by_name,
            "at": row.adm_at.isoformat() if row.adm_at else None,
        } if row.adm_action else None,
    }


@router.get("/leaders/late-proofs")
def list_late_proofs(
    status: str | None = Query(None),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """The «Kechikkan isbotlar» queue — every proof filed after its deadline.

    Scoped like every other read on this page: an admin sees all, a brigadir
    their own unit's, a leader their own. Reading is not ruling — the two
    `can*` flags say whose turn it is, and every write re-checks them per row.

    `todo` is what the tab badge counts: the rows waiting on THIS caller. A
    brigadir never carries a badge for an uplifted row they cannot decide, and
    an admin never carries one for a row still sitting with a brigadir.
    """
    role = payload.get("role")
    is_admin = role == "admin"
    q = db.query(LeaderLateProof)
    if status:
        q = q.filter(LeaderLateProof.status == status)
    if not (is_admin or role in ("shift-manager", "top-manager")
            or page_scope_is_all(db, payload, "leaders")):
        if role == "supervisor":
            q = q.filter(LeaderLateProof.manager_id == payload.get("role_id"))
        elif role == "leader":
            # A leader reads their OWN filings — the whole flow asks them to
            # explain themselves, so the answer has to be visible to them.
            own = identity.viewer_leader_profile_ids(db, payload)
            if not own:
                return {"items": [], "canSupervise": False, "canApprove": False,
                        "todo": 0}
            q = q.filter(LeaderLateProof.leader_id.in_(own))
        else:
            return {"items": [], "canSupervise": False, "canApprove": False,
                    "todo": 0}
    rows = q.order_by(LeaderLateProof.id.desc()).limit(LATE_PROOF_CAP).all()

    names = leader_reports.names_for_pairs(
        db, {(r.manager_id, r.leader_id) for r in rows}, {}) if rows else {}
    mgr_names = {m.id: m.name for m in db.query(Manager).all()} if rows else {}

    todo = 0
    acts = {}
    for r in rows:
        sup_ok, adm_ok = _lp_stage_rights(db, payload, r)
        acts[r.id] = ((r.status == leader_late_proof.SUPERVISOR and sup_ok)
                      or (r.status == leader_late_proof.ADMIN and adm_ok))
        if acts[r.id]:
            todo += 1
    return {
        "items": [_lp_item(db, r, names, mgr_names, acts.get(r.id, False))
                  for r in rows],
        "canSupervise": is_admin or role == "supervisor",
        "canApprove": is_admin,
        "todo": todo,
    }


@router.post("/leaders/late-proofs/{late_id}/decide")
def decide_late_proof(
    late_id: int,
    body: dict = Body(...),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """Rule on one late proof. WHICH ruling is decided by the row's own stage.

    One endpoint rather than two, for the same reason `_settle_dispute` is one
    core: the stage is a property of the row, so a caller naming the stage could
    name the wrong one — and the answer to "which decision is available here"
    must not be able to differ between the page and the server.
    """
    row = db.query(LeaderLateProof).filter_by(id=late_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    action = str(body.get("action") or "").strip()
    note = str(body.get("note") or "").strip()
    sup_ok, adm_ok = _lp_stage_rights(db, payload, row)
    # The house spelling of "who did this" on this page — the same two lines
    # `decide_dispute` uses, so one person is named one way in the register.
    who = payload.get("full_name") or "—"
    tid = int(payload["sub"]) if str(payload.get("sub") or "").isdigit() else None

    if row.status == leader_late_proof.SUPERVISOR:
        if not sup_ok:
            raise HTTPException(status_code=403, detail="Not yours to decide")
        if action not in ("rejected", "uplifted"):
            raise HTTPException(status_code=400,
                                detail="action must be rejected or uplifted")
        if action == "uplifted" and not note:
            raise HTTPException(status_code=400,
                                detail="A comment is required to pass this up")
        try:
            leader_late_proof.decide_supervisor(
                db, row, action=action, note=note, actor_name=who,
                actor_telegram=tid)
        except leader_late_proof.Refused as e:
            raise HTTPException(status_code=409, detail=str(e))
        db.commit()
        action_log.enrich(
            target_kind="task", target_id=row.id, target_name=row.leader_name,
            unit_id=row.manager_id, day=row.date, reason=note or row.reason,
            details=[("leader", row.leader_name), ("task_id", row.task_id)],
            changes=[("status", leader_late_proof.SUPERVISOR, row.status)],
        )
        _lp_after(db, row, stage="supervisor", uplifted=(action == "uplifted"))
        return {"ok": True, "status": row.status}

    if row.status == leader_late_proof.ADMIN:
        if not adm_ok:
            raise HTTPException(status_code=403, detail="Admins only")
        if action not in ("approved", "rejected"):
            raise HTTPException(status_code=400,
                                detail="action must be approved or rejected")
        try:
            leader_late_proof.decide_admin(
                db, row, action=action, note=note or None, actor_name=who,
                actor_telegram=tid)
        except leader_late_proof.Refused as e:
            raise HTTPException(status_code=409, detail=str(e))
        db.commit()
        action_log.enrich(
            target_kind="task", target_id=row.id, target_name=row.leader_name,
            unit_id=row.manager_id, day=row.date, reason=note or row.reason,
            details=[("leader", row.leader_name), ("task_id", row.task_id)],
            changes=[("status", leader_late_proof.ADMIN, row.status)],
        )
        _lp_after(db, row, stage="admin", uplifted=False)
        return {"ok": True, "status": row.status}

    raise HTTPException(status_code=409, detail="Already decided")


def _lp_after(db: Session, row, *, stage: str, uplifted: bool) -> None:
    """Everything a ruling owes the outside world, and none of it fatal.

    A DM that will not send must never roll back a decision somebody already
    made — re-pressing would then find the row already decided and tell nobody
    at all, which is strictly worse than a missing message.
    """
    try:
        from app.telegram_bot import _lp_retire, _lp_send_to_admins
        # The KEY, never a rendered string — the card sits in several chats and
        # each reader has their own language. `row.status` is a storage word
        # ("admin"), not a sentence: an uplift reads as «uplifted» to a person.
        key = ("lp_done_uplifted" if uplifted
               else f"lp_done_{row.status}")
        _lp_retire(db, row, "sup" if stage == "supervisor" else "adm", key)
        if uplifted:
            _lp_send_to_admins(db, row)
    except Exception:
        logger.warning("late-proof card retire/forward failed", exc_info=True)
    try:
        leader_late_proof.notify_decided(db, row, stage=stage)
        db.commit()
    except Exception:
        logger.warning("late-proof leader notice failed", exc_info=True)
    if row.status == leader_late_proof.APPROVED:
        leader_late_proof.rescore(db, row)


@router.get("/leaders/late-proofs/{late_id}/photo/{media_id}")
def late_proof_photo(
    late_id: int,
    media_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_auth),
):
    """One late-proof photo, streamed through the token-hiding proxy.

    Row-scoped like the day report's own photo door, and checked against THIS
    late proof: without the second half a readable queue would become a fetcher
    for any late-proof photo on the platform.
    """
    row = db.query(LeaderLateProof).filter_by(id=late_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Not found")
    role = payload.get("role")
    if role != "admin":
        allowed = (role in ("shift-manager", "top-manager")
                   or page_scope_is_all(db, payload, "leaders")
                   or (role == "supervisor" and row.manager_id is not None
                       and int(payload.get("role_id") or 0) == int(row.manager_id))
                   # The LEADER reads their own. `list_late_proofs` already
                   # serves them the row — the flow asks them to explain
                   # themselves, so the answer has to be visible to them — and
                   # without this every photo id it handed them 403'd, which is
                   # exactly when a leader goes looking for the shot they just
                   # took.
                   #
                   # Fenced on `role == "leader"`, as every other caller of
                   # this helper is. It matches leader profiles by NAME FOLD,
                   # which is unique across the leader roster and across
                   # nothing else — unfenced it would let any authenticated
                   # session whose full name folds the same (a supervisor, a
                   # guest, a worker) read that leader's proofs.
                   or (role == "leader" and row.leader_id is not None
                       and int(row.leader_id) in
                       identity.viewer_leader_profile_ids(db, payload)))
        if not allowed:
            raise HTTPException(status_code=403, detail="Not allowed")
    m = (db.query(LeaderLateProofMedia)
         .filter_by(id=media_id, late_id=late_id).first())
    if m is None:
        raise HTTPException(status_code=404, detail="Not found")
    from app.routers.leader_tasks import _stream_tg_file
    return _stream_tg_file(m.file_id)
