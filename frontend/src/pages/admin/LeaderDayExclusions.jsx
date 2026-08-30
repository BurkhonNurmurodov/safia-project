import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleSlash, RotateCcw, AlertTriangle, CalendarDays, CalendarOff, Users, Check,
} from "lucide-react";
import api from "../../utils/api";
import { useLang } from "../../context/LangContext";
import { useTranslit } from "../../utils/transliterate";
import { usePersistentState } from "../../hooks/usePersistentState";
import Button from "../../components/ui/Button";
import ConfirmDialog from "../../components/ui/ConfirmDialog";
import FormField from "../../components/ui/FormField";
import SearchInput from "../../components/ui/SearchInput";
import SegmentedToggle from "../../components/ui/SegmentedToggle";
import DateRangePicker from "../../components/ui/DateRangePicker";
import TableCard, { Th } from "../../components/ui/DataTable";
import Pagination from "../../components/ui/Pagination";
import { FilterPanel, PickFilter } from "../../components/ui/ColumnFilter";
import { SkeletonTable } from "../../components/ui/Skeleton";
import EmptyState from "../../components/ui/EmptyState";
import { useToast } from "../../components/ui/Toast";

/**
 * «Hisobdan chiqarilgan kunlar» — leader-days taken OUT of the results.
 *
 * Every other "this day does not count" on the platform scores the day 0 and
 * leaves it in the denominator, which is the same thing as counting it against
 * the leader. This tab is the one place a day can be made to count NEITHER way:
 * not green, not red, simply absent from the average, for the leader and for
 * their brigadir at once. It exists because the platform is sometimes the thing
 * that went wrong, and a night the system broke must not cost the people who
 * were working it.
 *
 * Three things it deliberately does NOT do:
 *
 *   * **The days it can reach are the days the page SCORES — which is not the
 *     same as the days the page has rows for.** The first two views come from
 *     `/api/leaders`, the register's own projection, so they can never offer a
 *     day the dashboard does not have or hide one it does. The third comes from
 *     the leader ROSTER served beside it, because the score is Σ of filed-day
 *     means ÷ the CALENDAR days of the period: a day nobody filed already costs
 *     its leader a whole slot of that denominator while leaving no row anywhere
 *     to say so, and it was the one day an operator could never forgive.
 *     Excluding one writes an ordinary exclusion, and
 *     `leader_exclusions.orphan_rows` gives it a register row from then on — so
 *     nothing downstream has to know this view exists.
 *   * **It never deletes anything.** Photos, verdicts, the day report and both
 *     collection layers are untouched; only whether the number enters an
 *     average changes. Lifting an exclusion puts the day back at the score it
 *     always had.
 *   * **It is not grantable.** No `capKey` on the ADMIN_NAV entry, so
 *     `capTabs.includes(capKey ?? id)` can never admit a grantee — the
 *     `permissions` / `logs` / `ltdaily` model. It moves a leader's score and a
 *     brigadir's, and that authority is the same one that opens a late day.
 *
 * The SELECTION is the scope, not the filter (the `Factories` / `ShiftTimes`
 * model): filters narrow the list to the night in question, then the operator
 * ticks the rows they mean. An incident hits a whole unit, so «select all
 * visible» is the fast path — but the two leaders who filed properly that night
 * are exactly what an operator needs to be able to leave alone.
 */

