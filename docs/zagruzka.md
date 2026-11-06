# The загрузка («Zagruzka foizi»)

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## The загрузка reads the «Zagruzka fayli» page (`zagruzka_source`)

From **2026-09-02** (`ZAGRUZKA_FROM`, the operator's directive) the загрузка's
two inputs — **«Odam soni»** and **«Трудоёмкость»** — come from the
`/production` page instead of Google Sheets. **The formula is untouched, byte
for byte**; only where three numbers come from changes.

- **Both were always sheet downloads, and that is the point.**
  `sheets_reader.read_headcount_data` reads the tab literally named
  «Одам сони» into `headcount_data.official_hc`; `read_production_data` reads
  «Минут» into `production_data.prod_plan` / `.prod_actual`. One number per
  brigadir per day, typed into a spreadsheet nobody on the platform can see.
  This is not a new concept — it is the SAME two fields, re-sourced.
- **The floor is a CONSTANT with no override**, the shape `idle_source.CELLS_FROM`
  and the review floor already use: a rule a per-unit toggle can quietly undo is
  a rule nobody can read off the platform. Days BEFORE it still read the two
  sheet tabs and are untouched, so history is never rewritten and one day is
  never answered by two sources. **Nothing is stored** — every figure is derived
  per request — so "recalculate from 2 September" needs no migration, no day
  reopen and no notification: every consumer re-reads at the next restart.
- **`services/zagruzka_source.py` is THE definition** — `ZAGRUZKA_FROM`,
  `uses_production`, `range_start`, `sheet_end`, `typed_pins`, `planned_wcs`,
  `typed_people`, `unit_people`, `cell_people`, `unit_labor`. Never re-spell the
  date comparison at a call
  site, and never split a range by hand: `sheet_end` is the exact inverse of
  `range_start`, which is what stops a day being counted twice or not at all.
- **The «Plan Prognoz» page reads it too** (from 2026-09-23).
  `production._load_plan_by_manager` is the one loader behind `/trudoyomkost`,
  its Excel, the worker statistics, the forecast table, the call modal and the
  automatic 19:00 / 06:00 call DM — and the 2 Sep switch missed it. Once
  nothing else read «Минут», nobody filled it after 6 Sep, and all of those went
  dark (the page read «0 brigadir», the DM averaged one early-September day). It
  now splits at `range_start` / `sheet_end` like the загрузка; on 2–4 Sep, both
  sources filled, they agreed within ~1% for all 21 units, so the seam moves no
  level. A new reader of planned trudoyomkost reads `unit_labor` from the floor
  — never `ProductionData`, which keeps syncing and feeds nobody.
- **Odam soni is the TYPED number and nothing else.**
  `pp_work_center_daily.people` — the «Bugungi fakt» box on the «Odamlar soni»
  tab — summed over the unit's work centres **the day gave PLAN MINUTES to**
  (2026-10-26; see «Odam soni» is typed, and counted, only where the day HAS A
  PLAN» — on a unit-day that plans nothing at all every pin counts, as before).
  `people IS NULL` is what makes the
  rule expressible: it distinguishes "nobody typed anything" from a deliberate
  0 (a cell that ran empty), which is a real answer. The derived suggestion
  `ROUND(W × Q ÷ S)` is deliberately NOT a fallback and neither is штатка — a
  suggestion presented as a fact is the thing this switch replaces, and 19 of
  22 units have no `pp_work_centers.shtatka` at all, so the formula would
  answer 0 for almost the whole fleet.
- **So «Bugungi fakt» must never print a resolved number bare.** `pp_calc`
  publishes `people` / `shtatka` RESOLVED — the pin where one was typed, the
  derived `people_calc` / `shtatka_cfg` where none was — beside the
  `*_overridden` flag that is the only thing telling the two apart. The
  read-only branch of that table (a CLOSED day, or a viewer who may not type)
  printed the resolved value with no marker, so a unit that had typed nothing
  showed the suggestion from the card on the LEFT as its own fact — both cards
  identical cell for cell — while the загрузка heatmap marked that same
  unit-day 👥. Two surfaces, one unit-day, opposite answers, and the page a
  brigadir opens to find out why the load is blank was the one telling them
  everything had been filled in. **The blank on the heatmap IS the warning, and
  a fact card that answers with the formula is what stops it landing.** The
  editable branch always distinguished them (typed = gold + bold, untyped = a
  grey placeholder); the read-only branch now keeps that vocabulary and adds a
  `*` plus a legend that renders in BOTH states — a closed day has no input to
  carry the meaning and is exactly the day read back as the record. JAMI
  carries the `*` too: a total is the number a reader quotes, so it must not be
  the last place the distinction is dropped.
- **From 2026-09-08 (the operator's directive) the suggestion is not
  SUBSTITUTED at all** — `pp_calc.compute_dashboard(people_typed_only=True)`,
  passed by `production._build_dashboard` off `uses_production(day)`, i.e. the
  same `ZAGRUZKA_FROM` floor `zagruzka_cell.o_soni` already applies. The
  marker above was only half the fix: the resolved value still ANSWERED, so
  «Загрузка» printed «ЛЮДЕЙ (Σ) 34 · СР. ЗАГРУЖЕННОСТЬ 83%» — both computed
  from `people_calc` — for a closed unit-day whose brigadir card read «Нет
  данных». The marker never reached that tab at all. Now a work centre with no
  typed pin has `people = None`, its `load` is None, and it is absent from ΣN;
  ΣN with NOTHING typed is None, so every reader prints «—». `people_calc` is
  still published — the «Расчёт (формула)» table exists to show it, LABELLED —
  and a typed **0** is still a real answer (a cell that ran empty), which is
  why `people_overridden` and never the value is what tells typed from absent.
  Days before the floor, and any other caller of the engine, compute exactly
  what they always did.
  **Consequences, all deliberate.** «Кол-во» on the команда cards, ЛЮДИ and
  Минут on the positions table, ΣN and СР. ЗАГРУЖЕННОСТЬ all read «—» on a
  unit-day nobody typed; a partial day marks the pair with `*` and a line
  naming «{typed} of {total}», since ΣN sums the typed pins alone while the
  whole unit's trudoyomkost is counted against them (the bullet below). The
  «Кол-во» INPUT no longer previews the suggestion as its placeholder — an
  empty box counts as nothing, and a placeholder promising otherwise is the
  same substitution one layer up — while ШТАТКА still falls back to the
  configured roster, because that is configuration, not a fact about one day.
  And the **ABC export writes N BLANK** where nothing was typed, rather than
  the suggestion: it is the form's one hand-edited cell, so ЛЮДИ, Минут,
  Парето, Загруженность, «Nechta odam keldi» and bandlik read 0 until the
  brigadir fills it in.
- **Only the typed pins are summed, and the WHOLE unit's trudoyomkost is
  counted against them** (the operator's call). A unit that types 4 of its 6
  work centres therefore reads a load that is too HIGH, with nothing on screen
  distinguishing that from a genuinely overloaded unit. The pressure to type
  them all is the point.
- **Trudoyomkost is the production page's own resolution**, never a second
  spelling: Σ over the unit's active catalog LINES of `labor_time × qty ÷ 60`,
  per-line override → the group's shared value → the SAP snapshot. That is
  `pp_calc.line_minutes`, the same function `/zagruzka-cell` and `/live`
  already read, so the загрузка and the Positions table can never report
  different minutes for one day. `line_keys` is computed PER UNIT, as the
  Positions table computes it.
- **A unit-day missing either half has NO загрузка — a marker, never a zero.**
  `compute_metrics(hc_required=True)` is what enforces it: with `official_hc`
  at 0 the old code still built `effective_hc = 0 + labor_surplus` out of the
  attendance correction alone and averaged that into Overview and /summary as
  an ordinary figure. The flag defaults to False, so every pre-floor caller
  behaves exactly as before. On the heatmap and the comparison the day carries
  `no_headcount` (👥, nobody typed the people) or the new `no_labor` (📄,
  people typed and the catalog cannot answer the trudoyomkost); in
  `/api/brigadirs` it contributes NOTHING to the averages those two inputs
  feed, while still contributing its ojidaniya, its attendance headcount and
  its verifix labor, which do not depend on them. **That blank IS the
  warning** — the operator's decision: a unit finds out its numbers are
  missing by losing its figure.
- **`DailyMetrics.basis`** ("sheet" | "production") rides on every row so a
  reader can say WHICH half of a blank day is missing instead of guessing.
- **Ojidaniya is weighed by the same number.** `idle_source._n_by_cell` is THE
  weight definition and both `unit_downtime` and `cell_counts` read it — they
  must divide by the same thing or the «Toifalar bo'yicha» matrix and the KPI
  stop describing one day. Before the floor: the people who actually worked
  the cell (`hc_weight` summed, not rows counted). From the floor: the typed
  pin on the work centre the cell's `sap_code` names. A cell whose work centre
  nobody typed — or that names none — has no weight and leaves BOTH sides,
  exactly as a cell nobody worked in already did. **Where several cells of one
  unit name one work centre (10 groups today) the typed number is SPLIT evenly
  between them**, so ΣN equals what the brigadir typed rather than counting one
  work centre four times over. From 2026-09-14 only what no GROUP letter claims
  is split — a cell of a work centre typed per group reads its own group's row
  (see «A work centre's GROUP»). It moves every surface at once, by design:
  /downtime and its bar modal, the matrix and its divisor, the weekly deck,
  both Excel exports, the bot card, the weekly svodka, /live and the Daily
  donut.
- **Consequence to know: a unit that types nothing reads 0 waiting minutes**,
  not just a blank загрузка — ΣN = 0 is no figure at all. Accepted by the
  operator. It is self-healing: nothing is stored, so typing the numbers later,
  for a past day too, starts the weighting immediately.
- **Trudoyomkost is derived from the catalog EACH DAY HAD** (from 2026-09-24 —
  see «A catalog edit counts FROM NOW ON»). Until then it was the CURRENT
  catalog, so editing a `labor_time` moved the загрузка of every past day from
  the floor on. A typed QUANTITY still moves its own day, and nothing else.
- **Deliberately unchanged**: `labor_surplus` and `effective_hc` (the
  attendance correction still applies on top of the typed headcount — the
  operator's call), the early-arrival subtraction, the headcount-mismatch flag,
  the flat 480 base (the production page's `pp_shift_min` is deliberately NOT
  adopted), the closed-day lock, the day-close gate on `build_metrics_list`,
  and both sheet imports, which keep syncing and are simply not read from the
  floor on.
- **«Yacheyka zagruzkasi» (`/zagruzka-cell`) runs the same rule per CELL.**
  Its trudoyomkost already came from `pp_calc.line_minutes`; what changed is
  its headcount — `o_soni()` returns the TYPED «Bugungi fakt» and nothing else
  from the floor, so the derived `ROUND(W × Q ÷ S)` no longer answers for a
  work centre nobody typed. A cell-day with no typed number reads BLANK and is
  counted in `diagnostics.no_typed_headcount`, named because a blank the page
  does not count reads as a quiet day. Its unit roll-up's ojidaniya weight
  moves with it: `n_idle` is the cell's typed O. SONI from the floor — the same
  weight `idle_source._n_by_cell` applies to the fleet — instead of the cell's
  attendance headcount. Before the floor every one of these keeps the derived
  answer, so history is untouched.
- **The brigadir's own row on that page IS /zagruzka's row** (2026-09-09, the
  operator's directive) — taken from `build_metrics_list`, which the endpoint
  was already calling for the reconciliation block, never re-derived. It had
  been a sum over the cells, and that sum could not express three of the fleet's
  rules, each of which moved the number: the WHOLE unit's trudoyomkost counts
  against the TYPED pins alone (a roll-up that dropped an untyped work centre's
  minutes as well as its people read **78%** for Ergashev Muxriddin on 07.09.2026
  against **572%** on /zagruzka); attendance is the unit's own payroll, not the
  rows carrying one of its cell codes; and the ojidaniya deduction is weighed
  over every cell that had people, not only the cells that produced a figure
  here. **The two pages can no longer answer one unit-day two ways.** What the
  cells add up to is still computed and is published as **`cells_sum`** — the
  reconciliation card charts that against the unit row, so «do the cells add up
  to the brigadir» stays the question the twin was built to ask, and a gap now
  names something real: a work centre with no cell, a cell with no SAP code,
  people nobody typed, or attendance with no «Код подразделения». Consequence to
  know: the unit row no longer equals the rows above it, and the page says so.
- **A work centre named by SEVERAL cells is SPLIT EVENLY between them**
  (2026-09-09; from 2026-09-14 only the part no GROUP letter claims — a lettered
  cell reads its own group's catalog lines and typed pin, `wc_split` says which,
  see «A work centre's GROUP») — ten groups today, the largest six cells wide (Ibragimova
  Sayyora's A2894; Ergashev's 7222 · 7223 both name A14310). `pp_daily` is keyed by the WORK CENTRE and
  `pp_work_center_daily` by work centre + GROUP, so a cell's own trudoyomkost and
  «Bugungi fakt» exist only through its group letter; for whatever no letter
  claims, nothing in the data says which of the cells produced what. Handing each cell the WHOLE work centre —
  what the page did until then — measured one line's entire production against a
  fraction of its people, so `labor_surplus` drove `effective_hc` toward zero and
  the row read ±1000% (938%, 2498%, 1644% on those two cells), and the roll-up
  then counted those minutes and that headcount once PER CELL. **Evenly, never
  by attendance**: `zagruzka_source.cell_people` already splits that unclaimed
  part of the typed number evenly across the same cells for the ojidaniya weight, and one split
  must not have two spellings. Such a cell's figures are SHARES and say so —
  a `1/N` chip on its work centre (only while `wc_split` is «even»), `wc_share` /
  `wc_cells` on every input row, `diagnostics.shared_work_centers` for the work
  centres still split evenly (`lettered: true` where letters exist but no line
  or pin names them yet), and `grouped_work_centers`, `lines_without_group` and
  `orphan_groups` for the grouped ones (see «A work centre's GROUP»).
- **That page serves EVERY unit from 2026-09-07** (the operator's directive),
  one at a time. The hard lock to «Suvonov Elshod Of» (#5) — its name regex,
  its id fallback and the `lock_warning` it published — is GONE; `?manager_id=`
  picks the unit and `_pick_manager` decides what a viewer may pick through
  `scoped_manager_ids`, so the scope is server-side and the query parameter is
  not a way round it. That scope is the PLANT lock, exactly as on `/zagruzka`:
  a per-cell twin stricter than the page it reconciles against could not be
  reconciled against it. An unknown or out-of-scope pick falls back to the
  first unit the viewer may see rather than 403-ing — the page remembers its
  pick, and a stale one must not lock somebody out. One unit at a time is
  deliberate: the roll-up row, the fleet reconciliation and every diagnostic
  are statements about ONE unit. The picker is a `FilterPanel` section after
  `useFactorySection()`, always ACTIVE (there is no «All» to fall back to) and
  with no `onClear`. **`_cell_label` is now the verifix CODE alone** — it used
  to append the workshop name, which is exactly the regression «A cell is its
  CODE» exists to prevent. Page access is UNCHANGED: `zagruzka-cell` still
  defaults to no roles (admin-only) and is opened per profile on Access /
  Permissions — widening the units it covers is not the same decision as
  widening who may open it.

## The trudoyomkost is KEPT between requests (`labor_kept`, 2026-11-02)

`zagruzka_source.wc_labor`, `wc_group_labor` and `line_facts` — the загрузка's
numerator, the per-cell split and the per-line facts /plan reads — answer each
(unit, day) from a process store, `services/labor_kept.py`, instead of
re-reading the dated catalog and every quantity row of the range on every
request. It is what /zagruzka, /downtime (and its bubbles), /workers, «Smena
kunligi», Plan Prognoz, /plan, «Liderlar KPI» and «Hisobotlar» all read.

- **Exact, never for-a-while.** Every call first reads ONE stamp query: per
  (unit, day) count / Σ / max of `xmin` over `pp_daily` and `pp_line_daily`,
  per unit the same over `pp_products` and `pp_catalog_versions` — every input
  of the computation. A kept day is served only while its stamp is unchanged; a
  typed ФАКТ re-computes that one unit-day, a catalog edit that unit's days.
  The stamp is read BEFORE the inputs, so a write landing mid-computation only
  costs the next request a recompute. **A new input of the trudoyomkost is a
  new arm of `_STAMP_SQL`**, or a kept day goes stale on exactly that table.
- **Never from a session that wrote**: `txid_current_if_assigned()` set, or
  unflushed ORM changes → the call computes from the rows as before and stores
  nothing (catalog_follow, the uploads). Not Postgres, or the stamp query fails
  (inside a savepoint) → the same. The stamp is read once per (units, range)
  per session and dropped on any flush, commit or rollback.
- **Byte for byte per day**: a day's numbers come out of `pp_calc`'s one loop
  in the same order whatever the range, so `unit_labor`'s sums are the same
  floats. Only the order ACROSS days changed — oldest first, where the old code
  walked a set of dates in a per-process random order (Python hashes dates with
  the hash seed). Proven on generated data: the OLD code disagreed with ITSELF
  between two restarts on 15 of 2,293 /plan products (a 0.1 rounding, the
  last-seen group letter); the new code answers the same every time.
- **A kept line is a plain SNAPSHOT** of the catalog row
  (`pp_catalog.LINE_FIELDS`, what a dated version holds anyway), never a live
  ORM object — one answer serves many requests.
- **Bounded**: values packed (interned strings, `array('d')`), LRU caps per
  kind (`CAPS`); two months of the fleet ≈ 11 MB. **Warmed** 15 s after a
  process starts (`labor_kept.warm`, the last 62 days, `wc` and `facts`), so a
  deploy's empty store is not paid by the first viewers.
- Measured on a production-sized stand-in (21 units, 2 months, 52k quantity
  rows): `wc_labor` 1.4 s → 45 ms, `line_facts` 1.2 s → 25 ms; /shift-report
  start-load 4.9 s → 0.3 s, Plan Prognoz 1.4 s → 0.16 s, /plan 2.1 s → 1.0 s.
  `labor_kept.stats()` counts hits, misses and bypasses per process.

## TWO comparison tables on `/zagruzka` («Smena boshi va Smena oxiri Zagruzka»)

From **2026-09-20** (the operator's directive) `/zagruzka` carries a SECOND
comparison table directly under the first. Same grid, same data, same colour
bands, same everything — one thing differs, and it is the whole reason the
table exists:

    Plan   (P) = «Ishlab chiqarish plani» ÷ (480 × 0.9 × «Hisobotdagi xodimlar»)
    Actual (A) = «Trudoyomkost»           ÷ (480 × 0.9 × «Hisobotdagi xodimlar»)

i.e. `prod_plan` and `prod_actual` over ONE denominator — the unit's reported
people × a PRODUCTIVE shift. Read it in units and it explains itself: the
numerator is person-minutes of WORK (Σ over the unit's catalog lines of
quantity × Трудоемкость ÷ 60), the denominator person-minutes of CAPACITY, and
0.9 says a person is productive for 432 of the shift's 480 minutes.

- **`utils/formulas.js` is THE definition** — `SHIFT_MIN`, `PRODUCTIVE_SHARE`,
  `simplePlanUtil`, `simpleActualUtil` and the three popup builders beside them.
  Never re-spell the division at a call site: the cell, the pinned summary, the
  column footer, the FormulaModal and the CommentModal all read those two
  functions, so one unit-day can never be computed two ways.
- **It is a PROP on the existing component, never a fork** —
  `ComparisonTable basis="simple"`, resolved once into `planOf` / `actOf` /
  `pctOf`. Everything else about the two tables (the P·A·D toggle, the sort,
  both summaries, the pending ⏳/👥 markers, the approval gate, the comment
  threads, fullscreen) is identical — only the colour BANDS are each table's
  own (see «Every /zagruzka table owns its colour bands») — and a copy would be
  one duplicate of all of it that stops being maintained the first time any of
  them changes.
  `basis` defaults to `"full"`, so `/zagruzka-cell` and every other caller
  compute byte-for-byte what they always did.
- **The ⚙ calculator is NOT offered on it**, and that is the one thing the
  duplicate deliberately does not copy. Its four switches — ojidaniya, early
  arrival, the 10-minute kaizen buffer, the 0.85 changeover allowance — are all
  terms of the FULL formula and none of them appears in this arithmetic, so
  flipping one could not move a number. A control that reports a change and
  changes nothing is worse than an absent one. The page therefore passes it no
  `calcFactors` either, so the "factors active" banner can never fire.
- **Its title is «Smena boshi va Smena oxiri Zagruzka»** (the operator's call,
  2026-09-25 — it shipped as «Soddalashtirilgan hisob»; the key is still
  `zagruzka.simpleTable`), and its COMPARE view prints no «Plan (P) va Haqiqiy
  (A) yonma-yon» subtitle — the title names the pair itself. The full table
  keeps that line, and both keep the diff view's «D = P − A» one.
- **The two tables show DIFFERENT numbers for the same unit-day, by design, and
  both are titled so neither is the unlabelled default** — «To'liq hisob» and
  «Smena boshi va Smena oxiri Zagruzka», each printing its own formula under
  its title.
  Plan is the full table's P ÷ 0.9, so **every value reads 11.1% higher**. The
  two tables shared ONE set of bands until 2026-09-24, which therefore painted
  this table greener: a unit reading 77% next door read 86% here, i.e. green.
  From that date each owns its bands, seeded from the shared ones — so it goes
  on painting greener until an admin moves this table's own edges.
- **Both columns share one denominator**, so `A ÷ P = prod_actual ÷ prod_plan`
  = ВЫП%, and `D = P − A` is exactly the plan shortfall in загрузка points.
- **A ZERO is treated as NO DATA.** `DailyMetrics` defaults both `prod_plan`
  and `prod_actual` to 0.0, so a figure the file never mentioned is
  indistinguishable from a real zero; the full table already blanks both cases
  (its `ratio` is falsy at 0), so blanking them here keeps the two grids
  marking the same days as "no answer". **One deliberate difference:** a day
  with a plan and NO actual shows the simplified table's Plan and a dash for
  Actual, where the full table blanks BOTH halves — the simplified Plan needs
  no `ratio`, so it can answer where the full one cannot.
- **`official_hc` is the headcount either way**, so nothing here cares which
  basis the day is on: it is the typed «Bugungi fakt» from
  `zagruzka_source.ZAGRUZKA_FROM` and the «Одам сони» sheet before it.
- **The «AVG за день» footer is the WHOLE TABLE, not a mean of the rows**
  (the operator, 2026-10-19 — on all three comparison tables; the label stays
  «AVG»). `ComparisonTable pooledAvg`: per day, Σ numerators ÷ Σ capacities over
  every row the grid shows (P = Σ prod_plan over the rows' P capacities, A =
  Σ prod_actual over their A capacities, each capacity = the cell's numerator ÷
  its own value, so the basis, the ⚙ factors and the approval gate are the
  cells' own); D pairs the halves over rows carrying both; the corner is the
  whole table over the whole period. A small brigade weighs what it is worth.
  MIN/MAX and every row's own summary are unchanged; `/zagruzka-cell` keeps the
  mean (its unit row already is the measured whole).
- **`/zagruzka` only** (the operator's call). `/zagruzka-cell` was considered
  and deliberately left alone — its rows are cells, whose headcount is a
  per-group SHARE, so the same formula there is a different decision.
- Everything is derived per request from the existing `/api/heatmap` payload —
  no backend change, nothing stored, so no migration and no re-sync.

## «To'liq hisob · Verifix × 0.9» — the third comparison table (`/zagruzka`)

From **2026-09-25** (the operator's request) a third comparison table sits
directly under «To'liq hisob»: the FULL formula, term for term, with ONE number
changed — the recorded Verifix hours enter the effective headcount at **0.9
instead of 0.85**.

    P = prod_plan ÷ (480 × official_hc)                     — the full table's own P
    A = prod_actual ÷ (effective_hc′ × (avail_min − ojidaniya − early − 10))
        effective_hc′  = official_hc + (verifix_labor′ − prod_actual) ÷ avail_min
        verifix_labor′ = recorded hours × 60 × 0.9

- **P is identical to the full table's by construction** — it has no Verifix
  term. Only A moves, and always DOWN: more productive minutes per recorded hour
  is more effective people for the same output. Abdukarimov Sanjar, 24.09.2026:
  effective headcount 62.55 → 66.72, A 119% → 111%.
- **`utils/formulas.js` is THE definition** — `full90ActualUtil` and the two
  CommentModal builders (`commentFull90ActualFormula`,
  `commentFull90EffectiveHcFormula`). The 0.9 IS `PRODUCTIVE_SHARE`, the same
  number the simplified table and «Samaradorlik» apply, never a second
  constant. The hours are recovered as `verifix_labor ÷ 0.85` (the rule
  `verifixMinutes` documents); a payload without the component rebuilds it
  from the surplus. The full table's popup builders now share their layout with
  these (`actualComment`, `effectiveHcComment`) and print byte for byte what
  they did.
- **`ComparisonTable basis="full90"`**, a prop like `"simple"`, never a fork. Its
  blanks are the full table's: no official `net_util` ⇒ no figure.
- **The ⚙ factors are the official table's alone** (`factorsApply = basis ===
  "full"`): they are what-ifs on THE загрузка, this table already is one, and
  the switch that names «15%» would lie on it.
- **The page renders all three comparison tables through ONE builder**
  (`comparisonTable(which, isFull)` over `COMPARISON`, in page order), inline and
  fullscreen, so the three can never drift apart; the table key IS the basis,
  the band-table key and the `openFull` value.
- **Its colour bands are its own** (`comparison_full90_p_segments` /
  `comparison_full90_diff_segments`), seeded ONCE from the full table's by
  `startup.seed_full90_bands` (flag `zagruzka_full90_bands_2026_09_25_v1` —
  the 2026-09-24 split had already run everywhere, so it needed a flag of its
  own), so it opens painted exactly like the table it is read against.
- Everything is derived per request from the existing `/api/heatmap` payload;
  nothing about the official загрузка, any KPI or `VERIFIX_EFFICIENCY` changed.

## Plan fulfilment and Efficiency heatmaps (`/zagruzka`)

From **2026-09-21** (the operator's directive) two single-metric heatmaps sit
directly under the fleet heatmap («Карта нагрузки») and above the funnel —
COPIES of it: same grid, same pending markers, sort and AVG/MAX/MIN column,
and — from 2026-09-24 — colour bands of their OWN, seeded from the fleet
heatmap's (see «Every /zagruzka table owns its colour bands»). Each reads ONE
number per unit-day:

    Reja bajarilishi = TRUDOYOMKOST ÷ ISHLAB CHIQARISH PLANI      (prod_actual ÷ prod_plan)
    Samaradorlik     = TRUDOYOMKOST ÷ capacity
      capacity       = VERIFIX MINUTES × 0.9
                     − HISOBOTDAGI XODIMLAR × (ojidaniya + early arrival + 10)

- **`utils/formulas.js` is THE definition** — `fulfilUtil`, `verifixMinutes`,
  `effCapacity`, `effUtil` and the three CommentModal builders. The cell, the
  row summary and the popup all read those functions.
- **A prop on the existing grid, never a copy** — `HeatmapChart cellValue={…}`,
  resolved once into `read` and used at every read site. Omitted, it is the
  fleet heatmap's own Plan/Fact switch, byte for byte. **Never name that prop
  `valueOf`**: every object inherits `Object.prototype.valueOf`, a destructuring
  default applies only to `undefined`, and the fleet heatmap (which passes
  nothing) then called the inherited method on each cell and crashed. That was
  caught in the browser before it shipped; the comment at the prop says why.
- **Efficiency is OUTPUT ÷ AVAILABLE TIME, so high = good** (the operator's
  ruling, 2026-09-21). The inverse (capacity ÷ output) was the formula first
  written down; it is a COST measure where lower is better, and under the
  shared bands it painted an idle shift green and an over-producing one red.
- **It is the attendance-based twin of the full table's A (`net_util`)**: same
  three per-person deductions and the same 10-minute kaizen buffer, but the
  capacity comes from minutes actually CLOCKED × 0.9 instead of the typed
  headcount corrected by labour surplus. A gap between the two says the typed
  headcount and the attendance file disagree about the day.
- **VERIFIX MINUTES are RAW (hours × 60) over the direct-role rows** — the set
  `verifix_labor` is summed over. The payload ships only `verifix_labor` =
  hours × 60 × 0.85, so the raw figure is `verifix_labor ÷ VERIFIX_EFFICIENCY`,
  exact to the 2-decimal rounding it is stored at (verified against the
  attendance table summed directly: 247/247 unit-days, max drift 0.006 min).
  **The 0.85 is NOT applied** — the operator's 0.9 is the only productivity
  factor; stacking both (0.765) read ~18 points higher.
- **ojidaniya and early arrival are PER-PERSON minutes** on this payload (the
  full formula subtracts them from a per-person base), which is why they are
  multiplied by the headcount here to become the unit's total.
- **Blanks**: no ФАКТ (a 0 is the payload's default for "never said"), no plan
  (fulfilment), no reported headcount (the platform's standing rule — the blank
  IS the warning), and capacity ≤ 0 (deductions exceeding attendance).
- **A cell tap opens the (brigadir, date) comment THREAD with this table's own
  formula** (the operator's choice) — unlike the fleet heatmap, whose tap is
  formula-only. `CommentModal basis="fulfil"|"eff"` renders ONE formula row
  instead of the P/A pair (its rows are data now, one list for all four bases),
  and the efficiency popup's capacity row expands into its own arithmetic. The
  per-person terms print at 2 decimals: they are multiplied by the headcount,
  and at 1 decimal the working a reader redoes by hand drifted up to 7.6
  minutes from the printed result; at 2 it reconciles to within one.
  Consequence to know: like the simplified comparison table, a comment is
  stored against (brigadir, date) only, with no record of which table's number
  it was about.
- **No Plan/Fact toggle** on either — one number, nothing to switch.
- **Their fullscreen opens at once, data or not**, and shows the loader or the
  empty state inside — the fleet heatmap's behaviour. The first cut guarded the
  overlay on data, so on an empty or still-loading period the button armed
  `openFull` and drew nothing, and the overlay then opened by ITSELF the moment
  data arrived.
- **ONE fullscreen state** on the page (`openFull`: null | full | full90 |
  simple | heatmap | fulfil | eff) replaced a boolean per overlay: with six overlays at
  one z-index, "one at a time" has to be structural, and the simplified table's
  flag had slipped past the Escape handler, which only knew the two originals.
- Everything is derived per request from the existing `/api/heatmap` payload —
  no backend change, nothing stored.

## Every /zagruzka table owns its colour bands

From **2026-09-24** (the operator's directive) each of the five tables on
`/zagruzka` — «To'liq hisob», «Smena boshi va Smena oxiri Zagruzka», «Карта
нагрузки», «Reja bajarilishi», «Samaradorlik» — carries its OWN colour bands,
edited from a sliders button in the table's own header (ADMIN only, inline and
fullscreen). The admin panel's «Ko'rinish» tab, where two editors served all
five, is gone.

- **`routers/settings.ZAGRUZKA_BANDS` is THE registry** — table → field →
  (setting key, default) — served on `GET /api/zagruzka-bands` together with
  the keys a save writes and the `shared` tables.
  `components/zagruzka/TableBandsModal.jsx` holds the editor (the old admin
  `SegmentBar`, moved), `BAND_TABLES` (each table's bars and the readers that
  size them) and `useZagruzkaBands`. The write is the ordinary
  `PUT /admin/settings`, so it stays admin-only, action-logged and undoable.
- **Two tables hold the PLATFORM-WIDE keys** and re-colour other pages when
  saved: the load heatmap owns `heatmap_segments`, the full table the two
  `comparison_*` keys — what `/heatmap-thresholds` / `/comparison-thresholds`
  serve to Overview, Kunlik, Smena kunligi, Yacheyka zagruzkasi, the brigadir
  profile and every funnel. Nothing else edits those keys any more, so moving
  these two tables onto keys of their own would leave those pages with no
  editor at all. Their modal names the pages BEFORE the save.
- **The other three have keys of their own** (`heatmap_fulfil_segments`,
  `heatmap_eff_segments`, `comparison_simple_p_segments` /
  `comparison_simple_diff_segments`), seeded ONCE from the keys they used to
  share by `startup.split_zagruzka_bands` (flag
  `zagruzka_table_bands_2026_09_24_v1`, insert-only; changing what it seeds
  needs a NEW key) — so no table changed colour when this shipped. A key with
  no row reads the same default its source does. The sixth table, «To'liq
  hisob · Verifix × 0.9» (2026-09-25), has its own pair too, seeded from the
  full table's under a flag of its own — see its section.
- The funnel on `/zagruzka` keeps the full table's D bands, as before.
- A bar is sized off the SAVED bands and the period's own values (read through
  the table's own functions), never off the draft — a bar that grew as an edge
  was dragged toward its end would rescale under the pointer.

## «Excel» on every /zagruzka table (2026-10-19)

The operator: every table on «Zagruzka foizi» gets its OWN Excel button, the
file styled exactly as the table, and the data cells FILLED with their colour
rather than a coloured number. Six buttons — the three comparison tables (in
their own header, beside the icons) and the three heatmaps (in the card
header) — each one file of one table. The funnel is a chart and has none.

- **The table describes itself; the server only lays it out.** Every figure
  on those tables is computed in the browser (`utils/formulas.js`), so a
  Python twin would be a second spelling. `ComparisonTable onExport` and
  `HeatmapChart exportRef` build a grid spec off the very readers, approval
  gate, sort, summary mode (AVG / MIN / MAX) and P·A or D view the grid is
  drawn with, every cell carrying the band colour it is painted with;
  `utils/gridExport.js` is the vocabulary and the POST; the page
  (`Zagruzka.jsx` `exportTable`) adds the title, the period the tables were
  served, the plant / shift / brigadir scope and the time. Both props are
  opt-in — /zagruzka-cell and /workers draw no button.
- **`services/grid_export.py` is the layout** (`POST /api/zagruzka/export.xlsx`,
  `require_page("zagruzka")`, logged as `export.zagruzka`, delivered by
  `xlsx_delivery`): the gold header in upper case with the name header over
  both rows, the screen's thick edges (name column, each date group, the
  summary column, over the footer), a value as a real number under a `0"%"`
  / `+0"%"` format filled with its band colour and its contrast ink, «—» on a
  blank day, a pending day as a diagonal-stripe fill with its ⏳ / 👥 / 📄,
  the footer after a spacer row, and the colour key under the table (one band
  per line, the pending icons the file holds). Frozen header + names,
  landscape, fit to width. Bounded (`MAX_COLS`, `MAX_ROWS`, `MAX_CELLS`); it
  computes nothing.
- The pinned summary is in the file on a phone too, where the screen drops it.

## «Zagruzka foizi» on a phone (`/zagruzka`, 2026-09-29)

Users reported the page unusable on a phone: the grids' 172px name column took
over half the screen and left under two days in view, an invisible legend held
~100px of nothing above every comparison table, and the latest days sat at the
far right. The operator's constraint: **desktop is perfect and must not
change** — every rule below applies below `sm` (640px, `useIsMobile`) only,
and 768 / 1280 / 1440 were checked pixel-identical to before.

- **`phoneFit` is an OPT-IN prop on `HeatmapChart` and `ComparisonTable`**
  (only /zagruzka passes it; /zagruzka-cell and /workers are untouched). On a
  phone it drops the desktop's blank pad columns, SNAPS the columns to the
  screen (as many whole days as fit beside the names — all of them, stretched,
  when they all fit — with the name column taking the remainder), opens the
  grid scrolled to the LATEST day (re-aimed only when the period changes), and
  snaps swipes to whole days (`scroll-snap`).
- **On a phone the names are NOT a sticky column** — each grid is TWO tables
  side by side (`renderTable(part)`: "names" beside a horizontal scroller of
  "data"; desktop draws "all", one table, as before). Opened on the latest day,
  a sticky name column sat over hidden days at rest, and a sticky cell is a
  layer of its own that real devices can draw a frame late while scrolling —
  the operator saw the days flash through the names. With nothing under the
  names nothing can show through. The two halves keep one row pitch: the
  names' cells carry the days' 1px rules (transparent), header rows are a
  fixed 30 (+24) px, and the wrapper is `align-items: flex-start` (stretched to a fullscreen
  wrapper's height the days half became a scroller of its own and slid out of
  line). Never make those names sticky again.
- **Names are «Surname I.»** (`surnameInitial`, now in `utils/personName.js`)
  in a 120px column, and a name too long for one line takes a second line in
  the same 34px row — a touch screen has no tooltip to read a clipped name from.
  `labelFor` is called `(key, full, tl)`, so a module-level speller stays a
  stable reference for the memoised grids.
- **The grids bleed to the card's edges** (the card's p-4), the name text
  aligned with the card title at 16px.
- **Comparison tables**: the D legend sits UNDER the grid and only in the D
  view (appearing there moves no row); a value's button fills its whole
  half-cell as the tap target; the P·A/D toggle stretches over the row and the
  icon buttons (38px, meeting the toggle) wrap to their own line as a group
  before anything runs off a 320px card. Heatmap cards without a toggle keep
  their icons on the title's line.
- **Fullscreen heatmap on a phone scrolls down inside the overlay** (the date
  row scrolls with it, as inline) — left at its content height it ran past the
  screen and the last rows were unreachable. (The same cut-off exists on
  desktop with many rows; not touched, desktop being out of scope.)
- Small print on the page is 11px on a phone (notes, legends, the tap hint,
  grid headers); the toolbar's filter chips wrap (`chipsWrap`, which the
  template applies below md) instead of being clipped.

## «Odam soni» is typed, and counted, only where the day HAS A PLAN (2026-10-26)

The operator, after the 45-vs-66 contradiction below: «1. Make it only possible
to write "Odam soni" on the cells with plans. 2. Ignore the "Odam Soni" where
they're written on the cells without plan.» Both halves are ONE test, spelled
once.

- **THE RULE.** A work centre takes a typed «Bugungi fakt» headcount, and has
  one counted, only while the day's catalog and quantities give it **nonzero
  PLAN MINUTES**. That is `pp_calc`'s own `q_by_wc` membership (it accumulates
  `if total_labor:`) on the page and `zagruzka_source.planned_wcs` — `wc_labor`
  filtered to `plan > 0` — on the загрузка side, both compared through
  `cell_lookup.norm_code`, so neither can read «has a plan» the other way. A SQL
  join cannot answer it: the minutes need each day's OWN catalog (`pp_catalog`)
  and the per-line overrides on top of the shared quantity.
- **A unit-day that plans NOTHING locks nothing**, and that escape is
  load-bearing twice over (`day_has_plan` in the engine, an ABSENT key in
  `planned_wcs`). A brigadir must never be shut out of typing their own day
  because the SAP file carrying it has not been uploaded yet — the plan usually
  lands a day or more ahead (`_SLICE_FWD`), but «usually» is not a rule somebody
  can work a shift against. And the same pins are the ojidaniya weight, so
  dropping every one of them on a planless day would silently read that unit's
  whole waiting as 0 minutes. Nothing is lost: such a day has no загрузка either
  way (`no_labor`).
- **Ignored at ONE door — `zagruzka_source.typed_pins`** — so every reader of a
  typed pin follows it: `unit_people` (the fleet's ΣN, i.e. `official_hc`),
  `typed_people`, `cell_pins` and `cell_people` (the ojidaniya weight and
  /zagruzka-cell's per-cell headcount), the automatic check #1 and every gap
  report. A second reading of «which pins exist» is exactly the contradiction
  this closes. The planned set is computed once per (units, range) per Session
  (`_planned_for` on `db.info`): nothing writes a plan QUANTITY and then reads a
  typed pin in the same session, because the two doors that move quantities (the
  SAP upload, /override) answer through `compute_dashboard`, which computes the
  set itself from the rows it is handed.
- **Refused at BOTH write doors** — `save_staffing` (the «Bugungi fakt» tab) and
  `wc-override` (the admin's per-centre pencil), through
  `production._refuse_unplanned_pin`, structured 400 `wc_no_plan`. **A NEW or
  CHANGED pin only**: an unchanged re-send and a CLEAR are always accepted, the
  `_refuse_orphan_pin` rule and for the same two reasons — the tab re-sends
  every row on every Save, so a strict refusal would block a save about another
  work centre for as long as a stray stood, and a pin already stored must always
  be removable. An echoed group Σ is not a typed figure and is not judged.
- **The page shows the stray and lets it go.** `pp_calc` publishes
  `people_locked` per work centre (and the stored number as `people_ignored`,
  per centre and per group) while `people` / `people_overridden` / the load read
  as the uncounted row this now is — so every figure below resolves exactly as
  for a work centre nobody typed, with no second rule. A locked row wears the
  neutral «Rejada yo'q» chip, has NO input, prints its pin STRUCK THROUGH with a
  ✕ that empties the draft (the next Save clears it), and «—» when there is
  nothing to show. Its draft seeds from `people_ignored` and its body re-sends it
  (`lockedStaffRows`, `storedPin`, used by the Save AND the undo snapshot):
  seeding from `people` would make every Save silently delete a stray nobody had
  asked about. The admin dialog shows the same number read-only beside an
  editable штатка. The chip is driven by the LOCK and never by `pin_only` — on a
  day whose plan has not landed nothing is locked and every pin counts, and a
  chip there would say the opposite.
- **A locked row is out of BOTH counts** — the backend's `people_typed` /
  `people_untyped` (`countable` in `compute_dashboard`) and the client's
  `peopleCountable`. «Nobody typed it» and «nobody may type it» are different
  facts, and counting the second as the first put a «*» on ΣN and a «2 of 3»
  under it for a box that does not exist.
- **Consequence to know, and it is the price of the rule**: such a cell-day
  loses its ojidaniya WEIGHT with its headcount, so its waiting leaves the unit's
  headcount-weighted mean. That is not a new state — it is precisely the state of
  a cell whose work centre nobody typed, which `idle_source.unit_downtime` has
  always left out of both sides. Nothing is stored, so every day from
  `ZAGRUZKA_FROM` re-reads under the rule at the next restart, and the three
  stray pins below need no cleaning: they are inert.
- **Measured on the real case** (a seeded reproduction of Niyozov Izzatilla's
  24.10): page ΣN 45 with no «*», `unit_people` 45, the 21 on the planless B2743
  shown struck through and counted nowhere; a new pin on it refused 400 on both
  doors, an unchanged re-send and a clear accepted, a new pin on a planned work
  centre accepted; with the plan quantity dropped, nothing locked and ΣN back to
  66. Seven engine cases (the register row, the `pin_only` row, the escape, a
  pin in another CASE of the planned code, group pins on a planless centre, an
  ordinary planned day, and a caller passing no `norm_wc`) assert the same.
- **Deliberately NOT exempted**: a work centre with quantities but no
  Трудоемкость reads zero minutes and IS locked — the figure the load divides by
  has no numerator either way — and a pin on it is refused; filling the
  Трудоемкость in is a catalog edit, not an exception here. The штатка pin is
  untouched on every row.

### What it replaced: a typed headcount that was ALWAYS on the page (same day)

On 25.10.2026 Niyozov Izzatilla's 24.10 showed ЛЮДЕЙ (Σ) **45** on «Файл
загрузки» and ОФИЦ. ЧИСЛ. **66** on «Ежедневно» — and still did the next day, on
the current bundle, on a day already closed. Both figures are the TYPED «Bugungi
fakt» pins; they read different SETS of them. The page counted a pin only where
its code was on the day's PANEL (`pp_calc.wc_codes`: the active register, the
codes the day's quantities give PLAN MINUTES to, and — the first fix, v4.331.0 —
every code carrying a typed headcount), while the загрузка counted EVERY
`pp_work_center_daily` row with `people IS NOT NULL`. The operator first chose
«show it on the page, so it can be deleted»; the rule above is the second answer
and it supersedes the first. What survives from it:

- **`pin_only` is still published per panel row** and is still the one thing a
  reader cannot work out for themselves (the «Bugungi fakt» table carries no
  minutes column, so «B2743 · 21 · —» looks exactly like a work centre that is
  part of the day). The SERVER knows why the row is there; the page must never
  guess it from `total_labor == 0`, which an ordinary registered centre with
  nothing planned today also reads. The current page marks rows off
  `people_locked` instead, and `pin_only` stays on the payload for a tab open on
  an older bundle.
- **Clearing works because the save only touches codes the body LISTS.**
  `save_staffing` builds its plan from the request's rows, so an unlisted pin
  survives every Save — which is exactly why the 21 outlived them.
- **MEASURED on production, 26.10.2026** (`pin_mismatch_report` v2, the answer
  kept here so nobody re-derives it): **three** unit-days since `ZAGRUZKA_FROM`,
  all counted in the загрузка — Niyozov Izzatilla 24.10, page 45 vs 66, a 21 on
  **B2743** with no plan that day (beside an identical 21 on B2942: it looks
  typed twice), 63.9% → 93.7%; Sultonova Umida 20.09, 40 vs 43, a 3 on **A2703**,
  which sits inside her own run A2701 · A2702 · **A2703** · A2704, 84.8% → 91.2%;
  Ibragimova Sayyora 02.09, 22 vs 25, a 3 on **A2898**, a code her unit has no
  register row for at all, 124.0% → 140.8%. Under the rule above all three are
  ignored, so those unit-days read the higher figure and nothing needs cleaning.
- **TEMPORARY, READ-ONLY** `services/pin_mismatch_report.py`,
  `startup.report_pin_mismatch` (flag `pin_mismatch_report_2026_10_26_v2`,
  ~150 s after boot, both entrypoints) is what found them. Its question is
  answered and the mismatch it looks for can no longer exist, so the module, the
  startup pair and both calls may be deleted; changing what it reports needs a
  NEW key.
- **v1 answered «no mismatch» and was WRONG — the lesson, not the bug.** It
  rebuilt the panel as «the active register ∪ every active catalog line's code»,
  WIDER than `wc_codes`: a code with lines but no minutes that day read as «on
  the page», so `page_n` equalled `load_n` and the very unit-day the report was
  written for did not appear. **A report that compares two numbers must not
  derive both from one of the two sides** — v1's `page_n` and `load_n` both came
  off one `fold_pins` map, differing only by a code filter it had reconstructed
  by hand instead of mirroring.
- Still open, and a decision of its own: folding two SPELLINGS of one code
  through `norm_code` in `typed_pins` ITSELF, so a Cyrillic twin («A code is
  LATIN») cannot split one work centre in two. The plan filter above normalises
  both sides, so it can never drop a pin over a twin — but the pin's own key
  stays the raw string, so `unit_people` still counts two spellings as two work
  centres. `cell_pins` folds them through `wc_group.wc_key`; `unit_people` never
  got it. Nothing in eight weeks of production data needed it yet.
