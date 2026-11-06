# Work centres and their group letters

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## A work centre is NOT unique — a cell is

A verifix code identifies ONE cell. A **SAP work centre does not**: two shifts
routinely stand at the same one, so several cells — in different units, on
different shifts — legitimately carry one `cells.sap_code`. Four codes are
shared across units today; three of them across shifts (B2942 = 9411 on
Raximova Kamola's shift 1 and 9423 on Olishev Islom's shift 2).

- **`cell_lookup.by_sap` is keyed by `(manager_id, code)` and `resolve_sap`
  demands the unit.** Keyed by the code alone it answered with whichever cell
  sorted first by verifix code, so a work centre on one brigadir's page was
  named after — and linked to — ANOTHER SHIFT's cell and leader: on Raximova's
  production page B2911 resolved to Yogmirov Feruz's night-shift cell 9121. A
  first-wins map cannot express a code two units both own, so the key carries
  the owner and the call site cannot forget to name it. `by_verifix` stays keyed
  by the code, because there the code really is the identity.
  Consumers: the Production dashboard's `work_centers[].cell` (the «Команда»
  chip, its `CellLink`, the staffing cards, «Odamlar soni»), the admin
  work-centre register, and `/live` — which from 2026-09-14 maps no work centre
  to one cell at all: it hands each work centre's plan to its cells through
  `zagruzka_source.cell_labor` (unit + normalised code, then `wc_group.share`).
  Keyed by the code alone it had summed BOTH shifts' plan minutes onto one cell
  and left the other with no plan. `/cells/:id`'s production count is scoped to
  the cell's own unit too.
- **Within ONE unit the code may still name several cells** (10 groups today),
  and from **2026-09-14** each of them carries a GROUP letter that tells them
  apart — see «A work centre's GROUP» below. `by_sap` still answers a
  group-less lookup with the first cell by verifix code; a lettered cell is also
  keyed by (unit, code, group), and `resolve_sap(..., group=)` reads that key.
- **Everything that COMPUTES was already unit-scoped and did not move.** Every
  `pp_*` table is keyed by `manager_id`, so two shifts hold their own catalog,
  their own «Bugungi fakt» pin and their own quantities for one work centre;
  `zagruzka_source`, `idle_source`, `/zagruzka-cell`, `ojidaniya_cost` and
  `zagruzka_gaps` all group by `(manager_id, sap_code)` — the code normalised through
  `wc_group.cells_by_wc` from 2026-09-14.
- **OPEN, and it moves a number — ask before changing it.** The SAP upload is
  the one place the sharing is not resolved: `_scoped_faza` cuts the фаза file
  by the unit's own work centres ∪ catalog, so a work centre in TWO units'
  catalogs has the day's WHOLE ПЛАН/ФАКТ written to both (A2761 → Murodali
  Ochilov s2 + Xakimov Ruslan s1, identical figures, 234 rows over 48 days).
  Both units' trudoyomkost — and so their загрузка — then counts the other
  shift's output. **The file cannot answer it**: a фаза row is Заказ · Опер. ·
  Команда · SKU · Наименование · План · Статус · Дата · Подтв., with no person,
  no brigade, no shift and no TIME (`_to_date` keeps the date alone), and `op`
  is empty on every line on the platform, so operations cannot separate the two
  either. The plant already works around it by hand — Xakimov's lines are named
  «барадинский 1-смена» beside Murodali's «Хлеб Бородинский», same SKU, same
  work centre, different `labor_time`. The tool for it already exists and needs
  no new rule: **`pp_products.auto_fill = false` on the shared lines**, so the
  upload leaves them alone and each brigadir types the half their shift made.
  Splitting the quantity automatically (evenly, or by the typed «Odam soni») is
  a GUESS about who produced what and needs the operator's decision first.
