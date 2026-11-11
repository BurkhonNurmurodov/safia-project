"""«API» (/api-access): a person's own tokens for the external read API, and
its manual as a PDF or a Markdown file in the language they pick.
services/api_tokens.py is the model; routers/ext_api.py is what a token opens.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app import identity
from app.database import get_db
from app.models import ApiToken
from app.permissions import require_page
from app.services import api_tokens, assistant_documents, ext_api_manual
from app.xlsx_delivery import deliver_file

router = APIRouter(prefix="/api/api-tokens", tags=["api-tokens"])


def _mine(db: Session, payload: dict):
    return int(payload["sub"]), identity.viewer_profile_key(db, payload)


def _row(r: ApiToken, tid: int, key: Optional[str]) -> dict:
    return {
        "id": r.id, "name": r.name, "prefix": r.prefix, "owner": r.owner_name,
        "mine": r.owner_tid == tid and r.owner_key == key,
        "created_at": r.created_at.isoformat(), "expires_at": r.expires_at.isoformat(),
        "last_used_at": r.last_used_at.isoformat() if r.last_used_at else None,
        "state": api_tokens.state(r), "never": api_tokens.never(r),
    }


@router.get("")
def list_tokens(payload: dict = Depends(require_page(api_tokens.PAGE)), db: Session = Depends(get_db)):
    """The caller's own tokens; an admin sees everybody's. Revoked ones are gone."""
    tid, key = _mine(db, payload)
    q = db.query(ApiToken).filter(ApiToken.revoked_at.is_(None))
    if payload.get("role") != "admin":
        q = q.filter(ApiToken.owner_tid == tid, ApiToken.owner_key == key)
    return {"tokens": [_row(r, tid, key) for r in q.order_by(ApiToken.created_at.desc()).all()],
            "base_url": ext_api_manual.BASE_URL, "days": list(api_tokens.DAYS)}


class TokenIn(BaseModel):
    name: str
    days: int


@router.post("")
def create_token(body: TokenIn, payload: dict = Depends(require_page(api_tokens.PAGE)),
                 db: Session = Depends(get_db)):
    name = body.name.strip()[:80]
    if not name:
        raise HTTPException(status_code=400, detail={"code": "no_name", "message": "Name the token."})
    if body.days not in api_tokens.DAYS:
        raise HTTPException(status_code=400, detail={"code": "bad_days", "message": "Pick 30, 90 or 365 days, or 0 for never."})
    tid, key = _mine(db, payload)
    active = [r for r in db.query(ApiToken).filter(
        ApiToken.owner_tid == tid, ApiToken.owner_key == key, ApiToken.revoked_at.is_(None)).all()
        if api_tokens.state(r) == "active"]
    if len(active) >= api_tokens.MAX_ACTIVE:
        raise HTTPException(status_code=409, detail={
            "code": "too_many", "message": f"At most {api_tokens.MAX_ACTIVE} active tokens — revoke one first."})
    token, row = api_tokens.mint(db, payload, name, body.days)
    return {"token": token, **_row(row, tid, key)}


@router.delete("/{token_id}")
def revoke_token(token_id: int, payload: dict = Depends(require_page(api_tokens.PAGE)),
                 db: Session = Depends(get_db)):
    tid, key = _mine(db, payload)
    row = db.get(ApiToken, token_id)
    if row is None or row.revoked_at is not None or not (
            payload.get("role") == "admin" or (row.owner_tid == tid and row.owner_key == key)):
        raise HTTPException(status_code=404, detail={"code": "no_token", "message": "No such token."})
    row.revoked_at = api_tokens._now()
    db.commit()
    return {"ok": True}


@router.get("/manual")
def manual(request: Request, lang: str = Query("ru"), format: str = Query("pdf"),  # noqa: A002
           payload: dict = Depends(require_page(api_tokens.PAGE))):
    """The manual in `lang`, as `pdf` or `md` — downloaded in a browser, sent
    to the caller's chat inside Telegram (xlsx_delivery)."""
    if format not in ("pdf", "md"):
        raise HTTPException(status_code=400, detail={"code": "bad_format", "message": "pdf or md."})
    doc = ext_api_manual.manual(lang)
    ext, mime, data = assistant_documents.build(
        format, doc["title"], doc["subtitle"], assistant_documents.normalise(doc["blocks"]))
    return deliver_file(request, payload, f"safia-ims-api-{doc['lang']}.{ext}", data, mime,
                        caption=doc["title"])
