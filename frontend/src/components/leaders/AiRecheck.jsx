import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
    rsReports: "hisobot", rsChecked: "tekshirilgan", rsPartial: "qisman", rsUnchecked: "tekshirilmagan",
    rsRows: "dalil rasmi", rsJudged: "xulosa bor", rsQueued: "navbatda", rsStuck: "xatolik",
    rsFlagged: "{n} ta shubhali", rsOpen: "{n} tasi hali ko'rilmagan",
    rsEmpty: "Bu oraliqda dalil rasmi yo'q.",
    rsApprox: "Hisobot soni taxminiy — oraliq juda katta. Qatorlar soni aniq.",
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
    rsReports: "ҳисобот", rsChecked: "текширилган", rsPartial: "қисман", rsUnchecked: "текширилмаган",
    rsRows: "далил расми", rsJudged: "хулоса бор", rsQueued: "навбатда", rsStuck: "хатолик",
    rsFlagged: "{n} та шубҳали", rsOpen: "{n} таси ҳали кўрилмаган",
    rsEmpty: "Бу оралиқда далил расми йўқ.",
    rsApprox: "Ҳисобот сони тахминий — оралиқ жуда катта. Қаторлар сони аниқ.",
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
    rsReports: "отчётов", rsChecked: "проверено", rsPartial: "частично", rsUnchecked: "не проверено",
    rsRows: "фото-подтверждений", rsJudged: "с выводом", rsQueued: "в очереди", rsStuck: "с ошибкой",
    rsFlagged: "сомнительных: {n}", rsOpen: "не разобрано: {n}",
    rsEmpty: "В этом диапазоне нет фото-подтверждений.",
    rsApprox: "Число отчётов приблизительное — диапазон слишком большой. Число строк точное.",
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
    rsReports: "reports", rsChecked: "checked", rsPartial: "partial", rsUnchecked: "unchecked",
    rsRows: "proof rows", rsJudged: "judged", rsQueued: "queued", rsStuck: "errored",
    rsFlagged: "{n} flagged", rsOpen: "{n} not yet reviewed",
    rsEmpty: "No proof photos in this range.",
    rsApprox: "The report count is approximate — the range is very large. Row counts are exact.",
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

/* ══ what the selected range holds ════════════════════════════════════════════
 *
 * The dry-run count answers "how much will this cost". It cannot answer "is
 * this the range I meant, and how much of it is already done" — a bare
 * "1 240 rows" has no denominator, so there is no way to tell a range that is
 * mostly unchecked from one that is nearly finished.
 *
 * Two units, kept separate because they are not interchangeable: REPORTS are
 * what a leader files and what the register lists, PROOF ROWS are what the
 * reviewer judges and what quota is spent per. A report only counts as checked
 * when every row in it has a verdict — half-done days get their own bucket
 * rather than being rounded into "checked", which is the kind of rounding that
 * makes a number stop being believed.
 */
const SEG = {
  judged:  "#22c55e",
  pending: "#94a3b8",
  stuck:   "#eab308",
};

