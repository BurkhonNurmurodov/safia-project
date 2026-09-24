# Dashboard exam («Imtihon») — plan

Leaders take an exam ON the dashboard: fifty tasks that make them use the real
pages — mark a task done, file a concern, find where the checklist rules are
written — and the platform checks each one by itself. Written 2026-09-18 from
the operator's twelve answers, built on the branch `claude/dashboard-exam` and
shipped 2026-09-24 (v4.154.0). **Built as designed, with the deviations listed
under «What changed while building» at the end.**

## The twelve decisions (the operator, 2026-09-18)

1. **Checking is automatic.** No grader. And nothing a leader does during an
   exam may change real data.
2. **Exam writes land in separate test tables** (`exam_*`), never in the real
   ones.
3. **One attempt is all 50 tasks**, with saved progress across sittings.
4. **The admin assigns; each reads their own.** A leader sees their own result,
   a brigadir their unit's, the admin everything.
5. **Scope: every dashboard page a leader can open.** The Telegram bot is out —
   its writes cannot be routed to test tables.
6. **A task never names the page or the control.** Finding it IS the test.
7. **The task bank lives in code, in four languages, rendered in the viewer's
   language.** The admin can switch a task off or on; adding one is a deploy.
8. **One attempt per assignment, no timer, an admin deadline.** Time per task is
   recorded for the admin and never limits the leader; a retake is a new
   assignment.
9. **The pass mark is an admin setting** (default 80%); a profile badge for a
   passed exam is a second switch beside it.
10. **Skip and return; no hints.**
11. **Open practice** («Mashq»): the same sandbox, unlimited, unrecorded.
12. **A fictional exam unit**, identical for everybody.

## How it works

### Exam mode = a client switch + a URL rewrite

An attempt is entered and left explicitly. While it is ON:

- the axios instance sends `X-Exam-Attempt: <id>` on every request and
  **rewrites the URL of every sandboxed resource** — `/api/tasks/…` becomes
  `/api/exam/sandbox/tasks/…` — for exactly the prefixes the server published
  on `GET /api/exam/me` (`sandbox_prefixes`). Everything else passes through
  untouched, so read-only pages (zagruzka, worker concerns, education, profile,
  the checklist rules) show REAL data, read-only.
- `Layout` renders an un-dismissible band under the header — «Imtihon rejimi ·
  bu yerda hech narsa haqiqiy emas» — and the **task strip** at the bottom of
  every page (portaled, above `--tg-safe-bottom`).
- toggling the mode clears the react-query cache, so real rows never linger
  under sandbox rows or the reverse.

**Why a URL rewrite and not a model swap inside the real routers.** The real
routers stay byte-for-byte untouched: the sandbox is a separate router
(`routers/exam_sandbox.py`) that re-implements only the subset of each
resource the leader's own pages call, over `exam_*` tables keyed by
`attempt_id`. A sandbox endpoint answers the same shape the page expects and
nothing more — no plant scoping, no shift managers, no DMs, no action-log
enrich — and a task the sandbox does not serve cannot be enabled in the bank.
Deleting the feature is deleting one router and one service. Fidelity risk
(a page reading a field the sandbox forgot) is caught by the local run, not by
production.

**The rewrite list is server-owned.** `services/exam_sandbox.SANDBOX_PREFIXES`
is the one definition; the client stores it with the mode flag and the
interceptor reads module state (it must be synchronous).

Sandboxed resources (the leader-facing subset of each):

| page | prefix rewritten | what the sandbox serves |
|---|---|---|
| /tasks | `/api/tasks` (+ `/api/brigadir-tasks` is never called by a leader) | board, status PATCH, comments |
| /concerns | `/api/concerns` | list, create, status, edit, resolve, escalate, comments |
| /cell-concerns | `/api/cell-concerns` (its status / edit / uplift / comments go through `/api/concerns/{id}…`, so the rule keys on the REQUEST PATH, never on the page) | meta, list, stats, create |
| /idle-cell | `/api/idle-cell` | cells, entries, day summary, create entry |
| /leaders (report · disputes · late proofs) | `/api/leaders/report/`, `/api/leaders/disputes`, `/api/leaders/late-proofs` (exact paths per the map) | one fixture day report, the dispute list + create, the late-proof list |
| bell | `/api/notifications` | three seeded rows (read state is client-side) |
| ColumnsPicker | `/api/ui-prefs` | per-attempt prefs |

