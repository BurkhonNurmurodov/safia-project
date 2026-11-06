# Laboratory pages

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## «Nomzodlarni baholash» — the supervisor-candidate panel (`/assessment`, Laboratory, 2026-10-31)

The operator's request: a screen Judges use to grade a candidate for the
Supervisor role during a live, verbal assessment. Page key **`assessment`**,
Laboratory nav group, **ADMIN-ONLY until the operator opens it** (to the
judges) on the Access / Permissions tab. `services/assessment.py` is THE rule,
`routers/assessment.py` (`/api/assessment`) the door, `pages/Assessment.jsx`
(list + bank tabs) and `pages/AssessmentGrade.jsx` (`/assessment/:id`, the
Judge Grading Dashboard) + `components/assessment/` the page, words in
`pages/assessmentText.js` (four languages).

- **Five department seats**: OKK · HR · Production · TB · Kaizen
  (`DEPARTMENTS`, shown in `SEAT_ORDER` kaizen → production → tb → hr → okk).
  Two question types: theory · practical.
- **The draw is 20 questions** (`BLOCKS`, `draw`): Kaizen + Production 11 —
  4 theory, 7 practical — drawn from the two departments' questions TOGETHER,
  with a per-department MINIMUM (`min_each`, the operator 2026-10-31: «set a
  minimum»): each of the two gets 2 theory and at least 3 practical, the
  seventh practical goes to either at random — so the two judges grade 5 or 6
  each. TB, HR, OKK 3 each, any type. Order: block by block, theory before practical
  inside a block, random within. `random.SystemRandom`. A retake prefers the
  questions this candidate was NOT asked before (`seen`), falling back to them
  only where the bank runs out. A bank that cannot fill every part — a
  department's minimum included — refuses the sitting whole (409 `pool_short`
  naming each part, need vs have, with its `department` where it is one) — never a
  short sitting. The draw COPIES each question's text, department and type onto
  `assessment_items`, so editing or archiving the bank changes no sitting.
- **Six tables** (created by `create_all`, nothing to migrate):
  `assessment_candidates` (a worker of the plant + an optional note — see the
  next bullet), `assessment_questions` (the bank; never
  deleted, `archived_at` takes one out of the draw), `assessments` (one sitting:
  open → closed), `assessment_items` (its 20), `assessment_evaluations` (=
  JudgeEvaluation: one per seat, unique per (sitting, department) AND per
  (sitting, judge_key)), `assessment_grades` (pass · fail · NULL + an optional
  note, per scorecard × item).
- **A candidate is one of the plant's CURRENT WORKERS, picked — never typed**
  (the operator, 2026-10-31: «we should not be creating anyone, we should
  select from the database of our current workers»). The «Yangi baholash»
  form searches the Verifix directory the turnover KPI keeps
  (`turnover_people`, status W, the 23:40 read): `GET /api/assessment/workers
  ?q=` (admin-only, ≥ 2 letters, Latin and Cyrillic folded alike through
  `transliterate` — «карим» finds «Karimov», «qochqorov» finds «Qo'chqorov» —
  matches starting with the first word first, 30 rows + `more`, the directory
  kept 300 s in memory, `directory` = its count and read time, printed under
  the field). `POST /api/assessment/assessments` takes `employee_id` (or an
  existing `candidate_id`); a typed name is refused 400 `pick_worker`, a
  person not working now 404 `worker_not_found`. One candidate row per
  `employee_id`, reused on a retake; its job, unit and cell code
  (`assessment_candidates.employee_id` / `job` / `unit_name` / `cell_code`,
  `startup.add_assessment_answer_columns`) are re-copied from the directory at
  every new sitting, and shown on the list, the phone card and the scorecard
  header («Кондитер · 8920»). A worker assessed before says so in the picker
  card («N marta baholangan» — and its earlier questions are avoided). Rows from before keep their
  typed name and carry no `employee_id`.
- **A judge grades ONLY their own department's questions** (the operator,
  2026-10-31, asked; `rules.own_items`). The Kaizen + Production block is split
  between those two judges by each question's own department; TB, HR and OKK
  each grade their 3. Every question therefore has ONE verdict, its
  department's judge's. The server refuses a grade on another department's
  question (409 `not_your_question`), the scorecard lists only the judge's own
  questions (keeping the sitting's numbers, so the panel can still say «the
  7th»), and each seat's progress is out of its own count (`seats[].total`).
  The block's split is held near even by `min_each` (5 / 6); the bank must hold
  at least 2 theory and 3 practical of EACH of Kaizen and Production. A seat
  whose department drew nothing (impossible for the five departments today)
  would see a note and submit the overall feedback alone.
- **A seat belongs to the PROFILE** (`identity.viewer_profile_key`, else
  `tg:<account>`): one person never holds two seats of one sitting. Anybody who
  may open the page claims a free seat; a judge may MOVE an unsubmitted
  scorecard to another free seat — the grades given as the old department are
  deleted by the move (`dropped`, said in the confirm first); the seat's judge
  or an admin may free an unsubmitted seat (its grades go).
