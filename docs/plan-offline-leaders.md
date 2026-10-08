# Leaders work with no internet — the plan

**Status: PLAN (2026-10-08), nothing built.** The ask: «when there's 0 internet
connection what should be ready to use anyways for the leaders?», then «plan it,
offline marks count by device time». Five more questions were put to the
operator the same day; §0 is the record of every answer. The research behind it
covered the Android app (`android/`), the installable browser app (`src/sw.js`),
the app's boot (`AuthContext`, `App.jsx`), the leader pages and the server's
time rules (`leader_proof`, `leader_checklist`, `leader_close`, `kelish`,
`leader_auto`, `concerns`, `idle_cell`, `production`). The work in §5 is
ordered; read the whole file before building any part of it.

---

## 0. The decisions (2026-10-08, the operator's — do not relitigate)

| # | Question | Ruling |
|---|---|---|
| D1 | Which time counts for something done offline | **The DEVICE's time** — the moment the leader pressed, shot, typed or marked, not when it reached the server. |
| D2 | Where offline works | **The Android app AND the installed browser app (PWA).** Not Telegram — it cannot open a mini app without internet, and nothing on our side changes that. |
| D3 | How late an offline item may arrive and still count by its device time | **Until the end of the NEXT shift-day** — shift 1: 20:00 the next day; shift 2: 09:00 two mornings later. |
| D4 | Which way a late item may move a score | **Both ways.** A late item can give a point back AND take one away, whatever the verdict already said. |
| D5 | Production figures (#1 plan + people, #9 ФАКТ) offline | **Included.** A leader can type them offline too. |
| D6 | An offline change made before the brigadir closed the day, arriving after the close | **It counts, and the brigadir is told** that offline changes landed in their closed day. |

---

## 1. Where things stand today (2026-10-08, v4.261.1)

**With zero internet a leader can use nothing.** The app cannot be opened:

- In the Android app the page files load (they are built into the APK and
  `WebBundle` serves them without the network), and in the installed browser app
  the service worker serves the cached shell — but in both the boot asks
  `GET /api/auth/web/session`, and every failure that is not a 401/403 sets
  `status: "error"` (`AuthContext.jsx:153-160`): the «Aloqa yo'q» screen with
  only a reload button (`App.jsx:313-322`). Nothing behind it renders.
- Nothing the server said is kept on the phone: the identity payload, page
  access and capabilities live in React state only, and the react-query cache
  is memory only (`App.jsx:183`, no persister). A reload loses it all.
- Telegram needs internet to open the mini app at all.

**Two things survive a signal DROP — only if the page was already open:**

- **Camera shots** (`utils/proofQueue.js`, IndexedDB). The capture instant is the
  server clock handed over at open, advanced by `performance.now()`
  (`ProofCamera.jsx:615-621`), so the time cannot be moved by the phone's clock.
  The page cannot OPEN offline: it needs `GET /api/leader-proof/session`.
- **«Jonli» stop / start** on /idle-cell (`utils/liveOjidaniya.js`,
  localStorage). Device clock on purpose, sent later with a `client_key`. It
  needs the cell list from `GET /api/idle-cell/cells` to start.

**Three faults the research found, which offline work would make worse:**

1. **A queued camera shot the server refuses is DROPPED SILENTLY**
   (`proofQueue.js:161-165`: any 4xx, e.g. 409 `task_closed`). A shot taken at
   19:40 and sent at 20:10, after the task auto-closed, simply disappears. That
   is exactly the case offline creates, and the platform's own rule is that a
   refused upload always shows.
2. **A camera shot sent across a shift boundary lands on the WRONG day.** The
   server picks the checklist day from its own clock (`open_day(create=True)`)
   and raises the capture time to that day's floor (`leader_proof.py:369-375`),
   so the real capture time is lost.
3. **Nothing can say what a figure WAS at an hour.** `KelishMark.set_at` is
   overwritten on every change and a cleared mark deletes the row
   (`kelish.py:589-624`), so a mark that existed at 20:00 and was changed at
   20:30 reads as unfilled at 20:00 (`leader_auto.py:569-571`). The production
   pins are the same: #9's timing is rebuilt from the action register as a
   floor (`auto_check_timing`), never exactly. Offline replays arrive in bursts
   and hit this constantly.

**There is no general idempotency.** Only three tables carry a `client_key`
(camera photos, late-proof drafts, ojidaniya intervals). A checklist answer
re-sent after a dropped connection writes a second entry and re-relays its
photos (`save_answer` deletes and recreates).

---

## 2. What a leader gets

Open the Safia app — the Android app or the installed browser app — with no
signal and see their day as it stood at the last sync, with a banner
«Internet yo'q · ma'lumotlar 18:42 holatida». They can:

| Job | Offline | Counts by |
|---|---|---|
| Read the task rules («Vazifalar») and their checklist | read | — |
| Answer a checklist task (Ha / Yo'q + reason, uploaded photos) | queue | device time |
| Shoot a camera proof | queue (exists — now also from a cold start) | device time |
| Mark «Ish grafigi» (Keladi / Kelmaydi / clear) | queue | device time |
| Record a stop with «Jonli» ▶ ■ | queue (exists — now also from a cold start) | device time (already) |
| File a concern (their own, or a worker's) | queue | device time |
| Type ПЛАН / ФАКТ and «Bugungi fakt» people for their own cells | queue | device time |

Everything queued is shown, per item, until the server has it: a header chip
«Yuborilmagan: 4» opens the list, each item says waiting / sent / refused with
the server's reason. **Nothing is ever dropped silently.** When signal returns
the queue sends itself, oldest first.

Out of offline, on purpose: the bot (Telegram), objections and late proofs (a
conversation needs the other side), the day report and scores (the server
computes them), and everything a brigadir does.

---

## 3. How it works

### 3.1 Device time — read honestly

D1 says device time counts. How each door reads it:

- **Android app — the anchored clock.** The app's Java side keeps one pair: the
  server's time and Android's `SystemClock.elapsedRealtime()` at the same
  instant, saved with the phone's boot count, refreshed by every successful
  sync. Offline, `now = serverMs + (elapsedRealtime − elapsedAtSync)`. It is
  still a time measured on the device, but changing the phone's clock does not
  move it; it survives the page reloading and the app restarting and is lost
  only when the phone reboots. Nothing in the app uses `elapsedRealtime` today.
- **Browser app — the phone clock.** A browser has no clock that survives a
  page load (`performance.now()` restarts at zero), so a cold start offline can
  only read the phone's own clock. A page that was opened ONLINE keeps the
  server anchor it was handed, as the camera does today.
- **Fallback in both** — the phone clock (the «Jonli» precedent).

Every queued item carries `device_at` (ms) and `time_src` (`anchored` | `page` |
`phone`). The server stores both beside `received_at`, and every surface that
shows an offline item prints «Oflayn · 19:40 (qurilma) · yetib keldi 21:05». A
phone clock set wrong files a wrong time; the rule does not hide it, it shows it
(the «Jonli» ruling of 2026-09-07).

### 3.2 The server's rule for a device time — `services/offline_time.py` (new, THE definition)

One function every write door calls: `accept(device_at, received_at, day, …)`.

- A device time AFTER arrival is impossible — clamped to arrival (2 min skew allowed).
- **The day is the CLIENT's**: every item carries the shift-day it was made on
  (from the cached checklist / session). The server checks `device_at` lies
  inside that day's span and files it there — fault 2, fixed for online sends
  too. A device time outside that span is refused (`device_outside_day`).
- **The window (D3)**: an item counts by its device time if it arrives before
  the end of the NEXT shift-day — shift 1: 20:00 the next day; shift 2: 09:00
  two mornings later. The shift is the leader's checklist shift
  (`leader_shift`) for checklist items and the unit's for everything else.
  After the window it is stored and shown as late — an online write's rule.
- **One ordering for every value**: when an offline item and another write
  touch the same value (a mark, a pin, an answer), the later one BY TIME wins —
  device time for the offline item, server time for online writes and SAP
  uploads. The loser is kept and shown as refused, naming the newer value and
  who wrote it.
- **A closed day (D6)**: an item whose device time is before the day's close
  lands in the closed day — /production's lock, /idle-cell's lock and the
  checklist day alike — and the brigadir is told once per unit-day
  («Oflayn o'zgarishlar yopilgan kunga tushdi», with the list). An item made
  after the close is refused like an online write.

### 3.3 Opening offline — the leader pack

- **`GET /api/leader-offline/pack`** (new): everything a leader needs for the
  current shift-day AND the next one, in one answer — the identity payload, page
  access + capabilities, the checklist day(s) with task config («Vazifalar»
  texts, windows, deadlines, camera tasks and their rolls), the leader's
  /production dashboard (their cells' lines, pins, people), the «Ish grafigi»
  cells and week, the /idle-cell cells, concern categories and the workers of
  their cells, the server time. Scoped exactly like the endpoints it gathers;
  built by calling their own functions, never re-derived.
- **Refreshed** on open, on every return to the screen and every 5 min while
  online. **The Android app also fetches it in the background** from the Java
  job that already wakes every ~15 min for notifications (`PushJob`), so the
  pack is fresh at the start of a shift even if the app was not opened. **The
  browser app cannot** (no background work outside Chrome, none on an iPhone),
  so its pack is as old as its last open. Stored per profile in IndexedDB; on
  Android the newer of the page's copy and the native copy wins.
- **Offline boot**: with a saved login and a pack on the phone, a session check
  that gets no answer boots into OFFLINE mode instead of «Aloqa yo'q» — in the
  Android app, and in the browser app where the service worker controls the
  page (never in Telegram, where the service worker is never registered). Only
  the leader pages in §2 open; every other route shows «Internet kerak».
  /leaders opens on «Chek-list».
- **Pages are not rewritten for offline.** An adapter in `utils/api.js` answers
  their GET requests from the pack with the queue laid over it (a queued mark
  shows as marked, a queued ФАКТ shows typed) whenever the request fails for
  lack of network. One set of small per-endpoint answerers in `utils/offline/`.

### 3.4 The queue — one outbox

- One IndexedDB outbox (`utils/offline/outbox.js`) for every queued JSON write;
  camera blobs stay in `proofQueue` and «Jonli» stays in its store, and the
  header chip reads all three. Each item: `client_key`, kind, profile, day,
  `device_at`, `time_src`, body, state, server reason.
- It carries the PROFILE the item was made under and sends with that profile's
  own token from the wallet, so a phone holding two profiles never files one
  person's mark as the other's.
- Sent oldest first per kind; on open, on `online`, on a 20 s timer while
  anything waits. A 5xx or no answer keeps the item; a 4xx keeps it as REFUSED
  with the reason on screen and «Qayta urinish» / «O'chirish» (fault 1).
- **Android** later sends JSON items from the background too (phase 6), so an
  item reaches the server without the app being opened. **The browser app**
  sends only while it is open.
- Signing out with unsent items asks first.
- **Idempotency**: one generic table, `offline_receipts (client_key PK,
  profile_key, kind, result JSON, received_at)`. A re-sent item gets the stored
  answer back. Camera, late-proof and «Jonli» keep their own keys.

### 3.5 What each write door learns

| Door | Change |
|---|---|
| `POST /api/leader-proof/photo` | takes `day` + `device_at` + `time_src`; files on the named day; counted per §3.2 even when the platform already closed the task (§3.6) |
| `POST /api/leader-checklist/answer` | takes `client_key`, `day`, `device_at`, `time_src`; the `time_up` 409 (`leader_checklist.py:690`) compares `device_at`, not server now |
| `PUT /api/kelish/mark` | takes `client_key`, `device_at`; editable days = today/tomorrow at `device_at` |
| `POST /api/concerns`, `POST /api/cell-concerns` | take `client_key`, `device_at`; stored as `filed_at` beside `created_at` |
| /production ПЛАН/ФАКТ override and «Bugungi fakt» staffing | take `client_key`, `device_at`; the leader's group scope unchanged; the later-by-time rule decides against the brigadir's and the SAP upload's writes |
| `POST /api/idle-cell/intervals` | already device time + `client_key`; learns the closed-day rule (D6) |

All new columns are nullable; NULL = an online write, read exactly as today.

### 3.6 «As at the hour» and re-judging — `services/offline_rejudge.py` (new)

**First, a history the checks can read.** One append-only table,
`value_events` (unit, day, cell, key, field, value, `at`, source, actor), written
by EVERY write of the values the automatic checks read — «Ish grafigi» marks
(a clear included), the ПЛАН / ФАКТ overrides, the «Bugungi fakt» people pins
and the SAP upload's writes. `at` is server time for online writes and device
time for offline ones. «What did this read at 10:00» is then the last event at
or before 10:00 per key — exact, for both doors (fault 3). #1 (plan + people),
#9 (ФАКТ %) and #11 (Ish grafigi) read it when they run late or are re-run;
#8 reads `coalesce(filed_at, created_at)`. `auto_check_timing` (the objection
page's «when did the leader act») switches to it too.

**Then, re-judging.** When an item lands whose device time is at or before an
hour the platform has already judged, that task is judged again AS AT ITS HOUR:

- **An automatic check** (#1, #8, #9, #11) is run again over the history. If the
  verdict changed — **either way (D4)** — the entry and the `leader_auto_checks`
  row are rewritten (facts note «re-judged after offline data»).
- **A manual task the platform force-closed** (`autoclose_due` →
  `force_answer`, `__missed__|HH:MM`, or a short camera roll closed as is): the
  platform's entry is replaced by the leader's, its old AI review row is deleted
  (as `reopen_task` does) and the task is queued for review again.
- **A task the leader SUBMITTED** stays decided by whichever submit came first
  by time; the other is refused and shown (it takes two devices to reach this).

Then the existing correction chain does the rest, unchanged: the day re-scores,
`leader_reports.resend_if_changed` re-sends the leader's report,
`leader_unit_report.note` puts a correction in the brigadir's digest. Each
re-judge is one «Jurnal» row (`checklist.offline_rejudged`), shows on the day
report, and the leader is told when a re-judge took a point away.

---

## 4. Consequences to know

1. **A score can move up to ~1.5 days after the day, in either direction** —
   that is D3 + D4. A leader who passed #11 at 20:00 can lose it at 06:00 the
   next morning when an offline «clear» made at 19:50 arrives. The corrected
   report, the digest correction and the leader's notice say so.
2. **A closed day can still change** (D6) — its load, ojidaniya and Ish grafigi
   — until the window closes. The brigadir is told each time.
3. **A brigadir's or SAP's later write wins over an older offline one**, and
   vice versa. A leader may see their offline ФАКТ refused because the brigadir
   typed a figure after it; the refusal names that figure.
4. **A phone clock set wrong files wrong times** where there is no anchor — on
   the browser app always for a cold start, on Android only after a reboot with
   no signal. Visible on every item, not prevented.
5. **The browser app is weaker offline than the Android app**: no background
   refresh (its pack is as old as its last open), no background sending, no
   anchored clock, and an iPhone may clear a site's storage after 7 days unused.
6. **Leaders must use one of the two apps.** Telegram users get nothing from
   this. The bot's `/android` command already sends the APK.
7. **Background refresh costs data and battery** on Android: one pack request
   every ~15 min per phone, a few tens of KB.

---

## 5. The order of the work

Each step ships on its own and is useful on its own. Pages follow every deploy
by themselves; the Java pieces need a new APK.

1. **Fix what already breaks offline (pages + server, MINOR).** Refused camera
   shots kept and shown, never dropped (fault 1); camera shots carry their day
   (fault 2); `value_events` written by every write of the checked values, and
   the checks read «as at the hour» from it (fault 3). Useful today, for every
   dropped connection.
2. **APK 1.8.0 (Java).** The anchored clock (`clock` bridge message), the pack
   fetched and stored by the background job, and an offline-ready flag
   (`window.__safiaApp.offline`). Built and published from the Mac
   (`build-release.sh`, `publish-release.sh`).
3. **Open offline (pages + server, MINOR).** `/api/leader-offline/pack`, the
   offline boot in both apps, the GET adapter, the banner, the leader-pages-only
   shell. Older APKs keep «Aloqa yo'q».
4. **Queue offline (pages + server, MINOR).** The outbox and its header chip,
   `offline_receipts`, `device_at` + `offline_time.accept` on every write door
   in §3.5, the closed-day rule and the brigadir's notice, camera and «Jonli»
   opening from a cold start.
5. **Re-judge (server, MINOR).** §3.6 for force-closed tasks and checks #1, #8,
   #9, #11, both ways.
6. **APK 1.9.0 — background sending (Java).** JSON items handed to the app and
   sent by its job while the app is closed.
7. **Field test** on the operator's Galaxy A16 and an iPhone with the browser
   app installed: airplane mode for a whole shift, a reboot mid-shift, two
   profiles on one phone, a shift change while offline, a brigadir closing the
   day while the leader is offline, and an item arriving the morning after.

Every step keeps the platform's rules: one definition per rule (§3.2, §3.6),
the UI templates (`Toast`, `ConfirmDialog`, `Button`), four languages, and
additive migrations in both entrypoints.
