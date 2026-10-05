"""One-off (2026-10-05): every leader's and brigadir's Verifix photo as their
profile photo on the platform.

The operator: «put pictures of the leaders and supervisors on Verifix as
profile picture on IMS». Production's Verifix login lives only on the server,
so this runs there once, at boot, and DMs what it did.

WHO a profile is on Verifix is not decided here. It is the tie the 4 Oct checks
already made and the operator was shown — ``role_profiles.leader_kind_meta.vfx.id``
for a leader (``leader_verifix_check``, its pins, and the profiles the 5 Oct
pass created), ``managers.supervisor_kind_meta.vfx.id`` for a brigadir unit
(``verifix_supervisor_check``) — the same tie each profile page names
(«Verifix: …»). A profile with no tie gets no photo and is listed with the
reason the check gave; nothing here matches names afresh.

Three refusals keep a wrong face off a profile:

- a profile that already HAS a photo keeps it — somebody chose it by hand, and
  a value set by hand is never overwritten on this platform;
- the tied person's Verifix name must still look like the profile's
  (``name_map._pair_score``, either word order): a profile renamed since the
  check — a leader replaced by somebody else under the same profile — would
  otherwise wear the previous person's face;
- the Verifix employee list must be whole (``MIN_EMPLOYEES``), or a cut answer
  reads as «nobody has a photo».

The photo is the employee's MAIN identification photo (``_emp``'s ``photo``),
downloaded through ``verifix_explore.download`` (the «Verifix (test)» pages'
own doors), squared with the head kept in frame (the Verifix pages' framing)
and stored through ``profile_photo`` exactly as an admin's upload is. Every
photo is written in ONE transaction, with the record, so a crash writes
nothing and the next boot runs it again. The record (no bytes) is the
``verifix_profile_photos_2026_10_05`` app setting.

Temporary: delete this module, ``startup.set_profile_photos_from_verifix`` /
``_profile_photos_job`` and the call in BOTH entrypoints once the report has
landed — BEFORE ``leader_verifix_check``, whose helpers it imports. The photos
stay; ``services/profile_photo.py`` stays.
"""
from __future__ import annotations

import html
import io
import json
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from io import BytesIO
from zoneinfo import ZoneInfo

from openpyxl import Workbook
from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Manager, ProfilePhoto, RoleProfile
from app.services import action_log, profile_photo, verifix_explore
from app.services import leader_verifix_check as lv
from app.services.name_map import _name_tokens, _pair_score

TZ = ZoneInfo("Asia/Tashkent")
# A boot job, not a request: the employee list is ~18 pages.
READ_BUDGET_S = 420.0
# All the downloads together; what is left past it is listed, never half-done.
DOWNLOAD_BUDGET_S = 600.0
WORKERS = 4
SNAPSHOT_KEY = "verifix_profile_photos_2026_10_05"
# Below this, Verifix did not hand over the whole staff (1 Oct: 8,531).
MIN_EMPLOYEES = 1000
# Where the square sits down a tall photo: the head is above the middle (the
# framing the «Verifix (test)» pages' own avatars use).
FACE_TOP = 0.35

# Outcome → its words, in the order the report lists them.
OUTCOMES = {
    "set": "photo set from Verifix",
    "own_photo": "kept — already has a photo",
    "no_tie": "not tied to a Verifix person",
    "name_changed": "the profile name no longer matches the tied Verifix person",
    "not_in_list": "the tied Verifix person is not in Verifix's list",
    "no_photo": "Verifix has no photo of this person",
    "download_failed": "Verifix did not hand the photo over",
    "not_image": "Verifix's file is not a readable picture",
    "out_of_time": "not downloaded — the time ran out",
}
# The same outcomes as counts in the summary line («12 got their photo»).
COUNTED = {
    "set": "got their Verifix photo",
    "own_photo": "kept their own photo",
    "no_tie": "not tied to Verifix",
    "name_changed": "name differs from the tied person",
    "not_in_list": "tied person missing from Verifix",
    "no_photo": "no photo in Verifix",
    "download_failed": "photo not handed over",
    "not_image": "file is not a picture",
    "out_of_time": "out of time",
}
OUTCOMES_UZ = {
    "set": "Verifix rasmi qo'yildi",
    "own_photo": "o'z rasmi bor — o'zgartirilmadi",
    "no_tie": "Verifix xodimiga bog'lanmagan",
    "name_changed": "profil nomi bog'langan Verifix xodimiga o'xshamaydi",
    "not_in_list": "bog'langan xodim Verifix ro'yxatida yo'q",
    "no_photo": "Verifixda rasmi yo'q",
    "download_failed": "Verifix rasmni bermadi",
    "not_image": "Verifixdagi fayl rasm emas",
    "out_of_time": "vaqt tugadi — yuklanmadi",
}
# Why a check left a profile untied (`vfx.reason`), and «never checked».
NO_TIE = {
    "not_found": "no employee with this name in Verifix",
    "ambiguous": "several Verifix employees answer to this name",
    "namesake": "Verifix has a namesake with another patronymic",
    "not_working": "in Verifix but not working",
    "short_name": "the profile name has fewer than two words",
    "pin_not_found": "the pinned Verifix name was not found",
    "archived": "the unit is archived and was not checked",
    None: "never checked against Verifix — created after the check",
}


