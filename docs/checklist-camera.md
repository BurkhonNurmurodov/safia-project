# In-app camera proofs

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## In-app camera proofs (`proof_kind`, `/proof/camera`)

Leaders were editing the timestamp a third-party camera app wrote onto their
proof photos, so from **2026-08-19** a checklist task can declare that its proof
is **TAKEN IN THE APP** instead of uploaded. The clock on such a photo is the
SERVER's; the phone never authors it.

- **The ltasks modals write ONE row, so they write it ONE AT A TIME.** criteria,
  window, deadline, the date rule and the proof kind all materialise the same
  `leader_task_settings` / `leader_task_leader_settings` row, and a brigadir or
  leader who has never been edited has none — fired together, two of them INSERT
  it concurrently and one dies on the unique key while the modal reports
  success. That is how the camera pilot's first unit saved and came back
  screenshot (2026-08-19). `saveCell`, `saveLeaderCell` and `saveCol` are all
  awaited chains now, and `leader_tasks._sup_row` is the materialiser that
  re-reads the winner's row on an `IntegrityError` instead of failing — because
  the endpoints are reachable without the UI. Never add a sixth writer to these
  modals as a parallel `mutate()`.
- **Enrolment must NAME a unit.** While `leader_tasks.CAMERA_IS_PILOT` stands,
  the GLOBAL level of the chain may only hold `screenshot` — camera is set on a
  supervisor's cell (whole unit), a leader's cell (that leader), or the task's
  column modal **while the matrix is filtered**, where it writes exactly the
  rows on screen. Unfiltered, that modal writes the global level, so the control
  is not offered there and a sentence says to pick a brigadir in the filter
  instead — the fast path for enrolling one unit's several camera tasks without
  opening a modal per cell. This is not
  cosmetic: the pilot's setting WAS written globally on 2026-08-19 and every
  leader on the platform inherited it, five tasks each, mid-shift
  (`startup.reset_leader_camera_pilot` is the one-shot that took it back to
  zero — configuration only; photos, stamps and verdicts were untouched).
  Enforced in `set_proof_kind` and again in the endpoint, because the endpoint
  is reachable without the UI. Flip the constant on the day camera becomes the
  platform default.
- **`proof_kind` is the switch** — `screenshot` (send images to the bot chat,
  what every task did before and still does by default) or `camera`. Same
  global → supervisor → leader chain as `min_media`
  (`leader_tasks.resolve_proof_kind`, `set_proof_kind`, `PUT
  /admin/leader-tasks/proof-kind`, the two-way pick in all three ltasks modals
  plus a 📷 mark on the matrix cell). `screenshot` is the chain's floor, so a box
  that never ran the migration behaves exactly as before. **Applies at once and
  never stages**: it is the one field that changes what the leader is asked to
  DO, and a staged version would offer an upload for a task whose proofs are
  collected in the app for a whole shift — so an admin switching a unit does it
  when that unit's next shift is about to start, not mid-day. NOTHING names a
  pilot unit in code: whichever supervisor is enrolled is the pilot, and a
  filtered column save touching more than one row asks first, naming the count.
- **A camera task has NO upload path, and that is the feature.** The bot answers
  «Ha» with a `web_app` button (`_lt_open_camera`), refuses every file sent to
  the chat while that task is open (`_lt_camera_no_upload`), and its menu row
  reads `📷` / `📷 k/N` / `✅`. Accepting a file "just this once" puts the
  timestamp back in the leader's hands.
- **The clock**: `/api/leader-proof/session` hands the page the server time once;
  the page advances it with `performance.now()` (monotonic — a phone clock edit
  moves nothing) and re-anchors every 5 min. The claimed instant is clamped
  server-side to "not in the future" and "not before this checklist day began".
  What the DEVICE thought the time was is stored as `skew_s` and judged by
  nothing.
