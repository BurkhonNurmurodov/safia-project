from typing import Annotated, List, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jwt import PyJWTError as JWTError
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import Attendance, Language, Manager, Translation

# Dynamic DB-value translations (brigadir names, job titles, worker FIOs) are
# stored in the same table under this key prefix, e.g. "name.Иванов И.И.".
NAME_PREFIX = "name."

router = APIRouter(prefix="/api", tags=["translations"])

_oauth2 = OAuth2PasswordBearer(tokenUrl="/api/auth/webapp")


def _caller(token: Annotated[str, Depends(_oauth2)]):
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")


def _require_admin(caller=Depends(_caller)):
    if caller.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    return caller


# ── Public: languages + overrides (consumed by the runtime LangContext) ─────────

@router.get("/translations")
def get_translations(db: Session = Depends(get_db)):
    langs = db.query(Language).order_by(Language.sort_order, Language.code).all()
    overrides: dict[str, dict[str, str]] = {}
    # name.* keys hold worker/brigadir names (PII) — served only via the
    # authenticated /translations/names endpoint below.
    for t in db.query(Translation).filter(Translation.key.notlike(NAME_PREFIX + "%")).all():
        overrides.setdefault(t.lang, {})[t.key] = t.value
    return {
        "languages": [{"code": l.code, "name": l.name, "is_builtin": l.is_builtin} for l in langs],
        "overrides": overrides,
    }


@router.get("/translations/names")
def get_name_translations(caller=Depends(_caller), db: Session = Depends(get_db)):
    """Name overrides (name.* keys) for the runtime tl() helper. Requires login
    because the keys themselves are employee names."""
    overrides: dict[str, dict[str, str]] = {}
    for t in db.query(Translation).filter(Translation.key.like(NAME_PREFIX + "%")).all():
        overrides.setdefault(t.lang, {})[t.key] = t.value
    return {"overrides": overrides}


# ── Admin: edit overrides, add keys, add languages ──────────────────────────────

@router.get("/admin/translations/names")
def list_translatable_names(caller=Depends(_require_admin), db: Session = Depends(get_db)):
    """Distinct DB values the admin can translate, grouped by kind. Used by the
    translations editor to auto-populate the name groups."""
    def _clean(rows):
        return sorted({(r[0] or "").strip() for r in rows} - {""})

    return {
        "brigadirs": _clean(db.query(Manager.name).distinct().all()),
        "job_titles": _clean(db.query(Attendance.job_title).distinct().all()),
        "workers": _clean(db.query(Attendance.worker_name).distinct().all()),
    }

class TranslationItem(BaseModel):
    lang: str
    key: str
    value: str


class TranslationBatch(BaseModel):
    items: List[TranslationItem]


@router.put("/admin/translations")
def upsert_translations(body: TranslationBatch, caller=Depends(_require_admin), db: Session = Depends(get_db)):
    for it in body.items:
        key = it.key.strip()
        lang = it.lang.strip()
        if not key or not lang:
            continue
        row = db.query(Translation).filter_by(lang=lang, key=key).first()
        val = it.value
        if row:
            if val == "":
                db.delete(row)          # empty → clear the override (fall back to default)
            else:
                row.value = val
        elif val != "":
            db.add(Translation(lang=lang, key=key, value=val))
    db.commit()
    return {"ok": True, "count": len(body.items)}


class NewKey(BaseModel):
    key: str
    values: dict[str, str] = {}   # {lang: value}


@router.post("/admin/translations/keys")
def add_key(body: NewKey, caller=Depends(_require_admin), db: Session = Depends(get_db)):
    key = body.key.strip()
    if not key:
        raise HTTPException(status_code=400, detail="Key required")
    for lang, value in body.values.items():
        if value == "":
            continue
        row = db.query(Translation).filter_by(lang=lang, key=key).first()
        if row:
            row.value = value
        else:
            db.add(Translation(lang=lang, key=key, value=value))
    db.commit()
    return {"ok": True, "key": key}


class NewLanguage(BaseModel):
    code: str
    name: str


@router.post("/admin/translations/languages")
def add_language(body: NewLanguage, caller=Depends(_require_admin), db: Session = Depends(get_db)):
    code = body.code.strip().lower()
    name = body.name.strip()
    if not code or not name:
        raise HTTPException(status_code=400, detail="code and name required")
    existing = db.query(Language).filter_by(code=code).first()
    if existing:
        existing.name = name
    else:
        nxt = (db.query(Language).count() or 0) + 10
        db.add(Language(code=code, name=name, is_builtin=False, sort_order=nxt))
    db.commit()
    return {"ok": True, "code": code, "name": name}
