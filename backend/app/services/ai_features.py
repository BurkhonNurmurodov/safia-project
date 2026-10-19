"""THE answer to «which AI does this feature run on» — key, provider and model,
picked PER FEATURE on the admin «AI kalitlari» tab (from 2026-10-19, the
operator: «we'll decide which feature uses which key and which model»).

Five features call an AI today, each its own row (`FEATURES`):
  review          the checklist proof checker (Lider nazorati → AI tekshiruvi)
  assistant       «Yordamchi», the chat
  voice           «Yordamchi», a voice message turned into text
  deck_ojidaniya  the Ojidaniya weekly PowerPoint's prose
  deck_concerns   the Concerns weekly PowerPoint's prose
Every one may run on any provider it can speak (`Feature.providers`): Gemini
and Claude for all but voice, which needs a model that LISTENS — Claude takes
text, images and PDFs, never audio — so voice offers Gemini keys alone, and
the tab says why.

Resolution is the feature's row and nothing else (`resolve`): its key
(`key_ref` — "env" for backend/.env's GEMINI_API_KEY, else an `ai_keys.id`)
and its model. NULL = the feature is switched off: the reviewer queues
nothing, the assistant says no key is set, a weekly deck ships with its plain
fallback prose. The rows are written once at boot from what each feature ran
on the day before this shipped (`seed`), so nothing moved on the deploy.

Every call is RECORDED (`record`): a plant-day × key × model counter of calls,
failures and tokens (`ai_usage`, the tab's «Shu oy»), and the feature's last
call / last error in the provider's own words. A failure that needs a person —
a key refused, a model the key cannot reach, money or quota run out — DMs the
admins ONCE (`_alert`), again only after 6 h or when the failure changes, and
one «yana ishlayapti» when the feature works again. Nothing ever switches a
feature to another key by itself: moving to another billing account is a
person's decision (the operator's ruling).
"""
from __future__ import annotations

import logging
import time
from collections import namedtuple
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, text

from app.models import AiFeature, AiKey, AiUsage, AppSetting
from app.services import ai_keys, claude_ai, gemini
from app.services.gemini import GeminiAuthError, GeminiError, GeminiQuotaError

log = logging.getLogger(__name__)

TZ = ZoneInfo("Asia/Tashkent")

Feature = namedtuple("Feature", "id providers defaults")

FEATURES = (
    Feature("review", ("gemini", "claude"),
            {"gemini": "gemini-pro-latest", "claude": "claude-sonnet-5-5"}),
    Feature("assistant", ("gemini", "claude"),
            {"gemini": "gemini-pro-latest", "claude": "claude-sonnet-5-5"}),
    Feature("voice", ("gemini",), {"gemini": "gemini-flash-latest"}),
    Feature("deck_ojidaniya", ("gemini", "claude"),
            {"gemini": "gemini-pro-latest", "claude": "claude-sonnet-5-5"}),
    Feature("deck_concerns", ("gemini", "claude"),
            {"gemini": "gemini-pro-latest", "claude": "claude-sonnet-5-5"}),
)
BY_ID = {f.id: f for f in FEATURES}

# The Uzbek names the admins' alert DM prints (the tab has its own four-language
# words in the bundle, `aik.f.<id>`).
NAMES_UZ = {
    "review": "Chek-list isbotlarini tekshirish",
    "assistant": "Yordamchi — suhbat",
    "voice": "Yordamchi — ovozli xabarni matnga aylantirish",
    "deck_ojidaniya": "Ojidaniya haftalik hisoboti (matn)",
    "deck_concerns": "Xavotirlar haftalik hisoboti (matn)",
}

# The failures a person has to act on. The rest — a 5xx, a dropped
# connection, an unreadable answer — mend themselves and are only SHOWN.
ALERT_KINDS = ("key", "model", "credit", "quota")
# A quota failure is often a per-minute limit that clears by itself: it is
# told only once it has lasted this long or happened this many times running.
QUOTA_ALERT_AFTER = timedelta(minutes=15)
QUOTA_ALERT_STREAK = 3
ALERT_REPEAT = timedelta(hours=6)

SEED_FLAG = "ai_features_seed_2026_10_19_v1"
SINCE_SETTING = "ai_usage_since"          # the plant day the usage ledger started

