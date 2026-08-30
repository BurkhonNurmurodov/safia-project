import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserMinus, RotateCcw, CalendarDays, Users, Check } from "lucide-react";
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
 * «Liderni hisobdan chiqarish» — a leader whose results STOP COUNTING from one
 * day on, open-ended.
 *
 * Its neighbour «Hisobdan chiqarilgan kunlar» answers a question about a named
 * DAY: the platform got that night wrong, so nobody is scored on it. This
 * answers a question about a PERSON: from this date they are no longer a leader
 * here — they left, they moved, their unit was handed over — and every day from
 * that one on is a day they were never expected to file.
 *
 * **It is a separate destination and not a fourth view over there, because the
 * selection unit is different all the way down.** Everything in that file is
 * keyed by leader-DAY: its row key is `p<id>|<date>`, its missing-day list is
 * drawn per leader per calendar day and capped at 62 days for exactly that
 * reason, and its POST body is a list of days. A cutoff has no day dimension
 * and no reason for a cap — one row per person, one date for the batch. Sharing
 * that path would mean making every piece of it mean two things.
 *
 * Three things it deliberately does NOT do:
 *
 *   * **It does not touch the past.** Days before the date keep the score they
 *     always had. A leader who comes back has their cutoff LIFTED (or moved
 *     later); a gap in the middle of a career is a run of day exclusions, which
 *     is precisely what the tab next door is for.
 *   * **It never deletes anything.** Photos, verdicts, day reports and both
 *     collection layers are untouched; only whether a number enters an average
 *     changes. Lifting restores every affected day at once, because nothing was
 *     ever written onto one.
 *   * **It is not grantable.** No `capKey` on the ADMIN_NAV entry, so
 *     `capTabs.includes(capKey ?? id)` can never admit a grantee — the
 *     `permissions` / `logs` / `ltdaily` / `ltexclude` model. It moves a
 *     leader's score and their brigadir's.
 *
 * The source is the leader ROSTER served beside `/api/leaders` — one row per
 * leader, carrying the cutoff they already have. Not the register: a leader who
 * has filed nothing at all is exactly the one most likely to need this, and the
 * register has no trace of them.
 */

