# The «Lider nazorati» page (`/leaders`)

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## «Lider nazorati — admin» — an admin's reach over /leaders, for one person (`leaders.admin`, 2026-10-29)

The operator: «give admin like permissions to a guest. Only for leaders
monitoring.» Asked: every admin action on the page, the notices admins get, and
the four checklist admin destinations. ONE capability, `leaders.admin`
(`capabilities.CAP_LEADERS_ADMIN`), group «Lider nazorati» on the Permissions
tab, unscoped (an admin's reach is the whole plant). Switched on per PROFILE or
per ACCOUNT like any grant; it supersedes, for its holder, the «admin-only, not
grantable» notes in the sections on objections, late proofs, the AI review,
ltdaily, ltexclude and ltcutoff.

- **`capabilities.leaders_admin(db, payload)` is THE test** — admin, or the
  grant. Every leaders admin check asks it; never re-spell `role == "admin"` at
  a leaders call site. Endpoints that were `verify_admin` take
  `require_cap(CAP_LEADERS_ADMIN)` (`_LEADERS_ADMIN` in `leader_ai.py` and
  `leader_tasks.py`). `leaders_admin_account` is the bot-tap twin,
  `leaders_admin_ids` / `cap_holder_targets` who is told.
- **What it reaches**: the admin stage of objections and late proofs, their
  undo, writing and @mentioning in every appeal chat; filing an objection or a
  late-day as an admin does (filing IS the approval); the shift-1 late-day
  decision; the AI review tab and every reviewer control (queue, resolve,
  check-now, run, re-check, progress, cancel, retry, activity); the hand
  done/not-done override; reopen/empty on the Chek-list tab; the ranking tiers;
  a cutoff's reason and author on the roster; the whole register
  (`page_view_scope("leaders")` answers «all» — `_READS_PAGE_WHOLE`); and the
  admin destinations ltasks · ltdaily · ltexclude · ltcutoff (a capability's
  `tab` may now be a LIST; `capability_tabs` flattens it).
- **Told like an admin**: the admins' Telegram cards for objections, late proofs
  and late days (`extra_recipients`), every appeal-chat notice
  (`leader_appeal_chat.fanout` — a profile grant on the profile, an account
  grant on the account), and the bell's «Sizdan kutilmoqda» (admin-stage
  appeals, late days).
- **Deliberately NOT**: «Tarixni tozalash» (`/api/leader-ai/history/clear`,
  deletes verdicts — stays `verify_admin`, the button is drawn for real admins
  only); the bot's own admin screens (locked-task reopen in Telegram); every
  other admin page; and rule 5 holds — no authority over admin identities, no
  Permissions tab.
- Frontend: `CAP.LEADERS_ADMIN`; `Leaders.jsx`'s `isAdmin` is
  `role === "admin" || can(CAP.LEADERS_ADMIN)`; every other right on the
  report, the queues, the appeal chat and the Chek-list tab is the server's.

## «Lider nazorati» on a phone (`/leaders`, 2026-09-28)

The operator's customers reported the page was hard to read and use on a phone;
every tab was reworked against a Galaxy A16 (384 CSS px). The rules, so a later
change does not undo them:

- **No layout may run past the screen.** A below-lg grid needs `grid-cols-1`
  (`minmax(0,1fr)`): an implicit track sizes `auto` and grew to the width of
  nowrap `truncate` text — the Chek-list summary and rows ran off the right
  edge. `<main>` clips horizontally, so such a bug CUTS content silently.
- **Phones get lists, not wide tables.** The ranking is an `<ol>` below sm
  (name + brigadir, the ranked % with its tier chip, then delta · days ·
  the other metric); the eight-column table stays for sm+. The recent-reports
  list has no inner scroller below sm — whole cards are the tap target and
  «Yana 20 tasini ko'rsatish» reveals more (the count is keyed to the filter
  inputs, so a refetch never snaps it back).
- **Names on a phone lead with the SURNAME**: `twoWords` («Ortiqova
  Mohlaroyim») in the ranking and the KPI cards, `surnameInitial`
  («Ortiqova M.») in the calendar; desktop keeps `initialSurname`.
