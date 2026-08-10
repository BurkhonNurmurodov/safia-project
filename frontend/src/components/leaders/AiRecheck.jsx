import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RefreshCw, Sparkles, AlertTriangle } from "lucide-react";
import Modal from "../ui/Modal";
import Button from "../ui/Button";
import FormField from "../ui/FormField";
import SegmentedToggle from "../ui/SegmentedToggle";
import DateRangePicker from "../ui/DateRangePicker";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useToast } from "../ui/Toast";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";

/**
 * «AI qayta tekshiruv» — re-run the proof reviewer over verdicts it has already
 * written.
 *
 * This exists because the reviewer's QUESTIONS change. A verdict written by an
 * older prompt (or an older model) is not corrupt data to be repaired — it is
 * an answer to a question the system no longer asks, and nothing on the page
 * can tell the two apart by looking. Until now the only way to re-earn those
 * answers was `backfill_leader_ai.py` from a shell on the server, which is a
 * capability an admin working from a phone simply does not have.
 *
 * What keeps it safe to put behind a button:
 *  - it only QUEUES. The drain does the spending, batch-capped and on a timer,
 *    so ten thousand re-queued rows pace themselves instead of becoming one
 *    request that dies with its worker.
 *  - resolved rows are never touched (server-side rule) — a human ruling is
 *    that row's terminal state.
 *  - the confirm prints the real count, fetched as a dry run first. "Re-check
 *    everything?" with no number attached is a question nobody can answer, and
 *    every row costs metered quota.
 *  - re-checking the WHOLE corpus demands a typed challenge, because no undo
 *    reaches a verdict once it has been overwritten.
 */

const CHALLENGE = "RECHECK";