Assign = namedtuple("Assign", "feature provider model key ref label hint source")


def _off(feature: str, source: str = "off") -> Assign:
    return Assign(feature, "", "", "", None, "", "", source)


class Refused(ValueError):
    """An assignment the provider proved cannot work (`kind`: key · model)."""

    def __init__(self, kind: str, message: str):
        super().__init__(message)
        self.kind = kind


def _now():
    return datetime.now(timezone.utc)


def today() -> date:
    return datetime.now(TZ).date()


# ── resolution ───────────────────────────────────────────────────────────────
_TTL = 30.0
_cache: dict[str, tuple[float, Assign]] = {}


def invalidate() -> None:
    _cache.clear()


def _resolve(db, feature: str) -> Assign:
    spec = BY_ID.get(feature)
    if spec is None:
        return _off(feature, "unknown")
    row = db.get(AiFeature, feature)
    if row is None or not row.key_ref:
        return _off(feature)
    k = ai_keys.open_ref(db, row.key_ref)
    if k is None:
        return _off(feature, "missing")
    if k.provider not in spec.providers:
        return _off(feature, "provider")
    model = (row.model or "").strip() or spec.defaults.get(k.provider) \
        or ai_keys.PROVIDERS[k.provider]["default"]
    # The backfill CLI's per-process `--model` still wins for the reviewer on a
    # Gemini key, as it always did (services/gemini.set_model_override).
    if feature == "review" and k.provider == "gemini" and gemini.cli_model_override():
        model = gemini.cli_model_override()
    return Assign(feature, k.provider, model, k.key, k.ref, k.label, k.hint, k.source)


def resolve(feature: str, db=None) -> Assign:
    """THE resolver. Cached 30 s per feature (the reviewer's drain asks per
    row); every write on the tab calls `invalidate()`, so a switch takes
    effect on the next call."""
    now = time.monotonic()
    hit = _cache.get(feature)
    if hit is not None and now - hit[0] < _TTL:
        return hit[1]
    own = db is None
    if own:
        from app.database import SessionLocal
        db = SessionLocal()
    try:
        a = _resolve(db, feature)
    except Exception:
        log.exception("ai_features: could not resolve %s", feature)
        a = _off(feature, "error")
    finally:
        if own:
            db.close()
    _cache[feature] = (now, a)
    return a


def available(feature: str) -> bool:
    return bool(resolve(feature).key)


def used_by(db, ref: str) -> list[str]:
    """The features a key runs (the delete guard and the keys table)."""
    rows = db.query(AiFeature.feature).filter(AiFeature.key_ref == str(ref)).all()
    return [r[0] for r in rows if r[0] in BY_ID]


# ── calling ──────────────────────────────────────────────────────────────────
def generate_json(feature: str, prompt: str, images: list, schema: dict, *,
                  assign: Assign | None = None) -> dict:
    """One JSON call (vision or text) on the feature's own key and model.
    Raises the reviewer's error classes (GeminiQuotaError stops a drain,
    GeminiError is this call's own failure) with their `kind`."""
    a = assign or resolve(feature)
    if not a.key:
        raise GeminiError("No AI key is chosen for this feature", kind="no_key")
    meter: dict = {}
    try:
        if a.provider == "claude":
            out = claude_ai.generate_json(prompt, images, schema, model=a.model,
                                          api_key=a.key, meter=meter)
        else:
            out = gemini.generate_json(prompt, images, schema, model=a.model,
                                       api_key=a.key, meter=meter)
    except GeminiError as exc:
        record(a, ok=False, meter=meter, error=exc)
        raise
    record(a, ok=True, meter=meter)
    return out


def ping(provider: str, key: str, model: str) -> None:
    if provider == "claude":
        claude_ai.ping(key, model)
    else:
        gemini.ping(key, model)


# ── the ledger ───────────────────────────────────────────────────────────────
def error_kind(exc) -> str:
    return getattr(exc, "kind", None) or ("quota" if isinstance(exc, GeminiQuotaError)
                                          else "key" if isinstance(exc, GeminiAuthError)
                                          else "other")


