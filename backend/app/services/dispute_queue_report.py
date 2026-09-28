"""One-off: September's objections to AI rejections still waiting on a brigadir.

The operator asked on 2026-09-28 how many objections leaders filed against
automatic AI rejections in September are still unhandled at the brigadir's
stage, and how many each brigadir holds — as ONE Uzbek rich message they can
forward as-is to the group every brigadir is in. So it is written TO the
brigadirs, stays short, and names where the queue lives in the app. Production
is not readable from the machine that wrote this, so the message is DMed to the
operator from the server.

«Waiting on a brigadir» is `status == "supervisor"` — the open rows under
«Norozliklar» → «Brigadirlarda». Each is counted under the unit stamped on the
objection (`manager_id`), the unit the brigadir's ruling rights are answered
against. September = the CHECKLIST day the objection is about, the date
`leader_dispute.APPEALS_FROM` compares.

It READS and writes nothing but its flag.

Temporary: delete this module, `startup.report_dispute_queue` /
`_dispute_queue_job` and the call in BOTH entrypoints once it has been sent.
"""
from __future__ import annotations

import html
import json
import logging
import time
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models import LeaderAiDispute, Manager
from app.services import leader_dispute as ld

log = logging.getLogger(__name__)

MONTH_FROM = "2026-09-01"
MONTH_TO = "2026-10-01"          # exclusive
TZ = ZoneInfo("Asia/Tashkent")
_API = "https://api.telegram.org"
SEND_RETRIES = 3
_MONTHS = ("yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul",
           "avgust", "sentabr", "oktabr", "noyabr", "dekabr")

# Where a brigadir finds the queue — the app's own labels (nav.leaders, the
# tab, the stage sub-tab), so the words match what is on their screen.
_WHERE = "«Lider nazorati» → «Norozliklar» → «Brigadirlarda»"


def collect(db: Session) -> dict:
    """The counts the message states, as plain data."""
    rows = (db.query(LeaderAiDispute)
            .filter(LeaderAiDispute.date >= MONTH_FROM,
                    LeaderAiDispute.date < MONTH_TO)
            .all())
    names = {m.id: m.name for m in db.query(Manager).all()}

    per: dict = {}
    for d in rows:
        if d.status != ld.SUPERVISOR:
            continue
        u = per.setdefault(d.manager_id, {"waiting": 0, "oldest": None})
        u["waiting"] += 1
        at = d.requested_at
        if at is not None:
            at = (at if at.tzinfo else at.replace(tzinfo=timezone.utc)).astimezone(TZ)
            if u["oldest"] is None or at < u["oldest"]:
                u["oldest"] = at

    table = [{"unit": (names.get(mid) or f"#{mid}") if mid is not None
              else "Brigadir ko'rsatilmagan", **v}
             for mid, v in per.items()]
    table.sort(key=lambda r: (-r["waiting"],
                              r["oldest"].timestamp() if r["oldest"] else 0,
                              r["unit"]))
    return {
        "now": datetime.now(TZ),
        "filed": len(rows),
        "waiting": sum(r["waiting"] for r in table),
        "table": table,
    }


def _esc(v) -> str:
    return html.escape(str(v), quote=False)


def _intro(rep: dict) -> str:
    now = rep["now"]
    stamp = f"{now.day}-{_MONTHS[now.month - 1]}, soat {now:%H:%M}"
    if not rep["filed"]:
        return "Sentabr oyida liderlar AI qaroriga norozilik bildirishmagan."
    first = (f"Sentabr oyida liderlar AI rad etgan vazifalar bo'yicha "
             f"<b>{rep['filed']} ta</b> norozilik bildirishgan.")
    if not rep["waiting"]:
        return (first + f" {stamp} holatiga barchasi ko'rib chiqilgan — brigadir "
                        f"javobini kutayotgan norozilik yo'q.")
    return (first + f" {stamp} holatiga ulardan <b>{rep['waiting']} tasi</b> hali "
                    f"brigadir javobini kutmoqda.")


_ASK = ("Iltimos, o'zingizdagi noroziliklarni imkon qadar tezroq ko'rib chiqing. "
        f"Ularni {_WHERE} bo'limida topasiz.")
_REST = "Ro'yxatda bo'lmagan brigadirlarda javob kutayotgan norozilik yo'q."


def rich(rep: dict) -> str:
    """The message as Telegram rich HTML — one `<p>` per paragraph, since a raw
    newline does not break a line there."""
    out = ["<p><b>Hurmatli brigadirlar!</b></p>", f"<p>{_intro(rep)}</p>"]
    if rep["table"]:
        out.append("<table bordered striped>"
                   "<tr><th>Brigadir</th><th>Soni</th><th>Qachondan beri</th></tr>")
        for r in rep["table"]:
            since = f"{r['oldest']:%d.%m}" if r["oldest"] else "—"
            out.append(f"<tr><td>{_esc(r['unit'])}</td>"
                       f"<td align=\"center\">{r['waiting']}</td>"
                       f"<td align=\"center\">{since}</td></tr>")
        out.append("</table>")
        out.append(f"<p>{_ASK}</p>")
        out.append(f"<p>{_REST}</p>")
    return "".join(out)


def plain(rep: dict) -> str:
    """The same message as ordinary HTML text, for when rich is refused."""
    lines = ["<b>Hurmatli brigadirlar!</b>", "", _intro(rep)]
    if rep["table"]:
        lines.append("")
        for i, r in enumerate(rep["table"], 1):
            since = f" (eng eskisi {r['oldest']:%d.%m})" if r["oldest"] else ""
            lines.append(f"{i}. {_esc(r['unit'])} — <b>{r['waiting']} ta</b>{since}")
        lines += ["", _ASK, _REST]
    return "\n".join(lines)


def _post(method: str, data: dict) -> None:
    last = ""
    for attempt in range(1, SEND_RETRIES + 1):
        wait = 0
        try:
            r = requests.post(f"{_API}/bot{settings.telegram_bot_token}/{method}",
                              data=data, timeout=60)
            body = r.json()
            if body.get("ok"):
                return
            last = body.get("description") or f"HTTP {r.status_code}"
            wait = int(((body.get("parameters") or {}).get("retry_after")) or 0)
        except Exception as exc:
            last = type(exc).__name__
        if attempt < SEND_RETRIES:
            time.sleep(max(wait, 3 * attempt))
    raise RuntimeError(f"{method} failed: {last}"[:300])


def send(db: Session, chat_id: int, *_window) -> int:
    """ONE message: rich first, because that is what carries the table; plain
    HTML if the API refuses it, so the numbers still arrive."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    rep = collect(db)
    db.rollback()
    try:
        # is_rtl pinned False, the broadcast tab's own finding: mixed-direction
        # content otherwise mirrors table columns.
        _post("sendRichMessage", {
            "chat_id": chat_id,
            "rich_message": json.dumps({"html": rich(rep), "is_rtl": False}),
        })
        return 1
    except Exception as exc:
        print(f"[dispute-queue-report] rich send failed ({exc}); sending plain")
    _post("sendMessage", {"chat_id": chat_id, "text": plain(rep),
                          "parse_mode": "HTML"})
    return 1
