# «Hisobotlar» and the on-time report

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## «Hisobotlar» — the period report (`/reports`, Laboratory, 2026-10-26)

The operator, with TopSim's «Report System» as the picture: one screen that
reads a PERIOD the way a management report reads it — a list of sections down
the side, each a table of figures with the period and the ones before it side
by side — «downloadable as professional document». Page key **`reports`**, in
the Laboratory nav group, **ADMIN-ONLY until the operator opens it on the
Access tab** (`DEFAULT_PAGE_ACCESS["reports"] = []`, the /ontime and /live
rule — every section reads the whole plant). `services/reports.py` folds,
`routers/reports.py` fetches and delivers, `pages/Reports.jsx` +
`pages/reportsText.js` + `components/reports/` draw it.

- **Nothing is measured, in either file.** Every figure is one another page
  already prints, read through that page's own code — the
  `services/brigadir_board.py` rule, and why `services/reports.py` imports no
  router and makes no query (the `ojidaniya_deck` split). Section by section:
  **Ishlab chiqarish** — `plan_fulfillment.build`'s own minute totals (the
  /plan page's figure; plan, fact and shortfall PRINTED IN HOURS, whole, from
  2026-11-02 — the operator, who dropped the three day counts the same day), «Samaradorlik» the /zagruzka heatmap's AVG through
  `brigadir_board.efficiency`, «Smena boshi / Smena oxiri zagruzka» (from
  2026-11-02, the operator; in the summary and Key figures too) the P and A
  halves of /zagruzka's «Smena boshi va Smena oxiri Zagruzka» table pooled
  like its AVG corner — Σ prod_plan (resp. prod_actual) ÷ Σ 480 × 0.9 × typed
  headcount over the closed unit-days that half has a figure for
  (`brigadir_board.shift_load`, the twin of `simplePlanUtil` /
  `simpleActualUtil`), no delta colour; **Xodimlar** — /workers' own `att_rate` through
  `brigadir_board.attendance`, and `turnover.month_payload`; a «Verifix —
  qo'shimcha ish vaqti» table (2026-11-02, the operator: «Overtime should be
  taken from Сверхурочно»): Сверхурочные (34) in hours, TWO rows (the
  operator the same day: direct workers, counted in the загрузка, and indirect
  ones, by the worker's Verifix job through `kpi_calculator.is_direct_role`)
  (`verifix_month_kinds.REPORT_KINDS`). The other time kinds — Явка (23),
  Отсутствие (26), Свободное время (27), Отгул (31), Ранний уход (25),
  Опоздание (24) — were in this table until 2026-11-04 and are on «Odam soni ·
  Davomat» now (the operator: «we don't need these figures apart from
  Overtime … put them in Attendance screen»; `ATTENDANCE_KINDS`, see «Odam
  soni — three pages»). They are READ from `core/timesheet$export` for the whole month and STORED
  (`services/verifix_month_kinds.py`, table `verifix_month_kinds`, meta in app
  setting `vfx_month_kinds2:<ym>`; every kind stored as «<id>:d» / «<id>:i»,
  the job off the stored `verifix_org` read): the current month every 3 hours (an hourly
  job at :50 decides), the month before until the 7th, a catch-up 240 s after
  boot, and any month the report or the Attendance page asks for that was
  never read (`want`, a background read — «—» until it lands). A person is placed by their CURRENT
  Verifix org unit → cell → brigadir (Verifix keeps no history); every day of
  the month counts, closed or not. A read cut short keeps the last complete
  one. The attendance-based overtime (effective hours − «Явка») shipped an
  hour earlier is gone; **Kutish** —
  `routers/downtime._downtime`, which IS the /downtime page's computation;
  **Xarajat** — `ojidaniya_cost.build`, the «Xarajat» tab's own tree;
  «O'z vaqtida yetkazish» (the Executive summary only, after the two loads,
  the operator 2026-11-02) — the /ontime page's headline through
  `ontime.build`, Σ delivered on time ÷ Σ ordered, one decimal
  (`routers/reports._ontime_by_month`); the logistics sheet names no brigade,
  so it is printed only while the report reads the whole plant (no plant,
  shift or brigadir filter) and is «—» otherwise;
  **Sifat** — the Quality closure rate through `brigadir_board.quality`
  (actionable records, hair out, attributed by `quality_attribution` — the
  record's cell on its date, else «Отв. бригадир»), plus «Shikoyatlar soni»,
  every record filed whatever its status, HAIR INCLUDED (the operator, the
  same day — only the closure rate stays hair aside)
  (`brigadir_board.quality_filed`, the same attribution) — the figure the
  Executive summary carries for Quality instead of the share resolved (the
  operator, 2026-11-02); «Asosiy ko'rsatkichlar» carries both;
  **Xavotirlar** — the /concerns register through
  `brigadir_board.concerns`. **Boshqaruv xulosasi** and «Asosiy
  ko'rsatkichlar» (TopSim's «Corporate Key Figures») lift their rows out of
  the sections they belong to, so the two can never disagree.
