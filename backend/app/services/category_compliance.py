"""«Toifaga muvofiqlik» — the leaders' category-compliance KPI. THE rule.

The 4th of HR's five leader KPIs («Соответствие категории», weight 0.2 in HR's
July 2026 file). HR's own description: the share of a cell's workers whose
Verifix CATEGORY («разряд» — Стажёр · Младший · Специалист · Старший · Ведущий …)
is the one they are due. What they are due is written in HR's grade ladder
(«тарифная сетка», the PDF of 2026-10-18): per JOB, a category per band of
TENURE, each band naming the month it starts. Verifix is where the categories
are kept — the hiring journal names the category a person starts on, the
rank-change journal every later grant, the transfer journal the cell and job
they moved to — so the KPI is computed from those three journals and the
ladder, month by month, with nothing typed by hand:

    tenure    = whole months from the hire month to the report month
    expected  = the ladder's highest step whose start month ≤ tenure
                (the lowest step applies from month 0, even where the sheet
                says 1)
    complies  = the category in force on the month's last day is the expected
                one, or a HIGHER step of the same ladder («at_least», the
                default — a person promoted early is not a fault; «exact» is
                the rule's other mode)
    rate      = compliant ÷ counted, per cell, one decimal, judged as printed
    score     = 100 % → 5 · > 70 % → 3 · > 65 % → 2 · else 1   (HR's IFS;
                it names no band for 0 %, so 0 % takes the worst)
    points    = score × 0.2

* **Counted** = everybody WORKING in the cell on the month's last day whose job
  has a ladder and whose hire date is known. A job the ladder does not name
  (office and HR titles, «Практикант») is out of the count and LISTED; a
  person with NO category, or still on one of the old «S…» grades, is counted
  as NOT compliant (`no_category: "fail"`; `"skip"` leaves them out).
* **Who works where** is the turnover KPI's directory (`turnover_people`, the
  nightly Verifix read): hired by the last day and not dismissed by it. On a
  day that has not passed the person stands where the directory puts them
  now; on a PAST day they stand where the last hiring / transfer dated by
  then put them (the journals are the only placement history Verifix has),
  the directory only where no such line exists.
* **The KPI is the CELL's, credited to its OWNER** («Egasi», `cells.owner_id`)
  on the month's last day — `turnover.cell_map` + `turnover.owned`, the very
  reading /turnover, /worker-concerns and /foreign-objects list by, so for one
  month the four KPI pages name the same owners and the same cells. One ranking
  row per OWNED cell; a cell with no owner is a notice; a cell with nobody
  counted has no rate and no score.
* **Nothing is frozen.** The journals are a dated log the read reloads whole,
  so a month is re-read from them as they stand now (a category entered late
  moves its month on the next read). Before `LINKS_FROM` (the dated cell
  links, 2026-10-12) the owner map has no history — `approx_owners`.
* **HR's July figures are NOT reproduced by this rule** — nor by any reading
  of the journals tried (26 of 87 comparable cells at best): the file's
  percentages were typed by hand and three of its cells contradict the
  record outright. The ladder is the one definition that is written down, so
  the platform computes THAT and says so; HR's answers on four points
  (at-least or exact · how tenure is counted · the two jobs the ladder lists
  twice, for production and for logistics · what July counted) are open and
  each is a line of the rule, never of the code.
* **The rule is admin-editable** (`category_rule` in app_settings, the shape of
  `turnover_rule`): weight, mode, bands, the level order, the ladder itself
  (categories and months — never pay) and the Verifix-job → ladder map. A
  malformed override can never blank a score: a part that fails validation
  falls back to the default whole.
"""
from __future__ import annotations

import json
import re
import threading
from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any, Iterable, Optional

from sqlalchemy.orm import Session

from app.models import AppSetting, CategoryEvent, CategoryRead, TurnoverPerson
from app.services import turnover as tv
from app.services import verifix

LINKS_FROM = date(2026, 10, 12)   # the dated cell links begin here (cell_links)
RULE_KEY = "category_rule"
READ_STALE = timedelta(minutes=20)

