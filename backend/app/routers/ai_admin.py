"""The admin «AI kalitlari» tab's HTTP surface (from 2026-10-19).

Every AI API key the platform holds is stored here (services/ai_keys), and
every feature that calls an AI is told here which key and which model it runs
on (services/ai_features). Admin-only, NOT grantable, and never from an «open
as» tab: these doors hand out the platform's paid accounts.

A key's value never comes back — the list carries its last four characters —
and the action register records the provider, that hint and the LENGTH.
Every write answers with the whole tab (`overview`), so the page replaces its
data in one step instead of re-asking.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database import get_db
from app.routers.admin import verify_admin
from app.services import action_log, ai_features, ai_keys

log = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/ai", tags=["ai-keys"])


def _admin(payload: dict = Depends(verify_admin)) -> dict:
    if payload.get("imp"):
        raise HTTPException(status_code=403, detail="admin_only")
    return payload


def _actor(admin: dict) -> tuple[str, int | None]:
    who = (admin.get("full_name") or admin.get("username")
           or str(admin.get("telegram_id") or admin.get("sub") or "admin"))
    try:
        tg = int(admin.get("telegram_id") or admin.get("sub") or 0) or None
    except (TypeError, ValueError):
        tg = None
    return who, tg


def _kick_review() -> None:
    """The reviewer's drain may not be scheduled yet — boot declines to arm it
    without a key — so a key given to it arms the job and drains what is
    already queued (nothing more: switching it on and deciding what it reads
    are two acts)."""
    try:
        from app.services import leader_ai
        leader_ai.register_drain_job()
        leader_ai.run_async(discover_first=False)
    except Exception:
        log.exception("ai-keys: could not arm or kick the reviewer's drain")


@router.get("")
def overview(db: Session = Depends(get_db), _: dict = Depends(_admin)):
    """The whole tab: features (key, model, status, last use, this month),
    saved keys (who uses them, last test), the providers' model catalog."""
    return ai_features.overview(db)


class NewKeyIn(BaseModel):
    provider: str = Field(..., max_length=20)
    key: str = Field(..., min_length=8, max_length=400)
    label: str = Field(default="", max_length=60)


@router.post("/keys")
def add_key(body: NewKeyIn, db: Session = Depends(get_db), admin: dict = Depends(_admin)):
    """Save a key. Tested at once (its model list is read with it): a key the
    provider rejects is refused, not stored. A new key runs nothing until a
    feature is moved onto it."""
    who, tg = _actor(admin)
    raw = body.key.strip()
    try:
        row = ai_keys.add_key(db, body.provider, raw, body.label, who, tg)
    except ai_keys.KeyRefused as exc:
        raise HTTPException(status_code=400, detail={"code": "key_refused", "message": str(exc)})
    except ValueError as exc:
        code = "duplicate" if "already saved" in str(exc) else "invalid"
        raise HTTPException(status_code=400, detail={"code": code, "message": str(exc)})
    log.info("ai-keys: %s added a %s key (%s chars, test %s)", who, row.provider, len(raw),
             "ok" if row.test_ok else "failed")
    action_log.enrich(target_kind="ai_key", target_id=str(row.id), target_name=row.label or None,
                      details=[("provider", row.provider), ("hint", row.hint or ""),
                               ("size", len(raw)), ("test", "ok" if row.test_ok else "failed")])
    return {"ok": True, "key": ai_keys.to_dict(row), "overview": ai_features.overview(db)}


class LabelIn(BaseModel):
    label: str = Field(default="", max_length=60)


