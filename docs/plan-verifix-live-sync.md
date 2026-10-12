# Cells, leaders and brigadirs follow Verifix LIVE — the operator's rulings (2026-10-12)

The asks, verbatim, in the order they came:

1. «Our cells, leaders and supervisors should be synched with Verifix through
   API live. Every change happened on Verifix should happen on ours also. First
   check our structure and how data arrives from the Verifix and tell structure
   synching process.»
2. «Check if this switch doesn't cause any problems» — eight problems were
   listed (the table below).
3. «Ok from the synch, the history shouldn't get affected. Does it solve several
   problems?»
4. «Solution for one of the problems: By default the owner will be the manager
   but we can change the manager manually (we can pick one worker of the cell's
   unit to make the manager of the cell). The list of the workers of that unit
   should be selectable and should shown a suggestions. We can't chose someone
   who is not on verifix. How many problems does it solve?»
5. «Connect verifix and our platform rows. For example Maksumov Sanjar on our
   platform should be connected to Maksumov Sanjar on verifix through id or
   something. One run matches them and connects. The nexy changes on verifix
   then affects or platform too. The same thing happens with cells and pther
   profiles. Clear?»
6. «How many problems still left to be solved?» — two were left, with a
   proposal each, plus two side questions with a proposal each.
7. «Explain the last 2 problems» — explained (recorded under rulings 5 and 6).
8. «Ok write the full plan as your proposals accepted.»

This file is the record: the operator's four rulings, the four proposals they
accepted whole, and the build the rulings imply. **Nothing in it is built** —
the plan is the deliverable of 2026-10-12. When it ships, CLAUDE.md gets a
section of its own and this file stays as the record of why.

## Where it starts from

