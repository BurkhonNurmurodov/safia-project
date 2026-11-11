# Notifications and Telegram

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## Coloured and disabled Telegram buttons (`app/tg_buttons.py`, 2026-10-19)

The pinned telebot (4.25) knows neither Bot API 9.4's button `style` nor 10.3's
`disabled`. `tg_buttons.Button` adds both in `to_dict()`, which every keyboard
is serialised through, so no send or edit call changed (an upgrade to telebot
4.37 was rejected: twelve releases under the whole bot for two fields, and it
still lacks `InlineKeyboardMarkup.force_reply`). Incoming updates parse as
before (telebot swallows unknown button keys).

- **Colour means a DECISION and nothing else**: `approve()` is green
  (`success`) and `reject()` red (`danger`) on the approval cards
  (`approvals._approve_reject_kb`: hr_document, edit_request, edit_batch,
  leader_late, live_document, live_batch). No other button is coloured. The
  registration card (`ap:reg`, `telegram_bot.py`) was left out of scope.
- **A disabled button is a button TYPE**: it carries no callback, url or
  web_app, so a tap reaches nobody whatever app draws it — the safety argument
  for an old app the spec says nothing about. Never coloured.
- **A decided card keeps a keyboard** (`approvals.decided_markup`, and
  `telegram_bot._appeal_decided_kb` for the late-proof / objection cards):
  one disabled button with the outcome and who decided it, surname + initial
  (`outcome_label` — «✅ Tasdiqlandi · Aripova M.»), over the card's panel or
  chat link, which stays live and opens where the pending card did
  (`_decided_link` re-derives it from the record — a notice stores only the
  text). The outcome LINE stays in the message text too, for an app that does
  not draw the disabled button. They were stripped of every button before.
- Known, unchanged: an undo that reopens a record leaves its old decided cards
  stating the old outcome (the text line did so before too).

### Buttons INSIDE a message (Bot API 10.3, Phase 2 — 2026-10-19)

Three rich DMs carry buttons in their BODY (`<tg-button>`, `<tg-button-row>`)
instead of, or beside, the keyboard under them — the day digest, the
auto-check warning and, from 2026-11-03, every appeal notice (see «The appeal
CHAT» — its «Chatni ochish» sits at the foot of the card). The operator's ruling: the late-proof / objection rulings
stay in the appeal chat (no reply prompt on those cards). A third, the call
forecast's «Tasdiqlash» / «O'zgartirish», shipped and was REMOVED the same
day (below).

- **Every such send is TWO tries** — `telegram_bot.RichTry`, a list a
  `rich_fn` may return: the body with its buttons (no keyboard, or only the
  whole-page one), then the same body without them and the ordinary keyboard;
  the photo and classic fallbacks always get the keyboard. None of it could be
  tried against Telegram from where it was written, so a refusal costs the
  in-body buttons — logged at WARNING «Rich notification … refused
  [label] … trying the next shape» — never the rich layout or the message.
  `send_tg_notification(on_sent=)` / `notify_profile(sent_fn=)` report which
  shape reached each holder and its message id. `_plain_retry` gives the photo
  and classic fallbacks `tg_buttons.send`'s rule (a refused coloured/disabled
  keyboard is resent plain).
- **The day digest** (`leader_unit_rich.body(buttons=True)`): a fourth column
  with «Ochish» on every leader row that has a report, opening that day
  report; the whole-unit button stays under the message. Its fallback
  keyboard (`fallback_markup`) is one row per leader with a report, worst
  first, at most 8, then the unit button.
- **The auto-check warning** (`leader_auto_rich.body(button=True)`): «Ochish»
  sits at the end of the first step, which names the page; the rich card then
  has no keyboard. The classic DM keeps its page button.
- **The call forecast carries NO buttons** (the operator, 2026-10-19). Its
  «Tasdiqlash» («I will call this many») and «O'zgartirish» (the brigadir's
  own number) lived in v4.305.0–4.306.x and were removed the same day: the
  answer showed only in the «Smenaga chaqirish» modal, so it asked brigadirs
  for a tap nobody would read. `services/forecast_answer.py` now only retires
  the cards sent with them: a tap (`fa:…`) records nothing, says «Bu tugma endi
  ishlatilmaydi», and takes the buttons off every copy of that card (a body
  with buttons is re-sent from `ForecastCallNotice.tg_bodies` with
  `forecast_rich.TOKEN` emptied, the figure by its file_id; other copies lose
  their keyboard); a «how many» question still open is closed. The answer
  columns (`answer`, `answer_count`, `answered_*`, `tg_messages`, `tg_bodies`,
  `startup.add_forecast_answer_columns`) STAY, unused. `TEST_SENDER` (-1)
  marks the test notices the button test sent then; `production._call_rows`
  keeps skipping them.
