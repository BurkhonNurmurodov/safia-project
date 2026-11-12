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
  the shift's end, never past it); after now (`plan: true`), what the SAME
  rows' schedules say — whoever is at work stays until their shift's planned
  end, whoever is «Hali kelmagan» comes at its planned start and stays to its
  end. Nobody who did not come is expected and nobody leaves early; a person
  with no schedule end is kept for the rest of the day. The page draws the
  forecast as a dashed outline under a lighter figure (shape, never colour
  alone — a «~» before each number crowded the row), highlights
  the current hour, and opens scrolled to it — 24 columns are wider than a
  phone or a laptop. Plain CSS bars: the page loads no chart library. The
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
- **What it is for — NOT built yet**: the analysis (turnout per shift window
  by weekday / month / season, how early people clock in and how late they
  leave) and, from it, the forecast of the shifts that have not started. Ask
  production for the table through the report door (`scripts/ask-prod.py
  sql`, aggregated in the SELECT — a year is more than its 5,000 rows).
  Until then «Soatlar bo'yicha» keeps assuming everybody scheduled comes.
