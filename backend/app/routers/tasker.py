"""The Tasker connection card — `/panel/tasker`.

Three doors over ``app.services.tasker``: read what is stored, store it, run
the connection test. ADMIN-ONLY and not grantable, like the Verifix card: the
token reads every factory department's inspections.

The GET shows the stored token to the admin (the operator's call, 2026-11-12 —
a masked token can't be checked against the one Tasker issued); the action
register records that it changed and its length — never the value.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.admin import verify_admin
from app.routers.verifix import _who
from app.services import action_log, tasker

router = APIRouter(prefix="/api/admin/tasker", tags=["tasker"])

log = logging.getLogger(__name__)


def _state(db: Session) -> dict:
    cfg = tasker.config(db)
    return {**cfg, "default_base": tasker.PROD_BASE, "last_test": tasker.last_test(db)}


@router.get("")
def get_tasker(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return _state(db)


class TaskerIn(BaseModel):
    base: Optional[str] = Field(default=None, max_length=200)
    # Sent only when edited; an emptied field sends `clear_token` instead.
    token: Optional[str] = Field(default=None, max_length=300)
    clear_token: bool = False


@router.put("")
def save_tasker(body: TaskerIn, db: Session = Depends(get_db),
                admin: dict = Depends(verify_admin)):
    try:
        changed = tasker.save(db, base=body.base, token=(body.token or "").strip() or None,
                              clear_token=body.clear_token)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))

    # THAT the token changed and its length — never the value.
    details, changes = [], []
    if "base" in changed:
        old, new = changed["base"]
        changes.append(("base", old, new))
    if "token" in changed:
        t = changed["token"]
        details.append(("token", "cleared" if t == "cleared" else "set"))
        if t != "cleared":
            details.append(("size", t))
    action_log.enrich(target_kind="setting", target_id="tasker",
                      target_name="Tasker", details=details, changes=changes)
    log.info("tasker: %s saved the connection (%s)", _who(admin),
             ", ".join(sorted(changed)) or "no change")
    return _state(db)


@router.post("/test")
def test_tasker(db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    result = tasker.run_test(db, actor=_who(admin))
    steps = {s["key"]: s for s in result.get("steps", [])}
    details = [("verdict", result.get("verdict"))]
    for key in ("departments", "checklists"):
        if steps.get(key, {}).get("ok"):
            details.append((key, steps[key].get("total")))
    action_log.enrich(target_kind="setting", target_id="tasker",
                      target_name="Tasker", details=details)
    return result
