# ПЛАН, ФАКТ, people and the SAP file

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## «Bugungi fakt» ШТАТКА is Verifix's (`/production` → «Odamlar soni»)

From **2026-10-05** (the operator: «should not be editable anymore … take from
Verifix automatically») the ШТАТКА column of the «Bugungi fakt» card is READ,
never typed: per work centre (and per group) the people the day's saved
ATTENDANCE — what «Davomat» reads from Verifix — places in that centre's cells.

- **`production._verifix_staffing` is THE figure**, attached by
  `_build_dashboard` as `work_centers[].verifix_hc` / `groups[].verifix_hc` plus
  `verifix: {read, hc, unplaced}`. The unit's own attendance rows (manager +
  date) filtered by `idle_source._counted_hc` — the загрузка's `verifix_hc`
  rule: direct roles (Кондитер…, Фасовщик, Заготовитель, blank title) who came,
  never the brigadir, `hc_weight` summed — on the cell their `verifix_code`
  names (THIS unit's cells, codes met by `norm_code`; a lettered cell is its
  group's).
- **«—» is never 0**: an unread day (no attendance row for the unit-day), a
  centre no cell stands at, an orphan letter. A note under the card says which
  source and, unread, when it appears; `unplaced` (counted in the загрузка but
  in no cell of the page's centres) is named there too.
- **It moves NO number.** The engine's W is still the configured roster or the
  day's штатка pin; the tab's Save sends that pin back exactly as stored (null
  would DELETE it), so a pin set on the «Команды» card's pencil survives. That
  pencil still edits the pin — retiring it is a separate decision.
- Not the live read: the minute-by-minute Verifix read does not reach this
  card until a day is copied, so a running day reads «—» until it is saved. **On a live
  day (`live_day.LIVE_FROM`) the source is the brigadir's close**
  (`production._live_source`): the note says the figures appear once the day is
  closed on «Verifix to'g'irlash», and after the close it names the copy (kind
  «live», its time and who closed) — never a «Davomat» read, which that tab
  refuses for a live day; the proof dialog marks every row Verifix's.
- **Every number PROVES itself** (same day — «we are not sure it comes from
  Verifix»). The card names its source under the table — `verifix.reads` /
  `saved_at` / `saved_by` (`production._staffing_sources`: the «Davomat» read
  each of the unit's cells came from — `attendance_batch_cells.upload_id` →
  `attendance_upload_files.source`, «verifix» or an Excel file — with its
  Tashkent time and who pressed it; a read not yet SAVED says so). A tap on a
  number opens `components/production/StaffingProofModal.jsx` over
  `GET /api/production/staffing-proof` (work centre [+ group], day, unit; a
  leader only for their own cells): every attendance row of those cells,
  counted ones first — they add up to the number by construction, one filter —
  each with the read that supplied it (Verifix · Excel · edited by an admin ·
  added by hand, off the batch row of the same worker), and the rest folded
  under «Hisobga kirmaganlar» with the reason (brigadir · 0 hours · job not
  counted · no name). Read-only; nothing stored.

## ПЛАН/ФАКТ are TYPED; the SAP file has columns of its own (`pp_calc.TYPED_ONLY_FROM`, 2026-11-05)

The operator (2026-11-04): «when SAP files get uploaded, Plan and Fakt columns
should not get numbers from SAP files. Instead, create another Plan and Fakt
columns which do that». Asked, they chose: every figure counts the TYPED numbers
only, and the SAP columns fill only for units on SAP auto-fill (today's reach).

- **`pp_calc.TYPED_ONLY_FROM` (2026-11-05) + `sap_counts(day)` are THE floor**
  — a constant with no override, never moved later. From that shift-day a
  line's ПЛАН/ФАКТ is its own typed value (`pp_line_daily`), else the group's
  typed value (`pp_daily.*_override`, legacy), else **0**. The SAP snapshot
  (`pp_daily.plan_qty` / `actual_qty`) answers for NO line. Days before the
  floor read exactly as they did (snapshot as step 3, gated by `takes_sap`).
- **One gate, every figure.** `compute_dashboard(typed_only=…)` (the Positions
  table, its KPI cards, Вып %, minutes, ЛЮДИ, the ABC workbook, the leader
  checks #1/#9, the shift report's completion) and `_line_minutes` (which gates
  every line on a typed-only date — `line_minutes`, `line_minutes_by_group`,
  `line_facts`: the загрузка, `/zagruzka-cell`, `/live`, Plan bajarish, Plan
  Prognoz, «Liderlar KPI», «Hisobotlar», the «Odam soni» plan lock). No reader
  re-spells the date test. **Consequence to know**: from 5 Nov a unit whose
  brigadir types nothing has no plan minutes — its загрузка, Plan bajarish and
  checks #1/#9 read blank / fail until the lines are typed.
- **An upload from the floor writes the snapshot and nothing else**
  (`production._ingest_for_manager`): it never clears a group override, never
  deletes or clears a `pp_line_daily` row; mode «both» restates the day's
  snapshot (pairs the file dropped read 0, a row left with neither a snapshot
  nor a typed value is deleted). Before the floor it still replaces the day as
  it always did. `_backfill_manager` (the catalog import) goes through it, so it
  keeps typed values from the floor too. `auto_check_timing` lists no SAP upload
  for a typed-only day (it moves no ФАКТ).
- **The «SAP» columns** — «SAP reja» / «SAP fakt» (ru «План SAP» / «Факт SAP»),
  right after ФАКТ on «Pozitsiyalar»: each row's `sap_plan_qty` /
  `sap_actual_qty`, the stored snapshot for its SAP code at its Команда (the
  фаза join's own key — lines of one SKU at one Команда show the same number),
  read-only, muted, «—» for a code-less line or a pair the file has no row for.
  Shown on every day, sortable, in the ColumnsPicker, in the workbook (inserted
  after ПЛАН). Filled by whoever the upload reaches — unchanged: the unit's
  «SAP avto-to'ldirish» switch and an upload's own target picker.
  **ADMINS and SHIFT-MANAGERS only** (the operator: «only visible to admin for
  now» on 2026-11-04, shift managers added 2026-11-06): `GET
  /api/production/dashboard` drops `sap_plan_qty` / `sap_actual_qty` from every
  row for any other role, and the page lists both in `absentCols` for anybody
  else (not drawn, not in the picker, not in the workbook). ONE list on each
  side — `production.SAP_ROLES` and the page's `SAP_ROLES` — gates the columns
  and the two SAP cards below; opening them to another role is those two lists.
  Known gap: the three write doors that answer with the dashboard
  (`/api/production/override`, `/wc-override`, `/staffing`) return it
  unstripped; the page never reads those answers (it re-fetches).
  **A SAP number that differs is RED and names the gap** (the operator, same
  day): `sapGap` in Production.jsx = SAP − the ПЛАН/ФАКТ the row shows, printed
  «120 (+20)» on the cell's one line in `--status-bad`, both numbers in the
  tooltip, bold red in the workbook. A blank on either side counts as 0 (the
  operator, 2026-11-05: an untyped ПЛАН beside a SAP plan is red «3 000
  (+3 000)», and a typed ПЛАН where SAP has none is red «— (−500)»). Never on
  a line with no SAP code, or on a unit-day the file reached with no SAP number
  at all (`sapReached` — a manual unit, or a day not uploaded yet).
- **Two KPI cards read the SAP columns** (2026-11-06, the operator): «Вып % ·
  SAP» beside «Вып %» and «Ср. загруженность · SAP» beside «Ср.
  загруженность», for ADMINS and SHIFT-MANAGERS (`production.SAP_ROLES`, the
  columns' own list — the totals are stripped from the dashboard for every
  other role, and the page draws the cards for the same two). `pp_calc.compute_dashboard` adds
  `sap_plan_labor` / `sap_actual_labor` (Σ over lines with a Трудоемкость of
  its own × the row's «SAP» number ÷ 60 — the numbers on screen, so a shared
  SKU · Команда counts once per line, auto-fill switch not consulted),
  `sap_completion` (fact ÷ plan minutes, None without SAP plan minutes) and
  `sap_avg_load` (SAP plan minutes ÷ (ΣN × shift minutes), the page's own
  typed ΣN). A unit-day no row carries a SAP number for reads «—» on both
  (the page's `sapReached`). Nothing else reads them. They sit on a line of
  their own under the five tiles (the operator, same day: «could be below»),
  each under its twin — a five-track grid from 50rem of column width, where
  the row above stops wrapping; below that the pair wraps like that row.
- **On a typed-only day** (`dashboard.typed_only`): an untyped ПЛАН/ФАКТ prints
  «—» (it counts 0) with a hint naming the SAP columns; the «Manba» column and
  the per-line SAP switch (row editor, create form, bulk bar) are not drawn —
  the file fills ПЛАН/ФАКТ on no line, so they answer nothing. `absentCols` in
  Production.jsx is the one list of columns a view does not draw (with
  «Guruh»), and the picker keeps the reader's choice for them. The admin
  upload's «manual units picked — typed values will be replaced» warning shows
  only for a date before the floor (`utils/typedOnly.js`, the client twin).
- Nothing stored moved: no snapshot, typed value or catalog flag was rewritten,
  and `pp_products.auto_fill` / `PPManagerSetting.auto_fill` keep their columns
  (the per-line one now matters only for days before the floor).

## A ПЛАН belongs to ONE catalog line (`pp_line_daily`)

From **2026-09-03** a hand-typed ПЛАН or ФАКТ on `/production` belongs to the
**catalog line** it was typed on, not to every line that shares its SAP code.

`pp_products` is documented as "one row per (brigadir, SAP code, work center,
operation)" — the same SAP code at one Команда appears several times, each a
distinct operation with its own Трудоемкость. `pp_daily` was keyed one level
coarser, by (brigadir, date, SAP code, work centre), so those lines were not
merely linked: **they were the same database row**. Typing 17 on one moved every
other line in the group. **118 groups hold 313 of the platform's 2,158 lines**,
so this was ~15% of the catalog, not an edge case.

- **`pp_line_daily` is an OVERLAY, and that is the whole safety argument.**
  `pp_daily` is untouched — no new column, no widened key, no data migration and
  no re-ingest, so nothing that already worked could be re-keyed into silence. A
  line resolves its quantity in three steps, and the last two are exactly what
  the platform already answered: **its own override → the group's legacy shared
  override (`pp_daily.*_override`) → the SAP snapshot (`pp_daily.*_qty`)**. The
  fallback is TOTAL: no combination of catalog state and stored rows resolves to
  "nothing", which is the one answer a quantity must never have. A unit that
  never touches the feature reads byte-for-byte what it read before.
- **`pp_calc.line_keys` is THE identity of a line, and it is CONTENT, not a
  position.** A PPProduct id cannot be used — `import_catalog` DELETES and
  re-creates every row, so ids do not survive — and a RANK cannot either, which
  is the trap v4.31.1 fell into for the few minutes it was live. Insert one
  operation into the middle of a group in the ABC sheet, delete one, or retype a
  line's SAP code, and every rank below it shifts: a quantity typed for «Замес»
  silently becomes «Выпечка»'s number, on every historical date at once. **A
  wrong number on the wrong operation is worse than no number.** So the key is
  the line's own name and Трудоемкость (`name|labor#n`), which travel with it
  wherever the sheet moves it. The `#n` suffix separates lines identical in
  BOTH — 3 of the 118 groups — which is the smallest set position can be left
  responsible for. Editing a line's name or its Трудоемкость re-points what it
  tracks, the caveat `daily_key` already carries for renaming a code-less line;
  the value is never moved to a NEIGHBOUR, and who did the moving decides where
  it goes — see the next entry.
- **A catalog EDIT carries the typed values with the line; a catalog IMPORT
  cannot.** `production._carry_manual_quantities`, run inside `PUT
  /admin/production/catalog/{id}`. All four of SAP code · name · Команда ·
  Трудоемкость are part of what a line's quantities are keyed by, so editing
  one used to re-point the reader onto a key with nothing under it: **a number
  somebody typed read 0 on every date at once**, closed and signed-off days
  included, with nothing on screen saying so. An EDIT is the one caller that
  can move a value honestly — one row, one id, its fields before and after —
  which is precisely what an IMPORT cannot do, since matching re-created rows up
  by position is the mis-attribution `line_keys` exists to prevent. So the carry
  lives on the endpoint and `import_catalog` keeps the documented revert.
  - **Only what a PERSON typed travels.** `pp_line_daily` always (those are the
    line's own numbers and nobody else's); `pp_daily.*_override` only where the
    line was ALONE in its old group, and onto the line's own per-line row rather
    than onto the destination group. So no row anybody left alone changes value:
    a shared number with siblings still under it is never moved, and a carried
    one lands a level BELOW what the destination's siblings read.
  - **The line's NEW key is re-joined from the stored file, so it never reads 0
    waiting for a re-upload** (from the day the edit counts on only, since
    2026-09-24 — see «A catalog edit counts FROM NOW ON») — `production._rejoin_lines`, run by all three
    catalog writers (create, single edit, bulk) whenever a line gains or moves a
    SAP key. The join that produces ПЛАН/ФАКТ used to run at UPLOAD time and
    nowhere else, against the catalog as it stood then, so a line added or
    re-pointed afterwards matched nothing when the file landed and read **0 on
    every stored date** — while the raw Фаза tab plainly showed the row it should
    have matched, and `pp_calc` renders a missing snapshot row as 0, which is
    indistinguishable from a day that produced nothing. Re-uploading each date's
    file was the only way back and nothing said so. It is bounded three ways and
    is deliberately NOT `_backfill_manager` (the catalog IMPORT's tool, which
    rebuilds every date from scratch): it writes ONLY the moved keys, never
    DELETES a date, and **never clears an override** — an upload does, because a
    file restating a day outranks a number typed against the old figure, but
    nothing is restated here and `_carry_manual_quantities` may have just carried
    a typed value onto this very line, so the snapshot is filled UNDERNEATH it
    and no number on screen moves until that override is removed. A unit with
    auto-fill switched off is skipped, the rule `_backfill_manager` already
    applies. It writes into days already closed and reported — the same reach the
    upload and the import backfill already have — so `filled` rides on all three
    responses and the page SAYS how much was filled; a silent write into the past
    is the one outcome this must not have. `_unit_sap_scope` + `_scoped_faza` are
    the one spelling of the unit's half of the join, shared with the upload
    fan-out, because two would let a line be filled through one door and not the
    other.
  - **The SAP snapshot (`plan_qty` / `actual_qty`) stays where the file put
    it.** It is not the line's property but a record of what the фаза export
    said about one (code, work centre) pair on one date, and
    `_ingest_for_manager` rebuilds it from the file on the next upload of that
    date — so a moved snapshot is a number that quietly vanishes again later.
    **Consequence to know:** a line sent to another Команда keeps every figure
    anybody typed and reads the new Команда's SAP figures for the rest, which is
    what the file actually says.
  - Sources are deleted and flushed BEFORE any destination is written, because
    an edit can SHUFFLE keys as well as move one: renaming a line onto another
    line's name and Трудоемкость re-ranks the `#n` suffix separating them, so
    one line's destination is the other's source, and writing first would hit
    `uq_pp_line_daily_key`. A row already at a destination can only be an orphan
    of an earlier edit (no two live lines share a `line_key`), so the moving
    line's own number wins; a value it does not carry blanks nothing.
  - The count rides the action log as `carried_values`, so «why did this number
    move» is answerable from «Jurnal» rather than from memory.
- **Several positions are edited at once from the «Позиции» table itself** —
  checkbox column → sticky bulk bar → one modal, `PUT
  /admin/production/catalog/bulk` (admin only, `_CATALOG_BULK_MAX` 500).
  - **Exactly two fields: Команда and Трудоемкость.** They are the only ones
    that can mean the same thing on many rows. **SAP code and name are
    deliberately absent** — each identifies ONE line, so setting them on twenty
    rows only produces twenty lines the register cannot tell apart — and `op` is
    out for a subtler reason: on the single-row form a blank box CLEARS the фаза
    pin, while here blank has to mean «leave every row alone», so one control
    would carry two opposite meanings on two screens. A blank field changes
    nothing on any row, and the modal says so under each control.
  - **The SELECTION is the scope, never the filter** (the `ShiftTimes` /
    `Factories` model). A tick survives a filter change — the rows an operator
    must leave alone are exactly the ones a filter cannot express — so the bar
    states how many picks the current filter HIDES rather than letting «12
    selected» stand over 3 rows on screen. «Select all» unions the visible rows
    and unticking removes only those: a header checkbox must not throw away
    picks made under another filter. Kept in memory, and cleared when the
    brigadir changes — the catalog belongs to one unit, the endpoint refuses a
    mixed-unit batch, and a pick carried across would aim at rows nobody can
    see.
  - **The identity carry runs ONCE over the whole batch**, not per row.
    `line_keys` ranks its `#n` suffix over the whole catalog, so row two's
    identity depends on what row one just became and only a single
    before/after pass sees the finished shape — it is also what makes two lines
    SWAPPING Команда safe.
  - A row with no `id` (an unknown SKU the SAP file carries, with no PPProduct
    behind it) offers no checkbox: there is nothing to edit. The pick column is
    NOT in the `ColumnsPicker` — it is a control, not one of the day's facts, so
    it can never be hidden away from the bar that acts on it, and every
    `colSpan` on that table counts it (`colCount`).
  - Bulk DELETE was deliberately not built: the operator asked to change rows,
    and deleting catalog lines has no undo.
- **`pp_calc.line_minutes` is the second reader and exists so the rule has ONE
  spelling.** `/zagruzka-cell` sums **Σ over lines of labor·qty**, never
  (Σ labor)×one quantity — two operations may now carry two quantities, so the
  product cannot be factored out. Two spellings is how that page and the
  Positions table start reporting different minutes for one day.
- **The first per-line write EXPLODES the group's shared override onto every
  line, then clears it.** Without that step the edited line would show its new
  number while its neighbours silently fell back to the SAP figure — a reader
  would watch a number they never touched change on a row they never edited.
  Exploding first means every line keeps precisely what it was already showing,
  and only the edited one moves.
- **A caller that names no line sets EVERY line of the group** (`_set_whole_group`),
  and that is the only correct answer. A browser tab older than v4.32.0 knows
  nothing about lines, and writing `pp_daily.*_override` for it — the obvious
  reading of "keep the legacy path" — is silently wrong in BOTH directions,
  because the reader resolves per-line FIRST: on a line that already carries its
  own value the write is invisible, so the operator types a number, gets a 200
  and watches the cell spring back; and on the lines that do not, it lands on
  rows they never edited, which is the very bug this exists to remove. Writing
  every line reproduces exactly what such a tab means and expects to see — one
  figure for this position — and the shared level is cleared with it, so one
  level answers. This is what keeps the change MINOR rather than MAJOR.
- **A line the group does not have is a 400, never a silent insert.** `line_key`
  arrives over the wire; storing a row no reader can look up is the "control
  that reports success and writes nowhere" failure, which is the worst thing
  this endpoint could do. A `line_no` from a v4.31.1 tab is resolved through the
  catalog into a key rather than refused, so such a tab keeps editing the line
  it is pointing at.
- **Every first edit of a line on a day is an INSERT, so the write RETRIES once
  on `IntegrityError`.** ПЛАН and ФАКТ saved in one breath, or a re-send after a
  dropped connection, both miss the SELECT and both insert `uq_pp_line_daily_key`;
  the loser escaped as a 500 and the operator watched their number spring back
  out of the cell for no stated reason. Re-reading the winner's row is the answer
  `leader_tasks._sup_row` already gives to the same race.
- `startup.migrate_pp_line_daily_key` converted the ranks v4.31.1 stored into
  keys, in Python and losslessly, because a rank only means anything against the
  catalog it was written under. A row whose rank no longer existed was DELETED
  rather than guessed at. Changing what it does needs a NEW flag key.
- **A SAP upload resets a per-line value exactly as it resets a shared one** —
  mode `both` deletes the date's overlay rows with the snapshot, `plan`/`actual`
  null that one field for the keys the file restated. The closed-day lock
  (`idle_lock.require_open`) and the leader work-centre scope guard both write
  paths, unchanged.
- The cell says so before it is typed in: `plan_shared` / `actual_shared` +
  `group_size` ride on every row and the ПЛАН/ФАКТ cell carries
  `production.qty.shared` — «shared by N lines of this SAP code» — which goes
  the moment the line has a value of its own.

### What one day's SAP file actually says (`pp_calc.faza_quantities`)

From **2026-09-03** (v4.33.0) the фаза fold is ONE function, and both figures are
folded **per ORDER** before they reach a (SKU, work centre) bucket. Before it,
the ingest added the order-level «Поставлено» once per фаза ROW and summed
«Кол-во операции» across operations that were the same units passing through
sequential steps, so a position whose order touched one Команда twice was
inflated on both sides.

- **ФАКТ is counted ONCE per order per work centre.** «Поставлено» is an
  order-header field; multiplying it by an order's operation count is
  indefensible under any reading. Verified on 2026-08-28: order 1743544
  delivered 102 and was stored as 204, 1743551 delivered 714 and was stored as
  1428.
- **ПЛАН collapses only where the operations PROVE they are the same units.**
  All the operations of one order at one work centre carrying the SAME quantity
  count once — on 2026-08-28 that held for 31 of the 58 multi-operation groups,
  and in **all 31** that single quantity equals the order's own «Кол-во заказа»
  while their sum never does. S00001104 at A2733 is the case that started this:
  op 0020 «Замес» 120 and op 0040 «# ПФ Эклер» 120 are one batch of 120 eclairs
  mixed and then finished, stored as 240.
- **Where the quantities DIFFER the sum is kept, unchanged, and that is
  deliberate.** Those 27 groups are one batch measured in two units — «ПФ Чизкейк
  песочка» 21000 (grams of dough) beside «# ПФ Чизкейк» 840 (cheesecakes) — and
  in none of them does the sum or any single operation match the order quantity.
  No scalar can describe them; only attributing each operation to its own catalog
  line can, and no line on the platform names its operation yet. **Never make
  this function guess** — substituting a different wrong number for the existing
  one is worse than leaving a known one in place.
- **Consequence to know: past ПЛАН and ФАКТ moved.** These are STORED numbers, so
  unlike a derived figure they do not re-read themselves, and
  `startup.backfill_pp_actual_from_deliv` had written the same defect into
  history. `startup.correct_pp_double_counted_days` (flag
  `pp_faza_per_order_fold_2026_09_03_v1` — changing it needs a NEW key) replays
  every stored date through the same function: **435 ПЛАН and 580 ФАКТ figures
  across 48 days**, all downward bar one float-representation no-op, out of
  38,514 rows. It never touches a `*_override` (the operator's own numbers), and
  never creates or deletes a row, so a day's set of positions is exactly what it
  was.

### Which DAY a position counts on (`pp_calc.DUE_DAY_FROM`)

From **2026-09-17** (`DUE_DAY_FROM`, the operator's directive) **both** figures of
a position — ПЛАН and ФАКТ — count on the order's **БазисСрокКонца** (заголовок
col J), for **both shifts**, and on no other day.

- **The two defects it closes.** «Поставлено» is an ORDER-header field carrying
  no date of its own, so the only thing that could ever date it was the фаза
  operation it is joined through: `faza_quantities` folds it once per order
  INSIDE one day, but the ingest runs per DATE, so an order whose operations
  start on two days had its FULL delivered quantity written to both. And the
  ПЛАН of an order due TOMORROW was counted against TODAY's delivery — on
  17.09.2026 F00001895 at A1443 read ПЛАН 680 (order 1764353, 360, due 17.09 +
  order 1765394, 320, due 18.09) against ФАКТ 340, i.e. **50%** for a day that
  had in fact delivered 340 of the 360 it owed. It now reads 360 · 340 · **94%**,
  and the 320 belongs to the 18th.
- **`pp_calc.ops_for_day` is THE filter and `by_due_day` THE test** — never
  re-spell the comparison at a call site. ONE filter, because both figures are
  keyed the same way: a kept operation's delivery is that day's by construction,
  and a skipped one takes its ПЛАН and its «Поставлено» away together. There is
  no second gate on the quantity.
- **What this reopens, deliberately.** The 29.08.2026 ruling that a shift is
  credited on the day it STARTED the work (`pp_parser.FZ_DATE`, col H
  «СамРанДатаНчлВыполнен») no longer decides the day from the floor on. **On
  shift 2 the due date is the morning AFTER by construction**, so a night that
  opens 17.09 at 20:00 is due 18.09 and its plan lands there — on a date whose
  typed headcount and attendance belong to the next night, while the загрузка
  divides one by the other. The operator was shown this consequence and answered
  "for both plan and fakt and for both shifts". It is not an oversight and it is
  not to be quietly narrowed to one shift.
- **What keeps the 29.08 incident from repeating is REACH.** A фаза row is still
  stored under the date its own col H names — the parser is untouched — and the
  day that OWNS it reads it back out of every slice in the window
  (`_SLICE_BACK` 30 / `_SLICE_FWD` 7 in `routers/production.py`). So a position
  does not have to appear in its due day's own file to be counted there, which is
  exactly what dropped 28 operations when col I was tried. `_load_slices` reads
  that window once; `_all_slices` reads a whole loop's span once, because
  `_backfill_manager` and `_rejoin_lines` walk every stored date.
- **`_stored_slices` is the ONE reader** and the upload goes through it too
  (after flushing its own slices), so an upload and a later re-ingest of the same
  date cannot produce two different answers. A заголовок-ONLY upload deliberately
  does not reach it: it wrote nothing before, and reading the stored фаза back
  there would turn it into a mode-«both» ingest that DELETES the date's rows and
  clears every override on it.
- **Order facts merge newest-date-first above the floor.** «Поставлено» is
  cumulative as of the moment the export was taken and the day that owns an order
  is often earlier than the file that finally reports its delivery, so the most
  recent заголовок naming an order is the most current statement about it. Below
  the floor only the day's own заголовок is read, or a historical day's ФАКТ would
  move the first time anything re-ingested it.
- **An order with NO readable БазисСрокКонца keeps the old rule** and is counted
  on the day its own operation started. A file that does not say when an order
  was due must not make a real position vanish.
- **An upload writes only the date it was given, and SAYS what it displaced.**
  In mode «Reja + Fakt» an ingest deletes the date's rows and clears its
  overrides, so reaching into a neighbouring day would wipe numbers somebody
  typed there. Instead `rows_other_days` + `other_days` (what of this file
  belongs elsewhere, and which dates to upload next) and `rows_taken_in` (what
  this day took out of earlier files) ride on the response, print on the upload
  card and are counted in the action log.
- **The raw «Фаза» / «Заголовок» tabs are a view of the FILE**, so they still
  show what the export held for that date — which above the floor is no longer
  the same set of rows the date COUNTS. That is the honest reading of a raw-file
  view and is not to be "fixed" by filtering them.
- **A FLOOR, never a rewrite.** Every day before 17.09.2026 resolves exactly what
  it always resolved — `ops_for_day` falls back to the operation's own date and
  `_stored_slices` reads that date's slice alone — so nothing already closed and
  reported moves, and no one-shot replays history. The floor must never be moved
  LATER, which would hand days back to the old rule that have already been read
  under this one. `startup.correct_pp_double_counted_days` is untouched and still
  folds with the old semantics: it is flag-guarded, has already run, and an empty
  DB has no stored day for it to reach.
- **Consequence to know: already-ingested days do NOT re-read themselves.**
  ПЛАН/ФАКТ are STORED (`pp_daily`), so a day keeps the figures it was written
  with until it is ingested again — by re-uploading it, or by a catalog
  backfill / line re-join, both of which now go through the same rule.

## Who a SAP upload fills (`/panel/production`)

From **2026-08-31** the plant-wide фаза/заголовок export no longer reaches every
brigadir. `PPManagerSetting.auto_fill` is the standing switch, per SUPERVISOR,
edited on the «SAP avto-to'ldirish» register at the top of the Production admin
destination; an upload may still name its own targets for one file.

- **Why it exists:** the SAP export is ONE file for the plant and used to fan out
  to every configured brigadir. In mode «Reja + Fakt» `_ingest_for_manager`
  DELETES the date's `pp_daily` rows and clears `plan_override` /
  `actual_override`, so a unit whose ПЛАН/ФАКТ is kept by hand had its figures
  wiped by somebody else's upload, with nothing on screen saying it had
  happened.
- **`_autofill_manager_ids` is THE set an upload reaches when it names nobody** —
  configured MINUS switched off. **Configured is the load-bearing half and must
  never be dropped**: `_ingest_for_manager` scopes by the unit's own work centers
  and catalog SKUs and both filters FALL THROUGH when the unit has neither, so an
  unconfigured unit would be written the ENTIRE plant file. The explicit
  `manager_ids` path re-checks it for the same reason and answers 400.
- **Absent row = ON.** Nothing moved when this shipped; every unit goes on being
  auto-filled until an admin switches one off. `_autofill_off_ids` is the whole of
  what the register says — never invert it into an "on" list, or a unit created
  later starts life excluded.
- **It is a DEFAULT, not a lock.** `manager_ids` (repeated form field) on
  `POST /admin/production/upload` is the per-upload override and reaches a
  switched-off unit deliberately — that is how a manual unit is filled from a
  file when somebody wants it to be. The client sends NOTHING when it is
  following the register, so the backend stays the one place that resolves the
  set; the picker warns, by name, when a «Qo'lda» unit is among the ticks.
  Legacy single `manager_id` still wins over it.
- **The catalog import is the SECOND door and it carries the same rule.**
  `_backfill_manager` writes exactly what the fan-out writes — every stored date
  from the day the import counts on (all of them for a unit's first catalog,
  since 2026-09-24) replaced, every override cleared — so honouring the flag on the upload and
  ignoring it there would wipe a manual unit's figures the next time anybody
  re-imported its catalog. It returns `skipped`, `import_catalog` publishes
  `backfill_skipped`, and the card SAYS so: a silent absence of «N days
  recalculated» reads as "there was nothing to recalculate".
- **Switching a unit either way writes NOTHING to `pp_daily`.** Off leaves its
  existing rows and overrides exactly as they are; on does not backfill — a file
  naming that unit is what fills it. `PUT /admin/production/autofill` takes a
  LIST, so a row toggle and a bulk press are one writer and one transaction,
  never parallel inserts racing the unique key.
- Admin-only, like every other `/admin/production/*` endpoint (`_verify_admin`),
  and the register lists only CONFIGURED units — so it is also the list the
  upload's target picker is built from, and the two can never disagree about who
  exists.
- **The default is THREE units** (the operator's call, 2026-08-31): Suvonov
  Elshod OF, Aripova Manzura and Talipova Mamura are auto-filled, everybody else
  is manual. `startup.seed_pp_autofill_default` (flag
  `pp_autofill_default_2026_08_31_v1`) writes it once — **changing the three
  needs a NEW flag key**, or the old "already ran" mark makes it a no-op on every
  box that has booted once. It states an END state rather than declining when the
  register already holds rows; the flag is what protects every LATER admin edit.
  Matching is by NAME (the ids in `startup.MANAGERS` are a stale seed and no
  longer describe production), exact first, then a both-ways prefix accepted only
  when exactly one unit matches. **All three must resolve or NOTHING is written
  and no flag is set** — switching everyone off while failing to switch the three
  on leaves the next upload with nobody to write to; the roster is printed so the
  fix is one corrected string. It writes config only: no `pp_daily` row, override
  or catalog is touched, so it moves no number by itself.
  Every non-archived unit is switched off, not only the CONFIGURED ones, so a
  brigadir given a catalog later starts manual too — a unit CREATED afterwards is
  on, since an absent row still reads as ON.

### …and which of its ROWS (`pp_products.auto_fill`)

From **2026-09-09** the same question is asked one level down: a single catalog
LINE can be taken off SAP auto-fill, so its ПЛАН/ФАКТ are entered by hand while
the rest of the unit's catalog goes on being filled from the file. Set on the
«Позиции» table — the row's edit modal, or the bulk bar for a selection.

- **It cannot be expressed by skipping a write, and that is the whole shape of
  the feature.** `pp_daily` is keyed by (SKU, work centre) and 313 of the
  platform's lines sit in 118 groups sharing one row, so an upload has to go on
  writing the group's record for the siblings that still read it. What the flag
  governs is whether this LINE READS that record — which is also the reading
  `_carry_manual_quantities` already states: the snapshot is what the фаза
  export said about one (code, work centre) pair on one date, not any one
  line's property.
- **`pp_calc.takes_sap` is THE predicate**, and it answers TWO facts at once:
  the flag, and **whether the line has a SAP code at all**. The фаза join
  reaches a position through its code, so a code-less line (a dough mix,
  «Донат») could never be filled by the file and never was — `daily_key` mints
  it a synthetic key the join cannot produce. Its number has always been the
  one somebody typed, so the switch is offered ONLY on a coded line: there is
  nothing for a code-less one to decide, and both the create and the update
  endpoints answer **400** rather than storing a setting nothing honours (they
  are reachable without the UI). The bulk press SKIPS such rows and reports
  `skipped_no_code` — the selection is the scope there, and one code-less row
  must not bounce a screenful of ticks — and the toast says so, because a
  silent skip reads as a clean success.
- **The gate silences the FILE, never a PERSON.** A line that answers False
  reads its own per-line value (`PPLineDaily`), and failing that the group's
  hand-typed override on the same `pp_daily` row; only the snapshot goes quiet.
  Reading it as «this row has no quantities» blanks a figure somebody entered,
  on every past date at once — the accident `_carry_manual_quantities` exists
  to prevent, arriving through a different door — and the code-less lines,
  which have answered False here since before the flag existed, are exactly the
  rows carrying such values today. With neither level the row reads 0, which is
  what the page has always shown for a position the day's upload did not
  mention.
- **Every reader goes through the one predicate**, or the Positions table and
  the загрузка start reporting different minutes for one day — the rule
  `pp_calc.line_minutes` was made a function for. `compute_dashboard` applies
  it directly; `line_minutes` takes `sap_off` (the line identities that do not
  take the file) and its `shared` values grew two flags saying whether that
  value was TYPED, which is what lets it silence a snapshot without blanking an
  override. Both are optional and default to the old behaviour, so a caller
  that has not been taught them computes exactly what it always did. The three
  callers — `/zagruzka-cell`, `/live` and `zagruzka_source` (the fleet
  загрузка) — all ship both.
- **An upload leaves a manual row alone, and that is what makes the switch
  real.** In `_ingest_for_manager` a manual line's overlay rows are neither
  deleted with the date (mode `both`) nor cleared field by field — without it,
  «this row is kept by hand» would last exactly until somebody uploaded the
  day. A hand-typed value on the GROUP row is exploded down onto the manual
  lines just before that row is replaced, the same explode `_set_line_override`
  performs, because the delete is the one moment it would be destroyed.
  **Consequence to know: a code-less line's typed value now survives an upload
  too.** It is the honest consequence of one predicate — the file says nothing
  about such a line, so it should not empty it — and it only ever preserves.
- **Nothing moved when this shipped.** The column is `NOT NULL DEFAULT TRUE`
  and the migration is pure DDL with no flag (`startup.add_pp_product_auto_fill`),
  so every existing line reads exactly as it always did until a row is switched
  off, and switching one off changes no number already on screen except the
  ones the file was supplying.
- **A catalog IMPORT carries the flag across the wipe**, keyed like the pinned
  фаза (`daily_key` + work centre) — `import_catalog` deletes and re-creates
  every `PPProduct`, so losing it would put a row an operator took OFF
  auto-fill back on it and the next upload would overwrite what they typed.
- Read surfaces: the «Манба» column on «Позиции» (a two-state chip — the file,
  or a person; WHY it is typed lives in the tooltip, because a third chip is
  one nobody can decode), and the ПЛАН/ФАКТ cells, which say it where the
  consequence actually lands. **The column is in `defaultHidden` for everyone
  but an ADMIN** (2026-09-09, the operator's call): it answers the same question
  the switch is set from, and only an admin can set one or upload the file the
  other half of the answer names. A DEFAULT, never a lock — the `ColumnsPicker`
  still offers it to every reader, since a supervisor asking «why is this number
  not the file's» must be able to see the answer — so a profile that has already
  saved a visibility choice keeps it, the `DEFAULT_HIDDEN` rule unchanged. That statement outranks «shared by N lines»: a
  row reading no group figure is not sharing one.
- Deliberately unchanged: the unit-wide `PPManagerSetting.auto_fill` above,
  which still decides whether an unattended upload reaches the unit at all; the
  closed-day lock; and the SAP snapshot itself, which is still written for every
  group the file names.

### …and a line's four CONTAINERS (`pp_products.cap_*`, 2026-10-30)

The operator, from the brigadirs' «Umar oka» form: the «Pozitsiyalar» table
carries TEN columns for the five containers a position is packed into —
rectangle сарик контенер · circular сарик контенер (added the same day) ·
серий контенер · челак · сарик яшик (keys `yellow` · `round` · `grey` ·
`bucket` · `box`) — each a «sig'im» (capacity) and a «soni» (count), the
last columns, after «Pareto» (the operator's call, same day), and
**«Kontiner krishka» is gone from the table** (below).

- **The capacity is a CATALOG field** — `pp_products.cap_yellow / cap_round /
  cap_grey / cap_bucket / cap_box` (NUMERIC, NULL = not stated,
  `startup.add_pp_product_containers`, both entrypoints), in the same unit as
  the line's ПЛАН (on a «kg» line both are really grams). A
  product's container does not change from shift to shift, so it is not a
  per-day number. Dated by `pp_catalog` (in `LINE_FIELDS`), carried across an
  ABC import on the line's key like the measure, read by no figure.
- **Written through `PUT /api/production/catalog/containers`**
  (`{ids, field, value}`, `services/pp_containers.py` names the four fields
  and refuses a capacity that is not a positive number) — the measure's twin
  door: the same audience (`UOM_ROLES` — admin, supervisor, shift-manager),
  scope, dating and «unchanged freezes nothing». Logged as
  `production.catalog_containers_set`. On the table the capacity is a
  `QtyCell`, undoable like ПЛАН.
- **The «Jamoalar» card switches** «Yuklama / Konteynerlar»
  (`production_teams_view`): in containers mode there is ONE CARD PER CONTAINER
  (2026-10-31, the operator — it was one card per team), listing each team that
  needs it with Σ of its positions' counts, in the load view's team order, and
  «Jami» (Σ of the rows) in the card's head — a whole-centre row counts every
  line at its Команда, a group row the lines carrying its letter, and a
  grouped centre's UNLETTERED lines get one more row after its letters — the
  code with «harfsiz» (2026-11-09: Abdukarimov Sanjar's capacities all sat on
  unlettered lines of A2891 / A28910, so every card read «none»; until then
  they were on no row). A team none of whose lines
  states that capacity is not listed; a container no team needs reads «Jami —»
  and «Sig'imi kiritilgan pozitsiya yo'q».
- **«Smena kunligi» carries the day's PLANT totals** — «Konteynerlar — jami»
  under the shift report board (`components/overview/ContainerTotalsCard.jsx`
  over `GET /api/shift-report/containers?day=` — `_scope` + the page's plant
  and shift, every non-archived unit whatever its загрузка switch): one tile
  per container, Σ over every line of `pp_containers.count` (the Python twin
  of `containerCount` — keep them in step), the plan read through
  `zagruzka_source.line_facts`, so only lines with a Трудоемкость count.
- **The count is computed by the page** (`containerCount` in
  Production.jsx, the form's formula): `ROUNDUP(ПЛАН ÷ capacity)`, rounded
  to six places first; «—» without a capacity or a plan. **No ×1000 for kg**
  (2026-11-09, the operator: «the containers written in kg are actually in
  grams») — the ×1000 that stood from 2026-10-30 put A2891 at 166 950
  rectangle containers for a plan of 3 339 at capacity 20; it reads 167 now.
  The «Excel» button inserts the eight as values (capacities green, as typed
  inputs).

### Hourly containers — «Jamoalar» → «Soatlik» (2026-11-12)

The operator: «we want to see the containers every hour — for using from 9–10
we have to see the result at 8», per TEAM. A third view on the «Jamoalar»
card (`production_teams_view` = `hourly`), `components/production/HourlyContainers.jsx`.
**It shows ONE hour, never the day** (the operator, same day, after a first cut
drew a whole-shift matrix per team: «I don't need all day or one shift, just
show hourly and one hour before»): by default the NEXT clock hour — at 08:xx the
09–10 hour, headed «08:00 da tayyorlang — 09:00–10:00 uchun kerak» — laid out
like the «Konteynerlar» view (one card per container, the teams needing it in
that hour, «Jami» in the head). A `SegmentedToggle` of the hours that need any
container steps to another one; the page re-reads the clock every minute, so
it moves on by itself at the top of the hour.

- **The timeline is DERIVED from what the page already has, nothing typed**:
  a team makes its positions ONE AFTER ANOTHER in the table's order (`seq`, «№»)
  from its shift start. A line takes `total_labor ÷ N ÷ (productive_min ÷
  shift_min)` clock minutes — the team's N people at the unit's productive pace
  (the 85% the загрузка file uses; a pinned efficiency moves it with the page).
  Its containers are needed AS it is made: an hour gets the share of the line
  made inside it.
- **The hours add up to the daily count exactly**: an hour's count is
  `ROUNDUP(made by the hour's end ÷ cap) − ROUNDUP(made by its start ÷ cap)`,
  so Σ hours = `containerCount` for that line, never one more per hour.
- **The clock**: a team's cell `shift_start`/`shift_end` (`cells-and-org.md`
  «Cell shift times»), else its unit's shift default — served as
  `cell.shift_hours` on every team cell and `constants.shift_hours` for the unit
  (`_attach_team_clocks` in `routers/production.py`). Neither → 08:00. The
  view is the first reader of those clocks; it is DISPLAY ONLY —
  no figure, KPI or загрузка moves with it, which is what that register's
  «ask before making these hours move a number» guards.
- «Now» is today's page, or yesterday's while a night shift runs past
  midnight; any other date opens on its first hour. A plan that does not fit
  the shift keeps going past its end, so those hours are still offered.
- Lines with no Трудоемкость, or a team with no people, have no hour and are
  left out of this view (they still count on «Konteynerlar»).
- Not built (ask first): a typed start hour per line, a Telegram message per
  hour, a lead time other than one hour.

### …and a line's «Kontiner krishka» (`pp_line_daily.container_cap`, 2026-10-19 — REMOVED from the table 2026-10-30)

The column is gone from «Pozitsiyalar»; the stored values, the column and the
`/override` field stay (additive rule, older tabs), and nothing on screen
reads them any more.

From **2026-10-19** (the operator's request: «one column … empty by default,
and if supervisors want they can type any number on it») the «Pozitsiyalar»
table carries a **«Kontiner krishka»** column (ru «Крышка контейнера», en
«Container cap») — a number the brigadir types per LINE per DAY, blank until
somebody does. Read as a daily fact about the line (how many lids that day),
not a constant of the catalog line — a constant would be a catalog field,
dated by `pp_catalog.freeze` and edited by an admin, which is not what was
asked.

- **It rides the ПЛАН/ФАКТ door.** `POST /api/production/override` with
  `field: "container_cap"` (`OVERRIDE_COLS` maps a field to its
  `pp_line_daily` column), stored on `pp_line_daily.container_cap` — NULL =
  nothing typed, never 0 (`startup.add_pp_line_container_cap`, both
  entrypoints, through `_ensure_columns`, FATAL on failure since every overlay
  read selects it). The same `QtyCell`, the same leader cell/group scope, the
  same closed-day lock (`idle_lock.require_open`), the same Jurnal row
  (`production.override_set`, change key `container_cap`, label
  `logs.f.container_cap`), the same undo. **It always names a line**: the
  group level (`pp_daily`) has no such column, so the whole-group path has
  nowhere to write it and a body without `line_key` is a 400 — the current
  bundle always sends one, and `_set_line_override` explodes and clears the
  shared value only for a column `pp_daily` carries.
- **Nothing reads it.** No load, minutes, ЛЮДИ, загрузка, leader check or
  export figure moves with it; the ABC workbook (the fixed brigadir form)
  does not carry it. It is a column after «Manba» (so that chip keeps
  answering for ПЛАН/ФАКТ alone), sortable, in the `ColumnsPicker` like every
  other column — a profile that saved an order before it existed gets it
  seated where `COLS` puts it, shown.
- **A SAP upload leaves it alone.** `_ingest_for_manager` in mode «both»
  deletes the date's per-line rows; a row carrying a lid count instead loses
  its ПЛАН/ФАКТ overrides (exactly as before) and KEEPS the count — the file
  says nothing about lids, so there is no restatement to outlive. The
  field-by-field modes never touched it.
- **A catalog edit carries it with the line** (`_carry_manual_quantities`,
  beside the two quantities, from the day the edit counts on). A catalog
  IMPORT cannot — the same limit the quantities have.
- The «Excel» button (the «ABC форма») carries it as an inserted column after
  ПЛАН while it is visible on the table (2026-10-29).
- Deliberately NOT built: arithmetic over it, a per-line
  constant.

## «Plan Bajarish» — which products, cells and brigadirs fall short (`/plan`)

From **2026-09-30** (the operator's directive: management must see which
products are usually not fulfilled, which cells, which brigadirs, and the
trend) `/plan` is four views over ONE request —
`GET /api/plan-fulfillment/analysis` (`routers/plan.py`) →
`services/plan_fulfillment.py`: «Umumiy» (KPIs against the previous period,
the daily trend in % or hours, the weekday pattern, the worst brigadirs /
products / cells), «Mahsulotlar» (every catalog line: plan · fact · shortfall in
pieces and hours · short days · a day strip), «Yacheykalar» and «Brigadirlar»
(a brigadir × day heatmap whose squares open «Zagruzka fayli» on that day, then
the period table with Δ vs the previous period). `components/plan/` holds the
views; `PlanLegend`, `DayStrip` and `planUtil.js` are its shared vocabulary.

- **Nothing is measured here.** The minutes are `zagruzka_source.line_facts` —
  `pp_calc.line_minutes`' own loop handing each LINE to a callback
  (`pp_calc.line_facts`), so a unit-day is the Positions table's «Bajarish %»
  and the загрузка's Трудоёмкость to the float, and a unit's products add up to
  the unit. Fulfilment is always minutes-weighted (Σ fact ÷ Σ plan).
- **A cell's part is `wc_group.share`'s rule** (own letter whole, unclaimed
  lines evenly) — `cell_labor`'s split, so the cells of a work centre add up to
  it. A leader / cell pick narrows the lines by those same weights; lines at a
  work centre no cell stands at are a «Yacheykasiz» row per brigadir.
- **The floor is `ZAGRUZKA_FROM`**: before it plan and fact were one sheet
  number per brigadir with no product or cell, so a range reaching back is
  clamped and says so (`clamped`). `MAX_DAYS` (124) caps a request.
- **A unit-day counts only with BOTH halves in**, judged on the WHOLE unit
  before any narrowing: plan without fact is `nf` («fakt kiritilmagan», the
  /live and shift-report rule — never 0%), fact without plan is `np`; both are
  counted and named, neither enters a percentage. The day-close gate of
  `build_metrics_list` is deliberately NOT applied.
- **Shortfall is line-day by line-day** (Σ max(0, plan − fact)): over-making
  one product does not repay another. «Short days» are counted on the client
  against the completion bands in force (`statusBands`, admin-editable), the
  same reading that paints the squares.
- **Filters**: the period and shift are the shared FilterContext values; plant
  (`useFactorySection`) → brigadir → leader → cell → product are this page's
  own (`plan_*` keys), multi-select, each list narrowed by the level above with
  a note. The registry the lists come from (`scope_units`, `cells`) is the
  whole plant, both shifts, so a child pick is pruned the moment a parent
  changes. Products are picked by SKU (`pp_daily.sap_code`, «~name» for a
  code-less line) and a pick stays listed even where the period holds none.
- The pre-redesign `GET /api/plan-fulfillment` stays for tabs still open on an
  older bundle; nothing in the current one calls it.

## The call forecast, sent by the clock (`forecast_autocall`)

From **2026-09-08** the «Smenaga chaqirish» modal's send happens by itself:
**shift 1 at 19:00** and **shift 2 at 06:00**, plant wall clock, every day.
`services/forecast_autocall.py` is THE definition — the times, the audience,
both date rules, the switch.

- **It computes NOTHING of its own.** The job calls `_call_rows` and
  `_send_call_notice` in `routers/production.py` — the very functions the
  modal's two endpoints read, refactored out of them for this — so a count
  DMed by the clock can never differ from the one the modal would have shown
  for that date. Same DM, same `call_forecast` bell row, same
  `ForecastCallNotice`.
- **The DM carries the CARD** (2026-09-15, the operator's go-ahead after trying
  it on `/forecast`): a Rich message whose figure is `forecast_card`'s PNG —
  the same-weekday history the count was averaged over, drawn from the row's
  own `samples` — above a facts table that adds the plan in trudoyomkost
  minutes. It is attached in `_send_call_notice`, so the clock AND the modal
  send it, and `forecast_rich.card()` is THE builder for both and for
  `/forecast`, the bot's test door, so a test cannot show a message the send
  does not. It degrades one thing at a time — rich → the card as a photo under
  the classic HTML caption → the classic text — and a card that fails to render
  costs the card, never the DM. **The facts on it are the SENT numbers**: the
  modal lets a person edit the count, so «Tavsiya» / «Maksimum» read what the
  message states while the chart and «o'rtacha» stay the computed history — an
  edited send reads «Tavsiya 60» beside a «Prognoz 54» point, each under its
  own label. The trudoyomkost is the mean of the recorded plans, never
  `count × capacity`, so about a quarter of units divide back to one person off
  the recommendation — documented in `forecast_card.collect`, not a bug. The
  bell row is unchanged, and a DM queued for an unclaimed profile still goes out
  as text when it is claimed.
- **Each shift is sent its NEXT shift-day, and the two are not the same
  calendar arithmetic** (`target_date`, never re-derived at a call site). At
  19:00 a shift-1 brigadir is on today's day shift, so the next one they staff
  is **tomorrow**. At 06:00 a shift-2 brigadir is finishing the night the
  platform labels YESTERDAY (a night belongs to the date its 20:00 boundary
  opened), so the next one they staff opens at 20:00 **today** — today's date,
  ~14 hours of notice. Sending them tomorrow's would mean a brigadir never gets
  a forecast for the shift they are about to begin.
- **Each unit's notice is committed as its DM goes out, and a retiring copy
  finishes its running jobs before it lets go of the jobs lock** (2026-11-06,
  the audit). The notice row is the guard against a second send, and it was
  committed once after the loop — so a deploy during the send let the next
  copy's catch-up find nothing recorded and DM every brigadir again.
  `scheduler.shutdown_scheduler` now waits up to `JOBS_DRAIN_S` (20 s) for jobs
  already running, then drops the lock; the supervisor's SIGKILL at 60 s is the
  backstop, and process death releases the lock anyway.
- **A unit already notified for that date is SKIPPED.** `last_notice` is the
  modal's own resend guard, read here as a hard skip rather than a confirm: a
  person who sent that unit's call by hand has already answered the question,
  and a job that fires twice must not DM the plant twice. **A send made by hand
  always wins.**
- **The audience mirrors the modal's pre-selection** — a forecast AND a claimed
  supervisor profile — so the clock can never reach somebody the button would
  have left unticked.
- **Two AppSetting rows, read AT FIRE TIME**: `forecast_autocall_enabled` and
  `forecast_autocall_capacity_pct` (the «Smena unumi» the counts are computed
  at). Pausing the send has to be an admin edit and not a deploy — this
  platform has no shell. An **absent row reads as ON at
  `forecast_autocall.DEFAULT_CAPACITY`**, which is **90%** from 2026-09-09 (the
  operator's call — a worker who is present is not productive for all 480
  minutes, and 100% assumed they were). **Consequence to know: every forecast
  count ROSE by about 11%** when this landed, because the same trudoyomkost is
  divided by 432 productive minutes instead of 480. A default only reaches a box
  with NO row, and the «Avto» chip writes one the moment anybody opens it, so the
  move off 100% carries a flag-guarded one-shot as well —
  `startup.set_forecast_autocall_capacity` (flag
  `forecast_autocall_capacity_90_2026_09_09_v1`), which states an END state,
  leaves `enabled` alone, and is what protects every LATER admin edit; changing
  the figure again needs a **NEW flag key**. The control is the «Avto» chip beside «Ertangi chaqiruv»
  on the forecast card (`GET`/`PUT /api/production/trudoyomkost/autocall`):
  readable by everyone who can open the page, writable by an ADMIN only, since
  it governs a plant-wide send.
- **`sent_by = AUTO_SENDER` (0)** is the sentinel actor — `ForecastCallNotice.sent_by`
  is a NOT NULL telegram id — and the modal prints «Avtomatik» for it instead
  of resolving a name that will never be found (`auto` on the row payload).
- **A boot inside `CATCHUP_MIN` (90 min) after a send time runs that send
  late.** A push to main restarts the unit and a cron fire time that passes
  while the process is down is simply dropped (memory jobstore, 5-minute
  misfire grace), so a deploy at 19:00 would otherwise cost the day's call
  entirely. Bounded, because "late" stops being a kindness before the middle of
  the night; it cannot double-send, because the per-unit skip above holds.
- Filed in the action register under the manual send's own action
  (`comms` / `notification.workers_called`, `source="system"`) — one act, one
  place, told apart by its source. A failed pass writes an `error` row rather
  than disappearing.
- Registered from BOTH entrypoints (`main.py` lifespan + `passenger_wsgi.py`)
  like every other boot job.


## A closed day shuts the «Zagruzka fayli» page too

From **2026-09-01** the day-close a supervisor presses on «Verifix to'g'irlash»
(`/staff`) locks `/production` for that (unit, date), exactly as it already
locked `/idle-cell`. Before this the two pages disagreed about the same closing:
ojidaniya was frozen while ПЛАН/ФАКТ, the staffing pins and the reconciliation
block stayed editable — so a number the unit had signed off on could still be
rewritten afterwards, by anyone, with nothing on screen saying the day was shut.

- **`services/idle_lock.py` is THE lock and it is UNCHANGED.** The page reads
  the existing ladder (`services/day_state.day_state`) through that one module
  rather than inventing a production closing of its own — the same reasoning
  the idle-cell lock was built on. A second switch would let the two disagree,
  and there is no way to render "the day is closed but also open". The name is
  now a misnomer (it serves two pages, not one); the module is not renamed
  because every consumer would have to move at once for a cosmetic gain.
- **All four per-day writers are guarded**: `override` (ПЛАН/ФАКТ),
  `wc-override`, `staffing`, `reconciliation`. The catalog endpoints are
  deliberately NOT — a catalog is configuration for every date, not a fact about
  this one, so a closed day must not lock it.
- **Closed is closed for admins too.** `wc-override` is admin-only and is still
  refused; an admin re-opens the day first, exactly as they do for ojidaniya.
  One ladder means one way back, and `POST /api/staff/approvals/reopen` is it —
  the SAME endpoint `/idle-cell` calls, never a second re-opening.
- **The dashboard publishes the lock** (`day` on `/api/production/dashboard`,
  from `idle_lock.day_info`), so the page states it ONCE at the top instead of
  leaving the reader to notice that saving stopped working. Banner, wording and
  the re-open button mirror `/idle-cell`, because it is the same act — only the
  hint line differs, since «kutishlar faqat ko'rish uchun» is the wrong sentence
  on a page that is not about waiting. A missing `day` reads as OPEN, so the
  page can only ever fail toward the behaviour it always had.
- **The affordances go, not just the saves.** `QtyCell` gains `readOnly`: on a
  closed day it renders an ordinary cell — no grid coordinates, no `cursor: cell`,
  no hover pencil, no tab stop. Leaving a spreadsheet editor over a cell whose
  save the API refuses teaches the operator that editing here silently does
  nothing.
- **A refusal is still possible and is SAID.** The page can be open when somebody
  else closes the day, and a spreadsheet cell commits on blur — so all three
  mutations carry `onError`, and `writeErr` (a twin of IdleCell's `errText`)
  reads the code off **`detail_raw`**: `utils/api.js` flattens every non-string
  `detail` to text and keeps the original there, so reading `detail` alone finds
  a JSON blob where the code should be. On `day_closed` it refetches, so the
  banner appears and the cells go read-only under the operator's hands.

## The «Yacheyka» pick on the «Zagruzka fayli» bar (2026-11-10)

The operator asked for a cell filter beside the brigadir picker. The bar's
chain is now plant → shift → brigadir → **cell** (`production_cell`, one
`cells.id` or none); a supervisor, who has no picker, gets the cell section
alone, and a leader gets it only when they run two or more cells.

- **A picked cell reads the page as that cell's leader reads it.** The pick
  goes to the server (`cell=`), and `_cell_pick` turns it into the same
  `wc_scope` / `group_scope` pair a leader's page is built from: the engine
  runs over the cell's work centres and the output loses the other groups'
  lines. So the KPI cards, «Команды», «Позиции», «Odamlar soni» and the Excel
  (`export.xlsx` takes `cell` too — the leader's file, hidden minutes as
  constants) all narrow together, and every figure left is the brigadir's.
  The dashboard says `scope.kind = "pick"`; the «Только ваши ячейки» banner is
  for a leader's own pin only, since the chip already names the pick. As on a
  leader's page, the «Arxiv» card is unit-wide and does not show.
- **What it offers**: `unit_cells` on every dashboard — every cell standing in
  the unit THAT day with a SAP code (`cell_lookup.unit_cells`; `by_sap` keeps
  one cell per work centre, so it cannot list them), a leader's own only. Each
  option prints the code and leader, then the work centre + letter the team
  card prints («9422 · Ivanov I. · A1431»). A pick the list no longer carries
  (another brigadir or day) is ignored by the server and dropped by the page.
- **The «Odamlar soni» save takes the pick as well.** That save deletes a group
  pin its body does not list, and a narrowed page lists only the picked cell's
  groups — so without it an admin saving cell A's people would wipe the sibling
  letter's. With it the group rules are judged against the pick, exactly a
  leader's; the efficiency pin is NOT narrowed (it stays the unit's, the
  brigadir's and admin's as before). The per-row writes (ПЛАН/ФАКТ, the card
  pin, the catalog) name their own line or team and ignore it. The undo stack
  empties when the pick changes.
- The raw «Фаза» / «Заголовок» tabs ignore it, as they ignore the brigadir
  pick: they are a view of the file.

## «№» restarts at 1 inside each Команда (2026-11-12)

The operator: «by choosing a team it should start from 1 for everyone for
every team». The «Pozitsiyalar» table's «№» is the line's catalog number
(`pp_calc` `seq`) — until now it stayed so under a Команда filter, which left
a filtered table reading 4, 9, 17…. **With a Команда filter on, «№» is the
line's place among its OWN Команда's lines in catalog order** (`teamSeq` in
`Production.jsx`): every team reads 1…n, and with two teams picked each
starts at 1. Like the catalog number it belongs to the line, not to the
screen — a search or a sort never renumbers it, and sorting on «№» still
gives catalog order. No filter → the catalog number, as before. The ABC
Excel has no «№» column (Excel's own row numbers), so the file is unchanged.
