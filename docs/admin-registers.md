# The action register and activity

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## The action register (`/panel/logs`)

From **2026-08-23** every change on the platform lands in ONE append-only table,
`action_logs`, read on the admin «Jurnal» destination. Six partial trails existed
before it — `capability_uses` (grant-authorised actions only, and it returns
early for admins), `capability_audit`, `hr_document_history`,
`leader_task_config_audit`, `concern_escalations`, and the `user_activity`
heartbeat that says a person was in the app and nothing about what they touched.
Between them an admin uploading attendance, closing a day, deleting a profile,
restoring the database or revealing a browser password left **no queryable trace
anywhere**. All six survive unchanged beside this one; nothing was retired.

- **`services/action_log.py` is THE definition** — the writer, the middleware and
  the route table. Two writers, deliberately:
  `ActionLogMiddleware` records an AUTOMATIC row for every POST/PUT/PATCH/DELETE
  under `/api` and `/admin` (actor, category, action, outcome, duration), so a
  new endpoint is covered the moment it exists — the discipline `capability_uses`
  lacked; and `enrich()`, called INSIDE a handler, fills the SAME row with what
  only the handler knows (unit name, business day, old→new, the operator's
  reason). One request is always exactly one line. `enriched` marks the rows that
  got the second treatment, so **a thin row is never displayed as a rich one**.
  `enrich()` never raises and is a **no-op outside a recorded request** — call it
  unconditionally. Its ARGUMENT expressions are not protected, so never build one
  from an instance a commit or delete has already expired.
- **`ROUTES` is THE list** — (method, path) → (category, action) for every
  mutating route, first-match-wins so **specific must precede generic** (the
  three `/api/profiles/admin/cells/*` routes sit in the identity block for
  exactly this reason). An unmatched route still gets a row, under «other», AND
  is named at boot by `report_unclassified_routes(app)`: one list stays complete
  only if the app says out loud when something falls out of it. «Unmatched»
  means NO ENTRY — the undo door's no-plan refusal is filed under «other» on
  purpose. Telemetry is excluded on purpose (`_SKIP`: the activity ping,
  ui-prefs, boot/crash reports, `/bot/webhook` — the envelope, whose handlers
  record themselves — lesson views and playback flushes, the exam sandbox, the
  bell's read marks, the app's session renewal, the assistant's own chat).
- **The boot check walks `effective_route_contexts()`**
  (`action_log._leaf_routes`). From FastAPI 0.141 (deployed 2026-10-03)
  `app.routes` holds ONE `_IncludedRouter` per `include_router` call, with no
  path or methods of its own, so a loop over `app.routes` alone saw only the
  app's few GETs and the check named nothing for three days. A walk that finds
  no recorded route now RAISES, and the boot report prints «the route walk is
  blind» instead of a silence that reads as «all classified». Anything else
  that walks the app's routes must go through the same contexts
  (`assistant_api._walk` does).
- **Bot taps and jobs use the direct door.** `record_bot()` = a PERSON acted in
  Telegram (day close, task close, approvals, registration, the broadcast
  composer); `record_system()` = a scheduled job did (the 09:00 auto-close, the
  AI drain, report sends, syncs). A job writes **one row per pass, never one per
  item**, and nothing on a tick where nothing happened.
- **14 categories**, in the «Bo'lim» menu's order: attendance · documents · identity · sessions
  · org · leader_config · leader_review · shopfloor · collab · comms ·
  sync_export · config · danger · other.
- **Keys, never sentences.** `category` and `action` are keys; the tab renders
  them through `logs.*` in all four languages, and an untranslated key is
  prettified rather than printed raw. Names of people, units and targets ARE
  snapshotted — a rename must not rewrite what the log says happened.
- **Never a second place a secret is readable.** The Gemini key records its
  LENGTH; `/admin/settings` masks any key naming a key/token/secret/password;
  the web-login block records the username and the event, never the password —
  including on `reveal`, which is itself an event worth a row. The register rides
  in every `db-dump`, so anything unbounded (a name list, a file body) belongs as
  a COUNT.
- **`ip` comes from `cf-connecting-ip` → `x-real-ip` → the ASGI peer, never
  `X-Forwarded-For[0]`** — nginx APPENDS the real peer to whatever the client
  sent, so element 0 is the caller's own text and the one field meant to place a
  person would be written by that person. Truncated to 64 chars.
- **Ghost Mode is recorded, not obeyed** (a column). A flag that rides the
  request must never let the audited request silence its own audit — the rule
  `capability_alerts` already states.
- **Append-only, forever.** No delete route, no purge tool, no retention job. At
  a few hundred changes a day that is ~100k rows a year. A `db-restore` replaces
  the table like any other and writes one row describing itself.
- Admin-only and NOT grantable: no capability exists for it, so
  `capTabs.includes(capKey ?? id)` can never admit a grantee — the `permissions`
  model. Every endpoint in `routers/logs.py` carries `verify_admin` — the undo
  door especially, whose reach is the union of everything it can reverse, so one
  capability for it would be a capability for all of them at once.

### Taking one action back (the Undo button)

From **2026-08-24** an expanded row can be REVERSED — `POST
/api/admin/logs/{id}/undo`, the undo bar at the foot of the detail panel. It is
the only write on the tab.

- **`services/action_undo.py` is THE definition** of what an undo can reach.
  A `Plan` per action key (`check` + `run`); adding a fifth is one entry, not a
  new mechanism. Never re-derive "is this undoable" at a call site — least of
  all in the browser, where the copy on screen would be the wrong half of a
  disagreement.
- **The register stays append-only.** An undo is a NEW action that happens to be
  the inverse of an old one, recorded under the INVERSE action's own key (undoing
  a day-close IS a re-open, filed under Attendance) and linked by the indexed
  `action_logs.undo_of` column. Nothing edits the row it reverses; nothing is
  deleted, ever. `undone_map` filters on `outcome == "done"` — a REFUSED attempt
  carries `undo_of` too (the row is re-badged before the check runs, so a
  refusal says what it tried to reverse), and counting it would lock a row out
  because an earlier attempt FAILED. **An undo cannot itself be undone**: a
  longer chain turns "already undone" from a fact into a parity question.