- **«Qamrov» is Verifix's OWN counts, of the загрузка's units** (2026-11-03,
  the operator: «the official-Verifix number of active cells, and … of shift
  managers, supervisors and leaders»; the same day «Units» and «Cells that
  stopped» left the table, the cells were narrowed to «supervisors which we
  consider on Zagruzka — we dont [want] supervisors of cleaning or logistics»,
  and, asked, the supervisors and leaders with them). Four rows: «Faol
  yacheykalar», «Smena menejerlari», «Brigadirlar», «Liderlar» (no «(Verifix)»
  in the names). `services/verifix_scope.py` is THE rule, read off the STORED
  org (`verifix_org.stored`, never a Verifix call) per month on its last day
  (today for the running month — a stock, so its change is never withheld).
  A **cell** counts when Verifix has its `cell_nodes` node active that day
  (opened by it, not closed by it; a passive one with no closing date counts
  on no day) AND its cell here (by `vfx_division_id`, else code) stood that
  day (`cell_links.map_on`) under one of the report's units — `board_units`,
  i.e. non-archived, `zagruzka_on`, in the viewer's plant / shift / brigadir
  scope. **Leaders** are seated in a counted cell; **brigadirs** stand over
  one (the nearest division upward holding any — `verifix_org.nearest_over`,
  the `brigadirs_over` walk, each person once); **shift managers** are
  plant-wide (`verifix_org.plant_of`, the division tree's names —
  `brigadirs_kpi`'s rule, moved there), «—» under a shift or brigadir pick.
  A person counts when employed that day (`turnover.employed_on`) with a job
  naming the role — `verifix_org.role_of` (leader → brigadir → shift-manager:
  «смен» + a head word, the 25 Oct report's rule, moved there; assistants,
  deputies, «и.о.» never), the job on a past day the HR journals'
  (`category_compliance.standing`), the place their CURRENT org unit. No org
  read, or a thin one, leaves all four «—».
- **«Kutish, ishlangan vaqtdan %» — idle as a share of WORKED time**
  (2026-10-31, the operator's rulings, asked one by one;
  `services/idle_share.py` is THE rule): Σ(N·T) ÷ Σ worked minutes × 100.
  Numerator per (cell, day): T = the union of the cell's stopped, approved
  ranges, N = the typed «Bugungi fakt» share (`idle_source.cell_headcount`),
  i.e. the person-minutes /downtime and «Xarajat» read — the operator chose
  matching those over Verifix people, knowing a mistyped headcount moves the
  %. **Tozalash (Cat H) is out of the numerator** (its hours stay worked time).
  Denominator: Σ `effective_hours` («Отработано» − early arrival) of the
  attendance rows the загрузка counts (`_counted_hc`), matched by the cell's
  Verifix code. A cell-day counts only with BOTH halves (a typed N and worked
  minutes); from `ZAGRUZKA_FROM` only (August reads «—»). Follows the viewer's
  category lock like the rest of «Kutish». Shown in the «Kutish» total block
  with its two sums under it (odam-daqiqa), in the Executive summary and in
  «Asosiy ko'rsatkichlar»; one decimal, a rise is red. Not built: a per-unit
  column, a cap on a cell where N·T passes its people's worked time.
- **`brigadir_board.attendance` carries its three COMPONENTS now** (`roster`
  / `came` / `leave`, beside the `v` and `days` /leaderboard reads, which are
  untouched): a PLANT figure is Σ (came + on leave) ÷ Σ listed — **pooled,
  never a mean of per-unit percentages** (the comparison tables' 2026-10-19
  AVG ruling, applied to every plant-level percentage here). `quality` and
  `concerns` already carried theirs.
- **The period is a calendar MONTH** — the platform's own KPI month
  (`leaders_kpi`, `turnover` and `category_compliance` all count by it) — and
  every table carries the picked month and the one before it (`HISTORY` = 2,
  TopSim's «Previous Period · Current Period» — the operator, 2026-11-02: «we
  don't need 3 months of comparison, just 2»; it was 3 until then), oldest →
  newest, the picked one last and emphasised. A month that ended before the
  platform's first closed day (`brigadir_board.data_floor`) is dropped: it
  could only read «—» in every row.
- **A periods table names each figure's UNIT** (same day, TopSim's
  «MEUR / %» column): Figure · O'lchov · the two months · O'zgarish.
  `reportsUtil.uomOf` picks the kind off the row's key (its last segment, so
  the mixed summary tables agree), else its `fmt`; the words are `T.uom`
  (% · daq · mln so'm · ta · kun · odam-kun · kishi · odam-daq — money is
  printed in MILLIONS, two decimals, «MUZS» in English, TopSim's «MEUR»: the
  operator, 2026-11-02). The attendance
  counts are PERSON-DAYS (the roster summed per day), never «kishi». Since the
  column says «%», a periods cell prints the bare number (`fmtCell(v, fmt,
  true)`). The document carries the same
  column (`words.rowUnits`, keyed «section.block.row» — one idle category is
  minutes under «Kutish» and so'm under «Xarajat»; a tab sending none gets a
  file without it). Figure names are medium weight in `--text-1`, headline
  rows semibold.
