# Checklist tasks the platform answers

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## Tasks the PLATFORM answers (`leader_auto`, from 20 Sep 2026)

Three of the thirteen checklist tasks ask about something this platform already
holds, and until **20 September 2026** a leader proved each of them by
screenshotting one of our own pages and sending it to Telegram, where Gemini
read a date off the image to confirm a row sitting in our own database. The
proof was a photograph of the truth. From that day they are decided by
`services/leader_auto.py` instead: at a fixed hour it reads the data, writes
the leader's `LeaderTaskEntry` itself and closes the task.

- **`proof_kind` gains a third value, `"auto"`, and it is not a kind of proof.**
  There is no photo, no upload, no camera and no Gemini call. It is spelled as a
  proof kind because every surface that asks «how is this task answered» already
  branches on that one field; a fourth question would have to be added to each
  of them and would be forgotten at one. **`leader_auto.is_auto` is THE test and
  it asks BOTH halves** — switched to "auto" AND naming a check that exists.
  A task that says "auto" and names nothing would be unanswerable: no leader may
  file it and no sweep would close it, so its day would hang open forever, which
  every read surface reads as «this leader filed nothing».
- **WHICH check is global; WHEN it is asked is per unit.** `LeaderTaskDef.auto_check`
  (`plan_staffing` · `concerns` · `plan_pct:30`) is deliberately NOT on the
  global → supervisor → leader chain: what «Kunlik plan» MEANS is the same
  question about the same dashboard for every unit, and a per-unit answer would
  be a per-unit definition of a word. The HOUR is the chain `deadline`, read
  through `leader_close.due_at`, so it is an ordinary admin field on «Chek-list
  sozlamalari» and a night shift is asked at 23:00 what a day shift is asked at
  10:00. This module chooses no clock of its own and must not start — two
  anchors for one hour is how a task closes before it opens (2026-08-26).
  **A per-LEADER `deadline` on an auto task is not honoured** (`_unit_due` reads
  the unit level only): a check is a statement about a shift, and two leaders of
  one brigade asked at two hours could not be compared. `leader_auto_rollout.leader_overrides_left`
  names any that exist rather than letting them sit unread.
- **Nothing is re-measured.** The plan and the percentage come from
  `routers/production._build_dashboard` — the function `GET /api/production/dashboard`
  itself calls — narrowed by the leader's own `sap_codes_for_leader` /
  `sap_groups_for_leader`; the typed people come through `zagruzka_source.typed_pins`,
  the one door for that question. It imports a ROUTER from a service, lazily and
  on purpose (`leader_tasks` already reaches for `routers.leaders.WINDOW` the
  same way): re-deriving the plan here would give the check and the page two
  answers about one shift, and the check is the one nobody can argue with.
