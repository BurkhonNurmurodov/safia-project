"""Central logging configuration.

Every module here logs through `logging.getLogger(__name__)`, but nothing ever
configured the root logger: records fell through to logging's "handler of last
resort", which prints a bare message to stderr — and under Passenger stderr
goes wherever the shared host happens to redirect it. The ERROR raised by
`telegram_bot._BotExceptionHandler` (the ONLY trace a crashed bot handler
leaves) was effectively unfindable, which is what made the stale-Postgres-
connection incident so hard to diagnose.

`setup_logging()` attaches a rotating file handler (backend/logs/app.log,
5 MB x 3) plus stderr to the root logger, at `LOG_LEVEL` (default INFO).

Call it as early as possible from BOTH entry points — `passenger_wsgi.py`
(prod boots through the WSGI bridge, so the FastAPI lifespan never runs) and
`app/main.py` — the same way the startup migrations are mirrored in both.
It is idempotent, so the second call is a no-op.

Note: Passenger may run several worker processes against one file. Rotation is
not locked across processes, so a rotation can interleave; with 5 MB files that
is rare and costs at most a few lines. Fixing it properly would mean a new
dependency (concurrent-log-handler) — not worth it for this volume.
"""

import logging
import os
import sys
from logging.handlers import RotatingFileHandler

# backend/  (this file is backend/app/logging_setup.py)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_LOG_DIR = os.path.join(BASE_DIR, "logs")

LOG_FORMAT = "%(asctime)s %(levelname)-8s %(name)s: %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"

MAX_BYTES = 5 * 1024 * 1024  # 5 MB
BACKUP_COUNT = 3             # app.log + app.log.1..3 → 20 MB ceiling

# Libraries that turn a LOG_LEVEL=DEBUG session (i.e. exactly when someone is
# chasing an incident) into unreadable noise. Floored at INFO so the app's own
# DEBUG lines stay legible.
NOISY_LOGGERS = ("urllib3", "requests", "httpx", "httpcore", "asyncio",
                 "multipart", "PIL", "sqlalchemy.engine")

_configured = False


def _env(name, default=None):
    """Read a setting from os.environ, falling back to backend/.env.

    Config on this host lives in backend/.env, which pydantic-settings loads
    straight into `config.Settings` without ever populating os.environ — so a
    LOG_LEVEL written there would be invisible to a plain os.environ lookup.
    Parsed by hand because this runs before pydantic (or anything else) is
    imported.
    """
    if name in os.environ:
        return os.environ[name]
    try:
        with open(os.path.join(BASE_DIR, ".env"), "r", encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                if key.strip() == name:
                    return value.strip().strip("'\"")
    except OSError:
        pass
    return default


def _resolve_level(raw):
    """LOG_LEVEL → (level int, invalid name or None)."""
    name = (raw or "INFO").strip().upper()
    if name.isdigit():
        return int(name), None
    level = getattr(logging, name, None)
    if isinstance(level, int):
        return level, None
    return logging.INFO, name


def setup_logging(force: bool = False) -> None:
    """Configure root logging. Idempotent; never raises.

    Logging must not be the reason the site fails to boot, so every failure
    mode degrades instead: an unwritable log directory falls back to stderr
    only, and an unexpected error leaves Python's default behaviour in place.
    """
    global _configured
    if _configured and not force:
        return

    try:
        level, bad_level = _resolve_level(_env("LOG_LEVEL"))
        formatter = logging.Formatter(LOG_FORMAT, datefmt=DATE_FORMAT)

        root = logging.getLogger()
        root.setLevel(level)

        # Only ever drop handlers we installed ourselves — uvicorn/gunicorn may
        # have attached their own and they are not ours to remove.
        for handler in list(root.handlers):
            if getattr(handler, "_safia_handler", False):
                root.removeHandler(handler)
                handler.close()

        stderr_handler = logging.StreamHandler(sys.stderr)
        stderr_handler.setFormatter(formatter)
        stderr_handler._safia_handler = True
        root.addHandler(stderr_handler)

        log_dir = _env("LOG_DIR", DEFAULT_LOG_DIR)
        log_path = os.path.join(log_dir, "app.log")
        file_error = None
        try:
            os.makedirs(log_dir, exist_ok=True)
            file_handler = RotatingFileHandler(
                log_path,
                maxBytes=MAX_BYTES,
                backupCount=BACKUP_COUNT,
                encoding="utf-8",
            )
            file_handler.setFormatter(formatter)
            file_handler._safia_handler = True
            root.addHandler(file_handler)
        except OSError as exc:
            # Read-only home, blown disk quota, bad LOG_DIR — carry on with
            # stderr and make the degradation visible on the first line.
            file_error = exc

        if level < logging.INFO:
            for name in NOISY_LOGGERS:
                logging.getLogger(name).setLevel(logging.INFO)

        _configured = True

        logger = logging.getLogger("app.logging")
        if bad_level:
            logger.warning("Unknown LOG_LEVEL %r — using INFO", bad_level)
        if file_error:
            logger.warning(
                "File logging disabled (%s: %s) — stderr only",
                type(file_error).__name__, file_error,
            )
        else:
            logger.info(
                "Logging to %s at %s (%d MB x %d)",
                log_path, logging.getLevelName(level),
                MAX_BYTES // (1024 * 1024), BACKUP_COUNT,
            )
    except Exception as exc:  # noqa: BLE001 — logging must never break boot
        print(f"Logging setup failed, using Python defaults: {exc}",
              file=sys.stderr, flush=True)