def record(a: Assign, *, ok: bool, meter: dict | None = None, error=None,
           kind: str | None = None, message: str = "") -> None:
    """Count one AI call against its feature — and alert when it must. Never
    raises: a ledger that cannot be written must not cost anybody an answer.
    Synchronous; an async caller hands it to a thread."""
    if not a or a.feature not in BY_ID:
        return
    try:
        _record(a, ok, meter or {}, error, kind, message)
    except Exception:
        log.exception("ai_features: could not record a %s call", a.feature)


def _record(a: Assign, ok: bool, meter: dict, error, kind, message) -> None:
    from sqlalchemy.dialects.postgresql import insert

    from app.database import SessionLocal

    k_in = int(meter.get("in") or 0)
    k_out = int(meter.get("out") or 0)
    kind = kind or (error_kind(error) if error is not None else None)
    msg = (message or (str(error) if error is not None else ""))[:600]
    now = _now()
    db = SessionLocal()
    try:
        stmt = insert(AiUsage.__table__).values(
            day=today(), feature=a.feature, key_ref=a.ref or "", provider=a.provider or None,
            model=a.model or "", calls=1, ok=1 if ok else 0, failed=0 if ok else 1,
            tokens_in=k_in, tokens_out=k_out)
        tbl = AiUsage.__table__
        stmt = stmt.on_conflict_do_update(
            constraint="uq_ai_usage_day",
            set_={"calls": tbl.c.calls + 1, "ok": tbl.c.ok + (1 if ok else 0),
                  "failed": tbl.c.failed + (0 if ok else 1),
                  "tokens_in": tbl.c.tokens_in + k_in, "tokens_out": tbl.c.tokens_out + k_out,
                  "provider": stmt.excluded.provider})
        db.execute(stmt)
        if ok:
            res = db.execute(text(
                "UPDATE ai_features SET last_at = :now, last_ok_at = :now, fail_streak = 0, "
                "first_fail_at = NULL WHERE feature = :f "
                "RETURNING alert_kind, alert_ref"), {"now": now, "f": a.feature}).first()
        else:
            res = db.execute(text(
                "UPDATE ai_features SET last_at = :now, last_error_at = :now, last_error = :k, "
                "last_error_text = :m, fail_streak = fail_streak + 1, "
                "first_fail_at = COALESCE(first_fail_at, :now) WHERE feature = :f "
                "RETURNING alert_kind, alert_ref, alert_at, fail_streak, first_fail_at"),
                {"now": now, "k": kind, "m": msg, "f": a.feature}).first()
        db.commit()
        if res is None:
            return
        if ok:
            if res[0]:
                _maybe_recovered(db, a, res[0])
        else:
            _maybe_alert(db, a, kind, msg, res)
    finally:
        db.close()


def _alert_ref(a: Assign) -> str:
    return f"{a.ref or ''}·{a.model or ''}"


def _maybe_alert(db, a: Assign, kind: str, msg: str, res) -> None:
    if kind not in ALERT_KINDS:
        return
    open_kind, open_ref, open_at, streak, first_fail = res
    now = _now()
    if kind == "quota":
        lasted = now - first_fail if first_fail else timedelta(0)
        if (streak or 0) < QUOTA_ALERT_STREAK and lasted < QUOTA_ALERT_AFTER:
            return
    ref = _alert_ref(a)
    if (open_kind == kind and open_ref == ref and open_at is not None
            and now - open_at < ALERT_REPEAT):
        return
    # Compare-and-set: two threads failing at once send ONE message.
    won = db.execute(text(
        "UPDATE ai_features SET alert_kind = :k, alert_ref = :r, alert_at = :now "
        "WHERE feature = :f AND alert_kind IS NOT DISTINCT FROM :ok "
        "AND alert_ref IS NOT DISTINCT FROM :orf "
        "AND alert_at IS NOT DISTINCT FROM :oat"),
        {"k": kind, "r": ref, "now": now, "f": a.feature, "ok": open_kind,
         "orf": open_ref, "oat": open_at}).rowcount
    db.commit()
    if won:
        _send_later(_alert_text(a, kind, msg))


def _maybe_recovered(db, a: Assign, open_kind: str) -> None:
    won = db.execute(text(
        "UPDATE ai_features SET alert_kind = NULL, alert_ref = NULL, alert_at = NULL "
        "WHERE feature = :f AND alert_kind IS NOT NULL"), {"f": a.feature}).rowcount
    db.commit()
    if won:
        _send_later(
            "✅ <b>AI yana ishlayapti</b>\n"
            f"Funksiya: {NAMES_UZ.get(a.feature, a.feature)}\n"
            f"Kalit: {_key_words(a)}")


