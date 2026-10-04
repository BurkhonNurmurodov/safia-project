"""THE catalog of Verifix's READ methods — the map behind «Verifix (test)».

Every method of Verifix's public API that LISTS or GETS something — 94 of them,
taken from its Postman collection (documenter.getpostman.com/view/23097602/
2s83ziN3VR, read 2026-10-03). The create / update / delete methods are not in
this list, and nothing in the section can call a method that is not in it, so
the section cannot write to Verifix by construction.

Each entry says how to call the method with NO narrowing — every id filter an
empty list, every period a sensible default (`Param.default`) — so the API map
can probe all of them with one button and the raw viewer can open any of them.

Three kinds of method are never called:

* **`blocked`** — the passport / PINFL / family / education records (the
  operator's ruling, 2026-10-03: photos were opened, these were not), and every
  WAGE and PAYROLL list (`_WAGES`: opened the same day, then closed again by the
  operator — the «Ish haqi» page was removed with them). They stay on the map,
  marked «switched off», so the map still says they exist.
* a required id with no default (`track_info`, `search_last_track`, a vacancy
  test, a timebook's details, one location's people) — probed only once
  somebody types the id in the raw viewer («needs a value»).
* the file download (`biruni/m:download_file_v2`) is not a list and is not
  here: it is the photo door, `verifix_explore.photo`, and serves only photos.

`page` names the section page that shows the method's data, so the map can
link to it. A method with no page is read through the raw viewer alone.
"""
from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import date, datetime, timedelta
from typing import Any, Optional

# The module a method belongs to, in the order Verifix's documentation lists them.
MODULES = ("core", "start", "pro", "shift", "iiko", "rec", "rep")


@dataclass(frozen=True)
class Param:
    """A value the call has to carry. `default` names a rule (`resolve`), or
    None — then the method is not probed until somebody types the value."""
    name: str
    kind: str                       # "date" | "datetime" | "int" | "year"
    default: Optional[str] = None
    required: bool = True


@dataclass(frozen=True)
class Method:
    key: str                        # the API path, e.g. "core/job$list"
    module: str                     # MODULES
    group: str                      # Verifix's own folder name (ru)
    name: str                       # Verifix's own method name (ru)
    limit: Optional[int]            # documented page maximum; None = not paged
    body: dict = field(default_factory=dict)
    params: tuple = ()
    page: Optional[str] = None      # the section page that shows it
    blocked: bool = False           # private records — never called


def _ids(*names: str) -> dict:
    return {n: [] for n in names}


D, DT, INT, YEAR = "date", "datetime", "int", "year"

# The two ends of a period, as one tuple — most dated methods take a pair.
def _span(a: str, b: str, start: str, end: str = "today") -> tuple:
    return (Param(a, D, start), Param(b, D, end))


