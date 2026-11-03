# Plan — the admin panel becomes an APP: every tab a page

**Status (2026-11-03): BUILT as the fallback in §3 — pages at `/panel/<id>`,
the API left where it is.** The operator, shown both URL schemes, chose
`/panel` («/panel is better, start implementing»), so Step 1 (moving the four
bare `/admin/*` routers under `/api/admin/`) and Step 3 (the Android bundle)
were NOT done, and the SPA/API split for `/admin` stays in its four places —
now only for the old address, which redirects. Everything in §4–§5 shipped
with `/panel` wherever this plan says `/admin/<id>`, and the live rules are in
CLAUDE.md «The admin app». The original plan follows unchanged, for the
record.

The operator: «treat the admin as a separate app, and treat these tabs as
pages». This is the structure of that separation — what moves where, what each
tab becomes, what the shared shell must learn, and the order it ships in. Read
on `main` at `94dfbbb` (v4.389.1); file:line references are from that commit.

---

## 1. Where it starts from

The launcher («Ilovalar», 2026-11-02) already has an **admin tile** — but it
is the one tile that opens a PANEL instead of an app. Every other tile opens a
page whose siblings the `Layout` sidebar lists; the admin tile opens
`/admin/upload`, and the page behind it (`pages/admin/AdminPanel.jsx`, 400
lines) draws a sidebar of its own, a bottom sheet of its own on phones, and
swaps 29 destinations by `?tab=`. The screenshot of 3 Nov is exactly this:
the app's sidebar says «Admin» once, and a second navigation inside the
content column says «Daily work · People & access · Tools».

| | today |
|---|---|
| Destinations | **29**, in 4 groups — Kunlik 3 · Odamlar va ruxsat 7 · Vositalar 17 · Xavfli 2 (`config/adminNav.js`) |
| Route | ONE: `/admin/upload`, destination in `?tab=` (App.jsx:705); `/admin` redirects to it (App.jsx:733) |
| Code | 24,266 lines under `pages/admin/` + `components/admin/actionlog/` — 29 destination components, 5 helpers, the shell |
| Bundle | ONE chunk, `AdminPanel-*.js`, **649 KB** raw — the second-largest file of the build after the dictionary; the shell imports every destination statically (AdminPanel.jsx:12-40), so opening «Users» downloads «Verifix sinxron» |
| Navigation | the shell's own grouped sidebar on `lg+`, its own portaled bottom sheet below (`NavSheet`); the app's ☰ drawer is NOT how you move between destinations |
| Identity | the header title is «Admin Paneli» on every destination; the destination names itself with an h2 + one-line description inside the column |
| Access | admins see all 29; a grantee sees the tabs their capabilities name — `capability_tabs` (capabilities.py:495) → 8 capabilities admit 11 tab ids (`cleanup users profiles shifttimes idlesource factories exam` + `leaders.admin` → `ltasks ltdaily ltexclude ltcutoff`); the other 18 are admin-only. `RequireAdminPanel` (App.jsx:397) lets a grantee into the panel on the same basis |
| Drafts | 14 destinations call `useAdminDirty(true)` and the shell interposes `ConfirmDialog` before a tab switch (AdminPanel.jsx:91) |
| Deep links | `?tab=` is two-way. **9 backend sites** print `/admin/upload?tab=…` (telegram_bot.py:586,603 · notification_center.py:249 · notif_queue.py:545 · ai_features.py:362 · verifix_sync.py:1677,1689 · catalog_follow.py:2093 · assistant.py:446), **15 frontend sites** navigate to it (§5.7), **11 CLAUDE.md headings** name it |
| Remembered | `localStorage.admin_tab` (AdminPanel.jsx:253) — the launcher's own `appLastPage` does the same job for every other app |
| The `/admin` namespace | SPLIT between SPA and API, and the split is spelled in **four places**: `sw.js:41` (`SPA_ADMIN`), Android `WebBundle.isServerPath` (WebBundle.java:135-140), `main.py:1065` + `main.py:1214` (middleware prefix tuples), `security.py:184` (`enforce_telegram_origin_admin`). Four routers still answer on bare `/admin/*` — `admin.py` (prefix `/admin`, 25 routes), `exam.py` `admin_router` (`/admin/exam`), `production.py` (`/admin/production/*`, 12), `leader_tasks.py` (`/admin/leader-tasks/*`, 37) — while every admin router written since lives at `/api/admin/<feature>` (ai, doc-audit, exchange-audit, idle-source, logs, notion-tracker, trello, verifix, verifix-sync) |