- **The whole picture was DMed once** — `services/shared_wc_report.py`, fired by
  `startup.report_shared_work_centers` (rich-message tables, flag
  `shared_work_centers_dm_2026_09_10_v1`) and `…_xlsx` (a four-sheet workbook —
  Xulosa · Yacheykalar · Qo'sh yozilgan · Kunlik dalil — flag
  `shared_work_centers_xlsx_2026_09_10_v1`). TWO flags because they are two
  deliveries: the operator asked for the file after the message, so «already
  sent the DM» must not be read as «already sent this»; changing what either
  reports needs a NEW key. A THIRD delivery followed on 2026-09-11 for the same
  reason — `startup.report_shared_sap_cells_raw_xlsx`, flag
  `shared_sap_cells_raw_xlsx_2026_09_11_v1`, rows from
  `shared_wc_report.collect_cells`: the CELLS register alone as an UNFORMATTED
  one-sheet workbook (header row, one row per cell, no styling, and no window —
  a registry fact has no period), BROADER than the four-sheet file's
  «Yacheykalar», since it keeps every code two or more cells carry, cells of
  ONE unit included, not only a code several units claim. Codes are grouped
  through `latin_code` + `_norm`, with the stored spelling in its own column.
  **The window bounds only the trudoyomkost IMPACT** —
  minutes mean something only from `ZAGRUZKA_FROM` — while the duplicated
  quantities and the per-row evidence sheet cover the WHOLE stored history, or a
  sheet emptied by a window that misses the overlap would read as «this is not
  happening». Two registers kept apart because they have two different fixes: the
  CELLS that share a code (a registry fact, harmless now the label is scoped)
  and the CATALOG lines that share one (what writes a quantity twice). Its
  minutes come from `zagruzka_source.wc_labor`, so the report and the page
  cannot state different trudoyomkost for one day, and it prints TWO exposure
  figures per unit, each named: «ulashilgan» (a work centre another unit also
  carries — the risk surface, since the SKUs may not overlap) and «qo'sh
  yozilgan» (a quantity really written to both — the part that is wrong today).
  It reports and changes nothing. Delete the module together with ALL THREE of
  its one-shots — `report_shared_work_centers`, `…_xlsx` and
  `report_shared_sap_cells_raw_xlsx`, each imported and called in BOTH
  `main.py` and `passenger_wsgi.py` — once the answers have landed: a call left
  behind imports a deleted module at boot, and a failed boot rolls the deploy
  back.

## A work centre's GROUP (`services/wc_group.py`)