const TXT = {
  uz: {
    open: "Qayta tekshirish",
    title: "AI qayta tekshiruvi",
    sub: "Yozilgan xulosalarni qaytadan tekshirish",
    why: "AI savollari o'zgarganda eski xulosalar eskirgan savolga javob bo'lib qoladi. Bu yerda ular navbatga qaytariladi va yangi savollar bo'yicha qaytadan tekshiriladi.",
    scope: "Qaysi xulosalar",
    scFlagged: "Shubhali",
    scClean: "Toza",
    scAll: "Hammasi",
    scUnchecked: "Tekshirilmagan",
    unWhy: "Hali tekshirilmagan hisobotlarni navbatga qo'yadi. Hech qanday xulosa o'chirilmaydi.",
    unCount: "{n} ta qator tekshiriladi",
    unNone: "Bu oraliqda tekshirilmagan qator yo'q",
    unConfirm: "{n} ta qator tekshirilsinmi?",
    unBody: "Mavjud xulosalarga tegilmaydi. Tekshiruv fonda, navbat bilan bajariladi.",
    unGo: "Tekshirishni boshlash",
    scopeHint: "Odatda «Shubhali» yetarli: qat'iyroq tekshiruv ko'pincha o'zi shubhalangan rasmlar haqida fikrini o'zgartiradi.",
    range: "Sana oralig'i",
    rangeHint: "Bo'sh qoldirilsa — butun tarix.",
    resolved: "Admin hukm chiqargan qatorlar tegilmaydi.",
    pace: "Tekshiruv navbat bilan, fonda bajariladi — darrov emas.",
    count: "{n} ta xulosa qayta tekshiriladi",
    countNone: "Bu oraliqda qayta tekshiriladigan xulosa yo'q",
    counting: "Hisoblanmoqda…",
    cancel: "Bekor qilish",
    confirmTitle: "{n} ta xulosa qayta tekshirilsinmi?",
    confirmBody: "Eski xulosalar yangisi bilan almashtiriladi va qaytarib bo'lmaydi. Har bir tekshiruv kvota sarflaydi.",
    confirmAll: "Bu — bazadagi BARCHA xulosalar.",
    challengeLabel: "Tasdiqlash uchun «RECHECK» deb yozing",
    go: "Qayta tekshirish",
    queued: "{n} ta xulosa navbatga qo'yildi",
    failed: "Bajarilmadi",
    errTitle: "Xatolik bilan tugagan qatorlar",
    errBody: "{n} ta qator xatolik bilan tugagan (rasm ochilmagan, kalit ishlamagan). Ularni qayta urinib ko'rish mumkin.",
    errGo: "Qayta urinish",
    errDone: "{n} ta qator qayta navbatga qo'yildi",
  },
  uz_cyrl: {
    open: "Қайта текшириш",
    title: "AI қайта текшируви",
    sub: "Ёзилган хулосаларни қайтадан текшириш",
    why: "AI саволлари ўзгарганда эски хулосалар эскирган саволга жавоб бўлиб қолади. Бу ерда улар навбатга қайтарилади ва янги саволлар бўйича қайтадан текширилади.",
    scope: "Қайси хулосалар",
    scFlagged: "Шубҳали",
    scClean: "Тоза",
    scAll: "Ҳаммаси",
    scUnchecked: "Текширилмаган",
    unWhy: "Ҳали текширилмаган ҳисоботларни навбатга қўяди. Ҳеч қандай хулоса ўчирилмайди.",
    unCount: "{n} та қатор текширилади",
    unNone: "Бу оралиқда текширилмаган қатор йўқ",
    unConfirm: "{n} та қатор текширилсинми?",
    unBody: "Мавжуд хулосаларга тегилмайди. Текширув фонда, навбат билан бажарилади.",
    unGo: "Текширишни бошлаш",
    scopeHint: "Одатда «Шубҳали» етарли: қатъийроқ текширув кўпинча ўзи шубҳаланган расмлар ҳақида фикрини ўзгартиради.",
    range: "Сана оралиғи",
    rangeHint: "Бўш қолдирилса — бутун тарих.",
    resolved: "Админ ҳукм чиқарган қаторлар тегилмайди.",
    pace: "Текширув навбат билан, фонда бажарилади — дарров эмас.",
    count: "{n} та хулоса қайта текширилади",
    countNone: "Бу оралиқда қайта текшириладиган хулоса йўқ",
    counting: "Ҳисобланмоқда…",
    cancel: "Бекор қилиш",
    confirmTitle: "{n} та хулоса қайта текширилсинми?",
    confirmBody: "Эски хулосалар янгиси билан алмаштирилади ва қайтариб бўлмайди. Ҳар бир текширув квота сарфлайди.",
    confirmAll: "Бу — базадаги БАРЧА хулосалар.",
    challengeLabel: "Тасдиқлаш учун «RECHECK» деб ёзинг",
    go: "Қайта текшириш",
    queued: "{n} та хулоса навбатга қўйилди",
    failed: "Бажарилмади",
    errTitle: "Хатолик билан тугаган қаторлар",
    errBody: "{n} та қатор хатолик билан тугаган (расм очилмаган, калит ишламаган). Уларни қайта уриниб кўриш мумкин.",
    errGo: "Қайта уриниш",
    errDone: "{n} та қатор қайта навбатга қўйилди",
  },
  ru: {
    open: "Перепроверить",
    title: "Перепроверка ИИ",
    sub: "Заново проверить уже готовые заключения",
    why: "Когда меняются вопросы, которые задаёт ИИ, старые заключения остаются ответом на вопрос, который больше не задают. Здесь они возвращаются в очередь и проверяются заново.",
    scope: "Какие заключения",
    scFlagged: "Подозрительные",
    scClean: "Чистые",
    scAll: "Все",
    scUnchecked: "Непроверенные",
    unWhy: "Ставит в очередь отчёты, которые ещё не проверялись. Ни один вывод не удаляется.",
    unCount: "Будет проверено строк: {n}",
    unNone: "В этом диапазоне непроверенных строк нет",
    unConfirm: "Проверить {n} строк?",
    unBody: "Существующие выводы не затрагиваются. Проверка идёт в фоне, по очереди.",
    unGo: "Начать проверку",
    scopeHint: "Обычно достаточно «Подозрительных»: более строгая проверка чаще меняет мнение там, где уже сомневалась.",
    range: "Период",
    rangeHint: "Пусто — вся история.",
    resolved: "Строки с решением админа не затрагиваются.",
    pace: "Проверка идёт очередью в фоне — не мгновенно.",
    count: "Будет перепроверено: {n}",
    countNone: "В этом периоде нечего перепроверять",
    counting: "Считаем…",
    cancel: "Отмена",
    confirmTitle: "Перепроверить заключений: {n}?",
    confirmBody: "Старые заключения будут заменены новыми, вернуть их нельзя. Каждая проверка расходует квоту.",
    confirmAll: "Это ВСЕ заключения в базе.",
    challengeLabel: "Введите «RECHECK» для подтверждения",
    go: "Перепроверить",
    queued: "В очередь поставлено: {n}",
    failed: "Не выполнено",
    errTitle: "Строки с ошибкой",
    errBody: "Строк завершилось ошибкой: {n} (фото недоступно, ключ не сработал). Их можно повторить.",
    errGo: "Повторить",
    errDone: "Возвращено в очередь: {n}",
  },
  en: {
    open: "Re-check",
    title: "AI re-check",
    sub: "Run the reviewer again over finished verdicts",
    why: "When the reviewer's questions change, old verdicts are answers to a question no longer asked. This puts them back in the queue to be judged again.",
    scope: "Which verdicts",
    scFlagged: "Flagged",
    scClean: "Clean",
    scAll: "All",
    scUnchecked: "Unchecked",
    unWhy: "Queues reports that have never been checked. No verdict is deleted.",
    unCount: "{n} rows will be checked",
    unNone: "Nothing unchecked in this range",
    unConfirm: "Check {n} rows?",
    unBody: "Existing verdicts are untouched. The check runs in the background, paced.",
    unGo: "Start checking",
    scopeHint: "«Flagged» is usually enough: a stricter reviewer mostly changes its mind where it already had doubts.",
    range: "Date range",
    rangeHint: "Leave empty for all history.",
    resolved: "Rows an admin has ruled on are never touched.",
    pace: "The re-check drains in the background, in batches — not instantly.",
    count: "{n} verdicts will be re-checked",
    countNone: "Nothing to re-check in this range",
    counting: "Counting…",
    cancel: "Cancel",
    confirmTitle: "Re-check {n} verdicts?",
    confirmBody: "The old verdicts are replaced and cannot be brought back. Every check spends quota.",
    confirmAll: "That is EVERY verdict in the database.",
    challengeLabel: "Type «RECHECK» to confirm",
    go: "Re-check",
    queued: "{n} verdicts queued",
    failed: "Failed",
    errTitle: "Rows that ended in an error",
    errBody: "{n} rows ended in an error (photo unreachable, key rejected). They can be retried.",
    errGo: "Retry",
    errDone: "{n} rows put back in the queue",
  },
};

