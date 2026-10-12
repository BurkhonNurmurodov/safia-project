"""One-off (2026-10-12): Kenjayeva Dinora Sobir Qizi's own photo on the leader
profile she took over.

The operator renamed a leader profile (brigadir Mirmaxmudova Munira, cells 8222
and 8610) from Mukimova Marxabo Samandarovna, who moved to another job, to the
new leader, Kenjayeva Dinora Sobir Qizi, and asked for her photo. The profile
still wore Mukimova's Verifix photo (the 5 Oct pass, `verifix_profile_photos`)
and still named Mukimova as its Verifix person under «Lavozim (Verifix)» (the
4 Oct check) — and the 5 Oct pass takes a photo off that stored tie, so it could
only ever hand back Mukimova's face.

Production's Verifix login lives only on the server, so this runs there once,
at boot, and DMs the operator the result with the photo itself. It finds the
person on Verifix BY THE PROFILE'S NEW NAME, with the 4 Oct check's own strict
rules (`leader_verifix_check._match`: full name, then surname + first name —
never a fuzzy hit), and then, in ONE transaction with its record:

- stores her MAIN Verifix photo through `profile_photo`, framed as the 5 Oct
  pass framed every face (the head kept in the square);
- re-ties the profile to her through the check's own `_apply`, so the note under
  «Lavozim (Verifix)» names her and the switch follows HER job — unless somebody
  set the switch by hand, which is never overwritten.

When she cannot be told apart on Verifix (not found, several namesakes, not
working) NOTHING is written and the DM says why. Not reaching Verifix, or
Verifix not handing the picture over, also writes nothing and is retried on the
next deploy. A run whose DM failed is never made twice — its record is resent.
The record (no bytes) is the ``leader_photo_kenjayeva_2026_10_12`` app setting.

Temporary: delete this module, ``startup.set_kenjayeva_photo_from_verifix`` /
``_kenjayeva_photo_job`` and the call in BOTH entrypoints once the DM has landed
— BEFORE ``leader_verifix_check``, whose helpers it imports.
"""
from __future__ import annotations

import html
import io
import json
import time
from datetime import datetime
from zoneinfo import ZoneInfo

from PIL import Image, ImageOps
from sqlalchemy.orm import Session

from app.config import settings
from app.models import AppSetting, Cell, Manager, ProfilePhoto, RoleProfile
from app.services import action_log, leader_kind, profile_photo, verifix_explore
from app.services import leader_verifix_check as lv
from app.services.name_map import _name_tokens

TZ = ZoneInfo("Asia/Tashkent")
NAME = "Kenjayeva Dinora Sobir Qizi"
# The cells the renamed profile leads — what tells it apart from a namesake
# profile (the 5 Oct pass created one for every Verifix leader that had none).
CELLS = ("8222", "8610")
RECORD_KEY = "leader_photo_kenjayeva_2026_10_12"
# A boot job, not a request: the employee list is ~18 pages.
READ_BUDGET_S = 420.0
# Below this Verifix did not hand over the whole staff (1 Oct: 8,531).
MIN_EMPLOYEES = 1000
# The 5 Oct pass's framing: a face photo's head sits above the middle.
FACE_TOP = 0.35

OUTCOMES = {
    "set": "her Verifix photo is now on the profile",
    "no_photo": "Verifix has no photo of her — the old photo is still on the profile",
    "not_image": "Verifix's photo file is not a readable picture — the old photo is still "
                 "on the profile",
    "no_match": "nothing was changed — she could not be told apart on Verifix",
    "no_profile": "nothing was changed — no leader profile carries this name",
    "unclear": "nothing was changed — several leader profiles carry this name and not "
               "exactly one of them leads cell 8222 or 8610",
}


def _place(db: Session, p: RoleProfile) -> dict:
    unit = db.get(Manager, p.manager_id) if p.manager_id else None
    cells = sorted(c.verifix_code for c in db.query(Cell).filter(Cell.leader_id == p.id).all()
                   if c.verifix_code)
    return {"id": p.id, "unit": unit.name if unit else None, "cells": cells}


