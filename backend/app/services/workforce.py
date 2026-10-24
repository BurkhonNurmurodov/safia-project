"""«Tarkib» — WHO is on the brigadirs' lists: gender, age, years at Safia and
where people live (the Workers page's third tab, 2026-10-23).

The operator: «In this Workers can we have analysis of woman/man share,
workers age, experience and living place with the help of Verifix data».
Everything comes from Verifix's `core/employee$list` (its fields were read off
production by a deploy-log probe the same day: gender 100 % filled, birthday
99.7 %, hiring date 100 %, a residence `address` 97.5 % and a propiska
`legal_address` 94 % as free text, `region_name` 31 %).

**The population is the live list**: a WORKING employee (status «W») whose
Verifix org unit is a cell of the register with a brigadir — `registry` +
the `_homes` rule, so a person stands on exactly the brigadir's list /staff
reads today. Verifix keeps only today's placement, so this is a SNAPSHOT of
today, not a figure of the page's period. Which cells, and which of their
people, is the page's «Jami / Zagruzka» switch: see `registry`.

**What is kept, and what is not.** A read (`read`) keeps, per person, only
coded facts: org unit, job name, gender letter, birth MONTH («1994-07»), hiring
date, and the two places reduced to a region and a district key
(`workforce_place`) — no name, phone, document, PINFL, day of birth or street
address. It is stored as `live_verifix_reads` key «people» (`refresh`) and
re-read every `READ_EVERY_H` hours, after boot when older than that, and on an
admin's press.

**Experience is tenure at Safia**: months from the CURRENT employment's hiring
date (a re-hired person starts again). Verifix's own «Стажи сотрудников»
(career experience) was filled for 56 of 3,015 people on 2026-10-23 and is a
personal record this platform does not read.

`build` folds the stored read for one scope (plant → shift → brigadir, the
role switch) into the tab's whole payload. Nothing here writes a register row.
"""
from __future__ import annotations

import logging
import re
import statistics
import threading
import time as _time
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta, timezone
from typing import Callable, Iterable, Optional

from sqlalchemy.orm import Session

from app.services import verifix, workforce_place as wp

log = logging.getLogger(__name__)

KEY = "people"
READ_EVERY_H = 3
READ_MINUTE = 35
BOOT_DELAY_S = 240
READ_BUDGET_S = 240.0
MIN_PEOPLE = 1000            # a thinner answer is a cut read: refused
SHRINK_MAX = 0.10            # a read this much smaller than the last is refused
AGE_MIN, AGE_MAX = 14, 90    # a birth date outside reads as «not stated»

# Age bands (inclusive years) and tenure bands (months, [lo, hi)).
AGE_BANDS = (("lt20", None, 19), ("20", 20, 24), ("25", 25, 29), ("30", 30, 34), ("35", 35, 39),
             ("40", 40, 44), ("45", 45, 49), ("50", 50, 54), ("55", 55, None))
TENURE_BANDS = (("m0", 0, 1), ("m1", 1, 3), ("m3", 3, 6), ("m6", 6, 12), ("y1", 12, 24),
                ("y2", 24, 36), ("y3", 36, 60), ("y5", 60, None))
YOUNG_AGE = 25               # «25 yoshgacha» — the share printed per group
NEW_MONTHS = 12              # «1 yildan kam» — the share printed per group

_lock = threading.Lock()
_mem_lock = threading.Lock()
_mem: dict = {"at": None, "data": None}
_running = {"on": False, "since": None}


def _s(v) -> str:
    return str(v).strip() if v is not None else ""


def _dmy(raw) -> Optional[date]:
    s = _s(raw)
    m = re.match(r"(\d\d)\.(\d\d)\.(\d{4})", s) or None
    try:
        if m:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        m = re.match(r"(\d{4})-(\d\d)-(\d\d)", s)
        if m:
            return date(int(m.group(1)), int(m.group(2)), int(m.group(3)))
    except ValueError:
        return None
    return None


# ── the read ──────────────────────────────────────────────────────────────────

def _person(e: dict, jobs: dict) -> Optional[tuple[str, dict, tuple, tuple, str, str]]:
    """One working employee → (id, coded facts, live place, propiska place,
    address text, legal text). The two texts are used by `read` to name the
    generic districts and are never stored."""
    eid = _s(e.get("employee_id"))
    if not eid or (_s(e.get("status")) or "W") != "W":
        return None
    born = _dmy(e.get("birthday"))
    hired = _dmy(e.get("hiring_date"))
    g = _s(e.get("gender")).upper()
    addr, legal = _s(e.get("address")), _s(e.get("legal_address"))
    facts = {
        "u": _s(e.get("org_unit_id")) or None,
        "j": jobs.get(_s(e.get("job_id"))) or "",
        "g": g if g in ("M", "F") else None,
        "b": born.strftime("%Y-%m") if born else None,
        "h": hired.isoformat() if hired else None,
    }
    live = wp.place(addr, _s(e.get("region_name")) or None)
    prop = wp.place(legal)
    return eid, facts, live, prop, addr, legal