Not sandboxed (real, read-only): `/api/leader-tasks/requirements` (the rules),
`/api/leaders` Monitoring, zagruzka, worker concerns, education, profile,
version, activity ping (still real — the leader IS using the app).

### Parked client state

Entering exam mode snapshots and clears, and leaving it restores, the
localStorage keys the pages read their filters from — otherwise a stale
`tasks_status_sel` or `leaders_date_from` left by real work blanks a sandbox
register with no error (`usePersistentState` keys are global and JSON-encoded):
`tasks_*`, `concerns_*`, `cellConcerns.*`, `idle_cell_tab`,
`idle_cell_supervisor_id`, `leaders_tab`, `leaders_date_from`,
`leaders_date_to`, `zagruzka_heatmap_mode`, `notif_read_ids`. `lang` and
`theme` are NOT parked — tasks 47 and 48 restore them themselves. The react-query
cache is cleared on both transitions (`queryClient.removeQueries()`), because
`["task-board"]`, `["notifications", lang]`, `["idle-cells", …]` and the rest
carry no mode discriminator.

Fixture dates are chosen INSIDE every page's default window: the tasks board
scopes rows by `created_at` over the last 7 days, the two leaders queues by
`leaders_date_from` = today − 6.

### The fictional unit

Identical for every leader (decision 12): brigadir **Imtihonov Alisher**, unit
**Imtihon brigadasi**, shift = the leader's own, cells **9901** and **9902**
(leader = the examinee), workers Karimov B., Saidova N., To'xtayev R. The
fixtures are seeded into the `exam_*` tables when the attempt starts
(`exam_sandbox.seed`) and wiped when a practice attempt is restarted; an exam
attempt's sandbox is kept after submission so the admin can read what the
leader wrote, and purged 90 days later by the daily job.

Fixtures:

- **Tasks (from the brigadir, assigned to the leader)** — T1 «Pech
  zichlagichlarini tekshirish» todo, due tomorrow · T2 «SOP bo'yicha smena
  topshirish» todo, URGENT, due today · T3 «Xamir aralashtirgichni tozalash»
  todo, due in 3 days · T4 «Sovutgich haroratini yozib borish» todo, due 2 days
  ago · T5 «Yangi ishchiga yo'riqnoma o'tkazish» done yesterday · T6 «Ombor
  bilan qadoq materialini kelishish» todo, due in 5 days, two brigadir
  comments («Qadoq plyonkasi qachon keladi?», «Omborga bugun ayting»).
- **Concerns (the leader's own, to the brigadir)** — C1 «Un elagi shovqin
  qilmoqda» todo, 5 days old · C2 «Sovutgich eshigi yopilmaydi» doing, 3 days ·
  C3 «Qadoq plyonkasi tugagan» done, 6 days, resolution «Ombordan keldi» · C4
  «Ishchilarga qo'lqop yetishmaydi» todo, 1 day, one brigadir comment («Nechta
  odamga kerak?»).
- **Cell concerns (workers → the leader, cell 9901)** — W1 «Konveyer tasmasi
  sirpanmoqda» todo, Karimov B., today · W2 «Shovqin juda baland» todo,
  Saidova N., yesterday · W3 «Tarozi noto'g'ri ko'rsatmoqda» doing, To'xtayev
  R., 2 days · W4 «Ish kiyimi berilmadi» done, 4 days.
- **Ojidaniya** — cell 9901 today 10:20–10:35, category D3 (semi-product from
  another section), note «xamir kutildi»; cell 9902 nothing.
- **Leaders** — a day report for yesterday (uid `exam-<attempt>`): 13 tasks,
  task 5 «Jurnal to'ldirish» rejected `not_proven` («the photo shows an empty
  page»), task 9 not filed, the rest passed; submitted 85 → verified 62. One
  objection filed THREE days ago on task 3, approved (inside the queue's default
  7-day window). One late proof on task 7,
  filed 3 days ago, waiting on the brigadir.
