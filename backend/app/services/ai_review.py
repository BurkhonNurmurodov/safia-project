"""THE door the proof reviewer reads its AI through — which provider, which key,
which model — and the store those come from (`ai_keys`).

From 2026-10-19 (the operator's request: save several API keys, switch between
them at any time, pick the model per AI) the reviewer runs on exactly ONE saved
key at a time, on a model chosen for that key. `leader_ai` asks `available()`,
`active_model()` and `generate_json()` here and knows nothing about providers;
`gemini.py` and `claude_ai.py` are the two transports, and a third is one more
entry in `PROVIDERS` plus a module with the same two functions.

Resolution, in order (`active()`):
  1. the `ai_keys` row marked active — its provider, its key and its own
     `model` (the provider's default when none was picked yet);
  2. else the env-pinned Gemini key (`GEMINI_API_KEY` in backend/.env) on the
     legacy `gemini_model` setting — what every box ran before the store, so
     nothing moved when this shipped;
  3. else whatever Gemini key `gemini.api_key()` still finds (a row nobody
     activated, the single-key era's sealed setting before `adopt_legacy`
     has run on this boot) — never silence while a key exists;
  4. else nothing: the feature is off, exactly as before.
The env key is the ONE entry that exists without a row: listed as `id: "env"`,
it can be activated like any other and can be neither deleted nor edited here.
The single-key era's sealed `app_settings["gemini_api_key"]` is copied into a
row at boot (`adopt_legacy`, once), and `delete_key` removes the setting with
that row, so the list and the narratives' `gemini.api_key()` never disagree.

Rules:
- A key is NEVER returned whole. The list carries `hint` — its last four
  characters — and nothing else of the value; the action register gets the
  provider, the hint and the LENGTH. Sealed with `web_auth.seal_password`
  (keyed off SECRET_KEY, which lives in .env), so a dbdump carries ciphertext.
- A key is TESTED the moment it is saved: its provider's model list is read
  with it. A key the provider rejects (401/403, Gemini's «API key not valid»)
  is REFUSED, not stored — a typo must not become a row that fails every
  review. Any other failure (quota, network) stores the key and names it.
- The first key saved while nothing runs switches the reviewer on (the
  single-key era's «Saqlash va yoqish»); every later one waits to be picked.
- The ACTIVE row cannot be deleted: a reviewer with its key pulled out from
  under it fails every row until somebody notices. Activate another first.
- A model is validated against the provider's catalog, the key's live list
  or at least the provider's own id prefix — never free text that 404s on
  every row — and the `--model` override of the backfill CLI still wins for
  Gemini, per process, as before.
"""
import logging
import re
import time
from collections import namedtuple
from datetime import datetime, timezone

from app.config import settings
from app.models import AiKey, AppSetting
from app.services import claude_ai, gemini
from app.services.gemini import GeminiAuthError, GeminiError, GeminiQuotaError

log = logging.getLogger(__name__)

ENV_ID = "env"
ENV_TEST_SETTING = "ai_env_key_test"   # the env key's last test, JSON {at, ok, note, models}

_NOTES = {"gemini-pro-latest": "best", "gemini-flash-latest": "fast",
          "gemini-flash-lite-latest": "lite"}
_GEMINI_LABELS = {"gemini-pro-latest": "Gemini Pro", "gemini-flash-latest": "Gemini Flash",
                  "gemini-flash-lite-latest": "Gemini Flash Lite"}

PROVIDERS = {
    "gemini": {
        "id": "gemini", "label": "Gemini", "vendor": "Google AI Studio",
        "keyUrl": "https://aistudio.google.com/apikey", "prefix": "gemini-",
        "models": [{"id": m, "label": _GEMINI_LABELS.get(m, m), "note": _NOTES.get(m, "")}
                   for m in gemini.MODELS],
        "default": gemini.MODELS[0],
    },
    "claude": {
        "id": "claude", "label": "Claude", "vendor": "Anthropic Console",
        "keyUrl": "https://console.anthropic.com/settings/keys", "prefix": "claude-",
        "models": [dict(m) for m in claude_ai.MODELS],
        "default": claude_ai.DEFAULT_MODEL,
    },
}

Active = namedtuple("Active", "provider model key key_id label source hint")
NONE = Active("", "", "", None, "", "none", "")


class KeyRefused(ValueError):
    """The provider rejected the key itself — refused at save, not stored."""


class ActiveKey(RuntimeError):
    """Deleting the row the reviewer runs on."""


class BadModel(ValueError):
    """A model id the provider's catalog, the key's live list and the
    provider's own prefix all fail to vouch for."""


