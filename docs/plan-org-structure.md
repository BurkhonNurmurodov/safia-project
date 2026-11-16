# Plan — the production structure: Factory → Shift → Brigade → Department → Workstation → Cell

The operator, 2026-11-16: «New structure of the production: Factory → Shift →
Brigade → Department → Workstation → Cell. Shift has shift-managers, Brigade has
a supervisor (brigadir), and cell has a leader. The Workstation is the cells with
the same SAP code — inside it one or several groups work; the groups are the
cells (its A group is one cell, B another). The departments are available on
Verifix; only workstations are not.»

A DESIGN, not built. Read from production the same day through the report door
(four SELECTs, approved by Burkhon): the Verifix org read (`live_verifix_reads`
key `org`), the cells register, the brigades, the shift-managers and
`pp_work_centers`. The same day the operator sent «Бригадиры.xlsx» — every
production brigadir of both shifts with the departments («Отдел») they run;
what it says is in «What the brigadirs' sheet adds» below.

## What production holds today

**Verifix's tree** (541 divisions, one root «Фабрика»):

```
Фабрика › Производство › Производственное управление            (Uchtepa, 1,867 people)
  ├ Отдел сменного производства – 1 смена          970  ┐
  ├ Отдел сменного производства – 2 смена «А» блок 288  │ SHIFT — one «Начальник смены» seated in each
  ├ Отдел сменного производства – 2 смена «Б» блок 292  │
  ├ Отдел сменного производства – 3 смена           74  ┘
  │   └ Цех – 4 SUVONOV ELSHOD …                        BRIGADE — named after its brigadir, who sits in it
  │       └ 4311 Оф.Тортов.глаз                         CELL — the 4-digit code
  ├ Отдел внутренней логистики › Снабжение 1-смена › 0910 …   (department › shift-named brigade › cell)
  └ …
Фабрика › Производство › Производственное управление (Келес) › Цех – AXMEDOVA … › 1611 …   (no shift node)
Фабрика › Производство › Отдел АХО › Мойка 1 смена › 0020 …
```

- **There is no department between brigade and cell.** A Verifix employee
  carries a department (`division_id`) beside their seat (`org_unit_id`), and
  `verifix_org.classify` already defines a department as «a division somebody
  has as their `division_id`». Of the 1,867 people under Производственное
  управление, **1,732 carry «Производство»** — the top of the tree; the rest
  carry Отдел внутренней логистики (112), Алмата Фабрика (17), АХО (Келес) (6).
  Real departments exist only for the service areas, and they sit ABOVE the
  brigade, not below it.
- **Shifts.** Uchtepa has FOUR shift nodes (1, 2А, 2Б, 3), each with its own
  shift-manager; Keles has none. Ours is an integer 1 | 2 on `managers.shift`
  and `role_profiles.shift`.
- **Brigades.** 30 `managers` rows: 19 production at Uchtepa, 1 at Keles, 9
  service (no shift), 1 archived. Verifix's «Цех» nodes match ours one to one
  except the mismatches listed below.
- **Cells.** 213 live (4 archived); 186 with a brigade, 146 with a SAP code, 42
  with a group letter, all 213 tied to their Verifix division.
