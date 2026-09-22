"""The automatic checklist checks of 20 and 21 September, explained — DMed once.

The operator asked, on 2026-09-22, for a full report of how the three automatic
checks (`services/leader_auto.py`: #1 plan + people, #9 plan % by the hour, #8
concerns) went on their first two days, both shifts: who failed, why — and,
above all, whether a failure was the PLATFORM's doing rather than the leader's.
This platform has no shell, so the answer is a boot job like every other one-off
in `startup.py`.

It READS, and writes nothing but its own flag. For every (leader, date, cell,
auto task) the platform owed a verdict for, it collects:

* the verdict as the ledger (`leader_auto_checks`) recorded it — outcome, code,
  the facts the check was taken on, when it ran, whether the leader was warned;
* the check RE-RUN on today's data through the check's own runners
  (`leader_auto._Ctx` + `_RUNNERS`) — the same code, so «would it pass now» is
  answered by the function that failed them, not by a second spelling of it;
* the TIMELINE behind it, out of the action register (`action_logs`): every
  «Odamlar soni» save and ПЛАН/ФАКТ edit for that unit and date, every SAP upload
  for that date — who, when, and whether the write was refused. The pins are
  REPLAYED from those saves to state what each cell read at the check hour; the
  replay is checked against what is stored now and says so when it cannot be
  trusted;
* the leader's CELL REGISTER, tested for every way a cell can never be answered:
  no SAP code, a unit other than the leader's, a work centre the unit's catalog
  does not carry, a work centre that is not on the «Odamlar soni» tab that day
  (only configured work centres, or ones with planned minutes, are listed —
  `pp_calc.compute_dashboard`), a Cyrillic letter in the code;
* for shift 2, the same questions asked of the NEXT production date, because a
  night's work may sit there (`pp_calc.DUE_DAY_FROM`).

Each failure is then given ONE attribution with the rule that produced it:
«ours» (platform, register, SAP upload timing), «rule» (the data was there, or
the work was done, and the rule still scored 0), «unit» (the leader / brigadir
did not enter it in time), or «undetermined» — and the evidence travels with it,
so any attribution can be re-read and disagreed with.

**Everything is derived NOW.** A figure typed after the report is taken is not
in it, and the register as it stands today is what is tested — a cell fixed on
/cells since the check reads as fixed. The ledger's own facts are what the check
actually saw and are printed beside every re-run.

Delete this module together with `startup.report_auto_checks_sep20_21`,
`startup._auto_check_report_job` and the call in BOTH entrypoints once the files
have landed — a call left behind imports a deleted module at boot, and a failed
boot rolls the deploy back.
"""
from __future__ import annotations

import io
import json
import logging
import time
from collections import Counter, defaultdict
from datetime import date as _date, datetime, timedelta, timezone

import requests
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    ActionLog, Cell, Factory, LeaderAutoCheck, LeaderConcern, LeaderTaskDay,
    LeaderTaskDef, LeaderTaskEntry, Manager, PPManagerSetting, PPProduct,
    PPUpload, PPWorkCenter, RoleProfile,
)
from app.services import (
    cell_lookup, latin_code, leader_auto, leader_cells, leader_exclusions, leader_tasks,
    wc_group, zagruzka_source,
)

log = logging.getLogger(__name__)

TZ = timezone(timedelta(hours=5))            # the plant's wall clock
DATES = ("2026-09-20", "2026-09-21")         # the CHECKLIST days, both shifts

_API = "https://api.telegram.org"
SEND_RETRIES = 3

# Attribution buckets, in the order the report prints them.
OURS, RULE, UNIT, UNDET, NOT_JUDGED, PASSED = (
    "ours", "rule", "unit", "undetermined", "not_judged", "passed")
BUCKET_TEXT = {
    OURS: "OURS — platform, cell register or SAP upload timing",
    RULE: "RULE — the data was there / the work was done, the rule still scored 0",
    UNIT: "UNIT — the leader or brigadir did not enter it in time",
    UNDET: "UNDETERMINED — the evidence cannot decide",
    NOT_JUDGED: "Not judged — no verdict was written",
    PASSED: "Passed",
}

TASK_TEXT = {
    1: "#1 Plan + people (Kunlik plan)",
    9: "#9 Plan % by the hour",
    8: "#8 Concerns",
}

CATEGORY_TEXT = {
    # ours
    "register_no_sap_code": "None of the leader's cells carries a SAP code — the page has nothing to read.",
    "register_codes_not_in_unit": "The leader's work centres are not in their brigadir's catalog, so their page is empty.",
    "register_cell_untypeable": "The only untyped cells are cells nobody could type (no SAP code / another unit / not in the catalog / not on the «Odamlar soni» tab).",
    "register_no_labor_time": "Positions carry a plan but no Трудоемкость, so plan minutes are 0 and #9 reads «no plan».",
    "sap_upload_after_check": "SAP-fed unit: no SAP upload had reached it by the check hour, so there was no plan on the page — the upload's timing, not the leader.",
    "upload_wiped_typed_plan": "The plan had been typed by hand before the hour, and a SAP upload cleared it before the check read the page.",
    "check_error": "The check could not read its data (platform fault) and recorded the task as not done.",
    "check_contradiction": "The action log shows the data on the page before the hour, yet the check failed it — a check fault.",
    "no_verdict": "The hour passed and no verdict was ever written for an open checklist — the task stays unanswered.",
    "closed_unchecked": "The task was closed as not done under the automatic regime without any automatic verdict (e.g. the day closed while the check was still retrying).",
    # rule
    "started_late_data_complete": "Plan and people were on the page before the hour; the leader only opened the checklist later, and that alone scored 0.",
    "fact_arrives_after_hour": "No ФАКТ was on the page at the hour (no SAP «Поставлено» yet, none typed); the day's work reached the target later.",
    "concern_before_hour_checklist_late": "A concern was written before the hour; the checklist was opened later, and that alone scored 0.",
    # unit
    "people_typed_late": "People («Bugungi fakt») were typed, but after the check hour.",
    "people_never_typed": "People were never typed for these cells (still empty now).",
    "people_mixed": "Some cells could not be typed (register), others were simply not typed in time.",
    "plan_typed_late": "The plan was typed by hand, after the check hour.",
    "plan_never": "No plan exists for these cells on this date even now.",
    "under_target": "Below the target at the hour, with ФАКТ on the page.",
    "no_fact_typed": "No ФАКТ at the hour and the day never reached the target either.",
    "no_concern": "No concern was written by the hour.",
    "concern_after_hour": "A concern was written, but after the hour.",
    "started_late": "The checklist was opened after the check hour and the data was not complete at the hour either.",
    # undetermined
    "plan_source_unknown": "Plan exists now, but the log cannot say when it first reached this leader's page.",
    "plan_typed_before_hour": "The log shows a hand-typed plan on these positions standing at the hour, yet the check saw none — a check fault, or the plan was typed on a line outside this leader's group.",
    "upload_before_hour_no_plan": "A SAP upload for this date came before the hour but put no plan on these positions then (it may not have reached this unit, or the positions came in a later upload).",
    "people_cleared_before_hour": "People had been typed before the hour, but a later save (often another person's «Odamlar soni» Save) emptied the cell before the check read it.",
    "leader_moved_since": "The leader (and their cells) moved to another unit after the check — the register today cannot speak for the hour.",
    "started_late_pct_unknown": "The checklist was opened after the hour; the percentage at the hour was never measured, so the evidence cannot say whether #9 would have passed.",
    "people_source_unknown": "People are stored now, but no logged save says when they were typed.",
    "fact_never_on_page": "No ФАКТ has reached the page for this date at all — no SAP «Поставлено» upload and nobody typed it — so the check measured an empty column.",
    "shift2_next_date": "Shift 2: the data for this night sits under the NEXT production date.",
    "other": "Not classified — read the evidence.",
    # not judged
    "no_checklist": "The leader never opened a checklist that day — no auto verdict is written without one.",
    "already_filed": "The leader had answered the task themselves before it became automatic.",
    "day_closed": "The day was closed before the check could write.",
    "excluded": "The leader-day is excluded from the results.",
    "unit_not_per_task": "The unit closes whole days, so the evaluator never visits it.",
    "not_due": "The check hour has not come yet.",
    "retrying": "The check could not read its data yet and is still retrying.",
}


# ── small helpers ────────────────────────────────────────────────────────────

def _t(v) -> str | None:
    if v is None:
        return None
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        return v.astimezone(TZ).strftime("%Y-%m-%d %H:%M")
    return str(v)


def _hm(v) -> str:
    """«21.09 09:47» — the short clock every timeline line uses."""
    if v is None:
        return "—"
    if v.tzinfo is None:
        v = v.replace(tzinfo=timezone.utc)
    return v.astimezone(TZ).strftime("%d.%m %H:%M")


def _aware(v: datetime | None) -> datetime | None:
    if v is None:
        return None
    return v if v.tzinfo else v.replace(tzinfo=timezone.utc)


def _d(iso: str) -> _date:
    return datetime.strptime(str(iso)[:10], "%Y-%m-%d").date()


def _norm(code) -> str:
    """The matching form of a code: Latin twins first (`latin_code` — a code
    logged before the 11 Sep conversion is spelled in Cyrillic), then
    `cell_lookup.norm_code`."""
    return cell_lookup.norm_code(latin_code.latin_code(str(code or "")) if code else code)


