# Server operations: freezes, slow requests, zero-downtime

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## Freezes: the server watches itself, the loader reports itself (2026-10-07)

The operator's report: the app sat on its logo-and-spinner screen (the
full-screen `PageLoader`) for seconds on a good connection, and nothing said
why — the index.html boot watchdog stops the moment React paints, and that
loader IS React. Production runs ONE uvicorn process (`--workers 1`), so any
blocking work on the event loop freezes every request on the server at once.

- **A Telegram update is handled once across a deploy** (2026-11-06, the audit).
  The webhook's duplicate guard was a ring of the last 200 ids in ONE process;
  Telegram sends a slow update again after ~60 s, and when a worker swap
  retired the old process meanwhile the repeat landed in the new one, whose ring
  was empty — the command or button ran twice. `bot_updates_seen` (`BotUpdateSeen`,
  `create_all`) is the memory both workers share: `webhook._recorded_before`
  inserts the id `ON CONFLICT DO NOTHING` and a conflict is a repeat; pruned after
  two days; a database that cannot answer fails OPEN (the bot still answers).
- **The cause found and fixed: sync work inside `async def` handlers.**
  `/bot/webhook` ran every bot update (its queries, its Telegram round-trips,
  the checklist sweeps a /tasks runs) ON the loop — fine under Passenger (a
  process per request), a platform-wide freeze under uvicorn. It now runs on
  ONE dedicated thread (`webhook._BOT_THREAD`) and is awaited: still one
  update at a time, in order, reply sent before the 200, exceptions logged —
  just not on the loop, and not on the shared threadpool either (a queued
  update must not hold a token the dashboard needs). The leader camera photo
  doors (`/api/leader-proof/photo`, `/late-photo`: Pillow stamp + Telegram
  relay + bot nudge), the SAP upload, the catalog import and the old admin
  attendance upload are plain `def` now (`file.file.read()`), so FastAPI runs
  them on the threadpool. **Never put sync DB / HTTP / file work in an
  `async def` handler** — read the body with `await` if you must, then hand the
  rest to the threadpool (or make the handler `def`). Left as they were, being
  rare and admin-only: `/admin/db-restore`, `/api/android/publish`, the
  broadcast composer (its fan-out already runs on a thread).
- **`services/perf_watch.py` is THE server's account of being slow.** A
  heartbeat the loop writes every 0.2 s, read by a thread of its own: a gap of
  ≥ 1 s is a STALL, and the loop thread's stack is taken WHILE it lasts — the
  app frames that held everybody, plus the requests in flight and any other
  thread busy in app code. `RequestTimingMiddleware` (outermost) stamps
  `X-Server-Ms` (time the server spent) and `X-Server-Stall-Ms` (longest stall
  of the last minute; the heartbeat writes it the instant a freeze ends, so the
  answers queued behind the freeze already carry it) on every /api, /admin,
  /bot answer, and records requests ≥ 3 s with the DB pool (15 connections),
  the threadpool (40 tokens) and the in-flight count. Logged as
  `[SERVER-STALL]` / `[SLOW-REQUEST]`; the support chat (or every admin) gets
  ONE «Server was slow» DM, at most every 30 min, only when it was real
  trouble: a stall ≥ 2 s, a sign-in / page-access answer ≥ 5 s, a full DB pool,
  or ≥ 5 slow requests in 2 min not counting paths slow BY DESIGN
  (`_EXPECTED_SLOW` — exports, Verifix reads, the assistant). Started once the
  DEFERRED startup work has finished (startup migrations run on the loop by
  design and the deferred walks hold the GIL — neither must read as a stall;
  from 2026-10-18, see «Zero-downtime on ONE port»), stopped first at shutdown. Never fails a request.
- **A slow request says WHERE its time went** («time went to: 62%
  staff_live:_send_dms ↳ ssl:read»). From `SAMPLE_AFTER_S` (1 s) on, the
  watcher looks at each running request's thread every `SAMPLE_S` (0.25 s) —
  found by the handler's own frame on the stack (`scope["endpoint"]`,
  unwrapped) — and counts the two innermost app functions plus the library
  call under them; the three biggest shares print on the DM and the log line.
  The pool / threads / in-flight figures are the BUSIEST seen during the
  request («busiest …»), not the moment it ended, which always read 0. An
  `async` handler waiting on I/O is on no stack and gathers nothing.
- **The loader reports itself** (`utils/stallReport.js` + `utils/requestLog.js`).
  `PageLoader` takes `where` (auth · access · caps · page) and times its
  VISIBLE wait. Past 6 s it says «Server javobi kutilmoqda…», past 20 s it
  offers «Qayta yuklash» — both hang below the spinner, so the logo never
  moves. A wait ≥ 6 s is reported to `/api/crash-report` kind `"stall"` as it
  ends, at 25 s if it is still going, or by a keepalive fetch if the app is
  hidden mid-wait («left») — once per wait, at most two per page load. The
  report carries every request pending or finished in that window with the
  tab's time AND the server's (`X-Server-Ms`, `X-Server-Stall-Ms`), fed by the
  axios interceptors (paths only, never a query or body). The backend
  (`services/stall_report.py`) prints a one-line VERDICT — restart · server
  froze · server slow · network · no answer · page code — beside the server's
  own perf_watch record of the same window; one DM per gate × endpoint × cause
  per hour (not per person: a freeze stalls everybody at once). Logged as
  `[CLIENT-STALL]`.
- **The first DM it sent named «Ish grafigi»** (2026-10-07): taps
  (`PUT /api/kelish/mark`) at 3–5 s, two threadpool workers inside
  `kelish.file_workers_days` while the loop was held 1.4 s — CPU-heavy Python
  on worker threads starves the loop through the GIL just as code ON the loop
  does. Fixed by keeping the file maps (see «Ish grafigi»). A stall entry prints
  its stack LAST: Telegram eats the line break right after a `</pre>`.
- **The second named Telegram**: a live day's close 17.6 s and a bulk
  approval 12 s, with nothing busy on the server — the request was waiting on
  Telegram, one round-trip per DM and per card edit. Two fixes. Every DM also
  re-set the recipient's menu button (a second call per message, platform
  wide): `telegram_bot._set_menu_button` now remembers what it set per account
  (`_MENU_TTL_S`, 6 h; `/start`, approval and admin set it `force`d). And the
  live-day notices go out AFTER the answer: `services/tg_later.py` is THE
  after-the-answer sender — one worker thread, in order, the request's context
  copied (so Ghost Mode still holds), failures logged — and
  `staff_live._notify` builds every message before its commit and hands them
  over (`_send_dms`); `_retire` / `_forget` edit and drop the cards there too.
  The one-tap CARD of a new draft is still sent inline: who got it decides who
  is spared the DM. Nothing else moved to it yet.