- **The day calendar fits a week exactly on a phone**: the name column takes
  what the days leave at 28px (124–170px), cells floor at 26px, headers print
  the day alone below 40px, and only a longer window scrolls.
- KPI cards: labels wrap to two lines, a name value is one fixed size on two
  lines with its % badge below it (FitText stays for sm+), values sit on the
  card floor so a row lines up; a brigadir's lone third card spans the row.
- The Chek-list empty state carries the leader picker itself — on a phone the
  «Lider» filter lives in the sheet.
- `SegmentedToggle` keeps the selected segment clear of its 32px fade and
  re-reveals it when a label grows (count badges, font swap). A `Button` is
  hidden with `max-lg:hidden`, never `hidden lg:inline-flex` — its own
  `inline-flex` outranks `hidden`. Pager buttons are 36px below sm.

## The Monitoring ranking wears profile photos (2026-11-02)

The operator: «Show the profile photos of the leaders and brigadirs on this
rating». The podium cards, the phone list and the desktop table of the
/leaders standings draw each person's PROFILE PHOTO (`ProfileAvatar`), and the
tinted initials they always drew where there is none — also while it loads
(`ProfileAvatar`'s new `fallback` prop, so a row never changes size).

- The board is keyed by the NAME a row prints, so `photoOf` in `Leaders.jsx`
  resolves it: a leader through the `leader_id` their rows and roster entry
  carry, a brigadir through the unit's id (`supervisor:<manager_id>`, off the
  roster and the bot rows). A name that resolves to two profiles (namesakes)
  keeps its initials rather than wearing somebody else's face.
- Versions come from ONE small read, `GET /api/profiles/photo-versions?roles=
  leader,supervisor` (profile key → version, only profiles that HAVE a photo),
  open to any approved session like the bytes behind it. Nothing was added to
  the kept register (`leader_register`), whose fingerprint does not watch
  photos — a photo set today shows within the read's 5-minute staleTime.

## Empty days count NOWHERE on `/leaders` (`countCap`)

From **2026-10-02** (the operator: «empty days shouldn't affect any
calculation — 10 days picked, one empty, average over 9») every number on the
Monitoring tab is scored over the picked period CUT at `countCap` in
`Leaders.jsx`: the earlier of `dataMax` (the newest day the register holds
anything for) and `lastFinishedDay()` (a day is over at 09:00 the next morning,
plant clock — so today never counts while it runs). The calendar still shows
the whole picked period (`calWin`), hatched after the cap, and its subtitle
names how many days were counted. KPI cards, ranking, task chart, trend,
sparks and «Mening o'rnim» all read `scoreWin` (the cut window). A missed day
inside it (red) is still 0. **The Δ chip compares with the whole previous period
of the PICKED length** (`calWin.days`), scored over its own days. The
server-side standing pool is given the cut window, so it agrees.

## The /leaders register is KEPT between requests (`leader_register`, 2026-10-12)

`GET /api/leaders` is the whole checklist history in one answer — ~20 MB,
built from twenty-one tables — and until 2026-10-12 it was rebuilt from
scratch on EVERY request: the page refetches it on every window focus, so an
admin tabbing back to Monitoring paid 7–9 s on production, and the shared
flight (one build for everybody asking at once) helped only the requests that
overlapped. It was the first line of every «Server was slow» DM for a week.
`services/leader_register.py` is THE rule; `routers/leaders.py` keeps only
what a build IS (`_build_shared`) and how a viewer's answer is cut from it
(`_assemble`).