def _cyr(s) -> bool:
    return any("Ѐ" <= ch <= "ӿ" for ch in str(s or ""))


def _details(r: ActionLog) -> dict:
    out = {}
    for pair in (r.details or []):
        try:
            k, v = pair[0], pair[1]
        except Exception:
            continue
        out[str(k)] = v
    return out


def _people_of(v):
    """A whole-centre staffing change is logged «people/shtatka»; a group change
    is the bare number. Both come back as the people figure or None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v)
    head = s.split("/", 1)[0].strip()
    if head in ("", "None", "null"):
        return None
    try:
        return float(head)
    except ValueError:
        return None


def _actor(r: ActionLog) -> str:
    who = (r.actor_name or "?").strip()
    role = r.actor_role or r.source or "?"
    return f"{who} ({role})"


# ── the unit-date context ────────────────────────────────────────────────────

class _Unit:
    """Everything one unit-date answers once, however many leaders it has."""

    def __init__(self, db: Session, m: Manager, date: str, now: datetime,
                 defs: dict, all_units: dict):
        self.db, self.m, self.date, self.now = db, m, date, now
        self.d = _d(date)
        self.next_date = (self.d + timedelta(days=1)).isoformat()
        self.due = leader_auto._unit_due(db, m, defs, date)
        st = db.query(PPManagerSetting).filter_by(manager_id=m.id).first()
        self.auto_fill = True if st is None else bool(st.auto_fill)
        self.cells = db.query(Cell).filter(Cell.manager_id == m.id).all()
        self.catalog = {_norm(p.work_center) for p in db.query(PPProduct).filter(
            PPProduct.manager_id == m.id, PPProduct.active.is_(True)).all()
            if p.work_center}
        self.configured = {_norm(w.code) for w in db.query(PPWorkCenter).filter(
            PPWorkCenter.manager_id == m.id, PPWorkCenter.active.is_(True)).all()
            if w.code}
        self.no_labor = {}
        for p in db.query(PPProduct).filter(PPProduct.manager_id == m.id,
                                            PPProduct.active.is_(True)).all():
            if p.labor_time in (None, 0):
                self.no_labor.setdefault(_norm(p.work_center), 0)
                self.no_labor[_norm(p.work_center)] += 1
        self.all_units = all_units
        self.errors: list[str] = []
        # Which work centres the «Odamlar soni» tab lists today, per date.
        self._panel: dict[str, set | None] = {}
        self._events: dict[str, list] | None = None
        self._pins_now: dict[str, dict] = {}

    # the «Odamlar soni» tab TODAY: configured work centres + ones with planned
    # minutes. None when it could not be built — the tab test is then skipped,
    # never answered with an empty set that would call every cell untypeable.
    def panel(self, date: str) -> set | None:
        if date not in self._panel:
            try:
                from app.routers.production import _build_dashboard
                dash = _build_dashboard(self.db, self.m.id, _d(date))
                self._panel[date] = {_norm(w.get("work_center") or w.get("code"))
                                     for w in (dash.get("work_centers") or [])}
            except Exception as exc:
                self.db.rollback()
                log.exception("auto check report: unit panel %s %s", self.m.id, date)
                self.errors.append(f"panel {self.m.name} {date}: {str(exc)[:120]}")
                self._panel[date] = None
        return self._panel[date]

    def reaching_faza(self, before: datetime | None = None) -> list[dict]:
        """SAP фаза uploads of this date that WROTE this unit (the фаза carries
        both ПЛАН and «Поставлено»; a заголовок-only upload writes nothing). An
        «auto-fill» upload reaches the unit when its switch is on; a «picked» one
        records no targets, so the stored snapshot is the only witness."""
        out = []
        for x in self.uploads(self.date):
            if x["outcome"] != "done" or "faza" not in (x["type"] or ""):
                continue
            reached = self.auto_fill if x["note"] == "auto-fill" else self.got_sap()
            if reached and (before is None or x["at"] <= before):
                out.append(x)
        return out

    def sap_plan_wcs(self) -> set:
        """Work centres the stored SAP snapshot gives a plan on this date."""
        from app.models import PPDaily
        c = self.__dict__.setdefault("_c_sapwc", None)
        if c is None:
            c = {_norm(w) for (w,) in self.db.query(PPDaily.work_center).filter(
                PPDaily.manager_id == self.m.id, PPDaily.date == self.d,
                PPDaily.plan_qty > 0).all()}
            self.__dict__["_c_sapwc"] = c
        return c

    def on_tab_at(self, code: str, t: datetime) -> bool | None:
        """Was this work centre on the «Odamlar soni» tab at `t`? A configured one
        always is; an unconfigured one only while it carries planned minutes —
        a hand-typed plan standing then, or a SAP upload that had reached the
        unit by then with a plan on it. None when it cannot be told."""
        if code in self.configured:
            return True
        standing, _cl = self.typed_plan_at(t, {code})
        if standing:
            return True
        if self.reaching_faza(before=t) and code in self.sap_plan_wcs():
            return True
        return False

    # every staffing / plan / fact write for this unit on date and date+1
    def events(self) -> dict[str, list]:
        if self._events is not None:
            return self._events
        days = [self.d, self.d + timedelta(days=1)]
        rows = (self.db.query(ActionLog)
                .filter(ActionLog.unit_id == self.m.id,
                        ActionLog.day.in_(days),
                        ActionLog.action.in_((
                            "production.staffing_set", "production.wc_override_set",
                            "production.override_set")))
                .order_by(ActionLog.created_at, ActionLog.id).all())
        pins, plans, facts, refused = [], [], [], []
        for r in rows:
            at = _aware(r.created_at)
            day = r.day.isoformat() if r.day else None
            if r.outcome != "done":
                refused.append({"at": at, "day": day, "action": r.action,
                                "by": _actor(r), "outcome": r.outcome,
                                "status": r.status, "profile": r.actor_profile_key})
                continue
            if r.action == "production.staffing_set":
                for ch in (r.changes or []):
                    try:
                        name, old, new = ch[0], ch[1], ch[2]
                    except Exception:
                        continue
                    if name == "minutes":
                        continue
                    name = str(name)
                    if " · " in name:
                        code, grp = name.split(" · ", 1)
                        people = None if new is None else _people_of(new)
                    else:
                        code, grp = name, None
                        people = _people_of(new)
                    pins.append({"at": at, "day": day,
                                 "wc": latin_code.latin_code(code.strip()),
                                 "grp": (grp.strip() or None) if grp else None,
                                 "people": people, "by": _actor(r),
                                 "profile": r.actor_profile_key})
            elif r.action == "production.wc_override_set":
                parts = str(r.target_id or "").split(":")
                if len(parts) < 3:
                    continue
                code = parts[2]
                grp = parts[3] if len(parts) > 3 and parts[3] else None
                for ch in (r.changes or []):
                    try:
                        name, old, new = ch[0], ch[1], ch[2]
                    except Exception:
                        continue
                    if name == "workers":
                        pins.append({"at": at, "day": day,
                                     "wc": latin_code.latin_code(code.strip()),
                                     "grp": grp, "people": _people_of(new),
                                     "by": _actor(r), "profile": r.actor_profile_key})
            else:   # production.override_set — ПЛАН / ФАКТ typed on a position
                det = _details(r)
                for ch in (r.changes or []):
                    try:
                        field, old, new = ch[0], ch[1], ch[2]
                    except Exception:
                        continue
                    ev = {"at": at, "day": day, "wc": _norm(det.get("work_center")),
                          "sap": det.get("sap_code"), "line": det.get("line"),
                          "old": old, "new": new,
                          "by": _actor(r), "profile": r.actor_profile_key}
                    (plans if field == "plan" else facts).append(ev)
        self._events = {"pins": pins, "plans": plans, "facts": facts,
                        "refused": refused}
        return self._events

    def got_sap(self) -> bool:
        """Did any SAP upload write this unit's day? (a «picked» upload does
        not record its targets, so the stored snapshot is the only witness)."""
        return bool(self.sap_plan_wcs())

    def clearing_uploads(self) -> list[dict]:
        """Uploads of this date that re-state the plan and so CLEAR every typed
        ПЛАН on the unit (mode «both»/«plan» — `_ingest_for_manager`)."""
        return [x for x in self.reaching_faza() if x["mode"] in ("both", "plan")]

    def typed_plan_at(self, t: datetime, codes: set) -> tuple[dict, dict | None]:
        """{(sap, wc, line): value} of the hand-typed ПЛАН standing at `t` on these
        work centres, and the upload that last cleared it before `t` (if any)."""
        state: dict = {}
        cleared = None
        evs = [("typed", e["at"], e) for e in self.events()["plans"]
               if e["day"] == self.date and e["wc"] in codes]
        evs += [("upload", x["at"], x) for x in self.clearing_uploads()]
        for kind, at, e in sorted(evs, key=lambda z: z[1]):
            if at > t:
                break
            if kind == "upload":
                if state:
                    cleared = e
                state = {}
                continue
            key = (e["sap"], e["wc"], e["line"])
            try:
                v = float(e["new"]) if e["new"] is not None else None
            except (TypeError, ValueError):
                v = None
            if v:
                state[key] = v
            else:
                state.pop(key, None)
        return state, cleared

    def pins_now(self, date: str) -> dict:
        if date not in self._pins_now:
            d = _d(date)
            self._pins_now[date] = zagruzka_source.typed_pins(
                self.db, [self.m.id], d, d)
        return self._pins_now[date]

    def pins_at(self, date: str, t: datetime) -> dict:
        """The typed pins as the action log says they stood at `t` — the saves
        replayed in order. Same shape as `zagruzka_source.typed_pins`."""
        state: dict = {}
        for ev in self.events()["pins"]:
            if ev["day"] != date or ev["at"] > t:
                continue
            key = (self.m.id, date, ev["wc"], ev["grp"])
            if ev["people"] is None:
                state.pop(key, None)
            else:
                state[key] = ev["people"]
        return state

    def replay_ok(self, date: str) -> bool:
        cache = self.__dict__.setdefault("_c_replay", {})
        if date not in cache:
            cache[date] = self._replay_ok(date)
        return cache[date]

    def _replay_ok(self, date: str) -> bool:
        """Does the replay, run up to NOW, reproduce the pins stored now? When it
        does not, something wrote pins outside the logged endpoints and the
        at-the-hour reconstruction must not be trusted for this unit-date."""
        def canon(p):
            return {(_norm(k[2]), k[3] or None): float(v) for k, v in p.items()
                    if k[1] == date}
        return canon(self.pins_at(date, self.now + timedelta(days=3))) == \
            canon(self.pins_now(date))

    def cell_value(self, pins: dict, cell: Cell, date: str):
        got = zagruzka_source.cell_pins(self.cells, pins).get((cell.id, date))
        return None if got is None else got[0]

    def cell_timeline(self, cell: Cell, date: str, due: datetime) -> dict:
        """When this cell first read a typed number on `date`, and — when that was
        before the hour but the cell was empty AT the hour — who emptied it."""
        code = _norm(cell.sap_code)
        first = by = cleared_at = cleared_by = None
        evs = [e for e in self.events()["pins"]
               if e["day"] == date and _norm(e["wc"]) == code]
        had = False
        for ev in evs:
            v = self.cell_value(self.pins_at(date, ev["at"]), cell, date)
            if v is not None and first is None:
                first, by = ev["at"], ev["by"]
            if ev["at"] <= due:
                if v is None and had:
                    cleared_at, cleared_by = ev["at"], ev["by"]
                had = v is not None
        return {"first_typed_at": first, "first_typed_by": by, "saves": len(evs),
                "cleared_at": cleared_at, "cleared_by": cleared_by}

    def uploads(self, date: str) -> list[dict]:
        cache = self.__dict__.setdefault("_c_uploads", {})
        if date not in cache:
            cache[date] = self._uploads_q(date)
        return cache[date]

    def _uploads_q(self, date: str) -> list[dict]:
        rows = (self.db.query(ActionLog)
                .filter(ActionLog.action == "production.phase_uploaded",
                        ActionLog.day == _d(date))
                .order_by(ActionLog.created_at).all())
        out = []
        for r in rows:
            det = _details(r)
            out.append({"at": _aware(r.created_at), "by": _actor(r),
                        "outcome": r.outcome, "mode": det.get("mode"),
                        "type": det.get("type") or "", "note": det.get("note"),
                        "units": det.get("count")})
        return out


# ── the leader's cells, tested ───────────────────────────────────────────────

def _cell_problems(u: _Unit, cell: Cell, date: str, due: datetime | None = None,
                   prof: RoleProfile | None = None) -> list[str]:
    """Every reason this cell could not be answered on `date` — at the check
    hour when `due` is given, today otherwise (the tab test is the one that
    moves with the hour: an unconfigured work centre is listed only while it
    carries planned minutes)."""
    probs = []
    code = _norm(cell.sap_code)
    if not code:
        return ["no_sap_code"]
    if cell.manager_id is None:
        probs.append("cell_has_no_unit")
    elif cell.manager_id != u.m.id:
        if prof is not None and cell.manager_id == getattr(prof, "manager_id", None):
            # the leader moved to another unit AFTER the check and took the cell
            # along — a statement about today, not about the hour
            probs.append("moved_since_check")
        else:
            other = u.all_units.get(cell.manager_id)
            probs.append(f"cell_in_other_unit:{getattr(other, 'name', cell.manager_id)}")
    if _cyr(cell.sap_code):
        probs.append("cyrillic_letter_in_code")
    if code not in u.catalog and code not in u.configured:
        probs.append("work_centre_not_in_unit_catalog")
    elif due is not None:
        if u.on_tab_at(code, due) is False:
            # Off the tab at the hour. Which of two things that is depends on
            # whether the work centre EVER got a plan that day: if it did, its
            # plan simply arrived after the hour (a timing question — SAP's on a
            # fed unit, the unit's own on a manual one); if it never did, the tab
            # never listed it and nobody could have typed it, not even a 0.
            panel = u.panel(date)
            if panel is None:
                pass
            elif code in panel:
                probs.append("plan_on_cell_after_hour")
            else:
                probs.append("no_plan_on_cell_all_day")
    else:
        panel = u.panel(date)
        if panel is not None and code not in panel:
            probs.append("not_on_people_tab_today")
    return probs


_NOT_REGISTER = ("moved_since_check", "plan_on_cell_after_hour")


def _untypeable(probs: list[str]) -> bool:
    """A problem nobody could have typed around — the register's (or the tab's)."""
    return any(p not in _NOT_REGISTER for p in probs)


def _elsewhere(db: Session, codes: set, mid: int) -> dict[str, list[str]]:
    """Which OTHER units' catalogs carry these work centres."""
    if not codes:
        return {}
    out: dict[str, set] = defaultdict(set)
    rows = (db.query(PPProduct.work_center, Manager.name)
            .join(Manager, Manager.id == PPProduct.manager_id)
            .filter(PPProduct.active.is_(True), PPProduct.manager_id != mid).all())
    for wc, name in rows:
        n = _norm(wc)
        if n in codes:
            out[n].add(name)
    return {k: sorted(v) for k, v in out.items()}