- **The third named the live table and the leaders board**: /staff's live
  table 10–14 s (fixed: the read-staleness rule in «A live day's engine»), and
  `/api/leaders` + `/api/leaders/standing` 11–14 s each — both rebuild the
  whole checklist history per request (`_leaders_feed`); the standing pool is
  kept 60 s (served stale while rebuilt from 8 Oct — see «Mening o'rnim»).
  Not yet profiled: the next report's «time went to» names the
  function.
- **The fourth was the first with «time went to»**: «Kechikkan isbotlar»
  (`GET /api/leaders/late-proofs`) 3.2 s, 83% in one photo query PER CARD (up
  to 400) while the DB pool read 15/15. `leader_late_proof.photos_for` reads
  the whole queue's photos in one query; `_lp_item(media=)` takes them. The
  pool itself is SQLAlchemy's default (5 + 10 overflow = 15) under 40 request
  threads — raising it waits on knowing prod Postgres's `max_connections`.
- **The fifth named the leaders board itself**: `/api/leaders` 10–21 s and
  `/api/leaders/standing` 12 s, the DB pool full with 16 in flight. Measured on
  a production-sized copy (5,500 bot days, 71k entries, 56k verdicts): one
  build 4.2–5.4 s alone, 20 s each with four at once — most of it building
  ~129k ORM objects to read one or two fields each. Two fixes. (1) The loaders
  read COLUMNS: `leader_bot.entries_of` hands out read-only rows (`_ENTRY_COLS`
  — no reader writes to them), `media_of` / `captures_of` read the columns
  they print, `leader_ai.uid_map` reads `(id, day_id)` in one pass over the
  refs, `rejected_by_uid` reads `(ref, task_id)`; big id lists go as ONE array
  parameter (`leader_bot._in_ids`, `= ANY(:ids)`), never an expanding IN.
  Output byte-identical; one build 1.9–2.5 s. (2) **Simultaneous «see all»
  viewers share one build** (`routers/leaders._shared_feed`): built as an
  admin reads it, narrowed per viewer by `_for_viewer` (the header fields, and
  a cutoff's reason and author blanked for non-admins). A request takes only a
  build that STARTED after it arrived — never a running one, so an admin's own
  change is never missed — and nothing is kept once a build is done. A
  leader's copy (`_la_hide` rewrites it in place) and every scoped viewer
  still build their own. 16 at once: 2.2 s first, 4.7 s the rest (was ~35 s+
  each). Still open: a scoped viewer's build reads every verdict of the
  history (`stats_by_uid` over all dates) — 0.85 s for one brigadir.
- **The sixth named a Refresh press and the «Verifix'dan yangilash» presses**
  (17:46–18:20, after v4.257.5): the leaders-sheet Refresh 19.4 s — 5.6 s
  reading Google Sheets, then `leader_ai.restamp` walking EVERY stored verdict
  through `sync_date_flags` on every press, with one `unit_shift` query per
  row of a moved leader inside `leader_shift.chain` (3.1 s of those alone);
  three live-attendance reads at ~10 s and a close-check at 15 s, which were
  presses (a press re-reads the plant's whole directory once it is older than
  120 s: ~9 Verifix calls at about a second each); the quality refresh
  (Google Sheets, by design); and `/api/leaders` + `/standing` twelve times,
  all under 10 s, with no line saying what they were doing — the detail
  prints only the six slowest requests. Fixed: `restamp` re-derives only when
  it re-stamped a row (`discover()`'s own rule; the boot still walks the
  corpus whole — measured on the 11 Sep copy, a press that moved nothing
  pays 0.16 s instead of the walk); `leader_shift.unit_shift` reads the
  unit → shift map once per 30 s (`_UNITS`, its own session like
  `_overrides`, dropped by `forget()`, which the supervisor profile save now
  calls when a unit's shift or id moved); `verifix_live._directory` holds no
  DB connection across the plant-wide read (`_read_day`'s rule); a forced live
  read is recorded as `…?force` and is slow BY DESIGN (`_expected_slow`, with
  `/admin/refresh-sheet/`), while the same path unforced — a poll that found
  its stored read stale — still counts; and «Slow most often» prints, per
  path, the count, the median and where that path's time went over ALL its
  events (`_path_summary`), so a path slow twelve times is named even when
  none of its requests is among the six slowest. Not touched: `/api/leaders`
  itself — the next report says where its time goes.
- **The seventh came three minutes after v4.257.6 deployed** (19:38–19:39):
  tabs reloading onto the new build asked for the heavy pages together. Four
  causes, all fixed:
  - **The AI overview took 16.1 s** because every fetch of it re-derived every
    stored verdict (`sync_date_flags`), and the page fetches it on each open,
    each window focus and after each triage ruling. It no longer does: every
    input of the date verdict re-derives where it changes, and the boot walks
    the corpus whole. Never put a corpus walk back on a polled read.
  - **The bell's newest-id read spent 10.3 s in one query.** Its address rule
    was one OR, which the planner answers by walking the primary key backwards
    until a row matches. `notification_center.viewer_branches` now splits it
    into broadcasts, an account's legacy rows and the active profile, each with
    an index of its own (`ix_notifications_broadcast`,
    `ix_notifications_legacy_tg`, the existing `(recipient_profile, id)`), and
    the two polled reads, `top_id` and `ids_above`, ask each part separately.
    A fourth address form needs a part and an index of its own.
  - **`/api/leaders` (11.7 s)** counts verdicts per REPORT in SQL
    (`leader_ai._uid_sql`, the SQL twin of `uid_map`; change them together)
    and projects bot tasks in place instead of copying each one.
  - **`/api/heatmap` and `/api/summary`** read their quantities as columns
    (`zagruzka_source._labor_inputs`), not as one ORM object per row.
  Measured on the 11 Sep copy: the register build 0.82 → 0.68 s, its verdict
  counts 174 → 111 ms, each bell part one index probe, the quantity reads
  123 → 49 ms, the overview 42 ms. The 1.3 s loop stall had no app frames on
  the loop: request threads busy in Python held the GIL.
- **The eighth was the network, and the gate requests are now asked twice**
  (v4.260.1): a leader's sign-in POST took 7.1 s on 4G with 13 ms on the
  server, while `bot-info`, sent the same instant, came back in 0.8 s — ONE
  request stuck on a working connection (a lost packet waiting out its
  retransmission backoff, 1 + 2 + 4 s). `utils/hedge.js` `hedged(send)` sends
  a second copy after `HEDGE_MS` (3 s) — at once if the first dropped with no
  answer — takes whichever answers first and aborts the other; any ANSWER
  (a 401 too) settles it. Only for requests safe to repeat that the app cannot
  start without: `/api/auth/webapp`, `/api/auth/web/session`,
  `/api/page-access`, `/api/my-capabilities` (react-query's own signal is not
  taken — consuming it aborts a fetch whenever its last observer unmounts).
  `bot-info` no longer gates the sign-in: it was half of a `Promise.all`, so the
  logo waited for the slower of the two and a failed username lookup read as a
  failed sign-in. The aborted copy is logged with `x: 1`
  (`requestLog.noteEnd(…, cancelled)`) and `stall_report._answered` leaves it
  out of the verdict, printing it as «cancelled — the other copy answered
  first». A second sign-in copy writes a second `session.telegram_login` row.
- **The ninth: a 52.5 s freeze nothing could name, and a bot update of 77 s**
  (8 Oct, 12:48–13:53). The one loop stack, taken 1 s in, showed the loop about
  to finish the heartbeat's own `asyncio.sleep` (`tasks.py:651`, Python 3.11)
  with every request in flight 0.3 s old and the three scheduler threads in
  trivial queries — so for the other 51 s the loop was waiting for the GIL,
  or the process was not running at all, and a single look cannot say which.
  Three changes, measured locally before shipping:
  - **A long freeze names itself** (`perf_watch`). faulthandler's watchdog —
    a C thread that needs no GIL — is re-armed by the heartbeat every second
    (`_arm_dump`, BEFORE the beat is written, so no dump is mid-write when the
    watcher reads); a loop silent `DUMP_AFTER_S` (6 s) gets every thread's
    stack written to an unlinked scratch file, again every 6 s while it lasts,
    read and emptied at the end (`_read_dumps`). Beside it: a rolling baseline
    taken every 2 s while the loop beats (`_base` — a freeze may not let this
    thread run until it is over), per-thread CPU from `/proc/self/task`,
    process CPU and major faults (`getrusage`), host steal / iowait / idle
    (`/proc/stat`), RSS and swap, every full collection timed through
    `gc.callbacks`, and the loop looked at again every 2 s while held. The
    stall record gets `freeze` (`_freeze_account`) and the DM a **«why:»** line
    (`_verdict`, the first that fits): garbage collection · the loop ran code
    of its own · one thread used the CPU and never let the others run (its
    stack, from the dump taken WHILE frozen) · something kept the GIL (the
    threads in app code at the dump) · host steal · swap · the loop waited
    inside a call of its own (named) · this process barely ran. Verified on
    four reproductions: a regex holding the GIL on the loop, the same on a
    scheduler-named thread, `time.sleep` on the loop, a 1.9 s collection.
    `gc.freeze()` runs once at the end of startup, so a full collection walks
    only what the running server made (a collection holds the GIL throughout).
  - **Answers are encoded off the loop** (`services/json_offload.py`, installed
    in `main.py`). FastAPI runs `jsonable_encoder` over a route's return value
    ON THE LOOP when the route has no `response_model` — every route here — even
    when the handler ran in the threadpool: a register-sized answer (30 MB) is
    4.7 s of pure Python there. `install()` swaps `fastapi.routing.serialize_response`
    (looked up as a module global per request) for a twin that runs the same
    `jsonable_encoder` in the threadpool unless the answer is a scalar or a
    flat container of ≤ 32 scalars. Byte-identical on every shape tried (big
    nested rows with dates, Decimals, sets and models, `None`, a string, a list,
    a `response_model` route, `status_code=201` with a header set on
    `response`); a 1.9 MB answer held the loop 557 ms before and 54 ms after —
    what is left is starlette's `json.dumps`. `/api/leaders` and `/standing`
    already pre-render (`_json_response`) and never reach it.
  - **The bot thread is sampled.** `perf_watch.working_for(scope, note)` hands
    a request's samples to the thread doing its work — the webhook awaits its
    own `_BOT_THREAD`, which no handler frame names — and `note` prints beside
    the path: the command or button (`webhook._what`, never a message body), how
    long it waited behind the update before it, and «a repeat of an update
    already handled» when Telegram sent one again. The two webhooks of the 8 Oct
    report ended in the same second, 77.2 s and 17.2 s: the second was
    TELEGRAM'S repeat, sent 60 s after the first while that one was still
    running, and skipped as a duplicate the moment it got its turn.
  Still open: what the 77 s update and the 52 s freeze WERE — the next report
  names both. The «Yordamchi» `async def` handlers (`send`, `confirm`, `upload`,
  `transcribe`) still query the database on the loop; with the pool full that
  is a wait of up to 30 s with every request stopped behind it — admin-only
  today, so left for now.
- **The ninth (9 Oct, 08:54–09:18) was the same paths again**, and three of
  its six detailed lines were presses doing what they do. Fixed:
  - **`strptime` was a convoy.** It takes a process-wide lock around a locale
    lookup on every call, and a live day parses four clocks per worker — the
    minute job re-copying the plant and a bulk approval re-copying it queued on
    that lock (66% of `/api/staff-live/documents/bulk`). `verifix_live._dt` /
    `_d` read Verifix's «dd.mm.yyyy HH:MM[:SS]» by hand (regex + `lru_cache`)
    and hand anything else to `strptime`, so what is accepted did not change
    (checked equal on 20,000 cases). A worker's `raw` no longer formats their
    last 60 marks (nothing read them). 3,000 synthetic workers: 0.22 → 0.09 s.
  - **A bulk approval reads the plant's stored day once**, not once per
    document's unit (`day_read(stored_only=True, memo=)`, shared through
    `_ctx_for`'s `reads`).
  - **Verifix lists are read side by side** (`verifix_live._side_by_side`, a
    client each): the report, the marks and the skipped people's whole marks
    of a day; divisions, jobs and employees of the directory. A read takes as
    long as its slowest list, not the sum. The day close reuses a stored read
    (`close_fresh_s` — see «/staff reads TODAY live»).
  - **Identical heavy reads at once share one build** — `services/shared_build.py`,
    the leaders board's rule made general (a request takes only a build that
    STARTED after it arrived; nothing kept once done; a waiter hands its DB
    connection back first): `/api/heatmap`, `/api/summary`, `/api/brigadirs`,
    keyed by the scoped units + period + flags. At 08:57 the heatmap ran 22 at
    once with the pool full. `build_metrics_list` reads attendance as the six
    columns `compute_metrics` reads, in one query for every unit (it built one
    ORM object per row, one query per unit).
  - **The DM lists by-design slow requests apart** (a path `_expected_slow`
    names): counted in the first line, named in «Slow by design», detailed
    after everything else — never in «Slow most often».
  Not touched: the Google-Sheets refreshes (the sheet is the wait).
- **The tenth (9 Oct, from 12:28) had no freeze and four slow requests**, all
  fixed:
  - **`/tasks` in the bot (3.3 s, the DB pool full)** ran the automatic
    checks and the per-task closes for the WHOLE plant before drawing the
    menu. `leader_auto.run` and `leader_close.autoclose_due` take
    `leader_ids`; `_lt_cmd` passes the caller's own leader profiles. The
    5-minute sweep still passes nothing and settles everybody.
  - **A plain /staff poll waited 9.3 s on Verifix.** `verifix_live.day_read`
    read the whole unit whenever anybody of it was missing from the stored
    read or the read had aged past the job's pace. Now it reads only the
    MISSING people (`_read_day(stamp=False)`: not a read of the unit, so
    `units[m]` is not stamped), and a read that is merely OLD is served as it
    stands and re-read in the background (`_refresh_later`, two threads, once
    per unit-day at a time). The whole unit is read while somebody waits only
    on a press, a close, or a day nothing is stored for.
  - **«Mening o'rnim» (4.8 s) waited for the pool's first build.** It is
    built ~45 s after the process starts (`leaders.warm_standing`, from the
    lifespan) and a stored pool answers for 3 h while a new one is made.
- **The eleventh (9 Oct, 14:55) was the MACHINE, not this server**: one
  15.9 s freeze with the host at 0% idle and load 46, this process granted
  2.4 s of CPU in 18 s and +407 major page faults — other programs on the box
  had every CPU and pushed our pages out (the verdict read it as swap). Nothing
  in the report could say WHO, so a freeze now reads the host's process list
  (`perf_watch._procs`, `/proc/<pid>/stat` of every process this user may
  read) 1 s in and again at its end: `_host_top` groups the CPU used in
  between by command («postgres ×38 21.4 s 3.1 GB · node ×3 9.0 s · this
  server 2.4 s»), printed as «on the host:» in the log and the DM, beside the
  host's free memory and swap (`/proc/meminfo`). The verdict says «the machine
  was full — N% idle, load L on C CPUs; this process got X s of CPU — most of
  it «name»» whenever the host was ≤ 10% idle and this process got under a
  quarter of the time, ahead of the swap reading. Not fixed: the cause — the
  next report names it.
- **The twelfth (10 Oct, 13:04) was the machine again, and the list read
  nothing**: «CPU over the last 0 s». On a full machine the watcher thread is
  starved with everybody else, so it NOTICED the freeze only at its end and
  read the «before» list then. The list is now read while the loop beats
  (`_pbase`, every `_PROCS_EVERY_S` 5 s, less often when one read costs more
  than 1% of a CPU — ~20 µs a process) and differenced at the freeze's end,
  so it covers the whole freeze. Each group names the user its busiest
  processes run as and the script they run («node ×4 (user:
  site/dist/server.js)» — `_who`, never an argument past the script). Beside
  it: the host's CPU split between programs and the kernel, its memory
  traffic over the freeze (`/proc/vmstat`: pages swapped in/out, reclaim and
  compaction stalls, OOM kills — `_vmstat`, in every baseline) and Linux
  pressure-stall figures for the last 10 s (`/proc/pressure`, `_psi`); a
  machine short of MEMORY rather than CPU is named so in the verdict
  («memory was short — …»). Same report: `/api/leaders` for a reader who sees
  one unit read the whole plant's verdict history twice (`stats_by_uid`,
  `rejected_by_uid` — 30–50% of it); both take `uids` now and read only the
  verdicts of the rows on screen (`leader_ai._refs_of`, `uid_map`'s rule
  read backwards). A «see all» build reads as before; the day report reads
  its one row's. And a day close of a finished shift waited
  11.7 s on Verifix — see `close_fresh_s` above.
- **The thirteenth (12 Oct, a leader's phone) was the CONNECTION after the
  app had been in the background, and the report could not say so**: four
  requests of one window stuck 9.5–13.6 s with 12–16 ms of server time each,
  the page's code 16.8 s, nothing slow on the server — the browser sending on
  a connection that had died while the app was away, waiting ~10 s for its
  PING (Chrome's hung-connection timeout) before opening a new one, then
  everything going through at once. Hedging cannot help there (the second
  copy rides the same dead connection) and nothing on the server can. Three
  additions so the next one names itself: the client sends the BROWSER's own
  phases per request (`rt`: held before sending · connecting · first byte ·
  download, size, h2/h3 — off PerformanceResourceTiming, matched by path and
  start instant; the timing buffer is widened to 600 and cleared when full,
  or a tab an hour old records nothing), the page chunks a «page» wait was
  waiting on (`chunks` — axios never sees them), and how long the app had
  been in the background before the wait and how long back (`vis`, counting
  Telegram's `deactivated` / `activated` as away too, which also stops the
  loader's visible-time clock). The verdict gains a cause, `connection` (two
  or more requests each lost ≥ 1.5 s on the way with the server under 40 % of
  it — the WAY was stuck, where `network` is one request lost among others
  that came back), names the dominant phase («the browser HELD it 12.9 s
  before it was sent — no usable connection»), and prints the away line; a
  connection stall's fingerprint names no endpoint, so one phone's flaky 4G
  is one DM an hour. Not built: preloading the pages a role can open right
  after boot, which would show the page frame instead of the logo while the
  connection recovers — data on 4G at every open, the operator's call.
- **The fourteenth (12 Oct, 15:35) was `/api/leaders` again, four times at
  7–9 s — one of them ALONE on the server** (DB 2/15, 1 in flight): the build
  itself, not contention. The pieces named (entries, media ids, the task
  dicts, the verdict aggregate, the sheet rows' ORM load, the 20 MB encode)
  are the build, and shaving them had changed nothing a viewer could feel.
  Fixed by not rebuilding: the register is KEPT between requests and served
  while its inputs are unchanged — see «The /leaders register is KEPT».
- **The fifteenth (12 Oct 16:51 → 13 Oct 09:00) had no freeze over 1.7 s and
  four paths slow on their own**, all fixed:
  - **The day close (×11, 9.1 s median, 86% waiting on Verifix)** still read
    Verifix on almost every press: its 90 s bar raced the minute job's own
    pass. It now closes on the job's stored read and reads Verifix only when
    that read would refuse it — see «/staff reads TODAY live».
  - **`/api/leaders` (×10, 5.8 s)** was the supervisors' and leaders' own
    scoped builds, which the 12 Oct keep did not cover; they are kept per
    scope now — see «The /leaders register is KEPT».
  - **`/api/shift-report` (×13, 3.9 s)** is served while rebuilt behind the
    viewer — see «The shift report».
  - **A camera shot (`POST /api/leader-proof/photo`, ×14, 3.7 s)** waited for
    the archive-channel upload (`_relay`, 52% — it stays: the row stores the
    file_id it returns) AND for the bot's prompt redraw, a second Telegram
    round trip. The redraw (`_nudge_bot`, `_nudge_late_bot`) now runs after
    the answer (`tg_later`, its own session, in shot order).
- **The sixteenth (17 Oct, 16:04–17:04) was `/api/leaders` ×17 at a 6.1 s
  median, with no deploy in the window** — the kept register was rebuilt
  almost every time it was asked. Two reasons, both fixed (see «The /leaders
  register is KEPT»): every Telegram app open sends a sign-in carrying the old
  token, which counted as a WRITE, so that person's next Monitoring load always
  waited for a build — even one identical to the kept one; and the fingerprint
  counted every AI verdict, the ones on still-open days included, so during a
  shift it had nearly always «changed». An unchanged fingerprint now serves
  everybody, a sign-in is not a write, open-day verdicts are out of the
  fingerprint, a changed build is served 10 min (not 3) while rebuilt behind
  the viewer, and a wait names its reason on the DM. Also from that DM: an
  objection ruling (`POST /api/leaders/disputes/{id}/decide`, 3.2 s, 57% in
  Telegram) sends its cards, the three parties' notices and the corrected
  report after the answer (`_dispute_after_later`, `tg_later`; skipped when
  the row's status moved meanwhile); and a rich bot message (`broadcast._tg_api`,
  a fifth of a 5.7 s update in `ssl.do_handshake`) keeps one connection to
  Telegram per thread. Not touched: `/api/arc-legacy/stats` (7.2 s once, its
  own SQL) and `/api/heatmap` (3.1 s once).
- **The seventeenth (19 Oct, 12:49) was the register's own rebuild**: one
  3.4 s freeze, «one thread used the CPU the whole time — «leader-register»
  (2.0 s)», GC 1.2 s of it. A build allocates a few hundred thousand objects
  and the collector walked them all, holding the GIL; then a one-shot
  `json.dumps` of the whole register and, per request, a 20 MB string join and
  encode held it again. Fixed in the build (see «The /leaders register is
  KEPT»: GC paused, encoded and sent as pieces, warmed after boot — the cold
  `/api/leaders` of the same DM, 7.4 s «none kept yet», was the first load
  after a deploy). Same DM, `/api/leader-ai/queue` ×2 at 4.2 s: its count pass
  built up to 12,000 ORM objects (`_sheet_scope`, `_project` and the identity
  map were most of it) and asked `one_process` two or three queries per task-3
  card. It reads COLUMNS now (a Row answers the same attribute names; the page
  slice still re-reads its rows whole), and `_one_process` reads every row's
  day cell in one query (`one_process.day_cells`) and answers each cell /
  (leader, day) once per request. Not touched: `/api/leaders-kpi` (4.3 s, small
  reads queued behind the freeze) and `/health` (3.1 s, the same).
- **The eighteenth (2 Nov, 15:11–15:20) named ONE function behind almost
  every slow line**: `zagruzka_source:wc_labor › _labor_inputs` under
  /api/heatmap, /api/downtime/bubbles, /api/workers/headcount and the 59 s
  /api/reports. The trudoyomkost was recomputed from the rows on EVERY
  request, for every unit and day of the range — and since 2026-10-26 every
  reader of a typed pin ran it too (`typed_pins` keeps only planned work
  centres), so a page paid it two to eight times. Fixed by keeping it — see
  «The trudoyomkost is KEPT between requests». Same DM: /api/quality spent
  half its time folding every record's PLACE (`name_map._place_key`, a
  transliteration per record) to test one exclusion; it folds a place now
  only for a brigadir an exclusion names, and memoises the fold. The next DM
  (15:43, still the old code) added: FILING an objection took 6.0 s waiting
  on Telegram (the brigadir's card, a rich message retried as plain, each
  recipient's menu button) — a ruling already sent after its answer, a filing
  did not; it does now (`_dispute_filed_later`, `tg_later`). And two pure
  helpers per-cell readers call thousands of times a request are memoised:
  `wc_group._get` asks `isinstance(…, Mapping)` once per TYPE (the ABC check
  was 9% of a heatmap), `idle_intervals.to_min` once per "HH:MM" string.
- Not built: an admin page over the ledger (it is memory only, per process),
  and any automatic retry of a hung request beyond those four (axios still has
  no timeout; the reload button is the way out).

## A slow app: the route first, then the bundle, then the database (2026-10-23)

The operator's report of 23 Oct: «after the last updates the app is too slow
or does not work at all» — the full-screen loader with «Server javobi
kutilmoqda». Three different things look exactly like that, and one minute of
measuring tells them apart:

- **Server**: `X-Server-Ms` (time the app spent) and `X-Server-Stall-Ms`
  (longest freeze of the last minute) are on every /api answer, even a 401
  (`curl -D - https://production.safiacorporate.uz/api/version`). On 23 Oct
  evening they read 4–6 ms and 0: the server was fine.
- **Route**: the same request straight to the origin, `curl --resolve
  production.safiacorporate.uz:443:185.74.5.198 …`, answered in 0.12 s; through
  Cloudflare it took 1.4–16.7 s and downloads ran at 9–30 KB/s. Cloudflare
  serves Uzbekistan from Warsaw (`/cdn-cgi/trace` → `colo=WAW`) and the zone
  still advertises ECH, so every request crosses the international gateway
  twice (memory `cloudflare-ech-connection-resets`, diagnosed 14 Aug). **The
  cure is not in this repo**: in the Cloudflare dashboard switch the
  `production` DNS record to «DNS only», or at least turn ECH off. Checked for
  the switch: the origin's own Let's Encrypt certificate (valid to 1 Jan 2027,
  chain to ISRG Root X1), ACME over port 80, the Telegram webhook (secret
  token, no IP rule) and the Android app all keep working; only Cloudflare's
  DDoS/WAF and edge cache are lost.
- **Bundle**: what a phone must download after each deploy.

What was fixed, and the rule each one now is:

- **A deploy renames only what changed** (v4.324.1). The version and build
  time travel in `<meta name="safia-build" data-version data-built>` in
  index.html (vite.config.js `injectBuildMeta`); `utils/version.js` reads the
  tag. Compiled into a shared chunk they renamed 227 of 231 files on EVERY
  deploy, backend-only ones included — a chunk's name hashes the names of the
  chunks it imports — and every phone re-downloaded ~1.7 MB brotli through the
  slow route after each of ~20 deploys a day. Two builds of the same sources
  now rename 0 files. `guardStampOutOfChunks` fails the build if the stamp ever
  reaches a JS chunk again: **never bring back a `define` (or an import of
  build.json) for a value that changes every build.** A translation or a shared
  boot-module edit still cascades through most chunks.
- **…and the Tailwind SOURCE LIST is named, not auto-detected** (v4.330.2).
  `frontend/src/index.css` opens `@import "tailwindcss" source(none);` followed
  by one `@source` per root — `tailwind.config.js`'s own `content` list, which
  Tailwind 4 does not read without `@config`. **A new source root is a line
  HERE**, or its classes are silently missing. Why: a cloud session symlinks
  `frontend/node_modules` in from `/opt`, so it resolves outside the project and
  neither `.gitignore` (root says `node_modules`, no slash, for exactly this;
  `frontend/.gitignore` still says `node_modules/`, which matches directories
  only) nor `@source not "../node_modules"` stopped the scanner walking it. It
  compiled four utilities off dependency FILE NAMES — `.columns-3` from
  lucide's `dynamicIconImports.d.ts`, `.drop-shadow` from lightningcss,
  `.hidden\!`, `.filter\!` — so a cloud-built `index.css` differed from a
  laptop's by ~686 bytes, and since every chunk imports the entry (whose
  `__vite__mapDeps` lists every chunk's name) that one leaf renamed all 231
  asset files on every cloud deploy. The one defeat v4.324.1 could not see.
  **The oracle for any change here is byte equality**: build, and compare
  `dist/assets/index-*.css` with production's — identical content gives an
  identical hash, and the whole `dist` diff collapses to the four stamp files
  (`index.html`, `build.json`, `build-files.json`, `sw.js`), which is what a
  backend-only deploy must look like.
- **JS leaves the origin compressed** (v4.324.1). main.py registers
  `application/javascript` for .js/.mjs: Python ≥3.12 says `text/javascript`,
  which the origin nginx's `gzip_types` does not name, so every JS file —
  Cloudflare's cache misses included — went out raw (2.1 MB instead of
  ~0.55 MB).
- **A request's statements are bounded at 90 s** (`database.py`,
  `REQUEST_STATEMENT_TIMEOUT_MS`). Every session from `get_db` runs each
  transaction under `SET LOCAL statement_timeout`; a cancelled statement
  (57014) is logged `[STATEMENT-TIMEOUT]` at the driver and answered as a JSON
  503 `query_timeout` (main.py), without X-Safia-Restarting so the client does
  not retry it. On 23 Oct one «Brigadirlar reytingi» query ran ~50 minutes
  after Cloudflare had dropped the browser, and the boots queued behind its
  locks stalled production. Not bounded by construction: scheduler jobs, boot
  steps, db-dump / restore (raw connections), the bot, and any thread with a
  `SessionLocal()` of its own. A request path that truly needs longer calls
  `database.allow_long(db, ms)` — never a bare 0 without a reason.
- **A dead client's queries end** (`database.py`, a `connect` listener): every
  pooled connection sets `client_connection_check_interval = '5s'`, so a query
  or lock wait of a worker the supervisor killed (a retiring worker past its
  60 s grace, an abandoned boot) ends within seconds instead of running on —
  the 23 Oct orphan ALTERs waited ~45 minutes.
- **One build per key, always** (`shared_build.py`). A request that waited
  WAIT_S, or whose second build in a row failed, answers a 503 «still being
  calculated» instead of starting an unregistered build; a build that fails
  once is started again, registered and shared. Before, a waiter that timed
  out built its own copy nobody could share, and the client's 524 retries fed
  it.
- **The brigadir ranking builds one at a time** (`routers/leaderboard.py`
  `_ONE_BUILD`, `gc_pause`): three grains opened together queued instead of
  running side by side; a request waits without a DB connection and gives up
  with a 503 after 90 s.
- **Deferred startup steps bound their lock waits** — see the boot_ddl bullet
  under «Zero-downtime on ONE port».
- **The deploy job runs no heavy report on a push**. Four temporary
  deploy-log reports (cell 9123, live exchanges, everybody-left notices, ARC
  attachment URLs) ran on every deploy — ~2.5 minutes of production DB and CPU
  work right after each swap and ~30 MB of log — and were removed with their
  scripts once answered; the Tarkib probe runs on «Run workflow» only
  (`if: github.event_name == 'workflow_dispatch'`). **A new deploy-log report
  goes behind that same `if`** unless it is cheap (the two session snapshots
  and the orphan cleanup, <1 s, stay until deploys have run clean for a while).

**Fixed 2026-10-24**: deploy.sh's 180 s readiness wait against the
supervisor's 600 s. A boot that outlived the deploy's wait was left running
across the rollback, the next deploy's HUP was dropped (`swap_busy`), and that
deploy reported success while serving the abandoned worker — built from two
commits' files. deploy.sh now waits for a boot in flight before the checkout
moves, follows only the gen its own HUP spawned, and kills an unfinished boot
before rolling back (the rules: «A deploy is `kill -HUP`» under «Zero-downtime
on ONE port»).

Known and left (each is a follow-up of its own): `sync_leader_ai_dates` walks
the whole verdict corpus on every boot; every backend deploy empties every
in-process cache, so the first viewer of each heavy page after a deploy pays a
full build — fewer deploys during the working day is the cheapest fix of all.

## Zero-downtime on ONE port — the supervisor (`app/supervisor.py`, 2026-10-18)

From **2026-10-18** the unit's main process is a SUPERVISOR that holds
`127.0.0.1:8030` and never goes away; the app runs as its child WORKER. IT
declined the blue-green root step and a second port (the operator's report:
«around 30 apps run on that server», our problem «unprofessional and easily
solvable»), so the whole of what nginx did for us in that design moved into
our own process, where nobody's cooperation is needed. The Cloudflare 502
users saw at every backend deploy — and at every restart nobody deployed — is
gone with it, in Telegram, the browser and the Android app alike.

- **How it starts.** The unit file is IT's and unchanged: systemd still runs
  `uvicorn app.main:app …`. The first lines of `app/main.py` call
  `supervisor.maybe_exec_supervisor()`: under systemd (`INVOCATION_ID` set)
  the uvicorn CLI that imported us `os.execv`s itself into
  `python -m app.supervisor <the same args>` — same PID, so systemd's MainPID
  IS the supervisor. It binds the socket (SO_REUSEADDR, backlog 2048) and
  spawns the worker, `python -m app.supervisor --worker --fd 3`, which runs
  `uvicorn.Server.run(sockets=[fd 3])` — the ordinary app, `--proxy-headers`
  and the rest passed through, `backend/.env` laid over the environment at
  EVERY spawn, so a key written there later (`deploy/sync-env.sh`, startup's
  own writers) reaches the next worker without a `systemctl restart`. The
  lifespan's LAST line, `signal_ready()`, writes one word down a pipe the
  supervisor handed it (`SAFIA_READY_FD`) — that is the whole readiness
  protocol. Off systemd nothing happens (a laptop, a cloud session,
  `--reload`); `SAFIA_SUPERVISE=1` forces it, `SAFIA_SUPERVISE=0` in `.env`
  plus one restart is the opt-out back to plain uvicorn.
- **A deploy is `kill -HUP <MainPID>`** — `deploy/deploy.sh`, the same user,
  no sudo. The supervisor spawns a worker on the code now in the checkout and
  only once that worker says ready retires the old one (SIGTERM, which
  uvicorn takes as «finish the open requests, then exit»; killed after 60 s).
  Connections queue in the kernel on a socket that is never closed, so there
  is NO gap: measured on the cloud stack, 55 of 55 health checks answered 200
  across a swap. A new worker that exits before it is ready is DROPPED and
  the old one keeps serving; deploy.sh reads
  `backend/data/supervisor/status.json` to know, rolls the checkout back and
  fails the job. **It counts only ITS OWN worker** (from 2026-10-24):
  - **Before the checkout moves it waits** (≤ `HEALTH_TIMEOUT`, 180 s) for a
    boot already in flight — a crash respawn, or a worker an earlier deploy
    gave up on. The supervisor drops a HUP while a worker boots
    (`swap_busy`), and a boot reads its files from the checkout. Still
    booting → the deploy fails with nothing changed. A full restart skips it.
  - **After `kill -HUP` it waits up to 15 s** for `last_swap.requested_at` to
    move and takes `WANT_GEN = last_swap.gen`. A HUP not taken while a crash
    respawn is booting (or already serving) on the NEW commit adopts that
    worker; any other boot is a failure.
  - **Success** = `state == ready`, `worker.gen == WANT_GEN` and
    `worker.commit == NEW[:12]`. **Failure** = neither `booting.gen` nor
    `worker.gen` is `WANT_GEN`, the unit down, or the timeout.
  - **On any failure it SIGKILLs whatever is BOOTING before `git reset --hard
    PREV`** — never the serving worker: both pids are re-read, and the pid's
    `/proc/PID/cmdline` must say `app.supervisor --worker`. Then it gets a
    worker onto PREV (one HUP when none serves on it; a boot started before
    the reset is ended too) and prints «back on PREV» only when the serving
    worker's commit IS PREV — else it names what is serving.
  - deploy.sh has no tests. A change to it is proved first on a local rig: the
    real `supervisor.py` around a stub app whose boot length and a
    late-imported module come from the commit, so a worker built from two
    commits shows itself. Scenarios: an abandoned slow boot then a second
    deploy (also with the OLD script abandoning it), and the serving worker
    crashing right at the checkout. All three ended serving the deploy's own
    commit on 2026-10-24; the unpatched script reproduced the bug.

  Only a change to
  `app/supervisor.py` itself still takes the old `systemctl restart` (a running
  supervisor cannot swap itself), and so did the first deploy, whose main
  process was still plain uvicorn. deploy.sh prefers blue-green if its
  template unit ever exists, then this, then the plain restart. `kill -USR1`
  forces a status write; the file is the one place `systemctl status` cannot
  reach: which worker serves, since when, its RSS, the last swap's outcome.
- **While no worker is ready the supervisor answers for it** — the first
  boot, a boot after a crash, a swap done stop-then-start: the page files
  from `frontend/dist` (index.html for every page path, `no-store`;
  `/assets/*` immutable), a JSON 503 with `X-Safia-Restarting: 1` on the
  backend paths (nginx's `$safia_backend_only` map, mirrored in
  `backend_only()` — keep the two in step). That is exactly what
  `serverRestart.js` already waits out behind «Server yangilanmoqda», and
  what the service worker reads as the shell. Never a 502, never Cloudflare's
  page. The request body is drained first (nginx streams uploads,
  `proxy_request_buffering off`, and closing on one is ITS 502), and a path
  never leaves `dist` (`realpath`). The fallback page carries no CSP — one
  load, then the worker's own page takes over.
- **A worker that dies is replaced** — at once when it had lived ≥ 90 s,
  with a backoff of 5 → 10 → 20 → 40 → 60 s between quick deaths — behind
  the fallback; a worker not ready after 600 s is killed and retried. The
  supervisor itself is stdlib only, imports nothing of the app, ~16 MB (a bug
  in it is the outage it exists to prevent); if IT dies, systemd restarts the
  unit (`Restart=on-failure`) exactly as before.
- **Memory.** An overlapping swap holds two workers for one boot. Short of
  room (`MemAvailable` below the live worker's RSS + 200 MB) the swap is
  stop-then-start behind the fallback: a boot-long «Server yangilanmoqda»,
  never a 502, and never the OOM killer invited onto a box that already
  swaps. The jobs lock (`app/scheduler.py`) and the ADDITIVE-migration rule
  of the blue-green section apply unchanged: two workers share the database
  for the length of a boot.
- **It records how workers die, and the boot report tells the chat.**
  `backend/data/supervisor/events.jsonl` (append-only, rotated at 2 MB, `seq`
  climbing across restarts) holds every spawn, readiness (boot seconds, how
  long the fallback answered and for how many requests), retirement, failed
  start and DEATH — exit code or signal, uptime, the worker's RSS at its last
  sample and `/proc/meminfo` at that moment. `services/boot_report.py` runs a
  few seconds after every worker's lifespan: it reads the events since its
  cursor and DMs the support chat (`perf_watch`'s recipients) when the boot was
  anything but an ordinary deploy swap — a worker that DIED, with the verdict
  (SIGKILL on a host with under 300 MB free or half its swap used = the OOM
  killer; SIGSEGV / SIGBUS / SIGABRT = a native library of ours; exit 3 = the
  app's startup failed; a Python exit code = our code), a failed start, the
  whole unit restarted with the SAME code (systemd, a host reboot or a
  `systemctl restart` — never a deploy), the one full restart a supervisor.py
  change costs. An ordinary swap is QUIET: three to twenty a day would bury
  the line that matters. Without a supervisor (plain uvicorn) it sends only
  when the commit equals the previous boot's — the same code booting again is
  a restart nobody deployed. `last-boot.json` and `boot-report.cursor` beside
  the events are its memory; `/health` carries `started_at`, `pid`,
  `supervised` and `worker_gen`, so a swapped-in worker can be told from the
  old one. The stall report no longer calls every restart «a deploy».
- **The boot itself is TWO phases (`services/boot_steps.py`, the same day,
  the operator: «move the heavy startup work off the boot path too»).** The
  lifespan calls `run(step)` for what a request needs — `create_all`, every
  `add_*` / `migrate_*` column, index and table, the seeds a first request
  resolves against, `ensure_internal_api_key`, the scheduler and its job
  registrations, `_warm_import_app` (the lazy-import hazard of a swap still
  holds), the link and span caches — and `later(step)` for everything else,
  which runs on a thread, in the same order as before, once `signal_ready()`
  has gone out: the flag-guarded one-shots, the backfills, every `report_*`
  and DM, the Telegram webhook call, `sync_leader_ai_dates` (the corpus
  walk), the leader-rule passes. 119 steps before readiness, 104 after, on
  the day it shipped. **The rule for a new startup step**: a column, a table,
  anything a request could hit → `run`; a data fix, a seed behind a flag, a
  report, a DM, a sync → `later`. A `run` step that raises still fails the
  boot (uvicorn exits 3, deploy.sh rolls back); a `later` step that raises is
  recorded, the rest still run, and the boot report names it to the support
  chat — never the site down over a report that could not be sent. Every
  step is timed: a step over 0.5 s prints its time, `[startup] ready for
  requests after N s` and `deferred startup work done in M s (slowest: …)`
  print the totals, and the boot report carries both. `perf_watch` starts
  only after the deferred work, handed back to the loop with
  `call_soon_threadsafe` (it records the loop's thread id), so the walks on
  the deferred thread are never read as freezes; shutdown waits up to 45 s
  for the thread rather than dying mid-step. Consequences: a swap's memory
  overlap and a crash's «Server yangilanmoqda» last the schema phase only;
  the first requests after a boot share the CPU with the deferred walks (a
  slow first minute, where it used to be no minute at all); and a one-shot's
  DM now lands a few seconds after the deploy rather than before the first
  request. `passenger_wsgi.py` keeps its one-phase mirror — it never runs.
- **A booting worker never queues the serving one behind its DDL**
  (`services/boot_ddl.py`, 2026-10-23). Postgres takes a migration's lock
  BEFORE it checks whether there is anything to do: `ADD COLUMN IF NOT
  EXISTS` waits for ACCESS EXCLUSIVE, `CREATE INDEX IF NOT EXISTS` for SHARE.
  At the 17:00 shift change of 23 Oct one slow transaction made those waits
  long, the serving worker's queries queued behind them until its pool was
  full, and four deploys in a row ended «the new worker never got ready».
  From 2026-10-23 (evening) the DEFERRED phase bounds every statement's lock
  wait too (`guarded` arms `all_dml` in both phases): a later() step runs
  inside the worker that is already serving, and its UPDATE waiting on a row a
  request holds would keep the rows it already changed — and a pool
  connection — from everybody behind it. Such a step now fails after 5 s, is
  recorded as failed and runs again at the next boot, so a one-shot must claim
  its flag before it DMs.
  Every step of both phases now runs under a guard on its own thread (other
  threads are never touched): a statement whose target is already as asked —
  ADD / DROP COLUMN, SET / DROP NOT NULL, SET / DROP DEFAULT, DROP CONSTRAINT,
  CREATE INDEX, DROP INDEX / TABLE, CREATE TABLE, all with IF [NOT] EXISTS —
  is read off the catalogue and not sent (`SELECT 1` instead); any other DDL
  waits at most `LOCK_TIMEOUT` (5 s) for its lock, set for that statement and
  put back after it. In the boot phase EVERY statement's lock wait is bounded
  the same way (`SET LOCAL` as its transaction begins): a boot UPDATE waiting
  on a row the serving worker held wedged it — the serving worker's requests
  queued behind the rows the step had already changed until its pool was
  full (the «QueuePool limit … reached» tracebacks of those deploys were the
  SERVING worker's). A boot step whose DDL timed out is run again (`TRIES` 6,
  ~1 minute), even when the step swallowed the error; still busy → the boot
  fails and the old worker keeps serving. A deferred step is not retried (it
  may DM); a timeout there is its recorded failure. The ready line counts it:
  `DDL: N already in place, M ran, K lock timeouts` — an ordinary boot sends
  NO locking DDL at all (246 statements in place, 0 run, on the day it
  shipped), and every statement that does run is printed. A new migration
  written in one of those shapes needs nothing; one in any other shape runs
  under the timeout on every boot, so give it its own existence check.
  **Never `DROP INDEX IF EXISTS x` followed by `CREATE … INDEX x` on every
  boot** — the drop is not a no-op while x exists. `_finish_pp_line_key` did
  exactly that to `pp_line_daily`'s unique key on every boot until this day
  (an ACCESS EXCLUSIVE lock on the «Zagruzka fayli» table, then a rebuild
  inside it), and the guard's first deploy named it; it now rebuilds the key
  only when its columns are wrong. The same goes for a boot step's DML: one
  that touches rows the serving worker may hold takes `FOR UPDATE SKIP
  LOCKED` (`migrate_factories`' attach-the-unassigned UPDATE did not, and its
  row wait failed the second deploy). When a step gives up, its error names
  the statement and every session in a transaction older than 4 s
  (`boot_ddl.holders`) — the deploy log's journal tail shows who held it.
  **What actually stalled production that day (12:15–13:10 UTC)**: a worker
  the supervisor KILLS mid-boot leaves its Postgres backend alive while that
  backend waits on a lock (the server notices the client is gone only once it
  gets the lock). Two `ALTER TABLE managers` of the 12:07 / 12:20 boots stayed
  queued for ~45 minutes behind two ~50-minute «Brigadirlar reytingi» builds
  (`/workers`' headcount over the board's whole history in one transaction),
  and every `managers` query of the serving worker queued behind them. The
  guard bounds a boot statement's wait at 5 s, so such an orphan now lives
  seconds. Two TEMPORARY deploy steps came with it, both read-only but the
  second: `deploy/diag_db_sessions.py` (the sessions, open transactions and
  heavy locks before and after the swap, literals masked) and
  `deploy/end_orphan_boot_sessions.py` (ends a session waiting on a lock for
  more than 2 minutes while running DDL or the boot's `managers` attach —
  serving workers never run DDL). Remove both with their steps once deploys
  run clean. **Fixed 2026-10-24**: `deploy.sh` waited 180 s for readiness
  while the supervisor waits 600 s, so a SIGHUP sent during a slow swap was
  ignored and that deploy «never got ready» without booting at all. It now
  waits for a boot in flight before the checkout moves and kills its own
  unfinished boot before rolling back (see «A deploy is `kill -HUP`» above).
- **Why.** 27 backend deploys between 10 and 17 October, each a Cloudflare 502
  for the length of a boot — and a 502 at 13:31 on 14 October with no deploy
  near it: the process dying on its own, on a shared box the stall reports
  had shown starved of CPU and memory. IT's reading («the Telegram mini app
  sends a wrong request») was wrong — the mini app's requests are a browser's
  plus one initData header, and the web merely hides a navigation 502 behind
  the service worker — but the restarts were ours to make harmless, and the
  cause of the unexplained one is what the boot report now names.
- Tested on the cloud stack before it shipped: the exec guard → the fallback
  during the boot (503 + the mark on /api, 200 index.html on pages, immutable
  assets, a POST with a body, no traversal) → ready → a HUP swap with zero
  non-200 answers → `kill -9` → fallback → respawn → SIGTERM → a clean exit,
  with the events and the report text as described.

## Zero-downtime deploys (blue-green, v4.196.0)

**Superseded on 2026-10-18** — IT declined the root step and a second port, so
the supervisor above does this on ONE port with no root. Everything in this
section stays as written: the files are in the repo and `deploy.sh` still
prefers blue-green if its template unit ever exists; the nginx fallback and
the additive-migration rule are now the supervisor's too.

From **2026-10-01** (the operator's report: every backend deploy showed users
Cloudflare's «502 Bad gateway» page for as long as the app took to boot) a backend
deploy no longer leaves nothing answering. Everything is in the repo; **one
root step by IT switches it on** — `deploy/03-bluegreen-setup.sh` (`--check`
first, `--undo` to reverse), explained for them in `deploy/BLUEGREEN-IT.md`.
Until that step runs, deploys restart the single unit exactly as before.

- **Two copies, one at a time.** `deploy/safia-production@.service` is a
  template on ports 8030/8031. `deploy.sh` detects it (the template file exists
  AND sudo grants its argv). A restart then STARTS the idle copy, waits for
  `/health`, enables it, and only then stops and disables the old one. A new copy
  that never gets healthy is stopped and the old one keeps serving, so a failed
  deploy costs nothing. With no template, it does the old `systemctl restart`.
- **nginx lists both ports** (`deploy/production.safiacorporate.uz`). A down
  copy refuses the connection and the request goes to the other copy
  (`proxy_next_upstream error`, which never repeats a POST that reached a
  copy). **`max_fails=0` is load-bearing**: with nginx's default, the copy that
  had just come up was still marked dead while the old copy stopped, and
  requests got «no live upstreams». Tested against a local nginx before
  shipping.
- **If neither copy answers**, nginx answers itself (`@safia_offline`). Page
  files come from `frontend/dist`, and backend paths (`$safia_backend_only`:
  /api, /bot, /health, /docs, /admin/* except the SPA's /admin/upload) get a
  JSON 503. Both carry `X-Safia-Restarting: 1`. Never an HTML body on /api: the
  app reads that as the anti-bot page.
- **Background jobs fire in ONE copy** (`app/scheduler.py`). A Postgres advisory
  lock (`_JOBS_LOCK_KEY`) decides it. The copy without the lock starts its
  scheduler PAUSED, with every job registered, and resumes it when the old copy
  exits. Shutdown `invalidate()`s the lock's connection. A plain `close()` would
  return it to the pool still holding the lock. If the lock cannot be taken
  (no Postgres, a dead connection), the copy runs the jobs anyway, as before.
  `/health` reports `jobs`. Broadcast fan-out and the AI drain already had DB
  claims of their own.
- **The old copy keeps serving while the NEW files are on disk**, for as long
  as the new copy boots. So the lifespan ends with `_warm_import_app()`, which
  imports every `app.*` module up front, and no first-time lazy import can load
  a new file into the old process. Page files are read per request, which is
  harmless.
- **Startup migrations must be ADDITIVE from now on.** Old and new code share
  the database for a few seconds. Never drop or rename a column or table in the
  same release that stops using it.
- **The app waits a restart out instead of breaking**
  (`utils/serverRestart.js` is THE definition). A 502/503/520–523 that never
  reached the app is retried for any method. A 504/524 timeout is retried for
  reads only. Retries back off 1→5 s for up to 3 minutes, and
  `ServerRestartNotice` (in Layout) says «Server yangilanmoqda» meanwhile. The
  app's own JSON 503s are real answers and are never retried. Before this, an
  HTML 502 on /api was taken for the WebShield page and the tab reloaded itself
  4.5 s into every deploy. `isWebShieldResponse` now excludes restart answers.
  A lazy page chunk that fails during a restart waits for the server
  (`/build.json`) and is imported again before the stale-build reload is
  considered.
- Not solved here: an old tab whose build's chunks the deploy's `git reset`
  deleted (Part A of the 23 Sep «update later» spec, still not built).

## Seventeen finished one-shots deleted (2026-11-06)

The code audit found 19 dated one-time modules still imported at every boot
(~6,900 lines with their `startup.py` functions and entrypoint calls). The report
door (`ops.asked`, Burkhon) read their flags in `app_settings`: all `done` /
`sent`. Deleted, each with its `startup.py` functions and helpers, its calls in
`main.py` and `passenger_wsgi.py` and (where it had them) its test and data:
`assessment_seed_samples_oct31`, `assessment_seed_tb_oct31`,
`brigadir_change_oct24`, `brigadir_change_report_oct24`, `cell_day_fix_oct05`,
`leader_follow_repair_oct29`, `leader_merge_nov04`, `leader_photo_fix_oct12`,
`leader_rules_oct07`, `leader_task_examples_sep19` (and
`app/data/task_examples/`, its 12 photos), `live_copy_dedup_oct20` (and its
test), `live_exchange_repair_oct08`, `one_process_seed_oct10`,
`rules_cleanup_sep19`, `typed_restore_nov03`, `unit_merge_nov02`,
`verifix_roles_report_oct25`.

* **The flags and records stay in `app_settings`** — they are the history of
  what each did (and the reason none can run again). The sections of these docs
  that describe a deleted job are its record; where one says «delete the module
  once the flag reads done», it has been done.
* **Kept on purpose: `leader_rules_sep19` and `leader_rules_sep26`.** Both flag
  sets read done, but live code imports them — `proof_archive` derives its
  photo-requirement list from `leader_rules_sep19`, and the temporary
  `t11_proof_report` imports both — so they go with that report, not alone.
* **A module that a test imports cannot be deleted without its test** — the
  commit gate (`.claude/hooks/auto-commit.sh`) runs `backend/tests`, the
  Postgres-backed ones too whenever a local server answers (see CLAUDE.md,
  «The backend's unit tests run first»).