- **The stamp is drawn on the server** (`services/leader_proof.burn`, Pillow,
  the `downtime_card` font resolver): `Safia · DD.MM.YYYY  HH:MM:SS` Tashkent,
  bottom-left, TWO layers — a heavy outline plus a fill picked from the
  brightness underneath — so it is legible on any background **without a plate
  behind it** (the operator's call, 2026-08-19: the mark states the time, it
  does not black out the corner of the evidence). Its size comes from the
  image's **SHORT edge** (`_fit_font`) and is then measured and shrunk until the
  text provably fits the width: sizing off the height put a ~950 px mark on a
  900 px-wide portrait photo — the shape every phone produces — and the seconds
  ran off the right edge of every proof. `STAMP_H`/`STAMP_PAD` in
  `ProofCamera.jsx` are the same two numbers and must stay the same two
  numbers. **No font ⇒ `stamp_unavailable` ⇒ nothing is stored**: an unstamped
  camera photo is indistinguishable from the shots this feature replaces.
- **`leader_task_photos` is the roll** — per (day, task, slot), written the
  moment a shot lands, so a leader who shot two of three and closed Telegram
  comes back to two. At `min_media` the task IS done: `sync_entry` writes the
  LeaderTaskEntry **in place** (the id is stable — `LeaderAiReview.ref` is built
  from it) and rebuilds `leader_task_media` in slot order, which is what keeps
  the dashboard rows, media proxy, AI reviewer and day report working with no
  knowledge of this table. There is no Save button and none is wanted.
- **Required slots are RETAKEN, never deleted**; extras go up to `min + 3`,
  hard cap 6, and only they are deletable. Answering «Yo'q» or resetting a task
  retires its roll (`clear_roll`) so the menu can never show progress on a task
  recorded as failed.
- **The camera prompt carries «Qayta topshirish» (user, 2026-08-19)** — the ONE
  way to empty a camera task, and it supersedes the earlier rule that camera
  tasks never offer a reset. The app edits a roll shot by shot (retake a
  required slot, drop an extra) but cannot empty one, so a leader who shot the
  wrong thing for an already-done task had no route back except an admin. It
  shows only when there IS something to delete (a shot on the roll or an answer
  recorded), confirms first (`lt:crst` → `lt:crok`, the confirm text says the
  photos go), and lands back ON the emptied camera rather than the menu, since
  the reason to reset is to shoot again. `_lt_reset_task` is THE reset core,
  shared with the upload flow's «Qayta topshirish» so «empty» means one thing —
  and it drops the roll whether or not an entry exists, because a half-shot
  camera task holds shots and no entry and that is precisely the state a leader
  resets from. Channel copies stay: the archive is the audit trail.
- **Offline shooting is allowed** (`utils/proofQueue.js`, IndexedDB, flushed
  oldest-first on `online` and on open). Queued shots hold their slot in the
  roll, the task stays incomplete until the server has them, and Telegram's
  closing confirmation is armed while any are pending. A gap beyond
  `DEFERRED_AFTER_S` marks the row `deferred` — shown, never treated as a fault.
- **One shot has ONE id, and the upload is idempotent** (`client_key`). A
  connection that dies between the bytes landing here and the answer reaching
  the phone is indistinguishable from one that never carried them, so the page
  re-sends either way — and with no id the second POST was an ordinary new
  photo: same picture, same burnt second, next free slot, the roll holding one
  shot twice (reported from the pilot, 2026-08-19). The key is minted WITH the
  picture (`proofQueue.newKey`), kept beside the blob in IndexedDB and sent on
  every attempt; `save_photo` looks it up FIRST and answers a replay with the
  row it already wrote — before burning or relaying, so a replay costs no
  second channel post either. `uq_ltask_photo_client_key` (leader_id,
  client_key) is the backstop for two attempts racing, and `flush` is
  single-flight for the same reason. A NULL key behaves exactly as before, so
  nothing that predates this moves; a key whose row was since deleted (a
  retake, `clear_roll`) is a miss and writes a new row, which is the honest
  floor. While anything is queued the page retries on a 20 s timer as well —
  `online` never fires for a drop that lasted one second, and the shot would
  otherwise sit in the queue until somebody reopened the page.
