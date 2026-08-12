import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, ShieldAlert } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import SegmentedToggle from "../ui/SegmentedToggle";
import StyledSelect from "../ui/StyledSelect";
import DateRangePicker from "../ui/DateRangePicker";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";

/**
 * «AI tarixini tozalash» — delete AI verdicts and set the date review starts
 * from.
 *
 * The reviewer's criteria get reworked, and every verdict written under the old
 * ones is an answer to a question nobody asks any more. It is not corrupt data
 * to repair — it is stale, and on the page it looks exactly like a live verdict.
 * Until now the only cure was a flag-guarded purge in `app/startup.py`: a code
 * push and a restart, performed by somebody with repo access at the moment the
 * operator noticed. The people who run the plant have neither, which is what
 * this form is for.
 *
 * The two halves are ONE action on purpose. Deleting without moving the review
 * floor is a no-op with a bill attached: discovery back-fills every report ever
 * filed, so the next drain re-inserts exactly what was deleted and re-spends
 * quota judging it. The floor rides in the same request and defaults to on.
 *
 * Safety, in the order it matters:
 *  - **admin-only, never grantable.** The endpoint tests the JWT role itself,
 *    so it sits outside the per-profile capability system exactly like the DB
 *    restore.
 *  - **human rulings survive by default.** A resolution is a person's decision
 *    and the calibration stats are computed over precisely those rows; taking
 *    them needs a deliberate tick.
 *  - **the confirm prints the real count**, fetched as a dry run first, and a
 *    whole-history wipe demands a typed challenge — no undo reaches a deleted
 *    verdict.
 */

const CHALLENGE = "CLEAR";