- **Number columns are narrow and fixed — TopSim's layout** (the operator,
  2026-11-02: «we don't need big spaces for number columns»). In
  `ReportSection.jsx` a month and the change are 100px (`NUM_W`), the unit
  88px (`UOM_W`); the figure's name takes the rest of the card.
  A month header is two lines — the month, then its year (and «1–26» while it
  runs). Fixed rather than shrink-to-fit, so the months line up from card to
  card; a wider value still widens its column.
- **A reader puts the figures in any order** (the operator, 2026-11-02: «I
  should be able to move Figures freely»). «Tartib» in a card's header arms a
  grip on every row — drag it (mouse or touch, followed on the window), or
  focus it and press ↑ ↓; «Asl tartib» puts the server's order back, «Tayyor»
  disarms. Saved PER PROFILE in ui-prefs `reports.rows`
  (`components/reports/useRowOrder.js`: `{"<section>.<block>": [row keys]}`,
  the server's own order stored as no entry, arrow-key runs saved once after
  600 ms); a figure the saved list does not name goes at the end. The download
  sends `order` and `routers/reports._apply_order` lays the file out the same
  way — a tab that sends none gets the server's order.
- **A month still running compares only its RATES.** A total over 26 days
  against a whole month says nothing a reader can act on, so the delta on a
  CUMULATIVE row (`reports.CUMULATIVE`) is withheld while the picked month is
  partial and the cell says why; a rate keeps its delta. The column header
  names the days it actually covers («Oktyabr 2026 · 1–26»). **Every table
  carries the change column** (the operator, 2026-11-02: «All sections should
  have change column»): `compose` gives every section row the
  `_headline_row` delta, CUMULATIVE now names every month count (days, open
  left, priced minutes…), the column shows whenever there is a month before,
  its colour follows the row's own section (`DeltaCell secKey`), and the file
  carries it too (`deltas`, the page's `deltaText`).
- **A figure the platform has no source for is NOT in this report, and the
  report SAYS so.** TopSim's financial half — equity, WACC, NOPAT, EVA, the
  cash-flow statement, the balance sheet, contribution margin, inventory, R&D,
  market research — has no source here, and a report that invented one would
  be worse than one that is silent about it. `reports.MISSING` names them, the
  page prints that list under every section, and the document carries it too.
  **Never fill one of those rows from anything but a real source.** `None` is
  «no answer» everywhere and prints «—», never 0 — which is what keeps
  «nothing filed» apart from «nothing resolved».
- **ONE block shape — a `periods` block** (a figure per row, the months
  across). **No table lists brigadirs** (the operator, 2026-11-02: «we don't
  need any data by supervisors»): the per-unit tables every section carried
  until then («Ishlab chiqarish / Davomat / Kutish / Xarajat / Sifat /
  Xavotirlar — brigadalar») are gone from the screen, the payload and the
  document, and so are the inputs only they read (`brigadir_board.fulfillment`,
  `plan_fulfillment`'s per-unit rows, the idle and cost per-unit splits). Every
  figure is the scope's whole; a brigadir's own figures live on the pages that
  own them. The brigadir FILTER stays — it narrows the whole, it lists nobody.
  The page renders only `periods` blocks and skips any other kind. «Kutish»
  and «Xarajat» carry no table BY CAUSE either (the same day: «remove this
  one too», «we dont need this table also») — the causes are /downtime's.
  **«Xarajat», «Sifat» and «Xavotirlar» are no longer SECTIONS** (the same
  day: «we dont need section called Cost of Waiting, Quality and
  Concerns»): `reports.BUILT_ONLY` still builds them, because the Executive
  summary and Key figures lift their headline rows (cost of waiting,
  complaints, concerns resolved %) out of them, but `SECTIONS` — what the
  page lists and the file lays out — leaves them out. Personnel's «Yopilgan
  kunlar» row is gone too. **«Kutish» joined them on 2026-11-03** (the
  operator: «we also dont need Idle Time section»): still built for the
  summary's and Key figures' waiting rows (minutes, % of worked time, per
  day), shown nowhere on its own.
- **The document is `assistant_documents.build`** — the house builder, never a
  second layout engine — as **pdf · docx · xlsx** (`POST
  /api/reports/export.{fmt}`; a format it does not know is refused, never
  quietly swapped). The WORDS come from the SCREEN (the page posts the labels
  it printed, in the reader's language, plus each cell as `fmtCell` spelled
  it), the structure is rebuilt here: `grid_export`'s own rule, so the file can
  never name or state something the page does not. Delivered by
  `xlsx_delivery.deliver_file` — a browser downloads it, inside Telegram it
  lands in the caller's chat. Logged as `export.reports`.
- **Each MONTH is built and kept on its own; the screen and the file read the
  same kept months** (2026-11-05 — the operator: «it takes 5–6 s to open»;
  measured on production: November's report 7.6 s, October's 10.8 s, spread
  over zagruzka · attendance · idle share · plan, 1.3–2.5 s each).
  `_month_part` is one month's figures (each reader buckets by day, so a month
  alone gives the figures it gives beside its neighbour), `_merge` puts the
  months together for `compose` (a unit a month lacks reads None there, which
  every fold skips like the zero it replaced). A FINISHED month is kept 30 min
  as built, then served while a new build runs behind the reader
  (`_FINISHED`); the month still running 2 min, then the same way (`_RUNNING`)
  — the 12 h / 1 h past which a month was built in the request went on
  2026-11-13, the next point.
  A viewer who wrote since is served the kept month too, with a build that
  started after their write running behind it (`KeptAnswers(…,
  writers_refresh=True)`); the payload says `state` «refreshing» and the page
  asks again (3 s for a minute, then 20 s) and prints «Yangilanmoqda…», else
  «Tayyorlandi: HH:MM» — `built_at` is the OLDEST month's build. Every build
  logs and carries `timings` per section (`_Clock`). A month's build reuses
  what its readers share (2026-11-05, after a cProfile on production): the cell
  weights and unit waiting once per build (`idle_source.reuse_weights`, opt-in,
  read-only sessions only), the plan totals without the share rule or row lists
  (`plan_fulfillment.build(totals_only=True)`), the Quality register read once
  for both counts (`quality_attribution.unit_rows_both`), and the code / title
  normalisers remembered per text (`cell_lookup._norm`,
  `kpi_calculator._direct_title`, `workers.normalize_role`). The default report (this
  month and the one before, the whole plant) was built two minutes after every
  process start (`reports.warm`) until 2026-11-13 — `keep_fresh` now, the next
  point. The export reads the same
  parts (a deep copy of the sections it wants, because it writes the page's
  formatting onto the rows).
- **The months are STORED, and the reports readers open are kept built by the
  clock** (2026-11-13 — the operator: «this screen is taking too much time to
  load and open», the page on October). Measured on production that day: with
  its months kept the report answers in 0.19 s; a month's build is 3.3–4.9 s
  (September 4.5 s the first time and 3.3 s again, October 4.9 s, November's
  13 days 3.7 s — загрузка 1.2–1.9 s, idle share 1.1 s and attendance
  0.5–0.6 s are three quarters of it), and the two months are built one after
  the other inside the request. The kept months lived in the worker's MEMORY,
  a backend deploy swaps the worker (140 backend deploys in ten days, 5–24 a
  day), the warm-up built November + October only, and a browser that last
  showed October asks for October + September again — so September was built
  in the first reader's request after every deploy, both months in the two
  minutes before the warm-up, and any month nobody had opened for 12 h.
  - `services/kept_store.py` keeps a `KeptAnswers`' answers in the table
    `kept_answers` — one row per (store, key): the answer as typed JSON and
    when its build started. `_FINISHED` and `_RUNNING` have a store each.
    Every month a build keeps is written there; a month the process does not
    hold is read from there before it is built.
  - **A month ANOTHER process built is served at once, however old, and
    rebuilt behind the reader once** (`state` «refreshing», the page's own
    «Yangilanmoqda…») — never served as the fresh one: it predates this
    process's code, and whatever its viewer wrote before the restart. Once
    that build lands it is this process's month and the 30 min / 2 min rules
    above apply. So a reader waits for a build only when a month was never
    built in their scope. The operator took the other side of this knowingly:
    a stored month is SHOWN for the seconds its rebuild takes, where a month
    past 12 h used to be built in the request.
  - **`keep_fresh` keeps three months built — the month still running, the
    one before and the one before that, the whole plant** — which is both
    reports a reader opens (this month's, and the last finished month's):
    every hour at :10 and two minutes after a start
    (`routers/reports.register_jobs`, mirrored in passenger_wsgi.py). The
    running month is built every hour; a finished one at 02:10, or at any hour
    once it is 36 h old; a month the store already holds young enough is not
    built, so a deploy by itself builds nothing. `warm` is gone.
  - **`FORMAT` (routers/reports.py) is the shape of a month's part, and rides
    the key**: bump it when a release re-shapes what `_month_part` returns, so
    a stored month of the old shape is never read. Forgotten, a stored month
    `compose` fails on is dropped and built in the request (`_report`) — one
    slow open, never a broken page.
  - `kept_answer.forget_all()` (the catalog follow, the turnover rule) empties
    the store too, and a row written before a forget is never read.
  - **The store is never in the way.** A fault — the database away, a value
    the codec does not know, a row that does not read back — is a miss or an
    unsaved month, and the page behaves as it did before the store. The
    payload says how it is doing, next to `timings`: `kept.from` (each month:
    «built» · «memory» · «store») and `kept.store` (saved · read · errors, and
    the last error, which names the value it could not keep).
  - A rebuild that FAILS leaves the stored month on screen under its own
    «Tayyorlandi» time (with the date, when that is not today) and is tried
    again a minute later; `keep_fresh` logs the month as «failed». The month
    is never blanked by a build that broke — and nothing on the page says the
    build is failing beyond that time: a warning there is not built.
  - The codec is exact, and checked: JSON alone turns a unit-id key into a
    string, and a report keyed by strings prints «—» in every row without
    failing anywhere. `save` reads its own text back and stores only an answer
    that comes back equal.
  - Not built: a faster build (three quarters of one is the загрузка and
    idle-share reads other pages share); the two months built side by side;
    the trudoyomkost store's 62 warmed days widened to the third month; a
    browser copy that survives a MINOR release (`offlineCache` drops it —
    104 minors in those ten days — and with the months stored the server
    answers in 0.2 s).
- **Every block title is DISTINCT across the whole report** (`caps` in
  `reportsText.js`: «Kutish — toifalar», not a second «Toifalar»). A
  workbook names each sheet after the last heading, so identical titles become
  «… (2)», «… (3)» and name nothing.
- **The scope is resolved ONCE**, in `_build`: the viewer's plant lock
  (`scoped_manager_ids`), the shift, the brigadir pick, then `board_units`'
  own rule. Every half is handed that set — the turnover half included, which
  applies the scope it is given and knows nothing of the viewer's lock.
- **The viewer's CATEGORY lock applies here too, and so does the cost
  audience** (v4.332.0, 2026-10-26 — the security review of this page found
  the page honoured the plant lock alone). «Kutish» is `_downtime`'s answer
  passed through `idle_scope.narrow_downtime(…, lock=viewer_categories(…))`,
  exactly as /downtime applies it: a «Kutish mas'uli» reads their own causes,
  a narrowed month prints NO flag count (the 50-minute flag is a whole-day
  fact — «—», never 0), an owner with no category left reads «—» in every row
  (`empty_scope`), and an admin's answer is byte-identical to before. The
  payload carries `cat_locked`, which the page draws as `CatLockNotice` over
  the sections carrying waiting figures (`LOCK_SECS`: summary ·
  figures) and the document names in its subtitle. «Xarajat» is in the
  payload for `downtime.COST_ROLES` only (admins and shift managers —
  `/downtime/cost`'s own rule, imported by `_sees_cost`, never re-spelled)
  and ABSENT for everybody else, as the tab is absent on /downtime for them;
  `services/reports._cost` returns no block for a `cost` of None, so `compose`
  leaves the section out, and the summary's «cells» row (read out of the cost
  tree) goes with it. **Both facts ride the kept-answer KEY** beside the
  scoped units (`_key`: the category lock and the cost audience), so one
  viewer's build is never served to another — `leaders_kpi._board_key`'s
  rule, and the rule for any narrowing added to `_build` later. Until then
  the section read the unnarrowed answer and the key held the scope alone;
  nothing leaked, because only admins, who carry no lock, could reach the
  page.
- Not built: a week or a year grain (the month is the KPI period), a chart
  (the document is tables), and any figure the platform does not already
  print.

## «O'z vaqtida yetkazish» — the logistics on-time report (`/ontime`, 2026-10-20)

The operator's request: «a new screen for the analytics of the last 4 tabs of
that google sheet … meaningful and easy to use without much of a noise». The
sheet is the logistics team's «on time report». It holds raw tabs «заявки»
(the stores' orders per day, material and wave) and «поставка» (production
receipts from SAP, with date and time), plus «заход» (each group's wave
windows). Four analysis tabs are computed from those: «заход», «свод»,
«свод по группам» and «средний on time». The platform reads the RAW tabs and
computes the four itself (the operator's pick, asked).

- **The arithmetic is the sheet's, exactly** (the operator's ruling, asked):
  `services/ontime.py` `evaluate` is THE formula. Per order day d, material
  and wave:
  - H1 = production on d inside wave 1's window.
  - H2 = production on d inside wave 2's window, minus wave 1's shortfall
    (floored at 0); when wave 1 had no order, the two windows' production
    together.
  - H3 = production on d+1 from 00:00:01 to wave 3's end — plus, for a
    window that opens before midnight (meat, «Мини Кухня NEW»: 22:00:01 →
    02:00:00), production on d from its start to 23:59:59 (from 2026-11-03;
    the sheet's own wave-3 formula does this, and leaving it out read meat's
    wave 3 far lower than the sheet).
  - Each share is capped at 100%. Wave 1's surplus is added to wave 2, and
    waves 1+2's surplus to wave 3.
  - Windows that OVERLAP («МЯСНАЯ ВЫПЕЧКА» and «Мини Кухня NEW», waves 1
    and 2 both 10:00–22:00) count the same production for both waves, as the
    sheet does. No notice on the page: the analysts ruled it is not a
    problem (2026-11-09).
  - Verified against the sheet: 310/310 product-wave rows on 18.08 and
    01.06.2026, every group × wave and group average to 0 difference, and
    «СДОБА» 90.84% = «средний on time».
  - **The sheet's «средний %» cell for 18.08 (99.04%) is a stale paste**: Σ of
    its own column gives 98.67%, which is what the platform prints.
- **Aggregation**:
  - A day, period or product total is quantity-weighted: Σ on-time ÷ Σ
    ordered.
  - A group's day is the mean of its waves; each wave is the mean of its
    materials («свод по группам»). A group's period is the mean of its days
    («средний on time»).
  - **WHAT is counted is the sheet's «свод» list** (from 2026-11-03, after
    «the page does not show the sheet's results»): exactly the product × wave
    rows «свод» A/D carries (`ontime_tracked`, read with every read), each
    with the windows «заход» gives the group «свод» C names — the sheet's
    E:F SUMIFS — while the ordered quantity is the product's own on
    «заявки» (by material, wave, date; no group). Until then the page
    counted every ordered product (~480 rows a day against the sheet's
    ~230), so every group and day figure differed (Sety Safiya was 37
    products on the page, 1 on the sheet). Checked on production 27.10–01.11:
    inside the list 185 of 221 group × wave × day cells equal the sheet;
    the rest are the sheet's own formula errors (below).
  - Ordered and not counted is named, never dropped: `notes.not_tracked`
    (not on the list — the pastry groups' wave 2/3 orders, whose group has a
    wave-1 window only and no «свод» row) and `notes.no_window` (on the list,
    no «заход» window for the wave). Both gather per group FOLDED, so two
    spellings of one group are one entry. A read with no «свод» tab counts
    every ordered product as before (`notes.tracked` false).
    From 2026-11-09 the page shows only the `no_window` notice: the analysts
    ruled that leaving out what «свод» does not list is the sheet's design,
    not a problem. `notes.not_tracked` is still served.
  - **The sheet's own errors, found 2026-11-03 (theirs to fix; the page does
    not copy them)**: «свод» LN4:LN390 divides by SUM(LK$4:LK$314), so row
    3 — and «средний on time» B, which reads it — runs over 100% (104–107%
    on 28.10–31.10); «свод по группам» averages «свод» rows 4:314 only, so
    products added below row 314 are missing from it; row 7–8 formulas read
    the row above ($A6, $A7) and carry #REF!; the Наполеон rows 316/319 take
    no wave-1 carry-over and 317/320 read the whole order day for wave 3;
    several rows carry no formula at all (ПП Пироги 285/291, Булочка с
    яблоком 35, Блинчики пустышка 10–12, Сомса с тыквой 183).
  - **A store «заход» A:C does not list** (W231, W232 on 2026-11-03) makes
    «заявки» L a VLOOKUP #N/A: those order rows count neither in the sheet
    nor here. The reader files them under `no_store` with the store codes,
    and the page names the stores in a notice of its own.