- **ONE build is kept — the unscoped one** — as BYTES (the `data` list already
  encoded; the dict behind it is two hundred thousand Python objects), with
  the roster, the two cutoff maps and `last_synced` beside it. Every viewer
  whose build is unscoped reads it: admin, shift-manager, top-manager, a
  «see all» grantee — the answer differs by the header and, for a non-admin,
  a cutoff's reason and author, which `_assemble` cuts per viewer (verified
  equal to a per-viewer build, parsed, for an admin and a shift-manager). A
  supervisor or a leader without «see all» — and a leader with it (`_la_hide`
  rewrites theirs) — gets their OWN scoped build, and from 2026-10-13 that is
  kept too: one slot per viewer scope (`get(..., key=…)`, the key = every
  payload field a scoped build reads, `routers/leaders._SCOPED_KEYS`, plus
  «see all» and `_la_hides`), the whole answer as bytes (`Build.body`), under
  the same four rules slot by slot; at most `MAX_SLOTS` (160) scopes and
  `MAX_SCOPED_BYTES` (120 MB) between them — a leader with «see all» keeps the
  whole platform (~20 MB) — the least recently asked dropped first, never the
  unscoped one. The 13 Oct DM
  named /api/leaders ×10 at a 5.8 s median, every one a scoped build. The
  fingerprint gained `telegram_user_roles`: which leader profiles a leader
  viewer holds (`identity`).
- **Each arm is `count`, `max(xmin)` AND `sum(xmin)`** (2026-11-06, the audit).
  `max` alone misses an update made by a transaction whose id is BELOW the
  table's current maximum: ids are handed out at a transaction's first write but
  commit in any order, and after the 32-bit counter wraps new writes carry small
  ids beside old rows near 4.29e9 — neither the count nor the max moves and the
  kept register is served as current. The sum moves on every one of them (the
  old id leaves it). `labor_kept._STAMP_SQL` already took it.
- **Served while nothing it read has changed — EXACT.** `fingerprint()` is- **Served while nothing it read has changed — EXACT.** `fingerprint()` is
  one query (~60 ms on a production-sized copy): per input table the row
  count and `max(xmin)`, the id of the last transaction that touched a row,
  which moves on every committed insert, update and delete (a freeze moves
  a hint bit, never the value). The per-day tables — days, entries, media,
  camera shots, auto checks and (from 2026-10-17) the AI VERDICTS — are
  counted over CLOSED days only: a leader answering a task on an open day, or
  the reviewer judging it, changes nothing the register shows. The verdicts
  arm leaves out every `bot:<entry>` ref of an open day's entries (a hashed
  `NOT IN`); counted whole it moved every few minutes all shift, because a
  per-task unit's tasks are reviewed as each one closes. The fingerprint is
  taken BEFORE a build reads anything, so a change landing mid-build reads as
  a change at the next request. **An unchanged fingerprint serves EVERY viewer,
  one who wrote something included** — the build is what the database would
  produce now. **A table added to the build is an arm added to `_ARMS`**, or
  a kept build goes stale on exactly that table.
- **A young kept build is served while a new one is made** (`STALE_MAX_S`,
  10 min from 2026-10-17 — the shift report's window; it was 3 min, which a
  brigadir or leader looking in every quarter of an hour, one slot each,
  outlived on almost every visit): a verdict landing or a day closing
  elsewhere never makes a viewer who did nothing wait; their next refetch
  (60 s staleTime, or the next focus) gets the new build. Older than that,
  the request waits for the rebuild. Rebuilds share one flight as before: at
  most one per slot, a request takes only one that started after it arrived.
  At most TWO background rebuilds run at once across every slot (`_BG`); one
  queued for a turn has not read anything yet, so a request that must wait
  may join it.
- **…but never to a viewer who wrote something since it started.**
  `wrote(actor)` is called for every mutating request but a SIGN-IN (category
  `sessions`) — in the action-log middleware on `http.response.start`, before
  the response leaves, so the refetch it triggers cannot miss it — and for
  every bot act (`record_bot`), keyed by the Telegram account. No door per
  endpoint, nothing to forget: a ruling, an override, an exclusion, a sheet
  refresh or a reopen in Telegram is followed by a build that started after
  it. The sign-in is out because every Telegram app open sends one with the
  old token: counted, it made whoever opened the app and went to Monitoring
  wait 6–8 s for a build identical to the kept one (the 17 Oct DM, ×17).
- **A request that waits says why** on the «Server was slow» DM, beside its
  path (`perf_watch.add_note`): «register all|scoped rebuilt — none kept
  yet», «— changed: <tables>; kept one N s old», «— viewer wrote N s ago»,
  plus «joined a build already under way» when it shared one.
