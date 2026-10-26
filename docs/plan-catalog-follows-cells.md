# The «Zagruzka fayli» catalog follows its CELLS (spec, 2026-10-26)

## The operator's rulings (asked one by one, 2026-10-26)

1. **Cells own the catalog.** A cell's positions follow it when it changes brigadir; a brigadir's
   catalog on a day is worked out from the cells standing in the unit that day.
2. **Shared positions block the move.** While positions several cells of one unit share (no letter,
   or an orphan letter, at a work centre other cells of the unit keep) exist, the cell's move is
   REFUSED on every door, naming what to letter.
3. **Cells that already moved follow, each from its OWN move day.** Nothing before 6 October 2026 changes.
4. **Recompute those days** — both brigadirs' figures from each cell's move day, closed days included.
5. **Duplicates JOIN** — a moved position identical to one the new unit already has at the same work
   centre (same product, name and Трудоемкость) is shared: one quantity from the file, split between
   the cells; the moved copy is archived, not deleted.

## Decisions taken on the spec's open questions (2026-10-26)

* **Q1 (join with a third cell)**: unletter m, as ruling 5 reads; name `join_spread` in the reports.
* **Q2 (clearing a brigadir)**: refused while the cell owns positions (`positions_need_unit`).
* **Q3 (retro)**: `RETRO_APPLY = True` in the first release — the operator asked for the moves to be
  applied (rulings 3 and 4); the strict guards and the conservation check stand, and everything
  skipped is named in the DM. The sweep turns on once the retro flag reads `done`.


This spec replaces `docs/plan-catalog-follows-cells.md`. The operator's five rulings are not repeated here; every rule below implements them.

## 0. What changed from the draft, and why

**Main decision: positions move by writing the catalog when the move is made, not by reading it differently.**

The draft added an attribution layer inside `pp_catalog.at` / `at_many` / `spans` ("an entry counts for its home unit, read from another unit's partition"). All five critiques found problems in that layer: the letter shown drifting over time, joins shown wrongly per day, ORM rows written through, the move-record cache not seeing the current session, timelines keyed by cell, and the cost on every read.

This spec drops that layer. **`pp_catalog`'s readers do not change at all.** One writer, `catalog_follow`, does the attribution when the move is made:

1. It freezes both units at one shared day `S`. This is the critiques' fix for the boundary that `freeze` clamps.
2. When the move day `h` is earlier than `S` (a late landing, or the retroactive one-shot), it rewrites the two units' **version rows** for the days `[h, S)`. The cell's entries are taken out of the old unit's versions and put into the new unit's versions.
3. It flips the current rows' `manager_id` from `S` on.

After that, every day already says what the rulings require. "A unit with no move reads exactly what it always read" then holds with no special code, because no reader changed.

This is one deliberate exception to "a version is never edited". Only `catalog_follow` may rewrite a version, and only to move one cell's entries between two units on days on or after that cell's move day (rulings 3 and 4). Every rewrite is listed on the move record so it can be undone. The `PPCatalogVersion` docstring and CLAUDE.md must say so.

**Second decision: the follow runs as a sweep after the landing, not inside `apply_due`.** Critique 5 showed that following "exactly once inside `apply_due`" can lose moves. Following inside `apply_due` would mean:
- the old worker lands events during a deploy swap;
- a failure is rolled back and never retried;
- a letter is read from a cache that cannot see the transaction it is in;
- events that land together (swaps) are processed one by one.

So `apply_due` stays almost unchanged. A minute job `catalog-follow` follows every applied `manager_id` event that has no final move row yet. It processes events in groups by `(home_from, code)`, takes the locks, and retries with back-off.

### Critique triage (each item checked against the code)

| Finding | Verdict | Where it is handled |
|---|---|---|
| `freeze` returns `cf` when `eff <= cf`, so the two units' boundaries can differ | **Confirmed** (`pp_catalog.freeze`) | §1.5: one shared `S` |
| An import or delete re-creates line ids, so ids taken from the day before the move miss later spans | **Confirmed** (`import_catalog` deletes and re-creates every non-archived row) | §1.4: ownership is decided per span; the record keeps the union of ids |
| The join is decided once instead of per day | Confirmed for the draft | §1.6: join decided per span |
| `apply_due` stamps `wc_group_was` only `if was_letter` | **Confirmed** | §1.8: letter history always stamped |
| `cell_links.events()` reads through its own `SessionLocal`, and `forget()` runs before the commit | **Confirmed** | §3 WP2: the letter comes from the event row; `after_commit` |
| A lone unlettered sibling in Y loses half its minutes and pins | **Confirmed** (`wc_group.share`: unclaimed work is split over all cells) | §1.6 sibling rule |
| A free letter must also avoid Y's line and pin letters and archived cells | **Confirmed** (`uq_cells_wc_group` has no archived filter) | §1.6 `taken` |
| Swaps and co-moves break when followed one event at a time | Confirmed by reasoning | §1.3 group rule |
| `_scoped_faza` falls through for a unit with no lines (it is handed the whole plant file) | **Confirmed**, and it is a hole that already exists | WP4 |
| `_scoped_faza` reads inactive work-centre rows, so "deactivate X's row" keeps X in scope | **Confirmed** (`own_wcs` uses every row in `cat.work_centers`) | §1.6: X's row is deleted, not deactivated |
| `_archived_lines` filters by `manager_id` on frozen days | **Confirmed** | WP4: look up by id |
| `Refused` raised by `set_unit` becomes a 500 in `profiles._apply_cell_fields` and `attendance_batch.update_cells` | **Confirmed** (no handler in `main.py`) | WP3 |
| The form judges the old letter (`wc_group` is applied after `manager_id`) | **Confirmed** | WP3: reorder |
| `cell_register.norm_code` ≠ `cell_lookup.norm_code` | **Confirmed** | All matching uses `cell_lookup.norm_code` |
| `_rejoin_lines` commits | **Confirmed** | The follow never calls it with commit |
| `set_unit(apply_now=True)` is never used for `manager_id` | **Confirmed** (only `release_profile` uses `apply_now`, and not for `manager_id`) | No hook needed: the sweep catches every applied event |
| `_build_dashboard` `cells_at`, `_cell_letters` and the `by_sap` group key read current letters | **Confirmed**, a defect that already exists | WP5 |
| Timelines keyed by cell; presentation copies and ORM writes; reader cost; caches seeing the session | **Discarded**: they no longer apply, because the readers do not change | — |
| "`home_from` = the first day `value_on` says Y" (critique 2) | **Rejected.** A cell moved before 12 Oct has no events, so `value_on` returns the current column for every day, and this rule would always give 6 Oct. Evidence is used instead (§1.10) | WP6 |
| "Turn off the moved line's `auto_fill` when the switches differ" | **Rejected**: that switch is a person's to set. The difference is reported instead | — |
| "Keep m's letter by default after a join" (critique 3) | **Rejected in favour of the draft's reading of ruling 5**: m loses its letter and the case is reported. Listed as open question Q1 | §1.6 |
| Letters assigned inside `apply_due` | **Rejected**: letters are decided in the sweep, which reads committed state | — |
| A "heal" pass after the landing | **Not needed**: quantity writers and the follow are serialised by an advisory lock | §1.11 |
| Deadlock when a whole team leaves one work centre | **Confirmed** | §1.9: the stayers rule, `leaving`, `move_with`, `together` |

