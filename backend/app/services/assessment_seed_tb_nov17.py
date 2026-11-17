"""TEMPORARY one-shot (2026-11-17) for the «Nomzodlarni baholash» bank:
the TB department's questions from the operator's document «ТБ бўйича
саволлар» — 20 open questions (technical safety, hygiene, first aid, fire,
labour code), all THEORY, with no expected answer (the document gives none).

TB has held no question since 2026-11-09, when its earlier 20 moved to OKK, so
no sitting could be opened (`pool_short`, TB needs 3). The text is the
document's own, word for word (extracted by script, never retyped; numbering
dropped, runs of spaces folded to one, capitals kept as written).
`startup.seed_tb_safety_questions` writes it once (flag below), skipping a
question TB already holds (whitespace and case folded). It runs AFTER
`startup.seed_hr_kaizen_questions`, whose TB → OKK move would otherwise take
these on a database that has not run it yet. Delete this module, the startup
function and both calls once the flag reads «done».
"""

FLAG = "assessment_tb_safety_seed_2026_11_17_v1"
DEPARTMENT = "tb"
QTYPE = "theory"
SOURCE = "Import: ТБ бўйича саволлар (docx)"

# The questions, in the document's order.
QUESTIONS = (
    'МАХСУС КИЙИМГА НИМАЛАР КИРАДИ ВА УНИ КИЙИШ ТАРТИБИНИ ТУШУНТИРИБ БЕРИНГ',
    'ШАХСИЙ ХИМОЯ ВОСИТАСИ ДЕГАНДА НИМАНИ ТУШИНАСИЗ ВА УЛАРГА НИМАЛАР КИРАДИ ?',
    'ШАХСИЙ ГИГИЕНА БУ НИМА ?',
    'КИРИШ ЙЎРИҚНОМАСИ НИМА ВА У КИМ ТОМОНИДАН ЎТКАЗИЛАДИ ?',
    'М.Ч.Ж “SAFIA QANDOLAT” КОРХОНАСИДА МЕХНАТ КОДЕКИСИГА АСОСАН НЕЧА СОАТЛИК ИШ ВАҚТИ БЕЛГИЛАНГАН ВА ШАХСИЙ ВАҚТГА НИМАЛАР КИРАДИ ?',
    'МАЖБУРИЙ ТИББИЙ КЎРИКДАН ЎТИШ ТАРТИБИНИ ТУШУНТИРИБ БЕРИНГ.',
    'ТЕХНИКА ХАВФСИЗЛИГИ ТАЛАБЛАРИГА АСОСАН, ХОДИМ ИШ ЖОЙИДА ИШ БОШЛАШДАН АВВАЛ НИМАЛАРГА ЭТИБОР БЕРИШИ ЛОЗИМ ?',
    'ШАХСИЙ ГИГИЕНА ҚОИДАЛАРИГА АСОСАН ҚЎЛ ЮВИШ ТАРТИБИНИ ТУШУНТИРИБ БЕРИНГ.',
    'ЁНҒИН КЕЛИБ ЧИҚАНДА БИРЛАМЧИ ЎТ ЎЧИРИШ ВОСИТАСИНИ ИШЛАТИШ ТАРТИБИНИ ТУШУНТИРИБ БЕРИНГ.',
    'ФАБРИКА ХУДУДИГА ОЛИБ КИРИШ ТАҚИҚЛАНГАН БУЮМЛАРНИ НОММА-НОМ АЙТИБ БЕРИНГ.',
    'БИРИНЧИ ТЕЗ ТИББИЙ ЁРДАМ ХАҚИДА НИМАЛАРНИ БИЛАСИЗ?',
    'БИРЛАМЧИ ЎТ ЎЧИРИШ ВОСИТАСИ ҚАНДАЙ ҚИСМЛАРДАН ТАШКИЛ ТОПГАН?',
    'ИШ ЖОЙЛАРИДА ЙЎРИҚНОМА НИМА УЧУН ВА КИМ ТОМОНИДАН ЎТКАЗИЛАДИ?',
    'НЕЧА ХИЛ ЖАРОХАТ ТУРИ МАВЖУД, ВА ҚАНДАЙ ЖАРОХАТ БИЛАН ИШЛАШ ТАҚИҚЛАНАДИ?',
    'ФАВҚУЛОТДА ХОЛАТ (ЗИЛ-ЗИЛА,ЁНҒИН) КЕЛИБ ЧИҚҚАНДА СИЗНИНГ ХАРАКАТИНГИЗ?',
    'ЁНҒИН КЕЛИБ ЧИҚҚАНДА БИРИНЧИ НАВБАТДА КИМЛАРГА ХАБАР БЕРИЛАДИ?',
    'МЕХНАТ КОДЕКСИГА АСОСАН ХОДИМГА НЕЧА КУН МЕХНАТ ТАЪТИЛИ БЕРИЛАДИ?',
    'ИНТИЗОМИЙ ЖАЗО ТУРЛАРИНИ ТУШУНТИРИБ БЕРИНГ.НЕЧА ХИЛ ВА ҚАНДАЙ ТУРЛАРИ МАВЖУД?',
    'ҚАЙ ХОЛАТДА СОҒЛИҒИ ТУФАЙЛИ ХОДИМ ИШГА ҚЎЙИЛМАЙДИ?',
    'ФАВҚУЛОТ ХОЛАТИ КЕЛИБ ЧИҚҚАНДА ҚАЙСИ РАҚАМЛАРГА МУРОЖАТ ҚИЛИНАДИ?',
)
