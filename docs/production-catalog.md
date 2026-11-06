# The «Zagruzka fayli» catalog

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## «Zagruzka fayli — SAP kodlari» — adding positions, for one person (`production.catalog.sap`, 2026-10-30)

The operator: «On workload file page I want to give an access for a guest to add
SAP codes» — asked: both adding new positions and changing an existing line's
code, as a grant handed out per person, in every unit. ONE capability,
`production.catalog.sap` (`capabilities.CAP_CATALOG_SAP`), group «Ishlab
chiqarish» on the Permissions tab, unscoped, switched on per PROFILE or per
ACCOUNT like any grant.

- **What it opens**: /production (a capability implies its page), read WHOLE
  (`_READS_PAGE_WHOLE` → `page_scope_is_all`), so the holder picks any
  configured brigadir as an admin does (`_resolve_manager_id`, the picker).
- **Two doors of its own** (`routers/production.py`), never a role widened on
  the admin catalog endpoints: `POST /api/production/catalog/line` (SAP code,
  name, Трудоемкость, Команда — the фаза pin, the letter, the measure and the
  SAP switch take the defaults) and `PUT /api/production/catalog/{id}/sap-code`
  (the code alone; refused 409 `line_archived` on an archived line; an
  unchanged code freezes nothing). Both run the admin's own cores —
  `_create_catalog_line` / `_update_catalog_line` — so the line is dated
  (`pp_catalog.freeze`), Latin-coded, archive-checked, its typed ПЛАН/ФАКТ
  carried and its new key re-joined exactly as an admin's. `require_cap`, so
  an admin passes too. Jurnal: `production.catalog_created` and
  `production.catalog_sap_set`.