---

## 2. What «a separate app» means here — and what it does not

**It means the admin app behaves like the eleven others.** Its tile opens
the page it was left on; the `Layout` sidebar lists its pages, grouped as the
panel groups them today, under the app's slate label; each page has its own
URL, its own chunk, its own header title and its own browser-tab title; the
phone moves between pages with the app's ☰ drawer; the header search opens a
page, not a tab. The panel shell, its second sidebar and its bottom sheet go.

**It does not mean a second build.** No second `index.html`, no second Vite
entry, no second deploy. One sign-in, one language pack, one `Layout`, one
service worker precache list and one Android bundle all assume ONE shell, and
the lazy route chunks already keep admin code out of everyone else's
download — the split below makes that finer (29 chunks instead of one), which
is the only bundle change the operator's ask needs.

---

## 3. The one decision: the URL is `/admin/<page>`, and the API leaves `/admin/*`

Pages at `/admin/users`, `/admin/profiles`, `/admin/logs` … are the obvious
address — the tile is «Admin», the bot's buttons and twelve CLAUDE.md
headings already say `/admin/…`. Two things stand in the way, and both are the
same thing: the API lives there too.

- `GET /admin/users` (admin.py:46 + the users list) is an API route, so a
  browser navigating to the Users PAGE would be answered with JSON. The only
  single-segment collision today, but one is enough.
- The SPA/API split is spelled in four places (§1). Pages under `/admin/`
  would make each of them need the LIST of page slugs — `sw.js` to give the
  shell offline, the Android app to serve the bundle, the middleware to skip
  the no-store headers — a second copy of `ADMIN_NAV` in three languages,
  which is exactly the drift CLAUDE.md's «never a second parallel list» rule
  exists to prevent.

**Recommended: move the four bare routers under `/api/admin/…`**, where the
nine newer admin routers already are, THEN give the SPA `/admin/*` whole. The
split disappears from all four places instead of growing; `sw.js`, the Android
bundle and the middleware get simpler, not longer. Cost: ~75 frontend call
sites change `"/admin/` → `"/api/admin/` (mechanical), four routers change
their prefix, and the two halves ship as two deploys (§8) so no open tab
breaks. Nothing about any endpoint's behaviour changes.

*Fallback if the operator wants zero API churn:* pages at `/panel/<id>`, with
`/admin` and `/admin/upload?tab=…` redirecting there. No backend edit beyond
the printed links, but the four-place split stays forever and the URL no
longer says what the tile says. Everything else in this plan is the same.

---

## 4. The page register — `ADMIN_NAV` stays THE list

`config/adminNav.js` already holds order, grouping, icon, label, description
and capability key for every destination, and it is already in the boot
chunk (Layout → GlobalSearch imports it). **It stays the single source of
truth; nothing new is listed anywhere else.** Each entry's `id` becomes its
URL segment — the ids are unchanged, so `capability_tabs`, the bot's links and
every grant keep meaning the same thing.

