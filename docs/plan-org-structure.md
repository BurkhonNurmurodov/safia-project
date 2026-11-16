# Plan — the production structure: Factory → Shift → Brigade → Department → Workstation → Cell

The operator, 2026-11-16: «New structure of the production: Factory → Shift →
Brigade → Department → Workstation → Cell. Shift has shift-managers, Brigade has
a supervisor (brigadir), and cell has a leader. The Workstation is the cells with
the same SAP code — inside it one or several groups work; the groups are the
cells (its A group is one cell, B another).»

And later that day, how Verifix holds it:

- Production begins at «Фабрика › Производство › Производственное управление».
- Inside it, the nodes that start with «Отдел сменного производства» are the
  **Uchtepa** plant: «– 1 смена» is the 1st shift, «– 2 смена «А» блок» and
  ««Б» блок» are TOGETHER the 2nd shift, «– 3 смена» is the 3rd shift. The 3rd
  shift's cells are added, but **its загрузка is not calculated for now**.
- «Производственное управление (Келес)» inside it is the **Keles** plant. It
  has no shift — **everything there is the 1st shift**.
- Inside a shift, the brigades are the nodes that start with «Цех», and the
  name says who the brigadir is.
- **Departments are NOT in Verifix.** A department is a group of cells; the
  operator's report on them comes later.

A DESIGN, not built. Read from production the same day through the report door
(four SELECTs, approved by Burkhon): the Verifix org read (`live_verifix_reads`
key `org`), the cells register, the brigades, the shift-managers and
`pp_work_centers`; and «Бригадиры.xlsx», every production brigadir of shifts 1
and 2 with the departments they run.

## What production holds today

```
Фабрика › Производство › Производственное управление
  ├ Отдел сменного производства – 1 смена          970 people   Uchtepa · shift 1   — shift-manager Adi Ro'ziyev
  ├ Отдел сменного производства – 2 смена «А» блок 288          Uchtepa · shift 2 A — Umarbek Karimov
  ├ Отдел сменного производства – 2 смена «Б» блок 292          Uchtepa · shift 2 B — Xurshid Rajabov
  ├ Отдел сменного производства – 3 смена           74          Uchtepa · shift 3   — Ikramxoja Shaysayev
  │   └ Цех – 4 SUVONOV ELSHOD …                                BRIGADE (its brigadir in the name, seated in it)
  │       └ 4311 Оф.Тортов.глаз                                 CELL (the 4-digit code)
  ├ Производственное управление (Келес)             88          Keles · shift 1     — Saidakbar Ziyayev
  │   ├ Цех – AXMEDOVA MUNISA …  › 1611 …
  │   └ АХО (Келес) › 0036 …
  └ Отдел внутренней логистики, Корзинка, Алмата Фабрика …      not production
Фабрика › Производство › Отдел АХО › Мойка 1 смена › 0020 …    not production
```

- **Shifts.** Uchtepa has three: 1, 2 (two blocks, А and Б, each with its own
  Verifix node and its own shift-manager), 3. Keles has none, so it is shift 1.
  Ours is an integer 1 | 2 on `managers.shift` and `role_profiles.shift`.
- **Brigades.** 30 `managers` rows, 22 of them in the structure: 19 on
  Uchtepa's shifts, Turdiqulov Mirza's «Цех -22» (the cold rooms — under shift 1
  in Verifix, no shift here), and two at Keles (Axmedova Munisa's «Цех»,
  Axadxo'jayeva Kamila's АХО (Келес)). 7 are service brigades outside it (АХО,
  supply, dispatch, B2B) and 1 is archived. **Every brigade's cells sit in ONE
  shift** except Aripova Manzura's (8 on shift 1, 0822 on shift 3), so a
  brigade's shift is a single fact. Verifix's «Цех» nodes match ours one to one
  except the mismatches at the end.
- **The 3rd shift** is two brigades with no brigadir in Verifix — «Цех -14»
  (2321, 2323, 7321, 7323) and «Цех -20» (0822, 2531, 7231). All seven cells are
  already in the register (the Verifix sync made them); what is missing is
  their brigades: Цех-14's four are on Murodali Ochilov (our shift 2, acting —
  and they are his only cells), 0822 is on Aripova Manzura (shift 1), 2531 and
  7231 are on nobody.