# ── helpers ──────────────────────────────────────────────────────────────────
def _now():
    return datetime.now(timezone.utc)


def _hint(raw: str) -> str:
    raw = (raw or "").strip()
    return raw[-4:] if len(raw) >= 8 else ""


def _env_key() -> str:
    return (settings.gemini_api_key or "").strip()


def has_env_key() -> bool:
    return bool(_env_key())


def _open(sealed: str) -> str:
    from app.web_auth import open_password
    try:
        return (open_password(sealed) or "").strip()
    except Exception:
        log.exception("ai_review: could not open a sealed key")
        return ""


def _seal(raw: str) -> str:
    from app.web_auth import seal_password
    return seal_password(raw)


def _model_for(row: AiKey) -> str:
    p = PROVIDERS.get(row.provider) or {}
    if row.provider == "gemini" and gemini.cli_model_override():
        return gemini.cli_model_override()
    return (row.model or "").strip() or p.get("default") or ""


def _stored_setting(db, key: str) -> str:
    row = db.query(AppSetting).filter_by(key=key).first()
    return (row.value or "").strip() if row else ""


def _norm_id(key_id):
    """"env" | int, from whatever the wire sent ("3", 3, "env")."""
    if isinstance(key_id, str):
        k = key_id.strip().lower()
        if k == ENV_ID:
            return ENV_ID
        if k.isdigit():
            return int(k)
        raise KeyError(key_id)
    if isinstance(key_id, bool) or not isinstance(key_id, int):
        raise KeyError(key_id)
    return key_id


# ── the active selection ─────────────────────────────────────────────────────
_TTL = 30.0
_cache: tuple[float, "Active | None"] = (0.0, None)


def _resolve(db) -> Active:
    row = (db.query(AiKey).filter(AiKey.active.is_(True))
           .order_by(AiKey.id.desc()).first())
    if row is not None:
        key = _open(row.key_enc)
        if key:
            return Active(row.provider, _model_for(row), key, row.id,
                          row.label or "", row.source or "ui", row.hint or _hint(key))
        log.error("ai_review: the active key (id %s) cannot be opened — "
                  "SECRET_KEY changed? Falling through.", row.id)
    env = _env_key()
    if env:
        return Active("gemini", gemini.active_model(), env, ENV_ID, "",
                      ENV_ID, _hint(env))
    legacy = gemini.api_key()
    if legacy:
        return Active("gemini", gemini.active_model(), legacy, None, "",
                      "fallback", _hint(legacy))
    return NONE


def active(db=None) -> Active:
    """THE resolver. Cached 30 s (the drain asks per row); every write here
    calls `invalidate()`, so a switch takes effect on the next request."""
    global _cache
    now = time.monotonic()
    if _cache[1] is not None and now - _cache[0] < _TTL:
        return _cache[1]
    own = db is None
    if own:
        from app.database import SessionLocal
        db = SessionLocal()
    try:
        a = _resolve(db)
    except Exception:
        log.exception("ai_review: could not resolve the active key")
        a = NONE
    finally:
        if own:
            db.close()
    _cache = (now, a)
    return a


def invalidate() -> None:
    global _cache
    _cache = (0.0, None)
    gemini.invalidate_key_cache()
    gemini.invalidate_model_cache()


def available() -> bool:
    return bool(active().key)


def active_model() -> str:
    """The model id the ledger stamps on every verdict (`LeaderAiReview.model`)
    and the strip / stall DM print — self-describing, so no provider prefix."""
    return active().model


def model_source(a: Active | None = None) -> str:
    a = a or active()
    if a.provider == "gemini" and gemini.cli_model_override():
        return "cli"
    if a.key_id == ENV_ID or a.key_id is None:
        return gemini.model_source()
    return "db"


def active_out(a: Active | None = None):
    a = a or active()
    if not a.key:
        return None
    return {"keyId": a.key_id, "provider": a.provider, "model": a.model,
            "label": a.label, "hint": a.hint, "source": a.source,
            "providerLabel": PROVIDERS.get(a.provider, {}).get("label", a.provider)}


def generate_json(prompt: str, images: list, schema: dict) -> dict:
    """One review call on the active key and model — the only function
    `leader_ai` calls to judge a proof."""
    a = active()
    if not a.key:
        raise GeminiError("No AI API key configured")
    if a.provider == "claude":
        return claude_ai.generate_json(prompt, images, schema, model=a.model, api_key=a.key)
    return gemini.generate_json(prompt, images, schema, model=a.model, api_key=a.key)