def read(cfg: dict) -> dict:
    """Divisions (their codes), jobs and every WORKING employee, read side by
    side; each person reduced to `_person`'s coded facts. Raises on a failed
    or cut read — never half an answer."""
    from app.services.verifix_live import _side_by_side
    deadline = _time.monotonic() + READ_BUDGET_S

    def pages(cl, path, body):
        for page in verifix.each_page(cl, path, body, limit=verifix.LIMIT_LIST, deadline=deadline):
            yield page or []

    def read_divs(cl):
        out = {}
        for page in pages(cl, "core/division$list", {"division_ids": []}):
            for d in page:
                did, code = _s(d.get("division_id")), _s(d.get("code"))
                if did and code:
                    out[did] = verifix._code_key(code)
        return out

    def read_jobs(cl):
        out = {}
        for page in pages(cl, "core/job$list", {"job_ids": []}):
            for j in page:
                jid = _s(j.get("job_id"))
                if jid:
                    out[jid] = _s(j.get("name"))
        return out

    def read_emps(cl):
        rows = []
        for page in pages(cl, "core/employee$list", {"employee_ids": [], "statuses": ["W"], "npins": []}):
            rows.extend(x for x in page if isinstance(x, dict))
        return rows

    divs, jobs, raw = _side_by_side(cfg, read_divs, read_jobs, read_emps)
    people = [p for p in (_person(e, jobs) for e in raw) if p]
    if len(people) < MIN_PEOPLE:
        raise verifix.VerifixError("thin", f"only {len(people)} working employees")

    # Generic districts are named by the spelling most people typed, and a
    # Russian adjective joins its Uzbek spelling — over the whole read at once.
    rows = [p[2] for p in people] + [p[3] for p in people]
    resolved = wp.canon(rows)
    labels: dict[str, Counter] = defaultdict(Counter)
    emps: dict[str, dict] = {}
    n = len(people)
    stats = Counter()
    for i, (eid, facts, live, prop, addr, legal) in enumerate(people):
        (lr, ld), (pr, pd) = resolved[i], resolved[n + i]
        for dist, text in ((ld, addr), (pd, legal)):
            if dist and dist.startswith("x:"):
                lab = wp.generic_label(text, dist[2:])
                if lab:
                    labels[dist][lab] += 1
        facts.update(lr=lr, ld=ld, pr=pr, pd=pd)
        emps[eid] = facts
        stats["people"] += 1
        stats["address"] += bool(addr)
        stats["legal"] += bool(legal)
        stats["live_region"] += bool(lr)
        stats["live_district"] += bool(ld)
        stats["prop_region"] += bool(pr)
        stats["prop_district"] += bool(pd)
        stats["gender"] += bool(facts["g"])
        stats["born"] += bool(facts["b"])
        stats["hired"] += bool(facts["h"])
    names = {k: c.most_common(1)[0][0] for k, c in labels.items()}
    for k in {f.get(x) for f in emps.values() for x in ("ld", "pd")}:
        if k and k.startswith("x:") and k not in names:
            names[k] = k[2:].capitalize()
    return {"divs": divs, "emps": emps, "names": names, "stats": dict(stats), "v": 1}


def stored(db: Session) -> tuple[Optional[dict], Optional[datetime], Optional[str], Optional[datetime]]:
    """(data, read_at, last error, error_at) — decoded once per read."""
    from app.models import LiveVerifixRead
    row = (db.query(LiveVerifixRead.read_at, LiveVerifixRead.error, LiveVerifixRead.error_at)
           .filter(LiveVerifixRead.key == KEY).first())
    if row is None:
        return None, None, None, None
    at, err, err_at = row
    with _mem_lock:
        if at is not None and _mem["at"] == at and _mem["data"] is not None:
            return _mem["data"], at, err, err_at
    data = (db.query(LiveVerifixRead.data).filter(LiveVerifixRead.key == KEY).scalar()) or None
    if not data or not data.get("emps"):
        return None, None, err, err_at
    with _mem_lock:
        _mem.update(at=at, data=data)
    return data, at, err, err_at


def running() -> bool:
    return bool(_running["on"])


