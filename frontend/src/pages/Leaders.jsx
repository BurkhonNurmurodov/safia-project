import { useState, useMemo, useRef, useEffect, useLayoutEffect, useCallback, memo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import ReactApexChart from "react-apexcharts";
import {
  Gauge, TrendingUp, TrendingDown, Minus, BarChart3, Trophy, ListChecks, Info,
  CheckCircle2, XCircle, ArrowDownNarrowWide, ArrowUpNarrowWide,
  AlertTriangle, Users, User, RefreshCw, Loader2, Clock, CalendarClock,
  Crown, Award, Shield, ShieldAlert, SlidersHorizontal, CalendarDays, Sparkles, Ban,
  ShieldCheck, Hourglass, Layers, X,
} from "lucide-react";
import Layout from "../components/layout/Layout";
import StyledSelect from "../components/ui/StyledSelect";
import { FilterPanel, PickFilter } from "../components/ui/ColumnFilter";
import SegmentedToggle from "../components/ui/SegmentedToggle";
import DateRangePicker from "../components/ui/DateRangePicker";
import Modal from "../components/ui/Modal";
import Button from "../components/ui/Button";
import FormField from "../components/ui/FormField";
import SearchInput from "../components/ui/SearchInput";
import { SectionHead, Th } from "../components/ui/DataTable";
import Pagination from "../components/ui/Pagination";
import EmptyState from "../components/ui/EmptyState";
import { SkeletonBlock, SkeletonChart } from "../components/ui/Skeleton";
import BotDataClear from "../components/leaders/BotDataClear";
import LateReports from "../components/leaders/LateReports";
import AiTriage, { AiCalibration } from "../components/leaders/AiTriage";
import AiRecheck from "../components/leaders/AiRecheck";
import AiProgress from "../components/leaders/AiProgress";
import { ReportPhoto, BotPhoto } from "../components/leaders/ProofPhoto";
import api from "../utils/api";
import { useAuth } from "../context/AuthContext";
import { useCapabilities } from "../hooks/useCapabilities";
import { useLang } from "../context/LangContext";
import { useTranslit } from "../utils/transliterate";
import { useChartTheme } from "../hooks/useChartTheme";
import { usePersistentState } from "../hooks/usePersistentState";

// ── score colours (tuned for the dark dashboard — softer emerald/amber/rose,
//    deliberately desaturated so they glow rather than glare against charcoal) ──
const C_BAD = "#F43F5E", C_MID = "#F59E0B", C_GOOD = "#10B981";
const C_FLAT = "#94A3B8";                           // no movement / no baseline — grey, never gold
const C_TREND = "#D4A95C";                          // brand gold — the completion line
const scoreColor = (v) => (v < 50 ? C_BAD : v < 85 ? C_MID : C_GOOD);

// hex helpers: rgba tint + lighten/darken toward white/black (for chart gradients)
const hexA = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const mix = (hex, amt) => {                          // amt > 0 → lighter, < 0 → darker
  const n = parseInt(hex.slice(1), 16);
  const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
  const ch = (s) => Math.round(((n >> s) & 255) + (t - ((n >> s) & 255)) * p);
  return `#${((1 << 24) + (ch(16) << 16) + (ch(8) << 8) + ch(0)).toString(16).slice(1)}`;
};

// premium glassy tooltip shared by every chart on the page (padding · blur · shadow)
const tipHTML = (label, val, color) => `
  <div style="padding:8px 12px;background:rgba(18,21,31,0.92);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.10);border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,0.45);">
    <div style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#9ca3af;margin-bottom:3px;">${label}</div>
    <div style="display:flex;align-items:center;gap:7px;font-size:14px;font-weight:700;color:#f5f6f8;line-height:1;">
      <span style="width:9px;height:9px;border-radius:9px;background:${color};box-shadow:0 0 8px ${color}88;"></span>${val}
    </div>
  </div>`;

// ── UI copy, all 4 platform languages ─────────────────────────────────────────
const TXT = {
  uz: {
    title: "Lider nazorati", shift1: "1-smena", shift2: "2-smena",
    tabMonitor: "Monitoring", tabClear: "Ma'lumotlarni tozalash", srcBot: "Bot orqali",
    tabLate: "Kechikkanlar", reasonLbl: "Sabab",
    pendChip: "So'rov yuborilgan", pendTitle: "Kunni ochish so'ralgan — admin qarori kutilmoqda",
    lateOkChip: "Kechikkan — qabul qilingan", lateOkTitle: "Kechikkan hisobot: {by} ochgan, kun o'z natijasi bilan hisoblanadi",
    avgSuccess: "O'rtacha muvaffaqiyat", timePeriod: "Davr", shift: "Smena",
    supervisor: "Brigadir", allSups: "Barcha brigadirlar", leader: "Lider", allLeaders: "Barcha liderlar",
    trend: "Bajarilish dinamikasi", taskTitle: "Vazifalar kesimida muvaffaqiyat",
    standing: "Liderlar reytingi", supStanding: "Brigadirlar reytingi",
    toggleLeader: "Lider", toggleSup: "Brigadir",
    standRating: "Reyting", standConsist: "Barqarorlik",
    thPlace: "O'rin", thDays: "Yuborilgan kun", thTier: "Daraja",
    tierTop: "Chempion", tierGood: "A'lo", tierMid: "O'rta", tierBad: "Past",
    supSearchPh: "Brigadir qidirish…",
    standInfo: "Reyting — davrning HAR BIR kuni uchun ball: hisobot yuborilmagan kun 0% hisoblanadi. Barqarorlik — o'sha kunlarning qanchasida umuman hisobot yuborilgani, foizda. Hisob oynasi — tanlangan davr to'liq, birinchi hisobotdan emas. Shu sababli reyting hech qachon barqarorlikdan yuqori bo'lmaydi.\n\nTanlangan ustun — asosiy reyting, ikkinchisi esa qo'shimcha reyting: teng natijalar aynan shu bo'yicha ajratiladi. O'rin faqat ikkala ko'rsatkich ham teng bo'lgandagina bo'lishiladi.\n\nTrend — O'RINNING o'zgarishi, foizning emas: avvalgi davrda 57-o'rin, hozir 47-o'rin bo'lsa — +10 (ko'tarilish yashil, tushish qizil, joyida qolish 0). Solishtirish xuddi shu uzunlikdagi avvalgi davr bilan va ro'yxat ayni paytda saralanayotgan ustun bo'yicha bo'ladi. Chiziq — o'sha o'rinning kunlar kesimidagi harakati (kamida 7 kun): har bir nuqta — davr o'sha kuni tugaganida chiqadigan o'rin, shuning uchun chiziqning oxiri qatordagi o'rinning o'zi. Avvalgi davrda umuman ma'lumot bo'lmasa — «Yangi».",
    standPrimaryHint: "Asosiy reyting — ro'yxat shu ustun bo'yicha saralanadi",
    standSubHint: "Qo'shimcha reyting — asosiy ustun teng chiqqanda o'rinni shu ajratadi",
    thTrend: "Trend",
    trendHint: "O'rin o'zgarishi — xuddi shu uzunlikdagi avvalgi davrga nisbatan: 57-o'rindan 47-o'ringa ko'tarilish +10; chiziq — kunlar kesimidagi o'rin",
    trendVsPrev: "Avvalgi davrga nisbatan o'rin",
    trendNoPrev: "Avvalgi davr uchun ma'lumot yo'q",
    trendNew: "Yangi",
    trendNewHint: "Avvalgi davrda umuman ma'lumot yo'q — reytingda yangi",
    tierEdit: "Daraja chegaralari", tierEditSub: "Barcha foydalanuvchilar uchun amal qiladi",
    tierEditRow: "% va undan yuqori",
    tierEditHint: "Chegaralar ro'yxat saralanayotgan ustunga (Reyting yoki Barqarorlik) qo'llanadi. Eng past chegaradan pastda qolganlar — «Past».",
    tierEditOrder: "Chegaralar kamayib borishi kerak: Chempion > A'lo > O'rta.",
    save: "Saqlash", cancel: "Bekor qilish",
    winLabel: "Hisob oynasi", daysSent: "Yuborilgan", daysMissed: "O'tkazib yuborilgan",
    hmTitle: "Kunlar kalendari", hmNoSync: "Ma'lumot hali kelmagan",
    tableTitle: "Oxirgi hisobotlar (past ko'rsatkich birinchi)",
    thDate: "Sana", thLeader: "Lider", thScore: "Natija", thFailed: "Xatolar", thAction: "Harakat",
    thSubmitted: "Yuborilgan", lateTitle: "Hisobot kunidan keyin yuborilgan", dayAbbr: "kun", shiftAbbr: "smena",
    voidChip: "Vaqtdan tashqari",
    voidTitle: "1-smena: hisobot o'z kunida 08:00–20:00 oralig'ida yuborilishi kerak — bu hisobot qabul qilinmadi va kun 0% hisoblanadi",
    aiTitle: "AI tekshiruvi",
    aiCheck: "Tekshirish",
    aiOk: "Tasdiqlandi",
    aiFlagged: "Shubhali",
    aiPending: "Navbatda",
    aiError: "Tekshirib bo'lmadi",
    aiImgDate: "Rasmdagi sana",
    aiExpected: "Ruxsat etilgan oyna",
    aiFdate_mismatch: "Sana mos emas",
    aiFno_date: "Rasmda sana yo'q",
    aiFoff_topic: "Rasm vazifaga mos emas",
    aiFnot_proven: "Bajarilgani ko'rinmayapti",
    aiFunreadable: "Rasm o'qilmadi",
    aiRowBadge: "AI shubhali deb belgilagan vazifalar",
    aiQueued: "AI tekshiruvi navbatda",
    aiRun: "AI tekshiruvi",
    aiRecheckOne: "Bu vazifani qaytadan tekshirish",
    aiRunning: "Tekshirilmoqda…",
    aiFlagsN: "shubhali",
    aiPendingN: "navbatda",
    aiNote: "AI xulosasi — yordamchi belgi, yakuniy hukm emas.",
    tabAi: "AI tekshiruvi",
    aiBall: "Hammasi", aiB_forged: "Soxta dalil", aiB_undone: "Bajarilmagan",
    aiB_date: "Sana", aiB_tech: "Texnik",
    aiBt_forged: "Ham vaqti noto'g'ri, ham bajarilgani ko'rinmaydi",
    aiBt_undone: "Vaqti to'g'ri, lekin ish ko'rinmaydi",
    aiBt_date: "Ish ko'rinadi, lekin rasm boshqa kundan",
    aiBt_tech: "Rasmni o'qib bo'lmadi — server muammosi, liderning aybi emas",
    aiQueue: "Navbat", aiPhotoN: "rasm", aiNoPhoto: "Rasm topilmadi",
    aiZoom: "Rasmni kattalashtirish",
    aiQ_read: "Sana o'qildi", aiQ_window: "Ruxsat etilgan oynada",
    aiQ_match: "Rasm vazifaga mos", aiQ_done: "Bajarilgani ko'rinadi",
    aiWhy: "Nima uchun", aiLeaderSaid: "Lider izohi",
    aiCriteria: "O'lchov mezoni", aiNoCriteria: "Mezon yozilmagan — faqat sana tekshirildi.",
    aiAct_approved: "Dalil to'g'ri", aiAct_rejected: "Rad etish",
    aiAct_requeried: "Qayta so'rash",
    aiActHint: "Rad etilsa — vazifa shu kun uchun bajarilmagan deb hisoblanadi va liderga xabar boradi. «Qayta so'rash» bahoni o'zgartirmaydi.",
    aiUndo: "Qaytarish", aiKeys: "Tugmalar", aiKeyMove: "navbat bo'ylab",
    aiKeySkip: "keyinroq", aiKeyZoom: "kattalashtirish",
    aiPrev: "Oldingi", aiNext: "Keyingi",
    aiDoneTitle: "Navbat bo'sh",
    aiDoneBody: "Barcha shubhali dalillar ko'rib chiqildi. Yangi hisobotlar kelganda navbat o'zi to'ladi.",
    aiFlag: "Belgi", aiFAllFlags: "Barcha belgilar", aiFAllTasks: "Barcha vazifalar",
    aiF_off_topic: "Rasm boshqa narsa haqida", aiF_not_proven: "Bajarilgani ko'rinmaydi",
    aiF_date_mismatch: "Sana oynadan tashqarida", aiF_no_date: "Rasmda sana yo'q",
    aiF_unreadable: "Rasm o'qilmadi",
    aiNoMatchTitle: "Bu filtrlarga mos qator yo'q",
    aiNoMatchBody: "Navbatda boshqa qatorlar bor — filtrlarni kengaytiring.",
    aiClearFlt: "Filtrlarni tozalash",
    aiScanCap: "Belgilar juda ko'p — sanoqlar eng kam qiymatni ko'rsatadi. Sana oralig'ini torroq oling.",
    aiOffTitle: "AI tekshiruvi yoqilmagan",
    aiKeyLabel: "Gemini API kaliti",
    aiKeySave: "Saqlash va yoqish", aiKeyClear: "O'chirish",
    aiKeyShow: "Ko'rsatish", aiKeyHide: "Yashirish",
    aiKeySaved: "Kalit saqlandi — tekshiruv boshlandi",
    aiKeyCleared: "Kalit o'chirildi — bo'lim yana o'chiq",
    aiKeyHint: "Kalit shifrlanadi (SECRET_KEY bilan) va bazaning nusxasida ham o'qib bo'lmaydi. Faqat adminlar ko'ra oladi.",
    aiKeyEnvPinned: "Kalit serverdagi backend/.env faylida belgilangan — u ustun turadi va faqat o'sha yerda o'zgartiriladi.",
    aiOffBody: "Bu bo'lim ishlashi uchun Gemini API kaliti kerak. Kalitni Google AI Studio'dan oling va shu yerga qo'ying — u shifrlangan holda saqlanadi va boshqa hech qachon ko'rsatilmaydi.",
    aiCalTip: "AI bilan rozilik darajasi: siz tasdiqlagan belgilar ulushi va ko'rib chiqilgan belgilar soni",
    aiRejChip: "AI dalili rad etildi",
    notAsked: "So'ralmagan", submittedAt: "Yuborilgan",
    details: "Batafsil", missed: "ta vazifa bajarilmadi", modalTitle: "Hisobot tafsilotlari",
    noIssues: "Muammo aniqlanmadi.", noReason: "Xatolik sababi ko'rsatilmagan.",
    fltIssues: "Muammolar", sumDone: "bajarildi", sumFailed: "bajarilmadi",
    ovTitle: "Admin bahosi", ovDone: "Bajarildi", ovFail: "Bajarilmadi",
    ovChip: "Admin", ovUndo: "Belgini olib tashlash — liderning o'z javobi qaytadi",
    missedDeadline: "Lider bu vazifani soat {time} gacha topshirmadi.",
    task: "Vazifa", noData: "Ma'lumot yo'q", taskInfoTitle: "Vazifalar mazmuni va talablari",
    taskDesc: "Vazifa tavsifi", taskWeight: "Vazni", taskNote: "Eslatma / Talablar",
    lowTask: "Eng past vazifa", lowSup: "Eng past brigadir", lowLeader: "Eng past lider",
    tipAvg: "Barcha liderlar reytingining o'rtachasi: davrning HAR BIR kuni hisobga olinadi, hisobot yuborilmagan kun 0%",
    tipLowTask: "Davr ichida eng kam bajarilgan vazifa: hisobot yuborilmagan kun ham bajarilmagan hisoblanadi",
    tipLowSup: "Reyting bo'yicha eng past brigadir",
    tipLowLeader: "Reyting bo'yicha eng past lider",
    searchPh: "Lider qidirish…", bandAll: "Barchasi", noMatch: "Filtrlarga mos hisobot yo'q",
    refresh: "Yangilash", refreshing: "Yangilanmoqda…", refreshed: "Yangilandi",
    lastSynced: "Oxirgi yangilanish", never: "hech qachon",
    photoFailed: "Rasm yuklanmadi", retry: "Qayta urinish",
  },
  uz_cyrl: {
    title: "Лидер назорати", shift1: "1-смена", shift2: "2-смена",
    tabMonitor: "Мониторинг", tabClear: "Маълумотларни тозалаш", srcBot: "Бот орқали",
    tabLate: "Кечикканлар", reasonLbl: "Сабаб",
    pendChip: "Сўров юборилган", pendTitle: "Кунни очиш сўралган — админ қарори кутилмоқда",
    lateOkChip: "Кечиккан — қабул қилинган", lateOkTitle: "Кечиккан ҳисобот: {by} очган, кун ўз натижаси билан ҳисобланади",
    avgSuccess: "Ўртача муваффақият", timePeriod: "Давр", shift: "Смена",
    supervisor: "Бригадир", allSups: "Барча бригадирлар", leader: "Лидер", allLeaders: "Барча лидерлар",
    trend: "Бажарилиш динамикаси", taskTitle: "Вазифалар кесимида муваффақият",
    standing: "Лидерлар рейтинги", supStanding: "Бригадирлар рейтинги",
    toggleLeader: "Лидер", toggleSup: "Бригадир",
    standRating: "Рейтинг", standConsist: "Барқарорлик",
    thPlace: "Ўрин", thDays: "Юборилган кун", thTier: "Даража",
    tierTop: "Чемпион", tierGood: "Аъло", tierMid: "Ўрта", tierBad: "Паст",
    supSearchPh: "Бригадир қидириш…",
    standInfo: "Рейтинг — даврнинг ҲАР БИР куни учун балл: ҳисобот юборилмаган кун 0% ҳисобланади. Барқарорлик — ўша кунларнинг қанчасида умуман ҳисобот юборилгани, фоизда. Ҳисоб ойнаси — танланган давр тўлиқ, биринчи ҳисоботдан эмас. Шу сабабли рейтинг ҳеч қачон барқарорликдан юқори бўлмайди.\n\nТанланган устун — асосий рейтинг, иккинчиси эса қўшимча рейтинг: тенг натижалар айнан шу бўйича ажратилади. Ўрин фақат иккала кўрсаткич ҳам тенг бўлгандагина бўлишилади.\n\nТренд — ЎРИННИНГ ўзгариши, фоизнинг эмас: аввалги даврда 57-ўрин, ҳозир 47-ўрин бўлса — +10 (кўтарилиш яшил, тушиш қизил, жойида қолиш 0). Солиштириш худди шу узунликдаги аввалги давр билан ва рўйхат айни пайтда саралаётган устун бўйича бўлади. Чизиқ — ўша ўриннинг кунлар кесимидаги ҳаракати (камида 7 кун): ҳар бир нуқта — давр ўша куни тугаганида чиқадиган ўрин, шунинг учун чизиқнинг охири қатордаги ўриннинг ўзи. Аввалги даврда умуман маълумот бўлмаса — «Янги».",
    standPrimaryHint: "Асосий рейтинг — рўйхат шу устун бўйича сараланади",
    standSubHint: "Қўшимча рейтинг — асосий устун тенг чиққанда ўринни шу ажратади",
    thTrend: "Тренд",
    trendHint: "Ўрин ўзгариши — худди шу узунликдаги аввалги даврга нисбатан: 57-ўриндан 47-ўринга кўтарилиш +10; чизиқ — кунлар кесимидаги ўрин",
    trendVsPrev: "Аввалги даврга нисбатан ўрин",
    trendNoPrev: "Аввалги давр учун маълумот йўқ",
    trendNew: "Янги",
    trendNewHint: "Аввалги даврда умуман маълумот йўқ — рейтингда янги",
    tierEdit: "Даража чегаралари", tierEditSub: "Барча фойдаланувчилар учун амал қилади",
    tierEditRow: "% ва ундан юқори",
    tierEditHint: "Чегаралар рўйхат сараланаётган устунга (Рейтинг ёки Барқарорлик) қўлланади. Энг паст чегарадан пастда қолганлар — «Паст».",
    tierEditOrder: "Чегаралар камайиб бориши керак: Чемпион > Аъло > Ўрта.",
    save: "Сақлаш", cancel: "Бекор қилиш",
    winLabel: "Ҳисоб ойнаси", daysSent: "Юборилган", daysMissed: "Ўтказиб юборилган",
    hmTitle: "Кунлар календари", hmNoSync: "Маълумот ҳали келмаган",
    tableTitle: "Охирги ҳисоботлар (паст кўрсаткич биринчи)",
    thDate: "Сана", thLeader: "Лидер", thScore: "Натижа", thFailed: "Хатолар", thAction: "Ҳаракат",
    thSubmitted: "Юборилган", lateTitle: "Ҳисобот кунидан кейин юборилган", dayAbbr: "кун", shiftAbbr: "смена",
    voidChip: "Вақтдан ташқари",
    voidTitle: "1-смена: ҳисобот ўз кунида 08:00–20:00 оралиғида юборилиши керак — бу ҳисобот қабул қилинмади ва кун 0% ҳисобланади",
    aiTitle: "AI текшируви",
    aiCheck: "Текшириш",
    aiOk: "Тасдиқланди",
    aiFlagged: "Шубҳали",
    aiPending: "Навбатда",
    aiError: "Текшириб бўлмади",
    aiImgDate: "Расмдаги сана",
    aiExpected: "Рухсат этилган ойна",
    aiFdate_mismatch: "Сана мос эмас",
    aiFno_date: "Расмда сана йўқ",
    aiFoff_topic: "Расм вазифага мос эмас",
    aiFnot_proven: "Бажарилгани кўринмаяпти",
    aiFunreadable: "Расм ўқилмади",
    aiRowBadge: "AI шубҳали деб белгилаган вазифалар",
    aiQueued: "AI текшируви навбатда",
    aiRun: "AI текшируви",
    aiRecheckOne: "Бу вазифани қайтадан текшириш",
    aiRunning: "Текширилмоқда…",
    aiFlagsN: "шубҳали",
    aiPendingN: "навбатда",
    aiNote: "AI хулосаси — ёрдамчи белги, якуний ҳукм эмас.",
    tabAi: "AI текшируви",
    aiBall: "Ҳаммаси", aiB_forged: "Сохта далил", aiB_undone: "Бажарилмаган",
    aiB_date: "Сана", aiB_tech: "Техник",
    aiBt_forged: "Ҳам вақти нотўғри, ҳам бажарилгани кўринмайди",
    aiBt_undone: "Вақти тўғри, лекин иш кўринмайди",
    aiBt_date: "Иш кўринади, лекин расм бошқа кундан",
    aiBt_tech: "Расмни ўқиб бўлмади — сервер муаммоси, лидернинг айби эмас",
    aiQueue: "Навбат", aiPhotoN: "расм", aiNoPhoto: "Расм топилмади",
    aiZoom: "Расмни катталаштириш",
    aiQ_read: "Сана ўқилди", aiQ_window: "Рухсат этилган ойнада",
    aiQ_match: "Расм вазифага мос", aiQ_done: "Бажарилгани кўринади",
    aiWhy: "Нима учун", aiLeaderSaid: "Лидер изоҳи",
    aiCriteria: "Ўлчов мезони", aiNoCriteria: "Мезон ёзилмаган — фақат сана текширилди.",
    aiAct_approved: "Далил тўғри", aiAct_rejected: "Рад этиш",
    aiAct_requeried: "Қайта сўраш",
    aiActHint: "Рад этилса — вазифа шу кун учун бажарилмаган деб ҳисобланади ва лидерга хабар боради. «Қайта сўраш» баҳони ўзгартирмайди.",
    aiUndo: "Қайтариш", aiKeys: "Тугмалар", aiKeyMove: "навбат бўйлаб",
    aiKeySkip: "кейинроқ", aiKeyZoom: "катталаштириш",
    aiPrev: "Олдинги", aiNext: "Кейинги",
    aiDoneTitle: "Навбат бўш",
    aiDoneBody: "Барча шубҳали далиллар кўриб чиқилди. Янги ҳисоботлар келганда навбат ўзи тўлади.",
    aiFlag: "Белги", aiFAllFlags: "Барча белгилар", aiFAllTasks: "Барча вазифалар",
    aiF_off_topic: "Расм бошқа нарса ҳақида", aiF_not_proven: "Бажарилгани кўринмайди",
    aiF_date_mismatch: "Сана ойнадан ташқарида", aiF_no_date: "Расмда сана йўқ",
    aiF_unreadable: "Расм ўқилмади",
    aiNoMatchTitle: "Бу филтрларга мос қатор йўқ",
    aiNoMatchBody: "Навбатда бошқа қаторлар бор — филтрларни кенгайтиринг.",
    aiClearFlt: "Филтрларни тозалаш",
    aiScanCap: "Белгилар жуда кўп — саноқлар энг кам қийматни кўрсатади. Сана оралиғини торроқ олинг.",
    aiOffTitle: "AI текшируви ёқилмаган",
    aiKeyLabel: "Gemini API калити",
    aiKeySave: "Сақлаш ва ёқиш", aiKeyClear: "Ўчириш",
    aiKeyShow: "Кўрсатиш", aiKeyHide: "Яшириш",
    aiKeySaved: "Калит сақланди — текширув бошланди",
    aiKeyCleared: "Калит ўчирилди — бўлим яна ўчиқ",
    aiKeyHint: "Калит шифрланади (SECRET_KEY билан) ва базанинг нусхасида ҳам ўқиб бўлмайди. Фақат админлар кўра олади.",
    aiKeyEnvPinned: "Калит сервердаги backend/.env файлида белгиланган — у устун туради ва фақат ўша ерда ўзгартирилади.",
    aiOffBody: "Бу бўлим ишлаши учун Gemini API калити керак. Калитни Google AI Studio'дан олинг ва шу ерга қўйинг — у шифрланган ҳолда сақланади ва бошқа ҳеч қачон кўрсатилмайди.",
    aiCalTip: "AI билан розилик даражаси: сиз тасдиқлаган белгилар улуши ва кўриб чиқилган белгилар сони",
    aiRejChip: "AI далили рад этилди",
    notAsked: "Сўралмаган", submittedAt: "Юборилган",
    details: "Батафсил", missed: "та вазифа бажарилмади", modalTitle: "Ҳисобот тафсилотлари",
    noIssues: "Муаммо аниқланмади.", noReason: "Хатолик сабаби кўрсатилмаган.",
    fltIssues: "Муаммолар", sumDone: "бажарилди", sumFailed: "бажарилмади",
    ovTitle: "Админ баҳоси", ovDone: "Бажарилди", ovFail: "Бажарилмади",
    ovChip: "Админ", ovUndo: "Белгини олиб ташлаш — лидернинг ўз жавоби қайтади",
    missedDeadline: "Лидер бу вазифани соат {time} гача топширмади.",
    task: "Вазифа", noData: "Маълумот йўқ", taskInfoTitle: "Вазифалар мазмуни ва талаблари",
    taskDesc: "Вазифа тавсифи", taskWeight: "Вазни", taskNote: "Эслатма / Талаблар",
    lowTask: "Энг паст вазифа", lowSup: "Энг паст бригадир", lowLeader: "Энг паст лидер",
    tipAvg: "Барча лидерлар рейтингининг ўртачаси: даврнинг ҲАР БИР куни ҳисобга олинади, ҳисобот юборилмаган кун 0%",
    tipLowTask: "Давр ичида энг кам бажарилган вазифа: ҳисобот юборилмаган кун ҳам бажарилмаган ҳисобланади",
    tipLowSup: "Рейтинг бўйича энг паст бригадир",
    tipLowLeader: "Рейтинг бўйича энг паст лидер",
    searchPh: "Лидер қидириш…", bandAll: "Барчаси", noMatch: "Филтрларга мос ҳисобот йўқ",
    refresh: "Янгилаш", refreshing: "Янгиланмоқда…", refreshed: "Янгиланди",
    lastSynced: "Охирги янгиланиш", never: "ҳеч қачон",
    photoFailed: "Расм юкланмади", retry: "Қайта уриниш",
  },
  ru: {
    title: "Контроль лидеров", shift1: "Смена 1", shift2: "Смена 2",
    tabMonitor: "Мониторинг", tabClear: "Очистка данных", srcBot: "Из бота",
    tabLate: "Опоздавшие", reasonLbl: "Причина",
    pendChip: "Запрос отправлен", pendTitle: "Запрошено открытие дня — ждём решения администратора",
    lateOkChip: "Опоздал — засчитан", lateOkTitle: "Опоздавший отчёт: открыл(а) {by}, день засчитан со своим результатом",
    avgSuccess: "Средний успех", timePeriod: "Период", shift: "Смена",
    supervisor: "Бригадир", allSups: "Все бригадиры", leader: "Лидер", allLeaders: "Все лидеры",
    trend: "Тренд выполнения", taskTitle: "Успех по задачам",
    standing: "Рейтинг лидеров", supStanding: "Рейтинг бригадиров",
    toggleLeader: "Лидер", toggleSup: "Бригадир",
    standRating: "Рейтинг", standConsist: "Стабильность",
    thPlace: "Место", thDays: "Сдано дней", thTier: "Уровень",
    tierTop: "Чемпион", tierGood: "Отлично", tierMid: "Средне", tierBad: "Низко",
    supSearchPh: "Поиск бригадира…",
    standInfo: "Рейтинг — балл за КАЖДЫЙ день периода: день без отчёта считается за 0%. Стабильность — доля этих дней, за которые отчёт вообще сдан. Окно расчёта — весь выбранный период, а не с первого отчёта. Поэтому рейтинг никогда не бывает выше стабильности.\n\nВыбранная вкладка — основной рейтинг, вторая колонка — подрейтинг: именно она разводит равные результаты. Место делится только тогда, когда совпали оба показателя.\n\nТренд — изменение МЕСТА, а не процента: было 57-е место, стало 47-е — это +10 (подъём зелёный, падение красное, без движения — 0). Сравнение идёт с предыдущим периодом той же длины и по той колонке, по которой список отсортирован сейчас. Линия — движение этого места по дням (не меньше 7 дней): каждая точка — место, которое вышло бы, если бы период закончился в этот день, поэтому конец линии равен месту в строке. Если за предыдущий период данных нет вообще — «Новый».",
    standPrimaryHint: "Основной рейтинг — список сортируется по этой колонке",
    standSubHint: "Подрейтинг — разводит места при равенстве в основной колонке",
    thTrend: "Тренд",
    trendHint: "Изменение МЕСТА к предыдущему периоду той же длины: с 57-го на 47-е — это +10; линия — место по дням",
    trendVsPrev: "Место к предыдущему периоду",
    trendNoPrev: "Нет данных за предыдущий период",
    trendNew: "Новый",
    trendNewHint: "За предыдущий период данных нет вообще — новый в рейтинге",
    tierEdit: "Границы уровней", tierEditSub: "Действуют для всех пользователей",
    tierEditRow: "% и выше",
    tierEditHint: "Границы применяются к тому столбцу, по которому отсортирован список (Рейтинг или Стабильность). Всё, что ниже последней границы, — «Низко».",
    tierEditOrder: "Границы должны убывать: Чемпион > Отлично > Средне.",
    save: "Сохранить", cancel: "Отмена",
    winLabel: "Окно расчёта", daysSent: "Сдано", daysMissed: "Пропущено",
    hmTitle: "Календарь дней", hmNoSync: "Данные ещё не поступили",
    tableTitle: "Последние отчёты (сначала низкий балл)",
    thDate: "Дата", thLeader: "Лидер", thScore: "Балл", thFailed: "Пропущено", thAction: "Действие",
    thSubmitted: "Отправлено", lateTitle: "Отправлено позже отчётного дня", dayAbbr: "дн.", shiftAbbr: "смена",
    voidChip: "Вне окна",
    voidTitle: "1-я смена: отчёт должен быть отправлен в свой день с 08:00 до 20:00 — этот отчёт не засчитан, день считается за 0%",
    aiTitle: "Проверка ИИ",
    aiCheck: "Проверить",
    aiOk: "Подтверждено",
    aiFlagged: "Сомнительно",
    aiPending: "В очереди",
    aiError: "Проверить не удалось",
    aiImgDate: "Дата на фото",
    aiExpected: "Допустимое окно",
    aiFdate_mismatch: "Дата не совпадает",
    aiFno_date: "На фото нет даты",
    aiFoff_topic: "Фото не по задаче",
    aiFnot_proven: "Выполнение не видно",
    aiFunreadable: "Фото не читается",
    aiRowBadge: "Задачи, отмеченные ИИ как сомнительные",
    aiQueued: "Ожидает проверки ИИ",
    aiRun: "Проверка ИИ",
    aiRecheckOne: "Проверить эту задачу заново",
    aiRunning: "Проверяется…",
    aiFlagsN: "сомнительных",
    aiPendingN: "в очереди",
    aiNote: "Вывод ИИ — подсказка, а не окончательное решение.",
    tabAi: "Проверка ИИ",
    aiBall: "Все", aiB_forged: "Подделка", aiB_undone: "Не выполнено",
    aiB_date: "Дата", aiB_tech: "Технические",
    aiBt_forged: "И время не то, и выполнение не видно",
    aiBt_undone: "Время верное, но работы не видно",
    aiBt_date: "Работа видна, но фото с другого дня",
    aiBt_tech: "Фото не удалось прочитать — проблема сервера, а не лидера",
    aiQueue: "Очередь", aiPhotoN: "фото", aiNoPhoto: "Фото не найдено",
    aiZoom: "Увеличить фото",
    aiQ_read: "Дата прочитана", aiQ_window: "В допустимом окне",
    aiQ_match: "Фото по задаче", aiQ_done: "Выполнение видно",
    aiWhy: "Почему", aiLeaderSaid: "Комментарий лидера",
    aiCriteria: "Критерий оценки", aiNoCriteria: "Критерий не задан — проверялась только дата.",
    aiAct_approved: "Фото верное", aiAct_rejected: "Отклонить",
    aiAct_requeried: "Запросить заново",
    aiActHint: "При отклонении задача засчитывается как невыполненная за этот день, и лидер получает уведомление. «Запросить заново» оценку не меняет.",
    aiUndo: "Отменить", aiKeys: "Клавиши", aiKeyMove: "по очереди",
    aiKeySkip: "позже", aiKeyZoom: "увеличить",
    aiPrev: "Предыдущий", aiNext: "Следующий",
    aiDoneTitle: "Очередь пуста",
    aiDoneBody: "Все сомнительные подтверждения разобраны. Очередь наполнится сама, когда придут новые отчёты.",
    aiFlag: "Признак", aiFAllFlags: "Все признаки", aiFAllTasks: "Все задачи",
    aiF_off_topic: "Фото не о том", aiF_not_proven: "Выполнение не видно",
    aiF_date_mismatch: "Дата вне окна", aiF_no_date: "На фото нет даты",
    aiF_unreadable: "Фото не прочиталось",
    aiNoMatchTitle: "Под эти фильтры ничего не подошло",
    aiNoMatchBody: "В очереди есть другие строки — расширьте фильтры.",
    aiClearFlt: "Сбросить фильтры",
    aiScanCap: "Флагов слишком много — счётчики показывают минимум. Сузьте период.",
    aiOffTitle: "Проверка ИИ не включена",
    aiKeyLabel: "API-ключ Gemini",
    aiKeySave: "Сохранить и включить", aiKeyClear: "Удалить",
    aiKeyShow: "Показать", aiKeyHide: "Скрыть",
    aiKeySaved: "Ключ сохранён — проверка запущена",
    aiKeyCleared: "Ключ удалён — раздел снова выключен",
    aiKeyHint: "Ключ шифруется (на SECRET_KEY) и остаётся нечитаемым даже в выгрузке базы. Виден только администраторам.",
    aiKeyEnvPinned: "Ключ задан в backend/.env на сервере — он имеет приоритет и меняется только там.",
    aiOffBody: "Для работы раздела нужен API-ключ Gemini. Получите его в Google AI Studio и вставьте здесь — он сохранится в зашифрованном виде и больше нигде не показывается.",
    aiCalTip: "Согласие с ИИ: доля подтверждённых вами меток и число разобранных меток",
    aiRejChip: "Подтверждение отклонено",
    notAsked: "Не задавалась", submittedAt: "Отправлено",
    details: "Детали", missed: "задач пропущено", modalTitle: "Детали отчёта",
    noIssues: "Проблем не выявлено.", noReason: "Причина не указана.",
    fltIssues: "Проблемы", sumDone: "выполнено", sumFailed: "не выполнено",
    ovTitle: "Оценка админа", ovDone: "Выполнено", ovFail: "Не выполнено",
    ovChip: "Админ", ovUndo: "Снять отметку — вернётся собственный ответ лидера",
    missedDeadline: "Лидер не отправил эту задачу до {time}.",
    task: "Задача", noData: "Нет данных", taskInfoTitle: "Содержание и требования задач",
    taskDesc: "Описание задачи", taskWeight: "Вес", taskNote: "Примечания / Требования",
    lowTask: "Худшая задача", lowSup: "Худший бригадир", lowLeader: "Худший лидер",
    tipAvg: "Средний рейтинг всех лидеров: считается КАЖДЫЙ день периода, день без отчёта — 0%",
    tipLowTask: "Наименее выполняемая задача за период: день без отчёта тоже считается невыполненным",
    tipLowSup: "Бригадир с наименьшим рейтингом",
    tipLowLeader: "Лидер с наименьшим рейтингом",
    searchPh: "Поиск лидера…", bandAll: "Все", noMatch: "Нет отчётов под фильтры",
    refresh: "Обновить", refreshing: "Обновление…", refreshed: "Обновлено",
    lastSynced: "Обновлено", never: "никогда",
    photoFailed: "Не удалось загрузить фото", retry: "Повторить",
  },
  en: {
    title: "Leader Monitoring", shift1: "Shift 1", shift2: "Shift 2",
    tabMonitor: "Monitoring", tabClear: "Clear data", srcBot: "Filed in bot",
    tabLate: "Late reports", reasonLbl: "Reason",
    pendChip: "Request sent", pendTitle: "Opening this day was requested — awaiting an admin decision",
    lateOkChip: "Late — accepted", lateOkTitle: "Late report: opened by {by}; the day counts at its own score",
    avgSuccess: "Average Success", timePeriod: "Period", shift: "Shift",
    supervisor: "Supervisor", allSups: "All Supervisors", leader: "Leader", allLeaders: "All Leaders",
    trend: "Completion Trend", taskTitle: "Success per Task",
    standing: "Leader Standings", supStanding: "Supervisor Standings",
    toggleLeader: "Leader", toggleSup: "Supervisor",
    standRating: "Rating", standConsist: "Consistency",
    thPlace: "Place", thDays: "Days filed", thTier: "Tier",
    tierTop: "Champion", tierGood: "Excellent", tierMid: "Average", tierBad: "Low",
    supSearchPh: "Search supervisor…",
    standInfo: "Rating — a score for EVERY day of the period: a day with no report counts as 0%. Consistency — the share of those days that carry a report at all. The scoring window is the whole picked period, not from the first report. Rating can therefore never exceed consistency.\n\nThe active tab is the primary ranking and the other column is its sub-rating: equal results are separated by it. A place is shared only when BOTH figures match.\n\nTrend — the change of PLACE, not of a percentage: 57th last period, 47th now, that is +10 (climbing green, dropping red, level 0). It compares against the previous period of the same length, ranked by whichever column the list is sorted by right now. The line is that place day by day (at least 7 days): each point is the place the board would print if the period ended on that day, so the end of the line is exactly the place in the row. Nothing at all in the previous period reads «New».",
    standPrimaryHint: "Primary ranking — the list is sorted by this column",
    standSubHint: "Sub-rating — breaks the tie when the primary column is equal",
    thTrend: "Trend",
    trendHint: "Change of PLACE vs the previous period of the same length: 57th up to 47th is +10; the line is the place day by day",
    trendVsPrev: "Place vs previous period",
    trendNoPrev: "No data for the previous period",
    trendNew: "New",
    trendNewHint: "No data at all for the previous period — new to the ranking",
    tierEdit: "Grade cutoffs", tierEditSub: "Applies to every viewer",
    tierEditRow: "% and above",
    tierEditHint: "Cutoffs apply to whichever column the list is ranked by (Rating or Consistency). Anything below the lowest cutoff is «Low».",
    tierEditOrder: "Cutoffs must descend: Champion > Excellent > Average.",
    save: "Save", cancel: "Cancel",
    winLabel: "Scoring window", daysSent: "Filed", daysMissed: "Missed",
    hmTitle: "Day calendar", hmNoSync: "Not synced yet",
    tableTitle: "Recent Submissions (Low Score First)",
    thDate: "Date", thLeader: "Leader", thScore: "Score", thFailed: "Failed", thAction: "Action",
    thSubmitted: "Submitted", lateTitle: "Filed after the day it reports on", dayAbbr: "d", shiftAbbr: "shift",
    voidChip: "Out of window",
    voidTitle: "Shift 1: a checklist must be filed on its own day between 08:00 and 20:00 — this one was not accepted, so the day scores 0%",
    aiTitle: "AI review",
    aiCheck: "Check now",
    aiOk: "Confirmed",
    aiFlagged: "Suspect",
    aiPending: "Queued",
    aiError: "Could not review",
    aiImgDate: "Date on photo",
    aiExpected: "Allowed window",
    aiFdate_mismatch: "Date does not match",
    aiFno_date: "No date on the photo",
    aiFoff_topic: "Photo is not about this task",
    aiFnot_proven: "Does not show the work done",
    aiFunreadable: "Photo unreadable",
    aiRowBadge: "Tasks the AI flagged as suspect",
    aiQueued: "Waiting for AI review",
    aiRun: "AI review",
    aiRecheckOne: "Re-check this task",
    aiRunning: "Reviewing…",
    aiFlagsN: "flagged",
    aiPendingN: "queued",
    aiNote: "The AI verdict is a hint, not a final ruling.",
    tabAi: "AI review",
    aiBall: "All", aiB_forged: "Forged", aiB_undone: "Not done",
    aiB_date: "Date", aiB_tech: "Technical",
    aiBt_forged: "Wrong time AND no visible work — the fabricated-proof shape",
    aiBt_undone: "Time is fine, but the work is not visible",
    aiBt_date: "Work is visible, but the photo is from another day",
    aiBt_tech: "The photo could not be read — a server problem, not the leader's",
    aiQueue: "Queue", aiPhotoN: "photos", aiNoPhoto: "No photo found",
    aiZoom: "Enlarge photo",
    aiQ_read: "Date read", aiQ_window: "Inside the window",
    aiQ_match: "Photo matches the task", aiQ_done: "Work is visible",
    aiWhy: "Why", aiLeaderSaid: "Leader's own note",
    aiCriteria: "Criterion", aiNoCriteria: "No criterion written — only the date was checked.",
    aiAct_approved: "Proof is fine", aiAct_rejected: "Reject",
    aiAct_requeried: "Ask to re-file",
    aiActHint: "Rejecting makes the task count as not done for that day and notifies the leader. «Ask to re-file» changes no score.",
    aiUndo: "Undo", aiKeys: "Shortcuts", aiKeyMove: "move through queue",
    aiKeySkip: "later", aiKeyZoom: "zoom",
    aiPrev: "Previous", aiNext: "Next",
    aiDoneTitle: "Queue is empty",
    aiDoneBody: "Every suspect proof has been ruled on. The queue refills itself as new reports arrive.",
    aiFlag: "Flag", aiFAllFlags: "All flags", aiFAllTasks: "All tasks",
    aiF_off_topic: "Wrong subject", aiF_not_proven: "Work not visible",
    aiF_date_mismatch: "Clock outside window", aiF_no_date: "No date on photo",
    aiF_unreadable: "Photo unreadable",
    aiNoMatchTitle: "Nothing matches these filters",
    aiNoMatchBody: "The queue holds other rows — widen the filters.",
    aiClearFlt: "Clear filters",
    aiScanCap: "Too many flags to count exactly — the numbers are a floor. Narrow the period.",
    aiOffTitle: "AI review is not enabled",
    aiKeyLabel: "Gemini API key",
    aiKeySave: "Save and enable", aiKeyClear: "Remove",
    aiKeyShow: "Show", aiKeyHide: "Hide",
    aiKeySaved: "Key saved — review has started",
    aiKeyCleared: "Key removed — the section is off again",
    aiKeyHint: "The key is encrypted (with SECRET_KEY) and stays unreadable even in a database dump. Admins only.",
    aiKeyEnvPinned: "A key is pinned in backend/.env on the server — it takes precedence and can only be changed there.",
    aiOffBody: "This section needs a Gemini API key. Get one from Google AI Studio and paste it here — it is stored encrypted and never shown again.",
    aiCalTip: "Agreement with the AI: the share of flags you upheld, and how many you have ruled on",
    aiRejChip: "Proof rejected",
    notAsked: "Not asked", submittedAt: "Submitted",
    details: "Details", missed: "tasks missed", modalTitle: "Submission Details",
    noIssues: "No issues reported.", noReason: "No reason provided for failure.",
    fltIssues: "Issues", sumDone: "done", sumFailed: "failed",
    ovTitle: "Admin ruling", ovDone: "Done", ovFail: "Not done",
    ovChip: "Admin", ovUndo: "Clear the ruling — the leader's own answer returns",
    missedDeadline: "The leader didn't submit this task before {time}.",
    task: "Task", noData: "No Data", taskInfoTitle: "Task Details & Requirements",
    taskDesc: "Task Description", taskWeight: "Weight", taskNote: "Notes / Requirements",
    lowTask: "Lowest Task", lowSup: "Lowest Supervisor", lowLeader: "Lowest Leader",
    tipAvg: "Mean rating of every leader: EVERY day of the period counts, a day with no report as 0%",
    tipLowTask: "Least-completed task over the period: a day with no report counts as undone too",
    tipLowSup: "Supervisor with the lowest rating",
    tipLowLeader: "Leader with the lowest rating",
    searchPh: "Search leader…", bandAll: "All", noMatch: "No submissions match the filters",
    refresh: "Refresh", refreshing: "Refreshing…", refreshed: "Refreshed",
    lastSynced: "Last updated", never: "never",
    photoFailed: "Failed to load image", retry: "Retry",
  },
};

/* A day the leader never closed is auto-closed once its submission window
   shuts, and every unanswered task is stored not-done against a SENTINEL
   reason — `__missed__|HH:MM` — rather than a sentence. The column otherwise
   holds free text the leader typed in their own language, so it cannot also
   carry one fixed message that reads correctly for every viewer. Expanding it
   here renders it in the VIEWER's language, and keeps the deadline in 24-hour
   time: ru/uz never print AM/PM. Anything else is a real typed reason and
   passes through untouched. */
const MISSED_REASON = /^__missed__\|(\d{2}:\d{2})$/;
const showReason = (raw, T) => {
  const m = MISSED_REASON.exec(raw || "");
  return m ? T.missedDeadline.replace("{time}", m[1]) : raw;
};

// The 13 checklist questions, in the sheet's question order (index + 1 = the
// "N)" in its column headers). The first 12 carry over from
// apps-script/JavaScript.html; T13 was added to the form later, which is why the
// old T12 weight of 10% is now split 5% / 5% across the two. Localized into all
// four UI languages; weights are language-independent and total 100%.
const TASK_DETAILS = [
  { w: "10%",
    ru:      { n: "Фиксация ежедневной загрузки ячейки (план)", note: "фотоотчет" },
    uz:      { n: "Yacheykaning kunlik planini qayd qilish", note: "Foto hisobot" },
    uz_cyrl: { n: "Ячейканинг кунлик планини қайд қилиш", note: "Фото ҳисобот" },
    en:      { n: "Daily cell load fixation (plan)", note: "photo report" } },
  { w: "5%",
    ru:      { n: "Каскадная встреча (открытие - планерка)", note: "Фотоотчет Распределение зон" },
    uz:      { n: "Kaskad uchrashuv (ochilish – rejalashtirish)", note: "Foto hisobot. Zonalarni taqsimlash" },
    uz_cyrl: { n: "Каскад учрашув (очилиш – режалаштириш)", note: "Фото ҳисобот. Зоналарни тақсимлаш" },
    en:      { n: "Cascade meeting (briefing)", note: "Photo report Zone distribution" } },
  { w: "10%",
    ru:      { n: "СОП стандарт", note: "Фотоотчет Фиксация смежных ячеек" },
    uz:      { n: "SOP standarti", note: "Foto hisobot. Qo'shni yacheykalarni qayd qilish" },
    uz_cyrl: { n: "СОП стандарти", note: "Фото ҳисобот. Қўшни ячейкаларни қайд қилиш" },
    en:      { n: "SOP Standard", note: "Photo report adjacent cell fixation" } },
  { w: "15%",
    ru:      { n: "КРУ обход цеха (3 раза в день) (9:00 - 11:00 - 15:00)", note: "Чек лист обхода" },
    uz:      { n: "Obxod sexa (kuniga 3 marta)", note: "Aylanib chiqish chek-listi" },
    uz_cyrl: { n: "Обход цеха (кунига 3 марта)", note: "Айланиб чиқиш чек-листи" },
    en:      { n: "Workshop inspection (3x/day 9:00-11:00-15:00)", note: "Inspection checklist" } },
  { w: "5%",
    ru:      { n: "Прием сырья (холодильник, склад)", note: "Контрольный лист" },
    uz:      { n: "Syryo qabul qilish (sovutgich, ombor)", note: "Nazorat varaqasi" },
    uz_cyrl: { n: "Сырьё қабул қилиш (совутгич, омбор)", note: "Назорат варақаси" },
    en:      { n: "Receiving raw materials", note: "Control sheet" } },
  { w: "5%",
    ru:      { n: "Контроль своевременных поставок (внутреняя логистика)", note: "Фиксация Тайминга захода" },
    uz:      { n: "O'z vaqtida yetkazib berishni nazorat qilish (ichki logistika)", note: "Kirish taymingini qayd qilish" },
    uz_cyrl: { n: "Ўз вақтида етказиб беришни назорат қилиш (ички логистика)", note: "Кириш таймингини қайд қилиш" },
    en:      { n: "Internal logistics timing control", note: "Arrival timing fixation" } },
  { w: "5%",
    ru:      { n: "Заполнение контрольного стенда (САП)", note: "фотоотчет" },
    uz:      { n: "Nazorat stendini to'ldirish (SAP)", note: "Foto hisobot" },
    uz_cyrl: { n: "Назорат стендини тўлдириш (SAP)", note: "Фото ҳисобот" },
    en:      { n: "Control board filling (SAP)", note: "photo report" } },
  { w: "5%",
    ru:      { n: "Заполнение обеспокоенности", note: "фотоотчет" },
    uz:      { n: "Obespokoennosti kiritish", note: "Foto hisobot" },
    uz_cyrl: { n: "Обеспокоенности киритиш", note: "Фото ҳисобот" },
    en:      { n: "Concern reporting", note: "photo report" } },
  { w: "10%",
    ru:      { n: "Фиксация 50% плана в течении смены", note: "Отчет бригадиру" },
    uz:      { n: "Smena davomida rejaning 50% ni qayd qilish", note: "Brigadirga hisobot" },
    uz_cyrl: { n: "Смена давомида режанинг 50% ни қайд қилиш", note: "Бригадирга ҳисобот" },
    en:      { n: "50% plan fixation during shift", note: "Report to supervisor" } },
  { w: "10%",
    ru:      { n: "Закрытие плана САП", note: "Подтверждение бригадира" },
    uz:      { n: "SAP rejasini yopish", note: "Brigadir tasdig'i" },
    uz_cyrl: { n: "SAP режасини ёпиш", note: "Бригадир тасдиғи" },
    en:      { n: "SAP plan closure", note: "Supervisor confirmation" } },
  { w: "10%",
    ru:      { n: "Составление графика", note: "Фотоотчет" },
    uz:      { n: "Ish jadvalini grafika tuzish", note: "Foto hisobot" },
    uz_cyrl: { n: "Иш жадвалини графика тузиш", note: "Фото ҳисобот" },
    en:      { n: "Scheduling", note: "Photo report" } },
  { w: "5%",
    ru:      { n: "Контроль работы зам лидера", note: "Фотоотчет чек листа" },
    uz:      { n: "Zam lider ishini nazorat qilish", note: "Chek-list foto hisoboti" },
    uz_cyrl: { n: "Зам лидер ишини назорат қилиш", note: "Чек-лист фото ҳисоботи" },
    en:      { n: "Assistant leader work control", note: "Checklist photo report" } },
  { w: "5%",
    ru:      { n: "Сменный отчёт лидера", note: "фотоотчет" },
    uz:      { n: "Liderning smena hisoboti", note: "Foto hisobot" },
    uz_cyrl: { n: "Лидернинг смена отчёти", note: "Фото ҳисобот" },
    en:      { n: "Leader's shift report", note: "photo report" } },
];
// `id` is the sheet's question number (1-based). A question that is on the form
// but not yet described here still renders — as "Task N", with no weight.
const taskDetail = (id, lang) => {
  const td = TASK_DETAILS[id - 1];
  if (!td) return { weight: "—", n: "", note: "" };
  const loc = td[lang] || td.uz || td.ru;
  return { weight: td.w, ...loc };
};

const DAY = 86400000;
const ddmm = (iso) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };
// "2026-04-08T07:22:58" → "07:22"
const hhmm = (ts) => (ts ? String(ts).slice(11, 16) : "");
// Days between the day a checklist was filed and the day it reports on. > 0 means
// it was written up after the fact, which is what the "late" chip calls out.
const lateDays = (row) => {
  if (!row.submitted_at) return 0;
  const filed = String(row.submitted_at).slice(0, 10);
  const covers = String(row.date).slice(0, 10);
  if (!filed || !covers) return 0;
  return Math.round((new Date(`${filed}T00:00:00`) - new Date(`${covers}T00:00:00`)) / DAY);
};
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const todayISO = () => localISO(new Date());
const isoShift = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return localISO(d); };
const weekStartISO = (iso) => { const d = new Date(iso + "T00:00:00"); return isoShift(iso, -((d.getDay() + 6) % 7)); };
const spanDays = (from, to) => Math.round((new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / DAY) + 1;
const rowDate = (r) => String(r.date).slice(0, 10);

// ── scoring core ────────────────────────────────────────────────────────────
// ONE rule scores this whole page — the KPI cards, the trend line, the task
// bars and the leaderboard all run through here, so a card can never disagree
// with the row it summarises. The unit is a (person, day) slot: a day is worth
// the mean of that person's rows on it — filing twice, once per shift, still
// settles exactly one day — and every day of the window with no slot at all is
// a real 0%, not a gap to skip over.
//   key → Map(date → { sum, n })
const slotsBy = (rows, keyFn) => {
  const map = new Map();
  for (const r of rows) {
    const key = keyFn(r);
    if (!key || key === "N/A") continue;
    let e = map.get(key);
    if (!e) map.set(key, (e = new Map()));
    // A row the backend voided on the shift-1 submission window is not a report.
    // The person is registered above BEFORE this bails, so they stay on the
    // roster — they keep their standings row, they keep counting in every
    // denominator — but the day itself gets no slot: it scores the same real 0%
    // a missing day scores, and Barqarorlik does not count it as filed. Filing
    // twice on one day and hitting the window once still settles the day at the
    // valid row's score, because only the voided one drops out here.
    if (r.rejected) continue;
    const d = rowDate(r);
    const day = e.get(d) || { sum: 0, n: 0 };
    day.sum += r.completion; day.n++;
    e.set(d, day);
  }
  return map;
};
// …scored over a fixed window: Reyting = Σ day means ÷ every day of it,
// Barqarorlik = how many of those days carry a report at all.
const scoreSlots = (map, winDays) =>
  [...map.entries()].map(([name, days]) => {
    let sum = 0;
    for (const day of days.values()) sum += day.sum / day.n;
    const score = winDays ? sum / winDays : 0;
    return {
      name, score,
      rating: Math.round(score),
      consist: winDays ? Math.round((days.size / winDays) * 100) : 0,
      sent: days.size,
      missed: Math.max(0, winDays - days.size),
      // Which days those were, for the calendar grid under the register.
      days: new Set(days.keys()),
    };
  });

// Dense ranking on the (primary, sub-rating) PAIR — a place is shared only when
// BOTH figures match, and the next distinct result is always place+1 (1, 2, 2,
// 3…): a six-way tie on 41 must be followed by 42, not 47. Lifted out of the
// leaderboard because the Trend column re-ranks the previous period and every
// spark day, and a place delta only means something if all three rank by
// EXACTLY the same rule. Sorts and writes `place` onto the entries in place.
const rankPlaces = (list, metric) => {
  const val = (e) => (metric === "consist" ? e.consist : e.rating);
  const alt = (e) => (metric === "consist" ? e.rating : e.consist);
  const same = (a, b) => val(a) === val(b) && alt(a) === alt(b);
  list.sort((a, b) => val(b) - val(a) || alt(b) - alt(a) || a.name.localeCompare(b.name));
  list.forEach((e, i) => {
    e.place = i === 0 ? 1 : same(list[i - 1], e) ? list[i - 1].place : list[i - 1].place + 1;
  });
  return list;
};

// ── localized long-date formatter ("19th June, 2026" and its translations) ──────
const MONTHS = {
  en:      ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  ru:      ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"],
  uz:      ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"],
  uz_cyrl: ["январ", "феврал", "март", "апрел", "май", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"],
};
const enOrd = (d) => { const t = d % 100; if (t >= 11 && t <= 13) return "th"; return ["th", "st", "nd", "rd"][d % 10] || "th"; };
const fmtDate = (iso, lang) => {
  if (!iso) return "";
  const [y, m, d] = String(iso).split(/[T ]/)[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  const mn = (MONTHS[lang] || MONTHS.uz)[m - 1];
  if (lang === "en") return `${d}${enOrd(d)} ${mn}, ${y}`;   // 19th June, 2026
  if (lang === "ru") return `${d} ${mn} ${y}`;               // 19 июня 2026
  return `${d}-${mn}, ${y}`;                                 // 19-iyun, 2026 / 19-июн, 2026
};
// "last updated" timestamp: date + time (locale-aware), for the page header pill.
const fmtDateTime = (iso) => {
  if (!iso) return null;
  const dt = new Date(iso);
  if (isNaN(dt)) return null;
  return dt.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

// ── small atoms (mirror Trudoyomkost / Production idioms) ───────────────────────
// ── person-name display helpers (for the insight cards) ─────────────────────────
// Source names come from a free-text sheet in "Surname Given [Patronymic]" order,
// sometimes SHOUTED in all-caps. Soften the casing and, when a name is too long
// to fit a card, keep the surname full and abbreviate the rest → "Surname G.".
const titleCaseShout = (s) => {
  const str = String(s ?? "");
  if (str && str === str.toUpperCase() && str !== str.toLowerCase())
    return str.toLowerCase().replace(/(^|[\s\-'’])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
  return str;
};
const abbrevName = (s) => {
  const parts = String(s ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || String(s ?? "");
  return `${parts[0]} ${parts.slice(1).map((w) => w[0].toUpperCase() + ".").join(" ")}`;
};
// The two registers print the OTHER way round — surname down to an initial, given
// name in full ("Nurliboyev Nurbek" → "N. Nurbek"). A name column that reads as a
// filing card is what makes those tables feel long; search, tooltips and the
// podium cards still carry the whole name.
const initialSurname = (s) => {
  const parts = String(s ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || String(s ?? "");
  return `${parts[0][0].toUpperCase()}. ${parts.slice(1).join(" ")}`;
};

// Shrinks a single-line label to fit its container between `max` and `min` px.
// If even `min` overflows, it swaps in the shorter `short` text and re-fits — so
// the full name shows whenever it can, and only the worst cases get abbreviated.
function FitText({ full, short, max = 24, min = 13, className = "", style = {} }) {
  const boxRef = useRef(null);
  const txtRef = useRef(null);
  const [text, setText] = useState(full);
  const [size, setSize] = useState(max);

  useLayoutEffect(() => {
    const box = boxRef.current, txt = txtRef.current;
    if (!box || !txt) return;
    const fit = () => {
      const w = box.clientWidth;
      if (!w) return;
      const tryFit = (candidate) => {
        txt.textContent = candidate;
        let s = max;
        txt.style.fontSize = `${s}px`;
        while (txt.scrollWidth > w && s > min) { s -= 1; txt.style.fontSize = `${s}px`; }
        return { fits: txt.scrollWidth <= w, s };
      };
      let chosen = full, r = tryFit(full);
      if (!r.fits && short && short !== full) { chosen = short; r = tryFit(short); }
      setText(chosen);
      setSize(r.s);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [full, short, max, min]);

  return (
    <div ref={boxRef} className={`min-w-0 ${className}`}>
      <span ref={txtRef} className="block whitespace-nowrap font-bold leading-none"
        style={{ fontSize: size, ...style }}>{text}</span>
    </div>
  );
}

// Unified insight card. Every KPI shares one container (no per-card border
// quirks): muted label + iconed chip on top, big value below, and the score %
// as a soft-tinted pill so colour stays an *indicator* — never a slab of neon.
// `accent` lights a hairline glow across the top and tints the chip (hero card).
// "+2 kun" — a checklist filed this many days after the day it reports on.
function LateChip({ days, T }) {
  return (
    <span
      title={T.lateTitle}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold tabular-nums"
      style={{ background: hexA(C_BAD, 0.12), border: `1px solid ${hexA(C_BAD, 0.3)}`, color: C_BAD }}>
      <Clock size={10} />+{days} {T.dayAbbr}
    </span>
  );
}

// Where a row stands with the shift-1 submission window — one chip, four states,
// so the register never has to be read together with the «Kechikkanlar» tab to
// know whether a day counts.
//
//   void / rejected — filed outside the window and not opened: the day scores 0.
//                     Red, because that is what it costs, and the row's own score
//                     chip greys out beside it since that number no longer counts.
//   pending         — someone asked for it to be opened; nothing has changed yet.
//   approved        — opened: the day counts at its own score, and this chip is
//                     the permanent late flag it carries from then on. Amber, not
//                     green: accepted is not the same as on time.
const FLAG_TONE = { void: C_BAD, rejected: C_BAD, pending: "#eab308", approved: "#eab308" };
function DayFlag({ row, T }) {
  const st = row?.late_state;
  if (!st) return null;
  const color = FLAG_TONE[st];
  const [Icon, label, title] =
    st === "approved" ? [ShieldCheck, T.lateOkChip, T.lateOkTitle.replace("{by}", row.late_by || "—")]
    : st === "pending" ? [Hourglass, T.pendChip, T.pendTitle]
    : [Ban, T.voidChip, T.voidTitle];
  return (
    <span
      title={title}
      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold"
      style={{ background: hexA(color, 0.12), border: `1px solid ${hexA(color, 0.3)}`, color }}>
      <Icon size={10} />{label}
    </span>
  );
}

function StatCard({ label, icon: Icon, tip, value, valueColor, badge, badgeColor, accent, fit, loading }) {
  // `fit` cards hold a person's name: soften the casing, then auto-shrink it to
  // the card width (abbreviating to "Surname G." only if it still won't fit).
  const fitFull = fit ? titleCaseShout(value) : value;
  return (
    <div className="relative rounded-2xl p-4 overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
      {accent && <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />}
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-wider font-semibold truncate" style={{ color: "var(--text-3)" }}>{label}</span>
        <span title={tip} className="grid place-items-center w-6 h-6 rounded-lg flex-shrink-0 cursor-help"
          style={{ background: accent ? hexA(accent, 0.14) : "var(--bg-inner)", color: accent || "var(--brand-text)" }}>
          {Icon && <Icon size={13} />}
        </span>
      </div>
      <div className="flex items-end justify-between gap-2 min-w-0">
        {loading ? (
          // While the fetch is in flight the value is unknown, not missing — a
          // pulsing block says "coming", where a static "—" says "nothing here".
          <SkeletonBlock className="h-6 w-20" />
        ) : fit ? (
          <FitText full={fitFull} short={abbrevName(fitFull)} className="flex-1"
            style={{ color: valueColor || "var(--text-1)" }} />
        ) : (
          <span className="text-2xl font-bold tabular-nums leading-none truncate" style={{ color: valueColor || "var(--text-1)" }}>{value}</span>
        )}
        {!loading && badge != null && (
          <span className="text-[11px] font-bold tabular-nums px-2 py-1 rounded-md flex-shrink-0 leading-none"
            style={{ background: hexA(badgeColor, 0.15), color: badgeColor }}>{badge}</span>
        )}
      </div>
    </div>
  );
}

// The proof-photo loaders (ProxyPhoto / ReportPhoto / BotPhoto) now live in
// components/leaders/ProofPhoto.jsx — the AI triage view shows the SAME photos,
// and two copies would have meant two blob lifecycles and two retry behaviours
// for one image.

/* ══ AI proof review (admin-only pilot) ═══════════════════════════════════════
 * Two questions are asked of each proof photo — is its drawn-on timestamp
 * inside the checklist day (per the leader's SHIFT, so a 02:00 shift-2 photo
 * is on time), and does it show the work actually done, measured against the
 * criteria an admin wrote on the ltasks config page. See backend
 * services/leader_ai.py; nothing here renders for a non-admin.
 *
 * Visual weight is deliberately asymmetric. A clean verdict is one quiet line
 * — an admin scanning ten cards should not have to read ten "all good"
 * paragraphs. A flag turns the strip amber and spells out what is wrong, since
 * that is the only state anyone has to act on. */
const C_AI = "#eab308";  // amber: needs a look, not a failure — red stays "not done"

// The register-row badge: how many of this report's tasks the AI doubts.
function AiChip({ n, T }) {
  if (!n) return null;
  return (
    <span title={T.aiRowBadge}
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold tabular-nums align-middle flex-shrink-0"
      style={{ background: hexA(C_AI, 0.14), color: C_AI, border: `1px solid ${hexA(C_AI, 0.3)}` }}>
      <Sparkles size={11} />{n}
    </span>
  );
}

// The strip at the foot of a task card. `rev` is one entry of
// GET /api/leader-ai/report — absent means this task was never queued (no
// photos, or answered "no"), and absent must render nothing at all.
function AiReview({ rev, T, lang, canCheck, checking, error, onCheck }) {
  const [open, setOpen] = useState(false);
  const judged = rev && (rev.status === "ok" || rev.status === "flagged");

  // Not yet judged — which is a thing the admin can DO something about, so it
  // renders as an action, not a status. "Queued" on its own was the same dead
  // label whether the verdict was three seconds or three days away, and it
  // never changed while anyone watched it. The button turns the wait into one
  // deliberate ~3s call for THIS task.
  if (!judged) {
    if (!canCheck) return null;
    // A failed press, the stored error from an earlier drain, or the plain
    // invitation — in that order, because the newest thing that happened is
    // what the admin needs to read.
    const line = error ? error
      : checking ? T.aiRunning
      : rev?.status === "error" ? `${T.aiError}${rev.error ? ` — ${rev.error}` : ""}`
      : rev ? T.aiQueued : T.aiTitle;
    const failed = !!error || rev?.status === "error";
    return (
      <div className="px-3 py-1.5 flex items-center justify-between gap-2"
        style={{ borderTop: "1px solid var(--border)" }}>
        <span className="flex items-center gap-1.5 text-[11px] min-w-0"
          style={{ color: failed && !checking ? C_BAD : "var(--text-4)" }}>
          {checking ? <Loader2 size={11} className="animate-spin flex-shrink-0" />
            : <Sparkles size={11} className="flex-shrink-0" />}
          <span className="truncate" title={line}>{line}</span>
        </span>
        {/* `disabled`, not `loading`: Button's spinner would be a SECOND
            spinning thing in a strip this small, next to the one on the status
            line — which reads as a glitch rather than as progress. One motion
            cue, on the line that says what is happening. */}
        <Button size="sm" variant="secondary" tint disabled={checking}
          className="flex-shrink-0" onClick={() => onCheck(false)}>
          {failed ? T.retry : T.aiCheck}
        </Button>
      </div>
    );
  }

  const reason = rev.reason?.[lang] || rev.reason?.ru || rev.reason?.en || "";
  const flagged = rev.status === "flagged";
  const tone = flagged ? C_AI : C_GOOD;

  return (
    <div className="px-3 py-2"
      style={{
        borderTop: `1px solid ${flagged ? hexA(C_AI, 0.35) : "var(--border)"}`,
        background: flagged ? hexA(C_AI, 0.1) : "transparent",
      }}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <Sparkles size={12} color={tone} className="flex-shrink-0" />
        <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: tone }}>
          {T.aiTitle}
        </span>
        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
          style={{ background: hexA(tone, 0.15), color: tone }}>
          {flagged ? T.aiFlagged : T.aiOk}
        </span>
        {/* The timestamp the model read, verbatim — an admin can judge the
            judge without opening the photo, which is the whole point of a
            pilot. Kept on the header line so a clean card stays one row. */}
        <span className="ml-auto flex items-center gap-1 min-w-0">
          {rev.imageDate && (
            <span className="text-[10px] tabular-nums truncate"
              style={{ color: "var(--text-4)" }} title={`${T.aiImgDate}: ${rev.imageDate}`}>
              {rev.imageDate}
            </span>
          )}
          {/* Re-run THIS verdict. A stored verdict answers the question the
              reviewer asked on the day it ran; when that question changes, the
              only honest way to see the new answer on a photo already in front
              of you is to spend one more call on it. Icon-only — the strip is
              10px type and a worded button would outweigh the verdict it sits
              beside. */}
          {canCheck && (
            <Button size="sm" variant="ghost" disabled={checking}
              className="flex-shrink-0 !px-1.5" title={T.aiRecheckOne}
              onClick={() => onCheck(true)}>
              {checking ? <Loader2 size={12} className="animate-spin" />
                : <RefreshCw size={12} />}
            </Button>
          )}
        </span>
      </div>

      {/* A forced re-check can fail (quota, an unreachable photo) on a card that
          already shows a verdict. Without this the press would look ignored. */}
      {error && (
        <p className="text-[10px] mt-1" style={{ color: C_BAD }}>{error}</p>
      )}

      {flagged && (
        <>
          <div className="flex flex-wrap gap-1 mt-1.5">
            {(rev.flags || []).map((f) => (
              <span key={f} className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
                style={{ background: hexA(C_AI, 0.16), color: C_AI, border: `1px solid ${hexA(C_AI, 0.3)}` }}>
                {T[`aiF${f}`] || f}
              </span>
            ))}
          </div>
          {/* A date flag is only actionable next to the window it missed —
              especially on shift 2, where the allowed window legitimately runs
              into the next calendar morning. */}
          {rev.expected && (rev.flags || []).some((f) => f === "date_mismatch" || f === "no_date") && (
            <p className="text-[10px] tabular-nums mt-1" style={{ color: "var(--text-4)" }}>
              {T.aiExpected}: {rev.expected}
            </p>
          )}
          {reason && (
            // Clamped to two lines: the cards sit two-up in the modal and an
            // unbounded verdict would push the photos of the next card off
            // screen. Tapping opens the rest in place.
            <p onClick={() => setOpen((o) => !o)}
              className={`text-[11px] leading-snug mt-1.5 cursor-pointer ${open ? "" : "line-clamp-2"}`}
              style={{ color: "var(--text-2)" }} title={reason}>
              {reason}
            </p>
          )}
        </>
      )}
    </div>
  );
}

/* ══ standings (the leaderboard) ══════════════════════════════════════════════
 * Identity hues for the initials chips — full-spectrum so neighbouring names
 * never collide by accident. Decoration, not status: the traffic-light
 * green/amber/rose stays reserved for the numbers themselves. */
const AVA_HUES = ["#8b5cf6", "#2dd4bf", "#f472b6", "#38bdf8", "#fb923c", "#a3e635",
                  "#818cf8", "#e879f9", "#22d3ee", "#facc15", "#fb7185", "#4ade80"];
const hueOf = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return AVA_HUES[h % AVA_HUES.length];
};
const initialsOf = (s) => s.trim().split(/\s+/).map((p) => p[0] || "").join("").slice(0, 2).toUpperCase();

// Medals — gold / silver / bronze for the podium, one attention rose for all
// three cards when the list is flipped (nobody gets a medal for finishing last).
// Pushed apart in hue AND lightness on purpose: at icon-stroke weight a muted
// gold and a muted bronze read as the same smudge, so the place is unreadable.
const MEDAL = { 1: "#E0A82E", 2: "#C3CBD6", 3: "#C0703A" };

// Tier chip ("Daraja"). Cut from whichever metric is being ranked, so the chip
// always describes the number the list is sorted by. The three cutoffs are org
// policy an admin retunes from the page (GET/PUT /api/leader-tiers) and are held
// globally, not per viewer — a grade has to mean the same thing to the admin,
// the supervisor and the leader reading their own row. These defaults mirror the
// backend's and only render while that fetch is in flight.
const TIER_CUTS = { top: 85, good: 65, mid: 40 };
const TIER_BANDS = [
  { cut: "top",  key: "tierTop",  color: C_GOOD, Icon: Crown },
  { cut: "good", key: "tierGood", color: C_GOOD, Icon: Award },
  { cut: "mid",  key: "tierMid",  color: C_MID,  Icon: Shield },
];
const TIER_BAD = { key: "tierBad", color: C_BAD, Icon: ShieldAlert };
const tierOf = (v, cuts = TIER_CUTS) => TIER_BANDS.find((b) => v >= cuts[b.cut]) || TIER_BAD;
// Cutoffs must stay strictly descending: a band whose floor sits at or above the
// one above it can never be reached. Guards the editor before the PUT does.
const tierOrderOk = (c) =>
  [c?.top, c?.good, c?.mid].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)
  && c.top > c.good && c.good > c.mid;

function Avatar({ name, size = 24 }) {
  const hue = hueOf(name);
  return (
    <span className="inline-flex items-center justify-center rounded-full font-bold flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38), background: hexA(hue, 0.18), color: hue }}>
      {initialsOf(name)}
    </span>
  );
}

// The dashed micro-gauge under every number — six segments, lit by the value's
// own band, so a row reads at a glance without parsing the digits.
function Meter({ pct, color }) {
  const on = Math.max(0, Math.min(6, Math.round((pct / 100) * 6)));
  return (
    <span className="flex gap-[2px] mt-1" aria-hidden="true">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{ width: 5, height: 2.5, borderRadius: 1, background: i < on ? color : "var(--border-md)" }} />
      ))}
    </span>
  );
}

/* Filed days. `sent + missed` is always the scoring window (missed is derived
 * from it), so the pair is really ONE number out of a constant — rendered as
 * the fraction "18/30". The old "18 – 12" read as a range or a subtraction. */
const daysTotal = (e) => e.sent + e.missed;
const daysPct = (e) => (daysTotal(e) ? (e.sent / daysTotal(e)) * 100 : 0);

function DaysValue({ e }) {
  return (
    <span className="tabular-nums">
      {e.sent}
      <span className="font-normal text-[12px]" style={{ color: "var(--text-4)" }}>/{daysTotal(e)}</span>
    </span>
  );
}

function TierChip({ value, T, cuts }) {
  const t = tierOf(value, cuts);
  return (
    <span className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: hexA(t.color, 0.14), color: t.color }}>
      <t.Icon size={12} />{T[t.key]}
    </span>
  );
}

/* ── trend column ─────────────────────────────────────────────────────────────
 * Two readings of "is this person moving" that a per-range ranking can still
 * give, both about the PLACE: how many places were won or lost against the
 * previous period of the SAME length (the chip), and the place day by day
 * across the picked period (the spark). A place is better the SMALLER it is,
 * so 57th → 47th is +10 and green — the chip reads as movement up the board,
 * not as arithmetic on the number itself.
 *   `prev` is null when the sheet holds nothing at all before the window:
 * without a baseline every chip would print a fake "+40". Somebody the previous
 * period never saw, on a board that HAS a baseline, is «Yangi» — pretending
 * they climbed from last place would hand a newcomer the biggest jump on the
 * page. Standing still is 0 and grey, as is the spark's end dot. */
const trendParts = (trend, e) => {
  const isNew = !!trend.prev && !trend.prevSeen?.has(e.name);
  const prevP = trend.prev && !isNew ? trend.prev.get(e.name) ?? null : null;
  const delta = prevP == null ? null : prevP - e.place;
  const flat = !delta;            // no baseline, «Yangi», or genuinely level
  return { prevP, delta, isNew, tone: flat ? C_FLAT : delta > 0 ? C_GOOD : C_BAD,
    Icon: isNew ? Sparkles : flat ? Minus : delta > 0 ? TrendingUp : TrendingDown };
};

function DeltaChip({ trend, e, T }) {
  const { prevP, delta, isNew, tone, Icon } = trendParts(trend, e);
  return (
    <span className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[11px] font-semibold tabular-nums whitespace-nowrap"
      title={isNew ? T.trendNewHint : delta == null ? T.trendNoPrev
        : `${T.trendVsPrev}: ${prevP} → ${e.place}`}
      style={{ background: hexA(tone, 0.14), color: tone }}>
      <Icon size={12} />
      {isNew ? T.trendNew : delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta}`}
    </span>
  );
}

/* The spark is one smooth Catmull-Rom path plus the same path closed as a flat
 * wash — a wide window is a few hundred points but still two DOM nodes, so no
 * SVG filters (or gradients, per the solid-fill convention) and nothing
 * per-cell to freeze on. Line, wash and end dot all take the trend tone;
 * flat/no-baseline rows stay grey. */
const SPARK_W = 84, SPARK_H = 24;
function Spark({ vals, tone }) {
  if (!vals || vals.length < 2) return null;
  const pt = (v, i) => [3 + (i / (vals.length - 1)) * (SPARK_W - 6),
    SPARK_H - 3 - (Math.min(100, Math.max(0, v)) / 100) * (SPARK_H - 6)];
  const p = vals.map(pt), r = (n) => Math.round(n * 10) / 10;
  let d = `M${r(p[0][0])},${r(p[0][1])}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += `C${r(p1[0] + (p2[0] - p0[0]) / 6)},${r(p1[1] + (p2[1] - p0[1]) / 6)} ` +
      `${r(p2[0] - (p3[0] - p1[0]) / 6)},${r(p2[1] - (p3[1] - p1[1]) / 6)} ${r(p2[0])},${r(p2[1])}`;
  }
  const [ex, ey] = p[p.length - 1];
  return (
    <svg width={SPARK_W} height={SPARK_H} className="flex-shrink-0" aria-hidden="true">
      <path d={`${d} L${r(ex)},${SPARK_H - 1} L3,${SPARK_H - 1} Z`} fill={hexA(tone, 0.14)} />
      <path d={d} fill="none"
        stroke={tone} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={ex} cy={ey} r="2.5" fill={tone} />
    </svg>
  );
}

function TrendCell({ trend, e, T }) {
  const { tone } = trendParts(trend, e);
  return (
    <span className="inline-flex items-center gap-2">
      <Spark vals={trend.sparks.get(e.name)} tone={tone} />
      <DeltaChip trend={trend} e={e} T={T} />
    </span>
  );
}

// One stat inside a podium card: label, value, micro-gauge. The metric the list
// is ranked by gets a brand-gold label so the card says why it is on the card.
function CardStat({ label, value, pct, color, active }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide truncate"
        style={{ color: active ? "var(--brand-text)" : "var(--text-4)" }}>{label}</div>
      <div className="text-[15px] font-bold tabular-nums leading-tight mt-0.5" style={{ color: "var(--text-1)" }}>{value}</div>
      <Meter pct={pct} color={color} />
    </div>
  );
}

