"""TEMPORARY one-shot (2026-11-09) for the «Nomzodlarni baholash» bank:

1. The TB department's questions become OKK's (the operator: «make the current
   questions of TB the questions of OKK») — the 20 food-safety questions
   imported on 2026-10-31 move department, expected answers and all. Sittings
   already drawn keep their own copies and are untouched.
2. The HR department's questions from the operator's document «HR- тест
   саволлари» — 14, all THEORY (multiple choice: the options are part of the
   question, the right one is the expected answer).
3. The Kaizen department's questions from «Brigadirlar uchun Kaizen keyslar va
   test» — its 20 test questions (THEORY, as above) and its 10 production
   cases (PRACTICAL: situation + task; the document's grading guide is the
   expected answer).

The text is the documents' own, word for word (extracted by script, never
retyped; numbering dropped, the options and the answer keys checked against
both of the Kaizen document's keys). `startup.seed_hr_kaizen_questions`
writes it once (flag below), skipping a question its department already holds
(whitespace and case folded) and filling in the expected answer of such a
question when it has none. Delete this module, the startup function and both
calls once the flag reads «done».
"""

FLAG = "assessment_hr_kaizen_seed_tb_to_okk_2026_11_09_v1"
MOVE_FROM = "tb"
MOVE_TO = "okk"
MOVED_BY = "TB savollari OKK'ga ko'chirildi (2026-11-09)"
SOURCES = {
    "hr": "Import: HR- тест саволлари (docx)",
    "kaizen": "Import: Brigadirlar uchun Kaizen keyslar va test (docx)",
}

