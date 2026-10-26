"""The report door's HTTP side (services/ops_door.py, CLAUDE.md «The report
door»).

    POST /api/ops/asks                 — put ONE question to Burkhon or Abbos
    GET  /api/ops/asks/{token}         — where it stands (poll this)
    POST /api/ops/asks/{token}/take    — the answer, once, after «Ruxsat berish»
    GET  /api/ops/door                 — open or closed, and the reader role

Every route checks the ask key itself (`X-Ops-Key`, or `Authorization:
Bearer`); `/api/ops/` is outside the Telegram-origin wall
(security._EXEMPT_PREFIXES) and outside the action log's middleware, because
every row here is written by hand with the asker, the approver and what was
read — the middleware could only have named an anonymous POST.

`scripts/ask-prod.py` is the client: it asks, waits for the tap, takes.
"""
from __future__ import annotations

import json
import logging
from datetime import timedelta
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.database import SessionLocal, get_db
from app.models import OpsAsk
from app.services import action_log, ops_door, tg_later

router = APIRouter(prefix="/api/ops", tags=["ops-door"])
log = logging.getLogger("app.ops_door")


def _ip(request: Request) -> str:
    h = request.headers
    return (h.get("cf-connecting-ip") or h.get("x-real-ip")
            or (request.client.host if request.client else "") or "")[:64]


def _refuse(code: str, message: str, status: int) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def _key(request: Request) -> None:
    """The ask key, or 401 / 429. A wrong key is written to the Jurnal once
    per address per window — the first refusal says somebody tried; the next
    nine add nothing."""
    ip = _ip(request)
    if ops_door.throttled(ip):
        raise _refuse("throttled", "Too many wrong keys from this address — wait ten minutes.", 429)
    if ops_door.key_ok(ops_door.presented_key(request.headers)):
        return
    n = ops_door.note_bad(ip)
    if n == 1:
        action_log.record(category="sync_export", action="ops.key_refused", source="ops",
                          outcome="denied", actor_name="?",
                          details=[("ip", ip), ("path", request.url.path)])
    raise _refuse("bad_key", "Missing or wrong ask key.", 401)


class AskIn(BaseModel):
    verb: str                          # sql · get
    sql: Optional[str] = None
    path: Optional[str] = None
    params: Optional[dict[str, Any]] = None
    to: str                            # burkhon · abbos
    why: Optional[str] = None
    asker: Optional[str] = None        # «laptop» · «cloud» · a short session note
    as_app: bool = False               # SQL as the app's user (pg_stat_activity reads)


def _clean_text(v: Optional[str], cap: int) -> Optional[str]:
    if not v:
        return None
    v = " ".join(str(v).split())
    return v[:cap] or None


@router.post("/asks")
def ask(body: AskIn, request: Request, db: Session = Depends(get_db)):
    """Put one question to one person. Nothing runs here: the card goes out,
    and the answer waits for their tap."""
    _key(request)
    if not ops_door.door_open(db):
        _note_refusal(body, "door_closed", request)
        raise _refuse("door_closed", "The door is closed (/opsdoor in the bot opens it).", 403)
    verb = (body.verb or "").strip().lower()
    if verb not in ops_door.VERBS:
        raise _refuse("bad_verb", "verb must be «sql» or «get».", 400)
    who = (body.to or "").strip().lower()
    people = ops_door.approvers()
    if who not in people:
        raise _refuse("bad_approver", "to must be «burkhon» or «abbos».", 400)
    approver_tg = people[who]

    params = None
    try:
        if verb == "sql":
            query, _first = ops_door.check_sql(body.sql or "")
        else:
            query, params = ops_door.check_get(body.path or "", body.params)
            if not ops_door.is_admin(db, approver_tg):
                raise ops_door.Refused("approver_not_admin",
                                       f"A GET runs as the approver, and {who} holds no admin "
                                       "role here. Ask the other person.")
    except ops_door.Refused as r:
        _note_refusal(body, r.code, request)
        raise _refuse(r.code, r.message, r.status)

    # The two limits are counted under one lock, so asks fired together are
    # counted one after another rather than all passing an empty count.
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext('ops_door_ask'))"))
    now = ops_door._now()
    pending = (db.query(OpsAsk).filter(OpsAsk.status == "pending", OpsAsk.expires_at > now)
               .count())
    if pending >= ops_door.MAX_PENDING:
        raise _refuse("too_many_pending", f"{pending} questions are already waiting for a tap. "
                      "Wait for those first.", 429)
    hour = db.query(OpsAsk).filter(OpsAsk.created_at > now - timedelta(hours=1)).count()
    if hour >= ops_door.MAX_PER_HOUR:
        raise _refuse("rate_limited", f"{hour} questions in the last hour — the limit is "
                      f"{ops_door.MAX_PER_HOUR}.", 429)

    as_app = bool(body.as_app) if verb == "sql" else False
    row = OpsAsk(
        token=ops_door.new_token(), verb=verb, query=query, params=params or None,
        why=_clean_text(body.why, ops_door.MAX_WHY_CHARS),
        asker=_clean_text(body.asker, ops_door.MAX_ASKER_CHARS) or "Claude",
        as_app=as_app, run_as=ops_door.run_as_for(as_app) if verb == "sql" else None,
        approver_tg=approver_tg, approver_name=ops_door.person_name(db, approver_tg),
        status="pending", expires_at=now + ops_door.ASK_TTL, ip=_ip(request),
    )
    if not ops_door.card_fits(row):
        db.rollback()
        raise _refuse("card_too_long", "The question and its reason do not fit one Telegram "
                      "card. Shorten the query or the --why.", 400)
    db.add(row)
    db.commit()                     # the lock is released before Telegram is called
    db.refresh(row)
    sent = ops_door.send_card(db, row)
    if not sent:
        row.status, row.error, row.done_at = "failed", "card_not_sent", ops_door._now()
        db.commit()
        raise _refuse("card_failed", "Telegram did not take the card — nothing was asked. "
                      "Try again, or ask the other person.", 424)
    db.commit()
    action_log.record(db, category="sync_export", action="ops.asked", source="ops",
                      actor_name=row.asker, target_kind="ops_ask", target_id=row.token,
                      target_name=row.approver_name, reason=row.why,
                      details=_details(row) + [("ip", row.ip)])
    return ops_door.status_payload(row)