- **Grading is saved per tap**: `PUT /api/assessment/draft/{id}/grades/{item}`
  (`verdict` and/or `note`, a key left out is left alone) and
  `PUT …/draft/{id}/feedback` (debounced, flushed on blur). `/api/assessment/draft/`
  is in the action register's `_SKIP` — the submit is the recorded act.
- **Submit is FINAL** and refused until every one of the judge's OWN questions
  is graded (400 `ungraded` + `positions`) and the overall feedback is non-blank
  (400 `feedback_required`). The client greys the button and lists the
  ungraded numbers (each scrolls to its question). The fifth submission closes
  the sitting by itself (`closed_by: auto`).
- **The panel stays independent**: a viewer holding an UNSUBMITTED seat gets
  no results (`results_hidden: "own_pending"`) — on the page and in the list —
  only every seat's progress (x/own count, submitted). Results fold SUBMITTED
  scorecards only, each grade on its own department's questions alone: pass ÷
  graded overall, per judge, per type; every question with its one verdict and
  note («Topshirmagan» while its judge has not submitted); every judge's
  overall feedback. **No pass mark exists**, so percentages wear no traffic light — colour
  on this page means a verdict (green Pass / red No pass) and nothing else;
  departments and types are icon + word chips.
- **Admins only**: the bank (read and write — a judge never browses it; lines
  of the add form become one question each, an identical active question of
  the same department is skipped), opening a sitting, closing / reopening it,
  redrawing its questions and deleting it — the last two only while nobody
  has entered anything (409 `has_grades`), except that a TEST sitting may be
  deleted at any time (below). A delete takes the sitting's scorecards, grades
  and drawn questions with it, and the candidate too when they are left with
  no other sitting (`candidate_removed`); the Jurnal records how many
  scorecards and grades went. There is no candidate-level delete: a candidate
  goes with their last sitting.
