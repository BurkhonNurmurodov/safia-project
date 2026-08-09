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
| Date picker (range or single) | `DateRangePicker.jsx` | Single date → `single` prop. Never a bare `<input type="date">`. |
| "‹ day ›" stepper on daily pages | `DayStepper.jsx` | `max={null}` to allow future dates. |
| Dialog / form modal | `Modal.jsx` | Backdrop `rgba(0,0,0,0.6)` + Telegram safe-top; rounded-2xl card; header = title (+subtitle/icon) + X close; body scrolls; footer right-aligned. |
| Modal footer buttons | `Button.jsx` inside `Modal footer` | Order: cancel (`variant="secondary"`) on the LEFT, primary action on the RIGHT. |
| Confirm ("are you sure") dialog | `ConfirmDialog.jsx` | `tone="danger"` for deletions (red chip + red confirm), default warning (amber chip + brand confirm). Sits above form modals (z 100). Carries `role=dialog`, a focus trap, Escape-to-cancel and initial focus on the SAFE button. `error` renders the failure INSIDE the dialog — a mutation that fails must leave the dialog standing with the reason on it, never close and fire `alert()`. `challenge` (+ `challengeLabel`) demands the operator retype a string before confirm enables: use it for anything no undo can reach (full-DB restore → `RESTORE`, whole-day attendance wipe → the date). `cancelLabel` defaults to `common.cancel`. |
| Transient action feedback (saved / sent / failed) | `Toast.jsx` | `<Toast>` controlled, or `useToast()` for the state+timer. Tones `success/error/warning/info`; errors persist until dismissed (you cannot re-read a toast that vanished). Portals to `document.body`, offsets by `--tg-safe-top`/`--tg-safe-bottom`, carries `role=status`. `position="bottom"` for dense editing surfaces. **NEVER `window.alert/confirm/prompt` — Telegram's iOS WebView silently suppresses them, so a failure becomes invisible on the primary device.** Never paste a fixed green `<div>`; never morph a Save button into its own status message. |
| File upload | `UploadDropzone.jsx` (`UploadDropzone` + `FileStateList` + `useFileStates`) | One drag-drop model for every upload surface. Rejected files always render (a silent rejection reads as success); rows are keyed by generated id, not filename; result detail wraps on its own line; the bar carries progressbar ARIA; 100% flips to "processing" because parsing happens after transfer. `renderExtra(state)` is the seam for per-endpoint result detail — use it instead of forking the row markup. |
| Button | `Button.jsx` | Variants `primary/secondary/danger/ghost/success`, sizes `sm/md/lg`; `loading` shows the spinner. `tint` gives the soft-tinted form (12% bg + coloured border/label) — **THE form for table-row actions**. Never hand-roll a chip with inline rgba + `onMouseEnter/onMouseLeave`: mouse events never fire on touch, so a destructive action stays stuck in its neutral rest state on a phone. Forwards refs. |
| Segmented toggle + page view-tabs (min/hrs, P·A·P−A, view/mode switch, theme, Production/Staff tabs) | `SegmentedToggle.jsx` | Recessed-track pill: a `bg-inner` track (`rounded-xl`, `p-[3px]` inset, subtle `border`, no dividers) holding segments — the selected one is a brand-gold (`--brand`) pill with a white label, the rest transparent with muted `text-3`. This is ALSO the page-level "view tabs" template (Production view switch, Staff Workers/Requests) — same component, don't hand-roll a padded tab group. Outer height stays `size="md"` (default, 38px = `Button` lg / toolbar baseline) or `"sm"` (30px = `Button` md) so it aligns in toolbars. `options` = `[value,label]` tuples or `{value,label,title}` objects (label may be a node/icon). **THE template for EVERY toggle on the platform — any set of 2+ mutually-exclusive options (mode / view / period / type / status / tab / shift / theme switch), current and future. Never hand-roll a button group or padded tab bar; extend this with a prop if it lacks something.** For option sets that overflow on phones use the `scrollable` prop — NOT your own `overflow-x-auto` wrapper: a bare wrapper hides the scrollbar without replacing the affordance and leaves the selected segment off-screen, at which point nothing looks selected and the user cannot tell where they are. `scrollable` scrolls the active segment into view and adds edge fades. `asTabs` adds tablist/tab roles, `aria-selected` and arrow-key navigation when the toggle switches VIEWS. |
| Form label + control | `FormField.jsx` | Uppercase 11px label, red `*` when `required`. `hint` puts consequential copy ("this resets manual edits", "re-uploading replaces the day") UNDER the control at 11px/`--text-3` — never at `--text-4`, where the eye skips exactly the text that matters most. `error` attaches a validation message to the field that caused it instead of dumping one paragraph below every field. |
| Text field that exists in all 4 languages | `LangTextInput.jsx` | Never stack one input per language. A `SegmentedToggle` of language tabs (uz · uz_cyrl · ru · en, **ru open by default**) over ONE input for the selected tab. Every language is optional; a blank tab shows the Russian text as its PLACEHOLDER (previewed, never saved) plus the `ui.langInput.ruFallback` hint, because Russian is what the UI falls back to. Tabs stay plain — no filled/empty markers. `placeholderFn(lang)` previews something computed (e.g. a transliteration) instead of the Russian text; `action` puts a per-tab button beside the input — use these to ADOPT the template rather than forking it into stacked inputs. |
| Search box | `SearchInput.jsx` | Magnifier icon + clear-X built in. |
| Generic data table | `DataTable.jsx` (`TableCard` + `Th` + `SortIcon` + `SectionHead`) | Styled after the Production «Позиции» table: card + SectionHead (right slot = row count), toolbar row (search/filters/actions), sticky bg-inner sortable headers, vertical column separators, `px-3 py-2` cells, baked row borders + hover. Loading = skeleton rows in tbody; empty = one centered colSpan row. Unique visualisation tables (fleet heatmap, comparison/difference, stat matrices) are exempt. |
| Card/section header | `SectionHead` from `DataTable.jsx` | Icon + uppercase title + right slot; never redefine locally. |
| Table pager | `Pagination.jsx` | For registers too long to dump into the DOM (thousands of rows). Sits directly under the `TableCard`: "x–y of N" left, windowed page buttons right, built from `Button`. Renders nothing for a single page. |
| Column show/hide + reorder | `ColumnsPicker.jsx` | 38px `Columns3` icon trigger on the toolbar's RIGHT edge (`className="ml-auto"`, hidden-count badge) + portaled panel listing every column IN TABLE ORDER — hidden ones stay dimmed in place (eye-off), never regrouped to the bottom. Hide all/Show all links; drag-to-reorder only arms via the panel's reorder button. Controlled: `columns [{key,label,locked}]`, `order`, `hidden`, `onChange({order,hidden})`. Persist via `/api/ui-prefs/{key}` (per-profile JSON blobs, `UiPref` model); reconcile saved keys against the current column catalog and keep identity columns `locked`. `t("cols.*")` keys exist in all 4 langs. Excel exports of a picker-equipped table must mirror it exactly — send the visible keys in on-screen order (`columns`) with the row-id `order`, backend formats keyed per column. (Exception: the Позиции export deliberately emits the fixed brigadir «ABC форма» formula workbook instead of a picker mirror — don't revert it. It reproduces the manual form cell-for-cell: totals row 1, headers row 2, positions row 3+, team block M:W, indicators X:Y, staffing Z:AA; only Трудоемкость/Команда/Факт/ПЛАН/Штатка and the reconciliation counts are values, everything else is a live formula so the brigadir's edits recalculate. Superseded the older «загрузка» two-shift layout.) See the Production «Позиции» table for the reference wiring (cells rendered by a per-key switch so hide/reorder is free). |
| Factory (plant) switcher | `useFactorySection()` from `FactorySelect.jsx` | THE plant switcher — a `FilterPanel` SECTION, first in every factory-aware page's section list (plant → shift → supervisor → …), never a standalone control on the bar. (The standalone `FactorySelect` dropdown and the `FactoryTabs` strip before it are both retired from page toolbars: each cost a permanent toolbar cell on a phone-first platform for a value most users never change.) «All factories» is the LAST option. Returns `null` when fewer than two factories exist; a locked viewer (supervisor/leader) gets a `static` section — an inert chip naming their plant, never a one-option control. The `FactorySelect` component itself survives only for non-toolbar surfaces (admin forms). |
| Empty-data placeholder | `EmptyState.jsx` | For page/section level. Table "no match" rows stay plain muted text. |
| Loading | `Skeleton.jsx` blocks for page/section data loads; `Loader2` spinner inside buttons for actions | Never bare `…` / "Загрузка…" text. |

