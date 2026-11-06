# The Android app

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## The Android app (`android/`)

From **2026-09-28** (the operator's go-ahead) the platform ships an Android app
— «Safia IMS», package **`uz.safiacorporate.ims`** — that carries the site's
PAGES INSIDE THE APK and shows them in its OWN web view. Only the data comes
from the server. No Chrome anywhere: the operator rejected the first design (a
Trusted Web Activity, 1.0.x) because it runs visibly "in Chrome", and then
chose, over a live-loading web view, **today's pages built into the APK**. From
**1.2.0** (the same day, the operator's pick: "we make a lot of small changes
daily") **the app downloads every build the site deploys by itself** — see
«The pages follow every deploy» below. A new APK is needed only when
`android/` changes.

- **One origin, and the site does not change.** `MainActivity` points its web
  view at `https://production.safiacorporate.uz` and `WebBundle` answers that
  origin's page requests from the phone — the copy built into the APK
  (`assets/web`, every file of the committed `frontend/dist`) or a build
  downloaded since — while every SERVER path goes over the network:
  `/api`, `/bot/`, `/.well-known/`, `/health`, `/docs`, `/openapi.json`, and
  `/admin/…` except the SPA's own `/admin/upload` (`WebBundle.isServerPath`,
  the twin of `SPA_ADMIN` in `src/sw.js` — **move them together**). Any other
  page address serves `index.html`. So relative URLs, `localStorage`, the JWT
  and the session work exactly as in a browser, no CORS rule exists or is
  needed, and `inTelegram()` is false: the app is the BROWSER door — people
  sign in with their «Sayt logini».
- **The bundle must BE what production serves.** `app/build.gradle`'s
  `bundleWeb<Variant>` copies `frontend/dist` (minus `sw.js`) and REFUSES to
  build unless its `build.json` stamp equals the live
  `https://production.safiacorporate.uz/build.json` — the pages talk to that
  server's API, so a copy of anything else (an undeployed local build, a
  checkout behind main) would be a combination nobody has run.
  `SAFIA_ALLOW_UNDEPLOYED=1` overrides it on purpose only. **So an APK is
  built right AFTER a deploy lands** (or right after pushing the commit being
  deployed, with the override, when no CSP change rides with it). It also
  refuses a dist without `build-files.json` for its own build. The same task
  reads the live Content-Security-Policy header into `assets/csp.txt`, and
  `WebBundle` sends it with the built-in `index.html` — the policy frozen with
  the pages it was written for.
- **No service worker, ever** — `app-bridge.js` refuses the registration and
  `MainActivity.blockServiceWorkers` 404s every worker fetch. A worker fills
  its cache from the SERVER and would serve that in place of the app's own
  pages: two builds in one app, silently.