- **Outside the photo window a shot is ACCEPTED and marked `late`** (user's
  ruling): the page warns before the shutter, and the deduction comes from the
  ordinary date machinery, not a new one.
- **The AI judges CONTENT only.** `review_one` substitutes server-recorded
  clocks for the transcribed ones (`_camera_clocks` → `leader_proof.server_clocks`,
  same shape, same field), so `date_flags`, `sync_date_flags`, the triage card
  and the day report all read a camera proof through code they already have — an
  out-of-window capture becomes `date_mismatch` deterministically, and an admin
  widening a window still re-derives every affected verdict for free.
- **The page** is `pages/ProofCamera.jsx` at `/proof/camera?leader=&task=` —
  auth-only and NOT page-gated (like `/leaders/report/:uid`: the leader filing
  the proof holds no `/leaders` grant), outside `Layout`, dark chrome. Three
  states, one primary action each: viewfinder → shutter, review → Saqlash, full
  roll → Tayyor. Rear main lens by default (see the 0.5x bullet below), free
  flip, live stamp preview positioned exactly where the burnt one lands. `?leader=` is typeable, so the backend checks it against the leader
  profiles the calling account actually holds.
  **Two rules the layout is built on, both bought the hard way.** (1) The
  picture box is measured in PIXELS from the frame area and built to the
  stream's own aspect (`fitBox`), so the viewfinder is the whole frame and never
  a crop of it — it used to be a full-bleed element sized in percentages inside
  an auto grid row, the percentage collapsed to the video's intrinsic height,
  and the leader composed inside a vertical SLICE of the file with the stamp
  pushed below the clip, invisible. Letterboxing beside a tall frame is the
  correct outcome; cropping the file to fill the screen is not (the operator's
  call). (2) The `<video>` stays MOUNTED in every state, hidden rather than
  removed, and a ref callback (`setVideoEl`) hands the stream to whatever node
  exists — unmounting it for the review shot left React building a fresh element
  with no camera attached, so every shot after the first was aimed at a black
  rectangle. `ensureCamera` re-binds on mode change, on `visibilitychange` and
  on a track's `ended`; `startingRef` keeps two `getUserMedia` calls from
  leaking a stream nothing can stop.
- **`permissions-policy` now says `camera=(self)`** (`main.py`). It was
  `camera=()`, which denies `getUserMedia` outright — no prompt, no actionable
  error. Microphone and geolocation stay fully denied, and `self` keeps every
  embedder out.
- **The «Allow camera?» sheet cannot be made permanent, so it is COUNTED.** The
  grant belongs to Telegram's WebView, not to the page: there is no web API and
  no Mini App API that says "always allow", and each `web_app` button opens a
  fresh WebView, so a leader is asked once per task by construction. What the
  page owns is how many sheets ONE open costs — and the original probe-then-
  correct pass cost two, because every `getUserMedia` call raises its own.
  `startCamera` now opens the REMEMBERED lens (`proof.camera.lens2.<facing>`)
  in a single call, having first checked that id against `enumerateDevices` (which
  never prompts): an id the phone no longer has would prompt AND fail, i.e. two
  sheets to land where the plain path begins. A `NotAllowedError` re-throws
  instead of falling through — a refusal is the leader's answer, and re-asking
  with different constraints is a second sheet for the same «no». **Never split
  the open back into probe-then-correct**, and never add a third call.