- **«Tugmalar sinovi»** (`services/button_test.py`, `/buttontest` in the bot,
  admins only): the two messages sent to the admin who asks, through the
  real builders and send path — the latest unit-day a digest went out for,
  rebuilt; task 9's warning with sample figures — then a summary saying, per
  message, whether Telegram took the buttons inside it or the fallback went
  out. (The forecast card was the third while it had buttons.) The first run
  showed Telegram drawing buttons inside a rich message. TEMPORARY `startup.send_button_test` (flag
  `button_test_dm_2026_10_19_v1`, both entrypoints, deferred) sent it once to
  `UNPRICED_DM_CHAT`; delete it and both calls once the flag reads «sent» —
  the module and the command stay.
- Not built: buttons on the in-message rows of any other DM; callbacks from a
  rich message are parsed by the pinned telebot like any other (it ignores the
  unknown message field) — the first real tap in production is the test.

## The notification centre (the bell, `/notifications`)

From **2026-10-01** (the operator: the old bell was «worse than bad», so people
read Telegram instead) the header bell is a notification CENTRE, not a list.
The old one kept the newest 50 rows (four to five hours of an admin's ~99 a
day), every row was a dead end, read state lived in each browser's
localStorage, and a row announcing a request said «new» forever after somebody
decided it. Two halves now, one module each:

- **`services/notif_queue.py` — «Sizdan kutilmoqda», THE queue.** What is
  waiting on THIS viewer right now, read from the LIVE records on every request
  and never from bell rows, so an item leaves the moment anybody deals with it
  (the viewer here, a colleague in the bot, an admin on /staff). Sources: draft
  HR documents (`staff._scope_documents` ∩ `_can_approve_doc`), deletion
  batches and edit requests (admin + shift-manager, as `_process_*` admit),
  shift-1 late days (admin), objections and late proofs (the unit's brigadir at
  stage 1, admins at stage 2 only — an admin CAN rule stage 1, but a row with a
  brigadir is not waiting on an admin), concerns at the viewer's own level and
  holder in «todo», tasks assigned to the viewer in «todo». Decisions rank above
  the work list, so one objection is never buried under ninety concerns. Each
  source runs in a SAVEPOINT: a broken one costs its items, never the queue.
- **The red badge counts the queue and nothing else** — the only number that
  reaches zero when the work is done. Anything new that waits on nobody is a
  quiet gold DOT, cleared by opening the bell («seen»). `GET
  /api/notifications/summary` is polled every 60 s.
- **Inline actions are DESCRIBED by the server** (method + url + `confirm` +
  `undo`) and run by the client against the very endpoint /staff or /leaders
  calls — rights stay where they are enforced, and a refusal arrives in that
  endpoint's own words, inside the row. Offered inline only where the bot
  already decides in one tap (HR documents, deletion/edit requests, late days);
  an objection, a late proof or a concern (taking it into work needs a
  deadline) is a link. **Only what nothing here can take back asks first**
  (reject; a deletion approve). Undo exists where the server can reverse:
  `documents/{id}/cancel` after an HR approve, `requests/{id}/undo` after an edit
  approve. A draft older than `staff.STALE_APPROVE_DAYS` offers no Approve at all
  — the door refuses it — and says why.
- **A decided item STAYS where it is, showing its outcome** («Tasdiqlandi ·
  hozir» + Undo), until the list is opened again: the queue is fetched on open
  and never refetched under the reader (an action taken in a list must never move
  the list).
- **`services/notification_center.py` — THE feed, categories, links, read
  state, delivery prefs.** Every notification key belongs to one of nine
  CATEGORIES (`category_of`: an exact map, then prefixes; `unmapped_keys()` lists
  strays). The feed reads whole Tashkent DAYS (never a row count, so one day's
  burst never splits across pages), widening to the next day that HAS rows, and
  FOLDS: every row of a `FOLD` key on one day is one line («Yopilgan kunlar: 15
  ta», names under it, `distinct` counts what the rows are ABOUT), every row
  about one subject is one thread line («2 ta yangilanish»). The two newest
  «kun yopildi» lines carry a LIVE «N tasi hali ochiq» for the day most of them
  were about (`open_units`; no chip when no attendance exists yet — «all
  closed» would be a claim nobody can make).
- **A row knows what it is ABOUT** — `notifications.subject_kind` +
  `subject_id`, passed as `subject=(kind, id)` to `_notify` / `notify_profile` /
  `_notify_all_parties` / `_notify_supervisor_all`. The LINK is derived at read
  time (`link_for`), never stored. Kinds: `concern`, `task`, `leader_report`
  (uid), `unit_report` (`mid:date`), `dispute`, `late_proof`, `checklist`
  (`pid:date:task`), `leaders_tab`, `hr_doc`, `edit_request`, `edit_batch`,
  `unit_day` (`mid:date`), `idle` (date), `page`, `lesson`, `exam`, `forecast`.
  Rows written before 2026-10-01 carry display text only — readable history,
  linking nowhere. **An objection's id moves when it is re-filed**, so
  `leader_appeal_chat.carry` re-points the subjects with the conversation.
