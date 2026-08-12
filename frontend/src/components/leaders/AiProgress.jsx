import { useState, Fragment } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, CheckCircle2, XCircle, Trash2, Play } from "lucide-react";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import { useLang } from "../../context/LangContext";
import api from "../../utils/api";

/* ══ run progress ═════════════════════════════════════════════════════════════
 *
 * Queueing ten thousand verdicts from a button and then showing a toast is how
 * an operator ends up pressing that button three more times. A drain paces
 * itself over hours; without a bar the only observable difference between
 * "working" and "broken" is that the numbers eventually change.
 *
 * So: one strip, directly under the page tabs, on EVERY tab of /leaders — the
 * run is started from the register on Monitoring and watched from the AI tab,
 * and a progress bar you have to navigate to is a progress bar nobody sees.
 *
 * It polls only while a run is live, and it survives a reload because the run
 * is a server-side record rather than component state. When the queue empties
 * it flips to a short "finished" state instead of vanishing — a bar that
 * disappears at 100% leaves you unsure whether it completed or crashed.
 */

const BRAND = "#C8973F";
const GOOD = "#22c55e";

/* ── one sentence per language, never words glued in place ────────────────────
 *
 * The counters used to be assembled positionally — `{done} {of} {total}
 * {checked}` — which is the order English and Russian happen to use. Uzbek puts
 * the total FIRST and hangs the ablative off it ("597 тадан 2 таси
 * текширилди"), so the same three slots rendered "2 дан 597 текширилди": the
 * "дан" attached to the number it does not belong to, in the two languages most
 * of this factory actually reads. A word fragment can only be reordered by the
 * layout, and layout is not where grammar lives.
 *
 * So every counter is a WHOLE sentence keyed per language, with `{n}` (total)
 * and `{d}` (done) free to sit wherever that language needs them. `fill()`
 * renders it as nodes rather than a string, so the emphasis on `{d}` travels
 * with the number instead of staying pinned to the first slot.
 */
