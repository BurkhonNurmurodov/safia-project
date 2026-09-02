# Moving the leader checklist from PER LEADER to PER CELL

**Status: PLAN ONLY — nothing implemented.** Written 2026-08-30 against `VERSION` 3.72.1; citations re-verified against `main` at 4.23.1 on 2026-09-02.
This document is the map of the current flow and the executable plan for the change.
Read it whole before touching a line; the ordering of the stages is the plan.

---

## 1. What a submission IS today

One leader files **one** checklist **per day**. That sentence is enforced in exactly one
place and everything else derives from it:

```
backend/app/models.py:1539
    UniqueConstraint("leader_id", "date", name="uq_ltask_day")
```

Around it:

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

There are **two collection doors** and one rule that picks between them:

* **Sheet** — the Google Form → `LeaderChecklist` (`models.py:157`). Wiped and reloaded on
  every Refresh, **no unique constraint** (the docstring says a leader may legitimately
  submit twice for one day and both rows count), and **no cell column at all**.
* **Bot** — `/tasks` → `LeaderTaskDay`.
* `leader_bot.merges()` (`leader_bot.py:132`) decides; `LeaderDaySource` (unique on
  `(leader_profile_id, date)`, `models.py:3070`) is the admin's per-day override.
* The register displaces one with the other here — **the single most important line in
  the whole change**:

```python
# backend/app/routers/leaders.py:618
filed = {(b["leader_id"], b["date"]) for b in bot_rows}
data  = [r for r in sheet_data if (r["leader_id"], r["date"]) not in filed] + bot_rows
```

**Scale (from `backend/seed_leader_profiles.py`, recorded in memory `leader-profiles-bulk-seed`):
93 leaders · 108 cells · 18 units. 15 leaders run 2–3 cells; the other 78 run one.**
That number governs every judgement below: going per-cell multiplies total submissions by
about **1.16×**, not by 3. The cost is concentrated on 15 people, not spread over 93.

---

## 2. What already survives N submissions per leader-day — FOR FREE

This is the good news, and it is most of the system. Two independent reasons:

**(a) Every downstream key is a ROW ID, not a (leader, date) pair.** `bot_ref` names an
entry, `report_key` and `day_uid` name a day, disputes name a ref, late proofs and camera
rolls name a day+task. The moment more day rows or more entry rows exist, all of these
address the new rows correctly with **no code change**:

* the whole AI pipeline — discovery, the queue, the drain, refs, dedupe, verdicts
* the day report and its DM ledger, `resend_if_changed`, `sweep_unreported`
* the three-stage objection chain
* late proofs and their draft roll
* the camera roll and the server stamp

**(b) The frontend scoring core already averages several rows onto one day.** It was built
for the sheet layer's double-filings and for the two-shift case, and it is exactly the
arithmetic a per-cell model needs:

```js
// frontend/src/pages/Leaders.jsx:942  slotsBy
day.sum += r.completion; day.n++;      // …then sum += day.sum / day.n
// frontend/src/pages/Leaders.jsx:2557 taskStats — slots keyed `leader|date`
a.n++; if (effDone(tk)) a.done++;      // …then t.done += a.done / a.n
```

So the standings, the rating, Barqarorlik, the heatmap, the trend line, the sparkline and
the per-question chart all keep computing **the leader's daily mean across their cells**
without being touched. `winDays` is a count of *days*, not of rows — no denominator
multiplies. (Since the cutoffs feature shipped, `slotsBy` is `(rows, keyFn, cuts, dates)` —
the extra arguments expand a person's cutoff over the window and leave the per-day
averaging above exactly as it was.)

**Do not rebuild any of this.** The temptation will be to "make the scoring cell-aware";
it already is, in the only sense that matters.

---

## 3. What actually breaks

Ordered by severity. These are the whole cost of the change.

### Blockers

| # | Site | Today | Under per-cell |
|---|---|---|---|
| B1 | `models.py:1539` `uq_ltask_day` | one day per (leader, date) | second cell's day is **rejected at insert** |
| B2 | `telegram_bot.py:2537` `_lt_day()` | `.filter_by(leader_id, date).first()` | silently returns **one arbitrary** day of N |
| B3 | `leader_tasks.py:979` `compute_completion` | sums each entry's weight | a task done on 3 cells earns **3× its weight** → scores above 100 |
| B4 | `leader_close.py:62` `closed_tasks` | returns `{task_id}` | cannot tell "task 4 closed on cell A" from "on all cells"; `maybe_close_day` (`:323`) closes the day early |
| B5 | `models.py:1727` `uq_ltask_photo_slot` | (day_id, task_id, slot) | two cells collide on slot 0 |
| B6 | `models.py:1564` `uq_ltask_entry` | (day_id, task_id) | one answer per task per day |