- **Bell** — three rows: a task assigned (T1), an answer on C4, «Kun
  tasdiqlandi — 62%». `GET /api/notifications` serves only `{id, title, body,
  type, created_at}`; the read state is the client's `notif_read_ids`, so the
  sandbox rows carry ids that cannot collide with real ones (negative ids).

### Checkers

Four kinds; `services/exam_bank.py` holds the 50 definitions and
`services/exam_check.py` evaluates them. A task passes only on evidence dated
AFTER it was opened (`opened_at`), so one concern does not pass two tasks.

- **visit** — the client posts route visits (`POST
  /api/exam/attempts/{id}/events`, kind `visit`, path + tab) while the mode is
  on; the checker looks for a matching visit.
- **sandbox** — a predicate over the `exam_*` tables (T1.status == done, a new
  concern after `opened_at`, an entry 11:00–11:25 on 9901 with category D3…).
- **answer** — the leader types a number / text or picks from a list on the
  strip; the server compares with a value it computes AT CHECK TIME — from
  the sandbox (how many concerns are open), from real read-only data (how many
  photos task 3 needs, the unit's загрузка yesterday, the longest lesson, the
  leader's cell codes) or from the request itself (the app version comes off
  `X-App-Version`). Choice lists are served per task (`GET
  /api/exam/attempts/{id}/tasks/{key}`), built from the same source and never
  cached.
- **ui** — the client reports what it can observe: the `usePersistentState`
  keys of the page (a status filter, a view tab), `localStorage` `lang` /
  `theme`, the language/theme switch sequence. Reported as `ui` events, polled
  every 2 s while the mode is on and only when a value changed.

Checking is automatic: after every 2xx mutation carrying the exam header, after
every route change and after every ui event the client calls `POST
/api/exam/attempts/{id}/check` for the current task. The strip also carries
«Tekshirish» for answer tasks and as a fallback. A failed check says only
«Hali bajarilmadi» (decision 10).

### Availability

A task is **unavailable** for a leader — listed, marked, out of the
denominator — when the page it needs is one they cannot open (`page`: /leaders
and /idle-cell are per-profile grants; the admin sees which grant is missing
when assigning) or when its expected value cannot be computed for them
(`no_data`: no cells, no lessons, no загрузка figure). A task the admin
switched off is not in the attempt at all; the enabled set is snapshotted when
the attempt starts.

### Scoring

Every available task is one point; score = passed ÷ available × 100, rounded.
The pass mark is `exam_pass_mark` (AppSetting, default 80), read at SUBMIT time
and stored on the attempt. Skipped = 0. `exam_badge` (AppSetting, default off)
puts a dated «Imtihondan o'tgan» chip on the leader's profile page.

### Lifecycle

- Admin **assigns** (leaders picked from the shift → unit → leader tree, a
  deadline, an optional note) → one `exam_attempts` row per leader, status
  `assigned`; bell + DM `exam_assigned`.
- Leader opens «Imtihon» → «Boshlash» → `running`, sandbox seeded, mode on.
- Works, skips, returns; «Tanaffus» leaves the mode (progress saved).
- «Yakunlash» → `submitted`, scored; DM `exam_result` to the leader, bell
  `exam_unit_result` to the brigadir. A deadline that passes first → `expired`,
  scored as it stands (a daily 00:05 job, and on the next open).
- The day before the deadline an unfinished attempt gets `exam_due_soon`.
- Practice: `kind=practice`, unlimited; «Qayta boshlash» wipes and reseeds.

## Page structure

### Leader — `/exam` («Imtihon»), nav group «Ta'lim», page key `exam`

Default roles: leader, supervisor (a supervisor sees their unit's results
table). Phone-first (Telegram WebView), max-width 720px on desktop.

Header: GraduationCap chip · «Imtihon» · one-line subtitle.

**Assignment card** (state-driven, one primary action each):

- *nothing assigned* — `EmptyState` «Hali imtihon tayinlanmagan» + the
  practice card below it.
- *assigned* — deadline row («Muddat: 25 sen · 6 kun qoldi»), facts row (50
  vazifa · 8 bo'lim · ≈2 soat · to'xtatib turish mumkin), five rules as
  bullets (nothing is real; skip allowed; no hints; leave any time; pass mark
  N%), **«Boshlash»** (`size="lg"`, full width on a phone), secondary «Avval
  mashq qilish».