def refresh(db: Session, trigger: str, force: bool = False) -> dict:
    """Read Verifix and store the answer when the stored one is older than
    `READ_EVERY_H` (or `force`). One read at a time per process; a failed read
    keeps the stored one and records why. Never raises."""
    from sqlalchemy.dialects.postgresql import insert as pg_insert
    from app.models import LiveVerifixRead
    from app.services import action_log
    data, at, _, _ = stored(db)
    if data and at and not force and \
            datetime.now(timezone.utc) - at < timedelta(hours=READ_EVERY_H) - timedelta(minutes=5):
        return {"started": False, "reason": "fresh"}
    cfg = verifix.config(db, with_password=True)
    if not (cfg.get("login") and cfg.get("password") and cfg.get("filial_id")):
        return {"started": False, "reason": "not_configured"}
    if not _lock.acquire(blocking=False):
        return {"started": False, "reason": "busy"}
    _running.update(on=True, since=datetime.now(timezone.utc))
    try:
        db.rollback()
        t0 = _time.monotonic()
        try:
            new = read(cfg)
            was = len((data or {}).get("emps") or {})
            if was and len(new["emps"]) < was * (1 - SHRINK_MAX):
                raise verifix.VerifixError("shrunk", f"{was} → {len(new['emps'])} people")
        except Exception as exc:  # noqa: BLE001 — recorded; the stored read serves
            db.rollback()
            db.execute(pg_insert(LiveVerifixRead).values(key=KEY, data={})
                       .on_conflict_do_nothing(index_elements=["key"]))
            row = db.query(LiveVerifixRead).filter(LiveVerifixRead.key == KEY).with_for_update().first()
            row.error = (f"{getattr(exc, 'code', type(exc).__name__)}: "
                         f"{getattr(exc, 'message', '') or exc}")[:300]
            row.error_at = datetime.now(timezone.utc)
            db.commit()
            log.warning("workforce: the read failed (%s)", row.error)
            return {"started": True, "ok": False, "error": getattr(exc, "code", "error")}
        db.execute(pg_insert(LiveVerifixRead).values(key=KEY, data={})
                   .on_conflict_do_nothing(index_elements=["key"]))
        row = db.query(LiveVerifixRead).filter(LiveVerifixRead.key == KEY).with_for_update().first()
        row.data, row.read_at = new, datetime.now(timezone.utc)
        row.ms, row.error, row.error_at = int((_time.monotonic() - t0) * 1000), None, None
        db.commit()
        st = new.get("stats") or {}
        action_log.record_system("sync_export", "sync.workforce_read", db=None, details=[
            ("trigger", trigger), ("people", st.get("people", 0)),
            ("live_district", st.get("live_district", 0)), ("ms", row.ms),
        ])
        return {"started": True, "ok": True, "people": st.get("people", 0)}
    finally:
        _running.update(on=False, since=None)
        _lock.release()


def _job(trigger: str, force: bool = False) -> None:
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        refresh(db, trigger, force=force)
    except Exception:  # noqa: BLE001 — a background read reports, never dies loud
        log.exception("workforce: the %s read failed", trigger)
    finally:
        db.close()


def start_read(trigger: str) -> bool:
    """The admin's «Verifix'dan yangilash»: a forced read on a thread of its own."""
    if _lock.locked():
        return False
    threading.Thread(target=_job, args=(trigger, True), name="workforce-read", daemon=True).start()
    return True


def register_jobs() -> None:
    """Every `READ_EVERY_H` hours at :35 and a catch-up read after boot when
    the stored one is older than that. Mirrored in passenger_wsgi.py."""
    try:
        from apscheduler.triggers.cron import CronTrigger
        from app.scheduler import SCHEDULER_TZ, get_scheduler, schedule_at
        get_scheduler().add_job(_job, args=("schedule",),
                                trigger=CronTrigger(hour=f"*/{READ_EVERY_H}", minute=READ_MINUTE,
                                                    timezone=SCHEDULER_TZ),
                                id="workforce-read", replace_existing=True)
        schedule_at("workforce-boot", datetime.now(timezone.utc) + timedelta(seconds=BOOT_DELAY_S),
                    _job, args=("boot",))
        log.info("workforce: jobs registered (every %d h at :%02d)", READ_EVERY_H, READ_MINUTE)
    except Exception:  # noqa: BLE001
        log.exception("workforce: could not register the jobs")


# ── which cells the tab stands on ─────────────────────────────────────────────