Three registers, one Verifix tie each, and every tie made by NAME, once, by a
TEMPORARY one-shot (CLAUDE.md: «The cells register follows Verifix», «Leaders
× Verifix», «Every Verifix cell, every Verifix leader», «A brigadir on
Verifix», «A cell's «Egasi» and «Boshqaruvchi»»):

| Register | Table | Identity here | Tie to Verifix today | Platform's own, never a Verifix fact |
|---|---|---|---|---|
| Cell | `cells` | `verifix_code` (unique, Latin; every attendance, ojidaniya and staff-list row joins on it) | the subdivision's `code`, re-matched by code on every pass; the division **id is not stored** | brigadir `manager_id`, «Boshqaruvchi» `leader_id`, `in_load`, `wc_group`, `sap_code`, `one_process`, shift clocks |
| Leader | `role_profiles` (role leader) | name + unit, unique per unit | `leader_kind_meta.vfx.id` where the 4–5 Oct checks matched or created the profile; nothing on the ones they could not match | the unit it files under (`manager_id`), `checklist_shift`, a hand-set `leader_kind` |
| Supervisor unit | `managers` (the unit IS the profile) | id (the attendance file's id) | `supervisor_kind_meta.vfx.id`, same shape | `shift`, `factory_id`, `zagruzka_on`, `archived` |
| Other profiles (shift-manager, top-manager, admin, guest) | `role_profiles` (the role column) | name | none | everything |

What Verifix hands over (`services/verifix.py`, the «Verifix (test)» pages):
`core/division$list` (539 on 1 Oct: id, name, `parent_id`, `code`, state A/P,
opened/closed dates), `core/employee$list` (8,511 of every status, 2,942
working: id, three-part name, status, `job_id`, `division_id` = department,
`org_unit_id` = the cell, hire and dismissal dates, photos), `core/job$list`.
**No list carries a «changed since» stamp**, so a sync DIFFS. Three employee
statuses exist — W working («Ishlaydi»), D dismissed («Bo'shagan», with a
dismissal date), U taken on but not started («Qabul qilinmagan»); **leave is
not a status.** Only people moves have a dated journal (`pro/transfer$list`,
the hiring and dismissal lists); divisions have none.

The platform reads this directory on a clock already: the staff-live minute job
(`verifix_live.run_pass`) re-reads divisions, jobs and the WORKING employees
every `DIR_TTL` (10 min) into `live_verifix_reads` key `dir`
(`_read_directory`: a division's code, raw code and name; a working employee's
name, org unit, department and job — nothing else), and the turnover job reads
it nightly at 23:40. The matching rules exist too, but only inside the one-shots:
which subdivision is a cell (`verifix_cells_leaders_sync.cell_nodes`, the
name-coded `_NAME_CODE` ones included), the strict name match with the
operator's pins (`leader_verifix_check._match`, `PINS`), the nearest brigadir up
the tree (`_brigadirs_over`), the HOLD / SKIP reasons for an unsafe connection,
the rename rule (`verifix_cell_sync.vx_name` / `_renamed`), the seat rule and
the sure-tie test (`cell_owner_pass._ties`, `SURE_HOW`, `_same_person`), the
workshop narrowing for brigadirs (`verifix_supervisor_check`), the photo store
(`verifix_profile_photos` → `profile_photo.store`).

Every register write has cascades a sync must not bypass, and they live in
`routers/profiles.py`: `_set_leader_cells` (a leader's unit move drags their
cells, `wc_group.settle_moved`, `leader_load.forget()`), `_apply_cell_fields` (a
leader pick carries the cell to the leader's unit; an owner pick stamps `src:
manual`), `admin_archive_cell` (effective from the next day), `_rename_profile`
(cascades into role rows, translation keys, the registration list). The 5 Oct
pass wrote `leader_id` directly and called none of them — the first rule of
the build is that this never happens again.

## What is being built

The three registers FOLLOW Verifix through a stored Verifix id per row. One run
ties every row it can be sure of and lists the rest for the operator to tie by
hand. From then on a pass every ten minutes, on the directory the staff-live job
already reads, applies what may safely follow by itself and turns everything
else into a suggestion a person taps. The Verifix seat («Egasi») is a cell's
manager by default; a brigadir may override it from the unit's own Verifix
workers and from nobody else. No day already filed changes a figure: the cell's
links become DATED, a change lands at the unit's next shift opening, and
archiving is at NOW. A dismissal on Verifix releases the person's cells and
cuts their results from that day on, keeping the profile and its history; any
other way of vanishing is a suggestion.

## The rulings

1. **Every change on Verifix happens here too — by itself.** The first ask.
   The platform already reads Verifix every ten minutes; from this build a
   tied row follows its Verifix record on that clock, and what cannot follow
   safely (the catalogue below) becomes a suggestion with one tap, never a
   silent nothing. Cadence: the existing ten-minute directory read (accepted
   over nightly).
2. **History is never affected** («from the synch, the history shouldn't get
   affected»). A change made by the sync — and, from the same build, by a
   person on /cells — reaches NO day already filed: a cell's unit, manager,
   owner and archive state become dated links (the «Ish grafigi» roster
   pattern: the state on day D is the last event at or before D); every change
   lands at the unit's NEXT shift opening, so the running day and its closed
   copy never jump; an archive is at now, never Verifix's close date; a
   restore is a dated event, so the archived days stay archived. Every
   past-day figure reader asks for the day instead of the current row.
3. **The Verifix seat is the manager by default; a brigadir may change the
   manager by hand, picking ONE worker of the cell's unit from a list with
   suggestions; nobody who is not on Verifix can be picked.** Verbatim ruling
   4. The pool is the stored directory, so a pick never drags a cell into
   another unit; the pick is the «set by hand» mark; a pick ties or creates the
   profile by Verifix id. Consequences accepted with it: the first pass
   grandfathers every cell whose manager today is not the seat as a manual
   override; an override outlives a seat change in Verifix (the new seat is
   shown as a suggestion with one tap to adopt); a picked person who leaves
   Verifix releases the cell to its default or to «no manager», and the
   brigadir is told; the three leader profiles Verifix never found stay,
   flagged, and cannot be picked; «Egasi» becomes Verifix-only (its manual
   source retired — the manual choice lives on the manager now); a leader's
   unit move no longer drags cells.
4. **Rows are connected by Verifix id. One run matches and connects; the next
   changes on Verifix then reach the platform through the tie — cells and the
   other profiles the same way.** Verbatim ruling 5. The run writes ONLY the
   tie, and only where it is sure (a full-name or surname + first-name match
   with one candidate, or a pin); namesakes, a profile Verifix cannot find,
   one Verifix person for two rows and the two Suvonov Elshod units are listed
   for the operator, who ties them by naming the pair, the way the pins work.
   A tie whose Verifix name stops looking like the same person
   (`_same_person`) is held, never followed. Nothing is guessed, ever.
5. **A new leader owes from the day they claim the profile** (proposal,
   accepted). A profile the sync creates for a seated leader is on the register,
   «Ish grafigi» and the concerns box from day one, but its checklist
   obligation and its place in every ranking start on the day the person claims
   the profile in the bot (`owes_from`); a brigadir's own pick starts it on the
   pick day — the brigadir chose them to file and a 0 is the right signal to
   get them registered. The roster gets a creation floor, so no day before a
   profile existed is ever counted as missed. A seat whose employee is status U
   is never connected until it is W.
6. **Only «dismissed, with a dismissal date» is leaving** (proposal, accepted).
   Then: the manager and owner slots are released (the cell falls back to its
   default seat or reads «no manager» for the brigadir to pick), the profile
   gets a cutoff from the LATER of the dismissal date and today (dismissals are
   typed late and dated back; under ruling 2 the days between keep whatever
   they scored), the profile, its history and its photos stay, and the brigadir
   is told once. Any other status change, and a tied id that is simply not in
   the list (moved to another Verifix organisation, a record merged or deleted
   by HR, a hire withdrawn, a partial answer), is a suggestion with nothing
   written. An id that returns to working lifts its own cutoff, with a notice.
7. **The other profiles are tied too** (proposal, accepted): shift-managers,
   top-managers, admins and guests get the employee id by strict name. Their
   photo follows Verifix where nobody set one by hand (automatic); a rename or
   a dismissal is a suggestion. Nothing else follows — none of them is a
   Verifix role.
8. **The KPI pages rank by the effective manager** (proposal, accepted).
   «Kadrlar qo'nimsizligi» and «Ishchi havotirlari» were to switch to «Egasi»
   (CLAUDE.md, 8 Oct: «Nothing reads the Egasi yet … switch to it in the NEXT
   step»); they rank by `leader_id` instead — the person who answers for the
   cell — and that planned switch is CANCELLED. Both pages keep what they do
   today; the only change they see is that `leader_id` becomes the seat by
   default.

Two further proposals from the first answer stood unchallenged through the
dialogue and are part of the plan: **a new Verifix brigadir with no unit here
is never created automatically** (shift, plant and «Zagruzka hisoblanadi» are
a person's decisions; a tap creates the unit the 8 Oct way — OFF, no shift,
no plant), and **a dismissed leader keeps the profile** (ruling 6), never a
deletion.

## The eight problems, and where each one stands

| Problem (named on 2026-10-12, worst first) | Answer | Ruling |
|---|---|---|
| A cell's unit change rewrites history — ojidaniya weighs every past day by the CURRENT brigadir, the live day builds who-belongs-where from the current registry every minute, a closed day is re-copied from it | dated links + the sweep of past-day readers + changes land at the next shift opening | 2 |
| Verifix cannot express «Boshqaruvchi» — one employee sits in one org unit there; here one leader runs several cells, two Verifix leaders sit in 0111 / 0822 / 0912, one person runs both Suvonov Elshod units, two unit brigadirs are «Лидер» on Verifix | the seat is the DEFAULT, a brigadir's pick from the unit's workers is the exception; units are tied by hand where one person holds two | 3, 4 |
| Nothing marks a unit link as set by hand — Turdimurodov counted under Aripova with 0811 in his own unit, Umarova Mapura, would be «corrected» every ten minutes | the manager pick IS the mark; brigadir changes and unit moves are suggestions, never writes; a dismissed suggestion is remembered | 3 |
| Names must not follow Verifix — capitals and its own transliteration; a rename cascades and splits a person's history by spelling (a fifth of sheet rows match by spelling alone) | tied by id, so a rename never makes a second person and lands as a suggestion; an accepted rename keeps the old spelling as an ALIAS | 4 |
| A new leader profile owes a checklist from its first day — the roster has no «since», the digest prints «not filed», the checks fail them, the exclusions tab lists a month of missed days | `owes_from` = the claim day (a pick: the pick day) + a creation floor on the roster; U is never connected | 5 |
| Disappearing is not dismissal — the live directory keeps working employees only; «not in the list» read as «left» releases a slot and writes a cutoff that ten minutes later is wrong | only status D with a date is leaving; everything else is a suggestion; a return to W lifts the cutoff | 6 |
| Archive flapping and backdated closes — a restore clears `archived_at` and re-counts every archived day twice; a Verifix close date reaches days already reported | archive at now, after the change persisted through two reads; restore is a dated event | 2 |
| A division's code changed — the code is the join key of attendance, ojidaniya and the staff lists; renaming ours breaks every join, keeping ours archives a living cell | the stored division id detects it; a tap applies a code-rename cascade; until then the cell is flagged and untouched | 4 |

## Settled by earlier rulings (not re-asked)

- **A cell is its CODE**; the workshop name is never printed, so Verifix's
  renames reach nothing a reader sees.
- **What a Verifix cell is** (4 Oct, 5 Oct): a coded subdivision that no
  employee holds as their DEPARTMENT, plus the name-coded ones («4711 Зона
  отправки»); departments, codes spelled two ways and one code on two
  subdivisions are reported, never cells. A created cell has no brigadir, is
  out of the загрузка and carries the ru name only.
- **The seat** (8 Oct): a WORKING employee with a leader's job
  (`is_leader_job` — «Лидер», never an assistant, deputy or «и.о.») whose org
  unit is the cell; two seats in one cell → none until the operator says which.
  «Follow Verifix for ownership and our platform for managing» — now with the
  seat as the default manager (ruling 3).
- **The strict name match** (`leader_verifix_check._match`: pin → full name →
  surname + first name with no clashing patronymic → namesakes narrowed by the
  leader's own cells, then the unit's → first-name-first swapped → a
  surname-only typo with the same first name standing in the leader's own
  cell); never a fuzzy match saved. `SURE_HOW` = full / two / pin.
- **The 5 Oct safety rules** for connecting a created profile (`HOLD`: no
  brigadir on the cell, another leader, a profile Verifix places there, two
  profileless leaders, the cell archived / missing / unsure) and for not
  creating one (`SKIP`: a one-word name, the same name in another role, a
  possible namesake Verifix could not find, two Verifix leaders of one full
  name, the exact name existing). They become the pending queue's reasons.
- **A closed cell is ARCHIVED, never deleted**, and from the day AFTER its
  archive day it is gone from lists and counting (`cell_archive`, 10 Oct).
- **`leader_kind` / `supervisor_kind`** are registers with ONE reader each
  (the worker-concerns ranking; nothing for units); a value set by hand is
  never overwritten.
- **A leader with no cell in the загрузка owes nothing** (`leader_load`, from
  1 Oct) — unchanged, and `leader_load.forget()` must be called by every
  register write.
- **Shift-less, plant-less units are tolerated** by every clock resolver (nine
  run today); they enter the bot's registration list and the concern pickers,
  which is why a unit is a tap and never automatic.
- **A dated register** is the `kelish_roster_events` pattern (append-only,
  `effective_from`, the state on day D is the last event ≤ D, stamped with
  the cell's CURRENT shift-day so nothing done today reaches a past day).
- **Only the copy holding the jobs lock runs jobs** (blue-green); startup
  migrations are ADDITIVE; a Verifix answer that is cut applies nothing
  (`MIN_DIVISIONS` 100, `MIN_EMPLOYEES` 1000, the found-share guard).
- **Every change in the Jurnal**, every DM through the existing notifiers, the
  bell's «Sizdan kutilmoqda» for what waits on a person.

## Assumptions the build makes (say if wrong)

- **The directory read is widened, not duplicated.** `verifix_live._read_directory`
  keeps, per division, its parent, state, opened and closed dates; per
  employee, EVERY status (W / D / U), the job, the org unit, the department,
  the hire and dismissal dates and the main photo's id — about three times the
  employee rows it keeps now, a few more Verifix pages every ten minutes. The
  staff-live readers go on reading the working people exactly as before (they
  filter on status); the sync reads the rest from the same stored row.
- **«Claimed» = an approved registration keyed to the profile**
  (`Registration.profile_key`, `approved_at`); `owes_from` is written at that
  approval and never later. A profile claimed before this ships has
  `owes_from` NULL and owes as it always did.
- **The effective day of a change is the unit's next shift opening**, the
  shift-frame rule the live day and «Smena hisoboti» run on
  (`live_overview.shift_frame` over `cell_hours.defaults`); a shift-less unit's
  is the next calendar day. A change seen at 14:00 on a shift-1 unit lands at
  tomorrow 08:00; on a shift-2 unit at 20:00 tonight. The closed copy of the
  previous day freezes at that moment by the existing rule (ruling 13 of the
  live-day plan), so nothing is re-copied across the change.
- **The `cells` columns stay the CURRENT mirror** of the latest events, written
  in the same transaction, so the ~100 present-tense readers (pickers, forms,
  the live day, the checklist a leader files now) need nothing. Only past-day
  figure readers change (the sweep below).
- **The manager picker's pool** is the stored directory's WORKING employees
  whose org unit is one of the unit's cells — leader jobs first, the cell's own
  seat on top as the suggestion, then everybody else as «Lider o'rnida»
  candidates (the kind follows the job). A unit with no tied cell has an empty
  pool and the control says so.
- **«Persisted through two reads»** applies to every automatic change that
  takes something away — an archive, a dismissal's release and cutoff — and
  means the fact stood in two consecutive directory reads (≥ 10 min apart).
  Creations, renames, kinds, seats and photos apply on first sight; a wrong one
  is undone by the next read.
- **A hand-set «Egasi» that differs from the seat** (the few `src: manual`
  owners written since 8 Oct) is reported by the first pass and the cell's
  manager is left exactly as it stands (grandfathered as manual where it
  differs from the seat). From then on `owner_id` is the seat and nothing else.
- **Renames keep the register's spelling.** A Verifix rename is a suggestion;
  accepting it runs `_rename_profile` (the cascade) and records the old
  spelling as an alias the register's name grouping reads (`leader_match`), so
  the sheet-era days filed under the old spelling stay the same person.
- **Photos**: a tied profile with no hand-set photo takes Verifix's main
  identification photo through `profile_photo.square_jpeg` + `store`, re-taken
  when Verifix's photo id changes. A photo somebody uploaded is kept (the 5 Oct
  rule).
- **Units**: a tied unit follows its brigadir's kind and dismissal (a dismissed
  brigadir: the unit is NOT archived — a suggestion names it, since the unit
  holds attendance and the загрузка). A unit's shift and plant never follow
  Verifix (it has neither).

## What is AUTOMATIC and what WAITS for a tap

Automatic — written by the pass, each in the Jurnal, named in the pass's digest:

| Verifix fact | What the pass writes |
|---|---|
| A coded subdivision opens with people working in it, no cell here | a cell, the 4 Oct way (no brigadir, out of the загрузка, ru name), tied by division id |
| A tied subdivision's name changed | the cell's ru name (and uz_cyrl where non-empty); never printed anywhere |
| A tied subdivision closed (state P) or left the list, seen twice | the cell archived AT NOW (`archived_by` «Verifix (avtomatik)»), effective the next day by the 10 Oct rule |
| A subdivision the SYNC archived is open again | a dated restore event from the next shift opening; the archived days stay archived; a cell a PERSON archived is reported only |
| The seat of a tied cell (one working leader-job employee in it) | `owner_id` = that leader (profile created where none, see below); two seats → none + a pending item |
| The seat, where no manual manager event stands | `leader_id` = the seat, from the unit's next shift opening; where the seat's profile is in ANOTHER unit → a pending «leader moved units» item, the manager untouched |
| A working leader with no profile, in a tied cell | a leader profile: Latin Title Case name, kind from the job, the cell's unit, tied by employee id, `owes_from` NULL; connected only under the 5 Oct `HOLD` rules, else created unconnected + pending; a `SKIP` reason (possible namesake, one-word name, the name in another role) → no profile, a pending item |
| A tied person's job changed | `leader_kind` / `supervisor_kind` from the job unless set by hand (`src: manual`) |
| A tied person's photo id changed | the profile photo, unless a person uploaded one |
| A tied person is status D with a dismissal date, seen twice | manager and owner slots released (the cell falls back to its seat, else «no manager»); cutoff from max(dismissal date, today); profile, history, photos kept; the brigadir told once; a shift-manager / top-manager / admin / guest → a suggestion only (ruling 7) |
| A cut-off id is working again | the cutoff lifted, a notice to the brigadir and the admins |

Pending — a `verifix_sync_items` row, the bell's «Sizdan kutilmoqda» for admins,
the admin page; nothing written until the tap:

| Verifix fact | The tap does |
|---|---|
| The brigadir over a tied cell changed (another unit's brigadir stands over the subdivision, ≥ 2/3 rule) | a dated `manager_id` event at the next shift opening (attendance routing and the загрузка follow from that day) |
| A tied leader's seat is in a cell of ANOTHER unit | moves the profile's unit (no cells dragged — ruling 3) and applies the default manager |
| A Verifix brigadir with no unit here | creates the unit the 8 Oct way (OFF, no shift, no plant) and joins the brigadir-less cells under them |
| A tied subdivision's CODE changed (same id) | the code-rename cascade over every table keyed by `verifix_code`; until then the cell keeps its code and wears a flag |
| A tied person's name differs from the profile's (and still looks like the same person) | `_rename_profile` + an alias of the old spelling |
| A tie whose name no longer looks like the same person | nothing automatic ever again for that row; the operator re-ties or confirms |
| Two working leaders in one cell | names the seat (the other stays a candidate in the picker) |
| The seat of a cell with a manual manager changed | adopts the new seat as manager (one tap) or keeps the override (dismiss) |
| A tied id not in the list, with no D status | nothing; the row waits; the item names how long |
| An unsure tie from the run (namesakes, not found, one Verifix person for two rows) | the operator names the pair → a row in `verifix_ties` (a pin, wins over every rule) |
| A created profile that could not be connected (`HOLD`) | the connection, once the cell has what it lacked |
| A rename or dismissal of a shift-manager / top-manager / admin / guest | the rename, or whatever the admin decides about the account |

A dismissed suggestion is remembered by (kind, key, value) and does not come
back until the Verifix value changes again.

## Data model (all additive)

- `cells.vfx_division_id` (indexed, nullable) + `cells.vfx_meta` (JSONB: the
  name, raw code, state, parent, opened, closed, seat, `seen_at` as last
  applied) — the tie and what the pass last saw, so the diff is current
  directory vs `vfx_meta`, with no second snapshot table.
- `role_profiles.vfx_employee_id` (indexed, on EVERY role — ruling 7) promoted
  ONCE from `leader_kind_meta.vfx.id` (the meta stays — `LeaderKindNote` prints
  it) +
  `role_profiles.vfx_meta` (status, job, org unit, department, hired,
  dismissed, photo id, `seen_at`) + `role_profiles.owes_from` (date) +
  `role_profiles.name_aliases` (JSONB list of earlier spellings).
- `managers.vfx_employee_id` promoted from `supervisor_kind_meta.vfx.id` +
  `managers.vfx_meta`.
- **`cell_link_events`** — append-only: `cell_id`, `field` (`manager_id` |
  `leader_id` | `owner_id` | `archived`), `value` (int / bool), `effective_from`
  (date, the unit's shift-day the change lands on), `src` (`verifix` | `manual`
  | `grandfather` | `restore`), `at`, `by` (a name snapshot), `vfx` (what
  Verifix said). `services/cell_links.py` is THE reader: `at(cell_id, field,
  day)`, `map_on(day)` (every cell's links on one day, one query), and
  `cell_archive.alive(cell, day)` folds the `archived` events. The first boot
  writes one `grandfather` event per cell per field from the current columns,
  dated the floor, so a day before the floor reads the current row exactly as
  today.
- **`verifix_ties`** — the operator's hand ties (the `PINS` dict as rows):
  `kind` (cell | leader | unit | profile), `our_id`, `vfx_id`, `how`, `at`,
  `by`. A tie here wins over every matching rule, as a pin does now.
- **`verifix_sync_items`** — the pending queue: `kind`, `key`, `payload`,
  `status` (open | applied | dismissed), `first_seen`, `last_seen`,
  `decided_at`, `decided_by`, `value_hash` (what a dismissal remembers).
- **`verifix_sync_runs`** — one row per pass: counts per kind, the guards'
  verdict, errors, duration; read by the admin page.
- No column is dropped or renamed; the one-shot metas stay readable.

## The tie run (phase 1)

One pass, flag-guarded, DMed as text + a workbook to the operator's chat like
every Verifix pass, its record in an app setting:

- **Cells**: `cell_nodes` over the full division list → `vfx_division_id` by
  code (`verifix._code_key`, so «0028» and «28» are one). A code on two
  subdivisions, or two cells on one code (spelled two ways), is listed, not
  tied.
- **Leaders**: existing `leader_kind_meta.vfx.id` promoted as it is (those ties
  were made by the strict rules or the operator's pins). Every untied leader
  profile through `_match` narrowed by its own cells, then its unit's; only
  `SURE_HOW` ties are written.
- **Units**: `supervisor_kind_meta.vfx.id` promoted; untied units through the
  strict rules narrowed by the unit's Verifix workshop (the 4 Oct brigadir
  check); the two Suvonov Elshod units are listed (one person, two rows — the
  operator ties by naming which, or both).
- **Other profiles**: strict full-name or surname + first-name match with one
  candidate; everything else listed.
- The report: every tie made and how; every row listed with its candidates;
  a count of what a first sync pass WOULD do (dry run — see the test plan).
- The admin page's «Ulanmaganlar» list lets the operator tie a row by picking
  the Verifix person or subdivision (search over the stored directory), which
  writes `verifix_ties` and the id column.

## The manager picker (phase 2)

- **Where**: the ONE cell form (`CellFormModal`, /cells and /cells/:id) — the
  «Boshqaruvchi» control becomes a `StyledSelect` over the pool with the seat
  first and marked «Verifix bo'yicha» (the default), the others under it; and a
  brigadir's own door on /cells (a supervisor reads their unit's cells there
  already) — `can_edit` widens to «the cell's own unit's supervisor may set its
  manager», nothing else on the form. The admin keeps the whole form.
- **The pool**: the stored directory's working employees whose org unit is one
  of the unit's cells, leader jobs first (`is_leader_job`), then the rest.
  Never a free-text box; never somebody not on Verifix (ruling 3).
- **A pick**: resolves the Verifix person to a profile by id; creates one (the
  register's spelling, kind from the job, the cell's unit, `owes_from` = the
  pick day) where none exists; writes a `leader_id` event `src: manual`
  effective from the next shift opening; never moves the cell's unit; calls the
  register core (`leader_load.forget()`, group settlement, the Jurnal). A pick
  OF the seat clears the override (back to «Verifix bo'yicha»).
- **Grandfathering** (phase 2's one-shot): every cell whose `leader_id` is not
  its seat gets a `grandfather` manual event; the ones with no seat and a
  manager too. The 8 Oct report already listed them — Turdimurodov / 0811 and
  Umarova Mapura stay exactly where they are.
- **The seat changes under an override**: nothing moves; the form shows the new
  seat as «Verifix taklifi» with one tap to adopt; a pending item for admins.
- **The picked person leaves Verifix** (ruling 6): the override event is closed
  by a `verifix` event to the seat, else to NULL; the brigadir is told
  («yacheykaga boshqaruvchi tanlang»).
- **The three profiles Verifix never found**: kept, a flag on the form and the
  roster («Verifixda topilmagan»), not in any pool.
- **«Egasi»**: read-only on the form (the seat, «Verifix bo'yicha», with the
  seat's unit where it is not the cell's); the manual source and the owner
  picker are retired. The 8 Oct `owner_meta` keeps its shape.
- **`_set_leader_cells` stops dragging cells** on a leader's unit move: the
  cells keep their unit and their manager; the form says so.

## The pass (phase 3)

- **Where it runs**: `services/verifix_sync.py`, called by
  `verifix_live.run_pass` right after a fresh directory read lands (every
  `DIR_TTL`), on the copy holding the jobs lock; never from a request. One
  `record_system` row per pass that changed anything; a pass that changed
  nothing writes nothing.
- **Permanent modules**: `services/verifix_org.py` (the read + the classifiers
  lifted out of the one-shots: `cell_nodes`, the seat rule, `is_leader_job` /
  `is_supervisor_job`, `_brigadirs_over`, `_match`, `_same_person`, `vx_name`),
  `services/verifix_sync.py` (the tie run, the pass, the queue),
  `services/cell_register.py` (the register cores lifted out of
  `routers/profiles.py` — the router calls them, so the form and the sync run
  ONE cascade), `services/cell_links.py` (the dated reader).
- **Order inside a pass**: cells (create → rename → archive / restore) → units
  (kind, dismissal) → people (kind, photo, dismissal, return) → seats (owner,
  default manager) → the queue (new items, items that settled themselves,
  i.e. the Verifix fact went away).
- **Guards** (a breach applies nothing and DMs the admins): the cut-answer
  guards (`MIN_DIVISIONS`, `MIN_EMPLOYEES`, ≥ 80 % of tied cells found open);
  per-pass caps — ≤ 15 archives, ≤ 20 cell creations, ≤ 10 dismissals, ≤ 30
  seat moves — a pass over a cap refuses WHOLE; a tied id missing from the list
  is never an event on its own (ruling 6); «two reads» for archive and
  dismissal.
- **Effective day**: computed per unit (`shift_frame`); an event dated in the
  future is applied to the mirror columns by a tiny job at the next shift
  opening (`cell_links.apply_due`, minute job), so the columns always show the
  day in force.
- **Visibility**: a digest DM to the admins after a pass that changed anything
  (counts + names, the pending count), the bell's «Sizdan kutilmoqda» for every
  open item (admins; the brigadir for «pick a manager»), the admin page
  «Verifix sinxron» (`/admin/upload?tab=verifixsync`, group Vositalar,
  admin-only and NOT grantable — it moves people and access): the queue with
  one-tap approve / dismiss, the untied rows with the pair picker, the hand
  ties, the pass log, a «Hozir tekshirish» button (a forced directory read +
  pass).

## Readers that become day-aware (phase 5)

The cell's unit / manager / owner / archive on a PAST day is answered by
`cell_links` instead of the current row in: `idle_source._n_by_cell` and
`cell_counts` (the ojidaniya weight), `ojidaniya_cost`, `zagruzka_source.cell_pins`
/ `cells_by_wc` / `cell_labor` (the work-centre split), `plan_fulfillment`,
`production._cell_letters` / `cells_at`, `arc_cells.org_index`, the Quality
org chain (`supervisor_match` over a day), the turnover cell → leader map
(month end), `/leaders` `_relabel` of a leader's history, `exchange_rewind`,
`live_projection.refresh` (a re-copy reads the links of the day it copies),
`kelish` (the list of a past day), `leader_cells.filing_cells` / `expected_days`
for a past day. Present-tense readers are untouched. `cell_archive.alive` reads
the events, so a restore no longer re-counts archived days.

## Rollout, each step a MINOR

1. **Ties + model** — the columns, `cell_link_events` with the grandfather
   floor, `verifix_ties`, the tie run (dry run first, then the write), the
   admin page's untied list. Nothing follows Verifix yet; nothing moves.
2. **The manager** — the picker, grandfathering, «Egasi» read-only,
   `owes_from` + the roster's creation floor, `_set_leader_cells` without the
   drag, the KPI pages on `leader_id` (ruling 8 — a no-op for them today).
3. **The pass** — the widened directory read, `verifix_org` / `verifix_sync` /
   `cell_register`, the automatic column of the catalogue, the guards, the
   digest. Dismissals and archives included.
4. **The queue** — `verifix_sync_items`, the bell items, the page's approve /
   dismiss, the taps of the pending column (brigadir change, unit move, unit
   creation, the code cascade, renames + aliases, two seats).
5. **The sweep** — the past-day readers on `cell_links`; after it a brigadir
   change can be approved without any filed day moving.
6. **Delete the TEMPORARY one-shots** whose helpers moved into `verifix_org`:
   `verifix_cell_sync`, `verifix_leader_sync`, `verifix_cells_leaders_sync`,
   `cell_owner_pass`, `multi_leader_cells`, `verifix_profile_photos`,
   `leader_photo_fix_oct12`, `verifix_supervisor_check`, `leader_verifix_check`
   (its `PINS` are rows by then), with their startup pairs in BOTH entrypoints.
   Their columns, metas and records stay.

Until step 5 lands, a brigadir change approved from the queue moves past
figures exactly as a manual /cells edit does today (the 9123 precedent) — so
step 4 ships with that tap DISABLED and the item read-only, and enables it in
step 5.

## Test plan

- Every step is replayed on the 11 Sep production copy against the 1 Oct API
  dump (the way every Verifix pass was tested) with a dry-run mode that
  prints what it would write and writes nothing.
- Invariants, checked by a script before each step ships: (a) every past-day
  figure — the heatmap, /downtime, «Xarajat», /zagruzka-cell, Plan Bajarish,
  the turnover months, /worker-concerns — is byte-identical before and after
  the tie run, the grandfathering and the sweep; (b) a second pass over an
  unchanged directory writes 0 rows; (c) the pass over the 1 Oct dump creates
  and ties exactly what the 4–8 Oct passes reported (46 cells on the 4 Oct
  rule, the profiles the 5 Oct pass created, 2 brigadir differences, 9 Verifix
  brigadirs with no unit, 3 two-seat cells);
  (d) 0811 / Turdimurodov and Umarova Mapura keep their units and managers;
  (e) a simulated dismissal, a simulated disappearance and a simulated code
  change land in the right column of the catalogue; (f) a restore after an
  archive leaves the archived days archived.
- The first live pass runs with the caps at 0 (report only) for two days, then
  with the caps.

## Deliberately unchanged

- The attendance read and the live day (`verifix_live`, `live_staff`): who
  stands where on a day is Verifix's, as before; only the registers' ties ride
  the same read.
- The загрузка formula, the ojidaniya weight rule, the checklist rules: a day's
  figure is computed exactly as now, from the links of THAT day.
- Filing follows the profile's unit (a bot day takes `prof.manager_id`); a
  leader's unit move is still a person's decision (now a tap).
- Names are never taken from Verifix without a tap; the register's spelling is
  the platform's.
- A unit's shift, plant, `zagruzka_on`; a cell's `in_load`, `wc_group`,
  `sap_code`, `one_process`, shift clocks — none of it is Verifix's.
- The turnover page keeps its own nightly read and its own month rules.
