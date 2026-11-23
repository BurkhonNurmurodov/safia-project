# Oshxona — the kitchen's app

## «Oshxona» — the people at work in the factory now (`/kitchen`, 2026-11-12)

The operator: «create a new app inside the IMS — kitchen, and on these pages we
need the current number of workers who came to work inside the factory branch.
You need to use verifix API». Read as: the kitchen (the canteen — the concerns
register's «Oshxona» category is the same place) cooks for whoever came, so the
page answers how many people are at work right now. **Not confirmed with the
operator**: if «kitchen» meant something else, the numbers stand and only the
names change.

- **The app** is `kitchen` in `config/navLinks.js` `APPS` (`ChefHat`, hue `red`,
  after automation), a one-page app. The page is «Ishdagilar soni» at
  `/kitchen`, page key `kitchen`, **admin-only until opened on the Access
  tab**; for a role without the launcher its row sits in the People group.
- **Counts and department names only — never a person**, so the page may be
  opened to a kitchen role without showing anybody's attendance.
- **Who is counted: everybody in the Verifix organization** the platform is
  connected to (`verifix_filial_id` — the factory), not only the production
  cells: `services/kitchen.py` reads «Отчёт по посещениям»
  (`core/timesheet$export`) with no employee filter. The minute job's stored
  read (`verifix_live`, the workload cells' people — fresher, with door marks)
  is laid over it, so those people read exactly as /staff reads them.
  Everybody else is judged by the report's own `input_time` / `output_time`:
  the whole plant's marks cost ~25 s a call.
- **Who is where is `verifix_live._person`'s answer**, never a second rule:
  «Hozir ishda» = `inside` + `break` (out of the door before the shift's end
  is a break, as on /staff); «Ketdi» = `left` + `no_out`; «Hali kelmagan» =
  `not_yet` (the shift starts later — tonight's shift, for the evening meal);
  «Kelmadi» = `absent`. A day off is on no line.
- **A night shift is filed under the day it started**, so yesterday's rows
  are ALWAYS read with today's: somebody still inside from last night counts
  in «Hozir ishda» (and is named in the sentence under the number, `night`)
  but not in «Bugun keldi», and this morning's hours hold last night's people
  all day. (Until 2026-11-12 yesterday was read only before 14:00, and the
  early hours emptied in the afternoon.)
- **«Soatlar bo'yicha» — every hour of today with its NUMBER printed, then
  the forecast** (the operator, 2026-11-12: «show the numbers per hour
  somewhere … you know how many people have arrived and when they're
  (approximately) leaving based on the time schedule, so you can show planned
  forecast»). `hours` is 24 slots: up to now, the people in the building at
  the start of the hour, from the clocks (a missing check-out counts up to
  the shift's end, never past it); after now (`plan: true`), the forecast —
  until 2026-11-23 what the same rows' schedules said (whoever is at work
  stays until their shift's planned end, whoever is «Hali kelmagan» comes at
  its planned start; nobody who did not come expected, nobody leaving early),
  since then `kitchen_forecast` — see «The forecast learned from two years»
  below. The page draws the
  forecast as a dashed outline under a lighter figure (shape, never colour
  alone — a «~» before each number crowded the row) and highlights
  the current hour. Plain CSS bars: the page loads no chart library. (It
  used to scroll sideways and open on the current hour; from 2026-11-14 the
  hours wrap — see «The page redesigned».) The
  first cut (a small hover-to-read chart inside the top card) hid the numbers
  behind a hover a phone does not have.
- **«Bo'limlar bo'yicha»** — the same five counts per Verifix department (the
  employee's `division_id` in the stored directory), biggest first.
- **One read serves everybody**: `GET /api/kitchen/now` → `kitchen.headcount`,
  a snapshot kept in memory for 120 s. One read at a time — whoever asks while
  it runs gets the last snapshot and waits only when there is none (the first
  open after a deploy, ~the time of 30 report pages). A failed read is not
  retried for 60 s and the last snapshot keeps serving with its age (`age_s`);
  past 10 minutes the page says Verifix is silent and the live dot turns amber.
  Nobody on the page = no Verifix calls at all.
- **Not built:** a split by plant (only brigadirs hang on a plant), meal times
  or portions, names, past days, an export, sortable columns, arrivals and
  departures per hour, a forecast past midnight.

## The page redesigned — one roster, four colours (2026-11-14)

The operator: «this page lacks a life … doesn't give you a motivation to use
it», with the standing taste (clean, each thing in its place, nothing
overlapping on any screen, several colours and none of them dominating). The
old page was gold and grey only, said «came 1 471, left 54» twice (a sentence
and two cards), left half of the top card empty and scrolled its chart
sideways. Frontend only — `/api/kitchen/now` is unchanged.

- **One hue per answer, everywhere on the page** (`PARTS` in
  `pages/Kitchen.jsx`): at work green · left slate · not in yet blue · did not
  come red — the roster bar, the hours' bars, the table's header dots and
  every department's bar. Purple and teal are the two section chips; gold is
  on nothing here.
- **The top card is the number AND the day it is part of.** Left: «Hozir
  ishda», the figure, «Soat 16:00 da 1 446 kishi kutilmoqda» (the first hour
  still ahead from `hours`; none after 23:00) and the read time. Right:
  «Bugungi tarkib» — ONE `SplitBar` of today's roster with its four figures
  under it and «3 060 kishidan 1 471 nafari keldi». It replaced the sentence
  and the four KPI cards; no figure was dropped.
- **The roster's «Ishda» is `inside − night`**: somebody still here from last
  night is at work but today is already one of the other three for them, so
  the four parts never overlap and add up to came + not in yet + did not
  come. The big figure stays `inside`; the night line under the roster names
  the difference.
- **The 24 hours wrap to the card's own width** — 24 · 12 · 8 · 6 a row by
  container query, one scale for every row — so no screen scrolls them
  sideways or squeezes a number. The header names the day's peak hour.
- **A department's row carries its own roster bar** (full width = that
  department's people today), so a row heavy with «Kelmadi» shows without
  reading four numbers. On a phone: name · bar · «Hozir ishda».
- The halves of the top card and its four figures split by flex-wrap and
  container queries, never viewport breakpoints (the sidebar takes ~330px).

## A year of attendance, as counts (`kitchen_history`, 2026-11-12)

The operator, on the forecast: «based on the work schedule we can only
forecast the current shift's workers per hour, and we don't know how many of
the other shift's workers will come. So for the other shifts we need to use
the historical data … get the reports of the workers' coming and leaving
hours for 12 months from the verifix and analyze it, find the trends and find
the best way to forecast them». A session cannot reach Verifix (the login is
on the server), so the year is COLLECTED on production first and analysed
after, through the report door.

- **`services/kitchen_history.py` + table `kitchen_history`**: one row per
  past day and SHIFT WINDOW (`starts` / `ends`, the day's own planned begin /
  end, else the schedule's name — `_person`'s reading) with `planned`
  (scheduled to work), `came` (clocked in), `no_out` (no clock-out) and two
  10-minute histograms, `arr` and `dep`, keyed by the minutes since that
  day's 00:00 (past 1440 = the next morning: a night shift's exits). The row
  with both windows "" holds the people with no window — a day off somebody
  came on, a schedule without hours — and is written for EVERY day read, so
  «a day with a row» is «a day that was read». **Counts only: no person, no
  name, no department.**
- **The job** (`kitchen-history`, every 10 minutes, registered in both
  entrypoints): reads «Отчёт по посещениям» for the whole factory a WEEK at
  a time (~30 pages of 100 people), newest first, up to 4 minutes a run,
  until the last 365 days are stored — about 52 reads, a couple of hours
  after the deploy that ships it — then one new day a day, once it is 2 days
  old (a night ends the next morning; Verifix fills check-outs in late). A
  week's days are replaced whole in one transaction, so a re-read never
  doubles a count. A failed read parks the job for an hour. With the year
  stored a tick is one query.
- **Two years from 2026-11-23** (`DAYS` 365 → 730; the operator: «if you
  need more data, take as much as it needed»). The first year, read whole
  on 2026-11-23 (20,587 rows, 11 Nov 2025 – 21 Nov 2026, five door asks by
  date range), holds ONE of each holiday that empties the plant — New Year
  and the two Eids, the days the forecast misses most — so a «same holiday
  last year» rule could not be checked against anything. (Navruz, 8 March,
  9 May, 1 September and 1 October do not: each stays at ≥ 0.90 of a normal
  day of its weekday; nor does Ramadan outside its Eid.) The job read the
  second year back the same way, newest first, within an hour of the deploy
  that shipped it: all 730 days, 22 Nov 2024 – 21 Nov 2026, real counts in
  both years.
- **What it is for**: the forecast of «Soatlar bo'yicha» — see the next
  section. To analyse it again, ask production for the table through the
  report door (`scripts/ask-prod.py sql`) by date range: a year is about
  21,000 rows, five asks of ≤ 5,000.

## The forecast learned from two years (`kitchen_forecast`, 2026-11-23)

The operator: «analyze these data, analyze the patterns, then, based on that
build a forecast algorithm which [is] perfect», then «discuss it first», «if
you need more data, take as much as it needed», and for the Eids: «calculate
by your own; when by your calculation [the holiday] starts in 3 days check
that trustable source if it's true». Shipped on «I liked your model. Ship it»
after a day-by-day check on 50 random normal and 50 holiday days.

- **What decides an hour ahead** (`services/kitchen_forecast.py`; `kitchen.
  tally` groups today's and yesterday's people by shift window — planned,
  arrived, inside now — and asks `expect`):
  - HOW MANY of a window's scheduled people come — per window and weekday,
    over the last 84 days, holiday days left out, shrunk toward the window's
    overall rate and the plant's (79 % come; 71 % on a Sunday);
  - WHEN they come and go — each window's own clock-in offsets from its start
    and clock-out offsets from its end, paired first-in-first-out, the plant's
    pooled offsets blended in where a window has little history; overtime
    runs in spells, so a big window's leave times take its newest 5 stored
    days at 80 %;
  - THE HOLIDAY — below;
  - THE DAY ITSELF — the windows already under way (yesterday's at half
    weight) against their expected turnout scale the windows still to come.
  People with no window come and go by the clock, as many as usual for the
  weekday. With no history (a box without the table) the forecast is the old
  schedules-only rule.
- **Holidays: only three empty the plant**, each the same way every year (of
  a normal day of its weekday): New Year's Eve 0.18 / 0.20, Ramazon hayit
  0.44 / 0.47, Qurbon hayit 0.59 / 0.69 — from two days before to five after.
  Navruz, 8 March, 9 May, 1 September, 1 October and Ramadan itself stay at
  0.90 and more, and are ordinary days to the model. A day on such a ramp
  takes, WINDOW BY WINDOW, how the same day of the same holiday came in up to
  five earlier years against what the model expected of it (31 Dec: «08:00–
  17:00» came 0.12 both years, «17:00–02:00» nobody), shrunk toward the
  day's own factor. The factors are learned only on a ramp day (≈ 0.1 s); a
  normal day reads nothing extra.
- **The Eid dates are CALCULATED, then confirmed by decree.** `calculated`:
  Meeus' new moon; the month starts the next day when the new moon falls
  before sunset at Mecca, else the day after (Ramazon hayit = 1 Shawwal,
  Qurbon hayit = 10 Dhu al-Hijjah). It gives every decree of 2024–2026 and
  Google's 2021–2023. Google and timeanddate are NOT used: both put Qurbon
  hayit 2025 on 7 June, the decree and the plant on the 6th. From three days
  before each calculated Eid to five after (`CHECK`), `eid_dates` reads the
  President's decisions list (`DECREES_URL`, president.uz) for its «…
  hayitini nishonlash to'g'risida» and takes the day its sentence names
  («… hayitining birinchi kuni 6-iyun …», or «Joriy yilda …») — only within
  two days of the calculation, else the calculation stands. The decrees come
  out 2–7 days ahead (Ramazon hayit 2026: on 18 March for the 20th), so the
  check repeats hourly until one is found; a model learned while an Eid near
  today is unconfirmed is relearned after an hour. A past Eid is settled on
  the day the plant emptied (± 1). **Not tested: that the production server
  reaches president.uz** — if it does not, the calculation alone is used and
  the log says «the decree list did not answer».
- **How good** (replayed from 06:00 … 20:00 of each day, the hours still
  ahead): 1 Jun – 21 Nov 2026, 25.6 people an hour off (2.6 %) against 186
  for the schedules-only rule; 16 Feb – 10 Nov 2025, which no constant was
  tuned on, 30.9 (3.4 %). 50 random normal days: 27.5, 49 of them under 5 %.
  The 24 holiday days of the second year, learned from the first: 89 → 57
  (at 06:00 149 → 68; 31 Dec 247 → 56, Ramazon hayit 151 → 59, Qurbon hayit
  124 → 73). The rule was better on 15 of those 24 and worse on 8 — most on
  the day after Qurbon hayit 2026 (44 → 97, too high): the 2026 decree gave
  everybody 28–29 May off, the 2025 one only the Saturday to six-day weeks.
  **Not built**: reading a decree's extra days off («qo'shimcha dam olish
  kuni»); a ± range on the page.
- The page's text changed in one place: the «Soatlar bo'yicha» subtitle
  (`hoursSub`, 4 languages) now says what the dashed figures are learned from.