const TXT = {
  uz: {
    lead: "Tanlangan liderning natijalari shu kundan boshlab hech qayerda hisobga olinmaydi — na o'z ballida, na brigadaning o'rtachasida. Undan oldingi kunlar o'z bahosi bilan qoladi va hech narsa o'chirilmaydi.",
    tabOn: "Hisobga olinadi", tabOff: "Hisobdan chiqarilgan",
    search: "Lider yoki brigadir...",
    fShift: "Smena", fSup: "Brigadir", fLeader: "Lider", all: "Barchasi",
    shift1: "1-smena", shift2: "2-smena",
    thLeader: "Lider", thSup: "Brigadir", thShift: "Smena",
    thFrom: "Qaysi kundan", thWhy: "Sabab", thBy: "Kim",
    rows: "{n} ta lider", picked: "{n} ta tanlandi",
    selAll: "Hammasini tanlash ({n})", selNone: "Tanlovni bekor qilish",
    from: "Qaysi kundan", fromHint: "Shu kun ham, undan keyingi barcha kunlar ham hisobga olinmaydi.",
    cut: "{n} ta liderni chiqarish",
    move: "{n} ta liderning sanasini o'zgartirish",
    confirmMove: "Sana o'zgartirilsinmi?",
    restore: "{n} ta liderni qaytarish",
    reason: "Sabab", reasonHint: "Bu sabab liderga va brigadirga xabar qilib yuboriladi, hisobotda ham ko'rinadi.",
    reasonPh: "Masalan: ishdan bo'shadi",
    confirmOn: "Liderlar hisobdan chiqarilsinmi?",
    confirmOnBody: "{d} dan boshlab {n} ta liderning barcha kunlari natijalardan chiqariladi — bugungi va kelgusi kunlar ham. Undan oldingi kunlar o'zgarmaydi. Liderlar va brigadirlar xabardor qilinadi.",
    challengeLabel: "Tasdiqlash uchun sanani yozing",
    confirmOff: "Liderlar qaytarilsinmi?",
    confirmOffBody: "{n} ta liderning kunlari yana natijalarga qo'shiladi, o'z bahosi bilan. Yopilgan kunlar bo'yicha ularga hisobot xabarlari yuborilishi mumkin.",
    okOn: "{n} ta lider hisobdan chiqarildi", okOff: "{n} ta lider qaytarildi",
    told: "{n} kishiga xabar berildi",
    failed: "Saqlanmadi",
    needFrom: "Sanani tanlang",
    emptyOn: "Lider yo'q",
    emptyOnBody: "Filtrlarni o'zgartiring.",
    emptyOff: "Hisobdan chiqarilgan lider yo'q",
    emptyOffBody: "Hamma liderning natijalari hisobga olinadi.",
    loadFailed: "Ma'lumot yuklanmadi",
  },
  uz_cyrl: {
    lead: "Танланган лидернинг натижалари шу кундан бошлаб ҳеч қаерда ҳисобга олинмайди — на ўз баллида, на бригаданинг ўртачасида. Ундан олдинги кунлар ўз баҳоси билан қолади ва ҳеч нарса ўчирилмайди.",
    tabOn: "Ҳисобга олинади", tabOff: "Ҳисобдан чиқарилган",
    search: "Лидер ёки бригадир...",
    fShift: "Смена", fSup: "Бригадир", fLeader: "Лидер", all: "Барчаси",
    shift1: "1-смена", shift2: "2-смена",
    thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена",
    thFrom: "Қайси кундан", thWhy: "Сабаб", thBy: "Ким",
    rows: "{n} та лидер", picked: "{n} та танланди",
    selAll: "Ҳаммасини танлаш ({n})", selNone: "Танловни бекор қилиш",
    from: "Қайси кундан", fromHint: "Шу кун ҳам, ундан кейинги барча кунлар ҳам ҳисобга олинмайди.",
    cut: "{n} та лидерни чиқариш",
    move: "{n} та лидернинг санасини ўзгартириш",
    confirmMove: "Сана ўзгартирилсинми?",
    restore: "{n} та лидерни қайтариш",
    reason: "Сабаб", reasonHint: "Бу сабаб лидерга ва бригадирга хабар қилиб юборилади, ҳисоботда ҳам кўринади.",
    reasonPh: "Масалан: ишдан бўшади",
    confirmOn: "Лидерлар ҳисобдан чиқарилсинми?",
    confirmOnBody: "{d} дан бошлаб {n} та лидернинг барча кунлари натижалардан чиқарилади — бугунги ва келгуси кунлар ҳам. Ундан олдинги кунлар ўзгармайди. Лидерлар ва бригадирлар хабардор қилинади.",
    challengeLabel: "Тасдиқлаш учун санани ёзинг",
    confirmOff: "Лидерлар қайтарилсинми?",
    confirmOffBody: "{n} та лидернинг кунлари яна натижаларга қўшилади, ўз баҳоси билан. Ёпилган кунлар бўйича уларга ҳисобот хабарлари юборилиши мумкин.",
    okOn: "{n} та лидер ҳисобдан чиқарилди", okOff: "{n} та лидер қайтарилди",
    told: "{n} кишига хабар берилди",
    failed: "Сақланмади",
    needFrom: "Санани танланг",
    emptyOn: "Лидер йўқ",
    emptyOnBody: "Филтрларни ўзгартиринг.",
    emptyOff: "Ҳисобдан чиқарилган лидер йўқ",
    emptyOffBody: "Ҳамма лидернинг натижалари ҳисобга олинади.",
    loadFailed: "Маълумот юкланмади",
  },
  ru: {
    lead: "Результаты выбранного лидера с этого дня нигде не учитываются — ни в его балле, ни в среднем по бригаде. Более ранние дни остаются со своими оценками, ничего не удаляется.",
    tabOn: "Учитываются", tabOff: "Не учитываются",
    search: "Лидер или бригадир...",
    fShift: "Смена", fSup: "Бригадир", fLeader: "Лидер", all: "Все",
    shift1: "1-я смена", shift2: "2-я смена",
    thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена",
    thFrom: "С какого дня", thWhy: "Причина", thBy: "Кто",
    rows: "{n} лидеров", picked: "Выбрано: {n}",
    selAll: "Выбрать все ({n})", selNone: "Снять выбор",
    from: "С какого дня", fromHint: "Этот день и все последующие не учитываются.",
    cut: "Исключить: {n}",
    move: "Изменить дату: {n}",
    confirmMove: "Изменить дату?",
    restore: "Вернуть: {n}",
    reason: "Причина", reasonHint: "Причина отправляется лидеру и бригадиру и видна в отчёте.",
    reasonPh: "Например: уволился",
    confirmOn: "Исключить лидеров из результатов?",
    confirmOnBody: "С {d} все дни {n} лидеров выходят из результатов — сегодняшние и будущие тоже. Более ранние дни не меняются. Лидеры и бригадиры будут уведомлены.",
    challengeLabel: "Введите дату для подтверждения",
    confirmOff: "Вернуть лидеров в результаты?",
    confirmOffBody: "Дни {n} лидеров снова войдут в результаты со своими оценками. По закрытым дням им могут прийти отчёты.",
    okOn: "Исключено лидеров: {n}", okOff: "Возвращено лидеров: {n}",
    told: "Уведомлено: {n}",
    failed: "Не сохранено",
    needFrom: "Выберите дату",
    emptyOn: "Нет лидеров",
    emptyOnBody: "Измените фильтры.",
    emptyOff: "Нет исключённых лидеров",
    emptyOffBody: "Результаты всех лидеров учитываются.",
    loadFailed: "Не удалось загрузить данные",
  },
  en: {
    lead: "From this day on the selected leader's results count nowhere — not in their own score, not in their unit's average. Earlier days keep the scores they always had, and nothing is deleted.",
    tabOn: "Counted", tabOff: "Not counted",
    search: "Leader or supervisor...",
    fShift: "Shift", fSup: "Supervisor", fLeader: "Leader", all: "All",
    shift1: "Shift 1", shift2: "Shift 2",
    thLeader: "Leader", thSup: "Supervisor", thShift: "Shift",
    thFrom: "From", thWhy: "Reason", thBy: "By",
    rows: "{n} leaders", picked: "{n} selected",
    selAll: "Select all ({n})", selNone: "Clear selection",
    from: "From which day", fromHint: "This day and every day after it stop counting.",
    cut: "Stop counting {n}",
    move: "Change the date for {n}",
    confirmMove: "Change the date?",
    restore: "Count {n} again",
    reason: "Reason", reasonHint: "The reason is sent to the leader and their supervisor and is shown on the report.",
    reasonPh: "For example: left the company",
    confirmOn: "Take these leaders out of the results?",
    confirmOnBody: "From {d}, every day of {n} leader(s) leaves the results — today and the days to come included. Earlier days do not change. The leaders and their supervisors are notified.",
    challengeLabel: "Type the date to confirm",
    confirmOff: "Put these leaders back into the results?",
    confirmOffBody: "The days of {n} leader(s) count again, at the scores they always had. Closed days may send them a report.",
    okOn: "{n} leader(s) taken out of the results", okOff: "{n} leader(s) put back",
    told: "{n} notified",
    failed: "Not saved",
    needFrom: "Pick a date",
    emptyOn: "No leaders",
    emptyOnBody: "Change the filters.",
    emptyOff: "No leaders are out of the results",
    emptyOffBody: "Every leader's results are counted.",
    loadFailed: "Could not load the data",
  },
};

