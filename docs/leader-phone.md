# The leader's screens on a phone (2026-11-20)

The record of the leader-phone redesign — the audit and its build plan are
`docs/plan-leader-mobile.md`. **Scope, the operator's (2026-11-20): phones only,
i.e. below Tailwind `md` (768px).** Every change is gated by `max-md:` / `md:`
classes, `useIsMobile(768)`, or `hooks/useLeaderPhone.js` (role «leader» AND
below md) for what only a leader's phone does; **md+ looks and behaves exactly
as before, for every role** (checked pixel by pixel at 1280×800 against the
untouched build, as leader and as admin). The few fixes that hold at every width
because they were bugs, not layout, say so where they are recorded below.

The operator's answers to the plan's DECISION items (2026-11-20): approved —
(1) a leader's phone lands on «Bugun»; (2) one «Havotirlar» page for leaders on
phones, /concerns leaves their phone menu; (3) «Ish grafigi» shows today +
tomorrow on a leader's phone; (4) the job-named menu; (5) no doubled /leaders
title on a leader's phone; (6) static plant / brigadir chips hidden on phones;
(7) «Odamlar soni» hidden for leaders on phones; (8) **a leader may not delete
a worker's concern at all** (backend too, every width). Not done here: checklist
task №8's Uzbek name (data, the operator's), the Russian «хавотир» →
«обеспокоенность» wording (it would change desktop text — awaiting the
operator), and the «Kh…»/«X…» surname spelling on the day-report cards (it
comes from the platform-wide Cyrillic→Latin name table, `utils/transliterate.js`
`х: "kh"` and `app/translit.py` — a platform decision, not a phone fix).

## The templates on a phone (2026-11-20)

