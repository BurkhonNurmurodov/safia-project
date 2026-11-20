// «Uskunalar» (/equipment) — the words in the four platform languages, beside
// the page (the /audit pattern). `fill(s, {n: 3})` puts the values in. Names,
// serials and codes are printed as the register holds them.
import { useLang } from "../context/LangContext";

export const fill = (s, vars) =>
  String(s ?? "").replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));

const uz = {
  title: "Uskunalar", sub: "Zavod uskunalari ro'yxati — qo'shish, tahrirlash, o'chirish",
  rowsN: "{n} ta uskuna", search: "Nomi, seriya, INV, otdel, mas'ul bo'yicha qidirish…", clear: "Tozalash",
  add: "Uskuna qo'shish", edit: "Tahrirlash", del: "O'chirish", actions: "Amallar: {name}",
  colReal: "Uskuna nomi (Real)", colDoc: "Uskuna nomi (Doc)", colSerial: "Seriya raqami", colStatus: "Holati",
  colInv: "INV-kodi", colDept: "Otdel", colBrig: "Mas'ul brigadir", colLeader: "Mas'ul lider", colCell: "Mas'ul yacheyka", colResp: "Mas'ul shaxs", colNo: "№",
  fDept: "Otdel", fStatus: "Holati", grade: "{g} toifa",
  none: "Hech narsa topilmadi", clearAll: "Filtrlarni tozalash", empty: "Ro'yxat bo'sh",
  newTitle: "Yangi uskuna", editTitle: "Uskunani tahrirlash",
  nameReq: "Kamida bitta nom kerak (Real yoki Doc)", cancel: "Bekor qilish", save: "Saqlash",
  saved: "Saqlandi", created: "Uskuna qo'shildi", deleted: "Uskuna o'chirildi", failed: "Saqlab bo'lmadi — qayta urinib ko'ring",
  delTitle: "Uskuna o'chirilsinmi?", delMsg: "«{name}» ro'yxatdan o'chiriladi. Buni qaytarib bo'lmaydi.",
  respPick: "Xodimni tanlang", respSearch: "Ism bo'yicha qidirish (Verifix)…", respTypeMore: "Kamida 2 ta harf yozing",
  respSearching: "Qidirilmoqda…", respNotFound: "Hech kim topilmadi", respMore: "Yana bor — ismni aniqroq yozing",
  respDirEmpty: "Verifix ro'yxati hali o'qilmagan", respNone: "Mas'ul shaxsni olib tashlash",
  respTyped: "Qo'lda yozilgan", respTypedHint: "Qo'lda yozilgan — Verifixdan xodimni tanlang",
  errTitle: "Ma'lumotlarni yuklab bo'lmadi", errMsg: "Server javob bermadi.", retry: "Qayta urinish",
};

const uz_cyrl = {
  title: "Ускуналар", sub: "Завод ускуналари рўйхати — қўшиш, таҳрирлаш, ўчириш",
  rowsN: "{n} та ускуна", search: "Номи, серия, INV, отдел, масъул бўйича қидириш…", clear: "Тозалаш",
  add: "Ускуна қўшиш", edit: "Таҳрирлаш", del: "Ўчириш", actions: "Амаллар: {name}",
  colReal: "Ускуна номи (Real)", colDoc: "Ускуна номи (Doc)", colSerial: "Серия рақами", colStatus: "Ҳолати",
  colInv: "INV-коди", colDept: "Отдел", colBrig: "Масъул бригадир", colLeader: "Масъул лидер", colCell: "Масъул ячейка", colResp: "Масъул шахс", colNo: "№",
  fDept: "Отдел", fStatus: "Ҳолати", grade: "{g} тоифа",
  none: "Ҳеч нарса топилмади", clearAll: "Фильтрларни тозалаш", empty: "Рўйхат бўш",
  newTitle: "Янги ускуна", editTitle: "Ускунани таҳрирлаш",
  nameReq: "Камида битта ном керак (Real ёки Doc)", cancel: "Бекор қилиш", save: "Сақлаш",
  saved: "Сақланди", created: "Ускуна қўшилди", deleted: "Ускуна ўчирилди", failed: "Сақлаб бўлмади — қайта уриниб кўринг",
  delTitle: "Ускуна ўчирилсинми?", delMsg: "«{name}» рўйхатдан ўчирилади. Буни қайтариб бўлмайди.",
  respPick: "Ходимни танланг", respSearch: "Исм бўйича қидириш (Verifix)…", respTypeMore: "Камида 2 та ҳарф ёзинг",
  respSearching: "Қидирилмоқда…", respNotFound: "Ҳеч ким топилмади", respMore: "Яна бор — исмни аниқроқ ёзинг",
  respDirEmpty: "Verifix рўйхати ҳали ўқилмаган", respNone: "Масъул шахсни олиб ташлаш",
  respTyped: "Қўлда ёзилган", respTypedHint: "Қўлда ёзилган — Verifixдан ходимни танланг",
  errTitle: "Маълумотларни юклаб бўлмади", errMsg: "Сервер жавоб бермади.", retry: "Қайта уриниш",
};