- **The build itself computes the exemption set fresh** (`leader_load.forget()`
  first): its own 60 s memory is harmless on a build thrown away, and wrong on
  one that is kept until the next change.
- Measured on a production-sized copy (15,775 rows): a kept answer 60–70 ms
  including the fingerprint; the rebuild 2.6–2.8 s warm (was 3.0–3.9 s: the
  sheet rows are read as columns, not ORM entities, and the register's rows
  carry no per-task `cam` — the day report and the appeal page, the only
  readers of it, fetch their one report; `dashboard_rows(captures=False)`).
  Production's shared Postgres is slower, so a rebuild there still costs
  seconds — but only once per change, not once per focus.
- Postgres only (`xmin`); on any other database every request builds.
  `forget()` drops the kept build. Nothing is stored; a restart starts empty.
- **A build never holds the GIL for long** (2026-10-19 — a rebuild on its
  background thread froze the whole server 3.4 s): it runs with the cyclic
  garbage collector PAUSED (`services/gc_pause.py`, counted across threads —
  its objects are freed by reference counting, and full collections were 1.2 s
  of the freeze), its answer is encoded ROW BY ROW into byte pieces of ~256 KB
  (`encode_list` / `encode_dict`; `Build.data` is a tuple of pieces, `nbytes`
  their size) instead of one `json.dumps` of the whole register, and it is SENT
  as those pieces (`routers/leaders.PartsResponse`, Content-Length set) — no
  20 MB string is joined or encoded per request. Byte-identical to the old
  answer. The «Mening o'rnim» pool build runs paused too. **The unscoped build
  is made ~45 s after a process starts** (`leader_register.warm`, after the
  standing pool, from `warm_standing`), so the first Monitoring load after a
  deploy is not the one that waits («none kept yet», 7.4 s).

## «Mening o'rnim» — a leader's and a brigadir's own place (`/leaders`)