@router.put("/keys/{key_id}")
def rename_key(key_id: str, body: LabelIn, db: Session = Depends(get_db),
               admin: dict = Depends(_admin)):
    """Name a key (the .env one is named on the server, not here)."""
    from app.models import AiKey

    try:
        ref = ai_keys.norm_ref(key_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such key")
    row = db.get(AiKey, int(ref)) if ref != ai_keys.ENV_ID else None
    if row is None:
        raise HTTPException(status_code=404, detail="No such key")
    before = row.label or ""
    row = ai_keys.rename_key(db, ref, body.label)
    action_log.enrich(target_kind="ai_key", target_id=str(row.id), target_name=row.label or None,
                      changes=[("label", before or "—", row.label or "—")])
    return {"ok": True, "overview": ai_features.overview(db)}


@router.post("/keys/{key_id}/test")
def test_key(key_id: str, db: Session = Depends(get_db), _: dict = Depends(_admin)):
    """Re-test a key: reads its provider's model list, stores the outcome and
    the list the model pickers offer."""
    try:
        info = ai_keys.test_key(db, key_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such key")
    action_log.enrich(target_kind="ai_key", target_id=str(info.get("id")),
                      details=[("provider", info.get("provider")), ("hint", info.get("hint")),
                               ("test", "ok" if info.get("testOk") else "failed")])
    return {"ok": True, "key": info, "overview": ai_features.overview(db)}


@router.delete("/keys/{key_id}")
def delete_key(key_id: str, db: Session = Depends(get_db), admin: dict = Depends(_admin)):
    """Delete a key. Refused (409) while any feature runs on it — the answer
    names them; move them first. The .env key cannot be deleted here."""
    who, _ = _actor(admin)
    try:
        info = ai_keys.delete_key(db, key_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="No such key")
    except PermissionError:
        raise HTTPException(status_code=403, detail={"code": "env_key"})
    except ai_keys.InUse as exc:
        raise HTTPException(status_code=409, detail={"code": "in_use", "features": exc.features})
    log.info("ai-keys: %s deleted a %s key (…%s)", who, info["provider"], info["hint"])
    action_log.enrich(target_kind="ai_key", target_id=str(key_id), target_name=info["label"] or None,
                      details=[("provider", info["provider"]), ("hint", info["hint"])])
    return {"ok": True, "overview": ai_features.overview(db)}


class FeatureIn(BaseModel):
    keyRef: str | int | None = None
    model: str | None = Field(default=None, max_length=80)


@router.put("/features/{feature}")
def set_feature(feature: str, body: FeatureIn, db: Session = Depends(get_db),
                admin: dict = Depends(_admin)):
    """Move ONE feature onto a key + model (or switch it off: keyRef null).
    The pair is checked with one tiny real call first — a key the provider
    refuses or a model it does not serve is refused (400) and nothing
    changes; a check that could not finish saves the pick and says so."""
    who, tg = _actor(admin)
    if feature not in ai_features.BY_ID:
        raise HTTPException(status_code=404, detail="No such feature")
    before = ai_features.resolve(feature, db)
    try:
        out = ai_features.assign(db, feature, body.keyRef, body.model or "", who, tg)
    except KeyError:
        raise HTTPException(status_code=404, detail={"code": "no_key"})
    except ai_keys.BadModel as exc:
        raise HTTPException(status_code=400, detail={"code": "bad_model", "message": str(exc)})
    except ai_features.Refused as exc:
        raise HTTPException(status_code=400, detail={"code": f"refused_{exc.kind}",
                                                     "message": str(exc)})
    after = ai_features.resolve(feature, db)
    log.info("ai-keys: %s moved %s to %s · %s (…%s)", who, feature,
             after.provider or "off", after.model or "—", after.hint or "")
    action_log.enrich(
        target_kind="ai_feature", target_id=feature,
        changes=[("provider", before.provider or "—", after.provider or "—"),
                 ("model", before.model or "—", after.model or "—"),
                 ("key", f"…{before.hint}" if before.hint else "—",
                  f"…{after.hint}" if after.hint else "—")],
        details=[("check", "ok" if out["check"].get("ok") else
                  ("not run" if out["check"].get("ok") is None else "failed"))])
    if feature == "review" and after.key:
        _kick_review()
    return {"ok": True, "check": out["check"], "overview": ai_features.overview(db)}
