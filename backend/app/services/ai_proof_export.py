"""Every checklist proof of 9–11 Oct 2026, delivered once to the operator, for a
LOCAL test of another vision model.

The operator, 2026-10-12: «I've locally installed qwen3-vl:8b and I want to
test it if we can replace Gemini … Send the last 3 days' proof images and
descriptions for each unit. Include one json file that defines which proof
belongs to who, which task, when and what against it was checked.» The local
model checks every proof BLIND — the operator's ruling — so nothing here
carries Gemini's verdict or a human ruling on it: the review rows go out as
the queue held them before anybody judged them.

It READS and never writes (bar its own flag, which `startup` keeps). Files go
to the operator's chat:

  ai-proofs-YYYY-MM-DD-N.zip   the proof photos of 9, 10 and 11 Oct — every
                               photo on every entry of those days, shrunk
                               exactly as the Gemini request shrinks them —
                               cut into parts under Telegram's 50 MB limit and
                               sent as each part fills
  ai-proofs-manifest.zip       manifest.json + examples/:
                                 proofs   one row per AI review row: who
                                          (leader, unit, cell), which task,
                                          when, its photos (file + part), and
                                          what it is checked against — the
                                          task name, note and criteria the
                                          prompt is built from, the leader's
                                          instruction, the date rule, and the
                                          server's camera clocks
                                 media    every photo file → its media row
                                 tables   the rows the /leaders page reads for
                                          those days (the org and the config
                                          whole, the days scoped), so the page
                                          can be rebuilt on a local copy

Nothing here may stop a boot: the job runs on the scheduler, every proof
catches its own failure and records it in the file instead.

Delete this module together with `startup.export_ai_proofs`,
`startup._ai_proof_export_job` and the call in BOTH entrypoints once the files
have landed — a call left behind imports a deleted module at boot.
"""
import json
import logging
import os
import shutil
import tempfile
import zipfile
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import requests
from sqlalchemy import LargeBinary, or_
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    AppSetting, Cell, Factory, LeaderAiReview, LeaderAutoCheck, LeaderChecklist,
    LeaderCutoff, LeaderDayExclusion, LeaderDaySource, LeaderTaskDay,
    LeaderTaskDef, LeaderTaskEntry, LeaderTaskExample, LeaderTaskLeaderSetting,
    LeaderTaskMedia, LeaderTaskOverride, LeaderTaskPhoto, LeaderTaskSetting,
    LeaderUnitSetting, Manager, RoleProfile,
)

log = logging.getLogger(__name__)

TZ = timezone(timedelta(hours=5))   # the plant's wall clock
DAYS = ("2026-10-09", "2026-10-10", "2026-10-11")
PART_BYTES = 40 * 1024 * 1024       # sendDocument refuses above 50 MB
TEXT_MAX = 300

# A review row goes out as the queue held it BEFORE anybody judged it: these
# are the columns a verdict (the model's, or a person's ruling on it) writes.
_VERDICT_COLS = {
    "status", "flags", "clocks", "image_date", "reason_uz", "reason_uz_cyrl",
    "reason_ru", "reason_en", "photos", "model", "error", "reviewed_at",
    "attempts", "resolution", "resolved_by", "resolved_at", "resolution_note",
}
# Only the settings the checklist resolvers read — never the rest of the
# table, which holds sealed keys and logins.
_SETTING_KEYS = ("leader_ai_floor", "cell_hours_shift_1", "cell_hours_shift_2")
_SETTING_PREFIXES = ("leader_rule_era_", "leader_temp_hours_")


def _plain(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, (list, tuple)):
        return [_plain(x) for x in v]
    if isinstance(v, dict):
        return {str(k): _plain(x) for k, x in v.items()}
    return v


def _why(exc: Exception) -> str:
    return f"{type(exc).__name__}: {exc}"[:TEXT_MAX]


def _rows(items, cls, drop=()) -> list[dict]:
    """Every column of each row as plain JSON — binary columns left out."""
    cols = [c for c in sa_inspect(cls).columns
            if not isinstance(c.type, LargeBinary) and c.key not in drop]
    return [{c.key: _plain(getattr(it, c.key)) for c in cols} for it in items]


