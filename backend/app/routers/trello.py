"""«Trello» — a Trello board's analytics (/trello) and its connection card
(/admin/upload?tab=trello).

Two routers over ``services/trello.py`` (the client, the stored snapshot, the
15-minute read) and ``services/trello_analytics.py`` (the figures):

- ``/api/admin/trello`` — ADMIN-ONLY and not grantable: the API key and the
  sealed token (they read every board their Trello member may open), the
  boards the platform reads and each board's two settings. The token goes in
  and never comes out; the register records only that it changed.
- ``/api/trello`` — the page: gated on the ``trello`` page key (admin-only
  until the operator opens it on the Access tab). Starting a read is the
  admin's.
"""
from __future__ import annotations

import logging
from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session, defer

from app.database import get_db
from app.models import TrelloBoard
from app.permissions import require_page
from app.routers.admin import verify_admin
from app.services import action_log, trello, trello_analytics

log = logging.getLogger(__name__)

admin_router = APIRouter(prefix="/api/admin/trello", tags=["trello"])
router = APIRouter(prefix="/api/trello", tags=["trello"])


def _who(p: dict) -> str:
    return p.get("full_name") or p.get("username") or str(p.get("telegram_id") or "admin")


def _iso(dt) -> Optional[str]:
    return dt.isoformat() if dt else None


def _board_out(row: TrelloBoard, *, with_lists: bool = False) -> dict:
    """A board's line. `with_lists` (the admin card) reads its snapshot for the
    card count and the lists; the page's lines never touch it."""
    out = {
        "id": row.id, "name": row.name, "url": row.url, "short_link": row.short_link,
        "read_at": _iso(row.read_at), "tried_at": _iso(row.tried_at), "error": row.error,
        "done_lists": row.done_lists, "archived_done": bool(row.archived_done),
    }
    if with_lists:
        data = row.data or {}
        out["cards"] = len(data.get("cards") or []) if data else None
        done, auto = trello_analytics.done_set(data.get("lists") or [], row.done_lists)
        out["lists"] = [{"id": l["id"], "name": l["name"], "done": l["id"] in done}
                        for l in sorted(data.get("lists") or [], key=lambda x: x.get("pos") or 0)
                        if not l.get("closed")]
        out["done_auto"] = auto
    return out


def _boards(db: Session, *, light: bool = False) -> list[TrelloBoard]:
    """Every board in its order. `light` leaves the snapshots unread (a page
    request reads only the board it shows — each can be megabytes)."""
    q = db.query(TrelloBoard)
    if light:
        q = q.options(defer(TrelloBoard.data))
    return q.order_by(TrelloBoard.position, TrelloBoard.created_at).all()


def _state(db: Session) -> dict:
    return {
        **trello.config(db),
        "boards": [_board_out(r, with_lists=True) for r in _boards(db)],
        "running": trello.running(),
        "max_boards": trello.MAX_BOARDS,
    }


def _err(exc: trello.TrelloError, status: int = 424):
    raise HTTPException(status_code=status, detail={"code": exc.code, "message": exc.message[:200]})


# ── the connection card (admin) ──────────────────────────────────────────────

@admin_router.get("")
def get_config(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return _state(db)


class ConfigIn(BaseModel):
    key: Optional[str] = Field(default=None, max_length=64)
    # Blank = keep the stored token; the form never holds it.
    token: Optional[str] = Field(default=None, max_length=200)
    clear_token: bool = False


@admin_router.put("")
def save_config(body: ConfigIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    try:
        changed = trello.save(db, key=body.key, token=(body.token or "").strip() or None,
                              clear_token=body.clear_token)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))
    details, changes = [], []
    if "key" in changed:
        old, new = changed["key"]
        changes.append(("key", old or None, new or None))
    if "token" in changed:
        tk = changed["token"]
        details.append(("token", "cleared" if tk == "cleared" else "set"))
        if tk != "cleared":
            details.append(("size", tk))
    action_log.enrich(target_kind="setting", target_id="trello", target_name="Trello",
                      details=details, changes=changes)
    log.info("trello: %s saved the connection (%s)", _who(admin), ", ".join(sorted(changed)) or "no change")
    return _state(db)


