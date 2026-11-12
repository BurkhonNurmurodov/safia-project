# Leaders' and brigadirs' KPIs

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## «Liderlar KPI» — the five KPIs on ONE page (`/leaders-kpi`, 2026-10-19)

From **2026-10-19** (the operator's directive: «merge them into one Leaders'
KPI page, show it like a leaderboard … 5 categories and one leaderboard on
different tabs … remove the existing KPI pages», eight rulings asked one by
one) the three leaders' KPI pages — `/worker-concerns` «Ishchi havotirlari»,
`/turnover` «Kadrlar qo'nimsizligi», `/foreign-objects` «Yot jismlar» — are
ONE page, «Liderlar KPI» (ru «KPI лидеров», en «Leaders' KPI»), page key
**`leaders-kpi`**, in the «Liderlar» nav group. The three old routes REDIRECT
onto their own tab (`/worker-concerns` → `?tab=concerns`, `/turnover` →
`?tab=turnover`, `/foreign-objects` → `?tab=foreign`, the query kept —
`KpiTabRedirect` in App.jsx), their page files, text bundle
(`workerConcernsText.js`) and three export modules are deleted, and their page
keys are gone from `PAGE_KEYS` — `startup.merge_leader_kpi_pages` (no flag:
the trigger state cannot recur) drops them from a stored Access matrix,
renames a personal `page.view.<old>` grant to `page.view.leaders-kpi` where no
row exists (else drops it) and drops a deny. **Admin-only until the operator
opens it on the Access tab** — `DEFAULT_PAGE_ACCESS["leaders-kpi"] = []`; the
concerns page's supervisor / leader roles were deliberately NOT carried over.
`leaders-kpi` sits in `capabilities.SCOPED_PAGES` (a «see all» grant at "all"
widens a supervisor's or leader's reach as it did on the concerns page); exam
tasks 40/41 name it.

- **`services/leaders_kpi.py` is THE board rule.** `board(db, payload, m,
  scope)` composes the three services it never re-measures —
  `turnover.month_payload`, `foreign_objects.month_payload` and the concerns
  KPI's own aggregate over `leader_concerns` (`_concerns_by_cell`, the
  `routers/worker_concerns` helpers: `BUCKET`, `_viewer_lock`,
  `_apply_scope_and_filters`, `_owner`) — joined PER OWNED CELL
  (`turnover.cell_map` + `turnover.owned` on the month's LAST day, the 14 Oct
  reading all three KPIs already listed by). One row per cell with an owner
  («Egasi») on that day, standing on it, in scope — the owner named on the
  row, an owner of three cells three rows. `GET /api/leaders-kpi?month&factory
  &shift&managers` (`routers/leaders_kpi.py`) is the ONE read every tab draws
  from: `rows[]` (`concerns` / `turnover` / `foreign` / `compliance` / `audit`
  each `{…figure, score, points}` or null, `total`, `pct`, `rank` — ties share
  a place — `owner_key` + `photo_ver` for the avatar), `totals`, `kpis`
  (key · live · weight · max_points), `rules`, the `turnover` half (its month
  payload minus the old-bundle `leaders` / `cells`) and the `foreign` half
  (minus `cells`), `options`. The board's `state` is the calendar month's
  (before · future · open · ended); the turnover half keeps its own
  (past · open · closing · closed · saved).
