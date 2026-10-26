"""The report door — production answers a question only after a person says yes.

CLAUDE.md «The report door». A Claude session that needs production's data
(a laptop, or a cloud session once production.safiacorporate.uz is on its
allowlist) POSTs ONE question — a read-only SQL query, or a GET of an endpoint
that already exists — and names the person who must allow it: Burkhon or
Abbos (`startup.REPORT_CHAT_*`). That person gets a Telegram card carrying the
EXACT question; nothing runs until they tap «Ruxsat berish». The asker then
takes the answer ONCE, within 15 minutes, and it is never stored here — only
its size. It replaced the flag-guarded one-shot report for every question a
query can answer: a module, two deploys and a cache flush per question.

Five bounds, each one decided rather than defaulted:

- **The ask key** asks and nothing else. Its SHA-256 is all this file holds
  (`KEY_SHA256`, the APK publish key's pattern); the key lives outside git
  (~/.safia/ops.key on the build Mac, a credential in a cloud environment).
  A leak costs a stream of cards the approver denies, never data.
- **The approver sees the whole question** — a query longer than a card can
  print is refused, never cut — and only the person the card was sent to can
  answer it (the tap is checked against the row, never against the chat).
- **A SELECT is bounded harder than any request**: a single statement in a
  READ ONLY transaction (no row locks, no writes, no sequences), run as the
  SELECT-only role `safia_ops_reader` where the database let us make one,
  20 s, 5,000 rows, 2 MB, on a connection of its own that is closed after —
  so nothing it set or took outlives it. Functions that signal, sleep, lock,
  read files or run SQL from a string are refused by name.
- **A GET runs as the approver** — an admin — through this process's own
  ASGI stack (`security.INTERNAL_MARK`), so every endpoint applies its own
  rules; the door adds none and removes none but the Telegram-origin wall.
- **Secrets never leave**: a column or JSON key naming a password, token,
  secret, sealed value or hash is masked, and so is the `value` beside a
  settings-style `key` that names one (`/admin/settings`' own rule).

Kill switch: `ops_door_off` in app_settings — the card's «Eshikni yopish»
button and `/opsdoor` in the bot set it; while it is set every ask is refused.
Every ask, decision, take and expiry is a Jurnal row (category sync_export,
source «ops» for the asker, «bot» for the approver).
"""
from __future__ import annotations

import hashlib
import hmac
import html
import json
import logging
import re
import secrets
import threading
import time
from collections import deque
from datetime import date, datetime, time as dtime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional
from uuid import UUID

from app.config import settings

log = logging.getLogger("app.ops_door")

# The ask key's SHA-256. The key itself is ~/.safia/ops.key on the build Mac
# (mode 600, never in git). A new key = a new digest here.
KEY_SHA256 = "232c9c2eb401ebe731b14d54b2439c1c4270df6ad16fd2f191d22d994a07bfe0"
KEY_HEADER = "x-ops-key"

ASK_TTL = timedelta(minutes=15)      # an unanswered card dies
TAKE_TTL = timedelta(minutes=15)     # an allowed answer not taken dies
STATEMENT_TIMEOUT_MS = 20_000
LOCK_TIMEOUT_MS = 3_000
MAX_ROWS = 5_000
MAX_BYTES = 2 * 1024 * 1024
MAX_QUERY_CHARS = 3_000              # what a card can print whole
MAX_WHY_CHARS = 200
CARD_BUDGET = 4_000                  # Telegram's 4,096 UTF-16 units, minus a margin
FETCH_BATCH = 10                     # rows pulled per round trip — memory is bounded as rows arrive
ROW_CHAR_CAP = MAX_BYTES             # one row is cut ON THE SERVER past this many characters
CELL_TEXT_CAP = 200_000              # one text value longer than this is cut, and said so
MAX_ASKER_CHARS = 60
MAX_PENDING = 3                      # cards waiting at once
MAX_PER_HOUR = 40
GET_TIMEOUT_S = 50.0                 # under the supervisor's 60 s swap grace and Cloudflare's 100 s
RUNNING_STALE = timedelta(minutes=5) # a take that never finished (a killed worker) is failed
READER_ROLE = "safia_ops_reader"
OFF_KEY = "ops_door_off"
TZ_NAME = "Asia/Tashkent"

VERBS = ("sql", "get")
OPEN_STATES = ("pending", "approved")