METHODS: tuple[Method, ...] = (
    # ── core ────────────────────────────────────────────────────────────────
    Method("core/job$list", "core", "Должности", "Список должностей", 500,
           _ids("job_ids"), page="jobs"),
    Method("core/job_group$list", "core", "Группы должностей", "Список групп должностей", 500,
           _ids("job_group_ids"), page="jobs"),
    Method("core/division$list", "core", "Подразделения", "Список подразделений", 500,
           _ids("division_ids")),
    Method("core/division_group$list", "core", "Группы подразделений", "Список групп подразделений", 500,
           _ids("division_group_ids")),
    Method("core/location$list", "core", "Локации", "Список локаций", 500,
           _ids("location_ids")),
    Method("core/schedule$list", "core", "Графики работы", "Список графиков", 500,
           _ids("schedule_ids"), (Param("year", YEAR, None, required=False),), page="jobs"),
    Method("core/employee$list", "core", "Сотрудники", "Список сотрудников", 500,
           _ids("employee_ids", "statuses", "npins"), page="employees"),
    Method("core/employee$search_by_npin", "core", "Сотрудники", "Поиск сотрудников по ПИНФЛ", None,
           blocked=True),
    Method("core/fte$list", "core", "Типы занятости", "Список типов занятости", 500,
           _ids("fte_ids"), page="jobs"),
    Method("core/dismissal_reason$list", "core", "Причины увольнения", "Список причин увольнения", 500,
           _ids("dismissal_reason_ids")),
    Method("core/track$list", "core", "Отметки", "Список отметок", 1000,
           {}, (Param("begin_datetime", DT, "hour_ago"), Param("end_datetime", DT, "now"))),
    Method("core/track$track_info", "core", "Отметки", "Получить информацию об отметке", None,
           {}, (Param("track_id", INT),)),
    Method("core/track$search_last_track", "core", "Отметки", "Получить последнюю отметку за день", None,
           {}, (Param("employee_id", INT), Param("track_date", D, "today"))),
    Method("core/time_kind$list", "core", "Виды времени", "Список видов времени", 500,
           _ids("time_kind_ids"), page="jobs"),
    Method("core/request$list", "core", "Запросы на отсутствие", "Список запросов на отсутствие", 500,
           _ids("request_ids"), _span("request_begin_date", "request_end_date", "month_ago")),
    Method("core/request_kind$list", "core", "Виды отсутствий", "Список видов отсутствий", 500,
           _ids("request_kind_ids")),
    Method("core/plan_change$list", "core", "Запросы на изменение графика",
           "Список запросов на изменение графика", 500, _ids("change_ids")),
    Method("core/nationality$list", "core", "Национальности", "Список национальностей", 500,
           _ids("nationality_ids")),
    # The documentation's own body names `nationality_ids` here; kept as written.
    Method("core/relation_degrees$list", "core", "Степени родства", "Список степеней родства", 500,
           _ids("nationality_ids")),
    Method("core/langs$list", "core", "Языки", "Список языков", 500, _ids("lang_ids")),
    Method("core/lang_levels$list", "core", "Уровни владения языком", "Список уровней владения языком", 500,
           _ids("lang_level_ids")),
    Method("core/experience_types$list", "core", "Виды стажа", "Список видов стажа", 500,
           _ids("experience_type_ids")),
    Method("core/labor_function$list", "core", "Трудовые функции", "Список трудовых функций", 500,
           _ids("labor_function_ids"), page="jobs"),
    Method("core/edu_stage$list", "core", "Виды образования", "Список видов образования", 500,
           _ids("edu_stage_ids")),
    Method("core/institution$list", "core", "Учебные заведения", "Список учебных заведений", 500,
           _ids("institution_ids")),
    Method("core/specialty$list", "core", "Специальности", "Список специальностей", 500,
           _ids("specialty_ids")),
    Method("core/marital_status$list", "core", "Состояния в браке", "Список статусов в браке", 500,
           _ids("marital_status_ids")),
    Method("core/calendar$list", "core", "Производственные календари", "Список производственных календарей", 500,
           _ids("calendar_ids"), (Param("year", YEAR, "year"),), page="jobs"),
    Method("core/filial$info", "core", "Организации", "Получить информацию об организации", None),
    Method("core/person_document$list", "core", "Документы сотрудников", "Список документов сотрудников", 500,
           blocked=True),
    Method("core/person_family_members$list", "core", "Родственники сотрудников",
           "Список родственников сотрудников", 500, blocked=True),
    Method("core/person_langs$list", "core", "Языки сотрудников", "Список языков сотрудников", 500,
           blocked=True),
    Method("core/person_experiences$list", "core", "Стажи сотрудников", "Список стажей сотрудников", 500,
           blocked=True),
    Method("core/person_work_places$list", "core", "Места работы сотрудников",
           "Список мест работы сотрудников", 500, blocked=True),
    Method("core/person_education$list", "core", "Образование сотрудников", "Список образований сотрудников", 500,
           blocked=True),
    Method("core/person_marital_status$list", "core", "Статусы браков сотрудников",
           "Список статусов браков сотрудников", 500, blocked=True),
    Method("pro/region$list", "core", "Регионы", "Список регионов", 500, _ids("region_ids")),
    Method("core/device$employee_statuses", "core", "Устройства", "Статусы сотрудников", 500,
           _ids("employee_ids", "location_ids", "device_ids", "employee_pins",
                "last_photo_upload_response_codes")),
    Method("core/track_request$list", "core", "Запросы на отметку", "Список запросов на отметку", 100,
           _ids("request_ids")),
    Method("core/overtime_request$list", "core", "Запросы на сверхурочные", "Список запросов на сверхурочные", 500,
           _ids("request_ids")),
    # ── Start ───────────────────────────────────────────────────────────────
    Method("start/hiring$list", "start", "Приемы на работу", "Список приемов на работу", 500,
           _ids("journal_ids")),
    Method("start/transfer$list", "start", "Кадровые переводы", "Список кадровых переводов", 500,
           _ids("journal_ids")),
    Method("start/schedule_change$list", "start", "Изменения графика работы",
           "Список изменений графика работы", 500, _ids("journal_ids")),
    Method("start/wage_change$list", "start", "Изменения оплаты труда", "Список изменений оплаты труда", 500,
           _ids("journal_ids")),
    Method("start/dismissal$list", "start", "Увольнения", "Список увольнений", 500, _ids("journal_ids")),
    Method("start/wage_sheet$list", "start", "Расчеты оклада", "Список расчетов оклада", 100,
           _ids("sheet_ids", "division_ids"), _span("period_begin", "period_end", "year_start")),
    Method("start/changes/wage$list", "start", "Изменения в трудовых договорах", "Изменения оплаты труда", 100,
           _ids("employee_ids"), _span("begin_date", "end_date", "year_ago")),
    # ── Pro ─────────────────────────────────────────────────────────────────
    Method("pro/employee$list", "pro", "Сотрудники", "Список сотрудников", 500,
           _ids("staff_ids", "fte_ids", "statuses")),
    Method("pro/timebook$list", "pro", "Табели", "Список табелей", 100,
           _ids("timebook_ids"), (Param("division_id", INT, None, required=False),)),
    Method("pro/timebook$list_details", "pro", "Табели", "Список подробностей табеля", 100,
           {}, (Param("timebook_id", INT),)),
    Method("pro/vacation$list", "pro", "Отпуска", "Список отпусков", 100, _ids("journal_ids")),
    Method("pro/vacation_type$list", "pro", "Виды отпусков", "Список видов отпусков", 100,
           _ids("vacation_type_ids")),
    Method("pro/recall_vacation$list", "pro", "Отзыв из отпуска", "Список отзывов с отпуска", 100,
           _ids("journal_ids")),
    Method("pro/sick_leave_reason$list", "pro", "Причины больничных", "Список причин больничных", 500,
           _ids("reason_ids")),
    Method("pro/sick_leave$list", "pro", "Больничные", "Список больничных", 100, _ids("journal_ids")),
    Method("pro/business_trip_reason$list", "pro", "Причины командировок", "Список причин командировок", 500,
           _ids("reason_ids")),
    Method("pro/business_trip$list", "pro", "Командировки", "Список командировок", 100, _ids("journal_ids")),
    Method("pro/hiring$list", "pro", "Приемы на работу", "Список приемов на работу", 100,
           _ids("journal_ids"), _span("journal_begin_date", "journal_end_date", "month_ago")),
    Method("pro/transfer$list", "pro", "Кадровые переводы", "Список кадровых переводов", 100,
           _ids("journal_ids")),
    Method("pro/dismissal$list", "pro", "Увольнения", "Список увольнений", 100, _ids("journal_ids")),
    Method("pro/schedule_change$list", "pro", "Изменения графика работы", "Список изменений графика работы", 100,
           _ids("journal_ids"), _span("journal_begin_date", "journal_end_date", "month_ago")),
    Method("pro/currency$list", "pro", "Валюты", "Список валют", 500, _ids("currency_ids")),
    Method("pro/cashbox$list", "pro", "Кассы", "Список касс", 500, _ids("cashbox_ids")),
    Method("pro/bank_account$list", "pro", "Расчетные счета сотрудников", "Список расчетных счетов сотрудников", 500,
           _ids("bank_account_ids", "person_ids")),
    Method("pro/one_time_charge$list", "pro", "Разовые начисления/удержания",
           "Список разовых начислений/удержаний", 100, _ids("document_ids")),
    Method("pro/payment$list", "pro", "Ведомости", "Список ведомостей", 100, _ids("payment_ids")),
    Method("pro/book$list", "pro", "Начисления/Удержания сотрудников", "Список начислений/удержаний", 100,
           _ids("book_ids")),
    Method("pro/incidents$list", "pro", "Инциденты", "Список инцидентов", 500,
           _ids("event_ids"), _span("begin_date", "end_date", "month_ago")),
    Method("pro/legal_person$list", "pro", "Юридические лица", "Список юридических лиц", 500,
           _ids("legal_person_ids")),
    Method("pro/oper_group$list", "pro", "Группы начислений/удержаний", "Список групп начислений/удержаний", 500,
           _ids("oper_group_ids")),
    Method("pro/oper_type$list", "pro", "Виды начислений/удержаний", "Список видов начислений/удержаний", 500,
           _ids("oper_type_ids")),
    Method("pro/indicator$list", "pro", "Показатели", "Список показателей", 500, _ids("indicator_ids")),
    Method("pro/wage_change$list", "pro", "Wage changes", "List all wage changes", None, _ids("journal_ids")),
    Method("pro/rank_change$list", "pro", "Rank change", "List all rank changes", None, _ids("journal_ids")),
    Method("pro/employment_source$list", "pro", "Employment sources", "List all employment sources", None,
           _ids("source_ids")),
    Method("pro/fixed_term_base$list", "pro", "Fixed term bases", "List all fixed term bases", None,
           _ids("fixed_term_base_ids")),
    Method("pro/robot$list", "pro", "Positions", "List all positions", None, _ids("robot_ids"), page="jobs"),
    Method("pro/rank$list", "pro", "Ranks", "List all ranks", None, _ids("rank_ids"), page="jobs"),
    Method("core/wage_scale$list", "pro", "Wage Scales", "List all wage scales", None, _ids("wage_scale_ids")),
    Method("pro/wage_scale_registry$list", "pro", "Wage Scale Registries", "List all wage scale registries", None,
           _ids("registry_ids")),
    # ── Shift management ────────────────────────────────────────────────────
    Method("shift/shift_group$list", "shift", "Группы смен", "Список групп смен", 500, _ids("group_ids")),
    Method("shift/shift_changes$list", "shift", "Изменения смен", "Список изменений смен", 500,
           _ids("change_ids", "shift_ids", "workplace_ids", "job_ids", "group_ids", "employee_ids",
                "statuses", "publication_statuses"),
           _span("shift_date_begin", "shift_date_end", "week_ago")),
    Method("shift/shift$list", "shift", "Смены", "Список смен", 500,
           _ids("shift_ids", "workplace_ids", "job_ids", "group_ids", "employee_ids", "statuses"),
           _span("shift_date_begin", "shift_date_end", "week_ago")),
    Method("shift/shift$list_with_changes", "shift", "Смены", "Список смен и черновых изменений смен", 500,
           _ids("change_ids", "shift_ids", "workplace_ids", "job_ids", "group_ids", "employee_ids", "statuses"),
           _span("shift_date_begin", "shift_date_end", "week_ago")),
    # ── IIKO matching ───────────────────────────────────────────────────────
    Method("core/division_match$list", "iiko", "Сопоставление подразделений",
           "Список сопоставлений подразделений с IIKO", 100),
    Method("core/job_match$list", "iiko", "Сопоставление должностей",
           "Список сопоставлений должностей с IIKO", 100),
    # ── Recruitment ─────────────────────────────────────────────────────────
    Method("rec/vacancy$vacancies", "rec", "Vacancies", "List vacancies", None,
           {"job_id": None, "region_id": None}),
    Method("rec/vacancy$regions", "rec", "Vacancies", "List vacancy regions", None, {"job_id": None}),
    Method("rec/vacancy$jobs", "rec", "Vacancies", "List vacancy jobs", None, {"region_id": None}),
    Method("rec/vacancy$testing", "rec", "Vacancies", "Load Vacancy Test", None,
           {}, (Param("vacancy_id", INT),)),
    # ── Reports ─────────────────────────────────────────────────────────────
    Method("rep/expenses_by_location$list", "rep", "Expenses by location", "List expenses by location", None,
           _ids("division_ids", "job_ids", "rank_ids", "staff_ids", "location_ids"),
           _span("begin_date", "end_date", "yesterday", "yesterday")),
    Method("rep/payments_by_time$list", "rep", "Зарплаты по временным интервалам",
           "Зарплаты по временным интервалам", None, {}, _span("begin_date", "end_date", "month_start")),
    Method("core/timesheet$export", "rep", "Отчет по посещениям", "Получить отчет по посещениям", 100,
           _ids("division_ids", "employee_ids"),
           _span("period_begin_date", "period_end_date", "yesterday", "yesterday"), page="timesheet"),
    Method("rep/currently_working_employees$list", "rep", "Работающие сотрудники в локации",
           "Работающие сотрудники в локации", None,
           {}, (Param("location_id", INT), Param("report_date", D, "today"))),
)

