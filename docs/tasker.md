# Tasker («Задачник (фабрика)»)

## The Tasker connection (`/panel/tasker`, 2026-11-12)

Tasker — the Service Desk panel's «Задачник (фабрика)» — scores every factory
department's inspection checklists each day, and from November 2026 hands
those scores out through a read-only integration API (one token per
integration, `X-Integration-Token` header, base
`…/tasker/api/v1/integration/factory`; endpoints `GET /departments`,
`GET /daily`, `GET /checklists/daily`, ≤ 93 days, 60 requests a minute). The
goal is to retire leaders' task 4 (obxod) screenshots. **Phase 1, built here,
is the connection and a test only — nothing on the platform is scored from
Tasker yet.**

- **`services/tasker.py` is THE client** — `config`, `save`, `client`, `call`,
  `run_test`, `last_test`, shaped like `services/verifix.py` and reusing its
  `app_settings` helpers. `routers/tasker.py` is the door: `GET` / `PUT
  /api/admin/tasker`, `POST /api/admin/tasker/test`. Admin-only, not grantable
  (no `capKey`) — the token reads every factory department's inspections.
- **The token is SEALED at rest in `app_settings`** (`tasker_token`,
  `web_auth.seal_password`) and **SHOWN in plain text on the card** — the
  operator's ruling, 2026-11-12 («who hides the token?»): a masked field hid
  what was actually pasted, and the token cannot be checked against the one
  Tasker issued. Never logged; the action register records that it changed and
  its length. An emptied field + Save removes it.
- **A pasted token is CLEANED, not judged** (`clean_token`): NFKC, zero-width
  characters and soft hyphens dropped, typographic dashes (‐ ‑ – — − －) back
  to `-`, EVERY whitespace removed (a token holds none — the second paste on
  12 Nov carried a viewer's wrap as a space and a non-breaking hyphen), and
  surrounding quotes / backticks / «» dropped. What is left and still can't go
  in a header is refused NAMING the character and its position
  (`token_problem`). Whether it is the RIGHT token is Tasker's answer to «Tekshirish».
  The first version demanded `tsk_` + 20–200 URL-safe characters and refused a
  real token pasted with extra characters around it, hidden by the mask. The doc's localhost token is a TEST
  value for Tasker's local setup; production gets its own token once Tasker
  deploys there. Neither ever goes into git.
- **The address is an allow-list** (`norm_base`): Tasker's production origin
  over https, or `localhost` / `127.0.0.1` WITH a port for its local test
  setup. The path is fixed; redirects are not followed — the address decides
  where the token goes.
- **The test** reads YESTERDAY (Tashkent): the departments, each department's
  score and inspection count, and the checklists (count, task-type names, the
  names of checklists containing «обход» — phase 2 needs the real name). Error
  statuses become the doc's named codes (401 / 403 / 422 / 429 with
  `Retry-After` / 503). 70 s budget, inside Cloudflare's 100 s.
- **A department's cell is a SUGGESTION**, by the audit KPI's rule
  (`tech_audit.division_key` against `turnover.cell_map`: the leading code,
  else the four digits the name ends with). It is listed on the card for a
  person to confirm and nothing scores by it. Expect wrong or missing ones:
  Tasker's names mix verifix codes («8121 холодный цех»), SAP work centres
  with a Cyrillic or Latin letter («А2704», «A2743» — the trailing digits can
  hit an unrelated cell), duplicate codes («А2733», «2.21» twice), two codes
  in one name and none at all («Сдоба Отдел», «Учтепа», the logistics roles).
