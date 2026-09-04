"""Password login for the browser — the second door into the same session.

The app's first door is Telegram: ``initData`` proves the caller sits inside a
genuine WebView and ``security.py`` re-verifies that proof on every request.
Opening the dashboard at production.safiacorporate.uz means the proof does not
exist, so a password stands in for it and the resulting JWT carries ``web: True``
— the ONLY claim ``security.py`` accepts in place of initData. A token minted
for a Telegram session still cannot be replayed from a browser, so this opens
exactly one new door and widens nothing else.

What a browser session is NOT is a different identity. The password resolves to
a profile, the profile resolves to the very same (telegram_id, role, role_id,
role_ref) tuple a Telegram login would produce, and the JWT is otherwise
identical — so page grants, capabilities, factory locks and profile ownership
all behave exactly as they do in Telegram, with nothing to keep in sync.

Password storage is PBKDF2-HMAC-SHA256 from the standard library. passlib is in
requirements, but a hash this simple has no business carrying a native
dependency that can fail to build on a deploy that goes straight to production.
Alongside the hash the password is kept a second time in a SEALED, reversible
form, so an admin can read a login back on the profile page instead of resetting
it — see ``seal_password`` for what that costs and why it is keyed off
SECRET_KEY rather than stored in the clear.
"""
import base64
import hashlib
import hmac
import logging
import secrets
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from sqlalchemy.orm import Session

from app.config import settings
from app.identity import parse_profile_key, profile_holders
from app.models import Admin, RoleProfile, TelegramUser, TelegramUserRole, WebCredential
from app.translit import transliterate

log = logging.getLogger(__name__)

# ── policy ────────────────────────────────────────────────────────────────────

# Lockout. Five tries is comfortably above a typo streak and far below anything
# useful to a guesser; fifteen minutes turns an online attack into years of
# waiting without giving an attacker a way to lock a real person out for long.
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_MINUTES     = 15

# Session lifetimes. "Remember me" is a month on a personal machine; without it
# the token still expires the same day, so a browser left open on a shared
# factory PC is not an open account tomorrow morning (the frontend also keeps
# that token in sessionStorage, which dies with the tab).
REMEMBER_DAYS  = 30
SESSION_HOURS  = 12

MIN_PASSWORD_LEN = 8

# Generated passwords avoid 0/O and 1/l/I — they are read off a phone screen and
# typed on a laptop, and an ambiguous glyph there costs a support call.
_PW_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"

_PBKDF2_ITERATIONS = 240_000


# ── password hashing ──────────────────────────────────────────────────────────