const fill = (s, p) => Object.entries(p).reduce(
  (a, [k, v]) => a.replaceAll(`{${k}}`, v), s);

const PAGE_SIZE = 100;
// The LOCAL calendar day, never `toISOString()`. Tashkent is UTC+5, so between
// midnight and 05:00 the UTC date is yesterday — and `from_date` is an
// INCLUSIVE floor, so a default seeded that way silently takes a day that was
// already filed, scored and reported out of every average. `DateRangePicker`
// computes its own "today" the same way, so the two must agree or the picker
// highlights one day while the field holds another.
const todayISO = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function LeaderCutoffs() {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const { tl } = useTranslit();
  const qc = useQueryClient();
  const { show, node: toastNode } = useToast();

  const [view, setView] = usePersistentState("admin.ltcutoff.view", "on");
  const [from, setFrom] = useState(todayISO);
  const [q, setQ] = useState("");
  const [shift, setShift] = useState("All");
  const [sup, setSup] = useState("All");
  const [leader, setLeader] = useState("All");
  const [picked, setPicked] = useState(() => new Set());
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [act, setAct] = useState("cut");        // "cut" | "restore"
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // The SAME cache key the register and the exclusions tab use, so one write
  // invalidates one thing and every leader surface re-reads together.
  const { data, isLoading, isError } = useQuery({
    queryKey: ["leaders"],
    queryFn: async () => (await api.get("/api/leaders")).data,
    staleTime: 60_000,
  });
  // Who was SUPPOSED to file — the roster, admin-only, each entry now carrying
  // the cutoff it already has. Not the register: a leader who has filed nothing
  // at all is exactly the one most likely to need this, and the register holds
  // no trace of them.
  const roster = data?.roster || [];

  const off = view === "off";
  // WHICH action the bar is about to run, chosen by the button pressed rather
  // than derived from the view. The «Hisobga olinadi» view can only ever cut,
  // but the other one has two honest actions — MOVE the date, or lift it — and
  // deriving the action from the view left an admin who wrote the wrong date
  // with no way to correct it but a lift (which hands the days back, DMs both
  // people and re-sends a backlog of reports) followed by a fresh cut.
  const cutting = act === "cut";

  const base = useMemo(
    () => roster.filter((p) => (off ? !!p.cutoff : !p.cutoff)), [roster, off]);

  // Option lists come off the rows this VIEW holds: a brigadir with nobody in
  // it is a scope that can only be empty.
  const sups = useMemo(
    () => [...new Set(base.map((r) => r.supervisor).filter((x) => x && x !== "N/A"))].sort(),
    [base]);
  const leaders = useMemo(
    () => [...new Set(base.filter((r) => sup === "All" || r.supervisor === sup)
      .map((r) => r.name).filter(Boolean))].sort(),
    [base, sup]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return base
      .filter((r) => shift === "All" || r.shift === Number(shift))
      .filter((r) => sup === "All" || r.supervisor === sup)
      .filter((r) => leader === "All" || r.name === leader)
      // Matched against BOTH spellings — the register's own (most often
      // Cyrillic) and the transliterated one this table actually PRINTS.
      // Typing the name you can see is the only search anybody performs.
      .filter((r) => !needle
        || `${tl(r.name || "")} ${r.name || ""}`.toLowerCase().includes(needle)
        || `${tl(r.supervisor || "")} ${r.supervisor || ""}`.toLowerCase().includes(needle))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [base, shift, sup, leader, q, lang]);

  // Paged for the DOM only: `shown` stays the whole filtered set, so a
  // selection made on page 1 is still armed while page 3 is on screen — and
  // «select all» selects the SET, not the slice, which is why its label carries
  // the count.
  const [page, setPage] = useState(1);
  useEffect(() => { setPage(1); }, [view, q, shift, sup, leader]);
  const pageRows = useMemo(
    () => shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [shown, page]);

  const shownIds = useMemo(() => shown.map((r) => r.id), [shown]);
  const allPicked = shownIds.length > 0 && shownIds.every((k) => picked.has(k));

  const toggle = (k) => setPicked((prev) => {
    const next = new Set(prev);
    next.has(k) ? next.delete(k) : next.add(k);
    return next;
  });
  const toggleAll = () => setPicked((prev) => {
    const next = new Set(prev);
    if (allPicked) shownIds.forEach((k) => next.delete(k));
    else shownIds.forEach((k) => next.add(k));
    return next;
  });

  // Switching the view drops the selection: the two lists answer opposite
  // questions, and carrying ticks across would arm a bulk action against rows
  // the operator can no longer see.
  const switchView = (v) => {
    setView(v); setPicked(new Set()); setErr(""); setAct("cut");
  };

  const chosen = useMemo(
    () => shown.filter((r) => picked.has(r.id)), [shown, picked]);
  const nCols = 4 + (off ? 3 : 0);

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const { data: res } = await api.post("/api/leaders/cutoffs", {
        cutoff: cutting,
        from: cutting ? from : null,
        reason: cutting ? reason.trim() : "",
        items: chosen.map((r) => ({
          leader_id: r.id,
          leader: r.name ?? null,
          manager_id: r.manager_id ?? null,
        })),
      });
      setConfirm(false);
      setPicked(new Set());
      setReason("");
      show(fill(cutting ? T.okOn : T.okOff, { n: res.changed })
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
        * destination's name and its one-line `admin.desc.*` description. */}
      <p className="text-xs leading-relaxed mb-3"
        style={{ color: "var(--text-3)", maxWidth: 760 }}>
        {T.lead}
      </p>

      <div className="mb-3">
        <SegmentedToggle asTabs value={view} onChange={switchView}
          options={[["on", T.tabOn], ["off", T.tabOff]]} />
      </div>

      <TableCard
        icon={off ? RotateCcw : UserMinus}
        title={off ? T.tabOff : T.tabOn}
        right={<span className="text-xs tabular-nums" style={{ color: "var(--text-4)" }}>
          {fill(T.rows, { n: shown.length })}
        </span>}
        toolbar={<>
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
            <Th label={T.thLeader} />
            <Th label={T.thSup} />
            <Th label={T.thShift} align="center" />
            {off && <Th label={T.thFrom} align="center" />}
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
          ) : shown.length === 0 ? (
            <tr><td colSpan={nCols} className="px-3 py-8">
              <EmptyState showUploadLink={false} icon={off ? RotateCcw : UserMinus}
                title={off ? T.emptyOff : T.emptyOn}
                message={off ? T.emptyOffBody : T.emptyOnBody} />
            </td></tr>
          ) : pageRows.map((r) => {
            const sel = picked.has(r.id);
            return (
              <tr key={r.id} onClick={() => toggle(r.id)}
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
                <td className="px-3 py-2" style={{ color: "var(--text-1)" }}>{nm(r.name)}</td>
                <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                  {r.supervisor && r.supervisor !== "N/A" ? nm(r.supervisor) : "—"}
                </td>
                <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-3)" }}>
                  {r.shift ?? "—"}
                </td>
                {off && (
                  <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-2)" }}>
                    {r.cutoff || "—"}
                  </td>
                )}
                {off && (
                  <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                    {r.cutoff_reason || "—"}
                  </td>
                )}
                {off && (
                  <td className="px-3 py-2" style={{ color: "var(--text-4)" }}>
                    {r.cutoff_by || "—"}
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
          <div className="min-w-[210px]">
            <FormField label={T.from} required hint={T.fromHint}>
              <DateRangePicker single dateFrom={from} dateTo={from}
                setDateFrom={(v) => setFrom(v || "")} setDateTo={() => {}}
                triggerClassName="px-3 py-2 text-sm" />
            </FormField>
          </div>
          <div className="flex-1 min-w-[240px]">
            <FormField label={T.reason} required hint={T.reasonHint}>
              <input value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={T.reasonPh}
                className="w-full rounded-xl px-3 py-2 text-sm"
                style={{ background: "var(--bg-inner)", border: "1px solid var(--border)",
                         color: "var(--text-1)" }} />
            </FormField>
          </div>
          {/* Two actions in the «Hisobdan chiqarilgan» view, and they are not
            * variants of each other: MOVE the floor (the date beside them) or
            * lift it entirely. The reversible one sits left and the one that
            * takes days away sits right — the modal-footer rule. The date and
            * reason are required for the move and ignored by the lift, which is
            * why only the right-hand button is gated on them. */}
          {off && (
            <Button size="lg" variant="secondary"
              onClick={() => { setAct("restore"); setErr(""); setConfirm(true); }}>
              {fill(T.restore, { n: chosen.length })}
            </Button>
          )}
          <Button size="lg" variant="danger"
            disabled={!reason.trim() || !from}
            onClick={() => { setAct("cut"); setErr(""); setConfirm(true); }}>
            {fill(off ? T.move : T.cut, { n: chosen.length })}
          </Button>
        </div>
      )}

      {/* `challenge` — the operator retypes the date. The exclusions tab
        * deliberately does not ask for one: that decision names ONE night and
        * its blast radius is visible in the list. This one has no end date, so
        * it silently covers every day that has not happened yet, and a mis-typed
        * month is a whole quarter nobody notices. */}
      <ConfirmDialog
        open={confirm}
        tone={cutting ? "danger" : "warning"}
        title={cutting ? (off ? T.confirmMove : T.confirmOn) : T.confirmOff}
        message={fill(cutting ? T.confirmOnBody : T.confirmOffBody,
                      { n: chosen.length, d: from })}
        challenge={cutting ? from : undefined}
        challengeLabel={cutting ? T.challengeLabel : undefined}
        confirmLabel={fill(cutting ? (off ? T.move : T.cut) : T.restore,
                           { n: chosen.length })}
        loading={busy}
        error={err}
        onConfirm={submit}
        onCancel={() => { setConfirm(false); setErr(""); }}
      />
    </div>
  );
}