- **What a value means** (Tasker's doc): one inspection = earned points ÷ max
  points × 100, «Н/Д» questions dropped from the max, an UNANSWERED question
  counted as 0; a checklist's day = the mean of its inspections; a
  department's day = the mean over task types of each type's checklist mean;
  2 decimals half up. **A day without an inspection is ABSENT, not 0.** A day's
  `value` arrives as a string («38.0»), `average` as a number, names with
  trailing spaces.

## Phase 2 — task 4 decided by the platform (NOT built)

The plan: a `tasker_obxod` check in `leader_auto.CHECKS` (own `CHECK_FROM`
day), the switch as a flagged one-shot like `leader_auto_rollout`, and a
dated era in `leader_rule_eras` so past task-4 verdicts never move.

**It is blocked on the data.** Task 4's rule (7 Oct, `docs/checklist-ai-review.md`)
judges COMPLETION — every card's bar full and its count n/n, three obxods at
9:00 / 11:00 / 15:00, within the shift, both shifts — and says the score is
never judged. The API answers none of that. To be asked of Tasker:

1. Per inspection: its finish time (or its shift), so the hours and the shift
   can be checked.
2. Per inspection: answered / total questions, or a «complete» flag — the
   score mixes completion with quality (an unfinished 86 % and a finished
   86 % look the same).
3. The scheduled count per checklist and day, so a skipped obxod shows instead
   of vanishing.
4. Which timezone `day` is in, and which timestamp decides it (a night shift
   crosses midnight).
5. Why «ФАБРИКА КЗ» (checklist type «Аудит Алмата КЗ») is in the Uzbekistan
   list; and whether a token made for «all departments» picks up departments
   added later.

Without (1)–(3) the only way to automate task 4 is an operator ruling that
changes its question to the department's score — and every leader of a
department would then share one verdict.

## The panel's «Минусы» report (`/panel/sdpanel`, 2026-11-17)

The operator asked for a page where they type the login and password of
panel.safiabakery.uz, and for the platform to read EXACTLY
`https://panel.safiabakery.uz/task-factory-reports/cancelled?start=2026-10-01&end=2026-10-31&type=16`.
That panel (Yii2, «Exord Soft») has no API for the report, so
`services/sd_panel.py` signs in the way its form does — GET `/login` for the
`_csrf-backend` token, POST `LoginForm[username]` / `LoginForm[password]`, one
session cookie — and reads that one page. The doors sit on the Tasker router
(`GET` / `PUT /api/admin/tasker/panel`, `POST /api/admin/tasker/panel/fetch`);
the screen is `pages/admin/SdPanelSettings.jsx` (+ `sdPanelText.js`, four
languages). Admin-only, not grantable.

- **The address is a constant** (`REPORT_URL`), the host fixed, redirects never
  followed: a bounce to `/login` is the answer («no_access»), not a place to go.
  The period is fixed to October 2026 because the operator named that address;
  another period is a new ruling.
- **The password is SEALED** (`sdpanel_password`, `web_auth.seal_password`) and
  shown in plain text on the card (the 2026-11-12 token ruling), kept EXACTLY as
  typed (no `clean_token`: a password may hold spaces and dashes). The action
  register records that it changed and its length.
- **One attempt per press**, no retry — a wrong password is never repeated into
  a locked account. Failures are named on the card: `no_login`, `unreadable`,
  `no_csrf`, `refused` (with the panel's own words), `no_access`, `status`,
  `shape`, `network`, `timeout`. Three calls of ≤ 25 s each stay inside
  Cloudflare's 100 s; the DB connection is handed back during the wait.
- **The page is checked before it is read**: the table's ten headers must be
  exactly `HEADERS`, every row ten cells — else `shape`, never a misread
  column. The last read is kept in `sdpanel_last` (rows included, ~250 KB for
  October); a failed read keeps the previous rows (`rows_at`).
- **What a row is**: ONE checklist question that LOST points in one inspection —
  an inspection scored 100 % has no row, so this is not an audit count. Columns:
  workshop (its panel id from the `/task-factory/list?id=` link), inspector,
  day, the inspection's overall %, this question's %, the task (its
  `/task-scheduler/view?id=` — one per checklist section, not per inspection),
  the question (`tr[data-id]`), the comment, «TOP (N)» or blank. No pagination:
  October was one page, 505 rows from 208 inspections over 121 workshops.
  `type` 16 = «Технический аудит», 10 = «КРУ Производство».
  The same report for any period and both types feeds «Auditlar» (`/audits`,
  `docs/audits.md`) through `read_reports` — one login, several paths.
- **Observed on the first read (not acted on):** the panel's workshop id equals
  `public.audit.factory_id` (99 of 110 date + rating matches), but
  `public.audit.division_name` disagrees with the panel's own name for EVERY
  such id (104 of 104, one fixed name per id since 2025). «Texnologlar
  auditi» (docs/kpi.md) picks the cell from `division_name`, so it credits
  audits to the wrong cells. Choosing the cell by `factory_id` through the
  panel's names (its `terminal[]` picker lists all 402) waits on the operator.
