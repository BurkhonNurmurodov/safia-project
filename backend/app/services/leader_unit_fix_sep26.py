"""⚠ TEMPORARY one-shot (2026-09-26): Turdimurodov Nodirjon's checklist counts
under Aripova Manzura, as ONE person; his cell and its загрузка stay in the
unit made for them.

Delete this module together with `startup.fix_nodirjon_leader_unit` and its
call in BOTH `main.py` and `passenger_wsgi.py` once its flag reads «done». The
name pin in `name_map._LEADER_PINS` STAYS.

The operator's ruling (26 Sep 2026): Nodirjon is Aripova Manzura's LEADER. The
unit «Turdimurodov Nodirjon» exists only so his cell's загрузка can be read on
its own — he is its brigadir for that and nothing else. His leader profile had
been put in that unit as well, and a bot checklist day carries the unit its
profile was in when the day STARTED (`telegram_bot._lt_save_entry`), so every
day he filed from 25 Aug landed on his own unit: Aripova's /leaders page showed
his Google-Form history (to 25 Aug) and his bot days as two people, and the
days he filed as red. The first version of this pass, earlier the same day,
read the case the other way round and moved two stray days to his unit; this
one supersedes it under a new flag.

What it writes — no score, answer, photo or verdict moves:
  1. his leader PROFILE moves to Aripova's unit together with the Telegram role
     rows holding it (what the Profiles tab does on a unit change) — but NOT his
     cells: 0811 stays where it is, so its catalog, plan, typed people,
     attendance and ojidaniya — the загрузка — are read there exactly as
     before. What a leader's cell is measured by now follows the CELL
     (`cell_lookup.cells_unit_for_leader`: the automatic checks, his
     /production page), and neither the Profiles tab nor the /cells form moves a
     cell on a save that does not move its leader;
  2. every checklist day of his stamped with another unit gets Aripova's, and so
     does every row carrying the unit for one of those days (AI verdicts, the
     report ledger, objections, late proofs, automatic checks, exclusions);
  3. Aripova's day digests already sent for those dates are taken as including
     his rows, so the move re-sends nothing — telling her is the operator's call;
  4. a day he filed through BOTH doors (25 Aug: the Google Form at 100%, a bot
     day abandoned at 5%) counts from the FORM — the admin's per-day choice
     (`leader_day_sources`), reversible on «Liderlar kunlik vazifalari».

Refuses — stages nothing and says what it found — unless both units and exactly
one leader profile resolve BY NAME and the profile sits in one of the two. Ids
are never trusted: they differ between a checkout and production.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    Cell, LeaderAiDispute, LeaderAiReview, LeaderAutoCheck, LeaderChecklist,
    LeaderDayExclusion, LeaderDayReport, LeaderDaySource, LeaderLateProof,
    LeaderTaskDay, LeaderTaskEntry, LeaderUnitReport, Manager, RoleProfile,
)
from app.services import leader_ai, leader_bot
from app.services.name_map import _name_tokens, _norm

LEADER = "Turdimurodov Nodirjon"          # surname + first name: how he is found
LEADER_UNIT = "Aripova Manzura"           # whose leader he is — his checklist counts here
CELL_UNIT = "Turdimurodov Nodirjon"       # where his cell and its загрузка stay
FORM_SPELLING = "TURDIMURODOV NODIRJON"   # his Google-Form name, pinned in name_map
SET_BY = "Tizim · 26.09 tuzatish"


def apply(db: Session) -> dict:
    """Stage the move on `db` and report what was staged.

    Never commits: the caller commits it together with its flag, so the two
    cannot disagree. A non-empty ``problems`` means nothing was staged."""
    out: dict = {"problems": [], "profile": None, "to": None, "cell_unit": None,
                 "profile_moved": False, "holders": 0, "cells": [], "moved": [],
                 "side": {}, "digests": 0, "sheet_days": [], "bot_days_kept": []}

    units = db.query(Manager).filter(Manager.archived.is_(False)).all()
    to_ = [m for m in units if _norm(m.name) == _norm(LEADER_UNIT)]
    home = [m for m in units if _norm(m.name) == _norm(CELL_UNIT)]
    if len(to_) != 1 or len(home) != 1:
        out["problems"].append(
            f"bo'linmalar: «{LEADER_UNIT}» — {len(to_)} ta, «{CELL_UNIT}» — "
            f"{len(home)} ta (bittadan kutilgan)")
        return out
    to_, home = to_[0], home[0]
    out["to"], out["cell_unit"] = to_.name, home.name

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
    if prof.manager_id not in (to_.id, home.id):
        out["problems"].append(
            f"profil {out['profile']} na «{to_.name}», na «{home.name}» "
            "bo'linmasida — boshqa joyga ko'chirilgan, taxmin qilinmadi")
        return out

    # His cells — reported, never written: they and their загрузка stay put.
    out["cells"] = [(c.verifix_code, c.manager_id == home.id)
                    for c in db.query(Cell).filter(Cell.leader_id == prof.id)
                    .order_by(Cell.verifix_code).all()]

    # ── 1. the profile, with the role rows that hold it ─────────────────────
    if prof.manager_id != to_.id:
        # THE holder lookup — it finds the rows by the profile's CURRENT unit, so
        # it runs before that unit changes. Lazily imported, like leader_auto's
        # `_build_dashboard`: a second spelling of "who holds this profile"
        # would drift from the one the Profiles tab uses.
        from app.routers.profiles import _bound_role_rows
        holders = _bound_role_rows(db, "leader", prof.id)
        for r in holders:
            r.role_id = to_.id
        prof.manager_id = to_.id
        out["profile_moved"], out["holders"] = True, len(holders)

    # ── 2. his days carrying another unit ───────────────────────────────────
    days = (db.query(LeaderTaskDay)
            .filter(LeaderTaskDay.leader_id == prof.id,
                    LeaderTaskDay.manager_id != to_.id)
            .order_by(LeaderTaskDay.date).all())
    if days:
        ids = [d.id for d in days]
        dates = sorted({d.date for d in days})
        refs = [leader_ai.bot_ref(e) for (e,) in
                db.query(LeaderTaskEntry.id)
                .filter(LeaderTaskEntry.day_id.in_(ids)).all()]

        def restamp(model, *conds) -> int:
            return (db.query(model)
                    .filter(or_(model.manager_id.is_(None),
                                model.manager_id != to_.id), *conds)
                    .update({model.manager_id: to_.id},
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
        closes: dict[str, datetime] = {}
        for d in days:
            d.manager_id = to_.id
            if d.closed_at and (d.date not in closes or d.closed_at > closes[d.date]):
                closes[d.date] = d.closed_at
        out["moved"] = dates
        out["side"] = {k: v for k, v in side.items() if v}

        # ── 3. her digests already sent for those dates ─────────────────────
        # The sweep re-sends a digest when a checklist of the unit-day closed
        # after it went out; days moved in closed at their own times, so they
        # would read as late filings and every one of those dates would go to
        # Aripova again at once. What was sent stays what was sent — the
        # table is taken to include them from here on.
        for led in (db.query(LeaderUnitReport)
                    .filter(LeaderUnitReport.manager_id == to_.id,
                            LeaderUnitReport.date.in_(list(closes)),
                            LeaderUnitReport.sends > 0).all()):
            c = closes.get(led.date)
            if c and (led.last_sent_at is None or c > led.last_sent_at):
                led.last_sent_at = c
                out["digests"] += 1

    # ── 4. a day filed through both doors ───────────────────────────────────
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
        return ("⚠️ Turdimurodov Nodirjon (/leaders) ko'chirilmadi — hech narsa "
                "yozilmadi.\n" + "\n".join(out["problems"]))
    lines = [f"🔧 Turdimurodov Nodirjon — endi «{out['to']}» lideri, bitta odam.",
             f"Lider profili {out['profile']} "
             + (f"«{out['to']}» bo'linmasiga o'tkazildi "
                f"(Telegram bog'lanishlari: {out['holders']})."
                if out["profile_moved"] else f"allaqachon «{out['to']}» bo'linmasida.")]
    if out["cells"]:
        lines.append("Yacheykasi zagruzka uchun joyida qoldi: " + ", ".join(
            code + (f" («{out['cell_unit']}»)" if here else " (boshqa bo'linmada!)")
            for code, here in out["cells"]) + ".")
    if out["moved"]:
        side = ", ".join(f"{_SIDE_UZ.get(k, k)}: {v}" for k, v in out["side"].items())
        lines.append(
            f"{len(out['moved'])} ta kuni «{out['to']}» bo'linmasiga ko'chirildi "
            f"({dm(out['moved'][0])} – {dm(out['moved'][-1])}"
            + (f"; {side}" if side else "") + ").")
    else:
        lines.append("Ko'chiriladigan kun yo'q edi.")
    if out["digests"]:
        lines.append(f"Aripova Manzuraga yuborilgan {out['digests']} ta kunlik "
                     "hisobot qayta yuborilmaydi — unga aytish sizning qaroringiz.")
    for d, f_pct, b_pct in out["sheet_days"]:
        lines.append(f"{dm(d)}: Form ({f_pct:.0f}%) va bot ({b_pct:.0f}%) ikkalasi "
                     "bor — hisobga Form olindi («Liderlar kunlik vazifalari»da "
                     "o'zgartirsa bo'ladi).")
    for d, f_pct, b_pct in out["bot_days_kept"]:
        lines.append(f"{dm(d)}: Form ({f_pct:.0f}%) va bot ({b_pct:.0f}%) — bot "
                     "hisobda qoldi.")
    lines.append("Ball, javob, rasm va AI xulosalari o'zgarmadi. Avto tekshiruvlar "
                 "(#1, #9) uning yacheykasi turgan bo'linmadan o'qiladi.")
    return "\n".join(lines)