class Refused(Exception):
    """An ask the door will not take, with a code the client prints."""

    def __init__(self, code: str, message: str, status: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _local(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    from zoneinfo import ZoneInfo
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(ZoneInfo(TZ_NAME))


def _hhmm(dt: Optional[datetime]) -> str:
    d = _local(dt)
    return d.strftime("%H:%M") if d else "—"


# ── who may be asked ──────────────────────────────────────────────────────────

def approvers() -> dict[str, int]:
    """The two people a question may be put to — `startup.REPORT_CHAT_*`, the
    one definition of who reads production's answers. Never both."""
    from app.startup import REPORT_CHAT_ABBOS, REPORT_CHAT_BURKHON
    return {"burkhon": REPORT_CHAT_BURKHON, "abbos": REPORT_CHAT_ABBOS}


def approver_ids() -> set[int]:
    return set(approvers().values())


def person_name(db, tg_id: int) -> str:
    """The approver's display name: their admin profile, else the account."""
    from app.models import Admin, RoleProfile, TelegramUser
    try:
        row = db.query(Admin).filter_by(telegram_id=tg_id).first()
        if row and row.profile_id:
            p = db.query(RoleProfile).filter_by(id=row.profile_id, role="admin").first()
            if p and p.name:
                return p.name
        u = db.query(TelegramUser).filter_by(telegram_id=tg_id).first()
        if u and (u.full_name or u.tg_name):
            return u.full_name or u.tg_name
    except Exception:  # noqa: BLE001
        log.debug("ops door: name lookup failed", exc_info=True)
    return str(tg_id)


def is_admin(db, tg_id: int) -> bool:
    from app.models import Admin
    return db.query(Admin).filter_by(telegram_id=tg_id).first() is not None


def lang_of(db, tg_id: int) -> str:
    from app.models import Admin, TelegramUser
    try:
        u = db.query(TelegramUser).filter_by(telegram_id=tg_id).first()
        if u and u.language:
            return u.language
        a = db.query(Admin).filter_by(telegram_id=tg_id).first()
        if a and a.language:
            return a.language
    except Exception:  # noqa: BLE001
        pass
    return "uz"


# ── the key ───────────────────────────────────────────────────────────────────

def presented_key(headers) -> str:
    """The key a request carries: `X-Ops-Key`, or `Authorization: Bearer` —
    the second so a cloud environment's Bearer credential can carry it. These
    paths are outside the JWT wall (security._EXEMPT_PREFIXES), so a bearer
    value here is never read as a session."""
    v = (headers.get(KEY_HEADER) or "").strip()
    if v:
        return v
    auth = headers.get("authorization") or ""
    scheme, _, token = auth.partition(" ")
    return token.strip() if scheme.lower() == "bearer" else ""


def key_ok(presented: str) -> bool:
    if not presented or len(KEY_SHA256) != 64:
        return False
    digest = hashlib.sha256(presented.strip().encode()).hexdigest()
    return hmac.compare_digest(digest, KEY_SHA256)


# A wrong key is answered 401; ten in ten minutes from one address and that
# address is answered 429 for the next ten. In memory, per process: a swap
# forgets it, which costs a guesser nothing they did not have.
_BAD: dict[str, deque] = {}
_BAD_LOCK = threading.Lock()
BAD_WINDOW_S = 600
BAD_LIMIT = 10


def throttled(ip: str) -> bool:
    with _BAD_LOCK:
        q = _BAD.get(ip or "?")
        if not q:
            return False
        cut = time.monotonic() - BAD_WINDOW_S
        while q and q[0] < cut:
            q.popleft()
        return len(q) >= BAD_LIMIT


def note_bad(ip: str) -> int:
    with _BAD_LOCK:
        q = _BAD.setdefault(ip or "?", deque())
        q.append(time.monotonic())
        if len(_BAD) > 2000:                 # never a memory sink
            for k in list(_BAD)[:1000]:
                _BAD.pop(k, None)
        return len(q)


# ── the switch ────────────────────────────────────────────────────────────────

def door_open(db) -> bool:
    from app.models import AppSetting
    row = db.query(AppSetting).filter_by(key=OFF_KEY).first()
    return not (row and (row.value or "").strip() == "1")


def set_door(db, open_: bool) -> None:
    from app.models import AppSetting
    row = db.query(AppSetting).filter_by(key=OFF_KEY).first()
    if row is None:
        db.add(AppSetting(key=OFF_KEY, value="0" if open_ else "1"))
    else:
        row.value = "0" if open_ else "1"


# ── the SQL rules ─────────────────────────────────────────────────────────────

_FIRST_WORD = re.compile(r"^\s*(?:\(\s*)*([a-z]+)\b", re.I)
_SQL_START = ("select", "with", "values", "table", "explain", "show")
# Refused BY NAME, wherever they appear (a string literal included — a false
# refusal costs a rewrite, a missed one costs the plant): functions that signal
# or kill backends, sleep, take advisory locks (session-level ones would
# outlive the statement), read the server's files, touch large objects, open
# connections, change settings, notify, manage replication or WAL, reset
# statistics, advance sequences or transaction ids, or run SQL held in a
# string (the way round every other line of this list).
_DENY = re.compile(r"""\b(
    pg_terminate_backend | pg_cancel_backend | pg_sleep\w* |
    pg_\w*advisory\w* | pg_read_\w*file | pg_ls_\w+ | pg_stat_file |
    pg_file_\w+ | lo_\w+ | dblink\w* | set_config | pg_reload_conf |
    pg_rotate_logfile | pg_notify | pg_logical_\w+ | pg_create_\w+ |
    pg_drop_\w+ | pg_replication_\w+ | pg_switch_wal | pg_promote |
    pg_backup_\w+ | pg_start_backup | pg_stop_backup | pg_stat_reset\w* |
    pg_wal_\w+ | nextval | setval | txid_current\w* | pg_current_xact_id\w* |
    (?:query|cursor|table|schema|database)_to_xml\w* | ts_stat | ts_rewrite |
    crosstab\w* | \w+_reset | pg_log_backend_memory_contexts |
    pg_stats\w* | pg_statistic\w* | ops_door_plan |
    get_raw_page | \w*page_items | page_header | pgstat\w* | pg_visibility\w* | pgrowlocks |
    pg_import_system_collations | currval | lastval
)\b""", re.I | re.X)
# (`pg_stats` / `pg_statistic*` above hold SAMPLED COLUMN VALUES of every
# table the caller may read — on production, as the app's user, that is the
# password hashes; the table there is row DATA, never a planned relation, so
# no table-name check could see it. Refused by the view's own name.)
#
# The credential tables and columns. No answer may come from them, under any
# role, in any shape — masking a value after the fact cannot survive arbitrary
# SQL (`SELECT w FROM web_credentials w`, `reverse(password_hash)`), so the
# question is refused instead: in its text, and again in its PLAN.
_FORBIDDEN = re.compile(r"\b(web_credentials | ai_keys | password_hash | password_enc | key_enc)\b",
                        re.I | re.X)
# A U&"…" identifier (or U&'…' string) is decoded by Postgres AFTER the text
# above was read — the one way to spell a refused name without its letters.
_UNICODE_ESCAPE = re.compile(r"\bu&\s*['\"]", re.I)
_TABLES = re.compile(r"\b(?:from|join)\s+([a-z_][\w]*(?:\.[a-z_][\w]*)?)", re.I)
_CTE = re.compile(r"(?:\bwith\s+(?:recursive\s+)?|,\s*)([a-z_]\w*)\s+as\s*(?:not\s+)?(?:materialized\s+)?\(", re.I)


def check_sql(sql: str) -> tuple[str, str]:
    """(the statement as it will run, its first keyword) — or Refused."""
    text_ = (sql or "").strip()
    if not text_:
        raise Refused("empty", "The query is empty.")
    if len(text_) > MAX_QUERY_CHARS:
        raise Refused("too_long", f"The query is longer than {MAX_QUERY_CHARS} characters, "
                      "which a card cannot print whole. Split it.")
    body = text_.rstrip().rstrip(";").rstrip()
    if ";" in body:
        raise Refused("one_statement", "One statement only — a second one after «;» is refused.")
    m = _FIRST_WORD.match(body)
    first = (m.group(1).lower() if m else "")
    if first not in _SQL_START:
        raise Refused("not_select", "Only SELECT / WITH / VALUES / TABLE / EXPLAIN / SHOW.")
    if first == "explain":
        # EXPLAIN ANALYZE runs the statement: only of a SELECT.
        rest = re.sub(r"^\s*explain\s*(\([^)]*\)|\b(analy[sz]e|verbose|costs|buffers|format\s+\w+)\b|\s)*",
                      "", body, flags=re.I)
        w = _FIRST_WORD.match(rest)
        if not w or w.group(1).lower() not in ("select", "with", "values", "table"):
            raise Refused("not_select", "EXPLAIN only of a SELECT.")
    if _UNICODE_ESCAPE.search(body):
        raise Refused("unicode_escape", "U&-escaped identifiers and strings are refused — "
                      "write the names plainly, so the card shows what will run.")
    hit = _DENY.search(body)
    if hit:
        raise Refused("denied_function", f"«{hit.group(1)}» is not allowed through this door.")
    hit = _FORBIDDEN.search(body)
    if hit:
        raise Refused("credentials", f"«{hit.group(1)}» holds credentials — no answer comes "
                      "from it through this door.")
    if "\x00" in body:
        raise Refused("bad_text", "The query holds a NUL character.")
    return body, first


def plan_target(body: str, first: str) -> Optional[str]:
    """The statement whose PLAN is checked before anything runs: the query
    itself, the SELECT inside an EXPLAIN, or nothing for SHOW."""
    if first == "show":
        return None
    if first == "explain":
        return re.sub(r"^\s*explain\s*(\([^)]*\)|\b(analy[sz]e|verbose|costs|buffers|format\s+\w+)\b|\s)*",
                      "", body, flags=re.I)
    return body


def plan_refusal(plan_text: str) -> Optional[str]:
    """What a resolved plan reveals that the text hid: a refused function or
    a credential table, by the name Postgres resolved, however it was spelt."""
    hit = _DENY.search(plan_text or "")
    if hit:
        return f"the plan calls «{hit.group(1)}», which is not allowed through this door"
    hit = _FORBIDDEN.search(plan_text or "")
    if hit:
        return f"the plan reads «{hit.group(1)}», which holds credentials"
    return None


_FROM_FUNCS = ("extract", "substring", "trim", "overlay", "position")


def _in_function_from(sql: str, at: int) -> bool:
    """True when the FROM at `at` sits inside EXTRACT( … ), SUBSTRING( … ) and
    the like, where it names no table."""
    depth, i = 0, at - 1
    while i >= 0:
        ch = sql[i]
        if ch == ")":
            depth += 1
        elif ch == "(":
            if depth == 0:
                m = re.search(r"([a-z_]+)\s*$", sql[:i], re.I)
                return bool(m and m.group(1).lower() in _FROM_FUNCS)
            depth -= 1
        i -= 1
    return False


def tables_of(sql: str) -> list[str]:
    """The tables a query names after FROM / JOIN, for the card. A reading aid
    — the whole text is on the card beside it."""
    sql = sql or ""
    ctes = {m.group(1).lower() for m in _CTE.finditer(sql)}
    out: list[str] = []
    for m in _TABLES.finditer(sql):
        if _in_function_from(sql, m.start()):
            continue
        name = m.group(1)
        low = name.lower()
        if low in ctes or low in ("lateral", "select", "unnest", "generate_series"):
            continue
        if name not in out:
            out.append(name)
    return out[:12]


# ── the GET rules ─────────────────────────────────────────────────────────────

_PATH = re.compile(r"^/(?:api|admin)/[A-Za-z0-9_\-./~%:@]*$")


def _get_routes():
    from app.main import app
    from app.services.assistant_api import _walk
    out = []
    for ctx in _walk(app.routes):
        methods = getattr(ctx, "methods", None) or set()
        if "GET" not in methods:
            continue
        rx = getattr(ctx, "path_regex", None)
        tpl = getattr(ctx, "path", "") or ""
        # The page catch-all («/{full_path:path}») answers every GET with the
        # app's HTML — matching it would accept any path at all.
        if rx is None or ":path}" in tpl or not tpl.startswith(("/api/", "/admin/")):
            continue
        out.append((tpl, rx))
    return out


def check_get(path: str, params: Any) -> tuple[str, dict]:
    p = (path or "").strip()
    if "?" in p:
        raise Refused("query_in_path", "Put the query string in «params», not in the path.")
    if not _PATH.match(p) or ".." in p or "//" in p:
        raise Refused("bad_path", "The path must be /api/... or /admin/....")
    if p.startswith("/api/ops/"):
        raise Refused("bad_path", "The door does not ask itself.")
    if not any(rx.match(p) for _tpl, rx in _get_routes()):
        raise Refused("no_route", f"No GET route matches {p}.")
    clean: dict = {}
    if params not in (None, ""):
        if not isinstance(params, dict):
            raise Refused("bad_params", "«params» must be an object of name: value.")
        for k, v in params.items():
            if not isinstance(k, str) or not re.match(r"^[A-Za-z0-9_\-\[\].]{1,64}$", k):
                raise Refused("bad_params", f"Bad parameter name: {k!r}")
            if isinstance(v, (list, tuple)):
                vals = [str(x) for x in v][:50]
            elif isinstance(v, bool):
                vals = "true" if v else "false"
            elif v is None:
                continue
            else:
                vals = str(v)
            clean[k] = vals
    shown = p + ("?" + "&".join(f"{k}={v}" for k, v in clean.items()) if clean else "")
    if len(shown) > 1000:
        raise Refused("too_long", "The path and its parameters exceed 1000 characters.")
    return p, clean


# ── masking ───────────────────────────────────────────────────────────────────

# A column or key NAME that holds a credential. `token_version` (a counter)
# and `tokens_in` / `tokens_out` (AI usage) are numbers and stay readable.
_SECRET_NAME = re.compile(r"""(
    passw | secret | api_?key | private_?key | _enc$ | ^enc_ | _sealed$ |
    ^sealed | init_?data | ^token$ | _token$ | ^token_(?!version) | ^jwt | _jwt$ |
    ^otp$ | _otp$ | _hash$ | cookie | ^authorization$ | ^credential
)""", re.I | re.X)
# A settings-style row: its KEY names a credential, so its VALUE is one —
# routers/admin._SECRET_HINTS, the rule /admin/settings' log already applies.
_SECRET_HINTS = ("key", "token", "secret", "password")
_KEY_FIELDS = ("key", "name", "setting", "k")
# A VALUE shaped like a credential is masked whatever column or key it sits
# under — `SELECT value FROM app_settings WHERE key = '…'` names no key column,
# and a flat settings map names no `key` field. The platform's own shapes
# (web_auth.seal_password, web_auth.hash_password, a JWT) and the providers'.
_SECRET_VALUE = re.compile(r"""(?:
    v\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]*\$[A-Za-z0-9+/=]+ |
    pbkdf2_\w+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+ |
    eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,} |
    \d{8,10}:[A-Za-z0-9_-]{30,} |
    AIza[0-9A-Za-z_-]{30,} | sk-ant-[A-Za-z0-9_-]{16,} | sk-[A-Za-z0-9]{32,} |
    ops_[A-Za-z0-9_-]{30,} | ntn_[A-Za-z0-9]{30,} | secret_[A-Za-z0-9]{30,} |
    gh[pousr]_[A-Za-z0-9]{30,} | -----BEGIN\ [A-Z ]*PRIVATE\ KEY-----
)""", re.X)
_VALUE_FIELDS = ("value", "v", "val", "value_json", "raw")
MASK = "•••"


def secret_name(name: str) -> bool:
    return bool(name) and bool(_SECRET_NAME.search(str(name)))


def secret_value(v: Any) -> bool:
    """A string that CARRIES a credential's shape anywhere in it — a bare
    sealed value, or one inside a record literal, a concatenation, an
    aggregate, a JSON text."""
    return isinstance(v, str) and len(v) >= 20 and bool(_SECRET_VALUE.search(v))


def _hinted(v: Any) -> bool:
    return isinstance(v, str) and any(h in v.lower() for h in _SECRET_HINTS)


def mask_json(obj: Any, masked: set, depth: int = 0) -> Any:
    """A JSON answer with every credential replaced by •••. `masked` collects
    the names, so the result can say what it withheld."""
    if depth > 40:
        return obj
    if isinstance(obj, dict):
        keyish = next((obj[k] for k in _KEY_FIELDS if k in obj and isinstance(obj[k], str)), None)
        hide_value = _hinted(keyish)
        out = {}
        for k, v in obj.items():
            if secret_name(k) and v not in (None, ""):
                out[k] = MASK
                masked.add(str(k))
            elif hide_value and k in _VALUE_FIELDS and v not in (None, ""):
                out[k] = MASK
                masked.add(f"{keyish}")
            else:
                out[k] = mask_json(v, masked, depth + 1)
                if out[k] == MASK and v != MASK:
                    masked.add(str(k))
        return out
    if isinstance(obj, list):
        return [mask_json(x, masked, depth + 1) for x in obj]
    if secret_value(obj):
        return MASK
    return obj


def plain(v: Any) -> Any:
    """A database value as JSON can carry it."""
    if isinstance(v, str):
        return v if len(v) <= CELL_TEXT_CAP else v[:CELL_TEXT_CAP] + f"… [{len(v)} chars]"
    if v is None or isinstance(v, (bool, int, float)):
        if isinstance(v, float) and (v != v or v in (float("inf"), float("-inf"))):
            return str(v)
        return v
    if isinstance(v, Decimal):
        return str(v)
    if isinstance(v, (datetime, date, dtime)):
        return v.isoformat()
    if isinstance(v, timedelta):
        return v.total_seconds()
    if isinstance(v, UUID):
        return str(v)
    if isinstance(v, (bytes, bytearray, memoryview)):
        return f"<{len(bytes(v))} bytes>"
    if isinstance(v, (list, tuple)):
        return [plain(x) for x in v]
    if isinstance(v, dict):
        return {str(k): plain(x) for k, x in v.items()}
    return str(v)


def mask_rows(columns: list[str], rows: list[list], masked: set) -> list[list]:
    secret_cols = {i for i, c in enumerate(columns) if secret_name(c)}
    key_col = next((i for i, c in enumerate(columns) if c in _KEY_FIELDS), None)
    value_cols = {i for i, c in enumerate(columns) if c in _VALUE_FIELDS}
    for i in secret_cols:
        masked.add(columns[i])
    out = []
    for r in rows:
        row = list(r)
        hide_value = key_col is not None and _hinted(row[key_col])
        for i in range(len(row)):
            if row[i] in (None, ""):
                continue
            if i in secret_cols:
                row[i] = MASK
            elif hide_value and i in value_cols:
                row[i] = MASK
                masked.add(f"{columns[key_col]}={row[key_col]}")
            elif isinstance(row[i], (dict, list)):
                row[i] = mask_json(row[i], masked)
            elif secret_value(row[i]):
                row[i] = MASK
                masked.add(columns[i])
        out.append(row)
    return out


# ── the reader role ───────────────────────────────────────────────────────────

_ROLE = {"state": None, "why": None, "at": 0.0}
_ROLE_LOCK = threading.Lock()


_ENGINE = None


def _reader_engine():
    """A connection of the door's own, never the pool's: closed after every
    query, so a setting, a temp table or a lock it leaves cannot outlive it."""
    global _ENGINE
    if _ENGINE is not None:
        return _ENGINE
    from sqlalchemy import create_engine
    from sqlalchemy.pool import NullPool
    _ENGINE = create_engine(settings.database_url, poolclass=NullPool,
                            connect_args={"application_name": "safia-ops-door",
                                          "connect_timeout": 10})
    return _ENGINE


CREDENTIAL_TABLES = ("web_credentials", "ai_keys")


def _set_privilege(conn) -> str:
    """PG 16 split membership from the right to SET ROLE (a CREATEROLE user is
    made a member of what it creates, with SET FALSE): ask for 'SET' there."""
    from sqlalchemy import text
    v = int(conn.execute(text("SHOW server_version_num")).scalar() or 0)
    return "SET" if v >= 160000 else "MEMBER"


PLAN_FN = "ops_door_plan"
PLAN_LINE_CAP = 20_000
_PLAN_FN_SQL = f"""
CREATE OR REPLACE FUNCTION public.{PLAN_FN}(q text, cap integer) RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER AS $fn$
DECLARE
    r record;
    out text := '';
BEGIN
    -- The report door's plan check (services/ops_door.py): EXPLAIN one
    -- statement and hand back its text, or NULL when a line is longer than
    -- `cap` — a folded constant that size is refused, never read whole.
    FOR r IN EXECUTE 'EXPLAIN (VERBOSE, COSTS OFF) ' || q LOOP
        IF length(r."QUERY PLAN") > cap THEN
            RETURN NULL;
        END IF;
        out := out || r."QUERY PLAN" || E'\\n';
        IF length(out) > cap * 20 THEN
            RETURN NULL;
        END IF;
    END LOOP;
    RETURN out;
END
$fn$
"""


def ensure_plan_function() -> bool:
    """Boot (deferred): the plan function the SQL check reads plans through,
    so a constant folded into a plan (`repeat('x', 300000000)`) is measured on
    the server and never fetched whole. Without it the door EXPLAINs directly."""
    from app.database import engine
    try:
        with engine.begin() as c:
            c.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
            c.exec_driver_sql(_PLAN_FN_SQL)
        print("[startup] ops door: plan function ready")
        _PLAN_FN_STATE["ok"] = True
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] ops door: no plan function ({str(exc).splitlines()[0][:160]}) — "
              "plans are read directly")
        _PLAN_FN_STATE["ok"] = False
        return False


