# Navigation and the app shell

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## «Qidiruv» — the header search (2026-10-31)

The operator: a search in the empty header space between the page title and
the icons. `components/layout/GlobalSearch.jsx` — in the header from md up
(Layout mounts it only there), and on a phone at the top of the ☰ drawer
(`drawer`, mounted by Sidebar.jsx only while the drawer is open), because a
phone's header stays the title, the bell and the avatar. One box finds six kinds of
thing, each opening where it lives: **pages** (the sidebar's `ALL_LINKS`, by
the viewer's page access) → the page; **admin pages** (`config/adminNav.js`, by
capability) → `/panel/<id>`; **cells** → `/cells/:id`, printed as CODE
+ letter + leader · brigadir, never the workshop (typing a workshop name still
finds the cell, the /cells search rule); **brigadirs** → `/brigadir/:id`, for
a viewer who may open «overview»; **leaders** → `/profile/leader/:id` for
whoever manages profiles, else the cell they run.

- Cells, units and leaders come from ONE read, `GET /api/search/index`
  (`routers/search.py`, any approved session), asked the first time the box is
  used and cached like any query (offline too). Scope is the PLANT lock
  (`scoped_manager_ids`); archived units and cells are left out; a row with no
  unit is shown only to a viewer the plant does not narrow.
- `utils/searchFold.js` is THE match rule, applied to both sides: a word with a
  digit is a code (`latinFold` — «В2942» finds B2942), any other word is
  transliterated to Latin with kh/x→h, q→k, ye→e, yo→o merged. `matchScore`
  ranks; the kinds are ordered by their best match, so a name's own row comes
  before the cells that only mention it.
- Ctrl/⌘ K or «/» focuses it (never over a dialog; «/» not while typing), ↑↓
  walk, Enter opens, Esc clears then closes. At most 6/5/6/5/6 results a kind.
- The drawer variant: 16px text (iOS zooms into anything smaller), rows at
  least 44px, results overlaying the menu at the drawer's width, no shortcut;
  a pick also closes the drawer (`onPick`). A result opens on its CLICK — the
  list's mousedown is prevented so the box keeps focus; opening on mousedown
  let the release land on whatever the closing list uncovered.
- The sidebar's `ALL_LINKS` / `NAV_GROUPS` live in `config/navLinks.js` (the
  sidebar renders the search, the search reads the list — no import loop).
- **Workers** (from 2026-10-31, «Xodim kartasi»): the sixth kind, for a
  viewer who may open `people` — asked of `GET /api/people/search` (the Verifix
  directory, folded on the SERVER, within the viewer's reach) from 2 letters
  on, 250 ms after typing stops; up to 6, opening `/people/:employee_id`.
- Not built: concerns or tasks by text.

## «Ilovalar» — the app launcher (admins 2026-11-02, top-managers 2026-11-04)

The operator: «separate IMS into different apps just like Odoo … shown as
squares and icons». For an ADMIN and (from 2026-11-04, «split into apps also
for top-management») a TOP-MANAGER, `/` is a grid of app tiles
(`pages/AppLauncher.jsx`); every other role still gets the overview at `/`,
untouched.

- **`utils/launcherRoles.js` is THE list of launcher roles** (`LAUNCHER_ROLES`,
  `usesLauncher`) — a leaf, because App.jsx and DocumentTitle ride in the boot
  chunk and `config/navLinks.js` (the apps, their icons) must not. Every
  «does this viewer have the launcher» question asks it: HomeRoute, the
  sidebar, the header's grid button, the header search's `/overview` path and
  the tab title. A third role is one entry there.
- **A top-manager sees only the apps holding a page they may open** —
  `hooks/useLauncher.js` `may` is the sidebar's own rule (an admin: all;
  anybody else: a page link through the page-access matrix with its grants and
  denies, an admin-app page through a capability naming it, never an
  `adminOnly` link), and `apps` the APPS with at least one such page. The
  tile opens the app's remembered page only if they may open it
  (`appEntry(id, may)`), the sidebar inside lists only their pages
  (`linksOfApp(id, may)`), and an app holding none of them falls back to the
  whole register. Their tiles wait for page access (a loader, never a flash
  of every app); with no app at all the launcher hands «/» to `/overview`'s
  own gate (their first page, or «no access»). The People tile's /staff badge
  stays an admin's (the sidebar's badge rule — a top-manager approves nothing
  there), and the greeting's typing ends as THEIR last tile settles.