### Major

| # | Site | Problem |
|---|---|---|
| M1 | `leaders.py:618` `filed` set | one sheet row is displaced by N bot rows — correct, but the sheet layer can never express per-cell (`LeaderChecklist` has no cell column) |
| M2 | `models.py:3070` `uq_leader_day_source` | the admin's bot-vs-sheet choice cannot address one cell |
| M3 | `leader_exclusions.py:57` `key()` = `person|date` | an exclusion takes out **all** of a leader's cells that day; there is no way to forgive one cell |
| M4 | `models.py:1567` `LeaderTaskCapture` (PK `telegram_id`) | the in-flight photo capture has no cell, so shots land on the wrong day |
| M5 | `leader_proof.py:272` `save_photo(prof, task_id, cfg)` | resolves the day itself from `prof` + `effective_date` — no cell to resolve with |
| M6 | `ProofCamera.jsx:407` `?leader=&task=` | the camera page cannot name a cell |
| M7 | `leader_close.py:537` `autoclose_due`, `close_expired_days` | iterate open days — they work, but fire N× and must not close cell A's day because cell B finished |
| M8 | `leader_reports.py` | one DM per day row → a 3-cell leader and their brigadir get **3 DMs a night** |
| M9 | `Leaders.jsx:3810` register table | Date · Submitted · Leader · Supervisor · Score · Failed — N identical-looking rows per day, nothing distinguishing them |

### Minor / informational

* `leader_bot.merges()` / `training()` take `(leader_id, date)` — need a cell to stay one rule.
* `LeaderLateRequest` is keyed (leader, day) — the shift-1 filing-window opener.
* `leader_cutoffs.person_key` is **fine as-is**: a cutoff is a fact about a person, not a day.
* The config chain (`leader_tasks.effective_leader_config`, `:233`) resolves
  global → supervisor → leader. **There is no cell level.**

---

## 4. The four candidate shapes

### A — Per-cell DAY
`uq_ltask_day` → `(leader_id, cell_id, date)`. A leader with 3 cells files 3 complete
checklists, each with its own score, report page and DM.

* **For:** every row-id-keyed layer (§2a) works untouched. Conceptually blunt and obvious.
* **Against:** the 15 multi-cell leaders re-do and re-photograph **leader-scoped** work per
  cell — task 4 is a workshop walk at 9:00/11:00/15:00, task 2 a cascade meeting, task 13
  the leader's shift report. Photographing one meeting three times is a rule that teaches
  leaders the platform is not reading what they send. Also triggers every Major in §3
  (M1–M9): three register rows, three DMs, key collisions on source/exclusions.

### B — Per-cell ENTRY
One day per leader; `uq_ltask_entry` → `(day_id, task_id, cell_id)`. Every task is answered
once per cell.

* Same duplicated-work problem as A, with the completion math (B3) on top. Strictly worse
  than A unless the scope is selective — which is D.

### C — The CELL owns the day
`(cell_id, date)`; the leader is recorded as the filer.

* Cleanest against the "a cell is its CODE" philosophy and survives a mid-period leader
  change. But the register's entire spine is the **person** — standings, leaderboard,
  cutoffs, disputes, the `profile-is-the-person` rule. A leader with 0 cells could not file
  at all, and all eight leader-scoped tasks would have nowhere to live. This is a rewrite,
  not a migration. **Rejected.**

### D — The TASK declares its scope ★ RECOMMENDED
`LeaderTaskDef.scope ∈ {"leader", "cell"}`, resolved down the **existing**
global → supervisor → leader chain exactly like `proof_kind`, `min_media` and `date_check`.
The day stays per leader. A **cell-scoped** task fans out into one entry per cell the leader
owns; a **leader-scoped** task is answered once, as today.

**Why the 13 seeded tasks make this the honest answer** (`leader_tasks.py:36`):