def _same_person(profile_name: str, vfx_name: str) -> bool:
    a, b = _name_tokens(profile_name), _name_tokens(vfx_name)
    if len(a) < 2 or len(b) < 2:
        return False
    return _pair_score(a, b) > 0 or _pair_score([a[1], a[0]] + a[2:], b) > 0


def _targets(db: Session) -> list[dict]:
    """Every brigadir unit and leader profile, with its Verifix tie."""
    units = {m.id: m for m in db.query(Manager).all()}
    out = []
    for m in sorted(units.values(), key=lambda m: (m.shift or 9, m.name or "")):
        out.append({"key": f"supervisor:{m.id}", "role": "supervisor", "name": m.name,
                    "unit": m.name, "shift": m.shift, "archived": bool(m.archived),
                    "vfx": (m.supervisor_kind_meta or {}).get("vfx") or {}})
    leaders = db.query(RoleProfile).filter(RoleProfile.role == "leader").all()
    for p in sorted(leaders, key=lambda p: ((units.get(p.manager_id).name if p.manager_id in units
                                             else "~"), p.name or "")):
        u = units.get(p.manager_id)
        out.append({"key": f"leader:{p.id}", "role": "leader", "name": p.name,
                    "unit": u.name if u else None, "shift": u.shift if u else None,
                    "archived": bool(u.archived) if u else False,
                    "vfx": (p.leader_kind_meta or {}).get("vfx") or {}})
    return out


def _encode(raw: bytes) -> bytes | None:
    try:
        img = Image.open(io.BytesIO(raw))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except Exception:
        return None
    return profile_photo.square_jpeg(img, top=FACE_TOP)


def run(db: Session) -> dict:
    """Read Verifix, write every photo it can, keep the record. Raises when
    Verifix's answer is not whole (nothing is written then)."""
    c = verifix_explore.config(db)
    emps, _ = verifix_explore._employees(c, time.monotonic() + READ_BUDGET_S, force=True)
    if len(emps) < MIN_EMPLOYEES:
        raise RuntimeError(f"Verifix handed over {len(emps)} employees (expected at least "
                           f"{MIN_EMPLOYEES}) — the list is cut, nothing was written")

    have = {k for (k,) in db.query(ProfilePhoto.profile_key).all()}
    rows, todo = [], []
    for t in _targets(db):
        vfx = t.pop("vfx")
        vid = str(vfx.get("id") or "")
        e = emps.get(vid) if vid else None
        r = {**t, "vfx_id": vid or None, "vfx_name": (e or {}).get("name") or vfx.get("name"),
             "vfx_job": vfx.get("job"), "vfx_status": (e or {}).get("status"), "note": None}
        if not vid:
            r["outcome"] = "no_tie"
            r["note"] = NO_TIE.get(vfx.get("reason"), vfx.get("reason"))
        elif t["key"] in have:
            r["outcome"] = "own_photo"
        elif not e:
            r["outcome"] = "not_in_list"
        elif not _same_person(t["name"] or "", e.get("name") or ""):
            r["outcome"] = "name_changed"
        elif not e.get("photo"):
            r["outcome"] = "no_photo"
        else:
            r["outcome"] = None
            r["sha"] = e["photo"]
            todo.append(r)
        rows.append(r)

    # One download per PHOTO — two units of one brigadir share a person.
    shas = sorted({r["sha"] for r in todo})
    got: dict[str, bytes | None] = {}
    end = time.monotonic() + DOWNLOAD_BUDGET_S

    def fetch(sha: str):
        if time.monotonic() > end:
            return sha, "out_of_time"
        raw = verifix_explore.download(c, sha)
        if raw is None:
            return sha, "download_failed"
        data = _encode(raw)
        return sha, data if data else "not_image"

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        for sha, res in pool.map(fetch, shas):
            got[sha] = res

    for r in todo:
        res = got.get(r.pop("sha"))
        if isinstance(res, bytes):
            profile_photo.store(db, r["key"], res)
            r["outcome"] = "set"
        else:
            r["outcome"] = res or "download_failed"

    rep = {"at": datetime.now(TZ).isoformat(timespec="minutes"), "employees": len(emps),
           "rows": rows}
    row = db.query(AppSetting).filter_by(key=SNAPSHOT_KEY).first()
    value = json.dumps(rep, ensure_ascii=False, default=str)
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=SNAPSHOT_KEY, value=value))
    db.commit()
    n = Counter(r["outcome"] for r in rows)
    action_log.record_system(
        "identity", "identity.profile_photos_verifix", db=db,
        details=[("count", len(rows)), ("added", n["set"]),
                 ("skipped", len(rows) - n["set"])],
    )
    return rep


