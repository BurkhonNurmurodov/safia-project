# «Ish grafigi» and task #11

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## Task #11 is checked ON «Ish grafigi» (`staff_list`, from 2026-10-05)

From **shift 1's day of 5 Oct 2026 and shift 2's night of 5→6 Oct** (the
operator's hard switch) checklist task #11 is an automatic check —
`leader_auto` check `staff_list` (`_check_staff_list`), `CHECK_FROM` its own
floor (`owns` is the test both closes ask), asked at the END of the shift
(unit `deadline` 20:00 / 08:00), warned 30 min before (card: `/kelish`).

- **Cells checked**: every cell the leader leads that has a plan that day (#1's
  `cell_planned`); a cell with no plan, or a plan and an empty list, is skipped;
  no checked cell = PASS. **A cell passes** when every worker on its list is
  «Keladi» or «Kelmaydi» — who marked them does not matter. **The task passes**
  when every checked cell does; a per-cell unit gets ONE verdict for the leader.
- **Today's or tomorrow's list — EITHER, unless an admin pins one**
  (`KelishCellKind`, `kelish_cell_kinds`; the operator, 2026-10-17). A cell
  passes when its today's OR its tomorrow's list is full at the check; an ADMIN
  may pin a cell to one of them on its /kelish card (`KindLine`, `PUT
  /api/kelish/kind`, src «manual») and it is then judged on that list alone.
  «Today» = the checklist day, «tomorrow» = the day after (a night checked at
  08:00: the night that ended / the one opening that evening). Until 17 Oct the
  check FIXED each cell's type itself on its first check day (tomorrow's filled
  → «tomorrow», only today's → «today») and judged it on that list for good —
  and guessed wrong for many cells: 27 of the 66 failed lists of 10—17 Oct had
  the OTHER list full (a leader who fills today's list judged on tomorrow's
  every day; shift 2, which fills a night's list when that night starts, judged
  at 08:00 on the next night's). Those `src «auto»` rows stay in the table as
  history and nothing reads them (`kelish.load_kinds` returns manual rows only);
  nothing writes one any more. Every #11 surface names lists by DATE: the card
  prints the next check and the date of each list it reads
  (`leader_auto.next_staff_list_check` → `/week`'s `next_check`), the warning
  card prints both dates, and a list filled before its own day says
  «(oldindan)» — «To'liq to'ldirildi: 16.10» under a 17.10 list read as «the
  16.10 list was checked». Past verdicts were NOT re-judged.
- Read AT THE HOUR: a pass more than `LATE_GRACE` late reads marks, «+»/«−» and
  the file as they stood then (`file_workers_days(as_of=)`).
- **Transition** (TEMPORARY `services/leader_auto_t11.py`): 4 Oct (S1) and the
  4→5 night (S2) stayed screenshot tasks and a table filled by the shift's end
  granted full points (`LeaderTaskOverride`, reports re-sent). On 5 Oct (S1),
  reached mid-day, an answer filed by screenshot before the switch stands and
  a filled table grants the points (`_staff_list_filed`).
- /kelish opened to leader · supervisor · shift-manager (`open_kelish_page`).
- **The description** (2026-11-09, the operator: «it still asks for a
  screenshot»): the rollout wrote the automatic text on the 21 units it
  switched but left the GLOBAL description asking for a spreadsheet
  screenshot, which every other unit inherited. One-shot
  `startup.patch_task11_description_nov09` puts the automatic text
  (`TASK11_DESC`, no screenshot mentioned) on the global level and clears
  every unit / leader copy mentioning «skrinshot», so all inherit it. The
  note «Foto hisobot» and the AI `criteria` were left as they were.
- **The #11 result is a block of labelled lines, and WHEN the list was fully
  filled is one of them** (2026-10-12, the operator — first «show when it was
  fully filled alongside», then «why is it not marked?», then «everything
  should be crystal-clear»: which day's list, when it was checked, how many
  were marked at that moment). `leader_auto.staff_list_lines` and its twin
  in `utils/autoResult.js` print, per verdict:
  «Tekshiruv vaqti: 10.10, soat 20:00» (the check's instant with its DATE —
  `facts.checked`, the reason sentinel carries the hour alone, which is how a
  next-morning fill read as before a 20:00 check) → per cell «Tekshirilgan
  ro'yxat: 4612 — 11.10 (ertangi)» → «Tekshiruv paytida belgilangan: 12 / 13»
  → «To'liq to'ldirildi: 11.10, soat 08:53 — tekshiruvdan 12 soat 53 daqiqa
  keyin», or «Keyin ham to'liq to'ldirilmagan». An unfixed cell names both
  lists and which one filled (`filled_kind`). Every moment is read off its
  ISO text, never a clock. `staff_list_cells` is the same block joined by
  newlines, for a DM's `{facts}` (the verdict DM templates put `{facts}` on
  its own line). Each judged list item carries `filled_at` (ISO, Tashkent —
  the latest mark on the list, `list_done_at`) and `filled_late_min` (minutes
  after the row's `due_at`); items carry `cell_id` from this date, older rows
  resolve the cell by code. The CHECK stamps a list it found full; a FAILED
  list gets it from `late_fills` (ONE reader, two doors): the 5-minute sweep
  (`stamp_late_fills`, right after `leader_auto.run` in `leader_close._sweep`
  — every failed `staff_list` row of the last `LATE_FILL_DAYS` (3) re-read
  against the lists AS THEY STAND NOW, stamped once full, committed there;
  `_complete_facts` also fills `checked` / `filled_late_min` on rows stamped
  before they existed), and `_settle` for a verdict WRITTEN after the hour (a
  checklist that appeared later), whose DM then carries it. The count the
  check read is untouched; nothing is re-measured on a read. **The leader is
  TOLD in Telegram**: a verdict DM sent after the fill prints it; a fill after
  the verdict DM (which cannot be edited — no message id is kept) is ONE
  follow-up per task, `leader_auto_filled_late` (the block above, «the
  verdict does not change by itself»), sent by the sweep after its commit.
  **The brigadir's day digest prints it too**: each row carries `autoTasks`
  (every failed platform check, and #11 even when it passed, with its ledger
  facts), rendered as a «🤖 Tizim tekshirgan vazifalar» block per leader
  (`leader_unit_rich.body`, `result_lines` in the reader's language); the
  ledger remembers each row's fills as a third element (`_fills`), so a list
  completed after the digest went out is a `fill_only` change — the sweep
  calls `leader_unit_report.note` for each stamped unit-day, and the update
  prints «📋 «Ish grafigi» to'ldirildi» + `fill_summary` instead of
  «80% → 80%» (a two-element ledger from before reads as «no fill known»,
  never as every row changed). The classic fallback prints «📋 №11 4612 11.10
  08:53».
- **«Tekshiruv paytida ro'yxat qanday edi» — the list itself, in a modal**
  (2026-10-12, the operator). A button under the result lines of a failed #11
  (the register's day detail in `Leaders.jsx`, `DayReportView`,
  `DaySubmissionModal` — wherever `hasStaffList(facts)`) opens
  `components/leaders/StaffListAtCheck.jsx`: per judged list a `TableCard` of
  every worker with two cells, «Tekshiruv paytida» and «Hozir», drawn with the
  /kelish grid's own cells — `components/kelish/marks.jsx` (`FILL`, `OFF`,
  `DASH`, `LANE`, `MarkIcon`, `Chip`), moved out of `pages/Kelish.jsx` so the
  modal reuses them rather than forking them — a mark set after the check
  printing its time in amber, counts in the foot, the check's instant in the
  head. Fed by `GET /api/leaders/report/{uid}/staff-list?task=`
  (`leader_auto.staff_list_snapshot`): the ledger row whose entry sits on
  that bot day, both states rebuilt server-side — «at the check» with the
  check's own cutoff (the pass instant within `LATE_GRACE`, else the hour:
  the file as of it, «+»/«−» and marks by it), «now» without one — rows
  merged by key and alias, `late` = the current mark's `set_at` is past the
  cutoff. Row-scoped as the report (`report_scope_ok`), 404 otherwise. Reads
  only.

## «Ish grafigi» — the T11 staff list (`/kelish`)

Named «Kelish ro'yxati» until **2026-09-30**, when the operator renamed it
«Ish grafigi» (ru «График работы», en «Work schedule») — the label only
(`nav.kelish`, and the two «Jurnal» labels naming the list): the route, the
page key, the `kelish.*` keys and every table keep the old word.

From **2026-09-28** (the operator's rulings, asked one by one) checklist task
#11's staff list — until now an Excel / Google Sheets file screenshotted into
the bot — lives on the platform: one list per CELL per shift-day, each worker
marked «Keladi» (green) or «Kelmaydi» (red). `services/kelish.py` computes,
`routers/kelish.py` decides reach, `pages/Kelish.jsx` draws it. Page key
`kelish`, in the «Liderlar» nav group, **admin-only until the operator says to
open it**, and **task #11 is untouched** — nothing here scores anything, and
the task still wants its screenshot. Both switches are the operator's to throw.

- **WHO is on a list is the ORIGINAL upload** — `attendance_batch_rows`, the
  Verifix file as uploaded, never `attendance` (which exchanges rewrite): every
  worker the file filed under the cell in the 30 days before the day shown.
- **One worker, one list: the cell of their MOST RECENT row.** Verifix itself
  re-files people — on the 11 Sep copy 105 of 1,487 workers carried two cell
  codes within 30 days, every row an untouched file row, 86 of them moved once
  and stayed — and the latest row is the only reading on which nobody stands on
  two lists. Identity is the folded NAME (`worker_key` over
  `name_map._name_tokens`): the file carries no employee id.
- **Only TODAY and TOMORROW are editable**, on the unit's shift-day frame
  (`live_overview.shift_frame` over `cell_hours.defaults` — the rule `/live`
  and «Smena hisoboti» run on, so a night that opened at 20:00 is still today at
  02:00). Earlier days are read-only; later ones are refused (`future`). The
  server says what the day on screen IS (`when`: running · ended · starts today
  at HH:MM · starts tomorrow at HH:MM · past), because a night unit's
  «tomorrow» at 15:00 opens TONIGHT — a bare «Ertaga» would send a leader to the
  wrong shift.
- **A tap cycles — → green → red → — (the operator's call, 2026-09-28): the
  THIRD tap clears the mark.** An unmarked worker is the absence of a
  `kelish_marks` row, never a third status, so clearing DELETES it (`status`
  null on `PUT /mark`; a 4.173.0 tab only ever sent a word). Each tap saves itself (per-worker request chain, optimistic, a version guard
  so an older answer never repaints a newer tap). A mark set by anybody but the
  cell's leader says who set it («belgiladi: …»).
- **«+» / «−» at the table's foot** (TableCard's `footer`) — **the brigadir's
  and the admin's only, never a leader's** (the operator, 2026-10-04): a leader
  marks the list, the unit decides who is on it. `can_roster` on `/week` and
  `/list` (`_can_roster`: admin, or the cell's own unit's supervisor) hides the
  buttons, and `POST /workers` + `/workers/remove` answer 403 `read_only` for
  anybody else. «+» puts a name on
  the list and «−» (checkboxes, then «O'chirish» bottom-left, a danger confirm)
  takes names off — each PERMANENTLY until the other undoes it, both from the
  cell's CURRENT shift-day. `kelish_roster_events` is append-only and the state
  on day D is the last event with `effective_from` ≤ D, so a past day is never
  rewritten. A removal drops that worker's today/tomorrow marks; a removed
  worker stays removed even while Verifix keeps listing them; «+» suggests the
  cell's removed workers and a typed name that is one of them (surname + first
  name, the platform's strict sameness rule) brings THAT worker back rather than
  adding a second row. A typed name already on the list is refused (`exists`).
- **Reach** (already enforced for the roles it will be opened to): a leader
  their own cells (`viewer_leader_profile_ids`); a supervisor every cell of
  their unit — reads AND fills; a shift-manager their shift ∩ plant, read-only;
  a top-manager everything, read-only; an admin everything, and fills — so the
  page can be tried before it is opened. `page.view.kelish` at "all" widens
  reading, never filling.
- **The page reads nothing off the viewer's role or the browser's clock** —
  `editable`, `can_edit`, `when` and the day bounds all come from the server.
  Admins and shift-managers pick the brigadir in the `FilterPanel` (plant →
  shift → brigadir). A worker idle 7+ days, or never in
  the 30, carries a quiet hint so the leader knows whom «−» is for.
- **Every cell is an ACCORDION card — the /idle-cell shape** (the operator's
  call, 2026-09-30; it was one cell at a time behind a `SegmentedToggle`
  strip, then for an hour a dropdown). The page lists every cell in scope; a
  card's head is `CellIdent` (code chip · leader behind a flag, «Lider
  tayinlanmagan» when nobody leads) and on the right the fill of the cell's
  NEXT list («Pa 01.10 · 3/4 belgilangan», the totals row's green tick once
  nobody is left unanswered, a padlock + «faqat ko'rish» on a week nobody may
  change). A tap opens the week under the head — the card is ONE `TableCard`
  with `head` + `collapsed`, so the toggle keeps focus. One cell, or a leader's
  one to three, open by themselves (`autoOpen`, the /idle-cell rule); a card
  the reader opened is never shut for them. Each card (`CellWeek`) owns its
  week query — fetched only while open, kept when shut, which is what its head
  counts from — its taps, «+» / «−», cursor and worker card, so two open cells
  never share a selection. The head reads the card's own week while it holds
  the cell's tomorrow, else the cells list's `progress`, which is refetched
  1.5 s after a burst of taps goes quiet (never once per tap).
- **It is read as a WEEK REGISTER** (from 2026-09-29, the operator's
  directive): one row per worker, one column per day of a week whose FIRST
  column is always the cell's TODAY (from 2026-10-04, the operator's call —
  it was Monday → Sunday, which put tomorrow's list in the NEXT week every
  Sunday), so the two open lists are always columns 1–2. Each cell's own
  shift-day today (`today` on `/cells`; a night unit's at 15:00 is yesterday's
  date); `GET /week?start=` answers seven days from `start`, clamped to today,
  and no `start` means today. The `DayStepper week rolling` steps 7 days back
  and never past today (a picked day becomes the first column); a cell whose
  today is earlier than the latest keeps its offset from its own. `date=`
  (the calendar week) stays for a 4.216 tab.
  **The list STARTS on 4 Oct 2026** (the operator, same day): every mark
  saved before a cell's first column at the request — 4 Oct for a day unit,
  3 Oct for a night unit, whose night was still its today — was cleared once
  (`startup.purge_kelish_marks_before_start`, flag
  `kelish_marks_start_2026_10_04_v1`, both entrypoints; the deleted rows kept
  as JSON in `kelish_marks_start_2026_10_04_backup`; one «Jurnal» row
  `kelish.marks_cleared`). Marks only — the «+» / «−» events stand. `GET /api/kelish/week` builds each day's list with the very
  `roster` a single day uses (`kelish.week` lays them side by side), so a square
  on screen is a square `PUT /mark` accepts; each slot carries the key its OWN
  day's list uses (`k`). `GET /list` stays for a tab open on an older bundle.
  The file is read ONCE for the whole run of days — `kelish.file_workers_days`
  is THE reader and `file_workers` is its one-day call — because the per-day
  window query cost ~0.3 s apiece (a week was ~2 s; it is ~50–90 ms now, and
  every tap's validation got ~3× cheaper too). Verified equal to the old query
  worker for worker before it shipped.
- **Each day's file map is KEPT between requests** (2026-10-07, after the first
  «Server was slow» DM: four taps at 3.3–4.7 s and the event loop starved for
  1.4 s). A tap still re-checks its worker against the whole plant's file, and
  that read is ~46,000 rows folded in Python — 0.3 s alone, 3–5 s EACH when a
  shift's leaders tap at once. `file_workers_days` now hands out the map it
  built last time while the file under that day's window is UNCHANGED, checked
  EXACTLY on every call, never for-a-while: a stamp per file date (the batch,
  its row count, newest row and a hash of every field the reader reads, so an
  admin's edit in place counts; plus each close copy's roster) — one GROUP BY,
  ~40 ms of Postgres time, no Python work. A moved stamp reads that day again,
  ONE request per day (the others wait for its answer). Measured on a
  plant-sized file: 8 taps at once 56–93 ms each, was 3.0–3.3 s. `as_of` (task
  #11's late check) is kept under its own key. The maps are SHARED between
  requests — read them, never change them.
- **It reads like the spreadsheet it replaced** (2026-09-30, the operator: «more
  like the Excel … all cell sizes the same … too much noise»). Names down the
  left, one equal-width column per day, **every cell one size — an open day is
  never wider**, and the answer is the cell's OWN fill: green ✓ / red ✗ at full
  saturation (`toneFill`, with the icon so it reads without colour); white = on
  the list, not answered (brand-tinted where the viewer may tap it); grey = no
  slot (not on that day's list, or a day after tomorrow). Today's and
  tomorrow's headers carry a brand underline; the shift clock and «who set
  this» are tooltips, and the worker card (tap a NAME) carries who set each day
  and when. The three empty states are three different things and must stay
  distinguishable in BOTH themes (a fresh review measured the first cut at
  1.03:1): an open cell nobody answered carries a DASHED gold slot inside the
  same-size cell (`.kelish-hit.is-empty`), a closed day's listed cell nobody
  answered prints «—», the totals row's own blank (2026-09-30 — it was a small
  empty box, read as an unticked checkbox), and «no slot» stays flat grey — the legend chips
  draw exactly these. Retired as noise: the per-day meters, the «Hozir/Bugun/Ertaga»
  header words, the folded «set by somebody else» corner, the sub-line under
  every name (a worker's absence now prints only while choosing whom to
  remove), and the footer's hint / clock / source / «nobody marked» lines — the
  footer is ONE legend line, which on an open week is the tap cycle itself.
  Workers who left the list during the week sort after a divider; arrow keys
  walk the open cells.
- **Every device size** (2026-09-30): the whole week ALWAYS fits the card and
  never scrolls sideways — days are 26px below 360px (the surname drops to
  12px there), 32px to 400px, 36px to sm, then 60 · 72 · 88px (sm · lg · xl)
  in a `max-w-4xl` column; the week label stays numeric up to xl
  (`compactUntil="xl"`) and loses its year and glyph below 360px, so the
  stepper and the filter button share one row even at 320px. The table scrolls WITH the
  page (`TableCard pageScroll`), its header and totals row sticking to `<main>`;
  the filter chips wrap (`chipsWrap="always"`), and on a phone the footer legend
  takes its own line above «+» «−». Rows are 44px under a finger at every width
  (`sm:pointer-fine:h-10` — 40px only under a mouse), «+» «−» 44px on a phone.
  The grid is ONE Tab stop (roving tabindex): arrows walk the open cells and,
  past the leftmost, the worker's name (Enter opens the card). Once an open
  card's head scrolls away while its week is still on screen, the app header
  names that cell (`Layout subtitle`; at most one card can be in that state). A load
  that fails says to check the connection, and a tap that fails names the
  worker and day that flipped back — never a raw server string (a load that got
  NO answer says to check the connection, one that got a 5xx says the server
  did not answer). A card's head reads «Pa 01.10 · 7/13» — which day's list,
  answered of total, the count at a fixed width so a tap never widens it.
  In «−» mode the selection bar replaces the totals as the sticky bottom row,
  a worker who stopped coming carries an amber clock beside the surname (named
  once in the bar), and the confirm names the cell. A NIGHT unit's footer says
  which open day is running / opens tonight — its days do not line up with the
  calendar; a day unit gets no such line. While the grid holds KEYBOARD focus a
  footer line says how the arrows move (fine pointers only).
- **Nothing above the table moves on a tap.** The per-day total (how many are
  coming; the full split on hover) is a sticky row UNDER the rows, the legend
  lives in the footer, a closed week says «faqat ko'rish» inline beside the
  title, and the header loads with skeletons of its final size.
- **Consequence to know:** every tap is an action-register row
  (`kelish.mark_set`) — cheap while the page is admin-only; opened to ~100
  leaders it roughly triples the register's daily volume.