| Cell-scoped by their own wording | Leader / workshop-scoped |
|---|---|
| 1 «Yacheykaning kunlik planini qayd qilish» — *the cell's* daily plan | 2 Cascade meeting (briefing) |
| 3 SOP standard — «Qo'shni **yacheykalarni** qayd qilish» | 4 Workshop walk, 3×/day at fixed hours |
| 7 Control-board filling (SAP) | 5 Raw-material receipt (fridge, warehouse) |
| 9 «Smena davomida rejaning 50% ni qayd qilish» | 6 Internal logistics timing |
| 10 SAP plan closure | 8 Concern reporting |
| | 11 Scheduling · 12 Assistant-leader control · 13 Leader's shift report |

Five of thirteen are about a cell. Making the other eight per-cell is not the request being
served — it is collateral damage from expressing the request as a day-level key.

---

## 5. Why D wins, stated plainly

**D is a superset of A in capability and a subset of A in churn.**

* *Superset:* declare all 13 tasks `scope="cell"` and D produces exactly what A produces —
  a full checklist's worth of answers per cell — while still costing one report and one DM.
  Per-cell **scores** (the likely reason for the request: "which cell is being run badly?")
  are derivable from D, because every cell-scoped entry carries its cell.
* *Subset of churn:* D leaves the day row alone, so **M1, M2, M3, M8, M9 never happen** —
  no key collisions on `LeaderDaySource` or exclusions, one register row, one DM, one report
  page, one score per leader-day. A causes all of them.

D's own cost is exactly three things, all local: the completion math (B3), the
`(task, cell)` closing set (B4), and one extra level in the bot menu. That is it.

**The single strongest argument against D:** it is not literally "submissions become per
cell". If the operator's requirement is that **a cell must have its own independent
submission, its own score, its own report link and its own DM** — for example because
different people effectively run different cells under one leader profile — then D does not
satisfy it and **A is the answer**. §9 is where that decision is recorded.

---

## 6. The recommended design (D), in detail

### 6.1 Schema

```python
# LeaderTaskDef / LeaderTaskSetting / LeaderTaskLeaderSetting
scope = Column(String(8), nullable=False, default="leader")   # def:  "leader" | "cell"
scope = Column(String(8), nullable=True)                      # overrides: NULL = inherit

# LeaderTaskEntry
cell_id = Column(Integer, ForeignKey("cells.id"), nullable=True, index=True)
# NULL = the task is leader-scoped, or the leader owns no cell. Exactly today's rows.

# LeaderTaskPhoto
cell_id = Column(Integer, ForeignKey("cells.id"), nullable=True, index=True)

# LeaderTaskCapture
cell_id = Column(Integer, nullable=True)
```

**The NULL trap — read this twice.** Postgres treats NULLs as *distinct* in a unique
constraint, so `UNIQUE(day_id, task_id, cell_id)` would happily accept two leader-scoped
rows for one task. Both widened constraints must be expression indexes:

```sql
CREATE UNIQUE INDEX uq_ltask_entry     ON leader_task_entries (day_id, task_id, COALESCE(cell_id, 0));
CREATE UNIQUE INDEX uq_ltask_photo_slot ON leader_task_photos  (day_id, task_id, COALESCE(cell_id, 0), slot);
```

Every existing row has `cell_id IS NULL`, so `COALESCE(...,0)` reproduces today's constraint
exactly and **no data migration is needed**.

### 6.2 One new module: `backend/app/services/leader_cells.py`

THE definition of "which cells does this leader file for", in the idiom of
`leader_close.py` and `idle_source.py` — one function, because the bot menu, the closing
sweep, the completion math, the day report and the boot self-check all ask it and three
spellings would give one leader three different checklists.

```python
def filing_cells(db, prof) -> list[Cell]:
    """The cells a leader answers cell-scoped tasks for, in verifix order.
    Empty list is a REAL answer — see fanout()."""

def fanout(db, prof, cfg) -> dict[int, list[int | None]]:
    """task_id -> the cell ids that task must be answered for.
    Leader-scoped task            -> [None]
    Cell-scoped, leader has cells -> [cell ids]
    Cell-scoped, leader has NONE  -> [None]   ← see the rule below
    """
```

**The rule for a leader with no cells: they answer a cell-scoped task ONCE, with
`cell_id = NULL`.** The alternative — dropping the task — silently shrinks their weight
denominator and scores them on a shorter checklist than everybody else, which is the same
class of invisible unfairness the exclusions feature exists to abolish. The boot self-check
(§8) names how many such leaders there are so it is never a surprise.