- **The reader** — `services/ontime_sync.py`:
  - Runs every 2 hours at :20 from 07:20 to 23:20 Tashkent, plus a boot
    catch-up 240 s in when the last good read is older than 2 hours. An
    admin can also press it: the page's refresh button, or the «Ma'lumotlar»
    row «O'z vaqtida yetkazish (on time report)» (`SheetSource` `ontime`).
  - Also reads «свод» A4:D (the list above). A read whose predecessor kept no
    list is due at boot.
  - **A read holds a Postgres advisory lock on a connection of its own**
    (`ontime_sync._claim`, from 2026-11-03). A deploy that retires the worker
    mid-read kills the connection too, so the lock is gone at once: an open
    `ontime_reads` row with no lock holder is a dead read, not «reading…».
    Such a row is closed as failed (`interrupted`) by the next read and by the
    boot catch-up, which then reads again (the cut read lost its 2-hour turn).
    Before this, the 17:20 reads of 2 and 3 Nov kept «Jadval o'qilmoqda…» up
    for 30 minutes and refused the refresh button meanwhile.
  - Reads through the platform's Google service account. Columns are found by
    HEADER text (`ORDER_COLS` / `RECEIPT_COLS`), never by position. Rows are
    read 40,000 at a time.
  - Dates and times are taken as serials or text. Unreadable rows are
    counted and named — per TAB and per reason, with their SHEET row
    numbers (2026-10-21, the operator asked which rows; `_Skips`, kept in
    the read's `notes.skipped_rows`: the column's header, the rows folded
    into ranges — 150 a reason, the rest counted — and up to six of the
    values that stopped them). A row of «заявки» or «поставка» with no
    material but something else in it counts as unread too (until then
    «поставка» dropped such rows silently). The page's notice names each
    tab's count; «Qaysi qatorlar» opens the list (`OntimeSkipped`). A read
    from before has counts only and says its rows come with the next read.
  - Stored whole in one transaction: `ontime_demand`, `ontime_receipts`,
    `ontime_materials`, `ontime_windows`, plus `ontime_reads` (the log). A
    failed read keeps the previous data and says why on the page.
  - Logged as `sync.ontime_read`.