From **2026-09-30** (the operator's request) the Monitoring tab opens, for a
LEADER, with their place in their unit, their shift and overall, and for a
BRIGADIR with their unit's place among its shift's units and overall — over the
page's period. `MyStanding` in `Leaders.jsx`, fed by `GET
/api/leaders/standing?from&to` (`routers/leaders.py`). Keyed by the ROLE, so a
«see all» grant does not hide it; hidden mid-exam; 403 for every other role.

- **ONE rule, and it is the board's.** The ranking's pieces are module-level in
  `Leaders.jsx` — `inScope`, `rosterIn`, `rosterByUnit`, `buildCutLeaders`,
  `buildCutUnits`, `boardScores`, `rankPlaces` — and the board itself is composed
  of them. The card composes the SAME ones (`placesOf`), so a tile prints the
  place an admin reads off the board with that scope, window and metric.
  Verified when it shipped: 138 board-vs-card places matched, both metrics, a
  September window and an August one with 46 unlinked sheet spellings. Never
  give the card a rule of its own — that is a second leaderboard.
- **The pool is the unscoped register with every name replaced by a code.**
  `get_leaders` is a thin wrapper over `_leaders_feed(sees_all, lite)` (verified
  byte-identical for admin, supervisor and shift-manager when split);
  `_standing_pool` builds it with `sees_all=True, lite=True`, in-process: fresh
  for 60 s, and from then on every request answers AT ONCE from the last build
  (up to 3 h old) while ONE new build runs on a thread of its own
  (`_standing_refresh`, its own session), and a process builds one ~45 s after
  it starts (`warm_standing`). Only a request after three quiet hours, or in a
  process's first minute, waits for a build (~5 s on production — with a
  plain 60 s expiry somebody paid it every minute, nine times in the 8 Oct
  report). Each request windows it and draws fresh random codes
  (`_pool_codes`): a unit is `u…`, a person is one `w…` code per WORD of their
  name plus a `p…` code of their own — the word structure is kept because
  `rosterFold` matches an unlinked sheet spelling to a profile by its first two
  words. `_name_toks` is the twin of `nameToks` in `Leaders.jsx`; keep them in
  step. Rows and roster are shuffled (their order would name people).
- **What travels and what does not.** No name, unit name, task, proof, report
  id, or exclusion reason/author. Each leader-day's score and flags DO — a
  ranking cannot be computed from less — so a determined reader could see
  colleagues' anonymous daily scores in the raw response (and pick out which
  codes are their own unit's). Porting the ranking to Python instead would
  remove that and create the second rule above; that trade-off is the
  operator's to reopen.
- **The metric**: a leader is placed by Reyting — they have no metric toggle, so
  a value another session left in the browser must not steer their card; a
  brigadir's card follows the board's own toggle.
- **The tile**: place over the pool size, then the pool as a strip in rank order
  (best on the left) tinted by each person's `scoreColor` band, with the
  reader's slot framed — as wide as the places they share, so a tie reads as one
  slot. Medal colours only on a pool of more than three (the podium's rule).
  Nothing else is coloured as a verdict. «Not ranked this period» (every day
  excluded/cut, or a unit that filed nothing) is said, never printed as a last
  place. A shift or unit the viewer has none of is said too.

## What is ON the `/leaders` tab strip

From **2026-09-02** (the operator's call) the strip was five tabs; from
**2026-09-28** it is six, in this order: **Monitoring · Chek-list · Vazifalar ·
AI tekshiruvi · Norozliklar · Kechikkan isbotlar**. «Chek-list» sits SECOND (the
operator's call) — after the page's overview, the one tab a leader works in; see
its own section below. The two review queues sit last and together — they are
the two ways a task that scored 0 gets its weight back — with the AI queue that
produced those rejections directly above them.

- **«Kechikkanlar» and «Ma'lumotlarni tozalash» are GONE from it.** The
  shift-1 late-day queue is ruled on from the Telegram card the request arrives
  as (`approvals.py`, kind `leader_late`), and the bot-day delete lives on the
  admin «Liderlar kunlik vazifalari» destination (`/panel/ltdaily`),
  beside the submission it deletes and the day detail that says what is in it.
- **Neither component was deleted** — `components/leaders/LateReports.jsx` and
  `BotDataClear.jsx` are simply rendered by nothing today, so putting either
  tab back is one entry in `tabOk` and one in the strip.
- **A deep link naming a tab this page no longer has is IGNORED, not obeyed.**
  `telegram_bot.py` and `approvals.py` still link `?tab=late`; `tabOk` refuses
  it exactly as it refuses a tab the viewer's role cannot open, and the saved
  tab stands. Fix the two links only if the queue never comes back.

## The «Chek-list» tab (`/leaders`, second on the strip)

From **2026-09-28** (the operator's rulings, asked one by one with mockups) a
leader files, reads and argues their checklist on the web, one day at a time —
`components/leaders/Checklist.jsx` + `ChecklistTaskSheet.jsx` over
`routers/leader_checklist.py`, writes through `services/leader_checklist.py`.

- **Both doors stay (the operator's call).** The bot's `/tasks` works exactly as
  it did; the tab writes the SAME `LeaderTaskDay` / `LeaderTaskEntry` rows
  through the SAME cores, so a task started in one shows in the other.
  `leader_checklist.save_answer` and `close_day` are the bodies lifted out of
  `telegram_bot._lt_save_entry` and «KUNNI YOPISH» (now thin calls into them);
  submitting one task is `leader_close.close_task`, as it always was. Never
  write a third spelling of any of them.
- **One date, one leader.** On this tab the page's range becomes a
  `DayStepper` with its own day (`clDate`, not persisted — the tab opens on
  today) — null asks the server for the leader's current SHIFT day. A leader
  reads their own; everybody else must pick one in the page's `FilterPanel`
  (a `pinned`, REQUIRED leader section built from `/api/leaders`' `roster`,
  keyed by PROFILE id in `leaders_cl_leader`, synced with the name-keyed
  `fLeader` wherever a name is one person) — until then «Pick a leader». The
  verify filter is not offered here. A leader lands on the tab ONCE
  (`leaders_cl_landed`) and keeps whatever they pick after. Hidden during an
  exam: it files real rows.
- **Grouped by what is left (the operator's pick over catalog order):** to do
  (drafts first, then nearest deadline) → rejected → not done → being checked
  → accepted (collapsed on today while anything is above it). `GROUP_OF` in
  `checklistShared.js` is the one mapping the list and the summary bar read.
- **Nothing is computed here.** A closed day's number is `day_report`'s; an
  open one's is `leader_close.score_line` (the bot menu's); each state is
  `task_state` with the register's human rulings folded in (`_ruled_state`: an
  admin override wins, a flag in the manual regime is not a rejection). A
  closed day lists exactly the tasks it RECORDED — the config is not versioned.
  Past days before the bot era read the Google-Form row through the register's
  own matchers (`_sheet_uid`); `leader_bot.merges` decides which layer counts.
- **Filing is ONE step behind a confirm** on a per-task unit (`/answer` with
  `submit`): images picked or pasted (Ctrl+V), shrunk on the device to 2560 px
  JPEG, re-encoded server-side (`normalize_image`, Pillow, EXIF-upright),
  relayed to the archive channel before anything is written. A day-mode unit
  saves and closes with «Kunni yopish» (`/close-day`). A camera task is NEVER
  uploaded: it opens `/proof/camera?…&back=`, which from 2026-09-28 returns to
  the given in-app path instead of closing the mini app (`exit` in
  ProofCamera; only a same-app path is honoured) and reopens the task
  (`?tab=checklist&open=<id>`). Past its own hour a task takes only a LATE
  proof (`/answer` answers 409 `time_up`; a task an admin reopened is on the
  day's deadline and exempt): `/late/start` materialises the day (the camera's
  late door needs it) and `/late` files uploads + camera drafts + the required
  reason, then holds or announces it exactly as the bot's `lsend` does
  (`file_announcement`). The late door stays open on a CLOSED day until the
  cut-off (24:00 / 12:00) or «Kunni yopish» — the late button reads
  `task.late.eligible`, never `rights.file` (which is false on a closed day).
- **Verdicts arrive live:** the tab polls every 8 s while a task is being
  checked and every 60 s otherwise (today only), and a verdict landing raises a
  toast (+ Telegram haptic); a rejection's toast persists.
- **Objections happen in place**, as the first message of the appeal chat
  (`CommentsThread` first-message mode) — including on TODAY's open day:
  `build_report_row(allow_open=True)` / `day_report(allow_open=True)` serve an
  unfinished bot day to exactly three readers (the objection endpoint, the
  appeal chat's evidence and the photo scope). The report page, the DMs, the
  digests and the register never pass it. The chat's «open the report» button
  opens the checklist instead while the day is open (`dayOpen`).
- **A failed AUTOMATIC check can be objected to** (the operator's ruling) —
  same table, chain, chat and notices (`leader_dispute.auto_entry`: the ref is
  the entry's `bot:<id>`, no review row). An admin's approval grants the task
  through `LeaderTaskOverride` (`_write_auto`) and its undo takes that grant
  back; the notices, the brigadir's and admins' cards and the queue say
  «automatic check», never «AI» (`leader_dispute_filed_auto`,
  `leader_dispute_sup_rejected_auto`). `day_report`'s `objectable` is THE test
  for every kind; `VerdictBlock.jsx` draws every verdict (the tab, the chat,
  the new-objection page). From 2026-10-14 an ADMIN's «not done» ruling is the
  third kind — see «Every rejected task can be objected to».
- **Brigadir, shift manager, admin: read-only**, except the admin's
  reopen/empty (the existing `/admin/leader-tasks/task/reopen`). Rights ride on
  the payload (`rights.file` = the session HOLDS the leader profile, the
  camera's `_own_leader` rule; `rights.object` = `canDispute`), never derived
  from a role on the client. Reads are page-gated on `leaders` and row-scoped
  like the day report; auto-check live figures (`/auto-live`,
  `leader_auto_rich.snapshot`) are fetched only when a sheet opens.