From **2026-09-14** (the operator's directive) a cell that shares its SAP work
centre with other cells of its UNIT carries a GROUP — one Latin capital letter
(A, B, C …) — and so do the catalog lines that group produces and the «Bugungi
fakt» typed for it. Inside one unit a (SAP code, group) names ONE cell. Before
it A2894's six cells on Ibragimova Sayyora's shift could read only one typed
headcount and one trudoyomkost for the whole line, SPLIT EVENLY, so their
ojidaniya weight, their ojidaniya COST and their per-cell загрузка were guesses.

- **`services/wc_group.py` is THE definition** — `norm_group`, `label`, `share`,
  `line_groups`, `cell_conflicts`, `check_cell`, `in_scope`.
  The client twins are `utils/wcGroup.js` and `components/ui/GroupBadge.jsx`.
  Never re-spell a split, a normalisation or a scope test at a call site.
- **Three nullable columns** — `cells.wc_group`, `pp_products.wc_group`,
  `pp_work_center_daily.wc_group`. NULL = no group / the whole work centre,
  which is exactly what every row stored before meant. The pin table's unique
  key is an EXPRESSION index over `COALESCE(wc_group, '')`
  (`startup.add_wc_groups`): Postgres treats NULLs as distinct inside a unique
  key, so a plain four-column constraint would accept two whole-centre pins for
  one day.
- **The register rule is per UNIT, not per shift** (the operator's call): inside
  one unit and one code there is ONE cell (lettered or not), or every cell is
  lettered and no two alike — two brigadirs on one shift type their own pins
  and keep their own catalogs, so their cells may reuse a letter.
  `check_cell_detail` refuses a break on every register WRITE that moves a
  cell's (unit, normalised code, letter) — the /cells form and the /profile
  inline create; an edit leaving those three unchanged is not re-checked. The
  refusal is STRUCTURED (`code` + `params`, the English sentence as `message`)
  and both forms translate it. The forms offer and send a letter only when the
  cell has BOTH a SAP code and a unit. A body that carries NO `wc_group` at all —
  a /cells tab still open on 4.106 — is never refused over a letter it cannot
  see: clearing the SAP code or the unit drops the letter, and a unit move
  settles it like a cascade, both logged as `group_cleared`.
- **TWO cascades never refuse**: a leader's unit move that drags cells, and the
  admin «Davomat» «Doimiy qilish» write (`attendance_batch.update_cells`). Both
  call `wc_group.settle_moved` once per destination unit, clear the one colliding
  letter and log it as `group_cleared`; a permanent write that CLEARS a cell's
  unit clears its letter the same way. An unlettered cell dragged into a
  lettered work centre is left and named by `report_wc_groups`. The partial
  index `uq_cells_wc_group` is the backstop — and because it exists,
  `startup.migrate_cell_supervisor_column` now drops the letter of every
  unit-less cell it re-attaches, or one leftover letter would roll that whole
  backfill back on every boot.
- **A brigadir move letters cells too, from its move day** (2026-10-26 —
  `catalog_follow`, see «A cell's positions FOLLOW the cell»). `apply_due`
  still settles a moved cell's letter with `settle_moved` the moment the move
  lands; the follow then gives the arrival a FREE letter in its new unit — its
  old one when nothing of that unit at the code carries it (a cell row,
  archived ones included; a line in any version; a pin on any date), else the
  first free one of `LETTERS` — and letters a LONE UNLETTERED cell staying
  there, its unclaimed lines and its whole-centre pin with it (the sibling
  rule), or `share` would hand half of that cell's minutes and people to the
  arrival. The positions that moved take their owner's new letter; a line of
  the new unit an arrival JOINS loses its letter (ruling 5). Every such letter
  counts from the move day (`cell_links.letter_on`) and no row dated before it
  carries it, so no past day re-splits. Letters are therefore set by a person
  (the /cells form, the catalog) AND by a move; the register rule above is
  unchanged, and a move whose positions could not be handed out by it is
  refused at the door (`catalog_refusal`, ruling 2).
- **The catalog rule: a LINE carries its own letter and NOTHING propagates**
  (2026-09-18, the operator's directive — `wc_group.line_groups` is the one
  reader). Two operations of one position may be performed by two cells — the
  предзаг. step in one, the finishing in another — and each cell is handed the
  minutes of the operation it actually performs, because a line's minutes are
  its OWN Трудоемкость × the day's quantity. So «Печенье Шрек» (341 s) and
  «Печенье Шрек (предзаг.)» (289 s) at A2894 may name B and A.
  From 2026-09-14 to that date every line of one (SKU, work centre) had to
  carry ONE letter, on the reading that the SAP file writes one quantity for the
  pair and cannot say which cell made which part of it. It does not have to —
  the quantity is shared, the Трудоемкость is not — and the rule PROPAGATED:
  setting a letter on the row an operator was looking at silently moved every
  other row of that SKU, which is how they found it. Gone with it: `sku_groups`
  (folded a SKU to one letter, answering «unclaimed» when its lines disagreed),
  `line_conflicts`, the «siblings follow» write, the adoption of a destination's
  letter by a moved line, a blank create adopting its SKU's letter, the ABC
  import's refusal of a split SKU, and the boot check's «SKU split over groups».
  `group_siblings` stays on the three catalog responses and always reads 0, so a
  tab open on an older bundle prints nothing rather than breaking.
  **Σ over a work centre's groups is unchanged**, so no unit figure moves — only
  the split between cells does, and only where somebody letters two lines of one
  SKU differently.
  What SURVIVES: a line moved to another Команда still loses its letter (a
  letter names a cell AT a work centre), an ORPHAN letter is still legal and
  still named by the boot check, and **the group is still not part of a line's
  identity**, so changing it moves no typed quantity.
  The ABC import now believes the sheet's «Группа» column line by line and
  carries an unlettered sheet's groups across the wipe on the LINE's own key
  (`pp_calc.line_keys` — name + Трудоемкость, the identity `PPLineDaily`
  already stores quantities under). A line whose name or Трудоемкость the sheet
  CHANGED cannot be followed (the import may never guess by position) and comes
  back ungrouped — the even split, where it sat before anybody lettered
  anything — and the boot check names it.
- **`share` is ONE rule for minutes and for people**: a cell reads its own
  group's value, and whatever no cell's letter claims — an ungrouped line, a
  whole-centre pin, a letter no cell carries — is shared evenly between ALL the
  work centre's cells. For a work centre nobody grouped that IS the old even
  split, so **nothing moved when this shipped** — with TWO exceptions, both
  corrections: /live used to put a shared work centre's whole plan on its first
  cell by verifix code and now shares it evenly (unit figures unchanged), and the
  «Xarajat» entries modal priced a cell of a shared work centre with the WHOLE
  pin and now prices it with the cell's share, as the tree above it always did —
  and Σ over a work centre's cells is always what the work centre carried. For pins the whole-centre pin is
  ignored the moment any group pin exists; writing a group people pin clears the
  whole-centre people pin and writing a whole-centre people pin deletes the
  group pins. The day's штатка pin stays on the whole-centre row.
- **The readers**: `zagruzka_source.typed_pins` (group-keyed), `typed_people`
  (folded per work centre: Σ group pins, else the whole pin — so the fleet
  загрузка keeps its shape), `cell_people` (the ojidaniya weight, which carries
  groups into /downtime, «Xarajat», «Toifalar bo'yicha» and every workbook at
  once), `wc_group_labor` + `cell_labor` (per-cell minutes), and
  `pp_calc.line_minutes_by_group`, which is `line_minutes`' own loop returning
  its other half, so Σ over the groups is the work centre's figure byte for
  byte. `sap_groups_for_leader` + `in_scope` is a leader's group scope: the
  leader of A2894·A reads group A and the ungrouped lines, never group B — but
  the work centre's own figures (its people, load, each group's share and the
  lines' ЛЮДИ/Минут) are computed over EVERY group first and only the rows are
  narrowed afterwards, so a leader reads the brigadir's numbers, never a
  recomputation over their slice (`wc_group.share` depends on every sibling
  group and on the unclaimed part).
  **Every per-cell reader matches cells to work centres through
  `wc_group.cells_by_wc` / `wc_key`** (unit + `norm_code`), sums two stored
  spellings of one work centre, and is handed EVERY cell of the unit: the split
  is over the cells passed, so a one-cell list reads every other group's people
  as unclaimed and takes them — the «Xarajat» entries modal did exactly that
  until it weighed over the unit like its tree. The gap and unpriced reports read
  a cell's pins through `zagruzka_source.cell_pins` (the one pin split;
  `cell_people` is its `> 0` filter) and read `wc_group_labor` once, folded by
  `fold_group_labor`.
- **/production reads a group the way the weight does.** An untyped non-orphan
  group's `people` is its SHARE of the whole-centre or orphan pins (a fraction,
  `people_overridden` false, printed with one decimal and the untyped «*»); a
  typed group publishes its own pin; `people_counted` is what its load and its
  lines' ЛЮДИ/Минут divide by. Before the загрузка floor an untyped group reads
  its share of the work centre's formula suggestion — the rule /zagruzka-cell
  applies. So one cell-day states one headcount on
  /production, /zagruzka-cell and /downtime. A work centre counts as TYPED by
  one client rule, `typedCentre`: once any group pin exists every non-orphan
  group needs one. A lettered chip links only to the cell carrying its letter
  (inert for an orphan) and every tooltip names codes and the leader, never a
  workshop.
- **ORPHAN letters** (on lines or pins, carried by no cell of the unit) stay
  visible with `included: true` — their minutes are already inside the cells'
  shares, so nothing may add them into a total — and are READ-ONLY: a new or
  changed orphan pin is refused (400), an unchanged re-send or a clear is
  accepted. The client asks two questions, never one: `isGrouped` (are there
  letters to SHOW) and `typesPerGroup` (is there a group to TYPE) — a work
  centre whose only letters are orphans is typed as a whole, or its «Bugungi
  fakt» could be typed nowhere. The row editor resets a letter no cell carries at a changed
  Команда, and the bulk bar offers only letters a cell carries at EVERY
  selected line's work centre.
- **Old tabs and leaders.** A whole-centre people value equal to the Σ of the
  work centre's group pins — or of the ones a leader can see — is an ECHO of
  what an older tab was shown: it
  writes no whole-centre people, deletes no group pin and still applies the
  штатка — otherwise a 4.106 tab's Save would have collapsed typed groups into
  their sum. Any other whole-centre number replaces the group pins. A leader's
  WRITES follow their group scope: /override refuses another group's line, and a
  staffing save may not delete a group pin the leader cannot see (403).
  A catalog create with a blank group leaves the line UNGROUPED, and an edit or
  a bulk edit with an empty group clears it on the rows the request named and on
  no others.
- **Where it is typed and shown**: the «Команды» panel draws ONE CARD PER GROUP
  for a work centre typed per group — its own load, people and minutes; штатка
  stays the centre's and says so — with a display-only card for an orphan letter;
  «Odamlar soni» shows a grouped work centre as
  a header row (its штатка, and the Σ of its groups read-only) plus one row per
  group; «Позиции» has a «Guruh» column, the row editor and the bulk bar set it;
  the ABC workbook reads a «Группа» column found by its header text and writes
  the group in column L plus an X:Y group block (see the Позиции export
  exception); /cells, /cells/:id and the cell form carry the letter;
  /zagruzka-cell publishes `wc_split` («none» · «group» · «even») and lists as
  `grouped_work_centers` only work centres where a line or a typed pin actually
  names a cell's letter; /live gives each cell its own share of the plan; the
  gap and unpriced reports name «this LETTERED cell's group was not typed» and
  «this cell has no letter» (`cell_no_group`, fixed on /cells) as reasons of
  their own.
- **The one-shot** `startup.letter_shared_cells` (flag
  `cell_groups_autoletter_2026_09_14_v1`) lettered A, B, C … by verifix code every (unit, code) carried by two or
  more cells none of which was lettered yet — a code an admin had begun
  lettering by hand, or one with more cells than letters, is left and named —
  and left a lone cell blank.
  Config only: no line got a group and no pin moved, so no number moved.
  Changing what it letters needs a NEW flag key. `startup.report_wc_groups` is
  the boot self-check — register breaks, orphan letters, ungrouped lines at a
  grouped work centre, cells whose stored code is not normalised — and changes
  nothing. A SKU whose lines carry different letters was on that list until
  2026-09-18 and is now an ordinary catalog.
- **Consequence to know**: letters on the cells alone change NOTHING. A grouped
  work centre whose brigadir keeps typing one whole-centre number still splits
  it evenly, and one whose catalog lines carry no group still splits the minutes
  evenly. Each cell's figure becomes a measurement only once its people are
  typed per group AND its lines are grouped — a day re-typed per group, past or
  future, starts weighing per cell at once, because nothing is stored.
- **Deliberately unchanged**: the cross-UNIT double write (a work centre two
  units' catalogs name still receives the file's whole quantity in both — the
  OPEN question in «A work centre is NOT unique»), a cell's label (still its
  verifix code; the letter sits beside it), and штатка, which stays per work
  centre.
