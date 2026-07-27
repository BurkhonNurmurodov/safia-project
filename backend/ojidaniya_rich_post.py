"""Weekly Ojidaniya svodka as a Telegram Rich Message (sendRichMessage).

Thin CLI over app/services/ojidaniya_svodka.py — the same renderer the bot's
/ojidaniya uses — running with an admin (fleet-wide) scope.

    python ojidaniya_rich_post.py                        # last reporting week → stdout
    python ojidaniya_rich_post.py --date-to 26.05.2026 --lang ru --out post.html
    python ojidaniya_rich_post.py --image card.png --send 123456789

--send posts straight to a chat (the embedded image rides as attach://); without
it the script only renders, and the HTML can be pasted into the Broadcast tab's
Rich mode (its sanitizer whitelists this exact dialect).
"""
import argparse
import json
import sys
from datetime import datetime

from app.database import SessionLocal
from app.models import DowntimeData
from app.services.ojidaniya_svodka import build_svodka, dmy

ADMIN_PAYLOAD = {"sub": "cli", "role": "admin", "role_id": None, "role_ref": None}


def send(html: str, chat_id: int, image: str | None):
    import requests
    from app.config import settings
    rich: dict = {"html": html, "is_rtl": False}
    files = None
    if image:
        rich["media"] = [{"id": "scr1", "media": {"type": "photo", "media": "attach://f0"}}]
        files = {"f0": open(image, "rb")}
    r = requests.post(
        f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendRichMessage",
        data={"chat_id": chat_id, "rich_message": json.dumps(rich)}, files=files, timeout=180)
    j = r.json()
    if not j.get("ok"):
        sys.exit(f"sendRichMessage failed: {j.get('description')}")
    print(f"sent to {chat_id}, message_id={j['result'].get('message_id')}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--date-to", help="window end, DD.MM.YYYY or YYYY-MM-DD (default: last reporting date)")
    ap.add_argument("--days", type=int, default=7)
    ap.add_argument("--lang", default="uz", choices=["uz", "uz_cyrl", "ru", "en"])
    ap.add_argument("--all-cats", action="store_true",
                    help="include the Ojidaniya-only categories (default: zagruzka KPI set)")
    ap.add_argument("--image", help="image to embed as tg://photo?id=scr1")
    ap.add_argument("--send", type=int, metavar="CHAT_ID", help="send via sendRichMessage instead of printing")
    ap.add_argument("--out", help="write HTML to file instead of stdout")
    a = ap.parse_args()

    day_to = None
    if a.date_to:
        for fmt in ("%d.%m.%Y", "%Y-%m-%d"):
            try:
                day_to = datetime.strptime(a.date_to, fmt).date()
                break
            except ValueError:
                continue
        else:
            sys.exit(f"bad --date-to: {a.date_to}")

    db = SessionLocal()
    try:
        if not day_to:
            dates = [d for (d,) in db.query(DowntimeData.date).distinct()]
            if not dates:
                sys.exit("no downtime data")
            day_to = max(dmy(d) for d in dates)
        html = build_svodka(db, ADMIN_PAYLOAD, day_to, lang=a.lang, days=a.days,
                            kpi_only=not a.all_cats,
                            with_image=bool(a.image) or not a.send)
    finally:
        db.close()
    if not html:
        sys.exit(f"no reports in the {a.days} days ending {day_to:%d.%m.%Y}")

    if a.out:
        open(a.out, "w", encoding="utf-8").write(html)
        print(f"wrote {a.out} ({len(html)} chars)")
    elif not a.send:
        print(html)
    if a.send:
        send(html, a.send, a.image)
