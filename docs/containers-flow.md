# Container issuing — AXO → Logistics → Leader

The design and its reasons are `docs/plan-axo-containers.md` (agreed with the
operator 2026-11-14). This file records what is BUILT.

## The «Konteynerlar» app and «Konteyner berish» (`/containers/flow`, 2026-11-14)

The operator, on the launcher: «open one button here and build everything
here, and make it visible only there and for admins; moreover bring the
containers row from production and move it into the new button».

- **A new launcher app `containers`** (`APPS` in `config/navLinks.js`, icon
  `Package`, hue `yellow` — a new `[data-app-hue]` pair in `index.css`; after
  «Oshxona»). It holds two rows:
  - **«Konteynerlar»** (`/containers`, the TV board, `docs/shift-report.md`) —
    MOVED out of the Production app by `app: "containers"`. Its page key and
    access are unchanged, and for anybody without the launcher the row stays
    in the Production group (the launcher's own rule).
  - **«Konteyner berish»** (`/containers/flow`, `pages/ContainerFlow.jsx`) —
    page key **`container-flow`** (admin-only by default, `[]`; from
    2026-11-14 — it was `adminOnly` with no key on its first day).
- **Not touched** (the operator, asked the same day): the «Konteynerlar» /
  «Soatlik» views on «Zagruzka fayli»'s «Jamoalar» card and «Konteynerlar —
  jami» on «Smena kunligi».
- **Who presses what** (2026-11-14, the operator: «show this page for Fozilova
  Dilafruz, she is the member of AXO and she has to create the requests»):
  - **A holder of `container-flow` who is not an admin is AXO.** The page shows
    them «AXO», «Hammasi» and «Hisobot»; they ISSUE an hour, file a «Qo'lda
    so'rov» (also offered on the empty state while no unit is enrolled — the
    way she creates a request before any unit is switched on), settle a
    dispute («Hammasi» → ⋮ → «Hal qilish»), read the history and the report.
    The endpoints behind the page key (`PAGE` in `routers/container_flow.py`):
    board, issue, manual, settle, history, teams, settings (read), readiness,
    report and its Excel.
  - **Admins only** (`verify_admin`): Logistics' delivery and send-back, a
    leader's answer, «Majburan yopish» and writing the settings — and the
    «Logistika», «Liderlar» and «Sozlamalar» tabs. Logistics and leaders get
    accounts later (the operator: «we gonna create for them accounts, for now
    just leave it»).
  - First holder: **Fozilova Dilafruz** (guest profile, AXO) —
    `startup.dilafruz_container_flow`, docs/data-fixes.md.
- **Nothing here sends a message to anybody** — no Telegram, no notification;
  that comes with the first-day date the operator names.

### How it works (`services/container_flow.py`, `routers/container_flow.py`)

- **Only ENROLLED units get batches** — `container_flow.units` in
  `app_settings`, set on the page's «Sozlamalar» tab; **none by default**, so
  shipping the engine changed nothing until a unit is switched on.
- **The need** is `hourly_containers.unit_teams(dash)` — `unit_hours` kept per
  TEAM (a work centre, one group of it, or its unlettered lines; **keep the two
  in step**, a test adds the teams back up to the unit) off the unit's own
  `production._build_dashboard`. So a batch asks for exactly what «Soatlik»
  shows.
