# Plan — custom roles: roles · permissions · scopes · functions

**Status (2026-11-02): analysis done, a model DRAFTED, open questions in §4.
Nothing is built and no page is designed** — the operator asked to plan the
STRUCTURE first. The ask: a role system where custom roles can be created and
given permissions, every role the platform has today recreatable from scratch,
with new models for roles, permissions, scope and functions, and Verifix kept
in mind.

Sources: six read-only inventories taken on `main` at `7ea5b88` — the
capability / permission / identity layer, every router (both halves), every
scope helper, the roles / profiles / registration / Verifix-sync / bot layer,
and the frontend gating. File:line references below are from those passes.

---

## 1. What exists today

### 1.1 Seven roles, and what each one IS

| Role | Storage | The profile is attached to | `role_id` in the JWT | Created by |
|---|---|---|---|---|
| admin | `admins` (telegram_id, profile_id) **+** a `role_profiles` row | nothing | None (switcher sentinel `0`) | seed / `/adminreg` claim; approval DELETES the role row and inserts an `admins` row |
| top-manager | `role_profiles` | nothing | profile id | Profiles tab |
| shift-manager | `role_profiles` (`shift`, `factory_id`; NULL plant = every plant) | shift ∩ plant | profile id | Profiles tab; plant on «Zavodlar» |
| supervisor (brigadir) | **`managers` — the profile IS the unit row** (`shift`, `factory_id`, `zagruzka_on`, `supervisor_kind`, `vfx_employee_id`, `name_aliases`) | the unit | **`managers.id`** (= the unit = Verifix file id) | Profiles tab (needs a Verifix id + shift); the Verifix sync's `new_unit` tap |
| leader | `role_profiles` (`manager_id`, `leader_kind`, `checklist_shift`, `owes_from`, `vfx_employee_id`) | its unit; cells it RUNS (`cells.leader_id`); cells it OWNS (`cells.owner_id`) | **the UNIT's id** — the profile is found through `role_ref` / `profile_key` / name | Profiles tab; the Verifix sync (a seat with no profile → a profile, AUTOMATIC); a brigadir's «Boshqaruvchi» pick |
| guest | `role_profiles` (names NOT unique) | nothing | profile id | self-registration (typed name) or Profiles tab; zero pages by default |
| idle-owner («Kutish mas'uli») | `role_profiles` + `idle_category_owners` (category UNIQUE → profile_key) | its categories | profile id | Profiles tab + «Kutish mas'ullari» |

The role STRING decides the table, the identity derivation
(`identity._DIRECT_ROLES`), the scope kind, the native authority inside every
router, the registration code path, the bot's branches and the labels. It is
spelled in six server lists and about ten frontend lists (§1.6).

### 1.2 Three permission stores — and a fourth that is code

1. **Role × page matrix** — one JSON blob (`app_settings.page_access`),
   role string → pages, over `TOGGLEABLE_ROLES` (admin implicit, never stored).
   A stored per-page list SHADOWS the code default, so every later default
   change needed a startup one-shot (six so far). Edited on the Access tab.
2. **Capabilities** — `profile_permissions` (per PROFILE, live) and
   `user_capabilities` (per ACCOUNT): 16 action capabilities + 34 generated
   `page.view.<page>`; mode grant | deny (deny for the page family ONLY);
   scope own | all (own meaningful on the 10 `SCOPED_PAGES`). A capability
   implies its page; two of them (`leaders.admin`, `production.catalog.sap`)
   also read their page as «all» (`_READS_PAGE_WHOLE`). Edited on the
   Permissions tab — admin-only, never grantable.
3. **The idle category register** — `idle_category_owners`: the whole reach
   of one role, outside the catalog.
4. **Native authority in code** — the per-role ladders inside ~70 routers:
   who may approve, close, file, pick, rule. Literal role comparisons:
   **~530 in 141 backend files** (admin 88 · top-manager 29 ·
   shift-manager 78 · supervisor 131 · leader 184 · guest 18 · idle-owner 4),
   **104 in 38 frontend files**, ~20 in the bot.

### 1.3 How a request is decided today

admin short-circuits everything → page DENY (account; else profile, unless
the account holds a grant) → role × page matrix → personal grant
(`page.view.*`, or an action capability's implied pages) → then, INSIDE the
endpoint, a hand-written ladder on `payload.role` decides the rows and the
writes. For actions: admin → account grant → profile grant; no deny.

### 1.4 Eleven scope dimensions a viewer is narrowed by

PLANT (`managers.factory_id` through the unit; `role_profiles.factory_id` for
a shift-manager) · SHIFT (a lock for the shift-manager ONLY — everywhere else
`?shift=` is a toolbar filter) · UNIT (`role_id`) · CELLS RUN
(`cells.leader_id`, dated through `cell_links`) · CELLS OWNED
(`cells.owner_id`, dated) · OWN PROFILE / OWN FILINGS (+ the same-person fold
`leader_profile_ids_of`) · IDLE CATEGORY · ROW OWNERSHIP (author profile) ·
THREAD MEMBERSHIP (@mentioned into an appeal) · DAY / TIME WINDOWS
(write-side business rules: today/tomorrow on /kelish, closed day, close
window, late window, `owes_from`, catalog dating) · PAGE.

Conventions that must survive any redesign: `None` = no narrowing and `[]` =
a real empty answer (`empty_scope`); a plant lock is never lifted by a page
grant; a «see all» grant widens READING only; a NULL plant on a unit reads as
unlocked (every plant), a NULL shift on a shift-manager reads as nothing.

### 1.5 Reach per role today (condensed)

| Role | Plant | Shift | Unit / cells | Own rows | Category | A page whose ladder does not name the role |
|---|---|---|---|---|---|---|
| admin | free | free | all | — | free | everything |
| top-manager | free | free | all on most pages; **nothing** on /staff and the live doors | — | free | all, read-only (concerns, tasks, leaders, documents) |
| shift-manager | locked (profile) | locked | shift ∩ plant — **but plant-wide** on /leaders, the appeals, requirements, /workers, /leaderboard, /plan, /reports, turnover, quality | — | free | — |
| brigadir | locked (unit) | — | own unit (+ exchanges addressed to it on /staff); /cells read-only own unit | — | free | — |
| leader | locked (unit) | — | cells RUN (production, idle-cell, kelish, checklist, auto checks); run ∪ owned (leaders-kpi, people) | own filings (leaders, tasks, concerns, appeals) | free | — |
| guest | free | free | **inconsistent**: nothing on /staff, /kelish; 403 on /people; EVERYTHING on /leaders, /tasks, /idle-cell, /setup, /cell-attendance | — | free | varies per page |
| idle-owner | free | free | every cell on /idle-cell (read-only) | — | **locked** | varies |

### 1.6 Where the role strings live

Server: `permissions.TOGGLEABLE_ROLES`, `auth.VALID_ROLES`,
`profiles.PROFILE_TYPES`, `identity._DIRECT_ROLES`,
`verifix_sync.PROFILE_ROLES`, `leader_appeal_chat.MEMBER_ROLES`,
`factory_scope.LOCKED_ROLES`, `idle_scope.OWNER_ROLE`, `exam.EXAM_ROLES`,
`concerns.LEVELS`, `concerns.PICKER_ROLES`, `downtime.COST_ROLES`,
`production.UOM_ROLES`, `capabilities.UNGRANTABLE_ROLES`,
`capability_alerts._NATIVE_ROLES`, the bot's `_ROLE_LABELS` and its accepted
roles tuple, `tv("role.<role>")` keys.
Frontend: `pages.TOGGLEABLE_ROLES` / `ROLE_LABEL_KEYS`,
`ProfilesManagement.TYPES`, `Profile.TYPE_META`,
`UsersManagement.ROLES` / `ADD_ROLES`, `broadcastTree.ROLE_SECTIONS`,
`Login.ROLE_TKEY`, `IdleOwners.ROLE_KEY`, `AnalysisBoard.LEVEL_COLOR`,
`Sidebar.BADGE_ROLES`, `Downtime.COST_ROLES`, three arrays in
`Production.jsx`, `UsersActivity.ROLE_TKEYS`, and `DEFAULT_PAGE_ACCESS`
duplicated on the client (and drifted: `kelish`, `shift-daily`).

### 1.7 Inconsistencies and gaps the redesign must DECIDE (not just fix)

- **The role → unit ladder is re-spelled in ~19 helpers**, each with a
  different fall-through for a role it does not name: everything
  (`idle_cell._scoped_cells`, `cell_attendance._scope`, `tasks.board`,
  `brigadir_tasks._scope_units`, `leaders._leaders_feed`,
  `staff._scope_documents`), nothing (`kelish._viewer`,
  `staff._visible_manager_ids`, `worker_concerns._viewer_lock`,
  `shift_report._scope`), 403 (`people._scope`, `production._resolve_manager_id`),
  own rows only (`concerns._scope_query`).
- **«Admin» has four definitions**: the active-role claim (`verify_admin` and
  ~20 inline twins), `admins`-TABLE membership (broadcast, the switcher,
  `delete_user`), the capability short-circuit, and «admin AND not
  impersonated» (ai_admin, notion_tasks).
- **One rule, many spellings**: «admin or top-manager sees everything» 7×;
  «admin or shift-manager» 5×; «a supervisor of the row's unit» 6×;
  «the viewer's own leader profile(s)» 4 shapes; /staff and /staff-live are
  twin rule sets (8 helper pairs that must move together).
- **Read wider than write on the same page is the norm**: cell placement,
  kelish roster, the UOM field, the cells register, idle entries, appeal
  rulings, concern status, task text vs status, honours.
- **No server-side scoping at all**: raw `/api/attendance`, `/api/comments`,
  `/api/managers/all`, `/api/brigadir/{id}` (any unit by id), `/api/quality`
  (whole register; the plant pin is a client hint although `quality` is in
  `SCOPED_PAGES`), `/api/turnover`, `/api/production/trudoyomkost*` (+ the
  call-DM send), `/api/category-compliance`, `/api/foreign-objects`,
  `/api/arc*`. Plant lock only (shift and unit not enforced): leaderboard,
  plan, zagruzka-cell, workers, reports, search.
- `_require_staff` admits a /daily holder to every /staff endpoint;
  `staff_live._page` refuses the same person. `_process_batch` ignores the
  requests-approve grant that `_process_request` honours.
- Grant-use alerting decides «native» from its own `_NATIVE_ROLES` table, not
  from what the guard admits.
- **Account-level grants never reach a browser session** (`session_identity`
  pins `sub` to the lowest-id holder of the profile).
- Frontend: **13 distinct gating mechanisms**; a NEW role string lands on
  `NoAccess` (not in any list), gets the LEADER's write UI on /concerns (no
  default branch), a free S1/S2 toggle over a locked board on /shift-daily,
  the label «Guest» on the idle-owners tab, and is unassignable on the Users
  and Profiles tabs until every list is edited.

### 1.8 Verifix — what a role can be read from

**Derivable today**: a LEADER (job-title regex `verifix_org.is_leader_job`)
and the cell they are SEATED in (org unit → `cells.owner_id`); a BRIGADIR
(`is_supervisor_job`) and the workshop / cells under them (`brigadirs_over`);
status W/D/U with hire and dismissal dates; the photo; the «kind» (Lider /
Lider o'rnida, Brigadir / Brigadir o'rnida — does the job title match). A
SHIFT-MANAGER only by a report-only regex
(`verifix_roles_report_oct25._is_shift_manager`, «смен|smena|shift» + a head
word) with the shift inferred from arrival hours over 14 days.

**Not derivable**: a unit's shift and plant (set by hand; `_create_unit`
leaves both NULL), a shift-manager's shift / plant, top-manager / guest /
idle-owner / admin (no Verifix signal), which categories an idle-owner owns, a
manual «Boshqaruvchi» pick, `KEPT_APART`, `zagruzka_on`, any page or action
grant.

