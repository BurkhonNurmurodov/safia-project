import logging
from datetime import datetime, timezone

from sqlalchemy.orm import Session
from app.models import (
    Manager, LeaderChecklist, QualityComplaint, QualitySyncMeta,
)
from app.services.leader_tasks import filed_date
from app.services.name_map import (
    rekey_sheet_eras, relabel_supervisor, supervisor_match,
)
from app.services.sheets_reader import read_leader_data, read_quality_data

log = logging.getLogger(__name__)


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

    # shortcut: the night re-date above read the shift of the unit the name
    # holds TODAY; every era so far is shift 1 on both sides — re-file before
    # matching if an era ever crosses shifts.
    rekey_sheet_eras(db)   # a unit's old brigadir's rows stay the unit's
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
