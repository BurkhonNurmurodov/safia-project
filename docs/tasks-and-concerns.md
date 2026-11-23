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
- **IT IS A BOARD — To do · Doing · Done** (v4.637.0, the operator,
  2026-11-22: «each task should be card and in the bottom should be written
  person who is this assigned, and the columns should be to do, doing, and
  done»). Three columns by STATUS; each task is ONE card: a red «N kun
  kechikdi» chip and the «Shoshilinch» flame on top (a finished card: «o'z
  vaqtida» or «N kun kechikib»), the text (up to four lines, whole on hover),
  the deadline (a picker where `can_due`), «Berdi: …», then the status pill,
  «Eslatish» and the chat — and the card's FOOT names the person it was set
  for (avatar, name, «Brigadir» or «Lider · unit»), with the «+» that sets
  them another. A late card stays in its status's column, red-edged, and comes
  first there (longest late, then flamed, then nearest deadline); «Bajarildi»
  lists the most recently finished first. Each column caps at 44rem and
  scrolls itself; **its cards are `flex-shrink-0`** — without it the capped
  flex column squeezed the cards and clipped their foot. Below `lg` (the
  sidebar leaves three columns too narrow) ONE column at a time, picked by a
  `SegmentedToggle` («Bajarilishi kerak · 3»). A `SearchInput` over the board
  filters by text, person, unit or setter. The fold, the bar and «N kishidan M
  nafari kechikmoqda» are unchanged; the per-person blocks are gone.
