# AI proof review and the checklist rule passes

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## Automatic proof verification (BOTH shifts, from 13 Aug 2026)

Leader-checklist proof photos are reviewed by Gemini. Since **2026-08-13** that
review is **automatic and consequential**: nobody presses anything, and a
flagged proof costs its task immediately. Everything before that date keeps the
original regime, where a flag is a note and only a human `rejected` moves a
number.

- **Shift 2 joined on 2026-08-22 (user), at full parity.** Two switches moved
  together and they answer different questions, which is the whole reason they
  have separate names:
  `leader_ai.REVIEW_PAUSED_SHIFTS = ()` — whose photos are LOOKED AT — and
  `AUTO_SHIFTS = (1, 2)` — whose flags COST points. Shift 2 had been paused
  since 2026-08-14 and outside the automatic regime before that, so it was the
  one shift running on neither. **Consequences to know:** closing a shift-2 bot
  day now sends it straight to the AI (that close is the whole of shift 2's
  review — it files ONLY in the bot, so there is no sheet Refresh behind its
  proofs); flags deduct; the day report DMs the leader and the brigadir; and
  because `AUTO_FROM` is the ONE floor and shift 2 was deliberately given no
  floor of its own, **every shift-2 day filed since 13 Aug is in the regime and
  re-scores to its verified number**. `startup.queue_shift2_backlog` (flag
  `leader_ai_shift2_backlog_2026_08_22_v1`) is the one-shot that queues those
  already-closed nights — nothing periodic would have found them, because the
  recurring discovery pass is the SHEET layer. It is insert-only and rides every
  bound a live close rides (review floor, rehearsal window, ref dedupe, done +
  media only), so re-running it under a new key adds exactly the rows the first
  pass could not. Reports go out newest-first, so today's is never stuck behind
  a fortnight-old one.
- **The pause machinery stays live and is the resting state, not dead code.**
  `review_paused(shift)` and `paused_clause()` (its SQL twin) answer for an
  empty tuple — `false()` and False — so with nothing paused every door is open.
  To pause a shift again: put it back in the tuple AND give
  `startup.drop_paused_shift_reviews` a **NEW flag key**, or the old "already
  ran" mark makes the new pause a no-op on every box that has booted once (same
  lesson as the review floor). While a pause holds, nothing queues that shift
  (`discover`, `queue_report`, both bot day-close doors), the drain refuses it,
  and every «queued» figure must exclude it — `_start_run`'s total, `/progress`,
  `/recheck`, `/retry` — because a queue number nothing works through parks the
  strip at «40 queued» forever. `should_chain` MUST exclude it too, or a pass
  with unreachable "work left" chains a new drain every 5 seconds around the
  clock. One human door stays open even then: the admin's per-task «check now»
  (`review_now` → `queue_report(force=True)`), which reviews the row directly
  and never touches the queue. The `AiRecheck` «paused» toast names no shift
  NUMBER, for the same reason — the tuple is the truth, the copy must not
  contradict it.
- **ONE predicate owns the boundary**: `leader_ai.in_auto_regime(date, shift)`
  (`AUTO_FROM = "2026-08-13"`, `AUTO_SHIFTS = (1, 2)`), with `_auto_clause()` as
  its SQL twin. Five surfaces read it — the score overlay, discovery, the
  drain's ordering, the report DM and the day-report page. A second spelling of
  "is this automatic" would show a leader a red badge on a day whose score never
  moved. An unmatched unit carries a null shift and is deliberately OUT.
- **Every flag rejects** — `not_proven`, `off_topic`, `no_date`, `date_mismatch`
  **and `unreadable`** (the user's ruling). A technical `error` row is NOT a
  flag and never deducts: a dead Drive permission must not mass-fail a shift.
  Only a human `approved` lifts an automatic rejection; `requeried` does not.
- **Every image reaches the model behind its OWN LABEL** (2026-10-19) —
  «NAMUNA i/k — baholanmaydi» for an example, «TEKSHIRILADIGAN RASM i/n» for a
  proof (`leader_ai.image_labels`), a text block right before the image on both
  providers (`gemini.labelled`, read by `gemini` and `claude_ai`). Up to three
  examples ride in front of the proofs, and the prompt used to name only their
  ORDER: on its first day Claude Sonnet 5.5 counted the examples as proofs — it
  transcribed an example's clock (a `date_mismatch` on an honest SAP
  screenshot), named a «third photo» on a two-photo report, and failed a camera
  proof «taken on another day» whose stamps all read 19.10. Never send review
  images unlabelled. The same day the prompt gained three judging rules for
  question 3 (`judge_rules` in `_prompt`, both providers): a date never decides
  `proves_done`; a fault fails a photo only when it is actually SEEN (a uniform
  «not clearly visible» is not a missing uniform); and with written criteria the
  example is one illustration, never the rule. A reason names a photo by its
  proof number («2-rasm»). Verdicts already written are not re-judged —
  «Qayta tekshirish» re-reads them.
- **A photo window's hours are anchored to the SHIFT, not to the calendar
  date** (user, 2026-08-22). `leader_ai.window_offset(shift, win)` is THE
  anchor and `date_window`, `date_days` and `clock_in_window` all read it, so
  what the card prints and what the flag judges cannot drift. Shift 2's «13.08»
  runs 13.08 17:00 → 14.08 09:00, so an hour inside that night sits on the 13th
  or the 14th depending on nothing but which side of the shift's own opening it
  falls on — a window written «00:00 — 02:00» can only mean the small hours of
  the **14th**. Pinning it to the report date instead is a window no honest
  photo can ever satisfy, and a proof stamped 14.08 01:41 was flagged
  `date_mismatch` against «13.08 00:00 — 13.08 02:00». The rule is one sentence:
  **the window opens at the first `lo` of the shift and closes at the next `hi`
  at or after that opening** — so only an OVERNIGHT shift can push the opening a
  day on, and only for a window that opens before the shift does. Shift 1's day
  IS the calendar day and always answers 0, including for a window somebody
  wrote to cross midnight (whose closing side `overnight()` still moves, exactly
  as before). Strict mode MOVES the accepted day; **date-only mode only ever
  WIDENS** — the day comes off the screen there, a shift-2 screen most often
  shows the report day, and shifting it would newly reject the honest filings
  that mode exists to accept. **Consequence to know: shift-2 verdicts re-score.**
  Nothing is stored, so the boot `sync_date_flags` re-derives every affected row
  for free — a morning-hours window on a night task stops flagging correct
  photos, and those tasks get their weight back with no Gemini call. No
  corrected report is re-DMed, same as a window edit.
