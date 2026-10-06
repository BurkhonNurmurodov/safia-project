"""Which days «Verifix to'g'irlash» (/staff) reads LIVE — THE floor.

From the first shift-day that opened after the 2026-10-06 deploy (the
operator's ruling, asked one by one with nineteen others — recorded in
`docs/plan-live-staff-today.md`) /staff shows a unit's day as it runs, read
from Verifix by the platform itself, and the day is copied into `attendance` +
`DayApproval` the moment the brigadir closes it (`services/live_projection`).
Days before the floor keep the file flow exactly as they were filed.

A LEAF on purpose: `day_state` — the module every dashboard, KPI, heatmap and
export passes through — reads it, so it imports nothing but the standard
library and can never fail because a module above it is half-imported.

The floor is a CONSTANT with no override (the shape `idle_source.CELLS_FROM`
and `zagruzka_source.ZAGRUZKA_FROM` already use): a rule a per-unit toggle can
quietly undo is a rule nobody can read off the platform. It must never be
moved LATER — that would hand days back to a file nobody uploads any more.
"""
from datetime import date
from typing import Optional

# Shift 1's day of 7 Oct 2026 and shift 2's night of 7 → 8 Oct: the first
# shift-day of either shift to open after the deploy (shift 2's night of the
# 6th had already begun), so no shift already running was switched mid-way.
LIVE_FROM = date(2026, 10, 7)


def is_live(d: Optional[date]) -> bool:
    """This shift-day is read live (and copied at its close)."""
    return d is not None and d >= LIVE_FROM


def iso() -> str:
    return LIVE_FROM.isoformat()
