"""THE store of AI API keys — every key the platform may call an AI with, for
any provider, saved on the admin «AI kalitlari» tab (from 2026-10-19; the
proof reviewer's own key list of 2026-10-19 moved here whole).

WHICH feature runs on which key and model is not this module's question —
that is `services/ai_features.py`. This one keeps the keys: saves, tests,
names, lists and deletes them, and opens one for a caller.

Rules:
- A key is NEVER returned whole. The list carries `hint` — its last four
  characters — and nothing else of the value; the action register gets the
  provider, the hint and the LENGTH. Sealed with `web_auth.seal_password`
  (keyed off SECRET_KEY, which lives in .env), so a dbdump carries ciphertext.
- A key is TESTED the moment it is saved: its provider's model list is read
  with it. A key the provider rejects (401/403, Gemini's «API key not valid»)
  is REFUSED, not stored — a typo must not become a row every feature fails
  on. Any other failure (quota, network) stores the key and names it.
- A key a feature runs on cannot be deleted (`InUse`, naming the features):
  move those features first. The .env key (`GEMINI_API_KEY`) is the ONE entry
  without a row — listed as `id: "env"`, usable like any other, and neither
  deleted nor renamed here (it lives on the server).
- Two keys the platform once kept elsewhere are copied in once, at boot: the
  reviewer's single-key setting (`adopt_legacy`, source «legacy») and the
  assistant's own key (`adopt_assistant`, source «assistant»). Deleting such a
  row deletes the old setting with it, so nothing can still find the value.
"""
import logging
import re
from collections import namedtuple
from datetime import datetime, timezone

from app.config import settings
from app.models import AiKey, AppSetting
from app.services import claude_ai, gemini
from app.services.gemini import GeminiAuthError, GeminiError, GeminiQuotaError

log = logging.getLogger(__name__)

ENV_ID = "env"
ENV_TEST_SETTING = "ai_env_key_test"          # the env key's last test, JSON {at, ok, note, models}
ASSISTANT_KEY_SETTING = "assistant_gemini_api_key"

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

Opened = namedtuple("Opened", "ref provider key label hint source")


class KeyRefused(ValueError):
    """The provider rejected the key itself — refused at save, not stored."""


class InUse(RuntimeError):
    """Deleting a key one or more features run on. `features` names them."""

    def __init__(self, features):
        super().__init__("in_use")
        self.features = list(features)


class BadModel(ValueError):
    """A model id the provider's catalog, the key's live list and the
    provider's own prefix all fail to vouch for."""


# ── helpers ──────────────────────────────────────────────────────────────────
def now():
    return datetime.now(timezone.utc)


def hint_of(raw: str) -> str:
    raw = (raw or "").strip()
    return raw[-4:] if len(raw) >= 8 else ""


def env_key() -> str:
    return (settings.gemini_api_key or "").strip()


def has_env_key() -> bool:
    return bool(env_key())


def open_sealed(sealed: str) -> str:
    from app.web_auth import open_password
    try:
        return (open_password(sealed) or "").strip()
    except Exception:
        log.exception("ai_keys: could not open a sealed key")
        return ""


def _seal(raw: str) -> str:
    from app.web_auth import seal_password
    return seal_password(raw)


def _setting(db, key: str) -> str:
    row = db.query(AppSetting).filter_by(key=key).first()
    return (row.value or "").strip() if row else ""


def norm_ref(key_id):
    """"env" | "12" from whatever the wire sent ("env", "12", 12). KeyError
    for anything else."""
    if isinstance(key_id, bool):
        raise KeyError(key_id)
    if isinstance(key_id, int):
        return str(key_id)
    if isinstance(key_id, str):
        k = key_id.strip().lower()
        if k == ENV_ID:
            return ENV_ID
        if k.isdigit():
            return str(int(k))
    raise KeyError(key_id)


def open_ref(db, ref) -> "Opened | None":
    """The key behind a ref, opened — or None (deleted, unopenable, no env)."""
    if not ref:
        return None
    if ref == ENV_ID:
        env = env_key()
        return Opened(ENV_ID, "gemini", env, "", hint_of(env), ENV_ID) if env else None
    try:
        row = db.get(AiKey, int(ref))
    except (TypeError, ValueError):
        return None
    if row is None:
        return None
    key = open_sealed(row.key_enc)
    if not key:
        log.error("ai_keys: key %s cannot be opened — SECRET_KEY changed?", row.id)
        return None
    return Opened(str(row.id), row.provider, key, row.label or "", row.hint or hint_of(key),
                  row.source or "ui")


