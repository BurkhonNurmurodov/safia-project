# Plan — container issuing: AXO → Logistics (MITSU) → Leader

Status: **design plan, nothing built** (agreed with the operator 2026-11-14;
revised the same day after a review against how «Soatlik» computes the hourly
need — §10 lists what changed and why).

## 1. Purpose

Every container a cell works with comes **from AXO only**. The system makes
sure each team gets its containers **one hour before** the production hour that
needs them, that every handover is confirmed, and that every gap has a reason
and a person who answers for it.

## 2. Roles

| Role | Account | What they do |
|---|---|---|
| **AXO** | new accounts, page key `containers_axo`, a named **manager** on each account | Issues containers per hour, for every unit at once |
| **Logistics (MITSU)** — one person, one step | new accounts, page key `containers_logistics`, a named **manager** | Confirms each **trip** (the batches on one trolley run) by scanning their labels; may correct a count (with a reason) or send a batch back to AXO |
| **Brigadir** | existing | Sees their unit's batches and the split; may file a **manual request** (§3.10) — acts on nothing else |
| **Leader** | existing | Accepts their teams' shares: all / enter actual / refuse |
| **Admin** | existing | Sees everything; the only one who may close a stuck batch (with a note) |

An AXO or Logistics account without a manager cannot be saved: escalation
(§3.6) needs somebody to go to.

## 3. Rules

1. **AXO is the only source.** No reuse between hours, no borrowing from other
   teams — the hour's need is what AXO issues.
2. **The need** is the platform's existing hourly figure («Soatlik»,
   `pp_containers` / `containerCount`, `HourlyContainers.jsx`) per **team**
   (Команда — a work centre, or a group letter within it), per container type
   (the five catalog types), per hour — see `docs/production-quantities.md`,
   «Hourly containers». **It is an estimate**: it assumes a team makes its
   positions in «№» order from shift start at N people × the productive pace,
   so any change to ПЛАН, N, the order or the efficiency moves every later
   hour. Its own record says «ask before making these hours move a number» —
   this plan is that ask, and §3.3 is how it is answered.
3. **The need is FROZEN when the batch is drafted.** The batch stores its own
   need per team and type at H − 120. AXO is judged against that stored
   number, never the live one. What the plan does after that is a top-up
   (§3.9), not a moved target.