- **Deep links the pages read** (`hooks/useOpenParam.js` reads on EVERY
  arrival — the routes are not keyed, so a link to the page already open must
  work too): `/concerns?open=<id>` (the detail; `GET /api/concerns/one/{id}`
  when a plant tab cut it from the list), `/tasks?open=<id>` (the task's
  thread), `/idle-cell?date=`, `/staff?tab=&unit=&date=`.
- **Read state is per PERSON on the server** — `notification_reads` (one mark
  per row) + `notification_read_marks` (`upto_id` = «Hammasini o'qildi», one row
  not thousands; `seen_upto` = the dot). The reader is the active PROFILE key, so
  a phone, a desktop and the Android app agree. Every row at or below
  `notif_read_floor_id` (written ONCE at the first boot) counts as read: the
  browsers' old marks could not be carried over, and eighty thousand «unread»
  rows on day one would teach exactly what the old badge taught.
- **Delivery prefs** — `notification_prefs` (profile × category, absent =
  Telegram ON, so nothing changed for anybody who never opened the settings).
  `telegram_muted` gates the DM in `_notify`, `notify_profile` and
  `_notify_all_parties`; the bell row is written either way. Approval CARDS
  (`approvals._broadcast`, the approve/reject buttons) are a separate mechanism
  and always arrive — the settings dialog says so.
- **The page** (`pages/Notifications.jsx`, auth-only like /profile): «Sizdan
  kutilmoqda» grouped by kind, and «Tarix» with category / unread filters,
  search, day sections and «Oldingi kunlarni yuklash». Components live in
  `components/notifications/` (`notifMeta.js` is the vocabulary; `QueueItem`,
  `FeedEntry`, `NotificationBell`, `NotifPrefsModal`).
- **Adding a notification type**: the template in `staff._NOTIF_STRINGS` (4
  languages) → its category (an `_EXACT` entry or a prefix) → `subject=` at the
  call site (+ a `link_for` branch for a new kind) → for a burst type a `FOLD`
  entry and its `FOLD_TITLES` line (4 languages). A group's headline is written
  by the SERVER (`fold`), so the bell and the phone say one thing; the client's
  `entryTitle` only prints it.
- Read and seen marks are telemetry and skipped by the action register; a
  settings save is logged (`notification.prefs_saved`). The exam sandbox has
  twins of every endpoint (fixtures, marks as sandbox rows), and exam task 49
  («mark all read») reads those marks. `GET /api/notifications` (the array) stays
  for tabs open on an older bundle.

## Phone notifications (the Android app, 1.5.0+)

