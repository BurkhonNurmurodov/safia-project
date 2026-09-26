# Safia IMS — project instructions

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
| Comment thread on a record | `CommentsModal.jsx` (`CommentsModal` + `CommentsButton`) | THE chat thread. Point it at a resource exposing the four standard endpoints — `GET/POST {endpoint}`, `PUT/DELETE {endpoint}/{id}` — via `endpoint` + `queryKey` + `refreshKeys` (the list keys whose `comment_count` badge must re-count); `title`/`subtitle` name the record. Ownership is NEVER re-derived on the client: the backend serves `is_own` per message, because a message belongs to the authoring PROFILE and one account may hold several. `CommentsButton` is the table-cell trigger (count badge, gold once non-empty) — a Comments column on the table for `sm+`, the same button on the mobile card's footer row. A failed write raises an error toast; the thread scrolls to the newest message. A message may carry a server-set `kind`: `"resolution"` marks the mandatory note a record was CLOSED with (the concerns register writes one into the thread when a concern is resolved) — green ✓ header, no delete button, because the backend refuses to delete it. Used by `/tasks` and `/concerns`. **`CommentsThread`** (same file) is the thread WITHOUT the dialog, for a page that shows a record above its conversation — the appeal chat (`layout="page"`: the page scrolls, the composer sticks to the bottom edge). Props, all optional, so tasks/concerns are unchanged: `attachments` + `filesEndpoint` (any file type, ≤10 per message, ≤20 MB each, dropped anywhere on the thread or picked with the clip; a refused file stays as a red tile; images the server proved to be images render as thumbnails → `Lightbox`, everything else as a `FileTile`; opening a file downloads it in a browser and asks the bot to DM it inside Telegram), `kinds` ({kind: {label, color, Icon, system}} — a `system` kind with no text is a centred line, not a bubble), `roleLabel`, `can_edit` per message (the server's whole answer to pencil/bin), `closedText`, `pollMs`, and the first-message mode (`listEnabled=false`, `postEndpoint`, `postFields`, `textField`, `requireText`, `minText`, `onPosted`) used to FILE an objection as its chat's opening message. |
| Camera proof capture | `pages/ProofCamera.jsx` | THE in-app camera, for checklist tasks whose `proof_kind` is `camera`. Never add a file-picker fallback to it — the whole point is that no file the leader produced is accepted. See the camera-proof section below. |
| Attached file (icon · name · size) | `FileIcon.jsx` (`FileIcon` + `FileTile` + `fileKind` + `humanSize`) | THE way an attached file is shown. Every file wears its EXTENSION's icon, tinted by one fixed `CATEGORY_COLORS` hue per type (PDF red, sheets green, documents blue, slides orange, images purple, video pink, audio teal, archives yellow, code indigo; unknown = slate `FOLD_COLOR` + plain file icon, never blank), with the extension printed on it. A file type is a category, never a status. `FileTile` is the row a chat message and a composer both use. |
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
| Column show/hide + reorder | `ColumnsPicker.jsx` | 38px `Columns3` icon trigger on the toolbar's RIGHT edge (`className="ml-auto"`, hidden-count badge) + portaled panel listing every column IN TABLE ORDER — hidden ones stay dimmed in place (eye-off), never regrouped to the bottom. Hide all/Show all links; drag-to-reorder only arms via the panel's reorder button. Controlled: `columns [{key,label,locked}]`, `order`, `hidden`, `onChange({order,hidden})`. Persist via `/api/ui-prefs/{key}` (per-profile JSON blobs, `UiPref` model); reconcile saved keys against the current column catalog and keep identity columns `locked`. `t("cols.*")` keys exist in all 4 langs. Excel exports of a picker-equipped table must mirror it exactly — send the visible keys in on-screen order (`columns`) with the row-id `order`, backend formats keyed per column. (Exception: the Позиции export deliberately emits the fixed brigadir «ABC форма» formula workbook instead of a picker mirror — don't revert it. It reproduces the manual form cell-for-cell: totals row 1, headers row 2, positions row 3+, team block M:O, indicators P:Q; only Трудоемкость/Команда/Факт/ПЛАН, «Группа» (column L, the former spacer, from 2026-09-14) and O. SONI are values, everything else is a live formula so the brigadir's edits recalculate. A work centre whose cells carry GROUP letters also gets an X:Y block («Команда · буква» = «A2894 · A», its O. SONI a yellow value): a grouped line's ЛЮДИ is `VLOOKUP(D&" · "&L,$X:$Y,2,0)`, the team's N becomes `=SUMIFS($Y:$Y,$X:$X,M&" · *")` when the block holds every cell of it and adds up to the page's N (else the page's value), and its Загруженность divides by N. A LEADER's file writes only their own groups' rows, so the minutes of the lines their cut hides ride as constants beside I1, F1 and the team's SUMIFS — the leader's load, bandlik and Парето then equal their page's and the brigadir's file. The block sits clear of every column `pp_parser` reads and its header names no group, so the round trip still finds «Группа» at L; an ungrouped unit's file differs only by the «Группа» header in L2 and L's width — the X:Y block is written only where cells carry letters. Trimmed hard on the operator's call (2026-08-31): the indicator block went from NINE rows to three — «Nechta odam keldi» = `=SUM(N…)`, the people assigned to the cells that day; «Hozirgi odam bilan o`rtacha bandlik(smena boshida)» = `=I1/(keldi×shift_min)`, the same arithmetic as `pp_calc`'s `avg_load` so the file and the page answer with one number; and «Общ.трудаёмкост» = `=I1` — with the other six indicators, the whole «Сколько должна на штатке» block (Z:AA) and the team block's P:W half (Команда · минут · real load · capacity · kerak · Штатка) gone. Everything removed was derived from hand-entered counts nobody fills in, so it printed 0 / 100% on every file. **From 2026-09-16 the block is FIVE rows**: the operator asked for the two of those six that need no hand-entered count back, and they sit under «keldi» in the manual form's own order — «Nechta odam kerak» = `=ROUND(I1/productive_min,0)` and «Bo`sh odam/kerakli odam» = `=keldi−kerak`, which prints RED when negative (short-handed), the one figure in the file carrying a verdict. **kerak divides by the unit's own `pp_productive_min`, NEVER a hard-coded 0.85**: that constant is `pp_calc`'s S per person, the divisor the «Odamlar soni» suggestion `N = ROUND(W×Q/S)` already uses, so the file and the page size a shift by one rule — and its default, 408, IS the manual form's own 0.85 × 480, so an unconfigured unit's file still reproduces the form cell for cell. «bo`sh» divides nothing and so carries no IFERROR: on a day nobody typed O. SONI it reads −kerak, which is what an unfilled form should say. Still out: «kelishi kerak edi» (the штатка row itself) and «% абсетеизм», which divides by it; «% обеспеч» and «Kerakli odam bilan o`rtacha bandlik» were simply not asked for and are computable now that kerak is back, so wanting either is one more entry in that list, not new arithmetic. Consequence: O. SONI (N) loses the `=ROUND(U,0)` chain that fed it and is written as a VALUE — the block's one input, and what ЛЮДИ/Минут/Парето/Загруженность still recalculate off via the M:N VLOOKUP. The page itself (its reconciliation card, its Штатка/capacity columns) is untouched — only the export dropped them. Superseded the older «загрузка» two-shift layout.) See the Production «Позиции» table for the reference wiring (cells rendered by a per-key switch so hide/reorder is free). |
| Factory (plant) switcher | `useFactorySection()` from `FactorySelect.jsx` | THE plant switcher — a `FilterPanel` SECTION, first in every factory-aware page's section list (plant → shift → supervisor → …), never a standalone control on the bar. (The standalone `FactorySelect` dropdown and the `FactoryTabs` strip before it are both retired from page toolbars: each cost a permanent toolbar cell on a phone-first platform for a value most users never change.) «All factories» is the FIRST option. Returns `null` when fewer than two factories exist; a locked viewer (supervisor/leader) gets a `static` section — an inert chip naming their plant, never a one-option control. The `FactorySelect` component itself survives only for non-toolbar surfaces (admin forms). |
| Ojidaniya category owner ("who answers for this cause") | `components/idle/OwnerChip.jsx` | THE way a «Kutish mas'uli» is named beside a category — the «Xarajat» tree, the «Toifalar bo'yicha» matrix, `/idle-owner`. Fed the payload's `owners` map (category → person, from `services/idle_scope.owner_labels`), never a name copied onto every row. A NAME, not a status: no traffic light — it borrows the category's own hue where it sits on a coloured row. A category with NOBODY assigned renders **nothing at all**, never «—» and never an empty chip: twelve categories with two owners between them would grow ten placeholders saying only that the register is unfinished. (Workbooks DO print «—» — a blank spreadsheet cell reads as «this column did not apply here».) |
| Cell label (how a cell is NAMED) | `utils/cellName.js` → `cellLabel(code, leader)` | A cell is its **verifix CODE**. The workshop name is NEVER printed — see the section below. |
| Pressable cell reference | `CellLink.jsx` | THE way a production cell rendered as CONTENT (table cell, card, chip) opens its page `/cells/:id` — dotted-underline affordance via the `.cell-link` rule in `index.css`. `id` = cells.id; without one it renders inert text (never a dead link). Clicks stop propagation, so it nests in clickable rows. FILTER controls listing cells never navigate. Don't put it inside another `<button>` (IdleCell accordion / AttendanceUpload expander stay unlinked on purpose — nested-interactive + they hold unsaved drafts). `/cells/:id` (`CellDetails.jsx`) is auth-only like `/profile`; its edit modal is the shared `CellFormModal.jsx` (ONE form with the `/cells` register). |
| Work-centre GROUP letter | `GroupBadge.jsx` + `utils/wcGroup.js` | THE letter a cell, a catalog line or a typed pin carries when several cells of one unit share a SAP work centre (backend `services/wc_group.py`). Sits right AFTER the code chip or the cell's code — never instead of it, never a second hand-rolled pill. Renders nothing without a group (a cell alone at its code has none, and ten placeholders would only say so). Every letter wears ONE fixed colour on every page (`groupColor`, the operator's order 2026-09-14: A red · B blue · C yellow · D green · E orange · F purple, then the rest of `CATEGORY_COLORS`), tinted like a work-centre chip; a letter picker renders its options as badges. `tone="warn"` marks an ORPHAN letter (lines or pins naming a group no cell carries) with the letter's own colour behind a DASHED outline — never amber, which would read as C. Plain text — a workbook cell, a toast, a tooltip — uses `wcGroupLabel(code, group)` → «A2894 · A»; a form normalises input with `normGroup` (Cyrillic twins → Latin, `undefined` = refuse). A group picker is a `StyledSelect` of «—» + the letters, never a free-text box. |
| Empty-data placeholder | `EmptyState.jsx` | For page/section level. Table "no match" rows stay plain muted text. |
| Full-screen "you can't see this page" state | `ErrorScreen.jsx` | THE template for 404, no-access, a crash, offline, and every blocked auth status (`AuthGate`'s screens, `NoAccess`, `ErrorBoundary` all render through it). Shape: tinted icon chip → status `code` → `title` → ONE sentence → ONE primary `action` → `secondary` escape hatch → `detail` collapsed. Tones are the status palette: `danger` broke, `warning` blocked-but-fixable, `neutral` slate just-not-there (404/403), `brand` an invitation (register) — never a raw emoji as the lead visual, which is what all eight hand-rolled copies used to do. Takes focus on the primary action at mount and pads for Telegram safe areas. `inline` drops the viewport wrapper for a screen rendered INSIDE `Layout` (the 404 keeps the sidebar, so the nav is itself an escape hatch). **Crashes are SCOPED and never technical**: use `ScopedErrorBoundary` from `ErrorBoundary.jsx` (never the bare class) — one inside `Layout` around the content column so a broken table keeps the nav alive, one above the routes so a broken page keeps the session, and the app-level one only for a provider. It clears itself on navigation (`resetKey` = pathname), shows the minified stack to ADMINS only, and posts every catch to `POST /api/crash-report` (`routers/boot.py`, the ONE client-failure door — fingerprint-deduped, one DM per crash per hour, always logged as `CLIENT-CRASH`). A user must never be the monitoring system. |
| Loading | `Skeleton.jsx` blocks for page/section data loads; `Loader2` spinner inside buttons for actions | Never bare `…` / "Загрузка…" text. |

Other UI conventions:

- Modal stacking: base modals z=50 (`Modal` default), nested modals pass `zIndex={60+}`, `ConfirmDialog` defaults to 100. **A popup opened from INSIDE a page's fullscreen overlay (the `z-[200]` portals on `/zagruzka`) must pass `zIndex={210}`** — `PendingInfoModal` already sits there. At its default it mounts BEHIND the overlay, the tap looks like it did nothing, and in Telegram — no Escape key — the reader must leave fullscreen to find it. `CommentModal` and `FormulaModal` take a `zIndex` prop for exactly this (defaults unchanged, 50 / 60), and `ComparisonTable` raises both whenever it is `fullscreen`. Found 2026-09-21 on the new heatmaps; the fleet heatmap and both comparison tables had carried it since before.
- Table-toolbar controls share ONE height — 38px, the `FilterPanel` trigger (`px-3 py-2 text-sm` + border). `SearchInput` default and `SegmentedToggle` md are also 38px. `Button` is the exception: md/sm are compact (≈30/26px) for modals & inline actions, so a toolbar action button must use **`size="lg"`** (38px) to line up with the filter/search controls next to it. All `Button` variants carry a border (transparent on borderless ones) so heights line up — don't strip it.
- `FilterPanel` (in `ColumnFilter.jsx`) is THE page/table filter zone. **Every page's scope controls (plant / shift / supervisor / leader / cell / category) live INSIDE it as sections — never as standalone selects stacked above the content.** The page bar is ONE row: the period control (`DateRangePicker compactLabel`, or `DayStepper` on daily pages) inline, then `FilterPanel`, then chips. It adapts to space: on md+ it unfolds into one dropdown per filter while the WHOLE toolbar row fits on a single line, else it collapses to the grouped «Filtrlar» button (below md: bottom sheet). Whenever controls are not visible inline, every ACTIVE section renders as a CHIP beside the trigger — `display` text + per-chip ✕ (`onClear`); chip body re-opens the panel; `static: true` sections are inert chips (locked viewer's plant). Sections: `{ key, icon, label, active, display, render({close}), onClear?, static?, group?, pinned? }` — `PickFilter` (single-select list, closes on pick), `OptsFilter` (multi), `RngFilter`, or an embedded `SegmentedToggle fill`. `group` (a translated caption) splits the collapsed surfaces into labelled blocks in first-appearance order; use it wherever a page carries both a scope CHAIN and record filters, so ten anonymous rows read as two short lists (Quality: «Kim va qayerda» = plant → shift → brigadir → leader → cell, «Nima bo'ldi» = the register filters). **A cascading level narrows the level below it and SAYS SO**: build each list under the levels above it, pass `PickFilter`'s `note` ("narrowed by «X» · N") so a shortened list is never mistaken for missing data, pass `empty` (a message + a button clearing the parent) for a level narrowed to nothing, and drop a child pick its own list no longer offers when the parent changes — a control naming a value the page cannot show is worse than a reset. See the Quality org chain for the reference wiring. Omit `activeCount`/`anyActive`/`onClearAll` unless overriding — the panel computes them from sections. `pinned: true` keeps a section's own inline dropdown on the toolbar even while the rest collapse — for a page carrying so many filters that the fit check can never unfold the row (ARC's thirteen), so the controls that steer the page are not buried behind a button that names none of them. Pin the two or three controls the reader steers with — and when a page's TABS ask different questions, pinning follows the open tab (ARC pins smena → brigadir → lider on «Yacheykalar bo'yicha», bo'lim / holat / kategoriya on «Barchasi»; every filter still narrows both tabs, only where its control sits changes). Below md nothing is pinned (the sheet keeps them all) and a pinned section drops its chip on md+, where its own trigger already states it. Keep it a DIRECT child of the toolbar flex row — the fit check measures that row's children (flex-grow spacers count as 0). View switches (tabs) stay OUTSIDE the panel; text search stays an inline `SearchInput`.
- All colors via CSS variables (`var(--bg-card)`, `var(--bg-inner)`, `var(--text-1..4)`, `var(--border)`, `var(--brand)`) — no hardcoded grays/hex for chrome, including on admin pages.
- No raw emojis — lucide icons in soft tint chips (see `ProjectIcon` in `Kaizen.jsx`).
- Status colors are traffic-light: red `#ef4444` / yellow `#eab308` / green `#22c55e`; "not started" is grey `#94a3b8`; brand gold `#C8973F` is an accent, never a status. The band a headline figure is judged by (load, completion, quality closure, open concerns) is defined once, in `utils/statusBands.js`.
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
- **A dead Telegram bridge is never a crash.** Android drops the Java object behind `window.TelegramWebviewProxy` when it tears a mini app down, and every `Telegram.WebApp` call after that throws «Java object is gone» synchronously from its caller — on a slow link that can happen before React mounts (AuthProvider's `ready()` crashed `/proof/camera` that way, 2026-09-21). The inline script above the SDK tag in `index.html` wraps the proxy once, and the SDK looks it up at call time, so all ~40 call sites are covered. Never call the proxy raw, never move that script below the SDK tag, and never add per-call try/catch for this instead.

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
  ltasks · translations) → **Xavfli zona** (cleanup · dbdump). Danger
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

## A leader's cell may stand in ANOTHER unit (`cells_unit_for_leader`)