/* A podium card — places 1-3, or the bottom three when the list is flipped.
 * Either way it keeps its REAL place number, so the flipped state reads as
 * "the three who need help" rather than as a fake podium. */
// S1/S2 identity chip beside a name — rendered only when the view mixes both
// shifts (the Smena filter on «All»), where a combined ranking is unreadable
// without knowing which shift a row belongs to. Neutral chrome on purpose:
// shift is an identity, not a status, so it takes no traffic-light color.
function ShiftChip({ shift, T }) {
  if (!shift) return null; // unresolved unit — claim nothing
  return (
    <span className="flex-shrink-0 inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none"
      title={shift === 1 ? T.shift1 : T.shift2}
      style={{ border: "1px solid var(--border)", color: "var(--text-3)" }}>
      S{shift}
    </span>
  );
}

function StandCard({ e, worst, metric, T, name, cuts, trend, shift }) {
  const tone = worst ? C_BAD : MEDAL[e.place] || MEDAL[3];
  const Badge = worst ? AlertTriangle : Trophy;
  const ranked = metric === "consist" ? e.consist : e.rating;
  // First place is the one the eye must find instantly, so it carries a heavier
  // rim than the other two. Ties keep the same medal on purpose — two cards that
  // look alike is the honest reading of "tied for 2nd".
  const rim = worst ? 0.34 : e.place === 1 ? 0.6 : 0.38;
  return (
    <div className="relative rounded-2xl overflow-hidden p-3"
      style={{ background: "var(--bg-inner)", border: `1px solid ${hexA(tone, rim)}` }}>
      <span aria-hidden className="absolute select-none tabular-nums font-black leading-none"
        style={{ right: 6, bottom: -18, fontSize: 76, color: hexA(tone, 0.14) }}>{e.place}</span>

      <div className="relative flex items-center gap-2">
        <Avatar name={name} size={30} />
        <div className="min-w-0 text-[12.5px] font-semibold leading-tight" style={{ color: "var(--text-1)" }}>{name}</div>
        {/* Rank medallion — a FILLED chip carrying the trophy and the place digit
          * together. The bare outline trophy it replaced tinted too few pixels to
          * separate gold from bronze, and the ghost numeral behind the card is
          * decoration, not a label: the place has to be spelled out somewhere. */}
        <span className="ml-auto flex-shrink-0 inline-flex items-center gap-1 rounded-full pl-1.5 pr-2 py-1
                         text-[13px] font-black tabular-nums leading-none"
          style={{ background: hexA(tone, 0.18), border: `1px solid ${hexA(tone, 0.5)}`, color: tone }}>
          <Badge size={14} />{e.place}
        </span>
      </div>

      {/* The register drops the podium rows, so the card carries their trend chip. */}
      <div className="relative mt-2 flex items-center gap-1.5">
        <TierChip value={ranked} T={T} cuts={cuts} />
        {trend && <DeltaChip trend={trend} e={e} T={T} />}
        <ShiftChip shift={shift} T={T} />
      </div>

      <div className="relative grid grid-cols-3 gap-2 mt-2.5">
        <CardStat label={T.daysSent} pct={daysPct(e)} color={scoreColor(daysPct(e))} value={<DaysValue e={e} />} />
        <CardStat label={T.standRating} value={`${e.rating}%`} pct={e.rating} color={scoreColor(e.rating)} active={metric === "rating"} />
        <CardStat label={T.standConsist} value={`${e.consist}%`} pct={e.consist} color={scoreColor(e.consist)} active={metric === "consist"} />
      </div>
    </div>
  );
}

