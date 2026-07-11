"""One-off seed: bulk-create pre-created leader profiles under their supervisors.

Data source: «Copy of Рекрутинг Safia.xlsx», sheet "Liders" (2026-07-11) —
93 leaders across 18 supervisor units, keyed by prod managers.id. Names are
Title-Case full FIO with apostrophes normalized to ' and Cyrillic Х homoglyphs
fixed. Cells are first-class rows now (`cells`: code UNIQUE + leader_id):
each leader profile is created first, then one cells row per Verifix code.
Excluded per Burkhon's decisions: Abduvaxitov/Burxonov groups (units not in
the system), O'rozov Asqar & Ochilov Murodali as leaders of O'rozov's cells,
and every «ёпиқ ячейка» (closed) cell — Umarov Komiljon skipped entirely
(his only cell 0631 is closed) and 5012 dropped from Ruziyeva Iqbol's list.
Re-running also reconciles an existing profile's owned cells to the file.

Usage (from the backend/ directory):
    python3 seed_leader_profiles.py --dry-run   # report only, nothing written
    python3 seed_leader_profiles.py             # insert + commit

Safe to re-run: exact duplicates are skipped, and an existing leader profile
under the same supervisor whose name is a prefix of the new one (short form
vs full FIO) is skipped with a warning instead of inserted twice.
Data-only insert: no Passenger restart needed, registration pickers see the
new profiles immediately.
"""
import re
import sys
sys.path.insert(0, ".")

from app.database import SessionLocal
from app.models import Cell, Manager, RoleProfile