- **An app is a nav group** — `APPS` in `config/navLinks.js` (order, label,
  icon, `hue`). A link's `app` moves it into an app of its own: ARC, the
  overview, «Hisobotlar» (2026-11-03, the operator — out of the Laboratory
  app; its page access is unchanged, admins only by default, and for
  everybody else it stays in the Laboratory group) and the users-activity
  page are one-page apps; «HR» (2026-11-03, the operator — `BriefcaseBusiness`,
  hue `fuchsia`, after Liderlar) holds «Liderlar KPI» and «Brigadirlar KPI»,
  moved out of the Liderlar app by their `app: "hr"` (page access unchanged;
  for everybody else both stay in the Liderlar group); «Avtomatika»
  (2026-11-12, the operator: «add one app also called automation, and put the
  Ovens screen in there» — `automation`, `Cpu`, hue `amber`, after the
  Laboratory) holds «Pechlar», moved out of the Laboratory app by its
  `app: "automation"` — page access unchanged, so the tile shows to admins
  only until `ovens` is opened on the Access tab, and for everybody else the
  page stays in the Laboratory group; the `admin` app's pages are `ADMIN_PAGE_LINKS`,
  derived from `config/adminNav.js` (see «The admin app»), and its `sections`
  group them in the sidebar. The assistant has no tile — the header's button
  opens it everywhere. A new page joins its group's app by itself; give it
  `app` only to move it elsewhere. Fifteen tiles fill 3 / 5 / 7 columns and
  the short last row is CENTRED (a wrapping flex row, not a grid), so any
  count sits evenly. **A tile's name is ONE short word where it can be**: a
  name wider than a phone's tile (~96px at 360px) breaks mid-word, so the
  automation app is «Avtomatika» / «Автоматика», never «Avtomatlashtirish» /
  «Автоматизация» (the second fits at 375px and breaks at 360px). Amber is
  the hue because its look-alikes — the overview's gold by night,
  Production's orange by day — sit a row away; red, green and purple each
  had a twin NEXT to the tile. ARC is the repair department: its icon (tile and sidebar
  row) is `Repair` in `navLinks.js`, a wrench crossed with a screwdriver drawn
  on lucide's grid with `createLucideIcon` — plain `Wrench` is «Perenaladka».
- **The overview answers at `/overview`** for a launcher role (`adminPath`); the
  sidebar, the header search and `DocumentTitle` map `/` there. `/overview`
  works for every role (same `RequirePage`).
- **Inside an app the sidebar lists that app's pages only**, under its
  name (a one-page app shows just its row). A page no app lists (a profile, a
  notification, a leader's day report) keeps the app it was opened from —
  `utils/apps.js`, sessionStorage `appOpen`; with none, the whole grouped
  register shows as before. The header's grid button (`.hdr-apps`, beside the
  title) and the sidebar logo lead back to `/`. The sidebar footer carries no
  «Admin» link for anybody: admins open the admin app from its tile, and a
  capability grantee sees the admin pages their grants open as rows of their
  own sidebar (see «The admin app»).