const TXT = {
  uz: {
    title: "AI tekshiruvi ketmoqda",
    count: "{n} tadan {d} tasi tekshirildi",
    nLeft: "{n} ta qoldi", eta: "taxminan {t} qoldi", etaSoon: "tugay deb qoldi",
    outside: "oraliqdan tashqarida {n}",
    stop: "To'xtatish", done: "Tekshiruv tugadi",
    doneN: "{n} ta xulosa yozildi", hide: "Yopish",
    cTitle: "Navbatdagi ishlar bekor qilinsinmi?",
    clear: "Navbatni tozalash", cleared: "Navbat tozalandi: {n} ta qator",
    cBody: "Navbatdagi {n} ta qator olib tashlanadi. Hali tekshirilmaganlari o'chiriladi — ular keyin qaytadan topiladi. Ilgari xulosasi bo'lganlari eski xulosasiga qaytadi. Hech narsa yo'qolmaydi.",
    cGo: "Ha, tozalansin", cCancel: "Yo'q, davom etsin",
    scope: { unchecked: "Tekshirilmaganlar", flagged: "Shubhalilar", clean: "Tozalar", all: "Hammasi" },
    h: "s", m: "daq", d: "kun", sec: "sek",
    coverage: "AI tekshiruvi qamrovi",
    nUnchecked: "{n} tasi tekshirilmagan", nSkipped: "{n} tasi o'tkazib yuborilgan",
    nStuck: "{n} tasida xatolik",
    dRun: "tekshirilmoqda", dWait: "navbatda kutmoqda", dBusy: "boshqa tekshiruv ketmoqda",
    dNext: "{t} dan keyin avtomatik", dNow: "Hozir boshlash",
    dQuota: "AI limiti tugadi", dStall: "{t} dan beri javob yo'q",
    dErr: "AI xatoligi", ago: "{t} oldin", errN: "{n} ta xato",
    dJoined: "Bu tekshiruv allaqachon ketmoqda — bosganingiz shunga qo'shildi. Bir qator uchun ikki marta to'lanmaydi.",
    dFor: "{t} dan beri ketmoqda", byWho: "boshlagan: {t}", byAuto: "o'zi boshladi (har 20 daqiqada)",
  },
  uz_cyrl: {
    title: "AI текшируви кетмоқда",
    count: "{n} тадан {d} таси текширилди",
    nLeft: "{n} та қолди", eta: "тахминан {t} қолди", etaSoon: "тугай деб қолди",
    outside: "оралиқдан ташқарида {n}",
    stop: "Тўхтатиш", done: "Текширув тугади",
    doneN: "{n} та хулоса ёзилди", hide: "Ёпиш",
    cTitle: "Навбатдаги ишлар бекор қилинсинми?",
    clear: "Навбатни тозалаш", cleared: "Навбат тозаланди: {n} та қатор",
    cBody: "Навбатдаги {n} та қатор олиб ташланади. Ҳали текширилмаганлари ўчирилади — улар кейин қайтадан топилади. Илгари хулосаси бўлганлари эски хулосасига қайтади. Ҳеч нарса йўқолмайди.",
    cGo: "Ҳа, тозалансин", cCancel: "Йўқ, давом этсин",
    scope: { unchecked: "Текширилмаганлар", flagged: "Шубҳалилар", clean: "Тозалар", all: "Ҳаммаси" },
    h: "с", m: "дақ", d: "кун", sec: "сек",
    coverage: "AI текшируви қамрови",
    nUnchecked: "{n} таси текширилмаган", nSkipped: "{n} таси ўтказиб юборилган",
    nStuck: "{n} тасида хатолик",
    dRun: "текширилмоқда", dWait: "навбатда кутмоқда", dBusy: "бошқа текширув кетмоқда",
    dNext: "{t} дан кейин автоматик", dNow: "Ҳозир бошлаш",
    dQuota: "AI лимити тугади", dStall: "{t} дан бери жавоб йўқ",
    dErr: "AI хатолиги", ago: "{t} олдин", errN: "{n} та хато",
    dJoined: "Бу текширув аллақачон кетмоқда — босганингиз шунга қўшилди. Бир қатор учун икки марта тўланмайди.",
    dFor: "{t} дан бери кетмоқда", byWho: "бошлаган: {t}", byAuto: "ўзи бошлади (ҳар 20 дақиқада)",
  },
  ru: {
    title: "Идёт проверка ИИ",
    count: "проверено {d} из {n}",
    nLeft: "осталось {n}", eta: "осталось примерно {t}", etaSoon: "почти готово",
    outside: "вне периода: {n}",
    stop: "Остановить", done: "Проверка завершена",
    doneN: "Записано выводов: {n}", hide: "Закрыть",
    cTitle: "Отменить работу в очереди?",
    clear: "Очистить очередь", cleared: "Очередь очищена: {n} строк",
    cBody: "Из очереди будет убрано строк: {n}. Ещё не проверенные удаляются — они найдутся заново. Те, у которых уже был вывод, вернутся к прежнему выводу. Ничего не теряется.",
    cGo: "Да, очистить", cCancel: "Нет, продолжить",
    scope: { unchecked: "Непроверенные", flagged: "Сомнительные", clean: "Чистые", all: "Все" },
    h: "ч", m: "мин", d: "дн.", sec: "сек",
    coverage: "Охват проверки ИИ",
    nUnchecked: "не проверено {n}", nSkipped: "пропущено {n}",
    nStuck: "с ошибкой: {n}",
    dRun: "идёт проверка", dWait: "ожидает в очереди", dBusy: "идёт другая проверка",
    dNext: "автоматически через {t}", dNow: "Запустить сейчас",
    dQuota: "Лимит ИИ исчерпан", dStall: "нет ответа уже {t}",
    dErr: "Ошибка ИИ", ago: "{t} назад", errN: "ошибок: {n}",
    dJoined: "Эта проверка уже идёт — ваш запуск присоединён к ней. За одну строку дважды не платится.",
    dFor: "идёт уже {t}", byWho: "запустил: {t}", byAuto: "запустилась сама (каждые 20 мин)",
  },
  en: {
    title: "AI review running",
    count: "{d} of {n} checked",
    nLeft: "{n} left", eta: "about {t} left", etaSoon: "almost done",
    outside: "{n} outside this range",
    stop: "Stop", done: "Review finished",
    doneN: "{n} verdicts written", hide: "Dismiss",
    cTitle: "Cancel the queued work?",
    clear: "Clear queue", cleared: "Queue cleared: {n} rows",
    cBody: "{n} queued rows will be removed. Ones never checked are deleted — discovery finds them again. Ones that already had a verdict go back to it. Nothing is lost.",
    cGo: "Yes, clear", cCancel: "No, keep going",
    scope: { unchecked: "Unchecked", flagged: "Flagged", clean: "Clean", all: "All" },
    h: "h", m: "min", d: "d", sec: "s",
    coverage: "AI review coverage",
    nUnchecked: "{n} unchecked", nSkipped: "{n} skipped",
    nStuck: "{n} errored",
    dRun: "reviewing", dWait: "queued, not started", dBusy: "another review is running",
    dNext: "auto-retry in {t}", dNow: "Start now",
    dQuota: "AI quota reached", dStall: "no response for {t}",
    dErr: "AI error", ago: "{t} ago", errN: "{n} failed",
    dJoined: "This review is already running — your start joined it. No row is ever paid for twice.",
    dFor: "running for {t}", byWho: "started by {t}", byAuto: "started itself (every 20 min)",
  },
};