- **The date question has FOUR modes** (three from 2026-08-17, the fourth from
  2026-09-07) — three nullable booleans on the same global → supervisor →
  leader chain as the photo window, resolved by `leader_ai.resolve_date_check`
  + `resolve_day_check` + `resolve_time_check`
  (NULL = inherit, NULL everywhere = the strict answer, so nothing changes until
  an admin picks something). Read them as ONE rule, always via
  `date_rule_for` → `DateRule(win, checked, dayed, timed, plus)` — a NamedTuple
  since `day_check` landed, and FOUR values before that when the `date_plus`
  tolerance did (`resolve_date_plus`, the count of days AFTER the
  report's that a proof may be dated; 0 everywhere until a writer exists, and
  there is no admin control for it yet). **Read its fields by NAME**: while it was a bare
  tuple two call sites took three of its four values and every drain pass died
  on the first row with «too many values to unpack (expected 3)» — no verdict,
  no retry burned, just a strip reading «0 of 375 checked · AI error». That is
  why it is a NamedTuple now, and why `day_check` could join it without
  disturbing a caller that did not want it. They travel together through
  `date_flags`,
  `date_prose`, `sync_date_flags` and both verdict payloads, or the sentence on
  a card names a day the flag beside it did not judge:
  - `date_check T` + `time_check T` — **strict**: a SYSTEM clock (OS bar, phone
    status bar, camera stamp) must be readable and inside the window. **The
    entries carrying a DAY are the ones judged** (`leader_ai._dated`, read by
    both `clock_in_window` and `date_prose`): one photo commonly shows two
    clocks — the status bar, an hour that by construction never carries a date,
    beside the camera stamp that carries both — and failing the report on the
    undated one rejected proofs the stamp had already proven, while an image
    with NO clock stayed silent because the prompt tells the model to add no
    entry for it (user, 2026-08-25). Every dated entry must still be inside the
    window, and a report where NOTHING carries a day still fails, which is where
    the 2026-08-14 "an unprovable day is flagged" ruling actually applies.
  - `date_check T` + `time_check F` — **date only**: the DAY must be the
    report's day, the hour is never compared and the window is not a rule. Here
    and ONLY here the model may read a date printed INSIDE the app or document
    (a date filter, a dated register row) — `_prompt(screen_dates=True)`, which
    strict mode explicitly forbids — and it lists every date it sees, because
    `clock_in_window(times=False)` passes on ANY matching day: one screen
    legitimately shows several. **No visible date at all is NOT flagged**
    (`date_flags` drops `no_date` in this mode); a WRONG day still is. This mode
    exists because most proofs here are screenshots of THIS dashboard, whose day
    is on screen while no OS clock is — strict mode answered `no_date`, i.e.
    rejected, on honest filings, and exempting the day threw away the one fact
    the screen does prove.
  - `date_check T` + `day_check F` + `time_check T` — **TIME ONLY**: the HOUR
    must be inside the window and the DAY is never compared. Both failures are
    flags — an hour outside the window is `date_mismatch`, no readable hour at
    all is `no_date` — so this is the strict rule with its unanswerable half
    dropped, never a relaxation of what remains. It exists for the proof whose
    only clock is a phone **status bar**, which by construction carries no date:
    strict mode answered `date_mismatch`/`no_date` (a rejection) on a proof
    whose one legible fact was exactly what the window asks about, and neither
    escape worked — date-only throws the hour away and then demands the very
    date the status bar cannot show, and exempting the task answers nothing.
    The model is asked the STRICT question (`screen_dates=False`): an in-app
    date says nothing about an hour. `plus` and `shift` say nothing here either
    (both only move WHICH day counts), so `clock_in_window` answers this branch
    BEFORE it parses the report day.
  - `date_check F` — **not asked at all**.
  **`day_check` is a THIRD column and NOT the free (date_check F, time_check T)
  corner of the old pair, and that is load-bearing**: the flags resolve down the
  chain INDEPENDENTLY, so a unit that exempts the date while inheriting
  `time_check` True from the global floor already sits in that corner and reads
  as exempt — twelve supervisor rows did on the day this shipped. Giving the
  corner a meaning would have re-armed the date question on every one of them at
  once, silently, as a deduction. `day_check F` + `time_check F` judges nothing,
  i.e. the exemption spelled with two extra columns; the admin never offers it
  and `date_flags` reads it as the exemption it is.
  Some proofs are screens that carry no clock — an in-app checklist,
  a printed system report — and there the date question had only two outcomes,
  both wrong: reject every honest filing, or leave a flag nobody may act on.
  `date_flags(..., check=False)` returns **nothing**, and since it owns both
  `no_date` and `date_mismatch` (`_OWNED_FLAGS`) that empty answer is what
  CLEARS those flags off verdicts already written — via the same free
  `sync_date_flags` re-derive a window edit uses, so unticking a task drops its
  date deductions and ticking it back on restores them, with no Gemini call
  either way. The model still transcribes the clock (that is what makes the flip
  reversible), and it is still shown; only the judgement is withheld. **The
  window and this answer must travel TOGETHER** — `date_rule_for` per row,
  `resolve_window` + `resolve_date_check` for bulk readers — because a window
  displayed without it is a rule the reader cannot tell is enforced: with the
  check off the `expected` payload is null, the triage card's two date rows
  collapse into ONE neutral «not asked» row, the «Vazifalar» tab prints «sana
  tekshirilmaydi» instead of hours, and the bot stops printing the window on the
  photo prompt. **Date-only mode restates all four rather than blanking them**:
  `expected` carries the DAY (labelled «Kerakli sana», never «oyna»), the triage
  card keeps two rows with the second asking about the day, the tab prints «sana
  kerak, vaqt shart emas», and the bot asks for a visible date instead of hours
  (`photo_date_only`) — silence there would read as "nothing about when is
  asked", which is the third mode, not this one. Admin: ONE four-option date-rule
  `SegmentedToggle` in the ltasks modal → `PUT /admin/leader-tasks/date-check`
  + `/time-check` + `/day-check`, all tri-state, four-way addressed like
  `WindowIn` and sharing `_write_date_rule`, written one AFTER the other (they
  materialise the same override row, and parallel inserts race its unique key).
  What a verdict was MEASURED AGAINST is `leader_ai.expected_text` — ONE
  definition with four shapes (dated window / accepted days / bare clocks /
  nothing), because three surfaces print it; `verifyState.expectedLabel` is its
  client twin for the label beside it. Three traps:
  `resolve_date_check`/`resolve_time_check` cannot use `resolve_deadline`'s
  "first non-blank" test (the meaningful value is FALSE); `_leader_row_extras`
  must count BOTH or a cell write deletes a leader row whose only override was
  the exemption; and a task switched INTO date-only re-derives its old verdicts
  free but cannot gain a date nobody was asked to transcribe — those rows only
  lose flags, and «Qayta tekshirish» is what re-reads their photos. Scores
  correct themselves everywhere at once, but no corrected report is re-DMed —
  same as a window edit.
- **`auto_discover()` is the second door into discovery's territory**, and it is
  bounded so it cannot become the bulk auto-trigger the user banned three times:
  shift 1, from one fixed date, sheet layer only. It runs on the leaders-sheet
  **Refresh** and returns `ai_queued` so the press states what it produced.
  (From 2026-10-15 nothing in the UI presses it: the Monitoring page's
  «Oxirgi yangilanish» pill and «Yangilash» button and the admin
  «Ma'lumotlar» tab's «Liderlar jadvali» row were removed — the Google sheet
  no longer receives filings. `POST /admin/refresh-sheet/leaders` still
  answers; nothing calls it, and the rows already stored stay the history.)
  `discover()` — the walk of everything ever filed — is still reachable only
  from «Tekshirish», which counts first and asks.
- **The drain walks the automatic regime FIRST and in order**: oldest day →
  leader by leader → task 1..N. Not cosmetic: a day's report DM fires when its
  last task lands, so interleaving leaders would leave every day half-checked
  until the end of the batch.
- **Reports are DMed per finished leader-day** (`services/leader_reports.py`) to
  the unit's brigadir **and** the leader — the leader always, clean days
  included, because points now come off automatically and a deduction somebody
  discovers at the end of the month is how trust in the system dies. Both carry
  a `web_app` button onto `/leaders/report/<uid>`. A day the filing-window rule
  already voided is NOT reported: it scores 0 for a reason that outranks the
  photos, and a "verified 62%" would contradict the register. **From
  2026-09-15 the BRIGADIR's copy of a bot day is not a message of its own** —
  it is one row of the unit's day digest; see «The brigadir's day digest»
  below. The leader's own DM is unchanged.
