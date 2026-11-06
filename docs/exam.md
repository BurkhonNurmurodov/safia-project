# The dashboard exam («Imtihon»)

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## The dashboard exam («Imtihon», `/exam`)

From **2026-09-24** (the operator's twelve rulings, 2026-09-18 — recorded in
`docs/plan-dashboard-exam.md`) a leader can sit an EXAM on the dashboard:
fifty tasks that make them use the real pages — mark a task done, file a
concern, find where the checklist rules are written — checked by the platform
itself. Page key `exam` (leader · supervisor), nav group «Ta'lim»; the admin
destination is `/panel/exam` (capability `admin.exam.manage`).

- **Nothing a leader does during an exam changes real data, and that is
  STRUCTURAL.** While the mode is on, `utils/examMode.js` + the axios
  interceptor rewrite every request to a sandboxed resource onto
  `/api/exam/sandbox/…` (the prefixes are SERVER-owned:
  `services/exam_sandbox.SANDBOX_PREFIXES`, published on `GET /api/exam/me`)
  and send `X-Exam-Attempt`. `routers/exam_sandbox.py` re-implements the
  LEADER-facing subset of /tasks, /concerns, /cell-concerns, /idle-cell, the
  day report / objections / late proofs, the bell and ui-prefs over ONE table,
  `exam_sandbox_rows` (JSONB, keyed by the attempt) — no real table, no DM,
  no `action_log.enrich`. The real routers are untouched. A prefix matches on
  a path boundary, so `/api/leaders` (Monitoring, real) stays real while
  `/api/leaders/report/…` is rewritten; `/cell-concerns` writes go through
  `/api/concerns/{id}` and are caught by the PATH, never the page.
- **Rights mirror the real pages for a LEADER** (the contract maps the sandbox
  was built from): no flame, no editing a brigadir's task, no deleting or
  sending back a concern, the receiver's deadline on the flip into doing, a
  resolution note on close, no editing a saved ojidaniya row, no ruling on an
  objection. Refusals carry the real endpoints' own messages.
- **The fictional unit is identical for everybody**: brigadir Imtihonov
  Alisher, «Imtihon brigadasi», cells 9901/9902 (leader = the examinee).
  Fixture rows keep RELATIVE dates (`entry_days`, rendered against the clock),
  so «yesterday» and a board scoped to the last 7 days read right on every
  sitting. C1/C2 are held at level `leader` (sent back by the brigadir) —
  the only way a leader may close or re-status a concern on /concerns.
- **The bank lives in code** (`services/exam_bank.py`, the 50 predicates;
  texts in the bundle under `exam.t.<key>`, four languages, rendered in the
  viewer's language). An admin only switches a task off (AppSetting
  `exam_disabled_tasks`); the enabled set is SNAPSHOTTED at start. A task
  never names the page or the control. Four checker kinds
  (`services/exam_check.py`): `sandbox` (a predicate over the rows), `answer`
  (compared with a value computed AT CHECK TIME — from the sandbox, from real
  read-only data, or the app version), `ui` (the client's report of persisted
  page state: `usePersistentState` keys, `lang`, `theme`, `notif_read_ids`,
  polled every 2 s and posted only when changed) and `visit` (a route).
  **A `sandbox` check counts from the ATTEMPT's `seeded_at`, not from when the
  task was opened** — every sandbox predicate names its own fixture (T1, C2,
  W3…) or a signature no other task shares, so one record can never pass two
  tasks, while a leader who reads ahead on `/exam` and acts on a fixture
  before opening its task (or a closed, read-only concern acted on early)
  must still be able to pass it. `ui` and `visit` checks still gate on
  `opened_at`, since those ask about a CHOICE made for this task, not a
  record that already exists.
- **A task is UNAVAILABLE for a leader who cannot open its page** (`/leaders`,
  `/idle-cell` are per-profile grants — 15 tasks) or whose expected value
  cannot be computed (`no_data`); it is listed, marked, and out of the
  denominator. Score = passed ÷ available, rounded; the pass mark
  (`exam_pass_mark`, default 80) is read at SUBMIT and stored on the attempt;
  `exam_badge` puts a dated chip on the leader's profile.
- **One open attempt per (person, kind)**: `assigned` → `running` → `submitted`
  | `expired` (the admin deadline, 00:05 daily) | `cancelled`. Practice
  (`kind=practice`) is unlimited, unrecorded, restartable. Time per task is the
  only proctoring (`exam_task_results.seconds`, capped at 20 min a sitting).
  Notifications: `exam_assigned`, `exam_due_soon` (09:00, the day before),
  `exam_result` (leader), `exam_unit_result` (the brigadir).