- **A card is DRAGGED to another column** (v4.638.0, the operator,
  2026-11-22: «make the cards drag and drop between columns»). The drop IS the
  status PATCH, so it obeys the card's `status_options` exactly as the pill
  does — a card the viewer may not move is not draggable (no grab cursor), a
  column its rights cannot reach dims while it is carried, the one it would
  land in is outlined in brand. Pointer events, MOUSE or PEN only, and only
  from `lg` up where the three columns stand side by side: a finger keeps the
  pill (a phone shows one column, and a long-press drag would fight the page's
  scroll). The press turns into a drag after 6px, so the card's buttons, its
  chat and text selection are untouched; Escape cancels; a floating copy
  follows the pointer (`createPortal`, its position written straight to the
  node — a re-render per mouse move would redraw the whole board) while the
  original dims. The columns stretch to the tallest one so a drop below a
  short column's last card still lands in it. **The move is optimistic** —
  the card changes column at once (`onMutate` rewrites the cached day read:
  status, state, a done card's day and lateness) and the read that follows
  puts the server's answer on it; a refusal is a toast and the card goes back.
- **The board has its own SHIFT filter** (the same day: «add filter for them
  for shift for now»): a `SegmentedToggle` «Barchasi · N | S1 · N | S2 · N»
  beside the search, filtering the cards by the person's shift (a brigadir's
  unit, a leader's unit), remembered per browser (`day_tasks_shift`). It
  narrows the board alone — the bar above it still counts every task. While
  the page's own «Smena» filter names a shift the server already reads only
  that shift, so the toggle is not drawn and filters nothing.
- **WHO MOVES A BRIGADIR'S TASK** (the same day: «brigadir should give the
  comment to the task, and only shift managers and admins can control their
  deadlines and process like to do, doing or done»; asked whether
  top-managers keep it — «Only SM and admins»). **Status and deadline: an
  admin and the shift manager covering the unit, nobody else** —
  `brigadir_tasks.runs_status`, asked by the status PATCH, `may_move_due`
  (the `/due` PATCH) and the PUT (a moved deadline from anybody else is
  refused; the creator still edits the text). The brigadir lost the To do ⇄
  Doing move they had since 2026-11-15 and ANSWERS IN THE THREAD, on their
  own «Vazifalar» page (the bot's cards already said «reply in its
  comments»); a top-manager still sets, flames, reminds and writes in the
  thread, but moves neither status nor date — not even on a task they set.
  Every row carries `can_due` and `status_options` from that one rule (the
  board's `_rights`, the day read, `_serialize`). **A leader's task keeps its
  own rule** (the operator: «idc about other page») — the leader and their
  brigadir still move one set from the top between To do and Doing, and its
  date is the creator's, an admin's or the unit's shift manager's
  (`tasks.may_move_due`).
- **The deadline is edited on the card** (v4.635.0, the operator,
  2026-11-22: «make the date editable for shift managers and admins»): a
  `DateRangePicker single bare` (its `label` node prints «Muddat …» on the
  trigger) wherever `can_due`, sending `PATCH {tier}/{id}/due` — the deadline
  alone, journalled like the PUT's «deadline» change. Never on a finished
  card.
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
  It never dips when pressed and its focus ring sits inside it — a held
  press on the chevron used to land outside the shrinking button and was lost
  (v4.542.1; `docs/motion.md`).
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

## Only a manager marks a task from the top done; its thread takes photos and files (2026-11-15)

The operator (v4.528.0): «only shift managers, top managers and admins can say
its done — for them [the assignees] do not have access this part», and «add for
comments the uploading the picture or file». Asked: the assignee keeps «to do» ⇄
«doing», and the rule covers tasks from the top only.

- **`task_board.status_choices` is THE status right** — `finisher` (runs the
  row: marks done, reopens), `mover` (may touch it), `from_top`
  (`set_from_above`), `current`. On a task FROM THE TOP a mover who is not the
  finisher gets «to do» / «doing», and nothing once it is done (no reopening
  either); a task a brigadir set their own leader keeps the old rule — every
  mover, the leader included, sets any status. Each owning router's PATCH asks
  it (`brigadir_tasks.set_status`, `tasks._status_choices`,
  `shift_manager_tasks.set_status`), and the board serves its answer per row as
  `status_options` (`can_status` = any), which `StatusSelect`'s new `options`
  prop lists — the pill never offers what the PATCH refuses («Only a shift
  manager, a top manager or an admin can mark this task done»).
- **Who finishes**: a brigadir's task — whoever runs the unit's board (an admin,
  a shift manager, a top-manager from the first day; `_can_manage`); a leader's
  task from the top — a manager over it (`_governs_from_top`, an admin
  included). On that leader task the unit's BRIGADIR is a mover now, not a
  finisher: they and the leader move it, a manager closes it. A shift manager's
  own task — an admin or a top-manager.
- **Photos and files in every task thread** — `/tasks` and «Smena kunligi».
  The appeal chat's machinery reused whole: `routers/leaders.appeal_body` reads
  the composer (multipart with files; JSON {text} without — every older tab
  keeps working), `relay_uploads` checks each file (≤10 per message, ≤20 MB,
  `upload_guard`) and stores it in the ARCHIVE CHANNEL before the comment is
  written (one refused file refuses the message), and `_stream_tg_file`
  streams it back. New table `leader_task_comment_files` (comment →
  `ON DELETE CASCADE`, so a deleted comment or task takes its files);
  `task_board.add_comment` / `comment_files` / `task_file` (a file is reachable
  only through ITS task's address) / `stream_file` / `send_file`. Each tier's
  router serves `GET {tier}/{id}/comments/files/{fid}` and `POST …/send` (the
  bot DMs it — a mini app has no downloads folder). A message may be a file
  alone; its notice then quotes «📎 name, name». Not in the exam: the sandbox
  chat takes words only, so `/tasks` turns attachments off while
  `isExamOn()`.
- **The status is set on «Smena kunligi» too** (the operator, the same day:
  «can you put here done or in process or to do»). Each task's pill in the
  block is `StatusSelect`, offering the day read's per-task `status_options`
  — the owning router's rule again (a brigadir's task: whoever runs the
  unit's board; a leader's task from the top: a manager over it, through the
  TASK page) — and saving through that router's PATCH; a refusal is a toast.
  «Muddati o'tgan» is no status, so a late task keeps a red ⚠ beside its pill.
  On a phone «Eslatish» shows as its bell alone, so the picker, the bell and
  the chat stay on one line.
- **The bot cards say how to answer**: `task_from_top` gained «📎 Bajarganda:
  izohga rasm yoki fayl yuboring — «Bajarildi»ni rahbariyat belgilaydi», and
  `task_reminder`'s answer row now asks for a reply with a photo or file
  instead of «set its status».

## Every new concern to Umarbek Karimov — RETIRED 2026-11-16

From 2026-11-11 Umarbek Karimov (shift manager) got EVERY new concern in
Telegram as a «Yangi xavotir qo'shildi» bell row + DM, whatever its
department (`concerns.tell_watchers`, `ALL_CONCERNS_WATCHERS`). The operator
(2026-11-16): he is told about a concern **only when he is a party to it** —
it is assigned to him, escalated or returned to him, he holds it, or a
message in its chat reaches him as one of its trackers. The broadcast, its
name matcher and its test are deleted; nothing replaces them. Bringing a
watcher back is a new ruling, not a constant to refill.

## «Ячейка ҳавотирлари» register filters (`/cell-concerns`, 2026-11-16)

The register answers ONE question — what still waits on somebody — so it opens
on the status view «Ochiq · Hal qilindi · Hammasi» (a `SegmentedToggle` with a
count on each pill, «Ochiq» first). The view is the register's own and is
applied in the browser; «Tahlil» splits by status itself and never takes it.

- **The period is remembered for the day it was picked, never longer**
  (`cellConcerns.period` stores `{from, to, on}`). Kept forever, a range picked
  once hid every concern filed after it — the page opened on October in
  mid-November and said nothing. A new day starts on «Barcha vaqt», which sends
  no date bound at all (the trend starts at the first filing, not 2015).
- **The scope chain is plant → shift → brigadir → cell**, inside the
  `FilterPanel` like /concerns; shift and brigadir only for admins, top- and
  shift-managers. Each level lists what the levels above leave and says so
  (`concerns.narrowedBy`); the cell picker is searchable and names the leader
  beside the code. Server side the chain narrows by the UNIT a concern was filed
  under (`brigadir_manager_id`, `_page_rows` — the plant through
  `factory_scope`), so the register and «Tahlil» stay one answer.
- The search reaches «Tahlil» too (`q`, 300 ms after the last keystroke) and
  matches № · name · cell · text on both (`_search_text` is the twin).

## A cell concern's NAME is picked from Verifix (`/cell-concerns`, 2026-11-23)

The operator, 2026-11-23: workers typed their name and «Kim yozgan» split one
person over many spellings («Мастура», «PARDAYEVA MASTURA»…) — «use a selector,
we have the Verifix connection; match the old ones with the workers on the
same day». This reverses the 2026-09-04 typing ruling.

- **The form picks, never types.** Step «Ismingiz» is a searchable
  `StyledSelect` over `GET /api/cell-concerns/workers?cell=&q=`: the cell's
  people now (`kelish_placements`, open stints); 2+ letters list those it fits
  first, then the plant's current workers it fits (`people.search_current`) — a
  worker lent in from another cell must still find themself. The cell must be
  one this PC may file for (`_leader_cells`).
- **The filing carries the employee id** (`leader_concerns.worker_id`); the
  server takes the NAME from Verifix (`concern_workers.person`), never from the
  client, and writes it to `worker_name` / `concern_owner`, so the marker
  (`worker_name IS NOT NULL`), the KPI, the notifications and the search are
  unchanged. A tab on an older bundle sends only a typed name: it is matched to
  the cell's (then the unit's) people now, else kept as typed.
- **The matcher** (`concern_workers._pick`): every typed word is one of a single
  person's own (a one-word entry only against the surname or first name),
  else the surname + first-name scorer (`name_map._pair_score`, either word
  order) with a winner 0.1 clear of the runner-up. Two who fit, or none →
  the row stays as typed. Never a guess.
- **«Kim yozgan» groups by `worker_id`**, a typed name nobody fits by its exact
  string; the «approximate list» caveat and the «write your full name» hint are
  gone. Names print through `tl()` on every tab. «Xodim kartasi» counts a
  filing by its id where it has one (`people.concerns`).
- **The filings typed before** were matched once — see `docs/data-fixes.md`.
- The exam sandbox has the twin door (`/api/exam-sandbox/cell-concerns/workers`
  over `sb.WORKERS`).

## On a phone (2026-11-20)

See `docs/leader-phone.md` — /cell-concerns, /concerns and /tasks on a phone, and **a leader deletes no concern at all** (`concerns.may_delete`, every width). md+ is unchanged.
