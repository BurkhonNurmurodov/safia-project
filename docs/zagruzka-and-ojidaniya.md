# Загрузка and Ojidaniya — what they are, and how the ojidaniya number changed

**Status:** reference note. Written 2026-09-04.
**Verified against:** `backend/app/services/kpi_calculator.py`,
`backend/app/services/idle_source.py`, `backend/app/services/idle_intervals.py`,
`frontend/src/utils/formulas.js` — every formula and every direction below was
run against the code, not recalled.

---

## 1. What is загрузка?

Загрузка (workload / utilisation) answers one question:

> Of the working time this unit actually had, how much of it turned into product?

It is a **ratio**, not a count. The numerator is the product the unit made,
expressed in standard minutes of labour (`prod_actual` — the Трудоемкость of
everything produced). The denominator is the labour time that was available to
make it.

The platform does not publish one utilisation figure. It publishes a **ladder of
five**, each one removing a further excuse from the denominator, so a reader can
see where the gap between plan and reality actually opens:

| # | Metric | Denominator | What it asks |
|---|---|---|---|
| 1 | `baseline_util` | `480 × official_hc × ratio` | Against the roster on paper |
| 2 | `adjusted_util` | `480 × effective_hc × ratio` | Against the people who really counted |
| 3 | `after_idle_util` | `effective_hc × (base − idle)` | …excluding time the cells stood stopped |
| 4 | `after_early_util` | `effective_hc × (base − idle − early)` | …and early arrivals |
| 5 | **`net_util`** | `effective_hc × (base − idle − early − 10)` | **The headline «Итог. нагрузка»** |

where

```
ratio = prod_actual ÷ prod_plan
base  = 480 × ratio            # 480 = the flat shift minute base
10    = KAIZEN_BUFFER          # a fixed allowance, kpi_calculator.py:4
```

`net_util` is what the Overview averages (`Σ net_util ÷ N supervisors`), what the
Zagruzka heatmap paints, and what the comparison table ranks. **Ojidaniya enters
at step 3 and stays in for the rest of the ladder.**

---

## 2. What is ojidaniya?

Ojidaniya (кутиш — "waiting") is **time a production cell stood still because it
was waiting for something**. Not breaks, not the shift being over: the line was
staffed and ready and could not run.

Each stoppage has a **category** — the cause:

| Code | Cause |
|---|---|
| Cat A / A2 | Waiting for product from the fridge (semi-finished / finished) |
| Cat B | Equipment breakdown |
| Cat C | Waiting for trays, trolleys, containers, lids |
| Cat D / D2 | Waiting for raw material from the warehouse (routine / extra request) |
| Cat D3 | Waiting for product from another department |
| Cat E | Waiting on internal logistics |
| Cat F | Waiting on a technologist's decision |
| Cat G | The planning department was late or wrong |
| Cat H | Cleaning — **excluded from загрузка** (planned work, not a stoppage) |
| Cat I | Waiting for the previous shift to finish — **counted since 2026-08-22** |

`sheets_reader.OJIDANIYA_ONLY_CATS` is THE list of categories that appear on the
Ojidaniya page but are **not** counted in загрузка. Today it holds exactly one
entry: `Cat H`.

Every category is also recorded in two halves: minutes when the wait **stopped**
the cell (тўхтаганда) and minutes when it did **not** (тўхтамаганда). Only the
stopped half feeds загрузка.

---

## 3. How ojidaniya affects загрузка

Ojidaniya is **subtracted from the denominator**:

```python
after_idle_util = prod_actual / (effective_hc * (base - equip_downtime))
net_util        = prod_actual / (effective_hc * (base - equip_downtime - early - 10))
```

So the relationship is:

> **More recorded ojidaniya ⇒ a smaller denominator ⇒ a HIGHER reported загрузка.**

This is not a quirk. It is the intended meaning of the metric: `net_util` asks
*"of the time you could actually have produced in, how much did you?"*. Declaring
a stoppage removes that time from the window you are judged against.

Measured directly (10 workers, plan 1000, actual 900 — everything held constant
except the ojidaniya minutes):

| Ojidaniya | `baseline_util` | `after_idle_util` | `net_util` |
|---:|---:|---:|---:|
| 0 min | 20.8% | 12.0% | 12.3% |
| 30 min | 20.8% | 12.9% | 13.2% |
| 60 min | 20.8% | 13.9% | 14.3% |
| 120 min | 20.8% | 16.6% | 17.2% |

`baseline_util` never moves — it does not see ojidaniya at all. Steps 3–5 all
rise as waiting rises.