---

## 1. Final model and attribution rule

### 1.1 Terms
- **Partition**: `pp_products.manager_id` / `pp_work_centers.manager_id`, dated by `pp_catalog_versions`. The table, `freeze` and every reader are unchanged.
- **C**: `cell_lookup.norm_code(cell.sap_code)` at the time of the follow. Every comparison of codes, lines, work-centre rows and pins goes through `cell_lookup.norm_code`. `cell_register.norm_code` is never used.
- **Transfer**: one cell, from unit `src` to unit `dst`, counting from day `h` (its move day; for a live move, `ev.effective_from`). `letter_src` is the cell's letter in `src` on `h−1`.
- **Group**: every transfer with the same `(h, C)`. Groups are processed together, in one transaction.
- **S**: the storage day (§1.5).
- **Alive**: `cell_archive.alive(cell, day)`.
- **Join identity**: `(pp_calc.daily_key(sap_code, name), norm_code(work_center), pp_calc._line_base(p))`.

### 1.2 The one invariant
After a follow commits, **every `PPProduct` / `PPWorkCenter` id appears in at most one unit's catalog on any day** (`pp_catalog.at(u, d)` over all `u`). On every day before `h`, every unit's catalog content is exactly what it was before the follow, field for field and in the same order.

### 1.3 Who stays, who leaves (per source unit X)
- **Departers(X)**: the group's transfers with `src == X`.
- **Stayers(X)**: cells that stand in X at C on `h−1` **and** on `h`, are alive on `h`, and are not departers.
  - "Stands in X" means `cell_links.map_on(cells_of_units(db, [X], since=h−1), "manager_id", day) == X`.
  - Each stayer's letter is `cell_links.letter_on(cell, h−1)`.
  - Arrivals into X in the same group are **not** stayers. This is what makes a swap work.
- **Whole(X)** = `dst` when Stayers(X) is empty and every departer of X goes to the same `dst`; otherwise None.

### 1.4 Ownership (THE rule — `catalog_ownership.handed`)
Take one catalog content of X (a version span, or the current rows) and its lines at C, **archived lines included**. Let `A` = Stayers(X) ∪ {departer: `letter_src`}, each with its letter. A line is:
- **mine(c)** when `wc_group.share` would hand it wholly to c: it carries a letter only c carries in `A`, or it is unclaimed (no letter, or a letter nobody in `A` carries) and `A == {c}`;
- **shared** when it would go to two or more cells including c: unclaimed with `|A| ≥ 2`, or a letter c shares with another cell (a register break);
- **others** in every other case.

What moves:
- mine(c) moves to c's `dst` with c as owner.
- Shared lines move only when Whole(X) is set. They go to that `dst` with owner None ("group-shared").
- Otherwise shared lines stay in X and are named `shared_left` (or `shared_left_split` when the departers go to different units).
- Others stay.

Ownership is decided **separately for every span** of X in `[h, S)` and for the current rows. The move record keeps the union of the ids that moved.

### 1.5 The storage day S
`S = max(h, current_from(u) for every unit u of the group that has one)`.

This is computed inside `pp_catalog.align` while the catalog lock of every group unit is held. `align` calls `freeze(u, day=S)` for each unit. Afterwards `current_from(u) == S` for every unit, every day before `S` is covered by versions, and the current rows answer from `S`.
- A live, on-time move gives `S == h`: no version is rewritten.
- A late landing, or a retroactive move after either unit's catalog was edited, gives `S > h`: the window `[h, S)` is rewritten (§1.7).
- A group in which no transfer owns anything takes no lock, freezes nothing, and writes a `nothing` row. An empty destination is therefore never frozen for nothing.

### 1.6 The catalog transformation (`catalog_follow.transform`, a pure function)

**Plan, decided once per group from the database before anything is written** (`build_plan`):

1. **Letters in each destination Y.**
   - `staying_Y` = cells standing in Y at C on `h−1` and on `h`, alive, excluding the group's transfer cells. Arrivals = the transfers into Y.
   - If `|staying_Y| + |arrivals| == 1`: the one arrival keeps its current column letter, None included.
   - Otherwise build `taken`, the union of:
     - the letters of every `Cell` row with `manager_id == Y` at C (archived ones included, arrivals excluded);
     - the letters on **any** Y line at C in any version or in the current rows;
     - the letters of any Y pin (`pp_work_center_daily`) at C, **on any date**;
     - the `h−1` letters of `staying_Y`.

     Arrivals are taken in `verifix_code` order. An arrival keeps `letter_src` if that letter is not in `taken`; otherwise it takes the first letter of `wc_group.LETTERS` not in `taken`. Each assigned letter is added to `taken`. When no letter is free, the arrival gets None and `no_free_letter` is named.
   - Excluding every historic line and pin letter is what makes a new letter **history-neutral**: no line or pin dated before `h` carries it, so a reader that does not date letters reads the same figures for those days.
2. **Sibling rule.** If `|staying_Y| == 1`, that cell `s` is unlettered, and at least one arrival comes in: `s` gets the next free letter `L_s`, recorded in `plan.sibling[Y] = (s, L_s)`.
   - If `|staying_Y| ≥ 2` and one of them is unlettered: name `y_register_break` and change nothing.
3. Whole(X) and Stayers(X) for every source X (§1.3).

**`transform(contents, plan, *, current)`** applies the plan to one span, or to the current rows when `current` is true. `contents` is `{unit: {"lines": [LINE_FIELDS dict], "work_centers": [WC_FIELDS dict]}}`. Steps, in order:

1. **Departures**: apply §1.4 to every source unit.
2. **`Y_remaining`**: Y's entries minus those leaving Y.
3. **Sibling rule**: every line of `Y_remaining` at C that is unclaimed by Y's stayers (no letter, or an orphan letter) takes `L_s`.
4. **Arrivals.**
   - Letter: the owner's `letter_dst`; None for group-shared lines.
   - **Join**: applies when the arrival `p` is active, `takes_sap(p)` holds, and `Y_remaining` has an active `m` with `takes_sap(m)` and the same join identity.
     - Identical lines are paired by rank on both sides, ordered by `(sort_order, id)`.
     - `p` becomes inactive. On current rows it also gets `archived_at = now`, `archived_by = "Yacheyka ko'chishi"`, `archived_from = S`.
     - m's letter follows the owner rule. Let `g` = m's letter and `owner_m` = the staying Y cell that carries `g`. If `g` is None, `owner_m` is None, or `g` is the arrival's own new letter, m is left alone. Otherwise m's letter is set to None (ruling 5). If any Y cell at C other than `owner_m` and the arriving cell exists, it is named `join_spread` (open question Q1).
     - A manual line (`takes_sap` False) is **not joined**. It moves active as a twin, and the per-day step explodes Y's group override (§1.7, pp_daily).
     - An arrival with no partner moves active and is named `unpaired_twin`.
   - **Archived twin**: if `p` is active and Y has an *inactive* line `q` with the same join identity and no active partner, then on current rows `q` is deleted (`archived_twin_dropped`). In versions `q` is kept.
