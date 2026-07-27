"""Shared logic for the in-bot leader daily checklist.

Used by both the bot flow (app/telegram_bot.py) and the API routers
(routers/leader_tasks.py, routers/leaders.py). The task catalog mirrors the
dashboard's historic 13 questions (Leaders.jsx TASK_DETAILS) and is seeded
lazily — no startup-mirror migration needed, the tables themselves come from
Base.metadata.create_all in both boot paths.
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.models import (
    AppSetting, LeaderTaskConfigAudit, LeaderTaskDef, LeaderTaskEntry,
    LeaderTaskLeaderSetting, LeaderTaskPendingChange, LeaderTaskSetting,
    Manager, RoleProfile,
)

CHANNEL_SETTING_KEY = "leader_tasks_channel"

_LANGS = ("uz", "uz_cyrl", "ru", "en")

# Tashkent has no DST; a fixed offset keeps the 09:00 boundary math trivial.
_TASHKENT = timezone(timedelta(hours=5))

# The historic 13 checklist questions, in sheet question order (index+1 = id).
# (name_uz, name_uz_cyrl, name_ru, name_en, note_uz, note_uz_cyrl, note_ru,
#  note_en, default_weight) — weights sum to 100.
_SEED = [
    ("Yacheykaning kunlik planini qayd qilish", "Ячейканинг кунлик планини қайд қилиш",
     "Фиксация ежедневной загрузки ячейки (план)", "Daily cell load fixation (plan)",
     "Foto hisobot", "Фото ҳисобот", "фотоотчет", "photo report", 10),
    ("Kaskad uchrashuv (ochilish – rejalashtirish)", "Каскад учрашув (очилиш – режалаштириш)",
     "Каскадная встреча (открытие - планерка)", "Cascade meeting (briefing)",
     "Foto hisobot. Zonalarni taqsimlash", "Фото ҳисобот. Зоналарни тақсимлаш",
     "Фотоотчет Распределение зон", "Photo report Zone distribution", 5),
    ("SOP standarti", "СОП стандарти", "СОП стандарт", "SOP Standard",
     "Foto hisobot. Qo'shni yacheykalarni qayd qilish", "Фото ҳисобот. Қўшни ячейкаларни қайд қилиш",
     "Фотоотчет Фиксация смежных ячеек", "Photo report adjacent cell fixation", 10),
    ("Obxod sexa (kuniga 3 marta)", "Обход цеха (кунига 3 марта)",
     "КРУ обход цеха (3 раза в день) (9:00 - 11:00 - 15:00)", "Workshop inspection (3x/day 9:00-11:00-15:00)",
     "Aylanib chiqish chek-listi", "Айланиб чиқиш чек-листи", "Чек лист обхода", "Inspection checklist", 15),
    ("Syryo qabul qilish (sovutgich, ombor)", "Сырьё қабул қилиш (совутгич, омбор)",
     "Прием сырья (холодильник, склад)", "Receiving raw materials",
     "Nazorat varaqasi", "Назорат варақаси", "Контрольный лист", "Control sheet", 5),
    ("O'z vaqtida yetkazib berishni nazorat qilish (ichki logistika)",
     "Ўз вақтида етказиб беришни назорат қилиш (ички логистика)",
     "Контроль своевременных поставок (внутреняя логистика)", "Internal logistics timing control",
     "Kirish taymingini qayd qilish", "Кириш таймингини қайд қилиш",
     "Фиксация Тайминга захода", "Arrival timing fixation", 5),
    ("Nazorat stendini to'ldirish (SAP)", "Назорат стендини тўлдириш (SAP)",
     "Заполнение контрольного стенда (САП)", "Control board filling (SAP)",
     "Foto hisobot", "Фото ҳисобот", "фотоотчет", "photo report", 5),
    ("Obespokoennosti kiritish", "Обеспокоенности киритиш",
     "Заполнение обеспокоенности", "Concern reporting",
     "Foto hisobot", "Фото ҳисобот", "фотоотчет", "photo report", 5),
    ("Smena davomida rejaning 50% ni qayd qilish", "Смена давомида режанинг 50% ни қайд қилиш",
     "Фиксация 50% плана в течении смены", "50% plan fixation during shift",
     "Brigadirga hisobot", "Бригадирга ҳисобот", "Отчет бригадиру", "Report to supervisor", 10),
    ("SAP rejasini yopish", "SAP режасини ёпиш", "Закрытие плана САП", "SAP plan closure",
     "Brigadir tasdig'i", "Бригадир тасдиғи", "Подтверждение бригадира", "Supervisor confirmation", 10),
    ("Ish jadvalini grafika tuzish", "Иш жадвалини графика тузиш",
     "Составление графика", "Scheduling",
     "Foto hisobot", "Фото ҳисобот", "Фотоотчет", "Photo report", 10),
    ("Zam lider ishini nazorat qilish", "Зам лидер ишини назорат қилиш",
     "Контроль работы зам лидера", "Assistant leader work control",
     "Chek-list foto hisoboti", "Чек-лист фото ҳисоботи",
     "Фотоотчет чек листа", "Checklist photo report", 5),
    ("Liderning smena hisoboti", "Лидернинг смена отчёти",
     "Сменный отчёт лидера", "Leader's shift report",
     "Foto hisobot", "Фото ҳисобот", "фотоотчет", "photo report", 5),
]


def ensure_task_defs(db: Session) -> list[LeaderTaskDef]:
    """Return the catalog, seeding it on first touch."""
    defs = db.query(LeaderTaskDef).order_by(LeaderTaskDef.id).all()
    if defs:
        return defs
    for i, row in enumerate(_SEED, start=1):
        db.add(LeaderTaskDef(
            id=i,
            name_uz=row[0], name_uz_cyrl=row[1], name_ru=row[2], name_en=row[3],
            note_uz=row[4], note_uz_cyrl=row[5], note_ru=row[6], note_en=row[7],
            default_weight=row[8],
        ))
    db.commit()
    return db.query(LeaderTaskDef).order_by(LeaderTaskDef.id).all()


def task_name(td: LeaderTaskDef, lang: str) -> str:
    return {
        "uz": td.name_uz, "uz_cyrl": td.name_uz_cyrl,
        "ru": td.name_ru, "en": td.name_en,
    }.get(lang) or td.name_uz


def _row_names(row) -> dict[str, str | None]:
    """The per-language name_* columns of a settings row as a dict."""
    return {l: getattr(row, f"name_{l}") for l in _LANGS}


def config_name(entry: dict, lang: str) -> str:
    """Display name out of an effective-config entry's resolved `names`."""
    names = entry.get("names") or {}
    return names.get(lang) or names.get("uz") or ""


