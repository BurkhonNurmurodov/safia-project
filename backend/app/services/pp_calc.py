"""
Production-planning calculation engine.

Replicates the math of the "Sheet1 ..." brigadir dashboards in the ABC Excel
form. All inputs are plain Python values (the router pulls them from the pp_*
tables); the engine has no DB dependency so it is trivially testable.

Quantities are keyed by (``daily_key``, work center) — the SAP code where a line
has one, a name-derived token where it has none (see :func:`daily_key`).

Per-row (one row per catalog line = SAP code + work center + operation):
    total_labor  (Общ.трудоёмкость, col I) = labor_time * plan_qty   / 60   [minutes]
    actual_labor (col F)                    = labor_time * actual_qty / 60   [minutes]
    people       (ЛЮДИ, col E)              = N for the row's work center
    minutes      (Минут, col J)             = total_labor / people
    pareto       (Парето, col K)            = total_labor / Σ total_labor

Per work center w:
    Q_w   = Σ total_labor over the rows in w
    S_w   = capacity (productive minutes for the roster), hand-set per WC;
            falls back to W_w × PRODUCTIVE_MIN when not configured
    N_w   = ROUND( W_w × Q_w / S_w )             people needed   (U = W*R, R = Q/S)
            W_w and N_w may each be pinned for a single date (pp_work_center_daily);
            a pinned W still feeds the formula, a pinned N replaces its result.
    load  (Загруженность, col O)             = Q_w / (SHIFT_MIN * N_w)   [IFERROR→0]

Totals (header row):
    total_plan_labor   (I1) = Σ total_labor
    total_actual_labor (F1) = Σ actual_labor
    completion         (E1) = F1 / I1

The two constants are configurable (app_settings):
    SHIFT_MIN      = 480  full clock minutes per person per shift
    PRODUCTIVE_MIN = 408  planned *productive* minutes per person = 85% × SHIFT_MIN.
                          (The Excel's «Для 85% труд» = 425 was 85% of a 500-minute
                          nominal base; dropped so the % is honest against the shift.)
"""
from __future__ import annotations

import math
from typing import Optional

DEFAULT_SHIFT_MIN = 480.0
DEFAULT_PRODUCTIVE_MIN = 408.0


# A catalog line with no SAP code is keyed by its NAME under this prefix. It
# cannot collide with a SAP code (letter + digits) and the SAP join can never
# produce one, so a synthetic key never reaches the «unknown SKU» list.
LOCAL_PREFIX = "~"


def daily_key(sap_code, name) -> str:
    """The DURABLE identity of one catalog line's plan/fact quantities —
    ``pp_daily.sap_code``.

    A line with a SAP code is keyed by it, exactly as before. A code-less line
    (the ABC form carries several: dough mixes, «Донат», …) is keyed by a
    synthetic token built from its name, because:

      • pp_daily has to survive a catalog re-import, which deletes and re-creates
        every PPProduct row — so the row id is not a durable key; and
      • several code-less lines share one Команда in the real form, so the pair
        ("", work_center) would make them ONE row: type a ПЛАН on the dough mix
        and every other code-less line on that team would silently take it too.

    Renaming a code-less line therefore re-points which quantities it tracks,
    the same way renaming a sap_code does.
    """
    code = (sap_code or "").strip()
    if code:
        return code
    return LOCAL_PREFIX + " ".join((name or "").split()).lower()


def is_local_key(key) -> bool:
    """True for a key minted by :func:`daily_key` for a code-less line."""
    return str(key or "").startswith(LOCAL_PREFIX)


def _round_half_up(x: float) -> int:
    """Excel ROUND(x, 0): half away from zero. Inputs here are non-negative."""
    return int(math.floor(x + 0.5))