- **The pages follow every deploy** (`PageUpdates.java`, 1.2.0).
  - **The build publishes its files**: `emitFileList` in `vite.config.js`
    writes `dist/build-files.json` in `closeBundle` (after build.json, sw.js
    and public/ are on disk) — every file with its SHA-256 and size. Served
    no-store by `serve_spa` like `build.json`, kept in git by a `!` line in
    `.gitignore`. Ignored or stale, no phone updates.
  - **The download**: while the app is ON SCREEN, `PageUpdates` asks
    `/build.json` 3 s after it opens, on every return to it (≥ 60 s apart) and
    every 5 min. A build the phone does not hold → `/build-files.json` (it must
    name the same stamp, or the site was deployed again mid-way), then ONLY
    the files whose SHA-256 the phone lacks — built-in and earlier downloads
    are reused — into `files/web/blobs/<sha>`, each one hash-checked.
    `index.html` is always fetched from `/`, whose answer carries the new
    build's CSP. A path that is not content-hashed gets `?b=<sha>`: Cloudflare
    caches those by extension under fixed names. **Cloudflare Web Analytics
    inserts a beacon `<script>` before `</body>` of HTML answered to a request
    with no `Accept` header** (found 2026-09-28): the app sends `Accept: */*`,
    and `storeIndex` still takes that one tag back out before checking, so the
    stored `index.html` is the build's exact bytes and any OTHER difference is
    refused. A build is stored
    (`files/web/builds/<stamp>.json`) and handed on only WHOLE; anything less
    leaves the pages as they were, and a download that broke off resumes from
    the files that arrived.
  - **The switch**: `WebBundle` has one ACTIVE build, which answers the page on
    screen, and at most one READY. It switches ONLY on a main-frame request —
    a reload, or the next start, which opens the newest downloaded build at
    once (the `boot` pref) — so a running page never mixes two builds. A file
    the old page still asks for after a switch is found in the previous build.
    `/build.json` is answered from the ready build, so the site's own
    `UpdatePrompt` offers the reload; the app fires `safia-build-check` when a
    build is ready, which `useAppUpdate` answers with an immediate refetch
    instead of waiting for its 5-minute poll. It follows the LIVE stamp, not
    "the newest": a rollback is followed too.
  - **Cost**: until v4.324.1 every deploy renamed ~227 of 231 asset files
    (the build stamp sat in a shared chunk), so a new build was ~1.6 MB over
    the wire. The stamp now lives in index.html (see «A deploy renames only
    what changed»): a deploy with no frontend change downloads index.html
    alone; a translation edit still renames most chunks. Only while the app is
    open, and only the latest build, never each one in between.
  - **Failures**: a file that does not match the list, a list that is not
    one, a missing CSP or a lasting 4xx on `/build.json` is retried after 30 s
    and REPORTED (`/api/boot-report`, «page update failed») after three
    attempts at one build — a phone that silently stopped following the site
    is what nobody would notice. Being offline is not a failure. Only the
    active, ready and previous builds' files are kept; a new APK wipes every
    download (its versionCode is remembered in the `pages` prefs) and starts
    from its own copy.
  - The pages keep up with the site, so the `MIN_CLIENT` "no longer served"
    warning appears only while a download keeps failing — its reload then
    switches as soon as one succeeds.
