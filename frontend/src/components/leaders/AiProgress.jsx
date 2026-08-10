import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, CheckCircle2, XCircle, Trash2 } from "lucide-react";
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

const TXT = {
  uz: {
    title: "AI tekshiruvi ketmoqda", of: "dan", checked: "tekshirildi",
    left: "qoldi", eta: "taxminan {t} qoldi", etaSoon: "tugay deb qoldi",
    stop: "To'xtatish", done: "Tekshiruv tugadi",
    doneN: "{n} ta xulosa yozildi", hide: "Yopish",
    cTitle: "Navbatdagi ishlar bekor qilinsinmi?",
    clear: "Navbatni tozalash", cleared: "Navbat tozalandi: {n} ta qator",
    cBody: "Navbatdagi {n} ta qator olib tashlanadi. Hali tekshirilmaganlari o'chiriladi — ular keyin qaytadan topiladi. Ilgari xulosasi bo'lganlari eski xulosasiga qaytadi. Hech narsa yo'qolmaydi.",
    cGo: "Ha, tozalansin", cCancel: "Yo'q, davom etsin",
    scope: { unchecked: "Tekshirilmaganlar", flagged: "Shubhalilar", clean: "Tozalar", all: "Hammasi" },
    h: "s", m: "daq", d: "kun",
    coverage: "AI tekshiruvi qamrovi", unchecked: "tekshirilmagan", skipped: "o'tkazib yuborilgan", stuck: "xatolik",
  },
  uz_cyrl: {
    title: "AI текшируви кетмоқда", of: "дан", checked: "текширилди",
    left: "қолди", eta: "тахминан {t} қолди", etaSoon: "тугай деб қолди",
    stop: "Тўхтатиш", done: "Текширув тугади",
    doneN: "{n} та хулоса ёзилди", hide: "Ёпиш",
    cTitle: "Навбатдаги ишлар бекор қилинсинми?",
    clear: "Навбатни тозалаш", cleared: "Навбат тозаланди: {n} та қатор",
    cBody: "Навбатдаги {n} та қатор олиб ташланади. Ҳали текширилмаганлари ўчирилади — улар кейин қайтадан топилади. Илгари хулосаси бўлганлари эски хулосасига қайтади. Ҳеч нарса йўқолмайди.",
    cGo: "Ҳа, тозалансин", cCancel: "Йўқ, давом этсин",
    scope: { unchecked: "Текширилмаганлар", flagged: "Шубҳалилар", clean: "Тозалар", all: "Ҳаммаси" },
    h: "с", m: "дақ", d: "кун",
    coverage: "AI текшируви қамрови", unchecked: "текширилмаган", skipped: "ўтказиб юборилган", stuck: "хатолик",
  },
  ru: {
    title: "Идёт проверка ИИ", of: "из", checked: "проверено",
    left: "осталось", eta: "осталось примерно {t}", etaSoon: "почти готово",
    stop: "Остановить", done: "Проверка завершена",
    doneN: "Записано выводов: {n}", hide: "Закрыть",
    cTitle: "Отменить работу в очереди?",
    clear: "Очистить очередь", cleared: "Очередь очищена: {n} строк",
    cBody: "Из очереди будет убрано строк: {n}. Ещё не проверенные удаляются — они найдутся заново. Те, у которых уже был вывод, вернутся к прежнему выводу. Ничего не теряется.",
    cGo: "Да, очистить", cCancel: "Нет, продолжить",
    scope: { unchecked: "Непроверенные", flagged: "Сомнительные", clean: "Чистые", all: "Все" },
    h: "ч", m: "мин", d: "дн.",
    coverage: "Охват проверки ИИ", unchecked: "не проверено", skipped: "пропущено", stuck: "с ошибкой",
  },
  en: {
    title: "AI review running", of: "of", checked: "checked",
    left: "left", eta: "about {t} left", etaSoon: "almost done",
    stop: "Stop", done: "Review finished",
    doneN: "{n} verdicts written", hide: "Dismiss",
    cTitle: "Cancel the queued work?",
    clear: "Clear queue", cleared: "Queue cleared: {n} rows",
    cBody: "{n} queued rows will be removed. Ones never checked are deleted — discovery finds them again. Ones that already had a verdict go back to it. Nothing is lost.",
    cGo: "Yes, clear", cCancel: "No, keep going",
    scope: { unchecked: "Unchecked", flagged: "Flagged", clean: "Clean", all: "All" },
    h: "h", m: "min", d: "d",
    coverage: "AI review coverage", unchecked: "unchecked", skipped: "skipped", stuck: "errored",
  },
};

const fmt = (s, v) => String(s).replace("{n}", v).replace("{t}", v);

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
      message={fmt(T.cBody, (p?.pending ?? 0).toLocaleString())}
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
            <b style={{ color: "var(--text-1)" }}>{cov.judged.toLocaleString()}</b>
            {" "}{T.of}{" "}{cov.known.toLocaleString()} {T.checked}
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
          {left > 0 && <><span>·</span><span>{left.toLocaleString()} {T.unchecked}</span></>}
          {cov.skipped > 0 && <><span>·</span><span>{cov.skipped.toLocaleString()} {T.skipped}</span></>}
          {/* Stuck rows are the one number worth colouring: they will never
              drain on their own, and the fix (Retry) lives in the re-check
              modal. Amber + a word, never colour alone. */}
          {cov.stuck > 0 && (
            <><span>·</span>
            <span style={{ color: "#eab308", fontWeight: 600 }}>
              {cov.stuck.toLocaleString()} {T.stuck}
            </span></>
          )}
        </div>
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
          {p.scope && (
            <span className="text-[11px] px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-inner)", color: "var(--text-3)", border: "1px solid var(--border)" }}>
              {T.scope[p.scope] || p.scope}
              {p.from || p.to ? ` · ${(p.from || "…").slice(5)}–${(p.to || "…").slice(5)}` : ""}
            </span>
          )}
          {/* Numbers first, percentage second: "1 129 of 1 174" answers "how
              much is left to pay for", which is the question quota makes you
              ask. The percentage alone never does. */}
          <span className="text-xs tabular-nums ml-auto" style={{ color: "var(--text-3)" }}>
            <b style={{ color: "var(--text-1)" }}>{p.done.toLocaleString()}</b>
            {" "}{T.of}{" "}{p.total.toLocaleString()} {T.checked}
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
          <span>{p.pending.toLocaleString()} {T.left}</span>
          {eta && <><span>·</span><span>{eta}</span></>}
        </div>
      </div>

      {confirmDialog}
    </>
  );
}