# ── HR's grade ladder (categories and months ONLY — the sheet's pay columns
# are never read into the platform) ──────────────────────────────────────────
LADDERS: dict[str, list[tuple[str, int]]] = {
    "Бариста /Заготовитель продуктов и сырья": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24), ("Ведущий Бариста /Заготовитель продуктов и сырья 1 разряда", 36)],
    "Бригадир АХО 9 час": [("Младший", 0), ("Специалист", 13), ("Старший", 25)],
    "Бригадир производства": [("Младший", 0), ("Специалист", 13), ("Старший", 25)],
    "Вагонетчик грузчик": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Вагонетчик/отправка": [("Младший", 1), ("Специалист", 7), ("Старший", 13)],
    "Водитель грузового": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Водитель легкового": [("Младший", 1), ("Специалист", 7)],
    "Водитель погрузчика": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Грузчик/Экспедитор": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Диспетчер": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Заготовитель продуктов и сырья": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Инженер по качеству": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Кондитер": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий кондитер 1 категории", 24), ("Ведущий кондитер 2 категории", 36), ("Шеф кондитер", 48)],
    "Кондитер/блинчик-горячий": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24), ("Шеф кондитер", 36)],
    "Кондитер/Цех приготовления кремов": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24), ("Шеф кондитер", 36)],
    "Кондитер/Цех приготовления теста": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24), ("Шеф кондитер", 36)],
    "Кондитер поденная": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий кондитер 1 категории", 24), ("Ведущий кондитер 2 категории", 36), ("Шеф кондитер", 48)],
    "Контролер качества": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Лидер АХО 8 час": [("Младший", 0), ("Специалист", 13), ("Старший", 24)],
    "Лидер АХО 9 час": [("Младший", 0), ("Специалист", 13), ("Старший", 24)],
    "Лидер Производства 8 час": [("Младший", 0), ("Специалист", 13), ("Старший", 24)],
    "Лидер Производства 9 час": [("Младший", 0), ("Специалист", 13), ("Старший", 24)],
    "Лидер/отправка 8 час": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Лидер/отправка 9 час": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Маркировщик": [("Младший", 0), ("Специалист", 7), ("Старший", 13)],
    "Механик, Мастер по ремонту, Плотник, Слесарь-сантехник, Электрик, Электрогазосварщик": [("Младший", 0), ("Специалист", 7), ("Старший", 12)],
    "Мойщик посуды 8 час": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 25)],
    "Мойщик посуды 9 час": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 25)],
    "Мойщик/Уборка поденная": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 25)],
    "Оператор 8 час логистика": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Оператор 8 час производства": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Оператор 9 час логистика": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Оператор 9 час производства": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Оператор санитарного контроля": [("Стажёр", 0), ("Младший", 2), ("Старший", 7)],
    "Оператор склада производства 12 час": [("Младший", 0), ("Специалист", 7), ("Старший", 13), ("Ведущий", 25)],
    "Охранник": [("Стажёр", 0), ("1 категория", 7), ("2 категория", 13), ("3 категория", 24)],
    "Пекарь": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24), ("Шеф пекарь", 36)],
    "Повар": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24), ("Су шеф", 36)],
    "Приемщик-отправитель 8 час логистика": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Приемщик-отправитель 9 час логистика": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Приемщик-отправитель 9 час производства": [("Стажёр", 0), ("Младший", 2), ("Специалист", 13), ("Старший", 24), ("Ведущий", 36)],
    "Просевальщик": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Скульптор": [("Стажёр", 0), ("Младший", 13), ("Специалист", 24), ("Старший", 36)],
    "Снабженец 8 час логистика": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Снабженец поденная": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Снабженец 9 час логистика": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Снабженец производства 8 час": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Снабженец производства 9 час": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Снабженец производства 9 час поденная": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Специалист по качеству": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Специалист по отгрузке": [("Младший", 1), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Уборщик производственных помещений 8 час": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 25)],
    "Уборщик производственных помещений 9 час": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 25)],
    "Уборщик служебных помещений 8 час": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 25)],
    "Уборщик территорий 9 час": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 25)],
    "Фасовщик": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий", 24)],
    "Холодильщик/морозильщик пищевой продукции": [("Стажёр", 0), ("Младший", 2), ("Специалист", 7), ("Старший", 13), ("Ведущий 1 категория морозилка", 24), ("Ведущий 2 категория морозилка", 36)],
    "Ассистент по техническим картам": [("Младший", 0), ("Специалист", 2), ("Старший", 13)],
    "Ассистент разработчика": [("Стажёр", 0), ("Младший", 7), ("Специалист", 13)],
    "Бухгалтер калькулятор": [("Младший", 0), ("Специалист", 4), ("Старший", 13)],
    "Менеджер проектов R&D": [("Младший", 0), ("Специалист", 13)],
    "Организатор дегустации": [("Стажёр", 0), ("Младший", 4), ("Специалист", 13), ("Старший", 24)],
    "Разработчик": [("Стажёр", 0), ("Специалист", 4)],
    "Специалист по внедрению": [("Стажёр", 0), ("Младший", 2), ("Специалист", 13), ("Ведущий", 24)],
    "Специалист проектов": [("Стажёр", 0), ("Младший", 7), ("Специалист", 13), ("Ведущий", 24)],
    "Технолог": [("Стажёр", 0), ("Младший", 4), ("Специалист", 13), ("Старший", 24), ("Ведущий", 36)],
    "Технолог аудитор": [("Стажёр", 0), ("Младший", 7), ("Специалист", 13), ("Ведущий", 24)],
    "Начальник смены": [("Начальник смены 1 категория", 12), ("Начальник смены 2 категория", 12), ("Начальник смены 3 категория", 24)],
    "Производственный аналитик": [("Младший", 1), ("Специалист", 3), ("Старший", 12)],
    "Специаплист отдела планирования": [("Младший", 1), ("Специалист", 4), ("Старший", 12)],
    "Парковщик": [("Стажёр", 0), ("Младший", 2), ("Специалист", 12), ("Старший", 24)],
    "Кондитер/нарезка тортов": [("Стажёр", 0), ("Младший", 1), ("Специалист", 6), ("Старший", 12), ("Ведущий", 24), ("Шеф кондитер", 36)],
}

