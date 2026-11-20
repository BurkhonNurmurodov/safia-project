# Permissions — what can be granted

## Everything is grantable (2026-11-19)

The operator: «it's not possible to give permission to all pages and all
functionalities on the permissions page. Make sure every single
functionality and page can be granted on that page and listed.» Asked
whether the Permissions tab itself and «Backup» (a full database restore)
should be grantable too — the two grants that hand their holder the whole
platform — the answer was **literally everything**.

Until then the catalog (`backend/app/capabilities.py`) held 14 hand-listed
actions and one `page.view.<page>` per page key. Eighteen admin-panel pages,
eight admin-only app pages and every admin-only button inside an otherwise
grantable page answered `role == "admin"` and nothing else.

**The catalog now has three generated families beside the hand-listed
actions** — generated, so a new page is grantable the day it ships, and
labelled from the page's own nav label (`frontend/src/utils/capLabel.js` is
THE name of a capability, wherever one is printed), so they need no
`caps.*` strings:

| family | what it opens | listed under |
|---|---|---|
| `page.view.<page>` | one page (three states: inherit / grant / deny; own / all where the page narrows) | «Sahifalar» |
| `page.admin.<page>` (`ADMIN_PAGES`) | everything an admin does ON that page: its admin-only buttons, switches, `can_edit` flags and the whole-plant view (`page_scope_is_all` answers true) — and the page itself | «Sahifalardagi admin huquqlari» |
| `admin.tab.<id>` (`ADMIN_TABS`) | one admin-panel page and every endpoint it calls | «Admin paneli sahifalari» |

- **The admin-only app pages became page keys** — `workers-composition`
  (Tarkib), `doc-audit`, `trello`, `audit`, `tg-user`, `gamification`,
  `targets`, `verifix-test` (all eight /verifix/* pages): admin-only by
  default (`DEFAULT_PAGE_ACCESS` = []), opened for one person here or for a
  role on the org chart. `tg-user` needs an id, so it is never a landing page
  (`noLanding` in `config/pages.js`).
- `ADMIN_PAGES` lists only pages with a real admin power: zagruzka (band
  editors), downtime, staff (also covers /daily — both run on the staff
  endpoints), shift-daily (the status-band editor), production, trudoyomkost
  (the call forecast's autocall), cells (⊇ `admin.cells.manage`, plus the
  «KPI hisoblanadi» switch), concerns, tasks, setup, idle-cell, arc, live,
  ontime, kelish, leaders-kpi, education, assessment, people, api,
  container-flow, idle-solutions. A row that would grant nothing is not
  listed. The «Yordamchi» configure button follows `admin.tab.aikeys` — it
  opens that admin page.
- `PUT /admin/settings` holds every app setting, integration secrets
  included, so a grantee reads and writes only the keys of the editor its
  grant opens (`admin._setting_keys_for`): zagruzka → the band keys, ontime /
  shift-daily → `status_bands`, `admin.exam.manage` → the exam keys.
- `admin.tab.orgchart` may write `page.view.*` entries through
  `PUT /admin/capabilities` (the «Ilovalar» personal entries) and nothing
  else; the rest of that door is `admin.tab.permissions`.
- `/leaders` keeps its older twin: `page_admin(db, p, "leaders")` asks
  `leaders.admin`. `/idle-solutions` is no page key (it opens per role,
  `open_to`); its `page.admin.idle-solutions` opens it past the roles
  (`RequireRoles cap=`, and the nav link's `cap`).
- **The guards**: `require_tab(id)`, `require_page_admin(page)` and
  `require_cap(...)` as dependencies; `page_admin(db, payload, page)` and
  `is_admin_or(db, payload, *caps)` inside a handler; `adminOn(page)` from
  `useCapabilities()` in the browser. **Never re-spell a power check as
  `role == "admin"`.** `verify_admin` is still defined but no endpoint may
  depend on it: `backend/tests/test_everything_grantable.py` walks every
  route and fails the commit gate on one that does, on an admin page no
  capability opens, and on a `page.admin.*` name the catalog lacks.
- **What did NOT become a grant — identity, not powers.** Only a real admin
  creates, renames, deletes or assigns an ADMIN identity, so no grant turns
  its holder into an admin; who receives a message, how an author is named,
  impersonation and the login stay as they were. A holder of
  `admin.tab.permissions` can hand out every grant, themselves included —
  the operator's call.
- Additive like every grant: nobody's current access changed on deploy.

## On a phone (2026-11-20)

See `docs/leader-phone.md` — «a leader deletes no concern at all» — an identity rule in `routers/concerns.py` `may_delete`; no grant (`page.admin.concerns` included) reopens it. md+ is unchanged.
