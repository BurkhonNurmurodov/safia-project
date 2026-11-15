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
- **Not built:** changing anything from the PEOPLE chart (the «Ilovalar» view
  below is the one that is edited), cells or workers as nodes, an export, the
  chart for anybody but an admin.

## «Ilovalar» — the launcher's apps, menu tabs and screens on the same chart (`?v=apps`, 2026-11-15)

The operator, on a screenshot of the chart: «I should be able to switch this
org structure to see not people but also to see apps/menu tabs/screens. From
this place, I should be able to change order, or create/delete new app, move
screen or menu tabs from one to another or create/delete new menu tabs, move
screens from one menu tab to another. And most importantly, see/change what
type of users and which users can see them».

A `SegmentedToggle` heads the toolbar: **«Odamlar» | «Ilovalar»**
(`?v=apps`; a switch closes the open panel — a node id means something in one
view only). `pages/admin/OrgChart.jsx` is the shell (the switch, the chart's
data, the draft and its save bar) over `OrgPeople` (the chart above, unchanged)
and `pages/admin/OrgApps.jsx`.

- **The tree** (`utils/orgTree.js` `buildAppsTree`): the platform → each app →
  its menu tabs → the screens. An app with no menu tab holds its screens
  directly; one with some gets a «Menyu tabsiz» node for the screens that sit
  under the app's own name. Screens in NO app (the assistant, as shipped) hang
  under a dashed «Ilovaga kirmagan». It is drawn **top-down like the people,
  with the screens alone as a column** (the operator, 2026-11-15, an hour after
  the first cut, which ran left to right: «make everything horizontal except
  from screens»): the apps in a row under the platform, an app's menu tabs in
  a row under it, and the screens of an app or a menu tab as ONE column under
  it, however long (`layoutTree`'s `stack` — `APPS_STACK` = screens only, one
  column; the people's rule, ≤ 8 rows × ≤ 4 columns of any leaves, is
  unchanged). Fourteen apps side by side are ~3 500px, so the first sight
  keeps the platform in the middle and the row runs off both edges, to drag
  (`homeMin` 0.65 here). `OrgCanvas` is the same canvas — a leaf is a person
  there and a screen here; `sceneKey` keeps an edit (a new tree object every
  time) from re-fitting the view.
- **The structure is a LAYOUT, stored** — `services/nav_layout.py`, one
  `app_settings` row `nav_layout`; its record is `docs/navigation-and-shell.md`
  «The launcher's structure is a layout». From here: the order of apps, of an
  app's menu tabs and of the screens in a list (`SortableList` in the panel of
  the node that HOLDS them); a new app or menu tab (`NavFormModal`: a name in
  four languages through `LangTextInput`, an icon from `config/appIcons.js`, a
  tile colour); renaming / re-iconing any of them (one the code ships keeps its
  own name while the field is blank); a screen moved to another app / menu tab
  / no app (two `StyledSelect`s on the screen's panel); a menu tab moved, with
  its screens, to another app; an app or menu tab taken away. **A screen is
  never lost**: removing a menu tab leaves its screens in the app, removing an
  app asks where they go (`RemoveAppModal`), and the Admin app cannot be
  removed. «Standart tuzilma» goes back to what the code ships.
- **Who sees a screen** — on the screen's panel: one tick per ROLE (the Access
  matrix's row for its page key; a screen answering to several keys shows each)
  and the PEOPLE it was opened for or closed to one by one (`page.view.<key>`
  entries on a position — or a login's, which can be removed here and are added
  on «Shaxsiy ruxsatlar»), with the scope picker where the page has one. An
  app's and a menu tab's panel carry «Kim ko'radi»: per role how many of its
  screens it opens, and a tick that opens or closes ALL of them. An `adminOnly`
  screen and an admin-app page say why they cannot be opened to a role (the
  latter lists the capabilities that open it and who holds one). «Kim ochadi»
  switches to the people chart with that page's lens on (`?pg=`).
- **Two lenses**: «Rol» and «Xodim» light up the screens a role or ONE person
  opens (`profileOpens` — the sidebar's own rule), a folded app says how many;
  a card's subline says «Hamma rollar» / «Adminlar + N ta rol» / «Faqat
  adminlar», a lock marks a screen no role can be given, a blue key a personal
  entry, a gold dot an unsaved change.
- **Everything is a DRAFT until «Saqlash»** (`pages/admin/useAppsEditor.js`,
  held by the shell so it survives a look at the people chart; `useLeaveGuard`).
  The bar sits in the canvas's top-right corner in both views — an overlay, it
  never moves the chart. A save sends up to three things: `PUT
  /admin/nav-layout` (the whole layout, or `null` when it equals the code's),
  `PUT /admin/page-access` (the matrix read FRESH with only the ticks changed
  here applied — it never undoes what somebody ticked on «Sahifa ruxsatlari»
  meanwhile), and one `PUT /admin/capabilities` diff per person. Taking a page
  away from a role is read back first, in the Access matrix's own dialog. A
  failed step keeps the rest of the draft and shows the reason.
- **Access rules are not repeated here**: the ticks are the matrix's, the
  personal entries are capabilities, both saved through the endpoints the two
  registers use. Moving a screen changes who sees an app's TILE (whoever opens
  one of its screens), never who may open the screen.
- Words: `pages/admin/orgAppsText.js`. The checks that were run: the default
  layout draws what the launcher drew before (a node script over
  `utils/navLayout.js`), and the page driven in headless Chrome on stubbed data.
- **Not built:** dragging a card on the canvas (order and moves are in the
  panel), hiding a screen, renaming a screen, the grouped sidebar of the roles
  without the launcher, an undo beyond «Standart tuzilma».