# {managers.id: (expected supervisor name (informational), [(leader, cells)])}
LEADERS = {
    1: ("Aripova Manzura Salixdjanovna", [   # 5 leaders
        ("Salomov Elyorjon Shuhratovich", "0822"),
        ("Turdimurodov Nodirjon Latibjon O'g'li", "0811"),
        ("Zuxurova Maktuba Ibroximovna", "4411"),
        ("Alaberdiyev Abdulahad Xudaynazarovich", "4412"),
        ("Asqarova Muxlisa Axmadjon Qizi", "4413, 4415"),
    ]),
    2: ("Artikova Masuda Abduvaxabovna", [   # 5 leaders
        ("Ruziyeva Iqbol Jurayevna", "7312, 7311"),
        ("Jonnayev Asliddin Akromovich", "7314"),
        ("Jurayeva Xulkaroy Nozimjonovna", "2811, 2812"),
        ("Xidirova Zebo Karimovna", "2312"),
        ("Abduraupova Nargiza Shakirdjanovna", "7313, 7315"),
    ]),
    3: ("Abdukarimov Sanjar Xayrulla O'g'li", [   # 6 leaders
        ("Tursunboyev Abduqodir Absalom O'g'li", "6712, 7111"),
        ("Kulboyeva Djumagul Satibaldiyevna", "7411, 7412"),
        ("Axmirzayeva Nilufar Kudrat Qizi", "7413, 7414"),
        ("Kaxarov Dilmurod Shermaxamat O'g'li", "7415"),
        ("Sultanova Dildora Abidjanovna", "7416, 7418"),
        ("Tursunboyeva Lobar Erkinovna", "7417"),
    ]),
    4: ("Xakimov Ruslan Erkinovich", [   # 5 leaders
        ("Hamidov O'tkirjon Shokirjonovich", "4911, 6812"),
        ("Razikov Botir Nodirovich", "8920"),
        ("Saidova Xosiyatxon Erkabayevna", "6411"),
        ("Baymenov Qaxramon Baxti O'g'li", "6811"),
        ("Giyasova Xilola Taxirdjanovna", "7211, 7212"),
    ]),
    5: ("Suvonov Elshod Of", [   # 7 leaders
        ("Abdumalikova Ziyoda Azim Qizi", "4313"),
        ("Butabekov Aleksey Sergeyevich", "4314"),
        ("Abdug'ofirova Nilufar Abdulaziz Qizi", "4311"),
        ("Ne'matillayev Izzatilla Xikmatilla O'g'li", "4312"),
        ("Aripov Rustam Toxir O'g'li", "4315"),
        ("Kirgizbayeva Xadijabonu Artikovna", "4316"),
        ("Nurliboyev Nurbek To'rabek O'g'li", "4511"),
    ]),
    6: ("Suvonov Elshod Valijon O'g'li", [   # 6 leaders
        ("Nurmatova Basida Jurakulovna", "3911"),
        ("Maxmudov Mirvoxid Zokirovich", "3921"),
        ("Inomova Saydora Turdali Qizi", "4111"),
        ("Erkanboyev Zafarjon Buribay O'g'li", "4112"),
        ("Yusupova Firuza Rustamovna", "4113"),
        ("Mamatov Xasan Xaydarovich", "4211"),
    ]),
    7: ("Sultanova Umida Abdusalom Qizi", [   # 9 leaders
        ("Mirzayeva Muxlisa Sa'dullo Qizi", "2611"),
        ("Abdurasulov Yuldash Iskandar Ug'li", "2612"),
        ("Inoyatova Xabiba Gapirovna", "6911"),
        ("Sadikova Zilola Rustam Qizi", "6912"),
        ("Toxtaaxunova Madina Xandjar Qizi", "6913"),
        ("Omonxonova Oisha Akbar Qizi", "7011"),
        ("Boboyeva Fayyoza Xaydarovna", "7012"),
        ("Abduganiyev Izzatillo Gaybullo O'g'li", "7013"),
        ("Abduvaliyev Lutpillo Saydullo O'g'li", "7014"),
    ]),
    8: ("Maksumov Sanjar Kabul O'g'li", [   # 2 leaders
        ("Utanbayeva Arzigul Abdukayumovna", "8812"),
        ("Amirova Elnora Uktamovna", "8911"),
    ]),
    9: ("Mirmaxmudova Munira Temirbekovna", [   # 5 leaders
        ("Umarova Mapura Zakirovna", "8611"),
        ("Mukimova Marxabo Samandarovna", "8610, 8222"),
        ("Axmedova Nilufar Yakubdjanovna", "8210"),
        ("Bozorova Moxinur Safarali Qizi", "8213"),
        ("Jamolova Shoxsanam Abdurashid Qizi", "8217"),
    ]),
    10: ("Raximova Kamola Xikmat Qizi", [   # 3 leaders
        ("Ibragimjonov Farrux Ilhom O'g'li", "9123"),
        ("Yo'ldoshev Abbos Ziyoddula O'g'li", "9411, 9414"),
        ("Niyozov Izzatilla Xikmatulla O'g'li", "9412"),
    ]),
    11: ("Talipova Mamura Xabibullaevna", [   # 5 leaders
        ("Babayeva Sevara Abdulloxon Qizi", "4612"),
        ("Yakubova Nafisa Nasirovna", "4613"),
        ("Ashurov Shohzod Abdiqahhor Og'li", "4614"),
        ("Fayzullayeva Nilufar Shukurillayevna", "4615"),
        ("Nabixonov Amirxon Ma'rupxon O'g'li", "7511"),
    ]),
    12: ("Ergashov Muxriddin Shavkat Ugli", [   # 4 leaders
        ("Ismatov Shaxboz Xayitmurod O'g'li", "7223, 7222"),
        ("Usmonjonov G'iyosjon G'ulom O'g'li", "4421"),
        ("Davlatov Shoxruxjon Xamidjon O'g'li", "4424"),
        ("Abdusamatov Firdavs Sobirjon O'g'li", "7521"),
    ]),
    13: ("Olishov Islom Ilhom O'g'li", [   # 5 leaders
        ("Haydarov Jaloliddin Hoshimjon O'g'li", "9422, 9425"),
        ("Abdirafikov Adxamjon Abdumalik Ogli", "9423"),
        ("Eshonkulova Sanobar Jumanovna", "9426"),
        ("Baxriyev Tohir Xabibullo O'g'li", "9427"),
        ("Urolov Erkin Murodjon O'g'li", "9429"),
    ]),
    15: ("Yog'mirov Feruz Orifjon O'g'li", [   # 5 leaders
        ("Mirzabekov Otabek Ravshan O'g'li", "6722, 6732"),
        ("Donabayev Jasurbek Shuxrat O'g'li", "9121"),
        ("Murodov Shukur Raxim O'g'li", "9122"),
        ("Jumaniyazov Sanjarbek Umarbekovich", "8821"),
        ("Jurayev Murodjon Abdumalik O'g'li", "7427"),
    ]),
    16: ("Ibragimova Sayyora Shukurovna", [   # 5 leaders
        ("Ro'ziyeva Munisxon Akbaraliyevna", "7121"),
        ("Majidov Asliddin Umidulla O'g'li", "7421"),
        ("Atayeva Nigora Akbarovna", "7424"),
        ("Xadjibayeva Sevara Kadambayevna", "7425"),
        ("Saidqulov Ozodbek Dilshod O'g'li", "7426"),
    ]),
    17: ("Komolova Nargiza Karimovna", [   # 6 leaders
        ("Xolmatova Saodat Dilshot Qizi", "8121"),
        ("Ergasheva Lolaxon Nuralibek Qizi", "8221"),
        ("Eshquvatov Alibek Komiljon O'g'li", "8223"),
        ("Yusupova Visola Miraxmatovna", "8321"),
        ("Raxmanova Gulzoda Bazarbay Qizi", "8623"),
        ("Akramov Dilshodbek Asliddin O'gli", "8624"),
    ]),
    18: ("Akbarov Tursunali Mirzaliyevich", [   # 6 leaders
        ("Radjapov Shuxrat Raxim O'g'li", "2521"),
        ("Qodirov Asilbek Shukurullo O'g'li", "4321"),
        ("Sharipova Sayyora Abidjanovna", "4322"),
        ("Gadayeva Nargiza Mirxalikovna", "4326"),
        ("Mamajonov Sardorbek Murodjon O'g'li", "4521"),
        ("Yuldashov Nodirbek Kadamboy O'g'li", "7331"),
    ]),
    19: ("O'rozov Asqar Bo'ron O'g'li", [   # 4 leaders
        ("Maxmudov Sardor Yusuf O'g'li", "4121"),
        ("Nosirov Abbos Nurali O'g'li", "6821"),
        ("Jonizoqoqv Urolboy Quziboy O'g'li", "6822"),
        ("Yaxshilikov Diyorbek Asomiddin O'g'li", "4221"),
    ]),
}