- **`FilterPanel`** — below md the chip strip ALWAYS wraps (it was opt-in via
  `chipsWrap`, and four leader pages had not opted in, so the active filter was
  cut at the screen edge or hidden under the Excel button); its row wraps too
  (`:has(> .fp-chips)` in index.css), so chips that do not fit take a line of
  their own. Static chips are not drawn below md. A chip below md reads
  «Section: value» («Holat: 2»). The phone sheet: ONE «Hammasini tozalash», in
  the header, always there (disabled while nothing is set); no per-section
  clear; the lists add no rows on a tick (`InSheet` context — `OptsFilter`'s
  «select all» stays put and dims, its «clear» and `RngFilter`'s give way to the
  header's); the sheet keeps the height it opened at, so nothing above a tick
  moves; a section whose `PickFilter` / `OptsFilter` offers at most one real
  choice (`data-opt-few`; the first option is the «off» one by convention) is
  left out unless it is set, decided once when the sheet opens; a group caption
  over one section is dropped; a search box only over ≥ 8 options; a «Tayyor»
  button closes it under the thumb; the ✕ is named and 44px. A pick never closes
  the sheet — a page whose sheet closed on a pick was REMOUNTING its toolbar.
- **`Modal`** — below md a BOTTOM SHEET (`.modal-shell` in index.css: full
  width, flush with the bottom edge, rounded on top, grab handle, rises and
  rides back down); a footer of ≥ 3 direct-child buttons stacks full-width in
  DOM order (cancel above, the primary last = bottom), 44px tall; the ✕ is a
  32px chip with a 44px pad; `phoneMenu` puts ActionMenu items in a header ⋮
  below md only (a destructive or rare footer action moves there on a phone —
  the caller hides its footer button `max-md:hidden`).
- **`TableCard`** — `mobileUntil="md"` (the phone list replaces the table below
  md instead of below sm) and `EmptyRow` (a «nothing found» row centred in the
  part of a wide table on screen, `--tc-vw`).
- **`DateRangePicker`** (its phone sheet, below 640) — a single date is ONE tap;
  a quick pick applies at once and looks like a button; days are labelled
  buttons 44px tall; a single date's sheet says «Sanani tanlang».
- Smaller: `ActionMenu` items 44px below md; `CommentsModal`'s clip a 44px pad;
  `FormField` label / hint, `GroupBadge`, the comments count ≥ 12px below md;
  `PerenaladkaFactTable` takes a `subtitle` (`null` = none).

## A leader's phone: the menu is named for the job (2026-11-20)

Below md, for the role «Lider» (`hooks/useLeaderPhone.js`), the ☰ drawer is not the
grouped register: it is five entries named for the job, then the rest quieter
(the operator's decisions 2 and 4 of the leader-phone redesign).

- **The register is `LEADER_PHONE_JOBS` in `config/navLinks.js`; the words are
  `components/layout/shellPhoneText.js` `job.*`** (four languages): «Bugun» →
  `/leaders?tab=checklist`, «Havotirlar» → `/cell-concerns`, «Ish grafigi» →
  `/kelish`, «Kutish» → `/idle-cell`, «Natijam» → `/leaders?tab=monitor` (the page's other tabs — objections, late proofs, «Vazifalar» — are opened from «Natijam» and keep the page's own title, lighting no entry). Under a
  divider, in muted ink: «Rahbariyat vazifalari» (`/tasks`), Ta'lim, Imtihon
  (`LEADER_PHONE_QUIET`), then everything else the leader may open in `ALL_LINKS`
  order. An entry shows only when its page is open to them.
- **A leader has no launcher, so their menu was never the stored nav layout** —
  `resolveLayout` arranges the launcher roles' apps only; the leader's order is
  this code list. (The «Ilovalar» view of the org chart cannot reorder it.)
- **«Xavotirlar» (`/concerns`) is off a leader's phone** (`LEADER_PHONE_HIDDEN`,
  decision 2) — the menu and the drawer's search; it shows the same concerns as
  «Havotirlar». The page still opens by link.
- **Two entries, one page: the TAB lights them.** `components/layout/leaderTab.js`
  (a leaf — App.jsx reads it in the boot chunk) answers which «Lider nazorati» tab
  is on screen: what the page publishes (`publishLeaderTab`), else its remembered
  tab (`leaders_tab`, which a menu tap primes before it navigates), else `?tab=`.
  A menu tap carries `leaderMenu` in the history state and App.jsx's
  `LeadersRoute` keys the page by that history entry, so a tap always lands on its
  tab (even onto the page already open) and Back walks the entries. Everybody
  else keeps one key.
- **Identity hues on the icon only** (`CATEGORY_COLORS`): Bugun blue, Havotirlar
  orange, Ish grafigi teal, Kutish purple, Natijam pink — the 600 shade on the
  light theme for 3:1. Never a status colour; the active row stays gold.
- **The app bar says the same name** (Layout: `jobOfScreen`) — «Kutish» in the
  menu and on the bar, «Rahbariyat vazifalari» on `/tasks`. On any phone a page
  that passes no title shows its menu name (`/cell-concerns`), and a title may
  take two lines instead of «…». «Bugun» and «Natijam» keep separate scroll places.
- **The landing: a leader's «/» on a phone is «Bugun»** (decision 1;
  `LeaderPhoneHome` in App.jsx) — the Android app, the PWA and Telegram's menu
  button all open «/». A leader who may not open `leaders` keeps the first page
  of their access; a leader's desktop and every other role are untouched.
- **Every phone's header is 44px targets** (☰, the apps grid, the bell, the avatar:
  a 44px button around the 36px chip; the row's padding gives the height back), the
  drawer's rows are 44px, its close is labelled, its strapline is the desktop's
  only. The profile popover lets the name wrap to two lines; on a leader's phone
  «Yangi profil qo'shish» sits under the preferences in muted ink. Avatars a size
  up on a phone (initials at 12px).

## The in-app camera on a phone

- **Where the page runs decides the copy** (2026-11-20, a refused camera inside the
  Android app said «enable the camera for Telegram»): on a phone the refusal and
  failure texts (`denied`, `none`, `held`, `stalled`, the second `hung`) name the
  Safia IMS app (`inAndroidApp()`) or the browser; in Telegram the platform's
  `proof.cam.*Msg` strings stay. Words: `shellPhoneText.js` `cam.*`.