5. **Sort**: `base = max(sort_order over all of Y_remaining)`, or −1 when it is empty. Live arrivals ordered by `(src, sort_order, id)` take `base+1+k`; joined arrivals follow after them. As a result, no `pp_calc.line_keys` suffix of Y's own lines ever changes.
6. **Work-centre rows**: only when Whole(X) is set.
   - If `Y_remaining` has any row at C (active or not), X's rows at C are **removed** (`wc_dropped`, with their штатка/capacity recorded). If all of Y's rows at C are inactive and one of X's was active, Y's first row is set active (`wc_reactivated`).
   - Otherwise X's first row (by `(sort_order, id)`) moves and any other spelling is removed.
   - Y may legitimately end up with lines at C and no row: `admin_create_catalog` creates lines without rows too.
7. Moved entries keep every other field (code, name, labor, op, `auto_fill`, uom, and `active` unless joined).

On current rows the function's output is applied as a delta to the ORM rows: `manager_id`, `wc_group`, `sort_order`, `active` and the archived fields; `db.delete` for dropped twins and work-centre rows.

### 1.7 The window `[h, S)` and the per-day rows
**Window** (only when `h < S`):
1. Split every group unit's versions at `h` and at every version boundary of any group unit inside `(h, S−1]` (`pp_catalog.split_at`).
2. For each resulting sub-interval, run `transform` on the version rows that cover it, with the same plan.
3. Write the result back with `pp_catalog.rewrite_version`. Record `{version_id, unit, from, to, removed:[full dumps], added:[ids], changed:[{id, field, was, now}]}`.

**Per-day rows, from `h` to the last stored date** of the group units in `pp_line_daily`, `pp_daily` and `pp_work_center_daily`:
- `before` = `identities(units, h, last)`, taken **before any write**. `after` = the same function after the writes and a `db.flush()`. Each maps `(unit, day) → {id: (qty_key, wc, line_key, active)}`.
- **`pp_line_daily`**: every id whose `(unit, qty_key, wc, line_key)` differs between `before` and `after` on a day has its rows moved, in two phases.
  1. Load every source row.
  2. Delete the sources. Also delete any row at a destination key that is not itself a source: such a row is an orphan, counted as `orphans_dropped` and never revived.
  3. `flush`, then insert copies carrying every column (`plan_override`, `actual_override`, `container_cap`, `updated_at`).

  This also covers twins in X or Y whose `#n` shifted. A joined copy's rows move to its archived key; if they hold a value, it is named `hidden_typed`.
- **`pp_daily`**: for each day and each pair `(qty_key, wc)` of a line that changed unit:
  - If Y has no row, create one copying X's `plan_qty`, `actual_qty` and `updated_at`.
  - If Y's row has `plan_qty == actual_qty == 0` and X's does not, copy the quantities.
  - Otherwise keep Y's row; if its quantities differ from X's, name `y_snapshot_kept`.
  - If Y's row carries group overrides and Y's own `before` lines exist at the pair, explode those overrides onto those lines' per-line rows (fill only empty fields), then clear them. This is `_set_line_override`'s rule.
  - X's group overrides go onto the moved lines' per-line rows in Y, filling only empty fields.
  - X's row is deleted when X's `after` catalog has no line (active or archived) at the pair; otherwise it is kept.
  - If X's unit auto-fill switch is off and Y's is on, call `_rejoin_lines(db, Y, pairs, since=h, commit=False)`.
- **`pp_work_center_daily`**: on each day `d ≥ h`.
  - **Sibling conversion first**: Y's whole-centre people pin at C becomes a group pin `(s, L_s)`. The whole row keeps its штатка, or is deleted if it has none.
  - **Departer c's people value `v`**: `wc_group.share` over `A`'s letters and X's pins at C (`pins=True`). When Stayers(X) is empty, every X pin at C (people and штатка) leaves; otherwise only c's own group pin(s) leave.
  - **Writing `v` into Y.** Let `L` be c's final letter.
    - `L` is None (c alone and unlettered in Y): use Y's whole row. If it already holds people, keep Y's value (`pin_conflict`).
    - Otherwise, if Y already has a group pin under `L`, keep Y's (`pin_conflict`).
    - Otherwise, if Y has a whole-centre people pin (no group pins), add `v` to it (`pin_added_to_whole`).
    - Otherwise create the group pin.
  - **Штатка**: goes onto Y's whole row only if that row has none; otherwise dropped (`shtatka_dropped`).
  - An X whole-centre people pin that stays because stayers exist is named `x_whole_pin_kept`.
  - Rows are matched by `norm_code`. New rows use the source row's raw spelling.

**Conservation check**: `zagruzka_source.wc_labor(units, h, last)` before and after, summed over units per day. A live or late follow reports any `|Δ| > 0.01`. A retro is **strict**: it rolls the cell back and names `conservation` unless `Δ` is within 0.01, or the only differences are joins or `y_snapshot_kept` and `Δ ≤ 0`.

### 1.8 Letter history (dated, history-neutral)
Whenever the follow changes a cell's letter, the change counts from `h`:
- **The moving cell c**: if its landing event already has `wc_group_was`, it is kept. Otherwise set `wc_group_was = letter_on(c, h−1)`, evaluated before the change.
- **The sibling s**: set `vfx["siblings_was"][str(s.id)] = letter_on(s, h−1)` on the group's first landing event. `cell_links._load` reads this (WP2).
- **Retro with no event at `h`**: insert a **mark** event: `manager_id`, `value = prev = cell.manager_id`, `effective_from = h`, `applied_at = now`, `src = "catalog_follow"`, `vfx = {"catalog_mark": True, ...}`. It is inert for unit resolution (`_resolve` and `changed_since` ignore `value == prev`), and `cell_links.history` hides it.
- A cell whose LETTERS history already has an entry after `h` is not re-lettered; the retro names it `letters_after`.

### 1.9 Refusal (every door) — `catalog_refusal.shared_positions`
This is checked in `cell_register.set_unit` when `new ≠ cell.manager_id`. A withdrawal (sending the unit currently in force) is never refused.
- `day` = the landing day `opening_for_move` computes. `leaving` = `{cell id: to}` = this cell plus any other cell of the same request (batch doors).
- **Stayers** = §1.3 with `h = day`, minus `leaving`. Letters are the current column letters; the cell's own letter is the one written by **this** save.
- **Lines** = `pp_catalog.current(X).active_lines` at C.
- `X is None` → allowed. `C` empty → allowed.
- `to is None` (clearing the brigadir) while mine(c) is not empty → `Refused("positions_need_unit")` (open question Q2).
- Stayers exist and `handed(...).shared` is not empty → `Refused("shared_positions", kind="shared")`. If the cell itself is unlettered among lettered stayers → `kind="unlettered_cell"`.
- No stayers, unclaimed lines exist, and the members of `leaving` at C go to two or more destinations → `kind="split"`.
- Only active lines block. Archived lines never block.

