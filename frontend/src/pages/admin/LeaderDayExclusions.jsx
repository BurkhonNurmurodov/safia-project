import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CircleSlash, RotateCcw, AlertTriangle, CalendarDays, Users, Check,
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
 *   * **It has no register of its own.** The rows come from `/api/leaders` —
 *     the same feed the dashboard scores — so the days an admin can exclude are
 *     exactly the days the page counts. A second list built here could offer a
 *     day the register does not have, or hide one it does.
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
    lead: "Bu yerda tanlangan kunlar liderning ham, brigadirning ham natijalariga umuman kirmaydi — na ortiqcha, na kamchilik. Kun o'chirilmaydi: rasmlar, hisobot va baho joyida qoladi, faqat o'rtachaga qo'shilmaydi.",
    tabOn: "Hisobga olinadi", tabOff: "Hisobdan chiqarilgan",
    search: "Lider yoki brigadir...",
    fShift: "Smena", fSup: "Brigadir", fLeader: "Lider", all: "Barchasi",
    shift1: "1-smena", shift2: "2-smena",
    thDate: "Sana", thLeader: "Lider", thSup: "Brigadir", thShift: "Smena",
    thScore: "Natija", thWhy: "Sabab", thBy: "Kim",
    rows: "{n} ta kun", picked: "{n} ta tanlandi",
    selAll: "Ko'rinayotganlarini tanlash", selNone: "Tanlovni bekor qilish",
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
  },
  uz_cyrl: {
    title: "Ҳисобдан чиқарилган кунлар",
    lead: "Бу ерда танланган кунлар лидернинг ҳам, бригадирнинг ҳам натижаларига умуман кирмайди — на ортиқча, на камчилик. Кун ўчирилмайди: расмлар, ҳисобот ва баҳо жойида қолади, фақат ўртачага қўшилмайди.",
    tabOn: "Ҳисобга олинади", tabOff: "Ҳисобдан чиқарилган",
    search: "Лидер ёки бригадир...",
    fShift: "Смена", fSup: "Бригадир", fLeader: "Лидер", all: "Барчаси",
    shift1: "1-смена", shift2: "2-смена",
    thDate: "Сана", thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена",
    thScore: "Натижа", thWhy: "Сабаб", thBy: "Ким",
    rows: "{n} та кун", picked: "{n} та танланди",
    selAll: "Кўринаётганларини танлаш", selNone: "Танловни бекор қилиш",
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
  },
  ru: {
    title: "Исключённые дни",
    lead: "Выбранные здесь дни не входят в результаты ни лидера, ни бригадира — ни в плюс, ни в минус. День не удаляется: фото, отчёт и оценка остаются на месте, просто не попадают в средний балл.",
    tabOn: "Учитываются", tabOff: "Исключены",
    search: "Лидер или бригадир...",
    fShift: "Смена", fSup: "Бригадир", fLeader: "Лидер", all: "Все",
    shift1: "1-я смена", shift2: "2-я смена",
    thDate: "Дата", thLeader: "Лидер", thSup: "Бригадир", thShift: "Смена",
    thScore: "Результат", thWhy: "Причина", thBy: "Кто",
    rows: "дней: {n}", picked: "выбрано: {n}",
    selAll: "Выбрать все видимые", selNone: "Снять выбор",
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
  },
  en: {
    title: "Excluded days",
    lead: "Days picked here count for neither the leader nor the brigadir — no plus, no minus. Nothing is deleted: the photos, the report and the score all stay; they just leave the average.",
    tabOn: "Counting", tabOff: "Excluded",
    search: "Leader or brigadir...",
    fShift: "Shift", fSup: "Brigadir", fLeader: "Leader", all: "All",
    shift1: "Shift 1", shift2: "Shift 2",
    thDate: "Date", thLeader: "Leader", thSup: "Brigadir", thShift: "Shift",
    thScore: "Score", thWhy: "Reason", thBy: "By",
    rows: "{n} day(s)", picked: "{n} selected",
    selAll: "Select all visible", selNone: "Clear selection",
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
  },
};

const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");
const iso = (d) => d.toISOString().slice(0, 10);
const shiftDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d); };

// A leader-day's identity, the same pair the backend keys an exclusion by.
const rowKey = (r) => `${r.leader_id ? `p${r.leader_id}` : `n${(r.leader || "").trim().toLowerCase()}`}|${String(r.date).slice(0, 10)}`;

