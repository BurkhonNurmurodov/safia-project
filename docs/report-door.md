# The report door

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## The report door (`/api/ops`, 2026-10-26)

The operator's idea (2026-10-26), refined with them: a Claude session asks
production ONE question and gets the answer only after a person allows it in
Telegram. It replaces, for every question a query can answer, the flag-guarded
one-shot report — a module, two deploys and a cache flush per question.
`services/ops_door.py` is THE definition, `routers/ops_door.py` the HTTP side,
`scripts/ask-prod.py` the client, the bot's `oq:` callback and `/opsdoor` the
person's half.

- **The flow.** `ask-prod.py sql --to burkhon --why "…" "SELECT …"` (or
  `get --to abbos /api/heatmap date_from=… date_to=…`) → `POST /api/ops/asks`
  → a Telegram card to THAT person with the whole question, who asks and why,
  the tables named, the role it will run as and the expiry → «✅ Ruxsat
  berish» / «✖️ Rad etish» / «🔒 Rad etish va eshikni yopish» → the script
  (polling `GET /api/ops/asks/{token}` every 3 s) takes the answer ONCE with
  `POST /api/ops/asks/{token}/take` and prints JSON (`--out` writes a file).
  Past the Bash tool's 10 minutes, `ask-prod.py wait <token>` resumes; a
  network blip or a deploy-time 5xx is retried, and every exit says how to
  resume. Exit codes: 0 answered · 1 ran and failed · 2 refused / denied /
  expired · 3 still waiting · 4 network.
- **Ask WHO every time, never both** — the standing rule above; `--to` is
  `burkhon` or `abbos` (`startup.REPORT_CHAT_*`), and only the person the card
  went to can answer it (checked against the ROW, never the chat).
- **The ask key asks and nothing else.** `~/.safia/ops.key` on the build Mac
  (mode 600, never in git), sent as `X-Ops-Key` or `Authorization: Bearer`;
  production holds only its SHA-256 (`ops_door.KEY_SHA256` — a new key is a
  new digest there). A wrong key is 401, ten in ten minutes from one address
  429, the first refusal a Jurnal row. A leak costs cards the approver denies.
- **Nothing runs before the tap, and nothing is kept after.** An unanswered
  card dies in 15 minutes (`ASK_TTL`), an allowed answer not taken in 15 more
  (`TAKE_TTL`); a job (`ops-door-expire`, every minute) expires them, fails a
  take that never finished (`running` past 5 minutes — a worker killed
  mid-take: `ops.interrupted`) and redraws the card. A take claims the row
  (approved → running) in one locked update, so it runs once whatever happens
  after; the answer is never stored — only rows, bytes and milliseconds, which
  the card then prints («📥 Natija olindi»). At most 3 cards wait at once and
  40 asks an hour (counted under an advisory lock, so asks fired together are
  counted in turn), and ONE answer — SQL or GET — runs at a time per process:
  a take that finds the slot taken is answered 409 `busy` and its row stays
  allowed (the client retries).
- **The approver sees the WHOLE question**: a query longer than 3,000
  characters is refused (split it), never cut, and an ask whose card would
  not fit Telegram's 4,096 units in its longest state (with a failure printed
  under it, in every language) is refused `card_too_long`.