- **On the page** (`sapGrant` in `Production.jsx`, a non-admin holder only):
  «Qo'shish» opens the create form with four fields (`CatalogFields
  mode="create"`); a row opens a strip with one action, «SAP kodini
  o'zgartirish», whose form is the code alone with the line's name and Команда
  read-only (`mode="sap"`). Same DAY rule as the admin's: on a day an edit
  cannot reach, nothing is offered. A create that meets the same line in the
  archive says an admin brings it back (no restore button).
- **Deliberately NOT**: the name, Трудоемкость or Команда of an existing line,
  archive / restore / delete, the bulk bar, the ABC import, the SAP upload,
  «Bugungi fakt» and the staffing pins — all still a real admin's.

## A catalog edit counts FROM NOW ON (`services/pp_catalog.py`)

From **2026-09-24** (the operator's directive, every point below asked and
answered) a change to a unit's catalog on the «Zagruzka fayli» page takes
effect from the shift in progress, and every earlier day keeps the catalog it
had. Until then every reader took the catalog as it stood TODAY, so one edit
re-priced the minutes, ЛЮДИ and загрузка of every past day at once — 35
Трудоемкость and 90 Команда edits had done so by 11 Sep alone.

- **What is dated: everything about a line and a work centre.** Трудоемкость,
  Команда, group letter, SAP code, name, фаза pin, the SAP/hand switch, adding
  and deleting a line (the row edit, the bulk bar, the create form, the delete),
  a work centre's штатка and capacity (`PUT /admin/production/work-centers/{id}`)
  and the ABC import. Not dated: the unit-wide auto-fill switch, per-day pins,
  the cells register (a CELL's letter is not a catalog field).
- **The grain is the whole UNIT, never one line.** `pp_catalog.freeze` copies
  every line and every work centre of the unit into a `pp_catalog_versions` row
  (JSONB, `valid_from` NULL = every day before `valid_to`) covering the days up
  to the one the edit starts on; `pp_products` / `pp_work_centers` stay the
  catalog from the latest boundary on. A line has no durable identity (an import
  re-creates every row, `pp_calc.line_keys` is content), so «the catalog as it
  stood» is only answerable whole. Versions are never edited: no door reaches a
  past day — with ONE exception, the cell move (2026-10-26): `catalog_follow`
  alone rewrites a version, and only to move one cell's entries between two
  units on days from that cell's move day on, every rewrite audited on the move
  record (see «A cell's positions FOLLOW the cell»).
- **Every writer calls `freeze` BEFORE it touches a row.** The session does not
  autoflush, so a row already mutated in memory is copied with its NEW values
  and the past reads the edit after all. A second edit on the same shift-day
  finds the boundary drawn and freezes nothing — within one day the last edit
  wins. `uq_pp_catalog_version_to` (unit, valid_to) settles two writers racing
  to draw one boundary.
- **Every reader goes through `pp_catalog.at` (one day) or `spans` (a range cut
  at the boundaries)**, never `db.query(PPProduct)` for a figure: the dashboard
  (`_build_dashboard` — and so the export, leader auto checks and the override
  path), `zagruzka_source` (fleet загрузка, Plan Prognoz, the forecast), the SAP
  join (`_unit_sap_scope(db, mid, day)` — a re-upload of an old date is joined
  with that day's catalog), the raw view, `/zagruzka-cell` (minutes AND W/S per
  day) and `/live`. A unit with no version reads exactly what it always did, and
  one span keeps the same floats. The gap reports (`zagruzka_gaps`,
  `cell_input_gaps`) and the one-shot reports read the current register on
  purpose: they are «fix it now» lists.
- **WHEN an edit starts is `pp_catalog.effective_day`** — the shift running at
  that moment, else the next one: shift 1 → today until 20:00, tomorrow after;
  shift 2 (dated by the evening it opens) → yesterday's night until 08:00, today
  after; no shift → the calendar date. FIXED 08:00 / 20:00, the operator's pick
  over the «Smena vaqtlari» register, which stays a register. A day already
  CLOSED on «Verifix to'g'irlash» but still in progress takes the edit too (the
  operator's ruling) — the closing ladder plays no part here.
- **Typed quantities follow the dating.** `_carry_manual_quantities(since=)`
  moves a person's ПЛАН/ФАКТ onto the line's new identity only from the start
  day; an earlier day keeps its value under the old identity, which its frozen
  catalog still reads. `_rejoin_lines(since=)` and `_backfill_manager(since=)`
  fill and rebuild only from the start day too.
- **The ABC import is dated like an edit** — the days before keep their catalog
  AND every number on them (the rebuild clears typed values only from the start
  day). The ONE exception is a unit importing its FIRST catalog
  (`pp_catalog.is_empty`: no line, no work centre, no version) — nothing older
  exists, so that import reaches every stored date as imports always did. The
  card says which (`applies_from`, null for a first catalog).
- **Nothing was reconstructed.** No history of old values existed, so every day
  before the first dated edit reads the catalog as it stood on release day (the
  operator chose this over rebuilding from the Jurnal, which recorded no old
  values for bulk edits or imports). Nothing moved when this shipped.
- **The page**: on a day an edit made now cannot reach, the add / edit / delete
  / bulk controls are GONE (`dashboard.catalog.editable`), with one line naming
  the day edits count from and a button onto it. Each catalog form says it
  before Save («counts from DD.MM»), and each save's toast names the day. No
  «changed» mark on the table (the operator declined it — the Jurnal records
  who changed what, each save logs `from`).

## A cell's positions FOLLOW the cell (`catalog_follow`, 2026-10-26)

The operator's rulings (asked one by one, 2026-10-26): **cells own the
catalog.** When a cell changes brigadir its «Zagruzka fayli» positions go with
it, and a brigadir's catalog on a day is worked out from the cells standing in
the unit that day. Until then a moved cell arrived in its new unit with its
lines left behind: the new unit read the cell's people against no plan, the old
one went on planning positions nobody there makes, and the old unit's next SAP
upload filled them. The whole design, every critique and its verdict, is
`docs/plan-catalog-follows-cells.md`.

- **The five rulings, and the three open questions decided the same day.**
  (1) Cells own the catalog. (2) While positions several cells of one unit
  SHARE exist — no letter, or a letter no cell carries, at a work centre other
  cells of the unit keep — the cell's move is REFUSED on every door, naming
  what to letter. (3) Cells that already moved follow, each from its OWN move
  day; nothing before **6 October 2026** changes (`catalog_follow.FOLLOW_FROM`).
  (4) Both brigadirs' figures are recomputed from each cell's move day, closed
  days included. (5) A moved position identical to one the new unit already
  keeps at the same work centre is JOINED — one quantity from the file, split
  between the cells; the moved copy is archived, never deleted. Q1: a join
  unletters the new unit's line even where a third cell then shares it
  (`join_spread`, named). Q2: clearing the brigadir of a cell that owns
  positions is refused (`positions_need_unit`). Q3: the retroactive one-shot is
  APPLIED in the first release.
- **The move is WRITTEN into the catalog, never read differently.** No reader
  of `pp_catalog` changed — `at`, `at_many`, `spans`, `current` read exactly
  what they always read. `services/catalog_follow.py` does the attribution
  ONCE, when the move is followed: it freezes the units of the move at ONE
  shared day `S` (`pp_catalog.align`: `S` = max(the move day `h`, each unit's
  `current_from`) — `freeze` clamps a boundary, so two units frozen apart could
  disagree), rewrites both units' VERSION rows for `[h, S)` when `h < S` (a
  move followed late, or the retro), and moves the current `pp_products` /
  `pp_work_centers` rows from `S` on. The draft put an attribution layer inside
  the readers («an entry counts for its home unit») and every critique found it
  wrong — letters drifting per day, joins shown wrongly per day, ORM rows
  written through, a move cache blind to the session, the cost on every read.
  Written once, «a unit with no move reads what it always read» needs no code
  at all. Afterwards every catalog id stands in at most ONE unit's catalog on
  any day, and every day before `h` reads field for field what it read before.
- **This is the ONE exception to «a version is never edited»**, and only
  `catalog_follow` may make it: one cell's entries moved between two units, on
  days on or after that cell's move day (rulings 3 and 4). `pp_catalog.split_at`
  cuts a version at a day without changing what any day reads, and
  `rewrite_version` writes a version's content back (new list objects, the
  dates untouched); every rewrite is listed on the move record — entries removed
  whole, ids added, fields changed — so it can be undone. The `PPCatalogVersion`
  docstring says so too.
- **The move record is `pp_catalog_moves`** (`models.PPCatalogMove`, no
  foreign keys, created by `create_all`): one row per transfer, unique per
  landing event, `kind` live · late · retro, `state` moved · nothing · named ·
  failed · busy · gave_up · dry, the move day (`home_from`) and `S`
  (`storage_from`), the letters before and after, every line id that changed
  unit (the union over the window — an import inside it re-creates ids), the
  lines' snapshot, the work-centre rows moved or dropped, the version audit,
  the per-day re-key counts, every named condition and the per-unit-day impact.
  `services/pp_catalog_moves.py` (`moved_out`, `moved_out_codes`,
  `moved_in_ids`, `moved_out_pairs`) is what the SAP and import guards read.
  The two unit columns are in the profile re-key lists and the test-unit purge.
- **WHOSE line is THE rule `catalog_ownership.handed` — `wc_group.share` read
  line by line**, archived lines included: a line is the cell's own when
  `share` would hand it wholly to that cell (a letter only it carries among the
  stayers and the departers, or unclaimed while it is the only one), SHARED
  when it would go to two or more, else somebody else's. A cell's own lines go
  with it. Shared lines go only when the code leaves the unit WHOLE — nobody
  stays and every departer goes to one unit — and then without an owner;
  otherwise they stay and are named (`shared_left`, `shared_left_split`) — an
  ARCHIVED shared line that stays is named `shared_left_archived` instead,
  which stops no strict follow (it is in no unit's catalog). The
  stayers are the cells standing in the unit at the code on `h−1` AND on `h`,
  alive, not leaving (`catalog_ownership.cells_standing`); a cell ARRIVING into
  the unit in the same group is not a stayer, which is what makes a swap work.
  Decided separately for every version span of the window and for the current
  rows. Codes are compared through `cell_lookup.norm_code`, never
  `cell_register.norm_code` (the two differ).
- **Letters in the new unit are FREE and history-neutral** (`build_plan`). A
  lone arrival at a code nobody else holds there keeps its letter, None
  included. Otherwise an arrival keeps its old letter if nothing `taken`
  carries it, else takes the first free one of `wc_group.LETTERS`; `taken` is
  every cell row of the new unit at the code (archived ones included — the
  partial index `uq_cells_wc_group` has no archive filter), every letter its
  lines at the code carry in ANY version or the current rows, every letter its
  pins at the code carry on ANY date, and the staying cells'. Excluding every
  historic line and pin letter is what keeps the new letter out of the past: no
  row dated before `h` carries it, so even a reader that does not date letters
  reads those days unchanged. No free letter → None, `no_free_letter`. One
  exception, retro only (a transfer with no landing event): a cell that already
  stood in the new unit on `h−1` keeps the letter it carries there when no
  other cell row or stayer of that unit carries it (`Plan.own_dst`) — its own
  lines and pins there must not count as «taken» against itself — and the
  sibling rule treats that letter as claimed.
  **The sibling rule**: a LONE UNLETTERED staying cell of the new unit gets the
  next free letter too, its unclaimed lines take it from `h` and its
  whole-centre people pin becomes its group pin — without it `wc_group.share`
  hands half of that cell's minutes and people to the arrival. A lone LETTERED
  stayer keeps its unclaimed lines and pins with no new letter; two or more
  stayers with one unlettered is a register break (`y_register_break`) and
  nothing is changed.
- **Every letter change counts from `h`** (`cell_links.letter_on`): the moved
  cell's old letter rides its landing event (`vfx.letter_before`, stamped by
  `apply_due`, and `wc_group_was`), the sibling's rides the group's first event
  (`vfx.siblings_was`, read by `cell_links._load`). A retro move with no event
  at `h` writes an inert MARK event (`manager_id`, value = prev,
  `vfx.catalog_mark`, src «catalog_follow»): it carries the letter history and
  nothing else — `cell_links` keeps it out of every unit resolution
  (`_load`, and `_resolve` itself), `changed_since` and the /cells/:id history.
  A cell whose letter a later move already dated is not re-lettered
  (`letters_after`). So a reader that splits by group asks
  `cell_links.relettered_since` beside `changed_since` — a letter can change
  where no unit did (the mark, the staying sibling): `zagruzka_source.by_wc_on`
  (the pins, the labour, the ojidaniya weight, «Plan Bajarish», /live) and
  «Yacheyka zagruzkasi» read each DAY's letters whenever either finds a cell,
  and the one map of the current columns otherwise, byte for byte as before.
- **Duplicates JOIN, line by line** (ruling 5). An active, SAP-filled arrival
  identical to an active, SAP-filled line of the new unit at the same work
  centre (`catalog_ownership.join_ident`: daily key, normalised Команда, the
  line base — name + Трудоемкость), paired by rank, is archived (`archived_by`
  «Yacheyka ko'chishi», `archived_from` = `S`, sorted last) and the new unit's
  line becomes the cells' shared one. That line's letter is dropped (Q1). A
  hand-kept line (`takes_sap` False) is never joined: it moves live as a twin
  (`manual_twin`) and the new unit's group override is exploded onto its lines.
  An arrival with no partner moves live (`unpaired_twin`); an archived twin of
  an arriving line is deleted from the current rows (`archived_twin_dropped`).
  Arrivals sort after the new unit's own lines, so no `pp_calc.line_keys`
  suffix of the unit's own positions ever changes.
- **Work-centre rows move only when the code leaves whole**: dropped where the
  new unit already keeps a row at the code (`wc_dropped`, with its штатка and
  capacity on the record), else the old unit's first row moves. Removed, never
  deactivated: `_scoped_faza` reads inactive rows too, and a deactivated row
  would keep the code in the old unit's SAP scope.
- **The per-day rows follow from `h` to the last stored date**, closed days
  included (ruling 4). `pp_line_daily`: every row of a line whose (unit,
  quantity key, Команда, line key) changed is moved in two phases — every
  column carried, an orphan already at a destination dropped (`orphans_dropped`),
  a value left under a joined copy named (`hidden_typed`). `pp_daily`: copied
  into the new unit where it has no row or only zeros, the new unit's kept
  otherwise (`y_snapshot_kept`), group overrides exploded onto the lines;
  the old unit's row deleted where its catalog keeps no line at the pair.
  Typed pins (`pp_work_center_daily`): a departer takes its OWN letter's pins
  and a whole-centre or orphan pin stays with the stayers (`x_whole_pin_kept`
  — handing the departer a share of a pin that also stays counted those people
  twice); with nobody staying every pin of the code leaves. Written into the
  new unit as the cell's group pin (`pin_conflict` keeps one already there,
  `pin_added_to_whole` adds to a whole-centre one), штатка onto its whole row
  only when that has none (`shtatka_dropped`). A position moved from a unit
  kept by hand into one the file fills is re-joined (`_rejoin_lines`,
  `commit=False`). **Conservation**: Σ `zagruzka_source.wc_labor` over the
  group's units per day, before against after — a live or late follow reports
  a gap over 0.01 minute, a strict (retro) one is rolled back (`conservation`).
- **Ruling 2 is enforced at the ONE writer every door goes through** —
  `cell_register.set_unit` asks `catalog_refusal.shared_positions` whenever the
  unit asked for is not the one in force: the /cells form, «Doimiy qilish» on
  the admin «Davomat» tab, a «Verifix sinxron» tap. A WITHDRAWAL (sending the
  unit in force) is never refused, and nothing is refused when the move LANDS —
  lines shared after the request stay put and the follow names them. Judged on
  the old unit's CURRENT catalog, ACTIVE lines only, the letters as THIS save
  leaves them (the form now applies the letter BEFORE the brigadir, so a letter
  typed in the same save counts; changing the code or the letter of a cell
  whose move is waiting re-judges it). The refusal is a structured 409
  `{code, message, params}` — never a 500 (`Refused` used to escape two doors):
  `positions_need_unit` (the brigadir cleared while the cell owns positions),
  `shared_positions` with `kind` `unlettered_cell` (every staying cell is
  lettered and this one is not), `shared` (cells stay and lines are shared) or
  `split` (nobody stays and the team goes to two units). `params` names the
  code, the first ten lines, the staying cells with their letters and the
  destinations; `message` is a whole English sentence, which the assistant
  relays word for word. `utils/cellMoveRefusal.js` (`cellMove.*`) words it on
  the client — an admin gets a link onto the unit's «Pozitsiyalar», anyone else
  «buni admin qiladi».
- **A whole team may leave together.** `move_with` on the /cells PUT (the
  brigadir field's «Birga ko'chirish (…)»), the batch of a «Doimiy qilish»
  write, and `choice: "together"` on a Verifix tap (every open
  `brigadir_differs` item of the same unit, code and destination) pass one
  `leaving` map: a cell leaving is not staying, so a work centre all of whose
  cells go to one unit takes its shared lines along; the same team split over
  two units is `split`, and a cell an already-recorded change takes out on the
  same landing day counts as leaving — a team moved together and then split by
  a second save is refused too. The Jurnal names the cells that went along
  (`move_with`, «Birga ko'chirildi»), and a grant holder's team move reaches
  the admins' alert one `unit` row per cell. A refused «Doimiy qilish» offers
  «Hammasini doimiy qilish» — ONE permanent save of the cell and every staying
  cell the day routes to the same brigadir — or names the ones routed
  elsewhere.
- **The follow is a SWEEP after the landing, never part of `apply_due`.** The
  minute job `catalog-follow` (`run_sweep`, and `kick()` straight after a
  landing in `cell_links.run_apply_due`) follows every applied `manager_id`
  event from `FOLLOW_FROM` on that has no final record — per cell in event
  order, a move waiting while an earlier move at the same code into or out of
  one of its units is not final, grouped by (move day, code) so a swap or a
  team moving together is ONE transaction — and a group WAITS while another
  change at its code, in force by its day and into or out of one of its units,
  is recorded and not landed yet (`_pending_hold`, `pending_move`): two cells
  leaving one work centre on one shift-day may land hours apart
  (`opening_for_move` takes the earlier opening), and followed alone the first
  would take the other's positions. A caller asking anyway (the retro, a
  retry) gets `busy`, strict or live; a withdrawn or voided change releases the
  wait. Typed people split between departers are whole numbers by the LARGEST
  REMAINDER (`_int_split`: Σ is the shares' Σ rounded once — rounded one cell at
  a time, a pin of 5 split in two became 3 + 3). The SAP re-join runs in a
  savepoint of its own (a failure there names `rejoin_failed`, the move still
  commits). Followed inside `apply_due` a deploy
  swap's old worker would land events, a failure would roll back and never be
  retried, the letter would be read from a cache blind to the transaction it
  sits in, and a swap would be processed half at a time. **It never waits**:
  `pp_catalog.lock` takes `NS_CAT` per unit (exclusive — `freeze` and every
  catalog writer, which re-reads its row under it and answers 409
  `lines_moved` when the row changed unit) and `NS_QTY` per unit (SHARED for
  the quantity writers — the ПЛАН/ФАКТ override, the wc override, staffing,
  reconciliation, the SAP ingest, the re-join, the backfill), and the follow
  only TRIES both: busy → `busy`, retried after 1, 5, 15, 60 and 240 minutes,
  then `gave_up` and DMed. One pass at a time across both app copies
  (`SWEEP_LOCK`, a connection of its own). One Jurnal row per pass
  (`org.catalog_moved`), one admin DM (`routers.boot._recipients`) for what was
  named, gave up or needs a look (`ATTENTION`). After each commit the kept
  answers (`kept_answer.forget_all`) and the shift report cache are dropped.
- **The sweep is OFF until the retro flag reads `done`** (`catalog_follow.enabled`)
  — following live moves earlier would act on catalogs the retro still has to
  rewrite — and `unsettled` is off with it.
- **The SAP file and the ABC import respect a move.** `_scoped_faza` hands a
  unit with NO catalog line that day nothing (both of its filters used to fall
  through on an empty set: such a unit got every operation at its work centres,
  or with none the whole plant file — the state a unit whose cells all left
  reaches, still «configured» by its old `pp_daily` rows), and leaves out a
  (SKU, work centre) pair that left with a cell unless the unit's own catalog
  still carries it (`_moved_out_exclude`); the upload names its `empty_targets`.
  An import into the OLD unit drops the sheet rows of a position that moved out
  — a whole code the unit keeps no cell at, then one row per moved line by join
  identity (and letter) — `skipped_moved_out` / `skipped_wc` — and then, for a
  departure no row matches exactly (the working sheet's «Группа» is blank, or
  its Трудоемкость was re-timed), a LOOSE pass by quantity key and work centre:
  at most as many rows as the sheet holds beyond the unit's own lines there,
  only rows whose letter is blank or carried by no cell standing in the unit,
  each named `loose`; an import into the NEW unit keeps a live arrival its
  sheet lacks, with its id (`kept_moved_in`) — a sheet row at its quantity key
  and work centre (and letter) beyond the unit's own lines IS the arrival,
  re-timed, so it is never kept beside it. The raw «Фаза/Заголовок» tab gives a
  pinned viewer of a unit with no line that day nothing (`_scoped_faza`'s
  rule). The «Arxiv» card neither counts nor restores a joined twin
  (`twin_live`, «birlashtirilgan») — only a copy a join archived
  (`archived_by` = `catalog_follow.ARCHIVED_BY`); a twin a person set aside is
  an ordinary archived line. The brigadir's «O'lchov birligi» door (v4.335)
  re-reads its rows under the lock like every catalog writer.
- **A leader's days are DATED by the cells they ran then.**
  `cell_lookup.sap_codes_for_leader` / `sap_groups_for_leader` /
  `cells_unit_for_leader(day=)` share one selection, `leader_cells_on`: the
  cells whose «Boshqaruvchi» that day was the leader, each in the unit and with
  the letter it had then (`day=None` is today's path, byte for byte). The
  /production resolvers take the request's day, so a leader's page for a day
  before their cell's move reads the OLD unit. The dashboard, `_cell_letters`,
  `by_sap(day=)` and the staffing proof split a past day by THAT day's letters
  (a defect that predates this). The leader auto-checks read their checklist
  day the same way — `_Ctx.unit_id`, `pairs`, `cells` (`leader_auto.cells_run_on`,
  also what #8 and the objection timing read), `pins` (every cell standing in
  the unit that day) — and while a move of one of the leader's cells is in force
  by the day and not followed (`catalog_follow.unsettled`: landed with no final
  record; recorded for the day and not landed yet, which the dated readers
  already read in the new unit — a night unit's 20:00 opening under a shift-1
  checklist (`leader_shift`); a retro transfer the sweep is retrying)
  `_Ctx.require_settled` raises `catalog_follow.CatalogUnsettled`: a quiet
  `no_data` (one log line, no stack trace) retried until `GIVE_UP` past the
  LATER of its hour and the moment the follow could first run
  (`catalog_follow.unsettled_since` — a move's landing, facts
  `unsettled_since`, `leader_auto._give_up_at`), so a night move landing at
  20:00 never costs a 10:00 check at 16:00, and a
  warning card with no figures. `auto_check_timing` then answers nothing for
  the objection, and `auto_check_restore` reads the pages and saves of the
  cells' unit of the day.
- **A leader whose cells end up in TWO units reads both** (fix set 3). One
  cell moved and took its positions, the other stayed: `cells_unit_for_leader`
  answers None for them (its contract is unchanged), and their page and checks
  fell back to the profile unit — where the moved cell's lines no longer are,
  so #1 / #9 failed `no_plan`. `cell_lookup.cells_units_for_leader(day=)` lists
  every unit, most cells first, ties by unit id — counting only the cells that
  EXIST on the day (`cell_archive.alive`; all of them when none does): an
  archived cell keeps its `leader_id` and brigadir, and counted it opened a
  leader's page on the unit of a cell closed long ago and passed #9 on
  somebody else's figure at that work centre. The rule holds whatever put the
  live cells in two units, a move or not. **The page** opens on the
  first; `?manager_id=` picks another of that day's units (any other id is
  ignored), the dashboard carries `leader_units` `[{id, name, cells}]` when
  there are 2+, and Production.jsx shows it as a pinned FilterPanel section
  («Brigada», `production.leaderUnit`). Every scope and write door cuts to the
  leader's cells standing in the chosen unit (`_leader_cut` →
  `sap_codes_for_leader` / `sap_groups_for_leader(unit=)`,
  `cell_lookup.leader_cells_in`). **The checks** — #1, #9, #11 — read every
  unit through `_Ctx.by_unit` (one context per unit, its pairs, cells, pins and
  page that unit's): #1 / #9 pass on any one cell of any unit, #9's combined
  figure is Σ fact ÷ Σ plan, #11 judges each planned cell against its own unit's
  page, and the facts gain a `units` list. `_Ctx.unit_id` / `dashboard` answer
  the first unit for a caller reading one page (the warning card counts
  positions over every unit, the objection timing reads every unit). One unit:
  `by_unit()` is `[self]`, every read and fact byte for byte as before.
- **The retroactive one-shot** — TEMPORARY `services/catalog_follow_retro.py`,
  `startup.schedule_catalog_follow_retro` (`run` phase; it only schedules
  `catalog-follow-retro` 180 s on, so the job fires in the copy holding the
  jobs lock after the old worker has gone) + `_catalog_follow_retro_job`,
  called from BOTH entrypoints. It follows (`RETRO_APPLY = True`, Q3) every
  move landed before the release from `FOLLOW_FROM` on: the cells with an
  applied `manager_id` event, plus the cells whose code another unit still
  carries orphan lines for. The move day comes from evidence per day — link
  events (authoritative from 12 Oct), the closed live days' rosters, the
  attendance majority; a cell standing in its unit since before 6 Oct follows
  from 6 Oct. Only a SINGLE hop is followed, each cell — or each TEAM (below) —
  in its own transaction,
  `strict`: anything doubtful is named and nothing written — `chain`,
  `from_unknown`, `day_unknown`, `letter_ambiguous`, `shared_lines` (ACTIVE
  shared lines only), `y_has_lines`, `stayer_unproven` (a cell the follow would
  count as staying at the code in either unit that no evidence — attendance, a
  closed live day's roster, its own link event — shows standing there by `h`;
  checked only when something would move — so a cell OUTSIDE the загрузка,
  which since 4 Oct appears in neither attendance nor the rosters, names every
  move at its code until a person decides), `window_cells_moved`,
  `letters_after`, `archived`, `no_code`, `conservation` — and a LANDED change
  whose old unit keeps, at the code, orphaned positions of a letter it never
  carried is `letter_ambiguous` (`orphans_of_another_cell`): they are another
  cell's, one that left before 12 Oct, and the cells at the code are asked
  about them too; `window_cells_moved` reads evidence hops from `FLOOR−7` and
  the placement before it. **A TEAM is followed as ONE group** (2026-10-28):
  the cells whose landed changes move a cell at one code on one day
  (`catalog_follow_retro._team_of`, the sweep's own (day, code) grouping) do
  not name each other `window_cells_moved` — their own hop on that day is
  skipped by `_guards(team=)` and `recheck(team=)` — and a team goes whole or
  not at all (`_hold_broken_teams`; the sweep's `_recheck_retro` stops the
  members sharing a unit with one that is stopped). Until then the pass took
  cells one at a time and named every member of a team that moved together,
  FINAL: the cells stood in the new unit with their positions in the old one
  (reported for Maksumov Sanjar ↔ Xakimov Ruslan: 7213 · A and 7214 · B moved
  together on 25 Oct, A2723's 61 positions stayed behind). On 28 Oct a
  one-shot re-armed that team (`busy`, due now) and the sweep followed it as
  one group — production confirmed all 61 in Xakimov's unit; it was the only
  stuck team on the platform. The one-shot and its read-only report are
  deleted (their flags `catalog_team_repair_maksumov_xakimov_2026_10_28_v1` /
  `catalog_swap_report_maksumov_xakimov_2026_10_28_v1` read `sent`). `volume`
  (over 40 cells or 5,000 per-day rows of what
  the follows actually re-key — each cell's OLD unit's rows at its own
  positions' pairs and the unit's pins at the code) applies NOTHING and records
  nothing per cell: the flag reads `volume:<cells>/<rows>`, the sweep stays off
  (production as before), the pass runs again at every boot so a deploy raising
  the cap completes it, and one DM per distinct count says so. Every considered
  event of an applying pass gets a final record, so a second run is a no-op by
  the records, not the flag. The DM counts what brought nothing to move
  (`nothing`, `no_code`, `from_no_unit`…) on a line of its own, never in the
  «qo'lda hal qiling» list, which lists the strict stops and the guards first;
  the pass writes one Jurnal row (`org.catalog_moved`, `kind` retro).
  A retro record the sweep later RETRIES (`busy`, `failed`) is re-checked first
  by `catalog_follow_retro.recheck` — the move read again exactly as the pass
  read it (same day, units and letter), the archive and every guard — and is
  settled `named` when anything changed since. ONE pass at a time across both app
  copies: a SESSION advisory lock (`RETRO_LOCK`) on a connection of its own —
  a transaction lock would be gone at the first cell's commit — and the flag
  re-read under it. The flag `catalog_follow_retro_2026_10_26_v1`
  (`catalog_follow.RETRO_FLAG`) reads `done:<moved>/<named>` (`done:0/0` when
  nothing qualified — the sweep switches on all the same), `dry:<n>` for a
  rehearsal, or `failed:<n>` after a pass that raised: it is run again at the
  next boot, at most `TRIES` (3) times, and after the third the sweep STAYS OFF
  and the failure is DMed. A pass stopped half-way (a deploy) re-runs at the
  next boot and reports what the earlier attempt already settled beside its
  own. The record `catalog_follow_retro_2026_10_26`; the DM — text + a workbook
  («Ko'chirildi», «Qoldirildi», «Dalil», «Ta'sir») — goes to `UNPRICED_DM_CHAT`
  behind `catalog_follow_retro_2026_10_26_v1_dm_<mode>` (done · dry · failed),
  built from the stored record only, so a failed DM is re-sent and the pass is
  never re-run for it. **Delete the module, `startup.schedule_catalog_follow_retro`
  / `_catalog_follow_retro_job` and both entrypoint calls once the flag reads
  `done`, the DM has landed and no `kind="retro"` record is `busy` or `failed`
  (the sweep re-checks those through the module; with it gone they are named
  `recheck_unavailable` instead of followed) — and NEVER the flag row**:
  `catalog_follow.enabled` reads it, and the sweep stops without it.
- **Consequences to know** (all deliberate; the release notes):
  1. Past загрузка, Plan bajarish and shift-report figures change from each
     moved cell's move day, closed days included (ruling 4) — nothing is
     stored, so every reader re-reads the moved catalog at once.
  2. The old unit's past /production group display changes for cells that lost
     a letter in a move since 12 Oct (dated letters fix an older defect).
  3. Units with no catalog line no longer receive the plant file.
  4. Leaders' past /production days read the unit their cell stood in then.
  5. A cell move over shared positions is refused until they are lettered.
  Also: between a landing and its follow (≤ a minute; minutes while a long SAP
  upload holds `NS_QTY`) the figures show the cell in its new unit with its
  lines in the old one — `unsettled` keeps the auto-checks from judging that
  gap. Cells moved before 12 Oct have no link history: their catalog follows
  from `h`, but per-cell figures before `h` still show them in the new unit,
  and the retro DM names them. A new unit's own SAP snapshot kept over the old
  one's (`y_snapshot_kept`) can shift its minutes after a live move — reported,
  never blocked. Two auto-fill switches that differ are reported
  (`autofill_differs`), never switched: that switch is a person's. Multi-hop
  and round-trip histories are named, not followed.

## A catalog line can be ARCHIVED and brought back (2026-10-24)

The operator: «sometimes we will bring it back, and it requires rewriting — we
need an option to archive them and bring back anytime». A line on «Zagruzka
fayli» → «Pozitsiyalar» can be set aside instead of deleted, and comes back in
one press with everything it had: code, name, Трудоемкость, Команда, group
letter, фаза pin, the SAP switch.

- **An archived line is `pp_products.active` = False**, a flag every reader
  already skipped (the table, the загрузка, Plan Bajarish, /live,
  /zagruzka-cell) and the dated catalog already froze. `archived_at` /
  `archived_by` / `archived_from` (`startup.add_pp_product_archive_columns`,
  both entrypoints, `run` phase) only say who set it aside, when, and the
  shift-day it left on. Nothing is deleted.
- **`POST /admin/production/catalog/archive` {ids, archived}** is the one door
  for both directions (admin, like every catalog write; ≤ 500 lines of ONE
  unit; logged as `production.catalog_archived` / `catalog_restored`). It is
  DATED like any catalog edit (`pp_catalog.freeze`): the line leaves — or comes
  back — from the shift in progress, and earlier days keep their list. A line
  already in the asked state is counted, not refused. The PUT edit's `active`
  keeps the same metadata.
- **No two lines may share one identity across the archive** —
  `pp_calc.line_ident` (quantity key, Команда, name + Трудоемкость, the
  `line_keys` content without its `#n`). A restore whose twin is live is
  SKIPPED and named (`skipped_duplicate`); a create of a line the archive holds
  is refused 409 `in_archive` and the page offers «Arxivdan qaytarish».
