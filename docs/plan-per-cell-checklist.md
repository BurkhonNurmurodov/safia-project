# The leader checklist, PER CELL — the switching plan

**Status: IMPLEMENTED in v4.24.0 (2026-09-02).** Analysis 2026-08-30, decisions taken with
the operator 2026-09-02. Shipped inert — every unit's `cell_from` is NULL, so nobody files
per cell until an admin enrols a unit by hand on the ltasks matrix. See the «ONE checklist
per CELL» section of CLAUDE.md for what actually landed; this document keeps the analysis,
the rejected shapes and the reasoning behind each decision.
Read it whole before touching a line; the order of the stages is the plan.

---

## 0. The decisions (2026-09-02, the operator's — do not relitigate)

| # | Question | Ruling |
|---|---|---|
| D1 | What "per cell" means | **A full, separate checklist per cell.** Each cell-day has its own day row, score, report page and DM. |
| D2 | Workshop-wide tasks (cascade meeting, walk, shift report) | **Repeated per cell, fresh photos each time.** No sharing, no task scope flag. |
| D3 | Which cells a leader files for | **Every cell assigned to them on `/cells` (`cells.leader_id`), automatically.** Not `in_load`. |
| D4 | Where the switch lives | **Admin panel, per brigadir unit, from a date** — turn on one, a selection, or all (the «Zavodlar» / «Smena vaqtlari» checkbox + bulk-bar model). |
| D5 | History | **Applies only from the chosen date (usually today or tomorrow). Old results never change.** |
| D6 | Report DMs | **One per cell**, exactly as the sender works today. |
| D7 | Ranking | **A leader's day = the mean of their cell checklists. No cell ranking.** The register table gains a cell column, nothing else on the page moves. |
| D8 | Exclusions / late-open / bot-vs-sheet | **Per cell-day, with an «all this leader's cells» shortcut.** (Only exclusions actually reach a bot day — see §5.6.) |
| D9 | Google Form | **History only.** Every unit already files in the bot. The register keeps reading old Form rows; the Form is not edited. |
| D10 | A leader with no cell | **Files nothing.** `/tasks` says «no cell assigned»; the boot self-check names them. |

**Pre-flight, on the local mirror of prod's seed (93 leaders · 108 cells · 18 units):**
every leader owns ≥ 1 cell, every cell has a leader, 78 leaders own one cell and **15 own
two** (nobody owns three). So on today's data D3 and D10 leave **zero gaps**, and total
checklists per day go from 93 to 108 — **+16 %**, concentrated on fifteen people.

---

## 1. What a submission IS today

One leader files **one** checklist **per day**, enforced in exactly one place:

```
backend/app/models.py:1539
    UniqueConstraint("leader_id", "date", name="uq_ltask_day")
```

| Layer | Table | Keyed by |
|---|---|---|
| The day | `leader_task_days` | **(leader_id, date)** ← the constraint |
| One task's answer | `leader_task_entries` | (day_id, task_id) — `models.py:1564` |
| Chat proof photos | `leader_task_media` | entry_id |
| Camera roll | `leader_task_photos` | (day_id, task_id, slot) — `models.py:1727` |
| AI verdict | `leader_ai_reviews.ref` | `"bot:{entry_id}"` — `leader_ai.py:166` |
| Report ledger | `leader_day_reports.report_key` | `"bot:{day_id}"` — `leader_ai.py:182` |
| Report page URL | `/leaders/report/bot-{day_id}` | `leader_bot.day_uid` — `leader_bot.py:68` |
| Objection | `leader_ai_disputes.ref` | the review ref |
| Late proof | `leader_late_proofs` | (day_id, task_id) |
| Exclusion | `leader_day_exclusions.leader_key` | `person|date` — `leader_exclusions.py:57` |

The Form layer (`LeaderChecklist`, `models.py:157`) has no cell column and, per D9, receives
nothing new. The register still displaces a Form row with a bot day on `(leader_id, date)`
at `routers/leaders.py:618` — under per-cell that displaces one historical row with N bot
rows, which is the correct reading.

---

## 2. What survives untouched — and why A is affordable

**Every downstream key is a ROW ID, not a (leader, date) pair.** Because A puts the cell on
the *day row*, every new cell-day gets a fresh `day_id` and every entry a fresh `entry_id`,
so all of this addresses the new rows correctly with no code change:

* the AI pipeline — discovery, queue, drain, refs, dedupe, verdicts (`leader_ai.py`)
* the day report, its DM ledger, `resend_if_changed`, `sweep_unreported` (`leader_reports.py`) — one DM per cell is D6
* the three-stage objection chain (`leader_dispute.py`)
* late proofs and their draft roll (`leader_late_proof.py`)
* the camera roll `uq_ltask_photo_slot (day_id, task_id, slot)` and the server stamp
* per-task closing: `close_task`, `maybe_close_day`, `autoclose_due`, `close_expired_days`
  all iterate **days** (`leader_close.py:537`, `:657` — `.all()` over the leader's open days)
* `compute_completion` — each cell-day is a full checklist, so the weight sum is right as-is
* cutoffs — a fact about a person (`leader_cutoffs.person_key`)

**The frontend scoring core already averages several rows onto one day** — built for the
Form's double filings and the two-shift case, and it is D7 exactly:

```js
// frontend/src/pages/Leaders.jsx:942  slotsBy    day.sum += r.completion; day.n++   → sum += day.sum/day.n
// frontend/src/pages/Leaders.jsx:2557 taskStats  a.n++; if (effDone(tk)) a.done++   → t.done += a.done/a.n
```

Standings, rating, Barqarorlik, heatmap, trend, sparkline, per-question chart: **do not
touch them.** `winDays` counts days, not rows; no denominator multiplies.

---

## 3. What actually changes

| # | Site | Today | Work |
|---|---|---|---|
| B1 | `models.py:1539` `uq_ltask_day` | (leader_id, date) | widen to `(leader_id, date, COALESCE(cell_id,0))` — expression index, see §5.1 |
| B2 | `telegram_bot.py:2537` `_lt_day()` | `.first()` on (leader, date) | takes `cell_id`; NULL-safe filter |
| B3 | `telegram_bot.py` — 23 `lt:` callback shapes | carry `pid` | carry `pid` **and** `cid` — §5.3 |
| B4 | `models.py:1567` `LeaderTaskCapture` | no cell | `cell_id` column |
| B5 | `leader_proof.py:272` `save_photo` + `/api/leader-proof/session` + late-photo | resolve the day from `prof` | take `cell_id` |
| B6 | `ProofCamera.jsx:407` | `?leader=&task=` | `&cell=` |
| B7 | `leader_bot.dashboard_rows` (`leader_bot.py:282`) | no cell on the row | `cell_id` + `cell_code` |
| B8 | `Leaders.jsx:3810` register table | no way to tell two rows apart | «Yacheyka» column (`CellLink`), sort key; day-detail header names the cell |
| B9 | `leader_reports.day_report` + `LeaderDayReport.jsx` | no cell in the DM / header | print the cell code |
| B10 | `leader_exclusions.key()` + `LeaderDayExclusion` | `person|date` | `+ cell_id`; batch endpoint = the shortcut — §5.6 |
| B11 | `routers/leaders.py:691` `roster` («Topshirilmagan») | leader-days | leader-**cell**-days on switched units, from the floor |
| B12 | `LeaderUnitSetting` + `set_unit_settings` (`leader_tasks.py:1039`) | `per_task_close`, `bot_from` | `+ cell_from`, same single writer |
| B13 | admin panel | — | the enrolment register — §5.7 |
| B14 | `leader_close.self_check()` (`:973`) | closing-rule invariants | + the per-cell invariants — §6 |
| B15 | `GET /admin/leader-tasks/submissions` + `LeaderDailyTasks.jsx` | no cell | cell column |

Deliberately unchanged, and why, in §5.6.

---

## 4. Rejected shapes (for the record)

* **B — per-cell entries under one day**, and **D — the task declares its scope** (only
  cell-specific tasks fan out): both rejected by D1/D2. D would have been cheaper and would
  have avoided B7–B11, but the operator wants each cell to be an independent submission with
  its own score, report and DM. That is A.
* **C — the cell owns the day**: rejected; the register's spine is the person.

---

## 5. The design

### 5.1 Schema

```python
# LeaderTaskDay
cell_id = Column(Integer, ForeignKey("cells.id"), nullable=True, index=True)
# NULL = a day filed before the unit's floor, or on an un-switched unit — exactly today's rows.

# LeaderTaskCapture
cell_id = Column(Integer, nullable=True)

# LeaderUnitSetting
cell_from = Column(String(10), nullable=True)   # "YYYY-MM-DD"; NULL = not switched

# LeaderDayExclusion
cell_id = Column(Integer, nullable=True, index=True)
```

**The NULL trap.** Postgres treats NULLs as *distinct* inside a unique constraint, so
`UNIQUE(leader_id, date, cell_id)` would accept two cell-less days for one leader. Both
widened keys are **expression indexes**, and every existing row (`cell_id IS NULL`) keeps
behaving exactly as under the old constraint — **no data migration**:

```sql
ALTER TABLE leader_task_days DROP CONSTRAINT IF EXISTS uq_ltask_day;
CREATE UNIQUE INDEX IF NOT EXISTS uq_ltask_day
  ON leader_task_days (leader_id, date, COALESCE(cell_id, 0));

ALTER TABLE leader_day_exclusions DROP CONSTRAINT IF EXISTS uq_leader_day_exclusion;
CREATE UNIQUE INDEX IF NOT EXISTS uq_leader_day_exclusion
  ON leader_day_exclusions (leader_key, date, COALESCE(cell_id, 0));
```

`create_all` never ALTERs, so this is a startup migration under a **new flag key**
(`leader_task_per_cell_2026_09_XX_v1`), wired in **both** the FastAPI lifespan and
`passenger_wsgi.py`. The SQLAlchemy `__table_args__` must declare the same expression
`Index(..., func.coalesce(cell_id, 0), unique=True)` so a fresh box's `create_all` does not
recreate the old constraint.

### 5.2 One new module — `backend/app/services/leader_cells.py`

THE definition of "which cells does this leader file for, and is this unit per-cell on this
day". One module because the bot menu, the sweeps, the register, the roster, the admin panel
and the self-check all ask it, and two spellings would give one leader two checklists.

```python
def unit_floor(db, manager_id) -> str | None        # LeaderUnitSetting.cell_from
def floors(db) -> dict[int, str]                    # one query, for bulk readers
def per_cell(floor: str | None, date: str) -> bool  # floor set and date >= floor
def filing_cells(db, prof) -> list[Cell]            # Cell.leader_id == prof.id, by verifix_code
def expected_days(db, prof, date) -> list[int | None]
    # not per_cell           -> [None]        (one cell-less day, exactly today)
    # per_cell, cells        -> [cell ids]
    # per_cell, NO cells     -> []            (D10: files nothing)
```

The floor is compared against **`effective_date(shift)`**, the same day the bot already
computes — so a floor of "today" set at 15:00 makes shift 2's coming night the first per-cell
night, and shift 1's next morning the first per-cell day. D5 falls out of that comparison:
a day before the floor is created with `cell_id = NULL` and reads exactly as it always did.

### 5.3 The bot (`telegram_bot.py`)

**Flow.** `/tasks` → profile pick (existing, `_lt_profile_kb`) → **if `per_cell` for today's
effective date:** a **cell menu** — one row per `filing_cells`, labelled by verifix code
(`cellLabel` — the code, never the workshop name), each row carrying that cell's state:
`✅ 92%` closed · `3/13` answered · `⏳` awaiting verdicts · blank not started. Tapping a
cell opens the existing task menu for that cell's day, whose title names the cell and whose
«Orqaga» returns to the cell menu, not to the profile pick. **Zero cells:** «Sizga yacheyka
biriktirilmagan — brigadiringizga murojaat qiling», and nothing else (D10). **Not per-cell:**
the flow is byte-for-byte today's.

**Threading the cell through 23 callback shapes without re-indexing a single handler.**
Every `lt:` callback puts the profile id at `parts[2]`; `_lt_callback` parses
`parts = call.data.split(":")` (`:3176`). Encode the cell **inside that segment** —
`"192"` (no cell) or `"192c108"` — with two helpers:

```python
def _lt_ref(pid: int, cid: int | None) -> str          # "192" | "192c108"
def _lt_who(seg: str) -> tuple[int, int | None]        # the inverse
```

Every `f"lt:…:{pid}…"` becomes `f"lt:…:{_lt_ref(pid, cid)}…"` and every `pid = int(parts[2])`
becomes `pid, cid = _lt_who(parts[2])`. Segment counts do not change, so no handler's
indexing moves; the longest shape (`lt:tcconf:192c108:13`) is 21 bytes against Telegram's 64.

**Writers.** `_lt_day(db, pid, date, cid)`; `_lt_save_entry(..., cid)` creates the day with
`cell_id=cid, manager_id=prof.manager_id` (a cell's supervisor is kept equal to its leader's
unit by `profiles.py`, so the two never disagree); `LeaderTaskCapture.cell_id` set when a
capture starts and read when its photos land; `_lt_open_camera` appends `&cell=`; the late-
proof screens (`_lt_late_*`) carry the same `pid`/`cid` segment. `leader_close.reset_task`,
`reopen_task`, `score_line`, `task_state` are per day and unchanged.

**Sweeps.** `_lt_autoclose` → `close_expired_days` already collects **all** of a leader's
open days (`leader_close.py:683`, `.all()`) and `autoclose_due` walks every open day of
per-task units — both are per-day and need nothing. Verify only that the log line and the
action-register row name the cell.

### 5.4 Camera (`/proof/camera`, `routers/leader_proof.py`, `services/leader_proof.py`)

`?leader=&task=&cell=`; `/session` and `POST /photo` and the late-photo trio take `cell_id`
and resolve the day through `_lt_day`'s twin with it. `LeaderTaskPhoto` is keyed by `day_id`
and needs nothing. `proofQueue.js`'s offline rows carry the cell with the blob, or a shot
flushed after a cell switch lands on the wrong day.

### 5.5 Reads

* **`leader_bot.dashboard_rows`** ships `cell_id` and `cell_code` (one `Cell` query per call,
  ids → codes). The register's `filed` dedupe stays `(leader_id, date)`.
* **`/leaders` table** (`Leaders.jsx:3810`): «Yacheyka» column rendered with `CellLink`
  (`id` = cells.id), sortable; blank on a pre-floor row. The day-detail header and
  `LeaderDayReport.jsx` print `cellLabel(code)` beside the date. Any export mirroring the
  register gains the column. **Nothing else on the page changes** (D7).
* **Report DM** (`leader_reports.day_report`): the cell code in the first line; one DM per
  cell-day (D6), ledger keyed per day already.
* **Admin «Liderlar kunlik vazifalari»** (`LeaderDailyTasks.jsx`, `/submissions`): cell
  column; the detail modal header names the cell. `_pair_state` (which submission counts)
  is unaffected — a per-cell day never has a Form twin (D9).
* **«Vazifalar» tab** (`TaskRequirements.jsx`): one sentence on a switched unit — «Har bir
  yacheyka uchun alohida topshiriladi (N ta)».

### 5.6 Admin decisions on a day (D8)

* **Exclusions** — `leader_exclusions.key(leader_id, name, date, cell_id)` →
  `person|date` stays the string, `cell_id` a column beside it (the unique index in §5.1).
  `load()` keys by `(leader_key, cell_id)`; `wire` / `wire_in` / `excluded` / `orphan_rows`
  / `drop_pending_reviews` carry the cell through. **Per-cell exclusion is arithmetically
  free on the client**: `slotsBy` marks a date `off` only when it has *no surviving slot*, so
  excluding cell 6722's night leaves the day standing on 6732 — the leader's mean is over the
  cell that counted. The «all this leader's cells» shortcut is the exclusions tab selecting
  every row of that leader-date and sending the batch it already sends; `POST
  /api/leaders/exclusions` items gain an optional `cell_id`. The «Topshirilmagan» view
  lists **(leader, cell, day)** for switched units from the floor — `roster` ships each
  leader's cells (B11).
* **Late-open (`LeaderLateRequest`)** — **unchanged.** The filing-window rule voids Form
  rows only; a bot day is never voided (its close is refused after the window), so this never
  reaches a per-cell day.
* **Bot-vs-sheet (`LeaderDaySource`)** — **unchanged.** Offered only for a pair that holds
  both submissions; after the floor no such pair exists (D9).

### 5.7 The admin panel switch (D4)

A register block at the top of the ltasks admin destination — the shape of «SAP
avto-to'ldirish» on Production and the selection model of «Smena vaqtlari»:

* one row per non-archived unit: name · shift · leaders · cells · **«Yacheyka bo'yicha
  dan»** (the floor, or «—»);
* a per-row toggle (opens a `DateRangePicker single`, default **tomorrow** for shift 1 and
  **today** for shift 2 — the next shift that has not started);
* checkbox rows + «select all visible» + a sticky bulk bar: «N ta brigada · Yoqish (sana) ·
  O'chirish»;
* the same field on «Brigada sozlamalari» beside `1×1` and `bot_from`.

**One endpoint, one writer:** `PUT /admin/leader-tasks/cell-from` takes a **list** of
`{manager_id, cell_from | null}` (the `PUT /admin/production/autofill` shape) and calls
`set_unit_settings(manager_id, per_task_close, bot_from, cell_from)` — the row's single
writer, extended, so a row toggle and a bulk press are one transaction and never two
inserts racing the key (`leader_tasks._sup_row`, `:622`, is the lesson).

**The confirm names the count** and, per unit, how many leaders × cells it will produce
tomorrow. It **warns** when a unit already has OPEN per-cell days today and the new floor
would leave them stranded (clearing the floor mid-day, or moving it later) — such days
still close on their own deadline, but the leader's menu stops showing them.

**Rollback = clear the floor.** New days are cell-less again from the next effective date;
per-cell days already written stay readable and scored. No migration either way.

---

## 6. Boot self-check additions (`leader_close.self_check`)

This repo has **no test suite** and a push to `main` **is** a deploy; `self_check()` already
prints to the deploy output and DMs the admins. For every switched unit it must newly report:

1. every leader with **zero** cells (they will file nothing — D10) — by name;
2. every cell of the unit with **no** leader (nobody files it) — by code;
3. the expected cell-days per shift (Σ cells over leaders) — so a unit that will produce 40
   checklists a night is seen before the night;
4. that `uq_ltask_day` is the **expression** index (query `pg_indexes`): a box whose migration
   did not run rejects the second cell's day at insert, with nothing on screen.

On today's data 1 and 2 are both empty; the check exists for the day they are not.

---

## 7. Stages

Each ships alone and leaves the platform working. **Stages 1–4 are inert** — nothing changes
for any leader until an admin sets a floor in Stage 5.

| Stage | Work | Bump |
|---|---|---|
| **1** | §5.1 schema + startup migration (new flag key, both entrypoints) + `services/leader_cells.py` + `set_unit_settings(cell_from)` | PATCH — inert |
| **2** | §5.3 bot: `_lt_ref`/`_lt_who`, cell menu, `_lt_day`/`_lt_save_entry`/capture, late screens; the zero-cell message | MINOR — inert |
| **3** | §5.4 camera: `?cell=`, session/photo/late-photo, `proofQueue` | MINOR — inert |
| **4** | §5.5 + §5.6 reads: `dashboard_rows` cell, register column + detail header, report DM + page, admin submissions column, exclusions key + shortcut + roster | MINOR — inert |
| **5** | §5.7 admin switch + §6 self-check. **First unit goes live here.** | MINOR |
| **6** | «Vazifalar» sentence, exports, action-register rows naming the cell | PATCH |

**Version: MINOR** throughout. The floor `MIN_CLIENT` is derived from MAJOR, so MAJOR is the
one level the platform enforces — for a shape an already-open tab can no longer read.
Nothing here qualifies: `cell_id`/`cell_code` on a row is additive, a day still has one
`uid`, and an old bundle handed two rows for one leader-date averages them (`slotsBy`) —
the correct answer. PATCH is automatic; edit `VERSION` by hand once in each shipping turn.

**Volume after the switch:** +15 checklists a day (108 vs 93), +16 % AI reviews
(`gemini_batch_size` 40 per pass, chained every 5 s — comfortably inside the drain), +15 DMs
a night to leaders and the same to brigadirs. The Suvonov/Aripova/Talipova-scale units are
unaffected: their leaders own one cell each.

---

## 8. Things the implementation turn must NOT do

* Rebuild the scoring core, add a cell ranking, or change the heatmap — D7.
* Add a task scope flag, a "same for all cells" button, or copy answers between cells — D2.
* Write a global constant or a platform-wide switch — D4/D5; the floor is per unit.
* Print a workshop name anywhere — the standing rule: a cell is its CODE.
* Touch `leader_ai.py`, `leader_reports.py` (beyond the cell code in the text),
  `leader_dispute.py`, `leader_late_proof.py`, `leader_cutoffs.py`, `merges()`,
  `LeaderDaySource`, `LeaderLateRequest`, `compute_completion`, `maybe_close_day`,
  `autoclose_due`, `close_expired_days`. If a stage finds itself editing one of these,
  stop and re-read §2.
