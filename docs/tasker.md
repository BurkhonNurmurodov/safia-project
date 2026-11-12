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
- **The token is SEALED in `app_settings`** (`tasker_token`,
  `web_auth.seal_password`), never returned, never logged; the action register
  records that it changed and its length. The doc's localhost token is a TEST
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
