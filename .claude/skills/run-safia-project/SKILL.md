---
name: run-safia-project
description: Run, launch, start, drive, screenshot or smoke-test the Safia (Zagruzka) dashboard locally — FastAPI backend + Vite/React Telegram mini-app. Use when asked to run the app, open a page, take a screenshot of a route, click through a UI flow, or check an API endpoint against the real running stack.
---

# Run the Safia dashboard

FastAPI backend + Vite/React SPA that normally lives inside a Telegram
mini-app WebView. Locally it runs without Telegram via the `__dev__` auth
bypass.

Everything is driven by **`.claude/skills/run-safia-project/driver.mjs`** —
zero dependencies, no `npm install`. It does authenticated API calls and takes
real PNG screenshots of SPA routes by driving the `chrome-headless-shell`
binary already in puppeteer's cache over raw CDP.

All paths below are relative to the repo root.

> Project rule: **never** build, commit, or push by hand — the Edit/Write hook
> builds `frontend/dist` and auto-commits. Also `git fetch` + pull before
> editing (see `CLAUDE.md`).

## 1. Preflight

```bash
node .claude/skills/run-safia-project/driver.mjs doctor
```

Checks `backend/.env` keys, finds Chrome, prints **which backend port the UI
will call**, and tells you exactly which server to start. Exit 0 = ready.

Already satisfied in this repo (only needed on a fresh machine):
`pip install -r backend/requirements.txt`, `npm ci` in `frontend/`, a local
postgres `zagruzka_db`, and `backend/.env` with:

```
DEV_AUTH=1
TELEGRAM_BOT_TOKEN=123456:LOCAL_DEV_DUMMY
DATABASE_URL=postgresql://<your-user>@localhost:5432/zagruzka_db
```

## 2. Start the stack

Use `preview_start` (never Bash) with the names from `.claude/launch.json`:

```
preview_start {"name":"frontend"}      → vite  :5173
preview_start {"name":"backend"}       → uvicorn :8000
preview_start {"name":"backend-alt"}   → uvicorn :8001
```

**Which backend?** `frontend/.env.development.local` is gitignored and
per-machine. If it sets `VITE_API_URL`, the dev bundle calls that origin
directly and the vite `/api` proxy is bypassed — so you must start the backend
on *that* port. On this machine it pins `http://localhost:8001`, so
`backend-alt` is the one that matters. `doctor` prints the answer; don't guess.

## 3. Drive it (agent path)

```bash
node .claude/skills/run-safia-project/driver.mjs smoke
```

Logs in and asserts on six core endpoints' payloads (not just status).

```bash
node .claude/skills/run-safia-project/driver.mjs api GET "/api/summary?date_from=2026-05-08&date_to=2026-05-20"
```

One authenticated call. Sends both required headers and warns if the path fell
through to the SPA catch-all.

```bash
node .claude/skills/run-safia-project/driver.mjs shot /staff
```

Screenshot a route → `$TMPDIR/safia-shots/<route>.png`. **Read the PNG back**
— a blank or error-page capture still exits 0. Prints title, first `h1/h2`,
and any console errors.