- **Workstations = (brigade, SAP code): 122 today.** 114 SAP codes sit on live
  cells — 94 on one cell, 20 on several. 12 codes have several cells in ONE
  brigade (lettered: A2894 is 6 cells, A–G, on Ibragimova Sayyora's). 8 codes
  span brigades: 7 are the same station worked by shift 1 and shift 2 (B2942 =
  9411 s1 + 9423 s2; B2943 = 9412 A / 9413 B on s1 + 9425 A / 9426 B / 9427 C on
  s2), and A0161 is on 0822 (Uchtepa) and 1611 / 1622 (Keles).
- `pp_work_centers` — `(manager_id, code)` unique, штатка and capacity — is
  already a workstation register, with 19 rows for 4 brigades.
- **The cell code is structured**: the first two digits are the product family
  (41 заготовка тортов, 43 оформление тортов, 44 пирожные, 74 печенье, 94
  пекарня/сдоба, 82 ПФ/самса, 86 кухня …), the third mostly the shift — 4311 on
  shift 1, 4321 its shift-2 twin. Every workstation's cells share a family
  except B08213 (8225 + 8321) and B0829 (8222 + 8610).

## What the brigadirs' sheet adds («Бригадиры.xlsx», 16 Nov)

One row per brigadir (11 on shift 1, 10 on shift 2), one column per department
they run — 1 to 7 each. Matched against the register, it names 106 of the 157
live cells on the production brigades.

- **A department is a product area with its own code**: «Оформление тортов
  1.23», «Заготовка торт 1.21», «Пирог отдел 2.26», or a SAP work centre («Кекс
  отдел А2751»), or a single cell («8321 юпка отдел»). The dotted code follows
  the SAP code: 1.23 is every A143…, 1.21 every A141…, 1.24 every A144…, 1.03
  every A123….
- **One department is run by several brigades** — on both shifts (1.23:
  Suvonov s1 + Akbarov s2; 1.21 and 1.22: Erkanboyev s1 + O'rozov s2; 1.24:
  Aripova s1 + Ergashov s2; 2.26: Abdukarimov s1 + Ibragimova s2 + Yog'mirov s2)
  and even on ONE shift (Безе 2.25: Akbarov + Ochilov; Макаронс 2734: Artikova +
  Sultanova). So a department is a catalog of the plant, and «brigade →
  department» is the part of it one brigade runs — the pair.
- **A department can take ONE GROUP of a workstation**: A2733 is «Заготовка
  Эклер ПФ» in group A (7313) and «Оформление Эклер ГП» in group B (7315);
  B08213 is «загатовка сомса» (8225) and «юпка отдел» (8321). So a workstation
  does not always sit inside one department — the department belongs to the
  CELL, and a split workstation shows under each of its departments with its
  own groups.
- **Erkanboyev Zafarjon is a brigadir** on the sheet: Verifix's «Цех-4» is two
  brigades (his: заготовка торт, кремы, сливки; Suvonov's: оформление,
  предзаготовка), as the register already has it.
- Size varies from one cell (Kamolova Nargiza's five) to eight (Пирог 2.26 on
  Abdukarimov's).

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
factories            exists   + vfx_division_id
 └ shifts            NEW      factory · no · block · clock · Verifix node            people: shift-managers
    └ managers       exists   = the BRIGADE  + shift_id (dated) + vfx_division_id    people: brigadir (dated, NEW)
       └ departments NEW      a catalog per plant; the brigade × department pair is DERIVED from the cells
          └ pp_work_centers  exists = THE workstation register (brigade, SAP code) + names
             └ cells exists   manager_id · sap_code · wc_group (the group letter)    people: leader (dated, exists)
                              + department_id (dated)
```

Every arrow above the cell is a column ON the cell or on its brigade, never a
table of its own: a cell names its brigade, its department and (through its
SAP code) its workstation, and the tree is read from the cells. That is what
lets one department span brigades and shifts, and one workstation span two
departments, without a single row that has to be kept in step.

### `shifts` (new)

```sql
CREATE TABLE shifts (
  id              serial PRIMARY KEY,
  factory_id      int NOT NULL REFERENCES factories(id),
  no              smallint NOT NULL CHECK (no BETWEEN 1 AND 3),
  block           varchar(2),            -- 'A' | 'B' | NULL
  name_uz text, name_uz_cyrl text, name_ru text, name_en text,
  vfx_division_id varchar(32) UNIQUE,    -- «Отдел сменного производства – …»; NULL at Keles
  day_start       varchar(5),            -- "HH:MM"; end <= start ⇒ crosses midnight
  day_end         varchar(5),
  sort_order      int NOT NULL DEFAULT 0,
  archived_at     timestamptz,
  UNIQUE (id, factory_id)                -- the target of the brigade's composite key
);
```

- Seeded from Verifix: Uchtepa 1 · 2A · 2B · 3, Keles 1.
- `day_start` / `day_end` replace the two app settings `cell_hours_shift_1` /
  `_2`: a cell's blank clock inherits its brigade's SHIFT.
- Why a table, not the integer: Verifix already runs four shifts at Uchtepa
  with a manager each, and «2 smena A blok» does not fit in `1 | 2`.

### `managers` — the brigade

```sql
ALTER TABLE managers
  ADD COLUMN shift_id        int,
  ADD COLUMN vfx_division_id varchar(32),            -- the «Цех» node
  ADD CONSTRAINT fk_managers_shift FOREIGN KEY (shift_id, factory_id)
      REFERENCES shifts (id, factory_id),
  ADD CONSTRAINT ck_managers_shift_plant CHECK (shift_id IS NULL OR factory_id IS NOT NULL);
```

- **The plant stays on `managers.factory_id`** (168 lines read it through
  `factory_scope`, unchanged), and the composite key makes Postgres itself
  refuse a brigade whose shift is in another plant. One fact, checked by the
  database, not two copies.
- `shift_id` NULL = a brigade that works across shifts — the service brigades
  (Abdullayev Yusuf runs supply on shifts 2 and 3, Alimova Gulnora both
  kitchens, Turdiqulov Mirza both shifts' cold rooms).
- `managers.shift` (the integer) stays as a mirror of `shifts.no` for its 80
  readers until each moves to `shift_id`.
- `vfx_division_id` ties the UNIT to its Verifix node. Today only the brigadir
  PERSON is tied (`vfx_employee_id`), which is why a unit whose brigadir changed
  cannot be followed (the 24 Oct swaps).

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

- `brigadir` is the dated brigadir per unit the 13 Nov ruling asks for («a
  past day names the unit by THAT day's brigadir»). It names the person; who
  may LOG IN as the brigade stays on the `managers` row, as today. Splitting
  the supervisor person from the unit is a separate piece of work.
- Shift-managers: `role_profiles.shift_id` (FK `shifts`) replaces `shift` +
  `factory_id` there, dated through the same table keyed by profile — or a
  `profile_id` column on it. Their REACH does not change: `shift_scope` gives
  every shift-manager every unit, and the shift is a record of where they work.

### `departments` (new)

```sql
CREATE TABLE departments (
  id              serial PRIMARY KEY,
  factory_id      int NOT NULL REFERENCES factories(id),
  code            varchar(16),
  name_uz text, name_uz_cyrl text, name_ru text, name_en text,
  vfx_division_id varchar(32) UNIQUE,
  sort_order      int NOT NULL DEFAULT 0,
  archived_at     timestamptz
);
ALTER TABLE cells ADD COLUMN department_id int REFERENCES departments(id);   -- dated: cell_link_events field 'department_id'
```

- **A catalog per plant, not a child of one brigade**: «Оформление тортов 1.23»
  is one department run by Suvonov on shift 1 and Akbarov on shift 2; «Безе
  2.25» by two brigades of shift 2. The tree's «brigade → department» level is
  the PAIR, derived from the cells beneath it — never stored, because a pair
  table would be one more thing to keep in step with every dated cell move.
- **It lives on the CELL**, because a department can take one group of a
  workstation (A2733: ПФ in group A, ГП in group B). No rule ties a
  workstation's cells to one department.
- `code` holds the plant's own code («1.23», «2.26»; a SAP or cell code where
  the department is named by one).
- **Its source is the plant's list, not Verifix** — Verifix has no such level
  (above). Seeded once from «Бригадиры.xlsx», then kept on the platform: a
  department picker on the cell form and a «Bo'limlar» register for admins.
  `vfx_division_id` stays, empty, for the day HR adds the level to Verifix.
- Seeding rule: a department named by a dotted code takes the brigade's cells
  whose SAP code starts with its prefix (1.23 → A143…); one named by a SAP or
  cell code takes those cells; one named by words only («Мясной отдел»,
  «слойка отдел») is matched by hand. The seed is a report to the operator
  first — every cell it leaves out or puts in two departments named — and is
  written only once they accept it.

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
- **A workstation may be split between departments by its groups** (A2733,
  B08213) — each group is a cell, and the department is the cell's.
- **A workstation belongs to ONE brigade.** The same SAP station worked by
  shift 1 and shift 2 (7 codes today) is two workstations sharing a SAP code;
  «the same machine on both shifts» is a `GROUP BY sap_code` across them.
- A cell with no SAP code belongs to no workstation and hangs directly in its
  brigade and department (40 today, mostly АХО, logistics and cold rooms).
- Never tied to Verifix — the one level that is ours.

### Every level against Verifix

| Level | Verifix today | Tie |
|---|---|---|
| Factory | «Производственное управление» / «… (Келес)» | `factories.vfx_division_id` (new) |
| Shift | «Отдел сменного производства – N смена» | `shifts.vfx_division_id` (new) |
| Brigade | «Цех – N …» | `managers.vfx_division_id` (new) |
| Department | — missing for production | ours, from the brigadirs' sheet; `departments.vfx_division_id` kept for later |
| Workstation | — never | ours: `pp_work_centers` |
| Cell | the coded subdivision | `cells.vfx_division_id` (exists) |
| Shift-manager · brigadir · leader | the seated employee | `vfx_employee_id` (exists) |

The sync's pass gains one step: a cell's Verifix parent names its brigade (and
its department, once Verifix has one), a «Цех» node's parent names the
brigade's shift. A change there lands as a dated event, exactly as a cell's
brigadir change does now (`cell_links.opening`).

## Order of work

1. **Schema** — `shifts`, `departments`, `unit_link_events`, the new columns.
   A `run` step at boot (a request needs the tables), additive only.
2. **Seed and tie** — a `later` step: the five shifts from their Verifix nodes;
   `managers.vfx_division_id` from the node its cells sit under (majority) and
   `shift_id` from that node's parent; the 106 missing `pp_work_centers` rows (16 of the 122 workstations have one; 3 rows name a code no live cell carries);
   one `seed` event per brigade for today. Every mismatch below goes to the
   operator in a report, never guessed.
3. **The sync follows the new ties**, so a move in Verifix moves the brigade
   or the shift from its day on.
4. **Readers move one at a time** — the shift-scoped pages first (`/shift-daily`,
   the shift report, `/live`, the shift filter): S1 · S2A · S2B · S3 instead of
   S1 · S2, and a past day names its brigade by that day's brigadir. Each move
   is its own change; `managers.shift` stays until the last one.
5. **Departments** — the seed report from the sheet, the operator's answers on
   it, then the write; the cell form and the «Bo'limlar» register keep them.

## What production showed that the tie will hit

1. **Цех-4 is two brigades here**: Suvonov Elshod (43xx, 45xx — оформление) and
   Erkanboyev Zafarjon, acting, a leader in Verifix (39xx, 41xx, 42xx —
   заготовка, сливки, кремы). The brigadirs' sheet lists him as a brigadir, so
   it is Verifix that should list a second «Цех»; until then both brigades tie
   to the one node.
2. **Цех-8 «RAXIMOVA KAMOLA»** (9411–9414) runs as Niyozov Izzatilla, acting,
   while our «Raximova Kamola» runs Цех-11 «MIRMAXMUDOVA MUNIRA» (no brigadir
   seated). One of the two registers is stale.
3. **The 3rd shift**: Verifix has «3 смена» (Цех-14, Цех-20) with no brigadir.
   Ours puts Цех-14 on Murodali Ochilov (shift 2, acting), 0822 on Aripova
   Manzura (shift 1), 2531 and 7231 on nobody.
4. **Shift-managers**: Verifix seats Umarbek Karimov in «2 смена А блок»
   (ours: shift 1) and Ikramxoja Shaysayev in «3 смена» (ours: shift 2); Adi
   Ro'ziyev has no plant here; Alimov Bekzod is a «Начальник смены» in Verifix
   with no profile here.
5. **A0161** is on 0822 at Uchtepa and on 1611 / 1622 at Keles — a SAP code
   across two plants, most likely a typo.
6. **11 production cells have a brigade and no SAP code** (0612, 4124, 4324,
   4811, 6611, 6621, 6711, 8218, 8411, 8421, 9424) — no workstation for them.
7. **27 cells have no brigade** (the отправка zones, the raw-material
   warehouses, «Мойка 3 смена», two of Цех-20), so they belong to no plant.

And where the brigadirs' sheet and the register disagree:

8. **Raximova Kamola** lists «Пончик Отдел A2743» — that cell, 9414, is on
   Niyozov Izzatilla here — and «Мясной отдел». **Niyozov** («IZZAT AKA» on
   shift 1, by full name on shift 2) lists only «Мясной отдел», while the
   register gives him Пекарня 9411–9414 and Raximova the ПФ / самса / кухня
   cells of Цех-11.
9. A department listed by a brigade that holds none of its cells: Sultanova's
   «Макаронс 2734» (7314 is Artikova's), Ergashov's «марьям цех А1464» (4614 is
   Talipova's), Ochilov's «Безе отдел 2.25» (7331 is Akbarov's), Ibragimova's
   «мелкоштучка отдел 1.03».
10. Artikova lists «Мелкоштучка отдел 1.03» AND its parts (Эклер, Тарталетка,
    Макаронс, Сет Фасовка) — an umbrella over departments, or a duplicate.
11. **51 cells of the listed brigades are in no department** — among them the
    whole ПФ / кухня of Raximova's (11), Пекарня (4), Talipova's 4611–4613,
    Kamolova's 8221, 8322, 8622, 8623, Olishev's 9422, 9424, 9429, the
    фасовка cells of Ibragimova and Yog'mirov, the просеивания cells.
12. Axmedova Munisa (Keles) is under shift 2 on the sheet, shift 1 here.

## Open — the operator's decisions

1. **Departments are the platform's own, seeded from the brigadirs' sheet** —
   the default here, since Verifix has none between «Цех» and the cell. If HR
   will add them to Verifix instead, the sync reads them like cells and the
   sheet is only the check.
2. **One level of departments or two?** «Мелкоштучка 1.03» beside its own
   parts on Artikova's row is the only sign of an umbrella; the default here is
   one level (the parts), with 1.03 as the code they share.
3. **The same SAP station on two shifts = two workstations**, one per brigade?
   The default here, since the tree puts a workstation under one brigade.
4. **A brigade with no shift** (the service brigades that span shifts) —
   allowed as `shift_id` NULL? The default here.