- **The `<video>` carries a transparent poster** (`NO_POSTER`): Android's WebView
  otherwise draws a giant grey «play» glyph until the first frame.
- **On a phone the viewfinder carries ONE status line at most**
  (`phoneChrome`): a late filing («Kechikkan isbot · 24:00 gacha») before a shot
  about to be marked late, before no connection, before shots still sending; the
  hint under the controls stays only while a slot is being retaken (the header's
  `k/N` already counts). The header's second line is the day in words for the
  leader filing it («20 noyabr»), never their own name and an ISO date; the task
  name takes two lines rather than «…». The shutter with no stream is a grey disc,
  not gold. The rule sheet draws lucide icons, not emoji. md and up: unchanged.

## The notification centre on a phone

- **On a phone the server's raw emoji are dropped from a notification's text**
  (`notifMeta.noEmoji` — the bot copy «✅ …», «🕐 00:19 · …»): the row already
  wears its kind's icon. The words stay exactly as sent; md and up unchanged.
- **«Hammasini o'qildi» read as a statement**: on a phone the button says what it
  does — «Hammasini o'qish» / «Ҳаммасини ўқиш» / «Прочитать все» / «Mark all as
  read». On `/notifications` it has a row under the tabs and, once pressed, stays
  (disabled) until the view changes, so the list never moves under the finger.
  The bell's and the page's head buttons are 44px on a phone; the page's two views
  are a full-width `SegmentedToggle size="lg"` beside the settings gear.

## The profile page on a phone