- **The SAP file keeps filling an archived line** (its SKU stays in
  `_sap_scope_of`, which reads every line), so it comes back reading its
  figures. Its SKU is therefore not an «unknown SKU» (`catalog_keys` read
  `cat.lines`); the dashboard lists it under `archived` (unit-wide views only)
  with the day's ПЛАН for its SKU at its Команда.
- **An ABC import keeps the archive**: archived lines the sheet does not carry
  stay set aside (sorted after the sheet's lines, so no sheet line's key
  moves); an archived line the sheet carries again comes back live from the
  sheet and its archived copy goes (`archived_kept` / `archived_back`).
- **The page**: «Arxivlash» in the row strip and the bulk bar (a warning
  confirm, the refusal shown on it); an «Arxiv» card UNDER the table, only
  while it holds something, collapsed by default, its head naming how many
  the day's plan asks for; «Qaytarish» per row for admins on a day an edit
  reaches. The delete confirm now points at «Arxivlash».

## A catalog line's «O'lchov birligi» (`pp_products.uom`, 2026-10-24)

The operator: «add for me Unit of measurement column in Zagruzka fayl screen.
It should be selectable. Options are: kg, dona, litr, qozon». A position on
«Zagruzka fayli» says what its ПЛАН and ФАКТ are counted in, picked from those
four and nothing else.