const TXT = {
  uz: {
    title: "Hisobdan chiqarilgan kunlar",
    lead: "Kun o'chirilmaydi: rasmlar, hisobot va baho joyida qoladi — faqat o'rtacha ballga qo'shilmaydi. Filtrlar bilan kunni toping, keyin kerakli qatorlarni belgilang.",
    tabOn: "Hisobga olinadi", tabOff: "Hisobdan chiqarilgan",
    tabMissing: "Topshirilmagan",
    missLead: "Bu ro'yxat davrdagi har bir kun uchun hech narsa topshirmagan liderlarni ko'rsatadi. Bunday kun hozir 0 ball sifatida o'rtachaga kiradi — belgilangan qatorlar esa umuman hisobga olinmaydi.",
    missSelected: "Faqat tanlangan kunlar chiqariladi.",
    emptyMiss: "Topshirilmagan kun yo'q",
    emptyMissBody: "Bu oraliqda hamma lider har kuni topshirgan.",
    missTooLong: "Bu ro'yxat har bir lider uchun har bir kunni chizadi — davrni {n} kundan uzun qilib bo'lmaydi.",
    search: "Lider yoki brigadir...",
    fShift: "Smena", fSup: "Brigadir", fLeader: "Lider", all: "Barchasi",
    shift1: "1-smena", shift2: "2-smena",
    thDate: "Sana", thLeader: "Lider", thSup: "Brigadir", thShift: "Smena",
    thScore: "Natija", thWhy: "Sabab", thBy: "Kim",
    rows: "{n} ta kun", picked: "{n} ta tanlandi",
    selAll: "Hammasini tanlash ({n})", selNone: "Tanlovni bekor qilish",
    exclude: "{n} ta kunni hisobdan chiqarish",
    restore: "{n} ta kunni qaytarish",
    reason: "Sabab", reasonHint: "Bu sabab liderga va brigadirga xabar qilib yuboriladi, hisobotda ham ko'rinadi.",
    reasonPh: "Masalan: AI xatosi — vazifalar erta yopildi",
    confirmOn: "Kunlar hisobdan chiqarilsinmi?",
    confirmOnBody: "{n} ta kun natijalardan butunlay chiqariladi — o'rtacha ball qolgan kunlar bo'yicha hisoblanadi. Liderlar va brigadirlar (agar ularga baho yuborilgan bo'lsa) xabardor qilinadi.",
    confirmOff: "Kunlar qaytarilsinmi?",
    confirmOffBody: "{n} ta kun yana natijalarga qo'shiladi, o'z bahosi bilan.",
    okOn: "{n} ta kun hisobdan chiqarildi", okOff: "{n} ta kun qaytarildi",
    told: "{n} kishiga xabar berildi",
    failed: "Saqlanmadi",
    needReason: "Sabab yozing",
    emptyOn: "Bu oraliqda kun yo'q",
    emptyOnBody: "Sanani yoki filtrlarni o'zgartiring.",
    emptyOff: "Hisobdan chiqarilgan kun yo'q",
    emptyOffBody: "Bu oraliqda hamma kun natijalarga kiradi.",
    loadFailed: "Ma'lumot yuklanmadi",
    cutHidden: "Yana {n} ta kun lider butunlay hisobdan chiqarilgani uchun bu yerda ko'rsatilmaydi — «Liderni hisobdan chiqarish» bo'limiga qarang.",
  },
  uz_cyrl: {
    title: "Ҳисобдан чиқарилган кунлар",
    lead: "Кун ўчирилмайди: расмлар, ҳисобот ва баҳо жойида қолади — фақат ўртача баллга қўшилмайди. Филтрлар билан кунни топинг, кейин керакли қаторларни белгиланг.",
    tabOn: "Ҳисобга олинади", tabOff: "Ҳисобдан чиқарилган",
    tabMissing: "Топширилмаган",
    missLead: "Бу рўйхат даврдаги ҳар бир кун учун ҳеч нарса топширмаган лидерларни кўрсатади. Бундай кун ҳозир 0 балл сифатида ўртачага киради — белгиланган қаторлар эса умуман ҳисобга олинмайди.",
    missSelected: "Фақат танланган кунлар чиқарилади.",
    emptyMiss: "Топширилмаган кун йўқ",
    emptyMissBody: "Бу оралиқда ҳамма лидер ҳар куни топширган.",
    missTooLong: "Бу рўйхат ҳар бир лидер учун ҳар бир кунни чизади — даврни {n} кундан узун қилиб бўлмайди.",
    search: "Лидер ёки бригадир...",
    fShift: "Смена", fSup: "Бригадир", fLeader: "Лидер", all: "Барчаси",
    shift1: "1-смена", shift2: "2-смена",
    thDate: "Сана", thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена",
    thScore: "Натижа", thWhy: "Сабаб", thBy: "Ким",
    rows: "{n} та кун", picked: "{n} та танланди",
    selAll: "Ҳаммасини танлаш ({n})", selNone: "Танловни бекор қилиш",
    exclude: "{n} та кунни ҳисобдан чиқариш",
    restore: "{n} та кунни қайтариш",
    reason: "Сабаб", reasonHint: "Бу сабаб лидерга ва бригадирга хабар қилиб юборилади, ҳисоботда ҳам кўринади.",
    reasonPh: "Масалан: AI хатоси — вазифалар эрта ёпилди",
    confirmOn: "Кунлар ҳисобдан чиқарилсинми?",
    confirmOnBody: "{n} та кун натижалардан бутунлай чиқарилади — ўртача балл қолган кунлар бўйича ҳисобланади. Лидерлар ва бригадирлар (агар уларга баҳо юборилган бўлса) хабардор қилинади.",
    confirmOff: "Кунлар қайтарилсинми?",
    confirmOffBody: "{n} та кун яна натижаларга қўшилади, ўз баҳоси билан.",
    okOn: "{n} та кун ҳисобдан чиқарилди", okOff: "{n} та кун қайтарилди",
    told: "{n} кишига хабар берилди",
    failed: "Сақланмади",
    needReason: "Сабаб ёзинг",
    emptyOn: "Бу оралиқда кун йўқ",
    emptyOnBody: "Санани ёки филтрларни ўзгартиринг.",
    emptyOff: "Ҳисобдан чиқарилган кун йўқ",
    emptyOffBody: "Бу оралиқда ҳамма кун натижаларга киради.",
    loadFailed: "Маълумот юкланмади",
    cutHidden: "Яна {n} та кун лидер бутунлай ҳисобдан чиқарилгани учун бу ерда кўрсатилмайди — «Лидерни ҳисобдан чиқариш» бўлимига қаранг.",
  },
  ru: {
    title: "Исключённые дни",
    lead: "День не удаляется: фото, отчёт и оценка остаются на месте — они просто не попадают в средний балл. Найдите нужный день фильтрами и отметьте строки.",
    tabOn: "Учитываются", tabOff: "Исключены",
    tabMissing: "Не сдано",
    missLead: "Здесь — лидеры и дни периода, за которые не сдано ничего. Сейчас такой день входит в средний балл как 0; отмеченные строки не будут учитываться вовсе.",
    missSelected: "Исключаются только отмеченные дни.",
    emptyMiss: "Несданных дней нет",
    emptyMissBody: "В этом периоде каждый лидер сдавал каждый день.",
    missTooLong: "Этот список строится по каждому лидеру и каждому дню — период не может быть длиннее {n} дней.",
    search: "Лидер или бригадир...",
    fShift: "Смена", fSup: "Бригадир", fLeader: "Лидер", all: "Все",
    shift1: "1-я смена", shift2: "2-я смена",
    thDate: "Дата", thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена",
    thScore: "Результат", thWhy: "Причина", thBy: "Кто",
    rows: "дней: {n}", picked: "выбрано: {n}",
    selAll: "Выбрать все ({n})", selNone: "Снять выбор",
    exclude: "Исключить дней: {n}",
    restore: "Вернуть дней: {n}",
    reason: "Причина", reasonHint: "Эта причина уйдёт лидеру и бригадиру в уведомлении и будет видна в отчёте.",
    reasonPh: "Например: ошибка ИИ — задачи закрылись раньше срока",
    confirmOn: "Исключить дни из результатов?",
    confirmOnBody: "Дней будет исключено: {n}. Средний балл посчитается по остальным дням. Лидеры и бригадиры получат уведомление, если им уже приходила оценка за этот день.",
    confirmOff: "Вернуть дни в результаты?",
    confirmOffBody: "Дней вернётся: {n}, каждый со своей оценкой.",
    okOn: "Исключено дней: {n}", okOff: "Возвращено дней: {n}",
    told: "Уведомлено: {n}",
    failed: "Не сохранено",
    needReason: "Укажите причину",
    emptyOn: "В этом периоде нет дней",
    emptyOnBody: "Измените период или фильтры.",
    emptyOff: "Исключённых дней нет",
    emptyOffBody: "В этом периоде все дни входят в результаты.",
    loadFailed: "Не удалось загрузить",
    cutHidden: "Ещё {n} дн. не показаны здесь, потому что лидер исключён целиком — см. «Исключённые лидеры».",
  },
  en: {
    title: "Excluded days",
    lead: "Nothing is deleted — the photos, the report and the score all stay; they just leave the average. Narrow to the day with the filters, then tick the rows you mean.",
    tabOn: "Counting", tabOff: "Excluded",
    tabMissing: "Not submitted",
    missLead: "Every leader-day in the period that nothing was filed for. Such a day counts as a 0 in the average today; the rows you tick will not count at all.",
    missSelected: "Only the days you tick are excluded.",
    emptyMiss: "No missing days",
    emptyMissBody: "Every leader filed every day in this period.",
    missTooLong: "This list is drawn per leader per day — the period cannot be longer than {n} days.",
    search: "Leader or brigadir...",
    fShift: "Shift", fSup: "Brigadir", fLeader: "Leader", all: "All",
    shift1: "Shift 1", shift2: "Shift 2",
    thDate: "Date", thLeader: "Leader", thSup: "Brigadir", thShift: "Shift",
    thScore: "Score", thWhy: "Reason", thBy: "By",
    rows: "{n} day(s)", picked: "{n} selected",
    selAll: "Select all ({n})", selNone: "Clear selection",
    exclude: "Exclude {n} day(s)",
    restore: "Restore {n} day(s)",
    reason: "Reason", reasonHint: "This reason is DMed to the leader and the brigadir, and shows on the day report.",
    reasonPh: "e.g. AI fault — tasks closed before their deadline",
    confirmOn: "Exclude these days from the results?",
    confirmOnBody: "{n} day(s) leave the results entirely — the average is taken over the remaining days. Leaders and brigadirs are told, where a score for that day was already sent to them.",
    confirmOff: "Put these days back?",
    confirmOffBody: "{n} day(s) count again, each at its own score.",
    okOn: "{n} day(s) excluded", okOff: "{n} day(s) restored",
    told: "{n} person(s) notified",
    failed: "Not saved",
    needReason: "Write a reason",
    emptyOn: "No days in this period",
    emptyOnBody: "Change the period or the filters.",
    emptyOff: "No excluded days",
    emptyOffBody: "Every day in this period counts.",
    loadFailed: "Could not load",
    cutHidden: "{n} more day(s) are not shown here because the leader is out of the results entirely — see «Excluded leaders».",
  },
};