> ### ⚠️ Correction to `CLAUDE.md`
>
> Two places in `CLAUDE.md` state this backwards — *"idle goes UP and net
> utilisation DOWN"* (the Cat I section) and *"idle DOWN and net utilisation UP"*
> (the idle-source section). The formula and the table above say the opposite in
> both cases. The prose is wrong; the code is right. Anyone predicting the effect
> of the 27 Aug switch from `CLAUDE.md` alone will get the sign inverted.

**The structural consequence worth naming:** because more declared waiting raises
the score, whoever produces the ojidaniya number is not a neutral party to it.
That is precisely why *how* the number is produced matters more than any other
input on the ladder — which brings us to the change.

---

## 4. How ojidaniya was calculated BEFORE

**Until 2026-08-27** (`idle_source.CELLS_FROM`), the source was the
**«Смена отчёт» Google Sheet**, landing in the `DowntimeData` table.

- **One row per (brigadir, date).** Unique key `(manager_name, date)`.
- The brigadir fills a form at the end of the shift: for each category, the
  minutes the cell stopped and the minutes it did not.
- `equip_downtime` for the unit = that row's total, with `OJIDANIYA_ONLY_CATS`
  stripped.

What that shape could not carry:

| Missing | Consequence |
|---|---|
| Any cell dimension | «The unit waited 90 minutes» — but which of its 11 cells? |
| Any clock time | No start, no end, no way to place a stoppage in the shift |
| Any note | No cause beyond the category letter |
| Any evidence | Nothing to audit the figure against |
| **Any overlap handling** | Categories were **summed**, so a cell stopped for two reasons at once was counted twice |

The last one is the arithmetic defect, and it is not hypothetical — see §7.

The figure was also **recalled, not measured**: written hours after the events,
for a whole unit, by one person, from memory.

---

## 5. How ojidaniya is calculated NOW

**From 2026-08-27, for every unit, on every day** — no per-unit override can turn
this back on for a covered day; `CELLS_FROM` is a hard constant.

The record is now **`cell_ojidaniya_intervals`**: leaders file each stoppage on
`/idle-cell` as a **start → end event on a specific cell**, with a category and a
free-text note.

The unit's daily figure is built in three steps:

**Step 1 — per cell, take the UNION of its stopped ranges.**

```
Tᵢ = | ⋃ stopped ranges on cell i that day |      (idle_intervals.merged_spans)
```

Overlapping stoppages merge. A minute the cell stood still is one minute, however
many causes were acting on it. Categories excluded from загрузка (`Cat H`) are
dropped **before** the union, so a dropped category cannot survive inside a
merged span.

**Step 2 — weight the cells by who actually stood in them.**

```
T_unit = Σ(Nᵢ · Tᵢ) ÷ ΣNᵢ
```

`Nᵢ` = the people who **actually worked** cell *i* that day (direct-role
attendance matched by cell code — never the planned headcount). A worker split
between two cells counts as a fraction in each.

**Step 3 — an absent answer is absent, not zero.**
`ΣN = 0` (no cell had anybody in it) produces **no figure at all**; the
(unit, day) is simply missing from the answer.

Everything downstream reads this through exactly two doors —
`build_metrics_list` and `get_downtime` — so the Overview, the Zagruzka heatmap,
the comparison, the brigadir profile, the Daily donut, the bot `/ojidaniya` card
and the weekly svodka all moved together on the same day.

---

## 6. How each method moved загрузка

Nothing is stored: both figures are derived per request. So on **28 August every
historical day re-read itself under the new rule** — no migration, no re-sync,
and the whole history changed at once.

The direction is not uniform. It depends on the unit:

| Unit's situation | Ojidaniya moved | `net_util` moved |
|---|---|---|
| Leaders file diligently, causes rarely overlap | ≈ unchanged | ≈ unchanged |
| Leaders file diligently, causes **overlap** | **DOWN** (union < sum) | **DOWN** |
| Leaders file diligently, brigadir used to under-report | UP | UP |
| **Leaders file nothing on `/idle-cell`** | **DOWN to 0** | **DOWN** |
| Unit owns no cells, or no cell had counted attendance | **DOWN to 0** | **DOWN** |

The last two rows are the important ones, and they are the **directive, not a
bug**: a unit whose leaders file nothing now reads **0 minutes** of waiting, and
therefore loses the denominator credit it used to get from the brigadir's
self-reported figure. Its reported загрузка falls. The fix for such a unit is
*its leaders filing intervals*, not a fallback to the sheet.

The sheet is still imported for everybody. It feeds nothing here any more — it is
kept precisely so the two answers stay comparable.

### A separate change, one week earlier

On **2026-08-22** `Cat I` («waiting for the previous shift to finish») was moved
*into* the загрузка-counted set by operator directive: that wait is time the
shift stood still, so it belongs there like any other stoppage. On every day that
carried Cat I minutes, ojidaniya went **UP** and reported загрузка went **UP**
with it. The 50-minute idle flag may newly fire on those days.

