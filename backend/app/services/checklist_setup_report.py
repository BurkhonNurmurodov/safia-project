"""The leader checklist AS PRODUCTION RUNS IT, delivered once to the operator.

The operator asked, on 2026-09-17, for the platform's own record of the
checklist before the new rules go to every unit: on which units a window or a
date rule was changed, which tasks each unit and each leader has switched, what
the leaders actually file and when, and a sample of the last days' proofs to
try the new AI texts on. This platform has no shell, so the answer is a boot
job like every other one-off in `startup.py`.

It READS and never writes. Three kinds of file go to the operator's chat:

  checklist-setup.zip         setup.json — every level of the task chain as
                              stored, the chain RESOLVED per unit and per leader
                              by the platform's own resolvers, the unit
                              switches, the org, production readiness for the
                              #1/#9 checks, concerns for #8, and 14 days of
                              filing times, camera shots and AI verdicts —
                              plus examples/ (every example photo, every level)
  checklist-proofs-N.zip      a sample of the last days' proof photos per
                              (shift, task), cut into parts under Telegram's
                              50 MB limit and sent as each part fills
  checklist-proofs-index.zip  proofs.json — which photo is which proof, in
                              which part, with the verdict the current texts
                              gave it

Nothing here may stop a boot: the job runs on the scheduler, every section
catches its own failure and records it in the file instead.

Delete this module together with `startup.report_checklist_setup`,
`startup._checklist_setup_job` and the call in BOTH entrypoints once the
answers have landed — a call left behind imports a deleted module at boot.
"""
import json
import logging
import os
import shutil
import tempfile
import zipfile
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import requests
from sqlalchemy import LargeBinary, func
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AppSetting, Cell, Factory, LeaderAiReview, LeaderConcern, LeaderCutoff,
    LeaderDayExclusion, LeaderTaskDay, LeaderTaskDef, LeaderTaskEntry,
    LeaderTaskExample, LeaderTaskLeaderSetting, LeaderTaskMedia,
    LeaderTaskOverride, LeaderTaskPhoto, LeaderTaskSetting, LeaderUnitSetting,
    Manager, PPDaily, PPDaySetting, PPLineDaily, PPManagerSetting, PPProduct,
    PPUpload, PPWorkCenter, PPWorkCenterDaily, RoleProfile,
)

log = logging.getLogger(__name__)

TZ = timezone(timedelta(hours=5))   # the plant's wall clock
HISTORY_DAYS = 14                   # filing times, verdicts, concerns, pins
PROOF_DAYS = 3                      # the proof sample: the last N finished days
# The tasks the AI will keep judging under the new rules; #1, #8 and #9 become
# automatic checks and need no photos.
AI_TASKS = (2, 3, 4, 5, 6, 7, 10, 11, 12, 13)
PER_GROUP = 25                      # proofs per (shift, task)
FLAGGED_MAX = 10                    # of which, at most, already rejected
PART_BYTES = 40 * 1024 * 1024       # sendDocument refuses above 50 MB
TEXT_MAX = 300                      # free text is cut, never dropped


# ── plain values ─────────────────────────────────────────────────────────────