def effective_settings(db: Session, manager_id: int) -> dict[int, dict]:
    """task_id → {enabled, min_media, weight, names} for one supervisor:
    explicit rows over virtual defaults (enabled, 1 photo, the seeded weight).
    `names` are the RAW per-supervisor rename overrides (None = the global
    LeaderTaskDef name) — the admin matrix needs the raw layer to show
    divergence, so resolution stays with the caller."""
    defs = ensure_task_defs(db)
    rows = {
        s.task_id: s
        for s in db.query(LeaderTaskSetting).filter_by(manager_id=manager_id).all()
    }
    out = {}
    for td in defs:
        s = rows.get(td.id)
        out[td.id] = {
            "enabled": s.enabled if s else True,
            "min_media": s.min_media if s else 1,
            "weight": s.weight if s else td.default_weight,
            "names": _row_names(s) if s else {l: None for l in _LANGS},
        }
    return out


def leader_overrides(db: Session, leader_ids: list[int]) -> dict[int, dict[int, dict]]:
    """leader_id → task_id → RAW override {enabled, min_media, weight, names}
    (every field nullable; absent task = full inherit). Sparse — only stored
    rows are returned."""
    out: dict[int, dict[int, dict]] = {}
    if not leader_ids:
        return out
    rows = (
        db.query(LeaderTaskLeaderSetting)
        .filter(LeaderTaskLeaderSetting.leader_id.in_(leader_ids))
        .all()
    )
    for r in rows:
        out.setdefault(r.leader_id, {})[r.task_id] = {
            "enabled": r.enabled,
            "min_media": r.min_media,
            "weight": r.weight,
            "names": _row_names(r),
        }
    return out


