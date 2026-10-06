# «Verifix to'g'irlash» edits TODAY — the operator's rulings (2026-10-06)

The ask, verbatim: «can we turn current verifix edit page supports live editing
for today? The page will be as they were before. But they'll be exchange people
for today also so we won't have to run one day back. At the end of the shift,
when everyone is left and supervisor closed the day, the workload will be ready.
There won't be any need to manually press any button or download excel sheets.»

Twenty questions were put to the operator one by one on 2026-10-06, each with
the code facts behind it (five readers over `routers/staff.py`,
`routers/attendance_batch.py`, `services/live_staff.py` / `verifix_live.py`,
the загрузка readers and the two pages). This file is the record of the
answers. Built on 2026-10-06 (v4.253.0) — CLAUDE.md «/staff reads TODAY live»
is the rule book; the plan at the end is what the answers implied.

## What is being built

`/staff` («Verifix to'g'irlash») shows TODAY's shift-day as it runs, read from
Verifix by the platform itself. Brigadirs exchange people, place arrivals in
cells and close the day on the same shift-day. The moment the brigadir closes,
the finished day is copied into `attendance` + `DayApproval`, so the загрузка
for that unit-day exists with no admin step. Days before the switch stay
exactly as they were filed. `/staff-live` is LEFT AS IT IS for now — the
operator: «Just make Verifix edit page support live edits, that's all. I'll
tell the fate of live page later.»

## The rulings

1. **Data path — copy at close.** The live read + live documents are the
   source of a live day; when the brigadir closes, the day is projected ONCE
   into `attendance` + `DayApproval`, so `build_metrics_list`, `day_state` /
   `idle_lock`, `/production`'s and `/idle-cell`'s locks, `/workers`, the
   heatmap and the gap reports change nothing. A reopen deletes the copy; the
   next close re-copies, so placements and exchanges are never wiped the way
   the Davomat re-save wipes them.
2. **The page is /staff.** `/staff` gets live editing for today. `/staff-live`
   stays as it is; its fate is a later decision. (Assumption, see below: on a
   live day `/staff` reads and writes exactly what `/staff-live` reads and
   writes, so the two pages can never show two different todays.)
3. **Today's look — one status column**, on live days only: inside · on a
   break · left · no check-out · moved. Nothing else of the live page's chrome
   (no strip, no split Keldi/Ketdi, no freshness line).
4. **Switch — whole plant, as soon as it ships, no pilot.** `LIVE_FROM` is the
   first shift-day that opens AFTER the deploy lands, for both shifts, so no
   shift already running is switched mid-way. A floor with no override, never
   moved later. **Brought forward to 2026-10-06 the same evening** (v4.253.1,
   the operator: «today's results are not appearing on Verifix edit page»):
   the deploy landed at 19:53, so shift 2's night of the 6th was already a
   live day by this rule, and shift 1's day of the 6th had just ended with
   nothing filed on the file side.
5. **Hours — «Отработано», as the file**: the Davomat read's own rule (kinds
   23 + 27 ÷ 60, or the parity rule), lunch deducted. The clock span shows only
   while a worker is inside, marked «so far».
6. **No check-out at the close — hold the close and name them.** The dialog
   lists every worker still without an exit an hour past the shift's end; the
   brigadir sets an exit time or marks them absent, one tap each, recorded as a
   document. The close proceeds only once the list is empty.
7. **Clock corrections — Verifix only.** No hours-edit requests on a live day;
   a wrong Verifix clock is fixed in Verifix and reaches the day through the
   read. Ruling 6 is the ONE exception (a missing check-out at close time).
8. **A worker still inside is exchanged by the live rule**: hours shared by
   the clock, the name to the side with more hours once the worker has left
   (ties to the sender), the 2-hour floor judged at departure. The row says
   which list the name will end up on.
9. **Only a worker who is inside can be moved** — a move is a fact, not a plan.
10. **Cross-shift moves allowed, as the live page does them**: the move lands
    on the receiver's same-date day. Consequence: a night → day move at 06:00
    lands on the day unit's already-closed yesterday and needs an admin reopen
    to place the worker.
11. **Close gates — inside and no-cell, hard, no override.** Refused while
    anybody is inside, on a break or still due, and while a counted worker has
    no cell. A request still waiting on somebody else does NOT block the
    close: the day counts in the fleet figures at once and reaches
    «confirmed» when decided (the existing ladder).
12. **The close is BY HAND**, with reminders (ruling 18). No automatic close.
13. **After the close the day FOLLOWS Verifix until the unit's next shift-day
    opens**, then freezes. Late check-outs and HR edits re-copy into
    `attendance` by themselves in that window; nobody edits anything.
