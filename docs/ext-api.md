# The external read API

## The external read API (`/api/ext/v1`, 2026-11-11)

The operator asked for an API another system can read: the cells (Verifix
code, SAP code, group), a cell's plan for a date, its SKUs for a date, and the
workers' clock-in/out for a date — «the date also could be today».
`routers/ext_api.py`, three GETs, read-only.

- **The token** (see «Personal tokens» below): `Authorization: Bearer <token>`
  or `X-Api-Key: <token>`. Wrong ones share the report door's throttle (ten in
  ten minutes per address). `/api/ext/` is in `security._EXEMPT_PREFIXES`, so
  no Telegram session is involved; a refusal is `401 bad_token`.
  **A live token is looked up BEFORE the throttle and is never refused by it**
  (v4.468.0): the address the throttle counts can be typed (`CF-Connecting-IP`
  at the origin, see `docs/web-clients.md`) or shared (one NAT, one VPS), so
  ten wrong tokens on it — or one system polling with a revoked token — locked
  out every other system behind it for ten minutes. A token is 32 random bytes,
  so nothing is guessed meanwhile; the price is one indexed digest lookup per
  wrong call from a throttled address.
- **`date=YYYY-MM-DD`** on all three; blank = today on the Tashkent clock. A
  night shift belongs to the date it started on. **`cell=<verifix code>`** on
  the two dated ones narrows to one cell; without it every cell comes back in
  one answer.
- **`GET /cells`** → `{date, cells: [{code, sap_code, group, leader, brigadir,
  shift}]}` — the cells standing that day that carry a SAP code
  (`cell_lookup._cells_on`: the unit, leader and letter OF THAT DAY). The
  Verifix `code` is the key everywhere; a SAP code is not unique.
- **`GET /production`** → per cell `{code, sap_code, group, plan_minutes,
  fact_minutes, skus: [{sap_code, name, unit, plan, fact, plan_minutes,
  shared}]}`. The SKUs are the «Zagruzka fayli» rows of the cell's unit
  (`_build_dashboard`) cut to the cell as a leader's page cuts them
  (`wc_group.in_scope`), **only the lines with a plan or a fact that day**. The
  cell's minutes are `zagruzka_source.cell_labor`; `null` = nothing reaches the
  cell that day, never 0. A line no letter claims is listed under every cell of
  its work centre with its WHOLE quantity and `shared: true`, while the cell's
  minutes carry an even share of it — so a lettered cell's `plan_minutes` is
  not the sum of its SKUs' minutes.
  **A SKU's `containers`** (v4.468.0, for the internal-logistics app, which
  moves them): `{yellow|round|grey|bucket|box: {capacity, count}}`, one entry
  per container the catalog line states a capacity for (`pp_products.cap_*`,
  the «Pozitsiyalar» columns — see «…and a line's four CONTAINERS» in
  `docs/production-quantities.md`); `count` is `pp_containers.count` of the
  line's plan, the figure the page and «Konteynerlar — jami» show, `null`
  without a plan. `{}` = no capacity entered. A `shared` line's count is the
  whole line's, like its `plan`.
- **`GET /attendance`** → per cell `{code, workers: [{employee_id, name, job,
  clock_in, clock_out}]}`, times as `2026-11-09T07:53+05:00`. A unit whose day
  is CLOSED answers from the closed copy (`attendance`: exchanges applied,
  `employee_id: null` — that table holds no Verifix id); a unit still open
  answers from the live Verifix read (`live_staff`), everybody under their HOME
  cell with their Verifix `employee_id`. `clock_in: null` = did not come (yet),
  `clock_out: null` = still inside or no check-out. `live_read_at` is the
  oldest live read answered from. Passport / PINFL never leave.

## Personal tokens and the «API» page (`/tokens`, 2026-11-11)

The operator, the same day: «Can we use auth token just like GitHub? The users
with this permission will be able to generate auth tokens for themselves», and
then «on that page they also should be able to download the manual pdf and
documentation as MD file in their selected languages».

- **The permission is the page.** Page key `api` (route `/tokens` — a path
  beginning `/api` would look like an API call), admin-only until opened on
  the Access tab or granted to one person (`page.view.api`). Whoever may open
  it makes tokens for THEMSELVES there; nobody makes one for somebody else.
- **A token** (`services/api_tokens.py`, table `api_tokens`): `sfx_` + 32
  random bytes, shown ONCE in the dialog that made it and kept as a SHA-256
  digest — the page lists a nine-character prefix, never the token. It carries
  a name (the system that will use it) and a lifetime of 30, 90 or 365 days, or «never» (the operator, 2026-11-11:
  «Add an option: never» — `days: 0`, stored as a date a century away so
  `expires_at` stays NOT NULL; the row says `never: true` and the page prints
  the word, with a warning under the toggle while it is picked);
  at most ten active per owner. `last_used_at` is stamped at most once a
  minute, and every accepted call writes an `[EXT]` log line naming the owner
  and the token.
- **A token is its owner's, and is asked about on every call**
  (`api_tokens.owner_ok`): the row keeps the owner's session as it stood
  (`payload`) and their profile key, and each call checks that the account
  still holds that profile (`identity.profile_holders`) and that the profile
  may still open the page (`role_can_access`, grants and personal denials
  included). Taking the page or the profile away stops the tokens at once;
  nothing has to be revoked by hand. A permanent system link should therefore
  be a token made by an admin and named after the system.
- **Revoking** is the row's ⋮ → «Bekor qilish» (asks first): the owner, or an
  admin, who also sees everybody's tokens with an «Egasi» column. A revoked
  token leaves the list; an expired one stays, red, until revoked.
- **The first key is retired by the first token.** `ext_api.KEYS` (the digest
  shipped in v4.460.0, the key in the operator's `ext-api.key`) is honoured
  only while `api_tokens` holds no row at all.
- **The manual** is ONE document in the four languages
  (`services/ext_api_manual.py`: the structure once, the words per language),
  laid out by `assistant_documents.build` as a PDF or a Markdown file —
  `GET /api/api-tokens/manual?lang=&format=pdf|md`, downloaded in a browser
  and sent to the caller's chat inside Telegram (`xlsx_delivery`). The page's
  language toggle starts on the reader's own language. **A field added to
  `ext_api.py` gets a row in `_FIELDS` and a line in each language of `_S`** —
  a test holds the four to one set of keys.
- Still open: no address restriction (a token works from anywhere), and a
  token reads every cell, not its owner's unit.