- **Connecting it**: an admin pastes the LIVE sheet's id on «Ma'lumotlar» and
  shares the sheet as Viewer with the service-account e-mail shown there. A
  copy with «заявки» removed cannot be the source.
- **The page** — `pages/Ontime.jsx` + `components/ontime/` + `pages/ontimeText.js`
  (4 languages); page key `ontime`, **admin-only until opened on the Access
  tab**; «Ishlab chiqarish» nav group.
  - Three tabs over ONE request (`GET /api/ontime/analysis`):
    - «Umumiy»: KPIs against the previous period of equal length; the daily
      trend with the green edge; each wave; groups by late quantity or %;
      the 8 most-late products.
    - «Mahsulotlar»: every product with ordered, on time, late, % and per
      wave; days below the edge; a day strip.
    - «Kunlar bo'yicha»: group × day heatmap drawn by `HeatmapChart`, the
      /zagruzka grid (2026-10-21, the operator: «just as the design of
      tables of Efficiency and Zagruzka»): gold header, the AVG/MAX/MIN
      column, the day's total as the footer row (`pinnedRow`), the ontime
      bands as its segments. A wave picker (Hammasi · 1-zaxod …) reads one
      wave instead of the group's mean; a cell opens the group's products.
  - A product opens its working day by day (`GET /api/ontime/product`).
    Production times list only the receipts that count for that day: after
    the previous night's wave-3 window, and through the next night's.
  - Filters: group and wave (pinned), product. The period defaults to the
    last 14 days ending on the newest order day.
  - Group names in capitals are printed in sentence case
    (`ontimeUtil.calmName`).
