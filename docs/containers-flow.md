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
    MOVED out of the Production app by `app: "containers"`. Its page key is
    unchanged; **shift- and top-managers hold it from 2026-11-15** (the
    operator: «add tv mode for shift managers and top managers» —
    `startup.containers_tv_managers`), so the two pages of the section sit
    side by side for them.
- **Without the launcher (a shift-manager, a brigadir) both rows sit in the
  sidebar's own «Konteynerlar» section**, right after Production — `group:
  "containers"`, a NAV_GROUPS entry of its own (2026-11-15, the operator, on a
  shift-manager's sidebar: «it should be outside the production»). Until then
  they fell into the Production group; a top-manager or admin with no app open
  (the whole register) saw the same.
  - **«Konteyner berish»** (`/containers/flow`, `pages/ContainerFlow.jsx`) —
    page key **`container-flow`** (admin-only by default, `[]`; from
    2026-11-14 — it was `adminOnly` with no key on its first day).
- **Not touched** (the operator, asked the same day): the «Konteynerlar» /
  «Soatlik» views on «Zagruzka fayli»'s «Jamoalar» card and «Konteynerlar —
  jami» on «Smena kunligi».
- **Who presses what** — the page keys below, admin-only until granted (all
  but the watch key); any
  opens the page (`page: [...]` on the nav link and the route —
  `canAccessPage` takes a LIST, any of them):
  - **`container-flow` is AXO** (the operator, 2026-11-14: «show this page for
    Fozilova Dilafruz, she is the member of AXO and she has to create the
    requests»): «So'rovlar» → «Yangi so'rov», cancelling one, the «AXO» tab
    (issuing an hour), settling a dispute from «Hammasi».
  - **`container-logistics` is Logistics** (the same day: AXO «should not
    choose the brigadirs, she has to choose Nuriddin aka, he is the guy from
    logistics, and Nuriddin aka has to choose the brigadirs»): the requests
    addressed to them on «So'rovlar» → «Brigadirlarga taqsimlash», and the
    «Logistika» tab (a batch's delivery / send-back).
  - Both read «So'rovlar», «Hammasi» and «Hisobot». A logistics person who is
    not AXO sees only the requests addressed to them.
  - **Admins only** (`verify_admin`): a leader's answer, «Majburan yopish»,
    writing the settings — the «Liderlar» and «Sozlamalar» tabs.
  - The server says who the viewer is (`GET /settings` → `admin`, `axo`,
    `logistics`, `_roles`); the tabs follow it. Guards: `PAGE` (AXO), `LOGI`
    (Logistics), `ANY` (either) in `routers/container_flow.py`.
  - Holders: **Fozilova Dilafruz** (guest, AXO —
    `startup.dilafruz_container_flow`), **Nuriddin aka** and, from 2026-11-16,
    **Yusuf aka** (both «Kutish mas'uli» profiles, Logistics —
    `startup.nuriddin_container_logistics`, `startup.yusuf_container_logistics`);
    docs/data-fixes.md. With two, AXO picks the addressee on «Yangi so'rov»;
    the form starts on whoever that device sent to last (`cflow_last_logistics`),
    and each logistics person sees only the requests addressed to them.
  - **`container-receive` is a brigadir's «Qabul»** (2026-11-14): confirming
    what reached their line from a split request — their OWN unit only (a
    supervisor's `role_id` is the unit), admins any. **Open to the brigadir
    role from 2026-11-15** (the operator asked how brigadirs accept and which
    pages to open, and answered «Yes, both» — `startup.container_receive_brigadirs`,
    default `["supervisor"]`); nothing else is opened to them (a
    holder of only this key sees the «Qabul» tab and nothing of the AXO /
    logistics side — `WHO` reads `/settings`, `RECV` the receipts).
  - **`container-watch` is the shift- and top-managers WATCHING** (2026-11-15,
    the operator: «make it visible for shift managers and top managers too»,
    asked and answered: the whole page, watch only). The one key that is NOT
    admin-only by default: `["top-manager", "shift-manager"]`. It joins every
    READ — `ANY` (board, requests, history, teams, readiness, report and its
    Excel, `hour-need`), `WHO` (`/settings`) and `RECW` (the receipts) — and
    no write: a test walks every POST / PUT and fails if one takes the key.
    A watcher sees «So'rovlar» (all requests, «Kun rejasi» with inert tiles),
    «Qabul» (every unit, no button), «Hammasi» (no «Hal qilish») and
    «Hisobot»; no «Yangi so'rov», no split, no settings.
- **The one message** (2026-11-14): a new or cancelled request DMs its
  logistics person (`notify_request`, keys `container_request_new` /
  `_cancelled`, a button opening the page; category «other», subject `page`
  `/containers/flow`) — **only while «Sozlamalar» → «Telegram xabarlari» →
  «Logistika xodimiga» is
  on** (`container_flow.notify_logistics`, OFF by default; a settings save from
  an older tab without `notify` leaves it as it is). **Switched ON on
  2026-11-15** at the operator's word («turn on the telegram messages for
  nuriddin aka») by `startup.container_flow_notify_on` (docs/data-fixes.md).
- **The brigadir's card** (2026-11-15): when the logistics person splits a
  request, each brigadir of it gets ONE card (`notify_split`, key
  `container_split`, subject page `/containers/flow`): the hour, their unit's
  counts, who sent it — and two buttons. **«✅ Hammasi keldi» (green) confirms
  in the bot** (callback `crv:<request>:<unit>`, `_crv_callback` →
  `receive_from_bot`: the tapper must be an approved holder of
  `supervisor:<unit>` — callback data is typeable and a card can be
  forwarded; once; the card's buttons become a disabled «✅ Qabul qilindi ·
  HH:MM»; logged as `containers.request_received` with `via=bot`).
  **«✏️ Boshqa son»** opens `/containers/flow?tab=receive&rcv=<request>` —
  «Qabul» with that card's count dialog open. Sent only while «Sozlamalar» →
  «Brigadirlarga» is on (`container_flow.notify_brigadirs`, switched ON once by
  the same one-shot) and only to a brigadir who may open «Qabul»
  (`receive_open`: a personal grant / deny on the profile, else the role's
  page access) — a card whose buttons lead to «no access» is worse than none.
- **The reminder** (2026-11-15, the operator: «add a reminder for brigadirs who
  don't confirm»; `remind_unconfirmed`, on the flow's 5-minute clock): ONE per
  unit of a split request while its part is unconfirmed — when the hour the
  containers are for BEGINS, or `REMIND_AFTER_MIN` (30) after the split if the
  split came later (`remind_at`). Only inside `REMIND_WINDOW_MIN` (120) of that
  moment, so a clock that was down never sends a burst about hours long gone.
  The part is claimed (`container_request_parts.reminded_at`) and committed
  BEFORE the card goes out, so two workers never send it twice. Same card and
  buttons, headed «⏰ Konteynerlar hali tasdiqlanmagan» (key
  `container_split_remind`); same switch and access rule. «Qabul» shows
  «Eslatma yuborildi · HH:MM» on the card.
- **Cancelling after the split** (2026-11-15, the operator: «open an option to
  cancel the request after all»): AXO / an admin may withdraw a request while
  it waits OR after its split, **until a brigadir confirms containers
  arriving** (`received` refuses it — what reached a line is a fact a cancel
  would erase from the report; the ⋮ item stays listed, disabled, its reason
  in the title). Withdrawing a split request tells the logistics person and
  each of its brigadirs (`notify_split_cancelled`, key
  `container_split_cancelled`, no buttons); a «Hammasi keldi» tapped on the
  old card answers that the request was cancelled and greys its buttons. Sent on a thread after the
  commit, so a save never waits on Telegram. Nothing else here messages
  anybody.

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
  counted, a top-up) is due 60 minutes after its draft —
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
- **A REQUEST — AXO → a logistics person → brigadirs** (2026-11-14; tables
  `container_requests` + `container_request_parts`, `create_request` /
  `assign_request` / `cancel_request` / `requests_of`). AXO never picks a
  brigadir: a request is the counts per container type, the production hour
  and ONE logistics person. **Who can be picked** (`logistics_people`) is every
  profile with a PERSONAL grant of `page.view.container-logistics` — opening
  the page to a whole role does not make its members addressees. Due an hour
  before its hour (or an hour after it was made, if made later — `_due`).
  The addressee (or an admin) splits it across brigadirs — a row per brigadir,
  a count per requested type, any non-archived brigadir; no type over what was
  asked (`over`), fewer needs a reason; the request is then `assigned` and
  CLOSED — nobody confirms the arrival yet (the operator's pick). `late` = split
  after the deadline. AXO / an admin may cancel one with a note — while it waits, or after its split until a brigadir confirms (below).
  **The counts start from the hour's figure** (2026-11-14, the operator: «when
  we choose the hours the number of containers should appear by default, then
  if it is incorrect they will correct it by hand»): picking an hour on «Yangi
  so'rov» fills every count with the «Konteynerlar» page's number for that
  hour — the whole plant, every configured non-archived unit's
  `hourly_containers.unit_hours` summed (`plant_hours`, `GET /hour-need`,
  kept a minute; the page's own filters are not applied). A hand edit sticks
  until another hour is picked; a field that differs says «Hisob bo'yicha: N»,
  and an hour with no figure says so and leaves the counts to the hand.
  **A request its addressee has not opened yet looks NEW** (2026-11-14, the
  operator: Nuriddin aka could not tell an incoming request from the rest):
  `container_requests.seen_at` (`startup.add_container_request_seen`, a
  boot `run` step) is set the first time the ADDRESSEE opens «Brigadirlarga
  taqsimlash» (`POST /seen/{id}`, `mark_seen` — AXO or an admin opening it
  clears nothing; in `_SKIP`, not «Jurnal»: attention, not an act). Until
  then his row is tinted gold with a gold edge, bold, a «Yangi» chip and a
  filled «Taqsimlash» button, and the «So'rovlar» tab carries the count
  (`isFresh` in `FlowRequests.jsx`). Only a waiting request is new; nobody
  else sees the mark.
- **An admin deletes a request outright** (2026-11-15, the operator: «put
  access for admins to delete the requests, I tested it and cannot delete
  it»): ⋮ → «O'chirish» on any request, in ANY state — a confirmed split
  included, which no cancel may touch — behind a danger `ConfirmDialog`.
  `DELETE /requests/{id}` (`verify_admin`, `delete_request`): the request and
  its parts are gone, and leave «Hisobot» and «Tahlil»; nobody is told; the
  action register keeps what it was (`containers.request_deleted`, its hour,
  state and counts). A Telegram card of it then answers «So'rov topilmadi».
  Cancelling stays AXO's everyday tool; deleting is for tests, duplicates and
  mistakes.
- **The page's parts stay in step** (2026-11-15, the operator: «I deleted it
  from requests but the receipts part — the brigadir still has the
  request»). The app keeps every answer a minute AND across reloads
  (App.jsx: `staleTime` 60 s + a persister), and a write refreshed only its
  own list, so «Qabul» kept showing a deleted request from that copy — on the
  deleter's screen and on the brigadir's phone. Now every write on the page
  re-reads EVERY `cflow-…` query (`flowUtil.refreshFlow`), and «So'rovlar» and
  «Qabul» re-read whenever they are opened or the app comes back to the front
  (`LIVE_LIST`: `staleTime 0`, `refetchOnMount` / `refetchOnWindowFocus`
  «always»); the kept copy shows only for the moment the new one takes. A
  card confirmed on a request deleted meanwhile says so («So'rov o'chirilgan»)
  and leaves the list.
- **A brigadir's LIMIT** (2026-11-15, the operator: «we have to put a limit
  for brigadirs, they don't have to get extra containers — after the
  calculation they have a limit, and the extra they don't have to take»):
  `unit_limits(day, hour)` — the unit's own figure for that production hour on
  «Konteynerlar» (`units_hours`), per container type, less what OTHER split
  requests of the same hour already gave it (a cancelled one gives its
  containers back). `assign_request` refuses a split that puts any brigadir
  past what is left (`limit`, summed over rows of one unit), and **a unit with
  no figure for the hour has no limit: 0** — containers the calculation does
  not ask for are exactly the extra. The split hint gives each unit up to its
  left limit (`split`, never scaling up); what no limit can take stays
  unsplit and the split is short, with a reason. The dialog shows «Limit: …»
  (and «oldin berilgan» when an earlier split of the hour gave some) under
  each brigadir, caps every count at it, and lists a brigadir with nothing
  left disabled, last. `GET /requests/{id}/split-hint` answers `limits` beside
  `rows`.
- **What else the requests tab answers** (2026-11-14, the operator asked for
  all eight ideas at once):
  - **The split starts filled** — `GET /requests/{id}/split-hint`
    (`split_hint`): for each requested type, the units whose hour asks for it
    on «Konteynerlar» (`units_hours`, the per-unit cache `plant_hours` now
    sums), each up to its LIMIT (above; until 2026-11-15 it scaled UP past the
    figures with `share_out` so the rows always added up to the request). Each row says its unit's own figure; any edit keeps the rows
    and «Hisobga qaytarish» brings the figures back.
  - **AXO sees whether the addressee opened it** — «Ko'rildi 14:05», or
    «Ko'rilmagan», yellow after `UNSEEN_WARN_MIN` (15).
  - **The deadline is the TIME LEFT** («35 daq qoldi», yellow inside the last
    `SOON_MIN` = 30, red «12 daq kechikdi» once past) while a request waits;
    the clock once it is split.
  - **«Kun rejasi»** (AXO): a strip of the day's hours — each hour that needs
    containers on «Konteynerlar» or has a request, «asked / needed»: green =
    split, yellow = asked and waiting (red past its deadline), an hour that
    needs containers with NO request dashed yellow inside the next two hours
    and dashed red once its deadline passed; the hour now ringed in gold; a
    tap opens «Yangi so'rov» on that hour. The header counts the hours
    without a request (always a chip, so a request made from it never moves
    the strip).
  - **A phone gets cards** (below md) — hour, chips, time left, counts as
    pills, who, the split per brigadir with its receipt, one full-width
    «Brigadirlarga taqsimlash».
  - **The receipt** — a brigadir confirms on «Qabul»: «Hammasi keldi» (one
    tap) or «Boshqa son» (per type, never above what was sent — `over`; fewer
    needs a reason), once per unit (`receive`, columns
    `container_request_parts.received*`). The request's status follows
    (`receipt`: «Yetib keldi», «Qabul 1/2», «Kam keldi»), each brigadir in the
    split line gets ✓ or ⚠.
  - **«Hisobot» opens with the requests** (`requests_report`, in the same
    `GET /report`): how many (split · waiting · cancelled), split on time %
    (judged = split + overdue; the platform's on-time band), average minutes to
    split and to open, what arrived of what the brigadirs confirmed, a table by
    day (asked → split → received, missing, late, overdue, short) with the
    short-split reasons under it; the Excel gains a «Requests» sheet.
  This REPLACED the first day's «Qo'lda so'rov», which had AXO pick the
  brigadir and the team (`manual`, removed; kind `manual` stays readable in the
  report).
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

### «Tahlil», and the page rebuilt around the request flow (2026-11-15)

The operator: «add more analytics with graphs … rebuild it with good design,
all the containers app».

- **Tabs** (`TABS` in `pages/ContainerFlow.jsx`): «So'rovlar» · «Qabul» ·
  **«Tahlil»** · «Hisobot» · **«Partiyalar»** · «Sozlamalar». The four tabs of
  the AUTOMATIC batches (AXO · Logistika · Liderlar · Hammasi) are folded into
  ONE, «Partiyalar», its steps a small toggle inside (`BATCH_TABS`,
  `cflow_batch_tab`); it shows to an admin always and to anybody else only
  once a unit is enrolled — with none there is nothing in it to read. The day
  stepper leaves the two period tabs; «Yangi so'rov» sits on «So'rovlar».
- **«Kun holati»** on «So'rovlar» (`DayStatus`): the day's requests by where
  they stand as ONE bar (arrived · split, waiting for receipt · waiting for
  logistics · overdue · cancelled) and the containers asked → split →
  received. Always the same height — every state named, 0 where none — so a
  request made or split never moves the list.
- **«Tahlil»** (`components/containers/FlowAnalytics.jsx`, `GET /analytics`,
  `flow.analytics` — `ANY`, so the managers watching read it too): a period
  (last 7 days by default) as pictures. Its `summary` IS `requests_report`'s
  plus `confirm_pct`, `received_pct`, `avg_confirm_min`, `reminded`, so its
  cards and «Hisobot» agree by construction.
  - Cards, each with its own bar (`Meter` / `SplitBar`): requests by state; split
    on time % against the 95% tick; splits confirmed by brigadirs %; containers
    arrived %.
  - «Tezlik»: sent → logistics opened → split → brigadir received, the average
    time to each, and the reminders sent.
  - Charts (ApexCharts, default tooltips): asked → split → received per day
    (weeks from Monday past `WEEK_AFTER` = 45 days; labels thinned to the
    card's measured width); split on time % per day, each bar in its band's
    colour, the 95% line; containers per production hour (the peak hours);
    per container type.
  - **«Kerak va olingan — kunlar bo'yicha»** (2026-11-17, the operator: «a
    table — for a day, how many they have to get and how many they actually
    got»; `need_vs_got`, in `GET /analytics` as `need_vs_got`): one row per
    brigadir per day — **Kerak**, the day's need on «Konteynerlar» (`day_need`:
    the page's own per-brigadir count, `pp_containers.count` over every catalog
    line's plan through `zagruzka_source.line_facts`, the whole period in one
    read, every non-archived unit — the day's total, not only what the hours
    can place); **Taqsimlangan**, what logistics split to them (cancelled
    requests out); **Qabul qilingan**, what they confirmed on «Qabul»; the
    difference, the share received (the completion band, `vypTone`), and
    **Tasdiqlanmagan** — split, not yet confirmed — in its own column, so a row
    still waiting never reads as a shortfall. A brigadir who needed and got
    nothing keeps a row. Per type in the row's hover; 30 rows a page.
    **Filters and a clearer read** (the same day, the operator: «we need a
    filter here, and it should be easy to see»): it opens on the LATEST day
    of the period, so each brigadir is one row; the `FilterPanel` picks a day
    (or «Barcha kunlar»), a shift, a brigadir and a state — «To'liq oldi»
    (received ≥ need), «Tasdiq kutilmoqda» (something split is unconfirmed),
    «Berilmagan» (nothing split), «Kam oldi» (the rest below the need) — each
    state a chip on its row and counted in the filter's list. A strip above
    the rows sums what the filter keeps (need, split, received, difference,
    the share received with its bar, unconfirmed) and is always drawn, so a
    filter change never moves the rows; every column sorts (need, largest
    first, by default). A failed read of the need answers
    `null` and the table says so — the rest of «Tahlil» stands. The operator
    did not pick the «must get» source: this reads the plan's figure, the one
    the split's limit is cut from.
  - «Brigadirlar bo'yicha»: given (an inline bar, relative to the largest),
    received, missing, splits confirmed %, time to confirm, reminders.
  - «Nega kam?»: the reasons logistics split short and brigadirs received
    short, each one bar.
  - Colours are fixed in `flowUtil`: `STAGE_COLORS` (asked blue · split purple
    · received green) and `TYPE_COLORS` (a container type's own colour).
- **The on-time colour was wrong** on «Hisobot» since v4.519.0:
  `statusBands.ontimeTone` judges a FRACTION and was handed a whole percent, so
  every figure read green. `flowUtil.onTimeTone(pct)` divides first; both tabs
  use it.
- **«Konteynerlar» board** (`/containers`): «Soatlar bo'yicha grafik»
  (`components/containers/HourChart.jsx`) — one bar per production hour stacked
  by container type, the hour now marked, the peak hour named; the hourly
  table's own numbers. It sits right under the day's totals, above «Hozirgi
  soat» (the operator, 2026-11-15: «put it higher, after the overall for the
  day»). The board's order from then: totals → graph → «Hozirgi / Keyingi
  soat» → the «Soatlar bo'yicha» table → «Keyingi soat — brigadirlar
  bo'yicha» → the brigadir table (the table moved above the next hour by
  brigadir the same day: «put 5 instead of 4»). Not in TV mode (that board is scaled as a whole and its
  table already shows the hours around now).

### Not built (the plan's remaining parts — ask first)

- A leader's own card; the brigadir's view of the AUTOMATIC batches (their
  «Qabul» covers requests only).
- Every other notification (AXO, leaders, a second reminder) and the
  escalation chain.
- The printed QR label and the scan (Logistics confirms with a tap for now).
- AXO delivery on-time % on the KPI pages; the peak hour against AXO's stock.
- The operator's rulings on: the deadline of a late-drafted batch (a default
  is in place, above), the top-up threshold per container type (one number
  for every type today), the first-day date.