# ── the report ────────────────────────────────────────────────────────────────

def _e(v) -> str:
    return html.escape(str(v), quote=False)


def _role_word(role: str) -> str:
    return "brigadir" if role == "supervisor" else "leader"


def text(rep: dict) -> str:
    rows = rep["rows"]
    at = datetime.fromisoformat(rep["at"])
    L = [f"<b>Profile photos from Verifix</b> · {at:%d.%m.%Y %H:%M}",
         "Every brigadir unit and leader profile tied to a Verifix person (the 4–5 Oct "
         "checks) got that person's Verifix photo — unless it already had a photo, which "
         "was kept. Nobody was matched afresh.", ""]
    for role, title in (("supervisor", "Brigadirs"), ("leader", "Leaders")):
        rs = [r for r in rows if r["role"] == role]
        n = Counter(r["outcome"] for r in rs)
        L.append(f"<b>{title}</b>: {len(rs)} — " + ", ".join(
            f"{n[k]} {COUNTED[k]}" for k in OUTCOMES if n[k]))
    L.append("")
    for k in OUTCOMES:
        if k in ("set", "own_photo"):
            continue
        rs = [r for r in rows if r["outcome"] == k]
        if not rs:
            continue
        L.append(f"<b>{_e(OUTCOMES[k][0].upper() + OUTCOMES[k][1:])}</b> ({len(rs)}):")
        for r in rs[:60]:
            bits = [_role_word(r["role"])]
            if r["role"] == "leader":
                bits.append(f"brigadir {r['unit']}" if r["unit"] else "no unit")
            line = f"• {_e(r['name'])} — {_e(' · '.join(bits))}"
            if k == "name_changed" and r["vfx_name"]:
                line += f" → Verifix: {_e(r['vfx_name'])}"
            elif r["note"]:
                line += f" ({_e(r['note'])})"
            L.append(line)
        if len(rs) > 60:
            L.append(f"… and {len(rs) - 60} more — in the workbook")
        L.append("")
    L.append("A missing photo is added by hand on the person's profile page.")
    return "\n".join(L)


def build_workbook(rep: dict) -> BytesIO:
    wb = Workbook()
    wb.remove(wb.active)
    order = list(OUTCOMES)
    rows = sorted(rep["rows"], key=lambda r: (order.index(r["outcome"]) if r["outcome"] in order
                                              else 99, r["role"] != "supervisor",
                                              r["unit"] or "~", r["name"] or ""))
    lv._sheet(wb, "Rasmlar", [
        "№", "Rol", "Profil", "Brigadir", "Smena", "Brigada arxivda", "Natija", "Izoh",
        "Verifix ismi", "Verifix ID", "Verifix lavozimi", "Verifix holati"],
        [[i, "Brigadir" if r["role"] == "supervisor" else "Lider", r["name"], r["unit"],
          r["shift"], "ha" if r["archived"] else "", OUTCOMES_UZ.get(r["outcome"], r["outcome"]),
          r["note"] or "", r["vfx_name"] or "", r["vfx_id"] or "", r["vfx_job"] or "",
          r["vfx_status"] or ""] for i, r in enumerate(rows, 1)])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return buf


# ── delivery ──────────────────────────────────────────────────────────────────

def send(db: Session, chat_id: int, *_window) -> int:
    """Run once and DM the report. A run already made by an earlier attempt
    whose delivery failed is never made twice — its stored record is sent."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    row = db.query(AppSetting).filter_by(key=SNAPSHOT_KEY).first()
    if row:
        rep = json.loads(row.value)
    else:
        try:
            rep = run(db)
        except Exception as exc:
            db.rollback()
            try:
                lv._post("sendMessage", {
                    "chat_id": chat_id,
                    "text": f"Profile photos × Verifix could not run: {lv._why(exc)}. Nothing "
                            "was changed; it tries again on the next deploy."})
            except Exception:
                pass
            raise
    chunks, cur = [], ""
    for line in text(rep).split("\n"):
        if len(cur) + len(line) + 1 > 3900:
            chunks.append(cur)
            cur = ""
        cur += line + "\n"
    chunks.append(cur)
    for c in chunks:
        lv._post("sendMessage", {"chat_id": chat_id, "text": c, "parse_mode": "HTML",
                                 "disable_web_page_preview": "true"})
    stamp = datetime.fromisoformat(rep["at"]).strftime("%d.%m.%Y")
    lv._post("sendDocument", {"chat_id": chat_id,
                              "caption": "Profile photos × Verifix — every brigadir and leader "
                                         "profile, whether it got its Verifix photo and why not"},
             files={"document": (f"profil-rasmlari-verifix-{stamp}.xlsx",
                                 build_workbook(rep).getvalue(),
                                 "application/vnd.openxmlformats-officedocument."
                                 "spreadsheetml.sheet")})
    return len(chunks) + 1