**What the live sync does with roles today**: CREATES leader profiles
automatically for a seat with no profile (`owes_from = UNCLAIMED`, connected
to the cell's unit when it has a live brigadir); DISMISSES leaders
automatically (cells released, a cutoff from the dismissal day); keeps
`leader_kind` / `supervisor_kind` current from the job unless a person set
them; everything about UNITS and every other role is a queue item an admin
taps (`new_unit`, `unit_dismissed`, `profile_dismissed`, `brigadir_differs`,
`leader_moved`). The tie is `vfx_employee_id` on `role_profiles` and
`managers` (promoted from the Oct checks), hand ties in `verifix_ties`.

### 1.9 Frontend and bot

The frontend reads rights three ways: the role string (104 sites),
`useCapabilities` (`can`, `canAll`, `seesAllOn`, `capTabs`, `deniedPages`),
and — **the pattern to generalise** — rights ON THE PAYLOAD (`can_edit`,
`rights.*`, `scope`, `cat_locked`, `locked_factory_id`, `static` chips,
`is_admin`, `editable`). The bot: admin = `tid in _admin_ids()` (~20×);
`/tasks` = the account's approved LEADER role rows matched by (unit, name);
approval-card recipients = admins ∪ the receiving supervisor ∪ capability
holders over the unit; the command menu is admin vs everyone.

---

## 2. «Recreatable from scratch» — the seven roles decomposed

Each current role = FUNCTIONS (what) × REACH (over which rows) × ANCHORS
(what the profile is attached to) × PROCESS POSITION (ladder level, appeal
stage) × a few STRUCTURAL facts.

| Role | Functions (today's native authority, condensed) | Reach | Anchors | Process position | Structural |
|---|---|---|---|---|---|
| admin | everything — roles, permissions, identities, settings, danger zone, broadcast, AI keys, Verifix | all | — | rules stage 2 of appeals; outside the concern ladder | separate table; bot menu; never deniable; `_deny_admin_profile` protects its identities |
| top-manager | view nearly every page; concerns at its own level only; `/live` replay | all plants, read-only | — | concern level 4 (top) | — |
| shift-manager | /staff: approve requests + documents (task moves), undo; the shift board on /daily; concerns up to its level; brigadir-tier tasks; UOM; cost tab; production edits | shift ∩ plant | shift, plant | concern level 3; told about its units | — |
| brigadir | /staff whole unit day: file documents / requests, close the day (from the shift's clock), place people, answer no-check-outs; /production unit (quantities, staffing, reconciliation, UOM); concerns level 2 + escalate; tasks for own leaders; /cells read + pick the «Boshqaruvchi»; kelish roster; idle entries edit; appeal stage 1; late-day requests | own unit | the unit itself (shift, plant through it) | concern level 2; appeal stage 1; receiver of exchanges | **profile IS the unit row**; `supervisor_kind`; `zagruzka_on` |
| leader | file the checklist (bot / web / camera), late proofs, objections; create idle entries; create + own concerns; own task queue; kelish marks; cell-concerns; sit the exam; production own cells (quantities, staffing) | cells run / own filings | unit, cells run, cells owned | concern level 1 | `role_id` = unit; `owes_from`; `leader_kind`; `checklist_shift` |
| guest | nothing by default | — | — | — | self-created; names not unique; one per account |
| idle-owner | read /downtime and /idle-cell (+ «Kutish» on /reports) within categories | categories | categories | — | — |

Everything in «Functions» is a function the new catalog must name
(Appendix A); everything in «Reach» a scope the model must express; «Anchors»
are what a PROFILE carries independently of its role; «Process position» is a
business process, not a permission.

---

## 3. Proposed model (a DRAFT — the questions in §4 decide it)

### 3.1 Four concepts, kept apart

1. **Function** (permission) — one thing a person may do, from a fixed
   catalog in code: `staff.documents.approve`, `leaders.checklist.file`,
   `production.quantities.edit`, `page.view.staff`… Each names the page it
   belongs to and the scope dimensions it accepts. Appendix A is a first cut
   (~120 functions) — exactly what the code already distinguishes.
2. **Role** — a named, editable bundle: function → reach. In the DB, created
   by admins, the seven of today seeded as system roles.
3. **Scope** — how far a function reaches for THIS person: `all` · `plant` ·
   `shift` (∩ plant) · `unit` · `cells_run` · `cells_owned` · `cells_any` ·
   `self` · `category` · `none`. A role sets a DEFAULT reach and may override
   it per function. Reads and writes are separate functions, so «reads the
   whole unit, writes one field» is two rows, not a special case.
4. **Anchor** — what a PROFILE is attached to, independent of its role: unit,
   shift, plant, cells (run / owned), categories, and an explicit list
   (`profile_scopes`: dimension + ids) for «these three units». A reach
   resolves against the person's anchors; a reach the person has no anchor
   for resolves to NOTHING — never to everything.

### 3.2 Entities (new)

- `permissions` — registered FROM CODE at boot (key, area / page, kind
  view | act | approve | configure | danger, allowed reaches, `grantable`,
  label keys). Not editable by hand; the UI reads them.
- `roles` — id, key, four names, description, `is_system`, `ladder_level`
  (none · leader · brigadir · shift-manager · top-manager), `appeal_stage`
  (none · 1 · 2), `default_reach`, `home_page`, `verifix_jobs` (job-title
  rules, nullable), `legacy_base` (transition only, §3.6), `archived_at`.
- `role_permissions` — role_id, permission_key, reach (inherit the role's
  default | an explicit reach).
- profile ← role: `role_profiles.role_id` (FK) in place of the free string;
  ONE role per profile (Q1 asks whether several).
- `profile_scopes` — profile_key, dimension, value: explicit anchors beyond
  the natural ones (unit / shift / plant / cells / categories).
- Overlays STAY: `profile_permissions` (grant / deny + reach) re-keyed to the
  catalog; `user_capabilities` kept or dropped (Q8).

### 3.3 Resolution — ONE function replacing the ladders

`allowed(payload, function, row=None)`: deny overlay → (role grant ∪ profile
grant) → reach (overlay > role's function row > role default) → anchors →
ids. `None` = everything, `[]` = nothing, exactly as `empty_scope` reads
today. A role the catalog knows nothing about reaches nothing. Notification
fan-out asks the SAME function — «who holds `staff.documents.approve` over
unit 9» replaces the hard-coded recipient lists (`role_ids_for_unit`,
`_exchange_supervisor_recipients`, `cap_recipients`, `_admin_ids`).

### 3.4 The hard part — anchors that are TABLES today

- **Brigadir = `managers` row.** Option A: keep it — the Brigadir role is
  pinned to the «unit holder» shape; any OTHER profile may still be anchored
  to a unit through `manager_id`, as leaders are, so a custom unit-bound role
  («unit quality inspector») needs no schema change. Option B: split —
  `managers` stays the UNIT, the brigadir becomes a `role_profiles` row with
  `manager_id`; `role_id`, profile keys (`supervisor:<unit>`), web logins,
  approvals, the bot's `_caller_for_doc`, attendance's `is_supervisor` all
  re-keyed. B is the general answer and a large migration.
- **Leader `role_id` = unit.** The new JWT carries the PROFILE KEY and the
  ROLE ID beside the legacy claims; `role_id` keeps meaning «the unit» for a
  leader during the transition, so nothing that reads it moves.
- **Admin = `admins` table.** Becomes a profile with the system role
  «Administrator» (every function, the `grantable: false` ones included); the
  table retires; the bot's `_admin_ids()` becomes «holders of X»; `/adminreg`
  becomes the claim of an Administrator-role profile.
- **Idle-owner** = a role whose default reach is `category`; the category
  register becomes an anchor (`profile_scopes`, dimension `category`), so any
  role may be given a category reach.

### 3.5 Seeds — the seven roles rebuilt from §2

Administrator · Top-manager · Smena menejeri · Brigadir · Lider · Mehmon ·
Kutish mas'uli — each a `roles` row + `role_permissions` rows reproducing §2
exactly. The Access matrix folds in: a page tick becomes a `page.view.<page>`
row on the role (Q16).

### 3.6 Transition

Every role carries `legacy_base` — which of the seven it behaves like for
code not yet migrated — and the JWT carries both the role id and the legacy
role string. Code is migrated AREA BY AREA to `allowed()`; until an area is
migrated, a custom role reaches it as its base does. Day one: model + seeds,
behaviour byte-identical. The ~530 call sites are the work; the model itself
is small. §1.7's gaps are fixed as each area migrates, each named to the
operator first (Q22).

---

## 4. Open questions

Grouped; my recommendation in brackets. **A, B and C decide the SHAPE and
block the design**; D–F have defaults I can proceed on.

### A. Shape of a role
1. **One role per profile** (as today — a second job is a second profile and
   the switcher), or SEVERAL roles on one profile? [one; extra reach through
   the per-profile overlay]
2. Do roles **inherit** («Brigadir minus X»), or are they flat bundles with a
   «copy from role» at creation? [flat + copy — no inheritance chain to debug]
3. May the seven **built-in roles be edited**, or only cloned?
   [editable, except Administrator; `is_system` only blocks delete]
4. Should **deny exist inside a role** («everything but X»), or only as the
   per-person overlay it is today? [overlay only]

### B. Scope and anchors
5. Is reach set **once per role** (its default) with per-function overrides,
   or must every function be set individually? [default + overrides]
6. **The brigadir IS the unit** (§3.4). Keep that (Option A) or split unit
   from person (Option B)? [A now, B later — A already lets a custom role be
   anchored to a unit through `manager_id`]
7. «My cells»: keep **RUN and OWNED** as two reaches (today both are used, on
   different pages), or one «my cells»? [keep both, plus `cells_any`]
8. Keep **account-level grants** beside profile grants? Your choice on
   2026-07-28, but a browser session never sees them. [drop; profile overlay
   only]
9. A role no ladder names reads everything on some pages and nothing on
   others today. New rule: **nothing unless granted**. [yes — default deny]
10. Should **explicit scope lists per person** exist («quality inspector for
    units 5, 9, 12»; «Kutish mas'uli for Cat D and H»)? [yes, `profile_scopes`]

### C. Verifix («remember the verifix»)
11. Which did you mean? **(a)** a role carries Verifix job-title rules and the
    sync ASSIGNS it (leader job → Lider, brigadir job → Brigadir, «смен…» →
    Smena menejeri, a new job title → a custom role); **(b)** the ANCHORS come
    from Verifix (seat → cells, workshop → unit), as now; **(c)** a dismissal
    on Verifix ends the role's access; **(d)** something else. [all of a–c]
12. If (a): **automatic** (as leader profiles are created today) or PROPOSED
    in the «Verifix sinxron» queue for a tap? [automatic for leaders as now;
    proposed for every other role, including a custom one]
13. A person with **no Verifix record** (an outsider): any role, or only
    Mehmon? [any role; the tie is optional]

### D. Administration of roles
14. «**Administrator**» a protected system role (cannot be edited or deleted,
    at least one holder must remain), or an ordinary role that happens to
    hold every function? [protected]
15. **Who may create and edit roles**: admins only (as the Permissions tab is
    today), or a grantable `admin.roles.manage` with the rule «you cannot
    grant what you do not hold»? [admins only for now]
16. Does the **Access tab** (role × page) survive as a view of the role
    editor, or is it folded into the editor? [folded — a page tick is
    `page.view.<page>` on the role]

### E. Process positions
17. The **concern ladder** (leader → brigadir → shift-manager → top-manager)
    and the **appeal stages** (unit brigadir → admin): fixed levels a role is
    MAPPED to, or generic? [fixed levels; `roles.ladder_level`,
    `appeal_stage`]
18. **Notification recipients** derived from functions («whoever may approve
    this document over this unit») instead of role lists? This changes who
    gets cards. [yes]
19. **Bot commands** gated by functions (`/tasks` → `leaders.checklist.file`,
    `/pending` → `admin.users.manage`, `/broadcast` → `admin.broadcast.send`)?
    [yes]

### F. Granularity and migration
20. **Function granularity**: coarse (per page: view · edit · approve ·
    configure) or fine (Appendix A, ~120)? [Appendix A — it is what the code
    already distinguishes; coarser would MERGE rights that differ today]
21. **Staged migration** (model + seeds first, behaviour identical on day
    one, then area by area) or big-bang? [staged, behind `legacy_base`]
22. The **gaps in §1.7** (endpoints with no scope; shift-manager plant-wide
    pages; the two guest / top-manager conventions): fix as each area
    migrates, or leave each as it is unless you decide otherwise? [fix on
    migration, each named to you first]
23. **Guest**: a built-in role with nothing, or «a profile with no role»?
    [built-in Mehmon role, nothing granted]

---

## 5. Out of scope here

Page design (the role editor, the profile page, the pickers); the day / time
write windows (business rules, not permissions); the data dimensions
themselves (`managers.factory_id` stays the ONE plant attachment; `cell_links`
stay the dated truth of a cell's slots); the leader's `owes_from` /
`leader_load` exemption (owing rules, not rights).

---

## Appendix A — function catalog, first cut (~120)

Reach column = the dimensions the function can be narrowed by. «Today» = who
holds it natively now (A admin · TM top-manager · SM shift-manager · B
brigadir · L leader · G guest · KO idle-owner · grant = a capability).

| Area | Function | Reach | Today |
|---|---|---|---|
| pages | `page.view.<key>` ×34 | page-dependent | the Access matrix |
| zagruzka | `zagruzka.view` | plant | everybody on the page |
| | `zagruzka.bands.edit` | all | A |
| | `zagruzka.comments.post` / `.edit_own` | plant / self | ANY session today (unscoped) |
| | `zagruzka.export` | plant | page |
| staff | `staff.attendance.view` | unit · shift · all | B, SM, A, grant |
| | `staff.attendance.edit` | unit · shift · all | A, grant |
| | `staff.attendance.delete` | unit · shift · all | A, grant (B files a request) |
| | `staff.deletion_request.create` | unit | B |
| | `staff.deletion_request.decide` | shift · all | A, SM, grant |
| | `staff.deletion_request.undo` | shift · all | A, SM |
| | `staff.documents.create` | unit | B, A |
| | `staff.documents.approve` | unit (as receiver) · shift · all | receiving B, SM (task moves), A, grant |
| | `staff.documents.reject` / `.cancel` / `.delete` / `.edit` | same + creator | same + creator |
| | `staff.day.close` | unit | B (from the shift's clock), A |
| | `staff.day.reopen` | unit · all | A, grant |
| | `staff.placement.edit` | unit | own B, A |
| | `staff.clock_fix` | unit | B, A |
| | `staff.exchange_tasks.manage` | all | A |
| | `staff.export` | unit · shift · all | page |
| production | `production.view` | unit · cells · shift · all | B, L, SM, TM, A, grant |
| | `production.quantities.edit` (ПЛАН/ФАКТ, lids) | unit · cells | B, L (own cells), SM, TM, A |
| | `production.staffing.edit` («Bugungi fakt») | unit · cells | A, B, L |
| | `production.reconciliation.edit` | unit | B, SM, TM, A (never L) |
| | `production.wc_override.edit` | all | A |
| | `production.catalog.measure.edit` (UOM, containers) | unit · shift · all | A, B, SM |
| | `production.catalog.sap.edit` | all | grant (`production.catalog.sap`) |
| | `production.catalog.manage` (lines, archive, bulk) | all | A |
| | `production.work_centers.manage` | all | A |
| | `production.sap.upload` / `.abc.import` | all | A |
| | `production.raw.view` | all | A |
| | `production.trudoyomkost.view` | plant · shift · unit | page (unscoped today) |
| | `production.forecast.call.send` | shift · all | page (unscoped today) |
| | `production.autocall.configure` | all | A |
| downtime | `downtime.view` | plant · category | page; KO locked |
| | `downtime.cost.view` | plant | A, SM |
| | `downtime.wage_rates.edit` | all | A |
| | `downtime.deck.export` | all | A |
| | `downtime.export` | plant · category | page |
| idle | `idle.intervals.create` | cells · unit | L, B |
| | `idle.intervals.edit` / `.delete` | unit · all | B (own), A, TM, grant (`idle.requests.approve`) |
| | `idle.source.manage` | all | grant |
| | `idle.owners.manage` | all | A |
| concerns | `concerns.view` | self · unit · shift · all | ladder |
| | `concerns.create` | at the role's ladder level | L, B, SM, A |
| | `concerns.edit` | own · responsible · chain above within reach | ladder |
| | `concerns.status.set` | responsible holder | ladder |
| | `concerns.escalate` | own level | L, B, SM, A |
| | `concerns.delete` | owner (non-leader), A | |
| | `concerns.comment` | whoever sees the row | |
| | `concerns.deck.export` | all | A |
| | `cell_concerns.view` / `.file` | cells · unit · shift · all | L, B, SM, A |
| tasks | `tasks.view` | self · unit · shift · all | ladder |
| | `tasks.create` | unit | B, A |
| | `tasks.edit_own` | self | creator, A |
| | `tasks.status.set` | unit · self | B, owning L, A |
| | `tasks.urgent.set` | unit | B, A |
| | `tasks.comment` | row | |
| | `tasks.brigadir_tier.create` / `.manage` | shift · all | SM, A |
| leaders | `leaders.register.view` | unit · self · all | B, L, SM, TM, A, G(page) |
| | `leaders.report.view` | unit · self · all | same |
| | `leaders.checklist.file` (bot, web, camera) | self | L |
| | `leaders.late_proof.file` | self | L |
| | `leaders.objection.file` | self · unit | L, B, `leaders.admin` |
| | `leaders.appeal.read` | unit · self · all | B, L, SM, TM, A, member |
| | `leaders.appeal.rule_stage1` | unit | B |
| | `leaders.appeal.rule_stage2` / `.undo` / `.invite` | all | `leaders.admin` |
| | `leaders.late_day.request` | unit | B, `leaders.admin` |
| | `leaders.late_day.decide` | all | `leaders.admin` |
| | `leaders.ai.review` (queue, run, recheck, resolve) | all | `leaders.admin` |
| | `leaders.ai.history.clear` | all | A only |
| | `leaders.tiers.edit` · `.task_override` · `.exclusions.manage` · `.cutoffs.manage` | all | `leaders.admin` |
| | `leaders.config.manage` (ltasks) · `.daily.manage` (ltdaily) | all | `leaders.admin` |
| | `leaders.requirements.view` | self · unit · all | page |
| | `leaders.standing.view` | self · unit | L, B |
| leaders-kpi | `leaders_kpi.view` | unit · shift · cells · all | page (plant lock on one half) |
| | `leaders_kpi.turnover.manage` (read, close, reopen, compute) | all | A |
| | `leaders_kpi.foreign.refresh` · `.compliance.read` | all | A |
| | `leaders_kpi.export` | as view | page |
| kelish | `kelish.view` | cells · unit · shift · all | L, B, SM, TM(all), A |
| | `kelish.marks.edit` | cells · unit | L, B, A |
| | `kelish.roster.edit` | unit | B, A |
| | `kelish.kind.set` | all | A |
| cells | `cells.register.view` | unit · all | B (own), A, grant |
| | `cells.manage` | all | grant (`admin.cells.manage`) |
| | `cells.manager.pick` («Boshqaruvchi») | unit · all | own B, cells managers, A |
| | `cells.hours.manage` | all | grant |
| | `cells.details.view` | any | any session |
| people | `people.view` | unit · shift · cells · all | A, TM, B, SM, L (403 others) |
| | `people.honours.edit` | unit · all | A, own B |
| workers | `workers.view` | plant | page |
| | `workers.demographics.view` | all | A |
| quality etc. | `quality.view` / `.refresh` | plant (client-only today) | page |
| | `kaizen.view` / `.refresh` · `arc.view` · `arc.diag` (A) · `ontime.view` · `ontime.read` (A) · `notion_tasks.view` · `notion_tracker.manage` (A) · `trello.view` / `.manage` (A) | — | page / A |
| analysis | `plan.view` · `reports.view` (+ `reports.cost.view` A, SM) · `leaderboard.view` · `zagruzka_cell.view` · `shift_daily.view` | plant · category | page |
| | `live.view` | unit · shift · all | page |
| | `live.replay` | all | A, TM |
| setup | `setup.view` · `setup.register.edit` (A) · `setup.fact.edit` | cells · unit · shift · all | page / A / scoped |
| education | `education.view` (targeted) · `education.manage` | self / all | page / A |
| exam | `exam.sit` | self | L |
| | `exam.results.view` | unit | B |
| | `exam.manage` | all | grant (`admin.exam.manage`) |
| assessment | `assessment.judge` (seat, grade) | self | page |
| | `assessment.bank.manage` · `assessment.sittings.manage` | all | A |
| assistant | `assistant.use` · `assistant.configure` (A) | — | page / A |
| misc | `activity.view` · `search.use` · `notifications.own` · `profile.own` | — | page / any session |
| admin | `admin.users.manage` · `admin.profiles.manage` · `admin.factories.manage` · `admin.cleanup` (unit · all) | — | grants today |
| | `admin.roles.manage` (NEW — roles + overlays; replaces the Access and Permissions tabs) | all | A, never grantable (Q15) |
| | `admin.web_login.reveal` · `admin.impersonate` | all | A only |
| | `admin.broadcast.send` · `admin.translations.edit` · `admin.settings.edit` · `admin.logs.view` · `admin.logs.undo` | all | A |
| | `admin.attendance.upload` («Davomat») · `admin.data.sources` · `admin.media.view` · `admin.lost_workers.view` · `admin.doc_audit.view` | all | A |
| | `admin.verifix.connect` · `admin.verifix.sync` · `admin.ai_keys.manage` · `admin.idle_owners.manage` | all | A |
| | `admin.dbdump` · `admin.dbrestore` | all | A, never grantable |

## Appendix B — endpoints found with no or partial server scoping

To be fixed as their areas migrate (Q22), each named to the operator first:
`GET /api/attendance/*` (any unit by id, any session) · `/api/comments` (any
unit-day, no admin override on edit) · `/api/managers/all` (whole unit
register to any session) · `/api/brigadir/{id}` (page gate, no plant lock) ·
`/api/quality*` (whole register; `quality` in `SCOPED_PAGES` yet unscoped;
`/refresh` by any page holder) · `/api/turnover*` (scope from the query
string) · `/api/production/trudoyomkost*` + `/call-notify` (manager list as
sent; a DM send) · `/api/category-compliance*`, `/api/foreign-objects`
(query-string scope) · `/api/arc*` (filters only) · plant-lock-only pages for
a shift-manager: leaderboard, plan, zagruzka-cell, workers, reports, search,
/leaders and the appeals (`report_scope_ok` reads shift-manager as
plant-wide, documented) · `leader_tasks.requirements` (shift-manager falls
into the admin branch) · `idle_cell._scoped_cells` / `cell_attendance._scope`
(guest / idle-owner → every cell through the `None` fallback) ·
`/api/factories` `can_manage` flag disagrees with the write gate ·
`staff._process_batch` ignores the requests-approve grant ·
`notifications` legacy list without a token returns broadcasts ·
`exam.practice` for any profile.
