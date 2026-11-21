# Audits (KRU and technical)

## «Auditlar» — the KRU and technical audits from panel.safiabakery.uz (`/audits`, 2026-11-21)

The operator: «make one page for audits, take them from the panel I shared … show
both audits KRU / tech on separate tabs, and inside these tabs open new tabs:
register / analysis. On analysis show different types of charts, the right type
for the key figures». The panel is panel.safiabakery.uz; its login card already
existed — «Panel: audit minuslari» (`/panel/sdpanel`, `docs/tasker.md`) — and the
page reads with that one stored login. (A separate login card for another host
was built and dropped the same day: it duplicated that card.)

- **The source is the panel's «Минусы» report** (`/task-factory-reports/cancelled`),
  the only audit page the platform knows how to read: `type` 10 = «КРУ
  Производство» (tab «KRU»), 16 = «Технический аудит» (tab «Texnik audit»).
  `sd_panel.read_reports` logs in ONCE and reads several report paths
  (`report_path(start, end, type)`); `read_report` — the card's fixed October
  address — is that call with one path, so the card is unchanged.
- **A row is ONE question that lost points in one inspection; an inspection
  scored 100 % has no row.** Every figure on the page is therefore over the
  inspections that lost points, and the page says so once, on its muted line
  under the bar. An «inspection» is a (workshop, inspector, day, overall %) group
  of rows.
- **Rows are KEPT** in `panel_audit_rows` (`models.PanelAuditRow`): a month of
  one kind is read and REPLACED whole. Reads: «Yangilash» on the page (both kinds,
  the period's months, the newest six at most, one login); a job every two hours
  07:20–21:20 Tashkent for the current month (and the previous one in a month's
  first five days); one catch-up three minutes after boot when the current month
  was never read (`panel_audits.register_jobs`, both entrypoints). What each
  month last read, and its last error, is `app_settings.panel_audits_state`.
- **A refused login is never repeated by the clock**: the refusal is kept with a
  fingerprint of the sealed password, and the job stays off until the password
  on the card changes — a wrong password cannot lock the account. A press on
  «Yangilash» still tries (once).
- **Page key `audits`** (`permissions.PAGE_KEYS`, admin-only by default, opened
  per role or person on the Permissions tab), in the «Sifat» group after
  «Xavotirlar». Doors: `GET /api/audits/meta` (login state, which months were
  read, the filter lists), `GET /rows` (paged 50, sort, search), `GET /analysis`,
  `POST /refresh`.
- **The page** (`pages/Audits.jsx` + `auditsText.js`, `components/audits/`): ONE
  bar — the kind (Texnik audit · KRU) and the view (Ro'yxat · Tahlil) as two
  `SegmentedToggle asTabs`, both in the URL (`?k=`, `?v=`), the period
  (this month by default), `FilterPanel` (sex · inspektor · bo'lim · savol · TOP),
  «Yangilash». Switching the kind keeps the period and drops the record filters.
  States: no login (admins get the way to the card), a refused login, a period
  never read (one button reads it), months not read yet named on the muted line.
- **Ro'yxat**: one row per minus — date · workshop · inspector · overall % (band
  dot) · the question's score · section · question · comment · TOP; one line per
  row, newest first, every column but the comment sortable, the search in the
  table's toolbar; a row opens the record whole.
- **Tahlil — the chart for each question it answers**:
  - tiles: the average rating against the 90 % target (`Meter`) and the same
    span before it · inspections that lost points (and in how many workshops) ·
    minuses (per inspection, TOP count) · inspections by rating band as ONE
    `SplitBar` (above 90 / 80–90 / 70–80 / 70 and below — the technologists'
    audit bands);
  - **columns** of the average per day (per week past 92 days, per month past two
    years — inspections-weighted), each in its band's colour against the 90 %
    line: inspection days are sparse, so a bar per day reads where a line would
    break;
  - **donut** of minuses by checklist section — a whole in at most seven parts
    (six and «other», or all seven when the fold would hold one);
  - **ranked bars** of the weakest workshops (average, lowest first) and the most
    repeated questions (minuses, and in how many workshops). **A click on a bar,
    or on a donut slice, opens «Ro'yxat» filtered to it** — from a pattern to its
    rows.
- A workshop is printed as the panel names it minus its list number («1 - 2811 -
  Фасовка» → «2811 - Фасовка», `shopLabel`); the panel's workshops are not
  matched to our cells here (`docs/tasker.md` notes the open question).
- Verified with unit tests (`tests/test_panel_audits.py`) and on mock rows in
  headless Chrome (both themes, a phone, the click-through). **The real report
  for KRU (type 10) has not been read by the code's author** — its rows are
  parsed by the same headers check, so a different table is refused (`shape`)
  rather than misread.