_KIND_UZ = {
    "key": "provayder kalitni rad etdi",
    "model": "bu model topilmadi yoki bu kalitga ochiq emas",
    "credit": "kalit hisobida mablag' qolmagan",
    "quota": "so'rovlar limiti tugagan",
}


def _key_words(a: Assign) -> str:
    who = ai_keys.PROVIDERS.get(a.provider, {}).get("label", a.provider or "AI")
    name = "server (.env)" if a.ref == ai_keys.ENV_ID else (f"«{a.label}»" if a.label else "")
    tail = f"····{a.hint}" if a.hint else ""
    return " ".join(x for x in (who, name, tail) if x) + (f" · {a.model}" if a.model else "")


def _alert_text(a: Assign, kind: str, msg: str) -> str:
    from html import escape
    lines = [
        "⚠️ <b>AI kaliti ishlamayapti</b>",
        f"Funksiya: {NAMES_UZ.get(a.feature, a.feature)}",
        f"Kalit: {escape(_key_words(a))}",
        f"Sabab: {_KIND_UZ.get(kind, kind)}",
    ]
    if msg:
        lines.append(f"<i>{escape(msg[:300])}</i>")
    lines.append("Boshqa kalit yoki modelni «AI kalitlari» bo'limida tanlang "
                 "(Admin panel → Vositalar).")
    return "\n".join(lines)


def _send_later(text_html: str) -> None:
    from app.services import tg_later
    tg_later.run(_tell_admins, text_html)


def _tell_admins(text_html: str) -> int:
    """The support chat, or every admin — the door the reviewer's stall alert
    uses — with a button onto the tab (a web-app button in a private chat, a
    link in a group, where Telegram refuses web-app buttons)."""
    sent = 0
    try:
        from telebot import types

        from app.config import settings
        from app.routers.boot import _recipients
        from app.telegram_bot import bot

        url = settings.webapp_url.rstrip("/") + "/admin/upload?tab=aikeys"
        for chat_id in _recipients():
            kb = types.InlineKeyboardMarkup()
            if chat_id > 0:
                kb.add(types.InlineKeyboardButton("AI kalitlari", web_app=types.WebAppInfo(url=url)))
            else:
                kb.add(types.InlineKeyboardButton("AI kalitlari", url=url))
            try:
                bot.send_message(chat_id, text_html, parse_mode="HTML", reply_markup=kb)
                sent += 1
            except Exception:                                 # noqa: BLE001
                try:
                    bot.send_message(chat_id, text_html, parse_mode="HTML")
                    sent += 1
                except Exception:                             # noqa: BLE001
                    pass
    except Exception:                                         # noqa: BLE001
        log.exception("ai_features: alert not delivered")
    return sent


# ── the tab's writes ─────────────────────────────────────────────────────────
def assign(db, feature: str, key_ref, model: str, actor: str, actor_tg) -> dict:
    """Move a feature onto (key, model) — or switch it off (key_ref None).
    The pair is CHECKED with one tiny real call first: a key the provider
    refuses or a model it does not serve is `Refused` and nothing changes; a
    check that could not finish (quota, network) saves the pick and says so.
    Returns {before, after, check}."""
    spec = BY_ID.get(feature)
    if spec is None:
        raise KeyError(feature)
    row = db.get(AiFeature, feature)
    if row is None:
        row = AiFeature(feature=feature)
        db.add(row)
        db.flush()
    before = {"ref": row.key_ref, "model": row.model}
    check = {"ok": None, "note": "", "kind": None}
    if key_ref in (None, "", 0):
        row.key_ref, row.model = None, None
        row.check_at, row.check_ok, row.check_note = None, None, None
    else:
        ref = ai_keys.norm_ref(key_ref)
        k = ai_keys.open_ref(db, ref)
        if k is None:
            raise KeyError(key_ref)
        if k.provider not in spec.providers:
            raise ai_keys.BadModel(f"{feature} cannot run on {k.provider}")
        model = ai_keys.check_model(k.provider, model or spec.defaults.get(k.provider, ""),
                                    ai_keys.live_models(db, ref))
        try:
            ping(k.provider, k.key, model)
            check = {"ok": True, "note": "", "kind": None}
        except GeminiError as exc:
            kind = error_kind(exc)
            if kind in ("key", "model"):
                db.rollback()
                raise Refused(kind, str(exc)[:300])
            check = {"ok": False, "note": str(exc)[:300], "kind": kind}
        row.key_ref, row.model = ref, model
        row.check_at, row.check_ok, row.check_note = _now(), check["ok"], check["note"] or None
    row.updated_at = _now()
    row.updated_by = (actor or "")[:120] or None
    row.updated_tg = actor_tg
    # A new pair is a new start: an alert about the old one is not about it.
    if (row.key_ref, row.model) != (before["ref"], before["model"]):
        row.alert_kind = row.alert_ref = None
        row.alert_at = None
        row.fail_streak = 0
        row.first_fail_at = None
    db.commit()
    invalidate()
    return {"before": before, "after": {"ref": row.key_ref, "model": row.model}, "check": check}


