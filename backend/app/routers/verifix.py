"""The Verifix connection card — `/admin/upload?tab=verifix`.

Three doors over ``app.services.verifix``: read what is stored, store it, and
run the connection test. ADMIN-ONLY and not grantable — the card holds the
login the platform will read every employee's attendance with, so handing it
to a grantee would hand out that reach (the `permissions` / `logs` model).

The password goes in and never comes out: the GET says only whether one is
stored and whether it still opens, the PUT keeps it on a blank field, and the
action register records that it changed and its length — never the value.
"""
import logging
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.admin import verify_admin
from app.services import action_log, verifix, verifix_parity

router = APIRouter(prefix="/api/admin/verifix", tags=["verifix"])

log = logging.getLogger(__name__)


def _who(admin: dict) -> str:
    return (admin.get("full_name") or admin.get("username")
            or str(admin.get("telegram_id") or "admin"))


def _state(db: Session) -> dict:
    cfg = verifix.config(db)
    return {
        "login": cfg["login"],
        "password_set": cfg["password_set"],
        "password_readable": cfg["password_readable"],
        "filial_id": cfg["filial_id"],
        "host": cfg["host"],
        "default_host": verifix.DEFAULT_HOST,
        "last_test": verifix.last_test(db),
        "last_parity": verifix_parity.last_parity(db),
        "parity_default": [d.isoformat() for d in verifix_parity.default_range()],
        "parity_max": (datetime.now(verifix.TZ).date() - timedelta(days=1)).isoformat(),
        "parity_max_days": verifix_parity.MAX_DAYS,
    }


@router.get("")
def get_verifix(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return _state(db)


class VerifixIn(BaseModel):
    login: Optional[str] = Field(default=None, max_length=120)
    # Blank = keep the stored password; the form never holds it.
    password: Optional[str] = Field(default=None, max_length=200)
    clear_password: bool = False
    filial_id: Optional[str] = Field(default=None, max_length=20)
    host: Optional[str] = Field(default=None, max_length=120)


@router.put("")
def save_verifix(body: VerifixIn, db: Session = Depends(get_db),
                 admin: dict = Depends(verify_admin)):
    try:
        changed = verifix.save(
            db,
            login=body.login,
            password=(body.password or "").strip() or None,
            clear_password=body.clear_password,
            filial_id=body.filial_id,
            host=body.host,
        )
    except ValueError as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(exc))

    # THAT the password changed and its length — never the value. A secret in
    # the register is a secret in every export of the register.
    details, changes = [], []
    for field in ("login", "filial_id", "host"):
        if field in changed:
            old, new = changed[field]
            changes.append((field, old or None, new or None))
    if "password" in changed:
        pw = changed["password"]
        details.append(("password", "cleared" if pw == "cleared" else "set"))
        if pw != "cleared":
            details.append(("size", pw))
    action_log.enrich(target_kind="setting", target_id="verifix",
                      target_name="Verifix", details=details, changes=changes)
    log.info("verifix: %s saved the connection (%s)", _who(admin),
             ", ".join(sorted(changed)) or "no change")
    return _state(db)


@router.post("/test")
def test_verifix(db: Session = Depends(get_db), admin: dict = Depends(verify_admin)):
    result = verifix.run_test(db, actor=_who(admin))
    steps = {s["key"]: s for s in result.get("steps", [])}
    details = [("verdict", result.get("verdict"))]
    for key, field in (("employees", "total"), ("divisions", "total"),
                       ("timesheet", "rows")):
        if steps.get(key, {}).get("ok"):
            details.append((key, steps[key].get(field)))
    # The test itself always RAN — its verdict is a detail, not the outcome
    # (the register's four outcomes are about the request, and this one ended).
    action_log.enrich(target_kind="setting", target_id="verifix",
                      target_name="Verifix", details=details)
    return result


class ParityIn(BaseModel):
    date_from: date
    date_to: date


@router.post("/parity")
def parity_verifix(body: ParityIn, db: Session = Depends(get_db),
                   admin: dict = Depends(verify_admin)):
    """Verifix against the uploaded Excel for a few past days — read-only on
    both sides; see ``services/verifix_parity``."""
    d0, d1 = body.date_from, body.date_to
    yesterday = datetime.now(verifix.TZ).date() - timedelta(days=1)
    if d0 > d1:
        raise HTTPException(status_code=400, detail="date_from is after date_to")
    if d1 > yesterday:
        raise HTTPException(status_code=400, detail="only finished days can be compared")
    if (d1 - d0).days + 1 > verifix_parity.MAX_DAYS:
        raise HTTPException(status_code=400,
                            detail=f"at most {verifix_parity.MAX_DAYS} days at a time")
    result = verifix_parity.run(db, d0, d1, actor=_who(admin))
    tot = result.get("totals") or {}
    hours = result.get("hours") or {}
    details = [("verdict", result.get("verdict")), ("from", d0.isoformat()),
               ("to", d1.isoformat())]
    for key in ("file_came", "api_came", "matched", "same_cell", "clock_same"):
        if key in tot:
            details.append((key, tot[key]))
    if hours:
        details.append(("hours_exact", f"{hours.get('exact')}/{hours.get('n')}"))
    action_log.enrich(target_kind="setting", target_id="verifix",
                      target_name="Verifix", details=details)
    return result