const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const iso = (d) => d.toISOString().slice(0, 10);
const shiftDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// A leader-day's identity, the same pair the backend keys an exclusion by.
const rowKey = (r) => `${r.leader_id ? `p${r.leader_id}` : `n${(r.leader || "").trim().toLowerCase()}`}|${String(r.date).slice(0, 10)}`;

// UTC throughout: these are calendar dates, and a local-midnight Date shifts the
// day across the international date line for anybody east of UTC — which is
// everybody here.
const addDay = (d, n) => {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const spanDays = (a, b) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000) + 1;

// The missing-day list is drawn per leader per day — ~90 leaders against an
// unbounded period is a browser, not a table. Two months is longer than any
// incident and short enough to render; the cap is STATED rather than silently
// truncating, because a list that quietly stopped at some row reads as "these
// are all of them".
const MISS_MAX_DAYS = 62;
const PAGE_SIZE = 100;

export default function LeaderDayExclusions() {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const { node: toastNode, show } = useToast();

  const [view, setView] = usePersistentState("ltexcl_view", "on");
  const [from, setFrom] = usePersistentState("ltexcl_from", shiftDays(-13));
  const [to, setTo] = usePersistentState("ltexcl_to", shiftDays(0));
  const [q, setQ] = useState("");
  const [shift, setShift] = useState("All");
  const [sup, setSup] = useState("All");
  const [leader, setLeader] = useState("All");
  const [picked, setPicked] = useState(() => new Set());
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // The register's own feed — see the header: one projection, so this tab can
  // never offer a day the dashboard does not score.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["leaders"],
    queryFn: async () => (await api.get("/api/leaders")).data,
    staleTime: 60_000,
  });
  const rows = data?.data || [];
  // Who was SUPPOSED to file — served to admins only, and the only thing on the
  // platform that can name a leader-day nobody filed. Without it the third view
  // could not exist: the register answers "what was submitted", and a day with
  // no submission leaves no trace in it at all.
  const roster = data?.roster || [];

  const inRange = useMemo(() => rows.filter((r) => {
    const d = String(r.date).slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  }), [rows, from, to]);

  const miss = view === "missing";
  const span = from && to ? spanDays(from, to) : 0;
  const tooLong = miss && span > MISS_MAX_DAYS;

  /* Every (leader, day) in the period that carries no submission and no
   * decision — the days that are costing their leader a full slot of the
   * denominator with nothing on screen anywhere saying so.
   *
   * A day is HELD if the register accounts for it in any way: filed through
   * either layer, or already excluded (which now brings its own row). Matched
   * by profile id AND by folded name, because ~18% of sheet names never resolve
   * to a profile — a row filed under an unmatched spelling must not make its
   * leader look absent, which is the one mistake this list cannot afford.
   */
  const missingRows = useMemo(() => {
    if (!miss || tooLong || !from || !to || !roster.length) return [];
    const held = new Set();
    for (const r of inRange) {
      const d = String(r.date).slice(0, 10);
      if (r.leader_id) held.add(`p${r.leader_id}|${d}`);
      const n = String(r.leader || "").trim().toLowerCase();
      if (n) held.add(`n${n}|${d}`);
    }
    const days = [];
    for (let d = from; d <= to; d = addDay(d, 1)) days.push(d);
    const out = [];
    for (const p of roster) {
      const n = String(p.name || "").trim().toLowerCase();
      for (const d of days) {
        if (held.has(`p${p.id}|${d}`) || (n && held.has(`n${n}|${d}`))) continue;
        // A day this leader was never expected to file: their results stopped
        // counting on or before it («Liderni hisobdan chiqarish»). It already
        // costs nobody anything, so offering it here would be an exclusion with
        // nothing to do — and a hundred of them would bury the days that matter.
        if (p.cutoff && d >= p.cutoff) continue;
        out.push({
          // Not a register row and never pretends to be one: it exists only in
          // this list, until an admin turns one into a decision.
          uid: `miss-${p.id}-${d}`,
          date: d, leader_id: p.id, leader: p.name,
          supervisor: p.supervisor, manager_id: p.manager_id, shift: p.shift,
          // No report, so no score — `null`, never 0, which is a figure
          // somebody would otherwise have to have earned.
          completion: null, excluded: null, missing: true,
        });
      }
    }
    return out;
  }, [miss, tooLong, from, to, inRange, roster]);

  // The rows this view is ABOUT, before the shared narrowing below. Splitting
  // here keeps one filter path for all three views — a second copy of the
  // shift/brigadir/lider/search rules is how two tabs start disagreeing about
  // what a filter means.
  const base = useMemo(
    () => (miss ? missingRows
      : inRange.filter((r) => (view === "off"
          ? !!r.excluded && !r.excluded.cutoff
          : !r.excluded))),
    [miss, missingRows, inRange, view]);

  // Option lists come off the rows this VIEW holds, not the whole feed: a
  // brigadir with nothing in this fortnight is a scope that can only be empty —
  // and on the missing view the lists are the roster's, so a leader who filed
  // nothing at all is still reachable, which is the whole point of it.
  const sups = useMemo(
    () => [...new Set(base.map((r) => r.supervisor).filter((x) => x && x !== "N/A"))].sort(),
    [base]);
  const leaders = useMemo(
    () => [...new Set(base.filter((r) => sup === "All" || r.supervisor === sup)
      .map((r) => r.leader).filter((x) => x && x !== "N/A"))].sort(),
    [base, sup]);

  // ONE narrowing predicate, so the table and the «N more days are hidden» count
  // above it describe the same rows. Counting the withheld days over the period
  // alone made the note contradict the view it was explaining: filter to one
  // brigadir and it went on promising days that are not in scope at all.
  const narrow = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (r) =>
      (shift === "All" || r.shift === Number(shift))
      && (sup === "All" || r.supervisor === sup)
      && (leader === "All" || r.leader === leader)
      // Matched against BOTH spellings — the register's own (the sheet's, most
      // often Cyrillic) and the transliterated one this table actually PRINTS,
      // exactly as the register's own search does. Typing the name you can see
      // is the only search anybody performs, and matching the raw value alone
      // answered «no days in this period» to a period that was full of them.
      && (!needle
        || `${tl(r.leader || "")} ${r.leader || ""}`.toLowerCase().includes(needle)
        || `${tl(r.supervisor || "")} ${r.supervisor || ""}`.toLowerCase().includes(needle));
  }, [shift, sup, leader, q, lang]);

  const shown = useMemo(() => base.filter(narrow)
    .sort((a, b) => String(b.date).localeCompare(String(a.date))
      || String(a.leader || "").localeCompare(String(b.leader || ""))),
    [base, narrow]);

  // A day out of the results because its LEADER is cut off is not a decision
  // this tab can act on: it has no `LeaderDayExclusion` row, so «Qaytarish»
  // here would find nothing to lift and report that it changed nothing. It is
  // counted and named instead — the count links the reader to the tab that owns
  // it, which is the platform's rule for anything a view hides.
  const cutHidden = useMemo(
    () => (view === "off"
      ? inRange.filter((r) => r.excluded?.cutoff).filter(narrow).length : 0),
    [inRange, view, narrow]);


  // Paged for the DOM only: `shown` stays the whole filtered set, so a
  // selection made on page 1 is still armed while page 4 is on screen — and
  // «select all» selects the set, not the slice, which is why its label carries
  // the count.
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [view, from, to, q, shift, sup, leader]);
  const pageRows = useMemo(
    () => shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [shown, page]);

  const shownKeys = useMemo(() => shown.map(rowKey), [shown]);
  const pickedShown = shownKeys.filter((k) => picked.has(k));
  const allPicked = shownKeys.length > 0 && pickedShown.length === shownKeys.length;

  const toggle = (k) => setPicked((prev) => {
    const next = new Set(prev);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });
  const toggleAll = () => setPicked((prev) => {
    const next = new Set(prev);
    if (allPicked) shownKeys.forEach((k) => next.delete(k));
    else shownKeys.forEach((k) => next.add(k));
    return next;
  });

  // Switching the view drops the selection: the two lists answer opposite
  // questions, and carrying ticks across would arm a bulk action against rows
  // the operator can no longer see.
  const switchView = (v) => { setView(v); setPicked(new Set()); setErr(""); };

  // «Hisobga olinadi» and «Topshirilmagan» both EXCLUDE — they differ in which
  // days they can reach, not in what the button does to them. Only the restore
  // tab runs the decision backwards.
  const off = view === "off";
  const excluding = !off;
  // checkbox · date · leader · brigadir · shift, + score unless nothing was
  // filed, + why/by only where a decision has already been recorded.
  const nCols = 5 + (miss ? 0 : 1) + (off ? 2 : 0);
  const chosen = useMemo(
    () => shown.filter((r) => picked.has(rowKey(r))), [shown, picked]);

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const { data: res } = await api.post("/api/leaders/exclusions", {
        excluded: excluding,
        reason: excluding ? reason.trim() : "",
        items: chosen.map((r) => ({
          leader_id: r.leader_id ?? null,
          leader: r.leader ?? null,
          date: String(r.date).slice(0, 10),
          manager_id: r.manager_id ?? null,
          score: typeof r.completion === "number" ? r.completion : null,
        })),
      });
      setConfirm(false);
      setPicked(new Set());
      setReason("");
      show(fill(excluding ? T.okOn : T.okOff, { n: res.changed })
        + (res.notified ? ` · ${fill(T.told, { n: res.notified })}` : ""), "success");
      qc.invalidateQueries({ queryKey: ["leaders"] });
    } catch (e) {
      // Stays INSIDE the dialog: a bulk action that failed must leave the
      // operator looking at the reason, not at a closed dialog and an
      // unchanged list.
      setErr(e?.response?.data?.detail || T.failed);
    } finally {
      setBusy(false);
    }
  };

  const nm = (s) => tl(s || "");
  // A leader pick the brigadir filter no longer offers is dropped rather than
  // left naming a scope the list cannot show — the platform's cascade rule.
  const sections = [
    { key: "shift", icon: CalendarDays, label: T.fShift, active: shift !== "All",
      display: shift === "All" ? "" : shift === "1" ? T.shift1 : T.shift2,
      onClear: () => setShift("All"),
      render: ({ close } = {}) => (
        <PickFilter close={close} value={shift} onChange={setShift}
          opts={[{ value: "All", label: T.all },
                 { value: "1", label: T.shift1 },
                 { value: "2", label: T.shift2 }]} />
      ) },
    { key: "sup", icon: Users, label: T.fSup, active: sup !== "All",
      display: sup === "All" ? "" : nm(sup), onClear: () => setSup("All"),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close} value={sup}
          onChange={(v) => { setSup(v); setLeader("All"); }}
          opts={[{ value: "All", label: T.all },
                 ...sups.map((x) => ({ value: x, label: nm(x) }))]} />
      ) },
    { key: "leader", icon: Users, label: T.fLeader, active: leader !== "All",
      display: leader === "All" ? "" : nm(leader), onClear: () => setLeader("All"),
      render: ({ close } = {}) => (
        <PickFilter searchable close={close} value={leader} onChange={setLeader}
          note={sup === "All" ? null : `${nm(sup)} · ${leaders.length}`}
          opts={[{ value: "All", label: T.all },
                 ...leaders.map((x) => ({ value: x, label: nm(x) }))]} />
      ) },
  ];

  return (
    <div>
      {toastNode}
      {/* No title here — the AdminPanel shell already renders this
        * destination's name and its one-line `admin.desc.*` description. This
        * note carries only what that line has no room for. */}
      <p className="text-xs leading-relaxed mb-3"
        style={{ color: "var(--text-3)", maxWidth: 760 }}>
        {miss ? <>{T.missLead} <b style={{ color: "var(--text-2)" }}>{T.missSelected}</b></> : T.lead}
        {cutHidden > 0 && <> <span style={{ color: "var(--text-4)" }}>
          {fill(T.cutHidden, { n: cutHidden })}</span></>}
      </p>

      <div className="mb-3">
        <SegmentedToggle asTabs value={view} onChange={switchView}
          options={[["on", T.tabOn], ["off", T.tabOff], ["missing", T.tabMissing]]} />
      </div>

      <TableCard
        icon={off ? RotateCcw : miss ? CalendarOff : CircleSlash}
        title={off ? T.tabOff : miss ? T.tabMissing : T.tabOn}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-4)" }}>
          {fill(T.rows, { n: shown.length })}
        </span>}
        toolbar={<>
          <DateRangePicker dateFrom={from} dateTo={to}
            setDateFrom={setFrom} setDateTo={setTo} compactLabel
            triggerClassName="px-3 py-2 text-sm" />
          <FilterPanel sections={sections} />
          <SearchInput value={q} onChange={setQ} placeholder={T.search}
            className="flex-1 min-w-[180px]" />
          {shown.length > 0 && (
            <Button size="lg" variant="secondary" onClick={toggleAll}>
              {allPicked ? T.selNone : fill(T.selAll, { n: shown.length })}
            </Button>
          )}
        </>}>
        <thead>
          <tr>
            <Th label="" cls="w-[38px]" />
            <Th label={T.thDate} />
            <Th label={T.thLeader} />
            <Th label={T.thSup} />
            <Th label={T.thShift} align="center" />
            {/* No score column where nothing was filed: every cell in it could
                only be «—», and a column of them reads as missing data rather
                than as the absence of a report. */}
            {!miss && <Th label={T.thScore} align="center" />}
            {off && <Th label={T.thWhy} />}
            {off && <Th label={T.thBy} />}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            // SkeletonTable renders a div — it needs a cell to live in.
            <tr><td colSpan={nCols} className="p-0">
              <SkeletonTable rows={6} cols={nCols} />
            </td></tr>
          ) : isError ? (
            <tr><td colSpan={nCols} className="px-3 py-6 text-center"
              style={{ color: "var(--text-4)" }}>{T.loadFailed}</td></tr>
          ) : tooLong ? (
            // Refused, and it says the number: this list is drawn per leader
            // per day, so an unbounded period is not a long table but a dead
            // tab — and a cap the operator cannot see is one they cannot work
            // around.
            <tr><td colSpan={nCols} className="px-3 py-8">
              <EmptyState showUploadLink={false} icon={CalendarDays}
                title={T.tabMissing}
                message={fill(T.missTooLong, { n: MISS_MAX_DAYS })} />
            </td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={nCols} className="px-3 py-8">
              <EmptyState showUploadLink={false}
                icon={off ? CircleSlash : miss ? CalendarOff : CalendarDays}
                title={off ? T.emptyOff : miss ? T.emptyMiss : T.emptyOn}
                message={off ? T.emptyOffBody : miss ? T.emptyMissBody : T.emptyOnBody} />
            </td></tr>
          ) : pageRows.map((r) => {
            const k = rowKey(r);
            const sel = picked.has(k);
            return (
              <tr key={r.uid} onClick={() => toggle(k)}
                style={{ cursor: "pointer",
                         background: sel ? "var(--brand-bg)" : undefined }}>
                <td className="px-3 py-2">
                  <span className="flex items-center justify-center rounded"
                    style={{
                      width: 17, height: 17,
                      border: `1.5px solid ${sel ? "var(--brand)" : "var(--border)"}`,
                      background: sel ? "var(--brand)" : "transparent",
                    }}>
                    {sel && <Check size={12} color="#fff" strokeWidth={3} />}
                  </span>
                </td>
                <td className="px-3 py-2 tabular-nums" style={{ color: "var(--text-2)" }}>
                  {String(r.date).slice(0, 10)}
                </td>
                <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{nm(r.leader)}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                  {r.supervisor && r.supervisor !== "N/A" ? nm(r.supervisor) : "—"}
                </td>
                <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>
                  {r.shift ?? "—"}
                </td>
                {!miss && (
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-2)" }}>
                    {Math.round(r.completion)}%
                  </td>
                )}
                {off && (
                  <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                    {r.excluded?.reason || "—"}
                  </td>
                )}
                {off && (
                  <td className="px-3 py-2" style={{ color: "var(--text-4)" }}>
                    {r.excluded?.by || "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </TableCard>

      <Pagination page={page} pageCount={Math.ceil(shown.length / PAGE_SIZE)}
        total={shown.length} pageSize={PAGE_SIZE} onPage={setPage} />

      {/* The bulk bar names the count in its own label — a button that acts on
        * a selection has to say how big that selection is. */}
      {chosen.length > 0 && (
        <div className="sticky bottom-0 mt-3 rounded-2xl p-3 flex flex-wrap items-end gap-3"
          style={{ background: "var(--bg-card)", border: "1px solid var(--border)",
                   boxShadow: "0 -4px 18px rgba(0,0,0,.10)" }}>
          <span className="text-sm font-semibold whitespace-nowrap"
            style={{ color: "var(--text-1)" }}>
            {fill(T.picked, { n: chosen.length })}
          </span>
          {excluding && (
            <div className="flex-1 min-w-[240px]">
              <FormField label={T.reason} required hint={T.reasonHint}>
                <input value={reason} onChange={(e) => setReason(e.target.value)}
                  placeholder={T.reasonPh}
                  className="w-full rounded-xl px-3 py-2 text-sm"
                  style={{ background: "var(--bg-inner)", border: "1px solid var(--border)",
                           color: "var(--text-1)" }} />
              </FormField>
            </div>
          )}
          <Button size="lg" variant={excluding ? "danger" : "primary"}
            disabled={excluding && !reason.trim()}
            onClick={() => { setErr(""); setConfirm(true); }}>
            {fill(excluding ? T.exclude : T.restore, { n: chosen.length })}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        tone={excluding ? "danger" : "warning"}
        title={excluding ? T.confirmOn : T.confirmOff}
        message={fill(excluding ? T.confirmOnBody : T.confirmOffBody, { n: chosen.length })}
        confirmLabel={fill(excluding ? T.exclude : T.restore, { n: chosen.length })}
        loading={busy}
        error={err}
        onConfirm={submit}
        onCancel={() => { setConfirm(false); setErr(""); }}
      />
    </div>
  );
}