- **A BLACK viewfinder must always say which black it is** (leaders' report,
  2026-08-29). Three different states painted the same rectangle — still
  opening, opened but sending no frames, and a working camera pointed at
  something dark — and none of them said anything, so the whole class reached
  the operator as «the camera isn't working». Three rules now hold, and each
  closes a path that had NO way out:
  - **The one-at-a-time guard is releasable.** `getUserMedia` inside Telegram's
    WebView can simply never settle (the leader backgrounds the app while the
    «Allow camera?» sheet is up), and `startingRef` was then stuck true for the
    life of the page: the mount, `visibilitychange`, the track's `ended` and the
    Retry button all returned at it. An attempt now carries `OPEN_TIMEOUT_MS`
    and an `attemptRef` token — the deadline frees the guard, and a superseded
    attempt stops its own stream instead of attaching it or reopening a newer
    one's guard. The mount effect's cleanup retires the in-flight attempt too,
    which is also what makes a flip pressed mid-open work.
  - **Frames are the test, not `readyState`.** A track sits at `live`, unpaused
    and attached, while the WebView delivers nothing — what Android leaves
    behind after another app takes the camera. `ensureCamera` measures
    `videoWidth` + `currentTime` against `FRAME_STALL_MS`: ONE silent re-open,
    then `camErr = "stalled"` with the button. Never restart forever behind a
    black screen.
  - **Events are not enough** — a track can end with no event at all — so the
    viewfinder is also looked at on a `CAM_WATCH_MS` heartbeat while it is on
    screen. And the shutter is DISABLED until a frame has arrived: `capture`
    returns silently without `videoWidth`, so an armed-looking button that did
    nothing was the last thing the leader was left with.
- **The camera is only ever opened ON SCREEN** (2026-09-17, found by the first
  camera report). A request made from the background cannot finish — nobody can
  answer «Allow camera?» there, and Android does not hand the camera to an app
  it cannot see — so it hung for `OPEN_TIMEOUT_MS` and greeted the returning
  leader with «Kamera tasvir bermayapti» over a camera that was never broken.
  The report showed exactly that: the page went to the background at 54 s, the
  watchdog read the paused picture as a dead camera at 64 s, re-opened from the
  background, and failed at 84 s. Three rules now hold:
  - **Off screen nothing opens.** `startCamera` puts the request off
    (`deferredRef`) instead of calling getUserMedia, and `ensureCamera` does not
    measure frames at all while hidden — the WebView pauses the picture itself,
    so silence there says nothing about the camera. The stall clock restarts
    from zero on every visibility change.
  - **`settleReturn` is THE way back, and it runs on every return.** An open
    that was put off is made; a failure raised while hidden is cleared (and was
    never reported — `failRef.hidden`); an open that was still in flight when
    the page left gets `RETURN_GRACE_MS` to finish, because its «Allow camera?»
    sheet may only now be in front of the leader, and is replaced only if it
    does not. Never two camera requests at once: a second one on top of a sheet
    still up is a second sheet, or none. The watchdog stands aside
    (`returningRef`) until the return is settled.
  - A failure that happens ON SCREEN after the return is a real one: it stands,
    and it is reported.