- **What a browser gives a page and a web view does not** is supplied by the
  app: `app-bridge.js` (injected at document start, this origin only) hands
  in-memory files to Android through `window.SafiaAndroid` (a
  WebMessageListener limited to this origin) — `saveBlob`'s
  `<a download href="blob:…">` becomes a file in Downloads (MediaStore, or
  the app's own folder on Android 7–9) that then opens in the phone's app for
  it, and `window.open("blob:…")` (a proof photo) opens without saving;
  `<input type=file>` gets the system picker, with the accept list's
  extensions translated to MIME types (one it cannot translate lifts the
  filter rather than hide the file); the camera (`/proof/camera`) is granted to
  THIS origin only, after Android's own permission; a new tab of ours opens in
  the same view (the admin's «open as this profile», `?as=`, is the exception —
  see the next bullet); anything else opens
  in the phone's app for it (Telegram for `t.me`, …); the back button walks
  the page history; the bars take the page's colour from
  `<meta name="theme-color">`; the keyboard and bars are padding (Android 15+
  forces edge to edge). The app's own toasts speak the language picked on the
  site (`localStorage.lang`, sent with every bridge message — `Texts.java`).
- **The app stays signed in until its person signs out** (2026-10-01, the
  operator: «like other mobile apps … not expiring like web»). Three things
  were signing phones out: the login form's «remember me» defaulted OFF, so
  the token sat in sessionStorage, which a web view loses every time Android
  stops the app in the background; a ticked one died after 30 days anyway;
  and the boot check (`/api/auth/web/session`) CLEARED the token on any
  failure, so opening the app without signal was a sign-out.
  - **An app session is a year long and renewed daily.** The login form sends
    `app: true` from inside the app (`inAndroidApp()`), and the server honours
    it only from the app's user agent (`web_auth.from_app`, `APP_UA_MARK`) —
    `create_web_jwt(app=True)`: `APP_SESSION_DAYS` (365), claims `app` + `iat`.
    `utils/appSession.js` `keepAppSignedIn()` renews every session the app
    holds — the active one and each wallet row — once it is a day old, on boot,
    on return to the screen and on coming back online (`POST
    /api/auth/web/refresh`, which re-derives the claims from the profile). A
    browser-length token presented by the app is UPGRADED there, so nobody
    signed in before this was asked for a password. Refused (403): a browser
    (`not_app` — a browser keeps the 12-hour / 30-day rules) and an
    impersonated token (`not_refreshable`; `create_web_jwt` never makes one an
    app session).
  - **Stored in localStorage, always.** In the app `setToken` and the wallet's
    `saveProfile` keep every non-tab web session as remembered, and at boot
    `keepAppSessionStored` / `keepAppProfilesStored` move whatever still sits
    in sessionStorage over. The forms show «stays signed in until you sign out»
    instead of the checkbox. The impersonation screen (`tab`) is untouched.
  - **Only the server's NO signs out.** The boot check clears the token on 401 /
    403 alone; no connection, a timeout or a 5xx shows the «Aloqa yo'q» screen
    with the token kept (this applies to browsers too).
  - Revocation is unchanged and immediate — every request re-checks the
    credential, so a password change, reset, disabled login or «sign out
    everywhere» ends an app session at once. A password change made in the app
    re-issues an app token. Renewals are skipped by the action register (the
    sign-in is logged, with `surface: android`).
- **«Open as this profile» opens IN THE APP, as a screen of its own**
  (1.3.0, 2026-09-29 — the operator: it opening in the phone's browser was
  «the problem»). `SessionActivity` (a `MainActivity` whose `isSession()` is
  true; standard launch, not exported) stacks on top of the admin's screen
  with a web view of its own, so the impersonated session lives in THAT web
  view's sessionStorage (`utils/session.js` `tab: true`) and the admin's own
  session underneath is never touched — the phone's version of the browser
  tab a computer opens. Every road to a `?as=` link leads there
  (`isSessionLink`): the popup, a link from another app (`onNewIntent`) and a
  cold start, which loads «/» for the admin first. It is left the way a tab
  is: back once the page has no history, or the page's own exit (the
  impersonation bar's «Chiqish» → `AuthContext.logout` calls `window.close()`
  when `inAndroidApp()`) and the dead-link screen's «Oynani yopish» —
  `app-bridge.js` turns `window.close()` into a `close` message and only a
  session screen finishes on it. It is never rebuilt (a dead page engine or
  an Android rebuild finishes it): the session died with its web view and the
  link is spent. The PageUpdates «ready» slot is taken in `onResume`, so the
  screen underneath gets it back.
- **The website offers «Open in the app»** (2026-09-29): on a phone's browser
  where the app is installed, `components/layout/OpenInAppPrompt.jsx` — a
  closeable `Toast` at the top right (a close is remembered for a week) whose
  button is an `intent://` link for the same page pinned to the package. The
  browser answers «installed» itself: `navigator.getInstalledRelatedApps()`
  matches `related_applications` in `public/manifest.webmanifest` and counts
  the package only while its `asset_statements` (`res/values/strings.xml`)
  name this site — so every installed APK already qualifies. Chrome on
  Android only; nothing where the browser cannot answer, never in Telegram,
  never inside the app (`inAndroidApp()`, the user-agent suffix).
- **It reports its own failures** — `SafiaApplication` catches every crash
  and `FailureReport` posts it (and a dead page engine,
  `onRenderProcessGone`, after which the screen starts over) to the site's
  unauthenticated `POST /api/boot-report`, which DMs the support chat with
  app and pages version (built in / downloaded), phone, Android and WebView
  version first — and a page update that keeps failing, above. A report
  is saved before it is sent and retried on the next start. Born of 1.0.0,
  which crashed on its first launch with no message at all.