### A third change that does NOT affect загрузка

The «Toifalar bo'yicha» tab shipped on 2026-09-04 divides a unit's category
minutes by *the number of cells that had people*, rather than by headcount. That
figure is **display-only**: it feeds no KPI, and `equip_downtime` is untouched by
it. It is a different measure for a different question — see
`docs/` companion note, or the tab's own explanation card. Do not confuse it with
the change described above.

---

## 7. Why the new method is more accurate

### 7.1 It counts a stopped minute once

This is the arithmetic defect the old form could not avoid. A cell waiting on the
warehouse **and** down for repair at the same time appears under both categories.
A per-category form asks for both numbers, and totalling them double-counts the
overlap.

Measured, on one cell, one shift, one 30-minute overlap:

```
Cat D  09:00–10:00   60 min
Cat B  09:30–10:30   60 min      ← overlaps Cat D by 30 min
Cat C  14:00–14:20   20 min

SUM of the categories        140 min   ← what a per-category form totals to
UNION of the stopped ranges  110 min   ← what the cell actually stood still
                              ─────
over-report                   30 min   (27% high)
```

The union model cannot make this error, because it merges the ranges before it
counts them. **The old number was systematically biased upward** wherever causes
overlapped — and since a larger ojidaniya raises `net_util` (§3), the old загрузка
was biased upward too.

### 7.2 It is measured, not recalled

| | Before | Now |
|---|---|---|
| Who records | The brigadir | The leader, on the cell |
| When | End of shift, from memory | At the event |
| Granularity | One number per unit per day | One event per cell, with a clock |
| Cause | A category letter | Category **plus a written note** |
| Auditable | No | Yes — every minute opens to its own events |

### 7.3 It separates the measurer from the measured

Because more declared waiting raises the score (§3), the old design asked the
brigadir to produce a number that improved the brigadir's own result. That is a
structural conflict, not an accusation about any person. The new design moves the
recording to the leaders, event by event, on the cell, with a note — the score is
still the unit's, but the record is no longer authored by the person it scores.

### 7.4 It knows *where*, so it can be checked and fixed

The old figure was un-actionable: 90 minutes of Cat D somewhere in an 11-cell
unit tells nobody which line to go and look at. The new record names the cell, the
window and the reason, and `UnitOjidaniyaModal` opens the events behind any bar on
the chart. A number you can walk to the shop floor and verify is a different kind
of number.

### 7.5 It weights the loss by who actually paid it

The old whole-unit figure had no internal structure at all. The new one weights
each cell by the people who **actually came** to it, so a stoppage counts against
the labour that genuinely stood through it — and a plan that overstated a cell
cannot pull the unit's figure toward a stoppage nobody was present for.

### 7.6 Zero became a real answer

Before, a brigadir who filed nothing left a gap indistinguishable from a quiet
day. Now, on a **closed** day, attendance with no filed interval is a genuine
zero, and a day with no attendance at all is *absent* rather than zero. The three
states — "nothing happened", "nobody was there", "nobody reported" — are finally
distinct.

---

## 8. Honest limits of the new method

Accuracy improved; it did not become perfect. Four things to keep in view:

1. **Silence now reads as zero.** The old form at least forced a number out of
   somebody. A unit that never adopts `/idle-cell` reports no waiting and takes
   the загрузка penalty for it. Coverage is now a real operational risk.
2. **There is no approval gate.** Since 2026-08-27 a leader's entry counts the
   moment it is saved. The unit's brigadir is notified per entry and the
   close-day dialog names the count, but nobody signs it off. Closing the day
   *is* the review.
3. **The 480-minute base is still flat.** Cells carry their own shift clocks
   (`cells.shift_start` / `shift_end`) but nothing in загрузка reads them yet.
   The denominator assumes an 8-hour shift for every unit.
4. **The union is per cell, not per unit.** Two different cells stopped at the
   same moment for the same reason are two separate stoppages, correctly — but it
   does mean the unit figure is a weighted mean of unions, not a union itself.

---

## 9. One-paragraph summary

Загрузка measures product made against working time available, and ojidaniya is
subtracted from that available time — so **more recorded waiting produces a higher
reported загрузка**. Until 27 August 2026 the waiting figure was one number per
brigadir per day, written from memory at the end of the shift, with categories
*summed* — which double-counted every overlapping stoppage and biased both
ojidaniya and загрузка upward. Since then it is built from timestamped per-cell
events filed by the leaders: overlapping ranges are merged so a stopped minute is
counted once, cells are weighted by the people who actually worked them, and every
minute traces back to a cell, a clock window and a written note. The new figure is
lower where causes overlapped, zero where nobody files, and — unlike the old one —
checkable against the shop floor.