- **The rule that makes it safe: the world must still be as the action left it.**
  Every `check` verifies the CURRENT state still equals what the row recorded as
  its result and refuses `changed_since` otherwise. That one rule stops an undo
  clobbering somebody's later edit, makes a double-tap harmless (the register is
  written by a background thread, so the `already_undone` marker lands a beat
  late and can never be the only guard), and needs no locks.
- **Only what the register PROVES it can put back.** A log row is not a
  snapshot. Four actions qualify today: `attendance.day_closed` ↔
  `attendance.day_reopened` (unit + date, and it notifies the unit exactly as the
  ordinary endpoints do), `config.settings_saved` and `config.translation_saved`
  (each value back to its recorded old one). A cascading delete — a profile
  taking its bindings, entries, photos and verdicts with it — is gone, and the
  panel says so rather than offering a button that cannot work. Two refusals
  exist precisely because the row is honest about its own limits: `masked` (the
  old value was a secret and `/admin/settings` stored `•••`, so restoring it
  would set the literal mask as the API key) and `capped` (a >50-string
  translation save records only the first 50, and half an undo is not one).
  **Never add a LOSSY reverser** — `task.status_changed` looks trivial and is
  not, because leaving «done» re-queues the task at the BACK of the leader's
  priority list; an undo would restore the status and silently lose the position.
- **The bar renders on EVERY row, in one of three states** — offer, refusal
  (`logs.undo.why.*`, in all four languages), or "taken back by X, N ago". A
  control that appeared only when it worked would leave the reader of a
  profile-deletion unable to tell whether the platform forgot the button or the
  action genuinely cannot be reversed. Failures land INSIDE the `ConfirmDialog`
  and leave it standing: `changed_since` is the message the operator must read
  before deciding what to do instead.