const fmt = (s, n) => String(s).replace("{n}", n);

export default function AiRecheck({ errorCount = 0 }) {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.ru;
  const qc = useQueryClient();
  const { show: showToast, node: toastNode } = useToast();

  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState("flagged");
  const [range, setRange] = useState({ from: "", to: "" });
  const [confirm, setConfirm] = useState(null);   // { n } once the count is in
  const [confirmErr, setConfirmErr] = useState(null);

  // The whole corpus: every verdict, no date bound. This is the one shape that
  // earns a typed challenge — it is also the shape a hurried tap produces,
  // since it is the state the form reaches by touching nothing but the scope.
  const wholeCorpus = scope === "all" && !range.from && !range.to;
  // `unchecked` only ADDS work — nothing is overwritten, so it earns none of
  // the destructive framing below: no typed challenge, no "cannot be undone",
  // and a verb that says what it does rather than what it replaces. Reusing one
  // confirm for both would teach people to click through the dangerous one.
  const additive = scope === "unchecked";

  const body = useMemo(() => ({
    scope,
    date_from: range.from || null,
    date_to: range.to || null,
  }), [scope, range]);

  const countMut = useMutation({
    mutationFn: () => api.post("/api/leader-ai/recheck", { ...body, dry_run: true })
      .then((r) => r.data),
    onSuccess: (d) => setConfirm({ n: d.requeued }),
    onError: (e) => showToast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });

  const runMut = useMutation({
    mutationFn: () => api.post("/api/leader-ai/recheck", body).then((r) => r.data),
    onSuccess: (d) => {
      setConfirm(null);
      setOpen(false);
      showToast(fmt(T.queued, d.requeued), "success");
      // The drain is asynchronous; the counts only move once it has done some
      // work, so re-read shortly after rather than pretending it is finished.
      // The progress strip is the whole feedback for this action — light it up
      // now rather than on its next poll, or the modal closes onto a page that
      // looks like nothing happened.
      qc.invalidateQueries({ queryKey: ["leader-ai-progress"] });
      setTimeout(() => qc.invalidateQueries({ queryKey: ["leader-ai-overview"] }), 4000);
    },
    // Rendered INSIDE the dialog: a mutation that fails must leave the dialog
    // standing with the reason on it, never close and lose the message.
    onError: (e) => setConfirmErr(e?.response?.data?.detail || String(e?.message || e)),
  });

  const retryMut = useMutation({
    mutationFn: () => api.post("/api/leader-ai/retry").then((r) => r.data),
    onSuccess: (d) => {
      showToast(fmt(T.errDone, d.reset), "success");
      setTimeout(() => qc.invalidateQueries({ queryKey: ["leader-ai-overview"] }), 4000);
    },
    onError: (e) => showToast(e?.response?.data?.detail || String(e?.message || e), "error"),
  });

  return (
    <>
      <Button size="sm" variant="secondary" tint icon={<RefreshCw size={13} />}
        onClick={() => setOpen(true)}>
        {T.open}
      </Button>

      {open && (
        <Modal open onClose={() => setOpen(false)} title={T.title} subtitle={T.sub}
          icon={Sparkles}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>{T.cancel}</Button>
              <Button loading={countMut.isPending}
                onClick={() => { setConfirmErr(null); countMut.mutate(); }}>
                {additive ? T.unGo : T.go}
              </Button>
            </>
          }>
          <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--text-3)" }}>
            {additive ? T.unWhy : T.why}
          </p>

          <FormField label={T.scope} hint={T.scopeHint}>
            <SegmentedToggle fill scrollable value={scope} onChange={setScope} options={[
              ["unchecked", T.scUnchecked],
              ["flagged", T.scFlagged], ["clean", T.scClean], ["all", T.scAll],
            ]} />
          </FormField>

          <FormField label={T.range} hint={T.rangeHint}>
            <DateRangePicker
              dateFrom={range.from} dateTo={range.to}
              setDateFrom={(v) => setRange((r) => ({ ...r, from: v || "" }))}
              setDateTo={(v) => setRange((r) => ({ ...r, to: v || "" }))} />
          </FormField>

          <ul className="mt-1 flex flex-col gap-1 text-[11px]" style={{ color: "var(--text-4)" }}>
            <li>· {T.resolved}</li>
            <li>· {T.pace}</li>
          </ul>

          {/* Errored rows are a different problem with a different fix, so they
              are a separate action — but they live here because this modal is
              where an admin without a shell comes to un-stick the reviewer. */}
          {errorCount > 0 && (
            <div className="mt-4 rounded-xl p-3 flex items-start gap-2"
              style={{ background: "var(--bg-inner)", border: "1px solid var(--border)" }}>
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" style={{ color: "#eab308" }} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] font-bold uppercase tracking-wide"
                  style={{ color: "var(--text-3)" }}>{T.errTitle}</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-3)" }}>
                  {fmt(T.errBody, errorCount)}
                </p>
              </div>
              <Button size="sm" variant="secondary" tint className="flex-shrink-0"
                loading={retryMut.isPending} onClick={() => retryMut.mutate()}>
                {T.errGo}
              </Button>
            </div>
          )}
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          open
          tone={additive ? undefined : "danger"}
          title={fmt(additive ? T.unConfirm : T.confirmTitle, confirm.n)}
          message={additive ? T.unBody
            : `${T.confirmBody}${wholeCorpus ? ` ${T.confirmAll}` : ""}`}
          confirmLabel={additive ? T.unGo : T.go}
          cancelLabel={T.cancel}
          loading={runMut.isPending}
          error={confirmErr}
          challenge={!additive && wholeCorpus ? CHALLENGE : undefined}
          challengeLabel={!additive && wholeCorpus ? T.challengeLabel : undefined}
          onCancel={() => { setConfirm(null); setConfirmErr(null); }}
          onConfirm={() => { setConfirmErr(null); runMut.mutate(); }}
        />
      )}

      {toastNode}
    </>
  );
}