def registry(db: Session, *, in_load_only: bool) -> tuple[dict, dict]:
    """The tab's cells and units, per the «Jami / Zagruzka» switch (the
    operator, 2026-10-24: «when Total is selected, just show all cells and all
    people; when Workload is selected, show all people who get counted in
    Zagruzka»).

    `in_load_only` is «Zagruzka»: the cells counted in the загрузка, through
    `verifix_live._registry` — the ONE definition of that set, never re-spelled
    here. Otherwise «Jami»: the SAME query without the `in_load` clause, so
    every cell of the register with a code joins and the whole is always a
    SUPERSET of the workload half (the switch may only ever widen, or one
    brigadir's row would read higher under «Jami» than under «Zagruzka»).

    The units map is `_registry`'s own either way, and so is the shape, so
    `build` cannot tell the two apart."""
    from app.models import Cell, Manager
    from app.services import verifix_live
    if in_load_only:
        return verifix_live._registry(db)
    cells = {}
    for cid, code, mid in db.query(Cell.id, Cell.verifix_code, Cell.manager_id).all():
        if code:
            cells[verifix._code_key(code)] = {"id": cid, "code": code, "manager_id": mid}
    units = {m.id: {"name": m.name, "shift": m.shift}
             for m in db.query(Manager).filter(Manager.archived.is_(False)).all()}
    return cells, units


# ── the fold ──────────────────────────────────────────────────────────────────

def age_of(born: Optional[str], today: date) -> Optional[int]:
    """Whole years from a birth MONTH («1994-07»), the birthday read as the
    15th — exact but for the person's own birth month."""
    if not born:
        return None
    try:
        y, m = int(born[:4]), int(born[5:7])
    except (TypeError, ValueError):
        return None
    a = today.year - y - (1 if (today.month, today.day) < (m, 15) else 0)
    return a if AGE_MIN <= a <= AGE_MAX else None


def tenure_of(hired: Optional[str], today: date) -> Optional[int]:
    """Whole months from the hiring date to today (0 for a hire this month)."""
    d = _dmy(hired) if hired else None
    if not d or d > today:
        return None if not d else 0
    months = (today.year - d.year) * 12 + (today.month - d.month) - (1 if today.day < d.day else 0)
    return max(0, months)


def _band(value: Optional[int], bands) -> Optional[str]:
    if value is None:
        return None
    for key, lo, hi in bands:
        if (lo is None or value >= lo) and (hi is None or (value <= hi if bands is AGE_BANDS else value < hi)):
            return key
    return None


class _Acc:
    """One group's running figures — the whole scope, a unit, a job or a cell."""
    __slots__ = ("n", "g", "ages", "tenures", "live", "young", "new_")

    def __init__(self):
        self.n = 0
        self.g = Counter()
        self.ages: list[int] = []
        self.tenures: list[int] = []
        self.live = Counter()
        self.young = 0
        self.new_ = 0

    def add(self, g, age, ten, district):
        self.n += 1
        self.g[g or "none"] += 1
        if age is not None:
            self.ages.append(age)
            self.young += age < YOUNG_AGE
        if ten is not None:
            self.tenures.append(ten)
            self.new_ += ten < NEW_MONTHS
        if district:
            self.live[district] += 1

    def row(self) -> dict:
        top = self.live.most_common(1)
        return {
            "n": self.n, "men": self.g["M"], "women": self.g["F"], "gnone": self.g["none"],
            "age_known": len(self.ages),
            "age_mean": round(statistics.fmean(self.ages), 1) if self.ages else None,
            "age_median": round(statistics.median(self.ages), 1) if self.ages else None,
            "young": self.young,
            "ten_known": len(self.tenures),
            "ten_median": round(statistics.median(self.tenures), 1) if self.tenures else None,
            "new": self.new_,
            "place_known": sum(self.live.values()),
            "top_place": top[0][0] if top else None, "top_place_n": top[0][1] if top else 0,
        }


