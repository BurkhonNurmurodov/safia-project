from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.models import (
    Cell, CellPerenaladka, Manager, ProductionData, HeadcountData, DowntimeData,
    LeaderChecklist, QualityComplaint, QualitySyncMeta,
)
from app.services.name_map import sheet_alias_map
from app.services.sheets_reader import (
    read_production_data, read_headcount_data, read_downtime_data, read_leader_data,
    read_quality_data, read_cell_perenaladka,
)


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

    dt_total, dt_by_cat, dt_total_ns, dt_by_cat_ns, cat_names = read_downtime_data(sheet_id, manager_names)

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
    return {"managers_synced": len(dt_total), "downtime_rows": count, "categories": cat_names}


def sync_cell_perenaladka(sheet_id: str, db: Session) -> dict:
    """Import the shift report's per-cell «Переналадка» minutes into
    ``cell_perenaladka`` — the /idle-cell Perenaladka tab's historical data.

    Decisions (user, 2026-08-06): the sheet values ARE minutes; only the row of
    the brigadir who OWNS the cell counts (``Cell.manager_id``), a cell answered
    on someone else's row is ignored; and the sheet wins over anything entered
    on the page. NOT wipe-and-reload: a value > 0 upserts the (cell, date) row,
    an explicit 0 deletes it (0 is never stored in this table), a blank changes
    nothing — days/cells the sheet never answered keep their manual entries.
    An existing note survives an overwrite (the sheet has no note column)."""
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
    saved = cleared = 0
    for (cell_id, iso), minutes in final.items():
        p = existing.get((cell_id, iso))
        if minutes > 0:
            if p is not None and float(p.minutes or 0) == minutes:
                continue   # already this value — nothing to win
            if p is None:
                p = CellPerenaladka(cell_id=cell_id, date=iso)
                db.add(p)
            p.minutes = minutes
            p.entered_by_profile = "sheet-import"
            saved += 1
        elif p is not None:   # explicit 0 in the sheet clears the entry
            db.delete(p)
            cleared += 1
    db.commit()

    if unknown_codes:
        print(f"[sheets] shift report perenaladka: cell code(s) {sorted(unknown_codes)} "
              f"match no cells.verifix_code — their values are NOT imported")
    if foreign:
        print(f"[sheets] shift report perenaladka: {foreign} value(s) answered on a "
              f"non-owning brigadir's row — skipped (owning-brigadir rule)")

    return {
        "dates": len({iso for (_cid, iso) in final}),
        "cells": len({cid for (cid, _iso) in final}),
        "saved": saved,
        "cleared": cleared,
        "unknown_cells": sorted(unknown_codes),
    }


def sync_leaders_sheet(sheet_id: str, db: Session) -> dict:
    """Fetch leader checklist submissions from the leaders sheet and persist.
    Wipe-and-reload, mirroring the other source syncs."""
    rows = read_leader_data(sheet_id)

    db.query(LeaderChecklist).delete()

    count = 0
    for r in rows:
        db.add(LeaderChecklist(
            date=r["date"],
            supervisor=r["supervisor"],
            leader=r["leader"],
            completion=r["completion"],
            tasks=r["tasks"],
            submission_id=r["submission_id"],
            submitted_at=r["submitted_at"],
        ))
        count += 1

    db.commit()
    return {"leader_rows": count}


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
