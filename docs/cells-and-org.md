# Cells, units, plants and who leads them

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## A cell is its CODE (`utils/cellName.js`)

From **2026-08-29** (the operator's standing directive) a production cell is
identified on screen by its four-digit **verifix code** and by nothing else.
The workshop name («Холодные яблоки», «Холодильщик и кладовщик») is not printed
anywhere: not in a table cell, a card, a chip, a filter option, a chart axis, a
modal title, a tooltip, a notification or an export column.

- **`cellLabel(code, leader)` is THE label** and the only place the separator
  lives. Where a code alone is too thin, the second fact is the cell's
  **LEADER** — the person answerable for it, already transliterated by the
  caller's `tl` — never the workshop. Everything else about a cell (its
  brigadir, its shift) is a column of its own, not part of its name.
- **Why**: the names are long, they truncate to nothing in the narrow controls
  that carry them (a 240px filter dropdown, a phone table row), and they are
  near-duplicates of one another — «Холодная ягода» is the name of BOTH 1611
  and 1622 — so a reader who has only the name cannot tell two cells apart,
  while the code always can. The plant's own people say the code.
- **`cellName()` survives for exactly two jobs and is documented as such**:
  SEARCH (typing «яблоки» still finds 1612 on `/cells`, «Smena vaqtlari» and
  the attendance upload — what comes back is the code) and the register's own
  EDITOR (`CellFormModal.jsx`, and the create-a-cell form on `/profile`), which
  is where the four language columns are maintained. Rendering it as a label
  anywhere else is the regression this section exists to prevent.
- **Read surfaces carry no names at all** — with ONE exception since
  2026-10-19 (the operator: «show the cell names on cells page»): the `/cells`
  register prints a «Sex nomi» column right after the code (`NameCell` —
  `cellName` in the viewer's language through `tx`, one line, cut with «…»,
  whole on hover; sortable), its phone card a line under the code, and its
  workbook a «Название цеха» column after «Verifix код» (`CellsExportRow
  .workshop`, «—» for a bundle that sends none). The name is Verifix's, kept
  in step by the live sync (see «Cells, leaders and brigadirs follow
  Verifix»). The table carries `minWidth` 1060 for the tenth column, so below
  that it scrolls sideways rather than cutting every header. Everywhere else
  the rule stands: `/cells/:id` leads with the code and
  lost the four-language «Names» card; the Quality register, ARC (both tabs,
  its charts and its export), Ojidaniya, Zagruzka-cell, Setup times, Staff,
  WorkerConcerns and «Smena vaqtlari» all print the code, with the
  leader beside it where the payload names one.
- **The backend prints the code too** — the approval card and the
  people-exchange notification (`_exchange_target_label`), the ARC export's
  `cell` column (the cells-register workbook carries the name beside the code
  from 2026-10-19, as its screen does). `cell_lookup.workshop_name` is
  documented as NOT-A-LABEL; no payload or file should write it out.
- Three payloads gained the cell's `leader` so the code never stands alone
  where a name used to help: `/api/staff/attendance` `cells[]`, and both
  `/api/setup-times` list rows and its analysis rows. `cell_lookup.by_verifix`
  already shipped it (ARC, Quality), as did `/api/cell-attendance` and
  `/api/idle-cell`.
- The stored names are untouched — nothing was migrated or deleted, so lifting
  this rule anywhere is a rendering change and nothing more.

## A leader's cell may stand in ANOTHER unit (`cells_unit_for_leader`)