- *running* — progress ring `12/50` with three counts (✓ passed · ⤼ skipped ·
  ○ open), the deadline, **«Davom etish»** (turns the mode on and opens the
  current task), secondary «Yakunlash» (ConfirmDialog naming the N open tasks).
- *submitted / expired* — score ring painted by the pass mark (green passed,
  red not — the traffic light; an expired attempt adds a grey chip), the date,
  «Brigadiringiz ham ko'radi», the badge if it is on.

**Task list card** — eight collapsible area groups, each with its
`CATEGORY_COLORS` dot and «5/9»; rows: № · text (two lines) · status chip
(`RequestStateChip` vocabulary: passed / open / skipped / unavailable with the
reason). In `running` state a row tap makes it the current task and turns the
mode on; the leader then navigates by themselves.

**Practice card** — «Mashq» · «Bu yerda hech narsa hisobga olinmaydi» ·
«Mashqni boshlash» / «Davom etish» / «Qayta boshlash».

### Exam chrome (rendered by `Layout` while the mode is on)

- **Band**: 36px under the header, `--brand` at 12% with brand ink,
  GraduationCap, «Imtihon rejimi — bu yerda hech narsa haqiqiy emas», a ghost
  «Tanaffus» at the right. Not dismissible. Document title prefixed «[Imtihon]».
- **Strip**: fixed bottom, portaled to `document.body`, offset by
  `--tg-safe-bottom` + 8px; card 100% minus 16px gutters, max 440px and
  right-aligned on md+; `--bg-card`, rounded-2xl, shadow, a 3px left border in
  the area colour. Collapsed pill (44px): «3/50 · ○ Pechning…» + chevron.
  Expanded: area chip + № · full task text · status line («Hali bajarilmadi»
  muted / «✓ Bajarildi» green) · actions: **«Javob berish»** (answer tasks,
  primary) · «O'tkazib yuborish» (ghost) · **«Keyingisi →»** (after a pass).
  Auto-collapses while any `Modal` is open (it reads `data-modal-open` on
  body); on a pass it flips green with a 600ms check and advances after 1.2s
  (immediately under reduced motion). `role="region"`, `aria-live="polite"`.
  Hidden on `/exam` itself, `/login` and `/proof/camera`.
- **Answer sheet**: the `Modal` template as a bottom sheet — number / text
  input, or a single- or multi-choice list; «Tekshirish» primary. A wrong
  answer keeps the sheet open with a neutral toast.

### Admin — «Imtihon» destination (`/admin/upload?tab=exam`, group Vositalar)

Capability `admin.exam.manage` (grantable). Three sub-tabs (`SegmentedToggle
asTabs`):

1. **Natijalar** — KPI strip (assigned · submitted · passed · avg score);
   `DataTable`: leader · unit · shift · assigned · deadline · status chip ·
   score · pass/fail · time spent; `FilterPanel` (plant → shift → brigadir →
   status), `SearchInput`, `ColumnsPicker`, Excel (mirrors the picker). Row
   drill-down: the per-task list with what the leader wrote. Row actions:
   «Qayta tayinlash» (a new attempt), «Bekor qilish» (an open attempt, confirm).
2. **Tayinlash** — `CheckboxTree` (shift → unit → leader; a leader with an open
   attempt is disabled and says so), deadline (`DateRangePicker single`, min
   tomorrow), note; a preview line «N lider · M ta vazifa ularning K tasiga
   ochilmagan»; «Tayinlash» → `ConfirmDialog` naming count + deadline.
3. **Vazifalar banki** — settings block first (pass mark number input, badge
   switch → `PUT /admin/settings`, so the change is logged and undoable), then
   the 50 tasks grouped by area: № · area chip · text in the viewer's language
   · checker chip · page/grant required · on/off switch; bulk on/off per area
   (`PUT /admin/exam/tasks`, a list).

## Data model (`exam_*`)

- `exam_assignments` — id, created_by (profile_key), created_at, deadline,
  note.