- **A property of the CATALOG LINE, not of a day** — `pp_products.uom`, NULL =
  not stated. A torte is counted in pieces every day of its life, so it is set
  once and dated by `services/pp_catalog.py` like Трудоемкость or Команда (a
  past day prints the unit it had, a later edit never rewrites it). That is the
  rule «Kontiner krishka» states the other way round: a per-day number is the
  overlay, «a constant would be a catalog field». Two operations of one SKU may
  legitimately differ — grams of dough at one step, pieces of cake at the next
  — so it is carried per LINE, never per SKU.
- **`services/pp_uom.py` is THE definition** — `UOMS` (kg · dona · litr ·
  qozon, in picker order), `norm_uom`, `InvalidUom`. The list is SERVED on the
  dashboard (`catalog.uoms`), so the page holds no copy of it and the picker
  can never offer a value the endpoint refuses; a fifth unit is one entry here
  plus its four `production.uom.*` strings. Blank / absent answers None — never
  a guessed default, because «kg» on a cake is worse than a dash that says
  nothing — and anything else is a 400 naming the four. Spelled `uom` and not
  `unit` because everywhere else in this codebase a «unit» is a BRIGADIR's
  unit, the action log's own catalog record included.
- **No figure reads it, and that is deliberate.** Nothing converts, sums or
  compares across units: a line's minutes are still Трудоемкость × quantity ÷
  60 whatever it says, and it is NOT part of the line's identity
  (`pp_calc.line_keys`), so changing one moves no stored quantity and needs no
  carry. A REGISTER, like `cells.one_process` — making a загрузка figure read
  it would move numbers on every page at once and needs the operator's
  decision first. Measured when it shipped: every total and every row figure
  byte-identical.