Flags: `--click <sel>` (CSS, or `text=Запросы`; repeatable) · `--js '<expr>'` ·
`--theme dark|light` · `--lang uz|uz_cyrl|ru|en` · `--wait <ms>` (default 4500;
chart pages want ~6000) · `--size WxH` · `--full` (grows the viewport to the
app's inner scroller — see Gotchas) · `--out <file>` · `--console`

Verified flows from this session:

```bash
node .claude/skills/run-safia-project/driver.mjs shot /staff --click "text=Запросы" --out /tmp/staff-requests.png
```

```bash
node .claude/skills/run-safia-project/driver.mjs shot "/?date_from=2026-05-08&date_to=2026-05-20" --wait 6000 --theme light --lang en --out /tmp/overview.png
```

```bash
node .claude/skills/run-safia-project/driver.mjs shot /leaderboard --full --wait 6000 --out /tmp/leaderboard.png
```

`driver.mjs routes` lists all 20 SPA routes. Deep-link straight to the route
you care about — never land on Overview and click through the sidebar.

## 4. Human path

`preview_start {"name":"frontend"}` then open http://localhost:5173. You are
auto-logged-in as the first `admins` row. Data pages default to the only
window the local DB has data for: **2026-05-08 → 2026-05-20**.

## Gotchas

- **`:8000` serves the SPA too — but you cannot log in there.** That's the
  built `frontend/dist`, a PROD bundle, and `AuthContext` refuses the `__dev__`
  bypass when `import.meta.env.PROD` (it shows the "📵 no initData" screen by
  design). Always drive the **dev server on :5173**.
- **`frontend/.env.development.local` can repoint the whole UI.** With
  `VITE_API_URL` set, the vite `/api` proxy is dead weight and the browser
  calls that origin cross-origin. Wrong port up ⇒ every request is
  `ERR_CONNECTION_REFUSED` and the page shows only
  «Ошибка входа. Перезапустите бота в Telegram.» — which looks like an auth bug
  and isn't. The driver auto-detects this file and talks to the same backend.
- **Every `/api/*` call needs `X-Telegram-Init-Data: __dev__` *and* the Bearer
  JWT.** `app/security.py` re-verifies initData on every request via a global
  dependency, not just at login. A Bearer-only call is 401.
- **Query params are `date_from` / `date_to`, not `start` / `end`.** The wrong
  names return **200 with every metric zeroed**, never a 422.
- **An unknown `/api/*` path returns 200 + `index.html`** (SPA catch-all), so a
  typo'd endpoint looks like success. `/api/profiles/me` doesn't exist;
  `/api/profiles/mine` does.
- **`/api/translations/names` 401s on boot.** Expected — only `/api/translations`
  is in `_EXEMPT_PATHS`; it succeeds after login. Not a regression.
- **Filters read the URL first**, then localStorage: `?date_from=…&date_to=…`
  deep-links a range without touching the UI. Theme/lang are `localStorage`
  `theme` / `lang` (the driver seeds them on a first navigation to `/login`,
  because localStorage needs an origin before it can be written).
- The `__dev__` login returns **the first `admins` row**. Empty table ⇒
  `status: "not_registered"` and the picker screen instead of the dashboard.
- **The document never scrolls** — the shell pins
  `<main class="h-full overflow-y-auto">` and scrolls *that*. So
  `Page.getLayoutMetrics` reports the viewport and `captureBeyondViewport`
  alone captures nothing extra. `--full` works around it by measuring the
  tallest inner scroller and growing the viewport to it (it prints
  `viewport grown 900 → 2304px`). Any other full-page tooling you point at this
  app will silently return a viewport-sized crop.
- `chrome-headless-shell` keeps writing `Default/Cache` for a moment after
  SIGKILL; deleting its profile immediately throws `ENOTEMPTY`. The driver
  retries — don't "simplify" that away.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Page shows «Ошибка входа. Перезапустите бота в Telegram.» | The backend the UI calls isn't up. `driver.mjs doctor` prints the port + the `preview_start` name. |
| Screenshot shows «📵 / no initData» | You pointed at `:8000`. Use `:5173`. |
| `401 from /api/auth/webapp — DEV_AUTH is off` | Add `DEV_AUTH=1` to `backend/.env`, restart the backend. |
| `no rows in admins` | `psql zagruzka_db -c "insert into admins (telegram_id) values (1);"` |
| uvicorn crashes at import | `TELEGRAM_BOT_TOKEN` is missing/empty — telebot validates the *format* at import. Any `123456:XXX` shape works. |
| DB connection refused / role `postgres` does not exist | `DATABASE_URL` must name your own local role, not `postgres`. |
| `no chrome binary found` | `npx @puppeteer/browsers install chrome-headless-shell@stable`, or set `SAFIA_CHROME=/path/to/chrome`. |
| Endpoint returns all zeros | You used `start`/`end`. Use `date_from`/`date_to`. |
| Empty page / charts missing in a screenshot | Raise `--wait` (ApexCharts + react-query need ~6s on chart pages). |

Overrides: `SAFIA_API`, `SAFIA_WEB`, `SAFIA_SHOTS`, `SAFIA_CHROME`.