4. **A batch = one unit × one production hour H**, its lines per team × type.
5. **Deadline:** the batch is **delivered** (Logistics' scan, §4) by
   **H − 60 min**; leaders accept by **H**. On-time is the physical handover,
   not a button press: AXO's own «issued» time is kept and reported as a
   second figure, never the verdict.
6. **Early issuing** is allowed up to **H − 120 min**, never earlier: the plan
   changes during a shift, a shift's worth of containers stacked by the line is
   in the way and gets dirty, and a leader accepting containers hours ahead
   means nothing.
7. **Nothing passes automatically.** A batch waits at its step until the right
   person acts. Overdue only escalates (the person → their manager → admin) and
   marks the batch late. Only an admin closes a stuck batch, with a required
   note, logged to «Jurnal».
8. **A lower number needs a reason** at every step (short · damaged · wrong
   type · other + comment).
9. **Top-up:** when the plan for hour H grows after its batch was drafted, the
   platform drafts a top-up batch for the difference, **once the difference
   reaches a threshold** (per type; the operator names it — a single container
   is not a batch). A shrinking plan takes nothing back; the report shows the
   surplus. Top-ups are phase 1: with the need frozen they are the only clean
   way to follow a plan that grows.
10. **Manual request** — the way in for what the platform cannot plan: a line
    with no Трудоемкость, no people or no capacity has no hour, so it gets no
    batch. A brigadir (or the leader) files a request — team, type, count,
    hour — and it travels the same AXO → Logistics → Leader path as a batch,
    counted as **manual** in the report. Without this door containers go out
    by phone and the report looks clean while it is wrong.
11. **Returns are NOT tracked**, so the system shows no balance — it would be a
    wrong number.

## 4. Process

```
H − 120  platform drafts the batch, need FROZEN                   → REQUESTED
         AXO issues the hour — every unit on one screen            → ISSUED      (issue time kept)
≤ H − 60 Logistics scans the trip's labels: confirm / correct / back → DELIVERED  (late if after H − 60)
         platform splits between teams by each team's frozen need  → DISTRIBUTED (automatic)
≤ H      each leader: accept all / enter actual / refuse           → ACCEPTED | DISPUTED
         every share answered                                      → CLOSED
```

- **The label.** Issuing prints one label per batch (unit, hour, counts per
  type, a QR code). Logistics scans it when the trolley reaches the unit — that
  scan IS the delivery confirmation and proves the unit, with no typing; the
  leader may scan it to open their card. The in-app camera
  (`docs/checklist-camera.md`) is the scanner.
- **The split is automatic, per TEAM**: each team's share is its own frozen
  need for hour H — the need exists per team, not per cell, so the share does
  too. When fewer were confirmed than needed, every share is cut in proportion,
  rounded by **largest remainder** so the shares add up to the confirmed count
  exactly; the leader reads «due 18, got 15», and that shortage counts against
  the step that caused it (§4, «who answers»), never the leader.
- **One card per leader**, listing every team they run for hour H — not one
  card per team.
- **Who answers for a gap** — three gaps, three owners, three report columns:
  - need → issued: **AXO**
  - issued → delivered: **Logistics / transit**
  - delivered → accepted: **dispute**, settled by AXO or an admin with a note
- **Disputed** (a leader refuses or accepts fewer): AXO and the brigadir are
  told; AXO or an admin settles it with a note.
- Night hours follow the platform clock rule — Tashkent wall clock, a shift
  crossing midnight belongs to the day it started.

## 5. Data model (new tables, additive)

- `container_batches` — factory, unit, day, hour H, kind (regular / top-up /
  manual), status, who and when at each step (issued and delivered both kept),
  late flag, label code
- `container_batch_lines` — batch, team, container type, need (frozen) /
  issued / delivered, reason
- `container_trips` — one Logistics run: who, when, the batches scanned on it
- `container_shares` — batch, team, leader, type, due / sent / accepted,
  status, reason
- `container_events` — every action (who, when, old → new, comment), mirrored
  to «Jurnal»

## 6. Screens

- **AXO** `/containers/axo` — **one hour across every unit**: the next due hour
  on top («Due 09:00 — 12 units»), each unit a row pre-filled from the frozen
  need, ONE «Issue» for the hour, a `CountStepper` only where a count differs;
  overdue hours red; the next 2 hours issuable from the same screen; labels
  printed on issue.
- **Logistics (MITSU)** `/containers/logistics` — the issued batches waiting;
  «Start trip» → scan each label → per batch Confirm · Correct count · Send
  back.
- **Leader** — one card on their page per hour: «Containers for 10:00 —
  9422 A: 18 rectangle, 6 round · 9422 B: 4 grey. Accept?» → Accept all (one
  tap, every type and team) · Enter actual · Refuse (reason).
- **Brigadir** — read-only: their unit's batches by hour and the split; the
  «Manual request» button.
- **Report «Konteynerlar oqimi»** — per day / unit / team / type: need →
  issued → delivered → accepted, the three gaps in their own columns with who
  answers for each, **delivery on-time %** (and AXO's issue on-time % beside
  it), regular / top-up / manual counted apart, the frozen need beside what the
  live plan says now (how far the estimate drifted); Excel export.
- **Readiness check** (admin, before go-live): per unit, the share of the
  day's planned volume whose lines carry a container capacity — a unit with
  gaps runs on manual requests until the catalog is filled (the A2891 / A28910
  case: capacities on unlettered lines that no team row read).

Built from the UI templates (`DataTable`, `Modal`, `ConfirmDialog`,
`CountStepper`, `FilterPanel`, `DayStepper`, `Toast`).

## 7. Notifications (in-app + Telegram buttons)

**One message per hour per person, never one per batch** — about 20 units an
hour would otherwise be 20 messages and the bot gets muted.

- **AXO:** H − 90 «the 10:00 hour is due at 09:00 — 12 units»; H − 60 the
  units still not delivered; H − 30 the same list to their manager, then
  admin.
- **Logistics (MITSU):** issued batches are waiting (one message as an hour is
  issued).
- **Leader:** containers delivered for hour H; a reminder at H − 15 if not
  accepted.
- **AXO + brigadir:** a batch is disputed; a manual request is filed.

## 8. Open questions for the operator

1. **When is ПЛАН typed?** If it is typed after the shift starts, the first
   hours have no plan at H − 120. Do those hours start on manual requests, or
   is their batch drafted late (and judged from the draft time)?
2. **The top-up threshold** per container type.
3. **AXO's stock.** No balance (§3.11), but the report could set the peak
   hour's need against AXO's total stock of each type — an early answer to
   «does AXO physically have enough». Wanted?
4. **The first-day date** the floor sees it (§9).

## 9. Rollout

1. **Readiness** — the capacity check (§6) per unit; units with gaps filled or
   named as manual-only.
2. **Phase 1 — a ONE-unit pilot**, admin-only, behind a first-day date the
   operator names: AXO and Logistics accounts, the frozen need, hourly issuing,
   labels and trips, the per-team split, leader acceptance, top-ups, manual
   requests, notifications, the report. Run it 1–2 weeks and read two numbers
   off it: **the taps per day** (whether hourly leader acceptance survives, or
   moves to exceptions only) and **the drift** between the frozen need and the
   live plan (whether the estimate is good enough to judge AXO by).
3. **Phase 2** — the remaining units; AXO delivery on-time % in the KPI pages.

## 10. What the review changed (2026-11-14)

| Was | Now | Why |
|---|---|---|
| The need read live | Frozen at the draft (§3.3) | «Soatlik» is an estimate that moves with every edit; a moving target cannot judge anyone |
| Split per cell | Split per team (§4) | The need exists per Команда; a whole-centre team spans cells with no per-cell figure |
| One batch = one AXO action | One hour across every unit = one action (§6) | ~400 batches a day × three steps would be worked around, and the data would be noise |
| Logistics confirms each batch by eye | Scans a label per batch, per trip (§4) | Proves the unit and the time with no typing |
| Late = AXO's button after H − 60 | Late = delivery after H − 60 (§3.5) | A press is not a handover |
| Every shortage counted against AXO | Three gaps, three owners (§4) | A Logistics correction is not AXO's |
| No path for unplannable lines | Manual request (§3.10) | Otherwise those containers move by phone, outside the report |
| Telegram per batch | Per hour per person (§7) | ~20 messages an hour gets the bot muted |
| Top-up in phase 2 | Phase 1, with a threshold (§3.9) | With a frozen need it is the only way to follow a growing plan |
| Phase 1 to every unit | One-unit pilot first (§9) | Measures taps and drift before the whole plant depends on it |
