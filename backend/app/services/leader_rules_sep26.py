"""The leader-checklist AI criteria revised from the 19–20 September review.

The operator went through the 50 proofs the AI flagged on 19–20 Sep 2026 that an
admin then approved, and gave a reason for each (22—25 Sep). Where the reason
was a rule, it is written here; where it was a one-time excuse, the rule stands
and the proof still fails. This module holds the revised `criteria` — the
English text Gemini is judged against — for tasks 3, 6, 7, 11 and 13, a
LEADER-level criteria for the cells that only ever do one process, and the one
pass that writes them.

CRITERIA ONLY — the operator's ruling (25 Sep): «Do not edit description for
the leaders». The Uzbek instruction a leader reads stays exactly as the 19 Sep
pass wrote it. `leader_ai._prompt` never sees `description`, and
`_resolve_description` walks leader → unit → global for the first non-blank
description, so a leader row that gains only criteria still reads its unit's
instruction — never the English grader text.

COMPARE-AND-SET, level by level: a stored criteria is replaced only while it is
blank, still the 19 Sep text (`leader_rules_sep19`), or already this text. A
unit or leader an admin has edited since 19 Sep keeps that edit and is NAMED in
the pass's summary. No date rule, window, photo count or verdict moves here:
`set_criteria` never re-judges, so the new text reaches only proofs reviewed
after it lands.

Every text below was blind-tested against the 19–20 Sep photos before it
shipped (the approved cases, plus rejected and passed controls).

TEMPORARY one-shot, like `leader_rules_sep19` — and it reads that module's
texts, so delete this one FIRST (with `startup.register_leader_rules_sep26` and
its call in both entrypoints) once all four flags are set — the fourth,
`leader_rules_2026_09_26_t3_sleeve_v1`, is the 26 Sep sleeve amendment below.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import (LeaderTaskDef, LeaderTaskLeaderSetting, LeaderTaskSetting,
                        RoleProfile)
from app.services import leader_tasks

#: Unit-level texts, identical on both shifts. 13 is separate — its date rule
#: differs by shift (see CRITERIA_BY_SHIFT).
TASKS = (3, 6, 7, 11)
SHIFT_TASKS = (13,)

#: Task 3 for a cell that only ever performs ONE process (crêpes, cream-coating,
#: packing, sponge slicing, boxing): all three photos may show that process.
#: The grader cannot know which cells these are, so it is a LEADER-level text on
#: exactly the leaders the operator named («for now we know these 5 only»,
#: 25 Sep). Matched by profile id AND name — ids are this database's, and a
#: renamed or re-used profile is not the person the operator named.
ONE_PROCESS_TASK = 3
ONE_PROCESS_LEADERS = (
    (292, "Akramov Dilshodbek"),     # crêpes · Kamolova Nargiza · shift 2
    (307, "Omonov Bekzod"),          # cream-coating · Akbarov Tursunali · shift 2
    (282, "Ro'ziyeva Munisxon"),     # packing · Ibragimova Sayyora · shift 2
    (228, "Saidova Xosiyatxon"),     # sponge slicing · Xakimov Ruslan · shift 1
    (220, "Tursunboyev Abduqodir"),  # boxing · Abdukarimov Sanjar · shift 1
)

#: task_id -> the English text Gemini is given after «TALAB:».
CRITERIA = {
    3: "The proof for this task is a set of photos taken during the day in 3 different processes: the workplace is clean and any worker visible is in standard work clothing.\n\nPASSES if all of the following hold:\n- There are at least 3 photos and they show 3 different processes: a different work step, a different workstation or different equipment (for example kneading, shaping, packing), or the same work step on a visibly different product. The process may be in the leader's own cell or in a neighbouring one. Photos of one process from different angles count as one process.\n- In every photo the workplace is clean: nothing unrelated to the work on the table (phone, personal belongings, tea or water cup, bottle, towel, rag, loose paper), and no waste on the table or the floor. Things the process itself needs — flour, dough, product, trays, tools — do not count as clutter.\n- Every worker visible in a photo is in work clothing (uniform).\n- No visible worker has bare forearms: sleeves are down, or, if rolled up, the forearm is fully covered by an inner sleeve or an arm cover.\n\nFAILS if:\n- There are fewer than 3 photos, or the photos do not show 3 different processes.\n- In at least one photo there is clutter or waste on the table, or waste on the floor.\n- At least one visible worker is without work clothing or has bare forearms.\n\nIMPORTANT:\n- Different products at the same work step are different processes. Products are different when they visibly differ: a different shape, a different glaze or cream colour, a different decoration or design. For example, decorating three different cakes on one line is three processes, and icing gingerbread of three different shapes is three processes.\n- Different stations are different processes: the same kind of work done at separate workplaces, each a different table, machine or scale standing in a different place of the workshop, with a different background. For example, weighing ingredients at three different scales in three different places is three processes.\n- The same product at the same table or line is ONE process, even if the photos are taken from different angles, at different times, show different workers or catch different hand moves of the same job. For example, chocolate half-spheres being pressed together on a warm plate in one photo, and the same chocolate balls being held and finished at the same table in another photo, are one process. It is a different work step only when the product visibly moves on to its next stage: for example the dough gets shaped, or the product gets a filling, a glaze or a decoration, or gets packed. Several scales or workers side by side at one table or line, working on the same product, are one station, not several.\n- A different background alone does not make a different station: the same table photographed from its other end or side shows a different background. When two photos show the same product in the same state on one table — for example the same big heap of dough being divided on the same scales by the same group of workers — they are one station and one process.\n- A cleaning cloth, rag or towel lying on the work table is clutter, even if it is used to wipe the table or the scale. It is not a tool of the process. A cloth is soft, matte fabric with a woven or towel-like surface. It counts even when only part of it is in the photo — for example cut off by the bottom edge of the photo or partly hidden under the date and time stamp — so look along the edges of every photo too. A cloth hanging down over the side of the table, below the table top, is not on the table and is not judged.\n- Supplies for the work and their packaging are not clutter: piping bags and plastic film, also used or crumpled ones lying by the worker; gloves; and a bag, box, crate or container that holds product, ingredients or supplies, also when it is open or crumpled. Thin, shiny, partly see-through plastic is not a cloth. A recipe, technology card or work sheet used for this work is not loose paper either. Loose paper means scrap paper, or papers that have nothing to do with the work.\n- A bare forearm is bare skin on the part of the arm between the wrist and the elbow, because the sleeve is rolled up, pushed up or too short and no inner sleeve or arm cover covers that skin. Bare hands, gloved hands and a sleeve that reaches down to the wrist are NOT bare forearms. A hand and wrist seen without their sleeve, because the sleeve is outside the frame, are not a bare forearm either.\n- A sleeve pushed or rolled up toward the elbow, with the forearm bare below it, is a bare forearm, also when the hand wears a glove: a glove covers only the hand, not the skin between the glove and the sleeve. A sleeve that ends at the wrist or a little above it, leaving only a short strip of skin above the hand, is fine.\n- Check the arms of every worker in every photo, also workers in the background and at the edges of the photo.\n- A photo may show no worker at all — that is not a fault: such a photo is judged only on the process and the cleanliness of the workplace.\n- For a worker only partly in frame, judge only the visible part.\n- If there are more than 3 photos, the cleanliness and clothing rules apply to all of them, while 3 different processes only need to be among them.\n\nNOT JUDGED: the time between photos; who the workers are; the apron, head covering and gloves; which cell a process belongs to.",
    6: 'The proof for this task is a photo of a delivery reaching the cell: newly arrived products, or the transport that brought them (a vagonetka, a hand pallet truck or a cart). It passes if EITHER of the following is visible:\n\nFIRST CASE — a worker is with newly arrived products: standing next to or holding boxes, crates or packaged products. The worker does not have to be looking at the products — looking at the camera or elsewhere is also accepted.\n\nSECOND CASE — a worker is with a delivery transport: holding it, pushing or pulling it, or simply standing next to it. The worker may be facing the camera. Accepted transports:\n- A vagonetka (a wheeled rack trolley). The vagonetka may be loaded with products or empty — both are accepted.\n- A hand pallet truck (pallet jack, «рокла»): a low platform or two flat metal forks on small wheels, pulled by a long metal handle with a loop grip. The forks are often hidden under the load. It may be loaded (crates, buckets, boxes or bags) or empty — both are accepted.\n- A cart or trolley on wheels used to move goods. It may be loaded or empty — both are accepted.\n\nFAILS if:\n- Neither case is visible.\n- A delivery transport (vagonetka, pallet truck or cart) is in the photo but no worker is beside it — the worker must be next to the transport, not somewhere else in the frame.\n- There is no person in the photo.\n\nNOT JUDGED: whether the worker is really checking the expiry date — that cannot be told from a photo; the date on the label; the type of product; who the worker is; where the worker is looking.',
    7: 'The proof for this task is a photo of the cell\'s printed control form (on paper). Even though the task name contains «SAP», the proof is that paper form. If the form is long, several photos may show it in full together.\n\nAny printed control-form template is accepted, as long as it has what this task asks for: a header with the cell code, the leader\'s name and a date, and a table where each product row has the product\'s name, its quantity, a start time, a finish time and the actual time («Факт»). Columns and writing beyond these are ignored — for example «Одам сони», «Пландаги вакт», «Смена», «ПРИМЕЧАНИЯ» or extra notes. The two templates in use are described below to help you recognise them; a printed template that looks different but has the same content is accepted too.\n\nThe standard form looks like this:\n- Printed fields at the top: «ППП #», «Ячейка #», «Лидер», and a date box in the top-right corner.\n- Table columns: «Махсулот номи», «Махсулот сони (шт,кг)», «Бошланган вакт», «Тугатилган вакт», «Пландаги вакт», «Факт».\n- The product names in the first column are pre-printed; extra products may be written by hand below them.\n\nThe KAIZEN sheet looks like this:\n- It is recognised by its printed title at the top: «Контроль работы ячейки по системе» followed by «"KAIZEN"» (handwriting may partly cover the title).\n- A printed «Сана» (date) box sits beside the title. The top-right box is empty for handwriting, with «ПРИМЕЧАНИЯ» under it as the last column.\n- Table columns: «Махсулот Номи», «Сони», «Бошланди», «Тугади», «ФАКТ», «Пландаги ВАКТ», «ПРИМЕЧАНИЯ». All product names are handwritten.\n- It has no printed «Лидер» field and usually no «Ячейка #» field. The cell code and the leader\'s name are handwritten somewhere in the header: beside or under «Сана», in the top-right box, or into the title line itself.\n- A second KAIZEN layout has the same title with «Смена», «САНА» and «ячейка» fields, numbered rows, and the columns «№», «Махсулот Номи», «Одам сони», «Бошланди», «Тугади», «Бажарилган вакт», «Сони/Микдори». On it the quantity is «Сони/Микдори» («Одам сони» is the number of people, not a quantity), and «Бажарилган вакт» counts as «Факт».\n\nPASSES if all of the following are visible:\n- The document in the photo is a printed control form (printed column headings and table lines) with the columns this task asks for: product name, quantity, start time, finish time and the actual time («Факт», or «Бажарилган вакт» on the KAIZEN sheet).\n- All three items are filled in at the top, in the header above the table: the cell code (a 4-digit number, printed or handwritten), the leader\'s name, and a date.\n- The 4-digit cell code counts wherever it is written in the header: next to «Ячейка #», in the «ППП #» field, inside the title line, or in a free box. The four digits may be split by a dot or a space, or follow a word such as the cell\'s name: «Коржи 72.13» is the cell code 7213. On the KAIZEN sheet the code is often written in small, cramped digits into a gap of the printed title line (after «ячейки», after «по» or before «системе»), touching the printed words. Another gap may hold a single letter, which is not the code. Look at every gap of the title line: a number written there counts as the cell code even if one of its four digits is hard to read. The leader\'s name and the date may also be anywhere in the header.\n- At least one product has a quantity written.\n- EVERY product that has a quantity («Махсулот сони»; «Сони» or «Сони/Микдори» on the KAIZEN sheet) written also has a start time, a finish time and «Факт». The only exceptions are a struck-through row and a leftover-stock row (see IMPORTANT).\n- If a product was made in several processes, the extra times are written on the unnamed lines below it — those lines belong to that product, and every time range on them must also be complete (start, finish and «Факт»).\n\nFAILS if:\n- The photo shows a hand-drawn table, a screen, or a document without the columns this task asks for (for example a printed list with no start and finish times). A sheet, plastic film or board with only handwriting on it (no printed labels, no printed column headings, no table lines) is not the control form, even if it lists a cell code, a name, a date, products and times.\n- At least one of the three items at the top is missing.\n- No product on the form has a quantity: the quantity column is empty in every row, even if times are written.\n- At least one product with a quantity (or a time line below it) is missing its start time, finish time or «Факт», and that row is neither struck through nor marked as leftover stock. A product with a quantity, no times and no note fails.\n- The form was shot from too far away or at too much of an angle to read, or part of it is cut off.\n\nIMPORTANT:\n- Product rows with no quantity may be left empty — they are not taken into account. But a form with no quantity in any row fails.\n- Crossed-out entries and notes in the margins are not taken into account.\n- A STRUCK-THROUGH row is ignored completely. It needs no times and no «Факт», even if a quantity or a start time is written in it. A row is struck through when one pen line is drawn through its product name and continues across its quantity (often across its times too). The line may be thin and run low, along the bottom of the letters, so it can look like an underline. It is still a strike-through when it carries on from the name into the quantity cell. Before failing a row that looks incomplete, look closely at its quantity: if a pen line runs through its digits and no new number is written beside them, the row is struck through. The printed lines of the table are not strike lines. A short underline under the name alone, or one crossed-out number with a new number written beside it, is only a correction: that row still counts.\n- A product row whose note says the product is in leftover stock needs no start time, no finish time and no «Факт». The note reads «астаткада бор», «остаткада бор», «остаток», «астатка» or a similar spelling of the same word (it means \'there is leftover stock\'). It is written in that product\'s row — in the «Примечания» column, or across the row\'s empty time cells, sometimes on the line just below the product name. Any other note, or no note at all, does not excuse missing times.\n- «Пландаги вакт» and «ППП #» do not have to be filled in.\n\nNOT JUDGED: whether the cell code and the leader\'s name belong to this leader; which day the date is; whether «Факт» equals the difference between the start and finish times; whether a product marked as leftover stock really is in stock; the neatness of the handwriting.',
    11: "The proof for this task is a screenshot of the cell's staff list (Excel, Google Sheets or another spreadsheet): whether each worker is coming or not is marked by colour. A photo of a paper list, or a photo of a screen taken with a phone, is not accepted.\n\nPASSES if all of the following are visible:\n- A date is written on the list.\n- The cell code is written on the list (a 4-digit number, for example 4411).\n- The list has workers' names, and next to EVERY name there is a coloured mark in the next column (in a grid with one column per day: in that one day's column, see GRID below): GREEN — the worker is coming, RED — the worker is not coming, YELLOW — the worker is in reserve («запас»). Any shade of green is green: light, bright or dark green, including a dark, dull olive green. The mark may be the cell's fill colour, a coloured dot or coloured text.\n\nFAILS if:\n- The image is not a screenshot: a paper list, or a photo of a screen taken with a phone.\n- The date or the cell code is missing.\n- The date or the cell code is shown only outside the sheet: in the file name at the top of the window, in a sheet tab name at the bottom, or in the computer clock. That does not count — both must be written in the cells of the sheet.\n- At least one worker's name has no green, red or yellow mark next to it (the cell is empty or another colour). Blue is not a valid mark. Before you fail for this, check the cell as told under HOW TO READ THE MARKS.\n- There are no workers' names on the list, or the colours cannot be told apart.\n- A grid whose day columns include neither the date on the computer clock nor the next day (see GRID).\n\nHOW TO READ THE MARKS:\n- A SELECTED cell keeps its own fill colour. A spreadsheet draws a frame around the selected cell (a thick green, white or dark border, or a dashed moving border after copying) and may lay a light grey or blue tint over a selected area. Judge the fill colour inside the frame, not the frame or the tint: a green cell with a selection frame on it is a green mark. In Excel the frame is a dark-green line with a thin white line just inside it: that thin white line belongs to the frame and does not make the cell white. Look at the middle of the framed cell.\n- A colour KEY (legend) is not a worker's mark: a few coloured cells with words that explain the colours, usually beside or above the table (for example green «келган» / «иш куни», red «дам олган» / «дам куни», yellow «запас»). Do not judge the key, even when it stands on the same row as a worker.\n- A row with no worker's name in it is not judged.\n- Each worker needs ONE mark. When the cell right after the name (in a grid: the cell in the day's column) is green, red or yellow, that worker has a mark. A second status column or a selected cell in the same row does not take it away.\n- An EMPTY cell is white, like the unused cells outside the table. Match each name to its cells by the grey row number at the far left edge of the sheet: the name in row 9 goes with the cells of row 9. Before you fail a list because a worker's cell is empty, find that worker's row number and look again at the middle of the cell in that same row (in a grid: in the day's column): if it is filled with green, red or yellow, it is a mark, not an empty cell.\n\nGRID: the list may be a grid for a week or a month, with one column per day. Then only ONE day's column is judged — the column of the day the list is made for. Find it like this:\n1. The column whose date is the date on the computer clock (bottom-right corner of the screen), or the column of the next day. It is enough that one of these two columns has a mark next to every worker.\n2. If the computer clock is visible but the grid has NO column for that date or the next day (for example a roster for another month), the list FAILS: it is not the list for this shift.\n3. If there is no clock on the screen: the column that stands out as the current day — highlighted, or the last day filled in before the empty days. If no column stands out, it is enough that at least one day's column has a mark next to every worker.\nEmpty cells in all the other columns are NOT a fault: empty columns for days that have not come yet, and empty cells on the days before a worker started. The dates in the column headings count as the date on the list. The clock is only used to find the column; do not judge whether its date is right.\n\nIMPORTANT: all green or all red is possible — that is not a fault. The layout of the table (column order, font) may be anything.\n\nNOT JUDGED: the computer or phone clock (not needed for this task, except to find the day's column in a grid); which day the date is (only read the date); whether the coming and not-coming marks are correct; the number of workers.",
}

#: task_id -> shift -> the English text, where the rule differs by shift.
CRITERIA_BY_SHIFT = {
    13: {
        1: "The proof for this task is a screenshot — one or several — of the leader's filled-in shift report table on the computer. The WHOLE table must be visible across the screenshots.\n\nThe table has one row per product. Among its columns is «Объём» (the volume made), and immediately after it «План мин» and «Факт мин».\n\nPASSES if all of the following hold:\n- TWO dates are readable in the screenshots: the date written on the table, and the date shown by the computer's own clock (the taskbar at the edge of the screen).\n- Those two dates are the SAME day.\n- EVERY row that has a number other than 0 in «Объём» also has «План мин» and «Факт мин» filled in.\n- The whole table is shown: it begins at its first row and its last row is visible. If the table does not fit on one screen, the remaining rows are in the following screenshot or screenshots. Empty rows at the bottom may be cut off — see IMPORTANT.\n\nFAILS if:\n- One of the two dates is missing or cannot be read.\n- The date on the table and the date on the computer's clock are different days.\n- At least one row with a number other than 0 in «Объём» has «План мин» or «Факт мин» empty.\n- It is CLEARLY visible that the table continues below (the last row is cut in half, or the scrollbar has not reached the end), the continuation is not in another screenshot, AND the cut may hide a row with a volume: the row cut in half, or the last fully visible row above the cut, shows a number other than 0 in «Объём».\n- Only part of the table was sent: the top of it, cut off while its rows still carry volumes, or a few rows out of the middle.\n- The image is not a screenshot of that table: a photograph of a screen, a paper sheet, or another document.\n\nIMPORTANT:\n- A row whose «Объём» is empty or 0 is an EMPTY row. Empty rows are not taken into account at all — «План мин» and «Факт мин» may be empty on them. A 0 is not a volume.\n- The table counts as shown in full when every row with a number other than 0 in «Объём» is visible, down to the last such row. The empty rows below that row may be cut off — rows that show only their row number, or a product name with 0 or nothing in «Объём» — and so may everything under them («Переналадка», «Итого», the totals) and the lower part of the «Потери доступности» block beside them.\n- A cut straight after a row with a volume still FAILS, even when the half-cut row under it shows 0: the rows below it cannot be seen.\n- If you were told that there are more photos and only the first ones were sent, the rest of the table may be in the photos that were not sent — do not call it not done for that reason alone.\n\nNOT JUDGED: which calendar day the two dates are — only their relation to each other; the hour on the clock; whether the figures in «План мин» and «Факт мин» are correct; the comment column; the number of rows and the product names.",
        2: "The proof for this task is a screenshot — one or several — of the leader's filled-in shift report table on the computer. The WHOLE table must be visible across the screenshots.\n\nThe table has one row per product. Among its columns is «Объём» (the volume made), and immediately after it «План мин» and «Факт мин».\n\nPASSES if all of the following hold:\n- TWO dates are readable in the screenshots: the date written on the table, and the date shown by the computer's own clock (the taskbar at the edge of the screen).\n- The clock's date is exactly ONE DAY LATER than the date on the table. The night shift fills this report in the morning, after midnight, so the table carries the day the shift began and the clock carries the next day (for example: table 18.09, clock 19.09).\n- EVERY row that has a number other than 0 in «Объём» also has «План мин» and «Факт мин» filled in.\n- The whole table is shown: it begins at its first row and its last row is visible. If the table does not fit on one screen, the remaining rows are in the following screenshot or screenshots. Empty rows at the bottom may be cut off — see IMPORTANT.\n\nFAILS if:\n- One of the two dates is missing or cannot be read.\n- The clock's date is not exactly one day after the date on the table — the same day, two days later, or earlier than the table's date all fail.\n- At least one row with a number other than 0 in «Объём» has «План мин» or «Факт мин» empty.\n- It is CLEARLY visible that the table continues below (the last row is cut in half, or the scrollbar has not reached the end), the continuation is not in another screenshot, AND the cut may hide a row with a volume: the row cut in half, or the last fully visible row above the cut, shows a number other than 0 in «Объём».\n- Only part of the table was sent: the top of it, cut off while its rows still carry volumes, or a few rows out of the middle.\n- The image is not a screenshot of that table: a photograph of a screen, a paper sheet, or another document.\n\nIMPORTANT:\n- A row whose «Объём» is empty or 0 is an EMPTY row. Empty rows are not taken into account at all — «План мин» and «Факт мин» may be empty on them. A 0 is not a volume.\n- The table counts as shown in full when every row with a number other than 0 in «Объём» is visible, down to the last such row. The empty rows below that row may be cut off — rows that show only their row number, or a product name with 0 or nothing in «Объём» — and so may everything under them («Переналадка», «Итого», the totals) and the lower part of the «Потери доступности» block beside them.\n- A cut straight after a row with a volume still FAILS, even when the half-cut row under it shows 0: the rows below it cannot be seen.\n- If you were told that there are more photos and only the first ones were sent, the rest of the table may be in the photos that were not sent — do not call it not done for that reason alone.\n\nNOT JUDGED: which calendar day the two dates are — only their relation to each other; the hour on the clock; whether the figures in «План мин» and «Факт мин» are correct; the comment column; the number of rows and the product names.",
    },
}

#: Task 3 on the ONE_PROCESS_LEADERS only.
ONE_PROCESS_CRITERIA = "The proof for this task is a set of photos taken during the day of the process in this leader's cell: the workplace is clean and any worker visible is in standard work clothing. This leader's cell performs only one process, so all the photos may show that same process.\n\nPASSES if all of the following hold:\n- There are at least 3 photos and they are 3 separate photos of the production work, not the same shot sent twice. They may all show the same process, the same product and the same station. The process may be in the leader's own cell or in a neighbouring one.\n- In every photo the workplace is clean: nothing unrelated to the work on the table (phone, personal belongings, tea or water cup, bottle, towel, rag, loose paper), and no waste on the table or the floor. Things the process itself needs — flour, dough, product, trays, tools — do not count as clutter.\n- Every worker visible in a photo is in work clothing (uniform).\n- No visible worker has bare forearms: sleeves are down, or, if rolled up, the forearm is fully covered by an inner sleeve or an arm cover.\n\nFAILS if:\n- There are fewer than 3 photos, or the same shot is sent twice to make up the 3.\n- In at least one photo there is clutter or waste on the table, or waste on the floor.\n- At least one visible worker is without work clothing or has bare forearms.\n\nIMPORTANT:\n- This leader's cell performs only one process (for example making pancakes (crepes), cream-coating cakes, packing into boxes, slicing sponge, or boxing). Do not fail the proof because the photos show the same process, the same product or the same station.\n- Two photos are the same shot only when they show exactly the same picture. Photos of the same work taken at different moments are separate photos, even if they look alike.\n- A cleaning cloth, rag or towel lying on the work table is clutter, even if it is used to wipe the table or the scale. It is not a tool of the process. A cloth is soft, matte fabric with a woven or towel-like surface. It counts even when only part of it is in the photo — for example cut off by the bottom edge of the photo or partly hidden under the date and time stamp — so look along the edges of every photo too. A cloth hanging down over the side of the table, below the table top, is not on the table and is not judged.\n- Supplies for the work and their packaging are not clutter: piping bags and plastic film, also used or crumpled ones lying by the worker; gloves; and a bag, box, crate or container that holds product, ingredients or supplies, also when it is open or crumpled. Thin, shiny, partly see-through plastic is not a cloth. A recipe, technology card or work sheet used for this work is not loose paper either. Loose paper means scrap paper, or papers that have nothing to do with the work.\n- A bare forearm is bare skin on the part of the arm between the wrist and the elbow, because the sleeve is rolled up, pushed up or too short and no inner sleeve or arm cover covers that skin. Bare hands, gloved hands and a sleeve that reaches down to the wrist are NOT bare forearms. A hand and wrist seen without their sleeve, because the sleeve is outside the frame, are not a bare forearm either.\n- A sleeve pushed or rolled up toward the elbow, with the forearm bare below it, is a bare forearm, also when the hand wears a glove: a glove covers only the hand, not the skin between the glove and the sleeve. A sleeve that ends at the wrist or a little above it, leaving only a short strip of skin above the hand, is fine.\n- Check the arms of every worker in every photo, also workers in the background and at the edges of the photo.\n- A photo may show no worker at all — that is not a fault: such a photo is judged only on the process and the cleanliness of the workplace.\n- For a worker only partly in frame, judge only the visible part.\n- If there are more than 3 photos, the cleanliness and clothing rules apply to all of them.\n\nNOT JUDGED: the time between photos; who the workers are; the apron, head covering and gloves; which cell a process belongs to; whether the photos show different processes."

# ── 26 Sep amendment: a little bare wrist is not a rolled-up sleeve ─────────
# The operator, 26 Sep, on a Pro verdict that failed a cuff sitting a little
# above the wrist as «sleeves rolled up»: a little open wrist and a rolled-up
# sleeve are different things. The first text already said so in one clause and
# the grader still failed the strip, so the line is now drawn on something the
# model can measure in the same photo — the worker's own hand — and an arm it
# cannot read passes. Only the two sleeve bullets of BOTH task-3 texts change;
# every other word of either text is untouched. The texts as first shipped stay
# below as `*_V1`: they are what `apply_sleeve` upgrades, and every pass here
# still accepts them as its own.
_SLEEVE_V1 = (
    "- A bare forearm is bare skin on the part of the arm between the wrist and "
    "the elbow, because the sleeve is rolled up, pushed up or too short and no "
    "inner sleeve or arm cover covers that skin. Bare hands, gloved hands and a "
    "sleeve that reaches down to the wrist are NOT bare forearms. A hand and "
    "wrist seen without their sleeve, because the sleeve is outside the frame, "
    "are not a bare forearm either.\n"
    "- A sleeve pushed or rolled up toward the elbow, with the forearm bare "
    "below it, is a bare forearm, also when the hand wears a glove: a glove "
    "covers only the hand, not the skin between the glove and the sleeve. A "
    "sleeve that ends at the wrist or a little above it, leaving only a short "
    "strip of skin above the hand, is fine."
)
_SLEEVE = (
    "- A bare forearm is bare skin reaching well up the forearm — the bare "
    "stretch above the wrist is longer than the worker's hand is wide (compare "
    "it with the worker's own hand in the photo) — because the sleeve is rolled "
    "up, pushed up or too short and no inner sleeve or arm cover covers that "
    "skin. Bare hands, gloved hands and a sleeve that reaches down to the wrist "
    "are NOT bare forearms. A hand and wrist seen without their sleeve, because "
    "the sleeve is outside the frame, are not a bare forearm either.\n"
    "- A little bare wrist is NOT a bare forearm and never fails a photo: a "
    "sleeve that ends at the wrist or a little above it, leaving a strip of "
    "skin shorter than the worker's hand is wide, is a sleeve that is down — "
    "also when the cuff has slid up because the worker is reaching forward or "
    "lifting something. Only a sleeve rolled or pushed up toward the elbow, "
    "with the forearm bare below it, fails — also when the hand wears a glove: "
    "a glove covers only the hand, not the forearm.\n"
    "- Fail a photo for a bare forearm only when you can clearly see where that "
    "sleeve ends and that the bare stretch is longer than the worker's hand is "
    "wide. If the arm is too small, blurred, turned away or partly hidden to "
    "tell, do not fail the photo for it."
)


def _sleeve(text: str) -> str:
    # A text that no longer carries the bullets would ship unamended without a
    # word; failing the import is what makes that impossible to miss.
    if text.count(_SLEEVE_V1) != 1:
        raise RuntimeError("leader_rules_sep26: task-3 sleeve bullets not found")
    return text.replace(_SLEEVE_V1, _SLEEVE)


CRITERIA_3_V1 = CRITERIA[3]
ONE_PROCESS_CRITERIA_V1 = ONE_PROCESS_CRITERIA
CRITERIA[3] = _sleeve(CRITERIA_3_V1)
ONE_PROCESS_CRITERIA = _sleeve(ONE_PROCESS_CRITERIA_V1)
#: As first shipped → as amended.
SLEEVE_UPGRADE = {CRITERIA_3_V1.strip(): CRITERIA[3],
                  ONE_PROCESS_CRITERIA_V1.strip(): ONE_PROCESS_CRITERIA}


# ── the pass ─────────────────────────────────────────────────────────────────

def _same(a, b) -> bool:
    return (a or "").strip() == (b or "").strip()


def _new(tid: int, shift: int) -> str:
    """The criteria this pass writes for one task on one shift."""
    if tid in SHIFT_TASKS:
        return CRITERIA_BY_SHIFT[tid][shift]
    return CRITERIA[tid]


def _was(tid: int, shift: int | None) -> str:
    """The criteria the 19 Sep pass wrote there — the only non-blank text this
    pass may replace. `shift` None = the global level."""
    from app.services import leader_rules_sep19 as sep19
    if tid in SHIFT_TASKS:
        return sep19.CRITERIA_BY_SHIFT[tid].get(shift, "") if shift else ""
    return sep19.CRITERIA.get(tid, "")


def _replaceable(cur, was: str, new: str) -> bool:
    return (not (cur or "").strip() or _same(cur, was) or _same(cur, new)
            or (cur or "").strip() in SLEEVE_UPGRADE)


def units(db: Session, shift: int):
    from app.services import leader_rules_sep19 as sep19
    return sep19.units(db, shift)


def apply(db: Session, shift: int) -> dict:
    """Write the revised criteria onto every non-archived unit of ONE shift, and
    the one-process criteria onto the named leaders of that shift.

    Called in the shift's own gap, so nobody is re-judged mid-checklist. Every
    write is idempotent and goes through the admin setter, so a pass that dies
    half-way is simply re-run whole by the next boot (the flag is set LAST, by
    the caller).
    """
    out = {"shift": shift, "units": 0, "texts": 0, "kept": [],
           "one_process": [], "one_process_skipped": [], "names": []}
    live = units(db, shift)
    for m in live:
        for tid in TASKS + SHIFT_TASKS:
            new = _new(tid, shift)
            row = (db.query(LeaderTaskSetting)
                   .filter_by(manager_id=m.id, task_id=tid).first())
            cur = row.criteria if row else None
            if _same(cur, new):
                continue
            if not _replaceable(cur, _was(tid, shift), new):
                out["kept"].append(f"{m.name} · {tid}-vazifa")
                continue
            leader_tasks.set_criteria(db, task_id=tid, criteria=new,
                                      manager_id=m.id)
            out["texts"] += 1
        out["units"] += 1
        out["names"].append(m.name)

    ids = {m.id for m in live}
    for pid, name in ONE_PROCESS_LEADERS:
        prof = db.query(RoleProfile).filter_by(id=pid, role="leader").first()
        if not prof or not (prof.name or "").startswith(name):
            out["one_process_skipped"].append(f"{name}: profil topilmadi")
            continue
        if prof.manager_id not in ids:
            continue            # the other shift's pass writes this one
        row = (db.query(LeaderTaskLeaderSetting)
               .filter_by(leader_id=prof.id, task_id=ONE_PROCESS_TASK).first())
        cur = row.criteria if row else None
        # A leader's own criteria is a deliberate admin edit: only a blank one,
        # or this very text, is ever written over.
        if ((cur or "").strip() and not _same(cur, ONE_PROCESS_CRITERIA)
                and not _same(cur, ONE_PROCESS_CRITERIA_V1)):
            out["one_process_skipped"].append(f"{prof.name}: o'z kriteriyasi bor")
            continue
        if not _same(cur, ONE_PROCESS_CRITERIA):
            leader_tasks.set_criteria(db, task_id=ONE_PROCESS_TASK,
                                      criteria=ONE_PROCESS_CRITERIA,
                                      leader_id=prof.id)
        out["one_process"].append(prof.name)
    return out


def apply_global(db: Session) -> dict:
    """The shift-invariant criteria at the GLOBAL level, for a unit that has none
    of its own. The caller runs it only after BOTH per-unit passes, so no unit
    still on its 19 Sep text reads the new one mid-shift. Every live unit carries
    its own criteria, so this moves no resolved rule today."""
    out = {"tasks": [], "kept": []}
    for tid in TASKS:
        td = db.query(LeaderTaskDef).filter_by(id=tid).first()
        if not td:
            continue
        new = CRITERIA[tid]
        if not _same(td.criteria, new):
            if not _replaceable(td.criteria, _was(tid, None), new):
                out["kept"].append(tid)
                continue
            leader_tasks.set_criteria(db, task_id=tid, criteria=new)
        out["tasks"].append(tid)
    return out


def apply_sleeve(db: Session) -> dict:
    """The 26 Sep amendment: every level still holding a task-3 text as first
    shipped gets the amended one — global, unit or leader, either shift, exact
    matches only. A level on its 19 Sep text belongs to a per-unit pass that has
    not run yet, which now writes the amended text itself; a level an admin
    wrote is left, and named. `set_criteria` never re-judges, so a verdict
    already written stays as it is."""
    from app.services import leader_rules_sep19 as sep19

    tid = ONE_PROCESS_TASK
    ours = set(SLEEVE_UPGRADE) | {CRITERIA[tid].strip(),
                                  ONE_PROCESS_CRITERIA.strip(),
                                  (sep19.CRITERIA.get(tid) or "").strip()}
    out = {"global": False, "units": [], "leaders": [], "kept": []}

    td = db.query(LeaderTaskDef).filter_by(id=tid).first()
    if td and (td.criteria or "").strip() in SLEEVE_UPGRADE:
        leader_tasks.set_criteria(db, task_id=tid,
                                  criteria=SLEEVE_UPGRADE[td.criteria.strip()])
        out["global"] = True

    # Values are read before any write: every setter commits, and a commit
    # expires the rows this loop would otherwise go on reading.
    live = {m.id: m.name for s in (1, 2) for m in units(db, s)}
    for mid, cur in [(r.manager_id, (r.criteria or "").strip()) for r in
                     db.query(LeaderTaskSetting).filter_by(task_id=tid).all()]:
        if cur in SLEEVE_UPGRADE:
            leader_tasks.set_criteria(db, task_id=tid,
                                      criteria=SLEEVE_UPGRADE[cur], manager_id=mid)
            out["units"].append(live.get(mid) or f"#{mid}")
        elif cur and cur not in ours and mid in live:
            out["kept"].append(f"{live[mid]} · 3-vazifa")

    rows = (db.query(LeaderTaskLeaderSetting, RoleProfile)
            .join(RoleProfile, RoleProfile.id == LeaderTaskLeaderSetting.leader_id)
            .filter(LeaderTaskLeaderSetting.task_id == tid).all())
    for lid, name, mid, cur in [(p.id, p.name, p.manager_id,
                                 (r.criteria or "").strip()) for r, p in rows]:
        if cur in SLEEVE_UPGRADE:
            leader_tasks.set_criteria(db, task_id=tid,
                                      criteria=SLEEVE_UPGRADE[cur], leader_id=lid)
            out["leaders"].append(name)
        elif cur and cur not in ours and mid in live:
            out["kept"].append(f"{name} · 3-vazifa (lider)")
    out["kept"].sort()
    return out


def leader_overrides_left(db: Session, shift: int) -> list[str]:
    """Leader rows whose OWN criteria shadows the unit text this pass writes —
    named, never overwritten. The one-process leaders' task-3 row is this
    pass's own text and is left out."""
    ids = {m.id for m in units(db, shift)}
    if not ids:
        return []
    mine = {pid for pid, _ in ONE_PROCESS_LEADERS}
    rows = (db.query(LeaderTaskLeaderSetting, RoleProfile)
            .join(RoleProfile, RoleProfile.id == LeaderTaskLeaderSetting.leader_id)
            .filter(RoleProfile.manager_id.in_(ids),
                    LeaderTaskLeaderSetting.task_id.in_(TASKS + SHIFT_TASKS))
            .all())
    out = []
    for row, prof in rows:
        if prof.id in mine and row.task_id == ONE_PROCESS_TASK:
            continue
        if (row.criteria or "").strip():
            out.append(f"{prof.name} · {row.task_id}-vazifa")
    return sorted(out)
