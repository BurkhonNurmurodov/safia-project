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
    AppSetting, LeaderTaskDay, LeaderTaskDef, LeaderTaskEntry,
    LeaderTaskLeaderSetting, LeaderTaskMedia, LeaderTaskSetting, Manager,
    RoleProfile,
)
from app.routers.admin import _TG_API, _tg_file_meta, verify_admin
from app.services.leader_tasks import (
    CHANNEL_SETTING_KEY, audit_list, cancel_pending, channel_chat_id,
    effective_date, effective_settings, ensure_task_defs, leader_overrides,
    next_effective_date, pending_list, promote_all_shifts, revert_audit,
    write_change,
)

router = APIRouter(tags=["leader-tasks"])

_LANGS = ("uz", "uz_cyrl", "ru", "en")


# ── Admin: config matrix ──────────────────────────────────────────────────────

def _actor(admin: dict) -> str | None:
    return admin.get("profile_key") or admin.get("name") or admin.get("sub")


@router.get("/admin/leader-tasks/config")
def get_config(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    promote_all_shifts(db)  # apply anything now due before showing live state
    defs = ensure_task_defs(db)
    managers = (
        db.query(Manager)
        .filter(Manager.archived.is_(False))
        .order_by(Manager.name)
        .all()
    )
    leaders = (
        db.query(RoleProfile)
        .filter(RoleProfile.role == "leader", RoleProfile.manager_id.isnot(None))
        .order_by(RoleProfile.name)
        .all()
    )
    overrides = leader_overrides(db, [p.id for p in leaders])
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
        "leaders": [
            {"id": p.id, "name": p.name, "manager_id": p.manager_id} for p in leaders
        ],
        # Sparse RAW per-leader overrides (null field = inherit from the
        # supervisor's effective value) — the matrix resolves the chain itself.
        "leader_settings": {
            str(lid): {str(t): s for t, s in by_task.items()}
            for lid, by_task in overrides.items()
        },
        "channel": {"chat_id": channel_chat_id(db) or ""},
        # Staging: what's queued for a future day + the dates "next day"
        # resolves to per shift (so the UI can label "applies from …").
        "pending": pending_list(db),
        "next_dates": {"1": next_effective_date(1), "2": next_effective_date(2)},
    }


# Each config write takes an optional `when`: "now" (default, live) or
# "next_day" (staged to the target's next shift boundary).

class CellIn(BaseModel):
    manager_id: int
    task_id: int
    enabled: bool
    min_media: int
    weight: int
    # Per-supervisor rename: value = override, "" or missing lang = inherit
    # the global name. None = leave the stored names untouched.
    names: dict[str, str] | None = None
    when: str = "now"


def _clamp(cell) -> tuple[int, int]:
    return max(0, min(20, int(cell.min_media))), max(0, min(100, int(cell.weight)))


def _upsert(db: Session, manager_id: int, task_id: int,
            enabled: bool, min_media: int, weight: int) -> LeaderTaskSetting:
    row = db.query(LeaderTaskSetting).filter_by(
        manager_id=manager_id, task_id=task_id).first()
    if not row:
        row = LeaderTaskSetting(manager_id=manager_id, task_id=task_id)
        db.add(row)
    row.enabled = enabled
    row.min_media = min_media
    row.weight = weight
    return row


@router.put("/admin/leader-tasks/cell")
def put_cell(cell: CellIn, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    if not db.query(Manager).filter_by(id=cell.manager_id).first():
        raise HTTPException(status_code=404, detail="Unknown supervisor")
    if not db.query(LeaderTaskDef).filter_by(id=cell.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")
    mm, w = _clamp(cell)
    row = _upsert(db, cell.manager_id, cell.task_id, cell.enabled, mm, w)
    if cell.names is not None:
        for l in _LANGS:
            setattr(row, f"name_{l}", (cell.names.get(l) or "").strip() or None)
    db.commit()
    return {"ok": True}


class LeaderCellIn(BaseModel):
    """Per-leader override. Null config field = inherit from the supervisor's
    effective value; `names` values: "" = inherit, None/omitted dict = keep the
    stored names untouched (same semantics as CellIn); reset=True drops the
    whole override row."""
    leader_id: int
    task_id: int
    enabled: bool | None = None
    min_media: int | None = None
    weight: int | None = None
    names: dict[str, str] | None = None
    reset: bool = False


@router.put("/admin/leader-tasks/leader-cell")
def put_leader_cell(cell: LeaderCellIn, db: Session = Depends(get_db),
                    _: dict = Depends(verify_admin)):
    prof = db.query(RoleProfile).filter_by(id=cell.leader_id, role="leader").first()
    if not prof:
        raise HTTPException(status_code=404, detail="Unknown leader")
    if not db.query(LeaderTaskDef).filter_by(id=cell.task_id).first():
        raise HTTPException(status_code=404, detail="Unknown task")

    row = db.query(LeaderTaskLeaderSetting).filter_by(
        leader_id=cell.leader_id, task_id=cell.task_id).first()

    if cell.names is not None:
        names = {l: (cell.names.get(l) or "").strip() or None for l in _LANGS}
    elif row:  # names omitted — keep what's stored (mirrors put_cell)
        names = {l: getattr(row, f"name_{l}") for l in _LANGS}
    else:
        names = {l: None for l in _LANGS}
    all_inherit = (
        cell.enabled is None and cell.min_media is None and cell.weight is None
        and not any(names.values())
    )
    if cell.reset or all_inherit:
        # Nothing overridden anymore — the row would be a no-op, drop it.
        if row:
            db.delete(row)
            db.commit()
        return {"ok": True}

    if not row:
        row = LeaderTaskLeaderSetting(leader_id=cell.leader_id, task_id=cell.task_id)
        db.add(row)
    row.enabled = cell.enabled
    row.min_media = None if cell.min_media is None else max(0, min(20, int(cell.min_media)))
    row.weight = None if cell.weight is None else max(0, min(100, int(cell.weight)))
    for l in _LANGS:
        setattr(row, f"name_{l}", names[l])
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
    _: dict = Depends(verify_admin),
):
    m = db.query(LeaderTaskMedia).filter_by(id=media_id).first()
    if not m:
        raise HTTPException(status_code=404, detail="Media not found")

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
