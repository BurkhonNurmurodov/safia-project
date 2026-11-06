# Verifix: the connection, the live sync and the one-shots

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## The cells register follows Verifix (`verifix_cell_sync`, 2026-10-04)

From **2026-10-04** (the operator: «our cells should be the same as on
Verifix») a TEMPORARY one-shot made the register Verifix's —
`services/verifix_cell_sync.py`, `startup.sync_cells_from_verifix` (flag
`verifix_cell_sync_2026_10_04_v1`, both entrypoints, ~150 s after boot), DMed
to the operator as text + a workbook.

- **A Verifix cell** is a coded subdivision that no employee, of any status,
  holds as their DEPARTMENT (`division_id`) — the «отдел» level our cells sit
  on. Five departments carry a code (0006, 0012, 111, 112, 400) and are not
  cells. Open = state «A», closed = «P» (on the 1 Oct dump no passive one had a
  working employee).
- **Renamed** to Verifix's name with the code in front left out (A0061 is
  «0611 Обработка яиц» → «Обработка яиц»): ru takes it, a non-empty uz_cyrl
  takes it, a Latin uz / en is cleared (it translated the old name).
- **Created** — every OPEN Verifix cell the register lacked, the way the
  attendance upload registers an unseen code: no brigadir, no leader, out of
  the загрузка, ru name only. The brigadir stays a person's call on /cells (it
  moves attendance and загрузка); the report names Verifix's parent and the
  unit its sibling cells belong to here.
- **Archived** (`archived_by` «Verifix (avtomatik)») — every active cell that
  Verifix closed or does not have. Changes no figure.
- **Reported only**: a brigadir other than the unit holding ≥ 2/3 of the cells
  under the same Verifix parent (a bare majority would flag six cells falsely —
  both Suvonov Elshod units share «Цех - 4»), a cell archived here but open in
  Verifix (not restored), coded departments, codes spelled two ways, one code
  on two cells.
- **Guards** — nothing changes when Verifix hands over < 100 subdivisions or
  < 1,000 employees, finds < 80 % of our active cells open, or the pass would
  archive more than max(15, 10 %) or create more than 150 cells.
- Every old value is kept in app setting `verifix_cell_sync_2026_10_04` and in
  the workbook. **Deleted on 2026-10-12 with the Verifix live sync** (its rules live on in `services/verifix_org.py`) — the cells it wrote stay, and the live
  sync now does what it did every ten minutes.
- Dry run (11 Sep register × the 1 Oct API dump): 46 created (washing
  0020–0037, raw-material warehouse 0110–0114, supply 09xx / 1411 / 1412 /
  9432, cold rooms 1511 / 3411 / 3511 / 8011, staff kitchen 7711 / 7721, plus
  1614, 2531, 7231, 8211, 8218, 8322, 9424), 6 archived (1622, 2812, 4114,
  6831, 7016, 7621), 133 renamed, 2 brigadir differences (0811 — the 26 Sep
  ruling; 7015 has none).

## Leaders × Verifix (`verifix_leader_sync`, 2026-10-04)

The same day, the same comparison for leaders — with the operator's limit:
«don't delete or archive yet, report me; if there are leaders, create leader
profiles for them». TEMPORARY one-shot `services/verifix_leader_sync.py`,
`startup.sync_leaders_from_verifix` (flag `verifix_leader_sync_2026_10_04_v1`,
~180 s after boot — after the cell sync — both entrypoints), DMed as text + a
workbook. Nothing is deleted, archived or renamed.

