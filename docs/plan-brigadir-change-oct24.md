# Four units change brigadir — the operator's rulings (2026-10-24)

The ask, verbatim: «We need to replace the supervisors of units even they're
some of the are still leaders and on the verifix they're not the unit
supervisors. I'll count them one-by-one: Mirmaxmudova Munira -> Raximova
Kamola · Suvonov Elshod -> ERKANBOYEV ZAFARJON · Suvonov Elshod OF -> Suvonov
Elshod · Raximova Kamola -> NIYOZOV IZZATILLA. Note: Supervisor is brigadir.»
The Notion task behind it: «Suvonov Elshod va Mirmaxmudova Munira orniga
odamlarni tayyorlash» (Sultonov Abror, due 2026-10-19).

In this system a brigadir IS the unit (`managers`: name, cells, leaders, every
figure, the Verifix tie) and a person is a Telegram account holding it. So the
change is four things per unit: the name, the holders, the Verifix tie, and
what happens to the new person's leader profile.

| Unit id | Today | New brigadir |
|---|---|---|
| 9 | Mirmaxmudova Munira | Raximova Kamola |
| 6 | Suvonov Elshod | Erkanboyev Zafarjon — today a leader of unit 6 running cell 4112 |
| 5 | Suvonov Elshod OF | Suvonov Elshod — he already heads both Suvonov units |
| 10 | Raximova Kamola | Niyozov Izzatilla — today a leader of unit 10 running cell 9412 |

## The ten rulings (asked one by one, 2026-10-24)

1. **The chain is right; Munira leaves entirely** — no role on the platform
   after the change.
2. **Rename in place.** Units 9, 6, 5 and 10 keep their ids, cells, leaders
   and history; only the name, the holders and the Verifix tie change. Past
   scores follow the unit (on the brigadir board Niyozov inherits unit 10's
   history, Kamola unit 9's).
3. **Effective today, 24 October.** A unit rename is undated; nothing already
   filed moves.
4. **Erkanboyev and Niyozov keep their leader profiles** (cells 4112 and 9412,
   the daily checklist) **until Verifix lists them as brigadir too.** They hold
   the unit on top. A Verifix person is tied to a leader profile or to a unit,
   never both, so the units stay untied while the leader profiles keep their
   ties.
5. **Units 6 and 10 are held untied by hand**, their kind set to «Brigadir
   o'rnida», and **the sync's suggestions to move their cells** (Verifix still
   puts Suvonov over unit 6's cells and Kamola over unit 10's) **are blocked by
   rule** until the units are tied. Unit 9 takes Kamola's Verifix id, unit 5
   Suvonov's.
6. **Unit 5 becomes exactly «Suvonov Elshod».** Rows naming Suvonov, past and
   future, resolve to unit 5; unit 6 does not keep «Suvonov Elshod» as an alias
   (the same for «Raximova Kamola» on unit 10), so the two never collide in
   `name_map.sheet_alias_map`. The pins in `name_map` move with it.
7. **Holders.** The account named «Mirmaxmudova Munira» with username
   Komola121293 IS Kamola's: it keeps unit 9 and loses unit 10. Bozorova
   Moxinur (unit 9) and Ibragimjonov Farrux (units 9 and 10) both stay.
   Munira's two accounts leave unit 9. Niyozov's account (today only his leader
   profile) gets unit 10. Suvonov's account leaves unit 6 and stays on unit 5.
   Erkanboyev already holds unit 6 as supervisor since September.
8. **Shift and plant unchanged** — all four stay shift 1, plant 1.
9. **Tell the leaders of the four units who their new brigadir is, and tell the
   new brigadirs** (the bot, in each account's language).
10. **Ship as a flag-guarded one-shot** in this repo, deployed by the usual
    push to gitea main, with the result DMed to the admins and in the Jurnal;
    the `name_map` pin change rides in the same commit.

Also agreed: production is READ first (the state report of this build), and
the change one-shot is written against that report.

## What is built

- 2026-10-24, v4.325.1: the state report (`startup.report_brigadir_change_state`,
  `services/brigadir_change_report_oct24.py`) — see CLAUDE.md «Four units change
  brigadir».
- 2026-10-24, v4.328.0: the change one-shot (`startup.apply_brigadir_change_oct24`,
  `services/brigadir_change_oct24.py`), the held-untied rule in `verifix_sync`,
  the `name_map` pins, the two notification keys — see CLAUDE.md «Four units
  change brigadir». Written against the 16:16 state report, which added facts
  the September copy did not have: Niyozov's account already held unit 10
  (since 1 Oct) and Erkanboyev's also holds unit 5 (since 12 Sep, left as it
  is and named in the DM); every unit had a browser login and Cyrillic /
  English name overrides, which follow the people; the sync is «on» and units
  5 and 6 shared Suvonov's Verifix tie.