**A cell with no leader is filed by nobody**, and `self_check` names that count too.

**Which cells count** is a decision, not a derivation — see §9 D2.

### 6.3 The three local changes

**B3 — completion.** `leader_tasks.compute_completion` earns a cell-scoped task's weight as
the **mean over its cells**:

```python
# group entries by task_id; per task: share = done_cells / answered_cells
# done += weight * share
```

This is not a new rule — it is the platform's existing "several rows settle one day"
arithmetic (`slotsBy`, `taskStats`) applied one level down, so the bot's running score, the
stamped `completion` and the frontend mean all agree by construction.

**B4 — closing.** `leader_close.closed_tasks` returns `set[(task_id, cell_id)]`;
`maybe_close_day` compares it against `leader_cells.fanout(...)`'s expected pair set.
`autoclose_due` iterates pairs. `task_state` and `score_line` are already per row.

**Bot menu.** A leader-scoped task row is unchanged. A cell-scoped task row shows aggregate
progress (`2/3 yacheyka`) and opens a **cell sub-menu** — the same shape the flow already
has for a multi-profile account (`_lt_profile_kb`, `telegram_bot.py:2528`), so this is a
pattern the code and the leaders both already know. Callback data
`lt:task:{pid}:{tid}` → `lt:task:{pid}:{tid}:{cid}` stays far inside Telegram's 64-byte cap.

### 6.4 What is NOT touched

`leader_ai.py` · `leader_reports.py` · `leader_dispute.py` · `leader_late_proof.py` ·
`leader_exclusions.py` · `leader_cutoffs.py` · `leader_bot.merges()` · `LeaderDaySource` ·
the register's `filed` dedupe · `slotsBy` / `scoreSlots` / `taskStats` / the heatmap /
the trend / the standings.

If a stage of the implementation finds itself editing one of these, **stop** — it means the
change has drifted from D toward A.

---

## 7. Implementation stages

Each stage is independently shippable and leaves the platform working. Stages 1–3 are
**inert**: nothing changes for any leader until Stage 4 enrols a unit.

| Stage | Work | Ships as |
|---|---|---|
| **1** | Schema: the four `cell_id` / `scope` columns, the two expression indexes, the startup migration (flag `leader_task_cell_scope_2026_XX_XX_v1`). Wire it in **both** the FastAPI lifespan and `passenger_wsgi.py`. | PATCH — inert |
| **2** | `services/leader_cells.py` (`filing_cells`, `fanout`) + `resolve_scope` / `set_scope` on the existing chain + `PUT /admin/leader-tasks/scope`. **`CELL_SCOPE_IS_PILOT = True`** refuses the GLOBAL level, exactly as `CAMERA_IS_PILOT` does (`leader_tasks.py:213`) — the camera setting reached every leader on the platform on its first day (2026-08-19) because it was writable globally. | MINOR — inert |
| **3** | The three local changes of §6.3: completion, the `(task, cell)` closing set, the bot cell sub-menu. Plus `LeaderTaskCapture.cell_id` (M4), `save_photo(..., cell_id=)` (M5) and `ProofCamera` `?cell=` (M6). Still inert: every task resolves `scope="leader"`. | MINOR — inert |
| **4** | Enrolment: `LeaderUnitSetting.cell_scope_from` (§8) + the ltasks matrix control + the boot self-check assertions. **The first unit goes live here.** | MINOR |
| **5** | Read surfaces: the day report groups a cell-scoped task's sub-rows by cell code; the admin day-detail modal gains a cell column; the «Vazifalar» tab says which tasks are per-cell. | MINOR |
| **6** | *(Optional, only if asked)* a per-cell score breakdown on `/leaders` — this is what A was really wanted for, and D can produce it without A's cost. | MINOR |

