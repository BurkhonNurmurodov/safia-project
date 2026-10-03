"""«Verifix (test)» — the doors over ``app.services.verifix_explore`` (admin-only).

Every endpoint is a READ: of Verifix, through the login on the admin «Verifix»
card, and never of anything a person changes here — which is why none of them
is a POST and none lands in the action register. The one thing written is the
probe cache (`verifix_probes`), a copy of what a method answered.

ADMIN-ONLY, checked on every endpoint: the pages show every employee Verifix
holds, their photos and their marks.

Errors are answers the page can word: 409 ``not_configured`` (no login on the
card), 424 ``{code, message, status}`` when Verifix refused or failed (never a
502/503 — the client reads those as a server restart and waits), 404 for an
unknown id or photo, 400 for a value that cannot be sent.
"""
import json
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.admin import verify_admin
from app.services import verifix, verifix_explore as vx

router = APIRouter(prefix="/api/verifix-test", tags=["verifix-test"])

log = logging.getLogger(__name__)


def _who(admin: dict) -> str:
    return (admin.get("full_name") or admin.get("username")
            or str(admin.get("telegram_id") or "admin"))


def _run(fn, *args, **kwargs):
    try:
        return fn(*args, **kwargs)
    except vx.NotConfigured:
        raise HTTPException(status_code=409, detail={"code": "not_configured"})
    except verifix.VerifixError as exc:
        raise HTTPException(status_code=424, detail={
            "code": vx._classify(exc), "message": (exc.message or exc.code)[:500], "status": exc.status,
        })
    except LookupError as exc:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": str(exc)})
    except ValueError as exc:
        raise HTTPException(status_code=400, detail={"code": "bad_value", "message": str(exc)})


@router.get("/meta")
def vx_meta(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return vx.meta(db)


@router.get("/methods")
def vx_methods(db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return vx.methods(db)


@router.get("/methods/rows")
def vx_method_rows(key: str, params: Optional[str] = None, cursor: Optional[str] = None,
                   limit: Optional[int] = None, db: Session = Depends(get_db),
                   admin: dict = Depends(verify_admin)):
    given = None
    if params:
        try:
            given = json.loads(params)
        except ValueError:
            raise HTTPException(status_code=400, detail={"code": "bad_value", "message": "params"})
        if not isinstance(given, dict):
            raise HTTPException(status_code=400, detail={"code": "bad_value", "message": "params"})
    return _run(vx.method_rows, db, key, given, cursor, limit, _who(admin))


@router.get("/structure")
def vx_structure(force: bool = False, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return _run(vx.structure, db, force)


@router.get("/employees")
def vx_employees(status: str = "W", force: bool = False, db: Session = Depends(get_db),
                 _: dict = Depends(verify_admin)):
    return _run(vx.employees, db, status, force)


@router.get("/employees/{employee_id}")
def vx_person(employee_id: str, force: bool = False, db: Session = Depends(get_db),
              _: dict = Depends(verify_admin)):
    return _run(vx.person, db, employee_id, force)


@router.get("/jobs")
def vx_jobs(force: bool = False, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return _run(vx.jobs, db, force)


@router.get("/schedules/{schedule_id}/days")
def vx_schedule_days(schedule_id: str, year: Optional[int] = None, db: Session = Depends(get_db),
                     _: dict = Depends(verify_admin)):
    return _run(vx.schedule_days, db, schedule_id, year)


@router.get("/timesheet")
def vx_timesheet(day: Optional[date] = None, force: bool = False, db: Session = Depends(get_db),
                 _: dict = Depends(verify_admin)):
    from app.services.verifix_live import now_local
    return _run(vx.timesheet, db, day or now_local().date(), force)


@router.get("/marks")
def vx_marks(day: Optional[date] = None, start: int = 0, hours: int = 2, force: bool = False,
             db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    from app.services.verifix_live import now_local
    return _run(vx.marks, db, day or now_local().date(), start, hours, force)


@router.get("/marks/{track_id}")
def vx_track(track_id: str, employee_id: Optional[str] = None, day: Optional[date] = None,
             db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return _run(vx.track_detail, db, track_id, employee_id, day)


@router.get("/locations")
def vx_locations(force: bool = False, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    return _run(vx.locations, db, force)


@router.get("/onsite")
def vx_onsite(location_id: str, day: Optional[date] = None, force: bool = False,
              db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    from app.services.verifix_live import now_local
    return _run(vx.onsite, db, location_id, day or now_local().date(), force)


@router.get("/photo/{sha}")
def vx_photo(sha: str, size: int = 96, db: Session = Depends(get_db), _: dict = Depends(verify_admin)):
    body = _run(vx.photo, db, sha, size)
    return Response(content=body, media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=86400"})
