"""Every leader proof photo of the last week, DMed once as a zipped folder.

The operator asked, on 2026-09-18, for the last 7 days of proof images out of
the archive channel, as a folder, with a JSON file inside saying which picture
belongs to whom, to which day and to which task. This platform has no shell, so
the answer is a boot job like every other one-off in `startup.py`.

It READS and writes nothing but its own flag. No photo is re-encoded, cropped
or resized: the bytes that reach the chat are byte-for-byte what the archive
channel holds, because the point of a proof is the picture.

**Three kinds of photo, and all three are in.** `leader_task_media` is the
canonical roll of an ANSWERED task and already mirrors every camera shot that
reached `min_media`, so it is walked first; `leader_task_photos` then adds the
shots of a roll that never became an answer — a leader who shot two of three
is invisible to the first table and is exactly the state worth looking at;
`leader_late_proof_media` adds what was filed after a deadline. They are folded
by `file_id`, so a camera shot mirrored into an entry is stored ONCE and named
by the entry it belongs to.

**The manifest is complete before the first byte is downloaded**, which is what
lets an identical copy of it ride in EVERY part: the path a photo takes inside
the zip is derived from the database alone (`sendPhoto` re-encodes to JPEG, so
the extension is never in doubt), and the part a file happens to land in is a
delivery detail, not an answer to "whose proof is this". Unzip every part into
one directory and the result is ONE folder with one `proofs.json` in it.

**It is split because Telegram refuses a document over 50 MB.** A week is a few
thousand photos, so this sends a run of parts rather than one file; the caption
numbers them and the final message says how many there were and what could not
be fetched.

Delete this module together with `startup.report_proof_archive`,
`startup._proof_archive_job` and the call in BOTH entrypoints once the files
have landed — a call left behind imports a deleted module at boot, and a failed
boot rolls the deploy back.
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import tempfile
import time
import zipfile
from datetime import date, datetime, timedelta, timezone

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Cell, Factory, LeaderLateProof, LeaderLateProofMedia, LeaderTaskDay,
    LeaderTaskDef, LeaderTaskEntry, LeaderTaskMedia, LeaderTaskPhoto, Manager,
    RoleProfile,
)

log = logging.getLogger(__name__)

TZ = timezone(timedelta(hours=5))   # the plant's wall clock

# How many days back, TODAY INCLUDED — the operator asked for "the last 7 days",
# and a window that stopped at yesterday would leave out the shift they are
# most likely asking about.
WINDOW_DAYS = 7

# sendDocument refuses above 50 MB, and the manifest rides in every part, so the
# cap is set well under it rather than at the edge.
PART_BYTES = 40 * 1024 * 1024

# Parts are sent as they fill. A pause between them keeps a long run clear of
# Telegram's per-chat flood limit; a 429 is obeyed on top of it (`_send_file`).
PART_PAUSE_S = 2
SEND_RETRIES = 3

TEXT_MAX = 300      # free text is cut, never dropped
ERRORS_NAMED = 20   # how many failed photos the closing message names


# ── plain values ─────────────────────────────────────────────────────────────

def _plain(v):
    """A JSON-safe copy, with instants on the plant's own clock."""
    if isinstance(v, datetime):
        return (v.astimezone(TZ) if v.tzinfo else v).isoformat(timespec="seconds")
    if isinstance(v, date):
        return v.isoformat()
    return v


_SLUG_DROP = re.compile(r"[^\w\-. ]", re.UNICODE)


def _slug(v, fallback: str = "-") -> str:
    """A path segment out of a person's or a unit's name.

    Cyrillic and Latin both survive (zip entry names are UTF-8), because the
    folder tree is meant to be readable by the person who unzips it — only the
    characters a path cannot carry are dropped, and the length is capped so a
    deep tree stays inside every filesystem's own limit.
    """
    s = _SLUG_DROP.sub("", str(v or "")).strip().replace(" ", "_")
    return (s[:48] or fallback)


# ── what there is to fetch ───────────────────────────────────────────────────

def _window(today: date) -> list[str]:
    return [(today - timedelta(days=k)).isoformat()
            for k in range(WINDOW_DAYS - 1, -1, -1)]