_PLAN_FN_STATE: dict = {"ok": None}


def plan_function_ready() -> bool:
    if _PLAN_FN_STATE["ok"] is None:
        try:
            from sqlalchemy import text
            from app.database import engine
            with engine.connect() as c:
                _PLAN_FN_STATE["ok"] = c.execute(text(
                    "SELECT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace "
                    "WHERE n.nspname = 'public' AND p.proname = :f)"), {"f": PLAN_FN}).scalar()
        except Exception:  # noqa: BLE001
            return False
    return bool(_PLAN_FN_STATE["ok"])


def ensure_reader_role() -> None:
    """Boot (deferred): make `safia_ops_reader`, a NOLOGIN role that may only
    SELECT, and let the app's user SET ROLE to it. Needs CREATEROLE the first
    time — the production app user (deploy/01-provision.sh) has none, so there
    the door runs SQL as the app's user in the same READ ONLY transaction, and
    the card says so. New tables are granted at each boot; the credential
    tables never are (and are revoked if they ever were). The plan function
    is made first, whatever becomes of the role."""
    from sqlalchemy import text
    from app.database import engine
    ensure_plan_function()
    try:
        with engine.begin() as c:
            c.exec_driver_sql("SET LOCAL lock_timeout = '5s'")
            exists = c.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :r"),
                               {"r": READER_ROLE}).first()
            if not exists:
                c.exec_driver_sql(f"CREATE ROLE {READER_ROLE} NOLOGIN NOSUPERUSER "
                                  "NOCREATEDB NOCREATEROLE NOINHERIT")
            priv = _set_privilege(c)
            can_set = c.execute(text("SELECT pg_has_role(current_user, :r, :p)"),
                                {"r": READER_ROLE, "p": priv}).scalar()
            if not can_set:
                c.exec_driver_sql(f"GRANT {READER_ROLE} TO CURRENT_USER"
                                  + (" WITH SET TRUE" if priv == "SET" else ""))
            c.exec_driver_sql(f"GRANT USAGE ON SCHEMA public TO {READER_ROLE}")
            missing = [r[0] for r in c.execute(text(
                "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = 'public' AND c.relkind IN ('r','v','m','p','f') "
                "AND NOT has_table_privilege(:r, c.oid, 'SELECT')"), {"r": READER_ROLE})]
            granted = 0
            for t in missing:
                if t in CREDENTIAL_TABLES:
                    continue
                c.exec_driver_sql(f'GRANT SELECT ON public."{t}" TO {READER_ROLE}')
                granted += 1
            for t in CREDENTIAL_TABLES:
                if c.execute(text("SELECT to_regclass(:t)"), {"t": f"public.{t}"}).scalar():
                    c.exec_driver_sql(f'REVOKE ALL ON public."{t}" FROM {READER_ROLE}')
        print(f"[startup] ops door: reader role ready ({granted} table(s) granted)")
    except Exception as exc:  # noqa: BLE001
        print(f"[startup] ops door: no reader role ({str(exc).splitlines()[0][:160]}) — "
              "SQL runs as the app's user in a READ ONLY transaction")
    reader_role(fresh=True)


