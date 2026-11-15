# Tasks and concerns

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## A concern's deadline is its RECEIVER's

From **2026-09-23** (the operator's directive) the creator of a concern no
longer sets a deadline — on `/concerns` or `/cell-concerns`. Whoever HOLDS it
sets one when they take it into work (status → doing), because a deadline is a
promise and only the person making it can make it.

- **`routers/concerns.py` owns the rule, at the endpoint**: `create_concern`
  and the worker filing store none (a `deadline_days` a client still sends is
  ignored); the flip INTO doing must carry one (400 without); while the
  concern is in work its holder (`_can_set_status`) — or an admin — may move
  it; any other change is refused. An UNCHANGED value always passes, so every
  round-trip save keeps working. Bounds 0–`MAX_DEADLINE_DAYS` (365).
- **Still days, now with an anchor**: `leader_concerns.deadline_from` is the
  day the count starts — stamped on the flip into doing (or on a first
  deadline); moving one keeps it. NULL = a creator's deadline from before this
  rule, which keeps counting from `entry_date`. Nothing was migrated or cleared.
- **`_due(c)` is THE due day** and ships as `due_date` on every row. The
  register, the mobile card, the charts, the Excel export, `/cell-concerns` and
  its stats all read it (overdue = open and `due_date < today`); the weekly deck
  reads the same pair through `concerns_deck._deadline`. Never re-derive
  `entry_date + deadline_days` on a client.
- **Every door that flips into doing asks for it**: the inline pill opens a
  «take into work» prompt (empty — an old number was somebody else's), the
  edit modal shows the field only to the holder while the concern is in work,
  and the `/cell-concerns` detail modal does the same for the leader.
- **`concern_started`** is the notice for that flip (holder's `_interested`
  audience + the CREATOR, who no longer names the deadline and is waiting on
  it), with the due day as a `⏳` row; `concern_reopened` / `concern_edited`
  carry the same row while the concern is in work.

## A concern is DATED by when its current holder got it

From **2026-09-28** (shift-managers' report, confirmed on the 11 Sep copy: 70
of the 93 concerns sitting with shift-managers printed a day other than the one
they arrived — 4 days earlier on average, up to 23) the «Sana» of a `/concerns`
row is the day it reached whoever holds it NOW, not the day it was filed.

- **`received_at` on the payload is THE moment**, set by `_serialize` only once
  the concern has MOVED: `level_since > created_at`. A new concern stamps both in
  one INSERT (one `now()`), every step stamps `level_since` later — on the 11
  Sep copy the split matched the escalation trail row for row (2,452 equal /
  189 later). A never-moved row answers null and keeps its filing day
  (`entry_date`, which a creator may backdate — 270 rows do, so it must NOT be
  replaced by `created_at`). The exam sandbox reads its own step count instead:
  it stamps the two clocks with two reads. `/cell-concerns` ignores the field.
- **`rowDay` / `rowStamp` / `inPeriod` in `Concerns.jsx` are the one reading**:
  the date column (a moved row adds «Yaratilgan: …» under it), the phone card
  (+ a «Yaratilgan vaqt» fact), the detail view, the sort AND the default order
  (newest date first — the server still lists by filing day), the peak-date card
  and the export (a third «Yaratilgan sana» column, filled on every row).
- **The period takes a concern FILED or RECEIVED in it** — either. Keyed on the
  filing day alone, a concern escalated to a shift-manager this week but filed
  earlier never appeared in their default 7-day view; the union only ADDS rows,
  so nothing a period showed before leaves it. The trend's axis stays on the
  window: a row filed before it opens the open-pool line instead of stretching
  the chart back. «Opened» bars, the age buckets, «longest open» and «slowest
  brigadir» still count whole-life from `entry_date`.
- **The three MOVE notices carry both days** (`concern_escalated` / `_returned`
  / `_moved`): «📅 Sana» = the move (`moved_on`), «🗓 Yaratilgan» = the filing
  day. A notice stored before this has no `moved_on`; its «Sana» row drops out
  and the filing day shows under its true name.

## The weekly Concerns deck (`/concerns` → «Haftalik hisobot»)

From **2026-09-23** (the operator's rulings, asked and answered one by one)
`/concerns` carries a PPTX beside «Excel» — `POST /api/concerns/export.pptx` →
`services/concerns_deck.py`, prose in `services/concerns_narrative.py` by the AI
the «AI kalitlari» tab gives feature `deck_concerns` (Gemini until 2026-10-19).
It is the Ojidaniya deck's twin: same look, same `_text` / `deck_text` no-overlap
rule (imported from `ojidaniya_deck`, never copied), same delivery, same shape.

- **A fixed weekly report, never a view of the page.** The window is
  `report_week` — last Wednesday back to the Wednesday before, 8 days, read on
  the PLANT's clock (`ojidaniya_matrix.today_local`) — compared with the 8 days
  before. **Both plants**, both shifts, every unit; the page's filters change
  nothing, so the button never fires without a confirm naming the scope
  (`GET /api/concerns/deck-window` serves it). **Admin only**, checked in both
  endpoints. Button only — no scheduled send.
- **Rows = this week's filings PLUS every older concern still open.** «Yangi»
  counts by `entry_date` (the filing day — the page's period also takes a
  concern RECEIVED in it, so the two can differ); «Yopildi» counts closings in
  the window by `completion_date` (the page's flow-chart close day, entry date
  when earlier), whenever the concern was filed. Days to close = close day −
  entry date, the page's `resolution_days`.
- **State is taken at the END of the window, never at the press.** «Ochiq» =
  not closed by the last day's end; «muddati o'tgan» = the page's own rule read
  the morning after (deadline day ≤ last day). Two presses on two days give one
  file, and last week is computed the same way. Where a concern sat at the end
  (level + holder) is read off the escalation trail: the first move AFTER the
  window records it in `from_level` / `from_name`; an unmoved concern holds
  where it holds now (`_deck_inputs` in `routers/concerns.py`).
- **Worker-filed concerns (/cell-concerns) count EVERYWHERE, rankings
  included** — the operator overrode, for this report, the 4 Sep reading that
  the worker register «cannot be used to judge leaders». **A worker's NAME is
  never printed and never reaches Gemini**: `_deck_inputs` hands the deck only
  `worker: bool`; quotes carry № + cell code.
- **Brigadirs are ranked by overdue**, then open, then filed; everything else is
  a column. A unit's plant is tagged only when it is not the main plant.
- **Concern texts, closing notes and move reasons are quoted EXACTLY as typed**
  — Cyrillic moved to Latin script, nothing else (no case change: the shared
  `_sentence` is deliberately NOT applied to quotes). The closing note is the
  newest `kind="resolution"` comment, `solution` for legacy rows.
- **The recurring problems are COUNTED here, not by the model.** Gemini names
  each theme's concerns by NUMBER (`nums`); `_themes` keeps only numbers the
  week holds and counts them. Every other figure comes from `collect`, and the
  prompt forbids any other number. Gemini gets `BUDGET_S` (70 s) — the whole
  request must beat Cloudflare's 100 s — and any failure ships the deck with
  plain fallbacks. Always Uzbek Latin.
- 12 slides: cover · summary (4 KPIs vs last week) · recurring problems ·
  departments table · top-3 departments with quotes + closing notes · brigadirs
  ranked · 10 oldest open · the chain (ups/downs, where the open pool sits, the
  moves with reasons) · day by day · actions · conclusion · method + quality.
- Logged as `export.concerns_deck`. A deadline typed as a huge number is a
  deadline that never comes (`_deadline` catches the overflow).

## THE task board (`/tasks`) — both tiers, one page

From **2026-09-04** the two task boards are ONE page. `/brigadir-tasks`
(smena menejeri → brigadir) is retired: its route redirects to `/tasks`, its
page key is gone from `PAGE_KEYS`, and `pages/Tasks.jsx` renders both tiers the
way `/concerns` renders every level of its chain — one register, a LEVEL on
each row, an analysis tab beside it.

- **`GET /api/tasks/board` is THE read** — every task the viewer may see from
  either tier, with the rights ON EACH ROW (`can_edit` / `can_status` /
  `can_reorder` / `can_comment`). Reach is the UNION of what the two lists
  served: admin everything, a shift manager both tiers inside their shift ∩
  plant (`services/shift_scope`, archived units kept), a brigadir both tiers
  of their own unit, a leader their own queue. The board is not homogeneous —
  a shift manager governs the brigadir rows and only reads the leader rows, a
  brigadir the reverse — so the page derives NOTHING from the viewer's role.
  Each right is the same predicate the owning router's write endpoint applies,
  resolved once per request, never once per row.
- **Writes still go to the router that owns the tier**, and that split is the
  whole of what survives: leader rows through `/api/tasks`, brigadir rows
  through `/api/brigadir-tasks` (now gated on the `tasks` page). The client
  picks the prefix by `assignee_kind` (`endpointFor`). One task, one router
  that owns it — two routers with two rights models claiming one row is how
  only one of them is right.
- **`GET /api/tasks` (the leader tier alone) stays** for a tab open on an
  older bundle, which is why this shipped as a MINOR: nothing an old tab sends
  is refused.
- **A task is URGENT or it is not — the flame, and nothing else** (the
  operator's directive, 2026-09-08). `LeaderTask.priority` carries the flag:
  **1 = urgent, NULL = ordinary**, and `services/task_board.py` — `URGENT`,
  `is_urgent`, `urgent_value`, `urgent_first` — is its ONE spelling, so neither
  router can put a third value in the column. It replaced a dense 1..N queue
  per assignee (positions, a two-step swap/shift editor, close-ranks whenever a
  task left the queue, a profile-row lock per mutation, and a renumber on every
  boot). That machinery answered a question nobody was asking: nobody ranks
  their fourteenth task against their fifteenth, the editor could not even be
  opened on a queue of one, and the positions were noise carrying an invariant.
  - **Nothing was erased to ship it.** `is_urgent` is `priority == 1` and
    deliberately NOT "not NULL": rows written under the queue still carry their
    old position, and a task that sat fourth in somebody's list was never a
    statement that it was urgent. Only what WAS the top of a queue reads as a
    flame; every write from here on stores 1 or NULL, so the leftovers go as
    rows are touched. **Consequence to know: on the day this shipped every
    assignee's position-1 task came up flamed** — one per person, the closest
    thing the old data had to «this one matters».
  - **`startup.backfill_task_profiles` lost its renumber block, and that was
    the load-bearing edit.** It runs on EVERY boot and wrote a dense 1..N into
    each profile's active tasks — i.e. a 1 into whichever task sorted first for
    every single assignee. Left in, it would have re-flamed the platform at
    every restart.
  - **A status change no longer touches the flag.** It used to leave the queue
    on «done» and rejoin at the back when reopened; now the flame stays, so a
    task that was urgent still says so once it is finished.
  - **`PATCH /{id}/priority` keeps its path and takes `{urgent}`** — it also
    still reads the old `{priority, mode}` body, where position 1 means "make
    this urgent" and anything behind it "don't", so a tab left open on the queue
    bundle keeps working instead of 422-ing on a save. Rights are unchanged: the
    unit's supervisor / the covering shift manager and admins, never the
    assignee — what is urgent is the statement of whoever set the work.
  - The column key on the table stays `"priority"` (a saved `tasks_sort` goes on
    working); what it sorts by is the flame. `UrgentToggle` in
    `components/ui/TaskQueue.jsx` is the control — one tap, orange (`#f97316`),
    **never red**: red is the traffic light's «overdue», a fact about the due
    DATE, and a row is easily one without being the other. A viewer who may not
    press it sees a plain dash, never an inert flame.
- **Status is the PARTITION; overdue is a FLAG.** The donut, the KPI cards and
  every ranked stack count what the status column says — todo / doing / done —
  and «muddati o'tgan» is the open rows past their date, printed BESIDE them
  (the donut's legend carries it under a rule as «shu jumladan», the ranked
  bars as a red mark before the total). The earlier reading pulled an overdue
  task out of its status bucket, so a board of twelve overdue «to do» tasks
  printed «to do: 0» over a table of twelve «to do» rows. Never re-introduce a
  fourth "overdue" bucket on this page; the Concerns board still keeps its four
  disjoint buckets and has not been asked to change.
- **The page-key merge is a startup fold, not a flag**
  (`startup.merge_brigadir_tasks_page`): the saved Access matrix's
  `brigadir-tasks` roles are unioned into `tasks` and the key removed; a
  personal `page.view.brigadir-tasks` GRANT is renamed to `page.view.tasks`
  where no such row exists (else dropped, the unique key forbids two); a DENY
  is dropped, because the only page it could now close is the merged one. The
  trigger state cannot recur, so a second pass is a no-op. Default access is
  `tasks: shift-manager + supervisor + leader`.
- **Controls follow the payload, not the role.** The tier filter and column
  exist only while both kinds are present, the shift / brigadir sections and
  the unit column only while more than one unit is; a leader sees neither an
  assignee column nor a leader filter. The org chain is grouped «Kim va
  qayerda», the record filters «Vazifa», and the leader list under a brigadir
  pick says so (`note`) and offers the way back (`empty`).
- **The analysis tab** (`tasks_view`): four insight cards (who sets the most,
  the longest queue, the oldest open task, the on-time share of done tasks),
  the open-task trend with its status strip, the status donut, opened-vs-closed
  per day, a status stack per unit, and two ranked boards — by CREATOR (badged
  with the role they set it from) and by ASSIGNEE (badged with the tier) —
  plus the completion-time histogram. All computed client-side over the SAME
  filtered rows as the register, so the two views tell one story.
- **`components/ui/AnalysisBoard.jsx` is THE home of the analysis vocabulary**
  — `InsightCard` / `Metric` / `Subject` / `Empty`, `ChartCard` / `Chart` /
  `NoChart`, `RankedBar` / `RankedList` `wrap` (the label takes a second line instead of being cut — a list of PEOPLE on a phone), `StackLegend` (a part may carry `icon` (+ `glyph`, its ink): the swatch becomes a FILLED badge in the part's colour with the icon inside, so two similar colours still differ by SHAPE and the badge still matches its bar segment), `RankedBar` / `RankedList` (`onRowClick` makes each row a ≥44px button and `value` replaces the printed total — /worker-concerns' band chips; badge and extra are
  render props), `useRowFit`, `LevelChip` + `LEVEL_COLOR`. They were private to
  `Concerns.jsx`, which now imports them and keeps only its own
  `ResponsibleList` wrapper (a `RankedList` badged with the chain step). A
  third board copies nothing from either page.

## Tasks set from above: the shift-manager tier, a top-manager's rights, the day block (`task_board.OPEN_FROM`, 2026-11-14)

The operator (2026-11-14): «Top managers and shift managers and admins when
they assign some kind of task it should appear in the shift day with different
ui … easy visible for top managers to say like you are not doing or good
doing». Four answers he gave before it was built: a top-manager sets tasks for
**brigadirs AND shift managers**; on the shift day they **only see** (no verdict
button — the task's chat is where a word is said); a day shows **everything
unfinished plus what was finished that day**; and it is **the admins' alone
first** — he names the day everybody else gets it.

**The same day, twice more.** v4.521.0 cut the block to the brigadir tier on
an answer read too narrowly; an hour later he said it whole, and that is the
rule in force (v4.522.0): «the task which assigned by admins, top managers and
shift managers to brigadirs and liders should be shown in the shift day … the
task will be given from liders part from tasks … and the notifications should
appear in the bot too, like different, like it is a very crucial task from
top». So:

- **The block shows BRIGADIRS and LEADERS** — every brigadir's task, and a
  leader's task when an admin, a top-manager or a shift-manager set it
  (`tb.set_from_above`). A task the unit's own brigadir set for a leader is not
  there; a shift manager's own task is not there. Both stay on `/tasks`.
- **Managers set a leader's task too** (`routers/tasks.py`, `_may_set`): a
  shift-manager and a top-manager, for ANY leader, from the first day — an
  admin always could. Over a leader's task set from the top they keep a
  manager's hand (status, the flame, the thread — `_governs_from_top`); a task
  the unit's own brigadir set they only read, as before. The unit's brigadir
  still governs every task of their leaders, whoever set it.
- **A task from the top is announced by its OWN notice — `task_from_top`.**
  `tb.created_nkey` picks it when the setter acts from the top (`tb.from_top`:
  an admin today; a top- or shift-manager from the first day), and
  `tb.notice_kwargs` is the ONE call all three routers make. The DM is a card
  («🚨 Rahbariyatdan muhim vazifa», the task quoted, who set it with their
  role, the deadline, «bajarilishini rahbariyat kuzatadi») with a button under
  it that opens the task (`/tasks?open=<id>`); the bell row is the same text in
  the warning colour. A brigadir's task for their leader stays the plain
  «Yangi vazifa» (`task_created`), always. **Until the first day a shift
  manager's task for a brigadir also stays plain** — nothing a non-admin does
  changed before the announcement.
- **Tasks are set on Liderlar → «Vazifalar».** A top-manager does not hold that
  page by default, so on the first day the role is added to the stored Access
  matrix's `tasks` list, once (`tb.open_page_to_top_managers`, flag
  `tasks_page_top_managers_2026_11_v1` — a later untick on the Access tab
  stays unticked). It runs at startup, from the day read and before every
  page-access answer (`settings.page_access_payload` — each sign-in and each
  menu), because the first day may come with no deploy on it: the first person
  to open the app that day grants it before their own menu is drawn. Before the
  day, and once done in a process, it touches no database.

- **THE FIRST DAY IS ONE CONSTANT — `task_board.OPEN_FROM` = 2026-11-15**
  (named by the operator on 2026-11-14 at 21:13: «open it for top managers and
  shift managers from tomorrow»; it was None — «admins only first» — until
  then). Before it: only an admin sees the «Rahbariyat vazifalari» block, a
  top-manager sets nothing, a shift manager sets a brigadir's task as before
  (the plain notice) and no leader's. On it and after: top- and shift-managers
  see the block and set tasks for brigadirs and leaders with the loud notice, a
  top-manager for shift managers too (`tb.top_sets`, `tb.from_top`), and
  top-managers are given «Vazifalar». **An admin's own act never waits**: a
  task an admin sets is from the top today. There is NO browser twin of the date — the
  block asks the server (`show`), the form asks the server which tiers it may
  offer — so the day is one line in one file. **Every test pins its own side
  of the day** (`CLOSED` / `BEFORE` / `OPEN` in `tests/test_task_day.py`) and
  never reads the shipped constant, except `test_the_named_day`: a test that
  read it would pass today and fail from the 15th, or the reverse.
  **Not gated: an admin setting a shift manager a task.** That is a deliberate
  act by somebody who knows, it reaches that shift manager like any task (bell
  + DM, their `/tasks` board, their bell queue), and they can work it.
- **A third tier on the one board** — `assignee_kind == "shift-manager"`,
  written through `routers/shift_manager_tasks.py` (`/api/shift-manager-tasks`,
  journal actions `smtask.*`). The assignee is a shift-manager PROFILE, stored
  in `leader_profile_id` — the column is a `role_profiles.id`, which is what a
  shift-manager profile is, and ids never collide across roles; **always ask
  `tb.kind_of` first**. `supervisor_manager_id` is NULL (the task belongs to no
  unit, so no unit filter picks it up). On the board payload such a row serves
  `assignee_profile_id` and a NULL `leader_profile_id`, so no leader filter or
  queue counts it; `supervisor_shift` carries the shift manager's own shift.
  - governs (sets, the flame, closes on their behalf, writes in the thread):
    an admin, a top-manager from the first day;
  - the ASSIGNEE reads their own, changes status, writes in the thread;
  - **a shift manager never reads a colleague's** — the board, the thread and
    the day block all refuse;
  - text / date / delete: the creating profile or an admin, as on every tier.
- **A top-manager on the brigadir tier**: from the first day they set a task
  for ANY brigadir with a shift manager's rights over the row
  (`brigadir_tasks._can_manage` / `_may_set` / `_manageable_units`).
- **`shift-daily` is a second door to the two management routers**
  (`require_page("tasks", "shift-daily")`): a top-manager holds «Smena kunligi»
  and by default NOT `/tasks`, and the block lets them set a task and open its
  chat. The door opens nothing by itself — every right is the ROLE's, and a
  reader who came through it alone reads no board (`_scope_units` answers `[]`
  unless they hold `tasks`). **To give top-managers the full register too
  (edit, delete, the flame, the analysis tab), tick «Vazifalar» for them on the
  Access tab** — the block does not need it.
- **`utils/taskTiers.js` is the tiers' one spelling in the browser**
  (`endpointFor`, `ASSIGNEE_FIELD`, `TIERS`), and
  **`components/tasks/TaskFormModal.jsx` is THE task form** — `/tasks` and the
  day block both open it; `kinds` = the tiers the server says this viewer may
  create at. Never fork it back into a page.

### The day block — «Rahbariyat vazifalari» on «Smena kunligi»

`components/overview/DayTasksCard.jsx` over `GET /api/tasks/day`
(`routers/tasks.py::day_tasks` reads and scopes, `services/task_day.py` folds —
no database in the fold, `tests/test_task_day.py` feeds it plain objects).

- **Which tasks**: set from the top for a brigadir or a leader
  (`tb.set_from_above` — a brigadir's always is, since only an admin, a
  shift-manager or a top-manager can set one; a LEADER's only when its
  creator's profile says so, since most are set by the unit's brigadir and a
  row from before profile keys cannot tell). A shift manager's own task is NOT
  in the block. Inside the page's plant and shift; archived units left out.
  **«Vazifa berish» in the block offers the tiers the block shows** — a
  brigadir's, and a leader's for a viewer who holds «Vazifalar» and acts from
  the top; never a task the block would not then show.
- **Which day**: set on or before it AND (still open on it OR finished on it).
  Finished earlier = left; set later = not arrived. A day is Tashkent's
  calendar day, never the shift frame.
- **IT FOLDS** (v4.526.0, the operator: «make this foldable, after pressing it
  should open all»). Folded — the default, remembered per browser
  (`day_tasks_open`) — it is the head and the day's one-line answer (the bar,
  its parts, «N kishidan M nafari kechikmoqda») with «Hammasini ochish · N ta
  vazifa» under it: about 170px instead of a screen and a half. One press on
  the head or that button opens EVERY person and EVERY task — the «Yana N
  kishi» cut is gone; «Yig'ish» at the end folds it back and brings the head
  into view. The head's fold is `SectionHead`'s own `onToggle` / `open` (see
  the template table), so the head is still THE section header.
- **THE BLOCK IS ALWAYS NOW** (v4.527.0, the operator, 2026-11-15: «remove
  the date switch, always show now and show all task», finished ones «7 days
  after done»). «Smena kunligi» opens on YESTERDAY (its stepper's default —
  the page's figures are about closed days), and v4.523.0's block followed the
  stepper and showed a day exactly as it stood, so every task set today was
  missing (he sent a screenshot of thirteen tasks set that morning). v4.524.0
  opened the block on «now» with a toggle back to the stepper's day; he asked
  «what is 6 noyabr for» and had it removed. Now the stepper never reaches the
  block and no `date` is sent: the server reads its own Tashkent today
  (`task_day.state_now`) — **every OPEN task, and a FINISHED one for
  `DONE_KEEP_DAYS` = 7 days after the day it was finished** (finished on the
  15th → still listed on the 22nd, gone on the 23rd; it stays on «Vazifalar»
  for ever). A finished task's line says «Bajarildi: 14 noyabr · o'z vaqtida»
  (or «N kun kechikib»), its deadline on the hover; inside a person the most
  recently finished come first, after the open ones. `state_on` (one past day
  as it stood) is kept only for a tab still open on an older bundle, which
  sends a `date`. The «Smena hisoboti» board under it still takes no day.
- **«From an admin» means the giver's ROLE when they gave it** — the
  creator's profile key (`admin:…`), recorded on the task. The operator named
  the admins who matter (2026-11-15): Abbos, Burkhon and Nozimjon; any other
  account holding the admin role counts the same way.
- **Four states, and a task is in exactly one**: `done` (finished that day;
  `late` when after its deadline) · `overdue` (open, deadline before the day) ·
  `doing` · `todo`. **Late is a BUCKET here and a FLAG on `/tasks`** — that page
  counts what the status column says, this block asks who is late; both add up.
  A past day cannot know whether a task was already started: one open now
  answers with its current status, one finished on a later day reads `doing`.
- **THE TASKS ARE ON THE PAGE** (v4.523.0, the operator the same evening:
  «when open shift day page i have to see the task for brigadirs and remind
  them did you do this or not»). It shipped as tiles of names that opened a
  dialog — he read that as «the tasks are not shown». Now: two groups
  (brigadirs, then leaders), each person **worst first** (`task_day.fold`:
  late → going → done; more late tasks, longer late, more open work), six
  people per group and «Yana N kishi» under them. A person is a small block:
  their line (the answer in one mark, «done/total», a red count of late tasks,
  a «+» that sets them a task) and under it EVERY task they were set — its
  state, its text, its deadline with the days late, who set it, «Eslatish» and
  the chat. One line per task from `sm` up, in fixed columns so they line up
  down the list; stacked on a phone, where the text gets the width. No dialog
  stands between the reader and a task.
- **«Eslatish» — «did you do this or not?»** (`tb.remind`, `POST
  /api/brigadir-tasks/{id}/remind` and `/api/tasks/{id}/remind`). One press
  sends the assignee the task again as a question — the `task_reminder` card in
  the bot (who asks, the deadline, how many days late, «open the task and set
  its status or write a comment») with the open-button, and a warning row in
  the bell. Rules: only about an OPEN task; **one reminder per task per 30
  minutes whoever presses** (`REMIND_GAP`, read off the notifications the
  reminders themselves are — a second manager on the same page must not ping
  the person again), and the row says so: the button reads «Eslatildi» while
  the gap runs (`reminded` on the day read). Who may press: whoever acts from
  the top (`tb.from_top` — an admin today, a top- or shift-manager from the
  first day) AND governs the row; on a leader's task only one set from the top.
  Journal actions `btask.reminded` / `task.reminded`. No verdict is stored —
  the answer is the assignee setting the status or writing in the thread.
- **The tier is a caption, never a `LevelChip` on a person's line**: a
  brigadir's identity hue is red, and a red chip on every row of a board whose
  red means «not doing» would read as a verdict. The fold stays tier-blind (a
  person is keyed by kind and id), so the router alone decides whose tasks it
  is handed.
- The block draws nothing for a reader it is not for (`show: false`, a refused
  read) — only a browser that was shown it before gets its skeleton.

## Every new concern to Umarbek Karimov (`concerns.tell_watchers`, 2026-11-11)

The operator (2026-11-11): Umarbek Karimov, shift manager, gets EVERY concern
in Telegram the moment it is filed — through /concerns and the shop floor's
/cell-concerns, whatever its department — as the usual «Yangi xavotir
qo'shildi» (`concern_created`) bell row + DM. Nothing about it after that
(status, escalation, close) unless he is a party to it anyway. **From the
deploy on only** — nothing filed before is sent.

- `ALL_CONCERNS_WATCHERS` names the watchers by the WORDS of their profile
  name, matched among shift- and top-manager profiles in any order, Latin or
  Cyrillic, patronymic allowed (`_name_words`); no production id is
  hard-coded. Adding a person = one more word set.
- A watcher already addressed about that concern (its holder, its brigadir,
  its leader) is not told twice; one account is never DMed twice.
- His «Xavotirlar» Telegram switch in the bell's settings still mutes the DM.
