# Safia Dashboard — project instructions

## UI element templates (mandatory)

Every recurring element type has exactly ONE template component in
`frontend/src/components/ui/`. When building any new feature, use these
templates — never hand-roll a new variant of an element type that already
has one. If a template lacks a feature, extend it with a prop; do not fork
or copy-paste its markup into a page.

| Element type | Template | Rules |
|---|---|---|
| Dropdown / select | `StyledSelect.jsx` | Never a native `<select>`. Compact toolbars: `triggerClassName="px-2.5 py-1.5 text-xs"`. |
| Date picker (range or single) | `DateRangePicker.jsx` | Single date → `single` prop. Never a bare `<input type="date">`. The quick-select list ends with «Barcha vaqt» — `ALL_TIME_FROM` (2015-01-01, a floor below any record, since the data model has none) → today, clamped to `max`; the trigger prints «Barcha vaqt» instead of the spelled-out span while that range is in force, and range-only, so `single` never offers it. |
| "‹ day ›" stepper on daily pages | `DayStepper.jsx` | `max={null}` to allow future dates. |
| Dialog / form modal | `Modal.jsx` | Backdrop `rgba(0,0,0,0.6)` + Telegram safe-top; rounded-2xl card; header = title (+subtitle/icon) + X close; body scrolls; footer right-aligned. |
| Modal footer buttons | `Button.jsx` inside `Modal footer` | Order: cancel (`variant="secondary"`) on the LEFT, primary action on the RIGHT. |
| Confirm ("are you sure") dialog | `ConfirmDialog.jsx` | `tone="danger"` for deletions (red chip + red confirm), default warning (amber chip + brand confirm). Sits above form modals (z 100). Carries `role=dialog`, a focus trap, Escape-to-cancel and initial focus on the SAFE button. `error` renders the failure INSIDE the dialog — a mutation that fails must leave the dialog standing with the reason on it, never close and fire `alert()`. `challenge` (+ `challengeLabel`) demands the operator retype a string before confirm enables: use it for anything no undo can reach (full-DB restore → `RESTORE`, whole-day attendance wipe → the date). `cancelLabel` defaults to `common.cancel`. |
| Transient action feedback (saved / sent / failed) | `Toast.jsx` | `<Toast>` controlled, or `useToast()` for the state+timer. Tones `success/error/warning/info`; errors persist until dismissed (you cannot re-read a toast that vanished). Portals to `document.body`, offsets by `--tg-safe-top`/`--tg-safe-bottom`, carries `role=status`. `position="bottom"` for dense editing surfaces. **NEVER `window.alert/confirm/prompt` — Telegram's iOS WebView silently suppresses them, so a failure becomes invisible on the primary device.** Never paste a fixed green `<div>`; never morph a Save button into its own status message. |
| Comment thread on a record | `CommentsModal.jsx` (`CommentsModal` + `CommentsButton`) | THE chat thread. Point it at a resource exposing the four standard endpoints — `GET/POST {endpoint}`, `PUT/DELETE {endpoint}/{id}` — via `endpoint` + `queryKey` + `refreshKeys` (the list keys whose `comment_count` badge must re-count); `title`/`subtitle` name the record. Ownership is NEVER re-derived on the client: the backend serves `is_own` per message, because a message belongs to the authoring PROFILE and one account may hold several. `CommentsButton` is the table-cell trigger (count badge, gold once non-empty) — a Comments column on the table for `sm+`, the same button on the mobile card's footer row. A failed write raises an error toast; the thread scrolls to the newest message. A message may carry a server-set `kind`: `"resolution"` marks the mandatory note a record was CLOSED with (the concerns register writes one into the thread when a concern is resolved) — green ✓ header, no delete button, because the backend refuses to delete it. Used by `/tasks` and `/concerns`. |
| Camera proof capture | `pages/ProofCamera.jsx` | THE in-app camera, for checklist tasks whose `proof_kind` is `camera`. Never add a file-picker fallback to it — the whole point is that no file the leader produced is accepted. See the camera-proof section below. |
| File upload | `UploadDropzone.jsx` (`UploadDropzone` + `FileStateList` + `useFileStates`) | One drag-drop model for every upload surface. Rejected files always render (a silent rejection reads as success); rows are keyed by generated id, not filename; result detail wraps on its own line; the bar carries progressbar ARIA; 100% flips to "processing" because parsing happens after transfer. `renderExtra(state)` is the seam for per-endpoint result detail — use it instead of forking the row markup. |
| Button | `Button.jsx` | Variants `primary/secondary/danger/ghost/success`, sizes `sm/md/lg`; `loading` shows the spinner. `tint` gives the soft-tinted form (12% bg + coloured border/label) — **THE form for table-row actions**. Never hand-roll a chip with inline rgba + `onMouseEnter/onMouseLeave`: mouse events never fire on touch, so a destructive action stays stuck in its neutral rest state on a phone. Forwards refs. |
| Segmented toggle + page view-tabs (min/hrs, P·A·P−A, view/mode switch, theme, Production/Staff tabs) | `SegmentedToggle.jsx` | Recessed-track pill: a `bg-inner` track (`rounded-xl`, `p-[3px]` inset, subtle `border`, no dividers) holding segments — the selected one is a brand-gold (`--brand`) pill with a white label, the rest transparent with muted `text-3`. This is ALSO the page-level "view tabs" template (Production view switch, Staff Workers/Requests) — same component, don't hand-roll a padded tab group. Outer height stays `size="md"` (default, 38px = `Button` lg / toolbar baseline) or `"sm"` (30px = `Button` md) so it aligns in toolbars. `options` = `[value,label]` tuples or `{value,label,title}` objects (label may be a node/icon). **THE template for EVERY toggle on the platform — any set of 2+ mutually-exclusive options (mode / view / period / type / status / tab / shift / theme switch), current and future. Never hand-roll a button group or padded tab bar; extend this with a prop if it lacks something.** **The track can never overflow its container, and that is the template's job, not the call site's.** Labels are `whitespace-nowrap`, so an option set wider than the box it sits in used to run straight out of it — a `fill` toggle's segments are `flex-1`, but a flex item's automatic minimum size is its CONTENT width, so they refuse to shrink and push the track past the edge; a shrink-wrapped toolbar toggle had no width cap at all. Either way the last label was clipped by whatever ancestor was `overflow-hidden` and the surface around it grew a stray horizontal scrollbar («Ҳаммаси · Смена 1 · Смена 2» in a 240px filter dropdown). So the track is ALWAYS capped at its container and scrolls: it shrink-wraps exactly as before while the options fit, and once they do not it scrolls, scrolls the SELECTED segment into view and fades whichever edge still has content off-screen. This used to be the opt-in `scrollable` prop — **that prop is GONE**, because 105 of the 123 call sites had not opted in, the ones inside a narrow dropdown or a phone toolbar least of all, and an invariant every caller has to remember is one the template does not hold. Never wrap it in your own `overflow-x-auto` div either: a bare wrapper hides the scrollbar without replacing the affordance and leaves the selected segment off-screen, at which point nothing looks selected and the user cannot tell where they are. `className` lands on the OUTER box (widths / shrink / margins only) — never the track's own skin. `asTabs` adds tablist/tab roles, `aria-selected` and arrow-key navigation when the toggle switches VIEWS. |
| Form label + control | `FormField.jsx` | Uppercase 11px label, red `*` when `required`. `hint` puts consequential copy ("this resets manual edits", "re-uploading replaces the day") UNDER the control at 11px/`--text-3` — never at `--text-4`, where the eye skips exactly the text that matters most. `error` attaches a validation message to the field that caused it instead of dumping one paragraph below every field. |
| Text field that exists in all 4 languages | `LangTextInput.jsx` | Never stack one input per language. A `SegmentedToggle` of language tabs (uz · uz_cyrl · ru · en, **ru open by default**) over ONE input for the selected tab. Every language is optional; a blank tab shows the Russian text as its PLACEHOLDER (previewed, never saved) plus the `ui.langInput.ruFallback` hint, because Russian is what the UI falls back to. Tabs stay plain — no filled/empty markers. `placeholderFn(lang)` previews something computed (e.g. a transliteration) instead of the Russian text; `action` puts a per-tab button beside the input — use these to ADOPT the template rather than forking it into stacked inputs. |
| Time of day (HH:MM) | `TimeField.jsx` | THE clock field. A native `<input type="time">` in the house control skin (`bg-inner`, border, `rounded-xl`, `px-3 py-2 text-sm`) plus a ghost ✕ that clears to `""`. **Blank means INHERIT or UNSET — never midnight**, so a blank field with an `inherit` string renders `ui.timeField.inherits` under it at 11px/`--text-3`: a blank native time input paints "--:--" and states nothing about the value actually in force, which is precisely the value the reader needs. `value`/`onChange` are plain "HH:MM" strings (the handler gets the string, not the event). Pairs of these follow the platform clock convention — Tashkent wall clock, `end <= start` ⇒ the window crosses midnight. Never hand-roll another `<input type="time">`; `TimeWheelPicker.jsx` stays the separate, window-BOUNDED picker (needs `lo`/`hi`, cannot express blank) for entering an event's clock inside a known range. |
| Search box | `SearchInput.jsx` | Magnifier icon + clear-X built in. |
| Generic data table | `DataTable.jsx` (`TableCard` + `Th` + `SortIcon` + `SectionHead`) | Styled after the Production «Позиции» table: card + SectionHead (right slot = row count), toolbar row (search/filters/actions), sticky bg-inner sortable headers, vertical column separators, `px-3 py-2` cells, baked row borders + hover. Loading = skeleton rows in tbody; empty = one centered colSpan row. Unique visualisation tables (fleet heatmap, comparison/difference, stat matrices) are exempt. |
| Card/section header | `SectionHead` from `DataTable.jsx` | Icon + uppercase title + right slot; never redefine locally. |
| Table pager | `Pagination.jsx` | For registers too long to dump into the DOM (thousands of rows). Sits directly under the `TableCard`: "x–y of N" left, windowed page buttons right, built from `Button`. Renders nothing for a single page. |
| Column show/hide + reorder | `ColumnsPicker.jsx` | 38px `Columns3` icon trigger on the toolbar's RIGHT edge (`className="ml-auto"`, hidden-count badge) + portaled panel listing every column IN TABLE ORDER — hidden ones stay dimmed in place (eye-off), never regrouped to the bottom. Hide all/Show all links; drag-to-reorder only arms via the panel's reorder button. Controlled: `columns [{key,label,locked}]`, `order`, `hidden`, `onChange({order,hidden})`. Persist via `/api/ui-prefs/{key}` (per-profile JSON blobs, `UiPref` model); reconcile saved keys against the current column catalog and keep identity columns `locked`. `t("cols.*")` keys exist in all 4 langs. Excel exports of a picker-equipped table must mirror it exactly — send the visible keys in on-screen order (`columns`) with the row-id `order`, backend formats keyed per column. (Exception: the Позиции export deliberately emits the fixed brigadir «ABC форма» formula workbook instead of a picker mirror — don't revert it. It reproduces the manual form cell-for-cell: totals row 1, headers row 2, positions row 3+, team block M:O, indicators P:Q; only Трудоемкость/Команда/Факт/ПЛАН and O. SONI are values, everything else is a live formula so the brigadir's edits recalculate. Trimmed hard on the operator's call (2026-08-31): the indicator block is THREE rows — «Nechta odam keldi» = `=SUM(N…)`, the people assigned to the cells that day; «Hozirgi odam bilan o`rtacha bandlik(smena boshida)» = `=I1/(keldi×shift_min)`, the same arithmetic as `pp_calc`'s `avg_load` so the file and the page answer with one number; and «Общ.трудаёмкост» = `=I1` — and the other six indicators, the whole «Сколько должна на штатке» block (Z:AA) and the team block's P:W half (Команда · минут · real load · capacity · kerak · Штатка) are gone. Everything removed was derived from hand-entered counts nobody fills in, so it printed 0 / 100% on every file. Consequence: O. SONI (N) loses the `=ROUND(U,0)` chain that fed it and is written as a VALUE — the block's one input, and what ЛЮДИ/Минут/Парето/Загруженность still recalculate off via the M:N VLOOKUP. The page itself (its reconciliation card, its Штатка/capacity columns) is untouched — only the export dropped them. Superseded the older «загрузка» two-shift layout.) See the Production «Позиции» table for the reference wiring (cells rendered by a per-key switch so hide/reorder is free). |
| Factory (plant) switcher | `useFactorySection()` from `FactorySelect.jsx` | THE plant switcher — a `FilterPanel` SECTION, first in every factory-aware page's section list (plant → shift → supervisor → …), never a standalone control on the bar. (The standalone `FactorySelect` dropdown and the `FactoryTabs` strip before it are both retired from page toolbars: each cost a permanent toolbar cell on a phone-first platform for a value most users never change.) «All factories» is the FIRST option. Returns `null` when fewer than two factories exist; a locked viewer (supervisor/leader) gets a `static` section — an inert chip naming their plant, never a one-option control. The `FactorySelect` component itself survives only for non-toolbar surfaces (admin forms). |
| Cell label (how a cell is NAMED) | `utils/cellName.js` → `cellLabel(code, leader)` | A cell is its **verifix CODE**. The workshop name is NEVER printed — see the section below. |
| Pressable cell reference | `CellLink.jsx` | THE way a production cell rendered as CONTENT (table cell, card, chip) opens its page `/cells/:id` — dotted-underline affordance via the `.cell-link` rule in `index.css`. `id` = cells.id; without one it renders inert text (never a dead link). Clicks stop propagation, so it nests in clickable rows. FILTER controls listing cells never navigate. Don't put it inside another `<button>` (IdleCell accordion / AttendanceUpload expander stay unlinked on purpose — nested-interactive + they hold unsaved drafts). `/cells/:id` (`CellDetails.jsx`) is auth-only like `/profile`; its edit modal is the shared `CellFormModal.jsx` (ONE form with the `/cells` register). |
| Empty-data placeholder | `EmptyState.jsx` | For page/section level. Table "no match" rows stay plain muted text. |
| Full-screen "you can't see this page" state | `ErrorScreen.jsx` | THE template for 404, no-access, a crash, offline, and every blocked auth status (`AuthGate`'s screens, `NoAccess`, `ErrorBoundary` all render through it). Shape: tinted icon chip → status `code` → `title` → ONE sentence → ONE primary `action` → `secondary` escape hatch → `detail` collapsed. Tones are the status palette: `danger` broke, `warning` blocked-but-fixable, `neutral` slate just-not-there (404/403), `brand` an invitation (register) — never a raw emoji as the lead visual, which is what all eight hand-rolled copies used to do. Takes focus on the primary action at mount and pads for Telegram safe areas. `inline` drops the viewport wrapper for a screen rendered INSIDE `Layout` (the 404 keeps the sidebar, so the nav is itself an escape hatch). **Crashes are SCOPED and never technical**: use `ScopedErrorBoundary` from `ErrorBoundary.jsx` (never the bare class) — one inside `Layout` around the content column so a broken table keeps the nav alive, one above the routes so a broken page keeps the session, and the app-level one only for a provider. It clears itself on navigation (`resetKey` = pathname), shows the minified stack to ADMINS only, and posts every catch to `POST /api/crash-report` (`routers/boot.py`, the ONE client-failure door — fingerprint-deduped, one DM per crash per hour, always logged as `CLIENT-CRASH`). A user must never be the monitoring system. |
| Loading | `Skeleton.jsx` blocks for page/section data loads; `Loader2` spinner inside buttons for actions | Never bare `…` / "Загрузка…" text. |

Other UI conventions:

- Modal stacking: base modals z=50 (`Modal` default), nested modals pass `zIndex={60+}`, `ConfirmDialog` defaults to 100.
- Table-toolbar controls share ONE height — 38px, the `FilterPanel` trigger (`px-3 py-2 text-sm` + border). `SearchInput` default and `SegmentedToggle` md are also 38px. `Button` is the exception: md/sm are compact (≈30/26px) for modals & inline actions, so a toolbar action button must use **`size="lg"`** (38px) to line up with the filter/search controls next to it. All `Button` variants carry a border (transparent on borderless ones) so heights line up — don't strip it.
- `FilterPanel` (in `ColumnFilter.jsx`) is THE page/table filter zone. **Every page's scope controls (plant / shift / supervisor / leader / cell / category) live INSIDE it as sections — never as standalone selects stacked above the content.** The page bar is ONE row: the period control (`DateRangePicker compactLabel`, or `DayStepper` on daily pages) inline, then `FilterPanel`, then chips. It adapts to space: on md+ it unfolds into one dropdown per filter while the WHOLE toolbar row fits on a single line, else it collapses to the grouped «Filtrlar» button (below md: bottom sheet). Whenever controls are not visible inline, every ACTIVE section renders as a CHIP beside the trigger — `display` text + per-chip ✕ (`onClear`); chip body re-opens the panel; `static: true` sections are inert chips (locked viewer's plant). Sections: `{ key, icon, label, active, display, render({close}), onClear?, static?, group?, pinned? }` — `PickFilter` (single-select list, closes on pick), `OptsFilter` (multi), `RngFilter`, or an embedded `SegmentedToggle fill`. `group` (a translated caption) splits the collapsed surfaces into labelled blocks in first-appearance order; use it wherever a page carries both a scope CHAIN and record filters, so ten anonymous rows read as two short lists (Quality: «Kim va qayerda» = plant → shift → brigadir → leader → cell, «Nima bo'ldi» = the register filters). **A cascading level narrows the level below it and SAYS SO**: build each list under the levels above it, pass `PickFilter`'s `note` ("narrowed by «X» · N") so a shortened list is never mistaken for missing data, pass `empty` (a message + a button clearing the parent) for a level narrowed to nothing, and drop a child pick its own list no longer offers when the parent changes — a control naming a value the page cannot show is worse than a reset. See the Quality org chain for the reference wiring. Omit `activeCount`/`anyActive`/`onClearAll` unless overriding — the panel computes them from sections. `pinned: true` keeps a section's own inline dropdown on the toolbar even while the rest collapse — for a page carrying so many filters that the fit check can never unfold the row (ARC's thirteen), so the controls that steer the page are not buried behind a button that names none of them. Pin the two or three controls the reader steers with — and when a page's TABS ask different questions, pinning follows the open tab (ARC pins smena → brigadir → lider on «Yacheykalar bo'yicha», bo'lim / holat / kategoriya on «Barchasi»; every filter still narrows both tabs, only where its control sits changes). Below md nothing is pinned (the sheet keeps them all) and a pinned section drops its chip on md+, where its own trigger already states it. Keep it a DIRECT child of the toolbar flex row — the fit check measures that row's children (flex-grow spacers count as 0). View switches (tabs) stay OUTSIDE the panel; text search stays an inline `SearchInput`.
- All colors via CSS variables (`var(--bg-card)`, `var(--bg-inner)`, `var(--text-1..4)`, `var(--border)`, `var(--brand)`) — no hardcoded grays/hex for chrome, including on admin pages.
- No raw emojis — lucide icons in soft tint chips (see `ProjectIcon` in `Kaizen.jsx`).
- Status colors are traffic-light: red `#ef4444` / yellow `#eab308` / green `#22c55e`; "not started" is grey `#94a3b8`; brand gold `#C8973F` is an accent, never a status.
- Categorical chart colors (roles, units, products, people, series identities) come from `utils/chartPalette.js` `CATEGORY_COLORS`, assigned generic-first in this exact order: red → green → blue → yellow → orange → purple → teal → pink → … One fixed hue per category, reused across every chart that shows it; «Остальные/Other» folds are `FOLD_COLOR` slate. Brand gold NEVER represents a category (all pages except `/leaders`). Single-metric accents, status palettes, and value-intensity ramps are separate and may keep gold.
- Date-axis line/area charts never show fewer than 7 days — use `utils/chartRange.js`.
- **A date axis thins its labels to its MEASURED width, never to a fixed count.**
  `ticksForWidth` (+ `axisLabelPx`) in `utils/chartRange.js` is THE rule and
  `hooks/useElementWidth.js` is how a chart learns its own width (a callback
  ref measured during the commit, so the first width is known before Apex
  mounts and the unfitted axis never paints). A hard-coded `tickAmount` cannot
  be right on more than one screen: the same card is two thirds of a grid on
  one tab, a third of it on another and a single column on a phone — the ARC
  flow chart's fixed 12 ran «29 Дек» into «19 Янв» on every width but the
  widest. Apex's `hideOverlappingLabels` is the last safety net ONLY: on a
  category axis it drops whichever labels collide instead of thinning them
  evenly, so an axis leaning on it alone reads as a random subset of the range.
  Labels stay horizontal (`rotate: 0`) — the slant is not the fix here — and no
  precision is lost, because every bucket is still named in the tooltip.
  Reference wiring: `FleetLineChart.jsx` and `components/arc/ArcAnalysis.jsx`.
- ApexCharts custom tooltips (`tooltip: { custom: … }`) draw their own glassy box, but ApexCharts still wraps them in a themed box → a white halo / extra layer around the tooltip. EVERY such chart MUST carry `apx-bare-tip` on an ancestor to strip that wrapper: `<ReactApexChart className="apx-bare-tip" … />` (react-apexcharts forwards `className` to the container div), or on an existing wrapper div. Default `theme`-only tooltips don't need it. See the `.apx-bare-tip` rule in `index.css`.

## Admin panel structure

`/admin/upload` is a first-class page inside the standard `Layout` (so admins keep
the notifications bell, Settings and profile while doing daily uploads). The
shell is `pages/admin/AdminPanel.jsx`; each destination is a plain component that
renders its own content and **no frame of its own** — no `max-w-*`, no `mx-auto`,
no outer padding. The shell owns one content column, so switching destinations
never moves the frame.

- **`ADMIN_NAV` in `AdminPanel.jsx` is the single source of truth** for order,
  grouping, landing destination and capability filtering. Never introduce a
  second parallel list — the old code kept two, they drifted, and a grantee's
  computed landing tab stopped matching the one displayed first.
- Four groups, ordered by how often they are used and how much they can destroy:
  **Kunlik** (attendance · data · production · cellatt) → **Odamlar va ruxsat**
  (users · profiles · access · permissions · actions) → **Vositalar** (broadcast ·
  ltasks · translations · display) → **Xavfli zona** (cleanup · dbdump). Danger
  items are marked red and stay last; never put a data-destroying tool next to a
  daily one.
- Navigation is a grouped sidebar on `lg+` and a grouped bottom sheet on phones.
  A pill strip is NOT acceptable primary navigation here: at 390px only ~3 of 15
  fit, and an off-screen selection makes the panel look like nothing is selected.
- A destination with unsaved edits calls `useAdminDirty(true)`; the shell
  interposes a confirm before unmounting it. Any new destination holding a local
  draft must do this.
- `?tab=` is two-way (the bot deep-links it) and every destination names itself
  with a title + one-line description (`admin.desc.<id>`), so identity never
  depends on a nav item being visible.
- A destination added by splitting an existing one carries `capKey` pointing at
  the original id, so the split cannot narrow any grantee's access.

## A cell is its CODE (`utils/cellName.js`)

From **2026-08-29** (the operator's standing directive) a production cell is
identified on screen by its four-digit **verifix code** and by nothing else.
The workshop name («Холодные яблоки», «Холодильщик и кладовщик») is not printed
anywhere: not in a table cell, a card, a chip, a filter option, a chart axis, a
modal title, a tooltip, a notification or an export column.

- **`cellLabel(code, leader)` is THE label** and the only place the separator
  lives. Where a code alone is too thin, the second fact is the cell's
  **LEADER** — the person answerable for it, already transliterated by the
  caller's `tl` — never the workshop. Everything else about a cell (its
  brigadir, its shift) is a column of its own, not part of its name.
- **Why**: the names are long, they truncate to nothing in the narrow controls
  that carry them (a 240px filter dropdown, a phone table row), and they are
  near-duplicates of one another — «Холодная ягода» is the name of BOTH 1611
  and 1622 — so a reader who has only the name cannot tell two cells apart,
  while the code always can. The plant's own people say the code.
- **`cellName()` survives for exactly two jobs and is documented as such**:
  SEARCH (typing «яблоки» still finds 1612 on `/cells`, «Smena vaqtlari» and
  the attendance upload — what comes back is the code) and the register's own
  EDITOR (`CellFormModal.jsx`, and the create-a-cell form on `/profile`), which
  is where the four language columns are maintained. Rendering it as a label
  anywhere else is the regression this section exists to prevent.
- **Read surfaces carry no names at all.** `/cells` lost its «Цех» column (and
  the workbook lost that column with it); `/cells/:id` leads with the code and
  lost the four-language «Names» card; the Quality register, ARC (both tabs,
  its charts and its export), Ojidaniya, Zagruzka-cell, Setup times, Staff,
  WorkerConcerns and «Smena vaqtlari» all print the code, with the
  leader beside it where the payload names one.
- **The backend prints the code too** — the approval card and the
  people-exchange notification (`_exchange_target_label`), the ARC export's
  `cell` column, the cells-register workbook. `cell_lookup.workshop_name` is
  documented as NOT-A-LABEL; no payload or file should write it out.
- Three payloads gained the cell's `leader` so the code never stands alone
  where a name used to help: `/api/staff/attendance` `cells[]`, and both
  `/api/setup-times` list rows and its analysis rows. `cell_lookup.by_verifix`
  already shipped it (ARC, Quality), as did `/api/cell-attendance` and
  `/api/idle-cell`.
- The stored names are untouched — nothing was migrated or deleted, so lifting
  this rule anywhere is a rendering change and nothing more.

## A worker belongs to a CELL, and the supervisor says which

From **2026-08-30** the cell on a worker's row is answered in two places, and
only two: the daily file, and the receiving supervisor.

- **The file still assigns the cell.** «Код подразделения» resolves to a cell,
  the admin «Davomat» Save writes it onto every worker, and nothing about that
  changed. Almost every row is placed before a supervisor ever looks at it.
- **An accepted people-exchange assigns NO cell.** The sender picks the
  receiving SUPERVISOR and nothing more; on approval the moved row's
  `verifix_code` becomes NULL. The old flow made the sender choose one of the
  RECEIVING unit's cells — a guess about somebody else's shopfloor, made before
  the shift had run, by the one person who cannot know the answer.
  `_resolve_exchange_target` no longer resolves a cell, `_build_exchange_payload`
  no longer stores one, and all six attendance writes in the two apply paths set
  NULL unconditionally — **including for a document filed under the old rule
  whose payload still carries `target_cell`**, because honouring that key would
  drop the worker into a cell the receiving supervisor never chose. The
  sender-side `old_verifix_code` is untouched, so a revert still restores the
  original cell exactly.
- **The day will not close while anyone is cell-less.** `staff._unplaced_workers`
  is THE predicate and `POST /api/staff/daily/close` answers **409** — for a
  supervisor and for an admin closing on their behalf alike. There is no
  override: a worker with no cell is a worker whose hours belong to no cell's
  load and to no cell's headcount, and that is not reconstructable afterwards.
  Three exclusions, each of which makes the gate UNCLEARABLE if dropped: the
  unit's own **brigadir** (`is_supervisor` — written cell-less on every
  re-projection, and no placement can ever give them one, so counting them locks
  every unit out forever), **nameless** hours-only leftovers (the tab cannot show
  them, so nobody could name one into a cell), and rows that did not come
  (`CALC_ROWS_FILTER` already demands hours > 0). `CELLS_REQUIRED_FROM`
  (2026-08-01) is the floor: every row before the single-file «Davomat» flow is
  cell-less by construction, and an admin can reopen any historical day.
