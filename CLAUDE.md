# Safia IMS — project instructions

## Where everything else is written (`docs/`)

This file holds only what every session needs: the UI templates and
conventions, the change workflow, deployment, versioning and how to read
the repo. Every feature's record — what was built, why, the operator's
rulings and their consequences — lives in a topic file under `docs/`,
moved there word for word from this file on 2026-11-06. Topic files are NOT
loaded by themselves:

- **Before working on a feature, read its topic file** — at least the
  sections that name it. `grep -n '^## ' docs/*.md` lists every section; a
  code comment citing «CLAUDE.md «X»» means the section titled X in one of
  them (`grep -rln '^## .*X' docs/`).
- **A new feature record goes into the matching topic file** as a `## `
  section, never into this file; one that fits no topic starts a new
  `docs/<topic>.md` with a line added below. Only a rule every session
  needs belongs here.
- The in-app assistant «Yordamchi» reads this file and every `docs/*.md`
  except `plan-*.md` (`backend/app/services/assistant_docs.py`), so a topic
  file is its knowledge base too.
- `docs/plan-*.md` are design plans and `docs/zagruzka-and-ojidaniya.md`
  is a reference note; neither was part of this file.

- `docs/navigation-and-shell.md` — the header search «Qidiruv», the app launcher «Ilovalar» (admins and top-managers), the admin app at `/panel/<id>` (`ADMIN_NAV` in `config/adminNav.js` is the ONE list), the profile page `/profile` (one column, the header's three facts, the save bar).
- `docs/cells-and-org.md` — **a cell is printed by its verifix CODE, never the workshop name** (`cellLabel`); «Egasi» and «Boshqaruvchi»; `in_load`; archived cells; one-process cells; **a typed code is stored in Latin** (`latin_code`); **the plant hangs on `managers.factory_id` only** (`factory_scope`); a shift-manager's reach; cell shift times; leader and brigadir kinds; a leader follows the cells they run.
- `docs/data-fixes.md` — the one-shot data fixes and what they changed: unit «Turdimurodov Nodirjon» into Aripova's, Elnora's profile, cell 9123's 5 October, the four units that changed brigadir on 24 Oct, **a unit that changed brigadir keeps its sheet history** (`name_map.SHEET_NAME_ERAS` — a swap adds its rows there), 7331's two leaders handed to Majidov Ozodjon (9 Nov).
- `docs/verifix.md` — the Verifix connection, the live sync of cells, leaders and brigadirs (`verifix_sync`, dated cell links in `cell_links`), the 4–8 Oct one-shots, the «Verifix (test)» pages.
- `docs/tasker.md` — the Tasker («Задачник (фабрика)») connection card `/panel/tasker` (sealed token, address allow-list, a test that suggests each department's cell — nothing scores from it), and phase 2: task 4 by the platform, blocked on per-inspection time and completion.
- `docs/work-centres.md` — a work centre is NOT unique (`cell_lookup.by_sap` is keyed by unit), and its group letters (`wc_group.share` is THE split).
- `docs/zagruzka.md` — where the загрузка's inputs come from (`zagruzka_source`, the typed «Bugungi fakt», `ZAGRUZKA_FROM`), the kept trudoyomkost, the comparison tables and heatmaps on `/zagruzka` (`utils/formulas.js` is THE definition), their bands and Excel, «Odam soni» only where the day has a plan.
- `docs/ojidaniya.md` — which categories count, Tozalash's cleaners, ojidaniya from the cells (Σ(N·T)÷ΣN, `idle_source`), the bar modal, the weekly deck, the «Toifalar bo'yicha» matrix, the cost tab, the bubble chart, «Kutish yechimlari», category owners.
- `docs/workers-and-attendance.md` — a worker's cell and the «Yacheykalar» placement, the three «Odam soni» pages, «Tarkib», attendance charts on the original brigadir, «Davomat» reading Verifix.
- `docs/staff-live.md` — the live day engine (`live_staff`, `verifix_live`), /staff reading today live (`live_day.LIVE_FROM`), the close and its copy into `attendance`, the close clock.
- `docs/tasks-and-concerns.md` — the /tasks board, a concern's deadline and date, the weekly Concerns deck.
- `docs/kpi.md` — «Liderlar KPI» and its KPIs (worker concerns, turnover, foreign objects, category compliance, the technologists' audit), **one «Qayta hisoblash» brings every source up to date — on every open and on the button** (`kpi_recalc`), who answers for a Quality record, «Brigadirlar KPI», «Brigadirlar reytingi».
- `docs/checklist.md` — the checklist config page, a checklist on the other shift, temporary task hours, the brigadir's day digest, one checklist per cell, per-task submission.
- `docs/checklist-auto-checks.md` — the tasks the platform answers itself (`leader_auto`).
- `docs/checklist-camera.md` — in-app camera proofs (`/proof/camera`, `proof_kind`).
- `docs/checklist-ai-review.md` — automatic AI proof verification, and the 19 Sep, 26 Sep and 7 Oct rule passes (`leader_rule_eras`).
- `docs/checklist-not-counting.md` — unfinished bot days, «Liderlar kunlik vazifalari», day exclusions, leaders who owe nothing, leader cutoffs.
- `docs/appeals.md` — late proofs, the appeal chat, objections and their three stages, every judge that can be objected to, `APPEALS_FROM`.
- `docs/leaders-page.md` — the /leaders page: its tabs, the kept register, «Mening o'rnim», empty days, photos, the phone layout, the «Lider nazorati — admin» grant.
- `docs/production-catalog.md` — **a catalog edit counts from now on** (`pp_catalog.freeze` before every write), a cell's positions follow the cell (`catalog_follow`), archived lines, «O'lchov birligi», the SAP-codes grant.
- `docs/production-quantities.md` — typed ПЛАН/ФАКТ and the SAP columns, per-line quantities, hourly containers per team («Soatlik»), who a SAP upload fills, ШТАТКА, «Plan Bajarish», the call forecast, a closed day locking «Zagruzka fayli».
- `docs/shift-report.md` — «Smena hisoboti» on the shift dashboard, and that page on a phone.
- `docs/kelish.md` — «Ish grafigi» (`/kelish`) and task #11 checked on it.
- `docs/laboratory.md` — candidate assessment, «Xodim kartasi», Trello, the audit table, Notion tasks, the live monitor, the goal board.
- `docs/ovens.md` — the Revent ovens (read-only, ever) and the board that collects them.
- `docs/reports-and-ontime.md` — «Hisobotlar» and the logistics on-time report.
- `docs/arc.md` — ARC as one page, and both ARC mirrors.
- `docs/notifications-and-telegram.md` — the notification centre, phone notifications, coloured and disabled Telegram buttons.
- `docs/org-chart.md` — «Tashkiliy tuzilma» `/panel/orgchart`: everybody on the platform as one chart (plant → shift → brigadir → leader, the roles on no unit beside them), each one's pages and personal grants, the way to their «Xodim kartasi»; read-only, admin-only; **its access answer repeats the guards' rule** (`services/org_chart.resolve_access` — change `capabilities.py`, change it too).
- `docs/admin-registers.md` — the action register «Jurnal» and its undo, «Foydalanuvchilar faolligi».
- `docs/web-clients.md` — the browser login, the installable PWA, the boot path, offline mode.
- `docs/registration.md` — **job seekers go to HR** (`hr_contact`, seeded `@safiahrrecruiting`, set on the Users tab): the bot's description, welcome, waiting and closed guest requests and /login all name it; copy names ROLES, never «employees»; the guest picker lists only unclaimed profiles; every request DM carries «👤 Profilni ko'rish» → `/tg-user/:tid`, the registrant's Telegram profile as the bot sees it.
- `docs/android.md` — the Android app.
- `docs/exam.md` — the dashboard exam «Imtihon».
- `docs/assistant-and-ai.md` — «Yordamchi» and the «AI kalitlari» tab (every AI caller asks `ai_features`).
- `docs/server-operations.md` — freezes and slow requests (**never sync DB / HTTP / file work in an `async def` handler**; never a literal `IN` over a big list), the supervisor and zero-downtime swaps (**a startup step is `run` when a request needs it, else `later`**; migrations stay additive), blue-green.
- `docs/cloud-sessions.md` — **read it when working in a claude.ai/code cloud session**: the gitea wiring, the Setup script, a cloud turn deploys like a laptop turn, what does not come along, asking production for data.
- `docs/ext-api.md` — the external read API `/api/ext/v1` (cells · production · attendance per date) and the «API» page `/tokens`: personal tokens (page key `api`, `services/api_tokens.py`) and the manual as PDF / Markdown in four languages (`ext_api_manual`).
- `docs/report-door.md` — **read it before you need data only production has**: `scripts/ask-prod.py`, one SELECT or GET a person allows in Telegram; ask WHO gets it (Burkhon or Abbos), never both.

## UI element templates (mandatory)

Every recurring element type has exactly ONE template component in
`frontend/src/components/ui/`. When building any new feature, use these
templates — never hand-roll a new variant of an element type that already
has one. If a template lacks a feature, extend it with a prop; do not fork
or copy-paste its markup into a page.

| Element type | Template | Rules |
|---|---|---|
| Dropdown / select | `StyledSelect.jsx` | Never a native `<select>`. Compact toolbars: `triggerClassName="px-2.5 py-1.5 text-xs"`. An option may carry `disabled: true` — listed, dimmed, not pickable, its reason in `title`; «select all» skips it (the «Boshqaruvchi» picker's people who cannot run a cell). An option's `short` is what the closed trigger shows for it — a panel label carrying a note, the bare name on the control («AI kalitlari»' model pickers). `onQuery` makes the search SERVER-SIDE — the box's text goes to the caller on every keystroke ("" on open) and `options` are shown as given, unfiltered; keep the picked option among them. `searchEmpty` is what the list says when nothing matches («type 2 letters», «searching…», «not found») — the assessment's worker picker. |
| Date picker (range or single) | `DateRangePicker.jsx` | Single date → `single` prop. Never a bare `<input type="date">`. The quick-select list ends with «Barcha vaqt» — `ALL_TIME_FROM` (2015-01-01, a floor below any record, since the data model has none) → today, clamped to `max`; the trigger prints «Barcha vaqt» instead of the spelled-out span while that range is in force, and range-only, so `single` never offers it. `month` is the whole-month picker (a year + 12 months), `year` the whole-year one (a page of twelve years); a pick sets the whole period, clamped to `max`. |
| "‹ day ›" stepper on daily pages | `DayStepper.jsx` | `max={null}` to allow future dates. Chevrons are 38px squares (the toolbar baseline) with aria-labels. `week` makes it THE "‹ week ›" stepper: ±7 days, the Monday → Sunday span as the label (numeric below sm), any picked day lands on its Monday. `week rolling` drops the Monday — the span is `value` → +6, a picked day becomes the first day, and › stops AT `max` (/kelish: the first column is always today). `dotPrev` / `dotNext` put a brand dot on a chevron with a reason to look that way. `compactUntil="xl"` keeps the week's numeric label up to xl (default: below sm) for a toolbar too narrow on a laptop for the spelled-out span (/kelish). `month` / `year` make it THE "‹ month ›" / "‹ year ›" stepper: ±1 month / year, the label is DateRangePicker's `month` / `year` picker, `value` and every `onChange` are the period's first day (/leaderboard). |
| Dialog / form modal | `Modal.jsx` | Backdrop `rgba(0,0,0,0.6)` + Telegram safe-top; rounded-2xl card; header = title (+subtitle/icon) + X close; body scrolls; footer right-aligned. The subtitle is readable text (`--text-2`, 12px) and WRAPS: it often names who a record belongs to (a brigadir, a cell), and a phone has no hover to finish a cut line. **It is a real dialog (2026-10-05)**: `role=dialog` + `aria-modal`, labelled by the title (described by the subtitle); on open focus moves onto the CARD (never into a field — that raises a phone keyboard — unless a child autoFocuses), Tab is trapped, and focus returns to the opener on close. **Escape is an implicit close, like the backdrop**: it obeys `dismissable`, and it NEVER silently discards entered work — with a draft it asks first (`ConfirmDialog`, «Saqlamasdan yopilsinmi?», the safe button focused). The draft is `dirty` when the caller passes it; otherwise «the user changed something in this card since it opened»: any typed / ticked / chosen native field (`SearchInput` and anything under `data-no-draft` excepted) plus a pick in `StyledSelect` / `DateRangePicker` / `CountStepper`, which report through `useMarkDraft()` — a new value template inside dialogs must do the same. The X never asks; the backdrop click is unchanged. Only the TOPMOST dialog answers the keyboard: `dialogLayers.js` is THE stack (Modal, ConfirmDialog and Lightbox register; top = highest z-index, then later in the DOM). A popover inside a dialog that closes on Escape must `e.preventDefault()` so the dialog stays standing, and a page-level Escape (a fullscreen overlay) steps aside while `hasOpenDialog()`. |
| Modal footer buttons | `Button.jsx` inside `Modal footer` | Order: cancel (`variant="secondary"`) on the LEFT, primary action on the RIGHT. |
| Confirm ("are you sure") dialog | `ConfirmDialog.jsx` | `tone="danger"` for deletions (red chip + red confirm), default warning (amber chip + brand confirm). Sits above form modals (z 100). Carries `role=dialog`, a focus trap, Escape-to-cancel and initial focus on the SAFE button. `error` renders the failure INSIDE the dialog — a mutation that fails must leave the dialog standing with the reason on it, never close and fire `alert()`. `challenge` (+ `challengeLabel`) demands the operator retype a string before confirm enables: use it for anything no undo can reach (full-DB restore → `RESTORE`, whole-day attendance wipe → the date). `cancelLabel` defaults to `common.cancel`. It registers in `dialogLayers.js` like `Modal`, so its Escape never also closes the form under it, and its key handler is an effect event — a parent re-rendering while it is open no longer bounces focus to the opener and back. |
| Transient action feedback (saved / sent / failed) | `Toast.jsx` | `<Toast>` controlled, or `useToast()` for the state+timer (`show(message, tone, duration, {icon, action})`). Tones `success/error/warning/info`; `action` = ONE `{label, onClick}` button for a notice that points somewhere («Javob tayyor — Ochish»), pressing it also closes the toast; errors persist until dismissed (you cannot re-read a toast that vanished). Portals to `document.body`, offsets by `--tg-safe-top`/`--tg-safe-bottom`, carries `role=status`. `position="bottom"` for dense editing surfaces. **NEVER `window.alert/confirm/prompt` — Telegram's iOS WebView silently suppresses them, so a failure becomes invisible on the primary device.** Never paste a fixed green `<div>`; never morph a Save button into its own status message. |
| Comment thread on a record | `CommentsModal.jsx` (`CommentsModal` + `CommentsButton`) | THE chat thread. Point it at a resource exposing the four standard endpoints — `GET/POST {endpoint}`, `PUT/DELETE {endpoint}/{id}` — via `endpoint` + `queryKey` + `refreshKeys` (the list keys whose `comment_count` badge must re-count); `title`/`subtitle` name the record. Ownership is NEVER re-derived on the client: the backend serves `is_own` per message, because a message belongs to the authoring PROFILE and one account may hold several. `CommentsButton` is the table-cell trigger (count badge, gold once non-empty) — a Comments column on the table for `sm+`, the same button on the mobile card's footer row. A failed write raises an error toast; the thread scrolls to the newest message. A message may carry a server-set `kind`: `"resolution"` marks the mandatory note a record was CLOSED with (the concerns register writes one into the thread when a concern is resolved) — green ✓ header, no delete button, because the backend refuses to delete it. Used by `/tasks` and `/concerns`. **It looks like a messenger — the «Muhokama» design (2026-09-26), in every caller:** somebody else's message is a bubble on the LEFT under their `ProfileAvatar` (their photo when the payload names `author_key` + `author_photo`, else initials), opened by their name in their avatar's own hue (`nameHue`) and their role; the reader's own messages sit on the RIGHT in the warm bubble with no avatar and no name; a day divider opens every calendar day; a `kind` is a tinted TAG inside the bubble; the clock sits in the bubble's corner, with ✓ / ✓✓ on the reader's own messages only where the server sends `seen` (no tick otherwise — never a guess); the composer is ONE rounded field with the clip inside it beside a round send button, and grows with its text; deleting asks first (`ConfirmDialog` danger). Hues pass through `.chat-ink` (index.css — pulled toward `--text-1` by `--chat-ink-mix`, so one hue reads on both themes); surfaces are the `--chat-bubble` / `--chat-bubble-own` tokens. The compact layout (34px avatars, 92% bubbles) serves a dialog and a phone, the roomy one (40px, 78%) a page on a wide screen. **`CommentsThread`** (same file) is the thread WITHOUT the dialog, for a page that shows a record above its conversation — the appeal chat (`layout="page"`: the page scrolls, the composer sticks to the bottom edge). Props, all optional, so tasks/concerns are unchanged: `attachments` + `filesEndpoint` (any file type, ≤10 per message, ≤20 MB each, dropped anywhere on the thread or picked with the clip; a refused file stays as a red tile; images the server proved to be images render as thumbnails → `Lightbox`, everything else as a `FileTile`; opening a file downloads it in a browser and asks the bot to DM it inside Telegram), `kinds` ({kind: {label, color, Icon, system}} — a `system` kind with no text is a centred line, not a bubble), `roleLabel`, `can_edit` per message (the server's whole answer to pencil/bin), `closedText`, `pollMs`, `beforeComposer` (a node after the newest message and before the composer — the action the conversation waits on; the appeal chat's ruling), and the first-message mode (`listEnabled=false`, `postEndpoint`, `postFields`, `textField`, `requireText`, `minText`, `onPosted`) used to FILE an objection as its chat's opening message. On a page the composer docks FLUSH with the screen edge: a sticky box stops at its scroll container's padding, so `bottom: 0` left it 16px up with the thread visible beneath it — it offsets by `calc(var(--main-pad) * -1)`, Layout's `<main>` padding named once. Day dividers read «Bugun» / «Kecha», then the date without its year inside the current year. |
| Camera proof capture | `pages/ProofCamera.jsx` | THE in-app camera, for checklist tasks whose `proof_kind` is `camera`. Never add a file-picker fallback to it — the whole point is that no file the leader produced is accepted. See the camera-proof section below. |
| Attached file (icon · name · size) | `FileIcon.jsx` (`FileIcon` + `FileTile` + `fileKind` + `humanSize`) | THE way an attached file is shown. Every file wears its EXTENSION's icon, tinted by one fixed `CATEGORY_COLORS` hue per type (PDF red, sheets green, documents blue, slides orange, images purple, video pink, audio teal, archives yellow, code indigo; unknown = slate `FOLD_COLOR` + plain file icon, never blank), with the extension printed on it. A file type is a category, never a status. `FileTile` is the row a chat message and a composer both use. |
| File upload | `UploadDropzone.jsx` (`UploadDropzone` + `FileStateList` + `useFileStates`) | One drag-drop model for every upload surface. Rejected files always render (a silent rejection reads as success); rows are keyed by generated id, not filename; result detail wraps on its own line; the bar carries progressbar ARIA; 100% flips to "processing" because parsing happens after transfer. `renderExtra(state)` is the seam for per-endpoint result detail — use it instead of forking the row markup. |
| Button | `Button.jsx` | Variants `primary/secondary/danger/ghost/success`, sizes `sm/md/lg` (`primary` is gold with a WHITE `--on-brand` label — a dark label shipped on 2026-10-03 for contrast and the operator reverted it the same day); `loading` shows the spinner. `tint` gives the soft-tinted form (12% bg + coloured border/label) — **THE form for table-row actions**. Never hand-roll a chip with inline rgba + `onMouseEnter/onMouseLeave`: mouse events never fire on touch, so a destructive action stays stuck in its neutral rest state on a phone. Forwards refs. |
| Row actions (⋮ menu) | `ActionMenu.jsx` | THE way a table row or a phone card offers its actions (2026-11-03, first on /cells): a 32px ⋮ (44px tap pad) opening a short list — `items` `[{key, label, icon, onSelect, tone: "danger", disabled, title}]`, falsy entries skipped, a danger item after a normal one gets a divider, a disabled item stays listed with its reason in `title`. Portaled to `<body>` and seated against the ⋮, so a scrolling table never clips it; flips up when the screen has no room below. Closes on a pick, Escape, Tab, a tap outside, a scroll or a resize; focus returns to the ⋮ (so a dialog the pick opens hands focus back to it). Clicks never reach the row underneath. ↓/↑ on the ⋮ open it on the first/last item; ↑ ↓ Home End walk it. `label` names the row («Amallar: 9422»). `zIndex` 210+ inside a fullscreen overlay. A row with nothing to offer renders a 32px blank in its place, so rows stay one height. Never hand-roll another row of icon buttons or another dropdown of row actions. |
| Segmented toggle + page view-tabs (min/hrs, P·A·P−A, view/mode switch, theme, Production/Staff tabs) | `SegmentedToggle.jsx` | Recessed-track pill: a `bg-inner` track (`rounded-xl`, `p-[3px]` inset, subtle `border`, no dividers) holding segments — the selected one is a brand-gold (`--brand`) pill with a WHITE `--on-brand` label (a dark label was tried on 2026-10-03 and reverted by the operator the same day), the rest transparent with muted `text-3`. This is ALSO the page-level "view tabs" template (Production view switch, Staff Workers/Requests) — same component, don't hand-roll a padded tab group. Outer height stays `size="md"` (default, 38px = `Button` lg / toolbar baseline) or `"sm"` (30px = `Button` md) so it aligns in toolbars; `"lg"` (52px track, each SEGMENT 44px — the track's inset is not tappable) is for a phone's page-level view tabs, where the toggle IS the navigation (/worker-concerns). `options` = `[value,label]` tuples or `{value,label,title}` objects (label may be a node/icon). **THE template for EVERY toggle on the platform — any set of 2+ mutually-exclusive options (mode / view / period / type / status / tab / shift / theme switch), current and future. Never hand-roll a button group or padded tab bar; extend this with a prop if it lacks something.** **The track can never overflow its container, and that is the template's job, not the call site's.** Labels are `whitespace-nowrap`, so an option set wider than the box it sits in used to run straight out of it — a `fill` toggle's segments are `flex-1`, but a flex item's automatic minimum size is its CONTENT width, so they refuse to shrink and push the track past the edge; a shrink-wrapped toolbar toggle had no width cap at all. Either way the last label was clipped by whatever ancestor was `overflow-hidden` and the surface around it grew a stray horizontal scrollbar («Ҳаммаси · Смена 1 · Смена 2» in a 240px filter dropdown). So the track is ALWAYS capped at its container and scrolls: it shrink-wraps exactly as before while the options fit, and once they do not it scrolls, scrolls the SELECTED segment into view and fades whichever edge still has content off-screen. This used to be the opt-in `scrollable` prop — **that prop is GONE**, because 105 of the 123 call sites had not opted in, the ones inside a narrow dropdown or a phone toolbar least of all, and an invariant every caller has to remember is one the template does not hold. Never wrap it in your own `overflow-x-auto` div either: a bare wrapper hides the scrollbar without replacing the affordance and leaves the selected segment off-screen, at which point nothing looks selected and the user cannot tell where they are. `className` lands on the OUTER box (widths / shrink / margins only) — never the track's own skin. `asTabs` adds tablist/tab roles, `aria-selected` and arrow-key navigation when the toggle switches VIEWS. An option object may carry `activeBg` / `activeFg` — the colours its pill takes WHEN SELECTED instead of brand gold — for a set whose options are verdicts (the assessment's Pass / No pass: green / red 700 shades with a white label), and `idleFg` the label colour of the UNSELECTED segment (so the verdicts read green / red before either is picked); without them every segment is unchanged. |
| Form label + control | `FormField.jsx` | Uppercase 11px label, red `*` when `required`. `hint` puts consequential copy ("this resets manual edits", "re-uploading replaces the day") UNDER the control at 11px/`--text-3` — never at `--text-4`, where the eye skips exactly the text that matters most. `error` attaches a validation message to the field that caused it instead of dumping one paragraph below every field. |
| Text field that exists in all 4 languages | `LangTextInput.jsx` | Never stack one input per language. A `SegmentedToggle` of language tabs (uz · uz_cyrl · ru · en, **ru open by default**) over ONE input for the selected tab. Every language is optional; a blank tab shows the Russian text as its PLACEHOLDER (previewed, never saved) plus the `ui.langInput.ruFallback` hint, because Russian is what the UI falls back to. Tabs stay plain — no filled/empty markers. `placeholderFn(lang)` previews something computed (e.g. a transliteration) instead of the Russian text; `action` puts a per-tab button beside the input — use these to ADOPT the template rather than forking it into stacked inputs. |
| Time of day (HH:MM) | `TimeField.jsx` | THE clock field. A native `<input type="time">` in the house control skin (`bg-inner`, border, `rounded-xl`, `px-3 py-2 text-sm`) plus a ghost ✕ that clears to `""`. **Blank means INHERIT or UNSET — never midnight**, so a blank field with an `inherit` string renders `ui.timeField.inherits` under it at 11px/`--text-3`: a blank native time input paints "--:--" and states nothing about the value actually in force, which is precisely the value the reader needs. `value`/`onChange` are plain "HH:MM" strings (the handler gets the string, not the event). Pairs of these follow the platform clock convention — Tashkent wall clock, `end <= start` ⇒ the window crosses midnight. Never hand-roll another `<input type="time">`; `TimeWheelPicker.jsx` stays the separate, window-BOUNDED picker (needs `lo`/`hi`, cannot express blank) for entering an event's clock inside a known range. |
| Whole-number count (how many people / pieces) | `CountStepper.jsx` | THE count field: − · number · + in the house control skin at the 38px baseline, 16px text below md so iOS never zooms. `value`/`onChange` are a whole number or `null` (the handler gets the NUMBER) — blank means «not answered yet», never 0. The ± buttons stop AT `min`/`max` (a − from a number typed above `max` lands on it); a TYPED number above `max` is kept as typed and left to the caller's `FormField` `error` + `invalid` — silently clamping somebody's number is a guess. First callers: the «Tozalovchilar» count on the /idle-cell form and in the «Jonli» recorder. Never hand-roll another numeric input for a count. |
| Search box | `SearchInput.jsx` | Magnifier icon + clear-X built in. Forwards a `ref` and every other prop to the `<input>` (the header search is a combobox: `role`, `aria-*`, `onKeyDown`); `hint` is a node shown at the right edge while the box is empty (the header's «Ctrl K»); the clear-X refocuses the box and names itself through `clearLabel`. |
| Generic data table | `DataTable.jsx` (`TableCard` + `Th` + `SortIcon` + `SectionHead`) | Styled after the Production «Позиции» table: card + SectionHead (right slot = row count), toolbar row (search/filters/actions), sticky bg-inner sortable headers, vertical column separators, `px-3 py-2` cells, baked row borders + hover. Loading = skeleton rows in tbody; empty = one centered colSpan row. `footer` holds actions over the whole list (add / remove rows, a selection's bulk bar) outside the scroll cap, so it stays in view; `headSize="lg"` when the card IS the page's subject and its subtitle must be read. `pageScroll` drops the card's own scroller (no `maxHeight` cap, the card clips with `overflow: clip`) so a phone scrolls ONE thing — sticky header/footer cells then stick to Layout's `<main>` and offset by `calc(var(--main-pad) * -1)` (a `Th` inside a `pageScroll` card does this itself, through the card's context); only for a table that fits its card's width (/kelish, /worker-concerns). `mobileMaxHeight="none"` lets the phone list grow with the page instead of scrolling inside its own 70vh box (the /leaders-kpi board, whose rows open in place). `head` draws a node in place of the SectionHead and `collapsed` shows the card with its head alone — an accordion card whose body is the table (one per cell on /kelish); the head stays the same node either way, so its toggle keeps focus. `scrollRef` hands the caller the table's own scroller — its clientWidth is the part on screen (the /leaders-kpi ranking fits its columns to it and pins an opened row inside it). Unique visualisation tables (fleet heatmap, comparison/difference, stat matrices) are exempt. |
| Cell row identity (the head of a cell's accordion card) | `CellIdent.jsx` | The verifix CODE in a NEUTRAL chip (a hashed colour read as a traffic light), under it the cell's leader behind a flag — `noLeader` words, dimmer, when nobody leads. `leader` arrives transliterated. /idle-cell and /kelish head their cell cards with it, so a cell reads the same on both. |
| Card/section header | `SectionHead` from `DataTable.jsx` | Icon + uppercase title + right slot; never redefine locally. `color` (a hex) seats the icon in a soft tint chip of that hue — a card with an identity of its own (the profile page's sections: one hue each, never a status colour). `size="lg"` titles a whole card rather than labelling a table — a sentence-case 15px title with its `subtitle` under it and a 22px icon (the appeal chat card). The icon sits on the TITLE's line (`items-start`) whatever a wrapping subtitle under it does — centred on the whole block it ended up beside the subtitle. |
| Table pager | `Pagination.jsx` | For registers too long to dump into the DOM (thousands of rows). Sits directly under the `TableCard`: "x–y of N" left, windowed page buttons right, built from `Button`. Renders nothing for a single page. |
| Drag-to-reorder list of rows | `SortableList.jsx` | THE way a person puts ROWS in order by hand (2026-11-12, first in the «Navbat» dialog): the column picker's pointer drag (mouse and touch), the grip a button that also takes ↑ / ↓, the list scrolling itself near its scroll container's edge so a long list in a `Modal` drags end to end. `items` `[{key, render(index)}]`, `onChange(keys)` once per drop, `label(key)` for the grip. Never hand-roll another drag list. |
| Column show/hide + reorder | `ColumnsPicker.jsx` | 38px `Columns3` icon trigger on the toolbar's RIGHT edge (`className="ml-auto"`, hidden-count badge) + portaled panel listing every column IN TABLE ORDER — hidden ones stay dimmed in place (eye-off), never regrouped to the bottom. Hide all/Show all links; drag-to-reorder only arms via the panel's reorder button. Controlled: `columns [{key,label,locked}]`, `order`, `hidden`, `onChange({order,hidden})`. Persist via `/api/ui-prefs/{key}` (per-profile JSON blobs, `UiPref` model); reconcile saved keys against the current column catalog and keep identity columns `locked`. `t("cols.*")` keys exist in all 4 langs. Excel exports of a picker-equipped table must mirror it exactly — send the visible keys in on-screen order (`columns`) with the row-id `order`, backend formats keyed per column. **The «Zagruzka fayli» «Pozitsiyalar» table's «Excel» button is the brigadir «ABC форма» workbook WITH the table's other columns inserted** (2026-10-29. That morning the operator asked «make sure the excel download always be the same as the table displayed», and the button became a plain house-look mirror (`POST /api/production/table.xlsx`, `services/table_mirror.py`, now called by no current bundle and kept for a 4.338 tab). By the afternoon the operator sent a brigadir's own form back — 8 columns inserted by hand after ПЛАН — with «keep that style, but when new columns are added add them also»): ONE button, `POST /api/production/export.xlsx`. The page sends `cols` (the picker's visible columns `{key, label, input}`) and `cells` (per row of `order`, each cell through `posExport`, the twin of `posCell`). The server keeps the form's own columns (`ABC_FORM_KEYS`: seq, sap_code, name, labor, wc, wc_group, people, actual_labor = the form's F, fact, plan, labor_total, minutes, pareto) and INSERTS every other visible one after ПЛАН (H), in the table's order, under the table's header in the reader's language. Everything from «Общ.трудаёмкост» on moves right by their count k, formulas following — the very shift a brigadir's own Excel insertion makes. k = 0 (a tab from before, or nothing extra on screen) is the old file byte for byte; with k = 4, LibreOffice computes every form cell identically. An inserted cell is the table's value (blank where the table prints «—»), green when `edit` marks it typed on the table (Birlik, Kontiner krishka). «Bajarish %» is the one inserted FORMULA, `=IFERROR(F/Общ.трудаёмкост,0)`. **A new column on that table needs a case in `posCell` AND `posExport`**; one missing from `posExport` still reaches the file through its raw field, never dropped. A re-import of such a file reads products and groups as before («Группа» is found by its header), and finds no work centres at M (the team block moved), so it leaves the register's штатка alone — the k = 0 file writes штатка 0 over it, as it always did. The form itself: it reproduces the manual form cell-for-cell: totals row 1, headers row 2, positions row 3+, team block M:O, indicators P:Q; only Трудоемкость/Команда/Факт/ПЛАН, «Группа» (column L, the former spacer, from 2026-09-14) and O. SONI are values, everything else is a live formula so the brigadir's edits recalculate. A work centre whose cells carry GROUP letters also gets an X:Y block («Команда · буква» = «A2894 · A», its O. SONI a yellow value): a grouped line's ЛЮДИ is `VLOOKUP(D&" · "&L,$X:$Y,2,0)`, the team's N becomes `=SUMIFS($Y:$Y,$X:$X,M&" · *")` when the block holds every cell of it and adds up to the page's N (else the page's value), and its Загруженность divides by N. A LEADER's file writes only their own groups' rows, so the minutes of the lines their cut hides ride as constants beside I1, F1 and the team's SUMIFS — the leader's load, bandlik and Парето then equal their page's and the brigadir's file. The block sits clear of every column `pp_parser` reads and its header names no group, so the round trip still finds «Группа» at L; an ungrouped unit's file differs only by the «Группа» header in L2 and L's width — the X:Y block is written only where cells carry letters. Trimmed hard on the operator's call (2026-08-31): the indicator block went from NINE rows to three — «Nechta odam keldi» = `=SUM(N…)`, the people assigned to the cells that day; «Hozirgi odam bilan o`rtacha bandlik(smena boshida)» = `=I1/(keldi×shift_min)`, the same arithmetic as `pp_calc`'s `avg_load` so the file and the page answer with one number; and «Общ.трудаёмкост» = `=I1` — with the other six indicators, the whole «Сколько должна на штатке» block (Z:AA) and the team block's P:W half (Команда · минут · real load · capacity · kerak · Штатка) gone. Everything removed was derived from hand-entered counts nobody fills in, so it printed 0 / 100% on every file. **From 2026-09-16 the block is FIVE rows**: the operator asked for the two of those six that need no hand-entered count back, and they sit under «keldi» in the manual form's own order — «Nechta odam kerak» = `=ROUND(I1/productive_min,0)` and «Bo`sh odam/kerakli odam» = `=keldi−kerak`, which prints RED when negative (short-handed), the one figure in the file carrying a verdict. **kerak divides by the unit's own `pp_productive_min`, NEVER a hard-coded 0.85**: that constant is `pp_calc`'s S per person, the divisor the «Odamlar soni» suggestion `N = ROUND(W×Q/S)` already uses, so the file and the page size a shift by one rule — and its default, 408, IS the manual form's own 0.85 × 480, so an unconfigured unit's file still reproduces the form cell for cell. «bo`sh» divides nothing and so carries no IFERROR: on a day nobody typed O. SONI it reads −kerak, which is what an unfilled form should say. Still out: «kelishi kerak edi» (the штатка row itself) and «% абсетеизм», which divides by it; «% обеспеч» and «Kerakli odam bilan o`rtacha bandlik» were simply not asked for and are computable now that kerak is back, so wanting either is one more entry in that list, not new arithmetic. Consequence: O. SONI (N) loses the `=ROUND(U,0)` chain that fed it and is written as a VALUE — the block's one input, and what ЛЮДИ/Минут/Парето/Загруженность still recalculate off via the M:N VLOOKUP. The page itself (its reconciliation card, its Штатка/capacity columns) is untouched — only the export dropped them. Superseded the older «загрузка» two-shift layout.) See the Production «Позиции» table for the reference wiring (cells rendered by a per-key switch so hide/reorder is free). |
| Factory (plant) switcher | `useFactorySection()` from `FactorySelect.jsx` | THE plant switcher — a `FilterPanel` SECTION, first in every factory-aware page's section list (plant → shift → supervisor → …), never a standalone control on the bar. (The standalone `FactorySelect` dropdown and the `FactoryTabs` strip before it are both retired from page toolbars: each cost a permanent toolbar cell on a phone-first platform for a value most users never change.) «All factories» is the FIRST option. Returns `null` when fewer than two factories exist; a locked viewer (supervisor/leader) gets a `static` section — an inert chip naming their plant, never a one-option control. The `FactorySelect` component itself survives only for non-toolbar surfaces (admin forms). |
| Ojidaniya category owner ("who answers for this cause") | `components/idle/OwnerChip.jsx` | THE way a «Kutish mas'uli» is named beside a category — the «Xarajat» tree, the «Toifalar bo'yicha» matrix, `/idle-owner`. Fed the payload's `owners` map (category → person, from `services/idle_scope.owner_labels`), never a name copied onto every row. A NAME, not a status: no traffic light — it borrows the category's own hue where it sits on a coloured row. A category with NOBODY assigned renders **nothing at all**, never «—» and never an empty chip: twelve categories with two owners between them would grow ten placeholders saying only that the register is unfinished. (Workbooks DO print «—» — a blank spreadsheet cell reads as «this column did not apply here».) |
| Cell label (how a cell is NAMED) | `utils/cellName.js` → `cellLabel(code, leader)` | A cell is its **verifix CODE**. The workshop name is NEVER printed — see the section below (the one exception: the `/cells` register's «Sex nomi» column, 2026-10-19). |
| Pressable person reference | `PersonLink` in `components/people/peopleUtil.jsx` | THE way a person's name rendered as CONTENT opens their «Xodim kartasi». `employeeId` (the Verifix id) where the row carries one — a live day, the compliance list, an assessment candidate; otherwise `name` (+ the row's cell `code`) → `/people?find=…`, which opens the card when the name folds to ONE person and lists the namesakes when it does not (never a guess). Inert text for a viewer who may not open `people`; clicks stop propagation; CellLink's `.cell-link` look; never inside another `<button>` (the assessment list's phone rows stay unlinked for that reason). |
| Pressable cell reference | `CellLink.jsx` | THE way a production cell rendered as CONTENT (table cell, card, chip) opens its page `/cells/:id` — dotted-underline affordance via the `.cell-link` rule in `index.css`. `id` = cells.id; without one it renders inert text (never a dead link). Clicks stop propagation, so it nests in clickable rows. FILTER controls listing cells never navigate. Don't put it inside another `<button>` (IdleCell accordion / AttendanceUpload expander stay unlinked on purpose — nested-interactive + they hold unsaved drafts). `/cells/:id` (`CellDetails.jsx`) is auth-only like `/profile`; its edit modal is the shared `CellFormModal.jsx` (ONE form with the `/cells` register). |
| Work-centre GROUP letter | `GroupBadge.jsx` + `utils/wcGroup.js` | THE letter a cell, a catalog line or a typed pin carries when several cells of one unit share a SAP work centre (backend `services/wc_group.py`). Sits right AFTER the code chip or the cell's code — never instead of it, never a second hand-rolled pill. Renders nothing without a group (a cell alone at its code has none, and ten placeholders would only say so). Every letter wears ONE fixed colour on every page (`groupColor`, the operator's order 2026-09-14: A red · B blue · C yellow · D green · E orange · F purple, then the rest of `CATEGORY_COLORS`), tinted like a work-centre chip; a letter picker renders its options as badges. `tone="warn"` marks an ORPHAN letter (lines or pins naming a group no cell carries) with the letter's own colour behind a DASHED outline — never amber, which would read as C. Plain text — a workbook cell, a toast, a tooltip — uses `wcGroupLabel(code, group)` → «A2894 · A»; a form normalises input with `normGroup` (Cyrillic twins → Latin, `undefined` = refuse). A group picker is a `StyledSelect` of «—» + the letters, never a free-text box. |
| Empty-data placeholder | `EmptyState.jsx` | For page/section level. `tone="danger"` is a section that FAILED to load — its glyph in a red tint chip, so a failure never reads as «nothing here». Table "no match" rows stay plain muted text. |
| Full-screen "you can't see this page" state | `ErrorScreen.jsx` | THE template for 404, no-access, a crash, offline, and every blocked auth status (`AuthGate`'s screens, `NoAccess`, `ErrorBoundary` all render through it). Shape: tinted icon chip → status `code` → `title` → ONE sentence → ONE primary `action` → `secondary` escape hatch → `detail` collapsed. Tones are the status palette: `danger` broke, `warning` blocked-but-fixable, `neutral` slate just-not-there (404/403), `brand` an invitation (register) — never a raw emoji as the lead visual, which is what all eight hand-rolled copies used to do. Takes focus on the primary action at mount and pads for Telegram safe areas. `inline` drops the viewport wrapper for a screen rendered INSIDE `Layout` (the 404 keeps the sidebar, so the nav is itself an escape hatch). **Crashes are SCOPED and never technical**: use `ScopedErrorBoundary` from `ErrorBoundary.jsx` (never the bare class) — one inside `Layout` around the content column so a broken table keeps the nav alive, one above the routes so a broken page keeps the session, and the app-level one only for a provider. It clears itself on navigation (`resetKey` = pathname), shows the minified stack to ADMINS only, and posts every catch to `POST /api/crash-report` (`routers/boot.py`, the ONE client-failure door — fingerprint-deduped, one DM per crash per hour, always logged as `CLIENT-CRASH`). A user must never be the monitoring system. |
| Loading | `Skeleton.jsx` blocks for page/section data loads; `Loader2` spinner inside buttons for actions | Never bare `…` / "Загрузка…" text. |

Other UI conventions:

- Modal stacking: base modals z=50 (`Modal` default), nested modals pass `zIndex={60+}`, `ConfirmDialog` defaults to 100. **A popup opened from INSIDE a page's fullscreen overlay (the `z-[200]` portals on `/zagruzka`) must pass `zIndex={210}`** — `PendingInfoModal` already sits there. At its default it mounts BEHIND the overlay, the tap looks like it did nothing, and in Telegram — no Escape key — the reader must leave fullscreen to find it. `CommentModal` and `FormulaModal` take a `zIndex` prop for exactly this (defaults unchanged, 50 / 60), and `ComparisonTable` raises both whenever it is `fullscreen`. Found 2026-09-21 on the new heatmaps; the fleet heatmap and both comparison tables had carried it since before.
- Table-toolbar controls share ONE height — 38px, the `FilterPanel` trigger (`px-3 py-2 text-sm` + border). `SearchInput` default and `SegmentedToggle` md are also 38px. `Button` is the exception: md/sm are compact (≈30/26px) for modals & inline actions, so a toolbar action button must use **`size="lg"`** (38px) to line up with the filter/search controls next to it. All `Button` variants carry a border (transparent on borderless ones) so heights line up — don't strip it.
- `FilterPanel` (in `ColumnFilter.jsx`) is THE page/table filter zone. **Every page's scope controls (plant / shift / supervisor / leader / cell / category) live INSIDE it as sections — never as standalone selects stacked above the content.** The page bar is ONE row: the period control (`DateRangePicker compactLabel`, or `DayStepper` on daily pages) inline, then `FilterPanel`, then chips. It adapts to space: on md+ it unfolds into one dropdown per filter while the WHOLE toolbar row fits on a single line, else it collapses to the grouped «Filtrlar» button (below md: bottom sheet). Whenever controls are not visible inline, every ACTIVE section renders as a CHIP beside the trigger — `display` text + per-chip ✕ (`onClear`) — the ✕ clears THAT section and is announced so («{label} — Tozalash»; the chip itself reads «{label}: {value}»), with an invisible tap pad toward 44px (vertically only where the chips WRAP: a taller pad inside a scrolling strip would make the strip scroll); the chip BODY fills the chip's height (it was the 16px of its text line) and carries the same pad, and a wrapping strip is NOT a scroller — `overflow-x-auto` beside `overflow-visible` still made it one and clipped every pad; chip body re-opens the panel; `static: true` sections are inert chips (locked viewer's plant). Sections: `{ key, icon, label, active, display, render({close}), onClear?, static?, group?, pinned? }` — `PickFilter` (single-select list, closes on pick), `OptsFilter` (multi), `RngFilter`, or an embedded `SegmentedToggle fill`. `group` (a translated caption) splits the collapsed surfaces into labelled blocks in first-appearance order; use it wherever a page carries both a scope CHAIN and record filters, so ten anonymous rows read as two short lists (Quality: «Kim va qayerda» = plant → shift → brigadir → leader → cell, «Nima bo'ldi» = the register filters). **A cascading level narrows the level below it and SAYS SO**: build each list under the levels above it, pass `PickFilter`'s `note` ("narrowed by «X» · N") so a shortened list is never mistaken for missing data, pass `empty` (a message + a button clearing the parent) for a level narrowed to nothing, and drop a child pick its own list no longer offers when the parent changes — a control naming a value the page cannot show is worse than a reset. See the Quality org chain for the reference wiring. Omit `activeCount`/`anyActive`/`onClearAll` unless overriding — the panel computes them from sections. `pinned: true` keeps a section's own inline dropdown on the toolbar even while the rest collapse — for a page carrying so many filters that the fit check can never unfold the row (ARC's thirteen), so the controls that steer the page are not buried behind a button that names none of them. Pin the two or three controls the reader steers with — and when a page's TABS ask different questions, pinning follows the open tab (ARC pins smena → brigadir → lider on «Yacheykalar bo'yicha», bo'lim / holat / kategoriya on «Barchasi»; every filter still narrows both tabs, only where its control sits changes). Below md nothing is pinned (the sheet keeps them all) and a pinned section drops its chip on md+, where its own trigger already states it. Keep it a DIRECT child of the toolbar flex row — the fit check measures that row's children (flex-grow spacers count as 0). View switches (tabs) stay OUTSIDE the panel; text search stays an inline `SearchInput`. **`chipsWrap`** (below md only — `chipsWrap="always"` at every width, for a page whose column is narrow enough that even a laptop row cannot hold the chips (/kelish); needs a `flex-wrap` parent row). Every trigger carries `min-h-[38px]`: the icon-only one a phone shows computed 35px, off the baseline: the chip strip takes its content width as basis, so chips that do not fit beside the period control wrap onto a line of their own at up to 240px each instead of being clipped by an invisible horizontal scroller — the active filter was the part a phone cut off (`/leaders` uses it). A section's search box autofocuses on FINE pointers only (the phone sheet mounts every section, and the last box's focus raised the keyboard over it), and `PickFilter` / `OptsFilter` rows are ~40px below sm.
- All colors via CSS variables (`var(--bg-card)`, `var(--bg-inner)`, `var(--text-1..4)`, `var(--border)`, `var(--brand)`) — no hardcoded grays/hex for chrome, including on admin pages. **Text holds WCAG AA (4.5:1)** (2026-10-03, platform-wide): `--text-3` is the lowest token for anything a reader must read (it was raised to pass on every surface of both themes), `--text-4` is decoration and placeholders only, a label ON a brand-gold fill uses `--on-brand`, which is WHITE on both themes (the operator's call — the one deliberate exception to AA), and the gold FILL is the logo's `#C8973F` on both themes (light was a deeper `#B07828` until 2026-10-03), while light-theme `--brand-text` stays the deeper `#B07828` so a gold word on white is still readable.
- **Every row of a table is ONE line high — all rows equal height** (the
  operator, said more than once; restated 2026-10-07). No cell stacks a second
  line under its value (a chip, a badge, a note, a sub-label) and no cell wraps:
  a note goes on the value's own line, a long text is cut with «…» and whole on
  hover, and a table too wide for the screen scrolls sideways. A count the page
  already shows elsewhere (a tab badge) is never repeated on the row. Exempt:
  tables whose section here says otherwise (the /zagruzka phone grids' two-line
  names).
- **An action taken in a list must never move the list** (the operator, 2026-09-28: a hint above «Kelish ro'yxati» that showed only while nothing was marked moved the table on the first tap — «a very bad UX»). Nothing ABOVE the rows may appear, disappear or change height because of a tap, a save or a count changing: put conditional copy BELOW the list (a `TableCard` `footer`) or keep it permanently, give chips that carry live counts a fixed width, render a row's secondary line even when empty, and load a header with skeletons of its final size.
- No raw emojis — lucide icons in soft tint chips (see `ProjectIcon` in `Kaizen.jsx`).
- Status colors are traffic-light: red `#ef4444` / yellow `#eab308` / green `#22c55e`; "not started" is grey `#94a3b8`; brand gold `#C8973F` is an accent, never a status. The band a headline figure is judged by (load, completion, quality closure, open concerns) is defined once, in `utils/statusBands.js`.
- Categorical chart colors (roles, units, products, people, series identities) come from `utils/chartPalette.js` `CATEGORY_COLORS`, assigned generic-first in this exact order: red → green → blue → yellow → orange → purple → teal → pink → … One fixed hue per category, reused across every chart that shows it; «Остальные/Other» folds are `FOLD_COLOR` slate. Brand gold NEVER represents a category (all pages except `/leaders`). Single-metric accents, status palettes, and value-intensity ramps are separate and may keep gold.
- Date-axis line/area charts never show fewer than 7 days — use `utils/chartRange.js`.
- **…and never thousands of points.** A daily axis longer than 92 days is folded into weeks, past 2 years into months, by `utils/trendBuckets.js` (`bucketTrend` — the open pool read at each bucket's end, new/closed summed; `bucketTick` / `bucketTitle` for the labels; the subtitle names the grain). ApexCharts draws an SVG node per point, two per bar, and «Barcha vaqt» (from 2015) read day by day froze /concerns (2026-10-21). On «Barcha vaqt» the axis starts at the first dated record, not 2015. /concerns and /tasks use it; a new daily trend chart must too.
- **A register of thousands of rows is PAGED** (`Pagination.jsx`, under the `TableCard`), never dumped into the DOM — the /concerns register (~9,000 rows on «Barcha vaqt», 50 a page, a table row AND a phone card each) froze the page. A filter, period, search or sort change goes back to page 1; a refetch after a save keeps the page (key the reset on the filter VALUES, never on sets rebuilt from the rows). Exports still take every row. Sort keys are computed once per row, never inside the comparator.
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
- **On a phone the app header is the title, the bell and the avatar** (below md). Language, theme and ghost mode live in the profile popover there (`PhonePrefs` in `Layout.jsx`, three `SegmentedToggle`s); from md up they stay on the bar. Three utility icons had left a page title ~100px and cut it («AI qaroriga nor…») on every page. Ghost mode stays on the phone bar while it is ON — a state that silences the team must be visible without opening anything. The one other icon on a phone bar is «Yordamchi»'s, and only for those who may use it (admins today) — it opens the assistant, which is a primary action, not a preference. `Layout`'s optional `subtitle` puts a second line under the title; a page uses it to name WHAT is on screen once its own heading has scrolled away (the appeal chat), keyed so the change fades in.
- **A dead Telegram bridge is never a crash.** Android drops the Java object behind `window.TelegramWebviewProxy` when it tears a mini app down, and every `Telegram.WebApp` call after that throws «Java object is gone» synchronously from its caller — on a slow link that can happen before React mounts (AuthProvider's `ready()` crashed `/proof/camera` that way, 2026-09-21). The inline script above the SDK tag in `index.html` wraps the proxy once, and the SDK looks it up at call time, so all ~40 call sites are covered. Never call the proxy raw, never move that script below the SDK tag, and never add per-call try/catch for this instead.

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
`git.safiabakery.uz/Safia-Outsource/production`. **In the main local checkout
it is called `gitea`, and `origin` is the GitHub MIRROR** — `git push origin
main` deploys NOTHING (2026-10-02: a production fix sat on GitHub for eight
minutes while the API was down). Resolve it with `git remote -v` before every
push; never assume a name.

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

- **gitea is THE remote** — `git.safiabakery.uz/Safia-Outsource/production` (private). `main` tracks it, so a bare `git pull` / `git push` means gitea. **Its local NAME varies by checkout** — it is `gitea` where a GitHub mirror is also configured (the main local checkout, where `origin` IS the mirror) and `origin` where it is the only remote, so read `git remote -v` instead of hard-coding a name. Where a GitHub mirror exists it is a mirror ONLY: pushed last, best-effort, never gated on.
- **Pushing to `main` deploys to production.** `.gitea/workflows/deploy.yaml` runs `deploy/deploy.sh` on the VPS on every push — see the Deployment section below.
- **The whole loop is automated by two hooks in `.claude/settings.local.json`: pull → edit → build → commit → push.** A cloud session runs the SAME `auto-commit.sh` from the committed `.claude/settings.json` (as `auto-commit.sh cloud`, a no-op on a laptop) and pulls through `scripts/cloud-setup.sh` — see «Cloud sessions».
  - `SessionStart` → `.claude/hooks/auto-pull.sh` fetches gitea and **fast-forwards `main`** before anything is edited. It never merges or rebases: on a diverged branch, or when uncommitted work blocks the fast-forward, it reports and leaves the tree untouched. Log: `.claude/auto-pull.log`.
  - `Stop` → `.claude/hooks/auto-commit.sh` bumps `VERSION` (patch, unless the turn already set it — see Versioning), runs the Vite build, commits everything with a generated message, then pushes **gitea first** (that is the deploy) and the GitHub mirror after. A failed build aborts the commit; a failed mirror push is cosmetic and says so; a failed *gitea* push says `NOT deployed`. Log: `.claude/auto-commit.log`.
  - **The backend's unit tests run first** (2026-11-06): `backend/tests`, with `DATABASE_URL` pointed at a dead port. The ~294 that need a real Postgres skip themselves unless `SAFIA_TEST_PG` is set, and **the gate sets it when a Postgres on THIS machine answers** (a role that can create databases; only localhost is probed): each test class makes and drops its own `safia_t_*` database, so the run is ~340 tests and about two minutes. With no local server (a cloud session, a laptop without Postgres) they skip, ~40 tests in a second, and `.claude/auto-commit.log` says `NO local Postgres answered`. A failing one stops the commit like a failing build (`TESTS FAILED — nothing committed`). A module a test imports can't be deleted without its test (the temporary one-shots). The record — how it picks the server, the limits, why — is `docs/server-operations.md`, «The commit gate runs the Postgres tests too».
  - Net effect: **one turn = one commit = one production deploy**  - Net effect: **one turn = one commit = one production deploy**, with no staging step and no review window. Verify a doubtful build by hand with `cd frontend && npx vite build`.
  - The pull only runs at session start. If `main` moves on gitea mid-session the push at turn end is *rejected*, not silently merged — you will see `PUSH FAILED` in the summary; pull and re-run.
- `frontend/dist` is TRACKED and prod serves the SPA from it. Commit the build alongside the source — the pipeline rebuilds it for you if you forget, but committing it makes the deploy a no-restart, zero-downtime file swap.
- Backend changes need the new code loaded on prod (systemd `safia-production`, uvicorn — the cPanel/Passenger host is gone). The pipeline does it automatically for `backend/**` and `bot/**` — from 2026-10-18 as a worker SWAP inside the running unit (see «Zero-downtime on ONE port»), a full restart only when `app/supervisor.py` itself changes. Startup migrations still go in BOTH the FastAPI lifespan and `passenger_wsgi.py`, even though only the lifespan executes today — in the lifespan as `run(step)` (schema, what a request needs) or `later(step)` (data fixes, reports, DMs, syncs — on a thread after readiness); see «Zero-downtime on ONE port».
- i18n: 4 languages (uz / uz_cyrl / ru / en). Static UI text via `t()` keys added to all 4; DB text via transliteration — **`tl()` for a PERSON's name, `tx()` for every other DB text** (both from `useTranslit()`).
  - **The English form is for NAMES only** (the operator, 2026-09-21: «if the text is in Uzbek, do not translate it into English except the names of people»). For `en`, `tl` applies the name convention — x→kh, q→k, oʻ→u, gʻ→gh, apostrophes dropped (Burxon → Burkhon). On Uzbek words that is a misspelling: a leader-auto notice printed the task «…planini **qayd qilish**» as «…**kayd kilish**» and the floor noticed at once. `tx` / `transliterateText` still turn Cyrillic into Latin for uz/en but keep the Uzbek spelling for English. Task names, job titles, categories, SKUs, notes, reasons, comments, broadcast text and plant names are all `tx`.
  - Backend twin: `app/translit.py` `transliterate` (names) / `transliterate_text` (everything else). Notification params are split by `staff._NAME_PARAMS`: a new param that carries a person's name must be added there, or English readers see it in Uzbek spelling. A new prose param needs nothing.

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
- **Backend deploys swap WORKERS inside the one process** (see «Zero-downtime
  on ONE port» below): `deploy.sh` sends SIGHUP to the unit's main process,
  the supervisor, which starts a worker on the new code and retires the old
  one only once the new one is ready. No gap, no root, no second port. A
  change to `app/supervisor.py` itself is the one deploy that still restarts
  the unit.
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