- **Bands**: `ontime` in the admin-editable `status_bands` (≥ 95 green,
  85–94 yellow, below red). They are edited from the page's own sliders
  button (`StatusBandsModal figures/scope`), and every cell is judged by the
  whole percent it prints.
- **HOW LATE the late quantity arrived** (2026-10-21, the operator: «can we
  also see … how much late products are delivered, not just on time or
  not»). The platform's own measure — the sheet has none — and its late
  TOTAL is always the sheet's (ordered − on time), split by WHEN it came.
  - `services/ontime.lateness` is THE rule, per material, over the period
    padded 2 days back and 1 forward (`PAD_BEFORE` / `PAD_AFTER`). A wave's
    deadline = its window's end (d+1 for wave 3 and a window over midnight).
    Pass 1: every row sets aside the production the sheet credited it on time
    (its on-time quantity, the latest posts before its deadline, never before
    the order day's first window), so no post is counted twice. Pass 2: each
    late row, oldest deadline first, takes the earliest production still free
    after its deadline. Delay = posted − deadline. This is the sheet's own
    carry-over read as a queue (wave 1's shortfall is paid by wave 2's
    production first).
  - Bands: ≤ 30 min · 30–60 min · 1–2 h · 2–4 h · 4–8 h · 8–24 h
    (`DELAY_BANDS`); uncovered after `HORIZON_MIN` (24 h) = «yetkazilmadi»;
    uncovered while those 24 h run past the newest post read = «kutilmoqda»
    (`data_end`). These are choices, not the operator's rulings — one
    constant each to move.
  - Payload: `delay` (late · delivered · none · wait · avg · median · max ·
    bands) on the totals, each wave, each group (no bands), each product (no
    bands) and each trend day (bands); `GET /api/ontime/product` gives each
    day × wave its `late` with the pieces (delay, qty).
  - Shown: «Umumiy» → «Kechikish dinamikasi» (late quantity per day stacked
    by band; weeks past 92 days) beside «Kechikkanlar qancha kech
    yetkazildi» (average, median, max, arrived / not arrived / pending, the
    bands as bars); the waves card and the groups list name the average;
    «Mahsulotlar» has an «O'rt. kechikish» column (sortable; never-arrived
    sorts worst); the product window a «Kech» column per wave and a summary
    line. The bands are one orange ramp light → dark (`ontimeUtil.delayColors`,
    its own steps per theme, validated), «not arrived» the status red,
    «pending» grey.
- Not built: an export, and per-unit or cell attribution (the sheet carries
  neither).
- **Checked against the sheet's own tabs on production twice**: 2026-10-21
  (a one-shot DM, deleted) and 2026-11-03 (a temporary admin endpoint asked
  through the report door, deleted) — the second found the «свод» scope and
  the wave-3 rule above. Another check is a new temporary module, not a
  revival of either.