def _details(row: OpsAsk) -> list:
    out = [("ops_verb", row.verb), ("ops_to", row.approver_name),
           ("ops_question", ops_door.shown_question(row)[:1500])]
    if row.verb == "sql":
        tabs = ops_door.tables_of(row.query)
        if tabs:
            out.append(("ops_tables", ", ".join(tabs)))
        out.append(("ops_role", ops_door.READER_ROLE if row.run_as == "reader" else "app"))
    return out


def _note_refusal(body: AskIn, code: str, request: Request) -> None:
    action_log.record(category="sync_export", action="ops.ask_refused", source="ops",
                      outcome="refused", actor_name=_clean_text(body.asker, 60) or "Claude",
                      details=[("ops_verb", body.verb), ("ops_to", body.to),
                               ("ops_refusal", code), ("ip", _ip(request))])


def _get_row(db: Session, token: str, *, lock: bool = False) -> OpsAsk:
    q = db.query(OpsAsk).filter_by(token=token)
    if lock:
        q = q.with_for_update()
    row = q.first()
    if row is None:
        raise _refuse("not_found", "No such question.", 404)
    return row


@router.get("/asks/{token}")
def status(token: str, request: Request, db: Session = Depends(get_db)):
    """Where one question stands: pending · approved · denied · expired ·
    running · done · failed."""
    _key(request)
    row = _get_row(db, token, lock=True)
    if ops_door.expire_due(row):
        db.commit()
        action_log.record_system("sync_export", "ops.expired", db, target_kind="ops_ask",
                                 target_id=row.token)
        tg_later.run(ops_door.refresh_card, row.id)
    return ops_door.status_payload(row)


