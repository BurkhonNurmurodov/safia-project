# The live day on /staff

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## A live day's engine (`/api/staff-live`, `live_staff`, `verifix_live`)

What /staff reads a LIVE day through (from `live_day.LIVE_FROM` — see «/staff
reads TODAY live» below). It was built as a LAB page of its own, `/staff-live`
(2026-10-01 a read-only copy, from 2026-10-04 /staff's page over the live
source, «the only difference should be the source»), and that page was
**RETIRED on 2026-10-06** once /staff read its live days through the same
doors (the operator: «is it safe to remove it? If yes, remove it»). Gone with
it: `pages/StaffLive.jsx`, the nav row and its badge, the `staff-live` page key
(a stored matrix entry or a `page.view.staff-live` grant is now inert — nothing
reads it), `LIVE_STAFF_API`, and the look only that page had (the status strip,
the three figures, the freshness line and «Yangilash», a phone list, the
other-brigade hours list, the rules and the admin Diagnostics / raw Verifix
facts behind a row — about 320 `staffLive.*` strings). `/staff-live` redirects
to `/staff`, query string kept, so a Telegram card already sent still lands.
Everything below is the ENGINE, and it is what /staff's live days run on.

- **`routers/staff_live.py` is /api/staff's twin** — the same paths under
  `/api/staff-live`, the same shapes and the same rights per role (supervisor
  own unit, shift-manager shift ∩ plant, admin everything; `_native_can_approve`
  mirrors /staff: exchange → supervisor = the receiving supervisor, → task =
  admin / covering shift-manager, role change = admin / shift-manager; deletions
  need admin / shift-manager / the request grant; an admin's own filing is the
  approval). Its page gate is `require_page("staff")` (strict parity: /staff's
  own `_require_staff` also admits a «daily» grant — a /daily-only viewer is
  refused the live doors, a gap that predates the retirement), and a grant at
  "all" on staff or daily widens it as on /staff. **A top-manager READS the
  whole register** (every unit's documents and deletion requests,
  `_scope_docs` / `_scope_deletions`, 2026-11-04 — the file register always let
  them, by falling through to «everything»; the live one listed three roles and
  gave every other an empty tab) and decides nothing: every write door checks
  rights a top-manager does not hold. Their unit reads (`_visible`) stay closed,
  as on the file days.
- **`services/live_staff.py` is THE day** — the stored read folded into
  /staff's row shape, with every APPROVED document laid over it on every
  request. **Nothing is applied**: /staff writes a file-day document onto
  `attendance` and reverts it on cancel; the live day is re-read every minute,
  so an approve, un-post or delete writes the document and nothing else. Its
  tables — `live_documents`, `live_document_history`, `live_deletions`,
  `live_placements`, `live_day_closes` (`live_staff_events` is retired, kept
  unread) — reach the rest of the platform only through the close's copy
  (`live_projection`). Rows dated before `LIVE_FROM` are the lab page's test
  filings: they move no figure, /staff lists none of them, and only an admin's
  bell queue still offers them (see the bell bullet below).
- **Who may be exchanged or re-titled: a worker who CAME** (has a clock-in),
  still inside or already gone. A role change is for the whole day (/staff).
