# One-shot data fixes and their records

Moved word for word from the repo-root `CLAUDE.md` on 2026-11-06; the index of every topic file is CLAUDE.md «Where everything else is written (`docs/`)».

## Unit «Turdimurodov Nodirjon» joins Aripova Manzura's (`unit_merge_nov02`, 2026-11-02)

The operator: «Remove the Nodirjon Turdimurodov from brigadirs, add his unit to
Aripova Manzura where it belongs. Keep him as a Leader of her.» Asked one by
one: MERGE (0811 joins her unit 1, unit 21 is archived), from TODAY (2 Nov —
she closes that day with 0811's people), A0081 stays typed by hand, the 47
positions with no Команда go with it, his open brigadir-level concern goes to
her, both are told, the report goes to Burkhon. TEMPORARY
`services/unit_merge_nov02.py` (`startup.merge_nodirjon_unit_nov02`, deferred,
both entrypoints, flag `unit_merge_nodirjon_0811_2026_11_02_v1`, record in app
setting `unit_merge_nodirjon_0811_2026_11_02`), ONE transaction with the flag:

- unit 21's catalog, dated from 2 Nov (`pp_catalog.freeze`): every coded line
  «Qo'lda» (per-line `auto_fill` off — Aripova's unit takes the SAP file), the
  lines with no Команда given A0081, typed values carried
  (`production._carry_manual_quantities`);
- 0811's brigadir: a DATED link event 21 → 1 effective 2 Nov 08:00, applied at
  once — 2 Nov on reads her unit, every earlier day his; the catalog follow
  (kicked) moves its positions, today's typed values and people pin;
- unit 21's open concerns → unit 1 (deadline kept); its live documents,
  deletions, clock fixes and placements from 2 Nov → unit 1 (one draft role
  change), an exchange INTO unit 21 → into unit 1;
- his `supervisor:21` registrations removed (`profiles._remove_role_row` — an
  account's active role falls back to his leader one); a `supervisor:21`
  browser login, if any, DISABLED and kept;
- unit 21 held untied from Verifix (`tie_by_hand` — his person 2137 stays on
  leader profile #211 alone) and ARCHIVED (history kept, hidden; un-archive on
  the Profiles tab).

Preconditions block the whole run (nothing written, DMed): the 2 Nov shift-1
window (08:00–20:00 Tashkent) — a boot after it never moves a finished day —,
both units as named, 0811 in unit 21 run by #211, no other cell or leader in
unit 21, the catalog follow on, no refusal from `catalog_refusal`. Every row it
changes or removes is snapshotted into the record. After the commit: the
Jurnal (`production.catalog_bulk_edited`, `org.cell_links_applied`,
`identity.profile_deleted`), a closed 2 Nov live copy of either unit
re-copied, the follows kicked, Aripova and Nodirjon told
(`cell_unit_merged`, `cell_unit_merged_leader`), the report to
`REPORT_CHAT_BURKHON` ~2½ min later (`fx.dm_flag(result)`) with the follow's
outcome. Delete the module, both startup functions and both calls once the flag
reads «done» (or «blocked») and the report has gone. Known and left: his open
Telegram app keeps the brigadir session until relaunched (his DM asks him to);
`supervisor:21` keeps a personal `page.view.production` grant, inert while
nobody holds it.

## Elnora's profile takes her deputy's history (`leader_merge_nov04`, 2026-11-04)

The operator: Maksumov Sanjar's leader Amirova Elnora (#254) was away
(attendance 19 Jun → 25 Oct); a leader profile was made for her deputy Malikov
Xasan (#430), who ran 8911 from 15 Oct; «merge the actual leader's current
profile with his zam's history». Both profiles sat on ONE shared Telegram
account (@Biskonti_8911, rows 107 / 447), so #254's own Jul–Oct days were
already Xasan's work. Asked: Verifix corrected (Elnora seated in 8911, Egasi
from 3 Nov); 15 Oct counts Xasan's 100% day; #430 retired, the account stays
on Elnora. TEMPORARY `services/leader_merge_nov04.py`
(`startup.merge_leader_elnora_xasan` → `_leader_merge_job`, both entrypoints):
a DRY run (v4.418.5, flag `leader_merge_elnora_xasan_2026_11_04_dry_v1`)
DMed the plan to Burkhon; the apply (v4.418.6, flag `…_apply_v1`, record in
app setting `leader_merge_elnora_xasan_2026_11_04_apply`, every moved id kept
for an undo by hand) runs between 21:00 and 06:00 Tashkent, ONE transaction
with its flag, refused (`blocked`) unless Verifix seats Elnora in 8911 and the
data is as the dry run read it:

- #430's 21 days → #254; on 15 Oct #254's 10% day (5453) is parked on #430.
  Automatic checks on #430's dates SWAP date by date (#254's «no checklist»
  rows go to #430), so each side keeps one row per date · cell · task; a
  swapped row waits on a 1900 date inside the transaction (the unique keys).
- Photos, camera late shots, late proofs, AI verdicts, objections, the
  day-report ledger and override labels follow their DAY.
- Concerns held or filed by #430 and his tasks → #254 (role ref 447 → 107);
  an in-flight bot capture too.
- 8911's «Boshqaruvchi» = #254 from 15 Oct: one APPENDED dated event (src
  manual) — /cells/:id shows both 15 Oct events.