def collect(db: Session, today: date) -> dict:
    """The complete manifest, built from the database alone.

    Every entry carries the path its picture will occupy in the zip, so this is
    finished — and can be written into the first part — before anything is
    downloaded. Nothing on the returned value touches the session again.
    """
    days = _window(today)

    # Read by COLUMN and not as entities: these four are lookup names, and a
    # whole-entity load would make this errand depend on every column the models
    # currently declare — which is a migration it has no business waiting for.
    units = {r.id: r for r in db.query(
        Manager.id, Manager.name, Manager.shift, Manager.factory_id).all()}
    leaders = dict(db.query(RoleProfile.id, RoleProfile.name).all())
    cells = dict(db.query(Cell.id, Cell.verifix_code).all())
    factories = {r.id: (r.name_uz or r.code)
                 for r in db.query(Factory.id, Factory.name_uz, Factory.code).all()}
    # The catalog by COLUMN rather than through `leader_tasks.ensure_task_defs`:
    # only the names are wanted, and that resolver SEEDS an empty catalog — a
    # read-only errand must not be the thing that writes one. Archived tasks are
    # kept, which is the same reason that resolver keeps them: a proof filed
    # against a task since retired must still be able to name it.
    defs = {r.id: r for r in db.query(
        LeaderTaskDef.id, LeaderTaskDef.name_uz, LeaderTaskDef.name_ru).all()}

    rows = (db.query(LeaderTaskDay)
            .filter(LeaderTaskDay.date.in_(days))
            .order_by(LeaderTaskDay.date, LeaderTaskDay.manager_id,
                      LeaderTaskDay.leader_id, LeaderTaskDay.id)
            .all())
    day_by_id = {d.id: d for d in rows}
    day_ids = list(day_by_id)

    entries: dict[int, LeaderTaskEntry] = {}
    media: list[LeaderTaskMedia] = []
    shots: list[LeaderTaskPhoto] = []
    late_by_id: dict[int, LeaderLateProof] = {}
    late_media: list[LeaderLateProofMedia] = []
    if day_ids:
        ents = (db.query(LeaderTaskEntry)
                .filter(LeaderTaskEntry.day_id.in_(day_ids)).all())
        entries = {e.id: e for e in ents}
        if ents:
            media = (db.query(LeaderTaskMedia)
                     .filter(LeaderTaskMedia.entry_id.in_(list(entries)))
                     .order_by(LeaderTaskMedia.entry_id, LeaderTaskMedia.pos).all())
        shots = (db.query(LeaderTaskPhoto)
                 .filter(LeaderTaskPhoto.day_id.in_(day_ids))
                 .order_by(LeaderTaskPhoto.day_id, LeaderTaskPhoto.task_id,
                           LeaderTaskPhoto.slot).all())
        lates = (db.query(LeaderLateProof)
                 .filter(LeaderLateProof.day_id.in_(day_ids)).all())
        late_by_id = {lp.id: lp for lp in lates}
        if lates:
            late_media = (db.query(LeaderLateProofMedia)
                          .filter(LeaderLateProofMedia.late_id.in_(list(late_by_id)))
                          .order_by(LeaderLateProofMedia.late_id,
                                    LeaderLateProofMedia.pos).all())

    def _where(day: LeaderTaskDay, task_id: int) -> dict:
        """Who, where and when — the half of an entry that is the same whichever
        table the picture came out of."""
        unit = units.get(day.manager_id)
        td = defs.get(task_id)
        return {
            "date": day.date,
            "shift": unit.shift if unit else None,
            "factory": factories.get(unit.factory_id) if unit else None,
            "unit_id": day.manager_id,
            "unit": unit.name if unit else None,
            "leader_id": day.leader_id,
            "leader": leaders.get(day.leader_id),
            "cell_id": day.cell_id,
            "cell_code": cells.get(day.cell_id) if day.cell_id else None,
            "task_id": task_id,
            "task": td.name_uz if td else None,
            "task_ru": td.name_ru if td else None,
            "day_id": day.id,
            "day_closed_at": _plain(day.closed_at),
        }

    def _path(w: dict, tail: str) -> str:
        """`proofs/<date>/smena<N>/<unit>/<leader>/<cell>/t<NN>_<tail>.jpg`.

        The tree answers the question on its own — the JSON is what answers it
        for a machine, and for the facts a folder name cannot carry.
        """
        return "/".join((
            "proofs", w["date"], f"smena{w['shift'] or 0}",
            f"u{w['unit_id']}_{_slug(w['unit'])}",
            f"l{w['leader_id']}_{_slug(w['leader'])}",
            _slug(w["cell_code"], "yacheykasiz"),
            f"t{w['task_id']:02d}_{tail}.jpg",
        ))

    images: list[dict] = []
    seen: set[str] = set()       # file_id — one picture is stored once
    taken: set[str] = set()      # zip path — see `_unique` below

    def _unique(path: str) -> str:
        """A path no other picture in this manifest has.

        The row ids in every name already make a clash all but impossible, but
        "all but" is not a guarantee a zip can be built on: two entries at one
        name make an archive that unpacks to ONE file, so a proof would go
        missing with the manifest still naming it. Cheap, and it removes the
        assumption entirely.
        """
        if path not in taken:
            taken.add(path)
            return path
        stem, _, ext = path.rpartition(".")
        for n in range(2, 1000):
            alt = f"{stem}-{n}.{ext}"
            if alt not in taken:
                taken.add(alt)
                return alt
        taken.add(path)
        return path

    # 1. The ANSWERED roll. Canonical: every camera shot that reached
    #    `min_media` is mirrored here, so walking this first is what keeps a
    #    mirrored shot from being stored twice under two names.
    shot_by_key = {(s.day_id, s.task_id, s.file_id): s for s in shots}
    for m in media:
        e = entries.get(m.entry_id)
        day = day_by_id.get(e.day_id) if e else None
        if not day or m.file_id in seen:
            continue
        seen.add(m.file_id)
        w = _where(day, e.task_id)
        s = shot_by_key.get((day.id, e.task_id, m.file_id))
        images.append({**w, "kind": "checklist", "pos": m.pos,
                       "entry_id": e.id, "done": bool(e.done),
                       "reason": (e.reason or None),
                       "saved_at": _plain(e.saved_at),
                       "task_closed_at": _plain(e.closed_at),
                       "source": "camera" if s else "telegram",
                       "slot": s.slot if s else None,
                       "captured_at": _plain(s.captured_at) if s else None,
                       "stamp": s.stamp if s else None,
                       "late": bool(s.late) if s else None,
                       "deferred": bool(s.deferred) if s else None,
                       "file_id": m.file_id,
                       "file": _unique(_path(w, f"e{e.id}_p{m.pos}"))})

    # 2. The UNFINISHED camera roll — shots on a task that never became an
    #    answer. Invisible to every existing reader, which is exactly why they
    #    belong in an archive of what was actually taken.
    for s in shots:
        day = day_by_id.get(s.day_id)
        if not day or s.file_id in seen:
            continue
        seen.add(s.file_id)
        w = _where(day, s.task_id)
        images.append({**w, "kind": "camera_roll", "pos": s.slot,
                       "entry_id": None, "done": None, "reason": None,
                       "saved_at": None, "task_closed_at": None,
                       "source": "camera", "slot": s.slot,
                       "captured_at": _plain(s.captured_at), "stamp": s.stamp,
                       "late": bool(s.late), "deferred": bool(s.deferred),
                       "file_id": s.file_id,
                       "file": _unique(_path(w, f"roll{s.id}_s{s.slot}"))})

    # 3. LATE proofs — filed after the deadline, scored only if somebody ruled
    #    so. A separate store on purpose, and a separate `kind` here.
    for lm in late_media:
        lp = late_by_id.get(lm.late_id)
        day = day_by_id.get(lp.day_id) if lp else None
        if not day or lm.file_id in seen:
            continue
        seen.add(lm.file_id)
        w = _where(day, lp.task_id)
        images.append({**w, "kind": "late_proof", "pos": lm.pos,
                       "entry_id": None, "done": None,
                       "reason": (lp.reason or "")[:TEXT_MAX] or None,
                       "saved_at": _plain(lp.created_at), "task_closed_at": None,
                       "source": lm.source or "upload", "slot": None,
                       "captured_at": _plain(lm.captured_at), "stamp": lm.stamp,
                       "late": True, "deferred": None,
                       "late_id": lp.id, "late_status": lp.status,
                       "deadline": lp.deadline,
                       "file_id": lm.file_id,
                       "file": _unique(_path(w, f"kech{lp.id}_p{lm.pos}"))})

    by_kind: dict[str, int] = {}
    for im in images:
        by_kind[im["kind"]] = by_kind.get(im["kind"], 0) + 1

    return {
        "generated_at": _plain(datetime.now(TZ)),
        "window": {"from": days[0], "to": days[-1], "days": WINDOW_DAYS},
        "counts": {"images": len(images), "days": len(rows), "by_kind": by_kind},
        "note": ("Har bir rasm — bitta isbot. «file» — ZIP ichidagi yo'l; "
                 "har bir qismda shu faylning to'liq nusxasi bor. "
                 "kind: checklist = topshirilgan vazifa isboti, "
                 "camera_roll = tugallanmagan kamera rulosi, "
                 "late_proof = muddatdan keyin yuborilgan isbot."),
        "images": images,
    }