- **A page that is not on screen LETS THE CAMERA GO** (2026-09-18, from the
  first «Kamera tasvir bermayapti» report to name its cause). Android hands the
  camera to ONE client at a time and Telegram MINIMIZES a mini app rather than
  closing it, so every proof page a leader opened this shift was still a page
  holding a camera — and the third task's `getUserMedia` queued behind them.
  In the report it answered after **17.4 s**, with two sibling «SOP standarti»
  pages six hours old reporting live cameras from the background. Three rules:
  - **`releaseCamera` on a `HIDDEN_RELEASE_MS` (15 s) grace, and at once on
    `pagehide`.** The grace is the point: re-opening costs another «Allow
    camera?» sheet, which is the one cost this page is built to keep down, so a
    leader glancing away pays nothing while a page left behind stops being the
    next task's problem. Nothing new re-opens it — `ensureCamera` already opens
    a live viewfinder with no stream, so the camera comes back when the
    VIEWFINDER does and not merely when the page does.
  - **A sibling asks, and a hidden page answers at once** — `announceNeed` on
    the BroadcastChannel the presence ledger already uses, and every open waits
    `NEED_RELEASE_MS` (350 ms) for it before asking Android. A page nobody is
    looking at has no claim on the camera, and asking is instant where waiting
    for the OS to arbitrate is what those 17.4 s were.
  - **The open deadline ends at the STREAM, not at the picture.** It asks one
    question — did Android answer — so it is cleared the moment the stream is
    adopted; whether a picture ARRIVES is the frame watchdog's question, with
    its own clock and its own silent re-open. Left running across that line it
    judged both, and 17.4 s of a 20 s budget left too little for the rest: a
    camera that had just opened was reported as one that never did, and the
    leader was shown a failure screen over a working viewfinder. For the same
    reason `play()` is **never awaited** (on a stream sending no frames it never
    settles, and awaiting it held `startingRef` shut, which stands the watchdog
    down — so the check that would have named the failure never ran) and the
    lens correction is bounded by `LENS_FIX_MS`.
  - **A camera that is BUSY is retried, not reported** (`BUSY_ERRORS` —
    NotReadableError · AbortError · TrackStartError · SourceUnavailableError,
    `BUSY_RETRIES` 2 at `BUSY_RETRY_MS`, re-announcing the need each time).
    That error names another holder, not a broken camera, and a sibling too
    frozen to have heard `announceNeed` is usually let go of by Android a
    second or two after being asked. A failure screen there costs the leader
    their shot and puts a DM in front of an admin for a camera that was about
    to be free. `NotAllowedError` is deliberately NOT in the set: a refusal is
    the leader's answer, and re-asking is a second sheet for the same «no».
  - **`OPEN_TIMEOUT_MS` is 45 s and it is a CEILING, not an expectation.** At
    20 s it sat three seconds past the honest worst case, so a slow answer
    became a failure screen — and a leader who reads one backs out and re-opens
    the task from the bot, which leaves ANOTHER page holding the camera and
    makes the next open slower still. What it catches now is a camera that
    never answers at all. The waiting is carried by words instead: past
    `OPEN_SLOW_MS` (9 s) the viewfinder says it is still opening and that
    another window may be holding the camera, and asks them not to leave. That
    line is the one thing that breaks the loop.
  - **A holder no longer makes the next open SLOW — it makes it BLACK**
    (2026-09-18, the second report). Android hands the second client a live
    1920×1080 track in under a second and then delivers no frames at all, so
    the contention now arrives as `no_frames` rather than a long open. Two
    consequences. `HIDDEN_RELEASE_MS` is **3 s**, not 15: the cost of holding
    went up and the cost of re-opening is near zero — the «Allow camera?» sheet
    belongs to the WebView and is raised at a page's FIRST open, and that same
    report shows two `getUserMedia` calls on one page answered in 933 ms and
    834 ms, which is not a leader tapping «Allow». And a stalled viewfinder
    **asks the holder and waits `HOLDER_ASK_MS` before re-opening**, instead of
    re-opening blind into a second zombie, which is what that report did twice
    in nineteen seconds.
  - **The pending release is NOT cleared by the effect's cleanup**, and that is
    load-bearing. That effect re-registers whenever `settleReturn` changes
    identity, which follows `ensureCamera`, which follows `mode`, `camErr` and
    the task query — so a background refetch landing while the page was hidden
    cancelled the release and left the camera held for good, which is the state
    the whole section exists to end. The timer re-checks that the page is still
    hidden, so a duplicate is harmless where a lost one is not. It is also
    armed on Telegram's own `deactivated`, since minimizing is not always a
    `visibilitychange`.
  - **`held` is a screen of its own, and it is AMBER.** When a sibling page
    ANSWERS the channel saying it still holds the camera, that is the whole
    failure, and nothing on this page can close another of Telegram's windows —
    only the leader can. So it is named, with the one action that works («close
    the other camera window, then Retry»), instead of «the camera sent no
    picture», which is true and leaves them nothing to do. It is still
    REPORTED: a holder that will not let go after being asked is exactly what
    an admin needs to know is still happening.
  - **A device with NO camera is an ANSWER, not a fault, and is not reported.**
    On 2026-09-18 a leader opened a camera proof from Telegram DESKTOP on a
    Windows PC: zero video inputs, `NotFoundError` in four milliseconds, and an
    admin was DMed about it. Nothing there is for an admin to fix. Same rule
    `NotAllowedError` already keeps — a refusal is the leader's answer — and the
    test is the CAMERA COUNT, never the error name: a `NotFoundError` on a
    device that does list cameras is a real fault and still reports, and an
    unknown count reports too. The screen also stops offering «Qayta urinish»
    as its action there, since retrying fails again in four milliseconds; the
    way out (close, and open the task on the phone) is the action, with retry
    underneath it for a webcam somebody has just plugged in.
    **The screen carries the whole explanation, because nobody else is told.**
    It says what is missing, why this task needs it and where to go instead —
    and on a DESKTOP Telegram (`DESKTOP_PLATFORMS`, matched on the mini app's
    own `platform`) it names that too, since «camera not found» reads as a
    broken camera to somebody sitting at a computer. An unrecognised platform
    (a plain browser answers «unknown») keeps the general wording, which is
    true either way.
    **Neither of the not-a-fault screens is painted red** (`notAFault`): this
    one and `held` are both answered by the leader, and red is what the page
    says when something is wrong with it.