- **Client engine**: `context/ExamContext.jsx` (mounted in App.jsx ABOVE the
  routes — Layout remounts per navigation), `components/exam/ExamStrip.jsx`
  (portaled, `--tg-safe-bottom`), `ExamBand.jsx` (Layout), `AnswerSheet.jsx`.
  Entering the mode PARKS the pages' persisted filters (`parked_keys` from
  `/me`, `localStorage` → `exam_parked`) and clears the react-query cache;
  leaving restores them. `lang`/`theme` are never parked — two tasks switch
  them and put them back. The noisy leader endpoints live under
  `/api/exam/live/…` and are in `action_log._SKIP` with the sandbox;
  start/submit/assign/cancel/bank are logged under the `training` category.
- **Consequences to know**: the day report a leader opens from Monitoring in
  exam mode is the FIXTURE (any uid answers it); exports on sandboxed pages
  are refused; a sandbox never serves photo bytes (fixtures carry none).
  Sandboxes of finished exams are purged after 90 days (`purge_old`).
- **Monitoring (`/leaders`) is sandboxed too, from 2026-09-26** —
  `GET /api/leaders` → `sb.register_payload`, `GET /api/leader-ai/report` →
  `sb.ai_report`, both under the plain `/api/leaders` prefix (it also covers
  `/report/`, `/disputes`, `/late-proofs` beneath it, a path-boundary match).
  The fixture is SIX checklist days (`REPORT_DAYS`, keyed by `days_ago`), one
  history so the register row, its detail modal and the day-report page can
  never print two different scores for one day: a rejected + missed day
  (day 1, the leader's own), a clean day, an already-approved objection
  (day 4, `fx="D1"`), a late-proof day (day 3) and a not-done day (day 6).
  `report_uid` mints `exam-{id}` for day 1 and `exam-{id}-{k}` otherwise;
  `report_days_ago` is the inverse. **`REPORT_DAYS[2]` and `[5]` are `{}` — a
  genuinely CLEAN day, not a missing one** — so every reader of the map must
  test membership (`k in REPORT_DAYS`), never truthiness: `day_report` once
  read `REPORT_DAYS.get(k) or REPORT_DAYS[1]`, and `{} or REPORT_DAYS[1]`
  falls through to day 1's rejected+missed spec because an empty dict is
  falsy — so two clean days scored 100% (`_day_scores` indexed the map
  directly and got it right) while their task list and register row still
  named two tasks as failed. Fixed to `REPORT_DAYS[k] if k in REPORT_DAYS
  else REPORT_DAYS[1]`.
- **The write-guard is TWO locks, and both must cover `/admin/` as well as
  `/api/`** (2026-09-26). `utils/api.js`'s interceptor refuses a non-GET call
  that is still a REAL endpoint after `rewriteExamUrl` (not covered by
  `SANDBOX_PREFIXES` and not in the small allowlist —
  `services/exam_sandbox.EXAM_WRITE_ALLOW` / `examWriteAllowed` in
  `examMode.js`: `/api/auth/`, `/api/activity/`, `/api/crash-report`,
  `/api/boot`, `/api/education/progress`), and `ExamWriteGuardMiddleware`
  backstops it server-side for whatever gets past the client. **This backend
  mounts real mutating endpoints under `/admin/...` as well as `/api/...`**
  (`routers/admin.py`, `routers/exam.py`'s own admin router) — a guard
  written for `/api/` alone let the Leaders page's Refresh button
  (`POST /admin/refresh-sheet/leaders`) straight through to the real sheet
  sync in a browser test, on BOTH ends, because the client and server guards
  shared the same blind spot. That button is gone from the page altogether
  (2026-10-15), and «Perenaladka» drops off `/idle-cell`'s tab strip during an exam
  (real `/api/setup-times`, no sandbox twin) — belt and braces: the button
  disappears, and the door behind it is shut either way.
- **A tab closed WHILE sitting an exam must not strand the real filters it
  parked** (2026-09-26). `sessionStorage` (the mode flag) does not survive
  that, but `localStorage`'s `exam_parked` blob does — so `examMode.js` now
  restores it the moment a fresh load finds no exam mode claiming it, and
  `park()` restores-then-reparks rather than overwriting a `PARK_KEY` that is
  already sitting there from a session that never called `leaveExamMode`.
  The blob carries its OWN prefix list now (`{prefixes, values}`), so a
  restore never depends on which list the CURRENT bundle happens to be
  carrying — a leftover park from an older, shorter list is unparked by the
  list it was parked with.