def build(data: Optional[dict], cells: dict, units: dict, allowed: Optional[Iterable[int]],
          shift: Optional[int], role_ok: Callable[[str], bool], today: date) -> dict:
    """The tab's payload for one scope. `cells` / `units` are
    `verifix_live._registry`'s (code key → cell, unit id → {name, shift});
    `allowed` the units the viewer's scope reaches (None = all); `role_ok`
    the role switch's test on a job name."""
    allowed_set = set(allowed) if allowed is not None else None
    whole = _Acc()
    by_unit: dict[int, _Acc] = defaultdict(_Acc)
    by_job: dict[str, _Acc] = defaultdict(_Acc)
    by_cell: dict[str, _Acc] = defaultdict(_Acc)
    age_bands: dict[str, Counter] = defaultdict(Counter)
    ten_bands: dict[str, Counter] = defaultdict(Counter)
    cell_unit: dict[str, int] = {}
    places = {"live": {"region": Counter(), "district": Counter()},
              "prop": {"region": Counter(), "district": Counter()}}
    dist_region: dict[str, Counter] = defaultdict(Counter)
    off_list = 0
    if data:
        divs = data.get("divs") or {}
        for e in (data.get("emps") or {}).values():
            code = divs.get(e.get("u") or "")
            cell = cells.get(code) if code else None
            mid = cell.get("manager_id") if cell else None
            if not mid or mid not in units:
                off_list += 1
                continue
            if shift and units[mid].get("shift") != shift:
                continue
            if allowed_set is not None and mid not in allowed_set:
                continue
            if not role_ok(e.get("j") or ""):
                continue
            g = e.get("g")
            age = age_of(e.get("b"), today)
            ten = tenure_of(e.get("h"), today)
            ld = e.get("ld")
            for acc in (whole, by_unit[mid], by_job[e.get("j") or ""], by_cell[cell["code"]]):
                acc.add(g, age, ten, ld)
            cell_unit[cell["code"]] = mid
            age_bands[_band(age, AGE_BANDS) or "none"][g or "none"] += 1
            ten_bands[_band(ten, TENURE_BANDS) or "none"][g or "none"] += 1
            for side, (r, d) in (("live", (e.get("lr"), ld)), ("prop", (e.get("pr"), e.get("pd")))):
                places[side]["region"][r or "none"] += 1
                places[side]["district"][d or "none"] += 1
                if d and r:
                    dist_region[d][r] += 1

    def bands_out(src, spec):
        out = [{"key": k, "M": src[k]["M"], "F": src[k]["F"], "none": src[k]["none"],
                "n": sum(src[k].values())} for k, _, _ in spec]
        miss = src["none"]
        return out, sum(miss.values())

    ages_out, age_unknown = bands_out(age_bands, AGE_BANDS)
    ten_out, ten_unknown = bands_out(ten_bands, TENURE_BANDS)
    names = (data or {}).get("names") or {}

    def label(dkey: str) -> str:
        if dkey.startswith("g:"):
            return wp.GAZ_NAME.get(dkey[2:], dkey[2:])
        return names.get(dkey, dkey[2:].capitalize())

    def place_out(side: str) -> dict:
        reg, dist = places[side]["region"], places[side]["district"]
        regions = [{"key": k, "n": v} for k, v in reg.most_common() if k != "none"]
        districts = [{"key": k, "label": label(k), "n": v,
                      "region": (wp.GAZ_REGION.get(k[2:]) if k.startswith("g:")
                                 else (dist_region[k].most_common(1)[0][0] if dist_region[k] else None))}
                     for k, v in dist.most_common() if k != "none"]
        return {"regions": regions, "districts": districts,
                "region_unknown": reg.get("none", 0), "district_unknown": dist.get("none", 0)}

    def rows(groups: dict, key_fn, label_fn, unit_fn=None) -> list[dict]:
        out = []
        for k, acc in groups.items():
            r = acc.row()
            r["key"] = key_fn(k)
            r["label"] = label_fn(k)
            if unit_fn:
                r["unit"] = unit_fn(k)
            if r["top_place"]:
                r["top_place_label"] = label(r["top_place"])
            out.append(r)
        out.sort(key=lambda r: (-r["n"], str(r["label"])))
        return out

    w = whole.row()
    return {
        "total": whole.n,
        "summary": {**w, "top_place_label": label(w["top_place"]) if w["top_place"] else None},
        "gender": {"M": whole.g["M"], "F": whole.g["F"], "none": whole.g["none"]},
        "age": {"bands": ages_out, "unknown": age_unknown},
        "tenure": {"bands": ten_out, "unknown": ten_unknown},
        "place": {"live": place_out("live"), "prop": place_out("prop")},
        "groups": {
            "unit": rows(by_unit, lambda m: m, lambda m: units[m].get("name") or f"#{m}"),
            "job": rows(by_job, lambda j: j or "—", lambda j: j or ""),
            "cell": rows(by_cell, lambda c: c, lambda c: c, lambda c: cell_unit.get(c)),
        },
        "unit_shift": {m: units[m].get("shift") for m in by_unit},
        "off_list": off_list if allowed_set is None and not shift else None,
        "bands": {"age": [k for k, _, _ in AGE_BANDS], "tenure": [k for k, _, _ in TENURE_BANDS],
                  "young": YOUNG_AGE, "new_months": NEW_MONTHS},
    }
