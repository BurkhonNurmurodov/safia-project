"""The external read API's manual, in the platform's four languages.

ONE document: `manual(lang)` hands `assistant_documents` its blocks, which
lays them out as the PDF or the Markdown file the «API» page offers
(routers/api_tokens.py). The structure (endpoints, field names, types, the
example) is written once here; only the words are per language. A field
added to routers/ext_api.py gets a row in `_FIELDS` and a line in each `_S`.
"""
from __future__ import annotations

BASE_URL = "https://production.safiacorporate.uz/api/ext/v1"
EXAMPLE = f'curl -H "Authorization: Bearer sfx_..."\n  "{BASE_URL}/production?date=2026-11-09&cell=9422"'

# section → [(field, type, key of its meaning in _S)]
_FIELDS = {
    "cells": [("code", "string", "f_code"), ("sap_code", "string", "f_sap"),
              ("group", "string | null", "f_group"), ("leader", "string | null", "f_leader"),
              ("brigadir", "string | null", "f_brigadir"), ("shift", "1 | 2 | null", "f_shift")],
    "production": [("code, sap_code, group", "", "f_same"),
                   ("plan_minutes", "number | null", "f_plan_min"),
                   ("fact_minutes", "number | null", "f_fact_min"),
                   ("skus", "array", "f_skus")],
    "sku": [("sap_code", "string | null", "f_sku_sap"), ("name", "string", "f_sku_name"),
            ("unit", "string | null", "f_sku_unit"), ("plan", "number", "f_sku_plan"),
            ("fact", "number", "f_sku_fact"), ("plan_minutes", "number", "f_sku_min"),
            ("shared", "boolean", "f_sku_shared"), ("containers", "object", "f_sku_cont")],
    "attendance": [("code", "string", "f_code"), ("workers", "array", "f_workers"),
                   ("employee_id", "string | null", "f_emp"), ("name", "string", "f_name"),
                   ("job", "string | null", "f_job"), ("clock_in", "string | null", "f_in"),
                   ("clock_out", "string | null", "f_out")],
}

