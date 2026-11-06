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