def _tables(db: Session, day_ids: list[int], entry_ids: list[int]) -> dict:
    """The rows the /leaders page reads for these days. Each table on its own,
    so one that fails costs only itself."""
    out: dict = {}

    def grab(name, build):
        try:
            out[name] = build()
        except Exception as exc:
            db.rollback()
            out[name] = {"error": _why(exc)}

    grab("factories", lambda: _rows(db.query(Factory).all(), Factory))
    grab("managers", lambda: _rows(db.query(Manager).all(), Manager))
    grab("role_profiles", lambda: _rows(db.query(RoleProfile).all(), RoleProfile))
    grab("cells", lambda: _rows(db.query(Cell).all(), Cell))
    grab("leader_task_defs", lambda: _rows(db.query(LeaderTaskDef).all(), LeaderTaskDef))
    grab("leader_task_settings",
         lambda: _rows(db.query(LeaderTaskSetting).all(), LeaderTaskSetting))
    grab("leader_task_leader_settings",
         lambda: _rows(db.query(LeaderTaskLeaderSetting).all(), LeaderTaskLeaderSetting))
    grab("leader_unit_settings",
         lambda: _rows(db.query(LeaderUnitSetting).all(), LeaderUnitSetting))
    grab("leader_task_examples",
         lambda: _rows(db.query(LeaderTaskExample).all(), LeaderTaskExample))
    grab("leader_cutoffs", lambda: _rows(db.query(LeaderCutoff).all(), LeaderCutoff))
    grab("leader_day_sources", lambda: _rows(db.query(LeaderDaySource).all(), LeaderDaySource))
    grab("app_settings", lambda: _rows(
        db.query(AppSetting).filter(or_(
            AppSetting.key.in_(_SETTING_KEYS),
            *[AppSetting.key.like(p + "%") for p in _SETTING_PREFIXES])).all(),
        AppSetting))
    grab("leader_task_days", lambda: _rows(
        db.query(LeaderTaskDay).filter(LeaderTaskDay.id.in_(day_ids)).all(), LeaderTaskDay))
    grab("leader_task_entries", lambda: _rows(
        db.query(LeaderTaskEntry).filter(LeaderTaskEntry.id.in_(entry_ids)).all(),
        LeaderTaskEntry))
    grab("leader_task_media", lambda: _rows(
        db.query(LeaderTaskMedia).filter(LeaderTaskMedia.entry_id.in_(entry_ids)).all(),
        LeaderTaskMedia))
    grab("leader_task_photos", lambda: _rows(
        db.query(LeaderTaskPhoto).filter(LeaderTaskPhoto.day_id.in_(day_ids)).all(),
        LeaderTaskPhoto))
    grab("leader_auto_checks", lambda: _rows(
        db.query(LeaderAutoCheck).filter(LeaderAutoCheck.date.in_(DAYS)).all(),
        LeaderAutoCheck))
    grab("leader_task_overrides", lambda: _rows(
        db.query(LeaderTaskOverride).filter(LeaderTaskOverride.date.in_(DAYS)).all(),
        LeaderTaskOverride))
    grab("leader_day_exclusions", lambda: _rows(
        db.query(LeaderDayExclusion).filter(LeaderDayExclusion.date.in_(DAYS)).all(),
        LeaderDayExclusion))
    grab("leader_checklists", lambda: _rows(
        db.query(LeaderChecklist).filter(LeaderChecklist.date.in_(DAYS)).all(),
        LeaderChecklist))
    grab("leader_ai_reviews", lambda: _rows(
        db.query(LeaderAiReview).filter(LeaderAiReview.date.in_(DAYS)).all(),
        LeaderAiReview, drop=_VERDICT_COLS))
    return out