# ── the catalog ──────────────────────────────────────────────────────────────
def catalog() -> list[dict]:
    return [{"id": p["id"], "label": p["label"], "vendor": p["vendor"],
             "keyUrl": p["keyUrl"], "default": p["default"],
             "models": [dict(m) for m in p["models"]]}
            for p in PROVIDERS.values()]


def model_options(provider: str, live) -> list[dict]:
    """The picker's list for one key: the curated catalog first (with its
    notes), then whatever the key's last test listed that the catalog does
    not name — so the picker offers what the key can actually reach."""
    p = PROVIDERS.get(provider)
    if p is None:
        return []
    out, seen = [], set()
    for m in p["models"]:
        out.append(dict(m))
        seen.add(m["id"])
    for m in live or []:
        mid = str((m or {}).get("id") or "")
        if mid and mid not in seen:
            out.append({"id": mid, "label": str(m.get("label") or mid), "note": ""})
            seen.add(mid)
    return out


_MODEL_RE = re.compile(r"^[A-Za-z0-9._-]{3,80}$")


def _check_model(provider: str, model: str, live) -> str:
    model = (model or "").strip()
    p = PROVIDERS.get(provider)
    if p is None or not _MODEL_RE.match(model):
        raise BadModel(f"Unknown model: {model or '—'}")
    known = {m["id"] for m in model_options(provider, live)}
    if model in known or model.startswith(p["prefix"]):
        return model
    raise BadModel(f"{model} is not a {p['label']} model")


# ── testing a key ────────────────────────────────────────────────────────────
def probe(provider: str, key: str):
    """(ok, note, models, auth_failed) — the provider's model list read with
    the key. Never raises: a test is a report."""
    try:
        models = (claude_ai.list_models(key) if provider == "claude"
                  else gemini.list_models(key))
        return True, f"{len(models)} models", models, False
    except GeminiAuthError as exc:
        return False, str(exc)[:300], [], True
    except (GeminiQuotaError, GeminiError) as exc:
        return False, str(exc)[:300], [], False
    except Exception as exc:  # a bug in a transport must not 500 the card
        log.exception("ai_review: probe failed")
        return False, f"{type(exc).__name__}: {exc}"[:300], [], False


def _env_test(db) -> dict:
    import json
    raw = _stored_setting(db, ENV_TEST_SETTING)
    if not raw:
        return {}
    try:
        return json.loads(raw) or {}
    except ValueError:
        return {}


# ── the list ─────────────────────────────────────────────────────────────────
def _iso(dt):
    return dt.isoformat() if dt else None


def to_dict(row: AiKey) -> dict:
    p = PROVIDERS.get(row.provider, {})
    return {
        "id": row.id, "provider": row.provider,
        "providerLabel": p.get("label", row.provider),
        "label": row.label or "",
        "hint": row.hint or "", "model": _model_for(row), "active": bool(row.active),
        "source": row.source or "ui", "createdAt": _iso(row.created_at),
        "createdBy": row.created_by, "testedAt": _iso(row.tested_at),
        "testOk": row.test_ok, "testNote": row.test_note,
        "models": model_options(row.provider, row.models or []),
    }


def _env_dict(db, env_active: bool) -> dict:
    env = _env_key()
    t = _env_test(db)
    return {
        "id": ENV_ID, "provider": "gemini", "providerLabel": "Gemini", "label": "",
        "hint": _hint(env), "model": gemini.active_model(), "active": env_active,
        "source": ENV_ID, "createdAt": None, "createdBy": None,
        "testedAt": t.get("at"), "testOk": t.get("ok"), "testNote": t.get("note"),
        "models": model_options("gemini", t.get("models") or []),
    }


def list_keys(db) -> list[dict]:
    rows = db.query(AiKey).order_by(AiKey.active.desc(), AiKey.id.desc()).all()
    out = [to_dict(r) for r in rows]
    if _env_key():
        env_active = not any(r.active for r in rows)
        out.insert(0, _env_dict(db, env_active))
    return out