def effective_leader_config(db: Session, prof) -> dict[int, dict]:
    """task_id → {enabled, min_media, weight, names} fully RESOLVED for one
    leader (RoleProfile): global catalog → supervisor override → leader
    override, field by field. `names` here are the final display names per
    language. This is what the bot's /tasks flow and day scoring run on."""
    defs = ensure_task_defs(db)
    sup = {
        s.task_id: s
        for s in db.query(LeaderTaskSetting)
        .filter_by(manager_id=prof.manager_id).all()
    } if prof.manager_id else {}
    own = {
        r.task_id: r
        for r in db.query(LeaderTaskLeaderSetting)
        .filter_by(leader_id=prof.id).all()
    }
    out = {}
    for td in defs:
        s, r = sup.get(td.id), own.get(td.id)
        enabled = s.enabled if s else True
        min_media = s.min_media if s else 1
        weight = s.weight if s else td.default_weight
        if r:
            enabled = r.enabled if r.enabled is not None else enabled
            min_media = r.min_media if r.min_media is not None else min_media
            weight = r.weight if r.weight is not None else weight
        names = {}
        for l in _LANGS:
            names[l] = (
                (getattr(r, f"name_{l}", None) if r else None)
                or (getattr(s, f"name_{l}", None) if s else None)
                or getattr(td, f"name_{l}")
            )
        out[td.id] = {
            "enabled": enabled, "min_media": min_media,
            "weight": weight, "names": names,
        }
    return out


def effective_date(shift: int | None = None, now: datetime | None = None) -> str:
    """ISO date of the checklist day, per the leader's shift (Tashkent time):

    * shift 1 (or unknown): the plain calendar day, 00:00 → 23:59.
    * shift 2: the day runs 17:00 → 16:59 next morning, so anything before
      17:00 belongs to the previous date (the night shift stays on its
      starting date).
    """
    now = (now or datetime.now(timezone.utc)).astimezone(_TASHKENT)
    if shift == 2 and now.hour < 17:
        now -= timedelta(days=1)
    return now.strftime("%Y-%m-%d")


def compute_completion(settings: dict[int, dict], entries: list[LeaderTaskEntry]) -> float:
    """Weighted score over the ENABLED tasks: done earns its weight, not-done
    and unanswered earn 0."""
    enabled = {tid: s for tid, s in settings.items() if s["enabled"]}
    total = sum(s["weight"] for s in enabled.values())
    if total <= 0:
        return 0.0
    done = sum(
        enabled[e.task_id]["weight"]
        for e in entries
        if e.done and e.task_id in enabled
    )
    return round(done / total * 100, 2)


def channel_chat_id(db: Session) -> str | None:
    row = db.query(AppSetting).filter_by(key=CHANNEL_SETTING_KEY).first()
    return row.value.strip() if row and row.value and row.value.strip() else None


# ── Config writes: shared apply layer ─────────────────────────────────────────
# The live config tables always mean "in effect right now". Both the live admin
# endpoints (apply now) and the promotion of a staged change replay the SAME
# apply_* functions below, so a scheduled edit can never behave differently from
# an immediate one. None of these commit — the caller owns the transaction.

def _clamp_m(v: int) -> int:
    return max(0, min(20, int(v)))


def _clamp_w(v: int) -> int:
    return max(0, min(100, int(v)))


def apply_supervisor_cell(db: Session, manager_id: int, task_id: int, enabled: bool,
                          min_media: int, weight: int, names: dict | None) -> None:
    row = (db.query(LeaderTaskSetting)
           .filter_by(manager_id=manager_id, task_id=task_id).first())
    if not row:
        row = LeaderTaskSetting(manager_id=manager_id, task_id=task_id)
        db.add(row)
    row.enabled, row.min_media, row.weight = bool(enabled), _clamp_m(min_media), _clamp_w(weight)
    if names is not None:
        for l in _LANGS:
            setattr(row, f"name_{l}", (names.get(l) or "").strip() or None)


def apply_supervisor_batch(db: Session, manager_id: int, cells: list[dict]) -> None:
    for c in cells:
        apply_supervisor_cell(db, manager_id, int(c["task_id"]), c["enabled"],
                              c["min_media"], c["weight"], c.get("names"))