const TXT = {
  uz: {
    open: "Tarixni tozalash",
    title: "AI tarixini tozalash",
    sub: "Eski xulosalarni o'chirish va tekshiruv boshlanish sanasi",
    why: "AI savollari o'zgarganda eski xulosalar eskirgan savolga javob bo'lib qoladi — sahifada esa ular xuddi tirik xulosadek ko'rinadi. Bu yerda ular butunlay o'chiriladi.",
    scope: "Qaysi xulosalar",
    scAll: "Hammasi", scFlagged: "Shubhalilar", scClean: "Tozalar", scUnjudged: "Navbat qoldig'i",
    scopeHint: "«Navbat qoldig'i» — hali tekshirilmagan yoki xatolik bilan qolgan qatorlar. Ularda xulosa yo'q, ya'ni hech narsa yo'qolmaydi.",
    range: "Sana oralig'i",
    rangeHint: "Bo'sh qoldirilsa — butun tarix.",
    fShift: "Smena", fSup: "Brigadir", fLeader: "Lider",
    allShifts: "Hammasi", allSups: "Barcha brigadirlar", allLeaders: "Barcha liderlar",
    search: "Qidirish…",
    floor: "Tekshiruv shu sanadan boshlanadi",
    floorHint: "Bundan oldingi hisobotlar hech qachon tekshirilmaydi. Busiz o'chirilgan qatorlar keyingi tekshiruvda qaytadan topiladi va kvota yana sarflanadi.",
    floorOff: "Sanani o'zgartirmaslik",
    floorNow: "Hozir: {t}", floorNone: "Hozir: cheklov yo'q",
    floorLift: "Boshlanish sanasi olib tashlanadi",
    resolved: "Admin hukmi bor qatorlar ham o'chirilsin",
    resolvedHint: "Odatda kerak emas: hukm — odam qilgan ish, va AI aniqligi statistikasi aynan shu qatorlar bo'yicha hisoblanadi.",
    resolvedN: "Tanlanganda {n} tasida admin hukmi bor.",
    slice: "Tanlangan",
    cancel: "Bekor qilish",
    go: "O'chirish",
    counting: "Hisoblanmoqda…",
    confirmTitle: "{n} ta xulosa o'chirilsinmi?",
    confirmBody: "O'chirilgan xulosani qaytarib bo'lmaydi. Tekshiruv boshlanish sanasidan keyingi hisobotlar qaytadan tekshiriladi.",
    confirmAll: "Bu — bazadagi BARCHA xulosalar.",
    confirmNone: "Bu oraliqda o'chiriladigan xulosa yo'q — faqat boshlanish sanasi yangilanadi.",
    challengeLabel: "Tasdiqlash uchun «CLEAR» deb yozing",
    doneN: "{n} ta xulosa o'chirildi",
    doneFloor: "Tekshiruv {t} dan boshlanadi",
  },
  uz_cyrl: {
    open: "Тарихни тозалаш",
    title: "AI тарихини тозалаш",
    sub: "Эски хулосаларни ўчириш ва текширув бошланиш санаси",
    why: "AI саволлари ўзгарганда эски хулосалар эскирган саволга жавоб бўлиб қолади — саҳифада эса улар худди тирик хулосадек кўринади. Бу ерда улар бутунлай ўчирилади.",
    scope: "Қайси хулосалар",
    scAll: "Ҳаммаси", scFlagged: "Шубҳалилар", scClean: "Тозалар", scUnjudged: "Навбат қолдиғи",
    scopeHint: "«Навбат қолдиғи» — ҳали текширилмаган ёки хатолик билан қолган қаторлар. Уларда хулоса йўқ, яъни ҳеч нарса йўқолмайди.",
    range: "Сана оралиғи",
    rangeHint: "Бўш қолдирилса — бутун тарих.",
    fShift: "Смена", fSup: "Бригадир", fLeader: "Лидер",
    allShifts: "Ҳаммаси", allSups: "Барча бригадирлар", allLeaders: "Барча лидерлар",
    search: "Қидириш…",
    floor: "Текширув шу санадан бошланади",
    floorHint: "Бундан олдинги ҳисоботлар ҳеч қачон текширилмайди. Бусиз ўчирилган қаторлар кейинги текширувда қайтадан топилади ва квота яна сарфланади.",
    floorOff: "Санани ўзгартирмаслик",
    floorNow: "Ҳозир: {t}", floorNone: "Ҳозир: чеклов йўқ",
    floorLift: "Бошланиш санаси олиб ташланади",
    resolved: "Админ ҳукми бор қаторлар ҳам ўчирилсин",
    resolvedHint: "Одатда керак эмас: ҳукм — одам қилган иш, ва AI аниқлиги статистикаси айнан шу қаторлар бўйича ҳисобланади.",
    resolvedN: "Танланганда {n} тасида админ ҳукми бор.",
    slice: "Танланган",
    cancel: "Бекор қилиш",
    go: "Ўчириш",
    counting: "Ҳисобланмоқда…",
    confirmTitle: "{n} та хулоса ўчирилсинми?",
    confirmBody: "Ўчирилган хулосани қайтариб бўлмайди. Текширув бошланиш санасидан кейинги ҳисоботлар қайтадан текширилади.",
    confirmAll: "Бу — базадаги БАРЧА хулосалар.",
    confirmNone: "Бу оралиқда ўчириладиган хулоса йўқ — фақат бошланиш санаси янгиланади.",
    challengeLabel: "Тасдиқлаш учун «CLEAR» деб ёзинг",
    doneN: "{n} та хулоса ўчирилди",
    doneFloor: "Текширув {t} дан бошланади",
  },
  ru: {
    open: "Очистить историю",
    title: "Очистка истории ИИ",
    sub: "Удаление старых заключений и дата начала проверки",
    why: "Когда меняются вопросы ИИ, старые заключения остаются ответом на вопрос, который больше не задают — а на странице выглядят как живые. Здесь они удаляются полностью.",
    scope: "Какие заключения",
    scAll: "Все", scFlagged: "Сомнительные", scClean: "Чистые", scUnjudged: "Остатки очереди",
    scopeHint: "«Остатки очереди» — строки без вывода: не проверенные или застрявшие с ошибкой. Терять там нечего.",
    range: "Период",
    rangeHint: "Пусто — вся история.",
    fShift: "Смена", fSup: "Бригадир", fLeader: "Лидер",
    allShifts: "Все", allSups: "Все бригадиры", allLeaders: "Все лидеры",
    search: "Поиск…",
    floor: "Проверка начинается с этой даты",
    floorHint: "Отчёты раньше этой даты не проверяются никогда. Без этого удалённые строки найдутся заново при следующей проверке и квота потратится повторно.",
    floorOff: "Не менять дату",
    floorNow: "Сейчас: {t}", floorNone: "Сейчас: без ограничения",
    floorLift: "Дата начала снимается",
    resolved: "Удалять и строки с решением админа",
    resolvedHint: "Обычно не нужно: решение — работа человека, и точность ИИ считается именно по этим строкам.",
    resolvedN: "В выборке строк с решением админа: {n}.",
    slice: "Выбрано",
    cancel: "Отмена",
    go: "Удалить",
    counting: "Считаем…",
    confirmTitle: "Удалить заключений: {n}?",
    confirmBody: "Удалённое заключение вернуть нельзя. Отчёты после даты начала будут проверены заново.",
    confirmAll: "Это ВСЕ заключения в базе.",
    confirmNone: "В этом периоде удалять нечего — обновится только дата начала.",
    challengeLabel: "Введите «CLEAR» для подтверждения",
    doneN: "Удалено заключений: {n}",
    doneFloor: "Проверка начинается с {t}",
  },
  en: {
    open: "Clear history",
    title: "Clear AI history",
    sub: "Delete old verdicts and set where review starts",
    why: "When the reviewer's questions change, old verdicts are answers to a question nobody asks — and on the page they look exactly like live ones. This deletes them outright.",
    scope: "Which verdicts",
    scAll: "All", scFlagged: "Flagged", scClean: "Clean", scUnjudged: "Queue leftovers",
    scopeHint: "«Queue leftovers» are rows with no verdict — never checked, or stuck on an error. Nothing is lost there.",
    range: "Date range",
    rangeHint: "Leave empty for all history.",
    fShift: "Shift", fSup: "Supervisor", fLeader: "Leader",
    allShifts: "Both", allSups: "All supervisors", allLeaders: "All leaders",
    search: "Search…",
    floor: "Review starts from this date",
    floorHint: "Reports before it are never reviewed. Without this, the deleted rows are found again on the next pass and the quota is spent judging them a second time.",
    floorOff: "Leave the date as it is",
    floorNow: "Now: {t}", floorNone: "Now: no limit",
    floorLift: "The start date is removed",
    resolved: "Also delete rows an admin has ruled on",
    resolvedHint: "Rarely wanted: a ruling is a person's work, and the AI-accuracy stats are computed over exactly those rows.",
    resolvedN: "{n} rows in this slice carry an admin ruling.",
    slice: "Selected",
    cancel: "Cancel",
    go: "Delete",
    counting: "Counting…",
    confirmTitle: "Delete {n} verdicts?",
    confirmBody: "A deleted verdict cannot be brought back. Reports after the start date will be checked again.",
    confirmAll: "That is EVERY verdict in the database.",
    confirmNone: "Nothing to delete in this range — only the start date is updated.",
    challengeLabel: "Type «CLEAR» to confirm",
    doneN: "{n} verdicts deleted",
    doneFloor: "Review starts from {t}",
  },
};