- `exam_attempts` — id, assignment_id (null for practice), profile_key,
  kind (`exam` | `practice`), status (`assigned` · `running` · `submitted` ·
  `expired` · `cancelled`), started_at, submitted_at, deadline, pass_mark_pct,
  score_pct, passed, task_count, seeded_at, last_active_at. Unique open
  attempt per (profile_key, kind).
- `exam_task_results` — attempt_id, task_key, status (`open` · `passed` ·
  `skipped` · `unavailable`), reason, opened_at, passed_at, checks, answer.
- `exam_events` — attempt_id, kind (`visit` · `ui` · `mode`), path, payload
  JSON, at.
- Sandbox tables, each with `attempt_id`: `exam_tasks`, `exam_task_comments`,
  `exam_concerns` (both pages, a `level` column), `exam_concern_comments`,
  `exam_idle_entries`, `exam_disputes`, `exam_late_proofs`,
  `exam_notifications`, `exam_ui_prefs`.

## Endpoints

Leader: `GET /api/exam/me` · `POST /api/exam/attempts/{id}/start` · `POST
…/events` · `POST …/check` · `POST …/skip` · `POST …/submit` · `POST
…/current` (set the current task) · `GET …/tasks/{key}` (answer kind + options)
· `POST /api/exam/practice/start` · `POST /api/exam/practice/reset`.
Sandbox: `/api/exam/sandbox/{tasks,concerns,cell-concerns,idle-cell,leaders,
notifications,ui-prefs}/…` — the subset the pages call, all gated on a running
attempt of the caller.
Admin: `GET /admin/exam/results` · `GET /admin/exam/results/{attempt}` · `POST
/admin/exam/assign` · `POST /admin/exam/attempts/{id}/cancel` · `GET`/`PUT
/admin/exam/tasks` · `POST /admin/exam/results.xlsx`.
Action log: one `training` category (`exam.assigned`, `exam.started`,
`exam.submitted`, `exam.cancelled`, `exam.bank_changed`, `exam.practice`);
sandbox writes are recorded under it with `exam_attempt_id`, never under the
real resource's key.

## The 50 tasks

Levels: 1 basic · 2 intermediate · 3 advanced. Wording never names the page or
the control (decision 6); where the outcome is a record the platform itself
names (a concern, an ojidaniya, an objection), the record's name may appear —
knowing what the platform calls it is part of the skill. Texts below are the
English key; all four languages ship.

### A · Vazifalar (tasks board) — red
| № | L | task | checker · predicate |
|---|---|---|---|
| 1 | 1 | Your brigadir asked you to check the oven seals. Do it and mark «Pech zichlagichlarini tekshirish» as done. | sandbox · T1.status = done |
| 2 | 1 | You have started cleaning the mixer but are not finished. Show that «Xamir aralashtirgichni tozalash» is in progress. | sandbox · T3.status = doing |
| 3 | 1 | Which of your tasks did the brigadir mark as urgent? | answer (choice of 6 titles) · T2 |
| 4 | 2 | One of your tasks is already past its due date. Which one? | answer (choice) · T4 |
| 5 | 1 | How many comments has your brigadir written on «Ombor bilan qadoq materialini kelishish»? | answer (number) · brigadir comments on T6 (2) |
| 6 | 2 | Reply to your brigadir on that packaging task with «Kelishildi». | sandbox · a leader comment on T6 containing «kelishildi» (either script) |
| 7 | 2 | Show only the tasks that are still to do. | ui · tasks status filter = todo |
| 8 | 2 | Open the analysis view of your tasks. | ui · tasks view = analysis |
| 9 | 3 | Hide the column that names who set each task. | sandbox (ui-prefs) · tasks columns hidden ∋ creator |

### B · Xavotirlar (concerns) — green
| № | L | task | checker · predicate |
|---|---|---|---|
| 10 | 1 | Mixer №2 is leaking oil. Record it as a concern to your brigadir. | sandbox · a concern created after opened_at |
| 11 | 1 | The sieve has been fixed. Close «Un elagi shovqin qilmoqda» and write what was done. | sandbox · C1.status = done with a resolution note |
| 12 | 2 | Your brigadir asked a question on «Ishchilarga qo'lqop yetishmaydi». Answer: «12 kishiga». | sandbox · a leader comment on C4 containing «12» |
| 13 | 1 | How many of your concerns are still open? | answer (number) · count(status ≠ done) at check time |
| 14 | 2 | «Sovutgich eshigi yopilmaydi» is not being worked on after all. Put it back to «to do». | sandbox · C2.status = todo |
| 15 | 2 | Add the size to the gloves concern: edit its text so it says the gloves must be size L. | sandbox · C4.text ∋ L / Л as a token |
| 16 | 2 | Which of your concerns was filed first? | answer (choice) · C3 |
| 17 | 2 | Show only the concerns that are done. | ui · concerns status filter = done |

