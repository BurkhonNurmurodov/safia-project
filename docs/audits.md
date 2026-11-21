# Audits (KRU and technical)

The KRU audits («КРУ Производство») and the technologists' audits («Технический
аудит»). Until a page of their own exists, `public.audit` is the only source the
platform reads (the technologists' audit KPI, `docs/kpi.md` «Texnologlar
auditi»; the raw table, `docs/laboratory.md` «Audit jadvali»).

## «Audit paneli» — the audit panel connection (`/panel/auditpanel`, 2026-11-21)

The operator asked for ONE «Auditlar» page — KRU and Texnik on separate tabs,
each with «Ro'yxat» (register) and «Tahlil» (analysis, charts chosen for the
data) — read from «the panel I shared», plus an admin page to enter that
panel's login and password. The panel's address never reached the session, and
no Safia panel host was reachable from it, so the operator ruled **«panel now,
page later based on the data»**: this card ships first, and the page is built
off what its test finds. **Nothing on the platform reads an audit from the
panel yet.**

- **Where it sits**: the admin app, «Ulanishlar», after Tasker
  (`ADMIN_NAV` id `auditpanel`, `pages/admin/AuditPanelSettings.jsx` +
  `auditPanelText.js`, four languages). Admin-only, NOT grantable (no
  `capKey`) — the login reads every audit the panel holds. The «Auditlar» page
  itself will be admins + a grantable page key (the operator's answer).
- **`services/audit_panel.py` is THE client**, `routers/audit_panel.py` the
  door: `GET` / `PUT /api/admin/audit-panel`, `POST /api/admin/audit-panel/test`.
- **The password is SEALED** (`audit_panel_password`, `web_auth.seal_password`)
  and never comes back out — the Verifix model: the card says whether one is
  stored and whether it still opens; a blank field keeps it; «Parolni
  o'chirish» asks first. The action register records that it changed and its
  length. The login (`audit_panel_login`) and the address (`audit_panel_url`)
  are plain settings.
- **The address is what the browser shows** — pasted whole, query dropped, the
  path (or a hash route) kept as the hint of where the audits sit. Blank = the
  Service Desk dashboard, `https://dashboard.service.safiabakery.uz`. **It is an
  allow-list**, because it decides where the password goes: https on
  `*.safiabakery.uz` / `*.safiacorporate.uz`, or localhost with a port. The API
  is `api.<the panel's host>` (the Service Desk convention: Tasker and ARC's new
  app live on `api.dashboard.service.safiabakery.uz`), or the host itself when
  the API's address was pasted.
- **The test is a DISCOVERY, in four steps** (75 s budget, inside Cloudflare's
  100 s; the result is kept in `audit_panel_last_test`, shapes and masked
  samples only):
  1. **Panel sahifasi** — the panel's page and the JavaScript it loads, read
     breadth-first with audit-named chunks first (≤ 60 files, 8 MB each, 60 MB,
     28 s). No credential goes there; redirects are followed by hand and every
     hop must pass the allow-list. Out of it: the `…/api/vN/…` paths the
     screens call that name an audit / KRU / checklist / inspection, the audit
     routes, the API modules and hosts, and the login path the panel uses
     (`scan_code`, pure).
  2. **Kirish** — `POST /base/api/v1/v2/login` (the Service Desk's, known from
     ARC: username + password → JWT, 404 «Invalid Credentials» to a wrong
     password), then up to three login paths the panel's code names; JSON
     first, a form after a 422. **A rejection stops the tries** — a wrong
     password tried on five paths would be five failed logins on the account.
  3. **API tavsifi** — `/<module>/openapi.json` for every module the panel calls
     (+ tasker, audit, kru, base, the root), with the bearer; the audit-shaped
     endpoints of each document that answers (method, path, parameters).
  4. **Audit ro'yxatlari** — up to eight GET lists without a path parameter
     (the spec's first, then the panel's), five records each over the last 30
     days: the answer's total, its fields one level deep with their types, and
     three example records masked by `ops_door.mask_json`. A refused call keeps
     the API's own reason — a 422 names the parameters an endpoint requires.
- **Verdicts**: `found` (a list returned records) · `found_empty` · `login_only`
  · `login_rejected` · `no_login` · `unreachable` · `not_configured` ·
  `password_unreadable`.
- **The card** follows Verifix / Tasker: the connection form, the test card
  (verdict band, one row per step, folded lists of what was found), and «Topilgan
  audit ro'yxatlari» — one row per list (address · answer · records · fields);
  a row opens its fields and the masked sample.
- Verified with unit tests (`tests/test_audit_panel.py`: the allow-list, the
  code scan, login tries, sample shape and masking, chunk order, an off-list
  redirect) and end to end against a local stand-in panel in headless Chrome.
  **The real panel was not seen by the code's author** — its address, its login
  and its audit endpoints are what the first «Tekshirish» on production says.

### Next: the «Auditlar» page

Once the test shows the panel's lists: one page, KRU / Texnik as the page's
view tabs and «Ro'yxat» / «Tahlil» beside them on the same bar; the register
paged (`Pagination`), the analysis with charts chosen per figure (a trend of the
average rating, the distribution of scores, the weakest units, the violations).
The server reads the panel through this client; the fields come from
«Topilgan audit ro'yxatlari».