/* ── day calendar ─────────────────────────────────────────────────────────────
 * A binary heatmap under the register: rows are the ranking above, in the same
 * order, and columns are every day of the same scoring window — so a row's green
 * count is literally the "6/7" printed beside it. Cells are bare colour, no
 * number: whether a report was filed is the only question here, how good it was
 * is what the two metric columns are for.
 *
 * Days past the last one the sheet holds ANY data for are neither green nor red.
 * A column of forty simultaneous failures is almost always a sync that has not
 * run yet, so it greys out instead of accusing the whole shift; an empty day
 * INSIDE the data's range is a real collective miss and stays red.
 *
 * Built on the fleet HeatmapChart's template — not imported from it, the way
 * the Quality seasonality grid isn't either: that component reads utilisation
 * objects, prints a % in every cell and pins an AVG/MAX/MIN column, none of
 * which survives a two-state calendar. What carries over is everything that
 * makes it read as one of this platform's heatmaps: brand-gold header strip,
 * pinned name column, bordered square-ish cells, click a name or a date to
 * isolate that row or column, hover brightening, and the BASIS_DAYS width —
 * exactly 14 columns fill the card, a shorter window pads with blanks so the
 * grid never changes width, a longer one scrolls sideways.
 */
const HM_BASIS_DAYS = 14;   // columns that fill the width before it scrolls
const HM_CELL_W     = 42;   // fleet CELL_W — the floor on narrow screens
const HM_LABEL_W    = 152;  // sized for "12  N. Nurbek" — no avatar, no surname
const HM_LABEL_W_SM = 104;  // narrow containers give the grid back some room
const HM_ROW_H      = 28;
const HM_ROWS_OPEN  = 15;   // rows per page — the grid pages instead of scrolling
const HM_HEAD_H     = 30;

