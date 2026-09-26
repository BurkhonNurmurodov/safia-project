"""⚠ TEMPORARY one-shot (2026-09-26): Turdimurodov Nodirjon's checklist days
that carry Aripova Manzura's unit go back to his own unit.

Delete this module together with `startup.fix_nodirjon_leader_unit` and its
call in BOTH `main.py` and `passenger_wsgi.py` once its flag reads «done». The
name pin in `name_map._LEADER_PINS` STAYS — it is what keeps his Google-Form
history and his bot days one person.

What happened (Aripova Manzura's /leaders page, reported 25 Sep 2026).
Nodirjon runs his OWN unit, «Turdimurodov Nodirjon», as its brigadir — since
mid-August he closes its attendance and owns its only cell, 0811 — and his
leader profile sits in that same unit. A bot day carries the unit its profile
was in when the day STARTED (`telegram_bot._lt_save_entry`), and moving a
profile never re-stamps a day already filed. Two of his September days started
while the profile sat in Aripova's unit, and on her page that was enough to
make him one of HER leaders for the whole month: `unitSlots` counts everybody
seen filing in the window, so every day he filed under his own unit read as a
report her unit was missing, and his own row showed 2 of 30 days, red on the
days he had filed.

His checklist stays where the platform's model puts it — the leader and his
cell in ONE unit. Putting it under Aripova instead would either take 0811 out
of the unit he runs (moving a leader drags his cells) or leave a leader owning
a cell of another unit, where his automatic checks #1 and #9 — which read the
LEADER's unit's cells — would fail every day.

What it writes, and nothing else — no score, answer, photo or verdict moves:
  1. every bot day of his stamped with Aripova's unit gets his own unit, and so
     does every row that carries the unit for one of those days (AI verdicts,
     the report ledger, objections, late proofs, automatic checks, exclusions);
  2. a day he filed through BOTH doors (25 Aug: the Google Form at 100%, a bot
     day abandoned at 5%) counts from the FORM. The pin makes such a day a
     pair, and the merge rule would otherwise settle it for the bot — turning
     a complete day into 5%. It is the admin's own per-day choice
     (`leader_day_sources`), reversible on «Liderlar kunlik vazifalari».

Refuses — stages nothing and says what it found — unless both units and exactly
one leader profile resolve BY NAME and that profile sits in his own unit. Ids
are never trusted: they differ between a checkout and production.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    Cell, LeaderAiDispute, LeaderAiReview, LeaderAutoCheck, LeaderChecklist,
    LeaderDayExclusion, LeaderDayReport, LeaderDaySource, LeaderLateProof,
    LeaderTaskDay, LeaderTaskEntry, Manager, RoleProfile,
)
from app.services import leader_ai, leader_bot
from app.services.name_map import _name_tokens, _norm

LEADER = "Turdimurodov Nodirjon"          # surname + first name: how he is found
OWN_UNIT = "Turdimurodov Nodirjon"        # the unit he runs, where his profile is
WRONG_UNIT = "Aripova Manzura"            # the unit some of his days carry
FORM_SPELLING = "TURDIMURODOV NODIRJON"   # his Google-Form name, pinned in name_map
SET_BY = "Tizim · 26.09 tuzatish"


def apply(db: Session) -> dict:
    """Stage the fix on `db` and report what was staged.

    Never commits: the caller commits it together with its flag, so the two
    cannot disagree. A non-empty ``problems`` means nothing was staged."""
    out: dict = {"problems": [], "profile": None, "own": None, "wrong": None,
                 "cells": [], "moved": [], "side": {}, "sheet_days": [],
                 "bot_days_kept": []}

    units = db.query(Manager).filter(Manager.archived.is_(False)).all()
    own = [m for m in units if _norm(m.name) == _norm(OWN_UNIT)]
    wrong = [m for m in units if _norm(m.name) == _norm(WRONG_UNIT)]
    if len(own) != 1 or len(wrong) != 1:
        out["problems"].append(
            f"bo'linmalar: «{OWN_UNIT}» — {len(own)} ta, «{WRONG_UNIT}» — "
            f"{len(wrong)} ta (bittadan kutilgan)")
        return out
    own, wrong = own[0], wrong[0]
    out["own"], out["wrong"] = own.name, wrong.name

    key = _name_tokens(LEADER)[:2]
    profs = [p for p in db.query(RoleProfile)
             .filter(RoleProfile.role == "leader").order_by(RoleProfile.id).all()
             if _name_tokens(p.name)[:2] == key]
    if len(profs) != 1:
        unit_name = {m.id: m.name for m in units}
        found = ", ".join(f"#{p.id} {p.name} ({unit_name.get(p.manager_id, '—')})"
                          for p in profs)
        out["problems"].append(
            f"lider profillari: {found or 'topilmadi'} (bitta kutilgan)")
        return out
    prof = profs[0]
    out["profile"] = f"#{prof.id} {prof.name}"
    if prof.manager_id != own.id:
        out["problems"].append(
            f"profil {out['profile']} «{own.name}» bo'linmasida emas")
        return out

    # His cells — reported, never written: a cell is the unit's register.
    out["cells"] = [(c.verifix_code, c.manager_id == own.id)
                    for c in db.query(Cell).filter(Cell.leader_id == prof.id)
                    .order_by(Cell.verifix_code).all()]

    # ── 1. days carrying the other unit ─────────────────────────────────────
    days = (db.query(LeaderTaskDay)
            .filter(LeaderTaskDay.leader_id == prof.id,
                    LeaderTaskDay.manager_id == wrong.id)
            .order_by(LeaderTaskDay.date).all())
    if days:
        ids = [d.id for d in days]
        dates = sorted({d.date for d in days})
        refs = [leader_ai.bot_ref(e) for (e,) in
                db.query(LeaderTaskEntry.id)
                .filter(LeaderTaskEntry.day_id.in_(ids)).all()]

        def restamp(model, *conds) -> int:
            # Only rows still naming the other unit: whatever already names his
            # own unit, or a third one, is not this mistake.
            return (db.query(model)
                    .filter(model.manager_id == wrong.id, *conds)
                    .update({model.manager_id: own.id},
                            synchronize_session=False))

        side = {
            "verdicts": restamp(LeaderAiReview,
                                LeaderAiReview.ref.in_(refs)) if refs else 0,
            "objections": restamp(LeaderAiDispute,
                                  LeaderAiDispute.ref.in_(refs)) if refs else 0,
            "reports": restamp(LeaderDayReport, or_(
                LeaderDayReport.uid.in_([leader_bot.day_uid(i) for i in ids]),
                LeaderDayReport.report_key.in_([f"bot:{i}" for i in ids]))),
            "late_proofs": restamp(LeaderLateProof,
                                   LeaderLateProof.day_id.in_(ids)),
            "auto_checks": restamp(LeaderAutoCheck,
                                   LeaderAutoCheck.leader_id == prof.id,
                                   LeaderAutoCheck.date.in_(dates)),
            "exclusions": restamp(LeaderDayExclusion,
                                  LeaderDayExclusion.leader_profile_id == prof.id,
                                  LeaderDayExclusion.date.in_(dates)),
        }
        for d in days:
            d.manager_id = own.id
        out["moved"] = dates
        out["side"] = {k: v for k, v in side.items() if v}

    # ── 2. a day filed through both doors ───────────────────────────────────
    target = _norm(FORM_SPELLING)
    form: dict[str, float] = {}
    for date_, name, pct in (db.query(LeaderChecklist.date, LeaderChecklist.leader,
                                      LeaderChecklist.completion)
                             .filter(LeaderChecklist.leader.isnot(None)).all()):
        if _norm(name) == target:
            d = str(date_)[:10]
            form[d] = max(form.get(d, 0.0), float(pct or 0))
    if form:
        bot = {d.date: d for d in db.query(LeaderTaskDay)
               .filter(LeaderTaskDay.leader_id == prof.id,
                       LeaderTaskDay.closed_at.isnot(None),
                       LeaderTaskDay.cell_id.is_(None),
                       LeaderTaskDay.date.in_(list(form))).all()}
        # An admin who already ruled on the day keeps their ruling.
        ruled = {s.date for s in db.query(LeaderDaySource)
                 .filter(LeaderDaySource.leader_profile_id == prof.id,
                         LeaderDaySource.date.in_(list(form))).all()}
        now = datetime.now(timezone.utc)
        for d in sorted(bot):
            if d in ruled:
                continue
            pair = (d, form[d], float(bot[d].completion or 0))
            if pair[1] >= pair[2]:
                db.add(LeaderDaySource(leader_profile_id=prof.id, date=d,
                                       source="sheet", set_by=SET_BY, set_at=now))
                out["sheet_days"].append(pair)
            else:
                out["bot_days_kept"].append(pair)
    return out


_SIDE_UZ = {"verdicts": "AI xulosalari", "objections": "norozliklar",
            "reports": "hisobotlar", "late_proofs": "kechikkan isbotlar",
            "auto_checks": "avto tekshiruvlar", "exclusions": "istisnolar"}


def message(out: dict) -> str:
    """The operator's DM, in Uzbek Latin like every other boot report."""
    def dm(d: str) -> str:
        return f"{d[8:10]}.{d[5:7]}"

    if out["problems"]:
        return ("⚠️ Turdimurodov Nodirjon (/leaders) tuzatishi bajarilmadi — "
                "hech narsa yozilmadi.\n" + "\n".join(out["problems"]))
    lines = ["🔧 Turdimurodov Nodirjon — /leaders tuzatildi.",
             f"Lider profili {out['profile']} — «{out['own']}» bo'linmasida."]
    if out["cells"]:
        lines.append("Yacheykalari: " + ", ".join(
            code + ("" if here else " (boshqa bo'linmada!)")
            for code, here in out["cells"]))
    if out["moved"]:
        side = ", ".join(f"{_SIDE_UZ.get(k, k)}: {v}"
                         for k, v in out["side"].items())
        lines.append(
            f"«{out['wrong']}» bo'linmasi yozilgan {len(out['moved'])} kuni o'z "
            f"bo'linmasiga ko'chirildi: " + ", ".join(dm(d) for d in out["moved"])
            + (f" ({side})" if side else "") + ".")
    else:
        lines.append(f"«{out['wrong']}» bo'linmasi yozilgan kuni yo'q — "
                     "ko'chiriladigan narsa topilmadi.")
    lines.append(f"Google Form'dagi «{FORM_SPELLING}» yozuvlari endi shu "
                 "profilga bog'langan — ro'yxatlarda bir marta chiqadi.")
    for d, f_pct, b_pct in out["sheet_days"]:
        lines.append(f"{dm(d)}: Form ({f_pct:.0f}%) va bot ({b_pct:.0f}%) ikkalasi "
                     "bor — hisobga Form olindi («Liderlar kunlik vazifalari»da "
                     "o'zgartirsa bo'ladi).")
    for d, f_pct, b_pct in out["bot_days_kept"]:
        lines.append(f"{dm(d)}: Form ({f_pct:.0f}%) va bot ({b_pct:.0f}%) — bot "
                     "hisobda qoldi.")
    lines.append("Ball, javob, rasm va AI xulosalari o'zgarmadi. U Aripova "
                 "Manzura sahifasida faqat 25-avgustgacha bo'lgan Form tarixida "
                 "ko'rinadi.")
    return "\n".join(lines)
