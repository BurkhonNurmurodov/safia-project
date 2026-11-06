# Checklist days and leaders that do not count

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## An UNFINISHED bot day is visible («Tozalash» → «Yakunlanmagan»)

Every read surface on the platform serves a CLOSED bot day — the `/leaders`
register (`leader_bot.closed_days`), the score, the day report, the AI queue,
and the admin «Tozalash» tab itself until **2026-08-21**. So a checklist a
leader filled but never submitted was visible **nowhere**, and read exactly like
a leader who filed nothing at all.

That state is reachable without anybody doing anything wrong. `lt:cconf` refuses
to close a day while one enabled task has no answer, and a **camera** task
writes its answer only when the roll reaches `min_media` — so a leader one shot
short of a three-photo task is holding a day that nothing will accept and
nothing will show.

**For shift 2 that wait is over (2026-08-22, user).** The day-level auto-close
used to have ONE door — `_lt_autoclose`, which runs only when *that leader*
next opens `/tasks` — so a leader who never came back left the day open
forever. `leader_close.close_expired_days` is now THE definition of that close
and both doors call it: the bot's, and a scheduled sweep
(`sweep_expired_days`). Two spellings would mean a leader's score depended on
which door reached the day first.

- **The sweep rides the existing 5-minute job** (`leader_close._sweep`, beside
  the per-task `autoclose_due`) rather than a cron pinned to the hour. It asks
  "what is past its deadline", so it lands within minutes of shift 2's 09:00
  (`expired_through`), heals a day an outage skipped, and needs no timezone of
  its own. It kicks the drain on a close, so the verified score lands at ~09:05
  rather than on the next 20-minute tick.
- **`AUTOCLOSE_SHIFTS = (2,)` is the bound** — one tuple, widened deliberately.
  Shift 2 is where it bites: its window shuts at 09:00, hours after the crew
  has gone home, and it files ONLY in the bot, so an unclosed night is simply
  lost. Shift 1 goes on closing when its leader next opens `/tasks`, unchanged
  — and for shift 1 `expired_through` is yesterday, so nothing can auto-close
  today's day at all.