Other UI conventions:

- Modal stacking: base modals z=50 (`Modal` default), nested modals pass `zIndex={60+}`, `ConfirmDialog` defaults to 100.
- Table-toolbar controls share ONE height — 38px, the `FilterPanel` trigger (`px-3 py-2 text-sm` + border). `SearchInput` default and `SegmentedToggle` md are also 38px. `Button` is the exception: md/sm are compact (≈30/26px) for modals & inline actions, so a toolbar action button must use **`size="lg"`** (38px) to line up with the filter/search controls next to it. All `Button` variants carry a border (transparent on borderless ones) so heights line up — don't strip it.
- `FilterPanel` (in `ColumnFilter.jsx`) is THE page/table filter zone. **Every page's scope controls (plant / shift / supervisor / leader / cell / category) live INSIDE it as sections — never as standalone selects stacked above the content.** The page bar is ONE row: the period control (`DateRangePicker compactLabel`, or `DayStepper` on daily pages) inline, then `FilterPanel`, then chips. It adapts to space: on md+ it unfolds into one dropdown per filter while the WHOLE toolbar row fits on a single line, else it collapses to the grouped «Filtrlar» button (below md: bottom sheet). Whenever controls are not visible inline, every ACTIVE section renders as a CHIP beside the trigger — `display` text + per-chip ✕ (`onClear`); chip body re-opens the panel; `static: true` sections are inert chips (locked viewer's plant). Sections: `{ key, icon, label, active, display, render({close}), onClear?, static? }` — `PickFilter` (single-select list, closes on pick), `OptsFilter` (multi), `RngFilter`, or an embedded `SegmentedToggle fill`. Omit `activeCount`/`anyActive`/`onClearAll` unless overriding — the panel computes them from sections. Keep it a DIRECT child of the toolbar flex row — the fit check measures that row's children (flex-grow spacers count as 0). View switches (tabs) stay OUTSIDE the panel; text search stays an inline `SearchInput`.
- All colors via CSS variables (`var(--bg-card)`, `var(--bg-inner)`, `var(--text-1..4)`, `var(--border)`, `var(--brand)`) — no hardcoded grays/hex for chrome, including on admin pages.
- No raw emojis — lucide icons in soft tint chips (see `ProjectIcon` in `Kaizen.jsx`).
- Status colors are traffic-light: red `#ef4444` / yellow `#eab308` / green `#22c55e`; "not started" is grey `#94a3b8`; brand gold `#C8973F` is an accent, never a status.
- Categorical chart colors (roles, units, products, people, series identities) come from `utils/chartPalette.js` `CATEGORY_COLORS`, assigned generic-first in this exact order: red → green → blue → yellow → orange → purple → teal → pink → … One fixed hue per category, reused across every chart that shows it; «Остальные/Other» folds are `FOLD_COLOR` slate. Brand gold NEVER represents a category (all pages except `/leaders`). Single-metric accents, status palettes, and value-intensity ramps are separate and may keep gold.
- Date-axis line/area charts never show fewer than 7 days — use `utils/chartRange.js`.
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
- **Supervisors and leaders are locked** to their own plant server-side
  (`resolve_factory` overrides whatever `?factory=` says). Hiding the tab is not
  the mechanism — the query parameter is typeable.
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
  supervisor assignment.

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
- **The password only ever goes to Telegram.** `web_auth.dm_credentials()` DMs
  every holder of the profile; it is never returned by an API, so running the
  Profiles tab never means learning someone's password. A profile with no
  approved holder therefore gets no login — the admin UI says so rather than
  offering one that could not be delivered.
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