def provider_of(db, ref) -> str:
    """The provider a ref belongs to, without opening the value."""
    if ref == ENV_ID:
        return "gemini" if env_key() else ""
    try:
        row = db.get(AiKey, int(ref))
    except (TypeError, ValueError):
        return ""
    return row.provider if row is not None else ""


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


def check_model(provider: str, model: str, live) -> str:
    model = (model or "").strip()
    p = PROVIDERS.get(provider)
    if p is None or not _MODEL_RE.match(model):
        raise BadModel(f"Unknown model: {model or '—'}")
    known = {m["id"] for m in model_options(provider, live)}
    if model in known or model.startswith(p["prefix"]):
        return model
    raise BadModel(f"{model} is not a {p['label']} model")


def live_models(db, ref) -> list:
    """The model list the key's last test read (for the picker / validation)."""
    if ref == ENV_ID:
        return _env_test(db).get("models") or []
    try:
        row = db.get(AiKey, int(ref))
    except (TypeError, ValueError):
        return []
    return (row.models or []) if row is not None else []


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
        log.exception("ai_keys: probe failed")
        return False, f"{type(exc).__name__}: {exc}"[:300], [], False


def _env_test(db) -> dict:
    import json
    raw = _setting(db, ENV_TEST_SETTING)
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
        "id": str(row.id), "provider": row.provider,
        "providerLabel": p.get("label", row.provider),
        "label": row.label or "", "hint": row.hint or "",
        "source": row.source or "ui", "createdAt": _iso(row.created_at),
        "createdBy": row.created_by, "testedAt": _iso(row.tested_at),
        "testOk": row.test_ok, "testNote": row.test_note,
        "models": model_options(row.provider, row.models or []),
    }


def env_dict(db) -> dict:
    t = _env_test(db)
    return {
        "id": ENV_ID, "provider": "gemini", "providerLabel": "Gemini", "label": "",
        "hint": hint_of(env_key()), "source": ENV_ID, "createdAt": None, "createdBy": None,
        "testedAt": t.get("at"), "testOk": t.get("ok"), "testNote": t.get("note"),
        "models": model_options("gemini", t.get("models") or []),
    }


def list_keys(db) -> list[dict]:
    rows = db.query(AiKey).order_by(AiKey.id.asc()).all()
    out = [to_dict(r) for r in rows]
    if env_key():
        out.insert(0, env_dict(db))
    return out


# ── writes ───────────────────────────────────────────────────────────────────
def add_key(db, provider: str, raw: str, label: str, actor: str, actor_tg) -> AiKey:
    """Save a key after testing it. Refuses a key the provider rejects
    (`KeyRefused`) and one already saved (ValueError)."""
    provider = (provider or "").strip().lower()
    if provider not in PROVIDERS:
        raise ValueError("Unknown provider")
    raw = (raw or "").strip()
    if len(raw) < 8 or len(raw) > 400 or any(c.isspace() for c in raw):
        raise ValueError("That does not look like an API key")
    if provider == "gemini" and raw == env_key():
        raise ValueError("This key is already saved")
    for r in db.query(AiKey).filter(AiKey.provider == provider).all():
        if open_sealed(r.key_enc) == raw:
            raise ValueError("This key is already saved")

    ok, note, models, auth_failed = probe(provider, raw)
    if auth_failed:
        raise KeyRefused(note or "The provider rejected this key")

    row = AiKey(
        provider=provider, label=(label or "").strip()[:60] or None,
        key_enc=_seal(raw), hint=hint_of(raw), model=None, active=False, source="ui",
        created_by=(actor or "")[:120] or None, created_tg=actor_tg,
        tested_at=now(), test_ok=ok, test_note=note, models=models or None,
    )
    db.add(row)
    db.commit()
    _invalidate()
    return row


def rename_key(db, key_id, label: str) -> AiKey:
    ref = norm_ref(key_id)
    if ref == ENV_ID:
        raise KeyError(key_id)
    row = db.get(AiKey, int(ref))
    if row is None:
        raise KeyError(key_id)
    row.label = (label or "").strip()[:60] or None
    db.commit()
    _invalidate()
    return row


