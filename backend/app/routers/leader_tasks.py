"""In-bot leader daily-checklist config + media.

Admin side (/admin/leader-tasks/*): the supervisors × tasks config matrix
(enabled / min photos / weight per cell, column-wide overwrite, per-language
task names) and the archive-channel setting, driving the bot's /tasks flow.

Viewer side (/api/leader-tasks/media/…): streams a proof photo from Telegram
for the /leaders detail modal — page-access gated with the same row scoping as
/api/leaders (supervisor → own unit, leader → own rows).
"""
import requests
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import (
    AppSetting, LeaderTaskDay, LeaderTaskDef, LeaderTaskEntry, LeaderTaskMedia,
    LeaderTaskSetting, Manager, RoleProfile,
)
from app.permissions import require_page
from app.routers.admin import _TG_API, _tg_file_meta, verify_admin
from app.services.leader_tasks import (
    CHANNEL_SETTING_KEY, channel_chat_id, effective_settings, ensure_task_defs,
)

router = APIRouter(tags=["leader-tasks"])

_LANGS = ("uz", "uz_cyrl", "ru", "en")


# ── Admin: config matrix ──────────────────────────────────────────────────────

@router.get("/admin/leader-tasks/config")
def get_config(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    defs = ensure_task_defs(db)
    managers = (
        db.query(Manager)
        .filter(Manager.archived.is_(False))
        .order_by(Manager.name)
        .all()
    )
    return {
        "tasks": [
            {
                "id": td.id,
                "name": {l: getattr(td, f"name_{l}") for l in _LANGS},
                "note": {l: getattr(td, f"note_{l}") for l in _LANGS},
                "default_weight": td.default_weight,
            }
            for td in defs
        ],
        "managers": [{"id": m.id, "name": m.name, "shift": m.shift} for m in managers],
        "settings": {
            str(m.id): {str(t): s for t, s in effective_settings(db, m.id).items()}
            for m in managers
        },
        "channel": {"chat_id": channel_chat_id(db) or ""},
    }


class CellIn(BaseModel):
    manager_id: int
    task_id: int
    enabled: bool
    min_media: int
    weight: int


def _clamp(cell) -> tuple[int, int]:
    return max(0, min(20, int(cell.min_media))), max(0, min(100, int(cell.weight)))


def _upsert(db: Session, manager_id: int, task_id: int,
            enabled: bool, min_media: int, weight: int):
    row = db.query(LeaderTaskSetting).filter_by(
        manager_id=manager_id, task_id=task_id).first()
    if not row:
        row = LeaderTaskSetting(manager_id=manager_id, task_id=task_id)
        db.add(row)
    row.enabled = enabled
    row.min_media = min_media
    row.weight = weight


@router.put("/admin/leader-tasks/cell")
def put_cell(cell: CellIn, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    if not db.query(Manager).filter_by(id=cell.manager_id).first():
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    if not db.query(LeaderTaskDef).filter_by(id=cell.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")
    mm, w = _clamp(cell)
    _upsert(db, cell.manager_id, cell.task_id, cell.enabled, mm, w)
    db.commit()
    return {"ok": True}


class ColumnIn(BaseModel):
    task_id: int
    enabled: bool
    min_media: int
    weight: int
    names: dict[str, str] | None = None  # optional per-language rename


@router.put("/admin/leader-tasks/column")
def put_column(col: ColumnIn, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    td = db.query(LeaderTaskDef).filter_by(id=col.task_id).first()
    if not td:
        raise HTTPException(status_code=404, detail="Unknown task")
    if col.names:
        for l in _LANGS:
            v = (col.names.get(l) or "").strip()
            if v:
                setattr(td, f"name_{l}", v)
    mm, w = _clamp(col)
    for m in db.query(Manager).filter(Manager.archived.is_(False)).all():
        _upsert(db, m.id, col.task_id, col.enabled, mm, w)
    db.commit()
    return {"ok": True}


# ── Admin: archive channel ────────────────────────────────────────────────────

class ChannelIn(BaseModel):
    chat_id: str


@router.put("/admin/leader-tasks/channel")
def put_channel(body: ChannelIn, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    chat_id = body.chat_id.strip()
    row = db.query(AppSetting).filter_by(key=CHANNEL_SETTING_KEY).first()
    if not chat_id:  # clear
        if row:
            db.delete(row)
            db.commit()
        return {"ok": True, "chat_id": ""}

    # Verify before storing: the bot must be able to post (and clean up) there.
    from app.telegram_bot import bot  # lazy — keeps router import light
    try:
        probe = bot.send_message(chat_id, "✅ Safia leader-tasks archive check")
        try:
            bot.delete_message(chat_id, probe.message_id)
        except Exception:
            pass
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Bot can't post to this channel: {e}")

    if not row:
        row = AppSetting(key=CHANNEL_SETTING_KEY, value=chat_id)
        db.add(row)
    else:
        row.value = chat_id
    db.commit()
    return {"ok": True, "chat_id": chat_id}


# ── Admin: bot-submission dashboard data ──────────────────────────────────────
# The admin-only COPY of the leaders monitoring page (/leaders-bot) is driven by
# this. Deliberately independent of /api/leaders: bot data and the Google-Sheet
# data never mix — two pages, two sources.

@router.get("/admin/leaders-bot")
def leaders_bot(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    days = (
        db.query(LeaderTaskDay)
        .filter(LeaderTaskDay.closed_at.isnot(None))
        .all()
    )
    profs = {
        p.id: p
        for p in db.query(RoleProfile)
        .filter(RoleProfile.id.in_({d.leader_id for d in days}))
        .all()
    } if days else {}
    mgrs = {m.id: m for m in db.query(Manager).all()}

    day_ids = [d.id for d in days]
    entries_by_day: dict[int, list] = {}
    if day_ids:
        for e in db.query(LeaderTaskEntry).filter(LeaderTaskEntry.day_id.in_(day_ids)).all():
            entries_by_day.setdefault(e.day_id, []).append(e)
    entry_ids = [e.id for es in entries_by_day.values() for e in es]
    media_by_entry: dict[int, list] = {}
    if entry_ids:
        for m in (db.query(LeaderTaskMedia)
                  .filter(LeaderTaskMedia.entry_id.in_(entry_ids))
                  .order_by(LeaderTaskMedia.pos)
                  .all()):
            media_by_entry.setdefault(m.entry_id, []).append(m.id)

    data = []
    for d in days:
        prof = profs.get(d.leader_id)
        if not prof:
            continue
        mgr = mgrs.get(d.manager_id)
        data.append({
            "uid": f"bot-{d.id}",
            "date": d.date,
            "submitted_at": d.closed_at.isoformat() if d.closed_at else None,
            "supervisor": mgr.name if mgr else "N/A",
            "shift": mgr.shift if mgr else None,
            "leader": prof.name,
            "completion": float(d.completion or 0),
            "tasks": [
                {
                    "id": e.task_id,
                    "done": bool(e.done),
                    "answered": True,
                    "photo": "",
                    "reason": e.reason or "",
                    "media": media_by_entry.get(e.id, []),
                }
                for e in sorted(entries_by_day.get(d.id, []), key=lambda e: e.task_id)
            ],
        })
    data.sort(key=lambda r: str(r["date"]), reverse=True)
    return {"role": "admin", "last_synced": None, "data": data}


# ── Viewer: proof-photo streaming for the /leaders-bot detail modal ───────────

@router.get("/api/leader-tasks/media/{media_id}")
def leader_task_media(
    media_id: int,
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("leaders")),
):
    m = db.query(LeaderTaskMedia).filter_by(id=media_id).first()
    entry = m and db.query(LeaderTaskEntry).filter_by(id=m.entry_id).first()
    day = entry and db.query(LeaderTaskDay).filter_by(id=entry.day_id).first()
    if not day:
        raise HTTPException(status_code=404, detail="Media not found")

    # Same row scoping as /api/leaders: supervisor → own unit, leader → own
    # profile's rows; admin / shift- / top-managers see everything.
    role = payload.get("role")
    if role == "supervisor" and day.manager_id != payload.get("role_id"):
        raise HTTPException(status_code=403, detail="Not your unit")
    if role == "leader":
        prof = db.query(RoleProfile).filter_by(id=day.leader_id).first()
        if (not prof or prof.manager_id != payload.get("role_id")
                or prof.name != payload.get("full_name")):
            raise HTTPException(status_code=403, detail="Not your submission")

    meta = _tg_file_meta(m.file_id)
    url = f"{_TG_API}/file/bot{settings.telegram_bot_token}/{meta['file_path']}"
    try:
        upstream = requests.get(url, stream=True, timeout=60)
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"Telegram unreachable: {e}")
    if upstream.status_code != 200:
        upstream.close()
        raise HTTPException(status_code=404, detail="File no longer available")

    def _chunks():
        try:
            yield from upstream.iter_content(chunk_size=64 * 1024)
        finally:
            upstream.close()

    headers = {"Content-Disposition": f'inline; filename="{meta["file_name"]}"',
               "Cache-Control": "no-store"}
    if meta["file_size"]:
        headers["Content-Length"] = str(meta["file_size"])
    return StreamingResponse(_chunks(), media_type=meta["mime_type"], headers=headers)