def reader_role(fresh: bool = False) -> tuple[bool, Optional[str]]:
    """(the app's user may SET ROLE to the reader, why not). Kept a minute."""
    with _ROLE_LOCK:
        if not fresh and _ROLE["state"] is not None and time.monotonic() - _ROLE["at"] < 60:
            return _ROLE["state"], _ROLE["why"]
    ok, why = False, None
    try:
        from sqlalchemy import text
        from app.database import engine
        with engine.connect() as c:
            exists = c.execute(text("SELECT 1 FROM pg_roles WHERE rolname = :r"),
                               {"r": READER_ROLE}).first() is not None
            if exists:
                ok = bool(c.execute(text("SELECT pg_has_role(current_user, :r, :p)"),
                                    {"r": READER_ROLE, "p": _set_privilege(c)}).scalar())
            why = None if ok else ("no_role" if not exists else "cannot_set_role")
    except Exception as exc:  # noqa: BLE001
        why = f"check_failed: {str(exc).splitlines()[0][:80]}"
    with _ROLE_LOCK:
        _ROLE.update(state=ok, why=why, at=time.monotonic())
    return ok, why


def run_as_for(as_app: bool) -> str:
    """The role a NEW SQL card promises: the app's user when asked for, or when
    no reader role can be used; else the reader."""
    if as_app:
        return "app"
    return "reader" if reader_role(fresh=True)[0] else "app"


# ── running a query ───────────────────────────────────────────────────────────

_RUN_LOCK = threading.Lock()      # one answer at a time, per process — SQL and GET alike


def try_begin() -> bool:
    """Take the one answer slot, or say it is taken. Released by `end()`."""
    return _RUN_LOCK.acquire(blocking=False)


def end() -> None:
    try:
        _RUN_LOCK.release()
    except RuntimeError:
        pass


class _Pairs(list):
    """A JSON object as its (key, value) pairs — a row may name one column
    twice (`SELECT 1 AS x, 2 AS x`), which a dict would fold."""


def _objects(v: Any) -> Any:
    """Nested JSON objects back to dicts (only the ROW keeps its pairs)."""
    if isinstance(v, _Pairs):
        return {k: _objects(x) for k, x in v}
    if isinstance(v, list):
        return [_objects(x) for x in v]
    return v


