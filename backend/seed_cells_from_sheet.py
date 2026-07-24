"""One-off seed: fill the cells registry (SAP codes + workshop names) and
re-sync leader ownership from the «Штатное расписание (Azizxon version)» sheet
(workbook 1GGVT7BaGAAnZU0ZrWxTfJpHzdcbMCs2e8uRmirubVxg, gid 1361610748), pulled
2026-07-23.

Scope / decisions — sap_code is the piece that links a cell to its Production
«Команда» (see the cells-connectivity work):
  * Only cells whose sheet supervisor is one of our 19 managers. 17 match by
    name; unit 5 (Suvonov Elshod Of) is the sheet's «…SUVONOV… TEST» section
    (confirmed). Unit 14 (Fayzullaeva Malika) has no rows here and none in the
    system — nothing to seed.
  * SAP codes normalized Cyrillic→Latin (В1861→B1861, А2894→A2894) so they match
    the Latin work-center codes on the Production page. "-" / blank → NULL.
  * name_workshop_ru = the sheet's Russian «Наименование цеха»;
    name_workshop_uz_cyrl = transliterate(name, "uz_cyrl") (the app keeps
    Cyrillic as-is for uz_cyrl).
  * Closed «ёпиқ ячейка» cells skipped: 0621, 0631, 5012, 7131, 9424. The bad
    «ОБЛ» row (unit 9) and the duplicate second «7415» (unit 3) are dropped.
  * Leaders RE-SYNCED from the «Ф.И.О. Лидер» column: a named leader is matched
    (case/apostrophe-insensitive) to an existing leader profile under that
    manager and assigned; a BLANK leader UNASSIGNS the cell (leader_id NULL). A
    named-but-unknown leader is left as-is with a warning and never auto-created
    — this preserves the earlier decision to exclude O'rozov Asqar and Ochilov
    Murodali as leaders of O'rozov's cells (4122 / 4123).

SAP/name are written only when the sheet has a value (a blank never wipes an
existing SAP code or name). Cells absent from the sheet are left untouched.

142 cells embedded. Against the seed baseline this is ~108 existing cells
updated (SAP + names filled) and ~34 new cells created, with 2 unknown-leader
warnings (O'rozov 4122, Ochilov 4123). ALWAYS run --dry-run on prod first and
review the reported "unassigned (blank in sheet)" lines: re-sync sets leader_id
to NULL for any sheet cell whose leader column is blank, which on prod may drop
an owner an admin set via the Cells tab since the last seed.

Usage (from backend/):
    python3 seed_cells_from_sheet.py --dry-run   # report only, nothing written
    python3 seed_cells_from_sheet.py             # apply + commit

Data-only: no Passenger restart needed. Safe to re-run (idempotent upsert).
"""
import re
import sys
sys.path.insert(0, ".")

from app.database import engine, Base, SessionLocal
from app.models import Cell, Manager, RoleProfile
from app.startup import migrate_cells_table
from app.translit import transliterate

# Self-bootstrap: ensure the cells table / columns exist before we write.
Base.metadata.create_all(bind=engine)
migrate_cells_table()