- **Cells.** 213 live (4 archived), all tied to their Verifix division; **166
  are production** — Uchtepa shift 1: 92, shift 2: 56 (А 32, Б 24), shift 3: 7;
  Keles: 11. Of all 213, 186 have a brigade, 146 a SAP code, 42 a group letter.
- **Workstations = (brigade, SAP code): 122 today.** 114 SAP codes sit on live
  cells — 94 on one cell, 20 on several. 12 codes have several cells in ONE
  brigade (lettered: A2894 is 6 cells, A–G, on Ibragimova Sayyora's). 8 codes
  span brigades: 7 are the same station worked by shift 1 and shift 2 (B2942 =
  9411 s1 + 9423 s2; B2943 = 9412 A / 9413 B on s1 + 9425 A / 9426 B / 9427 C on
  s2), and A0161 is on 0822 (Uchtepa) and 1611 / 1622 (Keles).
- `pp_work_centers` — `(manager_id, code)` unique, штатка and capacity — is
  already a workstation register, with 19 rows for 4 brigades.
- **Departments**: none in Verifix (the operator). The brigadirs' sheet already
  shows two things the design must allow: one department named on several
  brigades («Оформление тортов 1.23» on Suvonov s1 and Akbarov s2), and one
  workstation split between two departments by its groups (A2733: «Заготовка
  Эклер ПФ» is 7313, group A; «Оформление Эклер ГП» is 7315, group B).

## The constraint that shapes the design

`managers.id` IS the brigade key: `manager_id` appears on 3,746 lines in 175
files (attendance, every `pp_*` table, concerns, KPIs, the загрузка). So the
brigade table stays `managers` and nothing is re-keyed. Every new level is a
table with its own id; every parent link is DATED like `cell_link_events`, so
a past day reads the structure of that day (the 13 Nov ruling: a record stays
on that day's person and unit). Migrations are additive only (the
zero-downtime rule), and nothing reads a new column until its reader is moved
on purpose — no figure changes on the day the schema lands.

## The model

```
factories            exists
 └ shifts            NEW      one row per Verifix shift node: plant · shift no · block   people: shift-managers
    └ managers       exists   = the BRIGADE  + shift_id (dated) + vfx_division_id        people: brigadir (dated, NEW)
       └ departments LATER    a group of cells — built when the operator's report lands
          └ pp_work_centers  exists = THE workstation register (brigade, SAP code) + names
             └ cells exists   manager_id · sap_code · wc_group (the group letter)        people: leader (dated, exists)
                              + department_id (dated, LATER)
```

Every arrow above the cell is a column ON the cell or on its brigade, never a
table of its own: a cell names its brigade, its department and (through its
SAP code) its workstation, and the tree is read from the cells. That is what
lets one department span brigades and one workstation span two departments
without a single row that has to be kept in step.

### `shifts` (new)

```sql
CREATE TABLE shifts (
  id              serial PRIMARY KEY,
  factory_id      int NOT NULL REFERENCES factories(id),
  no              smallint NOT NULL CHECK (no BETWEEN 1 AND 3),   -- THE shift
  block           varchar(2),            -- 'A' | 'B' inside Uchtepa's shift 2, else NULL
  name_uz text, name_uz_cyrl text, name_ru text, name_en text,
  vfx_division_id varchar(32) UNIQUE,    -- its Verifix node
  day_start       varchar(5),            -- "HH:MM"; end <= start ⇒ crosses midnight
  day_end         varchar(5),
  sort_order      int NOT NULL DEFAULT 0,
  archived_at     timestamptz,
  UNIQUE (factory_id, no, block),
  UNIQUE (id, factory_id)                -- the target of the brigade's composite key
);
```

| row | plant | no | block | Verifix node |
|---|---|---|---|---|
| 1 | Uchtepa | 1 | — | 3943 «Отдел сменного производства – 1 смена» |
| 2 | Uchtepa | 2 | A | 3942 «… – 2 смена «А» блок» |
| 3 | Uchtepa | 2 | B | 3944 «… – 2 смена «Б» блок» |
| 4 | Uchtepa | 3 | — | 3945 «… – 3 смена» |
| 5 | Keles | 1 | — | 6701 «Производственное управление (Келес)» — the plant node is its one shift |

- **The shift is `no`; a block is half of one.** «2-smena» on a page is rows 2
  and 3 together. They are two rows, not one, because each block has its own
  Verifix node and its own shift-manager — so a block is where a brigade and a
  shift-manager hang, and the shift is what every page groups by.
- **The rows carry the plant's tie too.** Uchtepa is not one Verifix node (its
  parent «Производственное управление» also holds Keles), so the plant is read
  through the shift row a brigade's «Цех» sits under. `factories` gains nothing.