# The phase-2 pages (2026-10-03, `verifix_registers`): which page shows each
# register. A method listed nowhere stays readable through the raw viewer —
# which is where the methods of the seven pages removed on 2026-10-04
# (structure, marks, on site, devices, requests, absences, incidents) are read
# now: still open, no page of their own.
_PAGES2 = {
    **dict.fromkeys(("pro/hiring$list", "pro/transfer$list", "pro/dismissal$list", "pro/schedule_change$list",
                     "pro/rank_change$list", "start/hiring$list", "start/transfer$list",
                     "start/schedule_change$list", "start/dismissal$list"), "hr"),
    **dict.fromkeys(("pro/timebook$list", "pro/timebook$list_details"), "timebooks"),
    **dict.fromkeys(("shift/shift_group$list", "shift/shift_changes$list", "shift/shift$list"), "shifts"),
    **dict.fromkeys(("core/dismissal_reason$list", "pro/sick_leave_reason$list", "pro/business_trip_reason$list",
                     "pro/vacation_type$list", "pro/employment_source$list", "pro/fixed_term_base$list",
                     "core/division_match$list", "core/job_match$list"), "dictionaries"),
}
METHODS = tuple(replace(m, page=_PAGES2[m.key]) if m.key in _PAGES2 and not m.page else m for m in METHODS)