def collect(db: Session) -> tuple[dict, list[dict], list[tuple[str, bytes]]]:
    """(manifest without photo parts, media to download, example files).

    Plain values only: nothing on them touches the session again, so the
    caller ends the read transaction before the downloads begin."""
    from app.services import (
        leader_ai, leader_proof, leader_shift, leader_tasks, one_process,
    )

    days = (db.query(LeaderTaskDay).filter(LeaderTaskDay.date.in_(DAYS)).all())
    day_by_id = {d.id: d for d in days}
    entries = (db.query(LeaderTaskEntry)
               .filter(LeaderTaskEntry.day_id.in_(list(day_by_id))).all()
               if day_by_id else [])
    entry_by_id = {e.id: e for e in entries}
    media_rows = (db.query(LeaderTaskMedia)
                  .filter(LeaderTaskMedia.entry_id.in_(list(entry_by_id)))
                  .order_by(LeaderTaskMedia.entry_id, LeaderTaskMedia.pos).all()
                  if entry_by_id else [])
    media_by_entry: dict[int, list] = {}
    for m in media_rows:
        media_by_entry.setdefault(m.entry_id, []).append(m)

    units = {m.id: m for m in db.query(Manager).all()}
    profs = {p.id: p for p in db.query(RoleProfile).all()}
    cell_code = dict(db.query(Cell.id, Cell.verifix_code).all())

    revs = (db.query(LeaderAiReview).filter(LeaderAiReview.date.in_(DAYS))
            .order_by(LeaderAiReview.date, LeaderAiReview.manager_id,
                      LeaderAiReview.leader_id, LeaderAiReview.task_id).all())

    desc_cache: dict[tuple, dict] = {}
    examples_wanted: set[int] = set()
    proofs: list[dict] = []
    skipped: dict[str, int] = {}
    for rev in revs:
        if rev.source != "bot" or not rev.ref.startswith("bot:"):
            skipped[rev.source or "?"] = skipped.get(rev.source or "?", 0) + 1
            continue
        entry_id = int(rev.ref.split(":")[1])
        entry = entry_by_id.get(entry_id)
        day = day_by_id.get(entry.day_id) if entry else None
        unit = units.get(rev.manager_id)
        prof = profs.get(rev.leader_id)
        p: dict = {
            "review_id": rev.id, "ref": rev.ref, "entry_id": entry_id,
            "day_id": entry.day_id if entry else None,
            "report_uid": f"bot-{entry.day_id}" if entry else None,
            "date": rev.date, "shift": rev.shift, "task_id": rev.task_id,
            "unit": {"id": rev.manager_id, "name": unit.name if unit else None},
            "leader": {"id": rev.leader_id, "name": prof.name if prof else None},
            "cell": ({"id": day.cell_id, "code": cell_code.get(day.cell_id)}
                     if day and day.cell_id else None),
            "submitted_at": _plain(entry.saved_at) if entry else None,
            "task_closed_at": _plain(getattr(entry, "closed_at", None)) if entry else None,
            "day_closed_at": _plain(day.closed_at) if day else None,
            "media_ids": [m.id for m in media_by_entry.get(entry_id, [])],
            "errors": [],
        }
        try:
            win, checked, dayed, timed, plus = leader_ai.date_rule_for(
                db, rev.task_id, rev.manager_id, rev.leader_id, rev.shift, date=rev.date)
            p["rule"] = {
                "window": list(win), "date_check": checked, "day_check": dayed,
                "time_check": timed, "date_plus": plus,
                "screen_dates": bool(checked and dayed and not timed),
                "expected": leader_ai.expected_text(
                    rev.date, rev.shift, win, check=checked, days=dayed,
                    times=timed, plus=plus),
            }
        except Exception as exc:
            db.rollback()
            p["errors"].append(f"rule: {_why(exc)}")
        try:
            cell_id = (one_process.day_cell(db, rev.ref)
                       if rev.task_id == one_process.TASK else None)
            p["task"] = {
                "label": leader_ai.task_label(db, rev.task_id, rev.manager_id,
                                              rev.leader_id, date=rev.date),
                "note": leader_ai.task_note(db, rev.task_id),
                "criteria": leader_ai.criteria_for(db, rev.task_id, rev.manager_id,
                                                   rev.leader_id, date=rev.date,
                                                   cell_id=cell_id),
            }
        except Exception as exc:
            db.rollback()
            p["errors"].append(f"task: {_why(exc)}")
            p.setdefault("task", {})
        # The instruction the leader read — shown beside the verdict, never
        # part of the prompt (the reviewer does not read it either).
        try:
            key = (rev.leader_id, rev.date, rev.shift)
            if key not in desc_cache:
                desc_cache[key] = (leader_tasks.effective_leader_config(
                    db, prof, rev.shift, day=rev.date) if prof else {})
            cfg = desc_cache[key].get(rev.task_id) or {}
            p["task"]["description"] = cfg.get("description")
            p["task"]["min_media"] = cfg.get("min_media")
            p["task"]["weight"] = cfg.get("weight")
        except Exception as exc:
            db.rollback()
            p["errors"].append(f"description: {_why(exc)}")
        # The examples the reviewer shows in FRONT of the photos — the same
        # chain `review_one` walks, the same shifted-day carve-out.
        try:
            ex_mid = rev.manager_id
            if rev.leader_id and leader_shift.moved(db, rev.leader_id) and leader_shift.shifted(
                    db, rev.leader_id, rev.date, leader_shift.unit_shift(db, rev.manager_id)):
                ex_mid = None
            ids = leader_ai.example_ids_map(db, manager_id=ex_mid,
                                            leader_id=rev.leader_id).get(rev.task_id, [])
            p["example_ids"] = ids
            examples_wanted.update(ids)
        except Exception as exc:
            db.rollback()
            p["errors"].append(f"examples: {_why(exc)}")
            p["example_ids"] = []
        # A camera proof's clocks are the server's, never read off the picture.
        try:
            p["camera_clocks"] = _plain(leader_proof.server_clocks(db, entry_id))
        except Exception as exc:
            db.rollback()
            p["errors"].append(f"camera: {_why(exc)}")
            p["camera_clocks"] = None
        if not p["errors"]:
            del p["errors"]
        proofs.append(p)

    example_files: list[tuple[str, bytes]] = []
    examples: dict = {}
    if examples_wanted:
        for ex in (db.query(LeaderTaskExample)
                   .filter(LeaderTaskExample.id.in_(sorted(examples_wanted))).all()):
            ext = "png" if "png" in (ex.mime or "") else "jpg"
            name = f"examples/ex{ex.id}_t{ex.task_id:02d}.{ext}"
            example_files.append((name, ex.data or b""))
            examples[str(ex.id)] = {"file": name, "task_id": ex.task_id,
                                    "manager_id": ex.manager_id, "leader_id": ex.leader_id,
                                    "mime": ex.mime}

    media = [{"media_id": m.id, "entry_id": m.entry_id, "pos": m.pos,
              "file_id": m.file_id,
              "day_id": entry_by_id[m.entry_id].day_id,
              "task_id": entry_by_id[m.entry_id].task_id}
             for m in media_rows]

    manifest = {
        "generated_at": datetime.now(TZ).isoformat(),
        "days": list(DAYS),
        "note": "Proofs go out as the queue held them before anybody judged them: "
                "no AI verdict and no human ruling is in this file.",
        "max_images": leader_ai.MAX_IMAGES,
        "counts": {"days": len(days), "entries": len(entries), "photos": len(media_rows),
                   "proofs": len(proofs), "skipped_non_bot": skipped},
        "proofs": proofs,
        "examples": examples,
        "tables": _tables(db, list(day_by_id), list(entry_by_id)),
    }
    return manifest, media, example_files