# ── one leader-date-cell, every task ─────────────────────────────────────────

def _ctx(db, prof, m, date, cell, due, now):
    return leader_auto._Ctx(db, prof, m, m.shift, date, cell, due, now)


def _run(check: str, ctx, target):
    try:
        v = leader_auto._RUNNERS[check](ctx, target)
        return {"outcome": v.outcome, "code": v.code, "facts": v.facts}
    except Exception as exc:
        return {"outcome": "error", "code": "error", "facts": {"error": str(exc)[:200]}}


def _plan_rows_now(ctx) -> dict:
    try:
        rows = ctx.dashboard.get("rows") or []
    except Exception:
        return {"rows": 0, "with_plan": 0, "plan_no_labor": 0}
    wp = [r for r in rows if float(r.get("plan_qty") or 0) > 0]
    return {"rows": len(rows), "with_plan": len(wp),
            "plan_no_labor": sum(1 for r in wp if not r.get("total_labor"))}


def _classify_plan(rec, u: _Unit, codes: set, evidence: list, now_plan: dict,
                   next_plan: dict | None, due: datetime):
    """no_plan on #1 or #9 → (bucket, category), judged on the state AT THE HOUR.

    A SAP-fed (auto-fill) unit's plan is SAP's to deliver: with no upload that
    had reached it by the hour and no hand-typed plan standing, the failure is
    the upload's, whatever anybody typed afterwards. Only a manual unit's plan is
    the unit's to type."""
    if codes and not (codes & (u.catalog | u.configured)):
        return OURS, "register_codes_not_in_unit"
    if now_plan["with_plan"] and now_plan["plan_no_labor"] == now_plan["with_plan"] \
            and rec["task_id"] == 9:
        return OURS, "register_no_labor_time"
    ev = u.events()
    typed = [e for e in ev["plans"] if e["day"] == u.date and e["wc"] in codes
             and e["new"] not in (None, 0, 0.0)]
    first_typed = typed[0] if typed else None
    reach_all = u.reaching_faza()
    reach_before = [x for x in reach_all if x["at"] <= due]
    evidence.append(f"Unit SAP auto-fill: {'ON — the plan is SAP’s to deliver' if u.auto_fill else 'OFF — the plan is typed by hand'}")
    if first_typed:
        evidence.append(f"Plan first typed by hand {_hm(first_typed['at'])} by "
                        f"{first_typed['by']} ({len(typed)} plan edits on these positions)")
    else:
        evidence.append("Nobody typed a plan on these positions for this date")
    ups = [x for x in u.uploads(u.date) if x["outcome"] == "done"]
    for x in ups[:5]:
        evidence.append(f"SAP upload for {u.date}: {_hm(x['at'])} by {x['by']} "
                        f"(mode {x['mode']}, {x['type']}, {x['note'] or '—'})")
    if not ups:
        evidence.append(f"No SAP upload for {u.date} in the log (yet)")

    standing, cleared = u.typed_plan_at(due, codes)
    if standing:
        evidence.append(f"Per the log, {len(standing)} hand-typed plan value(s) stood on "
                        f"these positions at the hour")
        return UNDET, "plan_typed_before_hour"
    if first_typed and first_typed["at"] <= due and cleared is not None:
        evidence.append(f"The hand-typed plan was CLEARED by the SAP upload at "
                        f"{_hm(cleared['at'])} ({cleared['by']}) before the hour")
        return OURS, "upload_wiped_typed_plan"
    shift2_next = rec["shift"] == 2 and next_plan and next_plan.get("with_plan") \
        and not now_plan["with_plan"]
    if shift2_next:
        evidence.append(f"The NEXT production date ({u.next_date}) carries a plan on "
                        f"these positions")

    if u.auto_fill:
        if not reach_before:
            if reach_all:
                evidence.append(f"The first SAP upload that reached this unit for "
                                f"{u.date} came {_hm(reach_all[0]['at'])} — after the hour")
            return OURS, "sap_upload_after_check"
        if shift2_next:
            return UNDET, "shift2_next_date"
        evidence.append("A SAP upload had reached this unit before the hour, yet the "
                        "check found no plan on these positions")
        return UNDET, "upload_before_hour_no_plan"

    # manual unit — the plan is the unit's to type
    if shift2_next:
        return UNDET, "shift2_next_date"
    if first_typed is None:
        if reach_all and now_plan["with_plan"]:
            return (OURS, "sap_upload_after_check") if reach_all[0]["at"] > due \
                else (UNDET, "upload_before_hour_no_plan")
        return UNIT, "plan_never"
    if first_typed["at"] > due:
        return UNIT, "plan_typed_late"
    evidence.append("A plan was typed before the hour but was no longer standing at "
                    "it (edited back to zero)")
    return UNDET, "plan_source_unknown"


