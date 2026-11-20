# Leader screens on the phone — audit findings and build plan (mobile only)

**Status:** audit done 2026-11-20 on v4.612.2. **Built 2026-11-20 as v4.615.0** — what was built, what was not and why: `docs/leader-phone.md`.
**Scope decided by the operator (2026-11-20):** build this plan **for mobile only for now**. Mobile means below the `md` breakpoint (< 768 px). Every change is gated to phones: Tailwind `max-md:` / `md:` classes, or `useIsMobile()` (the hook `Staff.jsx` and `LoadBarChart.jsx` already use). **Desktop must look and behave exactly as it does today.**
**Who it is for:** the role «Lider» (cell leader). Supervisors, shift- and top-managers and admins use the same pages; their phone views must not break, and their desktop views must not change.
**Source evidence:** `~/Documents/safia-audits/leader-phone-audit-2026-11-20.html` on the operator's Mac — 39 phone screenshots behind every finding below. Not in the repo: the screenshots show real employees.

---

## 0. How to use this file in a cloud session

1. Read `CLAUDE.md` (the UI template table and the change workflow) and `docs/cloud-sessions.md` (a cloud turn deploys like a laptop turn).
2. Before touching a page, read its record (rulings that this plan must not silently undo):
   - `docs/leaders-page.md` — «Lider nazorati» on a phone (28 Sep), «Mening o'rnim», the tab strip, the «Chek-list» tab.
   - `docs/appeals.md` — late proofs, objections, the appeal chat.
   - `docs/checklist-camera.md` — `/proof/camera`.
   - `docs/tasks-and-concerns.md` — `/tasks`, `/concerns` and `/cell-concerns` (they share `leader_concerns`).
   - `docs/kelish.md` — «Ish grafigi» is a rolling 7-day week register (operator's directive, 29 Sep).
   - `docs/navigation-and-shell.md` — the menu is a **stored layout** (`utils/navLayout.js` `resolveLayout`, `services/nav_layout.py`); a code change to order or grouping moves nothing once the operator saved a layout. Names are i18n (code).
   - `docs/production-quantities.md`, `docs/work-centres.md` — «Zagruzka fayli», work-centre letters.
   - `docs/motion.md` — sheets enter with `.sheet`, leave through `leaveRef`; run `node frontend/tools/motion/run.mjs` after touching motion.
3. Templates first: almost every bug below lives in ONE template (`FilterPanel`, `Modal`, `DataTable`, `DateRangePicker`). Fix the template, never the page. Extend with a prop; never fork.
4. Items marked **DECISION** reverse an earlier recorded ruling. The operator asked for this plan to be built, but confirm each DECISION item with them in one line before building it.
5. One turn = one commit = one deploy. Phase 0 and Phase 1 are MINOR bumps (templates gain behaviour); nothing here is MAJOR (no open tab breaks).
6. Verify every item by the protocol in §6 before calling it done. Self-check all widths and languages before any reviewer pass (the operator's standing rule: a round must not create new majors).

---

## 1. How the audit was done

- **Device:** the operator's Galaxy A16 (SM-A165F, Android 17), CSS viewport **384 × 781** inside the app. Phone in «No data transfer» USB mode (other modes made the USB link drop every 15–30 s).
- **App:** a side-by-side test build of the Safia IMS Android app (own package, pointed at a local backend), not Chrome. Screenshots are the phone's own screen (`adb screencap`) — DevTools captures misdrew text in this WebView and were discarded.
- **Data:** a private copy of the 9 Nov production database. Real data was read on 1–9 Nov; «today» (20 Nov) is empty everywhere because the copy ends on 9 Nov.
- **Test leaders:** leader A — day shift, 2 cells (codes 7213, 7214, both on work centre A2723, letters A and B), 23 objections, late proofs, 147 concerns, a 35-character name; leader B — night shift (its tasks were open during the audit). Logins existed only in the copy; the copy was dropped afterwards.
- **States exercised:** landing, a day with data, every tab, filters opened, applied and cleared, date pickers, dialogs, the late-proof form, the in-time filing sheet, the objection form, the camera (permission refused on purpose), adding a second profile, Russian, light theme.
- **Touches were real** (touch events at element centres). A first "stacked overlay" observation made with a script click was an artefact and is NOT a finding.

---

## 2. The leader's jobs (start every design and every check from these)

Written as the leader would say them. Each must be reachable from the landing screen by instinct, with no note on the page.

1. «Bugungi vazifamni topshiraman» — submit today's checklist task (most need photos; camera tasks use the in-app camera).
2. «Rasmim qabul qilindimi?» / «Nega ball yo'qotdim?» — see a task's verdict and why.
3. «E'tiroz bildiraman» — object to a rejection; follow the chat.
4. «Kechikkan isbot yuboraman» — send a late proof before the cut-off.
5. «Ishchining havotiriga javob beraman» — resolve a worker's concern or raise it to the brigadir.
6. «Ertaga kim keladi» — mark tomorrow's people on «Ish grafigi».
7. «Kutishni yozaman» — record a waiting time (ojidaniya).
8. «Brigadir bergan vazifa» — do and update a task from the brigadir/management.
9. «O'rnim qanday» — see my place in the unit / shift / plant.
10. Ta'lim (lessons), Imtihon (exam), my profile.

---

## 3. Findings

Severity: **Critical** = a job breaks or is hidden · **Major** = slows or misleads · **Minor** = polish · **Likely** = strong evidence, not confirmed on production-closed data · **Keep** = works, protect it.
Each finding: where · evidence · fix · how to check it is fixed.

### 3.1 Filters — the case the operator flagged (all from `FilterPanel` in `components/ui/ColumnFilter.jsx`)

**F1 · Critical · The active filter chip is pushed out of sight.**
- Where: `/cell-concerns` (register), `/concerns`, `/idle-cell`; also `/concerns` before any filter when the period label is long.
- Evidence: on `/cell-concerns`, after picking cell 7214, the chip «Yacheyka: 7214» sat at x 333–390 px inside a strip ending at 346 px (scroller with `no-scrollbar`, class `flex items-center gap-1.5 flex-1 min-w-0 no-scrollbar self-center overflow-x-auto`) — only a sliver of its icon visible. On `/concerns` the chip «Holat: 1 tanlangan» sat at 316–451 px, under the Excel button (316–363 px) and past the screen edge — fully hidden. On `/idle-cell` the static «Brigadir: …» chip is cut at the right edge. On `/concerns` with «14.11.26 – 20.11.26» the plant chip «Uchtepa» is cut with no filter set (fits with «Barcha vaqt»).
- Cause: `chipsWrap` is opt-in. 15 pages opted in (Production, Leaders, Kelish (`"always"`), Zagruzka, Staff phone, ShiftDaily, IdleSolutions, Containers, …); **CellConcerns, Concerns, IdleCell and Tasks did not**.
- Fix: below `md`, chips always wrap onto their own row (make wrapping the phone default inside the template; desktop behaviour unchanged). Secondary actions (Excel) never sit in the chip row (see F3b).
- Check: at 320 / 375 / 384 / 414 px, with 1, 2 and 3 filters set on each of the four pages, every chip's rect lies fully inside the viewport and inside its parent; the chip row is not a horizontal scroller.

**F2 · Major · The filter sheet moves the list under the finger.**
- Evidence (`/concerns` sheet): ticking one option inserts «× Tozalash» and «Hammasini tozalash» rows; the next option moved from y 489 to y 529 (40 px). The sheet also grows upward (its top moved ~60 px). A quick second tap lands on the wrong row. Same on `/tasks`.
- Fix: nothing may appear above or between options because of a tick. One «Hammasini tozalash» in the sheet header, always rendered (disabled while nothing is set); per-section «Tozalash» always occupies its space (invisible/disabled when the section is empty) or is dropped on phones.
- Check: record every option's `getBoundingClientRect().top` before and after each tick — identical.

**F3 · Major · Three «clear» controls in one sheet.** Header «Hammasini tozalash», section «× Tozalash», footer «Hammasini tozalash». Keep the header one (F2).
**F3b · Major · Excel on the leader's phone toolbar** (`/concerns`) competes with chips. Below md, move it into the page's ⋮ (`ActionMenu`) or out of the toolbar row.

**F4 · Major · Filters that cannot narrow anything.**
- Evidence: `/concerns` sheet shows a leader 9–10 sections. «Lider» and «Brigadir» offered exactly one option to both test leaders; «Mas'ul» offered none; for leader A «Xavotir egasi» (themselves) and «Daraja» («Lider») had one option each. `/tasks` sheet: the group caption «VAZIFA» sits directly on the section caption «HOLAT» — two headings over one 3-option list. `/production` «Yacheyka» section has a search box over 2 options.
- Fix (template): hide a section whose list has ≤ 1 option; drop a group caption that covers a single section; no search box below ~8 options.
- Check: open each leader page's sheet as a leader; no section with < 2 options, no stacked captions.

**F5 · Major · Numbers ignore the filter.**
- `/production`: filtered to 7214, the team card narrows to letter B (91 %, 3 people) while the five KPI cards stay at the unit's 100 %, 12 people, 5 112 min, 89 %.
- `/concerns`: the three insight cards (longest unresolved, slowest brigadir, date with most open) ignore the status filter.
- Fix: cards follow the page's filters, or say what they cover («butun brigada»). Decide per page; do not leave a silent mismatch.

**F6 · Major · The toolbar changes shape when a filter is applied** (`/production`): «Filtrlar» jumps from its own row up beside the date, the «Faqat sizning yacheykalaringiz» strip disappears, a chip row appears; everything below shifts ~50 px. Violates CLAUDE.md «An action taken in a list must never move the list».
- Fix: the trigger keeps one place in both states; the chip appears where the scope strip was (or below md always reserve the chip row).

**F7 · Minor · Inconsistent pick behaviour:** a pick in the phone sheet closes it on `/cell-concerns` but leaves it open on `/production`. Make PickFilter behave one way in the sheet (the template documents «closes on pick»).
**F8 · Minor · Chip text says a count, not what:** «2 tanlangan» with only an icon for «Holat». Below md print the section name: «Holat: 2».
**F9 · Minor · A11y:** the phone sheet's ✕ has no accessible name; dialog ✕ buttons are 18 × 18 px (need a 44 px target).
**F10 · Minor · Static chips for a one-plant / one-unit viewer** («Uchtepa», «Brigadir: …») carry no action and eat the row on a phone. **DECISION** (CLAUDE.md says a locked viewer gets an inert plant chip): hide static chips below md.

### 3.2 Dialogs and the camera

**D1 · Critical · Concern dialog footer runs off the screen** (`/cell-concerns` → tap a concern; `CellConcerns.jsx` renders the shared `Modal`).
- Evidence: four footer buttons on one row; «Bekor qilish» starts at x −22 px (cut); «Brigadirga ko'tarish» wraps to two lines; red «O'chirish» sits beside «Saqlash».
- Fix in `Modal`: below md the footer stacks full-width — primary at the bottom (thumb), cancel above it; destructive actions move to a ⋮ (`ActionMenu`) in the header. **DECISION:** should a leader be able to delete a worker's concern at all?
- Check: every `Modal` with ≥ 3 footer buttons at 320 px — no button outside the card, no label wrapping.

**D2 · Critical · Camera task: the photo button is hidden until a question is answered** (`components/leaders/ChecklistTaskSheet.jsx`, in-time filing).
- Evidence (night leader, «SOP standarti», 3 h 54 m left): the sheet opens on 4 facts (Topshirish / Rasm vaqti / Rasmlar / Ulush), «Vazifa bajarildimi? Bajarildi / Bajarilmadi» and a long «Qanday bajariladi» paragraph. «Kamerani ochish» appears only after tapping «Bajarildi», and pushes everything down with the note «Bu vazifa ilovadagi kamera bilan olinadi — Galereyadan rasm yuklab bo'lmaydi — suratga olish vaqti tizim tomonidan belgilanadi.» This is the operator's own example of a leader not knowing how to take the photo.
- Fix: for a camera task, the sheet opens on one big «Suratga olish» (camera icon) as the first and primary control; taking the photos IS the «done» answer; «Bajarilmadi» becomes a quiet secondary. For an upload task, the same with «Rasm tanlash». Nothing is inserted above existing content after a tap.
- Check: open a camera task and an upload task in time; the photo control is the first control on screen without any tap.

**D3 · Critical · Camera refused → «enable the camera for Telegram» inside the Android app** (`pages/ProofCamera.jsx`, i18n `proof.cam.deniedMsg` in 4 languages). The screen reads «Kameraga ruxsat berilmagan — Telefon sozlamalarida Telegram uchun kamerani yoqing, so'ng qayta urinib ko'ring.» with a gold «Qayta urinish».
- Fix: the message names where the person is — Android app (`inAndroidApp()`): «Safia IMS», a browser: the browser, Telegram: Telegram. The shutter is disabled (not gold, not «live») while there is no stream.

**D4 · Major · Camera glitch:** a giant grey play-button ghost fills the viewfinder before/without a stream — the WebView's default poster for a `<video>` with no `poster`. Fix: a transparent `poster` on the video element. Also: two stacked banners at the top («Muddat (08:30) o'tgan — bu ish uchun ball avtomatik berilmaydi», «Kechikkan isbotni 24:00 gacha yuborish mumkin») and a bottom hint («Kechikkan isbot uchun kamida bitta rasm oling.») — notes; keep one short status line at most. The header crams the task name, the leader's own name and an ISO date.

**D5 · Major · Every dialog is a centred card on a phone** (task sheet, late-proof form, objection form, concern dialog, «Kutish qo'shish» form). Below md, `Modal` should be a bottom sheet (thumb reach). Keep all `Modal` rules (focus to the card, trap, Escape asks before discarding a draft, `dialogLayers.js`). The ✕ is 18 px and a footer «Yopish» repeats it.

### 3.3 Shell: menu, landing page, header, notifications, login

**S1 · Major · Menu entries are named after our structure, not the leader's job** (`config/navLinks.js` names; order = stored layout).
- The checklist (job 1) lives in «Lider nazorati» (3rd item) → «Chek-list» tab; «Vazifalar» (tasks from management) is where instinct goes for «my tasks». «Xavotirlar» and «Yacheyka havotirlari» (two spellings) show **the same concerns** (same numbers, e.g. №11285, №11147) in two designs with different actions. Nine same-grey items with a search box; «Qo'llab-quvvatlash bilan b…» cut.
- Fix: see §4 (navigation). Names are code; order/grouping are the operator's stored layout.

**S2 · Major · The leader lands on «Zagruzka fayli»** (`/production`, the brigadir's production file). With no file for the day it opens on an admin instruction (`production.noSapData`: «Bu sana uchun SAP «faza» yuklamasi yo'q. Faylni Admin → Ishlab chiqarish orqali yuklang, so'ng o'sha sanani tanlang.») and five KPI cards of **red 0 %**.
- Fix: non-admins never see that instruction (show a neutral empty state); a day with no data shows «—», never red 0 %. Landing for a leader on a phone: see §4.

**S3 · Minor · Header:** page title printed twice on `/leaders` (bar + H1; the 28 Sep phone rework left it deliberately — **DECISION** to drop it for leaders on phones); `/cell-concerns` has no title on the bar; the menu says «Ojidaniya kiritish» while the page says «Yacheykalar bo'yicha kutish». Header buttons are 28 px (need 44 px targets).
**S4 · Minor · Profile popover:** cuts the leader's own name (a 35-character name ends in «…») — let it wrap to 2 lines; «Yangi profil qo'shish» is rarely a leader's need (keep, quieter).
**S5 · Minor · Notifications:** raw emojis inside text (✅ 🕐 📋 — the platform rule is no raw emojis); a Russian task name rendered in Latin letters («Obespokoennosti kiritish», checklist task №8) — give that task an Uzbek name in the checklist config rather than transliterating Russian. «Hammasini o'qildi» reads oddly.
**S6 · Minor · Login:** clean. One sentence about the interface («Ilovada tizimdan o'zingiz chiqmaguningizcha kirgan holda qolasiz»). «Profil qo'shish» raises the keyboard at once (fine); Samsung Pass then offers to save the password (OS behaviour).

### 3.4 «Lider nazorati» — Chek-list tab (`components/leaders/Checklist.jsx`, `ChecklistTaskSheet.jsx`, `checklistShared.js`)

**C1 · Critical · In the evening the page is a wall of red.** Leader A at 21:37: 9 of 13 rows carry a red «Vaqt tugadi» line and their own full-width «Kechikkan isbot» button (9 identical buttons, 3 screens). The 4 system-checked tasks («Tizim 10:00 da tekshiradi») sit under «QILISH KERAK» although the leader does nothing for them. «№» numbers appear out of order (2, 5, 1, 9, 8, 3, …) because rows sort by deadline.
**C2 · Major · One count three times:** «0 / 13 topshirildi», «Qoldi 13», «Qilish kerak 13».
**C3 · Likely · «13 / 13 topshirildi» above three tasks «Soat 20:00 gacha topshirilmadi»** (9 Nov). `Checklist.jsx:99` counts `t.locked` (per-task days), and a closed day locks missed tasks too. 9 Nov was closed by the test backend, and no production-closed October day of leader A had a missed task — confirm on a production-closed day with an `expired` task before changing the count (count filed/answered tasks, not locked ones).
**C4 · Major · The 24:00 rule is printed four times in one flow:** page banner «Kechikkan isbotni 24:00 gacha yuborish mumkin.», task-sheet paragraph («Muddat o'tdi, shuning uchun bu isbot o'z-o'zidan ball bermaydi. Sababingizni avval brigadir, keyin admin o'qiydi — qabul qilishsa, vazifa to'liq hisoblanadi. Kechikkan isbotni 24:00 gacha yuborish mumkin.»), the late form's amber box (same 4 sentences), the camera banner. Plus «Faqat tekshirilgan vazifalar hisoblanadi · jami 100» under the score, and on a phone «Kompyuterda skrinshotni Ctrl+V bilan ham qo'yishingiz mumkin.»
**C5 · Major · The late-proof form doesn't say which task:** header «№2» only. The «Kechikkan isbotlar» card reads «№2 #2» (name missing).
**C6 · Major · Objecting means reading first:** «E'tiroz bildirish» opens a red box, an «E'TIROZ» heading with three sentences, and a fourth sentence in the empty chat («E'tirozingiz brigadir va adminlar bilan chat bo'lib ochiladi.») before the text box.
**C7 · Keep · «Keyingi muddat»** (next deadline card, countdown, tappable, opens the task): the right idea — today it is small and sits inside the score card under a big «0 / 0».
**C8 · Keep · The past-day view** (e.g. 9 Nov: big «80%», green/red split bar, «Qabul qilindi 10 · O'tmadi 3», groups «Bajarilmadi» / «Qabul qilindi» with fold) — the best screen in the app.
**C9 · Minor:** «S1» / «S2» unexplained; proof-type glyphs (camera vs image-plus) too small to tell apart; the task sheet's «Yopish» repeats ✕; the 5th tab «Kechikkan isbotlar» sits off-screen on the strip; the «2» badge on «Norozliklar» doesn't match «Barchasi 23 / Yangi xabar 15» inside.

### 3.5 «Lider nazorati» — Monitoring, Vazifalar, Norozliklar, Kechikkan isbotlar, appeal chat

**M1 · Keep · «Mening o'rnim»** — three place tiles (brigada / smena / umumiy) with the leader's slot on a strip. Answers «how am I doing» in one look.
**M2 · Major · Below it, admin analytics for a leader:** two full-screen charts with task CODES (T1…T13) and no names («Bajarilish dinamikasi», «Vazifalar kesimida muvaffaqiyat»), «Eng past vazifa **T7**» on a green badge, tiles «Ko'rsatilgan hisobotlar 9 / Dalil rasmlari 114 (78 ta vazifa dalilida)». Title «Oxirgi hisobotlar (past ko'rsatkich birinchi)» explains its own sorting.
**M3 · Major · Report cards repeat the leader's own name** on every card (9× in 9 days), plus the brigadir, plus grey «0 ta vazifa bajarilmadi» on every 100 % day. The brigadir's surname is printed with «Kh…» on these cards and «X…» everywhere else in the same Uzbek interface (check which path applies the English name form).
**M4 · Major · «Vazifalar» tab reads as a manual:** an intro paragraph («Bu brigadada har bir vazifa alohida yopiladi. Ko'rsatilgan vaqt kelganda vazifa avtomatik yuboriladi…») and an amber box per task («Bu vazifani tizim o'zi tekshiradi: … botdagi «Ha»/«Yo'q» tugmalari bu vazifada ishlamaydi. Tekshiruvdan 30 daqiqa oldin eslatma…»). Four screens.
**M5 · Major · «Norozliklar» / «Kechikkan isbotlar» open with an explanation card** («AI, avtomatik tekshiruv yoki admin qarori bilan rad etilgan vazifa o'z og'irligini darhol yo'qotad… Batafsil»). Cards lead with the leader's own name in the biggest type; the task is small grey; 4–5 chips per card (status, AI reason, blue author status, «2 xabar», gold «1 yangi»).
**M6 · Major · «Barchasini ko'rsatish» silently clears the page period** for every tab (the date becomes «Sanalarni tanlang»).
**M7 · Minor:** search «Lider, brigadir yoki vazifa…» offered to a leader who sees only themself; the URL keeps `?tab=disputes` on the late tab.
**M8 · Keep · Appeal chat** (`/leaders/appeal/:kind/:id`) — messenger layout, header subtitle names the case on scroll. Only the «Muhokama» subtitle is a note («Lider, brigadir, adminlar va chatga qo'shilganlar ko'radi va xabar oladi»). Card title is again the leader's own name. (Proof photos looked broken in the audit only because the files live on the production server.)

### 3.6 `/tasks` — «Vazifalar» (`pages/Tasks.jsx`)

**T1 · Critical · An 841 px table in a 341 px card.** Visible: «Vazifa» and «Shoshilinch». Status (where the leader marks progress — a dropdown), «Muddat», «Kim qo'ydi», «Izohlar» are 1–2 swipes to the right. Tapping a task does nothing. Empty state centred on the full table width → «Mos vazifa topilm…» cut at the right edge. The table scrolls vertically inside the page (nested scroll). Rows are two lines.
**T2 · Minor:** no grouping by status or deadline; a «Tahlil» tab for a leader.

### 3.7 Concerns — `/cell-concerns` («Yacheyka havotirlari», `pages/CellConcerns.jsx`) and `/concerns` («Xavotirlar», `pages/Concerns.jsx`)

**K1 · Keep · The worker form «Havotir yozish»** — numbered steps, a hue per department, big cell buttons: the most alive screen in the app. Remove only its notes: page subtitle (`cellConcerns.subtitle`: «Ishchilar o'z yacheykasi bo'yicha havotir yozadi — lider hal qiladi yoki brigadirga ko'taradi.»), «To'liq ism-familiyangizni yozing — lider kim bilan gaplashishni bilishi uchun.», «Qanchalik aniq yozsangiz, shunchalik tez hal bo'ladi.». «Keles (xom…» is cut.
**K2 · Major · The register is a table:** the concern TEXT (what the leader acts on) is off-screen; dates ISO («2026-11-09»); plant chip for a one-plant leader; header «1 ta yozuv» repeats «Ochiq 1».
**K3 · Major · The concern dialog says everything twice:** the text (quote + textarea), the deadline (field «MUDDAT (KUN) 3» + hint «Hisob boshlangan kun: … · muddat: …» + «MUDDAT 3 kun · 2026-11-12»); note `cellConcerns.editHint` «Ishchining matnini faqat zarur bo'lganda tahrirlang.»; comments as a text link «Ochish (0)». (Footer overflow: D1.)
**K4 · Major · `/concerns` opens on three insight cards with decorative corner glows** (one is about the slowest BRIGADIR — not a leader's question); the leader's action «+ Xavotir qo'shish» is on screen 2; the «Xavotirlar / Tahlil» tabs sit mid-page under the cards.
**K5 · Major · `/concerns` cards are ~500 px tall** with the leader's own name three times (cell sub-label, «Xavotir egasi», «Mas'ul») and «Daraja: Lider» identical on all 147 cards; actions behind «Amallar ▾».
**K6 · Major · Same concerns, two pages** (S1). **DECISION** for leaders on phones — see §4.
**K7 · Minor:** «Tahlil» stacks 6 KPI cards one per row (1.5 screens for 6 numbers); department bars carry no numbers. In Russian `/cell-concerns` mixes languages («Написать хавотир», «Реестр хавотиров», «Хавотиры по ячейкам») while `/concerns` says «Обеспокоенности».

### 3.8 «Ish grafigi» (`pages/Kelish.jsx`)

**G1 · Keep:** tapping a person answers at once (green check, «Keladi 1»); the two live days are highlighted.
**G2 · Major · Under each cell, a how-to legend and a rule:** «Bosing: ▢ → ✔ Keladi → ✖ Kelmaydi → ▢» and «11-vazifa tekshiruvi: belgilanmagan — bugungi yoki ertangi ro'yxat, qaysi biri to'liq bo'lsa, hisoblanadi / Keyingi tekshiruv: 21.11, soat 20:00 — …», repeated per cell.
**G3 · Minor:** 5 dead day columns (22–26) a leader can't use (**DECISION**: the 7-day rolling week is the operator's directive of 29 Sep); the header counter «Sh 21.11 0/11» counts tomorrow so it doesn't move when today is marked; the cell head repeats the leader's own name; tap cells 31 px wide.

### 3.9 «Ojidaniya kiritish» (`pages/IdleCell.jsx`)

**I1 · Major:** static «Brigadir: …» chip cut (F1/F10); «Kategoriyalar» button wraps to a second toolbar row.
**I2 · Minor:** the «Vaqt chizig'i» tab looks identical to «Kutish» when empty; «Perenaladka» note «Daqiqani yozing — Enter bosilganda yoki maydondan chiqqanda o'zi saqlanadi» (no Enter on a phone); the «Kutish qo'shish» form carries «Avval boshlanish vaqtini tanlang», «Boshlanish va tugash vaqtini tanlang», `idleCell.stoppedHint` «Kun jamisiga faqat to'xtagan kutishlar kiradi» and «(majburiy)» next to a red *.

### 3.10 «Zagruzka fayli» (`pages/Production.jsx`)

**P1 · Major · The leader sees work centre «A2723» and letters A/B, never their cells 7213 / 7214.** `production.cellScope` «Faqat sizning yacheykalaringiz: A2723» labels a work centre as cells (CLAUDE.md: a cell is printed by its verifix CODE).
**P2 · Major · Positions table on a phone:** opens on №, Navbat, SAP kod, Faza (mostly «—») with product names off-screen; its toolbar wraps to 3 rows (search + Filtrlar / Navbatni tartiblash / Kechagi tartib + columns); a big green «Excelga eksport» (green is a status colour) outshouts the data; nested vertical scroll.
**P3 · Minor · «Odamlar soni» tab** is a manager tool for a leader: editable «Samaradorlik 85 %», «Tavsiya (formula)» tables of zeros.
**P4:** admin instruction + red zeros on an empty day (S2); KPI cards ignore the cell filter (F5); toolbar reflow (F6). Closed day banner «Kun yopilgan · … — Zagruzka fayli faqat ko'rish uchun. O'zgartirish uchun kunni qayta ochish kerak.» is a state (fine), but two lines.

### 3.11 Ta'lim, Imtihon, Profil

**E1 · Minor · Ta'lim:** subtitle note `education.subtitle` «Sizga biriktirilgan video darslar».
**E2 · Minor · Imtihon:** lead paragraph `exam.subtitle` «Dashboard bilan ishlashni bilasizmi? Vazifalarni odatdagi sahifalarda bajaring — tizim o'zi tekshiradi.», an empty-state paragraph and a practice paragraph.
**E3 · Minor · Profil:** «Ism (tillar bo'yicha)» lists the leader's own name 4× (truncated); descriptions under «Sayt logini» and «Telegram akkauntlar».

### 3.12 Cross-cutting

- **X1 Notes on the page** (operator, 2026-11-20: never). Every string quoted above with a key or an anchor is a note to remove on phones; total ≈ 25.
- **X2 The leader's own name on their own records** — Monitoring cards, objection and late-proof cards, `/concerns` cards (×3), «Ish grafigi» and «Kutish» cell heads, cell filter options («7213 · <the leader's own name>»), camera header, appeal chat title.
- **X3 Codes instead of names** — T1…T13 and «T7» on Monitoring; A2723 instead of 7213/7214 on «Zagruzka fayli».
- **X4 Desktop tables on phones** — `/tasks`, `/cell-concerns` register, positions table.
- **X5 Tap targets** — header buttons 28 px, `SegmentedToggle` segments 28 px, ✕ 18 px, «Ish grafigi» cells 31 px wide.
- **X6 Accessibility** — calendar days in `DateRangePicker` are plain text, not buttons; unlabelled sheet ✕.
- **X7 Dates** — ISO «2026-11-09» on concerns; «9-noyabr, 2026», «09.11», «01/11 – 09/11», «14.11.26» elsewhere.
- **X8 Text below 12 px on phones** — 10 px uppercase labels on the «Zagruzka fayli» KPI cards («BAJARISH %», «ODAMLAR (Σ)», «UMUMIY TRUD. (MIN)» …), the «Mening o'rnim» tiles, «Hammasini tanlash» in filter sheets (10 px), count badges (10 px), calendar weekday heads (10 px).
- **X9 Date picker on a phone** (`DateRangePicker`): a single date needs two taps (day, then «Qo'llash»); the quick picks («Bugun», «Kecha», «Oxirgi 7 kun» …) look like plain text, not buttons; the sheet title says «Sanalarni tanlang» (plural) for a single date. Monitoring's empty state offers «Davr va filtrlarni tozalash» to a leader who has no filters there; Monitoring cards carry an «i» methodology icon.
- **Light theme:** spot-checked on two pages — same issues, nothing theme-specific.

---

## 4. The design (mobile only)

**Insight.** A leader opens the app on the floor, between two jobs, with one question: *what do I owe right now, and is anyone waiting on me?* Today the answer is spread over 9 menu items and 5 tabs.

**Concept: «Bugun» — the leader's day.** On a phone the leader lands on their day, in the order the shift asks for it:
1. **Next** — the next task due, big and alone at the top: name, a countdown drawn as a shrinking bar, and its one action («Suratga olish» for a camera task, «Rasm tanlash» for an upload task). This is today's «Keyingi muddat», promoted.
2. **Later today** — the remaining open tasks, one row each (name, deadline, proof icon), tap opens the sheet.
3. **Missed (late window open)** — one group with ONE «Kechikkan isbot» action; a row tap opens that task's late form. Red stays on the group's marker, not on every row.
4. **The system checks** — one quiet strip «Tizim tekshiradi · 4», expandable.
5. **Done** — folded, like the past-day view.
6. **Inbox strip** — one row per thing waiting on the leader, each with a count and a jump: open worker concerns · objections with a new message · a task from the brigadir · tomorrow's «Ish grafigi» not marked. A row with zero is not shown.
- The day score is drawn as a ring (with «Qoldi n» inside), never «0 / 0».

**Navigation for leaders on a phone** — five entries named for the job (names are i18n in code; ORDER and grouping live in the stored nav layout the operator arranges on the org chart's «Ilovalar» view):
| Entry | What it is | Built from |
|---|---|---|
| «Bugun» | the day + inbox (landing) | `/leaders` Chek-list tab cores |
| «Havotirlar» | write · open · solved | `/cell-concerns` (DECISION: one page for leaders) |
| «Ish grafigi» | today + tomorrow | `/kelish` |
| «Kutish» | waiting times | `/idle-cell` (same name in menu and page) |
| «Natijam» | my place, my days, my objections | `/leaders` Monitoring + Norozliklar + Kechikkan isbotlar |
Below them, quieter: «Rahbariyat vazifalari» (`/tasks`), Ta'lim, Imtihon. «Zagruzka fayli» leaves the leader's landing; if leaders keep it, it shows their cells by code.

**Life (identity hues).** One hue per job area, worn on its menu icon, its inbox row and its progress mark — never a status colour (red/yellow/green stay statuses), gold stays the action colour: «Bugun» blue, «Havotirlar» orange, «Ish grafigi» teal, «Kutish» purple, «Natijam» pink (from `utils/chartPalette.js` `CATEGORY_COLORS`). One strong moment per screen: the next task on «Bugun», the place on «Natijam».

**Rules the design keeps:** both doors stay (bot `/tasks` and web write the same rows through the same cores — `leader_checklist.save_answer`, `close_day`, `leader_close.close_task`); nothing is scored on the client (§«Nothing is computed here» in `docs/leaders-page.md`); camera tasks never accept a file; the Modal / ConfirmDialog / Toast / ActionMenu rules in CLAUDE.md.

---

## 5. Build plan (every item gated below md; desktop unchanged)

### Phase 0 — fix what is broken (templates first; MINOR bump)
| # | Item | Files | Done when |
|---|---|---|---|
| 0.1 | F1: chips always wrap below md | `components/ui/ColumnFilter.jsx` (FilterPanel) | F1 check passes on `/cell-concerns`, `/concerns`, `/idle-cell`, `/tasks`, `/production` |
| 0.2 | F3b: no secondary action in the chip row on phones | ColumnFilter + `/concerns` toolbar | Excel not in the row at 320–414 px |
| 0.3 | F2/F3: one clear control in the sheet header; nothing inserted above options | ColumnFilter (phone sheet) | option tops identical before/after a tick |
| 0.4 | F4: hide ≤1-option sections, single-section group captions, search under ~8 options | ColumnFilter (`PickFilter`, `OptsFilter`, groups) | no such section on any leader page |
| 0.5 | F7/F8/F9: consistent pick close; chip shows section name; ✕ labelled, 44 px | ColumnFilter | — |
| 0.6 | D1/D5 (part): Modal footer stacks below md, destructive → ⋮ | `components/ui/Modal.jsx`, `ActionMenu.jsx`, `CellConcerns.jsx` | no button outside any dialog at 320 px |
| 0.7 | D2: camera / upload task sheet opens on its photo action | `ChecklistTaskSheet.jsx` | photo control first, no tap needed, no insertion shift |
| 0.8 | D3/D4: camera copy by context; transparent poster; disabled shutter without stream | `pages/ProofCamera.jsx`, i18n `proof.cam.deniedMsg` ×4 langs | refused-camera screen in the Android app names Safia IMS |
| 0.9 | T1 (part): empty state centred in the visible width | `components/ui/DataTable.jsx` | «Mos vazifa topilmadi» fully visible at 320 px |
| 0.10 | C3 (after confirming): count filed tasks, not locked | `Checklist.jsx` (`submitted`) | a closed day with a missed task shows 12 / 13 |
| 0.11 | C5: task name on late form and late card | `ChecklistTaskSheet.jsx`, `LateProofs.jsx` | «№2 · Kaskad uchrashuv…» |
| 0.12 | M3: one name form per language on Monitoring cards | `pages/Leaders.jsx` | same spelling as the header |
| 0.13 | F5: KPI cards follow the filter or say their scope | `Production.jsx`, `Concerns.jsx` | — |
| 0.14 | F6: toolbar keeps its shape when a filter is set | `Production.jsx` / FilterPanel | nothing above the content moves |
| 0.15 | X6: calendar days are buttons with a date label | `components/ui/DateRangePicker.jsx` | — |
| 0.16 | M6: «Barchasini ko'rsatish» does not clear the page period silently | `Disputes.jsx`, `LateProofs.jsx` / `AppealQueue.jsx` | — |
| 0.17 | S2: non-admins never see `production.noSapData`; empty day shows «—», not red 0 % | `Production.jsx` | — |
| 0.18 | S4, S5, M7: popover name wraps; no raw emojis in notification text; task №8 gets an Uzbek name in config (data, ask the operator); late tab URL | Layout / notifications / config | — |

### Phase 1 — make the templates phone-native (MINOR bump)
| # | Item | Files | Done when |
|---|---|---|---|
| 1.1 | `DataTable` phone card mode: a row becomes a card — title, 2–3 key facts, status chip; the whole card opens the record; no inner vertical scroll below md (check first whether DataTable's existing phone list — `mobileMaxHeight` — can be extended rather than forked) | `DataTable.jsx`; apply in `Tasks.jsx` (open task + status change in the card), `CellConcerns.jsx` register (concern text first, worker, cell code, status, deadline), `Production.jsx` positions (product name first, plan / fact) | no horizontal scroll on those three lists at 320–414 px |
| 1.2 | `Modal` → bottom sheet below md (reuse `.sheet` / `.sheet-backdrop`, `leaveRef`) | `Modal.jsx` | all leader dialogs open from the bottom; `run.mjs` motion check passes |
| 1.3 | Notes purge on phones: every string in §3 tagged as a note (≈25) hidden below md (`max-md:hidden`) or dropped where it only ever renders on phones | the files named in §3 | §3 notes absent at 384 px; desktop unchanged |
| 1.4 | Own-name rule (X2): when the viewer IS the leader, their own name is not printed on their own records | Leaders.jsx (cards), Disputes/LateProofs, Concerns cards, Kelish/IdleCell heads (`CellIdent`), cell filter options, ProofCamera header, appeal chat title | — |
| 1.5 | Tap targets ≥ 44 px below md (X5): header buttons, ✕, `SegmentedToggle size="lg"` for phone view tabs, «Ish grafigi» cells | Layout, Modal, pages | sweep finds no interactive element < 44 px (except deliberate inline links) |
| 1.6 | Dates in one format on phones (X7) | concerns pages | — |

### Phase 2 — the leader's information architecture on phones (MINOR bump; DECISION items confirmed first)
| # | Item | Notes |
|---|---|---|
| 2.1 | «Bugun»: the Chek-list tab re-cut as §4 (Next · Later · Missed group · System strip · Done · Inbox strip · score ring) | same cores, same endpoints; the inbox counts come from existing endpoints (concerns, disputes/late unread, task_day, kelish week) or one small summary endpoint — choose the one with fewer requests |
| 2.2 | Leader's landing on a phone = «Bugun» (DECISION) | today: `/production` |
| 2.3 | Menu names for leaders (code) + proposed order (operator arranges in the stored layout) | `config/navLinks.js`, i18n; never reorder in code expecting it to move a saved layout |
| 2.4 | One «Havotirlar» page for leaders on phones (DECISION): `/cell-concerns` keeps write + register; `/concerns` leaves the leader's phone menu | both pages share `leader_concerns`; no data change |
| 2.5 | «Natijam» for leaders on phones: «Mening o'rnim» first, the days as a calendar strip (from the day results), objections and late proofs as one list «Bahslar»; T-code charts hidden for leaders below md; task names instead of T-codes wherever shown | the standing card's rule stays the board's (§«Mening o'rnim») |
| 2.6 | «Zagruzka fayli» for leaders on phones: cells by code (7213 · A), not the work centre; «Odamlar soni» tab hidden for leaders (DECISION) | — |
| 2.7 | «Ish grafigi» on phones: legend and rule sentences gone; T11 state drawn as one chip; today + tomorrow only (DECISION — overrides the 7-day week directive) | — |
| 2.8 | Objection and late-proof forms: the text box first, one short line of state at most | — |

### Phase 3 — life (patch-level polish after Phase 2)
Identity hues per area (§4), the score ring, one strong moment per screen; check every screen against the standing brief («lacks life…» must not apply).

---

## 6. Verification protocol (each phase, before calling it done)

**In a cloud session** (no phone): the database is empty there — seed a fixture or mock the endpoints: one plant, one unit with a brigadir, a leader with 2 cells and a long name (35+ chars), 13 checklist tasks for today in mixed states (open in time, missed with late window, system-checked, accepted, rejected, expired) on per-task closing, 5 concerns (1 open), 3 objections (1 with a new message), 1 late proof, 2 tasks from the brigadir, an «Ish grafigi» list of 11 people. Then render with the `run-safia-project` driver at **320×700, 375×812, 384×781 (the A16 in the app), 414×896**, and **1280×800 for desktop parity**, in **uz, uz_cyrl, ru, en**, dark and light.

For every page and state run the DOM sweep (Appendix A) and look at the screenshot itself:
- nothing past the viewport or its clipping parent (no `overflow`), no ellipsis-cut text the person needs (`cut`), no interactive element under 44 px (`small`), no text under 12 px on phones (`tiny`), no overlapping text (`overlap`);
- filters: set 1, 2, 3 filters on each page; every chip fully visible; option tops unchanged after each tick (Appendix B);
- dialogs: open every leader dialog at 320 px; footer inside the card; it opens from the bottom;
- the jobs in §2 walked from the landing screen without reading any explanatory sentence;
- desktop parity: screenshots of every touched page at 1280 px before and after are identical.

**Back on the laptop** (final check on the real phone): the phone rig in the operator's memory (`phone-verification-rig`) — a side-by-side debug build of `android/` pointed at a local backend on a scratch copy of the database, `adb reverse`, the WebView DevTools socket, `adb exec-out screencap` for pixels, touch events at element centres, USB mode «No data transfer». Ask the operator before using the phone.

---

## 7. Not covered by the audit

- Not opened: `/tasks` «Tahlil», «Kategoriyalar» on «Kutish», the columns picker and «Konteynerlar» on «Zagruzka fayli», the video player in Ta'lim, exam practice, the password-change dialog, «+ Xavotir qo'shish» and «Amallar» on `/concerns`, a day report page, tapping a notification. Nothing was submitted (no proof, objection, concern or wait was sent).
- Not tested: the live camera view (permission refused on purpose), widths other than 384 px, uz_cyrl and en, the Telegram mini-app (only the Android app), Verifix-fed numbers (absent in the copy).
- Rig artefacts, not findings: broken proof photos (files live on the production server); notifications marked «11 daq oldin» and the «+11 kun» stamp on the 9 Nov report (made by the test backend's own startup jobs).

---

## Appendix A — DOM sweep (run in the page; returns faults on the current screen)

```js
(() => {
  const vw = innerWidth, out = { overflow: [], cut: [], small: [], tiny: [], overlap: [] };
  const vis = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.opacity !== "0" && r.bottom > 0 && r.top < innerHeight; };
  const name = (el) => (el.getAttribute("aria-label") || el.innerText || el.tagName).trim().replace(/\s+/g, " ").slice(0, 50);
  const all = [...document.querySelectorAll("body *")]
    .filter((el) => !el.closest("svg") || el.tagName === "svg").filter(vis)
    .filter((el) => { const r = el.getBoundingClientRect(); return r.right > 1 && r.left < vw - 1; }); // skip off-canvas drawers
  for (const el of all) {
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    if (el.children.length === 0 && (r.right > vw + 1 || r.left < -1)) {
      let a = el.parentElement, scroller = false;
      while (a) { const o = getComputedStyle(a).overflowX; if (o === "auto" || o === "scroll") { scroller = true; break; } a = a.parentElement; }
      if (!scroller) out.overflow.push({ t: name(el), l: Math.round(r.left), r: Math.round(r.right) });
    }
    // a child running past its clipping/scrolling parent (the hidden-chip case)
    const p = el.parentElement;
    if (p && ["auto", "scroll", "hidden", "clip"].includes(getComputedStyle(p).overflowX)) {
      const pr = p.getBoundingClientRect();
      if (r.right > pr.right + 1 && el.matches("button,[role=button],a")) out.overflow.push({ t: name(el), clippedBy: Math.round(r.right - pr.right) });
    }
    if (el.children.length === 0 && el.innerText && el.scrollWidth > el.clientWidth + 1 && (cs.textOverflow === "ellipsis" || cs.overflow === "hidden"))
      out.cut.push({ t: name(el), w: el.clientWidth, need: el.scrollWidth });
    if (el.children.length === 0 && el.innerText?.trim() && parseFloat(cs.fontSize) < 12) out.tiny.push({ t: name(el), fs: cs.fontSize });
    if (el.matches("button,a[href],[role=button],[role=tab],input,select,textarea,[role=option],[role=menuitem]") && (r.width < 44 || r.height < 44))
      out.small.push({ t: name(el), w: Math.round(r.width), h: Math.round(r.height) });
  }
  const leaves = all.filter((el) => el.children.length === 0 && el.innerText?.trim());
  for (let i = 0; i < leaves.length; i++) for (let j = i + 1; j < leaves.length; j++) {
    const a = leaves[i].getBoundingClientRect(), b = leaves[j].getBoundingClientRect();
    if (Math.min(a.right, b.right) - Math.max(a.left, b.left) > 2 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 2)
      out.overlap.push(name(leaves[i]) + "  ⟂  " + name(leaves[j]));
  }
  return out; // note: an open dialog/sheet "overlaps" the page under it — read overlap with that in mind
})()
```

## Appendix B — "does the list move under the finger?" check

```js
// 1) before a tap: record option tops inside the open sheet
window.__tops = [...document.querySelectorAll(".sheet label, .sheet [role=option]")].map((e) => [e.innerText.trim(), Math.round(e.getBoundingClientRect().top)]);
// 2) tap an option (a real touch), then:
[...document.querySelectorAll(".sheet label, .sheet [role=option]")]
  .map((e) => [e.innerText.trim(), Math.round(e.getBoundingClientRect().top)])
  .filter(([t, y]) => { const was = window.__tops.find(([u]) => u === t); return was && was[1] !== y; }); // must be []
```

## Appendix C — the DECISION items in one list (confirm with the operator before building)

1. Leader's landing on a phone becomes «Bugun» (today `/production`); «Chek-list» second on the `/leaders` strip (28 Sep ruling) stays for admins and brigadirs.
2. One «Havotirlar» page for leaders on phones (`/concerns` leaves their phone menu; data unchanged).
3. «Ish grafigi» shows today + tomorrow on phones (the 29 Sep rolling-week directive stays on desktop).
4. Menu names for leaders (code) and their order (the operator's stored layout).
5. The duplicated page title on `/leaders` dropped for leaders on phones (left deliberately on 28 Sep).
6. Static plant / brigadir chips hidden on phones (CLAUDE.md: a locked viewer gets an inert plant chip).
7. «Odamlar soni» hidden for leaders on phones.
8. Can a leader delete a worker's concern at all? (Today: yes, a red «O'chirish» in the dialog.)
9. Checklist task №8 «Обеспокоенности…» gets an Uzbek name in the config (data change).