- **The signing key lives on the Mac that builds, never in git** —
  `~/.safia-android/signing/safia-ims-release.jks` + `keystore.properties`.
  The build REFUSES a release without it, and `android/.gitignore` blocks
  keys, APKs and AABs as a second line of defence (the Stop hook runs
  `git add -A`). **Losing the key means no installed copy can ever be
  updated** — every phone uninstalls and reinstalls. Its SHA-256 is served in
  `/.well-known/assetlinks.json` (`ANDROID_ASSET_LINKS` in
  `backend/app/main.py`), which is what lets Android open production links
  tapped in other apps in the app (`autoVerify`).
- **Building**: `bash android/build-release.sh` → the signed APK
  (sideloading) and AAB (Google Play) in `~/.safia-android/releases/`, never
  in the repo. Toolchain: JDK 21 in `~/.safia-android/jdk-21`, Android SDK
  (platform 36, build-tools 36.0.0) in `~/Library/Android/sdk`, AGP 8.13.2 +
  Gradle 8.14.5, `androidx.activity` 1.13.0 · `core` 1.18.0 (1.19 needs
  compileSdk 37 and AGP 9.1) · `webkit` 1.17.1 (Android 7+, hence minSdk 24).
  **Raise `versionCode` on every release** (current: 1.7.1, versionCode 13).
  Icons: `scripts/render-android-icons.py`, never hand-edited. Nothing here
  touches the deploy: `deploy/deploy.sh` reacts to backend/, bot/ and
  frontend/ only.
- **Testing** is on the operator's Galaxy A16 over USB (`adb`), when it is
  plugged in with USB debugging on; the build Mac has no room for an
  emulator. Never type the operator's password into it.