- #430: role row 447 removed from the shared account (active role → 107),
  browser login disabled, cutoff from 14 Oct. The profile is KEPT.
- Left with #430 (authorship): comments, chat messages, read marks, ojidaniya
  entries, bell rows, activity, the Jurnal, «who filed» on objections.
- NOT changed: #254's own 14 Oct day (10%) still counts; past digests are not
  re-sent; nobody but Burkhon is told. Jurnal: `identity.profiles_merged`.

Delete the module, both startup functions and both calls once the apply flag
reads «done» (or «blocked») and its report has gone.

## 7331's two leaders → Majidov Ozodjon (`leader_merge_nov10`, 2026-11-09)

The operator: «stop these 2 leaders and keep their history; make Majidov Ozod,
a worker on this unit, manager of the cell and keep their history as his
own». Read first through the report door (production and the stored Verifix
org, 9 Nov): Akbarov Tursunali's unit (#18, shift 2); Yuldashov Nodirbek
(#298, Verifix 2920 «Лидер», dismissed 16 Oct, cut by the sync from 17 Oct)
and Haydarov Zaynobiddin (#436, Verifix 30678 «Кондитер», picked as 7331's
«Boshqaruvchi» on 17 Oct); MAJIDOV OZODJON XAMID O'G'LI (Verifix 2918,
«Кондитер» in 7331, no profile; his Telegram account had held #298 from 7 Sep
and was unassigned on 9 Nov). Asked: Majidov runs 7331 from the night of
9 Nov (the operator picks him on the cell form, which creates his profile);
17 Oct, which both held, counts Haydarov's 95% day (Yuldashov's 15% day,
already cut, goes with #298); «Lider o'rnida», as Verifix's job says; the two
old profiles are DELETED.

TEMPORARY `services/leader_merge_nov10.py` (`startup.merge_leader_majidov_7331`
→ `_leader_merge_7331_job`, both entrypoints, flag
`leader_merge_majidov_7331_2026_11_10_v1`, record in app setting
`leader_merge_majidov_7331_2026_11_10` with every moved id and a snapshot of
every deleted row) runs ONCE, one transaction with its flag, refused
(`blocked`) unless the data is as read. v4.455.1 held it for 10 Nov 11:00–19:00
(so Haydarov could not file while his history moved); the same evening the
operator had made the pick and unbound both profiles' Telegram accounts and asked
it done at once — v4.455.2 runs it from 9 Nov, 09:00–24:00:

- The pick, through `cell_register.pick_manager`, when the cell form's was not
  made — the profile tied to Verifix 2918 is the survivor either way.
- Every day of #298 and #436 → Majidov, but #298's 17 Oct (5659); a date
  Majidov filed himself keeps his own day. Every automatic check follows its
  day (a check stays only with the SAME leader's staying day); photos, late
  proofs and shots, AI verdicts, objections (and «who filed» one as the
  leader), the day-report ledger and overrides' label follow their day.
- Concerns held or filed and tasks → Majidov (role ref = his approved row,
  else none); #298's excluded day (26 Aug) re-keyed to him; #298's cutoff
  deleted.
- Majidov owes from 11 Jul (#298's creation — a set `owes_from` decides
  alone, so the history counts as it did) and carries #298's spelling as an
  alias (the three sheet-era rows «YULDASHOV NODIRBEK», 2–4 Aug).
- 7331's dated «Boshqaruvchi» reads him on every past day: a mark on 12 Oct
  with `prev` = him (the first event's `prev` answers every earlier day), and
  events on 13 Oct and 17 Oct after the ones naming #298 / #436.
- Then #298 and #436 are deleted the Profiles tab's way (role rows — the
  accounts that held nothing else go with them — browser sessions and login,
  config), after a check that nothing filed is left on them but the staying
  days. Authorship stays under the old names: comments, chat messages, read
  marks, bell rows, activity, the Jurnal. Jurnal: `identity.profiles_merged`
  and one `identity.profile_deleted` per profile. The report goes to Burkhon.

Tested on two copies of the 9 Nov local snapshot (with and without the pick,
with a same-date clash); the first run caught Haydarov's 17 Oct checks
staying behind and a login row deleted under its own session bump.

**APPLIED on 9 Nov at 19:30** (v4.455.2): Majidov is profile #458 (owes from
11 Jul, alias «Yuldashov Nodirbek Kadamboy O'g'li»), holding 88 days, 185
automatic checks, 530 photos, 843 AI verdicts, 13 objections (4 open), 97
concerns held (10 open) and 77 filed, 2 tasks, 1 late proof and the 26 Aug
exclusion; 7331's link events 209–211. Destroyed, as ruled: #298's 17 Oct day
5659 and its 3 photos. #298 and #436 are deleted. The record (every moved id,
both profiles' snapshots) stays in app setting
`leader_merge_majidov_7331_2026_11_10`. The module and its startup wiring were
deleted in the next release.

## Cell 9123's 5 October counts for Raximova Kamola (`cell_day_fix_oct05`)

The operator (2026-10-06): cell 9123 was moved to its new unit (Yogmirov Feruz)
on 5 Oct but was meant to move from the 6th. The cells register is not dated, so
the move stands from 6 Oct; only the one STORED day after it is put back.
TEMPORARY `services/cell_day_fix_oct05.py`, `startup.fix_cell_9123_oct05` (flag
`cell_9123_oct05_to_raximova_2026_10_06_v2`, both entrypoints): 5 Oct's
`attendance` rows of 9123 move to Raximova Kamola's unit (`manager_id` only) and
that day's «Davomat» routing names her unit as a this-day-only move, so a later
Save keeps them; nothing is re-projected. v1 refused the whole cell over any one
worker and went silent, so 9123 stayed on Yogmirov. v2 holds back PER WORKER only
one named by a pending request / draft document on that unit's day, or split
across another cell, moves everyone else, and re-checks every 10 minutes (job
`cell-9123-oct05-fix`, until 13 Oct) until nothing is left; with no row saved
yet it pre-routes the batch cell and waits. Every distinct outcome is DMed to
the operator's chat once. Refuses outright only when the cell or the unit does
not resolve once. Logged as `attendance.cell_day_moved`. NOT moved: ojidaniya
(read by the cell's CURRENT unit, for every past day), concerns, the leader's
checklist. Delete the module, the startup function and both calls once the flag
reads «done».
v1 and v2 never landed for a reason no test caught: the report-only lookup of
the cell's leader compared `leader_task_days.date` (a STRING) with a date and
raised, rolling the move back each pass (fixed in v4.254.3; report-only reads
now run in savepoints). Its status was printed into every deploy's job log by
a TEMPORARY step of `.gitea/workflows/deploy.yaml` (`backend/diag_cell_9123.py`);
the step and the script were removed on 2026-10-23 once the flag read
`done:12`. The one-shot itself still waits to be deleted.

## Four units change brigadir (`plan-brigadir-change-oct24`, 2026-10-24)

The operator (2026-10-24): unit 9 «Mirmaxmudova Munira» goes to Raximova
Kamola, unit 6 «Suvonov Elshod» to Erkanboyev Zafarjon, unit 5 «Suvonov Elshod
OF» to Suvonov Elshod, unit 10 «Raximova Kamola» to Niyozov Izzatilla — the
ten rulings (rename in place, from 24 Oct, the two men keep their leader
profiles until Verifix lists them as brigadir, units 6 and 10 held untied with
the sync's cell-move suggestions blocked, unit 5 named exactly «Suvonov
Elshod», the holder changes, leaders and the new brigadirs told, shipped as a
one-shot) are recorded whole in `docs/plan-brigadir-change-oct24.md`.

- **Step one is a READ** (this build, TEMPORARY): `startup.report_brigadir_change_state`
  → `services/brigadir_change_report_oct24.py` DMs the operator, once, the
  four units' rows, hand ties and Verifix persons, their cells, leaders and
  Telegram holders (every other role of those accounts), browser logins and
  translation overrides on the names, the two men's leader profiles and cells
  4112 / 9412, who Verifix puts over each unit's cells, the open sync items
  about them and the five people as the stored org lists them — as text and
  as a .txt file. The production SSH read-only path was not reachable from the
  session that planned the change, so the change one-shot is written against
  this report, never against a local copy. Flag `brigadir_change_state_2026_10_24_v1`;
  delete the function, the module and both entrypoint calls with the change.
- **Step two is the change one-shot** (v4.328.0, TEMPORARY):
  `startup.apply_brigadir_change_oct24` → `services/brigadir_change_oct24.py`,
  written against that report. Preconditions first (the four names as they
  are, the Verifix persons behind units 10 / 5 / 6 / 9 checked BY NAME, the
  two men still leaders of their units, every new brigadir already holding
  their unit) — any failure blocks the whole run and DMs the problems. Then
  ONE transaction with the flag: the four renames with their role rows (the
  translation re-key of `_rename_profile` deliberately NOT used — a brigadir
  REPLACEMENT must not hand one person's Cyrillic spelling to another; the
  spellings nobody carries go into `name_aliases`, their `name.*` rows are
  deleted, «Raximova Kamola» and «Suvonov Elshod» are kept off units 10 and 6
  as aliases per ruling 6); three supervisor rows removed (Munira's only
  role — the account goes with it); three account display names corrected;
  unit 9 hand-tied to Kamola's Verifix id, units 10 and 6 held UNTIED with
  the kind «Brigadir o'rnida»; browser logins follow the people (Munira's and
  Suvonov's unit-6 login deleted, Kamola's re-keyed to unit 9 with its token
  version bumped; units 6 and 10 have none until an admin creates them);
  photos follow the people (unit 10's face → unit 9, each man's leader face →
  his unit); Munira's coming `new_unit` sync item pre-dismissed. After the
  commit: a Jurnal row per unit (`org.brigadir_changed`), Kamola's photo
  from Verifix (`fetch_photo_now`), the notifications `brigadir_changed` (the
  unit's leaders, `unit` = the OLD name) and `brigadir_appointed` (the
  brigadir's own account, bell row on the unit profile) — once, their own
  flag — and the admins' DM (its own flag PER RESULT — a «failed» DM never
  silences the «applied» one a retry produces; a send failure is retried).
  One copy applies it (a transaction-scoped advisory lock, the flag re-read
  under it). Telegram app sessions already open keep their old role claims
  for up to 24 h or until relaunch (pre-existing: the JWT carries
  `role_id` and nothing revokes it); browser sessions end at once. Flags
  `brigadir_change_2026_10_24_v1`, `…_notify`, `…_dm`.
- **A unit held UNTIED by hand keeps its cells against Verifix's brigadir**
  (`verifix_sync.Ctx.untied_units`, `unit_held_untied`): the pass raises no
  `brigadir_differs` for a cell whose unit a person untied, and an item
  already queued is refused (`unit_untied`). **And a Verifix brigadir who
  stands over a held-untied unit's cells names no unit for a cell with NONE**
  (`held_over`): a cell the pass creates under Kamola's or Suvonov's workshop
  would otherwise be suggested into the unit their id is tied to NOW (9 / 5),
  not the one whose workshop it stands in; a person decides. Any unit a
  person unties by hand gets this, by design. Tying the unit lifts it — when
  Verifix lists Erkanboyev / Niyozov as brigadir: FIRST retire or untie the
  man's leader profile (a Verifix person is tied to a profile OR a unit —
  `tie_by_hand` refuses a unit tie while a profile holds the id), THEN tie
  unit 6 / 10 to him on «Verifix sinxron» (ruling 4).