- Reading it (rebuilt **2026-11-03**, v4.398.0 — the audit and the plan are
  `docs/plan-logs-rebuild.md`): ONE filter bar — period · search · «Bo'lim»
  (the categories, a multi-select whose counts are computed with every filter
  applied EXCEPT the category, because its job is telling the reader where the
  rest of the activity is; a category with nothing in the window is DIMMED in
  place, never hidden) · «Natija» (the outcomes) · the folded «Filtrlar» for
  source, person, unit, action and detail level. The category rail and the
  four stat tiles are gone: one line under the bar says events · people ·
  refused (a chip that applies the outcome filter) · live, and the table takes
  the whole column. **Rows are ONE line** — the name, then a «Rol» column in
  the generic view and «name · role» inside a category's own columns; `done`
  is a quiet check, the other three outcomes keep their chips, so the eye finds
  them. **A row opens a SIDE PANEL** (`LogPanel.jsx` — non-modal, the right
  edge, a bottom sheet on a phone; the body is `LogDetail.jsx`, the undo bar
  included) instead of expanding in place: the sequence stays on screen and no
  row moves while somebody reads. ↑ ↓ walk the rows from the table or the
  panel, Esc closes. Table COLUMNS still follow the
  selected category (one `COLUMNS` map + one per-key `cell()` switch; the
  generic set once several are picked — `category` is CSV on the API since
  this day, a single value reads as before). New rows never arrive under the
  reader's hands — they wait behind a «N new» button. Colour on this page
  means STATUS only: the outcomes own the traffic light and the categories are
  separated by ICON, so a category chip can never be mistaken for a verdict.

## Who uses the app (`/activity`)

From **2026-09-15** (the operator's call) «Foydalanuvchilar faolligi» is TWO
tabs over ONE ledger, `user_activity` — one row per (Telegram account, PROFILE,
day), filled by the 60 s heartbeat `POST /api/activity/ping`.
`routers/activity.py` reads it twice; `pages/UsersActivity.jsx` draws both.

- **«Profillar bo'yicha» is a PERSON** (the identity rule): every account working
  as a profile folds into its row, time summed, accounts listed.
  **«Foydalanuvchilar bo'yicha» is a LOGIN**: one Telegram account, the profiles
  it worked as listed. `?by=profile|account` picks the unit on the SERVER, so the
  two tabs always add up to the same minutes and neither is derived from the
  other's rows. No `by` means profile — what a tab still open on the one-view
  bundle asks for.
- **Every day count is DISTINCT days.** A profile held by several accounts writes
  a row per account per day; counting rows read as 69 active days in a 30-day
  month.
- **The ledger day is the plant's wall clock** (`TZ`, Tashkent) from 2026-09-15.
  It was the UTC day, so 00:00–05:00 landed on yesterday and «Bugun faol»
  answered for the day before until 05:00. Older rows keep their UTC label — a
  row stores a total, not its hours.
- **«Kirishlar» counts VISITS** — `session_count`, bumped by a row's first ping
  and by every ping after a gap longer than `PING_MAX_GAP`. It used to print
  `event_count`, the PING count (about one a minute). NULL on every row written
  before 2026-09-15, never 0, and `sessions_from` on the payload is what lets the
  page say from which day it counts. `add_activity_session_count` is its
  migration, called from `add_activity_profile_key` so both entrypoints run it.
- **Legacy rows are resolved on READ, never rewritten** (`_legacy_profiles`). The
  NULL-`profile_key` rows from before 2026-07-25 are matched by the account's
  admins row, then the ONE held profile whose name matches the snapshot
  (script-blind, `_fold_name`), then the ONE profile of that role carrying that
  name, then a DIRECT role the account holds exactly once — never that last step
  for a leader, whose account may have been handed on. What stays unresolved is
  shown with its account and marked «Profil aniqlanmagan», never guessed.
- **An «open as this profile» session counts as the ADMIN who opened it**
  (`_heartbeat_owner`, the token's `imp`) — its `sub` is the holder's account, so
  read as written it showed a leader in the app while they were not.
- Page key `activity`, admin-only by default. Every figure is derived per
  request; nothing but the heartbeat writes.