# (manager_id, verifix_code, sap_code|None, name_ru|None, sheet_leader_name)
CELLS = [
    # [1] Aripova Manzura Salixdjanovna  (9)
    (1, '0811', 'A0081', 'Участок пригот. начинок пирож. №1.1', "TURDIMURODOV NODIRJON LATIBJON O'G'LI"),
    (1, '0812', 'A006Z', 'Участок чистки ягод', ''),
    (1, '0822', 'A0161', 'Участок очистки ягод №1.1', 'SALOMOV ELYORJON SHUHRATOVICH'),
    (1, '2511', 'A0082', 'Участок приготовления компотов №1.2', ''),
    (1, '4411', 'A1251', 'Участок пригот. начинок тортов №1.1', 'ZUXUROVA MAKTUBA IBROXIMOVNA'),
    (1, '4412', 'A1441', 'Участок сборки круг пирож №1.1', 'ALABERDIYEV ABDULAHAD XUDAYNAZAROVICH'),
    (1, '4413', 'A1442', 'Участок сборки прям пирож №1.2', 'ASQAROVA MUXLISA AXMADJON QIZI'),
    (1, '4414', 'A1443', 'Участок предзагат. пирож №1.3', ''),
    (1, '4415', 'A1444', 'Участок сборки ПП изд. №1.4', 'ASQAROVA MUXLISA AXMADJON QIZI'),
    # [2] Artikova Masuda Abduvaxabovna  (8)
    (2, '2312', 'A1232', 'Участок оформ мел.изд. (эклер) №1.2', 'XIDIROVA ZEBO KARIMOVNA'),
    (2, '2811', 'A1281', 'Участок фасовки мел.изд. №1.1', 'JURAYEVA XULKAROY NOZIMJONOVNA'),
    (2, '2812', None, 'Участок фасовки мел.изд. №1.1', 'JURAYEVA XULKAROY NOZIMJONOVNA'),
    (2, '7311', 'A2731', 'Участок приготов. пф мел. изд. корж №1.1', 'RUZIYEVA IQBOL JURAYEVNA'),
    (2, '7312', 'A1231', 'Участок оформ мел.изд. (тарт) №1.1', 'RUZIYEVA IQBOL JURAYEVNA'),
    (2, '7313', 'A2733', 'Участок пригот. пф мел. изд. эклер №1.1', 'ABDURAUPOVA NARGIZA SHAKIRDJANOVNA'),
    (2, '7314', 'A2734', 'Участок приготов. макаронс №1.1', 'JONNAYEV ASLIDDIN AKROMOVICH'),
    (2, '7315', None, 'Участок пригот. пф мел. изд. эклер №1.1', 'ABDURAUPOVA NARGIZA SHAKIRDJANOVNA'),
    # [3] Abdukarimov Sanjar Xayrulla O'g'li  (10)
    (3, '6712', 'A1283', 'УЧАСТОК ФАСОВКИ ПИРОГ №1.1', "TURSUNBOYEV ABDUQODIR ABSALOM O'G'LI"),
    (3, '7111', 'A1871', 'Участок фасовки печенье №1.1', "TURSUNBOYEV ABDUQODIR ABSALOM O'G'LI"),
    (3, '7411', 'A2891', 'Участок формовки печ. №1.1', 'KULBOYEVA DJUMAGUL SATIBALDIYEVNA'),
    (3, '7412', 'A2891', 'Участок формовки печ. №1.2', 'KULBOYEVA DJUMAGUL SATIBALDIYEVNA'),
    (3, '7413', 'A2891', 'Участок формовки печ. №1.3', 'AXMIRZAYEVA NILUFAR KUDRAT QIZI'),
    (3, '7414', 'A2891', 'Участок формовки печ. №1.4', 'AXMIRZAYEVA NILUFAR KUDRAT QIZI'),
    (3, '7415', 'A28911', 'Участок предзагатов.пирог 1.1', "KAXAROV DILMUROD SHERMAXAMAT O'G'LI"),
    (3, '7416', 'A28910', 'Участок приготовление пирог 1.1', 'SULTANOVA DILDORA ABIDJANOVNA'),
    (3, '7417', 'A28910', 'Участок приготовление пирог 1.2', 'TURSUNBOYEVA LOBAR ERKINOVNA'),
    (3, '7418', 'A28910', 'Участок приготовление пирог 1.3', 'SULTANOVA DILDORA ABIDJANOVNA'),
    # [4] Xakimov Ruslan Erkinovich  (13)
    (4, '4911', 'A2491', 'Участок выпекания бисквитов', "HAMIDOV O'TKIRJON SHOKIRJONOVICH"),
    (4, '6411', 'A2641', 'Участок резки бисквитов №1.1', 'SAIDOVA XOSIYATXON ERKABAYEVNA'),
    (4, '6611', None, None, ''),
    (4, '6711', None, None, ''),
    (4, '6811', 'A2682', 'Участок замеса бисквит. теста №1.2', "BAYMENOV QAXRAMON BAXTI O'G'LI"),
    (4, '6812', None, None, "HAMIDOV O'TKIRJON SHOKIRJONOVICH"),
    (4, '6831', None, 'Замес бисквитов', ''),
    (4, '6832', None, 'Смазка Бисквитов', ''),
    (4, '7211', 'A2721', 'Участок приготов. песоч. коржей №1.1', 'GIYASOVA XILOLA TAXIRDJANOVNA'),
    (4, '7212', 'A2722', 'Участок приготов. наполеон коржей №1.2', 'GIYASOVA XILOLA TAXIRDJANOVNA'),
    (4, '7611', 'A2761', 'Участок приготов. хлеб. изд. №1.1', ''),
    (4, '7621', 'A2762', 'Участок приготов. хлеб. изд. №1.2', ''),
    (4, '8920', None, None, 'RAZIKOV BOTIR NODIROVICH'),
    # [5] Suvonov Elshod Of  (7)
    (5, '4311', 'A1431', 'Участок оформ. глазур. тортов №1.1', "ABDUG'OFIROVA NILUFAR ABDULAZIZ QIZI"),
    (5, '4312', 'A1432', 'Участок оформ. крем. тортов №1.2', "NE'MATILLAYEV IZZATILLA XIKMATILLA O'G'LI"),
    (5, '4313', 'A1433', 'Участок оформ. прям. тортов №1.3', 'ABDUMALIKOVA ZIYODA AZIM QIZI'),
    (5, '4314', 'A1434', 'Участок оформ. прям. тортов №1.4', 'BUTABEKOV ALEKSEY SERGEYEVICH'),
    (5, '4315', 'A1435', 'Участок смазки глазур. тортов №1.5', "ARIPOV RUSTAM TOXIR O'G'LI"),
    (5, '4316', 'A1436', 'Участок предоформ. крем. тортов №1.6', 'KIRGIZBAYEVA XADIJABONU ARTIKOVNA'),
    (5, '4511', 'A1451', 'Участок предзагат. оформ. тортов №1.1', "NURLIBOYEV NURBEK TO'RABEK O'G'LI"),
    # [6] Suvonov Elshod Valijon O'g'li  (7)
    (6, '3911', 'A1391', 'Участок разморозки сливок', 'NURMATOVA BASIDA JURAKULOVNA'),
    (6, '3921', 'A1392', 'Участок приготов. сливок №2.1', 'MAXMUDOV MIRVOXID ZOKIROVICH'),
    (6, '4111', 'A1411', 'Участок сборки круг. тортов №1.1', 'INOMOVA SAYDORA TURDALI QIZI'),
    (6, '4112', 'A1412', 'Участок сборки круг. тортов №1.2', "ERKANBOYEV ZAFARJON BURIBAY O'G'LI"),
    (6, '4113', 'A1413', 'Участок сборки прям. тортов №1.3', 'YUSUPOVA FIRUZA RUSTAMOVNA'),
    (6, '4114', 'A1451z', 'Участок приготов. сливок №1.1', ''),
    (6, '4211', 'A1421', 'Участок взбития кремов №1.1', 'MAMATOV XASAN XAYDAROVICH'),
    # [7] Sultanova Umida Abdusalom Qizi  (11)
    (7, '2611', 'A1261', 'Участок предзагат. маст. тортов №1.1', "MIRZAYEVA MUXLISA SA'DULLO QIZI"),
    (7, '2612', 'A1262', 'Участок оформ маст. тортов №1.2', "ABDURASULOV YULDASH ISKANDAR UG'LI"),
    (7, '6911', 'A2691', 'Участок оформ имбир. пряник №1.1', 'INOYATOVA ХABIBA GAPIROVNA'),
    (7, '6912', 'A2692', 'Участок мастич. игрушек №1.2', 'SADIKOVA ZILOLA RUSTAM QIZI'),
    (7, '6913', 'A2693', 'Участок мастич. цветов №1.3', 'TOXTAAXUNOVA MADINA XANDJAR QIZI'),
    (7, '7011', 'A2701', 'Участок шок декоров торт №1.1', 'OMONXONOVA OISHA AKBAR QIZI'),
    (7, '7012', 'A2702', 'Участок шок декоров пирож. №1.2', 'BOBOYEVA FAYYOZA XAYDAROVNA'),
    (7, '7013', 'A2703', 'Участок крем. декоров №1.3', "ABDUGANIYEV IZZATILLO GAYBULLO O'G'LI"),
    (7, '7014', 'A2704', 'Участок детских декоров №1.4', "ABDUVALIYEV LUTPILLO SAYDULLO O'G'LI"),
    (7, '7015', 'A2705', 'Офор.Чак чак', ''),
    (7, '7016', None, 'Шок.декор', ''),
    # [8] Maksumov Sanjar Kabul O'g'li  (8)
    (8, '4811', None, 'Цех Просеивания', ''),
    (8, '7213', 'A2723', 'Участок приготов. медов. коржей №1.3', ''),
    (8, '7214', 'A2723', 'Участок приготов. медов. коржей №1.3', ''),
    (8, '8411', None, 'Цех Просеивания', ''),
    (8, '8421', None, 'Цех Просеивания', ''),
    (8, '8811', 'B2881', 'Участок замеса теста №1.1', ''),
    (8, '8812', 'B2882', 'Участок замеса теста №1.2', 'UTANBAYEVA ARZIGUL ABDUKAYUMOVNA'),
    (8, '8911', 'A2897', 'Участок приготовление Бисконти 1.1', 'AMIROVA ELNORA UKTAMOVNA'),
    # [9] Mirmaxmudova Munira Temirbekovna  (7)
    (9, '8210', 'B0821', 'Участок формовки мини самса №1.1', 'AXMEDOVA NILUFAR YAKUBDJANOVNA'),
    (9, '8213', 'B0823', 'Участок формовки  самса №1.1', 'BOZOROVA MOXINUR SAFARALI QIZI'),
    (9, '8217', 'B0826', 'Участок формовки  пицца №1.1', 'JAMOLOVA SHOXSANAM ABDURASHID QIZI'),
    (9, '8222', 'B0829', 'Участок приготов.полуфабрикат №2.2', 'MUKIMOVA MARXABO SAMANDAROVNA'),
    (9, '8311', 'B0831', 'Участок раскат.тесто №1.1', ''),
    (9, '8610', 'B0828', 'Участок предзагатовка мяс.изд №1.1', 'MUKIMOVA MARXABO SAMANDAROVNA'),
    (9, '8611', 'B1861', 'Участок предзагатов.мяс.изд №1.1', 'UMAROVA MAPURA ZAKIROVNA'),
    # [10] Raximova Kamola Xikmat Qizi  (5)
    (10, '9123', 'B2911', 'Цех слоеных изд3', 'IBRAGIMJONOV FARRUX ILHOM O`G`LI'),
    (10, '9411', 'B2942', 'Пекарняпред.заг', "YO'LDOSHEV ABBOS ZIYODDULA O'G'LI"),
    (10, '9412', 'B2943', 'Пекарня1', "NIYOZOV IZZATILLA XIKMATULLA O'G'LI"),
    (10, '9413', None, 'Пекарня2', ''),
    (10, '9414', 'A2743', 'Пекарня3', "YO'LDOSHEV ABBOS ZIYODDULA O'G'LI"),
    # [11] Talipova Mamura Xabibullaevna  (6)
    (11, '4611', 'A1461', 'Участок оформ глазур. пирож №1.1', ''),
    (11, '4612', 'A1462', 'Участок оформ прям. пирож №1.2', 'BABAYEVA SEVARA ABDULLOXON QIZI'),
    (11, '4613', 'A1463', 'Участок оформ рулет. пирож №1.3', 'YAKUBOVA NAFISA NASIROVNA'),
    (11, '4614', 'A1464', 'Участок предзагат. оформ. пирож №1.4', "ASHUROV SHOHZOD ABDIQAHHOR OG'LI"),
    (11, '4615', 'A1465', 'Участок оформ ПП изд. №1.5', 'FAYZULLAYEVA NILUFAR SHUKURILLAYEVNA'),
    (11, '7511', 'A2751', 'Участок приготов. кекс. №1.1', "NABIXONOV AMIRXON MA'RUPXON O'G'LI"),
    # [12] Ergashov Muxriddin Shavkat Ugli  (7)
    (12, '4421', 'A1445', 'Участок предзагат. пирож №2.1', "USMONJONOV G'IYOSJON G'ULOM O'G'LI"),
    (12, '4422', 'A1447', 'Участок сборки прям пирож №2.3', ''),
    (12, '4423', 'A1446', 'Участок сборки круг пирож №2.2', ''),
    (12, '4424', 'A1448', 'Участок предзагат. оформ пирож №2.1', "DAVLATOV SHOXRUXJON XAMIDJON O'G'LI"),
    (12, '7222', 'A14310', 'Участок оформл. "Наполеон" №2.4', "ISMATOV SHAXBOZ XAYITMUROD O'G'LI"),
    (12, '7223', 'A14310', 'Участок оформл. "Наполеон" №2.4', "ISMATOV SHAXBOZ XAYITMUROD O'G'LI"),
    (12, '7521', 'A2752', 'Участок приготов. кекс. №2.1', 'ABDUSAMATOV FIRDAVS SOBIRJON O`G`LI'),
    # [13] Olishov Islom Ilhom O'g'li  (6)
    (13, '9422', 'B28913', 'Участок выпекан. пирог печ. №1.1', "HAYDAROV JALOLIDDIN HOSHIMJON O'G'LI"),
    (13, '9423', 'B2942', 'Участок предзагат. сдоба', 'ABDIRAFIKOV ADХAMJON ABDUMALIK OGLI'),
    (13, '9425', 'B2943', 'Участок оформ. сдоба', "HAYDAROV JALOLIDDIN HOSHIMJON O'G'LI"),
    (13, '9426', 'B2943', 'Участок оформ. сдоба', 'ESHONKULOVA SANOBAR JUMANOVNA'),
    (13, '9427', 'B2943', 'Участок оформ. сдоба', "BAXRIYEV TOHIR XABIBULLO O'G'LI"),
    (13, '9429', 'B2948', 'Участок выпекан. сдоба слойка', "UROLOV ERKIN MURODJON O'G'LI"),
    # [15] Yog'mirov Feruz Orifjon O'g'li  (7)
    (15, '6722', None, 'Фасовка пирогов', "MIRZABEKOV OTABEK RAVSHAN O'G'LI"),
    (15, '6732', None, 'Фасовка пирогов', "MIRZABEKOV OTABEK RAVSHAN O'G'LI"),
    (15, '7221', None, 'Медовые коржи', ''),
    (15, '7427', None, 'Цех Пирог', "JURAYEV MURODJON ABDUMALIK O'G'LI"),
    (15, '8821', 'B2883', 'Участок замеса слоен. теста №2.1', 'JUMANIYAZOV SANJARBEK UMARBEKOVICH'),
    (15, '9121', 'B2911', 'Участок приготов. слоен. изд. №2.1', "DONABAYEV JASURBEK SHUXRAT O'G'LI"),
    (15, '9122', 'B2912', 'Участок приготов. слоен. изд. №2.2', "MURODOV SHUKUR RAXIM O'G'LI"),
    # [16] Ibragimova Sayyora Shukurovna  (7)
    (16, '7121', 'A1872', 'Участок фасовки печенье №2.1', "RO'ZIYEVA MUNISXON AKBARALIYEVNA"),
    (16, '7421', 'A2894', 'Участок предзагат. печенья №2.1', "MAJIDOV ASLIDDIN UMIDULLA O'G'LI"),
    (16, '7422', 'A2894', 'Участок предзагат. печенья №2.1', ''),
    (16, '7423', 'A2894', 'Участок предзагат. печенья №2.1', ''),
    (16, '7424', 'A2894', 'Участок предзагат. печенья №2.1', 'ATAYEVA NIGORA AKBAROVNA'),
    (16, '7425', 'A2894', 'Участок предзагат. печенья №2.1', 'XADJIBAYEVA SEVARA KADAMBAYEVNA'),
    (16, '7426', 'A2894', 'Участок предзагат. печенья №2.1', "SAIDQULOV OZODBEK DILSHOD O'G'LI"),
    # [17] Komolova Nargiza Karimovna  (8)
    (17, '8121', None, None, 'XOLMATOVA SAODAT DILSHOT QIZI'),
    (17, '8221', 'B08210', 'Участок приготов. полуфабрикат. №2.2', 'ERGASHEVA LOLAXON NURALIBEK QIZI'),
    (17, '8223', 'B08211', 'Участок нарезки теста №2.3', "ESHQUVATOV ALIBEK KOMILJON O'G'LI"),
    (17, '8225', 'B08213', 'Участок формовки самса №2.5', ''),
    (17, '8321', 'B08213', 'Участок формовки самса №2.5', 'YUSUPOVA VISOLA MIRAXMATOVNA'),
    (17, '8622', 'B1864', 'Участок приготов. блинчиков №2.3', ''),
    (17, '8623', 'B1864', 'Участок приготов. блинчиков №2.3', 'RAXMANOVA GULZODA BAZARBAY QIZI'),
    (17, '8624', 'B1864', 'Участок приготов. блинчиков №2.3', "AKRAMOV DILSHODBEK ASLIDDIN O'GLI"),
    # [18] Akbarov Tursunali Mirzaliyevich  (8)
    (18, '2521', 'A1252', 'Участок пригот. начинок тортов №2.1', "RADJAPOV SHUXRAT RAXIM O'G'LI"),
    (18, '4321', 'A1437', 'Участок оформ. глазур. тортов №2.1', "QODIROV ASILBEK SHUKURULLO O'G'LI"),
    (18, '4322', 'A1438', 'Участок оформ. крем. тортов №2.2', 'SHARIPOVA SAYYORA ABIDJANOVNA'),
    (18, '4323', 'A14312', 'Участок предоформ. крем. тортов №2.6', ''),
    (18, '4325', 'A14311', 'Участок смазки глазур. тортов №2.5', ''),
    (18, '4326', 'A1439', 'Участок оформ. прям. тортов №2.3', 'GADAYEVA NARGIZA MIRXALIKOVNA'),
    (18, '4521', 'A1452', 'Участок предзагат. оформ. тортов №2.1', 'MAMAJONOV SARDORBEK MURODJON O`G`LI'),
    (18, '7331', 'A2736', 'Участок приготов. безе №3.1', "YULDASHOV NODIRBEK KADAMBOY O'G'LI"),
    # [19] O'rozov Asqar Bo'ron O'g'li  (8)
    (19, '4121', 'A1414', 'Участок сборки круг. тортов №2.1', "MAXMUDOV SARDOR YUSUF O'G'LI"),
    (19, '4122', 'A1415', 'Участок сборки круг. тортов №2.2', "O'ROZOV ASQAR BO'RON O'G'LI"),
    (19, '4123', 'A1416', 'Участок сборки прям. тортов №2.3', "OCHILOV MURODALI G'AYRAT O'G'LI"),
    (19, '4124', None, 'Заг.прям.круг.торт4', ''),
    (19, '4221', 'A1422', 'Участок взбития кремов №2.1', "YAXSHILIKOV DIYORBEK ASOMIDDIN O'G'LI"),
    (19, '6621', None, 'Склад коржей 66', ''),
    (19, '6821', 'A2683', 'Участок формовки бисквитов №2.1', 'NOSIROV ABBOS NURALI O`G`LI'),
    (19, '6822', 'A2684', 'Участок замеса бисквит. теста №2.2', 'JONIZOQOQV UROLBOY QUZIBOY O`G`LI'),
]