- **Where an ADMIN sets it** — the row edit modal and the create form (a
  `StyledSelect` of «— Belgilanmagan» + the four, beside Трудоемкость, which is
  the seconds ONE of them costs), and **the bulk bar**, which is the fast path:
  tick forty tortes, pick «dona», one press. Written through the register's own
  POST/PUT/bulk, so it carries CAP-admin exactly like every other field of a
  catalog line; `""` clears, an absent key leaves it, so a tab from before the
  column never touches it. Each write is in the Jurnal (`uom`, `logs.f.uom`).
- **…and from 2026-10-26 a BRIGADIR sets it too** (the operator: «unit column
  should be editable to all supervisors»). It is **the ONE field of a catalog
  line a supervisor keeps** — the code, the name, Трудоемкость, Команда, the
  letter, the SAP switch and add / archive / delete all stay admin-only — and
  what makes it safe to hand over is the bullet above: no figure reads it, it
  is no part of the line's identity, so a write here moves no stored quantity
  and needs neither the snapshot nor the carry every other catalog write runs.
  It is a REGISTER — what this position is counted in — and the person who
  knows that is the brigadir.
  - **Its own door, `PUT /api/production/catalog/uom`** (`{ids, uom}`, "" to
    clear, `routers/production.set_catalog_uom`), never a role widened on the
    three admin catalog endpoints: those carry the fields that move numbers,
    and filtering their body per role is a rule every field added later has to
    remember. One door, one decision — the shape `PUT
    /api/profiles/admin/cells/{id}/manager` already uses for a slot a second
    audience owns. Gated `require_page("production")` + **admin or
    supervisor**, scoped by `_resolve_manager_id` (a supervisor is pinned to
    their own unit whatever `manager_id` rides along) and then by every id
    belonging to THAT unit — another unit's line is a 403, not a silent skip.
    Bounded at `_CATALOG_BULK_MAX` (500). **Leaders are deliberately out**:
    they own CELLS and a catalog line belongs to the unit. Shift- and
    top-managers are out for the reason they do not type «Bugungi fakt» — they
    read the unit, they do not keep its register.
  - **DATED like every catalog edit** (services/pp_catalog.py): it counts from
    the shift in progress and the days before keep the measure they had. The
    day's closing ladder plays no part, as it does not for the admin doors —
    a catalog is configuration for every date, not a fact about one.
  - **A pick equal to what the rows already carry freezes NOTHING** and answers
    `updated: 0`. The other catalog writers always have something to change
    (they refuse an empty body), but a cell picker re-sending the value on
    screen is ordinary here, and a boundary drawn for a change that never
    happened would split the unit's history into two identical halves. It is
    still recorded — a bare middleware row would read like a save whose
    details were lost rather than one with nothing to do.
  - **Shift-managers set it too** (2026-10-30, the operator), over the units
    of their shift ∩ plant (`_resolve_manager_id`); `UOM_ROLES` and the page's
    `canEditUomRole` name the three roles. Top-managers still only read.
  - Logged as `production.catalog_uom_set`, so «a brigadir set the measure»
    and «an admin edited a catalog line» are two acts in the Jurnal.
  - **On screen the column is EDITABLE IN PLACE** for whoever may set it: the
    cell is a compact `StyledSelect` in the chip's own skin, so an editable row
    and a read-only one are the same height and the one-line-per-row rule holds
    either way; a pick is one tap and one save, held locally (`uomPending`)
    until the dashboard has been read again so the control never springs back
    for the length of a refetch. A brigadir also gets the checkbox column and
    the sticky bar, carrying ONE action — «O'lchov birligi» onto every picked
    line, behind the house form modal; the admin's bar is untouched, since
    their bulk editor already carries the measure and two controls writing one
    field in one bar is a choice nobody has to make. `pickable` (may tick) and
    `selectable` (may open the row's Edit / Archive / Delete strip) are two
    flags on purpose. The «this day keeps its own catalog» notice now shows for
    a brigadir too.
- **Shown** as a «Birlik» column (uz_cyrl «Бирлик», ru «Ед. изм.», en «Unit»)
  directly after «Trud.», sortable, in the `ColumnsPicker` like every other —
  a NEUTRAL chip, never a traffic light, because it is a property and not a
  verdict; not stated is a dash. Visible to everybody by default (unlike
  «Manba» / «Guruh»): it qualifies the quantities every reader reads.
  `uomLabel` compares `t`'s answer against the key, since `t` returns the key
  itself for a missing string — a unit added before its words would otherwise
  print «production.uom.tonna» at an operator.
- **An ABC import carries it across the wipe** on the LINE's own key, like the
  letter beside it; a line whose name or Трудоемкость the sheet CHANGED cannot
  be followed (the import may never guess by position) and comes back without
  one. The sheet has no such column and none is read from it.
- The «Excel» button (the «ABC форма») carries it as an inserted column after
  ПЛАН while it is visible on the table, green as the form's inputs are (see
  the UI-template table, «Column show/hide»).
