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
- **A night shift is filed under the day it started**, so until 14:00
  yesterday's rows are read too: somebody still inside from last night counts
  in «Hozir ishda» (and is named in the sentence under the number, `night`)
  but not in «Bugun keldi».
- **«Kun davomida ishda»** — the people in the building at the start of each
  hour of today, from the same clocks; a missing check-out counts up to the
  shift's end, never past it. Plain CSS bars: the page loads no chart library.
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
  or portions, names, past days, an export, sortable columns.