def _leader_day(db, u: _Unit, prof: RoleProfile, cell_id, tasks: dict, defs,
                ledger: dict, now: datetime, per_task: set, holders: bool,
                card_live: datetime | None = None) -> list[dict]:
    """Every auto task of one leader-date-cell, as report records."""
    m, date = u.m, u.date
    cell = db.query(Cell).filter(Cell.id == cell_id).first() if cell_id else None
    my_cells = [cell] if cell is not None else (
        db.query(Cell).filter(Cell.leader_id == prof.id).order_by(Cell.verifix_code).all())
    codes = {_norm(c.sap_code) for c in my_cells if _norm(c.sap_code)}
    day = (db.query(LeaderTaskDay)
           .filter(LeaderTaskDay.leader_id == prof.id, LeaderTaskDay.date == date,
                   LeaderTaskDay.cell_id.is_(None) if cell_id is None
                   else LeaderTaskDay.cell_id == cell_id).first())
    excluded = leader_exclusions.excluded(db, prof.id, date, leader_name=prof.name)
    moved = getattr(prof, "manager_id", None) != m.id

    cell_info = []
    for c in my_cells:
        cell_info.append({
            "id": c.id, "verifix": c.verifix_code, "sap": c.sap_code,
            "group": c.wc_group, "unit_id": c.manager_id,
            "problems": _cell_problems(u, c, date, None, prof)})

    # one shared page for #1 and #9 — the check's own ctx, run on today's data
    ctx_now = ctx_next = None
    out = []
    for tid, (check, target, weight, hhmm_cfg) in sorted(tasks.items()):
        due_hh = u.due.get(tid)
        due = due_hh[0] if due_hh else None
        hhmm = due_hh[1] if due_hh else hhmm_cfg
        row = ledger.get((prof.id, date, cell_id, tid))
        if row is not None and row.due_at is not None:
            # the instant the check was actually asked at — the unit's hour may
            # have been edited since
            due = _aware(row.due_at)
            hhmm = due.astimezone(TZ).strftime("%H:%M")
        entry = (db.query(LeaderTaskEntry).filter_by(day_id=day.id, task_id=tid).first()
                 if day is not None else None)
        auto_entry = (entry is not None and entry.done is False
                      and str(entry.reason or "").startswith("__auto__"))
        rec = {
            "date": date, "shift": m.shift, "unit_id": m.id, "unit": m.name,
            "leader_id": prof.id, "leader": prof.name, "claimed": holders,
            "cell_id": cell_id, "cell": getattr(cell, "verifix_code", None),
            "task_id": tid, "task": TASK_TEXT.get(tid, f"#{tid}"),
            "check": check, "target": target, "weight": weight,
            "hour": hhmm, "due": _t(due),
            "checklist_opened": day is not None,
            "day_closed_at": _t(day.closed_at) if day else None,
            "outcome": row.outcome if row else None,
            "code": row.code if row else None,
            "facts": (row.facts or {}) if row else {},
            "warned_at": _t(row.warned_at) if row else None,
            "checked_at": _t(row.checked_at) if row else None,
            "entry_done": entry.done if entry else None,
            "entry_reason": entry.reason if entry else None,
            "entry_saved_at": _t(entry.saved_at) if entry else None,
            "cells": cell_info, "excluded": bool(excluded),
            "leader_moved_since": moved,
        }
        evidence: list[str] = []
        bucket, cat = UNDET, "other"
        late = (rec["facts"] or {}).get("late_by_min")
        if late and rec["code"] != "started_late":
            evidence.append(f"The check ran {late} min after its hour")
        elif late:
            evidence.append(f"The verdict was written {late} min after the hour, once "
                            f"the checklist appeared")
        rec["warning"] = _warning_kind(row, card_live)
        if row is not None and row.warned_at is not None:
            evidence.append("Warning sent " + _hm(row.warned_at) + " — " +
                            WARNING_TEXT[rec["warning"]])
        if row and row.warned_at is None and row.checked_at is not None:
            evidence.append("No warning was recorded before the check")
        if not holders:
            evidence.append("No Telegram account holds this leader profile — the "
                            "warning and the verdict DM reached nobody")
        if moved:
            evidence.append(f"This leader has moved to another unit since "
                            f"(now {getattr(u.all_units.get(prof.manager_id), 'name', prof.manager_id)})")
        if excluded:
            evidence.append("This leader-day is EXCLUDED from the results now — the "
                            "verdict costs nothing")

        failed = bool(row is not None and row.outcome == "failed")
        if row is not None and row.outcome == "passed":
            bucket, cat = PASSED, "ok"
        elif failed:
            code = row.code
            if check in ("plan_staffing", "plan_pct"):
                # A refused write never reaches `action_log.enrich`, so its row
                # carries no unit and no day — it is found by WHO and WHEN.
                start = leader_auto._day_start(date) - timedelta(hours=12)
                for r in (db.query(ActionLog)
                          .filter(ActionLog.actor_profile_key == f"leader:{prof.id}",
                                  ActionLog.action.in_((
                                      "production.staffing_set",
                                      "production.override_set")),
                                  ActionLog.outcome != "done",
                                  ActionLog.created_at >= start,
                                  ActionLog.created_at <= (due or now) + timedelta(hours=2))
                          .order_by(ActionLog.created_at).limit(10).all()):
                    evidence.append(f"This leader's write was REFUSED {_hm(r.created_at)}: "
                                    f"{r.action} → {r.outcome} HTTP {r.status or '?'}")
                if ctx_now is None:
                    ctx_now = _ctx(db, prof, m, date, cell, due or now, now)
                now_plan = _plan_rows_now(ctx_now)
                rec["now"] = _run(check, ctx_now, target)
                next_plan = None
                if m.shift == 2:
                    if ctx_next is None:
                        ctx_next = _ctx(db, prof, m, u.next_date, cell, due or now, now)
                    next_plan = _plan_rows_now(ctx_next)
                    rec["next_date_now"] = _run(check, ctx_next, target)
                if code == "no_sap_code":
                    bucket, cat = OURS, "register_no_sap_code"
                elif code in ("not_checked", "no_data"):
                    bucket, cat = OURS, "check_error"
                elif code == "no_plan":
                    bucket, cat = _classify_plan(rec, u, codes, evidence, now_plan,
                                                 next_plan, due)
                    if cat == "register_codes_not_in_unit":
                        els = _elsewhere(db, codes, m.id)
                        if els:
                            evidence.append("These work centres ARE in: " + "; ".join(
                                f"{k} → {', '.join(v)}" for k, v in els.items()))
                elif code == "no_staffing":
                    bucket, cat = _classify_people(u, rec, my_cells, due, evidence, prof)
                elif code == "under_target":
                    bucket, cat = _classify_pct(u, rec, codes, due, evidence)
                elif code == "started_late":
                    bucket, cat = _classify_started_late(u, rec, my_cells, codes, due,
                                                         evidence, ctx_now, check, prof)
            elif check == "concerns":
                if code in ("not_checked", "no_data"):
                    bucket, cat = OURS, "check_error"
                else:
                    bucket, cat = _classify_concern(db, prof, m, date, cell, row, due,
                                                    evidence)
            if moved and bucket == OURS and cat.startswith("register"):
                bucket, cat = UNDET, "leader_moved_since"
        elif row is not None and row.outcome in ("passed", "failed"):
            pass
        elif auto_entry:
            # no failed verdict, yet the task was closed as not done under the
            # automatic regime (e.g. the day closed while the check was still
            # retrying) — the leader scores 0 for it
            failed = True
            bucket, cat = OURS, "closed_unchecked"
            evidence.append(f"The task was closed as not done ({entry.reason}) "
                            f"without an automatic verdict")
        elif due is None or now < due:
            bucket, cat = NOT_JUDGED, "not_due"
        elif m.id not in per_task:
            bucket, cat = NOT_JUDGED, "unit_not_per_task"
        elif excluded:
            bucket, cat = NOT_JUDGED, "excluded"
        elif row is None:
            if day is None:
                bucket, cat = NOT_JUDGED, "no_checklist"
            else:
                failed = True
                bucket, cat = OURS, "no_verdict"
        elif row.outcome == "skipped":
            if row.code == "no_day" and day is None:
                bucket, cat = NOT_JUDGED, "no_checklist"
            elif row.code in ("already_filed", "day_closed"):
                bucket, cat = NOT_JUDGED, row.code
            elif row.code == "no_day":
                failed = True
                bucket, cat = OURS, "no_verdict"
                evidence.append("A checklist exists now but no verdict was written "
                                "after it appeared")
            else:
                bucket, cat = NOT_JUDGED, "retrying"
        else:
            bucket, cat = NOT_JUDGED, "retrying"

        rec["failed"] = failed
        rec["bucket"], rec["category"] = bucket, cat
        rec["explanation"] = CATEGORY_TEXT.get(cat, cat)
        rec["evidence"] = evidence
        try:
            w = float(weight or 0)
        except (TypeError, ValueError):
            w = 0.0
        rec["points_lost"] = w if (failed and not excluded) else 0
        out.append(rec)
    return out