def hash_password(raw: str) -> str:
    """``pbkdf2_sha256$<iterations>$<salt_b64>$<hash_b64>`` — self-describing, so
    the iteration count can be raised later without stranding old hashes."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", raw.encode("utf-8"), salt, _PBKDF2_ITERATIONS)
    return "pbkdf2_sha256${}${}${}".format(
        _PBKDF2_ITERATIONS,
        base64.b64encode(salt).decode(),
        base64.b64encode(digest).decode(),
    )


def verify_password(raw: str, stored: str) -> bool:
    """Constant-time check against a stored hash. A malformed hash verifies as
    False rather than raising — a corrupt row must fail the login, not the app."""
    try:
        scheme, iterations, salt_b64, hash_b64 = stored.split("$")
        if scheme != "pbkdf2_sha256":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", raw.encode("utf-8"),
            base64.b64decode(salt_b64), int(iterations),
        )
        return hmac.compare_digest(digest, base64.b64decode(hash_b64))
    except Exception:
        return False


def generate_password(length: int = 10) -> str:
    return "".join(secrets.choice(_PW_ALPHABET) for _ in range(length))


# ── the sealed copy (what an admin reads back) ────────────────────────────────

# A hash cannot be read back — that is its entire point, and it is the right
# store for VERIFYING a login. It is the wrong store for the other question an
# admin answers all day: "what is this person's password?". Until now the only
# answer was «reset it», which mints a new one, DMs it, and signs that person
# out of every browser they had open — a support question turning into an
# interruption. So the password is kept a second time, sealed.
#
# Sealed, not plaintext. The key is derived from SECRET_KEY, which lives in
# backend/.env and never in the database, so the .sql.gz the dbdump tab mails to
# Telegram carries ciphertext that is useless without the server's own secret.
# Encrypt-then-MAC built on HMAC-SHA256: HMAC is a PRF, so HMAC(key, nonce‖ctr)
# is a keystream, and a second independent key authenticates it. Stdlib only —
# the same reason the hash above is PBKDF2 and not a native library on a
# pipeline that deploys straight to production.
#
# This is a deliberate trade: an attacker holding BOTH the database and .env
# reads every browser password, where before they read none. It buys the admin
# panel the answer it actually needs, and the passwords it protects are for this
# dashboard alone.

_SEAL_SCHEME = "v1"


def _seal_keys() -> tuple[bytes, bytes]:
    """Two independent subkeys from SECRET_KEY — one to encrypt, one to
    authenticate. Never the same bytes for both."""
    root = (settings.secret_key or "").encode("utf-8")
    return (
        hmac.new(root, b"web-login-seal-enc-v1", hashlib.sha256).digest(),
        hmac.new(root, b"web-login-seal-mac-v1", hashlib.sha256).digest(),
    )


def _keystream(key: bytes, nonce: bytes, length: int) -> bytes:
    out = bytearray()
    counter = 0
    while len(out) < length:
        out += hmac.new(key, nonce + counter.to_bytes(4, "big"), hashlib.sha256).digest()
        counter += 1
    return bytes(out[:length])


def seal_password(raw: str) -> str:
    """``v1$<nonce>$<ciphertext>$<tag>``, all base64 — self-describing, so the
    construction can be replaced later without stranding old rows."""
    enc_key, mac_key = _seal_keys()
    nonce = secrets.token_bytes(16)
    data = (raw or "").encode("utf-8")
    ct = bytes(a ^ b for a, b in zip(data, _keystream(enc_key, nonce, len(data))))
    tag = hmac.new(mac_key, nonce + ct, hashlib.sha256).digest()
    return "{}${}${}${}".format(
        _SEAL_SCHEME,
        base64.b64encode(nonce).decode(),
        base64.b64encode(ct).decode(),
        base64.b64encode(tag).decode(),
    )


def open_password(sealed: Optional[str]) -> Optional[str]:
    """Read a sealed password back, or None when there is nothing honest to
    show: no sealed copy (a login last set before this existed), a corrupt row,
    or a rotated SECRET_KEY. The caller renders «unknown» — a wrong password
    displayed confidently is worse than no password at all."""
    if not sealed:
        return None
    try:
        scheme, nonce_b64, ct_b64, tag_b64 = sealed.split("$")
        if scheme != _SEAL_SCHEME:
            return None
        enc_key, mac_key = _seal_keys()
        nonce = base64.b64decode(nonce_b64)
        ct = base64.b64decode(ct_b64)
        expected = hmac.new(mac_key, nonce + ct, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, base64.b64decode(tag_b64)):
            return None
        plain = bytes(a ^ b for a, b in zip(ct, _keystream(enc_key, nonce, len(ct))))
        return plain.decode("utf-8")
    except Exception:
        return None


def set_password(cred: WebCredential, raw: str) -> None:
    """THE one way to put a password on a credential. Both stores are written
    here because a writer that sets only the hash leaves the admin panel showing
    a password that no longer logs in — a stale answer being the one failure
    mode worse than the missing one this feature exists to fix. Caller commits.
    """
    cred.password_hash = hash_password(raw)
    cred.password_enc = seal_password(raw)
    cred.password_set_at = _now()


# ── usernames ─────────────────────────────────────────────────────────────────

def _ascii_tokens(name: str) -> list[str]:
    """Name → lowercase ASCII word tokens. Supervisor names arrive in Cyrillic
    from Verifix and profile names in Uzbek Latin with ʻ/ʼ, so both run through
    the same transliterator that the UI uses for English."""
    latin = transliterate(name or "", "en") or ""
    tokens = []
    for raw in latin.replace("-", " ").split():
        token = "".join(ch for ch in raw.lower() if "a" <= ch <= "z")
        if token:
            tokens.append(token)
    return tokens


def suggest_username(db: Session, name: str, taken: Optional[set[str]] = None) -> str:
    """A short, readable login derived from the person's name.

    Register names are «Familiya Ism Otasining-ismi», so the surname plus a
    first initial (``aripova.m``) is both the shortest unique-enough form and
    the one people recognise as themselves. Two Aripova M.s widen it to
    ``aripova.manzura``, and only a third falls back to a numeric suffix — the
    ugly form is reached last, not first.
    """
    tokens = _ascii_tokens(name)
    if not tokens:
        return _unique(db, "user", taken)

    surname = tokens[0]
    first = tokens[1] if len(tokens) > 1 else ""

    candidates = [f"{surname}.{first[0]}" if first else surname]
    if first:
        candidates.append(f"{surname}.{first}")
    for candidate in candidates:
        if _is_free(db, candidate, taken):
            return candidate
    return _unique(db, candidates[-1], taken)


def _is_free(db: Session, username: str, taken: Optional[set[str]] = None) -> bool:
    if taken is not None and username in taken:
        return False
    return db.query(WebCredential).filter(WebCredential.username == username).first() is None


def _unique(db: Session, base: str, taken: Optional[set[str]] = None) -> str:
    if _is_free(db, base, taken):
        return base
    for n in range(2, 200):
        candidate = f"{base}{n}"
        if _is_free(db, candidate, taken):
            return candidate
    return f"{base}{secrets.randbelow(9000) + 1000}"


def normalize_username(raw: str) -> str:
    """Fold to the stored form. Case and surrounding space are the two things a
    phone keyboard adds on its own, so neither may decide a login."""
    return (raw or "").strip().lower()


def username_error(username: str) -> Optional[str]:
    if len(username) < 3:
        return "Username must be at least 3 characters"
    if len(username) > 40:
        return "Username must be at most 40 characters"
    if not all(ch.isalnum() or ch in "._-" for ch in username):
        return "Username may contain only letters, digits, dot, underscore and hyphen"
    return None


def password_error(password: str) -> Optional[str]:
    if len(password or "") < MIN_PASSWORD_LEN:
        return f"Password must be at least {MIN_PASSWORD_LEN} characters"
    if len(password) > 128:
        return "Password must be at most 128 characters"
    return None


# ── lockout ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    """Postgres hands back tz-aware values, SQLite naive ones. Compare in UTC."""
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def lock_seconds_left(cred: WebCredential) -> int:
    until = _aware(cred.locked_until)
    if not until:
        return 0
    return max(0, int((until - _now()).total_seconds()))


def register_failure(db: Session, cred: WebCredential) -> None:
    """Count a wrong password and lock the account once the run gets long.
    Caller commits."""
    cred.failed_attempts = (cred.failed_attempts or 0) + 1
    if cred.failed_attempts >= MAX_FAILED_ATTEMPTS:
        cred.locked_until = _now() + timedelta(minutes=LOCKOUT_MINUTES)
        cred.failed_attempts = 0


def clear_failures(db: Session, cred: WebCredential) -> None:
    cred.failed_attempts = 0
    cred.locked_until = None


# Per-IP throttle. Deliberately in process memory and deliberately secondary:
# the authoritative lockout is the DB counter above, which survives a restart.
# This only blunts username enumeration and spraying across many accounts, where
# losing the counter on a deploy costs nothing.
_IP_WINDOW_SEC = 300
_IP_MAX_TRIES  = 30
_ip_hits: dict[str, list[float]] = {}


def ip_throttled(ip: str) -> bool:
    if not ip:
        return False
    now = time.time()
    hits = [t for t in _ip_hits.get(ip, []) if now - t < _IP_WINDOW_SEC]
    _ip_hits[ip] = hits
    if len(_ip_hits) > 5000:          # crude bound; the map is best-effort anyway
        _ip_hits.clear()
    return len(hits) >= _IP_MAX_TRIES


def record_ip_attempt(ip: str) -> None:
    if ip:
        _ip_hits.setdefault(ip, []).append(time.time())


# ── profile → session identity ────────────────────────────────────────────────

def session_identity(db: Session, key: str) -> Optional[dict]:
    """The exact (telegram_id, role, role_id, role_ref, full_name) tuple a
    Telegram login for this profile would produce.

    Returns None when the profile has no approved holder. That is not an edge
    case to paper over: a browser login is delivered and recovered by Telegram
    DM, so a profile nobody holds has no way to receive its own password and no
    account to act as. The admin UI surfaces that state instead of offering a
    login that could never be used.
    """
    role, ref = parse_profile_key(key)
    if not role or not ref:
        return None

    if role == "admin":
        admin = db.query(Admin).filter(Admin.profile_id == ref).order_by(Admin.id).first()
        profile = db.query(RoleProfile).filter_by(id=ref, role="admin").first()
        if not admin or not profile:
            return None
        return {"telegram_id": admin.telegram_id, "role": "admin", "role_id": None,
                "role_ref": None, "full_name": profile.name}

    holders = profile_holders(db, key)
    if not holders:
        return None

    q = db.query(TelegramUserRole).filter(
        TelegramUserRole.role == role,
        TelegramUserRole.status == "approved",
        TelegramUserRole.telegram_id.in_(holders),
    )
    if role == "leader":
        profile = db.query(RoleProfile).filter_by(id=ref, role="leader").first()
        if not profile:
            return None
        rows = [
            r for r in q.filter(TelegramUserRole.role_id == profile.manager_id)
            if r.profile_key == key or (not r.profile_key and r.full_name == profile.name)
        ]
    else:
        rows = [r for r in q.filter(TelegramUserRole.role_id == ref)
                if not r.profile_key or r.profile_key == key]

    if not rows:
        return None
    row = min(rows, key=lambda r: r.id)
    return {"telegram_id": row.telegram_id, "role": row.role, "role_id": row.role_id,
            "role_ref": row.id, "full_name": row.full_name}


# ── the token ─────────────────────────────────────────────────────────────────

def create_web_jwt(identity: dict, cred: WebCredential, remember: bool,
                   impersonated_by: Optional[dict] = None) -> str:
    """Same shape as ``auth.create_jwt`` plus the two claims that make it a
    browser session: ``web`` (what ``security.py`` accepts in place of initData)
    and ``wv`` (the token version, so an admin can revoke every browser session
    for a profile without touching anything else).

    ``impersonated_by`` adds a third, ``imp`` — who opened this session as
    somebody else. It changes NOTHING about what the session may do: the whole
    point of impersonation is to see the platform exactly as that person sees
    it, so a token that behaved differently would answer a different question.
    It is carried so the app can SAY so on screen, and so the fact survives a
    reload, a page navigation and a password change rather than living in the
    tab that opened it.
    """
    ttl = timedelta(days=REMEMBER_DAYS) if remember else timedelta(hours=SESSION_HOURS)
    payload = {
        "sub":       str(identity["telegram_id"]),
        "role":      identity["role"],
        "full_name": identity["full_name"],
        "role_id":   identity["role_id"],
        "role_ref":  identity["role_ref"],
        "web":       True,
        "wv":        cred.token_version,
        "wu":        cred.username,
        "exp":       datetime.utcnow() + ttl,
    }
    if impersonated_by:
        payload["imp"] = impersonated_by
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def web_session_is_live(db: Session, payload: dict) -> bool:
    """Is this browser token still honoured? Signature and expiry are already
    checked by the caller; what remains is revocation — a disabled login or a
    bumped token version must stop working immediately, not at expiry."""
    username = payload.get("wu")
    if not username:
        return False
    cred = db.query(WebCredential).filter(WebCredential.username == username).first()
    if not cred or not cred.enabled:
        return False
    return int(payload.get("wv") or 0) == int(cred.token_version or 0)


# ── impersonation: opening the app AS somebody else ───────────────────────────
#
# An admin presses «open as this profile» and a new tab comes up signed in as
# that person — the fastest honest answer to "what does this page look like for
# a leader?" and to a bug nobody can reproduce from an admin account.
#
# What crosses between the two tabs is NOT a token. The admin's tab is handed a
# one-time CODE and only the tab that redeems it is ever given a session, so no
# session for another identity exists until the moment it is used. A JWT put in
# a URL instead would sit in the browser history, in the referrer of the first
# outbound request and in nginx's access log — three places a credential must
# never reach, none of which a short expiry cleans up.
#
# The store is process memory, deliberately, exactly like the per-IP throttle
# above: the unit runs a single worker, a code is redeemed within seconds of
# being minted, and a restart inside that window costs one re-press. Writing a
# credential-equivalent to the database — where it would ride in every dbdump —
# to survive a case that cannot outlive a page load is the worse trade.
#
# Two properties make the code safe to put in a URL: it is deleted on first use
# (a replayed link opens nothing) and it expires in a minute (a link copied out
# of the history bar is already dead).

IMPERSONATE_TTL_SEC = 60

# code → {profile_key, username, by, exp}
_imp_codes: dict[str, dict] = {}


def _prune_imp_codes(now: float) -> None:
    for code in [c for c, rec in _imp_codes.items() if rec["exp"] <= now]:
        _imp_codes.pop(code, None)


def mint_impersonation(profile_key: str, username: str, actor: dict) -> str:
    """Issue the one-time code for one (admin, profile) press. Caller has
    already checked that the admin may do this and that the login is live."""
    now = time.time()
    _prune_imp_codes(now)
    code = secrets.token_urlsafe(32)
    _imp_codes[code] = {
        "profile_key": profile_key,
        "username":    username,
        # WHO opened it — stamped into the session's own token below, so the
        # tab can say whose doing this is for as long as it is open.
        "by": {"sub": actor.get("sub"), "name": actor.get("full_name") or ""},
        "exp": now + IMPERSONATE_TTL_SEC,
    }
    return code


def redeem_impersonation(code: str) -> Optional[dict]:
    """Spend a code, or None when it never existed, has already been spent, or
    has expired. Popped BEFORE the expiry test, so a stale code cannot be
    retried while it ages out."""
    now = time.time()
    _prune_imp_codes(now)
    rec = _imp_codes.pop(code or "", None)
    if not rec or rec["exp"] <= now:
        return None
    return rec


# ── audit ─────────────────────────────────────────────────────────────────────

def audit(action: str, actor: dict, profile: str, username: str, extra: str = "") -> None:
    """Record a change to somebody's browser access.

    Handing out (or resetting, or disabling) a password creates or removes a way
    into an account, which is the same weight of event as a capability grant and
    has to stay answerable afterwards. One fixed prefix so the whole trail is one
    grep on the box: ``grep WEB-LOGIN backend/logs/app.log``.

    Passwords never appear here — not the generated one, not a hash, not a
    length. An audit trail that leaks the thing it is auditing is worse than
    none.
    """
    log.info(
        "WEB-LOGIN %s | login=%s | profile=%s | by=%s (tg=%s, role=%s)%s",
        action, username, profile,
        actor.get("full_name") or "?", actor.get("sub"), actor.get("role"),
        f" | {extra}" if extra else "",
    )


# ── Telegram delivery ─────────────────────────────────────────────────────────

_CRED_DM = {
    "uz": ("🔐 <b>Sayt uchun login</b>\n\n"
           "Endi dashboardni brauzerda ham ochishingiz mumkin:\n{url}\n\n"
           "Login: <code>{username}</code>\nParol: <code>{password}</code>\n\n"
           "Parolni «Profil» sahifasida o'zgartirishingiz mumkin."),
    "uz_cyrl": ("🔐 <b>Сайт учун логин</b>\n\n"
                "Энди дашбордни браузерда ҳам очишингиз мумкин:\n{url}\n\n"
                "Логин: <code>{username}</code>\nПарол: <code>{password}</code>\n\n"
                "Паролни «Профил» саҳифасида ўзгартиришингиз мумкин."),
    "ru": ("🔐 <b>Вход на сайт</b>\n\n"
           "Теперь дашборд можно открыть и в браузере:\n{url}\n\n"
           "Логин: <code>{username}</code>\nПароль: <code>{password}</code>\n\n"
           "Пароль можно изменить на странице «Профиль»."),
    "en": ("🔐 <b>Website login</b>\n\n"
           "You can now open the dashboard in a browser:\n{url}\n\n"
           "Username: <code>{username}</code>\nPassword: <code>{password}</code>\n\n"
           "You can change the password on the «Profile» page."),
}


def _holder_lang(db: Session, telegram_id: int) -> str:
    user = db.query(TelegramUser).filter_by(telegram_id=telegram_id).first()
    if user and user.language:
        return user.language
    admin = db.query(Admin).filter_by(telegram_id=telegram_id).first()
    if admin and admin.language:
        return admin.language
    return "uz"


def dm_credentials(db: Session, key: str, username: str, password: str) -> int:
    """DM the login to EVERY holder of the profile — they are all that person,
    and a credential only one of them received is a credential the others will
    ask an admin for. Returns how many DMs went out; delivery failures are
    logged, never raised, so one blocked bot chat cannot fail the admin's
    action."""
    holders = profile_holders(db, key)
    if not holders:
        return 0
    try:
        from app.telegram_bot import bot
    except Exception:
        log.exception("web-login DM: bot unavailable")
        return 0

    url = settings.webapp_url or "https://production.safiacorporate.uz"
    sent = 0
    for telegram_id in holders:
        template = _CRED_DM.get(_holder_lang(db, telegram_id), _CRED_DM["uz"])
        try:
            bot.send_message(
                telegram_id,
                template.format(url=url, username=username, password=password),
                parse_mode="HTML",
            )
            sent += 1
        except Exception:
            log.warning("web-login DM failed for %s", telegram_id, exc_info=True)
    return sent