The refusal is `Refused(code, message, 409, params)`:
- `params` = `{kind, code, cell, cell_letter, unit, unit_name, count, lines:[{id, name, sap_code, group}] (first 10), staying:[{id, code, letter}], dests:[ids]}`.
- `message` is a full English sentence, because the assistant relays it word for word.

At landing time nothing is ever refused. Shared lines that appear after the request stay in X and are named.

### 1.10 Edge decisions
| Case | Decision |
|---|---|
| `ev.prev` is None (a brigadir-less cell gains a unit, e.g. `verifix_sync._create_unit`) | `nothing`, named `from_no_unit` |
| `ev.value` is None (cleared by a writer that is not a door) | `named`, `to_no_unit`; the lines stay in X |
| A voided event, or one with `value == prev` | not selected |
| Archived cell, or a cell with no SAP code | `nothing` |
| SAP code changed between the request and the landing | Lines are followed at the code **at landing**. If they differ from `vfx.sap_code_at_request`, name `code_changed` |
| The cell owns nothing (unlettered among lettered stayers) | `nothing`, named `owned_nothing` |
| Destination had no catalog | It is frozen like any other unit (§1.5). Named `dst_was_empty`: its first ABC import will count from that day |
| The two units' auto-fill switches differ | Named `autofill_differs` |
| An earlier event of the same cell is not yet final | Later events of that cell wait |
| `KEPT_APART` | Not special-cased: the follow handles moves people make |

### 1.11 Locks
Two-int advisory locks (`pp_catalog.lock`):
- `NS_CAT = 61_026_101`, keyed by unit: **exclusive**. Taken inside `freeze` (blocking), by every catalog writer right after it reads its row, and by the follow (try).
- `NS_QTY = 61_026_102`, keyed by unit:
  - **shared** for quantity writers: `set_override`, `set_wc_override`, `save_staffing`, `save_reconciliation`, `_ingest_for_manager`, `_rejoin_lines`, `_backfill_manager`;
  - **exclusive try** for the follow.

The follow never waits: if any lock is busy, the group gets state `busy` and is retried. The locks are reentrant inside one transaction. Off Postgres they do nothing.

---

## 2. Schema

New model `PPCatalogMove` (`models.py`), table `pp_catalog_moves`. It has **no foreign keys** (soft integer references), so creating it locks no hot table. `Base.metadata.create_all` creates it in the existing first `run` step; no other migration is needed.

```
id            Integer PK autoincrement
created_at    DateTime(tz) server_default now()
updated_at    DateTime(tz) server_default now(), onupdate now()
kind          String(8)  NOT NULL         -- live | late | retro
state         String(12) NOT NULL         -- moved | nothing | named | failed | busy | gave_up | dry
event_id      Integer NULL                -- cell_link_events.id
cell_id       Integer NOT NULL
code          String(32) NOT NULL         -- norm C at landing
from_unit     Integer NULL
to_unit       Integer NULL
home_from     Date NOT NULL               -- h
storage_from  Date NULL                   -- S (NULL when nothing moved)
letter_from   String(1) NULL
letter_to     String(1) NULL
whole_code    Boolean NOT NULL default false   -- Whole(X) was set: the code left X entirely
line_ids      JSONB NOT NULL default []   -- union of every PPProduct id that changed unit
lines         JSONB NOT NULL default []   -- [{id, qty_key, wc, wc_n, base, group_from, group_to,
                                          --   active_after, joined_into, takes_sap}]
wc_ids        JSONB NOT NULL default []
wc_dropped    JSONB NOT NULL default []   -- [{id, code, shtatka, capacity, active}]
versions      JSONB NOT NULL default []   -- rewrite audit, §1.7
letters       JSONB NOT NULL default {}   -- {"<cell id>": [was, now]}  (c and sibling)
rekey         JSONB NOT NULL default {}   -- counts per table + conflicts
named         JSONB NOT NULL default []   -- [{kind, …params}]
impact        JSONB NOT NULL default {}   -- per unit-day minutes/people before→after
tries         Integer NOT NULL default 0
next_try_at   DateTime(tz) NULL
error         Text NULL
by_name       String NULL
__table_args__:
  Index("uq_pp_catalog_moves_event", "event_id", unique=True, postgresql_where=text("event_id IS NOT NULL"))
  Index("ix_pp_catalog_moves_from", "from_unit"); Index("ix_pp_catalog_moves_to", "to_unit")
  Index("ix_pp_catalog_moves_cell", "cell_id", "home_from")
  Index("ix_pp_catalog_moves_retry", "state", "next_try_at", postgresql_where=text("state IN ('failed','busy')"))
```

There are no new columns on existing tables, so `passenger_wsgi.py` needs no schema change. The retro's schedule call goes into both entrypoints (WP6).

`AppSetting` keys:
- `catalog_follow_retro_2026_10_26_v1`, the flag: `dry:<n>` or `done:<moved>/<named>`;
- `catalog_follow_retro_2026_10_26`, the record JSON;
- `catalog_follow_retro_2026_10_26_v1_dm_<mode>`.

---

## 3. Work packages

Every package codes against the signatures below. WP1 lands first because it is small and is the foundation. In a file shared with another package, edit only the functions named for your package.

### WP1 — foundation: `pp_catalog` primitives, ownership helpers, move store
**Owns:** `backend/app/services/pp_catalog.py`, `backend/app/services/catalog_ownership.py` (new), `backend/app/services/pp_catalog_moves.py` (new), and in `backend/app/models.py` the new `PPCatalogMove` plus the `PPCatalogVersion` docstring.

`pp_catalog.py`:
```python
NS_CAT, NS_QTY = 61_026_101, 61_026_102
def lock(db, unit_ids: Iterable[int], *, ns: int = NS_CAT, shared: bool = False,
         try_: bool = False) -> bool
    # sorted ids; pg_advisory_xact_lock[_shared] / pg_try_advisory_xact_lock(ns, id); True off-Postgres
def freeze(db, manager_id, reason="", now=None, *, day: Optional[date] = None) -> date
    # lock(db,[manager_id]) first; eff = day if day else effective_day(...); body unchanged
def align(db, unit_ids, day: date, reason: str) -> date
    # lock(all); S = max(day, *current_from); freeze(u, reason, day=S) each; assert current_from(u)==S; return S
def split_at(db, manager_id, day: date) -> None
    # ensure a version boundary at `day` (< current_from). If version V has vf<day<=vt (vf None = −∞):
    # V.valid_to=day−1; flush; insert copy [day, vt] (same lines/work_centers/reason). No-op if already a boundary.
def versions_between(db, manager_id, a: date, b: date) -> list[PPCatalogVersion]   # covering [a,b], by valid_to
def rewrite_version(db, row: PPCatalogVersion, lines: list[dict], work_centers: list[dict]) -> None
    # assigns NEW list objects (JSONB change detection); never touches valid_from/valid_to/reason
```
`at`, `at_many`, `spans`, `current`, `catalog_for` and `effective_day` are **unchanged**.