### C · Yacheyka xavotirlari (cell concerns) — blue
| № | L | task | checker · predicate |
|---|---|---|---|
| 18 | 1 | Workers reported the conveyor belt slipping. Take «Konveyer tasmasi sirpanmoqda» into work. | sandbox · W1.status = doing |
| 19 | 2 | The scale problem is beyond you. Pass «Tarozi noto'g'ri ko'rsatmoqda» up to your brigadir with a reason. | sandbox · W3 escalated with a reason |
| 20 | 2 | «Shovqin juda baland» has already been handled elsewhere. Close it with a note saying so. | sandbox · W2.status = done with a resolution note |
| 21 | 1 | How many worker concerns are waiting for you right now (not started)? | answer (number) · count(todo) at check time |
| 22 | 2 | A worker told you the floor by the oven is slippery. Register it on their behalf. | sandbox · a cell concern created after opened_at |

### D · Ojidaniya (idle-cell) — yellow · needs the `/idle-cell` grant
| № | L | task | checker · predicate |
|---|---|---|---|
| 23 | 1 | Cell 9901 stood from 11:00 to 11:25 waiting for dough from the mixing section. Record it. | sandbox · entry 9901 11:00–11:25, category D3 |
| 24 | 2 | At 14:05 the workers of cell 9901 waited 15 minutes for the forklift. Record it under the right cause. | sandbox · 14:05–14:20, the transport/warehouse category |
| 25 | 2 | At 09:30 the shift stood 8 minutes because the previous shift had not finished. Record it on cell 9901. | sandbox · 09:30–09:38, Cat I |
| 26 | 1 | How many minutes of waiting does cell 9901 carry today in total? | answer (number) · union minutes at check time |
| 27 | 2 | Record a 12-minute stop at 16:10 on cell 9902 and name who you waited for in its note: «ombor». | sandbox · 9902 16:10–16:22, note ∋ «ombor» |
| 28 | 2 | Which cause has cost cell 9901 the most time today? | answer (choice of categories) · dynamic |

### E · Liderlar (rules, day report, objections, late proofs) — orange · needs the `/leaders` grant
| № | L | task | checker · predicate |
|---|---|---|---|
| 29 | 1 | Find where the requirements of your daily checklist are written — what each task needs, how many photos, when. | visit · /leaders, requirements tab |
| 30 | 2 | How many photos does task №3 of your checklist require? | answer (number) · real requirements_for, task 3 min_media |
| 31 | 2 | Until what time can task №13 be submitted? | answer (HH:MM) · real closes_at / window end of task 13 |
| 32 | 1 | Open your report for yesterday. Which task did the check refuse? | answer (choice of 13 names) · fixture task 5 |
| 33 | 2 | You disagree with that refusal: file an objection saying the journal was filled at 19:40. | sandbox · a dispute on task 5, reason ≥ 10 chars |
| 34 | 2 | Find the objection you filed three days ago. What was its outcome? | answer (choice) · approved |
| 35 | 1 | What was your verified score for yesterday? | answer (number) · 62 |
| 36 | 2 | Your late proof for task 7 — who is it waiting on? | answer (choice) · the brigadir |
| 37 | 2 | Which task of your checklist carries the most points? | answer (choice of task names) · real requirements_for, the max weight (a tie → no_data) |