# Verifix's job title → the ladder it is read against. A title that IS a ladder
# name needs no entry (the identity is tried after the map). Titles with no
# ladder at all — office and HR jobs, «Практикант» — are out of the count.
JOBS: dict[str, str] = {
    "Кондитер": "Кондитер",
    "Снабженец": "Снабженец 8 час логистика",
    "Лидер": "Лидер Производства 8 час",
    "Мойщик посуды": "Мойщик посуды 8 час",
    "Холодильщик пищевой продукции": "Холодильщик/морозильщик пищевой продукции",
    "Приемщик-отправитель": "Приемщик-отправитель 9 час производства",
    "Уборщик производственных помещений": "Уборщик производственных помещений 8 час",
    "Лидер АХО": "Лидер АХО 8 час",
    "Просеивальщик": "Просевальщик",
    "Оператор": "Оператор 8 час производства",
    "Водитель погрузчик": "Водитель погрузчика",
    "Лидер/отправка": "Лидер/отправка 8 час",
    "Уборщик территорий": "Уборщик территорий 9 час",
    "Уборщик служебных помещений": "Уборщик служебных помещений 8 час",
    "Бригадир": "Бригадир производства",
    "Бригадир АХО": "Бригадир АХО 9 час",
    "Вагонетчик/грузчик": "Вагонетчик грузчик",
    "Оператор производственного оборудования": "Оператор 8 час производства",
    "Оператор склада": "Оператор склада производства 12 час",
    "Механик": "Механик, Мастер по ремонту, Плотник, Слесарь-сантехник, Электрик, Электрогазосварщик",
    "Мастер по ремонту": "Механик, Мастер по ремонту, Плотник, Слесарь-сантехник, Электрик, Электрогазосварщик",
    "Плотник": "Механик, Мастер по ремонту, Плотник, Слесарь-сантехник, Электрик, Электрогазосварщик",
    "Слесарь-сантехник": "Механик, Мастер по ремонту, Плотник, Слесарь-сантехник, Электрик, Электрогазосварщик",
    "Электрик": "Механик, Мастер по ремонту, Плотник, Слесарь-сантехник, Электрик, Электрогазосварщик",
    "Электрогазосварщик": "Механик, Мастер по ремонту, Плотник, Слесарь-сантехник, Электрик, Электрогазосварщик",
}

# Verifix titles the sheet lists under TWO ladders (production · logistics)
# with different months: read against the production one until HR says
# otherwise; the people it reaches are named on the payload.
AMBIGUOUS: dict[str, list[str]] = {
    "Приемщик-отправитель": ["Приемщик-отправитель 9 час производства", "Приемщик-отправитель 8 час логистика"],
    "Оператор": ["Оператор 8 час производства", "Оператор 8 час логистика"],
}

# The order of the steps, so «at least the expected step» can be answered
# across the names one ladder uses for one level. A name absent here is
# compared by equality only.
LEVELS: dict[str, int] = {
    "Стажёр": 0, "Младший": 1,
    "1 категория": 2, "Специалист": 2,
    "2 категория": 3, "Старший": 3, "Старший смены/Охраны": 3,
    "3 категория": 4, "Ведущий": 4, "Ведущий кондитер 1 категории": 4, "Ведущий 1 категория морозилка": 4,
    "Ведущий кондитер 2 категории": 5, "Ведущий 2 категория морозилка": 5, "Су шеф": 5, "Шеф пекарь": 5,
    "Ведущий Бариста /Заготовитель продуктов и сырья 1 разряда": 5,
    "Начальник смены 1 категория": 2, "Начальник смены 2 категория": 3, "Начальник смены 3 категория": 4,
    "Шеф кондитер": 6,
}
OLD_GRADE = re.compile(r"^S\s*\d+$", re.I)    # the grades Verifix carried before the named categories

DEFAULT_RULE: dict[str, Any] = {
    "weight": 0.2,
    "mode": "at_least",            # at_least | exact
    "no_category": "fail",         # fail | skip — a person with no category, or an old S-grade
    "full": 5,                     # the score at exactly 100 %
    "bands": [{"above": 70, "score": 3}, {"above": 65, "score": 2}],   # rate strictly above, highest first
    "worst": 1,                    # everything else, 0 % included
    "levels": LEVELS,
    "ladders": {k: [[c, m] for c, m in v] for k, v in LADDERS.items()},
    "jobs": JOBS,
    "ambiguous": AMBIGUOUS,
}

