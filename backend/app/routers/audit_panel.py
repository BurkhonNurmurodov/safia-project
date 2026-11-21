"""The audit-panel connection card — `/panel/auditpanel` (docs/audits.md).

Three doors over ``app.services.audit_panel``: read what is stored, store it,
run the discovery test. ADMIN-ONLY and not grantable, like the Verifix and
Tasker cards: the login reads every audit the panel holds.

The password goes in and never comes out — the GET says only whether one is
stored and whether it still opens (the Verifix model); the action register
records that it changed and its length, never the value.
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.admin import verify_admin
from app.routers.verifix import _who
from app.services import action_log, audit_panel

router = APIRouter(prefix="/api/admin/audit-panel", tags=["audit-panel"])

log = logging.getLogger(__name__)


def _state(db: Session) -> dict:
    return {**audit_panel.public(audit_panel.config(db)), "last_test": audit_panel.last_test(db)}


@router.get("")
def get_audit_panel(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return _state(db)


class AuditPanelIn(BaseModel):
    url: Optional[str] = Field(default=None, max_length=500)
    login: Optional[str] = Field(default=None, max_length=120)
    # Blank = keep the stored password; the form never holds it.
    password: Optional[str] = Field(default=None, max_length=200)
    clear_password: bool = False


@router.put("")
def save_audit_panel(body: AuditPanelIn, db: Session = Depends(get_db),
                     admin: dict = Depends(verify_admin)):
    try:
        changed = audit_panel.save(db, url=body.url, login=body.login,
                                   password=body.password or None,
                                   clear_password=body.clear_password)
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))

    # THAT the password changed and its length — never the value.
    details, changes = [], []
    for key in ("url", "login"):
        if key in changed:
            old, new = changed[key]
            changes.append((key, old, new))
    if "password" in changed:
        pw = changed["password"]
        details.append(("password", "cleared" if pw == "cleared" else "set"))
        if pw != "cleared":
            details.append(("size", pw))
    action_log.enrich(target_kind="setting", target_id="audit_panel",
                      target_name="Audit paneli", details=details, changes=changes)
    log.info("audit panel: %s saved the connection (%s)", _who(admin),
             ", ".join(sorted(changed)) or "no change")
    return _state(db)


@router.post("/test")
def test_audit_panel(db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    result = audit_panel.run_test(db, actor=_who(admin))
    action_log.enrich(target_kind="setting", target_id="audit_panel", target_name="Audit paneli",
                      details=[("verdict", result.get("verdict")),
                               ("answered", sum(1 for s in result.get("samples") or [] if s.get("ok")))])
    return result