From **2026-10-01** (the operator's request) the Android app shows the bell's
notifications as Android notifications — with the app closed, on the lock
screen, one tap away from the record. There is **no Firebase**: that needs a
Firebase project in the operator's Google account and a server key, so the app
ASKS instead. Delivery is therefore **within ~15 minutes, not instant** (Android
runs a periodic job no more often; Doze can stretch it while the phone sleeps).
Instant delivery is a Firebase project away — the poll stays and FCM would only
wake it.

- **`notification_center.push_entries` is THE feed for a phone** — the bell's
  own fold, cut to unread rows of the last 24 h (`PUSH_WINDOW`) in categories the
  person keeps on the phone. An entry is SHOWN when it holds a row newer than the
  phone's cursor and the bell's «seen» mark (nothing already looked at buzzes),
  and carries ALL its unread rows, so a later poll REPLACES a folded line
  («Yopilgan kunlar: 5 ta») rather than stacking a second one. `active` = every
  unread entry's key: a phone notification whose key is gone was read somewhere
  and comes down. More than 8 at once → 7 + «Yana N ta bildirishnoma».
- **`GET /api/push/poll?after=&lang=`** (`routers/push.py`) with the app's own
  session (the year-long app token — «The app stays signed in»); `after` < 0 is
  the first call, which only learns where to start (never a backlog). A read;
  nothing is stored server-side, no device table. `POST /api/push/test` writes
  one bell row (`push_test`, no DM) to the caller — the settings dialog's «Sinov
  xabari». `GET /api/notifications/summary` gained `latest`.
- **A per-category «Telefon» switch** — `notification_prefs.push` (NULL = on),
  `prefs_for(..., "push")` / `set_prefs(..., channel="push")`; `GET/PUT
  /api/notifications/prefs` carry `push` beside `prefs` (a PUT without it leaves
  it alone). The settings dialog shows a «Telefon» tab (first) beside «Telegram»
  — only inside an app that can (`pushSupported()`), with the phone's state on
  top: allowed or not («Yoqish» → Android's prompt, then its settings), the last
  check, and the test. Android channels exist per category too
  (`notif_<category>`, IMPORTANCE_HIGH), for anyone who mutes in Android itself.
- **The page's half is `utils/androidPush.js`**: `registerPush` (who is signed
  in + the token — at every boot, after every renewal and after a password
  login), `pushCursor` (the bell's summary moves the phone's cursor while the
  app is on screen, so what arrived then never buzzes later), `pushSeen` (the
  bell or /notifications opened → the phone's notifications come down),
  `clearPush` (signed out with nobody left in the wallet), `usePushStatus`. Every
  call is a no-op unless the APK's app-bridge.js says `window.__safiaApp.push`
  — older APKs and browsers see nothing. Never from the impersonation screen
  (a tab session) — native refuses it there too.
- **The app's half is `Push.java`** (+ `PushJob`, a JobScheduler job every 15
  min, persisted, network required): shows each item (tag = key, brand gold,
  status-bar icon `ic_stat_notify` = Safia's big S (1.5.3; source `android/brand/safia-s.png`, the S of the «Safia» wordmark from Safia's customer app, rendered by `render-android-icons.py`), lock screen shows only «Yangi bildirishnoma»),
  nothing while an app screen is open (the bell is right there), a tap opens the
  item's link in the app and marks its rows read (`POST
  /api/notifications/read` with the stored token). A 401 = the session ended
  elsewhere (password change, sign-out everywhere) → it stops until the next
  sign-in. Android 13+ is asked for permission ONCE, at the first sign-in after
  install; later only through «Yoqish».
- **Accept / Reject on the notification itself** (1.6.0, the operator's request
  2026-10-02). `notification_center._push_decisions` hands each push item about
  a record the viewer can still decide the queue's OWN inline actions
  (`notif_queue._hr_docs` / `_edit_requests` / `_edit_batches` — same
  endpoints, rights and confirm rules as the bell), as `actions` with the words
  in the reader's language. Those records are kept OUT of the day's fold on the
  phone (`fold(unfold=…)`; the bell still folds), because one button cannot
  stand for five documents. `PushAction.java` carries a tap to the endpoint with
  the app's session; a decision that asks first in the bell asks INSIDE the
  notification (the buttons turn into «Ha, …» / «Bekor»), then it reads
  «Yuborilmoqda…» → «✓ Tasdiqlandi» (+ «Qaytarish» where the queue has an undo)
  or «Bajarilmadi: <the server's reason>». A decided item's rows are marked
  read. Objections, late proofs, concerns and tasks need words, so they keep
  only the tap that opens them.
- A new APK is needed for this — **1.5.1**: 1.5.0 never scheduled the check (its job needs a network, and the manifest lacked `ACCESS_NETWORK_STATE`, so Android threw a SecurityException and nothing ever polled). The server and pages were fine.

## What a shift-manager is told (`shift_scope.sm_told`, 2026-11-11)

The operator (2026-11-11): shift managers were drowning in every unit's
attendance news — since «notify all of them» (2026-11-04, see
`docs/cells-and-org.md`) every people exchange, approved role change and
closed day of EVERY unit reached EVERY shift-manager as a bell row and a
Telegram DM. Umarbek Karimov named the people-exchange notices as unwanted.

- **A shift-manager is told only what waits on them**: a role change to
  decide (`live_role_change_new`, `new_role_change`), a people exchange to a
  TASK (`*_exchange_created` with `target_kind` «task»), an edit / deletion
  request (`live_delete_request`, `new_edit_request`, `new_delete_request`,
  `bulk_delete_request`) and a day left open (`live_day_still_open`).
  Personal notices (concerns, tasks, the learning centre) are untouched.
- **Not sent to them any more** (`shift_scope.SM_QUIET`): an exchange to
  another BRIGADIR (that brigadir or an admin decides it,
  `staff._native_can_approve_doc`), and the news of a decision already taken
  — exchange / role change approved or cancelled, a record deleted, a
  deletion approved / rejected, an undo, a day closed / reopened, an admin's
  edit, «approved by somebody else». Admins and the unit's brigadir still get
  every one; /staff and the bell's «Sizdan kutilmoqda» queue (read from the
  live records) are unchanged.
- **One gate, two doors**: `staff._notify_all_parties` and
  `staff_live._notify` both ask `sm_told(nkey, params)` before adding the
  shift-managers. A new unit notice reaches them by default — add its key to
  `SM_QUIET` when it is only news.