- **`name_map`**: both Suvonov pins («SUVONOV ELSHOD VALIJON O'G'LI»,
  «XAYRULLO O'G'LI ХABIBULLO») and the «Abdugamitov Muhammad» relabel name
  unit 5, «Suvonov Elshod», now — every row naming Suvonov is unit 5's.
- **Left to the admin, named in the DM**: Erkanboyev's account also holds
  unit 5 since 12 Sep; two pending claims on unit 10; browser logins for
  units 6 and 10.

## A role switch carries the profile's keyed rows (`_rekey_profile`, 2026-11-10)

Adi Ro'ziyev (profile #360) was hand-tied to Verifix 2501 on 5 Nov as a
Top-menejer, and his Verifix photo came with the tie. An admin later switched
him to shift-manager and the photo vanished. The switch keeps the
`role_profiles` row, so the tie (`vfx_employee_id`, `verifix_ties` kind
`profile`) stayed. But everything stored BY KEY (`_PROFILE_KEY_REFS`: photo,
browser login, capabilities, page permissions, ui prefs) stayed under
`top-manager:360` while the profile became `shift-manager:360`. The sync then
never fetched the photo again, because `vfx_meta.photo_set` said it was
already stored.

- `admin_switch_role` now moves those rows to the new key (`_rekey_profile`)
  on every switch, supervisor ends included. A row already under the new key
  is an orphan, since no live profile held that key, so it is dropped first.
- `startup.heal_switched_profile_keys` (`later`, both entrypoints) moves rows
  that earlier switches stranded to the profile's current key, unless that
  key already holds one. It is idempotent. TEMPORARY: delete it and both calls
  once it has run on prod.