// Solid, like the fleet's segment colours — the grid lines do the separating.
const HM_SENT   = "#22c55e";
const HM_MISSED = "#ef4444";
// The fleet's "pending" hatch, reused for a day the sheet has not reached yet.
const HM_VOID = "repeating-linear-gradient(45deg, var(--bg-inner), var(--bg-inner) 5px, transparent 5px, transparent 10px)";
const HM_BORDER = "1px solid var(--border)";

// Fleet header strip: brand-gold band, white uppercase micro-caps.
const HM_TH = {
  fontSize: 10, fontWeight: 700, letterSpacing: ".07em",
  textTransform: "uppercase", color: "#fff", whiteSpace: "nowrap",
  paddingTop: 4, paddingBottom: 6,
  background: "var(--brand)", border: HM_BORDER,
  position: "sticky", top: 0,
};

function HmLegend({ T, hasVoid }) {
  const chip = (bg, label) => (
    <span className="inline-flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-4)" }}>
      <span style={{ width: 11, height: 11, borderRadius: 3, background: bg, flexShrink: 0 }} />
      {label}
    </span>
  );
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {chip(HM_SENT, T.daysSent)}
      {chip(HM_MISSED, T.daysMissed)}
      {hasVoid && chip(HM_VOID, T.noData)}
    </div>
  );
}

/* One leader's strip. Memoised on purpose: a wide window is well over a
 * thousand cells, and without this boundary every unrelated re-render of the
 * page around the grid would walk all of them. */
const HmRow = memo(function HmRow({
  rowKey, name, place, days, dates, dataMax, cellW, labelW, padCount,
  sel, dim, selDate, hoverRow, hoverDate, onEnter, onLeave, onPick, T,
}) {
  const live = !sel && !dim && selDate == null;   // hover only reads when nothing is isolated
  return (
    <tr>
      {/* Name — pinned, and the handle that isolates this row */}
      <td onClick={(ev) => { ev.stopPropagation(); onPick("row", rowKey); }}
        style={{
          // Above a lifted cell (z 3) so a hover at the left edge slides under
          // the pinned column instead of over it.
          position: "sticky", left: 0, zIndex: 4,
          width: labelW, minWidth: labelW, maxWidth: labelW,
          height: HM_ROW_H, background: "var(--bg-card)",
          borderRight: "2px solid var(--border-md)", borderBottom: HM_BORDER,
          opacity: dim ? 0.35 : 1, cursor: "pointer", userSelect: "none",
          transition: "opacity .1s",
        }}>
        <span className="flex items-center gap-2.5 pl-3 pr-2 min-w-0" title={name}>
          <span className="text-[11px] tabular-nums flex-shrink-0 w-[20px] text-right"
            style={{ color: "var(--text-4)" }}>{place}</span>
          <span className="truncate text-[12.5px]"
            style={{
              color: sel || hoverRow ? "var(--text-1)" : "var(--text-2)",
              fontWeight: sel ? 700 : 500,
            }}>{initialSurname(name)}</span>
        </span>
      </td>

      {dates.map((d) => {
        const stale = dataMax != null && d > dataMax;
        const sent = days.has(d);
        const grayed = dim || (selDate != null && d !== selDate);
        // Fleet cell feedback: the cell under the pointer lifts, its row and
        // column merely brighten. Skipped on the hatch, which has nothing to lift.
        const cellHov = live && hoverRow && d === hoverDate;
        const soft = live && !cellHov && (hoverRow || d === hoverDate);
        return (
          <td key={d}
            onMouseEnter={() => onEnter(rowKey, d)}
            onMouseLeave={onLeave}
            onClick={(ev) => { ev.stopPropagation(); onPick("date", d); }}
            title={`${name} · ${ddmm(d)} — ${stale ? T.hmNoSync : sent ? T.daysSent : T.daysMissed}`}
            style={{
              width: cellW, minWidth: cellW, height: HM_ROW_H, padding: 0,
              background: stale ? HM_VOID : sent ? HM_SENT : HM_MISSED,
              border: HM_BORDER, cursor: "pointer", position: "relative",
              opacity: grayed ? 0.18 : 1,
              filter: stale || grayed ? "none" : cellHov ? "brightness(1.25)" : soft ? "brightness(1.12)" : "none",
              transform: !stale && !grayed && cellHov ? "scale(1.06)" : "none",
              boxShadow: !stale && !grayed && cellHov ? "0 4px 12px rgba(0,0,0,.25)" : "none",
              zIndex: cellHov ? 3 : "auto",
              transition: "filter .08s, transform .07s, box-shadow .07s, opacity .1s",
            }} />
        );
      })}

      {/* Blank placeholders — hold the BASIS_DAYS width */}
      {Array.from({ length: padCount }, (_, i) => (
        <td key={`p${i}`} style={{
          width: cellW, minWidth: cellW, height: HM_ROW_H,
          border: HM_BORDER, background: "var(--bg-card)",
        }} />
      ))}
    </tr>
  );
});