`catalog_ownership.py` (pure, plus small reads):
```python
@dataclass(frozen=True)
class Handed: mine: list; shared: list; others: list
def handed(lines, letters: Mapping[int, Optional[str]], cell_id: int) -> Handed      # §1.4, exactly
def join_ident(p) -> tuple[str, str, str]      # (daily_key, norm_code(wc), pp_calc._line_base(p))
def lines_at(lines, code: str) -> list         # norm_code(work_center) == code
def cells_standing(db, unit_id: int, code: str, d_before: date, d_on: date,
                   *, exclude: Iterable[int] = ()) -> dict[int, Optional[str]]
    # §1.3 stayers: cells in unit at code on BOTH days (cell_links.map_on over cells_of_units(since=d_before)),
    # alive on d_on (cell_archive.alive), → {id: letter_on(cell, d_before)}
```

`pp_catalog_moves.py` (readers for WP4 and WP6; reads committed rows with `state == 'moved'`):
```python
def moved_out(db, unit_id, day) -> list[dict]          # rows from_unit=unit, home_from<=day, cell NOT in unit on day
                                                       # → their `lines` snapshot entries (+ cell_id, whole_code, code)
def moved_out_codes(db, unit_id, day) -> set[str]      # codes of whole_code rows from unit, cell not in unit on day
def moved_in_ids(db, unit_id, day) -> set[int]         # ids from rows to_unit=unit whose cell stands in unit on day
def moved_out_pairs(db, unit_id, day) -> set[tuple[str, str]]   # (sap_code, wc_raw) of moved_out lines
```

**Invariants:**
- `freeze` without `day` behaves exactly as today, except that it takes the lock.
- `split_at` followed by `at()` / `spans()` returns content deep-equal to before for every day. A version split in two must produce the same `wc_labor` floats.
- `align` gives `current_from == S` for every unit.

### WP2 — the follow engine
**Owns:** `backend/app/services/catalog_follow.py` (new). Also `backend/app/services/kept_answer.py` (add a module registry and `forget_all()`; `KeptAnswers.__init__` registers itself).

**May touch:** in `backend/app/services/cell_links.py`, only these functions:
- `_load`: read `vfx["siblings_was"]` into `LETTERS`;
- `history`: skip events with `vfx.catalog_mark`;
- `apply_due`: after `_apply` moves a `manager_id` column, set `ev.vfx = {**(ev.vfx or {}), "letter_before": was_letter}`, None included;
- `run_apply_due`: call `cell_register.after_commit()` after the commit, then `catalog_follow.kick()`;
- `register_jobs`: add `schedule_interval("catalog-follow", catalog_follow.run_sweep, minutes=1)`.

**i18n keys:** `logs.a.org.catalog_moved`, `logs.f.catalog_*`.

```python
FOLLOW_FROM = date(2026, 10, 6)
SWEEP_LOCK = 8_140_573_112_026_001             # session lock on a dedicated connection
BACKOFF_MIN = (1, 5, 15, 60, 240)              # then gave_up + DM

@dataclass(frozen=True)
class Transfer:
    cell_id: int; event_id: Optional[int]; src: Optional[int]; dst: Optional[int]
    home_from: date; letter_src: Optional[str]

@dataclass
class Plan:  code: str; transfers: list[Transfer]
             stayers: dict[int, dict[int, Optional[str]]]; whole: dict[int, Optional[int]]
             letter_dst: dict[int, Optional[str]]; sibling: dict[int, tuple[int, str]]
             named: list[dict]

@dataclass
class GroupResult: state: str; S: Optional[date]; rows: list[PPCatalogMove]; report: dict; impact: dict

class CatalogUnsettled(Exception): ...

def enabled(db) -> bool                                  # retro flag value startswith "done"
def build_plan(db, transfers: list[Transfer]) -> Plan    # §1.6 plan; reads committed + session state
def transform(contents: dict[int, dict], plan: Plan, *, current: bool) -> tuple[dict[int, dict], dict]
def identities(db, unit_ids, a: date, b: date) -> dict[tuple[int, date], dict[int, tuple]]
def follow_group(db, transfers: list[Transfer], *, kind: str, strict: bool = False,
                 dry: bool = False, now: Optional[datetime] = None) -> GroupResult
    # order: validate → build_plan → if nothing owned: state 'nothing' (no lock) →
    # lock(units, NS_CAT, try_) and lock(units, NS_QTY, try_) else 'busy' →
    # identities 'before' + wc_labor before → S = pp_catalog.align(units, h, "cell_move") →
    # window rewrite (split_at, transform per sub-interval, rewrite_version) →
    # current transform + ORM delta → cell letters + history stamps (§1.8) → flush →
    # identities 'after' → per-day rows (§1.7) → flush → conservation → PPCatalogMove rows (one per transfer)
    # + ev.vfx["catalog_follow"] summary. Caller commits (dry: caller rolls back). strict=True: any named
    # condition in §1.10 / retro guards, or conservation failure → state 'named', nothing written.
def run_sweep() -> None
    # no-op unless enabled(); SWEEP_LOCK; select applied manager_id events, value != prev,
    # effective_from >= FOLLOW_FROM, no row with that event_id, plus rows in (failed, busy) with
    # next_try_at <= now; per cell strictly in (effective_from, id) order; group by (effective_from, code);
    # Transfer.letter_src = vfx["letter_before"] if present, else vfx["wc_group_was"] if present,
    # else cell.wc_group. One SessionLocal per group; busy/failed upserted in their own transaction.
    # After each commit: cell_register.after_commit(); _forget_caches(). One Jurnal row per pass
    # (action_log.record_system("org", "org.catalog_moved", …, ≤40 detail rows)); one admin DM per
    # pass listing named/gave_up (routers.boot._recipients()).
def kick() -> None                     # run_sweep on a thread (non-blocking), used by run_apply_due
def unsettled(db, cell_ids: Iterable[int], day: date) -> set[int]
    # empty unless enabled(); cells with an applied manager_id event (eff <= day, >= FOLLOW_FROM,
    # value != prev) and no row in (moved, nothing, named, gave_up)
def _forget_caches() -> None           # kept_answer.forget_all(); shift_report._cache.clear(); leaders_kpi plan keep clear
```

**Invariants:**
- §1.2 holds.
- History before `h` is unchanged: deep-equal `at()` dumps; `wc_labor`, `wc_group_labor` and `cell_labor` for days before `h`.
- Σ conservation (§1.7).
- Every letter change is history-neutral.
- Running the sweep a second time is a no-op.
- At most one row per event.
- `dry=True` leaves the database fingerprint unchanged.

### WP3 — refusal and doors
**Owns:**
- `backend/app/services/catalog_refusal.py` (new);
- `frontend/src/utils/cellMoveRefusal.js` (new);
- `frontend/src/components/CellFormModal.jsx` (`cellWriteError` and the brigadir `FormField`);
- `frontend/src/pages/admin/VerifixSync.jsx` (`errText` and the together action);
- `frontend/src/pages/admin/AttendanceUpload.jsx` (`onMutError` reads `detail_raw`);
- i18n keys `cellMove.*`.

**May touch:**
- `backend/app/services/cell_register.py`: `set_unit` only;
- `backend/app/routers/profiles.py`: `CellPayload` (add `move_with: Optional[list[int]] = None`) and `_apply_cell_fields` only;
- `backend/app/routers/attendance_batch.py`: `update_cells` only;
- `backend/app/services/verifix_sync.py`: `apply_item`, the `brigadir_differs` branch only.