- **Drafting** (`draft_due`, every 5 min by `register_jobs` — both entrypoints
  — and at most once a minute on a board read): for each enrolled unit and
  each hour H whose window is open (H − 120 min until the hour ends), a
  `regular` batch with the need **frozen** on it: `container_batch_lines`
  (need per container type) and `container_shares` (`due` per team × type,
  with the team's cell code and leader as text). `hour` counts from the day's
  midnight and runs past 23 for a night shift. One drafter at a time
  (`pg_advisory_xact_lock`).
- **Top-up**: on a later pass, where an hour's live need has outgrown what its
  regular + top-up batches froze by `container_flow.topup_min` (default 2) or
  more of one container type, a `topup` batch for the difference. A shrinking
  plan takes nothing back.
- **The deadline** (`_due`): delivery by H − 60 for a batch drafted on time;
  a batch that could only be drafted later (a plan typed late, people not yet
  counted, a top-up, a manual request) is due 60 minutes after its draft —
  judged from when it existed. *This answers the plan's open question 1 with a
  default; the operator has not ruled on it.*
- **The steps** — each a `FlowError(code)` when the state or the numbers do not
  allow it (the router answers 409, the page words `cflow.err.<code>`):
  `issue` (AXO; `POST /issue` takes a whole hour's batches, all or nothing) →
  `deliver` (Logistics, at the unit — **on-time is read from this**, `late` =
  delivered after `due_at`; a count may be corrected) or `send_back` (to AXO,
  with words; the deadline does not move) → the split → `answer` per team
  (`all` / `actual` / `refuse`) → closed once every team answered, `disputed`
  while a team took fewer, until `settle` (a note). `force_close` (a note,
  `forced`) is the only way a batch closes without its steps.
- **A lower number needs a reason at every step** — `short · damaged ·
  wrong_type · other`, «other» with words.
- **The split** (`split`): each team its frozen due when enough arrived (a
  surplus stays with the batch); otherwise cut in proportion by LARGEST
  REMAINDER, so the parts add up to what was delivered.
- **Manual request** (`manual`, the page's «Qo'lda so'rov»): unit, hour, team,
  counts — for a line the hours cannot see. Same steps, kind `manual`.
- **History**: `container_events`, one row per step (who, when, counts,
  reason) — the batch's «Tarix». The «Jurnal» row of each request is the
  action log's (`containers.*` in `ROUTES`, category `shopfloor`;
  `config.container_flow_saved`, `export.container_flow`).
- **Tables** (all from `create_all`, additive): `container_batches`,
  `container_batch_lines`, `container_shares`, `container_events`.

### The page

Tabs (`SegmentedToggle asTabs`, remembered in `cflow_tab`), then the day:

- **AXO** — the batches waiting to be issued, one card per hour, a row per
  unit, a `CountStepper` per container type pre-filled with the need (the grey
  number); only the types that hour asks for are columns. «Soatni berish»
  issues the card; any count under its need asks «Nega kam?» first.
- **Logistika** — issued batches per hour: «Tasdiqlash» per row, «Hammasini
  tasdiqlash» for the hour (a trip), ⋮ → correct the count / send back.
- **Liderlar** — a row per team of each delivered batch: what it was sent
  (red «/ due» when cut), «Qabul qilish», ⋮ → the actual count / refuse; a
  disputed team offers «Hal qilish».
- **Hammasi** — every batch of the day with its state; ⋮ → «Tarix», «Majburan
  yopish».
- **Hisobot** — a period: delivery on-time %, AXO's issue on-time % beside it,
  the batches by kind, and per day × unit × type need → issued → delivered →
  accepted with the three gaps in their own columns (need − issued is AXO's —
  a batch never issued counts whole once its deadline passed; issued −
  delivered is Logistics'; sent − accepted a dispute) and the surplus. Excel
  (`POST /report.xlsx`, the page's own headers).
- **Sozlamalar** — the enrolled units, the top-up threshold, and the
  READINESS table: per unit with a plan that day, the planned lines, those
  with a capacity, the containers the hours hold and those they cannot place
  (a capacity but no labour standard or people) — «To'liq / Qisman /
  Ko'rinmaydi».

Count columns are headed by short names (`cflow.ct.*`, the full name on
hover): five long names pushed the status and the actions off a laptop.

### Not built (the plan's remaining parts — ask first)

- Logistics accounts and their page key; a leader's own card; the brigadir's
  read-only view.
- Every notification and Telegram message, and the escalation chain.
- The printed QR label and the scan (Logistics confirms with a tap for now).
- AXO delivery on-time % on the KPI pages; the peak hour against AXO's stock.
- The operator's rulings on: the deadline of a late-drafted batch (a default
  is in place, above), the top-up threshold per container type (one number
  for every type today), the first-day date.