## Workflow

- **`gitea` is THE remote** — `git.safiabakery.uz/Safia-Outsource/production` (private). `main` tracks `gitea/main`, so a bare `git pull` / `git push` means gitea. GitHub (`origin`) is a mirror only: it is pushed last, best-effort, and never gated on.
- **Pushing to `main` deploys to production.** `.gitea/workflows/deploy.yaml` runs `deploy/deploy.sh` on the VPS on every push — see the Deployment section below.
- **The whole loop is automated by two hooks in `.claude/settings.local.json`: pull → edit → build → commit → push.**
  - `SessionStart` → `.claude/hooks/auto-pull.sh` fetches gitea and **fast-forwards `main`** before anything is edited. It never merges or rebases: on a diverged branch, or when uncommitted work blocks the fast-forward, it reports and leaves the tree untouched. Log: `.claude/auto-pull.log`.
  - `Stop` → `.claude/hooks/auto-commit.sh` runs the Vite build, commits everything with a generated message, then pushes **gitea first** (that is the deploy) and the GitHub mirror after. A failed build aborts the commit; a failed mirror push is cosmetic and says so; a failed *gitea* push says `NOT deployed`. Log: `.claude/auto-commit.log`.
  - Net effect: **one turn = one commit = one production deploy**, with no staging step and no review window. Verify a doubtful build by hand with `cd frontend && npx vite build`.
  - The pull only runs at session start. If `main` moves on gitea mid-session the push at turn end is *rejected*, not silently merged — you will see `PUSH FAILED` in the summary; pull and re-run.
- `frontend/dist` is TRACKED and prod serves the SPA from it. Commit the build alongside the source — the pipeline rebuilds it for you if you forget, but committing it makes the deploy a no-restart, zero-downtime file swap.
- Backend changes need a service restart on prod (systemd `safia-production`, uvicorn — the cPanel/Passenger host is gone). The pipeline restarts automatically for `backend/**` and `bot/**`. Startup migrations still go in BOTH the FastAPI lifespan and `passenger_wsgi.py`, even though only the lifespan executes today.
- i18n: 4 languages (uz / uz_cyrl / ru / en). Static UI text via `t()` keys added to all 4; DB text via `tl()` transliteration.

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

## Context discipline

- Read only the files needed for the task. Don't sweep the tree or open files "to understand the codebase" — this document is the map. Use the UI-template table above to find the right component instead of grepping for it.
- When the user names a file or component, edit that one. Follow imports/types only as far as needed to make the edit correct, not to survey the project.
- Prefer targeted `Grep` for a specific symbol over reading whole files. Read the minimal region of a large file, not the entire file.
- If you think you need to read beyond the files the user named, ask first (one line) rather than exploring on your own.
- Reading a file immediately before editing it is expected and fine — the goal is to cut *exploratory* reads, not necessary ones.
