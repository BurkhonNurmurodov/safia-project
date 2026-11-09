# Late proofs and objections

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## Filing a proof AFTER the deadline (late proofs)

From **2026-08-30** a leader whose task deadline has gone by can still send the
proof. It earns NO point on its own; two people decide whether it earns one at
all. Before this the deadline had one shape for two very different people — the
leader who did not do the work and the leader who did it and could not file it
in time (a dead phone, a line that ran over) — and both scored 0 with nothing to
say about it.

- **Nothing about the existing close changes.** `autoclose_due` still force-closes
  the task, `leader_close.locked()` still answers what it always answered, the
  day still closes on its own schedule and the score is still stamped as it was.
  The late proof is a SEPARATE row with its own photos, which is what keeps
  every writer, reader and sweep ignorant of it.
- **`services/leader_late_proof.py` is THE definition** — `eligible`, `create`,
  `decide_supervisor`, `decide_admin`, `_grant`, `revoke`, and from 2026-10-14
  `late_until`, `window_open`, `late_open`, `finish_state`, `finish_day`,
  `file_announcement`, `release`, `sweep`. A task is late-fileable while: the
  unit closes tasks one at a time (nothing else HAS a per-task deadline to
  miss), the task's deadline has passed, **the late window is open**, the task
  was not actually done, and no late proof exists for it yet.