# ── boot: what each feature ran on the day before ───────────────────────────
def _shared_gemini_ref(db):
    """The Gemini key `gemini.api_key()` answered with before this shipped:
    the .env key, else the store's Gemini row (active first, then newest)."""
    if ai_keys.env_key():
        return ai_keys.ENV_ID
    row = (db.query(AiKey).filter(AiKey.provider == "gemini")
           .order_by(AiKey.active.desc(), AiKey.id.desc()).first())
    return str(row.id) if row is not None else None


def _review_before(db, shared):
    """The proof reviewer's resolution of 2026-10-19 (services/ai_review), as
    a (ref, model) pair: the active row on its own model, else the shared
    Gemini key on the shared model."""
    row = (db.query(AiKey).filter(AiKey.active.is_(True))
           .order_by(AiKey.id.desc()).first())
    if row is not None and ai_keys.open_sealed(row.key_enc):
        p = ai_keys.PROVIDERS.get(row.provider, {})
        return str(row.id), (row.model or "").strip() or p.get("default")
    return (shared, gemini.active_model()) if shared else (None, None)


def seed(db) -> dict:
    """Boot step, ONCE (flag): every feature gets the key and model it ran on
    before the per-feature tab existed, so nothing moves on the deploy —
    the reviewer its active key, the assistant its own key (copied into the
    store) or the reviewer's Gemini key, voice that key on Flash, both decks
    the shared Gemini key on the shared model. A feature with no key to take
    starts switched off, exactly as it was. Later boots only add a row for a
    feature this list gains (switched off)."""
    flag = db.query(AppSetting).filter_by(key=SEED_FLAG).first()
    out: dict = {}
    if flag is None:
        # Read what the shared Gemini key WAS before anything is copied in: the
        # copies are new rows, and «the newest Gemini row» must not become one.
        shared = _shared_gemini_ref(db)
        if ai_keys.adopt_legacy(db) and shared is None:
            shared = _shared_gemini_ref(db)
        review = _review_before(db, shared)
        own = ai_keys.adopt_assistant(db)
        before = {
            "review": review,
            "assistant": (own or shared, "gemini-pro-latest") if (own or shared) else (None, None),
            "voice": (own or shared, "gemini-flash-latest") if (own or shared) else (None, None),
            "deck_ojidaniya": (shared, gemini.active_model()) if shared else (None, None),
            "deck_concerns": (shared, gemini.active_model()) if shared else (None, None),
        }
        for f in FEATURES:
            if db.get(AiFeature, f.id) is not None:
                continue
            ref, model = before.get(f.id, (None, None))
            db.add(AiFeature(feature=f.id, key_ref=ref, model=model if ref else None,
                             updated_at=_now(), updated_by="moved from the earlier settings"))
            out[f.id] = (ref, model)
        db.add(AppSetting(key=SEED_FLAG, value=_now().isoformat()))
        if db.query(AppSetting).filter_by(key=SINCE_SETTING).first() is None:
            db.add(AppSetting(key=SINCE_SETTING, value=today().isoformat()))
        db.commit()
    else:
        for f in FEATURES:
            if db.get(AiFeature, f.id) is None:
                db.add(AiFeature(feature=f.id))
                out[f.id] = (None, None)
        if out:
            db.commit()
    invalidate()
    return out


