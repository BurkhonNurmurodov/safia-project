from sqlalchemy.orm import Session
from app.models import Manager, ProductionData, HeadcountData, DowntimeData, LeaderChecklist
from app.services.sheets_reader import (
    read_production_data, read_headcount_data, read_downtime_data, read_leader_data,
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
    manager_names = {m.name for m in managers}

    dt_total, dt_by_cat, cat_names = read_downtime_data(sheet_id, manager_names)

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
            ))
            count += 1

    db.commit()
    return {"managers_synced": len(dt_total), "downtime_rows": count, "categories": cat_names}


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
        ))
        count += 1

    db.commit()
    return {"leader_rows": count}