- **A SELECT is bounded harder than any request.** One statement (no «;»
  anywhere but at the end — inside a string literal too),
  starting SELECT / WITH / VALUES / TABLE / EXPLAIN (of a SELECT) / SHOW, in a
  READ ONLY transaction — Postgres itself refuses writes, data-modifying CTEs,
  `FOR UPDATE`, sequences and `SELECT INTO` — with `statement_timeout` 20 s and
  `lock_timeout` 3 s, at most 5,000 rows and 2 MB (`truncated: rows|bytes`
  says which), on a connection of the door's own (NullPool, closed after) so
  no setting, temp table or session lock outlives it. Functions that signal or
  kill backends, sleep, take advisory locks, read server files or large
  objects, open connections, change settings, notify, manage WAL/replication,
  reset stats, advance sequences or run SQL held in a string
  (`query_to_xml`, `table_to_xml` and the rest of `*_to_xml`, `ts_stat`,
  `ts_rewrite`, `crosstab`) are refused BY NAME (`_DENY`), even inside a
  literal — and so are the statistics catalogs `pg_stats*` / `pg_statistic*`,
  which hold SAMPLED COLUMN VALUES of every table the caller may read (as the
  app's user, the password hashes) while the table they describe is only row
  data that no name check could see. A `U&"…"` escape, the one way to spell a
  name without its letters, is refused outright. **The text check is not the
  boundary**: before the query runs it is planned (`EXPLAIN (VERBOSE, COSTS
  OFF)`, never executed) in the same read-only transaction and the plan —
  every function and relation by the name Postgres RESOLVED — is checked
  against the same lists (`plan_refusal`). The plan is read through
  `public.ops_door_plan`, a plpgsql function made at boot, which hands back
  NULL — refused — when a plan line passes 20,000 characters, so a constant
  folded into a plan (`repeat('x', 300000000)`) is never fetched whole;
  without the function the door EXPLAINs directly. Each row leaves the server
  as ONE JSON text cut to 2 MB (`SELECT left(row_to_json(s)::text, …) FROM
  (<query>) s`, through a named cursor), rows are pulled 10 at a time, the
  5,000-row / 2 MB bounds apply as they arrive, and the 20 s bound is re-set
  to what is left of it before every FETCH (each FETCH is its own statement)
  — so neither a wide cell, nor many rows, nor a slow row costs the worker
  more than one batch and 20 seconds.
- **The credential tables give no answer at all** — `web_credentials`,
  `ai_keys`, `password_hash`, `password_enc`, `key_enc` are refused in the
  text and in the plan, under any role, and the reader role is never granted
  them (revoked if it ever was). Masking cannot survive arbitrary SQL
  (`SELECT w FROM web_credentials w`, `reverse(password_hash)`), so these are
  refused rather than masked.
- **It runs as `safia_ops_reader` only where the database allowed it**: a
  NOLOGIN role that may only SELECT, made by a deferred boot step
  (`ensure_reader_role`, which grants new tables at every boot and asks
  Postgres 16+ for the SET right, not mere membership). **The production app
  user (deploy/01-provision.sh) has no CREATEROLE, so on production the role
  does not exist and SQL runs as the app's user** in the same read-only
  transaction — the plan check and the credential refusal are what bound it
  there. WHICH role a question runs as is decided when the card is sent and
  stored on the row (`ops_asks.run_as`); the card prints it and the take runs
  as it and nothing else. `--as-app` asks for the app's user on purpose (the
  reader cannot read other sessions' query text in `pg_stat_activity`).
- **A GET runs as the approver** (they must hold an admin role — else the ask
  is refused), through this process's own ASGI stack: `security.INTERNAL_MARK`,
  random per process, opens the Telegram-origin wall for that in-process GET
  only, and every endpoint applies its own rules to a 2-minute admin token.
  Only real `/api/…` or `/admin/…` GET routes (never the page catch-all, never
  `/api/ops/`); a file answer is reported by type and size, JSON is cut to
  2 MB by trimming long lists. The call is bounded at 50 s by the door itself
  (httpx's timeout never applies to an in-process app), and the answer is
  parsed, masked and cut on the threadpool, never on the event loop.
- **Masking is defence in depth, not the guarantee**: a column or JSON key
  naming a password, token, secret, sealed value, hash or API key, the `value`
  beside a settings-style `key` that names one (`/admin/settings`' rule), and
  any string CARRYING the shape of a sealed password, a PBKDF2 hash, a JWT, a
  bot token or a provider key anywhere inside it (a record literal, a
  concatenation, a JSON text) become ••• and are named in `masked`. Arbitrary
  SQL can always transform a value past a pattern — the credential refusal
  above and the person reading the card are what actually keep secrets in.
  Workers' names and phones are NOT masked — they reach the chat transcript
  as a DM report always did; the operator accepted that class of exposure.
- **Kill switch**: `ops_door_off` in app_settings. «🔒 … eshikni yopish» on any
  card and `/opsdoor` in the bot (the two approvers only) set it; while it is
  set every ask is refused 403 `door_closed`, and a take after the close too.
- **The Jurnal** (category «Yangilash va eksport», source «Hisobot eshigi»):
  `ops.asked`, `ops.ask_refused`, `ops.key_refused`, `ops.allowed` /
  `ops.denied` (source bot, the approver), `ops.taken` (rows, bytes, ms, what
  was masked or cut), `ops.expired`, `ops.interrupted`, `ops.door_closed` /
  `ops.door_opened`.
  `/api/ops/` is in the middleware's `_SKIP`; every row is written by hand.
- **A cloud session reaches it only once `production.safiacorporate.uz` is on
  its environment's Allowed domains**, with the key as an API credential for
  that site (header `X-Ops-Key`, no prefix — or type Bearer) or as
  `SAFIA_OPS_KEY`. Until then the door works from the laptop only.
- **Never** widen it to writes, never let it store an answer, never give the
  key a second power. A question it cannot answer is a one-shot report.