# ── what the tab shows ───────────────────────────────────────────────────────
def _iso(dt):
    return dt.isoformat() if dt else None


def _status(row: AiFeature | None, a: Assign) -> str:
    if not a.key:
        return "off" if a.source in ("off", "unknown") else "broken"
    if row is None or row.last_at is None:
        return "unused"
    if row.last_error_at and (row.last_ok_at is None or row.last_error_at > row.last_ok_at):
        return "error"
    return "ok"


def month_usage(db) -> tuple[dict, dict, str]:
    """(per feature, per key, since) — this plant month, from the 1st or from
    the day the ledger started, whichever is later."""
    first = today().replace(day=1)
    since_row = db.query(AppSetting).filter_by(key=SINCE_SETTING).first()
    since = first
    if since_row and since_row.value:
        try:
            since = max(first, date.fromisoformat(since_row.value[:10]))
        except ValueError:
            pass
    rows = (db.query(AiUsage.feature, AiUsage.key_ref, AiUsage.model,
                     func.sum(AiUsage.calls), func.sum(AiUsage.ok), func.sum(AiUsage.failed),
                     func.sum(AiUsage.tokens_in), func.sum(AiUsage.tokens_out))
            .filter(AiUsage.day >= first)
            .group_by(AiUsage.feature, AiUsage.key_ref, AiUsage.model).all())
    per_f: dict = {}
    per_k: dict = {}
    for feat, ref, model, calls, okc, failed, tin, tout in rows:
        for bucket, key in ((per_f, feat), (per_k, ref or "")):
            acc = bucket.setdefault(key, {"calls": 0, "ok": 0, "failed": 0,
                                          "tokensIn": 0, "tokensOut": 0})
            acc["calls"] += int(calls or 0)
            acc["ok"] += int(okc or 0)
            acc["failed"] += int(failed or 0)
            acc["tokensIn"] += int(tin or 0)
            acc["tokensOut"] += int(tout or 0)
    return per_f, per_k, since.isoformat()


def overview(db) -> dict:
    """Everything the «AI kalitlari» tab draws, in one answer."""
    per_f, per_k, since = month_usage(db)
    keys = ai_keys.list_keys(db)
    users: dict = {}
    rows = {r.feature: r for r in db.query(AiFeature).all()}
    for fid, r in rows.items():
        if r.key_ref and fid in BY_ID:
            users.setdefault(r.key_ref, []).append(fid)
    for k in keys:
        k["usedBy"] = [f.id for f in FEATURES if f.id in users.get(k["id"], [])]
        k["month"] = per_k.get(k["id"]) or {"calls": 0, "ok": 0, "failed": 0,
                                           "tokensIn": 0, "tokensOut": 0}
    feats = []
    for f in FEATURES:
        r = rows.get(f.id)
        a = _resolve(db, f.id)
        feats.append({
            "id": f.id, "providers": list(f.providers), "defaults": dict(f.defaults),
            "keyRef": r.key_ref if r else None, "model": (r.model if r else None) or (a.model or None),
            "provider": a.provider or (ai_keys.provider_of(db, r.key_ref) if r and r.key_ref else ""),
            "status": _status(r, a), "source": a.source,
            "lastAt": _iso(r.last_at) if r else None,
            "lastOkAt": _iso(r.last_ok_at) if r else None,
            "lastErrorAt": _iso(r.last_error_at) if r else None,
            "lastError": r.last_error if r else None,
            "lastErrorText": r.last_error_text if r else None,
            "alertOpen": bool(r and r.alert_kind),
            "check": ({"at": _iso(r.check_at), "ok": r.check_ok, "note": r.check_note}
                      if r and r.check_at else None),
            "updatedAt": _iso(r.updated_at) if r else None,
            "updatedBy": r.updated_by if r else None,
            "month": per_f.get(f.id) or {"calls": 0, "ok": 0, "failed": 0,
                                         "tokensIn": 0, "tokensOut": 0},
        })
    return {"features": feats, "keys": keys, "providers": ai_keys.catalog(),
            "envKey": ai_keys.has_env_key(), "month": {"since": since,
                                                      "first": today().replace(day=1).isoformat()}}
