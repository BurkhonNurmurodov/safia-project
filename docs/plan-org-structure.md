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
  ├ Производственное управление (Келес)             88          KELES — a plant of its own, never part of Uchtepa · shift 1 — Saidakbar Ziyayev
  │   ├ Цех – AXMEDOVA MUNISA …  › 1611 …
  │   └ АХО (Келес) › 0036 …
  └ Отдел внутренней логистики, Корзинка, Алмата Фабрика …      not production
Фабрика › Производство › Отдел АХО › Мойка 1 смена › 0020 …    not production
```

- **Shifts.** Uchtepa has three: 1, 2 (two blocks, А and Б, each with its own
  Verifix node and its own shift-manager), 3. Keles has none, so it is shift 1.
  Ours is an integer 1 | 2 on `managers.shift` and `role_profiles.shift`.
- **Brigades.** 30 `managers` rows, 22 of them in the structure — **Uchtepa
  20**: 19 on its shifts and Turdiqulov Mirza's «Цех -22» (the cold rooms —
  under shift 1 in Verifix, no shift here); **Keles 2**: Axmedova Munisa's
  «Цех» and Axadxo'jayeva Kamila's АХО (Келес). 7 are service brigades outside
  it (АХО, supply, dispatch, B2B) and 1 is archived. **Every brigade's cells sit in ONE
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
  are production** — **Uchtepa 155** (shift 1: 92, shift 2: 56 — А 32, Б 24 —
  shift 3: 7) and **Keles 11**. Of all 213, 186 have a brigade, 146 a SAP code, 42 a group letter.
- **Workstations by (brigade, SAP code): 122 today.** 114 SAP codes sit on live
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

## Actual and official people (the operator, 16 Nov)

Verifix is the DOCUMENT. For some brigades and cells the person it lists is
not the one actually working: a person runs a brigade or a cell first and is
put on the document only after passing their test. Two of today's brigades are
run by people Verifix lists as leaders — Erkanboyev Zafarjon and Niyozov
Izzatilla — and some cells are the same. The rulings, asked and answered:

1. **Two people per brigade and per cell: the ACTUAL one and the OFFICIAL
   one.** Cells already have the pair — «Boshqaruvchi» (`leader_id`, who runs
   it) and «Egasi» (`owner_id`, whom Verifix seats). A brigade gets the same
   pair: the actual brigadir and the official (Verifix) brigadir.
2. **Every work page shows the ACTUAL person** — the checklist, «Smena
   kunligi», «Zagruzka», «Ojidaniya», «Brigadirlar reytingi», reports. They are
   responsible for that brigade or cell, whatever the document says.
3. **Every KPI goes to the OFFICIAL person** — all of «Liderlar KPI» and all of
   «Brigadirlar KPI» (its turnover gate included: a cell is credited to the
   brigadir Verifix lists over it, which settles HR's open «Verifix supervisor
   vs the cells register» in favour of Verifix). «KPIs are an official topic.»
4. **An actual person set by hand stays until Verifix lists someone NEW** for
   that brigade or cell. The 10-minute sync never puts the document person
   back while the document is unchanged; the day Verifix names a new person
   (the acting one after their test, or anybody else), that person becomes the
   actual one too, from that day.
5. **A leader acting as brigadir holds TWO profiles**: their leader profile
   and a brigadir (o'rnida) profile. They owe the leader's work
   (checklist, cell) until Verifix makes them an official brigadir; from that
   day the leader profile owes nothing.
6. **When Verifix makes an acting person official, only the label changes** —
   «o'rnida» becomes official from that day, picked up automatically
   (`supervisor_kind` / `leader_kind`, which already say this). Their past days
   stay theirs, nothing is re-scored.
7. **The 35 cells whose actual leader is not their Verifix seat credit nobody
   in the KPIs** — official only, confirmed («Yes, official only»).
8. **The cases, as they stand on the platform today, are right**: Niyozov
   Izzatilla actually runs Цех-8's bakery cells (9411–9414) and Raximova Kamola
   Цех-11's; Murodali Ochilov actually runs Цех-14, which works the 3rd shift
   but **is counted as the 2nd** (20 Nov — so its загрузка counts like any
   shift-2 brigade's); **0822 stays with Aripova Manzura** on shift 1 and
   keeps counting, though Verifix puts it in Цех-20 on shift 3. So a cell's
   shift is its ACTUAL brigade's shift, and the actual brigade of a cell can
   differ from its Verifix «Цех» (ruling 4 then holds it until Verifix moves
   the cell).
9. **A shift-manager's shift stays the platform's**, set by hand, whatever
   Verifix seats them in. Alimov Bekzod, a «Начальник смены» in Verifix, is an
   ADMIN profile here — not a shift-manager to create.
10. **Two brigades on one «Цех»: a new official replaces only the brigade the
    old official ran.** Verifix naming a new brigadir for Цех-4 replaces
    Suvonov Elshod; Erkanboyev Zafarjon keeps his brigade until Verifix lists
    someone for it. As a rule: where ONE brigade ties to a «Цех», ruling 4
    holds as is (Niyozov's Цех-8 goes to whoever Verifix names next); where
    several do, the new official replaces only the brigade whose actual
    brigadir was the old official.
11. **When ruling 4 goes live, the waiting suggestions apply too**: every
    «seat_changed» item already on «Verifix sinxron» (a Verifix seat that
    arrived under a hand-picked «Boshqaruvchi») makes the seat the actual
    leader from that day, like every change after it. That moves people, so
    the build lists them for the operator before the day it lands.
12. **Цех-22 is shift 1, all four cells** — the «2 смена» in two cold rooms'
    names is a name; the brigade's place in Verifix decides.

What follows from them:

- A brigade whose official brigadir actually runs another one (Raximova Kamola:
  Verifix seats her in Цех-8, she runs the Цех-11 cells here) shows her name on
  Цех-11's pages and gives her Цех-8's KPIs. Each figure goes where its rule
  sends it; neither is a mistake to fix.
- Ruling 4 is one rule for cells and brigades: a hand pick is an event; a
  Verifix change is an event; the later one wins. The sync compares the
  document with its LAST read, never with the actual person.

What production does today against them (read 16 Nov, approved by Burkhon):

- **Already so — two profiles**: Erkanboyev Zafarjon (leader
  profile running 4112 + brigade «Erkanboyev Zafarjon», o'rnida) and Niyozov
  Izzatilla (leader running 9412 + brigade «Niyozov Izzatilla», o'rnida). A
  THIRD case: Murodali Ochilov — leader running 4123 in O'rozov Asqar's brigade
  + brigade «Murodali Ochilov», o'rnida, which holds Цех-14 (shift 3); his two
  profiles sit on different accounts. All three leader profiles are live, so
  they owe the leader's work (ruling 5).
- **Already so — the label**: those three brigades are «o'rnida»
  (`supervisor_kind`), and 13 leader profiles are (`leader_kind`).
- **Already so — leader KPIs**: every one of them (turnover, worker concerns,
  foreign objects, category compliance, the audit) credits the cell's «Egasi»,
  the official person. Nothing moves there.
- **The cells' two people**, on the 166 production cells: the same person on
  94; different on 3 (3911, 9123, 9425); an actual leader but no official one
  on 35 (Verifix seats nobody there, so their KPIs credit nobody — as ruled);
  an official one but nobody running it on 2 (0037, 2531); neither on 32.
- **Not so — «Brigadirlar KPI»**: it has a row for every brigade, the three
  o'rnida ones included, and credits each cell's turnover to OUR register's
  brigade. Ruling 3 needs it to credit the official brigadir — which needs
  `brigadir_doc` first.
- **Not so — a Verifix change under a hand pick**: when a cell's seat changes
  while its «Boshqaruvchi» was chosen by a person, the sync only SUGGESTS the
  new seat («seat_changed» on «Verifix sinxron») and waits. Ruling 4 makes it
  automatic.
- **Not so — a brigade's official and dated brigadir**: not stored anywhere
  yet (`unit_link_events` above).

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

- **A shift is (plant, `no`); a block is half of one.** Uchtepa's «2-smena» is
  rows 2 and 3 together. They are two rows, not one, because each block has its
  own Verifix node and its own shift-manager — so a block is where a brigade and
  a shift-manager hang, and the shift is what every page groups by.
- **A brigade's `shift_id` is the shift it is COUNTED on**, the Verifix node only
  its default — the shift's own «actual vs official». Murodali Ochilov's brigade
  works the 3rd shift (Verifix «Цех -14») and is counted as the 2nd (the
  operator, 20 Nov: «Actually 3 but we count them for 2»), so it is set by hand
  and holds until Verifix moves «Цех -14». Which 2nd-shift block it belongs to
  is open — Verifix cannot say.
- **Keles is counted apart from Uchtepa, always.** Its shift is numbered 1, but
  a page that groups by shift groups by plant AND shift: Keles's row is never
  summed into Uchtepa's «1-smena», and a count for the whole company lists
  Uchtepa and Keles side by side.
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
  it, and turning it on later is the same two switches. Murodali Ochilov's
  brigade (Цех-14) works the 3rd shift but is counted as the 2nd, so it is not
  among them and keeps its switch ON. Цех-20 is a new brigade (2531, 7231)
  with it off; 0822 stays in Aripova's shift-1 brigade and keeps counting.
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
  field          varchar(16) NOT NULL,     -- shift_id | brigadir (actual) | brigadir_doc (Verifix)
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

- **Two brigadir fields, the cells' «Boshqaruvchi» / «Egasi» pair for a
  brigade** (rulings 1–4 above). `brigadir_doc` is the person the «Цех» node
  names and Verifix seats there with a brigadir's job — the seat is what the
  sync follows (an id, not a spelling), the name in the node the check, and a
  node whose name and seat disagree goes to the operator. `brigadir` is the
  actual one: set by hand (`src` manual — Erkanboyev, Niyozov), and set to the
  new `brigadir_doc` person on the day that one CHANGES (`src` verifix).
  KPIs read `brigadir_doc`; every other page reads `brigadir`.
- `brigadir` is the dated brigadir per unit the 13 Nov ruling asks for («a past
  day names the unit by THAT day's brigadir»). Who may LOG IN as the brigade
  stays on the `managers` row, as today; splitting the supervisor person from
  the unit is a separate piece of work.
- The acting label is not stored here: «o'rnida» is `supervisor_kind`
  (already set from Verifix), and it turns official on the day Verifix lists
  the actual brigadir as one (ruling 6).
- Shift-managers: `role_profiles.shift_id` (FK `shifts`, so a block) replaces
  `shift` + `factory_id` there, dated through the same table keyed by profile —
  a `profile_id` column on it. **Set by hand only, never from Verifix**
  (ruling 9). Their REACH does not change: `shift_scope` gives every
  shift-manager every unit; the shift is a record of where they work.

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

- **A workstation is one SAP code on ONE shift of one plant** (the operator,
  16 Nov): «The workstation is the same in fact», but cells of different
  shifts never work at it at the same time, so they need no common letters —
  the same code on shift 1 and shift 2 is two workstations. Group letters
  exist only to tell apart cells working at the same workstation at the same
  time, so they are unique inside (plant, shift, code). «The same machine on
  both shifts» is a `GROUP BY sap_code` across the workstations.
- **Today that is exactly (brigade, code)**: every brigade sits in one shift,
  and no two brigades of one shift share a SAP code (all 7 shared codes pair a
  shift-1 brigade with a shift-2 one), so the per-brigade key and the letter
  rule «per unit» already give one workstation per (shift, code).
- **Two brigades of one shift at one code are ONE workstation** (the operator;
  shift 2's blocks «А» and «Б» work at the same time): their cells there take
  letters unique across both, and each brigade keeps its own share and
  штатка. This replaces the old per-unit letter rule («two brigadirs on one
  shift may reuse a letter») — no cell carries such a pair today, so no letter
  changes; the register refuses a clash from then on.
- **The 3rd shift never overlaps** the 1st or the 2nd, so its workstations are
  its own, like the other shifts'.
- Already keyed `(manager_id, code)` and already holding штатка / capacity —
  a parallel table would be a second answer to one question.
- **Cells join it by key, not by a foreign key**: `(manager_id, normalised
  sap_code)`, the key `wc_group.cells_by_wc`, `catalog_follow` and the dated
  readers already use. A cell's brigade move is dated; with a key, its
  workstation follows the move by itself, and past days keep the old one.
- **The group letter stays `cells.wc_group`**. Its rule is already «inside one
  unit and one code, one cell, or every cell lettered and no two alike» —
  which is now «unique inside one workstation».
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
| Shift-manager · brigadir · leader | the employee seated in the node = the OFFICIAL one | `vfx_employee_id` (exists); the ACTUAL one is ours (ruling 1) |

The sync's pass gains one step: a cell's parent «Цех» names its brigade, the
«Цех»'s parent names the brigade's shift, the seat in the «Цех» its official
brigadir. A change there lands as a dated event, exactly as a cell's brigadir
change does now (`cell_links.opening`); a change of the official person also
moves the actual one (ruling 4).

## Order of work

1. **Schema** — `shifts`, `unit_link_events`, the new columns. A `run` step at
   boot (a request needs the tables), additive only.
2. **Seed and tie** — a `later` step: the five shift rows; each production
   brigade's `vfx_division_id` from the «Цех» its cells sit under (majority)
   and `shift_id` from that node's parent; Ochilov's brigade on shift 3 still
   counted, a new Цех-20 brigade with its загрузка off; the 106 missing `pp_work_centers` rows (16 of the 122
   workstations have one; 3 rows name a code no live cell carries); one `seed`
   event per brigade for today. Every mismatch below goes to the operator in a
   report first, never guessed.
3. **The sync follows the new ties**, so a move in Verifix moves the brigade,
   its shift or its brigadir from its day on.
4. **Readers move one at a time** — the shift-scoped pages first (`/shift-daily`,
   the shift report, `/live`, the shift filter): Uchtepa S1 · S2 · S3 (S2's
   blocks as a finer pick) and Keles on its own — never one «S1» across both
   plants — and a past day names its brigade by that day's brigadir.
   Each move is its own change; `managers.shift` stays until the last one.
5. **Departments**, once the operator's report lands.

## What production showed that the tie will hit

1. **Цех-4 is two brigades here**: Suvonov Elshod (43xx, 45xx — оформление) and
   Erkanboyev Zafarjon, acting, a leader in Verifix (39xx, 41xx, 42xx —
   заготовка, сливки, кремы). Both tie to the one node; Erkanboyev's brigade
   has Suvonov as its official brigadir and him as the actual one, and he keeps
   his leader profile (ruling 5).
2. **Цех-8 «RAXIMOVA KAMOLA»** (9411–9414) — Raximova is seated there — runs as
   Niyozov Izzatilla, acting; our «Raximova Kamola» runs Цех-11 «MIRMAXMUDOVA
   MUNIRA», where nobody is seated. Settled: as the platform has it (ruling 8).
   Цех-11 has no official brigadir until Verifix seats one, so its cells credit
   no brigadir in «Brigadirlar KPI».
3. **Murodali Ochilov** holds Цех-14's four cells. Settled: his brigade ties to
   Цех-14 on shift 3 and keeps counting (ruling 8).
4. **0822** (Цех-20, shift 3) is on Aripova's shift-1 brigade. Settled: it stays
   hers and counts (ruling 8).
5. **Shift-managers**: Verifix seats Umarbek Karimov in shift 2 «А» (ours:
   shift 1) and Ikramxoja Shaysayev in shift 3 (ours: shift 2). Settled: ours
   stays (ruling 9); Alimov Bekzod is an admin here.
6. **Keles**: Axmedova Munisa is seated in her cell 1611, not in her «Цех»
   node, so the seat rule reads her through the cell. Axadxo'jayeva Kamila's
   brigade is at Uchtepa here, while its cell (0036) is Keles's АХО — it moves
   to Keles shift 1.
7. **Turdiqulov Mirza's «Цех -22»** (the cold rooms 1511, 3411, 3511, 8011) has
   no shift here; Verifix has it under shift 1. Settled: shift 1 (ruling 12).
8. **A0161** is on 0822 at Uchtepa and on 1611 (A) / 1622 (B) at Keles.
   Verifix carries no SAP codes at all — its divisions hold only the cell code
   (the one exception: «0611 Обработка яиц» has «A0061» typed as its code), so
   A0161 was typed on the platform; the «Jurnal» has no record of who, and no
   brigade's catalog has a line at A0161, so no figure reads it today. Keles's
   own cells run A0161–A0164; 0822's is most likely a slip. As two plants they
   are two workstations anyway.
9. **16 production cells have a brigade and no SAP code** (0036, 0612, 1511,
   3411, 3511, 4124, 4324, 4811, 6611, 6621, 6711, 8011, 8218, 8411, 8421,
   9424) — no workstation for them.
10. **Four production cells have no brigade**: 2531 and 7231 (Цех-20, item 4's
    brigade), 0037 and 1614 at Keles. The other 23 brigade-less cells are АХО,
    dispatch and warehouse zones outside the structure.

## Open — the operator's decisions

1. **0822's real SAP code** (item 8) — who supplies it.
2. **Departments** — waiting for the report.

Settled on 16 Nov: actual vs official people, which pages read which, the
trigger that replaces a hand-set person, the acting leader's two profiles, the
label after the test, the 35 cells, the cases of Цех-8 / 11 / 14 / 22 and
0822, shift-managers, two brigades on one «Цех», the waiting suggestions —
«Actual and official people» above; a workstation is one
code on one shift — «Workstations» above.
4. Departments — waiting for the report.