- **`leader_day_reports` is the ledger**, keyed by `leader_ai.report_key()`.
  `score_sent` is what makes corrections possible: a later re-review, triage
  ruling or upheld dispute re-sends ONLY when the number actually moved
  (`resend_if_changed`). Completion is a trigger, not the only route —
  `sweep_unreported()` runs every drain and sends reports whose one attempt was
  swallowed (Ghost Mode, a Telegram outage, a restart).
- **The review FLOOR and `AUTO_FROM` are the same day (13 Aug 2026)** and
  should stay that way. The floor sat at 11 Aug, so the activity strip said
  review began on the 11th while every scoring surface said the 13th — two
  start dates for one feature, with nothing on screen saying they answer
  different questions. Moving it is the flag-guarded purge in
  `startup.purge_leader_ai_history`: **bumping the date needs a NEW flag key**,
  or the old "already ran" flag makes the new floor a no-op on every box that
  has booted once. It only ever RAISES the floor, never lowers it, and never
  overrules an admin who moved it from «Tarixni tozalash».
- **Auto-queued work announces itself as a RUN** — `auto_discover` is followed
  by `leader_ai.note_auto_run(...)`, exactly as the bot day-close path already
  did. Queueing invisibly is what made the progress strip unreadable: a
  hand-picked re-check sat at «150 / 150 · 100%» with nine hundred auto-queued
  rows behind it and nothing on screen connecting them. The record is the one
  thing every progress reader reads, so this buys the bar, the ETA, Stop and
  the detail view for free. It refuses to displace a LIVE run, so a re-check
  narrowed to one brigadir is never silently widened by someone's Refresh.
  **Two rules keep that refusal from hiding work.** (1) `/progress` re-derives a
  run's `total` as `done + left` on every poll (the recorded total is only a
  floor) and ships the growth as `grew` → the strip's «+N joined»; rows that
  enter a live run from ANY door (day-close, Refresh, Retry) grow its bar
  instead of parking it at «13 of 13 · 100%» beside «1,222 left». (2) The
  drain retires an UN-narrowed run itself (`_release_run`) in the pass that
  empties the queue — «finished» must not depend on a `/progress` poll that
  only happens while somebody has the page open, because an un-retired 13-row
  auto run stayed «live» and swallowed the next Refresh's 1,222 rows under a
  leader's name. Narrowed runs still release at the top of the next pass.
- **Boot resumes the queue** (`leader_ai.resume_after_boot`, called from
  `register_drain_job`, so both entrypoints get it). Every push to `main`
  deploys and restarts the unit, killing the running drain thread — and nothing
  at boot used to pick the rows back up, so the queue sat still until the
  20-minute timer. Deploy twice in an afternoon and the reviewer looks like it
  stops dead at arbitrary rows. It also clears a `running` heartbeat, which at
  boot is a lie by construction (the thread that wrote it died with the old
  process) and otherwise reads as a live-then-stalled drain forever.
- **A drain pass with work left CHAINS into the next one** after
  `DRAIN_CONTINUE_S` (5s), instead of waiting for the timer. The batch cap
  (`gemini_batch_size`, 40) is invisible to the operator, so pacing the queue by
  stalling 20 minutes between bites looked exactly like the drain giving up at a
  random row. `DRAIN_EVERY_MIN` stays 20 and is now only the FALLBACK for a
  queue nobody kicked — a 5s timer would fire a thread and take two locks around
  the clock to find an empty queue. Never chain on `quota` (a 429 hammered every
  five seconds turns a per-minute limit into a per-day one) or on `aborted`
  (retired model / revoked key — the next pass fails identically). The heartbeat
  stays `running` between chained passes, so the strip does not blink through
  `idle` mid-drain. **Consequence to know: a large queue now finishes far
  faster and reaches the daily Gemini cap sooner.**
- **The drain lock lives on a CONNECTION of its own** (`_claim_db_lock` /
  `_release_db_lock`, 2026-10-02). It was taken on the drain's Session, and a
  Session hands its connection back to the pool at every commit (`_beat`
  commits right after the claim), so the unlock ran on another pooled
  connection, answered false, and the lock stayed held: later kicks were
  refused «locked» until pool_recycle closed that connection — measured
  locally, one ordinary pass left it held and half the next kicks were
  refused. Never take a session-level advisory lock on a Session again; the
  backfill CLI uses the same pair.
- **A stalled reviewer tells the admins** (`watch_stall`, job
  `leader-ai-watch`, every 20 min, armed with or without a key). Proofs waiting
  `STALL_AFTER_MIN` (60) with no verdict written in as long are a stall; the
  support chat / every admin gets ONE DM naming the queue, the last verdict,
  the model, the reason (no key · quota · API rejecting every call · crash ·
  refused · silent · nothing started it) and Google's own words — again only
  when the reason changes or after `STALL_REPEAT_H` (6 h), and one «yana
  ishlayapti» when verdicts flow again (`leader_ai_stall_alert` holds the
  state). Rows that merely gave up count only beside a failure the drain itself
  reports, so one unfetchable photo cannot raise it on a quiet night. Born of
  2 Oct 2026, when the plant learned from AI Studio's spend page that nothing
  had been checked all day. It only REPORTS — the drain timer moves the queue.
- **The two RECURRING passes use a rolling window, not the fixed floor** —
  `auto_window_start()` (`AUTO_LOOKBACK_DAYS = 14`). `AUTO_FROM` never moves, so
  a pass bounded only by it re-reads every automatic day ever filed; both of
  these run on a timer or on a button pressed all day, and would get slower
  every day they worked correctly. Catching up on anything older is a
  deliberate errand — «Tekshirish» with scope «unchecked», over a stated count.
- **`/leaders/report/:uid` is the day report** (`pages/LeaderDayReport.jsx`) —
  **auth-only, row-scoped, not page-gated**, like `/cells/:id`: the brigadir
  being told their unit's score is often somebody nobody granted `/leaders` to,
  and a notification opening onto "no access" is worse than no notification.
  Tasks group by OUTCOME (failures first), never by task number; the score is
  never shown without its `submitted → verified` derivation; an unfinished check
  says so instead of looking final. Photos are 72px thumbnails into a lightbox
  **portaled to `document.body`** (`.page-enter`'s transform would otherwise
  contain a `position:fixed` overlay).
- **Objections are the way back, and they run the LATE-PROOF chain**
  (`leader_ai_disputes`, `services/leader_dispute.py` — see the section of its
  own below). Leader files → the unit's brigadir refuses it or uplifts it with
  their own mandatory case → an admin rules with both notes in front of them.
  `decide_supervisor` / `decide_admin` are THE decision cores and every door
  runs them: the report page, the «Norozliklar» queue, the brigadir's inline
  card in Telegram (`ad:` callbacks in `telegram_bot.py`) and the admin's
  (`approvals.py` kind `leader_dispute` / code `ld`). Approving writes
  `resolution="approved"` on the verdict — that is what restores the weight —
  and the corrected score re-DMs itself. Not grantable at either stage.