function DayGrid({ rows, dates, dataMax, T, nm, nameHead }) {
  const scrollRef = useRef(null);
  const [containerW, setContainerW] = useState(0);
  const [hover, setHover] = useState(null);           // { name, date }
  const [selection, setSelection] = useState(null);   // { type: row|date, value }

  const onEnter = useCallback((name, date) =>
    setHover((h) => (h && h.name === name && h.date === date ? h : { name, date })), []);
  const onLeave = useCallback(() => setHover(null), []);
  // Clicking a name or a date isolates it; clicking it again — or anywhere off
  // the cells — lets the whole grid back in.
  const onPick = useCallback((type, value) =>
    setSelection((s) => (s && s.type === type && s.value === value ? null : { type, value })), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setContainerW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const labelW = containerW && containerW < 560 ? HM_LABEL_W_SM : HM_LABEL_W;
  // Fleet sizing: the column width follows the container and BASIS_DAYS alone,
  // never the number of days picked, so cells keep their size as you change the
  // range — a fortnight fills the card, a week fills it with seven blanks on the
  // end, a month runs past the edge and scrolls.
  const cellW = containerW > 0
    ? Math.max(HM_CELL_W, Math.floor((containerW - labelW) / HM_BASIS_DAYS))
    : HM_CELL_W;
  const padCount = Math.max(0, HM_BASIS_DAYS - dates.length);
  const tableWidth = labelW + Math.max(HM_BASIS_DAYS, dates.length) * cellW;

  const selDate = selection?.type === "date" ? selection.value : null;

  return (
    <div ref={scrollRef} className="overflow-x-auto"
      onMouseLeave={onLeave}
      onClick={() => setSelection(null)}>
      <table style={{ borderCollapse: "collapse", borderSpacing: 0, width: tableWidth, tableLayout: "fixed" }}>
        <thead>
          <tr>
            <th style={{
              ...HM_TH, left: 0, zIndex: 7,
              width: labelW, minWidth: labelW,
              height: HM_HEAD_H, textAlign: "left", paddingLeft: 12,
              borderRight: "2px solid var(--border-md)",
            }}>{nameHead}</th>

            {dates.map((d) => {
              const isSel = selDate === d;
              return (
                <th key={d}
                  onClick={(ev) => { ev.stopPropagation(); onPick("date", d); }}
                  style={{
                    ...HM_TH, zIndex: 6,
                    width: cellW, minWidth: cellW, height: HM_HEAD_H,
                    textAlign: "center", cursor: "pointer", userSelect: "none",
                    fontWeight: isSel ? 800 : 700,
                    opacity: selDate != null && !isSel ? 0.45 : 1,
                    transition: "opacity .1s",
                  }}>
                  <span className="tabular-nums">{ddmm(d)}</span>
                  {isSel && <span style={{ display: "block", height: 2, borderRadius: 1, background: "#fff", marginTop: 3 }} />}
                </th>
              );
            })}

            {Array.from({ length: padCount }, (_, i) => (
              <th key={`p${i}`} style={{ ...HM_TH, zIndex: 6, width: cellW, minWidth: cellW, height: HM_HEAD_H }} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => {
            const rowSel = selection?.type === "row";
            return (
              <HmRow key={e.name} rowKey={e.name} name={nm(e.name)} place={e.place} days={e.days}
                dates={dates} dataMax={dataMax} cellW={cellW} labelW={labelW} padCount={padCount}
                sel={rowSel && selection.value === e.name}
                dim={rowSel && selection.value !== e.name}
                selDate={selDate}
                hoverRow={hover?.name === e.name} hoverDate={hover?.date ?? null}
                onEnter={onEnter} onLeave={onLeave} onPick={onPick} T={T} />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── main page ──────────────────────────────────────────────────────────────────
// ONE page for every role (the 2026-08-05 per-shift admin copies were merged
// back on 2026-08-10): the Smena filter narrows to a shift, «All» shows both
// with S1/S2 chips on the standings so a mixed ranking stays readable. The DATA
// is one feed: /api/leaders serves shift-2 days from the bot when the leader
// closed one there and from the sheet otherwise, scoped per role server-side.
export default function Leaders() {
  const { auth } = useAuth();
  const { seesAllOn } = useCapabilities();
  const { lang } = useLang();
  const { tl } = useTranslit();
  // Person names everywhere on the page: transliterate, then soften SHOUTED
  // all-caps source entries to capital-case ("TURDIMURODOV NODIR" → "Turdimurodov Nodir").
  const nm = (s) => titleCaseShout(tl(s));
  const { gridColor, labelColor, legendColor } = useChartTheme();
  const T = TXT[lang] || TXT.uz;

  // Supervisors are locked to their own unit: the backend returns only their
  // rows, so they get no supervisor filter and no supervisor standings toggle.
  // A personal «Sahifalar ▸ Liderlar» grant at "all" is what lifts that lock —
  // the backend then returns every unit's rows, so the page must offer the
  // full set of filters to match (same for a widened leader).
  const seesAllLeaders = seesAllOn("leaders");
  const isSupervisor = auth?.role === "supervisor" && !seesAllLeaders;
  // A leader is locked to their OWN checklist rows (scoped server-side by name),
  // so they get no shift / supervisor / leader pickers and no standings toggle —
  // the page shows only their own monitoring.
  const isLeader = auth?.role === "leader" && !seesAllLeaders;
  const isAdmin = auth?.role === "admin";
  // The refresh button is shown to every profile that can open this page — the
  // backend allows the "leaders" sheet re-sync for anyone with page access, and
  // each still only reads their own scoped rows afterwards. The sheet is still
  // the history behind both shifts, so both locked pages keep it.
  const canRefresh = true;
  const pageTitle = T.title;

  // Filters persist across visits under the pre-split "leaders" prefix; the
  // retired shift pages' leaders1_*/leaders2_* keys are orphaned, not read.
  const prefix = "leaders";

  // Period — a concrete date range picked with the same control as the global
  // filters (presets + calendar popover). Defaults to the last 7 days.
  const [startDate, setStartDate] = usePersistentState(`${prefix}_date_from`, () => isoShift(todayISO(), -6));
  const [endDate, setEndDate] = usePersistentState(`${prefix}_date_to`, () => todayISO());
  const [fShift, setFShift] = usePersistentState(`${prefix}_shift`, null); // null = all shifts | 1 | 2
  const [fSup, setFSup] = usePersistentState(`${prefix}_supervisor`, "All");
  const [fLeader, setFLeader] = usePersistentState(`${prefix}_leader`, "All");
  const [standMode, setStandMode] = usePersistentState(`${prefix}_stand_mode`, "leader");
  const [standDir, setStandDir] = usePersistentState(`${prefix}_stand_dir`, "desc");
  const [standMetric, setStandMetric] = usePersistentState(`${prefix}_stand_metric`, "rating"); // rating | consist
  const [standSearch, setStandSearch] = usePersistentState(`${prefix}_stand_search`, "");
  const [standPage, setStandPage] = usePersistentState(`${prefix}_stand_page`, 1); // ranking register pager
  const [hmPage, setHmPage] = usePersistentState(`${prefix}_hm_page`, 1);          // day-calendar pager
  const [standInfo, setStandInfo] = useState(false);
  const [tierEdit, setTierEdit] = useState(null);            // admin's draft cutoffs
  const [detail, setDetail] = useState(null);
  const [taskInfo, setTaskInfo] = useState(false);

  // The page's tool tabs are shift-specific WORKFLOWS, not shift-filtered
  // views — each carries its own filters, so both stay put no matter where the
  // Smena filter points. The bot-data clear tool is admin-only (shift 2 is
  // where the bot files days, so deleting one changes what everybody sees);
  // «Kechikkan hisobotlar» is the review queue for days the shift-1 submission
  // window voided, shown to the two roles that act in that flow (a brigadir
  // asks, an admin decides).
  const showClearTab = isAdmin;
  const showLateTab = isAdmin || auth?.role === "supervisor";

  // ── AI proof review (admin-only pilot) ─────────────────────────────────────
  // `enabled: isAdmin` is the whole gate on the client: for anybody else the
  // request is never made and every AI affordance below evaluates to null, so
  // the page is byte-for-byte what it was. The server gates it again.
  // Only flag/queue COUNTS per report come down here — verdict prose is fetched
  // per report when its modal opens, so this stays small over years of rows.
  // Read BEFORE the tab list, because the triage tab's existence depends on it.
  const { data: aiData } = useQuery({
    queryKey: ["leader-ai-overview"],
    queryFn: () => api.get("/api/leader-ai/overview").then((r) => r.data),
    enabled: isAdmin,
    // A drain runs on a timer now (services/leader_ai.register_drain_job) as
    // well as after a Refresh or a bot day-close, so the counts go stale on
    // their own; refetching on focus follows it without polling all day.
    refetchOnWindowFocus: true,
  });
  const aiOn = isAdmin && !!aiData?.enabled;
  const aiFlags = aiData?.flags ?? {};
  // What is still OWED, not what was ever flagged. The server only counts
  // unresolved rows here, so the badge can reach zero.
  const aiTodo = aiData?.counts?.open ?? 0;

  const [tabSaved, setTab] = usePersistentState(`${prefix}_tab`, "monitor");
  // A saved tab the viewer can no longer open (role changed, or a shift page
  // that has no such view) falls back to the dashboard rather than a blank one.
  // `ai` is admin-only. Deliberately NOT key-gated: hiding it until a key
  // exists made the tab unreachable for the one person who can supply the key,
  // which is how this feature shipped and then sat dark for days. With no key
  // the tab opens onto the setup form instead of the queue.
  const tabOk = { monitor: true, clear: showClearTab, late: showLateTab, ai: isAdmin };
  const tab = tabOk[tabSaved] ? tabSaved : "monitor";

  // The queue's own feed: the tab badge needs the count before the tab is ever
  // opened, and LateReports reads the SAME query key, so the two share one
  // request and can never disagree about how much work is waiting.
  const { data: lateData } = useQuery({
    queryKey: ["leaders-late"],
    queryFn: () => api.get("/api/leaders/late").then((r) => r.data),
    enabled: showLateTab,
  });
  const lateTodo = lateData?.todo ?? 0;

  // The admin's Telegram card links here with ?tab=late — a decision is one tap
  // from the DM. Deliberately once per mount: the deep link opens the tab, and
  // whatever the operator switches to afterwards is theirs to keep.
  const deepLinked = useRef(false);
  useEffect(() => {
    if (deepLinked.current) return;
    deepLinked.current = true;
    const want = new URLSearchParams(window.location.search).get("tab");
    if (want && tabOk[want]) setTab(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // table-level filters (independent of the page filters above)
  const [tSearch, setTSearch] = usePersistentState(`${prefix}_table_search`, "");
  const [tBand, setTBand] = usePersistentState(`${prefix}_table_band`, "all"); // all | good | mid | bad
  const [tSort, setTSort] = usePersistentState(`${prefix}_table_sort`, { key: "score", dir: "asc" });

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ["leaders"],
    queryFn: () => api.get("/api/leaders").then((r) => r.data),
  });
  // Rows the backend could not resolve to a unit carry a null shift: they show
  // under «All» and drop out when the Smena filter narrows — visible somewhere,
  // never padded onto a shift they may not belong to.
  const rows = useMemo(() => data?.data ?? [], [data]);
  // Name → shift, for the S1/S2 chips the combined view prints beside people:
  // a unit lives in one shift, so any of a person's rows answers for them.
  const shiftOf = useMemo(() => {
    const m = new Map();
    for (const r of rows) {
      if (r.shift == null) continue;
      if (r.leader && !m.has(r.leader)) m.set(r.leader, r.shift);
      if (r.supervisor && !m.has(r.supervisor)) m.set(r.supervisor, r.shift);
    }
    return m;
  }, [rows]);
  // Chips only where two shifts can actually meet: the Smena filter on «All»,
  // seen by a viewer whose scope spans shifts. A supervisor's unit and a
  // leader's own rows are single-shift by construction — the chip is noise.
  const showShiftChips = fShift == null && !isSupervisor && !isLeader;
  const lastSynced = fmtDateTime(data?.last_synced);

  // On-page re-sync of the leaders sheet (same endpoint as the admin panel).
  const qc = useQueryClient();
  const [justSynced, setJustSynced] = useState(false);
  const refreshMut = useMutation({
    mutationFn: () => api.post("/admin/refresh-sheet/leaders").then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaders"] });
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 2500);
    },
  });

  // Verdict prose for the ONE report whose detail modal is open. Keyed on the
  // uid so reopening a report reuses the cached answer.
  const { data: aiReport } = useQuery({
    queryKey: ["leader-ai-report", detail?.uid],
    queryFn: () => api.get("/api/leader-ai/report", { params: { uid: detail.uid } })
      .then((r) => r.data),
    enabled: !!(isAdmin && detail?.uid),
  });
  // "Check this task now": one deliberate call for one task, so the admin gets
  // a verdict in seconds instead of waiting on a backlog they cannot see. The
  // busy state is keyed by task id, so only the card that was tapped spins.
  const [checkingTask, setCheckingTask] = useState(null);
  const [checkErr, setCheckErr] = useState(null);
  const aiCheckMut = useMutation({
    mutationFn: ({ uid, task_id, force }) =>
      api.post("/api/leader-ai/review-now", { uid, task_id, force }).then((r) => r.data),
    onSuccess: (res, vars) => {
      // Splice the verdict straight into the cached report so the card fills in
      // where it stands — refetching would blank every card in the modal.
      qc.setQueryData(["leader-ai-report", vars.uid], (old) => ({
        enabled: true,
        ...(old || {}),
        tasks: { ...(old?.tasks || {}), [String(vars.task_id)]: res.task },
      }));
      qc.invalidateQueries({ queryKey: ["leader-ai-overview"] });
    },
    // The failure belongs to the card that was tapped, so it is shown there —
    // a toast for a per-card action would leave the card looking untouched.
    onError: (e, vars) => setCheckErr({
      id: vars.task_id,
      msg: e?.response?.data?.detail || String(e?.message || e),
    }),
    onSettled: () => setCheckingTask(null),
  });
  // `force` re-runs a task that already has a verdict. Without it the server
  // hands back the stored answer, which is the right default — but after the
  // reviewer's questions change, the stored answer is the OLD reviewer's and
  // there is no other way to see the new one on a photo already on screen.
  const checkTask = (taskId, force = false) => {
    setCheckErr(null);
    setCheckingTask(taskId);
    aiCheckMut.mutate({ uid: detail.uid, task_id: taskId, force });
  };

  // ── admin done/not-done override (the manual ruling the AI flow can't say) ──
  // Same read-time overlay family as the AI rejection (`_apply_overlays` on the
  // server), so the register row, the score pill and the open modal all move
  // together off one refetch of ["leaders"].
  const [mFlt, setMFlt] = useState("all");    // detail-modal task filter
  const [zoom, setZoom] = useState(null);     // enlarged proof photo (object URL)
  const [ovBusy, setOvBusy] = useState(null); // { id, btn } of the pressed button
  const [ovErr, setOvErr] = useState(null);   // { id, msg } shown inside the strip
  const ovMut = useMutation({
    mutationFn: (p) => api.post("/api/leaders/task-override", p).then((r) => r.data),
    // Returning the promise keeps the pressed button spinning until the refetch
    // lands, so the card flips once, to the server's answer — never
    // optimistically and back.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaders"] }),
    // The failure belongs to the card that was tapped, exactly like checkErr.
    onError: (e, vars) => setOvErr({
      id: vars.task_id,
      msg: e?.response?.data?.detail || String(e?.message || e),
    }),
    onSettled: () => setOvBusy(null),
  });
  const setOverride = (taskId, done, btn) => {
    setOvErr(null);
    setOvBusy({ id: taskId, btn });
    ovMut.mutate({ uid: detail.uid, task_id: taskId, done,
      date: String(detail.date).slice(0, 10), leader: detail.leader });
  };
  // The open modal reads the LIVE row, not the snapshot it was opened with — an
  // override invalidates ["leaders"], and the fresh score and task states must
  // reach the modal that caused them.
  const detailRow = useMemo(
    () => (detail ? rows.find((r) => r.uid === detail.uid) || detail : null),
    [rows, detail]);
  const openDetail = (r) => {
    // Land the admin on what needs them: a report with failures opens filtered
    // to its problems, a clean one opens showing everything.
    setMFlt(r._failed > 0 ? "issues" : "all");
    setZoom(null);
    setOvErr(null);
    setCheckErr(null);
    setDetail(r);
  };

  const aiRunMut = useMutation({
    mutationFn: () => api.post("/api/leader-ai/run").then((r) => r.data),
    onSuccess: () => {
      // The drain is asynchronous; the counts here only move once it has done
      // some work, so re-read shortly after rather than pretending it is done.
      setTimeout(() => qc.invalidateQueries({ queryKey: ["leader-ai-overview"] }), 4000);
    },
  });

  // Daraja cutoffs. One global row, so every viewer grades on the same scale;
  // the server decides who may write it back rather than the client's own role.
  const { data: tierData } = useQuery({
    queryKey: ["leader-tiers"],
    queryFn: () => api.get("/api/leader-tiers").then((r) => r.data),
  });
  const tierCuts = useMemo(() => ({
    top:  tierData?.top  ?? TIER_CUTS.top,
    good: tierData?.good ?? TIER_CUTS.good,
    mid:  tierData?.mid  ?? TIER_CUTS.mid,
  }), [tierData]);
  const canEditTiers = !!tierData?.can_edit;
  const tierMut = useMutation({
    mutationFn: (cuts) => api.put("/api/leader-tiers", cuts).then((r) => r.data),
    onSuccess: (d) => { qc.setQueryData(["leader-tiers"], d); setTierEdit(null); },
  });

  // supervisor → leaders cascade
  const supLeaderMap = useMemo(() => {
    const map = { All: new Set() };
    for (const r of rows) {
      if (!r.supervisor || r.supervisor === "N/A") continue;
      if (!map[r.supervisor]) map[r.supervisor] = new Set();
      if (r.leader && r.leader !== "N/A") {
        map[r.supervisor].add(r.leader);
        map.All.add(r.leader);
      }
    }
    return map;
  }, [rows]);
  // leader → supervisor (the cascade above, reversed) for the standings column
  const leaderSup = useMemo(() => {
    const m = {};
    for (const r of rows)
      if (r.leader && r.leader !== "N/A" && r.supervisor && r.supervisor !== "N/A")
        m[r.leader] = r.supervisor;
    return m;
  }, [rows]);
  // supervisor → shift (from the row the backend tags with Manager.shift), so a
  // shift filter can also narrow the supervisor picker. An unmatched supervisor
  // has no shift and drops out once a shift is chosen.
  const supShift = useMemo(() => {
    const m = {};
    for (const r of rows) if (r.supervisor && r.supervisor !== "N/A") m[r.supervisor] = r.shift;
    return m;
  }, [rows]);
  const supervisors = useMemo(
    () => Object.keys(supLeaderMap)
      .filter((s) => s !== "All" && (fShift == null || supShift[s] === fShift))
      .sort(),
    [supLeaderMap, supShift, fShift]);
  // Leader options track the active supervisor AND shift so the picker never
  // offers a leader whose rows aren't in the current scope.
  const leaderOptions = useMemo(() => {
    const set = new Set();
    for (const r of rows) {
      if (!r.leader || r.leader === "N/A") continue;
      if (fShift != null && r.shift !== fShift) continue;
      if (fSup !== "All" && r.supervisor !== fSup) continue;
      set.add(r.leader);
    }
    return [...set].sort();
  }, [rows, fShift, fSup]);

  // date-period bounds — plain ISO-string comparison (rows carry "YYYY-MM-DD")
  const filtered = useMemo(() => rows.filter((r) => {
    const d = String(r.date).slice(0, 10);
    return (!startDate || d >= startDate) && (!endDate || d <= endDate)
      && (fShift == null || r.shift === fShift)
      && (fSup === "All" || r.supervisor === fSup)
      && (fLeader === "All" || r.leader === fLeader);
  }), [rows, startDate, endDate, fShift, fSup, fLeader]);

  // The window EVERY number on this page is scored over — exactly the picked
  // period, every calendar day in it. Nothing is inferred from where the data
  // happens to begin or end; only a cleared date input falls back to the span
  // the data itself covers, since an open edge has no other floor or ceiling.
  const scoreWin = useMemo(() => {
    let from = startDate || null, to = endDate || null;
    for (const r of filtered) {
      const d = rowDate(r);
      if (!startDate && (from == null || d < from)) from = d;
      if (!endDate && (to == null || d > to)) to = d;
    }
    return { from, to, days: from && to ? spanDays(from, to) : 0 };
  }, [filtered, startDate, endDate]);

  // The two rankings the page reads from: leaders, and units scored as the mean
  // of their leaders (so a unit filing more rows than another can't inflate its
  // calendar). Both are computed regardless of which standings tab is open —
  // the insight cards need the other one too.
  const leaderScores = useMemo(
    () => scoreSlots(slotsBy(filtered, (r) => r.leader), scoreWin.days), [filtered, scoreWin.days]);
  const supScores = useMemo(
    () => scoreSlots(slotsBy(filtered, (r) => r.supervisor), scoreWin.days), [filtered, scoreWin.days]);

  // The newest day the sheet holds ANYTHING for. Read off the raw feed, never
  // the filtered slice: narrowing to one leader must not turn that leader's own
  // misses into "not synced yet". Everything past it greys out in the grid and
  // is left off the trend line.
  const dataMax = useMemo(() => {
    let mx = null;
    for (const r of rows) {
      const d = rowDate(r);
      if (mx == null || d > mx) mx = d;
    }
    return mx;
  }, [rows]);

  // The trend chart uses a window widened to at least the last 7 days (ending
  // at the selected end date), so short periods still draw a meaningful line.
  const trendFrom = useMemo(() => {
    if (!endDate) return startDate;
    const weekAgo = isoShift(endDate, -6);
    return startDate && startDate < weekAgo ? startDate : weekAgo;
  }, [startDate, endDate]);
  const trendRows = useMemo(() => rows.filter((r) => {
    const d = String(r.date).slice(0, 10);
    return (!trendFrom || d >= trendFrom) && (!endDate || d <= endDate)
      && (fShift == null || r.shift === fShift)
      && (fSup === "All" || r.supervisor === fSup)
      && (fLeader === "All" || r.leader === fLeader);
  }), [rows, trendFrom, endDate, fShift, fSup, fLeader]);

  const hasData = filtered.length > 0;
  // Anything in flight that can still put rows on the page counts as loading —
  // the first fetch, a background refetch, and the on-page re-sync. With nothing
  // to show yet the page renders skeletons; "Ma'lumot yo'q" is reserved for a
  // FINISHED fetch that genuinely has no rows, so a slow load never reads as an
  // empty period. Once rows are on screen a refetch leaves them standing.
  const isBusy = isLoading || isFetching || refreshMut.isPending;
  const showLoading = isBusy && !hasData && !isError;

  // Headline number: the mean Reyting of everyone in the period, so it reads as
  // "the average row of the leaderboard" — not the old mean of the reports that
  // happened to arrive, which ignored every day nobody filed and therefore sat
  // ~15 points above every row it was supposed to summarise.
  const avg = useMemo(() => (leaderScores.length
    ? Math.round(leaderScores.reduce((s, e) => s + e.score, 0) / leaderScores.length)
    : 0), [leaderScores]);

  // Per-question rates, on the same footing: the denominator is every day each
  // leader owed an answer, so a day with no report is that question undone —
  // exactly what a 0% day means in the ranking.
  //
  // Two things stay out of it. A question nobody was asked (`answered: false` —
  // it was added to the form after these submissions) is left out of its own
  // rate instead of counting as a failure; rows synced before the backend
  // carried the flag have no `answered` key, so only an explicit `false`
  // excludes one. And a question is only owed from the day it first appeared on
  // the form: the missing days before that are not unanswered, they are days it
  // did not exist — otherwise a freshly added question crashes to near 0% and
  // takes the worst-task card on no evidence.
  const taskStats = useMemo(() => {
    const { from, days: winDays } = scoreWin;
    if (!filtered.length || !from || !winDays) return [];
    const leaders = new Set();
    const onForm = new Set();                            // every question id the sheet carries
    const filedPerDay = new Array(winDays).fill(0);      // (leader, day) slots that exist
    const slots = new Map();                             // "leader|date" → { i, tasks }
    for (const r of filtered) {
      const L = r.leader;
      if (!L || L === "N/A") continue;
      const d = rowDate(r);
      const i = spanDays(from, d) - 1;
      if (i < 0 || i >= winDays) continue;
      leaders.add(L);
      // Voided by the submission window: no slot, so every question counts this
      // day as owed-and-undone — the same thing a day with no report at all
      // means here. The leader stays in `leaders`, so the denominator is intact.
      if (r.rejected) continue;
      const k = `${L}|${d}`;
      let s = slots.get(k);
      if (!s) { slots.set(k, (s = { i, tasks: new Map() })); filedPerDay[i]++; }
      for (const tk of r.tasks || []) {
        const id = Number(tk.id);
        if (!Number.isFinite(id)) continue;
        onForm.add(id);                                  // keeps its axis slot either way
        if (tk.answered === false) continue;
        const a = s.tasks.get(id) || { done: 0, n: 0 };
        a.n++; if (tk.done) a.done++;
        s.tasks.set(id, a);
      }
    }
    // suffix[i] = slots filed on day i or later, to turn "days owed from day i"
    // into "days missed from day i" without walking the calendar per question.
    const suffix = new Array(winDays + 1).fill(0);
    for (let i = winDays - 1; i >= 0; i--) suffix[i] = suffix[i + 1] + filedPerDay[i];

    const acc = new Map();                               // question id → { done, asked, first }
    for (const s of slots.values())
      for (const [id, a] of s.tasks) {
        const t = acc.get(id) || { done: 0, asked: 0, first: winDays };
        t.done += a.done / a.n;                          // two shifts still settle one day
        t.asked++;
        if (s.i < t.first) t.first = s.i;
        acc.set(id, t);
      }
    const nL = leaders.size;
    return [...onForm].sort((a, b) => a - b).map((id) => {
      const t = acc.get(id);
      if (!t) return { id, asked: 0, rate: null };       // on the form, answered by nobody
      const missed = Math.max(0, nL * (winDays - t.first) - suffix[t.first]);
      const owed = t.asked + missed;
      return { id, asked: t.asked, rate: owed ? Math.round((t.done / owed) * 100) : null };
    });
  }, [filtered, scoreWin]);

  // Every question on the form keeps its slot on the axis, but one nobody has
  // answered plots as null — an empty space under its label, not a 0% bar. A 0%
  // bar would read as "the leaders never do this", when in truth they were never
  // asked, and it would take the worst-task card on no evidence.
  const chartTasks = taskStats;

  // Trend series — daily points for short windows; aggregates into weekly /
  // monthly buckets as the span grows so the date axis stays readable.
  const { trendCats, trendVals, trendTips } = useMemo(() => {
    const empty = { trendCats: [], trendVals: [], trendTips: [] };
    if (!trendRows.length) return empty;
    // Scored like the ranking: a day is divided by everyone expected to file,
    // not by whoever did, so the line dips on the days reports go missing. Days
    // past the newest one the sheet holds anything for are left OFF the line
    // rather than drawn as 0 — the grid greys those too, because a lagging sync
    // is not a day of failures. That is only the un-synced tail; an empty day
    // inside the data is a real 0, exactly as it is in the calendar.
    const perLeader = slotsBy(trendRows, (r) => r.leader);
    const roster = perLeader.size;
    if (!roster) return empty;
    const dayScore = new Map();                          // date → Σ of that day's leader scores
    let dMin = null, dMax = null;
    for (const filedDays of perLeader.values())
      for (const [d, v] of filedDays) {
        dayScore.set(d, (dayScore.get(d) || 0) + v.sum / v.n);
        if (dMin == null || d < dMin) dMin = d;
        if (dMax == null || d > dMax) dMax = d;
      }
    const from = trendFrom || dMin;
    let to = endDate || dMax;
    if (dataMax && to > dataMax) to = dataMax;
    if (!from || !to || to < from) return empty;
    const span = spanDays(from, to);
    const days = Array.from({ length: span }, (_, i) => isoShift(from, i));
    const mode = span <= 31 ? "day" : span <= 180 ? "week" : "month";
    const buckets = {};
    for (const d of days) {
      const key = mode === "day" ? d : mode === "week" ? weekStartISO(d) : d.slice(0, 7);
      (buckets[key] ||= { sum: 0, n: 0 });
      buckets[key].sum += (dayScore.get(d) || 0) / roster; buckets[key].n++;
    }
    const keys = Object.keys(buckets).sort();
    const label = (k) => (mode === "month" ? `${k.slice(5, 7)}.${k.slice(0, 4)}` : ddmm(k));
    return {
      trendCats: keys.map(label),
      trendVals: keys.map((k) => Math.round(buckets[k].sum / buckets[k].n)),
      // weekly buckets get a full "start – end" range in the tooltip
      trendTips: keys.map((k) => (mode === "week" ? `${ddmm(k)} – ${ddmm(isoShift(k, 6))}` : label(k))),
    };
  }, [trendRows, trendFrom, endDate, dataMax]);

  const effStandMode = (isSupervisor || isLeader) ? "leader" : standMode;

  // ── standings ───────────────────────────────────────────────────────────────
  // Both columns come straight out of the scoring core above, over `scoreWin` —
  // the picked period, every calendar day in it. A day with no report is a real
  // 0%, whether it falls before a leader's first submission, on a Sunday, or
  // after the last sheet sync.
  //
  //   Reyting     — each day's score averaged over EVERY day of the window, a
  //                 day with no report counting as 0%
  //   Barqarorlik — how many of those days carry a report at all, as a %
  //
  // So rating is consistency weighted by how good the filed reports were, and
  // can never exceed it; the gap between the two columns is exactly "he shows
  // up, but the reports are weak".
  const standings = useMemo(() => {
    const { from: winFrom, to: winTo, days: winDays } = scoreWin;
    // Copied because `place` is written onto the entries below and the same
    // arrays feed the insight cards.
    const list = (effStandMode === "leader" ? leaderScores : supScores).map((e) => ({ ...e }));
    // Both edges can be pre-set from the picker, so an empty result set would
    // otherwise slip through with a valid-looking window and no rows.
    if (!winFrom || !winTo || !list.length)
      return { list: [], winFrom: null, winTo: null, winDays: 0 };
    // The two columns are ONE ranking, not two: the active tab is the primary
    // metric and the other column is its sub-rating. Ranking on the primary
    // alone put five people on 1st place — a whole shift shares a 6/7 calendar,
    // so Barqarorlik is coarse by construction (only 8 values exist in a 7-day
    // window) and Reyting, the finer number, has to separate them.
    // `sent` is not a third tiebreak: it is consist over a fixed window, so it
    // can never split a pair the sub-rating already tied.
    rankPlaces(list, standMetric);
    return { list, winFrom, winTo, winDays };
  }, [leaderScores, supScores, scoreWin, effStandMode, standMetric]);

  // What the Trend column reads — the movement of the PLACE, not of a percent:
  // 57th last period, 47th this one, chip says +10. Scoped by the SAME non-date
  // filters as the ranking but over wider dates than `filtered` holds: the
  // equal-length window just before the picked one (the chip's baseline) and
  // the picked period widened to at least 7 days ending on its last day (the
  // spark — the chart-window convention). Sparks stop at `dataMax` like the
  // trend line: the un-synced tail is left off, not drawn as a dive to last
  // place, while a missing day inside the data is a real 0.
  //
  //   chip  — place(previous equal-length window) − place(picked period)
  //   spark — the place the board WOULD print if the period ended on that day,
  //           i.e. the same ranking over a window of `winDays` trailing it. So
  //           the series ends on exactly the place printed in the row, and its
  //           value one day before `winFrom` is exactly the chip's baseline —
  //           line and chip are two readings of one number, never two stories.
  //
  // Every window is ranked over the SAME roster (the people the picked range
  // shows), so the places stay commensurable: a window a person is missing from
  // scores them a real 0 there, exactly as a missing day does inside one. The
  // exception is the chip's baseline — somebody the previous period never saw
  // at all is «Yangi», not "climbed from last place".
  const standTrend = useMemo(() => {
    const EMPTY = { prev: null, prevSeen: null, sparks: new Map() };
    const { from: winFrom, to: winTo, days: winDays } = scoreWin;
    if (!winFrom || !winTo || !winDays || !standings.list.length) return EMPTY;
    const keyFn = effStandMode === "leader" ? (r) => r.leader : (r) => r.supervisor;
    const prevFrom = isoShift(winFrom, -winDays), prevTo = isoShift(winFrom, -1);
    const weekAgo = isoShift(winTo, -6);
    const sparkFrom = winFrom < weekAgo ? winFrom : weekAgo;
    const sparkTo = dataMax && winTo > dataMax ? dataMax : winTo;
    // The spark's first point needs a whole trailing window BEHIND it.
    const rollFrom = isoShift(sparkFrom, -(winDays - 1));
    const lo = prevFrom < rollFrom ? prevFrom : rollFrom;
    const prevRows = [], rollRows = [];
    for (const r of rows) {
      if ((fShift != null && r.shift !== fShift)
        || (fSup !== "All" && r.supervisor !== fSup)
        || (fLeader !== "All" && r.leader !== fLeader)) continue;
      const d = rowDate(r);
      if (d < lo || d > winTo) continue;
      if (d >= prevFrom && d <= prevTo) prevRows.push(r);
      if (d >= rollFrom && d <= sparkTo) rollRows.push(r);
    }
    const roster = standings.list.map((e) => e.name);
    // A window's scores padded back up to the roster, so the board is the same
    // size every time it is ranked.
    const onRoster = (scored) => {
      const seen = new Set(scored.map((s) => s.name));
      for (const name of roster) if (!seen.has(name)) scored.push({ name, rating: 0, consist: 0 });
      return seen;
    };

    let prev = null, prevSeen = null;
    if (prevRows.length) {
      const scored = scoreSlots(slotsBy(prevRows, keyFn), winDays);
      prevSeen = onRoster(scored);
      prev = new Map(rankPlaces(scored, standMetric).map((e) => [e.name, e.place]));
    }

    const sparks = new Map();
    const sparkDays = sparkTo >= sparkFrom
      ? Array.from({ length: spanDays(sparkFrom, sparkTo) }, (_, i) => isoShift(sparkFrom, i)) : [];
    if (sparkDays.length >= 2) {
      const byPerson = slotsBy(rollRows, keyFn);
      const names = new Set(roster);
      for (const n of byPerson.keys()) names.add(n);
      const allNames = [...names];
      const series = new Map(allNames.map((n) => [n, []]));
      // `Spark` draws 0…100 bottom-to-top and a SMALLER place is better, so the
      // place is flipped into a height against a FIXED denominator — the board
      // size, not the day's worst place, or the line would breathe with the
      // tie structure instead of tracking the person.
      const top = Math.max(1, allNames.length - 1);
      const rollDays = Array.from({ length: spanDays(rollFrom, sparkTo) }, (_, i) => isoShift(rollFrom, i));
      const head = rollDays.length - sparkDays.length;
      // One pass, sliding: each day adds itself and drops the day that fell out
      // of the trailing window, so re-ranking N days costs N sorts, not N².
      const acc = new Map(allNames.map((n) => [n, { sum: 0, n: 0 }]));
      rollDays.forEach((d, i) => {
        const gone = i >= winDays ? rollDays[i - winDays] : null;
        for (const name of allNames) {
          const days = byPerson.get(name);
          if (!days) continue;
          const a = acc.get(name);
          const came = days.get(d);
          if (came) { a.sum += came.sum / came.n; a.n++; }
          const left = gone && days.get(gone);
          if (left) { a.sum -= left.sum / left.n; a.n--; }
        }
        if (i < head) return;
        const scored = allNames.map((name) => {
          const a = acc.get(name);
          return { name, rating: Math.round(a.sum / winDays), consist: Math.round((a.n / winDays) * 100) };
        });
        for (const e of rankPlaces(scored, standMetric))
          series.get(e.name).push(100 - ((e.place - 1) / top) * 100);
      });
      for (const [name, vals] of series) sparks.set(name, vals);
    }
    return { prev, prevSeen, sparks };
  }, [rows, scoreWin, dataMax, effStandMode, standMetric, standings, fShift, fSup, fLeader]);

  // Descending is the natural reading order; flipping reverses the whole list,
  // which drops the three who need help into the card row (see StandCard).
  const standOrdered = useMemo(
    () => (standDir === "desc" ? standings.list : [...standings.list].reverse()),
    [standings, standDir]);
  // A pool of three or fewer is the whole table already — cards there would
  // leave an empty register underneath, so the podium only opens above three.
  const standTop = standOrdered.length > 3 ? standOrdered.slice(0, 3) : [];
  const standRest = standTop.length ? standOrdered.slice(3) : standOrdered;
  // Searching drops the cards and searches the FULL ranking instead of the
  // leftovers, so a name that sits on the podium is still findable.
  const standRows = useMemo(() => {
    const q = standSearch.trim().toLowerCase();
    if (!q) return standRest;
    return standOrdered.filter((e) => nm(e.name).toLowerCase().includes(q) || e.name.toLowerCase().includes(q));
  }, [standRest, standOrdered, standSearch, lang]);

  // The day calendar mirrors the ranking: same order, same toggle, same search —
  // but the podium three stay IN the grid. The register can drop them because a
  // card is standing right above it; the calendar is read as one block, and a
  // hole where first place should be would just look like a bug.
  const heatRows = standSearch.trim() ? standRows : standOrdered;
  // One column per day of the SAME window the metrics are scored over, so a
  // row's green count is literally the "6/7" printed beside it in the register.
  const heatDates = useMemo(() => {
    const { winFrom, winDays } = standings;
    if (!winFrom || !winDays) return [];
    return Array.from({ length: winDays }, (_, i) => isoShift(winFrom, i));
  }, [standings]);

  // Both registers page instead of scrolling: ten ranking rows and nine calendar
  // strips per page, so the card ends on a whole row and the page underneath is
  // reachable without trapping the wheel inside a table.
  // A shrinking list (a search that now matches five people) must not strand you
  // on a page that no longer exists, so the live page is clamped as it renders.
  const STAND_PAGE_SIZE = 10;
  const standPageCount = Math.max(1, Math.ceil(standRows.length / STAND_PAGE_SIZE));
  const standPg = Math.min(standPage, standPageCount);
  const standPageRows = standRows.slice((standPg - 1) * STAND_PAGE_SIZE, standPg * STAND_PAGE_SIZE);
  const hmPageCount = Math.max(1, Math.ceil(heatRows.length / HM_ROWS_OPEN));
  const hmPg = Math.min(hmPage, hmPageCount);
  const heatPageRows = heatRows.slice((hmPg - 1) * HM_ROWS_OPEN, hmPg * HM_ROWS_OPEN);
  // Re-ranking sends you back to page 1: after flipping the sort or the tab,
  // row 1 is the whole point, and staying on page 3 hides that anything changed.
  // Skipped on first mount so the persisted page numbers survive a revisit.
  const pagerResetMounted = useRef(false);
  useEffect(() => {
    if (!pagerResetMounted.current) { pagerResetMounted.current = true; return; }
    setStandPage(1); setHmPage(1);
  }, [standMetric, standDir, effStandMode, standSearch, startDate, endDate, fShift, fSup, fLeader]);
  // Tabs and sortable headers drive the same pair of knobs — re-picking the
  // column that is already active flips the direction, as a table should.
  const standSort = { key: standMetric, dir: standDir };
  const onStandSort = (k) =>
    (k === standMetric ? setStandDir((d) => (d === "desc" ? "asc" : "desc")) : setStandMetric(k));

  // Insight cards: the worst task plus the worst-performing supervisor / leader.
  const insights = useMemo(() => {
    let lowTask = null;
    // `rate == null` (nobody answered) is not a low score — skip it, or it wins.
    chartTasks.forEach((t) => {
      if (t.rate == null) return;
      if (lowTask == null || t.rate < lowTask.val) lowTask = { id: t.id, val: t.rate };
    });

    // The badge is the Reyting off the leaderboard, not a private average: this
    // card names the person at the bottom of the ranking, so it has to print the
    // number their row prints. Ties keep the first name in ranking order.
    const worst = (list) => {
      let lo = null;
      for (const e of list) if (lo == null || e.rating < lo.val) lo = { name: e.name, val: e.rating };
      return lo;
    };
    return { lowTask, lowSup: worst(supScores), lowLeader: worst(leaderScores) };
  }, [chartTasks, supScores, leaderScores]);

  // table rows: search + score-band filter, then sortable columns
  const displayRows = useMemo(() => {
    const q = tSearch.trim().toLowerCase();
    let arr = filtered.map((r) => ({
      ...r,
      // an unasked question is not a missed one
      // Effective failures: the admin's ruling beats the AI's, which beats the
      // leader's own answer — the same precedence the score itself is built on,
      // so this count can never disagree with the percentage beside it.
      _failed: (r.tasks || []).filter((tk) =>
        tk.answered !== false && !(tk.admin_done ?? (tk.done && !tk.ai_rejected))).length,
      _late: lateDays(r),
    }));
    if (q) arr = arr.filter((r) => `${tl(r.leader)} ${r.leader}`.toLowerCase().includes(q));
    if (tBand !== "all") arr = arr.filter((r) => {
      const v = r.completion;
      return tBand === "good" ? v >= 85 : tBand === "mid" ? (v >= 50 && v < 85) : v < 50;
    });
    const dir = tSort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (tSort.key === "date") return a.date < b.date ? -dir : a.date > b.date ? dir : 0;
      if (tSort.key === "leader") return tl(a.leader).localeCompare(tl(b.leader)) * dir;
      if (tSort.key === "failed") return (a._failed - b._failed) * dir;
      // submissions with no timestamp (pre-form-change rows) sort to the bottom
      if (tSort.key === "submitted") {
        const av = a.submitted_at || "", bv = b.submitted_at || "";
        if (!av || !bv) return !av && !bv ? 0 : !av ? 1 : -1;
        return av < bv ? -dir : av > bv ? dir : 0;
      }
      return (a.completion - b.completion) * dir;          // score
    });
    return arr;
  }, [filtered, tSearch, tBand, tSort, tl]);

  const toggleSort = (key) => setTSort((s) => ({ key, dir: s.key === key && s.dir === "asc" ? "desc" : "asc" }));
  // colored score-band chips, matching the badge palette
  const BANDS = [
    { id: "all",  label: T.bandAll, color: "var(--brand)" },
    { id: "good", label: "≥85%",    color: C_GOOD },
    { id: "mid",  label: "50–84%",  color: C_MID },
    { id: "bad",  label: "<50%",    color: C_BAD },
  ];

  // ── chart options ────────────────────────────────────────────────────────────
  const chartBase = { background: "transparent", toolbar: { show: false }, animations: { enabled: false }, parentHeightOffset: 0, fontFamily: "inherit" };
  // faint dashed grid so the eye can track values without the lines shouting
  const grid = (axis) => ({ borderColor: gridColor, strokeDashArray: 4, xaxis: { lines: { show: axis === "x" } }, yaxis: { lines: { show: axis !== "x" } }, padding: { top: 0, right: 10, bottom: 0, left: 8 } });
  const axisLabel = { style: { colors: labelColor, fontSize: "10px" } };

  // Trend — smooth spline grounded by a soft gradient wash fading to transparent.
  const trendOptions = {
    chart: { ...chartBase, type: "area", zoom: { enabled: false } },
    colors: [C_TREND],
    stroke: { curve: "smooth", width: 3, lineCap: "round" },
    fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.02, stops: [0, 90, 100] } },
    // clean spline: no static dot markers — a single marker surfaces on hover
    markers: { size: 0, colors: ["#fff"], strokeColors: C_TREND, strokeWidth: 2, hover: { size: 5 } },
    dataLabels: { enabled: false },
    grid: grid("y"),
    xaxis: { categories: trendCats, tickAmount: trendCats.length > 14 ? 12 : undefined, labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false }, tooltip: { enabled: false } },
    yaxis: { min: 0, max: 100, tickAmount: 4, labels: { ...axisLabel, formatter: (v) => Math.round(v) } },
    tooltip: { custom: ({ dataPointIndex }) => tipHTML(trendTips[dataPointIndex] ?? "", `${trendVals[dataPointIndex]}%`, C_TREND) },
  };

  // Per-task bars — rounded tops, vertical gradient (lighter top → darker base),
  // no in-bar numbers; the styled tooltip carries the value on hover.
  const taskOptions = {
    chart: { ...chartBase, type: "bar" },
    plotOptions: { bar: { distributed: true, borderRadius: 6, borderRadiusApplication: "end", columnWidth: "56%" } },
    // an unanswered question carries no colour — its slot stays empty
    colors: chartTasks.map((t) => (t.rate == null ? "transparent" : scoreColor(t.rate))),
    fill: { type: "gradient", gradient: { type: "vertical", gradientToColors: chartTasks.map((t) => (t.rate == null ? "transparent" : mix(scoreColor(t.rate), -0.24))), inverseColors: false, opacityFrom: 1, opacityTo: 1, stops: [0, 100] } },
    states: { hover: { filter: { type: "lighten", value: 0.08 } } },
    dataLabels: { enabled: false },
    legend: { show: false },
    grid: grid("y"),
    xaxis: { categories: chartTasks.map((t) => `T${t.id}`), labels: axisLabel, axisBorder: { show: false }, axisTicks: { show: false } },
    yaxis: { min: 0, max: 100, tickAmount: 4, labels: axisLabel },
    tooltip: { custom: ({ dataPointIndex }) => {
      const t = chartTasks[dataPointIndex];
      if (t.rate == null) return tipHTML(`${T.task} ${t.id}`, T.notAsked, "#94a3b8");
      return tipHTML(`${T.task} ${t.id}`, `${t.rate}%`, scoreColor(t.rate));
    } },
  };

  // ── render ─────────────────────────────────────────────────────────────────
  // Header + view tabs are shared by both views, so they are built once here
  // and the clear tab returns early below with the same chrome above it.
  const headerBar = (
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold leading-tight" style={{ color: "var(--text-1)" }}>{pageTitle}</h2>
          {/* phones can't spare a whole pill row — updated time rides under the title */}
          {tab === "monitor" && (
          <p className="sm:hidden text-[11px] mt-1 inline-flex items-center gap-1" style={{ color: "var(--text-4)" }} title={lastSynced || T.never}>
            <CalendarClock size={12} style={{ color: "var(--brand-text)" }} />
            {T.lastSynced}: <span style={{ color: "var(--text-3)" }}>{lastSynced || T.never}</span>
          </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {tab === "monitor" && (
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs" style={{ background: "var(--bg-card)", border: "1px solid var(--border)", color: "var(--text-2)" }}>
            <CalendarClock size={14} style={{ color: "var(--brand-text)" }} />
            {T.lastSynced}: <span style={{ color: "var(--text-3)" }}>{lastSynced || T.never}</span>
          </span>
          )}
          {canRefresh && tab === "monitor" && (
            <button onClick={() => refreshMut.mutate()} disabled={refreshMut.isPending}
              aria-label={T.refresh} title={T.refresh}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors flex-shrink-0"
              style={justSynced
                ? { background: hexA(C_GOOD, 0.15), border: `1px solid ${hexA(C_GOOD, 0.35)}`, color: C_GOOD }
                : { background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)", opacity: refreshMut.isPending ? 0.6 : 1 }}>
              {refreshMut.isPending ? <Loader2 size={14} className="animate-spin" />
                : justSynced ? <CheckCircle2 size={14} />
                : <RefreshCw size={14} />}
              <span className="hidden sm:inline">{refreshMut.isPending ? T.refreshing : justSynced ? T.refreshed : T.refresh}</span>
            </button>
          )}
        </div>
      </div>
  );

  const tabsBar = (showClearTab || showLateTab) ? (
    <div className="mb-3">
      {/* No `scrollable` here: it makes the track w-full, and inside a block
          div that stretches the bar across the page. Two or three short tabs
          never overflow, so the toggle shrink-wraps to its labels instead. */}
      <SegmentedToggle asTabs ariaLabel={pageTitle} value={tab} onChange={setTab}
        options={[
          ["monitor", T.tabMonitor],
          // The badge is what this viewer still owes — an admin's pending
          // decisions, a brigadir's un-asked days — so the tab is a to-do
          // count, not a total that never goes down.
          ...(showLateTab ? [{
            value: "late",
            label: (
              <span className="inline-flex items-center gap-1.5">
                {T.tabLate}
                {lateTodo > 0 && (
                  <span className="px-1.5 rounded-full text-[10px] font-bold tabular-nums"
                    style={{ background: "#eab308", color: "#1a1a1a" }}>{lateTodo}</span>
                )}
              </span>
            ),
          }] : []),
          // Same to-do logic as «Kechikkan»: the badge is what is left to
          // decide, so an admin who works the queue watches it reach zero.
          ...(isAdmin ? [{
            value: "ai",
            label: (
              <span className="inline-flex items-center gap-1.5">
                {T.tabAi}
                {aiOn && aiTodo > 0 && (
                  <span className="px-1.5 rounded-full text-[10px] font-bold tabular-nums"
                    style={{ background: "#eab308", color: "#1a1a1a" }}>{aiTodo}</span>
                )}
              </span>
            ),
          }] : []),
          ...(showClearTab ? [["clear", T.tabClear]] : []),
        ]} />
    </div>
  ) : null;

  // A run is STARTED from the register (Monitoring) and WATCHED from the AI
  // tab, so the bar is bolted to the tab strip rather than to either view — a
  // progress bar you have to navigate to is one nobody sees. It renders nothing
  // unless a run is live, so it costs the other tabs no space.
  const pageChrome = (
    <>
      {tabsBar}
      {isAdmin && <AiProgress showIdle={tab === "ai"} />}
    </>
  );

  if (tab === "clear") {
    return (
      <Layout title={pageTitle}>
        {headerBar}
        {pageChrome}
        <BotDataClear />
      </Layout>
    );
  }

  if (tab === "late") {
    return (
      <Layout title={pageTitle}>
        {headerBar}
        {pageChrome}
        <LateReports canDecide={!!lateData?.can_decide} />
      </Layout>
    );
  }

  if (tab === "ai") {
    return (
      <Layout title={pageTitle}>
        {headerBar}
        {pageChrome}
        {/* The request control belongs where an admin looks for AI actions.
            It stays in the register header too — that is where you notice a
            suspect row — but this tab is where you come to run one. */}
        <AiTriage T={T} lang={lang} taskDetail={taskDetail} nm={nm}
          actions={<AiRecheck errorCount={aiData?.counts?.error || 0} />} />
      </Layout>
    );
  }

  return (
    <Layout title={pageTitle}>
      {headerBar}
      {pageChrome}

      {/* ONE-ROW filter bar: period inline; shift / supervisor / leader live in
          the consolidated panel (role-scoped) and surface as chips when active. */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <DateRangePicker
          dateFrom={startDate}
          dateTo={endDate}
          setDateFrom={setStartDate}
          setDateTo={setEndDate}
          compactLabel
          triggerClassName="px-3 py-2 text-sm"
        />
        {(!isLeader) && (
          <FilterPanel
            sections={[
              // Shift — hidden for supervisors (locked to their unit/shift).
              ...(!isSupervisor ? [{
                key: "shift", icon: Layers, label: T.shift,
                active: fShift != null,
                display: fShift != null ? `S${fShift}` : "",
                onClear: () => { setFShift(null); setFSup("All"); setFLeader("All"); },
                render: () => (
                  <SegmentedToggle fill value={fShift}
                    onChange={(v) => { setFShift(v); setFSup("All"); setFLeader("All"); }}
                    options={[[null, T.bandAll], [1, "S1"], [2, "S2"]]} />
                ),
              }] : []),
              // Supervisor — shift-managers / admins only.
              ...(!isSupervisor ? [{
                key: "supervisor", icon: ShieldCheck, label: T.supervisor,
                active: fSup !== "All",
                display: fSup !== "All" ? nm(fSup) : "",
                onClear: () => { setFSup("All"); setFLeader("All"); },
                render: ({ close } = {}) => (
                  <PickFilter searchable close={close}
                    opts={[{ value: "All", label: T.allSups }, ...supervisors.map((s) => ({ value: s, label: nm(s), title: nm(s) }))]}
                    value={fSup}
                    onChange={(v) => { setFSup(v); setFLeader("All"); }} />
                ),
              }] : []),
              {
                key: "leader", icon: User, label: T.leader,
                active: fLeader !== "All",
                display: fLeader !== "All" ? nm(fLeader) : "",
                onClear: () => setFLeader("All"),
                render: ({ close } = {}) => (
                  <PickFilter searchable close={close}
                    opts={[{ value: "All", label: T.allLeaders }, ...leaderOptions.map((l) => ({ value: l, label: nm(l), title: nm(l) }))]}
                    value={fLeader}
                    onChange={setFLeader} />
                ),
              },
            ]}
          />
        )}
      </div>

      {refreshMut.isError && (
        <div className="rounded-2xl p-3 text-xs mb-3" style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {refreshMut.error?.response?.data?.detail || String(refreshMut.error)}
        </div>
      )}

      {/* KPI / insight cards */}
      <div className={`grid grid-cols-2 ${isSupervisor ? "lg:grid-cols-3" : isLeader ? "lg:grid-cols-2" : "lg:grid-cols-4"} gap-3 mb-4`}>
        {/* Average success — hero: the only card with an accent glow */}
        <StatCard label={T.avgSuccess} icon={Gauge} tip={T.tipAvg} loading={showLoading}
          value={hasData ? `${avg}%` : "—"}
          valueColor={hasData ? scoreColor(avg) : "var(--text-4)"}
          accent={hasData ? scoreColor(avg) : undefined} />

        {/* Lowest-success task */}
        <StatCard label={T.lowTask} icon={AlertTriangle} loading={showLoading}
          tip={hasData && insights.lowTask ? `T${insights.lowTask.id}: ${taskDetail(insights.lowTask.id, lang).n}` : T.tipLowTask}
          value={hasData && insights.lowTask ? `T${insights.lowTask.id}` : "—"}
          badge={hasData && insights.lowTask ? `${insights.lowTask.val}%` : null}
          badgeColor={hasData && insights.lowTask ? scoreColor(insights.lowTask.val) : "var(--text-4)"} />

        {/* Lowest-performing supervisor — shift-managers / admins only */}
        {!isSupervisor && !isLeader && (
          <StatCard label={T.lowSup} icon={Users} tip={T.tipLowSup} fit loading={showLoading}
            value={hasData && insights.lowSup ? nm(insights.lowSup.name) : "—"}
            badge={hasData && insights.lowSup ? `${insights.lowSup.val}%` : null}
            badgeColor={hasData && insights.lowSup ? scoreColor(insights.lowSup.val) : "var(--text-4)"} />
        )}

        {/* Lowest-performing leader — hidden for a leader (it's just themselves) */}
        {!isLeader && (
          <StatCard label={T.lowLeader} icon={User} tip={T.tipLowLeader} fit loading={showLoading}
            value={hasData && insights.lowLeader ? nm(insights.lowLeader.name) : "—"}
            badge={hasData && insights.lowLeader ? `${insights.lowLeader.val}%` : null}
            badgeColor={hasData && insights.lowLeader ? scoreColor(insights.lowLeader.val) : "var(--text-4)"} />
        )}
      </div>

      {isError && (
        <div className="rounded-2xl p-4 text-sm mb-4" style={{ background: "var(--bg-card)", border: "1px solid #ef4444", color: "#ef4444" }}>
          {error?.response?.data?.detail || "Error"}
        </div>
      )}
      {showLoading && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
                <SkeletonBlock className="h-3 w-36 mb-4" /><SkeletonChart className="h-60" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl p-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SkeletonBlock className="h-3 w-44 mb-4" /><SkeletonChart className="h-56" />
          </div>
        </div>
      )}
      {!showLoading && !isError && !hasData && (
        <div className="rounded-2xl" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <EmptyState title={T.noData} message={null} showUploadLink={false} />
        </div>
      )}

      {hasData && (<>
        {/* Trend + Task */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead icon={TrendingUp} title={T.trend} />
            <div className="px-3 pb-3 pt-1 apx-bare-tip"><ReactApexChart type="area" series={[{ name: "%", data: trendVals }]} options={trendOptions} height={260} /></div>
          </div>
          <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
            <SectionHead icon={BarChart3} title={T.taskTitle}
              right={<button onClick={() => setTaskInfo(true)} className="p-1 rounded transition-colors hover:bg-white/10" title={T.taskInfoTitle} style={{ color: "var(--brand-text)" }}><Info size={15} /></button>} />
            <div className="px-3 pb-3 pt-1 apx-bare-tip"><ReactApexChart type="bar" series={[{ name: "%", data: chartTasks.map((t) => t.rate) }]} options={taskOptions} height={260} /></div>
          </div>
        </div>

        {/* Standings — hidden for a leader (a one-row ranking of themselves) */}
        {!isLeader && (
        <div className="mb-4">
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={Trophy} title={effStandMode === "leader" ? T.standing : T.supStanding}
            right={
              <div className="flex items-center gap-2">
                {!isSupervisor && !isLeader && (
                  <SegmentedToggle value={standMode} onChange={setStandMode} options={[["leader", T.toggleLeader], ["sup", T.toggleSup]]} />
                )}
                <SegmentedToggle value={standDir} onChange={setStandDir}
                  options={[["desc", <ArrowDownNarrowWide key="d" size={13} />], ["asc", <ArrowUpNarrowWide key="a" size={13} />]]} />
              </div>
            } />

          {/* metric tabs (= the sort presets) + name search */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <SegmentedToggle value={standMetric} onChange={setStandMetric}
              options={[["rating", T.standRating], ["consist", T.standConsist]]} />
            <button onClick={() => setStandInfo(true)} title={T.standInfo}
              className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: "var(--brand-text)" }}>
              <Info size={15} />
            </button>
            {canEditTiers && (
              <button onClick={() => setTierEdit(tierCuts)} title={T.tierEdit}
                className="p-1 rounded transition-colors hover:bg-white/10" style={{ color: "var(--text-3)" }}>
                <SlidersHorizontal size={15} />
              </button>
            )}
            {standings.winFrom && (
              <span className="hidden md:inline text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                {T.winLabel}: {ddmm(standings.winFrom)} – {ddmm(standings.winTo)} · {standings.winDays} {T.dayAbbr}
              </span>
            )}
            <SearchInput value={standSearch} onChange={setStandSearch} className="ml-auto w-full sm:w-56"
              placeholder={effStandMode === "leader" ? T.searchPh : T.supSearchPh} />
          </div>

          {/* podium — the best three, or the three who need help when flipped */}
          {!standSearch.trim() && standTop.length === 3 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3">
              {standTop.map((e) => (
                <StandCard key={e.name} e={e} name={nm(e.name)} worst={standDir === "asc"} metric={standMetric} T={T} cuts={tierCuts} trend={standTrend}
                  shift={showShiftChips ? shiftOf.get(e.name) : null} />
              ))}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <Th label={T.thPlace} cls="w-[58px]" />
                  <Th label={effStandMode === "leader" ? T.thLeader : T.supervisor} cls="border-l border-[var(--border)]" />
                  {effStandMode === "leader" && !isSupervisor && (
                    <Th label={T.supervisor} cls="border-l border-[var(--border)] w-[180px]" />
                  )}
                  <Th label={T.thTrend} hint={T.trendHint} cls="border-l border-[var(--border)] w-[168px]" />
                  <Th label={T.thDays} cls="border-l border-[var(--border)] w-[132px]" hint={`${T.daysSent} / ${T.winLabel}`} />
                  <Th label={T.standRating} k="rating" sort={standSort} onSort={onStandSort}
                    hint={standMetric === "rating" ? T.standPrimaryHint : T.standSubHint}
                    cls="border-l border-[var(--border)] w-[104px]" />
                  <Th label={T.standConsist} k="consist" sort={standSort} onSort={onStandSort}
                    hint={standMetric === "consist" ? T.standPrimaryHint : T.standSubHint}
                    cls="border-l border-[var(--border)] w-[112px]" />
                  <Th label={T.thTier} cls="border-l border-[var(--border)] w-[116px]" />
                </tr>
              </thead>
              <tbody>
                {standPageRows.map((e) => {
                  const ranked = standMetric === "consist" ? e.consist : e.rating;
                  return (
                    <tr key={e.name} className="transition-colors hover:bg-[var(--bg-inner)]"
                      style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-3)" }}>{e.place}</td>
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}
                        title={nm(e.name)}>
                        <span className="inline-flex items-center gap-2">
                          <Avatar name={nm(e.name)} size={24} />
                          <span style={{ color: "var(--text-1)" }}>{initialSurname(nm(e.name))}</span>
                          {showShiftChips && <ShiftChip shift={shiftOf.get(e.name)} T={T} />}
                        </span>
                      </td>
                      {effStandMode === "leader" && !isSupervisor && (
                        <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}
                          title={leaderSup[e.name] ? nm(leaderSup[e.name]) : undefined}>
                          <span style={{ color: "var(--text-2)" }}>
                            {leaderSup[e.name] ? initialSurname(nm(leaderSup[e.name])) : "—"}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}>
                        <TrendCell trend={standTrend} e={e} T={T} />
                      </td>
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}
                        title={`${T.daysSent}: ${e.sent} · ${T.daysMissed}: ${e.missed}`}>
                        <div className="font-bold" style={{ color: "var(--text-1)" }}>
                          <DaysValue e={e} />
                        </div>
                        <Meter pct={daysPct(e)} color={scoreColor(daysPct(e))} />
                      </td>
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}>
                        <div className="font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{e.rating}%</div>
                        <Meter pct={e.rating} color={scoreColor(e.rating)} />
                      </td>
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}>
                        <div className="font-bold tabular-nums" style={{ color: "var(--text-1)" }}>{e.consist}%</div>
                        <Meter pct={e.consist} color={scoreColor(e.consist)} />
                      </td>
                      <td className="px-3 py-2 border-l" style={{ borderColor: "var(--border)" }}>
                        <TierChip value={ranked} T={T} cuts={tierCuts} />
                      </td>
                    </tr>
                  );
                })}
                {!standRows.length && (
                  <tr style={{ borderTop: "1px solid var(--border)" }}>
                    <td colSpan={effStandMode === "leader" && !isSupervisor ? 8 : 7} className="px-3 py-6 text-center text-xs" style={{ color: "var(--text-4)" }}>{T.noMatch}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        <Pagination page={standPg} pageCount={standPageCount} total={standRows.length}
          pageSize={STAND_PAGE_SIZE} onPage={setStandPage} />
        </div>
        )}

        {/* Day calendar — its own card. It still mirrors the ranking above (same
          * order, same toggle, same search), so it carries the scoring window in
          * its header rather than repeating that card's controls. */}
        {!isLeader && heatDates.length > 0 && heatRows.length > 0 && (
        <div className="mb-4">
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={CalendarDays} title={T.hmTitle}
            subtitle={`${ddmm(standings.winFrom)} – ${ddmm(standings.winTo)} · ${standings.winDays} ${T.dayAbbr}`}
            right={<HmLegend T={T} hasVoid={dataMax != null && heatDates[heatDates.length - 1] > dataMax} />} />
          <DayGrid rows={heatPageRows} dates={heatDates} dataMax={dataMax} T={T} nm={nm}
            nameHead={effStandMode === "leader" ? T.thLeader : T.supervisor} />
        </div>
        <Pagination page={hmPg} pageCount={hmPageCount} total={heatRows.length}
          pageSize={HM_ROWS_OPEN} onPage={setHmPage} />
        </div>
        )}

        {/* Recent submissions */}
        <div className="rounded-2xl overflow-hidden mb-4" style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
          <SectionHead icon={ListChecks} title={T.tableTitle}
            right={aiOn ? (
              /* Queue state for the pilot. Without it "no flags" is ambiguous —
                 it reads the same whether nothing is suspect or nothing has
                 been reviewed yet. The counts say which. */
              <span className="flex items-center gap-2">
                {/* OPEN, not lifetime-flagged: the strip is a to-do, and the
                    tab beside it is where the doing happens. */}
                {aiTodo > 0 && (
                  <button onClick={() => setTab("ai")}
                    className="text-[11px] font-semibold tabular-nums hover:underline underline-offset-2"
                    style={{ color: C_AI }}>
                    {aiTodo} {T.aiFlagsN}
                  </button>
                )}
                {!!(aiData?.counts?.pending || aiData?.counts?.error) && (
                  <span className="text-[11px] tabular-nums" style={{ color: "var(--text-4)" }}>
                    {(aiData.counts.pending || 0) + (aiData.counts.error || 0)} {T.aiPendingN}
                  </span>
                )}
                <AiCalibration cal={aiData?.calibration} T={T} />
                <Button size="sm" variant="secondary" tint loading={aiRunMut.isPending}
                  icon={<Sparkles size={13} />} onClick={() => aiRunMut.mutate()}>
                  {aiRunMut.isPending ? T.aiRunning : T.aiRun}
                </Button>
                {/* Its sibling: «run» judges what has never been judged,
                    «re-check» re-earns answers the reviewer already gave under
                    questions it no longer asks. Both used to be shell work. */}
                <AiRecheck errorCount={aiData?.counts?.error || 0} />
              </span>
            ) : undefined} />

          {/* table-level filters: leader search + score-band chips */}
          <div className="flex flex-wrap items-center gap-2 px-3 py-2.5" style={{ borderBottom: "1px solid var(--border)" }}>
            <SearchInput
              value={tSearch}
              onChange={setTSearch}
              placeholder={T.searchPh}
              className="flex-1 min-w-[150px]"
            />
            <SegmentedToggle
              value={tBand}
              onChange={setTBand}
              options={BANDS.map((b) => [b.id, b.label])}
            />
          </div>

          {displayRows.length === 0 ? (
            <div className="p-8 text-center text-sm" style={{ color: "var(--text-4)" }}>{T.noMatch}</div>
          ) : (<>
            {/* desktop / tablet: sortable table (canonical POSITIONS-style) */}
            <div className="hidden sm:block overflow-auto" style={{ maxHeight: 460 }}>
              <table className="w-full text-xs whitespace-nowrap [&_th:not(:last-child)]:border-r [&_td:not(:last-child)]:border-r [&_th]:border-[var(--border)] [&_td]:border-[var(--border)] [&_tbody_tr]:border-t [&_tbody_tr]:border-[var(--border)] [&_tbody_tr:hover]:bg-[var(--bg-inner)]" style={{ color: "var(--text-1)", minWidth: 680 }}>
                <thead>
                  <tr>
                    <Th label={T.thDate}      k="date"      sort={tSort} onSort={toggleSort} />
                    <Th label={T.thSubmitted} k="submitted" sort={tSort} onSort={toggleSort} />
                    <Th label={T.thLeader}    k="leader"    sort={tSort} onSort={toggleSort} />
                    <Th label={T.thScore}     k="score"     sort={tSort} onSort={toggleSort} align="center" />
                    <Th label={T.thFailed}    k="failed"    sort={tSort} onSort={toggleSort} />
                    <Th label={T.thAction} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((r) => (
                    <tr key={r.uid}>
                      <td className="px-3 py-2" style={{ color: "var(--text-4)" }}>{fmtDate(r.date, lang)}</td>
                      <td className="px-3 py-2" style={{ color: "var(--text-4)" }}>
                        <span className="inline-flex items-center gap-1.5">
                          {/* a voided row still prints its time — including the
                              em-dash of a row that never carried one, which is
                              itself the reason it was voided */}
                          <span className="tabular-nums">{r.submitted_at ? hhmm(r.submitted_at) : "—"}</span>
                          {r._late > 0 && <LateChip days={r._late} T={T} />}
                          <DayFlag row={r} T={T} />
                        </span>
                      </td>
                      <td className="px-3 py-2 font-medium" style={{ color: "var(--text-1)" }}>
                        <span className="inline-flex items-center gap-1.5">
                          {nm(r.leader)}
                          {/* Admin-only: how many of this report's tasks the AI
                              doubts, so a suspect day is findable without
                              opening all of them. Null for everyone else. */}
                          {aiOn && <AiChip n={aiFlags[r.uid]} T={T} />}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {/* Grey, not traffic-light, once the window voided the row:
                            the sheet's own figure still shows, but it no longer
                            says anything about the day's score. */}
                        <span title={r.rejected ? T.voidTitle : undefined}
                          className="inline-block px-2.5 py-1 rounded-full text-xs font-bold text-white tabular-nums"
                          style={{ background: r.rejected ? C_FLAT : scoreColor(r.completion) }}>
                          {Math.round(r.completion)}%
                        </span>
                      </td>
                      <td className="px-3 py-2" style={{ color: r._failed ? "#ef4444" : "var(--text-4)" }}>{r._failed} {T.missed}</td>
                      <td className="px-3 py-2 text-right">
                        <button onClick={() => openDetail(r)} className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                          style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                          {T.details}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* mobile: stacked cards */}
            <div className="sm:hidden overflow-y-auto" style={{ maxHeight: 480 }}>
              {displayRows.map((r, i) => (
                <div key={r.uid} className="p-3 flex flex-col gap-2" style={i ? { borderTop: "1px solid var(--border)" } : undefined}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-semibold leading-tight" style={{ color: "var(--text-1)" }}>
                      {nm(r.leader)}
                      {aiOn && aiFlags[r.uid] ? <> <AiChip n={aiFlags[r.uid]} T={T} /></> : null}
                    </span>
                    <span className="inline-block px-2.5 py-1 rounded-full text-xs font-bold text-white tabular-nums flex-shrink-0"
                      style={{ background: r.rejected ? C_FLAT : scoreColor(r.completion) }}>
                      {Math.round(r.completion)}%
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs" style={{ color: "var(--text-4)" }}>{fmtDate(r.date, lang)}</span>
                    <span className="text-xs" style={{ color: r._failed ? "#ef4444" : "var(--text-4)" }}>{r._failed} {T.missed}</span>
                  </div>
                  {(r.submitted_at || r.late_state) && (
                    <div className="flex items-center flex-wrap gap-1.5 text-xs" style={{ color: "var(--text-4)" }}>
                      <Clock size={11} />
                      <span className="tabular-nums">{r.submitted_at ? hhmm(r.submitted_at) : "—"}</span>
                      {r._late > 0 && <LateChip days={r._late} T={T} />}
                      <DayFlag row={r} T={T} />
                    </div>
                  )}
                  <button onClick={() => openDetail(r)} className="w-full px-3 py-2 rounded-lg text-xs font-semibold transition-opacity hover:opacity-80"
                    style={{ background: "var(--brand-bg)", border: "1px solid var(--brand-border)", color: "var(--brand-text)" }}>
                    {T.details}
                  </button>
                </div>
              ))}
            </div>
          </>)}
        </div>
      </>)}

      {/* Detail modal — one report, summary first, then its tasks as compact
          rows. Single column on purpose: the old two-up grid of photo-height
          cards buried the two failed tasks an admin opens this for under a
          metre of green ones. */}
      {detail && detailRow && (() => {
        const tasksAll = detailRow.tasks || [];
        // Effective state, same precedence the score is built on: the admin's
        // ruling beats the AI's, which beats the leader's own answer.
        const effDoneOf = (tk) => tk.admin_done ?? (!!tk.done && !tk.ai_rejected);
        const asked = tasksAll.filter((tk) => tk.answered !== false);
        const nDone = asked.filter(effDoneOf).length;
        const nFail = asked.length - nDone;
        // An "issue" is anything the admin may need to act on: an effective
        // failure, or a task the AI still doubts.
        const isIssue = (tk) => tk.answered !== false &&
          (!effDoneOf(tk) || (aiOn && aiReport?.tasks?.[String(Number(tk.id))]?.status === "flagged"));
        const nIssues = tasksAll.filter(isIssue).length;
        // A filter that just emptied itself (the admin fixed the last issue)
        // falls back to «all» instead of a blank list.
        const flt = nIssues > 0 ? mFlt : "all";
        const shown = flt === "issues" ? tasksAll.filter(isIssue) : tasksAll;
        const late = lateDays(detailRow);
        return (
        <Modal maxWidth="max-w-2xl" icon={ListChecks}
          title={nm(detailRow.leader)}
          subtitle={`${T.modalTitle} · ${fmtDate(detailRow.date, lang)}`}
          onClose={() => setDetail(null)}>

          {/* summary band: the day's verdict before any of its evidence */}
          <div className="flex items-center flex-wrap gap-2">
            <span title={detailRow.rejected ? T.voidTitle : undefined}
              className="inline-flex items-center px-3 py-1 rounded-xl text-base font-bold text-white tabular-nums"
              style={{ background: detailRow.rejected ? C_FLAT : scoreColor(detailRow.completion) }}>
              {Math.round(detailRow.completion)}%
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold tabular-nums"
              style={{ background: hexA(C_GOOD, 0.12), color: C_GOOD, border: `1px solid ${hexA(C_GOOD, 0.3)}` }}>
              <CheckCircle2 size={12} />{nDone}/{asked.length} {T.sumDone}
            </span>
            {nFail > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold tabular-nums"
                style={{ background: hexA(C_BAD, 0.12), color: C_BAD, border: `1px solid ${hexA(C_BAD, 0.3)}` }}>
                <XCircle size={12} />{nFail} {T.sumFailed}
              </span>
            )}
            {aiOn && (aiFlags[detailRow.uid] || 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold tabular-nums"
                style={{ background: hexA(C_AI, 0.12), color: C_AI, border: `1px solid ${hexA(C_AI, 0.3)}` }}>
                <Sparkles size={12} />{aiFlags[detailRow.uid]} {T.aiFlagsN}
              </span>
            )}
            <span className="ml-auto inline-flex items-center flex-wrap gap-1.5 text-[11px]"
              style={{ color: "var(--text-4)" }}>
              {detailRow.submitted_at && (
                <span className="inline-flex items-center gap-1 tabular-nums" title={T.submittedAt}>
                  <Clock size={11} />{fmtDate(detailRow.submitted_at, lang)} {hhmm(detailRow.submitted_at)}
                </span>
              )}
              {late > 0 && <LateChip days={late} T={T} />}
              {detailRow.source === "bot" && <span>{T.srcBot}</span>}
            </span>
          </div>

          {/* Why the day scored 0 despite the answers below being filled in —
              or, once it was opened, why it counts anyway. A full-width band,
              because this is where somebody comes to argue with the number and
              the old truncating subtitle ate exactly this sentence. */}
          {detailRow.late_state && (() => {
            const st = detailRow.late_state;
            const [ntone, NIcon, text] =
              st === "approved" ? [C_GOOD, ShieldCheck, T.lateOkTitle.replace("{by}", detailRow.late_by || "—")]
              : st === "pending" ? [C_AI, Hourglass, T.pendTitle]
              : [C_BAD, Ban, T.voidTitle];
            return (
              <div className="rounded-lg px-3 py-2 text-xs leading-relaxed"
                style={{ background: hexA(ntone, 0.09), border: `1px solid ${hexA(ntone, 0.25)}`, color: "var(--text-2)" }}>
                <span className="flex items-start gap-1.5">
                  <NIcon size={13} color={ntone} className="flex-shrink-0 mt-0.5" />
                  <span>{text}</span>
                </span>
                {detailRow.late_reason && (
                  <p className="mt-1" style={{ color: "var(--text-3)" }}>{T.reasonLbl}: «{detailRow.late_reason}»</p>
                )}
              </div>
            );
          })()}

          {/* only when there is something to narrow to */}
          {nIssues > 0 && (
            <SegmentedToggle size="sm" value={flt} onChange={setMFlt}
              options={[["all", `${T.bandAll} · ${tasksAll.length}`], ["issues", `${T.fltIssues} · ${nIssues}`]]} />
          )}

          <div className="space-y-2.5">
            {shown.map((tk) => {
              const photos = (tk.photo || "").split(",").map((p) => p.trim()).filter((p) => p.includes("http"));
              const media = tk.media || [];
              const id = Number(tk.id);
              const desc = taskDetail(id, lang).n;
              // a question the form did not put to this leader — neither pass nor fail
              const unasked = tk.answered === false;
              // A proof an admin rejected via the AI flow: the leader still
              // answered «Ha», but the day no longer counts it.
              const voided = !!tk.ai_rejected;
              const overridden = tk.admin_done != null;
              const effDone = effDoneOf(tk);
              const tone = unasked ? C_FLAT : effDone ? C_GOOD : C_BAD;
              const rev = aiOn ? aiReport?.tasks?.[String(id)] : null;
              const reason = showReason(tk.reason, T);
              const nPhotos = photos.length + media.length;
              const busy = ovBusy?.id === id;
              return (
                <div key={id} className="rounded-xl overflow-hidden"
                  style={{ background: hexA(tone, 0.07), border: `1px solid ${hexA(tone, 0.22)}` }}>
                  <div className="px-3 py-2.5">
                    <div className="flex items-start gap-2.5">
                      {unasked ? <Minus size={16} color={tone} className="flex-shrink-0 mt-0.5" />
                        : effDone ? <CheckCircle2 size={16} color={tone} className="flex-shrink-0 mt-0.5" />
                        : <XCircle size={16} color={tone} className="flex-shrink-0 mt-0.5" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center flex-wrap gap-x-2 gap-y-1">
                          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--text-2)" }}>{T.task} {tk.id}</span>
                          {unasked && <span className="text-[10px] font-semibold" style={{ color: tone }}>{T.notAsked}</span>}
                          {/* the ruling that made the icon say what it says */}
                          {overridden && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{ background: "var(--brand-bg)", color: "var(--brand-text)", border: "1px solid var(--brand-border)" }}>
                              <ShieldCheck size={10} />{T.ovChip}
                            </span>
                          )}
                          {voided && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                              style={{ background: hexA(C_BAD, 0.14), color: C_BAD, border: `1px solid ${hexA(C_BAD, 0.3)}` }}>
                              <Ban size={10} />{T.aiRejChip}
                            </span>
                          )}
                          {/* The AI's doubt is stated next to the leader's own
                              answer, not instead of it: a task can be genuinely
                              done AND have a suspect photo. */}
                          {rev?.status === "flagged" && !voided && !overridden && <Sparkles size={13} color={C_AI} />}
                        </div>
                        {desc && <p className="text-xs font-medium mt-1" style={{ color: "var(--text-1)" }}>{desc}</p>}
                        {/* The leader's own words only where they say something:
                            the old card printed «no issues» under every green
                            task, thirteen times per report. */}
                        {!unasked && (reason
                          ? <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{reason}</p>
                          : !tk.done ? <p className="text-xs mt-1" style={{ color: "var(--text-3)" }}>{T.noReason}</p>
                          : null)}
                        {nPhotos > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-2">
                            {photos.map((p, pi) => (
                              <div key={pi} className="w-16 h-16 flex-shrink-0">
                                <ReportPhoto src={p} T={T} className="" thumb onClick={(u) => setZoom(u)} />
                              </div>
                            ))}
                            {media.map((mid) => (
                              <div key={`m${mid}`} className="w-16 h-16 flex-shrink-0">
                                <BotPhoto id={mid} T={T} className="" thumb onClick={(u) => setZoom(u)} />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <AiReview rev={rev} T={T} lang={lang}
                    // Only a task the leader answered YES to, with photos, has
                    // anything to review — the button must not appear where it
                    // could never do anything. A task that ALREADY has a verdict
                    // still qualifies: that is the re-check, and the branch that
                    // invites a first check tests `judged` itself.
                    canCheck={aiOn && !unasked && tk.done && nPhotos > 0}
                    checking={checkingTask === id}
                    error={checkErr?.id === id ? checkErr.msg : null}
                    onCheck={(force) => checkTask(id, force)} />
                  {/* the admin's own ruling — pressing the active side takes it back */}
                  {isAdmin && !unasked && (
                    <div className="px-3 py-2 flex items-center flex-wrap gap-x-2 gap-y-1.5"
                      style={{ borderTop: "1px solid var(--border)", background: "var(--bg-inner)" }}>
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: "var(--text-3)" }}>
                        <ShieldCheck size={12} />{T.ovTitle}
                      </span>
                      {overridden && (
                        <span className="text-[10px] truncate" style={{ color: "var(--text-4)" }}>
                          {tk.admin_by}{tk.admin_at ? ` · ${fmtDateTime(tk.admin_at)}` : ""}
                        </span>
                      )}
                      <span className="ml-auto inline-flex items-center gap-1.5">
                        <Button size="sm" variant="success" tint={tk.admin_done !== true}
                          loading={busy && ovBusy.btn === "done"} disabled={ovMut.isPending}
                          title={tk.admin_done === true ? T.ovUndo : T.ovDone}
                          icon={<CheckCircle2 size={13} />}
                          onClick={() => setOverride(id, tk.admin_done === true ? null : true, "done")}>
                          {T.ovDone}
                        </Button>
                        <Button size="sm" variant="danger" tint={tk.admin_done !== false}
                          loading={busy && ovBusy.btn === "fail"} disabled={ovMut.isPending}
                          title={tk.admin_done === false ? T.ovUndo : T.ovFail}
                          icon={<XCircle size={13} />}
                          onClick={() => setOverride(id, tk.admin_done === false ? null : false, "fail")}>
                          {T.ovFail}
                        </Button>
                      </span>
                      {ovErr?.id === id && (
                        <p className="basis-full text-[10px] mb-0" style={{ color: C_BAD }}>{ovErr.msg}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          {aiOn && <p className="text-[10px]" style={{ color: "var(--text-4)" }}>{T.aiNote}</p>}
        </Modal>
        );
      })()}

      {/* enlarged proof photo — above the detail modal, click anywhere closes.
          Portaled to document.body like every full-screen overlay. */}
      {zoom && createPortal(
        <div role="dialog" aria-modal="true" onClick={() => setZoom(null)}
          className="fixed inset-0 flex items-center justify-center p-4 cursor-zoom-out"
          style={{ background: "rgba(0,0,0,0.88)", zIndex: 80,
            paddingTop: "calc(var(--tg-safe-top, 0px) + 1rem)",
            paddingBottom: "calc(var(--tg-safe-bottom, 0px) + 1rem)" }}>
          <img src={zoom} alt="" className="max-w-full max-h-full rounded-xl" />
          <Button size="sm" variant="secondary" className="absolute right-4"
            style={{ top: "calc(var(--tg-safe-top, 0px) + 1rem)" }}
            icon={<X size={15} />} onClick={() => setZoom(null)} />
        </div>,
        document.body)}

      {/* Task-info modal */}
      {standInfo && (
        <Modal maxWidth="max-w-lg" title={effStandMode === "leader" ? T.standing : T.supStanding} onClose={() => setStandInfo(false)}>
          <p className="text-sm leading-relaxed whitespace-pre-line" style={{ color: "var(--text-2)" }}>{T.standInfo}</p>
          {standings.winFrom && (
            <p className="text-xs mt-3 tabular-nums" style={{ color: "var(--text-4)" }}>
              {T.winLabel}: {ddmm(standings.winFrom)} – {ddmm(standings.winTo)} · {standings.winDays} {T.dayAbbr}
            </p>
          )}
        </Modal>
      )}

      {/* Daraja cutoffs — admin only, saved globally for every viewer */}
      {tierEdit && (
        <Modal maxWidth="max-w-md" title={T.tierEdit} subtitle={T.tierEditSub}
          icon={<SlidersHorizontal size={18} style={{ color: "var(--brand-text)" }} />}
          onClose={() => setTierEdit(null)}
          footer={<>
            <Button variant="secondary" onClick={() => setTierEdit(null)}>{T.cancel}</Button>
            <Button onClick={() => tierMut.mutate(tierEdit)} loading={tierMut.isPending}
              disabled={!tierOrderOk(tierEdit)}>{T.save}</Button>
          </>}>
          <div className="space-y-3">
            {TIER_BANDS.map((b) => (
              <FormField key={b.cut} label={<span className="inline-flex items-center gap-1.5">
                <b.Icon size={12} style={{ color: b.color }} />{T[b.key]}
              </span>}>
                <div className="flex items-center gap-2">
                  <input type="number" min={0} max={100} value={tierEdit[b.cut]}
                    onChange={(e) => setTierEdit({ ...tierEdit, [b.cut]: e.target.value === "" ? "" : Number(e.target.value) })}
                    className="w-24 px-3 py-2 rounded-lg text-sm tabular-nums outline-none"
                    style={{ background: "var(--bg-inner)", border: "1px solid var(--border)", color: "var(--text-1)" }} />
                  <span className="text-xs" style={{ color: "var(--text-4)" }}>{T.tierEditRow}</span>
                </div>
              </FormField>
            ))}
            <p className="text-xs leading-relaxed" style={{ color: "var(--text-4)" }}>{T.tierEditHint}</p>
            {!tierOrderOk(tierEdit) && (
              <p className="text-xs" style={{ color: C_BAD }}>{T.tierEditOrder}</p>
            )}
          </div>
        </Modal>
      )}

      {taskInfo && (
        <Modal maxWidth="max-w-3xl" title={T.taskInfoTitle} onClose={() => setTaskInfo(false)}>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr style={{ background: "var(--brand)", color: "#fff" }}>
                <th className="text-left px-3 py-2 text-xs font-semibold" style={{ width: 50 }}>ID</th>
                <th className="text-left px-3 py-2 text-xs font-semibold">{T.taskDesc}</th>
                <th className="text-center px-3 py-2 text-xs font-semibold" style={{ width: 70 }}>{T.taskWeight}</th>
                <th className="text-left px-3 py-2 text-xs font-semibold">{T.taskNote}</th>
              </tr>
            </thead>
            <tbody>
              {TASK_DETAILS.map((_, i) => {
                const d = taskDetail(i + 1, lang);
                return (
                  <tr key={i} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3 py-2 font-bold text-xs" style={{ color: "var(--text-4)" }}>T{i + 1}</td>
                    <td className="px-3 py-2 text-xs font-medium" style={{ color: "var(--text-1)" }}>{d.n}</td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold" style={{ background: "var(--bg-inner)", border: "1px solid var(--border-md)", color: "var(--text-2)" }}>{d.weight}</span>
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--text-3)" }}>{d.note}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Modal>
      )}
    </Layout>
  );
}