def _plain(v):
    """A JSON-safe copy: instants on the plant's clock, sets sorted, bytes gone."""
    if isinstance(v, datetime):
        return (v.astimezone(TZ) if v.tzinfo else v).isoformat(timespec="seconds")
    if isinstance(v, date):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return None
    if isinstance(v, dict):
        return {str(k): _plain(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_plain(x) for x in v]
    if isinstance(v, (set, frozenset)):
        return sorted((_plain(x) for x in v), key=str)
    return v


def _cut(v):
    return v[:TEXT_MAX] if isinstance(v, str) else v


def _rows(items, cls, drop=()) -> list[dict]:
    """Every mapped column of every row, read by ATTRIBUTE — so a column the
    model renames is never mis-read — minus binary columns and `drop`."""
    keys = [a.key for a in sa_inspect(cls).column_attrs
            if a.key not in drop and not isinstance(a.columns[0].type, LargeBinary)]
    return [{k: _plain(getattr(r, k)) for k in keys} for r in items]


def _section(db: Session, out: dict, name: str, build) -> None:
    """One section of the report; a failure is written into the file."""
    try:
        out[name] = build()
    except Exception as exc:
        db.rollback()
        log.warning("checklist setup report: section %s failed", name, exc_info=True)
        out[name] = {"error": f"{type(exc).__name__}: {exc}"[:TEXT_MAX]}


# ── the setup ────────────────────────────────────────────────────────────────

def collect_setup(db: Session) -> tuple[dict, list[tuple[str, bytes]]]:
    """setup.json as a dict, and the example photos as (zip path, bytes)."""
    from app.services import leader_ai, leader_cells
    from app.services import leader_tasks as lt

    now = datetime.now(TZ)
    today = now.date()
    since = today - timedelta(days=HISTORY_DAYS)
    since_at = datetime.combine(since, time.min, tzinfo=TZ)
    out: dict = {
        "generated_at": _plain(now),
        "today": today.isoformat(),
        "history_from": since.isoformat(),
        "proof_tasks": list(AI_TASKS),
    }
    examples: list[tuple[str, bytes]] = []

    def constants():
        from app import version
        rows = (db.query(AppSetting)
                .filter(AppSetting.key.like("cell_hours%")
                        | AppSetting.key.like("leader_ai%"))
                .all())
        return {
            "app_version": getattr(version, "APP_VERSION", None),
            "shift_window": getattr(leader_ai, "SHIFT_WINDOW", None),
            "auto_from": getattr(leader_ai, "AUTO_FROM", None),
            "auto_shifts": getattr(leader_ai, "AUTO_SHIFTS", None),
            "review_paused_shifts": getattr(leader_ai, "REVIEW_PAUSED_SHIFTS", None),
            "camera_is_pilot": getattr(lt, "CAMERA_IS_PILOT", None),
            "shift2_start_hour": getattr(lt, "SHIFT2_START_HOUR", None),
            "filing_deadline": {s: lt.deadline_hhmm(s) for s in (1, 2)},
            "effective_date": {s: lt.effective_date(s) for s in (1, 2)},
            "app_settings": {r.key: _cut(r.value) for r in rows},
        }
    _section(db, out, "constants", lambda: _plain(constants()))

    managers = db.query(Manager).order_by(Manager.id).all()
    unit_by_id = {m.id: m for m in managers}
    live = [m for m in managers if not m.archived]
    leaders = (db.query(RoleProfile).filter(RoleProfile.role == "leader")
               .order_by(RoleProfile.id).all())
    in_unit = [p for p in leaders if p.manager_id]

    def org():
        return {
            "factories": _rows(db.query(Factory).all(), Factory),
            "units": _rows(managers, Manager),
            "leaders": _rows(leaders, RoleProfile),
            "cells": _rows(db.query(Cell).order_by(Cell.id).all(), Cell,
                           drop=("name_workshop_uz", "name_workshop_uz_cyrl",
                                 "name_workshop_ru", "name_workshop_en")),
            "cutoffs": _rows(db.query(LeaderCutoff).all(), LeaderCutoff),
            "day_exclusions": _rows(
                db.query(LeaderDayExclusion)
                .filter(LeaderDayExclusion.date >= since.isoformat()).all(),
                LeaderDayExclusion),
        }
    _section(db, out, "org", org)

    def config():
        defs = lt.ensure_task_defs(db)
        overrides = lt.leader_overrides(db, [p.id for p in in_unit])
        unit_resolved = {m.id: lt.effective_settings(db, m.id, day=None) for m in live}
        return _plain({
            "note": ("global = leader_task_defs; unit_rows = leader_task_settings "
                     "(per unit); leader_rows = leader_task_leader_settings (per "
                     "leader). NULL at a level = inherit. unit_resolved and "
                     "ownership are the admin page's own resolution."),
            "global": _rows(defs, LeaderTaskDef),
            "unit_rows": _rows(
                db.query(LeaderTaskSetting)
                .order_by(LeaderTaskSetting.manager_id, LeaderTaskSetting.task_id).all(),
                LeaderTaskSetting),
            "leader_rows": _rows(
                db.query(LeaderTaskLeaderSetting)
                .order_by(LeaderTaskLeaderSetting.leader_id,
                          LeaderTaskLeaderSetting.task_id).all(),
                LeaderTaskLeaderSetting),
            "unit_switches": {
                "rows": _rows(db.query(LeaderUnitSetting).all(), LeaderUnitSetting),
                "per_task_units": sorted(lt.per_task_units(db)),
                "bot_from": lt.unit_bot_from_map(db),
                "cell_from": leader_cells.floors(db),
            },
            "unit_resolved": unit_resolved,
            "leader_overrides_resolved": overrides,
            "ownership": lt.config_ownership(defs, live, in_unit, unit_resolved, overrides),
        })
    _section(db, out, "config", config)

    def per_leader():
        res = {}
        for p in in_unit:
            unit = unit_by_id.get(p.manager_id)
            if unit is None or unit.archived:
                continue
            try:
                res[p.id] = _plain({
                    "leader": p.name,
                    "manager_id": p.manager_id,
                    "shift": unit.shift,
                    "effective": lt.effective_leader_config(db, p, shift=unit.shift),
                    "requirements": lt.requirements_for(db, prof=p),
                })
            except Exception as exc:
                db.rollback()
                res[p.id] = {"leader": p.name, "error": f"{type(exc).__name__}: {exc}"[:TEXT_MAX]}
        return res
    _section(db, out, "resolved_per_leader", per_leader)

    def example_photos():
        meta = []
        for e in db.query(LeaderTaskExample).order_by(LeaderTaskExample.id).all():
            level = (f"leader{e.leader_id}" if e.leader_id
                     else f"unit{e.manager_id}" if e.manager_id else "global")
            ext = "png" if "png" in (e.mime or "") else "jpg"
            name = f"examples/t{e.task_id:02d}_{level}_{e.id}.{ext}"
            examples.append((name, bytes(e.data or b"")))
            meta.append({**_rows([e], LeaderTaskExample)[0], "level": level, "file": name})
        return meta
    _section(db, out, "examples", example_photos)

    def production():
        catalog = dict(db.query(PPProduct.manager_id, func.count(PPProduct.id))
                       .group_by(PPProduct.manager_id).all())
        uploads = (db.query(PPUpload.id, PPUpload.manager_id, PPUpload.date,
                            PPUpload.file_type, PPUpload.filename,
                            PPUpload.row_count, PPUpload.uploaded_at)
                   .filter(PPUpload.date >= today - timedelta(days=30))
                   .order_by(PPUpload.uploaded_at).all())
        presence = (db.query(PPDaily.manager_id, PPDaily.date,
                             func.count(PPDaily.id),
                             func.count(PPDaily.id).filter(PPDaily.plan_qty > 0),
                             func.count(PPDaily.id).filter(PPDaily.actual_qty > 0),
                             func.max(PPDaily.updated_at))
                    .filter(PPDaily.date >= since)
                    .group_by(PPDaily.manager_id, PPDaily.date).all())
        return {
            "note": ("uploads: when each SAP file landed against the date it "
                     "describes. people_pins / line_overrides / daily_overrides: "
                     "what was TYPED, with its last update time."),
            "catalog_lines": {str(k): v for k, v in catalog.items()},
            "work_centers": _rows(db.query(PPWorkCenter).all(), PPWorkCenter),
            "autofill": _rows(db.query(PPManagerSetting).all(), PPManagerSetting),
            "uploads": [_plain({"id": u[0], "manager_id": u[1], "date": u[2],
                                "file_type": u[3], "filename": u[4],
                                "row_count": u[5], "uploaded_at": u[6]})
                        for u in uploads],
            "daily_presence": [_plain({"manager_id": r[0], "date": r[1], "rows": r[2],
                                       "plan_rows": r[3], "fact_rows": r[4],
                                       "last_update": r[5]})
                               for r in presence],
            "people_pins": _rows(db.query(PPWorkCenterDaily)
                                 .filter(PPWorkCenterDaily.date >= since).all(),
                                 PPWorkCenterDaily),
            "line_overrides": _rows(db.query(PPLineDaily)
                                    .filter(PPLineDaily.date >= since).all(),
                                    PPLineDaily),
            "daily_overrides": _rows(db.query(PPDaily)
                                     .filter(PPDaily.date >= since,
                                             PPDaily.plan_override.isnot(None)
                                             | PPDaily.actual_override.isnot(None))
                                     .all(), PPDaily),
            "day_settings": _rows(db.query(PPDaySetting)
                                  .filter(PPDaySetting.date >= since).all(),
                                  PPDaySetting),
        }
    _section(db, out, "production", production)

    def concerns():
        items = (db.query(LeaderConcern)
                 .filter(LeaderConcern.created_at >= since_at)
                 .order_by(LeaderConcern.created_at).all())
        rows = _rows(items, LeaderConcern,
                     drop=("concern_text", "solution", "worker_name"))
        for row, c in zip(rows, items):
            row["worker_filed"] = bool(c.worker_name)
        return rows
    _section(db, out, "concerns", concerns)

    def filing():
        days = (db.query(LeaderTaskDay)
                .filter(LeaderTaskDay.date >= since.isoformat()).all())
        ids = [d.id for d in days]
        entries = (db.query(LeaderTaskEntry)
                   .filter(LeaderTaskEntry.day_id.in_(ids)).all()) if ids else []
        shots = (db.query(LeaderTaskPhoto)
                 .filter(LeaderTaskPhoto.day_id.in_(ids)).all()) if ids else []
        media_n = dict(db.query(LeaderTaskMedia.entry_id, func.count(LeaderTaskMedia.id))
                       .join(LeaderTaskEntry, LeaderTaskEntry.id == LeaderTaskMedia.entry_id)
                       .join(LeaderTaskDay, LeaderTaskDay.id == LeaderTaskEntry.day_id)
                       .filter(LeaderTaskDay.date >= since.isoformat())
                       .group_by(LeaderTaskMedia.entry_id).all())
        entry_rows = _rows(entries, LeaderTaskEntry)
        for row in entry_rows:
            row["reason"] = _cut(row.get("reason"))
            row["photos"] = media_n.get(row["id"], 0)
        return {
            "days": _rows(days, LeaderTaskDay),
            "entries": entry_rows,
            "camera_shots": _rows(shots, LeaderTaskPhoto,
                                  drop=("file_id", "message_id", "client_key")),
            "manual_rulings": _rows(
                db.query(LeaderTaskOverride)
                .filter(LeaderTaskOverride.date >= since.isoformat()).all(),
                LeaderTaskOverride),
        }
    _section(db, out, "filing", filing)

    def ai_reviews():
        items = (db.query(LeaderAiReview)
                 .filter(LeaderAiReview.date >= since.isoformat()).all())
        rows = _rows(items, LeaderAiReview, drop=("reason_uz_cyrl", "reason_ru"))
        for row in rows:
            for k in ("reason_uz", "reason_en", "error", "resolution_note"):
                row[k] = _cut(row.get(k))
        return rows
    _section(db, out, "ai_reviews", ai_reviews)

    return out, examples


# ── the proof sample ─────────────────────────────────────────────────────────

def _round_robin(items: list[dict], n: int) -> list[dict]:
    """Up to `n` items, one unit at a time, so no unit fills the sample."""
    buckets: dict = {}
    for it in items:
        buckets.setdefault(it["manager_id"], []).append(it)
    queues = list(buckets.values())
    picked: list[dict] = []
    while len(picked) < n and any(queues):
        for q in queues:
            if q and len(picked) < n:
                picked.append(q.pop(0))
    return picked


def pick_proofs(db: Session, today: date) -> tuple[list[dict], list[dict]]:
    """The sample as plain dicts (nothing on it touches the session again),
    and the counts it was drawn from."""
    days = [(today - timedelta(days=k)).isoformat() for k in range(PROOF_DAYS, 0, -1)]
    shift_of = dict(db.query(Manager.id, Manager.shift).all())
    unit_name = dict(db.query(Manager.id, Manager.name).all())
    leader_name = dict(db.query(RoleProfile.id, RoleProfile.name).all())
    cell_code = dict(db.query(Cell.id, Cell.verifix_code).all())

    pairs = (db.query(LeaderTaskEntry, LeaderTaskDay)
             .join(LeaderTaskDay, LeaderTaskDay.id == LeaderTaskEntry.day_id)
             .filter(LeaderTaskDay.date.in_(days),
                     LeaderTaskEntry.task_id.in_(AI_TASKS),
                     LeaderTaskEntry.done.is_(True))
             .all())
    ids = [e.id for e, _ in pairs]
    media: dict[int, list[dict]] = {}
    if ids:
        for m in (db.query(LeaderTaskMedia).filter(LeaderTaskMedia.entry_id.in_(ids))
                  .order_by(LeaderTaskMedia.entry_id, LeaderTaskMedia.pos).all()):
            media.setdefault(m.entry_id, []).append({"pos": m.pos, "file_id": m.file_id})
    reviews: dict[int, dict] = {}
    if ids:
        by_ref = {f"bot:{i}": i for i in ids}
        for r in db.query(LeaderAiReview).filter(LeaderAiReview.ref.in_(list(by_ref))).all():
            reviews[by_ref[r.ref]] = {
                "status": r.status, "flags": _plain(r.flags), "clocks": _plain(r.clocks),
                "image_date": r.image_date, "reason_en": _cut(r.reason_en),
                "reason_uz": _cut(r.reason_uz), "resolution": r.resolution,
                "model": r.model, "reviewed_at": _plain(r.reviewed_at),
            }
    shots: dict[tuple, list[dict]] = {}
    day_ids = list({d.id for _, d in pairs})
    if day_ids:
        for s in (db.query(LeaderTaskPhoto).filter(LeaderTaskPhoto.day_id.in_(day_ids))
                  .order_by(LeaderTaskPhoto.slot).all()):
            shots.setdefault((s.day_id, s.task_id), []).append(_plain(
                {"slot": s.slot, "captured_at": s.captured_at, "late": s.late,
                 "deferred": s.deferred, "stamp": s.stamp}))

    groups: dict[tuple, list[dict]] = {}
    for e, d in pairs:
        if not media.get(e.id):
            continue
        shift = shift_of.get(d.manager_id)
        groups.setdefault((shift, e.task_id), []).append({
            "entry_id": e.id, "day_id": d.id, "date": d.date, "shift": shift,
            "manager_id": d.manager_id, "unit": unit_name.get(d.manager_id),
            "leader_id": d.leader_id, "leader": leader_name.get(d.leader_id),
            "cell_id": d.cell_id, "cell_code": cell_code.get(d.cell_id),
            "task_id": e.task_id, "saved_at": _plain(e.saved_at),
            "closed_at": _plain(e.closed_at), "day_closed_at": _plain(d.closed_at),
            "photos": media[e.id],
            "camera_shots": shots.get((d.id, e.task_id), []),
            "ai": reviews.get(e.id),
        })

    picked: list[dict] = []
    stats: list[dict] = []
    for (shift, task), items in sorted(groups.items(), key=lambda kv: (kv[0][0] or 0, kv[0][1])):
        items.sort(key=lambda it: (it["manager_id"] or 0, it["date"], it["leader_id"] or 0, it["entry_id"]))
        flagged = [it for it in items if it["ai"] and it["ai"]["flags"]]
        clean = [it for it in items if not (it["ai"] and it["ai"]["flags"])]
        take = _round_robin(flagged, FLAGGED_MAX)
        take += _round_robin(clean, PER_GROUP - len(take))
        if len(take) < PER_GROUP:
            rest = [it for it in flagged if it not in take]
            take += _round_robin(rest, PER_GROUP - len(take))
        stats.append({"shift": shift, "task_id": task, "proofs": len(items),
                      "flagged": len(flagged), "sampled": len(take)})
        picked += take
    return picked, stats


# ── delivery ─────────────────────────────────────────────────────────────────

def _send_file(chat_id: int, path: str, name: str, caption: str) -> None:
    with open(path, "rb") as fh:
        r = requests.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendDocument",
            data={"chat_id": chat_id, "caption": caption[:1000]},
            files={"document": (name, fh, "application/zip")},
            timeout=600)
    body = r.json()
    if not body.get("ok"):
        raise RuntimeError(body.get("description") or f"HTTP {r.status_code}")