def run_sql(sql: str, first: str, *, run_as: str) -> dict:
    """Run ONE approved statement as the role its card promised. Never raises:
    a database error, or a plan this door refuses, is the answer («error»)."""
    started = time.perf_counter()

    def failed(msg: str) -> dict:
        return {"ok": False, "error": msg[:500], "ms": int((time.perf_counter() - started) * 1000)}

    use_role = run_as == "reader"
    if use_role and not reader_role(fresh=True)[0]:
        return failed("the reader role the card promised is gone — nothing ran; ask again")
    target = plan_target(sql, first)
    raw = None
    columns: list[str] = []
    rows: list[list] = []
    truncated = None
    size = 2
    masked: set = set()
    try:
        raw = _reader_engine().raw_connection()
        conn = getattr(raw, "dbapi_connection", None) or raw.connection
        conn.autocommit = False
        cur = conn.cursor()
        cur.execute("SET TRANSACTION READ ONLY")
        cur.execute(f"SET LOCAL statement_timeout = {int(STATEMENT_TIMEOUT_MS)}")
        cur.execute(f"SET LOCAL lock_timeout = {int(LOCK_TIMEOUT_MS)}")
        cur.execute("SET LOCAL idle_in_transaction_session_timeout = 60000")
        cur.execute("SHOW server_version_num")
        if int(cur.fetchone()[0]) >= 140000:
            cur.execute("SET LOCAL client_connection_check_interval = '5s'")
        if use_role:
            cur.execute(f"SET LOCAL ROLE {READER_ROLE}")
        if target is not None:
            # The plan names every function and relation by what Postgres
            # RESOLVED, however the text spelt it. Planned, never executed.
            if plan_function_ready():
                cur.execute(f"SELECT public.{PLAN_FN}(%s, %s)", (target, PLAN_LINE_CAP))
                plan_text = cur.fetchone()[0]
                if plan_text is None:
                    conn.rollback()
                    return failed(f"the plan holds a value over {PLAN_LINE_CAP} characters "
                                  "(a constant that large is refused)")
            else:
                cur.execute(f"EXPLAIN (VERBOSE, COSTS OFF) {target}")
                plan_text = "\n".join(r[0] for r in cur.fetchall())
            why = plan_refusal(plan_text)
            if why:
                conn.rollback()
                return failed(why)
        named = first in ("select", "with", "values", "table")
        deadline = time.monotonic() + STATEMENT_TIMEOUT_MS / 1000
        if named:
            # Each row leaves the server as ONE JSON text cut to ROW_CHAR_CAP
            # characters, so no cell, however wide, reaches this worker whole.
            q = conn.cursor(name="ops_door_q")
            q.execute(f"SELECT left(row_to_json(ops_door_s)::text, {int(ROW_CHAR_CAP) + 1}) "
                      f"FROM ({sql}) ops_door_s")
        else:
            q = conn.cursor()
            q.execute(sql)
            columns = [d[0] for d in (q.description or [])]
        # Rows are pulled FETCH_BATCH at a time and the bounds apply as they
        # arrive. Every FETCH of a cursor is its own statement, so the 20 s
        # bound is re-set to what is LEFT of it before each one.
        has_rows = named or q.description is not None
        while has_rows and truncated is None:
            if named:
                left_ms = int((deadline - time.monotonic()) * 1000)
                if left_ms <= 0:
                    raise TimeoutError(f"the query ran longer than {STATEMENT_TIMEOUT_MS // 1000} s")
                cur.execute(f"SET LOCAL statement_timeout = {left_ms}")
            batch = q.fetchmany(FETCH_BATCH)
            if not batch:
                break
            for r in batch:
                if len(rows) >= MAX_ROWS:
                    truncated = "rows"
                    break
                if named:
                    raw_row = r[0] or "{}"
                    if len(raw_row) > ROW_CHAR_CAP:
                        truncated = "bytes"
                        break
                    pairs = json.loads(raw_row, object_pairs_hook=_Pairs)
                    if not columns:
                        columns = [k for k, _v in pairs]
                    cells = [_objects(v) for _k, v in pairs]
                else:
                    cells = list(r)
                vals = mask_rows(columns, [[plain(v) for v in cells]], masked)[0]
                n = len(json.dumps(vals, ensure_ascii=False).encode()) + 1
                if size + n > MAX_BYTES:
                    truncated = "bytes"
                    break
                rows.append(vals)
                size += n
        q.close()
        cur.close()
        conn.rollback()
    except Exception as exc:  # noqa: BLE001
        msg = str(getattr(exc, "pgerror", None) or exc).strip().splitlines()
        return failed(msg[0] if msg else exc.__class__.__name__)
    finally:
        if raw is not None:
            try:
                raw.invalidate()          # the backend is closed, not pooled
            except Exception:  # noqa: BLE001
                try:
                    raw.close()
                except Exception:  # noqa: BLE001
                    pass
    return {"ok": True, "columns": columns, "rows": rows, "row_count": len(rows),
            "truncated": truncated, "masked": sorted(masked),
            "role": READER_ROLE if use_role else "app",
            "ms": int((time.perf_counter() - started) * 1000)}


