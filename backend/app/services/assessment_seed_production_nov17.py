"""TEMPORARY one-shot (2026-11-17) for the «Nomzodlarni baholash» bank: the
PRODUCTION department's first real questions, from the operator's SAP file
(.xlsx, sheet «Саволлар ва жавоблар») — 10 questions with their model
answers (the SAP transactions C203, COGI, MIGO, CORS and clearing a cell's
leftover stock), all THEORY (knowledge questions; the file marks no type).

The text is the file's own, word for word (extracted by script, never
retyped; runs of spaces folded to one). Two rulings from the operator, asked
the same day: question 8's answer ends with the bracketed note «(Компаниянгиз
жараёнига қараб текшириб олинг.)» — DROPPED, the rest as written; and the
file's closing footnote («Эслатма: жавоблар умумий SAP билимлари асосида
ёзилган …») is a remark to the reader, not a question, and is not imported.

`startup.seed_production_sap_questions` writes it once (flag below), skipping a
question Production already holds (whitespace and case folded; its missing
answer filled in), and in the SAME transaction ARCHIVES every SAMPLE question of
Production (`assessment.SAMPLE_SOURCE`, 12 of them: out of the draw, kept,
restorable one by one from the bank) — the operator chose «archive all 12».
**Consequence: Production then holds no PRACTICAL question, and a sitting's
Kaizen + Production block needs at least 3 of them from each department
(`min_each`), so no sitting can be opened (`pool_short`) until somebody adds
3 Production practical questions.** Delete this module, the startup function
and both calls once the flag reads «done».
"""

FLAG = "assessment_production_sap_seed_2026_11_17_v1"
DEPARTMENT = "production"
QTYPE = "theory"
SOURCE = "Import: SAP саволлар ва жавоблар (xlsx)"
ARCHIVED_BY = "Namunalar arxivlandi — haqiqiy savollar keldi (2026-11-17)"

# (question, expected answer), in the file's order.
QUESTIONS = (
    ('Маҳсулотнинг техник картасини текшириш учун қайси транзакциядан фойдаланилади?',
     'C203 транзакциясидан (Display Master Recipe — мастер-рецептни/технологик картани кўриш).'),
    ('C203 транзакцияси нима мақсадда фойдаланилади?',
     'Маҳсулотнинг техник (технологик) картасини — мастер-рецептни фақат кўриш режимида очиб, ундаги маълумотларни (Lead Time, операция фазалари, хомашё таркиби) текшириш учун.'),
    ('C203 транзакциясига қандай кирилади?',
     'SAP бош ойнасидаги буйруқлар қаторига C203 ёзилиб, Enter босилади. Очилган ойнада Plant (завод), Material (маҳсулот коди) ва Profile/Recipe гуруҳи киритилиб, Enter босилади.'),
    ('C203 да маҳсулотнинг Lead Time (ишлаб чиқариш муддати) қандай текширилади?',
     'Мастер-рецепт очилгандан сўнг Header (сарлавҳа) қисмига ўтиб, Lead Time / Scheduling (муддатлар) маълумотлари кўрилади.'),
    ('C203 да операция фазалари қаердан текширилади?',
     'Мастер-рецептнинг Operation Overview (Операциялар рўйхати) қисмидан — ундаги операциялар ва уларнинг фазалари кўрилади.'),
    ('C203 да маҳсулот ишлаб чиқариш учун сарфланадиган хомашё (сырьё) қандай текширилади?',
     'Material Assignment / Component Overview (Материаллар таркиби) қисмига ўтилади — у ерда ишлаб чиқаришга сарфланадиган хомашё ва уларнинг миқдори кўрсатилади.'),
    ('COGI транзакциясидан нима мақсадда фойдаланилади?',
     'Ишлаб чиқариш буюртмалари бўйича хато билан ўтган товар ҳаракатларини (масалан, хомашё қолдиғи етишмаганлиги сабабли ўтмаган списание ёки қабул қилишни) кўриб чиқиш ва тўғрилаш учун.'),
    ('Ячейкадаги қолдиқ (остатка) нима мақсадда ўчирилади?',
     'Тизимдаги қолдиқ амалдаги қолдиққа мос келмаганда ёки ортиқча/нотўғри қолдиқ қолганда, у тўғриланиши ва кейинги ишлаб чиқариш операциялари хатосиз ўтиши учун.'),
    ('MIGO транзакциясидан нима мақсадда фойдаланилади?',
     'Товар ҳаракатларини расмийлаштириш учун: омборга қабул қилиш, омбордан чиқариш (списание), омборлараро кўчириш ва бошқа материал ҳаракатлари.'),
    ('CORS транзакциясидан нима мақсадда фойдаланилади?',
     'Ишлаб чиқариш буюртмасидаги нотўғри тасдиқлашни (confirmation) бекор қилиш учун.'),
)
