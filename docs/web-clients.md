# The browser door, the PWA, the boot path and offline mode

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

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
- **Lifetimes**: 12 hours unticked (sessionStorage), 30 days with «remember
  me» — in a browser. The Android app signs in for good (a year, renewed
  daily); see «The app stays signed in» under «The Android app».
- **`token_version` is the revocation handle.** Bump it to end every browser
  session for a profile (password change, reset, disable, rename, admin
  "sign out everywhere"). Telegram sessions never carry it.
- **A token whose identity went stale is RE-ISSUED on the next page load**
  (2026-10-02). Every API call is answered from the claims INSIDE the token
  (`role_id`, `role_ref`, `full_name`, `sub`), and renaming a leader or moving
  them to another unit rewrites the profile and its registration rows — never
  a token already issued. `/api/auth/web/session` re-derived only the PAYLOAD,
  so the header showed the new name while every page asked as the person at
  sign-in, for up to 30 days: a renamed leader's cell PC read «Sizga yacheyka
  biriktirilmagan» over an assigned cell, and an admin's «open as» (a fresh
  token) could not reproduce it. Now `/session` compares the token with
  `session_identity` (`web_auth.stale_claims`) and, when they differ, returns
  `token` from `web_auth.reissue_web_jwt` — the current identity with the old
  token's `exp`, `app`/`iat` and `imp` carried over, so a re-issue never extends
  a session — and the boot in `AuthContext` swaps it in (same store, wallet row
  updated). Logged as `WEB-LOGIN claims_refreshed`. Until that reload a leader
  is still resolved right: `identity.viewer_profile_key` finds the registration
  the token names (`role_ref`) BEFORE narrowing by the token's unit, and
  `concerns._own_profile`, `cell_concerns._leader_cells` and
  `worker_concerns._viewer_scope` go through it instead of matching the
  token's (unit, name) themselves — never add a fourth such match.
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
  nearly every chunk that imports it). From v4.324.1 the build stamp is out of
  the chunks (see «A deploy renames only what changed»), so a deploy with no
  frontend change renames nothing; a translation or shared-module edit still
  renames most of the graph. The one knob left here is the precache list
  `emitServiceWorker` writes — shrink it to the entry graph and let the rest
  cache on use if that cost ever matters.
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
  (Pillow — `backend/venv/bin/python scripts/render-icons.py`), all of them
  together — the four PWA icons, `favicon.ico`, the two PNG favicons and the
  apple-touch icon. From **2026-10-13** `logo.png` is the Safia IMS EMBLEM
  (the mascot inside a gold gauge ring, a bar chart in the ring's opening,
  on the site's ink `#0F1117`, transparent outside its inscribed circle):
  192/512 `any` keep those transparent corners (the favicon look), 192/512
  `maskable` put it on INK scaled to the 80% safe zone, the apple-touch icon
  is flattened onto ink. Never hand-edit one of them; re-run the script,
  which also deletes the previous tag's files — the outputs carry a suffix
  (`-v2`) that the manifest, index.html and `ROOT_STATICS` name, and a
  re-render bumps it (see the Cloudflare note). The sidebar / loader / login
  copy is `assets/logo-chrome.png` (192 px, palette-quantised, inlined).
  **The light theme has its own drawing** (2026-10-14): the same script
  derives it — the ink ground band becomes cream `#F4EAD9` (the brand gold at
  20% on white), every gold amount kept (the faded track stays gold-over-the-
  ground), the white bar turns light `--text-1` ink; the mascot and the gold
  disc are untouched — into `assets/logo-chrome-light.png` and
  `public/logo-light-v2.png` (the ES5 boot screens, through `palette().logo`).
  `components/ui/BrandLogo.jsx` is THE in-app logo: it renders both drawings
  and index.css shows the one for `data-theme` (CSS, never `useTheme`, so it is
  right from the first frame and outside every provider). Never put a bare
  `<img src={logoChrome}>` in the chrome again.
- An installed iOS app keeps its own storage, so the login is entered once
  more there; nothing else about the session model changes (`webSession`, the
  profile wallet and the JWT are exactly what the browser tab holds).
- Not built, on purpose: push notifications (Telegram is the notification
  channel), an offline data layer (every page is live data; `ProofCamera`'s
  upload queue is the one offline flow and predates this), and a Workbox
  dependency — the worker is ~140 lines whose every rule is stated above, and
  `vite-plugin-pwa` would have added a peer-dependency risk to a pipeline whose
  `npm ci` is a deploy.

## What a page load waits on — the boot path (2026-10-23)

The operator: «IT companies always find a way to reduce the load times». Every
page load used to wait through five steps IN A ROW — the app code (with all four
UI languages inside it) → the sign-in → /api/page-access + /api/my-capabilities
→ the page's own code → the page's data — each a network round trip through
Cloudflare. Four changes, all on the path EVERY page shares:

- **One language per reader.** `src/i18n/translations.js` stays THE file people
  edit (all four languages, one object literal — `const t = { … }; export
  default t;`, which the build plugin enforces), but it is no longer shipped
  whole: `i18nPacks()` in `vite.config.js` cuts it into `virtual:i18n/<lang>`
  modules (`{own, uz, en}` — the language plus whatever LangContext's fallback
  chain would take from Latin Uzbek and English), emitted as `JSON.parse('…')`.
  `src/i18n/packs.js` loads the reader's one; `main.jsx` renders after it
  arrives; an inline script the plugin injects into `index.html` starts its
  download (a `modulepreload`, which also puts it in the boot watchdog's view)
  before any app code runs. Boot JS went from ~2.7 MB to ~1.0–1.2 MB (the shared
  chunk that carried the dictionary, 2.1 MB → 23 KB). **Never import
  `translations.js` from anything a page load runs** — only the admin
  translations editor reads it, through `loadDictionary()` (`i18n/packs.js`)
  when its tab opens. A language switch loads the new pack FIRST, then moves
  `lang`.
- **A pack's file name lives only in `index.html`** (2026-11-03). The packs
  used to be `import("virtual:i18n/<lang>")`ed from `packs.js`, which wrote
  their names into the shared chunk ~220 others import — and a chunk's name
  hashes the names it imports, so ONE new UI string renamed ~234 of ~250
  build files and every phone re-downloaded the app (v4.389.0 did, for three
  strings). Now the build emits the four packs and the whole dictionary
  (`all`, the editor's) as chunks of their own, the plugin's inline script
  publishes their names as `window.__i18nPacks`, and `virtual:i18n/loaders` —
  what `packs.js` imports — reads them from there (dev keeps plain imports).
  A new string now renames those five files plus `index.html`, `sw.js` and the
  build lists, nothing else. **Never import `virtual:i18n/<lang>` or
  `translations.js` directly**: the `i18n-packs` plugin's `generateBundle`
  fails the build if a pack's name lands in any other chunk. The packs are
  emitted with `preserveSignature: 'strict'` — an app build otherwise strips an
  entry's exports, and a pack is nothing but its default export.
- **Not fixed: a page change still renames ~118 files.** The entry chunk
  names every lazy page (and Vite's preload map), and ~110 chunks import the
  entry for the shared code Rolldown put in it — so any change to any page's
  code renames the entry and all of those. Measured 2026-11-03 (one line added
  to `Kaizen.jsx` → 118 renamed); a backend-only deploy renames none.
- **The sign-in answer carries the permissions.** `/api/auth/webapp`,
  `/api/auth/web/session`, `/web/login` and `/web/impersonate` add `boot:
  {page_access, capabilities}` (`routers/settings.boot_extras`, through
  `routers/auth.with_boot`; the two GET endpoints answer from the same
  `page_access_payload` / `capabilities_payload`, so they cannot disagree), and
  `AuthContext.seedBoot` puts them in the query cache under the keys
  `usePageAccess` / `useCapabilities` read. A failure there never fails a
  sign-in — the hooks then fetch for themselves, as before.
- **The opened page's code downloads during the sign-in.** `lazyWithReload`
  gives each page `.preload()`; `ROUTE_PAGES` in `App.jsx` maps a path's first
  segment to its page and `preloadOpenedRoute()` fetches it at boot. «/»
  preloads the page a role without the overview is redirected to (remembered in
  `localStorage.homeRoute` by `RequirePage`). **A new page belongs in
  `ROUTE_PAGES`** — a page missing there still works, one round trip slower.
  The chunk-failure recovery both use is `utils/importRecovery.js`.
- **Inter is served from this site** (`src/assets/fonts/`, four subsets —
  Latin, Latin-ext, Cyrillic, Cyrillic-ext — under `unicode-range`, `@font-face`
  in `index.css`, SIL OFL in `OFL.txt`), not Google Fonts: that stylesheet was a
  render-blocking request to two more hosts before the first paint.

**The three slowest pages, 2026-10-24** (the operator named /staff, /leaders
and /zagruzka; measured on a copy of the 11 Sep production data):

- **/leaders fetches only the days it can show** — `GET /api/leaders?from=`.
  The register went back to 1 April (~20 MB on production, 6 MB on the
  September copy) and every visit downloaded, parsed and scored all of it to
  show one week. The kept build now holds its rows grouped by day
  (`leader_register.encode_days`, newest first — the rows were already sorted
  so), so a window is the front of that list and costs nothing to cut; without
  `from` the answer is byte-identical to before (the exclusion and cutoff admin
  tabs still ask for everything). `data_min` / `data_max` name the whole
  register's span. The page asks from `weekStartISO(startDate − (period + 6))` —
  the Δ chip's previous period and the sparkline's trailing window are the
  deepest it reads — and the window only WIDENS within a visit; an open start
  date asks for the whole history. **Anything new on the Monitoring tab that
  reads further back than that must widen `needFrom` in `Leaders.jsx`.**
- **The /leaders tab badges ask `?status=admin`** — the bare objection /
  late-proof lists are every open appeal plus the newest few hundred settled
  ones with verdicts and notes, downloaded on every visit to count a handful.
- **/staff asks for the unit's day and the live floor side by side**, and
  fetches no table until the day is known (`waitDay` in `Staff.jsx`; the Workers
  tab shows its skeleton meanwhile) — before, `/staff-live/today` waited for
  `/staff-live/live-from`, and the page fetched the date it showed LAST time
  first and the real day after it.
- **/api/heatmap answers are KEPT** (`services/kept_answer.py`, the shift
  report's rule made reusable): as they stand for 60 s, then served at once for
  up to 5 min while one fresh build runs behind them, never to a viewer who
  changed something since (`leader_register.last_write`). /zagruzka and
  Overview both read it. A change made by a background job (the live day's
  minute re-copy, a SAP upload) therefore reaches /zagruzka within one refetch,
  not at once.

## The app works OFFLINE on what it loaded last (`offlineCache`, `connectivity`)

From **2026-10-16** (the operator: «save caches like Instagram does — it should
show the things loaded when it was online even if there's no single connection
to the internet») every page's last answer is kept ON THE DEVICE and shown
when the server cannot be reached, and the app itself opens with no connection
on the identity it was last signed in with. Reads only: nothing a person
changes is queued — a write made offline fails and says so.

- **`utils/offlineCache.js` is THE store** — one IndexedDB (`safia-cache`,
  store `rows`), two kinds of row. `queryPersister` is the query client's
  default `persister` (App.jsx), so EVERY `useQuery` takes part without
  knowing it: a successful answer is written (one row per query, deferred
  past the paint, at most one write per key per 5 s), and a query that mounts
  with nothing in memory is first answered from the device — with the stored
  answer's own `dataUpdatedAt`, so it re-reads from the server at once when
  that makes it stale — exactly as react-query already treats data a page
  still holds in memory. Deliberately not the TanStack persist plugin, which
  re-serialises the WHOLE cache on every change (the /leaders register alone
  is ~20 MB); here one query moving costs one row.
- **Rows are SCOPED to the profile** (`setCacheScope` / `adoptCacheScope`
  from the session payload; `profile_key`, else role · ref · account) — a
  wallet switch or a colleague on a shared PC is never handed the previous
  person's pages — and **signing out clears them** (`clearCacheScope`, both
  doors in `AuthContext.logout`). An impersonated «open as» tab has no scope
  and caches nothing. **Nothing is stored or restored during an exam**: the
  sandbox is reached under the SAME query keys.
- **A row is trusted for 7 days and for the MINOR it was written under** —
  the version is in the KEY (`q|4.285|<scope>|<queryHash>`), because a
  payload's shape moves with a release and a page handed last week's shape can
  crash on a field it expects. Other versions' rows are purged by key, values
  never loaded. Only JSON is stored (a Blob — photos, workbooks — is not);
  `meta: { persist: false }` opts a query out; `DENY` lists the keys that must
  never come from yesterday (`build-info`, `exam-me`, `assistant`).
  `cacheable(query)` is that test on its own — the band counts the sections
  still waiting offline over exactly these, so a denied key never reads as a
  section the reader is missing.
- **Every read is BOUNDED (2 s) and the first failure turns the cache off for
  the session**: the read sits inside the query's own fetch, and an IndexedDB
  that hangs (a WebView in a locked-down mode) may cost one slow request,
  never every page. No IndexedDB at all = no cache, nothing else changes.
- **The boot survives offline too** — the browser PWA (the service worker
  holds the shell) and the Android app (the pages are in the APK). The answer
  of `/api/auth/web/session` is kept as the BOOT payload (`saveBootPayload`,
  the token itself never stored), keyed by the token's claims (role · ref ·
  account — stable across the app's daily renewals and a re-issue) and
  re-written after every renewal. When the session check gets no answer (or a
  5xx past the restart wait), `AuthContext` opens on that payload, marks the
  app down, and re-asks the server the moment the connection is back
  (`recheckSession`: a 401/403 then signs out as it always did). No payload
  for this token → the «Aloqa yo'q» screen, as before. Telegram is unchanged
  at boot (a mini app cannot load its shell offline) but its pages restore
  and persist like everybody's.
- **`utils/connectivity.js` is THE answer to «can we reach the server»** —
  `navigator.onLine` cannot give it (true on a Wi-Fi with no internet). A
  request that fails with NO answer (`isNetworkError`: axios ERR_NETWORK, a
  fetch that threw — never a cancel) marks the app DOWN (`reason` network),
  any answer of any status marks it UP (api.js interceptors); while down,
  `/health` is probed every 10 s and at once on `online`, on focus and on the
  page returning to the screen (/health is a server path for the service
  worker and the Android bundle alike). A 5xx at BOOT is `reason: server`,
  lifted only by an answer < 500 — nginx's own 503 fallback must not read as
  the server being back.
- **The query client's rule (App.jsx)**: a network failure is retried for as
  long as it lasts (`retry: true` for it, every `OFFLINE_RETRY_MS` = 5 s while
  down, the usual backoff otherwise) and never becomes an error — a page
  keeps what it has, one with nothing keeps its skeleton; any other failure
  keeps the single retry it always had. **`networkMode: "always"`** on queries
  AND mutations: react-query's own pause follows `navigator.onLine`, a paused
  pending query reads as «loaded, empty» to the pages, and a paused mutation
  would FIRE LATER when the connection returns — an approval replayed behind
  the person's back. Back online after ≥ 3 s down, every active query is
  invalidated (a query sleeping between retries is cancelled and sent now).
- **`components/layout/OfflineBand.jsx`** sits under the header, under
  `ExamBand`: «Internet yo'q» / «Server bilan aloqa yo'q» · since HH:MM ·
  «oxirgi yuklangan ma'lumotlar ko'rsatilmoqda — o'zgartirishlar hozircha
  saqlanmaydi» · «N ta bo'lim hali yuklanmagan» (active queries still pending
  with nothing cached) · «Qayta urinish» (a probe now). Green «Aloqa tiklandi
  — ma'lumotlar yangilanmoqda» for 3.5 s on recovery. A band, not a Toast: a
  state the reader keeps in mind, and the top right holds the update prompt.
- **Consequences to know.** Online, a page now opens on its LAST data and
  refreshes behind it (stale-while-revalidate across reloads, not only within
  the 5-minute in-memory window) — a number can be a minute old for the
  second it takes to refetch. A page that fetches with its own `useEffect` +
  `api.get` (a dozen call sites) is not cached. Pages that render their error
  state ahead of their data never reach it offline (no error is raised), but
  a long outage with the server ANSWERING 5xx still ends in the error state
  it always did. Avatars and photos are not cached here (Blobs).
- Not built, by decision: queuing writes for later (dangerous on approvals and
  attendance), a Web Worker for the serialisation (CSP), caching photos.