const fmt = (s, v) => String(s).replace(/\{n\}/g, v).replace(/\{t\}/g, v);

/** The same substitution, but returning NODES — so a template whose emphasised
 *  number sits in the middle in one language and at the front in another keeps
 *  its `<b>` attached to the number rather than to a position. */
const fill = (s, vars) =>
  String(s).split(/(\{\w+\})/g).map((piece, i) => {
    const k = /^\{(\w+)\}$/.exec(piece)?.[1];
    return <Fragment key={i}>{k ? vars[k] : piece}</Fragment>;
  });

/** Remaining time from the rate actually observed, not a guess. Null until
 *  enough has happened to mean anything — an ETA off the first verdict swings
 *  by hours and teaches people to ignore the number. */
function etaText(p, T) {
  if (!p.startedAt || p.done < 3) return null;
  const elapsed = (Date.now() - new Date(p.startedAt).getTime()) / 1000;
  if (elapsed < 5) return null;
  const left = Math.max(0, p.total - p.done);
  if (!left) return null;
  const secs = Math.round(left / (p.done / elapsed));
  if (secs < 60) return T.etaSoon;
  if (secs < 3600) return fmt(T.eta, `${Math.round(secs / 60)} ${T.m}`);
  // Days past two: the drain is batch-capped and timer-paced, so a real
  // backfill genuinely lands here — and "83.2 h" is a number nobody converts.
  if (secs < 172800) return fmt(T.eta, `${(secs / 3600).toFixed(1)} ${T.h}`);
  return fmt(T.eta, `${Math.round(secs / 86400)} ${T.d}`);
}

const dur = (s, T) =>
  s < 60 ? `${s} ${T.sec}`
    : s < 3600 ? `${Math.round(s / 60)} ${T.m}`
      : `${(s / 3600).toFixed(1)} ${T.h}`;

/* ── what the drain is actually doing ─────────────────────────────────────────
 *
 * The bar could only ever report the queue's SIZE, and a queue that does not
 * shrink looks the same in every failing state: the drain grinding through a
 * forty-photo batch, a kick swallowed because another one still held the lock,
 * a 429 on the very first row, a retired model failing all forty. "0 of 49" a
 * minute in was consistent with all of them, so the honest reading of a
 * motionless bar was "no information at all" — and the operator has no shell to
 * go and settle it with. That is the whole reason this line exists.
 *
 * Priority is by what the operator would DO about it: a systemic error and a
 * spent quota outrank a stall, a stall outranks a live pulse, and anything that
 * is not currently draining gets the button that starts one. The seconds-since
 * counter is the load-bearing part — a number that ticks is the only proof of
 * life a bar at 0% can offer.
 */