- **A Verifix leader** = a WORKING employee whose job `is_leader_job`
  («Лидер», «Лидер АХО», «Лидер/отправка»). Profile ↔ person through
  `leader_verifix_check._match`, unchanged (strict names + the operator's pins).
- **Created** only where the person's cell gives one clean place: an active
  cell of ours with a brigadir, no leader of its own, no leader profile Verifix
  places in it, no second profileless Verifix leader in it, and no profile with
  the same surname + first name anywhere. The profile takes the cell's unit and
  the cell, the Verifix name in Latin Title Case, kind «Lider» (src verifix).
  It is on the unit's roster at once — «not filed» in the digest until the
  person registers in the bot.
- **Reported only**: profileless Verifix leaders that could not be placed (cell
  without a brigadir, cell with a leader, uncoded subdivision, department),
  profiles Verifix lacks (archive candidates), «Lider o'rnida», names spelled
  differently, another cell / another brigadir in Verifix, archived cells.
- Dry run (11 Sep profiles × the 1 Oct dump, after the cell sync): 0 created —
  36 profileless leaders stand in cells with no brigadir (the new service
  cells), 16 in subdivisions Verifix gave no code (dispatch zones 47xx,
  finished-goods freezers 1711/1721/1811/1821, «Алмата Фабрика», «Корзинка»),
  3 in cells led by another profile, 1 in a department, 1 beside a profile on
  0822; 3 profiles not in Verifix, 8 «Lider o'rnida», 6 spelled differently.
- **Deleted on 2026-10-12 with the Verifix live sync** (its rules live on in `services/verifix_org.py`).

## Every Verifix cell, every Verifix leader (`verifix_cells_leaders_sync`, 2026-10-05)

The operator, the day after the two passes above: «Download every single cell,
and create leader profiles for those leaders who don't have a profile on our
platform. For connecting them, report me mismatches and do not connect not
safe ones yet.» TEMPORARY one-shot `services/verifix_cells_leaders_sync.py`,
`startup.sync_cells_and_leaders_from_verifix` (flag
`verifix_cells_leaders_2026_10_05_v1`, ~210 s after boot, both entrypoints),
DMed as text + a workbook; the record is in app setting
`verifix_cells_leaders_2026_10_05`. Nothing is deleted or archived.

- **Cells: the 4 Oct rule PLUS name-coded subdivisions** — no `code`, a NAME
  that starts with exactly four digits («4711 Зона отправки», the freezers
  1711 / 1721 / 1811 / 1821; `turnover.unit_code` already read them so). Taken
  only when not a department, no cell stands under it (a workshop), its number
  is neither another cell's code nor the number a coded cell is named with
  («0611 Обработка яиц» is A0061), and — to be created — open with somebody
  working there. CREATED the 4 Oct way (no brigadir, no leader, out of the
  загрузка, ru name), RENAMED to Verifix's name, and a cell the 4 Oct pass
  itself archived («Verifix (avtomatik)») that Verifix has open is RESTORED.
  Reported only: archive candidates (NOT archived), cells archived by a person
  that Verifix has open, codes on two subdivisions, name-coded subdivisions
  left out and why, and every subdivision people work in with no code at all —
  those cannot be cells until Verifix gives them a code.
- **Leaders: every working Verifix leader with no profile gets one** («Lider»,
  source Verifix, the Verifix name in Latin Title Case) — EXCEPT where they may
  already be on the platform, which is reported and not created: a leader
  profile Verifix could not find with their surname + first name (either
  order), or the same first name and a surname ≥ 0.75 alike, or their cell's
  own leader when Verifix could not find that profile; a brigadir unit,
  shift-/top-manager, admin or guest with that name (or the unit the 4 Oct
  supervisor check tied to this very person); two Verifix leaders sharing a
  full name; a one-word name. A namesake of a profile Verifix DID tie to
  somebody else is created, with the namesake named.
- **Connected only where safe**: the profile takes the cell's brigadir and the
  cell when the cell is ours, active, has a brigadir (unit not archived), has
  no leader, no profile of ours that Verifix places there and no second
  profileless leader. Everything else is created with NO unit and NO cell —
  which keeps it off every roster, digest, checklist, auto check and the
  registration picker (they all read leaders by unit) until a person connects
  it: the profile page, brigadir + cell, one Save (`_set_leader_cells` moves
  the cell to the profile's unit). The report names per person what stood in
  the way and the Verifix brigadir standing over their subdivision (and the
  unit here the 4 Oct check tied that brigadir to).
- Existing profiles are not touched; their mismatches are in the workbook.
- **Deleted on 2026-10-12 with the Verifix live sync** (its rules live on in `services/verifix_org.py`). The profiles it created stay; the live sync ties them
  by Verifix id and keeps them owing nothing until claimed (`owes_from`).

## Leaders' and brigadirs' photos come from Verifix (`verifix_profile_photos`, 2026-10-05)

The operator: «put pictures of the leaders and supervisors on Verifix as
profile picture on IMS». TEMPORARY one-shot `services/verifix_profile_photos.py`,
`startup.set_profile_photos_from_verifix` (flag
`verifix_profile_photos_2026_10_05_v1`, ~300 s after boot, after the 5 Oct
leader pass so the profiles it created are covered, both entrypoints), DMed
as text + a workbook; the record (no bytes) is app setting
`verifix_profile_photos_2026_10_05`.

- **Who a profile is on Verifix is the tie the checks STORED** —
  `role_profiles.leader_kind_meta.vfx.id` (the 4 Oct leader check, its pins,
  the 5 Oct created profiles) and `managers.supervisor_kind_meta.vfx.id` (the
  4 Oct brigadir check): the tie each profile page already names. Nothing is
  matched afresh; an untied profile is listed with the check's reason.
- **A photo somebody set is kept.** A tie whose Verifix name no longer looks
  like the profile (`name_map._pair_score`, either order — a profile renamed
  to another person) is refused. A Verifix list under 1,000 people writes
  nothing.
- The employee's MAIN identification photo, fetched by
  `verifix_explore.download` (the «Verifix (test)» photo doors, split out of
  `photo`), squared with the head kept in frame (top 0.35) and stored through
  **`services/profile_photo.py` — THE way a profile photo is written**
  (`square_jpeg` + `store`; the admin upload uses it too, byte for byte as
  before). All photos land in one transaction with the record.
- **Deleted on 2026-10-12 with the Verifix live sync** (its rules live on in `services/verifix_org.py`). The photos and `profile_photo.py` stay; the photos it
  wrote are marked as the sync's own (`vfx_meta.photo_set`), so the live sync
  replaces them when Verifix's photo changes and never touches one a person
  uploaded.
- **A profile RENAMED to a new person keeps the old face** — that pass took the
  photo off the stored tie, and renaming moves no tie. The first case (12 Oct,
  Mukimova Marxabo → Kenjayeva Dinora Sobir Qizi, cells 8222 · 8610) is fixed by
  TEMPORARY `services/leader_photo_fix_oct12.py`
  (`startup.set_kenjayeva_photo_from_verifix`, flag
  `leader_photo_kenjayeva_2026_10_12_v1`, ~90 s after boot, both entrypoints):
  it re-finds her on Verifix by the NEW name (`leader_verifix_check._match`),
  stores her main photo and re-ties the profile (`_apply` — the kind follows her
  job unless set by hand) in one transaction, and DMs the result with the photo.
  Not found → nothing written. Delete it with its startup pair and both calls
  once the DM has landed — BEFORE `leader_verifix_check`.

## The Verifix connection (`/panel/verifix`)

From **2026-10-01** the admin panel carries the login the platform will read
attendance from Verifix with — step one of replacing the daily «Davomat» Excel
upload with Verifix's public API (memory: `verifix-api-integration`). Nothing
reads it yet except the card's own test, so no figure on the platform moves.

- **Basic auth, a dedicated user** (the operator's pick, 2026-09-30): the API's
  documented first method, `Authorization: Basic base64(login@company:password)`
  + `project_code: vhr` + `filial_id` (the organization; REQUIRED for this
  method) on every call. The docs' OAuth client can only be created from the
  «Администрирование» organization, which nobody at Safia can open. The user is
  `safia-ims@safia` with a read-only role of 9 forms, list/get actions only.
- **The data a call returns is the data THAT USER may see** — the docs say so
  («доступен пользователю API»), and a brand-new user sees no employees in the
  UI. The test counts employees separately and names that case
  (`no_employees`) rather than reporting success.
- **`services/verifix.py` is THE client** — `config`, `save`, `client`,
  `call` (POST, `limit`/`cursor` headers, `next_cursor` -1 = done),
  `each_page`, `run_test`. `routers/verifix.py` is the door: `GET` / `PUT
  /api/admin/verifix` and `POST /api/admin/verifix/test`. Admin-only and NOT
  grantable (no `capKey`) — this login reads every employee's attendance.
- **Stored in `app_settings`, the password SEALED** (`web_auth.seal_password`,
  the Gemini key's rule): `verifix_login`, `verifix_password`,
  `verifix_filial_id`, `verifix_host`, `verifix_last_test`. Never returned,
  never logged, never in the action register (it records that the password
  changed and its length). Gitea secrets were the first plan; the operator's
  Gitea account has write but not admin, so it cannot add one.
- **The host is pinned to `*.verifix.com`** (`norm_host`): it decides where the
  Basic header — the password — goes, so a free host would turn the test
  button into a way to post the sealed password anywhere. Redirects are not
  followed for the same reason. Default `app.verifix.com` (the docs').
- **The test is COUNTS only** — divisions (and how many of OUR cells' codes
  Verifix carries as a division `code`, one of the open questions), employees,
  jobs, schedules, time kinds (listed: the «Отработано» mapping needs their
  ids), locations, yesterday's «Отчёт по посещениям» rows, today's first page
  of tracks. No name, passport or phone leaves the function. A 70 s budget plus
  one 25 s call stays inside Cloudflare's 100 s; a count cut short says so.
  The last result is stored and shown on the next visit; changing the
  credential clears it.
- **The first real run (2026-10-01, host `safia.verifix.com`) answered every
  form**: 539 divisions, 255 with a code, **all 159 of our cell codes among
  them** — so a division's `code` IS our verifix code; 8,511 employees, 2,942
  working, so the "the API user sees nobody" worry is gone (the API is not the
  UI's list); 2,942 timesheet rows for 30.09 (2,281 came).
- **…and it placed 0 of those rows in a cell by the row's `division_id`.**
  Verifix holds an employee at TWO levels — a division («департамент») and an
  org unit («отдел»), both nodes of the one division tree — and
  `timesheet$export` / `track$list` print only the division, while the cell
  codes evidently sit on the org units. `employee$list` carries both
  (`division_id`, `org_unit_id`, CURRENT only). So the test counts every
  employee, report row and first-page track into our cells BOTH ways
  (`placed.div` / `placed.unit`, + `came_unit`) and names the report's biggest
  divisions (`top` — names and codes, org structure, never a person). If
  `placed.unit` is the answer, the live feed places a row by its employee's
  org unit — current, which is right for today's shift and approximate for a
  past day (a history needs the Pro `transfer$list`, outside our role).
- **The parity check** (v4.194.0, the card's third block, `POST
  /api/admin/verifix/parity` → `services/verifix_parity.py`): for up to 7
  finished days, the FILE (`attendance_batch_rows` as uploaded; admin-edited and
  hand-added rows skipped and counted) against the API (`timesheet$export`,
  each row placed by its employee's current org unit). People are matched by
  NAME — folded full name, else surname + first name, only when exactly one
  answers (namesakes counted as ambiguous, never guessed). Per day: came on
  each side, matched, only-in-file / only-in-Verifix (the latter only inside
  cells the file covers — a whole cell missing is a file not uploaded, counted
  apart), same cell, same clock, hours. **«Отработано» is FOUND, not assumed**:
  every subset of the 8 most frequent time kinds, in minutes and in seconds, is
  scored against the file's hours over the people both sides say came; the
  winner and three runners-up are shown. Read-only on both sides; the result is
  stored (`verifix_last_parity`, counts and cell codes only). The default range
  ends the day before yesterday — yesterday's shift-2 file lands in the
  afternoon, so its batch is usually still short.
- **First parity run (27.09.2026, a Sunday): the API IS the file.** 1,477 of
  1,478 file rows found by name, the same clock-in/out and the SAME hours for
  1,157 of 1,158 who came, and everybody the file says came, Verifix says came.
  The ±1 differences in 10 of 139 cells are people who changed «отдел» since
  (the check places by the CURRENT org unit; a live feed reads the same day, so
  it does not apply there). Verifix also showed **76 people who came in our
  cells the file did not carry that day** — v4.194.1 lists those cells with the
  last date each was in ANY uploaded file (`uncovered`): a recent date means a
  file was not uploaded, none means no export carries the cell. Switching to
  the API starts counting those people either way — say so before switching.
- Next (not built): a week-long run (both shifts), then the live feed — see the
  memory for the operator's seven decisions.
- **Cells, leaders and brigadirs follow Verifix live from 2026-10-12** — see
  the section of that name below.

## Cells, leaders and brigadirs follow Verifix (`verifix_sync`, 2026-10-12)

The operator (2026-10-12): «Our cells, leaders and supervisors should be synched
with Verifix through API live. Every change happened on Verifix should happen on
ours also» — with four rulings and four accepted proposals, recorded whole in
`docs/plan-verifix-live-sync.md`. Every row is tied to its Verifix record by ID
once, and followed through the tie from then on; history is never affected.

- **The modules.** `services/verifix_org.py` reads and stores the org (every
  employee of every status, the divisions, the jobs — app-setting-free, in
  `live_verifix_reads` key `org`, its own 10-minute read beside the live day's
  `dir`, decoded once per read and kept in memory) and holds the classifiers the
  4–8 Oct one-shots used (`cell_nodes`, the seat rule, `is_leader_job` /
  `is_supervisor_job`, `brigadirs_over`, `match`, `same_person`, `profile_name`).
  `services/verifix_sync.py` is the tie run, the pass, the queue and the taps.
  `services/cell_register.py` holds the register cores the /cells form and the
  sync both run (create, rename, unit, manager, owner, archive / restore,
  release, the manager pool and pick, leader creation, renames with aliases).
  `services/cell_links.py` is the dated reader; `services/cell_archive.py`
  carries archive SPANS; `services/leader_owes.py` says from when a profile
  owes a checklist. `routers/verifix_sync.py` is the admin API; the page is
  «Verifix sinxron» (`/panel/verifixsync`, tools group, admin-only,
  NOT grantable — it moves people and access).
- **A cell's brigadir, «Boshqaruvchi» and «Egasi» are DATED**
  (`cell_link_events`, append-only: field, value, prev, `effective_from` — the
  shift-day the change lands on — `effective_at`, `src` verifix | manual |
  grandfather | release | restore, who, what Verifix said). A BRIGADIR change
  lands at the unit's NEXT shift opening (`cell_links.opening`; at the LATER of
  the two units' openings, `opening_for_move`). A LEADER's link — the
  «Boshqaruvchi» and the «Egasi», by a person or by the sync, a pick, a release
  — counts from the DAY IT IS MADE and is applied at once (2026-10-17, the
  operator: «count it from the day it's connected, not from the next day» —
  `cell_links.connected` = `leader_owes.unit_day`, the first checklist day of
  the cell's unit still fileable: a shift-1 unit today, all day; a shift-2 unit
  the night running now, else tonight's once 09:00 has shut the last one; the
  day a picked profile starts owing), so the profile editor's chip «7331 ·
  18.10 dan» no longer appears for an ordinary pick. Only a «Boshqaruvchi» /
  «Egasi» change recorded while the cell's unit move is still pending lands
  WITH the move — then the chip and «cellMgr.lands» still name its date (the
  manager pool serves `pick_from` + `pick_with_move` beside `next_opening`,
  which stays the brigadir change's date). TEMPORARY
  `startup.land_waiting_leader_links` (flag
  `cell_leader_links_today_2026_10_17_v1`, inline at boot, both entrypoints)
  re-dated once the leader links still waiting under the old rule onto the day
  each was made and applied them; delete it, its flag constant and both calls
  once the flag reads «done». The `cells`
  columns stay the CURRENT mirror, put there by `apply_due` (the minute job
  `cell-links-apply`, and the start of every pass), which voids an event whose
  unit / profile was deleted since and settles work-centre letters the
  «Doimiy qilish» way. Every writer goes through `cell_register` / `cell_links`
  — the /cells form, the profile editor (`_set_leader_cells` never drags a cell
  again), a profile delete or role switch (released at once on the column, the
  event still dated), «Doimiy qilish» on the admin «Davomat» tab, and the sync.
- **Past days read the links of THAT day** — `value_on`, `map_on`, `OnDay`,
  `changed_since`, `cells_of_units`; `cell_archive.alive` / `alive_clause` /
  `dead_from` read the spans (a restore closes its span: archived days stay
  archived). The readers made day-aware: the загрузка pins and labour split
  (`zagruzka_source.cell_pins` / `cell_labor` / `by_wc_on`), the ojidaniya weight
  and divisor (`idle_source`), «Xarajat» (`ojidaniya_cost`), the /downtime bar
  modal, /idle-cell (list, people, cleaners cap, closed-day locks, day summary),
  /zagruzka-cell, Plan Bajarish's share rule, /production's cells and letters
  and staffing proof, `cell_lookup.by_sap(day=)`, the live day's registry
  (`verifix_live._registry(db, day)` → `live_staff.load`, the close's copy),
  `leader_cells.filing_cells`, `one_process`, the turnover month's cell map,
  «Perenaladka» sync, the «Yacheykalar» placement list. **Every one keeps its
  old query and the current columns while no loaded cell moved** (`changed_since`
  is the gate), so nothing reads differently until a change is made.
- **A move that clears a work-centre letter keeps it for the days before**:
  `apply_due` stores the lost letter on the event (`vfx.wc_group_was`),
  `cell_links.letter_on` / `with_letters_on` answer it, and `by_wc_on` (the one
  door of the pin, labour and ojidaniya splits) hands each day's cells with that
  day's letter — also where only a letter changed (`relettered_since`);
  /zagruzka-cell reads every cell with the letter of EACH day (2026-10-26 — it
  read a moved cell with one letter for the whole range, its last day's in the
  unit shown, so a range across a re-lettering split its early days wrongly),
  `cells[]` printing the last day's, and judges each row's `wc_split` by the
  lines of that day's catalog. A letter changed BY HAND on the form is still
  undated, as before. Deliberately present-tense: pickers, labels of history,
  `in_load`, `one_process`, `sap_code`. The «fix it now» reports
  (`zagruzka_gaps`, `cell_input_gaps`, the unpriced report) still pass the
  current unit's cells. One present-tense lag is accepted: a move from a night
  unit to a shift-less one flips the column at midnight inside the night, while
  every day reader still counts the cell in the night's unit.
- **The tie run** (`tie_run`, the page's «Bog'lash», dry run first): a cell by
  its code (`code_key`; a code on two subdivisions or two cells on one key is
  listed), a leader / profile by the strict match narrowed by their own cells
  and unit (`SURE_HOW`: full name, surname + first name, a pin), a unit by the
  strict match narrowed by its Verifix workshop. Everything else is listed in
  «Bog'lanmaganlar», where the admin ties the pair by hand (`verifix_ties`, a
  hand tie wins over every rule). One person may head two units (the Suvonov
  pair); one person on two PROFILES is followed for neither (`shared_tie`). The
  boot seed promoted the 4–8 Oct ties (`leader_kind_meta.vfx.id`,
  `supervisor_kind_meta.vfx.id`), dropped ids shared by two profiles, opened
  archive spans for archived cells and marked the 5 Oct photos as the sync's.
- **A hand tie brings the face at once** (2026-10-16, the operator's call — a
  profile tied by hand showed initials while the sync sat in report mode):
  «Bog'lash», a confirmed `tie_doubtful` and a seat tied to an existing leader
  download Verifix's photo in the SAME request, in every mode
  (`verifix_sync.fetch_photo_now`, called by the router AFTER the tie's
  commit, the download holding no transaction; the pass's rules — a person's
  upload stays `photo_kept`, a refused download is `photo_failed` and a pass
  retries it after 24 h), and the toast says what happened («rasm Verifixdan
  olindi» · «Verifixda rasm yo'q» · «qo'lda yuklangan rasm saqlab qolindi» ·
  «olinmadi»). A hand tie or untie now KEEPS the photo bookkeeping
  (`_photo_keys`: `photo_set` / `photo_kept` / `photo_failed`): dropped with
  the rest of `vfx_meta`, the sync's own face read as a person's upload at the
  next tie and was never replaced, so a profile re-tied to another person
  kept the old face; a seeded value becomes the old person's sha (else
  «stale»), so the new person's photo is fetched.
- **The «Boshqaruvchi» is the Verifix seat by default; a brigadir may pick ONE
  worker of their unit instead.** The pool (`cell_register.manager_pool`, `GET
  /api/profiles/admin/cells/{id}/manager-pool`) is Verifix's working people in
  the unit's own cells, the seat first, leader jobs next — never free text,
  never somebody not on Verifix (a pick outside it is 400 `not_in_pool`). A pick
  (`PUT …/manager`) finds or creates the person's leader profile (owing from the
  first day they can still file) and records a dated manual event; picking the
  seat, or «Verifix bo'yicha», returns the cell to the seat. A cell whose
  brigadir change is still waiting is picked for in the unit it is MOVING to
  (`cell_register.pick_unit`: who may pick, the pool, a new profile's unit). A
  picked profile with no unit is connected to that unit; a person an UNTIED
  profile may already be (`namesake`, the 5 Oct SKIP rules) is listed
  unpickable and refused (`maybe_existing`) — tie them by hand first. Who may:
  an admin, a cells-register manager, the cell's own (or incoming) brigadir on
  an active cell (`can_pick` per row). A manager chosen before this build is
  grandfathered as manual only where it is not the seat (a manager who IS the
  seat is marked Verifix's). «Egasi» is the seat and nothing else — read-only
  everywhere. The /cells form opens a cell's brigadir on the change still
  waiting, the one in force printed under it; picking the one in force
  WITHDRAWS the waiting change. A leader's profile list carries the cells
  picked for them and still waiting, so the profile editor's Save keeps them.
- **The pass** (job `verifix-sync`, every 10 min, one at a time across both
  app copies — an advisory lock on a connection of its own): mode `off` |
  `report` (THE DEFAULT: computes, queues, writes nothing automatic) | `on`.
  AUTOMATIC in `on`: a cell tied, created (no brigadir, out of the загрузка),
  renamed, archived at now (seen closed TWICE, ≥ 9 min apart), restored (only
  if the sync archived it); a unit's / leader's kind from the job (a hand value
  wins); photos (≤ 20 a pass, never over one a person uploaded); the seat as
  «Egasi» and as the default «Boshqaruvchi», a profile created for a seat
  nobody has (UNCLAIMED, connected to the unit only where it will run the cell);
  a leader DISMISSED with a date, seen twice — their cells released (to another
  seat where there is one), their results cut from max(date, today), the
  brigadir and the leader told; a return lifts the sync's own cutoff (a
  person's cutoff is never touched). Everything else is a QUEUE item
  (`verifix_sync_items`, one tap on the page, a dismissed fact never comes
  back): `brigadir_differs`, `leader_moved`, `new_unit`, `code_changed` (the
  code cascades through every stored row), `rename` (only when VERIFIX's own
  spelling changed; the old name kept as an alias the sheet matcher reads),
  `tie_doubtful`, `two_seats`, `seat_changed`, `seat_gone` (the seat left every
  cell, went missing or changed status — nothing released until tapped; a seat
  that MOVED to another cell is released automatically), `hold` (a seat whose
  cell has no brigadir, or whose profile was made with no unit because a person
  chose the manager — the tap connects it, the manager stays),
  `archived_open`, `seat_no_profile`, and the information-only `missing`,
  `unit_dismissed`, `profile_dismissed`, `seat_other_role`, `shared_tie`,
  `not_a_cell`. Ruling 6: a person missing from the list is never a departure.
- **Guards**: a cut answer (< 100 subdivisions, < 1,000 employees, < 80 % of
  tied cells found open) and the per-pass caps (archives 15, creations 20,
  dismissals 10, seat moves 30, profiles 20 — editable on the page) — a pass
  over a guard applies NOTHING and DMs the admins once. One action that fails
  is rolled back alone (a savepoint) and named in the run. A refused pass still
  keeps the «two reads» flags (a disarm must not be lost); a fact seen on every
  read stays armed (its «last looked» stamp moves hourly) and re-arms only
  after 3 h with no acting pass. A hand UNTIE is remembered — no pass or tie run
  ties the row back — until it is lifted on the page («Qo'lda uzilganlar»).
  Photos are fetched with no transaction open; a photo Verifix will not hand
  over waits 24 h. Report-mode and trial runs are kept 3 days, the rest 90.
- **A cell's NAME follows Verifix** (2026-10-19, the operator: «sync the cell
  names also from the verifix»). The pass pulls Verifix's name (code in front
  left out, `verifix_org.vx_name`) onto a tied cell whenever its RU name is not
  Verifix's (`verifix_org.ru_differs`) — until then only when Verifix's own
  spelling changed, so a name that already differed (and a cell first tied with
  no stored name) was never synced. `rename_cell` / `verifix_org.renamed` are
  unchanged: RU takes it, a non-empty uz_cyrl takes it, a Latin uz / en that
  translated the old name is cleared — and once RU matches, a translation typed
  later stays. Automatic in `on`, listed in `report` (the first report pass
  after this lists every name that differs, once). While the sync is `on` the
  RU name of a tied, Verifix-named cell is no person's to edit
  (`verifix_sync.name_locked`): the payloads carry `name_from_verifix`, the
  cell form shows the RU tab read-only (`LangTextInput readOnlyLangs`) with
  `admin.profiles.cellNameFromVerifix` under it and never sends it, and the
  register's PUT does not write it (`_apply_cell_fields`, ignored like
  `owner_id`) — the pass would put Verifix's back within ten minutes. The digest
  line names the new name («cell_renamed 0811 → …»).
- **Report mode PREVIEWS the «two reads» facts**: a would-be dismissal or
  archive is listed the first time it is seen, and nothing about the flags is
  stored (`_two_reads(preview=True)`), so a report read never arms what an
  `on` pass would act on. The first org read runs ~90 s after boot
  (`verifix-sync-boot`), not 10 minutes later — the /cells manager picker
  waits on it.
- **A /cells form from before 4.272** (it always sends `owner_id`; the
  current form never does) cannot cancel a waiting brigadir move: its column
  brigadir is read as «untouched», and a «Boshqaruvchi» or «Egasi» pick from it
  is refused 409 «reload the page» rather than half-applied
  (`profiles._apply_cell_fields`, `old_form`).
- **Boot**: `startup.add_verifix_sync_columns` adds the columns ONE table per
  transaction (cells, then role_profiles, then managers), with a 5 s
  `lock_timeout` and up to six tries, and takes no lock at all once they exist.
  A failure is FATAL: the copy refuses to start, so the deploy keeps the old
  one. One transaction over the three tables lost a deadlock to an old-copy
  request in the blue-green window and left a copy reporting healthy with no
  columns, i.e. no sign-in.
- **The /leaders register's kept build** (`leader_register.fingerprint`) now
  carries the plant's date as well: the owing rule reads «today», so a build
  kept across midnight would count yesterday's owing.
- **Owing** (`role_profiles.owes_from`): NULL = as always; 9999-12-31 =
  created by the sync, claimed by nobody — owes nothing, files nothing, is in
  no ranking; a date = owes from that day (a claim at registration approval, a
  pick — `leader_owes.shift_day` / `unit_day`: the leader's own checklist day,
  or the next one when its window has shut, so a night claimed at 01:30 owes
  that night and one claimed at 11:30 owes the next). A set date decides alone;
  a profile with none created from 2026-10-14 (the day after the release, so
  no profile that existed at the deploy has a past figure move) never owes a
  day before it existed — before the day before, when it was made before 09:00
  (a night-shift leader made at 01:30 owes the night they are in). `leader_cells.expected_days`, the digest (a not-yet-owing leader who
  filed anyway still counts), the bot, the camera door, the Chek-list tab
  (`notOwed` — «Chek-list hali talab qilinmaydi») and every /leaders figure
  (`owes_from` on the roster and the standing pool, element 9) read it.
- **Visibility**: the run log on the page, a digest DM to the admins after a
  pass that changed something (report mode: when the would-do list changed),
  the bell's «Sizdan kutilmoqda» (`verifix_item`, admins, ranked AFTER the
  work list so a first pass never pushes an approval out of the 3-slot
  preview), the /cells pending
  chips and «qo'lda» mark, /cells/:id's «Verifix bilan bog'lanish» card (the
  dated history, the archived periods). Every change is in the Jurnal
  (`org.verifix_sync_pass`, `org.cell_links_applied`, `org.cell_manager_picked`
  …). The assistant may not touch any of it, the manager pick included (it can
  create a profile). A renamed UNIT keeps its old spelling in
  `managers.name_aliases`, which `name_map.sheet_alias_map` reads, so its
  sheet-era rows stay its own.
- **The dated-link and span caches** (`cell_links.events`, `cell_archive.spans`)
  are re-read by ONE thread while the others are served the previous answer; a
  failed re-read keeps it, and a read that began before a write is stale at
  once. Both are read once at the end of the lifespan, before the first
  request (a cold one makes every reader wait on a loader that needs a second
  pool connection). An OPEN span counts only while the cell's `archived_at` is
  set: a cell restored by code that knows nothing of spans (the old copy in the
  swap window, a rollback) is alive, as /cells says.
- **Deviations from the plan, all deliberate**: the six rollout steps were
  built together, so the `brigadir_differs` tap is enabled (the readers are
  day-aware); the org is a read of its own, not a widened `dir`;
  `leader_verifix_check` (its `PINS`) and the 12 Oct Kenjayeva one-shot stay.
  Deleted with this build: `verifix_cell_sync`, `verifix_leader_sync`,
  `verifix_cells_leaders_sync`, `verifix_profile_photos`,
  `verifix_supervisor_check`, `cell_owner_pass`, `multi_leader_cells` and their
  startup hooks in both entrypoints (their records and columns stay).
- **To switch it on**: run the tie run (dry, then real), read the queue and
  the would-do list in `report` mode for two days, then set `on`.

## Shift-managers, brigadirs and leaders as Verifix lists them (2026-10-25)

The operator asked for the names and shifts of all three roles «from the
verifix (not from our platform)». TEMPORARY `services/verifix_roles_report_oct25.py`,
`startup.report_verifix_roles` (flag `verifix_roles_report_2026_10_25_v2`,
~120 s after boot, both entrypoints) reads Verifix fresh and DMs text plus a
workbook to `UNPRICED_DM_CHAT`. v1 sent nothing and left no trace off the server,
so v2 is scheduled in the boot phase (`run`, it only schedules a job, so no
deferred step can hold it back), DMs a «reading now» line first and DMs its own
failure. The role is the person's Verifix job:
`verifix_org.is_leader_job`, `is_supervisor_job`, and «смен» with a head word
for a shift-manager; assistants, deputies and «и.о.» are listed apart. The shift
comes from when each person came in over the last 14 days (day = arrival
04:00–15:00, ≥ 75 % one side, else «both»), then the planned start, then the
schedule's name. It reads only, and nothing on the platform is consulted. Delete
the module, the startup pair and both calls once it has landed.

## «Verifix (test)» — the API, page by page (`/verifix/*`)

From **2026-10-03** (the operator: "build pages to different things we can get
from Verifix API — absolutely everything possible") a sidebar section of its own
SHOWS what Verifix's API returns. Phase 1 (seven pages) and phase 2 (nine
register pages, the same day — the operator: "start phase 2") were built; a
register the API role does not open says which Verifix form to attach, in
place. **On 2026-10-04 the operator removed seven of them** — «Tuzilma»,
«Belgilar», «Hozir ishda», «Qurilmalar», «So'rovlar», «Yo'qliklar»,
«Hodisalar» — with their endpoints and builders, and **kept the permissions**:
none of their methods was blocked, so each stays on the map and readable
through its raw viewer (the catalog simply names no page for it), and the
Verifix API role was not touched. Their old URLs redirect to the map. Personal records (passport, PINFL, family, education) stay off, and so
do WAGES: opened on 2026-10-03 and closed again the same afternoon (the
operator, after detaching «Ведомость» from the API role) — the «Ish haqi» page
was removed and every wage / payroll list is switched off in code, whatever
the role opens. **Admin-only**, three ways (`adminOnly` nav entries,
`RequireAdmin`, `verify_admin` on every endpoint), no page keys. (The lab page
`/staff-live` sat in this section until 2026-10-05 and was retired on
2026-10-06 — see «A live day's engine».)

- **`services/verifix_catalog.py` is THE list of what may be called**: the 94
  READ methods of the Postman collection (path, module, Verifix's own name, the
  empty-filter body, the documented page size, the params with their default
  rules, the page that shows it). Nothing outside it can be called, so the
  section cannot write to Verifix. A new method is one `Method(...)` line.
- **Private records never leave the server** (the operator opened PHOTOS on
  2026-10-03; wages were opened and closed again the same day):
  `verifix_explore.scrub` drops `passport_*`, PINFL / TIN / pension ids, the
  `person_*` sub-lists and every WAGE field carried by an otherwise open list
  (`_WAGE` + `payroll_*`: a hiring or transfer journal's salary and pay
  indicators, a vacation's pay), and masks a card or bank account number to its
  last four digits — on every row, raw viewer included. 25 methods are
  `blocked` — listed on the map as switched off, never called: the 8 that serve
  only personal records (`search_by_npin`, `person_*`) and the 17 wage and
  payroll lists (`verifix_catalog._WAGES`: salary changes and sheets, accrual
  books, one-time charges, payments, bank accounts, pay by time, expenses by
  location, wage scales and the payroll module's reference lists). A blocked
  method keeps no row in `verifix_probes` either: `purge_blocked_probes` runs at
  boot (both entrypoints) and `methods` drops any it finds.
- **Photos** (`GET /api/verifix-test/photo/{sha}?size=96|960`): a person's
  `identification_photos` and the photo of a day's LAST mark (`photo_sha` on
  `track$search_last_track`, on the person card). Streamed from
  `/b/biruni/m:load_image` (then `m:download_file_v2`), resized with Pillow,
  never stored (an in-memory LRU of resized copies). **Only a hash this process
  itself handed out as a photo is served** (`_ALLOWED`) — Verifix keeps
  passport scans behind the same door. The client (`VfxPhoto.jsx`) fetches as a
  blob, only when scrolled into view, four at a time.
- **Everything is a GET** — a read of Verifix, never a platform change — so
  nothing lands in the action register. The one table, `verifix_probes`, is a
  cache of what each method last answered (status, first-page row count, field
  NAMES, ms, error), never a row of data.
- **Errors are answers**: 409 `not_configured` (no login on the card), **424**
  `{code, message, status}` when Verifix refused or failed — never 502/503,
  which the client reads as a restart — 404 / 400 for an unknown id or value.
  `vfxError` + `VfxError` / `AccessNotice` word them; a section the API role
  does not open says which Verifix form to attach, in place.
- **Reads are cached** (`_Cache`: per key, loaded once even when two requests
  ask together; 10 min for the directory, ~1.5 min for today, 10 min for a past
  day). Every page's «Yangilash» passes `force`. One request spends at most
  `REQUEST_BUDGET_S` (72 s) on Verifix, so it stays inside Cloudflare's 100 s.
  The employee list is ~18 pages and a day's report ~30: the first load of a
  page can take 15–30 s, and the pages say so.
- **A Verifix node is our cell when its `code` IS a verifix cell code**
  (`_node_cells`, keyed by `verifix._code_key`); a person sits in their ORG
  UNIT, else their department (the 2026-10-01 finding). The cell chip prints the
  code and the brigadir — never the workshop name.
- **The pages** (`pages/verifix/*`, shared pieces in `components/verifix/`):
  «API xaritasi» (every method's last answer, a probe-all button asking three
  at a time, a raw viewer for any method with params, paging and a JSON lens) ·
  «Xodimlar» (everybody, by status, with photo, unit/cell, job,
  schedule, medical check; a row opens `PersonCard`: facts, 14 days of the
  report, 3 days of marks, photos, every scrubbed field) · «Lavozim va
  grafiklar» (jobs, schedules and their coming days, time kinds marked where
  the parity rule counts them as worked, the production calendar, small lists
  via `RawPanel`) · «Davomat hisoboti» (one day of `timesheet$export` for
  everybody, each row through `verifix_live._person` — the live page's own rule
  — and a day modal of facts by time kind).
- **Phase 2 — the registers** (`services/verifix_registers.py`, shared pieces in
  `components/verifix/registers.jsx` (components) + `registerKit.js` (hooks,
  formatters, filter builders)): «Kadr harakati»
  (hirings, transfers — the org unit a person moved to, by date — dismissals,
  schedule and rank changes) · «Tabel» (timebooks, plan against fact, a
  person's days) · «Smenalar» (Verifix's own shift plan; an OPEN shift is one
  with nobody on it — read off the data, not a status letter) ·
  «Ma'lumotnomalar» (the small lists, each whole). Person-record and payroll
  dictionaries are deliberately left out. «Ish haqi» shipped with them and was
  REMOVED the same day (v4.215.0); `/verifix/payroll` redirects to the map.
- **Big lists load in the BACKGROUND.** Most register methods take no date
  filter and page 100 at a time, while one request must beat Cloudflare's
  100 s. `_start` reads a whole list on its own thread (≤ 400 pages, ≤ 9 min,
  at most `READERS` = 3 talking to Verifix at once); a request waits
  `FEED_WAIT_S` (8 s) and answers with what has arrived plus `loading: true`,
  and the page polls every 2.5 s (`useRegister`) until it is in. A finished
  list is reused 10 min; a forced reload keeps the previous rows on screen
  (`refreshing`) until the new read is done. A read that fails mid-list keeps
  the pages it got and says it is PARTIAL.
- **Nothing heavy is held whole.** A list whose rows carry every line of a
  document (timebooks) is read a few documents per page (`PAGE_SIZE`) and kept
  as one SUMMARY row per document (`project`); a document's lines are read when
  it is opened, narrowed by its id. Terminal statuses are kept as tuples.
- **Pro first, Start second.** The two modules are two views of the SAME HR
  journals (one journal id, one page id). `_first` reads the Pro list and, only
  where the role closes it (forbidden / missing), the Start one; the page names
  which answered (`SourceNote`).
- **The directory is never waited for.** A register uses the phase-1 employee
  and division lists only if they are in memory (`_dir` + `_Cache.peek`); a
  cold one is read on a thread and the page polls until photos and cell chips
  appear. A status letter Verifix does not document is printed AS the letter
  (shift status), never guessed into a word.
- Not built: Excel exports, charts, recruitment (`rec/vacancy$*`, readable on
  the raw viewer), and any write.