def _classify_people(u: _Unit, rec: dict, cells: list, due: datetime,
                     evidence: list, prof: RoleProfile):
    """no_staffing → which cells, and why each was empty AT THE HOUR."""
    date = u.date
    untyped = [str(x) for x in (rec["facts"].get("untyped") or [])]
    by_code = {str(c.verifix_code): c for c in cells if c.verifix_code}
    ok_replay = u.replay_ok(date)
    if not ok_replay:
        evidence.append("Pin replay does not reproduce today's pins for this unit-date "
                        "— at-the-hour pin states are indicative only")
    pins_due = u.pins_at(date, due)
    pins_now = u.pins_now(date)
    # Is the log's picture of the PLAN at the hour complete? The check itself
    # recorded how many positions carried a plan; if it saw some and the log
    # can place none on these work centres, a source is missing from the log
    # and «its plan came later» must not be claimed for any cell.
    codes = {_norm(c.sap_code) for c in cells if _norm(c.sap_code)}
    recon_any = bool(u.typed_plan_at(due, codes)[0]) or bool(
        u.reaching_faza(before=due) and (codes & u.sap_plan_wcs()))
    recon_ok = not (int(rec["facts"].get("with_plan") or 0) > 0 and not recon_any)
    if not recon_ok:
        evidence.append(f"The check saw {rec['facts'].get('with_plan')} planned position(s) "
                        f"but the log cannot place a plan on these work centres at the "
                        f"hour — plan timing per cell is not judged")
    kinds = Counter()
    for label in untyped:
        c = by_code.get(label)
        if c is None:
            evidence.append(f"{label}: untyped at the hour (not among this leader's "
                            f"cells today — register changed since)")
            kinds["gone"] += 1
            continue
        probs = _cell_problems(u, c, date, due, prof)
        if "moved_since_check" in probs:
            kinds["moved"] += 1
        if _untypeable(probs):
            evidence.append(f"{label} ({c.sap_code or 'no SAP'}): could not be typed — "
                            + ", ".join(p for p in probs if p not in _NOT_REGISTER))
            kinds["untypeable"] += 1
            continue
        tl = u.cell_timeline(c, date, due)
        v_due = u.cell_value(pins_due, c, date) if ok_replay else None
        v_now = u.cell_value(pins_now, c, date)
        plan_late = "plan_on_cell_after_hour" in probs and recon_ok
        if ok_replay and v_due is not None:
            evidence.append(f"{label}: the log shows {v_due:g} people standing at the "
                            f"hour (first typed {_hm(tl['first_typed_at'])} by "
                            f"{tl['first_typed_by']})")
            kinds["contradiction"] += 1
        elif not ok_replay and tl["first_typed_at"] is not None:
            evidence.append(f"{label}: first typed {_hm(tl['first_typed_at'])} by "
                            f"{tl['first_typed_by']} (replay unreliable — cannot say "
                            f"what stood at the hour)")
            kinds["unknown"] += 1
        elif tl["first_typed_at"] is not None and tl["first_typed_at"] <= due:
            evidence.append(f"{label}: typed {_hm(tl['first_typed_at'])} by "
                            f"{tl['first_typed_by']}, then EMPTIED "
                            f"{_hm(tl['cleared_at'])} by {tl['cleared_by']} — before "
                            f"the {rec['hour']} check")
            kinds["cleared"] += 1
        elif plan_late:
            evidence.append(f"{label} ({c.sap_code}): not on the «Odamlar soni» tab at the "
                            f"hour — its plan arrived only later, so its people could not "
                            f"be typed yet"
                            + (f" (typed {_hm(tl['first_typed_at'])} by {tl['first_typed_by']})"
                               if tl["first_typed_at"] else ""))
            kinds["plan_late"] += 1
        elif tl["first_typed_at"] is not None:
            evidence.append(f"{label}: typed {_hm(tl['first_typed_at'])} by "
                            f"{tl['first_typed_by']} — after the {rec['hour']} check")
            kinds["late"] += 1
        elif v_now is not None:
            evidence.append(f"{label}: a number is stored now ({v_now:g}) but no "
                            f"logged save explains when")
            kinds["unknown"] += 1
        else:
            evidence.append(f"{label}: still no people typed")
            kinds["never"] += 1
        if rec["shift"] == 2:
            nxt = u.pins_now(u.next_date)
            v_next = u.cell_value(nxt, c, u.next_date)
            if v_next is not None:
                evidence.append(f"{label}: people ARE typed under the next date "
                                f"({u.next_date}): {v_next:g}")
                kinds["next_date"] += 1
    if kinds["contradiction"]:
        return OURS, "check_contradiction"
    if kinds["untypeable"]:
        # the check fails on such a cell whatever anybody types — any other
        # untyped cell is evidence, not the cause
        if kinds["moved"]:
            return UNDET, "leader_moved_since"
        return OURS, "register_cell_untypeable"
    if kinds["plan_late"] and not (kinds["never"] or kinds["late"] or kinds["cleared"]):
        return (OURS, "sap_upload_after_check") if u.auto_fill \
            else (UNIT, "plan_typed_late")
    if kinds["cleared"]:
        return UNDET, "people_cleared_before_hour"
    if kinds["unknown"] or kinds["gone"]:
        return UNDET, "people_source_unknown"
    if kinds["next_date"] and kinds["never"]:
        return UNDET, "shift2_next_date"
    if kinds["never"]:
        return UNIT, "people_never_typed"
    if kinds["late"]:
        return UNIT, "people_typed_late"
    return UNDET, "other"


def _classify_pct(u: _Unit, rec: dict, codes: set, due: datetime, evidence: list):
    """under_target on #9. The ledger's `fact_min` is what was on the page at the
    hour; ФАКТ reaches the page from a SAP фаза upload that WROTE this unit, or by
    hand."""
    f = rec["facts"]
    now = rec.get("now") or {}
    pct_now = (now.get("facts") or {}).get("pct")
    evidence.append(f"At {rec['hour']}: {f.get('pct')}% (fact {f.get('fact_min')} of "
                    f"{f.get('plan_min')} plan-min); on today's data: {pct_now}%")
    evidence.append(f"Unit SAP auto-fill: {'ON' if u.auto_fill else 'OFF — ФАКТ is typed by hand'}")
    typed = [e for e in u.events()["facts"] if e["day"] == u.date and e["wc"] in codes
             and e["new"] not in (None, 0, 0.0)]
    reach = u.reaching_faza()
    if typed:
        evidence.append(f"ФАКТ typed on {len(typed)} position edits; first "
                        f"{_hm(typed[0]['at'])} by {typed[0]['by']}")
    else:
        evidence.append("Nobody typed ФАКТ on these positions for this date")
    if reach:
        evidence.append("SAP uploads that wrote this unit's ФАКТ for this date: "
                        + ", ".join(_hm(x["at"]) for x in reach[:5]))
    else:
        evidence.append("No SAP upload has written this unit's ФАКТ for this date")
    fact_at = float(f.get("fact_min") or 0)
    target = float(f.get("target") or rec["target"] or 30)
    if fact_at <= 0:
        if pct_now is not None and pct_now >= target:
            return RULE, "fact_arrives_after_hour"
        if not reach and not typed:
            return UNDET, "fact_never_on_page"
        return UNIT, "no_fact_typed"
    return UNIT, "under_target"