- **A people-exchange follows the clock** (the operator's own rule): the day
  splits at the move's time; right after a move the NAME stays with the sender
  and the receiver gets nameless additional hours; once the receiver's side is
  bigger, the name moves there and the sender keeps its hours as additional — a
  tie keeps it on the side reached first. Several moves (and a `return_time`) are
  a timeline of stints, the name to the unit with the most hours. Early arrival
  belongs to the first unit (/staff's `part1_eff`). **The day's hours are shared
  in PROPORTION to each stint's clock time** — not /staff's «last stint takes the
  rest»: at check-out «Отработано» (lunch deducted) replaces the clock, and
  letting the last stint absorb that flipped the name back at the moment of the
  check-out. The 2-hour floor (under 2 h on every side counts for nobody) is
  judged only once the worker has LEFT. A move timed in or after the minute the
  worker went out is refused at filing and void in the engine (the retrace
  bullet below).
- **The unit where the worker IS files the next move** (the operator's pick):
  `live_staff.where_at` is THE answer to «where is this worker at T». The
  exchange dialog lists the workers standing in the unit now — named rows and
  carried ones; the server checks the move's own time at filing, again at
  APPROVAL (409 `not_here`: a document approved since moved them), and refuses
  a change that would break an approved move (`broken_moves` before vs after:
  400 at filing / 409 `breaks` at approval; an un-post a later move depends on
  is 409 `depended_on`, and a bulk un-post goes newest approval first). A
  timed move's window runs from the earliest arrival here to the schedule's
  end (a time may be planned ahead of now, 2026-10-09 — below). **The dialog
  opens on a WHOLE-DAY move** (the operator, 2026-10-08,
  from the brigadirs' report that workers they had given away still counted on
  their загрузка): from 2026-10-04 to then a live day opened the time switch
  ON at NOW clamped into the window, i.e. at the CHECK-OUT once the workers had
  gone home, so a brigadir who pressed Save as on a file day filed a move at
  the exit minute — `_check_times` lets it through (17:01 is not after
  17:01:40), `person` splits the day there, the sender keeps the name and all
  but seconds of the hours, and the close copies exactly that into
  `attendance`. The 7 Oct export of Aripova Manzura's unit showed two such rows
  (`moved_out` at 17:01, 8.11 h). The switch now starts OFF on every day; a
  timed move is the switch, and the wheel opens at the earliest arrival. The
  live days from 6 Oct were REPORTED once into a deploy job's log for the
  operator's retrace — `deploy/diag_live_exchange.py` (TEMPORARY, read-only,
  every worker a pseudonym, never a name), a step of
  `.gitea/workflows/deploy.yaml`. Removed with its step on 2026-10-23: the
  retrace was done, and by then it printed ~29 MB per deploy.
  **The retrace (2026-10-08, the operator's «fix them on your own») found 17
  worker-days still counted on the sending brigadir, in two shapes, and fixed
  both.** (1) A move timed in the minute the worker clocked out (№21 and №23
  on 6 Oct, №70 on 7 Oct — a document carries minutes, the exit carries
  seconds, so «17:01» against 17:01:40 was forty seconds on the receiver):
  `person` now voids a move at or after the exit MINUTE once the worker has
  left (a move at the current minute of somebody still inside stands), and
  `_check_times` refuses it at filing (`>=` the exit minute). (2) A move timed
  BEFORE the worker's own clock-in (№31, №32, №46, №80, №75 — 14 worker-moves:
  a batch filed at 08:00 for workers arriving 08:01–08:10): the move's point
  sorted ahead of the clock-in's, its stint was empty and the sender kept the
  whole day; `person` now lands such a move AT the arrival — points are ordered
  by time, then by listing order, and at one instant only the LAST stands — so
  it reads exactly as a whole-day move, while `_check_times` still refuses only
  a time before EVERY picked worker's arrival. An engine change reaches a
  CLOSED copy only through a re-copy, so `services/live_exchange_repair_oct08.py`
  (TEMPORARY, `startup.repair_live_exchanges_oct08`, flag
  `live_exchange_repair_2026_10_08_v1`, inline at boot in both entrypoints)
  rewrote the three exit-minute documents to whole-day moves — each only while
  the stored read still proved every worker's move void — and re-copied every
  closed unit of 6 and 7 Oct through `live_projection.refresh`; its record is
  app setting `live_exchange_repair_2026_10_08`, DMed once to the operator
  (the `_dm` flag; a failed DM is re-sent at the next boot, never re-run).
  The task moves at the exit minute (№19, №35, №55 — «sent home» the minute
  the worker left) were left as filed. Delete the module, the startup
  function and both calls once the flag and its `_dm` flag read «done».
- **A return WITHOUT a transfer time, planned times, workers not yet in
  (2026-10-09, the operator's rulings asked one by one).** With «Ko'chirish
  vaqtini belgilash» OFF a document may still carry a return time: every
  worker in it is at the receiver (or on the task) from their OWN clock-in
  until the return, then back at the sender — the shape for several workers
  who came at different times (the operator's case: four of Raximova
  Kamola's arrivals, one return). Since the 8 Oct fix a transfer time before
  a worker's clock-in lands AT it, so one time at the earliest arrival moves
  everybody from their own arrival too; this shape says the same with no
  time to pick, and is the one the operator asked for. The receiver is then
  the FIRST unit, so the early-arrival minutes are its; the name goes to the
  bigger side as always (`person`: `whole_back` is the return point, added
  only once it has come and only for a worker who came before it;
  `whole_returned` makes the day a timeline — `moved`, the name by hours —
  while before the return the whole-day reading stands, a task pill
  included). A worker who clocked in AT OR AFTER the return is refused BY
  NAME (`_check_times`; file flow `_check_return_from_arrival`). A worker
  THIS unit already moves that day is refused only when the approved move
  overlaps — starts at or before the return, or is a whole-day one
  (`_own_moves`) — and the refusal NAMES it («№80 · 09:03–12:30 → Raximova
  Kamola … o'sha hujjatni tahrirlang»): the way to count such a worker from
  arrival is to un-post that document and edit it, not to file a second. A
  move of theirs after the return stands beside it (until 2026-10-09 any
  earlier move refused the shape with «bugun allaqachon ko'chirilgan —
  ko'chirish vaqtini ko'rsating», which named no document and said «today»
  on a past day). A worker who
  has NOT clocked in may be named in any exchange document (`_movers` no
  longer refuses them, the dialog offers every row standing here,
  `in_at` None on the document row) and counts from whenever they come.
  **One who comes AT OR AFTER the return was never moved by it** — the day
  opens at the sender (`_plan` drops such a whole-day move: C ≥ R, or not in
  while R has passed), and approving the document after they came is refused
  by name too (`_still_here`, 409 `late_arrival`). Until they come,
  `where_at` WALKS the day's documents for them (`_due_at`: the opening unit,
  then every move and return before T, in `person`'s order) and `is_here`
  answers that opening unit, so the receiver may name them next.
  **Transfer and return times may be AHEAD of now on every document** (the
  operator: «every time, transfer included»): a time at or after the `cut`
  stays out of the timeline (the 8 Oct rule already voided a move after the
  exit), so a planned move enters it the minute it comes; `where_at(T)`
  builds the day AS OF a future T, so a planned chain (A→B 14:00, B→C 15:00)
  is checked right; the row says «{t} da → {unit} (reja)» (`planned` on named
  and carried rows, while the worker is inside or out on a break); a worker
  who leaves before the time never moves. A time at or after a LEFT worker's
  exit minute is still refused; after a BREAK exit it is a planned move
  applied once they are back — and `where_at` reads any instant after a
  break's exit as the worker back (`Ctx.hold`), so filings, approvals and the
  un-post guard do not flip with the break. **A return is checked like a
  move**: `broken_moves` also asks where the worker stands at each document's
  return with that return left out (`return_holder`) — anywhere but where the
  document put them breaks it (an onward move past the lender's return is
  refused; the filer's own return is checked at filing and approval,
  `_return_elsewhere`). A planned move or return INTO a unit keeps its day
  open (`unit_day` `due_back`, read by `busy`). The wheel's far end is the schedule's end (or
  the exit), not now; a not-yet-arrived worker's window opens at their
  schedule's start. The card and the Jurnal print «…–12:00» for a return
  from each arrival (`_time_span`). **The Excel-era file flow has the same
  shape** (`staff._compute_split` `from_arrival`: T = the clock-in,
  `early_side` «away», `part2_eff`, the home slice `R–O`; a nameless leftover
  always carries its side's EFFECTIVE hours; `_check_return_from_arrival` at
  both doors, seating the times on a night unit's shift window as the live
  `_at` does (`_night_window`); `exchange_audit` treats such a document as a
  split and rebuilds with the same keys; that flow never
  checked a time against now, so «future» needs nothing there). Existing
  drafts are edited into and out of the shape like any field.
- **Arrivals come cell-less** and are placed on «Yacheykalar» (`LivePlacement`,
  a split with `hc_weight`); **the day close is refused while anybody is
  inside, on a break or still due** (incl. people standing here under another
  unit's name) and while a counted worker has no cell. Cross-shift moves land on
  the receiver's same-date day (/staff's rule, kept).
- **Notifications** (bell + Telegram, `live_*` templates, category approvals /
  day) reach only people who can open /staff — `live_staff.can_open`, which is
  `require_page("staff")` asked of a PROFILE: an admin, the role on the Access
  tab, the page grant, or a capability carrying the page (approving documents or
  requests, editing or deleting attendance, reopening a day), with no personal
  deny.
- **A worker belongs to the brigadir (on /cells) of the cell their Verifix ORG
  UNIT's code names** — never the division (the parity check's finding) — and
  **only cells counted in the загрузка** (`cells.in_load`, from 2026-10-04, the
  operator): `_registry` takes no other cell, so a person in any other cell is on
  no unit's day and a unit with none has no live day.
- **The last read is STORED and a job keeps it fresh** (from 2026-10-04, the
  operator: «save the last download in the database, auto-refresh every
  minute»). `live_verifix_reads`: `dir` (divisions · jobs · working employees,
  re-read every `DIR_TTL` 10 min) and `day:YYYY-MM-DD` — every workload cell's
  people on one shift-day: per employee the trimmed report row and the marks,
  each stamped with the time its read STARTED (`emps[eid].at`), and an older
  read never overwrites a newer one. The job (`run_pass`, `staff-live-read`,
  every minute, both entrypoints, jobs-lock copy only) reads each shift's
  CURRENT shift-day every minute while the shift runs and `HOT_AFTER_MIN` (2 h)
  past its end, every 10 min after that until the next shift-day; the marks are
  read incrementally (`TRACKS_OVERLAP_MIN` back from the last read's end) and
  whole every `TRACKS_FULL_S` (15 min). An empty `employee_ids` filter means
  everyone, so no call is made for nobody. **A request reads the database**
  (/staff polls it every minute — a DB read, not a Verifix one) and Verifix
  itself only on `force` (/staff's «Qayta urinish» on a day that could not be
  read, and the close), for a day nobody stored yet, or when TODAY's read is
  older than the job's own pace for it plus `STALE_S` (3 min) — 4 min while
  the shift runs or ended under `HOT_AFTER_MIN` ago, 13 min after that
  (`verifix_live._hot` is THE pace rule, read by the job and the request
  alike), i.e. only when the job has STOPPED. Measured against 3 min alone, a
  finished shift-day (read every 10 min) went stale between passes and a
  viewer's minute poll waited ~12 s on Verifix (2026-10-07); a failed read keeps the
  stored one with the failure named (`read_error`), and for `ERROR_BACKOFF_S`
  (60 s) after a failed read of a day the requests serve the stored read
  instead of trying Verifix again (a Verifix outage had turned every viewer's
  poll into a Verifix call). `approvals/day` (the badge and day state) reads the
  STORED read only. **Consequence to know:** ~17 Verifix calls a minute (the
  timesheet in pages of 100 + the new marks), all day, whether or not anybody
  has the page open.
- **The clocks are the REPORT's** (2026-10-02, the operator: «/staff is
  correct, fix the live page») — `input_time` / `output_time` of «Отчёт по
  посещениям», which the parity check proved equal to the file's clock-in/out
  for 1,157 of 1,158 people (27.09). The raw marks (`track$list`) are EVERY
  terminal a person passes: on 01.10 the first mark of the day sat 8–20 min
  (up to 2 h) BEFORE the report's check-in for 70 of 71 people and the last
  mark 7–31 min AFTER its check-out for 68 of 71 — the gate before the door,
  the door before the gate. Until 2026-10-02 the page took the earliest and
  the latest mark, so every arrival printed early and every departure late
  (the operator: «wrong times are arriving through the API») while the hours,
  read off the time kinds, were right. A mark decides a clock only where the
  report has not answered yet (`in_src` / `out_src` ≠ "report" on the row).
  **Every mark carries a type** (the 01.10
  dump, 42,963 marks): «I» (door in), «O» (door out) or «C» — a CHECKPOINT,
  the gate, 11,361 of them, which sits 8–20 min before every «I» and 7–31 min
  after every «O» and says only that the person passed it (`CHECKPOINT`).
  Without a report check-in the arrival is the window's first «I» — never a
  C: sixteen people on 01.10 had nothing but gate taps and no report row (the
  file: did not come) and read «inside» / «no check-out» all day. Without a
  report check-out the last DIRECTED mark decides — an «O»/«T» is the
  departure, an «I» means inside UNLESS a gate C follows it (source "gate":
  the door «O» just before that «I» when there is one within 30 min, else the
  gate itself); a C after an «O» is the gate and moves nothing; else, once the
  shift is over, the latest mark of any type ≥ 30 min after the arrival and
  ≤ 12 h after the shift's end ("last_mark"). WHILE THE SHIFT RUNS only the
  DIRECTED marks after the report's check-out move it (the check-out is the
  LAST exit so far; a return shows in the marks first): the last of them an
  «O»/«T» = out again, at that mark; an «I» = back inside, the check-out
  dropped — but only while NO gate C follows that «I». **A gate C after an «I»
  is the way OUT** (on the way in the gate comes BEFORE the door), so that «I»
  was a door on the way home (corridor, locker room), not a return. Until
  2026-10-04 any «I» after the check-out (and before that any mark 30+ min
  after it) read as a return, and the 6712 packers Verifix showed out since
  18:04 / 18:17 read «inside» all evening. `diag.held` names why each «inside»
  row has no check-out (`back` = an entry after the report's · `no_report_out`
  = none in the report yet). ONCE THE SHIFT IS OVER the report's check-out is
  final: sixteen finished days read «no check-out» on 03.10 because the NEXT
  day's «I» (02.10 09:52) was taken as a return. A mark before the report's
  check-in is not this shift's: the previous night's exit was read as today's
  arrival. The report fills check-outs in LATE — last night's shift had none
  by noon on 2026-10-01 and the whole night read «inside · no check-out»
  until the fallbacks existed. Replayed on the 01.10 dump (03.10): 1,493 of
  1,495 file rows agree with the file to the minute; the two left are the API
  being newer than the Excel. `diag.in_sources` / `out_sources` count each
  source. (The payload still carries `diag` and, for admins, each row's `raw`
  facts; nothing on screen prints them since the lab page went.)
- **An exit before the shift's end is a BREAK, not a departure** («Tanaffusda»,
  the exit time printed after the arrival in the clock column, hours counted up
  to it): 12 people read
  «Ketgan» at 09:30 on 02.10 over a breakfast. It becomes «Ketgan», with its
  early-leave minutes, once the shift is over, and holds the day open like
  anybody inside.
- **The raw rows behind 01.10 were DMed once** (`verifix_api_dump_2026_10_01_v1`,
  03.10 09:35): every form the API user may read with every field, the day's
  report and marks for everybody, and a «Solishtirish» sheet putting the file,
  the report, the marks and the live reading side by side. The module and its
  one-shot were deleted once the file landed; the C / final-check-out rules
  above were made on it. Another such dump is a new module under a NEW key.
- Late = more than 5 min after the schedule start, early leave = more than 5
  min before its end — counted on the clocks AS PRINTED, whole minutes
  (Verifix's way: a check-in at 07:50:40 read «07:50 · 9 min early» against
  08:00 until 2026-10-04). Lateness is computed (`late`) and printed nowhere
  (the operator, 2026-10-05: «no one cares about late comers»). **No check-out
  is a status of its own (`no_out`), not «inside»**: still without an exit an
  hour after the shift's end. The arrival is KEPT — it is printed in the clock
  column («HH:MM-») and counts as came (the operator's call, 2026-10-01), although Verifix's own
  day view reads such a day «Не пришла» (it counts only in→out intervals;
  Sabirdjanova N., 30.09: one mark at 15:07). It carries no hours and holds the
  day close until the brigadir answers it (ruling 6, below). Hours = the
  «Отработано» kinds the parity check found (used when it matched ≥ 90% of
  ≥ 50 person-days), else the clock span; someone inside counts so far
  («hozirgacha» on /staff). A split row shares its hours by the clock.
- **A day closes BY HAND only**, in «Tasdiqlash» (the automatic close an hour
  after the last check-out is gone, 2026-10-04). The day's standing is `open`
  (somebody inside or on a break, or still due), `all_left` (somebody came,
  nobody is inside, nobody is due — a missing check-out does not hold it, it is
  named), `waiting` (nobody came) or `closed`; `close.closable` on the payload
  (`not live_staff.busy()`) is whether the close endpoint accepts it, and the
  client never re-derives the rule. On a day nobody has come to, anybody whose
  shift is still running counts as due (`still_due` on the row — a worker reads
  «absent» from the shift's first minute, and check-ins that reach the read late
  must not make a running day closable), so such a day closes only once its
  shift is over. **The brigadir is TOLD**: the first job pass that finds a
  unit's current shift-day `all_left` writes `live_all_left_notices` (unique per
  unit-day, committed before the message) and sends the notice to the unit's
  supervisor profile, with the missing check-outs and pending changes as lines
  of their own. **The NOTICE (not the close, not the bar) waits while anybody
  standing here has an unanswered no check-out** (`live_staff.unanswered_no_out`,
  2026-10-22): «no_out» is read MISSING_AFTER_MIN past the Verifix SCHEDULE's
  end, so overtime or a schedule ending too early read as gone — 15 people
  still at work fired «hammasi ketdi». It goes once they check out or the
  brigadir answers them in the close dialog. Only while the last exit is within `NOTICE_WINDOW_MIN` (3 h), so
  a deploy never tells a finished night; never for a day already closed; once
  per unit-day even if somebody comes back. Only a live day (from `LIVE_FROM`)
  is told, as `live_all_left_staff` — see the next section.
- **Hardening of 2026-10-05** (a fresh-eyes review, every fix approved one by
  one):
  - **A write never reads Verifix in the middle of itself.** `_ctx_for` (an
    approval's «does the move still hold», an un-post's dependants) reads
    `day_read(stored_only=True)`: no Verifix call, no commit, no rollback.
    `_read_day` / `_note_error` own the session's transaction, so a stale read
    there rolled the caller's pending changes back — an admin's own document
    filed during a Verifix outage answered 201 «approved» and did not exist.
  - **The closed-day guard checks the day BUILT** (`rd["day"]`), not the date
    sent: an empty date means today, and `_closed(None)` let it through
    (create, bulk delete, placement). Close / reopen refuse an empty date
    (400), the calendar bounds year and month (422), `approvals/day` with no
    date answers for the shift-day now, and a return time that is not a time,
    or comes without a transfer time, is refused (400) instead of filing a
    one-way move.
  - **A future date is refused** (`error: "future"`, 400 on writes): reading it
    stored an empty day that every unit's calendar then showed «open». The
    calendar counts a day only where the read stamped the unit (`units[m]` —
    its own read, or a job pass that read it; a v1 row's `all_at`, which then
    meant every unit) and only for a unit with workload cells.
  - **The minute job reads each day only for the shift whose day it is**, plus
    a shift opening within `LOOKAHEAD_H` (4 h — `_person`'s window, so early
    arrivals are not missed). It read every shift's people for every due day: a
    night that had not started every minute, a finished day shift every 10 min.
    So `all_at` is only the job's pacing stamp now: the job stamps `units[m]`
    for each unit it read (row `v` 2; upgrading a v1 row hands its `all_at` to
    every unit first), and **a unit's read time is the OLDEST `at` among its
    own people** (`_covered_at(data, unit, ids)` — each person carries the
    start of the read that last replaced them). A day-wide stamp showed a
    skipped unit as just read and swallowed its forced read. A person the last
    passes skipped gets their whole day's marks when the job reads them again.
  - **A forced read** keeps the job's 10-minute directory (it re-read the whole
    plant first), is ignored within `FORCE_MIN_S` (30 s) of the unit's last
    read, and only ONE read per (unit, day) runs at a time (`_unit_lock`). A
    request that finds one running is served the stored read at once when it
    already holds all the unit's people; otherwise it waits up to `WAIT_S`
    (60 s, holding no DB connection) and serves what that read stored — never
    a Verifix read of its own after waiting (wait + read would pass
    Cloudflare's 100 s). Still incomplete → `read_error`; nothing → `busy`.
  - **A direct delete of a worker the brigadir already asked to delete approves
    THAT request** instead of writing a second row; a replaced batch is
    rejected only within its own unit.
  - Two shared pieces /staff draws came out of it: the export dialog is in
    four languages and says where the file goes (download in a browser,
    Telegram inside it — the toast follows `exportXlsx`'s answer), and
    «Yaratish» (`CreateMenu`) is the `Button` template (38px, bold) with a real
    menu (arrows, Home/End, Escape, the disabled reason as text).
- **The doors outside the page** (2026-10-05, built so the page could replace
  /staff; they now serve /staff's live days):
  - **The bot's one-tap cards** (`approvals.py`): kinds `live_document` (code
    `lv`) and `live_batch` (`lb`) beside `hr_document` / `edit_batch` — the
    same renderers with « · Verifix» on the header line, the «Open panel» button
    onto `/staff?tab=requests` (with the day), `_broadcast` returning who it
    reached. Recipients: admins, the RECEIVING supervisor of an exchange and
    the documents / requests grantees over the unit — a non-admin only when
    `live_staff.can_open` admits one of their profiles (`_live_openers`). The
    tap runs the live router's own cores (`_approve` / `_reject` /
    `process_batch`), writes the register row under the web endpoint's key
    (`lab.live_document_approved` …) and `edit_admin_notices`; a structured 409
    from `_approve` (`not_here`, `breaks`, `doc_too_old`) is answered as an
    ALERT with the server's own sentence (`approvals.Refused`, cut at a word to
    Telegram's 200 chars) and the card keeps its buttons — never «already
    handled». A documents grantee who is neither admin nor receiver taps
    through `_grantee_caller`, so the card they were sent can be acted on (the
    /staff `hr` card still cannot — parity there is a separate change).
    `staff_live.py`: `_notify` takes `dm_skip` (bell row kept, no DM — a card
    recipient is not DMed twice; the /staff `admin_dm=False` rule),
    `_notify_doc("created")` sends the card FIRST, and every decision path
    retires its card after `db.commit()` — `_retire` / `_forget` for documents,
    `_settle_batch_card` for a batch once NO row is pending (approved if any row
    is approved/undone, else rejected — the `list_documents` rule), including a
    replaced batch, a direct delete that answers a pending request, the
    single-request doors and the bot tap. `process_batch` is the ONE batch core
    (the HTTP doors and the `lb` tap).
  - **The bell's «Sizdan kutilmoqda» and the phone** (`notif_queue._live_docs`
    / `_live_batches`, keys `live_doc:<id>` / `live_batch:<uuid>` — the very
    subjects the live rows carry, so `_push_decisions` attaches buttons;
    `_live_open` is `permissions.page_allowed(db, payload, "staff")`, the very
    decision the doors' gate makes; a non-admin is offered only days from
    `LIVE_FROM`, while ADMINS still see the lab page's pre-floor test filings —
    no page lists those any more, and the bell's inline actions are where they
    can be settled; the stale rule on `doc.day`; actions on the live endpoints,
    approve with undo → cancel; links onto `/staff?tab=requests`). `KIND_ORDER` / `_RANK` and `notifMeta.QUEUE_KINDS`
    carry the two kinds right after their twins; `QueueItem` draws a neutral
    «Verifix» chip, `live_batch` asks like `edit_batch`. FOLD gained the nine
    live twins (`live_day_closed` … `live_record_deleted`) with four-language
    titles prefixed «Verifix ·»; `_COUNT_DISTINCT` the two day keys; the
    `open_units` chip stays `day_closed`'s own.
  - **The mark on every live-day message is «Verifix»** (2026-10-07, the
    operator: «Jonli» / «Онлайн» / «Live» named no place, so a notice did not
    say where the change was made). One Latin word in all four languages, on
    the 14 `live_*` bell / DM titles, the 9 FOLD titles, the cards'
    `live_mark`, the bell queue chip (`notif.q.live`, `notif.kind.live_*`) and
    the export's DM caption. Bell rows store the key, so rows already written
    render with it too; Telegram messages already sent keep «Jonli».
  - **The badge**: /staff's own (`/api/staff/documents/pending-count`) counts
    the live register's pending items from `LIVE_FROM` beside the file
    register's — one number on one nav row.

## /staff reads TODAY live (`live_day.LIVE_FROM`, from 2026-10-06)

The operator (2026-10-06): «can we turn current verifix edit page supports live
editing for today? … At the end of the shift, when everyone is left and
supervisor closed the day, the workload will be ready. There won't be any need
to manually press any button or download excel sheets.» Twenty questions were
asked one by one; `docs/plan-live-staff-today.md` is the record of every answer.
`/staff` reads its live days through the live page's doors and tables (see «A
live day's engine» above); that page, `/staff-live`, was kept beside it for an
afternoon and then retired (2026-10-06) — its route redirects to `/staff`.

- **`services/live_day.py` is THE floor** — `LIVE_FROM = 2026-10-06`, shift 1's
  day and shift 2's night of the 6th. It shipped as 2026-10-07 at 19:53 on the
  6th and was brought FORWARD the same evening (v4.253.1, the operator: «today's
  results are not appearing»): shift 2's night of the 6th opened at 20:00, after
  the deploy, so ruling 4 already made it live, and shift 1's day of the 6th had
  just ended — a file day holds nothing until the next morning's Davomat read,
  so switching a day being worked loses nothing. A leaf (`day_state` imports
  it), a constant with no override, never moved later. A day before it keeps the
  file flow exactly as filed; a day on or after it is a LIVE day for the whole
  plant.
- **The page picks its source PER DAY** — `pages/Staff.jsx`: `B` is the page's
  own API (`STAFF_API`, the file doors) and owns every remembered key and the
  unit list; `S = apiFor(selectedDate)` is the data source, and each tab and
  modal is wrapped in `<StaffApiProvider value={S}>` (the calendar is not — it
  merges the two calendars itself). `TODAY_STAFF_API`
  (`context/StaffApiContext.jsx`) is the live doors and cache with /staff's own
  keys — /staff's own table plus ONE status column (inside · break · left · no
  check-out · moved, ruling 3) and a day-off row on no list. The status cell is
  ONE line — a move's «→ unit · HH:MM» sits beside the status, and there is NO
  «N awaiting approval» chip on a row (the operator, 2026-10-07: the Requests
  tab's badge already counts them, and the chip made its row taller). Once a unit's own shift-day
  (`/api/staff-live/today`) is live, /staff opens on it and steps with
  `DayStepper` (max = that day); until then the page is exactly what it was.
  **With NO unit picked** — an admin or a shift-manager before they choose a
  brigadir — that endpoint cannot answer (it is 400 without a unit), so the day
  is the PLANT's own, which `/live-from` already named (`dayIso` in
  `Staff.jsx`, 2026-10-26): the page then reads the LIVE register, the
  stepper's ceiling and its «back to today» are that day, and picking a unit
  hands the day back to that unit's own. Before it the page fell back to the
  date it REMEMBERED, a file day for anybody who had not opened /staff since
  the switch, so the whole page — the Requests tab included — read the file
  register, whose newest rows predate the floor: a shift-manager with seven
  live drafts waiting was shown 05.10's approved ones under a badge counting
  seven, the drafts only as the notice line below.
  A worker nobody clocked prints Verifix's own day-cell mark in the clock column,
  exactly as the file did (`live_staff.day_mark` = `verifix_attendance._mark`:
  «X», a leave letter «О» / «Б» / «В» / «ОТ» …, «—» for a day off; a plain «X»
  waits until the worker's shift is over) — and the close copies the same mark.
  `GET /api/staff-live/live-from` serves the floor and the plant's date. The live
  router's page gate is `require_page("staff")`, and a grant at "all" on
  staff/daily widens it as on /staff. `/daily` reads a live day the
  same way (table, documents, close check) but keeps its own default date.
- **The close COPIES the day** (`services/live_projection.py`, ruling 1):
  `POST /api/staff-live/daily/close` — and `/api/staff/daily/close`, which
  hands a live day to it, so every door that closes a day reaches it — reads
  Verifix once more ONLY when it must (`verifix_live.close_fresh_s`, from
  2026-10-13): the shift-day the job is reading closes on the job's stored
  read while that is younger than the job's pace plus `STALE_S` (4 min while
  the shift runs or just ended, 13 min after) — the same line past which
  `day_read` calls a read «aged» — because the job re-copies a closed day
  whenever Verifix moves; and a close the stored read would REFUSE (somebody
  inside, due or without a check-out) reads Verifix once more (older than
  `CLOSE_FRESH_S`, 90 s) and judges the fresh read before saying no. A PAST
  shift-day, which no job reads any more, still reads past 90 s. The earlier
  90 s bar (2026-10-09) raced the job's own pass — ~30 s long and stamped
  with its START — so most closes of a running shift still read Verifix: 9.1 s
  median on the 13 Oct DM. A forced read takes the directory as it stands up
  to `DIR_FORCE_S` (`DIR_TTL` + `STALE_S`); at `DIR_TTL` it raced the job's
  directory pass too,
  then refuses while anybody is inside, on a break
  or due, while a counted worker has no cell, while somebody has no check-out
  the brigadir has not answered, or when Verifix is unreachable and the stored
  read is older than `CLOSE_READ_MAX_MIN` (15, ruling 14). Then `LiveDayClose`
  + `DayApproval` + the rows. The rows are the file's shape: «HH:MM - HH:MM
  (Явка)» for a whole day (the row's own hours in the bracket for a stint, a
  half or a brigadir's exit), «Отработано» hours at two decimals half up, the
  file's early/effective arithmetic, the absence mark of a day nobody clocked
  («X», a leave letter, «—» off), a split's `hc_weight` + `split_of`, a whole-day
  task move zeroed («X», 0), and a nameless hours-only row for what a move left
  here under another unit's name — in the worker's home cell on their own unit.
  `LiveProjection` records the digest, the `/workers` rewind rows and the
  «Ish grafigi» roster. **Consequence to know: nothing writes attendance for a
  live day until its brigadir closes it** — `build_metrics_list` already gated
  on the close, so the загрузка of an unclosed day was blank before too.
- **A copy is built from a read taken AFTER the unit-day's lock** (2026-11-06,
  the audit). `live_projection.write` used to build its rows from a `ctx` loaded
  before it waited for the lock; a second approval committed meanwhile was in the
  copy the lock holder wrote, and the older rows then went back over it — on a
  day the job no longer reads nothing repaired that. `_reread` (flush, expire,
  `live_staff.load` with the caller's own Verifix read) now runs right after
  `lock()`. `refresh` re-copies a day somebody else closed with
  `require_closed=True`, and the rare heal of a missing `DayApproval` takes the
  lock first and asks whether the close still exists — a reopen (`unproject`,
  same lock) that commits in between used to be undone for every page that
  reads the day as closed. `close_day` ends with a one-unit `_recopy`: an
  approval decided while the close was being built re-copied only the closed
  units it could see.
- **An edited draft gets a fresh one-tap card** (`update_document`): the old
  card is retired («cancelled») and a new one sent, both on `tg_later` in that
  order — `edit_admin_notices` retires every notice of (kind, ref), so a card
  sent first would be retired on arrival. The old card's ✅ approved the
  document as it stood after the edit, not as the card read.
- **The copy follows Verifix until the unit's next shift-day opens**
  (ruling 13): the minute job (`verifix_live._notices`) re-copies every closed
  unit whose CURRENT shift-day it read, writing only when the digest moved; a
  decision on any document of a live day (approve, un-post, delete, a deletion
  request, the bot's card tap) re-copies the closed units of that day
  (`staff_live._recopy`). After the next shift opens the job stops reading the
  day, so its copy freezes. **A reopen deletes the copy and `DayApproval`**
  (`unproject`); `/api/staff/approvals/reopen` (/production, /idle-cell, the
  admin tab) hands a live day to the live reopen — which also lifts a
  `DayApproval` with no live close beside it (a file-flow close of a day the
  floor later reached). The other half-state heals itself: a live close with no
  `DayApproval` (a /staff-live close made before the floor reached the day) gets
  its `DayApproval` at the next re-copy (`live_projection.refresh`). The
  Jurnal's undo refuses a live day (`action_undo.LIVE_DAY`).
- **No check-out at the close** (ruling 6): `GET /api/staff-live/daily/close-check`
  is THE gate the dialog shows (`components/staff/LiveCloseCheck.jsx`,
  `useLiveCloseCheck`): the read's time, who keeps the day open, who has no
  cell, and everybody who came, has no exit and whose shift is over — each with
  an exit-time field (default: the schedule's end) and «Kelmagan».
  `POST /daily/clock-fix` stores the answer in `live_clock_fixes` (one per
  shift-day and worker, `clear` takes it back); `live_staff._fixed` lays it over
  Verifix's day on every read — the exit sets the hours to the clock span, «did
  not come» makes it an absence. `ConfirmDialog` gained `confirmDisabled` for
  this. Corrections otherwise come from Verifix only (ruling 7).
- **«Verifix'dan yangilash» re-reads a live day — past days too** (2026-10-07,
  the operator, over a worker Verifix had standing in the wrong unit's cell:
  «we need an update from Verifix button for the past days also»). The job
  stops reading a shift-day once the next one opens, so a past day kept its
  last read (the close dialog said «07:49») however Verifix changed after it.
  Two doors, both a person's press: the close dialog's button (`GET
  /daily/close-check?force=true`, then the table and calendar re-read what it
  stored) and the Workers tab's header on a live day (`GET
  /attendance?force=true`, beside «Verifix · HH:MM» — «DD.MM HH:MM» once the
  read is not the day's own date). A press is `day_read(force=True,
  fresh_dir=True)`: the unit read whole, AND the directory (who stands in which
  cell) re-read when older than `DIR_PRESS_S` (120 s) — a unit's day follows
  the CURRENT directory, on a past day too, so a worker corrected to another
  cell in Verifix leaves this unit's day (and joins their own) on the press, not
  up to `DIR_TTL` later. One directory read at a time (`_dir_lock`; a second
  caller serves the stored one). **Not on a CLOSED past day**: its copy froze
  when the next shift opened (ruling 13), so the server ignores the force there
  and the button is not drawn — reopening the day is the way to read it again.
  Each no-check-out row in the dialog names the cell Verifix stands the worker
  in and their schedule (`cell`, `schedule` on `_no_checkout`), and the list
  ends with the way out: correct the worker's department in Verifix, then press
  the button. The close itself still reads `force` without `fresh_dir`.
- **One truth per live day.** `day_state.pending_counts` / `confirmed_pairs`
  count live drafts and pending deletions from the floor, so a closed live day
  is «closed» until they are decided and then «confirmed» (ruling 11 — pending
  requests never block the close). The /staff calendar merges the file calendar
  (days before the floor) with the live one; the requests tab follows the day's
  source and names the OTHER register's still-pending requests with a way there
  (`OlderRequestsLine`, both directions: a live day names the file register's
  and opens a FILE day, a file day — one stepped back to — names the live
  register's and opens a live day); the sidebar badge counts both registers.
  /staff never lists a live draft or deletion dated before the floor, and the
  bell queue offers one to admins only (those are the retired lab page's test
  filings and move no figure; the rows are kept).
- **Notices** (ruling 18): from the floor the live notices reach whoever can
  open /staff (`live_staff.can_open`). New keys: `live_list_open` («your list is live», once at the day's
  first clock-in — never to a unit whose people have all left by the first pass
  that sees the day: it is told only «everybody left»), `live_all_left_staff` (everybody left, naming who has no
  check-out and saying when nobody typed «Bugungi fakt», ruling 20),
  `live_day_still_open` (to the brigadir and the shift manager when the next
  shift opens on an unclosed day, within `REMIND_WINDOW_MIN`), and
  `live_shift_summary` (ONE line per shift to the admins at that moment —
  their per-unit «day closed» DMs are bell-only on a live day). Once-only via
  `live_day_notices`. A day before the floor is told nothing (the minute job's
  notices start at `live_day.is_live`).
- **The admin «Davomat» tab refuses a live day** (`attendance_batch._parse_write_date`,
  ruling 16; the legacy per-supervisor upload too) — an admin corrects a live
  day by reopening it and acting on /staff. The cleanup tool deletes a live
  day's close and copy with it. The «Verifix data uploaded» DM therefore no
  longer happens for live days.
- **Readers of the file that moved**: «Ish grafigi» / T11 read a live day's
  roster off its copy (`kelish._live_rosters` — so a day counts there once
  closed); `/workers`' original-brigadir rewind reads the copy's `original`
  rows (`exchange_rewind`); each stored read entry now carries the cell it was
  read in (`emps[eid].c`). The live card links, the bell queue and the
  notification links open /staff for a live day.
- Not changed: the typed «Bugungi fakt» people and SAP minutes (ruling 20);
  ШТАТКА on /production, /live and the Overview trend read the copy, i.e.
  after the close (ruling 19); the whole-cell per-day routing of the Davomat
  tab is gone with it (ruling 17).

## A brigadir closes a day only from the shift's clock (`close_window`, 2026-10-22)

The operator's rule: a SUPERVISOR may close an **S1 day only from 12:00** and
an **S2 day only from 23:00**, on the date the shift-day is filed under. Before
it, the close is refused — on top of every live check (nobody inside / on a
break / due, every check-out answered, every worker in a cell), never instead
of one. `services/close_window.py` is THE definition.

- **Who.** Supervisors only. An admin closing for a unit is never held
  (`close_window.lock` answers None for any other role).
- **Which moment.** The first time the clock comes round at or after the
  shift's START (`cell_hours.defaults`, the frame `day_frame` names the day
  by): S1 08:00 → D 12:00, S2 20:00 → D 23:00. A clock earlier than the start
  is the next morning (D+1). A past day is long open; a unit with no shift is
  shift 1.
- **Where it is set.** «Smena vaqtlari» (`/panel/shifttimes`), card
  1b — two `AppSetting` rows `day_close_after_shift_1/2` ("HH:MM"), written by
  `PUT /api/cell-hours/close-after` (`admin.cell_hours.manage`). A missing row
  reads as the fallback 12:00 / 23:00, so nothing is seeded. Unlike the cell
  hours on the same tab, this one IS enforced.
- **Where it bites.** `staff_live.close_day` refuses with 409 «Kunni soat
  12:00 dan keyin yopish mumkin.» BEFORE any Verifix read (logged as
  `blocked=close_time`). `close_lock` ({close_from, opens_at, opens_on,
  opens_in_s}, null when open) rides on `GET /api/staff/approvals/day`,
  `GET /api/staff-live/approvals/day` and the close check, which also sets
  `closable=false` — so /daily greys both «Kunni yopish» buttons with the note
  under the big one (re-asked at `opens_in_s`, the server's count, never the
  browser clock), and the /staff calendar's dialog names the time and keeps
  its confirm unarmed. The words: `utils/closeLock.js`.
- **The «everybody left» DM** still goes the moment the last person leaves;
  before the clock it is `live_all_left_staff_early`, whose last line says
  from when the day can be closed (`close_from`).