```python
def shared_positions(db, cell, to_unit: Optional[int], *, day: date,
                     leaving: Optional[Mapping[int, Optional[int]]] = None) -> Optional[Refused]   # §1.9
# cell_register.set_unit(db, cell, manager_id, *, src, by=None, vfx=None, apply_now=False, leaving=None):
#   new = manager_id or None; if new != cell.manager_id: eff,_ = opening_for_move(...);
#   bad = catalog_refusal.shared_positions(db, cell, new, day=eff, leaving=leaving); if bad: raise bad
#   vfx gains {"sap_code_at_request": cell.sap_code}
```

Door changes:
- **`_apply_cell_fields`**:
  1. Move the `wc_group` block above the `manager_id` block.
  2. Wrap every `set_unit` in `except cell_register.Refused as exc: raise HTTPException(exc.status, exc.detail())`.
  3. `move_with`: validate that each id is a cell in the row's current unit at the same norm code. Build `leaving = {each: new, row.id: new}` and call `set_unit` for each, then for the row.
  4. If a `manager_id` change is pending and this save changed `sap_code` or `wc_group`, re-run `shared_positions(row, pending value, day=pending from)` and answer 409 on a refusal.
- **`update_cells`**: first pass builds `leaving = {cell.id: bc.manager_id}` for every permanent move. Pass it to each `set_unit`. Wrap the loop: on `Refused`, `db.rollback()` and answer 409 with the detail; the whole PUT is refused.
- **`apply_item`**:
  - With `choice == "together"`: record every open `brigadir_differs` item whose cell is in the same X at the same code with the same `to_unit`, all with one `leaving` map, and mark them applied.
  - Without it: on `Refused("shared_positions")`, add `params.together_items = [those item ids]` and re-raise.

Frontend:
- **`cellMoveRefusal.js`**: `cellMoveRefusalText(raw, {t, tx, isAdmin}) -> {text, linkTo?, together?}`. It handles `shared_positions` (every kind) and `positions_need_unit`. Names go through `tx`; it shows the first 5 and then «+N».
  - For an admin it links to `productionLink({unit, tab:"positions"})`.
  - For anyone else it says «buni admin qiladi».
- **CellFormModal**: the refusal is the brigadir `FormField` `error`. When `params.staying` is not empty, show a secondary `Button` «Birga ko'chirish (…)» that re-sends the save with `move_with`.
- **VerifixSync**: the same text, plus a «Hammasini birga ko'chirish» action when `together_items` is not empty.
- **i18n** (uz / uz_cyrl / ru / en): `cellMove.shared`, `cellMove.unletteredCell`, `cellMove.split`, `cellMove.needUnit`, `cellMove.together`, `cellMove.askAdmin`, `cellMove.openPositions`, `cellMove.more`.

**Invariants:**
- Never refuse a withdrawal.
- Every door answers the structured 409, never a 500.
- A batch with the whole team leaving to one Y passes; the same team split over two Ys is refused.

### WP4 — SAP ingest, ABC import, archive card, re-key lists, writer races
**May touch:** in `backend/app/routers/production.py`, only these functions:
- `_scoped_faza`, `_unit_sap_scope`, `_ingest_for_manager`, `_rejoin_lines`, `_backfill_manager`, `upload_phase`;
- `import_catalog`, `_archived_lines`;
- `admin_create_catalog`, `admin_update_catalog`, `admin_bulk_update_catalog`, `admin_archive_catalog`, `admin_delete_catalog`, `admin_update_work_center`.

**Also owns:**
- in `backend/app/routers/profiles.py`, the `_MANAGER_ID_REFS` / `_MANAGER_REKEY_EXTRA_REFS` lists only;
- `backend/app/onetime_purge_test_units.py` (`_UNIT_TABLES`);
- `frontend/src/pages/admin/ProductionUpload.jsx`;
- in `frontend/src/pages/Production.jsx`, the catalog-writer error handling and the «Arxiv» card only;
- i18n keys `production.linesMoved`, `production.archive.joined`, `admin.prod.skippedMovedOut`, `admin.prod.keptMovedIn`, `admin.prod.emptyTargets`.

Changes:
- **`_scoped_faza(..., exclude: set = frozenset())`**:
  - `if not products: return []` comes first. A unit with no line that day is given nothing, whatever work-centre rows it has.
  - Skip any op whose `(sku, wc)` is in `exclude`.
- **`_ingest_for_manager`**:
  - First `pp_catalog.lock(db, [mid], ns=NS_QTY, shared=True)`.
  - `exclude = pp_catalog_moves.moved_out_pairs(db, mid, day) − {pairs in that day's catalog}`.
  - `_rejoin_lines` and `_backfill_manager` take the same shared lock.
- **`_rejoin_lines(..., commit: bool = True)`**: the existing commit happens only when `commit` is true.
- **`upload_phase`** response gains `empty_targets: [mid]` (a target whose catalog that day held no line) and `written: {mid: rows}`. `ProductionUpload.jsx` names them.
- **`import_catalog`**:
  1. Call `pp_catalog.lock(db, [manager_id])` before `is_empty` / `old_lines`.
  2. **Into X** (`moved_out`): before `new_keys` / `sheet_idents` are computed, drop sheet rows whose work centre normalises into `moved_out_codes(eff)` when X has no cell at that code on `eff`. Drop such codes' staffing rows too. Then drop sheet rows matching a moved-out snapshot entry on `join_ident`, and on `group_from` when the sheet has a «Группа» column; this match is limited by a Counter.
  3. **Into Y**: rows in `moved_in_ids(eff)` that are active and not matched by any sheet row's `join_ident` are excluded from the delete. They are re-sorted to `len(sheet)+k`, before the kept archived rows.
  4. Response gains `skipped_moved_out: [{name, work_center, to_unit_name}]`, `skipped_wc: [code]` and `kept_moved_in: [{name, work_center, from_unit_name}]`, shown on the import card.
- **`_archived_lines`**:
  - Look metadata up by id only: `PPProduct.id.in_(ids), active False`, with no `manager_id` filter.
  - Add `twin_live: bool`, true when the same day's catalog has an active line with the same join identity.
  - The «Arxiv» card leaves twins out of its head count, hides «Qaytarish» for them, and shows «birlashtirilgan».
- **Catalog writers that read a row first**: `row = query(...)`, then `pp_catalog.lock(db, [row.manager_id])`, `db.refresh(row)`. If `row.manager_id` changed, answer `409 {"code": "lines_moved", "message": …}`. Production.jsx shows `production.linesMoved` («reload»).
- **Re-key lists**: add `("pp_catalog_versions", "manager_id")` to `_MANAGER_ID_REFS`. Add `("pp_catalog_moves", "from_unit")` and `("pp_catalog_moves", "to_unit")` to `_MANAGER_REKEY_EXTRA_REFS`. Add `pp_catalog_versions` and `pp_catalog_moves` (both unit columns) to `_UNIT_TABLES`.