| Group | id → URL | Component (unchanged) | Who |
|---|---|---|---|
| Kunlik ish | `attendance` → `/admin/attendance` | AttendanceUpload | admin |
| | `data` → `/admin/data` | DataSources | admin |
| | `production` → `/admin/production` | ProductionUpload | admin |
| Odamlar va ruxsat | `users` → `/admin/users` | UsersManagement (reads `?status=`) | admin · `admin.users.manage` |
| | `profiles` → `/admin/profiles` | ProfilesManagement | admin · `admin.profiles.manage` |
| | `factories` → `/admin/factories` | Factories | admin · `admin.factories.manage` |
| | `access` → `/admin/access` | PageAccess | admin |
| | `permissions` → `/admin/permissions` | Permissions | admin (never grantable) |
| | `actions` → `/admin/actions` | ActionHistory | admin |
| | `logs` → `/admin/logs` | Logs | admin (never grantable) |
| Vositalar | `broadcast` → `/admin/broadcast` | Broadcast | admin |
| | `ltasks` → `/admin/ltasks` | LeaderTasksAdmin | admin · `leaders.admin` |
| | `ltdaily` → `/admin/ltdaily` | LeaderDailyTasks | admin · `leaders.admin` |
| | `ltexclude` → `/admin/ltexclude` | LeaderDayExclusions | admin · `leaders.admin` |
| | `ltcutoff` → `/admin/ltcutoff` | LeaderCutoffs | admin · `leaders.admin` |
| | `exam` → `/admin/exam` | ExamAdmin (its own sub-tabs stay) | admin · `admin.exam.manage` |
| | `shifttimes` → `/admin/shifttimes` | ShiftTimes | admin · `admin.cell-hours.manage` |
| | `idlesource` → `/admin/idlesource` | IdleSource | admin · `admin.idle-source.manage` |
| | `idleowners` → `/admin/idleowners` | IdleOwners | admin |
| | `lostworkers` → `/admin/lostworkers` | LostWorkers | admin |
| | `docaudit` → `/admin/docaudit` | DocAudit | admin |
| | `verifix` → `/admin/verifix` | VerifixSettings | admin |
| | `verifixsync` → `/admin/verifixsync` | VerifixSync | admin |
| | `aikeys` → `/admin/aikeys` | AiKeys | admin |
| | `trello` → `/admin/trello` | TrelloSettings | admin |
| | `notiontracker` → `/admin/notiontracker` | NotionTrackerSettings | admin |
| | `translations` → `/admin/translations` | TranslationsEditor | admin |
| Xavfli | `cleanup` → `/admin/cleanup` | AttendanceCleanup | admin · `attendance.cleanup` |
| | `dbdump` → `/admin/dbdump` | DbBackup | admin |

The five helpers (`ReconcileView`, `VerifixParity`, `VerifixCellPicker`,
`CopyPermsModal`, `CriteriaTextsModal`) are imported by their pages and move
nowhere. `components/admin/actionlog/*` likewise.

---

## 5. Frontend

### 5.1 Routes — generated, not listed (App.jsx)

- `pages/admin/adminPages.js` — the ONLY new list, and it is the lazy map the
  router needs, keyed by the same ids:
  `{ attendance: lazyWithReload(() => import("./AttendanceUpload")), … }`.
  Twenty-nine lines; it carries no icon or label (those stay in `ADMIN_NAV`).
- `App.jsx` renders `ADMIN_NAV.map(n => <Route path={`/admin/${n.id}`}
  element={<AuthGate><AdminPage id={n.id} /></AuthGate>} />)`. A destination
  added to `ADMIN_NAV` without a page in the map is a build-time error in
  `AdminPage`, never a silent 404.
- `/admin` → `AdminHome`: an admin lands on `appEntry("admin")` (the page the
  app was left on, else `attendance`); a grantee on the first page their
  `capTabs` admit. Replaces the `/admin` → `/admin/upload` redirect.
- `/admin/upload` → `LegacyAdminRedirect`: `?tab=X` → `/admin/X` carrying every
  OTHER query param (`status=pending` must survive — the bot's registration
  button depends on it); no `?tab=` → `/admin`. **Permanent**, like
  `/brigadir-tasks` → `/tasks`: Telegram messages already sent hold the old
  URL for as long as the chat exists.
- `preloadOpenedRoute` (App.jsx:141): `first === "admin"` → preload
  `ADMIN_PAGES[second]`, the way `/cells/:id` preloads `CellDetails`.
- `ROUTE_PAGES.admin` (App.jsx:134) goes with `AdminPanel`.

### 5.2 The frame — `pages/admin/AdminPage.jsx` (replaces the shell)

One component, ~80 lines, that every admin route renders:

- **Guard** (what `RequireAdminPanel` did, per page): admin passes; while
  capabilities load, `<PageLoader where="caps" />`; a grantee passes when
  `capTabs` holds `n.capKey ?? n.id`; otherwise `<Navigate to={firstAllowed}
  state={{ denied: id }} replace />` — a grantee with NO admin page at all goes
  to `/`. The page that receives `state.denied` shows today's amber band
  (`admin.tabDenied`), so a deep link to a page you may not open still says so
  instead of snapping you somewhere unrelated (the 2026-10 rule).
- **Layout**: `<Layout title={t(n.labelKey)}>` — the header names the PAGE,
  as on every other page; «Admin Paneli» stops being the title of 29 screens.
  The sidebar's slate «Admin» label (§5.3) is where the app's name lives now.
- **Column**: the one `max-w-6xl` frame (the shell's «ONE content frame»
  rule, kept), opening with the destination's one-line description and the
  red «Xavfli» chip for `danger` entries, then `<Page />` under `Suspense`.
  The repeated h2 goes: the name is in the header.
- **Nothing inside the 29 destination components changes.** They already
  render no frame of their own (CLAUDE.md «Admin panel structure»), so they
  are pages the moment the frame is one component instead of one shell.

### 5.3 The sidebar learns two things (`components/layout/Sidebar.jsx`)

1. **Groups inside an app.** Today `grouped = !app && links.length >
   GROUP_THRESHOLD` (Sidebar.jsx:99): an app's pages are always one flat list.
   The admin app has 29 pages in four groups, and a flat list of 29 is the
   «structured awfully» the panel was built to end. The `APPS` entry for
   `admin` gains `sections: ADMIN_GROUPS`, each derived link carries
   `section: n.group`, and the sidebar's grouped renderer runs on
   `app.sections` when the open app has them (folders, accordion, the rail
   dot — all of the existing grouped mode, nothing new drawn). A section with
   `danger: true` renders its folder header red with the triangle, as the
   panel's nav does today. Apps without `sections` are untouched.
2. **A grantee's admin pages join their own list.** Today a non-admin holding
   a tab sees a «Admin» link in the sidebar FOOTER (Sidebar.jsx:470) and the
   panel then filters. Now the admin links a grantee's `capTabs` admit are
   filtered into their ordinary `links` (`l.tab ? isAdmin ||
   capTabs.includes(l.capKey ?? l.tab) : …` beside the `adminOnly` test at
   Sidebar.jsx:94) under a new `NAV_GROUPS` section `admin` («Admin»,
   `Settings` icon) placed before `system`. A one-tab grantee sees one row
   with that page's own icon — the footer row it replaces, with a better
   name; a top-manager holding several sees an «Admin» folder. The footer
   link is deleted; `showAdminPanel` goes with it.

`utils/apps.js`: `ADMIN_LINKS = [...ALL_LINKS…, ...adminLinks()]` where
`adminLinks()` derives `{ to: "/admin/"+id, key: labelKey, icon: Icon, app:
"admin", group: "admin", section: n.group, tab: id, capKey, danger }` from
`ADMIN_NAV`. `ADMIN_PANEL_LINK` (navLinks.js:148) is deleted. `appOfPath`,
`rememberPage`, `appEntry` work unchanged — `/admin/users` is simply the
longest matching link of the `admin` app, and the tile opens the page the
admin left, which is what `admin_tab` did for the panel. `admin_tab` is
dropped (one stale localStorage key, harmless).

### 5.4 The draft guard moves up one level

`useAdminDirty` lives in the shell and only the shell's own nav asks it; with
pages, the things that navigate away are the app's sidebar rows, the header
search, the apps button, the logo and the launcher tile — all in `Layout`.
`BrowserRouter` has no `useBlocker` (data routers only), so:

- `hooks/useLeaveGuard.js` — `useLeaveGuard(isDirty)`, the same hook under
  the name it now deserves; `AdminPanel`'s `DirtyCtx` becomes a context
  provided by `Layout`. The 14 callers change one import line.