- (SUPERSEDED 2026-09-26: cards are summaries that open the appeal chat, where
  the verdict, the photos and every note are — «The appeal CHAT».)
  **The «Norozliklar» tab is where all three read it** (`GET /leaders/disputes`
  → `components/leaders/Disputes.jsx`, beside «Kechikkan isbotlar» on
  `/leaders`, `?tab=disputes` deep-links). Until it existed the ruling was reachable from
  exactly two places — an inline Telegram card that scrolls out of the chat,
  and the day report of the ONE leader it belongs to — so an admin who missed
  the card had no list to work from and no way to find the report holding the
  objection. **The card carries the VERDICT, not just the objection**: flags,
  the model's prose and the window it measured against, all off the same
  `_as_verdict` / `_window` / `_date_check` / `_time_check` / `_date_plus`
  helpers the day report reads — a queue that re-derived the rule would show a
  window the leader was never judged by, and one that showed the reason alone
  would get rulings made on wording. It also carries EVERY note the chain has
  collected, in order; showing the first and the last hides the middle
  judgement, which is the one that decided whether an admin ever saw this.
  Photos deliberately stay one tap away on the report, where the whole day can
  be read. Names come from `_project` (the REGISTER's spelling), so the page
  scope bar reaches these rows exactly as it reaches the dashboard's; whatever
  the scope hides is counted in a `ScopeNotice` rather than dropped. Scoped
  like every read here — admin all, brigadir their own unit, LEADER their own
  filings.
- **The queue is SPLIT IN TWO by stage, and the tab badge counts the admin
  half** (the operator's call, 2026-09-02). `stageOf` — the same shape in
  `Disputes.jsx` and `LateProofs.jsx` — reads `status`, which is the stage AND
  the outcome in one column: «Adminlarda» is what waits on an admin ruling,
  «Brigadirlarda» what is still with the unit. It opens on «Adminlarda», the
  half the badge counts and the only stage where the weight comes back. An OPEN
  row belongs to whoever must rule on it next; a SETTLED one to whoever ENDED
  it, so a ruling — and, for an admin, its undo — stays where it was made and
  no decision drops off the page. Only a stage-1 refusal ends on the brigadirs'
  side: an approval, an admin's refusal and a cancelled ruling are all admin
  acts. The split is the FIRST cut, ahead of the «Barchasi / Sizning
  navbatingiz / Tarix» segment and the search, so every count under it
  describes the stage on screen. **The badge is computed on the CLIENT off the
  one payload the queue itself renders** (`status == "admin"`), so the strip and
  the sub-tab can never disagree — and it supersedes the server's per-viewer
  `todo` («whose turn is it», from `canAct`), which is still served and now read
  by nothing. Consequence to know: the badge answers «how much is with the
  admins» for EVERY viewer, so a brigadir does now carry a number only an admin
  can clear.
- **An ADMIN's REFUSAL cannot be made wordlessly, and the reason goes to the
  leader** (2026-09-10, the operator's directive). It is the END of the chain —
  the leader has explained their shift to two people, loses the point for good
  and has no route left — so «rejected» with nothing beside it is the platform
  declining to say why on the one decision that cannot be argued with.
  `leader_dispute.decide_admin` refuses an empty note on `rejected`
  (`Refused("note required")`, the word the uplift guard already uses),
  `leader_dispute_rejected` prints it as «Sabab» (a REQUIRED reason, not the
  optional «Izoh» its stage-1 twin keeps), and every door collects it: the
  `/decide` endpoint pre-checks with a **400** naming what to do, the two
  queues and the day report open the SAME note form the uplift uses
  (`needsNote` — a property of the ROW as well as the verb), and the Telegram
  card PAUSES on the tap (`telegram_bot._ad_ask_admin_reason` → an `ad_arej`
  capture → `_decide_leader_dispute(note=…)`, which is also why that function
  and `_log_leader_dispute` now take a note). The `ap:` keyboard is shared with
  four other approval kinds, so the pause lives in `handle_approval_callback`'s
  `ld` branch, never in the keyboard.
  **APPROVING still needs none** — the outcome IS the answer — and **stage 1 is
  deliberately untouched** (SUPERSEDED 2026-09-26: a brigadir's refusal now
  requires a comment too — see «The appeal CHAT»): a brigadir's refusal is not the last word (an
  admin's undo reaches it, and the leader may file again), so forcing words
  there would be a rule with no consequence behind it. Same rule, same shape,
  in `leader_late_proof.decide_admin`.
- **…but an approval may CARRY one, and it is optional** (2026-09-10, the
  operator's directive). «Does this ruling OFFER a comment» and «does it DEMAND
  one» are two questions and the client keeps them apart — `collectsNote` /
  `noteRequired` in both queues, `noteRequired` on the day report. **Every
  admin-stage ruling offers the box**, because an approval lands in the
  leader's notice exactly as a refusal does and an admin who wants to explain
  either should be able to; only uplifting and an admin's refusal demand it.
  So all three rulings open ONE form rather than three, an optional field says
  so on its LABEL (`FormField`'s red star is what a required one says), and
  nothing blocks the Save — the commonest ruling on the queue must not become
  a typing exercise. The backend needed no change: `decide_admin` already
  stored `note` on an approval.
  **The note is on its OWN LINE in every ruling notice now, and the services
  pass `""` rather than «—» for an absent one** — `staff._render_body` drops a
  line whose single placeholder is blank, so an approval nobody commented on
  has no comment line, where an inline «Izoh: {note}» could only ever print
  «Izoh: —». That fixed the same wart on `leader_dispute_approved`, which had
  carried an optional `{note}` inline since it was written. Stored bell rows
  keep whatever they were written with, so nothing already sent re-renders.
  (SUPERSEDED 2026-09-26: Telegram rules nothing any more — «The appeal CHAT».)
  **Telegram approves on the TAP and offers no box** — an optional field in a
  chat means either holding a ruling for text that may never arrive, or ruling
  first and appending after the DM has gone. An admin who wants to comment
  rules from the dashboard.
- (SUPERSEDED 2026-09-26: an undo now REOPENS the row at the stage the ruling
  was made at and its chat with it — «The appeal CHAT».)
  **A settled ruling has an UNDO** (`POST /leaders/disputes/{id}/undo`, admin,
  the «Qarorni bekor qilish» button under the objection box on the report page).
  Deciding is one tap and an ADMIN's own filing IS the approval, so the wrong
  outcome is one mis-tap away, while `decide` refuses anything already settled.
  It reaches a brigadir's stage-1 refusal too: that is final for the brigadir,
  not for the platform, and an admin is who fixes an account of a shift being
  ended before it was read. The undo reverses the ruling's two writes: the
  verdict returns to `open` (in the automatic regime the flag costs its weight
  again) and the row becomes `cancelled` — never deleted, because a score that
  moved twice has to stay explainable, and because only a LIVE row blocks a
  re-filing. **The verdict and its row move TOGETHER**: a triage ruling that
  contradicts a settled objection retires it through the shared
  `supersede_dispute` — otherwise the card prints «objection upheld» over a task
  that just lost its weight again. The day re-scores via `resend_if_changed` and
  both people told about the ruling are told it was reversed
  (`leader_dispute_undone`).
- **`_auto_clause()` folds a NULL shift with `coalesce`, and that is
  load-bearing.** The drain splits its queue into the clause and its negation;
  under SQL three-valued logic a NULL-shift row dated after `AUTO_FROM`
  satisfies NEITHER (`NOT(TRUE AND NULL)` is NULL), so it would sit `pending`
  forever — no verdict, no error, no retry, invisible to both branches. Any
  future split on this predicate must keep the complement total.
- **Proof photos have TWO doors** (`photo_scope_ok` + `permissions.page_allowed`).
  `/api/leaders/photo` and `/api/leader-tasks/media/{id}` are page-gated for the
  register, but the day report is auth-only by design, so it passes its `uid`
  and the photo is authorised against that report's own row scope — plus a
  check that the report really contains it, or a readable report would become a
  fetcher for any photo on the platform. Page-gating them alone rendered the
  verdicts and 403'd every piece of evidence behind them.
- **A report that can never be sent is PARKED, not skipped**
  (`leader_reports._park`, `score_sent = PARKED`, `sends = 0`). A key leaves the
  sweep's candidate set only when a ledger row exists, so a
  filing-window-voided day — and those accumulate daily — would sit in it
  forever, sort ahead of newer keys and eat the whole per-pass budget until the
  safety net silently stopped working. A park is not a send: if the day is
  later opened, the next pass sends its FIRST report, not a correction.
- **…but a day still OPEN is never parked** (fixed 2026-09-23). A unit closing
  tasks one at a time has each photo task reviewed minutes after it closes, so
  the drain tried the report while the day was still open, `build_report_row`
  answered None, and the key was parked as «report no longer exists». When the
  day's LAST task then closed with no AI review behind it — an automatic check
  (#8 at 17:00 / 06:00), a deadline, a «Yo'q» — no drain pass touched the key
  again and the sweep skipped it for its ledger row: no DM, so no button onto
  the report page, so no objection. Confirmed on the 11 Sep copy: 124 of 1,002
  closed leader-days never sent, 78 of 101 leaders. `send_for_uid` now returns
  False for an open bot day and writes nothing (`_open_bot_day`, the Ghost-Mode
  shape), and `sweep_unreported` sends the report once the day has closed —
  within one drain pass (≤ 20 min). The sweep drops OPEN days before applying
  its budget, or a shift's worth of them would take every slot while closed
  days waited. It also retries a park written BEFORE its day closed
  (`first_sent_at < closed_at`), for days on or after
  `leader_ai.OPEN_PARK_RETRY_FROM` (2026-09-23) only — the days before it were
  listed for the operator and go out only on their tap
  (`services/missed_report_resend.py`, TEMPORARY, the `mrr:` buttons); never
  move that floor earlier. A closed day parked again for a real reason has its
  park re-dated past the close (`_park`), so the retry stops asking about it.
- **`components/leaders/verifyState.js` is THE verification vocabulary** —
  states, colours, icons and precedence for the register chip, the page and the
  filter. Never improvise a second set of words for these five facts. Every
  state carries an icon as well as a colour. A day voided by the filing window
  shows only its void chip; no second red mark beside it.
- **`/leaders` «Vazifalar» tab (`components/leaders/TaskRequirements.jsx`) is
  where a leader READS the rules** — for every enabled task: name, the
  instruction (`description`) and under it the AI definition of done
  (`criteria`), weight (+ share
  when the enabled sum ≠ 100), min photos, photo window, submission deadline and
  the example photos (72px → the shared `ui/Lightbox.jsx`). Fed by
  `GET /api/leader-tasks/requirements` (`services/leader_tasks.requirements_for`),
  resolved down the global → supervisor → leader chain and scoped like
  `/api/leaders` (a leader → own, a supervisor → own unit or one of its leaders,
  everyone else follows the page filters; global standard when nothing is
  picked). Examples stream from the page-gated `GET /api/leader-tasks/examples/{id}`
  (reference material — an admin-authored picture, nobody's evidence — so it
  keeps no row scope of its own; which ids a reader is handed is already
  decided by `requirements_for`). Day-detail task rows carry an ⓘ that
  jumps to that task's card. The old ⓘ table built from the hard-coded
  `TASK_DETAILS` is gone — never resurrect a config view from the seed.
- **An EXAMPLE photo sits at a LEVEL of the chain, exactly like the criteria
  beside it** (2026-09-04). `leader_task_examples.manager_id` / `.leader_id`
  say which — both NULL = global — and **`leader_ai.example_ids_map` is THE
  resolver**, whose one rule is that the NARROWEST level holding any photos
  wins **WHOLE**: a leader with their own example sees theirs INSTEAD of the
  global one, never both, mirroring `criteria_for`'s first-non-blank. A union
  would hand the leader two answers to "what should this look like" and nothing
  saying which was meant for them. All three readers go through it — the
  reviewer (`task_examples`, now resolved against the report's own
  `manager_id`/`leader_id`, because a photo must be judged against the example
  the leader was actually shown), the «Vazifalar» tab (`requirements_for`) and
  the admin matrix.
  - **Why**: the criteria and the example are ONE statement of what a correct
    proof looks like — one written, one shown — edited in the same block of the
    same modal. Keyed by task alone they could not be: an admin who wrote a
    definition of done for two leaders and uploaded the matching screenshot
    beside it got the text scoped and the PICTURE on every leader on the
    platform. Same shape as the camera setting that reached everybody on
    2026-08-19.
  - **Nothing was migrated and nothing moved.** Both columns are nullable and
    every pre-existing row carries NULL/NULL, which reads as global — precisely
    what those rows already were. Attributing one to a unit would be a guess,
    and a picture attributed to the wrong unit is worse than one attributed to
    nobody. A global row that should not be one is deleted from the unfiltered
    column modal and re-uploaded under the filter.
  - **An upload names its targets and fans out one ROW EACH** (`manager_ids` /
    `leader_ids` on `POST /admin/leader-tasks/examples`): an example is bytes,
    not a pointer. `leader_ids` wins over `manager_ids`, the same precedence
    `colScope()` applies on the client. Sending NEITHER writes global, which is
    what an unfiltered column modal means and what a tab open on an earlier
    bundle still sends — so that case is byte-for-byte unchanged. The per-level
    cap is `_EXAMPLES_PER_TASK`, checked for EVERY target before anything is
    written so a fan-out is refused whole, and `_EXAMPLES_FANOUT_MAX` bounds
    the breadth: a mis-clicked filter must not put a hundred copies of one
    screenshot into every db-dump.
  - **All three ltasks modals carry the strip now**, each scoped to what it
    writes — the brigadir cell (that unit), the leader cell (that leader, THE
    control this exists for), the column modal (global, or the filtered rows).
    An INHERITED photo is dimmed and carries **no delete button**: deleting it
    would reach every other row inheriting the same one, which is the accident
    this scoping ends. Unlike every other field in those modals an example
    applies AT ONCE — bytes, not a staged draft — and each note says so.
- **The leader's text and the AI's text are TWO fields (2026-09-06, the
  operator's directive).** `criteria` is the grader's test and nothing else;
  `description` (new, same three tables, same global → supervisor → leader
  chain, same single-untranslated-text convention) is the instruction the
  leader reads. One field could not be both: "the journal must be filled and
  its last entry must belong to this shift" is a test, not something you tell a
  person to do. `PUT /admin/leader-tasks/description` is the twin of
  `/criteria`, four-way addressed the same way, and it lands on the SAME
  override row — so the modals go on writing it inside the awaited chain.
  **`leader_ai._prompt` does not know this column exists**, which is the whole
  safety argument: a description edit can never move a verdict, past or future.
  **`leader_tasks._resolve_description` is THE resolver and it falls back to
  `criteria`** when no level holds a description — between 2026-08-15 and the
  split the criteria WAS what every leader read, so a task with no description
  of its own keeps showing it and nothing went blank on the day this shipped.
  Apply that fallback only in the RESOLVERS (`effective_leader_config`,
  `requirements_for`), NEVER in the raw admin layers (`effective_settings`,
  `leader_overrides`) — there an unwritten description must read as unwritten,
  or the matrix marks every cell overridden. The «Vazifalar» tab leads with the
  description and prints the criteria under it as «AI nimani tekshiradi»,
  because the rule a leader is judged by is still a rule they get to read; it
  drops the second block when the two resolve to the same string.
- **Leaders READ these texts, so they are ordinary prose — and there is a
  bulk editor for that.** «Matnlarni tuzatish» on the ltasks matrix header
  (`pages/admin/CriteriaTextsModal.jsx` + `utils/textCase.js`) lists every
  definition-of-done actually STORED — the global level plus each supervisor /
  leader override, because an override left in capitals is invisible from the
  matrix and fixing only the global texts leaves those units shouting. One
  press rewrites SHOUTED text to sentence case: letter CASE only, never a word
  or its order, a word already carrying a lowercase letter is untouched, and a
  known acronym keeps its capitals («SAPDAN» → «SAPdan», while «IDORA» is left
  an ordinary word — a prefix test alone wrecks every word starting ID/IT/AI).
  It only DRAFTS; nothing is written until Save, and the writes then go through
  the ordinary criteria endpoint ONE AT A TIME, the same rule (and the same
  unique key) as the three ltasks modals. It covers `criteria` ONLY — the
  descriptions beside them were empty on the day they shipped, so there was
  nothing yet to fix; widening it to both texts is a small, deliberate follow-up
  (one more source in `criteriaItems` and the description endpoint in the save
  loop), not something to assume it already does.
- **A window OUTSIDE its shift's hours is refused on write** (the operator's
  ruling, 2026-08-27). `leader_ai.window_fits_shift` is the rule and
  `leader_tasks.window_shift_problems` applies it at the endpoint, so a fan-out
  is refused WHOLE rather than half-written. The frame is
  `leader_ai.window_span` — MINUTES FROM THE SHIFT'S OWN OPENING, seated by
  `window_offset` — because raw clocks cannot answer the question: on a night
  shift «08:00» is 15 hours in while «18:00» is one hour in, and the smaller
  number is the later moment. A window ending exactly ON the shift's close fits.
  This is the source of the 26 Aug night and the reason it is a hard 400: the
  windows were simply set wrong («08:00 — 10:00», an ordinary shift-1 morning,
  inherited by a unit working 17:00 → 09:00), and the platform stored the
  impossible hours and then recorded the leaders as having failed them.
  **Consequence to know: the GLOBAL level is judged against every shift that has
  an active unit**, so with both shifts running a global window is limited to
  their overlap (17:00–20:00) and everything else must be set on a brigadir's or
  a leader's cell. That is the honest shape — a window is a property of a shift,
  and the global level is exactly the door the incident came through.
  `backend/report_bad_windows.py` is the read-only audit of what is already
  stored, across all three levels.
- **The per-task submission `deadline` ("HH:MM", same three tables + admin matrix
  field beside the window, `PUT /admin/leader-tasks/deadline`) is INFORMATIONAL
  (user, 2026-08-15)** — a bot entry is still judged by nothing but the day's
  filing window. Blank at every level ⇒ the tab prints the day's filing deadline
  marked «kun bo'yicha», never nothing. Practical for shift 1 only for now (a
  global value serves both shifts, like the window). Enforcing it (deduct or
  flag) is a separate decision — ask before touching scoring.

Related memory: `leader-ai-proof-review`, `leader-task-photo-window`,
`leaders-shift1-submission-window`, `leader-task-requirements-tab`.

## The 19 September 2026 checklist rules (`leader_rules_sep19`)

The operator rewrote the leader checklist task by task (agreed 14—18 Sep 2026)
and the new rules start on **shift 1's day of 19 Sep and shift 2's night of
19—20 Sep**, for EVERY non-archived unit at once. `services/leader_rules_sep19.py`
holds the agreed texts and the one pass that writes them; `startup.register_leader_rules_sep19`
arms it.

- **The `criteria` are ENGLISH and the `description`s are UZBEK, and that split
  is the point.** `criteria` is the grader's test — the reviewer follows
  compound rules most consistently in English — and `description` is the
  instruction the leader reads, in the operator's own words. They are two
  columns for the reason the 2026-09-06 split states: `leader_ai._prompt` does
  not know `description` exists, so an instruction can never move a verdict, and
  a criteria edit only reaches proofs reviewed AFTER it, never the ones already
  judged.
- **Task 13 carries TWO of each, picked by the unit's SHIFT.** Its date rule
  differs: shift 1 fills the report on the day it worked, so the table's date
  equals the computer's clock; shift 2 fills it after midnight, so the clock is
  exactly ONE DAY LATER than the table (table 18.09, clock 19.09). A unit belongs
  to exactly one shift, so per-unit texts express that with no new mechanism.
  Tasks 1, 8 and 9 are deliberately absent — they keep today's rules until the
  automatic checks are built.
- **Two passes, two flags, and neither ever fires mid-shift.** Shift 1 at
  19 Sep 00:30 and shift 2 at 16:30, Tashkent — each in its own shift's gap, so
  no leader is re-judged in the middle of a checklist they are still filling.
  TWO flags because they are two deliveries and "shift 1 is done" must not read
  as "this is done" (the `shared_work_centers` precedent). `_rules_run_at` is
  the rule: before the instant, at it; after it with the shift idle, in a minute
  (APScheduler drops a fire time already 300s past, which would leave the flag
  unset forever with nothing on screen saying so); after it with the shift
  RUNNING, at the first minute after that shift closes. Late is the acceptable
  failure here; mid-shift is not.
- **The flag is written LAST and not in one transaction with the writes** — the
  chain setters in `leader_tasks` each commit for themselves, so the pass cannot
  be atomic. Every write is idempotent instead, so a pass that dies half-way is
  re-run whole by the next boot. Verified: running both passes twice changes
  zero config rows and re-derives zero verdicts.
- **Besides the texts the pass writes the DATE MODE, whole, and two numbers.**
  `DATE_MODES` carries all three flags per task — 11 is DATE ONLY
  (`date_check` T, `day_check` T, `time_check` F) and 13 is TIME ONLY
  (T / F / T) — because writing one flag and inheriting the rest is how a task
  ends up in a mode nobody chose. Two proofs of that, both found on the 11 Sep
  copy: **task 11 was DATE-ONLY on all 13 shift-1 units and STRICT on all 8
  shift-2 units**, which inherit the global `time_check` True — so the same
  «+1 day» meant two different things, and shift 2 went on failing staff lists
  on the CLOCK while the criteria shipped beside it says the clock is not judged
  at all. And task 13's TIME-ONLY would have rested on a global `time_check` an
  admin may edit, at which point `date_flags` returns nothing and the task is
  silently EXEMPT (`not check or not (days or times)`) — the one mode the admin
  UI never offers. Then task 11 `date_plus` = 1, and task 3 `min_media` = 3 plus
  the GLOBAL `default_min_media` 1 → 3. That last one has no setter and no
  endpoint — it is written at seed time and by `create_task` and nowhere else —
  so the pass touches the ORM attribute directly, and it is what a unit with no
  row of its own resolves to.
- **A leader with their own `criteria` and no `description` is made coherent
  FIRST** (`keep_leader_texts_coherent`). Such a leader reads their own criteria
  as the instruction, because `_resolve_description` falls back to the resolved
  criteria — and the moment the unit gains a description that fallback stops
  applying, so they would be TOLD the unit's new instruction and GRADED on their
  own older criteria. Their description is materialised from their own criteria
  before any unit description exists, which changes nothing they see today. Their
  criteria is left alone: it is a deliberate admin edit.
- **Task 13's WINDOW is deliberately NOT written.** `leader_ai.resolve_window`
  falls through to `shift_window(shift)`, so a shift-1 unit storing no window is
  ALREADY judged against 07:00—20:00 and its task ALREADY closes at 20:00 —
  confirmed on the 11 Sep production copy, where 62 of the 68 shift-1 task-13
  closes after 20:00 land in the 20:00—20:04 autoclose sweep. Writing the same
  hours would move nothing and would mark 13 units as overriding a value they
  merely inherit. Shift 2 keeps its own 00:00—08:00.
- **Consequence to know: scores from 13 Aug moved, once, retroactively.**
  `sync_date_flags` takes no date bound, so the pass re-derives every stored
  verdict on tasks 11 and 13 — measured on the production copy: **433 of 4,871
  rows moved, 426 date rejections LIFTED, 1 gained (on a row already rejected
  for `not_proven`, so no score moved) and 6 reclassified `date_mismatch` →
  `no_date`. NOTHING that was clean before is flagged now.** The bulk of it is
  task 11 on shift 2 — 352 lifted — which is the mode correction above, not the
  tolerance: 248 `date_mismatch` → 8 and 112 `no_date` → 0. No corrected report is re-DMed, which is the platform's standing
  rule for a date-rule edit — so the pass's own DM states the count, or nobody
  learns a month of scores changed. It is called ONCE for the whole pass, never
  per unit: the re-derive is per TASK and walks the entire corpus, so
  `rejudge=False` rides every date-rule write inside the loop.
- **Per-LEADER rows are left alone and NAMED.** A leader row shadows the unit
  row under it, so a leader carrying their own criteria, window or date rule on
  these tasks keeps it — those are deliberate admin edits. `leader_overrides_left`
  lists them and the DM prints them, because a rule that silently does not apply
  to some leaders is exactly what nobody finds out about.
- **Two small surfaces changed with it.** The camera info sheet now prints the
  `description` (`routers/leader_proof.py` sends it on both session payloads,
  `ProofCamera.jsx` prefers it) — without that it would have shown leaders the
  English grader prose. And «Vazifalar» prints both texts RAW: it ran them
  through `useTranslit`, the NAME transliterator, which remaps x→kh and q→k for
  the English UI and garbles authored prose in either language.
- **The INSTRUCTIONS were published early, on 18 Sep, and nothing else was**
  (`preview`, flag `leader_rules_2026_09_19_preview_v1`). The operator asked for
  leaders to be able to read the new texts and prepare before anything they are
  scored by moved. Only `description` is written — at the UNIT level and at the
  GLOBAL one, because «Vazifalar» opens on «Umumiy standart» when no brigadir or
  leader is picked, so a unit-only preview left the page an ADMIN opens still
  showing the old text (reported from production, 18 Sep; widening it needed a
  NEW key, `…_preview_v2`, the first being already marked done). Task 13 is
  skipped globally — two shift variants, no global shift — and the global
  CRITERIA are deliberately NOT touched, since those would change what every
  unit is judged by at once, mid-shift. `description` is the one column here
  that cannot move a verdict, so it is safe to write mid-shift — measured on the
  production copy: **0 of 31,962 verdicts and 0 of 1,404 resolved rules
  changed**, global criteria untouched. Writing an instruction without its rule is a
  trap on its own (a leader who reads «the list may be dated tomorrow» and files
  that way the night before would still be judged by the old rule), so every
  preview text carries `PREVIEW_NOTE` saying when it starts, and the 19 Sep pass
  rewrites the same column without it — the notice removes itself. A shift whose
  real pass has already run is skipped, or a box booting later would paste
  «starts on 19 September» over texts already in force.

- **The nine shift-invariant texts are ALSO written at the GLOBAL level, as a
  baseline** (`apply_global`, flag `leader_rules_2026_09_19_global_v1`, the
  operator's call 18 Sep). It runs in whichever per-unit pass finishes LAST and
  never before them: written first, a unit not yet processed would resolve to
  the new text in the middle of its own shift, which is what the two passes
  exist to prevent. **The unit level still wins** — the chain resolves narrowest
  first, so all 21 units go on reading their own text and an admin who edits one
  keeps that edit; measured, the global write changes **0 resolved rules** and,
  since `set_criteria`/`set_description` never rejudge, it cannot move a verdict
  at all. It exists for the unit that does not exist yet, which would otherwise
  inherit «three photos» from the raised `default_min_media` and the OLD task-3
  criteria explaining one. **Task 13 is not written globally and cannot be** —
  its two texts differ by shift and the global level has no shift, so a future
  unit inherits the old task-13 text until somebody gives it one.

- **Tasks 1, 8 and 9 get an INSTRUCTION and no criteria** (`AUTO_DESCRIPTIONS`).
  They are the three becoming automatic checks later, so what they are judged by
  is untouched — but a leader still has to be told what the job is. **These state
  the JOB, never the pass mark**, and that is the operator's rule (18 Sep): a
  minimum exists so nobody fails on a technicality, and printed as the
  instruction it becomes the target — a leader who reads «at least one concern»
  files one concern. So they read «enter the plan and the people for your
  cells», «get your workers writing concerns to you and write one to your
  brigadir», «reach 50% of the plan by the set time», while the thresholds the
  checks will actually use (one concern, 30%) stay where they belong, inside the
  check. Task 9's instruction says 50% though its automatic check passes at 30%,
  and that gap is deliberate. They carry NO «starts on the 19th» notice, because
  none of it starts on the 19th — it is the job as it already is — which is also
  why the pass rewrites them verbatim rather than leaving the preview's copy as
  the last word.

- **It is a TEMPORARY one-shot.** Remove `register_leader_rules_sep19` from both
  entrypoints together with `startup.register_leader_rules_sep19` and
  `services/leader_rules_sep19.py` once both passes have landed — a call left
  behind imports a deleted module at boot, and a failed boot rolls the deploy
  back. Changing what either pass writes needs a NEW flag key.

## The 25 September criteria revision (`leader_rules_sep26`)

From **26 Sep 2026** (shift 1's 00:30 gap, shift 2's 16:30 gap) the AI criteria
of tasks **3, 6, 7, 11 and 13** are the ones rewritten from the operator's
reasons for the 50 AI flags admins lifted on 19–20 Sep (interview 22—25 Sep;
the rulings are in memory `leader-criteria-rulings-sep19-20`).
`services/leader_rules_sep26.py` holds the texts and the pass;
`startup.register_leader_rules_sep26` arms it, in both entrypoints.

- **CRITERIA ONLY — the operator's ruling («Do not edit description for the
  leaders»).** The Uzbek instruction stays exactly as the 19 Sep pass wrote
  it, so what a leader is TOLD and what the grader JUDGES now differ on these
  five tasks (e.g. the KAIZEN sheet, yellow «запас», an empty rokla, Объём 0
  are accepted by the grader and not mentioned to the leader). That is the
  operator's call — do not «fix» it by writing descriptions.
- **What changed, in one line each**: T3 — different products or separate
  stations count as different processes, a sleeve down to the wrist / a bare
  hand / a glove is fine (only a pushed-up sleeve with bare forearm fails), a
  cloth lying on the table is still clutter, two photos of one product at one
  table are still one process. T6 — any transport (vagonetka, rokla, cart),
  loaded or empty; the worker need not look at the goods. T7 — ANY printed
  control form that holds what is asked (code, name, date; per product
  quantity, start, finish, fact) counts, extra columns and writing ignored;
  code/name/date anywhere in the header; a «астаткада бор» row needs no times;
  a struck-through row does not count. T11 — any green, yellow «запас» valid,
  selection frames and legend cells ignored, a weekly/monthly grid judged on
  the clock's day (or the next) only, and a grid with no such column FAILS.
  T13 — Объём 0 is an empty row; empty rows at the bottom may be cut off.
- **A LEADER-level task-3 text for one-process cells** on exactly the five the
  operator named (Akramov, Omonov, Ro'ziyeva, Saidova, Tursunboyev —
  `ONE_PROCESS_LEADERS`, profile id AND name). Criteria only, so they read their
  unit's 19 Sep instruction (`_resolve_description` walks to the first
  non-blank description). SUPERSEDED 2026-10-10: the cell flag
  `cells.one_process` decides it now (see «A cell's «Jarayonlar»»), the five
  names were turned into ticked cells and their leader rows cleared — a new
  one-process cell is ticked «Bitta jarayon» on /cells, never added here.
- **Compare-and-set, never blind.** A level is rewritten only while its
  criteria is blank, still the 19 Sep text, or already the new one; a unit or
  leader an admin edited since 19 Sep keeps its text and is NAMED in the DM.
  Nothing else moves: no date rule, window, photo count, and `set_criteria`
  never re-judges — the text reaches only proofs reviewed after it lands.
- **Tested before it shipped**, blind: grader agents saw only the new text and
  the real 19–20 Sep photos (approved cases + rejected and passed controls).
  Measured on the 11 Sep production copy with the 19 Sep pass replayed first:
  105 unit criteria written, 0 description cells and 0 of 540 resolved leader
  instructions changed, 538 resolved criteria changed (the other 2 are one
  leader's own overrides, named), a second run writes 0.
- **A little bare wrist is not a rolled-up sleeve — the line is 5 cm** (the
  operator, 26 Sep, on Gemini Pro verdicts that failed a cuff sitting a little
  above the wrist as «yenglari shimarilgan»). The T3 text already spared «a
  short strip», and the grader failed it anyway, so the two sleeve bullets of
  BOTH task-3 texts were replaced IN PLACE (`_sleeve`, which fails the import
  if the bullets ever go missing): a bare forearm is MORE THAN 5 CM of bare
  skin above the wrist — with a scale the model can read in the same photo
  (three fingers held together, a little over half the palm) — and an arm too
  small, blurred or hidden to tell does not fail. A hand-width wording
  (`_SLEEVE_V2`, flag `…_t3_sleeve_v1`) was live for about an hour first; Pro
  failed a sleeve down to the wrist again after it landed, and the operator
  then named 5 cm and chose to keep the AI judging it over a platform-decided
  cuff check. Earlier texts stay as `CRITERIA_3_V1` / `ONE_PROCESS_CRITERIA_V1`
  / `_SLEEVE_V2`; every pass here accepts them as its own, and `apply_sleeve`
  upgrades whatever still holds one (exact matches, any level, either shift),
  naming a level an admin wrote. Flag `leader_rules_2026_09_26_t3_sleeve_5cm_v1`,
  run a MINUTE after boot, not in a shift gap. Verdicts already written are
  not re-judged («Qayta tekshirish» is the way).
- **TEMPORARY.** Delete `register_leader_rules_sep26` from both entrypoints,
  `startup.register_leader_rules_sep26` / `_leader_rules26_job` /
  `_leader_rules26_dm` / `_leader_rules26_sleeve_job` / `_leader_rules26_sleeve_dm`
  and the module once all four flags (`leader_rules_2026_09_26_shift1_v1` /
  `…_shift2_v1` / `…_global_v1` / `…_t3_sleeve_5cm_v1`) are set — and BEFORE
  deleting `leader_rules_sep19`, whose texts it compares against.

## Task 4 (obxod) from 7 October 2026 (`leader_rules_oct07`, `leader_rule_eras`)

The operator, 07.10.2026: task 4's proof stays a screenshot of the Tasker
inspection list, but **every progress bar on it must be at 100%**, the
screenshot must be taken **during the shift — date + time checked over the WHOLE
shift, both shifts** — and leaders are told every obxod must be 100% done.
`services/leader_rules_oct07.py` holds the texts and the pass;
`startup.register_leader_rules_oct07` arms it, in both entrypoints.

- **What is written, task 4 only**: the English `criteria` (a card is DONE
  when its bar is filled to the end AND its count reads n/n; the number in the
  card's small box — «100.0», «86.0 %» — is the inspection's SCORE, not its
  fill, may be below 100 on a finished inspection and is never judged (the
  operator's correction the same day — the first text read it as a percentage);
  one visible card not done fails; a card cut off so far that neither its bar
  nor its count shows is not judged; several screenshots are allowed for a long
  list) and the Uzbek `description` — compare-and-set, as on 26 Sep: blank,
  the 19 Sep text or its 18 Sep preview variant is replaced, anything else is an
  admin's wording, kept and NAMED. Then the date rule WHOLE on every unit:
  «sana + vaqt» (date_check / day_check / time_check all True), the window
  written EXPLICITLY as the unit's whole shift (07:00—20:00 / 17:00—09:00, so no
  unit leans on the global level between the two passes), the unit's own task-4
  deadline cleared (on a per-task unit the task now closes at the shift's end),
  date tolerance 0. The global level gets the texts, the three flags, a CLEARED
  window (it serves both shifts, so blank falls through to each shift's hours),
  no deadline. Leader-level rows are left and named (the 19 Sep convention).
- **The leader's instruction went out EARLY, on the day** (the operator wanted
  it visible at once): `publish_description`, a minute after boot — the
  `description` alone, every unit of both shifts and the global level,
  compare-and-set. It moves no verdict; the criteria and the date rule still
  land in each shift's gap, and the passes find the text already written. Flag
  `…_t4_description_v2`: v1 published «100% bajarilgan», and the text was
  corrected the same day to «chizig'i to'liq to'lgan va soni to'liq (7/7)»;
  every pass accepts the v1 texts (`CRITERIA_V1`, `DESCRIPTION_V1`) as its own.
- **Strict, not time-only — a choice to know.** The example screenshot (a Galaxy
  Tab) shows «22:14 вс, 13 сент.» in its status bar. A PHONE whose status bar
  shows the hour alone fails `no_date` under this rule; «faqat vaqt» on the
  ltasks date-rule toggle is the one-click way out if leaders file from phones.
- **Shift 2 from the night of 07.10 (pass 16:30), shift 1 from 08.10 (pass
  00:30)**, global after both — each shift's day records the day it actually ran
  for (`first_new_day`), never a hard-coded one.
- **It is a DATED change, and that is the new mechanism —
  `services/leader_rule_eras.py` (PERMANENT).** A date-rule or window edit
  re-judges EVERY stored verdict of the task at the next boot
  (`sync_date_flags` has no date bound). Turning the date question ON for a task
  whose proofs were filed under «not checked» would have rejected weeks of past
  task-4 proofs (`no_date`) with no DM. So before the first write the task's rule
  is FROZEN — the global row and every unit row, fields `win_from`, `win_to`,
  `date_check`, `day_check`, `time_check`, `date_plus`, `deadline` — into
  `AppSetting` `leader_rule_era_t4_2026_10_07` (insert-only); each shift's pass
  records `from[shift]` before writing and only ever moves it LATER; and every
  reader that resolves the rule FOR A DAY swaps in the frozen unit and global
  rows for a day before its shift's `from`: `leader_ai.date_rule_for` (the
  reviewer, cards), `leader_ai.sync_date_flags`, `routers/leader_ai._levels`
  (queues, objections, day reports) and `leader_tasks.effective_leader_config`
  (bot, checklist, closing sweeps — time fields only, via `load_cached`, 60 s).
  Leader rows are never frozen (the pass does not write them). A row whose shift
  is unknown reads the later `from`. Tested end to end on the dev DB: 0 past
  verdicts moved by either pass or the next boot's re-derive; a new night with
  no clock reads `no_date`, an 08:40 next-morning clock passes, a 10:15 one is
  `date_mismatch`; the router and the reviewer agree on every row.
- **The criteria are NOT dated** — the platform's rule for any criteria edit: a
  re-check («Qayta tekshirish») of a day before the change is judged by the new
  100% text but the OLD date rule.
- The job re-derives once and DMs the admins the count of verdicts it moved —
  expected 0; anything else means the era missed a reader.
- **NEVER delete an era or its frozen row** — every boot re-derives against it.
  A new dated change is one more `Era` with a NEW key. Delete
  `leader_rules_oct07.py`, `register_leader_rules_oct07` and its jobs/DM (the description job included), and the
  call in BOTH entrypoints once all three flags
  (`leader_rules_2026_10_07_t4_shift1_v1` / `…_shift2_v1` / `…_global_v1`) are
  set; keep `leader_rule_eras.py`.
- Not changed: the task's NAME («… (3x/day 9:00-11:00-15:00)», shift-1 hours in
  every language), its photo count (1), its example photo (already the operator's
  Tasker screenshot, 19 Sep).
