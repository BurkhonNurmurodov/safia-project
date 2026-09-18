"""The leader-checklist rules the operator agreed on 18 September 2026.

THE TEXTS AND THE ONE PASS THAT WRITES THEM, for every non-archived unit.

Two things live here and nothing else does: the agreed `criteria` (what Gemini
is asked, in English — the reviewer follows compound rules most consistently in
English) and the agreed `description` (what the leader reads, Uzbek Latin, the
operator's own words). They are TWO columns for a reason documented in
CLAUDE.md: `criteria` is the grader's test, `description` is the instruction,
and `leader_ai._prompt` does not know the second one exists — so a description
can never move a verdict, past or future.

Task 13 carries TWO of each, picked by the unit's SHIFT, because its date rule
differs by shift: shift 1 fills the report on the day it worked (table date ==
the computer's clock), while shift 2 fills it after midnight, so the clock is
exactly ONE DAY LATER than the table. A unit belongs to exactly one shift, so
per-unit texts express that with no new mechanism.

Tasks 1, 8 and 9 are deliberately ABSENT: they keep today's rules until the
automatic checks are built.

WHAT ELSE THE PASS WRITES, and why each one is here rather than left to an
admin clicking 21 modals:

  * task 11 `date_plus` = 1 — the staff list may be dated the NEXT day.
  * task 13 `day_check` = False — the TIME-ONLY date mode: the hour is still
    judged against the window, the DAY is not. The day question moves into the
    criteria text, as the relation between the two dates visible on the screen.
  * task 3 `min_media` = 3 — the criteria demands three photos, so the app must
    too, or a leader submits one, is told the task is complete, and is then
    rejected by the grader for a setting they never saw.

DELIBERATELY NOT WRITTEN: task 13's photo window. `leader_ai.resolve_window`
falls through to `shift_window(shift)`, so a shift-1 unit that stores no window
is ALREADY judged against 07:00-20:00 and its task ALREADY closes at 20:00 —
verified against the 11 Sep production copy, where 62 of the 68 shift-1 task-13
closes after 20:00 land in the 20:00-20:04 autoclose sweep. Writing the same
hours explicitly would move nothing and would put a row on 13 units saying they
override a value they merely inherit. Shift 2 keeps its own 00:00-08:00.

Nothing here is stored twice and nothing is denormalised: every write goes
through the admin setters in `leader_tasks`, so the admin page can edit any of
it afterwards and the pass is exactly what an operator would have typed.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import LeaderTaskDef, Manager
from app.services import leader_ai, leader_tasks

# The tasks whose texts this pass rewrites. 13 is separate — see CRITERIA_BY_SHIFT.
TASKS = (2, 3, 4, 5, 6, 7, 10, 11, 12)
SHIFT_TASKS = (13,)

#: task 11 — a staff list may be dated the day after the report's.
DATE_PLUS_TASK, DATE_PLUS = 11, 1

#: The DATE MODE each task is judged in, written WHOLE — (date_check, day_check,
#: time_check) — never one flag of it.
#:
#: Writing a single flag and inheriting the rest is how a task ends up in a mode
#: nobody chose. Two proofs of that, both found on the 11 Sep production copy:
#: task 11 is DATE-ONLY on all 13 shift-1 units (they carry `time_check` False)
#: and STRICT on all 8 shift-2 units, which inherit the global True — so the
#: same «+1 day» tolerance means two different things across the fleet, and
#: shift 2 was still failing staff lists on the CLOCK while the criteria text
#: shipped beside it says the clock is not judged at all. And task 13 inherits
#: its `time_check` from the global floor, so writing only `day_check` False
#: leaves TIME-ONLY resting on a global value an admin may edit — at which point
#: `date_flags` returns nothing at all and the task is silently exempt
#: (`not check or not (days or times)`), which is the one mode the admin UI
#: never offers.
#:
#: 11 — DATE ONLY: the day must be the report's (or the day after, `date_plus`),
#:      the hour is never compared.
#: 13 — TIME ONLY: the hour must be inside the window, the day is not compared;
#:      the day question lives in the criteria instead, as the relation between
#:      the two dates visible on the screen.
DATE_MODES = {
    11: {"date_check": True, "day_check": True, "time_check": False},
    13: {"date_check": True, "day_check": False, "time_check": True},
}
#: task 3 — the criteria demands three photos, so the app must demand three.
MIN_MEDIA_TASK, MIN_MEDIA = 3, 3


#: task_id -> the English text Gemini is given after "TALAB:".
CRITERIA = {
    2: "The proof for this task is a photo of the start-of-shift meeting: the leader stands among the cell's workers, before work has started. One of the workers takes the photo on the leader's phone.\n\nPASSES if all of the following are visible:\n- A group of people standing together in one place. There is no limit on how many, but this must be a gathering, not a photo of one person.\n- Nobody is working: no one is handling products, dough, tools or machines — the people are listening or talking.\n\nFAILS if:\n- There is only one person in the photo, or nobody.\n- The people are not gathered together; each one is at their own workstation.\n- At least one person is clearly working (kneading dough, arranging products, operating a machine).\n- The photo shows a document or a screen.\n\nNOT JUDGED: which person is the leader — you cannot recognise people by face, so do not require it; clothing and uniform; whether the people are looking at the camera.",
    3: "The proof for this task is a set of photos taken during the day in 3 different processes: the workplace is clean and any worker visible is in standard work clothing.\n\nPASSES if all of the following hold:\n- There are at least 3 photos and they show 3 different processes: a different work step, a different workstation or different equipment (for example kneading, shaping, packing). The process may be in the leader's own cell or in a neighbouring one. Photos of one process from different angles count as one process.\n- In every photo the workplace is clean: nothing unrelated to the work on the table (phone, personal belongings, tea or water cup, bottle, towel, rag, loose paper), and no waste on the table or the floor. Things the process itself needs — flour, dough, product, trays, tools — do not count as clutter.\n- Every worker visible in a photo is in work clothing (uniform).\n- No visible worker has bare forearms: sleeves are down, or, if rolled up, the forearm and arm are fully covered by an inner sleeve or an arm cover.\n\nFAILS if:\n- There are fewer than 3 photos, or the photos do not show 3 different processes.\n- In at least one photo there is clutter or waste on the table.\n- At least one visible worker is without work clothing or has bare forearms.\n\nIMPORTANT:\n- A photo may show no worker at all — that is not a fault: such a photo is judged only on the process and the cleanliness of the workplace.\n- For a worker only partly in frame, judge only the visible part.\n- If there are more than 3 photos, the cleanliness and clothing rules apply to all of them, while 3 different processes only need to be among them.\n\nNOT JUDGED: the time between photos; who the workers are; the apron, head covering and gloves; which cell a process belongs to.",
    4: 'The proof for this task is a screenshot of the inspection list screen in the Tasker app. There is exactly one requirement: the screenshot must be of that screen.\n\nThat screen looks like this:\n- A header row at the top: a back arrow on the left, the workshop or cell name in the middle (for example «Заготовка Пирожных 1.24»), and a round «+» button on the right.\n- Below it, a series of cards. Each card has a check name and a time range (for example «Цехни текшируви 14:30 - 15:30», «Холодильник 14:30 - 15:30»), an arrow on the right, a progress bar underneath, and beside it a count of completed items (for example «12/14») and a percentage (for example «86.0 %»).\n- Some cards also carry a grey note (for example «toldirilmagan») and a red «Отменить все задачи» link.\n\nPASSES if the screenshot shows that screen with at least one card.\n\nFAILS if:\n- Another screen is shown: one card opened, a different page of Tasker, or a different app.\n- A paper or another document has been photographed.\n\nNOT JUDGED: the workshop name; the percentages, counts and number of cards; the notes; the time ranges; the date and time in the screenshot.',
    5: 'The proof for this task is a photo taken while raw material is being received: a worker stands next to the goods that have arrived, holding a paper document.\n\nPASSES if all of the following are visible:\n- A worker stands next to newly arrived goods or raw material: boxes, crates, sacks, a pallet or a loaded cart is clearly visible in the photo.\n- The worker is holding a paper document in their hand. Any paper document is enough.\n\nFAILS if:\n- The worker has no paper in hand (even if a paper is lying on a table or elsewhere).\n- The arrived goods are not visible.\n- There is no person in the photo: only the goods, or only the document.\n\nNOT JUDGED: what is written on the document — the word «AKT» does not have to be readable; who the worker is; the type and amount of the product.',
    6: 'The proof for this task is a photo of a delivery reaching the cell: newly arrived products, or a vagonetka. It passes if EITHER of the following is visible:\n\nFIRST CASE — a worker is looking at newly arrived products: standing next to boxes, crates or packaged products, with their gaze on those products.\n\nSECOND CASE — a worker is with a vagonetka (a wheeled rack trolley): holding it, pushing or pulling it, or simply standing next to it. The vagonetka may be loaded with products or empty — both are accepted.\n\nFAILS if:\n- Neither case is visible.\n- A vagonetka is in the photo but no worker is beside it — the worker must be next to the vagonetka, not somewhere else in the frame.\n- There is no person in the photo.\n\nNOT JUDGED: whether the worker is really checking the expiry date — that cannot be told from a photo; the date on the label; the type of product; who the worker is.',
    7: "The proof for this task is a photo of the cell's printed control form (on paper). Even though the task name contains «SAP», the proof is that paper form. If the form is long, several photos may show it in full together.\n\nThe form looks like this:\n- Printed fields at the top: «ППП #», «Ячейка #», «Лидер», and a date box in the top-right corner.\n- Table columns: «Махсулот номи», «Махсулот сони (шт,кг)», «Бошланган вакт», «Тугатилган вакт», «Пландаги вакт», «Факт».\n- The product names in the first column are pre-printed; extra products may be written by hand below them.\n\nPASSES if all of the following are visible:\n- The document in the photo is that printed form.\n- All three items are filled in at the top: the cell code next to «Ячейка #» (a 4-digit number, printed or handwritten), the leader's name next to «Лидер», and a date in the date box.\n- EVERY product that has a quantity («Махсулот сони») written also has a start time, a finish time and «Факт».\n- If a product was made in several processes, the extra times are written on the unnamed lines below it — those lines belong to that product, and every time range on them must also be complete (start, finish and «Факт»).\n\nFAILS if:\n- The photo shows a different form, a hand-drawn table or a screen.\n- At least one of the three items at the top is missing.\n- At least one product with a quantity (or a time line below it) is missing its start time, finish time or «Факт».\n- The form was shot from too far away or at too much of an angle to read, or part of it is cut off.\n\nIMPORTANT:\n- Product rows with no quantity may be left empty — they are not taken into account.\n- Crossed-out entries and notes in the margins are not taken into account.\n- «Пландаги вакт» and «ППП #» do not have to be filled in.\n\nNOT JUDGED: whether the cell code and the leader's name belong to this leader; which day the date is; whether «Факт» equals the difference between the start and finish times; the neatness of the handwriting.",
    10: "The proof for this task is a screenshot (one or several) of the order list in SAP, with the status column — headed «Статус» or «СистСтатус»; both are the same column. Even though the task note says «Brigadir tasdig'i», the proof is that SAP screenshot.\n\nPASSES if all of the following are visible:\n- Every order row in the list has the code ДЕБЛ in its status column («Статус» or «СистСтатус»). SAP writes several codes together in one row (for example «ЧПДТ ДЕБЛ», «ДЕБЛ ПКПП») — if ДЕБЛ is among them, the row meets the requirement. The Latin «DEBL» or «REL» is the same code.\n- If the list does not fit on one screen, the remaining rows are shown in the following screenshot or screenshots.\n\nFAILS if:\n- At least one order row has no ДЕБЛ in its status (for example only «ТЗКР» or «СОЗД»).\n- The status column is not visible or cannot be read.\n- It is CLEARLY visible that the list continues below (the last row is cut in half, or the scrollbar has not reached the end), but the continuation is not in another screenshot.\n- The screenshot is not from SAP.\n\nIMPORTANT: the header row and the totals row are not order rows. If you were told that there are more photos and only the first ones were sent, the rest of the list may be in the photos that were not sent — do not call it not done for that reason alone.\n\nNOT JUDGED: the computer's clock and date (they are checked separately); the names and quantities of the orders.",
    11: "The proof for this task is a screenshot of the cell's staff list (Excel, Google Sheets or another spreadsheet): whether each worker is coming or not is marked by colour. A photo of a paper list, or a photo of a screen taken with a phone, is not accepted.\n\nPASSES if all of the following are visible:\n- A date is written on the list.\n- The cell code is written on the list (a 4-digit number, for example 4411).\n- The list has workers' names, and next to EVERY name there is a coloured mark in the next column: GREEN — the worker is coming, RED — the worker is not coming. The mark may be the cell's fill colour, a coloured dot or coloured text.\n\nFAILS if:\n- The image is not a screenshot: a paper list, or a photo of a screen taken with a phone.\n- The date or the cell code is missing.\n- At least one worker's name has neither a green nor a red mark next to it (the cell is empty or another colour).\n- There are no workers' names on the list, or the colours cannot be told apart.\n\nIMPORTANT: all green or all red is possible — that is not a fault. The layout of the table (column order, font) may be anything.\n\nNOT JUDGED: the computer or phone clock (not needed for this task); which day the date is (only read the date); whether the coming and not-coming marks are correct; the number of workers.",
    12: "The proof for this task is a photo of the leader teaching the zam lider (the worker being prepared to do the leader's work when the leader is away). Another person takes the photo on the leader's phone, so both of them are in frame. This is a photo of people — not a photo of a document, a screen or a checklist (even though the task note says «chek-list»).\n\nPASSES if all of the following are visible:\n- There are at least two people close to each other in the photo.\n- They are busy with one piece of work together — at a workstation, beside equipment, or over a screen or a document: one is showing or explaining (pointing with the hand, demonstrating a movement), the other is watching or doing that work.\n\nFAILS if:\n- There is only one person in the photo, or nobody at all (for example only a document, a screen or a checklist has been photographed).\n- The people are far apart, each busy with their own work.\n- The people are simply looking at the camera and doing nothing together.\n\nNOT JUDGED: which person is the leader and which the zam lider — you cannot recognise people by face, so do not require it; the type of work; clothing and uniform.",
}

#: task_id -> shift -> the English text, where the rule differs by shift.
CRITERIA_BY_SHIFT = {
    13: {
        1: "The proof for this task is a screenshot — one or several — of the leader's filled-in shift report table on the computer. The WHOLE table must be visible across the screenshots.\n\nThe table has one row per product. Among its columns is «Объём» (the volume made), and immediately after it «План мин» and «Факт мин».\n\nPASSES if all of the following hold:\n- TWO dates are readable in the screenshots: the date written on the table, and the date shown by the computer's own clock (the taskbar at the edge of the screen).\n- Those two dates are the SAME day.\n- EVERY row that has a number in «Объём» also has «План мин» and «Факт мин» filled in.\n- The whole table is shown: it begins at its first row and its last row is visible. If the table does not fit on one screen, the remaining rows are in the following screenshot or screenshots.\n\nFAILS if:\n- One of the two dates is missing or cannot be read.\n- The date on the table and the date on the computer's clock are different days.\n- At least one row with a number in «Объём» has «План мин» or «Факт мин» empty.\n- It is CLEARLY visible that the table continues below (the last row is cut in half, or the scrollbar has not reached the end) and the continuation is not in another screenshot.\n- Only part of the table was sent: the top of it, or a few rows out of the middle.\n- The image is not a screenshot of that table: a photograph of a screen, a paper sheet, or another document.\n\nIMPORTANT:\n- Rows with «Объём» empty are not taken into account at all — «План мин» and «Факт мин» may be empty on them.\n- If you were told that there are more photos and only the first ones were sent, the rest of the table may be in the photos that were not sent — do not call it not done for that reason alone.\n\nNOT JUDGED: which calendar day the two dates are — only their relation to each other; the hour on the clock; whether the figures in «План мин» and «Факт мин» are correct; the comment column; the number of rows and the product names.",
        2: "The proof for this task is a screenshot — one or several — of the leader's filled-in shift report table on the computer. The WHOLE table must be visible across the screenshots.\n\nThe table has one row per product. Among its columns is «Объём» (the volume made), and immediately after it «План мин» and «Факт мин».\n\nPASSES if all of the following hold:\n- TWO dates are readable in the screenshots: the date written on the table, and the date shown by the computer's own clock (the taskbar at the edge of the screen).\n- The clock's date is exactly ONE DAY LATER than the date on the table. The night shift fills this report in the morning, after midnight, so the table carries the day the shift began and the clock carries the next day (for example: table 18.09, clock 19.09).\n- EVERY row that has a number in «Объём» also has «План мин» and «Факт мин» filled in.\n- The whole table is shown: it begins at its first row and its last row is visible. If the table does not fit on one screen, the remaining rows are in the following screenshot or screenshots.\n\nFAILS if:\n- One of the two dates is missing or cannot be read.\n- The clock's date is not exactly one day after the date on the table — the same day, two days later, or earlier than the table's date all fail.\n- At least one row with a number in «Объём» has «План мин» or «Факт мин» empty.\n- It is CLEARLY visible that the table continues below (the last row is cut in half, or the scrollbar has not reached the end) and the continuation is not in another screenshot.\n- Only part of the table was sent: the top of it, or a few rows out of the middle.\n- The image is not a screenshot of that table: a photograph of a screen, a paper sheet, or another document.\n\nIMPORTANT:\n- Rows with «Объём» empty are not taken into account at all — «План мин» and «Факт мин» may be empty on them.\n- If you were told that there are more photos and only the first ones were sent, the rest of the table may be in the photos that were not sent — do not call it not done for that reason alone.\n\nNOT JUDGED: which calendar day the two dates are — only their relation to each other; the hour on the clock; whether the figures in «План мин» and «Факт мин» are correct; the comment column; the number of rows and the product names.",
    },
}

#: task_id -> the Uzbek instruction the leader reads.
DESCRIPTIONS = {
    2: "Liderning xodimlari bilan kaskad uchrashuvi o'tkazayotganligini ko'rsatuvchi rasm. Ushbu rasmda barcha xodimlar lider oldida aylana bo'lib yig'ilgan bo'lishi lozim va hech bir xodim biron ish bilan mashg'ul bo'lmasligi kerak.",
    3: "Kun davomida ishlab chiqarish jarayonidan 3 xil rasm talab qilinadi. 3 ta rasm 3 xil jarayondan bo'lishi zarur, hamda rasmlar orasidagi vaqt 5 daqiqadan kam bo'lmasligi kerak. Bu rasmlarda ishlab chiqarish jarayoni SOP standarti talablariga javob berishi tekshiriladi. Unga ko'ra:\n- Ish joyi toza bo'lishi, stolda va yerda ish jarayoniga aloqador bo'lmagan ortiqcha buyumlar bo'lmasligi lozim.\n- Xodimlarning yenglari shimarilmagan bo'lishi, shimarilgan bo'lsa ham qo'lni yopib turuvchi himoya kiyimi bo'lishi lozim.",
    4: "Tasker ilovasida obxod ro'yxati ekranini oching va o'sha ekranning skrinshotini yuboring.",
    5: "Xom ashyo qabul qilinayotganligini isbotlovchi rasm. Bu rasmda xodim yetib kelgan xom ashyoni AKT qog'oziga qarab tekshirib olayotgani ko'rinishi lozim.",
    6: 'Yacheykaga mahsulot yetkazib berish jarayonining rasmi talab qilinadi. Bu rasm 2 xil holatda qabul qilinadi:\n1. Xodim yetib kelgan mahsulotlarni yaroqlilik muddatiga qarab tekshirayotgani.\n2. Xodim yetib kelgan vagonetka yonida turgani.',
    7: "Yacheykaning nazorat stendi to'ldirilganligini ko'rsatuvchi rasm. Bu rasmda quyidagilar ko'rinishi kerak:\n- Yacheyka kodi\n- Liderning ism-familiyasi\n- Sana\n- «Махсулот сони» yozilgan har bir mahsulotda boshlangan vaqt, tugatilgan vaqt va «Факт» to'ldirilgan bo'lishi",
    10: "SAP tizimidagi rejalar yopilganligini ko'rsatuvchi skrinshot talab qilinadi. Bu skrinshotda:\n- Ro'yxatdagi har bir qator statusida «ДЕБЛ» bo'lishi\n- Monoblokdagi sana va vaqt ko'rinib turishi\ntalab qilinadi.",
    11: "Yacheyka xodimlarining kelishi yoki kelmasligini ko'rsatib turuvchi ish jadvali skrinshoti talab qilinadi (Excel yoki Google Sheetsda). Bu jadval quyidagi formatda bo'lishi kerak:\n- Jadvalning yuqori qismida yacheyka raqami va sana\n- Har bir xodimning to'liq ism-familiyasi 1-ustunda\n- Xodimning kelishi yoki kelmasligini ko'rsatib turuvchi yashil yoki qizil status xodimning ism-familiyasi qarshisida, 2-ustunda bo'lishi\nJadval bugungi yoki ertangi kun uchun to'ldirilgan bo'lishi lozim.",
    12: "Liderning o'z zam lideriga ish o'rgatish jarayonidagi rasm. Bu rasmda 2 kishi — lider va zam lider — ko'rinib turishi hamda liderning zam liderga nimadir o'rgatayotgani bilinib turishi lozim.",
}

#: task_id -> shift -> the Uzbek instruction, where the rule differs by shift.
DESCRIPTIONS_BY_SHIFT = {
    13: {
        1: "To'ldirilgan smena hisoboti jadvalining skrinshotini oling. Jadval to'liq ko'rinishi shart: bitta ekranga sig'masa, qolgan qatorlarni keyingi skrinshotlarda yuboring - birinchi qatordan oxirgi qatorgacha hammasi ko'rinsin.\n\nSkrinshotda:\n- Jadvaldagi sana\n- Monoblok sanasi va vaqti\n- Mahsulotlar ro'yxati\nko'rinishi lozim. Bunda jadvaldagi sana va monoblokdagi sana bir xil kun bo'lishi kerak. Hamda «Объём» ustuni to'ldirilgan har bir qatorda undan keyingi ikkita ustun - «План мин» va «Факт мин» - ham to'ldirilgan bo'lishi lozim.",
        2: "To'ldirilgan smena hisoboti jadvalining skrinshotini oling. Jadval to'liq ko'rinishi shart: bitta ekranga sig'masa, qolgan qatorlarni keyingi skrinshotlarda yuboring - birinchi qatordan oxirgi qatorgacha hammasi ko'rinsin.\n\nSkrinshotda:\n- Jadvaldagi sana\n- Monoblok sanasi va vaqti\n- Mahsulotlar ro'yxati\nko'rinishi lozim. Bunda jadvalda smena boshlangan kun sanasi turishi, monoblokda esa undan keyingi kun sanasi ko'rinishi kerak (masalan: jadvalda 18.09, monoblokda 19.09) - chunki 2-smena hisobotni ertalab, yarim tundan keyin to'ldiradi. Hamda «Объём» ustuni to'ldirilgan har bir qatorda undan keyingi ikkita ustun - «План мин» va «Факт мин» - ham to'ldirilgan bo'lishi lozim.",
    },
}


def units(db: Session, shift: int) -> list[Manager]:
    """The non-archived units of one shift, in id order."""
    return (db.query(Manager)
            .filter(Manager.shift == shift, Manager.archived.is_(False))
            .order_by(Manager.id).all())


def set_global_min_media(db: Session) -> bool:
    """Raise the CATALOG default for task 3 to three photos. True when it moved.

    `LeaderTaskDef.default_min_media` has no setter and no endpoint — it is
    written at seed time and by `create_task` and nowhere else — so this is the
    one place the ORM attribute is touched directly. It is what a unit with no
    row of its own resolves to, and what every future side-field write
    materialises a new supervisor row with (`def_min_media`), so a unit created
    after this pass starts at three rather than at one.
    """
    td = db.query(LeaderTaskDef).filter_by(id=MIN_MEDIA_TASK).first()
    if td is None or int(td.default_min_media or 1) == MIN_MEDIA:
        return False
    td.default_min_media = MIN_MEDIA
    db.commit()
    return True


#: What a leader is told while the new instructions are ON THE PAGE but the new
#: rules are not yet in force. The 19 Sep pass rewrites this same column without
#: it, so the notice removes itself — there is nothing to clean up.
PREVIEW_NOTE = (
    "\u26a0\ufe0f YANGI TALAB \u2014 19-sentabrdan kuchga kiradi. Bugun va "
    "bugun kechasi vazifa eski qoida bo'yicha baholanadi; quyidagini oldindan "
    "o'qib, tayyorlanib qo'ying.\n\n"
)


def preview(db: Session, shift: int) -> dict:
    """Publish the new INSTRUCTIONS early, so leaders can prepare, while every
    rule that scores them stays exactly as it is until 19 September.

    Only `description` is written. That column is the one thing here that cannot
    move a verdict — `leader_ai._prompt` does not know it exists — so unlike the
    criteria, the date modes, the tolerance and the photo count, it is safe to
    write in the middle of a running shift, which is when a leader actually
    needs to read it.

    Writing the instruction WITHOUT its rule is a trap on its own, though: a
    leader who reads «the list may be dated tomorrow» (task 11) or «the
    monoblok's date is one day after the table's» (task 13) and files that way
    tonight would be judged by tonight's rules and lose the point. So every text
    carries `PREVIEW_NOTE` saying when it starts, and the real pass overwrites
    it.
    """
    out = {"shift": shift, "units": 0, "texts": 0, "names": []}
    for m in units(db, shift):
        for tid in TASKS:
            leader_tasks.set_description(db, task_id=tid,
                                         description=PREVIEW_NOTE + DESCRIPTIONS[tid],
                                         manager_id=m.id)
            out["texts"] += 1
        for tid in SHIFT_TASKS:
            leader_tasks.set_description(
                db, task_id=tid,
                description=PREVIEW_NOTE + DESCRIPTIONS_BY_SHIFT[tid][shift],
                manager_id=m.id)
            out["texts"] += 1
        out["units"] += 1
        out["names"].append(m.name)
    return out


def keep_leader_texts_coherent(db: Session, shift: int) -> list[str]:
    """Stop a leader being TOLD one thing and GRADED on another.

    A leader row that carries its own `criteria` and no `description` reads, on
    «Vazifalar» and on the camera sheet, whatever `_resolve_description` falls
    back to — and that fallback is the RESOLVED criteria, i.e. their own text.
    The moment this pass puts a description on the unit, the fallback stops
    applying: the leader is shown the unit's new instruction while the grader
    still judges them by their own older criteria, which is the one failure a
    checklist must never have.

    So their description is materialised from their OWN criteria first, which
    changes nothing they see today and keeps the two texts describing one task.
    Their criteria is left exactly as it is — it is a deliberate admin edit, and
    overwriting it is not this pass's decision to make.
    """
    from app.models import LeaderTaskLeaderSetting, RoleProfile
    ids = {m.id for m in units(db, shift)}
    if not ids:
        return []
    fixed = []
    rows = (db.query(LeaderTaskLeaderSetting, RoleProfile)
            .join(RoleProfile, RoleProfile.id == LeaderTaskLeaderSetting.leader_id)
            .filter(RoleProfile.manager_id.in_(ids),
                    LeaderTaskLeaderSetting.task_id.in_(
                        tuple(TASKS) + tuple(SHIFT_TASKS)))
            .all())
    for row, prof in rows:
        own = (row.criteria or "").strip()
        if not own or (row.description or "").strip():
            continue
        leader_tasks.set_description(db, task_id=row.task_id, description=own,
                                     leader_id=row.leader_id)
        fixed.append(f"{prof.name} · task {row.task_id}")
    return sorted(fixed)


def apply(db: Session, shift: int) -> dict:
    """Write every agreed rule onto every non-archived unit of ONE shift.

    Called from a scheduled pass that fires while that shift is NOT running, so
    no leader is ever re-judged in the middle of their own checklist.

    EVERY WRITE IS IDEMPOTENT, and that is what the caller's flag leans on: the
    chain setters each commit for themselves, so this pass cannot be one
    transaction, and a run that dies half-way is simply re-run whole by the next
    boot. The flag is written by the caller LAST, only once everything below has
    landed.

    `rejudge=False` on both date-rule writes: that re-derive is per TASK and
    walks the whole stored corpus, so leaving it on would re-scan every verdict
    once per unit — 21 times over. The caller runs `leader_ai.sync_date_flags`
    exactly once when both passes are done.

    Returns a summary for the action-log row and the DM. Raises nothing of its
    own; the caller wraps it.
    """
    out = {"shift": shift, "units": 0, "texts": 0, "date_plus": 0,
           "modes": 0, "min_media": [], "names": [],
           # Done BEFORE any unit description exists, or the fallback these
           # leaders read has already been taken away from them.
           "kept_coherent": keep_leader_texts_coherent(db, shift)}

    for m in units(db, shift):
        # min_media FIRST: `apply_supervisor_cell` is the only door to that
        # column and it does not commit, so it rides the next setter's commit.
        # It also overwrites `enabled` and `weight`, which is why both are read
        # back off the unit's own resolution and written again unchanged.
        eff = leader_tasks.effective_settings(db, m.id, None) or {}
        cur = eff.get(MIN_MEDIA_TASK) or {}
        if int(cur.get("min_media") or 1) != MIN_MEDIA:
            leader_tasks.apply_supervisor_cell(
                db, m.id, MIN_MEDIA_TASK,
                bool(cur.get("enabled", True)), MIN_MEDIA,
                int(cur.get("weight") or 0), None)
            out["min_media"].append(m.name)

        # The texts. Neither column can move a verdict already written:
        # `criteria` is read only when a proof is REVIEWED, and `_prompt` does
        # not know `description` exists at all.
        for tid in TASKS:
            leader_tasks.set_criteria(db, task_id=tid, criteria=CRITERIA[tid],
                                      manager_id=m.id)
            leader_tasks.set_description(db, task_id=tid,
                                         description=DESCRIPTIONS[tid],
                                         manager_id=m.id)
            out["texts"] += 1
        for tid in SHIFT_TASKS:
            leader_tasks.set_criteria(db, task_id=tid,
                                      criteria=CRITERIA_BY_SHIFT[tid][shift],
                                      manager_id=m.id)
            leader_tasks.set_description(db, task_id=tid,
                                         description=DESCRIPTIONS_BY_SHIFT[tid][shift],
                                         manager_id=m.id)
            out["texts"] += 1

        leader_tasks.set_date_plus(db, task_id=DATE_PLUS_TASK, date_plus=DATE_PLUS,
                                   manager_id=m.id, rejudge=False)
        # One after the other, never in parallel: all three land on the SAME
        # materialised row and would race `uq_ltask_setting` (the 2026-08-19
        # camera-pilot incident).
        for tid, mode in sorted(DATE_MODES.items()):
            leader_tasks.set_date_check(db, task_id=tid, date_check=mode["date_check"],
                                        manager_id=m.id, rejudge=False)
            leader_tasks.set_day_check(db, task_id=tid, day_check=mode["day_check"],
                                       manager_id=m.id, rejudge=False)
            leader_tasks.set_time_check(db, task_id=tid, time_check=mode["time_check"],
                                        manager_id=m.id, rejudge=False)
        out["date_plus"] += 1
        out["modes"] += 1
        out["units"] += 1
        out["names"].append(m.name)

    db.commit()          # carry the last unit's min_media row, if any
    out["global_min_media"] = set_global_min_media(db)
    return out


def apply_global(db: Session) -> dict:
    """Write the nine SHIFT-INVARIANT texts at the GLOBAL level, as a baseline.

    The operator's call, 18 Sep. The per-unit writes stay exactly as they are and
    this changes nothing for any unit alive today: the chain resolves NARROWEST
    FIRST (leader, then supervisor, then global), so a unit carrying its own text
    — which after the two passes is all 21 of them — goes on reading its own, and
    an admin who edits one later keeps that edit. The global value answers only
    for a unit that has none.

    What it is FOR is the unit that does not exist yet. `default_min_media` was
    raised to 3 platform-wide, so a unit created after this would otherwise
    inherit «three photos» from the catalog and the OLD task-3 criteria
    explaining one — a contradiction nobody would have written on purpose.

    Task 13 is NOT written here and cannot be: its two texts differ by shift and
    the global level has no shift to pick between them. A future unit inherits
    the old task-13 text until somebody gives it one, which is the honest floor.

    Must run AFTER both per-unit passes — see the caller. Written globally BEFORE
    them, a unit not yet processed would resolve to the new text in the middle of
    its own shift, which is the one thing this whole feature is arranged to
    prevent.
    """
    out = {"tasks": []}
    for tid in TASKS:
        leader_tasks.set_criteria(db, task_id=tid, criteria=CRITERIA[tid])
        leader_tasks.set_description(db, task_id=tid, description=DESCRIPTIONS[tid])
        out["tasks"].append(tid)
    return out


def leader_overrides_left(db: Session, shift: int) -> list[str]:
    """The per-LEADER rows this pass deliberately does not reach, named.

    A leader row shadows the unit row it sits under, so a leader who carries
    their own criteria, window or date rule on tasks 3, 11 or 13 keeps it. Those
    are deliberate admin edits and overwriting them from a migration would undo
    a decision somebody made on purpose — but a rule that silently does not
    apply to some leaders is exactly the kind of thing nobody finds out about,
    so the pass names them in its own summary.
    """
    from app.models import LeaderTaskLeaderSetting, RoleProfile
    ids = {m.id for m in units(db, shift)}
    if not ids:
        return []
    out = []
    rows = (db.query(LeaderTaskLeaderSetting, RoleProfile)
            .join(RoleProfile, RoleProfile.id == LeaderTaskLeaderSetting.leader_id)
            .filter(RoleProfile.manager_id.in_(ids),
                    LeaderTaskLeaderSetting.task_id.in_(
                        tuple(TASKS) + tuple(SHIFT_TASKS)))
            .all())
    for row, prof in rows:
        # ONLY the fields this pass writes for THAT task. A leader's own photo
        # window or deadline shadows nothing here, so counting it would bury the
        # one row that matters — the shift-2 pass named twenty leaders on the
        # production copy and every one of them carried nothing but a window.
        fields = ["criteria", "description"]
        if row.task_id in DATE_MODES:
            fields += ["date_check", "day_check", "time_check"]
        if row.task_id == DATE_PLUS_TASK:
            fields.append("date_plus")
        if row.task_id == MIN_MEDIA_TASK:
            fields.append("min_media")
        what = [k for k in fields
                if getattr(row, k, None) is not None
                and str(getattr(row, k)).strip() != ""]
        if what:
            out.append(f"{prof.name} · task {row.task_id}: " + ", ".join(what))
    return sorted(out)