- `Layout` renders the `ConfirmDialog` (the existing `admin.unsavedTitle /
  unsavedMsg / unsavedDiscard` strings — no new keys) and exposes
  `guardedNavigate(to)`; `Sidebar`'s `renderLink`, the footer logo link,
  `GlobalSearch`'s pick, the `.hdr-apps` button and `AppLauncher`'s tiles
  call it instead of navigating directly (a `NavLink` keeps its href; its
  `onClick` asks first and `preventDefault`s while a draft is pending).
- Coverage is exactly today's: the shell never guarded the back gesture
  either (a `?tab=` pop unmounts the view with no confirm). Covering
  back/forward means `createBrowserRouter` + `useBlocker`, a router migration
  this plan deliberately does not include (§10). `beforeunload` is not added:
  Telegram's WebViews ignore it (the `pagehide` note in useWatchTracker.js:146).

### 5.5 Header search, tab title, activity — one line each

- `GlobalSearch.jsx:128`: `to: \`/admin/${n.id}\`` — the «admin tabs» kind
  becomes the admin app's pages; its group label and ranking stay.
- `DocumentTitle.jsx:59`: `/admin/<id>` → `ADMIN_NAV`'s `labelKey`, so the
  browser tab reads «Safia IMS · Foydalanuvchilar» instead of «· Admin». The
  comment at :55 that forbids importing `ADMIN_NAV` here is stale since
  2026-10-31: the search already put it in the boot chunk.
- `useActivityPing` records the pathname, so the activity page starts seeing
  `/admin/users` instead of one `/admin/upload` for every destination — a
  reading gain, nothing to change.

### 5.6 i18n — no new keys

`admin.tab*` become the links' `key`, `admin.desc.*` the frame's line,
`admin.group.*` the section headers, `nav.admin` the app label and the
grantee's section, `admin.tabDenied` and `admin.unsaved*` as today.
`admin.title` («Admin Paneli») loses its last reader and can be deleted in
the same change, or kept — the dictionary editor does not mind.

### 5.7 Deep links — 15 frontend sites, mechanical

| File | today | after |
|---|---|---|
| components/assistant/AssistantPanel.jsx:187, pages/Assistant.jsx:73, components/leaders/AiTriage.jsx:443 | `/admin/upload?tab=aikeys` | `/admin/aikeys` |
| components/verifix/VfxState.jsx:38 | `?tab=verifix` | `/admin/verifix` |
| components/overview/ShiftReportTable.jsx:341 | `?tab=production` | `/admin/production` |
| pages/Profile.jsx:1774, :1995 | `?tab=profiles` | `/admin/profiles` |
| pages/Ontime.jsx:306 | `?tab=data` | `/admin/data` |
| pages/TrelloAnalytics.jsx:171, :257 | `?tab=trello` | `/admin/trello` |
| pages/BroadcastRecord.jsx:166, :207, :228 (keeps its `state`) | `?tab=broadcast` | `/admin/broadcast` |
| pages/admin/PageAccess.jsx:139 | `?tab=permissions` | `/admin/permissions` |
| components/ui/EmptyState.jsx:39 | `/admin/upload` | `/admin` |

The old addresses keep working through §5.1's redirect; these edits only stop
the app bouncing through it.

### 5.8 What disappears

`pages/admin/AdminPanel.jsx` (shell, `NavItem`, `NavGroups`, `NavSheet`,
`VIEWS`, `DirtyCtx`), `ADMIN_PANEL_LINK`, the sidebar footer's admin row,
`localStorage.admin_tab`, the `/admin` → `/admin/upload` redirect, and the
649 KB `AdminPanel` chunk — replaced by 29 chunks, each the size of its page.

---

## 6. Backend

### 6.1 Step 1 — the four bare routers move under `/api/admin/…` (invisible)

- `admin.py:46` prefix `/admin` → `/api/admin`; `exam.py:28` `admin_router`
  prefix `/admin/exam` → `/api/admin/exam`; `production.py` and
  `leader_tasks.py` — every `/admin/production/…` and `/admin/leader-tasks/…`
  decorator path gains the `/api` prefix (12 + 37 paths, a one-line sed each
  file). Handler bodies, models, permission checks: untouched.
