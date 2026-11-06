# ARC tickets

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## ARC is ONE page (`/arc`, from 2026-10-05)

The operator: «merge these 2 pages into one» — and, asked, keep the old app's
tickets in the same table but «stop the old app's sync». So:

- **`/arc` renders the page that was `/arc-legacy`** (`pages/Arc.jsx`, moved;
  the old `/arc` page file is deleted) and `/arc-legacy` redirects to it. It
  keeps that page's endpoints (`/api/arc-legacy/*`), query keys (`arcl-*`),
  saved filters (`arcl_*`) and strings (`arcl.*`).
- **Its rows are BOTH apps, read as one** — `routers/arc_legacy._R()`: the new
  app's mirror (`arc_legacy_requests`, still synced) UNION ALL the old app's
  (`arc_requests`), projected at read time onto the new table's columns and
  aliased (`adapt_on_names=True`, or the ORM lazy-loads projected columns from
  the real table and fails). Nothing is copied, so the new mirror's sync,
  attribute census and API panel never see the old rows. An old row has a
  NEGATIVE id and an `arc:`-prefixed remote_id; its status maps to the new
  app's slugs (0 new · 1 in_progress · 3 done · 4 cancelled — by STATUS, 267
  denied rows have no finished_at · 6 done_unconfirmed), its due moment is
  created + `category_ftime` hours, brigada → master, user → client, division
  → warehouse (cell = the TRAILING digits only, the old page's rule). IT's
  test categories stay out (`arc_hidden`). Category and crew are keyed by NAME
  on both sides, so one category is one option and one chart bar; the saved
  picks moved to `arcl_category2` / `arcl_master2`.
- **The old app is frozen.** `arc_sync.RETIRED`: no boot catch-up, no
  15-minute pass, no nightly walk; `POST /api/arc/refresh` answers 410. Its
  tables, its router (read-only, for a tab still open on the old bundle) and
  its modules stay — they are the old history. An old ticket still open stays
  open on the page for good (the operator was told).
- **«Ilova» (`source`: new / old)** is a column, a filter and an export column;
  the ticket window shows an old row's start time, every attachment and its
  status history (read from `arc_requests` on open). Status slugs are printed
  through `arcl.st.<slug>`, an unknown one as sent.
- **A ticket's photos and files are drawn through OUR origin** (2026-10-17,
  the operator: «the image is not being displayed»). The CSP is
  `img-src 'self'`, so every `<img>` pointing at IT's host was refused and
  fell back to a link — for both apps. `services/arc_files.py` is THE door:
  the old app's `arc_requests.files`; the new app's `photo_report` (the
  crew's photo, «Foto-hisobot») and the filer's attachments, which only IT's
  single-ticket card carries (`GET /arc/api/v1/requests/factory/{id}` →
  `files[].file_path` «misc/YYYY/MM/DD/<uuid>.jpg»), read on open and kept
  10 min, plus its `document_url` (also a relative «misc/…» path, so the old
  «Hujjat» link pointed at this site). The new app serves every such path at
  `<api host>/base/<path>` (found by the deploy probe, 2026-10-17 — a «.heic»
  there arrives as JPEG bytes); `fetch` tries that first, then a short list
  of other bases, and remembers whichever served real bytes (`_WIN`); a HTML
  page or JSON answer is never taken for a file. Old-app files answer at
  `api.service.safiabakery.uz/files/…`. https only,
  relative paths only from `*.safiabakery.uz`, an absolute URL or redirect
  only to a public name, IT's credential only on IT's host, ≤ 20 MB.
  `GET /api/arc-legacy/requests/{id}/files` lists them (`report`,
  `document`, `files`; `card` = ok · n/a · failed · not_configured — «none»
  and «could not ask» are two answers; `force` re-reads a failed card) and
  `/file/{report|document|n}` streams one: a
  picture the BYTES prove is served inline, anything else as an attachment
  behind `nosniff`; unreachable is a 424, never 502/503. The modal
  (`components/arc/ArcAttachments.jsx`) shows «Rasmlar va fayllar» under the
  description — a lone photo at the card's width, several as squares, a
  non-picture as a `FileTile` that downloads — «Foto-hisobot» under the
  crew's comment and «Hujjat» as a file; a tap opens the shared `Lightbox`.
  IT names files by uuid (old app: a Telegram file id), so a machine name is
  shown as what the file is («Hujjat.pdf», «Fayl 1.pdf»). Photos load through
  `ProxyPhoto`, which gained `zoomLabel` (the photo is a real button) and
  `failCaption` (a large thumb says what failed). The deploy-log probe that
  confirmed `/base` (`deploy/diag_arc_files.py`) was removed on 2026-10-23.
- The two sections below describe each app's mirror and are still accurate for
  it; where they talk about «the page», read `/arc`.

## ARC tickets (`/arc`, page key `arc`)

A mirror of «АРС Фабрика» from IT's **internal read-only API**
(`api.service.safiabakery.uz/api/internal`, one key in `X-Internal-Key`,
GET only, paginated `/arc/factory/requests`). Admin-only by default; open it
from Access / Permissions. `services/arc_client.py` (key auth, page walk,
normalisation) · `services/arc_sync.py` (background thread + DB claim, per-page
`ON CONFLICT` upsert into `arc_requests`, quick pass every 15 min = first 30
pages, full walk nightly 03:15 + on Refresh + 60 s after boot, then a bounded
card-hydration phase) · `routers/arc.py` (`/meta` `/list` `/stats`
`/requests/{id}` `/refresh` `/export.xlsx` `/diag`) · `pages/Arc.jsx`.

**It replaced the old ARC login API wholesale on 2026-08-25, and the history
was DELETED rather than migrated** (`startup.reset_arc_mirror`, flag
`arc_internal_api_reset_2026_08_25_v1`, which DROPs both tables and rebuilds
them from the new metadata because `create_all` never ALTERs). Nothing in the
old table could be re-read under the new columns: integer ids and statuses
where there were uuids and status words, a division where there was a branch, a
brigade where there was a master, and **no deadline column at all**. Moving the
reset again needs a NEW flag key — the old "already ran" mark makes it a no-op
on every box that has booted since. The whole register (~32k tickets) comes
back on the first walk.

- **One key, no session.** `INTERNAL_API_KEY` in `X-Internal-Key` on every
  request; blank ⇒ «not connected» and no jobs registered.
  `startup.ensure_internal_api_key` SEEDS it into `backend/.env` at boot AND
  into the live settings object (pydantic read the file long before), so a
  fresh box connects itself — this platform has no shell, so a key that is not
  in code is a key that never reaches production. It is **insert-only**: a
  file that already names the key is left alone, so a rotation on the server
  (or via the Gitea secret `INTERNAL_API_KEY` + `deploy/sync-env.sh`) survives
  the next deploy. `Settings.Config.extra = "ignore"` exists because a stray
  `.env` key used to abort boot AND the rollback — never re-tighten it.
- **There is nothing to probe any more.** `services/arc_discovery.py`, the
  «API» panel, `/probe` and `/spec` are all GONE: every documented parameter
  NARROWS the answer, so the bare walk is already the widest one the key can
  perform. Sending no filters is the deliberate choice, not an oversight.
- **IT's own TEST categories are not in this register.**
  `services/arc_hidden.py` is THE definition, in the two spellings that must
  stay one rule: `is_hidden(name)` for a name in memory and `hidden_clause()`
  as the SQL. Two categories exist today — «test apc fabric» (84) and
  «child  test apc fabric» (85, the child of the first, two spaces), 17 of the
  32,487 tickets on 2026-08-26 — and the match is by NAME, not by those ids: an
  id is IT's to change and a third test category is theirs to add. The name is
  stripped to its letters and digits and must then be NOTHING BUT marker words
  («Test», «Тест АРС Фабрика») or carry the test token with an ARC or Фабрика
  one straight after it («child  test apc fabric»). Never widen it to a bare
  «тест» substring — several divisions here are named after **тесто** (dough).
  Two doors: `arc_sync` refuses to write such a ticket (so it is never stored
  and its card never spends one of the bounded per-pass fetches — and a rule
  later withdrawn refills itself on the next full walk), and
  `_apply_filters` drops it in SQL, which is what hides the rows an earlier
  pass already wrote, with no migration. That clause sits in the SHARED filter
  set, so the table, the facet lists, the KPI strip, the charts and the export
  all read it once — and it is not a narrowing the reader chose, so nothing
  lifts it, `include_missing` included; the single-ticket door checks it too,
  because a remote id is typeable. `missing_since` deliberately skips them: it
  means «the API stopped returning it», never «we stopped storing it».

- **The list is thin; the description is on the CARD.** `/arc/factory/requests`
  carries the ticket, author, division, category and brigade — but not the
  description, deny reason, files or status timeline. Those are one call per
  ticket, so hydration is a SECOND, bounded phase of each pass
  (`hydrate_details`, never-fetched newest-first then stale-open ones,
  `DETAIL_BATCH_*` per pass ≈ 10 req/min). `detail_at IS NULL` is the whole
  «list-only so far» fact and the page says so out loud — a row shows «…» with
  «not fetched yet», never a blank that reads as «this ticket has none» — and
  `GET /requests/{id}` fetches a missing card ON DEMAND, so a ticket a reader
  actually opens never waits for the queue. `detail_pending` deliberately
  counts only never-fetched rows: the full queue also holds open tickets due a
  routine re-read, so it never reaches zero, and a counter that never reaches
  zero reads as «still loading» forever.
- **The status integer IS the state** (0 created · 1 in progress · 3 completed ·
  4 denied · 6 handled/awaiting confirmation, named in `arc_client`). The API
  ships no label and no colour, so open/done/cancelled are read off the code,
  the traffic-light tone comes from `utils/arcStatus.js` and the WORDS from
  `arc.st.<code>` in the four locales — which is why the Excel export is sent
  `status_labels` instead of formatting them itself. An unmapped code renders
  as «#7», never a raw translation key.
- **There is no deadline field — `due` is DERIVED** as
  `created_at + category.ftime hours`. A category without an `ftime` gives a
  ticket no due date, and such a ticket is neither on time nor late; the KPI
  therefore names the count it was computed over («of N done with a deadline»).
- **Derived state is defined ONCE** (`_derived()` in the router): `is_cancelled`
  `is_done` `is_open` `closed_at` (finished_at, but only once the status says
  the ticket is finished) `due` `late` `overdue_now` `hours_to_close`
  `hours_to_start` — list, stats and export all read the same expressions. The
  register defaults to NO period — a rolling window is a filter the reader never
  chose, and it made a full mirror look like a thin one.
- Tickets carry no `updated_at`, so every walk re-writes every row it sees and a
  row the API stops returning is only ever MARKED (`missing_since`, set by a
  COMPLETED full walk that saw ≥1 ticket, cleared when seen again) — never
  deleted. A LIST upsert must never blank a card-only column: `_UPSERT_COLS`
  excludes them and `comments` is coalesced, because the list ships `[]` for a
  ticket whose card holds a thread.
- **The filter option lists describe the VIEW, not the mirror** (from
  v3.47.0). `GET /api/arc/facets` takes the same filter set as `/list` and
  `/stats` and `_facets()` is its one definition: every list — statuses,
  categories, divisions, brigadas, authors, cells, and the whole org chain —
  is counted over the **entire filtered set** (every page of it, never the
  page on screen) with exactly ONE narrowing lifted: **its own**. Lifting its
  own is what makes the number beside a name answer «how many rows do I get if
  I pick this INSTEAD»; applying it would leave every other name reading 0 the
  moment one was picked. Before this the lists came off the whole mirror, so a
  table of 566 sat under «Оборудование 8281» and the reader was sent to a
  category the period holds nothing of.
  - **The reader's own pick is always offered, at 0** when the rest of the
    view holds none of it (`_relabel`, and `org_index`'s `keep_managers` /
    `keep_leaders`). A pick missing from its own list is un-picked by the
    page's chain guards — the register silently WIDENING, answering a question
    nobody asked — and its chip loses the name it renders from that list.
  - The four code-derived lists (cell · smena · brigadir · lider) come off the
    one `code_expr()`, each over its own base, so the org cascade is now
    measured against the whole filter set rather than the whole mirror. A
    level nobody picked leaves its base identical to its neighbours', so the
    memo collapses those four queries back to one; `org_codes` is resolved
    once per scope via `_apply_filters`' `org_cache`.
  - Both narrowings SAY SO on the list itself — the chain note names the
    nearest parent, `arc.optsInView` names the view — because a short list must
    never read as a dimension the register has nothing in. `OptsFilter` gained
    the `note` prop `PickFilter` already had.
  - `/meta` is the SYNC FEED (polled every 2.5 s while a walk runs) and still
    serves the unfiltered lists by default, for a tab still open on an older
    bundle; the current page asks it `?options=0` and reads `/facets` instead.
- Attachments are relative paths (`files/….jpg`) resolved by
  `arc_client.file_url` against the API host; they serve **unauthenticated**, so
  the detail modal renders images inline and falls back to a link on error.
- **A division name ending in FOUR DIGITS names a production cell by its
  Verifix code** («Большая мойка 1 смена 0028» → cell 0028). That trailing
  number is the ONLY link between IT's register and our cell list — the API
  ships no cell id and no work centre — and `services/arc_cells.py` is THE
  definition of it, in two spellings that must stay one rule: `cell_code` for a
  name in memory, `code_expr()` as the SQL that filters, groups and selects.
  **Exactly four digits, and the group must start where the match starts**: a
  name ending «73215» names NO cell, because taking its last four digits would
  invent one. Resolving a code to a cell stays `cell_lookup.by_verifix`
  (zero-padded and zero-stripped keys, so «0028» and «28» are one cell).
  - The code rides every row as `cell_code` (one `_derived()` entry, so the
    register column, the `cell` filter, the sort and the export all read the
    same expression), and the payload carries a `cells` map keyed by code —
    each workshop name once per page, not once per ticket, with all four
    languages so the page picks the viewer's.
  - **Two facts the page must never render as one blank**: a code the registry
    has never heard of (kept, shown, marked «not in the registry» — the ticket
    register is IT's and the cell list is ours, and the two are allowed to
    disagree in public) and a division that carries no code at all (its own
    filter value `NO_CELL = "none"`, and it is shown and counted like any other
    ticket). Folding either away makes a partial answer read as a complete one.
  - **The code is also what carries our ORG CHAIN onto IT's register** —
    `shift` → `manager` → `leader`, in the filter panel's «Kim va qayerda» group
    ahead of the cell, exactly as on Quality. A level resolves to the CELLS it
    owns and meets the tickets at the same `code_expr()`
    (`arc_cells.org_codes`), so a scope the panel offers and a scope the query
    applies can never be two different things — and it narrows the whole page,
    both tabs, the KPI strip and the export, because both tabs read the same
    filtered tickets. `arc_cells.org_index` is THE walk (cell → supervisor →
    that supervisor's shift → leader): the option lists come off the register's
    own cells and are counted in TICKETS, so a unit is offered only while it
    has some. An empty answer is a REAL one (an empty register, never the whole
    plant). Each level notes what narrowed it and offers the way back out; a
    child pick its parent no longer offers is dropped.
  - **Brigadir and lider are MULTI-select and carry a value that is not a
    person** — `arc_cells.NO_OWNER` («Biriktirilmagan»), the tickets that reach
    no such person at all. Picks are OR-ed within a level and AND-ed across
    them. `NO_OWNER` is what a BLANK owner column means, so it is all three of
    the ways one goes blank at once — the division names no cell, it names one
    the cell registry has never heard of, or the cell has nobody assigned — and
    the pick and the column then agree about exactly the same rows. The third
    of those cannot be expressed as a code, so `org_codes` answers
    `(codes, with_null)` and the router ORs the two halves into one clause;
    a cell-less ticket is in scope only while no level NAMES anything, which is
    also why the «Yacheykasiz» cell pick survives beside `NO_OWNER` (`orgNamed`)
    where a named unit still retires it. The count comes off `/facets` like
    every other option (`org.managers_none` / `leaders_none`), and the two owner
    lists lift `assigned_only` along with their own pick — it narrows the SAME
    dimension, so a list that left it applied could only ever count its own
    «Biriktirilmagan» row at 0. Picking it on «Yacheykalar bo'yicha» therefore
    moves that tab's owner toggle to «Barcha yacheykalar» rather than answering
    with an empty table nothing on screen explains.
- **The page is TWO tabs over ONE table** (`SegmentedToggle asTabs`, above the
  filter row, because both read the SAME filtered tickets — same filters, same
  page, same sort). They differ in **which columns are on the table** and in
  ONE narrowing (below), which is what makes them two questions about one
  register rather than two pages.
  - «Barchasi» is the register as IT files it — division, category, author,
    brigade — arranged by the reader through the `ColumnsPicker`.
  - «Yacheykalar bo'yicha» asks *whose cell is this ticket on, and where does it
    stand*: a **fixed** set — № · brigadir · lider · yacheyka · tavsif · holat ·
    muddat · boshlandi · yopildi (+ hours in the same cell) · manba. `CELL_COLS`
    in `pages/Arc.jsx` is that set, rendered through the SAME per-key `listCell`
    switch as the register, so a column added to one is available to both.
    **Deliberately not offered to the ColumnsPicker** (which stays on «Barchasi»
    only): a curated answer the reader can dismantle column by column is not a
    curated answer.
  - **«Yacheykalar bo'yicha» shows only the tickets that NAME a cell**
    (`cells_only`, user 2026-08-25). A ticket whose division carries no
    four-digit code has no answer to that tab's question — its cell, brigadir
    and leader columns can only ever be blank — so it is out of that view. The
    scope rides the SHARED filter set (`_filters` → `_apply_filters`, and the
    export body), never a client-side row drop: the table, the KPI strip, the
    row count and the file then describe the same rows, and a count above the
    table can never promise more tickets than the table can show. What it hides
    is **counted, named and reachable**, never silently dropped — `/stats`
    returns `hidden_no_cell` (the same filters with that one narrowing lifted,
    so an org pick, which already excludes cell-less tickets, makes it 0) and
    the card header prints it as a button onto «Barchasi» with the cell filter
    set to «Yacheykasiz». For the same reason that pick is not OFFERED on this
    tab and a standing one is dropped on switching to it — it could only ever
    answer with an empty table. A code the registry has never heard of still
    SHOWS here (it names a cell; the two registers are allowed to disagree in
    public) — only «no code at all» is out.
  - **This REPLACED a per-cell aggregate** (one row per cell: totals, open,
    overdue, on-time %, median). `ArcByCell.jsx`, `GET /api/arc/by-cell`,
    `_by_cell()` and `build_arc_cell_workbook` are all GONE — the tab shows
    tickets now, and every per-cell figure with them. Bringing any of it back is
    a new decision, not a restoration.
  - **The two owner columns come off the `cells` map, not off the ticket.**
    `cell_lookup.by_verifix(with_leader=True, with_sup=True)` puts both names on
    the projection `cells_for` already ships, so a thousand-row page names each
    unit once instead of once per row, and the owner columns, the cell column
    and the org filter all read ONE answer to «whose cell is this».
    `cells.manager_id` is the only source for the brigadir (the factory
    dimension's one attachment point). Neither is sortable: no SQL expression
    orders by them, and a header that looks sortable and does nothing is worse
    than one that does not.
  - **A ticket can fail to reach an owner three ways** — its division names no
    cell, it names one the registry has never heard of, or the cell has nobody
    assigned. All three render «—» with the reason in the tooltip, because the
    CELL column standing beside it already says which of the three it is;
    repeating that distinction in two more columns is noise, not honesty.
  - One sort serves both views, so a switch that lands on a key the new view has
    no column for falls back to the register's own default (newest first) rather
    than leaving an order the reader can neither see nor undo.
  - **The Export mirrors whichever tab is open**, through the one
    `build_arc_workbook` — `view` now only names the file. The screen's merged
    «yopildi + hours» column is SPLIT back into the backend's two real columns
    (`EXPORT_SPLIT` in `Arc.jsx`): a merged text cell can be neither sorted nor
    number-formatted, which is most of what a spreadsheet is for.
  - `cellName(cell, lang, "")` (`utils/cellName.js`) is THE workshop-name
    fallback for the short `{uz, uz_cyrl, ru, en}` shape `cell_lookup` ships —
    the page's old private `cellLabel` copy died with `ArcByCell.jsx`. Never
    re-introduce a local one; the empty prefix is what names this shape.
- **Each tab carries a «Ma'lumotlar / Tahlil» mode toggle under the KPI strip**
  (v3.48.0, `arc_mode`). Both modes read the SAME filtered tickets — `GET
  /api/arc/analysis` computes every chart figure through the same
  `_apply_filters` + `_derived()` as /list, so a bar is always a count over
  exactly the rows the table would show; `view=all|cells` only picks WHICH
  aggregates are computed, and the cells tab's `cells_only` narrowing rides in
  with the shared filter set as everywhere else. Rendered by
  `components/arc/ArcAnalysis.jsx` (the Quality page's ChartCard pattern), and
  the two tabs get two question sets: «Barchasi» = IT's flow — filed-vs-closed
  trend line (day/week/month, auto-picked from the span, overridable; the
  trend ALONE honours the 7-day chart minimum, widened server-side, and
  zero-fills empty buckets), category donut (top 8 + slate fold, centre =
  total), TOP divisions, closing speed vs the category's `ftime` allowance
  (Apex goal marker; bar green/red by verdict, grey with no allowance, each
  row naming the closed count behind its median), and IT brigades — where the
  NULL brigade is the not-yet-picked-up pile, shown as its own row.
  «Yacheykalar bo'yicha» = the org chart — tickets by brigadir/lider (one
  toggle, the Quality «acc» model) and TOP cells, plus the same donut and
  trend over the cells scope. Every «who/where» ranking is ONE stacked
  traffic-light grammar (green done · yellow open · red overdue · grey
  cancelled, total at the bar's end) via one shared opts/series builder;
  ranked cards name what they hide («TOP 12 / N»); an org bucket no code
  reaches renders «Biriktirilmagan», never folded into somebody's row. In
  analysis mode the text search keeps a visible control beside the toggle (a
  filter narrowing every chart must never be invisible) and the ColumnsPicker
  hides (it configures a table nobody can see).
  `utils/personName.js#shortPerson` is now THE surname-shortening rule — the
  register's owner columns and the chart axes read one spelling.
- **«Инвентарь Фабрика» is NOT mirrored.** The same key opens
  `/inventory/factory/requests` (different status set, `request_status` takes
  several values, and `fillial_id` matches the PARENT branch there, not the
  ticket's own) — building that register is a separate decision, not a
  side-effect of this one.

## The OLD ARC login API, revived (`/arc-legacy`)

**The names are the wrong way round, and that is history, not a mistake to
fix** (the operator, 2026-09-28): the «old/legacy» login API is IT's NEW
request app, and the internal API `/arc` reads is the OLD app. The factory went
on filing in the old app after the new one launched — which is why the login
API showed almost no factory tickets and `/arc` moved to the internal API on 25
Aug — and moved to the new app whole around 25 Sep, which is why this page was
revived. New factory tickets land HERE now.

From **2026-09-25** (the operator: redo what Antigravity had started) the API
`/arc` read until 25 Aug is mirrored AGAIN, on a page of its own —
`api.dashboard.service.safiabakery.uz`, username + password → JWT
(`POST /base/api/v1/v2/login`), tickets from `GET /arc/api/v1/requests/factory`.
It is the August code restored line for line under legacy names; `/arc` is
untouched.

- **Nothing is shared with `/arc`**: `services/arc_legacy_{client,discovery,sync,export}.py`,
  `routers/arc_legacy.py` on `/api/arc-legacy`, the tables
  `arc_legacy_requests` / `arc_legacy_sync_meta`, job ids `arc-legacy-*` (quick
  pass every 15 min, full walk at 03:45 — half an hour after `/arc`'s), and
  `pages/ArcLegacy.jsx` with its own query keys (`arcl-*`), saved filters
  (`arcl_*`), column prefs (`arcl.list.cols`) and strings (`arcl.*`), plus
  `utils/arcStatusLegacy.js` and `components/arc/LegacyApiPanel.jsx`. Two
  mirrors sharing a table, a claim or a key is how one overwrites, blocks or
  marks the other's rows «missing».
- **Page key `arc`** — whoever may open `/arc` may open this; no second grant.
- **The credential** is `settings.arc_legacy_username/password`, read from
  `ARC_USERNAME`/`ARC_PASSWORD` or the bare `USERNAME`/`PASSWORD`/`PASSAWORD`
  IT wrote into prod's `.env` by SSH (nothing ever scrubbed them).
  `deploy/sync-env.sh` writes `ARC_USERNAME`/`ARC_PASSWORD` from the Gitea
  secrets again. Without it no sync job is registered and the page says «not
  connected», with admin diagnostics naming which env NAMES the process finds —
  never a value.
- **The history deleted on 25 Aug is NOT restored**: the tables start empty and
  the first full walk re-reads whatever the old API still returns.
- **«Is the API sending anything new?» is answered on the API panel**
  (2026-09-28): «API yuborayotgan atributlar», `GET /api/arc-legacy/fields`
  (admin-only) → `arc_legacy_discovery.field_census`. It reads EVERY live row's
  `raw` (each sync rewrites it, so it is the API's current shape), one level
  deep — `category.x`, `files[].url` — and lists what `normalize_item` does not
  map (`_KNOWN_FIELDS` + `_KNOWN_NESTED`): tickets filling it, the creation
  dates of those tickets (the «is it new» half), the newest value. `gone` names
  mapped fields no ticket sends any more. It replaced the probe's
  `unknown_fields` on the panel, which read ONE item's top-level keys. A new
  attribute is stored in `raw` already — showing it is a column, not a re-sync.
- **What the API carries (read off production, 2026-09-28):** the list gained
  three fields since August, all about outsourcing and all empty so far —
  `is_outsource` (always false), `deadline_outsource`, `comment_outsource`.
  A SINGLE-TICKET endpoint exists, `GET /arc/api/v1/requests/factory/{id}`
  (`/arc/api/v1/requests/{id}` answers 404 «Origin not found»), and carries 15
  fields the list does not: `logs` (status history: user_name, status,
  created_at), `files` (`file_path` «misc/YYYY/MM/DD/<uuid>.jpeg»),
  `work_sessions` + `total_worked_seconds`, `paused_at` / `paused_by` /
  `pause_comment`, `delayed_at`, `expense`, `request_sum`, `updated_at`,
  `client_phone`, `werks` (SAP plant, null), `category_id`,
  `other_active_branch_requests`. The mirror does not call it yet — one call
  per ticket, like the internal API's card. The openapi document is refused
  (401 even with the bearer). On 28 Sep no field named a cell (the whole
  factory is ONE branch, «Учтепа») — superseded by the next bullet. A
  cancelled ticket was seen with `status` 7 while `normalized_status` still
  read «in_progress».
- **From 29 Sep 2026 the list carries the cell** — `warehouse_id` (uuid) and
  `warehouse_name`, the cell's Verifix code IN FRONT («8920 Цех Выпекания»;
  the old app put it at the END of the division name). Found by the attribute
  census on 5 Oct: 110 of 660 tickets, none created before 29 Sep (not
  backfilled by IT). Stored as two columns (`add_arc_legacy_warehouse_columns`,
  both entrypoints, fills them once from `raw`) and read by
  `arc_cells.warehouse_code_expr` — leading four digits, else the trailing
  group, exactly four either way — which `arc_cells` passes into the same
  `register_codes` / `org_codes` / `assigned_codes` walk /arc uses (they take
  a `code` expression now; /arc's default is unchanged).
- **Two tabs, as on /arc** (2026-10-05, the operator: «just like the other ARC
  page») — «Barcha so'rovlar» (the register, now with «Bo'linma» and
  «Yacheyka» columns) and «Yacheykalar bo'yicha» (fixed columns № · brigadir
  · lider · yacheyka · kategoriya · tavsif · holat · muddat · yopildi · soat;
  `cells_only` + the brigadir / lider / all owner toggle, `hidden_no_cell` /
  `hidden_unassigned` named on the card). The org chain (shift → brigadir →
  leader → cell) narrows both tabs; its option lists come off `/meta` over the
  whole mirror, like every other list on this page (no `/facets`). A ticket
  filed before 29 Sep names no cell, so the cells tab over an older period is
  empty and says why (`arcl.cellsSince`).
- **«Ma'lumotlar / Tahlil» mode, as on /arc** (2026-10-05) — /arc's own
  `components/arc/ArcAnalysis.jsx`, given `endpoint="/api/arc-legacy/analysis"`
  (+ `queryKey` / `prefPrefix`, defaults /arc's). That endpoint answers in
  /arc's exact shape over this register: «done» = `is_closed`, a category's
  norm = `category_deadline_hours`, «TOP bo'linmalar» = the warehouse (so only
  tickets from 29 Sep), the crews = IT's `master_name`.
- Everything «ARC tickets» says is GONE (the prober, the «API» panel, `/probe`,
  `/spec`) is gone from `/arc` only — here it is back, admin-only, as it was.