**Cell labels everywhere use `utils/cellName.js#cellLabel(code, leader)`** — the verifix
CODE, never the workshop name (CLAUDE.md, the operator's standing directive of 2026-08-29).
The bot must print the code too.

---

## 8. Rollout, and how it is taken back

The platform has three precedents and they all say the same thing: **never a global switch.**

* `CAMERA_IS_PILOT` — a global write reached every leader mid-shift, five tasks each, and
  needed a one-shot to undo (`startup.reset_leader_camera_pilot`).
* `LeaderUnitSetting.bot_from` — the rehearsal window: a unit learns the new flow on a day
  that does not count.
* `per_task_close` — deliberately kept **off** the task chain, because a chain has a level
  that means "everybody".

So:

**Enrolment = `LeaderUnitSetting.cell_scope_from` — a per-supervisor DATE floor**, set on
the «Brigada sozlamalari» modal beside `per_task_close` and `bot_from`. Written through
`set_unit_settings` in the **same** call as its neighbours: they are one row, and two
parallel writes race its unique key — the trap that broke the camera pilot's first unit
(`leader_tasks._sup_row`, `leader_tasks.py:622`).

* Before the floor, the unit files exactly as today. History is never rewritten.
* The floor can only move a day **later**, never resurrect one — clamp it the way
  `merges()` clamps `bot_from` against `MERGE_FROM` (`leader_bot.py:132`).
* **Rollback is clearing the floor.** Because `cell_id` is nullable and leader-scoped is the
  chain's floor, a unit reverts to today's behaviour with no migration; the cell-scoped rows
  already written stay readable. This is the property that makes the change safe to try
  mid-week.

**Startup migrations need NEW flag keys.** An old "already ran" mark makes a re-dated
migration a no-op on every box that has booted once — the rule CLAUDE.md states three times
(the review floor, the ARC reset, the dispute stages).

**Boot self-check.** This repo has **no test suite** and a push to `main` **is** a deploy, so
`leader_close.self_check()` (`leader_close.py:973`) — already printed to the deploy output
and DMed to admins — must newly assert, for every enrolled unit:

1. every leader has ≥1 filing cell, or is named in the report (they answer cell-scoped tasks once);
2. no cell is owned by two leaders;
3. the expected `(task, cell)` pair count per leader is > 0 and < a sane cap;
4. `compute_completion` over a synthetic full day still returns exactly 100.0.

Twice already a task has closed at an hour nobody intended and the only signal both times
was a leader losing points. Assertion 4 is what stops a per-cell weight bug from reaching a
score before a human sees it.

---

## 9. Decisions that are the operator's, not mine

Answer these before Stage 4; Stages 1–3 do not depend on any of them.

**D1 — The fork.** Is the requirement *"the tasks that are about a cell are answered per
cell"* (**D**, recommended) or *"a cell has its own complete, separately-scored,
separately-reported checklist"* (**A**)?
→ If A: Stages 1–3 still apply almost unchanged; the day key widens instead of the entry
key, and §3's M1–M3, M8–M9 all become work. Budget roughly double.

**D2 — Which cells does a leader file for?** All cells with `Cell.leader_id == prof.id`?
Only `in_load` cells? There is no `active` flag on `Cell` today, and closed cells were
removed by hand during the 2026-07-11 seed. A new opt-out (`Cell.checklist`) may be wanted.

**D3 — Which of the 13 tasks are cell-scoped?** §4's table is my reading of the wording,
not a ruling. Tasks 1, 3, 7, 9, 10 look cell-scoped; 2, 4, 5, 6, 8, 11, 12, 13 look
workshop-scoped. The operator decides, per task, and can change it later per unit.

**D4 — `min_media` per cell or per task?** A cell-scoped task with `min_media = 3` and 3
cells means 9 photos. Recommendation: `min_media` stays **per cell** (it is a property of
the proof, not of the day) and the burden is managed by D3 keeping the list short.

**D5 — The sheet layer.** `LeaderChecklist` has no cell column and is wiped on every
Refresh. Options: (i) leave it per-leader — an enrolled unit simply reads from the bot, which
`merges()` already does for shift 2 and camera units; (ii) add a cell column to the Google
Form. Recommendation: **(i)**, and enrol only units that already file in the bot.

---

## 10. Version

**MINOR** (`3.(72+1).0`), for every stage.

The compatibility floor is `MIN_CLIENT = <MAJOR>.0.0` and is DERIVED, so MAJOR is the one
level the platform enforces — reserved for a shape an already-open tab stops being able to
read. Nothing here qualifies: `cell_id` on a task row is additive, a day still has one
`uid`, and an old bundle handed several entries with the same task `id` averages them
(`taskStats`, `Leaders.jsx:2557`) — which is the correct answer, not a broken one.

Under option **A** this stays MINOR too, for the same reason: an old bundle reads N day rows
as duplicate filings and `slotsBy` averages them.

**PATCH is automatic** (the Stop hook). Edit `VERSION` by hand in the turn that ships each
stage, once per turn, highest level wins.
