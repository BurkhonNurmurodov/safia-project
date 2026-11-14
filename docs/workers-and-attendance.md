# Workers, cells and attendance

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## A worker belongs to a CELL, and the supervisor says which

From **2026-08-30** the cell on a worker's row is answered in two places, and
only two: the day's read (Verifix from 2026-10-04, the daily file before), and
the receiving supervisor.

- **The read still assigns the cell.** The employee's Verifix org unit — the
  «Код подразделения» of the Excel days — resolves to a cell, the admin
  «Davomat» Save writes it onto every worker, and nothing about that changed.
  Almost every row is placed before a supervisor ever looks at it.
- **An accepted people-exchange assigns NO cell.** The sender picks the
  receiving SUPERVISOR and nothing more; on approval the moved row's
  `verifix_code` becomes NULL. The old flow made the sender choose one of the
  RECEIVING unit's cells — a guess about somebody else's shopfloor, made before
  the shift had run, by the one person who cannot know the answer.
  `_resolve_exchange_target` no longer resolves a cell, `_build_exchange_payload`
  no longer stores one, and all six attendance writes in the two apply paths set
  NULL unconditionally — **including for a document filed under the old rule
  whose payload still carries `target_cell`**, because honouring that key would
  drop the worker into a cell the receiving supervisor never chose. The
  sender-side `old_verifix_code` is untouched, so a revert still restores the
  original cell exactly.
- **The day will not close while anyone is cell-less.** `staff._unplaced_workers`
  is THE predicate and `POST /api/staff/daily/close` answers **409** — for a
  supervisor and for an admin closing on their behalf alike. There is no
  override: a worker with no cell is a worker whose hours belong to no cell's
  load and to no cell's headcount, and that is not reconstructable afterwards.
  Three exclusions, each of which makes the gate UNCLEARABLE if dropped: the
  unit's own **brigadir** (`is_supervisor` — written cell-less on every
  re-projection, and no placement can ever give them one, so counting them locks
  every unit out forever), **nameless** hours-only leftovers (the tab cannot show
  them, so nobody could name one into a cell), and rows that did not come
  (`CALC_ROWS_FILTER` already demands hours > 0). `CELLS_REQUIRED_FROM`
  (2026-08-01) is the floor: every row before the single-file «Davomat» flow is
  cell-less by construction, and an admin can reopen any historical day.
- **The refusal is a plain STRING and it is capped at five names.**
  `utils/api.js` rewrites any non-string `detail`, and both close dialogs render
  `detail` only when `typeof d === "string"` — so a structured 409 arrives as the
  generic "save failed" with the reason stripped off, which is the one outcome a
  hard gate must never produce. `ConfirmDialog` has no max-height and no scroll,
  so an uncapped name list pushes the buttons off-screen.
- **`GET /api/staff/approvals/day` publishes `needs_cell` before the press**, off
  the same predicate, so the tab badge and the refusal can never name different
  people.

### Where they are placed («Yacheykalar», a tab on /staff)

`components/staff/CellPlacementPanel.jsx` over `GET`/`PUT
/api/staff/cell-placement`. Cell-less workers first, then the unit's cells with
their people — the admin «Davomat» tab's shape, asked one level down.

- **Everything is a DRAFT until Save**, one PUT, one action-log row. A
  supervisor rearranging their shift should be able to change their mind before
  anything is real.
- **The destination list is the REGISTRY**, unioned with whatever codes the day's
  rows already carry. `/api/staff/attendance`'s `cells[]` is derived from codes
  PRESENT in today's rows, so on its own it can only ever offer a cell that
  already has somebody standing in it — an empty cell would be unreachable. A
  code the registry has never heard of is shown, never dropped: the two
  registers are allowed to disagree, in public.
- **Reading follows the page's scope; WRITING is the unit's own business.**
  `_can_edit_placement` — admin, or this unit's own supervisor. A supervisor
  widened by a page grant may BROWSE another unit and must not rearrange its
  people, the rule `canCreateHere` already applies to documents on this page.
  The tab itself is visible to admin · supervisor · shift-manager.

### A worker split across two cells

A worker who moved cells mid-shift is **named in both and counted as a FRACTION
of a person in each**, pro-rata by hours.