- **A camera failure REPORTS ITSELF to the admins** (2026-09-17, the
  operator's directive, after the first «Kamera tasvir bermayapti» reached us as
  a leader's screenshot — which says what happened and nothing about why, and
  the why exists only on that tablet). `utils/cameraDiag.js` gathers,
  `services/camera_report.py` lays it out, and it travels through the ONE
  client-failure door, `POST /api/crash-report` with `kind: "camera"` — never a
  new endpoint.
  - **The page keeps a flight recorder** of every camera event (why each open
    started, every getUserMedia with its path and answer time, the settings the
    stream opened at, `mute`/`unmute`/`ended`, `play()` rejections, video
    dimension changes, page visibility, Telegram `activated`/`deactivated`), and
    `failRef` names WHICH check put the failure screen up — `open_timeout`,
    `no_frames` or `gum_error`, three different failures behind two screens.
  - **On a failure screen (never on «denied»: a refusal is an answer) it probes,
    then posts** — device model and Android / WebView / Telegram versions (the
    Telegram-Android suffix of the user agent names the tablet), the camera
    list, the stream's settings, capabilities and state, one frame read straight
    off the stream through a CLONE (tells a camera that sends nothing apart from
    a page that does not show what it sends), the same stream re-asked for
    640×480 through `applyConstraints` (tells a size the device cannot deliver
    apart from a camera dead at any size), and the other camera pages of the
    same Telegram, asked over a BroadcastChannel and read from a localStorage
    ledger (a MINIMIZED camera page still holding the camera). The DM leads with
    a «Likely cause» and prints every fact it was drawn from under it.
  - **Every step of an open names itself BEFORE it waits** (2026-09-26, after
    three reports of the same failure that no reader could settle). A request
    that never settles writes no result line, so the timeline of a hung open
    named no step at all: `ask` (per `getUserMedia` path) and `list` (the
    device enumeration) are written ahead of their awaits, and at
    `OPEN_SLOW_MS` the page reads what it can WITHOUT asking — `accessState`,
    permission state plus how many listed cameras carry a label, since
    Chromium hands an ungranted page one unnamed videoinput per kind, so an
    unnamed list IS «no grant yet». **FOCUS is the prompt signal**: Telegram's
    «Allow camera?» sheet leaves the page VISIBLE and merely takes focus, so a
    `focus` baseline at every open plus window blur/focus rows (and `perm`
    transitions from `watchPermission`) are the only way to tell a prompt
    nobody answered from a prompt that never appeared. `camera_report._stalled_step`
    turns those rows into the verdict's second sentence and falls back to the
    old both-possibilities wording for a bundle that carries none of them.
  - **`_last_open` tests for a START positively** (`" · "`, i.e. «why · which
    lens» — the one row `startCamera` writes) rather than excluding a list of
    endings. It used to answer with the «slow» row on every report that
    reached the 45 s screen, which silently narrowed `_hidden_during_last_open`
    to the rows after the ninth second: a page that went to the background
    before that read as one that never left the screen.
  - **The probes never ask and never hold.** No getUserMedia is called, so no
    «Allow camera?» sheet; the clone's release is parked on `probeHoldRef` and
    `startCamera` calls it FIRST, because a clone left running keeps the dead
    source alive under the leader's retry; and a page not on screen runs no
    probe at all, since touching the camera from the background could take it
    from the page in use. The 640×480 probe runs only on a stream the page has
    already given up on — whatever it finds, Retry replaces that stream.
  - One DM per person per failure kind per page visibility per hour (the person
    is in the fingerprint: leaders on identical tablets share a user agent); at
    most three reports per page. The leader sees one muted line,
    `proof.cam.reported`, and only once the server HAS the report.
  - **A camera request nobody answers is cleared by a RELOAD, never by asking
    again** (2026-10-05, a Galaxy Tab A9: `getUserMedia` asked, 45 s, no
    answer, no sheet). Chrome serves a page's camera requests one at a time,
    so a Retry on the same page only queues behind the stuck one; a reload is
    a new page and the WebView cancels the old request. So: once a request
    has hung `HUNG_RELOAD_MS` (20 s — past the slowest open that ever
    succeeded, 17.4 s) with the page visible, in live mode and nothing in
    front of it (no `blur`, or focus back ≥ 3 s), the page reloads ITSELF,
    once — the note in sessionStorage (`proof.camera.hungReload`, 10 min) is
    what stops the next page reloading too, and an automatic reload whose
    note cannot be written is not made. `settleReturn` reloads the same way
    when the request it waited on is still unanswered. The 45 s deadline now
    has its own screen, «Kamera javob bermadi» (`hung`, not «no picture»);
    its Retry always reloads, and on a page that is already such a reload the
    screen says to close Telegram completely and reopen the task. The report
    prints «This page is a reload…» (`opens.reload`) and says a fresh page did
    not help. **Focus proves nothing on a page that never had it**: the same
    report's open began with focus «not on the page» and no blur ever came,
    so `_stalled_step` no longer reads that as «nothing came up».
  - **Reading a screenshot of this page without a report:** the stamp sits on
    the picture box, and the box is shaped by `camAR`. A SQUARE box is Chrome's
    2×2 black placeholder — the frame a video renders when its stream ENDS
    before delivering one real frame — so the camera never sent a single frame
    on that page. It is not a freeze after working.