- On a phone `/profile` drops the notes: the «Ism (tillar bo'yicha)» block (the
  person's own name four times) and the subtitles under «Sayt logini» and
  «Telegram akkauntlar». Its labels are 12px there.

## Imtihon and Ta'lim on a phone

- On a phone «Imtihon» drops its lead paragraph, the empty card's sentence and the
  practice card's sentence (notes); its buttons are 44px. «Ta'lim» drops its
  header (the bar already says «Ta'lim») for a viewer who manages nothing; a
  manager keeps the «new lesson» button.

## «Bugun» — the Chek-list tab for a leader on a phone (2026-11-20)

The leader-phone redesign (plan §4, operator-approved): for the role «Lider» below md, on TODAY's
checklist while it is still being filed (`rights.file`), `Checklist.jsx` renders
`components/leaders/BugunDay.jsx` in place of its own summary and groups. Same payload, same sheet,
same writes. Everybody else, every desk and every past day keep the tab as it was.

- **Order is the shift's**: a ring («Qoldi n»: the leader's own tasks still to hand in, the arc the
  rest of them; system checks are not counted) beside «Hozirgi ball» (`running`, «Hali baholanmagan»
  while nothing is checked, never «0 / 0») → **Keyingi vazifa**, the nearest deadline, big, with a
  shrinking bar (blue; amber/red inside the last hour) and ONE action («Suratga olish» → the in-app
  camera, «Rasm tanlash» → the picker, whose photos open the task's sheet ready for «Topshirish»;
  «Topshirish» for a draft; a task not open yet says when it opens) → «Keyinroq» → «Vaqti o'tdi»
  (late window open, or a deadline objection) → «Rad etildi» (a judge refused, objectable) → the
  system's own checks and the closed tasks as two folded strips → «Sizni kutmoqda».
- **Red is on a group's marker, never on its rows**; the late rule is said ONCE, in the «Vaqti o'tdi»
  line («Kechikkan isbot — 12:00 gacha»); a row tap opens that task's late form (or its objection).
  No «№» on these rows (they are ordered by deadline, so the numbers read shuffled).
- **«Sizni kutmoqda»** counts, each from the request its own page makes (same react-query key):
  open worker concerns (`/api/cell-concerns/stats` `open`) → /cell-concerns register; objections
  with an unread message (`/api/leaders/disputes`, `chat.unread`) → /leaders?tab=disputes; open
  /tasks rows (`/api/tasks/board`) → /tasks; tomorrow's «Ish grafigi» people not marked
  (`/api/kelish/cells` `progress.none` on the leader's own cells) → /kelish. A zero row is not
  drawn; a page the leader may not open is not asked. It sits LAST, so a count landing never moves
  the task list.
- Identity hue: «Bugun» blue (`CATEGORY_COLORS[2]`) on the ring and the countdown only; gold stays
  the action. Status text uses the theme's `--status-*` ink (`ink()` in checklistShared.js).

## The count under the score on a leader's phone (C3)

On a phone «n / N topshirildi» counts what the LEADER handed in (`filedByLeader`,
checklistShared.js): an answer exists, its reason is not a platform sentinel (`__missed__|`,
`__auto__|`), and on a per-task unit it is locked; N is the tasks a leader files (system checks
excluded). `locked` alone counted every task of a closed day — the deadline sweep and the automatic
check write locked entries nobody filed — so «13 / 13» stood over three tasks never handed in. The
desk still counts `locked` until the operator rules the same there.

## The task sheet on a phone opens on its photo action (D2)

Below md the sheet leads with the answer: a camera task opens on «Suratga olish» (with the roll
under it), an upload task on «Rasm tanlash» (then the photos under the button and «Topshirish» as
the one footer button), a no-proof task on «Bajarildi»; taking the photos IS the «done» answer and
«Bajarilmadi» is a quiet second that opens the reason box under itself. A task not open yet shows
its hour first. The deadline and the photo rule are two short lines; the four-fact grid, the rule
sentences under the state banner, «Qanday bajariladi» (folded) and the footer «Yopish» / «Bekor
qilish» (the ✕ closes) stay on the desk. The writes are the same `/answer` / `/submit` calls.

## The late-proof and objection forms on a phone (C4–C6, 2.8)

Below md the late-proof form names its task («№6 · <name>» as the subtitle), puts «Nega
kechikdingiz?» first and photos second, drops the amber explanation (the 24:00 rule is said once,
on «Bugun») and has one «Yuborish». An objection in the task sheet is a label («E'tirozingiz») over
the composer — the three-sentence intro and the empty chat's sentence stay on the desk.

## /leaders on a leader's phone — «Bugun» and «Natijam» (2026-11-20)

From **2026-11-20** (the leader-phone redesign, phones only = below md 768px,
`hooks/useLeaderPhone.js`) a leader on a phone uses /leaders through the MENU,
not through the page's tab strip:

- **The URL is the view.** «Bugun» opens `/leaders?tab=checklist`, «Natijam»
  `/leaders?tab=monitor`; `Leaders.jsx` reads `?tab=` on EVERY change of
  `location.search` (the menu navigates between the two without remounting the
  page) and remembers no tab in the browser. No `tab` (or one the leader may
  not open) = «Bugun». `?tab=disputes` / `?tab=lateproof` (the bot's cards) and
  `?tab=tasks` still open their views, under a «‹ Natijam» row. The page
  publishes the tab on screen (`publishLeaderTab`, `components/layout/leaderTab.js`)
  so the menu lights the right entry and the app bar names it.
- **No H1, no tab strip** on a leader's phone (decision 5): the app bar titles
  the page. `?tab=checklist` is the checklist alone (`Checklist.jsx`), no day
  stepper above it. A `?date=` / `?open=` link is honoured on every URL change
  there; a plain «Bugun» opens today.
- **«Natijam»** = the period control, then three blocks, nothing else:
  1. **«Mening o'rnim» as the hero** (`MyStanding hero`): the unit place large
     (48px) in the area's identity hue — **pink**, `CATEGORY_COLORS[7]`, the
     screen's one strong mark (number, the reader's frame on the strip, the
     section's icon chip) — the shift and the plant smaller under it. Same
     `placesOf` rule as the board; only the drawing differs. No «i», no period
     subtitle.
  2. **«Kunlarim»** (`components/leaders/NatijaDays.jsx`): the period as a
     Monday-first calendar, one 48px tile per day — date, score, the band as a
     bar under it. Built in `Leaders.jsx` (`myDays`) through `slotsBy` and
     `countCap`, so a tile says what the board counts: past `countCap` hatched
     and blank (today outlined, a tap opens «Bugun»), an excluded day neutral,
     a day nobody filed a red «—». A tap opens that day's report
     (`/leaders/report/:uid`); a day with several reports (per-cell units) asks
     which in a sheet. The head carries the period's average (the page's `avg`).
     It REPLACES the «Oxirgi hisobotlar» card list for this reader.
  3. **«Bahslar»** (`AppealDigest` in `AppealQueue.jsx`): objections AND late
     proofs as ONE list — every open appeal whatever its day, the settled ones
     of the period — unread ones first, then newest activity. A row leads with
     the TASK, one state chip, «N yangi», the kind as an icon + the date, the
     newest message on one line («Siz» for the leader's own). Hidden when empty.
- **Not on a leader's phone**: the KPI cards, «Bajarilish dinamikasi», the
  per-task bars named by T-code, «Eng past vazifa», the register's counters and
  card list, the methodology «i», the empty state's «Davr va filtrlarni
  tozalash». Desktop and every other role's phone keep all of it.
- The «Mening o'rnim» tiles print 12px labels on every phone (were 10px).

## The appeals and their queues on a phone; «Barchasini ko'rsatish»

- **The two queues on a phone** (every role): the rule card («Norozliklar» /
  «Kechikkan isbotlar» explanation) is not drawn below md — a note. On a
  LEADER's phone the queue's rows are `AppealRow` (task first, one chip,
  «N yangi»), with no search box (a list of one person) and no «Sizning
  navbatingiz» segment; only «Yangi xabar» keeps its count.
- **«Barchasini ko'rsatish» no longer clears the page scope** (every width).
  It set the period and every filter to empty for ALL tabs, silently — the
  Monitoring came back on «Sanalarni tanlang». Now it sets the scope aside for
  THAT queue only; the same notice says «Sahifa filtrlaridan tashqaridagi N ta
  yozuv ham ko'rsatilmoqda» with «Filtrga qaytish», and any change of the scope
  hands the list back to it (`ScopeNotice` `showing` / `onBack`).
- **A task is named, never «#12»** (every width): the server answers «#N» when
  the leader's chain no longer carries the task; the queue, the digest and the
  chat then name it from the task catalog (`components/leaders/appealTask.js`
  `taskTitle`). The card read «№2 #2».
- **The chat on a leader's phone** (their own case, not one they were invited
  into): the case card leads with the TASK and the day — not their own name,
  brigadir or shift — and the app bar's compact title is the task too; the
  «Muhokama» subtitle (who reads the chat) is not drawn on any phone.
- **Writing a new objection on a phone**: the chat card (the text box) comes
  right under the case, the photos and the verdict under it (flex `order`;
  desktop order unchanged); the three-sentence intro is not drawn on a phone
  («Bu vazifa bo'yicha norozilik bildirib bo'lmaydi» — a state — still is).
- The URL follows the strip (every width): a deep link's `?tab=` is replaced
  when the reader switches tabs, so a reload no longer reopens the linked tab.

## «Vazifalar» and the day report on a phone

- «Vazifalar» on a phone: the intro paragraph (`autoNote` / `deadlineNote`),
  the «pick a leader» hint and the per-task amber boxes («tizim o'zi
  tekshiradi…», «ilovadagi kamera…») are not drawn below md; on a leader's
  phone the «T7» code chip goes too (the name is the task) and the subject line
  drops the leader's own name.
- The day report (`DayReportView`) for a leader reading their own day on a
  phone: the header is «‹ Orqaga» (44px) and the DAY as the title (+ cell
  code), no own name / brigadir / shift / source; their own objection note
  carries no name; the «not automatic yet» note is not drawn on a phone; every
  phone gets 12px minimum text and 44px task buttons.
- Phone report cards (other roles): «0 ta vazifa bajarilmadi» is not printed on
  a day with nothing missed.

## A leader deletes no concern (2026-11-20)

The operator, on the leader-phone audit: «a leader may not delete a worker's
concern at all». `DELETE /api/concerns/{id}` refuses the role «leader» with a
403 (`concerns.LEADER_DELETE_REFUSED`) BEFORE it reads the row, so the answer
is the same whether the id exists or not. Until then a leader was refused too,
but `page.admin.concerns` let one through; it no longer does — `may_delete(role)`
is a question about the IDENTITY, not a power, and no grant reopens it (the rule
docs/permissions.md keeps for an admin identity). A row's `can_delete` is false
for every leader. Everybody else is unchanged: an admin, a brigadir within their
unit, a shift manager within their shift still delete (the row's own
`_assert_can_edit`). The /cell-concerns dialog offers «O'chirish» to nobody whose
role is leader, at any width; the server's `can_delete` is NOT what it reads,
because that flag is false for a brigadir on a worker's row the brigadir may
delete. Test: `backend/tests/test_concern_delete_leader.py` (no Postgres).

## «Yacheyka havotirlari» (/cell-concerns) on a phone (2026-11-20)

Below md only; md and up is what it was.
- The bar names the page (a leader's menu calls it «Havotirlar» — Layout's
  job name); the page's own heading and its sentence about who writes here go.
  The three tabs are 44px segments across the width, words only, the first
  «Yozish».
- `?tab=write|register|analysis` opens that tab, on arrival and whenever the
  query changes («Bugun»'s «open worker concerns» row opens the register);
  otherwise the remembered tab (`cellConcerns.tab`) stands.
- The worker's form keeps everything but its two hints; a department's name
  wraps to a second line instead of «Keles (xom…».
- The register is a list of cards: what the worker wrote first (3 lines), then
  the worker and the status, then the cell code, the department, the day filed
  and the day due (`phoneDay`: «21-noyabr», the year only outside this one).
  The open concerns come first and the resolved ones fold under one 48px row
  that names their count — a phone has no «Ochiq · Hal qilindi · Hammasi»
  switch (three counted pills never fitted 320px; the desktop keeps it). No
  card heading repeating the tab, no row count. A leader's cell filter lists
  codes alone (the name beside them would be their own).
- A filter pick no longer closes the phone's filter sheet: the list and
  «Tahlil» keep the previous answer while the next one loads
  (`placeholderData: keepPreviousData`); the skeleton is the first load's
  alone. It used to unmount the card holding the FilterPanel — on every width.
- The dialog is the bottom sheet: the worker's text ONCE (a pencil opens the
  field to change it), the deadline once (the field while it is being set, the
  fact otherwise, no «—» for none), no «edit only when you must» / «the
  resolution cannot be deleted» / uplift notes, the thread as a real
  «Izohlar n» button. Footer: «Bekor qilish · Brigadirga ko'tarish · Saqlash»
  stacked full width (44px); «O'chirish» for those who may is behind the
  header's ⋮.
- «Tahlil»: the six figures two to a row; the panels one column (the 400px
  minimum ran the bars' numbers off the screen); the trend drawn narrower so
  its labels read at 12px; the «names are typed by hand» caveat off.

## «Xavotirlar» (/concerns) on a phone (2026-11-20)

- Cards from md down (were from sm: the table between 640 and 767 px ran wider
  than its card); the columns picker from md up.
- Excel and the weekly deck leave the filter row: a ⋮ on the view-tabs row
  holds them, so a chip is never pushed out by a button.
- A leader's phone has no insight cards. On another phone they carry one line,
  «Faqat davr va tuzilma bo'yicha»: they read the period and the org chain,
  never the record filters (status, owner, level…) — the two open-concern cards
  are about open concerns whatever the status filter says, so following it
  would print «all clear» under «done». The desktop is unchanged.
- A card opens its concern («Ko'rish»); the row's actions are its ⋮ (the
  desktop's expanded-row set: Ko'rish, Tahrirlash, Ko'tarish, Pastga, Tarix,
  O'chirish — each where the row allows it). «Amallar ▾» is gone from phones.
- A leader's card drops what only repeats the leader: the cell's leader, the
  owner when it is them, «Mas'ul» + «Daraja» while the concern is with them.
  Labels 12px at `--text-3`; dates in the phone form.

## «Rahbariyat vazifalari» (/tasks) on a phone (2026-11-20)

- The 841px table becomes cards, grouped by status in the board's order
  (Bajarilishi kerak · Jarayonda · Bajarildi — the last folded under a 48px row
  with its count). A card: the task first (the flame before it when urgent),
  then the due day (red with a warning when past), the assignee (not on a
  leader's — it is them) and «Qo'ydi: <who set it>», the thread's count.
- The status is changed IN the card — a 44px StyledSelect of the options the
  server allows the row (`status_options`), a chip where it allows none. The
  rest sits behind the card's ⋮ (urgent on/off, Tahrirlash, O'chirish — where
  the row allows them).
- A tap on the task opens its thread — the board has no detail view, and the
  thread is already the surface that shows a task whole (a notification's
  `?open=` opens the same).
- No card heading and no row count (the bar says «Vazifalar», each group counts
  itself); no inner scroll; the empty state sits inside the visible list.
- A leader's phone has no «Tahlil» (the view switch is not drawn).
- The task form (`TaskFormModal`, also «Smena kunligi»'s) drops the urgent
  hint on a phone and gets 16px fields and 44px buttons.

## «Zagruzka fayli» on a phone (2026-11-20)

The leader-phone redesign (docs/plan-leader-mobile.md, items S2 · P1 · P2 · P4 · F5 · F6 · decision 7).
md+ is unchanged for every role, except one fix that holds at every width:

- **A day with nothing planned and nothing done reads «—»**, not the engine's 0 / 0 = 0% (completion,
  both trudoyomkost cards, the load) — for everybody but an admin (`blankDay`). The headcount card is
  untouched. Admins keep the engine's figures and their banner; everybody else gets a neutral line
  «Bu kun uchun reja kiritilmagan» instead of `production.noSapData` («…Admin → Ishlab chiqarish orqali
  yuklang…»), an order to open a page they cannot open. No arithmetic moved.
- **A leader's phone** (`useLeaderPhone`): the title is «Zagruzka fayli» without the brigadir's name;
  their cells ARE the page's one switch — «Hammasi · 7213 · A · 7214 · B», a `SegmentedToggle` (lg)
  over `unit_cells`, by verifix code and letter, never the work centre «A2723» the old
  «Faqat sizning yacheykalaringiz» strip printed. It replaces that strip AND the filter button's cell
  section and is drawn in both states, so picking a cell moves nothing above the page (F6). One cell: a
  quiet line «Yacheyka 7213 · A». The team cards print the cell's code too. «Odamlar soni» is not offered
  (decision 7; a persisted pick falls back to the dashboard), and the catalog's data-quality warnings
  (missing trudoyomkost, unknown SKUs) stay off a leader's phone.
- **F5 — decided: the cards SAY their scope, they do not follow the pick.** The KPI cards are the work
  centre's figures as the engine states them for the brigadir — a pick (or a leader running one letter of
  a shared work centre) cuts the team cards and positions, never the totals («never a recomputation over
  their slice», docs/work-centres.md). So wherever the page shows fewer letters of a lettered work centre
  than it holds (`teamCut`: `cells_n` > the groups listed), a phone prints «Ko'rsatkichlar butun jamoa
  bo'yicha» above the cards. md+ does not (yet) — the same mismatch still stands silent there.
- **The positions on a leader's phone are CARDS** (`TableCard mobile`, `mobileUntil="md"`,
  `mobileMaxHeight="none"` — no inner scroll): the product's NAME first, then REJA and FAKT as 44px
  fields typed in place (`QtyField` — one tap opens the number keyboard on the whole value; it saves
  through the table's own `saveOverride` and `parseQty`, the one reading of «+20» / «50+20» / blank),
  and the line's «Bajarish». Which cell a line belongs to («7214 B») shows only while the list holds
  more than one. Admins and every other role keep the table on a phone (row selection, bulk edit, columns).
- **Every phone**: the positions toolbar is the search, the Команда filter (only where it can narrow —
  two or more teams) and ONE ⋮ (`ActionMenu`) holding «Qo'shish», «Navbatni tartiblash», «Kechagi
  tartib» and «Excel yuklab olish» — the big green export button (green is a status colour) and the two
  order buttons are gone from the bar below md. The KPI tiles are a two-column grid, completion across
  the top; their 10px labels are 12px. The closed-day banner is one line (state + who shut it; the
  «read-only, re-open to change» sentence is a note). The «*» explanation under ΣN is a note — off.

## «Ish grafigi» on a phone (2026-11-20)

- **A leader's phone shows TODAY and TOMORROW only** (the operator's decision 3 of 2026-11-20 — it
  overrides the 29 Sep rolling-week directive on a leader's phone alone; the 7-day register stays on
  every wider screen and on every other role's phone). The two columns are the server's `state`
  today / tomorrow out of the same `/week` answer, 72–120px wide (`GRID_TWO`), each headed in the
  leader's words — «Hozir» / «Bugun» / «Ertaga» off the server's `when` (a night unit's «tomorrow» at
  15:00 reads «Bugun») — over «Ju 20.11»; that header carries what the night unit's footer line said, so
  the line goes. No week stepper (nothing to step).
- **The head counts BOTH open days** — «Ju 6/6 ✓ · Sh 4/6» — so whichever day the leader marks, the
  count that moves is on the head (the week view counts tomorrow alone, which sat still while today was
  marked, G3). Nothing above the rows moves on a tap (checked: the first row's top is identical).
- **The leader's own name is not on the cell head** when the viewer leads it (`CellIdent self`, scope
  kind «leader»), and the app header names a scrolled-away card by its code alone.
- **Every phone**: the how-to legend («Bosing: ▢ → ✔ Keladi → ✖ Kelmaydi → ▢») is gone, and task
  #11's rule sentences are ONE chip — «11-vazifa · 22.11, 00:19» (the next check; a pinned list's word
  beside it), the dates of the lists and the rule in its tooltip; an admin keeps the pin picker beside
  it. Given names, the «Xodim» head and the totals label are 12px.

## «Kutish» (/idle-cell) on a phone (2026-11-20)

- **A leader's phone**: the page is titled «Kutish» (the menu's name, decision 4); the toolbar is the day
  alone — no inert brigadir chip (decision 6) and no cell filter over the leader's own two or three cells,
  which open by themselves; the cell heads leave the leader's own name off (`CellIdent self`).
- **Every phone**: «Kategoriyalar» left the toolbar (it took a second row, I1) for an ⓘ beside the add
  form's category field — the guide where the category is chosen. The day's entries are CARDS, not the
  760px table swiped sideways: category + minutes, then the clock and the answer, the note under them,
  «Kiritdi: …» only when it is somebody else, and a ⋮ only where the server allows edit/delete. The
  page's view tabs are the 52px phone size. An empty «Vaqt chizig'i» is an empty dashed TRACK
  («Vaqt chizig'i bo'sh — bu kun kutish yo'q»), never the «Kutish» tab's empty line (I2); the
  timeline's labels are 12px and its axis steps 1 · 3 · 6 h. The «Kutish qo'shish» form carries no
  notes: «Avval boshlanish vaqtini tanlang», «Boshlanish va tugash vaqtini tanlang» (the read-out says
  «—»), `idleCell.stoppedHint`, «(majburiy)» in the placeholder beside a red *; its date is 20.11.2026;
  «Kiritilgan kutishni faqat brigadir o'zgartira oladi» and the closed day's «read-only» sentence are off.
  The category's own definition under the picker stays (it is what the pick means, not how the UI works).