- **The refusal is a plain STRING and it is capped at five names.**
  `utils/api.js` rewrites any non-string `detail`, and both close dialogs render
  `detail` only when `typeof d === "string"` — so a structured 409 arrives as the
  generic "save failed" with the reason stripped off, which is the one outcome a
  hard gate must never produce. `ConfirmDialog` has no max-height and no scroll,
  so an uncapped name list pushes the buttons off-screen.
- **`GET /api/staff/approvals/day` publishes `needs_cell` before the press**, off
  the same predicate, so the tab badge and the refusal can never name different
  people.

### Where they are placed («Yacheykalar», a tab on /staff)

`components/staff/CellPlacementPanel.jsx` over `GET`/`PUT
/api/staff/cell-placement`. Cell-less workers first, then the unit's cells with
their people — the admin «Davomat» tab's shape, asked one level down.

- **Everything is a DRAFT until Save**, one PUT, one action-log row. A
  supervisor rearranging their shift should be able to change their mind before
  anything is real.
- **The destination list is the REGISTRY**, unioned with whatever codes the day's
  rows already carry. `/api/staff/attendance`'s `cells[]` is derived from codes
  PRESENT in today's rows, so on its own it can only ever offer a cell that
  already has somebody standing in it — an empty cell would be unreachable. A
  code the registry has never heard of is shown, never dropped: the two
  registers are allowed to disagree, in public.
- **Reading follows the page's scope; WRITING is the unit's own business.**
  `_can_edit_placement` — admin, or this unit's own supervisor. A supervisor
  widened by a page grant may BROWSE another unit and must not rearrange its
  people, the rule `canCreateHere` already applies to documents on this page.
  The tab itself is visible to admin · supervisor · shift-manager.

### A worker split across two cells

A worker who moved cells mid-shift is **named in both and counted as a FRACTION
of a person in each**, pro-rata by hours.

- **Two Attendance rows**, the second carrying `hc_weight` (its share, the halves
  summing to 1.0) and `split_of` (the primary row's id). Both keep the NAME —
  the worker is on this supervisor's roster either way, so stripping the name off
  the smaller side (what a cross-unit split does, where the name really does
  leave a roster) would be a lie here.
- **`hc_weight` is what keeps the arithmetic honest.** `idle_source` and
  `kpi_calculator` sum weights instead of counting rows, so each cell sees a
  fraction — and because both halves sit in the SAME unit the weights add back
  to exactly 1.0, so **no unit total moves**. `hours_worked` is split the same
  way and also sums to the original.
- **`_split_hours` is deliberately NOT `_compute_split`.** That one answers how a
  day divides between two UNITS, with an early-arrival rule, a return window and
  a minimum-hours test that can strip a name. None of it applies inside one unit.
  The clock is used only for the RATIO; the halves are scaled to sum to exactly
  the recorded hours.
- **`split_of IS NULL` makes the PRIMARY row canonical.** Seventeen name-keyed
  `.first()` lookups in `staff.py` — admin edit, admin delete, bulk delete,
  edit-request approve/reject/restore, and every exchange apply/revert — assumed
  one (manager, date, worker_name) could only ever match one row. Each now
  carries the guard, or a split worker's admin edit would land on an arbitrary
  half.
- **`Float`, never `Numeric`.** `hours_worked` is `Numeric(10,4)` and SQLAlchemy
  returns `Decimal` for it, which is why every reader wraps it in `float()`. A
  Decimal weight summed into a float accumulator raises `TypeError`.
  `Attendance.hc_weight` must also stay in `idle_source`'s EXPLICIT column list —
  that query selects columns, not the entity, so an omitted one is an
  `AttributeError` inside `build_metrics_list`, i.e. Overview, the Zagruzka
  heatmap, the comparison and the brigadir profile.
- **`verifix_hc` is a FLOAT on the wire now.** Every render of it and of `hcDiff`
  must be formatted, or a split prints IEEE noise.
- **Undo is `unsplits`**, carrying the SECONDARY row's id: the halves were scaled
  to sum to the original and the clocks were cut `C-T` / `T-O`, so both restore
  exactly without a stored copy of either.
- **`_merge_split_halves` is THE fold-back and it must run wherever a row LEAVES
  the unit or stops existing.** A split is a fact about a worker inside ONE
  unit, so the moment their row moves the halves must stop existing too —
  otherwise the same worker-day is named on two units at once, each counting a
  FRACTION of them. Six sites change a row's unit and all four exchange paths
  need it: both applies and both reverts. The round-1 fix landed on three of the
  four and the missing one (`_revert_split_exchange`) orphaned the secondary on
  the unit the worker left. `_drop_split_secondary` is its twin for the four
  DELETE paths — there the worker-day is going away, so there is nothing to fold
  the hours back into.
- **A fold-back INVALIDATES the exchange's stored snapshot, so it is re-taken.**
  This is the subtlest trap in the whole feature and it destroys hours silently.
  The payload snapshots the worker's row when the document is FILED; for a split
  worker that row holds only `h1` and the cut clock `C-T`. Folding the halves
  back at APPLY time restores it to `h1+h2` / `C-O` — and `_compute_split` then
  divides the STALE snapshot, CLAMPING the transfer time into the old window
  instead of refusing, so `part1+part2` sums to `h1`, the writes overwrite the
  row with it, and `h2` is gone from every load figure with no leftover row to
  show for it. `_snapshot_row` is the one shape and both applies re-take it
  whenever the fold-back returns True.
- **`effective_hours` divides pro-rata too**, and the merge sums it back. It is
  what the загрузка reads where it is set, so blanking it on a split would
  quietly move a cell's load the moment somebody was placed.
- **An admin edit reaches BOTH halves, and an HOURS edit folds first.**
  `job_title` and `schedule` describe the person and belong on both rows —
  leaving one behind puts the halves on opposite sides of `is_direct_role`.
  `hours_worked` restates the whole DAY, and a division of the old total cannot
  describe the new one, so the split is folded back and the supervisor re-makes
  it. Every DELETE and EDIT snapshot records `_whole_day_hours`, or the undo
  restores the worker with a fraction of their day and the rest existing nowhere.
- **`unsplits` is de-duplicated.** `SessionLocal` is `autoflush=False`, so a
  `db.delete(sec)` that has not been flushed is still returned by the next query
  and re-mapped onto the same instance — a repeated id folds the same hours in
  twice.
- **Anything counting PEOPLE must sum `hc_weight`, not rows.** The /staff KPI
  cards, the role chips and the load denominator all do; `/api/staff/attendance`
  deliberately returns BOTH halves (the tab needs them), so a plain `.length`
  there reports a split worker as two people on the very page the split is made
  from.

**Known limit, inherited and NOT fixed here:** `attendance_batch._sync_manager`
(and the per-supervisor upload in `admin.py`) DELETE the whole (manager, date)
and rebuild from `AttendanceBatchRow`, which carries no placement and no weight.
**Re-saving a day's batch after a supervisor has placed people undoes their
work**, exactly as it already loses exchanged workers (`exchange-lost-workers-audit`).
A replay for it is a separate decision — ask before building one.

### /staff-cells is GONE

«Verifix to'g'irlash (yacheyka)» — the cell-level exchange page — is deleted
whole: `pages/StaffCells.jsx`, `routers/staff_cells.py`,
`services/cell_exchange.py`, `services/cell_scope.py`, the `staff-cell` page key
and its grants, its 245 translation keys, and the sandbox `HrDocument` rows it
filed (`startup.purge_cell_exchange_sandbox`, flag
`cell_exchange_sandbox_purge_2026_08_30_v1` — changing what it does needs a NEW
flag key). Every document is real now, so `approvals.py` and `doc_audit.py` lost
the TEST/REAL fork entirely and `_real_docs` keeps its whitelist for the other
reason: a register that serves every type must not surface one no reader has
decided the meaning of. `services/day_state` goes on hand-copying that tuple —
see the comment there.

## Factory (plant) dimension

The company runs more than one plant. The dimension is attached in **exactly one
place** — `managers.factory_id` — and everything else derives from it: a cell
follows its supervisor, a leader follows their unit, a downtime/quality row
follows the supervisor its name resolves to, a concern follows the unit it was
logged against. Never add a second `factory_id` column; two sources let a cell
claim factory A while the supervisor running it sits in factory B, and there is
no correct way to render that.

- `app/services/factory_scope.py` is THE definition. Endpoints take
  `factory: Optional[int]` and call `scoped_manager_ids(db, payload, factory,
  manager_id)`, which intersects the factory with the caller's existing
  supervisor filter AND enforces the viewer lock. `None` = no narrowing;
  an EMPTY list is a real answer ("no supervisor matches") — always test it with
  `empty_scope()` or the empty factory reads as the whole plant.
- **Supervisors, leaders and shift-managers are locked** to their own plant
  server-side (`resolve_factory` overrides whatever `?factory=` says). Hiding
  the tab is not the mechanism — the query parameter is typeable. The first two
  are answered through their UNIT (`managers.factory_id`); a shift-manager is a
  PERSON, so theirs is `role_profiles.factory_id` and `viewer_factory_id` reads
  it through `shift_scope.factory_of`. Only admin and top-manager switch freely.
- Factory-aware pages: Overview, Zagruzka, Ojidaniya (`Downtime`), Workers,
  Quality, Concerns. Frontend state is ONE shared value in
  `context/FactoryContext.jsx` (`useFactoryParams` merges it into request
  params, `useFactorySupervisors` scopes a supervisor picker and drops a pick
  that fell out of the plant). Deliberately NOT per-page `usePersistentState`:
  six pages remembering different plants is a contradiction nobody can see.
- Rows that resolve to no supervisor (unmatched Quality names, unassigned units,
  legacy concerns) appear ONLY under «All factories» — visible, never silently
  dropped, never padded onto a plant they may not belong to.
- The switcher is `useFactorySection()` from `components/ui/FactorySelect.jsx` —
  a `FilterPanel` section, first in each page's section list (chip when
  narrowed, inert chip for locked viewers). See the UI-template table.
- Admin: `pages/admin/Factories.jsx` (`admin.factories.manage` capability) owns
  the register, tab order, the ONE global default tab, the «All» tab switch, and
  both assignments — supervisor units and shift-manager profiles.

## A shift-manager works ONE shift in ONE plant