# ── writes ───────────────────────────────────────────────────────────────────
def add_key(db, provider: str, raw: str, label: str, actor: str, actor_tg):
    """Save a key after testing it. Returns (row, activated)."""
    provider = (provider or "").strip().lower()
    if provider not in PROVIDERS:
        raise ValueError("Unknown provider")
    raw = (raw or "").strip()
    if len(raw) < 8 or len(raw) > 400 or any(c.isspace() for c in raw):
        raise ValueError("That does not look like an API key")
    for r in db.query(AiKey).filter(AiKey.provider == provider).all():
        if _open(r.key_enc) == raw:
            raise ValueError("This key is already saved")

    ok, note, models, auth_failed = probe(provider, raw)
    if auth_failed:
        raise KeyRefused(note or "The provider rejected this key")

    has_active = db.query(AiKey).filter(AiKey.active.is_(True)).first() is not None
    activate = not has_active and not _env_key()
    row = AiKey(
        provider=provider, label=(label or "").strip()[:60] or None,
        key_enc=_seal(raw), hint=_hint(raw),
        model=PROVIDERS[provider]["default"] if activate else None,
        active=activate, source="ui", created_by=(actor or "")[:120] or None,
        created_tg=actor_tg, tested_at=_now(), test_ok=ok, test_note=note,
        models=models or None,
    )
    db.add(row)
    db.commit()
    invalidate()
    return row, activate


def delete_key(db, key_id) -> dict:
    key_id = _norm_id(key_id)
    if key_id == ENV_ID:
        raise ActiveKey("The .env key is managed on the server")
    row = db.get(AiKey, key_id)
    if row is None:
        raise KeyError(key_id)
    if row.active:
        raise ActiveKey("active")
    info = {"provider": row.provider, "hint": row.hint or "", "label": row.label or ""}
    if row.source == "legacy":
        # The single-key era's setting is the same key; it goes with the row,
        # or the narratives' `gemini.api_key()` would keep finding it.
        old = db.query(AppSetting).filter_by(key=gemini.KEY_SETTING).first()
        if old is not None:
            db.delete(old)
    db.delete(row)
    db.commit()
    invalidate()
    return info


def test_key(db, key_id) -> dict:
    import json
    key_id = _norm_id(key_id)
    if key_id == ENV_ID:
        env = _env_key()
        if not env:
            raise KeyError(key_id)
        ok, note, models, _ = probe("gemini", env)
        rec = {"at": _iso(_now()), "ok": ok, "note": note, "models": models}
        row = db.query(AppSetting).filter_by(key=ENV_TEST_SETTING).first()
        if row is None:
            db.add(AppSetting(key=ENV_TEST_SETTING, value=json.dumps(rec)))
        else:
            row.value = json.dumps(rec)
        db.commit()
        rows_active = db.query(AiKey).filter(AiKey.active.is_(True)).first() is not None
        return _env_dict(db, not rows_active)
    row = db.get(AiKey, key_id)
    if row is None:
        raise KeyError(key_id)
    key = _open(row.key_enc)
    ok, note, models, _ = probe(row.provider, key) if key else (False, "cannot open the sealed key", [], False)
    row.tested_at, row.test_ok, row.test_note = _now(), ok, note
    if models:
        row.models = models
    db.commit()
    invalidate()
    return to_dict(row)


def set_active(db, key_id, model: str) -> Active:
    key_id = _norm_id(key_id)
    rows = db.query(AiKey).all()
    if key_id == ENV_ID:
        if not _env_key():
            raise KeyError(key_id)
        model = _check_model("gemini", model, _env_test(db).get("models"))
        for r in rows:
            r.active = False
        row = db.query(AppSetting).filter_by(key=gemini.MODEL_SETTING).first()
        if row is None:
            db.add(AppSetting(key=gemini.MODEL_SETTING, value=model))
        else:
            row.value = model
    else:
        target = next((r for r in rows if r.id == key_id), None)
        if target is None:
            raise KeyError(key_id)
        model = _check_model(target.provider, model, target.models)
        for r in rows:
            r.active = (r.id == key_id)
        target.model = model
    db.commit()
    invalidate()
    return active(db)


def adopt_legacy(db) -> bool:
    """Boot step: the single-key era's sealed `gemini_api_key` setting becomes
    a row once, active where nothing else runs. Idempotent by `source`."""
    row = db.query(AppSetting).filter_by(key=gemini.KEY_SETTING).first()
    if row is None or not (row.value or "").strip():
        return False
    if db.query(AiKey).filter(AiKey.source == "legacy").first() is not None:
        return False
    raw = _open(row.value)
    if not raw:
        log.error("ai_review: the legacy Gemini key cannot be opened — not adopted")
        return False
    has_active = db.query(AiKey).filter(AiKey.active.is_(True)).first() is not None
    model = _stored_setting(db, gemini.MODEL_SETTING) or None
    db.add(AiKey(provider="gemini", label="Gemini", key_enc=row.value, hint=_hint(raw),
                 model=model, active=(not has_active and not _env_key()),
                 source="legacy", created_by="adopted from the single-key setting"))
    db.commit()
    invalidate()
    log.info("ai_review: adopted the legacy Gemini key into the key store")
    return True