- **The main lens is chosen TWICE, because 0.5x arrives two different ways**
  (user, 2026-08-20 — a pilot phone opened on the ultra-wide). A phone that
  exposes each rear sensor as its own DEVICE is answered by label: `lensScore`
  ranks the candidates (iOS «Back Camera» / Android «camera2 0» win; a fused
  «Dual/Triple» device is second choice, because which member it opens on is
  the phone's decision; ultra/tele/macro/depth lose outright) and the BEST one
  is opened, never the first that matched something — «facing back» describes
  the ultra-wide exactly as well as it describes the main sensor. A phone whose
  rear camera is ONE fused device cannot be answered that way at all: the
  device the labels picked really is the main camera, it is simply pointed at
  its widest member. `useMainLens` therefore pulls the OPENED track to
  `zoom: 1` whenever its capabilities report a range starting below 1 — an
  `applyConstraints` on a stream already held, so no second `getUserMedia` and
  no extra sheet, and it carries `VIDEO_SIZE` with it because
  `applyConstraints` REPLACES the set the track was opened with. The range is
  also the guard: zoom counted in percent (min 100) or a phone with no
  ultra-wide (min 1) never enters the branch, and an iPhone reports no zoom at
  all. Two more rules bought the same day: **blank labels answer NOTHING** —
  some WebViews never fill them in even after the grant, and choosing by
  POSITION there is how a phone gets pinned to its 0.5x lens, or its front one,
  for good — and `LENS_KEY` is VERSIONED (`proof.camera.lens2`), because a lens
  already remembered under an older rule is unreachable any other way. Bump the
  key whenever the rule changes its mind.
- **The `/leaders` bot-day merge gained ONE bounded exception** — `leader_bot.merges()`
  is now THE rule and both readers (the register, the photo proxy) call it.
  Shift 2 merges as it always did; a shift-1 unit merges only when it is
  ENROLLED in camera capture (`camera_units()` — any task on camera at any level
  of its chain) **and** the day is `MERGE_FROM` (2026-08-19) or later. Camera
  proofs are collected in the bot by construction, so without this the platform
  would demand a proof in a mode it chose and then display it nowhere; with the
  two bounds, a shift-1 unit that never touches the camera reads exactly as
  before, and enrolling one later cannot resurrect bot days it closed months
  ago. Widening this to "every bot day" was tried first and reverted: it
  silently rewrote the register for units that had nothing to do with the pilot.
- **A unit may REHEARSE before its bot filings count** —
  `LeaderUnitSetting.bot_from`, the day the bot layer takes over for that unit,
  set in «Brigada sozlamalari» beside `per_task_close` (ONE endpoint, `PUT
  /admin/leader-tasks/unit`, because they are ONE row and two parallel writes
  race its key — the same trap the five ltasks task fields fell into). A unit is
  enrolled in camera capture on the day somebody has time to teach it, and the
  leaders spend that day learning where the buttons are; without a floor that
  fumbling IS the record. Before it the register, the score and the day report
  all keep reading the Google-Form row, and `leader_reports` PARKS the bot day's
  report so no score DM contradicts the register. `merges()` clamps the floor
  against `MERGE_FROM` (it can only ever move a day LATER, never resurrect one),
  and `training()` is deliberately NOT `not merges(...)`: every shift-1 unit
  outside the pilot fails the merge too and has always been reported, so
  "rehearsal" means only a day an admin explicitly declared practice. Refused
  for shift 2 — it files ONLY in the bot, so there is no fill-out row underneath
  to fall back to. **Nothing from a rehearsal day reaches Gemini** (user,
  2026-08-20): all three queue doors — `discover`, `queue_report`, `queue_task`
  — refuse it, `undiscovered()` excludes it so «N tekshirilmagan» does not
  promise rows the button never takes, and saving a window calls
  `leader_ai.drop_rehearsal_pending`, which deletes what was queued in the hours
  before the admin declared it (never-judged rows only — `reviewed_at IS NULL
  AND resolution IS NULL`, the paused-shift purge's rule; `discover()` re-finds
  every ref if the window is cleared). The one door left open is `force=True`,
  the admin's per-task «check now» — same carve-out as the shift pause.
  **Enrolment does not open the window — somebody must set it**, and on the
  pilot's first unit nobody did: camera went on, `merges()` counted the unit's
  bot days from `MERGE_FROM`, and 20 Aug read the practice run (a leader at
  10%) instead of the Google-Form row the unit filed properly.
  `startup.set_camera_pilot_bot_from` (flag
  `leader_camera_bot_from_2026_08_21_v1`) is the one-shot that set the floor to
  **2026-08-21** — bounded to camera-enrolled non-shift-2 units that actually
  hold closed bot days inside the exposed window, never lowering a floor, and
  aborting outright if camera is set globally. It writes config only: the bot
  days keep their photos, entries and verdicts and reappear the moment an admin
  moves the window. Moving the date needs a NEW flag key, same rule as the
  review floor. **A day already reported keeps its DM** — a score that went out
  before the floor moved cannot be recalled, and `build_report_row` still
  renders a rehearsal day's bot report for anyone holding that link.

Related memory: `leader-camera-proof-pilot`.