From **2026-09-26** (the operator's ruling) a leader can be COUNTED under one
brigadir while their cell's загрузка is read in a unit of its own. The case:
Turdimurodov Nodirjon is Aripova Manzura's leader; the unit «Turdimurodov
Nodirjon» exists only to measure his cell 0811's load. His leader profile sits
in Aripova's unit (checklist, /leaders, digests, reports, objections all hers),
0811 stays in his unit (catalog, plan, typed people, attendance, ojidaniya).

- **What a leader is MEASURED by follows the CELL.**
  `cell_lookup.cells_unit_for_leader` (the one unit all their cells stand in,
  else None) is read by the automatic checks (`leader_auto._Ctx.unit_id` — #1
  and #9 read that unit's dashboard and pins) and by a leader's /production page
  (`production._resolve_manager_id`). Read in the leader's own unit they find a
  catalog that never carried the cell and fail every day — the state Umarova
  Mapura was in on the 11 Sep copy (profile in Raximova Kamola's unit, cell
  8611 in Mirmaxmudova Munira's), so her #1/#9 move with this too.
- **What a leader FILES follows the PROFILE** — a bot day still takes
  `prof.manager_id`, unchanged.
- **A save that does not move the leader moves no cell.** `_set_leader_cells`
  drags kept cells only when the profile edit changes the unit
  (`follow_unit`), and the /cells form applies the leader's unit only to a NEW
  owner. Before, a rename re-synced the cells and quietly carried 0811 — and
  its load — into Aripova's unit.
- Moving an existing leader's days is a data fix, not a feature:
  `services/leader_unit_fix_sep26.py` (TEMPORARY one-shot) moved his profile,
  role rows and every checklist day to Aripova without touching the cell, and
  marked her already-sent digests as including them so nothing was re-sent.

## Supervisors read `/cells` — their own unit, read-only

From **2026-09-14** (the operator's directive) the cells register opens to the
`supervisor` role by default, narrowed to the cells of their OWN unit.

- **The narrowing is server-side** — `_cells_viewer_unit` in
  `routers/profiles.py`, applied by `GET /api/profiles/admin/cells`: a
  supervisor's `role_id` is their unit, and the endpoint returns that unit's
  cells, that unit as the only supervisor option, and its leaders (plus any
  leader named on its cells). `scope` on the payload names the unit and is null
  whenever the register is whole; the page reads the narrowing off it — never
  off the viewer's role — and renders the unit as an inert brigadir chip.
- **Read-only by construction.** Every write is `admin.cells.manage`
  (`require_cap`), which a supervisor does not hold, so `canEdit` draws no
  create / edit / delete. The Excel export stays: it is a read.
- **Two personal grants widen it back to the whole register**: the edit grant
  (whoever manages the register needs all of it) and `page.view.cells`, stored
  at "all". «cells» deliberately stays out of `SCOPED_PAGES` — "own" would only
  restate a supervisor's role default and narrow nothing for any other role,
  and those keep reading the whole register when opened on the Access tab.
- **`/cells/:id` is unchanged** — still auth-only for every session, because a
  cell is pressable from pages that are not this one.
- A stored matrix shadows `DEFAULT_PAGE_ACCESS`, so
  `startup.open_cells_page_to_supervisors` (flag
  `cells_page_supervisor_2026_09_14_v1`) ADDS the role to the stored `cells`
  list once; the flag is what protects a later uncheck on the Access tab, and
  changing what it does needs a NEW flag key.

## A work centre is NOT unique — a cell is

A verifix code identifies ONE cell. A **SAP work centre does not**: two shifts
routinely stand at the same one, so several cells — in different units, on
different shifts — legitimately carry one `cells.sap_code`. Four codes are
shared across units today; three of them across shifts (B2942 = 9411 on
Raximova Kamola's shift 1 and 9423 on Olishev Islom's shift 2).

- **`cell_lookup.by_sap` is keyed by `(manager_id, code)` and `resolve_sap`
  demands the unit.** Keyed by the code alone it answered with whichever cell
  sorted first by verifix code, so a work centre on one brigadir's page was
  named after — and linked to — ANOTHER SHIFT's cell and leader: on Raximova's
  production page B2911 resolved to Yogmirov Feruz's night-shift cell 9121. A
  first-wins map cannot express a code two units both own, so the key carries
  the owner and the call site cannot forget to name it. `by_verifix` stays keyed
  by the code, because there the code really is the identity.
  Consumers: the Production dashboard's `work_centers[].cell` (the «Команда»
  chip, its `CellLink`, the staffing cards, «Odamlar soni»), the admin
  work-centre register, and `/live` — which from 2026-09-14 maps no work centre
  to one cell at all: it hands each work centre's plan to its cells through
  `zagruzka_source.cell_labor` (unit + normalised code, then `wc_group.share`).
  Keyed by the code alone it had summed BOTH shifts' plan minutes onto one cell
  and left the other with no plan. `/cells/:id`'s production count is scoped to
  the cell's own unit too.
- **Within ONE unit the code may still name several cells** (10 groups today),
  and from **2026-09-14** each of them carries a GROUP letter that tells them
  apart — see «A work centre's GROUP» below. `by_sap` still answers a
  group-less lookup with the first cell by verifix code; a lettered cell is also
  keyed by (unit, code, group), and `resolve_sap(..., group=)` reads that key.
- **Everything that COMPUTES was already unit-scoped and did not move.** Every
  `pp_*` table is keyed by `manager_id`, so two shifts hold their own catalog,
  their own «Bugungi fakt» pin and their own quantities for one work centre;
  `zagruzka_source`, `idle_source`, `/zagruzka-cell`, `ojidaniya_cost` and
  `zagruzka_gaps` all group by `(manager_id, sap_code)` — the code normalised through
  `wc_group.cells_by_wc` from 2026-09-14.
- **OPEN, and it moves a number — ask before changing it.** The SAP upload is
  the one place the sharing is not resolved: `_scoped_faza` cuts the фаза file
  by the unit's own work centres ∪ catalog, so a work centre in TWO units'
  catalogs has the day's WHOLE ПЛАН/ФАКТ written to both (A2761 → Murodali
  Ochilov s2 + Xakimov Ruslan s1, identical figures, 234 rows over 48 days).
  Both units' trudoyomkost — and so their загрузка — then counts the other
  shift's output. **The file cannot answer it**: a фаза row is Заказ · Опер. ·
  Команда · SKU · Наименование · План · Статус · Дата · Подтв., with no person,
  no brigade, no shift and no TIME (`_to_date` keeps the date alone), and `op`
  is empty on every line on the platform, so operations cannot separate the two
  either. The plant already works around it by hand — Xakimov's lines are named
  «барадинский 1-смена» beside Murodali's «Хлеб Бородинский», same SKU, same
  work centre, different `labor_time`. The tool for it already exists and needs
  no new rule: **`pp_products.auto_fill = false` on the shared lines**, so the
  upload leaves them alone and each brigadir types the half their shift made.
  Splitting the quantity automatically (evenly, or by the typed «Odam soni») is
  a GUESS about who produced what and needs the operator's decision first.
- **The whole picture was DMed once** — `services/shared_wc_report.py`, fired by
  `startup.report_shared_work_centers` (rich-message tables, flag
  `shared_work_centers_dm_2026_09_10_v1`) and `…_xlsx` (a four-sheet workbook —
  Xulosa · Yacheykalar · Qo'sh yozilgan · Kunlik dalil — flag
  `shared_work_centers_xlsx_2026_09_10_v1`). TWO flags because they are two
  deliveries: the operator asked for the file after the message, so «already
  sent the DM» must not be read as «already sent this»; changing what either
  reports needs a NEW key. A THIRD delivery followed on 2026-09-11 for the same
  reason — `startup.report_shared_sap_cells_raw_xlsx`, flag
  `shared_sap_cells_raw_xlsx_2026_09_11_v1`, rows from
  `shared_wc_report.collect_cells`: the CELLS register alone as an UNFORMATTED
  one-sheet workbook (header row, one row per cell, no styling, and no window —
  a registry fact has no period), BROADER than the four-sheet file's
  «Yacheykalar», since it keeps every code two or more cells carry, cells of
  ONE unit included, not only a code several units claim. Codes are grouped
  through `latin_code` + `_norm`, with the stored spelling in its own column.
  **The window bounds only the trudoyomkost IMPACT** —
  minutes mean something only from `ZAGRUZKA_FROM` — while the duplicated
  quantities and the per-row evidence sheet cover the WHOLE stored history, or a
  sheet emptied by a window that misses the overlap would read as «this is not
  happening». Two registers kept apart because they have two different fixes: the
  CELLS that share a code (a registry fact, harmless now the label is scoped)
  and the CATALOG lines that share one (what writes a quantity twice). Its
  minutes come from `zagruzka_source.wc_labor`, so the report and the page
  cannot state different trudoyomkost for one day, and it prints TWO exposure
  figures per unit, each named: «ulashilgan» (a work centre another unit also
  carries — the risk surface, since the SKUs may not overlap) and «qo'sh
  yozilgan» (a quantity really written to both — the part that is wrong today).
  It reports and changes nothing. Delete the module together with ALL THREE of
  its one-shots — `report_shared_work_centers`, `…_xlsx` and
  `report_shared_sap_cells_raw_xlsx`, each imported and called in BOTH
  `main.py` and `passenger_wsgi.py` — once the answers have landed: a call left
  behind imports a deleted module at boot, and a failed boot rolls the deploy
  back.

## A work centre's GROUP (`services/wc_group.py`)

From **2026-09-14** (the operator's directive) a cell that shares its SAP work
centre with other cells of its UNIT carries a GROUP — one Latin capital letter
(A, B, C …) — and so do the catalog lines that group produces and the «Bugungi
fakt» typed for it. Inside one unit a (SAP code, group) names ONE cell. Before
it A2894's six cells on Ibragimova Sayyora's shift could read only one typed
headcount and one trudoyomkost for the whole line, SPLIT EVENLY, so their
ojidaniya weight, their ojidaniya COST and their per-cell загрузка were guesses.

- **`services/wc_group.py` is THE definition** — `norm_group`, `label`, `share`,
  `line_groups`, `cell_conflicts`, `check_cell`, `in_scope`.
  The client twins are `utils/wcGroup.js` and `components/ui/GroupBadge.jsx`.
  Never re-spell a split, a normalisation or a scope test at a call site.
- **Three nullable columns** — `cells.wc_group`, `pp_products.wc_group`,
  `pp_work_center_daily.wc_group`. NULL = no group / the whole work centre,
  which is exactly what every row stored before meant. The pin table's unique
  key is an EXPRESSION index over `COALESCE(wc_group, '')`
  (`startup.add_wc_groups`): Postgres treats NULLs as distinct inside a unique
  key, so a plain four-column constraint would accept two whole-centre pins for
  one day.
- **The register rule is per UNIT, not per shift** (the operator's call): inside
  one unit and one code there is ONE cell (lettered or not), or every cell is
  lettered and no two alike — two brigadirs on one shift type their own pins
  and keep their own catalogs, so their cells may reuse a letter.
  `check_cell_detail` refuses a break on every register WRITE that moves a
  cell's (unit, normalised code, letter) — the /cells form and the /profile
  inline create; an edit leaving those three unchanged is not re-checked. The
  refusal is STRUCTURED (`code` + `params`, the English sentence as `message`)
  and both forms translate it. The forms offer and send a letter only when the
  cell has BOTH a SAP code and a unit. A body that carries NO `wc_group` at all —
  a /cells tab still open on 4.106 — is never refused over a letter it cannot
  see: clearing the SAP code or the unit drops the letter, and a unit move
  settles it like a cascade, both logged as `group_cleared`.
- **TWO cascades never refuse**: a leader's unit move that drags cells, and the
  admin «Davomat» «Doimiy qilish» write (`attendance_batch.update_cells`). Both
  call `wc_group.settle_moved` once per destination unit, clear the one colliding
  letter and log it as `group_cleared`; a permanent write that CLEARS a cell's
  unit clears its letter the same way. An unlettered cell dragged into a
  lettered work centre is left and named by `report_wc_groups`. The partial
  index `uq_cells_wc_group` is the backstop — and because it exists,
  `startup.migrate_cell_supervisor_column` now drops the letter of every
  unit-less cell it re-attaches, or one leftover letter would roll that whole
  backfill back on every boot.
- **The catalog rule: a LINE carries its own letter and NOTHING propagates**
  (2026-09-18, the operator's directive — `wc_group.line_groups` is the one
  reader). Two operations of one position may be performed by two cells — the
  предзаг. step in one, the finishing in another — and each cell is handed the
  minutes of the operation it actually performs, because a line's minutes are
  its OWN Трудоемкость × the day's quantity. So «Печенье Шрек» (341 s) and
  «Печенье Шрек (предзаг.)» (289 s) at A2894 may name B and A.
  From 2026-09-14 to that date every line of one (SKU, work centre) had to
  carry ONE letter, on the reading that the SAP file writes one quantity for the
  pair and cannot say which cell made which part of it. It does not have to —
  the quantity is shared, the Трудоемкость is not — and the rule PROPAGATED:
  setting a letter on the row an operator was looking at silently moved every
  other row of that SKU, which is how they found it. Gone with it: `sku_groups`
  (folded a SKU to one letter, answering «unclaimed» when its lines disagreed),
  `line_conflicts`, the «siblings follow» write, the adoption of a destination's
  letter by a moved line, a blank create adopting its SKU's letter, the ABC
  import's refusal of a split SKU, and the boot check's «SKU split over groups».
  `group_siblings` stays on the three catalog responses and always reads 0, so a
  tab open on an older bundle prints nothing rather than breaking.
  **Σ over a work centre's groups is unchanged**, so no unit figure moves — only
  the split between cells does, and only where somebody letters two lines of one
  SKU differently.
  What SURVIVES: a line moved to another Команда still loses its letter (a
  letter names a cell AT a work centre), an ORPHAN letter is still legal and
  still named by the boot check, and **the group is still not part of a line's
  identity**, so changing it moves no typed quantity.
  The ABC import now believes the sheet's «Группа» column line by line and
  carries an unlettered sheet's groups across the wipe on the LINE's own key
  (`pp_calc.line_keys` — name + Трудоемкость, the identity `PPLineDaily`
  already stores quantities under). A line whose name or Трудоемкость the sheet
  CHANGED cannot be followed (the import may never guess by position) and comes
  back ungrouped — the even split, where it sat before anybody lettered
  anything — and the boot check names it.
- **`share` is ONE rule for minutes and for people**: a cell reads its own
  group's value, and whatever no cell's letter claims — an ungrouped line, a
  whole-centre pin, a letter no cell carries — is shared evenly between ALL the
  work centre's cells. For a work centre nobody grouped that IS the old even
  split, so **nothing moved when this shipped** — with TWO exceptions, both
  corrections: /live used to put a shared work centre's whole plan on its first
  cell by verifix code and now shares it evenly (unit figures unchanged), and the
  «Xarajat» entries modal priced a cell of a shared work centre with the WHOLE
  pin and now prices it with the cell's share, as the tree above it always did —
  and Σ over a work centre's cells is always what the work centre carried. For pins the whole-centre pin is
  ignored the moment any group pin exists; writing a group people pin clears the
  whole-centre people pin and writing a whole-centre people pin deletes the
  group pins. The day's штатка pin stays on the whole-centre row.
- **The readers**: `zagruzka_source.typed_pins` (group-keyed), `typed_people`
  (folded per work centre: Σ group pins, else the whole pin — so the fleet
  загрузка keeps its shape), `cell_people` (the ojidaniya weight, which carries
  groups into /downtime, «Xarajat», «Toifalar bo'yicha» and every workbook at
  once), `wc_group_labor` + `cell_labor` (per-cell minutes), and
  `pp_calc.line_minutes_by_group`, which is `line_minutes`' own loop returning
  its other half, so Σ over the groups is the work centre's figure byte for
  byte. `sap_groups_for_leader` + `in_scope` is a leader's group scope: the
  leader of A2894·A reads group A and the ungrouped lines, never group B — but
  the work centre's own figures (its people, load, each group's share and the
  lines' ЛЮДИ/Минут) are computed over EVERY group first and only the rows are
  narrowed afterwards, so a leader reads the brigadir's numbers, never a
  recomputation over their slice (`wc_group.share` depends on every sibling
  group and on the unclaimed part).
  **Every per-cell reader matches cells to work centres through
  `wc_group.cells_by_wc` / `wc_key`** (unit + `norm_code`), sums two stored
  spellings of one work centre, and is handed EVERY cell of the unit: the split
  is over the cells passed, so a one-cell list reads every other group's people
  as unclaimed and takes them — the «Xarajat» entries modal did exactly that
  until it weighed over the unit like its tree. The gap and unpriced reports read
  a cell's pins through `zagruzka_source.cell_pins` (the one pin split;
  `cell_people` is its `> 0` filter) and read `wc_group_labor` once, folded by
  `fold_group_labor`.
- **/production reads a group the way the weight does.** An untyped non-orphan
  group's `people` is its SHARE of the whole-centre or orphan pins (a fraction,
  `people_overridden` false, printed with one decimal and the untyped «*»); a
  typed group publishes its own pin; `people_counted` is what its load and its
  lines' ЛЮДИ/Минут divide by. Before the загрузка floor an untyped group reads
  its share of the work centre's formula suggestion — the rule /zagruzka-cell
  applies. So one cell-day states one headcount on
  /production, /zagruzka-cell and /downtime. A work centre counts as TYPED by
  one client rule, `typedCentre`: once any group pin exists every non-orphan
  group needs one. A lettered chip links only to the cell carrying its letter
  (inert for an orphan) and every tooltip names codes and the leader, never a
  workshop.
- **ORPHAN letters** (on lines or pins, carried by no cell of the unit) stay
  visible with `included: true` — their minutes are already inside the cells'
  shares, so nothing may add them into a total — and are READ-ONLY: a new or
  changed orphan pin is refused (400), an unchanged re-send or a clear is
  accepted. The client asks two questions, never one: `isGrouped` (are there
  letters to SHOW) and `typesPerGroup` (is there a group to TYPE) — a work
  centre whose only letters are orphans is typed as a whole, or its «Bugungi
  fakt» could be typed nowhere. The row editor resets a letter no cell carries at a changed
  Команда, and the bulk bar offers only letters a cell carries at EVERY
  selected line's work centre.
- **Old tabs and leaders.** A whole-centre people value equal to the Σ of the
  work centre's group pins — or of the ones a leader can see — is an ECHO of
  what an older tab was shown: it
  writes no whole-centre people, deletes no group pin and still applies the
  штатка — otherwise a 4.106 tab's Save would have collapsed typed groups into
  their sum. Any other whole-centre number replaces the group pins. A leader's
  WRITES follow their group scope: /override refuses another group's line, and a
  staffing save may not delete a group pin the leader cannot see (403).
  A catalog create with a blank group leaves the line UNGROUPED, and an edit or
  a bulk edit with an empty group clears it on the rows the request named and on
  no others.
- **Where it is typed and shown**: the «Команды» panel draws ONE CARD PER GROUP
  for a work centre typed per group — its own load, people and minutes; штатка
  stays the centre's and says so — with a display-only card for an orphan letter;
  «Odamlar soni» shows a grouped work centre as
  a header row (its штатка, and the Σ of its groups read-only) plus one row per
  group; «Позиции» has a «Guruh» column, the row editor and the bulk bar set it;
  the ABC workbook reads a «Группа» column found by its header text and writes
  the group in column L plus an X:Y group block (see the Позиции export
  exception); /cells, /cells/:id and the cell form carry the letter;
  /zagruzka-cell publishes `wc_split` («none» · «group» · «even») and lists as
  `grouped_work_centers` only work centres where a line or a typed pin actually
  names a cell's letter; /live gives each cell its own share of the plan; the
  gap and unpriced reports name «this LETTERED cell's group was not typed» and
  «this cell has no letter» (`cell_no_group`, fixed on /cells) as reasons of
  their own.
- **The one-shot** `startup.letter_shared_cells` (flag
  `cell_groups_autoletter_2026_09_14_v1`) lettered A, B, C … by verifix code every (unit, code) carried by two or
  more cells none of which was lettered yet — a code an admin had begun
  lettering by hand, or one with more cells than letters, is left and named —
  and left a lone cell blank.
  Config only: no line got a group and no pin moved, so no number moved.
  Changing what it letters needs a NEW flag key. `startup.report_wc_groups` is
  the boot self-check — register breaks, orphan letters, ungrouped lines at a
  grouped work centre, cells whose stored code is not normalised — and changes
  nothing. A SKU whose lines carry different letters was on that list until
  2026-09-18 and is now an ordinary catalog.
- **Consequence to know**: letters on the cells alone change NOTHING. A grouped
  work centre whose brigadir keeps typing one whole-centre number still splits
  it evenly, and one whose catalog lines carry no group still splits the minutes
  evenly. Each cell's figure becomes a measurement only once its people are
  typed per group AND its lines are grouped — a day re-typed per group, past or
  future, starts weighing per cell at once, because nothing is stored.
- **Deliberately unchanged**: the cross-UNIT double write (a work centre two
  units' catalogs name still receives the file's whole quantity in both — the
  OPEN question in «A work centre is NOT unique»), a cell's label (still its
  verifix code; the letter sits beside it), and штатка, which stays per work
  centre.

## A code is LATIN (`services/latin_code.py`)

From **2026-09-11** (the operator's call) every code a PERSON types is stored in
Latin letters — a cell's SAP code, a catalog line's SAP code and Команда, a work
centre in the catalog sheet's staffing block. A Cyrillic А, В, Е, К, М, Н, О, Р,
С, Т or Х is drawn identically to its Latin twin and is a different character
to every comparison, so a code typed on the Russian layout looks right on every
screen and matches nothing. It surfaced twice: a «В2942» typed into the /cells
search found neither 9411 nor 9423, and three of Suvonov Elshod OF's catalog
lines carried «А1432 · А1435 · А1436» and never read the ПЛАН/ФАКТ the SAP file
wrote under the Latin spelling.

- **`latin_code()` is THE rule and it converts only a CODE**: the value must hold
  a digit («ТОРТ» is a word made of twins) and every Cyrillic letter in it must
  have a twin («Цех 1» stays Russian rather than turning half-Latin). Anything
  else comes back untouched, which is what makes it safe on a column that
  sometimes holds text.
- **It sits on the doors a person types through**: `profiles._apply_cell_fields`
  (the cell register and its form), `pp_parser.parse_catalog_workbook` (the ABC
  sheet — an import re-creates every line, so without it each re-import brings
  the Cyrillic spelling back) and the catalog's create / edit / bulk endpoints.
  The SAP export is machine-written and deliberately not passed through it.
- **Every join stays a plain string comparison.** That is the point of fixing
  the data on write rather than teaching `cell_lookup._norm` and the `pp_calc`
  key a second alphabet.
- **A search folds BOTH sides** — `utils/latinCode.js` `latinFold`, on /cells:
  per character, over the query and the text searched, so a code matches
  whichever keyboard typed it and a Russian workshop name still finds itself.
  Broader than the storage rule on purpose: it decides only whether two strings
  match, never what is written.
- **What was already stored was converted once** — `startup.latin_twin_codes`,
  flag `latin_twin_codes_2026_09_11_v1` (changing what it converts needs a NEW
  key). Catalog lines go through the catalog editor's own identity carry
  (`_carry_manual_quantities`), so a ПЛАН/ФАКТ somebody typed follows the line
  onto the Latin key; a register row or typed pin whose Latin twin already
  exists is LEFT and named, never merged or deleted. One «Jurnal» row
  (`production.codes_latinised`) lists what moved. **Consequence to know:** the
  converted lines read the SAP figures the file had already stored under the
  Latin key, on every stored date at once — closed days included.
- Deliberately untouched: `quality_complaints.ref_no` (96 complaint numbers
  with Cyrillic letters on the Sep-3 copy) — re-synced from the Quality sheet,
  and nothing joins on it.

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

## The загрузка reads the «Zagruzka fayli» page (`zagruzka_source`)

From **2026-09-02** (`ZAGRUZKA_FROM`, the operator's directive) the загрузка's
two inputs — **«Odam soni»** and **«Трудоёмкость»** — come from the
`/production` page instead of Google Sheets. **The formula is untouched, byte
for byte**; only where three numbers come from changes.

- **Both were always sheet downloads, and that is the point.**
  `sheets_reader.read_headcount_data` reads the tab literally named
  «Одам сони» into `headcount_data.official_hc`; `read_production_data` reads
  «Минут» into `production_data.prod_plan` / `.prod_actual`. One number per
  brigadir per day, typed into a spreadsheet nobody on the platform can see.
  This is not a new concept — it is the SAME two fields, re-sourced.
- **The floor is a CONSTANT with no override**, the shape `idle_source.CELLS_FROM`
  and the review floor already use: a rule a per-unit toggle can quietly undo is
  a rule nobody can read off the platform. Days BEFORE it still read the two
  sheet tabs and are untouched, so history is never rewritten and one day is
  never answered by two sources. **Nothing is stored** — every figure is derived
  per request — so "recalculate from 2 September" needs no migration, no day
  reopen and no notification: every consumer re-reads at the next restart.
- **`services/zagruzka_source.py` is THE definition** — `ZAGRUZKA_FROM`,
  `uses_production`, `range_start`, `sheet_end`, `typed_people`, `unit_people`,
  `cell_people`, `unit_labor`. Never re-spell the date comparison at a call
  site, and never split a range by hand: `sheet_end` is the exact inverse of
  `range_start`, which is what stops a day being counted twice or not at all.
- **The «Plan Prognoz» page reads it too** (from 2026-09-23).
  `production._load_plan_by_manager` is the one loader behind `/trudoyomkost`,
  its Excel, the worker statistics, the forecast table, the call modal and the
  automatic 19:00 / 06:00 call DM — and the 2 Sep switch missed it. Once
  nothing else read «Минут», nobody filled it after 6 Sep, and all of those went
  dark (the page read «0 brigadir», the DM averaged one early-September day). It
  now splits at `range_start` / `sheet_end` like the загрузка; on 2–4 Sep, both
  sources filled, they agreed within ~1% for all 21 units, so the seam moves no
  level. A new reader of planned trudoyomkost reads `unit_labor` from the floor
  — never `ProductionData`, which keeps syncing and feeds nobody.
- **Odam soni is the TYPED number and nothing else.**
  `pp_work_center_daily.people` — the «Bugungi fakt» box on the «Odamlar soni»
  tab — summed over the unit's work centres. `people IS NULL` is what makes the
  rule expressible: it distinguishes "nobody typed anything" from a deliberate
  0 (a cell that ran empty), which is a real answer. The derived suggestion
  `ROUND(W × Q ÷ S)` is deliberately NOT a fallback and neither is штатка — a
  suggestion presented as a fact is the thing this switch replaces, and 19 of
  22 units have no `pp_work_centers.shtatka` at all, so the formula would
  answer 0 for almost the whole fleet.
- **So «Bugungi fakt» must never print a resolved number bare.** `pp_calc`
  publishes `people` / `shtatka` RESOLVED — the pin where one was typed, the
  derived `people_calc` / `shtatka_cfg` where none was — beside the
  `*_overridden` flag that is the only thing telling the two apart. The
  read-only branch of that table (a CLOSED day, or a viewer who may not type)
  printed the resolved value with no marker, so a unit that had typed nothing
  showed the suggestion from the card on the LEFT as its own fact — both cards
  identical cell for cell — while the загрузка heatmap marked that same
  unit-day 👥. Two surfaces, one unit-day, opposite answers, and the page a
  brigadir opens to find out why the load is blank was the one telling them
  everything had been filled in. **The blank on the heatmap IS the warning, and
  a fact card that answers with the formula is what stops it landing.** The
  editable branch always distinguished them (typed = gold + bold, untyped = a
  grey placeholder); the read-only branch now keeps that vocabulary and adds a
  `*` plus a legend that renders in BOTH states — a closed day has no input to
  carry the meaning and is exactly the day read back as the record. JAMI
  carries the `*` too: a total is the number a reader quotes, so it must not be
  the last place the distinction is dropped.
- **From 2026-09-08 (the operator's directive) the suggestion is not
  SUBSTITUTED at all** — `pp_calc.compute_dashboard(people_typed_only=True)`,
  passed by `production._build_dashboard` off `uses_production(day)`, i.e. the
  same `ZAGRUZKA_FROM` floor `zagruzka_cell.o_soni` already applies. The
  marker above was only half the fix: the resolved value still ANSWERED, so
  «Загрузка» printed «ЛЮДЕЙ (Σ) 34 · СР. ЗАГРУЖЕННОСТЬ 83%» — both computed
  from `people_calc` — for a closed unit-day whose brigadir card read «Нет
  данных». The marker never reached that tab at all. Now a work centre with no
  typed pin has `people = None`, its `load` is None, and it is absent from ΣN;
  ΣN with NOTHING typed is None, so every reader prints «—». `people_calc` is
  still published — the «Расчёт (формула)» table exists to show it, LABELLED —
  and a typed **0** is still a real answer (a cell that ran empty), which is
  why `people_overridden` and never the value is what tells typed from absent.
  Days before the floor, and any other caller of the engine, compute exactly
  what they always did.
  **Consequences, all deliberate.** «Кол-во» on the команда cards, ЛЮДИ and
  Минут on the positions table, ΣN and СР. ЗАГРУЖЕННОСТЬ all read «—» on a
  unit-day nobody typed; a partial day marks the pair with `*` and a line
  naming «{typed} of {total}», since ΣN sums the typed pins alone while the
  whole unit's trudoyomkost is counted against them (the bullet below). The
  «Кол-во» INPUT no longer previews the suggestion as its placeholder — an
  empty box counts as nothing, and a placeholder promising otherwise is the
  same substitution one layer up — while ШТАТКА still falls back to the
  configured roster, because that is configuration, not a fact about one day.
  And the **ABC export writes N BLANK** where nothing was typed, rather than
  the suggestion: it is the form's one hand-edited cell, so ЛЮДИ, Минут,
  Парето, Загруженность, «Nechta odam keldi» and bandlik read 0 until the
  brigadir fills it in.
- **Only the typed pins are summed, and the WHOLE unit's trudoyomkost is
  counted against them** (the operator's call). A unit that types 4 of its 6
  work centres therefore reads a load that is too HIGH, with nothing on screen
  distinguishing that from a genuinely overloaded unit. The pressure to type
  them all is the point.
- **Trudoyomkost is the production page's own resolution**, never a second
  spelling: Σ over the unit's active catalog LINES of `labor_time × qty ÷ 60`,
  per-line override → the group's shared value → the SAP snapshot. That is
  `pp_calc.line_minutes`, the same function `/zagruzka-cell` and `/live`
  already read, so the загрузка and the Positions table can never report
  different minutes for one day. `line_keys` is computed PER UNIT, as the
  Positions table computes it.
- **A unit-day missing either half has NO загрузка — a marker, never a zero.**
  `compute_metrics(hc_required=True)` is what enforces it: with `official_hc`
  at 0 the old code still built `effective_hc = 0 + labor_surplus` out of the
  attendance correction alone and averaged that into Overview and /summary as
  an ordinary figure. The flag defaults to False, so every pre-floor caller
  behaves exactly as before. On the heatmap and the comparison the day carries
  `no_headcount` (👥, nobody typed the people) or the new `no_labor` (📄,
  people typed and the catalog cannot answer the trudoyomkost); in
  `/api/brigadirs` it contributes NOTHING to the averages those two inputs
  feed, while still contributing its ojidaniya, its attendance headcount and
  its verifix labor, which do not depend on them. **That blank IS the
  warning** — the operator's decision: a unit finds out its numbers are
  missing by losing its figure.
- **`DailyMetrics.basis`** ("sheet" | "production") rides on every row so a
  reader can say WHICH half of a blank day is missing instead of guessing.
- **Ojidaniya is weighed by the same number.** `idle_source._n_by_cell` is THE
  weight definition and both `unit_downtime` and `cell_counts` read it — they
  must divide by the same thing or the «Toifalar bo'yicha» matrix and the KPI
  stop describing one day. Before the floor: the people who actually worked
  the cell (`hc_weight` summed, not rows counted). From the floor: the typed
  pin on the work centre the cell's `sap_code` names. A cell whose work centre
  nobody typed — or that names none — has no weight and leaves BOTH sides,
  exactly as a cell nobody worked in already did. **Where several cells of one
  unit name one work centre (10 groups today) the typed number is SPLIT evenly
  between them**, so ΣN equals what the brigadir typed rather than counting one
  work centre four times over. From 2026-09-14 only what no GROUP letter claims
  is split — a cell of a work centre typed per group reads its own group's row
  (see «A work centre's GROUP»). It moves every surface at once, by design:
  /downtime and its bar modal, the matrix and its divisor, the weekly deck,
  both Excel exports, the bot card, the weekly svodka, /live and the Daily
  donut.
- **Consequence to know: a unit that types nothing reads 0 waiting minutes**,
  not just a blank загрузка — ΣN = 0 is no figure at all. Accepted by the
  operator. It is self-healing: nothing is stored, so typing the numbers later,
  for a past day too, starts the weighting immediately.
- **Trudoyomkost is derived from the catalog EACH DAY HAD** (from 2026-09-24 —
  see «A catalog edit counts FROM NOW ON»). Until then it was the CURRENT
  catalog, so editing a `labor_time` moved the загрузка of every past day from
  the floor on. A typed QUANTITY still moves its own day, and nothing else.
- **Deliberately unchanged**: `labor_surplus` and `effective_hc` (the
  attendance correction still applies on top of the typed headcount — the
  operator's call), the early-arrival subtraction, the headcount-mismatch flag,
  the flat 480 base (the production page's `pp_shift_min` is deliberately NOT
  adopted), the closed-day lock, the day-close gate on `build_metrics_list`,
  and both sheet imports, which keep syncing and are simply not read from the
  floor on.
- **«Yacheyka zagruzkasi» (`/zagruzka-cell`) runs the same rule per CELL.**
  Its trudoyomkost already came from `pp_calc.line_minutes`; what changed is
  its headcount — `o_soni()` returns the TYPED «Bugungi fakt» and nothing else
  from the floor, so the derived `ROUND(W × Q ÷ S)` no longer answers for a
  work centre nobody typed. A cell-day with no typed number reads BLANK and is
  counted in `diagnostics.no_typed_headcount`, named because a blank the page
  does not count reads as a quiet day. Its unit roll-up's ojidaniya weight
  moves with it: `n_idle` is the cell's typed O. SONI from the floor — the same
  weight `idle_source._n_by_cell` applies to the fleet — instead of the cell's
  attendance headcount. Before the floor every one of these keeps the derived
  answer, so history is untouched.
- **The brigadir's own row on that page IS /zagruzka's row** (2026-09-09, the
  operator's directive) — taken from `build_metrics_list`, which the endpoint
  was already calling for the reconciliation block, never re-derived. It had
  been a sum over the cells, and that sum could not express three of the fleet's
  rules, each of which moved the number: the WHOLE unit's trudoyomkost counts
  against the TYPED pins alone (a roll-up that dropped an untyped work centre's
  minutes as well as its people read **78%** for Ergashev Muxriddin on 07.09.2026
  against **572%** on /zagruzka); attendance is the unit's own payroll, not the
  rows carrying one of its cell codes; and the ojidaniya deduction is weighed
  over every cell that had people, not only the cells that produced a figure
  here. **The two pages can no longer answer one unit-day two ways.** What the
  cells add up to is still computed and is published as **`cells_sum`** — the
  reconciliation card charts that against the unit row, so «do the cells add up
  to the brigadir» stays the question the twin was built to ask, and a gap now
  names something real: a work centre with no cell, a cell with no SAP code,
  people nobody typed, or attendance with no «Код подразделения». Consequence to
  know: the unit row no longer equals the rows above it, and the page says so.
- **A work centre named by SEVERAL cells is SPLIT EVENLY between them**
  (2026-09-09; from 2026-09-14 only the part no GROUP letter claims — a lettered
  cell reads its own group's catalog lines and typed pin, `wc_split` says which,
  see «A work centre's GROUP») — ten groups today, the largest six cells wide (Ibragimova
  Sayyora's A2894; Ergashev's 7222 · 7223 both name A14310). `pp_daily` is keyed by the WORK CENTRE and
  `pp_work_center_daily` by work centre + GROUP, so a cell's own trudoyomkost and
  «Bugungi fakt» exist only through its group letter; for whatever no letter
  claims, nothing in the data says which of the cells produced what. Handing each cell the WHOLE work centre —
  what the page did until then — measured one line's entire production against a
  fraction of its people, so `labor_surplus` drove `effective_hc` toward zero and
  the row read ±1000% (938%, 2498%, 1644% on those two cells), and the roll-up
  then counted those minutes and that headcount once PER CELL. **Evenly, never
  by attendance**: `zagruzka_source.cell_people` already splits that unclaimed
  part of the typed number evenly across the same cells for the ojidaniya weight, and one split
  must not have two spellings. Such a cell's figures are SHARES and say so —
  a `1/N` chip on its work centre (only while `wc_split` is «even»), `wc_share` /
  `wc_cells` on every input row, `diagnostics.shared_work_centers` for the work
  centres still split evenly (`lettered: true` where letters exist but no line
  or pin names them yet), and `grouped_work_centers`, `lines_without_group` and
  `orphan_groups` for the grouped ones (see «A work centre's GROUP»).
- **That page serves EVERY unit from 2026-09-07** (the operator's directive),
  one at a time. The hard lock to «Suvonov Elshod Of» (#5) — its name regex,
  its id fallback and the `lock_warning` it published — is GONE; `?manager_id=`
  picks the unit and `_pick_manager` decides what a viewer may pick through
  `scoped_manager_ids`, so the scope is server-side and the query parameter is
  not a way round it. That scope is the PLANT lock, exactly as on `/zagruzka`:
  a per-cell twin stricter than the page it reconciles against could not be
  reconciled against it. An unknown or out-of-scope pick falls back to the
  first unit the viewer may see rather than 403-ing — the page remembers its
  pick, and a stale one must not lock somebody out. One unit at a time is
  deliberate: the roll-up row, the fleet reconciliation and every diagnostic
  are statements about ONE unit. The picker is a `FilterPanel` section after
  `useFactorySection()`, always ACTIVE (there is no «All» to fall back to) and
  with no `onClear`. **`_cell_label` is now the verifix CODE alone** — it used
  to append the workshop name, which is exactly the regression «A cell is its
  CODE» exists to prevent. Page access is UNCHANGED: `zagruzka-cell` still
  defaults to no roles (admin-only) and is opened per profile on Access /
  Permissions — widening the units it covers is not the same decision as
  widening who may open it.

## TWO comparison tables on `/zagruzka` («Smena boshi va Smena oxiri Zagruzka»)

From **2026-09-20** (the operator's directive) `/zagruzka` carries a SECOND
comparison table directly under the first. Same grid, same data, same colour
bands, same everything — one thing differs, and it is the whole reason the
table exists:

    Plan   (P) = «Ishlab chiqarish plani» ÷ (480 × 0.9 × «Hisobotdagi xodimlar»)
    Actual (A) = «Trudoyomkost»           ÷ (480 × 0.9 × «Hisobotdagi xodimlar»)

i.e. `prod_plan` and `prod_actual` over ONE denominator — the unit's reported
people × a PRODUCTIVE shift. Read it in units and it explains itself: the
numerator is person-minutes of WORK (Σ over the unit's catalog lines of
quantity × Трудоемкость ÷ 60), the denominator person-minutes of CAPACITY, and
0.9 says a person is productive for 432 of the shift's 480 minutes.

- **`utils/formulas.js` is THE definition** — `SHIFT_MIN`, `PRODUCTIVE_SHARE`,
  `simplePlanUtil`, `simpleActualUtil` and the three popup builders beside them.
  Never re-spell the division at a call site: the cell, the pinned summary, the
  column footer, the FormulaModal and the CommentModal all read those two
  functions, so one unit-day can never be computed two ways.
- **It is a PROP on the existing component, never a fork** —
  `ComparisonTable basis="simple"`, resolved once into `planOf` / `actOf` /
  `pctOf`. Everything else about the two tables (the P·A·D toggle, the sort,
  both summaries, the pending ⏳/👥 markers, the approval gate, the comment
  threads, fullscreen) is identical — only the colour BANDS are each table's
  own (see «Every /zagruzka table owns its colour bands») — and a copy would be
  one duplicate of all of it that stops being maintained the first time any of
  them changes.
  `basis` defaults to `"full"`, so `/zagruzka-cell` and every other caller
  compute byte-for-byte what they always did.
- **The ⚙ calculator is NOT offered on it**, and that is the one thing the
  duplicate deliberately does not copy. Its four switches — ojidaniya, early
  arrival, the 10-minute kaizen buffer, the 0.85 changeover allowance — are all
  terms of the FULL formula and none of them appears in this arithmetic, so
  flipping one could not move a number. A control that reports a change and
  changes nothing is worse than an absent one. The page therefore passes it no
  `calcFactors` either, so the "factors active" banner can never fire.
- **Its title is «Smena boshi va Smena oxiri Zagruzka»** (the operator's call,
  2026-09-25 — it shipped as «Soddalashtirilgan hisob»; the key is still
  `zagruzka.simpleTable`), and its COMPARE view prints no «Plan (P) va Haqiqiy
  (A) yonma-yon» subtitle — the title names the pair itself. The full table
  keeps that line, and both keep the diff view's «D = P − A» one.
- **The two tables show DIFFERENT numbers for the same unit-day, by design, and
  both are titled so neither is the unlabelled default** — «To'liq hisob» and
  «Smena boshi va Smena oxiri Zagruzka», each printing its own formula under
  its title.
  Plan is the full table's P ÷ 0.9, so **every value reads 11.1% higher**. The
  two tables shared ONE set of bands until 2026-09-24, which therefore painted
  this table greener: a unit reading 77% next door read 86% here, i.e. green.
  From that date each owns its bands, seeded from the shared ones — so it goes
  on painting greener until an admin moves this table's own edges.
- **Both columns share one denominator**, so `A ÷ P = prod_actual ÷ prod_plan`
  = ВЫП%, and `D = P − A` is exactly the plan shortfall in загрузка points.
- **A ZERO is treated as NO DATA.** `DailyMetrics` defaults both `prod_plan`
  and `prod_actual` to 0.0, so a figure the file never mentioned is
  indistinguishable from a real zero; the full table already blanks both cases
  (its `ratio` is falsy at 0), so blanking them here keeps the two grids
  marking the same days as "no answer". **One deliberate difference:** a day
  with a plan and NO actual shows the simplified table's Plan and a dash for
  Actual, where the full table blanks BOTH halves — the simplified Plan needs
  no `ratio`, so it can answer where the full one cannot.
- **`official_hc` is the headcount either way**, so nothing here cares which
  basis the day is on: it is the typed «Bugungi fakt» from
  `zagruzka_source.ZAGRUZKA_FROM` and the «Одам сони» sheet before it.
- **`/zagruzka` only** (the operator's call). `/zagruzka-cell` was considered
  and deliberately left alone — its rows are cells, whose headcount is a
  per-group SHARE, so the same formula there is a different decision.
- Everything is derived per request from the existing `/api/heatmap` payload —
  no backend change, nothing stored, so no migration and no re-sync.

## «To'liq hisob · Verifix × 0.9» — the third comparison table (`/zagruzka`)

From **2026-09-25** (the operator's request) a third comparison table sits
directly under «To'liq hisob»: the FULL formula, term for term, with ONE number
changed — the recorded Verifix hours enter the effective headcount at **0.9
instead of 0.85**.

    P = prod_plan ÷ (480 × official_hc)                     — the full table's own P
    A = prod_actual ÷ (effective_hc′ × (avail_min − ojidaniya − early − 10))
        effective_hc′  = official_hc + (verifix_labor′ − prod_actual) ÷ avail_min
        verifix_labor′ = recorded hours × 60 × 0.9

- **P is identical to the full table's by construction** — it has no Verifix
  term. Only A moves, and always DOWN: more productive minutes per recorded hour
  is more effective people for the same output. Abdukarimov Sanjar, 24.09.2026:
  effective headcount 62.55 → 66.72, A 119% → 111%.
- **`utils/formulas.js` is THE definition** — `full90ActualUtil` and the two
  CommentModal builders (`commentFull90ActualFormula`,
  `commentFull90EffectiveHcFormula`). The 0.9 IS `PRODUCTIVE_SHARE`, the same
  number the simplified table and «Samaradorlik» apply, never a second
  constant. The hours are recovered as `verifix_labor ÷ 0.85` (the rule
  `verifixMinutes` documents); a payload without the component rebuilds it
  from the surplus. The full table's popup builders now share their layout with
  these (`actualComment`, `effectiveHcComment`) and print byte for byte what
  they did.
- **`ComparisonTable basis="full90"`**, a prop like `"simple"`, never a fork. Its
  blanks are the full table's: no official `net_util` ⇒ no figure.
- **The ⚙ factors are the official table's alone** (`factorsApply = basis ===
  "full"`): they are what-ifs on THE загрузка, this table already is one, and
  the switch that names «15%» would lie on it.
- **The page renders all three comparison tables through ONE builder**
  (`comparisonTable(which, isFull)` over `COMPARISON`, in page order), inline and
  fullscreen, so the three can never drift apart; the table key IS the basis,
  the band-table key and the `openFull` value.
- **Its colour bands are its own** (`comparison_full90_p_segments` /
  `comparison_full90_diff_segments`), seeded ONCE from the full table's by
  `startup.seed_full90_bands` (flag `zagruzka_full90_bands_2026_09_25_v1` —
  the 2026-09-24 split had already run everywhere, so it needed a flag of its
  own), so it opens painted exactly like the table it is read against.
- Everything is derived per request from the existing `/api/heatmap` payload;
  nothing about the official загрузка, any KPI or `VERIFIX_EFFICIENCY` changed.

## Plan fulfilment and Efficiency heatmaps (`/zagruzka`)

From **2026-09-21** (the operator's directive) two single-metric heatmaps sit
directly under the fleet heatmap («Карта нагрузки») and above the funnel —
COPIES of it: same grid, same pending markers, sort and AVG/MAX/MIN column,
and — from 2026-09-24 — colour bands of their OWN, seeded from the fleet
heatmap's (see «Every /zagruzka table owns its colour bands»). Each reads ONE
number per unit-day:

    Reja bajarilishi = TRUDOYOMKOST ÷ ISHLAB CHIQARISH PLANI      (prod_actual ÷ prod_plan)
    Samaradorlik     = TRUDOYOMKOST ÷ capacity
      capacity       = VERIFIX MINUTES × 0.9
                     − HISOBOTDAGI XODIMLAR × (ojidaniya + early arrival + 10)

- **`utils/formulas.js` is THE definition** — `fulfilUtil`, `verifixMinutes`,
  `effCapacity`, `effUtil` and the three CommentModal builders. The cell, the
  row summary and the popup all read those functions.
- **A prop on the existing grid, never a copy** — `HeatmapChart cellValue={…}`,
  resolved once into `read` and used at every read site. Omitted, it is the
  fleet heatmap's own Plan/Fact switch, byte for byte. **Never name that prop
  `valueOf`**: every object inherits `Object.prototype.valueOf`, a destructuring
  default applies only to `undefined`, and the fleet heatmap (which passes
  nothing) then called the inherited method on each cell and crashed. That was
  caught in the browser before it shipped; the comment at the prop says why.
- **Efficiency is OUTPUT ÷ AVAILABLE TIME, so high = good** (the operator's
  ruling, 2026-09-21). The inverse (capacity ÷ output) was the formula first
  written down; it is a COST measure where lower is better, and under the
  shared bands it painted an idle shift green and an over-producing one red.
- **It is the attendance-based twin of the full table's A (`net_util`)**: same
  three per-person deductions and the same 10-minute kaizen buffer, but the
  capacity comes from minutes actually CLOCKED × 0.9 instead of the typed
  headcount corrected by labour surplus. A gap between the two says the typed
  headcount and the attendance file disagree about the day.
- **VERIFIX MINUTES are RAW (hours × 60) over the direct-role rows** — the set
  `verifix_labor` is summed over. The payload ships only `verifix_labor` =
  hours × 60 × 0.85, so the raw figure is `verifix_labor ÷ VERIFIX_EFFICIENCY`,
  exact to the 2-decimal rounding it is stored at (verified against the
  attendance table summed directly: 247/247 unit-days, max drift 0.006 min).
  **The 0.85 is NOT applied** — the operator's 0.9 is the only productivity
  factor; stacking both (0.765) read ~18 points higher.
- **ojidaniya and early arrival are PER-PERSON minutes** on this payload (the
  full formula subtracts them from a per-person base), which is why they are
  multiplied by the headcount here to become the unit's total.
- **Blanks**: no ФАКТ (a 0 is the payload's default for "never said"), no plan
  (fulfilment), no reported headcount (the platform's standing rule — the blank
  IS the warning), and capacity ≤ 0 (deductions exceeding attendance).
- **A cell tap opens the (brigadir, date) comment THREAD with this table's own
  formula** (the operator's choice) — unlike the fleet heatmap, whose tap is
  formula-only. `CommentModal basis="fulfil"|"eff"` renders ONE formula row
  instead of the P/A pair (its rows are data now, one list for all four bases),
  and the efficiency popup's capacity row expands into its own arithmetic. The
  per-person terms print at 2 decimals: they are multiplied by the headcount,
  and at 1 decimal the working a reader redoes by hand drifted up to 7.6
  minutes from the printed result; at 2 it reconciles to within one.
  Consequence to know: like the simplified comparison table, a comment is
  stored against (brigadir, date) only, with no record of which table's number
  it was about.
- **No Plan/Fact toggle** on either — one number, nothing to switch.
- **Their fullscreen opens at once, data or not**, and shows the loader or the
  empty state inside — the fleet heatmap's behaviour. The first cut guarded the
  overlay on data, so on an empty or still-loading period the button armed
  `openFull` and drew nothing, and the overlay then opened by ITSELF the moment
  data arrived.
- **ONE fullscreen state** on the page (`openFull`: null | full | full90 |
  simple | heatmap | fulfil | eff) replaced a boolean per overlay: with six overlays at
  one z-index, "one at a time" has to be structural, and the simplified table's
  flag had slipped past the Escape handler, which only knew the two originals.
- Everything is derived per request from the existing `/api/heatmap` payload —
  no backend change, nothing stored.

## Every /zagruzka table owns its colour bands

From **2026-09-24** (the operator's directive) each of the five tables on
`/zagruzka` — «To'liq hisob», «Smena boshi va Smena oxiri Zagruzka», «Карта
нагрузки», «Reja bajarilishi», «Samaradorlik» — carries its OWN colour bands,
edited from a sliders button in the table's own header (ADMIN only, inline and
fullscreen). The admin panel's «Ko'rinish» tab, where two editors served all
five, is gone.

- **`routers/settings.ZAGRUZKA_BANDS` is THE registry** — table → field →
  (setting key, default) — served on `GET /api/zagruzka-bands` together with
  the keys a save writes and the `shared` tables.
  `components/zagruzka/TableBandsModal.jsx` holds the editor (the old admin
  `SegmentBar`, moved), `BAND_TABLES` (each table's bars and the readers that
  size them) and `useZagruzkaBands`. The write is the ordinary
  `PUT /admin/settings`, so it stays admin-only, action-logged and undoable.
- **Two tables hold the PLATFORM-WIDE keys** and re-colour other pages when
  saved: the load heatmap owns `heatmap_segments`, the full table the two
  `comparison_*` keys — what `/heatmap-thresholds` / `/comparison-thresholds`
  serve to Overview, Kunlik, Smena kunligi, Yacheyka zagruzkasi, the brigadir
  profile and every funnel. Nothing else edits those keys any more, so moving
  these two tables onto keys of their own would leave those pages with no
  editor at all. Their modal names the pages BEFORE the save.
- **The other three have keys of their own** (`heatmap_fulfil_segments`,
  `heatmap_eff_segments`, `comparison_simple_p_segments` /
  `comparison_simple_diff_segments`), seeded ONCE from the keys they used to
  share by `startup.split_zagruzka_bands` (flag
  `zagruzka_table_bands_2026_09_24_v1`, insert-only; changing what it seeds
  needs a NEW key) — so no table changed colour when this shipped. A key with
  no row reads the same default its source does. The sixth table, «To'liq
  hisob · Verifix × 0.9» (2026-09-25), has its own pair too, seeded from the
  full table's under a flag of its own — see its section.
- The funnel on `/zagruzka` keeps the full table's D bands, as before.
- A bar is sized off the SAVED bands and the period's own values (read through
  the table's own functions), never off the draft — a bar that grew as an edge
  was dragged toward its end would rescale under the pointer.

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
  50-min flag and the flat 480 base are unchanged; `/zagruzka-cell` is the test
  twin (its reconciliation delta should read ~0 from the floor on, for every
  unit — and it now serves every unit, not one). The sheet keeps IMPORTING for everybody — it feeds
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
inside a date cell by cell, the table of that cell's own events. The bar was a
number with no way in — 464 minutes over a fortnight and nothing about which
cell stopped, when or why.

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
- **The `/idle-cell` TIMELINE is gone from it** (the operator's call,
  2026-09-08). It drew each cell's events to scale across the cell's whole day,
  so the stops this register exists to show — a few tens of minutes — were
  slivers, and every cell block on every date paid a fixed strip of height for
  them. The clock is already on every row in figures, twice. `DayTimeline` is
  untouched and still THE timeline on `/idle-cell`; only this caller stopped
  drawing one, and `summary` stays on the payload because a bundle still open
  on 4.65.0 renders it. `idle_intervals.merged_spans` is unchanged and still
  the one definition of the union — the header total on a cell is that union,
  and `stopped_only=False` is still what the To'xtamaganda half needs, where
  the recorded fact IS the subject.
- **Minutes are WHOLE here** (same call). The page's own `fmt` carries one
  decimal, which is right on a KPI card averaging a fortnight and wrong in this
  register: a filed event is picked to the minute and the unit figure beside it
  is a weighted mean, so «27.4» claims a precision neither number has. The
  modal passes `fmt(v, 0)`; in «hrs» the page's formatter ignores the argument,
  so that half is untouched, and the page itself keeps its decimal.
- Only cells that have waiting appear; dates are newest-first, collapsible, the
  newest open. A cell's header total is the UNION of the rows shown, with the
  plain sum in its tooltip where an overlap makes the two differ.
- **A cell's header names how many PEOPLE stood in it** (2026-09-08) —
  `idle_source.cell_headcount`, THE weight the unit's mean divides by and not a
  second count, beside the total. «—» and never 0 where there is no answer: a
  cell whose work centre nobody typed enters neither side of that mean. The
  leader's name beside the code is shortened by `utils/personName.shortPerson`,
  the platform's one rule, with the full spelling on hover. Both facts are on
  the «Yacheykalar» sheet of the page's own workbook too.
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
  every supervisor, the stopped half as the headline with the not-stopped half
  named beside it. The toolbar's filters change nothing — which is exactly why
  the button never fires without its `ConfirmDialog`, which writes the whole
  scope out.
- **Its categories are the ЗАГРУЗКА's, not the page's «Barchasi»** (the
  operator's ruling, 2026-09-04). `sheets_reader.OJIDANIYA_ONLY_CATS` — «Cat
  H», Тозалаш — is out of the deck entirely: no total, no ranking, no chart, no
  glossary row. It is expressed as **`DECK_KPI_ONLY` in `routers/downtime.py`**,
  i.e. the platform's own `kpi_only` flag on the two readers the deck already
  goes through, and applied BEFORE the per-cell union so a dropped category
  cannot survive inside a merged span. `ojidaniya_deck` filters nothing itself
  and must not start — that flag IS the one door for «which categories the
  загрузка counts», and a second spelling is how the file and the page start
  disagreeing about one week. The confirm dialog names this scope
  (`downtime.scopeZagruzka`), because a confirm that exists to write the scope
  out must not write it out wrongly. **Consequence to know:** the deck's totals
  no longer match `/downtime` with «Barchasi» selected — they match
  «Zagruzkada hisoblanadi», which is what the page opens on.
- **No text on a slide can land on other text, and that is structural.**
  Everything is absolutely positioned and a PowerPoint text box does not clip,
  so a string longer than its box is drawn straight over what sits underneath.
  On 2026-09-04 that reached the operator: an event note capped at 96
  CHARACTERS took two lines in a box built for one, and its second line landed
  on the «61 min · 8811 · 30-avgust» meta line nailed 0.21" below it. A
  character cap cannot express «one line» — the card is a third of the page on
  one slide and a quarter of it on another — and there were forty such guesses.
  The rule now lives in two places, neither of which is a call site:
  - **`services/deck_text.py` measures**, and `_text` is where it bites: it
    works out from the BOX how many lines fit, wraps to the box's own width and
    trims the rest with an ellipsis at a word boundary. A caller cannot opt out
    and does not have to remember to. Widths are Calibri's own advance table
    (with Cyrillic — the register spells brigadirs in two alphabets) biased
    WIDE by `SAFETY`: over-estimating breaks a line one word early, which
    nobody notices; under-estimating puts text back on top of text. **Never
    tune those numbers to make something fit — widen the box.** Lines are
    broken here and drawn as explicit `<a:br/>` breaks (each stamped with the
    run's own size, or the theme's 18pt default makes the block taller than was
    measured), so the lines measured are the lines drawn.
  - **`deck_text.check_layout` verifies the other half on the finished file** —
    no text box off the page, no two text boxes intersecting. Trimming alone
    only promises a string stays inside its own rectangle; if two rectangles
    overlap, two well-behaved strings still collide. It runs inside `build()`
    on the real week and LOGS its findings rather than raising: an operator
    waiting on Wednesday's report is not served by being handed nothing.
  - **A stack of variable-height items is drawn against a BUDGET, never a
    constant step.** `_events` measures each note (up to `EV_NOTE_LINES`),
    places the meta line at whatever height that note actually took, and stops
    when the next event would cross the `bottom` it was given. The old constant
    0.5" step was only correct while every note happened to be one line.
  - A person's name shortens rather than truncates (`short_name`): the full
    name where it fits, then trailing parts to initials one at a time.
    «Абдурахмонова Г. Ш.» says who this is; «Абдурахмонова Гулнора Шухрат…»
    says the platform ran out of room. `GET /api/downtime/deck-window` serves the
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

## A concern's deadline is its RECEIVER's

From **2026-09-23** (the operator's directive) the creator of a concern no
longer sets a deadline — on `/concerns` or `/cell-concerns`. Whoever HOLDS it
sets one when they take it into work (status → doing), because a deadline is a
promise and only the person making it can make it.

- **`routers/concerns.py` owns the rule, at the endpoint**: `create_concern`
  and the worker filing store none (a `deadline_days` a client still sends is
  ignored); the flip INTO doing must carry one (400 without); while the
  concern is in work its holder (`_can_set_status`) — or an admin — may move
  it; any other change is refused. An UNCHANGED value always passes, so every
  round-trip save keeps working. Bounds 0–`MAX_DEADLINE_DAYS` (365).
- **Still days, now with an anchor**: `leader_concerns.deadline_from` is the
  day the count starts — stamped on the flip into doing (or on a first
  deadline); moving one keeps it. NULL = a creator's deadline from before this
  rule, which keeps counting from `entry_date`. Nothing was migrated or cleared.
- **`_due(c)` is THE due day** and ships as `due_date` on every row. The
  register, the mobile card, the charts, the Excel export, `/cell-concerns` and
  its stats all read it (overdue = open and `due_date < today`); the weekly deck
  reads the same pair through `concerns_deck._deadline`. Never re-derive
  `entry_date + deadline_days` on a client.
- **Every door that flips into doing asks for it**: the inline pill opens a
  «take into work» prompt (empty — an old number was somebody else's), the
  edit modal shows the field only to the holder while the concern is in work,
  and the `/cell-concerns` detail modal does the same for the leader.
- **`concern_started`** is the notice for that flip (holder's `_interested`
  audience + the CREATOR, who no longer names the deadline and is waiting on
  it), with the due day as a `⏳` row; `concern_reopened` / `concern_edited`
  carry the same row while the concern is in work.

## The weekly Concerns deck (`/concerns` → «Haftalik hisobot»)

From **2026-09-23** (the operator's rulings, asked and answered one by one)
`/concerns` carries a PPTX beside «Excel» — `POST /api/concerns/export.pptx` →
`services/concerns_deck.py`, prose by Gemini in `services/concerns_narrative.py`.
It is the Ojidaniya deck's twin: same look, same `_text` / `deck_text` no-overlap
rule (imported from `ojidaniya_deck`, never copied), same delivery, same shape.

- **A fixed weekly report, never a view of the page.** The window is
  `report_week` — last Wednesday back to the Wednesday before, 8 days, read on
  the PLANT's clock (`ojidaniya_matrix.today_local`) — compared with the 8 days
  before. **Both plants**, both shifts, every unit; the page's filters change
  nothing, so the button never fires without a confirm naming the scope
  (`GET /api/concerns/deck-window` serves it). **Admin only**, checked in both
  endpoints. Button only — no scheduled send.
- **Rows = this week's filings PLUS every older concern still open.** «Yangi»
  counts by `entry_date` (the page's period field); «Yopildi» counts closings in
  the window by `completion_date` (the page's flow-chart close day, entry date
  when earlier), whenever the concern was filed. Days to close = close day −
  entry date, the page's `resolution_days`.
- **State is taken at the END of the window, never at the press.** «Ochiq» =
  not closed by the last day's end; «muddati o'tgan» = the page's own rule read
  the morning after (deadline day ≤ last day). Two presses on two days give one
  file, and last week is computed the same way. Where a concern sat at the end
  (level + holder) is read off the escalation trail: the first move AFTER the
  window records it in `from_level` / `from_name`; an unmoved concern holds
  where it holds now (`_deck_inputs` in `routers/concerns.py`).
- **Worker-filed concerns (/cell-concerns) count EVERYWHERE, rankings
  included** — the operator overrode, for this report, the 4 Sep reading that
  the worker register «cannot be used to judge leaders». **A worker's NAME is
  never printed and never reaches Gemini**: `_deck_inputs` hands the deck only
  `worker: bool`; quotes carry № + cell code.
- **Brigadirs are ranked by overdue**, then open, then filed; everything else is
  a column. A unit's plant is tagged only when it is not the main plant.
- **Concern texts, closing notes and move reasons are quoted EXACTLY as typed**
  — Cyrillic moved to Latin script, nothing else (no case change: the shared
  `_sentence` is deliberately NOT applied to quotes). The closing note is the
  newest `kind="resolution"` comment, `solution` for legacy rows.
- **The recurring problems are COUNTED here, not by the model.** Gemini names
  each theme's concerns by NUMBER (`nums`); `_themes` keeps only numbers the
  week holds and counts them. Every other figure comes from `collect`, and the
  prompt forbids any other number. Gemini gets `BUDGET_S` (70 s) — the whole
  request must beat Cloudflare's 100 s — and any failure ships the deck with
  plain fallbacks. Always Uzbek Latin.
- 12 slides: cover · summary (4 KPIs vs last week) · recurring problems ·
  departments table · top-3 departments with quotes + closing notes · brigadirs
  ranked · 10 oldest open · the chain (ups/downs, where the open pool sits, the
  moves with reasons) · day by day · actions · conclusion · method + quality.
- Logged as `export.concerns_deck`. A deadline typed as a huge number is a
  deadline that never comes (`_deadline` catches the overflow).

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

## The «Toifalar bo'yicha» matrix (`/downtime`, page view tab 2)

From **2026-09-04** `/downtime` is TWO views over one register, switched by a
`SegmentedToggle asTabs` that is the page's FIRST row — above the filters,
because every filter, and both the To'xtaganda/To'xtamaganda and
Zagruzkada/Barchasi toggles, narrow BOTH views. «Tahlil» is the page as it was.
«Toifalar bo'yicha» is a matrix: categories down (expandable to their
brigadirs), the days of a MONTH across.

- **Its figure is NOT the one the rest of the platform reads, and that is the
  operator's ruling, not an oversight.** A leaf cell is a brigadir's minutes in
  one category on one day **divided by the cells that had people standing in
  them that day** — an UNWEIGHTED mean over a cell count. Every other ojidaniya
  number here is the headcount-weighted mean `Σ(Nᵢ·Tᵢ) ÷ ΣN` (`idle_source`),
  where a 20-person cell outweighs a 2-person one. **Consequence to know: this
  tab's totals do not match the Analysis tab's**, and the card says so in its
  own words before anybody reads a cell.
- **So the tab carries NO KPI cards and no charts.** «Jami ojidaniya» on those
  cards is the day's UNION; this table's total is the sum of the category rows,
  and per-category minutes overlap (one cell stopped for two causes is counted
  under both). Two totals of two different kinds, one above the other, read as
  a bug — which is exactly why `UnitOjidaniyaModal` names both of its own.
- **`idle_source.cell_counts` is THE divisor**, for a cells day and a «Смена
  отчёт» day alike — one function, so the two sources can never be divided by
  two different things. It is deliberately not `unit_downtime`'s own
  `cells_with_att` (a sheet day never reaches that function at all), but shares
  its cell→unit map, its `_counted_hc` predicate and its weight test, so for a
  cells day the two answers are identical by construction. **A (unit, day) with
  no counted attendance is ABSENT from it** — that day has no average, and the
  matrix prints «·», never 0.
- **`unit_downtime` gained `by_category_sum` / `by_category_ns_sum`** — the same
  per-category minutes UNWEIGHTED, i.e. the numerator. The weighted pair beside
  them is what every KPI reads; mixing the two up is the one mistake this
  feature can make silently.
- **`_downtime(with_avg=True)`** attaches `by_category_avg`,
  `by_category_ns_avg` and the divisor `cells_att` to every row. Off by default
  (`?avg=1`), because the Analysis tab asks for up to 400 days and has no use
  for it, so every existing caller's payload is byte-identical.
- **`services/ojidaniya_matrix.build()` owns every roll-up** and is handed
  `_downtime`'s output — it never queries, exactly as `ojidaniya_deck` is
  handed the page's own numbers. A category row is the **sum of the brigadir
  averages** under it (so it scales with how many brigadirs are in scope and is
  not itself an average); the last row is the **sum of the category rows**, i.e.
  the whole column. Categories sort by month total, brigadirs by theirs.
- **EVERY brigadir in scope is listed under EVERY category** (the operator's
  call, 2026-09-05) — the ones who waited nothing in it, and the ones who filed
  nothing all month (a row of «·»). The group used to end with «yana N
  brigadirda bu toifada kutish yo'q» and fold them away, on the reading that
  fifteen all-zero rows bury the two that carry the category; the row set then
  changed from category to category, so two groups could not be read against
  each other and a brigadir could not be followed down the sheet. The fold's
  argument is answered by the ORDER instead — carriers sort to the top of each
  group, so a long group is read from the top exactly as the short one was.
  `_downtime` attaches `managers` (the scope's own unit list) for this, under
  the same `with_avg` flag as the averages, so every other caller's payload is
  byte-identical; with no such key the matrix falls back to the units its rows
  name. `hidden` is gone from the payload, both renderers and all four locales.
- **Blank means ZERO, «·» means NO DIVISOR, and a HATCHED column is a day that
  has not happened yet.** Keeping the zeros blank is what lets the non-zero
  values read across 31 columns; all three are named in the legend under the
  table and in the workbook's own footnote, because none of them is guessable.
- **The ramp is GOLD and carries no threshold.** The 50-daq flag is defined over
  a unit's whole-day UNION, so it says nothing about a per-category average — a
  red cell here would be a number pretending to be a verdict. `--brand-rgb` was
  added to both themes for it (`rgba(var(--brand-rgb), a)`); `_MX_BANDS`
  (green→red) must NOT be reused for this table. Category rows and brigadir
  rows get their own ramp DOMAIN: a category row is the sum of the rows under
  it and always larger, so one shared scale washes every brigadir row out.
- **Minutes only, one decimal.** The page's min/hrs switch is deliberately not
  applied — «1 soat 35 daq» cannot be read in a 46px column.
- **The period is a MONTH**, via `DateRangePicker`'s new `month` mode (a year
  stepper + a 12-month grid) — the same template with a prop, never a second
  control; the day-calendar path is untouched by it. The tab keeps its OWN
  month key, so switching views never rewrites the period the other one was
  read at.
- **A month still running keeps ALL of its columns** (the operator's call,
  2026-09-04): on the 4th of September the table and the workbook both carry
  thirty. The period used to be clamped to today, on the reading that an empty
  future column would be taken for «nothing waited» — but the fix for that is to
  SAY which columns are days that have not happened, not to hide the shape of
  the month, and a reader comparing two exports could not tell a short month
  from a truncated one. **`ojidaniya_matrix` decides it and nothing else does**:
  `future`, one flag per date against the plant's own wall clock (`today_local`,
  Tashkent — the box's zone is not contracted anywhere), rides beside `dates` to
  the tab and, through the export endpoint, into the workbook. Deriving it a
  second time from the browser's clock is how the file and the screen would
  disagree about one month. **TODAY is never future** — it is a day in progress
  and its figures are real as far as they go — and a date that will not parse is
  an ordinary column, never a silently blanked month. Such a column carries **no
  value at all**: on screen a faint diagonal hatch (one slate at low alpha, so
  it reads in both themes) under a dimmed date, in the file an empty cell on a
  slate ground under a greyed header. Neither existing glyph could say it —
  blank would read as «cells ran and nothing waited», «·» as «no cell had
  anybody in it». The DateRangePicker's `max` still stands, so a month entirely
  in the future is not selectable.
- **Its own Excel button**, `POST /api/downtime/matrix.xlsx` →
  `ojidaniya_export.build_matrix_workbook` — the same table, with the brigadirs
  as a collapsible Excel outline under each category, **opening COLLAPSED** as
  the tab's own categories do (2026-09-05): the sheet lists every brigadir in
  scope under every category, so an expanded file would bury the summary the
  reader came for under a few hundred rows. Excel reads a closed group as a
  PAIR — `hidden` + `outlineLevel` on the detail rows and `collapsed` on the
  summary row, which is the one ABOVE them because `summaryBelow` is False —
  and either half alone leaves the gutter and the rows disagreeing about the
  state. A SEPARATE file from the
  five-tab report beside it, because it carries a different measure; two
  measures in one workbook is how a reader compares two columns that cannot be
  compared. Logged as `export.ojidaniya_matrix`.
- Visible to everyone who can open `/downtime` and scoped exactly as the page is
  (`_downtime` calls `scoped_manager_ids`), so a supervisor sees their own row
  under each category. The period is capped at `_MATRIX_MAX_DAYS` (62).

## What waiting COST (`/downtime`, page view tab 3)

From **2026-09-09** `/downtime` carries a third view, «Xarajat», which prices
stopped waiting in wages:

    xarajat(yacheyka, kun) = union_minutes ÷ 60 × odam soni × w(kun)

`services/ojidaniya_cost.py` is THE computation and `services/wage_rate.py` owns
the last term. Nothing here is a new measurement — the minutes are
`idle_intervals`' union, the people are `idle_source.cell_headcount` (the very
weight `unit_downtime` divides by), and the day gate is the same `uses_cells`
`_downtime` applies.

- **The register is read CAUSE-first: toifa → brigadir → yacheyka**, and a tap
  on the CELL row opens the events (the operator's restructure, 2026-09-09; it
  was brigadir → yacheyka → toifa, with the toifa row opening the modal).
  Nothing was re-measured: the leaf is the (cell, category) pair `cat_acc`
  already held and the entries endpoint already answered for — the tree is the
  same figures folded the other way up, by `_fold`, which is now THE fold at
  every level of both trees and again after a cell pick.
- **`cat_rows` is that tree; `rows` (brigadir-first) is still served.** It costs
  one extra roll-up off the same accumulators, so the two cannot disagree, and
  it is what keeps this a MINOR: a browser tab open on an older bundle renders a
  table rather than an empty one. The workbook reads both.
- **So the tab prints TWO sums, each named.** With the cause at the top level
  the rows on screen add up to `cat_minutes` / `cat_cost` — a minute stopped for
  two causes is named under both — while the bill stays the union in `minutes` /
  `cost`. «Toifalar yig'indisi» is printed above «Jami» only when they differ,
  with the overlap stated in words under the table. Printing one alone is either
  a column that visibly does not add up or a total that overstates what is owed.
  The KPI cards are the BILL and did not move.
- **A share is taken over the level ABOVE** — a category over Σ categories (so
  they sum to 100%), a brigadir over its category, a cell over its brigadir.
  Against the union bill the top rows could not share out to 100%: they overlap
  it. `hc` stays blank above a cell row, unchanged: a headcount folded over
  several units is a number nobody typed.
- **`narrow()` re-folds every parent it keeps.** The old cell filter re-listed a
  brigadir's cells while leaving that brigadir's own figures — and the grand
  total built from them — covering every cell of the unit, so picking one cell
  printed a total the rows under it did not add up to. Fixed with the
  restructure; both trees are narrowed together, or one payload would carry two
  answers describing two scopes.

- **It is a SUM, and every other ojidaniya figure on this platform is a
  headcount-weighted MEAN.** So its minutes do NOT match the «Tahlil» tab's, the
  same relationship «Toifalar bo'yicha» already has — the card says so before
  anybody reads a figure. Pricing Cat H widens the gap again.
- **Only a STOPPED cell costs** (the operator's premise), so `stopped` is fixed
  and the page's To'xtaganda/To'xtamaganda toggle is not offered here. **Every
  category is priced, Cat H included** — a cell stopped for cleaning pays the
  same wages — so `OJIDANIYA_ONLY_CATS` is deliberately NOT applied and the
  «Zagruzkada hisoblanadi» switch does not reach this tab. The category
  checkboxes are how a reader takes one out.
- **Each minute is paid ONCE.** A cell's figure is the UNION of its stopped
  ranges; a CATEGORY row unions within its own category but categories are
  summed ACROSS each other, because a minute genuinely has two causes and both
  deserve naming. So a cell row on this tab is that cell's minutes for ONE
  cause, and the causes over a cell can total MORE than the cell's own union.
  Never "fix" that by summing the categories: the union is the money.
- **The rate is a contiguous TIMELINE of periods, never one setting.**
  `wage_rate_periods`, edited admin-only through the ⚙ on the toolbar: the
  admin puts a BORDER on a date, which SPLITS the period containing it, so a gap
  is unrepresentable. Each DAY is priced at the rate in force on that day, so a
  raise entered today does not rewrite last month. Editing a PAST period still
  does — deliberately possible, never silent: the Save confirm names how many
  days move (`wage_rate.affected_days`). `effective_from IS NULL` is the open
  first period and `uq_wage_rate_from` folds it with COALESCE, the `uq_ltask_day`
  rule, because NULLs are DISTINCT in a Postgres unique key.
- **An unset rate and an unknown headcount are «—» and a NAMED count, never
  0.** `rate_uzs IS NULL` means nobody has said what that period costs, which is
  not the same as costing nothing; a cell whose headcount nobody typed already
  leaves both sides of the загрузка's own mean. Both keep their MINUTES and lose
  their COST, and the gap rides every level as `unpriced_minutes` and shows on
  the «Narxlanmagan» KPI card. A 0 there would understate the plant's bill by
  exactly the days nobody has configured.
- **The tab keeps its OWN filter state** (`dtcost_*`) — the operator asked for a
  multi-select brigadir and a cascading cell picker, which the other two views
  do not carry, and switching tabs must not rewrite what they were showing.
  Sections: `useFactorySection()` → smena → brigadir → yacheyka (cascading, with
  `note`/`empty`, and a pick the narrowed list drops) → toifa.
- **Visible to everyone who can open /downtime**, scoped as the page is: a
  supervisor reads their own unit's bill. Only the RATE is admin-only, checked in
  the endpoint and not merely by hiding the ⚙.
- **The cell code is NOT a `CellLink` here**: the row is a disclosure, and a link
  inside it would navigate away mid-drill-down — the `IdleCell` accordion's own
  reasoning. And cost carries **no traffic-light colour**: no threshold for
  "expensive" exists, so red would be a verdict the platform has not defined.
  Brand gold only (a single-metric accent), amber only for unpriced.
- Endpoints: `GET /api/downtime/cost` (the tree + the filter option lists),
  `GET /api/downtime/cost/entries` (the modal — a separate call, it can be
  thousands of rows) — weighed over EVERY cell of the unit, the set
  the tree prices with, so its headcount and cost equal the tree's, `GET`/`PUT /api/downtime/wage-rates`, and
  `POST /api/downtime/cost.xlsx` — a SEPARATE workbook from the page's own
  «Excel», because it carries a different measure. THREE sheets, one measure
  each: «Umumiy» (KPI + the category table the screen leads with, Σ by cause),
  «Tafsilot» (that tree flattened, the pre-floor lumps included and marked), and
  «Brigadirlar» (the union bill per unit). The two sums never share a table. Logged as
  `export.ojidaniya_cost` / `config.wage_rate_saved`.
- **Before `zagruzka_source.ZAGRUZKA_FROM` (2 Sep) a unit is priced WHOLE, never
  per cell** (the operator's directive, 2026-09-09). The typed «Odam soni fakt»
  is what makes a per-cell headcount knowable and it does not exist earlier, so
  those days carry ONE figure per brigadir: the unit's own ojidaniya minutes ×
  its «Одам сони» sheet headcount (`HeadcountData.official_hc`, resolved through
  `sheet_alias_map` — exactly what the загрузка divided by then). The MINUTES are
  handed in from `_downtime` (`_pre_floor_rows`), never re-derived: that function
  is the page's one answer to «how much did this unit wait» and already merges
  the cells era with the «Смена отчёт» era. `mean × ΣN = Σ(Nᵢ·Tᵢ)`, so the two
  regimes are the same arithmetic at two levels of detail.
  A period straddling the cut puts both halves under ONE brigadir: its cells from
  the cut on, then a marked **«2-sentabrgacha»** row — pinned LAST (it is a
  different kind of row, so it is appended after the cost sort), not expandable,
  no share, and excluded from every «N yacheyka» count. A unit-day the sheet has
  no headcount row for stays unpriced and is counted, never 0.
- **«Odam soni» is a FACT and is never printed with a `~`** — it is the number
  somebody typed. A row folding days that carried DIFFERENT headcounts shows the
  minute-weighted mean with a `*` and names the range on hover (`hc_varies` /
  `hc_lo` / `hc_hi`); every other row prints the figure plain.
- **A union is only ever taken within ONE date.** Clocks are wall-clock "HH:MM"
  read as minutes-of-day, so 17:10–17:25 filed on the 3rd and again on the 7th
  merge into a single 15-minute span. `_union_by_day` folds per date first — the
  entries modal spans a period, and unioning it flat once reported 25 minutes
  against a sum of 75 and fired the overlap note on a cell with no overlap.
- Days before `idle_source.CELLS_FROM` reach the tab through the same pre-floor
  path (their minutes are the «Смена отчёт» row); the date picker is deliberately
  not clamped, and the empty state names the floor instead.

## WHO answers for a waiting category (`idle-owner`)

From **2026-09-10** (the operator's directive) each ojidaniya category has ONE
named person answerable for driving it down — the **«Kutish mas'uli»**, a role
of its own. Two separate things follow, and `services/idle_scope.py` is THE
definition of both, for the reason `factory_scope` is the one definition of the
plant: if each page decided for itself what «Cat D3's owner» means they would
disagree the first time a category changed hands, and nobody could tell which
page was lying.

1. **The NAME.** Every by-category surface prints its owner beside the category:
   the «Xarajat» tree, the «Toifalar bo'yicha» matrix and all three workbooks. A
   cost figure with nobody's name against the cause is a number nobody owns.
2. **The SCOPE.** A viewer holding the role reads `/downtime` and `/idle-cell`
   through their own categories and no others. Applied server-side and never by
   hiding a control — `?cats=` is a query parameter anyone can type.

**They read the pages everyone else reads, narrowed.** A page of the role's own
(«Mening toifam», `/idle-owner`) was built and WITHDRAWN the same day, on the
operator's call: narrowing the two pages people already know beat teaching them
a third. `routers/idle_owner.py` survives with the ADMIN register alone, and
the `idle-owner` PAGE KEY is gone from `PAGE_KEYS` — a stored Access matrix
still naming it is dropped harmlessly by `get_page_access`, which walks
`PAGE_KEYS`, so no migration was needed. Do not resurrect the page without a
new decision; the two locks below are the feature.

- **`idle_category_owners.category` is UNIQUE, and that unique key IS the rule.**
  «One for each category» is the operator's own wording, so it is a guarantee of
  the schema rather than of whoever last edited the writer — the shape
  `uq_wage_rate_from` is an expression index for. Re-assigning REPLACES; there is
  never a second owner to disambiguate between. A person may own SEVERAL
  categories (twelve causes, fewer people); the inverse is what the key forbids.
- **The owner is a PROFILE, keyed by `identity.profile_key`** — a person, not an
  account, so every holder of that profile is named. The `"role:id"` STRING and
  not `role_profiles.id`, because a supervisor lives in the `managers` namespace
  and may perfectly well own a cause; `WebCredential` already handles both.
- **Nothing is denormalised and NO figure moves, ever.** The owner is resolved on
  read, so re-assigning a category re-labels every past surface at once with no
  migration and no re-sync — the property `wage_rate` and `idle_source` already
  have. What the assignment decides is who is NAMED and what one role may look
  at, never what anything costs. The admin Save says so.
- **`None` is «no narrowing»; an EMPTY LIST is a real answer.** The convention
  `factory_scope.scoped_manager_ids` already uses, and the trap it marks: an
  owner whose categories were all re-assigned matches NOTHING, and reading that
  empty list as «no filter» hands them the whole plant. Every caller tests it
  with `idle_scope.empty_scope`, and both cost endpoints answer with an empty
  unit set rather than letting `ojidaniya_cost.build` read `cats=[]` as «no pick».
- **A PICK and a LOCK are two arguments and never one**, and this is the mistake
  the feature made twice. `resolve_cats` returns the intersection for the QUERY;
  `viewer_categories` is what narrows the OPTION LIST (`cat_lock`) and what the
  payload publishes as `cat_locked`. A pick must not shorten the list it was
  picked from — the rule `ojidaniya_cost.build` already keeps — while a lock
  must. Conflating them once emptied every unlocked reader's category filter,
  and once told an ADMIN who clicked one slice of the doughnut that they may
  only see the categories they answer for.
- **The 50-minute flag does not survive a narrowing.** `flagged` is a fact about
  a unit's WHOLE-day UNION, so it says nothing about one category's share of that
  day — the reasoning that keeps a traffic-light ramp off «Toifalar bo'yicha». A
  payload `narrow_downtime` touched carries `flagged: False`, and the page swaps
  the flag KPI for «how many brigadirs did this cause reach» rather than showing
  a 0 that reads as «nobody exceeded a threshold» about a threshold never
  applied. Its totals are re-summed from the kept categories (the SUM, not a
  union — the convention the doughnut picks already use), and `cat_all` keeps the
  whole option list beside the narrowed `cat_names`.
- **A narrowed register must SAY it is narrowed** — `components/idle/CatLockNotice.jsx`,
  first thing on both pages. Every other narrowing on them is a control the
  reader set and can see; this one is not, so without the notice a fraction of a
  day reads as a quiet shift, and «this cause was calm» and «the other causes
  are hidden from me» are opposite conclusions about one screen. It renders from
  the payload's `cat_locked`, never from the viewer's role.
- **On `/idle-cell` an owner is READ-ONLY, and that is stated rather than
  inherited.** `_may_decide` already answered False for them (they hold no
  unit), so edit and delete were shut by accident; CREATE is gated on the day
  being open, not on a unit, so `_require_unlocked` is its own guard on all four
  writers. `can_add` is served False for them too — a button drawn and then
  403-ing is worse than no button. The lock filters BOTH row models: the legacy
  minutes-only rows carry a category as well.
- Locked endpoints: `/downtime`, `/downtime/matrix`, `/downtime/seasonality`,
  `/downtime/cell-detail`, `/downtime/cost`, `/downtime/cost/entries`,
  `/idle-cell/cells` and all four workbooks. The PPTX deck is admin-only and an
  admin is never locked.
- **Registration is the roster, not the bot branch.** `registration-options`
  builds the name-first login list from supervisors, leaders and the two manager
  tiers; a role missing from it has profiles nobody can claim, however well the
  bot's own branch accepts it. That was shipped broken and fixed in v4.97.2 —
  any future role needs BOTH.
- Admin: «Kutish mas'ullari» (`/admin/upload?tab=idleowners`), one row per
  category, everything a DRAFT until Save. **Admin-only and NOT grantable** — no
  `capKey`, so `capTabs.includes(capKey ?? id)` can never admit a grantee (the
  `permissions` / `logs` / `ltdaily` model): the assignment decides what a whole
  role may read, so handing it out is handing out the ability to widen somebody's
  scope. `POST` re-checks `role == "admin"` itself, the endpoint being reachable
  without the UI.
- **`OwnerChip` renders NOTHING where nobody is assigned** — never «—» and never
  an empty chip. Twelve categories with two owners between them would otherwise
  grow ten placeholders saying only that the register is unfinished, which is a
  fact for the destination that manages it. The WORKBOOKS do print «—», because a
  blank cell in a spreadsheet reads as «this column did not apply here».
- Deliberately unchanged: every figure on every existing surface, the categories
  themselves (`sheets_reader.SHIFT_CATEGORY_ORDER` is still the one list), and
  who may FILE an ojidaniya.

Related memory: `idle-category-owner-role`.

## The checklist config page (`/admin/upload?tab=ltasks`)

From **2026-09-07** the destination is «Chek-list sozlamalari» and it is TWO
tabs over one config, not the 22×13 brigadir×task matrix it was for a year.
`pages/admin/LeaderTasksAdmin.jsx`.

- **Why the matrix went.** It painted 273 cells to state 13 facts: every row
  carried the same weights, so the one thing the grid could show was the thing
  that never varied, while the settings that DO vary per unit were a 9px
  camera glyph, three 3px dots, or nothing at all. A window, a deadline, a
  criteria text had no cell to be wrong in — which is why a shift-1 window
  inherited by a shift-2 unit (the 26-Aug incident) was invisible until a
  leader lost points for it. The operator's own words were «this is chaos».
- **«Vazifalar» is a SHEET** — 13 task rows × the rule columns, read at ONE
  level chosen by a strip: Standart · Smena 1 · Smena 2 · a picked brigadir ·
  a picked lider. Every cell prints its value AND an origin tag naming the
  level that decided it, so «where did this come from» is answered on the cell
  rather than reconstructed. **`own` is a SERVER fact, never row existence** —
  the supervisor table is DENSE (265 rows carrying enabled/min_media/weight,
  212 criteria byte-copies of the global) because every side-field write
  materialises a full row, so "has a row" marks nearly everything as
  overridden. `leader_tasks.config_ownership` computes it as *value ≠ the
  parent's RESOLVED value*, unit against global and leader against the unit,
  and ships `own` / `own_leader` / `problems` on `GET /config`.
- **«Istisnolar» is the REGISTER** — one row per (scope, task, field) that
  differs, «qiymat ← meros» naming the parent LEVEL, grouped by shift. The red
  «Diqqat» banner counts windows that do not fit their shift and navigates
  here; the two counts apply the SAME `enabled` test, or the banner promises N
  and the table shows something else.
- **The Smena level is DERIVED, not stored.** There is no shift row in the
  data model — a shift template is identical values copied onto that shift's
  units, and the sheet computes it. A real `leader_task_shift_settings` level
  would be truthful and short, and it is deliberately NOT built: it means
  hand-editing ~13 resolver chains that the bot, the reviewer and the scoring
  all run through, in a repo with no tests. The page reads the same either
  way, so the level can be slid underneath later. **Seed and compare a shift
  edit against the TEMPLATE, never a sample unit** — against `unitsOf(shift)[0]`
  the skip-when-unchanged guard silently writes nothing on exactly the mixed
  cell the admin opened to make uniform.
- **The catalog is add / archive / reorder, never delete.** `leader_task_defs`
  carries `default_enabled`, `default_min_media`, `sort_order`, `active_from`,
  `archived_from`. Both dates are FLOORS compared against the SHIFT's effective
  date (`leader_tasks.effective_date(shift)`) — **never `date.today()`**, the
  26-Aug rule — and `catalog_floor()` is the LATER of both shifts' next
  effective dates, so a new task can never appear inside a night already being
  filed. `is_active`/`active_defs` feed the ACTIVE set (bot menu, sweeps,
  compute_completion, requirements_for); `ensure_task_defs()` keeps returning
  EVERY row for history readers, or a past report loses its task names and
  `task_weights` silently rewrites historical completions. Ids are explicit
  (`max(id)+1`, and the sequence is `setval`'d — it was seeded with explicit
  ids and still answered 1). A hard DELETE is refused by three FKs and would
  orphan nine plain-integer `task_id` tables.
- **Anything resolving a checklist must pass the DAY it means.** Once floors
  exist, `effective_leader_config(db, prof)` with no shift and no day answers
  for shift 1 today — and `close_expired_days` runs only on shift 2, only on
  days in the PAST. It and `autoclose_due` now resolve per day inside their
  loops, cached on the day; the same trap caught the submissions list and
  `admin_day_detail`. A stale night otherwise gets scored against another
  date's task set.
- The page keeps `cell_from` AND `per_task_close` / `bot_from`: they are
  constant today, but `PUT /admin/leader-tasks/unit` is their ONLY writer and
  this platform has no shell — CLAUDE.md records what an unset `bot_from` cost
  the camera pilot. All three materialise ONE `LeaderUnitSetting` row, so the
  writes are an awaited chain, never parallel.
- Retired with the matrix: the «1×1» chip, the four stacked name inputs (now
  `LangTextInput`), the column modal's second inline save, the archive channel
  at the top of the page (now a bottom disclosure), the second toast system.

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
- **The date question has FOUR modes** (three from 2026-08-17, the fourth from
  2026-09-07) — three nullable booleans on the same global → supervisor →
  leader chain as the photo window, resolved by `leader_ai.resolve_date_check`
  + `resolve_day_check` + `resolve_time_check`
  (NULL = inherit, NULL everywhere = the strict answer, so nothing changes until
  an admin picks something). Read them as ONE rule, always via
  `date_rule_for` → `DateRule(win, checked, dayed, timed, plus)` — a NamedTuple
  since `day_check` landed, and FOUR values before that when the `date_plus`
  tolerance did (`resolve_date_plus`, the count of days AFTER the
  report's that a proof may be dated; 0 everywhere until a writer exists, and
  there is no admin control for it yet). **Read its fields by NAME**: while it was a bare
  tuple two call sites took three of its four values and every drain pass died
  on the first row with «too many values to unpack (expected 3)» — no verdict,
  no retry burned, just a strip reading «0 of 375 checked · AI error». That is
  why it is a NamedTuple now, and why `day_check` could join it without
  disturbing a caller that did not want it. They travel together through
  `date_flags`,
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
  - `date_check T` + `day_check F` + `time_check T` — **TIME ONLY**: the HOUR
    must be inside the window and the DAY is never compared. Both failures are
    flags — an hour outside the window is `date_mismatch`, no readable hour at
    all is `no_date` — so this is the strict rule with its unanswerable half
    dropped, never a relaxation of what remains. It exists for the proof whose
    only clock is a phone **status bar**, which by construction carries no date:
    strict mode answered `date_mismatch`/`no_date` (a rejection) on a proof
    whose one legible fact was exactly what the window asks about, and neither
    escape worked — date-only throws the hour away and then demands the very
    date the status bar cannot show, and exempting the task answers nothing.
    The model is asked the STRICT question (`screen_dates=False`): an in-app
    date says nothing about an hour. `plus` and `shift` say nothing here either
    (both only move WHICH day counts), so `clock_in_window` answers this branch
    BEFORE it parses the report day.
  - `date_check F` — **not asked at all**.
  **`day_check` is a THIRD column and NOT the free (date_check F, time_check T)
  corner of the old pair, and that is load-bearing**: the flags resolve down the
  chain INDEPENDENTLY, so a unit that exempts the date while inheriting
  `time_check` True from the global floor already sits in that corner and reads
  as exempt — twelve supervisor rows did on the day this shipped. Giving the
  corner a meaning would have re-armed the date question on every one of them at
  once, silently, as a deduction. `day_check F` + `time_check F` judges nothing,
  i.e. the exemption spelled with two extra columns; the admin never offers it
  and `date_flags` reads it as the exemption it is.
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
  asked", which is the third mode, not this one. Admin: ONE four-option date-rule
  `SegmentedToggle` in the ltasks modal → `PUT /admin/leader-tasks/date-check`
  + `/time-check` + `/day-check`, all tri-state, four-way addressed like
  `WindowIn` and sharing `_write_date_rule`, written one AFTER the other (they
  materialise the same override row, and parallel inserts race its unique key).
  What a verdict was MEASURED AGAINST is `leader_ai.expected_text` — ONE
  definition with four shapes (dated window / accepted days / bare clocks /
  nothing), because three surfaces print it; `verifyState.expectedLabel` is its
  client twin for the label beside it. Three traps:
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
  photos, and a "verified 62%" would contradict the register. **From
  2026-09-15 the BRIGADIR's copy of a bot day is not a message of its own** —
  it is one row of the unit's day digest; see «The brigadir's day digest»
  below. The leader's own DM is unchanged.
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
- (SUPERSEDED 2026-09-26: cards are summaries that open the appeal chat, where
  the verdict, the photos and every note are — «The appeal CHAT».)
  **The «Norozliklar» tab is where all three read it** (`GET /leaders/disputes`
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
- **An ADMIN's REFUSAL cannot be made wordlessly, and the reason goes to the
  leader** (2026-09-10, the operator's directive). It is the END of the chain —
  the leader has explained their shift to two people, loses the point for good
  and has no route left — so «rejected» with nothing beside it is the platform
  declining to say why on the one decision that cannot be argued with.
  `leader_dispute.decide_admin` refuses an empty note on `rejected`
  (`Refused("note required")`, the word the uplift guard already uses),
  `leader_dispute_rejected` prints it as «Sabab» (a REQUIRED reason, not the
  optional «Izoh» its stage-1 twin keeps), and every door collects it: the
  `/decide` endpoint pre-checks with a **400** naming what to do, the two
  queues and the day report open the SAME note form the uplift uses
  (`needsNote` — a property of the ROW as well as the verb), and the Telegram
  card PAUSES on the tap (`telegram_bot._ad_ask_admin_reason` → an `ad_arej`
  capture → `_decide_leader_dispute(note=…)`, which is also why that function
  and `_log_leader_dispute` now take a note). The `ap:` keyboard is shared with
  four other approval kinds, so the pause lives in `handle_approval_callback`'s
  `ld` branch, never in the keyboard.
  **APPROVING still needs none** — the outcome IS the answer — and **stage 1 is
  deliberately untouched** (SUPERSEDED 2026-09-26: a brigadir's refusal now
  requires a comment too — see «The appeal CHAT»): a brigadir's refusal is not the last word (an
  admin's undo reaches it, and the leader may file again), so forcing words
  there would be a rule with no consequence behind it. Same rule, same shape,
  in `leader_late_proof.decide_admin`.
- **…but an approval may CARRY one, and it is optional** (2026-09-10, the
  operator's directive). «Does this ruling OFFER a comment» and «does it DEMAND
  one» are two questions and the client keeps them apart — `collectsNote` /
  `noteRequired` in both queues, `noteRequired` on the day report. **Every
  admin-stage ruling offers the box**, because an approval lands in the
  leader's notice exactly as a refusal does and an admin who wants to explain
  either should be able to; only uplifting and an admin's refusal demand it.
  So all three rulings open ONE form rather than three, an optional field says
  so on its LABEL (`FormField`'s red star is what a required one says), and
  nothing blocks the Save — the commonest ruling on the queue must not become
  a typing exercise. The backend needed no change: `decide_admin` already
  stored `note` on an approval.
  **The note is on its OWN LINE in every ruling notice now, and the services
  pass `""` rather than «—» for an absent one** — `staff._render_body` drops a
  line whose single placeholder is blank, so an approval nobody commented on
  has no comment line, where an inline «Izoh: {note}» could only ever print
  «Izoh: —». That fixed the same wart on `leader_dispute_approved`, which had
  carried an optional `{note}` inline since it was written. Stored bell rows
  keep whatever they were written with, so nothing already sent re-renders.
  (SUPERSEDED 2026-09-26: Telegram rules nothing any more — «The appeal CHAT».)
  **Telegram approves on the TAP and offers no box** — an optional field in a
  chat means either holding a ruling for text that may never arrive, or ruling
  first and appending after the DM has gone. An admin who wants to comment
  rules from the dashboard.
- (SUPERSEDED 2026-09-26: an undo now REOPENS the row at the stage the ruling
  was made at and its chat with it — «The appeal CHAT».)
  **A settled ruling has an UNDO** (`POST /leaders/disputes/{id}/undo`, admin,
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
- **…but a day still OPEN is never parked** (fixed 2026-09-23). A unit closing
  tasks one at a time has each photo task reviewed minutes after it closes, so
  the drain tried the report while the day was still open, `build_report_row`
  answered None, and the key was parked as «report no longer exists». When the
  day's LAST task then closed with no AI review behind it — an automatic check
  (#8 at 17:00 / 06:00), a deadline, a «Yo'q» — no drain pass touched the key
  again and the sweep skipped it for its ledger row: no DM, so no button onto
  the report page, so no objection. Confirmed on the 11 Sep copy: 124 of 1,002
  closed leader-days never sent, 78 of 101 leaders. `send_for_uid` now returns
  False for an open bot day and writes nothing (`_open_bot_day`, the Ghost-Mode
  shape), and `sweep_unreported` sends the report once the day has closed —
  within one drain pass (≤ 20 min). The sweep drops OPEN days before applying
  its budget, or a shift's worth of them would take every slot while closed
  days waited. It also retries a park written BEFORE its day closed
  (`first_sent_at < closed_at`), for days on or after
  `leader_ai.OPEN_PARK_RETRY_FROM` (2026-09-23) only — the days before it were
  listed for the operator and go out only on their tap
  (`services/missed_report_resend.py`, TEMPORARY, the `mrr:` buttons); never
  move that floor earlier. A closed day parked again for a real reason has its
  park re-dated past the close (`_park`), so the retry stops asking about it.
- **`components/leaders/verifyState.js` is THE verification vocabulary** —
  states, colours, icons and precedence for the register chip, the page and the
  filter. Never improvise a second set of words for these five facts. Every
  state carries an icon as well as a colour. A day voided by the filing window
  shows only its void chip; no second red mark beside it.
- **`/leaders` «Vazifalar» tab (`components/leaders/TaskRequirements.jsx`) is
  where a leader READS the rules** — for every enabled task: name, the
  instruction (`description`) and under it the AI definition of done
  (`criteria`), weight (+ share
  when the enabled sum ≠ 100), min photos, photo window, submission deadline and
  the example photos (72px → the shared `ui/Lightbox.jsx`). Fed by
  `GET /api/leader-tasks/requirements` (`services/leader_tasks.requirements_for`),
  resolved down the global → supervisor → leader chain and scoped like
  `/api/leaders` (a leader → own, a supervisor → own unit or one of its leaders,
  everyone else follows the page filters; global standard when nothing is
  picked). Examples stream from the page-gated `GET /api/leader-tasks/examples/{id}`
  (reference material — an admin-authored picture, nobody's evidence — so it
  keeps no row scope of its own; which ids a reader is handed is already
  decided by `requirements_for`). Day-detail task rows carry an ⓘ that
  jumps to that task's card. The old ⓘ table built from the hard-coded
  `TASK_DETAILS` is gone — never resurrect a config view from the seed.
- **An EXAMPLE photo sits at a LEVEL of the chain, exactly like the criteria
  beside it** (2026-09-04). `leader_task_examples.manager_id` / `.leader_id`
  say which — both NULL = global — and **`leader_ai.example_ids_map` is THE
  resolver**, whose one rule is that the NARROWEST level holding any photos
  wins **WHOLE**: a leader with their own example sees theirs INSTEAD of the
  global one, never both, mirroring `criteria_for`'s first-non-blank. A union
  would hand the leader two answers to "what should this look like" and nothing
  saying which was meant for them. All three readers go through it — the
  reviewer (`task_examples`, now resolved against the report's own
  `manager_id`/`leader_id`, because a photo must be judged against the example
  the leader was actually shown), the «Vazifalar» tab (`requirements_for`) and
  the admin matrix.
  - **Why**: the criteria and the example are ONE statement of what a correct
    proof looks like — one written, one shown — edited in the same block of the
    same modal. Keyed by task alone they could not be: an admin who wrote a
    definition of done for two leaders and uploaded the matching screenshot
    beside it got the text scoped and the PICTURE on every leader on the
    platform. Same shape as the camera setting that reached everybody on
    2026-08-19.
  - **Nothing was migrated and nothing moved.** Both columns are nullable and
    every pre-existing row carries NULL/NULL, which reads as global — precisely
    what those rows already were. Attributing one to a unit would be a guess,
    and a picture attributed to the wrong unit is worse than one attributed to
    nobody. A global row that should not be one is deleted from the unfiltered
    column modal and re-uploaded under the filter.
  - **An upload names its targets and fans out one ROW EACH** (`manager_ids` /
    `leader_ids` on `POST /admin/leader-tasks/examples`): an example is bytes,
    not a pointer. `leader_ids` wins over `manager_ids`, the same precedence
    `colScope()` applies on the client. Sending NEITHER writes global, which is
    what an unfiltered column modal means and what a tab open on an earlier
    bundle still sends — so that case is byte-for-byte unchanged. The per-level
    cap is `_EXAMPLES_PER_TASK`, checked for EVERY target before anything is
    written so a fan-out is refused whole, and `_EXAMPLES_FANOUT_MAX` bounds
    the breadth: a mis-clicked filter must not put a hundred copies of one
    screenshot into every db-dump.
  - **All three ltasks modals carry the strip now**, each scoped to what it
    writes — the brigadir cell (that unit), the leader cell (that leader, THE
    control this exists for), the column modal (global, or the filtered rows).
    An INHERITED photo is dimmed and carries **no delete button**: deleting it
    would reach every other row inheriting the same one, which is the accident
    this scoping ends. Unlike every other field in those modals an example
    applies AT ONCE — bytes, not a staged draft — and each note says so.
- **The leader's text and the AI's text are TWO fields (2026-09-06, the
  operator's directive).** `criteria` is the grader's test and nothing else;
  `description` (new, same three tables, same global → supervisor → leader
  chain, same single-untranslated-text convention) is the instruction the
  leader reads. One field could not be both: "the journal must be filled and
  its last entry must belong to this shift" is a test, not something you tell a
  person to do. `PUT /admin/leader-tasks/description` is the twin of
  `/criteria`, four-way addressed the same way, and it lands on the SAME
  override row — so the modals go on writing it inside the awaited chain.
  **`leader_ai._prompt` does not know this column exists**, which is the whole
  safety argument: a description edit can never move a verdict, past or future.
  **`leader_tasks._resolve_description` is THE resolver and it falls back to
  `criteria`** when no level holds a description — between 2026-08-15 and the
  split the criteria WAS what every leader read, so a task with no description
  of its own keeps showing it and nothing went blank on the day this shipped.
  Apply that fallback only in the RESOLVERS (`effective_leader_config`,
  `requirements_for`), NEVER in the raw admin layers (`effective_settings`,
  `leader_overrides`) — there an unwritten description must read as unwritten,
  or the matrix marks every cell overridden. The «Vazifalar» tab leads with the
  description and prints the criteria under it as «AI nimani tekshiradi»,
  because the rule a leader is judged by is still a rule they get to read; it
  drops the second block when the two resolve to the same string.
- **Leaders READ these texts, so they are ordinary prose — and there is a
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
  unique key) as the three ltasks modals. It covers `criteria` ONLY — the
  descriptions beside them were empty on the day they shipped, so there was
  nothing yet to fix; widening it to both texts is a small, deliberate follow-up
  (one more source in `criteriaItems` and the description endpoint in the save
  loop), not something to assume it already does.
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

## The 19 September 2026 checklist rules (`leader_rules_sep19`)

The operator rewrote the leader checklist task by task (agreed 14—18 Sep 2026)
and the new rules start on **shift 1's day of 19 Sep and shift 2's night of
19—20 Sep**, for EVERY non-archived unit at once. `services/leader_rules_sep19.py`
holds the agreed texts and the one pass that writes them; `startup.register_leader_rules_sep19`
arms it.

- **The `criteria` are ENGLISH and the `description`s are UZBEK, and that split
  is the point.** `criteria` is the grader's test — the reviewer follows
  compound rules most consistently in English — and `description` is the
  instruction the leader reads, in the operator's own words. They are two
  columns for the reason the 2026-09-06 split states: `leader_ai._prompt` does
  not know `description` exists, so an instruction can never move a verdict, and
  a criteria edit only reaches proofs reviewed AFTER it, never the ones already
  judged.
- **Task 13 carries TWO of each, picked by the unit's SHIFT.** Its date rule
  differs: shift 1 fills the report on the day it worked, so the table's date
  equals the computer's clock; shift 2 fills it after midnight, so the clock is
  exactly ONE DAY LATER than the table (table 18.09, clock 19.09). A unit belongs
  to exactly one shift, so per-unit texts express that with no new mechanism.
  Tasks 1, 8 and 9 are deliberately absent — they keep today's rules until the
  automatic checks are built.
- **Two passes, two flags, and neither ever fires mid-shift.** Shift 1 at
  19 Sep 00:30 and shift 2 at 16:30, Tashkent — each in its own shift's gap, so
  no leader is re-judged in the middle of a checklist they are still filling.
  TWO flags because they are two deliveries and "shift 1 is done" must not read
  as "this is done" (the `shared_work_centers` precedent). `_rules_run_at` is
  the rule: before the instant, at it; after it with the shift idle, in a minute
  (APScheduler drops a fire time already 300s past, which would leave the flag
  unset forever with nothing on screen saying so); after it with the shift
  RUNNING, at the first minute after that shift closes. Late is the acceptable
  failure here; mid-shift is not.
- **The flag is written LAST and not in one transaction with the writes** — the
  chain setters in `leader_tasks` each commit for themselves, so the pass cannot
  be atomic. Every write is idempotent instead, so a pass that dies half-way is
  re-run whole by the next boot. Verified: running both passes twice changes
  zero config rows and re-derives zero verdicts.
- **Besides the texts the pass writes the DATE MODE, whole, and two numbers.**
  `DATE_MODES` carries all three flags per task — 11 is DATE ONLY
  (`date_check` T, `day_check` T, `time_check` F) and 13 is TIME ONLY
  (T / F / T) — because writing one flag and inheriting the rest is how a task
  ends up in a mode nobody chose. Two proofs of that, both found on the 11 Sep
  copy: **task 11 was DATE-ONLY on all 13 shift-1 units and STRICT on all 8
  shift-2 units**, which inherit the global `time_check` True — so the same
  «+1 day» meant two different things, and shift 2 went on failing staff lists
  on the CLOCK while the criteria shipped beside it says the clock is not judged
  at all. And task 13's TIME-ONLY would have rested on a global `time_check` an
  admin may edit, at which point `date_flags` returns nothing and the task is
  silently EXEMPT (`not check or not (days or times)`) — the one mode the admin
  UI never offers. Then task 11 `date_plus` = 1, and task 3 `min_media` = 3 plus
  the GLOBAL `default_min_media` 1 → 3. That last one has no setter and no
  endpoint — it is written at seed time and by `create_task` and nowhere else —
  so the pass touches the ORM attribute directly, and it is what a unit with no
  row of its own resolves to.
- **A leader with their own `criteria` and no `description` is made coherent
  FIRST** (`keep_leader_texts_coherent`). Such a leader reads their own criteria
  as the instruction, because `_resolve_description` falls back to the resolved
  criteria — and the moment the unit gains a description that fallback stops
  applying, so they would be TOLD the unit's new instruction and GRADED on their
  own older criteria. Their description is materialised from their own criteria
  before any unit description exists, which changes nothing they see today. Their
  criteria is left alone: it is a deliberate admin edit.
- **Task 13's WINDOW is deliberately NOT written.** `leader_ai.resolve_window`
  falls through to `shift_window(shift)`, so a shift-1 unit storing no window is
  ALREADY judged against 07:00—20:00 and its task ALREADY closes at 20:00 —
  confirmed on the 11 Sep production copy, where 62 of the 68 shift-1 task-13
  closes after 20:00 land in the 20:00—20:04 autoclose sweep. Writing the same
  hours would move nothing and would mark 13 units as overriding a value they
  merely inherit. Shift 2 keeps its own 00:00—08:00.
- **Consequence to know: scores from 13 Aug moved, once, retroactively.**
  `sync_date_flags` takes no date bound, so the pass re-derives every stored
  verdict on tasks 11 and 13 — measured on the production copy: **433 of 4,871
  rows moved, 426 date rejections LIFTED, 1 gained (on a row already rejected
  for `not_proven`, so no score moved) and 6 reclassified `date_mismatch` →
  `no_date`. NOTHING that was clean before is flagged now.** The bulk of it is
  task 11 on shift 2 — 352 lifted — which is the mode correction above, not the
  tolerance: 248 `date_mismatch` → 8 and 112 `no_date` → 0. No corrected report is re-DMed, which is the platform's standing
  rule for a date-rule edit — so the pass's own DM states the count, or nobody
  learns a month of scores changed. It is called ONCE for the whole pass, never
  per unit: the re-derive is per TASK and walks the entire corpus, so
  `rejudge=False` rides every date-rule write inside the loop.
- **Per-LEADER rows are left alone and NAMED.** A leader row shadows the unit
  row under it, so a leader carrying their own criteria, window or date rule on
  these tasks keeps it — those are deliberate admin edits. `leader_overrides_left`
  lists them and the DM prints them, because a rule that silently does not apply
  to some leaders is exactly what nobody finds out about.
- **Two small surfaces changed with it.** The camera info sheet now prints the
  `description` (`routers/leader_proof.py` sends it on both session payloads,
  `ProofCamera.jsx` prefers it) — without that it would have shown leaders the
  English grader prose. And «Vazifalar» prints both texts RAW: it ran them
  through `useTranslit`, the NAME transliterator, which remaps x→kh and q→k for
  the English UI and garbles authored prose in either language.
- **The INSTRUCTIONS were published early, on 18 Sep, and nothing else was**
  (`preview`, flag `leader_rules_2026_09_19_preview_v1`). The operator asked for
  leaders to be able to read the new texts and prepare before anything they are
  scored by moved. Only `description` is written — at the UNIT level and at the
  GLOBAL one, because «Vazifalar» opens on «Umumiy standart» when no brigadir or
  leader is picked, so a unit-only preview left the page an ADMIN opens still
  showing the old text (reported from production, 18 Sep; widening it needed a
  NEW key, `…_preview_v2`, the first being already marked done). Task 13 is
  skipped globally — two shift variants, no global shift — and the global
  CRITERIA are deliberately NOT touched, since those would change what every
  unit is judged by at once, mid-shift. `description` is the one column here
  that cannot move a verdict, so it is safe to write mid-shift — measured on the
  production copy: **0 of 31,962 verdicts and 0 of 1,404 resolved rules
  changed**, global criteria untouched. Writing an instruction without its rule is a
  trap on its own (a leader who reads «the list may be dated tomorrow» and files
  that way the night before would still be judged by the old rule), so every
  preview text carries `PREVIEW_NOTE` saying when it starts, and the 19 Sep pass
  rewrites the same column without it — the notice removes itself. A shift whose
  real pass has already run is skipped, or a box booting later would paste
  «starts on 19 September» over texts already in force.

- **The nine shift-invariant texts are ALSO written at the GLOBAL level, as a
  baseline** (`apply_global`, flag `leader_rules_2026_09_19_global_v1`, the
  operator's call 18 Sep). It runs in whichever per-unit pass finishes LAST and
  never before them: written first, a unit not yet processed would resolve to
  the new text in the middle of its own shift, which is what the two passes
  exist to prevent. **The unit level still wins** — the chain resolves narrowest
  first, so all 21 units go on reading their own text and an admin who edits one
  keeps that edit; measured, the global write changes **0 resolved rules** and,
  since `set_criteria`/`set_description` never rejudge, it cannot move a verdict
  at all. It exists for the unit that does not exist yet, which would otherwise
  inherit «three photos» from the raised `default_min_media` and the OLD task-3
  criteria explaining one. **Task 13 is not written globally and cannot be** —
  its two texts differ by shift and the global level has no shift, so a future
  unit inherits the old task-13 text until somebody gives it one.

- **Tasks 1, 8 and 9 get an INSTRUCTION and no criteria** (`AUTO_DESCRIPTIONS`).
  They are the three becoming automatic checks later, so what they are judged by
  is untouched — but a leader still has to be told what the job is. **These state
  the JOB, never the pass mark**, and that is the operator's rule (18 Sep): a
  minimum exists so nobody fails on a technicality, and printed as the
  instruction it becomes the target — a leader who reads «at least one concern»
  files one concern. So they read «enter the plan and the people for your
  cells», «get your workers writing concerns to you and write one to your
  brigadir», «reach 50% of the plan by the set time», while the thresholds the
  checks will actually use (one concern, 30%) stay where they belong, inside the
  check. Task 9's instruction says 50% though its automatic check passes at 30%,
  and that gap is deliberate. They carry NO «starts on the 19th» notice, because
  none of it starts on the 19th — it is the job as it already is — which is also
  why the pass rewrites them verbatim rather than leaving the preview's copy as
  the last word.

- **It is a TEMPORARY one-shot.** Remove `register_leader_rules_sep19` from both
  entrypoints together with `startup.register_leader_rules_sep19` and
  `services/leader_rules_sep19.py` once both passes have landed — a call left
  behind imports a deleted module at boot, and a failed boot rolls the deploy
  back. Changing what either pass writes needs a NEW flag key.

## The 25 September criteria revision (`leader_rules_sep26`)

From **26 Sep 2026** (shift 1's 00:30 gap, shift 2's 16:30 gap) the AI criteria
of tasks **3, 6, 7, 11 and 13** are the ones rewritten from the operator's
reasons for the 50 AI flags admins lifted on 19–20 Sep (interview 22—25 Sep;
the rulings are in memory `leader-criteria-rulings-sep19-20`).
`services/leader_rules_sep26.py` holds the texts and the pass;
`startup.register_leader_rules_sep26` arms it, in both entrypoints.

- **CRITERIA ONLY — the operator's ruling («Do not edit description for the
  leaders»).** The Uzbek instruction stays exactly as the 19 Sep pass wrote
  it, so what a leader is TOLD and what the grader JUDGES now differ on these
  five tasks (e.g. the KAIZEN sheet, yellow «запас», an empty rokla, Объём 0
  are accepted by the grader and not mentioned to the leader). That is the
  operator's call — do not «fix» it by writing descriptions.
- **What changed, in one line each**: T3 — different products or separate
  stations count as different processes, a sleeve down to the wrist / a bare
  hand / a glove is fine (only a pushed-up sleeve with bare forearm fails), a
  cloth lying on the table is still clutter, two photos of one product at one
  table are still one process. T6 — any transport (vagonetka, rokla, cart),
  loaded or empty; the worker need not look at the goods. T7 — ANY printed
  control form that holds what is asked (code, name, date; per product
  quantity, start, finish, fact) counts, extra columns and writing ignored;
  code/name/date anywhere in the header; a «астаткада бор» row needs no times;
  a struck-through row does not count. T11 — any green, yellow «запас» valid,
  selection frames and legend cells ignored, a weekly/monthly grid judged on
  the clock's day (or the next) only, and a grid with no such column FAILS.
  T13 — Объём 0 is an empty row; empty rows at the bottom may be cut off.
- **A LEADER-level task-3 text for one-process cells** on exactly the five the
  operator named (Akramov, Omonov, Ro'ziyeva, Saidova, Tursunboyev —
  `ONE_PROCESS_LEADERS`, profile id AND name). Criteria only, so they read their
  unit's 19 Sep instruction (`_resolve_description` walks to the first
  non-blank description). Adding a cell = one entry there under a NEW flag key,
  or an admin edits that leader's criteria on «Chek-list sozlamalari».
- **Compare-and-set, never blind.** A level is rewritten only while its
  criteria is blank, still the 19 Sep text, or already the new one; a unit or
  leader an admin edited since 19 Sep keeps its text and is NAMED in the DM.
  Nothing else moves: no date rule, window, photo count, and `set_criteria`
  never re-judges — the text reaches only proofs reviewed after it lands.
- **Tested before it shipped**, blind: grader agents saw only the new text and
  the real 19–20 Sep photos (approved cases + rejected and passed controls).
  Measured on the 11 Sep production copy with the 19 Sep pass replayed first:
  105 unit criteria written, 0 description cells and 0 of 540 resolved leader
  instructions changed, 538 resolved criteria changed (the other 2 are one
  leader's own overrides, named), a second run writes 0.
- **A little bare wrist is not a rolled-up sleeve** (the operator, 26 Sep, on
  a Gemini Pro verdict that failed a cuff sitting a little above the wrist as
  «yenglari shimarilgan»). The T3 text already said a short strip is fine, and
  the grader failed it anyway, so the two sleeve bullets of BOTH task-3 texts
  were replaced IN PLACE (`_sleeve`, which fails the import if the bullets
  ever go missing): a bare forearm is now a bare stretch LONGER THAN THE
  WORKER'S HAND IS WIDE — a scale the model can read in the same photo — and an
  arm too small, blurred or hidden to tell does not fail. The texts as first
  shipped stay as `CRITERIA_3_V1` / `ONE_PROCESS_CRITERIA_V1`; every pass here
  accepts them as its own, and `apply_sleeve` upgrades whatever still holds
  one (exact matches, any level, either shift), naming a level an admin wrote.
  Flag `leader_rules_2026_09_26_t3_sleeve_v1`, run a MINUTE after boot, not in
  a shift gap: it only stops a false failure, so nobody can lose a point by it.
  Verdicts already written are not re-judged («Qayta tekshirish» is the way).
- **TEMPORARY.** Delete `register_leader_rules_sep26` from both entrypoints,
  `startup.register_leader_rules_sep26` / `_leader_rules26_job` /
  `_leader_rules26_dm` / `_leader_rules26_sleeve_job` / `_leader_rules26_sleeve_dm`
  and the module once all four flags (`leader_rules_2026_09_26_shift1_v1` /
  `…_shift2_v1` / `…_global_v1` / `…_t3_sleeve_v1`) are set — and BEFORE
  deleting `leader_rules_sep19`, whose texts it compares against.

## Tasks the PLATFORM answers (`leader_auto`, from 20 Sep 2026)

Three of the thirteen checklist tasks ask about something this platform already
holds, and until **20 September 2026** a leader proved each of them by
screenshotting one of our own pages and sending it to Telegram, where Gemini
read a date off the image to confirm a row sitting in our own database. The
proof was a photograph of the truth. From that day they are decided by
`services/leader_auto.py` instead: at a fixed hour it reads the data, writes
the leader's `LeaderTaskEntry` itself and closes the task.

- **`proof_kind` gains a third value, `"auto"`, and it is not a kind of proof.**
  There is no photo, no upload, no camera and no Gemini call. It is spelled as a
  proof kind because every surface that asks «how is this task answered» already
  branches on that one field; a fourth question would have to be added to each
  of them and would be forgotten at one. **`leader_auto.is_auto` is THE test and
  it asks BOTH halves** — switched to "auto" AND naming a check that exists.
  A task that says "auto" and names nothing would be unanswerable: no leader may
  file it and no sweep would close it, so its day would hang open forever, which
  every read surface reads as «this leader filed nothing».
- **WHICH check is global; WHEN it is asked is per unit.** `LeaderTaskDef.auto_check`
  (`plan_staffing` · `concerns` · `plan_pct:30`) is deliberately NOT on the
  global → supervisor → leader chain: what «Kunlik plan» MEANS is the same
  question about the same dashboard for every unit, and a per-unit answer would
  be a per-unit definition of a word. The HOUR is the chain `deadline`, read
  through `leader_close.due_at`, so it is an ordinary admin field on «Chek-list
  sozlamalari» and a night shift is asked at 23:00 what a day shift is asked at
  10:00. This module chooses no clock of its own and must not start — two
  anchors for one hour is how a task closes before it opens (2026-08-26).
  **A per-LEADER `deadline` on an auto task is not honoured** (`_unit_due` reads
  the unit level only): a check is a statement about a shift, and two leaders of
  one brigade asked at two hours could not be compared. `leader_auto_rollout.leader_overrides_left`
  names any that exist rather than letting them sit unread.
- **Nothing is re-measured.** The plan and the percentage come from
  `routers/production._build_dashboard` — the function `GET /api/production/dashboard`
  itself calls — narrowed by the leader's own `sap_codes_for_leader` /
  `sap_groups_for_leader`; the typed people come through `zagruzka_source.typed_pins`,
  the one door for that question. It imports a ROUTER from a service, lazily and
  on purpose (`leader_tasks` already reaches for `routers.leaders.WINDOW` the
  same way): re-deriving the plan here would give the check and the page two
  answers about one shift, and the check is the one nobody can argue with.
- **The three rules, all the operator's** (agreed 14—18 Sep; **ONE CELL IS
  ENOUGH** from 2026-09-22, below): `plan_staffing`
  (#1, 10:00 / 23:00) — a plan above 0 on ONE cell's own positions AND that same
  cell's people TYPED, **asked through
  `zagruzka_source.cell_pins`, the platform's one pin split**, and never by
  testing whether the exact `(code, letter)` pair carries a pin: the two pin
  kinds are mutually exclusive by design, so that spelling fails a LETTERED cell
  whose brigadir typed one whole-centre number — the state CLAUDE.md records the
  fleet as being in («A grouped work centre whose brigadir keeps typing one
  whole-centre number still splits it evenly», ten such work centres) — and would
  have deducted ten points a day from leaders whose /production page plainly
  shows the number filled in. `cell_pins` is handed EVERY cell of the unit, never
  the leader's alone, or a short list reads every other group's people as
  unclaimed. **A typed 0 passes**, because `people_overridden` and never the
  value is what tells typed from absent;
  `plan_pct:30` (#9, 14:00 / 03:00) — the «Bajarish %» of ANY ONE of the
  leader's work centres, as /production states it for a leader of that cell, at
  or above the target **carried in the setting**, so
  the threshold moves without a deploy; `concerns` (#8, 17:00 / 06:00) — one
  `leader_concerns` row created between 00:00 of the checklist day and the check,
  written BY the leader or filed by a worker against any one of their cells, tested on
  `created_at` and never `level_since`, so passing an older concern up does not count.
- **ONE CELL IS ENOUGH** (the operator's ruling, 2026-09-22). A leader who owns
  several cells passes a task when any one cell meets it. Until then #1 demanded
  EVERY cell, so one cell the leader could never type (no SAP code, a work centre
  missing from the unit's catalog, or one with no plan that day and so not on
  the «Odamlar soni» tab at all) cost the point every day. Plan and people must
  sit on the SAME cell (`leader_auto.cell_planned` — the cell's group lines plus
  its work centre's ungrouped ones, `wc_group.in_scope`). #9 reads each work
  centre's own tile (`_Ctx.code_totals`, uncut by group exactly as the page's
  totals are, so two lettered cells of one work centre read one figure). A
  leader with one cell reads byte for byte what they read before. The facts
  keep `untyped` and the leader's COMBINED % — the warning card shows them as
  the JOB (every cell, 50%), and the pass mark is still never printed as the
  instruction. **A per-cell unit judges the LEADER once**: the verdict is taken
  over all their cells (`cell=None`) and written onto every cell checklist,
  one verdict DM per task (`_already_told`); a cell checklist opened after the
  hour is handed the verdict taken AT the hour (see «The page is read AT THE
  HOUR» below).
- **The points the old reading cost were listed once and given back on one
  tap** — `services/auto_check_restore.py`, the boot one-shot
  `startup.report_auto_check_restore` (flag
  `auto_check_restore_list_2026_09_22_v1`) and the `acr:` callback in
  `telegram_bot.py`. The operator's rulings: multi-cell cases ONLY, PROVEN ON
  TIME only (the check's own record at the hour, concern `created_at`, the
  action register's saves replayed to the hour, rows untouched since — never a
  number typed after), and a LIST FIRST: the operator's chat gets a summary, an
  Excel («Restore» + «Not restored» with the reason) and ONE button, which
  writes a `LeaderTaskOverride` (done, reversible) for exactly the stored list
  (`AppSetting` `auto_check_restore_list_2026_09_22`) and re-sends each changed
  day's corrected report. Temporary: delete the module, the startup pair, the
  call in BOTH entrypoints and the callback once the button is used.
- **Shift 2's hours are those same points of a NIGHT** — three, seven and ten
  hours after a 20:00 start — because a night asked at 10:00 would be asked five
  hours after its checklist has already closed. They are settings, not constants.
- **`AUTO_FROM = "2026-09-20"` is a FLOOR with no override**, and it is
  load-bearing rather than tidy. Units carry OPEN checklist days from earlier
  dates, and every one of those has an auto task whose hour went by long ago:
  without the floor the first pass settles all of them at once. Measured on the
  11 Sep production copy, one pass at 09:00 on the 20th wrote **103 verdicts, 96
  of them failures**, into days going back weeks. It must never be moved EARLIER.
- **The ledger is `leader_auto_checks`**, one row per (leader, date, cell, task)
  under the same `COALESCE(cell_id, 0)` expression index `uq_ltask_day` needs and
  for the same reason. It makes the pass idempotent and, more importantly,
  ANSWERABLE — a score moved by a machine has to be explainable months later, and
  the entry carries only a verdict; `facts` holds the numbers it was taken on.
  It also carries a fact nothing else can: a row with code `no_day` says «at the
  check there was no checklist» — and a bot checklist exists only from the
  FIRST task a leader answers (`_lt_save_entry`, or a camera shot), never from
  opening `/tasks`. That is why no `created_at` was added to `LeaderTaskDay`.
  **`no_day` is a CODE and «skipped» is the OUTCOME** — testing the outcome
  against it is never true (found by running it, 2026-09-20).
- **The page is read AT THE HOUR for every leader who owes the task, checklist
  or not** (the operator's ruling, 2026-09-23 — «check whether the leader
  filled it before the deadline, then give or deduct points»). With no
  checklist yet the verdict is kept on the `no_day` row as `facts.at_hour`
  (`_measure_without_day`, measured ONCE, a data failure retried as for any
  checklist) and written onto the checklist when it appears: PASSED if the job
  was done at the hour, FAILED with the real reason (`no_plan`, `no_staffing`,
  `under_target`, `no_concern`) if not; `facts.checklist_seen` says when. Only
  then is the leader told — never at the hour, because «✅ bajarildi» sent to
  a leader who has not opened the bot reads as «nothing left to do» while the
  day still scores nothing without a checklist — and the task's bot screen shows
  the stored verdict meanwhile (`leader_auto.measured`). Before the ruling a
  checklist that appeared after the hour was `started_late` and scored 0
  WITHOUT the page being read — a leader who filled everything at 09:00 and
  answered their first bot task at 11:00 lost task #1's points (a leader's
  complaint, 23 Sep). The ruling's own premise is what keeps it honest: nothing
  typed after the hour can pass, which is all the old rule ever protected.
  **`started_late` survives only for a `no_day` row written BEFORE the
  measurement existed** (no `at_hour`, no `measure_error`), and only after two
  fallbacks fail — a sibling cell's verdict at the hour, then `_from_record`,
  which reads the hour off the Jurnal (concerns: exact, its window already ends
  at the hour; #1: the 22 Sep restore replay, `auto_check_restore._Unit` +
  `_plan_at_hour`, imported LAZILY so deleting that module cannot break a boot).
  Such a row can only meet a checklist on its own day, so that path went quiet
  after 23 Sep 2026 — delete `_from_record` together with `auto_check_restore`.
  **Verdicts already written as `started_late` (20—23 Sep) were NOT re-judged**:
  a past score moves only through the admin override or a list the operator
  approves, the 22 Sep precedent.
- **TERMINAL means the task is CLOSED, never merely that an entry exists.**
  `entry_id is not None` was the first spelling and it stranded whole days:
  nothing else writes `closed_at` for an auto task (`autoclose_due` skips them,
  every bot button is refused, `close_expired_days` drops a day holding a
  reopened task), so an entry left unlocked had no writer left at all. Three
  ways to reach it — the process dying between the commit and `close_task`, a
  pre-existing DRAFT recorded `already_filed`, and an admin reopening the task.
  The first two HEAL, because `_settle` re-reads whether the entry is closed;
  the third is refused outright in `leader_close.reopen_task` AND in
  `routers/leader_tasks.reopen_submitted_task`, since that endpoint is reachable
  without the UI. A stranded day is invisible on every read surface here, which
  is the same thing as «this leader filed nothing».
- **`already_filed` still CLOSES the task.** A leader mid-checklist holds a
  DRAFT — answered, not submitted — and that is exactly what the mid-shift
  exception below produces. Their answer stands; their task is closed for them,
  or the day hangs open behind one task nobody on earth can submit.
- **A check that cannot read its data is retried, but not forever.** It is
  `skipped` / `no_data` with `entry_id` NULL until `GIVE_UP` (6 h) past its hour,
  and is then written as `not_checked` so the task closes and the day can end: a
  day held open by a platform fault costs the leader every other task on it.
  Shift 1 has no day-level sweep at all, so nothing else would have ended it.
- **`autoclose_due` skips an auto task only from `AUTO_FROM` on.** The config
  chain is not versioned, so an open day from before the floor still resolves
  `proof_kind="auto"` while the evaluator refuses to look at it — skipping it
  there too would leave that task with no closer and hold its checklist open
  for good.
- **The reason sentinel is `__auto__|HH:MM|code`** (`leader_tasks.auto_reason` /
  `read_auto_reason`), the twin of `__missed__|HH:MM` and for the same reason:
  `reason` is free text a leader typed in their own language, so it cannot also
  carry one fixed sentence for four viewers. `utils/leaderReason.js#showReason`
  is the client twin and must expand it, or it prints the sentinel at an
  operator verbatim — exactly what `__missed__` did on 2026-08-27.
- **`task_state` gains `autopass` and `autofail`**, and `autofail` is in
  `FAILED_STATES`. A failed auto check is neither «I decided not to» (notdone)
  nor «I ran out of time» (expired): nobody answered it and nobody could have.
  It still scores 0 and the leader still has to see that it did.
- **The sweep runs FIRST in `leader_close._sweep`** — the existing FIVE-minute
  job, not a job of its own, so the ordering below is a fact about one pass
  rather than a race between two. **Consequence to know: a check fires within
  five minutes of its hour**, so a leader who types the plan at 10:03 can pass
  a 10:00 check; `LATE_GRACE` is the same five minutes, so an ordinary lag is
  not marked late and a real outage is. It runs ahead of `autoclose_due`
  and `sweep_expired_days`. Both of those write an entry for any enabled task
  that has none, so a pass running after them would find the platform had
  already recorded its own checks as the leader's failure. **`telegram_bot._lt_cmd`
  is the OTHER door into those two closes and carries the same order**, or a
  `/tasks` typed after a check hour but before the next tick would do exactly
  that, permanently — a closed day can no longer be settled. `autoclose_due` skips
  auto tasks outright; `close_expired_days` writes `__auto__|HH:MM|not_checked`
  rather than the missed-deadline sentinel.
- **Every door back is closed, deliberately and in one place each.**
  `leader_late_proof.eligible` refuses an auto task — without it every one of
  them matches the whole of that predicate (enabled, untouched, past its hour,
  not done) and the leader is funnelled into «Kechikkan isbot» for a task they
  were never allowed to file, putting a brigadir and an admin in front of a
  two-stage ruling about a check no human made. `leader_close.reset_task`
  refuses one too, at the shared core rather than at the two doors that call it:
  the next sweep would rewrite the verdict from the same data, so «Tozalash»
  would look like it worked and change nothing. **The route back is the admin
  override** (`LeaderTaskOverride`), which `_apply_overlays` already scores.
- **The bot refuses it once, not eight times.** `_LT_TASK_ACTIONS` in
  `telegram_bot.py` is the set of `lt:` actions carrying a task id — **the
  ADMIN's `aop`/`awp`/`aopok`/`awpok` included**, because a Telegram callback
  button never expires and one minted before the switch is still live in
  somebody's chat — and one guard
  in the dispatcher sends every one of them to `_lt_auto_view` — a read-only
  screen naming the rule, the hour and the verdict, with no camera, no upload, no
  «Qayta topshirish», no close button and no `LeaderTaskCapture` row (a stale one
  would swallow the next photo sent to the chat). A refusal written into each
  branch is a refusal forgotten in the ninth.
- **The rollout is a TEMPORARY one-shot**: `services/leader_auto_rollout.py`,
  two flags (`leader_auto_2026_09_20_shift1_v1` / `…_shift2_v1`), armed by
  `startup.register_leader_auto_sep20` in both entrypoints. It writes the hour
  and the instruction FIRST and the switch LAST — written the other way round a
  unit would carry an auto task with no hour of its own for the seconds in
  between. Delete it and its scheduling helpers once both flags are set;
  `startup.add_leader_auto_checks` and `services/leader_auto.py` STAY, because
  they are the feature and not the rollout. Changing what either pass writes
  needs a NEW flag key.
- **ONE deliberate exception to the never-mid-shift rule**, in `_auto_run_at`:
  the switch may land inside a running shift up to that shift's FIRST warning
  instant, and is deferred to the next day's instant after it. The rule exists
  because a criteria edit RE-JUDGES a checklist being filled; this pass judges
  nothing — a task the leader has already answered keeps its entry untouched
  (`already_filed`), so nobody can lose a point they had earned — while
  deferring costs the whole day, since the three checks are at fixed hours.
- **The three instructions lost their «for now, also send a screenshot»
  paragraph** (`leader_auto_rollout.DESCRIPTIONS`). That paragraph told leaders
  to do something the bot now refuses. The THRESHOLD stays out of them: task 9
  goes on saying 50% while its check passes at 30%, which is the operator's
  standing rule — a minimum exists so nobody fails on a technicality, and
  printed as the instruction it becomes the target.
- **The warning DM tells the leader what to do, not just that a check is
  coming** (2026-09-21, the operator's directive, approved off a test copy).
  `services/leader_auto_rich.py` is the card: the hour and minutes left, the
  task, WHERE on the platform, the leader's LIVE figures (what the check would
  read now — `leader_auto`'s own `_Ctx` + runner, never a second measurement),
  numbered steps, the rule (no photo; late = not done, −N points) and a web_app
  button onto the page. Rich first; a client that refuses rich gets the SAME
  card as HTML through `notify_profile(html_fn=…)`, which exists for exactly
  this. **The BELL row is a different, shorter text** — the per-check template
  `leader_auto_soon_<check>` in `routers/staff.py`: what to do, where, by when,
  and NO figures, because a bell row renders at view time and a completion
  printed an hour ago is no longer true. The old `leader_auto_soon` key stays
  for rows written before the split and for a check the card does not know.
  Page and control names are copied from the UI per language (`nav.*`,
  `production.*`, `concerns.*` in translations.js — «Pozitsiyalar», «REJA»,
  «Fakt», «Bajarish %», «Odamlar soni» → «Bugungi fakt», «Xavotir qo'shish»);
  **rename one there and rename it in both places here**, or a step names a
  control the reader cannot find. Task 9 is told 50% (`TARGET_PCT`) and the
  30% pass mark is never printed — the standing rule. A card that cannot be
  built costs the card, never the warning: the bell template goes out alone.
- **Boot says out loud what is wrong**: `leader_auto_rollout.self_check` rides
  `startup.report_leader_deadline_rules` and names an auto task on a unit that
  closes whole DAYS (nothing would close it) or one with no readable check hour.
  This repo has no test suite and a push to main is a deploy.
- **A leader whose cells carry no SAP code** fails #1 and #9 with code
  `no_sap_code` and the admins are DMed: it is a REGISTER error somebody has to
  fix, so it is named rather than absorbed as the leader's failure. One leader of
  Aripova Manzura's unit was in that state on the 11 Sep copy.

## The brigadir's day digest (`leader_unit_report`)

From **2026-09-15** (the operator's directive) a brigadir is no longer DMed once
per leader-day — six near-identical «Kun tasdiqlandi» messages spread over an
evening, and nothing at all about the leader who never filed. The unit's whole
day arrives as ONE Rich message: a table of every leader who owed a checklist,
what each scored, what was rejected (by task NAME, in the reader's language),
who is still in review and who never filed — with one button onto
**`/leaders/unit-report/:mid/:date`**, where each leader's own day report opens
in place. **The LEADER's own per-day DM is unchanged.**

- **`services/leader_unit_report.py` is THE definition** — `DIGEST_FROM`,
  `covers`, `build`, `note`, `sweep`. `services/leader_unit_rich.py` renders the
  rich body and the classic fallback lines and computes nothing. The ledger is
  `leader_unit_reports`, one row per (unit, date). Bell/classic keys:
  `leader_unit_report` and `leader_unit_report_corrected`.
- **It computes no score.** Every row is `leader_reports.day_report`, so the DM,
  the unit page and the day report cannot print two numbers for one leader-day.
  The one figure it adds, «Brigada natijasi», is `_unit_score` — the ONE-DAY
  twin of `unitSlots` in Leaders.jsx (the mean over every leader who owed a
  checklist, an unfiled one counting 0). Keep the two in step.
- **When it goes out** (`_ready`) — **as soon as the last leader's time is up**
  (the operator's ruling, 2026-09-15): every checklist the unit owed is closed,
  or the time of every leader still missing has run out — AND nothing is still
  in review (`_pending`, the `unfinished_reports` rule) or about to be closed by
  the platform. A leader's time is `_time_up_at`, read off the rule that already
  enforces it: on a per-task unit the LATEST `leader_close.due_at` of their
  enabled tasks — the hour `autoclose_due` locks the last one on, so 20:00 on
  shift 1 and 09:00 on shift 2 with the default windows — and on a day-close
  unit the day's filing deadline. It first shipped waiting for that deadline
  whenever anybody was missing, which put a shift-1 digest just after midnight,
  hours after the last task had closed; do not go back to it. `MAX_WAIT_MIN`
  (60) after the day became final — its last close, or its last missing
  leader's time — it goes out anyway, the rows still moving marked ⏳.
- **Two doors.** `send_for_uid` no longer DMs the brigadir for a covered day (a
  bot uid dated on or after the floor); after the leader's ledger commits it
  calls `note`, the fast path. `sweep` rides the 5-minute `leader_close._sweep`,
  AFTER both auto-closes, and sends the first digests waiting on a leader's
  time.
- **Updates are batched.** After the first send `note` only sets `dirty_at`, and
  so does the sweep for a checklist closed after `last_sent_at`. The update goes
  out once the unit has been quiet `CORRECTION_QUIET_MIN`, and only when a row's
  state or PRINTED score moved (`changes`, keyed by leader + cell, never by uid,
  so a late filer is one row moving from «not filed» to a score). Every change
  is named before → after. A row still in review stores no score, so its score
  drifting mid-review is not an update.
- **Rows**: one per checklist (a per-cell unit has one per cell), worst first —
  `rejected · missing · open · error · checking · noproof · verified ·
  excluded`. Owed = the unit's leader roster minus a cutoff or ANY exclusion on
  the leader-day (the day report stamps every row off one exclusion), expanded
  by `leader_cells.expected_days`. A rehearsal day is neither a row nor «not
  filed». A unit that filed nothing at all gets no digest — a holiday must not
  DM «0 / 6».
- **Parks** (`parked`, `sends = 0`) — outside the automatic regime, or nothing to
  report — so the sweep stops asking. `_lock` keeps the drain thread and the
  scheduler from sending one unit-day twice (one worker process). Ghost Mode
  returns before anything is written.
- **Scope**: `unit_scope_ok` is `report_scope_ok` for a unit, except a LEADER may
  not read it — it sets colleagues' scores beside theirs. 404 when out of scope.
- Everything before `DIGEST_FROM`, and every SHEET row, keeps the per-leader
  brigadir DM and its corrections. The floor must never move LATER.
- **One report component.** `components/leaders/DayReportView.jsx` is the day
  report, extracted from `pages/LeaderDayReport.jsx` (now a frame) so both pages
  draw one report; `embedded` drops the header, the width cap and the
  full-screen error. The day report's header links up to the unit page for every
  viewer but a leader. Logged as `report.unit_sent`.

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
- **The camera is only ever opened ON SCREEN** (2026-09-17, found by the first
  camera report). A request made from the background cannot finish — nobody can
  answer «Allow camera?» there, and Android does not hand the camera to an app
  it cannot see — so it hung for `OPEN_TIMEOUT_MS` and greeted the returning
  leader with «Kamera tasvir bermayapti» over a camera that was never broken.
  The report showed exactly that: the page went to the background at 54 s, the
  watchdog read the paused picture as a dead camera at 64 s, re-opened from the
  background, and failed at 84 s. Three rules now hold:
  - **Off screen nothing opens.** `startCamera` puts the request off
    (`deferredRef`) instead of calling getUserMedia, and `ensureCamera` does not
    measure frames at all while hidden — the WebView pauses the picture itself,
    so silence there says nothing about the camera. The stall clock restarts
    from zero on every visibility change.
  - **`settleReturn` is THE way back, and it runs on every return.** An open
    that was put off is made; a failure raised while hidden is cleared (and was
    never reported — `failRef.hidden`); an open that was still in flight when
    the page left gets `RETURN_GRACE_MS` to finish, because its «Allow camera?»
    sheet may only now be in front of the leader, and is replaced only if it
    does not. Never two camera requests at once: a second one on top of a sheet
    still up is a second sheet, or none. The watchdog stands aside
    (`returningRef`) until the return is settled.
  - A failure that happens ON SCREEN after the return is a real one: it stands,
    and it is reported.
- **A page that is not on screen LETS THE CAMERA GO** (2026-09-18, from the
  first «Kamera tasvir bermayapti» report to name its cause). Android hands the
  camera to ONE client at a time and Telegram MINIMIZES a mini app rather than
  closing it, so every proof page a leader opened this shift was still a page
  holding a camera — and the third task's `getUserMedia` queued behind them.
  In the report it answered after **17.4 s**, with two sibling «SOP standarti»
  pages six hours old reporting live cameras from the background. Three rules:
  - **`releaseCamera` on a `HIDDEN_RELEASE_MS` (15 s) grace, and at once on
    `pagehide`.** The grace is the point: re-opening costs another «Allow
    camera?» sheet, which is the one cost this page is built to keep down, so a
    leader glancing away pays nothing while a page left behind stops being the
    next task's problem. Nothing new re-opens it — `ensureCamera` already opens
    a live viewfinder with no stream, so the camera comes back when the
    VIEWFINDER does and not merely when the page does.
  - **A sibling asks, and a hidden page answers at once** — `announceNeed` on
    the BroadcastChannel the presence ledger already uses, and every open waits
    `NEED_RELEASE_MS` (350 ms) for it before asking Android. A page nobody is
    looking at has no claim on the camera, and asking is instant where waiting
    for the OS to arbitrate is what those 17.4 s were.
  - **The open deadline ends at the STREAM, not at the picture.** It asks one
    question — did Android answer — so it is cleared the moment the stream is
    adopted; whether a picture ARRIVES is the frame watchdog's question, with
    its own clock and its own silent re-open. Left running across that line it
    judged both, and 17.4 s of a 20 s budget left too little for the rest: a
    camera that had just opened was reported as one that never did, and the
    leader was shown a failure screen over a working viewfinder. For the same
    reason `play()` is **never awaited** (on a stream sending no frames it never
    settles, and awaiting it held `startingRef` shut, which stands the watchdog
    down — so the check that would have named the failure never ran) and the
    lens correction is bounded by `LENS_FIX_MS`.
  - **A camera that is BUSY is retried, not reported** (`BUSY_ERRORS` —
    NotReadableError · AbortError · TrackStartError · SourceUnavailableError,
    `BUSY_RETRIES` 2 at `BUSY_RETRY_MS`, re-announcing the need each time).
    That error names another holder, not a broken camera, and a sibling too
    frozen to have heard `announceNeed` is usually let go of by Android a
    second or two after being asked. A failure screen there costs the leader
    their shot and puts a DM in front of an admin for a camera that was about
    to be free. `NotAllowedError` is deliberately NOT in the set: a refusal is
    the leader's answer, and re-asking is a second sheet for the same «no».
  - **`OPEN_TIMEOUT_MS` is 45 s and it is a CEILING, not an expectation.** At
    20 s it sat three seconds past the honest worst case, so a slow answer
    became a failure screen — and a leader who reads one backs out and re-opens
    the task from the bot, which leaves ANOTHER page holding the camera and
    makes the next open slower still. What it catches now is a camera that
    never answers at all. The waiting is carried by words instead: past
    `OPEN_SLOW_MS` (9 s) the viewfinder says it is still opening and that
    another window may be holding the camera, and asks them not to leave. That
    line is the one thing that breaks the loop.
  - **A holder no longer makes the next open SLOW — it makes it BLACK**
    (2026-09-18, the second report). Android hands the second client a live
    1920×1080 track in under a second and then delivers no frames at all, so
    the contention now arrives as `no_frames` rather than a long open. Two
    consequences. `HIDDEN_RELEASE_MS` is **3 s**, not 15: the cost of holding
    went up and the cost of re-opening is near zero — the «Allow camera?» sheet
    belongs to the WebView and is raised at a page's FIRST open, and that same
    report shows two `getUserMedia` calls on one page answered in 933 ms and
    834 ms, which is not a leader tapping «Allow». And a stalled viewfinder
    **asks the holder and waits `HOLDER_ASK_MS` before re-opening**, instead of
    re-opening blind into a second zombie, which is what that report did twice
    in nineteen seconds.
  - **The pending release is NOT cleared by the effect's cleanup**, and that is
    load-bearing. That effect re-registers whenever `settleReturn` changes
    identity, which follows `ensureCamera`, which follows `mode`, `camErr` and
    the task query — so a background refetch landing while the page was hidden
    cancelled the release and left the camera held for good, which is the state
    the whole section exists to end. The timer re-checks that the page is still
    hidden, so a duplicate is harmless where a lost one is not. It is also
    armed on Telegram's own `deactivated`, since minimizing is not always a
    `visibilitychange`.
  - **`held` is a screen of its own, and it is AMBER.** When a sibling page
    ANSWERS the channel saying it still holds the camera, that is the whole
    failure, and nothing on this page can close another of Telegram's windows —
    only the leader can. So it is named, with the one action that works («close
    the other camera window, then Retry»), instead of «the camera sent no
    picture», which is true and leaves them nothing to do. It is still
    REPORTED: a holder that will not let go after being asked is exactly what
    an admin needs to know is still happening.
  - **A device with NO camera is an ANSWER, not a fault, and is not reported.**
    On 2026-09-18 a leader opened a camera proof from Telegram DESKTOP on a
    Windows PC: zero video inputs, `NotFoundError` in four milliseconds, and an
    admin was DMed about it. Nothing there is for an admin to fix. Same rule
    `NotAllowedError` already keeps — a refusal is the leader's answer — and the
    test is the CAMERA COUNT, never the error name: a `NotFoundError` on a
    device that does list cameras is a real fault and still reports, and an
    unknown count reports too. The screen also stops offering «Qayta urinish»
    as its action there, since retrying fails again in four milliseconds; the
    way out (close, and open the task on the phone) is the action, with retry
    underneath it for a webcam somebody has just plugged in.
    **The screen carries the whole explanation, because nobody else is told.**
    It says what is missing, why this task needs it and where to go instead —
    and on a DESKTOP Telegram (`DESKTOP_PLATFORMS`, matched on the mini app's
    own `platform`) it names that too, since «camera not found» reads as a
    broken camera to somebody sitting at a computer. An unrecognised platform
    (a plain browser answers «unknown») keeps the general wording, which is
    true either way.
    **Neither of the not-a-fault screens is painted red** (`notAFault`): this
    one and `held` are both answered by the leader, and red is what the page
    says when something is wrong with it.

- **A camera failure REPORTS ITSELF to the admins** (2026-09-17, the
  operator's directive, after the first «Kamera tasvir bermayapti» reached us as
  a leader's screenshot — which says what happened and nothing about why, and
  the why exists only on that tablet). `utils/cameraDiag.js` gathers,
  `services/camera_report.py` lays it out, and it travels through the ONE
  client-failure door, `POST /api/crash-report` with `kind: "camera"` — never a
  new endpoint.
  - **The page keeps a flight recorder** of every camera event (why each open
    started, every getUserMedia with its path and answer time, the settings the
    stream opened at, `mute`/`unmute`/`ended`, `play()` rejections, video
    dimension changes, page visibility, Telegram `activated`/`deactivated`), and
    `failRef` names WHICH check put the failure screen up — `open_timeout`,
    `no_frames` or `gum_error`, three different failures behind two screens.
  - **On a failure screen (never on «denied»: a refusal is an answer) it probes,
    then posts** — device model and Android / WebView / Telegram versions (the
    Telegram-Android suffix of the user agent names the tablet), the camera
    list, the stream's settings, capabilities and state, one frame read straight
    off the stream through a CLONE (tells a camera that sends nothing apart from
    a page that does not show what it sends), the same stream re-asked for
    640×480 through `applyConstraints` (tells a size the device cannot deliver
    apart from a camera dead at any size), and the other camera pages of the
    same Telegram, asked over a BroadcastChannel and read from a localStorage
    ledger (a MINIMIZED camera page still holding the camera). The DM leads with
    a «Likely cause» and prints every fact it was drawn from under it.
  - **The probes never ask and never hold.** No getUserMedia is called, so no
    «Allow camera?» sheet; the clone's release is parked on `probeHoldRef` and
    `startCamera` calls it FIRST, because a clone left running keeps the dead
    source alive under the leader's retry; and a page not on screen runs no
    probe at all, since touching the camera from the background could take it
    from the page in use. The 640×480 probe runs only on a stream the page has
    already given up on — whatever it finds, Retry replaces that stream.
  - One DM per person per failure kind per page visibility per hour (the person
    is in the fingerprint: leaders on identical tablets share a user agent); at
    most three reports per page. The leader sees one muted line,
    `proof.cam.reported`, and only once the server HAS the report.
  - **Reading a screenshot of this page without a report:** the stamp sits on
    the picture box, and the box is shaped by `camAR`. A SQUARE box is Chrome's
    2×2 black placeholder — the frame a video renders when its stream ENDS
    before delivering one real frame — so the camera never sent a single frame
    on that page. It is not a freeze after working.
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
    reason — **stamped with the TASK's own closing hour** (`task_deadline`, the
    hour that fired: `__missed__|08:30`), never the day's filing deadline.
    Every reader prints the sentinel as «did not submit this task before
    HH:MM», so the day's 23:59 on a task that shut at 08:30 contradicted the
    bot's late-proof screen (2026-09-23). The day-level close
    (`close_expired_days`) still stamps the day's deadline, because that is the
    hour it fires on. Rows written before the fix keep their 23:59 / 09:00.
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
- **An ADMIN's REFUSAL requires their reason and it is told to the leader**
  (2026-09-10) — the twin of the rule in the objection chain above, for the
  same reason and in the same shape: `decide_admin` refuses an empty note on
  `rejected`, `late_proof_rejected` gained a `{note}` it never carried, the
  endpoint pre-checks with a 400, «Kechikkan isbotlar» opens the uplift's own
  form, and the Telegram card pauses on `lp:ar` for an `lp_arej` capture rather
  than ruling on the tap. Approving needs none — but it OFFERS the same box
  (`late_proof_approved` gained a `{note}` line of its own for it); the
  brigadir's stage-1 refusal still needs none (SUPERSEDED 2026-09-26: it
  needs one — «The appeal CHAT»).
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
- **The card states HOW LATE, because that is the only question it asks.**
  `leader_late_proof.late_minutes` is THE subtraction and `LeaderLateProof.due_at`
  is what makes it possible: the row already snapshotted `deadline` ("HH:MM"),
  which a human can read and nothing can subtract, because which DAY that hour
  falls on is the shift anchor's answer (`leader_close.due_at`, seated by
  `leader_ai.window_offset`). Snapshotted at filing time for the same reason
  `deadline` is — a window an admin edits next week must not restate how late
  somebody was last week. **NULL is a real answer and must never render as 0**:
  a row the backfill could not place has no measurable lateness, and "filed
  exactly on the hour" is a different thing to tell somebody deciding whether to
  give a point back. A NEGATIVE delta reads as NULL too — a row exists only
  because `eligible` found the deadline past, so a filing measuring as early
  means the two stamps disagree.
- **Every instant on this payload is the plant's WALL CLOCK**
  (`leader_late_proof.local`, Tashkent, converted on the way out). The card sets
  a filing time against a deadline, and the deadline is a Tashkent clock while
  the timestamp columns are `timestamptz` the driver hands back in the DB's own
  zone — UTC in production, though not on every box (a dev box on Asia/Samarkand
  makes the bug invisible locally). Serving them unconverted did not read as a
  timezone bug: it read as a leader who filed five hours EARLY on a queue whose
  entry condition is that they filed late. Reported 2026-09-04 — a proof one
  minute past 09:00 printed «04:01». Never convert in the browser: that is the
  viewer's zone, not the plant's.
- **A photo says WHEN as well as which door.** `LeaderLateProofMedia.received_at`
  is carried over from the draft roll at `create()` — the instant the SERVER got
  it, which both doors can answer, unlike `captured_at` (camera only, because a
  file the leader picked carries no moment this platform can vouch for). Without
  it an uploaded photo reached the reviewer with no hour at all. Not
  backfillable: the draft shot that knew it is deleted by `create`.
- Bot: the same two facts are on the Telegram card (`{sent}` on all eight
  `lp_card_*` templates, built once in `_lp_card`), because a brigadir deciding
  in a workshop will not open the dashboard first.
- (SUPERSEDED 2026-09-26 — cards open the appeal chat; «The appeal CHAT».)
  Dashboard: `/leaders?tab=lateproof`
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

## The appeal CHAT — objections and late proofs (`/leaders/appeal/:kind/:id`)

From **2026-09-26** (the operator's directive, every point asked and answered)
both appeal flows — an objection to an AI rejection and a proof filed after its
deadline — are argued as a CHAT between the three people the chain is made of:
the leader, the unit's brigadir and the admins. The chain itself (leader →
brigadir → admin) did not change; WHERE and HOW each step is taken did.
`services/leader_appeal_chat.py` is THE definition of the conversation,
`routers/leader_appeals.py` its HTTP surface, `pages/LeaderAppeal.jsx` the page.
Where this section and the two below disagree, THIS section is current.

- **The page reads top to bottom in the order a ruling needs**: the ruling
  buttons of whoever may rule at this stage (the server's `canSupervise` /
  `canDecide` / `canUndo`, never a role guess) → the evidence (the proof photos
  and the AI's reason; a late proof has no AI verdict — the AI never reviews one
  — so its photos and deadline / filed / late-by stand there) → the chat.
  Auth-only and row-scoped like `/leaders/report/:uid` (it is where the Telegram
  button lands). New objections: `/leaders/appeal/dispute/new?uid=&task=` — the
  objection is WRITTEN as the chat's opening message (the day report's
  «Norozilik bildirish» opens it); once filed the page opens the thread.
- **Required comments**: the leader's filing (as before); the brigadir's
  REFUSAL and UPLIFT both (refusal was optional until this day — enforced in
  `decide_supervisor` of both services and at both endpoints, 400); an admin's
  refusal (as before); an admin's approval optional. Every ruling's comment is
  its entry in the chat.
- **Free chat, three parties.** The leader, the unit's brigadir and any admin
  may write while a ruling is still to be made (`_party` + `_open`); shift and
  top managers and a «see all» grant READ. Writing stops once a ruling is final
  (409) — the reason that ended it is the last word.
  **An undo REOPENS**: `leader_dispute.undo` / `leader_late_proof.undo` (new,
  `POST /leaders/late-proofs/{id}/undo`) send the row back to the stage the
  ruling was made at (`reopen_stage`) — admin ruling → admin, brigadir's refusal
  → brigadir — clear that stage's ruling columns (and the verdict / the
  override grant it wrote) and the SAME chat opens with that stage's buttons.
  The old `cancelled` end state is written only by `supersede` now; rows the
  old undo left stay as they are.
- **The thread is `leader_appeal_messages`** (`thread` "dispute"|"late" +
  `thread_id`), files in `leader_appeal_files`, per-PROFILE read marks in
  `leader_appeal_reads`. Kinds: `message` (free — the only kind its author may
  edit or delete) and the permanent step records `filed`, `sup_rejected`,
  `uplifted`, `approved`, `rejected`, `undone`. **Step records are written INSIDE
  the service cores** (`create`, `decide_supervisor`, `decide_admin`, `undo`,
  `supersede`), so every door that rules — the page, a Telegram capture still in
  flight — writes one. The ruling columns still say where an appeal stands NOW
  (every other reader keeps reading them); the rows say how it got there, which
  after a reopen is the only place that history survives. A re-filed objection
  CARRIES the earlier row's chat onto the new row (`chat.carry`).
  `startup.backfill_appeal_threads` (flag `appeal_chat_backfill_2026_09_26_v1`)
  wrote every pre-chat appeal's steps from its columns, with original times and
  authors; a pre-chat undo overwrote the ruling it took back, so it is one
  «undone» entry.
- **Files: any type, ≤20 MB each, ≤10 per message** (the operator's call — 20 MB
  is the most the bot API hands back). Relayed to the ARCHIVE CHANNEL as
  documents (`relay_file`, content-type detection off), never stored in the DB.
  `upload_guard.validate_chat_attachment` is the validator: no extension
  whitelist BY DESIGN; only a file whose leading BYTES prove JPEG/PNG/GIF/WEBP is
  typed as an image and served inline — everything else, a name that merely
  claims `.png` included, is served as an ATTACHMENT behind `nosniff`
  (`_stream_tg_file(name=, mime=, download=)`, RFC 5987 file names). Inside
  Telegram a file is DMed to the reader by the bot
  (`POST …/files/{id}/send`); a browser downloads it.
- **Everybody hears about everything** (`chat.fanout`): leader profile, brigadir
  profile and EVERY admin (the operator's ruling — all 6, every message, every
  stage), each with ONE «Chatni ochish» web_app button; the author is told
  nothing about their own words; accounts that just got a card keep the bell row
  and are spared a second DM. Keys: `leader_dispute_filed` (neutral now),
  `leader_dispute_message`, `late_proof_filed`, `late_proof_message`, the
  existing ruling keys, and `*_undone` / `*_undone_sup` (reopened).
- **Telegram carries ONLY «Open chat»** (the operator's ruling): the brigadir's
  and admins' cards (`_ad_kb`, `_lp_kb`, the approvals `leader_dispute` card via
  `_broadcast(kb_fn=)`) have no ruling buttons. A button on a card minted before
  this still works as a POINTER — `_appeal_redirect` swaps the card's keyboard
  for the chat button and says so — and never rules, because a one-tap refusal
  would break the required-comment rule. The `ad_note` / `ad_arej` / `lp_note` /
  `lp_arej` captures survive only for a capture already in flight.
- **The two queue tabs are ONE component** (`components/leaders/AppealQueue.jsx`;
  `Disputes.jsx` / `LateProofs.jsx` are thin wrappers). A card is a summary —
  whose, which task, the AI's flags or how late, its state, the newest chat
  entry, the reader's unread count and a «your turn» mark — and opens the chat.
  A LEADER sees their own appeals without the stage split (it hid their rows
  behind the tab they did not open); a brigadir lands on «Brigadirlarda».
- **The day report rules nothing now**: its inline refuse/uplift/approve and
  undo are gone; an objection carries «Chatni ochish» (marked when it is the
  reader's turn).
- **Exam sandbox**: every new path sits under `/api/leaders/disputes` or
  `/api/leaders/late-proofs`, which the exam rewrites; `routers/exam_sandbox.py`
  answers them over fixture items (synthesised entries, negative ids) and
  `appeal_msg` rows, text only.

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
- (SUPERSEDED 2026-09-26: both cards carry only «Open chat»; old buttons point
  into the chat — «The appeal CHAT».)
  **Two Telegram cards, one per stage.** Stage 1 is `_ad_*` in
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

## Nothing before 1 September 2026 can be argued (`APPEALS_FROM`)

From **2026-09-21** (the operator: «anything before September doesn't count»)
no ruling may be asked for about a checklist day before **2026-09-01** — neither
an objection to an AI rejection nor a late proof.

- **`leader_dispute.APPEALS_FROM` + `appealable(day)` are THE floor** for BOTH
  appeal flows: `file_dispute` answers 409 below it, `_stamp_report_rights`
  serves `canDispute` false so the day report draws no button, and
  `leader_late_proof.eligible` refuses such a day. Compared against the
  CHECKLIST day, never the filing day — a night of 31 August objected to on the
  1st is an August night.
- **Everything below it was DELETED once** —
  `startup.purge_pre_september_appeals` (flag
  `pre_sep_appeals_purge_2026_09_21_v1`; changing what it deletes needs a NEW
  key): every `leader_ai_disputes` row in any state, every `leader_late_proofs`
  row with its photos, any draft roll on those days, and the `approval_notices`
  rows tracking their Telegram cards (forgotten, not edited: an old card's tap
  finds no row and answers «already handled»). One transaction with the flag
  inside it, one «Jurnal» row (`checklist.appeals_purged`) with the counts.
- **No score moved, deliberately.** An approved objection's
  `LeaderAiReview.resolution` and an approved late proof's `LeaderTaskOverride`
  are rows of their own and were left in place — a point already given back
  stays given; only the paper trail and the queue went. Taking those points
  back as well is a separate decision.
- Deliberately NOT touched: `leader_late_requests` (the shift-1 late-DAY
  requests), whose approval IS the score, and the bell notifications already
  sent about the deleted rows.

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

## A catalog edit counts FROM NOW ON (`services/pp_catalog.py`)

From **2026-09-24** (the operator's directive, every point below asked and
answered) a change to a unit's catalog on the «Zagruzka fayli» page takes
effect from the shift in progress, and every earlier day keeps the catalog it
had. Until then every reader took the catalog as it stood TODAY, so one edit
re-priced the minutes, ЛЮДИ and загрузка of every past day at once — 35
Трудоемкость and 90 Команда edits had done so by 11 Sep alone.

- **What is dated: everything about a line and a work centre.** Трудоемкость,
  Команда, group letter, SAP code, name, фаза pin, the SAP/hand switch, adding
  and deleting a line (the row edit, the bulk bar, the create form, the delete),
  a work centre's штатка and capacity (`PUT /admin/production/work-centers/{id}`)
  and the ABC import. Not dated: the unit-wide auto-fill switch, per-day pins,
  the cells register (a CELL's letter is not a catalog field).
- **The grain is the whole UNIT, never one line.** `pp_catalog.freeze` copies
  every line and every work centre of the unit into a `pp_catalog_versions` row
  (JSONB, `valid_from` NULL = every day before `valid_to`) covering the days up
  to the one the edit starts on; `pp_products` / `pp_work_centers` stay the
  catalog from the latest boundary on. A line has no durable identity (an import
  re-creates every row, `pp_calc.line_keys` is content), so «the catalog as it
  stood» is only answerable whole. Versions are never edited: no door reaches a
  past day.
- **Every writer calls `freeze` BEFORE it touches a row.** The session does not
  autoflush, so a row already mutated in memory is copied with its NEW values
  and the past reads the edit after all. A second edit on the same shift-day
  finds the boundary drawn and freezes nothing — within one day the last edit
  wins. `uq_pp_catalog_version_to` (unit, valid_to) settles two writers racing
  to draw one boundary.
- **Every reader goes through `pp_catalog.at` (one day) or `spans` (a range cut
  at the boundaries)**, never `db.query(PPProduct)` for a figure: the dashboard
  (`_build_dashboard` — and so the export, leader auto checks and the override
  path), `zagruzka_source` (fleet загрузка, Plan Prognoz, the forecast), the SAP
  join (`_unit_sap_scope(db, mid, day)` — a re-upload of an old date is joined
  with that day's catalog), the raw view, `/zagruzka-cell` (minutes AND W/S per
  day) and `/live`. A unit with no version reads exactly what it always did, and
  one span keeps the same floats. The gap reports (`zagruzka_gaps`,
  `cell_input_gaps`) and the one-shot reports read the current register on
  purpose: they are «fix it now» lists.
- **WHEN an edit starts is `pp_catalog.effective_day`** — the shift running at
  that moment, else the next one: shift 1 → today until 20:00, tomorrow after;
  shift 2 (dated by the evening it opens) → yesterday's night until 08:00, today
  after; no shift → the calendar date. FIXED 08:00 / 20:00, the operator's pick
  over the «Smena vaqtlari» register, which stays a register. A day already
  CLOSED on «Verifix to'g'irlash» but still in progress takes the edit too (the
  operator's ruling) — the closing ladder plays no part here.
- **Typed quantities follow the dating.** `_carry_manual_quantities(since=)`
  moves a person's ПЛАН/ФАКТ onto the line's new identity only from the start
  day; an earlier day keeps its value under the old identity, which its frozen
  catalog still reads. `_rejoin_lines(since=)` and `_backfill_manager(since=)`
  fill and rebuild only from the start day too.
- **The ABC import is dated like an edit** — the days before keep their catalog
  AND every number on them (the rebuild clears typed values only from the start
  day). The ONE exception is a unit importing its FIRST catalog
  (`pp_catalog.is_empty`: no line, no work centre, no version) — nothing older
  exists, so that import reaches every stored date as imports always did. The
  card says which (`applies_from`, null for a first catalog).
- **Nothing was reconstructed.** No history of old values existed, so every day
  before the first dated edit reads the catalog as it stood on release day (the
  operator chose this over rebuilding from the Jurnal, which recorded no old
  values for bulk edits or imports). Nothing moved when this shipped.
- **The page**: on a day an edit made now cannot reach, the add / edit / delete
  / bulk controls are GONE (`dashboard.catalog.editable`), with one line naming
  the day edits count from and a button onto it. Each catalog form says it
  before Save («counts from DD.MM»), and each save's toast names the day. No
  «changed» mark on the table (the operator declined it — the Jurnal records
  who changed what, each save logs `from`).

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
  the value is never moved to a NEIGHBOUR, and who did the moving decides where
  it goes — see the next entry.
- **A catalog EDIT carries the typed values with the line; a catalog IMPORT
  cannot.** `production._carry_manual_quantities`, run inside `PUT
  /admin/production/catalog/{id}`. All four of SAP code · name · Команда ·
  Трудоемкость are part of what a line's quantities are keyed by, so editing
  one used to re-point the reader onto a key with nothing under it: **a number
  somebody typed read 0 on every date at once**, closed and signed-off days
  included, with nothing on screen saying so. An EDIT is the one caller that
  can move a value honestly — one row, one id, its fields before and after —
  which is precisely what an IMPORT cannot do, since matching re-created rows up
  by position is the mis-attribution `line_keys` exists to prevent. So the carry
  lives on the endpoint and `import_catalog` keeps the documented revert.
  - **Only what a PERSON typed travels.** `pp_line_daily` always (those are the
    line's own numbers and nobody else's); `pp_daily.*_override` only where the
    line was ALONE in its old group, and onto the line's own per-line row rather
    than onto the destination group. So no row anybody left alone changes value:
    a shared number with siblings still under it is never moved, and a carried
    one lands a level BELOW what the destination's siblings read.
  - **The line's NEW key is re-joined from the stored file, so it never reads 0
    waiting for a re-upload** (from the day the edit counts on only, since
    2026-09-24 — see «A catalog edit counts FROM NOW ON») — `production._rejoin_lines`, run by all three
    catalog writers (create, single edit, bulk) whenever a line gains or moves a
    SAP key. The join that produces ПЛАН/ФАКТ used to run at UPLOAD time and
    nowhere else, against the catalog as it stood then, so a line added or
    re-pointed afterwards matched nothing when the file landed and read **0 on
    every stored date** — while the raw Фаза tab plainly showed the row it should
    have matched, and `pp_calc` renders a missing snapshot row as 0, which is
    indistinguishable from a day that produced nothing. Re-uploading each date's
    file was the only way back and nothing said so. It is bounded three ways and
    is deliberately NOT `_backfill_manager` (the catalog IMPORT's tool, which
    rebuilds every date from scratch): it writes ONLY the moved keys, never
    DELETES a date, and **never clears an override** — an upload does, because a
    file restating a day outranks a number typed against the old figure, but
    nothing is restated here and `_carry_manual_quantities` may have just carried
    a typed value onto this very line, so the snapshot is filled UNDERNEATH it
    and no number on screen moves until that override is removed. A unit with
    auto-fill switched off is skipped, the rule `_backfill_manager` already
    applies. It writes into days already closed and reported — the same reach the
    upload and the import backfill already have — so `filled` rides on all three
    responses and the page SAYS how much was filled; a silent write into the past
    is the one outcome this must not have. `_unit_sap_scope` + `_scoped_faza` are
    the one spelling of the unit's half of the join, shared with the upload
    fan-out, because two would let a line be filled through one door and not the
    other.
  - **The SAP snapshot (`plan_qty` / `actual_qty`) stays where the file put
    it.** It is not the line's property but a record of what the фаза export
    said about one (code, work centre) pair on one date, and
    `_ingest_for_manager` rebuilds it from the file on the next upload of that
    date — so a moved snapshot is a number that quietly vanishes again later.
    **Consequence to know:** a line sent to another Команда keeps every figure
    anybody typed and reads the new Команда's SAP figures for the rest, which is
    what the file actually says.
  - Sources are deleted and flushed BEFORE any destination is written, because
    an edit can SHUFFLE keys as well as move one: renaming a line onto another
    line's name and Трудоемкость re-ranks the `#n` suffix separating them, so
    one line's destination is the other's source, and writing first would hit
    `uq_pp_line_daily_key`. A row already at a destination can only be an orphan
    of an earlier edit (no two live lines share a `line_key`), so the moving
    line's own number wins; a value it does not carry blanks nothing.
  - The count rides the action log as `carried_values`, so «why did this number
    move» is answerable from «Jurnal» rather than from memory.
- **Several positions are edited at once from the «Позиции» table itself** —
  checkbox column → sticky bulk bar → one modal, `PUT
  /admin/production/catalog/bulk` (admin only, `_CATALOG_BULK_MAX` 500).
  - **Exactly two fields: Команда and Трудоемкость.** They are the only ones
    that can mean the same thing on many rows. **SAP code and name are
    deliberately absent** — each identifies ONE line, so setting them on twenty
    rows only produces twenty lines the register cannot tell apart — and `op` is
    out for a subtler reason: on the single-row form a blank box CLEARS the фаза
    pin, while here blank has to mean «leave every row alone», so one control
    would carry two opposite meanings on two screens. A blank field changes
    nothing on any row, and the modal says so under each control.
  - **The SELECTION is the scope, never the filter** (the `ShiftTimes` /
    `Factories` model). A tick survives a filter change — the rows an operator
    must leave alone are exactly the ones a filter cannot express — so the bar
    states how many picks the current filter HIDES rather than letting «12
    selected» stand over 3 rows on screen. «Select all» unions the visible rows
    and unticking removes only those: a header checkbox must not throw away
    picks made under another filter. Kept in memory, and cleared when the
    brigadir changes — the catalog belongs to one unit, the endpoint refuses a
    mixed-unit batch, and a pick carried across would aim at rows nobody can
    see.
  - **The identity carry runs ONCE over the whole batch**, not per row.
    `line_keys` ranks its `#n` suffix over the whole catalog, so row two's
    identity depends on what row one just became and only a single
    before/after pass sees the finished shape — it is also what makes two lines
    SWAPPING Команда safe.
  - A row with no `id` (an unknown SKU the SAP file carries, with no PPProduct
    behind it) offers no checkbox: there is nothing to edit. The pick column is
    NOT in the `ColumnsPicker` — it is a control, not one of the day's facts, so
    it can never be hidden away from the bar that acts on it, and every
    `colSpan` on that table counts it (`colCount`).
  - Bulk DELETE was deliberately not built: the operator asked to change rows,
    and deleting catalog lines has no undo.
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

### Which DAY a position counts on (`pp_calc.DUE_DAY_FROM`)

From **2026-09-17** (`DUE_DAY_FROM`, the operator's directive) **both** figures of
a position — ПЛАН and ФАКТ — count on the order's **БазисСрокКонца** (заголовок
col J), for **both shifts**, and on no other day.

- **The two defects it closes.** «Поставлено» is an ORDER-header field carrying
  no date of its own, so the only thing that could ever date it was the фаза
  operation it is joined through: `faza_quantities` folds it once per order
  INSIDE one day, but the ingest runs per DATE, so an order whose operations
  start on two days had its FULL delivered quantity written to both. And the
  ПЛАН of an order due TOMORROW was counted against TODAY's delivery — on
  17.09.2026 F00001895 at A1443 read ПЛАН 680 (order 1764353, 360, due 17.09 +
  order 1765394, 320, due 18.09) against ФАКТ 340, i.e. **50%** for a day that
  had in fact delivered 340 of the 360 it owed. It now reads 360 · 340 · **94%**,
  and the 320 belongs to the 18th.
- **`pp_calc.ops_for_day` is THE filter and `by_due_day` THE test** — never
  re-spell the comparison at a call site. ONE filter, because both figures are
  keyed the same way: a kept operation's delivery is that day's by construction,
  and a skipped one takes its ПЛАН and its «Поставлено» away together. There is
  no second gate on the quantity.
- **What this reopens, deliberately.** The 29.08.2026 ruling that a shift is
  credited on the day it STARTED the work (`pp_parser.FZ_DATE`, col H
  «СамРанДатаНчлВыполнен») no longer decides the day from the floor on. **On
  shift 2 the due date is the morning AFTER by construction**, so a night that
  opens 17.09 at 20:00 is due 18.09 and its plan lands there — on a date whose
  typed headcount and attendance belong to the next night, while the загрузка
  divides one by the other. The operator was shown this consequence and answered
  "for both plan and fakt and for both shifts". It is not an oversight and it is
  not to be quietly narrowed to one shift.
- **What keeps the 29.08 incident from repeating is REACH.** A фаза row is still
  stored under the date its own col H names — the parser is untouched — and the
  day that OWNS it reads it back out of every slice in the window
  (`_SLICE_BACK` 30 / `_SLICE_FWD` 7 in `routers/production.py`). So a position
  does not have to appear in its due day's own file to be counted there, which is
  exactly what dropped 28 operations when col I was tried. `_load_slices` reads
  that window once; `_all_slices` reads a whole loop's span once, because
  `_backfill_manager` and `_rejoin_lines` walk every stored date.
- **`_stored_slices` is the ONE reader** and the upload goes through it too
  (after flushing its own slices), so an upload and a later re-ingest of the same
  date cannot produce two different answers. A заголовок-ONLY upload deliberately
  does not reach it: it wrote nothing before, and reading the stored фаза back
  there would turn it into a mode-«both» ingest that DELETES the date's rows and
  clears every override on it.
- **Order facts merge newest-date-first above the floor.** «Поставлено» is
  cumulative as of the moment the export was taken and the day that owns an order
  is often earlier than the file that finally reports its delivery, so the most
  recent заголовок naming an order is the most current statement about it. Below
  the floor only the day's own заголовок is read, or a historical day's ФАКТ would
  move the first time anything re-ingested it.
- **An order with NO readable БазисСрокКонца keeps the old rule** and is counted
  on the day its own operation started. A file that does not say when an order
  was due must not make a real position vanish.
- **An upload writes only the date it was given, and SAYS what it displaced.**
  In mode «Reja + Fakt» an ingest deletes the date's rows and clears its
  overrides, so reaching into a neighbouring day would wipe numbers somebody
  typed there. Instead `rows_other_days` + `other_days` (what of this file
  belongs elsewhere, and which dates to upload next) and `rows_taken_in` (what
  this day took out of earlier files) ride on the response, print on the upload
  card and are counted in the action log.
- **The raw «Фаза» / «Заголовок» tabs are a view of the FILE**, so they still
  show what the export held for that date — which above the floor is no longer
  the same set of rows the date COUNTS. That is the honest reading of a raw-file
  view and is not to be "fixed" by filtering them.
- **A FLOOR, never a rewrite.** Every day before 17.09.2026 resolves exactly what
  it always resolved — `ops_for_day` falls back to the operation's own date and
  `_stored_slices` reads that date's slice alone — so nothing already closed and
  reported moves, and no one-shot replays history. The floor must never be moved
  LATER, which would hand days back to the old rule that have already been read
  under this one. `startup.correct_pp_double_counted_days` is untouched and still
  folds with the old semantics: it is flag-guarded, has already run, and an empty
  DB has no stored day for it to reach.
- **Consequence to know: already-ingested days do NOT re-read themselves.**
  ПЛАН/ФАКТ are STORED (`pp_daily`), so a day keeps the figures it was written
  with until it is ingested again — by re-uploading it, or by a catalog
  backfill / line re-join, both of which now go through the same rule.

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
  from the day the import counts on (all of them for a unit's first catalog,
  since 2026-09-24) replaced, every override cleared — so honouring the flag on the upload and
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

### …and which of its ROWS (`pp_products.auto_fill`)

From **2026-09-09** the same question is asked one level down: a single catalog
LINE can be taken off SAP auto-fill, so its ПЛАН/ФАКТ are entered by hand while
the rest of the unit's catalog goes on being filled from the file. Set on the
«Позиции» table — the row's edit modal, or the bulk bar for a selection.

- **It cannot be expressed by skipping a write, and that is the whole shape of
  the feature.** `pp_daily` is keyed by (SKU, work centre) and 313 of the
  platform's lines sit in 118 groups sharing one row, so an upload has to go on
  writing the group's record for the siblings that still read it. What the flag
  governs is whether this LINE READS that record — which is also the reading
  `_carry_manual_quantities` already states: the snapshot is what the фаза
  export said about one (code, work centre) pair on one date, not any one
  line's property.
- **`pp_calc.takes_sap` is THE predicate**, and it answers TWO facts at once:
  the flag, and **whether the line has a SAP code at all**. The фаза join
  reaches a position through its code, so a code-less line (a dough mix,
  «Донат») could never be filled by the file and never was — `daily_key` mints
  it a synthetic key the join cannot produce. Its number has always been the
  one somebody typed, so the switch is offered ONLY on a coded line: there is
  nothing for a code-less one to decide, and both the create and the update
  endpoints answer **400** rather than storing a setting nothing honours (they
  are reachable without the UI). The bulk press SKIPS such rows and reports
  `skipped_no_code` — the selection is the scope there, and one code-less row
  must not bounce a screenful of ticks — and the toast says so, because a
  silent skip reads as a clean success.
- **The gate silences the FILE, never a PERSON.** A line that answers False
  reads its own per-line value (`PPLineDaily`), and failing that the group's
  hand-typed override on the same `pp_daily` row; only the snapshot goes quiet.
  Reading it as «this row has no quantities» blanks a figure somebody entered,
  on every past date at once — the accident `_carry_manual_quantities` exists
  to prevent, arriving through a different door — and the code-less lines,
  which have answered False here since before the flag existed, are exactly the
  rows carrying such values today. With neither level the row reads 0, which is
  what the page has always shown for a position the day's upload did not
  mention.
- **Every reader goes through the one predicate**, or the Positions table and
  the загрузка start reporting different minutes for one day — the rule
  `pp_calc.line_minutes` was made a function for. `compute_dashboard` applies
  it directly; `line_minutes` takes `sap_off` (the line identities that do not
  take the file) and its `shared` values grew two flags saying whether that
  value was TYPED, which is what lets it silence a snapshot without blanking an
  override. Both are optional and default to the old behaviour, so a caller
  that has not been taught them computes exactly what it always did. The three
  callers — `/zagruzka-cell`, `/live` and `zagruzka_source` (the fleet
  загрузка) — all ship both.
- **An upload leaves a manual row alone, and that is what makes the switch
  real.** In `_ingest_for_manager` a manual line's overlay rows are neither
  deleted with the date (mode `both`) nor cleared field by field — without it,
  «this row is kept by hand» would last exactly until somebody uploaded the
  day. A hand-typed value on the GROUP row is exploded down onto the manual
  lines just before that row is replaced, the same explode `_set_line_override`
  performs, because the delete is the one moment it would be destroyed.
  **Consequence to know: a code-less line's typed value now survives an upload
  too.** It is the honest consequence of one predicate — the file says nothing
  about such a line, so it should not empty it — and it only ever preserves.
- **Nothing moved when this shipped.** The column is `NOT NULL DEFAULT TRUE`
  and the migration is pure DDL with no flag (`startup.add_pp_product_auto_fill`),
  so every existing line reads exactly as it always did until a row is switched
  off, and switching one off changes no number already on screen except the
  ones the file was supplying.
- **A catalog IMPORT carries the flag across the wipe**, keyed like the pinned
  фаза (`daily_key` + work centre) — `import_catalog` deletes and re-creates
  every `PPProduct`, so losing it would put a row an operator took OFF
  auto-fill back on it and the next upload would overwrite what they typed.
- Read surfaces: the «Манба» column on «Позиции» (a two-state chip — the file,
  or a person; WHY it is typed lives in the tooltip, because a third chip is
  one nobody can decode), and the ПЛАН/ФАКТ cells, which say it where the
  consequence actually lands. **The column is in `defaultHidden` for everyone
  but an ADMIN** (2026-09-09, the operator's call): it answers the same question
  the switch is set from, and only an admin can set one or upload the file the
  other half of the answer names. A DEFAULT, never a lock — the `ColumnsPicker`
  still offers it to every reader, since a supervisor asking «why is this number
  not the file's» must be able to see the answer — so a profile that has already
  saved a visibility choice keeps it, the `DEFAULT_HIDDEN` rule unchanged. That statement outranks «shared by N lines»: a
  row reading no group figure is not sharing one.
- Deliberately unchanged: the unit-wide `PPManagerSetting.auto_fill` above,
  which still decides whether an unattended upload reaches the unit at all; the
  closed-day lock; and the SAP snapshot itself, which is still written for every
  group the file names.

## The call forecast, sent by the clock (`forecast_autocall`)

From **2026-09-08** the «Smenaga chaqirish» modal's send happens by itself:
**shift 1 at 19:00** and **shift 2 at 06:00**, plant wall clock, every day.
`services/forecast_autocall.py` is THE definition — the times, the audience,
both date rules, the switch.

- **It computes NOTHING of its own.** The job calls `_call_rows` and
  `_send_call_notice` in `routers/production.py` — the very functions the
  modal's two endpoints read, refactored out of them for this — so a count
  DMed by the clock can never differ from the one the modal would have shown
  for that date. Same DM, same `call_forecast` bell row, same
  `ForecastCallNotice`.
- **The DM carries the CARD** (2026-09-15, the operator's go-ahead after trying
  it on `/forecast`): a Rich message whose figure is `forecast_card`'s PNG —
  the same-weekday history the count was averaged over, drawn from the row's
  own `samples` — above a facts table that adds the plan in trudoyomkost
  minutes. It is attached in `_send_call_notice`, so the clock AND the modal
  send it, and `forecast_rich.card()` is THE builder for both and for
  `/forecast`, the bot's test door, so a test cannot show a message the send
  does not. It degrades one thing at a time — rich → the card as a photo under
  the classic HTML caption → the classic text — and a card that fails to render
  costs the card, never the DM. **The facts on it are the SENT numbers**: the
  modal lets a person edit the count, so «Tavsiya» / «Maksimum» read what the
  message states while the chart and «o'rtacha» stay the computed history — an
  edited send reads «Tavsiya 60» beside a «Prognoz 54» point, each under its
  own label. The trudoyomkost is the mean of the recorded plans, never
  `count × capacity`, so about a quarter of units divide back to one person off
  the recommendation — documented in `forecast_card.collect`, not a bug. The
  bell row is unchanged, and a DM queued for an unclaimed profile still goes out
  as text when it is claimed.
- **Each shift is sent its NEXT shift-day, and the two are not the same
  calendar arithmetic** (`target_date`, never re-derived at a call site). At
  19:00 a shift-1 brigadir is on today's day shift, so the next one they staff
  is **tomorrow**. At 06:00 a shift-2 brigadir is finishing the night the
  platform labels YESTERDAY (a night belongs to the date its 20:00 boundary
  opened), so the next one they staff opens at 20:00 **today** — today's date,
  ~14 hours of notice. Sending them tomorrow's would mean a brigadir never gets
  a forecast for the shift they are about to begin.
- **A unit already notified for that date is SKIPPED.** `last_notice` is the
  modal's own resend guard, read here as a hard skip rather than a confirm: a
  person who sent that unit's call by hand has already answered the question,
  and a job that fires twice must not DM the plant twice. **A send made by hand
  always wins.**
- **The audience mirrors the modal's pre-selection** — a forecast AND a claimed
  supervisor profile — so the clock can never reach somebody the button would
  have left unticked.
- **Two AppSetting rows, read AT FIRE TIME**: `forecast_autocall_enabled` and
  `forecast_autocall_capacity_pct` (the «Smena unumi» the counts are computed
  at). Pausing the send has to be an admin edit and not a deploy — this
  platform has no shell. An **absent row reads as ON at
  `forecast_autocall.DEFAULT_CAPACITY`**, which is **90%** from 2026-09-09 (the
  operator's call — a worker who is present is not productive for all 480
  minutes, and 100% assumed they were). **Consequence to know: every forecast
  count ROSE by about 11%** when this landed, because the same trudoyomkost is
  divided by 432 productive minutes instead of 480. A default only reaches a box
  with NO row, and the «Avto» chip writes one the moment anybody opens it, so the
  move off 100% carries a flag-guarded one-shot as well —
  `startup.set_forecast_autocall_capacity` (flag
  `forecast_autocall_capacity_90_2026_09_09_v1`), which states an END state,
  leaves `enabled` alone, and is what protects every LATER admin edit; changing
  the figure again needs a **NEW flag key**. The control is the «Avto» chip beside «Ertangi chaqiruv»
  on the forecast card (`GET`/`PUT /api/production/trudoyomkost/autocall`):
  readable by everyone who can open the page, writable by an ADMIN only, since
  it governs a plant-wide send.
- **`sent_by = AUTO_SENDER` (0)** is the sentinel actor — `ForecastCallNotice.sent_by`
  is a NOT NULL telegram id — and the modal prints «Avtomatik» for it instead
  of resolving a name that will never be found (`auto` on the row payload).
- **A boot inside `CATCHUP_MIN` (90 min) after a send time runs that send
  late.** A push to main restarts the unit and a cron fire time that passes
  while the process is down is simply dropped (memory jobstore, 5-minute
  misfire grace), so a deploy at 19:00 would otherwise cost the day's call
  entirely. Bounded, because "late" stops being a kindness before the middle of
  the night; it cannot double-send, because the per-unit skip above holds.
- Filed in the action register under the manual send's own action
  (`comms` / `notification.workers_called`, `source="system"`) — one act, one
  place, told apart by its source. A failed pass writes an `error` row rather
  than disappearing.
- Registered from BOTH entrypoints (`main.py` lifespan + `passenger_wsgi.py`)
  like every other boot job.


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

## THE task board (`/tasks`) — both tiers, one page

From **2026-09-04** the two task boards are ONE page. `/brigadir-tasks`
(smena menejeri → brigadir) is retired: its route redirects to `/tasks`, its
page key is gone from `PAGE_KEYS`, and `pages/Tasks.jsx` renders both tiers the
way `/concerns` renders every level of its chain — one register, a LEVEL on
each row, an analysis tab beside it.

- **`GET /api/tasks/board` is THE read** — every task the viewer may see from
  either tier, with the rights ON EACH ROW (`can_edit` / `can_status` /
  `can_reorder` / `can_comment`). Reach is the UNION of what the two lists
  served: admin everything, a shift manager both tiers inside their shift ∩
  plant (`services/shift_scope`, archived units kept), a brigadir both tiers
  of their own unit, a leader their own queue. The board is not homogeneous —
  a shift manager governs the brigadir rows and only reads the leader rows, a
  brigadir the reverse — so the page derives NOTHING from the viewer's role.
  Each right is the same predicate the owning router's write endpoint applies,
  resolved once per request, never once per row.
- **Writes still go to the router that owns the tier**, and that split is the
  whole of what survives: leader rows through `/api/tasks`, brigadir rows
  through `/api/brigadir-tasks` (now gated on the `tasks` page). The client
  picks the prefix by `assignee_kind` (`endpointFor`). One task, one router
  that owns it — two routers with two rights models claiming one row is how
  only one of them is right.
- **`GET /api/tasks` (the leader tier alone) stays** for a tab open on an
  older bundle, which is why this shipped as a MINOR: nothing an old tab sends
  is refused.
- **A task is URGENT or it is not — the flame, and nothing else** (the
  operator's directive, 2026-09-08). `LeaderTask.priority` carries the flag:
  **1 = urgent, NULL = ordinary**, and `services/task_board.py` — `URGENT`,
  `is_urgent`, `urgent_value`, `urgent_first` — is its ONE spelling, so neither
  router can put a third value in the column. It replaced a dense 1..N queue
  per assignee (positions, a two-step swap/shift editor, close-ranks whenever a
  task left the queue, a profile-row lock per mutation, and a renumber on every
  boot). That machinery answered a question nobody was asking: nobody ranks
  their fourteenth task against their fifteenth, the editor could not even be
  opened on a queue of one, and the positions were noise carrying an invariant.
  - **Nothing was erased to ship it.** `is_urgent` is `priority == 1` and
    deliberately NOT "not NULL": rows written under the queue still carry their
    old position, and a task that sat fourth in somebody's list was never a
    statement that it was urgent. Only what WAS the top of a queue reads as a
    flame; every write from here on stores 1 or NULL, so the leftovers go as
    rows are touched. **Consequence to know: on the day this shipped every
    assignee's position-1 task came up flamed** — one per person, the closest
    thing the old data had to «this one matters».
  - **`startup.backfill_task_profiles` lost its renumber block, and that was
    the load-bearing edit.** It runs on EVERY boot and wrote a dense 1..N into
    each profile's active tasks — i.e. a 1 into whichever task sorted first for
    every single assignee. Left in, it would have re-flamed the platform at
    every restart.
  - **A status change no longer touches the flag.** It used to leave the queue
    on «done» and rejoin at the back when reopened; now the flame stays, so a
    task that was urgent still says so once it is finished.
  - **`PATCH /{id}/priority` keeps its path and takes `{urgent}`** — it also
    still reads the old `{priority, mode}` body, where position 1 means "make
    this urgent" and anything behind it "don't", so a tab left open on the queue
    bundle keeps working instead of 422-ing on a save. Rights are unchanged: the
    unit's supervisor / the covering shift manager and admins, never the
    assignee — what is urgent is the statement of whoever set the work.
  - The column key on the table stays `"priority"` (a saved `tasks_sort` goes on
    working); what it sorts by is the flame. `UrgentToggle` in
    `components/ui/TaskQueue.jsx` is the control — one tap, orange (`#f97316`),
    **never red**: red is the traffic light's «overdue», a fact about the due
    DATE, and a row is easily one without being the other. A viewer who may not
    press it sees a plain dash, never an inert flame.
- **Status is the PARTITION; overdue is a FLAG.** The donut, the KPI cards and
  every ranked stack count what the status column says — todo / doing / done —
  and «muddati o'tgan» is the open rows past their date, printed BESIDE them
  (the donut's legend carries it under a rule as «shu jumladan», the ranked
  bars as a red mark before the total). The earlier reading pulled an overdue
  task out of its status bucket, so a board of twelve overdue «to do» tasks
  printed «to do: 0» over a table of twelve «to do» rows. Never re-introduce a
  fourth "overdue" bucket on this page; the Concerns board still keeps its four
  disjoint buckets and has not been asked to change.
- **The page-key merge is a startup fold, not a flag**
  (`startup.merge_brigadir_tasks_page`): the saved Access matrix's
  `brigadir-tasks` roles are unioned into `tasks` and the key removed; a
  personal `page.view.brigadir-tasks` GRANT is renamed to `page.view.tasks`
  where no such row exists (else dropped, the unique key forbids two); a DENY
  is dropped, because the only page it could now close is the merged one. The
  trigger state cannot recur, so a second pass is a no-op. Default access is
  `tasks: shift-manager + supervisor + leader`.
- **Controls follow the payload, not the role.** The tier filter and column
  exist only while both kinds are present, the shift / brigadir sections and
  the unit column only while more than one unit is; a leader sees neither an
  assignee column nor a leader filter. The org chain is grouped «Kim va
  qayerda», the record filters «Vazifa», and the leader list under a brigadir
  pick says so (`note`) and offers the way back (`empty`).
- **The analysis tab** (`tasks_view`): four insight cards (who sets the most,
  the longest queue, the oldest open task, the on-time share of done tasks),
  the open-task trend with its status strip, the status donut, opened-vs-closed
  per day, a status stack per unit, and two ranked boards — by CREATOR (badged
  with the role they set it from) and by ASSIGNEE (badged with the tier) —
  plus the completion-time histogram. All computed client-side over the SAME
  filtered rows as the register, so the two views tell one story.
- **`components/ui/AnalysisBoard.jsx` is THE home of the analysis vocabulary**
  — `InsightCard` / `Metric` / `Subject` / `Empty`, `ChartCard` / `Chart` /
  `NoChart`, `StackLegend`, `RankedBar` / `RankedList` (badge and extra are
  render props), `useRowFit`, `LevelChip` + `LEVEL_COLOR`. They were private to
  `Concerns.jsx`, which now imports them and keeps only its own
  `ResponsibleList` wrapper (a `RankedList` badged with the chain step). A
  third board copies nothing from either page.

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

## Who uses the app (`/activity`)

From **2026-09-15** (the operator's call) «Foydalanuvchilar faolligi» is TWO
tabs over ONE ledger, `user_activity` — one row per (Telegram account, PROFILE,
day), filled by the 60 s heartbeat `POST /api/activity/ping`.
`routers/activity.py` reads it twice; `pages/UsersActivity.jsx` draws both.

- **«Profillar bo'yicha» is a PERSON** (the identity rule): every account working
  as a profile folds into its row, time summed, accounts listed.
  **«Foydalanuvchilar bo'yicha» is a LOGIN**: one Telegram account, the profiles
  it worked as listed. `?by=profile|account` picks the unit on the SERVER, so the
  two tabs always add up to the same minutes and neither is derived from the
  other's rows. No `by` means profile — what a tab still open on the one-view
  bundle asks for.
- **Every day count is DISTINCT days.** A profile held by several accounts writes
  a row per account per day; counting rows read as 69 active days in a 30-day
  month.
- **The ledger day is the plant's wall clock** (`TZ`, Tashkent) from 2026-09-15.
  It was the UTC day, so 00:00–05:00 landed on yesterday and «Bugun faol»
  answered for the day before until 05:00. Older rows keep their UTC label — a
  row stores a total, not its hours.
- **«Kirishlar» counts VISITS** — `session_count`, bumped by a row's first ping
  and by every ping after a gap longer than `PING_MAX_GAP`. It used to print
  `event_count`, the PING count (about one a minute). NULL on every row written
  before 2026-09-15, never 0, and `sessions_from` on the payload is what lets the
  page say from which day it counts. `add_activity_session_count` is its
  migration, called from `add_activity_profile_key` so both entrypoints run it.
- **Legacy rows are resolved on READ, never rewritten** (`_legacy_profiles`). The
  NULL-`profile_key` rows from before 2026-07-25 are matched by the account's
  admins row, then the ONE held profile whose name matches the snapshot
  (script-blind, `_fold_name`), then the ONE profile of that role carrying that
  name, then a DIRECT role the account holds exactly once — never that last step
  for a leader, whose account may have been handed on. What stays unresolved is
  shown with its account and marked «Profil aniqlanmagan», never guessed.
- **An «open as this profile» session counts as the ADMIN who opened it**
  (`_heartbeat_owner`, the token's `imp`) — its `sub` is the holder's account, so
  read as written it showed a leader in the app while they were not.
- Page key `activity`, admin-only by default. Every figure is derived per
  request; nothing but the heartbeat writes.

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

## The browser door as an INSTALLABLE APP (PWA)

From **2026-09-19** the browser door can be installed — «Safia IMS» on a
desktop, a home-screen icon on a phone, standalone (no browser chrome).
`frontend/public/manifest.webmanifest` names it, `public/icons/` is the
launcher art, `src/sw.js` is the service worker, `utils/pwa.js` owns the
runtime half (the `beforeinstallprompt` capture, the `appinstalled` mark, the
registration), `hooks/usePwaInstall.js` is what a component asks, and the ONE
surface is the «Ilovani o'rnatish» row in the header's profile menu — Chrome
and Edge get the captured prompt, an iPhone gets a two-line hint (Safari fires
no event; the route is the share sheet).

- **Never inside Telegram, and the gate fails CLOSED.** `registerWorker`
  registers nothing when `launchedByTelegram()` — the SDK's `platform`, OR
  `tgWebAppData` / `tgWebAppPlatform` in the launch URL, which is what a
  Telegram WebView whose copy of the SDK never loaded (the antivirus-intercept
  case) still carries. The mini-app is the primary device and its boot
  overlay, stale-chunk reload and update prompt were all tuned to a tab with
  no cache layer underneath it; iOS's WKWebView has no service worker anyway.
  Known bound: Telegram WEB (web.telegram.org) frames the same origin, so a
  person who also uses the browser door in that same browser profile has the
  mini-app iframe controlled by the worker they registered there — harmless
  (assets cache-first, navigations network-first), and not a registration.
  Lifting the bound is one condition and a separate decision.
- **`dist/sw.js` is WRITTEN BY THE BUILD** (`emitServiceWorker` in
  `vite.config.js`, a `writeBundle` twin of `emitBuildInfo`): it takes
  `src/sw.js` and fills in the build stamp and the precache list — `/` (the
  shell), every file under `dist/assets`, the icons (listed from `public/`, since
  Vite copies it on its own schedule) and the root statics. ONE cache per build,
  named by the stamp; activation drops every other build's cache, and
  `skipWaiting` + `clients.claim` make that immediate. Precaching is bounded to
  eight fetches at a time. An unchanged hashed asset comes out of the HTTP
  cache (immutable) — but chunk hashes CASCADE (a shared chunk's change renames
  nearly every chunk that imports it), so in practice most deploys re-download
  most of the graph, ~5 MB per browser client per deploy, the same figure a
  first visit pays. Accepted for the audience the browser door has (desks on
  the office network; phones are on Telegram, where no worker exists); the one
  knob is the precache list `emitServiceWorker` writes — shrink it to the entry
  graph and let the rest cache on use if that cost ever matters.
- **What the worker does, and what it must never do.** A navigation to an SPA
  route: NETWORK FIRST with a 5 s timeout, the cached shell as the fallback —
  for offline, a slow origin AND an origin 5xx (nginx answers 502 during the
  backend restart every deploy performs, which is exactly when `UpdatePrompt`
  has just asked for a reload); a 4xx is never masked — and a plain offline
  page last. So a reload still fetches the deployed index.html and the reload
  keeps its meaning. `/assets/*`: cache first (content-hashed, immutable). Root
  statics, plus `/logo.png` for the boot screens: network first. **A failing
  Cache API degrades to plain network** (`safeOpen` / `safeMatch` / `safePut`
  in `sw.js`) — a storage refusal inside `respondWith` would otherwise turn a
  reachable server into a dead navigation — and a non-navigation is stored only
  when it is not HTML, because `serve_spa` answers any unknown path with the
  shell and a renamed static would otherwise park index.html under its URL.
  **Not intercepted at all**: anything non-GET, anything cross-origin (the
  worker's own CSP `connect-src` would refuse a font re-fetch), `/api/*`,
  `/bot/*`, `/health`, `/docs`, the backend's `/admin/*` routes (only `/admin`
  and `/admin/upload` are SPA paths — `SPA_ADMIN` in `sw.js` is a hand copy of
  `App.jsx`'s two `/admin` routes and must move with them), `/build.json`,
  `/sw.js`, and any navigation whose path names a file — an export opened in a
  new tab must reach the server on its own terms, because the shell fallback
  would otherwise answer a slow `.xlsx` with index.html.
- **Every cache lookup ignores `Vary`.** The CORS layer stamps `Vary: Origin`
  on assets, the Cache API honours it by default, and a module-script request
  carries an `Origin` header where a plain `fetch()` does not — so the entry
  chunk `fetch()` found was a MISS for the module loader and an offline start
  died on it (found in local testing before the first deploy). Assets are
  content-hashed, identical for every origin; `MATCH = { ignoreVary: true }`.
- **`sw.js` is served `no-store` and the manifest as
  `application/manifest+json`** (`serve_spa`), for the reason `build.json`
  is: Cloudflare caches `.js` by extension, and a pinned worker script pins the
  previous build's precache list for as long as the edge keeps it.
  `updateViaCache: "none"` at registration is the browser-side half.
- **The update model is unchanged.** `useAppUpdate` still polls `build.json`
  (never cached — no route matches it), and when it sees a newer build it
  nudges `registration.update()` so the new worker precaches the new build
  BEFORE the user presses reload. A tab left open keeps its old chunks in the
  old cache until the new worker activates; then a missing chunk 404s and
  `lazyWithReload` reloads, exactly as before.
- **The kill switch is ONE constant, and a ROLLBACK is not one.** There is no
  shell and no toggle: flip `PWA_ENABLED` in `utils/pwa.js` to `false` and
  deploy. The next load of the new bundle unregisters every worker of the
  origin and deletes the `safia-*` caches (`retireWorkers`), in every browser
  that opens the app — the old worker still serves that first load
  network-first, so the new bundle always arrives. It lives in the BUNDLE and
  not in a replacement `sw.js` on purpose: a worker that unregistered itself
  and re-navigated its clients (which, before `clients.claim()`, it does not
  even hold) would be re-registered by the bundle those clients then load, and
  loop. Rolling back to a commit WITHOUT `sw.js` removes nothing:
  `serve_spa` answers a missing file with index.html, the browser's update
  check refuses the HTML, and every registered worker stays exactly as it was
  — harmless (network-first navigations, cache-first hashed assets), but alive.
- **Icons are edge-cached by Cloudflare (~4 h, by extension) under fixed
  paths**, so a regenerated icon must change its file name (and the manifest's
  `src`) or it reaches nobody for hours.
- **Outside Telegram the safe-area insets follow the OS.** `index.css`'s
  `:root` defaults for `--tg-safe-bottom/left/right` are `env(safe-area-inset-*)`,
  because the installed app on an iPhone runs full-bleed under the home
  indicator (`viewport-fit=cover` + standalone) and every bottom-anchored
  surface pads by those variables; a desktop resolves them to 0 and Telegram
  still overwrites them from `main.jsx`. `theme-color` follows the in-app theme
  — `ThemeContext` rewrites the meta from the computed `--bg-base`, so the
  standalone title bar matches the header, and the ES5 boot script in
  `index.html` paints a stored «light» onto `data-theme` and the meta BEFORE
  the bundle runs, so a light-theme user no longer opens on a dark page under a
  dark bar; the manifest carries the dark values because dark is the default
  and a static manifest cannot follow a stored choice.
- **The icons are rendered from `public/logo.png` by `scripts/render-icons.py`**
  (Pillow — `backend/venv/bin/python scripts/render-icons.py`), all four
  together: 192/512 `any` keep the round logo's transparent corners (the
  favicon look), 192/512 `maskable` put it on the ring gold (`#D5B26F`, the
  disc's own colour) scaled to the 80% safe zone. Never hand-edit one of them;
  re-run the script, and rename the outputs (see the Cloudflare note).
- An installed iOS app keeps its own storage, so the login is entered once
  more there; nothing else about the session model changes (`webSession`, the
  profile wallet and the JWT are exactly what the browser tab holds).
- Not built, on purpose: push notifications (Telegram is the notification
  channel), an offline data layer (every page is live data; `ProofCamera`'s
  upload queue is the one offline flow and predates this), and a Workbox
  dependency — the worker is ~140 lines whose every rule is stated above, and
  `vite-plugin-pwa` would have added a peer-dependency risk to a pipeline whose
  `npm ci` is a deploy.

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
- Everything «ARC tickets» says is GONE (the prober, the «API» panel, `/probe`,
  `/spec`) is gone from `/arc` only — here it is back, admin-only, as it was.

## Live shift monitor (`/live`, Laboratory)

From **2026-09-04** the Laboratory carries a wall-screen page for shift
managers — `pages/LiveOverview.jsx` (+ `components/live/`) over
`GET /api/live-overview` (`routers/live_overview.py` FETCHES,
`services/live_overview.py` COMPUTES — the deck/matrix split, so nothing in
`services/` imports a router). It answers two questions for the shift on the
clock, per brigadir and per cell: how much did we wait so far, and how fast is
the plan being filled. Page key `live`, **admin-only until the operator opens
it** (no roles by default; the intended reader is the shift-manager, who is
locked to their shift ∩ plant server-side via `shift_scope` whatever `?shift=`
says; a supervisor or leader would see their own unit only).

- **Every figure is one the platform already prints.** Waiting is the cells'
  filed intervals (the `/idle-cell` rows, approved); the UNIT figure is
  `idle_source.unit_downtime`, the headcount-weighted mean every KPI page
  reads, so the number a brigadir is ranked by here is the number `/downtime`
  shows tomorrow. ПЛАН/ФАКТ minutes are `pp_calc.line_minutes`, the Positions
  table's own resolution of the per-line quantity rule; people are counted
  under `idle_source._counted_hc` (imported, not re-spelled).
- **The shift clock is `cell_hours.defaults`** — the two «Smena vaqtlari»
  SHIFT defaults, printed in the page header. This is the first consumer of
  that register (its own section says to ask before wiring one): only the
  shift-level pair is read, never a cell's own clock, and it moves no score —
  it decides which day is on screen and how far through it we are. Until an
  admin confirms those two rows the page runs on the 08:00–20:00 /
  20:00–08:00 placeholders, which is the one open decision this page carries.
- **The day on screen is the most recent shift start** (`shift_frame`): a night
  shift at 02:00 belongs to yesterday's date, which is also the date its
  leaders file under. After the window closes the frame stays on that day at
  100% until the next start, so a screen between shifts shows the last result,
  never a blank. `?date=` (admin/top-manager only) replays a finished day for
  looking at the design when nothing runs — marked «not live» on screen.
- **«On pace» is a linear floor, judged late and never on silence.** Expected
  = plan × elapsed fraction; nothing is judged in the first 10% of the shift;
  a unit with a plan and NO ФАКТ is «fakt kiritilmagan», never «lagging» — the
  SAP «Поставлено» often lands once, after the shift, and a screen that paints
  every brigadir red every morning teaches them to stop reading it. Freshness
  (`pp_daily`/`pp_line_daily` `updated_at`) is shown per unit and flagged past
  120 min. Thresholds are the constants at the top of
  `services/live_overview.py`, ride on the payload, and are printed in the
  page legend so red never has to be guessed at.
- **Until the day's attendance is uploaded the unit's waiting is an ESTIMATE**
  (plain mean over its registered cells, marked as such); it switches to the
  weighted figure the moment the file lands. A page dark until the file arrives
  would be dark for exactly the hours a shift manager watches it.
- **Events are SEATED on the shift's clock** (`live_overview.seat`): a night
  shift's «01:00 → 01:40» reads as the small hours after opening, not the
  morning before. Totals are untouched (the union is the union); only «stopped
  right now» needs the placement.
- Polls every 30 s (`refetchIntervalInBackground`), keeps the last payload
  through an outage and says so, animates changes (count-up, FLIP reorder of
  the board, slide-in alerts, pulsing stopped cells), all off under
  `prefers-reduced-motion`. Fullscreen is requested on the page ROOT, so the
  sidebar leaves with it; the button hides where the API is absent (Telegram).
- **Grid tiles are deliberately INERT** (no `CellLink`): a dense grid on a
  touch TV must not navigate away from the monitor. The alert feed and the
  unit rows carry the links instead.

## The shift report («Smena hisoboti»), on the shift dashboard

From **2026-09-15** (the operator's directive) a status board for the shift
manager: one row per brigadir of their shift, five columns —
`components/overview/ShiftReportTable.jsx` over `GET /api/shift-report`
(`routers/shift_report.py` fetches and scopes, `services/shift_report.py`
folds). It replaced a Google Sheet somebody filled and coloured by hand every
morning, with «XATO» wherever a brigadir had entered nothing.

- **It lives on the SHIFT DASHBOARD** — `pages/ShiftDaily.jsx`, under its four
  KPI cards (the operator's directive, 2026-09-16). It shipped on Overview (`/`)
  and moved whole: the component, its scope and its endpoint are untouched, and
  Overview no longer renders it. The shift dashboard is where a shift manager's
  DAY is read, and the board answers a question about that day.
  - **The day stepper does NOT reach it**, exactly as Overview's period picker
    did not — and the risk is sharper here, beside a control that moves every
    other figure on the page. Each column carries its own fixed window and
    prints it, with its date, in its own header. Wiring the stepper to it would
    mean recomputing four figures in this file, which is the one thing this
    board may never do (the rule at the top of this section).
  - **The page carries the platform's filter bar** (2026-09-17): `DayStepper`
    → `FilterPanel` holding `useFactorySection()` then the shift, and the KPI
    cards, both charts, the table and the board all read that one scope. The
    plant is the shared FactoryContext value and the shift the shared
    FilterContext one, so a pick carries to Overview, Zagruzka and Ojidaniya.
    **A SHIFT-MANAGER's shift is an inert `static` chip**: the board is locked
    to it server-side (`routers/shift_report._scope`) while `/api/brigadirs` and
    `/api/heatmap` are not, so a free S1/S2 would put another shift's cards over
    an empty board. Their shift is still read off `/api/staff/supervisors`,
    which now only a shift-manager's page calls — before this an admin read
    whichever shift the first unit in that list carried, and a top-manager,
    whom that endpoint refuses, read empty cards. **The board takes `shift` as
    a PROP and never reads the global supervisor pick**: the page has no such
    control, so a pick left standing on Overview narrowed it invisibly.
  - **That dashboard is now a page of its own**, `/shift-daily`, page key
    `shift-daily`, default roles `["top-manager"]` plus admin implicitly, in
    the «Ishlab chiqarish» nav group. `/daily` still forks a SHIFT-MANAGER to
    the same component, which is why the key is deliberately NOT granted to
    them: their «Kunlik» already lands there, and a second nav row onto one
    view would be all that changed for the role the page belongs to. Before
    this, an admin or a top-manager opening `/daily` was forked to the
    per-supervisor view, so the shift's own board was a page exactly one role
    could reach — and moving the table off Overview would have taken it away
    from them. **A new page key needs no one-shot**: `get_page_access` resolves
    a key the stored matrix has never heard of against `DEFAULT_PAGE_ACCESS`,
    verified against a simulated legacy matrix before this shipped.

- **No figure is computed here, and none may be.** «O'rtacha yuklanish» (today)
  and «Bajarish %» (yesterday) are `totals.avg_load` / `totals.completion` of
  `production._build_dashboard` — the very call `/api/production/dashboard`
  makes, so they ARE the «Zagruzka fayli» KPI cards. «Bartaraf etilgan %» is the
  Quality page's closure rate over the CURRENT MONTH, hair aside:
  `supervisor_match` over
  every live unit (a subset lets the fuzzy matcher hand a row to the wrong unit),
  done ÷ actionable, where `shift_report.ACTIONABLE` is the twin of
  `Quality.jsx`'s `ACTIONABLE` and the two must stay one list. «Ochiq
  xavotirlar» counts `leader_concerns` at level `supervisor` with status
  todo/doing, per unit. The headers reuse the owning pages' own words
  (`production.kpiAvgLoad`, `production.kpiVyp`, the Quality page's «Bartaraf
  etilgan»).
- **«Today» is the SHIFT FRAME, not the calendar** (`shift_report.report_days` →
  `live_overview.shift_frame` over `cell_hours.defaults`): the most recent shift
  start names the day — the rule `/live` runs on and the date a night's leaders
  file under. At 09:00 shift 2's today is the night that has just ended; shift
  1's today flips at its own 08:00, so before it the board shows the last
  finished day shift. A unit with no shift reads the calendar date.
- **«Bartaraf etilgan %» is the MONTH IN PROGRESS** (the operator's directive,
  2026-09-18), `shift_report.quality_window` — which is the one place the cut
  lives. It was the whole register, and a rate carrying every record ever filed
  moves by a fraction of a point whatever a unit does this week: it stated how
  the register has gone, not how the unit is going. `QualityComplaint.date` is
  an ISO string, so the cut is a plain string range (`first <= date <
  next_first`), and a row with no date — one no month can place — falls
  outside it. **The CALENDAR month of the plant's wall clock, one window for the whole
  board, never a shift frame**: the register's own date is a calendar date, and
  on the first morning of a month two shift groups would otherwise read two
  different months for one register. It rides on the payload as `quality_month`
  and the header prints that month by name (`cal.m*`), because a month derived
  from the browser's clock is how the header and the figures come to name two
  different windows — the `deck-window` rule. **Consequence to know: the
  figures moved, and a month in progress starts every unit at «—»
  `no_records`** until something is filed, which is the honest answer —
  «nothing filed yet» is not «nothing resolved». The tooltip's `done/actionable` and the sort are the
  month's.
- **A HAIR record is not counted** (the operator's call, 2026-09-18) —
  `shift_report.SKIP_CATEGORY`, applied in the router's own query, because this
  module never queries. «соч / волос» is the register's commonest foreign-object
  kind and the Quality page itself opens WITHOUT it (`quality_hair_mode`
  defaults to «Sochsiz», dropping hair from its KPIs, charts and tables), so a
  board counting them stated a closure rate the page beside it never shows. A
  row with NO category is KEPT — «uncategorised» is not «hair» — which is why
  the clause is `category IS NULL OR category <> 'hair'`: in SQL `<> 'hair'` is
  NULL on a NULL category, i.e. false, so the obvious spelling would drop the
  rows it should keep. The column hint states the exclusion in all four
  languages, and a unit whose whole month is hair reads the `no_records` blank.
- **The period picker does not reach it.** The request carries the page's
  scope (plant, shift) and never its dates. Every column header
  prints its own window — with the date while one shift is on screen; with two,
  a group row per shift prints both of its dates, which can differ.
- **A blank is «—» plus a REASON, never 0**: `not_configured` (no catalog),
  `no_people` (nobody typed «Bugungi fakt»), `no_plan` (no plan minutes — a 0%
  load against no plan is not a load), `no_fact` (plan minutes and no actual
  minutes at all — `/live`'s «fakt kiritilmagan», never «0%, behind»),
  `no_records` (nothing in the quality register THIS MONTH). The load checks
  people before plan, the heatmap's order. The amber header chip counts rows
  with a load or completion blank — the sheet's «Holat» folded into one number;
  `no_records` is not a gap and is not counted. «*» on a load is the Production page's
  partial-headcount mark (`people_untyped > 0`).
- **An ADMIN moves the bands, from this table's own header** (2026-09-16): a
  gear in the card header — admin only, and the endpoint behind it is
  admin-only too, so the button is the way in and never the lock — opens
  `StatusBandsModal`, four rows of two numbers with the resulting three ranges
  painted underneath in the cells' own colours. It edits NUMBERS and never
  COLOURS: the traffic light is the platform's status vocabulary, so a picker
  there would let one board disagree with every other surface about what a
  colour means, while where the LINES sit is the part nobody had ruled on.
  - **`GET /api/status-bands` is the read and `PUT /admin/settings`
    (`status_bands`, one JSON blob) is the write** — no second writer, so the
    change is already admin-gated, action-logged and undoable. The read
    resolves **edge by edge** against the defaults, so a blob from an older
    client, one missing a figure added since, or one somebody corrupted can
    never blank a band; `routers/settings.py` ships the same numbers as
    `utils/statusBands.js` and the two must be changed together.
  - **It is PLATFORM-WIDE and the modal says so.** The same bands paint the
    «Zagruzka fayli» KPI cards, so `statusBands` holds the answer in MODULE
    state and `hooks/useStatusBands.js` is its one writer: `loadColor(v)` is
    called from inside cells and helpers all over `/production`, and a band
    threaded as a prop would be forgotten at one call site and paint one figure
    by two rules. **Every page that paints a band must call that hook** — the
    helpers answer from module state, so a page that never subscribes goes on
    painting the defaults until something else re-renders it. Until the query
    lands, the floor answers; a board that paints defaults for one frame and
    corrects itself is the price of not blocking the page on a settings fetch.
- **Bands live ONCE, in `utils/statusBands.js`**, which the «Zagruzka fayli»
  page imports too: load ≥90 / 80–89 / <80 (the 2026-09-06 scale), completion
  ≥95 / 70–94 / <70 and quality closure ≥90 / 70–89 / <70 (the last read off the
  sheet, 2026-09-15) — all four now the DEFAULTS an admin can move, above. Every percentage band compares the WHOLE percent printed —
  `vypColor` moved onto that rule with this change, so a completion of
  94.5–94.99% now reads green on `/production`, where it prints «95%». The bands
  are printed as a legend under the table, in the very tints the cells wear.
  Ink is `--status-ok/warn/bad` (700 shades on light, the platform's own hexes
  on dark, a lighter red).
- **It is a HEATMAP, and it is the загрузка heatmap's own cell** (the
  operator's call, 2026-09-16). `statusBands.toneFill` is the one definition of
  that paint — background AND ink as one pair, since neither is a choice on its
  own — and it is `TONE_HEX` at full saturation with the ink `contrastText`
  picks, the rule `HeatmapChart` already applied and now imports from
  `statusBands` rather than spelling itself. Cells are square, full-bleed and
  ruled by a 1px line of the CARD's own colour, which is what makes the grid
  show against any fill in both themes — **set INLINE, never as a class**,
  because `DataTable` paints every cell's border through
  `[&_td]:border-[var(--border)]`, a descendant selector that outranks any
  plain utility on the cell itself: a `border-[…]` class there compiles, loses,
  and leaves the grid invisible with nothing on screen to say why. Three shapes
  were tried and are the
  mistakes this one answers: a tinted badge in a right-aligned cell (five short
  values across a full-width table left the board mostly empty space — the
  first thing anybody saw); muted 700-shade fills whose `--border` gridline
  disappeared into them, so three greens read as one block, and whose yellow
  could only be brown; and rounded tiles in a 3px gutter, which read as a row
  of buttons. **Flat per band, never a gradient** — these are verdicts, not
  intensities. The figures are **centred both ways**, because the colour does
  the comparing now, and every row is **ONE line high with ONE figure per
  cell**: the quality cell's `done/actionable` is on its tooltip and nowhere
  else, and a blank is its dash and icon alone. `toneTint` is the soft tint
  that remains, for a badge that sits ON the card. The NAME column stays
  uncoloured — it is the rail the eye returns to and what keeps the table from
  becoming one sheet of colour — and so does a BLANK cell, which should read as
  a hole in a coloured field. The fills cover the row's own hover tint, so
  hover marks the name cell with a brand bar instead.
- **All four columns wear those three colours; only the BANDS differ.** Open
  concerns are `CONCERN_BANDS` — ≤5 green, 6–20 yellow, ≥21 red — and those
  numbers are the part nobody has ruled on: the sheet's own 0 / 1–2 / ≥3
  shipped for a day and painted every unit red, because the register really
  holds 6 to 105 open concerns per unit, and a column that is red everywhere
  states nothing. They split today's fleet into roughly even thirds and are
  printed in the legend precisely so they can be corrected. A brand-gold
  intensity ramp stood here for an afternoon and was withdrawn: a shade has to
  be compared against the rest of the screen before it means anything, and a
  verdict should not.
- **It stays a table on a phone**, fitted to ~358px: short labels, the inactive
  sort chevron hidden and the active one stacked under its label, a blank's
  reason as a bare icon (its words are in the legend at every width, since the
  cell can no longer spare a second line). Rows open
  `/brigadir/:id`. No per-cell links: a shift manager does not hold
  `/production`, and a link that 403s is a dead link.
- Up to two engine runs per configured unit per request, uncached; `staleTime`
  60 s and a refetch on focus. **It is the LAST thing on the page to fetch**
  (`pageReady`, handed down by its page): that cost competes with the queries
  the KPI cards and the charts are waiting on — one uvicorn worker — so
  fired together the whole page read as «still loading» for as long as the
  slowest block on it took. Held until the page's own data is in, the board
  fills in under a page that is already readable, and its skeleton carries the
  heatmap's silhouette so the wait states what is coming. Deliberately NOT built: KRU %, «Kiritish soni»,
  an export, a ColumnsPicker.

## The dashboard exam («Imtihon», `/exam`)

From **2026-09-24** (the operator's twelve rulings, 2026-09-18 — recorded in
`docs/plan-dashboard-exam.md`) a leader can sit an EXAM on the dashboard:
fifty tasks that make them use the real pages — mark a task done, file a
concern, find where the checklist rules are written — checked by the platform
itself. Page key `exam` (leader · supervisor), nav group «Ta'lim»; the admin
destination is `/admin/upload?tab=exam` (capability `admin.exam.manage`).

- **Nothing a leader does during an exam changes real data, and that is
  STRUCTURAL.** While the mode is on, `utils/examMode.js` + the axios
  interceptor rewrite every request to a sandboxed resource onto
  `/api/exam/sandbox/…` (the prefixes are SERVER-owned:
  `services/exam_sandbox.SANDBOX_PREFIXES`, published on `GET /api/exam/me`)
  and send `X-Exam-Attempt`. `routers/exam_sandbox.py` re-implements the
  LEADER-facing subset of /tasks, /concerns, /cell-concerns, /idle-cell, the
  day report / objections / late proofs, the bell and ui-prefs over ONE table,
  `exam_sandbox_rows` (JSONB, keyed by the attempt) — no real table, no DM,
  no `action_log.enrich`. The real routers are untouched. A prefix matches on
  a path boundary, so `/api/leaders` (Monitoring, real) stays real while
  `/api/leaders/report/…` is rewritten; `/cell-concerns` writes go through
  `/api/concerns/{id}` and are caught by the PATH, never the page.
- **Rights mirror the real pages for a LEADER** (the contract maps the sandbox
  was built from): no flame, no editing a brigadir's task, no deleting or
  sending back a concern, the receiver's deadline on the flip into doing, a
  resolution note on close, no editing a saved ojidaniya row, no ruling on an
  objection. Refusals carry the real endpoints' own messages.
- **The fictional unit is identical for everybody**: brigadir Imtihonov
  Alisher, «Imtihon brigadasi», cells 9901/9902 (leader = the examinee).
  Fixture rows keep RELATIVE dates (`entry_days`, rendered against the clock),
  so «yesterday» and a board scoped to the last 7 days read right on every
  sitting. C1/C2 are held at level `leader` (sent back by the brigadir) —
  the only way a leader may close or re-status a concern on /concerns.
- **The bank lives in code** (`services/exam_bank.py`, the 50 predicates;
  texts in the bundle under `exam.t.<key>`, four languages, rendered in the
  viewer's language). An admin only switches a task off (AppSetting
  `exam_disabled_tasks`); the enabled set is SNAPSHOTTED at start. A task
  never names the page or the control. Four checker kinds
  (`services/exam_check.py`): `sandbox` (a predicate over the rows), `answer`
  (compared with a value computed AT CHECK TIME — from the sandbox, from real
  read-only data, or the app version), `ui` (the client's report of persisted
  page state: `usePersistentState` keys, `lang`, `theme`, `notif_read_ids`,
  polled every 2 s and posted only when changed) and `visit` (a route).
  **A `sandbox` check counts from the ATTEMPT's `seeded_at`, not from when the
  task was opened** — every sandbox predicate names its own fixture (T1, C2,
  W3…) or a signature no other task shares, so one record can never pass two
  tasks, while a leader who reads ahead on `/exam` and acts on a fixture
  before opening its task (or a closed, read-only concern acted on early)
  must still be able to pass it. `ui` and `visit` checks still gate on
  `opened_at`, since those ask about a CHOICE made for this task, not a
  record that already exists.
- **A task is UNAVAILABLE for a leader who cannot open its page** (`/leaders`,
  `/idle-cell` are per-profile grants — 15 tasks) or whose expected value
  cannot be computed (`no_data`); it is listed, marked, and out of the
  denominator. Score = passed ÷ available, rounded; the pass mark
  (`exam_pass_mark`, default 80) is read at SUBMIT and stored on the attempt;
  `exam_badge` puts a dated chip on the leader's profile.
- **One open attempt per (person, kind)**: `assigned` → `running` → `submitted`
  | `expired` (the admin deadline, 00:05 daily) | `cancelled`. Practice
  (`kind=practice`) is unlimited, unrecorded, restartable. Time per task is the
  only proctoring (`exam_task_results.seconds`, capped at 20 min a sitting).
  Notifications: `exam_assigned`, `exam_due_soon` (09:00, the day before),
  `exam_result` (leader), `exam_unit_result` (the brigadir).
- **Client engine**: `context/ExamContext.jsx` (mounted in App.jsx ABOVE the
  routes — Layout remounts per navigation), `components/exam/ExamStrip.jsx`
  (portaled, `--tg-safe-bottom`), `ExamBand.jsx` (Layout), `AnswerSheet.jsx`.
  Entering the mode PARKS the pages' persisted filters (`parked_keys` from
  `/me`, `localStorage` → `exam_parked`) and clears the react-query cache;
  leaving restores them. `lang`/`theme` are never parked — two tasks switch
  them and put them back. The noisy leader endpoints live under
  `/api/exam/live/…` and are in `action_log._SKIP` with the sandbox;
  start/submit/assign/cancel/bank are logged under the `training` category.
- **Consequences to know**: the day report a leader opens from Monitoring in
  exam mode is the FIXTURE (any uid answers it); exports on sandboxed pages
  are refused; a sandbox never serves photo bytes (fixtures carry none).
  Sandboxes of finished exams are purged after 90 days (`purge_old`).
- **Monitoring (`/leaders`) is sandboxed too, from 2026-09-26** —
  `GET /api/leaders` → `sb.register_payload`, `GET /api/leader-ai/report` →
  `sb.ai_report`, both under the plain `/api/leaders` prefix (it also covers
  `/report/`, `/disputes`, `/late-proofs` beneath it, a path-boundary match).
  The fixture is SIX checklist days (`REPORT_DAYS`, keyed by `days_ago`), one
  history so the register row, its detail modal and the day-report page can
  never print two different scores for one day: a rejected + missed day
  (day 1, the leader's own), a clean day, an already-approved objection
  (day 4, `fx="D1"`), a late-proof day (day 3) and a not-done day (day 6).
  `report_uid` mints `exam-{id}` for day 1 and `exam-{id}-{k}` otherwise;
  `report_days_ago` is the inverse. **`REPORT_DAYS[2]` and `[5]` are `{}` — a
  genuinely CLEAN day, not a missing one** — so every reader of the map must
  test membership (`k in REPORT_DAYS`), never truthiness: `day_report` once
  read `REPORT_DAYS.get(k) or REPORT_DAYS[1]`, and `{} or REPORT_DAYS[1]`
  falls through to day 1's rejected+missed spec because an empty dict is
  falsy — so two clean days scored 100% (`_day_scores` indexed the map
  directly and got it right) while their task list and register row still
  named two tasks as failed. Fixed to `REPORT_DAYS[k] if k in REPORT_DAYS
  else REPORT_DAYS[1]`.
- **The write-guard is TWO locks, and both must cover `/admin/` as well as
  `/api/`** (2026-09-26). `utils/api.js`'s interceptor refuses a non-GET call
  that is still a REAL endpoint after `rewriteExamUrl` (not covered by
  `SANDBOX_PREFIXES` and not in the small allowlist —
  `services/exam_sandbox.EXAM_WRITE_ALLOW` / `examWriteAllowed` in
  `examMode.js`: `/api/auth/`, `/api/activity/`, `/api/crash-report`,
  `/api/boot`, `/api/education/progress`), and `ExamWriteGuardMiddleware`
  backstops it server-side for whatever gets past the client. **This backend
  mounts real mutating endpoints under `/admin/...` as well as `/api/...`**
  (`routers/admin.py`, `routers/exam.py`'s own admin router) — a guard
  written for `/api/` alone let the Leaders page's Refresh button
  (`POST /admin/refresh-sheet/leaders`) straight through to the real sheet
  sync in a browser test, on BOTH ends, because the client and server guards
  shared the same blind spot. `canRefresh` on that page is also `!examOn`
  now, and «Perenaladka» drops off `/idle-cell`'s tab strip during an exam
  (real `/api/setup-times`, no sandbox twin) — belt and braces: the button
  disappears, and the door behind it is shut either way.
- **A tab closed WHILE sitting an exam must not strand the real filters it
  parked** (2026-09-26). `sessionStorage` (the mode flag) does not survive
  that, but `localStorage`'s `exam_parked` blob does — so `examMode.js` now
  restores it the moment a fresh load finds no exam mode claiming it, and
  `park()` restores-then-reparks rather than overwriting a `PARK_KEY` that is
  already sitting there from a session that never called `leaveExamMode`.
  The blob carries its OWN prefix list now (`{prefixes, values}`), so a
  restore never depends on which list the CURRENT bundle happens to be
  carrying — a leftover park from an older, shorter list is unparked by the
  list it was parked with.

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
ran** — when it is absent (a fresh clone, a hook that did not fire), perform all
six steps by hand. The rule is the ORDER, not the mechanism. **A claude.ai/code
cloud session is the exception**: the committed `.claude/settings.json` wires
the same loop there (`cloud-setup.sh` pulls, `auto-commit.sh cloud` ships) — see
«A cloud turn deploys, exactly like a laptop turn».

- **gitea is THE remote** — `git.safiabakery.uz/Safia-Outsource/production` (private). `main` tracks it, so a bare `git pull` / `git push` means gitea. **Its local NAME varies by checkout** — it is `gitea` where a GitHub mirror is also configured and `origin` where it is the only remote (this checkout), so read `git remote -v` instead of hard-coding a name. Where a GitHub mirror exists it is a mirror ONLY: pushed last, best-effort, never gated on.
- **Pushing to `main` deploys to production.** `.gitea/workflows/deploy.yaml` runs `deploy/deploy.sh` on the VPS on every push — see the Deployment section below.
- **The whole loop is automated by two hooks in `.claude/settings.local.json`: pull → edit → build → commit → push.** A cloud session runs the SAME `auto-commit.sh` from the committed `.claude/settings.json` (as `auto-commit.sh cloud`, a no-op on a laptop) and pulls through `scripts/cloud-setup.sh` — see «Cloud sessions».
  - `SessionStart` → `.claude/hooks/auto-pull.sh` fetches gitea and **fast-forwards `main`** before anything is edited. It never merges or rebases: on a diverged branch, or when uncommitted work blocks the fast-forward, it reports and leaves the tree untouched. Log: `.claude/auto-pull.log`.
  - `Stop` → `.claude/hooks/auto-commit.sh` bumps `VERSION` (patch, unless the turn already set it — see Versioning), runs the Vite build, commits everything with a generated message, then pushes **gitea first** (that is the deploy) and the GitHub mirror after. A failed build aborts the commit; a failed mirror push is cosmetic and says so; a failed *gitea* push says `NOT deployed`. Log: `.claude/auto-commit.log`.
  - Net effect: **one turn = one commit = one production deploy**, with no staging step and no review window. Verify a doubtful build by hand with `cd frontend && npx vite build`.
  - The pull only runs at session start. If `main` moves on gitea mid-session the push at turn end is *rejected*, not silently merged — you will see `PUSH FAILED` in the summary; pull and re-run.
- `frontend/dist` is TRACKED and prod serves the SPA from it. Commit the build alongside the source — the pipeline rebuilds it for you if you forget, but committing it makes the deploy a no-restart, zero-downtime file swap.
- Backend changes need a service restart on prod (systemd `safia-production`, uvicorn — the cPanel/Passenger host is gone). The pipeline restarts automatically for `backend/**` and `bot/**`. Startup migrations still go in BOTH the FastAPI lifespan and `passenger_wsgi.py`, even though only the lifespan executes today.
- i18n: 4 languages (uz / uz_cyrl / ru / en). Static UI text via `t()` keys added to all 4; DB text via transliteration — **`tl()` for a PERSON's name, `tx()` for every other DB text** (both from `useTranslit()`).
  - **The English form is for NAMES only** (the operator, 2026-09-21: «if the text is in Uzbek, do not translate it into English except the names of people»). For `en`, `tl` applies the name convention — x→kh, q→k, oʻ→u, gʻ→gh, apostrophes dropped (Burxon → Burkhon). On Uzbek words that is a misspelling: a leader-auto notice printed the task «…planini **qayd qilish**» as «…**kayd kilish**» and the floor noticed at once. `tx` / `transliterateText` still turn Cyrillic into Latin for uz/en but keep the Uzbek spelling for English. Task names, job titles, categories, SKUs, notes, reasons, comments, broadcast text and plant names are all `tx`.
  - Backend twin: `app/translit.py` `transliterate` (names) / `transliterate_text` (everything else). Notification params are split by `staff._NAME_PARAMS`: a new param that carries a person's name must be added there, or English readers see it in Uzbek spelling. A new prose param needs nothing.

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
   mirror at claude.ai/code. The session sits on a `claude/...` branch cut from
   the mirror's main, and `setup_git` fast-forwards THAT branch onto
   `gitea/main` whenever it holds nothing of its own, so a lagging mirror costs
   nothing. The branch the platform pushes to GitHub is its own copy of the
   work; **never open or merge a PR on GitHub**. Nobody reads that repo, and the
   deploy has already happened on gitea.

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
- **The Gitea token, preferably as an API CREDENTIAL** (Pro/Max plans, in the
  EDIT dialog of an environment that already exists): type **Bearer**, allowed
  website `git.safiabakery.uz`, header `Authorization`, prefix `Bearer`, value
  the token. Anthropic's agent proxy adds it after the request leaves the VM,
  so it is in no variable, no file and no transcript. Gitea 1.27 accepts a
  Bearer token on git's smart-HTTP paths. `setup_git` no longer demands
  `GITEA_TOKEN`: it simply fetches, and the fetch is the test.
- **Environment variables** (`.env` format, one `KEY=value` per line):
  `GITEA_USER=Burkhon`, `GIT_AUTHOR_NAME=Burkhon Nurmurodov`,
  `GIT_AUTHOR_EMAIL=burkhon0207@gmail.com`, plus `GITEA_TOKEN=<token>` ONLY
  where the credential above is unavailable, and `SAFIA_CLOUD_DEPLOY=0` only to
  stop deploys. This panel is readable by anyone who can use the environment,
  so a token here should belong to a **dedicated Gitea account with write
  access to this repo only**, rotated like any deployed credential. Never put
  the backend's keys here (`TELEGRAM_BOT_TOKEN`, `GEMINI_API_KEY`,
  `NOTION_TOKEN`, `INTERNAL_API_KEY`): `cloud-setup.sh` writes its own
  `backend/.env` and reads none of them, and a real bot token in a second
  backend would fight production for the webhook.
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
- **`.claude/settings.json` Stop hook → `auto-commit.sh cloud`**, every turn:
  the laptop's own loop (see below).
- **`.claude/settings.json` is committed on purpose** — a cloud session gets only
  what the repo carries — which needed a `!` line against the blanket `*.json`
  ignore. `.claude/settings.local.json` and `.claude/launch.json` stay ignored.
- **The recursion guard reaches the setup script too.** The Stop hook writes its
  message with a nested `claude -p`, which fires every SessionStart hook between
  its `git add -A` and its `git commit`; `cloud-setup.sh` exits on
  `SAFIA_AUTOCOMMIT_RUNNING`, like `auto-pull.sh`, or its fetch and fast-forward
  would move the tree under a commit that is half made.
- **The backend is :8000 there, not :8001.** A fresh clone has no
  `frontend/.env.development.local`, so the UI goes through the vite `/api`
  proxy, whose target is 8000. `driver.mjs doctor` still prints the answer.

### A cloud turn deploys, exactly like a laptop turn

From **2026-09-25** (the operator's call, reversing the earlier "main is
refused" rule) a cloud session runs the six-step loop a laptop runs: pull from
gitea at the start, then at the end of every turn bump `VERSION`, build, commit,
push to gitea `main` (**the production deploy**) first and to the GitHub mirror
after. ONE script does it for both, `.claude/hooks/auto-commit.sh`, so the two
loops cannot drift. The laptop calls it with no argument from
`settings.local.json`. The cloud calls it as `auto-commit.sh cloud` from the
committed `settings.json`, which is a no-op unless `CLAUDE_CODE_REMOTE=true`, so
a laptop never runs it twice. **Local behaviour is byte-for-byte unchanged.**

The platform forces three differences, and the cloud mode handles each:

- **Where each remote gets the turn.** The GitHub proxy accepts pushes to the
  session's OWN branch only ("`git push` works only against the session's
  current working branch"). So gitea gets `HEAD:main` and GitHub gets the
  `claude/...` branch. GitHub's `main` catches up the next time a laptop pushes.
- **What "ships" is measured against `gitea/main`, never `HEAD`.** Claude often
  commits by itself mid-turn in the cloud. The hook fetches gitea first, and a
  clean tree that is AHEAD of `gitea/main` still deploys. The patch bump fires
  when `VERSION` equals production's, so a MINOR or MAJOR Claude committed
  itself is left alone. The commit message describes the whole deploy since
  `gitea/main`. The frontend is **always rebuilt**, so the bundle carries the
  `VERSION` it ships with even when Claude committed everything itself.
- **Nothing that cannot be undone.** The per-session `.git/hooks/pre-push`
  allows a fast-forward of `main` and refuses **deleting** it or **rewriting** it
  (any non-fast-forward, i.e. `--force`). If another deploy moved `gitea/main`
  during the turn, the push is refused and the turn says `GITEA PUSH FAILED —
  NOT deployed`, the same as on a laptop. And the hook unstages any **symlink**
  before committing: the cloud symlinks `frontend/node_modules` in from `/opt`,
  and `.gitignore` said `node_modules/`, which matches directories only. Without
  that, the link would have shipped to production. `.gitignore` now says
  `node_modules`, and the unstage step is the second line of defence.

**The kill switch is `SAFIA_CLOUD_DEPLOY=0`** in the environment's variables
panel. The Stop hook then pushes the session branch to gitea (`cloud-session`
when that branch is `main`) and never `main`, and the pre-push guard refuses
`main` outright. No deploy needed: variables are read at every push.

**Consequence to know:** there is no review window. The first a person sees of a
cloud turn is production, exactly as with a laptop turn. Gitea branch protection
on `main` does not break this unless it blocks the token's account; to require
review, set the kill switch rather than protecting the branch.

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
`1.5.0` → major `2.0.0`.

| Level | Bump for | Usually looks like |
|---|---|---|
| **PATCH** `1.0.x` | Nothing new; something works better | bug fix, copy/translation fix, styling or spacing tweak, refactor with no visible change, docs |
| **MINOR** `1.x.0` | Something the user can now do, or a visible behaviour change — and **a tab already open on this MAJOR line keeps working** | new page/tab/admin destination, new endpoint or capability, a new column/filter/export, a template gaining a prop, **a page retired behind a redirect**, **a permission rule that changes who may do what without changing any request or response** |
| **MAJOR** `x.0.0` | **The platform stops serving the bundles people are holding — and that is the intended outcome** | judged by the test below, never by a list. Rare, and rarer than the examples used to suggest |

### MAJOR is the one level with a consequence, so it has a TEST, not a list

Every other level is a label. MAJOR is ENFORCED: `MIN_CLIENT` is derived as
`<MAJOR>.0.0` (the floor below), so the moment a major deploys **every tab on
the previous line is told it is no longer served, with an un-dismissible
warning** — every leader, brigadir and shift manager mid-shift, whatever page
they are on. A major is therefore an act against the whole plant, and it must
pass BOTH halves:

1. **Does a bundle already open in somebody's hand STOP working?** Not "is
   something gone" — *does an open tab break*. A removed endpoint an old bundle
   still calls, a response field it still reads, a required param that used to
   be optional: yes. An internal refactor, a renamed helper, a rule resolved
   server-side: no, whatever the change is called.
2. **Whose hand, and how many?** The warning reaches everybody. So the breakage
   has to be WIDER than the warning it triggers. Breakage confined to the people
   it was aimed at is not a platform break.

**A removal is not automatically a break, and that is where every mistake has
been made.** Two removals that are NOT majors:

- **The removal leaves a landing place.** `/brigadir-tasks` was retired into
  `/tasks` on 2026-09-04 as **v4.46.0**, a minor: the route redirects, so nothing
  anybody was holding stopped working.
- **The only bundle that breaks is the one displaying the thing removed.**
  Delete a page together with its own endpoint and the sole tab that can still
  call it is the tab showing the page just deleted. That reaches exactly the
  people it was aimed at; everybody else pays the banner for nothing.

**The asymmetry between adding and removing is real and it is not the whole
answer.** Adding cannot break what already exists; removing can. That is why a
removal gets looked at — but "can" is not "did", and the second half of the test
is what settles it.

**When in doubt, bump MINOR.** A major that should have been a minor puts a
warning in front of the whole plant for nothing and cannot be taken back, because
the tabs have already seen it. A minor that should have been a major shows a
stale tab a stale page until its next reload — the state every tab is in for the
minutes after any deploy anyway.

### The three majors this repo has, and what they should have been

Reviewed with the operator on **2026-09-09**. All three fired on the MAJOR row's
old EXAMPLE LIST, which could be pattern-matched without asking the test standing
beside it. **None of them broke the API contract for anybody who was not already
looking at the page being removed.**

| | what it did | should have been |
|---|---|---|
| **v2.0.0** 17 Aug | deleted `/cell-attendance` and its `GET /registry` | **minor** — the only tab that could still call it was a tab on the deleted page |
| **v3.0.0** 21 Aug | profile permissions resolve LIVE per request instead of being copied onto the account at login (`materialize_pending` deleted) | **minor** — no endpoint removed, no response field renamed, no request shape changed; an open 2.x tab kept working. It fired on the phrase «auth/permission model change» |
| **v4.0.0** 30 Aug | deleted `/staff-cells`, an admin-only test page added TWO DAYS earlier as **v3.67.3**, a patch | **patch or minor** — one digit to build it, a whole version line to withdraw it |

Three majors in thirteen days, none of which broke a contract. So the examples
column above is headed «usually looks like» and is **NOT binding**: where an
entry there and the two-part test disagree, **the test wins and the example is
wrong**.

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