- **The scorecard on a phone** (2026-10-31, the operator's screenshot): a
  question card is number + type on one line and the text full width under it
  (a number column of its own took a fifth of the width), the verdicts read
  green / red before a tap (`idleFg`), and «Kutilgan javob» / «Izoh» share one
  quiet row. A bar docked to the bottom edge carries the progress and the ONE
  next step — the next ungraded question, then the overall feedback, then
  submit — so the card's own submit row and the top progress show on sm+ only.
  Once the judge sits on a seat, the panel folds to one line of seat badges
  (it folds again after a seat is taken or switched).
- The page polls the sitting every 5 s while it is open; a scorecard's local
  copy is seeded ONCE per scorecard, so a poll never rewrites text under a
  judge's fingers. Instants are sent on the plant's clock (Tashkent) and
  printed as sent.
- The Jurnal files every act under «training» (`assessment.*`), so the
  assistant classes them as the exam's and never runs one.
- **A question may carry its EXPECTED ANSWER** (`answer`, both tables,
  `startup.add_assessment_answer_columns`, run phase, both entrypoints): set in
  the bank's question form (only when ONE question is added — a multi-line add
  refuses one, 400 `answer_one`), copied onto the sitting at the draw like the
  text, and opened by a judge under the question («Kutilgan javob»). In the
  bank a row (or its «Javob» button; on a phone «Javobni ko'rish») opens the
  question read whole with its answer and an Edit button (`QuestionView`) —
  the table cuts a question to one line and has no room for the answer. Never
  shown to a candidate (no candidate view exists).
- **Questions, answers, notes and feedback are printed AS WRITTEN** — never
  through `tx`: they are authored prose, often Russian, and `tx` turns Cyrillic
  into Latin letters for an Uzbek reader («S priznakami kakix…»). Names still
  go through `tl`.
- **The TB bank was seeded once** from the operator's document «Вопросы по
  пищевой безопасности для аттестации производственного персонала» — 20
  theory questions with their model answers, verbatim — by TEMPORARY
  `startup.seed_tb_food_safety_questions` (`later`, both entrypoints, flag
  `assessment_tb_food_safety_seed_2026_10_31_v1` written with the rows, Jurnal
  `assessment.questions_imported`) over `services/assessment_seed_tb_oct31.py`.
  A question already in the TB bank is skipped (its missing answer filled in).
  Delete the module, the function and both calls once the flag reads «done».
- **SAMPLE questions for trying the page out** (the operator, 2026-10-31: «for
  now, later we delete and put actual questions»): 40 written by the
  assistant, in Russian, with expected answers — Kaizen 5 theory + 7
  practical, Production 5 + 7, HR 4 + 4, OKK 4 + 4 — seeded once by TEMPORARY
  `startup.seed_sample_questions` (`later`, both entrypoints, flag
  `assessment_sample_questions_2026_10_31_v1`) over
  `services/assessment_seed_samples_oct31.py`. Every sample row is stamped
  `created_by = assessment.SAMPLE_SOURCE` («Namuna (sinov uchun)»), wears a
  «Namuna» chip, and the bank's bar «Namunalarni o'chirish» (admin, danger
  confirm naming the sittings, retype «NAMUNA») removes them all —
  `DELETE /api/assessment/samples`: every sample question, every sitting that
  drew one (with its scorecards and grades) and a candidate left with no
  sitting; real questions stay. `GET /api/assessment/samples` says what goes
  first. The flag outlives the removal, so a later boot never brings them
  back. The endpoints and `SAMPLE_SOURCE` stay; delete the seed module, its
  function and both calls once the flag reads «done».
- **TEST MODE** (the operator, 2026-10-31: «add test mode»): a sitting drawn
  from at least one sample question (`_is_test`) lets an ADMIN hold every seat
  and grade them in turn — the first seat under their own key, each further one
  under «<key>#<department>» (so `uq_assessment_eval_judge` still holds). The
  seat on screen is a `seat` query parameter on the detail, the grade and
  feedback autosaves and the submit (`_pick_mine`: that seat, else the first
  open one); the results rule is that seat's (`_hidden(current=…)`), the list's
  is «any of my seats open». The page shows a banner, dashes the admin's other
  seats with «Shu o'rinda baholash» / «Varaqni ko'rish», and a free seat says
  «Shu o'rinni olish» rather than offering a move. A non-admin, and everybody
  on a REAL sitting, keeps one seat (a second claim moves it, `from`). The mode
  ends with the samples: removing them deletes every test sitting. **A test
  sitting may be deleted ONE at a time, graded or not** (the operator,
  2026-10-31, asked: «Test ones only»): its grades are test grades, so
  `rights.delete` is `admin and (test or not work)` and the confirm says the
  scorecards and grades go with it (`deleteMsgTest`). A real graded sitting
  stays undeletable.
- Not built: notifications to judges, an export, a candidate-facing view (by
  the request), a pass mark.

## «Xodim kartasi» — one person of the plant (`/people`, Laboratory, 2026-10-31)

The operator's request: one page that shows everything Safia IMS knows about
ONE person — a worker, a leader or a brigadir — in the freelancer-profile
shape: a hero card, a tab strip, the rest below. Page key **`people`**,
Laboratory, **ADMIN-ONLY until the operator opens it on the Access tab**
(`DEFAULT_PAGE_ACCESS["people"] = []`). `services/people.py` folds,
`routers/people.py` (`/api/people`) scopes, `pages/People.jsx` +
`components/people/` + `pages/peopleText.js` (four languages) draw it.

- **Identity is the Verifix EMPLOYEE ID** (`turnover_people.employee_id`, the
  23:40 directory read), never a name. `/people` is the search (the directory,
  every status, working people first); `/people/:employee_id` is the card;
  `/people?find=<name>&code=<cell>` is the door every NAME-only row elsewhere
  opens through — one person opens the card, namesakes are listed (narrowed by
  the row's cell), never guessed. `GET /api/people/resolve` answers it.
- **Reach** (`_scope`, applied to the card, the photo, the search and the
  resolver): admin / top-manager / a page grant at "all" → everybody; a
  supervisor → the people whose CURRENT cell (the directory's org unit →
  `turnover.cell_map`) is in their unit; a shift-manager → shift ∩ plant
  (`shift_scope.unit_ids`); a leader → the cells they run or own; anybody else
  403. **A person outside the reach is a 404**, never a blank card. A
  dismissed person with no cell is visible to the unscoped only.
- **Nothing is measured here; every figure is read through its owner.**
  Attendance under /workers' predicates (`routers.workers._py_came` /
  `_py_on_leave`, imported), the day-close gate (`day_state.confirmed_pairs`);
  the category today vs the step the tenure expects (`category_compliance
  .person_rows`, the KPI's own per-person computation); exchanges and role
  changes from BOTH registers (`hr_documents` by name, `live_documents` by
  employee id — /workers' Movements union); the HR journals
  (`category_compliance.events_by_person`) and `turnover_leavers` for the
  career; «Ish grafigi» marks (`kelish_marks` by `kelish.worker_key`); the
  worker's own concerns (`leader_concerns.worker_name`, /leaders-kpi's bucket);
  the assessments as `/assessment` shows them to THIS viewer (its own
  `list_assessments`, `results_hidden` included — absent when the viewer may
  not open that page); the photo through `verifix_explore.photo` (the org
  read's main identification photo, page-gated `GET /api/people/{id}/photo`).
- **ATTENDANCE IS NAME-KEYED, AND THE CARD SAYS SO.** An `attendance` row has
  no Verifix id (the Excel never had one, and the live close's copy keeps the
  shape), so closed days are matched by the folded name (`kelish.worker_key`,
  the «Ish grafigi» identity; every spelling the table holds is kept in an
  incrementally-read map, `_att_names`). Where the directory holds a NAMESAKE
  (another id folding to the same key) a row is attributed only when its cell
  is this person's own placement that day — the live read's cell
  (`live_verifix_reads` `emps[eid].c`, id-keyed) from `live_day.LIVE_FROM`, the
  HR journals' placement before it — and no namesake stood there; everything
  else is WITHHELD and counted (an amber notice names how many). Before
  2026-08-01 rows carry no cell, so a namesake's days then cannot be
  attributed at all. The day still being worked is read BY ID off the stored
  live read (`live_staff.person`, every approved document laid over it — never
  a Verifix call). The spec asked for id-keyed live closed days; the copy
  carries no id, so the cell match above is the id-keyed part.
- **The hero** (every tab): photo (initials when none) · name (Verifix's
  capitals in title case, `nameCase`) · job · status (dismissed on …) · tenure
  from the CURRENT employment's hiring date · cell as CODE + letter + its
  «Boshqaruvchi» + brigadir + shift (never the workshop) · category vs
  expected (`VerdictChip`) · today's live state. Under it the page period
  (`DateRangePicker compactLabel`, default the last 30 days) and four
  `KpiDeltaCard` tiles — **Davomat %** ((came + leave) ÷ listed closed days,
  the /workers rule, today «so far» included), **Kelgan kunlar**, **Ishlagan
  soat**, **Ko'chishlar** (approved exchanges) — each against the previous
  period of the same length, with a **7-WEEK** sparkline (a person's day is
  0 or 100%, so a 7-day line of it is noise; the spec's «7-day sparklines» were
  read as weekly points, and they live on the tiles rather than repeated on
  «Umumiy»).
- **Tabs** (`SegmentedToggle asTabs`, `size="lg"` on a phone, `?tab=` IS the
  state): **Umumiy** (facts + «Oxirgi voqealar», one dated feed of the last 365
  days, 20 at a time: an absence a live day's copy names «X», a missing
  check-out, exchanges, role changes, hires / transfers / categories /
  dismissals, concerns filed, assessments sat, honours; each row opens where it
  lives — /staff on that unit-day, `/concerns?open=`, `/assessment/:id`) ·
  **Davomat** (a Monday-first month grid on `DayStepper month`, painted with
  /workers' `ATT_SEGMENTS` read for one person — came 100% darkest green, leave
  the next green, absent 0% red, no check-out amber, off and no-row neutral, a
  move arrow, the «Ish grafigi» plan as a dot, today outlined; under it the
  PAGE PERIOD's days as one table, plan beside fact on one line, `Pagination`
  past 50) · **Karyera** (the journals' timeline, a category step judged
  against the tenure's expected step; «Yacheyka tarixi» = runs of one cell over
  days CAME, ≥ 3 days, newest first) · **Mukofot va baholash** · **Havotirlar**
  (№ · date · cell · text · `StChip` status · level · resolved on; counts in
  the head) · **Rahbarlik** — only for a person the live sync tied to a leader
  profile or a brigadir unit (`vfx_employee_id`).
- **Rahbarlik never rebuilds another page's figure.** It names the profile(s)
  and unit(s), the cells run and owned, and links to `/profile/leader/:id`,
  `/brigadir/:id`, /leaders, /leaders-kpi. The «Liderlar KPI» total and place
  show only when a board of this month is ALREADY kept (another viewer opened
  that page in the last five minutes) — read through `KeptAnswers.peek()`, a new
  read-only method that never builds; otherwise the card says to open the
  page. Monitoring % and the brigadir board place are computed in the browser
  on their own pages, so they are links here, not figures (the server cannot
  read them without a second spelling).
- **The ONE new register: `employee_honours`** (employee_id, title, kind ∈
  `people.HONOUR_KINDS` — monthly_best · kaizen · safety · thanks · other —
  given_on, given_by profile key + name snapshot, note; created by
  `create_all`). An admin or the person's own brigadir adds (`Modal` +
  `FormField`, no future date) and removes (`ConfirmDialog` danger); everybody
  who may open the card reads. Neutral chips — a property, never a status.
  Jurnal: `people.honour_added` / `people.honour_removed` (category collab, so
  the assistant needs a Confirm and can never remove one — every DELETE is
  off-limits to it).
- **Privacy**: name, job, unit, cell, dates, category and attendance only.
  Gender, birth month, address, phone, passport, PINFL, family and wages are
  read NOWHERE in this code, whoever the viewer is («Tarkib» keeps coded facts
  for aggregates; this page is about one person).
- **Kept**: the per-person fold (every row, document, concern, journal line)
  in `KeptAnswers("people")` keyed by the employee id — 60 s, served up to 5
  min while one rebuild runs, never to a viewer who wrote since; the period,
  the tab, the honours, the scope, the rights and the assessment rule are
  computed per request around it. The directory fold (`people.directory`,
  every status, 300 s or a newer read) is the ONE fold the assessment picker
  searches too.
- **Entry points** (`PersonLink`, see the template table): /staff's and
  /daily's workers table and phone list (one `AttendanceTable`), the
  `StaffingProofModal` rows, /kelish's worker card («Kartani ochish»), the
  assessment list (desktop rows) and the picker's chosen worker, the
  /leaders-kpi compliance «Xodimlar» view and its explain dialog, and
  «Qidiruv» (workers, the sixth kind). Not linked: «Tarkib» — its breakdown is
  by brigadir / job / cell and lists no person.
- Not built: an export, editing anything but honours, a candidate-facing view,
  id-keyed attendance before the copy carries an id, and a Monitoring % /
  brigadir-board figure on «Rahbarlik».

## «Trello tahlili» — a Trello board's analytics (`/trello`, Laboratory, 2026-11-01)

The operator: «can we have the analytics in Safia program as one page for
Trello analytics», for the «Safia» board (trello.com/b/9Uk8Fq15). Asked, they
picked three of the offered views — the workflow snapshot, the cards open the
longest, the flow over time — and «build generic now» (the page works for any
board). In the Laboratory, **ADMINS ONLY and not grantable** (the operator,
the same day: «make Trello tahlili screen only visible to admin»): there is no
page key, so no Access-tab tick or personal grant can open it — an
`adminOnly` nav row, `RequireAdmin` on the route (an «open as» tab is the
other person and is turned away) and `verify_admin` on every `/api/trello`
endpoint, the «Verifix (test)» model. `services/trello.py` (credential,
client, stored read, jobs), `services/trello_analytics.py` (the figures, pure),
`routers/trello.py` (two routers), `pages/TrelloAnalytics.jsx` +
`components/trello/` + `pages/trelloText.js` (four languages, page AND admin
card), `pages/admin/TrelloSettings.jsx`.

- **The connection is the admin tab «Trello»** (`/panel/trello`,
  tools group, no `capKey` — admin-only, never grantable; the assistant may not
  reach `/api/admin/trello`, `blocked:credentials`). A Trello **API key** (a
  Power-Up's, trello.com/power-ups/admin) and a **token** that key issues —
  the card builds the authorize link (`scope=read`, `expiration=never`). The
  token acts as its Trello member: only boards that member can open are read.
  Key in `app_settings` `trello_api_key` (plain), token `trello_token` SEALED
  (`web_auth.seal_password`), never returned, never logged; the Jurnal records
  that it changed and its length. Both travel in an `Authorization: OAuth …`
  header, never the URL. «Tekshirish» (`POST /api/admin/trello/test`) asks
  `members/me` and stores the verdict (`trello_last_test`).
- **Boards** are added by link or invite link (`board_ref`: `/b/<short>`,
  `/invite/b/<id>`, a bare short link or id), at most `MAX_BOARDS` (12), read
  at once, then every 15 minutes (`trello-read`, `*/15`) plus a catch-up 120 s
  after boot when a read is older than 15 min. One table, **`trello_boards`**
  (created by `create_all`): one row per board with the last GOOD read as
  `data` (lists, labels, members, every card — archived included — and each
  card's list moves from the action history, ≤ 20 pages of 1,000), replaced
  whole; a failed read keeps it and names the failure in `error`. Removing a
  board deletes only the stored copy.
- **What a card is**: open (not archived, not in a «done» list) · done (in a
  «done» list) · archived (archived itself or in an archived list). «Done»
  lists are picked per board on the admin card, else recognised by NAME
  (`DONE_RE`, four languages). `archived_done` (per board, default on): an
  archived card counts as finished, else it leaves every figure but the
  archived count. Created = the card id's timestamp (exact); finished = the
  last move into a «done» list, else (archived and counted) the last archive;
  with no history, the last activity, counted as `approx` and said.
- **The page** (`GET /api/trello/analysis?board&date_from&date_to&list&label`,
  ONE request): KPIs (open · done + archived · stale = open with no activity
  `STALE_DAYS` 14 · average / median / oldest age of an open card); cards per
  list (active / stale / done stack) beside cards per label (open cards, top 8
  + «Others» fold + «No label», the label's own Trello colour on its swatch
  only); created vs finished per day (≤ 45 days) or per Monday-week, with the
  median / average days to finish over cards finished in the period; the age
  spread of open cards as five tiles that narrow the table below; the oldest
  open cards (`MAX_OLDEST` 1,000, sortable, searchable, 50 a page, a card
  opens in Trello). The period (default 12 weeks, min 7 days, max 731) moves
  only the flow; board · list · label narrow everything. A notice names the
  «done» lists in force and whether archived cards count. ↻ reads every board
  now (`POST /api/trello/read`).
- Not built: people / deadline views (offered, not picked), webhooks (the
  15-minute read stands in), checklists, writing to Trello.

## «Audit jadvali» — the `public.audit` table, read-only (`/audit`, Laboratory, 2026-11-04)

Abbos asked for `select * from public.audit;` on production, then for a screen
over it. **No model here creates that table** — something outside this codebase
writes it — so nothing knows its columns in advance: `routers/audit_table.py`
reads the catalog on every request (columns, types, the single-column primary
key, the date column) and `pages/AuditTable.jsx` (+ `pages/auditTableText.js`,
four languages) draws whatever the table holds. **ADMINS ONLY, not grantable**:
an `adminOnly` Laboratory row, `RequireAdmin` on the route, `verify_admin` on
every endpoint (the «Trello tahlili» model).

- **Read-only by construction**: every request runs in a READ ONLY transaction,
  statements bounded at 20 s (`allow_long`). Values go through the report
  door's masking (`ops_door.mask_rows`) — a credential-named column or a
  credential-shaped value reads •••, and the search never looks inside a
  credential-named column (it would reveal a masked value letter by letter).
- `GET /api/audit-table/meta` (exists · kind · owner · size · ≈rows · may the
  app read it · columns with a kind: number · timestamptz · timestamp · date ·
  bool · json · text · the date column · the default order); `GET /rows`
  (`page`, `size` 25/50/100/200, `q`, `date_from`/`date_to` on the date column
  in Tashkent days, `sort`/`dir` — a sort key not among the columns falls back
  to the default; `total` is the exact count, None with `est_rows` when the
  count passes 20 s; values cut at 500 characters); `GET /row?key=` (one row
  whole, by its primary key — 409 `no_pk` without one); `POST /export.xlsx`
  (the filtered rows in the screen's column order, ≤ 20,000; logged as
  `export.audit_table`).
- **The page**: one card — `public.audit` with kind · owner · size, the row
  count; the period on the date column (hidden when there is none; «Barcha
  vaqt» by default), a search over the values, Excel, the `ColumnsPicker`
  (ui-prefs `audit.table.cols`); one-line rows, newest first, every column
  sortable; a row opens the record whole (JSON pretty-printed). A missing table,
  a table the app may not read, and a failed load are three different states;
  the second hands over the fix — `GRANT SELECT ON public.audit TO <role>;`
  naming the account the app connects as (`db_user` on `/meta`, the database's
  own `current_user`) with a copy button, since the app cannot grant itself.
- **Production, 2026-11-04**: the table is owned by `safia_prod_rw`, and the
  app (`safia_prod`) may not read it — the screen shows the GRANT until the
  owner or a database admin runs it.
- Verified on a throwaway Postgres (a table with a key, a view without one, a
  missing table) and in headless Chrome over those answers. What production's
  `public.audit` actually holds was not seen by the code's author.

## «Notion vazifalari» — the Notion task list and its reminders (`/notion-tasks`, 2026-11-02)

The operator: the stand-alone reminder bot (`notion-tasks/tracker-bot`, GitHub
Actions started hourly by cron-job.org, settings on a GitHub Pages site) needed
a paid server to run reliably, so it was MERGED into IMS: «Add notion tasks to
the Safia IMS» plus «one settings page, only visible for the admins». Rulings,
asked one by one: the reminders move onto the IMS server AND a read-only tasks
page; the same bot (@Safia_Tracker_agent); the team stays «Notion name →
@username»; /tasks, /id, /help come back in the group; the page admin-only
until opened on the Access tab; read-only («Open in Notion» to change); the
settings an admin-panel tab; the group messages stay Russian; one tool,
«Preview to my Telegram»; the TEST group first, the work group switched on
later. The GitHub workflow was disabled the same day (`gh workflow disable
Reminders`, BurkhonNurmurodov/safia-tracker-bot); the cron-job.org job is the
operator's to delete.

- **`services/notion_tracker.py` is THE module.** Its middle is the GitHub
  bot's own code carried over line for line (parsing, `daily_people`, the rich
  per-person message and its plain fallback, `digest_messages`, `/id`), so the
  messages are word for word what the team had; `S()` is that code's SETTINGS,
  a ContextVar set by `using(s)`. Around it: storage, the job, the webhook.
- **Storage** — `app_settings`: `notion_tracker_settings` (the tab's JSON:
  enabled, send_at, days, remind_days 0–3, sections_open, team, groups),
  `notion_tracker_bot_token` (SEALED, `web_auth.seal_password`; never returned,
  the register records its length), `notion_tracker_status` (last send, last
  error as a CODE + detail, the bot, each group, Notion's counts),
  `notion_tracker_memory` (Telegram IDs behind @usernames, groups the bot is
  in, the webhook signature). Writes go through `_mutate` (a row lock — the job,
  a webhook update and a request may all write one). What was sent is
  `notion_tracker_sent` (one row per key: the group's day, each person, each
  part), so a retry or a restart never repeats a message; kept 60 days.
- **When**: the minute job `notion-tracker` (jobs lock, one copy) sends the
  day's messages at the first tick after the send time (`daily_wait`: no
  groups · done · paused · day off · not yet); a failed run retries in 10 min,
  and a settings or token save retries at once. The plant clock is UTC+5.
- **Seeded once** (`seed`, deferred boot step, insert-only): the GitHub bot's
  settings with the groups replaced by «Test Group» (-1003966895975) and
  `enabled: false`, plus its learned Telegram IDs and groups. The work group
  («Рабочая группа», -1002661831949) is listed under «Bot qo'shilgan
  guruhlar» to add in one tap.
- **Notion** is read with the token saved on the tab («Notion tokeni»,
  `notion_tracker_notion_token`, SEALED) when there is one, else the platform's
  `NOTION_TOKEN` (`notion_kaizen._token`, the Kaizen page's). They are two
  integrations: on 2026-11-02 the platform's answered 404 on the "Production"
  list while the GitHub bot's own token read it, so the tab takes the bot's.
  `PUT …/notion-token` reads one row of the list before storing (400
  `notion_refused` / `notion_no_access`). Data source `DEFAULT_DATA_SOURCE`,
  fixed. Nothing is written to Notion.
- **The bot's updates** arrive on `POST /bot/notion-webhook` (secret token
  `sha256("notion-tracker-webhook:" + SECRET_KEY)`, checked first; set by
  `setup_webhook` when a token is saved and at boot when it changed — only on an
  HTTPS `backend_url`, so a laptop never takes the webhook), handled on the
  module's own single thread, deduped by update_id. A group Telegram upgrades
  to a supergroup is followed in the settings (`_move_group`). /tasks answers
  only in a configured group; /start elsewhere says an admin connects groups
  in IMS. Skipped by the action register (`_SKIP`) like `/bot/webhook`.
- **Doors** (`routers/notion_tasks.py`): `GET /api/notion-tasks` (page key
  `notion-tasks`; read at most once a minute, every 10 s on «refresh»; 409
  `notion_missing`, 424 for a Notion refusal); `GET/PUT /api/admin/notion-tracker`,
  `GET …/status` (the live look: getMe, each group, Notion), `PUT …/token`
  (checked with getMe first — a refused token is not stored — then sealed and
  the webhook set), `POST …/preview` (today's messages to the caller's own
  chat, nothing recorded; 409 `start_bot` when the admin never pressed Start).
  Admin endpoints refuse an «open as» tab. The assistant may not touch the tab
  (`blocked:credentials`). Jurnal: `config.notion_tracker_saved`,
  `config.notion_tracker_token_set`, `notification.notion_preview`.
- **The page** (`pages/NotionTasks.jsx`, «Sifat» nav group after Kaizen):
  four tiles (overdue · today · next 7 days · no deadline, open tasks only), then
  one table per section — overdue, today, tomorrow, next 7 days, later, no
  deadline, done (only when «Holat» says so) — one-line rows; a row opens the
  task (status, people, deadline, priority, parent, the whole «Izoh») with
  «Notion'da ochish». Filters: «Holat» (open · done · all) and «Mas'ul»
  (incl. «Mas'ulsiz»), plus search. Words: `pages/notionTasksText.js`
  (4 languages), helpers `components/notion/notionUtil.js`.
- **The tab** (`pages/admin/NotionTrackerSettings.jsx`, «Vositalar», id
  `notiontracker`, no capKey): status (on/off and what today holds, last send,
  bot, Notion, last error, Notion people missing from the team with one-tap
  add, the preview); schedule; groups (each with its reachability, the bot's
  other groups to add); team (ordered — messages go in this order); the bot
  token. Schedule + groups + team are ONE draft with one Save
  (`useAdminDirty`); the server checks it whole and names the field.
- Not built: a write to Notion, a per-person «my tasks» page, other Notion lists.

## Live shift monitor (`/live`, Laboratory)

From **2026-09-04** the Laboratory carries a wall-screen page for shift
managers — `pages/LiveOverview.jsx` (+ `components/live/`) over
`GET /api/live-overview` (`routers/live_overview.py` FETCHES,
`services/live_overview.py` COMPUTES — the deck/matrix split, so nothing in
`services/` imports a router). It answers two questions for the shift on the
clock, per brigadir and per cell: how much did we wait so far, and how fast is
the plan being filled. Page key `live`, **admin-only until the operator opens
it** (no roles by default; the intended reader is the shift-manager, who is
locked to their shift ∩ plant server-side via `shift_scope` whatever `?shift=`
says; a supervisor or leader would see their own unit only).

- **Every figure is one the platform already prints.** Waiting is the cells'
  filed intervals (the `/idle-cell` rows, approved); the UNIT figure is
  `idle_source.unit_downtime`, the headcount-weighted mean every KPI page
  reads, so the number a brigadir is ranked by here is the number `/downtime`
  shows tomorrow. ПЛАН/ФАКТ minutes are `pp_calc.line_minutes`, the Positions
  table's own resolution of the per-line quantity rule; people are counted
  under `idle_source._counted_hc` (imported, not re-spelled).
- **The shift clock is `cell_hours.defaults`** — the two «Smena vaqtlari»
  SHIFT defaults, printed in the page header. This is the first consumer of
  that register (its own section says to ask before wiring one): only the
  shift-level pair is read, never a cell's own clock, and it moves no score —
  it decides which day is on screen and how far through it we are. Until an
  admin confirms those two rows the page runs on the 08:00–20:00 /
  20:00–08:00 placeholders, which is the one open decision this page carries.
- **The day on screen is the most recent shift start** (`shift_frame`): a night
  shift at 02:00 belongs to yesterday's date, which is also the date its
  leaders file under. After the window closes the frame stays on that day at
  100% until the next start, so a screen between shifts shows the last result,
  never a blank. `?date=` (admin/top-manager only) replays a finished day for
  looking at the design when nothing runs — marked «not live» on screen.
- **«On pace» is a linear floor, judged late and never on silence.** Expected
  = plan × elapsed fraction; nothing is judged in the first 10% of the shift;
  a unit with a plan and NO ФАКТ is «fakt kiritilmagan», never «lagging» — the
  SAP «Поставлено» often lands once, after the shift, and a screen that paints
  every brigadir red every morning teaches them to stop reading it. Freshness
  (`pp_daily`/`pp_line_daily` `updated_at`) is shown per unit and flagged past
  120 min. Thresholds are the constants at the top of
  `services/live_overview.py`, ride on the payload, and are printed in the
  page legend so red never has to be guessed at.
- **Until the day's attendance is uploaded the unit's waiting is an ESTIMATE**
  (plain mean over its registered cells, marked as such); it switches to the
  weighted figure the moment the file lands. A page dark until the file arrives
  would be dark for exactly the hours a shift manager watches it.
- **Events are SEATED on the shift's clock** (`live_overview.seat`): a night
  shift's «01:00 → 01:40» reads as the small hours after opening, not the
  morning before. Totals are untouched (the union is the union); only «stopped
  right now» needs the placement.
- Polls every 30 s (`refetchIntervalInBackground`), keeps the last payload
  through an outage and says so, animates changes (count-up, FLIP reorder of
  the board, slide-in alerts, pulsing stopped cells), all off under
  `prefers-reduced-motion`. Fullscreen is requested on the page ROOT, so the
  sidebar leaves with it; the button hides where the API is absent (Telegram).
- **Grid tiles are deliberately INERT** (no `CellLink`): a dense grid on a
  touch TV must not navigate away from the monitor. The alert feed and the
  unit rows carry the links instead.

## The goal board («Maqsadlar», `/targets`, Laboratory)

Redesigned **2026-09-26** on the operator's three rulings (asked with mockups
and answered): a goal opens on **its own page** (`/targets/:id`,
`pages/TargetGoal.jsx`), the board is **one list grouped by status**, and each
goal carries a **quick «Yangilash»** dialog for all of its results. Still an
admin-only test screen: the goals are one JSON blob per profile in
`/api/ui-prefs/targets_lab`.

- **`components/targets/useGoals.js` is THE data door** — the react-query
  cache (`["targets","goals"]`) is the one copy both routes read and write, and
  the debounced save lives at MODULE level so moving between the board and a
  goal never cancels it; the last page to unmount flushes. Sample goals (for a
  profile that never saved) are served from the query, never written back
  until something changes, and carry FIXED ids (`demo-3`, `demo-3-1`) so a
  reloaded or shared `/targets/demo-3` still resolves.
- **On the BOARD, groups replace the status filter and the sort menu** (both
  removed on purpose — do not bring them back without asking): «Diqqat
  talab» (overdue · behind · at risk, worst first) → «Reja bo'yicha» →
  «Boshlanmagan» → «Erishilgan» (collapsed, remembered). `utils/targets.js`
  `GROUPS` is the one definition; the summary card above counts the goals the
  search and the area filter left, and names that count.
- **The table came back as a TAB of its own, «Reyestr»** (2026-09-29, the
  operator's request — the board is «Doska»). `SegmentedToggle asTabs` is the
  page's FIRST row (`targets_view`), above the toolbar, because the search and
  the area filter narrow both. `components/targets/GoalRegister.jsx` is the
  table, one fact per column, reading left to right what · how it goes · when
  · who and where · is anybody updating it: Maqsad (locked; FROZEN while it is
  the first column, its edge an inset shadow because a collapsed border stays
  behind when its cell sticks) · Holat · Bajarildi (the card's bar with the plan
  tick) · Sur'at (done − today's plan in the card's own words, the plan under
  it) · Natijalar* · Boshlanish* · Muddat (+ days left) · Mas'ul · Yo'nalish ·
  Yangilangan (amber after a week or never) · a «Yangilash» row button, whose
  word shows only while the card (`@container`) is ≥ 76rem. *Hidden by default
  so the default set fits a 1280px screen; the `ColumnsPicker` in the card
  header saves to ui-prefs `targets.register.cols`. Every header sorts
  (`targets_reg_sort`; default status → the furthest behind → the nearest due,
  which is also every tie-break), a value with no answer sinks whichever way a
  column runs, and a sort on a column since hidden falls back to the default.
  A row opens the goal (the title is the real link). Below `sm` it is a list
  under a sort control, each row printing the fact it is sorted by. It computes
  nothing `utils/targets` does not.
- **Colour means STATUS only.** A goal's area is an icon + a word
  (`targetsUi.AREA_ICON`), never a colour — the categorical palette opens on
  red/green/yellow, and an on-track goal used to wear a red stripe.
- **Pace is said in words under the bar** («Bugungi reja 80% · 28% orqada»),
  with the plan drawn as an upright tick on the bar and repeated in front of
  the caption; the forecast on a goal's page is one whole sentence per case
  (`targets.forecast.*`).
- A numeric result reads «now → target» («27 → 10 ta»), because «27 / 10» read
  as «27 of 10» for a result that must shrink.
- Cards and result cards lay out by THEIR OWN width (Tailwind `@container` /
  `@md:`), not the screen's: two columns on a tablet make phone-width cards.
- Number boxes are text with a decimal keypad and parse «47,5» and
  «43 200 000» (`parseNum`); inputs are 16px on a phone so iOS does not zoom.
- The quick dialog writes a check-in only for a numeric result whose value
  moved; opened for ONE result («Qiymat kiritish») it always writes one.
  Deleting a history entry asks first.