def _classify_started_late(u: _Unit, rec, cells, codes, due, evidence, ctx_now, check,
                           prof):
    f = rec["facts"]
    evidence.append(f"At the check ({f.get('checked_at') or rec['checked_at']}) the "
                    f"leader had no checklist for this date")
    date = u.date
    bad = [(c, _cell_problems(u, c, date, due, prof)) for c in cells]
    for c, probs in bad:
        if _untypeable(probs):
            evidence.append(f"{c.verifix_code}: could not be typed — "
                            f"{', '.join(p for p in probs if p not in _NOT_REGISTER)} "
                            f"(the check would have failed on it anyway)")
    ok_replay = u.replay_ok(date)
    pins_due = u.pins_at(date, due)
    people_ok = ok_replay and all(
        u.cell_value(pins_due, c, date) is not None for c in cells)
    standing, _cl = u.typed_plan_at(due, codes)
    reach_before = u.reaching_faza(before=due)
    plan_ok = bool(standing) or bool(reach_before and (codes & u.sap_plan_wcs()))
    evidence.append(f"At the hour, per the log: plan {'present' if plan_ok else 'absent'}, "
                    f"people {'typed for every cell' if people_ok else 'not all typed'}"
                    + ("" if ok_replay else " (pin replay unreliable)"))
    if any(_untypeable(p) for _c, p in bad) and check == "plan_staffing":
        return OURS, "register_cell_untypeable"
    if not plan_ok and u.auto_fill and not reach_before:
        evidence.append("No SAP upload had reached this auto-fill unit by the hour")
        return OURS, "sap_upload_after_check"
    if check == "plan_staffing":
        return (RULE, "started_late_data_complete") if (plan_ok and people_ok) \
            else (UNIT, "started_late")
    # #9: the percentage at the hour was never measured — only the plan half can
    # be stated from the log
    now = rec.get("now") or _run(check, ctx_now, rec["target"])
    rec["now"] = now
    evidence.append(f"#9 on today's data: {(now.get('facts') or {}).get('pct')}%")
    return UNDET, "started_late_pct_unknown"


def _classify_concern(db, prof, m, date, cell, row, due, evidence):
    if row.code == "started_late":
        ctx = _ctx(db, prof, m, date, cell, due, due)
        n = _run("concerns", ctx, None)
        if (n.get("facts") or {}).get("found"):
            evidence.append(f"{n['facts']['found']} concern(s) existed before the hour")
            return RULE, "concern_before_hour_checklist_late"
        evidence.append("No concern before the hour either")
        return UNIT, "started_late"
    # the check's own predicate, widened to the rest of that checklist day
    later = _ctx(db, prof, m, date, cell,
                 _day_end(date, m.shift), due)
    n_late = (_run("concerns", later, None).get("facts") or {}).get("found") or 0
    n_logged = (db.query(ActionLog.id)
                .filter(ActionLog.action == "concern.created",
                        ActionLog.outcome == "done",
                        ActionLog.actor_profile_key == f"leader:{prof.id}",
                        ActionLog.created_at >= leader_auto._day_start(date),
                        ActionLog.created_at < due).count())
    if n_logged:
        evidence.append(f"The action log shows {n_logged} concern(s) created by this "
                        f"leader before the hour")
        return OURS, "check_contradiction"
    if n_late:
        evidence.append(f"{n_late} concern(s) by the end of the checklist day")
        return UNIT, "concern_after_hour"
    return UNIT, "no_concern"


def _day_end(date: str, shift) -> datetime:
    base = leader_auto._day_start(date) + timedelta(days=1)
    return base + (timedelta(hours=9) if shift == 2 else timedelta())


# ── what the leader was TOLD ─────────────────────────────────────────────────
# Until v4.140.6 (21.09 afternoon) the warning was one generic bell line —
# «the system checks this task, enter the data by the hour». The card that says
# WHERE to type, WHAT to type (ФАКТ by hand for #9) and shows the live figures
# came with it. Which one a leader got is read off the action register: the
# first row stamped with that version is when it was live.
CARD_VERSION = (4, 140, 6)
WARNING_TEXT = {
    "none": "no warning recorded",
    "generic": "the generic line «enter the data by the hour» (no steps; it does "
               "not say ФАКТ must be typed by hand)",
    "card": "the step-by-step card (where to go, what to type, live figures)",
}


def _card_live(db: Session) -> datetime | None:
    from sqlalchemy import func
    best = None
    for ver, first in (db.query(ActionLog.app_version, func.min(ActionLog.created_at))
                       .filter(ActionLog.created_at >= datetime(2026, 9, 19, tzinfo=TZ))
                       .group_by(ActionLog.app_version).all()):
        try:
            v = tuple(int(x) for x in str(ver or "").split("."))
        except ValueError:
            continue
        if v >= CARD_VERSION and first is not None:
            first = _aware(first)
            best = first if best is None or first < best else best
    return best


def _warning_kind(row, card_live) -> str:
    if row is None or row.warned_at is None:
        return "none"
    if card_live is not None and _aware(row.warned_at) >= card_live:
        return "card"
    return "generic"


# ── the whole report ─────────────────────────────────────────────────────────

def collect(db: Session, dates=DATES, now: datetime | None = None) -> dict:
    now = (now or datetime.now(timezone.utc)).astimezone(TZ)
    errors: list[str] = []
    defs = {td.id: td for td in db.query(LeaderTaskDef)
            .filter(LeaderTaskDef.auto_check.isnot(None)).all()}
    checks = {tid: leader_auto.parse_check(td.auto_check) for tid, td in defs.items()}
    per_task = leader_tasks.per_task_units(db)
    all_units = {m.id: m for m in db.query(Manager).all()}
    factories = {f.id: f.code for f in db.query(Factory).all()}
    from app.identity import profile_holders, profile_key

    card_live = _card_live(db)
    ledger = {}
    for r in db.query(LeaderAutoCheck).filter(LeaderAutoCheck.date.in_(list(dates))).all():
        ledger[(r.leader_id, r.date, r.cell_id, r.task_id)] = r
    ledger_units = {r.manager_id for r in ledger.values()}
    # the unit a leader-date was CHECKED under — a leader who has moved since is
    # reported there, and only there
    unit_of = {(r.leader_id, r.date): r.manager_id for r in ledger.values()}
    led_by = defaultdict(list)
    for k in ledger:
        led_by[(k[0], k[1])].append(k)

    units = [m for m in all_units.values()
             if not getattr(m, "archived", False) or m.id in ledger_units]
    units.sort(key=lambda m: (m.shift or 9, m.name or ""))

    records: list[dict] = []
    upload_rows: list[dict] = []
    unit_rows: list[dict] = []
    seen_upload_dates = set()
    for date in dates:
        for m in units:
            try:
                u = _Unit(db, m, date, now, defs, all_units)
            except Exception as exc:
                db.rollback()
                log.exception("auto check report: unit %s %s", m.id, date)
                errors.append(f"unit {m.name} {date}: {str(exc)[:150]}")
                continue
            if date not in seen_upload_dates:
                for x in u.uploads(date):
                    upload_rows.append({"date": date, "at": _t(x["at"]), "by": x["by"],
                                        "outcome": x["outcome"], "mode": x["mode"],
                                        "type": x["type"], "targets": x["note"],
                                        "units": x["units"]})
                seen_upload_dates.add(date)
            roster = (db.query(RoleProfile)
                      .filter(RoleProfile.role == "leader", RoleProfile.manager_id == m.id)
                      .order_by(RoleProfile.name).all())
            ids = {p.id for p in roster}
            extra = {k[0] for k, r in ledger.items() if k[1] == date and r.manager_id == m.id
                     and k[0] not in ids}
            if extra:
                roster += db.query(RoleProfile).filter(RoleProfile.id.in_(extra)).all()
            roster = [p for p in roster if unit_of.get((p.id, date), m.id) == m.id]
            n_before = len(records)
            for prof in roster:
                try:
                    cfg = leader_tasks.effective_leader_config(db, prof, m.shift, day=date)
                except Exception as exc:
                    db.rollback()
                    log.exception("auto check report: cfg %s", prof.id)
                    errors.append(f"config {prof.name} {date}: {str(exc)[:150]}")
                    cfg = {}
                led = led_by.get((prof.id, date), [])
                tasks = {}
                for tid, parsed in checks.items():
                    s_ = cfg.get(tid)
                    if not parsed or not s_ or not s_.get("enabled") or not leader_auto.is_auto(s_):
                        continue
                    tasks[tid] = (parsed[0], parsed[1], s_.get("weight"),
                                  s_.get("deadline") or "")
                # every task the ledger holds a verdict for is owed, whatever
                # the config says today
                for k in led:
                    tid = k[3]
                    if tid not in tasks and checks.get(tid):
                        tasks[tid] = (checks[tid][0], checks[tid][1],
                                      (cfg.get(tid) or {}).get("weight"), "")
                if not tasks:
                    continue
                holders = bool(profile_holders(db, profile_key("leader", int(prof.id))))
                try:
                    cells = leader_cells.expected_days(db, prof, date)
                except Exception as exc:
                    db.rollback()
                    errors.append(f"cells {prof.name} {date}: {str(exc)[:150]}")
                    cells = [None]
                led_cells = {k[2] for k in led}
                if led_cells:
                    cells = sorted(led_cells | set(cells or []), key=lambda c: c or 0)
                if not cells:
                    continue          # a per-cell leader with no cell owes nothing
                for cid in cells:
                    try:
                        records += _leader_day(db, u, prof, cid, tasks, defs, ledger,
                                               now, per_task, holders, card_live)
                    except Exception as exc:
                        db.rollback()
                        log.exception("auto check report: leader %s %s", prof.id, date)
                        errors.append(f"leader {prof.name} {date}: {str(exc)[:150]}")
                        for tid, (check, target, weight, hh) in tasks.items():
                            lr = ledger.get((prof.id, date, cid, tid))
                            failed = bool(lr is not None and lr.outcome == "failed")
                            try:
                                w = float(weight or 0)
                            except (TypeError, ValueError):
                                w = 0.0
                            records.append({
                                "date": date, "shift": m.shift, "unit_id": m.id,
                                "unit": m.name, "leader_id": prof.id, "leader": prof.name,
                                "cell_id": cid, "task_id": tid,
                                "task": TASK_TEXT.get(tid), "check": check,
                                "outcome": lr.outcome if lr else None,
                                "code": lr.code if lr else None,
                                "facts": (lr.facts or {}) if lr else {},
                                "failed": failed,
                                "bucket": UNDET if failed else NOT_JUDGED,
                                "category": "other",
                                "explanation": f"Report error: {str(exc)[:150]}",
                                "evidence": [], "points_lost": w if failed else 0})
            errors += u.errors
            unit_rows.append({
                "date": date, "unit_id": m.id, "unit": m.name, "shift": m.shift,
                "factory": factories.get(getattr(m, "factory_id", None)),
                "per_task": m.id in per_task, "sap_auto_fill": u.auto_fill,
                "leaders": len(roster),
                "leaders_owing": len({r["leader_id"] for r in records[n_before:]}),
                "hours": {tid: hh for tid, (_d0, hh) in u.due.items()},
                "catalog_work_centres": len(u.catalog),
                "configured_work_centres": len(u.configured),
            })

    # ledger rows the roster walk did not reach (a leader since moved/archived)
    covered = {(r["leader_id"], r["date"], r.get("cell_id"), r["task_id"]) for r in records}
    names = {p.id: p.name for p in db.query(RoleProfile).filter(
        RoleProfile.id.in_({k[0] for k in ledger} or {0})).all()}
    orphans = [{"leader_id": k[0], "leader": names.get(k[0]), "date": k[1],
                "cell_id": k[2], "task_id": k[3], "outcome": r.outcome, "code": r.code,
                "facts": r.facts, "manager_id": r.manager_id,
                "unit": getattr(all_units.get(r.manager_id), "name", None)}
               for k, r in ledger.items() if k not in covered]

    return {"generated_at": _t(now), "dates": list(dates),
            "warning_card_live_from": _t(card_live),
            "records": records, "uploads": upload_rows, "units": unit_rows,
            "ledger_not_in_roster": orphans, "errors": errors,
            "summary": _summary(records, orphans, errors)}