- **The late window (2026-10-14, the operator's rulings):** shift 1 until
  **24:00** of the checklist day, shift 2 until **12:00** the morning after its
  night (night 13 → 14 Oct: until 14 Oct 12:00) — by the shift the leader's
  CHECKLIST runs on (`leader_shift`; Jumaniyazov Sanjarbek → 24:00), strict:
  at that minute the door shuts, an unsent filing is refused and its draft
  photos go. `late_until(shift, date)` is THE cut-off and `late_until_label`
  its «24:00» / «12:00»; every door prints it (the bot's late screen, task
  screen and menu, the camera's late banner, the web tab). **A closed day no
  longer shuts the door** — until then the window was «while the day is open»,
  and a per-task day closes itself the moment its last task closes (≈20:00 /
  09:00), which left almost no time for anything missed late in the day. What
  shuts it early is the leader's own **«🏁 Kunni yopish»**
  (`LeaderTaskDay.finished_at` / `finished_by`, per checklist): offered on a
  per-task unit once the day has closed itself, while the window is open and
  something can still be filed late (`finish_state`'s `can`); a confirm, then
  the late door shuts for that checklist, its draft photos are dropped and the
  unit-day is released. `closed_at` keeps meaning «the last task closed» —
  everything downstream (register, score, digest, reports) is untouched. Bot:
  `lt:fin` → `lt:finok`; web: `POST /api/leader-checklist/finish-day`
  (`tasks_open` / `late_over` / `day_mode`), the tab's `finishDay` block.
- **The brigadir hears at the END (same day, the operator: «When everyone
  closes the day, then send»).** A filing is stored at once — the leader sees
  it («saqlandi», `held` on every payload) — but the brigadir's card and the
  chat's first notice are HELD (`leader_late_proofs.held`) until every leader
  who owed a checklist that unit-day is done: pressed «Kunni yopish», has
  nothing left to file late (day closed, every task done or already
  late-filed — a leader who worked on time owes no button press), or reached
  the cut-off; a leader with no day row at all is done at the cut-off. Then the
  unit-day's held filings go out together (`release`: claimed with `FOR UPDATE
  SKIP LOCKED` and `held` committed off BEFORE any card is sent, so two
  releasers never send one card twice; `released_at` stamps it). Release is
  tried at every filing (`file_announcement` — the filing may be the last thing
  anybody had left), at every «Kunni yopish», and by the five-minute
  `leader_close._sweep` (`sweep`), which is what makes it certain by the
  cut-off. The roster is the digest's (`_owed`: cutoffs, exclusions, owing,
  `expected_days`) plus the checklists the held filings sit on. While held a
  filing is invisible to everybody but its leader — the «Kechikkan isbotlar»
  list and the bell's queue skip it, and a chat message on it notifies nobody
  (`notify_message`). Ghost Mode holds nothing (the old suppress-now
  behaviour). Rows filed before this have `held` FALSE and are never announced
  twice. Logged as `checklist.day_finished` / `checklist.late_proofs_released`.
  Columns: `startup.add_late_window_columns` (both entrypoints, FIRST at boot,
  fatal on failure — `_ensure_columns`, the Verifix columns' lock-safe helper).
- **Consequences to know:** a shift-2 leader with NO day row can file late only
  until 12:00 (before, until the next 17:00 boundary); a brigadir gets a late
  proof at the end of the unit's day — often at the cut-off, i.e. near midnight
  for shift 1 — instead of the minute it was filed; the brigadir's day digest
  is untouched (it still goes when the last leader's TIME is up, the 15 Sep
  ruling), so a late proof can arrive after it.
- **The AI never sees one.** No `LeaderAiReview` row is written, so there is no
  queue door to close — a late proof is judged on WHY it is late, which is a
  question about a person and not about a photograph.
- **The chain is two-stage and deliberately asymmetric.** The unit's own
  brigadir may REJECT (final) or UPLIFT with a written case for it; only an
  ADMIN can approve. The person closest to the leader knows best whether the
  excuse is true and is the worst possible choice for the only person who
  decides that it counts. The keyboards and the dashboard buttons express this
  by being the only ones present, and every write re-checks it server-side.
- **Approval gives FULL weight**, through the ordinary `LeaderTaskOverride`
  overlay — the same read-time mechanism an admin's manual done/not-done ruling
  uses, so it moves the register, the leaderboard, the day report and the
  corrected report DM with no new scoring path. The lateness is not laundered:
  the row, its chip and the day report all go on saying it arrived late.
- **An ADMIN's REFUSAL requires their reason and it is told to the leader**
  (2026-09-10) — the twin of the rule in the objection chain above, for the
  same reason and in the same shape: `decide_admin` refuses an empty note on
  `rejected`, `late_proof_rejected` gained a `{note}` it never carried, the
  endpoint pre-checks with a 400, «Kechikkan isbotlar» opens the uplift's own
  form, and the Telegram card pauses on `lp:ar` for an `lp_arej` capture rather
  than ruling on the tap. Approving needs none — but it OFFERS the same box
  (`late_proof_approved` gained a `{note}` line of its own for it); the
  brigadir's stage-1 refusal still needs none (SUPERSEDED 2026-09-26: it
  needs one — «The appeal CHAT»).
- **Nothing expires it.** An undecided row waits in both queues with a badge
  until a person acts. The default is already 0 points, so a silent auto-reject
  would only take the decision away from the two people the flow exists to put
  it in front of.
- **`status` is the stage AND the outcome**, one column: `supervisor` → `admin`
  → `approved` | `rejected`. A separate stage column would be a second thing to
  keep in step, and every reader would consult both to answer one question.
- **A late proof can be SHOT IN THE APP or uploaded — both doors, side by
  side** (the operator's call, 2026-08-30). On a camera task the late screen
  carries «📷 Ilovada suratga olish» (a `web_app` to `/proof/camera?…&late=1`)
  beside «🖼 Mavjud rasmni yuborish». This does NOT weaken the camera rule that
  "a camera task has no upload path": before it, upload was the ONLY late door
  for a camera task, so adding the camera is a tightening. The rule is about the
  SCORING path — the stamp exists because the AI derives a date verdict
  arithmetically — and a late proof reaches no arithmetic at all. Provenance is
  carried and SHOWN (`source` / `stamp` / `captured_at` on each photo, a chip on
  the card), because a stamped shot and a hand-picked file that look identical
  teach reviewers that the stamp is decoration.
- **`LeaderLateProofShot` is the DRAFT ROLL** — photos taken before the reason
  is written, from either door, in one store. It is a table and not the bot's
  `LeaderTaskCapture` because that row is per ACCOUNT, is cleared by any
  `/tasks`, and expires in 30 minutes: a leader who shot three photos and took
  too long writing the reason lost all three. And it is emphatically NOT
  `leader_task_photos`: `leader_close.force_answer` turns ANY photo on that roll
  into a `done` entry via `sync_entry`, and `leader_proof.server_clocks` feeds
  it to `LeaderAiReview.clocks` — a shared key would auto-submit the task, score
  it AND send it to Gemini, breaking all three rules at once. `create()`
  CONSUMES the draft, so one place knows the draft → filing transition.
- **`POST/DELETE/GET /api/leader-proof/late-photo`** are the camera's late door.
  They reuse `_own_leader`, `_camera_cfg` (so CAMERA_IS_PILOT enrolment stays
  bound in one place), `_relay` and `leader_proof.burn` verbatim — same server
  stamp, same «no font ⇒ nothing stored» — but call `leader_late_proof.eligible`
  instead of `_task_locked` and **never** `sync_entry`. `save_photo` goes on
  refusing a locked task, untouched.
- **`?late=1` is a REQUEST; the server is the authority.** `/session` serves
  late mode only when `eligible` AND the task is genuinely LOCKED — in the
  ≤5-minute sliver between the deadline passing and `autoclose_due` firing, the
  leader can still file NORMALLY and their shots still count, so sending them
  down the late path would cost them the point for nothing. With no late mode
  the payload is byte-identical to what it has always been; that endpoint is the
  one piece of shared code the live camera pilot executes.
- **A draft never outlives its window**: `reset_task` and `reopen_task` call
  `clear_draft`; «Kunni yopish» (`finish_day`) and the five-minute `sweep` (once
  the cut-off has passed) call `drop_drafts`. The day closing does NOT drop
  them any more (2026-10-14) — the window outlives the close, so a leader
  half-way through a late filing keeps the photos they took.
- Bot: the warning screen is a SCREEN, not a line — it names the hour that
  passed, states plainly that no point comes automatically, says who will read
  the reason, and only then offers the way forward. Photos, then a mandatory
  reason, then the card goes to the brigadir with its photos attached (a
  brigadir deciding in a workshop will not open a dashboard first). Cards are
  recorded as `ApprovalNotice` rows so one decision retires every copy. The
  warning and the photo counter are ONE evolving message (`_lt_late_screen`), so
  the camera's own nudge (`refresh_late_screen`) can redraw whichever is on
  screen — deliberately not a widening of `refresh_camera_prompt`, which would
  paint the locked-task outcome screen over the late one.
- **The card states HOW LATE, because that is the only question it asks.**
  `leader_late_proof.late_minutes` is THE subtraction and `LeaderLateProof.due_at`
  is what makes it possible: the row already snapshotted `deadline` ("HH:MM"),
  which a human can read and nothing can subtract, because which DAY that hour
  falls on is the shift anchor's answer (`leader_close.due_at`, seated by
  `leader_ai.window_offset`). Snapshotted at filing time for the same reason
  `deadline` is — a window an admin edits next week must not restate how late
  somebody was last week. **NULL is a real answer and must never render as 0**:
  a row the backfill could not place has no measurable lateness, and "filed
  exactly on the hour" is a different thing to tell somebody deciding whether to
  give a point back. A NEGATIVE delta reads as NULL too — a row exists only
  because `eligible` found the deadline past, so a filing measuring as early
  means the two stamps disagree.
- **Every instant on this payload is the plant's WALL CLOCK**
  (`leader_late_proof.local`, Tashkent, converted on the way out). The card sets
  a filing time against a deadline, and the deadline is a Tashkent clock while
  the timestamp columns are `timestamptz` the driver hands back in the DB's own
  zone — UTC in production, though not on every box (a dev box on Asia/Samarkand
  makes the bug invisible locally). Serving them unconverted did not read as a
  timezone bug: it read as a leader who filed five hours EARLY on a queue whose
  entry condition is that they filed late. Reported 2026-09-04 — a proof one
  minute past 09:00 printed «04:01». Never convert in the browser: that is the
  viewer's zone, not the plant's.
- **A photo says WHEN as well as which door.** `LeaderLateProofMedia.received_at`
  is carried over from the draft roll at `create()` — the instant the SERVER got
  it, which both doors can answer, unlike `captured_at` (camera only, because a
  file the leader picked carries no moment this platform can vouch for). Without
  it an uploaded photo reached the reviewer with no hour at all. Not
  backfillable: the draft shot that knew it is deleted by `create`.
- Bot: the same two facts are on the Telegram card (`{sent}` on all eight
  `lp_card_*` templates, built once in `_lp_card`), because a brigadir deciding
  in a workshop will not open the dashboard first.
- (SUPERSEDED 2026-09-26 — cards open the appeal chat; «The appeal CHAT».)
  Dashboard: `/leaders?tab=lateproof`
  (`components/leaders/LateProofs.jsx`). Split by stage and badged exactly like
  «Norozliklar» next door — one rule, two queues; see that section. Photos are
  ON the card — unlike
  «Norozliklar» next door, where the subject is a verdict that carries its own
  prose; here the evidence IS the submission. Uplift is a FORM (the `Modal`
  template with a required field), reject and approve are plain confirms.
  Photos go through `ProofPhoto.jsx`'s `LateProofPhoto` — never a bare
  `<img src>`, which carries no JWT and can only ever render broken.
  Scoped like every read on the page, plus the LEADER, who reads their own
  filings: the flow asks them to explain themselves, so the answer has to be
  visible to them.

## The appeal CHAT — objections and late proofs (`/leaders/appeal/:kind/:id`)

From **2026-09-26** (the operator's directive, every point asked and answered)
both appeal flows — an objection to an AI rejection and a proof filed after its
deadline — are argued as a CHAT between the three people the chain is made of:
the leader, the unit's brigadir and the admins. The chain itself (leader →
brigadir → admin) did not change; WHERE and HOW each step is taken did.
`services/leader_appeal_chat.py` is THE definition of the conversation,
`routers/leader_appeals.py` its HTTP surface, `pages/LeaderAppeal.jsx` the page.
Where this section and the two below disagree, THIS section is current.

- **The page reads top to bottom in the order a ruling is MADE — read, then
  decide** (2026-09-28, the operator's «fix it» on a phone review; it opened on
  the ruling buttons until then, which had scrolled under the header before the
  photo and the discussion they depend on were read): the CASE card (leader,
  unit · day · shift, status, the task; «Kun hisobotini ochish ›» as a
  navigation row; and, for whoever may rule now, a «Qaror sizdan kutilmoqda —
  Qarorga o'tish» row that scrolls to the ruling and rings it) → the evidence
  (the proof photos and the AI's reason; a late proof has no AI verdict — the
  AI never reviews one — so its photos and deadline / filed / late-by stand
  there) → the chat → the RULING, at the end of the conversation right above
  the composer (`CommentsThread beforeComposer`): the choices of whoever may
  rule at this stage (the server's `canSupervise` / `canDecide`, never a role
  guess) as equal 44px buttons, two to a row where they fit and stacked where
  they do not («Adminlarga yuborish»), or the admin's full-width «Qarorni
  bekor qilish» once settled (`canUndo`). A LONE proof photo is drawn at the
  card's width (`contain`, up to min(62vh, 520px)), several as a grid of
  squares; each carries a labelled zoom button and a caption saying where it
  came from (camera + the server's time, or uploaded). Once the case card
  scrolls away the app header names the case — leader · №task · task · day —
  through Layout's `subtitle` (`useCompactTitle`). Auth-only and row-scoped
  like `/leaders/report/:uid` (it is where the Telegram button lands). New
  objections: `/leaders/appeal/dispute/new?uid=&task=` — the objection is
  WRITTEN as the chat's opening message (the day report's «Norozilik
  bildirish» opens it); once filed the page opens the thread.
- **Required comments**: the leader's filing (as before); the brigadir's
  REFUSAL and UPLIFT both (refusal was optional until this day — enforced in
  `decide_supervisor` of both services and at both endpoints, 400); an admin's
  refusal (as before); an admin's approval optional. Every ruling's comment is
  its entry in the chat.
- **Free chat, three parties.** The leader, the unit's brigadir and any admin
  may write while a ruling is still to be made (`_party` + `_open`); shift and
  top managers and a «see all» grant READ. Writing stops once a ruling is final
  (409) — the reason that ended it is the last word.
  **An undo REOPENS**: `leader_dispute.undo` / `leader_late_proof.undo` (new,
  `POST /leaders/late-proofs/{id}/undo`) send the row back to the stage the
  ruling was made at (`reopen_stage`) — admin ruling → admin, brigadir's refusal
  → brigadir — clear that stage's ruling columns (and the verdict / the
  override grant it wrote) and the SAME chat opens with that stage's buttons.
  The old `cancelled` end state is written only by `supersede` now; rows the
  old undo left stay as they are.
- **The thread is `leader_appeal_messages`** (`thread` "dispute"|"late" +
  `thread_id`), files in `leader_appeal_files`, per-PROFILE read marks in
  `leader_appeal_reads`. Kinds: `message` (free — the only kind its author may
  edit or delete) and the permanent step records `filed`, `sup_rejected`,
  `uplifted`, `approved`, `rejected`, `undone`. **Step records are written INSIDE
  the service cores** (`create`, `decide_supervisor`, `decide_admin`, `undo`,
  `supersede`), so every door that rules — the page, a Telegram capture still in
  flight — writes one. The ruling columns still say where an appeal stands NOW
  (every other reader keeps reading them); the rows say how it got there, which
  after a reopen is the only place that history survives. A re-filed objection
  CARRIES the earlier row's chat onto the new row (`chat.carry`).
  `startup.backfill_appeal_threads` (flag `appeal_chat_backfill_2026_09_26_v1`)
  wrote every pre-chat appeal's steps from its columns, with original times and
  authors; a pre-chat undo overwrote the ruling it took back, so it is one
  «undone» entry.
- **Files: any type, ≤20 MB each, ≤10 per message** (the operator's call — 20 MB
  is the most the bot API hands back). Relayed to the ARCHIVE CHANNEL as
  documents (`relay_file`, content-type detection off), never stored in the DB.
  `upload_guard.validate_chat_attachment` is the validator: no extension
  whitelist BY DESIGN; only a file whose leading BYTES prove JPEG/PNG/GIF/WEBP is
  typed as an image and served inline — everything else, a name that merely
  claims `.png` included, is served as an ATTACHMENT behind `nosniff`
  (`_stream_tg_file(name=, mime=, download=)`, RFC 5987 file names). Inside
  Telegram a file is DMed to the reader by the bot
  (`POST …/files/{id}/send`); a browser downloads it.
- **Everybody hears about everything** (`chat.fanout`): leader profile, brigadir
  profile and EVERY admin (the operator's ruling — all 6, every message, every
  stage), each with ONE «Chatni ochish» web_app button; the author is told
  nothing about their own words; accounts that just got a card keep the bell row
  and are spared a second DM. Keys: `leader_dispute_filed` (neutral now),
  `leader_dispute_message`, `late_proof_filed`, `late_proof_message`, the
  existing ruling keys, and `*_undone` / `*_undone_sup` (reopened).
- **An ADMIN brings people in by @mentioning them** (2026-09-30, the operator's
  rulings of 26 Sep): typing «@» in the composer opens a list of EVERY profile
  on the platform, guests included, the unit's own shift-managers first
  (`GET …/mentionable`, admins only; `chat.people`). The picks still named in
  the text ride the post as `mentions`; the server honours them from an admin
  alone (`chat.invite`), adds each new person to `leader_appeal_members` and
  writes one «invited» entry naming them (a centred line in the thread). A
  member READS and WRITES like the three parties, sees the photos of that
  appeal (the late-proof photo door; `photo_scope_ok` → the disputed task
  only), counts for ✓✓ and is told about every entry (`fanout`) — the message
  that named them arrives as `leader_dispute_invited` / `late_proof_invited`
  instead. They NEVER rule (stage rights are role + unit), there is no
  removal, the leader and the brigadir get no list, and a member who reads
  only because of the invite is offered no link to the day report
  (`invited`). A re-filed objection carries its members (`chat.carry`).
  `CommentsThread` takes it as `mentionPeople` / `mentionNames` — tasks and
  concerns pass neither and render exactly as before.
  **A mention in a message is a BADGE** (2026-11-09, the operator: «'@Name
  Surname' is confusing people»): the name without its «@», in a pill tinted
  by the person's own hue (`personInk`, the avatar's colour), transliterated
  for the reader. The composer still types «@» — a textarea cannot hold a pill.
- **Every appeal notice is ONE rich card** (2026-11-03, the operator: «restyle
  the notification, you might use rich message» — the «Norozilik rad etildi»
  DM was one pipe-separated line with the outcome in its title alone).
  `services/leader_appeal_rich.py` draws every key `fanout` and
  `notify_invited` send — the four filing kinds, the rulings at both stages,
  the undo, a chat message, an invitation, objections and late proofs alike —
  in one recipe: `<h3>` the OUTCOME with a glyph that says it without colour
  (📝 filed · 📤 passed up · ❌ refused · ✅ upheld · ↩️ undone · 💬 message ·
  👥 brought in) → one bold line saying what it MEANS (the templates' own
  consequence sentence: «Vazifa bajarilmagan bo'lib qoladi», «Endi adminlar
  qarorini kutmoqda», «Navbat: brigadir» on a filing) → a bordered facts
  table (the leader — to everybody but the leader themself, and never on a
  filing whose title names them — the day, «№7 · task», who ruled «· admin /
  brigadir» from the ruling's `stage`, a late proof's deadline) → the words
  as a `<blockquote>` with its author in `<cite>` under an `<h4>` saying
  «Sabab» for a required reason (an admin's refusal, a refused late proof)
  and «Izoh» for a comment → «💬 Chatni ochish» INSIDE the body (`<tg-button>`,
  tried first with no keyboard; the same card over the ordinary keyboard
  when Telegram refuses it — `RichTry`, the digest's rule). The title is the
  template's (`_mk_notif`), the values the bell row's (`_notif_values`), and
  `classic` is the same card as plain Telegram HTML for a client refusing
  rich (`html_fn`). The bell row keeps the template. `fanout(stage=)` names
  the ruling's stage; `_notify_account` (an admin with no profile) carries
  the card too. Never add a notice key to the chain without a `FAMILY` entry
  there — a key the module does not know keeps its plain DM.
- **Telegram carries ONLY «Open chat»** (the operator's ruling): the brigadir's
  and admins' cards (`_ad_kb`, `_lp_kb`, the approvals `leader_dispute` card via
  `_broadcast(kb_fn=)`) have no ruling buttons. A button on a card minted before
  this still works as a POINTER — `_appeal_redirect` swaps the card's keyboard
  for the chat button and says so — and never rules, because a one-tap refusal
  would break the required-comment rule. The `ad_note` / `ad_arej` / `lp_note` /
  `lp_arej` captures survive only for a capture already in flight.
- **It reads like a messenger** (the «Muhokama» design, 2026-09-26 — see the
  `CommentsThread` row in the template table). The chat card's header is
  `SectionHead size="lg"`; the page's `Card` is `overflow: clip` rather than
  hidden, so the composer's `sticky bottom-0` can reach the viewport (a hidden
  box is a scroll container of its own). Each message carries `author_key` +
  `author_photo` (`identity.photo_versions`, one query per read) so the avatar
  is the author's photo, and the reader's OWN messages carry `seen` —
  `chat.seen_upto`, the highest message any OTHER party (the leader, the unit's
  brigadir, any admin — never a manager reading along, who cannot answer) has
  opened, off the per-profile read marks. That is the whole of what ✓ / ✓✓
  says; a thread served without it (tasks, concerns, the exam sandbox) draws no
  tick at all.
- **The two queue tabs are ONE component** (`components/leaders/AppealQueue.jsx`;
  `Disputes.jsx` / `LateProofs.jsx` are thin wrappers). A card is a summary —
  whose, which task, the AI's flags or how late, its state, the newest chat
  entry, the reader's unread count and a «your turn» mark — and opens the chat.
  A LEADER sees their own appeals without the stage split (it hid their rows
  behind the tab they did not open); a brigadir lands on «Brigadirlarda».
- **An OPEN appeal is never capped out of a queue** (2026-10-21,
  `_appeal_rows` in `routers/leaders.py`, both lists). The lists used to hand
  over the newest 300 objections / 400 late proofs, whatever their state; once
  more than that were filed after the oldest one still waiting, it fell off —
  for admins only, since a brigadir's and a leader's scoped reads fit under
  the cap (an objection of 7 Oct, waiting on an admin, reached its leader and
  brigadir and no admin; the tab badge came up short by the same rows). Now
  every open row is served, plus the settled rows of the page's period
  (`?from=&to=`, which `AppealQueue` sends; ceiling `APPEAL_PERIOD_CAP`) or,
  with no period, the newest `DISPUTE_CAP` / `LATE_PROOF_CAP` settled ones.
  **And a card carries the REGISTER's names** (same day): an objection to an
  automatic check has no verdict row for `_project`, and a late proof never
  had one, so both printed the bare `Manager.name` — «Artikova Masuda» where
  the register (and so the brigadir picker) says «Артикова Масуда»; 19 of 21
  units differed, and the picker hid those cards. `_unit_labels` (the
  sheet's most frequent spelling, else Manager.name — `dashboard_rows`' rule)
  and `_leader_labels` (the profile's name) are the floor now.
- **The day report rules nothing now**: its inline refuse/uplift/approve and
  undo are gone; an objection carries «Chatni ochish» (marked when it is the
  reader's turn).
- **Exam sandbox**: every new path sits under `/api/leaders/disputes` or
  `/api/leaders/late-proofs`, which the exam rewrites; `routers/exam_sandbox.py`
  answers them over fixture items (synthesised entries, negative ids) and
  `appeal_msg` rows, text only.

## Objecting to an AI rejection (the three-stage chain)

From **2026-08-30** a task the AI refused is argued through the SAME chain as a
late proof, and for the same reason. The old flow had one stage — the unit's
BRIGADIR objected, straight to an admin — and two things were wrong with it,
both reported from the floor:

- **The person who was judged could not speak.** The leader reads the verdict on
  their own day report (the report DM goes to them by design), sees a photo they
  know is right refused for a reason they can answer, and had no control that
  did anything. Their only route was to find their brigadir and persuade them to
  type it up, so what reached the admin was a second-hand paraphrase of an
  argument nobody recorded.
- **The admin ruled with one side of it.** One note, from somebody who was not
  there, about a photograph they did not take. Whether the reason is TRUE is a
  question about the shift, and the person who can answer it is the brigadir —
  who was being asked to be the author instead of the witness.

So:

    leader     files their own account, from the day report they were sent
    supervisor the unit's brigadir REFUSES it (final) or UPLIFTS it, which
               REQUIRES their own written case — they cannot restore the weight
    admin      reads BOTH notes and decides whether it is pointed

- **`services/leader_dispute.py` is THE definition** — `entry_stage`, `create`,
  `decide_supervisor`, `decide_admin`, `undo`, `supersede`, `notify_filed`,
  `notify_decided`. `status` is the stage AND the outcome, one column:
  `supervisor` → `admin` → `approved` | `rejected`, plus `cancelled` for a
  ruling taken back. A separate stage column would be a second thing to keep in
  step, and every reader would consult both to answer one question.
- **The asymmetry is the design.** The person closest to the leader knows best
  whether the excuse is true and is the worst possible choice for the only
  person who decides that it counts. It is expressed by WHICH BUTTONS EXIST at
  each stage — on the card, on the report page and in the bot keyboard — not by
  a check that fires after somebody has already pressed something; and every
  write re-checks it anyway (`_dispute_stage_rights`, per ROW, because "you are
  a brigadir" is not "you are THIS unit's brigadir").
- **WHERE a filing enters is decided by WHO FILED IT** (`entry_stage`), and that
  one rule is what keeps the old flow's capability alive without a second code
  path: a **leader** → `supervisor`; a **supervisor** → `admin`, their own text
  recorded as the uplift note; an **admin** → filed and settled in one act, the
  same rule as opening a late day. The brigadir's door stays open because ~18%
  of leader rows never resolve to a profile
  (`leader-register-unlinked-rows`) — those leaders cannot log in as
  themselves, so making this leader-only would have closed the route back for
  exactly them. `requested_by_profile` says whose words `reason` is, and every
  card labels it accordingly rather than printing a brigadir's paraphrase as a
  leader's own account.
- **It is also how every legacy row reads correctly with nothing rewritten.**
  Rows filed under the one-stage flow were ALL filed by a brigadir and ALL
  waiting on an admin — i.e. they entered at the admin stage.
  `startup.migrate_dispute_stages` (flag `leader_dispute_stages_2026_08_30_v1`)
  does nothing more than say so: `pending` → `admin`, the text becomes the
  uplift note it always was, the brigadir who typed it is stamped as the person
  who passed it up. `reason` is left in place — it is "the text this row was
  filed with", every earlier reader knows it under that name. Changing what the
  migration does needs a NEW flag key, or the old "already ran" mark makes it a
  no-op on every box that has booted once.
- **The weight still moves in exactly ONE place** — `LeaderAiReview.resolution`,
  the field an admin's triage ruling already writes — so nothing downstream
  learns a new rule. `approved` is the only value that restores it, and
  **only the ADMIN stage writes that column at all**. A brigadir's refusal
  settles the objection ROW and touches no scoring column, exactly as
  `leader_late_proof.decide_supervisor` does. The first cut of this module
  wrote `rejected` there on a stage-1 refusal, and it broke twice over —
  `leader_ai.rejected_by_uid` matches `resolution == "rejected"` OUTSIDE
  `_auto_clause()`, so on a manual-regime day a brigadir would newly take the
  weight off; and an open objection does not remove its verdict from the triage
  queue (`resolution.is_(None)`), so an admin could rule `approved` there while
  the objection still sat at stage 1 — `supersede` retires only SETTLED rows —
  and the brigadir's still-live card would then overwrite it. `undo` carries
  the same rule in reverse: it clears the verdict only when `decided_at` says
  this objection is what wrote it, or it would blank somebody else's ruling
  under cover of reversing its own. A flag staying in the ADMIN's triage queue
  after a brigadir declined to argue for it is correct, not a leak.
- **One sentence is never printed twice as two people's notes.**
  `leader_dispute.sup_case` / `echoes_reason` is THE guard and all three
  renderers call it — the admin's Telegram card, the queue and the day report.
  A supervisor's or admin's own filing IS the uplift, and every row
  `migrate_dispute_stages` moved has `sup_note == reason` by construction, so a
  reader that showed both fields blindly attributed the same words to the leader
  and to the brigadir on the very card somebody weighs two accounts from.
- **Stage-1 authority is answered against the OBJECTION's stamped unit, never
  the report's.** They agree at filing time, but a SHEET report re-resolves its
  `managerId` on every read (`_relabel` + `supervisor_match`) over a table the
  leaders Refresh rewrites wholesale — so the two drift, and a `canAct` derived
  from the report's would draw a button `_dispute_stage_rights` then refuses.
  `_dispute_out` ships `managerId` for exactly this.
- **Everybody is told at every stage that takes the decision out of their
  hands** — `leader_dispute_filed` (to the brigadir), `leader_dispute_uplifted`,
  `leader_dispute_sup_rejected`, `leader_dispute_approved`,
  `leader_dispute_rejected`, `leader_dispute_undone`. A leader who explained
  themselves and heard nothing back learns that explaining is pointless, which
  is the one outcome that makes the whole chain worthless. The brigadir hears
  about the two rulings they did not make, never their own.
- (SUPERSEDED 2026-09-26: both cards carry only «Open chat»; old buttons point
  into the chat — «The appeal CHAT».)
  **Two Telegram cards, one per stage.** Stage 1 is `_ad_*` in
  `telegram_bot.py` (`ad:sr` refuse / `ad:su` uplift, which opens an `ad_note`
  text capture — the uplift is not made until the case arrives); stage 2 is the
  `leader_dispute` card `approvals.py` has served since before this chain
  existed, so a card already sitting in an admin's chat goes on working. Both
  are `ApprovalNotice` rows, so one decision retires every copy, and both take
  a message KEY rather than a rendered string — the card sits in several chats
  and each reader has their own language.
- **Both open stages are OPEN, everywhere.** `leader_dispute.OPEN_STATES` and
  the frontend's `verifyState.disputeOpen` are the two spellings and they must
  stay two spellings of one rule: the register's `ai.disputed` counter, the
  day-report task state, the "already objected" guard and the queue's segments
  all read it. Counting only one stage tells a reader a rejection is settled
  while somebody is still arguing it.
- **`decide` takes `action` + `note`, one endpoint for both stages** — which
  ruling it applies is a property of the ROW, so a caller naming the stage
  could name the wrong one. `status` is still accepted as an alias for
  `action`, which is the only thing a tab still open on the one-stage bundle
  could ever have sent.
- Read surfaces: `/leaders?tab=disputes` (admin · brigadir · **leader**, their
  own filings) and `/leaders/report/:uid`, where the objection is filed and
  where both stage rulings can also be made inline.

## Every rejected task can be objected to — four judges (`rejected_by`, 2026-10-14)

The operator (2026-10-14): «To every single one of the 13 tasks of the leaders,
it should be possible to send an objection if it's rejected.» Until then two
kinds of rejection could be argued, an AI-refused proof and a failed automatic
check, and the day report filed the second under «Tekshirilmagan» with its
button folded away. A third could not be argued at all: an admin ruling a task
«not done» by hand from the register (`LeaderTaskOverride`), which the report
even drew as a green «Tasdiqlandi».

- **`leader_reports.rejected_by(task, is_auto)` is THE rule**, read off a
  register task with the overlays applied:
  - `"admin"`: an override `done=false` over an answer that said done, or over
    an automatic check either way. It comes first because that ruling outranks
    every verdict in the score.
  - `"ai"`: `ai_rejected`, which the overlay sets only where no override exists.
  - `"auto"`: a failed check nobody has ruled on.
  - None: anything else.
  `day_report` ships it on every task, with `objectable = rejected_by is not
  None`. **Not rejections, so not objectable**: the leader's own «Yo'q» (an
  admin's «not done» confirming it included), a question never asked, and
  anything that counts as done. (A task whose time ran out was on this list
  until 2026-10-30 — see «…and a task the deadline closed» below.)
- **One field, every surface.**
  - `_tally` counts `rejected` from it, and an admin-ruled task counts as
    checked.
  - The leader's day DM lists those task numbers.
  - The brigadir's digest names them (`rejectedTasks`). A failed automatic
    check stays in its own block with what it read. A day carrying an admin's
    «not done» now reads «rejected» there.
  - On the day report `verifyState.taskState` reads it first, so a failed
    check and an admin ruling sit under «Qabul qilinmagan», each with its
    «Norozilik bildirish». The header's «N ta o'tmadi» counts exactly the tasks
    listed under it.
  - On the «Chek-list» tab `groupOfTask` puts a task with `rejectedBy` in «Rad
    etildi». An admin's triage «rejected» on a clean AI verdict reads rejected
    there, not passed (`_ruled_state`).
- **An objection to an admin's ruling uses the same row, chain and chat.** It
  is marked by `leader_ai_disputes.admin_ruling`: JSONB `{by, at}`, the ruling
  it argues with, written when `file_dispute` finds `rejected_by == "admin"`
  and fixed at filing, because the override can change afterwards. The column
  comes from `startup.add_dispute_ruling_column`, in both entrypoints.
  `leader_dispute.kind_of` answers `KIND_AI` · `KIND_AUTO` · `KIND_ADMIN` for
  the notices and the cards, and the item payload carries `kind` + `ruling`.
- **Approval flips the ruling; undo puts it back** (`_write_ruling`).
  - An admin's approval sets the override done. It keeps what the override
    said just before (`before`) and the instant it wrote (`after`).
  - A refusal writes nothing: the ruling stands.
  - An undo restores `before` exactly, deleting the override if there was none
    before. It does this only while the override is still the one the approval
    wrote. If an admin has ruled the task again since, or lifted the ruling,
    their decision stands and the row only reopens.
  - `supersede` never retires an admin-ruling objection: a later ruling on the
    AI verdict contradicts nothing it decided.
  - An admin's triage «rejected» on an AI verdict stays an AI-kind objection.
    Its weight still moves through `LeaderAiReview.resolution`, but the screens
    name it as a person's ruling (`resolvedBy`).
- **Words**:
  - New notices `leader_dispute_filed_admin` and
    `leader_dispute_sup_rejected_admin`.
  - The brigadir's card `ad_card_sup_admin` and the admins'
    `hdr_dispute_admin` open with «Admin qarori: bajarilmagan — who, when»,
    with the AI's or the check's verdict under it.
  - `VerdictBlock` (`ruling`) draws the same box first on the tab, the chat
    and the new-objection page.
  - The queue wears a red «Admin qarori» chip, and the chat's title is a
    neutral «Norozilik».
  - The leader's `leader_day_flagged` DM now says «N ta vazifangiz qabul
    qilinmadi» and points to «Norozilik bildirish» under the task, not «talk
    to your brigadir».
- **Unchanged**: `APPEALS_FROM`, who may file (`canDispute`), the stages, the
  required comments, and the bot. Its task screens still carry no objection
  door; the DM's button and the «Chek-list» tab are the ways in.

### …and a task the deadline closed («Muddat o'tib ketdi», 2026-10-30)

The operator: «anytime the leader must be able to write an objection for
rejected tasks — whether it's rejected by AI or by system, anytime». A task the
PLATFORM closed unsubmitted when its hour ran out (`__missed__|HH:MM`, state
`expired`) is now arguable at any time — long after its late door (24:00 /
12:00) has shut — by the same chain, chat and rulings.

- **`leader_reports.objection_kind` is THE «may it be argued» rule** — every
  `rejected_by` judge, plus `"deadline"` (a missed task nobody ruled on) and
  `"admin"` (an admin who confirmed that closing as «not done»). Served on
  every report task as `objection_kind`, and `objectable` is now
  `objection_kind is not None`. **`rejected_by` is UNCHANGED**: an expired task
  is still grouped, counted and messaged as «not done» (the day DM, the digest,
  the «Rad etildi» group and `_tally` do not move) — only the door is new.
- **`leader_dispute.KIND_DEADLINE`**, read off the row by `kind_of` through
  `missed_entry` (the entry's own sentinel — the twin of `auto_entry`). An
  admin's approval grants the weight through `LeaderTaskOverride`
  (`_write_auto`, as for an automatic check); the undo takes it back.
- **An objection and a late proof may run SIDE BY SIDE** (the operator, the
  same day: «allow both» — it shipped as «one at a time» and blocked 261 tasks
  whose late proof waited). `file_dispute` no longer looks at late proofs;
  `leader_late_proof.eligible` refuses only once an APPROVED objection already
  gave the weight back. Both grant through the same `LeaderTaskOverride`, so
  an undo of one never takes the other's grant: `_write_auto` keeps the
  override while an approved late proof stands (`late_proof.late_granted`),
  and `leader_late_proof.revoke` keeps it while an approved objection stands
  (`objection_granted`). Approving one does not settle the other — an admin
  rules on each.
- Words: notices `leader_dispute_filed_deadline` /
  `leader_dispute_sup_rejected_deadline`; the brigadir's card
  `ad_card_sup_deadline`; the admins' `hdr_dispute_deadline` + «Muddat o'tib
  ketdi: soat HH:MM gacha topshirilmadi — tizim yopdi»; the queue's «Muddat
  o'tdi · HH:MM» chip (`missed` on the item); `VerdictBlock missedReason`; the
  task sheet's `objIntroDeadline` and the expired banner's «quyida norozilik
  yozishingiz mumkin».
- Still out: the leader's own «Yo'q» (not a rejection). `APPEALS_FROM` stands.

### …and a day the leader never filed (2026-11-02)

The operator, shown a past day on the «Chek-list» tab with «Bu kun chek-list
topshirilmagan» and no objection button anywhere, and asked «per task or one
for the whole day»: «Per task». Each task of a never-filed day may be objected
to, exactly like a deadline task.

- **Why it had no door**: a bot checklist day is created only by the leader's
  FIRST answer, so a day never opened has nothing stored — no day, no entry,
  no report — and an objection hangs off one stored entry (`ref` =
  `bot:<entry id>`), whose approval writes its grant beside it.
- **So the FIRST objection creates the day** —
  `services/leader_checklist.materialize_unfiled_day`, called from
  `routers/leaders.file_dispute` inside the filing's own transaction (a refusal
  further down rolls it back with the objection): closed, every enabled task
  of that day's checklist not-done with `__missed__|HH:MM` (the task's own
  closing hour on a per-task unit, the day's deadline otherwise), an automatic
  task `__auto__|HH:MM|<code>` — its at-hour failure code when it failed, else
  `not_checked`, never a pass — completion 0, the score the register already
  gave the missing day. From then on it is an ordinary «Muddat o'tib ketdi»
  day: `KIND_DEADLINE` / `KIND_AUTO`, the same chain, chat, rulings and
  override grant. Nothing is created unless an objection is filed.
- **`closed_at` is the moment the leader's time ran out that day**
  (`leader_unit_report._time_up_at`), never now — a close stamped after the
  brigadir's digest would read as a late filing and send an update DM.
- **The tab names the day by a stand-in uid** — `unfiled_uid` →
  `unfiled-<profile>-<date>[-<cell>]`, served as `objectUid` on the checklist
  view (`uid` stays null); the sheet posts the objection to
  `/api/leaders/report/<objectUid>/dispute`, and `file_dispute` turns it into
  the real day (`parse_unfiled_uid`). A day that exists by then (another
  objection, a stale tab) is used as it is.
- **`unfiled_objectable` is THE rule** for offering it: on or after
  `APPEALS_FROM` with its filing window shut; owed (not `leader_load`-exempt,
  `leader_owes`, the cell in `expected_days`); nothing stored (no bot day, no
  Form row); a bot day for it would be the RECORD (`leader_bot.merges`, not a
  rehearsal day) — created where it does not count, an approval would give
  back a weight nobody reads; and not already out of the results
  (`leader_exclusions.excluded`, cutoffs included). Who may file is
  `_may_dispute_for`, as for every objection.
- **The brigadir's digest still reads such a day «not filed»** —
  `leader_unit_report._nobody_filed`: a closed day where no person answered a
  task (every task not done, no admin «done», no photo, a platform sentinel
  for a reason) is the missing row it was, same 0 in the unit's result. An
  approved objection makes it a real row with its score.
- No day report DM is sent for it (it has no AI verdicts, so the report sweep
  never reaches it, and a correction needs a first report); the objection's own
  notices carry the news.
- Words: `nothingObj` under the «nothing filed» card, `bExpiredObj` on the
  «Bu vazifa topshirilmagan» banner; the objection reads as a deadline one
  (`objIntroDeadline`), an automatic task's as `objIntroAuto`.

## Nothing before 1 September 2026 can be argued (`APPEALS_FROM`)

From **2026-09-21** (the operator: «anything before September doesn't count»)
no ruling may be asked for about a checklist day before **2026-09-01** — neither
an objection to an AI rejection nor a late proof.

- **`leader_dispute.APPEALS_FROM` + `appealable(day)` are THE floor** for BOTH
  appeal flows: `file_dispute` answers 409 below it, `_stamp_report_rights`
  serves `canDispute` false so the day report draws no button, and
  `leader_late_proof.eligible` refuses such a day. Compared against the
  CHECKLIST day, never the filing day — a night of 31 August objected to on the
  1st is an August night.
- **Everything below it was DELETED once** —
  `startup.purge_pre_september_appeals` (flag
  `pre_sep_appeals_purge_2026_09_21_v1`; changing what it deletes needs a NEW
  key): every `leader_ai_disputes` row in any state, every `leader_late_proofs`
  row with its photos, any draft roll on those days, and the `approval_notices`
  rows tracking their Telegram cards (forgotten, not edited: an old card's tap
  finds no row and answers «already handled»). One transaction with the flag
  inside it, one «Jurnal» row (`checklist.appeals_purged`) with the counts.
- **No score moved, deliberately.** An approved objection's
  `LeaderAiReview.resolution` and an approved late proof's `LeaderTaskOverride`
  are rows of their own and were left in place — a point already given back
  stays given; only the paper trail and the queue went. Taking those points
  back as well is a separate decision.
- Deliberately NOT touched: `leader_late_requests` (the shift-1 late-DAY
  requests), whose approval IS the score, and the bell notifications already
  sent about the deleted rows.