VERDICTS = ("ok", "above", "below", "no_category", "old_grade", "no_ladder", "no_hire")
_CELL_FIELDS = ("id", "code", "archived", "manager_id", "brigadir", "shift", "factory_id",
                "leader_id", "leader", "leader_kind", "owner_id", "owner", "owner_kind")
_WS = re.compile(r"\s+")


def norm(s: Any) -> str:
    """One spelling for a job or category name: trimmed, one space, folded."""
    return _WS.sub(" ", str(s or "").replace("ё", "е").replace("Ё", "Е")).strip().casefold()


# ── the rule ──────────────────────────────────────────────────────────────────

class BadRule(ValueError):
    """An override that cannot be used, with the part that failed."""


def _clean_rule(raw: Any) -> dict:
    """The override merged over the defaults and VALIDATED whole. Raises
    BadRule naming the first bad part."""
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise BadRule("the rule must be an object")
    r = json.loads(json.dumps(DEFAULT_RULE))
    for k in ("weight", "mode", "no_category", "full", "bands", "worst", "levels", "ladders", "jobs", "ambiguous"):
        if k in raw and raw[k] is not None:
            r[k] = raw[k]
    try:
        r["weight"] = float(r["weight"])
        r["full"] = int(r["full"])
        r["worst"] = int(r["worst"])
    except (TypeError, ValueError):
        raise BadRule("weight, full and worst must be numbers")
    if not 0 < r["weight"] <= 1:
        raise BadRule("weight must be between 0 and 1")
    if not (1 <= r["full"] <= 5 and 1 <= r["worst"] <= 5):
        raise BadRule("full and worst must be scores 1–5")
    if r["mode"] not in ("at_least", "exact"):
        raise BadRule("mode must be at_least or exact")
    if r["no_category"] not in ("fail", "skip"):
        raise BadRule("no_category must be fail or skip")
    try:
        bands = sorted(({"above": float(b["above"]), "score": int(b["score"])} for b in r["bands"]),
                       key=lambda b: -b["above"])
    except (TypeError, ValueError, KeyError):
        raise BadRule("bands must be [{above, score}]")
    if any(not (0 <= b["above"] < 100 and 1 <= b["score"] <= 5) for b in bands):
        raise BadRule("a band's above is a percent below 100 and its score 1–5")
    r["bands"] = bands
    if not isinstance(r["levels"], dict) or any(not isinstance(k, str) or not isinstance(v, int) or isinstance(v, bool)
                                                for k, v in r["levels"].items()):
        raise BadRule("levels must map a category name to a whole number")
    ladders: dict[str, list[list]] = {}
    if not isinstance(r["ladders"], dict) or not r["ladders"]:
        raise BadRule("ladders must map a job to its steps")
    for job, steps in r["ladders"].items():
        if not isinstance(job, str) or not job.strip():
            raise BadRule("a ladder's job must be a name")
        try:
            st = [[str(c), int(m)] for c, m in steps]
        except (TypeError, ValueError):
            raise BadRule(f"the steps of «{job}» must be [category, month] pairs")
        if not st or any(m < 0 or not c.strip() for c, m in st):
            raise BadRule(f"«{job}» needs at least one step with a name and a month ≥ 0")
        ladders[job.strip()] = sorted(st, key=lambda x: x[1])
    r["ladders"] = ladders
    if not isinstance(r["jobs"], dict) or any(not isinstance(k, str) or not isinstance(v, str) for k, v in r["jobs"].items()):
        raise BadRule("jobs must map a Verifix title to a ladder name")
    known = {norm(k) for k in ladders}
    for vfx, lad in r["jobs"].items():
        if norm(lad) not in known:
            raise BadRule(f"«{vfx}» points at a ladder that does not exist: «{lad}»")
    if not isinstance(r["ambiguous"], dict):
        raise BadRule("ambiguous must be an object")
    return r


def rule(db: Session) -> dict:
    """The rule in force: the admin override when it validates, else HR's
    ladder as the platform read it. A malformed override never blanks a score."""
    row = db.query(AppSetting).filter(AppSetting.key == RULE_KEY).first()
    if row and row.value:
        try:
            return _clean_rule(json.loads(row.value))
        except (ValueError, TypeError):
            pass
    return _clean_rule({})


def stored_rule(db: Session) -> tuple[Optional[dict], Optional[str]]:
    """What the admin stored, and why it is not in force (None = it is, or
    nothing is stored)."""
    row = db.query(AppSetting).filter(AppSetting.key == RULE_KEY).first()
    if not row or not row.value:
        return None, None
    try:
        raw = json.loads(row.value)
    except ValueError:
        return None, "not JSON"
    try:
        _clean_rule(raw)
        return raw, None
    except BadRule as exc:
        return raw, str(exc)