- The frontend's ~75 call sites (`"/admin/` → `"/api/admin/`; heaviest:
  LeaderTasksAdmin 26, ExamAdmin 9, ProductionUpload 6, Production.jsx 5, and
  the leaders' `DaySubmissionModal`, `BotDataClear`, `ProofPhoto`,
  `ChecklistTaskSheet`) change in the same deploy. The exam write-guard in
  `utils/api.js:98` keeps its `/admin/` clause until step 2 for the same
  reason the server does.
- **A stale bundle in an admin's hand must keep working** between this
  deploy and the next reload, so a ~12-line pure-ASGI middleware (beside the
  two that already name the prefixes, main.py:1060) rewrites any request to
  `/admin/<x>` onto `/api/admin/<x>` — except `GET /admin/upload`, the SPA's
  only remaining address there. TEMPORARY, deleted in step 2.
- `_admin_guard` (main.py:1247) and `security.enforce_telegram_origin_admin`
  become redundant the moment the routes are under `/api/*`, which the global
  initData dependency already covers: drop the four `dependencies=` and the
  function. `_API_PREFIXES` / `_PREFIXES` keep `"/admin"` until step 2 (the
  rewrite still answers there).

### 6.2 Links the server prints — 9 sites, step 2

`/admin/upload?tab=X` → `/admin/X` in telegram_bot.py:586,603 (`&status=
pending` kept), notification_center.py:249 (`f"/admin/{sid}"`),
notif_queue.py:545, ai_features.py:362, verifix_sync.py:1677,1689,
catalog_follow.py:2093, assistant.py:446 (`moved_to`). Docstrings naming the
old path (trello.py:2, verifix.py:1, verifix_sync.py:1, permissions.py:204)
follow. Buttons already sent keep working through the redirect.

### 6.3 Step 2 cleanup

The rewrite middleware goes; `"/admin"` leaves both prefix tuples (index.html
is `no-store` from `serve_spa` regardless); `api.js:98` drops its `/admin/`
clause. From here `/admin/*` is the SPA's and `/api/*` is the server's, with
no list anywhere saying which is which.

### 6.4 Unchanged

`capabilities.py` — the catalog's `"tab"` fields and `capability_tabs` keep
their ids and their name (the id IS the page; renaming «tab» to «page» across
the backend is churn with no behaviour). `permissions.py`, every endpoint's
request and response, the DB, the bot's own screens.

---

## 7. Service worker and the Android bundle

- `frontend/src/sw.js:41-47` — `SPA_ADMIN` and the `/admin` clause of
  `passThrough` are deleted in step 2: `/api/` is already in `NEVER_CACHE`,
  and every `/admin/*` navigation now deserves the shell. The precache list is
  unchanged (it is built from `dist/assets`, which gains the 29 chunks by
  itself).
- `android/…/WebBundle.java:135-140` — `isServerPath` drops its `/admin/`
  clause (step 3, needs an app release). Until that release an Android admin
  opening `/admin/users` is served `index.html` by the SERVER (the catch-all),
  so the page works online and simply is not bundle-served offline — a
  degradation confined to admins on the Android app, not a break.

---

## 8. Rollout — three deploys, each a MINOR

| Step | VERSION | ships | visible? |
|---|---|---|---|
| 1 — «Admin API under /api» | 4.390.0 | §6.1 (four routers, ~75 call sites, the rewrite, the guard removal) | no — every screen behaves as before; `curl /admin/users` and `curl /api/admin/users` answer the same |
| 2 — «Admin app: every tab a page» | 4.391.0 | §4–§5, §6.2–§6.3, §7's sw.js, CLAUDE.md (§9) | yes — the tile opens pages; `/admin/upload?tab=…` redirects |
| 3 — Android | 4.391.x | `WebBundle.isServerPath` | no |

Step 2 ships **no sooner than the day after step 1**, and only once the
activity page shows no tab still pinging a version below 4.390.0: at step 2
the rewrite is gone, and a bundle from before step 1 that is still open would
get `index.html` for its admin API calls. The people it could reach are
admins with a tab open since the previous day, which the versioning test in
CLAUDE.md classes as confined — a MINOR — but a day's wait makes it nobody.