def apply_leader_cell(db: Session, leader_id: int, task_id: int, enabled=None,
                      min_media=None, weight=None, names=None, reset=False) -> None:
    row = (db.query(LeaderTaskLeaderSetting)
           .filter_by(leader_id=leader_id, task_id=task_id).first())
    if names is not None:
        nm = {l: (names.get(l) or "").strip() or None for l in _LANGS}
    elif row:
        nm = {l: getattr(row, f"name_{l}") for l in _LANGS}
    else:
        nm = {l: None for l in _LANGS}
    all_inherit = (enabled is None and min_media is None and weight is None
                   and not any(nm.values()))
    if reset or all_inherit:
        if row:
            db.delete(row)
        return
    if not row:
        row = LeaderTaskLeaderSetting(leader_id=leader_id, task_id=task_id)
        db.add(row)
    row.enabled = enabled
    row.min_media = None if min_media is None else _clamp_m(min_media)
    row.weight = None if weight is None else _clamp_w(weight)
    for l in _LANGS:
        setattr(row, f"name_{l}", nm[l])


def apply_global_task(db: Session, task_id: int, names=None, note=None,
                      default_weight=None) -> None:
    td = db.query(LeaderTaskDef).filter_by(id=task_id).first()
    if not td:
        raise KeyError(f"task {task_id}")
    if names:  # global names are NOT NULL — only a non-empty value overwrites
        for l in _LANGS:
            v = (names.get(l) or "").strip()
            if v:
                setattr(td, f"name_{l}", v)
    if note is not None:
        for l in _LANGS:
            setattr(td, f"note_{l}", (note.get(l) or "").strip() or None)
    if default_weight is not None:
        td.default_weight = _clamp_w(default_weight)


def _apply(db: Session, kind: str, payload: dict) -> None:
    if kind == "supervisor":
        apply_supervisor_batch(db, int(payload["manager_id"]), payload["cells"])
    elif kind == "leader":
        apply_leader_cell(
            db, int(payload["leader_id"]), int(payload["task_id"]),
            enabled=payload.get("enabled"), min_media=payload.get("min_media"),
            weight=payload.get("weight"), names=payload.get("names"),
            reset=bool(payload.get("reset")),
        )
    elif kind == "global_task":
        apply_global_task(db, int(payload["task_id"]), payload.get("names"),
                          payload.get("note"), payload.get("default_weight"))
    else:
        raise ValueError(f"unknown change kind {kind!r}")


# ── Snapshots: payload-shaped "before" state (for audit + revert) ──────────────

def _snapshot(db: Session, kind: str, payload: dict) -> dict:
    if kind == "supervisor":
        mid = int(payload["manager_id"])
        eff = effective_settings(db, mid)
        cells = []
        for c in payload["cells"]:
            tid = int(c["task_id"])
            s = eff.get(tid, {})
            cells.append({
                "task_id": tid,
                "enabled": s.get("enabled", True),
                "min_media": s.get("min_media", 1),
                "weight": s.get("weight", 0),
                "names": s.get("names") or {l: None for l in _LANGS},
            })
        return {"manager_id": mid, "cells": cells}
    if kind == "leader":
        lid, tid = int(payload["leader_id"]), int(payload["task_id"])
        row = (db.query(LeaderTaskLeaderSetting)
               .filter_by(leader_id=lid, task_id=tid).first())
        if not row:
            return {"leader_id": lid, "task_id": tid, "enabled": None,
                    "min_media": None, "weight": None, "names": None, "reset": True}
        return {
            "leader_id": lid, "task_id": tid, "enabled": row.enabled,
            "min_media": row.min_media, "weight": row.weight,
            "names": _row_names(row), "reset": False,
        }
    if kind == "global_task":
        tid = int(payload["task_id"])
        td = db.query(LeaderTaskDef).filter_by(id=tid).first()
        if not td:
            return {"task_id": tid}
        return {
            "task_id": tid,
            "names": {l: getattr(td, f"name_{l}") for l in _LANGS},
            "note": {l: getattr(td, f"note_{l}") for l in _LANGS},
            "default_weight": td.default_weight,
        }
    return {}


def _target(kind: str, payload: dict) -> tuple[int | None, int | None, int | None]:
    """(task_id, manager_id, leader_id) identity of a change's target."""
    if kind == "supervisor":
        return None, int(payload["manager_id"]), None
    if kind == "leader":
        return int(payload["task_id"]), None, int(payload["leader_id"])
    return int(payload["task_id"]), None, None  # global_task