# ── delivery ─────────────────────────────────────────────────────────────────

def _post(method: str, data: dict, files=None, timeout=60) -> None:
    r = requests.post(f"https://api.telegram.org/bot{settings.telegram_bot_token}/{method}",
                      data=data, files=files, timeout=timeout)
    body = r.json()
    if not body.get("ok"):
        raise RuntimeError(body.get("description") or f"HTTP {r.status_code}")


def _send_file(chat_id: int, path: str, name: str, caption: str) -> None:
    with open(path, "rb") as fh:
        _post("sendDocument", {"chat_id": chat_id, "caption": caption[:1000]},
              files={"document": (name, fh, "application/zip")}, timeout=600)


def send(db: Session, chat_id: int, date_from=None, date_to=None) -> int:
    """Build every file and DM it. Returns how many files went out."""
    from app.services import gemini, leader_ai

    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    # The run's clock is in every file name: a deploy that kills the job
    # mid-way starts it again from the top, and two runs' files must be told
    # apart in the chat.
    stamp = datetime.now(TZ).strftime("%Y-%m-%d-%H%M")
    manifest, media, example_files = collect(db)
    db.rollback()                       # plain values from here on

    _post("sendMessage", {
        "chat_id": chat_id,
        "text": (f"AI test export {stamp} (9–11 Oct):{manifest['counts']['proofs']} proofs, "
                 f"{len(media)} photos. The photo parts follow; manifest.json comes "
                 f"LAST. Download every file and paste them to Claude.")})

    tmp = tempfile.mkdtemp(prefix="ai-proof-export-")
    sent, part_no, images, failed = 0, 0, 0, 0
    zf, part_path, part_size = None, None, 0
    media_out: list[dict] = []
    try:
        for m in media:
            row = {k: m[k] for k in ("media_id", "entry_id", "pos", "day_id", "task_id")}
            try:
                raw, mime = leader_ai.fetch_bot_image(m["file_id"])
                data, mime = gemini.shrink_image(raw, mime)
            except Exception as exc:
                row["error"] = _why(exc)
                failed += 1
                media_out.append(row)
                continue
            # Checked BEFORE the photo goes in, so no part ever grows past the
            # cap.
            if zf is not None and part_size + len(data) > PART_BYTES:
                zf.close()
                _send_file(chat_id, part_path, f"ai-proofs-{stamp}-{part_no}.zip",
                           f"AI test proofs — part {part_no}.")
                sent += 1
                os.remove(part_path)
                zf = None
            if zf is None:
                part_no += 1
                part_path = os.path.join(tmp, f"part-{part_no}.zip")
                zf = zipfile.ZipFile(part_path, "w")
                part_size = 0
            ext = "png" if "png" in (mime or "") else "jpg"
            name = (f"proofs/{m['day_id']}/t{m['task_id']:02d}_e{m['entry_id']}"
                    f"_p{m['pos']}_m{m['media_id']}.{ext}")
            zf.writestr(name, data, compress_type=zipfile.ZIP_STORED)
            row.update({"file": name, "part": part_no, "mime": mime})
            media_out.append(row)
            images += 1
            part_size += len(data) + 512
        if zf is not None:
            zf.close()
            _send_file(chat_id, part_path, f"ai-proofs-{stamp}-{part_no}.zip",
                       f"AI test proofs — part {part_no} (last).")
            sent += 1
            os.remove(part_path)

        manifest["media"] = media_out
        manifest["counts"].update({"parts": part_no, "images": images,
                                   "image_errors": failed})
        path = os.path.join(tmp, "manifest.zip")
        with zipfile.ZipFile(path, "w") as zf2:
            zf2.writestr("manifest.json",
                         json.dumps(manifest, ensure_ascii=False, indent=1, default=str),
                         compress_type=zipfile.ZIP_DEFLATED)
            for name, data in example_files:
                zf2.writestr(name, data, compress_type=zipfile.ZIP_STORED)
        _send_file(chat_id, path, f"ai-proofs-manifest-{stamp}.zip",
                   f"manifest.json — {manifest['counts']['proofs']} proofs, "
                   f"{images} photos in {part_no} parts"
                   + (f", {failed} photos could not be fetched" if failed else "") + ".")
        sent += 1
    finally:
        if zf is not None:
            try:
                zf.close()
            except Exception:
                pass
        shutil.rmtree(tmp, ignore_errors=True)
    return sent