def _shape_get(status: int, ctype: str, content: bytes, text_: Optional[str]) -> dict:
    """The answer of an in-process GET, masked and cut — CPU work, so the
    caller runs it on the threadpool, never on the event loop."""
    out: dict = {"ok": True, "status": status, "content_type": ctype.split(";")[0],
                 "bytes": len(content), "truncated": None, "masked": []}
    masked: set = set()
    if "json" in ctype:
        try:
            data = mask_json(json.loads(content or b"null"), masked)
        except ValueError:
            data = None
        if data is not None:
            from app.services.assistant_api import shrink
            data, cut = shrink(data, MAX_BYTES // 2)
            out["json"] = data
            out["truncated"] = "bytes" if cut else None
    if "json" not in out:
        if ctype.startswith("text/") or "html" in ctype or "xml" in ctype:
            t = (text_ or "")[:65_536]
            out["text"] = MASK if secret_value(t) else t
            out["truncated"] = "bytes" if len(text_ or "") > 65_536 else None
        else:
            out["text"] = None           # a file: its type and size only
    out["masked"] = sorted(masked)
    return out


async def run_get(path: str, params: dict, *, approver_tg: int, approver_name: str,
                  token: str) -> dict:
    """GET an endpoint of THIS process as the approver (an admin), through the
    whole middleware stack, so every rule of the endpoint applies. Bounded by
    GET_TIMEOUT_S itself — httpx's own timeout never applies to an ASGI app."""
    import asyncio

    import httpx
    import jwt
    from fastapi.concurrency import run_in_threadpool
    from app.main import app
    from app.security import INTERNAL_HEADER, INTERNAL_MARK
    started = time.perf_counter()
    claims = {"sub": str(approver_tg), "role": "admin", "full_name": approver_name,
              "role_id": None, "role_ref": None, "ops": token,
              "exp": datetime.utcnow() + timedelta(minutes=2)}
    bearer = jwt.encode(claims, settings.secret_key, algorithm=settings.algorithm)
    headers = {"Authorization": f"Bearer {bearer}", INTERNAL_HEADER: INTERNAL_MARK,
               "User-Agent": "safia-ops-door", "Accept": "application/json"}
    try:
        transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx.AsyncClient(transport=transport, base_url="http://ims.internal") as client:
            res = await asyncio.wait_for(client.get(path, params=params or None, headers=headers),
                                         GET_TIMEOUT_S)
    except asyncio.TimeoutError:
        return {"ok": False, "error": f"the endpoint took longer than {int(GET_TIMEOUT_S)} s",
                "ms": int((time.perf_counter() - started) * 1000)}
    except Exception as exc:  # noqa: BLE001
        return {"ok": False, "error": f"{exc.__class__.__name__}: {exc}"[:500],
                "ms": int((time.perf_counter() - started) * 1000)}
    ctype = (res.headers.get("content-type") or "").lower()
    is_text = ctype.startswith("text/") or "html" in ctype or "xml" in ctype
    out = await run_in_threadpool(_shape_get, res.status_code, ctype, res.content,
                                  res.text if is_text else None)
    out["ms"] = int((time.perf_counter() - started) * 1000)
    return out


# ── the card ──────────────────────────────────────────────────────────────────

_T = {
    "uz": {
        "title": "🔐 Production'dan ma'lumot so'rovi",
        "who": "Kim so'rayapti", "why": "Nima uchun", "kind": "Turi",
        "sql_reader": "SQL · faqat o'qish · rol {role}",
        "sql_app": "SQL · faqat o'qish · ilova foydalanuvchisi (rol yo'q)",
        "sql_app_asked": "SQL · faqat o'qish · ilova foydalanuvchisi (so'ralgan)",
        "get": "GET · admin sifatida ({name})",
        "tables": "Jadvallar", "until": "Javob kutiladi", "until_v": "{t} gacha (15 daqiqa)",
        "once": "Natija bir marta beriladi va hech qayerda saqlanmaydi.",
        "allow": "✅ Ruxsat berish", "deny": "✖️ Rad etish", "close": "🔒 Rad etish va eshikni yopish",
        "st_approved": "✅ Ruxsat berildi · {t} — natija {u} gacha olinishi kerak",
        "st_denied": "✖️ Rad etildi · {t}",
        "st_closed": "🔒 Rad etildi va eshik yopildi · {t}",
        "st_expired": "⏱ Muddati o'tdi · {t}",
        "st_running": "⏳ Natija olinmoqda…",
        "st_done": "📥 Natija olindi · {t} · {rows} · {kb} KB · {ms} ms",
        "st_done_cut": " · qisqartirildi ({why})",
        "st_failed": "⚠️ Bajarilmadi · {t}: {err}",
        "rows": "{n} qator", "http": "HTTP {n}",
        "b_approved": "✅ Ruxsat berildi", "b_denied": "✖️ Rad etildi",
        "b_closed": "🔒 Eshik yopildi", "b_expired": "⏱ Muddati o'tdi",
        "b_running": "⏳ Olinmoqda", "b_done": "📥 Olindi", "b_failed": "⚠️ Bajarilmadi",
        "a_not_you": "Bu so'rov boshqa odamga yuborilgan.",
        "a_gone": "So'rov topilmadi.",
        "a_already": "Bu so'rovga allaqachon javob berilgan.",
        "a_expired": "So'rov muddati o'tib ketgan.",
        "a_allowed": "Ruxsat berildi. Natija bir marta olinadi.",
        "a_denied": "Rad etildi.",
        "a_closed": "Rad etildi. Eshik yopildi — /opsdoor bilan ochasiz.",
        "door_on": "🔓 Hisobot eshigi OCHIQ. So'rovlar sizga yoki Abbosga karta bo'lib keladi.",
        "door_off": "🔒 Hisobot eshigi YOPIQ. Hech qanday so'rov qabul qilinmaydi.",
        "door_btn_close": "🔒 Eshikni yopish", "door_btn_open": "🔓 Eshikni ochish",
        "door_only": "Bu buyruq faqat Burkhon va Abbos uchun.",
    },
    "uz_cyrl": {
        "title": "🔐 Production'дан маълумот сўрови",
        "who": "Ким сўраяпти", "why": "Нима учун", "kind": "Тури",
        "sql_reader": "SQL · фақат ўқиш · рол {role}",
        "sql_app": "SQL · фақат ўқиш · илова фойдаланувчиси (рол йўқ)",
        "sql_app_asked": "SQL · фақат ўқиш · илова фойдаланувчиси (сўралган)",
        "get": "GET · админ сифатида ({name})",
        "tables": "Жадваллар", "until": "Жавоб кутилади", "until_v": "{t} гача (15 дақиқа)",
        "once": "Натижа бир марта берилади ва ҳеч қаерда сақланмайди.",
        "allow": "✅ Рухсат бериш", "deny": "✖️ Рад этиш", "close": "🔒 Рад этиш ва эшикни ёпиш",
        "st_approved": "✅ Рухсат берилди · {t} — натижа {u} гача олиниши керак",
        "st_denied": "✖️ Рад этилди · {t}",
        "st_closed": "🔒 Рад этилди ва эшик ёпилди · {t}",
        "st_expired": "⏱ Муддати ўтди · {t}",
        "st_running": "⏳ Натижа олинмоқда…",
        "st_done": "📥 Натижа олинди · {t} · {rows} · {kb} KB · {ms} ms",
        "st_done_cut": " · қисқартирилди ({why})",
        "st_failed": "⚠️ Бажарилмади · {t}: {err}",
        "rows": "{n} қатор", "http": "HTTP {n}",
        "b_approved": "✅ Рухсат берилди", "b_denied": "✖️ Рад этилди",
        "b_closed": "🔒 Эшик ёпилди", "b_expired": "⏱ Муддати ўтди",
        "b_running": "⏳ Олинмоқда", "b_done": "📥 Олинди", "b_failed": "⚠️ Бажарилмади",
        "a_not_you": "Бу сўров бошқа одамга юборилган.",
        "a_gone": "Сўров топилмади.",
        "a_already": "Бу сўровга аллақачон жавоб берилган.",
        "a_expired": "Сўров муддати ўтиб кетган.",
        "a_allowed": "Рухсат берилди. Натижа бир марта олинади.",
        "a_denied": "Рад этилди.",
        "a_closed": "Рад этилди. Эшик ёпилди — /opsdoor билан очасиз.",
        "door_on": "🔓 Ҳисобот эшиги ОЧИҚ. Сўровлар сизга ёки Аббосга карта бўлиб келади.",
        "door_off": "🔒 Ҳисобот эшиги ЁПИҚ. Ҳеч қандай сўров қабул қилинмайди.",
        "door_btn_close": "🔒 Эшикни ёпиш", "door_btn_open": "🔓 Эшикни очиш",
        "door_only": "Бу буйруқ фақат Burkhon ва Abbos учун.",
    },
    "ru": {
        "title": "🔐 Запрос данных из production",
        "who": "Кто спрашивает", "why": "Зачем", "kind": "Тип",
        "sql_reader": "SQL · только чтение · роль {role}",
        "sql_app": "SQL · только чтение · пользователь приложения (роли нет)",
        "sql_app_asked": "SQL · только чтение · пользователь приложения (по запросу)",
        "get": "GET · от имени админа ({name})",
        "tables": "Таблицы", "until": "Ответ ждут", "until_v": "до {t} (15 минут)",
        "once": "Результат отдаётся один раз и нигде не хранится.",
        "allow": "✅ Разрешить", "deny": "✖️ Отклонить", "close": "🔒 Отклонить и закрыть дверь",
        "st_approved": "✅ Разрешено · {t} — результат нужно забрать до {u}",
        "st_denied": "✖️ Отклонено · {t}",
        "st_closed": "🔒 Отклонено, дверь закрыта · {t}",
        "st_expired": "⏱ Срок истёк · {t}",
        "st_running": "⏳ Результат забирают…",
        "st_done": "📥 Результат забран · {t} · {rows} · {kb} KB · {ms} ms",
        "st_done_cut": " · сокращено ({why})",
        "st_failed": "⚠️ Не выполнено · {t}: {err}",
        "rows": "{n} строк", "http": "HTTP {n}",
        "b_approved": "✅ Разрешено", "b_denied": "✖️ Отклонено",
        "b_closed": "🔒 Дверь закрыта", "b_expired": "⏱ Срок истёк",
        "b_running": "⏳ Забирают", "b_done": "📥 Забран", "b_failed": "⚠️ Не выполнено",
        "a_not_you": "Этот запрос отправлен другому человеку.",
        "a_gone": "Запрос не найден.",
        "a_already": "На этот запрос уже ответили.",
        "a_expired": "Срок запроса истёк.",
        "a_allowed": "Разрешено. Результат заберут один раз.",
        "a_denied": "Отклонено.",
        "a_closed": "Отклонено. Дверь закрыта — откроете командой /opsdoor.",
        "door_on": "🔓 Дверь отчётов ОТКРЫТА. Запросы приходят вам или Аббосу карточкой.",
        "door_off": "🔒 Дверь отчётов ЗАКРЫТА. Запросы не принимаются.",
        "door_btn_close": "🔒 Закрыть дверь", "door_btn_open": "🔓 Открыть дверь",
        "door_only": "Эта команда только для Burkhon и Abbos.",
    },
    "en": {
        "title": "🔐 A request for production data",
        "who": "Who asks", "why": "Why", "kind": "Kind",
        "sql_reader": "SQL · read only · role {role}",
        "sql_app": "SQL · read only · the app's user (no reader role)",
        "sql_app_asked": "SQL · read only · the app's user (asked for)",
        "get": "GET · as an admin ({name})",
        "tables": "Tables", "until": "Answer awaited", "until_v": "until {t} (15 minutes)",
        "once": "The result is handed over once and stored nowhere.",
        "allow": "✅ Allow", "deny": "✖️ Deny", "close": "🔒 Deny and close the door",
        "st_approved": "✅ Allowed · {t} — must be taken by {u}",
        "st_denied": "✖️ Denied · {t}",
        "st_closed": "🔒 Denied and the door closed · {t}",
        "st_expired": "⏱ Expired · {t}",
        "st_running": "⏳ Being taken…",
        "st_done": "📥 Taken · {t} · {rows} · {kb} KB · {ms} ms",
        "st_done_cut": " · cut ({why})",
        "st_failed": "⚠️ Failed · {t}: {err}",
        "rows": "{n} rows", "http": "HTTP {n}",
        "b_approved": "✅ Allowed", "b_denied": "✖️ Denied",
        "b_closed": "🔒 Door closed", "b_expired": "⏱ Expired",
        "b_running": "⏳ Being taken", "b_done": "📥 Taken", "b_failed": "⚠️ Failed",
        "a_not_you": "This request was sent to somebody else.",
        "a_gone": "Request not found.",
        "a_already": "This request has already been answered.",
        "a_expired": "This request has expired.",
        "a_allowed": "Allowed. The result can be taken once.",
        "a_denied": "Denied.",
        "a_closed": "Denied. The door is closed — open it with /opsdoor.",
        "door_on": "🔓 The report door is OPEN. Requests reach you or Abbos as cards.",
        "door_off": "🔒 The report door is CLOSED. No request is accepted.",
        "door_btn_close": "🔒 Close the door", "door_btn_open": "🔓 Open the door",
        "door_only": "This command is for Burkhon and Abbos only.",
    },
}


def tr(lang: str, key: str) -> str:
    return (_T.get(lang) or _T["uz"]).get(key) or _T["uz"][key]


def _e(s: Any) -> str:
    return html.escape(str(s if s is not None else ""), quote=False)


def shown_question(ask) -> str:
    if ask.verb == "get":
        params = ask.params or {}
        q = "&".join(f"{k}={v}" for k, v in params.items())
        return f"GET {ask.query}" + (f"?{q}" if q else "")
    return ask.query


def card_text(ask, lang: str) -> str:
    lines = [f"<b>{_e(tr(lang, 'title'))}</b>", ""]
    lines.append(f"{_e(tr(lang, 'who'))}: <b>{_e(ask.asker or '—')}</b>")
    if ask.why:
        lines.append(f"{_e(tr(lang, 'why'))}: {_e(ask.why)}")
    if ask.verb == "get":
        kind = tr(lang, "get").format(name=ask.approver_name or ask.approver_tg)
    elif ask.run_as == "reader":
        kind = tr(lang, "sql_reader").format(role=READER_ROLE)
    elif ask.as_app:
        kind = tr(lang, "sql_app_asked")
    else:
        kind = tr(lang, "sql_app")
    lines.append(f"{_e(tr(lang, 'kind'))}: {_e(kind)}")
    if ask.verb == "sql":
        tabs = tables_of(ask.query)
        if tabs:
            lines.append(f"{_e(tr(lang, 'tables'))}: <code>{_e(', '.join(tabs))}</code>")
    lines.append(f"{_e(tr(lang, 'until'))}: {_e(tr(lang, 'until_v').format(t=_hhmm(ask.expires_at)))}")
    lines += ["", f"<pre>{_e(shown_question(ask))}</pre>", "", f"<i>{_e(tr(lang, 'once'))}</i>"]
    return "\n".join(lines)


def outcome_line(ask, lang: str) -> Optional[str]:
    st = ask.status
    if st == "pending":
        return None
    if st == "approved":
        return tr(lang, "st_approved").format(t=_hhmm(ask.decided_at), u=_hhmm(ask.expires_at))
    if st == "denied":
        key = "st_closed" if (ask.error or "") == "door_closed" else "st_denied"
        return tr(lang, key).format(t=_hhmm(ask.decided_at))
    if st == "expired":
        return tr(lang, "st_expired").format(t=_hhmm(ask.expires_at))
    if st == "running":
        return tr(lang, "st_running")
    if st == "done":
        rows = (tr(lang, "http").format(n=ask.result_rows) if ask.verb == "get"
                else tr(lang, "rows").format(n=ask.result_rows or 0))
        kb = f"{(ask.result_bytes or 0) / 1024:.1f}".rstrip("0").rstrip(".")
        s = tr(lang, "st_done").format(t=_hhmm(ask.done_at), rows=rows, kb=kb,
                                       ms=ask.result_ms or 0)
        if ask.truncated:
            s += tr(lang, "st_done_cut").format(why=ask.truncated)
        return s
    if st == "failed":
        return tr(lang, "st_failed").format(t=_hhmm(ask.done_at), err=_short(ask.error, 150))
    return st


def card_markup(ask, lang: str):
    from telebot import types
    from app import tg_buttons
    kb = types.InlineKeyboardMarkup()
    if ask.status == "pending":
        kb.row(tg_buttons.approve(tr(lang, "allow"), f"oq:a:{ask.token}"),
               tg_buttons.reject(tr(lang, "deny"), f"oq:d:{ask.token}"))
        kb.row(tg_buttons.Button(tr(lang, "close"), callback_data=f"oq:x:{ask.token}"))
        return kb
    label = {
        "approved": "b_approved", "expired": "b_expired", "running": "b_running",
        "done": "b_done", "failed": "b_failed",
        "denied": "b_closed" if (ask.error or "") == "door_closed" else "b_denied",
    }.get(ask.status, "b_expired")
    who = ask.approver_name if ask.status in ("approved", "denied") else None
    kb.row(tg_buttons.disabled(tg_buttons.outcome_label(tr(lang, label), who, lang)))
    return kb


def _short(v: Any, cap: int) -> str:
    v = " ".join(str(v or "").split())
    return v if len(v) <= cap else v[:cap - 1] + "…"


def full_card(ask, lang: str) -> str:
    text = card_text(ask, lang)
    line = outcome_line(ask, lang)
    return text + (f"\n\n<b>{_e(line)}</b>" if line else "")


def visible_len(html_text: str) -> int:
    """A message's length as Telegram counts it: tags gone, entities decoded,
    in UTF-16 code units."""
    plain_ = html.unescape(re.sub(r"<[^>]+>", "", html_text or ""))
    return len(plain_.encode("utf-16-le")) // 2


def card_fits(ask) -> bool:
    """True when the card fits Telegram in its LONGEST state (a failure
    printed under it), in every language — or no edit could ever redraw it."""
    from types import SimpleNamespace
    worst = SimpleNamespace(**{c: getattr(ask, c, None) for c in (
        "verb", "query", "params", "why", "asker", "as_app", "run_as", "approver_tg",
        "approver_name", "expires_at", "decided_at", "done_at", "truncated",
        "result_rows", "result_bytes", "result_ms")})
    worst.status, worst.error, worst.done_at = "failed", "x" * 150, worst.done_at or _now()
    return all(visible_len(full_card(worst, lang)) <= CARD_BUDGET for lang in _T)


def send_card(db, ask) -> bool:
    """Put the question in front of its approver. True when Telegram took it."""
    from app import tg_buttons
    from app.telegram_bot import bot
    lang = lang_of(db, ask.approver_tg)
    try:
        msg = tg_buttons.send(bot.send_message, ask.approver_tg, full_card(ask, lang),
                              parse_mode="HTML", reply_markup=card_markup(ask, lang))
    except Exception:  # noqa: BLE001
        log.exception("ops door: could not send the card for %s", ask.token)
        return False
    ask.chat_id = msg.chat.id
    ask.message_id = msg.message_id
    return True


def refresh_card(ask_id: int) -> None:
    """Redraw a card with its outcome. Never raises; a card that cannot be
    edited (deleted, too old) costs only the picture."""
    from app import tg_buttons
    from app.database import SessionLocal
    from app.models import OpsAsk
    try:
        from app.telegram_bot import bot
        with SessionLocal() as db:
            ask = db.query(OpsAsk).filter_by(id=ask_id).first()
            if not ask or not ask.chat_id or not ask.message_id:
                return
            lang = lang_of(db, ask.approver_tg)
            tg_buttons.send(bot.edit_message_text, full_card(ask, lang),
                            chat_id=ask.chat_id, message_id=ask.message_id,
                            parse_mode="HTML", reply_markup=card_markup(ask, lang))
    except Exception as exc:  # noqa: BLE001
        if "not modified" not in str(exc).lower():
            log.warning("ops door: could not redraw card %s: %s", ask_id, exc)


# ── state ─────────────────────────────────────────────────────────────────────

def expire_due(ask) -> bool:
    """Mark an open ask expired once its time is gone. True when it changed."""
    if ask.status in OPEN_STATES and ask.expires_at is not None:
        exp = ask.expires_at if ask.expires_at.tzinfo else ask.expires_at.replace(tzinfo=timezone.utc)
        if exp <= _now():
            ask.status = "expired"
            return True
    return False


def new_token() -> str:
    return secrets.token_urlsafe(12)


def status_payload(ask) -> dict:
    def iso(d):
        d = _local(d)
        return d.isoformat(timespec="seconds") if d else None
    return {
        "token": ask.token, "status": ask.status, "verb": ask.verb,
        "question": shown_question(ask), "approver": ask.approver_name,
        "created_at": iso(ask.created_at), "expires_at": iso(ask.expires_at),
        "decided_at": iso(ask.decided_at), "taken_at": iso(ask.taken_at),
        "rows": ask.result_rows, "bytes": ask.result_bytes, "ms": ask.result_ms,
        "truncated": ask.truncated,
        "error": ask.error if ask.status == "failed" else None,
        "card_sent": bool(ask.message_id),
    }


def sweep_expired() -> None:
    """Every minute: expire what nobody answered or took, and redraw those
    cards, so a chat never holds live buttons on a dead question."""
    from app.database import SessionLocal
    from app.models import OpsAsk
    from app.services import action_log
    changed: list[tuple[int, str, str]] = []
    try:
        with SessionLocal() as db:
            now = _now()
            rows = (db.query(OpsAsk).filter(OpsAsk.status.in_(OPEN_STATES),
                                            OpsAsk.expires_at <= now)
                    .with_for_update(skip_locked=True).all())
            for ask in rows:
                was = ask.status
                ask.status = "expired"
                changed.append((ask.id, ask.token, was))
            # A take whose worker died (a swap past its grace, an OOM) never
            # finished: it is failed, never run again — the asker asks anew.
            stuck = (db.query(OpsAsk).filter(OpsAsk.status == "running",
                                             OpsAsk.taken_at <= now - RUNNING_STALE)
                     .with_for_update(skip_locked=True).all())
            for ask in stuck:
                ask.status = "failed"
                ask.done_at = now
                ask.error = "interrupted — the take never finished; ask again"
                changed.append((ask.id, ask.token, "running"))
            if changed:
                db.commit()
    except Exception:  # noqa: BLE001
        log.exception("ops door: expiry sweep failed")
        return
    for ask_id, token, was in changed:
        action_log.record_system("sync_export", "ops.interrupted" if was == "running"
                                 else "ops.expired", target_kind="ops_ask",
                                 target_id=token, details=[("ops_was", was)])
        refresh_card(ask_id)


def register_jobs() -> None:
    """The expiry sweep. Mirrored in passenger_wsgi.py."""
    try:
        from app.scheduler import schedule_interval
        schedule_interval("ops-door-expire", sweep_expired, minutes=1)
    except Exception:  # noqa: BLE001
        log.exception("ops door: could not register the sweep")


# ── the taps (telegram_bot «oq:» and /opsdoor) ────────────────────────────────

def decide(token: str, tg_id: int, action: str) -> tuple[str, Optional[int]]:
    """An approver's tap: «a» allow · «d» deny · «x» deny and close the door.
    Returns (the alert text, the row id whose card to redraw). Checked against
    the ROW's approver, never the chat: callback data is typeable and a
    message can be forwarded."""
    from app.database import SessionLocal
    from app.models import OpsAsk
    from app.services import action_log
    with SessionLocal() as db:
        lang = lang_of(db, tg_id)
        ask = db.query(OpsAsk).filter_by(token=token).with_for_update().first()
        if ask is None:
            return tr(lang, "a_gone"), None
        if int(ask.approver_tg) != int(tg_id):
            return tr(lang, "a_not_you"), None
        if expire_due(ask):
            db.commit()
            action_log.record_system("sync_export", "ops.expired", db,
                                     target_kind="ops_ask", target_id=ask.token)
            return tr(lang, "a_expired"), ask.id
        if ask.status != "pending":
            return tr(lang, "a_already"), ask.id
        now = _now()
        ask.decided_at = now
        if action == "a":
            ask.status = "approved"
            ask.expires_at = now + TAKE_TTL
            act, alert = "ops.allowed", tr(lang, "a_allowed")
        elif action == "x":
            ask.status = "denied"
            ask.error = "door_closed"
            set_door(db, False)
            act, alert = "ops.denied", tr(lang, "a_closed")
        else:
            ask.status = "denied"
            act, alert = "ops.denied", tr(lang, "a_denied")
        db.commit()
        details = [("ops_verb", ask.verb), ("ops_question", shown_question(ask)[:1500]),
                   ("ops_asker", ask.asker)]
        action_log.record_bot(db, tg_id, "sync_export", act, actor_name=ask.approver_name,
                              target_kind="ops_ask", target_id=ask.token,
                              target_name=ask.asker, details=details)
        if action == "x":
            action_log.record_bot(db, tg_id, "sync_export", "ops.door_closed",
                                  actor_name=ask.approver_name)
        return alert, ask.id


def door_view(db, tg_id: int):
    """(text, keyboard) of the /opsdoor screen for one of the two approvers."""
    from telebot import types
    from app import tg_buttons
    lang = lang_of(db, tg_id)
    open_ = door_open(db)
    kb = types.InlineKeyboardMarkup()
    kb.row(tg_buttons.Button(tr(lang, "door_btn_close" if open_ else "door_btn_open"),
                             callback_data="oq:door:off" if open_ else "oq:door:on"))
    return tr(lang, "door_on" if open_ else "door_off"), kb


def switch_door(tg_id: int, open_: bool) -> None:
    from app.database import SessionLocal
    from app.services import action_log
    with SessionLocal() as db:
        was = door_open(db)
        if was != open_:
            set_door(db, open_)
            db.commit()
            action_log.record_bot(db, tg_id, "sync_export",
                                  "ops.door_opened" if open_ else "ops.door_closed",
                                  actor_name=person_name(db, tg_id))
