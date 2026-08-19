import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.models import (
    Cell, CellPerenaladka, Manager, ProductionData, HeadcountData, DowntimeData,
    LeaderChecklist, QualityComplaint, QualitySyncMeta,
)
from app.services.leader_tasks import filed_date
from app.services.name_map import (
    relabel_supervisor, sheet_alias_map, supervisor_match,
)
from app.services.sheets_reader import (
    read_production_data, read_headcount_data, read_downtime_data, read_leader_data,
    read_quality_data, read_cell_perenaladka,
)

log = logging.getLogger(__name__)


def sync_source_sheet(sheet_id: str, db: Session) -> dict:
    """Fetch production + headcount from the source sheet and persist to DB."""
    plan_data, actual_data, dates = read_production_data(sheet_id)
    hc_data, _ = read_headcount_data(sheet_id)

    db.query(ProductionData).delete()
    db.query(HeadcountData).delete()

    prod_count = 0
    for name, date_vals in plan_data.items():
        for date_str, plan_val in date_vals.items():
            actual_val = actual_data.get(name, {}).get(date_str, 0.0)
            db.add(ProductionData(
                manager_name=name,
                date=date_str,
                prod_plan=plan_val,
                prod_actual=actual_val,
            ))
            prod_count += 1

    hc_count = 0
    for name, date_vals in hc_data.items():
        for date_str, hc_val in date_vals.items():
            db.add(HeadcountData(
                manager_name=name,
                date=date_str,
                official_hc=hc_val,
            ))
            hc_count += 1

    db.commit()
    return {"dates_synced": len(dates), "production_rows": prod_count, "headcount_rows": hc_count}


def sync_shift_report_sheet(sheet_id: str, db: Session) -> dict:
    """Fetch downtime from the shift report sheet and persist to DB."""
    managers = db.query(Manager).all()
    # The shift-report sheet spells brigadirs in either alphabet; read rows under
    # every known spelling (canonical + Cyrillic overrides). The read-side
    # endpoints resolve those spellings back to the canonical Manager.name.
    manager_names = set(sheet_alias_map(db, (m.name for m in managers)).keys())

    (dt_total, dt_by_cat, dt_total_ns, dt_by_cat_ns,
     cat_names, resubmitted) = read_downtime_data(sheet_id, manager_names)

    db.query(DowntimeData).delete()

    count = 0
    for name, date_vals in dt_total.items():
        for date_str, total in date_vals.items():
            by_cat = dt_by_cat.get(name, {}).get(date_str, {})
            db.add(DowntimeData(
                manager_name=name,
                date=date_str,
                total_minutes=total,
                by_category=by_cat,
                # Same sheet row, second column of each pair — the waits that did
                # not stop the cell (Ojidaniya's «To'xtamaganda» tab).
                total_minutes_ns=dt_total_ns.get(name, {}).get(date_str, 0.0),
                by_category_ns=dt_by_cat_ns.get(name, {}).get(date_str, {}),
            ))
            count += 1

    db.commit()
    # `resubmitted` = form rows the parser DISCARDED because a later filing for
    # the same (brigadir, date) replaced them. Reported so a refiled day showing
    # less waiting than the sheet's rows add up to has a stated reason.
    return {"managers_synced": len(dt_total), "downtime_rows": count,
            "categories": cat_names, "resubmitted": resubmitted}


