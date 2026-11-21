"""The Tasker connection card — `/panel/tasker`.

Three doors over ``app.services.tasker``: read what is stored, store it, run
the connection test. An admin or the tab's grant (`admin.tab.tasker`; the
«/panel» doors `admin.tab.sdpanel`, 2026-11-19), like the Verifix card: the
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
from app.capabilities import require_tab
from app.routers.verifix import _who
from app.services import action_log, panel_audits, sd_panel, tasker

router = APIRouter(prefix="/api/admin/tasker", tags=["tasker"])

log = logging.getLogger(__name__)


def _state(db: Session) -> dict:
    cfg = tasker.config(db)
    return {**cfg, "default_base": tasker.PROD_BASE, "last_test": tasker.last_test(db)}


@router.get("")
def get_tasker(db: Session = Depends(get_db), _: dict = Depends(require_tab("tasker"))):
    return _state(db)


class TaskerIn(BaseModel):
    base: Optional[str] = Field(default=None, max_length=200)
    # Sent only when edited; an emptied field sends `clear_token` instead.
    token: Optional[str] = Field(default=None, max_length=300)
    clear_token: bool = False


@router.put("")
def save_tasker(body: TaskerIn, db: Session = Depends(get_db),
                admin: dict = Depends(require_tab("tasker"))):
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
def test_tasker(db: Session = Depends(get_db), admin: dict = Depends(require_tab("tasker"))):
    result = tasker.run_test(db, actor=_who(admin))
    steps = {s["key"]: s for s in result.get("steps", [])}
    details = [("verdict", result.get("verdict"))]
    for key in ("departments", "checklists"):
        if steps.get(key, {}).get("ok"):
            details.append((key, steps[key].get("total")))
    action_log.enrich(target_kind="setting", target_id="tasker",
                      target_name="Tasker", details=details)
    return result


# ── panel.safiabakery.uz — the technical audit's «Минусы» (services/sd_panel.py) ──
# The same «Задачник (фабрика)», read from its web panel with a login: that
# report has no API. An admin or the «sdpanel» tab's grant; the GET shows the
# stored password to them (the 2026-11-12 ruling), the register only its length.

_PANEL = {"target_kind": "setting", "target_id": "sdpanel", "target_name": "panel.safiabakery.uz"}


def _panel_state(db: Session) -> dict:
    return {**sd_panel.config(db), "url": sd_panel.REPORT_URL, "last": sd_panel.last(db),
            "audits": panel_audits.summary(db)}


@router.get("/panel")
def get_panel(db: Session = Depends(get_db), _: dict = Depends(require_tab("sdpanel"))):
    return _panel_state(db)


class PanelIn(BaseModel):
    user: Optional[str] = Field(default=None, max_length=200)
    # Sent only when edited; an emptied field sends `clear_password` instead.
    password: Optional[str] = Field(default=None, max_length=200)
    clear_password: bool = False


@router.put("/panel")
def save_panel(body: PanelIn, db: Session = Depends(get_db),
               admin: dict = Depends(require_tab("sdpanel"))):
    changed = sd_panel.save(db, user=body.user, password=body.password or None,
                            clear_password=body.clear_password)
    details = list(changed.items())  # the password as its LENGTH
    action_log.enrich(**_PANEL, details=details)
    log.info("sd_panel: %s saved the login (%s)", _who(admin), ", ".join(sorted(changed)) or "no change")
    return _panel_state(db)


@router.post("/panel/fetch")
def fetch_panel(db: Session = Depends(get_db), admin: dict = Depends(require_tab("sdpanel"))):
    res = sd_panel.fetch(db, actor=_who(admin))
    action_log.enrich(**_PANEL, details=[("rows", len(res["rows"]))] if res["ok"]
                      else [("error", res["code"])])
    return res


@router.post("/panel/check")
def check_panel(db: Session = Depends(get_db), admin: dict = Depends(require_tab("sdpanel"))):
    """Sign in and read this month of both audit kinds — the card's one check,
    the same read «Auditlar» keeps (services/panel_audits.py)."""
    res = panel_audits.check(db, actor=_who(admin))
    action_log.enrich(**_PANEL, details=[("check", "ok" if res.get("ok") else res.get("code") or "partial")])
    return {**_panel_state(db), "check": res}
