# The shift report («Smena hisoboti»)

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## «Smena kunligi» on a phone (`/shift-daily`, 2026-10-03)

Top management was to be shown the app on a phone and the operator called the
pages «monstrous» there; this was the first page fixed (perfectionist loop on
the operator's Galaxy A16 — 384 × 832 — over a mock API with invented data).
Every change is phone-scoped (`max-sm:` or an opt-in prop) — desktop is
pixel-identical except the three things below that are not layout. The same
component serves a shift-manager's `/daily`.

- **The toolbar**: `DayStepper fillPhone` (+ `DateRangePicker fillPhone`) takes
  the first line whole; `FilterPanel chipsWrap` + the min/soat toggle share
  the second — the plant chip used to be pushed past the screen's edge.
- **KPI cards** (`KpiDeltaCard`, shared — PlanOverview and UsersActivity get
  it too) STACK below sm: sentence-case label with the (i) flowing after it,
  value, delta chip, the previous day, then the sparkline across the card.
  The chip used to stick out of the card; the previous-day line is
  `--text-2` there (`--text-4` was ~2.2:1 on dark).
- **A day with no figure is «—», never 0** (`idleOf` / `loadOf` return null),
  and the «< 90%» card is red only when the count is above 0. Desktop too.
- **The load chart** (`LoadBarChart phoneRows`) is one row per brigadir below
  sm: name (`surnameInitial`), a grey plan bar over the actual bar, figures in
  a right-hand column, a real colour key. The actual bar wears the LOAD bands
  (statusBands) — the colour the same figure has in the table; P−A keeps the
  comparison diff bands. The column chart had shown 5 of 18 brigadirs with
  the rest in an invisible sideways scroll, colliding labels, and plan and
  actual in one colour.
- **One colour scale for a load figure on the whole page** (desktop too): the
  brigadir table's «Yakuniy yuk» and the ranking's P/A bars wear the admin's
  load bands (the board's and the KPI cards'), the ranking's P−A the
  comparison diff bands. They had two scales of their own (a 119% amber in the
  table, green in the ranking). The table judges the figure AS PRINTED (one
  decimal — `printedLoadTone`), so «79.6%» is red under «<80% = red».
- **The ranking is not shown on a phone** (the operator's call): it repeated
  the table row for row.
- The page title at `/shift-daily` is the menu's «Smena kunligi» (desktop
  too); `/daily` keeps «Kunlik — Smena».
- Shared fixes that reach every page: the `Tooltip` (i) has a 44px tap pad on
  phones and is keyboard-reachable (unless it sits inside a button); the
  filter sheet's per-section clear says «Tozalash», not «Hammasini tozalash»;
  the header's menu button has an accessible name; the brigadir table's eye
  button is 44px on a phone with a name.
- Known and left: at 320px the min/soat toggle wraps to a third toolbar line
  and a KPI label's (i) can wrap alone; the shared header's bell/avatar/menu
  buttons are under 44px (global, not asked).

## The shift report («Smena hisoboti»), on the shift dashboard

From **2026-09-15** (the operator's directive) a status board for the shift
manager: one row per brigadir of their shift, six columns (five until
«Davomat» joined on 2026-10-12) —
`components/overview/ShiftReportTable.jsx` over `GET /api/shift-report`
(`routers/shift_report.py` fetches and scopes, `services/shift_report.py`
folds). It replaced a Google Sheet somebody filled and coloured by hand every
morning, with «XATO» wherever a brigadir had entered nothing.

- **It lives on the SHIFT DASHBOARD** — `pages/ShiftDaily.jsx`, under its four
  KPI cards (the operator's directive, 2026-09-16). It shipped on Overview (`/`)
  and moved whole: the component, its scope and its endpoint are untouched, and
  Overview no longer renders it. The shift dashboard is where a shift manager's
  DAY is read, and the board answers a question about that day.
  - **The day stepper does NOT reach it**, exactly as Overview's period picker
    did not — and the risk is sharper here, beside a control that moves every
    other figure on the page. Each column carries its own fixed window and
    prints it, with its date, in its own header. Wiring the stepper to it would
    mean recomputing four figures in this file, which is the one thing this
    board may never do (the rule at the top of this section).
  - **The page carries the platform's filter bar** (2026-09-17): `DayStepper`
    → `FilterPanel` holding `useFactorySection()` then the shift, and the KPI
    cards, both charts, the table and the board all read that one scope. The
    plant is the shared FactoryContext value and the shift the shared
    FilterContext one, so a pick carries to Overview, Zagruzka and Ojidaniya.
    **A SHIFT-MANAGER's shift is an inert `static` chip**: the board is locked
    to it server-side (`routers/shift_report._scope`) while `/api/brigadirs` and
    `/api/heatmap` are not, so a free S1/S2 would put another shift's cards over
    an empty board. Their shift is still read off `/api/staff/supervisors`,
    which now only a shift-manager's page calls — before this an admin read
    whichever shift the first unit in that list carried, and a top-manager,
    whom that endpoint refuses, read empty cards. **The board takes `shift` as
    a PROP and never reads the global supervisor pick**: the page has no such
    control, so a pick left standing on Overview narrowed it invisibly.
  - **That dashboard is now a page of its own**, `/shift-daily`, page key
    `shift-daily`, default roles `["top-manager"]` plus admin implicitly, in
    the «Ishlab chiqarish» nav group. `/daily` still forks a SHIFT-MANAGER to
    the same component, which is why the key is deliberately NOT granted to
    them: their «Kunlik» already lands there, and a second nav row onto one
    view would be all that changed for the role the page belongs to. Before
    this, an admin or a top-manager opening `/daily` was forked to the
    per-supervisor view, so the shift's own board was a page exactly one role
    could reach — and moving the table off Overview would have taken it away
    from them. **A new page key needs no one-shot**: `get_page_access` resolves
    a key the stored matrix has never heard of against `DEFAULT_PAGE_ACCESS`,
    verified against a simulated legacy matrix before this shipped.

- **No figure is computed here, and none may be.** «O'rtacha yuklanish» (today)
  and «Bajarish %» (yesterday) are `totals.avg_load` / `totals.completion` of
  `production._build_dashboard` — the very call `/api/production/dashboard`
  makes, so they ARE the «Zagruzka fayli» KPI cards. «Bartaraf etilgan %» is the
  Quality page's closure rate over the CURRENT MONTH, hair aside, each record
  attributed by `quality_attribution` (its cell on its date, else «Отв.
  бригадир» over every live unit — «Who answers for a Quality record»),
  done ÷ actionable, where `shift_report.ACTIONABLE` is the twin of
  `Quality.jsx`'s `ACTIONABLE` and the two must stay one list. «Ochiq
  xavotirlar» counts `leader_concerns` at level `supervisor` with status
  todo/doing, per unit. The headers carry the board's OWN names (the
  operator's call, 2026-09-29): «Smena boshi Zagruzka», «Plan bajarish %»,
  «Sifat nazorati %» — keys `overview.sr.colLoad` / `colCompl` / `colQuality`,
  which the bands modal reads too. The column hints still name the source
  figure by the owning page's word («O'rtacha yuklanish», «Bajarish %»), so
  `production.kpi*` stays the Production page's and must not be renamed for
  this board.
- **«Today» is the SHIFT FRAME, not the calendar** (`shift_report.report_days` →
  `live_overview.shift_frame` over `cell_hours.defaults`): the most recent shift
  start names the day — the rule `/live` runs on and the date a night's leaders
  file under. At 09:00 shift 2's today is the night that has just ended; shift
  1's today flips at its own 08:00, so before it the board shows the last
  finished day shift. A unit with no shift reads the calendar date.
- **«Bartaraf etilgan %» is the MONTH IN PROGRESS** (the operator's directive,
  2026-09-18), `shift_report.quality_window` — which is the one place the cut
  lives. It was the whole register, and a rate carrying every record ever filed
  moves by a fraction of a point whatever a unit does this week: it stated how
  the register has gone, not how the unit is going. `QualityComplaint.date` is
  an ISO string, so the cut is a plain string range (`first <= date <
  next_first`), and a row with no date — one no month can place — falls
  outside it. **The CALENDAR month of the plant's wall clock, one window for the whole
  board, never a shift frame**: the register's own date is a calendar date, and
  on the first morning of a month two shift groups would otherwise read two
  different months for one register. It rides on the payload as `quality_month`
  and the header prints that month by name (`cal.m*`), because a month derived
  from the browser's clock is how the header and the figures come to name two
  different windows — the `deck-window` rule. **Consequence to know: the
  figures moved, and a month in progress starts every unit at «—»
  `no_records`** until something is filed, which is the honest answer —
  «nothing filed yet» is not «nothing resolved». The tooltip's `done/actionable` and the sort are the
  month's.
- **A HAIR record is not counted** (the operator's call, 2026-09-18) —
  `shift_report.SKIP_CATEGORY`, applied in the router's own query, because this
  module never queries. «соч / волос» is the register's commonest foreign-object
  kind and the Quality page itself opens WITHOUT it (`quality_hair_mode`
  defaults to «Sochsiz», dropping hair from its KPIs, charts and tables), so a
  board counting them stated a closure rate the page beside it never shows. A
  row with NO category is KEPT — «uncategorised» is not «hair» — which is why
  the clause is `category IS NULL OR category <> 'hair'`: in SQL `<> 'hair'` is
  NULL on a NULL category, i.e. false, so the obvious spelling would drop the
  rows it should keep. The column hint states the exclusion in all four
  languages, and a unit whose whole month is hair reads the `no_records` blank.
- **The period picker does not reach it.** The request carries the page's
  scope (plant, shift) and never its dates. Every column header
  prints its own window — with the date while one shift is on screen; with two,
  a group row per shift prints both of its dates, which can differ.
- **A blank is «—» plus a REASON, never 0**: `not_configured` (no catalog),
  `no_people` (nobody typed «Bugungi fakt»), `no_plan` (no plan minutes — a 0%
  load against no plan is not a load), `no_fact` (plan minutes and no actual
  minutes at all — `/live`'s «fakt kiritilmagan», never «0%, behind»),
  `no_records` (nothing in the quality register THIS MONTH). The load checks
  people before plan, the heatmap's order. The amber header chip counts rows
  with a load or completion blank — the sheet's «Holat» folded into one number;
  `no_records` is not a gap and is not counted. «*» on a load is the Production page's
  partial-headcount mark (`people_untyped > 0`).
- **An ADMIN moves the bands, from this table's own header** (2026-09-16): a
  gear in the card header — admin only, and the endpoint behind it is
  admin-only too, so the button is the way in and never the lock — opens
  `StatusBandsModal`, four rows of two numbers with the resulting three ranges
  painted underneath in the cells' own colours. It edits NUMBERS and never
  COLOURS: the traffic light is the platform's status vocabulary, so a picker
  there would let one board disagree with every other surface about what a
  colour means, while where the LINES sit is the part nobody had ruled on.
  - **`GET /api/status-bands` is the read and `PUT /admin/settings`
    (`status_bands`, one JSON blob) is the write** — no second writer, so the
    change is already admin-gated, action-logged and undoable. The read
    resolves **edge by edge** against the defaults, so a blob from an older
    client, one missing a figure added since, or one somebody corrupted can
    never blank a band; `routers/settings.py` ships the same numbers as
    `utils/statusBands.js` and the two must be changed together.
  - **It is PLATFORM-WIDE and the modal says so.** The same bands paint the
    «Zagruzka fayli» KPI cards, so `statusBands` holds the answer in MODULE
    state and `hooks/useStatusBands.js` is its one writer: `loadColor(v)` is
    called from inside cells and helpers all over `/production`, and a band
    threaded as a prop would be forgotten at one call site and paint one figure
    by two rules. **Every page that paints a band must call that hook** — the
    helpers answer from module state, so a page that never subscribes goes on
    painting the defaults until something else re-renders it. Until the query
    lands, the floor answers; a board that paints defaults for one frame and
    corrects itself is the price of not blocking the page on a settings fetch.
- **Bands live ONCE, in `utils/statusBands.js`**, which the «Zagruzka fayli»
  page imports too: load ≥90 / 80–89 / <80 (the 2026-09-06 scale), completion
  ≥95 / 70–94 / <70 and quality closure ≥90 / 70–89 / <70 (the last read off the
  sheet, 2026-09-15) — all four now the DEFAULTS an admin can move, above. Every percentage band compares the WHOLE percent printed —
  `vypColor` moved onto that rule with this change, so a completion of
  94.5–94.99% now reads green on `/production`, where it prints «95%». The bands
  are printed as a legend under the table, in the very tints the cells wear.
  Ink is `--status-ok/warn/bad` (700 shades on light, the platform's own hexes
  on dark, a lighter red).
- **It is a HEATMAP, and it is the загрузка heatmap's own cell** (the
  operator's call, 2026-09-16). `statusBands.toneFill` is the one definition of
  that paint — background AND ink as one pair, since neither is a choice on its
  own — and it is `TONE_HEX` at full saturation with the ink `contrastText`
  picks, the rule `HeatmapChart` already applied and now imports from
  `statusBands` rather than spelling itself. Cells are square, full-bleed and
  ruled by a 1px line of the CARD's own colour, which is what makes the grid
  show against any fill in both themes — **set INLINE, never as a class**,
  because `DataTable` paints every cell's border through
  `[&_td]:border-[var(--border)]`, a descendant selector that outranks any
  plain utility on the cell itself: a `border-[…]` class there compiles, loses,
  and leaves the grid invisible with nothing on screen to say why. Three shapes
  were tried and are the
  mistakes this one answers: a tinted badge in a right-aligned cell (five short
  values across a full-width table left the board mostly empty space — the
  first thing anybody saw); muted 700-shade fills whose `--border` gridline
  disappeared into them, so three greens read as one block, and whose yellow
  could only be brown; and rounded tiles in a 3px gutter, which read as a row
  of buttons. **Flat per band, never a gradient** — these are verdicts, not
  intensities. The figures are **centred both ways**, because the colour does
  the comparing now, and every row is **ONE line high with ONE figure per
  cell**: the quality cell's `done/actionable` is on its tooltip and nowhere
  else, and a blank is its dash and icon alone. `toneTint` is the soft tint
  that remains, for a badge that sits ON the card. The NAME column stays
  uncoloured — it is the rail the eye returns to and what keeps the table from
  becoming one sheet of colour — and so does a BLANK cell, which should read as
  a hole in a coloured field. The fills cover the row's own hover tint, so
  hover marks the name cell with a brand bar instead.
- **All four columns wear those three colours; only the BANDS differ.** Open
  concerns are `CONCERN_BANDS` — ≤5 green, 6–20 yellow, ≥21 red — and those
  numbers are the part nobody has ruled on: the sheet's own 0 / 1–2 / ≥3
  shipped for a day and painted every unit red, because the register really
  holds 6 to 105 open concerns per unit, and a column that is red everywhere
  states nothing. They split today's fleet into roughly even thirds and are
  printed in the legend precisely so they can be corrected. A brand-gold
  intensity ramp stood here for an afternoon and was withdrawn: a shade has to
  be compared against the rest of the screen before it means anything, and a
  verdict should not.
- **It stays a table on a phone**, fitted to ~358px: short labels, the inactive
  sort chevron hidden and the active one stacked under its label, a blank's
  reason as a bare icon (its words are in the legend at every width, since the
  cell can no longer spare a second line). From 2026-10-03 the columns
  fit at **320px** too: the phone header is ONE line per label (the short
  labels carry no «%» — every figure does — and captions are ≥ 11px), and a
  name of 13+ letters gets soft hyphens (`softHyphenate`, `utils/personName.js` — /worker-concerns' phone rows use it too) so it breaks WITH a
  visible hyphen — a silent break read «Abdurakhmonova» as «Abdurakhmono va»
  («… and …»). The legend is one band per line on a phone. With the sixth
  column (2026-10-12) the «bugun» / «kecha» captions print no date on a phone
  — the subtitle names the day there instead (`1-smena · bugun · 12.10`).
- **Every cell opens WHERE ITS FIGURE COMES FROM, on the scope it was counted
  over** (the operator's rulings, 2026-09-30). The NAME opens `/brigadir/:id`;
  the row itself no longer does, because each cell has a destination of its
  own.
  - Load → «Zagruzka fayli» on the unit's shift-day (the group's `today`).
    Plan fulfilment → the same page on `yesterday`, whose «O'rtacha
    yuklanish» / «Bajarish %» cards ARE these figures. Quality → «Sifat»,
    «Brigadirlar» tab, that brigadir (the unit's own name, which is `r.sup`),
    `quality_month`'s span clamped to today, «Sochsiz», and only the
    UNRESOLVED records (open · waiting · repeat). That is the operator's pick
    over the full actionable set, so the page's closure figure does NOT equal
    the cell. Open concerns → «Xavotirlar», that unit, level brigadir, «to do» +
    «in work», «Barcha vaqt» (the count has no period).
  - A BLANK opens where its gap is filled: no people → the «Odamlar soni» tab;
    no plan / no fact → the positions; `not_configured` → the admin catalog
    upload, for ADMINS only (nobody else can fix it, and the unit is not in
    /production's picker, which would silently show another unit).
  - **The target page resets to exactly that scope and keeps it** («exact
    scope, remembered»). `utils/scopeLinks.js` builds the URLs.
    `hooks/useUrlScope.js` is the page half: each page's `readLinkScope` maps
    the params onto its OWN `usePersistentState` keys and clears every filter
    the link does not name. It writes them during the first render, above every
    `usePersistentState` call, so no request goes out for the old scope; then it
    drops the params (replace). A new linked page = one reader beside its keys.
  - **A linked pick is kept even with no rows.** Quality keeps a brigadir who
    owns a cell but has no record, and Concerns keeps a unit with no concern
    (through `/api/managers/all`). Both lists used to drop a pick they could not
    offer, which would have widened the linked page to every brigadir
    (Turdimurodov Nodirjon's unit has no quality record at all).
  - **`/production` is open to shift- and top-managers** for this
    (`DEFAULT_PAGE_ACCESS`, plus `startup.open_production_page_to_managers`,
    flag `production_page_managers_2026_09_30_v1`, both entrypoints, ADDS them
    to a stored matrix once). By the operator's call they type ПЛАН/ФАКТ there
    like anyone who opens the page. «Bugungi fakt» people, staffing and the
    catalog stay admin / brigadir / leader. A shift-manager's picker stays in
    their shift ∩ plant.
  - A cell whose page the viewer cannot open is plain, never a dead link.
- **The three LOAD cards above it read the same figure** (the operator's call,
  2026-09-30) — «O'rt. smena boshi zagruzka», «Brigadirlar ≥ 100%» and «< 90%»
  on `/shift-daily` count «Smena boshi Zagruzka», no longer the full formula's
  `net_util`. `GET /api/shift-report/start-load` serves it per unit per day
  (≤ 62 days, scoped by `_scope` like the board) off `zagruzka_source`'s
  `unit_labor` plan minutes and `unit_people` typed pins over `pp_shift_min`
  (`shift_report.start_load`, the `avg_load` arithmetic and `load_cell`'s
  blanks), because the cards' day stepper and 7-day trend cannot afford the
  engine per unit per day. NOT gated on the day-close or on attendance, as the
  board is not; days before `ZAGRUZKA_FROM` are absent. The ≥ 100 / < 90 tests
  compare the whole percent printed. The waiting card still reads the heatmap
  (closed days) and the charts below still read `net_util`.
- Up to two engine runs per configured unit per request (~2 s, ~850 queries on
  production-sized data), so from 2026-10-03 the whole answer is **cached
  60 s server-side** (`routers/shift_report._cache`), keyed by the units in
  reach, the quality month and each shift's report days — viewers with one
  scope share an entry, a new shift-day or month is a new key, the figures are
  the engine's untouched; `staleTime` 60 s and a refetch on focus on the
  client. From 2026-10-13 an answer between 60 s and `_CACHE_STALE_S` (10 min)
  old is served AT ONCE while a new one is built behind it (`_refresh_later`,
  its own session, one per scope) — unless the viewer wrote something since it
  was built (`leader_register.last_write`), who waits for a build that started
  after their write; older, the request builds, sharing one build with whoever
  asks the same (`shared_build`). The 60 s expiry had made somebody wait ~4 s
  every minute the board was open (13 Oct DM: ×13, median 3.9 s). **It is the LAST thing on the page to fetch**
  (`pageReady`, handed down by its page): that cost competes with the queries
  the KPI cards and the charts are waiting on — one uvicorn worker — so
  fired together the whole page read as «still loading» for as long as the
  slowest block on it took. Held until the page's own data is in, the board
  fills in under a page that is already readable, and its skeleton carries the
  heatmap's silhouette so the wait states what is coming. Deliberately NOT built: KRU %, «Kiritish soni»,
  an export, a ColumnsPicker.

### The «Davomat» column (from 2026-10-12)

The operator's request, with /workers' heatmap as the picture: the board's
second column is each unit's attendance on its shift-day SO FAR — a card of its
own shipped first (v4.265.0) and was folded into the board the same day, at the
operator's word («one column of the existing table»).

- **The figure IS /workers' «Davomat issiqlik xaritasi» for a day still being
  worked**: (came + on leave) ÷ on the list, the «Jami» half (every job title),
  painted on that heatmap's own six-shade scale — `statusBands.ATT_SEGMENTS`,
  moved there from `Workers.jsx` so the two pages share ONE scale, through
  `segmentFill` (whole percent printed). NOT the board's three admin-editable
  bands: one unit-day must wear one colour on both pages. `attTone` (90 / 75)
  decides only bold-on-red, like every other column. Once the day is closed and
  copied, the heatmap prints the same number.
- **`live_staff.attendance` is THE count** (a sum over `unit_people`, which
  /workers' live day reads too), off the STORED live read (the
  minute job's `live_verifix_reads`) inside the board's own request — never a
  Verifix call. The list is the unit's own people (`ctx.homes`, by Verifix org
  unit) with no exchange applied — the basis /workers rewinds a closed day to
  — minus approved deletions and anybody whose own schedule has not begun
  (`not_yet`, in the tooltip). Came = a clock-in after the brigadir's
  no-check-out answers (`_fixed`); leave = `workers._py_on_leave` on the mark
  the copy would write (`day_mark`). A person the stored read lacks is
  `unread`, never absent.
- «Today» is the board's own (`report_days`, the shift frame /staff opens a
  unit on). It rides the board's 60 s cache, so a figure may be a minute old.
  It runs in a SAVEPOINT: a read that cannot be folded costs the column
  (`no_read`), never the board.
- Blanks carry a reason (`no_cells`, `no_read`, `not_started`, `no_list` in
  `shift_report.REASONS`), never 0, and open nothing. A figure opens «Verifix
  to'g'irlash» on that unit's day (`scopeLinks.staffLink`). While a shift runs,
  people still due count as absent — /staff's own reading from the shift's
  first minute.