def sync_cell_perenaladka(sheet_id: str, db: Session) -> dict:
    """Import the shift report's per-cell «Переналадка» minutes into
    ``cell_perenaladka`` — the changeover fact both the Setup-times «Fakt» tab
    and the Idle-cell «Perenaladka» tab read and write.

    Decisions (user, 2026-08-06): the sheet values ARE minutes; only the row of
    the brigadir who OWNS the cell counts (``Cell.manager_id``), a cell answered
    on someone else's row is ignored. NOT wipe-and-reload: a value > 0 upserts
    the (cell, date) row, an explicit 0 deletes it (0 is never stored in this
    table), a blank changes nothing — days/cells the sheet never answered keep
    their manual entries. An existing note survives an overwrite (the sheet has
    no note column).

    **A TYPED value now wins (user, 2026-08-17)**, reversing the original
    sheet-wins rule: the import may only overwrite or clear a row it wrote
    itself (``entered_by_profile == "sheet-import"``), so it fills GAPS and
    re-imports its own history. Since brigadirs and leaders enter the fact on
    the page themselves, sheet-wins meant one person's Refresh silently
    replaced another person's correction — with nothing on screen to say so.
    ``save_fact`` stamps the writer's profile key on every manual save, which
    is what makes the distinction reliable; a row with no writer at all is
    treated as typed (protected), because only these two paths ever write here
    and the import always stamps itself."""
    managers = db.query(Manager).all()
    alias = sheet_alias_map(db, (m.name for m in managers))
    by_canon = {m.name: m for m in managers}

    data = read_cell_perenaladka(sheet_id, set(alias.keys()))

    by_code = {c.verifix_code: c for c in db.query(Cell).all() if c.verifix_code}

    # Resolve one final value per (cell_id, date) under the owning-brigadir rule.
    final: dict[tuple[int, str], float] = {}
    unknown_codes: set[str] = set()
    foreign = 0
    for (iso, name), vals in data.items():
        mgr = by_canon.get(alias.get(name, ""))
        if mgr is None:
            continue
        for code, minutes in vals.items():
            c = by_code.get(code)
            if c is None:
                unknown_codes.add(code)
                continue
            if c.manager_id != mgr.id:
                foreign += 1
                continue
            final[(c.id, iso)] = minutes

    existing = {(p.cell_id, p.date): p for p in db.query(CellPerenaladka).all()}
    saved = cleared = kept = 0
    for (cell_id, iso), minutes in final.items():
        p = existing.get((cell_id, iso))
        # Typed rows are the operator's answer for that day — the sheet neither
        # overwrites nor clears them, it only fills what nobody has answered.
        if p is not None and p.entered_by_profile != "sheet-import":
            kept += 1
            continue
        if minutes > 0:
            if p is not None and float(p.minutes or 0) == minutes:
                continue   # already this value — nothing to win
            if p is None:
                p = CellPerenaladka(cell_id=cell_id, date=iso)
                db.add(p)
            p.minutes = minutes
            p.entered_by_profile = "sheet-import"
            saved += 1
        elif p is not None:   # explicit 0 in the sheet clears its own entry
            db.delete(p)
            cleared += 1
    db.commit()

    if unknown_codes:
        print(f"[sheets] shift report perenaladka: cell code(s) {sorted(unknown_codes)} "
              f"match no cells.verifix_code — their values are NOT imported")
    if foreign:
        print(f"[sheets] shift report perenaladka: {foreign} value(s) answered on a "
              f"non-owning brigadir's row — skipped (owning-brigadir rule)")
    if kept:
        print(f"[sheets] shift report perenaladka: {kept} cell-day(s) left alone — "
              f"entered on the page, and a typed value wins over the sheet")

    return {
        "dates": len({iso for (_cid, iso) in final}),
        "cells": len({cid for (cid, _iso) in final}),
        "saved": saved,
        "cleared": cleared,
        # Rows the sheet answered but did NOT touch because a person had typed
        # one — surfaced so the Refresh toast can say what it skipped.
        "kept": kept,
        "unknown_cells": sorted(unknown_codes),
    }


def sync_leaders_sheet(sheet_id: str, db: Session) -> dict:
    """Fetch leader checklist submissions from the leaders sheet and persist.
    Wipe-and-reload, mirroring the other source syncs.

    The one thing NOT taken verbatim from the sheet is a shift-2 row's date:
    the night shift files across midnight, so the form's own "today" stamp puts
    half of every night on the wrong day. `filed_date` re-attributes exactly
    those rows and leaves every other one alone. It is done at write time, not
    per read, because the stored date is the join key — `/api/leaders` dedupes
    a sheet row against the bot day for the same (leader, date), and the AI
    reviewer looks its source row up by date. A correction applied in one
    reader and not the others would just move the disagreement.
    """
    rows = read_leader_data(sheet_id)

    # Same resolution the dashboard does, for the same reason: the unit decides
    # the shift, and the shift decides where midnight falls. Relabel first —
    # some rows are tagged with a name that isn't the unit they belong to.
    sup = supervisor_match(
        db.query(Manager).all(),
        {relabel_supervisor(r["supervisor"]) for r in rows if r.get("supervisor")},
    )

    db.query(LeaderChecklist).delete()

    count = moved = 0
    for r in rows:
        shift = (sup.get(relabel_supervisor(r["supervisor"])) or {}).get("shift")
        date = filed_date(r["date"], shift, r["submitted_at"])
        if date != r["date"]:
            moved += 1
        db.add(LeaderChecklist(
            date=date,
            supervisor=r["supervisor"],
            leader=r["leader"],
            completion=r["completion"],
            tasks=r["tasks"],
            submission_id=r["submission_id"],
            submitted_at=r["submitted_at"],
        ))
        count += 1

    db.commit()
    if moved:
        log.info("leaders sync: %s night row(s) re-dated to the shift they "
                 "report on", moved)
    return {"leader_rows": count, "night_rows_redated": moved}


def sync_quality_sheet(sheet_id: str, db: Session) -> dict:
    """Fetch the quality register («для свода») and persist. Wipe-and-reload,
    mirroring the leaders sync — the sheet is the source of truth, rows there
    are edited in place (status flips from «Нет» to «Да» when the corrective
    action lands), so an append-only merge would leave stale copies behind."""
    rows = read_quality_data(sheet_id)

    db.query(QualityComplaint).delete()
    for r in rows:
        db.add(QualityComplaint(**r))

    meta = db.query(QualitySyncMeta).filter_by(id=1).first()
    if not meta:
        meta = QualitySyncMeta(id=1)
        db.add(meta)
    meta.last_synced = datetime.now(timezone.utc)
    meta.ok = True
    meta.message = None
    meta.row_count = len(rows)

    db.commit()
    return {"quality_rows": len(rows)}