# Wages are OFF (the operator, 2026-10-03 — opened in the morning, closed in the
# afternoon): every list of pay, the documents pay moves through, the accounts
# it goes to and the payroll module's own reference lists. Never called, even
# while a form for one stays attached to the API role.
_WAGES = frozenset((
    "start/wage_change$list", "start/wage_sheet$list", "start/changes/wage$list",
    "pro/wage_change$list", "pro/book$list", "pro/one_time_charge$list", "pro/payment$list",
    "pro/bank_account$list", "rep/payments_by_time$list", "rep/expenses_by_location$list",
    "core/wage_scale$list", "pro/wage_scale_registry$list", "pro/oper_type$list", "pro/oper_group$list",
    "pro/indicator$list", "pro/currency$list", "pro/cashbox$list",
))
METHODS = tuple(replace(m, blocked=True, page=None) if m.key in _WAGES else m for m in METHODS)

BY_KEY: dict[str, Method] = {m.key: m for m in METHODS}


# ── values ────────────────────────────────────────────────────────────────────

def _default(p: Param, now: datetime) -> Any:
    """The value a rule names, in the shape Verifix reads (dd.mm.yyyy …)."""
    today = now.date()
    days = {
        "today": today, "yesterday": today - timedelta(days=1),
        "week_ago": today - timedelta(days=7), "month_ago": today - timedelta(days=30),
        "year_ago": today - timedelta(days=365), "month_start": today.replace(day=1),
        "year_start": today.replace(month=1, day=1),
    }
    if p.kind == D:
        d = days.get(p.default)
        return d.strftime("%d.%m.%Y") if d else None
    if p.kind == DT:
        at = {"now": now, "hour_ago": now - timedelta(hours=1),
              "day_start": datetime.combine(today, datetime.min.time())}.get(p.default)
        return at.strftime("%d.%m.%Y %H:%M:%S") if at else None
    if p.kind == YEAR:
        return today.year if p.default == "year" else None
    return None