const fmt = (s, v) => String(s).replace(/\{[nt]\}/g, v);

export default function AiClearHistory({ floor, defaultFloor }) {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.ru;
  const qc = useQueryClient();
  const { show: showToast, node: toastNode } = useToast();

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("all");
  const [range, setRange] = useState({ from: "", to: "" });
  const [shift, setShift] = useState(null);
  const [manager, setManager] = useState(null);
  const [leader, setLeader] = useState(null);
  const [withResolved, setWithResolved] = useState(false);
  // The floor starts at whatever is in force — an operator clearing a slice is
  // usually not moving where review begins, and pre-filling today's date would
  // silently offer to switch the whole feature off.
  const [setsFloor, setSetsFloor] = useState(true);
  const [newFloor, setNewFloor] = useState(floor || defaultFloor || "");
  const [confirm, setConfirm] = useState(null);
  const [confirmErr, setConfirmErr] = useState(null);

  // Same slice endpoint the re-check modal uses, so the two forms can never
  // disagree about who a filter reaches or what a range holds.
  const { data: slice } = useQuery({
    queryKey: ["leader-ai-range", range.from || "", range.to || "",
               shift ?? "", manager ?? "", leader ?? ""],
    enabled: open,
    queryFn: () => api.get("/api/leader-ai/range", {
      params: {
        date_from: range.from || undefined, date_to: range.to || undefined,
        shift: shift ?? undefined,
        manager_id: manager ?? undefined,
        leader_id: leader ?? undefined,
      },
    }).then((r) => r.data),
  });
  const facets = slice?.facets || {};
  const counted = !!slice?.facets;

  const body = useMemo(() => ({
    scope,
    date_from: range.from || null,
    date_to: range.to || null,
    shift, manager_id: manager, leader_id: leader,
    include_resolved: withResolved,
    set_floor: setsFloor,
    floor: setsFloor ? (newFloor || "") : null,
  }), [scope, range, shift, manager, leader, withResolved, setsFloor, newFloor]);

  // Everything, nowhere narrowed — the shape a hurried tap produces, since it is
  // what the form reaches by touching nothing. That is the one that earns a
  // typed challenge.
  const wholeCorpus = scope === "all" && !range.from && !range.to
    && shift == null && manager == null && leader == null;

  const nameOf = (dim, id) => (id == null ? null
    : (facets[dim] || []).find((o) => o.v === id)?.label
      || facets.picked?.[dim] || `#${id}`);
  const shiftN = (s) => (facets.shift || []).find((o) => o.v === s)?.n;
  const managerName = nameOf("manager", manager);
  const leaderName = nameOf("leader", leader);

  const optList = (dim, allLabel, picked, pickedName) => {
    const live = (facets[dim] || []).map((o) => ({
      value: o.v, title: o.label,
      label: `${o.label} · ${o.n.toLocaleString()}`,
    }));
    const missing = picked != null && !live.some((o) => o.value === picked);
    return [
      { value: null, label: allLabel },
      ...(missing ? [{ value: picked, title: pickedName, label: `${pickedName} · 0` }] : []),
      ...live,
    ];
  };

  const sliceBits = [
    (range.from || range.to) ? `${range.from || "…"} – ${range.to || "…"}` : null,
    shift != null ? `S${shift}` : null,
    managerName, leaderName,
  ].filter(Boolean);

  const countMut = useMutation({
    mutationFn: () => api.post("/api/leader-ai/history/clear", { ...body, dry_run: true })
      .then((r) => r.data),
    onSuccess: (d) => setConfirm({ n: d.deleted, resolved: d.resolved }),
    onError: (e) => showToast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });

  const runMut = useMutation({
    mutationFn: () => api.post("/api/leader-ai/history/clear", body).then((r) => r.data),
    onSuccess: (d) => {
      setConfirm(null);
      setOpen(false);
      showToast(
        `${fmt(T.doneN, (d.deleted || 0).toLocaleString())}${
          d.floor ? ` · ${fmt(T.doneFloor, d.floor)}` : ""}`,
        "success",
      );
      // Everything on the page reads this table: the register badges, the triage
      // queue, the coverage bar and the tab counter. Re-read them all rather
      // than leaving a screen quoting rows that no longer exist.
      qc.invalidateQueries({ queryKey: ["leader-ai-overview"] });
      qc.invalidateQueries({ queryKey: ["leader-ai-progress"] });
      qc.invalidateQueries({ queryKey: ["leader-ai-queue"] });
      qc.invalidateQueries({ queryKey: ["leader-ai-activity"] });
    },
    onError: (e) => setConfirmErr(e?.response?.data?.detail || String(e?.message || e)),
  });

  return (
    <>
      {/* Danger-tinted and last in the row: it destroys, and a destructive
          action must not wear the same clothes as the two beside it that only
          queue work. */}
      <Button size="lg" variant="danger" tint icon={<Trash2 size={14} />}
        onClick={() => setOpen(true)}>
        {T.open}
      </Button>

      {open && (
        <Modal open onClose={() => setOpen(false)} title={T.title} subtitle={T.sub}
          icon={<Trash2 size={16} />}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>{T.cancel}</Button>
              <Button variant="danger" loading={countMut.isPending}
                onClick={() => { setConfirmErr(null); countMut.mutate(); }}>
                {countMut.isPending ? T.counting : T.go}
              </Button>
            </>
          }>
          <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-3)" }}>
            {T.why}
          </p>

          <FormField label={T.scope} hint={T.scopeHint}>
            <SegmentedToggle fill scrollable value={scope} onChange={setScope} options={[
              ["all", T.scAll], ["flagged", T.scFlagged],
              ["clean", T.scClean], ["unjudged", T.scUnjudged],
            ]} />
          </FormField>

          <FormField label={T.range} hint={T.rangeHint}>
            <DateRangePicker
              dateFrom={range.from} dateTo={range.to}
              setDateFrom={(v) => setRange((r) => ({ ...r, from: v || "" }))}
              setDateTo={(v) => setRange((r) => ({ ...r, to: v || "" }))} />
          </FormField>

          {/* WHO, after WHEN — coarsest first, the order the platform narrows in
              everywhere else. Each option carries its row count from the same
              column the filter tests, so no option is a dead end. */}
          <FormField label={T.fShift}>
            <SegmentedToggle fill value={shift} onChange={setShift}
              options={[
                [null, T.allShifts],
                ...[1, 2]
                  .filter((s) => !counted || shiftN(s) || shift === s)
                  .map((s) => [s, counted
                    ? `S${s} · ${(shiftN(s) || 0).toLocaleString()}` : `S${s}`]),
              ]} />
          </FormField>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label={T.fSup}>
              <StyledSelect searchable searchPlaceholder={T.search}
                value={manager} onChange={setManager}
                options={optList("manager", T.allSups, manager, managerName)} />
            </FormField>
            <FormField label={T.fLeader}>
              <StyledSelect searchable searchPlaceholder={T.search}
                value={leader} onChange={setLeader}
                options={optList("leader", T.allLeaders, leader, leaderName)} />
            </FormField>
          </div>

          {/* ── the half that makes the delete stick ────────────────────────────
              Discovery back-fills every report ever filed, so a wipe without a
              floor is undone on the next pass and paid for twice. It is one
              action with two halves, not two actions. */}
          <FormField label={T.floor} hint={T.floorHint}>
            <div className="flex items-center gap-2 flex-wrap">
              <DateRangePicker single dateFrom={newFloor}
                setDateFrom={(v) => { setNewFloor(v || ""); setSetsFloor(true); }} />
              <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer"
                style={{ color: "var(--text-3)" }}>
                <input type="checkbox" checked={!setsFloor}
                  onChange={(e) => setSetsFloor(!e.target.checked)}
                  className="w-3.5 h-3.5 accent-[var(--brand)] cursor-pointer" />
                {T.floorOff}
              </label>
              <span className="text-[11px] ml-auto tabular-nums" style={{ color: "var(--text-4)" }}>
                {floor ? fmt(T.floorNow, floor) : T.floorNone}
              </span>
            </div>
          </FormField>

          {/* A human ruling is not AI history. It gets its own tick, and its own
              warning, because deleting one throws away work a person did. */}
          <label className="flex items-start gap-2 rounded-xl p-3 cursor-pointer"
            style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
            <input type="checkbox" checked={withResolved}
              onChange={(e) => setWithResolved(e.target.checked)}
              className="w-4 h-4 mt-0.5 accent-[#ef4444] cursor-pointer flex-shrink-0" />
            <span className="min-w-0">
              <span className="text-xs font-semibold block" style={{ color: "var(--text-2)" }}>
                {T.resolved}
              </span>
              <span className="text-[11px] block mt-0.5" style={{ color: "var(--text-3)" }}>
                {T.resolvedHint}
              </span>
            </span>
          </label>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          open
          tone="danger"
          title={fmt(T.confirmTitle, (confirm.n || 0).toLocaleString())}
          message={
            <>
              {confirm.n ? T.confirmBody : T.confirmNone}
              {confirm.n > 0 && wholeCorpus ? ` ${T.confirmAll}` : ""}
              {/* Rulings the tick would take with it — counted, not implied. */}
              {withResolved && confirm.resolved > 0 && (
                <div className="flex items-start gap-1.5 mt-2 text-[11px]" style={{ color: "#ef4444" }}>
                  <ShieldAlert size={13} className="flex-shrink-0 mt-px" />
                  {fmt(T.resolvedN, confirm.resolved.toLocaleString())}
                </div>
              )}
              {/* WHAT it is about to run on, at the last gate: a narrowed wipe
                  is exactly the case where a count alone cannot be checked
                  against what was meant. */}
              {(sliceBits.length > 0 || setsFloor) && (
                <div className="mt-2 pt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1"
                  style={{ borderTop: "1px solid var(--border)" }}>
                  <span className="text-[11px] uppercase tracking-wider"
                    style={{ color: "var(--text-4)" }}>{T.slice}</span>
                  {sliceBits.map((b) => (
                    <span key={b} className="px-1.5 py-0.5 rounded-md text-[11px] font-medium"
                      style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                      {b}
                    </span>
                  ))}
                  {setsFloor && (
                    <span className="px-1.5 py-0.5 rounded-md text-[11px] font-medium"
                      style={{ background: "var(--bg-inner)", color: "var(--text-2)" }}>
                      {newFloor ? fmt(T.doneFloor, newFloor) : T.floorLift}
                    </span>
                  )}
                </div>
              )}
            </>
          }
          confirmLabel={T.go}
          cancelLabel={T.cancel}
          loading={runMut.isPending}
          error={confirmErr}
          challenge={wholeCorpus && confirm.n > 0 ? CHALLENGE : undefined}
          challengeLabel={wholeCorpus && confirm.n > 0 ? T.challengeLabel : undefined}
          onCancel={() => { setConfirm(null); setConfirmErr(null); }}
          onConfirm={() => { setConfirmErr(null); runMut.mutate(); }}
        />
      )}

      {toastNode}
    </>
  );
}