- **A tile opens where the app was left** (localStorage `appLastPage`), else
  its first page. The People tile carries the /staff queue count (same query
  key as the sidebar's badge).
- **Light by design:** the launcher fetches one count and imports no chart, so
  an admin's start no longer pays for the overview's requests and ApexCharts.
  `preloadOpenedRoute` preloads the launcher, not the overview, once
  `HomeRoute` has marked the device (localStorage `homeLauncher`).
- Tile colours: `[data-app-hue]` in `index.css` — one rgb triple per app,
  darker shades under the light theme; the sidebar's app label reuses it.
- **The look** (2026-11-03, the operator's SECOND pick that day — the first,
  a frosted tile on a cloud by day and a neon tile by night, read «from
  2012»): **Liquid Glass**. ONE recipe for every tile and both themes
  (`.app-glass`): a clear pane with a 7% breath of the app's hue — the
  night mock's transparency in BOTH themes («we liked the opacity on the
  dark mode»), then made clearer still on v4.400.1 («background should be
  visible through the icons»: the cloud behind each tile .14 by day / .3 by
  night, a 4px blur at 125% saturation — the first cut's 18px / 170% smeared
  the cloud across the tile into a solid square) — a SOFT rim in a DARKER
  shade of the app's own colour (`--rim`: 600 by night, 800 by day — the
  operator, 2026-11-03: «border of icons shouldn't be white», then «opacity
  lower and blurry»: a .22 hairline plus a 4px blur inside and out, drawn as
  shadows since a mask re-cuts a blur sharp; no white inset edge line), a
  still specular pool, a backdrop blur taken from 768px up only
  (thirteen blurs over floating art are a repaint every frame on a phone;
  below that the gradients alone are the glass); the glyph wears the hue at
  full strength, never white. The header over the backdrop is the same glass
  — dark by night; by day the SOLID band's chocolate of v4.395.2 (#6a3c25 →
  #4a2714) at ~0.82 with a light 12px blur and no saturation boost (the
  operator, v4.400.3: «I liked the previous color … glassy, but not too
  much» — the lighter .70 glass with saturate 160% read orange), blurred from
  768px up (`.hdr-on-backdrop`). By day the tile NAMES wear that chocolate
  too (#573019, #3d200f on hover). The photos stay for now; a flat SVG cartoon set was
  mocked and approved for a later pass.
  The backdrop (`components/launcher/LauncherBackdrop.jsx`, handed to
  Layout's `backdrop` prop — it must live there, since inside `.page-enter` a
  fixed box is sized to the content column; it runs under the HEADER too —
  `.hdr-on-backdrop`: by night a dark pane, by day a solid CHOCOLATE band,
  the coffee bean's brown (the operator, v4.395.2: «not light like this»),
  which carries its own dark-style colour tokens so the controls and the
  menus that open inside the header read light-on-brown; and it sits at
  `z-index: 20`, because its backdrop-filter makes it a stacking context and
  without that the search results, the bell and the account menu painted AND
  hit-tested under `.page-enter` and the tiles — 2026-11-03, the results
  showed through the tiles and a press on one went to the launcher) follows the operator's reference
  image: a warm golden gradient with Safia's products floating at different
  depths — near ones sharp with a soft shadow, far ones out of focus, the big
  ones cut by the screen edge. Only the TAKEAWAY CUP and MACARONS (pink,
  pistachio, chocolate) float, drawn as CARTOONS in one soft-clay SVG style
  (the operator: «cartoonish like the coffee», v4.396.0; real cut-out photos
  were tried in v4.394.0 and replaced; cakes, a latte, a croissant and a
  coffee bean were dropped in v4.396.1 as «too much distracting» — do not
  bring them back unasked). A hidden sprite of `<symbol>`s (`lo-cup`,
  `Macaron`), no image files; the blur and shadow are SVG filters rasterised
  with each object, so the browser only moves finished layers. A new product
  is one symbol and one `FLOATS` row. They keep to the edges — on a phone only the ones clear of
  the tiles show (`wide` = desktop only). By
  night the same scene sits under a dark veil with gold dust. Motion is slow
  on purpose («loyalty, peace, premium»): the tiles gather in on arrival, the
  clouds breathe and turn one after another as a wave, a band of light
  crosses the tiles in turn, the treats bob and turn a few degrees, a tile
  lifts on hover, the People badge ripples. **Only opacity and transforms
  animate** — never a CSS filter, blur, box-shadow or backdrop-filter — so a
  phone's compositor carries it; the light pools are size-capped GPU layers;
  prefers-reduced-motion stills all of it. Two
  triples per hue: `--hue` (glyph by night, sidebar label) and `--glow`
  (cloud and day tile, 500 shades), plus `--cloud` where the 500 shade reads
  as a shadow behind its tile (gold → brown, slate → grey). A cloud's
  ellipses must end INSIDE its box, or the box edge cuts a visible rim.
  **Keep the tile clouds faint** — the operator found the first cut «too much
  background shadow» (v4.390.1–2); the golden backdrop with its shadows came
  after, with «don't worry about shadows for background» (v4.392.0). By day
  the gold tile (Overview) takes a deeper gold, or it sinks into the ground.
- **«Xush kelibsiz, {name}!» heads the tiles** (2026-11-03, the operator) —
  `apps.hello`, the signed-in profile's name as the header prints it (`tl`),
  the name and its «!» kept on one line together (`.apps-hello-who`). It is
  TYPED (the operator, same day): each letter `.apps-hello-ch` is held
  invisible for its `--d` and then simply there, on an uneven beat with a
  breath after punctuation (`typingPlan`), stretched to start at 120ms and
  land the LAST letter as the last tile settles (`TYPE_END`, from the tiles'
  own 55ms / 60ms / .9s — keep in step with index.css), a caret after the newest letter
  that blinks four times at the end; never a 1ms step with a fill — float
  rounding left letters hidden. A screen reader reads it once from a
  `sr-only` copy. On a
  phone its height is paid back (smaller top padding, 12px tile padding) so
  the last row still clears the bottom-corner treats.
- **Not built:** the launcher for shift-managers, supervisors and leaders,
  per-app language packs.

## The admin app (`/panel/<id>`, from 2026-11-03)

The operator: «treat the admin as a separate app, and treat these tabs as
pages». Until then the admin tile opened ONE page, `/admin/upload`, whose 29
destinations swapped by `?tab=` behind a sidebar and a bottom sheet of their
own (`pages/admin/AdminPanel.jsx`, deleted). Now every destination is a PAGE
of the `admin` app, exactly like the pages of the other launcher apps. The
plan, and the alternative not taken, is `docs/plan-admin-app.md`.

- **The URL is `/panel/<id>`**, `/panel` the app's home. The operator chose it
  over `/admin/<id>` (2026-11-03): `/admin/*` is still the BACKEND's API
  prefix (`routers/admin.py` and three more routers answer there, and
  `GET /admin/users` is an API route), so pages there would have meant moving
  the API first. `/panel` collides with nothing: no backend route, not in
  `sw.js`'s pass-through list, not a server path for the Android bundle, not
  in nginx's or the supervisor's backend-only list.
- **The old address redirects, permanently** — `/admin/upload?tab=X` →
  `/panel/X` with every other query parameter kept (`LegacyAdminRedirect` in
  `App.jsx`; the bot's registration button carries `status=pending`), and
  `/admin` / `/admin/upload` → `/panel`. Telegram messages already sent hold
  the old URL for as long as the chat exists. `SPA_ADMIN` in `sw.js` and the
  supervisor's `_SPA_ADMIN` stay for exactly these two redirect paths.
  `POST /admin/upload` is still the backend's old attendance upload — a
  different thing at the same path.
- **`ADMIN_NAV` in `config/adminNav.js` is the single source of truth** for
  order, sections, icon, label, description and capability key. Everything
  else derives from it: `ADMIN_PAGE_LINKS` (`config/navLinks.js`, the sidebar
  and `utils/apps.js`), the header search, the tab title (`DocumentTitle`
  imports it lazily so its icons stay out of the boot chunk). `adminPage(id)`
  is the path, `adminAllows(n, isAdmin, capTabs)` THE access test,
  `firstAdminPage` the landing page. Never introduce a second parallel list.
  The ONE other per-page list is `pages/admin/adminPages.js` — the lazy
  component map, id → `lazyWithReload(() => import(...))`, nothing else; a new
  page is an `ADMIN_NAV` entry plus one line there.
- **`pages/admin/AdminPage.jsx` is the frame** every `/panel/<id>` renders
  (`PanelRoute` in `App.jsx`, keyed by id so a move between two admin pages
  mounts a fresh Layout like any other navigation): access per page (an admin
  every page; anybody else only what their capabilities name — a page they
  may not open lands them on the first one they may, with the amber
  `admin.tabDenied` band; none at all → `/`), `Layout title` = the page's own
  name, ONE content column (`max-w-6xl`, so the column's edge never moves),
  the one-line `admin.desc.<id>` with the red «Xavfli» chip on a danger page,
  and a skeleton while the page's chunk loads. A page renders **no frame of
  its own** — no `max-w-*`, no `mx-auto`, no outer padding. The one
  exception to the column is a page marked `wide: true` in `ADMIN_NAV`, which
  gets the full content width — a canvas, not a column of forms (the org
  chart, `docs/org-chart.md`). `AdminHome`
  (`/panel`): an admin lands where the app was left (`appEntry("admin")`),
  else its first page; a grantee on their first allowed page.
- **Each page is its own chunk** (the one 649 KB `AdminPanel` chunk is gone).
  `preloadOpenedRoute` preloads the frame and the page for a `/panel/<id>`
  address.
- **Navigation is the app's sidebar.** Inside the admin app the sidebar
  groups its pages by `APPS.admin.sections` (= `ADMIN_GROUPS`, four folders
  with their own icons, the accordion the register uses), in order of how
  often they are used and how much they can destroy: **Kunlik ish** →
  **Odamlar va ruxsat** → **Vositalar** → **Xavfli** (red folder, red icons;
  never put a data-destroying tool next to a daily one). On a phone the ☰
  drawer is the same list. A capability grantee has no launcher, so the
  admin pages their grants open are rows of their own sidebar, under an
  «Admin» section (`NAV_GROUPS.admin`) when the list is long enough to group;
  an admin with no app open sees them there too.
- **Unsaved edits: `useLeaveGuard(isDirty)`** (`hooks/useLeaveGuard.js`; the
  provider is `components/layout/LeaveGuard.jsx`, mounted by `Layout`, so any
  page may use it). While any caller is dirty, ONE capture-phase click
  listener asks («Saqlanmagan o'zgarishlar») before an in-app LINK to another
  path is followed — the sidebar rows, the logo, the launcher button, the
  bell, a link inside the page — and `useGuardedNavigate()` does the same for
  code that navigates (the header search). Thirteen admin pages call it (the
  page-access matrix, translations, permissions, broadcast…); any page holding
  a local draft must. Not covered, as before: the back gesture (it needs a
  data router's `useBlocker`) and closing the tab.
- **Links into the app** use `/panel/<id>` everywhere — the frontend's deep
  links (AI keys, Verifix, Trello, broadcast, profiles, data sources…), the
  bot's buttons, the notification links (`notification_center.link_for`
  `admin_tab`), the server's DMs. A destination added by splitting an
  existing one carries `capKey` pointing at the original id, so the split
  cannot narrow any grantee's access.
- **Sidebar counts on two admin pages (2026-11-06)** — a red number beside
  «Foydalanuvchilar» (registrations waiting: `TelegramUserRole.status =
  'pending'`) and «Verifix sinxron» (suggestions waiting:
  `VerifixSyncItem.status = 'open'`), bubbling onto the collapsed folder and
  showing as a dot on the icon rail, like `/staff`'s. ONE endpoint feeds both,
  `GET /admin/nav-badges` (`verify_admin`, two COUNTs), polled every 60 s from
  `Sidebar.jsx` into its `BADGES` map, keyed by the page's path. **Admins
  only**: a capability grantee who opens the page through `users.manage` sees
  no count. `/admin/users` and `/api/admin/verifix-sync` return whole registers
  — never poll them for a number. A third count is one more key in the
  endpoint and one more line in `BADGES`.

## The profile page is one column (`/profile`, `/profile/:ptype/:pid`, 2026-11-11)

The operator, 2026-11-11: the page «lacks a life» — clean, nothing overlapping
on any screen, several colours with none of them taking the page over.
`pages/Profile.jsx`, both views (own and manage):

- **The identity header** (`ProfileHero`): a band in the ROLE's hue with the
  role's icon faint in it, the photo standing on its edge, the name, the role
  chip, one context line. The hue is `ROLE_COLORS` in `utils/chartPalette.js`
  — the Users register's chips read the same map (admins have none there; the
  header gives them indigo).
- **Three facts under the name** (`ProfileFacts`) answer «can this person get
  in»: Telegram linked · the site login · the last sign-in. So the «bound»
  chip and the cards' «last login» line are gone — said once, at the top. A
  fact's value WRAPS, never cuts: the login or the date is the whole tile.
- **The photo's actions sit on the photo**: a camera badge picks a file; once
  there is a photo, a ⋮ on the band offers replace / delete (`usePhotoActions`
  — one picker, one confirm dialog). The two buttons and the format hint left
  the header (the hint is the badge's tooltip; a refused file says why).
- **One column of full-width cards**, never two side by side — their heights
  follow their content. A card splits in two INSIDE (`@xl:grid-cols-2`), and
  that asks the COLUMN's width, not the viewport's: the page column is a
  `@container`, because the sidebar takes 256px of a tablet and a viewport
  breakpoint would split a 460px column. A new two-column block on this page
  uses `@xl:` / `@2xl:`, never `sm:` / `lg:`.
- **One hue per section**, worn only by its icon chip (`SectionHead`'s `color`):
  details blue, site login purple, Telegram sky, danger red. Gold stays the
  action colour.
- **Save is a bar at the bottom, there only while something is unsaved**
  (`SaveBar`). The header's always-present disabled button is gone, and with
  it the «is the header button on screen» observer. Still ONE save for the
  form and the login rename (`useSaveTarget`).