def _summary(records: list[dict], orphans: list | None = None,
             errors: list | None = None) -> dict:
    s: dict = {"by_task": {}, "failures_by_bucket": {}, "categories": {},
               "points_lost": {}, "by_day": {}}
    fails = [r for r in records if r.get("failed")]
    for r in records:
        k = f"{r['date']} · shift {r['shift']} · {r['task']}"
        row = s["by_task"].setdefault(k, Counter())
        row["owed"] += 1
        if r.get("failed"):
            row["failed"] += 1
        elif r["bucket"] in (PASSED, NOT_JUDGED):
            row[r["bucket"]] += 1
        else:
            row["other"] += 1
    s["by_task"] = {k: dict(v) for k, v in sorted(s["by_task"].items())}
    for r in fails:
        s["failures_by_bucket"][r["bucket"]] = s["failures_by_bucket"].get(r["bucket"], 0) + 1
        key = f"{r['bucket']} · {r['category']}"
        s["categories"][key] = s["categories"].get(key, 0) + 1
        s["points_lost"][r["bucket"]] = s["points_lost"].get(r["bucket"], 0) + (r.get("points_lost") or 0)
        t = s["by_day"].setdefault(f"{r['date']} · {r['task']}", Counter())
        t[r["bucket"]] += 1
    s["by_day"] = {k: dict(v) for k, v in sorted(s["by_day"].items())}
    s["categories"] = dict(sorted(s["categories"].items(), key=lambda kv: -kv[1]))
    s["failed"] = len(fails)
    s["failed_but_excluded"] = sum(1 for r in fails if r.get("excluded"))
    s["owed"] = len(records)
    s["passed"] = sum(1 for r in records if r["bucket"] == PASSED)
    s["not_judged"] = sum(1 for r in records if r["bucket"] == NOT_JUDGED and not r.get("failed"))
    s["other"] = s["owed"] - s["failed"] - s["passed"] - s["not_judged"]
    s["ledger_not_in_roster"] = len(orphans or [])
    s["errors"] = len(errors or [])
    return s


# ── the workbook ─────────────────────────────────────────────────────────────