# (department, type, question, expected answer)
QUESTIONS = (
    ('hr', 'theory',
     'SAFIA компаниясининг миссияси қайси жавобда тўғри кўрсатилган?\n\nA) Фақат қандолат маҳсулотларини сотиш\nB) Қандолатчилик санъатини ривожлантириш орқали ҳар бир хонадонга байрам шукуҳини олиб кириш\nC) Энг кўп филиал очиш\nD) Фақат ишлаб чиқариш ҳажмини ошириш',
     'Тўғри жавоб: B) Қандолатчилик санъатини ривожлантириш орқали ҳар бир хонадонга байрам шукуҳини олиб кириш'),
    ('hr', 'theory',
     'Мотивация нима?\n\nA) Ходимни фақат назорат қилиш усули\nB) Ходимни мақсадга йўналтирувчи ва ҳаракат қилиш истагини кучайтирувчи омиллар тизими\nC) Фақат маош ошириш жараёни\nD) Фақат ходимни жазолаш воситаси',
     'Тўғри жавоб: B) Ходимни мақсадга йўналтирувчи ва ҳаракат қилиш истагини кучайтирувчи омиллар тизими'),
    ('hr', 'theory',
     'SAFIA’да «Меҳмон» қадрияти нимани англатади?\n\nA) Меҳмон фақат харидор\nB) Меҳмон SAFIA оиласидаги энг муҳим инсон\nC) Меҳмон фақат шикоят қилганда муҳим\nD) Фақат доимий меҳмонларга эътибор бериш керак',
     'Тўғри жавоб: B) Меҳмон SAFIA оиласидаги энг муҳим инсон'),
    ('hr', 'theory',
     'Янги ходимни мослаштиришда қайси инструментлардан фойдаланиш мақсадга мувофиқ?\n\nA) Welcome тренинг, наставник, чек-лист ва мунтазам қайта алоқа\nB) Фақат лавозим номини айтиб қўйиш\nC) Ходимни биринчи кундан назоратсиз қолдириш\nD) Фақат ой охирида натижасини текшириш',
     'Тўғри жавоб: A) Welcome тренинг, наставник, чек-лист ва мунтазам қайта алоқа'),
    ('hr', 'theory',
     'SAFIA’нинг «Маҳсулот» қадрияти нимада?\n\nA) Фақат маҳсулотнинг ташқи кўринишида\nB) Ингредиентларнинг табиийлиги ва таъмнинг нозиклигида\nC) Фақат паст нархда\nD) Маҳсулот ҳажмида',
     'Тўғри жавоб: B) Ингредиентларнинг табиийлиги ва таъмнинг нозиклигида'),
    ('hr', 'theory',
     'Ходимга самарали қайта алоқа беришдан асосий мақсад нима?\n\nA) Ходимни айблаш\nB) Камчиликларини бошқалар олдида айтиш\nC) Кучли томонлари ва ривожланиш зоналарини кўрсатиб, кейинги ҳаракатни аниқлаш\nD) Ходим ўрнига қарор қабул қилиш',
     'Тўғри жавоб: C) Кучли томонлари ва ривожланиш зоналарини кўрсатиб, кейинги ҳаракатни аниқлаш'),
    ('hr', 'theory',
     '«Тадбиркор каби фикрлаш» тамойилига қайси ҳаракат мос келади?\n\nA) Муаммони бошқаларга юклаш\nB) Ҳар қандай вазиятда имкониятларни кўриш ва ўз ҳаракатлари учун масъулият олиш\nC) Фақат раҳбар кўрсатмасини кутиш\nD) Муаммони эътиборсиз қолдириш',
     'Тўғри жавоб: B) Ҳар қандай вазиятда имкониятларни кўриш ва ўз ҳаракатлари учун масъулият олиш'),
    ('hr', 'theory',
     'KPI нима учун керак?\n\nA) Фақат ходимларни жазолаш учун\nB) Мақсад ва натижаларни аниқ, ўлчанадиган кўрсаткичлар орқали баҳолаш учун\nC) Фақат ишга келиш вақтини текшириш учун\nD) Ходимнинг лавозимини ўзгартириш учун',
     'Тўғри жавоб: B) Мақсад ва натижаларни аниқ, ўлчанадиган кўрсаткичлар орқали баҳолаш учун'),
    ('hr', 'theory',
     'SAFIA’нинг ривожланиш тамойилига қайси ҳаракат мос келади?\n\nA) Фақат ўзимиз ривожланиш\nB) Ўзимиз ривожланиш, ҳамкасбларга ёрдам бериш ва бошқаларни илҳомлантириш\nC) Ҳамкасбларнинг ривожланишига аралашмаслик\nD) Фақат тренинг вақтида ўрганиш',
     'Тўғри жавоб: B) Ўзимиз ривожланиш, ҳамкасбларга ёрдам бериш ва бошқаларни илҳомлантириш'),
    ('hr', 'theory',
     'Жамоада конфликт юзага келганда раҳбарнинг биринчи тўғри ҳаракати қайси?\n\nA) Дарҳол айбдорни белгилаш\nB) Конфликтни эътиборсиз қолдириш\nC) Томонларни тинглаш, фактларни аниқлаш ва ечимга йўналтирилган мулоқот олиб бориш\nD) Иккала ходимни ҳам жазолаш',
     'Тўғри жавоб: C) Томонларни тинглаш, фактларни аниқлаш ва ечимга йўналтирилган мулоқот олиб бориш'),
    ('hr', 'theory',
     'Ички ўринбосарлик тизими нима учун керак?\n\nA) Барча ходимларга бир хил лавозим бериш учун\nB) Муҳим лавозимлар учун тайёр кадрлар захирасини шакллантириш ва иш узлуксизлигини таъминлаш учун\nC) Фақат ташқи номзодларни ишга олиш учун\nD) Ходимларнинг вазифаларини камайтириш учун',
     'Тўғри жавоб: B) Муҳим лавозимлар учун тайёр кадрлар захирасини шакллантириш ва иш узлуксизлигини таъминлаш учун'),
    ('hr', 'theory',
     'Жамоа аъзолари ўртасида самарали коммуникацияни таъминлаш учун раҳбар нима қилиши керак?\n\nA) Фақат топшириқ бериш\nB) Мақсад ва вазифаларни аниқ тушунтириш, ходимларни тинглаш ва мунтазам қайта алоқа бериш\nC) Маълумотни фақат айрим ходимларга бериш\nD) Муаммолар ҳақида гаплашмаслик',
     'Тўғри жавоб: B) Мақсад ва вазифаларни аниқ тушунтириш, ходимларни тинглаш ва мунтазам қайта алоқа бериш'),
    ('hr', 'theory',
     'Ходимларнинг юқори текучкаси қандай оқибатларга олиб келиши мумкин?\n\nA) Ёллаш ва ўқитиш харажатлари ортиши, тажриба йўқолиши ва жамоа самарадорлиги пасайиши\nB) Барча жараёнлар автоматик яхшиланиши\nC) Ходимларни ўқитишга эҳтиёж йўқолиши\nD) Жамоанинг тажрибаси автоматик равишда ортиши',
     'Тўғри жавоб: A) Ёллаш ва ўқитиш харажатлари ортиши, тажриба йўқолиши ва жамоа самарадорлиги пасайиши'),
    ('hr', 'theory',
     'SAFIA корпоратив тамойилларига кўра умумий натижага эришиш учун ҳар бир ходим нима қилиши керак?\n\nA) Фақат ўз вазифасини бажариши\nB) Барча масъулиятни раҳбарга қолдириши\nC) Жамоа ва бизнес ривожига ўз ҳиссасини қўшиши\nD) Фақат шахсий натижаси ҳақида ўйлаши',
     'Тўғри жавоб: C) Жамоа ва бизнес ривожига ўз ҳиссасини қўшиши'),
    ('kaizen', 'theory',
     'PQ tahlilida P va Q odatda nimani bildiradi?\n\nA) P — jarayon, Q — sifat\nB) P — mahsulot turi, Q — tanlangan talab/miqdor/vaqt mezoni\nC) P — xodim, Q — malaka\nD) P — reja, Q — xarajat',
     'To‘g‘ri javob: B) P — mahsulot turi, Q — tanlangan talab/miqdor/vaqt mezoni'),
    ('kaizen', 'theory',
     'ABC tahlili yacheyka loyihasida nima uchun kerak?\n\nA) Mahsulotlarni ish jarayoniga ta’siri bo‘yicha guruhlash va ustuvorlikni aniqlash\nB) Oshxona davomatini tekshirish\nC) Nuqsonni bevosita tuzatish\nD) Xodimlarni lavozimga tayinlash',
     'To‘g‘ri javob: A) Mahsulotlarni ish jarayoniga ta’siri bo‘yicha guruhlash va ustuvorlikni aniqlash'),
    ('kaizen', 'theory',
     'Matritsa ‘Produkt-Protsess’ nimani ko‘rsatadi?\n\nA) Har bir mahsulotda bajariladigan operatsiyalar va umumiy oqimga mos guruhlar\nB) Har bir xodimning ish jadvali\nC) Kundalik sifat nuqsonlari\nD) Xomashyo ombor qoldig‘i',
     'To‘g‘ri javob: A) Har bir mahsulotda bajariladigan operatsiyalar va umumiy oqimga mos guruhlar'),
    ('kaizen', 'theory',
     'Yamazumi diagrammasining asosiy vazifasi qaysi?\n\nA) Operatorlar ish yukini taqqoslab tor joyni aniqlash\nB) Kaskadli uchrashuv vaqtini belgilash\nC) Nuqsonlarni mahsulot turiga qarab sanash\nD) A3 hisobotini tasdiqlash',
     'To‘g‘ri javob: A) Operatorlar ish yukini taqqoslab tor joyni aniqlash'),
    ('kaizen', 'theory',
     'Lead time nima?\n\nA) Bir operatsiyada qiymat qo‘shadigan vaqtlar yig‘indisi\nB) Yacheykada mahsulot ishlab chiqarilishi uchun ketgan vaqt\nC) Mahsulot almashuvidagi sozlash vaqti\nD) Ikki mahsulot chiqishi orasidagi takt',
     'To‘g‘ri javob: B) Yacheykada mahsulot ishlab chiqarilishi uchun ketgan vaqt'),
    ('kaizen', 'theory',
     'Trudoyomkost nimani anglatadi?\n\nA) Grafprotsessdagi qiymat qo‘shadigan operatsiyalar vaqtlarining yig‘indisi\nB) Omborda saqlash muddati\nC) Umumiy smena uzunligi\nD) Faqat kutish vaqti',
     'To‘g‘ri javob: A) Grafprotsessdagi qiymat qo‘shadigan operatsiyalar vaqtlarining yig‘indisi'),
    ('kaizen', 'theory',
     'Takt qo‘llanmada qanday hisoblanadi?\n\nA) Ishlab chiqarish vaqtini ishlab chiqarilgan miqdorga bo‘lish\nB) Mahsulotni tozalash vaqti\nC) Bir smenadagi operatorlar soni\nD) Har qanday perenaladka vaqti',
     'To‘g‘ri javob: A) Ishlab chiqarish vaqtini ishlab chiqarilgan miqdorga bo‘lish'),
    ('kaizen', 'theory',
     'Qaysi komponovka uzluksiz oqim va donabay ishlov berishga yo‘naltirilgan?\n\nA) Funksional\nB) Lineyniy\nC) Potochniy\nD) Omborli',
     'To‘g‘ri javob: C) Potochniy'),
    ('kaizen', 'theory',
     'Granitsa liniyaning vazifasi nima?\n\nA) Qiymat qo‘shadigan zona bilan logistika zonasini ajratish/bog‘lash\nB) Xodimlar sonini kamaytirish\nC) Brakni vizual yashirish\nD) Operator vazifasini o‘zgartirmaslik',
     'To‘g‘ri javob: A) Qiymat qo‘shadigan zona bilan logistika zonasini ajratish/bog‘lash'),
    ('kaizen', 'theory',
     'Frontal podacha uchun qo‘llanmada qaysi yondashuv tavsiya etiladi?\n\nA) Katta palletlarni ish joyiga olib kirish\nB) Kichik konteynerlardan foydalanib materialni ish joyiga yaqin yetkazish\nC) Logistikani ishlab chiqarish ichidan butunlay olib tashlash\nD) Barcha materialni polga qo‘yish',
     'To‘g‘ri javob: B) Kichik konteynerlardan foydalanib materialni ish joyiga yaqin yetkazish'),
    ('kaizen', 'theory',
     'Matritsa perenaladki nima ko‘rsatadi?\n\nA) Mahsulotlar o‘rtasidagi almashuvda kerak bo‘ladigan sozlash darajasi\nB) Xodim malakasining darajasi\nC) Operatorlarning kunlik davomatini\nD) Mahsulotlarning brak foizini',
     'To‘g‘ri javob: A) Mahsulotlar o‘rtasidagi almashuvda kerak bo‘ladigan sozlash darajasi'),
    ('kaizen', 'theory',
     'Grafprotsessni tuzishda operatsiya vaqtini qanday o‘lchash tavsiya qilingan?\n\nA) Bir marta taxminan\nB) Kamida 10 marta, so‘ng o‘rtachasini olish\nC) Faqat smena oxirida\nD) Xodimdan so‘rab yozish',
     'To‘g‘ri javob: B) Kamida 10 marta, so‘ng o‘rtachasini olish'),
    ('kaizen', 'theory',
     'Yechim ustuvorligi diagrammasidagi qaysi zonalar qo‘llanmaga ko‘ra amalga oshiriladi?\n\nA) Qizil\nB) Faqat qora\nC) Yashil va sariq\nD) Barcha zonalar avtomatik',
     'To‘g‘ri javob: C) Yashil va sariq'),
    ('kaizen', 'theory',
     'Yechim testida KPI o‘zgarmasa nima qilish kerak?\n\nA) Natijani yashirish\nB) Qo‘shimcha chora ishlab chiqish yoki yechimni qayta ko‘rib sinash\nC) Sinovni muvaffaqiyatli deb yopish\nD) Darhol ko‘paytirib joriy qilish',
     'To‘g‘ri javob: B) Qo‘shimcha chora ishlab chiqish yoki yechimni qayta ko‘rib sinash'),
    ('kaizen', 'theory',
     'Yangi yacheyka komponovkasi chizmasida nimalar bo‘lishi kerak?\n\nA) Faqat uskunalar nomi\nB) Masshtab, o‘lchamlar, oqim, granitsa, logistika yo‘lagi va ish joylari\nC) Faqat oldin/keyin fotosi\nD) Faqat operatorlar familiyasi',
     'To‘g‘ri javob: B) Masshtab, o‘lchamlar, oqim, granitsa, logistika yo‘lagi va ish joylari'),
    ('kaizen', 'theory',
     'Loyiha boshlang‘ich A3 da buyurtmachi bilan nimalar kelishiladi?\n\nA) Hozirgi holat, yangi holat, maqsadli ko‘rsatkichlar va cheklovlar\nB) Faqat loyiha nomi va rahbar\nC) Faqat xarajat\nD) Faqat yakuniy natija',
     'To‘g‘ri javob: A) Hozirgi holat, yangi holat, maqsadli ko‘rsatkichlar va cheklovlar'),
    ('kaizen', 'theory',
     'Qo‘llanmada loyiha jamoasi odatda nechta kishidan iborat bo‘lishi ko‘rsatilgan?\n\nA) 1–2\nB) 2–3\nC) 4–10\nD) 15–20',
     'To‘g‘ri javob: C) 4–10'),
    ('kaizen', 'theory',
     'Yechimlar uchun amalga oshirish rejasida qaysi elementlar ko‘rsatiladi?\n\nA) Yechim, rozi bo‘lgan mas’ul, harakatlar, ijrochi va kelishilgan muddatlar\nB) Faqat mas’ulning ismi\nC) Faqat yakun sanasi\nD) Faqat xarajatlar',
     'To‘g‘ri javob: A) Yechim, rozi bo‘lgan mas’ul, harakatlar, ijrochi va kelishilgan muddatlar'),
    ('kaizen', 'theory',
     'Yangi holatni mustahkamlash bo‘yicha qo‘llanmada qanday davr keltirilgan?\n\nA) 3 kun\nB) 1 hafta\nC) 3 hafta\nD) 3 oy',
     'To‘g‘ri javob: C) 3 hafta'),
    ('kaizen', 'theory',
     'Yakuniy A3 da qaysi mazmun bo‘lishi kerak?\n\nA) Faqat ijobiy natijalar\nB) Oldingi holat, o‘zgarish/sinov jarayoni, keyingi holat va aniq sonli natijalar, shu jumladan salbiy sinovlar\nC) Faqat jamoa a’zolari\nD) Faqat yangi komponovka chizmasi',
     'To‘g‘ri javob: B) Oldingi holat, o‘zgarish/sinov jarayoni, keyingi holat va aniq sonli natijalar, shu jumladan salbiy sinovlar'),
    ('kaizen', 'practical',
     'Bir xil material yetishmovchiligi uch yacheykani to‘xtatyapti\n\nVaziyat. Uchta yacheykada bir xil turdagi krem qadoqlari kechikmoqda. Har bir lider alohida xavotir yuborgan, lekin muammo brigadir kaskadiga chiqmagan. To‘xtashlar haftada to‘rt marta takrorlangan.\n\nTopshiriq. Muammoni brigadir darajasida birlashtirib boshqaring.\n\nMuammoni aniqlang, vakolatingiz doirasidagi birinchi chorani, eskalatsiya nuqtasini va o‘lchanadigan natijani tushuntiring.',
     'Har bir xavotirning mahsulot, vaqt, yacheyka va yo‘qotilgan daqiqalarini tekshiring (5W1H). Liderlar bilan 2-darajali kaskadli uchrashuv o‘tkazib umumiy sababni aniqlang. Brigadir vakolatidagi ta’minot rejasini tuzing; yuqori vakolat talab qilsa ishlab chiqarish rahbari o‘rinbosariga eskalatsiya qiling. Harakatlar rejasi: mas’ul, muddat, kutilgan natija. To‘xtash daqiqalarini haftalik KPI bilan kuzating va liderlarga statusni qaytaring.'),
    ('kaizen', 'practical',
     'Uchastkada ortiqcha yurish va material tashish\n\nVaziyat. Operatorlar xomashyo va qadoq olish uchun hujayradan chiqib, tor yo‘lakdan aylanib yuradi. Palletlar logistika hududini to‘sib qo‘yadi. Harakatlar va masofa bo‘yicha ma’lumot yo‘q.\n\nTopshiriq. Jamoa bilan oqim va ergonomikani qayta loyihalash uchun tahlil qiling.\n\nMuammoni aniqlang, vakolatingiz doirasidagi birinchi chorani, eskalatsiya nuqtasini va o‘lchanadigan natijani tushuntiring.',
     'Gembada aralashmasdan kuzating; Spaghetti bilan harakatni, xronometraj bilan olish/qatnov vaqtini o‘lchang. Hozirgi hujayrani masshtabli top-view komponovkada belgilang. Qiymat qo‘shadigan va logistika zonalarini granitsa liniyasi bilan ajrating; kichik konteyner, frontal podacha, qo‘l yetadigan joy va oqim yo‘nalishini ko‘rib chiqing. Xavfsizlik va sifatni tekshirib, maketda simulyatsiya qiling, keyin ish joyida sinang. Masofa, kutish, maydon va lead time ni taqqoslang.'),
    ('kaizen', 'practical',
     'Ko‘p xil mahsulot sabab ish oqimi beqaror\n\nVaziyat. Yacheykada 18 xil mahsulot ishlab chiqariladi. Uch tur mahsulot hajmning 75 foizini tashkil qiladi, qolganlari kamdan-kam ishlab chiqariladi. Rahbar har bir mahsulot uchun alohida liniya taklif qildi.\n\nTopshiriq. Mahsulotlarni tahlil qilib mos yacheyka va navbatni tanlang.\n\nMuammoni aniqlang, vakolatingiz doirasidagi birinchi chorani, eskalatsiya nuqtasini va o‘lchanadigan natijani tushuntiring.',
     'PQ tahlilida P=SKU, Q=miqdor yoki yacheykada band bo‘lgan vaqtni belgilang; ABC bilan ta’sirga ko‘ra guruhlang. Mahsulot-protsess matritsasida qaysi mahsulotlarda operatsiyalar o‘xshashligini ko‘ring. Top mahsulotlarga mos oqimni tanlang; kam hajmli turlar uchun resursni ortiqcha ajratmang. Qarorni talab, operatsiyalar, vaqt va cheklovlar bilan tasdiqlab, sinov rejasi tuzing.'),
    ('kaizen', 'practical',
     'Bitta operatsiya butun liniyani sekinlashtiryapti\n\nVaziyat. Tort bezash liniyasida ikkinchi operatorning sikli 92 soniya, qolgan ikki operatorniki 55 va 61 soniya. Oldida navbat yig‘iladi, soatlik reja 15 foizga ortda. Yangi odam qo‘shish taklifi bor.\n\nTopshiriq. Tor joyni aniqlang va ish yukini tizimli qayta taqsimlang.\n\nMuammoni aniqlang, vakolatingiz doirasidagi birinchi chorani, eskalatsiya nuqtasini va o‘lchanadigan natijani tushuntiring.',
     'Grafprotsessdagi qiymat qo‘shadigan qadamlarni va taktni kamida 10 o‘lchov bilan tasdiqlang. Yamazumida operator yuklarini taqqoslang; navbat va bo‘sh vaqtni Gembada kuzating. Qadamlarni qayta taqsimlab qo‘lda balansirovka qiling; har operatorga yangi ishni tushuntiring va sinang. Takt, lead time, bir soatlik chiqim va sifatni qayta o‘lchang. Faqat xavfsiz, sifatli va ko‘rsatkichlar bilan tasdiqlangan standartni joriy eting.'),
    ('kaizen', 'practical',
     'Mahsulot almashinuvida uzoq sozlash\n\nVaziyat. Bir yacheykada mahsulot turi almashganda sozlash 28 daqiqagacha ketadi. Ba’zi ketma-ketliklarda 8 daqiqa, boshqalarida 28 daqiqa. Rejalashtirish bo‘limi mahsulot tartibini almashtira oladi, ammo aniq ma’lumot yo‘q.\n\nTopshiriq. Almashuvni qisqartirish uchun ma’lumot to‘plang va ishni kelishtiring.\n\nMuammoni aniqlang, vakolatingiz doirasidagi birinchi chorani, eskalatsiya nuqtasini va o‘lchanadigan natijani tushuntiring.',
     'Matritsa perenaladki tuzing: SKUlarni ikki o‘qda bir xil ketma-ketlikda joylang va har almashuvni baholang/o‘lchang. Uzoq almashuvlarda Gemba va xronometraj bilan qaysi qadam vaqt olayotganini aniqlang. Mahsulot ketma-ketligini almashtirish variantini rejalashtirish bilan ko‘rib chiqing; ichki qadamlarni ajratish va tayyorlashni oldindan qilish kabi sinovlarni xavfsizlik/sifatga zid bo‘lmagan holda tekshiring. Setup vaqti hamda reja bajarilishini taqqoslang.'),
    ('kaizen', 'practical',
     'Kaizen taklifi kutilgan natijani bermadi\n\nVaziyat. Yangi oqim sinovida lead time 42 daqiqadan 39 daqiqaga tushdi, lekin brak 3 foizdan 6 foizga chiqdi. Jamoa ishni davom ettirishga shoshilyapti, A3da faqat ijobiy ko‘rsatkich yozilgan.\n\nTopshiriq. Qaror va loyiha boshqaruvini dalilga asoslang.\n\nMuammoni aniqlang, vakolatingiz doirasidagi birinchi chorani, eskalatsiya nuqtasini va o‘lchanadigan natijani tushuntiring.',
     'Sinovni vaqtincha to‘xtatib, sifatni himoyalang. Boshlang‘ich A3 maqsadlari, cheklovlari va KPI larini tekshiring; barcha sinov natijalarini, jumladan salbiysini yozing. 5W1H/differensial diagnostika bilan brak qayerda va qachon ko‘tarilganini toping; sabablarni Ishikava/5 Why bilan tekshiring. Qarorlarni foyda/amalga oshirish qiyinligiga ko‘ra ustuvorlang, qayta test qiling. KPI lar birga yaxshilanmaguncha ko‘lamni kengaytirmang.'),
    ('kaizen', 'practical',
     'Liderlar o‘qitish natijasini nazorat qilmayapti\n\nVaziyat. Bir nechta liderlar xodimlarni yangi operatsiyaga o‘rgatgan, lekin ta’lim rejasida natija yo‘q, matritsa o‘zgarmagan. Bir xil xatolar takrorlanmoqda.\n\nTopshiriq. Brigadir sifatida o‘qitish tizimini tiklang.\n\nMuammoni aniqlang, vakolatingiz doirasidagi birinchi chorani, eskalatsiya nuqtasini va o‘lchanadigan natijani tushuntiring.',
     'Liderlar bilan Gembada ishni kuzating. Mahoratlar ro‘yxati va matritsani tekshiring; o‘qituvchi ekspert yoki yuqori darajadami, tasdiqlang. List razbivki rabotda 7 gacha muhim qadam, diqqat jihatlari va sabablar borligini ko‘ring. I DO/WE DO/YOU DO bo‘yicha liderlarga amaliy coaching bering. WE DO/YOU DO natijasini tekshirib, o‘rgandi/o‘rganmadi, imzo va matritsani yangilang; xatolarni qayta kuzating.'),
    ('kaizen', 'practical',
     'Takroriy xavotirlar kaskadda javobsiz qolyapti\n\nVaziyat. Liderlar uchrashuviga bir xil xavotirlar kelmoqda: tayyor mahsulotni keyingi bo‘limga topshirish vaqti noma’lum. Avvalgi uchrashuvlarda mas’ul tayinlanmagan, xavotir mualliflari javob olmayapti.\n\nTopshiriq. Kaskadli uchrashuvni natijaga yo‘naltiring va muammolarni yopish tartibini ayting.\n\nMuammoni aniqlang, vakolatingiz doirasidagi birinchi chorani, eskalatsiya nuqtasini va o‘lchanadigan natijani tushuntiring.',
     'Oldingi xavotirlar statusini ko‘rib chiqing, egalarini tinglang, holatni 5W1H bilan aniqlashtiring. Har bir masala uchun yechim/vaqtinchalik chora, mas’ul, kelishilgan muddat va KPI belgilang; mas’ul rolini mas’ul bu vazifani qabul qilganini tasdiqlang. Brigadir hal qilolmaydigan muammoni keyingi darajaga muddatni kutmasdan eskalatsiya qiling. Muallifga status qaytsin, yechim tasdiqlangach yutuqlar qismiga ko‘chirsin. Takrorlanish soni va topshirish vaqti bilan tekshiring.'),
    ('kaizen', 'practical',
     'Yangi komponovka joriy qilindi, ammo standart yo‘q\n\nVaziyat. Uskunalar joyi o‘zgartirilgan. Dastlab ish tezlashdi, ammo ikki haftada operatorlar materiallarni turlicha joylashtira boshladi, yo‘lak yana to‘sildi. Chizma eskirgan.\n\nTopshiriq. Yangi holatni barqarorlashtirish mexanizmini tuzing.\n\nMuammoni aniqlang, vakolatingiz doirasidagi birinchi chorani, eskalatsiya nuqtasini va o‘lchanadigan natijani tushuntiring.',
     'Masshtabli top-view chizmani yangilang: uskunalar o‘lchami/joyi, operatorlar, oqim, kirish-chiqish, logistika yo‘lagi va granitsa liniyasi. Xavfsizlik, ergonomika va kichik konteyner/podacha qoidalarini tekshiring. Yangi standartni ish joyida ko‘rsating; liderlarni o‘qiting. 3 haftalik mustahkamlash rejasini belgilang, nazorat uchun mas’ul tayinlang va stend/audit/ochilish-yopilishda kamchiliklarni kuzating. A3da oldin-jarayon-keyin, KPI va salbiy sinovlarni hujjatlashtiring.'),
    ('kaizen', 'practical',
     'A3 loyiha rejasida jamoa va muddatlar noaniq\n\nVaziyat. Buyurtmachi yacheykani yaxshilashni so‘radi, ammo hozirgi holat, maqsadli ko‘rsatkich va cheklovlar yozilmagan. Jamoa tarkibi ikki kishi, yakun sanasi belgilanmagan.\n\nTopshiriq. Ishni to‘g‘ri boshlash uchun birinchi navbatdagi ishlarni tartiblang.\n\nMuammoni aniqlang, vakolatingiz doirasidagi birinchi chorani, eskalatsiya nuqtasini va o‘lchanadigan natijani tushuntiring.',
     'Buyurtmachi bilan intervyu: hozirgi holat, yangi holat, maqsadli o‘lchovlar va cheklovlarni aniqlang. Boshlang‘ich A3da aniq sonli maqsadlar va amaliy natijalarni, 4–10 kishilik jamoa tarkibi va vazifalarni, bosqichlar muddatini yozing. Jamoa yig‘ilishlarining doimiy vaqti va joyini belgilang, boshlang‘ich KPI ma’lumotlari bilan loyiha stendini yarating. A3 ni buyurtmachiga tasdiqlating, so‘ng Gembada tahlilni boshlang.'),
)