const ru = {
  title: "Оборудование", sub: "Список оборудования завода — добавление, правка, удаление",
  rowsN: "{n} ед. оборудования", search: "Поиск по названию, серии, INV, отделу, ответственному…", clear: "Очистить",
  add: "Добавить оборудование", edit: "Изменить", del: "Удалить", actions: "Действия: {name}",
  colReal: "Название (Real)", colDoc: "Название (Doc)", colSerial: "Серийный номер", colStatus: "Состояние",
  colInv: "INV-код", colDept: "Отдел", colBrig: "Отв. бригадир", colLeader: "Отв. лидер", colCell: "Отв. ячейка", colResp: "Ответственное лицо", colNo: "№",
  fDept: "Отдел", fStatus: "Состояние", grade: "Категория {g}",
  none: "Ничего не найдено", clearAll: "Сбросить фильтры", empty: "Список пуст",
  newTitle: "Новое оборудование", editTitle: "Изменить оборудование",
  nameReq: "Нужно хотя бы одно название (Real или Doc)", cancel: "Отмена", save: "Сохранить",
  saved: "Сохранено", created: "Оборудование добавлено", deleted: "Оборудование удалено", failed: "Не удалось сохранить — попробуйте ещё раз",
  delTitle: "Удалить оборудование?", delMsg: "«{name}» будет удалено из списка. Это нельзя отменить.",
  respPick: "Выберите сотрудника", respSearch: "Поиск по имени (Verifix)…", respTypeMore: "Введите хотя бы 2 буквы",
  respSearching: "Поиск…", respNotFound: "Никого не найдено", respMore: "Есть ещё — уточните имя",
  respDirEmpty: "Справочник Verifix ещё не прочитан", respNone: "Убрать ответственное лицо",
  respTyped: "Введено вручную", respTypedHint: "Введено вручную — выберите сотрудника из Verifix",
  errTitle: "Не удалось загрузить данные", errMsg: "Сервер не ответил.", retry: "Повторить",
};

const en = {
  title: "Equipment", sub: "The plant's equipment list — add, edit, delete",
  rowsN: "{n} items", search: "Search by name, serial, INV, department, owner…", clear: "Clear",
  add: "Add equipment", edit: "Edit", del: "Delete", actions: "Actions: {name}",
  colReal: "Name (Real)", colDoc: "Name (Doc)", colSerial: "Serial number", colStatus: "Condition",
  colInv: "INV code", colDept: "Department", colBrig: "Brigadir in charge", colLeader: "Leader in charge", colCell: "Cell in charge", colResp: "Responsible person", colNo: "No.",
  fDept: "Department", fStatus: "Condition", grade: "Grade {g}",
  none: "Nothing found", clearAll: "Clear filters", empty: "The list is empty",
  newTitle: "New equipment", editTitle: "Edit equipment",
  nameReq: "At least one name is needed (Real or Doc)", cancel: "Cancel", save: "Save",
  saved: "Saved", created: "Equipment added", deleted: "Equipment deleted", failed: "Could not save — try again",
  delTitle: "Delete this equipment?", delMsg: "«{name}» will be removed from the list. This cannot be undone.",
  respPick: "Pick a worker", respSearch: "Search by name (Verifix)…", respTypeMore: "Type at least 2 letters",
  respSearching: "Searching…", respNotFound: "Nobody found", respMore: "There are more — type more of the name",
  respDirEmpty: "The Verifix directory has not been read yet", respNone: "Remove the responsible person",
  respTyped: "Typed by hand", respTypedHint: "Typed by hand — pick the worker from Verifix",
  errTitle: "Could not load the data", errMsg: "The server did not answer.", retry: "Try again",
};

export const TXT = { uz, uz_cyrl, ru, en };

export function useET() {
  const { lang } = useLang();
  return TXT[lang] || TXT.uz;
}
