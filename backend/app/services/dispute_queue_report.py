"""One-off: September's objections to AI rejections — how many wait on a brigadir.

The operator asked on 2026-09-28 for a report on the objections leaders filed
against automatic AI rejections in September: how many are still unhandled at
the brigadir's stage, and how many each brigadir is holding. Production is not
readable from the machine that wrote this, so the answer is DMed from the
server.

«Unhandled at the brigadir's stage» is `status == "supervisor"` — the rows the
«Norozliklar» tab lists as open under «Brigadirlarda». Each row is counted
under the unit stamped on the objection (`manager_id`), the same unit the
brigadir's ruling rights are answered against (`_dispute_stage_rights`).
September = the CHECKLIST day the objection is about, the date
`leader_dispute.APPEALS_FROM` compares.

It READS and writes nothing but its flag.

Temporary: delete this module, `startup.report_dispute_queue` /
`_dispute_queue_job` and the call in BOTH entrypoints once it has been sent.
"""
from __future__ import annotations

import logging
import time
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import requests
from sqlalchemy.orm import Session

from app.config import settings
from app.models import LeaderAiDispute, LeaderAiReview, Manager, RoleProfile
from app.services import leader_dispute as ld

log = logging.getLogger(__name__)

MONTH_FROM = "2026-09-01"
MONTH_TO = "2026-10-01"          # exclusive
TZ = ZoneInfo("Asia/Tashkent")
_API = "https://api.telegram.org"
SEND_RETRIES = 3


def _local(v: datetime | None) -> datetime | None:
    if v is None:
        return None
    v = v if v.tzinfo else v.replace(tzinfo=timezone.utc)
    return v.astimezone(TZ)


def _restored(rev: LeaderAiReview | None) -> bool:
    """The verdict under objection no longer costs the task its weight.

    The inverse of `leader_ai.rejected_by_uid` for a September day (every one
    of them is in the automatic regime): a human `rejected` always deducts, a
    `flagged` verdict deducts until a human `approved`. Only a CLEAN re-read or
    an approval counts as restored here — a verdict waiting on a re-check
    (`pending`) or an `error` is not an answer yet, and a missing row cannot be
    placed, so both stay "still costs".
    """
    if rev is None or rev.resolution == "rejected":
        return False
    return rev.resolution == "approved" or rev.status == "ok"


def collect(db: Session) -> dict:
    """Everything the message says, as plain data."""
    rows = (db.query(LeaderAiDispute)
            .filter(LeaderAiDispute.date >= MONTH_FROM,
                    LeaderAiDispute.date < MONTH_TO)
            .all())
    units = {m.id: m for m in db.query(Manager).all()}

    waiting = [d for d in rows if d.status == ld.SUPERVISOR]
    refs = sorted({d.ref for d in waiting})
    reviews = ({r.ref: r for r in db.query(LeaderAiReview)
                .filter(LeaderAiReview.ref.in_(refs)).all()} if refs else {})

    status = {"supervisor": 0, "admin": 0, "approved": 0,
              "rejected_admin": 0, "rejected_sup": 0, "cancelled": 0, "other": 0}
    for d in rows:
        if d.status == ld.REJECTED:
            status["rejected_admin" if d.decided_at is not None else "rejected_sup"] += 1
        elif d.status in status:
            status[d.status] += 1
        else:
            status["other"] += 1

    per: dict = {}
    for d in rows:
        u = per.setdefault(d.manager_id, {"filed": 0, "waiting": 0, "oldest": None,
                                          "restored": 0, "days": set()})
        u["filed"] += 1
        if d.status != ld.SUPERVISOR:
            continue
        u["waiting"] += 1
        u["days"].add(d.date)
        at = _local(d.requested_at)
        if at is not None and (u["oldest"] is None or at < u["oldest"]):
            u["oldest"] = at
        if _restored(reviews.get(d.ref)):
            u["restored"] += 1

    def label(mid) -> str:
        m = units.get(mid)
        if m is None:
            return "(no brigadir on the row)" if mid is None else f"unit #{mid}"
        return m.name + (f" (S{m.shift})" if m.shift else "")

    table = [{"unit": label(mid), "manager_id": mid, **v,
              "days": sorted(v["days"])}
             for mid, v in per.items()]
    table.sort(key=lambda r: (-r["waiting"], r["oldest"] is None,
                              r["oldest"].timestamp() if r["oldest"] else 0,
                              -r["filed"], r["unit"]))

    # Units whose leaders filed nothing at all this month — only units that run
    # a checklist (a leader profile stands in them), so a unit that exists for
    # its load alone is not listed as «no objections».
    with_leaders = {mid for (mid,) in db.query(RoleProfile.manager_id)
                    .filter(RoleProfile.role == "leader",
                            RoleProfile.manager_id.isnot(None)).distinct()}
    quiet = sorted(label(m.id) for m in units.values()
                   if not m.archived and m.id in with_leaders and m.id not in per)

    now = datetime.now(TZ)
    return {
        "now": now,
        "upto": min(now.date(), date(2026, 9, 30)),
        "filed": len(rows),
        "status": status,
        "waiting": len(waiting),
        "waiting_units": sum(1 for r in table if r["waiting"]),
        "restored": sum(r["restored"] for r in table),
        "table": table,
        "quiet": quiet,
    }


def text(rep: dict) -> str:
    s = rep["status"]
    settled = (s["approved"] + s["rejected_admin"] + s["rejected_sup"]
               + s["cancelled"] + s["other"])
    L = ["AI objections — September 2026",
         f"Checklist days 01.09–{rep['upto']:%d.%m} · counted "
         f"{rep['now']:%d.%m %H:%M} (Tashkent)", "",
         f"Filed: {rep['filed']}",
         f"• Waiting on a brigadir: {rep['waiting']}"
         + (f" (in {rep['waiting_units']} units)" if rep["waiting"] else ""),
         f"• Waiting on an admin: {s['admin']}",
         f"• Settled: {settled} — approved {s['approved']} · refused by an admin "
         f"{s['rejected_admin']} · refused by a brigadir {s['rejected_sup']} · "
         f"cancelled {s['cancelled']}"
         + (f" · other {s['other']}" if s["other"] else ""),
         ""]

    busy = [r for r in rep["table"] if r["waiting"]]
    L.append("Waiting on the brigadir, per brigadir")
    L.append("(waiting / filed this month · oldest waiting since)")
    for i, r in enumerate(busy, 1):
        since = f" · since {r['oldest']:%d.%m}" if r["oldest"] else ""
        L.append(f"{i}. {r['unit']} — {r['waiting']} / {r['filed']}{since}")
    if not busy:
        L.append("none")

    clear = [r for r in rep["table"] if not r["waiting"]]
    if clear:
        L.append("")
        L.append("Nothing waiting (filed this month): " + ", ".join(
            f"{r['unit']} {r['filed']}" for r in clear))
    if rep["quiet"]:
        L.append("")
        L.append("No objections this month: " + ", ".join(rep["quiet"]))

    if rep["restored"]:
        L.append("")
        L.append(f"Note: {rep['restored']} of the {rep['waiting']} waiting no longer "
                 f"cost the task anything — its AI verdict was cleared since, or an "
                 f"admin approved it in «AI tekshiruvi». The brigadir's ruling on "
                 f"those changes no score.")
    L.append("")
    L.append("Same rows as /leaders → Norozliklar → «Brigadirlarda», open ones.")
    return "\n".join(L)


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
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    body = text(collect(db))
    db.rollback()
    chunks, cur = [], ""
    for line in body.split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        _post("sendMessage", {"chat_id": chat_id, "text": c})
    return len(chunks)