# Cyrillic homoglyph fold for matching leader names to existing profiles.
_HOMO = {"Х": "X", "х": "x", "О": "O", "о": "o", "А": "A", "а": "a", "Е": "E",
         "е": "e", "Р": "P", "р": "p", "С": "C", "с": "c", "Т": "T", "М": "M",
         "Н": "H", "К": "K", "В": "B"}
def _fold(s: str) -> str:
    s = "".join(_HOMO.get(ch, ch) for ch in (s or ""))
    s = re.sub(r"[`´’‘ʻʼ'\-–—]", "", s)
    return " ".join(s.split()).casefold()


dry_run = "--dry-run" in sys.argv[1:]
db = SessionLocal()
try:
    mids = sorted({c[0] for c in CELLS})
    missing = [m for m in mids if not db.query(Manager).filter_by(id=m).first()]
    if missing:
        print(f"Manager ids not found in DB: {missing} — aborting, nothing written.")
        sys.exit(1)

    # Existing leader profiles per manager, indexed by folded name.
    prof_by_mid = {}
    for m in mids:
        idx = {}
        for p in db.query(RoleProfile).filter_by(role="leader", manager_id=m).all():
            idx.setdefault(_fold(p.name), p)
        prof_by_mid[m] = idx

    created = updated = assigned = unassigned = warned = 0
    for mid, verifix, sap, name, leader in CELLS:
        uzc = transliterate(name, "uz_cyrl") if name else None
        # Resolve the sheet leader: "set" a matched profile, "none" to unassign a
        # blank, or "warn" (leave the current owner) for an unknown name.
        mode, lid = "none", None
        if leader.strip():
            prof = prof_by_mid[mid].get(_fold(leader))
            if prof:
                mode, lid = "set", prof.id
            else:
                mode = "warn"
                warned += 1
                print(f"  ! [{mid}] {verifix}: leader «{leader}» is not a known "
                      f"profile — leaving ownership unchanged")

        cell = db.query(Cell).filter_by(verifix_code=verifix).first()
        if cell:
            if sap is not None:
                cell.sap_code = sap
            if name:
                cell.name_workshop_ru = name
                cell.name_workshop_uz_cyrl = uzc
            if mode == "set":
                if cell.leader_id != lid:
                    assigned += 1
                cell.leader_id = lid
            elif mode == "none":
                if cell.leader_id is not None:
                    unassigned += 1
                    print(f"  - [{mid}] {verifix}: unassigned (blank in sheet)")
                cell.leader_id = None
            updated += 1
        else:
            new_lid = lid if mode == "set" else None
            db.add(Cell(verifix_code=verifix, sap_code=sap, name_workshop_ru=name,
                        name_workshop_uz_cyrl=uzc, leader_id=new_lid))
            created += 1
            if mode == "set":
                assigned += 1

    print(f"\n{created} created, {updated} updated, {assigned} leader assignments, "
          f"{unassigned} unassigned (blank in sheet), {warned} unknown-leader warnings.")
    if dry_run:
        db.rollback()
        print("Dry run — rolled back, nothing written.")
    else:
        db.commit()
        print("Committed.")
finally:
    db.close()