function DrainLine({ p, T, kick }) {
  const d = p?.drain;
  if (!d) return null;
  const secs = d.secondsSince;
  const live = d.state === "running" && !d.stalled;

  let tone = "var(--text-4)";
  let text = T.dWait;
  // The provider's own sentence goes on its own line rather than into the
  // label: it runs to a paragraph, and a paragraph in the status line pushes
  // the numbers and the button off the strip on a phone. Label scans, detail
  // explains — the same split `FormField` uses for consequential copy.
  let detail = null;
  if (d.error) { tone = "#ef4444"; text = T.dErr; detail = d.error; }
  // Google's words, not our guess: ours said "daily" for every 429, which reads
  // as "wait until tomorrow" — and a spend cap does not clear tomorrow.
  else if (d.quota) { tone = "#eab308"; text = T.dQuota; detail = d.quotaMsg; }
  else if (d.stalled) { tone = "#eab308"; text = fmt(T.dStall, dur(secs ?? 0, T)); }
  else if (live) {
    tone = BRAND;
    text = T.dRun + (secs != null && secs > 4 ? ` · ${fmt(T.ago, dur(secs, T))}` : "…");
    // The press that lost the race, reported where the press was made. Saying
    // nothing is what made "Start now" read as broken and as evidence of some
    // unreachable second process: it did the only useful thing available — the
    // run it would have started was already going, and the advisory lock is
    // precisely what stops the same row being paid for twice.
    if (d.refusedAgoS != null && d.refusedAgoS < 180) detail = T.dJoined;
  } else if (d.state === "busy" || d.state === "locked") {
    // Amber, not the grey of "queued": nothing pressed right now will start
    // anything, and a state you cannot act on must not look like a resting one.
    tone = "#eab308";
    text = T.dBusy + (secs != null && secs > 4 ? ` · ${fmt(T.ago, dur(secs, T))}` : "");
  }

  return (
    <div className="flex items-center gap-2 mt-1.5 text-[11px] flex-wrap">
      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0${live ? " animate-pulse" : ""}`}
        style={{ background: tone }} />
      <span style={{ color: tone, fontWeight: tone === "var(--text-4)" ? 400 : 600 }}>{text}</span>
      {/* WHO is spending, and for how long it has been spending. Both facts
          were already in the payload and neither was ever rendered — which is
          exactly how a drain nobody started reads as a process nobody can
          reach. It is this queue, worked by the 20-minute timer unless a
          person put their name on a run. `at` only ever proves the thing is
          alive; `runningForS` is the span quota is charged across, so it is
          the number the person paying for it asks for. */}
      {live && (
        <><span style={{ color: "var(--text-4)" }}>·</span>
        <span style={{ color: "var(--text-3)" }}>
          {p.by ? fmt(T.byWho, p.by) : T.byAuto}
        </span></>
      )}
      {live && d.runningForS > 60 && (
        <><span style={{ color: "var(--text-4)" }}>·</span>
        <span className="tabular-nums" style={{ color: "var(--text-3)" }}>
          {fmt(T.dFor, dur(d.runningForS, T))}
        </span></>
      )}
      {/* Failed rows, in the one place they explain something: a batch that
          errors on every row leaves `done` at 0, and without this the operator
          reads "nothing happened" when in fact everything did and failed. */}
      {p.errors > 0 && (
        <><span style={{ color: "var(--text-4)" }}>·</span>
        <span className="tabular-nums" style={{ color: "#eab308" }}>
          {fmt(T.errN, p.errors.toLocaleString())}
        </span></>
      )}
      {/* Nothing is draining. Say when the timer will try by itself — the wait
          is up to twenty minutes and an unexplained one reads as broken — and
          offer the press that skips it. */}
      {!live && d.nextInS != null && (
        <><span style={{ color: "var(--text-4)" }}>·</span>
        <span style={{ color: "var(--text-4)" }}>{fmt(T.dNext, dur(d.nextInS, T))}</span></>
      )}
      {!live && (
        <Button size="sm" variant="secondary" tint className="ml-auto"
          icon={<Play size={12} />} loading={kick.isPending} onClick={() => kick.mutate()}>
          {T.dNow}
        </Button>
      )}
      {detail && (
        <span className="w-full break-words leading-snug" style={{ color: "var(--text-3)" }}>
          {detail}
        </span>
      )}
    </div>
  );
}

/** `showIdle` — also render the standing "how much is checked" bar when no run
 *  is going. True on the AI tab, where that is the subject; false elsewhere,
 *  where a permanent statistic would just be chrome. A LIVE run renders on
 *  every tab regardless: somebody started it and it costs quota. */
export default function AiProgress({ showIdle = false }) {
  const { lang } = useLang();
  const T = TXT[lang] || TXT.ru;
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const { data: p } = useQuery({
    queryKey: ["leader-ai-progress"],
    queryFn: () => api.get("/api/leader-ai/progress").then((r) => r.data),
    // Poll HARD while a run is live and not at all otherwise. A dashboard that
    // polls all day for an event that happens twice a month is a cost with no
    // reader; one that polls every 30s during a run is a bar that looks frozen.
    refetchInterval: (q) => (q.state.data?.active ? 4000 : false),
    refetchOnWindowFocus: true,
  });

  // Start a drain now rather than at the next timer firing. The only cure for
  // a swallowed kick used to be a restart, which nobody here can perform.
  const kick = useMutation({
    mutationFn: () => api.post("/api/leader-ai/progress/kick").then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leader-ai-progress"] }),
  });

  const stop = useMutation({
    mutationFn: () => api.post("/api/leader-ai/progress/cancel").then((r) => r.data),
    onSuccess: () => {
      setConfirm(false);
      qc.invalidateQueries({ queryKey: ["leader-ai-progress"] });
      qc.invalidateQueries({ queryKey: ["leader-ai-overview"] });
    },
  });

  // The run finished while this page was open: say so, once, then get out of
  // the way. `justFinished` only comes back on the poll that observes the
  // queue empty, so it cannot nag on every later load.
  const finished = p?.justFinished && !dismissed;

  // Hoisted out of both branches: the idle bar and the live bar can each open
  // it, and an early `return` in one branch would otherwise leave that branch's
  // Stop button opening a dialog that never renders.
  const confirmDialog = confirm ? (
    <ConfirmDialog
      open
      tone="danger"
      title={T.cTitle}
      /* The GLOBAL count, never the run's. Stop clears the whole queue by
         design — a dialog quoting the 217 rows left of today while the button
         removes 20,000 is the one number in this component that must not be
         scoped. */
      message={fmt(T.cBody, (p?.pendingAll ?? p?.pending ?? 0).toLocaleString())}
      confirmLabel={T.cGo}
      cancelLabel={T.cCancel}
      loading={stop.isPending}
      error={stop.error ? (stop.error?.response?.data?.detail || String(stop.error)) : null}
      onCancel={() => setConfirm(false)}
      onConfirm={() => stop.mutate()}
    />
  ) : null;

  // IDLE: no run, but there is still a true answer to "how much of my data has
  // been checked". Only where it was asked for — the AI tab — because a
  // standing statistic on the Monitoring tab is noise, whereas a LIVE run
  // belongs on every tab (it is a page-wide event somebody started).
  if (p && !p.active && !finished) {
    const cov = p.coverage;
    // Nothing has ever been queued: the feature is off or brand new, and an
    // empty "0 of 0" bar teaches nobody anything.
    if (!showIdle || !cov || !cov.known) return null;
    const pctIdle = Math.round((cov.judged / cov.known) * 100);
    const left = cov.known - cov.judged;
    return (
      <>
      <div className="mb-3 rounded-xl px-3 py-2.5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5 flex-wrap mb-2">
          <Sparkles size={15} className="flex-shrink-0" style={{ color: "var(--text-4)" }} />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-2)" }}>
            {T.coverage}
          </span>
          <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--text-3)" }}>
            {fill(T.count, {
              d: <b style={{ color: "var(--text-1)" }}>{cov.judged.toLocaleString()}</b>,
              n: cov.known.toLocaleString(),
            })}
          </span>
          {/* Queued work exists with no run behind it — the timer drain and a
              sheet Refresh both queue rows nobody started from this page. "Stop
              it" has to reach that too, or the only clearable queue is the one
              you happened to launch yourself. */}
          {(p.pending > 0 || cov.skipped > 0) && (
            <Button size="sm" variant="secondary" tint icon={<Trash2 size={13} />}
              loading={stop.isPending} onClick={() => setConfirm(true)}>
              {T.clear}
            </Button>
          )}
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}
          role="progressbar" aria-valuemin={0} aria-valuemax={cov.known}
          aria-valuenow={cov.judged} aria-label={T.coverage}>
          {/* Muted, not brand gold: nothing is happening right now, and a live
              bar and a standing statistic must not look identical. */}
          <div className="h-full rounded-full" style={{ width: `${pctIdle}%`, background: "var(--text-4)" }} />
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-[11px] tabular-nums flex-wrap"
          style={{ color: "var(--text-4)" }}>
          <span>{pctIdle}%</span>
          {left > 0 && <><span>·</span><span>{fmt(T.nUnchecked, left.toLocaleString())}</span></>}
          {cov.skipped > 0 && <><span>·</span><span>{fmt(T.nSkipped, cov.skipped.toLocaleString())}</span></>}
          {/* Stuck rows are the one number worth colouring: they will never
              drain on their own, and the fix (Retry) lives in the re-check
              modal. Amber + a word, never colour alone. */}
          {cov.stuck > 0 && (
            <><span>·</span>
            <span style={{ color: "#eab308", fontWeight: 600 }}>
              {fmt(T.nStuck, cov.stuck.toLocaleString())}
            </span></>
          )}
        </div>
        {/* Queued rows with no run behind them are timer-paced, so "why has
            this sat at 40 unchecked all day" is the same question without a bar
            attached. Only when something is actually waiting — on a fully
            drained queue this line would be chrome reporting nothing. */}
        {p.pending > 0 && <DrainLine p={p} T={T} kick={kick} />}
      </div>
      {confirmDialog}
      </>
    );
  }

  if (!p || (!p.active && !finished)) return null;

  if (finished) {
    return (
      <div className="mb-3 rounded-xl px-3 py-2 flex items-center gap-2.5 flex-wrap"
        style={{ background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.30)" }}
        role="status">
        <CheckCircle2 size={15} color={GOOD} className="flex-shrink-0" />
        <span className="text-[13px] font-semibold" style={{ color: GOOD }}>{T.done}</span>
        <span className="text-xs tabular-nums" style={{ color: "var(--text-4)" }}>
          {fmt(T.doneN, p.done ?? 0)}
        </span>
        <Button size="sm" variant="ghost" className="ml-auto"
          onClick={() => setDismissed(true)}>{T.hide}</Button>
      </div>
    );
  }

  const pct = Math.min(100, Math.round((p.done / Math.max(1, p.total)) * 100));
  const eta = etaText(p, T);

  return (
    <>
      <div className="mb-3 rounded-xl px-3 py-2.5"
        style={{ background: "var(--bg-card)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2.5 flex-wrap mb-2">
          <Sparkles size={15} color={BRAND} className="flex-shrink-0" />
          <span className="text-[13px] font-semibold" style={{ color: "var(--text-1)" }}>
            {T.title}
          </span>
          {/* Numbers first, percentage second: "1 129 of 1 174" answers "how
              much is left to pay for", which is the question quota makes you
              ask. The percentage alone never does. */}
          <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--text-3)" }}>
            {fill(T.count, {
              d: <b style={{ color: "var(--text-1)" }}>{p.done.toLocaleString()}</b>,
              n: p.total.toLocaleString(),
            })}
          </span>
          <Button size="sm" variant="secondary" tint icon={<XCircle size={13} />}
            loading={stop.isPending} onClick={() => setConfirm(true)}>
            {T.stop}
          </Button>
        </div>

        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-inner)" }}
          role="progressbar" aria-valuemin={0} aria-valuemax={p.total}
          aria-valuenow={p.done} aria-label={T.title}>
          <div className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%`, background: BRAND }} />
        </div>

        <div className="flex items-center gap-2 mt-1.5 text-[11px] tabular-nums flex-wrap"
          style={{ color: "var(--text-4)" }}>
          <span>{pct}%</span>
          <span>·</span>
          <span>{fmt(T.nLeft, p.pending.toLocaleString())}</span>
          {eta && <><span>·</span><span>{eta}</span></>}
          {/* Queued rows on dates this run does not cover. The bar is scoped to
              the run now, which is the only way its percentage and its ETA can
              agree with its remainder — but silently dropping the rest of the
              backlog would read as "picking one day emptied the queue", and it
              did not. The standing backfill picks these up when the run ends. */}
          {p.pendingAll > p.pending && (
            <><span>·</span>
            <span>{fmt(T.outside, (p.pendingAll - p.pending).toLocaleString())}</span></>
          )}
          {/* Which slice the run covers — detail, not headline. As a chip in
              the title row it was the line break that made this strip three
              rows tall on a phone, ahead of the queue it announces. */}
          {p.scope && (
            <><span>·</span>
            <span>
              {T.scope[p.scope] || p.scope}
              {p.from || p.to ? ` · ${(p.from || "…").slice(5)}–${(p.to || "…").slice(5)}` : ""}
              {/* Whose rows, when the run was narrowed to a shift, a brigadir
                  or a leader. Server-resolved names: without them a run over
                  one unit is indistinguishable from one over the whole plant,
                  and the only visible difference is a smaller total. */}
              {p.narrow?.length ? ` · ${p.narrow.join(" · ")}` : ""}
            </span></>
          )}
        </div>

        <DrainLine p={p} T={T} kick={kick} />
      </div>

      {confirmDialog}
    </>
  );
}