def _target(db: Session) -> tuple[RoleProfile | None, list[RoleProfile]]:
    """The renamed profile, and every OTHER leader profile carrying its name."""
    want = " ".join(_name_tokens(NAME))
    same = [p for p in db.query(RoleProfile).filter(RoleProfile.role == "leader").all()
            if " ".join(_name_tokens(p.name)) == want]
    if len(same) <= 1:
        return (same[0] if same else None), []
    ours = {lv._cell_key(c) for c in CELLS}
    leading = {c.leader_id for c in db.query(Cell).filter(Cell.leader_id.isnot(None)).all()
               if lv._cell_key(c.verifix_code) in ours}
    hit = [p for p in same if p.id in leading]
    if len(hit) == 1:
        return hit[0], [p for p in same if p.id != hit[0].id]
    return None, same


def _encode(raw: bytes) -> bytes | None:
    try:
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(raw))).convert("RGB")
    except Exception:
        return None
    return profile_photo.square_jpeg(img, top=FACE_TOP)


def _record(db: Session, rep: dict) -> None:
    """Put the record in the session; the caller commits."""
    value = json.dumps(rep, ensure_ascii=False, default=str)
    row = db.query(AppSetting).filter_by(key=RECORD_KEY).first()
    if row:
        row.value = value
    else:
        db.add(AppSetting(key=RECORD_KEY, value=value))


def run(db: Session) -> dict:
    """Find her on Verifix, write the photo and the tie, keep the record. Raises
    (writing nothing) when Verifix cannot be read whole or keeps the picture."""
    prof, others = _target(db)
    rep: dict = {"at": datetime.now(TZ).isoformat(timespec="minutes"), "name": NAME,
                 "others": [_place(db, p) for p in others]}
    if prof is None:
        rep["outcome"] = "unclear" if others else "no_profile"
        _record(db, rep)
        db.commit()
        return rep

    key = f"leader:{prof.id}"
    meta = dict(prof.leader_kind_meta or {})
    old = meta.get("vfx") or {}
    rep.update(key=key, profile=_place(db, prof),
               before={"kind": prof.leader_kind, "src": meta.get("src"),
                       "vfx_name": old.get("name"), "vfx_job": old.get("job")})

    c = verifix_explore.config(db)
    people = lv._people(db)
    if len(people) < MIN_EMPLOYEES:
        raise RuntimeError(f"Verifix handed over {len(people)} employees (expected at least "
                           f"{MIN_EMPLOYEES}) — the list is cut")
    working_rows = [x for x in people if x["status"] == "W"]
    working = lv._index(working_rows)
    gone = lv._index([x for x in people if x["status"] != "W"])
    cells = db.query(Cell).all()
    own = {lv._cell_key(x.verifix_code) for x in cells if x.leader_id == prof.id} - {None}
    unit = ({lv._cell_key(x.verifix_code) for x in cells if x.manager_id == prof.manager_id}
            - {None}) if prof.manager_id else set()
    m = lv._match(_name_tokens(prof.name), own, unit, working, gone, working_rows)
    e = m.get("emp")
    if not e:
        rep.update(outcome="no_match",
                   reason=lv._reason_text({"reason": m.get("reason"),
                                           "cands": m.get("cands") or []}))
        _record(db, rep)
        db.commit()
        return rep

    # The forced read above just filled the cache; this one reads it back.
    emps, _ = verifix_explore._employees(c, time.monotonic() + READ_BUDGET_S)
    sha = (emps.get(e["id"]) or {}).get("photo")
    data = None
    if sha:
        raw = verifix_explore.download(c, sha)
        if raw is None:
            raise RuntimeError("Verifix did not hand her photo over")
        data = _encode(raw)
    kind = "leader" if lv.is_leader_job(e["job"]) else "acting"
    # `_apply`'s own rule, read ahead so the record goes into its commit.
    manual = meta.get("src") == "manual" and prof.leader_kind in leader_kind.KINDS
    rep.update(outcome="set" if data else ("not_image" if sha else "no_photo"),
               how=m.get("how"),
               vfx={"id": e["id"], "name": e["name"], "job": e["job"] or None,
                    "cell": e["cell_raw"] or e["cell"], "status": e["status"]},
               saved="manual" if manual else "set",
               after={"kind": prof.leader_kind if manual else kind})
    if data:
        profile_photo.store(db, key, data)
    _record(db, rep)
    # Saves the tie (and the kind, unless set by hand) and commits the photo
    # and the record with it.
    lv._apply(db, [{"p": prof, "emp": e, "how": m.get("how"), "reason": None,
                    "cands": [], "kind": kind}], leader_kind.now_iso())
    action_log.record_system(
        "identity", "identity.profile_photos_verifix", db=db,
        target_kind="profile", target_id=key, target_name=prof.name,
        details=[("count", 1), ("added", 1 if data else 0), ("skipped", 0 if data else 1)],
    )
    return rep