- `day_start` / `day_end` replace the two app settings `cell_hours_shift_1` /
  `_2` (shift 3 gets its own): a cell's blank clock inherits its brigade's shift.

### `managers` — the brigade

```sql
ALTER TABLE managers
  ADD COLUMN shift_id        int,
  ADD COLUMN vfx_division_id varchar(32),            -- the «Цех» node
  ADD CONSTRAINT fk_managers_shift FOREIGN KEY (shift_id, factory_id)
      REFERENCES shifts (id, factory_id),
  ADD CONSTRAINT ck_managers_shift_plant CHECK (shift_id IS NULL OR factory_id IS NOT NULL);
```

- **Which brigade is where**: a «Цех» under a «Отдел сменного производства …»
  node is in that shift at Uchtepa; anything under «Производственное управление
  (Келес)» (its «Цех» and АХО (Келес)) is Keles shift 1. Nothing else is in the
  structure: `shift_id` NULL = a service brigade outside production.
- **The plant stays on `managers.factory_id`** (168 lines read it through
  `factory_scope`, unchanged), and the composite key makes Postgres itself
  refuse a brigade whose shift is in another plant. One fact, checked by the
  database, not two copies.
- `managers.shift` (the integer) stays as a mirror of `shifts.no` for its 80
  readers until each moves to `shift_id`; it gains the value 3.
- **The 3rd shift's загрузка is off through the switches that exist**: its
  brigades get «Zagruzka hisoblanadi» off (`managers.zagruzka_on = false`) and
  their cells stay out of the load (`cells.in_load`). Nothing new is built for
  it, and turning it on later is the same two switches.
- `vfx_division_id` ties the UNIT to its «Цех» node. Today only the brigadir
  PERSON is tied (`vfx_employee_id`), which is why a unit whose brigadir changed
  cannot be followed (the 24 Oct swaps). Two of ours may tie to one node (Цех-4,
  below).
- A brigade with no brigadir (Цех-20) is a `managers` row named after its node
  («Цех-20»), with no login until Verifix seats a brigadir in it.

### Dated brigade links (new) — `unit_link_events`

The twin of `cell_link_events` for a brigade, read by the same rule (the value
on day D is the latest event with `effective_from` ≤ D; before every event, the
first one's `prev`); the `managers` columns stay the current mirror, put there
by `apply_due`.

```sql
CREATE TABLE unit_link_events (
  id             serial PRIMARY KEY,
  manager_id     int NOT NULL REFERENCES managers(id) ON DELETE CASCADE,
  field          varchar(16) NOT NULL,     -- shift_id | brigadir
  value          int,                      -- shift_id
  prev           int,
  person_vfx     varchar(32),              -- brigadir: the Verifix employee id (NULL for an acting one)
  person_name    text,                     -- brigadir: the name as of that day
  effective_from date NOT NULL,
  effective_at   timestamptz NOT NULL,
  applied_at     timestamptz,
  src            varchar(16) NOT NULL,     -- verifix | manual | seed
  by_name        text,
  vfx            jsonb,
  created_at     timestamptz DEFAULT now()
);
CREATE INDEX ix_unit_link_events ON unit_link_events (field, manager_id, effective_from, id);
```

- **The brigadir is the person the «Цех» node names, and Verifix seats there
  with a brigadir's job.** The seat is what the sync follows (an id, not a
  spelling); the name in the node is the check, and a node whose name and seat
  disagree goes to the operator, never guessed. A brigadir the platform has
  that Verifix does not (an acting one — Erkanboyev, Niyozov) is set by hand,
  `src` manual.
