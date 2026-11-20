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

### «Partiyalar» REMOVED, and AXO edits a waiting request (2026-11-18)

After a review of the app the operator answered «make it» to two points:

- **The automatic batches are gone.** «Partiyalar» — a batch drafted for each
  ENROLLED unit and hour, issued by AXO, delivered by Logistics, split between
  teams and accepted by leaders — was the first design; the request flow
  (AXO → a logistics person → brigadirs) replaced it on 2026-11-14, no unit
  used it, and only admins could see it. Removed: the tab and its four steps
  (`pages/ContainerFlow.jsx`), the drafting on the clock (`tick` now runs the
  reminder, the overdue alert and the escalation), the doors `/board`,
  `/issue`, `/batches/…`, `/teams`, the enrolled units and the top-up
  threshold on «Sozlamalar» (`settings` / `save_settings` carry only the
  switches; an older tab still sending `units` / `topup_min` is ignored, never
  refused), and the batches' half of «Hisobot» and its Excel (requests only
  now). Kept: the tables and their data (`container_batches`, `…_batch_lines`,
  `container_shares`, `container_events` — migrations stay additive), the
  readiness check on «Sozlamalar» (a line with no hour adds nothing to its
  brigadir's limit — reworded so), and «AXO zaxirasi» still counting a batch
  issued in the past. The sections below that describe the batches are the
  record of what was removed. A tab remembered on «Partiyalar» opens on the
  first tab.
- **AXO edits a request while it waits** (`edit_request`, `PUT /requests/{id}`,
  `PAGE`; ⋮ → «Tahrirlash» opens «Yangi so'rov» on that request): the hour,
  the counts, whom it goes to (a person or everybody), the note. Once split it
  is the brigadirs' — cancelling stays the tool (`state`). A changed request
  is «Yangi» again (`seen_at` cleared); a new hour moves its deadline (`_due`
  from now) and re-arms the overdue alert. A brigadir's approved extra keeps
  its hour (`extra_hour`) and never goes past what the brigadir asked
  (`over_ask`; `approved` follows). Telegram (behind `notify`): the same
  people «o'zgartirildi» (`container_request_edited`), a new addressee the
  ordinary «new» message, the one it left «boshqa logistga o'tkazildi»
  (`container_request_moved`). The action register keeps every changed field
  old → new (`containers.request_edited`).

### How it worked — the removed batches (`services/container_flow.py` before 2026-11-18)

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
  **Each brigadir row names the brigadir's OTDEL** (2026-11-20, the operator:
  «every supervisor has his own otdel … logistics has to know in which otdel
  how many he has to send»; asked where it comes from, they picked Verifix and
  «the split dialog only»): `GET /units` carries `otdel` — the names of the
  Verifix subdivisions the brigadir's live cells hang under, most cells first
  (`verifix_org.unit_otdels`, read off the STORED org read, never a call to
  Verifix), or, for a unit with no tied cell, the subdivision Verifix seats the
  brigadir in; a unit Verifix says nothing about gets `[]` and no line. The
  picker lists «name · S1 · otdel» (so an otdel can be typed to find its
  brigadir), the closed trigger the bare name, and a «Otdel: …» chip sits
  under it. Nothing else (the card, «Qabul», «Hisobot») names it.
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
- **A request to EVERY logistics person — the first to split it takes it**
  (2026-11-18, the operator: «AXO should send one request and this request
  should go to both, and one of them should approve it, and that's all»; it
  came out of a review: a request addressed to Nuriddin aka waited until it
  was overdue if he was not on shift). `ALL_KEY` = `"*"` in
  `logistics_key` (no migration — the column is free text): «Barcha
  logistlarga» is the FIRST option on «Yangi so'rov», «Tayyor so'rovlar» and
  AXO's approval of a brigadir's extra, and the default on every device
  (`useLogisticsPick` / `LogisticsField` in `flowUtil.jsx`, stored under a new
  key `cflow_last_logistics_v2`, so an older remembered person does not
  override it; a named person can still be picked). While it waits it is on
  every logistics person's list (`requests_of` takes `[me, "*"]`), «Yangi» for
  each of them (`isFresh(r, me, logi)`; `/requests` says `logistics` — the
  viewer is one of them) until the first of them opens it, and each gets the
  Telegram message (`addressees`; `_tg_body` says «birinchi taqsimlagan
  oladi»). **Whoever splits it first takes it** (`assign_request`, the row is
  locked): its `logistics_key` / `logistics_name` become theirs, so from then
  on it is an ordinary request of that person everywhere — the list, the
  brigadir's card, the alerts, «Hisobot». The other one, a moment late, gets
  `taken` («Bu so'rovni boshqa logist allaqachon taqsimladi»), the dialog
  closes and the list refreshes; it is no longer on their list. A waiting
  request to everybody that is past its deadline names «Barcha logistlarga»
  in AXO's / the managers' alert (`to_text`).
- **Three fixes after a review of the app** (2026-11-17; the operator asked
  what was wrong and what to add, and answered «Yes, build those 3»):
  - **The limit carries over** (`unit_limits`). It was counted hour by hour,
    so an hour that got nothing was LOST — its need could never be sent
    again and «received» could only fall behind «needed». Now a brigadir's
    limit at hour H is everything their «Konteynerlar» figures need from the
    day's start THROUGH H, less everything split to them for hours up to H.
    The day's total is still never passed: a request for H may take only what
    leaves every hour from H on within its own cumulative need (a later
    hour's split that used the carry-over is counted against an earlier
    hour's request). The dialog words it «Qolgan limit (kun boshidan)».
  - **«Tayyor so'rovlar»** (`prepared`, `GET /requests/prepared`;
    `create_requests`, `POST /requests/bulk`, AXO's door). AXO made every
    hour's request by hand. The button on «So'rovlar» (always drawn, with its
    count) opens the day's hours still ahead with what each needs less what
    was already asked for it; she ticks the ones to send — all by default —
    picks the logistics person once and sends them in one go, all or nothing.
    The addressee gets ONE message for the lot (`notify_requests`, key
    `container_requests_new`), never one per hour. An hour whose counts need
    changing is unticked there and made with «Yangi so'rov».
  - **Alerts** (`alert_*`; one message each, the page's button). To the
    request's AXO AUTHOR (`created_key`), switch `notify_axo` — ON unless
    switched off, since they answer her own requests: logistics split fewer
    than asked (`container_short_split`, how many and why), a brigadir
    confirmed fewer than sent (`container_short_receipt`), a request still
    unsplit at its deadline (`container_request_overdue`). To EVERY
    shift-manager profile (`shift_scope`'s fan-out), switch `notify_managers`
    — shipped OFF on 16 Nov, **ON since 2026-11-17** (the operator, asked
    whether to switch it on: «Yes, switch on»;
    `startup.container_flow_managers_alerts_on`, once under a flag, so an
    admin's «off» later sticks): the same overdue request, and a brigadir
    still unconfirmed `ESCALATE_AFTER_MIN` (30) after the reminder
    (`container_unconfirmed`). Switching it on sends nothing about the past
    beyond the alert window: a request already claimed for its AXO author is
    never re-sent, and only a brigadir reminded 30–150 minutes before the
    switch can still be named. The two clock-driven
    ones run on the flow's tick, are claimed before sending
    (`container_requests.overdue_alerted_at`,
    `container_request_parts.escalated_at`) and fire only inside
    `ALERT_WINDOW_MIN` (120) of their moment.
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

### The page — the batch tabs as they were (removed 2026-11-18)

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

### A brigadir's EXTRA request — through AXO (2026-11-18)

The operator: «can we add the request page for supervisors if they need extra
containers and this request goes through AXO». A brigadir's limit
(`unit_limits`) keeps logistics from giving more than the plan's figure, so a
line that ran short had no way in but the phone — and the report looked clean
while it was wrong. Agreed with the operator the same day («Yes, build it»):
through logistics like every request; past the limit only by AXO's approval
and only by the approved amount; admin-only until he announces it.

- **Page key `container-extra`** (`permissions`) — shipped admin-only, opened
  to the brigadirs the same morning (the operator: «Open it now»;
  `startup.container_extra_brigadirs`), and **CLOSED to them again that
  afternoon** (the operator: «remove for supervisors the ask-for-more option
  for now, we will add this thing later»; `startup.container_extra_brigadirs_off`,
  once under its own flag, so a reopen on the Access tab later sticks; the
  default is back to `[]`). Nothing was taken out: brigadirs simply no longer
  see «Qo'shimcha so'rash» or their list, and get no answer in Telegram; asks
  already made stay on AXO's «So'rovlar». Reopening = ticking «supervisor»
  for «Konteyner berish — qo'shimcha so'rov» on the Access tab. It joins
  `WHO` (the page's roles) and shows «Qabul» to its holder. Table `container_extras` (`ContainerExtra`,
  from `create_all`): `asked` → `approved` (with `approved` counts and the
  `request_id` it became) / `rejected` (AXO's note) / `cancelled` (the
  brigadir withdrew it while it waited).
- **The brigadir asks** on «Qabul» (`components/containers/FlowExtras.jsx`
  `AskExtraModal`; `POST /extras`, `EXT`; `ask_extra`): counts per type, the
  hour (the one now or later — a day over cannot be asked for), a reason
  (`EXTRA_REASONS`: «Reja oshdi» · «Konteyner yaroqsiz» · «Kam keldi» ·
  «Boshqa» with words). A brigadir asks for their own unit; an admin names
  one. One waiting ask per unit and hour (`extra_dup`). The strip with the
  button sits in «Qabul»'s head card, always drawn; «Qo'shimcha so'rovlarim»
  — each ask with its stage — sits UNDER the receipts, so an ask never moves
  a card the brigadir confirms. Withdrawn with «Qaytarib olish» while waiting
  (`POST /extras/{id}/cancel`, their own only).
- **AXO decides** on «So'rovlar» (`ExtrasPanel`, below the requests table —
  an ask arriving never moves the rows above; drawn once the day has an ask;
  AXO's tab badge counts the waiting ones beside the unopened requests).
  «Tasdiqlash» (`POST /extras/{id}/approve`, `PAGE`; `approve_extra`): all or
  fewer of each type, never more (`over_ask`), to a logistics person of her
  choice (remembered like «Yangi so'rov»), the stock on her shelf beside each
  count when «AXO zaxirasi» has one, a note to the brigadir. It becomes an
  ordinary request (`create_request`) tagged «Qo'shimcha» on the list.
  «Rad etish» (`/reject`): the reason is required — the brigadir reads it.
  The managers watching see the panel without buttons.
- **The split** (`assign_request`, `GET /requests/{id}/split-hint` →
  `extra_for`): to THAT unit only (`extra_unit` otherwise) — the dialog opens
  on it with the approved counts and no «add a row» — and PAST its limit by
  exactly what AXO approved. An approved extra never uses the plan's room up
  (`unit_limits` leaves its parts out) and is not the hour's own request
  (`prepared` leaves it out). The brigadir confirms it on «Qabul» like any
  other; «AXO zaxirasi» counts it as given when it is split.
- **Stages** (`extras_of`, `_extra_stage`): asked · logistics (approved, not
  split yet) · split · received · rejected · cancelled · withdrawn (approved,
  then its request was cancelled or deleted — `request_id` goes NULL).
- **Messages**: a brigadir's ask → every AXO profile (personal grant of
  `page.view.container-flow`, `axo_people`; key `container_extra_new`) behind
  the new «Sozlamalar» switch `notify_extra` — ON unless switched off — and
  **never for an admin's own ask**, so testing it while closed tells nobody.
  AXO's answer → the brigadir (`container_extra_approved` / `_rejected`)
  behind `notify_brigadirs`, and only to a brigadir who may open
  `container-extra` (`extra_open`). The approved request reaches its
  logistics person as any new request does (`notify_later`).
- **«Tahlil»** (`ExtrasAnalytics`, `analytics()["extras"]` =
  `extras_report`): asks, approved, refused, waiting, containers asked and
  approved; the reasons as one bar; per brigadir — asks, containers, refused,
  the main reason. A brigadir who keeps asking is the sign the plan's figures
  for their lines are wrong. It sits just above «AXO zaxirasi», which stays
  last.
- Action register: `containers.extra_asked` / `extra_cancelled` /
  `extra_approved` / `extra_rejected`.

### «AXO zaxirasi» — how many containers AXO has (2026-11-17)

The operator: «we have to add for AXO how many containers they have in
analytics part in the end, and it will be very crucial information for them
too, and show this thing for them». Nothing on the platform knew AXO's stock —
the plan (§3.11) left the balance out because returns are not tracked — so
AXO STATES it, and the platform keeps it from there.

- **Where**: the LAST section of «Tahlil» (`components/containers/FlowStock.jsx`),
  its own read (`GET /stock`, the tab's period), so it stands on a period with
  no requests too. Read by everybody the page is open to (`ANY`); written by
  AXO's key and admins (`POST /stock`, `PAGE`) — a watcher sees no button and
  the door answers 403.
- **Two records** (`ContainerStockMove`, table `container_stock_moves`, from
  `create_all`; `record_stock`): **«Sanab kiritish»** (`count`) — how many of
  EVERY type AXO has now; the dialog opens on the book figure, so only what
  differs is retyped — and **«Qaytdi / qo'shildi»** (`in`) — what came back
  from washing or was bought, at least one type. Each keeps who, when and a
  note. Nothing is edited or deleted: a wrong record is put right by the next
  count. The action register: `containers.stock_recorded`.
- **What leaves is READ, never stored** (`_stock_out`): every container a
  logistics person SPLIT to a brigadir (a request, at `assigned_at`) and every
  one AXO ISSUED in a batch (`issued_at`). So a split request that is cancelled
  or deleted, and a batch Logistics sent back, give their containers back by
  themselves, and the figure cannot drift from the requests. A request asked
  but not split yet has NOT left — it is «promised» (below).
- **The figure** (`stock`): the latest count, less what left after it, plus
  what AXO added after it. Before the first count there is no figure — the
  section says so and offers the count; it never guesses from zero. It is a
  BOOK value: returns are only what AXO records, so it sinks below zero when
  they go unrecorded — the tile then reads yellow with «Qayta sanang», never a
  clamped 0.
- **The tiles** — «Jami» and one per container type (`TYPE_COLORS`), all one
  height: the number on the shelf now; **«Bugun yana ketadi»** — what the
  hours not over still take (`stock_ahead`): requests asked and not split yet,
  plus the need of the hours nobody asked for yet (`prepared`, yesterday's
  production day included for a night shift's hours past midnight); a bar of
  that share against what remains; and the verdict — «Yetadi», «N ta
  yetmaydi» (red, the tile outlined), «Talab yo'q». «Jami»'s shortage is the
  SUM of the types' shortages — types do not replace each other. If the plan
  cannot be read the need ahead is `null`: the hover says so and the verdict
  counts the promised requests alone.
- **«Zaxira harakati»** — the period day by day (calendar days, Tashkent;
  newest first, 30 a page): «Kun boshida» → «Berildi» → «Qaytdi» →
  «Tuzatish» → «Kun oxirida», for all types or one (`SegmentedToggle`).
  «Tuzatish» is a count that differed from the book that day («—» on a day
  nobody counted), so opening − given + returned + correction = closing on
  every row. Days before the first count are not listed. Its second view,
  «Yozuvlar», is the records AXO made in the period.
- Not built: the stock on «So'rovlar» / «Yangi so'rov» (a warning when a
  request asks for more than the shelf holds), a Telegram alert when a type
  will not cover the day, returns recorded by anybody but AXO.

### «Jo'natish» — containers and lids for the dispatch areas (2026-11-19)

The operator: «everything here is inside the factory; the new thing is
sending — the sending containers are not like the inside containers, but we
have to add them together». He attached the workbook «Отправка_контейнер_крышка
_соат_боича_день_ва_ночт_смена.xlsx». In it, each dispatch area (where finished
goods are packed to be sent out) needs N containers and N lids a shift, packed
in three 3-hour rounds (the «Per hour» column is the workbook's; since
2026-11-20 each round is asked for whole at its start — see «A round is
asked for at its start» below):

| Shift | Area | Per shift | Rounds | Per hour |
|---|---|---|---|---|
| night | Сдоба Слойка Мясной | 8000 | 20:00, 00:00, 03:30 | 889 |
| night | Марьям | 1500 | 20:00, 00:00, 03:30 | 167 |
| night | Пирог печенья | 1500 | 20:00, 00:00, 03:30 | 167 |
| day | Бургер | 3000 | 06:00, 09:00, 12:30 | 334 |
| day | Сдоба Фасовка | 1500 | 06:00, 09:00, 12:30 | 167 |
| day | Пирог печенья | 500 | 06:00, 09:00, 12:30 | 56 |

He settled four questions:
- **The types are new.** They are not one of the five crates. «Add this, but
  add a little icon so we know it is for sending.»
- **They go through logistics.** AXO asks, a logistics person takes the
  containers there.
- **The schedule is editable on the page.**
- **One total plus a split.** Asked and given count inside and dispatch
  together, with the split shown under the total; no destination is recorded
  and no return is tracked.

- **Two types of their own** — `send` («Jo'natish konteyneri») and `lid`
  («Jo'natish krishkasi»), `container_flow.SEND_KEYS`. They sit beside the
  crates (`KEYS`); `ALL_KEYS` is both.
  - Wherever a type is named on the page it carries a small truck
    (`flowUtil.TypeName`; the hue is `TYPE_COLORS` purple / pink).
  - In a sentence (`countsText`, Telegram) the dispatch types use the full
    name, so a bare «Konteyner» never reads as a crate.
  - A brigadir's limit, «Kerak va olingan», «Qabul» and the extras know
    nothing of them: those are the crates' business.
- **«Jo'natish jadvali»** — `ContainerSendArea` (`container_send_areas`, from
  `create_all`).
  - Each area stores a name, a shift (1 day · 2 night), a shift's `send` and
    `lid`, and its `rounds` [["20:00", "23:00"], …].
  - It sits FIRST on «Sozlamalar», which now opens to AXO too; the Telegram
    switches and the readiness check stay the admins'.
  - AXO and the admins add, change and remove areas (`/send-areas`, `PAGE`;
    read by `ANY`). Removing archives the area; its requests keep the name
    (`area_name`).
  - Seeded once from the workbook (`startup.seed_container_send_areas`, flag
    `oneshot:container_send_areas_seed_nov19`, only into an empty table).
- **An area's hours** (`area_hours`, `round_hours`) — **each round WHOLE at
  the hour it starts** (2026-11-20; see «A round is asked for at its start»
  below):
  - The shift's figure is shared over the rounds by largest remainder
    (`share_out`), so the rounds add up to the shift exactly: 8000 → 2667 ·
    2667 · 2666. Each round's share sits in the one production hour its
    start falls in; the hours after it get nothing.
  - The production day opens at 08:00 (`SEND_DAY_START_HOUR`, the page's
    `DAY_START_MIN`): a start earlier on the clock is past midnight and counts
    from 24. Night 20:00 · 00:00 · 03:30 → hours 20 · 24 · 27; day 06:00 ·
    09:00 · 12:30 → hours 30 · 9 · 12.
  - The ends of a round only document it.
- **A request FOR an area** — `container_requests.area_id` / `area_name` /
  `given` (`add_container_send_columns`); NULL on every brigadir request.
  - «Yangi so'rov» has a «Brigadirlarga · Jo'natishga» switch. «Jo'natishga»
    picks an area, and the counts fill from the schedule for that area and
    hour.
  - An area request carries only the two dispatch types (and a crate request
    only crates); an edit keeps the kind and may change the area.
  - «Tayyor so'rovlar» lists the areas' hours too (`prepared_send`, served as
    `send` beside `hours`, so an older tab keeps reading what it did): one
    item per area and hour, named by the area beside a truck. The bulk send
    takes an `area_id` per item.
  - Telegram names the area («🚚 Jo'natish: …») and asks logistics to take it
    there.
- **Delivered, not split.** Logistics presses «Yetkazish» and states what
  reached the area (`deliver_request`, `POST /requests/{id}/deliver`, `LOGI`):
  - Never more than asked; fewer needs a reason.
  - On a request «to everybody», the first person to deliver takes it.
  - Nobody confirms it (the packaging leaves with the product).
  - `split` refuses an area request (`area_split`); `deliver` refuses a crate
    request (`not_area`).
  - A short delivery tells AXO like a short split.
  - On the row: the area and what was delivered sit in the «Brigadirlar»
    column, with «Yetkazildi» or «Kam yetkazildi».
- **Added together.**
  - **Stock** (`stock`): the two types have tiles of their own, a truck on
    each, and count into «Jami». A delivery leaves the shelf at its time
    (`_stock_out` kind `send`), and its own column «Jo'natishga» sits beside
    «Brigadirlarga».
  - **Counts:** a count NAMES every crate. The dispatch types may be left
    out, and a type left out keeps its book figure, so a tab from before
    still counts.
  - **«Bugun yana ketadi»** includes the areas' hours ahead.
  - **«Hisobot» / «Tahlil»:** `asked` / `given` are both sides together, and
    `in_*` / `send_*` are the split (`requests_report`). The day table shows
    «Jami berilgan → Brigadirlarga · Jo'natishga». The «Brigadirlarga va
    jo'natishga — birga» card shows each total with its split bar.
  - **«Jo'natish» table** (`sending_report`): per area, needed by the
    schedule, asked, delivered, and %. «Needed» is the shift figure for every
    day of the period from `SEND_FROM` = 2026-11-19 up to today. Days before
    the schedule existed need nothing, so they never read as 0% delivered.
  - **Excel:** the requests sheet gains the split columns, and a «Jo'natish»
    sheet is added.
  - **The hour strip** counts the areas' need into each hour.
- Not built: a destination (shop / branch) on a delivery, and returns of
  dispatch containers — the operator: «no need».

### A round is asked for at its start (2026-11-20)

The operator sent a photo of «Yangi so'rov» for 10:00–11:00 carrying 556
dispatch containers and 556 lids, and asked why: «the dispatch containers
should show exact time when they need at sending time». The platform had
followed the workbook's «1 соатда керак» column and spread each round over the
3 hours from its start, so 10:00 was the 09:00 round's second hour. Offered
«whole round at its start», «an hour earlier» and «at its end», he picked
**the whole round at its start**.

- `round_hours` gives each round ONE hour: the hour its start falls in.
  `area_hours` puts the round's whole share there. The `SEND_ROUND_HOURS`
  constant, and the `round_hours` field of `GET /send-areas` that carried it,
  are gone (no tab read the field).
- Every place reading the schedule follows: the request form's fill
  (`/hour-need`), the strip, «Tayyor so'rovlar» (`hour_need_all`). A day now
  reads, in containers + as many lids:
  - day: 1 667 at 09:00, 1 666 at 12:00 (the 12:30 round), and 1 667 at 06:00
    of the next morning (hour 30);
  - night: 3 667 at 20:00, 3 667 at 00:00, 3 666 at 03:00 (the 03:30 round).
- **The 06:00 day round moved to the END of the production day.** It was hour
  6, before the day opens at 08:00, so its two tiles were red and overdue
  every morning before anybody could ask for them. As hour 30 it shows on the
  strip that is running at the time.
- On «Sozlamalar», «Jo'natish jadvali»'s «Soatiga» column is «Bosqichiga»
  (`cflow.sa.col.perRound`) and the form's preview line names one round.
- Requests already made keep their hour and figures; nothing was migrated.
- «Jo'natish»'s need over a period (`sending_report`) counts shifts × days
  and is unchanged.

### One request for the hour — crates and dispatch together (2026-11-19, later)

The same evening the operator changed the request side: «we have to do it all
in the same request, not different — the dispatch must be included like the
inside containers; AXO creates the request for all, for the supervisors and
dispatch». He settled four questions:
- **The dispatch part goes out as ONE amount** («one lump to dispatch»). The
  split names no area.
- **No limit and no confirmation** for it.
- **Mixing types:** «it depends — AXO should get the containers ready for those
  hours, and that's all». So the dispatch amount may take any type the request
  carries.
- **The separate area requests made earlier** are kept, and no new ones are
  made.

- **One request.** A brigadirs' request now carries every type (`ALL_KEYS`):
  the hour's crates by «Konteynerlar» AND every dispatch area's containers and
  lids of that hour by the schedule.
  - «Yangi so'rov» has no «Brigadirlarga / Jo'natishga» switch any more. The
    form fills all seven types for the hour (`hour-need`'s `hours` plus every
    area's `send`), the dispatch two under a truck line.
  - «Tayyor so'rovlar» is one item per hour (`hour_need_all` → `prepared`;
    `prepared_send` is gone, and `/requests/prepared` still answers `send: []`
    for a tab from the morning).
  - Telegram tells logistics to split the crates and give the dispatch
    containers and lids to dispatch (`hint_send`).
- **The split** (`assign_request(..., dispatch=)`, `POST …/assign` `dispatch`):
  - The brigadirs' rows are the crates, as before: their limits, their «Qabul».
  - Under them sits «Jo'natishga», ONE amount for any type of the request: no
    limit, nobody confirms it. It starts as every dispatch container and lid
    asked (`split-hint` → `dispatch`), and is stored on the request as
    `given`.
  - What is asked in all may not be exceeded; fewer needs a reason, as before.
    A split may go to dispatch alone.
  - An approved brigadir extra takes no dispatch amount.
  - The row shows it after the brigadirs' parts («🚚 Jo'natishga: …»), and the
    truck columns count it as given.
- **What it changes downstream:**
  - **Stock:** `given` of ANY split request leaves the shelf as «Jo'natishga»
    (`_stock_out` kind `send`).
  - **«Hisobot» / «Tahlil»:** `send_given` is that amount (plus an area
    request's delivery), and `in_given` is the brigadirs' parts. `in_asked` /
    `send_asked` split what was asked by TYPE (crates vs dispatch types).
  - **The «Jo'natish» table** (`sending_report`) keeps each area's NEED.
    Asked / given / % exist only in all (the table's footer, the Excel
    sheet's total row), since the split names no area.
- The area requests of the first design (`area_id`, «Yetkazish» →
  `deliver_request`) still read, deliver and count. Only the form no longer
  makes them.

### Not built (the plan's remaining parts — ask first)

- A leader's own card.
- Every other notification (leaders, a second reminder, an automatic top-up
  after a short receipt).
- The printed QR label and the scan (Logistics confirms with a tap for now).
- AXO delivery on-time % on the KPI pages. (AXO's stock is built — «AXO
  zaxirasi», above.)
- Returns from the brigadirs (containers coming back to AXO are only what AXO
  records on «AXO zaxirasi»).