From **2026-09-26** (the operator's ruling) a leader can be COUNTED under one
brigadir while their cell's загрузка is read in a unit of its own. The case
was Turdimurodov Nodirjon, Aripova Manzura's leader, whose cell 0811 stood in
a unit «Turdimurodov Nodirjon» made only to measure its load. **That case is
CLOSED from 2026-11-02** (the operator: «remove him from brigadirs, add his
unit to Aripova Manzura where it belongs, keep him as her leader»): see «Unit
«Turdimurodov Nodirjon» joins Aripova Manzura's» below. The RULE stays — any
leader whose cells stand in another unit is read this way (Umarova Mapura on
the 11 Sep copy).

- **What a leader is MEASURED by follows the CELL.**
  `cell_lookup.cells_unit_for_leader` (the one unit all their cells stand in,
  else None) is read by the automatic checks (`leader_auto._Ctx.unit_id` — #1
  and #9 read that unit's dashboard and pins) and by a leader's /production page
  (`production._resolve_manager_id`). Read in the leader's own unit they find a
  catalog that never carried the cell and fail every day — the state Umarova
  Mapura was in on the 11 Sep copy (profile in Raximova Kamola's unit, cell
  8611 in Mirmaxmudova Munira's), so her #1/#9 move with this too.
- **What a leader FILES follows the PROFILE** — a bot day still takes
  `prof.manager_id`, unchanged. (From 2026-10-29 the PROFILE follows the cells
  when every cell a leader runs changes brigadir together — see «A leader
  follows the cells they run». A leader counted where none of their cells
  stands, like this one, is never moved.)
- **A save that does not move the leader moves no cell.** `_set_leader_cells`
  drags kept cells only when the profile edit changes the unit
  (`follow_unit`), and the /cells form applies the leader's unit only to a NEW
  owner. Before, a rename re-synced the cells and quietly carried 0811 — and
  its load — into Aripova's unit. (SUPERSEDED 2026-10-12: NO save moves a
  cell any more — a leader's cells never follow the leader's unit, and every
  pick is a dated «Boshqaruvchi» change; see «Cells, leaders and brigadirs
  follow Verifix».)
- Moving an existing leader's days is a data fix, not a feature: a one-shot
  (26 Sep, deleted 2 Nov once its flag read «done») moved his profile, role
  rows and every checklist day to Aripova without touching the cell, and
  marked her already-sent digests as including them so nothing was re-sent.
- **The Verifix sync can keep such a cell where it is** —
  `verifix_sync.KEPT_APART` (cell code → the unit's NAME). **EMPTY from
  2026-11-02**: its one entry, `{"0811": "Turdimurodov Nodirjon"}` (the
  operator 2026-10-14: «keep him as an exception» — a `brigadir_differs`
  applied on 13 Oct had moved 0811 to Aripova and his /production went
  blank; a one-shot, deleted 2 Nov, put it back), went when the unit joined
  Aripova's. For a kept-apart cell the sync raises no `brigadir_differs` (and
  refuses one already on the queue, 409 `kept_apart`), never suggests
  `leader_moved`, and reads the seat heading that very unit as expected (no
  `seat_other_role`). A person can still move it on /cells. The mechanism
  STAYS: a new exception is one more entry.

## A leader follows the cells they run (`leader_follow`, 2026-10-29)

The floor: after Maksumov Sanjar's and Xakimov Ruslan's units exchanged cells
(25 Oct — 7213 · A, 7214 · B), «Lider nazorati» kept the leaders who run those
cells under their OLD brigadir on every day since. A checklist day is stamped
with the leader PROFILE's unit when it is created (`leader_task_days.manager_id`)
and the register, the brigadir's digest, the objection chain and the AI queue
read that stamp — while since 12 Oct a cell changes brigadir by a dated link
event and nothing moved the leader. The operator's ruling: «Yes,
automatically».

- **`services/leader_follow.py` is THE writer of a leader's unit.** `move` —
  the profile and its registrations re-pointed (`profiles._bound_role_rows`),
  the leader's days from the move day re-stamped (`restamp`: the days and, for
  those days, their AI verdicts, objections, late proofs, automatic checks and
  report ledger — only rows naming the old unit) and the move RECORDED in
  `leader_unit_moves` (append-only; `effective_from` = the first shift-day in
  the new unit). The profile editor (from the new unit's first fileable day,
  `leader_owes.unit_day`) and the Verifix «leader_moved» / «hold» taps go
  through it too, so every leader unit change is dated.
- **The rule (`plan`/`follow`)**: an APPLIED brigadir change of a cell whose
  «Boshqaruvchi» ran it on both sides of the move, after which every live cell
  that leader runs stands in ONE unit B, while their days just before were
  counted in a unit A one of their cells stood in (`_counted_unit`: their last
  day before the move, else their first after it, else the profile). The
  profile moves when it is still in A; when a person already moved it to B
  only the days are re-stamped. Named and left: cells split over two units
  (`split` — `cells_units_for_leader` already reads both), a leader counted
  where none of their cells stood (`counted_elsewhere` — the 26 Sep reading,
  Turdimurodov), a kept-apart cell (`verifix_sync.KEPT_APART`), a profile a
  person put in a third unit, a new unit archived. A recorded move is never
  re-planned, so a person moving the leader back afterwards stands.
- **When**: `leader_follow.kick()` right after a brigadir change lands
  (`cell_links.run_apply_due`), and the 5-minute `leader-follow` job over the
  changes landed in the last 3 days. Floor 12 Oct (`FLOOR`, the dated links).
- **The roster is DATED for a moved leader**: `/api/leaders`' roster entry
  carries `units` — `[{supervisor, shift, from, to}]` (`from` inclusive, `to`
  exclusive) — and so do the «Mening o'rnim» pool (11th tuple element) and the
  «Brigadirlar reytingi» pool. A brigadir is handed only their own unit's span,
  and their roster keeps a leader who moved away. On the client
  (`utils/leaderBoard.js`): `rosterIn` takes an entry while any span is in
  scope, `rosterByUnit` attaches `windows` / `moved` for `unitSlots` (a moved
  leader owes each unit only their span there, «unless it arrived»), and
  `scopeBounds` folds the span into the `cuts` / `starts` every leader ranking
  reads (the Monitoring page and `placesOf`). So neither brigadir reads the
  other side's days as missed. A leader who never moved carries nothing and
  every reader keeps its old rule.
- **The digest owes by the dated history** (`leader_unit_report._frame` →
  `leader_follow.unit_members_on`).
- **The repair**: TEMPORARY `services/leader_follow_repair_oct29.py`
  (`startup.repair_leader_units`, deferred, both entrypoints, flag
  `leader_follow_repair_2026_10_29_v1`, record in app setting
  `leader_follow_repair_2026_10_29`) ran the rule once over every change since
  12 Oct in one transaction with its flag, and DMed Burkhon from the record:
  who moved (and what was re-stamped), what was named, every cell whose
  brigadir changed with its leader staying, and every leader-day still stamped
  in a brigadir none of the leader's cells stood in. Delete the module, the
  startup function and both calls once `…_v1_dm` reads «done».
- Not changed: a past digest already sent is not re-sent; the census behind
  `cutUnits` still reads the current unit; a move before 12 Oct cannot be read.

## A leader who left is ENDED, not deleted (`role_profiles.ended_on`, 2026-11-13)

The operator (2026-11-13): history was destroyed whenever a leader resigned,
moved or switched role, and resigned leaders had to be removed by hand. Step 1
of three (the other two — a unit id on the workload tables, a dated brigadir
per unit — are not built).

- **`role_profiles.ended_on`** (DATE, NULL = working) is the first day the
  person no longer works here. An ended profile keeps every filed day, photo,
  verdict and concern; nothing is deleted.
- **«Ishdan chiqdi»** — the first row of the profile page's danger card
  (`Profile.jsx` `DangerCard`), a date not in the future. `POST
  /api/profiles/admin/leader/{id}/end {date}` (`CAP_PROFILES_MANAGE`):
  the cells are released (`cell_register.release_profile`), the results stop
  counting from that day (`leader_cutoffs.set_cutoff`, reason «Ishdan
  chiqdi» — an EARLIER cutoff a person set stands), the accounts and the
  browser login come off the profile as a delete takes them, `ended_on` is
  set. **«Qaytarish»** (`…/return`) clears the date and lifts the cutoff dated
  the same day; cells and accounts are not handed back. «O'chirish» stays
  under it, with its 409 count of what it destroys. Jurnal:
  `identity.profile_ended` / `identity.profile_returned`.
- **A Verifix dismissal sets the same date** (`verifix_sync` act `dismissed`:
  `ended_on` = the cutoff date, max(dismissal, today)) and `returned` clears
  it. It does NOT take the accounts off — the 12 Oct ruling (results, not
  access) stands until the operator says otherwise. A leader a PERSON ended
  while Verifix still lists them working is held (`ctx.held`): no seat, no
  pick, no automatic return.
- **Leaders the sync dismissed before the column existed** get the date at
  boot (`startup.end_dismissed_leaders`, `later`, both entrypoints,
  idempotent: the sync's own cutoff is the proof, and a return lifts it).
- **Off today's lists**: `identity.list_leader_profiles` (the task assignee
  picker), the registration options (nobody claims the profile of a leader
  who left), the «add role» picker on the Users tab, the org chart, and
  `cell_register.set_manager` refuses them (`leader_ended`). The /leaders
  rankings need nothing: a cut leader with no day left in the window is
  already dropped (`scoreSlots`), and past windows keep them.
- **The profiles register** hides them until «Ishdan chiqqanlar → Ko'rsatish»;
  shown, the name carries a grey chip «Ishdan chiqqan · dd.mm.yyyy».
  `/api/profiles/admin/list` serves `ended_on` on every leader.
- **Not covered**: the header search, the /cells leader filter and the
  «Liderlar KPI» board still list an ended leader; a release is dated the day
  it is pressed, not the resignation date; nobody is notified.

## A leader on Verifix, or in place of one (`leader_kind`)

From **2026-10-04** (the operator's directive) every leader profile says
whether the person IS a leader on Verifix or does a leader's work while Verifix
lists them under another job: «Lider» / «Lider o'rnida» (ru «Вместо лидера»,
en «In place of a leader») — `role_profiles.leader_kind` ("leader" | "acting",
NULL = not determined) beside `leader_kind_meta` (JSONB: who set it — `src`
manual | verifix, `at`, `by` — and `vfx`, what Verifix said at its last check:
the matched NAME, job, cell, status, or why nobody was found).

- **`services/leader_kind.py` is THE definition** (`KINDS`, `set_manual`, `out`).
  A REGISTER: nothing scores, filters or routes by it. «Ishchi havotirlari»
  ranked only `"leader"` profiles from 2026-10-04 to 2026-10-14; since then it
  ranks every cell OWNER (the operator: «every owner is ranked»).
- **The switch** is a `SegmentedToggle` in the admin profile page's Details card
  (leaders only), a draft like every field there: the page's one Save sends
  `leader_kind` on `PUT /api/profiles/admin/leader/{id}` only when it moved, and
  a person's choice is stamped `src: manual`. Under it `LeaderKindNote` prints
  what Verifix said — the Verifix name included, so a wrong match is visible —
  and who set it by hand; the header carries a grey «Lider o'rnida» chip. The
  change rides `identity.profile_edited` as a `leader_kind` row; a grantee's
  flip DMs the admins (`l.leader_kind`).
- **It was filled ONCE from Verifix's API** — the API, not the attendance files
  (the operator's words) — by `services/leader_verifix_check.py` (TEMPORARY,
  flag `leader_kind_verifix_check_2026_10_04_v1`, `startup.check_leader_kinds`,
  both entrypoints, ~100 s after boot). It reads `employee$list` (every status),
  `job$list` and `division$list` through `verifix_explore`'s loaders and ties a
  profile to ONE employee by name, strictly: folded full name → surname + first
  name with no clashing patronymic → namesakes narrowed by the leader's own
  cells, then the unit's → a first-name-first profile swapped → a surname-only
  typo with the SAME first name standing in the leader's own cell. Never a
  fuzzy match saved: the scorer pairs «Inomova Saydora» with «Inomova Dildora».
  The JOB decides — a title naming «Лидер» (not an assistant, deputy or «и.о.»)
  → leader, any other → acting; not found / ambiguous / not working → NULL and
  listed. A value set by hand is never overwritten. Text + workbook went to the
  operator's chat (`UNPRICED_DM_CHAT`). Names the operator then tied by hand
  live in `leader_verifix_check.PINS` (profile → exact Verifix name; a pin wins
  over every rule) and are applied by a pins-only pass,
  `startup.check_leader_kind_pins`, whose flag is derived from the pin set — so a
  new pin re-runs it once and DMs a short confirmation (first: «Sarimsoqova
  Arapat Qosimjonovna» = SARIMSAQOVA ARAPATXON QOSIMJONOVNA, v4.217.4). Delete
  the module, both startup pairs and their calls once nothing is pending; the
  columns, `leader_kind.py` and the switch STAY.

## A brigadir on Verifix, and whether the unit's загрузка counts (`supervisor_kind`, `zagruzka_on`)

From **2026-10-04** (the operator's directive, after the leaders got theirs)
every supervisor unit carries two switches in its profile page's Details card,
drafts like every field there (the page's one Save):

- **«Lavozim (Verifix)»: «Brigadir» / «Brigadir o'rnida»** (ru «Бригадир» /
  «Вместо бригадира», en «Supervisor» / «In place of a supervisor») —
  `managers.supervisor_kind` ("supervisor" | "acting" | NULL) beside
  `supervisor_kind_meta` (leader_kind's shape: `src`, `at`, `by`, `vfx`).
  `services/supervisor_kind.py` is THE definition (`KINDS`,
  `is_supervisor_job` — «Бригадир», never an assistant / deputy / «и.о.»,
  `set_manual`, `info`). A REGISTER only: nothing scores or routes by it. The
  note under it is the leaders' `LeaderKindNote`; the Profiles list carries a
  column and a filter («profiles_f_supkind», apart from the leaders' one).
- **«Zagruzka hisoblanadi»: Ha / Yo'q** — `managers.zagruzka_on`. OFF = the unit
  takes NO part in the загрузка: `build_metrics_list` skips it, so every
  /zagruzka table, Overview, /summary, Smena kunligi's cards, the brigadir
  profile and the Daily performance block leave it out (the last two say
  «Zagruzka hisoblanmaydi» instead of drawing empty charts); the shift report
  and `/api/shift-report/start-load` leave it out; /zagruzka-cell's picker drops
  it. Nothing is deleted — switching it back on restores every figure.
  **Nor is it OFFERED there (v4.327.0, the operator 2026-10-22)**: the
  supervisor pickers of /zagruzka, Overview and /daily list only ON units —
  `/api/managers/all` and `/api/staff/supervisors` carry `zagruzka_on`, and the
  page filters (`useFactorySupervisors(…, { loadOnly: true })`; /daily inline),
  because both lists are shared caches that every other page reads whole. A
  remembered pick of an OFF unit is dropped, on «All factories» too. An OFF
  unit's attendance day (close / reopen) stays on /staff. The brigadir board
  (`brigadir_board.board_units`) already listed ON units only.
  Deliberately NOT gated: /production, Plan Bajarish, Plan Prognoz and its call
  DMs, /live, the leader auto-checks, the ojidaniya pages.
- **Every unit that existed on 2026-10-04 is ON; a unit created later starts
  OFF** (the operator: «switch on by default for those who already exist»).
  `startup.add_manager_kind_columns` adds the column DEFAULT TRUE and only then
  sets the default to FALSE, once (the column's absence is the guard); the
  `MANAGERS` seed writes TRUE. The create form asks («Zagruzka hisoblanadi»,
  default «Yo'q», with a hint) rather than leaving a production unit out
  silently. A role switch into supervisor creates the unit OFF. The Verifix-ID
  re-key copies EVERY column now — `factory_id` was silently dropped before.
- **Filled once from Verifix** — `services/verifix_supervisor_check.py`
  (TEMPORARY, flag `supervisor_kind_verifix_check_2026_10_04_v1`,
  `startup.check_supervisor_kinds`, both entrypoints, ~120 s after boot), DMed
  as text + a workbook. Strict name match (`leader_verifix_check._match`);
  several namesakes are narrowed to the one standing in the unit's Verifix
  WORKSHOP (the parent of its cells, where Verifix keeps the brigadir), else to
  the one with a brigadir's job; a name the strict rules miss is looked for in
  that workshop alone — the same first name (or it with a -bek/-jon/-xon/-oy
  ending: «Sanjar» = SANJARBEK) and a surname ≥ 0.75 alike. A value set by
  hand is never overwritten. It also lists every Verifix brigadir with no unit
  here — their workshop, the people under it and our cells there. Dry run
  (11 Sep units × the 1 Oct dump): 19 «Brigadir», 2 «Brigadir o'rnida»
  (Murodali Ochilov, Turdimurodov Nodirjon — «Лидер» on Verifix), one person
  for both Suvonov Elshod units, and 9 Verifix brigadirs with no unit (supply,
  staff kitchen, Keles cleaning, washing ×2, cold rooms «Цех -22», the
  finished-goods freezers, «Цех - 3» over 1911). **Deleted on 2026-10-12 with the Verifix live sync** (its rules live on in `services/verifix_org.py`);
  the columns, `supervisor_kind.py` and both switches STAY, and the live sync
  keeps the kind current from Verifix's job (a value set by hand still wins).

## A cell's «Zagruzkada hisoblanadi» (`cells.in_load`)

From **2026-10-04** (the operator's directive, right after the units got their
switch) a cell says on the cells register whether it counts in the загрузка —
`cells.in_load`, a column that has existed since 2026-07-31 but could be set
only from /cells/:id, and only by an admin.

- **Where**: the cell form (`CellFormModal`, ONE form for /cells and
  /cells/:id), a «Zagruzka» column, a filter section and a phone-card line on
  /cells, a «Zagruzka» column in the register's workbook, and the switch on
  /cells/:id. Written through the register's own `PUT
  /api/profiles/admin/cells/{id}` (`in_load`), so it is **CAP_CELLS_MANAGE**
  like every other field of a cell (it was role-admin only); a grantee's flip
  DMs the admins (`l.in_load`). The old `PUT /api/cell-attendance/registry`
  stays only for a tab still open on an older bundle.
- **A cell follows its brigadir until somebody sets it.** A create that names
  no value takes its unit's `zagruzka_on` (`profiles._unit_counts`; no brigadir
  → off), which is what the /profile inline create and an older tab get; the
  form pre-fills it from the brigadir picked and says so, and an edit that keeps
  the brigadir keeps the cell's own value. Flipping a unit's switch does NOT
  flip its cells, and a cell that gets a brigadir through a cascade (a leader's
  unit move, «Davomat» «Doimiy qilish») keeps the value it had.
- **Turned on once** by `startup.turn_on_cells_of_counted_units` (flag
  `cells_in_load_from_units_2026_10_04_v1`, claimed in the same transaction as
  the write, both entrypoints): every cell of a non-archived unit whose
  `zagruzka_on` is set, archived cells included. Nothing is turned off —
  brigadir-less cells keep what they had. On the 11 Sep copy: 150 on, 5 left
  off (all brigadir-less); on production the cell sync's brigadir-less service
  cells stay off as well.
- **The operator's OFF list, applied once** — `startup.untick_cells_in_load`
  (flag `cells_in_load_off_2026_10_04_v1`, after the turn-on, both
  entrypoints): 0812 0822 2511 1911 4511 2611 2612 6611 1511 3411 3511 8011
  6621 2531 7231 0036 1613 1614 and «Kuxnya», read as the service kitchens
  0037 / 7711 / 7721 (not the production «Кухня горячая / блинчик» cells 8611
  8613 8622 8623). Only turns OFF; on the 11 Sep copy 9 of them were on. The
  «Davomat» tab's Verifix read offers none of them from then on.
- **A REGISTER: no загрузка figure reads it yet.** The загрузка, `idle_source`
  and /zagruzka-cell ignore it by their own sections; its one reader is the
  «Zagruzkada hisoblanadigan» count on /staff's cell view. Making an OFF cell
  leave the загрузка (its share of its work centre's minutes and typed people)
  moves numbers on every загрузка page — **ask the operator before wiring it**.
- **…but it decides what «Davomat» READS (2026-10-04).** «Verifix'dan olish»
  offers and reads only these cells (`verifix_attendance.counted`), so a cell
  switched off here takes in no attendance on any day read after that — its
  people reach no supervisor through the tab. Nothing moved on the day: the OFF
  list was built as the cells the Excel did not carry. See «Davomat reads
  Verifix».

## Supervisors read `/cells` — their own unit, read-only

From **2026-09-14** (the operator's directive) the cells register opens to the
`supervisor` role by default, narrowed to the cells of their OWN unit.

- **The narrowing is server-side** — `_cells_viewer_unit` in
  `routers/profiles.py`, applied by `GET /api/profiles/admin/cells`: a
  supervisor's `role_id` is their unit, and the endpoint returns that unit's
  cells, that unit as the only supervisor option, and its leaders (plus any
  leader named on its cells). `scope` on the payload names the unit and is null
  whenever the register is whole; the page reads the narrowing off it — never
  off the viewer's role — and renders the unit as an inert brigadir chip.
- **Read-only by construction.** Every write is `admin.cells.manage`
  (`require_cap`), which a supervisor does not hold, so `canEdit` draws no
  create / edit / delete. The Excel export stays: it is a read.
- **Two personal grants widen it back to the whole register**: the edit grant
  (whoever manages the register needs all of it) and `page.view.cells`, stored
  at "all". «cells» deliberately stays out of `SCOPED_PAGES` — "own" would only
  restate a supervisor's role default and narrow nothing for any other role,
  and those keep reading the whole register when opened on the Access tab.
- **`/cells/:id` is unchanged** — still auth-only for every session, because a
  cell is pressable from pages that are not this one.
- A stored matrix shadows `DEFAULT_PAGE_ACCESS`, so
  `startup.open_cells_page_to_supervisors` (flag
  `cells_page_supervisor_2026_09_14_v1`) ADDS the role to the stored `cells`
  list once; the flag is what protects a later uncheck on the Access tab, and
  changing what it does needs a NEW flag key.

## A closed cell is ARCHIVED, not deleted (`/cells`)

From **2026-10-02** (the operator's request) a cell that closed is archived
from the /cells register's row actions (`POST /api/profiles/admin/cells/{id}/archive`,
`{archived: bool}`, `CAP_CELLS_MANAGE`). `cells.archived_at` (when, timestamptz)
and `archived_by` (a name snapshot) are the whole of it — NULL = active;
re-archiving keeps the first date, restoring clears both. **Nothing is
deleted**, unlike DELETE, which cascades the cell's ojidaniya intervals and
re-splits shared work centres over past days. The register hides archived cells
by default (a «Holat» filter section: active · archived · all), marks them with
a grey «Arxivda · date» chip, and `/cells/:id` carries a banner.

**From the day AFTER its archive day an archived cell is GONE everywhere, lists
and counting** (2026-10-10, the operator: «hide archived cells on the other
pages too», scope «Lists + counting»). Its archive day (plant clock, Tashkent)
and every day before it are untouched. `services/cell_archive.py` is THE rule —
`archived_day`, `alive(cell, day)`, `alive_on`, `alive_clause(day)` (SQL;
today when omitted); never re-spell the comparison.

- **Counting**: it takes no share of its work centre on those days —
  `zagruzka_source.cell_pins` / `cell_labor` split only over the cells that
  exist that day, so the cells still standing take its share (Σ is unchanged);
  the ojidaniya weight (`idle_source._n_by_cell`, both halves) gives it none, so
  its intervals leave /downtime, the matrix and «Xarajat» (`ojidaniya_cost`
  also drops its events); /zagruzka-cell prints its days blank and splits per
  day; Plan Bajarish shares lines per day; the /production dashboard drops its
  letter (`cells_at`, `_cell_letters`, `by_sap(day=)`, the staffing proof).
- **Owing**: `leader_cells.filing_cells` / `cell_ids` / `expected_days` take
  the day — no per-cell checklist is owed for it, the bot's cell picker, the
  «Chek-list» tab and the camera page drop it, the automatic checks (`leader_auto`
  `cells`, #8's codes) skip it, and `leader_load` counts it nowhere (archive
  calls `forget()`). A per-cell unit's leader whose every cell is archived owes
  nothing from the day after the last one (`cells_gone_from` on the /leaders
  roster and the standing pool, folded by `buildCutLeaders` like `cell_from`).
- **Lists**: «Ish grafigi», /idle-cell (create refused 400), /live, «Yacheykalar»
  placement destinations (live and file days — a code somebody stands in stays
  shown), the concern pickers (/concerns, /cell-concerns), the worker-concerns
  «owned cells», «Smena vaqtlari», «Perenaladka», /profile's own cells, the
  Plan Bajarish and «Xarajat» cell options, and the leader-cell pickers on the
  profile editors (offered only while still on the form — dropping one there
  would release it).
- **Deliberately NOT**: the /cells register and /cells/:id (they manage it),
  the admin Profiles list (it seeds the editor), labels of history
  (`cell_lookup.by_verifix`), the Verifix / «Davomat» reads (who Verifix places
  where is Verifix's), the register checks, turnover, and one-shot reports.
- `/zagruzka-cell` names a cell archived before the period's first day in
  `diagnostics.archived_cells`.

## A cell's «Egasi» and «Boshqaruvchi» (`cells.owner_id`, 2026-10-08)

The operator's rulings (2026-10-06 and 2026-10-08, asked one by one): a cell
carries TWO leader slots, at most ONE person each, and in most cells they are
the same person.

- **Boshqaruvchi** (ru «Управляющий», en «Manager») = `cells.leader_id`: the
  one who RUNS the cell — checklist (they file the per-cell one), automatic
  checks, «Ish grafigi», ojidaniya, concerns box. Nothing that reads `leader_id`
  changed, and picking one on the form still carries the cell to their unit.
- **Egasi** (ru «Владелец», en «Owner») = `cells.owner_id` + `owner_meta`
  (`{src: verifix|manual, at, by, vfx}`, leader_kind_meta's shape): the leader
  Verifix SEATS in the cell — a working employee with a leader's job whose org
  unit is the cell. It moves NOTHING (no unit, no checklist), and any leader may
  own a cell, one in another unit or in none.
- **Both KPI pages read the Egasi** (from 2026-10-13, the operator: «the KPIs
  will be calculated for the cell owner» — reversing the 12 Oct ruling 8 that
  had them rank by `leader_id`; made ONE rule on 2026-10-14). Both rank PER
  CELL — one row per cell that has an owner ON THE PERIOD'S LAST DAY and stands
  on it (`turnover.cell_map` + `turnover.owned`, the one reading both use), the
  owner named on the row — so for one period «Ishchi havotirlari» and «Kadrlar
  qo'nimsizligi» list the same owners and the same cells and print the same
  «N ta egasi · M ta yacheyka». A leader who owns no cell is on neither page; a
  cell with no owner is no row. See their sections. Every other page ranks as
  now.
- (SUPERSEDED 2026-10-12: «Egasi» is the Verifix seat and nothing else — the
  manual owner and its picker are retired; a person's choice lives on the
  «Boshqaruvchi», picked from the unit's Verifix workers. See «Cells, leaders
  and brigadirs follow Verifix».) **Set by hand from now on** — on the ONE cell form (`CellFormModal`:
  «Boshqaruvchi», then «Egasi», whose list names each leader's unit), sent as
  `owner_id` on the register's own POST/PUT (CAP_CELLS_MANAGE; 0 clears, an
  absent key leaves it, so a tab from before the slot never touches it). A
  person's pick — a clear included — stamps `src: manual`, and nothing written
  from Verifix overrides it. Shown on /cells (an «Egasi» column after
  «Boshqaruvchi», a filter offering «Boshqaruvchidan farqli», the phone card,
  the search, the workbook — Boshqaruvchi then Egasi) and on /cells/:id (the
  owner's unit when it is not the cell's, and whether Verifix or a person set
  it). An owner whose PROFILE has no brigadir wears an amber mark. Deleting a
  leader profile (or switching its role) releases both slots, and the delete
  dialog counts owned cells too.
- **Filled ONCE from Verifix** — `services/cell_owner_pass.py` (TEMPORARY, flag
  `cell_owners_verifix_2026_10_08_v1`, `startup.set_cell_owners_from_verifix`,
  both entrypoints, ~240 s after boot), DMed as text + a workbook to
  `UNPRICED_DM_CHAT`. Every write lands in ONE transaction with its record (app
  setting `cell_owner_pass_2026_10_08`, the values replaced included); a DM that
  fails is re-sent from the record, never re-run. The rules:
  - Y seated in a cell X runs → Y Egasi, X keeps running it («Follow Verifix
    for ownership and our platform for managing» — 9123, 9425 and 8821 too; no
    profile moves). Nobody runs it here → Egasi only.
  - No leader on Verifix → no Egasi. A tie that is not sure
    (`leader_verifix_check._match`: sure = full name, surname + first name, a
    pin), one Verifix leader for two profiles, or no profile → none. Two Verifix
    leaders in one cell (0111, 0822, 0912) → none until the operator says which.
  - A cell with no brigadir here → none, unless this pass gives it one; the 9
    cells with no Verifix brigadir over them (0022 0025 0028 0031 0034 0037 0110
    0112 2531) wait.
  - 6822: the profile «Jonizoqoqv Urolboy Quziboy O'g'li» is renamed «Jonizoqov
    …» (`RENAMES`, through the register's own rename cascade) and tied to
    JONIZOQOV UROLBOY QUZIBOY O'G'LI — `leader_kind_meta.vfx`, and the kind its
    job says unless a person set one.
  - The NINE units the operator approved (`NEW_UNITS`, Verifix name → unit
    name; «Xabibullo Xayrullo o'g'li» for XAYRULLO O'G'LI ХABIBULLO) are created
    at max(id)+1: «Brigadir» (`supervisor_kind_meta` from Verifix), zagruzka
    OFF, NO shift and NO plant (set by hand on the profile page). The
    brigadir-less cells Verifix puts under them — and under nobody else — JOIN
    them (30 on the dry run; `in_load` untouched, all out of the загрузка;
    letters settled by `wc_group.settle_moved`). No other unit is made: a
    brigadir the plan finds off the list is reported (`not_approved`), an
    approved one it no longer finds is reported (`missing`). Their owners'
    profiles — and those of 3911 / 4312 / 4315 (Nurmatova Basida, Ne'matillayev
    Izzatilla, Aripov Rustam, owners beside the leaders who run those cells) —
    stay without a brigadir until the next ship.
  - Guards: the 5 Oct pass's read guards (`verifix_cells_leaders_sync.MIN_*`,
    the found share), ≤ 250 owners, ≤ 60 joins, ≤ 9 units — a breach writes
    nothing (the rename rolled back with it) and is reported.
  - The report re-counts both KPI pages by Egasi (read only, after the commit):
    what the next step moves.
  - **Deleted on 2026-10-12 with the Verifix live sync** (its rules live on in `services/verifix_org.py`). The columns, the slot on /cells and
    `startup.add_cell_owner_columns` (both entrypoints, first at boot, pure DDL)
    STAY.
- The 6 Oct DRY RUN (`cell_owner_dryrun.py`) became this pass and is gone; its
  record (app setting `cell_owner_dryrun_2026_10_06`) stays.
- **Cells with several Verifix leaders, reported** (8 Oct, the operator: «Report
  me the cells with multiple leaders on Verifix») — TEMPORARY, READ-ONLY
  `services/multi_leader_cells.py`, `startup.report_multi_leader_cells` (flag
  `multi_leader_cells_report_2026_10_08_v1`, ~300 s after boot and after the
  owner pass, both entrypoints): reads Verifix afresh and DMs, as text + a
  workbook to `UNPRICED_DM_CHAT`, every Verifix cell (ours or not) seating two or
  more WORKING leaders — the owner pass's own rules (`cell_nodes`, org unit,
  `is_leader_job`, `cell_owner_pass._ties`) — with each leader's hire date, the
  profile here tied to them and what that profile runs / owns, plus non-cell
  subdivisions with several leaders on a second sheet. Writes only its record
  (app setting `multi_leader_cells_2026_10_08`). **Deleted on 2026-10-12 with the Verifix live sync** (its rules live on in `services/verifix_org.py`) — the
  live sync lists every cell with two seats as a `two_seats` item.

## A cell's «Jarayonlar» — one process or several (`cells.one_process`, 2026-10-10)

The operator's rulings (2026-10-10, asked one by one): a cell either works
through several processes («Ko'p jarayon», the default) or is specialised for
ONE («Bitta jarayon»: crêpes, cream-coating, sponge slicing, boxing…). Task 3
asks for photos of 3 DIFFERENT processes, which a leader whose cells only ever
do one process cannot give — for them that requirement is dropped.

- **`services/one_process.py` is THE rule** — `TASK` (3), `CRITERIA`,
  `applies`, `leader_applies`, `cell_applies`, `day_cell`, `leader_ids`. Never
  re-spell who it applies to.
- **Who**: a PER-CELL checklist day (`leader_task_days.cell_id`) is judged by
  ITS OWN cell's flag; every other day (a whole-leader day, a Google-Form row)
  by the leader's cells — `cells.leader_id`, the «Boshqaruvchi» who files the
  checklist, never the «Egasi» — that exist on that day (`cell_archive`): ALL
  of them one-process, and at least one. A leader with no cell, or one
  multi-process cell among several, keeps the 3-process rule.
- **What changes is task 3's AI text, and nothing else.** The chain becomes:
  the leader's OWN text → `one_process.CRITERIA` → the unit's → the global one.
  `CRITERIA` is the 26 Sep blind-tested one-process text (5 cm sleeve amendment
  included), byte for byte: still at least 3 separate photos (the same shot sent
  twice does not count), the clean-table and sleeve rules unchanged, all three
  may show the same process. A text an admin writes for ONE leader still wins;
  a unit's own task-3 text does NOT reach a one-process leader (the operator
  chose the tested text over an untested combination). Photo count, windows,
  date rule and weight do not move, and **the leader's Uzbek instruction does
  not change** (the operator: «leave it unchanged») — they are still told
  «3 xil jarayon»; only the grader is lenient.
- **Read at review time, stored nowhere.** Ticking a cell moves the NEXT
  verdicts only; nothing already judged is re-judged (the platform's rule for
  every criteria change) — «Qayta tekshirish» re-reads a past day, an
  objection argues one.
- **Readers**: `leader_ai.criteria_for` (the reviewer — `review_one` passes the
  day's cell through `day_cell` for task 3), `leader_tasks
  .effective_leader_config` («Vazifalar»' «AI nimani tekshiradi», the camera
  page — the description is resolved BEFORE the swap, so it never changes),
  `routers/leader_ai._criteria` (the «AI tekshiruvi» card's yardstick), and the
  admin config payload (`one_process: {task_id, criteria, leaders}` +
  `config_ownership(one_process_leaders=)`): «Chek-list sozlamalari» folds the
  text in at a picked leader, tags it «Bitta jarayonli yacheyka», names each
  such leader in «Istisnolar», and the leader editor's inherited text is the
  one-process one. Mixed per-cell leaders: «Vazifalar» answers for the leader
  as a whole (all cells), the reviewer per cell.
- **Where it is set**: the ONE cell form (`CellFormModal`, «Jarayonlar»: Bitta
  jarayon / Ko'p jarayon, with a hint naming the consequence), a «Jarayonlar»
  column (a neutral «Bitta» chip — a property, never a traffic light), a filter
  section and a phone-card line on /cells, a «Jarayonlar» column in the
  register's workbook, and a switch + hero chip on /cells/:id. Written through
  the register's own POST/PUT (`one_process`, None = untouched, a create naming
  none = «Ko'p»), so it is **CAP_CELLS_MANAGE** like every field of a cell; a
  grantee's flip DMs the admins (`l.one_process`), the Jurnal records it.
- **The five names became the flag** — TEMPORARY `services/one_process_seed_oct10.py`,
  `startup.seed_one_process_cells` (flag `one_process_cells_seed_2026_10_10_v1`,
  inline at boot, both entrypoints): every cell that exists today run by the
  five leaders named on 25 Sep (`leader_rules_sep26.ONE_PROCESS_LEADERS`) is
  marked «Bitta jarayon», and their leader-level task-3 text is CLEARED where it
  is still one of the 26 Sep one-process texts — they then read the very same
  text through the flag, so nothing a leader reads or is judged by moves. A
  text an admin wrote by hand stays (and wins); a leader with no cell keeps
  theirs. The marked cells are DMed to `UNPRICED_DM_CHAT` (once, flag
  `…_dm`) and logged as `org.cells_one_process_seeded`. Delete the module, the
  startup function and both calls once the DM flag reads «done» — before
  `leader_rules_sep26`, whose texts it compares against.

## A code is LATIN (`services/latin_code.py`)

From **2026-09-11** (the operator's call) every code a PERSON types is stored in
Latin letters — a cell's SAP code, a catalog line's SAP code and Команда, a work
centre in the catalog sheet's staffing block. A Cyrillic А, В, Е, К, М, Н, О, Р,
С, Т or Х is drawn identically to its Latin twin and is a different character
to every comparison, so a code typed on the Russian layout looks right on every
screen and matches nothing. It surfaced twice: a «В2942» typed into the /cells
search found neither 9411 nor 9423, and three of Suvonov Elshod OF's catalog
lines carried «А1432 · А1435 · А1436» and never read the ПЛАН/ФАКТ the SAP file
wrote under the Latin spelling.

- **`latin_code()` is THE rule and it converts only a CODE**: the value must hold
  a digit («ТОРТ» is a word made of twins) and every Cyrillic letter in it must
  have a twin («Цех 1» stays Russian rather than turning half-Latin). Anything
  else comes back untouched, which is what makes it safe on a column that
  sometimes holds text.
- **It sits on the doors a person types through**: `profiles._apply_cell_fields`
  (the cell register and its form), `pp_parser.parse_catalog_workbook` (the ABC
  sheet — an import re-creates every line, so without it each re-import brings
  the Cyrillic spelling back) and the catalog's create / edit / bulk endpoints.
  The SAP export is machine-written and deliberately not passed through it.
- **Every join stays a plain string comparison.** That is the point of fixing
  the data on write rather than teaching `cell_lookup._norm` and the `pp_calc`
  key a second alphabet.
- **A search folds BOTH sides** — `utils/latinCode.js` `latinFold`, on /cells:
  per character, over the query and the text searched, so a code matches
  whichever keyboard typed it and a Russian workshop name still finds itself.
  Broader than the storage rule on purpose: it decides only whether two strings
  match, never what is written.
- **What was already stored was converted once** — `startup.latin_twin_codes`,
  flag `latin_twin_codes_2026_09_11_v1` (changing what it converts needs a NEW
  key). Catalog lines go through the catalog editor's own identity carry
  (`_carry_manual_quantities`), so a ПЛАН/ФАКТ somebody typed follows the line
  onto the Latin key; a register row or typed pin whose Latin twin already
  exists is LEFT and named, never merged or deleted. One «Jurnal» row
  (`production.codes_latinised`) lists what moved. **Consequence to know:** the
  converted lines read the SAP figures the file had already stored under the
  Latin key, on every stored date at once — closed days included.
- Deliberately untouched: `quality_complaints.ref_no` (96 complaint numbers
  with Cyrillic letters on the Sep-3 copy) — re-synced from the Quality sheet,
  and nothing joins on it.

## Factory (plant) dimension

The company runs more than one plant. The dimension is attached in **exactly one
place** — `managers.factory_id` — and everything else derives from it: a cell
follows its supervisor, a leader follows their unit, a downtime/quality row
follows the supervisor its name resolves to, a concern follows the unit it was
logged against. Never add a second `factory_id` column; two sources let a cell
claim factory A while the supervisor running it sits in factory B, and there is
no correct way to render that.

- `app/services/factory_scope.py` is THE definition. Endpoints take
  `factory: Optional[int]` and call `scoped_manager_ids(db, payload, factory,
  manager_id)`, which intersects the factory with the caller's existing
  supervisor filter AND enforces the viewer lock. `None` = no narrowing;
  an EMPTY list is a real answer ("no supervisor matches") — always test it with
  `empty_scope()` or the empty factory reads as the whole plant.
- **Supervisors and leaders are locked** to their own plant server-side
  (`resolve_factory` overrides whatever `?factory=` says), answered through
  their UNIT (`managers.factory_id`). Hiding the tab is not the mechanism — the
  query parameter is typeable. Admin, top-manager and (from 2026-11-04)
  shift-manager switch freely.
- Factory-aware pages: Overview, Zagruzka, Ojidaniya (`Downtime`), Workers,
  Quality, Concerns. Frontend state is ONE shared value in
  `context/FactoryContext.jsx` (`useFactoryParams` merges it into request
  params, `useFactorySupervisors` scopes a supervisor picker and drops a pick
  that fell out of the plant). Deliberately NOT per-page `usePersistentState`:
  six pages remembering different plants is a contradiction nobody can see.
- Rows that resolve to no supervisor (unmatched Quality names, unassigned units,
  legacy concerns) appear ONLY under «All factories» — visible, never silently
  dropped, never padded onto a plant they may not belong to.
- The switcher is `useFactorySection()` from `components/ui/FactorySelect.jsx` —
  a `FilterPanel` section, first in each page's section list (chip when
  narrowed, inert chip for locked viewers). See the UI-template table.
- Admin: `pages/admin/Factories.jsx` (`admin.factories.manage` capability) owns
  the register, tab order, the ONE global default tab, the «All» tab switch, and
  both assignments — supervisor units and shift-manager profiles.

## A shift-manager reaches EVERY shift and EVERY plant (`shift_scope`, 2026-11-04)

The operator (2026-11-04): «all shift managers should have access to all
factories and all shifts». From 2026-09-02 until then a shift-manager's reach
was the intersection of their shift and their plant. **Read the older
sections' «shift ∩ plant» for a shift-manager as «every unit»** wherever they
describe what one may read or act on.

- **`services/shift_scope.py` is still THE definition.** **Reach** —
  `unit_ids` (every unit; archived ones only with `include_archived`) and
  `covers` (any existing unit) — is what every page, guard and register reads:
  /staff and /daily (tables, requests, approvals), /concerns and
  /cell-concerns, /production's picker, /tasks, /kelish (read-only, as before),
  /people, «Liderlar KPI» / «Brigadirlar KPI», the bell's «Sizdan kutilmoqda»
  queue, `capabilities.profile_unit_ids` (so a shift-manager's «own» grant
  scope is every unit too).
- **Every shift-manager is NOTIFIED about every unit** — only of what waits on them from 2026-11-11 (`docs/notifications-and-telegram.md` «What a shift-manager is told») (the operator, the same
  day: «notify all of them»). `role_ids_for_unit` returns every shift-manager
  profile for any existing unit, so it is the inverse of `covers` again:
  every unit's request DMs and bell rows (`staff._notify`), the live-day
  notices (`staff_live._notify` — «everybody left», «day still open»), a
  legacy concern with no picked holder, and the supervisor's escalation picker
  and its validator (any shift-manager may be picked). `concerns._sm_names`,
  its in-memory twin, names all of them. `role_profiles.shift` / `factory_id`
  (and the «Smena menejerlarini biriktirish» block on «Zavodlar») now decide
  nothing about reach or routing — a record only.
- **No plant lock**: `factory_scope.viewer_factory_id` answers None for a
  shift-manager, so `locked_factory_id` is null and the plant switcher is a
  free section on every factory-aware page.
- **No shift lock**: `/shift-daily` (and `/daily`, which forks a shift-manager
  to it) offers S1 / S2 / Barchasi like for an admin; the «Smena hisoboti»
  board (`shift_report._scope`) and `/live` (`live_overview._own_scope`) no
  longer pin their shift; /concerns offers the shift filter; the bot's
  `_caller_shift` answers None for them.
- Consequence to know: the bell queue's red badge of a shift-manager now counts
  every unit's pending decisions, since any of them may act on any.

## Cell shift times (`/panel/shifttimes`)

From **2026-08-21** a cell carries the clock it actually works —
`cells.shift_start` / `cells.shift_end`, two nullable `VARCHAR(5)` "HH:MM"
columns, edited on the admin «Smena vaqtlari» destination
(`pages/admin/ShiftTimes.jsx`, capability `admin.cell_hours.manage`).

- **It is a REGISTER and nothing more.** No KPI, no score, no validation reads
  it: загрузка still divides by the flat 480/`pp_shift_min`, the idle-cell
  ojidaniya pickers still accept any hour ("a bound guessed from a shift would
  refuse honest data"), and the leader checklist still runs on its own five
  per-shift constants. Wiring a consumer is a separate decision — **ask before
  making these hours move a number**, because the moment one does, every cell
  whose clock nobody has confirmed starts scoring against a placeholder.
  (The tab's card 1b, each shift's DAY-CLOSE clock, is a separate setting and
  IS enforced — «A brigadir closes a day only from the shift's clock».)
- **`services/cell_hours.py` is THE definition** — `defaults`, `resolve`,
  `duration_min`, `crosses_midnight`. Duration is always DERIVED; there is no
  minutes column, and a second place computing "how long is this cell's shift"
  is how the two answers start disagreeing.
- **Both-or-neither.** A cell has both clocks or neither; a half-set pair is
  refused on write and reads as inherit. NULL = inherit the SHIFT default, and a
  cell's shift is still its supervisor's — this adds a clock to a cell, never a
  second shift dimension (`Manager.shift` stays the only one).
- **The defaults are two `AppSetting` rows** (`cell_hours_shift_1` /
  `cell_hours_shift_2`, value `"HH:MM-HH:MM"`), seeded once with a **placeholder**
  08:00–20:00 / 20:00–08:00 that an admin is expected to confirm. Editing one
  silently re-times every inheriting cell, so the Save confirms and names that
  count. `startup.add_cell_shift_times` only ever inserts a MISSING key — it
  must never overwrite a value an admin set.
- **Clock convention, unchanged from everywhere else**: Tashkent wall clock,
  `end <= start` ⇒ crosses midnight (+1440), `start == end` refused (the
  `idle_cell` rule). The client's duration helper is a deliberate twin of
  `duration_min` and must stay one.
- Bulk editing is the **SELECTION**, not the filter: checkbox rows with
  «select all visible» (the `Factories.jsx` model), a sticky bulk bar naming the
  count, and a primary button that carries the count into its own label. The
  ltasks "the filtered set IS the scope" model is deliberately NOT used here —
  filters narrow to a brigadir's cells, but the two exceptions in that list are
  exactly what an operator needs to drop.
- Read surfaces: this tab and `/cells/:id` (the Ownership card's «Ish vaqti»
  row, fed by `hours` on `GET /api/profiles/cells/{id}/details`).