def send(db: Session, chat_id: int, date_from=None, date_to=None) -> int:
    """Build every file and DM it. Returns how many files went out.

    The setup goes first, so a sample that dies half way still leaves the
    configuration in the chat. The read transaction is ended before the
    downloads begin — the sample holds plain values by then."""
    from app.services import leader_ai

    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    now = datetime.now(TZ)
    stamp = now.strftime("%Y-%m-%d")
    tmp = tempfile.mkdtemp(prefix="checklist-report-")
    sent = 0
    try:
        setup, examples = collect_setup(db)
        path = os.path.join(tmp, "setup.zip")
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("setup.json", json.dumps(setup, ensure_ascii=False, indent=1, default=str),
                        compress_type=zipfile.ZIP_DEFLATED)
            for name, data in examples:
                zf.writestr(name, data, compress_type=zipfile.ZIP_STORED)
        _send_file(chat_id, path, f"checklist-setup-{stamp}.zip",
                   "Chek-list sozlamalari — productiondagi holat (Claude uchun): "
                   "setup.json va namuna rasmlar. Barcha fayllarni yuklab oling.")
        sent += 1
        os.remove(path)

        index: dict = {"generated_at": _plain(now), "days": PROOF_DAYS,
                       "per_group": PER_GROUP, "flagged_max": FLAGGED_MAX}
        try:
            proofs, stats = pick_proofs(db, now.date())
            db.rollback()
            index["groups"] = stats
            part_no, zf, part_path, part_size = 0, None, None, 0
            images = 0
            for proof in proofs:
                for photo in proof["photos"]:
                    file_id = photo.pop("file_id", None)
                    try:
                        data, mime = leader_ai.fetch_bot_image(file_id)
                    except Exception as exc:
                        photo["error"] = f"{exc}"[:TEXT_MAX]
                        continue
                    # Checked BEFORE the photo goes in, so no part ever grows
                    # past the cap — a check after it lets the last photo carry
                    # a part over Telegram's limit.
                    if zf is not None and part_size + len(data) > PART_BYTES:
                        zf.close()
                        _send_file(chat_id, part_path, f"checklist-proofs-{stamp}-{part_no}.zip",
                                   f"Oxirgi {PROOF_DAYS} kun isbotlaridan namuna — {part_no}-qism.")
                        sent += 1
                        os.remove(part_path)
                        zf = None
                    if zf is None:
                        part_no += 1
                        part_path = os.path.join(tmp, f"proofs-{part_no}.zip")
                        zf = zipfile.ZipFile(part_path, "w")
                        part_size = 0
                    ext = "png" if "png" in (mime or "") else "jpg"
                    name = (f"proofs/s{proof['shift']}_t{proof['task_id']:02d}/"
                            f"{proof['date']}_u{proof['manager_id']}_l{proof['leader_id']}"
                            f"_e{proof['entry_id']}_{photo['pos']}.{ext}")
                    zf.writestr(name, data, compress_type=zipfile.ZIP_STORED)
                    photo["file"], photo["part"] = name, part_no
                    images += 1
                    part_size += len(data) + 512
            if zf is not None:
                zf.close()
                _send_file(chat_id, part_path, f"checklist-proofs-{stamp}-{part_no}.zip",
                           f"Oxirgi {PROOF_DAYS} kun isbotlaridan namuna — {part_no}-qism.")
                sent += 1
                os.remove(part_path)
            index.update({"parts": part_no, "images": images, "proofs": proofs})
        except Exception as exc:
            db.rollback()
            log.warning("checklist setup report: proof sample failed", exc_info=True)
            index["error"] = f"{type(exc).__name__}: {exc}"[:TEXT_MAX]

        path = os.path.join(tmp, "index.zip")
        with zipfile.ZipFile(path, "w") as zf:
            zf.writestr("proofs.json", json.dumps(index, ensure_ascii=False, indent=1, default=str),
                        compress_type=zipfile.ZIP_DEFLATED)
        _send_file(chat_id, path, f"checklist-proofs-index-{stamp}.zip",
                   f"Isbotlar ro'yxati (proofs.json): {index.get('parts', 0)} qism, "
                   f"{len(index.get('proofs') or [])} isbot, {index.get('images', 0)} rasm.")
        sent += 1
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    return sent