def save_rule(db: Session, raw: Optional[dict]) -> dict:
    """Store an override (validated first — BadRule otherwise) or, with None,
    go back to the defaults. The caller commits. Returns the rule in force."""
    row = db.query(AppSetting).filter(AppSetting.key == RULE_KEY).first()
    if raw is None or raw == {}:
        if row is not None:
            db.delete(row)
        return _clean_rule({})
    clean = _clean_rule(raw)
    text = json.dumps(raw, ensure_ascii=False)
    if row is None:
        db.add(AppSetting(key=RULE_KEY, value=text))
    else:
        row.value = text
    return clean


def score_of(rate: Optional[float], r: dict) -> Optional[int]:
    """HR's IFS: exactly 100 → full; strictly above a band's edge → its
    score; else the worst. Judged on the rate AS PRINTED (one decimal)."""
    if rate is None:
        return None
    if rate >= 100:
        return int(r["full"])
    for b in sorted(r["bands"], key=lambda b: -b["above"]):
        if rate > float(b["above"]):
            return int(b["score"])
    return int(r["worst"])


def points_of(score: Optional[int], r: dict) -> Optional[float]:
    if score is None:
        return None
    return round(score * float(r["weight"]), 2)


def whole_pct(done: int, total: int) -> Optional[int]:
    """THE whole percent — half UP from the raw counts (worker_concerns' rule)."""
    return (200 * done + total) // (2 * total) if total else None


# ── the ladder ────────────────────────────────────────────────────────────────

class Ladder:
    """The rule indexed for lookups: job → steps, category → level."""

    def __init__(self, r: dict):
        self.r = r
        self.steps: dict[str, list[tuple[str, int]]] = {}       # ladder name → steps
        self._by_norm: dict[str, str] = {}                      # norm(ladder name) → ladder name
        for name, st in r["ladders"].items():
            self.steps[name] = [(c, m) for c, m in st]
            self._by_norm[norm(name)] = name
        self._jobs: dict[str, str] = {}                         # norm(Verifix title) → ladder name
        for vfx, lad in r["jobs"].items():
            target = self._by_norm.get(norm(lad))
            if target:
                self._jobs[norm(vfx)] = target
        self._levels = {norm(k): int(v) for k, v in r["levels"].items()}
        self.ambiguous = {norm(k): v for k, v in (r.get("ambiguous") or {}).items()}

    def ladder_for(self, job: Optional[str]) -> Optional[str]:
        """The ladder a Verifix title is read against: the map, else a title
        that is itself a ladder's name; None = no ladder (out of the count)."""
        k = norm(job)
        if not k:
            return None
        return self._jobs.get(k) or self._by_norm.get(k)

    def expected(self, ladder: str, tenure: int) -> tuple[str, int]:
        """The highest step whose start month ≤ tenure; the lowest step from
        month 0 whatever its printed month."""
        st = self.steps[ladder]
        cur = st[0]
        for s in st:
            if tenure >= s[1]:
                cur = s
        return cur

    def level(self, cat: Optional[str]) -> Optional[int]:
        return self._levels.get(norm(cat)) if cat else None


def tenure_months(hired: date, m: date) -> int:
    """Whole months from the hire month to the report month (HR's
    «Продолжительность»: a person hired in March is in month 4 in July)."""
    return max(0, (m.year - hired.year) * 12 + (m.month - hired.month))


def judge(actual: Optional[str], expected: str, ladder: Ladder, r: dict) -> str:
    """ok · above · below · no_category · old_grade — the comparison the
    whole KPI rests on, in one place."""
    if not actual or not str(actual).strip():
        return "no_category"
    if OLD_GRADE.match(str(actual).strip()):
        return "old_grade"
    if norm(actual) == norm(expected):
        return "ok"
    la, le = ladder.level(actual), ladder.level(expected)
    if la is None or le is None:
        return "below"
    if la == le:
        return "ok"
    return "above" if la > le else "below"


def counts_as(verdict: str, r: dict) -> tuple[bool, bool]:
    """(counted, compliant) for a verdict under the rule."""
    if verdict in ("no_ladder", "no_hire"):
        return False, False
    if verdict in ("no_category", "old_grade"):
        return (r["no_category"] == "fail"), False
    if verdict == "ok":
        return True, True
    if verdict == "above":
        return True, r["mode"] == "at_least"
    return True, False


# ── the journals, kept in memory per read ─────────────────────────────────────

_kept_lock = threading.Lock()
_kept: dict[str, Any] = {"read_id": None, "events": None}


def last_read(db: Session, ok_only: bool = False) -> Optional[CategoryRead]:
    q = db.query(CategoryRead)
    if ok_only:
        q = q.filter(CategoryRead.ok.is_(True))
    return q.order_by(CategoryRead.id.desc()).first()


