# «Yordamchi» and the AI keys

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## «Yordamchi» — the AI assistant (`/assistant`, the header panel)

From **2026-10-05** (the operator's rulings, asked in three rounds) an AI
assistant answers anything about the platform and does the user's work for
them — «Yordamchi» (ru «Помощник», en «Assistant»). It answers on the key and
model the «AI kalitlari» tab gives feature «assistant» (Gemini or Claude) and
turns voice into text on feature «voice» (Gemini only); until 2026-10-19 both
were fixed — Gemini Pro and Gemini Flash. Page key `assistant`, **admin-only until the operator opens it** — plus any
tab an admin opened AS somebody else (the `imp` claim), which is how it is
tested inside another person's permissions. Never during an exam (the client
hides it, the server refuses `X-Exam-Attempt`).

- **It acts THROUGH THE USER'S OWN SESSION — there is no second permission
  model.** `services/assistant_api.call` makes an ordinary in-process request
  (`httpx.ASGITransport`) to an ordinary endpoint with the headers the user's
  own request carried (`FORWARD`: token, initData, ghost mode, IP, UA). Every
  permission check, factory lock, row scope and closed-day lock applies to it
  by the same code; a 403 is relayed as «you may not». Never give it a token
  of its own.
- **`assistant_api.access_of` is THE policy** on top of that, per concrete
  request (method + path + body): `read` (every GET — runs), `export` (a file
  the page would hand over — runs; a download in a browser, a DM in
  Telegram), `write` (any other change — NEVER runs directly), `blocked`,
  `hidden`. **Off-limits even with a Confirm** (the operator's answers):
  `danger`; logins, passwords, API keys and platform settings (`credentials`,
  `settings` — `PUT /admin/settings` is open for the colour-band keys alone,
  «Rules & configuration»); mass messages (broadcasts, lessons, notices,
  forecast calls); **deleting anything** (every DELETE, every action key
  naming a removal, a deletion request's APPROVAL); people & access (profiles,
  roles, page access, capabilities, factory assignments, idle owners); the
  exam; and any route the action register cannot classify. **Allowed after
  Confirm**: tasks, concerns, comments, ojidaniya entries, appeal rulings,
  attendance & HR documents, production data (ПЛАН/ФАКТ, people, Ish grafigi,
  catalog, an attached SAP file), rules & configuration (checklist settings,
  wage rates, colour bands, the cells register, shift times). It classifies
  by the action register's category (`action_log.classify`), so a new endpoint
  lands in a class the day it ships; `_RULES` holds the exceptions.
- **Changes wait for the user.** The model must call `propose_changes`; the
  run PAUSES (`awaiting_confirm`) with a plan card, every change ticked; the
  user unticks what they do not want and presses «Tasdiqlash (n)». Each
  change is then made in order, re-checked against the policy WITH its body,
  and its result (✓ / ✗ with the server's reason / skipped) is handed back so
  the model reports what really happened. A new message while a plan waits
  cancels it (`superseded`) — nothing changes.
- **Every change it makes is in the Jurnal** under the user, with source
  «Yordamchi orqali» (`assistant`) — set only when the `X-Assistant-Run`
  header carries a valid HMAC (`sign_run` / `verify_run`), so the label cannot
  be forged. Talking to it is not recorded (`_SKIP`); its key save is.
- **Knowledge = this rule book** (`services/assistant_docs.py`): `CLAUDE.md`
  + `docs/zagruzka-and-ojidaniya.md`, split by `##` section, developer-only
  sections dropped (`_SKIP_PREFIXES`), the contents in the system prompt and
  a BM25 search over Latin-folded, stem-cut words (`search_docs` / `read_doc`).
  **Re-check that choice before opening it to non-admins** — the rule book
  names internal decisions. Live data: `api.index_text()` (every path it may
  use, by area) + `find_endpoints` / `describe_endpoint` (docstrings, params,
  body schema from the route itself).
- **Which AI answers** is decided on the «AI kalitlari» tab, nowhere else
  (see «AI keys, and which feature runs on which»): its own ⚙ card is gone,
  and its sealed key (`assistant_gemini_api_key`) was copied into the key
  store at the 2026-10-19 boot, where the chat kept running on it (deleting
  that row deletes the old setting with it). A run is stamped with the model
  it started on. This month's calls and tokens are on that tab («Shu oy»).
- **Engine** (`services/assistant.py`): an asyncio task on the server loop;
  the whole state is in `assistant_runs` (Gemini contents kept VERBATIM —
  Gemini 3 function calls carry thought signatures it validates; a Claude
  turn keeps its raw blocks beside them, `assistant_claude`), so a
  Confirm landing on the other blue-green copy resumes there. ≤ 18 model
  steps and 7 minutes per reply (a resumed reply keeps what it spent, plus
  at least two minutes), ≤ 2 running per person, 8 overall.
  Earlier turns are replayed as TEXT (asked / answered / plan summary), never
  tool traffic.
- **An answer survives a deploy** (2026-10-19, the operator: «Загрузка қандай
  ҳисобланади?» sat on «thinking» for 5 minutes — not a hard question: the
  12:21 deploy retired the worker mid-answer). uvicorn re-raises SIGTERM
  after its shutdown and BEFORE asyncio cancels leftover tasks, so a run's
  own `except CancelledError` never ran on a deploy and the run sat
  «running» until the old 6-minute staleness rule ended it. Now:
  - **A ticker beats every `BEAT_S` (15 s)** while a run's task lives, the
    Gemini call included; `STALE_S` is 75 s.
  - **`handoff()` runs first in the lifespan's shutdown** (before
    `boot.join`): a run waiting on the model is cancelled at once, one making
    confirmed changes finishes the change in hand and stops before the next
    (≤ 8 s, then cut); each leaves its heartbeat at 2000-01-01, i.e. stale at
    once.
  - **The owner's next read picks it up** — `revive`, from `GET
    /threads/{id}` (polled every second) or `send()`: ONE conditional UPDATE
    claims it (one reader wins) with a new `lease`, and the loop continues
    from the last saved step on the new process (measured locally: handed off
    13:00:13, resumed 13:00:15, answered). Only in the session the run
    started in, within `RESUME_WINDOW_S` (30 min) and `MAX_RESUMES` (3);
    otherwise it is ended «interrupted» (`end_stale`). Nothing resumes while
    nobody has the chat open — the next open does.
  - **`assistant_runs.lease` fences every write** (`_fence`: the driving
    task's lease is checked under a row lock in `_save`, `_resume_with`,
    `_beat`, `_hand_off`), so a process that lost the run — the old worker
    still draining, a loop frozen past 75 s — writes nothing more
    (`LeaseLost`). Column added by `startup.add_assistant_run_lease` (both
    entrypoints, `run` phase).
  - **Confirmed changes are never made twice.** `begin_execute` is one
    conditional UPDATE (a double tap or a second tab gets 409). A plan picked
    up after a restart keeps every outcome already recorded, reports the
    change that was in flight as «unknown» (`restart_unknown` — it may or may
    not have applied; the report says to check its page) and makes only the
    ones never started.
  - **Stop is immediate**: a thinking run's task is cancelled on the spot
    (`stop_now`, `_LIVE`); during confirmed changes it stops before the next
    one (`_stop_plan`, «To'xtatildi — kiritilmadi»); a run no process drives
    is ended stopped. A stopped run is never resumed.
  - **One Gemini call is bounded**: read timeout 150 s, NOT retried (the same
    question thinks just as long again and is billed twice), `DEADLINE_S`
    240 s over all retries → error `slow`. Network errors and 5xx keep two
    retries, a 429 one. Each call logs the model version, seconds and
    thought tokens. The thinking level is NOT set — untested, a wrong value
    would 400 every call.
  - **The chat says what it is waiting on** (`live_state` on `run`: `phase`
    model · tool · retry · executing · stopping · stalled, `phase_s`, `retry`
    {n, why}, `resumes` / `resumed_s`, `stop_asked`, `alive`), never a
    judgement about the question: «AI javob bermadi — qayta so'rayapman
    (2/3)», «Server yangilandi — javob shu yerdan davom etmoqda», «AI xizmati
    hozir sekin javob bermoqda» after 60 s on one call. The old «Murakkab
    so'rov bir necha daqiqa olishi mumkin» — a plain 30-second timer that
    blamed the question — is gone; «interrupted» no longer claims a server
    update.
  - Known limit: uvicorn drains open requests before the lifespan shutdown
    with no bound; a drain past the supervisor's 60 s ends in SIGKILL, and
    then the 75 s staleness rule is the fallback.
- **Chats belong to the acting PROFILE** (`owner_key`) and, in an «open as»
  tab, to the admin who opened it (`opened_by`) — only their author ever
  sees them. Files (`assistant_files`, bytes in the DB, owner-only): images,
  PDF, xlsx (read into rows), csv/txt, ≤ 20 MB, ≤ 5 per message; out:
  `make_excel` or an export endpoint. Voice: a 16 kHz WAV recorded in the
  page (`useVoiceRecorder`, not MediaRecorder — Gemini reads neither WebM nor
  MP4), sent at once, its transcript is the user's bubble. The microphone is
  allowed for this origin (`permissions-policy`); the Android app grants only
  the camera, so the mic is hidden there until an APK says `__safiaApp.mic`.
- **UI**: `context/AssistantContext.jsx` (above the routes, like the exam);
  `components/assistant/` — `AssistantPanel` (the header button; the panel
  DOCKS at ≥ 1280px through `--assistant-dock`, which Layout's column pads
  by; overlays below; full screen on a phone), `Chat` (shared by panel and
  page; polls every second while a run works, never at rest), `Message`,
  `PlanCard`, `Composer`, `Markdown` (React nodes only, never innerHTML),
  `ThreadList`; `pages/Assistant.jsx` is the full page.
  The page context sent with each message: route, query, global filters,
  plant, and the pages this person can open.
- **An answer is never waited for blind** (2026-10-17). The context WATCHES
  the chat whose answer was asked for last (`watchTid`, sessionStorage): while
  it works out of sight (panel closed, another page, another chat on screen)
  it re-reads that thread every 3 s; the header button spins, then wears the
  bell's gold dot once the answer is ready or a plan waits, and a toast says
  so with «Ochish» (the `Toast` template's `action`). Only a change it SAW
  (working → finished) is announced; a reply the user stopped is not. The
  working line prints the time so far — the server's `run.elapsed_s` (from
  the run's start, or from the Confirm: `begin_execute` stamps `since`)
  ticked on by the local clock — and from 60 s says the reader need not wait
  on this page («Kutish shart emas…»). A waiting plan puts a line above the composer saying a
  new message cancels it. A finished answer and each table carry a copy
  button (`CopyButton`, `utils/copyText.js`): plain text, tables
  tab-separated. The empty chat's questions follow the PAGE the panel is
  open on (`components/assistant/tips.js`, keyed by the route's first
  segment; the full page gets general ones). The header button keeps the
  bell's size; on a phone an invisible pad takes its tap area to 44px.
- **An answer's SHAPE follows its question** (2026-10-19, the operator: «it
  needs to think what type of answer will be more comfortable»). The prompt's
  «HOW AN ANSWER LOOKS» (`services/assistant.py` `_RULES`, rule 8 points to
  it) has the model first decide the KIND of question — one figure · yes/no ·
  ranking · list of records · trend · how it is calculated · how do I · why ·
  what is · several at once · nothing to show · a change — and answer in that
  kind's shape: the first line IS the answer, only figures read with a tool
  (never an estimate or an example value), the version of a figure the page
  context names else the page's default (named — it cannot see a page's own
  toggles), bold only the key figure (at most three, never a person's name, a
  label or a table cell), UI names in «», every figure with its unit, day and
  whose, dd.mm dates, thousands with a space, «—» for a missing figure,
  at most 3 table columns and 12 rows (more → the top 10 and an Excel offer),
  no text before a change plan (its labels are the preview). Its examples are
  Uzbek with made-up figures: shape only. Tested by two dry runs (15 questions
  each in uz / uz_cyrl / ru / en, written by the guide, judged; the second
  chose the right shape for all 15, and the nine contradictions its judge
  found were fixed) — not on Gemini: the local key had no credit. `components/assistant/Markdown.jsx` draws what the guide allows: a
  "> " summary box, a "> [!WARNING]" caution box («Diqqat», and the copy says
  so), nested lists (two-space indent) whose items may hold their own table,
  box or code, numbered steps that keep counting across a blank line, a
  "---" rule, figure columns right-aligned and unwrapped (never the first
  column, never dates; Cyrillic units, «3/5» and «87%*» are figures), a
  closing «Jami / Итого / Total» row set apart, and more than 12 rows folding
  to 10 behind «Yana N qator» (the copy takes every row). An in-answer
  [label](/route) link hands the route to the panel (it used to navigate and
  then bounce back). A new Markdown element is a renderer change AND a line in
  the guide — never one without the other.

- **It makes ANY document, and it computes before it writes** (2026-10-19,
  the operator: «The AI assistant should be able to create any kind of
  documents when it's asked even when we don't have a template for it» — it
  had answered «Give me excel file» on the «Samaradorlik» table, which the
  browser computes and nothing exports, with «21 brigadir × 30 kun by hand is
  not reliable, so I gave no file»). Two tools, one rule:
  - **`make_document`** (`services/assistant_documents.py`) builds **docx ·
    pdf · pptx · xlsx · csv · md · txt · html** from ONE block model —
    heading · paragraph · bullets · numbered · table · facts · quote ·
    page_break — in one house look: the title, a muted subtitle (period ·
    scope · the day), a gold header row with white text, zebra rows, numbers
    right-aligned, columns sized to what they hold (never a two-column table
    stretched across a slide), a quiet «Safia IMS · dd.mm.yyyy» footer. In a
    deck every level-1 heading opens a slide and a long table continues with
    «(davomi)»; in a workbook every table is a sheet. `make_excel` stays as
    the spreadsheet shorthand. Word is python-docx, PDF is fpdf2 on the
    server's Unicode TTF (the camera stamp's `downtime_card._find_font`;
    none → the tool says to make a Word file), slides are python-pptx. The
    rendered look was checked through LibreOffice before it shipped.
  - **`compute`** (`services/assistant_calc.py`) runs the model's short
    Python over the data it fetched. Every `call_api` JSON answer is kept
    WHOLE for the run as `r1, r2…` (24 MB a run, 96 MB a process, in memory,
    dropped when the run ends — a run picked up on another process after a
    deploy finds none, and the tool says to fetch again), a result is kept as
    `c1, c2…`, and a table block or a sheet takes `rows_ref`, so a figure
    goes from the endpoint into the file without the model retyping it. The
    sandbox is a subprocess (`python -I -S`, 10 s CPU, 1 GB, 15 s wall, no
    imports, no files, no network, no `__` anywhere in the source — the text
    is checked, not only the tree, since a format string carries one — and a
    whitelist of builtins; math, statistics, re, json, itertools, dates,
    Counter, Decimal by name). The assistant is admin-only, and running a
    model's code on the server is the second reason to re-check that before
    opening it.
  - **A document the platform has a TEMPLATE for comes out IN that template**
    (2026-10-19, the operator, shown the «Samaradorlik» month as a bare sheet
    with filter arrows: «If there's template for it, use that template»). A
    table of whole percents per brigadir (cell, plant) per day or period —
    загрузка, samaradorlik, reja bajarilishi, the comparison tables' P / A /
    D, davomat — is a **`grid` block** of `make_document` (or a `make_excel`
    sheet carrying `bands`) and is laid out by `grid_export.lay_out`, the
    very module the «Excel» button on /zagruzka draws its file with: the
    title, the scope line, «Tayyorlandi: …», the gold header, every cell
    FILLED with its band colour under a `0"%"` format, «—» blanks, hatched
    pending days (⏳ 👥 📄), the AVG · MIN · MAX summary column (the
    heatmap's `rowStat`: each cell rounded first, then the mean), unit rows,
    the legend (`segmentBands` / `diffLegendBands` wording), frozen panes,
    landscape. `bands` names the /zagruzka table whose edges the cells wear
    — load · fulfil · eff · full · full90 · simple (kind `pct` for P or A,
    `diff` for D) — read by `assistant._read_band_scales` from the admin's
    own settings (`routers.settings.ZAGRUZKA_BANDS`), so the file is coloured
    exactly as the screen is; `att` is /workers' fixed davomat scale (the
    twin of `statusBands.ATT_SEGMENTS`), `default` the platform's defaults,
    a list of `{from, color}` a scale of the model's own. The fixed words
    («Tayyorlandi», «Ranglar», «O'RT»…) follow the run's UI language
    (`GRID_WORDS`, `_run_lang`). **Every assistant workbook wears the house
    look** from the same day — the plain `make_xlsx` sheet (a bold header on
    a soft band, filter arrows, nothing else) left its doors: `build_xlsx`
    opens every sheet with the title, the scope line and «Tayyorlandi»; a
    table gets a gold upper-case header, thin rules, zebra rows,
    right-aligned numbers under number formats, «—» blanks, a frozen header
    and name column and an autofilter; `make_excel` builds through the same
    `build_xlsx`, so the two tools cannot drift. Where no cell can be filled
    (docx, pdf, pptx, csv, md, txt) a grid is a table of percents cut into
    the chunks of days a page holds (8 for PDF and slides, 12 for Word; the
    summary over the WHOLE period on the last chunk; «…» for a pending day in
    the PDF, whose one font has no emoji); the HTML keeps the colours. Rule
    11 and shape M say the template wins; a page's own export endpoint still
    wins where it matches the ask exactly.
  - **Rule 11 and shape M of the prompt**: a missing export is never an
    answer — fetch what the page reads, derive what the page derives with the
    rule book's formula, build the file, and say in one line which formula
    and which source; never a table calculated in the model's head. A
    `compute` step wears a calculator icon in the chat's trail (`calc`).

## AI keys, and which feature runs on which («AI kalitlari», `/panel/aikeys`)

From **2026-10-19** (the operator, the day the proof reviewer got its key
list: «build a tab dedicated to AI API keys on the admin panel. On there we
store all API keys. On there we'll decide which feature uses which key and
which model. Remove API key saving or settings from other pages»; then, asked
one by one: all five features separately, every one switchable between
Gemini and Claude, a failure alerts and is switched by hand, and each row
shows this month's usage) every AI key the platform holds lives on ONE admin
tab, and so does the choice of key + model for every feature that calls an AI.

- **The tab** is `pages/admin/AiKeys.jsx`, «Vositalar» group, after «Verifix
  sinxron». Admin-only and NOT grantable (no `capKey`), and refused from an
  «open as» tab too (`routers/ai_admin._admin`, 403 `admin_only`): these doors
  hand out the platform's paid accounts. Two cards, read in the order the
  decision is made: «Funksiyalar — qaysi kalit va model» (one row per feature:
  key picker · model picker · status · this month) → «Saqlangan kalitlar»
  (provider · name · last four, who uses it, last test, this month; test /
  rename / delete as icon buttons; «Yangi kalit» opens the add form). Every
  write answers with the whole tab (`ai_features.overview`), so the page never
  re-derives a rule.
- **THE FIVE FEATURES** (`ai_features.FEATURES`, one row each in
  `ai_features`): `review` (the checklist proof checker, Lider nazorati → AI
  tekshiruvi), `assistant` («Yordamchi», the chat), `voice` (a voice message
  turned into text), `deck_ojidaniya` and `deck_concerns` (the two weekly
  PowerPoints' prose). Each may run on any provider it can speak — Gemini and
  Claude for all but `voice`: Claude takes text, images and PDFs, never audio,
  so the voice picker lists a Claude key DISABLED with the reason in its title.
- **Three modules, one job each.** `services/ai_keys.py` is THE key store (the
  2026-10-19 reviewer list moved here whole — the `ai_keys` table, the value
  SEALED with `web_auth.seal_password`, `hint` = the last four characters,
  the .env `GEMINI_API_KEY` as the one row-less entry `id: "env"`).
  `services/ai_features.py` is THE assignment — `resolve(feature)` (cached
  30 s, `invalidate()` on every write), `generate_json(feature, …)`, the
  ledger, the alerts, the seed. `routers/ai_admin.py` is the door
  (`/api/admin/ai`). **Every AI caller asks `ai_features`** and holds no key
  of its own: the reviewer (`leader_ai.review_one` resolves ONCE per row and
  stamps `LeaderAiReview.model` from it; `ai_review` is now a thin shim over
  feature «review»), both deck narratives (`deck_narrative`,
  `concerns_narrative`), and the assistant through `assistant_ai`.
- **A feature runs on exactly what its row says, nothing else.**
  `ai_features.key_ref` ("env", an `ai_keys.id`, or NULL = switched off) +
  `model`. There is no implicit «whatever Gemini key exists» any more. Off =
  the reviewer queues nothing and its AI tab shows a card pointing here; the
  assistant says no key is set (an admin gets a button here); a weekly deck
  ships with its plain fallback prose, never a failed deck. A row naming a key
  that cannot be opened reads «Kalit topilmadi» (`broken`).
- **Nothing moved on the deploy** — `startup.seed_ai_features` (flag
  `ai_features_seed_2026_10_19_v1`, schema phase `run`, RAISES on failure,
  both entrypoints; it replaced `adopt_legacy_ai_key`) wrote each feature the
  pair it ran on the day before: `review` its active key and that key's model
  (else the shared Gemini key on the shared model); `assistant` its own sealed
  key (copied into the store as a row, source «assistant») else the shared
  Gemini key, on gemini-pro-latest; `voice` that same key on
  gemini-flash-latest; both decks the shared Gemini key on
  `gemini.active_model()`. «Shared» is what `gemini.api_key()` answered
  before — the .env key, else the store's Gemini row (active first, newest) —
  and it is read BEFORE anything is copied in, or a freshly adopted row would
  become «the newest Gemini row». A feature with no key to take starts off.
  Later boots only add a row (off) for a feature the list gains, and leave
  every existing row alone.
- **Saving is checked, row by row, behind ONE button.** A pick is a DRAFT
  (`useAdminDirty` guards leaving) until the header's «Saqlash (N)» — in the
  card's header, beside where «Yangi kalit» sits on the other card, because a
  button at the end of a row scrolled off a laptop. Each changed row is sent
  on its own, in table order (`PUT /api/admin/ai/features/{feature}`
  {keyRef, model}), and checked first with ONE tiny real call with the pair
  (`ai_features.ping`): a key the provider refuses or a model it does not
  serve answers 400 `refused_key` / `refused_model` (`bad_model` for a model
  outside the provider's ids), NOTHING changes, the row keeps its draft and
  says why («Saqlanmadi · kalit rad etildi»); a check that could not finish
  (quota, network) saves the pick and says so. Rows still waiting read
  «O'zgartirildi — saqlanmagan» (the pair running now in the tooltip), rows
  being checked «Tekshirilmoqda…». Switching a feature off asks first and
  names what stops. A changed pair clears that feature's alert state; saving
  `review` arms and kicks the reviewer's drain. On a phone a change also pins
  the same buttons to the bottom edge.
- **Keys**: `POST /keys` {provider, key, label} — tested the moment it is
  saved (its provider's model list is read with it): a key the provider
  rejects is REFUSED (400 `key_refused`, on the field that caused it), a key
  already saved (the .env one included) is refused as `duplicate`, a quota or
  network failure stores it and names the failure. A new key runs NOTHING
  until a feature is moved onto it (the old «the first key switches the
  reviewer on» is gone). `PUT /keys/{id}` names it; `POST /keys/{id}/test`
  re-reads its model list (what its pickers offer); `DELETE /keys/{id}` is
  refused (409 `in_use`, naming the features) while any feature runs on it —
  the button is disabled with that reason — and refused (403 `env_key`) for the
  .env key. Deleting a row copied in from an old setting deletes the setting
  too, so nothing can still find the value. **A key is never returned
  whole**: the tab gets the hint; the action register gets the provider, the
  hint and the LENGTH (`config.ai_key_added` / `ai_key_tested` /
  `ai_key_renamed` / `ai_key_deleted`; `config.ai_feature_set` records
  provider · model · key hint before → after and the check's outcome). The
  assistant can neither see nor call `/api/admin/ai` (hidden + `blocked:credentials`).
- **Every call is counted** (`ai_features.record`, never raises; an async
  caller hands it to a thread): `ai_usage` holds one row per plant day ×
  feature × key × model — calls, ok, failed, tokens in / out — upserted on
  `uq_ai_usage_day`, and the feature's row keeps its last call, last success
  and last error (kind + the provider's own words). The tab's «Shu oy» per
  feature and per key reads it; the ledger starts on the first boot
  (`ai_usage_since`), and the column says «(19.10 dan)» while that day lies
  inside the month. Status per row: `ok` · `error` + the reason in words
  (limit · key refused · no balance · model not found · provider did not
  answer · too slow · no connection · unreadable answer) · `unused` · `off` ·
  `broken`. **The status describes the pair running NOW**: saving a feature
  onto another key or model clears the old pair's last call, success and
  error (`assign`; the month's figures stay in `ai_usage`), so the row reads
  «Hali ishlatilmagan» until the new pair is asked something. Until
  2026-10-19 the old error stayed on the row, and every re-pick looked
  broken before it had been used — the operator moved the assistant to Claude
  Opus, Claude Sonnet and back to Gemini Pro, saw «Xato» each time, and never
  sent the chat a message on Claude. Re-saving the SAME pair keeps its result.
- **A failure a person must act on is told ONCE** (`_maybe_alert`): a key
  refused, a model the key cannot reach, the account out of credit, or a quota
  that has lasted 15 min or failed 3 times running DMs the support chat (else
  every admin — the stall alert's recipients) with a button onto the tab;
  again only after 6 h or when the failure changes; and one «AI yana
  ishlayapti» when the feature works again. A compare-and-set means two
  threads failing at once send one message, and it goes out after the
  answer (`tg_later`). **Nothing ever moves a feature to another key by
  itself** — the operator's ruling: moving to another billing account is a
  person's decision. The error vocabulary is `GeminiError.kind` (quota ·
  unavailable · key · credit · model · no_key · bad_response · network ·
  other, plus `slow` — the assistant's call that sent nothing for 150 s or
  passed `assistant_ai.DEADLINE_S`) for both providers (`claude_ai.mapped`: 404 → model, «credit
  balance» → credit, connection → network); the exception CLASS still
  decides control flow (`GeminiQuotaError` stops the reviewer's drain).
- **Gemini Pro was too slow for the chat on 2026-10-19** (measured from the
  server by a deploy-log probe, removed the same day): on the operator's
  Gemini key a one-word «OK» took 55 s on `gemini-pro-latest`, ONE step of
  the chat's real prompt 86 s, and the same without tools passed 150 s. The
  engine's real loop answered on Claude Sonnet 5.5 in 12 s (3 steps), on
  Claude Opus 5.5 in 17 s (2 steps), on Gemini Flash in ~21 s. Nothing in the
  request was at fault (a 10k-token prompt, ~100–250 thought tokens); it was
  the provider's latency. A chat answer is several steps, so the assistant on
  Pro failed every time with «juda uzoq kutildi», now worded «tanlangan model
  juda sekin … tezroq model tanlasin». The operator moved it to Claude Sonnet
  5.5 the same day. The tab's own save check can still pass on a slow model
  (it allows 60 s and needs one tiny call). One thing seen on Claude and not
  fixed: a step sent with `tool_choice: none` straight after a tool turn came
  back `end_turn` with NO text block — the engine sends that only past its
  step budget (`MAX_STEPS` / `RUN_WALL_S`), where it would read «bo'sh
  javob»; a real loop with tools allowed answered every time.
- **The assistant speaks Claude too** (`services/assistant_claude.py`,
  `assistant_ai.py`). The transcript stays in Gemini's `contents` shape;
  a Claude reply is translated into it and its raw content blocks are kept
  VERBATIM beside it (`_claude`), because a tool loop with thinking on must
  hand Claude its thinking blocks back unchanged. `tool_result` blocks come
  first in a user message; the step after the budget still declares the tools
  with `tool_choice: none`; the request carries a top-level `cache_control`
  (retried without it on a 400 about it); the system prompt is byte-identical
  across a run's steps and its resume after a Confirm (its «now» is frozen in
  `context._now`), since a thinking signature is bound to it; a 400 about a
  replayed signature retries once on the transcript flattened to text
  (`transcode`), and so does a run whose feature the tab moved to another
  model mid-way. Effort medium, max_tokens 16000, no sampling parameters.
  Voice stays Gemini (`transcribe` on feature «voice»); `/api/assistant/me`
  says `voice: false` when it has no key and the composer hides the mic.
- **Removed from the other pages**: the AI tab's «AI sozlamalari» modal and
  `components/leaders/AiKeys.jsx` (switched off, the tab is a card with
  «AI kalitlari»ni ochish); the assistant's ⚙ and `AssistantSettings.jsx`
  (`PUT /api/assistant/settings` is gone; `GET` answers a slim payload with
  `moved_to`); `/api/leader-ai/key`, `/keys`, `/keys/{id}/test`,
  `DELETE /keys/{id}`, `/active` and `/model`. A tab still open on the old
  bundle can only break on the settings it was showing, so this is a MINOR.
- `StyledSelect` options gained `short`: the trigger shows it for the picked
  option (the model pickers list «<model> · eng aniq», the closed control
  shows the model alone).
- **Consequence to know**: moving a feature changes which model name its
  results carry from that moment; nothing stored is re-judged or re-written.