def _shift_for(db: Session, kind: str, payload: dict) -> int | None:
    """Which day boundary a change flips at: the target unit's shift (1/2), or
    None for a shift-agnostic global_task edit (cosmetic / rarely-governing)."""
    if kind == "supervisor":
        m = db.query(Manager).filter_by(id=int(payload["manager_id"])).first()
        return m.shift if (m and m.shift in (1, 2)) else 1
    if kind == "leader":
        p = db.query(RoleProfile).filter_by(id=int(payload["leader_id"])).first()
        if p and p.manager_id:
            m = db.query(Manager).filter_by(id=p.manager_id).first()
            return m.shift if (m and m.shift in (1, 2)) else 1
        return 1
    return None  # global_task


def _target_exists(db: Session, kind: str, payload: dict) -> bool:
    if kind == "supervisor":
        return bool(db.query(Manager).filter_by(id=int(payload["manager_id"])).first())
    if kind == "leader":
        return bool(db.query(RoleProfile)
                    .filter_by(id=int(payload["leader_id"]), role="leader").first())
    return bool(db.query(LeaderTaskDef).filter_by(id=int(payload["task_id"])).first())


def _delete_pending_target(db: Session, kind: str, tid, mid, lid) -> int:
    """Drop any pending change already staged for this exact target (one pending
    change per target). Returns how many were removed."""
    q = db.query(LeaderTaskPendingChange).filter_by(kind=kind)
    if kind == "supervisor":
        q = q.filter_by(manager_id=mid)
    elif kind == "leader":
        q = q.filter_by(leader_id=lid, task_id=tid)
    else:
        q = q.filter_by(task_id=tid)
    rows = q.all()
    for r in rows:
        db.delete(r)
    return len(rows)


def _audit(db, action, kind, tid, mid, lid, eff=None, before=None, after=None, actor=None):
    db.add(LeaderTaskConfigAudit(
        action=action, kind=kind, task_id=tid, manager_id=mid, leader_id=lid,
        effective_date=eff, before=before, after=after, actor=actor,
    ))


def next_effective_date(shift: int | None) -> str:
    """The checklist date AFTER the current one for this shift — i.e. what
    "apply from next day" resolves to. Global (shift None) uses the calendar
    next day."""
    cur = effective_date(shift if shift in (1, 2) else 1)
    nxt = datetime.strptime(cur, "%Y-%m-%d") + timedelta(days=1)
    return nxt.strftime("%Y-%m-%d")


# ── Config writes: apply-now / stage / promote / cancel / revert ──────────────

def apply_now(db: Session, kind: str, payload: dict, actor: str | None) -> dict:
    """Write a config change to the live tables immediately. Cancels any pending
    change already staged for the same target (it would otherwise re-apply the
    old edit at the boundary)."""
    tid, mid, lid = _target(kind, payload)
    before = _snapshot(db, kind, payload)
    _apply(db, kind, payload)
    superseded = _delete_pending_target(db, kind, tid, mid, lid)
    if superseded:
        _audit(db, "superseded", kind, tid, mid, lid, actor=actor)
    _audit(db, "applied", kind, tid, mid, lid, before=before, after=payload, actor=actor)
    db.commit()
    return {"ok": True, "applied": "now"}


def stage_change(db: Session, kind: str, payload: dict, actor: str | None) -> dict:
    """Queue a config change to take effect from the next checklist day for its
    target's shift. Replaces any change already staged for the same target."""
    shift = _shift_for(db, kind, payload)
    eff = next_effective_date(shift)
    tid, mid, lid = _target(kind, payload)
    _delete_pending_target(db, kind, tid, mid, lid)
    db.add(LeaderTaskPendingChange(
        kind=kind, task_id=tid, manager_id=mid, leader_id=lid, shift=shift,
        effective_date=eff, payload=payload, created_by=actor,
    ))
    _audit(db, "scheduled", kind, tid, mid, lid, eff=eff, after=payload, actor=actor)
    db.commit()
    return {"ok": True, "applied": "next_day", "effective_date": eff, "shift": shift}


def write_change(db: Session, kind: str, payload: dict, when: str, actor: str | None) -> dict:
    """Entry point for a config write: when='now' | 'next_day'."""
    return (stage_change if when == "next_day" else apply_now)(db, kind, payload, actor)


