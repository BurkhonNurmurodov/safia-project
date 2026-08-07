"""Server-side file-upload validation.

Client-side ``accept=`` attributes are a UX convenience only — they are trivial
to bypass (curl, a crafted multipart request). So every upload endpoint must
re-check, on the server, that the file is one of the types that endpoint
actually needs. These helpers enforce an extension whitelist AND, where the
format has a reliable signature, a magic-byte check so a renamed file
(``virus.exe`` → ``report.xlsx``) is still rejected.
"""
import os
import re

from fastapi import HTTPException, UploadFile

# OOXML/zip container signatures. .xlsx and .xlsb are both ZIP packages, so they
# start with a local-file-header ("PK\x03\x04"); the other two cover an empty or
# spanned archive and are included for completeness.
_ZIP_MAGIC = (b"PK\x03\x04", b"PK\x05\x06", b"PK\x07\x08")

# Spreadsheet uploads (verifix attendance, production фаза/заголовок, catalog).
SPREADSHEET_EXTS = frozenset({".xlsx", ".xlsb"})

# Broadcast attachments are forwarded straight to Telegram (never executed or
# persisted server-side), so this is a broad media/document whitelist whose only
# job is to keep executables and scripts out.
BROADCAST_EXTS = frozenset({
    # images
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".heic", ".heif", ".svg",
    # video
    ".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".3gp",
    # audio
    ".mp3", ".ogg", ".oga", ".wav", ".m4a", ".aac", ".flac", ".opus",
    # documents / archives
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".csv", ".rtf", ".zip", ".rar", ".7z",
})


# Database-restore uploads. Only ever a dump this platform produced itself —
# see validate_db_dump for why the extension check is the weaker of the two
# guards here.
DUMP_EXTS = frozenset({".gz", ".sql"})

# An oversized dump is DM'd as safia_db_….sql.gz.part001, .part002, … because
# Telegram caps a document at 50 MB. Rejoining them needs a shell, which is the
# whole thing the restore button exists to avoid — so the parts are accepted as
# uploads and concatenated server-side instead.
_PART_RE = re.compile(r"\.part\d+$", re.IGNORECASE)

_GZIP_MAGIC = (b"\x1f\x8b",)


def _ext(filename: str | None) -> str:
    return os.path.splitext(filename or "")[1].lower()


def check_extension(filename: str | None, allowed_exts) -> str:
    """Raise 400 unless the filename ends in one of ``allowed_exts``. Returns the
    lowercased extension."""
    ext = _ext(filename)
    if ext not in allowed_exts:
        allowed = ", ".join(sorted(allowed_exts))
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext or filename or 'unknown'}'. Allowed: {allowed}",
        )
    return ext


def check_magic(content: bytes, magic_prefixes) -> None:
    """Raise 400 unless ``content`` starts with one of ``magic_prefixes``."""
    if not any(content.startswith(sig) for sig in magic_prefixes):
        raise HTTPException(
            status_code=400,
            detail="File contents do not match its extension (corrupt or misnamed file).",
        )


def validate_spreadsheet(file: UploadFile, content: bytes) -> None:
    """Enforce that an uploaded workbook is really an .xlsx/.xlsb (extension +
    ZIP/OOXML signature). Call after reading the bytes."""
    check_extension(file.filename, SPREADSHEET_EXTS)
    check_magic(content, _ZIP_MAGIC)


def check_dump_name(filename: str | None) -> None:
    """Raise 400 unless the name is a .sql / .sql.gz dump or one of its parts."""
    if _PART_RE.search(filename or ""):
        return
    check_extension(filename, DUMP_EXTS)


def validate_db_dump(filename: str | None, head: bytes) -> bool:
    """Enforce that an uploaded database dump is a .sql / .sql.gz (or a numbered
    part of one) and that its leading bytes agree. ``head`` must come from the
    FIRST part. Returns True when the payload is gzip-compressed.

    The extension whitelist matters far less here than the header marker the
    restore path checks afterwards: this file gets EXECUTED against the live
    database, so "looks like SQL" is nowhere near a sufficient guard. The real
    gate is that the script must carry this platform's own dump signature, which
    keeps the endpoint from degrading into a general-purpose SQL console.
    """
    check_dump_name(filename)
    gzipped = head.startswith(_GZIP_MAGIC[0])
    name = (filename or "").lower()
    stem = _PART_RE.sub("", name)
    if stem.endswith(".gz") and not gzipped:
        raise HTTPException(
            status_code=400,
            detail="File is named .gz but is not gzip-compressed.",
        )
    if stem.endswith(".sql") and gzipped:
        raise HTTPException(
            status_code=400,
            detail="File is gzip-compressed — rename it to .sql.gz.",
        )
    return gzipped


def validate_broadcast_media(file: UploadFile) -> None:
    """Enforce the broadcast attachment whitelist by extension. (Content is
    forwarded to Telegram, not run locally, so an extension whitelist that blocks
    executables/scripts is sufficient.)"""
    check_extension(file.filename, BROADCAST_EXTS)