- It is the dated brigadir per unit the 13 Nov ruling asks for («a past day
  names the unit by THAT day's brigadir»). Who may LOG IN as the brigade stays
  on the `managers` row, as today; splitting the supervisor person from the unit
  is a separate piece of work.
- Shift-managers: `role_profiles.shift_id` (FK `shifts`, so a block) replaces
  `shift` + `factory_id` there, dated through the same table keyed by profile —
  a `profile_id` column on it. Their REACH does not change: `shift_scope` gives
  every shift-manager every unit; the shift is a record of where they work.

### Departments — later, from the operator's report

Not in Verifix. A department is a group of cells, and the operator will send a
report on them. The table is built when it lands; the shape it will take:

```sql
CREATE TABLE departments (
  id          serial PRIMARY KEY,
  factory_id  int NOT NULL REFERENCES factories(id),
  code        varchar(16),
  name_uz text, name_uz_cyrl text, name_ru text, name_en text,
  sort_order  int NOT NULL DEFAULT 0,
  archived_at timestamptz
);
ALTER TABLE cells ADD COLUMN department_id int REFERENCES departments(id);   -- dated: cell_link_events field 'department_id'
```

- **On the CELL**, because a department is a group of cells and can take one
  group of a workstation (A2733). The «brigade → department» level is read from
  the cells beneath it, never stored.
- Whether one department row serves several brigades (as the sheet's codes
  suggest) or each brigade has its own is the report's to say; the second adds
  a `manager_id` to the row and changes nothing else.
- Kept on the platform once seeded: a department picker on the cell form and a
  «Bo'limlar» register for admins.

### Workstations — `pp_work_centers` becomes THE register

```sql
ALTER TABLE pp_work_centers
  ADD COLUMN name_uz text, ADD COLUMN name_uz_cyrl text,
  ADD COLUMN name_ru text, ADD COLUMN name_en text;
-- + a row for every (brigade, normalised SAP code) a live cell carries (106 missing)
```

- Already keyed `(manager_id, code)` and already holding штатка / capacity —
  a parallel table would be a second answer to one question.
- **Cells join it by key, not by a foreign key**: `(manager_id, normalised
  sap_code)`, the key `wc_group.cells_by_wc`, `catalog_follow` and the dated
  readers already use. A cell's brigade move is dated; with a key, its
  workstation follows the move by itself, and past days keep the old one.
- **The group letter stays `cells.wc_group`**. Its rule is already «inside one
  unit and one code, one cell, or every cell lettered and no two alike» —
  which is now «unique inside one workstation».
- **A workstation belongs to ONE brigade.** The same SAP station worked by
  shift 1 and shift 2 (7 codes today) is two workstations sharing a SAP code;
  «the same machine on both shifts» is a `GROUP BY sap_code` across them.
- A cell with no SAP code belongs to no workstation and hangs directly in its
  brigade (16 production cells today — see the end).
- Never tied to Verifix — ours, like departments.

### Every level against Verifix

| Level | Verifix | Tie |
|---|---|---|
| Factory | read through the shift row | — |
| Shift (block) | «Отдел сменного производства – N смена [«А»/«Б» блок]»; Keles: «Производственное управление (Келес)» | `shifts.vfx_division_id` (new) |
| Brigade | «Цех …» under a shift node, or under Keles | `managers.vfx_division_id` (new) |
| Department | not in Verifix | ours, from the operator's report |
| Workstation | not in Verifix | ours: `pp_work_centers` |
| Cell | the coded subdivision | `cells.vfx_division_id` (exists) |
| Shift-manager · brigadir · leader | the employee seated in the node | `vfx_employee_id` (exists) |

The sync's pass gains one step: a cell's parent «Цех» names its brigade, the
«Цех»'s parent names the brigade's shift, the seat in the «Цех» its brigadir. A
change there lands as a dated event, exactly as a cell's brigadir change does
now (`cell_links.opening`).

## Order of work

1. **Schema** — `shifts`, `unit_link_events`, the new columns. A `run` step at
   boot (a request needs the tables), additive only.
2. **Seed and tie** — a `later` step: the five shift rows; each production
   brigade's `vfx_division_id` from the «Цех» its cells sit under (majority)
   and `shift_id` from that node's parent; the 3rd shift's brigades with their
   загрузка off; the 106 missing `pp_work_centers` rows (16 of the 122
   workstations have one; 3 rows name a code no live cell carries); one `seed`
   event per brigade for today. Every mismatch below goes to the operator in a
   report first, never guessed.
3. **The sync follows the new ties**, so a move in Verifix moves the brigade,
   its shift or its brigadir from its day on.
4. **Readers move one at a time** — the shift-scoped pages first (`/shift-daily`,
   the shift report, `/live`, the shift filter): S1 · S2 · S3, with S2's blocks
   as a finer pick, and a past day names its brigade by that day's brigadir.
   Each move is its own change; `managers.shift` stays until the last one.
5. **Departments**, once the operator's report lands.

## What production showed that the tie will hit

1. **Цех-4 is two brigades here**: Suvonov Elshod (43xx, 45xx — оформление) and
   Erkanboyev Zafarjon, acting, a leader in Verifix (39xx, 41xx, 42xx —
   заготовка, сливки, кремы). The brigadirs' sheet lists him as a brigadir too,
   so both tie to the one node until Verifix has a second «Цех».
2. **Цех-8 «RAXIMOVA KAMOLA»** (9411–9414) — Raximova is seated there — runs as
   Niyozov Izzatilla, acting; our «Raximova Kamola» runs Цех-11 «MIRMAXMUDOVA
   MUNIRA», where nobody is seated. The sheet gives Raximova «Пончик A2743»
   (9414) and «Мясной отдел», and Niyozov «Мясной отдел» alone.
3. **Murodali Ochilov** holds Цех-14's four cells (shift 3) as our shift-2
   brigade, and the sheet lists him on shift 2. If he is shift 3's brigadir,
   his brigade ties to Цех-14 and his загрузка stops from that day; if not,
   Цех-14 is a new brigade with no brigadir and his row has no cells left.
4. **0822** (Цех-20, shift 3) is on Aripova's shift-1 brigade, so it leaves her
   загрузка from the day it moves to Цех-20.
5. **Shift-managers**: Verifix seats Umarbek Karimov in shift 2 «А» (ours:
   shift 1) and Ikramxoja Shaysayev in shift 3 (ours: shift 2); Adi Ro'ziyev
   has no plant here; Alimov Bekzod is a «Начальник смены» in Verifix with no
   profile here.
6. **Keles**: Axmedova Munisa is seated in her cell 1611, not in her «Цех»
   node, so the seat rule reads her through the cell. Axadxo'jayeva Kamila's
   brigade is at Uchtepa here, while its cell (0036) is Keles's АХО — it moves
   to Keles shift 1.
7. **Turdiqulov Mirza's «Цех -22»** (the cold rooms 1511, 3411, 3511, 8011) has
   no shift here; Verifix has it under shift 1.
8. **A0161** is on 0822 at Uchtepa and on 1611 / 1622 at Keles — a SAP code
   across two plants, most likely a typo.
9. **16 production cells have a brigade and no SAP code** (0036, 0612, 1511,
   3411, 3511, 4124, 4324, 4811, 6611, 6621, 6711, 8011, 8218, 8411, 8421,
   9424) — no workstation for them.
10. **Four production cells have no brigade**: 2531 and 7231 (Цех-20, item 4's
    brigade), 0037 and 1614 at Keles. The other 23 brigade-less cells are АХО,
    dispatch and warehouse zones outside the structure.

## Open — the operator's decisions

1. **Is Murodali Ochilov the 3rd shift's brigadir (Цех-14)?** (item 3)
2. **Who runs Цех-8 and Цех-11** — Raximova and Niyozov? (item 2)
3. **The same SAP station on two shifts = two workstations**, one per brigade?
   The default here, since the tree puts a workstation under one brigade.
4. Departments — waiting for the report.
