# The «Zagruzka fayli» catalog belongs to CELLS (plan, 2026-10-26)

## The operator's rulings (asked one by one, 2026-10-26)

1. **Cells own the catalog.** A cell's positions follow it when it changes
   brigadir. A brigadir's catalog on a day is worked out from the cells
   standing in the unit that day.
2. **Shared positions block the move.** Positions several cells of one unit
   share have no letter (or an orphan letter) at a work centre other cells of
   the unit keep. While any exist, the cell's move is REFUSED, on every door,
   and the refusal names what to letter. The cell keeps its brigadir until that
   is done.
3. **Cells that already moved follow, each from its OWN move day.** Nothing
   before 6 October 2026 changes.
4. **Recompute those days.** Both brigadirs' загрузка, Plan bajarish and
   shift-report figures from each cell's move day are recalculated, closed days
   included.
5. **Duplicates JOIN.** A moved position may be identical to one the new unit
   already has at the same work centre (same product, name and Трудоемкость).
   In that case the moved cell shares the existing one: one quantity from the
   file, split between the cells. The moved copy is archived, not deleted.

## The model in one paragraph

A catalog line is stored in ONE unit's rows, the PARTITION: `pp_products.manager_id`,
dated by that unit's `pp_catalog_versions`, exactly as today. A cell move writes
a **catalog move** record, a new table `pp_catalog_moves`. It names the cell,
the unit it left, the unit it joined, the ids of the lines and work-centre rows
that are wholly the cell's, the day the move counts from (`home_from`), and the
day those rows changed partition (`storage_from`). The rows' partition is
flipped to the new unit at landing.

`pp_catalog.at` / `at_many` / `spans` stop being "the unit's own rows".
They become "every entry that COUNTS for the unit on that day, from whichever
partition holds the authoritative copy on that day". With no move record they
are the old code, byte for byte. Every figure reader already goes through
those three functions, so none of them changes.

## Attribution — THE rule (`pp_catalog`)

For a catalog entry `e` (current row or frozen version entry) seen in
partition `P`'s view on day `d`:

* `e.id` is in no move record → `e` counts for `P` (today's behaviour).
* `e.id` is in move records of cell `c` → let `storage(c, e, d)` be the
  partition that held `e` on `d` and `home(c, e, d)` the unit it counted for:
  * `e` counts only in the view of `storage(c, e, d)`. Its copies in any
    other partition's view are ignored. This is what prevents a copy from
    being counted twice.
  * it counts for `home(c, e, d)`, or for nobody when the move JOINED it.
  * when `P ≠ home` (a retroactive move's `[home_from, storage_from)` days,
    read from the old unit's versions), the entry is presented with its
    group = the owner cell's letter on `d` (`cell_links.letter_on`). A joined
    entry is presented archived and sorted last, so ranking (`pp_calc.line_keys`)
    in the destination cannot move a line that was already there.

`home` and `storage` come from the move records alone, oldest first:
* before the first record's `home_from` → its `from_unit`;
* from a record's `home_from` → its `to_unit`.

The same applies to storage, using `storage_from`. A live move has
`home_from == storage_from`, the landing shift-day. A retroactive one has
`home_from` = the cell's own move day (≥ 2026-10-06) and `storage_from` = the
day the record is written.

`at(U, d)` = the union over `{U} ∪ foreign(U, d)` of the entries that count for
`U`, deduplicated by id and ordered `(sort_order, id)`. `foreign(U, d)` is the
set of partitions named by move records of cells whose home on `d` is `U`. The
same goes for work-centre rows. `spans` cuts the range at every boundary of
every partition involved and at every `home_from` / `storage_from` day.

## The move, at landing (`services/catalog_follow.py`)

This is called wherever a `manager_id` link event is applied, and runs exactly
once per event:
* `cell_links.apply_due`, after letters settle, per event, in a savepoint;
* the immediate branch of `cell_links.record` (a backdated or due event);
* `cell_register.set_unit(apply_now=True)`.

The steps, with old unit `X`, new unit `Y`, day `D = ev.effective_from`,
cell `c`, its code `C`:

1. **What is wholly the cell's in `X` on `D−1`.**
   * Take the cells of `X` at `C` on `D−1`, with their letters on `D−1`.
   * The lines at `C` whose letter is `c`'s letter are the cell's.
   * If `c` was the ONLY cell of `X` at `C`, every line at `C` is the cell's,
     and so are `X`'s `pp_work_centers` row at `C` and its whole-centre pins.
   * Shared lines (unlettered or orphan, other cells remaining) stay in `X`.
     The door refused this move. If such lines appeared after the request,
     they stay and are named on the event.
2. **Freeze both units at `D`** (`pp_catalog.freeze(day=D)`), BEFORE any row is
   touched.
3. **Letter in `Y`.**
   * If `c` lost its letter to a collision, or arrives unlettered, while `Y`
     has other cells at `C`, `c` gets the first free letter. This is logged
     `group_assigned`.
   * Moved lines take `c`'s letter in `Y`, or keep theirs when `c` is alone at
     `C` there.
4. **Join.** A moved line identical to an ACTIVE line `m` of `Y` (same
   `line_ident`):
   * it moves archived (`active=False`, `archived_by` «Yacheyka ko'chishi»),
     sorted after `Y`'s lines;
   * `m` loses its letter (a dated edit, because frozen at step 2), so it is
     shared by the cells at `C`.

   A moved work-centre row whose code `Y` already has is deactivated in `X`
   instead of moving.
5. **Flip partition**: `manager_id = Y` on the moved lines and work-centre rows.
6. **Per-day values from `D` on** — only what was already stored. `D ≥` today
   for a live move, so this is rarely anything:
   * `pp_line_daily`: re-keyed for every line whose `(unit, line_key)` on a day
     changed. That covers moved lines, and also twins in `X` / `Y` whose `#n`
     shifted.
   * `pp_daily`: the snapshot is copied to `Y` where `Y` has no row. `X`'s
     group override for a moved pair becomes the moved line's own override in
     `Y`. `X`'s row is deleted where `X` no longer has a line at that pair, so
     it is not listed as an «unknown SKU».
   * `pp_work_center_daily`: the cell's group pins, and the whole-centre pins
     when it was alone at `C`, move to `Y` under its letter there. A key `Y`
     already holds is kept, and the conflict is named.
7. **Record** the `pp_catalog_moves` row, a summary on `ev.vfx`, and one Jurnal
   row `org.catalog_moved`.

`apply_due` must never refuse or hold a move back. A failure in steps 1–7 is
rolled back alone (savepoint), recorded on the event, and DMed to the admins.
The cell still lands.

## The refusal (every door)

`cell_register.set_unit` refuses a change of unit when all of these hold:
* the cell has a SAP code;
* its current unit `X` has other cells at that code on the landing day;
* `X` has an ACTIVE line at the code that is shared, i.e. no letter, or a
  letter no cell of `X` at the code carries.

It answers `Refused("shared_positions", …, params={code, unit, lines: [names…],
count})`, and every door shows it translated:
* the /cells form (`CellFormModal`);
* the Verifix «brigadir_differs» tap;
* «Doimiy qilish»;
* the assistant, which relays the server's words.

Withdrawing a waiting change is never refused.

## Retroactive (TEMPORARY one-shot, `catalog_follow_retro`)

For every active cell standing away from its positions since 2026-10-06:
* Its own move day comes from its `manager_id` link events. Before 12 Oct, it
  comes from the action register's cell edit (`unit` change). As a last resort
  it is the first day its attendance stands under the new unit. The floor is
  2026-10-06.
* Ownership in the old unit follows the step 1 rule.
* The record has `home_from` = the move day and `storage_from` = now.
* Per-day values (step 6) are re-keyed from the move day.

It is applied only where it is unambiguous:
* exactly one old unit holds lines at the code;
* the new unit has no line at the code that is not identical;
* no shared lines.

Everything else is NAMED and left alone. The result goes to `UNPRICED_DM_CHAT`
as text + a workbook. It is flag-guarded, deferred at boot, and in both
entrypoints.

## Also in scope (needed so nothing breaks)

* **SAP upload**: a unit whose catalog on the upload date has no line and no
  work centre gets NOTHING (it used to get the whole plant file). The scope
  already follows the dated catalog.
* **ABC import into `X`**: sheet rows identical to a line that moved out of `X`
  are skipped and named.
* **ABC import into `Y`**: lines that moved in survive an import whose sheet
  lacks them, and are named on the card.
* **Leader scope dated**: `cell_lookup.cells_unit_for_leader` /
  `sap_codes_for_leader` / `sap_groups_for_leader` take the day, and
  `production._resolve_manager_id` and `leader_auto._Ctx` pass it. A leader's
  past day reads the unit their cell stood in then.
* **Dashboard letters dated**: `_build_dashboard` `cells_at`, `_cell_letters`
  and `by_sap` use `with_letters_on(day)`.
* `profiles._MANAGER_ID_REFS` / re-key lists and `onetime_purge_test_units`
  name `pp_catalog_versions` and `pp_catalog_moves`.

## Not changed

* Per-day tables stay keyed by unit: a day's rows live under the unit that day
  belongs to.
* `pp_day_settings`, `pp_reconciliation`, the unit auto-fill switch, the
  cross-unit double write (A2761), `KEPT_APART`, and verdicts already written.