@admin_router.post("/test")
def test_config(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    result = trello.run_test(db)
    action_log.enrich(target_kind="setting", target_id="trello", target_name="Trello",
                      details=[("ok", result.get("ok")), ("error", result.get("error"))])
    return {**_state(db), "test": result}


class BoardIn(BaseModel):
    link: str = Field(min_length=4, max_length=500)


@admin_router.post("/boards")
def add_board(body: BoardIn, db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    """Add a board by its link (or its invite link), read it at once."""
    if db.query(func.count(TrelloBoard.id)).scalar() >= trello.MAX_BOARDS:
        raise HTTPException(status_code=400, detail={"code": "too_many"})
    try:
        b = trello.resolve_board(db, body.link)
    except trello.TrelloError as exc:
        _err(exc, 400 if exc.code in ("bad_link", "not_configured") else 424)
    row = db.get(TrelloBoard, b["id"])
    if row is not None:
        raise HTTPException(status_code=409, detail={"code": "exists", "name": row.name})
    top = db.query(func.max(TrelloBoard.position)).scalar()
    row = TrelloBoard(id=b["id"], name=b["name"], url=b["url"], short_link=b["short_link"],
                      position=(top or 0) + 1, added_by=_who(admin))
    db.add(row)
    db.commit()
    action_log.enrich(target_kind="trello_board", target_id=row.id, target_name=row.name)
    trello.start_sync(f"admin:{_who(admin)}", row.id)
    return _state(db)


class BoardSetIn(BaseModel):
    # None = leave; [] or a list = the lists that mean «done»; auto=True = by name.
    done_lists: Optional[List[str]] = None
    done_auto: bool = False
    archived_done: Optional[bool] = None


@admin_router.put("/boards/{board_id}")
def set_board(board_id: str, body: BoardSetIn, db: Session = Depends(get_db),
              _: dict = Depends(verify_admin)):
    row = db.get(TrelloBoard, board_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "no_board"})
    details = []
    if body.done_auto:
        row.done_lists = None
        details.append(("done_lists", "auto"))
    elif body.done_lists is not None:
        known = {l["id"] for l in (row.data or {}).get("lists") or []}
        row.done_lists = [i for i in dict.fromkeys(body.done_lists) if i in known]
        details.append(("done_lists", len(row.done_lists)))
    if body.archived_done is not None:
        row.archived_done = body.archived_done
        details.append(("archived_done", body.archived_done))
    db.commit()
    action_log.enrich(target_kind="trello_board", target_id=row.id, target_name=row.name, details=details)
    return _state(db)


@admin_router.delete("/boards/{board_id}")
def remove_board(board_id: str, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    """Stop reading a board. Only its stored copy goes; nothing in Trello."""
    row = db.get(TrelloBoard, board_id)
    if row is None:
        raise HTTPException(status_code=404, detail={"code": "no_board"})
    name = row.name
    db.delete(row)
    db.commit()
    action_log.enrich(target_kind="trello_board", target_id=board_id, target_name=name)
    return _state(db)


# ── the page ─────────────────────────────────────────────────────────────────

def _read_state(db: Session, rows: list[TrelloBoard]) -> dict:
    return {
        "configured": trello.configured(db),
        "running": trello.running(),
        "boards": [_board_out(r) for r in rows],
    }


@router.get("/analysis")
def get_analysis(
    board: Optional[str] = Query(default=None, max_length=32),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    label: List[str] = Query(default=[]),
    lst: List[str] = Query(default=[], alias="list"),
    db: Session = Depends(get_db),
    payload: dict = Depends(require_page("trello")),
):
    """One board, whole: the workflow snapshot, the oldest open cards and the
    flow over the period. With no board named, the first one."""
    rows = _boards(db, light=True)
    out = {"read": _read_state(db, rows), "is_admin": payload.get("role") == "admin", "board": None}
    row = next((r for r in rows if r.id == board), None) or (rows[0] if rows else None)
    if row is None:
        return out
    out["board"] = _board_out(row)
    if row.data:
        out.update(trello_analytics.build(row, date_from=date_from, date_to=date_to,
                                          labels=label, lists=lst))
    return out


@router.get("/read")
def get_read(db: Session = Depends(get_db), _: dict = Depends(require_page("trello"))):
    return _read_state(db, _boards(db, light=True))


@router.post("/read")
def start_read(db: Session = Depends(get_db), payload: dict = Depends(require_page("trello"))):
    """Read every board now (admin). Answers at once; the page polls `GET /read`."""
    if payload.get("role") != "admin":
        raise HTTPException(status_code=403, detail="admin only")
    if not trello.configured(db):
        raise HTTPException(status_code=409, detail={"code": "not_configured"})
    started = trello.start_sync(f"admin:{_who(payload)}")
    action_log.enrich(details=[("started", started)])
    return {"started": started, "read": _read_state(db, _boards(db, light=True))}