def norm(s: str) -> str:
    """Normalize for duplicate detection: casefold, drop apostrophes, one space."""
    s = re.sub(r"[`´’‘ʻʼ']", "", s or "")
    return " ".join(s.split()).casefold()


dry_run = "--dry-run" in sys.argv[1:]

db = SessionLocal()
try:
    missing = [mid for mid in LEADERS if not db.query(Manager).filter_by(id=mid).first()]
    if missing:
        print(f"Manager ids not found in DB: {missing} — aborting, nothing written.")
        sys.exit(1)

    def sync_cells(leader_id: int, codes_str: str) -> int:
        """Reconcile the leader's owned cells rows to the file's code list.
        Returns the number of changes; a code owned by ANOTHER leader is
        reported and left untouched."""
        want = [c.strip() for c in (codes_str or "").split(",") if c.strip()]
        owned = db.query(Cell).filter_by(leader_id=leader_id).all()
        changes = 0
        for row in owned:
            if row.code not in want:
                print(f"      - released cell {row.code}")
                db.delete(row)
                changes += 1
        have = {row.code for row in owned}
        for code in want:
            if code in have:
                continue
            row = db.query(Cell).filter_by(code=code).first()
            if row and row.leader_id and row.leader_id != leader_id:
                other = db.query(RoleProfile).filter_by(id=row.leader_id).first()
                print(f"      ! cell {code} already owned by "
                      f"«{other.name if other else row.leader_id}» — left as is")
                continue
            if row:
                row.leader_id = leader_id
            else:
                db.add(Cell(code=code, leader_id=leader_id))
            changes += 1
        return changes

    created = skipped = warned = updated = 0
    for mid, (expected, leaders) in sorted(LEADERS.items()):
        mgr = db.query(Manager).filter_by(id=mid).first()
        print(f"\n[{mid}] {mgr.name} — shift {mgr.shift}   (file: «{expected}»)")
        existing = db.query(RoleProfile).filter_by(role="leader", manager_id=mid).all()
        for name, cells in leaders:
            dup = next((p for p in existing if p.name == name), None)
            if dup:
                if sync_cells(dup.id, cells):
                    print(f"  ~ exists, cells synced → {cells}: {name}")
                    updated += 1
                else:
                    print(f"  = exists, skipped: {name}")
                    skipped += 1
                continue
            near = next((p for p in existing
                         if norm(p.name).startswith(norm(name)) or norm(name).startswith(norm(p.name))), None)
            if near:
                print(f"  ! SKIPPED — likely same person already exists as «{near.name}» "
                      f"(id {near.id}): {name}")
                warned += 1
                continue
            p = RoleProfile(role="leader", name=name, manager_id=mid)
            db.add(p)
            db.flush()  # leader row first — its cells need p.id
            sync_cells(p.id, cells)
            print(f"  + {name}  → {cells}")
            created += 1

    print(f"\n{created} to create, {updated} cell syncs, {skipped} unchanged "
          f"duplicates skipped, {warned} near-duplicates skipped (review the ! lines).")
    if dry_run:
        db.rollback()
        print("Dry run — rolled back, nothing written.")
    else:
        db.commit()
        print("Committed.")
finally:
    db.close()