@router.get("/door")
def door(request: Request, db: Session = Depends(get_db)):
    _key(request)
    ok, why = ops_door.reader_role()
    return {"open": ops_door.door_open(db), "reader_role": ok, "reader_role_why": why,
            "approvers": sorted(ops_door.approvers()),
            "bounds": {"rows": ops_door.MAX_ROWS, "bytes": ops_door.MAX_BYTES,
                       "statement_timeout_ms": ops_door.STATEMENT_TIMEOUT_MS,
                       "query_chars": ops_door.MAX_QUERY_CHARS,
                       "ask_minutes": int(ops_door.ASK_TTL.total_seconds() // 60),
                       "take_minutes": int(ops_door.TAKE_TTL.total_seconds() // 60)}}


def _claim(token: str) -> dict:
    """approved → running, atomically, or the reason it cannot be. A row is
    taken once: whatever happens after this, it never runs again."""
    with SessionLocal() as db:
        row = _get_row(db, token, lock=True)
        if ops_door.expire_due(row):
            db.commit()
            action_log.record_system("sync_export", "ops.expired", db, target_kind="ops_ask",
                                     target_id=row.token)
            tg_later.run(ops_door.refresh_card, row.id)
            raise _refuse("expired", "The question expired before it was taken.", 410)
        if row.status == "pending":
            raise _refuse("not_allowed_yet", f"{row.approver_name} has not answered yet.", 409)
        if row.status == "denied":
            raise _refuse("denied", f"{row.approver_name} denied it.", 403)
        if row.status in ("running", "done", "failed"):
            raise _refuse("already_taken", "This answer was already taken — ask again.", 410)
        if row.status != "approved":
            raise _refuse("not_allowed", f"The question is {row.status}.", 409)
        if not ops_door.door_open(db):
            raise _refuse("door_closed", "The door was closed after the tap.", 403)
        row.status = "running"
        row.taken_at = ops_door._now()
        db.commit()
        return {"id": row.id, "token": row.token, "verb": row.verb, "query": row.query,
                "params": row.params or {}, "run_as": row.run_as or "app",
                "approver_tg": row.approver_tg, "approver_name": row.approver_name}


def _finish(claim: dict, result: dict, size: int) -> None:
    """The row's last state and its Jurnal row. Never raises: the answer is
    already built, and a bookkeeping failure must not cost it."""
    try:
        _finish_row(claim, result, size)
    except Exception:  # noqa: BLE001
        log.exception("ops door: could not close the row of %s", claim.get("token"))
    tg_later.run(ops_door.refresh_card, claim["id"])


def _finish_row(claim: dict, result: dict, size: int) -> None:
    with SessionLocal() as db:
        row = db.query(OpsAsk).filter_by(id=claim["id"]).with_for_update().first()
        if row is None or row.status != "running":
            return                      # the sweep already failed it — its verdict stands
        row.done_at = ops_door._now()
        row.result_ms = result.get("ms")
        row.result_bytes = size
        if result.get("ok"):
            row.status = "done"
            row.result_rows = (result.get("status") if row.verb == "get"
                               else result.get("row_count"))
            row.truncated = result.get("truncated")
        else:
            row.status = "failed"
            row.error = (result.get("error") or "")[:2000]
        db.commit()
        details = _details(row) + [("ops_ms", row.result_ms), ("ops_bytes", size)]
        if row.status == "done":
            details.append(("ops_rows", row.result_rows))
            if row.truncated:
                details.append(("ops_truncated", row.truncated))
            if result.get("masked"):
                details.append(("ops_masked", ", ".join(result["masked"])[:500]))
        else:
            details.append(("ops_error", row.error[:500]))
        action_log.record(db, category="sync_export", action="ops.taken", source="ops",
                          outcome="done" if row.status == "done" else "error",
                          actor_name=row.asker, target_kind="ops_ask", target_id=row.token,
                          target_name=row.approver_name, details=details)


@router.post("/asks/{token}/take")
async def take(token: str, request: Request):
    """The answer, once. Runs the approved question now — the SQL on the
    door's own read-only connection, the GET through this app as the
    approver — and hands it over; nothing of it is kept."""
    _key(request)
    # One answer at a time per process, SQL and GET alike. Taken BEFORE the
    # claim, so a refused «busy» leaves the row allowed and takeable.
    if not ops_door.try_begin():
        raise _refuse("busy", "Another answer is being read right now — try again in a moment.", 409)
    try:
        claim = await run_in_threadpool(_claim, token)
        tg_later.run(ops_door.refresh_card, claim["id"])      # «⏳ Olinmoqda»
        try:
            if claim["verb"] == "sql":
                def _run():
                    sql, first = ops_door.check_sql(claim["query"])
                    return ops_door.run_sql(sql, first, run_as=claim["run_as"])
                result = await run_in_threadpool(_run)
            else:
                result = await ops_door.run_get(claim["query"], claim["params"],
                                                approver_tg=claim["approver_tg"],
                                                approver_name=claim["approver_name"],
                                                token=claim["token"])
        except Exception as exc:  # noqa: BLE001 — a crash is the answer, and the row must close
            log.exception("ops door: take %s crashed", token)
            result = {"ok": False, "error": f"{exc.__class__.__name__}: {exc}"[:500], "ms": 0}
        out = {"token": claim["token"], "verb": claim["verb"],
               "question": claim["query"] if claim["verb"] == "sql"
               else ops_door.shown_question(_Shown(claim)), **result}
        body = await run_in_threadpool(
            lambda: json.dumps(out, ensure_ascii=False, default=str).encode())
        await run_in_threadpool(_finish, claim, result, len(body))
    finally:
        ops_door.end()
    return Response(content=body, media_type="application/json",
                    status_code=200 if result.get("ok") else 422)


class _Shown:
    """Enough of a row for `shown_question`."""

    def __init__(self, claim: dict):
        self.verb = claim["verb"]
        self.query = claim["query"]
        self.params = claim["params"]