def _f(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _opt_int(v) -> Optional[int]:
    """None / unparseable → None (no override); anything numeric → int."""
    if v is None or v == "":
        return None
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return None


def compute_dashboard(
    products: list[dict],
    quantities: dict[tuple[str, str], dict],
    work_centers: list[dict],
    shift_min: float = DEFAULT_SHIFT_MIN,
    productive_min: float = DEFAULT_PRODUCTIVE_MIN,
    wc_overrides: Optional[dict[str, dict]] = None,
    ignore_capacity: bool = False,
) -> dict:
    """
    products:    [{sap_code, name, work_center, labor_time(None ok), sort_order}, ...]
    quantities:  {(daily_key, work_center): {plan_qty, actual_qty}}  (already
                 override-resolved by the caller; the key is pp_daily.sap_code —
                 see daily_key(), which a code-less line derives from its name)
    work_centers:[{code, shtatka, sort_order}, ...]
    wc_overrides:{code: {people, shtatka}} — per-DAY manual pins for the staffing
                 panel (pp_work_center_daily). A non-None штатка replaces W before
                 N is derived; a non-None people replaces the derived N outright.
    ignore_capacity: the day carries a pinned efficiency, so S is W × productive_min
                 for EVERY work center and the configured capacity is bypassed.
                 `capacity` is only ever W × a per-head rate anyway (the rate
                 differs per brigadir: 425/head for one unit, 407.5 for another),
                 so a pinned efficiency has to be able to replace it — otherwise
                 the pin would silently do nothing on units that have one.
    Returns a dict with `rows`, `work_centers` (staffing panel) and `totals`.
    """
    productive_min = productive_min or DEFAULT_PRODUCTIVE_MIN
    shift_min = shift_min or DEFAULT_SHIFT_MIN

    # --- pass 1: per-row labor, and accumulate Q per work center -----------
    rows: list[dict] = []
    q_by_wc: dict[str, float] = {}

    for i, p in enumerate(products, start=1):
        wc = p.get("work_center") or ""
        key = daily_key(p.get("sap_code"), p.get("name"))
        q = quantities.get((key, wc), {})
        plan_qty = _f(q.get("plan_qty"))
        actual_qty = _f(q.get("actual_qty"))

        labor = p.get("labor_time")
        has_labor = labor is not None
        labor_f = _f(labor)

        total_labor = (labor_f * plan_qty / 60.0) if has_labor else None
        actual_labor = (labor_f * actual_qty / 60.0) if has_labor else None

        if total_labor:
            q_by_wc[wc] = q_by_wc.get(wc, 0.0) + total_labor

        rows.append({
            "id": p.get("id"),               # PPProduct id — lets the client edit this catalog line
            # «№» — the line's 1-based place in the CATALOG, which is the order
            # `products` arrives in (sort_order, id). It belongs to the line and
            # not to where the client happens to be printing it: a reader who
            # sorts by Парето still sees the number that position has in the
            # catalog, so two people looking at differently sorted tables can
            # name the same row. Never a row counter over the rendered rows.
            "seq": i,
            "sap_code": p.get("sap_code"),
            # what pp_daily is keyed by for this line (= sap_code, unless the
            # line has none) — the client echoes it back when overriding a qty
            "qty_key": key,
            "name": p.get("name") or "",
            "work_center": wc,
            "labor_time": labor_f if has_labor else None,
            "has_labor": has_labor,
            "plan_qty": plan_qty,
            "actual_qty": actual_qty,
            "total_labor": total_labor,
            "actual_labor": actual_labor,
            "plan_overridden": bool(q.get("plan_overridden")),
            "actual_overridden": bool(q.get("actual_overridden")),
            "sort_order": p.get("sort_order", 0),
        })

    total_plan_labor = sum(r["total_labor"] or 0.0 for r in rows)
    total_actual_labor = sum(r["actual_labor"] or 0.0 for r in rows)

    # --- per work center: people (N) + load (Загруженность) ----------------
    # Include every configured work center, plus any that appear in products
    # but lack config (so nothing silently disappears).
    wc_codes: list[str] = []
    wc_meta: dict[str, dict] = {}
    for w in work_centers:
        code = w.get("code")
        if code and code not in wc_meta:
            cap = w.get("capacity")
            wc_meta[code] = {
                "shtatka": int(_f(w.get("shtatka"))),
                "capacity": (_f(cap) if cap is not None else None),
                "sort_order": w.get("sort_order", 999),
            }
            wc_codes.append(code)
    for code in q_by_wc:
        if code and code not in wc_meta:
            wc_meta[code] = {"shtatka": 0, "capacity": None, "sort_order": 999}
            wc_codes.append(code)

    ov_all = wc_overrides or {}

    people_by_wc: dict[str, int] = {}
    wc_panel: list[dict] = []
    for code in wc_codes:
        meta = wc_meta[code]
        ov = ov_all.get(code) or {}
        q = q_by_wc.get(code, 0.0)
        # Штатка: configured W unless the day carries a manual pin.
        shtatka_cfg = meta["shtatka"]
        shtatka_ov = _opt_int(ov.get("shtatka"))
        shtatka = shtatka_ov if shtatka_ov is not None else shtatka_cfg
        cap = meta["capacity"]
        # S (productive minutes for the roster): the WC's configured capacity,
        # unless the day pins an efficiency — then W × that, for every cell.
        use_cap = bool(cap and cap > 0) and not ignore_capacity
        s_eff = cap if use_cap else (shtatka * productive_min)
        # O. SONI: derived from the formula unless the day carries a manual pin.
        people_calc = _round_half_up(shtatka * q / s_eff) if (s_eff > 0 and shtatka > 0) else 0
        people_ov = _opt_int(ov.get("people"))
        people = people_ov if people_ov is not None else people_calc
        people_by_wc[code] = people
        load = (q / (shift_min * people)) if people > 0 else 0.0
        wc_panel.append({
            "work_center": code,
            "shtatka": shtatka,           # штатка (W) — effective
            "capacity": s_eff,            # S — productive minutes for the roster
            # per-head productive minutes this cell is running at (S ÷ W) — what
            # the «Odamlar soni» efficiency box reads and writes
            "per_head": (s_eff / shtatka) if shtatka > 0 else None,
            "people": people,             # O. SONI (N) — effective
            "total_labor": q,             # Σ Общ.трудоёмкость for this WC
            "load": load,                 # Загруженность (O)
            "sort_order": meta["sort_order"],
            # what the card falls back to when an override is cleared
            "people_calc": people_calc,
            "shtatka_cfg": shtatka_cfg,
            "people_overridden": people_ov is not None,
            "shtatka_overridden": shtatka_ov is not None,
        })
    wc_panel.sort(key=lambda x: (x["sort_order"], x["work_center"]))

    # --- pass 2: per-row people / minutes / pareto -------------------------
    for r in rows:
        people = people_by_wc.get(r["work_center"], 0)
        r["people"] = people
        tl = r["total_labor"]
        r["minutes"] = (tl / people) if (tl is not None and people > 0) else None
        r["pareto"] = (tl / total_plan_labor) if (tl and total_plan_labor > 0) else 0.0

    total_people = sum(w["people"] for w in wc_panel)
    completion = (total_actual_labor / total_plan_labor) if total_plan_labor > 0 else 0.0
    avg_load = (total_plan_labor / (total_people * shift_min)) if total_people > 0 else 0.0

    return {
        "rows": rows,
        "work_centers": wc_panel,
        "totals": {
            "total_plan_labor": total_plan_labor,        # I1
            "total_actual_labor": total_actual_labor,    # F1
            "completion": completion,                    # E1 = F1/I1
            "total_people": total_people,                # ΣN
            "total_shtatka": sum(w["shtatka"] for w in wc_panel),
            "avg_load": avg_load,                        # I1 / (ΣN * 480)
        },
        "constants": {"shift_min": shift_min, "productive_min": productive_min},
    }