**Invariants:**
- A unit with no line receives 0 rows from an upload.
- An X import never re-creates a position that moved out.
- A Y import keeps a moved-in position its sheet lacks.
- A writer racing the follow either lands in the right unit or gets a 409.

### WP5 — dated leader scope and dated dashboard letters
**May touch:**
- in `backend/app/services/cell_lookup.py`: `sap_codes_for_leader`, `sap_groups_for_leader`, `cells_unit_for_leader`, `by_sap`;
- in `backend/app/routers/production.py`: `_resolve_manager_id`, `_leader_wc_scope`, `_leader_group_scope`, `_build_dashboard` (the `cells_at` / `wc_of_code` loop and the `by_sap` call), `_cell_letters`, and every call site of the three resolvers in `staffing_proof`, `get_dashboard`, `export_positions`, `get_dates`, `set_override`, `set_wc_override`, `save_staffing`, `save_reconciliation`, `get_raw`, plus the shared `NS_QTY` lock line at the start of `set_override`, `set_wc_override`, `save_staffing` and `save_reconciliation`;
- in `backend/app/services/leader_auto.py`: `_Ctx.unit_id`, `_Ctx.pairs`, `_Ctx.dashboard`.

```python
def sap_codes_for_leader(db, leader_id, day: Optional[date] = None) -> set[str]
def sap_groups_for_leader(db, leader_id, day: Optional[date] = None) -> set[tuple[str, Optional[str]]]
def cells_unit_for_leader(db, leader_id, day: Optional[date] = None) -> Optional[int]
    # day=None: today's code path, byte for byte. With day: cells whose leader on day == leader_id
    # (map_on "leader_id" over Cell.leader_id==id ∪ changed_since("leader_id", day)), their unit on day
    # (map_on "manager_id"), their letter letter_on(cell, day).
# production: _resolve_manager_id(payload, requested, db, day=None); _leader_wc_scope(db, payload, day=None);
#   _leader_group_scope(db, payload, day=None) — callers pass the request's parsed date.
# _build_dashboard / _cell_letters: cells = cell_links.with_letters_on(_unit_cells_on(...), day);
# by_sap(day=...): the (unit, code, group) key uses cell_links.letter_on(c, day) when day is given.
# leader_auto._Ctx: pass _as_date(self.date) to the three cell_lookup functions; in `dashboard`,
#   if catalog_follow.unsettled(db, leader's cell ids, day): raise catalog_follow.CatalogUnsettled
#   (evaluate() turns it into SKIPPED no_data, retried until GIVE_UP).
```

**Invariants:**
- With no letter or link event after `day`, every function returns exactly what it returns today.
- A leader's /production page for a day before their cell's move reads the old unit.
- A past day's dashboard groups use that day's letters.

### WP6 — retroactive one-shot
**Owns:** `backend/app/services/catalog_follow_retro.py` (new). In `backend/app/startup.py`: `schedule_catalog_follow_retro` and `_catalog_follow_retro_job`, using `_send_report_once` / `UNPRICED_DM_CHAT`. One `run(schedule_catalog_follow_retro)` line in `backend/app/main.py` and one call in `backend/passenger_wsgi.py`.

```python
FLAG = "catalog_follow_retro_2026_10_26_v1"; RECORD = "catalog_follow_retro_2026_10_26"
RETRO_APPLY = True             # decided 2026-10-26: applied in the first release (strict guards)
RETRO_LOCK = 8_140_573_112_026_002
MAX_CELLS, MAX_ROWS = 40, 5000
def pending(db) -> bool        # flag absent, or flag startswith "dry" and RETRO_APPLY
def run(db) -> dict            # under pg_try_advisory_xact_lock(RETRO_LOCK); re-read flag
def send(chat_id) -> None      # text + workbook from the stored RECORD (never re-runs)
```

`schedule_catalog_follow_retro` runs in the `run` phase. If `pending`, it calls `schedule_at("catalog-follow-retro", now + 180 s, _catalog_follow_retro_job)`, so the job fires only in the copy that holds the jobs lock, after the old worker has exited. It is never `later()`.

`run(db)` does the following:
1. **Candidates**:
   - every cell with an applied `manager_id` event (`value ≠ prev`, `effective_from ≥ FLOOR`);
   - plus every active coded cell whose code has, in some other unit X's current catalog, lines that are orphans there (no X cell at C, or lettered with a letter no alive X cell at C carries);
   - the snapshot is taken at the start.