- **The APK updates itself from 1.4.0** (2026-09-29, the operator's pick
  over Google Play). `AppUpdates.java` — main screen only, on resume, at most
  every 30 min — asks `GET /api/android/latest`; a newer versionCode gets a
  dialog («Yangilash» / «Keyinroq», the latter quiet for 12 h per version),
  the file is downloaded into `cache/apk/`, checked against the published
  SHA-256 and handed to Android's installer (`REQUEST_INSTALL_PACKAGES`; the
  first time the app opens the «install unknown apps» setting and says why).
  The person taps «Install» once — a sideloaded app can never replace itself
  silently. **Phones on 1.3.0 or older must install 1.4.0 by hand once.**
  - **The server holds ONE release**, on disk in `backend/data/android/`
    (gitignored, survives the deploy's `reset --hard`): `<code>.apk` +
    `latest.json`. `services/android_release.py` is THE definition;
    `routers/android.py` serves `/latest`, `/app/{code}.apk` and
    `/download` (a shareable link — hand it out instead of the file), all
    PUBLIC (`security._EXEMPT_PREFIXES`).
  - **Publishing is `bash android/publish-release.sh`**, run from the build
    Mac after `build-release.sh` — NEVER a commit (19 MB a release would push
    the repo past the cloud bundle's 100 MB within a few releases). It posts
    the APK with `~/.safia-android/signing/publish.key`; the server keeps only
    the key's SHA-256 (`PUBLISH_KEY_SHA256`), so nothing secret is in git and
    nothing is configured on the server. Every upload is READ first (a
    minimal binary-manifest + v2/v3 signing-block reader): refused unless it
    is `uz.safiacorporate.ims`, not older than the published versionCode, the
    same bytes if the same code, and signed with a certificate
    `ANDROID_ASSET_LINKS` names — a wrongly signed APK would otherwise fail on
    every phone after a 19 MB download each. Logged as
    `config.android_published`. A new key = a new SHA-256 in code.
  - Publishing is the release: every installed 1.4.0+ app offers it at its
    next check. There is no staging.
  - Google Play remains possible later: it needs a developer account, and
    Play App Signing re-signs with Google's key — ADD its fingerprint to
    `ANDROID_ASSET_LINKS` (which `publish` also reads).
  - **«Yangilanishni tekshirish» — the update button** (1.7.0, 2026-10-03,
    the operator's request): a sidebar row right above «Versiya», in the app
    only (`apkUpdateShown()` — `inAndroidApp()` and not the «open as» screen,
    which has no updater), opening a window that states ONE thing at a time:
    checking · up to date · nothing published · a new version (size, date) ·
    downloading (a progress bar, % and MB) · ready to install / the installer
    was opened · what failed (check · download · SHA mismatch · installer ·
    the permission setting). The ROW follows the state too — gold
    «Yangilanish bor» with a dot once a newer APK is known, «Yuklanmoqda…
    42%» during a download — so a window closed mid-download leaves a trace.
    `components/layout/AppUpdateButton.jsx` (row + window) over
    `utils/androidUpdate.js` (the store and both checks).
  - **ONE state machine behind both ways in** (`AppUpdates.java`): its own
    half-hourly check + dialog, and the page's requests — `{type:
    "app-update", op}`, op = status · check · start · cancel · watch ·
    unwatch. Every request is answered with the WHOLE state as a
    `safia-app-update` event (`state()`: phase · error · running · latest ·
    got/total · downloaded · installerOpened · canInstall), kept in ONE page
    store (`useApkUpdate`), so the row and the window can never disagree. A
    download started from the app's own dialog shows its progress on the page
    as well; while the window is open (`watch`, 15-minute expiry) the app's
    offer dialog stays away, and a check the page asked for never pops it.
    The page's «start» re-reads `/api/android/latest` before downloading
    (only the latest file is served, so a window left open across a publish
    would 404); without the install permission the window says why and
    «start» goes straight to the setting, the download beginning by itself
    on return with it on; a download that finishes off screen opens the
    installer on return (Android refuses background activity starts). A
    connection that ends early is a download error; only a SHA mismatch is
    reported (`FailureReport`).
  - **Older APKs (1.4.0–1.6.x)** have no `window.__safiaApp.update`, so the
    window asks the server itself — a plain `fetch`, not the api client,
    whose restart wait would hold «checking» on screen for minutes during a
    deploy — and compares with the user agent's versionName; a newer one is
    handed to the phone's browser by an `<a download>` click on the release
    URL (MainActivity's download listener), with no progress in the window
    (the browser's notification carries it, and the window says so). The
    same fallback runs when a 1.7.0+ app does not answer within 4 s. The
    pages carried the button from the day they deployed; the APK that answers
    it was built and published only on **2026-10-13 as 1.7.1** (versionCode
    13, the new emblem launcher icon — the FIRST publish since 1.5.1: 1.5.2,
    1.5.3 and 1.6.0 were built and never published, 1.7.0 never built), so a
    phone still on 1.5.1 runs the fallback until it installs 1.7.1.
- **Phone notifications** from 1.5.0 — see «Phone notifications».
- **The bot sends the APK on `/android`** (2026-10-07, the operator's
  request) — `_android_cmd` / `_apk_send` in `telegram_bot.py`. It sends the
  published release (`android_release.latest()`, the file
  `/api/android/download` serves) as `Safia-IMS-<version>.apk`, with a
  four-language caption: open the file, allow the unknown source, sign in with
  the «Sayt logini» (or ask an admin), and the app offers new versions itself.
  Anyone may ask, because the file is public. It is registered ahead of every
  stateful capture, so it answers mid-flow and the flow stays open. The first
  send of a build uploads it and keeps Telegram's `file_id` in `app_meta`
  (`android_apk_file_id`, keyed by the build's sha256); later sends re-send
  that id. It runs on `tg_later`, after the webhook has answered. With nothing
  published it says so. An APK over 50 MB (a bot's upload limit; `MAX_APK`
  allows 80) or a send that fails gets the download link instead. It is in
  every command menu, admins' included.
- Deliberately not built (yet): a leader checklist screen of the app's own
  (the proof camera is reachable only from the bot's buttons, which open in
  Telegram), instant delivery (Firebase), and the Fullscreen API on `/live`.