Both halves pass the MAJOR test's first question with «no»: a redirect is a
landing place (`/brigadir-tasks` → `/tasks`, v4.46.0, the precedent), and
the rewrite is the landing place for the API.

## 9. CLAUDE.md, in step 2

- «Ilovalar»: the admin tile is no longer «a one-page app»; `ADMIN_PANEL_LINK`
  and «the panel is a tile» go; `sections` on an app documented.
- «Admin panel structure» → «The admin app»: the frame, the guard per page,
  the sidebar's sections, the grantee's rows, `useLeaveGuard`, the redirect.
- «Qidiruv»: «admin tabs → `/admin/upload?tab=…`» → «admin pages → `/admin/…`».
- The 11 headings that name `/admin/upload?tab=<id>` (shifttimes, idlesource,
  ltasks, ltdaily, ltexclude, ltcutoff, production, logs, verifix, attendance,
  aikeys) → `/admin/<id>`.
- A note under «Versioning»'s examples is not needed; the two steps are
  ordinary MINORs.

## 10. Deliberately unchanged / not built

- **No second build or deploy** (§2).
- **No router migration.** `createBrowserRouter` + `useBlocker` would guard
  the back gesture too; it rewrites 764 lines of `App.jsx` for a case the
  panel never covered either. Its own plan, if ever.
- **The backend keeps saying «tab»** for the capability ids (§6.4).
- **ExamAdmin's inner sub-tabs** (`exam_admin_tab`) stay inside its page.
- **The launcher for other roles** and **per-app language packs** — the
  «Not built» of the launcher section, still not built.
- **Badges on admin rows.** The Users page could carry the pending
  registrations count the bot already links to — one line in the sidebar's
  `BADGES` map and one on the tile, later, if the operator wants it.

## 11. Test plan (manual; the frontend has no test runner)

- **Admin**: the tile opens the page the app was left on; all 29 URLs open
  by address; the sidebar shows four folders with the active one open and
  «Xavfli» red; the header names the page; the browser tab too; ☰ on a
  phone lists the same folders; the search's «Admin» group opens pages;
  `/admin` lands on the remembered page; a fresh browser lands on
  `/admin/attendance`.
- **Redirects**: `/admin/upload?tab=users&status=pending` → `/admin/users?
  status=pending` with the Pending filter applied; `/admin/upload` → `/admin`;
  a bot registration button from BEFORE the deploy still opens Users.
- **Grantee** holding only `admin.users.manage`: one «Foydalanuvchilar» row
  in their sidebar, `/admin` lands on it, `/admin/logs` shows the amber band
  on Users; holding `leaders.admin`: four rows; holding nothing: `/admin` →
  `/`.
- **Drafts**: edit a translation, click another sidebar row → the confirm;
  cancel keeps the draft, discard navigates; the same from the search and
  the apps button.
- **Bundle**: `npm run build` lists no `AdminPanel-*.js`; 29 page chunks;
  opening Users downloads only its own.
- **Step 1 on its own**: `pytest`; `curl -I /admin/users` and
  `/api/admin/users` answer alike (401 without initData, like any API);
  the leaders' checklist admin, SAP upload, exam results, DB dump and
  `/admin/refresh-sheet/leaders` (the exam write-guard's example) all work
  from the new bundle.
- **Android** on a build before step 3: admin pages open online.

## 12. Size

| | files | lines, roughly |
|---|---|---|
| Step 1 | 4 routers (prefix/sed) · main.py (rewrite + 4 dependencies) · security.py · ~30 frontend files (string edits) | +40 / −20 backend; ~75 one-token edits frontend |
| Step 2 | App.jsx (−25 +35) · `adminPages.js` (+30) · `AdminPage.jsx` (+80) · Sidebar (±60) · navLinks + apps.js (±30) · Layout (+40, the guard) · `useLeaveGuard.js` (+25) · 14 pages (import line) · GlobalSearch, DocumentTitle (2 lines) · 15 deep-link edits · sw.js (−8) · 9 backend link sites · CLAUDE.md · **−400** AdminPanel.jsx | net ≈ −100 |
| Step 3 | WebBundle.java | −2 |
