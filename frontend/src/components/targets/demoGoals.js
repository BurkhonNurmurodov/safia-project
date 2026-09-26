// Sample goals for the laboratory page — dated RELATIVE to today, so the pace
// verdicts stay meaningful whichever day the samples are loaded. Every figure
// is invented; the subjects are the plant's own so the board reads as its own.
//
// Goal and result ids are FIXED («demo-3», «demo-3-1»): a goal opens on its own
// page (/targets/<id>), and samples nobody has saved yet are rebuilt on every
// load — random ids would turn a reloaded or shared link into «not found».
import { addDays, todayISO, uid } from "../../utils/targets";

const ci = (daysAgo, value, note = "", today) => ({ id: uid(), at: addDays(today, -daysAgo), value, note });

export function buildDemoGoals(today = todayISO()) {
  const d = (n) => addDays(today, n);
  return [
    {
      id: "demo-1", category: "production", createdAt: d(-24),
      title: "Ojidaniyani 35% ga kamaytirish",
      description: "Smena bo'yicha o'rtacha kutish minutlarini kamaytirish — asosiy sabab: xomashyo kutish va smena topshiruvi.",
      owner: "Suvonov Elshod", start: d(-24), due: d(21),
      targets: [
        {
          id: "demo-1-1", title: "Smena o'rtacha kutish", type: "number", direction: "down",
          start: 62, current: 47, target: 40, unit: "daq", weight: 2, done: false, items: [],
          checkins: [ci(20, 60, "", today), ci(15, 55, "Sklad zayavkasi 1 soat oldinga", today), ci(9, 52, "", today), ci(3, 47, "Smena topshiruvi 10 daqiqaga qisqardi", today)],
        },
        {
          id: "demo-1-2", title: "Liderlar kutishni o'z vaqtida kiritishi", type: "percent", direction: "up",
          start: 70, current: 88, target: 95, unit: "", weight: 1, done: false, items: [],
          checkins: [ci(16, 78, "", today), ci(8, 84, "", today), ci(2, 88, "", today)],
        },
        {
          id: "demo-1-3", title: "Har bir toifaga mas'ul biriktirish", type: "boolean", direction: "up",
          start: 0, current: 0, target: 1, unit: "", weight: 1, done: true, items: [], checkins: [],
        },
      ],
    },
    {
      id: "demo-2", category: "quality", createdAt: d(-40),
      title: "Sifat shikoyatlarini 90% yopish",
      description: "Oy oxirigacha ochiq shikoyatlar ulushini pasaytirish va bartaraf etish muddatini 3 kunga tushirish.",
      owner: "Aripova Manzura", start: d(-40), due: d(10),
      targets: [
        {
          id: "demo-2-1", title: "Bartaraf etilgan ulushi", type: "percent", direction: "up",
          start: 72, current: 81, target: 90, unit: "", weight: 2, done: false, items: [],
          checkins: [ci(30, 74, "", today), ci(20, 77, "", today), ci(10, 80, "", today), ci(4, 81, "", today)],
        },
        {
          id: "demo-2-2", title: "Ochiq shikoyatlar", type: "number", direction: "down",
          start: 48, current: 27, target: 10, unit: "ta", weight: 1, done: false, items: [],
          checkins: [ci(28, 41, "", today), ci(14, 33, "", today), ci(5, 27, "", today)],
        },
      ],
    },
    {
      id: "demo-3", category: "people", createdAt: d(-10),
      title: "Chek-list kamera isbotiga o'tish",
      description: "Barcha 1-smena brigadalarini ilova kamerasiga o'tkazish, liderlarni o'qitish.",
      owner: "Talipova Mamura", start: d(-10), due: d(25),
      targets: [
        {
          id: "demo-3-1", title: "O'tish bosqichlari", type: "tasks", direction: "up",
          start: 0, current: 0, target: 1, unit: "", weight: 2, done: false, checkins: [],
          items: [
            { id: uid(), text: "Kamera tasklarini sozlash (13 ta)", done: true },
            { id: uid(), text: "Liderlar uchun 20 daqiqalik o'qitish", done: true },
            { id: uid(), text: "Sinov kuni (bot_from) ni belgilash", done: false },
            { id: uid(), text: "Birinchi haftaning natijasini tahlil qilish", done: false },
            { id: uid(), text: "2-smenaga kengaytirish qarori", done: false },
          ],
        },
        {
          id: "demo-3-2", title: "Muddatida topshirilgan chek-listlar", type: "percent", direction: "up",
          start: 80, current: 86, target: 98, unit: "", weight: 1, done: false, items: [],
          checkins: [ci(6, 83, "", today), ci(1, 86, "", today)],
        },
      ],
    },
    {
      id: "demo-4", category: "cost", createdAt: d(-45),
      title: "Kutish xarajatini oyiga 30 mln so'mga tushirish",
      description: "«Xarajat» sahifasidagi oylik kutish bahosi — ish haqi bo'yicha.",
      owner: "Ergashev Muxriddin", start: d(-45), due: d(15),
      targets: [
        {
          id: "demo-4-1", title: "Oylik kutish xarajati", type: "currency", direction: "down",
          start: 48000000, current: 43200000, target: 30000000, unit: "so'm", weight: 1, done: false, items: [],
          checkins: [ci(30, 46500000, "", today), ci(15, 44800000, "", today), ci(2, 43200000, "", today)],
        },
      ],
    },
    {
      id: "demo-5", category: "production", createdAt: d(-30),
      title: "SAP avto-to'ldirishni barcha brigadalarga yoyish",
      description: "Qo'lda kiritiladigan ПЛАН/ФАКТ o'rniga har kunlik fayl yuklash.",
      owner: "Xakimov Ruslan", start: d(-30), due: d(-3),
      targets: [
        {
          id: "demo-5-1", title: "Avto-to'ldirishdagi brigadalar", type: "number", direction: "up",
          start: 3, current: 9, target: 22, unit: "ta", weight: 1, done: false, items: [],
          checkins: [ci(22, 5, "", today), ci(12, 7, "", today), ci(6, 9, "Ikkita brigada katalogsiz", today)],
        },
      ],
    },
    {
      id: "demo-6", category: "people", createdAt: d(-35),
      title: "Smena vaqtlarini har bir yacheyka uchun tasdiqlash",
      description: "«Smena vaqtlari» registrida placeholder qolmasligi.",
      owner: "Raximova Kamola", start: d(-35), due: d(-5),
      targets: [
        {
          id: "demo-6-1", title: "Tasdiqlangan yacheykalar", type: "percent", direction: "up",
          start: 0, current: 100, target: 100, unit: "", weight: 1, done: false, items: [],
          checkins: [ci(25, 40, "", today), ci(15, 75, "", today), ci(7, 100, "Oxirgi 12 ta yacheyka", today)],
        },
      ],
    },
    {
      id: "demo-7", category: "safety", createdAt: d(-2),
      title: "Ish joyidagi jarohatlar — nol",
      description: "Chorak davomida bironta ham ish jarohati bo'lmasligi; har oy xavfsizlik aylanib chiqish.",
      owner: "", start: d(-2), due: d(88),
      targets: [
        {
          id: "demo-7-1", title: "Jarohatlar soni", type: "number", direction: "down",
          start: 3, current: 3, target: 0, unit: "ta", weight: 2, done: false, items: [], checkins: [],
        },
        {
          id: "demo-7-2", title: "Oylik xavfsizlik aylanishi", type: "tasks", direction: "up",
          start: 0, current: 0, target: 1, unit: "", weight: 1, done: false, checkins: [],
          items: [
            { id: uid(), text: "1-oy aylanishi", done: false },
            { id: uid(), text: "2-oy aylanishi", done: false },
            { id: uid(), text: "3-oy aylanishi", done: false },
          ],
        },
      ],
    },
  ];
}