export default function LeaderDayExclusions() {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.uz;
  const tl = useTranslit();
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

  const inRange = useMemo(() => rows.filter((r) => {
    const d = String(r.date).slice(0, 10);
    return (!from || d >= from) && (!to || d <= to);
  }), [rows, from, to]);

  // Option lists come off the rows the PERIOD holds, not the whole feed: a
  // brigadir with nothing in this fortnight is a scope that can only be empty.
  const sups = useMemo(
    () => [...new Set(inRange.map((r) => r.supervisor).filter((x) => x && x !== "N/A"))].sort(),
    [inRange]);
  const leaders = useMemo(
    () => [...new Set(inRange.filter((r) => sup === "All" || r.supervisor === sup)
      .map((r) => r.leader).filter((x) => x && x !== "N/A"))].sort(),
    [inRange, sup]);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return inRange
      .filter((r) => (view === "off" ? !!r.excluded : !r.excluded))
      .filter((r) => shift === "All" || r.shift === Number(shift))
      .filter((r) => sup === "All" || r.supervisor === sup)
      .filter((r) => leader === "All" || r.leader === leader)
      .filter((r) => !needle
        || String(r.leader || "").toLowerCase().includes(needle)
        || String(r.supervisor || "").toLowerCase().includes(needle))
      .sort((a, b) => String(b.date).localeCompare(String(a.date))
        || String(a.leader || "").localeCompare(String(b.leader || "")));
  }, [inRange, view, shift, sup, leader, q]);

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

  const on = view === "on";
  const chosen = useMemo(
    () => shown.filter((r) => picked.has(rowKey(r))), [shown, picked]);

  const submit = async () => {
    setBusy(true); setErr("");
    try {
      const { data: res } = await api.post("/api/leaders/exclusions", {
        excluded: on,
        reason: on ? reason.trim() : "",
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
      show(fill(on ? T.okOn : T.okOff, { n: res.changed })
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
      <div className="mb-4">
        <h2 className="text-lg font-bold mb-1" style={{ color: "var(--text-1)" }}>{T.title}</h2>
        <p className="text-xs leading-relaxed" style={{ color: "var(--text-3)", maxWidth: 760 }}>
          {T.lead}
        </p>
      </div>

      <div className="mb-3">
        <SegmentedToggle asTabs value={view} onChange={switchView}
          options={[["on", T.tabOn], ["off", T.tabOff]]} />
      </div>

      <TableCard
        icon={on ? CircleSlash : RotateCcw}
        title={T.title}
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
              {allPicked ? T.selNone : T.selAll}
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
            <Th label={T.thScore} align="center" />
            {!on && <Th label={T.thWhy} />}
            {!on && <Th label={T.thBy} />}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            // SkeletonTable renders a div — it needs a cell to live in.
            <tr><td colSpan={on ? 6 : 8} className="p-0">
              <SkeletonTable rows={6} cols={on ? 6 : 8} />
            </td></tr>
          ) : isError ? (
            <tr><td colSpan={on ? 6 : 8} className="px-3 py-6 text-center"
              style={{ color: "var(--text-4)" }}>{T.loadFailed}</td></tr>
          ) : shown.length === 0 ? (
            <tr><td colSpan={on ? 6 : 8} className="px-3 py-8">
              <EmptyState showUploadLink={false}
                icon={on ? CalendarDays : CircleSlash}
                title={on ? T.emptyOn : T.emptyOff}
                message={on ? T.emptyOnBody : T.emptyOffBody} />
            </td></tr>
          ) : shown.map((r) => {
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
                <td className="px-3 py-2 text-center tabular-nums" style={{ color: "var(--text-2)" }}>
                  {Math.round(r.completion)}%
                </td>
                {!on && (
                  <td className="px-3 py-2" style={{ color: "var(--text-3)" }}>
                    {r.excluded?.reason || "—"}
                  </td>
                )}
                {!on && (
                  <td className="px-3 py-2" style={{ color: "var(--text-4)" }}>
                    {r.excluded?.by || "—"}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </TableCard>

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
          {on && (
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
          <Button size="lg" variant={on ? "danger" : "primary"}
            disabled={on && !reason.trim()}
            onClick={() => { setErr(""); setConfirm(true); }}>
            {fill(on ? T.exclude : T.restore, { n: chosen.length })}
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        tone={on ? "danger" : "warning"}
        title={on ? T.confirmOn : T.confirmOff}
        message={fill(on ? T.confirmOnBody : T.confirmOffBody, { n: chosen.length })}
        confirmLabel={fill(on ? T.exclude : T.restore, { n: chosen.length })}
        loading={busy}
        error={err}
        onConfirm={submit}
        onCancel={() => { setConfirm(false); setErr(""); }}
      />
    </div>
  );
}
