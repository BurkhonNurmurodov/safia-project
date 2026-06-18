from dataclasses import dataclass, field
from typing import Optional

KAIZEN_BUFFER = 10
VERIFIX_EFFICIENCY = 0.85
ALLOWED_ROLES = {"Заготовитель продуктов и сырья", "Фасовщик"}


def is_direct_role(job_title: str, hours_worked=None) -> bool:
    """Return True only if this row should count towards calculations.
    Rule: matching job title (or empty) AND the worker actually came (hours > 0).
    """
    try:
        hw = float(hours_worked or 0)
    except (TypeError, ValueError):
        hw = 0.0
    if hw <= 0:
        return False  # didn't come — exclude regardless of job title

    jt = (job_title or "").strip()
    if not jt or jt in ("nan", "NaN"):
        return True   # hours > 0 already checked above, empty title is fine
    return jt in ALLOWED_ROLES or jt.startswith("Кондитер")


def safe_div(num, den):
    try:
        if den == 0 or den is None:
            return None
        return num / den
    except (TypeError, ZeroDivisionError):
        return None


@dataclass
class DailyMetrics:
    date: str
    manager_id: int
    manager_name: str
    shift: int

    prod_plan: float = 0.0
    prod_actual: float = 0.0
    verifix_labor: float = 0.0
    labor_surplus: Optional[float] = None
    official_hc: float = 0.0
    verifix_hc: int = 0
    effective_hc: Optional[float] = None
    avg_early_arrival: float = 0.0
    equip_downtime: float = 0.0
    downtime_by_cat: dict = field(default_factory=dict)
    avail_min: Optional[float] = None   # plan-adjusted available minutes per person (= 480 × ratio)

    baseline_util: Optional[float] = None
    adjusted_util: Optional[float] = None
    after_idle_util: Optional[float] = None
    after_early_util: Optional[float] = None
    net_util: Optional[float] = None

    @property
    def status(self) -> str:
        v = self.net_util
        if v is None:
            return "No Data"
        if v >= 1.05:
            return "Over Capacity"
        if v >= 0.95:
            return "On Track"
        if v >= 0.90:
            return "Monitor"
        return "Needs Attention"

    @property
    def difference_hrs(self) -> Optional[float]:
        if self.verifix_labor is None or self.prod_actual is None:
            return None
        return (self.verifix_labor - self.prod_actual) / 60

    @property
    def hc_mismatch(self) -> bool:
        return abs(self.official_hc - self.verifix_hc) > 2

    @property
    def early_flagged(self) -> bool:
        return self.avg_early_arrival * max(self.official_hc, 1) > 110

    @property
    def idle_flagged(self) -> bool:
        return self.equip_downtime > 50

    @property
    def diff_in_range(self) -> bool:
        if self.prod_plan == 0:
            return True
        diff_pct = abs(safe_div(self.verifix_labor - self.prod_actual, self.prod_actual) or 0)
        return diff_pct <= 0.05


def compute_metrics(
    manager_id: int,
    manager_name: str,
    shift: int,
    date: str,
    attendance_rows: list,
    prod_plan: float,
    prod_actual: float,
    official_hc: float,
    equip_downtime: float,
    downtime_by_cat: dict,
) -> DailyMetrics:
    m = DailyMetrics(
        date=date,
        manager_id=manager_id,
        manager_name=manager_name,
        shift=shift,
        prod_plan=prod_plan,
        prod_actual=prod_actual,
        official_hc=official_hc,
        equip_downtime=equip_downtime,
        downtime_by_cat=downtime_by_cat,
    )

    # Only include rows matching the direct-role filter for calculations
    calc_rows = [r for r in attendance_rows if is_direct_role(r.job_title, r.hours_worked)]

    total_hours = 0.0
    total_early = 0.0
    worker_count = 0
    for row in calc_rows:
        try:
            total_hours += float(row.hours_worked or 0)
        except (TypeError, ValueError):
            pass
        try:
            total_early += float(row.early_arrival_min or 0)
        except (TypeError, ValueError):
            pass
        if row.worker_name and row.worker_name not in ("nan", "NaN", ""):
            worker_count += 1

    m.verifix_labor = round(total_hours * 60 * VERIFIX_EFFICIENCY, 2)
    m.verifix_hc = worker_count
    m.avg_early_arrival = round(total_early / official_hc, 2) if official_hc else 0.0

    ratio = safe_div(prod_actual, prod_plan)
    if ratio:
        m.labor_surplus = safe_div(
            (m.verifix_labor - prod_actual),
            60 * 8 * ratio
        )
        if m.labor_surplus is not None:
            m.effective_hc = official_hc + m.labor_surplus
        else:
            m.effective_hc = official_hc

        base = 480 * ratio
        m.avail_min = base
        m.baseline_util = safe_div(prod_actual, 480 * official_hc * ratio)
        m.adjusted_util = safe_div(prod_actual, 480 * m.effective_hc * ratio)
        m.after_idle_util = safe_div(prod_actual, m.effective_hc * (base - equip_downtime)) if m.effective_hc else None
        m.after_early_util = safe_div(prod_actual, m.effective_hc * (base - equip_downtime - m.avg_early_arrival)) if m.effective_hc else None
        m.net_util = safe_div(prod_actual, m.effective_hc * (base - equip_downtime - m.avg_early_arrival - KAIZEN_BUFFER)) if m.effective_hc else None

    return m