- **Two Attendance rows**, the second carrying `hc_weight` (its share, the halves
  summing to 1.0) and `split_of` (the primary row's id). Both keep the NAME —
  the worker is on this supervisor's roster either way, so stripping the name off
  the smaller side (what a cross-unit split does, where the name really does
  leave a roster) would be a lie here.
- **`hc_weight` is what keeps the arithmetic honest.** `idle_source` and
  `kpi_calculator` sum weights instead of counting rows, so each cell sees a
  fraction — and because both halves sit in the SAME unit the weights add back
  to exactly 1.0, so **no unit total moves**. `hours_worked` is split the same
  way and also sums to the original.
- **`_split_hours` is deliberately NOT `_compute_split`.** That one answers how a
  day divides between two UNITS, with an early-arrival rule, a return window and
  a minimum-hours test that can strip a name. None of it applies inside one unit.
  The clock is used only for the RATIO; the halves are scaled to sum to exactly
  the recorded hours.
- **`split_of IS NULL` makes the PRIMARY row canonical.** Seventeen name-keyed
  `.first()` lookups in `staff.py` — admin edit, admin delete, bulk delete,
  edit-request approve/reject/restore, and every exchange apply/revert — assumed
  one (manager, date, worker_name) could only ever match one row. Each now
  carries the guard, or a split worker's admin edit would land on an arbitrary
  half.
- **`Float`, never `Numeric`.** `hours_worked` is `Numeric(10,4)` and SQLAlchemy
  returns `Decimal` for it, which is why every reader wraps it in `float()`. A
  Decimal weight summed into a float accumulator raises `TypeError`.
  `Attendance.hc_weight` must also stay in `idle_source`'s EXPLICIT column list —
  that query selects columns, not the entity, so an omitted one is an
  `AttributeError` inside `build_metrics_list`, i.e. Overview, the Zagruzka
  heatmap, the comparison and the brigadir profile.
- **`verifix_hc` is a FLOAT on the wire now.** Every render of it and of `hcDiff`
  must be formatted, or a split prints IEEE noise.
- **Undo is `unsplits`**, carrying the SECONDARY row's id: the halves were scaled
  to sum to the original and the clocks were cut `C-T` / `T-O`, so both restore
  exactly without a stored copy of either.
- **`_merge_split_halves` is THE fold-back and it must run wherever a row LEAVES
  the unit or stops existing.** A split is a fact about a worker inside ONE
  unit, so the moment their row moves the halves must stop existing too —
  otherwise the same worker-day is named on two units at once, each counting a
  FRACTION of them. Six sites change a row's unit and all four exchange paths
  need it: both applies and both reverts. The round-1 fix landed on three of the
  four and the missing one (`_revert_split_exchange`) orphaned the secondary on
  the unit the worker left. `_drop_split_secondary` is its twin for the four
  DELETE paths — there the worker-day is going away, so there is nothing to fold
  the hours back into.
- **A fold-back INVALIDATES the exchange's stored snapshot, so it is re-taken.**
  This is the subtlest trap in the whole feature and it destroys hours silently.
  The payload snapshots the worker's row when the document is FILED; for a split
  worker that row holds only `h1` and the cut clock `C-T`. Folding the halves
  back at APPLY time restores it to `h1+h2` / `C-O` — and `_compute_split` then
  divides the STALE snapshot, CLAMPING the transfer time into the old window
  instead of refusing, so `part1+part2` sums to `h1`, the writes overwrite the
  row with it, and `h2` is gone from every load figure with no leftover row to
  show for it. `_snapshot_row` is the one shape and both applies re-take it
  whenever the fold-back returns True.
- **`effective_hours` divides pro-rata too**, and the merge sums it back. It is
  what the загрузка reads where it is set, so blanking it on a split would
  quietly move a cell's load the moment somebody was placed.
- **An admin edit reaches BOTH halves, and an HOURS edit folds first.**
  `job_title` and `schedule` describe the person and belong on both rows —
  leaving one behind puts the halves on opposite sides of `is_direct_role`.
  `hours_worked` restates the whole DAY, and a division of the old total cannot
  describe the new one, so the split is folded back and the supervisor re-makes
  it. Every DELETE and EDIT snapshot records `_whole_day_hours`, or the undo
  restores the worker with a fraction of their day and the rest existing nowhere.
- **`unsplits` is de-duplicated.** `SessionLocal` is `autoflush=False`, so a
  `db.delete(sec)` that has not been flushed is still returned by the next query
  and re-mapped onto the same instance — a repeated id folds the same hours in
  twice.
- **Anything counting PEOPLE must sum `hc_weight`, not rows.** The /staff KPI
  cards, the role chips and the load denominator all do; `/api/staff/attendance`
  deliberately returns BOTH halves (the tab needs them), so a plain `.length`
  there reports a split worker as two people on the very page the split is made
  from.

**Known limit, inherited and NOT fixed here:** `attendance_batch._sync_manager`
(and the per-supervisor upload in `admin.py`) DELETE the whole (manager, date)
and rebuild from `AttendanceBatchRow`, which carries no placement and no weight.
**Re-saving a day's batch after a supervisor has placed people undoes their
work**, exactly as it already loses exchanged workers (`exchange-lost-workers-audit`).
A replay for it is a separate decision — ask before building one.

### /staff-cells is GONE

«Verifix to'g'irlash (yacheyka)» — the cell-level exchange page — is deleted
whole: `pages/StaffCells.jsx`, `routers/staff_cells.py`,
`services/cell_exchange.py`, `services/cell_scope.py`, the `staff-cell` page key
and its grants, its 245 translation keys, and the sandbox `HrDocument` rows it
filed (`startup.purge_cell_exchange_sandbox`, flag
`cell_exchange_sandbox_purge_2026_08_30_v1` — changing what it does needs a NEW
flag key). Every document is real now, so `approvals.py` and `doc_audit.py` lost
the TEST/REAL fork entirely and `_real_docs` keeps its whitelist for the other
reason: a register that serves every type must not surface one no reader has
decided the meaning of. `services/day_state` goes on hand-copying that tuple —
see the comment there.

## «Odam soni» — three pages, not three tabs (2026-11-03)

The operator: «Move this page's 3 tabs as 3 pages to the sidebar». /workers'
«Davomat» · «O'zgarishlar» · «Tarkib» tabs are three routes and three sidebar
rows (group `people`, in that order): `/workers/attendance`
(`pages/workers/WorkersAttendance.jsx`), `/workers/movements`
(`WorkersMovements.jsx`), `/workers/composition` (`WorkersComposition.jsx`,
`RequireAdmin`, an `adminOnly` row — its endpoint answers admins only).
- The first two stay on the ONE page key `workers` — a grant opens both, the
  Access tab still names it «Odam Soni» (`nav.workers`), and `PAGES` lands on
  `/workers/attendance`. `/workers` itself redirects there (`WorkersRedirect`
  in App.jsx, query kept), so old links, bot buttons and remembered home
  routes keep working.
- No row is a path prefix of another: a `/workers` row would light up on
  `/workers/movements` too (NavLink and `isLinkActive` are segment-prefix
  matches), which is why the first page is `/attendance`, not `/workers`.
- Shared chrome is `components/workers/WorkersPage.jsx` — the frame (header
  «Odam Soni · <page>», the one-row filter bar; `period={false}` on «Tarkib»),
  `ChartCard`, `ScopeSwitch` — plus `chartBase.js`. «Davomat» and «Tarkib»
  share `workers_scope`; the old `workers_view` key is gone. Each page fetches
  only its own data (headcount + trend + verifix-kinds · requests-analysis ·
  demographics).
- **«Davomat» ends with «Verifix — vaqt turlari»** (2026-11-04, moved from
  «Hisobotlar», which keeps only overtime) —
  `components/workers/VerifixKindsCard.jsx` over `GET
  /api/workers/verifix-kinds`: Явка, Отсутствие, Свободное время, Отгул,
  Ранний уход, Опоздание in hours, Verifix's own MONTHLY sums
  (`verifix_month_kinds.ATTENDANCE_KINDS`, the stored read the report uses).
  The page's period picks which months — every month it touches from the
  first closed day (`brigadir_board.data_floor`), the newest three
  (`VK_MAX_MONTHS`, the cut named in the footer) — and each column is the
  WHOLE month (the running one «1–N», so far). Plant / shift / brigadir narrow
  it (`scoped_manager_ids` + `Manager.shift`, every unit, not only
  `zagruzka_on`); the page's «Jami / Zagruzka» switch reads all workers or the
  direct half («<id>:d»). A month never read is «—», named in the footer, read
  in the background and polled every 30 s until it lands. No change column: a
  running month against a whole one says nothing.

## The three «Odam soni» pages, redesigned (2026-11-13)

The operator: «act like ui/ux expert and improve the design of Attendance,
Movements and Composition screens». Every figure, endpoint and rule above is
unchanged; what changed is what each page leads with and how it is drawn.

- **One population switch, in the toolbar.** «Jami / Zagruzka» sits at the far
  end of the one filter row (`WorkersPage`'s `right` slot) and moves the WHOLE
  page. It used to be repeated in the header of six cards on «Davomat» (each
  beside a second «Ro'yxatda / Kelgan / Farq» switch), and the KPI row ignored
  it. Now «Zagruzka» recomputes the tiles, the day chart, the heatmap and the
  table from each day's `z_*` halves. «Ro'yxatda / Kelgan / Farq» survives
  only as the table's ROLE-column option, the one place it changed anything
  the other columns did not already show.
- **«Davomat» reads top to bottom**: four tiles — the rate (32px, a meter
  against the 90% line, `ATT_FAMILY.ok`), the list split came / leave / absent,
  «Below 90%» naming the three lowest brigadirs, the shortfall naming the
  three units most under the reported headcount (the last two sort the table
  and scroll to it); then **«Kunlik davomat»** — the plant's rate per day off
  the heatmap's own cells, each point in its band, the live days dashed, a
  readout UNDER the chart (rate, list, came, absent, who came by role; idle =
  latest day) — beside **«Lavozimlar bo'yicha»** (came / on the list per role,
  tail folded); the heatmap; the brigadir table with an inline list bar and a
  pinned «Jami» row, a card list + a row dialog on a phone; Verifix's months.
  **Removed**: the role donut, the stacked-area role trend (both now the role
  card + readout) and the 560px treemap (its sizes are the table's list bar).
  The day chart reads a second `/headcount` only when the period is under 7
  days (`padChartParams`); folded into weeks / months past 92 days.
- **«O'zgarishlar»**: two request types are blue (exchange) and purple (role
  change) — they were the palette's red and green and read as a traffic light;
  tiles split requests by type, exchanged workers by brigadir / task, name the
  three biggest role transitions and «Tasdiqlanmagan» (pending, sorts the
  table); requests by day over the whole period (empty days are 0); «Sent to
  tasks»; **«Kim berdi, kim oldi»** — lent out left, received right, one scale
  (received comes from the targets, joined by `target_manager_id`, which
  `requests-analysis` now sends on a «→ brigadir» target, name as fallback);
  the transition matrix with column totals (the «by new role» chart it
  duplicated is gone) and an «Other transitions» row when the 20-pair cut
  drops some; a sortable table with lent / received / pending.
- **«Tarkib»**: one toolbar row (read time, refresh icon, switch); five tiles,
  each share with its bar (women / men, under 25, under a year, the top
  district) — the gender donut is gone, its split is the «Ayollar» tile; age
  and tenure side by side, the place list across the width in two columns (three
  in one row was tried first; the operator, 2026-11-14: «dont squeeze like that»); the place list's «others» fold is slate.
- New template `components/ui/Meter.jsx` (`Meter`, `SplitBar`, `SplitLegend`,
  `FigureList`); `KPICard` gained `size="lg"`, `unit`, `children`, `className`.
- Every page now says when its data FAILED (red `EmptyState` + retry) instead
  of «no data».

## «Tarkib» — who is on the lists (`/workers/composition`, 2026-10-23)

The operator: «In this Workers can we have analysis of woman/man share, workers
age, experience and living place with the help of Verifix data». A third tab
beside «Davomat» and «O'zgarishlar» — «Tarkib» (uz_cyrl «Таркиб», ru «Состав»,
en «Composition») — over `GET /api/workers/demographics`
(`routers/workers.py`), built by `services/workforce.py` (the read, its
storage, the fold) and `services/workforce_place.py` (THE address → place
rule); the page is `components/workers/Demographics.jsx` with its own text
bundle `demographicsText.js`.

- **What Verifix holds** (a deploy-log probe of `core/employee$list` on
  production, 23 Oct, 3,015 working people): `gender` 100 % (M 1,652 · F
  1,363), `birthday` 99.7 %, `hiring_date` 100 %, `address` (where they live)
  97.5 % and `legal_address` (propiska) 94 % as FREE TEXT in four spellings,
  `region_name` (a district) 31 %. `person_experiences` (career experience) is
  filled for 56 people — so **«experience» is tenure at Safia**, from the
  CURRENT employment's hiring date (a re-hire starts again). The same list
  also carries passports, PINFL and family members; none of it is read here.
- **The population is today's lists**, and the «Jami / Zagruzka» switch moves
  BOTH of its halves (2026-10-24, the operator: «when Total is selected, just
  show all cells and all people; when Workload is selected, show all people who
  get counted in Zagruzka») — `workforce.registry` is the one door:
  **«Zagruzka»** is the cells counted in the загрузка (`verifix_live._registry`,
  never re-spelled here) and the job titles that count in it
  (`_py_known_title`), i.e. the people a загрузка figure is built from;
  **«Jami»** is the SAME query without the `in_load` clause and every job
  title — every cell of the register, everybody standing in one. The whole is
  a SUPERSET of the workload half by construction, so the switch may only ever
  widen. Until that day «Jami» narrowed the TITLES alone and still stood on the
  workload's cells, so it answered neither question. A WORKING employee joins
  through their Verifix org unit (the `_homes` rule) — the people /staff reads
  today. Verifix keeps only today's placement, so it is a SNAPSHOT: the period
  control is NOT drawn on this tab (a control that changes nothing is worse
  than none). Plant, shift and brigadir (`scoped_manager_ids`, the viewer lock)
  narrow it further. The «Ro'yxatdagilar» tooltip states whichever population
  is on screen (`kPeopleTipAll` / `kPeopleTipZag`). Page key `workers`,
  but **ADMINS ONLY** (2026-10-23, the operator: «only visible to admin,
  nobody else»): the tab is drawn for `role == "admin"` alone (a saved
  «composition» view reads as «Davomat» for anybody else, an «open as» tab
  included), and `GET /api/workers/demographics` answers 403 to every other
  role, as the refresh always did.
- **What is stored — coded facts only.** `workforce.read` keeps per person the
  org unit, job name, gender letter, birth MONTH («1994-07», age exact but for
  the person's own birth month), hiring date and two places reduced to a region
  + district key; no name, phone, document, PINFL, day of birth or street
  address. Stored as `live_verifix_reads` key «people», re-read every 3 h at
  :35 (`READ_EVERY_H`), after boot when older (~240 s in), and by an admin's
  «Verifix'dan yangilash» (`POST /api/workers/demographics/refresh`, logged as
  `sync.workforce_read`, background reads too). A read under 1,000 people or
  10 % smaller than the last is refused and the stored one serves.
- **Where people live** (`workforce_place.place`): everything transliterated
  to Latin and squashed (x/kh → h, q → k, no apostrophes), then a GAZETTEER of
  Tashkent city's 12 districts and Tashkent region's districts and towns (a
  stem followed by «tumani / район» first, then the earliest — «Bo'ka tumani,
  Olmazor mahallasi» is Bo'ka), then the region by its word (a bare region
  name only among the first three words and never before a street word —
  «Navoiy ko'chasi» is a street), then any other «X tumani / район» as a
  district of its own, named by its most common Uzbek spelling across the read
  (`canon` joins a Russian adjective «Пахтачийский» to «Paxtachi»).
  `region_name` is the hint where the text says nothing. A text it cannot
  place is «not stated», never guessed. Districts reach uz_cyrl / ru readers
  through `convertFromUz` (English keeps the Uzbek spelling — a place, not a
  person).
- **The tab**: one status line (today's lists · the read time · a privacy note
  · the role switch · the admin's refresh); five KPIs (on the lists, women %,
  average age with median and under-25 share, median tenure with the
  under-a-year share, the top district); a gender donut and an age × gender
  pyramid; tenure bands (vertical, horizontal on a phone) and the top 8 places
  (+ «others», + «not placed»), switchable residence / propiska and district /
  region; a breakdown table by brigadir / job / cell (women share, average
  age, under 25, median tenure, under a year, top district), sortable.
- **Colours**: men `#3b82f6` and women `#ec4899` on every card — categorical
  palette hues taken out of order on purpose (red/green would read as a
  traffic light), validated for colour-blind separation on both themes; a
  single measure (tenure, place) is brand gold, a fold the slate.
- Not built: history (a snapshot only), an export, career experience.

## Attendance charts read the ORIGINAL brigadir

`/workers` answers ONE question — *of the people on this brigadir's own list,
how many turned up* — so an approved people-exchange must not move the answer.
It does, three ways: a → supervisor move reassigns the row to the receiving
unit, a → task move zeroes the day (clock «X», hours 0) so every «came» filter
reads a no-show, and a worker who cleared `MIN_MOVED_ZAGRUZKA_HOURS` on neither
side of a transfer-time split loses their NAME off the row and vanishes from
both rosters. All three are right for the загрузка — the borrower really did
have those hands — and wrong here: exchanges are decided by supervisors and
admins after the fact, so scoring the brigadir on them makes attendance a
record of other people's paperwork.

- `app/services/exchange_rewind.py` is THE definition. `original_rows(db, from,
  to)` replays approved `people_exchange` documents backwards in memory —
  `old_manager_id` per employee, plus the full `snapshot` the two hours-touching
  paths already store — and returns `(names, rows)`. **Nothing is written**, and
  nothing outside these charts reads it: the Staff page, the загрузка, the
  exports and every KPI still show where a worker actually spent the day. Only
  `verifix_code` is left alone (no chart here splits by cell).
- **It is a NAME PARTITION, not a patch.** The caller excludes exactly `names`
  from its SQL (`ex_only`) and counts `rows` in Python; the two sets are
  disjoint, so `COUNT(DISTINCT worker_name)` totals merge by plain addition with
  nothing double-counted. Adding count-level deltas to the SQL instead would
  double a worker who holds two rows in a day. A name that also belongs to
  someone the exchange never touched — a namesake, a day outside the document —
  is passed through unchanged, which is what makes the partition safe.
- `_original_scoped()` in `routers/workers.py` cuts those rows to the units and
  days the SQL sees, **after** the rewind — a worker lent across shifts or plants
  belongs to the one they clocked in on, so filtering on where the exchange left
  them would drop precisely the rows this exists to recover. `_py_came` /
  `_py_on_leave` / `_py_known_title` are exact twins of the SQL predicates
  beside them; classify the exchanged half by one rule and everyone else by
  another and the two halves stop adding up.
- Both `/api/workers/headcount` and `/api/workers/trend` are on this basis, so
  the whole page reads one way — heatmap, donut, treemap, trend and the
  per-brigadir table. The charts say so (`workers.info.original`, appended to
  the four info tooltips; the «Явка к штату» bar chart was removed on 2026-10-21, the operator: «we dont need it»). `role_change` documents are deliberately NOT rewound:
  they change a job title, i.e. which role column a present worker lands in,
  never whether they came.
- **Today is on the page before it is closed** (2026-10-15, the operator:
  «show also today's infos»). The day-close gate keeps every unconfirmed day
  out — and a live day reaches `attendance` only at its close — so each unit's
  CURRENT shift-day (`shift_report.report_days`, the shift dashboard's frame:
  at 09:00 shift 2's is the night just ended) is read off the STORED live
  Verifix read while that unit has not confirmed it: `routers/workers._live_rows`
  over `live_staff.unit_people`, the very list the shift dashboard's «Davomat»
  column counts (`live_staff.attendance` now just sums it), so the two pages
  state one figure per unit-day. Already on the original-brigadir basis (no
  exchange applied); per DAY it adds to the SQL with nothing double-counted,
  and the period unions (`total`, `total_all`) add only names the period does
  not already hold. Only that day — an earlier day left unclosed stays blank,
  as before. Kept 30 s per day (`_LIVE_TTL_S`); a failure costs the live day,
  never the page. The payload marks it (`daily[].live` + `read_at`; trend
  `live: {date: "HH:MM"}`) and the page says «so far» once under the KPI row,
  as a dot on the heatmap's date header (`HeatmapChart dateMarks`), in the
  cell tooltip and day popup, and beside the date in the trend's panel.
- **The «Movements» tab reads BOTH document tables** (2026-10-22: 9–18 Oct
  showed all zeros). `/api/workers/requests-analysis` counts every filed
  exchange and role change by the day it is filed for — no day-close gate,
  no rewind. A live day (from `live_day.LIVE_FROM`) files them in
  `live_documents` (`/api/staff-live/documents`) and nothing copies them into
  `hr_documents`, so from 6 Oct the tab read nothing. `hr_documents` is read
  over the whole period and `live_documents` from `max(date_from, LIVE_FROM)`
  — the rows before the floor are the retired lab page's test filings
  (`day_state.confirmed_pairs`' rule) — in one shape (the live day column is
  `day`), so a period before 6 Oct answers exactly as before. Any status but
  approved counts as pending, a rejected filing included, on both tables.

## «Davomat» reads Verifix (`/panel/attendance`, from 2026-10-04)

**From `live_day.LIVE_FROM` (2026-10-06) this tab writes no live day** — the
brigadir's close copies it (see «/staff reads TODAY live»). Everything below
describes the days before the floor.

From **2026-10-04** (the operator: «no more Excel documents for the загрузка»)
the admin «Davomat» tab no longer takes the «Отчёт по посещениям сотрудников»
Excel. Its one button, «Verifix'dan olish», opens a plant → shift → brigadir →
cell tree (`pages/admin/VerifixCellPicker.jsx`, the Broadcast page's
`CheckboxTree`) and reads the ticked cells from Verifix's API
(`services/verifix_attendance.py`, `core/timesheet$export` — the report the
Excel was exported from). `POST /api/attendance-batch/verifix` merges what came
back into the day's batch through the SAME `_merge_file` an upload went through,
so everything after the read — routing, ticks, admin edits, «Doimiy qilish»,
per-read undo, Save and its notifications — is the file flow's own and did not
change. `POST /upload` is gone; the days the files fed stay as they were.

- **Only the cells counted in the загрузка** (`cells.in_load`, «Zagruzkada
  hisoblanadi») are offered and read — the scope the test tab ran on — all of
  them ticked when the tree opens (brigadir-less ones in a trailing branch).
  Search, select-all of what is on screen, «only not read yet»; each cell names
  when the day last took it in («olingan …», «Excel …» for a file of the days
  before), off the read that last supplied it (`GET /verifix-pick`).
- **A row is built the way the Excel parser built one** — current org unit →
  cell, the «08:01 - 17:13 (8.14)» day cell with «Явка» in brackets, hours =
  «Отработано» («Явка» + «Свободное время», or the parity rule), absence
  letters, early arrival by `clock_metrics`. Proven on the test tab before the
  switch: 1,470 of 1,475 people identical on the 1 Oct dump, 1,486 of 1,497 on
  the first production read; what differed was a department moved in Verifix,
  a mark removed after the export, one day split across two cells and one
  dismissal. Verifix also carries the cells nobody uploaded a file for, so a
  read can bring people the Excel days never had.
- **A read merges, cell by cell.** The ticked cells get Verifix's rows; rows an
  admin edited or added survive (the newer value goes to `file_values` — the
  revert badge); routing and the tick are untouched; every cell not ticked is
  left alone. A ticked cell Verifix has nobody in any more is EMPTIED
  (`_merge_file(cover=…)`): a file simply did not mention such a cell, a read
  must say so or the people who moved out would count twice.
- **Out of time (`verifix.BUDGET_S`, 70 s), only cells read in FULL are taken
  in.** A cell with anybody asked about and not returned is dropped from the
  read and left as the day held it — half a cell would reach the supervisor on
  the next Save. `verifix_result.unread` names those cells and the read summary
  offers «Ularni olish» on exactly them (the directory is cached 10 min, so the
  second try is faster).
- **Each read is one «upload» row** — `attendance_upload_files.source =
  "verifix"` (NULL = a file; migration `add_attendance_upload_source`, both
  entrypoints), `filename` «Verifix» — listed under «Kun manbalari» beside the
  Excel files of the days before, removable on its own. A read that finds
  nobody and changes nothing records nothing.
- Errors are answers, the «Verifix (test)» convention: 409 `not_configured`,
  400 `future` / `no_cells`, 424 `{code, message, status}` from Verifix — never
  502/503. Admin-only like the rest of the tab; logged as
  `attendance.verifix_read`.
- **Brigadirs' own rows are not read, as the file did not deliver them either.**
  The Excel's cell-less rows were meant to put each brigadir on their own page
  by name (`_cellless_by_manager`), but `_merge_file` skips cell-less rows — 0
  such batch rows and 0 `is_supervisor` attendance rows on the 28 Aug and 11
  Sep copies. Reading them from Verifix is a separate decision.
- **The «Davomat (Verifix)» test tab is GONE** — `AttendanceVerifix.jsx`,
  `routers/attendance_verifix.py`, its models and strings. Its two tables,
  `vfx_attendance_days` / `vfx_attendance_rows`, are left in the database,
  unread; dropping them is a separate decision.