# ── delivery ─────────────────────────────────────────────────────────────────

def _send_file(chat_id: int, path: str, name: str, caption: str) -> None:
    """One part, with Telegram's own flood answer obeyed.

    Retried because a run of thirty uploads meets a transient failure sooner or
    later, and losing one part loses the photos in it — the manifest names them,
    so a silent gap would read as photos that were never taken.
    """
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        try:
            with open(path, "rb") as fh:
                r = requests.post(
                    f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendDocument",
                    data={"chat_id": chat_id, "caption": caption[:1000]},
                    files={"document": (name, fh, "application/zip")},
                    timeout=900)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:                      # network, timeout, bad JSON
            last, wait = f"{type(exc).__name__}: {exc}", 0
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, PART_PAUSE_S * attempt))
    raise RuntimeError(last or "sendDocument failed")


def _say(chat_id: int, text: str) -> None:
    try:
        requests.post(
            f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage",
            data={"chat_id": chat_id, "text": text[:4000]}, timeout=60)
    except Exception:
        log.warning("proof archive: closing message failed", exc_info=True)


def send(db: Session, chat_id: int, *_window) -> int:
    """Fetch every proof of the window and DM it. Returns how many files went.

    The window `_send_report_once` passes is ignored: what "the last 7 days"
    means is `WINDOW_DAYS` counted back from the day the job RUNS, so a pair of
    dates frozen into `startup.py` would name a different week the moment a
    delivery had to be retried on a later boot.

    The read transaction is ended before the downloads begin — the manifest
    holds plain values by then, and a session left open across a run of
    thousands of Telegram fetches is a connection held for no reason.
    """
    from app.services import leader_ai

    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")

    manifest = collect(db, datetime.now(TZ).date())
    db.rollback()

    blob = json.dumps(manifest, ensure_ascii=False, indent=1, default=str).encode()
    win = manifest["window"]
    stamp = datetime.now(TZ).strftime("%Y-%m-%d")
    total = len(manifest["images"])

    tmp = tempfile.mkdtemp(prefix="proof-archive-")
    sent, packed, part_no = 0, 0, 0
    failed: list[str] = []
    try:
        if not total:
            _say(chat_id, f"Isbot rasmlari {win['from']}..{win['to']}: "
                          f"bu oynada hech qanday rasm yo'q.")
            return 0

        zf = part_path = None
        part_size = 0
        for im in manifest["images"]:
            try:
                data, _mime = leader_ai.fetch_bot_image(im["file_id"])
            except Exception as exc:
                failed.append(f"{im['file']} — {type(exc).__name__}: {exc}"[:TEXT_MAX])
                continue
            # Checked BEFORE the photo goes in, so no part can grow past the
            # cap — a check after it lets the last photo carry a part over
            # Telegram's own limit, and the whole part is then unsendable.
            if zf is not None and part_size + len(data) > PART_BYTES:
                zf.close()
                _send_file(chat_id, part_path,
                           f"isbotlar-{stamp}-{part_no:02d}.zip",
                           f"Isbot rasmlari {win['from']}..{win['to']} — "
                           f"{part_no}-qism. Ichida proofs.json (to'liq ro'yxat).")
                sent += 1
                os.remove(part_path)
                zf = None
                time.sleep(PART_PAUSE_S)
            if zf is None:
                part_no += 1
                part_path = os.path.join(tmp, f"part-{part_no}.zip")
                zf = zipfile.ZipFile(part_path, "w")
                # The COMPLETE manifest, in every part: a reader who opens one
                # zip must be able to say whose each picture is without holding
                # the other twenty-nine.
                zf.writestr("proofs.json", blob, compress_type=zipfile.ZIP_DEFLATED)
                part_size = len(blob)
            zf.writestr(im["file"], data, compress_type=zipfile.ZIP_STORED)
            packed += 1
            part_size += len(data) + 512
        if zf is not None:
            zf.close()
            _send_file(chat_id, part_path, f"isbotlar-{stamp}-{part_no:02d}.zip",
                       f"Isbot rasmlari {win['from']}..{win['to']} — "
                       f"{part_no}-qism (oxirgi). Ichida proofs.json.")
            sent += 1
            os.remove(part_path)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    kinds = ", ".join(f"{k}: {v}" for k, v in sorted(manifest["counts"]["by_kind"].items()))
    lines = [f"Isbot rasmlari {win['from']}..{win['to']} ({WINDOW_DAYS} kun).",
             f"Ro'yxatda {total} ta rasm ({kinds}).",
             f"Yuborildi: {packed} ta rasm, {sent} ta ZIP qism.",
             "Barcha qismlarni BITTA papkaga chiqaring — proofs.json har bir "
             "qismda bir xil va to'liq."]
    if failed:
        lines.append(f"Olib bo'lmadi: {len(failed)} ta.")
        lines += [f"  · {f}" for f in failed[:ERRORS_NAMED]]
        if len(failed) > ERRORS_NAMED:
            lines.append(f"  · …va yana {len(failed) - ERRORS_NAMED} ta.")
    _say(chat_id, "\n".join(lines))
    return sent