def promote_due(db: Session, shift: int, today: str) -> int:
    """Apply every staged change now due for a leader on this shift/date. Lazy:
    called by the first bot request that observes the new date (there is no
    scheduler). Row-locked with SKIP LOCKED so concurrent Passenger workers
    promote each change exactly once. A shift-agnostic (global_task) change is
    due for either shift's crossing."""
    rows = (
        db.query(LeaderTaskPendingChange)
        .filter(LeaderTaskPendingChange.effective_date <= today,
                or_(LeaderTaskPendingChange.shift == shift,
                    LeaderTaskPendingChange.shift.is_(None)))
        .order_by(LeaderTaskPendingChange.effective_date,
                  LeaderTaskPendingChange.created_at)
        .with_for_update(skip_locked=True)
        .all()
    )
    if not rows:
        return 0
    done = 0
    for pc in rows:
        tid, mid, lid = pc.task_id, pc.manager_id, pc.leader_id
        if not _target_exists(db, pc.kind, pc.payload):
            _audit(db, "failed", pc.kind, tid, mid, lid,
                   eff=pc.effective_date, after=pc.payload, actor=pc.created_by)
            db.delete(pc)
            continue
        before = _snapshot(db, pc.kind, pc.payload)
        sp = db.begin_nested()
        try:
            _apply(db, pc.kind, pc.payload)
            db.flush()
            sp.commit()
        except Exception:
            sp.rollback()
            _audit(db, "failed", pc.kind, tid, mid, lid,
                   eff=pc.effective_date, after=pc.payload, actor=pc.created_by)
            db.delete(pc)
            continue
        _audit(db, "applied", pc.kind, tid, mid, lid, eff=pc.effective_date,
               before=before, after=pc.payload, actor=pc.created_by)
        db.delete(pc)
        done += 1
    db.commit()
    return done


def promote_all_shifts(db: Session) -> int:
    """Promote everything due across both shifts — used by the admin config GET
    so the matrix never shows an un-promoted-but-due state."""
    return promote_due(db, 1, effective_date(1)) + promote_due(db, 2, effective_date(2))


def cancel_pending(db: Session, pending_id: int, actor: str | None) -> bool:
    pc = db.query(LeaderTaskPendingChange).filter_by(id=pending_id).first()
    if not pc:
        return False
    _audit(db, "cancelled", pc.kind, pc.task_id, pc.manager_id, pc.leader_id,
           eff=pc.effective_date, before=pc.payload, actor=actor)
    db.delete(pc)
    db.commit()
    return True


def revert_audit(db: Session, audit_id: int, actor: str | None) -> bool:
    """Restore the `before` state captured by a prior audited change, applied
    immediately (its `before` is already payload-shaped)."""
    a = db.query(LeaderTaskConfigAudit).filter_by(id=audit_id).first()
    if not a or a.before is None:
        return False
    if not _target_exists(db, a.kind, a.before):
        return False
    tid, mid, lid = _target(a.kind, a.before)
    now_before = _snapshot(db, a.kind, a.before)
    _apply(db, a.kind, a.before)
    _delete_pending_target(db, a.kind, tid, mid, lid)
    _audit(db, "reverted", a.kind, tid, mid, lid, before=now_before, after=a.before, actor=actor)
    db.commit()
    return True


def pending_list(db: Session) -> list[dict]:
    rows = (db.query(LeaderTaskPendingChange)
            .order_by(LeaderTaskPendingChange.effective_date,
                      LeaderTaskPendingChange.created_at).all())
    return [{
        "id": pc.id, "kind": pc.kind, "task_id": pc.task_id,
        "manager_id": pc.manager_id, "leader_id": pc.leader_id, "shift": pc.shift,
        "effective_date": pc.effective_date, "payload": pc.payload,
        "created_by": pc.created_by,
        "created_at": pc.created_at.isoformat() if pc.created_at else None,
    } for pc in rows]


def audit_list(db: Session, limit: int = 200) -> list[dict]:
    rows = (db.query(LeaderTaskConfigAudit)
            .order_by(LeaderTaskConfigAudit.ts.desc(),
                      LeaderTaskConfigAudit.id.desc())
            .limit(limit).all())
    return [{
        "id": a.id, "ts": a.ts.isoformat() if a.ts else None, "actor": a.actor,
        "action": a.action, "kind": a.kind, "task_id": a.task_id,
        "manager_id": a.manager_id, "leader_id": a.leader_id,
        "effective_date": a.effective_date,
        "before": a.before, "after": a.after,
        "revertible": a.before is not None
        and a.action in ("applied", "reverted", "superseded"),
    } for a in rows]