### F · Tahlil (zagruzka, worker concerns) — purple
| № | L | task | checker · predicate |
|---|---|---|---|
| 38 | 2 | What was your unit's загрузка yesterday? | answer (choice: the value + 3 distractors, or «no figure») · real |
| 39 | 2 | Switch the fleet heatmap from the plan to the fact. | ui · localStorage `zagruzka_heatmap_mode` = the fact value (the page's ONE persisted view key) |
| 40 | 2 | How many concern forms did the workers of your unit submit this month? | answer (number) · real worker concerns, unit, month |
| 41 | 3 | Which category of those worker concerns is the largest this month? | answer (choice) · real |

### G · Ta'lim (education) — teal
| № | L | task | checker · predicate |
|---|---|---|---|
| 42 | 1 | How many video lessons are available to you? | answer (number) · real count |
| 43 | 2 | Which lesson is the longest? | answer (choice of titles) · real duration |
| 44 | 2 | Open the newest lesson and tell how many minutes it lasts. | visit /education/<newest> + answer (number) |

### H · Profil va sozlamalar — pink
| № | L | task | checker · predicate |
|---|---|---|---|
| 45 | 1 | Which cell codes are assigned to you? | answer (multi-choice) · the leader's real cells |
| 46 | 1 | Which shift are you registered on? | answer (choice 1/2) · real |
| 47 | 1 | Switch the interface to Russian, then back to the language you had. | ui · lang events: ru, then the original |
| 48 | 1 | Switch to the dark theme, then back. | ui · theme events: the other theme, then the original |
| 49 | 2 | Find the notification about the answer to your gloves concern, then mark all notifications as read. | ui · localStorage `notif_read_ids` ⊇ the three exam notification ids (the bell has no server read-state) |
| 50 | 1 | Find which version of the app you are running and type it. | answer (text) · = the request's X-App-Version |

## Consequences to know

- **Answer tasks over fixtures are shareable** between leaders (decision 12
  makes the fixtures identical); the real-data ones (30, 31, 37, 38, 40–46,
  50) are per leader. The time-per-task record is the only proctoring.
- **A leader without the `/leaders` or `/idle-cell` grant has 15 unavailable
  tasks** and is scored over 35. The admin sees the count when assigning.
- **`cells/9901` does not exist**, so fixture cell chips render as inert
  `CellLink`s (no id) — never a dead link.
- **Language and theme tasks change a real preference** (localStorage), which
  the tasks themselves restore.

## Phasing

1. Framework: tables, `/exam`, the band + strip, `exam_bank` + checkers, the
   admin destination, notifications, the daily job; visit/answer/ui tasks and
   the sandbox for tasks, concerns, cell concerns and the bell (A · B · C · H
   + the real-data tasks in E · F · G).
2. Sandbox for idle-cell and the leaders fixtures (D, 32–36), ui-prefs (9).

Tasks whose sandbox has not landed ship in the bank switched OFF.

## Deliberately not built

Telegram bot tasks · a supervisor exam (the bank is leader-shaped) · hints ·
timers · anti-cheating beyond time records · a sandbox `/cells/:id`.

## What changed while building (2026-09-24)

- **One sandbox table, not nine.** `exam_sandbox_rows` (kind + JSONB data,
  keyed by the attempt) holds every sandbox record; the serializers in
  `services/exam_sandbox.py` produce each page's shape. Fixture rows keep
  RELATIVE dates so a sitting on any day reads «yesterday» correctly.
- **C1 and C2 are held at level `leader`** (the brigadir sent them back, with
  a move in the history): a leader cannot change the status of a concern held
  by the brigadir, so tasks 11 and 14 needed rows the leader holds.
- **Task 9** is «order by due date» (the tasks board has no ColumnsPicker);
  **task 24** accepts Cat E or Cat D (the forklift is internal logistics);
  **task 39** is fact → PLAN (the page opens on the fact); **task 41** asks
  which cell has the most open worker concerns (that register has no
  category); **tasks 47/48** are language-agnostic round trips; **task 32**
  says «find your day report for yesterday» — the sandbox answers the fixture
  for ANY report uid, so both the Monitoring row and the objection card lead
  to it. Task 40 counts the leader's own workers (the register is locked to
  the leader).
- **The noisy endpoints live under `/api/exam/live/…`** (events, ui, check,
  current, skip, pause, resume) so the action log can skip them by prefix.
- **The Excel export takes the visible rows' ids and labels** from the client;
  a ColumnsPicker on the results table was not built.
- **A single `/api/exam/me`** serves the leader page and the supervisor's unit
  table; `task_count` on it is the enabled bank size.