function RangeSummary({ T, from, to }) {
  const { data, isFetching } = useQuery({
    // Keyed by the range, so picking a new one refetches and nothing stale is
    // ever shown next to a date the operator just changed.
    queryKey: ["leader-ai-range", from || "", to || ""],
    queryFn: () => api.get("/api/leader-ai/range", {
      params: { date_from: from || undefined, date_to: to || undefined },
    }).then((r) => r.data),
  });

  const box = "mt-2 rounded-xl p-3";
  const boxStyle = { background: "var(--bg-inner)", border: "1px solid var(--border)" };

  if (isFetching && !data) {
    return (
      <div className={box} style={boxStyle}>
        <div className="h-3 w-40 rounded animate-pulse" style={{ background: "var(--border)" }} />
        <div className="h-1.5 w-full rounded mt-3 animate-pulse" style={{ background: "var(--border)" }} />
      </div>
    );
  }
  if (!data?.enabled) return null;

  const r = data.rows, rep = data.reports;
  if (!r.total) {
    return (
      <div className={box} style={boxStyle}>
        <p className="text-xs" style={{ color: "var(--text-4)" }}>{T.rsEmpty}</p>
      </div>
    );
  }

  const pct = (n) => (n / r.total) * 100;
  const segs = [
    ["judged", r.judged], ["pending", r.pending + r.skipped], ["stuck", r.stuck],
  ].filter(([, n]) => n > 0);

  return (
    <div className={box} style={boxStyle} aria-busy={isFetching}>
      {/* The headline is REPORTS, because that is the unit the question gets
          asked in — "how many reports, and how many are checked". */}
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-lg font-bold tabular-nums leading-none" style={{ color: "var(--text-1)" }}>
          {rep.total.toLocaleString()}
        </span>
        <span className="text-xs" style={{ color: "var(--text-3)" }}>{T.rsReports}</span>
        <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--text-3)" }}>
          <b style={{ color: SEG.judged }}>{rep.checked.toLocaleString()}</b> {T.rsChecked}
          {rep.partial > 0 && <> · {rep.partial.toLocaleString()} {T.rsPartial}</>}
          {rep.unchecked > 0 && <> · {rep.unchecked.toLocaleString()} {T.rsUnchecked}</>}
        </span>
      </div>

      {/* One stacked bar of the PROOF ROWS — the unit that gets spent. Each
          segment is labelled below; colour never carries the meaning alone. */}
      <div className="flex h-1.5 rounded-full overflow-hidden mt-2.5" style={{ background: "var(--border)" }}
        role="img" aria-label={`${r.judged} / ${r.total}`}>
        {segs.map(([k, n]) => (
          <div key={k} style={{ width: `${pct(n)}%`, background: SEG[k] }} />
        ))}
      </div>

      {/* Each number and its label are ONE flex item — bare text nodes become
          anonymous flex items, so the row gap would have pushed every count
          away from the word that gives it meaning. */}
      <div className="flex items-center gap-x-3 gap-y-1 mt-2 flex-wrap text-[11px] tabular-nums"
        style={{ color: "var(--text-4)" }}>
        <span>{r.total.toLocaleString()} {T.rsRows}</span>
        <Legend c={SEG.judged} n={r.judged} label={T.rsJudged} />
        <Legend c={SEG.pending} n={r.pending + r.skipped} label={T.rsQueued} />
        <Legend c={SEG.stuck} n={r.stuck} label={T.rsStuck} />
      </div>

      {(r.flagged > 0 || data.openFlags > 0) && (
        <p className="text-[11px] tabular-nums mt-1.5" style={{ color: "var(--text-4)" }}>
          {fmt(T.rsFlagged, r.flagged.toLocaleString())}
          {data.openFlags > 0 && ` · ${fmt(T.rsOpen, data.openFlags.toLocaleString())}`}
        </p>
      )}

      {/* Said out loud rather than silently truncating: a capped scan makes the
          REPORT count approximate while the row counts stay exact. */}
      {rep.approx && (
        <p className="text-[11px] mt-1.5" style={{ color: "#eab308" }}>{T.rsApprox}</p>
      )}
    </div>
  );
}

// A zero segment is not drawn at all — "0 errored" is noise that makes the
// clean case look like it has a problem to read.
const Legend = ({ c, n, label }) => (n > 0 ? (
  <span className="inline-flex items-center gap-1.5">
    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0"
      style={{ background: c }} aria-hidden="true" />
    {n.toLocaleString()} {label}
  </span>
) : null);

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
      {/* `lg` = 38px, the toolbar baseline. It sits in a row of filter and
          period controls now, and a 26px chip beside them reads as misaligned
          rather than as a smaller action. */}
      <Button size="lg" variant="secondary" tint icon={<RefreshCw size={14} />}
        onClick={() => setOpen(true)}>
        {T.open}
      </Button>

      {open && (
        /* Modal renders `icon` as a CHILD, so it takes an ELEMENT — unlike
           SectionHead / TableCard / EmptyState, which take the component and
           render <Icon/> themselves. Passing the bare component here handed
           React a forwardRef object to render as a child (error #31), which
           took the whole page down the moment this modal opened. */
        <Modal open onClose={() => setOpen(false)} title={T.title} subtitle={T.sub}
          icon={<Sparkles size={16} />}
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

          {/* What the chosen range actually holds. Sits directly under the
              picker because that is where the doubt is: the dry-run count below
              tells you the PRICE, this tells you what you are buying. */}
          <RangeSummary T={T} from={range.from} to={range.to} />

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