def read_info(db: Session) -> dict:
    last = last_read(db)
    ok = last_read(db, ok_only=True)
    running = bool(last and last.finished_at is None
                   and last.started_at and tv.now_aware() - last.started_at < READ_STALE)
    return {
        "running": running,
        "stale": bool(ok is None or ok.finished_at is None
                      or tv.now_aware() - ok.finished_at > timedelta(hours=30)),
        "last": None if not last else {
            "at": tv.iso(last.finished_at or last.started_at), "ok": last.ok, "error": last.error,
            "trigger": last.trigger,
        },
        "ok": None if not ok else {
            "at": tv.iso(ok.finished_at), "journals": ok.journals, "events": ok.events,
            "employees": ok.employees, "sources": ok.sources or {},
        },
    }


def forget() -> None:
    with _kept_lock:
        _kept.update(read_id=None, events=None)


def events_by_person(db: Session) -> dict[str, list[tuple]]:
    """Every stored journal line, per employee, in date order — loaded once
    per READ (the table is replaced whole by each read) and kept."""
    ok = last_read(db, ok_only=True)
    rid = ok.id if ok else None
    with _kept_lock:
        if _kept["events"] is not None and _kept["read_id"] == rid:
            return _kept["events"]
    rows = (db.query(CategoryEvent.employee_id, CategoryEvent.date, CategoryEvent.date_end,
                     CategoryEvent.kind, CategoryEvent.rank_name, CategoryEvent.job_name,
                     CategoryEvent.code, CategoryEvent.unit_name, CategoryEvent.id)
            .order_by(CategoryEvent.employee_id, CategoryEvent.date, CategoryEvent.id).all())
    out: dict[str, list[tuple]] = defaultdict(list)
    for eid, d, d_end, kind, rank, job, code, unit, _id in rows:
        out[eid].append((d, d_end, kind, rank, job, code, unit))
    out = dict(out)
    with _kept_lock:
        _kept.update(read_id=rid, events=out)
    return out


# ── a month's state ───────────────────────────────────────────────────────────

def month_state(m: date, now: Optional[datetime] = None) -> str:
    """before · future · open (the month running — «so far») · ended."""
    now = now or tv.local(tv.now_aware())
    cur = tv.month_start(now.date())
    if m < tv.PAST_FROM:
        return "before"
    if m > cur:
        return "future"
    return "open" if m == cur else "ended"


# ── the people ────────────────────────────────────────────────────────────────

def roster(db: Session, d: date) -> list[dict]:
    """Everybody employed on `d` by the directory, every status: hired by `d`
    and not dismissed by it (the turnover KPI's own test)."""
    out = []
    rows = db.query(TurnoverPerson.employee_id, TurnoverPerson.staff_id, TurnoverPerson.name,
                    TurnoverPerson.status, TurnoverPerson.hired, TurnoverPerson.dismissed,
                    TurnoverPerson.code, TurnoverPerson.unit_name, TurnoverPerson.job).all()
    for eid, sid, name, status, hired, dismissed, code, unit, job in rows:
        if tv.employed_on(hired, dismissed, status, d):
            out.append({"employee_id": eid, "staff_id": sid, "name": name, "status": status,
                        "hired": hired, "dismissed": dismissed, "code": code, "unit": unit, "job": job})
    return out


def standing(p: dict, evs: list[tuple], d: date, today: date) -> dict:
    """Where a person stood on `d` — cell code, job, category and when it was
    granted. A day not yet passed: the directory's own unit and job (what
    Verifix says now). A past day: the last hiring / transfer dated by then
    (a temporary transfer that ended before `d` hands back to the one before
    it), the directory only where the journals name no placement at all.
    The category is always the journals' — the directory carries none."""
    hist = [e for e in evs if e[0] <= d]
    code, job, cat, since, src = p["code"], p["job"], None, None, "directory"
    if d < today and hist:
        places = [e for e in hist if e[2] in ("hire", "transfer")]
        if places:
            last = places[-1]
            if last[1] is not None and last[1] < d and len(places) > 1:
                last = places[-2]
            code, job, src = last[5], last[4] or p["job"], "journal"
    cats = [e for e in hist if e[3]]
    if cats:
        cat, since = cats[-1][3], cats[-1][0]
    return {"code": code, "job": job, "cat": cat, "since": since, "placed_by": src}


def _in_scope(cell: dict, scope: dict) -> bool:
    if scope.get("factory") is not None and cell.get("factory_id") != scope["factory"]:
        return False
    if scope.get("shift") is not None and cell.get("shift") != scope["shift"]:
        return False
    if scope.get("managers") and cell.get("manager_id") not in scope["managers"]:
        return False
    return True


