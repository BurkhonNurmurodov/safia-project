# The leader checklist: configuration and filing

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## A leader's CHECKLIST may run on the other shift (`leader_shift`, 2026-10-05)

The operator's case: Jumaniyazov Sanjarbek leads a cell that works shift 1
while his brigadir is on shift 2. A leader's checklist used to take every clock
from the UNIT's shift; a leader profile may now name the shift its checklist
runs on, from a date (`role_profiles.checklist_shift`, a JSONB timeline
`[{from, shift: 1|2|null, at, by}]`, null = the unit's). Set on the admin
profile page («Chek-list smenasi», two options; the unit's own shift is stored
as "follow the unit"), always from TOMORROW. His was set once by
`startup.move_sanjarbek_checklist_shift` (flag
`leader_checklist_shift_jumaniyazov_2026_10_06_v1`, both entrypoints): shift 1
from 2026-10-06.

- **`services/leader_shift.py` is THE definition** — `current` (the shift +
  date being filed now), `shift_on` / `shifted` / `day_shift` (a date's shift),
  `standard` (a shift's rules), `chain` (the levels a resolver walks),
  `AsShift` (a unit read as running on another shift). Everybody without a
  timeline short-circuits and reads exactly what they read before.
- **What follows the leader's shift**: the checklist date (`_lt_shift`,
  `leader_proof.leader_shift`), the day close (`close_expired_days` holds each
  day to ITS shift; the sweep's `AUTOCLOSE_SHIFTS` bound is applied to the
  day's shift), task windows / deadlines / closing hours
  (`effective_leader_config` recomputes the shift for the day; the
  `leader_close` time functions seat hours on the entry's own `shift`), the AI
  (new review rows are STAMPED with the day's shift; `date_rule_for`,
  `criteria_for`, `sync_date_flags` and `routers/leader_ai._levels` walk the
  shifted chain), the automatic checks (`leader_auto._run_moved`, `check_hour`),
  «Vazifalar», the digest's "time up", the admin day views.
- **On a shifted day the unit's level is the shift's STANDARD** — per task and
  field the value most of that shift's units resolve to, the admin page's
  derived «Smena N» level (`shiftTpl`), cached 60 s. Unit-level example photos
  are skipped. The leader's own level applies, except a window or deadline that
  does not fit the day's shift.
- **What does NOT follow it**: the unit the leader belongs to (digest, concerns,
  загрузка, Monitoring pool and its shift filter, the register row's `shift`),
  and the collection layer (`leader_bot.merges` / `training` keep the UNIT's
  shift — a shift-1 reading there would drop his bot days from the register).
- **Dated, so history never moves**: days before `from` keep the unit's shift;
  verdicts keep the shift they were stamped with.
- A switch to the NIGHT shift leaves a gap (00:00–17:00 of its first date)
  where no day is open; `current` then answers the shift-2 date before it.

## The checklist config page (`/panel/ltasks`)

From **2026-09-07** the destination is «Chek-list sozlamalari» and it is TWO
tabs over one config, not the 22×13 brigadir×task matrix it was for a year.
`pages/admin/LeaderTasksAdmin.jsx`.

- **Why the matrix went.** It painted 273 cells to state 13 facts: every row
  carried the same weights, so the one thing the grid could show was the thing
  that never varied, while the settings that DO vary per unit were a 9px
  camera glyph, three 3px dots, or nothing at all. A window, a deadline, a
  criteria text had no cell to be wrong in — which is why a shift-1 window
  inherited by a shift-2 unit (the 26-Aug incident) was invisible until a
  leader lost points for it. The operator's own words were «this is chaos».
- **«Vazifalar» is a SHEET** — 13 task rows × the rule columns, read at ONE
  level chosen by a strip: Standart · Smena 1 · Smena 2 · a picked brigadir ·
  a picked lider. Every cell prints its value AND an origin tag naming the
  level that decided it, so «where did this come from» is answered on the cell
  rather than reconstructed. **`own` is a SERVER fact, never row existence** —
  the supervisor table is DENSE (265 rows carrying enabled/min_media/weight,
  212 criteria byte-copies of the global) because every side-field write
  materialises a full row, so "has a row" marks nearly everything as
  overridden. `leader_tasks.config_ownership` computes it as *value ≠ the
  parent's RESOLVED value*, unit against global and leader against the unit,
  and ships `own` / `own_leader` / `problems` on `GET /config`.
- **«Istisnolar» is the REGISTER** — one row per (scope, task, field) that
  differs, «qiymat ← meros» naming the parent LEVEL, grouped by shift. The red
  «Diqqat» banner counts windows that do not fit their shift and navigates
  here; the two counts apply the SAME `enabled` test, or the banner promises N
  and the table shows something else.
- **The Smena level is DERIVED, not stored.** There is no shift row in the
  data model — a shift template is identical values copied onto that shift's
  units, and the sheet computes it. A real `leader_task_shift_settings` level
  would be truthful and short, and it is deliberately NOT built: it means
  hand-editing ~13 resolver chains that the bot, the reviewer and the scoring
  all run through, in a repo with no tests. The page reads the same either
  way, so the level can be slid underneath later. **Seed and compare a shift
  edit against the TEMPLATE, never a sample unit** — against `unitsOf(shift)[0]`
  the skip-when-unchanged guard silently writes nothing on exactly the mixed
  cell the admin opened to make uniform.
- **The catalog is add / archive / reorder, never delete.** `leader_task_defs`
  carries `default_enabled`, `default_min_media`, `sort_order`, `active_from`,
  `archived_from`. Both dates are FLOORS compared against the SHIFT's effective
  date (`leader_tasks.effective_date(shift)`) — **never `date.today()`**, the
  26-Aug rule — and `catalog_floor()` is the LATER of both shifts' next
  effective dates, so a new task can never appear inside a night already being
  filed. `is_active`/`active_defs` feed the ACTIVE set (bot menu, sweeps,
  compute_completion, requirements_for); `ensure_task_defs()` keeps returning
  EVERY row for history readers, or a past report loses its task names and
  `task_weights` silently rewrites historical completions. Ids are explicit
  (`max(id)+1`, and the sequence is `setval`'d — it was seeded with explicit
  ids and still answered 1). A hard DELETE is refused by three FKs and would
  orphan nine plain-integer `task_id` tables.
- **Anything resolving a checklist must pass the DAY it means.** Once floors
  exist, `effective_leader_config(db, prof)` with no shift and no day answers
  for shift 1 today — and `close_expired_days` runs only on shift 2, only on
  days in the PAST. It and `autoclose_due` now resolve per day inside their
  loops, cached on the day; the same trap caught the submissions list and
  `admin_day_detail`. A stale night otherwise gets scored against another
  date's task set.
- The page keeps `cell_from` AND `per_task_close` / `bot_from`: they are
  constant today, but `PUT /admin/leader-tasks/unit` is their ONLY writer and
  this platform has no shell — CLAUDE.md records what an unset `bot_from` cost
  the camera pilot. All three materialise ONE `LeaderUnitSetting` row, so the
  writes are an awaited chain, never parallel.
- Retired with the matrix: the «1×1» chip, the four stacked name inputs (now
  `LangTextInput`), the column modal's second inline save, the archive channel
  at the top of the page (now a bottom disclosure), the second toast system.

## Temporary task hours (`leader_temp_hours`, from 28 Sep 2026)

From **2026-09-28** (the operator's request) a cell whose shift is moved for a
few nights moves its leader's checklist hours with it, on those nights only.
The first request: 4321 · 4322 · 4323 · 4325 · 4326 · 4121 · 4122 · 4123 · 4124
work 20:00–05:00 (+3h) and 4521 · 4221 19:00–04:00 (+2h) instead of 17:00–02:00,
nights 28.09 → 01.10 inclusive (shift 1 not freeing the floor before the
1 October holiday). `services/leader_temp_hours.py` is THE definition.

- **A dated rule, never a config edit — that is the whole point.** A window edit
  re-judges EVERY stored verdict of the task (`sync_date_flags` has no date
  bound), so writing the moved hours onto the chain for four nights would
  re-score every earlier night against them, and undoing it would re-score these
  four against the old hours. Here the move is a function of the NIGHT.
- **What moves, by the cell's own offset**: every task's photo window (and so,
  on these per-task units, when each task closes), a task's own `deadline`
  where one is set, and the hour of each AUTOMATIC check — per LEADER, by the
  operator's explicit call, although that hour is otherwise a unit decision
  (`_unit_due`). Hours move inside the shift and stop at its close (09:00): the
  3 Sep leader overrides for 6821/6822 follow the same cut. Tasks 1/9/8 on shift
  2: 02:00/06:00/09:00 at +3h, 01:00/05:00/08:00 at +2h.
- **The first night accepts both** (`accept_old`): on 28.09 each window runs from
  its OLD start to its NEW end — the leaders learned of the change that evening.
  Tasks the platform had already closed before the moved leaders arrived stay
  closed; the route back is «Kechikkan isbot» (the operator's call).
- **The request names CELLS; the mapping to LEADERS is frozen once** (`freeze`,
  one `AppSetting` row per request, written inline at boot by
  `startup.register_leader_temp_hours`, in both entrypoints) — a later
  reassignment can neither move these nights onto somebody else nor take them
  away from whoever worked them. A cell with no leader is only named.
- **Readers**: `effective_leader_config` (bot, camera, web checklist,
  «Vazifalar», every closing sweep), `date_rule_for(date=…)` (the reviewer),
  `sync_date_flags` and `routers/leader_ai._window` (every verdict card),
  `leader_auto._run_leader` + `check_hour(leader_id=, date=)`. Unit-level views
  (the admin sheet, `requirements_for` without a leader) show the unit's hours.
- **NEVER delete a request, nor its frozen row, once its nights have passed** —
  every boot re-derives every verdict, and without the entry those nights would
  be judged against the ordinary hours. This is history, not a one-shot.
- The moved leaders (`leader_temp_hours`) and both brigadirs
  (`leader_temp_hours_unit`) were DMed once, a minute after the freeze, behind
  their own flag (`<key>_dm`); the admins got the summary. A new request is one
  more `Request` in `REQUESTS` with a NEW key.

## The brigadir's day digest (`leader_unit_report`)

From **2026-09-15** (the operator's directive) a brigadir is no longer DMed once
per leader-day — six near-identical «Kun tasdiqlandi» messages spread over an
evening, and nothing at all about the leader who never filed. The unit's whole
day arrives as ONE Rich message: a table of every leader who owed a checklist,
what each scored, what was rejected (by task NAME, in the reader's language),
who is still in review and who never filed — with one button onto
**`/leaders/unit-report/:mid/:date`**, where each leader's own day report opens
in place. **The LEADER's own per-day DM is unchanged.**

- **`services/leader_unit_report.py` is THE definition** — `DIGEST_FROM`,
  `covers`, `build`, `note`, `sweep`. `services/leader_unit_rich.py` renders the
  rich body and the classic fallback lines and computes nothing. The ledger is
  `leader_unit_reports`, one row per (unit, date). Bell/classic keys:
  `leader_unit_report` and `leader_unit_report_corrected`.
- **It computes no score.** Every row is `leader_reports.day_report`, so the DM,
  the unit page and the day report cannot print two numbers for one leader-day.
  The one figure it adds, «Brigada natijasi», is `_unit_score` — the ONE-DAY
  twin of `unitSlots` in Leaders.jsx (the mean over every leader who owed a
  checklist, an unfiled one counting 0). Keep the two in step.
- **When it goes out** (`_ready`) — **as soon as the last leader's time is up**
  (the operator's ruling, 2026-09-15): every checklist the unit owed is closed,
  or the time of every leader still missing has run out — AND nothing is still
  in review (`_pending`, the `unfinished_reports` rule) or about to be closed by
  the platform. A leader's time is `_time_up_at`, read off the rule that already
  enforces it: on a per-task unit the LATEST `leader_close.due_at` of their
  enabled tasks — the hour `autoclose_due` locks the last one on, so 20:00 on
  shift 1 and 09:00 on shift 2 with the default windows — and on a day-close
  unit the day's filing deadline. It first shipped waiting for that deadline
  whenever anybody was missing, which put a shift-1 digest just after midnight,
  hours after the last task had closed; do not go back to it. `MAX_WAIT_MIN`
  (60) after the day became final — its last close, or its last missing
  leader's time — it goes out anyway, the rows still moving marked ⏳.
- **Two doors.** `send_for_uid` no longer DMs the brigadir for a covered day (a
  bot uid dated on or after the floor); after the leader's ledger commits it
  calls `note`, the fast path. `sweep` rides the 5-minute `leader_close._sweep`,
  AFTER both auto-closes, and sends the first digests waiting on a leader's
  time.
- **Updates are batched.** After the first send `note` only sets `dirty_at`, and
  so does the sweep for a checklist closed after `last_sent_at`. The update goes
  out once the unit has been quiet `CORRECTION_QUIET_MIN`, and only when a row's
  state or PRINTED score moved (`changes`, keyed by leader + cell, never by uid,
  so a late filer is one row moving from «not filed» to a score). Every change
  is named before → after. A row still in review stores no score, so its score
  drifting mid-review is not an update.
- **Rows**: one per checklist (a per-cell unit has one per cell), worst first —
  `rejected · missing · open · error · checking · noproof · verified ·
  excluded`. Owed = the unit's leader roster minus a cutoff or ANY exclusion on
  the leader-day (the day report stamps every row off one exclusion), expanded
  by `leader_cells.expected_days`. A rehearsal day is neither a row nor «not
  filed». A unit that filed nothing at all gets no digest — a holiday must not
  DM «0 / 6».
- **Parks** (`parked`, `sends = 0`) — outside the automatic regime, or nothing to
  report — so the sweep stops asking. `_lock` keeps the drain thread and the
  scheduler from sending one unit-day twice (one worker process). Ghost Mode
  returns before anything is written.
- **Scope**: `unit_scope_ok` is `report_scope_ok` for a unit, except a LEADER may
  not read it — it sets colleagues' scores beside theirs. 404 when out of scope.
- Everything before `DIGEST_FROM`, and every SHEET row, keeps the per-leader
  brigadir DM and its corrections. The floor must never move LATER.
- **One report component.** `components/leaders/DayReportView.jsx` is the day
  report, extracted from `pages/LeaderDayReport.jsx` (now a frame) so both pages
  draw one report; `embedded` drops the header, the width cap and the
  full-screen error. The day report's header links up to the unit page for every
  viewer but a leader. Logged as `report.unit_sent`.

## ONE checklist per CELL (`cell_from`)

From **2026-09-02** (the operator's directive) a supervisor unit can be switched
so its leaders stop filing ONE checklist a day and file a **complete separate
checklist for each cell they own** — its own day row, its own score, its own
report page and its own DM. **Nobody is switched by default**: units are
enrolled by hand, one, several or all at once, on the ltasks admin destination.

- **`services/leader_cells.py` is THE definition** — `unit_floor`, `floors`,
  `per_cell`, `is_per_cell`, `filing_cells`, `cell_ids`, `expected_days`,
  `self_check`. The bot menu, the register, the admin panel and the boot check
  all ask it; three spellings would give one leader three different checklists.
  `expected_days` is the one every caller should reach for: `[None]` = the
  single cell-less day the platform always had, `[ids…]` = one checklist per
  cell, `[]` = a switched leader with no cell, who files NOTHING.
- **The switch is a DATE, never a boolean** — `LeaderUnitSetting.cell_from`,
  beside `per_task_close` and `bot_from` and written by the SAME single writer
  (`set_unit_settings`; two parallel writes race that row's key — the trap the
  five ltasks fields fell into on 2026-08-19). Days before the floor are read
  exactly as they were filed, so **old results never change** — enforced by a
  comparison every reader makes, not by a migration that leaves history alone.
  **Clearing the floor is the rollback**: new days are cell-less again from the
  next effective date and the per-cell days already filed stay readable and
  scored, with no migration either way.
- **The floor is compared against the SHIFT's effective date**, never the
  calendar day. Shift 2's night belongs to the date its 17:00 boundary opened,
  so a floor of "today" set at 15:00 makes tonight the first per-cell night.
  Comparing against `date.today()` starts a night shift a day late — the class
  of bug that closed shift-2 tasks before their windows opened.
- **`uq_ltask_day` is an EXPRESSION index and that is load-bearing**:
  `(leader_id, date, COALESCE(cell_id, 0))`. Postgres treats NULLs as DISTINCT
  inside a unique key, so a plain three-column constraint would accept two
  cell-less days for one leader and hand the bot an arbitrary one — the very
  breakage the original constraint prevented, reintroduced by widening it
  naively. `COALESCE` folds every pre-switch row onto one value, so the
  guarantee for a cell-less day is byte-for-byte the old one and **no data
  migration is needed**. Same shape for `uq_leader_day_exclusion`. Every
  `cell_id` lookup must use `IS NULL`, never `== None`.
- **Which cells: plain OWNERSHIP** (`cells.leader_id`), automatically — assign
  one on `/cells` and the checklist follows. `in_load` is deliberately NOT
  consulted: it answers whether a cell counts toward the загрузка (the
  register's «Zagruzkada hisoblanadi»), a different question about a
  different register.
- **A leader with no cell files NOTHING** on a switched unit and the bot says
  so («Sizga yacheyka biriktirilmagan»), rather than showing an empty menu.
  Enrolment is REFUSED for a unit whose leaders own no cells at all, naming the
  count, because that would switch a unit into silence.
- **The bot threads the cell inside the `pid` SEGMENT** — `_lt_ref` / `_lt_who`,
  `"192"` or `"192c108"`. There are forty `lt:` emitters and ONE parser, so no
  callback grows a field and no handler's `parts[…]` indexing moves; the longest
  shape is 21 bytes against Telegram's 64. `/tasks` → profile pick → **cell
  pick** → that cell's task menu, and «Orqaga» returns to the cell picker. A
  button minted before the switch carries no cell, so `_lt_menu` sends it back
  to the picker rather than opening — and on the first answer creating — a
  cell-less day nothing belongs to. `LeaderTaskCapture.cell_id` carries it
  through the photo/reason handlers, which run off the capture row, not a
  button.
- **Everything downstream came along for free**, because every key there is a
  ROW id: `bot_ref` (`bot:{entry_id}`), `report_key` / `day_uid`
  (`bot:{day_id}` / `bot-{day_id}`), disputes on `ref`, late proofs and camera
  rolls on `(day_id, task_id)`. The AI pipeline, the day report and its DM
  ledger, the objection chain, late proofs and `compute_completion` are all
  untouched. **The frontend scoring core is untouched too** — `slotsBy` already
  averages several rows onto one day (built for the sheet layer's double
  filings), so a leader's day is the MEAN of their cells and `winDays` counts
  days, not rows. **Never "make the scoring cell-aware": it already is.**
- **One DM per cell** (the operator's call), the sender unchanged; the cell code
  is appended to the `date` param so the four templates carry it untranslated.
- **The register grows ONE column** — «Yacheyka», `CellLink` on the verifix
  CODE, rendered only when a row on screen has one. No cell ranking (the
  operator's call). `/leaders/report/:uid` prints the code as a chip.
- **Exclusions are per cell-day, and `cell_id IS NULL` means the whole
  leader-day** — that is both every exclusion recorded before this existed AND
  the «all this leader's cells» shortcut, stored as one row rather than N.
  `leader_exclusions.for_row` honours both, narrower first. `profile_days` (the
  AI queue doors, the report park) deliberately reads WHOLE-day rows only: a
  per-cell exclusion silences one checklist, not the day.
- **The boot self-check names the consequences** (`leader_cells.self_check`,
  printed with the deploy output): every switched leader with no cell, every
  cell with no leader, the checklist volume each unit now produces, and any
  per-cell day whose unit is no longer switched. This repo has no test suite and
  a push to `main` is a deploy.
- Admin: the «Brigada sozlamalari» modal on the ltasks matrix (a blue `Grid3x3`
  chip marks a switched unit) → `PUT /admin/leader-tasks/cell-from`, which takes
  a **LIST** so one toggle and a bulk press are one call and one transaction.
- Deliberately NOT changed: the Google Form (history only — every unit files in
  the bot), `merges()`, `LeaderDaySource`, `LeaderLateRequest`, cutoffs, and the
  per-task closing sweeps, which are all per-DAY and needed nothing.

Related memory: `per-cell-checklist-decisions`. Full plan and the rejected
shapes: `docs/plan-per-cell-checklist.md`.

## Per-task submission (`per_task_close`)

From **2026-08-19** a supervisor's unit can be switched from closing a DAY to
closing each TASK. Set per SUPERVISOR — `LeaderUnitSetting.per_task_close`,
`PUT /admin/leader-tasks/per-task`, the «Brigada sozlamalari» modal opened by
tapping the brigadir's NAME in the ltasks matrix (a `1×1` chip marks an enrolled
unit). Absent row = off, so nothing moves until an admin switches it.

- **Deliberately NOT on the global → supervisor → leader task chain.** It is not
  a property of a task, and a chain has a level that means "everybody" — which
  is exactly how the camera setting reached every leader on the platform twice
  on its first day.
- **Filling a task and SUBMITTING it are two different acts.** Proofs, answers
  and retakes save as they always did; «Vazifani yopish» is what locks the task
  and hands it to the AI. From 2026-10-19 the button is ALWAYS on the task's
  screen: live once the task is complete (Ha + all required photos, or Yo'q +
  reason), DISABLED before that with what is missing as its label
  («🔒 Yopish uchun yana 2 ta rasm kerak») — Bot API 10.3's disabled button,
  which sends no callback at all. It used to be left off the screen because
  Telegram had no disabled button. A Yo'q draft is always closable (its reason
  is saved with the answer), so «no reason» is not a state this screen has.
- **Closing is FINAL for the LEADER.** Nothing they press and no config change
  reopens a closed task; switching the unit back to day mode does not either.
  `leader_close.locked(entry, day)` is THE predicate and every writer consults
  it (the bot's entry writer, the shared reset core, both camera writes). It
  reads BOTH locks always, so outside this mode it answers exactly what it
  always answered: an entry is frozen once its DAY is closed.
- **An ADMIN has the one way back** (from 2026-08-26): «🔓 Qayta ochish» and
  «🗑 Tozalash» on the locked-task screen in the bot, and on a CLOSED day the
  menu rows stay tappable for admins so a locked task is still reachable — on a
  per-task unit the day is closed precisely BECAUSE its tasks are. Without it a
  task submitted by accident, or shot against the wrong standard, was frozen
  for good with no route out but editing the database, and this platform has no
  shell. **`leader_close.reopen_task` is THE definition** and it is admin-only,
  checked in the handler and not merely by hiding the buttons.
  - It lifts **both** of `locked()`'s locks — the entry's `closed_at` and the
    DAY's, which `maybe_close_day` wrote when this task closed. Lifting one
    hands back a lock the leader cannot see and nothing else can reach.
  - **The verdict goes with it.** `queue_task` dedupes on `bot:<entry_id>`, so
    a review row left behind lets the re-close pass silently and the OLD
    verdict judge NEW photos. Deleted, never re-queued (a `pending` row is
    drained within minutes, before anything has been redone); the next close
    re-creates it from the ref. Live objections to it are cancelled with it
    (`_retire_disputes` — deliberately not `supersede_dispute`, which answers
    "a later ruling contradicted this" and so only touches settled rows).
  - **The report is not recalled** — a DM cannot be. The re-close re-scores the
    day and `resend_if_changed` sends the correction, the same path a re-review
    or an upheld dispute takes.
  - **The grace lives on the DAY** (`LeaderTaskDay.reopened`, a task-id list,
    read through `leader_close.reopened_tasks`), NOT on the entry: «Tozalash»
    deletes the entry, and without a grace that outlives it `autoclose_due`
    re-closes the emptied task as "not done" on the deadline that already
    fired, within five minutes, in front of the operator.
  - **NO sweep re-closes a reopened task, and `_awaiting_reopen` is the ONE
    predicate both consult** (fixed 2026-08-27). The grace used to fall back on
    the DAY's filing deadline (`{}` down `closing_time`'s chain), which is in
    the PAST for every reopen that matters — a shift-2 day is only locked once
    09:00 has gone by — so `autoclose_due` re-closed the task on an hour already
    spent, and `close_expired_days`, which never read `reopened` at all,
    re-stamped the day around it. Two doors, five minutes, no message: the
    reopen was inert on shift 2 from the day it shipped. A reopen is a PERSON
    deciding a task must be redone, so a person closes it — the leader
    re-submits, or an admin closes or empties it again. The day stays open until
    then and shows on «Tozalash» → «Yakunlanmagan», which exists to expose
    exactly that; a stale id in `reopened` can never strand it, because
    `_awaiting_reopen` only holds while the task is genuinely unfinished and
    `maybe_close_day` closes the day the moment the last one is in.
  - «Tozalash» is reopen PLUS the ordinary `_lt_reset_task`, so «empty» goes on
    meaning exactly one thing. Both actions confirm first and are recorded
    (`checklist.task_reopened` / `checklist.task_reset`, actor + what was
    lifted).
- **One task, one review.** `leader_ai.queue_task` is the per-task door beside
  `queue_report`, under the same rules (review floor, shift pause, "no photos ⇒
  not reviewable") — a unit judged by two definitions of a submission would be
  judged by neither. The lock is committed BEFORE the queue write: a queue
  failure must never leave a task the leader was told they submitted editable.
- **The day closes itself** when the last enabled task is closed
  (`maybe_close_day`), stamping `completion` exactly as the button did. That is
  what keeps the register, the score, the day report and disputes working with
  no knowledge of this module. The report DM (leader + brigadir) fires then.
- **A task closes itself when its own time runs out, and `leader_close.closing_time`
  is THE definition of when that is** — one function, because three surfaces
  read it and three spellings would tell one leader three different hours: the
  sweep that closes the task, the bot's `pt_auto` line on the draft view, and
  the «Vazifalar» card (`closes_at`, served only for per-task units). The chain,
  narrowest first: the per-task `deadline` where an admin set one → **the END of
  the task's own submission range (`window`)**, which is what a task normally
  carries (the user's ruling, 2026-08-21: a range is given to every task, so the
  task closes when its range runs out instead of surviving until midnight) → the DAY's filing deadline (`deadline_hhmm`) for a task with neither, so
  nothing is ever endless.
  - **`date_check` / `time_check` do NOT gate this.** They answer whether the
    clock transcribed off the PROOF is judged; this answers how long the task
    accepts work. Gating on them would have made the feature silently do nothing
    for exactly the units most likely to want it — the camera pilot, whose
    proofs are dashboard screens in date-only mode. The fairness is bought by
    SAYING the hour on both surfaces the leader reads, not by withholding it.
  - **A task that has not STARTED is never force-closed** (`not_started` /
    `starts_at`, 2026-08-27). The operator's own reading of the 26 Aug night,
    and the one that explains its shape: what was closed at the beginning of
    that shift was precisely the tasks **whose start time had not come yet**.
    The leader then worked through what was left by hand, and when the last of
    those landed `maybe_close_day` counted 13 of 13 closed and ended the day at
    22:36 — mid-shift, hours before its 09:00 deadline — sending the whole night
    to the AI. So the early day-close was never a separate bug: a partial
    mis-close converts itself into a full one, because a force-closed task
    counts toward «all tasks closed» exactly like a filed one.
    The anchor fix stops a window being seated on the wrong DAY; this stops the
    whole class, **including a window that cannot open inside its shift at all**
    — 705 shapes on shift 2, every window opening between 09:30 and 16:30, where
    the day's own filing deadline lands before the window's opening. Such a task
    is left OPEN rather than recorded not-done, so it never ends the day out
    from under a leader who is still working. What SCORE an unstartable task
    should carry is a separate question and deliberately unanswered here.
  - **The day's filing deadline is a CEILING on every task, not just the
    fallback** (`closing_time`, 2026-08-27). `close_expired_days` ends the whole
    checklist on that hour knowing nothing about per-task clocks, so a task
    whose own clock lands after it can never reach that clock — yet the platform
    printed it on both surfaces the leader reads and then locked the task on the
    earlier hour, recording it not-done. A shift-2 task carrying the 26 Aug
    incident's own «08:00 — 10:00» window said 10:00 and was closed at 09:05:
    one hour instead of fifteen, the same defect. The clamp compares
    `_shift_pos` tuples, never clock strings — a shift-2 evening close at
    «23:00» is EARLIER than the day's «09:00», which lands the next morning —
    and it changes only what is PROMISED: over all 4,608 configs the instant a
    task actually stops accepting work is unmoved, while 2,871 promised hours
    became the true one. Because `autoclose_due` runs before the day sweep in
    `_sweep`, a short camera roll now reaches the AI through `force_answer`
    instead of being recorded not-done by the day close.
  - **The rules assert themselves at boot** — `leader_close.self_check()` walks
    every clock a config can carry on both shifts and returns every violation of
    four invariants: no shift-2 close before the shift opens, no close after the
    day's own filing deadline, the hour PRINTED is the hour that fires, and an
    unclamped range closes exactly where `leader_ai.date_window` does. Wired
    into both entrypoints via `startup.report_leader_deadline_rules`, which
    prints with the deploy output AND DMs the support chat / every admin,
    because this repo has no test suite, a push to `main` is a deploy, and this
    platform has no shell — a log nobody can open is not a warning. Twice a task
    has been closed at an hour nobody intended and the only signal either time
    was a leader losing points.
  - **Which DAY the closing hour falls on is `leader_ai.window_offset`, the
    same one anchor the REVIEWER uses** (`leader_close.due_at`). A task's hours
    are written in shift hours, so «08:00 — 10:00» on a night shift means the
    morning AFTER the evening its day is named for. Deciding it here instead,
    by the platform's crossing-midnight rule (`end <= start`), is what broke on
    2026-08-26: that rule cannot see the shift, a shift-2 window of 08:00→10:00
    does not cross midnight, so the close was pinned to 10:00 on the REPORT
    day — hours before the night began. Every task carrying a window written in
    shift-1 hours was therefore past due the instant its day existed:
    `autoclose_due` closed a shift-2 unit's whole checklist at the START of the
    shift, locked it forever and sent it to the AI, which failed the photos
    against a window that had not opened. The reviewer was anchored to the
    shift on 2026-08-22 and this was not; **two anchors for one window is how a
    task closes before it opens, so never re-derive this one.** `overnight` is
    then applied only to a real RANGE — a bare clock (an admin `deadline`, the
    day's filing deadline) is one hour, and `window_offset` already seats it in
    the shift: 22:00 that same evening, 09:00 the morning after. That replaced
    the blanket "+1 day for shift 2", under which an evening deadline landed a
    full day late, past the 09:00 the day sweep closes at, so it never fired.
  - At the hour, `autoclose_due` submits whatever exists — a roll short of
    `min_media` still goes to the AI and is judged as it stands, and a DRAFT
    (answered, never submitted) is submitted with its answer and photos intact,
    because `force_answer` returns an existing entry rather than replacing it.
    Only a task with NO answer is recorded not-done with the missed-deadline
    reason — **stamped with the TASK's own closing hour** (`task_deadline`, the
    hour that fired: `__missed__|08:30`), never the day's filing deadline.
    Every reader prints the sentinel as «did not submit this task before
    HH:MM», so the day's 23:59 on a task that shut at 08:30 contradicted the
    bot's late-proof screen (2026-09-23). The day-level close
    (`close_expired_days`) still stamps the day's deadline, because that is the
    hour it fires on. Rows written before the fix keep their 23:59 / 09:00.
  - **Enforcement is per-task units ONLY.** `autoclose_due` is bounded to
    `per_task_units` and the other two readers are per-task surfaces; outside
    them the field stays informational, per the 2026-08-15 ruling. The sweep
    runs on a 5-minute job AND on every `/tasks`: a deadline that bites only
    when a scheduler happens to run is not a deadline.
- **The menu carries a running score** — `leader_close.score_line` → «🎯 24/30 ·
  ⏳ 2 tekshirilmoqda». Earned over the weight of REVIEWED tasks; a task waiting
  on a verdict is in NEITHER number. A pending task counted as 0 would make the
  score fall as the day went well, which teaches leaders to stop reading it.
- Row marks come from `leader_close.task_state`: open · ✏️ draft · ⏳ pending ·
  ✅ passed · ✖️ notdone · ⏱ expired · ⚠️ rejected. **The last three were ONE
  state wearing ONE ⚠️ until 2026-08-27**, and leaders read the triangle as an
  accusation whichever had happened (the operator's report): choosing «Yo'q»,
  running out of time, and having a proof refused are three different facts with
  three different things to do about them. ⚠️ now means exactly one — somebody
  looked at your proof and refused it. `FAILED_STATES` is the set, so anything
  asking only "did this go wrong" tests membership instead of comparing to a
  word. `_lt_pt_task_view` is the task's own screen (draft or submitted); a
  submitted one offers nothing but the way back, because there is nothing left
  that can be done to it.

Related memory: `leader-per-task-submission`.