_S = {
    "en": {
        "title": "Safia IMS — external API manual",
        "subtitle": "Read-only access to cells, plans, SKUs and attendance",
        "h_what": "What it is",
        "what": "Three read-only requests return the production cells, each cell's plan and SKUs "
                "for a date, and the workers' clock-in and clock-out times for a date. Nothing can "
                "be changed through this API. Answers are JSON.",
        "h_token": "Getting a token",
        "token": ["Open the «API» page in Safia IMS.",
                  "Press «Create token», name it after the system that will use it and pick how long it lives.",
                  "Copy the token at once: it is shown only once and cannot be read again.",
                  "Keep it like a password. If it leaks, revoke it on the same page and make a new one."],
        "h_call": "Making a request",
        "base": f"Base address: {BASE_URL}",
        "header": "Send the token with every request in the header «Authorization: Bearer <token>». Example:",
        "h_params": "Parameters",
        "cols_p": ["Parameter", "Value", "Meaning"],
        "p_date": "The day. Left out = today (Tashkent time). A night shift belongs to the day it started.",
        "p_cell": "One cell's Verifix code. Left out = every cell. Not accepted by /cells.",
        "cols_f": ["Field", "Type", "Meaning"],
        "cells": "The cells standing on that day that carry a SAP code.",
        "production": "Each cell's plan for the day and its SKUs. Only SKUs with a plan or a fact that day are listed.",
        "sku_cap": "Each entry of «skus»",
        "attendance": "Each cell's workers and their clock times. Times look like 2026-11-09T07:53+05:00.",
        "f_code": "The cell's Verifix code — the key of a cell everywhere.",
        "f_sap": "The SAP work centre. Not unique: several cells may share one.",
        "f_group": "The letter that tells apart cells sharing one SAP code; null when the cell has none.",
        "f_leader": "The cell's leader on that day.",
        "f_brigadir": "The brigadir whose unit the cell stands in on that day.",
        "f_shift": "The unit's shift.",
        "f_same": "As in /cells.",
        "f_plan_min": "The cell's planned work for the day, in minutes. null = no plan reaches the cell (not zero).",
        "f_fact_min": "The work done, in minutes.",
        "f_skus": "The cell's SKUs for the day (see the next table).",
        "f_sku_sap": "The SKU's SAP code.",
        "f_sku_name": "The SKU's name.",
        "f_sku_unit": "What the quantities are counted in (dona, kg ...).",
        "f_sku_plan": "Planned quantity.",
        "f_sku_fact": "Produced quantity.",
        "f_sku_min": "Planned minutes for this SKU.",
        "f_sku_shared": "true = the line belongs to every cell of the work centre and is listed under each "
                        "with its whole quantity. Do not add such lines up across cells.",
        "f_sku_cont": "The containers the day's plan needs, by type: yellow (rectangular yellow container), "
                      "round (round yellow container), grey (grey container), bucket, box (yellow box). Each is "
                      "{capacity, count}: capacity = how many fit, in the SKU's unit; count = plan ÷ capacity, "
                      "rounded up (null without a plan). A type with no capacity entered is left out; {} = none entered.",
        "f_workers": "The cell's workers (the fields below).",
        "f_emp": "The worker's Verifix id. null on a day already closed.",
        "f_name": "Full name.",
        "f_job": "Job title.",
        "f_in": "Clock-in. null = did not come (yet).",
        "f_out": "Clock-out. null = still inside, or no check-out recorded.",
        "h_errors": "Errors",
        "cols_e": ["Status", "Code", "What to do"],
        "e_400": "Write the date as YYYY-MM-DD.",
        "e_401": "The token is missing, wrong, expired or revoked. Make a new one on the «API» page.",
        "e_429": "Too many wrong tokens from your address. Wait ten minutes.",
        "h_rules": "Rules",
        "rules": ["A token lives 30, 90 or 365 days, or never expires if made so; an expired one is replaced by a new one.",
                  "A token stops working the moment its owner loses access to the «API» page.",
                  "Today's data changes during the day: plans are typed in, people clock in and out. Ask again for fresh figures.",
                  "A closed day answers from the brigadir's closed record; an open day answers live from Verifix.",
                  "Passport and personal identification numbers are never returned."],
    },
    "ru": {
        "title": "Safia IMS — руководство по внешнему API",
        "subtitle": "Доступ только для чтения: ячейки, планы, SKU и посещаемость",
        "h_what": "Что это",
        "what": "Три запроса только для чтения возвращают производственные ячейки, план и SKU каждой "
                "ячейки на дату и время прихода и ухода сотрудников на дату. Через этот API ничего "
                "нельзя изменить. Ответы приходят в формате JSON.",
        "h_token": "Как получить токен",
        "token": ["Откройте страницу «API» в Safia IMS.",
                  "Нажмите «Создать токен», назовите его по системе, которая будет им пользоваться, и выберите срок действия.",
                  "Сразу скопируйте токен: он показывается один раз, прочитать его снова нельзя.",
                  "Храните его как пароль. Если он утёк, отзовите его на той же странице и создайте новый."],
        "h_call": "Как отправить запрос",
        "base": f"Базовый адрес: {BASE_URL}",
        "header": "Передавайте токен в каждом запросе в заголовке «Authorization: Bearer <токен>». Пример:",
        "h_params": "Параметры",
        "cols_p": ["Параметр", "Значение", "Смысл"],
        "p_date": "День. Не указан = сегодня (время Ташкента). Ночная смена относится ко дню, в который она началась.",
        "p_cell": "Код Verifix одной ячейки. Не указан = все ячейки. В /cells не принимается.",
        "cols_f": ["Поле", "Тип", "Смысл"],
        "cells": "Ячейки, действующие в этот день и имеющие код SAP.",
        "production": "План каждой ячейки на день и её SKU. В списке только SKU, у которых в этот день есть план или факт.",
        "sku_cap": "Каждый элемент «skus»",
        "attendance": "Сотрудники каждой ячейки и время их отметок. Время выглядит так: 2026-11-09T07:53+05:00.",
        "f_code": "Код Verifix ячейки — ключ ячейки везде.",
        "f_sap": "Рабочий центр SAP. Не уникален: один код может быть у нескольких ячеек.",
        "f_group": "Буква, различающая ячейки с одним кодом SAP; null, если у ячейки её нет.",
        "f_leader": "Лидер ячейки в этот день.",
        "f_brigadir": "Бригадир, в чьём подразделении ячейка стоит в этот день.",
        "f_shift": "Смена подразделения.",
        "f_same": "Как в /cells.",
        "f_plan_min": "Плановая работа ячейки на день, в минутах. null = план до ячейки не доходит (это не ноль).",
        "f_fact_min": "Выполненная работа, в минутах.",
        "f_skus": "SKU ячейки на день (см. следующую таблицу).",
        "f_sku_sap": "Код SAP продукта.",
        "f_sku_name": "Название продукта.",
        "f_sku_unit": "Единица измерения (dona, kg ...).",
        "f_sku_plan": "Плановое количество.",
        "f_sku_fact": "Произведённое количество.",
        "f_sku_min": "Плановые минуты по этому SKU.",
        "f_sku_shared": "true = строка относится ко всем ячейкам рабочего центра и указана у каждой с полным "
                        "количеством. Не складывайте такие строки между ячейками.",
        "f_sku_cont": "Контейнеры, нужные под план дня, по типам: yellow (жёлтый прямоугольный контейнер), "
                      "round (жёлтый круглый контейнер), grey (серый контейнер), bucket (ведро), box (жёлтый ящик). "
                      "Каждый — {capacity, count}: capacity — сколько помещается, в единице SKU; count — план ÷ "
                      "вместимость с округлением вверх (null без плана). Тип без вместимости не выводится; {} = не указана.",
        "f_workers": "Сотрудники ячейки (поля ниже).",
        "f_emp": "ID сотрудника в Verifix. null для уже закрытого дня.",
        "f_name": "ФИО.",
        "f_job": "Должность.",
        "f_in": "Приход. null = не пришёл (пока).",
        "f_out": "Уход. null = ещё на месте или уход не отмечен.",
        "h_errors": "Ошибки",
        "cols_e": ["Статус", "Код", "Что делать"],
        "e_400": "Пишите дату в виде ГГГГ-ММ-ДД.",
        "e_401": "Токен не указан, неверен, истёк или отозван. Создайте новый на странице «API».",
        "e_429": "Слишком много неверных токенов с вашего адреса. Подождите десять минут.",
        "h_rules": "Правила",
        "rules": ["Токен действует 30, 90 или 365 дней либо бессрочно, если так выбрано при создании; вместо истёкшего создайте новый.",
                  "Токен перестаёт работать в тот момент, когда его владелец теряет доступ к странице «API».",
                  "Данные за сегодня меняются в течение дня: планы вносятся, люди приходят и уходят. Запрашивайте снова, чтобы получить свежие цифры.",
                  "Закрытый день отвечает из закрытой записи бригадира; открытый день — вживую из Verifix.",
                  "Паспортные данные и ПИНФЛ не возвращаются никогда."],
    },
    "uz": {
        "title": "Safia IMS — tashqi API qo'llanmasi",
        "subtitle": "Faqat o'qish uchun: yacheykalar, rejalar, SKU va davomat",
        "h_what": "Bu nima",
        "what": "Faqat o'qish uchun uchta so'rov ishlab chiqarish yacheykalarini, har bir yacheykaning "
                "sana bo'yicha rejasi va SKU ro'yxatini hamda xodimlarning sana bo'yicha kelish va "
                "ketish vaqtlarini qaytaradi. Bu API orqali hech narsani o'zgartirib bo'lmaydi. "
                "Javoblar JSON formatida keladi.",
        "h_token": "Tokenni qanday olish",
        "token": ["Safia IMS'da «API» sahifasini oching.",
                  "«Token yaratish» tugmasini bosing, uni ishlatadigan tizim nomi bilan nomlang va amal qilish muddatini tanlang.",
                  "Tokenni darhol nusxalab oling: u faqat bir marta ko'rsatiladi, qayta o'qib bo'lmaydi.",
                  "Uni parol kabi saqlang. Agar u oshkor bo'lsa, shu sahifada bekor qiling va yangisini yarating."],
        "h_call": "So'rovni qanday yuborish",
        "base": f"Asosiy manzil: {BASE_URL}",
        "header": "Tokenni har bir so'rovda «Authorization: Bearer <token>» sarlavhasida yuboring. Misol:",
        "h_params": "Parametrlar",
        "cols_p": ["Parametr", "Qiymat", "Ma'nosi"],
        "p_date": "Kun. Ko'rsatilmasa = bugun (Toshkent vaqti). Tungi smena o'zi boshlangan kunga tegishli.",
        "p_cell": "Bitta yacheykaning Verifix kodi. Ko'rsatilmasa = barcha yacheykalar. /cells uni qabul qilmaydi.",
        "cols_f": ["Maydon", "Turi", "Ma'nosi"],
        "cells": "Shu kuni amalda bo'lgan va SAP kodi bor yacheykalar.",
        "production": "Har bir yacheykaning shu kungi rejasi va SKU ro'yxati. Ro'yxatda faqat shu kuni rejasi yoki fakti bor SKU bo'ladi.",
        "sku_cap": "«skus» ning har bir elementi",
        "attendance": "Har bir yacheykaning xodimlari va ularning vaqtlari. Vaqt shunday ko'rinadi: 2026-11-09T07:53+05:00.",
        "f_code": "Yacheykaning Verifix kodi — yacheykaning hamma joydagi kaliti.",
        "f_sap": "SAP ish markazi. Yagona emas: bitta kod bir nechta yacheykada bo'lishi mumkin.",
        "f_group": "Bitta SAP kodidagi yacheykalarni ajratuvchi harf; yacheykada bo'lmasa null.",
        "f_leader": "Yacheykaning shu kungi lideri.",
        "f_brigadir": "Yacheyka shu kuni kimning bo'linmasida turgan bo'lsa, o'sha brigadir.",
        "f_shift": "Bo'linmaning smenasi.",
        "f_same": "/cells dagi kabi.",
        "f_plan_min": "Yacheykaning shu kungi rejadagi ishi, daqiqalarda. null = yacheykaga reja yetib kelmagan (bu nol emas).",
        "f_fact_min": "Bajarilgan ish, daqiqalarda.",
        "f_skus": "Yacheykaning shu kungi SKU ro'yxati (keyingi jadvalga qarang).",
        "f_sku_sap": "Mahsulotning SAP kodi.",
        "f_sku_name": "Mahsulot nomi.",
        "f_sku_unit": "O'lchov birligi (dona, kg ...).",
        "f_sku_plan": "Rejadagi miqdor.",
        "f_sku_fact": "Ishlab chiqarilgan miqdor.",
        "f_sku_min": "Shu SKU bo'yicha rejadagi daqiqalar.",
        "f_sku_shared": "true = qator ish markazining barcha yacheykalariga tegishli va har birida to'liq miqdori "
                        "bilan ko'rsatilgan. Bunday qatorlarni yacheykalar bo'yicha qo'shmang.",
        "f_sku_cont": "Kunlik rejaga kerakli konteynerlar, turi bo'yicha: yellow (sariq to'rtburchak konteyner), "
                      "round (sariq dumaloq konteyner), grey (kulrang konteyner), bucket (chelak), box (sariq yashik). "
                      "Har biri {capacity, count}: capacity — nechta sig'adi, SKU birligida; count — reja ÷ sig'im, "
                      "yuqoriga yaxlitlangan (reja bo'lmasa null). Sig'imi kiritilmagan tur chiqmaydi; {} = kiritilmagan.",
        "f_workers": "Yacheyka xodimlari (maydonlari quyida).",
        "f_emp": "Xodimning Verifix ID raqami. Yopilgan kun uchun null.",
        "f_name": "To'liq ismi.",
        "f_job": "Lavozimi.",
        "f_in": "Kelgan vaqti. null = (hali) kelmagan.",
        "f_out": "Ketgan vaqti. null = hali ichkarida yoki ketishi qayd etilmagan.",
        "h_errors": "Xatolar",
        "cols_e": ["Holat", "Kod", "Nima qilish kerak"],
        "e_400": "Sanani YYYY-MM-DD ko'rinishida yozing.",
        "e_401": "Token ko'rsatilmagan, noto'g'ri, muddati o'tgan yoki bekor qilingan. «API» sahifasida yangisini yarating.",
        "e_429": "Manzilingizdan juda ko'p noto'g'ri token yuborildi. O'n daqiqa kuting.",
        "h_rules": "Qoidalar",
        "rules": ["Token 30, 90 yoki 365 kun amal qiladi yoki yaratishda shunday tanlansa muddatsiz bo'ladi; muddati o'tganining o'rniga yangisini yarating.",
                  "Token egasi «API» sahifasiga kirish huquqini yo'qotgan zahoti token ishlamay qoladi.",
                  "Bugungi ma'lumotlar kun davomida o'zgaradi: rejalar kiritiladi, odamlar kelib-ketadi. Yangi raqamlar uchun qayta so'rang.",
                  "Yopilgan kun brigadirning yopilgan yozuvidan javob beradi; ochiq kun Verifix'dan jonli javob beradi.",
                  "Pasport ma'lumotlari va JShShIR hech qachon qaytarilmaydi."],
    },
    "uz_cyrl": {
        "title": "Safia IMS — ташқи API қўлланмаси",
        "subtitle": "Фақат ўқиш учун: ячейкалар, режалар, SKU ва давомат",
        "h_what": "Бу нима",
        "what": "Фақат ўқиш учун учта сўров ишлаб чиқариш ячейкаларини, ҳар бир ячейканинг сана "
                "бўйича режаси ва SKU рўйхатини ҳамда ходимларнинг сана бўйича келиш ва кетиш "
                "вақтларини қайтаради. Бу API орқали ҳеч нарсани ўзгартириб бўлмайди. "
                "Жавоблар JSON форматида келади.",
        "h_token": "Токенни қандай олиш",
        "token": ["Safia IMS'да «API» саҳифасини очинг.",
                  "«Токен яратиш» тугмасини босинг, уни ишлатадиган тизим номи билан номланг ва амал қилиш муддатини танланг.",
                  "Токенни дарҳол нусхалаб олинг: у фақат бир марта кўрсатилади, қайта ўқиб бўлмайди.",
                  "Уни парол каби сақланг. Агар у ошкор бўлса, шу саҳифада бекор қилинг ва янгисини яратинг."],
        "h_call": "Сўровни қандай юбориш",
        "base": f"Асосий манзил: {BASE_URL}",
        "header": "Токенни ҳар бир сўровда «Authorization: Bearer <токен>» сарлавҳасида юборинг. Мисол:",
        "h_params": "Параметрлар",
        "cols_p": ["Параметр", "Қиймат", "Маъноси"],
        "p_date": "Кун. Кўрсатилмаса = бугун (Тошкент вақти). Тунги смена ўзи бошланган кунга тегишли.",
        "p_cell": "Битта ячейканинг Verifix коди. Кўрсатилмаса = барча ячейкалар. /cells уни қабул қилмайди.",
        "cols_f": ["Майдон", "Тури", "Маъноси"],
        "cells": "Шу куни амалда бўлган ва SAP коди бор ячейкалар.",
        "production": "Ҳар бир ячейканинг шу кунги режаси ва SKU рўйхати. Рўйхатда фақат шу куни режаси ёки факти бор SKU бўлади.",
        "sku_cap": "«skus» нинг ҳар бир элементи",
        "attendance": "Ҳар бир ячейканинг ходимлари ва уларнинг вақтлари. Вақт шундай кўринади: 2026-11-09T07:53+05:00.",
        "f_code": "Ячейканинг Verifix коди — ячейканинг ҳамма жойдаги калити.",
        "f_sap": "SAP иш маркази. Ягона эмас: битта код бир нечта ячейкада бўлиши мумкин.",
        "f_group": "Битта SAP кодидаги ячейкаларни ажратувчи ҳарф; ячейкада бўлмаса null.",
        "f_leader": "Ячейканинг шу кунги лидери.",
        "f_brigadir": "Ячейка шу куни кимнинг бўлинмасида турган бўлса, ўша бригадир.",
        "f_shift": "Бўлинманинг сменаси.",
        "f_same": "/cells даги каби.",
        "f_plan_min": "Ячейканинг шу кунги режадаги иши, дақиқаларда. null = ячейкага режа етиб келмаган (бу ноль эмас).",
        "f_fact_min": "Бажарилган иш, дақиқаларда.",
        "f_skus": "Ячейканинг шу кунги SKU рўйхати (кейинги жадвалга қаранг).",
        "f_sku_sap": "Маҳсулотнинг SAP коди.",
        "f_sku_name": "Маҳсулот номи.",
        "f_sku_unit": "Ўлчов бирлиги (dona, kg ...).",
        "f_sku_plan": "Режадаги миқдор.",
        "f_sku_fact": "Ишлаб чиқарилган миқдор.",
        "f_sku_min": "Шу SKU бўйича режадаги дақиқалар.",
        "f_sku_shared": "true = қатор иш марказининг барча ячейкаларига тегишли ва ҳар бирида тўлиқ миқдори "
                        "билан кўрсатилган. Бундай қаторларни ячейкалар бўйича қўшманг.",
        "f_sku_cont": "Кунлик режага керакли контейнерлар, тури бўйича: yellow (сариқ тўртбурчак контейнер), "
                      "round (сариқ думалоқ контейнер), grey (кулранг контейнер), bucket (челак), box (сариқ яшик). "
                      "Ҳар бири {capacity, count}: capacity — нечта сиғади, SKU бирлигида; count — режа ÷ сиғим, "
                      "юқорига яхлитланган (режа бўлмаса null). Сиғими киритилмаган тур чиқмайди; {} = киритилмаган.",
        "f_workers": "Ячейка ходимлари (майдонлари қуйида).",
        "f_emp": "Ходимнинг Verifix ID рақами. Ёпилган кун учун null.",
        "f_name": "Тўлиқ исми.",
        "f_job": "Лавозими.",
        "f_in": "Келган вақти. null = (ҳали) келмаган.",
        "f_out": "Кетган вақти. null = ҳали ичкарида ёки кетиши қайд этилмаган.",
        "h_errors": "Хатолар",
        "cols_e": ["Ҳолат", "Код", "Нима қилиш керак"],
        "e_400": "Санани YYYY-MM-DD кўринишида ёзинг.",
        "e_401": "Токен кўрсатилмаган, нотўғри, муддати ўтган ёки бекор қилинган. «API» саҳифасида янгисини яратинг.",
        "e_429": "Манзилингиздан жуда кўп нотўғри токен юборилди. Ўн дақиқа кутинг.",
        "h_rules": "Қоидалар",
        "rules": ["Токен 30, 90 ёки 365 кун амал қилади ёки яратишда шундай танланса муддатсиз бўлади; муддати ўтганининг ўрнига янгисини яратинг.",
                  "Токен эгаси «API» саҳифасига кириш ҳуқуқини йўқотган заҳоти токен ишламай қолади.",
                  "Бугунги маълумотлар кун давомида ўзгаради: режалар киритилади, одамлар келиб-кетади. Янги рақамлар учун қайта сўранг.",
                  "Ёпилган кун бригадирнинг ёпилган ёзувидан жавоб беради; очиқ кун Verifix'дан жонли жавоб беради.",
                  "Паспорт маълумотлари ва ЖШШИР ҳеч қачон қайтарилмайди."],
    },
}

