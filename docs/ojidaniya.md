# Ojidaniya (waiting time)

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## Which ojidaniya categories the загрузка counts

`sheets_reader.OJIDANIYA_ONLY_CATS` is **THE list** of categories that show on
the Ojidaniya page and nowhere else. Every KPI door reads that one set —
`build_metrics_list`, `/api/downtime`'s `kpi_only`, `idle_source`'s pre-union
drop, `/zagruzka-cell` — so a category enters or leaves the загрузка on every
surface at once. Never re-spell the rule at a call site: two lists is how the
fleet page and the Daily donut start disagreeing about the same minutes.

- **From 2026-10-16 the set is EMPTY** — Cat H («Тозалаш», cleaning) joined the
  загрузка by the operator's directive («count idle time Category H on workload
  also»), so every category counts. The set and every door reading it STAY: a
  category is taken back out with one line in `sheets_reader.py` and nowhere
  else, and `kpi_only` stays on every endpoint (a no-op while the set is
  empty) so the Daily donut, the deck's `DECK_KPI_ONLY` and an older tab keep
  working. A Tozalash minute enters the way every other figure already counts
  it (see «Tozalash counts its CLEANERS»): at its crew where the entry carries
  «Tozalovchilar» — `people_pieces` inside the fleet mean, which `unit_downtime`
  already applied to the KPI `total` — and at the whole cell where it carries
  none (every entry filed before 2026-09-29). **`/zagruzka-cell` counts it the
  same way**: its per-cell figure is `cell_share_minutes` of the same
  person-minutes, by the N its roll-up multiplies back (the typed O. SONI from
  the floor, the counted attendance before it — `idle_source.rows_headcount`,
  the twin of `compute_metrics`' `verifix_hc`), so the reconciliation twin
  stays the fleet's; a day with no count reads the union it always read. The
  «Cat H: N daq hisobga olinmadi» note never prints now; «Tozalovchilar: −N
  daq» (`crew_min` / `diagnostics.ojidaniya_crew_min`) names what a crew count
  took off the whole-cell union instead, the gap against /idle-cell's
  «To'xtaganda» total. **The Ojidaniya page's «Barchasi / Zagruzkada
  hisoblanadi» toggle is NOT drawn while the set is empty** —
  `OJIDANIYA_ONLY_CATS` in `components/idle/categories.js` is the client twin
  (the `cleaners`
  flag's precedent; flag a category `notInLoad` there the day the backend's set
  gains one): the two views would be one view, and a control that reports a
  change and changes nothing is worse than an absent one. The export then names
  its scope «Barchasi»; the deck's confirm still names the загрузка scope,
  which is what the deck reads. **Consequence to know: past загрузка figures
  change** — on every stored day that carried Tozalash minutes, back to the
  sheet era, because nothing is stored (the Cat I precedent): idle UP, net
  utilisation DOWN, the 50-min flag may newly fire, and days before the count
  existed are billed at the whole cell. The deck carries Tozalash from the next
  Wednesday's press.
- (Until 2026-10-16.) From **2026-08-22** the set was **`{"Cat H"}`**. Cat I
  («Олдинги смена иши тугашини кутиш» — waiting for the previous shift to
  finish) COUNTS in the загрузка from that day by user directive: that wait is
  time the shift stood still, so it belongs there like any other stoppage.
- (Until 2026-10-16.) Cat H («Тозалаш» — cleaning) was what remained: planned
  work the shift does, not a stoppage it suffered.
- **Nothing is stored, so nothing needs a re-sync.** `equip_downtime` and the
  category breakdowns are derived per request from `DowntimeData` /
  `cell_ojidaniya_intervals`, so every historical day re-reads under the new
  rule the moment the backend restarts — the fleet heatmap, the comparison, the
  brigadir profile, the Daily donut, `/summary`, the bot `/ojidaniya` card and
  the weekly svodka all move together. **Consequence to know: past загрузка
  figures change.** Idle goes UP and net utilisation DOWN on every day that
  carried Cat I minutes, and the 50-min idle flag may newly fire on them.
- (SUPERSEDED 2026-10-16 — the toggle is not drawn while the set is empty, see
  the first bullet.) The Ojidaniya page's «Barchasi / Zagruzkada hisoblanadi»
  toggle was unchanged by the Cat I move and still said which scope was on
  screen; Cat H was then the only thing that separated the two views.
  `/zagruzka-cell`'s «Cat H: N daq hisobga olinmadi» note named the remaining
  category, and its reconciliation delta shrank accordingly.

## Tozalash counts its CLEANERS («Tozalovchilar»)

From **2026-09-29** (the operator's rulings, asked one by one) a Tozalash (Cat H)
ojidaniya must say HOW MANY PEOPLE cleaned, and every figure counts those people
— not the whole cell — for the minutes cleaning alone covered. Not everybody in a
cell cleans: 2 of 10 cleaning for 20 minutes is 40 person-minutes, and the
whole-cell reading billed 200. Leaders were already typing the count into the
reason by hand (65 of 96 Tozalash entries on the 11 Sep copy: «2 ta odam
tozaladi»), and the old shift sheet asked it beside Cat H («Нечта одам
тозалади?») and never read it.

- **`sheets_reader.CLEANERS_CATS` is THE list** of categories that carry a count
  (today `{"Cat H"}`), beside `OJIDANIYA_ONLY_CATS`; the client twin is the
  `cleaners` flag in `components/idle/categories.js`. Tozalash stayed OUT of the
  загрузка until 2026-10-16 — this changed who a cleaning minute is counted
  for, not whether it counted there; since that day it counts there too, at the
  same crew (see «Which ojidaniya categories the загрузка counts»).
- **The count is `cell_ojidaniya_intervals.cleaners`** (nullable int,
  `startup.add_idle_interval_cleaners`, both entrypoints). **NULL is the whole
  cell** — every other cause, and every Tozalash filed before the count existed
  (the operator's call: old entries stay whole cell, so no history moved).
- **`idle_intervals.people_pieces` is THE arithmetic** — the union split by how
  many people stood in each minute. A minute any whole-cell row covers counts the
  whole cell ONCE (a cleaning inside another cause's stop adds nothing); a minute
  only Tozalash rows cover counts the Σ of their counts (two groups cleaning at
  once), never above the cell's people — which is also what a count left above
  a number the brigadir LOWERED later is read as. With no count on a day it is
  exactly N × the union, the figure every reader had before. `person_minutes` and
  `cell_share_minutes` fold it; never re-spell the per-minute rule.
- **Where it moves a number**: `idle_source.unit_downtime` (the weighted mean —
  «Barchasi» on /downtime, its bar modal, the Ojidaniya workbook, /live's
  waiting, and the weekly svodka — every all-categories view; a `kpi_only`
  reader such as the Daily donut had no Cat H in it until 2026-10-16);
  «Toifalar bo'yicha» (a Tozalash minute is its SHARE of the cell's people — 20
  minutes by 2 of 10 read 4, so the row stays comparable with causes that stop
  everybody); «Xarajat» (priced at the crew — and priced even where the cell's
  own number was never typed, because the crew is on the entry; a row folding
  whole-cell and crew minutes prints their minute-weighted `hc` with `*`).
  Unchanged THEN: the загрузка and everything on it, the weekly deck (no Cat H),
  /zagruzka-cell — all three count Tozalash since 2026-10-16, at the crew, the
  per-cell page through `cell_share_minutes` by its roll-up's own N.
- **The entry rule is `routers/idle_cell._cleaners_for`**: required on every
  Tozalash save (create AND edit — an old entry is asked for its count the first
  time somebody edits it), a whole number from 1 to the cell's people that day
  (`idle_source.cell_headcount` over EVERY cell of the unit, rounded UP so an
  even work-centre share never blocks a whole person), and up to 200 (a typo
  guard) while the brigadir has not typed that number. Refusals are structured
  (`cleaners_required` / `cleaners_above_people` + `max` / `cleaners_invalid`)
  and `utils/idleErrors.errText` words them. **A body with NO `cleaners` key is a
  tab from before the count existed** and is never refused over it (the
  `wc_group` precedent): a new entry is read as the whole cell, an edit keeps the
  row's count. The current bundle always sends the key. On create the rule runs
  AFTER the live recorder's replay answer, never before — a record already
  stored is not refused because the cell's people changed since.
- **Both doors ask it with ONE control** — `ui/CountStepper.jsx`: the form, right
  under the category, with the cell's people and the cap as its hint
  (`cells[].people` / `cleaners_max` on `GET /api/idle-cell/cells`); «Jonli» at ▶
  with the category (the operator's call), correctable at ■. A record started
  before the count existed carries no key and is sent without one; **a record the
  server refuses now opens for correction** («Tuzatish» on the failed row → the
  finish sheet, showing the refusal) instead of offering only a blind retry or a
  delete that loses the stop.
- **It is shown wherever an entry is listed**: the /idle-cell register (a chip;
  AMBER with the reason on hover when the count now stands above the cell's
  people — `over_people`, the server's answer — because the figures then count
  the cell's people), the bar modal, the «Xarajat» entries (its `hc`), both
  workbooks' event sheets («Tozalovchilar» column), and the brigadir's
  new-entry DM card + bell text (a line `_render_body` drops when blank).
- **/live: a running Tozalash is NOT a stopped cell** — `cleaning_now` with the
  crew («tozalanmoqda · 2 kishi»), no pulse, no red alarm; `stopped_now` and its
  alerts are the other causes only.

## Ojidaniya comes from the CELLS (`/panel/idlesource`)

From **2026-08-27** — `idle_source.CELLS_FROM`, the user's directive — **every**
supervisor's ojidaniya minutes come from the per-cell interval model
(`cell_ojidaniya_intervals`, what the leaders file on `/idle-cell`). The
«Смена отчёт» sheet row (`DowntimeData`) is **not read for any unit on any day
from that date on**, and nothing turns it back on.

- **The floor is a CONSTANT with no override**, the shape the AI review floor
  and the client-compat floor already use: a rule a per-unit toggle can quietly
  undo is a rule nobody can read off the platform. Moving it is a one-line
  edit; it must never be moved LATER, which would hand days back to the sheet
  that have already been read off the cells.
- **Days BEFORE the floor are untouched, and they are all the per-supervisor
  register still governs.** `IdleSourceSetting` (the «Kutish manbasi» tab) can
  start a unit EARLIER — that is where the pilot, **Suvonov Elshod OF (manager
  5) from 2026-08-21**, still lives, seeded by `startup.seed_idle_source_pilot`
  (insert-only, flag-guarded) — and a `sheet` row keeps that unit's earlier
  days on the sheet. Neither can reach a day the floor covers. History is never
  rewritten and one day is never answered by two sources.
- **The tab must not present a setting the platform stopped honouring**, so
  `GET /api/admin/idle-source` carries `cells_from` (the floor) and each row's
  `effective_from` — `idle_source.start_day`, the ONE definition of "which day
  does this unit actually start reading its cells", never re-derived on the
  client.
- **Consequence to know: the sheet number is gone from 27 Aug for everyone.**
  A unit whose leaders file nothing on `/idle-cell`, whose cells carry no
  counted attendance (`ΣN == 0`), or that owns no cells at all now reads **0
  minutes** — idle DOWN and net utilisation UP on exactly those units. That is
  the directive, not a bug; the fix for a unit reading 0 is its leaders filing
  intervals, not a fallback.
- **`services/idle_source.py` is THE definition** — `CELLS_FROM`, `cell_units`,
  `start_day`, `uses_cells`, `unit_downtime`. `cell_units` returns EVERY unit
  (at the floor, or earlier where the register moved it), so a consumer that
  asks "is this unit switched" gets one answer and the floor cannot be missed.
  The unit figure is the **headcount-weighted mean of its cells**: `Σ(Nᵢ·Tᵢ) ÷ ΣNᵢ`, N = the people who ACTUALLY worked cell i that
  day (direct-role attendance matched by `verifix_code`, the `verifix_hc`
  rule), T = that cell's UNION of stopped ranges. **All** the unit's cells
  count (`in_load` ignored, as on `/zagruzka-cell`); a cell with N = 0 is on
  neither side; ΣN = 0 ⇒ no key ⇒ consumers read 0. The Ojidaniya-only
  categories are dropped BEFORE the union for the KPI `total`; `total_all`
  keeps them for the Ojidaniya page without `kpi_only`. Per-category minutes use the same weighted
  rule per category (they may sum to more than the total when causes overlap);
  the «To'xtamaganda» half is the weighted plain sum per category. Legacy
  minutes-only rows are never read. All merging stays in `idle_intervals`.
- **A day with no interval on any cell is 0 minutes** — no marker, no sheet
  fallback. The override in `build_metrics_list` and `get_downtime` writes the
  derived value EVEN WHEN it is absent, or the sheet row leaks back.
- **Everywhere switches through the two doors**: `build_metrics_list`
  (Overview, Zagruzka heatmap/comparison, brigadir profile, Daily performance
  block, `/summary`) and `get_downtime` (+ seasonality) — which is what the
  Daily donut, the bot `/ojidaniya` card and the weekly svodka read. Any new
  consumer of ojidaniya minutes must go through one of them, never
  `DowntimeData` directly. No source label on payloads (the user's call); the
  50-min flag and the flat 480 base are unchanged; `/zagruzka-cell` is the test
  twin (its reconciliation delta should read ~0 from the floor on, for every
  unit — and it now serves every unit, not one). The sheet keeps IMPORTING for everybody — it feeds
  nothing here any more, and it is what makes the two answers comparable.
- **The approval step on `/idle-cell` is GONE (same day).** A leader's entry
  counts the moment it is saved (status written `approved`); leaders cannot
  edit or delete their own rows — only the unit's brigadir, an admin or a
  `CAP_IDLE_APPROVE` grantee (now a delegated editor, same reach as before).
  The brigadir is told per entry (`idle_request_new` → «Yangi kutish
  kiritildi») and the close-day `ConfirmDialog` on Daily and Staff prints
  «Bugun liderlar N ta kutish kiritdi — ko'rib chiqdingizmi?» from
  `GET /api/idle-cell/day-summary`; closing the day IS the review, and it
  still proceeds. Pending rows were auto-approved once
  (`startup.approve_pending_idle_requests`); rejected rows stay rejected and
  visible. `decide` / `decide-all` / `pending-count` and the sidebar badge no
  longer exist, and `close_day` no longer gates on them.

Related memory: `idle-source-switch`.

## What a supervisor's ojidaniya bar is MADE OF (the detail modal)

From **2026-08-30** pressing a supervisor's bar on `/downtime` opens
`components/idle/UnitOjidaniyaModal.jsx` — the unit's waiting date by date, and
inside a date cell by cell, the table of that cell's own events. The bar was a
number with no way in — 464 minutes over a fortnight and nothing about which
cell stopped, when or why.

- **It serves the EVENTS; it never computes a second "how much".**
  `GET /api/downtime/cell-detail` answers only "what did the cells file". The
  figure the CHART counted for a date stays the page's own `/api/downtime` row —
  which is where the headcount-weighted unit mean and the sheet row both come
  from — so the modal can never state a total the bar it was opened out of
  disagrees with. `/api/downtime`'s `rows` and `summary` gained `manager_id` for
  exactly this: the sheet spells brigadirs in two alphabets, so a name is not an
  address.
- **Two totals per date, both named** (the user's call). The unit's day is the
  headcount-weighted MEAN of its cells (`Σ(N·T)÷ΣN`), so the cells listed under
  it add up to something else — usually much more. Printing one of them either
  contradicts the bar or leaves an unexplained gap on screen, so «Diagrammada»
  and «Yacheykalar» sit side by side and each says what it is.
- **A day the unit does not read from its cells says so.** Before
  `idle_source.CELLS_FROM` (earlier where the register moved a unit) the number
  came from the «Смена отчёт» row, which carries category minutes and no
  endpoints. `cells_days` on the payload is what tells a sheet day from a cells
  day nobody filed anything on — the two are indistinguishable from emptiness
  alone, and reading one as the other makes a reported day look silent. A sheet
  date shows its category table plus a notice, never an empty cell list.
- **It MIRRORS the page** — the To'xtaganda/To'xtamaganda half, the
  «загрузкада / hammasi» scope and the doughnut's category picks all narrow it,
  **server-side**. This is a zoom-in on one bar, not a second view of the
  register: an event the bar did not count has no business being totalled
  underneath it. Pressing a category SEGMENT carries that category in as well
  (only when the segment has minutes — in the Total view every category series
  is a row of zeros).
- **The `/idle-cell` TIMELINE is gone from it** (the operator's call,
  2026-09-08). It drew each cell's events to scale across the cell's whole day,
  so the stops this register exists to show — a few tens of minutes — were
  slivers, and every cell block on every date paid a fixed strip of height for
  them. The clock is already on every row in figures, twice. `DayTimeline` is
  untouched and still THE timeline on `/idle-cell`; only this caller stopped
  drawing one, and `summary` stays on the payload because a bundle still open
  on 4.65.0 renders it. `idle_intervals.merged_spans` is unchanged and still
  the one definition of the union — the header total on a cell is that union,
  and `stopped_only=False` is still what the To'xtamaganda half needs, where
  the recorded fact IS the subject.
- **Minutes are WHOLE here** (same call). The page's own `fmt` carries one
  decimal, which is right on a KPI card averaging a fortnight and wrong in this
  register: a filed event is picked to the minute and the unit figure beside it
  is a weighted mean, so «27.4» claims a precision neither number has. The
  modal passes `fmt(v, 0)`; in «hrs» the page's formatter ignores the argument,
  so that half is untouched, and the page itself keeps its decimal.
- Only cells that have waiting appear; dates are newest-first, collapsible, the
  newest open. A cell's header total is the UNION of the rows shown, with the
  plain sum in its tooltip where an overlap makes the two differ.
- **A cell's header names how many PEOPLE stood in it** (2026-09-08) —
  `idle_source.cell_headcount`, THE weight the unit's mean divides by and not a
  second count, beside the total. «—» and never 0 where there is no answer: a
  cell whose work centre nobody typed enters neither side of that mean. The
  leader's name beside the code is shortened by `utils/personName.shortPerson`,
  the platform's one rule, with the full spelling on hover. Both facts are on
  the «Yacheykalar» sheet of the page's own workbook too.
- **The modal carries NO export** (the operator's call, 2026-09-03): its footer
  is the close button alone. The page's own «Excel» button one level up is the
  export for this register, and it already carries these events on its
  «Yacheykalar» sheet — a second file offering one bar's slice of the same rows
  is a second answer to «what did the cells file». `POST
  /api/downtime/cell-detail/export.xlsx` still exists and still works (one row
  per EVENT on a cells day, one row per CATEGORY on a sheet day, marked as such,
  delivered by `app/xlsx_delivery.py`), but nothing in the UI calls it — putting
  the button back is one `Button` in the footer, deleting the endpoint is a
  separate decision.
- Scoped exactly as the page is: `manager_id` is a query parameter, so
  `scoped_manager_ids` re-decides it server-side — a viewer who cannot see the
  unit on the chart cannot read its cells here either.

## The weekly deck (`/downtime` → «Haftalik hisobot»)

From **2026-09-03** the toolbar of `/downtime` carries a second export beside
«Excel»: a fourteen-slide PowerPoint report of the week — `POST
/api/downtime/export.pptx` → `services/ojidaniya_deck.py`, with the prose
written in `services/deck_narrative.py` by the AI the «AI kalitlari» tab gives
feature `deck_ojidaniya` (Gemini, or Claude, from 2026-10-19 — Gemini alone
before; «Gemini» below means that model). It replaces a deck somebody
was building by hand every week (read every leader's entry, total the minutes
per category and per brigadir, find the three that matter, write the root
causes, lay out the slides).

- **It is a FIXED report, not a view of the page.** One plant, both shifts,
  every supervisor, the stopped half as the headline with the not-stopped half
  named beside it. The toolbar's filters change nothing — which is exactly why
  the button never fires without its `ConfirmDialog`, which writes the whole
  scope out.
- **Its categories are the ЗАГРУЗКА's, not the page's «Barchasi»** (the
  operator's ruling, 2026-09-04). Whatever `sheets_reader.OJIDANIYA_ONLY_CATS`
  holds is out of the deck entirely: no total, no ranking, no chart, no
  glossary row — «Cat H», Тозалаш, until 2026-10-16; since then the set is
  EMPTY and Tozalash is in the deck like every other cause (the set is now
  imported by `ojidaniya_deck`, never restated). It is expressed as
  **`DECK_KPI_ONLY` in `routers/downtime.py`**,
  i.e. the platform's own `kpi_only` flag on the two readers the deck already
  goes through, and applied BEFORE the per-cell union so a dropped category
  cannot survive inside a merged span. `ojidaniya_deck` filters nothing itself
  and must not start — that flag IS the one door for «which categories the
  загрузка counts», and a second spelling is how the file and the page start
  disagreeing about one week. The confirm dialog names this scope
  (`downtime.scopeZagruzka`), because a confirm that exists to write the scope
  out must not write it out wrongly. **Consequence to know:** the deck's totals
  no longer match `/downtime` with «Barchasi» selected — they match
  «Zagruzkada hisoblanadi», which is what the page opens on.
- **No text on a slide can land on other text, and that is structural.**
  Everything is absolutely positioned and a PowerPoint text box does not clip,
  so a string longer than its box is drawn straight over what sits underneath.
  On 2026-09-04 that reached the operator: an event note capped at 96
  CHARACTERS took two lines in a box built for one, and its second line landed
  on the «61 min · 8811 · 30-avgust» meta line nailed 0.21" below it. A
  character cap cannot express «one line» — the card is a third of the page on
  one slide and a quarter of it on another — and there were forty such guesses.
  The rule now lives in two places, neither of which is a call site:
  - **`services/deck_text.py` measures**, and `_text` is where it bites: it
    works out from the BOX how many lines fit, wraps to the box's own width and
    trims the rest with an ellipsis at a word boundary. A caller cannot opt out
    and does not have to remember to. Widths are Calibri's own advance table
    (with Cyrillic — the register spells brigadirs in two alphabets) biased
    WIDE by `SAFETY`: over-estimating breaks a line one word early, which
    nobody notices; under-estimating puts text back on top of text. **Never
    tune those numbers to make something fit — widen the box.** Lines are
    broken here and drawn as explicit `<a:br/>` breaks (each stamped with the
    run's own size, or the theme's 18pt default makes the block taller than was
    measured), so the lines measured are the lines drawn.
  - **`deck_text.check_layout` verifies the other half on the finished file** —
    no text box off the page, no two text boxes intersecting. Trimming alone
    only promises a string stays inside its own rectangle; if two rectangles
    overlap, two well-behaved strings still collide. It runs inside `build()`
    on the real week and LOGS its findings rather than raising: an operator
    waiting on Wednesday's report is not served by being handed nothing.
  - **A stack of variable-height items is drawn against a BUDGET, never a
    constant step.** `_events` measures each note (up to `EV_NOTE_LINES`),
    places the meta line at whatever height that note actually took, and stops
    when the next event would cross the `bottom` it was given. The old constant
    0.5" step was only correct while every note happened to be one line.
  - A person's name shortens rather than truncates (`short_name`): the full
    name where it fits, then trailing parts to initials one at a time.
    «Абдурахмонова Г. Ш.» says who this is; «Абдурахмонова Гулнора Шухрат…»
    says the platform ran out of room. `GET /api/downtime/deck-window` serves the
  period to that dialog rather than the browser computing it: the window is a
  RULE, and a JavaScript copy of it would drift until the confirm named one
  week and the file carried another.
- **`services/report_week.py` is THE window** — last Wednesday back to the
  Wednesday before it, **both included**, so eight calendar days and two
  consecutive reports SHARE their boundary day (the operator's call, mirroring
  the hand-made deck it replaces). `last_wednesday` is strictly before today,
  so a Wednesday press is about the week that just closed. The comparison
  window is the eight days ending where this one begins — same length, so the
  percentage means something.
- **Every figure comes from the page's own computation.** `_downtime()` and
  `_cell_detail()` are what `/downtime` itself reads; the deck module is HANDED
  their output and never queries. The router does the fetching, so nothing in
  `services/` imports a router.
- **Two totals, and both are named.** A unit's day is the headcount-weighted
  mean of its cells, so the events listed under a brigadir add up to something
  else — usually much more. The KPI slides carry the weighted figure the page
  charts; the per-cell and per-event slides carry the cells' own sums and SAY
  so. Same rule `UnitOjidaniyaModal` already follows.
- **The deck says NOTHING about where a figure came from, and that is a
  ruling — do not "fix" it.** No slide names the «Смена отчёт» row or the
  cells, none carries a comparability caveat, and `_RULES` rule 5 forbids the
  model raising it either. The operator decided this on 2026-09-03, having
  been shown the consequence in full.
  **The consequence, stated plainly so nobody rediscovers it as a bug:** across
  `idle_source.CELLS_FROM` the week-over-week percentage sets two DIFFERENT
  measurements against each other. On the first real run the comparison week
  was **100%** sheet-based, the delta read −64.5%, and the deck reports that as
  a 65% improvement — on the cover, on the KPI card, under a «Yaxshilandi»
  heading, and in Gemini's own prose. Nobody caused it, and the following week
  it climbs back. A guard for this was built (`comparable`, a red caveat, a
  prompt instruction) and then removed at the operator's direction; re-adding
  any of it needs a new decision, not a bug fix.
- **Gemini writes the commentary AROUND the notes; it never rewrites one.**
  A leader's note is the recorded evidence of a shift, so it is quoted verbatim
  — transliterated to Latin where it was typed in Cyrillic (about a third of
  them are, in the same column), and otherwise reproduced with its typos. The
  model is given the already-computed figures and told to reuse them as given;
  it is asked for synthesis only. `_VOCAB` hands it the plant's own words
  (yacheyka, sklad, bozorlik, zayavka, smena topshiruvi) because a general
  model reaches for dictionary synonyms and a report that renames the shopfloor
  reads as though written by somebody who has never been on it, and `_STYLE`
  demands Uzbek that sounds native rather than translated.
- **A Gemini failure must not cost the operator the deck.** `write()` returns
  None on anything — the feature switched off, quota, malformed answer — and each prose slot
  falls back to a plain statement of its own numbers. `narrative: false` on the
  body skips the call outright.
- **`cat_key()` normalises whatever spelling the model returns** («Cat D3» /
  «D3» / «D3 — Otdellararo mahsulot»), because it answers differently in
  different fields of the SAME response, and a strict lookup silently dropped
  the root-cause line off a slide.
- **Always Uzbek Latin**, whoever presses it, so the words live in the module
  rather than travelling from the client as they do for the workbook. The
  category labels are a copy of the `downtime.cat.*` uz bundle and the colours
  mirror `catColor()` — keep them in step.
- **Admin only**, checked in the endpoint and not merely by hiding the button:
  the deck covers the whole plant — every unit's minutes, cells and note text —
  which `/downtime` deliberately withholds from a supervisor, and the endpoint
  is reachable without the UI.
- **The plant is resolved by NAME, never by id** (`DECK_FACTORY = "Uchtepa"`,
  matched against `code` and all four name columns). An unresolved name is a
  hard 500 naming the factories that DO exist — a silent fallback to «all
  factories» would produce a file that looks right and carries another plant's
  units. Ids differ between a checkout and production; `startup.MANAGERS`
  already records that lesson.
- Deliberately NOT built: a scheduled weekly send (the operator chose the
  button), a PDF (`soffice` is the route if it is ever wanted), and slide 12 of
  the original deck — it scored whether each problem was FIXED, off a «yechim
  sanasi» column in the old Google-Sheets journals that
  `cell_ojidaniya_intervals` has no equivalent of. Adding one is a schema and
  form change, not a deck change.
- Logged as `export.ojidaniya_deck`; delivered by `xlsx_delivery.deliver_file`
  (browser downloads, Telegram DMs), which is the old `deliver_xlsx`
  generalised over the MIME type — the WHERE decision stays in one place.

## The Ojidaniya page as a workbook (`/downtime` → «Excel»)

From **2026-09-03** the toolbar of `/downtime` carries an «Excel» button at its
right edge (icon-only on a phone) — `POST /api/downtime/export.xlsx` →
`services/ojidaniya_export.py`. It does, once, what a person otherwise does by
hand before a raw dump is fit to forward — freeze the header, widen the
columns, format the numbers, sort by the biggest, add totals, zebra the rows,
add filters, turn codes into words, pull out the per-person and per-category
summaries, colour what is over the threshold, add the chart, name the sheets,
and put a title with the period and the filters on top — so the file opens
ready to read and ready to print.

- **Every number comes from the page's own code.** `routers/downtime.py`
  `_downtime()` IS the page's computation, refactored out of `GET /api/downtime`
  so the endpoint and the export read ONE function; the events come from
  `_cell_detail`, the bar modal's own reader. The client sends the SCOPE (its
  filter state) and the WORDS (supervisor names in the viewer's alphabet via
  `tl`, the labels, each category's label/note/colour off `catColor`) — never
  a figure. The formatter is pure and imports its primitives from
  `quality_export.py` (the house report style: gold banner, scope strip, KPI
  cards, sections, zebra, data bars, native charts, no gridlines, print setup).
- **Five tabs in the page's reading order**: Umumiy (banner · scope strip ·
  six KPI cards · per-brigadir table with data bars + a bar chart coloured
  red/indigo by the 50-min flag · category share with a doughnut in the
  category colours) · Kunlik (brigadir × date matrix under a colour scale,
  >50 in red, a fleet-total row, and the trend as a table + line chart with the
  50-min dashed line) · Reyestr (one row per brigadir-day, a column per
  category, autofilter, frozen header) · Yacheykalar (one row per EVENT the
  cells filed — cell, leader, clock, note; a day still read off the shift
  report is one row per category marked «Smena hisoboti», so the file is never
  shorter than the screen) · Toifalar izohi (what each category means and
  whether the загрузка counts it).
- **The doughnut's category picks narrow the totals exactly as the chart does**
  (a bar = the sum of the picked categories); the 50-min flag stays a fact about
  the unit's WHOLE day, as on the page. `stopped` / `kpi_only` ride in like
  every other narrowing.
- `rows[].source` («cells» | «sheet») was added to `/api/downtime` for the
  export — additive. The period is capped at 400 days. Logged as
  `export.ojidaniya`; delivered by `xlsx_delivery` (browser downloads,
  Telegram DMs).

## The «Toifalar bo'yicha» matrix (`/downtime`, page view tab 2)

From **2026-09-04** `/downtime` is TWO views over one register, switched by a
`SegmentedToggle asTabs` that is the page's FIRST row — above the filters,
because every filter, and both the To'xtaganda/To'xtamaganda and
Zagruzkada/Barchasi toggles, narrow BOTH views. «Tahlil» is the page as it was.
«Toifalar bo'yicha» is a matrix: categories down (expandable to their
brigadirs), the days of a MONTH across.

- **Its figure is NOT the one the rest of the platform reads, and that is the
  operator's ruling, not an oversight.** A leaf cell is a brigadir's minutes in
  one category on one day **divided by the cells that had people standing in
  them that day** — an UNWEIGHTED mean over a cell count. Every other ojidaniya
  number here is the headcount-weighted mean `Σ(Nᵢ·Tᵢ) ÷ ΣN` (`idle_source`),
  where a 20-person cell outweighs a 2-person one. **Consequence to know: this
  tab's totals do not match the Analysis tab's**, and the card says so in its
  own words before anybody reads a cell.
- **So the tab carries NO KPI cards and no charts.** «Jami ojidaniya» on those
  cards is the day's UNION; this table's total is the sum of the category rows,
  and per-category minutes overlap (one cell stopped for two causes is counted
  under both). Two totals of two different kinds, one above the other, read as
  a bug — which is exactly why `UnitOjidaniyaModal` names both of its own.
- **`idle_source.cell_counts` is THE divisor**, for a cells day and a «Смена
  отчёт» day alike — one function, so the two sources can never be divided by
  two different things. It is deliberately not `unit_downtime`'s own
  `cells_with_att` (a sheet day never reaches that function at all), but shares
  its cell→unit map, its `_counted_hc` predicate and its weight test, so for a
  cells day the two answers are identical by construction. **A (unit, day) with
  no counted attendance is ABSENT from it** — that day has no average, and the
  matrix prints «·», never 0.
- **`unit_downtime` gained `by_category_sum` / `by_category_ns_sum`** — the same
  per-category minutes UNWEIGHTED, i.e. the numerator. The weighted pair beside
  them is what every KPI reads; mixing the two up is the one mistake this
  feature can make silently.
- **`_downtime(with_avg=True)`** attaches `by_category_avg`,
  `by_category_ns_avg` and the divisor `cells_att` to every row. Off by default
  (`?avg=1`), because the Analysis tab asks for up to 400 days and has no use
  for it, so every existing caller's payload is byte-identical.
- **`services/ojidaniya_matrix.build()` owns every roll-up** and is handed
  `_downtime`'s output — it never queries, exactly as `ojidaniya_deck` is
  handed the page's own numbers. A category row is the **sum of the brigadir
  averages** under it (so it scales with how many brigadirs are in scope and is
  not itself an average); the last row is the **sum of the category rows**, i.e.
  the whole column. Categories sort by month total, brigadirs by theirs.
- **EVERY brigadir in scope is listed under EVERY category** (the operator's
  call, 2026-09-05) — the ones who waited nothing in it, and the ones who filed
  nothing all month (a row of «·»). The group used to end with «yana N
  brigadirda bu toifada kutish yo'q» and fold them away, on the reading that
  fifteen all-zero rows bury the two that carry the category; the row set then
  changed from category to category, so two groups could not be read against
  each other and a brigadir could not be followed down the sheet. The fold's
  argument is answered by the ORDER instead — carriers sort to the top of each
  group, so a long group is read from the top exactly as the short one was.
  `_downtime` attaches `managers` (the scope's own unit list) for this, under
  the same `with_avg` flag as the averages, so every other caller's payload is
  byte-identical; with no such key the matrix falls back to the units its rows
  name. `hidden` is gone from the payload, both renderers and all four locales.
- **A Tozalash minute enters as its SHARE of the cell's people** (from
  2026-09-29): 20 minutes cleaned by 2 of 10 read 4 — `idle_source`'s
  `by_category_sum` is `idle_intervals.cell_share_minutes`. See «Tozalash counts
  its CLEANERS».
- **Blank means ZERO, «·» means NO DIVISOR, and a HATCHED column is a day that
  has not happened yet.** Keeping the zeros blank is what lets the non-zero
  values read across 31 columns; all three are named in the legend under the
  table and in the workbook's own footnote, because none of them is guessable.
- **The ramp is GOLD and carries no threshold.** The 50-daq flag is defined over
  a unit's whole-day UNION, so it says nothing about a per-category average — a
  red cell here would be a number pretending to be a verdict. `--brand-rgb` was
  added to both themes for it (`rgba(var(--brand-rgb), a)`); `_MX_BANDS`
  (green→red) must NOT be reused for this table. Category rows and brigadir
  rows get their own ramp DOMAIN: a category row is the sum of the rows under
  it and always larger, so one shared scale washes every brigadir row out.
- **Minutes only, one decimal.** The page's min/hrs switch is deliberately not
  applied — «1 soat 35 daq» cannot be read in a 46px column.
- **The period is a MONTH**, via `DateRangePicker`'s new `month` mode (a year
  stepper + a 12-month grid) — the same template with a prop, never a second
  control; the day-calendar path is untouched by it. The tab keeps its OWN
  month key, so switching views never rewrites the period the other one was
  read at.
- **A month still running keeps ALL of its columns** (the operator's call,
  2026-09-04): on the 4th of September the table and the workbook both carry
  thirty. The period used to be clamped to today, on the reading that an empty
  future column would be taken for «nothing waited» — but the fix for that is to
  SAY which columns are days that have not happened, not to hide the shape of
  the month, and a reader comparing two exports could not tell a short month
  from a truncated one. **`ojidaniya_matrix` decides it and nothing else does**:
  `future`, one flag per date against the plant's own wall clock (`today_local`,
  Tashkent — the box's zone is not contracted anywhere), rides beside `dates` to
  the tab and, through the export endpoint, into the workbook. Deriving it a
  second time from the browser's clock is how the file and the screen would
  disagree about one month. **TODAY is never future** — it is a day in progress
  and its figures are real as far as they go — and a date that will not parse is
  an ordinary column, never a silently blanked month. Such a column carries **no
  value at all**: on screen a faint diagonal hatch (one slate at low alpha, so
  it reads in both themes) under a dimmed date, in the file an empty cell on a
  slate ground under a greyed header. Neither existing glyph could say it —
  blank would read as «cells ran and nothing waited», «·» as «no cell had
  anybody in it». The DateRangePicker's `max` still stands, so a month entirely
  in the future is not selectable.
- **Its own Excel button**, `POST /api/downtime/matrix.xlsx` →
  `ojidaniya_export.build_matrix_workbook` — the same table, with the brigadirs
  as a collapsible Excel outline under each category, **opening COLLAPSED** as
  the tab's own categories do (2026-09-05): the sheet lists every brigadir in
  scope under every category, so an expanded file would bury the summary the
  reader came for under a few hundred rows. Excel reads a closed group as a
  PAIR — `hidden` + `outlineLevel` on the detail rows and `collapsed` on the
  summary row, which is the one ABOVE them because `summaryBelow` is False —
  and either half alone leaves the gutter and the rows disagreeing about the
  state. A SEPARATE file from the
  five-tab report beside it, because it carries a different measure; two
  measures in one workbook is how a reader compares two columns that cannot be
  compared. Logged as `export.ojidaniya_matrix`.
- **The file reads A-Z, the tab biggest-first** (the operator, 2026-11-06):
  categories by their printed label, and the brigadirs under each by their
  printed name, both A-Z — sorted in `export_downtime_matrix`, so the tab
  keeps `ojidaniya_matrix.build`'s carriers-first order.
- Visible to everyone who can open `/downtime` and scoped exactly as the page is
  (`_downtime` calls `scoped_manager_ids`), so a supervisor sees their own row
  under each category. The period is capped at `_MATRIX_MAX_DAYS` (62).

## «Kutish xaritasi» — people × minutes (`/downtime` → «Tahlil», 2026-10-23)

The operator's request, with Our World in Data's «GDP 1950 vs 2016» scatter
and NPR's GDP bubbles as the picture: a bubble chart of the ojidaniya — x =
how many people waited, y = how long, size = the two multiplied (person-hours),
colour = the category (`catColor`). A full-width card under the bar chart and
the doughnut. `services/ojidaniya_bubbles.py` computes, `GET
/api/downtime/bubbles` scopes (plant / shift / brigadir through
`scoped_manager_ids`, the category lock through `idle_scope`, the half and the
doughnut's picks mirrored), `components/idle/IdleBubbleChart.jsx` draws (plain
SVG).

- **Nothing new is measured.** Minutes are the union per (cell, day, category)
  (`idle_intervals`), summed over days; people are `idle_source.cell_headcount`
  with a Tozalash minute at its «Tozalovchilar» (`people_pieces`). x is the
  minute-weighted mean (person-minutes ÷ minutes), so x × y IS the size. On a
  seeded copy the cell grain's person-minutes equal «Xarajat»'s category sums
  to the minute (`ojidaniya_cost.build` with rate 60).
- **Three grains** (`downtime_bubble_grain`): «Yacheyka» (a cell × cause over
  the period, default), «Brigadir» (a unit's cells × cause — its y is minutes
  SUMMED over cells, not the unit's weighted mean the bars show), «Hodisa» (one
  filed stop, capped at `MAX_EVENTS` 1500, the cut counted).
- **Log axes both ways, so the dashed diagonals are equal person-hours** (log x
  + log y = const) — the OWID guide lines, turned the other way. Each guide's
  label goes where the line crosses the fewest bubbles.
- **A minute with no headcount is not drawn and is COUNTED** (`unplaced`, under
  the chart and in the tooltip); days a unit reads from the «Смена отчёт» row
  have no cells and are counted as `sheet_days`. Categories are summed across
  each other (a minute with two causes is in both), and the total line says so.
- Hover previews, a tap pins the card, whose «Batafsil» opens
  `UnitOjidaniyaModal` on that unit and cause (and day, for a stop). The legend
  chips are the page's category filter (the doughnut's); hovering one lights
  only that cause — twelve hues in one scatter need it. ←/→ walk the bubbles
  biggest first, Enter opens. The ten biggest are labelled (a cell once).
- Not built: an export of the chart, a table view, the «Toifalar bo'yicha» /
  «Xarajat» tabs.

## What waiting COST (`/downtime`, page view tab 3)

From **2026-09-09** `/downtime` carries a third view, «Xarajat», which prices
stopped waiting in wages:

    xarajat(yacheyka, kun) = union_minutes ÷ 60 × odam soni × w(kun)

(From 2026-09-29 the minutes only a Tozalash covers are priced at its
«Tozalovchilar», not the whole cell — see «Tozalash counts its CLEANERS».)

`services/ojidaniya_cost.py` is THE computation and `services/wage_rate.py` owns
the last term. Nothing here is a new measurement — the minutes are
`idle_intervals`' union, the people are `idle_source.cell_headcount` (the very
weight `unit_downtime` divides by), and the day gate is the same `uses_cells`
`_downtime` applies.

- **The register is read CAUSE-first: toifa → brigadir → yacheyka**, and a tap
  on the CELL row opens the events (the operator's restructure, 2026-09-09; it
  was brigadir → yacheyka → toifa, with the toifa row opening the modal).
  Nothing was re-measured: the leaf is the (cell, category) pair `cat_acc`
  already held and the entries endpoint already answered for — the tree is the
  same figures folded the other way up, by `_fold`, which is now THE fold at
  every level of both trees and again after a cell pick.
- **`cat_rows` is that tree; `rows` (brigadir-first) is still served.** It costs
  one extra roll-up off the same accumulators, so the two cannot disagree, and
  it is what keeps this a MINOR: a browser tab open on an older bundle renders a
  table rather than an empty one. The workbook reads both.
- **So the tab prints TWO sums, each named.** With the cause at the top level
  the rows on screen add up to `cat_minutes` / `cat_cost` — a minute stopped for
  two causes is named under both — while the bill stays the union in `minutes` /
  `cost`. «Toifalar yig'indisi» is printed above «Jami» only when they differ,
  with the overlap stated in words under the table. Printing one alone is either
  a column that visibly does not add up or a total that overstates what is owed.
  The KPI cards are the BILL and did not move.
- **A share is taken over the level ABOVE** — a category over Σ categories (so
  they sum to 100%), a brigadir over its category, a cell over its brigadir.
  Against the union bill the top rows could not share out to 100%: they overlap
  it. `hc` stays blank above a cell row, unchanged: a headcount folded over
  several units is a number nobody typed.
- **`narrow()` re-folds every parent it keeps.** The old cell filter re-listed a
  brigadir's cells while leaving that brigadir's own figures — and the grand
  total built from them — covering every cell of the unit, so picking one cell
  printed a total the rows under it did not add up to. Fixed with the
  restructure; both trees are narrowed together, or one payload would carry two
  answers describing two scopes.

- **It is a SUM, and every other ojidaniya figure on this platform is a
  headcount-weighted MEAN.** So its minutes do NOT match the «Tahlil» tab's, the
  same relationship «Toifalar bo'yicha» already has — the card says so before
  anybody reads a figure. (Pricing Cat H widened the gap further until
  2026-10-16, when the загрузка started counting it too.)
- **Only a STOPPED cell costs** (the operator's premise), so `stopped` is fixed
  and the page's To'xtaganda/To'xtamaganda toggle is not offered here. **Every
  category is priced, Cat H included** — a cell stopped for cleaning pays the
  same wages — so `OJIDANIYA_ONLY_CATS` is deliberately NOT applied and the
  «Zagruzkada hisoblanadi» switch does not reach this tab. The category
  checkboxes are how a reader takes one out.
- **Each minute is paid ONCE.** A cell's figure is the UNION of its stopped
  ranges; a CATEGORY row unions within its own category but categories are
  summed ACROSS each other, because a minute genuinely has two causes and both
  deserve naming. So a cell row on this tab is that cell's minutes for ONE
  cause, and the causes over a cell can total MORE than the cell's own union.
  Never "fix" that by summing the categories: the union is the money.
- **The rate is a contiguous TIMELINE of periods, never one setting.**
  `wage_rate_periods`, edited admin-only through the ⚙ on the toolbar: the
  admin puts a BORDER on a date, which SPLITS the period containing it, so a gap
  is unrepresentable. Each DAY is priced at the rate in force on that day, so a
  raise entered today does not rewrite last month. Editing a PAST period still
  does — deliberately possible, never silent: the Save confirm names how many
  days move (`wage_rate.affected_days`). `effective_from IS NULL` is the open
  first period and `uq_wage_rate_from` folds it with COALESCE, the `uq_ltask_day`
  rule, because NULLs are DISTINCT in a Postgres unique key.
- **An unset rate and an unknown headcount are «—» and a NAMED count, never
  0.** `rate_uzs IS NULL` means nobody has said what that period costs, which is
  not the same as costing nothing; a cell whose headcount nobody typed already
  leaves both sides of the загрузка's own mean. Both keep their MINUTES and lose
  their COST, and the gap rides every level as `unpriced_minutes` and shows on
  the «Narxlanmagan» KPI card. A 0 there would understate the plant's bill by
  exactly the days nobody has configured.
- **The tab keeps its OWN filter state** (`dtcost_*`) — the operator asked for a
  multi-select brigadir and a cascading cell picker, which the other two views
  do not carry, and switching tabs must not rewrite what they were showing.
  Sections: `useFactorySection()` → smena → brigadir → yacheyka (cascading, with
  `note`/`empty`, and a pick the narrowed list drops) → toifa.
- **Admins and shift managers ONLY** (from 2026-10-04, the operator's
  directive — it was everyone who can open /downtime). `COST_ROLES` in
  `routers/downtime.py` is checked by all four cost endpoints (403
  `cost_forbidden`); the page offers the tab only to those roles and reads a
  saved «cost» view as «Tahlil» for anybody else. Supervisors, leaders,
  top-managers and «Kutish mas'uli» keep the other two tabs. Scoped as the page
  is: a shift manager prices their shift ∩ plant. Only the RATE is admin-only,
  checked in the endpoint and not merely by hiding the ⚙. **The /reports
  «Xarajat» section follows the same list** (2026-10-26, `reports._sees_cost`
  imports `COST_ROLES`): absent from that payload for anybody else.
- **The cell code is NOT a `CellLink` here**: the row is a disclosure, and a link
  inside it would navigate away mid-drill-down — the `IdleCell` accordion's own
  reasoning. And cost carries **no traffic-light colour**: no threshold for
  "expensive" exists, so red would be a verdict the platform has not defined.
  Brand gold only (a single-metric accent), amber only for unpriced.
- Endpoints: `GET /api/downtime/cost` (the tree + the filter option lists),
  `GET /api/downtime/cost/entries` (the modal — a separate call, it can be
  thousands of rows) — weighed over EVERY cell of the unit, the set
  the tree prices with, so its headcount and cost equal the tree's, `GET`/`PUT /api/downtime/wage-rates`, and
  `POST /api/downtime/cost.xlsx` — a SEPARATE workbook from the page's own
  «Excel», because it carries a different measure. THREE sheets, one measure
  each: «Umumiy» (KPI + the category table the screen leads with, Σ by cause),
  «Tafsilot» (that tree flattened, the pre-floor lumps included and marked), and
  «Brigadirlar» (the union bill per unit). The two sums never share a table. Logged as
  `export.ojidaniya_cost` / `config.wage_rate_saved`.
- **Before `zagruzka_source.ZAGRUZKA_FROM` (2 Sep) a unit is priced WHOLE, never
  per cell** (the operator's directive, 2026-09-09). The typed «Odam soni fakt»
  is what makes a per-cell headcount knowable and it does not exist earlier, so
  those days carry ONE figure per brigadir: the unit's own ojidaniya minutes ×
  its «Одам сони» sheet headcount (`HeadcountData.official_hc`, resolved through
  `sheet_alias_map` — exactly what the загрузка divided by then). The MINUTES are
  handed in from `_downtime` (`_pre_floor_rows`), never re-derived: that function
  is the page's one answer to «how much did this unit wait» and already merges
  the cells era with the «Смена отчёт» era. `mean × ΣN = Σ(Nᵢ·Tᵢ)`, so the two
  regimes are the same arithmetic at two levels of detail.
  A period straddling the cut puts both halves under ONE brigadir: its cells from
  the cut on, then a marked **«2-sentabrgacha»** row — pinned LAST (it is a
  different kind of row, so it is appended after the cost sort), not expandable,
  no share, and excluded from every «N yacheyka» count. A unit-day the sheet has
  no headcount row for stays unpriced and is counted, never 0.
- **«Odam soni» is a FACT and is never printed with a `~`** — it is the number
  somebody typed. A row folding days that carried DIFFERENT headcounts shows the
  minute-weighted mean with a `*` and names the range on hover (`hc_varies` /
  `hc_lo` / `hc_hi`); every other row prints the figure plain.
- **A union is only ever taken within ONE date.** Clocks are wall-clock "HH:MM"
  read as minutes-of-day, so 17:10–17:25 filed on the 3rd and again on the 7th
  merge into a single 15-minute span. `_union_by_day` folds per date first — the
  entries modal spans a period, and unioning it flat once reported 25 minutes
  against a sum of 75 and fired the overlap note on a cell with no overlap.
- Days before `idle_source.CELLS_FROM` reach the tab through the same pre-floor
  path (their minutes are the «Смена отчёт» row); the date picker is deliberately
  not clamped, and the empty state names the floor instead.

## «Kutish yechimlari» — which cause hurts, who answers, what they will do (`/idle-solutions`, 2026-11-03)

The operator: an analytics row beside Ojidaniya showing which waiting category
costs most, who is assigned to it (the «Kutish mas'uli» register) and a place
for that person to write their solution. `routers/idle_solutions.py`
(`GET /api/idle-solutions/analysis`, `POST` / `PUT /api/idle-solutions[/{id}]`),
table `idle_category_solutions` (a log per category: text, open · doing · done,
author snapshot), `pages/IdleSolutions.jsx` + `pages/idleSolutionsText.js`.
**ADMIN-ONLY for now, no page key** (`adminOnly` nav row, `RequireAdmin`, every
endpoint refuses others); the owner-may-write rule (`_may_write`) is kept for
the day it opens to the role. Minutes are `/downtime`'s own (`_downtime`, the
stopped half) summed per category; nothing new is measured. All 12 categories
are listed (quiet ones dimmed); filters: period, plant, shift, brigadirs
(multi). Not built: deadlines per solution, notices to owners.

- **A problem is (category × brigadir)** (2026-11-03, the operator: «4 problems
  → the responsible person writes 4 solutions»). Opening a cause lists one block
  per brigadir who lost minutes to it — their minutes, then **the brigadirs' own
  comments** (the `note` of every filed stop on /idle-cell, read through
  `downtime._cell_detail`, newest first, 3 shown + «yana N ta izoh»), then that
  problem's solutions and a composer. `idle_category_solutions.manager_id`
  (NULL = a general solution for the whole cause, shown under «Umumiy
  yechimlar»; `startup.add_idle_solution_manager`). The KPI «Yechimsiz
  muammolar» counts problems without a solution, not causes.
- **Every filed stop is its own problem** (2026-11-05, the operator: «responsible
  person should write a reason … to every problem» — a block showed 3 stops and
  hid a fourth behind «yana 1 ta izoh»). `idle_category_solutions.event_id`
  (`startup.add_idle_solution_event`) = the `cell_ojidaniya_intervals.id` a
  solution answers; each (category, brigadir) block lists ALL its stops
  (`events`, comment or not, newest first, ≤ 100) with their own solutions and
  composer; «Yechimsiz muammolar» counts stops without one. Older
  brigadir-level rows (`event_id` NULL) stay, read under «Brigadir bo'yicha
  umumiy yechimlar», and count toward no stop.
- **Cleaning (Cat H, «Tozalash») is not on this page** (2026-11-05, the operator:
  «cleaning is part of the work, we don't need a solution for that»):
  `idle_solutions.EXCLUDED` drops it from the causes, the totals, the brigadir
  table and the write door (400). Nothing else moves — /downtime keeps it.
- **«Tahlil» tab** (2026-11-05, the operator: is the reason repeating, did the
  solution work, if not change the approach) — `GET /api/idle-solutions/analytics`
  + `components/idle/SolutionAnalytics.jsx`, nothing new measured (`_downtime`
  rows and `analysis()`'s stops). Weekly minutes per cause with a falling /
  rising / flat verdict; **repeating reasons** = a (cause, brigadir) on
  `REPEAT_DAYS` (3) or more separate days, or one cell that often; **effect per
  written solution** = minutes per day in the `WINDOW` (14) days before it was
  written against the days since (at most 14): ≤ −30% works, ≥ +15% worse,
  between = weak, under `MIN_AFTER_DAYS` (7) too early (`_verdict`; choices, one
  constant each). A solution marked doing / done that is weak or worse is
  flagged «rethink». It reads the solution's own brigadir × cause (a
  whole-cause solution: the cause across every unit in scope).


## WHO answers for a waiting category (`idle-owner`)

From **2026-09-10** (the operator's directive) each ojidaniya category has ONE
named person answerable for driving it down — the **«Kutish mas'uli»**, a role
of its own. Two separate things follow, and `services/idle_scope.py` is THE
definition of both, for the reason `factory_scope` is the one definition of the
plant: if each page decided for itself what «Cat D3's owner» means they would
disagree the first time a category changed hands, and nobody could tell which
page was lying.

1. **The NAME.** Every by-category surface prints its owner beside the category:
   the «Xarajat» tree, the «Toifalar bo'yicha» matrix and all three workbooks. A
   cost figure with nobody's name against the cause is a number nobody owns.
2. **The SCOPE.** A viewer holding the role reads `/downtime` and `/idle-cell`
   through their own categories and no others. Applied server-side and never by
   hiding a control — `?cats=` is a query parameter anyone can type.

**They read the pages everyone else reads, narrowed.** A page of the role's own
(«Mening toifam», `/idle-owner`) was built and WITHDRAWN the same day, on the
operator's call: narrowing the two pages people already know beat teaching them
a third. `routers/idle_owner.py` survives with the ADMIN register alone, and
the `idle-owner` PAGE KEY is gone from `PAGE_KEYS` — a stored Access matrix
still naming it is dropped harmlessly by `get_page_access`, which walks
`PAGE_KEYS`, so no migration was needed. Do not resurrect the page without a
new decision; the two locks below are the feature.

- **`idle_category_owners.category` is UNIQUE, and that unique key IS the rule.**
  «One for each category» is the operator's own wording, so it is a guarantee of
  the schema rather than of whoever last edited the writer — the shape
  `uq_wage_rate_from` is an expression index for. Re-assigning REPLACES; there is
  never a second owner to disambiguate between. A person may own SEVERAL
  categories (twelve causes, fewer people); the inverse is what the key forbids.
- **The owner is a PROFILE, keyed by `identity.profile_key`** — a person, not an
  account, so every holder of that profile is named. The `"role:id"` STRING and
  not `role_profiles.id`, because a supervisor lives in the `managers` namespace
  and may perfectly well own a cause; `WebCredential` already handles both.
- **Nothing is denormalised and NO figure moves, ever.** The owner is resolved on
  read, so re-assigning a category re-labels every past surface at once with no
  migration and no re-sync — the property `wage_rate` and `idle_source` already
  have. What the assignment decides is who is NAMED and what one role may look
  at, never what anything costs. The admin Save says so.
- **`None` is «no narrowing»; an EMPTY LIST is a real answer.** The convention
  `factory_scope.scoped_manager_ids` already uses, and the trap it marks: an
  owner whose categories were all re-assigned matches NOTHING, and reading that
  empty list as «no filter» hands them the whole plant. Every caller tests it
  with `idle_scope.empty_scope`, and both cost endpoints answer with an empty
  unit set rather than letting `ojidaniya_cost.build` read `cats=[]` as «no pick».
- **A PICK and a LOCK are two arguments and never one**, and this is the mistake
  the feature made twice. `resolve_cats` returns the intersection for the QUERY;
  `viewer_categories` is what narrows the OPTION LIST (`cat_lock`) and what the
  payload publishes as `cat_locked`. A pick must not shorten the list it was
  picked from — the rule `ojidaniya_cost.build` already keeps — while a lock
  must. Conflating them once emptied every unlocked reader's category filter,
  and once told an ADMIN who clicked one slice of the doughnut that they may
  only see the categories they answer for.
- **The 50-minute flag does not survive a narrowing.** `flagged` is a fact about
  a unit's WHOLE-day UNION, so it says nothing about one category's share of that
  day — the reasoning that keeps a traffic-light ramp off «Toifalar bo'yicha». A
  payload `narrow_downtime` touched carries `flagged: False`, and the page swaps
  the flag KPI for «how many brigadirs did this cause reach» rather than showing
  a 0 that reads as «nobody exceeded a threshold» about a threshold never
  applied. Its totals are re-summed from the kept categories (the SUM, not a
  union — the convention the doughnut picks already use), and `cat_all` keeps the
  whole option list beside the narrowed `cat_names`.
- **A narrowed register must SAY it is narrowed** — `components/idle/CatLockNotice.jsx`,
  first thing on both pages. Every other narrowing on them is a control the
  reader set and can see; this one is not, so without the notice a fraction of a
  day reads as a quiet shift, and «this cause was calm» and «the other causes
  are hidden from me» are opposite conclusions about one screen. It renders from
  the payload's `cat_locked`, never from the viewer's role.
- **On `/idle-cell` an owner is READ-ONLY, and that is stated rather than
  inherited.** `_may_decide` already answered False for them (they hold no
  unit), so edit and delete were shut by accident; CREATE is gated on the day
  being open, not on a unit, so `_require_unlocked` is its own guard on all four
  writers. `can_add` is served False for them too — a button drawn and then
  403-ing is worse than no button. The lock filters BOTH row models: the legacy
  minutes-only rows carry a category as well.
- Locked endpoints: `/downtime`, `/downtime/matrix`, `/downtime/seasonality`,
  `/downtime/cell-detail`, `/downtime/cost`, `/downtime/cost/entries`,
  `/idle-cell/cells`, all four workbooks, and the «Kutish» section of
  `/api/reports` and its document (from 2026-10-26). The PPTX deck is
  admin-only and an admin is never locked.
- **Registration is the roster, not the bot branch.** `registration-options`
  builds the name-first login list from supervisors, leaders and the two manager
  tiers; a role missing from it has profiles nobody can claim, however well the
  bot's own branch accepts it. That was shipped broken and fixed in v4.97.2 —
  any future role needs BOTH.
- Admin: «Kutish mas'ullari» (`/panel/idleowners`), one row per
  category, everything a DRAFT until Save. **Admin-only and NOT grantable** — no
  `capKey`, so `capTabs.includes(capKey ?? id)` can never admit a grantee (the
  `permissions` / `logs` / `ltdaily` model): the assignment decides what a whole
  role may read, so handing it out is handing out the ability to widen somebody's
  scope. `POST` re-checks `role == "admin"` itself, the endpoint being reachable
  without the UI.
- **`OwnerChip` renders NOTHING where nobody is assigned** — never «—» and never
  an empty chip. Twelve categories with two owners between them would otherwise
  grow ten placeholders saying only that the register is unfinished, which is a
  fact for the destination that manages it. The WORKBOOKS do print «—», because a
  blank cell in a spreadsheet reads as «this column did not apply here».
- Deliberately unchanged: every figure on every existing surface, the categories
  themselves (`sheets_reader.SHIFT_CATEGORY_ORDER` is still the one list), and
  who may FILE an ojidaniya.

Related memory: `idle-category-owner-role`.

## «Kutish yechimlari» — Tahlil tab: is it SOLVED or REPEATING? (`/idle-solutions`, 2026-11-07)

The operator's first question of the tab is «did the problem come back after the
solution», minutes second. `GET /api/idle-solutions/analytics` therefore judges by
**occurrences** — a working day on which the cause shows up at all (a
`by_category` minute > 0) — never by minutes; the old minutes-per-day
before/after, the weekly trend card, the «repeating reasons» and the «effect»
tables are gone. Per cause the NEWEST solution of each scope (a brigadir's own,
else the category-wide one) is judged by `judge()` in `routers/idle_solutions.py`:
`solved` (quiet for QUIET_X=3 × the cause's own usual gap before, 7–28 working
days), `repeating` (came back; `relapse` = after a quiet as long as `solved`
needed), `reduced` (occurrences per working day at least REDUCED_DROP=50% down),
`early` (not enough quiet yet, or under EARLY_DAYS=3 calendar days), `new`,
`nodata` (under 5 working days before), and `unanswered` for a cause with no
solution (or a brigadir with the same waiting on ≥ REPEAT_DAYS=3 days and none of
their own). **Quiet is counted in the scope's WORKING days** (days it has a row in
`_downtime`), so a weekend is not a cure. The page leads with the verdict (list
sorted repeating first); a row opens to the solution, before/after/quiet/last-seen,
the day strip and the brigadirs it came back with. A solution's comment date stands
in for the date it took effect — there is no «implemented on» field yet. The invented demo causes and the DEMO banner used to preview this were erased on 2026-11-09.