From **2026-09-02** (the operator's directive) a shift-manager's reach is the
INTERSECTION of their shift and their plant: the shift-1 manager of Keles covers
the shift-1 supervisors of Keles and nobody else.

- **`services/shift_scope.py` is THE definition** — `shift_of`, `factory_of`,
  `unit_ids`, `covers`, `role_ids_for_unit`. Before it, "the units this
  shift-manager covers" was spelled TEN times — six in `routers/staff.py`, one
  in `routers/concerns.py`, two in `routers/production.py` and one in
  `capabilities.profile_unit_ids` — every one of them `Manager.shift == shift`
  with no plant in it. Ten spellings of one rule is how a shift-manager comes to
  read one plant's day on /staff and approve another plant's edit request from
  the same screen. Never re-spell the intersection at a call site.
- **`role_profiles.factory_id` is not a second copy of the data dimension.**
  `managers.factory_id` still decides which plant a ROW belongs to; this says
  where a PERSON works, exactly as `role_profiles.shift` already says which
  shift they work. A supervisor and a leader answer the same question through
  their unit, which is why `factory_scope.viewer_factory_id` reads it off
  `managers` for them and off the profile through `shift_scope` here.
- **NULL = every plant, and that is the DEFAULT.** Nothing moved when this
  shipped: the migration is deliberately not backfilled, so each shift-manager
  keeps the plant-wide reach they had until an admin narrows them on «Zavodlar».
  Same rule `viewer_factory_id` already applies to an unassigned unit — pinning
  somebody to nothing would empty their pages — so the answer degrades toward
  the OLD behaviour, never toward an empty one.
- **`role_ids_for_unit` is the inverse of `covers` and must stay the inverse.**
  It decides who is NOTIFIED about a unit and who a supervisor may escalate a
  concern to; addressing "every manager on shift 1" is what sent one plant's
  decisions to the other plant's chat. `concerns._sm_names` is its in-memory
  twin (one pass instead of a query per unit) and carries the same rule,
  plant-less profiles included.
- **The picker and the validator read ONE set.** `concerns._shift_manager_profile`
  is constrained by `role_ids_for_unit`, the same call the picker list is built
  from, so the list a supervisor is shown and the choice the endpoint accepts
  can never be two different sets.
- **An empty scope is a real answer.** `unit_ids` returning `[]` means "no unit
  matches", and every caller must keep treating it as such (`empty_scope`) — an
  empty list read as "no filter" is the whole plant.
- Deliberately unchanged: `/leaders` still treats a shift-manager as plant-wide
  (it never applied the shift either, so narrowing it is a separate decision),
  and the bot's `_caller_shift` still answers the shift alone — its cards go
  through the factory-aware endpoints, which apply the lock themselves.
- Admin: the «Smena menejerlarini biriktirish» block on «Zavodlar»
  (`PUT /api/factories/assign/shift-managers`). Deleting a factory is refused
  while shift-managers still belong to it, for the same reason it is refused
  while units do.

## Cell shift times (`/admin/upload?tab=shifttimes`)

From **2026-08-21** a cell carries the clock it actually works —
`cells.shift_start` / `cells.shift_end`, two nullable `VARCHAR(5)` "HH:MM"
columns, edited on the admin «Smena vaqtlari» destination
(`pages/admin/ShiftTimes.jsx`, capability `admin.cell_hours.manage`).

- **It is a REGISTER and nothing more.** No KPI, no score, no validation reads
  it: загрузка still divides by the flat 480/`pp_shift_min`, the idle-cell
  ojidaniya pickers still accept any hour ("a bound guessed from a shift would
  refuse honest data"), and the leader checklist still runs on its own five
  per-shift constants. Wiring a consumer is a separate decision — **ask before
  making these hours move a number**, because the moment one does, every cell
  whose clock nobody has confirmed starts scoring against a placeholder.
- **`services/cell_hours.py` is THE definition** — `defaults`, `resolve`,
  `duration_min`, `crosses_midnight`. Duration is always DERIVED; there is no
  minutes column, and a second place computing "how long is this cell's shift"
  is how the two answers start disagreeing.
- **Both-or-neither.** A cell has both clocks or neither; a half-set pair is
  refused on write and reads as inherit. NULL = inherit the SHIFT default, and a
  cell's shift is still its supervisor's — this adds a clock to a cell, never a
  second shift dimension (`Manager.shift` stays the only one).
- **The defaults are two `AppSetting` rows** (`cell_hours_shift_1` /
  `cell_hours_shift_2`, value `"HH:MM-HH:MM"`), seeded once with a **placeholder**
  08:00–20:00 / 20:00–08:00 that an admin is expected to confirm. Editing one
  silently re-times every inheriting cell, so the Save confirms and names that
  count. `startup.add_cell_shift_times` only ever inserts a MISSING key — it
  must never overwrite a value an admin set.
- **Clock convention, unchanged from everywhere else**: Tashkent wall clock,
  `end <= start` ⇒ crosses midnight (+1440), `start == end` refused (the
  `idle_cell` rule). The client's duration helper is a deliberate twin of
  `duration_min` and must stay one.
- Bulk editing is the **SELECTION**, not the filter: checkbox rows with
  «select all visible» (the `Factories.jsx` model), a sticky bulk bar naming the
  count, and a primary button that carries the count into its own label. The
  ltasks "the filtered set IS the scope" model is deliberately NOT used here —
  filters narrow to a brigadir's cells, but the two exceptions in that list are
  exactly what an operator needs to drop.
- Read surfaces: this tab and `/cells/:id` (the Ownership card's «Ish vaqti»
  row, fed by `hours` on `GET /api/profiles/cells/{id}/details`).

## Which ojidaniya categories the загрузка counts

`sheets_reader.OJIDANIYA_ONLY_CATS` is **THE list** of categories that show on
the Ojidaniya page and nowhere else. Every KPI door reads that one set —
`build_metrics_list`, `/api/downtime`'s `kpi_only`, `idle_source`'s pre-union
drop, `/zagruzka-cell` — so a category enters or leaves the загрузка on every
surface at once. Never re-spell the rule at a call site: two lists is how the
fleet page and the Daily donut start disagreeing about the same minutes.

- From **2026-08-22** the set is **`{"Cat H"}`**. Cat I («Олдинги смена иши
  тугашини кутиш» — waiting for the previous shift to finish) now COUNTS in the
  загрузка by user directive: that wait is time the shift stood still, so it
  belongs there like any other stoppage.
- Cat H («Тозалаш» — cleaning) is what remains: planned work the shift does,
  not a stoppage it suffered.
- **Nothing is stored, so nothing needs a re-sync.** `equip_downtime` and the
  category breakdowns are derived per request from `DowntimeData` /
  `cell_ojidaniya_intervals`, so every historical day re-reads under the new
  rule the moment the backend restarts — the fleet heatmap, the comparison, the
  brigadir profile, the Daily donut, `/summary`, the bot `/ojidaniya` card and
  the weekly svodka all move together. **Consequence to know: past загрузка
  figures change.** Idle goes UP and net utilisation DOWN on every day that
  carried Cat I minutes, and the 50-min idle flag may newly fire on them.
- The Ojidaniya page's «Barchasi / Zagruzkada hisoblanadi» toggle is unchanged
  and still says which scope is on screen; Cat H is now the only thing that
  separates the two views.
  `/zagruzka-cell`'s «Cat H: N daq hisobga olinmadi» note names the remaining
  category, and its reconciliation delta shrinks accordingly.

## Ojidaniya comes from the CELLS (`/admin/upload?tab=idlesource`)

From **2026-08-27** — `idle_source.CELLS_FROM`, the user's directive — **every**
supervisor's ojidaniya minutes come from the per-cell interval model
(`cell_ojidaniya_intervals`, what the leaders file on `/idle-cell`). The
«Смена отчёт» sheet row (`DowntimeData`) is **not read for any unit on any day
from that date on**, and nothing turns it back on.

- **The floor is a CONSTANT with no override**, the shape the AI review floor
  and the client-compat floor already use: a rule a per-unit toggle can quietly
  undo is a rule nobody can read off the platform. Moving it is a one-line
  edit; it must never be moved LATER, which would hand days back to the sheet
  that have already been read off the cells.
- **Days BEFORE the floor are untouched, and they are all the per-supervisor
  register still governs.** `IdleSourceSetting` (the «Kutish manbasi» tab) can
  start a unit EARLIER — that is where the pilot, **Suvonov Elshod OF (manager
  5) from 2026-08-21**, still lives, seeded by `startup.seed_idle_source_pilot`
  (insert-only, flag-guarded) — and a `sheet` row keeps that unit's earlier
  days on the sheet. Neither can reach a day the floor covers. History is never
  rewritten and one day is never answered by two sources.
- **The tab must not present a setting the platform stopped honouring**, so
  `GET /api/admin/idle-source` carries `cells_from` (the floor) and each row's
  `effective_from` — `idle_source.start_day`, the ONE definition of "which day
  does this unit actually start reading its cells", never re-derived on the
  client.
- **Consequence to know: the sheet number is gone from 27 Aug for everyone.**
  A unit whose leaders file nothing on `/idle-cell`, whose cells carry no
  counted attendance (`ΣN == 0`), or that owns no cells at all now reads **0
  minutes** — idle DOWN and net utilisation UP on exactly those units. That is
  the directive, not a bug; the fix for a unit reading 0 is its leaders filing
  intervals, not a fallback.
- **`services/idle_source.py` is THE definition** — `CELLS_FROM`, `cell_units`,
  `start_day`, `uses_cells`, `unit_downtime`. `cell_units` returns EVERY unit
  (at the floor, or earlier where the register moved it), so a consumer that
  asks "is this unit switched" gets one answer and the floor cannot be missed.
  The unit figure is the **headcount-weighted mean of its cells**: `Σ(Nᵢ·Tᵢ) ÷ ΣNᵢ`, N = the people who ACTUALLY worked cell i that
  day (direct-role attendance matched by `verifix_code`, the `verifix_hc`
  rule), T = that cell's UNION of stopped ranges. **All** the unit's cells
  count (`in_load` ignored, as on `/zagruzka-cell`); a cell with N = 0 is on
  neither side; ΣN = 0 ⇒ no key ⇒ consumers read 0. The Ojidaniya-only
  categories are dropped BEFORE the union for the KPI `total`; `total_all`
  keeps them for the Ojidaniya page without `kpi_only`. Per-category minutes use the same weighted
  rule per category (they may sum to more than the total when causes overlap);
  the «To'xtamaganda» half is the weighted plain sum per category. Legacy
  minutes-only rows are never read. All merging stays in `idle_intervals`.
- **A day with no interval on any cell is 0 minutes** — no marker, no sheet
  fallback. The override in `build_metrics_list` and `get_downtime` writes the
  derived value EVEN WHEN it is absent, or the sheet row leaks back.
- **Everywhere switches through the two doors**: `build_metrics_list`
  (Overview, Zagruzka heatmap/comparison, brigadir profile, Daily performance
  block, `/summary`) and `get_downtime` (+ seasonality) — which is what the
  Daily donut, the bot `/ojidaniya` card and the weekly svodka read. Any new
  consumer of ojidaniya minutes must go through one of them, never
  `DowntimeData` directly. No source label on payloads (the user's call); the
  50-min flag and the flat 480 base are unchanged; `/zagruzka-cell` stays the
  untouched test twin (its reconciliation delta should read ~0 from the floor
  on, for every unit). The sheet keeps IMPORTING for everybody — it feeds
  nothing here any more, and it is what makes the two answers comparable.
- **The approval step on `/idle-cell` is GONE (same day).** A leader's entry
  counts the moment it is saved (status written `approved`); leaders cannot
  edit or delete their own rows — only the unit's brigadir, an admin or a
  `CAP_IDLE_APPROVE` grantee (now a delegated editor, same reach as before).
  The brigadir is told per entry (`idle_request_new` → «Yangi kutish
  kiritildi») and the close-day `ConfirmDialog` on Daily and Staff prints
  «Bugun liderlar N ta kutish kiritdi — ko'rib chiqdingizmi?» from
  `GET /api/idle-cell/day-summary`; closing the day IS the review, and it
  still proceeds. Pending rows were auto-approved once
  (`startup.approve_pending_idle_requests`); rejected rows stay rejected and
  visible. `decide` / `decide-all` / `pending-count` and the sidebar badge no
  longer exist, and `close_day` no longer gates on them.

Related memory: `idle-source-switch`.

## Attendance charts read the ORIGINAL brigadir

`/workers` answers ONE question — *of the people on this brigadir's own list,
how many turned up* — so an approved people-exchange must not move the answer.
It does, three ways: a → supervisor move reassigns the row to the receiving
unit, a → task move zeroes the day (clock «X», hours 0) so every «came» filter
reads a no-show, and a worker who cleared `MIN_MOVED_ZAGRUZKA_HOURS` on neither
side of a transfer-time split loses their NAME off the row and vanishes from
both rosters. All three are right for the загрузка — the borrower really did
have those hands — and wrong here: exchanges are decided by supervisors and
admins after the fact, so scoring the brigadir on them makes attendance a
record of other people's paperwork.

- `app/services/exchange_rewind.py` is THE definition. `original_rows(db, from,
  to)` replays approved `people_exchange` documents backwards in memory —
  `old_manager_id` per employee, plus the full `snapshot` the two hours-touching
  paths already store — and returns `(names, rows)`. **Nothing is written**, and
  nothing outside these charts reads it: the Staff page, the загрузка, the
  exports and every KPI still show where a worker actually spent the day. Only
  `verifix_code` is left alone (no chart here splits by cell).
- **It is a NAME PARTITION, not a patch.** The caller excludes exactly `names`
  from its SQL (`ex_only`) and counts `rows` in Python; the two sets are
  disjoint, so `COUNT(DISTINCT worker_name)` totals merge by plain addition with
  nothing double-counted. Adding count-level deltas to the SQL instead would
  double a worker who holds two rows in a day. A name that also belongs to
  someone the exchange never touched — a namesake, a day outside the document —
  is passed through unchanged, which is what makes the partition safe.
- `_original_scoped()` in `routers/workers.py` cuts those rows to the units and
  days the SQL sees, **after** the rewind — a worker lent across shifts or plants
  belongs to the one they clocked in on, so filtering on where the exchange left
  them would drop precisely the rows this exists to recover. `_py_came` /
  `_py_on_leave` / `_py_known_title` are exact twins of the SQL predicates
  beside them; classify the exchanged half by one rule and everyone else by
  another and the two halves stop adding up.
- Both `/api/workers/headcount` and `/api/workers/trend` are on this basis, so
  the whole page reads one way — heatmap, donut, treemap, trend and the
  per-brigadir table. The charts say so (`workers.info.original`, appended to
  the five info tooltips). `role_change` documents are deliberately NOT rewound:
  they change a job title, i.e. which role column a present worker lands in,
  never whether they came.

## What a supervisor's ojidaniya bar is MADE OF (the detail modal)

From **2026-08-30** pressing a supervisor's bar on `/downtime` opens
`components/idle/UnitOjidaniyaModal.jsx` — the unit's waiting date by date, and
inside a date cell by cell: the `/idle-cell` timeline (`DayTimeline`, reused
verbatim) over a table of that cell's own events. The bar was a number with no
way in — 464 minutes over a fortnight and nothing about which cell stopped, when
or why.

- **It serves the EVENTS; it never computes a second "how much".**
  `GET /api/downtime/cell-detail` answers only "what did the cells file". The
  figure the CHART counted for a date stays the page's own `/api/downtime` row —
  which is where the headcount-weighted unit mean and the sheet row both come
  from — so the modal can never state a total the bar it was opened out of
  disagrees with. `/api/downtime`'s `rows` and `summary` gained `manager_id` for
  exactly this: the sheet spells brigadirs in two alphabets, so a name is not an
  address.
- **Two totals per date, both named** (the user's call). The unit's day is the
  headcount-weighted MEAN of its cells (`Σ(N·T)÷ΣN`), so the cells listed under
  it add up to something else — usually much more. Printing one of them either
  contradicts the bar or leaves an unexplained gap on screen, so «Diagrammada»
  and «Yacheykalar» sit side by side and each says what it is.
- **A day the unit does not read from its cells says so.** Before
  `idle_source.CELLS_FROM` (earlier where the register moved a unit) the number
  came from the «Смена отчёт» row, which carries category minutes and no
  endpoints. `cells_days` on the payload is what tells a sheet day from a cells
  day nobody filed anything on — the two are indistinguishable from emptiness
  alone, and reading one as the other makes a reported day look silent. A sheet
  date shows its category table plus a notice, never an empty cell list.
- **It MIRRORS the page** — the To'xtaganda/To'xtamaganda half, the
  «загрузкада / hammasi» scope and the doughnut's category picks all narrow it,
  **server-side**. This is a zoom-in on one bar, not a second view of the
  register: an event the bar did not count has no business being totalled
  underneath it. Pressing a category SEGMENT carries that category in as well
  (only when the segment has minutes — in the Total view every category series
  is a row of zeros).
- **The union bar follows the half on screen.** `idle_intervals.merged_spans`
  is the one definition and `summarize` now calls it; `stopped_only=False`
  unions whatever it is handed, which is what the To'xtamaganda half needs —
  there the recorded fact IS the subject, and a bar built from the stopped rows
  would be empty under lanes that are full. `DayTimeline` gained `unionLabel`
  so the caller that changed what is drawn is the caller that renames it.
- Only cells that have waiting appear; dates are newest-first, collapsible, the
  newest open. A cell's header total is the UNION of the rows shown, with the
  plain sum in its tooltip where an overlap makes the two differ.
- **The modal carries NO export** (the operator's call, 2026-09-03): its footer
  is the close button alone. The page's own «Excel» button one level up is the
  export for this register, and it already carries these events on its
  «Yacheykalar» sheet — a second file offering one bar's slice of the same rows
  is a second answer to «what did the cells file». `POST
  /api/downtime/cell-detail/export.xlsx` still exists and still works (one row
  per EVENT on a cells day, one row per CATEGORY on a sheet day, marked as such,
  delivered by `app/xlsx_delivery.py`), but nothing in the UI calls it — putting
  the button back is one `Button` in the footer, deleting the endpoint is a
  separate decision.
- Scoped exactly as the page is: `manager_id` is a query parameter, so
  `scoped_manager_ids` re-decides it server-side — a viewer who cannot see the
  unit on the chart cannot read its cells here either.

## The weekly deck (`/downtime` → «Haftalik hisobot»)

From **2026-09-03** the toolbar of `/downtime` carries a second export beside
«Excel»: a fourteen-slide PowerPoint report of the week — `POST
/api/downtime/export.pptx` → `services/ojidaniya_deck.py`, with the prose
written by Gemini in `services/deck_narrative.py`. It replaces a deck somebody
was building by hand every week (read every leader's entry, total the minutes
per category and per brigadir, find the three that matter, write the root
causes, lay out the slides).

- **It is a FIXED report, not a view of the page.** One plant, both shifts,
  every supervisor, all categories, the stopped half as the headline with the
  not-stopped half named beside it. The toolbar's filters change nothing —
  which is exactly why the button never fires without its `ConfirmDialog`,
  which writes the whole scope out. `GET /api/downtime/deck-window` serves the
  period to that dialog rather than the browser computing it: the window is a
  RULE, and a JavaScript copy of it would drift until the confirm named one
  week and the file carried another.
- **`services/report_week.py` is THE window** — last Wednesday back to the
  Wednesday before it, **both included**, so eight calendar days and two
  consecutive reports SHARE their boundary day (the operator's call, mirroring
  the hand-made deck it replaces). `last_wednesday` is strictly before today,
  so a Wednesday press is about the week that just closed. The comparison
  window is the eight days ending where this one begins — same length, so the
  percentage means something.
- **Every figure comes from the page's own computation.** `_downtime()` and
  `_cell_detail()` are what `/downtime` itself reads; the deck module is HANDED
  their output and never queries. The router does the fetching, so nothing in
  `services/` imports a router.
- **Two totals, and both are named.** A unit's day is the headcount-weighted
  mean of its cells, so the events listed under a brigadir add up to something
  else — usually much more. The KPI slides carry the weighted figure the page
  charts; the per-cell and per-event slides carry the cells' own sums and SAY
  so. Same rule `UnitOjidaniyaModal` already follows.
- **The deck says NOTHING about where a figure came from, and that is a
  ruling — do not "fix" it.** No slide names the «Смена отчёт» row or the
  cells, none carries a comparability caveat, and `_RULES` rule 5 forbids the
  model raising it either. The operator decided this on 2026-09-03, having
  been shown the consequence in full.
  **The consequence, stated plainly so nobody rediscovers it as a bug:** across
  `idle_source.CELLS_FROM` the week-over-week percentage sets two DIFFERENT
  measurements against each other. On the first real run the comparison week
  was **100%** sheet-based, the delta read −64.5%, and the deck reports that as
  a 65% improvement — on the cover, on the KPI card, under a «Yaxshilandi»
  heading, and in Gemini's own prose. Nobody caused it, and the following week
  it climbs back. A guard for this was built (`comparable`, a red caveat, a
  prompt instruction) and then removed at the operator's direction; re-adding
  any of it needs a new decision, not a bug fix.
- **Gemini writes the commentary AROUND the notes; it never rewrites one.**
  A leader's note is the recorded evidence of a shift, so it is quoted verbatim
  — transliterated to Latin where it was typed in Cyrillic (about a third of
  them are, in the same column), and otherwise reproduced with its typos. The
  model is given the already-computed figures and told to reuse them as given;
  it is asked for synthesis only. `_VOCAB` hands it the plant's own words
  (yacheyka, sklad, bozorlik, zayavka, smena topshiruvi) because a general
  model reaches for dictionary synonyms and a report that renames the shopfloor
  reads as though written by somebody who has never been on it, and `_STYLE`
  demands Uzbek that sounds native rather than translated.
- **A Gemini failure must not cost the operator the deck.** `write()` returns
  None on anything — no key, quota, malformed answer — and each prose slot
  falls back to a plain statement of its own numbers. `narrative: false` on the
  body skips the call outright.
- **`cat_key()` normalises whatever spelling the model returns** («Cat D3» /
  «D3» / «D3 — Otdellararo mahsulot»), because it answers differently in
  different fields of the SAME response, and a strict lookup silently dropped
  the root-cause line off a slide.
- **Always Uzbek Latin**, whoever presses it, so the words live in the module
  rather than travelling from the client as they do for the workbook. The
  category labels are a copy of the `downtime.cat.*` uz bundle and the colours
  mirror `catColor()` — keep them in step.
- **Admin only**, checked in the endpoint and not merely by hiding the button:
  the deck covers the whole plant — every unit's minutes, cells and note text —
  which `/downtime` deliberately withholds from a supervisor, and the endpoint
  is reachable without the UI.
- **The plant is resolved by NAME, never by id** (`DECK_FACTORY = "Uchtepa"`,
  matched against `code` and all four name columns). An unresolved name is a
  hard 500 naming the factories that DO exist — a silent fallback to «all
  factories» would produce a file that looks right and carries another plant's
  units. Ids differ between a checkout and production; `startup.MANAGERS`
  already records that lesson.
- Deliberately NOT built: a scheduled weekly send (the operator chose the
  button), a PDF (`soffice` is the route if it is ever wanted), and slide 12 of
  the original deck — it scored whether each problem was FIXED, off a «yechim
  sanasi» column in the old Google-Sheets journals that
  `cell_ojidaniya_intervals` has no equivalent of. Adding one is a schema and
  form change, not a deck change.
- Logged as `export.ojidaniya_deck`; delivered by `xlsx_delivery.deliver_file`
  (browser downloads, Telegram DMs), which is the old `deliver_xlsx`
  generalised over the MIME type — the WHERE decision stays in one place.

## The Ojidaniya page as a workbook (`/downtime` → «Excel»)

From **2026-09-03** the toolbar of `/downtime` carries an «Excel» button at its
right edge (icon-only on a phone) — `POST /api/downtime/export.xlsx` →
`services/ojidaniya_export.py`. It does, once, what a person otherwise does by
hand before a raw dump is fit to forward — freeze the header, widen the
columns, format the numbers, sort by the biggest, add totals, zebra the rows,
add filters, turn codes into words, pull out the per-person and per-category
summaries, colour what is over the threshold, add the chart, name the sheets,
and put a title with the period and the filters on top — so the file opens
ready to read and ready to print.

- **Every number comes from the page's own code.** `routers/downtime.py`
  `_downtime()` IS the page's computation, refactored out of `GET /api/downtime`
  so the endpoint and the export read ONE function; the events come from
  `_cell_detail`, the bar modal's own reader. The client sends the SCOPE (its
  filter state) and the WORDS (supervisor names in the viewer's alphabet via
  `tl`, the labels, each category's label/note/colour off `catColor`) — never
  a figure. The formatter is pure and imports its primitives from
  `quality_export.py` (the house report style: gold banner, scope strip, KPI
  cards, sections, zebra, data bars, native charts, no gridlines, print setup).
- **Five tabs in the page's reading order**: Umumiy (banner · scope strip ·
  six KPI cards · per-brigadir table with data bars + a bar chart coloured
  red/indigo by the 50-min flag · category share with a doughnut in the
  category colours) · Kunlik (brigadir × date matrix under a colour scale,
  >50 in red, a fleet-total row, and the trend as a table + line chart with the
  50-min dashed line) · Reyestr (one row per brigadir-day, a column per
  category, autofilter, frozen header) · Yacheykalar (one row per EVENT the
  cells filed — cell, leader, clock, note; a day still read off the shift
  report is one row per category marked «Smena hisoboti», so the file is never
  shorter than the screen) · Toifalar izohi (what each category means and
  whether the загрузка counts it).
- **The doughnut's category picks narrow the totals exactly as the chart does**
  (a bar = the sum of the picked categories); the 50-min flag stays a fact about
  the unit's WHOLE day, as on the page. `stopped` / `kpi_only` ride in like
  every other narrowing.
- `rows[].source` («cells» | «sheet») was added to `/api/downtime` for the
  export — additive. The period is capped at 400 days. Logged as
  `export.ojidaniya`; delivered by `xlsx_delivery` (browser downloads,
  Telegram DMs).

## Automatic proof verification (BOTH shifts, from 13 Aug 2026)

Leader-checklist proof photos are reviewed by Gemini. Since **2026-08-13** that
review is **automatic and consequential**: nobody presses anything, and a
flagged proof costs its task immediately. Everything before that date keeps the
original regime, where a flag is a note and only a human `rejected` moves a
number.

- **Shift 2 joined on 2026-08-22 (user), at full parity.** Two switches moved
  together and they answer different questions, which is the whole reason they
  have separate names:
  `leader_ai.REVIEW_PAUSED_SHIFTS = ()` — whose photos are LOOKED AT — and
  `AUTO_SHIFTS = (1, 2)` — whose flags COST points. Shift 2 had been paused
  since 2026-08-14 and outside the automatic regime before that, so it was the
  one shift running on neither. **Consequences to know:** closing a shift-2 bot
  day now sends it straight to the AI (that close is the whole of shift 2's
  review — it files ONLY in the bot, so there is no sheet Refresh behind its
  proofs); flags deduct; the day report DMs the leader and the brigadir; and
  because `AUTO_FROM` is the ONE floor and shift 2 was deliberately given no
  floor of its own, **every shift-2 day filed since 13 Aug is in the regime and
  re-scores to its verified number**. `startup.queue_shift2_backlog` (flag
  `leader_ai_shift2_backlog_2026_08_22_v1`) is the one-shot that queues those
  already-closed nights — nothing periodic would have found them, because the
  recurring discovery pass is the SHEET layer. It is insert-only and rides every
  bound a live close rides (review floor, rehearsal window, ref dedupe, done +
  media only), so re-running it under a new key adds exactly the rows the first
  pass could not. Reports go out newest-first, so today's is never stuck behind
  a fortnight-old one.
- **The pause machinery stays live and is the resting state, not dead code.**
  `review_paused(shift)` and `paused_clause()` (its SQL twin) answer for an
  empty tuple — `false()` and False — so with nothing paused every door is open.
  To pause a shift again: put it back in the tuple AND give
  `startup.drop_paused_shift_reviews` a **NEW flag key**, or the old "already
  ran" mark makes the new pause a no-op on every box that has booted once (same
  lesson as the review floor). While a pause holds, nothing queues that shift
  (`discover`, `queue_report`, both bot day-close doors), the drain refuses it,
  and every «queued» figure must exclude it — `_start_run`'s total, `/progress`,
  `/recheck`, `/retry` — because a queue number nothing works through parks the
  strip at «40 queued» forever. `should_chain` MUST exclude it too, or a pass
  with unreachable "work left" chains a new drain every 5 seconds around the
  clock. One human door stays open even then: the admin's per-task «check now»
  (`review_now` → `queue_report(force=True)`), which reviews the row directly
  and never touches the queue. The `AiRecheck` «paused» toast names no shift
  NUMBER, for the same reason — the tuple is the truth, the copy must not
  contradict it.
- **ONE predicate owns the boundary**: `leader_ai.in_auto_regime(date, shift)`
  (`AUTO_FROM = "2026-08-13"`, `AUTO_SHIFTS = (1, 2)`), with `_auto_clause()` as
  its SQL twin. Five surfaces read it — the score overlay, discovery, the
  drain's ordering, the report DM and the day-report page. A second spelling of
  "is this automatic" would show a leader a red badge on a day whose score never
  moved. An unmatched unit carries a null shift and is deliberately OUT.
- **Every flag rejects** — `not_proven`, `off_topic`, `no_date`, `date_mismatch`
  **and `unreadable`** (the user's ruling). A technical `error` row is NOT a
  flag and never deducts: a dead Drive permission must not mass-fail a shift.
  Only a human `approved` lifts an automatic rejection; `requeried` does not.
- **A photo window's hours are anchored to the SHIFT, not to the calendar
  date** (user, 2026-08-22). `leader_ai.window_offset(shift, win)` is THE
  anchor and `date_window`, `date_days` and `clock_in_window` all read it, so
  what the card prints and what the flag judges cannot drift. Shift 2's «13.08»
  runs 13.08 17:00 → 14.08 09:00, so an hour inside that night sits on the 13th
  or the 14th depending on nothing but which side of the shift's own opening it
  falls on — a window written «00:00 — 02:00» can only mean the small hours of
  the **14th**. Pinning it to the report date instead is a window no honest
  photo can ever satisfy, and a proof stamped 14.08 01:41 was flagged
  `date_mismatch` against «13.08 00:00 — 13.08 02:00». The rule is one sentence:
  **the window opens at the first `lo` of the shift and closes at the next `hi`
  at or after that opening** — so only an OVERNIGHT shift can push the opening a
  day on, and only for a window that opens before the shift does. Shift 1's day
  IS the calendar day and always answers 0, including for a window somebody
  wrote to cross midnight (whose closing side `overnight()` still moves, exactly
  as before). Strict mode MOVES the accepted day; **date-only mode only ever
  WIDENS** — the day comes off the screen there, a shift-2 screen most often
  shows the report day, and shifting it would newly reject the honest filings
  that mode exists to accept. **Consequence to know: shift-2 verdicts re-score.**
  Nothing is stored, so the boot `sync_date_flags` re-derives every affected row
  for free — a morning-hours window on a night task stops flagging correct
  photos, and those tasks get their weight back with no Gemini call. No
  corrected report is re-DMed, same as a window edit.
- **The date question has THREE modes, not two** (user, 2026-08-17) — two
  nullable booleans on the same global → supervisor → leader chain as the photo
  window, resolved by `leader_ai.resolve_date_check` + `resolve_time_check`
  (NULL = inherit, NULL everywhere = the strict answer, so nothing changes until
  an admin picks something). Read them as ONE rule, always via
  `date_rule_for` → `(window, checked, timed, plus)` — FOUR values since the
  `date_plus` tolerance landed (`resolve_date_plus`, the count of days AFTER the
  report's that a proof may be dated; 0 everywhere until a writer exists, and
  there is no admin control for it yet). **Unpack all four**: two call sites
  took three and every drain pass died on the first row with «too many values to
  unpack (expected 3)» — no verdict, no retry burned, just a strip reading «0 of
  375 checked · AI error». The four travel together through `date_flags`,
  `date_prose`, `sync_date_flags` and both verdict payloads, or the sentence on
  a card names a day the flag beside it did not judge:
  - `date_check T` + `time_check T` — **strict**: a SYSTEM clock (OS bar, phone
    status bar, camera stamp) must be readable and inside the window. **The
    entries carrying a DAY are the ones judged** (`leader_ai._dated`, read by
    both `clock_in_window` and `date_prose`): one photo commonly shows two
    clocks — the status bar, an hour that by construction never carries a date,
    beside the camera stamp that carries both — and failing the report on the
    undated one rejected proofs the stamp had already proven, while an image
    with NO clock stayed silent because the prompt tells the model to add no
    entry for it (user, 2026-08-25). Every dated entry must still be inside the
    window, and a report where NOTHING carries a day still fails, which is where
    the 2026-08-14 "an unprovable day is flagged" ruling actually applies.
  - `date_check T` + `time_check F` — **date only**: the DAY must be the
    report's day, the hour is never compared and the window is not a rule. Here
    and ONLY here the model may read a date printed INSIDE the app or document
    (a date filter, a dated register row) — `_prompt(screen_dates=True)`, which
    strict mode explicitly forbids — and it lists every date it sees, because
    `clock_in_window(times=False)` passes on ANY matching day: one screen
    legitimately shows several. **No visible date at all is NOT flagged**
    (`date_flags` drops `no_date` in this mode); a WRONG day still is. This mode
    exists because most proofs here are screenshots of THIS dashboard, whose day
    is on screen while no OS clock is — strict mode answered `no_date`, i.e.
    rejected, on honest filings, and exempting the day threw away the one fact
    the screen does prove.
  - `date_check F` — **not asked at all**.
  Some proofs are screens that carry no clock — an in-app checklist,
  a printed system report — and there the date question had only two outcomes,
  both wrong: reject every honest filing, or leave a flag nobody may act on.
  `date_flags(..., check=False)` returns **nothing**, and since it owns both
  `no_date` and `date_mismatch` (`_OWNED_FLAGS`) that empty answer is what
  CLEARS those flags off verdicts already written — via the same free
  `sync_date_flags` re-derive a window edit uses, so unticking a task drops its
  date deductions and ticking it back on restores them, with no Gemini call
  either way. The model still transcribes the clock (that is what makes the flip
  reversible), and it is still shown; only the judgement is withheld. **The
  window and this answer must travel TOGETHER** — `date_rule_for` per row,
  `resolve_window` + `resolve_date_check` for bulk readers — because a window
  displayed without it is a rule the reader cannot tell is enforced: with the
  check off the `expected` payload is null, the triage card's two date rows
  collapse into ONE neutral «not asked» row, the «Vazifalar» tab prints «sana
  tekshirilmaydi» instead of hours, and the bot stops printing the window on the
  photo prompt. **Date-only mode restates all four rather than blanking them**:
  `expected` carries the DAY (labelled «Kerakli sana», never «oyna»), the triage
  card keeps two rows with the second asking about the day, the tab prints «sana
  kerak, vaqt shart emas», and the bot asks for a visible date instead of hours
  (`photo_date_only`) — silence there would read as "nothing about when is
  asked", which is the third mode, not this one. Admin: ONE three-option
  `dateRuleField` in all three ltasks modals (the four combinations have only
  three meanings, so the fourth is never offerable) → `PUT
  /admin/leader-tasks/date-check` + `/time-check`, both tri-state and four-way
  addressed like `WindowIn`, written one AFTER the other (they materialise the
  same override row, and two parallel inserts race its unique key). Three traps:
  `resolve_date_check`/`resolve_time_check` cannot use `resolve_deadline`'s
  "first non-blank" test (the meaningful value is FALSE); `_leader_row_extras`
  must count BOTH or a cell write deletes a leader row whose only override was
  the exemption; and a task switched INTO date-only re-derives its old verdicts
  free but cannot gain a date nobody was asked to transcribe — those rows only
  lose flags, and «Qayta tekshirish» is what re-reads their photos. Scores
  correct themselves everywhere at once, but no corrected report is re-DMed —
  same as a window edit.
- **`auto_discover()` is the second door into discovery's territory**, and it is
  bounded so it cannot become the bulk auto-trigger the user banned three times:
  shift 1, from one fixed date, sheet layer only. It runs on the leaders-sheet
  **Refresh** and returns `ai_queued` so the press states what it produced.
  `discover()` — the walk of everything ever filed — is still reachable only
  from «Tekshirish», which counts first and asks.
- **The drain walks the automatic regime FIRST and in order**: oldest day →
  leader by leader → task 1..N. Not cosmetic: a day's report DM fires when its
  last task lands, so interleaving leaders would leave every day half-checked
  until the end of the batch.
- **Reports are DMed per finished leader-day** (`services/leader_reports.py`) to
  the unit's brigadir **and** the leader — the leader always, clean days
  included, because points now come off automatically and a deduction somebody
  discovers at the end of the month is how trust in the system dies. Both carry
  a `web_app` button onto `/leaders/report/<uid>`. A day the filing-window rule
  already voided is NOT reported: it scores 0 for a reason that outranks the
  photos, and a "verified 62%" would contradict the register.
- **`leader_day_reports` is the ledger**, keyed by `leader_ai.report_key()`.
  `score_sent` is what makes corrections possible: a later re-review, triage
  ruling or upheld dispute re-sends ONLY when the number actually moved
  (`resend_if_changed`). Completion is a trigger, not the only route —
  `sweep_unreported()` runs every drain and sends reports whose one attempt was
  swallowed (Ghost Mode, a Telegram outage, a restart).
- **The review FLOOR and `AUTO_FROM` are the same day (13 Aug 2026)** and
  should stay that way. The floor sat at 11 Aug, so the activity strip said
  review began on the 11th while every scoring surface said the 13th — two
  start dates for one feature, with nothing on screen saying they answer
  different questions. Moving it is the flag-guarded purge in
  `startup.purge_leader_ai_history`: **bumping the date needs a NEW flag key**,
  or the old "already ran" flag makes the new floor a no-op on every box that
  has booted once. It only ever RAISES the floor, never lowers it, and never
  overrules an admin who moved it from «Tarixni tozalash».
- **Auto-queued work announces itself as a RUN** — `auto_discover` is followed
  by `leader_ai.note_auto_run(...)`, exactly as the bot day-close path already
  did. Queueing invisibly is what made the progress strip unreadable: a
  hand-picked re-check sat at «150 / 150 · 100%» with nine hundred auto-queued
  rows behind it and nothing on screen connecting them. The record is the one
  thing every progress reader reads, so this buys the bar, the ETA, Stop and
  the detail view for free. It refuses to displace a LIVE run, so a re-check
  narrowed to one brigadir is never silently widened by someone's Refresh.
  **Two rules keep that refusal from hiding work.** (1) `/progress` re-derives a
  run's `total` as `done + left` on every poll (the recorded total is only a
  floor) and ships the growth as `grew` → the strip's «+N joined»; rows that
  enter a live run from ANY door (day-close, Refresh, Retry) grow its bar
  instead of parking it at «13 of 13 · 100%» beside «1,222 left». (2) The
  drain retires an UN-narrowed run itself (`_release_run`) in the pass that
  empties the queue — «finished» must not depend on a `/progress` poll that
  only happens while somebody has the page open, because an un-retired 13-row
  auto run stayed «live» and swallowed the next Refresh's 1,222 rows under a
  leader's name. Narrowed runs still release at the top of the next pass.
- **Boot resumes the queue** (`leader_ai.resume_after_boot`, called from
  `register_drain_job`, so both entrypoints get it). Every push to `main`
  deploys and restarts the unit, killing the running drain thread — and nothing
  at boot used to pick the rows back up, so the queue sat still until the
  20-minute timer. Deploy twice in an afternoon and the reviewer looks like it
  stops dead at arbitrary rows. It also clears a `running` heartbeat, which at
  boot is a lie by construction (the thread that wrote it died with the old
  process) and otherwise reads as a live-then-stalled drain forever.
- **A drain pass with work left CHAINS into the next one** after
  `DRAIN_CONTINUE_S` (5s), instead of waiting for the timer. The batch cap
  (`gemini_batch_size`, 40) is invisible to the operator, so pacing the queue by
  stalling 20 minutes between bites looked exactly like the drain giving up at a
  random row. `DRAIN_EVERY_MIN` stays 20 and is now only the FALLBACK for a
  queue nobody kicked — a 5s timer would fire a thread and take two locks around
  the clock to find an empty queue. Never chain on `quota` (a 429 hammered every
  five seconds turns a per-minute limit into a per-day one) or on `aborted`
  (retired model / revoked key — the next pass fails identically). The heartbeat
  stays `running` between chained passes, so the strip does not blink through
  `idle` mid-drain. **Consequence to know: a large queue now finishes far
  faster and reaches the daily Gemini cap sooner.**
- **The two RECURRING passes use a rolling window, not the fixed floor** —
  `auto_window_start()` (`AUTO_LOOKBACK_DAYS = 14`). `AUTO_FROM` never moves, so
  a pass bounded only by it re-reads every automatic day ever filed; both of
  these run on a timer or on a button pressed all day, and would get slower
  every day they worked correctly. Catching up on anything older is a
  deliberate errand — «Tekshirish» with scope «unchecked», over a stated count.
- **`/leaders/report/:uid` is the day report** (`pages/LeaderDayReport.jsx`) —
  **auth-only, row-scoped, not page-gated**, like `/cells/:id`: the brigadir
  being told their unit's score is often somebody nobody granted `/leaders` to,
  and a notification opening onto "no access" is worse than no notification.
  Tasks group by OUTCOME (failures first), never by task number; the score is
  never shown without its `submitted → verified` derivation; an unfinished check
  says so instead of looking final. Photos are 72px thumbnails into a lightbox
  **portaled to `document.body`** (`.page-enter`'s transform would otherwise
  contain a `position:fixed` overlay).
- **Objections are the way back, and they run the LATE-PROOF chain**
  (`leader_ai_disputes`, `services/leader_dispute.py` — see the section of its
  own below). Leader files → the unit's brigadir refuses it or uplifts it with
  their own mandatory case → an admin rules with both notes in front of them.
  `decide_supervisor` / `decide_admin` are THE decision cores and every door
  runs them: the report page, the «Norozliklar» queue, the brigadir's inline
  card in Telegram (`ad:` callbacks in `telegram_bot.py`) and the admin's
  (`approvals.py` kind `leader_dispute` / code `ld`). Approving writes
  `resolution="approved"` on the verdict — that is what restores the weight —
  and the corrected score re-DMs itself. Not grantable at either stage.
- **The «Norozliklar» tab is where all three read it** (`GET /leaders/disputes`
  → `components/leaders/Disputes.jsx`, beside «Kechikkan isbotlar» on
  `/leaders`, `?tab=disputes` deep-links). Until it existed the ruling was reachable from
  exactly two places — an inline Telegram card that scrolls out of the chat,
  and the day report of the ONE leader it belongs to — so an admin who missed
  the card had no list to work from and no way to find the report holding the
  objection. **The card carries the VERDICT, not just the objection**: flags,
  the model's prose and the window it measured against, all off the same
  `_as_verdict` / `_window` / `_date_check` / `_time_check` / `_date_plus`
  helpers the day report reads — a queue that re-derived the rule would show a
  window the leader was never judged by, and one that showed the reason alone
  would get rulings made on wording. It also carries EVERY note the chain has
  collected, in order; showing the first and the last hides the middle
  judgement, which is the one that decided whether an admin ever saw this.
  Photos deliberately stay one tap away on the report, where the whole day can
  be read. Names come from `_project` (the REGISTER's spelling), so the page
  scope bar reaches these rows exactly as it reaches the dashboard's; whatever
  the scope hides is counted in a `ScopeNotice` rather than dropped. Scoped
  like every read here — admin all, brigadir their own unit, LEADER their own
  filings.
- **The queue is SPLIT IN TWO by stage, and the tab badge counts the admin
  half** (the operator's call, 2026-09-02). `stageOf` — the same shape in
  `Disputes.jsx` and `LateProofs.jsx` — reads `status`, which is the stage AND
  the outcome in one column: «Adminlarda» is what waits on an admin ruling,
  «Brigadirlarda» what is still with the unit. It opens on «Adminlarda», the
  half the badge counts and the only stage where the weight comes back. An OPEN
  row belongs to whoever must rule on it next; a SETTLED one to whoever ENDED
  it, so a ruling — and, for an admin, its undo — stays where it was made and
  no decision drops off the page. Only a stage-1 refusal ends on the brigadirs'
  side: an approval, an admin's refusal and a cancelled ruling are all admin
  acts. The split is the FIRST cut, ahead of the «Barchasi / Sizning
  navbatingiz / Tarix» segment and the search, so every count under it
  describes the stage on screen. **The badge is computed on the CLIENT off the
  one payload the queue itself renders** (`status == "admin"`), so the strip and
  the sub-tab can never disagree — and it supersedes the server's per-viewer
  `todo` («whose turn is it», from `canAct`), which is still served and now read
  by nothing. Consequence to know: the badge answers «how much is with the
  admins» for EVERY viewer, so a brigadir does now carry a number only an admin
  can clear.
- **A settled ruling has an UNDO** (`POST /leaders/disputes/{id}/undo`, admin,
  the «Qarorni bekor qilish» button under the objection box on the report page).
  Deciding is one tap and an ADMIN's own filing IS the approval, so the wrong
  outcome is one mis-tap away, while `decide` refuses anything already settled.
  It reaches a brigadir's stage-1 refusal too: that is final for the brigadir,
  not for the platform, and an admin is who fixes an account of a shift being
  ended before it was read. The undo reverses the ruling's two writes: the
  verdict returns to `open` (in the automatic regime the flag costs its weight
  again) and the row becomes `cancelled` — never deleted, because a score that
  moved twice has to stay explainable, and because only a LIVE row blocks a
  re-filing. **The verdict and its row move TOGETHER**: a triage ruling that
  contradicts a settled objection retires it through the shared
  `supersede_dispute` — otherwise the card prints «objection upheld» over a task
  that just lost its weight again. The day re-scores via `resend_if_changed` and
  both people told about the ruling are told it was reversed
  (`leader_dispute_undone`).
- **`_auto_clause()` folds a NULL shift with `coalesce`, and that is
  load-bearing.** The drain splits its queue into the clause and its negation;
  under SQL three-valued logic a NULL-shift row dated after `AUTO_FROM`
  satisfies NEITHER (`NOT(TRUE AND NULL)` is NULL), so it would sit `pending`
  forever — no verdict, no error, no retry, invisible to both branches. Any
  future split on this predicate must keep the complement total.
- **Proof photos have TWO doors** (`photo_scope_ok` + `permissions.page_allowed`).
  `/api/leaders/photo` and `/api/leader-tasks/media/{id}` are page-gated for the
  register, but the day report is auth-only by design, so it passes its `uid`
  and the photo is authorised against that report's own row scope — plus a
  check that the report really contains it, or a readable report would become a
  fetcher for any photo on the platform. Page-gating them alone rendered the
  verdicts and 403'd every piece of evidence behind them.
- **A report that can never be sent is PARKED, not skipped**
  (`leader_reports._park`, `score_sent = PARKED`, `sends = 0`). A key leaves the
  sweep's candidate set only when a ledger row exists, so a
  filing-window-voided day — and those accumulate daily — would sit in it
  forever, sort ahead of newer keys and eat the whole per-pass budget until the
  safety net silently stopped working. A park is not a send: if the day is
  later opened, the next pass sends its FIRST report, not a correction.
- **`components/leaders/verifyState.js` is THE verification vocabulary** —
  states, colours, icons and precedence for the register chip, the page and the
  filter. Never improvise a second set of words for these five facts. Every
  state carries an icon as well as a colour. A day voided by the filing window
  shows only its void chip; no second red mark beside it.
- **`/leaders` «Vazifalar» tab (`components/leaders/TaskRequirements.jsx`) is
  where a leader READS the rules** — for every enabled task: name, proof type,
  the AI definition of done (`criteria`, shown as the task's description —
  the rule someone is judged by is a rule they get to read, so `criteria` and
  the example photos are no longer "never shown to the leader"), weight (+ share
  when the enabled sum ≠ 100), min photos, photo window, submission deadline and
  the example photos (72px → the shared `ui/Lightbox.jsx`). Fed by
  `GET /api/leader-tasks/requirements` (`services/leader_tasks.requirements_for`),
  resolved down the global → supervisor → leader chain and scoped like
  `/api/leaders` (a leader → own, a supervisor → own unit or one of its leaders,
  everyone else follows the page filters; global standard when nothing is
  picked). Examples stream from the page-gated `GET /api/leader-tasks/examples/{id}`
  (reference material, no row scope). Day-detail task rows carry an ⓘ that
  jumps to that task's card. The old ⓘ table built from the hard-coded
  `TASK_DETAILS` is gone — never resurrect a config view from the seed.
- **Because leaders READ the criteria, they are ordinary prose — and there is a
  bulk editor for that.** «Matnlarni tuzatish» on the ltasks matrix header
  (`pages/admin/CriteriaTextsModal.jsx` + `utils/textCase.js`) lists every
  definition-of-done actually STORED — the global level plus each supervisor /
  leader override, because an override left in capitals is invisible from the
  matrix and fixing only the global texts leaves those units shouting. One
  press rewrites SHOUTED text to sentence case: letter CASE only, never a word
  or its order, a word already carrying a lowercase letter is untouched, and a
  known acronym keeps its capitals («SAPDAN» → «SAPdan», while «IDORA» is left
  an ordinary word — a prefix test alone wrecks every word starting ID/IT/AI).
  It only DRAFTS; nothing is written until Save, and the writes then go through
  the ordinary criteria endpoint ONE AT A TIME, the same rule (and the same
  unique key) as the three ltasks modals.
- **A window OUTSIDE its shift's hours is refused on write** (the operator's
  ruling, 2026-08-27). `leader_ai.window_fits_shift` is the rule and
  `leader_tasks.window_shift_problems` applies it at the endpoint, so a fan-out
  is refused WHOLE rather than half-written. The frame is
  `leader_ai.window_span` — MINUTES FROM THE SHIFT'S OWN OPENING, seated by
  `window_offset` — because raw clocks cannot answer the question: on a night
  shift «08:00» is 15 hours in while «18:00» is one hour in, and the smaller
  number is the later moment. A window ending exactly ON the shift's close fits.
  This is the source of the 26 Aug night and the reason it is a hard 400: the
  windows were simply set wrong («08:00 — 10:00», an ordinary shift-1 morning,
  inherited by a unit working 17:00 → 09:00), and the platform stored the
  impossible hours and then recorded the leaders as having failed them.
  **Consequence to know: the GLOBAL level is judged against every shift that has
  an active unit**, so with both shifts running a global window is limited to
  their overlap (17:00–20:00) and everything else must be set on a brigadir's or
  a leader's cell. That is the honest shape — a window is a property of a shift,
  and the global level is exactly the door the incident came through.
  `backend/report_bad_windows.py` is the read-only audit of what is already
  stored, across all three levels.
- **The per-task submission `deadline` ("HH:MM", same three tables + admin matrix
  field beside the window, `PUT /admin/leader-tasks/deadline`) is INFORMATIONAL
  (user, 2026-08-15)** — a bot entry is still judged by nothing but the day's
  filing window. Blank at every level ⇒ the tab prints the day's filing deadline
  marked «kun bo'yicha», never nothing. Practical for shift 1 only for now (a
  global value serves both shifts, like the window). Enforcing it (deduct or
  flag) is a separate decision — ask before touching scoring.

Related memory: `leader-ai-proof-review`, `leader-task-photo-window`,
`leaders-shift1-submission-window`, `leader-task-requirements-tab`.

## In-app camera proofs (`proof_kind`, `/proof/camera`)

Leaders were editing the timestamp a third-party camera app wrote onto their
proof photos, so from **2026-08-19** a checklist task can declare that its proof
is **TAKEN IN THE APP** instead of uploaded. The clock on such a photo is the
SERVER's; the phone never authors it.

- **The ltasks modals write ONE row, so they write it ONE AT A TIME.** criteria,
  window, deadline, the date rule and the proof kind all materialise the same
  `leader_task_settings` / `leader_task_leader_settings` row, and a brigadir or
  leader who has never been edited has none — fired together, two of them INSERT
  it concurrently and one dies on the unique key while the modal reports
  success. That is how the camera pilot's first unit saved and came back
  screenshot (2026-08-19). `saveCell`, `saveLeaderCell` and `saveCol` are all
  awaited chains now, and `leader_tasks._sup_row` is the materialiser that
  re-reads the winner's row on an `IntegrityError` instead of failing — because
  the endpoints are reachable without the UI. Never add a sixth writer to these
  modals as a parallel `mutate()`.
- **Enrolment must NAME a unit.** While `leader_tasks.CAMERA_IS_PILOT` stands,
  the GLOBAL level of the chain may only hold `screenshot` — camera is set on a
  supervisor's cell (whole unit), a leader's cell (that leader), or the task's
  column modal **while the matrix is filtered**, where it writes exactly the
  rows on screen. Unfiltered, that modal writes the global level, so the control
  is not offered there and a sentence says to pick a brigadir in the filter
  instead — the fast path for enrolling one unit's several camera tasks without
  opening a modal per cell. This is not
  cosmetic: the pilot's setting WAS written globally on 2026-08-19 and every
  leader on the platform inherited it, five tasks each, mid-shift
  (`startup.reset_leader_camera_pilot` is the one-shot that took it back to
  zero — configuration only; photos, stamps and verdicts were untouched).
  Enforced in `set_proof_kind` and again in the endpoint, because the endpoint
  is reachable without the UI. Flip the constant on the day camera becomes the
  platform default.
- **`proof_kind` is the switch** — `screenshot` (send images to the bot chat,
  what every task did before and still does by default) or `camera`. Same
  global → supervisor → leader chain as `min_media`
  (`leader_tasks.resolve_proof_kind`, `set_proof_kind`, `PUT
  /admin/leader-tasks/proof-kind`, the two-way pick in all three ltasks modals
  plus a 📷 mark on the matrix cell). `screenshot` is the chain's floor, so a box
  that never ran the migration behaves exactly as before. **Applies at once and
  never stages**: it is the one field that changes what the leader is asked to
  DO, and a staged version would offer an upload for a task whose proofs are
  collected in the app for a whole shift — so an admin switching a unit does it
  when that unit's next shift is about to start, not mid-day. NOTHING names a
  pilot unit in code: whichever supervisor is enrolled is the pilot, and a
  filtered column save touching more than one row asks first, naming the count.
- **A camera task has NO upload path, and that is the feature.** The bot answers
  «Ha» with a `web_app` button (`_lt_open_camera`), refuses every file sent to
  the chat while that task is open (`_lt_camera_no_upload`), and its menu row
  reads `📷` / `📷 k/N` / `✅`. Accepting a file "just this once" puts the
  timestamp back in the leader's hands.
- **The clock**: `/api/leader-proof/session` hands the page the server time once;
  the page advances it with `performance.now()` (monotonic — a phone clock edit
  moves nothing) and re-anchors every 5 min. The claimed instant is clamped
  server-side to "not in the future" and "not before this checklist day began".
  What the DEVICE thought the time was is stored as `skew_s` and judged by
  nothing.
- **The stamp is drawn on the server** (`services/leader_proof.burn`, Pillow,
  the `downtime_card` font resolver): `Safia · DD.MM.YYYY  HH:MM:SS` Tashkent,
  bottom-left, TWO layers — a heavy outline plus a fill picked from the
  brightness underneath — so it is legible on any background **without a plate
  behind it** (the operator's call, 2026-08-19: the mark states the time, it
  does not black out the corner of the evidence). Its size comes from the
  image's **SHORT edge** (`_fit_font`) and is then measured and shrunk until the
  text provably fits the width: sizing off the height put a ~950 px mark on a
  900 px-wide portrait photo — the shape every phone produces — and the seconds
  ran off the right edge of every proof. `STAMP_H`/`STAMP_PAD` in
  `ProofCamera.jsx` are the same two numbers and must stay the same two
  numbers. **No font ⇒ `stamp_unavailable` ⇒ nothing is stored**: an unstamped
  camera photo is indistinguishable from the shots this feature replaces.
- **`leader_task_photos` is the roll** — per (day, task, slot), written the
  moment a shot lands, so a leader who shot two of three and closed Telegram
  comes back to two. At `min_media` the task IS done: `sync_entry` writes the
  LeaderTaskEntry **in place** (the id is stable — `LeaderAiReview.ref` is built
  from it) and rebuilds `leader_task_media` in slot order, which is what keeps
  the dashboard rows, media proxy, AI reviewer and day report working with no
  knowledge of this table. There is no Save button and none is wanted.
- **Required slots are RETAKEN, never deleted**; extras go up to `min + 3`,
  hard cap 6, and only they are deletable. Answering «Yo'q» or resetting a task
  retires its roll (`clear_roll`) so the menu can never show progress on a task
  recorded as failed.
- **The camera prompt carries «Qayta topshirish» (user, 2026-08-19)** — the ONE
  way to empty a camera task, and it supersedes the earlier rule that camera
  tasks never offer a reset. The app edits a roll shot by shot (retake a
  required slot, drop an extra) but cannot empty one, so a leader who shot the
  wrong thing for an already-done task had no route back except an admin. It
  shows only when there IS something to delete (a shot on the roll or an answer
  recorded), confirms first (`lt:crst` → `lt:crok`, the confirm text says the
  photos go), and lands back ON the emptied camera rather than the menu, since
  the reason to reset is to shoot again. `_lt_reset_task` is THE reset core,
  shared with the upload flow's «Qayta topshirish» so «empty» means one thing —
  and it drops the roll whether or not an entry exists, because a half-shot
  camera task holds shots and no entry and that is precisely the state a leader
  resets from. Channel copies stay: the archive is the audit trail.
- **Offline shooting is allowed** (`utils/proofQueue.js`, IndexedDB, flushed
  oldest-first on `online` and on open). Queued shots hold their slot in the
  roll, the task stays incomplete until the server has them, and Telegram's
  closing confirmation is armed while any are pending. A gap beyond
  `DEFERRED_AFTER_S` marks the row `deferred` — shown, never treated as a fault.
- **One shot has ONE id, and the upload is idempotent** (`client_key`). A
  connection that dies between the bytes landing here and the answer reaching
  the phone is indistinguishable from one that never carried them, so the page
  re-sends either way — and with no id the second POST was an ordinary new
  photo: same picture, same burnt second, next free slot, the roll holding one
  shot twice (reported from the pilot, 2026-08-19). The key is minted WITH the
  picture (`proofQueue.newKey`), kept beside the blob in IndexedDB and sent on
  every attempt; `save_photo` looks it up FIRST and answers a replay with the
  row it already wrote — before burning or relaying, so a replay costs no
  second channel post either. `uq_ltask_photo_client_key` (leader_id,
  client_key) is the backstop for two attempts racing, and `flush` is
  single-flight for the same reason. A NULL key behaves exactly as before, so
  nothing that predates this moves; a key whose row was since deleted (a
  retake, `clear_roll`) is a miss and writes a new row, which is the honest
  floor. While anything is queued the page retries on a 20 s timer as well —
  `online` never fires for a drop that lasted one second, and the shot would
  otherwise sit in the queue until somebody reopened the page.
- **Outside the photo window a shot is ACCEPTED and marked `late`** (user's
  ruling): the page warns before the shutter, and the deduction comes from the
  ordinary date machinery, not a new one.
- **The AI judges CONTENT only.** `review_one` substitutes server-recorded
  clocks for the transcribed ones (`_camera_clocks` → `leader_proof.server_clocks`,
  same shape, same field), so `date_flags`, `sync_date_flags`, the triage card
  and the day report all read a camera proof through code they already have — an
  out-of-window capture becomes `date_mismatch` deterministically, and an admin
  widening a window still re-derives every affected verdict for free.
- **The page** is `pages/ProofCamera.jsx` at `/proof/camera?leader=&task=` —
  auth-only and NOT page-gated (like `/leaders/report/:uid`: the leader filing
  the proof holds no `/leaders` grant), outside `Layout`, dark chrome. Three
  states, one primary action each: viewfinder → shutter, review → Saqlash, full
  roll → Tayyor. Rear main lens by default (see the 0.5x bullet below), free
  flip, live stamp preview positioned exactly where the burnt one lands. `?leader=` is typeable, so the backend checks it against the leader
  profiles the calling account actually holds.
  **Two rules the layout is built on, both bought the hard way.** (1) The
  picture box is measured in PIXELS from the frame area and built to the
  stream's own aspect (`fitBox`), so the viewfinder is the whole frame and never
  a crop of it — it used to be a full-bleed element sized in percentages inside
  an auto grid row, the percentage collapsed to the video's intrinsic height,
  and the leader composed inside a vertical SLICE of the file with the stamp
  pushed below the clip, invisible. Letterboxing beside a tall frame is the
  correct outcome; cropping the file to fill the screen is not (the operator's
  call). (2) The `<video>` stays MOUNTED in every state, hidden rather than
  removed, and a ref callback (`setVideoEl`) hands the stream to whatever node
  exists — unmounting it for the review shot left React building a fresh element
  with no camera attached, so every shot after the first was aimed at a black
  rectangle. `ensureCamera` re-binds on mode change, on `visibilitychange` and
  on a track's `ended`; `startingRef` keeps two `getUserMedia` calls from
  leaking a stream nothing can stop.
- **`permissions-policy` now says `camera=(self)`** (`main.py`). It was
  `camera=()`, which denies `getUserMedia` outright — no prompt, no actionable
  error. Microphone and geolocation stay fully denied, and `self` keeps every
  embedder out.
- **The «Allow camera?» sheet cannot be made permanent, so it is COUNTED.** The
  grant belongs to Telegram's WebView, not to the page: there is no web API and
  no Mini App API that says "always allow", and each `web_app` button opens a
  fresh WebView, so a leader is asked once per task by construction. What the
  page owns is how many sheets ONE open costs — and the original probe-then-
  correct pass cost two, because every `getUserMedia` call raises its own.
  `startCamera` now opens the REMEMBERED lens (`proof.camera.lens2.<facing>`)
  in a single call, having first checked that id against `enumerateDevices` (which
  never prompts): an id the phone no longer has would prompt AND fail, i.e. two
  sheets to land where the plain path begins. A `NotAllowedError` re-throws
  instead of falling through — a refusal is the leader's answer, and re-asking
  with different constraints is a second sheet for the same «no». **Never split
  the open back into probe-then-correct**, and never add a third call.
- **A BLACK viewfinder must always say which black it is** (leaders' report,
  2026-08-29). Three different states painted the same rectangle — still
  opening, opened but sending no frames, and a working camera pointed at
  something dark — and none of them said anything, so the whole class reached
  the operator as «the camera isn't working». Three rules now hold, and each
  closes a path that had NO way out:
  - **The one-at-a-time guard is releasable.** `getUserMedia` inside Telegram's
    WebView can simply never settle (the leader backgrounds the app while the
    «Allow camera?» sheet is up), and `startingRef` was then stuck true for the
    life of the page: the mount, `visibilitychange`, the track's `ended` and the
    Retry button all returned at it. An attempt now carries `OPEN_TIMEOUT_MS`
    and an `attemptRef` token — the deadline frees the guard, and a superseded
    attempt stops its own stream instead of attaching it or reopening a newer
    one's guard. The mount effect's cleanup retires the in-flight attempt too,
    which is also what makes a flip pressed mid-open work.
  - **Frames are the test, not `readyState`.** A track sits at `live`, unpaused
    and attached, while the WebView delivers nothing — what Android leaves
    behind after another app takes the camera. `ensureCamera` measures
    `videoWidth` + `currentTime` against `FRAME_STALL_MS`: ONE silent re-open,
    then `camErr = "stalled"` with the button. Never restart forever behind a
    black screen.
  - **Events are not enough** — a track can end with no event at all — so the
    viewfinder is also looked at on a `CAM_WATCH_MS` heartbeat while it is on
    screen. And the shutter is DISABLED until a frame has arrived: `capture`
    returns silently without `videoWidth`, so an armed-looking button that did
    nothing was the last thing the leader was left with.
- **The main lens is chosen TWICE, because 0.5x arrives two different ways**
  (user, 2026-08-20 — a pilot phone opened on the ultra-wide). A phone that
  exposes each rear sensor as its own DEVICE is answered by label: `lensScore`
  ranks the candidates (iOS «Back Camera» / Android «camera2 0» win; a fused
  «Dual/Triple» device is second choice, because which member it opens on is
  the phone's decision; ultra/tele/macro/depth lose outright) and the BEST one
  is opened, never the first that matched something — «facing back» describes
  the ultra-wide exactly as well as it describes the main sensor. A phone whose
  rear camera is ONE fused device cannot be answered that way at all: the
  device the labels picked really is the main camera, it is simply pointed at
  its widest member. `useMainLens` therefore pulls the OPENED track to
  `zoom: 1` whenever its capabilities report a range starting below 1 — an
  `applyConstraints` on a stream already held, so no second `getUserMedia` and
  no extra sheet, and it carries `VIDEO_SIZE` with it because
  `applyConstraints` REPLACES the set the track was opened with. The range is
  also the guard: zoom counted in percent (min 100) or a phone with no
  ultra-wide (min 1) never enters the branch, and an iPhone reports no zoom at
  all. Two more rules bought the same day: **blank labels answer NOTHING** —
  some WebViews never fill them in even after the grant, and choosing by
  POSITION there is how a phone gets pinned to its 0.5x lens, or its front one,
  for good — and `LENS_KEY` is VERSIONED (`proof.camera.lens2`), because a lens
  already remembered under an older rule is unreachable any other way. Bump the
  key whenever the rule changes its mind.
- **The `/leaders` bot-day merge gained ONE bounded exception** — `leader_bot.merges()`
  is now THE rule and both readers (the register, the photo proxy) call it.
  Shift 2 merges as it always did; a shift-1 unit merges only when it is
  ENROLLED in camera capture (`camera_units()` — any task on camera at any level
  of its chain) **and** the day is `MERGE_FROM` (2026-08-19) or later. Camera
  proofs are collected in the bot by construction, so without this the platform
  would demand a proof in a mode it chose and then display it nowhere; with the
  two bounds, a shift-1 unit that never touches the camera reads exactly as
  before, and enrolling one later cannot resurrect bot days it closed months
  ago. Widening this to "every bot day" was tried first and reverted: it
  silently rewrote the register for units that had nothing to do with the pilot.
- **A unit may REHEARSE before its bot filings count** —
  `LeaderUnitSetting.bot_from`, the day the bot layer takes over for that unit,
  set in «Brigada sozlamalari» beside `per_task_close` (ONE endpoint, `PUT
  /admin/leader-tasks/unit`, because they are ONE row and two parallel writes
  race its key — the same trap the five ltasks task fields fell into). A unit is
  enrolled in camera capture on the day somebody has time to teach it, and the
  leaders spend that day learning where the buttons are; without a floor that
  fumbling IS the record. Before it the register, the score and the day report
  all keep reading the Google-Form row, and `leader_reports` PARKS the bot day's
  report so no score DM contradicts the register. `merges()` clamps the floor
  against `MERGE_FROM` (it can only ever move a day LATER, never resurrect one),
  and `training()` is deliberately NOT `not merges(...)`: every shift-1 unit
  outside the pilot fails the merge too and has always been reported, so
  "rehearsal" means only a day an admin explicitly declared practice. Refused
  for shift 2 — it files ONLY in the bot, so there is no fill-out row underneath
  to fall back to. **Nothing from a rehearsal day reaches Gemini** (user,
  2026-08-20): all three queue doors — `discover`, `queue_report`, `queue_task`
  — refuse it, `undiscovered()` excludes it so «N tekshirilmagan» does not
  promise rows the button never takes, and saving a window calls
  `leader_ai.drop_rehearsal_pending`, which deletes what was queued in the hours
  before the admin declared it (never-judged rows only — `reviewed_at IS NULL
  AND resolution IS NULL`, the paused-shift purge's rule; `discover()` re-finds
  every ref if the window is cleared). The one door left open is `force=True`,
  the admin's per-task «check now» — same carve-out as the shift pause.
  **Enrolment does not open the window — somebody must set it**, and on the
  pilot's first unit nobody did: camera went on, `merges()` counted the unit's
  bot days from `MERGE_FROM`, and 20 Aug read the practice run (a leader at
  10%) instead of the Google-Form row the unit filed properly.
  `startup.set_camera_pilot_bot_from` (flag
  `leader_camera_bot_from_2026_08_21_v1`) is the one-shot that set the floor to
  **2026-08-21** — bounded to camera-enrolled non-shift-2 units that actually
  hold closed bot days inside the exposed window, never lowering a floor, and
  aborting outright if camera is set globally. It writes config only: the bot
  days keep their photos, entries and verdicts and reappear the moment an admin
  moves the window. Moving the date needs a NEW flag key, same rule as the
  review floor. **A day already reported keeps its DM** — a score that went out
  before the floor moved cannot be recalled, and `build_report_row` still
  renders a rehearsal day's bot report for anyone holding that link.

Related memory: `leader-camera-proof-pilot`.

## ONE checklist per CELL (`cell_from`)

From **2026-09-02** (the operator's directive) a supervisor unit can be switched
so its leaders stop filing ONE checklist a day and file a **complete separate
checklist for each cell they own** — its own day row, its own score, its own
report page and its own DM. **Nobody is switched by default**: units are
enrolled by hand, one, several or all at once, on the ltasks admin destination.

- **`services/leader_cells.py` is THE definition** — `unit_floor`, `floors`,
  `per_cell`, `is_per_cell`, `filing_cells`, `cell_ids`, `expected_days`,
  `self_check`. The bot menu, the register, the admin panel and the boot check
  all ask it; three spellings would give one leader three different checklists.
  `expected_days` is the one every caller should reach for: `[None]` = the
  single cell-less day the platform always had, `[ids…]` = one checklist per
  cell, `[]` = a switched leader with no cell, who files NOTHING.
- **The switch is a DATE, never a boolean** — `LeaderUnitSetting.cell_from`,
  beside `per_task_close` and `bot_from` and written by the SAME single writer
  (`set_unit_settings`; two parallel writes race that row's key — the trap the
  five ltasks fields fell into on 2026-08-19). Days before the floor are read
  exactly as they were filed, so **old results never change** — enforced by a
  comparison every reader makes, not by a migration that leaves history alone.
  **Clearing the floor is the rollback**: new days are cell-less again from the
  next effective date and the per-cell days already filed stay readable and
  scored, with no migration either way.
- **The floor is compared against the SHIFT's effective date**, never the
  calendar day. Shift 2's night belongs to the date its 17:00 boundary opened,
  so a floor of "today" set at 15:00 makes tonight the first per-cell night.
  Comparing against `date.today()` starts a night shift a day late — the class
  of bug that closed shift-2 tasks before their windows opened.
- **`uq_ltask_day` is an EXPRESSION index and that is load-bearing**:
  `(leader_id, date, COALESCE(cell_id, 0))`. Postgres treats NULLs as DISTINCT
  inside a unique key, so a plain three-column constraint would accept two
  cell-less days for one leader and hand the bot an arbitrary one — the very
  breakage the original constraint prevented, reintroduced by widening it
  naively. `COALESCE` folds every pre-switch row onto one value, so the
  guarantee for a cell-less day is byte-for-byte the old one and **no data
  migration is needed**. Same shape for `uq_leader_day_exclusion`. Every
  `cell_id` lookup must use `IS NULL`, never `== None`.
- **Which cells: plain OWNERSHIP** (`cells.leader_id`), automatically — assign
  one on `/cells` and the checklist follows. `in_load` is deliberately NOT
  consulted: it answers whether a cell counts toward the загрузка, a different
  question about a different register, and it is unticked on all 108 cells.
- **A leader with no cell files NOTHING** on a switched unit and the bot says
  so («Sizga yacheyka biriktirilmagan»), rather than showing an empty menu.
  Enrolment is REFUSED for a unit whose leaders own no cells at all, naming the
  count, because that would switch a unit into silence.
- **The bot threads the cell inside the `pid` SEGMENT** — `_lt_ref` / `_lt_who`,
  `"192"` or `"192c108"`. There are forty `lt:` emitters and ONE parser, so no
  callback grows a field and no handler's `parts[…]` indexing moves; the longest
  shape is 21 bytes against Telegram's 64. `/tasks` → profile pick → **cell
  pick** → that cell's task menu, and «Orqaga» returns to the cell picker. A
  button minted before the switch carries no cell, so `_lt_menu` sends it back
  to the picker rather than opening — and on the first answer creating — a
  cell-less day nothing belongs to. `LeaderTaskCapture.cell_id` carries it
  through the photo/reason handlers, which run off the capture row, not a
  button.
- **Everything downstream came along for free**, because every key there is a
  ROW id: `bot_ref` (`bot:{entry_id}`), `report_key` / `day_uid`
  (`bot:{day_id}` / `bot-{day_id}`), disputes on `ref`, late proofs and camera
  rolls on `(day_id, task_id)`. The AI pipeline, the day report and its DM
  ledger, the objection chain, late proofs and `compute_completion` are all
  untouched. **The frontend scoring core is untouched too** — `slotsBy` already
  averages several rows onto one day (built for the sheet layer's double
  filings), so a leader's day is the MEAN of their cells and `winDays` counts
  days, not rows. **Never "make the scoring cell-aware": it already is.**
- **One DM per cell** (the operator's call), the sender unchanged; the cell code
  is appended to the `date` param so the four templates carry it untranslated.
- **The register grows ONE column** — «Yacheyka», `CellLink` on the verifix
  CODE, rendered only when a row on screen has one. No cell ranking (the
  operator's call). `/leaders/report/:uid` prints the code as a chip.
- **Exclusions are per cell-day, and `cell_id IS NULL` means the whole
  leader-day** — that is both every exclusion recorded before this existed AND
  the «all this leader's cells» shortcut, stored as one row rather than N.
  `leader_exclusions.for_row` honours both, narrower first. `profile_days` (the
  AI queue doors, the report park) deliberately reads WHOLE-day rows only: a
  per-cell exclusion silences one checklist, not the day.
- **The boot self-check names the consequences** (`leader_cells.self_check`,
  printed with the deploy output): every switched leader with no cell, every
  cell with no leader, the checklist volume each unit now produces, and any
  per-cell day whose unit is no longer switched. This repo has no test suite and
  a push to `main` is a deploy.
- Admin: the «Brigada sozlamalari» modal on the ltasks matrix (a blue `Grid3x3`
  chip marks a switched unit) → `PUT /admin/leader-tasks/cell-from`, which takes
  a **LIST** so one toggle and a bulk press are one call and one transaction.
- Deliberately NOT changed: the Google Form (history only — every unit files in
  the bot), `merges()`, `LeaderDaySource`, `LeaderLateRequest`, cutoffs, and the
  per-task closing sweeps, which are all per-DAY and needed nothing.

Related memory: `per-cell-checklist-decisions`. Full plan and the rejected
shapes: `docs/plan-per-cell-checklist.md`.

## Per-task submission (`per_task_close`)

From **2026-08-19** a supervisor's unit can be switched from closing a DAY to
closing each TASK. Set per SUPERVISOR — `LeaderUnitSetting.per_task_close`,
`PUT /admin/leader-tasks/per-task`, the «Brigada sozlamalari» modal opened by
tapping the brigadir's NAME in the ltasks matrix (a `1×1` chip marks an enrolled
unit). Absent row = off, so nothing moves until an admin switches it.

- **Deliberately NOT on the global → supervisor → leader task chain.** It is not
  a property of a task, and a chain has a level that means "everybody" — which
  is exactly how the camera setting reached every leader on the platform twice
  on its first day.
- **Filling a task and SUBMITTING it are two different acts.** Proofs, answers
  and retakes save as they always did; «Vazifani yopish» is what locks the task
  and hands it to the AI. The button is only offered once the task is complete
  (Ha + all required photos, or Yo'q + reason) — Telegram has no disabled
  button, so an unusable one is a button that silently does nothing.
- **Closing is FINAL for the LEADER.** Nothing they press and no config change
  reopens a closed task; switching the unit back to day mode does not either.
  `leader_close.locked(entry, day)` is THE predicate and every writer consults
  it (the bot's entry writer, the shared reset core, both camera writes). It
  reads BOTH locks always, so outside this mode it answers exactly what it
  always answered: an entry is frozen once its DAY is closed.
- **An ADMIN has the one way back** (from 2026-08-26): «🔓 Qayta ochish» and
  «🗑 Tozalash» on the locked-task screen in the bot, and on a CLOSED day the
  menu rows stay tappable for admins so a locked task is still reachable — on a
  per-task unit the day is closed precisely BECAUSE its tasks are. Without it a
  task submitted by accident, or shot against the wrong standard, was frozen
  for good with no route out but editing the database, and this platform has no
  shell. **`leader_close.reopen_task` is THE definition** and it is admin-only,
  checked in the handler and not merely by hiding the buttons.
  - It lifts **both** of `locked()`'s locks — the entry's `closed_at` and the
    DAY's, which `maybe_close_day` wrote when this task closed. Lifting one
    hands back a lock the leader cannot see and nothing else can reach.
  - **The verdict goes with it.** `queue_task` dedupes on `bot:<entry_id>`, so
    a review row left behind lets the re-close pass silently and the OLD
    verdict judge NEW photos. Deleted, never re-queued (a `pending` row is
    drained within minutes, before anything has been redone); the next close
    re-creates it from the ref. Live objections to it are cancelled with it
    (`_retire_disputes` — deliberately not `supersede_dispute`, which answers
    "a later ruling contradicted this" and so only touches settled rows).
  - **The report is not recalled** — a DM cannot be. The re-close re-scores the
    day and `resend_if_changed` sends the correction, the same path a re-review
    or an upheld dispute takes.
  - **The grace lives on the DAY** (`LeaderTaskDay.reopened`, a task-id list,
    read through `leader_close.reopened_tasks`), NOT on the entry: «Tozalash»
    deletes the entry, and without a grace that outlives it `autoclose_due`
    re-closes the emptied task as "not done" on the deadline that already
    fired, within five minutes, in front of the operator.
  - **NO sweep re-closes a reopened task, and `_awaiting_reopen` is the ONE
    predicate both consult** (fixed 2026-08-27). The grace used to fall back on
    the DAY's filing deadline (`{}` down `closing_time`'s chain), which is in
    the PAST for every reopen that matters — a shift-2 day is only locked once
    09:00 has gone by — so `autoclose_due` re-closed the task on an hour already
    spent, and `close_expired_days`, which never read `reopened` at all,
    re-stamped the day around it. Two doors, five minutes, no message: the
    reopen was inert on shift 2 from the day it shipped. A reopen is a PERSON
    deciding a task must be redone, so a person closes it — the leader
    re-submits, or an admin closes or empties it again. The day stays open until
    then and shows on «Tozalash» → «Yakunlanmagan», which exists to expose
    exactly that; a stale id in `reopened` can never strand it, because
    `_awaiting_reopen` only holds while the task is genuinely unfinished and
    `maybe_close_day` closes the day the moment the last one is in.
  - «Tozalash» is reopen PLUS the ordinary `_lt_reset_task`, so «empty» goes on
    meaning exactly one thing. Both actions confirm first and are recorded
    (`checklist.task_reopened` / `checklist.task_reset`, actor + what was
    lifted).
- **One task, one review.** `leader_ai.queue_task` is the per-task door beside
  `queue_report`, under the same rules (review floor, shift pause, "no photos ⇒
  not reviewable") — a unit judged by two definitions of a submission would be
  judged by neither. The lock is committed BEFORE the queue write: a queue
  failure must never leave a task the leader was told they submitted editable.
- **The day closes itself** when the last enabled task is closed
  (`maybe_close_day`), stamping `completion` exactly as the button did. That is
  what keeps the register, the score, the day report and disputes working with
  no knowledge of this module. The report DM (leader + brigadir) fires then.
- **A task closes itself when its own time runs out, and `leader_close.closing_time`
  is THE definition of when that is** — one function, because three surfaces
  read it and three spellings would tell one leader three different hours: the
  sweep that closes the task, the bot's `pt_auto` line on the draft view, and
  the «Vazifalar» card (`closes_at`, served only for per-task units). The chain,
  narrowest first: the per-task `deadline` where an admin set one → **the END of
  the task's own submission range (`window`)**, which is what a task normally
  carries (the user's ruling, 2026-08-21: a range is given to every task, so the
  task closes when its range runs out instead of surviving until midnight) → the DAY's filing deadline (`deadline_hhmm`) for a task with neither, so
  nothing is ever endless.
  - **`date_check` / `time_check` do NOT gate this.** They answer whether the
    clock transcribed off the PROOF is judged; this answers how long the task
    accepts work. Gating on them would have made the feature silently do nothing
    for exactly the units most likely to want it — the camera pilot, whose
    proofs are dashboard screens in date-only mode. The fairness is bought by
    SAYING the hour on both surfaces the leader reads, not by withholding it.
  - **A task that has not STARTED is never force-closed** (`not_started` /
    `starts_at`, 2026-08-27). The operator's own reading of the 26 Aug night,
    and the one that explains its shape: what was closed at the beginning of
    that shift was precisely the tasks **whose start time had not come yet**.
    The leader then worked through what was left by hand, and when the last of
    those landed `maybe_close_day` counted 13 of 13 closed and ended the day at
    22:36 — mid-shift, hours before its 09:00 deadline — sending the whole night
    to the AI. So the early day-close was never a separate bug: a partial
    mis-close converts itself into a full one, because a force-closed task
    counts toward «all tasks closed» exactly like a filed one.
    The anchor fix stops a window being seated on the wrong DAY; this stops the
    whole class, **including a window that cannot open inside its shift at all**
    — 705 shapes on shift 2, every window opening between 09:30 and 16:30, where
    the day's own filing deadline lands before the window's opening. Such a task
    is left OPEN rather than recorded not-done, so it never ends the day out
    from under a leader who is still working. What SCORE an unstartable task
    should carry is a separate question and deliberately unanswered here.
  - **The day's filing deadline is a CEILING on every task, not just the
    fallback** (`closing_time`, 2026-08-27). `close_expired_days` ends the whole
    checklist on that hour knowing nothing about per-task clocks, so a task
    whose own clock lands after it can never reach that clock — yet the platform
    printed it on both surfaces the leader reads and then locked the task on the
    earlier hour, recording it not-done. A shift-2 task carrying the 26 Aug
    incident's own «08:00 — 10:00» window said 10:00 and was closed at 09:05:
    one hour instead of fifteen, the same defect. The clamp compares
    `_shift_pos` tuples, never clock strings — a shift-2 evening close at
    «23:00» is EARLIER than the day's «09:00», which lands the next morning —
    and it changes only what is PROMISED: over all 4,608 configs the instant a
    task actually stops accepting work is unmoved, while 2,871 promised hours
    became the true one. Because `autoclose_due` runs before the day sweep in
    `_sweep`, a short camera roll now reaches the AI through `force_answer`
    instead of being recorded not-done by the day close.
  - **The rules assert themselves at boot** — `leader_close.self_check()` walks
    every clock a config can carry on both shifts and returns every violation of
    four invariants: no shift-2 close before the shift opens, no close after the
    day's own filing deadline, the hour PRINTED is the hour that fires, and an
    unclamped range closes exactly where `leader_ai.date_window` does. Wired
    into both entrypoints via `startup.report_leader_deadline_rules`, which
    prints with the deploy output AND DMs the support chat / every admin,
    because this repo has no test suite, a push to `main` is a deploy, and this
    platform has no shell — a log nobody can open is not a warning. Twice a task
    has been closed at an hour nobody intended and the only signal either time
    was a leader losing points.
  - **Which DAY the closing hour falls on is `leader_ai.window_offset`, the
    same one anchor the REVIEWER uses** (`leader_close.due_at`). A task's hours
    are written in shift hours, so «08:00 — 10:00» on a night shift means the
    morning AFTER the evening its day is named for. Deciding it here instead,
    by the platform's crossing-midnight rule (`end <= start`), is what broke on
    2026-08-26: that rule cannot see the shift, a shift-2 window of 08:00→10:00
    does not cross midnight, so the close was pinned to 10:00 on the REPORT
    day — hours before the night began. Every task carrying a window written in
    shift-1 hours was therefore past due the instant its day existed:
    `autoclose_due` closed a shift-2 unit's whole checklist at the START of the
    shift, locked it forever and sent it to the AI, which failed the photos
    against a window that had not opened. The reviewer was anchored to the
    shift on 2026-08-22 and this was not; **two anchors for one window is how a
    task closes before it opens, so never re-derive this one.** `overnight` is
    then applied only to a real RANGE — a bare clock (an admin `deadline`, the
    day's filing deadline) is one hour, and `window_offset` already seats it in
    the shift: 22:00 that same evening, 09:00 the morning after. That replaced
    the blanket "+1 day for shift 2", under which an evening deadline landed a
    full day late, past the 09:00 the day sweep closes at, so it never fired.
  - At the hour, `autoclose_due` submits whatever exists — a roll short of
    `min_media` still goes to the AI and is judged as it stands, and a DRAFT
    (answered, never submitted) is submitted with its answer and photos intact,
    because `force_answer` returns an existing entry rather than replacing it.
    Only a task with NO answer is recorded not-done with the missed-deadline
    reason.
  - **Enforcement is per-task units ONLY.** `autoclose_due` is bounded to
    `per_task_units` and the other two readers are per-task surfaces; outside
    them the field stays informational, per the 2026-08-15 ruling. The sweep
    runs on a 5-minute job AND on every `/tasks`: a deadline that bites only
    when a scheduler happens to run is not a deadline.
- **The menu carries a running score** — `leader_close.score_line` → «🎯 24/30 ·
  ⏳ 2 tekshirilmoqda». Earned over the weight of REVIEWED tasks; a task waiting
  on a verdict is in NEITHER number. A pending task counted as 0 would make the
  score fall as the day went well, which teaches leaders to stop reading it.
- Row marks come from `leader_close.task_state`: open · ✏️ draft · ⏳ pending ·
  ✅ passed · ✖️ notdone · ⏱ expired · ⚠️ rejected. **The last three were ONE
  state wearing ONE ⚠️ until 2026-08-27**, and leaders read the triangle as an
  accusation whichever had happened (the operator's report): choosing «Yo'q»,
  running out of time, and having a proof refused are three different facts with
  three different things to do about them. ⚠️ now means exactly one — somebody
  looked at your proof and refused it. `FAILED_STATES` is the set, so anything
  asking only "did this go wrong" tests membership instead of comparing to a
  word. `_lt_pt_task_view` is the task's own screen (draft or submitted); a
  submitted one offers nothing but the way back, because there is nothing left
  that can be done to it.

Related memory: `leader-per-task-submission`.

## Filing a proof AFTER the deadline (late proofs)

From **2026-08-30** a leader whose task deadline has gone by can still send the
proof. It earns NO point on its own; two people decide whether it earns one at
all. Before this the deadline had one shape for two very different people — the
leader who did not do the work and the leader who did it and could not file it
in time (a dead phone, a line that ran over) — and both scored 0 with nothing to
say about it.

- **Nothing about the existing close changes.** `autoclose_due` still force-closes
  the task, `leader_close.locked()` still answers what it always answered, the
  day still closes on its own schedule and the score is still stamped as it was.
  The late proof is a SEPARATE row with its own photos, which is what keeps
  every writer, reader and sweep ignorant of it.
- **`services/leader_late_proof.py` is THE definition** — `eligible`, `create`,
  `decide_supervisor`, `decide_admin`, `_grant`, `revoke`. A task is
  late-fileable while: the unit closes tasks one at a time (nothing else HAS a
  per-task deadline to miss), the task's deadline has passed, **its day is still
  OPEN**, the task was not actually done, and no late proof exists for it yet.
  «Its day is still open» is the window (the operator's call): the late door
  shuts when the checklist shuts, so a proof can never arrive for a day whose
  score has already been reported and read.
- **The AI never sees one.** No `LeaderAiReview` row is written, so there is no
  queue door to close — a late proof is judged on WHY it is late, which is a
  question about a person and not about a photograph.
- **The chain is two-stage and deliberately asymmetric.** The unit's own
  brigadir may REJECT (final) or UPLIFT with a written case for it; only an
  ADMIN can approve. The person closest to the leader knows best whether the
  excuse is true and is the worst possible choice for the only person who
  decides that it counts. The keyboards and the dashboard buttons express this
  by being the only ones present, and every write re-checks it server-side.
- **Approval gives FULL weight**, through the ordinary `LeaderTaskOverride`
  overlay — the same read-time mechanism an admin's manual done/not-done ruling
  uses, so it moves the register, the leaderboard, the day report and the
  corrected report DM with no new scoring path. The lateness is not laundered:
  the row, its chip and the day report all go on saying it arrived late.
- **Nothing expires it.** An undecided row waits in both queues with a badge
  until a person acts. The default is already 0 points, so a silent auto-reject
  would only take the decision away from the two people the flow exists to put
  it in front of.
- **`status` is the stage AND the outcome**, one column: `supervisor` → `admin`
  → `approved` | `rejected`. A separate stage column would be a second thing to
  keep in step, and every reader would consult both to answer one question.
- **A late proof can be SHOT IN THE APP or uploaded — both doors, side by
  side** (the operator's call, 2026-08-30). On a camera task the late screen
  carries «📷 Ilovada suratga olish» (a `web_app` to `/proof/camera?…&late=1`)
  beside «🖼 Mavjud rasmni yuborish». This does NOT weaken the camera rule that
  "a camera task has no upload path": before it, upload was the ONLY late door
  for a camera task, so adding the camera is a tightening. The rule is about the
  SCORING path — the stamp exists because the AI derives a date verdict
  arithmetically — and a late proof reaches no arithmetic at all. Provenance is
  carried and SHOWN (`source` / `stamp` / `captured_at` on each photo, a chip on
  the card), because a stamped shot and a hand-picked file that look identical
  teach reviewers that the stamp is decoration.
- **`LeaderLateProofShot` is the DRAFT ROLL** — photos taken before the reason
  is written, from either door, in one store. It is a table and not the bot's
  `LeaderTaskCapture` because that row is per ACCOUNT, is cleared by any
  `/tasks`, and expires in 30 minutes: a leader who shot three photos and took
  too long writing the reason lost all three. And it is emphatically NOT
  `leader_task_photos`: `leader_close.force_answer` turns ANY photo on that roll
  into a `done` entry via `sync_entry`, and `leader_proof.server_clocks` feeds
  it to `LeaderAiReview.clocks` — a shared key would auto-submit the task, score
  it AND send it to Gemini, breaking all three rules at once. `create()`
  CONSUMES the draft, so one place knows the draft → filing transition.
- **`POST/DELETE/GET /api/leader-proof/late-photo`** are the camera's late door.
  They reuse `_own_leader`, `_camera_cfg` (so CAMERA_IS_PILOT enrolment stays
  bound in one place), `_relay` and `leader_proof.burn` verbatim — same server
  stamp, same «no font ⇒ nothing stored» — but call `leader_late_proof.eligible`
  instead of `_task_locked` and **never** `sync_entry`. `save_photo` goes on
  refusing a locked task, untouched.
- **`?late=1` is a REQUEST; the server is the authority.** `/session` serves
  late mode only when `eligible` AND the task is genuinely LOCKED — in the
  ≤5-minute sliver between the deadline passing and `autoclose_due` firing, the
  leader can still file NORMALLY and their shots still count, so sending them
  down the late path would cost them the point for nothing. With no late mode
  the payload is byte-identical to what it has always been; that endpoint is the
  one piece of shared code the live camera pilot executes.
- **A draft never outlives its window**: `reset_task` and `reopen_task` call
  `clear_draft`, `maybe_close_day` and `close_expired_days` call `drop_drafts`.
  `eligible` requires the day OPEN, so a draft left behind could never be
  submitted by anybody.
- Bot: the warning screen is a SCREEN, not a line — it names the hour that
  passed, states plainly that no point comes automatically, says who will read
  the reason, and only then offers the way forward. Photos, then a mandatory
  reason, then the card goes to the brigadir with its photos attached (a
  brigadir deciding in a workshop will not open a dashboard first). Cards are
  recorded as `ApprovalNotice` rows so one decision retires every copy. The
  warning and the photo counter are ONE evolving message (`_lt_late_screen`), so
  the camera's own nudge (`refresh_late_screen`) can redraw whichever is on
  screen — deliberately not a widening of `refresh_camera_prompt`, which would
  paint the locked-task outcome screen over the late one.
- Dashboard: `/leaders?tab=lateproof`
  (`components/leaders/LateProofs.jsx`). Split by stage and badged exactly like
  «Norozliklar» next door — one rule, two queues; see that section. Photos are
  ON the card — unlike
  «Norozliklar» next door, where the subject is a verdict that carries its own
  prose; here the evidence IS the submission. Uplift is a FORM (the `Modal`
  template with a required field), reject and approve are plain confirms.
  Photos go through `ProofPhoto.jsx`'s `LateProofPhoto` — never a bare
  `<img src>`, which carries no JWT and can only ever render broken.
  Scoped like every read on the page, plus the LEADER, who reads their own
  filings: the flow asks them to explain themselves, so the answer has to be
  visible to them.

## What is ON the `/leaders` tab strip

From **2026-09-02** (the operator's call) the strip is exactly five tabs, in
this order: **Monitoring · Vazifalar · AI tekshiruvi · Norozliklar · Kechikkan
isbotlar**. The two review queues sit last and together — they are the two ways
a task that scored 0 gets its weight back — with the AI queue that produced
those rejections directly above them.

- **«Kechikkanlar» and «Ma'lumotlarni tozalash» are GONE from it.** The
  shift-1 late-day queue is ruled on from the Telegram card the request arrives
  as (`approvals.py`, kind `leader_late`), and the bot-day delete lives on the
  admin «Liderlar kunlik vazifalari» destination (`/admin/upload?tab=ltdaily`),
  beside the submission it deletes and the day detail that says what is in it.
- **Neither component was deleted** — `components/leaders/LateReports.jsx` and
  `BotDataClear.jsx` are simply rendered by nothing today, so putting either
  tab back is one entry in `tabOk` and one in the strip.
- **A deep link naming a tab this page no longer has is IGNORED, not obeyed.**
  `telegram_bot.py` and `approvals.py` still link `?tab=late`; `tabOk` refuses
  it exactly as it refuses a tab the viewer's role cannot open, and the saved
  tab stands. Fix the two links only if the queue never comes back.

## Objecting to an AI rejection (the three-stage chain)

From **2026-08-30** a task the AI refused is argued through the SAME chain as a
late proof, and for the same reason. The old flow had one stage — the unit's
BRIGADIR objected, straight to an admin — and two things were wrong with it,
both reported from the floor:

- **The person who was judged could not speak.** The leader reads the verdict on
  their own day report (the report DM goes to them by design), sees a photo they
  know is right refused for a reason they can answer, and had no control that
  did anything. Their only route was to find their brigadir and persuade them to
  type it up, so what reached the admin was a second-hand paraphrase of an
  argument nobody recorded.
- **The admin ruled with one side of it.** One note, from somebody who was not
  there, about a photograph they did not take. Whether the reason is TRUE is a
  question about the shift, and the person who can answer it is the brigadir —
  who was being asked to be the author instead of the witness.

So:

    leader     files their own account, from the day report they were sent
    supervisor the unit's brigadir REFUSES it (final) or UPLIFTS it, which
               REQUIRES their own written case — they cannot restore the weight
    admin      reads BOTH notes and decides whether it is pointed

- **`services/leader_dispute.py` is THE definition** — `entry_stage`, `create`,
  `decide_supervisor`, `decide_admin`, `undo`, `supersede`, `notify_filed`,
  `notify_decided`. `status` is the stage AND the outcome, one column:
  `supervisor` → `admin` → `approved` | `rejected`, plus `cancelled` for a
  ruling taken back. A separate stage column would be a second thing to keep in
  step, and every reader would consult both to answer one question.
- **The asymmetry is the design.** The person closest to the leader knows best
  whether the excuse is true and is the worst possible choice for the only
  person who decides that it counts. It is expressed by WHICH BUTTONS EXIST at
  each stage — on the card, on the report page and in the bot keyboard — not by
  a check that fires after somebody has already pressed something; and every
  write re-checks it anyway (`_dispute_stage_rights`, per ROW, because "you are
  a brigadir" is not "you are THIS unit's brigadir").
- **WHERE a filing enters is decided by WHO FILED IT** (`entry_stage`), and that
  one rule is what keeps the old flow's capability alive without a second code
  path: a **leader** → `supervisor`; a **supervisor** → `admin`, their own text
  recorded as the uplift note; an **admin** → filed and settled in one act, the
  same rule as opening a late day. The brigadir's door stays open because ~18%
  of leader rows never resolve to a profile
  (`leader-register-unlinked-rows`) — those leaders cannot log in as
  themselves, so making this leader-only would have closed the route back for
  exactly them. `requested_by_profile` says whose words `reason` is, and every
  card labels it accordingly rather than printing a brigadir's paraphrase as a
  leader's own account.
- **It is also how every legacy row reads correctly with nothing rewritten.**
  Rows filed under the one-stage flow were ALL filed by a brigadir and ALL
  waiting on an admin — i.e. they entered at the admin stage.
  `startup.migrate_dispute_stages` (flag `leader_dispute_stages_2026_08_30_v1`)
  does nothing more than say so: `pending` → `admin`, the text becomes the
  uplift note it always was, the brigadir who typed it is stamped as the person
  who passed it up. `reason` is left in place — it is "the text this row was
  filed with", every earlier reader knows it under that name. Changing what the
  migration does needs a NEW flag key, or the old "already ran" mark makes it a
  no-op on every box that has booted once.
- **The weight still moves in exactly ONE place** — `LeaderAiReview.resolution`,
  the field an admin's triage ruling already writes — so nothing downstream
  learns a new rule. `approved` is the only value that restores it, and
  **only the ADMIN stage writes that column at all**. A brigadir's refusal
  settles the objection ROW and touches no scoring column, exactly as
  `leader_late_proof.decide_supervisor` does. The first cut of this module
  wrote `rejected` there on a stage-1 refusal, and it broke twice over —
  `leader_ai.rejected_by_uid` matches `resolution == "rejected"` OUTSIDE
  `_auto_clause()`, so on a manual-regime day a brigadir would newly take the
  weight off; and an open objection does not remove its verdict from the triage
  queue (`resolution.is_(None)`), so an admin could rule `approved` there while
  the objection still sat at stage 1 — `supersede` retires only SETTLED rows —
  and the brigadir's still-live card would then overwrite it. `undo` carries
  the same rule in reverse: it clears the verdict only when `decided_at` says
  this objection is what wrote it, or it would blank somebody else's ruling
  under cover of reversing its own. A flag staying in the ADMIN's triage queue
  after a brigadir declined to argue for it is correct, not a leak.
- **One sentence is never printed twice as two people's notes.**
  `leader_dispute.sup_case` / `echoes_reason` is THE guard and all three
  renderers call it — the admin's Telegram card, the queue and the day report.
  A supervisor's or admin's own filing IS the uplift, and every row
  `migrate_dispute_stages` moved has `sup_note == reason` by construction, so a
  reader that showed both fields blindly attributed the same words to the leader
  and to the brigadir on the very card somebody weighs two accounts from.
- **Stage-1 authority is answered against the OBJECTION's stamped unit, never
  the report's.** They agree at filing time, but a SHEET report re-resolves its
  `managerId` on every read (`_relabel` + `supervisor_match`) over a table the
  leaders Refresh rewrites wholesale — so the two drift, and a `canAct` derived
  from the report's would draw a button `_dispute_stage_rights` then refuses.
  `_dispute_out` ships `managerId` for exactly this.
- **Everybody is told at every stage that takes the decision out of their
  hands** — `leader_dispute_filed` (to the brigadir), `leader_dispute_uplifted`,
  `leader_dispute_sup_rejected`, `leader_dispute_approved`,
  `leader_dispute_rejected`, `leader_dispute_undone`. A leader who explained
  themselves and heard nothing back learns that explaining is pointless, which
  is the one outcome that makes the whole chain worthless. The brigadir hears
  about the two rulings they did not make, never their own.
- **Two Telegram cards, one per stage.** Stage 1 is `_ad_*` in
  `telegram_bot.py` (`ad:sr` refuse / `ad:su` uplift, which opens an `ad_note`
  text capture — the uplift is not made until the case arrives); stage 2 is the
  `leader_dispute` card `approvals.py` has served since before this chain
  existed, so a card already sitting in an admin's chat goes on working. Both
  are `ApprovalNotice` rows, so one decision retires every copy, and both take
  a message KEY rather than a rendered string — the card sits in several chats
  and each reader has their own language.
- **Both open stages are OPEN, everywhere.** `leader_dispute.OPEN_STATES` and
  the frontend's `verifyState.disputeOpen` are the two spellings and they must
  stay two spellings of one rule: the register's `ai.disputed` counter, the
  day-report task state, the "already objected" guard and the queue's segments
  all read it. Counting only one stage tells a reader a rejection is settled
  while somebody is still arguing it.
- **`decide` takes `action` + `note`, one endpoint for both stages** — which
  ruling it applies is a property of the ROW, so a caller naming the stage
  could name the wrong one. `status` is still accepted as an alias for
  `action`, which is the only thing a tab still open on the one-stage bundle
  could ever have sent.
- Read surfaces: `/leaders?tab=disputes` (admin · brigadir · **leader**, their
  own filings) and `/leaders/report/:uid`, where the objection is filed and
  where both stage rulings can also be made inline.

## An UNFINISHED bot day is visible («Tozalash» → «Yakunlanmagan»)

Every read surface on the platform serves a CLOSED bot day — the `/leaders`
register (`leader_bot.closed_days`), the score, the day report, the AI queue,
and the admin «Tozalash» tab itself until **2026-08-21**. So a checklist a
leader filled but never submitted was visible **nowhere**, and read exactly like
a leader who filed nothing at all.

That state is reachable without anybody doing anything wrong. `lt:cconf` refuses
to close a day while one enabled task has no answer, and a **camera** task
writes its answer only when the roll reaches `min_media` — so a leader one shot
short of a three-photo task is holding a day that nothing will accept and
nothing will show.

**For shift 2 that wait is over (2026-08-22, user).** The day-level auto-close
used to have ONE door — `_lt_autoclose`, which runs only when *that leader*
next opens `/tasks` — so a leader who never came back left the day open
forever. `leader_close.close_expired_days` is now THE definition of that close
and both doors call it: the bot's, and a scheduled sweep
(`sweep_expired_days`). Two spellings would mean a leader's score depended on
which door reached the day first.

- **The sweep rides the existing 5-minute job** (`leader_close._sweep`, beside
  the per-task `autoclose_due`) rather than a cron pinned to the hour. It asks
  "what is past its deadline", so it lands within minutes of shift 2's 09:00
  (`expired_through`), heals a day an outage skipped, and needs no timezone of
  its own. It kicks the drain on a close, so the verified score lands at ~09:05
  rather than on the next 20-minute tick.
- **`AUTOCLOSE_SHIFTS = (2,)` is the bound** — one tuple, widened deliberately.
  Shift 2 is where it bites: its window shuts at 09:00, hours after the crew
  has gone home, and it files ONLY in the bot, so an unclosed night is simply
  lost. Shift 1 goes on closing when its leader next opens `/tasks`, unchanged
  — and for shift 1 `expired_through` is yesterday, so nothing can auto-close
  today's day at all.
- **The deadline itself did NOT move** (the user's call): shift 2 still files
  until 09:00 (`deadline_hhmm`), and the sweep fires at that same hour rather
  than cutting an hour off what leaders are told they have.
- **A leader's shift comes from their OWN unit**, exactly as `_lt_shift` reads
  it, never from the unit stamped on the day — the two doors must not disagree
  about which hour a checklist dies at.
- A day with nothing filed still closes at 0 and queues NOTHING (no
  done-with-media entry exists), so it sends no report DM: there is no verdict
  to report.

- `GET /admin/leader-tasks/submissions` now returns open days too, each flagged
  `open` and carrying what it is WAITING for: `enabled` / `answered`,
  `missing` (the unanswered enabled task ids), `tasks_closed`, `per_task`,
  `expired` (the same `date <= expired_through(shift)` predicate `_lt_autoclose`
  uses) and — the one that matters — **`pending_media`**, the shots already on
  the server for a task with no answer. Non-zero there is the difference
  between "they never filed" and "they filed and the platform is sitting on it".
- **Deletion stays closed-only and does not depend on what the list shows.**
  `delete_submissions` re-filters `closed_at IS NOT NULL` itself, so an open day
  can never be selected, armed or dropped — pulling the table out from under a
  running `/tasks` flow would strand the leader in it.
- **It is no longer a tab on `/leaders`** (removed 2026-09-02, the operator's
  call): the admin «Liderlar kunlik vazifalari» destination
  (`/admin/upload?tab=ltdaily`) reads both filing layers whole and carries the
  same whole-day, closed-only delete. `BotDataClear.jsx` is left in the tree,
  rendered by nothing — what follows describes it as it stands.
- The tab is TWO views behind a `SegmentedToggle` (`components/leaders/BotDataClear.jsx`):
  «Yuborilgan» is the delete tool, unchanged; «Yakunlanmagan» deletes nothing and
  carries no delete controls at all — a greyed-out «O'chirish» reads as "not
  yet", not as "never". The two registers are split BEFORE the page scope is
  applied, so the `ScopeNotice` count describes the view being read.
- **In per-task («1×1») mode the decisive column is «Yuborilgan»**, not
  «Javob». `maybe_close_day` waits on `entry.closed_at`, not on the entry
  existing, so a leader can ANSWER all thirteen tasks, photograph every proof
  and still hold a day nothing will show — the gap between the two counts is
  the drafts. It renders «—» outside per-task mode, where one button submits
  the whole day and a per-task count would name a step that unit does not have.
- Reading it: `pending_media > 0` ⇒ the leader shot proofs and the roll is short
  of `min_media`; `answered < enabled` with no pending photos ⇒ tasks genuinely
  unanswered; `answered == enabled` but `tasks_closed < enabled` ⇒ per-task
  drafts, waiting on `autoclose_due` at the task deadline; `answered == enabled`
  on a day-close unit ⇒ they simply never pressed «KUNNI YOPISH». `expired` ⇒ it
  will close (and go to the AI) the moment that leader reopens the bot.

## What the leaders FILED (`/admin/upload?tab=ltdaily`)

From **2026-08-26** «Liderlar kunlik vazifalari» is the admin's read of both
collection layers WHOLE — `pages/admin/LeaderDailyTasks.jsx`, two sub-tabs over
`GET /admin/leader-tasks/fillout` (the Google-Form rows) and `GET
/admin/leader-tasks/submissions` (the bot days, the existing «Tozalash» feed).
Every read surface on the platform serves the MERGED answer — `/api/leaders`
drops a sheet row the moment a bot day replaces it — so a leader who filed
through both doors left one submission an admin could open and one they could
see **nowhere**. This is the surface where both exist.

- **Admin-only and NOT grantable.** No `capKey` on the `ADMIN_NAV` entry, so
  `capTabs.includes(capKey ?? id)` can never admit a grantee — the `permissions`
  / `logs` model. It can delete a scored day and move a leader's score.
- **The fill-out layer is READ-ONLY, and the tab says why.** `leader_checklists`
  is wiped and reloaded by `sheets_sync.sync_leaders_sheet` on every Refresh, so
  a delete here would reappear on the next sync — a button that lies about what
  it did. A row is removed in the Google sheet itself. (The user's ruling: a
  suppression list that survives re-sync was offered and declined.)
- **The detail modal** (`components/leaders/DaySubmissionModal.jsx`) reads a
  SHEET row through `/api/leaders/report/{uid}` and a BOT day through `GET
  /admin/leader-tasks/day/{id}`. The second **delegates to
  `leader_reports.day_report` verbatim once the day is closed** and only adds
  per-task `state` / `locked` / `closedAt` / `roll` on top — so a score, a
  verdict or a photo shown to the admin is still the one the leader and the
  brigadir were shown. Never add a second admin-only projection of a CLOSED day.
  Both submissions stay readable whichever one counts — `build_report_row` finds
  a sheet row by `submission_id` and a bot day by `closed_at`, neither gated on
  the merge. A bot day's report handle is `leader_bot.day_uid()`, the ONE
  spelling both registers write (the admin one forgot it once, and every row on
  the tab opened onto «could not load the detail»).
- **An UNFINISHED day has a detail too, and this is the only place it exists.**
  `build_report_row` serves closed days only — an open day is a leader
  mid-checklist, not a submission — so proofs already uploaded to an unsubmitted
  day were visible to nobody. The open branch of `admin_day_detail` projects the
  in-progress day into the SAME keys, built from the CONFIG rather than from the
  entries so a task nobody has reached is listed as unanswered instead of being
  absent. Three facts only it can show: a task not started, a task answered but
  not SUBMITTED (a `draft` — what holds a 1×1 day open), and the **camera roll**
  of a task short of `min_media`, which writes no entry and which the register's
  media proxy therefore cannot reach. It prints **no score** — `completion` is
  written when the day closes, and a running total shown as «Natija» is a number
  the leader can still move — showing `progress` instead.
- **`leader_close.task_state` is THE state vocabulary** (open · draft · pending ·
  passed · notdone · expired · rejected) and the modal renders that, never a
  second set of words: the bot menu, the register and this tab must agree about
  which state a task is in. The three bad endings are all RED here — they all
  score 0, and colour is the status — with the ICON saying which one it was,
  the same split the Jurnal tab makes between outcome and category.
- **A not-done `reason` is the leader's own free text, except when nobody typed
  it**: a task the deadline caught carries the sentinel `__missed__|HH:MM`,
  because one fixed sentence cannot read correctly for four viewers.
  `utils/leaderReason.js#showReason` is THE expansion and both readers call it —
  it lived only inside `Leaders.jsx` until this modal grew the same column and
  printed «__missed__|09:00» at an operator verbatim (2026-08-27).
- Roll shots stream from `GET /admin/leader-tasks/roll-photo/{id}` (admin-only).
  Deliberately NOT a widening of `/api/leader-proof/photo/{id}`, which answers
  only for a photo belonging to a leader profile the CALLER holds and says so in
  its own contract. `_stream_tg_file` is the one streamer behind both that door
  and the register's media proxy.
- **Reopen is PER TASK** (the user's ruling), `POST
  /admin/leader-tasks/task/reopen` → `leader_close.reopen_task` (+ `reset_task`
  when `wipe`), the same cores the bot's own locked-task screen runs, so a task
  taken back from the panel and one taken back in Telegram end in one state.
  `leader_close.reset_task` is now THE reset core — `telegram_bot._lt_reset_task`
  is a thin call into it. Offered only where a task is actually LOCKED
  (`locked_tasks` on the row); delete stays whole-day and closed-only.

### Which submission COUNTS (`leader_day_sources`)

`leader_bot.merges()` decides between the two layers by RULE, and that rule is
right in general and cannot be right in every case: a leader who answered twice
leaves two honest submissions and only a person can say which is the record.

- **`LeaderDaySource` is that person's answer** — `(leader_profile_id, date)` →
  `"bot" | "sheet"`, `POST /admin/leader-tasks/day-source`. Clearing DELETES the
  row, so "no opinion" is the absence of a record rather than a third value
  every reader has to spell out.
- **It is checked FIRST inside `merges()` and `training()`**, which is what makes
  it reach every surface at once — the register, the photo proxy, the score, the
  day report, the AI queue (`discover` / `undiscovered` / `queue_report` /
  `queue_task`) and `leader_reports`' park. Both now take `leader_id=` +
  `overrides=`; a caller that omits them behaves exactly as before.
- **Bounded on write to pairs that hold BOTH.** Shift 2 files only in the bot, so
  forcing one of its days to «sheet» with no sheet row would delete the day from
  every surface at once without deleting anything. Refused in the endpoint, not
  guarded in the UI — the endpoint is reachable without it.
- **`_pair_state()` in `routers/leader_tasks.py` is the ONE computation** behind
  both registers and the writer, so the two tabs and the endpoint that changes
  the answer can never disagree about a day — including about whether there are
  two submissions to choose between. Pairs are joined by the resolved leader
  PROFILE (`supervisor_match` → `leader_match`), the register's own dedupe key;
  a looser matcher here would act on pairs `/api/leaders` never joins.
- A bot day that resolves to «sheet» with **no** sheet row counts NOWHERE (a
  rehearsal day, an unmerged shift-1 day). The cell says «Hisobga olinmaydi»
  rather than naming a Form row that does not exist.

## Days that count NEITHER way (`/admin/upload?tab=ltexclude`)

From **2026-08-27** a leader-day can be taken OUT of the results entirely —
`LeaderDayExclusion`, the «Hisobdan chiqarilgan kunlar» admin destination
(`pages/admin/LeaderDayExclusions.jsx`). Not green, not red: the day leaves the
numerator AND the denominator, for the leader and for their brigadir at once.

Every other "does not count" on this platform is one of two other things, and
neither can express this. The filing-window void scores the day **0** and leaves
it occupying its slot — arithmetically identical to holding it against the
leader. `LeaderDaySource` and `bot_from` switch which LAYER supplies the number.
So when the platform itself was at fault — the shift-2 per-task auto-close that
closed and AI-failed whole checklists before their windows opened — an operator
had no way to make the night cost nobody anything.

- **`services/leader_exclusions.py` is THE definition** — `key`, `load`,
  `profile_days`, `excluded`, `row_for`, `wire`, `exclude`, `lift`,
  `drop_pending_reviews`. Nothing is written onto a score, so lifting an
  exclusion restores the day everywhere at once with no migration and no
  re-sync, exactly as a window edit re-derives its verdicts for free.
- **The key is the leader-DAY**, keyed as `LeaderLateRequest` is (`p<id>` when
  the sheet name resolved to a profile, else `n<folded name>`) — a deliberate
  twin of `routers.leaders._late_key`. `leader_checklists` is wiped and reloaded
  on every Refresh so a row-id key would not survive the next sync, and ~18% of
  sheet names never resolve to a profile so a profile-only key could never reach
  an unlinked leader's day.
- **The denominator is what makes it real, and it is PER PERSON.** `slotsBy` in
  `Leaders.jsx` returns `{days, off}` and `scoreSlots` scores over
  `winDays - off.size`. All five readings move together — standings, the
  headline average, Barqarorlik, the trend line (a per-DAY roster) and the
  rolling sparkline (`x` slides with the window) — plus `taskStats`, whose
  `owed` loses the excluded pairs through its own suffix array. The file's
  invariant is that one rule scores the whole page; a second denominator here is
  how the trend dips on a day the ranking says cost nobody anything.
- **A unit-day survives on the leaders who filed it.** `off` is computed as
  "this key had an excluded row on that date and NO surviving slot", never as
  "the row said excluded" — one leader of a unit excluded leaves the unit's day
  standing on its other leaders, and only a unit-day excluded in full leaves the
  unit's window.
- **A person whose whole window is excluded leaves the ranking**, rather than
  ranking 0% — 0 is the one answer that is certainly wrong, since it is exactly
  the "counts against them" the exclusion removes. Same state as somebody with
  no rows in the period.
- **It outranks the filing-window void** wherever both land on one day (an
  exclusion is a person's answer about that exact day, the void is a rule about
  all of them — `LeaderDaySource`'s precedence). The day then shows ONE chip,
  its own: no verify chip, no late flag, grey score badge, blank heatmap cell.
- **Visible, never hidden.** A day silently removed cannot be told from one that
  was never collected, so the row stays in the register with «Hisobga
  olinmaydi» + the reason, and the day report carries a banner. The `reason` is
  mandatory to exclude and travels with the flag everywhere it is shown.
- **Nothing is deleted.** Photos, entries, verdicts, the day report and both
  collection layers are untouched; only whether the number enters an average
  changes. Lifting puts the day back at the score it always had.
- **The AI stops looking and no score DM goes out.** All four queue doors
  (`discover`, `undiscovered`, `queue_report`, `queue_task`) refuse an excluded
  day — with `force=True`, the admin's own «check now», as the one carve-out,
  the same shape the shift pause and the rehearsal window keep — and
  `drop_pending_reviews` takes back what was queued before the decision
  (never-judged rows only: `reviewed_at IS NULL AND resolution IS NULL`).
  `leader_reports` PARKS the report so the key leaves the sweep's candidate set;
  lifting the exclusion lifts the park and the report goes out as a FIRST one.
- **The people already told a score are told it stopped counting** —
  `leader_reports.notify_excluded`, leader + brigadir, once, at the decision.
  Only where a DM actually went out (`LeaderDayReport.sends > 0`, a PARKED row
  is not a send): a day nobody was messaged about needs no correction. A DM
  failure never rolls back the decision — re-pressing would find the day already
  excluded and tell nobody at all.
- **Admin-only and NOT grantable.** No `capKey` on the `ADMIN_NAV` entry, so
  `capTabs.includes(capKey ?? id)` can never admit a grantee — the
  `permissions` / `logs` / `ltdaily` model. `POST /api/leaders/exclusions`
  checks `role == "admin"` itself, because the endpoint is reachable without the
  UI. Batches cap at 400.
- **The tab has THREE views, and only the third has a source of its own.**
  «Hisobga olinadi» and «Hisobdan chiqarilgan» come from `/api/leaders`, the
  same feed the dashboard scores, so they can never offer a day the register
  does not have. **«Topshirilmagan» is the day nobody filed** (from
  2026-08-27), and it needs a second source because the register has no trace
  of such a day at all — while the score is Σ of filed-day means ÷ the CALENDAR
  days of the period, so an unfiled day already costs its leader a full slot of
  the denominator. It was the one day an operator could not forgive, and it is
  the commonest one they need to. The SELECTION is the scope (the `Factories` /
  `ShiftTimes` model): filters narrow to the night, then the operator ticks the
  rows — an incident hits a whole unit, but the two leaders who filed properly
  are what an operator needs to be able to leave alone.
- **The second source is `roster` on `/api/leaders`** — every non-archived
  leader profile with its unit, its supervisor in the SHEET's spelling
  (`sup_display`, so a day named here lands in the same unit bucket that
  leader's filed days land in) and its shift. **Admins only**: it is the roster
  of every leader on the platform, the tab is admin-only, and the endpoint that
  acts on it refuses anybody else. A leader-day is «missing» when the period
  holds no row for it by profile id **and** none by folded name — ~18% of sheet
  names never resolve to a profile, and a row filed under an unmatched spelling
  must not make its leader look absent. The list is drawn per leader per day,
  so the period is capped at 62 days and the cap is SAID, never silently
  truncated.
- **An excluded day with no submission becomes a register row**
  (`leader_exclusions.orphan_rows`, `missing: true`, `source: "none"`). The
  writer never needed a row — the key is the leader-DAY — but every READER does:
  `slotsBy` drops a day from the denominator only when handed a row carrying
  `excluded`, so the decision moved nothing until the row existed. One row per
  exclusion an admin actually recorded, never a projection of "every day nobody
  filed"; lift it and the row goes with it. Scoped exactly as the filed layers
  are (supervisor → own unit, leader → own profile ids) — it moves the
  denominator, so a viewer not handed it would read a different mean for a
  leader than everyone else reads for that same leader. It prints «—» and not
  «0%», and offers no «Batafsil» button, because there is no report behind it.
  `notify_excluded` says nothing about such a day, by its own rule: nobody was
  ever DMed a score for it.

Related memory: `leader-day-exclusions`.

## A LEADER who stops counting (`/admin/upload?tab=ltcutoff`)

From **2026-08-30** a leader can be taken out of the results **from one day on,
open-ended** — `LeaderCutoff`, the «Liderni hisobdan chiqarish» destination
(`pages/admin/LeaderCutoffs.jsx`), sitting directly after the day exclusions
because the two are read together and are constantly mistaken for one another.

The tab next door answers a question about a **named DAY**: the platform got
that night wrong, so nobody is scored on it. This answers a question about a
**PERSON**: from this date they are no longer a leader here — they left, they
moved, their unit was handed over — and every day from that one on is a day they
were never expected to file. Same arithmetic, different subject.

- **It cannot be built out of day exclusions, and that is the whole reason it
  exists.** An exclusion is one row per day and the future has no days in it
  yet, so «from the 21st onwards» written as exclusions means writing rows for
  days that do not exist and then writing more of them every morning forever —
  and the morning the writer stops, the leader silently starts scoring 0 again
  with nothing on screen saying why. One record per decision goes on answering
  after the person who made it has stopped looking.
- **`services/leader_cutoffs.py` is THE definition** — `person_key`, `load`,
  `stopped_from`, `hit`, `active`, `wire`, `set_cutoff`, `lift`,
  `drop_pending_reviews`. Nothing is written onto a score, so lifting restores
  every affected day everywhere at once with no migration and no re-sync.
- **The key is the PERSON**, spelled by `person_key` exactly as
  `leader_exclusions.key()` spells its own half before the date — that function
  now CALLS this one, so a leader who is one person to the day-exclusion tool
  cannot be two people to this one. ~18% of sheet names never resolve to a
  profile, so both spellings are carried and `load()` is deliberately the only
  preload shape: an id-keyed twin drops exactly those leaders, and the census
  (`undiscovered`) would then promise «N tekshirilmagan» rows the queue
  (`discover`) refuses, a counter that never comes down.
- **The date is a FLOOR with no ceiling.** A leader who returns has their cutoff
  LIFTED or moved later; a gap in the middle of a career is a run of day
  exclusions, which is what that tool is for. A second date would give "is this
  day counted" four answers and every reader would have to spell all four.
- **`leader_exclusions.excluded()` is THE door for both**, and folding the
  cutoff in there is what took it to the four AI queue doors and the report
  sender's park without wiring it to each. `wire_for` (per-row) and `wire_in`
  (map-based) are the twin readers, and the **DAY's own exclusion outranks the
  cutoff** in both — it names this exact night, the cutoff is a rule about every
  day after a date — so lifting a cutoff leaves a day exclusion standing.
- **It lands on the SAME `excluded` field the day exclusion uses**, plus
  `cutoff: true` and `from`. The client already knows what an excluded row is —
  it leaves both sides of the average, it shows a grey chip, its calendar cell
  is blank, no verdict prints beside it — and every one of those is right here.
  A second field would mean a second denominator rule on the client, which is
  how two readings of one ranking start disagreeing. Only the TOOLTIP and the
  report banner branch, because only they say anything about tomorrow.
- **Rows are not enough, and this is the load-bearing part.** Stamping
  `excluded` reaches only days a cut leader actually FILED; every day after the
  cutoff that nobody filed leaves no row anywhere, and the client shrinks a
  denominator only when handed a row saying so. So the DECISION travels —
  `cutoffs` (display name → from) and `cutUnits` on `/api/leaders`, one entry
  per person rather than one per day — and `slotsBy(rows, keyFn, cuts, dates)`
  expands it over whichever window each ranking is scored over. **Every call
  site passes its own date list**: the standings, the trend, the previous
  period and the rolling sparkline score four different windows, and one shared
  list would be wrong for three of them. The expansion is in `slotsBy` and NOT
  in `scoreSlots` because two readers never reach `scoreSlots` at all — the
  trend builds `dayOff` off `off`, and the spark tests `off.has(d)` per day.
- **`off.delete` still runs last, and that is what makes the two sources
  agree**: a cut leader who files anyway gets a row the backend already stamped,
  so it never reaches `e.days` and the date stays off, while an unstamped row is
  a day somebody really was measured on and keeps its slot.
- **A UNIT leaves its own denominator only when EVERY leader it has is cut**,
  from the LAST of their floors. Computed on the backend because the client
  cannot: it is handed the cut leaders, never a unit's full roster, so it could
  not tell "all of them" from "the only one I was told about". One leader of
  three leaving takes nothing from the unit — its day still stands on the two
  who file.
- **The maps are SCOPED like the rows** (supervisor → own unit, leader → own
  profile ids): they move the denominator, so a viewer not handed them would
  read a different mean for a leader than everyone else reads for that same
  leader.
- **`auto_discover` was the worst leak and is now closed.** It fires on the
  leaders-sheet **Refresh**, a button an admin presses all day, so a cut
  leader's rows would be re-queued and re-spent on Gemini indefinitely. Every
  other door is a one-shot or fires once per close.
- **Admin-only and NOT grantable.** No `capKey` on the `ADMIN_NAV` entry, so
  `capTabs.includes(capKey ?? id)` can never admit a grantee — the
  `permissions` / `logs` / `ltdaily` / `ltexclude` model. `POST
  /api/leaders/cutoffs` checks `role == "admin"` itself, because the endpoint is
  reachable without the UI. Batches cap at 200 — a cutoff batch is PEOPLE, not
  days. The confirm carries a `challenge` (retype the date), which the
  exclusions tab deliberately does not: that decision names one night and its
  blast radius is on screen, this one silently covers every day that has not
  happened yet.
- **Both people are told, once, at the decision** (`leader_reports.notify_cutoff`
  → `leader_cutoff_set` / `leader_cutoff_lifted` and their `_report_` twins).
  Unconditionally, unlike `notify_excluded`: the news is not "a number you were
  shown has changed" but "from Monday your reports are no longer scored", which
  is news whether or not any particular day was ever reported.
- **Moving a cutoff EARLIER newly covers queued days** — `set_cutoff` returns
  the PREVIOUS floor for exactly that, and `drop_pending_reviews` runs from the
  earlier of the two. Moving it LATER cannot resurrect the verdicts that were
  dropped: those days come back **unverified**, and «Tekshirish» with scope
  «unchecked» is the only route to a verdict for anything outside the rolling
  14-day window.
- **Lifting a long cutoff sends a backlog of FIRST reports** — a parked day is
  `sends = 0`, so the sweep treats it as never reported. Bounded by
  `auto_window_start()`'s rolling 14 days.
- **Deliberately NOT changed: the bot.** `/tasks` opens, tasks close, the day
  closes, and `leader_close.score_line` still prints a running score to a cut
  leader in Telegram. A cutoff is about RESULTS, not access, and a leader in a
  handover week may legitimately still be filing. Same for
  `leader_late_proof.eligible` and `leader_dispute.create`: both are
  arithmetically inert on a cut day (it enters no average either way), and
  closing them is a separate decision.
- **A cutoff-stamped ROW never adds to `off` itself** — only a DAY exclusion
  does. The expansion owns it, and it owns it per key space. Letting the row do
  it meant a cut leader who went on filing (the bot still lets them) FORGAVE
  their whole unit's misses: on any day their row was the unit's only one, the
  unit's day left the unit's denominator though the unit still owed a report
  from its other leaders.
- The day exclusions tab keeps its own subject: a cutoff-derived row is not a
  `LeaderDayExclusion`, so it is kept out of both of that tab's day views (a
  «Qaytarish» there would find nothing to lift) and **counted and named**
  instead; its «Topshirilmagan» list skips days past a leader's cutoff, which
  would otherwise bury the days that matter under hundreds that already cost
  nobody anything.

**A KEY is cut only when every person the register merges into it is cut, and
then from the LAST of their floors** (`name_people` / `unit_filers` in
`routers/leaders.py`). Both halves were bought by getting them wrong first, and
both mistakes had the same shape — a denominator shrinking on the strength of a
decision about somebody else:

- `slotsBy` groups leaders by the NAME printed on the row, and `RoleProfile`
  enforces name uniqueness per UNIT, not per platform. Keying `cutoffs` off the
  cutoff record meant cutting X shrank the row X shares with an uncut namesake
  Y, so Y's missed days left the average. It is now keyed off the census of
  people the register actually groups under that name, all of whom must be cut.
- `cutUnits` read the unit's ROSTER, and ~18% of the register's leader names
  never resolve to a profile at all — a leader who cannot be cut is also a
  leader the roster cannot see. So a unit was declared gone while an unlinked
  leader went on working in it. It now also asks `unit_filers`: everybody whose
  LAST row falls on or after the roster's floor must be cut too, and their
  floors raise the unit's. Only people still filing AT the floor are asked
  about, so somebody who left years ago cannot block a decision about today —
  and the check is self-closing, since every row on or after the final floor
  then belongs to somebody already cut by then.
- The floor is the LAST, never the first: between an earlier and a later floor
  the key still has an active person filing under it.
- **`name_people` must see BOTH collection layers.** It was built from the sheet
  alone while the client groups leaders over the MERGED feed — so it missed
  every leader who files only in the bot, which on **shift 2 is all of them**:
  no `cutoffs` entry was written for them at all, and the load-bearing half
  never travelled. Their filed days were still stamped row by row, so the bug
  read as "the cutoff half works" while every UNFILED day went on counting —
  exactly the thing a cutoff exists to stop. Bot identities are folded in from
  `LeaderTaskDay` (a bot row is labelled `prof.name`, the same key). The unit
  census needs no such fold: a bot day is keyed by leader PROFILE, so everybody
  who can file one is already on that unit's roster.
- `cutUnits` is computed **per unit, then grouped per LABEL**. A sheet row
  carries its own `_relabel(...)` spelling and only a BOT row adopts the
  majority, so a unit the form collected under two names is genuinely two
  standings keys and a cutoff written against `sup_display`'s majority alone
  left the others counting. And because two units can answer to one label (the
  `Manager.name` fallback carries no unique constraint), a label is cut only
  when EVERY unit under it is — the same "everybody merged into this key" rule,
  in the currency units are grouped by.
- A row naming **nobody** is nobody: it is kept out of `unit_filers`, or it
  would make its unit permanently un-cuttable for a reason nothing on screen
  could explain.
- **Both censuses are built over the UNSCOPED rows**, which is why `lead_match`
  is hoisted above the supervisor scoping (`sup_display` already was, for the
  same reason). Whether a key is cut in full is a fact about the key, not about
  who is looking: a leader viewer holds only their own rows, so a census taken
  after the scoping would report their whole unit gone on the strength of the
  one leader in it they can see. `leader_match` resolves each (name, unit) pair
  independently, so widening its input cannot change any single answer.
- The two maps are then **scoped to the keys the viewer's own rows carry**. A
  cutoff only ever applies to a standings key, and the client builds those keys
  from the rows in the payload — so a key the payload lacks can move no number
  and is a name the viewer must not be handed.

**One known limit remains, inherited from how the register groups people:**

- **An unlinked sheet spelling cannot be cut.** The tab writes from the ROSTER,
  so every cutoff an admin can create is profile-keyed. A sheet row whose
  spelling `leader_match` never resolved is already a SEPARATE person to the
  register (it groups under its raw spelling, not under the profile's name), so
  the cutoff correctly does not reach it — but there is no way to cut that
  entity either. It can only ever make the two censuses above REFUSE to cut a
  merged key, never wrongly cut one. The `n<folded name>` key exists and every
  reader tries it, so a writer for it is a UI question, not a model change.

## A ПЛАН belongs to ONE catalog line (`pp_line_daily`)

From **2026-09-03** a hand-typed ПЛАН or ФАКТ on `/production` belongs to the
**catalog line** it was typed on, not to every line that shares its SAP code.

`pp_products` is documented as "one row per (brigadir, SAP code, work center,
operation)" — the same SAP code at one Команда appears several times, each a
distinct operation with its own Трудоемкость. `pp_daily` was keyed one level
coarser, by (brigadir, date, SAP code, work centre), so those lines were not
merely linked: **they were the same database row**. Typing 17 on one moved every
other line in the group. **118 groups hold 313 of the platform's 2,158 lines**,
so this was ~15% of the catalog, not an edge case.

- **`pp_line_daily` is an OVERLAY, and that is the whole safety argument.**
  `pp_daily` is untouched — no new column, no widened key, no data migration and
  no re-ingest, so nothing that already worked could be re-keyed into silence. A
  line resolves its quantity in three steps, and the last two are exactly what
  the platform already answered: **its own override → the group's legacy shared
  override (`pp_daily.*_override`) → the SAP snapshot (`pp_daily.*_qty`)**. The
  fallback is TOTAL: no combination of catalog state and stored rows resolves to
  "nothing", which is the one answer a quantity must never have. A unit that
  never touches the feature reads byte-for-byte what it read before.
- **`pp_calc.line_keys` is THE identity of a line, and it is CONTENT, not a
  position.** A PPProduct id cannot be used — `import_catalog` DELETES and
  re-creates every row, so ids do not survive — and a RANK cannot either, which
  is the trap v4.31.1 fell into for the few minutes it was live. Insert one
  operation into the middle of a group in the ABC sheet, delete one, or retype a
  line's SAP code, and every rank below it shifts: a quantity typed for «Замес»
  silently becomes «Выпечка»'s number, on every historical date at once. **A
  wrong number on the wrong operation is worse than no number.** So the key is
  the line's own name and Трудоемкость (`name|labor#n`), which travel with it
  wherever the sheet moves it. The `#n` suffix separates lines identical in
  BOTH — 3 of the 118 groups — which is the smallest set position can be left
  responsible for. Editing a line's name or its Трудоемкость re-points what it
  tracks, the caveat `daily_key` already carries for renaming a code-less line;
  the value is not moved to a neighbour, it is simply no longer found, and the
  line falls back to the group's figure — a visible revert, never a silent lie.
- **`pp_calc.line_minutes` is the second reader and exists so the rule has ONE
  spelling.** `/zagruzka-cell` sums **Σ over lines of labor·qty**, never
  (Σ labor)×one quantity — two operations may now carry two quantities, so the
  product cannot be factored out. Two spellings is how that page and the
  Positions table start reporting different minutes for one day.
- **The first per-line write EXPLODES the group's shared override onto every
  line, then clears it.** Without that step the edited line would show its new
  number while its neighbours silently fell back to the SAP figure — a reader
  would watch a number they never touched change on a row they never edited.
  Exploding first means every line keeps precisely what it was already showing,
  and only the edited one moves.
- **A caller that names no line sets EVERY line of the group** (`_set_whole_group`),
  and that is the only correct answer. A browser tab older than v4.32.0 knows
  nothing about lines, and writing `pp_daily.*_override` for it — the obvious
  reading of "keep the legacy path" — is silently wrong in BOTH directions,
  because the reader resolves per-line FIRST: on a line that already carries its
  own value the write is invisible, so the operator types a number, gets a 200
  and watches the cell spring back; and on the lines that do not, it lands on
  rows they never edited, which is the very bug this exists to remove. Writing
  every line reproduces exactly what such a tab means and expects to see — one
  figure for this position — and the shared level is cleared with it, so one
  level answers. This is what keeps the change MINOR rather than MAJOR.
- **A line the group does not have is a 400, never a silent insert.** `line_key`
  arrives over the wire; storing a row no reader can look up is the "control
  that reports success and writes nowhere" failure, which is the worst thing
  this endpoint could do. A `line_no` from a v4.31.1 tab is resolved through the
  catalog into a key rather than refused, so such a tab keeps editing the line
  it is pointing at.
- **Every first edit of a line on a day is an INSERT, so the write RETRIES once
  on `IntegrityError`.** ПЛАН and ФАКТ saved in one breath, or a re-send after a
  dropped connection, both miss the SELECT and both insert `uq_pp_line_daily_key`;
  the loser escaped as a 500 and the operator watched their number spring back
  out of the cell for no stated reason. Re-reading the winner's row is the answer
  `leader_tasks._sup_row` already gives to the same race.
- `startup.migrate_pp_line_daily_key` converted the ranks v4.31.1 stored into
  keys, in Python and losslessly, because a rank only means anything against the
  catalog it was written under. A row whose rank no longer existed was DELETED
  rather than guessed at. Changing what it does needs a NEW flag key.
- **A SAP upload resets a per-line value exactly as it resets a shared one** —
  mode `both` deletes the date's overlay rows with the snapshot, `plan`/`actual`
  null that one field for the keys the file restated. The closed-day lock
  (`idle_lock.require_open`) and the leader work-centre scope guard both write
  paths, unchanged.
- The cell says so before it is typed in: `plan_shared` / `actual_shared` +
  `group_size` ride on every row and the ПЛАН/ФАКТ cell carries
  `production.qty.shared` — «shared by N lines of this SAP code» — which goes
  the moment the line has a value of its own.

### What one day's SAP file actually says (`pp_calc.faza_quantities`)

From **2026-09-03** (v4.33.0) the фаза fold is ONE function, and both figures are
folded **per ORDER** before they reach a (SKU, work centre) bucket. Before it,
the ingest added the order-level «Поставлено» once per фаза ROW and summed
«Кол-во операции» across operations that were the same units passing through
sequential steps, so a position whose order touched one Команда twice was
inflated on both sides.

- **ФАКТ is counted ONCE per order per work centre.** «Поставлено» is an
  order-header field; multiplying it by an order's operation count is
  indefensible under any reading. Verified on 2026-08-28: order 1743544
  delivered 102 and was stored as 204, 1743551 delivered 714 and was stored as
  1428.
- **ПЛАН collapses only where the operations PROVE they are the same units.**
  All the operations of one order at one work centre carrying the SAME quantity
  count once — on 2026-08-28 that held for 31 of the 58 multi-operation groups,
  and in **all 31** that single quantity equals the order's own «Кол-во заказа»
  while their sum never does. S00001104 at A2733 is the case that started this:
  op 0020 «Замес» 120 and op 0040 «# ПФ Эклер» 120 are one batch of 120 eclairs
  mixed and then finished, stored as 240.
- **Where the quantities DIFFER the sum is kept, unchanged, and that is
  deliberate.** Those 27 groups are one batch measured in two units — «ПФ Чизкейк
  песочка» 21000 (grams of dough) beside «# ПФ Чизкейк» 840 (cheesecakes) — and
  in none of them does the sum or any single operation match the order quantity.
  No scalar can describe them; only attributing each operation to its own catalog
  line can, and no line on the platform names its operation yet. **Never make
  this function guess** — substituting a different wrong number for the existing
  one is worse than leaving a known one in place.
- **Consequence to know: past ПЛАН and ФАКТ moved.** These are STORED numbers, so
  unlike a derived figure they do not re-read themselves, and
  `startup.backfill_pp_actual_from_deliv` had written the same defect into
  history. `startup.correct_pp_double_counted_days` (flag
  `pp_faza_per_order_fold_2026_09_03_v1` — changing it needs a NEW key) replays
  every stored date through the same function: **435 ПЛАН and 580 ФАКТ figures
  across 48 days**, all downward bar one float-representation no-op, out of
  38,514 rows. It never touches a `*_override` (the operator's own numbers), and
  never creates or deletes a row, so a day's set of positions is exactly what it
  was.

## Who a SAP upload fills (`/admin/upload?tab=production`)

From **2026-08-31** the plant-wide фаза/заголовок export no longer reaches every
brigadir. `PPManagerSetting.auto_fill` is the standing switch, per SUPERVISOR,
edited on the «SAP avto-to'ldirish» register at the top of the Production admin
destination; an upload may still name its own targets for one file.

- **Why it exists:** the SAP export is ONE file for the plant and used to fan out
  to every configured brigadir. In mode «Reja + Fakt» `_ingest_for_manager`
  DELETES the date's `pp_daily` rows and clears `plan_override` /
  `actual_override`, so a unit whose ПЛАН/ФАКТ is kept by hand had its figures
  wiped by somebody else's upload, with nothing on screen saying it had
  happened.
- **`_autofill_manager_ids` is THE set an upload reaches when it names nobody** —
  configured MINUS switched off. **Configured is the load-bearing half and must
  never be dropped**: `_ingest_for_manager` scopes by the unit's own work centers
  and catalog SKUs and both filters FALL THROUGH when the unit has neither, so an
  unconfigured unit would be written the ENTIRE plant file. The explicit
  `manager_ids` path re-checks it for the same reason and answers 400.
- **Absent row = ON.** Nothing moved when this shipped; every unit goes on being
  auto-filled until an admin switches one off. `_autofill_off_ids` is the whole of
  what the register says — never invert it into an "on" list, or a unit created
  later starts life excluded.
- **It is a DEFAULT, not a lock.** `manager_ids` (repeated form field) on
  `POST /admin/production/upload` is the per-upload override and reaches a
  switched-off unit deliberately — that is how a manual unit is filled from a
  file when somebody wants it to be. The client sends NOTHING when it is
  following the register, so the backend stays the one place that resolves the
  set; the picker warns, by name, when a «Qo'lda» unit is among the ticks.
  Legacy single `manager_id` still wins over it.
- **The catalog import is the SECOND door and it carries the same rule.**
  `_backfill_manager` writes exactly what the fan-out writes — every stored date
  replaced, every override cleared — so honouring the flag on the upload and
  ignoring it there would wipe a manual unit's figures the next time anybody
  re-imported its catalog. It returns `skipped`, `import_catalog` publishes
  `backfill_skipped`, and the card SAYS so: a silent absence of «N days
  recalculated» reads as "there was nothing to recalculate".
- **Switching a unit either way writes NOTHING to `pp_daily`.** Off leaves its
  existing rows and overrides exactly as they are; on does not backfill — a file
  naming that unit is what fills it. `PUT /admin/production/autofill` takes a
  LIST, so a row toggle and a bulk press are one writer and one transaction,
  never parallel inserts racing the unique key.
- Admin-only, like every other `/admin/production/*` endpoint (`_verify_admin`),
  and the register lists only CONFIGURED units — so it is also the list the
  upload's target picker is built from, and the two can never disagree about who
  exists.
- **The default is THREE units** (the operator's call, 2026-08-31): Suvonov
  Elshod OF, Aripova Manzura and Talipova Mamura are auto-filled, everybody else
  is manual. `startup.seed_pp_autofill_default` (flag
  `pp_autofill_default_2026_08_31_v1`) writes it once — **changing the three
  needs a NEW flag key**, or the old "already ran" mark makes it a no-op on every
  box that has booted once. It states an END state rather than declining when the
  register already holds rows; the flag is what protects every LATER admin edit.
  Matching is by NAME (the ids in `startup.MANAGERS` are a stale seed and no
  longer describe production), exact first, then a both-ways prefix accepted only
  when exactly one unit matches. **All three must resolve or NOTHING is written
  and no flag is set** — switching everyone off while failing to switch the three
  on leaves the next upload with nobody to write to; the roster is printed so the
  fix is one corrected string. It writes config only: no `pp_daily` row, override
  or catalog is touched, so it moves no number by itself.
  Every non-archived unit is switched off, not only the CONFIGURED ones, so a
  brigadir given a catalog later starts manual too — a unit CREATED afterwards is
  on, since an absent row still reads as ON.

## A closed day shuts the «Zagruzka fayli» page too

From **2026-09-01** the day-close a supervisor presses on «Verifix to'g'irlash»
(`/staff`) locks `/production` for that (unit, date), exactly as it already
locked `/idle-cell`. Before this the two pages disagreed about the same closing:
ojidaniya was frozen while ПЛАН/ФАКТ, the staffing pins and the reconciliation
block stayed editable — so a number the unit had signed off on could still be
rewritten afterwards, by anyone, with nothing on screen saying the day was shut.

- **`services/idle_lock.py` is THE lock and it is UNCHANGED.** The page reads
  the existing ladder (`services/day_state.day_state`) through that one module
  rather than inventing a production closing of its own — the same reasoning
  the idle-cell lock was built on. A second switch would let the two disagree,
  and there is no way to render "the day is closed but also open". The name is
  now a misnomer (it serves two pages, not one); the module is not renamed
  because every consumer would have to move at once for a cosmetic gain.
- **All four per-day writers are guarded**: `override` (ПЛАН/ФАКТ),
  `wc-override`, `staffing`, `reconciliation`. The catalog endpoints are
  deliberately NOT — a catalog is configuration for every date, not a fact about
  this one, so a closed day must not lock it.
- **Closed is closed for admins too.** `wc-override` is admin-only and is still
  refused; an admin re-opens the day first, exactly as they do for ojidaniya.
  One ladder means one way back, and `POST /api/staff/approvals/reopen` is it —
  the SAME endpoint `/idle-cell` calls, never a second re-opening.
- **The dashboard publishes the lock** (`day` on `/api/production/dashboard`,
  from `idle_lock.day_info`), so the page states it ONCE at the top instead of
  leaving the reader to notice that saving stopped working. Banner, wording and
  the re-open button mirror `/idle-cell`, because it is the same act — only the
  hint line differs, since «kutishlar faqat ko'rish uchun» is the wrong sentence
  on a page that is not about waiting. A missing `day` reads as OPEN, so the
  page can only ever fail toward the behaviour it always had.
- **The affordances go, not just the saves.** `QtyCell` gains `readOnly`: on a
  closed day it renders an ordinary cell — no grid coordinates, no `cursor: cell`,
  no hover pencil, no tab stop. Leaving a spreadsheet editor over a cell whose
  save the API refuses teaches the operator that editing here silently does
  nothing.
- **A refusal is still possible and is SAID.** The page can be open when somebody
  else closes the day, and a spreadsheet cell commits on blur — so all three
  mutations carry `onError`, and `writeErr` (a twin of IdleCell's `errText`)
  reads the code off **`detail_raw`**: `utils/api.js` flattens every non-string
  `detail` to text and keeps the original there, so reading `detail` alone finds
  a JSON blob where the code should be. On `day_closed` it refetches, so the
  banner appears and the cells go read-only under the operator's hands.

## The action register (`/admin/upload?tab=logs`)

From **2026-08-23** every change on the platform lands in ONE append-only table,
`action_logs`, read on the admin «Jurnal» destination. Six partial trails existed
before it — `capability_uses` (grant-authorised actions only, and it returns
early for admins), `capability_audit`, `hr_document_history`,
`leader_task_config_audit`, `concern_escalations`, and the `user_activity`
heartbeat that says a person was in the app and nothing about what they touched.
Between them an admin uploading attendance, closing a day, deleting a profile,
restoring the database or revealing a browser password left **no queryable trace
anywhere**. All six survive unchanged beside this one; nothing was retired.

- **`services/action_log.py` is THE definition** — the writer, the middleware and
  the route table. Two writers, deliberately:
  `ActionLogMiddleware` records an AUTOMATIC row for every POST/PUT/PATCH/DELETE
  under `/api` and `/admin` (actor, category, action, outcome, duration), so a
  new endpoint is covered the moment it exists — the discipline `capability_uses`
  lacked; and `enrich()`, called INSIDE a handler, fills the SAME row with what
  only the handler knows (unit name, business day, old→new, the operator's
  reason). One request is always exactly one line. `enriched` marks the rows that
  got the second treatment, so **a thin row is never displayed as a rich one**.
  `enrich()` never raises and is a **no-op outside a recorded request** — call it
  unconditionally. Its ARGUMENT expressions are not protected, so never build one
  from an instance a commit or delete has already expired.
- **`ROUTES` is THE list** — (method, path) → (category, action) for all 189
  mutating routes, first-match-wins so **specific must precede generic** (the
  three `/api/profiles/admin/cells/*` routes sit in the identity block for
  exactly this reason). An unmatched route still gets a row, under «other», AND
  is named at boot by `report_unclassified_routes(app)`: one list stays complete
  only if the app says out loud when something falls out of it. Five telemetry
  paths are excluded on purpose (activity ping, ui-prefs, boot/crash report,
  `/bot/webhook` — the envelope, whose handlers record themselves).
- **Bot taps and jobs use the direct door.** `record_bot()` = a PERSON acted in
  Telegram (day close, task close, approvals, registration, the broadcast
  composer); `record_system()` = a scheduled job did (the 09:00 auto-close, the
  AI drain, report sends, syncs). A job writes **one row per pass, never one per
  item**, and nothing on a tick where nothing happened.
- **14 categories**, in rail order: attendance · documents · identity · sessions
  · org · leader_config · leader_review · shopfloor · collab · comms ·
  sync_export · config · danger · other.
- **Keys, never sentences.** `category` and `action` are keys; the tab renders
  them through `logs.*` in all four languages, and an untranslated key is
  prettified rather than printed raw. Names of people, units and targets ARE
  snapshotted — a rename must not rewrite what the log says happened.
- **Never a second place a secret is readable.** The Gemini key records its
  LENGTH; `/admin/settings` masks any key naming a key/token/secret/password;
  the web-login block records the username and the event, never the password —
  including on `reveal`, which is itself an event worth a row. The register rides
  in every `db-dump`, so anything unbounded (a name list, a file body) belongs as
  a COUNT.
- **`ip` comes from `cf-connecting-ip` → `x-real-ip` → the ASGI peer, never
  `X-Forwarded-For[0]`** — nginx APPENDS the real peer to whatever the client
  sent, so element 0 is the caller's own text and the one field meant to place a
  person would be written by that person. Truncated to 64 chars.
- **Ghost Mode is recorded, not obeyed** (a column). A flag that rides the
  request must never let the audited request silence its own audit — the rule
  `capability_alerts` already states.
- **Append-only, forever.** No delete route, no purge tool, no retention job. At
  a few hundred changes a day that is ~100k rows a year. A `db-restore` replaces
  the table like any other and writes one row describing itself.
- Admin-only and NOT grantable: no capability exists for it, so
  `capTabs.includes(capKey ?? id)` can never admit a grantee — the `permissions`
  model. Every endpoint in `routers/logs.py` carries `verify_admin` — the undo
  door especially, whose reach is the union of everything it can reverse, so one
  capability for it would be a capability for all of them at once.

### Taking one action back (the Undo button)

From **2026-08-24** an expanded row can be REVERSED — `POST
/api/admin/logs/{id}/undo`, the undo bar at the foot of the detail panel. It is
the only write on the tab.

- **`services/action_undo.py` is THE definition** of what an undo can reach.
  A `Plan` per action key (`check` + `run`); adding a fifth is one entry, not a
  new mechanism. Never re-derive "is this undoable" at a call site — least of
  all in the browser, where the copy on screen would be the wrong half of a
  disagreement.
- **The register stays append-only.** An undo is a NEW action that happens to be
  the inverse of an old one, recorded under the INVERSE action's own key (undoing
  a day-close IS a re-open, filed under Attendance) and linked by the indexed
  `action_logs.undo_of` column. Nothing edits the row it reverses; nothing is
  deleted, ever. `undone_map` filters on `outcome == "done"` — a REFUSED attempt
  carries `undo_of` too (the row is re-badged before the check runs, so a
  refusal says what it tried to reverse), and counting it would lock a row out
  because an earlier attempt FAILED. **An undo cannot itself be undone**: a
  longer chain turns "already undone" from a fact into a parity question.
- **The rule that makes it safe: the world must still be as the action left it.**
  Every `check` verifies the CURRENT state still equals what the row recorded as
  its result and refuses `changed_since` otherwise. That one rule stops an undo
  clobbering somebody's later edit, makes a double-tap harmless (the register is
  written by a background thread, so the `already_undone` marker lands a beat
  late and can never be the only guard), and needs no locks.
- **Only what the register PROVES it can put back.** A log row is not a
  snapshot. Four actions qualify today: `attendance.day_closed` ↔
  `attendance.day_reopened` (unit + date, and it notifies the unit exactly as the
  ordinary endpoints do), `config.settings_saved` and `config.translation_saved`
  (each value back to its recorded old one). A cascading delete — a profile
  taking its bindings, entries, photos and verdicts with it — is gone, and the
  panel says so rather than offering a button that cannot work. Two refusals
  exist precisely because the row is honest about its own limits: `masked` (the
  old value was a secret and `/admin/settings` stored `•••`, so restoring it
  would set the literal mask as the API key) and `capped` (a >50-string
  translation save records only the first 50, and half an undo is not one).
  **Never add a LOSSY reverser** — `task.status_changed` looks trivial and is
  not, because leaving «done» re-queues the task at the BACK of the leader's
  priority list; an undo would restore the status and silently lose the position.
- **The bar renders on EVERY row, in one of three states** — offer, refusal
  (`logs.undo.why.*`, in all four languages), or "taken back by X, N ago". A
  control that appeared only when it worked would leave the reader of a
  profile-deletion unable to tell whether the platform forgot the button or the
  action genuinely cannot be reversed. Failures land INSIDE the `ConfirmDialog`
  and leave it standing: `changed_since` is the message the operator must read
  before deciding what to do instead.
- Reading it: the CATEGORY RAIL is the spine, not a filter — its counts are
  computed with every filter applied EXCEPT the category, because its job is
  telling the reader where the rest of the activity is. **Table COLUMNS follow
  the selected category** (one `COLUMNS` map + one per-key `cell()` switch); a
  row expands IN PLACE, never into a modal, because the reader is scanning a
  sequence. New rows never arrive under the reader's hands — they wait behind a
  «N new» button. Colour on this page means STATUS only: the four outcomes own
  the traffic light and the categories are separated by ICON, so a category chip
  can never be mistaken for a verdict.

## Browser login (the second door)

The app has two front doors into the **same** session. Telegram is the first:
`initData` proves the caller sits in a real WebView and `app/security.py`
re-verifies it on every request. The second is a username + password at
`production.safiacorporate.uz`, for people at a desk.

- **The credential belongs to the PROFILE**, keyed by `identity.profile_key`
  (`web_credentials` table). Several Telegram accounts holding one profile share
  one login, exactly as they share everything else that profile owns.
- **A browser session is not a different identity.** `web_auth.session_identity()`
  resolves the profile to the very same `(telegram_id, role, role_id, role_ref)`
  tuple a Telegram login produces, so page grants, capabilities, factory locks
  and ownership behave identically — nothing to keep in sync. The one difference:
  `roles: []`, because the role-switcher would move the session to a profile the
  password was never issued for.
- **`security.py` accepts exactly ONE thing besides initData**: a JWT carrying
  `web: True`. A Telegram-issued token still cannot be replayed from a browser.
  Because that token is the whole proof, it is checked against the DB on every
  request — a disabled login or a bumped `token_version` dies immediately.
- **A browser can hold SEVERAL sessions at once** — the profile wallet
  (`utils/profileWallet.js`). The header menu's «Yangi profil qo'shish» asks for
  another profile's username + password (Telegram still deep-links the bot's
  register flow), and that profile joins the menu beside the current one instead
  of replacing it; tapping a row swaps the active token, no password. Only the
  JWT is stored, never the password, and each row keeps its OWN «remember me»:
  ticked → localStorage, unticked → sessionStorage, mirroring `session.js` so a
  colleague added for one shift is gone when the tab closes. A switch VALIDATES
  the stored token against `/api/auth/web/session` before committing and puts the
  old one back if it is dead (expired, `token_version` bumped), then re-asks that
  profile's password — a row is never silently dropped. «Chiqish» signs out of
  the ACTIVE profile only and falls back to the next row; the login screen is
  only for the last one. Switching always does a full page load: per-page
  filters, scroll and fetched rows belong to the profile being left.
- **`token_version` is the revocation handle.** Bump it to end every browser
  session for a profile (password change, reset, disable, rename, admin
  "sign out everywhere"). Telegram sessions never carry it.
- Passwords are PBKDF2-HMAC-SHA256 from the stdlib (`web_auth.hash_password`) —
  deliberately no native dependency on a pipeline that deploys straight to prod.
  5 failed attempts → 15-minute lockout, DB-backed; the per-IP throttle is
  in-process and deliberately secondary.
- **A new password is DELIVERED only to Telegram.** `web_auth.dm_credentials()`
  DMs every holder of the profile, and no create/reset/bulk response carries it
  back. A profile with no approved holder therefore gets no login — the admin UI
  says so rather than offering one that could not be delivered.
- **An admin can READ an existing password back** on the profile page — the
  «Sayt logini» card shows the login and the password, both copyable, the
  password masked until the eye is tapped. This needs the password to be
  recoverable, so `WebCredential` carries `password_enc` beside the hash: the
  same secret sealed with `web_auth.seal_password` (HMAC-SHA256 encrypt-then-MAC,
  stdlib only, key derived from `SECRET_KEY` — which lives in `backend/.env` and
  never in the DB, so a dbdump `.sql.gz` is ciphertext). `web_auth.set_password`
  is THE writer: it sets hash + sealed copy + `password_set_at` together, and
  every path that changes a password (admin create/reset/bulk, self-change,
  «forgot password») goes through it — a writer that sets only the hash makes
  the panel show a password that no longer logs in. Rows predating the column
  read as «unknown»; nothing is ever guessed.
  `POST /api/profiles/admin/web-login/reveal` returns it for ONE profile, is
  **admin-only** (narrower than the rest of the tab, which `admin.profiles.manage`
  grantees may run — every other action changes a login and is therefore visible
  to its owner; reading one is not), and is audited under `WEB-LOGIN revealed`.
  Never add the password to `/admin/list` or any other bulk payload.
- Admin surface: the **Profiles tab** (`pages/admin/WebLoginModal.jsx`) — a
  «Sayt logini» column plus one row action for create / reset / rename /
  disable / sign-out-everywhere / delete, and a bulk «create for everyone
  without one» scoped to the rows currently visible. Usernames are derived as
  `surname.initial` (`aripova.m`), widening to `surname.firstname` then a numeric
  suffix. `_deny_admin_profile` still applies: a capability grantee may never
  mint a browser password for an ADMIN profile.
- Self-service: Settings → «Change password» (browser sessions only), and
  «Forgot password» on the login screen, which DMs a fresh password and always
  answers identically so it cannot be used as a membership oracle.
- Registration stays Telegram-only — it needs the bot to sign the profile claim.
  `/login` redirects to `/` outside Telegram.
- Audit: every change greps out of `backend/logs/app.log` under `WEB-LOGIN`
  (sign-in, self-reset, self-change, and each admin action with actor + target).
  Passwords never appear in it.
- **Excel exports now branch on the surface**: a browser session downloads the
  file, Telegram still DMs it. One decision point each side —
  `app/xlsx_delivery.py` and `utils/exportXlsx.js` — never re-derived per page.
  This supersedes the older "exports always go to the chat" rule for browsers.
- Telegram-only chrome (expand, fullscreen, safe-area insets) is gated on
  `utils/session.js` `inTelegram()`, which tests `WebApp.platform !== "unknown"`
  — `window.Telegram.WebApp` exists in every browser and proves nothing.

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

## Workflow

### The standing rule for EVERY change (mandatory, in this order)

Every task that touches shipped code runs these six steps, in this exact order.
No step is optional and none is reordered. This is the operator's standing
directive (2026-08-31) and it applies to all future changes.

1. **Verify local and production agree — BEFORE editing anything.** `git fetch`
   the deploy remote and compare `main` against it. More than one person works
   on this repo, and an edit made on a stale tree becomes a merge conflict at
   push time, i.e. at deploy time.
2. **Pull.** Fast-forward ONLY (`git pull --ff-only`). Never merge, never
   rebase automatically. A diverged branch or a dirty tree stops the work and is
   reported — the `auto-pull.sh` rule, applied by hand.
3. **Make the change** the user asked for, and only that.
4. **Bump `VERSION` by SCOPE** — patch / minor / major per the Versioning table
   below, judged from what the change DOES, never from how large the diff is.
   One turn = at most one bump.
5. **Build the frontend** — `cd frontend && npx vite build`. A failed build
   STOPS here: nothing is committed and nothing is pushed.
6. **Commit and push to the deploy remote.** That push IS the production
   deploy — there is no staging step and no review window.

**The deploy remote is identified by its URL, not by its name** —
`git.safiabakery.uz/Safia-Outsource/production`. In this checkout it is called
`origin`, and no GitHub mirror remote is configured; resolve it with
`git remote -v` rather than assuming a name.

**Steps 1–2 and 4–6 are automated by the two hooks below ONLY when those hooks
are registered in `.claude/settings.local.json`.** Having
`.claude/hooks/*.sh` on disk is not the same as having them wired: the scripts
are committed, the registration is gitignored, so a fresh checkout has the files
and none of the automation. **Check for a `hooks` block before assuming the loop
ran** — when it is absent (a cloud session, a fresh clone, a hook that did not
fire), perform all six steps by hand. The rule is the ORDER, not the mechanism.

- **gitea is THE remote** — `git.safiabakery.uz/Safia-Outsource/production` (private). `main` tracks it, so a bare `git pull` / `git push` means gitea. **Its local NAME varies by checkout** — it is `gitea` where a GitHub mirror is also configured and `origin` where it is the only remote (this checkout), so read `git remote -v` instead of hard-coding a name. Where a GitHub mirror exists it is a mirror ONLY: pushed last, best-effort, never gated on.
- **Pushing to `main` deploys to production.** `.gitea/workflows/deploy.yaml` runs `deploy/deploy.sh` on the VPS on every push — see the Deployment section below.
- **The whole loop is automated by two hooks in `.claude/settings.local.json`: pull → edit → build → commit → push.**
  - `SessionStart` → `.claude/hooks/auto-pull.sh` fetches gitea and **fast-forwards `main`** before anything is edited. It never merges or rebases: on a diverged branch, or when uncommitted work blocks the fast-forward, it reports and leaves the tree untouched. Log: `.claude/auto-pull.log`.
  - `Stop` → `.claude/hooks/auto-commit.sh` bumps `VERSION` (patch, unless the turn already set it — see Versioning), runs the Vite build, commits everything with a generated message, then pushes **gitea first** (that is the deploy) and the GitHub mirror after. A failed build aborts the commit; a failed mirror push is cosmetic and says so; a failed *gitea* push says `NOT deployed`. Log: `.claude/auto-commit.log`.
  - Net effect: **one turn = one commit = one production deploy**, with no staging step and no review window. Verify a doubtful build by hand with `cd frontend && npx vite build`.
  - The pull only runs at session start. If `main` moves on gitea mid-session the push at turn end is *rejected*, not silently merged — you will see `PUSH FAILED` in the summary; pull and re-run.
- `frontend/dist` is TRACKED and prod serves the SPA from it. Commit the build alongside the source — the pipeline rebuilds it for you if you forget, but committing it makes the deploy a no-restart, zero-downtime file swap.
- Backend changes need a service restart on prod (systemd `safia-production`, uvicorn — the cPanel/Passenger host is gone). The pipeline restarts automatically for `backend/**` and `bot/**`. Startup migrations still go in BOTH the FastAPI lifespan and `passenger_wsgi.py`, even though only the lifespan executes today.
- i18n: 4 languages (uz / uz_cyrl / ru / en). Static UI text via `t()` keys added to all 4; DB text via `tl()` transliteration.

## Cloud sessions (claude.ai/code)

A cloud session is a fresh Ubuntu 24.04 VM holding a checkout of this repo and
nothing else the project keeps outside git — no `backend/.env`, no
`.claude/launch.json`, no venv, no `node_modules`, no postgres running.
`scripts/cloud-setup.sh` rebuilds all of it and is THE definition of "the local
stack, in the cloud": one file, two callers, so the two moments cannot drift.

### gitea, not GitHub

The platform's BUILT-IN clone and pull-request path is GitHub-only, and the docs
say so plainly: non-GitHub repositories "can be sent to cloud sessions as a local
bundle, but the session can't push results back to the remote". That restriction
is about the platform's own git plumbing — the credential proxy and the PR
button. `git.safiabakery.uz` is a public HTTPS host, so a session can still talk
to gitea directly once the environment allows the domain and holds a token, and
`setup_git` in the script is that wiring: it names the `gitea` remote (a bundle
arrives with none, a mirror-cloned session arrives with `origin`), sets a
credential, fetches, and fast-forwards **only** — the `auto-pull.sh` rule, for
the same reason.

Two ways to start a session; both end up working against gitea:

1. **Bundle — no GitHub anywhere.** `CCR_FORCE_BUNDLE=1 claude --cloud "<task>"`
   from this checkout uploads the full history across all branches plus
   uncommitted changes to **tracked** files (untracked files are NOT included —
   `git add` them first; the bundle must stay under 100 MB). There is no
   terminal here to type that in, so **ask this session to run it**.
2. **The web picker, with the mirror as a delivery van.** Start from the GitHub
   mirror at claude.ai/code and let `setup_git` fast-forward the checkout off
   gitea. Only sound while the mirror is current — the Stop hook pushes it
   best-effort and never gates on it. **Never open the PR on GitHub**: nobody
   reads that repo. The PR belongs in Gitea.

**Without a `GITEA_TOKEN` the checkout is offline** — the stack still runs, but
there is no fetch, no push, and no way home except the session's own diff view.
The token is what makes a gitea cloud session usable, and it is also the whole
security question, below.

### The three values to paste, once

claude.ai/code → the cloud icon above the message box → **Add cloud environment**:

- **Network access**: `Custom`, with `git.safiabakery.uz` in **Allowed domains**
  (add `*.frame.claudeusercontent.com` if the session should read artifacts) and
  **Also include default list of common package managers** CHECKED — the
  provisioning needs npm, PyPI and `storage.googleapis.com` (headless Chrome).
  Plain `Trusted` cannot reach gitea; `None` cannot install anything.
- **Environment variables**: `GITEA_TOKEN=<token>`, optionally
  `GITEA_USER=<login>` (defaults to `claude-cloud`) and `GITEA_REMOTE_URL=`.
  This panel is readable by anyone who can use the environment and there is no
  secrets store, so use a token minted for a **dedicated Gitea account with
  write access to this repo only**, never a personal one, and rotate it like any
  other deployed credential. Nothing else belongs here: every integration on
  this platform disables itself on a blank key.
- **Setup script**:

  ```bash
  #!/bin/bash
  S=$(find /home /workspace /root /repo -maxdepth 5 -path '*/scripts/cloud-setup.sh' 2>/dev/null | head -1)
  [ -n "$S" ] && bash "$S" provision
  exit 0
  ```

  It *finds* the clone instead of naming a path, because where the clone lands is
  not contracted anywhere.

**Environment variables are not visible to the Setup script** — a known platform
limitation — only to the session. That is why the credential is written by the
SessionStart hook and never by provisioning, and why `provision` never needs the
token.

### Why the work is split between provision and the hook

Anthropic snapshots the filesystem after the Setup script, and a snapshot keeps
files, never processes — and the repo itself is a fresh clone each session.

- **Setup script → `provision`**, once per environment, before Claude launches:
  postgres role + DB, the venv, `node_modules` (kept OUTSIDE the repo and
  symlinked in, precisely because the clone is replaced), Chrome, and one full
  backend boot **so `create_all` and every startup migration land in the
  snapshot**.
- **`.claude/settings.json` SessionStart hook → no args**, every session: start
  postgres, top the deps up (keyed on the two manifest hashes, so a snapshot
  older than a dependency bump heals itself and one that isn't costs nothing),
  write `backend/.env` + `.claude/launch.json`, wire gitea, re-install the
  `node_modules` symlink and the pre-push guard, start `uvicorn :8000` and
  `vite :5173`. A hard no-op unless `CLAUDE_CODE_REMOTE=true`, and it refuses to
  run on anything but Linux, so it cannot touch a laptop.
- **`.claude/settings.json` is committed on purpose** — a cloud session gets only
  what the repo carries — which needed a `!` line against the blanket `*.json`
  ignore. `.claude/settings.local.json` and `.claude/launch.json` stay ignored.
- **The backend is :8000 there, not :8001.** A fresh clone has no
  `frontend/.env.development.local`, so the UI goes through the vite `/api`
  proxy, whose target is 8000. `driver.mjs doctor` still prints the answer.

### main is refused, by construction

A push to `gitea/main` runs `.gitea/workflows/deploy.yaml` on the production box
— no staging step, no review window — so a cloud session must not be able to
make one. Three separate things keep it that way, and none of them is "remember
not to":

- The hook installs a `.git/hooks/pre-push` that refuses `refs/heads/main`. It
  lives in `.git/hooks`, which is never cloned, so it is per-session and can
  never leak to a laptop.
- **`.claude/settings.local.json` stays gitignored**, so the Stop hook — build,
  commit, push to gitea, *which is the deploy* — does not exist in a cloud
  session at all. Never commit that file to make the cloud "just like local".
  The automatic `VERSION` bump lives in that same hook, so a cloud branch bumps
  `VERSION` in the turn, by hand, sized per the table below.
- **Protect `main` in Gitea** (require a pull request) so the refusal is not the
  only line of defence. The hook stops the honest mistake; it is inside the
  sandbox, so it is not a security boundary.

A merge that carries no rebuilt `frontend/dist` still deploys correctly —
`deploy/deploy.sh` rebuilds on the box when frontend sources move without it.

### What still does not come along

- **Data.** The DB is EMPTY — schema, migrations and one `admins` row
  (`ADMIN_TELEGRAM_ID=1` → `startup.seed_admins`, which is what the `__dev__`
  login resolves to). Every page loads and renders its empty state; no page
  renders a number. The laptop's DB holds real attendance for
  **2026-05-08 → 2026-05-20** — the window `driver.mjs` names in
  `DATA_START`/`DATA_END` — so a KPI, chart or export change cannot be *verified*
  in a cloud session until something seeds it. A prod `.sql.gz` from the admin
  «Backup» tab would give exact parity and would also put every worker's name,
  Telegram id and sealed browser password on that VM: a decision, never a
  default. A synthetic seeder is the honest fix and does not exist yet.
- **Telegram, Sheets, Gemini, Notion, ARC.** No tokens, and none of those hosts
  is on the allowlist. The scheduled jobs still fire and log their failures
  there; expected, not a regression.

## Deployment

Push to `main` → `https://production.safiacorporate.uz` updates itself. No
manual step, no SSH.

- **Where**: `user@185.74.5.198`, code at `/var/www/production` (a checkout of
  this repo), systemd unit `safia-production` on `127.0.0.1:8030`, nginx in
  front. The Gitea act_runner runs ON that same host as the same user, so the
  job needs no SSH hop and carries no secrets; the checkout reads the repo with
  a read-only deploy key.
- **What it does** (`deploy/deploy.sh`): `backend/**`, `bot/**`, the unit file
  → restart · `requirements.txt` → pip install + restart · frontend sources
  with no rebuilt `frontend/dist` in the same commit → `npm ci` + Vite build ·
  `frontend/dist` alone → nothing but the checkout, and the new UI is live
  immediately.
- **If it goes wrong**: an unhealthy `/health` after restart rolls the checkout
  back to the previous commit, restarts, and fails the job. Watch a deploy in
  the repo's Actions tab, or `journalctl -u safia-production -f` on the box.
- **Never edit files directly on the server** — the next deploy hard-resets the
  checkout. Server-only state (`backend/.env`, the Google service-account key,
  the venv) is untracked and survives; everything else comes from git.
- Run a deploy by hand with `bash /var/www/production/deploy/deploy.sh`, or
  force a restart with `FORCE_RESTART=1 bash …` (also available as
  "Run workflow" in the Actions tab).
- Secrets never belong in the repo. `backend/.env` is provisioned on the server
  and stays untracked. `.gitignore` ignores `*.json` wholesale behind a short
  allow-list (`package.json`, the lockfile, tsconfig/jsconfig/eslint config), so
  if you add a file the app must read at runtime, check
  `git check-ignore -v <path>` before assuming it shipped.

## Versioning

The repo-root `VERSION` file is the ONE source of truth — `frontend/vite.config.js`
injects it into the bundle, `backend/app/version.py` reads it for
`FastAPI(version=…)` and `/api/version`. Never add a second one; `package.json`
stays `0.0.0` on purpose.

**Every change bumps `VERSION`, sized to its impact** (`MAJOR.MINOR.PATCH`), and
a bump RESETS every number to its right to 0 — `1.4.7` → patch `1.4.8` → minor
`1.5.0` → major `2.0.0`. What each level means here:

| Level | Bump for | Examples |
|---|---|---|
| **PATCH** `1.0.x` | Nothing new; something works better | bug fix, copy/translation fix, styling or spacing tweak, refactor with no visible change, docs |
| **MINOR** `1.x.0` | Something the user can now do, or a visible behaviour change — and **a tab already open on this MAJOR line keeps working** | new page/tab/admin destination, new endpoint or capability, a new column/filter/export, a template gaining a prop |
| **MAJOR** `x.0.0` | A bundle already open in somebody's hand STOPS working | a request or response shape an old bundle still sends or reads, a removed/renamed endpoint or field, a required param that used to be optional, auth/permission model change, a page removed or replaced. Rare — reserved. |

**The MAJOR row is written about open tabs, not about how large the change
felt, because that is the one level the platform ENFORCES** — see the floor
below. Every other judgement here is a label; this one has a consequence.

### The compatibility floor

`backend/app/version.py` derives `MIN_CLIENT = <MAJOR>.0.0` from the running
version and publishes it on every `/api` and `/admin` response
(`AppVersionMiddleware` in `main.py`) beside `X-App-Version`. The browser reads
both in the axios interceptor — `frontend/src/utils/compat.js`, THE definition
of "is this bundle still served" — and `useAppUpdate` turns the verdict into
`incompatible`.

This exists because a tab is the only API consumer this platform has and the
one thing nothing could see. A push to main deploys immediately, the app is
left open for whole shifts, and `UpdatePrompt` deliberately never reloads by
itself — so an old bundle talking to a new backend is the NORMAL case. Until
the server said so, nothing could tell "a few minutes behind" from "the server
no longer speaks your version", and the second one reached the user as a 422 on
a save or a column that rendered empty.

- **The floor is DERIVED and has no override.** That is what makes the rule
  enforceable rather than advisory: a bundle from an older MAJOR line is
  refused, every bundle in the current line is served, so a change that breaks
  an open tab **can only be expressed by bumping MAJOR**. A hand-set floor
  would let a MINOR quietly cut clients off — precisely the break nobody had to
  describe. Never add one.
- **It states a fact; it refuses nothing.** No request is blocked and nothing
  reloads on its own. A tab below the floor may still be holding an attendance
  draft or a half-typed comment, and only some endpoints break — throwing that
  away to deliver the news is worse than the staleness. The prompt escalates
  instead: `info` + dismissible for a merely newer build, `warning` + **no ×**
  once the bundle is unserved, because "later" is not an outcome that state has.
- **Fail open, always.** A client the server cannot place is SERVED, never
  refused — a dev bundle (`0.0.0`), a stripped checkout, a backend too old to
  send the header, a response the host's anti-bot layer mangled on the way
  through. A floor that refuses on a non-answer takes the platform down the day
  a proxy starts eating custom headers.
- The bot is not a client of this: it calls the backend in-process, from the
  same commit.

**PATCH is AUTOMATIC — never hand-bump one.** `.claude/hooks/auto-commit.sh`
bumps the patch digit on every commit it makes, before the build (Vite bakes
`VERSION` into the bundle, so a later bump would ship a bundle claiming the old
number). Nothing to remember, and no deploy can go out unversioned.

**MINOR and MAJOR are the judgement the hook cannot make — express one by
EDITING `VERSION` during the turn.** A `VERSION` already changed against `HEAD`
is left strictly alone by the hook, so your number is what ships. That is the
whole mechanism: edit it for a big change, ignore it for a small one. There is
no marker file and no flag.

- **One turn = one commit = one deploy = at most ONE bump.** Never per file.
- **Mixed turn → the highest level wins.** A feature plus three fixes is one
  MINOR, not a MINOR and three PATCHes — so edit `VERSION` once, to `x.(y+1).0`.
- **A turn that edits no shipped code doesn't bump** — the hook exits before the
  bump when the tree is clean, so questions and investigations cost nothing.
- The version leads the commit subject (`v1.2.0: Update Sidebar.jsx …`), which
  makes `git log --oneline` the release history. `VERSION` itself is excluded
  from the message generator's diff — it changes every commit and says nothing
  about what any one of them did.

### What the app can say about itself

The sidebar's «Versiya» dialog (`components/layout/VersionBadge.jsx`) answers
three separate questions plus the contract, and they are deliberately not one
number: **App** = the bundle this tab is running · **Deployed** = the bundle a
reload would give it · **Server** = the Python process, its checkout commit and
its boot time · **Serves clients from** = `min_client`, the floor. A commit
newer than the boot time means a backend change is still waiting on a restart —
a frontend-only deploy never triggers one.

- **A browser versions by the asset hash, not by this number.** Vite's
  content-hashed filenames plus `/assets/* immutable` and `index.html no-store`
  in `main.py` are the whole cache story; the version string is a human label
  and changes nothing about caching.
- **Update detection compares the BUILD STAMP, not the version.** Even with the
  bump rule above, the version is the wrong handle for "is there something
  newer": it is set by judgement and a rebuild can ship the same number twice,
  while the stamp is unique per build. `dist/build.json` is written by the build
  (and served **no-store**, same reason as `index.html`); `hooks/useAppUpdate.js`
  polls it every 5 min and on window focus, and `UpdatePrompt` in `Layout`
  offers a reload. **The version is the handle for the other question** — "am I
  still served" — which the stamp cannot answer at all, since a stamp has no
  order. Two questions, two mechanisms, one prompt.
- The reactive half stays `lazyWithReload` → `window.__staleReload` (a lazy
  chunk that 404s), which fires only once the app is already broken.
- `dist/build.json` survives the wholesale `*.json` ignore via an explicit `!`
  line in `.gitignore`. Ignored, it never ships and the prompt goes silent.
- Vite 8 runs Rolldown, which silently dropped `this.emitFile` in
  `generateBundle` — the plugin writes the marker in `writeBundle` instead.

### What this deliberately is NOT

The public-platform machinery (Stripe, GitHub, Shopify, Kubernetes) solves a
problem this app does not have: an ECOSYSTEM of third-party clients that chose
their own version and cannot be made to move. Here there is one consumer — our
own bundle, shipped from the same commit as the backend — so none of the
following is wanted, and each was considered and rejected:

- **Pinned client versions + request/response transformation layers.** Stripe
  pays a permanent maintenance tax to keep a decade of schemas alive because
  its users' revenue depends on it. Ours reload.
- **Date-based versions** (`2026-08-25`). They exist to make breaking changes
  cheap and frequent for consumers who opt in one at a time. Nobody opts in
  here, and the format would throw away the impact signal the table above
  encodes — which is the ONE thing SemVer is genuinely good at.
- **`Deprecation` / `Sunset` headers, 24-month support windows, brownouts.**
  All are ways to warn strangers. There are no strangers.
- **API-level `/v1/` URI versioning.** Two live contracts to maintain, forever,
  to serve tabs that a reload fixes.


## Context discipline

- Read only the files needed for the task. Don't sweep the tree or open files "to understand the codebase" — this document is the map. Use the UI-template table above to find the right component instead of grepping for it.
- When the user names a file or component, edit that one. Follow imports/types only as far as needed to make the edit correct, not to survey the project.
- Prefer targeted `Grep` for a specific symbol over reading whole files. Read the minimal region of a large file, not the entire file.
- If you think you need to read beyond the files the user named, ask first (one line) rather than exploring on your own.
- Reading a file immediately before editing it is expected and fine — the goal is to cut *exploratory* reads, not necessary ones.
