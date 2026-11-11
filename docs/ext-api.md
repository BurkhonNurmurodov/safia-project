# The external read API

## The external read API (`/api/ext/v1`, 2026-11-11)

The operator asked for an API another system can read: the cells (Verifix
code, SAP code, group), a cell's plan for a date, its SKUs for a date, and the
workers' clock-in/out for a date — «the date also could be today».
`routers/ext_api.py`, three GETs, read-only.

- **The key.** `X-Api-Key: <key>` (or `Authorization: Bearer <key>`), checked
  against `ext_api.KEYS` — SHA-256 digests in code, the oven collector's
  pattern: the key itself is never in git or the DB (the first one is
  `ext-api.key` in the operator's checkout, gitignored by `*.key`). A new
  consumer is a new digest; deleting a digest revokes it. Wrong keys share the
  report door's throttle (ten in ten minutes per address). `/api/ext/` is in
  `security._EXEMPT_PREFIXES`, so no Telegram session is involved.
- **`date=YYYY-MM-DD`** on all three; blank = today on the Tashkent clock. A
  night shift belongs to the date it started on. **`cell=<verifix code>`** on
  the two dated ones narrows to one cell; without it every cell comes back in
  one answer.
- **`GET /cells`** → `{date, cells: [{code, sap_code, group, leader, brigadir,
  shift}]}` — the cells standing that day that carry a SAP code
  (`cell_lookup._cells_on`: the unit, leader and letter OF THAT DAY). The
  Verifix `code` is the key everywhere; a SAP code is not unique.
- **`GET /production`** → per cell `{code, sap_code, group, plan_minutes,
  fact_minutes, skus: [{sap_code, name, unit, plan, fact, plan_minutes,
  shared}]}`. The SKUs are the «Zagruzka fayli» rows of the cell's unit
  (`_build_dashboard`) cut to the cell as a leader's page cuts them
  (`wc_group.in_scope`), **only the lines with a plan or a fact that day**. The
  cell's minutes are `zagruzka_source.cell_labor`; `null` = nothing reaches the
  cell that day, never 0. A line no letter claims is listed under every cell of
  its work centre with its WHOLE quantity and `shared: true`, while the cell's
  minutes carry an even share of it — so a lettered cell's `plan_minutes` is
  not the sum of its SKUs' minutes.
- **`GET /attendance`** → per cell `{code, workers: [{employee_id, name, job,
  clock_in, clock_out}]}`, times as `2026-11-09T07:53+05:00`. A unit whose day
  is CLOSED answers from the closed copy (`attendance`: exchanges applied,
  `employee_id: null` — that table holds no Verifix id); a unit still open
  answers from the live Verifix read (`live_staff`), everybody under their HOME
  cell with their Verifix `employee_id`. `clock_in: null` = did not come (yet),
  `clock_out: null` = still inside or no check-out. `live_read_at` is the
  oldest live read answered from. Passport / PINFL never leave.