2. **Evidence timeline per cell**, per day over `[FLOOR−7, today]`:
   - events (`value_on`), authoritative from 2026-10-12;
   - `LiveProjection.roster` (the unit whose closed copy filed the cell's `verifix_code`, if exactly one);
   - attendance majority: Σ `hc_weight` (or 1) of named rows with hours > 0 at that `verifix_code`, and the unit if it holds > 2/3;
   - action logs only to corroborate, never resolved by name.
3. **Decide**:
   - Exactly two runs (X, then Y = the current unit) gives a single hop with `h` = the event's `effective_from`, or else the first day of the Y run; the gap since the last X evidence must be ≤ 3 days, otherwise `day_unknown`.
   - A cell standing in Y since before FLOOR, with orphan lines that match it in exactly one X, gets `h = FLOOR`, reported as «moved before 6 Oct — followed from 6 Oct».
   - Otherwise `letter_src` = the event's `wc_group_was` / `letter_before`. When there is no event: the single orphan letter among X's active lines at C, or None when X has no cell at C.
4. **Named and skipped**:
   - `chain` (more than one hop, including a round trip), `from_unknown`, `day_unknown`;
   - `letter_ambiguous`, `shared_lines`, `y_has_lines` (Y has active lines at C that no Y staying cell claims and that do not match a moved line's join identity);
   - `window_cells_moved` (another cell's unit or archive state at (X,C) or (Y,C) changed within `[h, today]`), `letters_after`;
   - `archived`, `no_code`, `conservation`, and `volume` (more than MAX_CELLS cells or MAX_ROWS per-day rows: nothing is applied).
5. Each applicable cell runs `catalog_follow.follow_group(db, [Transfer], kind="retro", strict=True, dry=not RETRO_APPLY)` in its **own transaction**: a dry run rolls back; an apply commits.
6. Every considered event gets a final row (`moved` / `named` / `nothing` / `busy`; busy is retried by the sweep). Idempotency comes from these rows, not from the flag.
7. Then write the flag (`dry:<n>` or `done:<moved>/<named>`) and the RECORD in one transaction.
8. DM to `UNPRICED_DM_CHAT` behind `<FLAG>_dm_<mode>`. Workbook sheets:
   - «Ko'chirildi» (or «Rejada» in dry mode): cell, code, X→Y, `h`, `S`, day source, lines, joined, work-centre row, letters, re-key counts;
   - «Qoldirildi»: reason and evidence;
   - «Dalil»: per cell and day, the event, roster and attendance units;
   - «Ta'sir»: per unit-day, plan/actual minutes and typed people before → after, with a «yacheyka odamlari kiritilmagan» flag.
   - The text names cells moved before 12 Oct whose per-cell figures before `h` still show them in Y (no link history exists for them).

Delete this module, its startup pair and both calls once the flag reads `done` and the DM has landed.

### WP7 — verification harness
**Owns:** `backend/tests/test_catalog_follow.py`, `backend/tests/catalog_follow_fixtures.py`.

- Use `tests.pg_scratch.ScratchDB` (`SAFIA_TEST_PG`). Patch `app.database.SessionLocal` to the scratch session factory. Call `cell_links.forget()` and `cell_archive.forget()` between steps.
- Run with: `SAFIA_TEST_PG=postgresql://postgres@localhost:5432/postgres backend/venv/bin/python -m unittest tests.test_catalog_follow`.
- **Fixture builder**:
  ```
  unit(id, shift); cell(code, unit, sap, letter); line(unit, sap, name, wc, labor, letter, active=True, auto_fill=True)
  wc_row(unit, code, shtatka); daily(unit, d, sap, wc, plan, actual, overrides…); line_daily(...); pin(unit, d, wc, group, people, shtatka)
  event(cell, to, eff, applied=True); version via pp_catalog.freeze(day=…)
  ```
- **`fingerprint(db, units, a, b)`**: `json.dumps(sort_keys=True)` of
  - `pp_catalog.spans` dumps per day (LINE_FIELDS / WC_FIELDS, in order);
  - `zagruzka_source.wc_labor`, `wc_group_labor`, `cell_labor` (with every cell of the units), `typed_pins`;
  - `_build_dashboard(...)` `rows` / `totals` / `work_centers` per unit-day;
  - every row of `pp_line_daily`, `pp_daily`, `pp_work_center_daily`.

---

## 4. Invariants and test cases (WP7 asserts all of them)

| # | Scenario | Assertions |
|---|---|---|
| T1 | No events; run the sweep | fingerprint identical; no move row |
| T2 | Live move, c alone at C in X, Y empty, values on D | days < D identical for X and Y; on D, ids are in Y's `at` and not in X's; per-day Σ minutes over X+Y equal; per-line values, pins, work-centre row and штатка in Y; X lists no unknown SKU on D; T-unique (§1.2) over D−3…D+3 |
| T3 | Lettered: X has c(A) and d(B); Y has y1(A) | c gets B; c's A lines take B in Y; `letter_on(c, D−1) == "A"`; d and its lines untouched; refusal not raised |
| T4 | Refusal | X: c(A), d(B), one unlettered active line → `shared_positions` from `set_unit`, the /cells PUT (409), «Doimiy qilish» (409, nothing written) and the Verifix tap. After lettering → passes. A withdrawal passes. Both cells to one Y via `move_with`/`leaving` → passes; to two Ys → `split`; clearing the brigadir of a cell with lines → `positions_need_unit` |
| T5 | Lone unlettered y1 in Y, Y lines unlettered, Y whole pin on D | y1 gets a free letter; Y's lines take it from D; pin becomes a group pin; `letter_on(y1, D−1)` is None; `cell_labor[y1, D]` equals y1's own minutes; days < D identical |
| T6 | Join: y1(A) alone owns m; c brings an identical `takes_sap` line | copy archived (`archived_by` «Yacheyka ko'chishi», sorted last); m unlettered; Y's line keys unchanged; cell_labor y1/c 50/50; Y's unit minutes unchanged; X lost c's minutes |
| T7 | Manual identical line (`auto_fill` False) | not joined; moves live as a twin; both typed values still counted; Y's group override exploded |
| T8 | Swap a(X,A) ↔ b(Y,A) at one code, one opening | lines swap; work-centre rows stay put; no IntegrityError; no join |
| T9 | Late: cfY = D+1 (freeze Y `day=D+1`) before the sweep | `S == D+1`; Y's version for D holds the moved entries; X's version for D lacks them; T-unique; per-day rows moved from D |
| T10 | Retro single hop, `h` = 8 Oct, X imports mid-window (ids re-created) | every day in `[h, today]` counts c's lines only in Y (both id sets); days < h identical; impact recorded |
| T11 | Retro guards | each `named` kind is produced by its fixture and writes nothing |
| T12 | Retro dry | fingerprint identical; flag `dry:n`; sweep stays off |
| T13 | SAP guard | a unit with no line, or with only a work-centre row, gets 0 rows; `empty_targets` lists it |
| T14 | Imports | X import of an old sheet: moved-out rows and work-centre code skipped, a staying twin kept. Y import without the moved-in line: kept with the same id |
| T15 | Writer race (two sessions) | an edit holding X's `NS_CAT` → follow `busy`, retried; after the follow, a stale edit → 409 `lines_moved` |
| T16 | Idempotency | sweep run twice → second pass is a no-op; retro run twice → no-op; one row per event |
| T17 | Dated scope (WP5) | a leader's dashboard for D−1 reads X with c's lines; for D reads Y |
| T18 | Letter neutrality | with `with_letters_on` patched to the identity (readers that do not date letters), days < h are still identical |

---

## 5. Open risks and operator questions

- **Q1 — join with a third cell.** When Y has y1(A, owns m) and y2(B), and c joins m, unlettering m hands y2 a share of m too. The default follows the draft's reading of ruling 5 (unletter) and names it `join_spread`. The alternative is keeping m's letter, in which case c shares nothing. The operator should confirm.
- **Q2 — clearing a brigadir.** Clearing the brigadir of a cell that owns positions is refused (`positions_need_unit`); no ruling covers this. The alternative is archiving the positions in X with a `to_unit NULL` record and restoring them at the next move.
- **Q3 — release 1 is dry for the retro** (`RETRO_APPLY = False`). While it is dry, live follows are off and moves land as they do today. The door refusal is active from release 1. Flipping one constant in release 2 applies the retro and turns the sweep on. If the operator wants the retro applied at once, set `RETRO_APPLY = True` in release 1.
- **Cells moved before 12 Oct.** They have no link history, so per-cell readers show them in their new unit for every day before `h`. Their catalog follows from `h`, but per-cell figures before `h` stay as they are today (ruling 3). The DM names them.
- **Multi-hop and round-trip histories** are not followed by the retro; they are named.
- **Version rewrite** is a deliberate exception to "a version is never edited". It is audited on the move record. CLAUDE.md, the `PPCatalogVersion` docstring and the «A catalog edit counts FROM NOW ON» section must say so.
- **Release note** (all deliberate; announce them):
  1. Past загрузка, Plan bajarish and shift-report figures change from each moved cell's move day, closed days included.
  2. X's past /production group display changes for cells that lost a letter in a move since 12 Oct (dated letters fix a defect that already exists).
  3. Units with no catalog line no longer receive the plant file.
  4. Leaders' past /production days read the unit their cell stood in then.
  5. Cell moves with shared positions are refused.
- **Throughput.** A long SAP upload holds shared `NS_QTY` locks, so a follow at that moment is retried for minutes. Between a landing and its follow (≤ 1 minute) the figures show the cell in Y with its lines still in X. `unsettled` keeps the leader auto-checks from judging that gap.
- **Y snapshot differs from X's** (`y_snapshot_kept`): this can shift a unit's minutes after a live move. It is reported, never blocked.
- **VERSION**: one MINOR for the whole release. No open tab breaks: the new response fields are additive, and the new 409s are structured and translated.