def person_rows(people: list[dict], events: dict[str, list[tuple]], ladder: Ladder, r: dict,
                m: date, today: date) -> list[dict]:
    """One judged row per employed person — THE per-person computation the
    ranking, the cells, the explain list and the workbook all read."""
    d = tv.last_day(m)
    out = []
    for p in people:
        st = standing(p, events.get(p["employee_id"], []), d, today)
        lad = ladder.ladder_for(st["job"])
        row = {
            "employee_id": p["employee_id"], "name": p["name"], "status": p["status"],
            "hired": p["hired"], "code": st["code"], "key": tv.code_key(st["code"]) if st["code"] else None,
            "job": st["job"], "ladder": lad, "placed_by": st["placed_by"],
            "actual": st["cat"], "since": st["since"],
            "tenure": None, "expected": None, "expected_from": None,
            "actual_level": ladder.level(st["cat"]), "expected_level": None,
            "ambiguous": bool(lad and norm(st["job"]) in ladder.ambiguous),
        }
        if lad is None:
            row["verdict"] = "no_ladder"
        elif p["hired"] is None:
            row["verdict"] = "no_hire"
        else:
            row["tenure"] = tenure_months(p["hired"], m)
            exp, exp_from = ladder.expected(lad, row["tenure"])
            row["expected"], row["expected_from"] = exp, exp_from
            row["expected_level"] = ladder.level(exp)
            row["verdict"] = judge(st["cat"], exp, ladder, r)
        row["counted"], row["compliant"] = counts_as(row["verdict"], r)
        out.append(row)
    return out


# ── the month ─────────────────────────────────────────────────────────────────

def aggregate(rows: list[dict], cmap: dict[str, dict], r: dict, ladder: Ladder,
              scope: Optional[dict] = None) -> dict:
    """The month's figures from the judged rows and the cell map. ONE
    function for the page, the explain dialog and any workbook."""
    scope = scope or {}
    any_scope = bool(scope.get("factory") is not None or scope.get("shift") is not None
                     or scope.get("managers"))

    per: dict[str, dict] = defaultdict(lambda: {"all": 0, "counted": 0, "compliant": 0,
                                                "verdicts": defaultdict(int)})
    unreg: dict[str, dict] = {}
    no_ladder: dict[str, int] = defaultdict(int)
    amb: dict[str, int] = defaultdict(int)
    tot = {"people": 0, "counted": 0, "compliant": 0, "no_cell": 0, "unregistered": 0,
           "verdicts": {v: 0 for v in VERDICTS}}
    kept: list[dict] = []
    for x in rows:
        k = x["key"]
        c = cmap.get(k) if k else None
        if c is None:
            if any_scope:
                continue          # a person in no cell belongs to no plant, shift or unit
            if k:
                u = unreg.setdefault(k, {"key": k, "code": x["code"], "people": 0})
                u["people"] += 1
                tot["unregistered"] += 1
            else:
                tot["no_cell"] += 1
            if x["verdict"] == "no_ladder":
                no_ladder[x["job"] or "—"] += 1
            continue
        if any_scope and not _in_scope(c, scope):
            continue
        p = per[k]
        p["all"] += 1
        p["verdicts"][x["verdict"]] += 1
        tot["people"] += 1
        tot["verdicts"][x["verdict"]] += 1
        if x["counted"]:
            p["counted"] += 1
            tot["counted"] += 1
        if x["compliant"]:
            p["compliant"] += 1
            tot["compliant"] += 1
        if x["verdict"] == "no_ladder":
            no_ladder[x["job"] or "—"] += 1
        if x["ambiguous"]:
            amb[x["job"]] += 1
        kept.append(x)

    def figures(p: dict) -> dict:
        rate = tv.round1(p["compliant"] / p["counted"] * 100) if p["counted"] else None
        sc = score_of(rate, r)
        return {"all": p["all"], "counted": p["counted"], "compliant": p["compliant"],
                "rate": rate, "pct0": whole_pct(p["compliant"], p["counted"]),
                "score": sc, "points": points_of(sc, r), "verdicts": dict(p["verdicts"])}

    def cell_row(k: str, c: dict) -> dict:
        p = per.get(k) or {"all": 0, "counted": 0, "compliant": 0, "verdicts": {}}
        return {"key": k, **{f: c.get(f) for f in _CELL_FIELDS}, **figures(p)}

    def order(x: dict):
        # Worst first: the lowest rate, then the most people behind it, then
        # the code; a cell with nobody counted after every cell with a rate.
        return (x["rate"] is None, x["rate"] if x["rate"] is not None else 0, -x["counted"], x["code"] or "")

    ranking = [cell_row(k, c) for k, c in cmap.items()
               if tv.owned(c) and not (any_scope and not _in_scope(c, scope))]
    ranking.sort(key=order)
    cells = [cell_row(k, c) for k, c in cmap.items()
             if not (any_scope and not _in_scope(c, scope)) and not (c.get("archived") and not per.get(k))]
    cells.sort(key=order)

    by_score = {str(s): 0 for s in range(1, 6)}
    for x in ranking:
        if x["score"] is not None:
            by_score[str(x["score"])] += 1
    owners = {x["owner_id"] for x in ranking}
    plant = figures({"all": tot["people"], "counted": tot["counted"], "compliant": tot["compliant"],
                     "verdicts": tot["verdicts"]})
    return {
        "totals": {
            **tot, "rate": plant["rate"], "pct0": plant["pct0"],
            "owners": len(owners), "owned_cells": len(ranking),
            "scored_cells": sum(1 for x in ranking if x["score"] is not None),
            "no_people": sum(1 for x in ranking if x["counted"] == 0),
            "full_cells": sum(1 for x in ranking if x["rate"] is not None and x["rate"] >= 100),
            "by_score": by_score,
        },
        "ranking": ranking, "cells": cells,
        "notices": {
            "no_ladder": sorted(({"job": j, "people": n} for j, n in no_ladder.items()), key=lambda x: -x["people"]),
            "ambiguous": sorted(({"job": j, "ladder": ladder.ladder_for(j), "people": n,
                                  "alternatives": ladder.ambiguous.get(norm(j), [])}
                                 for j, n in amb.items()), key=lambda x: -x["people"]),
            "unregistered": [] if any_scope else sorted(unreg.values(), key=lambda u: -u["people"]),
            "no_cell": tot["no_cell"],
            "no_owner_cells": sum(1 for x in cells if not x["archived"] and not x["owner_id"] and x["all"]),
        },
        "_rows": kept,
    }