- **The board is KEPT between requests** (2026-10-24, after the 23 Oct «too
  slow» report). One build is every KPI of the month, and the page used to
  ask for it every 4 s
  for as long as a Verifix read ran: minutes, 15+ full rebuilds a minute, on
  the one worker. Now:
  - **The router keeps the answer** (`routers/leaders_kpi._KEPT`, a
    `services/kept_answer.KeptAnswers`, the /api/heatmap keep): served as
    built for 60 s, then up to 5 min while one new build runs behind it.
    `_board_key` is everything the answer depends on: the month, the plant's
    date, plant · shift · brigadirs, the viewer's lock (`worker_concerns
    ._viewer_lock` + `scoped_manager_ids` — the concerns half is counted
    inside it, nothing else reads the viewer) and the two Verifix reads'
    STATE (`_read_stamp`: the last `turnover_reads` / `category_reads` row,
    finished or not, still running or not). So a read that starts or finishes
    is a new key and is never answered from before it.
  - **`writer_waits=True`**: a viewer who changed anything since the kept
    answer was built never gets it, however young (`leader_register
    .last_write`) — a month closed, a read started or a Quality refresh from
    this page's own buttons shows at once. Others may read an answer up to
    5 min old. (From 2026-11-11 a «Qayta hisoblash» run also drops every kept
    answer when it ends — see that section below.)
  - **While a read runs the page polls only its STATE**:
    `GET /api/category-compliance/read` every 4 s (`read` = the journals,
    `directory` = the turnover read — one request for both), and asks for the
    board ONCE, the moment neither runs (`LeadersKpi.jsx`, `readsQ`; only an
    answer newer than the board's counts, and never over a board request
    already in flight). The read's result is on screen within ~4 s of its end
    plus one build. **From 2026-11-11 the state polled is
    `GET /api/leaders-kpi/recalc`** («Qayta hisoblash» below), which names
    the run and both reads; the rule — state only, the board once — is the same.
  - The Excel export builds its own board (uncached), as before.
- **The total is out of 5.0** (the operator's ruling) — Σ score × weight over
  the five HR KPIs (concerns 0.25 · turnover 0.20 · foreign objects 0.25 ·
  category compliance 0.20 · technologists' audit 0.10 — HR's July 2026 file)
  — those five and no others (plan fulfilment is NOT one; see «Plan
  fulfilment is not a leaders' KPI» below). **A KPI the platform has no source
  for counts 0** — from 2026-11-06 every one of HR's five is live (the
  technologists' audit last — see «Texnologlar auditi» below), so HR's own best
  total, 4.8 (the audit is scored 0–3), is the most a cell can reach. The
  board's meta line COMPUTES any shortfall from the `kpis[]` the server sends
  (5 minus the `max_points` of every KPI not `live`), never a typed number, and
  prints nothing while every KPI is live — it returns by itself if the audit
  table becomes unreadable (the audit is then not `live`). A KPI with no score —
  no people working, a month not computed — reads «—» and counts 0 in that
  row's total (ruling 6). **Concerns are the exception from 2026-11-12**: a
  cell with no concern in the month, or every one escalated, scores the rule's
  `worst` (1 → 0.25 points) — the operator, after HR's own October file was
  found to score them so (41 of its named cells). Its figure still reads «havotir
  yo'q» / «foiz yo'q»; only the score changed.
- **The concerns KPI gained a RULE** (it had bands on the page and no score):
  `concerns_rule(db)` — app setting `concerns_rule`, admin-editable like
  `turnover_rule` / `foreign_rule`, default HR's bands on the page's own %
  (resolved ÷ rated, escalated «Ko'tarilgan» excluded): > 95 → 5, > 90 → 4,
  > 80 → 3, > 70 → 2, else 1; `concerns_score(pct0, rule)` is the one
  spelling. **Counted by CALENDAR MONTH** (ruling 2: one month for every
  tab; `/worker-concerns`' free period is gone), the current month open «so
  far», the owner the cell's on the month's last day (`_owner(db, end)` in
  the concerns helpers, unchanged).
- **Every category tab is ONE shape** (ruling 7): a ranking table — cell ·
  owner · brigadir · the figure · score · KPI points, worst first — with the
  register behind the card header's view switch (leavers · complaints · the
  concerns list · the judged people), and a row opening that KPI's own working: `TurnoverExplain` and
  `ForeignExplain` (unchanged, now taking `zIndex`), `ConcernsCellModal` (the
  cell's split and its open concerns, oldest first). The concerns page's
  headline, brigadirs card, trend chart and per-leader dialog are GONE.
- **Every tab reads ONE way, and nothing on it says a thing twice**
  (2026-10-19, the operator on the first build: «remove the noise … check
  every single tab»). Top to bottom:
  - **ONE summary, no box** (`KpiBits.Summary`): the headline figure, what it
    measures and its base beside it — concerns «63% hal bo'lgan · 5 / 8 · 3 tasi ochiq · 1 tasi
    ko'tarilgan» (`concerns.pct0` on the board payload, `whole_pct`, half
    up), turnover «200.0% qo'nimsizlik (yillik) · 2 ketgan / 12 ishlayotgan»,
    foreign «2 aybli shikoyat · 4 ta yot jism shikoyatidan», compliance «63.6%
    mos keladi · 7 / 11 xodim». A headline nobody can state is a dim «—».
    The board has no summary: its headline is the «Jamoa o'rtachasi» tile.
  - **ONE muted line under it**: «oy hali tugamagan» while the month runs
    (said ONCE — the amber state pill, the state sentence and the amber
    «provisional» line under every table and in every dialog are gone), the
    turnover month's own state (closes · closing · closed · saved), the
    source's read time («Verifix: 19.10 11:51», «Sifat reyestri: …»), and a
    failed or stale read in amber (`Warn`). At the right edge, «Qanday
    hisoblanadi?» (`RulesButton`) and the admin's read / refresh / close.
    (From 2026-11-11 the read / refresh / compute buttons are gone — the
    page's one «Qayta hisoblash» below; from 2026-11-12 the close / reopen
    buttons are gone too — see «Month life».)
  - **ONE card whose header IS the view switch** (`KpiBits.ViewHead`,
    `asTabs`; the card's title is gone — it repeated the switch's selected
    word), the rows' count on its right.
  - **What the month counted toward nobody folds UNDER the ranking** — cells
    with no owner, codes not on /cells, jobs off the ladder, not-at-fault
    complaints … — as «N ta izoh» (`KpiBits.Notes`, a collapsed `<details>`
    in the card's footer): said, never dropped, never louder than the
    ranking. The amber notices box is gone.
  - **The scale, the weight, the KPI formula and compliance's mode live in
    the rules dialogs ONLY** (`KpiRulesModal only="concerns"` is the concerns
    tab's own); they were printed on the tab up to twice.
  - **Gone as repeats**: the four-figure strips and their score-distribution
    chips; the «№» column (a worst-first position that read like a rank);
    the board's «Foiz» (the total's bar says it); compliance's «Shkala» (the
    job's hover names a ladder that differs); the complaints' «Yacheyka aybi»
    («Kimga hisoblandi» says it); the leavers' hire date (the tenure says it);
    the concerns register's own search box (the page's search narrows it, as
    `q`); the foreign tab's «Lider o'rnida» chip; the cell dialog's
    code-and-owner line under a title that already names both.
- **The board** (`components/kpi/LeaderboardTab.jsx`; redesigned the same
  evening — the operator: «more rich … definitely use that web chart»), top
  to bottom:
  - **ONE muted meta line** (month in progress · the KPIs not live and
    today's maximum) with «Qanday hisoblanadi?» at its right edge.
  - **The podium** (`BoardHero.BoardPodium`): the three best cells by the
    server's rank, ordered #2 · #1 · #3 with #1 raised. Each card shows the
    owner's photo (`ProfileAvatar`) in a medal ring, the place as a big
    medal-ink numeral, the cell · brigadir, the total out of 5, and the live
    KPIs' score meters (2×2 from xl, none on a phone). Medal inks come from
    `kpiUtil.medalOf` — /leaders' own on dark, darker on light, where silver
    on white was a ghost. It shows only above three cells, with three totals
    above 0 (the /leaders rule). A card opens its row in the ranking and
    scrolls to it; a row the search or a zone hides opens `CellKpiModal`
    instead.
  - **Four equal tiles** (`BoardHero.BoardTiles`):
    - «Jamoa o'rtachasi» — the average total / 5 with a brand bar.
    - «Yashil zona» — cells whose every live KPI scores in the green band.
    - «Diqqat zonasi» — cells with a KPI in the red band.
    - «Jamoa KPI bo'yicha» — the team's average score per KPI, each bar in
      the band of that average.

    **The zones are the score tones every chip on these pages wears,
    counted** (`kpiUtil.fracTone`: ≥ 0.8 of the KPI's scale green, > 0.4
    amber, else red). They are never a threshold of their own: no band exists
    for a total. A zone tile is a toggle (`aria-pressed`) that narrows the
    ranking, together with the search, without moving anything above the
    list. Below lg the average and the team tiles span the row and the two
    zones pair up.
  - **The ranking** (`TableCard`, one-line rows): rank badge (medal ring for
    the podium) · cell · owner with photo · brigadir · one `ScorePips` per
    LIVE KPI · the total (`TotalBar`, a brand bar then the figure) · a
    chevron.
    - `ScorePips` is a segment per point of the KPI's scale, lit in its
      band's colour, with the figure beside it in text ink and the figure in
      words in the tooltip.
    - The audit column is gone while the audit is not live (it could only
      read «—»). A KPI that goes live grows its column (`liveKeys`).
    - **It fits its card — no sideways scroll on a desktop** (the same
      evening: sized by its longest names it ran past the card's edge and
      cut «Jami» and an opened radar off). `fitColumns` in `LeaderboardTab`
      plans a `table-fixed` `<colgroup>` against the scroller's visible
      width (`TableCard scrollRef` + `useElementWidth("client")`): every
      column but the names is as wide as its header label in the reader's
      language (measured, so no language is cut) or its content; the owner
      comes first, its longest name whole where the card allows; the
      brigadir column takes what is left and shows only while the owner
      still keeps 280px (or its whole name) — never with one brigadir in
      scope — else it is named on the owner's hover. Names cut with «…»,
      whole on hover. Short of a 200px owner, «Jami» drops its bar; below
      that (a tablet) the table scrolls and an opened row's panel is
      `sticky left-0` at the visible width, so it never scrolls away.
      Verified 1280 (sidebar pinned) → 1920 in uz_cyrl and en.
  - **A row opens in place onto `BoardPanel`**. Several rows can be open at
    once, so closing one never moves the row tapped.
    - **The radar** (`KpiRadar`, plain SVG) has one spoke per KPI in the
      page's order, every score drawn as a share of its OWN scale (the
      audit's ends at 3), with rings at each fifth on a card-coloured plate.
    - The cell is the emphasis (brand gold, filled, dots with a surface
      ring). The team average (`totals.by_kpi[k].avg_score`, over cells with
      a score) is a dashed neutral outline.
    - A KPI the platform does not compute keeps its spoke, dimmed with «hali
      hisoblanmaydi», and gets NO vertex: «not measured» must never read as
      0. A KPI with no score this month also gets no vertex, and its label
      reads «—».
    - Every score is printed in its axis label, so the radar has no ticks
      and no tooltip.
    - Beside the radar, «Kuchli tomonlar» lists the green-band KPIs and
      «O'sish zonalari» the amber, the red, then the unscored ones («bu oy
      baho yo'q — jamiga 0 qo'shildi»). Every live KPI sits in exactly one
      list, so the two lists are the radar's table view.
    - Each item shows the KPI's figure, the team average and a meter, and a
      click opens that KPI's explain dialog. Hovering an item lights its
      spoke, and hovering a spoke lights its item.
    - «Ballar hisobi» opens `CellKpiModal` (score × weight = points).
    - On a phone the row is a card with the meters under the name, and the
      panel stacks.
  - **The month before.** `LeadersKpi` asks for
    `GET /api/leaders-kpi?month=<prev>` with the same scope, only on the
    board tab, and only when the previous month is ≥ `START_MONTH` (2026-10,
    HR's first KPI month — earlier months are not KPI months, and their
    turnover is saved only by hand). `kpiUtil.comparable` must also hold:
    the same live KPIs, each scored in both months or in neither. Otherwise
    a KPI one month lacks would read as everybody rising at once.
    - When the months compare, the board shows the place moved (▲/▼/=
      beside the rank and on the podium, «yangi» for a new cell), the change
      in the team average and in each KPI's average (tiles 1 and 4), and each
      score's change (radar labels, panel items).
    - **Nothing shows in October 2026; it appears by itself from November.**
      There is no sparkline yet, with one month of history.
  - `T.figForeign` / `figForeignNone` were missing from all four bundles (the
    board dialog printed a blank line for foreign objects); they are added.
  - Month (`DateRangePicker month`, from `PAST_FROM`), plant → shift →
    brigadir (`FilterPanel`) and the search narrow EVERY tab. The tab strip
    (`asTabs`, `lkpi.tab`, `?tab=` honoured once per mount) is the page's
    first row, above the toolbar. `KpiRulesModal` prints the five rules off
    the payload.
- **The frontend**: `pages/LeadersKpi.jsx` (+ `pages/leadersKpiText.js`, four
  languages, the board's / concerns tab's / audit tab's / rules' words),
  `components/kpi/` (`kpiUtil`, `KpiBits`, `LeaderboardTab` + `BoardHero` +
  `BoardPanel` + `KpiRadar`, `ConcernsTab` +
  `ConcernsPieces`, `TurnoverTab`, `ForeignTab`, `ComplianceTab` +
  `ComplianceExplain` + `ComplianceRules`, `AuditTab` + `AuditExplain`, `CellKpiModal`,
  `KpiRulesModal`). The turnover and foreign-objects tabs keep
  reading their OWN bundles (`turnoverText.js`, `foreignObjectsText.js`) and
  components (`components/turnover/`, `components/foreign/`) — their notices,
  columns and dialogs did not move — and take the page's bundle as `TK` for
  the summary's shared words (`notOver`, `notesN`, `sum*`, `tv*`).
- **The compliance tab («Muvofiqlik», live from the evening of 2026-10-19)**
  reads the board payload's `compliance` half — `category_compliance
  .month_payload`, its `cells` list dropped — and computes nothing: the
  summary prints the rate with comply / counted, the HR journals' read time
  (`read`, this KPI's own; the turnover directory, `directory`, which places
  people, speaks only when it was never read) and the admin's «Verifix'dan
  o'qish» (`POST /api/category-compliance/read`; the page polls the board
  every 4 s while either read runs); the notices (cells with no owner, jobs
  off the ladder, ambiguous jobs, codes not on /cells, people in no cell,
  approximate owners / roster) fold under the ranking; the rule, its mode and
  its no-category answer are `ComplianceRules`'. «Reyting» (one row per owned
  cell, worst rate first) or
  «Xodimlar» (every judged person of the ranking's cells — `GET
  /api/category-compliance/people` in chunks of 40 keys, `kpiUtil.fetchPeople`,
  asked only when the view opens) behind the card header's switch; a row opens
  `ComplianceExplain` (the rate, the band framed on the scale, the points, the
  people grouped: do not comply · comply · out of the count, each with job,
  tenure, the due and the current category); «Qanday hisoblanadi?» opens
  `ComplianceRules` (the rule in words, HR's ladder step by step and the
  Verifix job → ladder map, read off the FULL rule the payload carries). Three
  empty states say which door is shut: Verifix not connected (`configured`),
  the journals never read (the admin's read button), the directory never read
  (the turnover tab's). Its words are the `cp*` keys of `leadersKpiText.js`;
  a person's verdict is `KpiBits.VerdictChip` (green comply · red not · grey
  out of the count, always with the word).
- **The workbook is ONE** — `POST /api/leaders-kpi/export.xlsx` →
  `services/leaders_kpi_export.py`, nine sheets (Umumiy · Reyting ·
  Havotirlar · Qo'nimsizlik · Yot jismlar · Muvofiqlik · Ketganlar ·
  Shikoyatlar · Havotirlar ro'yxati), the page's own words (`labels` carries the kinds /
  sources / statuses), logged as `export.leaders_kpi`. The three per-page
  exports (`turnover_export.py`, `foreign_objects_export.py`,
  `worker_concerns_export.py`) and their routes are gone, as are
  `/api/worker-concerns/{meta,stats,leaders,thresholds}`; `/api/turnover/*`
  (the month's actions: read · close · reopen · compute, people) and
  `/api/foreign-objects/{,refresh}` stay, re-gated on `leaders-kpi`, and
  `/api/worker-concerns/list` is the concerns register.
- **Consequence to know**: a supervisor or leader who could open
  `/worker-concerns` cannot open the merged page until the operator ticks
  their role on the Access tab (their personal `page.view.worker-concerns`
  grant, if any, was renamed and still opens it).

The three sections below describe the KPIs' figures and rules, which did not
change; where they speak of their own PAGE, read «a tab of /leaders-kpi».

## «Qayta hisoblash» — ONE button brings every KPI up to date (`/leaders-kpi`, 2026-11-11)

The operator, 2026-11-11: «Everything should be automatically calculated when
the page is open … The HR won't have any idea if they have to press these
buttons», asked «every time it opens», chose «the old figures + a small note»
while it runs, and then: «Add one re-calculate button which reloads everything
and shows up-to-date calculation. Until [then] show the old data». The page
had FOUR admin-only buttons on three tabs, each fetching one source —
«Verifix'dan yangilash» / «Hisoblash» / «Yangilash» (turnover), «Verifix'dan
o'qish» (compliance), «Reyestrni yangilash» (foreign objects) — and nothing
told a reader which one a figure was waiting on. All four are gone (their
empty-state twins too); one button sits on the page bar, left of «Excel».

- **`services/kpi_recalc.py` is THE run.** In the order the sources depend on
  each other: the Quality register from its Google Sheet (on its own thread,
  seconds — the Quality page has NO scheduled sync, so the foreign-objects KPI
  used to move only when someone pressed a refresh) beside the Verifix
  directory (turnover, minutes; on a PAST month the same read computes and
  saves the month, as «Hisoblash» did), then the Verifix HR journals
  (compliance) after the directory that places their people — the nightly
  23:40 → 23:55 order. Concerns and the technologists' audit read the database
  as it stands: nothing to fetch. A read somebody else started (the nightly
  one, the other worker during a swap) is WAITED FOR, never doubled. When the
  run ends it drops the board's kept answers (`_KEPT.forget`), so the next
  request builds from the new data.
- **Doors** (`routers/leaders_kpi.py`, gated on the page key — whoever sees
  the figures may bring them up to date; the four buttons were admin-only):
  `POST /recalc` (the button; «Jurnal» `sync.kpi_recalc`), `POST /recalc/auto`
  (the page itself; in `action_log._SKIP` — it fires on every open), `GET
  /recalc` (`running` = this run OR either Verifix read, `run`, `last` with
  each step's `{ok, error | joined}`). The old doors (`/api/turnover/read |
  compute`, `/api/category-compliance/read`, `/api/foreign-objects/refresh`)
  stay for a tab on an older bundle.
- **Every open starts a run** (and every month change): `/recalc/auto` skips
  only a run already under way (joined) and the case where every source
  finished a GOOD read in the last 5 min (`AUTO_FRESH` — a re-mount a minute
  after a run would read Verifix again for nothing; a source that FAILED is
  tried again on the next open). A never-computed past month is computed on
  open; a SAVED one only on the button.
- **The old figures stay until it has finished** (`LeadersKpi.jsx`): the
  button turns into «Hisoblanmoqda…» with a spinning icon and is disabled;
  the page polls only `GET /recalc` every 4 s and asks for the board ONCE when
  nothing runs (invalidating `leaders-kpi`, `cc-people`, `quality`). Each tab's
  muted line still names its source's read time and a failed read in amber.
  The button's own press ends in ONE toast — «Hisob yangilandi», or which
  source could not be read («… o'qilmadi — u bo'yicha oldingi ma'lumot»);
  the automatic run on open ends silently (the per-tab «Verifix o'qildi»
  toast is gone — it fired on every open).
- **A CLOSED month is re-read by the button** (2026-11-12, the operator: «remove
  the buttons and read when the qayta hisoblash is pressed»). The turnover
  month's «Qayta ochish» / «Oyni yopish» are gone from the tab; pressing
  «Qayta hisoblash» on a closed month runs the Verifix read and then
  `turnover.refreeze` — reopen + close in one transaction, so its leavers are
  read again and its rule (the excluded reasons with it) is the one in force
  now. Only the button, never the automatic run on open (`_refreeze_month`),
  and only after a good read; a failed one leaves the month as it was frozen.
  Whoever may press the button may do it (the page key) — the two buttons were
  admin-only; the figures it re-freezes follow the admin's own «Sabablar».
  `/api/turnover/close | reopen` stay for a tab on an older bundle.
- **Not changed**: «Sabablar», the rules dialogs and «Excel». The month-closing day
  (the 5th at 09:00) was questioned the same day and is still open — see
  «Month life» in the turnover section.

## «Ishchi havotirlari» reads the CELL CONCERNS (`/worker-concerns` — MERGED into `/leaders-kpi`, 2026-10-19)

From **2026-10-03** (the operator's directive: «use our Cell concerns data, not
the Excel») the leaders' KPI page reads the concerns workers file on
`/cell-concerns` — `leader_concerns` rows with `worker_name IS NOT NULL` — and
no longer the ~180 per-cell Google sheets. `routers/worker_concerns.py` is the
whole of it; `pages/WorkerConcerns.jsx` keeps its bands and its export (its
structure changed the same day — see the redesign bullets below).

- **Every level counts.** /cell-concerns shows a filing only while it is the
  leader's; this page counts it wherever it now sits — an uplift does not
  un-file a concern.
- **Four statuses, ONE rule — `BUCKET`** (SQL, read by the filter, every
  aggregate, the register, the export and exam tasks 40/41): `uplifted`
  («Ko'tarilgan») = handed to the brigadir or above, WHATEVER became of it
  after — still open there or resolved there (the sheets' «O'tqazish») ·
  `done` = resolved at the leader step · `doing` / `todo` («Yangi»,
  /cell-concerns' word) at the leader step. «deferred», the sheet era's key, is
  read as `uplifted`.
- **A month that has ENDED counts a concern resolved only if it was closed BY
  the month's last day** (the operator, 2026-11-11: «consider the concern
  closed only if it's closed by the end of the month»; a past month's % used
  to keep rising as late closures came in — on the 9 Nov copy October read
  82% that way and 68% by this rule). `_bucket(end)` is BUCKET with that
  cutoff and what `_agg_cols`, the status filter, `/list` and the board's
  register read; a period still running (`end >= today`) is plain BUCKET, so
  the current month and exam tasks 40/41 are unchanged. The closing day is the
  server's `done_at` on the plant clock (`completion_date` can be typed), then
  `completion_date`, then the filing day for a row with no stamp. A concern
  closed later reads «Jarayonda» for that month — it was open at its end —
  and earns nothing in the next month either (it belongs to the month it was
  filed in). Its row keeps `status: "done"`, so the register adds «oy tugagach
  hal qilingan» beside the chip (`ConcernStatus`, `cLateDone`). The 5th of the
  next month was offered as a grace day and declined. NOT cut the same way:
  «Ko'tarilgan» still reads the concern's level as it stands today.
- **An uplifted concern is out of the leader's rating** (the operator,
  2026-10-04 — it was counted until then, a brigadir's resolution crediting the
  leader). Every % — leader, unit, headline, the change line (`_previous`), the
  workbook — is `done ÷ rated`, rated = total − uplifted (`_rated` /
  `_figures`, client `ratedOf`); `MIN_RANKED` counts rated concerns (ONE since
  2026-10-17 — see the ranking bullet). «Ochiq» /
  `open` = doing + todo, what still waits on the LEADER — the ranking, the
  cells card, the leader dialog's list (`OPEN_KEYS`) and exam task 41. The
  register prints a resolved-above row as «Ko'tarilgan» plus «yuqorida hal
  qilingan» (`ConcernStatus`); a leader's own «Brigadirda» list asks `/list`
  with `open_only` so it holds only the unresolved. The ranking shows the
  uplifted count as `↑N` under «Jami» and the headline/dialog say «N kept by
  the leader … M escalated — not in the %» (`OfLine`). Level moves only on an
  escalate or a return, so a concern sent back down is the leader's again.
- **A concern counts for its CELL'S OWNER ON THE PERIOD'S LAST DAY** (the
  operator, 2026-10-14 — it was the filing day from 2026-10-13): the «Egasi»
  (`cells.owner_id`, the Verifix seat) of the cell it names on `_end(date_to)`
  (the period's last day; today for an open period), read through
  `turnover.cell_map(db, end)` + `turnover.owned` — the very reading «Kadrlar
  qo'nimsizligi» credits a month by. The owner on that day gets the WHOLE
  period, history re-read: nothing is stored. `_owner(db, end)` is THE rule and
  its only spelling: a scalar subquery over a VALUES list (code → owner),
  cached on `db.info` per day, so it composes into every filter, aggregate and
  count with no join to forget. It decides the Lider filter (`_owned_by`),
  `/meta`'s options (read on today), the cells card's name and the register.
  The unit is still the row's own (`brigadir_manager_id`). **The register
  names the OWNER only** (the operator: «owner only») — `leader` IS the owner,
  `cell_owner` repeats it for an older tab, whom it was filed to is no longer
  printed, and the search finds the owner's name, not the filed-to one.
  Leaders are picked by PROFILE id (`leader_id`, client key `wc_lead_ids`).
- **Scope**: admin / top-manager / a page grant at "all" → everything;
  shift-manager → shift ∩ plant units; supervisor → their unit; leader → the
  concerns of every cell they OWN or RUN («Boshqaruvchi») on the period's last
  day (`_led_by`, every profile record that is that person — the operator,
  2026-10-14: «the cells they own and they manage»; exam tasks 40/41 read the
  same through `leader_filings`); any other role → nothing. The plant lock
  rides on top.
- **The ranking is PER CELL** (the operator, 2026-10-14: «rank per cell (one
  row for the cell) but do not include the ones without owner») —
  `_scope_cells` + `_cell_rows`: one row per cell that has an owner on the
  period's last day and stands on it, in the view (the cell's brigadir ON that
  day is what the viewer lock and the plant / brigadir pick narrow; a
  brigadir-less cell only under «All factories»), named by its owner, concerns
  or not. An owner of three cells is three rows. A cell is ranked once
  ONE rated concern stands behind it (`MIN_RANKED = 1`; the operator,
  2026-10-17: «there's no limit for low data» — it took 5 until then, and
  the «kam ma'lumot — 5 tadan kam havotir» group is gone); a cell whose every
  concern was escalated has no % and is listed under «Foiz yo'q — hamma
  havotir yuqoriga ko'tarilgan»; a cell with none in the period is listed
  under «Bu davrda havotir yo'q». The brigadirs card follows the same rule. **Every owner is
  ranked** — the 2026-10-04 «Lider o'rnida» rule (`RANKED_KIND`) is gone. A
  leader who owns no cell is on no row (the roster fold `_roster` /
  `_with_roster` / «Yacheyka egasi emas» is gone). Concerns that land in no
  row — a cell with no owner, or one outside the view — are the «unassigned»
  bucket, so the rows and it add up to the headline. `/leaders` serves
  `counts` = {owners, cells}, printed as «N ta egasi · M ta yacheyka»
  (`rCounts`) in the ranking's subtitle — the pair «Kadrlar qo'nimsizligi»
  prints for the same period. Each row also carries the old leader-row fields
  (`leader`, `cells`, `brigadirs`, `kind: "leader"`) so a tab on an older
  bundle reads one row per cell. A row opens `CellModal` (the cell's split and
  its open concerns; «see all» picks the cell). The workbook's ranking sheet is
  the same rows: Yacheyka · Yacheyka egasi · Brigadir · counts · %.
- **The Google-sheet sync is GONE** (same day, the operator: «get rid of that
  sheet»): `services/worker_concerns.py` (the nightly crawl, its Drive sweep and
  the page's Refresh / sync pill / sheet-failure banners), the one-shot
  `services/sheet_concerns_report.py`, the three ORM models and their two column
  migrations, in BOTH entrypoints. **The tables were NOT dropped** —
  `worker_concerns`, `worker_concern_sync`, `worker_concern_sheet_state` still
  hold the last crawl's rows and nothing reads them; dropping them is a separate,
  irreversible decision. `/meta` still ships a `sync` stub and the leaders as
  strings for a tab open on an older bundle; the «Jurnal» keeps its
  `sync.worker_concerns_*` labels for the rows already recorded.
- History is what /cell-concerns holds — workers filed there from 2026-09-06,
  so earlier periods read empty here.
- **TWO tabs from 2026-10-03 (the operator's redesign, every point approved
  over three review rounds).** «Reyting» opens on the KPI: a headline (the rate
  in its band's ink, «N ta havotirdan M tasi hal bo'lgan», the change against
  the previous period, ONE status bar that adds up to the total — its labels
  are the page's status key — and the facts) → «Brigadirlar» (only with more
  than one unit in scope; a tap narrows the page to that brigadir and says so in
  a bottom toast) → «Liderlar reytingi» (by %, best first; «foiz yo'q» — every
  concern escalated — next, unranked: the n<5 «kam ma'lumot» group is gone since
  2026-10-17; leaders nobody wrote to folded at the bottom; a tap opens the
  leader's dialog with their split and open concerns, oldest first) →
  «Yacheykalar» with the most open concerns → «Kunlik dinamika» («Haftalik
  dinamika» past 92 days, opening on the first filing; the y-axis says it
  counts concerns). «Ro'yxat» (view key `havotirlar`) is the register: phone
  cards, a wrapped table on sm+. Saved `wc_view` values from the three-tab page
  still load; the ranking's sort has a key of its own (`wc_rank_sort`).
- **On a phone the ranking opens on 10 cells** (`PHONE_ROWS`) with «Yana N
  yacheykani ko'rsatish» under them — all 69 had put the cells and the trend seven
  screens down. A search shows every match. A phone row keeps the % alone on
  the right; its counts are a third line and its cell codes wrap.
- **A LEADER (`lock_own_leader`) gets no ranking of one**: their headline, their
  unresolved concerns oldest first with the way to /cell-concerns at the TOP of
  that card (full width on a phone — it is the job they came to do),
  «Yacheykalarim» (every cell they own or run, by open concerns) and the trend. Exam
  tasks 40 and 41 read straight off it.
- **ONE whole percent, computed once: `pct0`** = `whole_pct(done, rated)`
  (`services/worker_concerns_export.py`), half UP from the raw counts, on every
  payload beside the old one-decimal `pct`. The page prints and bands by it, the
  workbook prints and bands the same integer; order uses the exact ratio. Never
  round a % with Python's `round()` here — it rounds halves to EVEN (5 of 8 was
  62% in the file and 63% on screen), and rounding the one-decimal figure again
  made 17 of 19 read 90%.
- **Statuses wear the platform's colours AND an icon**: «Hal bo'lgan» green ✓✓,
  «Jarayonda» amber clock, «Yangi» (not started) GREY `#94a3b8` circle — the
  colour /cell-concerns and /concerns give the same rows; it was red, which is a
  fault, not a state — and «Ko'tarilgan» darker slate `#64748b` up-arrow. Open
  counts above zero are red wherever they are printed. The workbook uses the
  same palette.
- **The change line compares like with like** — `/stats` → `prev`
  (`_previous`): the previous window of the same length, read AS IT STOOD the
  same distance past its own end (resolved only if the server's `done_at`, on
  the plant clock, falls by then — `completion_date` only where no stamp
  exists). None for an open range, a status filter, or a window that starts
  before `_first_filing` — the first filing in the VIEWER's scope with no picks,
  the same date the «Ma'lumotlar … dan boshlanadi» notice names. It reads
  «±N punkt · oldingi N kun (dd.mm–dd.mm): P%», coloured only where the
  headline is graded and the move is ≥ `DELTA_MIN` (3) points, else «≈ deyarli
  o'zgarmagan».
- **A period shorter than 7 days grades nobody** (`SHORT_PERIOD_DAYS`): its
  newest concerns have not had time to be resolved. The headline, the ranking,
  the units, the leader dialog and the change arrow all stay neutral.
- **The workbook names the scope each sheet was counted over**: the overview
  and ranking sheets are the KPI (status pick and search ignored) and print
  `meta`; the register sheet prints `register_meta`, which adds them. The
  leaders sheet follows the screen's order (`leader_order` → `_in_order`;
  `_ranking_order` is only the fallback).
- **A cell is a link** (`cell_ids` on /leaders, `cell_id` on /list → `CellLink`)
  wherever it is not inside another button; inside one (phone rows, the
  «Yacheykalar» rows) the code wears `.cell-link` and the row ends in an arrow.
- **A failed request never reads as zeros** — each section shows the failure
  (`EmptyState tone="danger"`) with «Qayta urinish»; an empty period offers
  «Barcha vaqtni ko'rsatish» and, with filters on, «Filtrlarni tozalash». A
  reversed range is a 422 `{code: "range_reversed"}` the page translates.
- **The filters cascade** (`/meta`: `leader_opts[].units`, `cells[].units /
  leaders / pairs`): a brigadir pick narrows the Lider list, a leader (else
  brigadir) pick narrows the Yacheyka list, each says so (`note`) and offers the
  way back (`empty`); a pick its list no longer offers is dropped. A leader is
  offered no Brigadir filter.
- **Cost**: the viewer lock (`lock=`) and the plant/brigadir narrowing
  (`units=`) are resolved once per request; `/meta` is one grouped query; the
  periods read the partial index `ix_leader_concerns_worker_entry` (its own
  startup step, after the column step commits).
  A name that holds one axis of the LOCK must never be `units`: `_roster` once
  unpacked the lock into `units` and silently dropped the brigadir pick (every
  leader listed under any pick) — the lock's axes are `lock_units` /
  `lock_leaders`.
- **The file grades exactly what the page grades**: `/meta` serves
  `short_days` (SHORT_PERIOD_DAYS) and the page reads it; the export grades
  nobody on such a period (`plain` → `_band_of` "plain", `labels.shortNote`
  printed), and the brigadir block's % wears the same flat band tints — a colour
  SCALE painted 79% near-green there while the page called it yellow. The daily
  table runs from max(date_from, the first filing) to min(date_to, today):
  «Barcha vaqt» begins in 2015.
- **A row spanning a fixed-layout table spans the columns SHOWN.** The ranking
  and the register drop columns below xl, and a `colSpan` wider than what is
  rendered invents empty columns that take their share of the width (the names
  column fell to 90 px at 768). `SpanCell` renders one cell per layout.
- **The headline's key is the status split**: filled badges (the segment's
  colour + its icon, `StBadge` / `StackLegend` icon parts); side by side with
  the figure only from xl, stacked below it. A leader's own list puts what they
  can act on first («Yangi», «Jarayonda») and what already sits with the
  brigadir after it, under «Brigadirda». The thresholds button is an icon in
  the ranking card's header. Alternating row shading on the wide table was
  proposed and declined by the operator.

## «Kadrlar qo'nimsizligi» — the leaders' turnover KPI (`/turnover` — MERGED into `/leaders-kpi`, 2026-10-19)

**Its name on screen is «Xodimlar ishdan bo'shashi»** (uz_cyrl «Ходимлар ишдан
бўшаши») from **2026-10-23**, the operator's call — the KPI's full name in the
board panel, the rules, the workbook's KPI label and the «Jurnal» rows. The
label only: the short tab / column word («Qo'nimsizlik»), ru / en, the page
key and every `turnover*` key and table are unchanged.

From **2026-10-04** (the operator: "ignore the past — from October HR
calculates the KPIs on the IMS; this is the 2nd of 5") HR's «Текучесть» is
computed month by month from Verifix. Page key `turnover`, **admin-only until
the operator opens it** (HR is who it is for); refresh / close / reopen /
compute are admin-only in the endpoint. `services/turnover.py` is THE rule,
`services/turnover_sync.py` the Verifix read, `services/turnover_export.py` the
workbook, `routers/turnover.py` the door; `pages/Turnover.jsx` (+ its words in
`pages/turnoverText.js`, four languages) and `components/turnover/`.

- **The formula is HR's July file** («кпи Лидеров июл 2026», decoded and
  recomputed to the cached values on all 205 rows): cell turnover = people who
  LEFT in the month ÷ people WORKING on its last day × 12, scored by HR's bands
  (≤ 50 → 5, ≤ 60 → 4, ≤ 70 → 3, ≤ 85 → 2, above → 1), KPI points = score × 0.2.
  The rate is rounded to one decimal and judged as printed.
- **Left** = every employment whose Verifix dismissal date is in the month, any
  reason, counted in the cell they left from. **Working** = employed on the last
  day (hired by it, not dismissed by it), in their cell that day; anyone whose
  same employment ended in the month is never in it. **Cell** = the Verifix org
  unit's `code`, else the digits its NAME starts with (15 units — dispatch 47xx,
  freezers 17xx/18xx, 0611 — carry the code only in the name), matched to
  /cells; a unit that is anybody's DEPARTMENT (`division_id`) is never a cell.
  A code /cells lacks counts toward nobody and is NAMED on the page.
- **Dismissal reasons an admin may take out of the count** (2026-11-06, the
  operator asked how an admin could keep a reason out of the calculation, then
  «build it»). Until then every dismissal counted as «left» whatever Verifix's
  journal said; the reason was shown and never read. `turnover_rule` gained
  `exclude_reasons` (Verifix's own words, ≤ 100, `clean_reasons`). `aggregate`
  is THE place it bites: a leaver whose reason is on the list adds to no cell's
  «left» (nor to the «not on /cells» tally) and is listed with `counted:
  "reason"` — muted, labelled «Sabab hisobga olinmaydi», never dropped, so the
  page stays able to say who left.
  - **Compared by `norm_reason`** (trimmed, spaces squeezed, case-folded): the
    journal spells one reason a few ways. **A leaver with no reason is always
    counted** — if the journal was unreadable that night the KPI must not
    depend on it; the dialog says so on its own row.
  - **A closed month keeps the list it was closed with.** `close()` and
    `save_past()` already froze `rule(db)` into `turnover_months.rule`, so the
    list rides that freeze and a later change never moves a closed or saved
    month; a month closed before this reads no exclusions. To change a closed
    month press «Qayta hisoblash» on it (from 2026-11-12; before, an admin
    reopened and closed it — «Учёба» was switched off on 11 Nov after October
    had closed, so October still counted it). An open or
    closing month reads the live list. `brigadirs_kpi` and «Hisobotlar» read
    the same month payload, so they follow it.
  - **The rule's two halves are independent now** (`rule()`): a malformed
    scoring override falls back to HR's bands, the exclusions are kept either
    way; `save_exclusions` writes only `exclude_reasons` beside whatever else
    the override holds (an override left empty is deleted).
  - **Where an admin sets it**: «Sabablar» on the «Ketganlar» view of the
    turnover tab (`components/turnover/TurnoverReasons.jsx`, «Sabablar · N»
    once a list is in force). Ticks mean «counts». The list is every reason
    ever seen (`reasons_seen`: live leavers + frozen months), most used this
    month first, plus any excluded reason nobody carries now (so it can be put
    back); a search box from 13 reasons. Under the list a fixed-height line
    states the price BEFORE saving — people not counted, the plant's rate
    before → after, how many cells change score (`exclusion_preview`, the same
    `aggregate` over the whole plant; never a figure for an earlier tick). A
    closed month says it keeps its own list instead of previewing.
  - **Doors** (`routers/turnover.py`, all `verify_admin`, none grantable):
    `GET /api/turnover/exclusions?month=`, `GET …/exclusions/preview?month=&
    reasons=`, `PUT …/exclusions` {reasons}. The PUT flushes every kept answer
    (`kept_answer.forget_all`) and is logged as `config.turnover_exclusions_saved`
    (added / removed / total); category `config`, so the assistant cannot make
    it. Everyone else reads the rule — a line in «Qanday hisoblanadi?» and the
    muted rows — never the controls.
  - Not built: excluding one PERSON (a reason applies to everybody alike and is
    easy to audit; per-person exclusions invite a dispute per case), a start
    date per list (the month's close is the date), a per-reason weight.
- **A cell's turnover is its OWNER's, and the ranking is PER CELL** (owner
  from 2026-10-13, the operator: «the KPIs will be calculated for the cell
  owner»; per cell from 2026-10-14: «rank per cell … do not include the ones
  without owner») — `cells.owner_id`, the «Egasi» Verifix seats in the cell, on
  the month's last day (`cell_links`), never the «Boshqaruvchi» (`leader_id`),
  who is shown beside it on «Yacheykalar» and scored nothing. The «Reyting» tab
  (`ranking` on the payload) is one row per OWNED cell — `turnover.owned`: an
  owner on the last day and standing on it — with its own rate, score and KPI
  points, the owner named on the row; an owner of several cells has a row for
  each (the old one-figure-per-leader Σ is gone; `leaders`, the same cells
  folded by owner, is served only for a tab on an older bundle). Totals carry
  `owners` / `owned_cells` («N ta egasi · M ta yacheyka» in the ranking's
  header — the pair «Ishchi havotirlari» prints, through the same `cell_map` +
  `owned`), and `scored` / `by_score` / `no_people` now count cells. The open
  month reads its map on its LAST day too (`cell_map(db, last_day(m))`). A
  leader who owns no cell is on no row. A leaver in a cell not owned on the
  last day is `counted: "no_owner"`. Cells with no owner (Verifix seats nobody there, or two),
  codes not on /cells, units that are not cells and owners whose cells hold
  nobody are each counted and said in the «Hech kimning baliga…» card — never
  silently dropped. **History re-read**: a month frozen before owners were
  frozen with it (every saved past month) takes them from the dated links
  through `turnover.with_owners`; a capture from now on freezes `owner*` in
  the month's map. Totals carry `left_owner` / `left_no_owner` (and the old
  `left_leader` / `left_no_leader` names, same values, for an older tab).
- **Verifix keeps only TODAY's placement** (and a re-hire erases the earlier
  dismissal from its directory), so the platform keeps its own history: a
  nightly read at **23:40** (+ a boot catch-up when the last good read is
  > 6 h old, + the admin's «Verifix'dan yangilash» — from 2026-11-11 the page's
  «Qayta hisoblash», on every open and on the button) replaces `turnover_people`
  (the directory: name, status, dates, unit, job — nothing else) and records
  every ended employment from the start in `turnover_leavers` (keyed by the
  cycle id; the same cycle working again = cancelled). Reasons come from the
  dismissal journal (`pro/` else `start/dismissal$list`) and never move a figure.
- **Month life**: the current month is computed from the last read («so far»,
  provisional); the first complete read at or after **23:00 on the last day**
  TAKES the month's working list + the cell → owner map (`turnover_months`,
  `turnover_month_people` kind roster) — the exact denominator; the month stays
  open for late dismissal orders until the **5th at 09:00** (a default the
  building session chose on 4 Oct — no ruling names it; the operator asked
  «who decided the 5th 9:00?» on 2026-11-11 and has not set another day yet), then closes by
  itself (`auto_close`, daily 09:05) and its leavers freeze too. A dismissal
  typed in later is listed as late, never counted — until «Qayta hisoblash»
  is pressed on that month, which reads it again (see «Qayta hisoblash»). The
  close / reopen buttons are gone (2026-11-12); a month an older tab reopens is
  closed by the next 09:05 run.
- **Past months** (the operator, same day: "a button, saved, then it says
  update"): from **January 2025** to September 2026 a month is computed on an
  admin's «Hisoblash» and SAVED (from 2026-11-11: by itself the first time the
  month is opened, «Qayta hisoblash» recomputing it); the button then reads «Yangilash» and recomputes
  on a fresh read (`POST /compute` → `save_past`). Built from today's directory:
  leavers by dismissal date, re-hired ones from the dismissal journal (`approx`,
  placed by today's unit, marked ≈); working people by their CURRENT unit,
  owners as the dated links answer — so a saved past month is approximate and the page
  says so. `PAST_FROM` / `START_MONTH` are the two floors.
- `turnover_month_people.approx` arrived after the tables shipped (v4.230.1,
  swept in by another session's auto-commit), so `startup.add_turnover_month_people_approx`
  adds it — any further column on these tables needs the same.
- **Measured on the 1 Oct dump** (September, 11 Sep /cells): 1,584 working and
  95 left in registered cells, plant rate 72.0%; 41 leaders scored 1, 61 scored
  5 — the score is near binary because 116 of 136 leader cells have < 15 people
  (one leaver > 85%). Most «not on /cells» units of that copy were created by the
  4 Oct cell sync; the dispatch zones and freezers were not.

## «Yot jismlar» — the leaders' foreign-objects KPI (`/foreign-objects` — MERGED into `/leaders-kpi`, 2026-10-19)

From **2026-10-16** (the operator: «build the foreign objects KPI from the
Quality register» — the 3rd of 5) HR's «Инородные предметы» is computed month
by month from the Quality register. Page key `foreign-objects`, **admin-only
until the operator opens it**; the refresh is admin-only in the endpoint.
`services/foreign_objects.py` is THE rule, `foreign_objects_export.py` the
workbook, `routers/foreign_objects.py` the door; `pages/ForeignObjects.jsx` (+
`pages/foreignObjectsText.js`, four languages) and `components/foreign/`.

- **The rule is HR's July file** (decoded 2026-10-16: its SUMIFS was broken
  and every count was typed by hand; all 44 matched a manual count of the
  complaints sheet, which is a copy of the Quality register's «инородный
  предмет» rows): per cell, the month's complaints of `ctype == "foreign"`
  with the cell AT FAULT (`fault` True), the «Номер виновного цеха» resolved
  to a /cells cell (`cell_lookup`'s zero-padding rule) → 0 → 5, 1 → 4, 2–3 → 3,
  4–5 → 2, 6+ → 1, KPI points = score × 0.25. A complaint with the flag «no»
  or blank is LISTED and never counted; a code on no cell counts toward nobody
  and is named (`unregistered`).
- **The KPI is the CELL's, credited to its OWNER («Egasi») on the month's
  last day, one ranking row per OWNED cell** — `turnover.cell_map` +
  `turnover.owned`, the very reading /turnover and /worker-concerns list by,
  so for one month the three KPI pages name the same owners and cells. An
  owned cell with no complaint scores 5; a cell with no owner is a notice.
- **Nothing is frozen.** A month is re-read from the register as it stands
  (the sync time is printed; from 2026-11-11 the page's «Qayta hisoblash»
  pulls the register — before, the admin's «Reyestrni yangilash» was the Quality
  page's own refresh). Before `LINKS_FROM` (2026-10-12, the dated cell links)
  owners have no history, so an older month says it is credited by the
  earliest owners known (`approx_owners`). The rule is admin-editable
  (`foreign_rule` in app_settings, the shape of `turnover_rule`).
- **Scope** is the turnover page's: plant → shift → brigadir; a complaint on
  no cell belongs to no plant and shows only unscoped. Three tabs over one
  payload: «Reyting» (owned cells, worst first), «Yacheykalar» (every standing
  cell, with its «Boshqaruvchi»), «Shikoyatlar» (every foreign-object complaint
  of the month with its `counted` reason); a cell row opens the working
  (count → band → score → KPI → the complaints behind it). Excel: four tabs,
  the page's own words. Logged as `sync.foreign_refresh` / `export.foreign_objects`.
- The two KPIs that had no source when this shipped are live since: category
  compliance (2026-10-19) and the technologists' audit (2026-11-06).

## «Toifaga muvofiqlik» — the leaders' category-compliance KPI (2026-10-19)

From **2026-10-19** (the operator: «build this 4th category … for now, only
backend») HR's «Соответствие категории» (the 4th of 5, weight 0.2) is computed
month by month from Verifix's HR journals and HR's grade ladder. **No page of
its own**: it is the «Muvofiqlik» tab of «Liderlar KPI» (`/leaders-kpi`, the
same evening — see that section). The month's figures ride that page's one
request (`services/leaders_kpi.board` folds `month_payload` in as the
`compliance` half and the board's fourth column, `_slim_cc_rule` the rule
the rules dialog prints), and `routers/category_compliance.py`
(`/api/category-compliance`, gated on the page key `leaders-kpi`) serves what
stays here: the explain dialog's people list, the read states, the Verifix
read and the rule. The `category-compliance` page key it shipped with is
folded into `leaders-kpi` at boot (`startup.merge_leader_kpi_pages`, the
retired pages' own fold). `services/category_compliance.py`
is THE rule, `services/category_sync.py` the Verifix read, the tables
`category_events` + `category_reads` (created by `create_all`, nothing to
migrate).

- **The rule** (HR's ladder, the PDF of 2026-10-18, categories and MONTHS
  only — its pay columns were never read in and must never be): tenure =
  whole months from the hire month to the report month; expected = the
  ladder's highest step whose start month ≤ tenure (the lowest step from
  month 0); a worker complies when the category in force on the month's last
  day is that step or a HIGHER one of the ladder (`mode: at_least`; `exact`
  is the other mode); no category or an old «S…» grade = not compliant
  (`no_category: fail`; `skip` leaves them out); a job the ladder does not
  name (office / HR titles, «Практикант») is OUT of the count and listed.
  rate = compliant ÷ counted per cell, one decimal, judged as printed:
  100 % → 5 · > 70 % → 3 · > 65 % → 2 · else 1 (HR's IFS names no band for
  0 %, so it takes the worst); points = score × 0.2. `pct0` beside it is the
  half-up whole percent (`whole_pct`).
- **Credited to the cell's OWNER («Egasi») on the month's last day**,
  `turnover.cell_map` + `turnover.owned` — one ranking row per owned cell,
  the reading /turnover, /worker-concerns and /foreign-objects list by. A cell
  with no owner is a notice; one with nobody counted has no rate and no
  score. Scope plant → shift → brigadir, the KPI pages' own.
- **Who works where**: the turnover KPI's directory (`turnover_people`, the
  23:40 read) — hired by the last day, not dismissed by it. On a day not yet
  passed a person stands where the directory puts them NOW; on a PAST day
  where the last hiring / transfer dated by then put them (the journals are
  Verifix's only placement history; a temporary transfer that ended hands
  back), the directory only where the journals name no placement. The
  category is always the journals' — the directory carries none. Nothing is
  frozen; a month is re-read as the journals stand (`approx_owners` before
  `LINKS_FROM`, `approx_roster` for a past month).
- **The read** (`category_sync`): `pro/rank$list` (the category names),
  `pro/hiring$list` (Pro, with a journal span from 2020; `start/hiring$list`
  where Pro is closed), `pro/transfer$list` (/ `start/`), `pro/rank_change$list`,
  `core/division$list` (each line's org unit → cell code by
  `turnover.unit_code`; a unit that is somebody's DEPARTMENT on the lines is
  not a cell). Unposted journals are left out and counted. Read side by side
  (`verifix_live._side_by_side`), replaced whole in one transaction, kept in
  memory per read (`events_by_person`). Nightly at **23:55** (after the
  directory's 23:40), a boot catch-up ~200 s in when the last complete read
  is older than six hours, the admin's `POST /read` (from 2026-11-11: the
  page's «Qayta hisoblash», on every open and on the button). Logged as
  `sync.category_read`.
- **Endpoints**: `GET` the month payload (`?month=YYYY-MM&factory&shift&managers`
  → `totals`, `ranking`, `cells`, `notices` {no_ladder jobs, ambiguous jobs,
  unregistered codes, no_cell, no_owner_cells}, `rule`, `read` + `directory`
  states, `options`); `GET /people?month&keys=` (every judged person of those
  cells: job, ladder, tenure, expected, actual, since, verdict ok · above ·
  below · no_category · old_grade · no_ladder · no_hire — failures first);
  `GET /read`; `POST /read` (admin); `GET /rule`; `PUT /rule` (admin:
  `{rule: {…any subset…}}` validated WHOLE — a bad part refuses the save with
  its reason — or `{reset: true}`; logged as `config.category_rule_saved`).
  The rule is `category_rule` in app_settings: weight, mode, no_category,
  full / bands / worst, `levels` (the step order across the names one ladder
  uses), `ladders` (job → [[category, month]…]), `jobs` (Verifix title →
  ladder; a title that IS a ladder name needs no entry), `ambiguous`.
- **HR's July figures are NOT reproduced** — by this rule or any reading of
  the journals tried (26 of 87 comparable cells at best; three cells of the
  file contradict the record outright): the file's percentages were typed by
  hand. The ladder is the one definition written down, so the platform
  computes THAT and says so. Open with HR, each a line of the rule and never
  of the code: at-least or exact; how tenure is counted; «Приемщик-отправитель»
  and «Оператор», which the sheet lists under a production AND a logistics
  ladder with different months (read against production, the people named
  under `notices.ambiguous`); what July counted.
- Not built: a frozen month, an admin editor for the rule (`PUT /rule` is the
  door). The page and the workbook's «Muvofiqlik» sheet landed with the merged
  page the same day. Verified on synthetic data in the cloud stack (a transfer-and-back
  read on a past month, the exact / skip modes, the bands' edges, a bad
  override falling back whole); the first real read lands with the deploy's
  boot catch-up.

## Plan fulfilment is not a leaders' KPI (removed 2026-11-06)

«Liderlar KPI» carried a sixth KPI, «Plan bajarish» (a «Plan» tab, a board
column, a radar spoke, the cell dialog, the rules and a workbook sheet, weight
0), from **v4.322.0, 23 Oct 2026** (session `session_01WpqNpekBFxJJYP75Cih22v`,
which 27 minutes later also put plan fulfilment on «Brigadirlar reytingi»,
v4.323.0). The operator, 2026-11-06: «It was never one of their KPI» — removed
whole: `plan_rule` / `plan_score` / `_plan_by_cell` and the kept plan half in
`services/leaders_kpi.py`, the row's `plan`, `totals.by_kpi.plan` and the
payload's `plan` half, the workbook's «Plan bajarish» sheet, `PlanTab.jsx` /
`PlanExplain.jsx`, `kpiUtil.planScoreOf` and every `pl*` / `*Plan*` string.
A saved `?tab=plan` falls back to the board. An app setting `plan_rule`, if
one was ever saved, is now read by nothing. **Plan fulfilment is the
BRIGADIRS' figure** — «Brigadirlar reytingi» and «Plan Bajarish» (/plan) keep
it; never add it back to the leaders' board without the operator asking.

## «Texnologlar auditi» — the technologists' audit KPI (`/leaders-kpi` → «Audit», 2026-11-06)

The fifth of HR's five (weight 0.1, scored 0–3), with no source until the
operator found `public.audit`: a table this codebase neither creates nor
writes (owner `safia_prod_rw`, appended by something outside — 16,719 rows
18.04.2024 → 04.11.2026 on the first read). Columns: `date`, `type_name`,
`factory_id` (THEIR workshop id, not our plant), `division_name` («7213
Медовые коржи»), `division_group_name`, `foreman`, `avg_rating` (0–100).
`services/tech_audit.py` is THE rule; the «Audit jadvali» screen (`/audit`)
shows the raw table.

- **Only `type_name` «Технический аудит»** (`AUDIT_TYPE`, ~5,700 rows). The
  other type, «КРУ Производство» (~11,000), is the KRU audit the brigadirs'
  KPI waits for — not read here.
- **A cell's month is the AVERAGE of that month's audits** (the operator's
  ruling): every audit row of the cell dated in the month, each counted once,
  mean of `avg_rating`, ONE decimal half up, judged as printed by HR's bands —
  above 90 % → 3, above 80 % → 2, above 70 % → 1, else 0 (`audit_rule` in
  app_settings overrides weight, bands and worst; a malformed one never blanks
  a score). **A 0.00 rating is a real 0** (432 of them on the first read).
  **No audit in the month → no figure** («—», 0 in the total).
- **Which cell**: the code `division_name` starts with (`turnover.unit_code`,
  3–5 digits), else the four digits it ends with, else the whole name —
  through `turnover.code_key` against the month's cell map. On the first read
  112 of 132 divisions named a cell of ours; a division that names none counts
  toward nobody and is NAMED in the notes (`unregistered`, unscoped views only).
- **Credited like every leaders' KPI**: one row per cell with an owner on the
  month's last day (`turnover.cell_map` + `owned`).
- **Live only while the table can be read.** `read_month` runs in a savepoint
  and asks the catalog first: a missing table (`missing`), a revoked GRANT
  (`no_read`) or a failed read (`error`) leaves `source.ok` False — the board
  then marks the KPI not `live` (its meta line names the shortfall again) and
  the tab says which of the three it is, never «0».
- **The board** (`leaders_kpi.board`): the half is `data.audit` (source,
  totals, the month's audits, unregistered divisions, rule) and each row's
  `audit` {audits, pct, min, max, score, points}; its points join the total.
- **The tab** (`components/kpi/AuditTab.jsx`): one summary (the month's mean
  over the ranking's cells · audits · cells; the source's newest audit), the
  ranking (cell · owner · brigadir · audits · average · lowest · score ·
  points, lowest average first) or every audit of the month behind the card's
  view switch («Reyting» / «Auditlar»), notes folded under the ranking. A row
  opens `AuditExplain.jsx`: the average, its audits listed and tinted, the band
  framed, score × weight. `ScoreChip` takes `max` (a 3 of 3 is green, not
  amber); `kpiUtil.auditScoreOf` is the client twin of `tech_audit.score_of`.
- **The workbook**: a «Texnologlar auditi» sheet (the ranking, then every audit
  of the month), the audit column on the board sheet, its rule on the summary.
- Nothing is stored; a month is re-read as the table stands (the board's 60 s
  keep applies). Not built: the KRU half for «Brigadirlar KPI».

## Who answers for a Quality record (`quality_attribution`, 2026-11-02)

The operator: «each row has the cell code, that cell code has its owner on our
IMS — assign the leader and brigadirs for these rows with the cell code»;
every point asked, a read-only impact report DMed and read first. Until then a
record of the Quality register counted for the unit its «Отв. бригадир»
spelling matched (`name_map.supervisor_match`) and its leader was the cell's
CURRENT «Boshqaruvchi». `services/quality_attribution.py` is THE rule
(`Resolver`, `unit_rows`, `owner_names`) — never re-spell it at a call site.

- **BRIGADIR** = the unit the «Номер виновного цеха» cell stood in ON THE
  RECORD'S DATE (`cell_links.value_on` — exact from 12 Oct 2026, the cell's
  first known value before it). A unit ARCHIVED since hands its records to the
  unit the cell stands in today (the operator's call: unit «Turdimurodov
  Nodirjon», merged into Aripova Manzura's on 2 Nov — 0811's 49 earlier
  records are hers). When the code names no cell on /cells, the code is blank,
  or the cell had no brigadir that day, the record falls back to the unit «Отв.
  бригадир» names (`register_brigadir`'s per-site blanking, `supervisor_match`
  over every live unit) — and to nobody when that names none (technologists,
  IT, АРС, Келес…).
- **LEADER** = the cell's «Egasi» (`cells.owner_id`) on the record's date — not
  the «Boshqaruvchi». A cell nobody owned that day, or a record with no cell,
  has no leader. The «Есть ли вина цеха» flag is NOT consulted.
- **Four readers, one rule**: the Quality page (`routers/quality.py` — `sup` /
  `sh` / `fi` per row, `ld` its Egasi of the day, `hw` "c" | "n" for how the
  brigadir was found; the `cells` registry's `leader` is the CURRENT Egasi, for
  the leader roster and picker), «Smena kunligi» «Sifat nazorati %»
  (`shift_report.fold_quality` over `unit_rows`), «Brigadirlar reytingi» +
  «Hisobotlar» (`brigadir_board.quality(rows, unit_ids, pers)` over
  `unit_rows`) and «Brigadirlar KPI»'s OKK (the Verifix brigadirs tied to no
  unit stay name candidates — `extra=`). `foreign_objects` was already
  cell-based and keeps its own rule (owner on the month's last day, fault only).
- **Nothing is stored**: a cell moved, a unit renamed, an owner changed re-reads
  every record. **Consequence to know** (the 2 Nov report): of 7,670 records
  3,109 name a cell; 347 moved to another unit — chiefly unit HISTORY: a
  renamed unit's records stay with the unit (Raximova Kamola → Niyozov
  Izzatilla 131 on 9411–9414, Suvonov Elshod → Erkanboyev 48, the Abdullayev ↔
  Kulmurodov swap) — 280 gained a unit their name never matched, and ~27% of
  cell records have no Egasi that day. Of the 4,561 records with no usable
  code only 174 name an IMS brigadir — the codes /cells lacks (Salimov 1711 /
  1811, 6832, 1410, 0613, Suvonov's «B2B» Келес); registering those cells
  would move them onto the cell rule.

## «Brigadirlar KPI» — HR's monthly brigadir KPI (`/brigadirs-kpi`, 2026-11-02)

The operator, on HR's July 2026 workbook: «Build for first 2 KPI categories
and leave space for the remaining 3. For the brigadirs which are not on our
IMS, check our resources Verifix and sheets for their data to load.» HR's rule:
four pass / fail criteria at 25% each, result = passed ÷ 4, payout = passed ×
(daily rate × 26 + allowance) × 20% ÷ 4. Page key **`brigadirs-kpi`**,
«Liderlar» nav group after «Liderlar KPI», **admin-only until the operator
opens it on the Access tab** (in `SCOPED_PAGES`: a supervisor reads their own
unit, a shift-manager shift ∩ plant, a leader nothing — `routers/brigadirs_kpi
._lock`). `services/brigadirs_kpi.py` is THE rule, `routers/brigadirs_kpi.py`
the door (`GET /api/brigadirs-kpi?month&factory&shift&managers`, one request
for every tab, kept 60 s like /api/leaders-kpi; `POST …/export.xlsx` →
`services/brigadirs_kpi_export.py`, logged `export.brigadirs_kpi`),
`pages/BrigadirsKpi.jsx` + `components/brigadirkpi/` + `pages/brigadirsKpiText.js`.

- **Two criteria are computed, never re-measured.** «Qo'nimsizlik»
  (Текучесть): per cell leavers ÷ working on the month's last day × 12, read
  off `turnover.month_payload` (the leaders' turnover month — its read, its
  frozen months, its ×12); a brigadir's figure is the MEAN of their cells'
  rates (HR's AVERAGEIFS; `method: "pooled"` in the rule is the alternative)
  over cells with somebody working — HR's IFERROR → 0 for an empty cell was
  NOT carried over, its leavers are named. Passes BELOW 60 (strict, judged as
  printed to one decimal). «OKK tuzatuvchi choralar»: the month's quality
  register attributed by the Quality page's rule (`quality_attribution` — the
  record's cell on its date, else «Отв. бригадир» matched against the units and
  the untied Verifix brigadirs), statuses `shift_report.ACTIONABLE`, resolved ÷ all,
  hair excluded by default; passes ABOVE 90 (strict). No record → «—», not
  passed (HR's #DIV/0! → blank).
- **Three are places**: «Murabbiylik» (no attestation result anywhere),
  «KRU» (the KRU department's audit score — on the platform since 2026-11-06
  as `public.audit`'s «КРУ Производство» rows, not wired yet: HR's pass mark
  and whom it is credited to are still to be ruled), «To'lov»
  (rates and allowances — Verifix payroll lists closed since 2026-10-03). Each
  is null on every row, a «—» column on the board and a tab with the reason.
- **Brigadirs not on the platform come from Verifix.** Rows = every
  non-archived unit with a cell or a quality record, PLUS every working
  Verifix brigadir (`verifix_org.brigadirs_over`) tied to no unit and spelled
  like none — key `v:<Verifix id>`, Verifix's name through `profile_name`,
  marked «Verifix». A cell is credited by the cells register on the month's
  last day (`turnover.cell_map`); a cell with no brigadir there, or a Verifix
  subdivision /cells lacks, by the Verifix brigadir standing over it (HR's own
  «Руководитель» reading; one person over two units, or two brigadirs, is
  named, not guessed). Quality spellings are matched against the units AND
  those Verifix brigadirs together. A Verifix brigadir's plant is the first
  division above them whose name names a plant, else the first plant (where
  `migrate_factories` attaches unassigned units), so the plant tab the page
  opens on shows them; a shift or brigadir pick leaves them out.
- The rule is app setting `brigadir_kpi_rule` (written through
  `PUT /admin/settings`), laid over HR's field by field
  (`turnover.max`/`method`, `okk.min`/`skip_hair`/`no_records`, the two
  places' thresholds); a malformed value is ignored.
- Open with HR (from the July file, not decided here): the 60% vs 70%
  threshold, mean vs pooled, crediting by Verifix supervisor vs the cells
  register, «no records = fail», hair in OKK.
- **The «Umumiy» tab is a board like «Liderlar KPI»'s, spoken in GATES**
  (2026-11-03, the operator: «redesign brigadir's KPI like Leader's KPI. Be
  creative») — `components/brigadirkpi/BkpiBoard.jsx` + `BkpiHero.jsx` +
  `BkpiPanel.jsx` + `GateRing.jsx`, the vocabulary in `bkpiUtil.js`. Top to
  bottom: one muted meta line + «Qanday hisoblanadi?»; an HONOUR WALL in
  place of a podium (two counted pass / fail gates make most brigadirs tie,
  so «the best three» would be arbitrary): every brigadir through every
  counted gate, faces in gold rings, shown only above three rows; a result
  tile — how many passed all, the four groups (all · some · none · no
  figure, `groupOf`) as one bar and as toggles that narrow the ranking; one
  tile per counted gate — how many passed, and every brigadir a dot on a
  FIXED scale beside the line (`domainOf`: from the rule, never the month's
  values; dots binned on a grid anchored at the threshold, a verdict always
  on its own side; a dot opens its row). The ranking: avatar · shift · a
  gate cell per counted gate (verdict icon + figure) · the result ring
  (four quarters clockwise from 12 in HR's order — green passed, red failed,
  grey no figure, DASHED not counted yet, so «not measured» never reads as
  «failed») + «n / 4»; the mentoring / KRU / payout columns are gone (the
  ring and the tabs say it). A row opens in place onto `BkpiPanel`: each
  gate as a gauge on its strip's scale with how far inside or outside the
  line («12.4 punkt zaxira»), last month beside it, the way to the cells /
  records dialog; the big ring, the share HR pays on, the payout note.
  Faces: unit profile photos (`supervisor:<id>`, the /leaders read); a
  Verifix-only brigadir keeps initials. A name on the wall is never cut: a
  word of eight letters or more may break at a soft hyphen (`wallName`), two
  lines at most, four tiles to a phone row. The month before is read on the
  board only from `START_MONTH`, and compared only when it counted the same
  gates the same way (`comparableMonths`); a brigadir missing from it reads
  «yangi». The board says passed / failed in words of its own (`gPass` /
  `gFail` — the tabs' «Да / Нет» chips read wrong as a verdict). Checked on
  2026-11-03 against sample months through a local proxy (desktop 1280 /
  1440, tablet 800, phone 384; uz · ru; dark · light; empty, three rows,
  nobody through). Nothing computes a score.

## «Brigadirlar reytingi» on real data (`/leaderboard`, 2026-10-23)

The Laboratory's brigadir board was a deterministic mock until 2026-10-23
(the operator: «make it real now … put Efficiency percentage instead of
Zagruzka percentage»; then, asked: Kaizen hidden, concerns = closed share of
the period's, and «pick year, month, or certain week, not certain
date-to-date»). Page key `leaderboard`, still admin-only by default.
`services/brigadir_board.py` is THE rule, `routers/leaderboard.py` the door
(`GET /api/leaderboard?grain&anchor&factory&shift`, `POST
/api/leaderboard/export.xlsx`), `pages/Leaderboard.jsx` the page.

- **The period is a WEEK (Mon–Sun), a MONTH or a YEAR** — `SegmentedToggle`
  + `DayStepper week | month | year` (the templates gained `month` / `year`
  for it). The history is the 8 weeks / 8 months / 4 years of the same grain
  ending with the picked one (`HISTORY`), never before the first closed day
  (`data_floor`, min `day_approvals.date`; nothing closed ever → the picked
  period alone). The period still running ends at today and says so. Places,
  the trend sparkline, the rank chart and every «vs» are period against the
  period before.
- **Nothing is measured here; every figure is another page's own:**
  - **Samaradorlik** (replaced Zagruzka) = /zagruzka's «Samaradorlik»
    heatmap: `eff_util`, the Python twin of `effUtil` (utils/formulas.js —
    keep them in step), over `build_metrics_list`'s closed unit-days; the
    period figure is that heatmap's AVG (each day rounded first, then the
    mean). It can pass 100%; it enters the score capped at 100.
  - **Plan bajarish** (added the same day — the operator: «why no plan
    fulfillment as I said») = /zagruzka's «Reja bajarilishi» heatmap:
    `fulfil_util`, the Python twin of `fulfilUtil` (prod_actual ÷ prod_plan),
    over the same closed unit-days, blank without a ФАКТ, a plan or a typed
    headcount (that heatmap's 👥 day); the period figure is its AVG, the same
    `_heatmap_avg` as Samaradorlik (days rounded half UP, `Math.round`'s rule).
    It can pass 100%; it enters the score capped at 100. It is a column, a
    sort segment, a radar spoke, a podium figure and an Excel column.
  - **Lider nazorati** (what the operator asked after on 2026-10-23 and what
    «Control» on the board already IS — the supervisor Rating % of the
    Leaders Monitoring standings; its Consistency is deliberately NOT a
    second column here) = the /leaders brigadir ranking's «Reyting», scored in
    the BROWSER from the standing pool (`routers/leaderboard.checklist_pool`:
    windowed, cut to the board's units, every leader an opaque code, a unit
    its manager id) through `utils/leaderBoard.js` — the /leaders scoring
    functions, moved out of Leaders.jsx so the Monitoring tab, «Mening
    o'rnim» and this board compose ONE rule. Each window is cut at
    `lastFinishedDay`, as /leaders cuts its own.
  - **Xavotirlar yopilishi** = of the /concerns register's concerns filed with
    the unit in the period (`entry_date`, never a worker's), the share done;
    one sitting with a shift- or top-manager now is out of the count. Read as
    the register stands, so a recent period reads lower than an old one.
  - **Sifat nazorati** (added 2026-10-23, the operator: «add also Quality
    Complaints Resolved percentage (without hair)») = the shift dashboard's
    «Sifat nazorati %», i.e. the Quality page's own closure rate, per period:
    of the period's complaints whose status describes WORK
    (`shift_report.ACTIONABLE`, imported — never re-spelled — so «не требуется
    мера» stays out of both halves), the share resolved, with the HAIR
    category left out (`shift_report.SKIP_CATEGORY`, the 2026-09-18 ruling;
    a row with NO category is KEPT, since «uncategorised» is not «hair»).
    Attributed as that page attributes it (`quality_attribution`, from
    2026-11-02: the record's cell on its date, else «Отв. бригадир» over EVERY
    live unit), so a record neither names — technologists, IT, the stores —
    is nobody's row here either. Bucketed by
    the complaint's own date, and NOT gated on the day close, as the concerns
    beside it are not: a complaint is filed against a date, not against a
    shift somebody closed. A period with no actionable record reads «—», never
    0% — «nothing filed» is not «nothing resolved» — and the cell's hover
    carries `done / actionable`, because «0% of one» and «0% of forty» are
    different facts and the row stays one line high.
  - **Davomat** = /workers' `att_rate` ((came + on leave) ÷ list, summed per
    period), its own `get_headcount` called; the live «so far» day is left out.
  - **Kaizen** is not measured (Notion names Notion people, not profiles): the
    column and the radar spoke say «hali hisoblanmaydi» (the podium leaves it
    off), and its weight is set aside until it is measured.
- **The weights** (`CATS` in Leaderboard.jsx, the live ones adding up to 1):
  Samaradorlik 24 · Plan bajarish 19 · Lider nazorati 12 · Xavotirlar 12 ·
  Sifat nazorati 14 · Davomat 19. Each joiner took a share and the ones before
  it kept their proportions: Plan 22% on 2026-10-23 (they were 35 · 18 · 18 ·
  29), then Sifat 14% the same day — the weight the other closure rate beside
  it carries — the five before it scaling by 0.86. **Not the operator's
  ruling** — a starting point, one line each to change; asked about the
  weight, they expressed no preference. Consequence to know: every brigadir's
  Overall score and place moved on the day Sifat joined.
- **The score**: Σ min(figure, 100) × weight over the figures the period HAS,
  ÷ their weights — a figure with no data drops out (the page's stated rule).
  Ranked: non-archived units with `zagruzka_on`, in the viewer's scope (plant
  lock, `useFactorySection`, shift), that have any figure in the period;
  places are dense 1..n per period among units with a score then.
- The attendance figure is `workers.headcount(…, daily_only=True)` (2026-11-12,
  /reports too): the /workers page's own rows and cells, minus the three
  scans and the official-HC read behind fields neither reader uses — a cold
  build is ~10 s of загрузка + attendance + checklist pool, with no single
  hot spot, so the lever on a slow-server report is fewer builds, not this.
- One answer per (grain, period, scope) is kept 10 minutes (120 s until
  2026-11-12 — the operator's call on that day's slow-server report), shared by viewers
  asking together (`SharedBuild`). The Excel is the board as drawn (the
  browser sends its rows; `build_workbook` lays them out, the page's 80 / 65
  bands as cell tints), logged as `export.leaderboard`.
- The podium shows the brigadir's profile photo as a medallion sized off the
  card's measured width, below the rank column (the mock's cut-out renders
  are gone).
- **The rank chart is a bump chart with the brigadirs' photos (2026-11-12,
  v4.476.0** — the operator sent two reference charts and «put the circular
  images of people»). `BumpChart` in Leaderboard.jsx: a line holds its place
  across a period and S-curves to the next, thick and neutral, cased in the
  card's surface so a crossing reads over / under; the selected brigadir is
  gold, the one under the pointer dark, and both print their PLACE as a number
  at every period. A line starts and ends at the brigadir's photo
  (`ProfileAvatar`, initials without one): where it enters the board on the
  left (mid-chart for one who joined later or came back after a period with no
  score) and at the picked period on the right, beside the place (a medal chip
  for 1–3) and the name. The right column is the legend and each row of it is
  a button, so a brigadir can be selected from the keyboard. The tip names the
  period under the pointer with that period's place and score, and goes away
  on scroll. The lines are SVG, the photos and names HTML laid over it at the
  same pixels, so the SVG is never scaled. Below 520px every period stays and
  the furniture goes: no start photos, no place beside the name, a thinner
  line, the period axis thinned to what fits (counted back from the picked
  period). No figure or rule changed — places and scores are the board's own.
- **Month and year never loaded on the first build (v4.318.0 → 4.320.8)**: the
  Davomat half calls `get_headcount` over the whole history, and /workers
  filtered its rows by the confirmed (brigadir, day) pairs as a literal
  `tuple_(…).in_(list(pairs))` — planned as one OR per pair and tested on
  every row. 8 weeks ≈ 1,200 pairs answered in seconds; 8 months ≈ 4,500
  pairs ran ~50 minutes on production (the builds the 23 Oct stall queued
  behind). The gate is `day_state.pairs_in` now (two arrays, unnested — one
  hash semi-join) and the exchanged-name cut `day_state.names_not_in`:
  benchmarked 2,263 pairs 102 s → 0.11 s, two years / 13,766 pairs 0.6 s,
  /workers' headcount and trend answer byte for byte as before. **Never
  filter by a big pair or name list with a literal `IN` again** — use those
  two.
