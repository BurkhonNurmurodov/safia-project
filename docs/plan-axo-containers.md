# Plan — container issuing: AXO → Logistics (MITSU) → Leader

Status: **design plan, nothing built** (agreed with the operator 2026-11-14).

## 1. Purpose

Every container a cell works with comes **from AXO only**. The system makes
sure each cell gets its containers **one hour before** the production hour that
needs them, that every handover is confirmed, and that every gap has a reason
and a person who answers for it.

## 2. Roles

| Role | Account | What they do |
|---|---|---|
| **AXO** | new accounts, page key `containers_axo` | Issues containers per unit and hour |
| **Logistics (MITSU)** — one person, one step | new accounts, page key `containers_logistics` | Confirms the count received **and** that the batch goes to the right unit; may correct the count (with a reason) or send the batch back to AXO |
| **Brigadir** | existing | Sees their unit's batches and the split — **acts on nothing** |
| **Leader** | existing | Accepts their cell's share: all / partial / refused |
| **Admin** | existing | Sees everything; the only one who may close a stuck batch (with a note) |

## 3. Rules

1. **AXO is the only source.** No reuse between hours, no borrowing from other
   cells — the hour's need is what AXO issues.
2. **The need** is the platform's existing hourly figure («Soatlik»,
   `pp_containers` / `containerCount`) per unit, per container type (the five
   catalog types), per hour — see `docs/production-quantities.md`, «Hourly
   containers».
3. **A batch = one unit × one production hour H.**
4. **Deadline:** AXO issues by **H − 60 min**; leaders accept by **H**. Issued
   after H − 60 is **late**, even if every later step was on time.
5. **Early issuing** is allowed up to **H − 120 min**, never earlier: the plan
   changes during a shift, a shift's worth of containers stacked by the line is
   in the way and gets dirty, and a leader accepting containers hours ahead
   means nothing.
6. **Nothing passes automatically.** A batch waits at its step until the right
   person acts. Overdue only escalates (the person → their manager → admin) and
   marks the batch late. Only an admin closes a stuck batch, with a required
   note, logged to «Jurnal».
7. **A lower number needs a reason** at every step (short · damaged · wrong
   type · other + comment).
8. **Returns are NOT tracked**, so the system shows no balance — it would be a
   wrong number.
9. **Top-up:** when the plan for hour H grows after its batch was drafted, the
   platform drafts a top-up batch for the difference. A shrinking plan takes
   nothing back; the report shows the surplus.

## 4. Process

```
H − 120  platform drafts the batch from the hour's need          → REQUESTED
≤ H − 60 AXO issues (counts per type)                             → ISSUED      (late if after H − 60)
         Logistics (MITSU) confirms count + unit / corrects / back → CONFIRMED
         platform splits between cells by each cell's need         → DISTRIBUTED (automatic)
≤ H      each leader: accept all / enter actual / refuse           → ACCEPTED | DISPUTED
         every share answered                                      → CLOSED
```

- **The split is automatic:** each cell's share is its own need for hour H.
  When fewer were confirmed than needed, every share is cut in proportion; the
  leader reads «due 18, got 15», and that shortage counts against AXO, not the
  leader.
- **Disputed** (a leader refuses or accepts fewer): AXO and the brigadir are
  told; AXO or an admin settles it with a note.
- Night hours follow the platform clock rule — Tashkent wall clock, a shift
  crossing midnight belongs to the day it started.

## 5. Data model (new tables, additive)

- `container_batches` — factory, unit, day, hour H, kind (regular / top-up),
  status, who and when at each step, late flag
- `container_batch_lines` — batch, container type, need / issued / confirmed,
  reason
- `container_shares` — batch, cell, leader, type, due / sent / accepted,
  status, reason
- `container_events` — every action (who, when, old → new, comment), mirrored
  to «Jurnal»

## 6. Screens

- **AXO** `/containers/axo` — a timeline of hours; the next due slot on top
  («Due 09:00 · 9422 · 20 rectangle, 10 round»), overdue slots red; issue with
  `CountStepper` pre-filled from the need; the next 2 hours issuable from the
  same screen.
- **Logistics (MITSU)** `/containers/logistics` — a queue of issued batches;
  each card shows AXO's counts and the unit → Confirm · Correct count · Send
  back.
- **Leader** — a card on their page: «Containers for 10:00: 18 rectangle,
  6 round. Accept?» → Accept all · Enter actual · Refuse (reason).
- **Brigadir** — read-only: their unit's batches by hour and the split.
- **Report «Konteynerlar oqimi»** — per day / unit / type: need → issued →
  confirmed → accepted, the gaps and who answers for each, **AXO on-time %**;
  Excel export.

Built from the UI templates (`DataTable`, `Modal`, `ConfirmDialog`,
`CountStepper`, `FilterPanel`, `DayStepper`, `Toast`).

## 7. Notifications (in-app + Telegram buttons)

- **AXO:** H − 90 «the 10:00 batch is due at 09:00»; H − 60 overdue; H − 30
  alert to admin.
- **Logistics (MITSU):** a new issued batch is waiting.
- **Leader:** containers arrived for hour H; a reminder at H − 15 if not
  accepted.
- **AXO + brigadir:** a batch is disputed.

## 8. Rollout

1. **Phase 1** — AXO and Logistics accounts, issue, confirm, automatic split,
   leader acceptance, notifications, the report. Shipped **admin-only**, opened
   to the floor on a first-day date the operator names.
2. **Phase 2** — top-up batches; AXO on-time % in the KPI pages.