def _configured(db: Session) -> bool:
    cfg = verifix.config(db)
    return bool(cfg.get("login") and cfg.get("password_set")
                and cfg.get("password_readable") is not False and cfg.get("filial_id"))


def month_payload(db: Session, m: date, scope: Optional[dict] = None,
                  at: Optional[datetime] = None) -> dict:
    """Everything a page shows for month `m`, within `scope`."""
    at = at or tv.now_aware()
    now = tv.local(at)
    state = month_state(m, now)
    d = tv.last_day(m)
    r = rule(db)
    base = {
        "month": tv.ym(m), "start": tv.ym(tv.START_MONTH), "past_from": tv.ym(tv.PAST_FROM), "state": state,
        "period": {"from": m.isoformat(), "to": d.isoformat()},
        "as_of": (min(now.date(), d) if state == "open" else d).isoformat(),
        "now": now.isoformat(timespec="minutes"),
        "configured": _configured(db),
        "read": read_info(db),              # the journals (this KPI's own read)
        "directory": tv.read_info(db),      # who works where (the turnover KPI's read)
        "rule": r,
        # Owners read by the dated links; a month that ended before they
        # existed is credited by the earliest owners they know — approximate.
        "approx_owners": d < LINKS_FROM,
        # A past month's roster is the directory as it stands now (people
        # re-hired since are placed by their current cycle) — approximate.
        "approx_roster": d < now.date(),
    }
    if state in ("before", "future"):
        return base
    cmap = tv.cell_map(db, d)
    ladder = Ladder(r)
    rows = person_rows(roster(db, d), events_by_person(db), ladder, r, m, now.date())
    agg = aggregate(rows, cmap, r, ladder, scope)
    agg.pop("_rows", None)
    return {**base, **agg, "options": tv.options(cmap)}


def _person_out(x: dict) -> dict:
    return {
        "employee_id": x["employee_id"], "name": x["name"], "job": x["job"], "ladder": x["ladder"],
        "hired": x["hired"].isoformat() if x["hired"] else None, "tenure": x["tenure"],
        "expected": x["expected"], "expected_from": x["expected_from"], "expected_level": x["expected_level"],
        "actual": x["actual"], "actual_level": x["actual_level"],
        "since": x["since"].isoformat() if x["since"] else None,
        "verdict": x["verdict"], "counted": x["counted"], "compliant": x["compliant"],
        "placed_by": x["placed_by"], "ambiguous": x["ambiguous"],
    }


_VERDICT_ORDER = {v: i for i, v in enumerate(("below", "no_category", "old_grade", "above", "ok", "no_ladder", "no_hire"))}


def people_of(db: Session, m: date, keys: Iterable[str], at: Optional[datetime] = None) -> dict:
    """Who was judged in these cells (by code key) and how — the explain
    dialog's list, asked only when it opens. Failures first."""
    at = at or tv.now_aware()
    now = tv.local(at)
    if month_state(m, now) in ("before", "future"):
        return {"people": {}}
    r = rule(db)
    ladder = Ladder(r)
    d = tv.last_day(m)
    want = {k for k in keys if k}
    out: dict[str, list] = defaultdict(list)
    for x in person_rows(roster(db, d), events_by_person(db), ladder, r, m, now.date()):
        if x["key"] in want:
            out[x["key"]].append(_person_out(x))
    for k in out:
        out[k].sort(key=lambda p: (_VERDICT_ORDER.get(p["verdict"], 9), p["name"] or ""))
    return {"people": dict(out)}