def _typed(p: Param, raw: Any) -> Any:
    """A value typed in the raw viewer (ISO date, ISO datetime, a number) in
    Verifix's shape. Raises ValueError for anything else."""
    s = str(raw).strip()
    if p.kind == D:
        return date.fromisoformat(s[:10]).strftime("%d.%m.%Y")
    if p.kind == DT:
        return datetime.fromisoformat(s[:16]).strftime("%d.%m.%Y %H:%M:%S")
    if not s.lstrip("-").isdigit():
        raise ValueError(f"{p.name} must be a whole number")
    n = int(s)
    if p.kind == YEAR and not 2000 <= n <= 2100:
        raise ValueError("year out of range")
    if n < 0:
        raise ValueError(f"{p.name} must not be negative")
    return n


def build_body(m: Method, given: Optional[dict], now: datetime) -> tuple[dict, list[str]]:
    """The request body: the method's empty filters, each param from what was
    typed or else its default. Returns (body, names still missing)."""
    body = {k: (list(v) if isinstance(v, list) else v) for k, v in m.body.items()}
    missing: list[str] = []
    given = given or {}
    for p in m.params:
        raw = given.get(p.name)
        if raw not in (None, ""):
            body[p.name] = _typed(p, raw)
            continue
        val = _default(p, now) if p.default else None
        if val is not None:
            body[p.name] = val
        elif p.required:
            missing.append(p.name)
    return body, missing


def describe(m: Method, now: datetime) -> dict:
    """The method as the map and the raw viewer read it."""
    return {
        "key": m.key, "module": m.module, "group": m.group, "name": m.name,
        "limit": m.limit, "page": m.page, "blocked": m.blocked,
        "params": [{"name": p.name, "kind": p.kind, "required": p.required,
                    "default": _default(p, now) if p.default else None} for p in m.params],
    }