LANGS = tuple(_S)


def manual(lang: str) -> dict:
    """{lang, title, subtitle, blocks} — an unknown language reads Russian,
    the platform's fallback."""
    lang = lang if lang in _S else "ru"
    s = _S[lang]

    def fields(key: str, caption: str = "") -> dict:
        return {"type": "table", "columns": s["cols_f"], "caption": caption,
                "rows": [[name, typ, s[k]] for name, typ, k in _FIELDS[key]]}

    def h(text: str) -> dict:
        return {"type": "heading", "level": 1, "text": text}

    return {"lang": lang, "title": s["title"], "subtitle": s["subtitle"], "blocks": [
        h(s["h_what"]), {"type": "paragraph", "text": s["what"]},
        h(s["h_token"]), {"type": "numbered", "items": s["token"]},
        h(s["h_call"]), {"type": "paragraph", "text": s["base"]},
        {"type": "paragraph", "text": s["header"]}, {"type": "quote", "text": EXAMPLE},
        h(s["h_params"]),
        {"type": "table", "columns": s["cols_p"],
         "rows": [["date", "YYYY-MM-DD", s["p_date"]], ["cell", "9422", s["p_cell"]]]},
        h("GET /cells"), {"type": "paragraph", "text": s["cells"]}, fields("cells"),
        h("GET /production"), {"type": "paragraph", "text": s["production"]},
        fields("production"), fields("sku", s["sku_cap"]),
        h("GET /attendance"), {"type": "paragraph", "text": s["attendance"]}, fields("attendance"),
        h(s["h_errors"]),
        {"type": "table", "columns": s["cols_e"],
         "rows": [["400", "bad_date", s["e_400"]], ["401", "bad_token", s["e_401"]],
                  ["429", "throttled", s["e_429"]]]},
        h(s["h_rules"]), {"type": "bullets", "items": s["rules"]},
    ]}