# ── the DM ────────────────────────────────────────────────────────────────────

def _e(v) -> str:
    return html.escape(str(v), quote=False)


def _kind(k: str | None) -> str:
    return lv.KIND_WORD.get(k, lv.KIND_WORD[None])


def text(rep: dict) -> str:
    at = datetime.fromisoformat(rep["at"])
    out = rep["outcome"]
    L = [f"<b>{_e(rep['name'])}</b> · profile photo from Verifix · {at:%d.%m.%Y %H:%M}"]
    p = rep.get("profile")
    if p:
        bits = [f"brigadir {p['unit']}" if p["unit"] else "no unit"]
        if p["cells"]:
            bits.append("cells " + ", ".join(p["cells"]))
        L.append("Leader · " + " · ".join(bits))
    L.append(f"<b>{_e(OUTCOMES[out][0].upper() + OUTCOMES[out][1:])}</b>.")
    if out == "no_match":
        L.append(_e(rep.get("reason") or ""))
        L.append("Tell me her exact Verifix name and I will tie the profile to it.")
    v = rep.get("vfx")
    if v:
        L.append(f"Verifix: {_e(v['name'])} · «{_e(v['job'] or '—')}»"
                 + (f" · cell {_e(v['cell'])}" if v.get("cell") else ""))
        b, a = rep["before"], rep["after"]
        if rep["saved"] == "manual":
            L.append(f"«Lavozim (Verifix)»: left as set by hand — {_kind(b['kind'])}")
        elif b["kind"] != a["kind"]:
            L.append(f"«Lavozim (Verifix)»: {_kind(b['kind'])} → <b>{_kind(a['kind'])}</b> "
                     "(her Verifix job)")
        else:
            L.append(f"«Lavozim (Verifix)»: {_kind(a['kind'])} (her Verifix job)")
        if b.get("vfx_name"):
            L.append(f"Was tied to: {_e(b['vfx_name'])}"
                     + (f" · «{_e(b['vfx_job'])}»" if b.get("vfx_job") else ""))
    if out in ("no_photo", "not_image"):
        L.append("Upload hers with «Rasmni almashtirish» on the profile page.")
    for o in rep.get("others") or []:
        where = f"brigadir {o['unit']}" if o["unit"] else "no unit"
        if o["cells"]:
            where += " · cells " + ", ".join(o["cells"])
        L.append(f"Another leader profile has the same name: {_e(where)} (id {o['id']}) — "
                 "if it is a duplicate, delete it on the Profiles tab.")
    return "\n".join(L)


def send(db: Session, chat_id: int, *_window) -> int:
    """Run once and DM the result — with the photo when one was set. A run
    already made by an earlier attempt whose delivery failed is never made
    twice: its stored record is sent."""
    if not settings.telegram_bot_token:
        raise RuntimeError("telegram bot token not configured")
    row = db.query(AppSetting).filter_by(key=RECORD_KEY).first()
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
                    "text": f"{NAME}'s Verifix photo could not be set: {lv._why(exc)}. "
                            "Nothing was changed; it tries again on the next deploy."})
            except Exception:
                pass
            raise
    body = text(rep)
    photo = None
    if rep["outcome"] == "set":
        ph = db.query(ProfilePhoto).filter_by(profile_key=rep["key"]).first()
        photo = ph.data if ph else None
    if photo and len(body) <= 1000:
        lv._post("sendPhoto", {"chat_id": chat_id, "caption": body, "parse_mode": "HTML"},
                 files={"photo": ("photo.jpg", photo, "image/jpeg")})
    else:
        lv._post("sendMessage", {"chat_id": chat_id, "text": body, "parse_mode": "HTML",
                                 "disable_web_page_preview": "true"})
    return 1