def build_workbook(rep: dict) -> bytes:
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    head_fill = PatternFill("solid", fgColor="C8973F")
    head_font = Font(bold=True, color="FFFFFF")
    wrap = Alignment(wrap_text=True, vertical="top")
    fills = {OURS: "FDE2E1", RULE: "FEF3C7", UNIT: "E5E7EB", UNDET: "E0E7FF",
             PASSED: "DCFCE7", NOT_JUDGED: "F3F4F6"}

    def table(ws, top, headers, rows, widths, bucket_col=None):
        for j, h in enumerate(headers, 1):
            c = ws.cell(row=top, column=j, value=h)
            c.fill, c.font = head_fill, head_font
            c.alignment = Alignment(wrap_text=True, vertical="center")
        for i, row in enumerate(rows, top + 1):
            for j, v in enumerate(row, 1):
                if isinstance(v, (list, dict)):
                    v = json.dumps(v, ensure_ascii=False) if isinstance(v, dict) else "\n".join(map(str, v))
                c = ws.cell(row=i, column=j, value=v)
                c.alignment = wrap
            if bucket_col is not None:
                b = row[bucket_col]
                col = fills.get(b)
                if col:
                    ws.cell(row=i, column=bucket_col + 1).fill = PatternFill("solid", fgColor=col)
        for j, w in enumerate(widths, 1):
            ws.column_dimensions[get_column_letter(j)].width = w
        ws.freeze_panes = ws.cell(row=top + 1, column=1)
        if rows:
            ws.auto_filter.ref = f"A{top}:{get_column_letter(len(headers))}{top + len(rows)}"

    s = rep["summary"]
    ws = wb.active
    ws.title = "Summary"
    ws["A1"] = "Automatic checklist checks — 20 and 21 September 2026"
    ws["A1"].font = Font(bold=True, size=14)
    ws["A2"] = (f"Generated {rep['generated_at']} (Tashkent). Owed verdicts: {s['owed']} · "
                f"passed {s['passed']} · failed {s['failed']} (of which on days excluded since: "
                f"{s['failed_but_excluded']}) · not judged {s['not_judged']} · other {s['other']}. "
                f"Ledger rows outside the walk: {s['ledger_not_in_roster']} (sheet «Ledger only»). "
                f"Computation errors: {s['errors']} (sheet «Errors»). "
                f"Step-by-step warning card live from {rep.get('warning_card_live_from') or '—'}; "
                f"before that the warning was one generic line.")
    r0 = 4
    ws.cell(row=r0, column=1, value="Failures by who is responsible").font = Font(bold=True)
    rows = [[BUCKET_TEXT[b], s["failures_by_bucket"].get(b, 0), s["points_lost"].get(b, 0)]
            for b in (OURS, RULE, UNIT, UNDET)]
    table(ws, r0 + 1, ["Bucket", "Failed verdicts", "Weight points lost"], rows, [70, 16, 18])
    r1 = r0 + len(rows) + 3
    ws.cell(row=r1, column=1, value="Why — every category").font = Font(bold=True)
    cat_rows = []
    for key, n in s["categories"].items():
        b, cat = key.split(" · ", 1)
        cat_rows.append([b, cat, n, CATEGORY_TEXT.get(cat, cat)])
    for j, h in enumerate(["Bucket", "Category", "Failed", "Meaning"], 1):
        c = ws.cell(row=r1 + 1, column=j, value=h)
        c.fill, c.font = head_fill, head_font
    for i, row in enumerate(cat_rows, r1 + 2):
        for j, v in enumerate(row, 1):
            ws.cell(row=i, column=j, value=v).alignment = wrap
        ws.cell(row=i, column=1).fill = PatternFill("solid", fgColor=fills.get(row[0], "FFFFFF"))
    r2 = r1 + len(cat_rows) + 4
    ws.cell(row=r2, column=1, value="Per date · shift · task").font = Font(bold=True)
    for j, h in enumerate(["Date · shift · task", "Owed", "Passed", "Failed", "Not judged",
                           "Other"], 1):
        c = ws.cell(row=r2 + 1, column=j, value=h)
        c.fill, c.font = head_fill, head_font
    for i, (k, v) in enumerate(s["by_task"].items(), r2 + 2):
        for j, val in enumerate([k, v.get("owed", 0), v.get(PASSED, 0), v.get("failed", 0),
                                 v.get(NOT_JUDGED, 0), v.get("other", 0)], 1):
            ws.cell(row=i, column=j, value=val)
    ws.column_dimensions["A"].width = 70
    ws.column_dimensions["B"].width = 34
    ws.column_dimensions["C"].width = 12
    ws.column_dimensions["D"].width = 90

    recs = rep["records"]
    fails = [r for r in recs if r.get("failed")]
    order = {OURS: 0, RULE: 1, UNDET: 2, UNIT: 3}
    fails.sort(key=lambda r: (order.get(r["bucket"], 9), r["date"], r["shift"] or 9,
                              r["unit"], r["leader"], r["task_id"]))

    def facts_line(r):
        f = r.get("facts") or {}
        return ", ".join(f"{k}={v}" for k, v in f.items())

    def now_line(r):
        n = r.get("now") or {}
        if not n:
            return ""
        f = n.get("facts") or {}
        return f"{n.get('outcome')}/{n.get('code')} " + ", ".join(f"{k}={v}" for k, v in f.items())

    ws = wb.create_sheet("Failures")
    heads = ["Bucket", "Category", "Explanation", "Evidence", "Date", "Shift", "Unit",
             "Leader", "Cell", "Task", "Hour", "Checked at", "Code", "What the check saw",
             "Same check on today's data", "Next date (shift 2)", "Weight", "Points lost",
             "Excluded since", "Warned at", "Warning kind", "Telegram claimed"]
    rows = [[r["bucket"], r["category"], r.get("explanation"), r.get("evidence") or [],
             r["date"], r["shift"], r["unit"], r["leader"], r.get("cell"), r["task"],
             r.get("hour"), r.get("checked_at"), r.get("code"), facts_line(r), now_line(r),
             (lambda n: f"{n.get('outcome')}/{n.get('code')}" if n else "")(r.get("next_date_now")),
             r.get("weight"), r.get("points_lost"), r.get("excluded"), r.get("warned_at"),
             r.get("warning"), r.get("claimed")]
            for r in fails]
    table(ws, 1, heads, rows, [12, 26, 48, 70, 11, 6, 22, 30, 7, 26, 7, 16, 14, 40, 40, 16,
                               8, 8, 9, 16, 10, 9], bucket_col=0)

    ws = wb.create_sheet("All checks")
    heads = ["Date", "Shift", "Unit", "Leader", "Cell", "Task", "Hour", "Outcome", "Code",
             "Bucket", "Category", "Checklist opened", "Warned", "Checked at", "Facts",
             "Entry reason", "Weight"]
    rows = [[r["date"], r["shift"], r["unit"], r["leader"], r.get("cell"), r["task"],
             r.get("hour"), r.get("outcome"), r.get("code"), r["bucket"], r["category"],
             r.get("checklist_opened"), r.get("warned_at"), r.get("checked_at"),
             facts_line(r), r.get("entry_reason"), r.get("weight")] for r in recs]
    table(ws, 1, heads, rows, [11, 6, 22, 30, 7, 26, 7, 9, 14, 12, 26, 9, 16, 16, 50, 26, 8],
          bucket_col=9)

    ws = wb.create_sheet("Cell register")
    seen = set()
    rows = []
    for r in recs:
        key = (r["leader_id"], r["date"], r.get("cell_id"))
        if key in seen:
            continue
        seen.add(key)
        for c in r.get("cells") or []:
            rows.append([r["date"], r["unit"], r["leader"], c.get("verifix"), c.get("sap"),
                         c.get("group"), ", ".join(c.get("problems") or []) or "ok"])
    rows.sort(key=lambda x: (x[6] == "ok", x[0], x[1], x[2]))
    table(ws, 1, ["Date", "Unit", "Leader", "Cell", "SAP code", "Group", "Problems"],
          rows, [11, 22, 30, 8, 12, 7, 70])

    ws = wb.create_sheet("SAP uploads")
    table(ws, 1, ["Date the file is for", "Uploaded at", "By", "Outcome", "Mode", "Files",
                  "Reached", "Units"],
          [[x["date"], x["at"], x["by"], x["outcome"], x["mode"], x["type"], x["targets"],
            x["units"]] for x in rep["uploads"]], [14, 17, 30, 9, 8, 10, 12, 8])

    ws = wb.create_sheet("Units")
    table(ws, 1, ["Date", "Unit", "Shift", "Factory", "Per-task", "SAP auto-fill", "Leaders",
                  "Leaders owing auto tasks", "Check hours", "Catalog WCs", "Configured WCs"],
          [[x["date"], x["unit"], x["shift"], x["factory"], x["per_task"], x["sap_auto_fill"],
            x["leaders"], x.get("leaders_owing"), json.dumps(x["hours"]),
            x["catalog_work_centres"], x["configured_work_centres"]] for x in rep["units"]],
          [11, 24, 6, 12, 9, 12, 8, 12, 30, 12, 14])

    ws = wb.create_sheet("Ledger only")
    table(ws, 1, ["Date", "Unit (at check)", "Leader", "Cell id", "Task", "Outcome", "Code",
                  "Facts"],
          [[x["date"], x.get("unit"), x.get("leader"), x.get("cell_id"),
            TASK_TEXT.get(x["task_id"], x["task_id"]), x.get("outcome"), x.get("code"),
            json.dumps(x.get("facts") or {}, ensure_ascii=False)]
           for x in rep.get("ledger_not_in_roster") or []],
          [11, 22, 30, 8, 26, 9, 14, 60])

    ws = wb.create_sheet("Errors")
    table(ws, 1, ["What could not be computed"],
          [[e] for e in rep.get("errors") or []], [140])

    ws = wb.create_sheet("How to read")
    lines = [
        "Every row is one verdict the platform owed: (leader, checklist date, cell, automatic task).",
        "«What the check saw» is the ledger's own record (leader_auto_checks.facts) — the numbers the verdict was taken on.",
        "«Same check on today's data» re-runs the check's own code now. A pass here means the data exists now.",
        "Evidence lines come from the action register: every «Odamlar soni» save, every ПЛАН/ФАКТ edit, every SAP upload, with who and when.",
        "Pins at the hour are REPLAYED from those saves; when the replay cannot reproduce today's pins the row says so.",
        "Buckets:",
    ] + [f"  {k}: {v}" for k, v in BUCKET_TEXT.items()] + ["", "Categories:"] + \
        [f"  {k}: {v}" for k, v in CATEGORY_TEXT.items()]
    for i, t in enumerate(lines, 1):
        ws.cell(row=i, column=1, value=t)
    ws.column_dimensions["A"].width = 150

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# ── delivery ─────────────────────────────────────────────────────────────────

def _clean(text: str) -> str:
    token = settings.telegram_bot_token or ""
    return text.replace(token, "***") if token else text


def _send_doc(chat_id: int, name: str, data: bytes, mime: str, caption: str) -> None:
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            r = requests.post(
                f"{_API}/bot{settings.telegram_bot_token}/sendDocument",
                data={"chat_id": chat_id, "caption": caption[:1000]},
                files={"document": (name, data, mime)}, timeout=300)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:
            last = _clean(f"{type(exc).__name__}: {exc}")
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(_clean(last or "sendDocument failed")[:300])


def _say(chat_id: int, text: str) -> None:
    """The summary message — retried like the documents, and never lets the bot
    token (which rides in the URL) reach an exception text or the journal."""
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            r = requests.post(f"{_API}/bot{settings.telegram_bot_token}/sendMessage",
                              data={"chat_id": chat_id, "text": text[:4000]}, timeout=60)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:
            last = f"{type(exc).__name__}: {exc}"
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(_clean(last or "sendMessage failed")[:300])


def summary_text(rep: dict) -> str:
    s = rep["summary"]
    fb = s["failures_by_bucket"]
    lines = [
        "Automatic checks, 20–21 Sep — the report.",
        f"Owed {s['owed']} verdicts: passed {s['passed']}, failed {s['failed']}, "
        f"not judged {s['not_judged']}, other {s['other']}.",
        "",
        "Failures by who is responsible:",
        f"  OURS (platform / register / SAP timing): {fb.get(OURS, 0)}",
        f"  RULE (data was there, still scored 0): {fb.get(RULE, 0)}",
        f"  UNIT (not entered in time): {fb.get(UNIT, 0)}",
        f"  Undetermined: {fb.get(UNDET, 0)}",
        "",
        "Biggest causes:",
    ]
    for key, n in list(s["categories"].items())[:8]:
        b, cat = key.split(" · ", 1)
        lines.append(f"  {n} × [{b}] {CATEGORY_TEXT.get(cat, cat)}")
    if s.get("failed_but_excluded"):
        lines.append(f"({s['failed_but_excluded']} failures sit on days excluded since — "
                     f"they cost nothing.)")
    if s.get("ledger_not_in_roster"):
        lines.append(f"⚠ {s['ledger_not_in_roster']} ledger verdict(s) could not be matched "
                     f"to a leader walk — sheet «Ledger only».")
    if s.get("errors"):
        lines.append(f"⚠ {s['errors']} part(s) could not be computed — sheet «Errors».")
    lines += ["", "Excel: «Failures» has one row per failed verdict with its evidence; "
                  "the JSON carries everything for re-analysis."]
    return "\n".join(lines)


def send(db: Session, chat_id: int, *_window) -> int:
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    rep = collect(db)
    db.rollback()
    xlsx = build_workbook(rep)
    blob = json.dumps(rep, ensure_ascii=False, indent=1, default=str).encode()
    _say(chat_id, summary_text(rep))
    _send_doc(chat_id, "auto-checks-20-21-sep.xlsx", xlsx,
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Automatic checks 20–21 Sep — every verdict, why it failed, and whose fault.")
    _send_doc(chat_id, "auto-checks-20-21-sep.json", blob, "application/json",
              "Same report, full data (for re-analysis).")
    return 3


_ = (or_, LeaderConcern, PPUpload, zagruzka_source, wc_group)
