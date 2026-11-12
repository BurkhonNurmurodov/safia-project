# The org chart

Moved-in record of «Tashkiliy tuzilma» — the admin app's chart of everybody
on the platform.

## «Tashkiliy tuzilma» — the org chart (`/panel/orgchart`, 2026-11-12)

The operator (with a reference picture of a classic org chart): «We need
Organizational chart in Settings app to see organizational structure of our app
and pages access and personal grants. And also we have to be able go to
Employee card from there».

One page of the admin app, FIRST in «Odamlar va ruxsat» (`ADMIN_NAV` id
`orgchart`, `Network`, no `capKey` — it shows the whole permission system, so
it is admin-only and never grantable, the `permissions` model). **Read-only**:
every change is still made on «Sahifa ruxsatlari», «Shaxsiy ruxsatlar» and the
profile page, which the chart links to.

- **The tree** (`utils/orgTree.js` `buildTree`): company → the role tiers that
  hang on no unit (top-managers, shift-managers) → each plant → its shifts →
  brigadirs → their leaders → then leaders of no unit, «Kutish mas'ullari»,
  guests, admins. A top- or shift-manager hangs on NO plant: since 2026-11-04 a
  shift-manager's shift and plant decide nothing (`docs/cells-and-org.md`), so
  a place under a plant would draw a boss the units do not have. Units on no
  plant (or an archived one) hang under «Zavod biriktirilmagan» — visible,
  never padded onto a plant. Archived units are left out; a leader whose unit
  is archived (or none) is under «Brigadirsiz liderlar». Cells are not nodes —
  a leader's and a unit's are chips in the panel (`CellLink`).
- **The server sends profiles FLAT** (`GET /admin/org-chart`, `verify_admin`,
  `services/org_chart.build`): each with its place (`factory_id`, `shift`,
  `unit_id`), Verifix id, photo version, cells, logins and access. Which tier
  sits where is the page's business. One sweep per table — never a query per
  profile.
- **Access is the guards' answer, not a second rule.**
  `org_chart.resolve_access` repeats `capabilities.caller_caps`,
  `caller_denied_pages` and `capability_pages` over rows read once and hands
  the verdict to `permissions.role_can_access` itself. It answers twice per
  profile: for the POSITION (what a browser login, or any login without entries
  of its own, opens) and for each LOGIN that has entries (`account=True` — the
  login's grants on top, its denies standing, its page grant re-opening a
  position's deny). Each open page says why: `role` (the Access matrix),
  `grant` (a `page.view` scope; «all» where `leaders.admin` /
  `production.catalog.sap` read the page whole), `caps` (action capabilities
  implying it). **A rule changed in `capabilities.py` must be repeated there**;
  `tests/test_org_chart.py` pins the pairs.
- **A card** (`components/orgchart/OrgCanvas.jsx`): the profile's avatar, name,
  a dot in the role's own hue (`chartPalette.ROLE_COLORS`, the profile page's
  glyphs — `orgNode.js`) and the role. A blue key = a personal entry somewhere
  (the position's or a login's, a grant or a closed page); a DASHED card with a
  grey avatar = a position nobody has claimed. The pill under a card folds /
  unfolds its branch («+N»).
- **The layout** (`orgTree.layoutTree`): a tidy tree, but children that are
  all leaves are STACKED in columns under their parent (≤ 8 rows, ≤ 4 columns)
  — a brigadir's leaders side by side made an opened shift ~10 000px wide.
- **The canvas**: drag anywhere (a card too — a press that did not move is the
  click), pinch with two fingers, wheel pans, Ctrl/⌘ + wheel zooms at the
  cursor; − / % / + and «Markazga» bottom right, «Hammasini ochish / yig'ish»
  bottom left. **A fit never shrinks below 90%** (`K_HOME_MIN`): the whole of
  an opened plant fitted to the screen was a row of specks at 30%, so a tree
  wider than the screen keeps its root in the middle and runs off both edges.
  Folding or unfolding a branch keeps the pressed card where it is on screen.
  The scene is memoised apart from the view, so a drag re-renders one
  transform, not two hundred cards.
- **The panel** (`OrgDetails.jsx`; a side panel over the canvas's left edge
  from 1024px, a `Modal` below): **«Xodim kartasi»** (`/people/<Verifix id>`;
  by name through `/people?find=` for plant staff with no id tied yet; hidden
  for a guest or an admin without one, and for a viewer who may not open
  `people`), «Profil» (`/profile/<role>/<id>`), «Ruxsatlar»; the plant, shift,
  brigadir (pressable — jumps to their card) and cells; the logins (each opens
  `/tg-user/<id>`; last activity; a browser login); the pages as chips —
  neutral = by role, blue key = personal (with its scope where the page has
  one), red struck = closed; «Ruxsat berilgan amallar» only when there are
  any; and under a login that has entries of its own, exactly what it holds
  beyond or short of the position. A tier's panel lists the pages its role
  opens for everybody; a plant's, a shift's and the company's their make-up.
  `?n=<node id>` IS the open panel, so «back» from the card returns to the
  same person.
- **Three ways in**: the picker (a searchable `StyledSelect` of everybody)
  brings one person to the middle; **«Sahifa»** lights up everybody who may
  open one page (green tick = the position opens it, yellow = only some of its
  logins); **«Belgi»** lights up the exceptions — a personal entry, a closed
  page, no login, a browser login. Under a lens everybody else is dimmed, a
  folded branch holding matches says how many on its pill («● 3 / 12»), and
  the ‹ › on the lens's summary walk the matches one by one. **Nothing unfolds
  or zooms by itself** — the first cut unfolded the way to every match and
  fitted the lot, which left a tree nobody could read.
- The opened branches are remembered per device (localStorage
  `orgchart.open`); by default the company and its plants are open.
- `AdminPage` gives the page the full content width: `wide: true` on its
  `ADMIN_NAV` entry (a canvas, not a column of forms).
- Words: `pages/admin/orgChartText.js` (four languages, beside the page);
  role, page, capability and scope names come from the platform's own keys.
- **Not built:** changing anything from the chart, cells or workers as nodes,
  an export, the chart for anybody but an admin.