14. **Verifix unreachable at the close — allow on a read younger than ~15 min**,
    its time named on the dialog; refuse on an older one.
15. **One lock, as today.** The close locks «Zagruzka fayli» and /idle-cell for
    that unit-day at once. The brigadir waits for the leaders and the typed
    ФАКТ; the close dialog says what is still open.
16. **The admin «Davomat» tab is refused on live days** (a message pointing to
    the page) and keeps working for days before the switch. An admin corrects a
    live day by reopening it and acting on the page.
17. **Per-day routing of a whole cell is gone.** A cell is its /cells brigadir;
    people move by exchange, a lasting change is made on /cells.
18. **Messages**: «everybody has left» to the brigadir (missing check-outs
    named); a reminder to the brigadir AND the shift manager when the unit's
    next shift opens with the day still open; the admins' per-unit «day closed»
    DMs folded into one line per shift; AND «your list is live» to the brigadir
    at the day's first clock-in. The morning «Verifix data uploaded» DM goes.
19. **Running-day figures elsewhere — after the close only.** ШТАТКА on
    `/production`, `/live` and the Overview trend keep reading «—» for today
    until the close.
20. **Attendance only.** The typed «Bugungi fakt» people and the SAP minutes
    are untouched; a unit nobody typed still reads a blank load after the
    close, and the «everybody has left» message says so.

## Settled by earlier rulings (not re-asked)

- A night belongs to the evening it opened — the shift-frame rule
  (`live_overview.shift_frame` over `cell_hours.defaults`). The one
  PRECONDITION: which calendar date Verifix files a night's report under has
  never been verified; the live read already reads both dates' marks, and the
  copy stamps the SHIFT-DAY.
- Only cells marked «Zagruzkada hisoblanadi» are read (`cells.in_load`);
  switching a cell off removes its people from attendance from the next shift.
- An exchange assigns NO cell; the receiving brigadir places arrivals on
  «Yacheykalar».
- A worker may be sent to any brigade with counted cells — the old «upload its
  file first» 409 has no meaning without a file.
- The page opens on the unit's current shift-day (the server names it), past
  days free, future refused. The empty picker and `/daily`'s «yesterday» go.
- The brigadir's own row is not read; a deleted worker's hours count nowhere.
- Roles: supervisor + shift-manager on `/staff`, unchanged. Test records on
  `/staff-live` are not the subject here (its fate is a later decision).
- `date.today()` in `close_day` and the stale-document guard moves to the plant
  clock (a correctness fix).

## Assumptions the build makes (say if wrong)

- **One truth per live day.** On a live day `/staff` serves the stored Verifix
  read + the live document tables (`live_documents`, `live_deletions`,
  `live_placements`, `live_day_closes`) — the same source `/staff-live` serves
  — so both pages show one today while both exist. Past days keep
  `hr_documents` + `attendance`.
- **The copy stamps the shift-day** and reproduces the file flow's row shape:
  `hours_worked` by the «Отработано» rule, `early_arrival_min` /
  `effective_hours` by `clock_metrics`, `verifix_code` the cell, `hc_weight` +
  `split_of` for a cell split, a nameless hours-only row for the receiver's
  extra hours of a cross-unit move, `is_supervisor` never set.
- **Following until the next shift** means the copy is re-taken by the minute
  job after the close while the unit's next shift-day has not opened, and the
  day's `DayApproval` stays — a re-copy never reopens the day.
- **`/kelish` and T11** must read the live days' Verifix placement from
  `LIVE_FROM` (the file's rows stop), or the lists freeze.
- **`/workers`' original-brigadir rewind** must read live exchanges from
  `LIVE_FROM`.

## Build outline

1. `services/live_projection.py` — the copy: live day → `attendance` rows +
   `DayApproval`, idempotent per (unit, shift-day), the fold-back of a reopen.
2. The close on `/api/staff` for a live day: gates (11), the no-check-out list
   with set-exit / absent (6), the recent-read rule (14), one fresh read first
   (13), then the copy, then the existing locks and notices (15).
3. The minute job: re-copy a closed day until the unit's next shift-day opens
   (13); the «everybody has left», «first clock-in» and next-shift reminders
   (18); the admins' folded «day closed» line.
4. `/staff` on a live day: the live source behind `StaffApiContext` for the
   day on screen, the status column (3), no hours-edit requests (7), the
   shift-day opener, the live exchange rules (8–10).
5. The Davomat tab refuses live days (16); `/kelish`, T11 and `/workers` read
   the live days; `date.today()` → the plant clock.
6. `LIVE_FROM`, the rule-book section, VERSION minor.