- **The deadline itself did NOT move** (the user's call): shift 2 still files
  until 09:00 (`deadline_hhmm`), and the sweep fires at that same hour rather
  than cutting an hour off what leaders are told they have.
- **A leader's shift comes from their OWN unit**, exactly as `_lt_shift` reads
  it, never from the unit stamped on the day — the two doors must not disagree
  about which hour a checklist dies at.
- A day with nothing filed still closes at 0 and queues NOTHING (no
  done-with-media entry exists), so it sends no report DM: there is no verdict
  to report.

- `GET /admin/leader-tasks/submissions` now returns open days too, each flagged
  `open` and carrying what it is WAITING for: `enabled` / `answered`,
  `missing` (the unanswered enabled task ids), `tasks_closed`, `per_task`,
  `expired` (the same `date <= expired_through(shift)` predicate `_lt_autoclose`
  uses) and — the one that matters — **`pending_media`**, the shots already on
  the server for a task with no answer. Non-zero there is the difference
  between "they never filed" and "they filed and the platform is sitting on it".
- **Deletion stays closed-only and does not depend on what the list shows.**
  `delete_submissions` re-filters `closed_at IS NOT NULL` itself, so an open day
  can never be selected, armed or dropped — pulling the table out from under a
  running `/tasks` flow would strand the leader in it.
- **It is no longer a tab on `/leaders`** (removed 2026-09-02, the operator's
  call): the admin «Liderlar kunlik vazifalari» destination
  (`/panel/ltdaily`) reads both filing layers whole and carries the
  same whole-day, closed-only delete. `BotDataClear.jsx` is left in the tree,
  rendered by nothing — what follows describes it as it stands.
- The tab is TWO views behind a `SegmentedToggle` (`components/leaders/BotDataClear.jsx`):
  «Yuborilgan» is the delete tool, unchanged; «Yakunlanmagan» deletes nothing and
  carries no delete controls at all — a greyed-out «O'chirish» reads as "not
  yet", not as "never". The two registers are split BEFORE the page scope is
  applied, so the `ScopeNotice` count describes the view being read.
- **In per-task («1×1») mode the decisive column is «Yuborilgan»**, not
  «Javob». `maybe_close_day` waits on `entry.closed_at`, not on the entry
  existing, so a leader can ANSWER all thirteen tasks, photograph every proof
  and still hold a day nothing will show — the gap between the two counts is
  the drafts. It renders «—» outside per-task mode, where one button submits
  the whole day and a per-task count would name a step that unit does not have.
- Reading it: `pending_media > 0` ⇒ the leader shot proofs and the roll is short
  of `min_media`; `answered < enabled` with no pending photos ⇒ tasks genuinely
  unanswered; `answered == enabled` but `tasks_closed < enabled` ⇒ per-task
  drafts, waiting on `autoclose_due` at the task deadline; `answered == enabled`
  on a day-close unit ⇒ they simply never pressed «KUNNI YOPISH». `expired` ⇒ it
  will close (and go to the AI) the moment that leader reopens the bot.

## What the leaders FILED (`/panel/ltdaily`)

From **2026-08-26** «Liderlar kunlik vazifalari» is the admin's read of both
collection layers WHOLE — `pages/admin/LeaderDailyTasks.jsx`, two sub-tabs over
`GET /admin/leader-tasks/fillout` (the Google-Form rows) and `GET
/admin/leader-tasks/submissions` (the bot days, the existing «Tozalash» feed).
Every read surface on the platform serves the MERGED answer — `/api/leaders`
drops a sheet row the moment a bot day replaces it — so a leader who filed
through both doors left one submission an admin could open and one they could
see **nowhere**. This is the surface where both exist.

- **Admin-only and NOT grantable.** No `capKey` on the `ADMIN_NAV` entry, so
  `capTabs.includes(capKey ?? id)` can never admit a grantee — the `permissions`
  / `logs` model. It can delete a scored day and move a leader's score.
- **The fill-out layer is READ-ONLY, and the tab says why.** `leader_checklists`
  is wiped and reloaded by `sheets_sync.sync_leaders_sheet` on every Refresh, so
  a delete here would reappear on the next sync — a button that lies about what
  it did. A row is removed in the Google sheet itself. (The user's ruling: a
  suppression list that survives re-sync was offered and declined.)
- **The detail modal** (`components/leaders/DaySubmissionModal.jsx`) reads a
  SHEET row through `/api/leaders/report/{uid}` and a BOT day through `GET
  /admin/leader-tasks/day/{id}`. The second **delegates to
  `leader_reports.day_report` verbatim once the day is closed** and only adds
  per-task `state` / `locked` / `closedAt` / `roll` on top — so a score, a
  verdict or a photo shown to the admin is still the one the leader and the
  brigadir were shown. Never add a second admin-only projection of a CLOSED day.
  Both submissions stay readable whichever one counts — `build_report_row` finds
  a sheet row by `submission_id` and a bot day by `closed_at`, neither gated on
  the merge. A bot day's report handle is `leader_bot.day_uid()`, the ONE
  spelling both registers write (the admin one forgot it once, and every row on
  the tab opened onto «could not load the detail»).
- **An UNFINISHED day has a detail too, and this is the only place it exists.**
  `build_report_row` serves closed days only — an open day is a leader
  mid-checklist, not a submission — so proofs already uploaded to an unsubmitted
  day were visible to nobody. The open branch of `admin_day_detail` projects the
  in-progress day into the SAME keys, built from the CONFIG rather than from the
  entries so a task nobody has reached is listed as unanswered instead of being
  absent. Three facts only it can show: a task not started, a task answered but
  not SUBMITTED (a `draft` — what holds a 1×1 day open), and the **camera roll**
  of a task short of `min_media`, which writes no entry and which the register's
  media proxy therefore cannot reach. It prints **no score** — `completion` is
  written when the day closes, and a running total shown as «Natija» is a number
  the leader can still move — showing `progress` instead.
- **`leader_close.task_state` is THE state vocabulary** (open · draft · pending ·
  passed · notdone · expired · rejected) and the modal renders that, never a
  second set of words: the bot menu, the register and this tab must agree about
  which state a task is in. The three bad endings are all RED here — they all
  score 0, and colour is the status — with the ICON saying which one it was,
  the same split the Jurnal tab makes between outcome and category.
- **A not-done `reason` is the leader's own free text, except when nobody typed
  it**: a task the deadline caught carries the sentinel `__missed__|HH:MM`,
  because one fixed sentence cannot read correctly for four viewers.
  `utils/leaderReason.js#showReason` is THE expansion and both readers call it —
  it lived only inside `Leaders.jsx` until this modal grew the same column and
  printed «__missed__|09:00» at an operator verbatim (2026-08-27).
- Roll shots stream from `GET /admin/leader-tasks/roll-photo/{id}` (admin-only).
  Deliberately NOT a widening of `/api/leader-proof/photo/{id}`, which answers
  only for a photo belonging to a leader profile the CALLER holds and says so in
  its own contract. `_stream_tg_file` is the one streamer behind both that door
  and the register's media proxy.
- **Reopen is PER TASK** (the user's ruling), `POST
  /admin/leader-tasks/task/reopen` → `leader_close.reopen_task` (+ `reset_task`
  when `wipe`), the same cores the bot's own locked-task screen runs, so a task
  taken back from the panel and one taken back in Telegram end in one state.
  `leader_close.reset_task` is now THE reset core — `telegram_bot._lt_reset_task`
  is a thin call into it. Offered only where a task is actually LOCKED
  (`locked_tasks` on the row); delete stays whole-day and closed-only.

### Which submission COUNTS (`leader_day_sources`)

`leader_bot.merges()` decides between the two layers by RULE, and that rule is
right in general and cannot be right in every case: a leader who answered twice
leaves two honest submissions and only a person can say which is the record.

- **`LeaderDaySource` is that person's answer** — `(leader_profile_id, date)` →
  `"bot" | "sheet"`, `POST /admin/leader-tasks/day-source`. Clearing DELETES the
  row, so "no opinion" is the absence of a record rather than a third value
  every reader has to spell out.
- **It is checked FIRST inside `merges()` and `training()`**, which is what makes
  it reach every surface at once — the register, the photo proxy, the score, the
  day report, the AI queue (`discover` / `undiscovered` / `queue_report` /
  `queue_task`) and `leader_reports`' park. Both now take `leader_id=` +
  `overrides=`; a caller that omits them behaves exactly as before.
- **Bounded on write to pairs that hold BOTH.** Shift 2 files only in the bot, so
  forcing one of its days to «sheet» with no sheet row would delete the day from
  every surface at once without deleting anything. Refused in the endpoint, not
  guarded in the UI — the endpoint is reachable without it.
- **`_pair_state()` in `routers/leader_tasks.py` is the ONE computation** behind
  both registers and the writer, so the two tabs and the endpoint that changes
  the answer can never disagree about a day — including about whether there are
  two submissions to choose between. Pairs are joined by the resolved leader
  PROFILE (`supervisor_match` → `leader_match`), the register's own dedupe key;
  a looser matcher here would act on pairs `/api/leaders` never joins.
- A bot day that resolves to «sheet» with **no** sheet row counts NOWHERE (a
  rehearsal day, an unmerged shift-1 day). The cell says «Hisobga olinmaydi»
  rather than naming a Form row that does not exist.

## Days that count NEITHER way (`/panel/ltexclude`)

From **2026-08-27** a leader-day can be taken OUT of the results entirely —
`LeaderDayExclusion`, the «Hisobdan chiqarilgan kunlar» admin destination
(`pages/admin/LeaderDayExclusions.jsx`). Not green, not red: the day leaves the
numerator AND the denominator, for the leader and for their brigadir at once.

Every other "does not count" on this platform is one of two other things, and
neither can express this. The filing-window void scores the day **0** and leaves
it occupying its slot — arithmetically identical to holding it against the
leader. `LeaderDaySource` and `bot_from` switch which LAYER supplies the number.
So when the platform itself was at fault — the shift-2 per-task auto-close that
closed and AI-failed whole checklists before their windows opened — an operator
had no way to make the night cost nobody anything.

- **`services/leader_exclusions.py` is THE definition** — `key`, `load`,
  `profile_days`, `excluded`, `row_for`, `wire`, `exclude`, `lift`,
  `drop_pending_reviews`. Nothing is written onto a score, so lifting an
  exclusion restores the day everywhere at once with no migration and no
  re-sync, exactly as a window edit re-derives its verdicts for free.
- **The key is the leader-DAY**, keyed as `LeaderLateRequest` is (`p<id>` when
  the sheet name resolved to a profile, else `n<folded name>`) — a deliberate
  twin of `routers.leaders._late_key`. `leader_checklists` is wiped and reloaded
  on every Refresh so a row-id key would not survive the next sync, and ~18% of
  sheet names never resolve to a profile so a profile-only key could never reach
  an unlinked leader's day.
- **The denominator is what makes it real, and it is PER PERSON.** `slotsBy` in
  `Leaders.jsx` returns `{days, off}` and `scoreSlots` scores over
  `winDays - off.size`. All five readings move together — standings, the
  headline average, Barqarorlik, the trend line (a per-DAY roster) and the
  rolling sparkline (`x` slides with the window) — plus `taskStats`, whose
  `owed` loses the excluded pairs through its own suffix array. The file's
  invariant is that one rule scores the whole page; a second denominator here is
  how the trend dips on a day the ranking says cost nobody anything.
- **A unit-day survives on the leaders who filed it.** `off` is computed as
  "this key had an excluded row on that date and NO surviving slot", never as
  "the row said excluded" — one leader of a unit excluded leaves the unit's day
  standing on its other leaders, and only a unit-day excluded in full leaves the
  unit's window.
- **A person whose whole window is excluded leaves the ranking**, rather than
  ranking 0% — 0 is the one answer that is certainly wrong, since it is exactly
  the "counts against them" the exclusion removes. Same state as somebody with
  no rows in the period.
- **It outranks the filing-window void** wherever both land on one day (an
  exclusion is a person's answer about that exact day, the void is a rule about
  all of them — `LeaderDaySource`'s precedence). The day then shows ONE chip,
  its own: no verify chip, no late flag, grey score badge, blank heatmap cell.
- **Visible, never hidden.** A day silently removed cannot be told from one that
  was never collected, so the row stays in the register with «Hisobga
  olinmaydi» + the reason, and the day report carries a banner. The `reason` is
  mandatory to exclude and travels with the flag everywhere it is shown.
- **Nothing is deleted.** Photos, entries, verdicts, the day report and both
  collection layers are untouched; only whether the number enters an average
  changes. Lifting puts the day back at the score it always had.
- **The AI stops looking and no score DM goes out.** All four queue doors
  (`discover`, `undiscovered`, `queue_report`, `queue_task`) refuse an excluded
  day — with `force=True`, the admin's own «check now», as the one carve-out,
  the same shape the shift pause and the rehearsal window keep — and
  `drop_pending_reviews` takes back what was queued before the decision
  (never-judged rows only: `reviewed_at IS NULL AND resolution IS NULL`).
  `leader_reports` PARKS the report so the key leaves the sweep's candidate set;
  lifting the exclusion lifts the park and the report goes out as a FIRST one.
- **The people already told a score are told it stopped counting** —
  `leader_reports.notify_excluded`, leader + brigadir, once, at the decision.
  Only where a DM actually went out (`LeaderDayReport.sends > 0`, a PARKED row
  is not a send): a day nobody was messaged about needs no correction. A DM
  failure never rolls back the decision — re-pressing would find the day already
  excluded and tell nobody at all.
- **Admin-only and NOT grantable.** No `capKey` on the `ADMIN_NAV` entry, so
  `capTabs.includes(capKey ?? id)` can never admit a grantee — the
  `permissions` / `logs` / `ltdaily` model. `POST /api/leaders/exclusions`
  checks `role == "admin"` itself, because the endpoint is reachable without the
  UI. Batches cap at 400.
- **The tab has THREE views, and only the third has a source of its own.**
  «Hisobga olinadi» and «Hisobdan chiqarilgan» come from `/api/leaders`, the
  same feed the dashboard scores, so they can never offer a day the register
  does not have. **«Topshirilmagan» is the day nobody filed** (from
  2026-08-27), and it needs a second source because the register has no trace
  of such a day at all — while the score is Σ of filed-day means ÷ the CALENDAR
  days of the period, so an unfiled day already costs its leader a full slot of
  the denominator. It was the one day an operator could not forgive, and it is
  the commonest one they need to. The SELECTION is the scope (the `Factories` /
  `ShiftTimes` model): filters narrow to the night, then the operator ticks the
  rows — an incident hits a whole unit, but the two leaders who filed properly
  are what an operator needs to be able to leave alone.
- **The second source is `roster` on `/api/leaders`** — every non-archived
  leader profile with its unit, its supervisor in the SHEET's spelling
  (`sup_display`, so a day named here lands in the same unit bucket that
  leader's filed days land in) and its shift. **Admins only**: it is the roster
  of every leader on the platform, the tab is admin-only, and the endpoint that
  acts on it refuses anybody else. A leader-day is «missing» when the period
  holds no row for it by profile id **and** none by folded name — ~18% of sheet
  names never resolve to a profile, and a row filed under an unmatched spelling
  must not make its leader look absent. The list is drawn per leader per day,
  so the period is capped at 62 days and the cap is SAID, never silently
  truncated.
- **An excluded day with no submission becomes a register row**
  (`leader_exclusions.orphan_rows`, `missing: true`, `source: "none"`). The
  writer never needed a row — the key is the leader-DAY — but every READER does:
  `slotsBy` drops a day from the denominator only when handed a row carrying
  `excluded`, so the decision moved nothing until the row existed. One row per
  exclusion an admin actually recorded, never a projection of "every day nobody
  filed"; lift it and the row goes with it. Scoped exactly as the filed layers
  are (supervisor → own unit, leader → own profile ids) — it moves the
  denominator, so a viewer not handed it would read a different mean for a
  leader than everyone else reads for that same leader. It prints «—» and not
  «0%», and offers no «Batafsil» button, because there is no report behind it.
  `notify_excluded` says nothing about such a day, by its own rule: nobody was
  ever DMed a score for it.

Related memory: `leader-day-exclusions`.

## A leader with no cell in the загрузка owes nothing (`leader_load`)

From **2026-10-05** (the operator: «no cell on workload and didn't submit
anything in October») a leader is EXEMPT — files no daily checklist and leaves
the Monitoring ranking — when BOTH hold: none of their cells carries
«Zagruzkada hisoblanadi» (`cells.in_load`; a leader with no cell at all
included), and they have filed nothing on or after `leader_load.FROM`
(2026-10-01) — no bot `LeaderTaskDay` of any state, no Google-Form row the
register resolves to them. A leader with one counted cell, or one who filed in
October, files and is ranked as before.

- **`services/leader_load.py` is THE definition** — `FROM`, `exempt_ids`
  (kept 60 s; `forget()` is called by the cell register writers and
  `_set_leader_cells`), `exempt(db, prof, date)` (always False before `FROM`),
  `with_cuts`. Nothing is stored: it is the CURRENT cells register applied from
  `FROM` on, so switching a cell on puts its leader back on the hook — for the
  days since `FROM` too, because `in_load` keeps no history.
- **Owing**: `leader_cells.expected_days` answers `[]`, so the automatic checks
  neither warn nor judge them, the brigadir's digest does not list them as «not
  filed», and the auto-check report skips them.
- **Filing is refused, not just not asked**, because one answer would make them
  «filed in October» again: the bot's `/tasks`, its buttons and the shared
  `leader_checklist.save_answer` / `current_day(create=True)`; the «Chek-list»
  tab (`noLoad` notice, `rights.file` false, writes 409 `no_load`); the camera
  page (`_camera_cfg`, 409 `no_load`).
- **Ranking**: the roster carries `no_load_from` (also in the «Mening o'rnim»
  pool tuple), folded by `buildCutLeaders` like a cutoff, and the server's
  census of cut names / units reads `with_cuts` — so a unit whose every leader
  is exempt leaves the unit ranking from `FROM`. Days filed before `FROM` keep
  counting. The exclusions tab's «Topshirilmagan» skips those days, and the
  cutoffs tab names the rule under the leader (nothing to lift there).
- Not changed: a per-cell unit's leader with at least one counted cell still
  files a checklist for every cell they own, counted or not.

## A LEADER who stops counting (`/panel/ltcutoff`)

From **2026-08-30** a leader can be taken out of the results **from one day on,
open-ended** — `LeaderCutoff`, the «Liderni hisobdan chiqarish» destination
(`pages/admin/LeaderCutoffs.jsx`), sitting directly after the day exclusions
because the two are read together and are constantly mistaken for one another.

The tab next door answers a question about a **named DAY**: the platform got
that night wrong, so nobody is scored on it. This answers a question about a
**PERSON**: from this date they are no longer a leader here — they left, they
moved, their unit was handed over — and every day from that one on is a day they
were never expected to file. Same arithmetic, different subject.

- **It cannot be built out of day exclusions, and that is the whole reason it
  exists.** An exclusion is one row per day and the future has no days in it
  yet, so «from the 21st onwards» written as exclusions means writing rows for
  days that do not exist and then writing more of them every morning forever —
  and the morning the writer stops, the leader silently starts scoring 0 again
  with nothing on screen saying why. One record per decision goes on answering
  after the person who made it has stopped looking.
- **`services/leader_cutoffs.py` is THE definition** — `person_key`, `load`,
  `stopped_from`, `hit`, `active`, `wire`, `set_cutoff`, `lift`,
  `drop_pending_reviews`. Nothing is written onto a score, so lifting restores
  every affected day everywhere at once with no migration and no re-sync.
- **The key is the PERSON**, spelled by `person_key` exactly as
  `leader_exclusions.key()` spells its own half before the date — that function
  now CALLS this one, so a leader who is one person to the day-exclusion tool
  cannot be two people to this one. ~18% of sheet names never resolve to a
  profile, so both spellings are carried and `load()` is deliberately the only
  preload shape: an id-keyed twin drops exactly those leaders, and the census
  (`undiscovered`) would then promise «N tekshirilmagan» rows the queue
  (`discover`) refuses, a counter that never comes down.
- **The date is a FLOOR with no ceiling.** A leader who returns has their cutoff
  LIFTED or moved later; a gap in the middle of a career is a run of day
  exclusions, which is what that tool is for. A second date would give "is this
  day counted" four answers and every reader would have to spell all four.
- **`leader_exclusions.excluded()` is THE door for both**, and folding the
  cutoff in there is what took it to the four AI queue doors and the report
  sender's park without wiring it to each. `wire_for` (per-row) and `wire_in`
  (map-based) are the twin readers, and the **DAY's own exclusion outranks the
  cutoff** in both — it names this exact night, the cutoff is a rule about every
  day after a date — so lifting a cutoff leaves a day exclusion standing.
- **It lands on the SAME `excluded` field the day exclusion uses**, plus
  `cutoff: true` and `from`. The client already knows what an excluded row is —
  it leaves both sides of the average, it shows a grey chip, its calendar cell
  is blank, no verdict prints beside it — and every one of those is right here.
  A second field would mean a second denominator rule on the client, which is
  how two readings of one ranking start disagreeing. Only the TOOLTIP and the
  report banner branch, because only they say anything about tomorrow.
- **Rows are not enough, and this is the load-bearing part.** Stamping
  `excluded` reaches only days a cut leader actually FILED; every day after the
  cutoff that nobody filed leaves no row anywhere, and the client shrinks a
  denominator only when handed a row saying so. So the DECISION travels —
  `cutoffs` (display name → from) and `cutUnits` on `/api/leaders`, one entry
  per person rather than one per day — and `slotsBy(rows, keyFn, cuts, dates)`
  expands it over whichever window each ranking is scored over. **Every call
  site passes its own date list**: the standings, the trend, the previous
  period and the rolling sparkline score four different windows, and one shared
  list would be wrong for three of them. The expansion is in `slotsBy` and NOT
  in `scoreSlots` because two readers never reach `scoreSlots` at all — the
  trend builds `dayOff` off `off`, and the spark tests `off.has(d)` per day.
- **`off.delete` still runs last, and that is what makes the two sources
  agree**: a cut leader who files anyway gets a row the backend already stamped,
  so it never reaches `e.days` and the date stays off, while an unstamped row is
  a day somebody really was measured on and keeps its slot.
- **A UNIT leaves its own denominator only when EVERY leader it has is cut**,
  from the LAST of their floors. Computed on the backend because the client
  cannot: it is handed the cut leaders, never a unit's full roster, so it could
  not tell "all of them" from "the only one I was told about". One leader of
  three leaving takes nothing from the unit — its day still stands on the two
  who file.
- **The maps are SCOPED like the rows** (supervisor → own unit, leader → own
  profile ids): they move the denominator, so a viewer not handed them would
  read a different mean for a leader than everyone else reads for that same
  leader.
- **`auto_discover` was the worst leak and is now closed.** It fires on the
  leaders-sheet **Refresh**, a button an admin presses all day, so a cut
  leader's rows would be re-queued and re-spent on Gemini indefinitely. Every
  other door is a one-shot or fires once per close.
- **Admin-only and NOT grantable.** No `capKey` on the `ADMIN_NAV` entry, so
  `capTabs.includes(capKey ?? id)` can never admit a grantee — the
  `permissions` / `logs` / `ltdaily` / `ltexclude` model. `POST
  /api/leaders/cutoffs` checks `role == "admin"` itself, because the endpoint is
  reachable without the UI. Batches cap at 200 — a cutoff batch is PEOPLE, not
  days. The confirm carries a `challenge` (retype the date), which the
  exclusions tab deliberately does not: that decision names one night and its
  blast radius is on screen, this one silently covers every day that has not
  happened yet.
- **Both people are told, once, at the decision** (`leader_reports.notify_cutoff`
  → `leader_cutoff_set` / `leader_cutoff_lifted` and their `_report_` twins).
  Unconditionally, unlike `notify_excluded`: the news is not "a number you were
  shown has changed" but "from Monday your reports are no longer scored", which
  is news whether or not any particular day was ever reported.
- **Moving a cutoff EARLIER newly covers queued days** — `set_cutoff` returns
  the PREVIOUS floor for exactly that, and `drop_pending_reviews` runs from the
  earlier of the two. Moving it LATER cannot resurrect the verdicts that were
  dropped: those days come back **unverified**, and «Tekshirish» with scope
  «unchecked» is the only route to a verdict for anything outside the rolling
  14-day window.
- **Lifting a long cutoff sends a backlog of FIRST reports** — a parked day is
  `sends = 0`, so the sweep treats it as never reported. Bounded by
  `auto_window_start()`'s rolling 14 days.
- **Deliberately NOT changed: the bot.** `/tasks` opens, tasks close, the day
  closes, and `leader_close.score_line` still prints a running score to a cut
  leader in Telegram. A cutoff is about RESULTS, not access, and a leader in a
  handover week may legitimately still be filing. Same for
  `leader_late_proof.eligible` and `leader_dispute.create`: both are
  arithmetically inert on a cut day (it enters no average either way), and
  closing them is a separate decision.
- **A cutoff-stamped ROW never adds to `off` itself** — only a DAY exclusion
  does. The expansion owns it, and it owns it per key space. Letting the row do
  it meant a cut leader who went on filing (the bot still lets them) FORGAVE
  their whole unit's misses: on any day their row was the unit's only one, the
  unit's day left the unit's denominator though the unit still owed a report
  from its other leaders.
- The day exclusions tab keeps its own subject: a cutoff-derived row is not a
  `LeaderDayExclusion`, so it is kept out of both of that tab's day views (a
  «Qaytarish» there would find nothing to lift) and **counted and named**
  instead; its «Topshirilmagan» list skips days past a leader's cutoff, which
  would otherwise bury the days that matter under hundreds that already cost
  nobody anything.

**A KEY is cut only when every person the register merges into it is cut, and
then from the LAST of their floors** (`name_people` / `unit_filers` in
`routers/leaders.py`). Both halves were bought by getting them wrong first, and
both mistakes had the same shape — a denominator shrinking on the strength of a
decision about somebody else:

- `slotsBy` groups leaders by the NAME printed on the row, and `RoleProfile`
  enforces name uniqueness per UNIT, not per platform. Keying `cutoffs` off the
  cutoff record meant cutting X shrank the row X shares with an uncut namesake
  Y, so Y's missed days left the average. It is now keyed off the census of
  people the register actually groups under that name, all of whom must be cut.
- `cutUnits` read the unit's ROSTER, and ~18% of the register's leader names
  never resolve to a profile at all — a leader who cannot be cut is also a
  leader the roster cannot see. So a unit was declared gone while an unlinked
  leader went on working in it. It now also asks `unit_filers`: everybody whose
  LAST row falls on or after the roster's floor must be cut too, and their
  floors raise the unit's. Only people still filing AT the floor are asked
  about, so somebody who left years ago cannot block a decision about today —
  and the check is self-closing, since every row on or after the final floor
  then belongs to somebody already cut by then.
- The floor is the LAST, never the first: between an earlier and a later floor
  the key still has an active person filing under it.
- **`name_people` must see BOTH collection layers.** It was built from the sheet
  alone while the client groups leaders over the MERGED feed — so it missed
  every leader who files only in the bot, which on **shift 2 is all of them**:
  no `cutoffs` entry was written for them at all, and the load-bearing half
  never travelled. Their filed days were still stamped row by row, so the bug
  read as "the cutoff half works" while every UNFILED day went on counting —
  exactly the thing a cutoff exists to stop. Bot identities are folded in from
  `LeaderTaskDay` (a bot row is labelled `prof.name`, the same key). The unit
  census needs no such fold: a bot day is keyed by leader PROFILE, so everybody
  who can file one is already on that unit's roster.
- `cutUnits` is computed **per unit, then grouped per LABEL**. A sheet row
  carries its own `_relabel(...)` spelling and only a BOT row adopts the
  majority, so a unit the form collected under two names is genuinely two
  standings keys and a cutoff written against `sup_display`'s majority alone
  left the others counting. And because two units can answer to one label (the
  `Manager.name` fallback carries no unique constraint), a label is cut only
  when EVERY unit under it is — the same "everybody merged into this key" rule,
  in the currency units are grouped by.
- A row naming **nobody** is nobody: it is kept out of `unit_filers`, or it
  would make its unit permanently un-cuttable for a reason nothing on screen
  could explain.
- **Both censuses are built over the UNSCOPED rows**, which is why `lead_match`
  is hoisted above the supervisor scoping (`sup_display` already was, for the
  same reason). Whether a key is cut in full is a fact about the key, not about
  who is looking: a leader viewer holds only their own rows, so a census taken
  after the scoping would report their whole unit gone on the strength of the
  one leader in it they can see. `leader_match` resolves each (name, unit) pair
  independently, so widening its input cannot change any single answer.
- The two maps are then **scoped to the keys the viewer's own rows carry**. A
  cutoff only ever applies to a standings key, and the client builds those keys
  from the rows in the payload — so a key the payload lacks can move no number
  and is a name the viewer must not be handed.

**One known limit remains, inherited from how the register groups people:**

- **An unlinked sheet spelling cannot be cut.** The tab writes from the ROSTER,
  so every cutoff an admin can create is profile-keyed. A sheet row whose
  spelling `leader_match` never resolved is already a SEPARATE person to the
  register (it groups under its raw spelling, not under the profile's name), so
  the cutoff correctly does not reach it — but there is no way to cut that
  entity either. It can only ever make the two censuses above REFUSE to cut a
  merged key, never wrongly cut one. The `n<folded name>` key exists and every
  reader tries it, so a writer for it is a UI question, not a model change.