def delete_key(db, key_id) -> dict:
    from app.services import ai_features

    ref = norm_ref(key_id)
    if ref == ENV_ID:
        raise PermissionError("The .env key is managed on the server")
    row = db.get(AiKey, int(ref))
    if row is None:
        raise KeyError(key_id)
    used = ai_features.used_by(db, ref)
    if used:
        raise InUse(used)
    info = {"provider": row.provider, "hint": row.hint or "", "label": row.label or ""}
    # The setting a boot step copied this row from is the same value; it goes
    # with the row, or a caller still reading the old setting would find it.
    old_key = {"legacy": gemini.KEY_SETTING, "assistant": ASSISTANT_KEY_SETTING}.get(row.source or "")
    if old_key:
        old = db.query(AppSetting).filter_by(key=old_key).first()
        if old is not None:
            db.delete(old)
    db.delete(row)
    db.commit()
    _invalidate()
    return info


def test_key(db, key_id) -> dict:
    import json
    ref = norm_ref(key_id)
    if ref == ENV_ID:
        env = env_key()
        if not env:
            raise KeyError(key_id)
        ok, note, models, _ = probe("gemini", env)
        rec = {"at": _iso(now()), "ok": ok, "note": note, "models": models}
        row = db.query(AppSetting).filter_by(key=ENV_TEST_SETTING).first()
        if row is None:
            db.add(AppSetting(key=ENV_TEST_SETTING, value=json.dumps(rec)))
        else:
            row.value = json.dumps(rec)
        db.commit()
        return env_dict(db)
    row = db.get(AiKey, int(ref))
    if row is None:
        raise KeyError(key_id)
    key = open_sealed(row.key_enc)
    ok, note, models, _ = probe(row.provider, key) if key else (False, "cannot open the sealed key", [], False)
    row.tested_at, row.test_ok, row.test_note = now(), ok, note
    if models:
        row.models = models
    db.commit()
    _invalidate()
    return to_dict(row)


def _invalidate() -> None:
    from app.services import ai_features
    ai_features.invalidate()


# ── keys the platform kept elsewhere, copied in once ────────────────────────
def _find_same(db, provider: str, raw: str):
    """The ref of a saved key with this exact value, or None."""
    if provider == "gemini" and raw and raw == env_key():
        return ENV_ID
    for r in db.query(AiKey).filter(AiKey.provider == provider).all():
        if open_sealed(r.key_enc) == raw:
            return str(r.id)
    return None


def adopt_legacy(db) -> bool:
    """Boot step: the reviewer's single-key-era sealed `gemini_api_key`
    setting becomes a row once. Idempotent by `source`."""
    row = db.query(AppSetting).filter_by(key=gemini.KEY_SETTING).first()
    if row is None or not (row.value or "").strip():
        return False
    if db.query(AiKey).filter(AiKey.source == "legacy").first() is not None:
        return False
    raw = open_sealed(row.value)
    if not raw:
        log.error("ai_keys: the legacy Gemini key cannot be opened — not adopted")
        return False
    if _find_same(db, "gemini", raw):
        return False
    model = _setting(db, gemini.MODEL_SETTING) or None
    db.add(AiKey(provider="gemini", label="Gemini", key_enc=row.value, hint=hint_of(raw),
                 model=model, active=False, source="legacy",
                 created_by="adopted from the single-key setting"))
    db.commit()
    _invalidate()
    log.info("ai_keys: adopted the legacy Gemini key into the key store")
    return True


def adopt_assistant(db):
    """Boot step: the assistant's OWN Gemini key (its 2026-10-05 setting)
    becomes a row once — or is recognised as one already saved. Returns the
    ref it now lives under, or None when the assistant had no key of its own."""
    raw_sealed = _setting(db, ASSISTANT_KEY_SETTING)
    if not raw_sealed:
        return None
    raw = open_sealed(raw_sealed)
    if not raw:
        log.error("ai_keys: the assistant's own key cannot be opened — not adopted")
        return None
    same = _find_same(db, "gemini", raw)
    if same:
        return same
    row = AiKey(provider="gemini", label="Yordamchi", key_enc=raw_sealed, hint=hint_of(raw),
                model=None, active=False, source="assistant",
                created_by="adopted from the assistant's own key")
    db.add(row)
    db.commit()
    _invalidate()
    log.info("ai_keys: adopted the assistant's own Gemini key into the key store")
    return str(row.id)
