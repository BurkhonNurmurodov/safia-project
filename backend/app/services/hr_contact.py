"""Where a JOB SEEKER is sent: the HR contact an admin sets on the Users tab
(docs/registration.md «Job seekers go to HR»). People who want to work at
Safia find this bot by searching «Safia» and file guest requests; every
surface they can reach (the bot's description, the welcome after /start,
/login, a closed guest request) names this contact instead.

Stored as ONE app_settings row. Three shapes are accepted: a Telegram
@username, an https link, a phone number. Only the first two become buttons
— Telegram buttons cannot open a phone number."""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from app.models import AppSetting

KEY = "hr_contact"

_USER = re.compile(r"^@?([A-Za-z][A-Za-z0-9_]{3,31})$")
_TME = re.compile(r"^(?:https?://)?(?:t|telegram)\.me/([A-Za-z0-9_+/=-]{2,64})/?$", re.I)
_URL = re.compile(r"^https://[^\s<>\"']{3,300}$", re.I)
_PHONE = re.compile(r"^\+?[0-9][0-9 ()-]{6,19}$")


def normalize(raw) -> str:
    """The stored form of what an admin typed; "" clears it. Raises ValueError
    for anything that is none of the three shapes — it ends up on a page
    strangers open, so a free-form string is refused, not stored."""
    s = str(raw or "").strip()
    if not s:
        return ""
    if m := _TME.match(s):
        path = m.group(1).rstrip("/")
        u = _USER.match(path)
        return f"@{u.group(1)}" if u else f"https://t.me/{path}"
    if m := _USER.match(s):
        return f"@{m.group(1)}"
    if _URL.match(s):
        return s
    if _PHONE.match(s) and sum(ch.isdigit() for ch in s) >= 7:
        return re.sub(r"\s+", " ", s)
    raise ValueError("hr_contact_invalid")


def link(contact: str) -> str | None:
    """The URL a button opens, or None (a phone number, or nothing set)."""
    if contact.startswith("@"):
        return f"https://t.me/{contact[1:]}"
    if contact.startswith("https://"):
        return contact
    return None


def get(db: Session) -> str:
    row = db.get(AppSetting, KEY)
    return (row.value if row else "") or ""


def payload(db: Session) -> dict:
    c = get(db)
    return {"text": c, "link": link(c)} if c else {"text": "", "link": None}


# The self-check this module's logic needs (ponytail rule): run
# `python -m app.services.hr_contact` from backend/.
if __name__ == "__main__":
    assert normalize("") == ""
    assert normalize(" @hr_safia ") == "@hr_safia"
    assert normalize("hr_safia") == "@hr_safia"
    assert normalize("https://t.me/hr_safia") == "@hr_safia"
    assert normalize("t.me/+AbCdEf123") == "https://t.me/+AbCdEf123"
    assert normalize("https://safia.uz/vakansiya") == "https://safia.uz/vakansiya"
    assert normalize("+998 90 123-45-67") == "+998 90 123-45-67"
    for bad in ("javascript:alert(1)", "http://x.uz", "salom dunyo", "@ab", "12345"):
        try:
            normalize(bad)
            raise AssertionError(bad)
        except ValueError:
            pass
    assert link("@hr_safia") == "https://t.me/hr_safia"
    assert link("+998 90 123-45-67") is None
    print("hr_contact ok")