- **The three rules, all the operator's** (agreed 14—18 Sep; **ONE CELL IS
  ENOUGH** from 2026-09-22, below): `plan_staffing`
  (#1, 10:00 / 23:00) — a plan above 0 on ONE cell's own positions AND that same
  cell's people TYPED, **asked through
  `zagruzka_source.cell_pins`, the platform's one pin split**, and never by
  testing whether the exact `(code, letter)` pair carries a pin: the two pin
  kinds are mutually exclusive by design, so that spelling fails a LETTERED cell
  whose brigadir typed one whole-centre number — the state CLAUDE.md records the
  fleet as being in («A grouped work centre whose brigadir keeps typing one
  whole-centre number still splits it evenly», ten such work centres) — and would
  have deducted ten points a day from leaders whose /production page plainly
  shows the number filled in. `cell_pins` is handed EVERY cell of the unit, never
  the leader's alone, or a short list reads every other group's people as
  unclaimed. **A typed 0 passes**, because `people_overridden` and never the
  value is what tells typed from absent;
  `plan_pct:30` (#9, 14:00 / 03:00) — the «Bajarish %» of ANY ONE of the
  leader's work centres, as /production states it for a leader of that cell, at
  or above the target **carried in the setting**, so
  the threshold moves without a deploy; `concerns` (#8, 17:00 / 06:00) — one
  `leader_concerns` row created between 00:00 of the checklist day and the check,
  written BY the leader or filed by a worker against any one of their cells, tested on
  `created_at` and never `level_since`, so passing an older concern up does not count.
- **ONE CELL IS ENOUGH** (the operator's ruling, 2026-09-22). A leader who owns
  several cells passes a task when any one cell meets it. Until then #1 demanded
  EVERY cell, so one cell the leader could never type (no SAP code, a work centre
  missing from the unit's catalog, or one with no plan that day and so not on
  the «Odamlar soni» tab at all) cost the point every day. Plan and people must
  sit on the SAME cell (`leader_auto.cell_planned` — the cell's group lines plus
  its work centre's ungrouped ones, `wc_group.in_scope`). #9 reads each work
  centre's own tile (`_Ctx.code_totals`, uncut by group exactly as the page's
  totals are, so two lettered cells of one work centre read one figure). A
  leader with one cell reads byte for byte what they read before. The facts
  keep `untyped` and the leader's COMBINED % — the warning card shows them as
  the JOB (every cell, 50%), and the pass mark is still never printed as the
  instruction. **A per-cell unit judges the LEADER once**: the verdict is taken
  over all their cells (`cell=None`) and written onto every cell checklist,
  one verdict DM per task (`_already_told`); a cell checklist opened after the
  hour is handed the verdict taken AT the hour (see «The page is read AT THE
  HOUR» below).
- **The points the old reading cost were listed once and given back on one
  tap** — `services/auto_check_restore.py`, the boot one-shot
  `startup.report_auto_check_restore` (flag
  `auto_check_restore_list_2026_09_22_v1`) and the `acr:` callback in
  `telegram_bot.py`. The operator's rulings: multi-cell cases ONLY, PROVEN ON
  TIME only (the check's own record at the hour, concern `created_at`, the
  action register's saves replayed to the hour, rows untouched since — never a
  number typed after), and a LIST FIRST: the operator's chat gets a summary, an
  Excel («Restore» + «Not restored» with the reason) and ONE button, which
  writes a `LeaderTaskOverride` (done, reversible) for exactly the stored list
  (`AppSetting` `auto_check_restore_list_2026_09_22`) and re-sends each changed
  day's corrected report. Temporary: delete the module, the startup pair, the
  call in BOTH entrypoints and the callback once the button is used.
- **Shift 2's hours are those same points of a NIGHT** — three, seven and ten
  hours after a 20:00 start — because a night asked at 10:00 would be asked five
  hours after its checklist has already closed. They are settings, not constants.
- **`AUTO_FROM = "2026-09-20"` is a FLOOR with no override**, and it is
  load-bearing rather than tidy. Units carry OPEN checklist days from earlier
  dates, and every one of those has an auto task whose hour went by long ago:
  without the floor the first pass settles all of them at once. Measured on the
  11 Sep production copy, one pass at 09:00 on the 20th wrote **103 verdicts, 96
  of them failures**, into days going back weeks. It must never be moved EARLIER.
- **The ledger is `leader_auto_checks`**, one row per (leader, date, cell, task)
  under the same `COALESCE(cell_id, 0)` expression index `uq_ltask_day` needs and
  for the same reason. It makes the pass idempotent and, more importantly,
  ANSWERABLE — a score moved by a machine has to be explainable months later, and
  the entry carries only a verdict; `facts` holds the numbers it was taken on.
  It also carries a fact nothing else can: a row with code `no_day` says «at the
  check there was no checklist» — and a bot checklist exists only from the
  FIRST task a leader answers (`_lt_save_entry`, or a camera shot), never from
  opening `/tasks`. That is why no `created_at` was added to `LeaderTaskDay`.
  **`no_day` is a CODE and «skipped» is the OUTCOME** — testing the outcome
  against it is never true (found by running it, 2026-09-20).
- **The page is read AT THE HOUR for every leader who owes the task, checklist
  or not** (the operator's ruling, 2026-09-23 — «check whether the leader
  filled it before the deadline, then give or deduct points»). With no
  checklist yet the verdict is kept on the `no_day` row as `facts.at_hour`
  (`_measure_without_day`, measured ONCE, a data failure retried as for any
  checklist) and written onto the checklist when it appears: PASSED if the job
  was done at the hour, FAILED with the real reason (`no_plan`, `no_staffing`,
  `under_target`, `no_concern`) if not; `facts.checklist_seen` says when. Only
  then is the leader told — never at the hour, because «✅ bajarildi» sent to
  a leader who has not opened the bot reads as «nothing left to do» while the
  day still scores nothing without a checklist — and the task's bot screen shows
  the stored verdict meanwhile (`leader_auto.measured`). Before the ruling a
  checklist that appeared after the hour was `started_late` and scored 0
  WITHOUT the page being read — a leader who filled everything at 09:00 and
  answered their first bot task at 11:00 lost task #1's points (a leader's
  complaint, 23 Sep). The ruling's own premise is what keeps it honest: nothing
  typed after the hour can pass, which is all the old rule ever protected.
  **`started_late` survives only for a `no_day` row written BEFORE the
  measurement existed** (no `at_hour`, no `measure_error`), and only after two
  fallbacks fail — a sibling cell's verdict at the hour, then `_from_record`,
  which reads the hour off the Jurnal (concerns: exact, its window already ends
  at the hour; #1: the 22 Sep restore replay, `auto_check_restore._Unit` +
  `_plan_at_hour`, imported LAZILY so deleting that module cannot break a boot).
  Such a row can only meet a checklist on its own day, so that path went quiet
  after 23 Sep 2026 — delete `_from_record` together with `auto_check_restore`.
  **Verdicts already written as `started_late` (20—23 Sep) were NOT re-judged**:
  a past score moves only through the admin override or a list the operator
  approves, the 22 Sep precedent.
- **TERMINAL means the task is CLOSED, never merely that an entry exists.**
  `entry_id is not None` was the first spelling and it stranded whole days:
  nothing else writes `closed_at` for an auto task (`autoclose_due` skips them,
  every bot button is refused, `close_expired_days` drops a day holding a
  reopened task), so an entry left unlocked had no writer left at all. Three
  ways to reach it — the process dying between the commit and `close_task`, a
  pre-existing DRAFT recorded `already_filed`, and an admin reopening the task.
  The first two HEAL, because `_settle` re-reads whether the entry is closed;
  the third is refused outright in `leader_close.reopen_task` AND in
  `routers/leader_tasks.reopen_submitted_task`, since that endpoint is reachable
  without the UI. A stranded day is invisible on every read surface here, which
  is the same thing as «this leader filed nothing».
- **`already_filed` still CLOSES the task.** A leader mid-checklist holds a
  DRAFT — answered, not submitted — and that is exactly what the mid-shift
  exception below produces. Their answer stands; their task is closed for them,
  or the day hangs open behind one task nobody on earth can submit.
- **A check that cannot read its data is retried, but not forever.** It is
  `skipped` / `no_data` with `entry_id` NULL until `GIVE_UP` (6 h) past its hour,
  and is then written as `not_checked` so the task closes and the day can end: a
  day held open by a platform fault costs the leader every other task on it.
  Shift 1 has no day-level sweep at all, so nothing else would have ended it.
- **`autoclose_due` skips an auto task only from `AUTO_FROM` on.** The config
  chain is not versioned, so an open day from before the floor still resolves
  `proof_kind="auto"` while the evaluator refuses to look at it — skipping it
  there too would leave that task with no closer and hold its checklist open
  for good.
- **The reason sentinel is `__auto__|HH:MM|code`** (`leader_tasks.auto_reason` /
  `read_auto_reason`), the twin of `__missed__|HH:MM` and for the same reason:
  `reason` is free text a leader typed in their own language, so it cannot also
  carry one fixed sentence for four viewers. `utils/leaderReason.js#showReason`
  is the client twin and must expand it, or it prints the sentinel at an
  operator verbatim — exactly what `__missed__` did on 2026-08-27.
- **An objection to a failed #9 or #8 says WHEN the leader acted**
  (2026-10-02, the operator — «I entered it on time» had become the commonest
  objection). `services/auto_check_timing.py` → `GET
  /api/leaders/disputes/{id}/auto-timing`, asked once by the appeal page (never
  inside the 30-second thread poll) and drawn by `components/leaders/AutoTiming.jsx`
  under the verdict: ONE sentence (on time · late by N min · never), for #9 one
  line «at the hour X% · now Y%», and the saves behind a collapsed list. #9 is
  REBUILT from the action register's timestamped ФАКТ saves and SAP uploads —
  a FLOOR (only proven saves count), so «on time» is evidence; #8 reads each
  concern's `created_at` under the check's own filter, exact. A save by someone
  other than the leader names them, so a brigadir's next-morning figure is never
  read as the leader's.
- **A LEADER never reads a check's pass mark** (the operator, 2026-10-02 — the
  standing «a minimum printed becomes the target» rule, now reaching results
  too). `leader_auto.hides_target(payload)` + `hide_targets(obj)` strip
  `target` from every `facts` / `auto_facts` / `autoFacts` a leader is served —
  `/api/leaders`, the day report, the objection list and thread, every
  checklist view (`leader_checklist._view`) and the auto-timing answer, which
  also drops the % after each save. `result_lines(show_target=False)` on the
  leader's bot screen and `_facts_line` (the verdict DM) print the figure alone,
  and `utils/autoResult.js` prints «Bajarilishi: X%» with no «(kerak …)» when
  `target` is absent. Brigadirs and admins keep it.
- **Wherever an auto task's reason is printed, its RESULT is printed under it**
  (2026-09-30, the operator's directive) — what the check READ at its hour,
  off the ledger row and never re-measured: positions with a plan, the cells
  whose people were (not) typed, each cell's «Bajarish %» against the target,
  the concerns found in the window, and a check that ran late.
  `leader_auto.results_for` (entry id → facts, by `ix_ltask_auto_entry`) is THE
  door; payloads carry it as `auto_facts` (register rows), `autoFacts` (day
  report, admin day detail) and `auto.facts` (appeal items, checklist).
  `utils/autoResult.js` is the one client formatter and
  `leader_auto.result_lines` its bot twin (the task screen and both objection
  cards) — keep them saying the same.
- **`task_state` gains `autopass` and `autofail`**, and `autofail` is in
  `FAILED_STATES`. A failed auto check is neither «I decided not to» (notdone)
  nor «I ran out of time» (expired): nobody answered it and nobody could have.
  It still scores 0 and the leader still has to see that it did.
- **The sweep runs FIRST in `leader_close._sweep`** — the existing FIVE-minute
  job, not a job of its own, so the ordering below is a fact about one pass
  rather than a race between two. **Consequence to know: a check fires within
  five minutes of its hour**, so a leader who types the plan at 10:03 can pass
  a 10:00 check; `LATE_GRACE` is the same five minutes, so an ordinary lag is
  not marked late and a real outage is. It runs ahead of `autoclose_due`
  and `sweep_expired_days`. Both of those write an entry for any enabled task
  that has none, so a pass running after them would find the platform had
  already recorded its own checks as the leader's failure. **`telegram_bot._lt_cmd`
  is the OTHER door into those two closes and carries the same order**, or a
  `/tasks` typed after a check hour but before the next tick would do exactly
  that, permanently — a closed day can no longer be settled. `autoclose_due` skips
  auto tasks outright; `close_expired_days` writes `__auto__|HH:MM|not_checked`
  rather than the missed-deadline sentinel.
- **Every door back is closed, deliberately and in one place each.**
  `leader_late_proof.eligible` refuses an auto task — without it every one of
  them matches the whole of that predicate (enabled, untouched, past its hour,
  not done) and the leader is funnelled into «Kechikkan isbot» for a task they
  were never allowed to file, putting a brigadir and an admin in front of a
  two-stage ruling about a check no human made. `leader_close.reset_task`
  refuses one too, at the shared core rather than at the two doors that call it:
  the next sweep would rewrite the verdict from the same data, so «Tozalash»
  would look like it worked and change nothing. **The route back is the admin
  override** (`LeaderTaskOverride`), which `_apply_overlays` already scores.
- **The bot refuses it once, not eight times.** `_LT_TASK_ACTIONS` in
  `telegram_bot.py` is the set of `lt:` actions carrying a task id — **the
  ADMIN's `aop`/`awp`/`aopok`/`awpok` included**, because a Telegram callback
  button never expires and one minted before the switch is still live in
  somebody's chat — and one guard
  in the dispatcher sends every one of them to `_lt_auto_view` — a read-only
  screen naming the rule, the hour and the verdict, with no camera, no upload, no
  «Qayta topshirish», no close button and no `LeaderTaskCapture` row (a stale one
  would swallow the next photo sent to the chat). A refusal written into each
  branch is a refusal forgotten in the ninth.
- **The rollout is a TEMPORARY one-shot**: `services/leader_auto_rollout.py`,
  two flags (`leader_auto_2026_09_20_shift1_v1` / `…_shift2_v1`), armed by
  `startup.register_leader_auto_sep20` in both entrypoints. It writes the hour
  and the instruction FIRST and the switch LAST — written the other way round a
  unit would carry an auto task with no hour of its own for the seconds in
  between. Delete it and its scheduling helpers once both flags are set;
  `startup.add_leader_auto_checks` and `services/leader_auto.py` STAY, because
  they are the feature and not the rollout. Changing what either pass writes
  needs a NEW flag key.
- **ONE deliberate exception to the never-mid-shift rule**, in `_auto_run_at`:
  the switch may land inside a running shift up to that shift's FIRST warning
  instant, and is deferred to the next day's instant after it. The rule exists
  because a criteria edit RE-JUDGES a checklist being filled; this pass judges
  nothing — a task the leader has already answered keeps its entry untouched
  (`already_filed`), so nobody can lose a point they had earned — while
  deferring costs the whole day, since the three checks are at fixed hours.
- **The three instructions lost their «for now, also send a screenshot»
  paragraph** (`leader_auto_rollout.DESCRIPTIONS`). That paragraph told leaders
  to do something the bot now refuses. The THRESHOLD stays out of them: task 9
  goes on saying 50% while its check passes at 30%, which is the operator's
  standing rule — a minimum exists so nobody fails on a technicality, and
  printed as the instruction it becomes the target.
- **The warning DM tells the leader what to do, not just that a check is
  coming** (2026-09-21, the operator's directive, approved off a test copy).
  `services/leader_auto_rich.py` is the card: the hour and minutes left, the
  task, WHERE on the platform, the leader's LIVE figures (what the check would
  read now — `leader_auto`'s own `_Ctx` + runner, never a second measurement),
  numbered steps, the rule (no photo; late = not done, −N points) and a web_app
  button onto the page. Rich first; a client that refuses rich gets the SAME
  card as HTML through `notify_profile(html_fn=…)`, which exists for exactly
  this. **The BELL row is a different, shorter text** — the per-check template
  `leader_auto_soon_<check>` in `routers/staff.py`: what to do, where, by when,
  and NO figures, because a bell row renders at view time and a completion
  printed an hour ago is no longer true. The old `leader_auto_soon` key stays
  for rows written before the split and for a check the card does not know.
  Page and control names are copied from the UI per language (`nav.*`,
  `production.*`, `concerns.*` in translations.js — «Pozitsiyalar», «REJA»,
  «Fakt», «Bajarish %», «Odamlar soni» → «Bugungi fakt», «Xavotir qo'shish»);
  **rename one there and rename it in both places here**, or a step names a
  control the reader cannot find. Task 9 is told 50% (`TARGET_PCT`) and the
  30% pass mark is never printed — the standing rule. A card that cannot be
  built costs the card, never the warning: the bell template goes out alone.
- **Boot says out loud what is wrong**: `leader_auto_rollout.self_check` rides
  `startup.report_leader_deadline_rules` and names an auto task on a unit that
  closes whole DAYS (nothing would close it) or one with no readable check hour.
  This repo has no test suite and a push to main is a deploy.
- **A leader whose cells carry no SAP code** fails #1 and #9 with code
  `no_sap_code` and the admins are DMed: it is a REGISTER error somebody has to
  fix, so it is named rather than absorbed as the leader's failure. One leader of
  Aripova Manzura's unit was in that state on the 11 Sep copy.
